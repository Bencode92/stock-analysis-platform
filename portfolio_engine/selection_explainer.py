#!/usr/bin/env python3
"""
selection_explainer.py - Explique pourquoi les grandes capitalisations sont/ne sont pas sélectionnées

Génère un fichier JSON documentant:
1. La logique globale de sélection (pipeline complet)
2. Les TOP 20 capitalisations US/Europe/Asie avec leur statut détaillé
3. Les raisons précises de sélection/rejet

v1.3.0 - Aligned with preset_meta v4.15.2 (profile-based selection, yield-trap, missing data)
v1.2.0 - FIX: Intégration du sanity check volatilité (corrige LSEG 376% → 3.76%)
v1.1.0 - FIX: Calcul du composite_score si absent dans les données brutes
v1.0.0 - Initial version
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

logger = logging.getLogger("selection-explainer")


# === LOGIQUE DE SÉLECTION DOCUMENTÉE v4.15.2 ===

SELECTION_PIPELINE = {
    "version": "v4.15.2",
    "description": "Pipeline de sélection des actions par profil (preset_meta v4.15.2)",
    "steps": [
        {
            "step": 1,
            "name": "Chargement des données",
            "source": "data/stocks_us.json, data/stocks_europe.json, data/stocks_asia.json",
            "description": "Charge toutes les actions avec leurs métriques fondamentales",
            "output": "~450-500 actions brutes",
        },
        {
            "step": 2,
            "name": "Filtre Buffett (global)",
            "mode": "soft (par défaut)",
            "threshold": "score_min = 40-60 selon profil",
            "description": "Évalue la qualité fondamentale selon les critères Warren Buffett",
            "formula": {
                "ROE_score": "0-40 points (ROE >= 20% = 40pts, >= 15% = 30pts, >= 10% = 20pts)",
                "DE_score": "0-30 points (D/E <= 50% = 30pts, <= 100% = 20pts, <= 150% = 10pts)",
                "Stability_score": "0-30 points (basé sur volatilité et drawdown)",
                "Total": "ROE_score + DE_score + Stability_score (max 100)",
            },
            "output": "~280-350 actions après filtre",
        },
        {
            "step": 3,
            "name": "Assignment des presets",
            "function": "assign_preset_to_equity()",
            "description": "Assigne chaque action à un preset selon ses caractéristiques",
            "presets": {
                "recovery": "vol >= 35% ET ytd < -10%",
                "agressif": "vol >= 35%",
                "defensif": "vol < 22% ET (div_yield > 1.5% OU buffett >= 75)",
                "low_volatility": "vol < 20% ET buffett >= 70",
                "quality_premium": "vol < 30% ET roe > 15% ET buffett >= 65",
                "value_dividend": "vol < 28% ET div_yield > 1%",
                "momentum_trend": "vol >= 28% ET (ytd > 5% OU perf_1y > 20%)",
                "croissance": "vol >= 25% ET ytd > 0%",
            },
            "output": "Actions avec _matched_preset assigné",
        },
        {
            "step": 4,
            "name": "Hard filters par profil",
            "function": "apply_hard_filters()",
            "description": "Filtre strict par profil - données manquantes = REJET",
            "profiles": {
                "Agressif": {
                    "volatility_3y_min": 22.0,
                    "volatility_3y_max": 120.0,
                    "rejection_if_missing": ["volatility_3y"],
                },
                "Modéré": {
                    "volatility_3y_min": 12.0,
                    "volatility_3y_max": 45.0,
                    "roe_min": 8.0,
                    "rejection_if_missing": ["volatility_3y", "roe"],
                },
                "Stable": {
                    "volatility_3y_max": 28.0,
                    "roe_min": 10.0,
                    "dividend_yield_min": 0.5,
                    "payout_ratio_max": 85.0,
                    "dividend_coverage_min": 1.2,
                    "rejection_if_missing": ["volatility_3y", "roe", "dividend_yield", "payout_ratio", "dividend_coverage"],
                    "yield_trap_protection": "payout > 85% OU coverage < 1.2x = REJET",
                },
            },
            "v4.15.2_changes": [
                "vol_missing = REJET (plus de default 25.0)",
                "Tous les filtres appliqués (elif → if)",
                "Anti yield-trap strict pour Stable",
            ],
            "output": "Actions filtrées par profil",
        },
        {
            "step": 5,
            "name": "Scoring par profil",
            "function": "score_equity_for_profile()",
            "description": "Score pondéré selon le profil, avec pénalité missing data",
            "weights_example": {
                "Agressif": "perf_1y=0.20, perf_3m=0.10, eps_growth=0.15, max_dd=-0.05",
                "Stable": "volatility=-0.25, max_dd=-0.15, div_yield=0.20, buffett=0.20",
            },
            "v4.15.2_changes": [
                "Missing data penalty: poids négatif = percentile 1.0 (pire)",
                "Missing data bonus: poids positif = percentile 0.5 (neutre)",
                "Percentiles data-driven avec winsorization",
                "pct_rank() O(log n) avec bisect",
            ],
            "output": "Actions scorées et classées par profil",
        },
        {
            "step": 6,
            "name": "Sélection finale",
            "function": "select_equities_for_profile()",
            "target": "25 actions par profil",
            "description": "Sélectionne les meilleures actions pour chaque profil",
            "overlap_target": "< 30% entre Agressif et Stable",
            "output": "25 actions finales par profil",
        },
        {
            "step": 7,
            "name": "Tilts RADAR (optionnel)",
            "description": "Ajuste les scores selon le contexte marché",
            "adjustments": {
                "favored_sectors": "+15% sur le score",
                "avoided_sectors": "-15% sur le score",
                "favored_regions": "+15% sur le score",
                "avoided_regions": "-15% sur le score",
            },
            "source": "data/market_context.json (généré par RADAR)",
        },
    ],
    "key_points": [
        "Les grandes capitalisations NE SONT PAS automatiquement sélectionnées",
        "La sélection est PROFILE-SPECIFIC (Agressif ≠ Stable)",
        "Les données manquantes = REJET strict (vol_missing, roe_missing, etc.)",
        "Anti yield-trap: payout > 85% ou coverage < 1.2x = REJET",
        "Overlap Agressif/Stable < 30% (différenciation réelle)",
        "Scoring avec pénalité missing data (pas d'avantage injuste)",
    ],
}


# === v1.3.0: HARD FILTER REASONS ===

HARD_FILTER_EXPLANATIONS = {
    "vol_missing": "❌ Volatilité manquante (donnée requise)",
    "vol_aberrant": "❌ Volatilité aberrante (< 1% ou > 120%)",
    "roe_missing": "❌ ROE manquant (donnée requise)",
    "div_yield_missing": "❌ Dividend yield manquant (requis pour Stable)",
    "payout_missing": "❌ Payout ratio manquant (requis pour anti yield-trap)",
    "coverage_missing": "❌ Dividend coverage manquant (requis pour anti yield-trap)",
}


def explain_hard_filter_reason(reason: str) -> str:
    """v1.3.0: Génère une explication lisible pour un code de rejet."""
    if reason in HARD_FILTER_EXPLANATIONS:
        return HARD_FILTER_EXPLANATIONS[reason]
    
    if reason.startswith("vol<"):
        threshold = reason.replace("vol<", "")
        return f"❌ Volatilité < {threshold}% (trop défensif pour Agressif)"
    
    if reason.startswith("vol>"):
        threshold = reason.replace("vol>", "")
        return f"❌ Volatilité > {threshold}% (risque excessif)"
    
    if reason.startswith("roe<"):
        threshold = reason.replace("roe<", "")
        return f"❌ ROE < {threshold}% (qualité insuffisante)"
    
    if reason.startswith("div<"):
        threshold = reason.replace("div<", "")
        return f"❌ Dividend yield < {threshold}% (rendement insuffisant)"
    
    if reason.startswith("payout>"):
        threshold = reason.replace("payout>", "")
        return f"❌ Payout ratio > {threshold}% - ⚠️ YIELD TRAP"
    
    if reason.startswith("coverage<"):
        threshold = reason.replace("coverage<", "")
        return f"❌ Dividend coverage < {threshold}x - ⚠️ YIELD TRAP"
    
    return reason


def parse_market_cap(value) -> float:
    """Parse market cap string to float (in billions)."""
    if isinstance(value, (int, float)):
        return float(value) / 1e9
    
    if not isinstance(value, str):
        return 0.0
    
    value = value.upper().strip().replace("$", "").replace(",", "")
    
    multipliers = {"T": 1000, "B": 1, "M": 0.001, "K": 0.000001}
    
    for suffix, mult in multipliers.items():
        if suffix in value:
            try:
                num = float(value.replace(suffix, "").strip())
                return num * mult
            except:
                return 0.0
    
    try:
        return float(value) / 1e9
    except:
        return 0.0


def format_market_cap(value_billions: float) -> str:
    """Format market cap in human readable format."""
    if value_billions >= 1000:
        return f"{value_billions/1000:.1f}T"
    elif value_billions >= 1:
        return f"{value_billions:.1f}B"
    else:
        return f"{value_billions*1000:.0f}M"


def get_region(country: str) -> str:
    """Determine region from country."""
    country = (country or "").upper()
    
    us_countries = {"USA", "US", "UNITED STATES", "ÉTATS-UNIS", "ETATS-UNIS"}
    europe_countries = {
        "FRANCE", "GERMANY", "ALLEMAGNE", "UK", "UNITED KINGDOM", "ROYAUME-UNI",
        "NETHERLANDS", "PAYS-BAS", "SWITZERLAND", "SUISSE", "ITALY", "ITALIE",
        "SPAIN", "ESPAGNE", "BELGIUM", "BELGIQUE", "SWEDEN", "SUÈDE",
        "DENMARK", "DANEMARK", "NORWAY", "NORVÈGE", "FINLAND", "FINLANDE",
        "IRELAND", "IRLANDE", "PORTUGAL", "AUSTRIA", "AUTRICHE", "LUXEMBOURG"
    }
    asia_countries = {
        "JAPAN", "JAPON", "CHINA", "CHINE", "HONG KONG", "SOUTH KOREA", "CORÉE DU SUD",
        "KOREA", "CORÉE", "TAIWAN", "TAÏWAN", "INDIA", "INDE", "SINGAPORE", "SINGAPOUR",
        "AUSTRALIA", "AUSTRALIE", "INDONESIA", "INDONÉSIE", "THAILAND", "THAÏLANDE"
    }
    
    if country in us_countries:
        return "US"
    elif country in europe_countries:
        return "Europe"
    elif country in asia_countries:
        return "Asia"
    else:
        return "Other"


# === v1.2.0: SANITY CHECK VOLATILITÉ ===

def _apply_volatility_sanity_check(equities: List[Dict]) -> List[Dict]:
    """Applique le sanity check de volatilité aux données entrantes."""
    try:
        from .data_quality import batch_sanitize_volatility
        
        equities, vol_stats = batch_sanitize_volatility(equities)
        
        if vol_stats["corrected"] > 0:
            logger.info(
                f"[VOL SANITY] {vol_stats['corrected']} volatilités corrigées "
                f"dans selection_explainer"
            )
        
        return equities
        
    except ImportError as e:
        logger.warning(f"[VOL SANITY] Import failed: {e}")
        return equities
    except Exception as e:
        logger.error(f"[VOL SANITY] Error: {e}")
        return equities


def _safe_float(value, default: float = 0.0) -> float:
    """Convertit une valeur en float de manière sûre."""
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
    """Calcule le score composite pour une action."""
    ytd = _safe_float(eq.get("ytd") or eq.get("perf_ytd"))
    perf_3m = _safe_float(eq.get("perf_3m"))
    perf_1m = _safe_float(eq.get("perf_1m"))
    
    def normalize_perf(p, min_val=-50, max_val=100):
        if p <= min_val:
            return 0.0
        if p >= max_val:
            return 1.0
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
    
    composite = 0.4 * momentum_score + 0.3 * quality_score + 0.3 * risk_score
    
    return round(composite, 4)


def enrich_with_composite_scores(equities: List[Dict]) -> List[Dict]:
    """Ajoute _composite_score à toutes les actions qui n'en ont pas."""
    for eq in equities:
        if eq.get("_composite_score") is None or eq.get("_composite_score") == 0:
            eq["_composite_score"] = calculate_composite_score(eq)
    
    return equities


# === v1.3.0: Profile-aware rejection analysis ===

def _get_hard_filter_rejections(asset: Dict, profile: str) -> List[str]:
    """v1.3.0: Determine hard filter rejection reasons for a profile."""
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
        
        # Vol checks
        if "volatility_3y_min" in filters or "volatility_3y_max" in filters:
            if vol is None:
                reasons.append("vol_missing")
            else:
                if vol < 1 or vol > 120:
                    reasons.append("vol_aberrant")
                if "volatility_3y_min" in filters and vol < filters["volatility_3y_min"]:
                    reasons.append(f"vol<{filters['volatility_3y_min']}")
                if "volatility_3y_max" in filters and vol > filters["volatility_3y_max"]:
                    reasons.append(f"vol>{filters['volatility_3y_max']}")
        
        # ROE check
        if "roe_min" in filters:
            if roe is None:
                reasons.append("roe_missing")
            elif roe < filters["roe_min"]:
                reasons.append(f"roe<{filters['roe_min']}")
        
        # Dividend yield check
        if "dividend_yield_min" in filters:
            if div_yield is None:
                reasons.append("div_yield_missing")
            elif div_yield < filters["dividend_yield_min"]:
                reasons.append(f"div<{filters['dividend_yield_min']}")
        
        # Payout ratio check (yield trap)
        if "payout_ratio_max" in filters:
            if payout is None:
                reasons.append("payout_missing")
            elif payout > filters["payout_ratio_max"]:
                reasons.append(f"payout>{filters['payout_ratio_max']}")
        
        # Coverage check (yield trap)
        if "dividend_coverage_min" in filters:
            if coverage is None:
                reasons.append("coverage_missing")
            elif coverage < filters["dividend_coverage_min"]:
                reasons.append(f"coverage<{filters['dividend_coverage_min']}")
        
    except ImportError:
        pass
    
    return reasons


def analyze_rejection_reason(
    asset: Dict,
    selected_ids: set,
    selected_by_sector: Dict[str, List],
    buffett_min_score: int = 40,
    max_per_sector: int = 4,
    profile: str = "Modéré",
) -> Tuple[str, Dict]:
    """
    Analyse détaillée de la raison de rejet d'un actif.
    
    v1.3.0: Added profile-aware hard filter analysis.
    """
    details = {}
    
    asset_id = asset.get("id") or asset.get("ticker")
    name = asset.get("name") or asset.get("ticker") or "Unknown"
    
    # 1. Vérifier si sélectionné
    if asset_id in selected_ids:
        return "✅ SÉLECTIONNÉ", {"status": "selected"}
    
    # 2. v1.3.0: Check hard filters for profile
    hard_filter_reasons = _get_hard_filter_rejections(asset, profile)
    if hard_filter_reasons:
        explanations = [explain_hard_filter_reason(r) for r in hard_filter_reasons]
        details["hard_filter_reasons"] = hard_filter_reasons
        details["profile"] = profile
        return f"❌ Hard filters [{profile}]: {'; '.join(explanations)}", details
    
    # 3. Check Buffett score
    buffett_score = asset.get("_buffett_score")
    buffett_reject = asset.get("_buffett_reject_reason")
    
    if buffett_reject:
        details["buffett_score"] = buffett_score
        details["buffett_reject_reason"] = buffett_reject
        return f"❌ Filtre Buffett: {buffett_reject}", details
    
    if buffett_score is not None and buffett_score < buffett_min_score:
        roe = asset.get("roe")
        de = asset.get("de_ratio")
        details["buffett_score"] = buffett_score
        details["roe"] = roe
        details["de_ratio"] = de
        return f"❌ Score Buffett insuffisant ({buffett_score:.0f} < {buffett_min_score})", details
    
    # 4. Check données manquantes
    roe = asset.get("roe")
    
    if roe is None or roe == "N/A":
        details["missing"] = "ROE"
        return "❌ Données manquantes: ROE non disponible", details
    
    # 5. Check volatilité
    vol = asset.get("vol") or asset.get("volatility_3y") or asset.get("vol_3y")
    if vol:
        try:
            vol_float = float(str(vol).replace("%", ""))
            if vol_float > 60:
                details["volatility"] = vol_float
                return f"❌ Volatilité excessive ({vol_float:.1f}% > 60%)", details
        except:
            pass
    
    # 6. Check quota sectoriel
    sector = asset.get("sector") or asset.get("_sector_key") or "Unknown"
    sector_count = len(selected_by_sector.get(sector, []))
    
    if sector_count >= max_per_sector:
        composite = asset.get("_composite_score") or 0
        selected_in_sector = selected_by_sector.get(sector, [])
        if selected_in_sector:
            min_selected_score = min(s.get("_composite_score", 0) for s in selected_in_sector)
            details["sector"] = sector
            details["sector_quota"] = f"{sector_count}/{max_per_sector}"
            details["your_score"] = round(composite, 3)
            details["min_selected_score"] = round(min_selected_score, 3)
            details["selected_in_sector"] = [s.get("name", "?")[:20] for s in selected_in_sector]
            return f"❌ Quota sectoriel atteint ({sector}: {sector_count}/{max_per_sector}), score {composite:.3f} < seuil {min_selected_score:.3f}", details
    
    # 7. Score composite insuffisant
    composite = asset.get("_composite_score") or 0
    details["composite_score"] = round(composite, 3)
    details["sector"] = sector
    
    return f"❌ Score composite insuffisant ({composite:.3f})", details


def generate_selection_explanation(
    all_equities: List[Dict],
    selected_equities: List[Dict],
    config: Dict = None,
    market_context: Dict = None,
    profile: str = "Modéré",
    output_path: str = "data/selection_explained.json",
) -> Dict:
    """
    Génère un fichier JSON expliquant la sélection des actions.
    
    v1.3.0: Added profile parameter for profile-aware analysis.
    """
    config = config or {}
    buffett_min_score = config.get("buffett_min_score", 40)
    
    # Apply sanity checks
    logger.info("🔧 Application du sanity check volatilité...")
    all_equities = _apply_volatility_sanity_check(all_equities)
    selected_equities = _apply_volatility_sanity_check(selected_equities)
    
    # Enrich with composite scores
    all_equities = enrich_with_composite_scores(all_equities)
    selected_equities = enrich_with_composite_scores(selected_equities)
    
    logger.info(f"📊 Scores composites calculés pour {len(all_equities)} actions")
    
    # Build selected IDs set
    selected_ids = set()
    selected_by_sector = {}
    
    for eq in selected_equities:
        eq_id = eq.get("id") or eq.get("ticker")
        selected_ids.add(eq_id)
        if eq.get("ticker"):
            selected_ids.add(eq.get("ticker"))
        if eq.get("name"):
            selected_ids.add(eq.get("name"))
        
        sector = eq.get("sector") or eq.get("_sector_key") or "Unknown"
        if sector not in selected_by_sector:
            selected_by_sector[sector] = []
        selected_by_sector[sector].append(eq)
    
    # Séparer par région et trier par market cap
    by_region = {"US": [], "Europe": [], "Asia": [], "Other": []}
    
    for eq in all_equities:
        country = eq.get("country") or eq.get("country_top") or ""
        region = get_region(country)
        
        mcap_raw = eq.get("market_cap") or eq.get("liquidity") or 0
        mcap_billions = parse_market_cap(mcap_raw)
        eq["_mcap_billions"] = mcap_billions
        eq["_region"] = region
        
        by_region[region].append(eq)
    
    for region in by_region:
        by_region[region].sort(key=lambda x: x.get("_mcap_billions", 0), reverse=True)
    
    # Analyser TOP 20 de chaque région
    top_by_region = {}
    
    for region, equities in by_region.items():
        if region == "Other":
            continue
            
        top_20 = equities[:20]
        analyzed = []
        
        for eq in top_20:
            name = eq.get("name") or eq.get("ticker") or "Unknown"
            ticker = eq.get("ticker") or "N/A"
            mcap = eq.get("_mcap_billions", 0)
            sector = eq.get("sector") or "Unknown"
            country = eq.get("country") or "Unknown"
            
            is_selected = (
                eq.get("id") in selected_ids or
                ticker in selected_ids or
                name in selected_ids
            )
            
            reason, details = analyze_rejection_reason(
                eq, selected_ids, selected_by_sector, buffett_min_score,
                profile=profile,
            )
            
            entry = {
                "rank": len(analyzed) + 1,
                "name": name,
                "ticker": ticker,
                "market_cap": format_market_cap(mcap),
                "market_cap_billions": round(mcap, 1),
                "sector": sector,
                "country": country,
                "selected": is_selected,
                "status": reason,
                "details": details,
            }
            
            if eq.get("_buffett_score") is not None:
                entry["buffett_score"] = round(eq["_buffett_score"], 1)
            
            composite = eq.get("_composite_score", 0)
            if composite > 0:
                entry["composite_score"] = round(composite, 3)
            
            # v1.3.0: Profile score
            if eq.get("_profile_score") is not None:
                entry["profile_score"] = round(eq["_profile_score"], 3)
            
            # v1.3.0: Matched preset
            if eq.get("_matched_preset"):
                entry["matched_preset"] = eq["_matched_preset"]
            
            if eq.get("roe"):
                roe_val = _safe_float(eq.get("roe"))
                entry["roe"] = roe_val
            if eq.get("de_ratio") is not None:
                entry["de_ratio"] = eq["de_ratio"]
            if eq.get("ytd") or eq.get("perf_ytd"):
                entry["ytd"] = eq.get("ytd") or eq.get("perf_ytd")
            
            # v1.3.0: Yield trap metrics
            if eq.get("dividend_yield") is not None:
                entry["dividend_yield"] = round(_safe_float(eq["dividend_yield"]), 2)
            if eq.get("payout_ratio") is not None:
                entry["payout_ratio"] = round(_safe_float(eq["payout_ratio"]), 1)
            if eq.get("dividend_coverage") is not None:
                entry["dividend_coverage"] = round(_safe_float(eq["dividend_coverage"]), 2)
            
            analyzed.append(entry)
        
        selected_count = sum(1 for a in analyzed if a["selected"])
        
        top_by_region[region] = {
            "total_in_universe": len(equities),
            "top_20_analyzed": len(analyzed),
            "selected_in_top_20": selected_count,
            "rejection_rate_top_20": f"{100 * (20 - selected_count) / 20:.0f}%",
            "stocks": analyzed,
        }
    
    # Build report
    report = {
        "generated_at": datetime.now().isoformat(),
        "version": "v1.3.0",
        "preset_meta_version": "v4.15.2",
        
        "selection_pipeline": SELECTION_PIPELINE,
        
        "config_used": {
            "buffett_mode": config.get("buffett_mode", "soft"),
            "buffett_min_score": buffett_min_score,
            "profile_analyzed": profile,
            "max_equities": 25,
            "max_per_sector": 4,
            "tactical_context_enabled": config.get("use_tactical_context", False),
            "volatility_sanity_check": True,
            "yield_trap_protection": True,
            "missing_data_strict": True,
        },
        
        "summary": {
            "total_universe": len(all_equities),
            "total_selected": len(selected_equities),
            "selection_rate": f"{100 * len(selected_equities) / max(1, len(all_equities)):.1f}%",
            "by_region": {
                region: {
                    "universe": len(equities),
                    "in_top_20_selected": top_by_region.get(region, {}).get("selected_in_top_20", 0),
                }
                for region, equities in by_region.items()
                if region != "Other"
            },
        },
        
        "sectors_distribution": {
            sector: {
                "selected_count": len(eqs),
                "selected_names": [e.get("name", "?")[:25] for e in eqs],
            }
            for sector, eqs in selected_by_sector.items()
        },
        
        "top_caps_by_region": top_by_region,
        
        "radar_context": None,
    }
    
    if market_context:
        report["radar_context"] = {
            "regime": market_context.get("market_regime"),
            "favored_sectors": market_context.get("macro_tilts", {}).get("favored_sectors", []),
            "avoided_sectors": market_context.get("macro_tilts", {}).get("avoided_sectors", []),
            "favored_regions": market_context.get("macro_tilts", {}).get("favored_regions", []),
            "avoided_regions": market_context.get("macro_tilts", {}).get("avoided_regions", []),
            "impact": "Les secteurs/régions favorisés reçoivent +15% sur leur score, les évités -15%",
        }
    
    # Save
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    logger.info(f"✅ Selection explanation saved: {output_path}")
    
    for region, data in top_by_region.items():
        selected = data["selected_in_top_20"]
        logger.info(f"   {region} TOP 20: {selected}/20 sélectionnés ({data['rejection_rate_top_20']} rejetés)")
    
    return report


def explain_top_caps_selection(
    eq_rows_initial: List[Dict],
    equities_final: List[Dict],
    config: Dict = None,
    market_context: Dict = None,
    profile: str = "Modéré",
    output_path: str = "data/selection_explained.json",
) -> str:
    """
    Fonction simple pour intégration dans generate_portfolios_v4.py
    
    v1.3.0: Added profile parameter.
    """
    report = generate_selection_explanation(
        all_equities=eq_rows_initial,
        selected_equities=equities_final,
        config=config,
        market_context=market_context,
        profile=profile,
        output_path=output_path,
    )
    
    return output_path
