"""
[DEPRECATED v8.x — voir generate_portfolios_v4.py + PROFILE_POLICY['Dividende-PEA'/'-CTO']]

Ce module standalone reste comme prototype/référence. La logique a été migrée dans
le pipeline principal (4e profil avec sous-enveloppes PEA et CTO). Sorties officielles :
data/portfolios.json (clés 'Dividende-PEA' et 'Dividende-CTO'). Tu peux supprimer
ce fichier sans risque ; il n'est plus appelé par le pipeline quotidien.

═══════════════════════════════════════════════════════════════════════════════
dividend_portfolio.py — Portefeuilles rendement perso (PEA + CTO complément)

Produit DEUX portefeuilles complémentaires (architecture personne physique) :
  • PEA  : actions EU/EEE éligibles (UK exclu depuis Brexit post-2021)
           → univers strict, 16 titres, 100% EU/EEE
  • CTO  : actions US (et autres non-éligibles PEA : UK, Suisse en option)
           → 10 titres, complète la diversif géo non couverte par le PEA

Logique commune :
  1. Filtres anti value-trap (yield mini, payout, qualité, croissance, FCF, mcap)
  2. Score composite yield × qualité × stabilité × croissance
  3. Sélection sectorielle balancée
  4. Poids low-turnover : equal-weight + tilt léger, bornes 3%-8%
  5. Optimisation calendrier dividendes (swaps pour lisser)
  6. Export JSON par mode

Appelable en standalone :
    python3 -m portfolio_engine.dividend_portfolio
"""

from __future__ import annotations

import json
import logging
import os
import statistics
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("dividend-portfolio")


# ══════════════════════════════════════════════════════════════
# ÉLIGIBILITÉ PEA (perso, > 5 ans)
# ══════════════════════════════════════════════════════════════
# Sociétés ayant leur siège dans l'UE ou l'EEE (Norvège, Islande, Liechtenstein).
# UK exclu depuis le Brexit (post-2021). Suisse jamais éligible.

PEA_ELIGIBLE_COUNTRIES = {
    "France", "Allemagne", "Belgique", "Italie", "Espagne", "Portugal",
    "Pays-Bas", "Luxembourg", "Autriche", "Suède", "Finlande", "Danemark",
    "Irlande", "Grèce", "Pologne", "République Tchèque", "Slovaquie",
    "Slovénie", "Hongrie", "Roumanie", "Bulgarie", "Estonie", "Lettonie",
    "Lituanie", "Croatie", "Chypre", "Malte",
    # EEE
    "Norvège", "Islande", "Liechtenstein",
}

CTO_ELIGIBLE_COUNTRIES = {
    "Etats-Unis", "Royaume-Uni", "Suisse",
    # + tout ce qui n'est pas dans PEA mais qu'on veut exposer
    "Canada", "Australie", "Japon",
}


# ══════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════

BASE_CONFIG = {
    # Univers
    "data_dir": "data",
    "sources": ["stocks_europe.json", "stocks_us.json"],

    # Hard filters (anti value-trap) — communs PEA + CTO
    "min_yield": 2.5,           # yield mini en %
    "max_yield": 9.0,           # cap pour exclure les "yields suspects"
    "max_payout": 85.0,         # payout ratio TTM max en %
    "min_quality": 50,          # quality_score (0-100)
    "min_div_growth_3y": -2.0,  # tolère une légère baisse mais pas un effondrement (%)
    "min_roe": 8.0,             # ROE mini en %
    "min_fcf_yield": 0.5,       # FCF yield mini en %
    "min_market_cap": 2e9,      # 2B$ minimum
    "min_history_payments": 4,  # au moins 4 paiements historiques (consistance)

    # Poids low-turnover
    "min_position_weight": 0.03,
    "max_position_weight": 0.08,
    "score_tilt_strength": 0.30,
    "max_sector_weight": 0.30,

    # Lissage calendrier
    "calendar_horizon_months": 12,
    "calendar_swaps_max": 8,
    "calendar_min_gain": 0.05,
}

# Configs spécifiques par mode (PEA / CTO)
MODE_CONFIGS = {
    "pea": {
        "label": "PEA (EU/EEE, perso > 5 ans)",
        "output_path": "data/dividend_portfolio_pea.json",
        "eligible_countries": PEA_ELIGIBLE_COUNTRIES,
        "target_holdings": 16,
        "max_per_sector": 3,
        # Pas de quota région — déjà filtré à l'EU/EEE
        "region_targets": {"EU": 1.0},
        "min_yield": 2.5,  # univers EU plus modeste sur le yield
        "notes": ("Logeable dans un PEA personnel de plus de 5 ans. "
                  "0% IR sur div+PV intra-PEA, 17.2% PS à la sortie. "
                  "Plafond versements 150 000€. Harvesting tactique possible "
                  "(la fiscalité ne pénalise plus la rotation)."),
    },
    "cto": {
        "label": "CTO (US/UK/CH, complément perso)",
        "output_path": "data/dividend_portfolio_cto.json",
        "eligible_countries": CTO_ELIGIBLE_COUNTRIES,
        "target_holdings": 10,
        "max_per_sector": 2,        # univers plus large mais on garde la diversif serrée
        "region_targets": {"US": 1.0},
        "min_yield": 3.0,           # univers US plus généreux, on peut être plus strict
        "notes": ("Compte-titres ordinaire en personne physique. "
                  "Dividendes : PFU 30% (12.8% IR + 17.2% PS) ou barème + abattement 40% IR. "
                  "Plus-values : PFU 30%. Buy-and-hold privilégié (le harvesting "
                  "est moins rentable qu'en PEA)."),
    },
}


# ══════════════════════════════════════════════════════════════
# UTILS
# ══════════════════════════════════════════════════════════════

def _f(v) -> Optional[float]:
    """Cast safe vers float."""
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _load_universe(data_dir: str, sources: List[str]) -> List[Dict]:
    """Charge et fusionne les sources stocks_*.json."""
    universe = []
    for src in sources:
        path = Path(data_dir) / src
        if not path.exists():
            logger.warning(f"⚠️  Source absente : {path}")
            continue
        with open(path) as f:
            data = json.load(f)
        # Accepte list ou dict avec clé 'stocks'/'data'/etc.
        items = data if isinstance(data, list) else None
        if items is None and isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, list) and v and isinstance(v[0], dict):
                    items = v
                    break
        items = items or []
        # Tag région si absent
        for s in items:
            if not s.get("region"):
                s["region"] = "EU" if "europe" in src.lower() else "US" if "_us" in src.lower() else "?"
        universe.extend(items)
        logger.info(f"📥 {src} : {len(items)} titres")
    return universe


# ══════════════════════════════════════════════════════════════
# FILTRES
# ══════════════════════════════════════════════════════════════

@dataclass
class FilterReport:
    total: int = 0
    rejected: Dict[str, int] = field(default_factory=dict)
    kept: int = 0

    def reject(self, reason: str):
        self.rejected[reason] = self.rejected.get(reason, 0) + 1


def filter_universe(universe: List[Dict], cfg: Dict) -> Tuple[List[Dict], FilterReport]:
    """Applique les hard filters anti value-trap + filtre pays (PEA / CTO)."""
    report = FilterReport(total=len(universe))
    kept = []
    eligible_countries = cfg.get("eligible_countries")  # None = pas de filtre pays

    for s in universe:
        if eligible_countries is not None:
            country = (s.get("country") or "").strip()
            if country not in eligible_countries:
                report.reject(f"country_not_eligible:{country or '?'}")
                continue

        y = _f(s.get("dividend_yield_regular")) or _f(s.get("dividend_yield"))
        if y is None or y < cfg["min_yield"]:
            report.reject("yield_too_low"); continue
        if y > cfg["max_yield"]:
            report.reject("yield_suspect"); continue

        payout = _f(s.get("payout_ratio_ttm"))
        if payout is not None and payout * 100 > cfg["max_payout"]:
            # Note : payout_ratio_ttm est en fraction (0.8 = 80%), on multiplie ×100
            # Si la valeur est déjà en %, le check passera tout de même quasi-équivalent
            # On garde un seuil cohérent : 0.85 fraction ≈ 85%
            if payout > 1.5:  # heuristique : sûrement déjà en %
                if payout > cfg["max_payout"]:
                    report.reject("payout_too_high"); continue
            else:
                report.reject("payout_too_high"); continue

        q = _f(s.get("quality_score"))
        if q is None or q < cfg["min_quality"]:
            report.reject("quality_too_low"); continue

        dg = _f(s.get("dividend_growth_3y"))
        if dg is not None and dg < cfg["min_div_growth_3y"]:
            report.reject("div_growth_negative"); continue

        roe = _f(s.get("roe"))
        if roe is None or roe < cfg["min_roe"]:
            report.reject("roe_too_low"); continue

        fcf = _f(s.get("fcf_yield"))
        if fcf is None or fcf < cfg["min_fcf_yield"]:
            report.reject("fcf_yield_too_low"); continue

        mcap = _f(s.get("market_cap"))
        if mcap is None or mcap < cfg["min_market_cap"]:
            report.reject("market_cap_too_small"); continue

        hist = s.get("dividends_history") or []
        if len(hist) < cfg["min_history_payments"]:
            report.reject("history_too_short"); continue

        kept.append(s)

    report.kept = len(kept)
    return kept, report


# ══════════════════════════════════════════════════════════════
# SCORING
# ══════════════════════════════════════════════════════════════

def _payout_safety(payout_ttm: Optional[float]) -> float:
    """Score 0-1 : plus le payout est bas, plus la marge de manoeuvre est grande."""
    if payout_ttm is None:
        return 0.5
    p = payout_ttm if payout_ttm > 1.5 else payout_ttm * 100  # normalise en %
    if p >= 100:
        return 0.0
    return max(0.0, 1.0 - (p / 100.0))


def _growth_factor(dg_3y: Optional[float]) -> float:
    """Sigmoid douce : 0 si div baisse, ~1 si croissance forte."""
    if dg_3y is None:
        return 0.5
    # 0% growth → 0.5, 10% → ~0.73, 20% → ~0.88
    import math
    return 1.0 / (1.0 + math.exp(-dg_3y / 8.0))


def _yield_score(y: float, max_y: float) -> float:
    """Bonifie le yield mais cap : éviter d'attirer les yields suspects."""
    if y is None:
        return 0.0
    # Concave : sqrt-like pour éviter de surpayer les yields très hauts
    capped = min(y, max_y)
    return (capped / max_y) ** 0.7


def compute_score(s: Dict, cfg: Dict) -> float:
    y = _f(s.get("dividend_yield_regular")) or _f(s.get("dividend_yield")) or 0
    quality = (_f(s.get("quality_score")) or 0) / 100.0
    payout = _payout_safety(_f(s.get("payout_ratio_ttm")))
    growth = _growth_factor(_f(s.get("dividend_growth_3y")))
    coverage = min(1.0, (_f(s.get("dividend_coverage")) or 1.0) / 200.0)

    y_score = _yield_score(y, cfg["max_yield"])

    # Composite : yield × qualité-sécurité
    quality_block = 0.35 * quality + 0.30 * payout + 0.20 * growth + 0.15 * coverage
    return y_score * (0.4 + 0.6 * quality_block)


# ══════════════════════════════════════════════════════════════
# SÉLECTION ÉQUILIBRÉE
# ══════════════════════════════════════════════════════════════

def _normalize_sector(s: Dict) -> str:
    return (s.get("sector") or s.get("sector_api") or "Autre").strip()


def _normalize_region(s: Dict) -> str:
    r = (s.get("region") or "").strip().upper()
    if r in ("EUROPE", "EU"):
        return "EU"
    if r in ("US", "USA", "ETATS-UNIS"):
        return "US"
    country = (s.get("country") or "").lower()
    if "etats-unis" in country or "united states" in country:
        return "US"
    return "EU"  # fallback


def select_balanced(scored: List[Dict], cfg: Dict) -> List[Dict]:
    """Sélectionne N titres avec contraintes région et secteur.

    Mode mono-région (region_targets = {region: 1.0}) : pas de quota région,
    juste les caps secteur.
    """
    target_n = cfg["target_holdings"]
    region_targets = cfg["region_targets"]
    max_per_sector = cfg["max_per_sector"]
    mono_region = len(region_targets) == 1

    # Tri par score décroissant
    scored = sorted(scored, key=lambda x: x["_score"], reverse=True)

    if not mono_region:
        quotas = {r: int(round(target_n * w)) for r, w in region_targets.items()}
        diff = target_n - sum(quotas.values())
        if diff != 0:
            biggest = max(quotas, key=quotas.get)
            quotas[biggest] += diff
    else:
        quotas = {}

    selected: List[Dict] = []
    sector_count: Dict[str, int] = defaultdict(int)
    region_count: Dict[str, int] = defaultdict(int)

    # Pass 1 : respecte quotas région (si pertinent) + cap secteur
    for s in scored:
        if len(selected) >= target_n:
            break
        region = _normalize_region(s)
        sector = _normalize_sector(s)
        if not mono_region and region_count[region] >= quotas.get(region, 0):
            continue
        if sector_count[sector] >= max_per_sector:
            continue
        selected.append(s)
        region_count[region] += 1
        sector_count[sector] += 1

    # Pass 2 : relâche le cap secteur si pas atteint
    if len(selected) < target_n:
        for s in scored:
            if len(selected) >= target_n:
                break
            if s in selected:
                continue
            region = _normalize_region(s)
            if not mono_region and region_count[region] >= quotas.get(region, 0):
                continue
            selected.append(s)
            region_count[region] += 1
            sector_count[_normalize_sector(s)] += 1

    # Pass 3 : remplit sans contrainte si univers trop court
    if len(selected) < target_n:
        for s in scored:
            if len(selected) >= target_n:
                break
            if s in selected:
                continue
            selected.append(s)

    return selected


# ══════════════════════════════════════════════════════════════
# POIDS LOW-TURNOVER
# ══════════════════════════════════════════════════════════════

def compute_weights(selected: List[Dict], cfg: Dict) -> Dict[str, float]:
    """
    Equal-weight baseline + tilt par score, bornes [min_w, max_w], somme = 1.
    Le tilt léger évite de devoir rebalancer souvent (peu de drift).
    """
    n = len(selected)
    if n == 0:
        return {}
    eq = 1.0 / n
    tilt = cfg["score_tilt_strength"]
    lo = cfg["min_position_weight"]
    hi = cfg["max_position_weight"]

    scores = [s["_score"] for s in selected]
    mean_s = sum(scores) / len(scores) or 1.0

    raw = []
    for s in selected:
        # weight = eq × (1 + tilt × (score/mean - 1))
        mult = 1.0 + tilt * (s["_score"] / mean_s - 1.0)
        raw.append(eq * max(0.1, mult))

    # Renormalise puis applique bornes (clipping itératif)
    for _ in range(50):
        total = sum(raw)
        raw = [w / total for w in raw]
        capped = [min(max(w, lo), hi) for w in raw]
        if abs(sum(capped) - 1.0) < 1e-4:
            raw = capped
            break
        raw = capped

    return {s["ticker"]: w for s, w in zip(selected, raw)}


# ══════════════════════════════════════════════════════════════
# CALENDRIER DIVIDENDES
# ══════════════════════════════════════════════════════════════

def _project_stock_calendar(stock: Dict, horizon_months: int) -> Dict[str, float]:
    """
    Pour un titre, projette les paiements mensuels sur l'horizon (en fraction du yield annuel).
    Retourne un dict {YYYY-MM: fraction_annual_div}.
    """
    hist = stock.get("dividends_history") or []
    if not hist:
        return {}

    freq = (stock.get("debug_dividends") or {}).get("frequency_detected") or 0
    if freq not in (1, 2, 4, 12):
        # Tente de déduire d'après l'historique
        if len(hist) >= 4:
            freq = 4  # trim par défaut
        else:
            freq = 1

    # Dernière date connue (en haut de liste habituellement)
    try:
        last_dates = sorted([h["ex_date"] for h in hist if h.get("ex_date")], reverse=True)
        last = datetime.strptime(last_dates[0], "%Y-%m-%d") if last_dates else None
    except Exception:
        last = None
    if last is None:
        return {}

    # Mois caractéristiques (pattern des derniers paiements pour préserver le calendrier réel)
    months_pattern = sorted({datetime.strptime(d, "%Y-%m-%d").month
                              for d in last_dates[:freq] if d})
    if not months_pattern:
        months_pattern = [last.month]

    today = datetime.utcnow().replace(day=1)
    horizon_end = today + timedelta(days=horizon_months * 31)

    # Annual fraction par paiement
    per_payment = 1.0 / freq

    cal: Dict[str, float] = {}
    # Itère sur les mois de l'horizon, ajoute fraction si mois ∈ pattern
    cur = today
    while cur <= horizon_end:
        if cur.month in months_pattern:
            cal[cur.strftime("%Y-%m")] = cal.get(cur.strftime("%Y-%m"), 0) + per_payment
        # avance d'un mois
        ny, nm = (cur.year, cur.month + 1) if cur.month < 12 else (cur.year + 1, 1)
        cur = cur.replace(year=ny, month=nm)

    return cal


def project_portfolio_calendar(portfolio: List[Dict], weights: Dict[str, float],
                                horizon_months: int) -> Dict[str, float]:
    """
    Agrège le calendrier mensuel pondéré du portefeuille.
    Valeurs = % du portefeuille distribué chaque mois (annual yield × weight × fraction_mois).
    """
    agg: Dict[str, float] = defaultdict(float)
    for s in portfolio:
        tk = s["ticker"]
        w = weights.get(tk, 0)
        if w == 0:
            continue
        y = (_f(s.get("dividend_yield_regular")) or _f(s.get("dividend_yield")) or 0) / 100.0
        stock_cal = _project_stock_calendar(s, horizon_months)
        for month, frac in stock_cal.items():
            agg[month] += w * y * frac
    # Renvoie trié
    return dict(sorted(agg.items()))


def _gini(values: List[float]) -> float:
    """Coefficient de Gini : 0 = parfaitement uniforme, 1 = tout concentré."""
    if not values or sum(values) == 0:
        return 0.0
    vals = sorted(values)
    n = len(vals)
    cum = sum((i + 1) * v for i, v in enumerate(vals))
    total = sum(vals)
    return (2 * cum) / (n * total) - (n + 1) / n


def calendar_smoothness(calendar: Dict[str, float], horizon_months: int) -> Dict:
    """Métriques de lissage : Gini, mois couverts, écart-type relatif."""
    if not calendar:
        return {"gini": 1.0, "months_covered": 0, "cv": 1.0}
    vals = list(calendar.values())
    g = _gini(vals)
    covered = sum(1 for v in vals if v > 1e-6)
    mean_v = sum(vals) / len(vals)
    sd = statistics.pstdev(vals) if len(vals) > 1 else 0
    cv = sd / mean_v if mean_v > 0 else 0
    return {
        "gini": round(g, 3),
        "months_covered": covered,
        "horizon": horizon_months,
        "coefficient_variation": round(cv, 3),
        "min_month_pct": round(min(vals) * 100, 3),
        "max_month_pct": round(max(vals) * 100, 3),
    }


def optimize_calendar(selected: List[Dict], scored_pool: List[Dict],
                       cfg: Dict, weights: Dict[str, float]) -> List[Dict]:
    """
    Tente des swaps : remplace un titre par un candidat dont le mois de paiement
    creuse les trous du calendrier, à condition que le swap réduise le Gini de
    plus de calendar_min_gain et que le score reste comparable (±15%).
    """
    horizon = cfg["calendar_horizon_months"]
    max_swaps = cfg["calendar_swaps_max"]
    min_gain = cfg["calendar_min_gain"]
    selected = list(selected)
    candidates = [s for s in scored_pool if s not in selected]
    candidates = sorted(candidates, key=lambda x: x["_score"], reverse=True)[:120]

    for _ in range(max_swaps):
        cur_cal = project_portfolio_calendar(selected, weights, horizon)
        cur_smooth = calendar_smoothness(cur_cal, horizon)
        cur_gini = cur_smooth["gini"]
        best_gain = 0.0
        best_swap = None

        for out_stock in selected:
            out_score = out_stock["_score"]
            for cand in candidates:
                # Score doit rester compétitif
                if cand["_score"] < out_score * 0.85:
                    continue
                # Même région idéalement, pour préserver les quotas
                if _normalize_region(cand) != _normalize_region(out_stock):
                    continue
                # Test swap
                trial = [c if c is not out_stock else cand for c in selected]
                trial_weights = dict(weights)
                trial_weights[cand["ticker"]] = trial_weights.pop(out_stock["ticker"])
                trial_cal = project_portfolio_calendar(trial, trial_weights, horizon)
                trial_gini = calendar_smoothness(trial_cal, horizon)["gini"]
                gain = cur_gini - trial_gini
                if gain > best_gain:
                    best_gain = gain
                    best_swap = (out_stock, cand)

        if best_swap and best_gain >= min_gain:
            out_s, in_s = best_swap
            idx = selected.index(out_s)
            selected[idx] = in_s
            weights[in_s["ticker"]] = weights.pop(out_s["ticker"])
            candidates.remove(in_s)
            candidates.append(out_s)
            logger.info(f"   🔁 Swap calendrier : {out_s['ticker']} → {in_s['ticker']} "
                        f"(gain Gini {best_gain:.3f})")
        else:
            break

    return selected


# ══════════════════════════════════════════════════════════════
# OUTPUT
# ══════════════════════════════════════════════════════════════

def build_output(selected: List[Dict], weights: Dict[str, float],
                  calendar: Dict[str, float], smooth: Dict,
                  filter_report: FilterReport, cfg: Dict) -> Dict:
    holdings = []
    sector_w: Dict[str, float] = defaultdict(float)
    region_w: Dict[str, float] = defaultdict(float)
    total_y = 0.0
    quality_avg = 0.0
    payout_avg = 0.0
    growth_avg = 0.0

    for s in selected:
        tk = s["ticker"]
        w = weights.get(tk, 0)
        y = _f(s.get("dividend_yield_regular")) or _f(s.get("dividend_yield")) or 0
        sector = _normalize_sector(s)
        region = _normalize_region(s)
        sector_w[sector] += w
        region_w[region] += w
        total_y += w * y
        quality_avg += w * (_f(s.get("quality_score")) or 0)
        po = _f(s.get("payout_ratio_ttm")) or 0
        po_pct = po if po > 1.5 else po * 100
        payout_avg += w * po_pct
        growth_avg += w * (_f(s.get("dividend_growth_3y")) or 0)

        holdings.append({
            "ticker": tk,
            "name": s.get("name") or s.get("name_api"),
            "region": region,
            "country": s.get("country"),
            "sector": sector,
            "weight_pct": round(w * 100, 2),
            "dividend_yield_pct": round(y, 2),
            "payout_ratio_pct": round(po_pct, 1),
            "dividend_growth_3y_pct": round(_f(s.get("dividend_growth_3y")) or 0, 1),
            "quality_score": _f(s.get("quality_score")),
            "quality_grade": s.get("quality_grade"),
            "roe_pct": round(_f(s.get("roe")) or 0, 1),
            "fcf_yield_pct": round(_f(s.get("fcf_yield")) or 0, 2),
            "dividend_coverage": _f(s.get("dividend_coverage")),
            "frequency": (s.get("debug_dividends") or {}).get("frequency_detected"),
            "market_cap": s.get("market_cap"),
            "score": round(s["_score"], 4),
        })

    return {
        "_meta": {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "generator": "dividend_portfolio.py v1.1",
            "mode": cfg.get("mode"),
            "mode_label": cfg.get("label"),
            "fiscal_notes": cfg.get("notes"),
            "universe_size": filter_report.total,
            "eligible_count": filter_report.kept,
            "filters_applied": {k: v for k, v in cfg.items()
                                  if k not in ("eligible_countries",)},
            "filter_rejections": filter_report.rejected,
        },
        "stats": {
            "num_holdings": len(holdings),
            "portfolio_yield_pct": round(total_y, 2),
            "avg_quality_score": round(quality_avg, 1),
            "avg_payout_pct": round(payout_avg, 1),
            "avg_div_growth_3y_pct": round(growth_avg, 1),
            "num_sectors": len(sector_w),
            "calendar_smoothness": smooth,
        },
        "region_breakdown": {r: round(w * 100, 1) for r, w in sorted(region_w.items())},
        "sector_breakdown": {s: round(w * 100, 1)
                              for s, w in sorted(sector_w.items(), key=lambda x: -x[1])},
        "dividend_calendar_pct": {m: round(v * 100, 3) for m, v in calendar.items()},
        "holdings": sorted(holdings, key=lambda x: -x["weight_pct"]),
        "turnover_notes": {
            "rebalance_recommendation": "annuel avec bande de tolérance ±3pp",
            "buy_and_hold_design": ("Poids equal-weight tiltés légèrement (tilt={tilt}), "
                                    "bornes [{lo}%, {hi}%] : le drift de prix reste "
                                    "borné, peu de rebalancement nécessaire."
                                    ).format(tilt=cfg["score_tilt_strength"],
                                              lo=cfg["min_position_weight"] * 100,
                                              hi=cfg["max_position_weight"] * 100),
        },
    }


# ══════════════════════════════════════════════════════════════
# ORCHESTRATION
# ══════════════════════════════════════════════════════════════

def _run_one_mode(mode: str, universe: List[Dict], extra_config: Optional[Dict] = None) -> Dict:
    """Exécute le pipeline pour un mode (pea | cto) et écrit son JSON."""
    if mode not in MODE_CONFIGS:
        raise ValueError(f"Mode inconnu : {mode}. Choix : {list(MODE_CONFIGS)}")

    cfg = {**BASE_CONFIG, **MODE_CONFIGS[mode], **(extra_config or {})}
    cfg["mode"] = mode

    logger.info("")
    logger.info(f"━━━━━ Mode : {mode.upper()} — {cfg['label']} ━━━━━")

    eligible, report = filter_universe(universe, cfg)
    logger.info(f"✅ Éligibles : {report.kept}/{report.total}")
    if report.rejected:
        top_rej = dict(sorted(report.rejected.items(), key=lambda x: -x[1])[:6])
        logger.info(f"   Top rejections : {top_rej}")

    if len(eligible) < cfg["target_holdings"]:
        logger.warning(f"⚠️  Pool éligible ({len(eligible)}) < cible ({cfg['target_holdings']}) "
                       "— sortie possiblement incomplète")

    for s in eligible:
        s["_score"] = compute_score(s, cfg)

    selected = select_balanced(eligible, cfg)
    logger.info(f"🎯 Sélection : {len(selected)} titres")

    weights = compute_weights(selected, cfg)

    logger.info(f"📅 Optim calendrier (max {cfg['calendar_swaps_max']} swaps)...")
    selected = optimize_calendar(selected, eligible, cfg, weights)

    calendar = project_portfolio_calendar(selected, weights, cfg["calendar_horizon_months"])
    smooth = calendar_smoothness(calendar, cfg["calendar_horizon_months"])

    output = build_output(selected, weights, calendar, smooth, report, cfg)

    out = Path(cfg["output_path"])
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    logger.info(f"💾 {out}")
    logger.info(f"📈 Yield : {output['stats']['portfolio_yield_pct']}% "
                f"| Quality : {output['stats']['avg_quality_score']} "
                f"| Payout : {output['stats']['avg_payout_pct']}% "
                f"| Mois couverts : {smooth['months_covered']}/{cfg['calendar_horizon_months']}")
    return output


def generate_dividend_portfolio(modes: Optional[List[str]] = None,
                                  extra_config: Optional[Dict] = None) -> Dict[str, Dict]:
    """
    Génère les portefeuilles dividende pour les modes demandés (par défaut PEA + CTO).
    Retourne {mode: output_dict}.
    """
    modes = modes or ["pea", "cto"]
    logger.info("🚀 Génération portefeuilles dividende (perso)")
    logger.info(f"   Modes : {modes}")

    universe = _load_universe(BASE_CONFIG["data_dir"], BASE_CONFIG["sources"])
    logger.info(f"📊 Univers brut total : {len(universe)} titres")

    results = {}
    for mode in modes:
        results[mode] = _run_one_mode(mode, universe, extra_config)

    # Résumé combiné
    logger.info("")
    logger.info("━━━━━ Résumé ━━━━━")
    for mode, out in results.items():
        st = out["stats"]
        logger.info(f"  {mode.upper():4s} → {st['num_holdings']:>2} titres, "
                    f"yield {st['portfolio_yield_pct']:>4.1f}%, "
                    f"quality {st['avg_quality_score']:>5.1f}")
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    generate_dividend_portfolio()
