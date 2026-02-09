#!/usr/bin/env python3
"""
selection_explainer.py - Explique pourquoi les grandes capitalisations sont/ne sont pas sélectionnées

v1.4.0 - ADD: Classement final ETF / Obligations / Crypto + explain_top_caps_selection étendu
v1.3.0 - Aligned with preset_meta v4.15.2 (profile-based selection, yield-trap, missing data)
v1.2.0 - FIX: Intégration du sanity check volatilité
v1.1.0 - FIX: Calcul du composite_score si absent dans les données brutes
v1.0.0 - Initial version
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

logger = logging.getLogger("selection-explainer")


SELECTION_PIPELINE = {
    "version": "v4.15.2",
    "description": "Pipeline de sélection des actions par profil (preset_meta v4.15.2)",
    "steps": [
        {"step": 1, "name": "Chargement des données", "source": "data/stocks_us.json, data/stocks_europe.json, data/stocks_asia.json", "output": "~450-500 actions brutes"},
        {"step": 2, "name": "Filtre Buffett (global)", "mode": "soft", "threshold": "score_min = 40-60 selon profil", "output": "~280-350 actions après filtre"},
        {"step": 3, "name": "Assignment des presets", "function": "assign_preset_to_equity()", "output": "Actions avec _matched_preset assigné"},
        {"step": 4, "name": "Hard filters par profil", "function": "apply_hard_filters()", "output": "Actions filtrées par profil"},
        {"step": 5, "name": "Scoring par profil", "function": "score_equity_for_profile()", "output": "Actions scorées et classées par profil"},
        {"step": 6, "name": "Sélection finale", "function": "select_equities_for_profile()", "target": "25 actions par profil", "output": "25 actions finales par profil"},
        {"step": 7, "name": "Tilts RADAR (optionnel)", "source": "data/market_context.json"},
    ],
    "key_points": [
        "Les grandes capitalisations NE SONT PAS automatiquement sélectionnées",
        "La sélection est PROFILE-SPECIFIC (Agressif ≠ Stable)",
        "Les données manquantes = REJET strict",
        "Anti yield-trap: payout > 85% ou coverage < 1.2x = REJET",
        "Overlap Agressif/Stable < 30%",
    ],
}

HARD_FILTER_EXPLANATIONS = {
    "vol_missing": "❌ Volatilité manquante (donnée requise)",
    "vol_aberrant": "❌ Volatilité aberrante (< 1% ou > 120%)",
    "roe_missing": "❌ ROE manquant (donnée requise)",
    "div_yield_missing": "❌ Dividend yield manquant (requis pour Stable)",
    "payout_missing": "❌ Payout ratio manquant (requis pour anti yield-trap)",
    "coverage_missing": "❌ Dividend coverage manquant (requis pour anti yield-trap)",
}


def explain_hard_filter_reason(reason: str) -> str:
    if reason in HARD_FILTER_EXPLANATIONS:
        return HARD_FILTER_EXPLANATIONS[reason]
    if reason.startswith("vol<"):
        return f"❌ Volatilité < {reason.replace('vol<', '')}% (trop défensif pour Agressif)"
    if reason.startswith("vol>"):
        return f"❌ Volatilité > {reason.replace('vol>', '')}% (risque excessif)"
    if reason.startswith("roe<"):
        return f"❌ ROE < {reason.replace('roe<', '')}% (qualité insuffisante)"
    if reason.startswith("div<"):
        return f"❌ Dividend yield < {reason.replace('div<', '')}% (rendement insuffisant)"
    if reason.startswith("payout>"):
        return f"❌ Payout ratio > {reason.replace('payout>', '')}% - ⚠️ YIELD TRAP"
    if reason.startswith("coverage<"):
        return f"❌ Dividend coverage < {reason.replace('coverage<', '')}x - ⚠️ YIELD TRAP"
    return reason


def parse_market_cap(value) -> float:
    if isinstance(value, (int, float)):
        return float(value) / 1e9
    if not isinstance(value, str):
        return 0.0
    value = value.upper().strip().replace("$", "").replace(",", "")
    multipliers = {"T": 1000, "B": 1, "M": 0.001, "K": 0.000001}
    for suffix, mult in multipliers.items():
        if suffix in value:
            try:
                return float(value.replace(suffix, "").strip()) * mult
            except:
                return 0.0
    try:
        return float(value) / 1e9
    except:
        return 0.0


def format_market_cap(value_billions: float) -> str:
    if value_billions >= 1000:
        return f"{value_billions/1000:.1f}T"
    elif value_billions >= 1:
        return f"{value_billions:.1f}B"
    else:
        return f"{value_billions*1000:.0f}M"


def get_region(country: str) -> str:
    country = (country or "").upper()
    us_countries = {"USA", "US", "UNITED STATES", "ÉTATS-UNIS", "ETATS-UNIS"}
    europe_countries = {"FRANCE", "GERMANY", "ALLEMAGNE", "UK", "UNITED KINGDOM", "ROYAUME-UNI", "NETHERLANDS", "PAYS-BAS", "SWITZERLAND", "SUISSE", "ITALY", "ITALIE", "SPAIN", "ESPAGNE", "BELGIUM", "BELGIQUE", "SWEDEN", "SUÈDE", "DENMARK", "DANEMARK", "NORWAY", "NORVÈGE", "FINLAND", "FINLANDE", "IRELAND", "IRLANDE", "PORTUGAL", "AUSTRIA", "AUTRICHE", "LUXEMBOURG"}
    asia_countries = {"JAPAN", "JAPON", "CHINA", "CHINE", "HONG KONG", "SOUTH KOREA", "CORÉE DU SUD", "KOREA", "CORÉE", "TAIWAN", "TAÏWAN", "INDIA", "INDE", "SINGAPORE", "SINGAPOUR", "AUSTRALIA", "AUSTRALIE", "INDONESIA", "INDONÉSIE", "THAILAND", "THAÏLANDE"}
    if country in us_countries:
        return "US"
    elif country in europe_countries:
        return "Europe"
    elif country in asia_countries:
        return "Asia"
    return "Other"


def _apply_volatility_sanity_check(equities: List[Dict]) -> List[Dict]:
    try:
        from .data_quality import batch_sanitize_volatility
        equities, vol_stats = batch_sanitize_volatility(equities)
        if vol_stats["corrected"] > 0:
            logger.info(f"[VOL SANITY] {vol_stats['corrected']} volatilités corrigées")
        return equities
    except ImportError as e:
        logger.warning(f"[VOL SANITY] Import failed: {e}")
        return equities
    except Exception as e:
        logger.error(f"[VOL SANITY] Error: {e}")
        return equities


def _safe_float(value, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            cleaned = value.replace("%", "").replace(",", "").strip()
            if cleaned == "" or cleaned.upper() == "N/A":
                return default
            return float(cleaned)
        except:
            return default
    return default


def calculate_composite_score(eq: Dict) -> float:
    ytd = _safe_float(eq.get("ytd") or eq.get("perf_ytd"))
    perf_3m = _safe_float(eq.get("perf_3m"))
    perf_1m = _safe_float(eq.get("perf_1m"))
    def normalize_perf(p, min_val=-50, max_val=100):
        if p <= min_val: return 0.0
        if p >= max_val: return 1.0
        return (p - min_val) / (max_val - min_val)
    momentum_raw = 0.5 * normalize_perf(ytd) + 0.3 * normalize_perf(perf_3m) + 0.2 * normalize_perf(perf_1m)
    momentum_score = min(1.0, max(0.0, momentum_raw))
    roe = _safe_float(eq.get("roe"))
    buffett = _safe_float(eq.get("_buffett_score"), 50)
    roe_norm = min(1.0, max(0.0, roe / 30.0))
    buffett_norm = buffett / 100.0
    quality_score = 0.6 * roe_norm + 0.4 * buffett_norm
    vol = _safe_float(eq.get("vol") or eq.get("volatility_3y") or eq.get("vol_3y"), 30)
    max_dd = _safe_float(eq.get("max_dd") or eq.get("max_drawdown_ytd"), -20)
    vol_inv = max(0.0, min(1.0, (60 - vol) / 50.0))
    dd_inv = max(0.0, min(1.0, (max_dd + 50) / 50.0))
    risk_score = 0.6 * vol_inv + 0.4 * dd_inv
    return round(0.4 * momentum_score + 0.3 * quality_score + 0.3 * risk_score, 4)


def enrich_with_composite_scores(equities: List[Dict]) -> List[Dict]:
    for eq in equities:
        if eq.get("_composite_score") is None or eq.get("_composite_score") == 0:
            eq["_composite_score"] = calculate_composite_score(eq)
    return equities


def _get_hard_filter_rejections(asset: Dict, profile: str) -> List[str]:
    reasons = []
    try:
        from .preset_meta import get_profile_policy, get_metric_value
        policy = get_profile_policy(profile)
        filters = policy.get("hard_filters", {})
        vol = get_metric_value(asset, "volatility_3y")
        roe = get_metric_value(asset, "roe")
        div_yield = get_metric_value(asset, "dividend_yield")
        payout = get_metric_value(asset, "payout_ratio")
        coverage = get_metric_value(asset, "dividend_coverage")
        if "volatility_3y_min" in filters or "volatility_3y_max" in filters:
            if vol is None:
                reasons.append("vol_missing")
            else:
                if vol < 1 or vol > 120: reasons.append("vol_aberrant")
                if "volatility_3y_min" in filters and vol < filters["volatility_3y_min"]: reasons.append(f"vol<{filters['volatility_3y_min']}")
                if "volatility_3y_max" in filters and vol > filters["volatility_3y_max"]: reasons.append(f"vol>{filters['volatility_3y_max']}")
        if "roe_min" in filters:
            if roe is None: reasons.append("roe_missing")
            elif roe < filters["roe_min"]: reasons.append(f"roe<{filters['roe_min']}")
        if "dividend_yield_min" in filters:
            if div_yield is None: reasons.append("div_yield_missing")
            elif div_yield < filters["dividend_yield_min"]: reasons.append(f"div<{filters['dividend_yield_min']}")
        if "payout_ratio_max" in filters:
            if payout is None: reasons.append("payout_missing")
            elif payout > filters["payout_ratio_max"]: reasons.append(f"payout>{filters['payout_ratio_max']}")
        if "dividend_coverage_min" in filters:
            if coverage is None: reasons.append("coverage_missing")
            elif coverage < filters["dividend_coverage_min"]: reasons.append(f"coverage<{filters['dividend_coverage_min']}")
    except ImportError:
        pass
    return reasons


def analyze_rejection_reason(asset: Dict, selected_ids: set, selected_by_sector: Dict[str, List], buffett_min_score: int = 40, max_per_sector: int = 4, profile: str = "Modéré") -> Tuple[str, Dict]:
    details = {}
    asset_id = asset.get("id") or asset.get("ticker")
    if asset_id in selected_ids:
        return "✅ SÉLECTIONNÉ", {"status": "selected"}
    hard_filter_reasons = _get_hard_filter_rejections(asset, profile)
    if hard_filter_reasons:
        explanations = [explain_hard_filter_reason(r) for r in hard_filter_reasons]
        details["hard_filter_reasons"] = hard_filter_reasons
        details["profile"] = profile
        return f"❌ Hard filters [{profile}]: {'; '.join(explanations)}", details
    buffett_score = asset.get("_buffett_score")
    buffett_reject = asset.get("_buffett_reject_reason")
    if buffett_reject:
        details["buffett_score"] = buffett_score
        return f"❌ Filtre Buffett: {buffett_reject}", details
    if buffett_score is not None and buffett_score < buffett_min_score:
        details["buffett_score"] = buffett_score
        return f"❌ Score Buffett insuffisant ({buffett_score:.0f} < {buffett_min_score})", details
    roe = asset.get("roe")
    if roe is None or roe == "N/A":
        details["missing"] = "ROE"
        return "❌ Données manquantes: ROE non disponible", details
    vol = asset.get("vol") or asset.get("volatility_3y") or asset.get("vol_3y")
    if vol:
        try:
            vol_float = float(str(vol).replace("%", ""))
            if vol_float > 60:
                details["volatility"] = vol_float
                return f"❌ Volatilité excessive ({vol_float:.1f}% > 60%)", details
        except:
            pass
    sector = asset.get("sector") or asset.get("_sector_key") or "Unknown"
    sector_count = len(selected_by_sector.get(sector, []))
    if sector_count >= max_per_sector:
        composite = asset.get("_composite_score") or 0
        selected_in_sector = selected_by_sector.get(sector, [])
        if selected_in_sector:
            min_selected_score = min(s.get("_composite_score", 0) for s in selected_in_sector)
            details["sector"] = sector
            details["sector_quota"] = f"{sector_count}/{max_per_sector}"
            return f"❌ Quota sectoriel atteint ({sector}: {sector_count}/{max_per_sector})", details
    composite = asset.get("_composite_score") or 0
    details["composite_score"] = round(composite, 3)
    return f"❌ Score composite insuffisant ({composite:.3f})", details


# ============= v1.4.0: CATEGORY RANKING BUILDER =============

def _get_best_score(asset: Dict) -> float:
    for key in ["composite_score", "_composite_score", "_profile_score", "bond_quality_raw", "_buffett_score", "buffett_score"]:
        val = asset.get(key)
        if val is not None:
            try:
                return float(val)
            except (TypeError, ValueError):
                pass
    return 0.0


def build_category_ranking(all_candidates: List[Dict], selected: List[Dict], category: str, max_entries: int = 100) -> List[Dict]:
    """v1.4.0: Build a complete sorted ranking for a category."""
    selected_ids = set()
    for s in selected:
        for key in ["id", "ticker", "symbol", "name"]:
            val = s.get(key)
            if val:
                selected_ids.add(str(val))
    sorted_candidates = sorted(all_candidates, key=_get_best_score, reverse=True)
    ranking = []
    for rank_idx, asset in enumerate(sorted_candidates[:max_entries], 1):
        name = asset.get("name") or asset.get("ticker") or "Unknown"
        ticker = asset.get("ticker") or asset.get("symbol") or ""
        is_selected = any(str(asset.get(k, "")) in selected_ids for k in ["id", "ticker", "symbol", "name"])
        entry = {"rank": rank_idx, "name": name, "ticker": ticker, "score": round(_get_best_score(asset), 4), "selected": is_selected}
        cs = asset.get("composite_score") or asset.get("_composite_score")
        if cs is not None:
            try: entry["composite_score"] = round(float(cs), 4)
            except (TypeError, ValueError): pass
        ps = asset.get("_profile_score")
        if ps is not None:
            try: entry["profile_score"] = round(float(ps), 4)
            except (TypeError, ValueError): pass
        fs = asset.get("factor_scores")
        if fs and isinstance(fs, dict):
            entry["factor_scores"] = {k: round(float(v), 3) for k, v in fs.items() if v is not None and k != "_meta"}
        for vk in ["vol", "volatility_3y", "vol_3y", "vol_pct", "vol_30d_annual_pct", "vol_7d_annual_pct"]:
            v = asset.get(vk)
            if v is not None:
                try:
                    entry["volatility"] = round(float(v), 1)
                    break
                except (TypeError, ValueError): pass
        ytd_val = asset.get("ytd") or asset.get("perf_ytd")
        if ytd_val is not None:
            entry["ytd"] = f"{ytd_val}%" if isinstance(ytd_val, (int, float)) else str(ytd_val)
        if category == "etf":
            sector_top = asset.get("sector_top")
            if sector_top:
                entry["sector"] = sector_top.get("sector", "") if isinstance(sector_top, dict) else str(sector_top)
            else:
                entry["sector"] = asset.get("sector") or ""
        else:
            entry["sector"] = asset.get("sector") or asset.get("_sector_key") or ""
        entry["country"] = asset.get("country") or ""
        if asset.get("_matched_preset"): entry["matched_preset"] = asset["_matched_preset