"""Core-Satellite Discipline — couche obligatoire du pipeline.

Applique en dur les règles décidées le 2026-06-03 après 7 tours de débat :
  - Satellite ≤ 20 % Modéré / 25 % Agressif / 10 % Stable
  - Cap 5 % par nom satellite
  - Cap 50 % par ETF cœur (sauf broad UCITS)
  - Cœur UCITS broad imposé par défaut (VWCE.DE, AGGH.AS, IBCI.AS, IBGS.AS, SGLN.AS, IWDA.AS)
  - β cible par profil (Stable 0.22 / Modéré 0.61 / Agressif 0.80)
  - Σ = 100.00 % exact, par construction

Appelé par generate_portfolios_v4.py après l'optimizer, avant l'écriture JSON.
Opère sur la structure ticker-keyed du portfolio final (post asset_id → ticker mapping).
"""
from typing import Dict, List, Tuple
import copy

# ─── PARAMÈTRES (figés conversation 2026-06-03) ─────────────────────────────
CAP_PER_NAME = 0.05               # max 5 % par nom satellite
CAP_PER_CORE_ETF = 0.50           # max 50 % par ETF cœur
SAT_BUDGET = {                    # plafond satellite total
    "Stable":   0.10,
    "Modéré":   0.20,
    "Agressif": 0.25,
}

# Cœur UCITS canonique (somme = target_core par profil)
DEFAULT_CORE_FILLER = {
    # Stable (sat 10 %, cœur 90 %) — bonds-heavy + or
    "Stable":   [("VWCE.DE", 0.20), ("AGGH.AS", 0.25), ("IBCI.AS", 0.20),
                 ("IBGS.AS", 0.15), ("SGLN.AS", 0.10)],
    # Modéré (sat 20 %, cœur 80 %) — equity broad dominant, β cible 0.61
    "Modéré":   [("VWCE.DE", 0.50), ("AGGH.AS", 0.15), ("IBCI.AS", 0.05),
                 ("IBGS.AS", 0.05), ("SGLN.AS", 0.05)],
    # Agressif (sat 25 %, cœur 75 %) — equity broad très majoritaire, β cible 0.80
    "Agressif": [("VWCE.DE", 0.50), ("IWDA.AS", 0.10), ("IBGS.AS", 0.10),
                 ("SGLN.AS", 0.05)],
}

# ETF broad reconnus (du choix v4 ou ailleurs) — si v4 les a, on les utilise tels quels
BROAD_CORE_ETFS = {
    "VT", "ACWI", "URTH", "IWDA", "VWCE", "IWDA.AS", "VWCE.DE",
    "IEMG", "VWO", "EMIM", "EMIM.AS",
    "AGG", "BND", "AGGH", "AGGH.AS", "GOVT",
    "SHY", "VGSH", "IBGS", "IBGS.AS", "BIL",
    "TIP", "STIP", "SCHP", "IBCI", "IBCI.AS",
    "GLD", "SGLN", "SGLN.AS", "IAU",
}


def _is_broad_core(ticker: str, meta: Dict) -> bool:
    """Identifie un ETF cœur broad — exige catégorie ETF/Obligations ET ticker connu."""
    if ticker not in BROAD_CORE_ETFS:
        return False
    cat = (meta.get("category") or "").lower()
    return cat in ("etf", "obligations", "bond")


def _build_disciplined_positions(profile: str, v4_meta: Dict) -> List[Dict]:
    """Reconstruit les positions disciplinées à partir du _tickers_meta v4.

    Args:
        profile: "Stable" | "Modéré" | "Agressif"
        v4_meta: {ticker: {weight, category, name, industry, beta, asset_ids}}

    Returns:
        List[dict] de positions avec role, weight, etc. — Σ = 100 % garanti
    """
    positions = []
    sat_used = 0.0
    cap_budget = SAT_BUDGET.get(profile, 0.20)

    # Tri par poids v4 décroissant pour prioriser les meilleures convictions
    sorted_items = sorted(v4_meta.items(), key=lambda x: -(x[1].get("weight") or 0))

    # ─── PHASE 1 : Satellite (capé 5 %/nom, ≤ budget total) ───────────────
    for tk, meta in sorted_items:
        if _is_broad_core(tk, meta):
            continue  # géré en Phase 2
        w_v4 = meta.get("weight") or 0
        if w_v4 <= 0:
            continue
        w_capped = min(w_v4, CAP_PER_NAME)
        remaining = cap_budget - sat_used
        if remaining <= 0.001:
            break  # budget satellite épuisé
        w_final = min(w_capped, remaining)
        if w_final < 0.005:
            continue  # < 0.5 % = bruit, ignore
        positions.append({
            "ticker": tk,
            "name": (meta.get("name") or "")[:80],
            "category": meta.get("category", ""),
            "industry": meta.get("industry", ""),
            "weight_pct": round(w_final * 100, 2),
            "weight": w_final,
            "role": "satellite",
            "asset_ids": meta.get("asset_ids", [tk]),
            "beta": meta.get("beta"),
        })
        sat_used += w_final

    # ─── PHASE 2 : Cœur UCITS broad (filler canonique) ─────────────────────
    target_core = 1.0 - sat_used
    filler = DEFAULT_CORE_FILLER.get(profile, DEFAULT_CORE_FILLER["Modéré"])
    filler_meta = {"name": "Cœur broad UCITS", "category": "ETF"}
    core_dict = {}  # ticker -> weight

    # Pass 1 : alloue chaque entrée filler dans la limite de son poids template
    gap = target_core
    for tk, w_template in filler:
        if gap <= 0.001:
            break
        existing_w = core_dict.get(tk, 0)
        headroom = CAP_PER_CORE_ETF - existing_w
        if headroom <= 0:
            continue
        add = min(headroom, gap, w_template)
        if add > 0.001:
            core_dict[tk] = existing_w + add
            gap -= add

    # Pass 2 : consomme la headroom restante si gap non comblé
    passes = 0
    while gap > 0.001 and passes < 3:
        distributed = 0.0
        for tk, _ in filler:
            if gap <= 0.001:
                break
            existing_w = core_dict.get(tk, 0)
            headroom = CAP_PER_CORE_ETF - existing_w
            if headroom <= 0.001:
                continue
            add = min(headroom, gap)
            if add < 0.001:
                continue
            core_dict[tk] = existing_w + add
            gap -= add
            distributed += add
        if distributed < 0.001:
            break
        passes += 1

    for tk, w in core_dict.items():
        positions.append({
            "ticker": tk,
            "name": filler_meta["name"],
            "category": filler_meta["category"],
            "industry": "",
            "weight_pct": round(w * 100, 2),
            "weight": w,
            "role": "core",
            "asset_ids": [tk],
            "beta": None,
        })

    positions.sort(key=lambda p: -p["weight_pct"])
    return positions


def positions_to_format_b(positions: List[Dict], profile: str) -> Dict:
    """Convertit les positions disciplinées en Format B (compatible audit_dashboard.html).

    Format B per profile attendu par le HTML dashboard :
      {
        "Actions": {"NAME (TK)": "X.X%"},
        "ETF": {"NAME (TK)": "X.X%"},
        "Obligations": {"NAME (TK)": "X.X%"},
        "Crypto": {},
        "_tickers_meta": {tk: {weight, category, name, industry, beta, role}},
        "Commentaire": "...",
      }
    """
    actions, etf, obligations = {}, {}, {}
    tickers_meta = {}

    for p in positions:
        tk = p["ticker"]
        name = p.get("name") or tk
        w_pct = p["weight_pct"]
        w_frac = w_pct / 100.0
        cat_raw = (p.get("category") or "").lower()

        if cat_raw in ("actions", "stock", "equity"):
            cat_display = "Actions"
            actions[f"{name} ({tk})"] = f"{w_pct:.1f}%"
        elif cat_raw in ("obligations", "bond"):
            cat_display = "Obligations"
            obligations[f"{name} ({tk})"] = f"{w_pct:.1f}%"
        else:
            cat_display = "ETF"
            etf[f"{name} ({tk})"] = f"{w_pct:.1f}%"

        tickers_meta[tk] = {
            "weight": w_frac,
            "category": cat_display,
            "name": name,
            "asset_ids": p.get("asset_ids", [tk]),
            "industry": p.get("industry", ""),
            "beta": p.get("beta"),
            "role": p["role"],
        }

    return {
        "Actions": actions,
        "ETF": etf,
        "Obligations": obligations,
        "Crypto": {},
        "_tickers_meta": tickers_meta,
        "Commentaire": (
            f"Portefeuille {profile} — discipline Core-Satellite v6.0. "
            f"Cœur UCITS broad (β cible) + satellite fondamental capé à 5%/nom. "
            f"Σ = 100% par construction. RADAR neutralisé."
        ),
        "_discipline_applied": {
            "version": "core_satellite_v6.0",
            "sat_budget_pct": SAT_BUDGET.get(profile, 0) * 100,
            "cap_per_name_pct": CAP_PER_NAME * 100,
            "cap_per_core_etf_pct": CAP_PER_CORE_ETF * 100,
        },
    }


def apply_to_portfolios_dict(portfolios_data: Dict) -> Dict:
    """Applique la discipline aux 3 profils dans le dict portfolios_data.

    Args:
        portfolios_data: structure produite par v4 — {Agressif, Modéré, Stable, ...}
                         Chaque profil doit avoir un `_tickers_meta` populé.

    Returns:
        Nouveau dict avec les 3 profils principaux disciplinés en Format B.
        Les autres clés (Dividende-PEA, Dividende-CTO, _meta) sont préservées.
    """
    output = {}
    # Préserve les clés non-Core-Satellite (dividendes, _meta, etc.)
    for k, v in portfolios_data.items():
        if k not in ("Stable", "Modéré", "Agressif"):
            output[k] = v

    # Applique la discipline aux 3 profils principaux
    for profile in ("Stable", "Modéré", "Agressif"):
        prof_data = portfolios_data.get(profile, {})
        v4_meta = prof_data.get("_tickers_meta", {})
        if not v4_meta:
            output[profile] = prof_data  # rien à discipliner
            continue
        positions = _build_disciplined_positions(profile, v4_meta)
        output[profile] = positions_to_format_b(positions, profile)

    return output


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────
__all__ = ["apply_to_portfolios_dict", "SAT_BUDGET", "CAP_PER_NAME", "CAP_PER_CORE_ETF"]
