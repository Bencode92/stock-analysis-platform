"""Decision Log — journal de décision daté du pipeline.

v6.15 (2026-06-04) — Priorité #4 selon Claude externe :
  "À chaque génération, logge non seulement les POIDS mais POURQUOI (quel
   fit_score, quel DR, quel MaxDD estimé). Dans 2 ans, face à ton portefeuille,
   tu sauras ce que tu pensais en juin 2026. C'est ce qui te permettra de juger
   ta PROPRE compétence — pas le marché, toi."

Format : un fichier par run dans data/decision_log/log_<TIMESTAMP>.json
Contenu :
  - Métadonnées du run (version, date, params)
  - Pour chaque profil :
      * Composition finale (ticker → weight + rationale)
      * Diagnostics : pool size, candidats screened, top N, fit moyen
      * Discipline appliquée (caps, budgets)
  - Cohérence cross-profile (overlap entre profils)
"""
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

ROOT = Path(__file__).parent.parent
LOG_DIR = ROOT / "data" / "decision_log"


def _summarize_profile(profile: str, positions: List[Dict],
                       pool_diag: Optional[Dict] = None) -> Dict:
    """Résume les décisions prises pour un profil."""
    if not positions:
        return {"profile": profile, "n_positions": 0}

    core = [p for p in positions if p.get("role") == "core"]
    sat = [p for p in positions if p.get("role") == "satellite"]

    core_total = sum(p.get("weight", 0) for p in core)
    sat_total = sum(p.get("weight", 0) for p in sat)

    # Détail satellite : fit_score, pourquoi sélectionné
    satellite_detail = []
    for p in sat:
        satellite_detail.append({
            "ticker": p.get("ticker"),
            "name": (p.get("name") or "")[:40],
            "weight_pct": round(p.get("weight", 0) * 100, 2),
            "country": p.get("country"),
            "industry": p.get("industry", ""),
            "buffett_score": p.get("buffett_score"),
            "fit_score": p.get("fit_score"),
            "source": p.get("_source", "top_natifs"),
            "rationale": "top fit_score parmi les candidats après hard filters",
        })

    # Détail cœur : juste ticker + poids + source (filler vs v4)
    core_detail = []
    for p in core:
        core_detail.append({
            "ticker": p.get("ticker"),
            "name": (p.get("name") or "")[:40],
            "weight_pct": round(p.get("weight", 0) * 100, 2),
            "source": p.get("source", "core_filler_canonique"),
            "rationale": "cœur UCITS broad canonique, hardcoded pour stabilité β cible",
        })

    summary = {
        "profile": profile,
        "n_positions": len(positions),
        "n_core": len(core),
        "n_satellite": len(sat),
        "weight_core_pct": round(core_total * 100, 2),
        "weight_satellite_pct": round(sat_total * 100, 2),
        "total_weight_pct": round((core_total + sat_total) * 100, 2),
        "core_positions": core_detail,
        "satellite_positions": satellite_detail,
    }

    if pool_diag:
        summary["pool_diagnostics"] = pool_diag

    return summary


def log_decision(portfolios_data: Dict,
                 pipeline_version: str = "v6.15",
                 extra_meta: Optional[Dict] = None) -> str:
    """Écrit un fichier journal pour un run de pipeline.

    Args:
        portfolios_data: dict {profile_name → profile_dict} produit par la discipline
        pipeline_version: tag de version (ex: "v6.15")
        extra_meta: méta supplémentaire à inclure

    Returns:
        Chemin du fichier journal écrit.
    """
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = LOG_DIR / f"log_{ts}.json"

    profile_summaries = {}
    all_tickers_by_profile = {}

    for profile in ("Stable", "Modéré", "Agressif", "Agressif-Thematique"):
        prof = portfolios_data.get(profile, {})
        meta = prof.get("_tickers_meta", {})
        if not meta:
            continue
        # Reconstruct positions list from _tickers_meta
        positions = []
        for tk, m in meta.items():
            positions.append({
                "ticker": tk,
                "name": m.get("name"),
                "weight": m.get("weight", 0),
                "role": m.get("role"),
                "industry": m.get("industry"),
                "country": m.get("country"),
                "buffett_score": m.get("buffett_score"),
                "fit_score": m.get("fit_score"),
                "_source": m.get("_source"),
            })
        profile_summaries[profile] = _summarize_profile(profile, positions)
        all_tickers_by_profile[profile] = set(meta.keys())

    # Overlap entre profils (utile si user cumule)
    overlaps = {}
    profiles_list = list(all_tickers_by_profile.keys())
    for i, p1 in enumerate(profiles_list):
        for p2 in profiles_list[i+1:]:
            common = all_tickers_by_profile[p1] & all_tickers_by_profile[p2]
            if common:
                overlaps[f"{p1}∩{p2}"] = sorted(common)

    payload = {
        "version": "decision_log_v1",
        "pipeline_version": pipeline_version,
        "timestamp_iso": datetime.now().isoformat(),
        "run_id": ts,
        "decision_log": {
            "rationale_global": (
                "Pipeline RADAR-neutralisé (walk-forward strict -0.11 OOS validé). "
                "Cœur UCITS broad statique pour stabilité β cible. "
                "Satellite dynamique par fit_score qualité (max 2/industry pour Principal, "
                "max 2/pays + 2/industry pour Agressif-Thematique). "
                "Décision Core-Satellite : timing factoriel rejeté, indexation cœur "
                "+ pari assumé sur qualité satellite."
            ),
            "key_constraints": {
                "MaxDD_tolere_user": "-30% à -40% selon definition (pire annee vs MaxDD intra)",
                "beta_cible_par_profil": {"Stable": 0.22, "Modéré": 0.61, "Agressif": 0.80},
                "satellite_budget_pct": {"Stable": 10, "Modéré": 20, "Agressif": 25, "Agressif-Thematique": 20},
                "cap_per_name_pct": 5,
                "cap_per_core_etf_pct": 50,
            },
            # v6.19 (2026-06-05) — Règles d'or à appliquer à chaque rebalance
            # Hiérarchie en 4 tiers (filtres + construction) ET règle de surveillance
            # Si jamais ce log est consulté dans 2-3 ans, ces règles doivent rester appliquées.
            "regles_de_selection_4_tiers": {
                "tier_1_qualite_absolue": "Buffett ≥ 60-70 selon profil (Stable 70 / Modéré 65 / Agressif 60)",
                "tier_2_qualite_relative": "Quality ≥ 60",
                "tier_3_risk_alignment": "Vol_3y dans la band du profil",
                "tier_4_diversification": "Max 1 secteur GICS L1 pour Stable, max 2 pour autres",
                "doctrine": "Buffett+Quality sont des FILTRES, pas une thèse. La diversification (tier 4) décide quoi va ensemble.",
            },
            "regle_or_n3_rebalance_checklist": {
                "principe": (
                    "À l'entrée : ANTI-MOMENTUM (achète qualité même en baisse, en solde). "
                    "À la sortie : VÉRIFICATION DU FONDAMENTAL (pas vente automatique sur la perf)."
                ),
                "checklist_rebalance_annuel": [
                    "1. Pour chaque ligne du portefeuille, regarder la perf 1 an actuelle.",
                    "2. Si perf < -30% sur 1 an : DÉCLENCHE une vérification du Buffett/Quality.",
                    "3. Comparer Buffett_actuel vs Buffett à l'entrée (consulter data/score_history/scores_<entrée>.json).",
                    "4. Si Buffett a chuté de >15 points OU si Quality < 50 désormais : le fondamental a CASSÉ → SORTIR.",
                    "5. Si Buffett/Quality tiennent (chute mineure ou stable) : l'action est en SOLDE → GARDER (achat additionnel si DCA).",
                    "6. La perf seule n'est JAMAIS un signal de vente — elle déclenche une vérification du fondamental.",
                ],
                "exception": "Si une action a fait > +200% sur 1 an, vérifier qu'elle ne dépasse pas le cap satellite 5%. Sinon, écrêter (vente partielle pour ramener à 5%) sans vendre tout.",
            },
        },
        "profiles": profile_summaries,
        "cross_profile_overlaps": overlaps,
        "extra_meta": extra_meta or {},
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    logger.info(f"[decision_log] Run {ts} loggé → {output_path}")
    return str(output_path)


__all__ = ["log_decision", "LOG_DIR"]
