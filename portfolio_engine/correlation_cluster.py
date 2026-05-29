"""
Détection de clusters d'assets fortement corrélés + contraintes SLSQP cap-corrélation.

Phase Convexité-1 — recommandation expert externe (2026-05-29).

Principe : utiliser les `returns_series` déjà chargés (par price_loader) pour
détecter via single-linkage les groupes d'assets dont |corr| ≥ threshold.
Émettre des contraintes SLSQP « ineq » qui plafonnent Σ w_cluster ≤ cap.

Avantage vs look-through holdings : zéro data extra (les returns existent déjà),
capture l'overlap ÉCONOMIQUE (SCHD ≈ DIVB en pratique) indépendamment du label
d'indice. Complémentaire aux mécanismes existants :
  - `MAX_PER_EXPOSURE` (preset_etf, label-based dedup) — pré-optim
  - `MAX_ETF_PER_EXPOSURE_GROUP` (preset_etf) — exposure family static
  - `Corporate Group Cap` (optimizer) — actions seulement
  - `Sector Cap` (optimizer) — GICS sector
  - Correlation Map (covariance) — structurée, calibrée mars 2025

Le cap-corrélation est le seul mécanisme qui regarde la corrélation EMPIRIQUE
au moment de l'optim.

Référence : Ledoit & Wolf shrinkage + single-linkage clustering classique.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Iterable, List, Optional, Set

import numpy as np

logger = logging.getLogger("portfolio_engine.correlation_cluster")


def detect_redundant_clusters(
    returns_dict: dict,
    corr_threshold: float = 0.92,
    min_obs: int = 60,
) -> List[Set[str]]:
    """Single-linkage clustering sur la matrice de |corrélation| empirique.

    Args:
        returns_dict: mapping {asset_id: np.ndarray ou list de log-returns}.
            Les séries seront alignées sur la longueur commune minimale ;
            chaque série doit avoir au moins `min_obs` observations valides.
        corr_threshold: seuil de fusion. Deux assets avec |corr| ≥ threshold
            sont fusionnés dans le même cluster (single-linkage).
        min_obs: nombre minimum d'observations communes requis pour considérer
            une paire. Les assets avec returns trop courts sont ignorés.

    Returns:
        list de sets (chaque set = un cluster non-singleton). Les assets seuls
        ne sont pas retournés (pas de contrainte à émettre).

    Notes:
        - Single-linkage = transitive fermeture : si A↔B (0.95) et B↔C (0.93),
          alors {A, B, C} forme un cluster même si A↔C n'atteint pas le seuil.
        - L'utilisation de |corr| capture aussi les paires fortement
          ANTI-corrélées (cas rare en pratique pour des classes equity, mais
          robuste si présent — ex : SH inverse du SPY).
    """
    # Filtrer les assets avec assez d'observations
    ids = [
        aid for aid, ret in returns_dict.items()
        if ret is not None and len(ret) >= min_obs
    ]
    if len(ids) < 2:
        return []

    # Tronquer toutes les séries à la longueur commune minimale (alignement
    # naïf "from the right" : on suppose que les returns sont déjà time-aligned
    # par le price_loader). Pour des séries de longueurs très différentes,
    # cela utilise le sous-ensemble récent.
    series = [np.asarray(returns_dict[aid], dtype=float) for aid in ids]
    common_len = min(len(s) for s in series)
    if common_len < min_obs:
        return []
    series = [s[-common_len:] for s in series]

    # Matrice de retours (T × N)
    R = np.column_stack(series)

    # Nettoyer NaN/Inf — remplacer par 0 (asset sans bouge ce jour-là)
    R = np.nan_to_num(R, nan=0.0, posinf=0.0, neginf=0.0)

    # Matrice de corrélation (N × N). On utilise np.corrcoef qui gère bien
    # les vecteurs nuls (retourne NaN qu'on convertit en 0).
    with np.errstate(divide="ignore", invalid="ignore"):
        corr = np.corrcoef(R, rowvar=False)
    corr = np.nan_to_num(corr, nan=0.0)
    abs_corr = np.abs(corr)

    # Single-linkage union-find
    parent = list(range(len(ids)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x: int, y: int) -> None:
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[rx] = ry

    n = len(ids)
    for i in range(n):
        for j in range(i + 1, n):
            if abs_corr[i, j] >= corr_threshold:
                union(i, j)

    # Collecte les clusters non-singletons
    clusters_map: dict = {}
    for i, aid in enumerate(ids):
        root = find(i)
        clusters_map.setdefault(root, set()).add(aid)

    clusters = [c for c in clusters_map.values() if len(c) > 1]
    return clusters


def cluster_weight_constraints(
    asset_ids_in_optim: List[str],
    clusters: List[Set[str]],
    cap: float = 0.12,
) -> List[dict]:
    """Convertit les clusters détectés en contraintes SLSQP « ineq ».

    Args:
        asset_ids_in_optim: liste des `candidate.id` dans l'ordre où SLSQP
            les voit (ordre du vecteur w). Sert à mapper id → index.
        clusters: sortie de `detect_redundant_clusters`.
        cap: plafond de poids combiné par cluster (decimal, ex 0.12 = 12 %).

    Returns:
        list de dicts {"type": "ineq", "fun": callable(w) → cap - Σ w_cluster}.
        Une contrainte par cluster. Vide si aucun cluster ou si les membres
        ne sont pas dans `asset_ids_in_optim`.
    """
    idx_by_id = {aid: i for i, aid in enumerate(asset_ids_in_optim)}
    constraints = []
    for cluster in clusters:
        members_idx = [idx_by_id[aid] for aid in cluster if aid in idx_by_id]
        if len(members_idx) < 2:
            continue  # cluster réduit à un seul membre post-filtrage : skip

        def make_constraint(idx: List[int], max_val: float) -> Callable:
            def constraint(w):
                return max_val - float(np.sum(w[idx]))
            return constraint

        constraints.append({
            "type": "ineq",
            "fun": make_constraint(members_idx, cap),
        })
    return constraints


def build_returns_dict_from_candidates(
    candidates: Iterable[Any],
    equity_filter: Optional[Callable[[Any], bool]] = None,
) -> dict:
    """Helper : extrait un mapping {asset.id: returns_series} depuis une
    liste de candidates de l'optimizer.

    Args:
        candidates: itérable d'objets Asset avec attrs `id`, `returns_series`,
            `category`.
        equity_filter: callable optionnel qui retourne True si l'asset doit
            être inclus dans la détection. Par défaut : exclut Obligations
            et Crypto (le cap-corrélation est conçu pour equity-like only).

    Returns:
        dict {asset.id: np.ndarray des returns} pour les assets retenus.
    """
    if equity_filter is None:
        def equity_filter(asset):
            cat = getattr(asset, "category", None)
            return cat not in ("Obligations", "Crypto")

    out: dict = {}
    for a in candidates:
        if not equity_filter(a):
            continue
        rs = getattr(a, "returns_series", None)
        if rs is None:
            continue
        out[a.id] = rs
    return out


# ============================================================================
# Logging helper (factorisation pour _build_constraints + _fallback)
# ============================================================================

def log_clusters_detected(
    clusters: List[Set[str]],
    profile_name: str,
    candidate_names: Optional[dict] = None,
) -> None:
    """Affiche un log INFO pour chaque cluster détecté.

    Args:
        clusters: sortie de `detect_redundant_clusters`.
        profile_name: pour le préfixe du log.
        candidate_names: optionnel {asset_id: display_name} pour l'affichage.
    """
    if not clusters:
        return
    for i, cluster in enumerate(clusters, 1):
        if candidate_names:
            display = [f"{aid}={candidate_names.get(aid, '')}" for aid in cluster]
        else:
            display = sorted(cluster)
        logger.info(
            f"[CLUSTER {profile_name}] #{i} ({len(cluster)} assets) : "
            + ", ".join(sorted(display))
        )
