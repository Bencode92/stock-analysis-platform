"""Core-Satellite Discipline — couche obligatoire du pipeline.

Applique en dur les règles décidées le 2026-06-03 après 7 tours de débat :
  - Satellite ≤ 20 % Modéré / 25 % Agressif / 10 % Stable
  - Cap 5 % par nom satellite
  - Cap 50 % par ETF cœur (sauf broad UCITS)
  - Cœur UCITS broad imposé par défaut (VWCE.DE, AGGH.AS, IBCI.AS, IBGS.AS, SGLN.AS, IWDA.AS)
  - β cible par profil (Stable 0.22 / Modéré 0.61 / Agressif 0.80)
  - Σ = 100.00 % exact, par construction

v6.2 (2026-06-03) — BYPASS SLSQP POUR LE SATELLITE
  Le satellite est désormais peuplé directement par les top natifs (fit_score
  via profile_assignment.py), équipondéré, capé. Le SLSQP ne touche plus au
  satellite — il ne décide que du cœur ETF.
  Raison : le dashboard audit avait identifié le goulet (cf. audit_dashboard.html
  l. 289) : "SLSQP final ne garde que 5 actions par profil et écarte les
  meilleurs candidats au profit de combinaisons covariance-favorables". Cette
  Phase Sélection-6 prévue n'avait jamais été codée.

Appelé par generate_portfolios_v4.py après l'optimizer, avant l'écriture JSON.
"""
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple
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
    # IBGS plafonné à 5% par profil (cap max_single_bond=5% pour Agressif)
    "Agressif": [("VWCE.DE", 0.50), ("IWDA.AS", 0.15), ("IBGS.AS", 0.05),
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

# Bond ETF tickers — pour catégoriser dans "Obligations" (pas "ETF")
# Permet à la validation business rules de compter correctement les bonds.
BOND_ETF_TICKERS = {
    # Agrégés
    "AGG", "BND", "AGGH", "AGGH.AS", "BNDX", "IAGG",
    # Treasuries / Govt courts
    "SHY", "VGSH", "SCHO", "BSV", "BIL", "SGOV", "SHV", "TBIL", "USFR", "FLOT",
    "IBGS", "IBGS.AS", "GOVT", "VTIP",
    # Intermediate / Long Treasuries
    "IEF", "VGIT", "SCHR", "SCHZ", "TLT", "VGLT", "EDV", "ZROZ",
    # TIPS (inflation-linked)
    "TIP", "STIP", "SCHP", "IBCI", "IBCI.AS",
    # Corporate / Credit
    "LQD", "VCIT", "VCSH", "HYG", "JNK", "USIG", "MBB",
    # Autres
    "MUB", "EMB", "EMLC", "CLTL", "VRIG", "ICLO", "PAAA", "TDTT",
    "BINC", "CARY", "CGCP", "CGMS", "DRSK", "PGF",
}


def _is_bond_etf(ticker: str) -> bool:
    """Identifie un ETF bond (à classer dans 'Obligations' pour la validation)."""
    return (ticker or "").upper() in BOND_ETF_TICKERS


# ─── v6.2 : SATELLITE NATIF PAR FIT_SCORE ───────────────────────────────────
# Bypass SLSQP : le satellite stocks est peuplé directement par les top natifs
# (les actions dont _profile_native == profile, triées par _fit_<profile>).
# Voir profile_assignment.py pour fit_score_stable/modere/agressif.

_FIT_KEY_BY_PROFILE = {
    "Stable":   "_fit_stable",
    "Modéré":   "_fit_modere",
    "Agressif": "_fit_agressif",
}


def _load_all_stocks() -> List[Dict]:
    """Charge l'univers complet d'actions (US + EU + Asia)."""
    root = Path(__file__).parent.parent / "data"
    all_stocks = []
    for fname in ("stocks_us.json", "stocks_europe.json", "stocks_asia.json"):
        path = root / fname
        if not path.exists():
            continue
        try:
            data = json.load(open(path))
            stocks = data.get("stocks", []) if isinstance(data, dict) else data
            all_stocks.extend(stocks)
        except Exception:
            pass
    return all_stocks


def _get_top_natives_for_profile(profile: str, n_target: int) -> List[Dict]:
    """Retourne les top-N actions de qualité pour le satellite d'un profil.

    v6.3 (2026-06-04) — POOL ÉLARGI POUR AGRESSIF
    Pour Stable et Modéré : pool = _profile_native == profile, trié par _fit_<profile>.
    Pour Agressif : pool élargi à Modéré-natives + Agressif-natives, vol ≥ 20%,
        trié par _fit_modere (quality measure). Raison : fit_score_agressif a une
        vol band 30-65% qui EXCLUT mécaniquement les vraies qualités (NOVN vol 19,
        REGN 15, ADP 21). L'agressivité du profil vient du β cœur (0.80 via VWCE
        50% + IWDA 15%), pas de la vol des actions individuelles. Le satellite
        doit refléter la qualité, pas la haute vol.
    """
    try:
        from portfolio_engine.profile_assignment import annotate_universe_with_fits
    except ImportError:
        try:
            from .profile_assignment import annotate_universe_with_fits
        except ImportError:
            return []

    all_stocks = _load_all_stocks()
    if not all_stocks:
        return []
    annotate_universe_with_fits(all_stocks)

    if profile == "Agressif":
        # Pool élargi : qualité quel que soit le profil natif, vol >= 20
        candidates = [
            s for s in all_stocks
            if s.get("_profile_native") in ("Agressif", "Modéré")
            and (s.get("volatility_3y") or 0) >= 20.0
            and (s.get("buffett_score") or 0) >= 70  # qualité minimum
        ]
        # Tri par fit_modere (qualité réelle), pas fit_agressif (momentum-weighted)
        candidates.sort(key=lambda s: -(s.get("_fit_modere") or 0))
    else:
        fit_key = _FIT_KEY_BY_PROFILE.get(profile, "_fit_modere")
        candidates = [s for s in all_stocks if s.get("_profile_native") == profile]
        candidates.sort(key=lambda s: -(s.get(fit_key) or 0))

    # Dédup par industry (max 2 par industrie pour diversification sectorielle)
    by_industry: Dict[str, int] = {}
    deduped = []
    for s in candidates:
        ind = (s.get("industry") or "_").lower()
        if by_industry.get(ind, 0) >= 2:
            continue
        by_industry[ind] = by_industry.get(ind, 0) + 1
        deduped.append(s)
        if len(deduped) >= n_target:
            break
    return deduped


def _is_broad_core(ticker: str, meta: Dict) -> bool:
    """Identifie un ETF cœur broad — exige catégorie ETF/Obligations ET ticker connu."""
    if ticker not in BROAD_CORE_ETFS:
        return False
    cat = (meta.get("category") or "").lower()
    return cat in ("etf", "obligations", "bond")


def _build_disciplined_positions(profile: str, v4_meta: Dict) -> List[Dict]:
    """Reconstruit les positions disciplinées à partir du _tickers_meta v4.

    v6.2 : Le satellite stocks est désormais peuplé par les TOP NATIFS du score
    fit (profile_assignment.py), équipondéré et capé. Le SLSQP ne touche plus
    au satellite — il ne décide que du cœur ETF.

    Args:
        profile: "Stable" | "Modéré" | "Agressif"
        v4_meta: {ticker: {weight, category, name, industry, beta, asset_ids}}

    Returns:
        List[dict] de positions avec role, weight, etc. — Σ = 100 % garanti
    """
    positions = []
    sat_used = 0.0
    cap_budget = SAT_BUDGET.get(profile, 0.20)

    # ─── PHASE 1 v6.2 : Satellite = TOP NATIFS par fit_score, équipondéré ──
    # n_max = budget / cap (Stable 10/5=2, Modéré 20/5=4, Agressif 25/5=5)
    n_max_satellite = int(round(cap_budget / CAP_PER_NAME))
    top_natives = _get_top_natives_for_profile(profile, n_target=n_max_satellite)

    if top_natives:
        # Construit le satellite à partir des natifs (bypass SLSQP)
        weight_per_name = cap_budget / len(top_natives) if top_natives else 0
        weight_per_name = min(weight_per_name, CAP_PER_NAME)
        fit_key = _FIT_KEY_BY_PROFILE.get(profile, "_fit_modere")

        for s in top_natives:
            tk = s.get("ticker") or s.get("symbol") or s.get("resolved_symbol")
            if not tk:
                continue
            name = (s.get("name") or s.get("name_api") or tk)[:80]
            positions.append({
                "ticker": tk,
                "name": name,
                "category": "Actions",
                "industry": s.get("industry", ""),
                "weight_pct": round(weight_per_name * 100, 2),
                "weight": weight_per_name,
                "role": "satellite",
                "asset_ids": [tk],
                "beta": s.get("beta"),
                "buffett_score": s.get("buffett_score"),
                "fit_score": s.get(fit_key),
                "_source": "top_natifs_v6.2",
            })
            sat_used += weight_per_name

    else:
        # FALLBACK v6.0 si profile_assignment indisponible : ancienne logique
        # (prend les positions v4 par poids décroissant)
        sorted_items = sorted(v4_meta.items(), key=lambda x: -(x[1].get("weight") or 0))
        for tk, meta in sorted_items:
            if _is_broad_core(tk, meta):
                continue
            w_v4 = meta.get("weight") or 0
            if w_v4 <= 0:
                continue
            w_capped = min(w_v4, CAP_PER_NAME)
            remaining = cap_budget - sat_used
            if remaining <= 0.001:
                break
            w_final = min(w_capped, remaining)
            if w_final < 0.005:
                continue
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
                "_source": "v4_fallback",
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
    """Convertit les positions disciplinées en Format B (compatible schemas/portfolio_output.json).

    Schema requis :
      - Commentaire (str 50-5000 chars)
      - Actions, ETF, Obligations, Crypto (AllocationMap : "NAME (TK)" → "X.X%")
      - _tickers (TickerWeights : ticker → decimal 0-1)
      - _tickers_meta (optionnel mais consommé par HTML)
    additionalProperties: false — seules les clés du schema sont autorisées.
    """
    actions, etf, obligations = {}, {}, {}
    tickers_meta = {}
    tickers = {}  # _tickers : ticker → decimal weight (requis par schema)

    for p in positions:
        tk = p["ticker"]
        name = p.get("name") or tk
        w_pct = p["weight_pct"]
        w_frac = w_pct / 100.0
        cat_raw = (p.get("category") or "").lower()

        # v6.0.2 : un ETF bond doit aller dans "Obligations", pas "ETF"
        # — sinon la validation business rules compte 0% de bonds.
        if cat_raw in ("actions", "stock", "equity"):
            cat_display = "Actions"
            actions[f"{name} ({tk})"] = f"{w_pct:.1f}%"
        elif cat_raw in ("obligations", "bond") or _is_bond_etf(tk):
            cat_display = "Obligations"
            obligations[f"{name} ({tk})"] = f"{w_pct:.1f}%"
        else:
            cat_display = "ETF"
            etf[f"{name} ({tk})"] = f"{w_pct:.1f}%"

        tickers[tk] = round(w_frac, 4)

        tickers_meta[tk] = {
            "weight": w_frac,
            "category": cat_display,
            "name": name,
            "asset_ids": p.get("asset_ids", [tk]),
            "industry": p.get("industry", ""),
            "beta": p.get("beta"),
            "role": p["role"],
        }

    # Commentaire min 50 chars (sinon schema fail)
    commentaire = (
        f"Portefeuille {profile} — discipline Core-Satellite v6.0. "
        f"Cœur ETF UCITS broad calibré pour β cible "
        f"(Stable 0.22 / Modéré 0.61 / Agressif 0.80) + satellite fondamental "
        f"capé à 5%/nom, budget {int(SAT_BUDGET.get(profile, 0)*100)}%. "
        f"Σ = 100% par construction. RADAR sectoriel neutralisé "
        f"(walk-forward strict a montré Δ Sharpe -0.11 OOS sur timing factoriel)."
    )

    return {
        "Actions": actions,
        "ETF": etf,
        "Obligations": obligations,
        "Crypto": {},
        "_tickers": tickers,
        "_tickers_meta": tickers_meta,
        "Commentaire": commentaire,
    }


# Champs du profil qu'on remplace (les autres champs v4 sont préservés tels quels)
_DISCIPLINE_OVERRIDE_KEYS = {
    "Actions", "ETF", "Obligations", "Crypto",
    "_tickers", "_tickers_meta", "Commentaire",
}


def apply_to_portfolios_dict(portfolios_data: Dict) -> Dict:
    """Applique la discipline aux 3 profils dans le dict portfolios_data.

    Args:
        portfolios_data: structure produite par v4 — {Agressif, Modéré, Stable, ...}
                         Chaque profil doit avoir un `_tickers_meta` populé.

    Returns:
        Nouveau dict avec les 3 profils principaux disciplinés. Les champs
        v4 non-discipline (_optimization, _exposures, risk_analysis, _alternates,
        _constraint_report, _limitations, etc.) sont PRÉSERVÉS tels quels.
        Les autres clés top-level (Dividende-PEA, Dividende-CTO, _meta) sont
        préservées telles quelles.
    """
    output = {}
    # Préserve les clés top-level non-Core-Satellite (dividendes, _meta, etc.)
    for k, v in portfolios_data.items():
        if k not in ("Stable", "Modéré", "Agressif"):
            output[k] = v

    # Pour chaque profil principal : on MERGE le résultat discipline sur le profil v4
    # → les champs Actions/ETF/Obligations/Crypto/_tickers/_tickers_meta/Commentaire
    #   sont remplacés par la version disciplinée
    # → tous les autres champs v4 (_optimization, _exposures, risk_analysis, etc.)
    #   sont préservés tels quels
    for profile in ("Stable", "Modéré", "Agressif"):
        prof_v4 = portfolios_data.get(profile, {})
        v4_meta = prof_v4.get("_tickers_meta", {})
        if not v4_meta:
            output[profile] = prof_v4  # rien à discipliner
            continue
        positions = _build_disciplined_positions(profile, v4_meta)
        disciplined = positions_to_format_b(positions, profile)
        # Merge : profil v4 + override des clés discipline
        merged = dict(prof_v4)  # copie shallow du profil v4
        merged.update(disciplined)  # écrase les clés discipline
        output[profile] = merged

    return output


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────
__all__ = ["apply_to_portfolios_dict", "SAT_BUDGET", "CAP_PER_NAME", "CAP_PER_CORE_ETF"]
