#!/usr/bin/env python3
"""
selection_audit.py - Audit trail for asset selection decisions

Generates a detailed JSON report explaining:
- Which assets were selected and why (scores, rankings)
- Which assets were rejected and why (filters, thresholds)
- Filter statistics and thresholds used
- v1.5.0: FULL per-category rankings (ETF, equity, bond, crypto) for debugging

v1.5.0 - ADD: category_rankings – classement complet par catégorie (ETF, Actions, Obligations, Crypto)
v1.4.0 - ADD: ETF scoring diagnostic for flat score debugging
v1.3.1 - FIX: Capture composite_score and factor_scores for ETF/bond/crypto
v1.3.0 - Aligned with preset_meta v4.15.2 (vol_missing, yield-trap filters, missing data penalty)
v1.2.0 - Fixed ETF sector extraction from sector_top field
v1.1.0 - Added RADAR tilts normalization (sector/region mapping)
v1.0.0 - Initial version
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger("selection-audit")


# ============= PHASE 2: STABLE UID =============
def get_stable_uid(item: dict) -> str:
    """
    Génère un UID stable pour traçabilité cross-runs.
    Priorité: ISIN > ticker > symbol > name normalisé
    """
    for key in ["isin", "ticker", "symbol"]:
        val = item.get(key)
        if val is not None:
            val_str = str(val).strip()
            if val_str and val_str.lower() not in ["nan", "none", "", "null"]:
                return val_str
    
    # Fallback: name normalisé
    name = item.get("name", "UNKNOWN") or "UNKNOWN"
    return name.upper().replace(" ", "_").replace(",", "")[:50]


# ============= v1.2.0: NON-TILTABLE ETF BUCKETS =============
NON_TILTABLE_BUCKETS = {
    "ALT_ASSET_CRYPTO",
    "ALT_ASSET_COMMODITY",
    "SINGLE_STOCK",
    "SINGLE_STOCK_DERIVATIVE",
    "INDEX_DERIVATIVE",
    "STRUCTURED_VEHICLE",
    "DATA_MISSING",
    "NON_STANDARD",
}


# ============= v1.3.0: HARD FILTER REASONS (aligned with preset_meta v4.15.2) =============

HARD_FILTER_EXPLANATIONS = {
    "vol_missing": "Volatilité manquante (donnée non disponible)",
    "vol_aberrant": "Volatilité aberrante (< 1% ou > 120%)",
    "roe_missing": "ROE manquant (donnée non disponible)",
    "div_yield_missing": "Dividend yield manquant (donnée non disponible)",
    "payout_missing": "Payout ratio manquant (donnée non disponible)",
    "coverage_missing": "Dividend coverage manquant (donnée non disponible)",
}


def explain_hard_filter_reason(reason: str) -> str:
    if reason in HARD_FILTER_EXPLANATIONS:
        return HARD_FILTER_EXPLANATIONS[reason]
    if reason.startswith("vol<"):
        threshold = reason.replace("vol<", "")
        return f"Volatilité trop faible (< {threshold}%) - Profil trop défensif pour Agressif"
    if reason.startswith("vol>"):
        threshold = reason.replace("vol>", "")
        return f"Volatilité trop élevée (> {threshold}%) - Risque excessif"
    if reason.startswith("roe<"):
        threshold = reason.replace("roe<", "")
        return f"ROE insuffisant (< {threshold}%) - Qualité fondamentale faible"
    if reason.startswith("div<"):
        threshold = reason.replace("div<", "")
        return f"Dividend yield trop faible (< {threshold}%) - Profil rendement non atteint"
    if reason.startswith("payout>"):
        threshold = reason.replace("payout>", "")
        return f"Payout ratio excessif (> {threshold}%) - ⚠️ YIELD TRAP suspect"
    if reason.startswith("coverage<"):
        threshold = reason.replace("coverage<", "")
        return f"Dividend coverage insuffisant (< {threshold}x) - ⚠️ YIELD TRAP suspect"
    return reason


# ============= v1.1.0: RADAR TILTS NORMALIZATION =============

SECTOR_TO_RADAR = {
    "Technology": "information-technology",
    "Semiconductor": "information-technology",
    "Cybersecurity": "information-technology",
    "Internet": "communication-services",
    "Telecommunications": "communication-services",
    "Health Care": "healthcare",
    "Healthcare": "healthcare",
    "Pharmaceuticals": "healthcare",
    "Biotechnology": "healthcare",
    "Financial Services": "financials",
    "Financials": "financials",
    "Banks": "financials",
    "Insurance": "financials",
    "Consumer Discretionary": "consumer-discretionary",
    "Retail": "consumer-discretionary",
    "Travel & Leisure": "consumer-discretionary",
    "Automobiles & Parts": "consumer-discretionary",
    "Personal & Household Goods": "consumer-discretionary",
    "Food & Beverage": "consumer-staples",
    "Consumer Staples": "consumer-staples",
    "Consumer Defensive": "consumer-staples",
    "Energy": "energy",
    "Oil & Gas": "energy",
    "Industrials": "industrials",
    "Industrial": "industrials",
    "Transportation": "industrials",
    "Construction & Materials": "industrials",
    "Materials": "materials",
    "Basic Materials": "materials",
    "Basic Resources": "materials",
    "Chemicals": "materials",
    "Utilities": "utilities",
    "Smart Grid Infrastructure": "utilities",
    "Real Estate": "real-estate",
    "Technologie de l'information": "information-technology",
    "Santé": "healthcare",
    "Finance": "financials",
    "Biens de consommation cycliques": "consumer-discretionary",
    "Biens de consommation de base": "consumer-staples",
    "Energie": "energy",
    "Industries": "industrials",
    "Matériaux": "materials",
    "La communication": "communication-services",
    "Services publics": "utilities",
    "Immobilier": "real-estate",
    "Autres": "_other",
}

COUNTRY_TO_RADAR = {
    "Corée du Sud": "south-korea", "Corée": "south-korea", "South Korea": "south-korea",
    "Chine": "china", "China": "china",
    "Japon": "japan", "Japan": "japan",
    "Inde": "india", "India": "india",
    "Taiwan": "taiwan", "Taïwan": "taiwan",
    "Hong Kong": "hong-kong",
    "Singapour": "singapore", "Singapore": "singapore",
    "Allemagne": "germany", "Germany": "germany",
    "France": "france",
    "Royaume-Uni": "uk", "United Kingdom": "uk", "UK": "uk",
    "Italie": "italy", "Italy": "italy",
    "Espagne": "spain", "Spain": "spain",
    "Pays-Bas": "netherlands", "Netherlands": "netherlands",
    "Suisse": "switzerland", "Switzerland": "switzerland",
    "Etats-Unis": "usa", "États-Unis": "usa", "United States": "usa", "USA": "usa", "US": "usa",
    "Canada": "canada",
    "Brésil": "brazil", "Brazil": "brazil",
    "Australie": "australia", "Australia": "australia",
    "Israel": "israel", "Israël": "israel",
    "Asie": "", "Europe": "", "Zone Euro": "", "Global": "",
}


def normalize_sector_for_tilts(sector: str) -> str:
    if not sector:
        return ""
    sector_clean = sector.strip()
    if sector_clean in SECTOR_TO_RADAR:
        return SECTOR_TO_RADAR[sector_clean]
    sector_lower = sector_clean.lower()
    for key, value in SECTOR_TO_RADAR.items():
        if key.lower() == sector_lower:
            return value
    for key, value in SECTOR_TO_RADAR.items():
        if sector_lower in key.lower() or key.lower() in sector_lower:
            return value
    return sector_clean.lower().replace(" ", "-").replace("_", "-")


def normalize_region_for_tilts(country: str) -> str:
    if not country:
        return ""
    country_clean = country.strip()
    if country_clean in COUNTRY_TO_RADAR:
        return COUNTRY_TO_RADAR[country_clean]
    country_lower = country_clean.lower()
    for key, value in COUNTRY_TO_RADAR.items():
        if key.lower() == country_lower:
            return value
    return country_clean.lower().replace(" ", "-").replace("_", "-")


# ============= v1.2.0: ETF SECTOR EXTRACTION =============

def extract_etf_sector(asset: Dict) -> str:
    sector_signal_ok = asset.get("sector_signal_ok")
    if sector_signal_ok is not None:
        if not bool(int(sector_signal_ok) if isinstance(sector_signal_ok, (int, float, str)) else sector_signal_ok):
            return ""
    bucket = asset.get("sector_bucket", "")
    if bucket in NON_TILTABLE_BUCKETS:
        return ""
    sector_top = asset.get("sector_top")
    if sector_top:
        if isinstance(sector_top, dict):
            return sector_top.get("sector", "")
        elif isinstance(sector_top, str):
            if sector_top.lower() not in ["nan", "none", ""]:
                return sector_top
    sector = asset.get("sector") or asset.get("_sector_key")
    if sector and str(sector).lower() not in ["nan", "none", ""]:
        return sector
    return ""


# ============= DATACLASSES =============

@dataclass
class FilterStats:
    name: str
    threshold: Any
    input_count: int
    output_count: int
    rejected_count: int
    rejection_rate_pct: float = 0.0
    rejection_reasons: Dict[str, int] = field(default_factory=dict)
    def __post_init__(self):
        if self.input_count > 0:
            self.rejection_rate_pct = round(100 * self.rejected_count / self.input_count, 1)


@dataclass
class AssetAuditEntry:
    name: str
    ticker: Optional[str] = None
    category: str = "equity"
    profile: Optional[str] = None
    matched_preset: Optional[str] = None
    buffett_score: Optional[float] = None
    composite_score: Optional[float] = None
    profile_score: Optional[float] = None
    momentum_score: Optional[float] = None
    quality_score: Optional[float] = None
    factor_scores: Optional[Dict[str, float]] = None
    roe: Optional[str] = None
    de_ratio: Optional[float] = None
    market_cap: Optional[str] = None
    aum: Optional[str] = None
    volatility: Optional[float] = None
    ytd: Optional[str] = None
    sector: Optional[str] = None
    country: Optional[str] = None
    dividend_yield: Optional[float] = None
    payout_ratio: Optional[float] = None
    dividend_coverage: Optional[float] = None
    bond_quality_raw: Optional[float] = None
    bond_risk_bucket: Optional[str] = None
    ter: Optional[float] = None
    vol_30d_annual_pct: Optional[float] = None
    selected: bool = False
    ranking: Optional[int] = None
    selection_reason: Optional[str] = None
    rejection_reason: Optional[str] = None
    rejection_filter: Optional[str] = None
    rejection_details: List[str] = field(default_factory=list)
    radar_tilt: Optional[str] = None
    def to_dict(self) -> Dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


# ============= v1.5.0: CATEGORY RANKING ENTRY =============

@dataclass
class CategoryRankingEntry:
    """v1.5.0: Single entry in a per-category final ranking."""
    rank: int
    name: str
    ticker: Optional[str] = None
    composite_score: Optional[float] = None
    profile_score: Optional[float] = None
    buffett_score: Optional[float] = None
    factor_scores: Optional[Dict[str, float]] = None
    selected: bool = False
    rejection_reason: Optional[str] = None
    sector: Optional[str] = None
    country: Optional[str] = None
    volatility: Optional[float] = None
    ter: Optional[float] = None
    aum: Optional[str] = None
    credit_rating: Optional[str] = None
    duration: Optional[float] = None
    market_cap: Optional[str] = None
    roe: Optional[str] = None
    matched_preset: Optional[str] = None
    ytd: Optional[str] = None
    def to_dict(self) -> Dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


# ============= v1.4.0: ETF SCORING DEBUG =============

@dataclass
class ETFScoringComponentStats:
    name: str
    n_valid: int = 0
    n_nan: int = 0
    pct_valid: float = 0.0
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    mean_val: Optional[float] = None
    std_val: Optional[float] = None
    is_constant: bool = False
    def to_dict(self) -> Dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class ETFScoringDebug:
    profile: str
    stage_counts: Dict[str, int] = field(default_factory=dict)
    scoring_components: Dict[str, Dict] = field(default_factory=dict)
    score_stats: Dict[str, float] = field(default_factory=dict)
    is_flat: bool = False
    scoring_method: str = "rank_percentile"
    issues: List[str] = field(default_factory=list)
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class SelectionAuditReport:
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    version: str = "v1.5.0"
    preset_meta_version: str = "v4.15.2"
    summary: Dict[str, int] = field(default_factory=dict)
    profile_stats: Dict[str, Dict] = field(default_factory=dict)
    filters_applied: List[Dict] = field(default_factory=list)
    hard_filter_stats: Dict[str, Dict] = field(default_factory=dict)
    etf_scoring_debug: Dict[str, Dict] = field(default_factory=dict)
    category_rankings: Dict[str, List[Dict]] = field(default_factory=dict)
    equities_selected: List[Dict] = field(default_factory=list)
    equities_rejected: List[Dict] = field(default_factory=list)
    etf_selected: List[Dict] = field(default_factory=list)
    etf_rejected: List[Dict] = field(default_factory=list)
    crypto_selected: List[Dict] = field(default_factory=list)
    crypto_rejected: List[Dict] = field(default_factory=list)
    bonds_selected: List[Dict] = field(default_factory=list)
    bonds_rejected: List[Dict] = field(default_factory=list)
    radar_context: Optional[Dict] = None
    config: Dict = field(default_factory=dict)
    def to_dict(self) -> Dict:
        return asdict(self)


class SelectionAuditor:
    """
    v1.5.0: ADD: category_rankings – classement complet par catégorie.
    v1.4.0: ADD: ETF scoring diagnostic for flat score debugging.
    v1.3.1: FIX: Capture composite_score and factor_scores for ETF/bond/crypto.
    v1.3.0: Aligned with preset_meta v4.15.2.
    """

    def __init__(self, config: Dict = None):
        self.config = config or {}
        self.report = SelectionAuditReport()
        self.report.config = {
            "buffett_mode": self.config.get("buffett_mode", "soft"),
            "buffett_min_score": self.config.get("buffett_min_score", 40),
            "tactical_mode": self.config.get("tactical_mode", "radar"),
            "use_tactical_context": self.config.get("use_tactical_context", False),
            "preset_meta_version": "v4.15.2",
        }
        self._all_equities: List[Dict] = []
        self._all_etf: List[Dict] = []
        self._all_crypto: List[Dict] = []
        self._all_bonds: List[Dict] = []
        self._rejections: Dict[str, Dict] = {}
        self._stage_counts: Dict[str, int] = {}

    def set_radar_context(self, market_context: Dict):
        if market_context:
            self.report.radar_context = {
                "regime": market_context.get("market_regime"),
                "confidence": market_context.get("confidence"),
                "as_of": market_context.get("as_of"),
                "favored_sectors": market_context.get("macro_tilts", {}).get("favored_sectors", []),
                "avoided_sectors": market_context.get("macro_tilts", {}).get("avoided_sectors", []),
                "favored_regions": market_context.get("macro_tilts", {}).get("favored_regions", []),
                "avoided_regions": market_context.get("macro_tilts", {}).get("avoided_regions", []),
            }

    def track_initial_universe(self, assets: List[Dict], category: str = "equity"):
        count = len(assets)
        self._stage_counts[f"{category}_initial"] = count
        if category == "equity":
            self._all_equities = [self._enrich_asset(a, category) for a in assets]
        elif category == "etf":
            self._all_etf = [self._enrich_asset(a, category) for a in assets]
        elif category == "crypto":
            self._all_crypto = [self._enrich_asset(a, category) for a in assets]
        elif category == "bond":
            self._all_bonds = [self._enrich_asset(a, category) for a in assets]
        logger.info(f"📊 Audit: {category} initial universe = {count}")

    def track_filter(self, filter_name: str, category: str, before_count: int, after_count: int, rejected_assets: List[Dict] = None, threshold: Any = None, rejection_reasons: Dict[str, int] = None):
        rejected_count = before_count - after_count
        stats = FilterStats(name=filter_name, threshold=threshold, input_count=before_count, output_count=after_count, rejected_count=rejected_count, rejection_reasons=rejection_reasons or {})
        self.report.filters_applied.append(asdict(stats))
        self._stage_counts[f"{category}_after_{filter_name}"] = after_count
        if rejected_assets:
            for asset in rejected_assets:
                asset_id = self._get_asset_id(asset)
                self._rejections[asset_id] = {"filter": filter_name, "reason": self._get_rejection_reason(asset, filter_name), "threshold": threshold}
        logger.info(f"📊 Audit: {filter_name} on {category}: {before_count} → {after_count} (-{rejected_count}, {stats.rejection_rate_pct}%)")

    def track_etf_scoring_diagnostic(self, profile: str, stage_counts: Dict[str, int], scoring_components: Dict[str, Dict], score_stats: Dict[str, float], is_flat: bool, scoring_method: str):
        issues = self._identify_etf_scoring_issues(scoring_components, stage_counts, is_flat)
        self.report.etf_scoring_debug[profile] = {"stage_counts": stage_counts, "scoring_components": scoring_components, "score_stats": score_stats, "is_flat": is_flat, "scoring_method": scoring_method, "issues": issues, "root_cause": self._determine_root_cause(issues)}
        if issues:
            logger.warning(f"⚠️ [ETF {profile}] Scoring issues: {issues}")
        else:
            logger.info(f"✅ [ETF {profile}] Scoring OK: method={scoring_method}, stats={score_stats}")

    def _identify_etf_scoring_issues(self, components: Dict[str, Dict], stages: Dict[str, int], is_flat: bool) -> List[str]:
        issues = []
        if stages.get("presets", 0) == 0:
            issues.append("PRESETS_VIDE: 0 ETF après filtrage presets")
        elif stages.get("presets", 0) < 5:
            issues.append(f"UNIVERS_TROP_PETIT: seulement {stages.get('presets', 0)} ETF après presets")
        if stages.get("hard", 0) == 0:
            issues.append("HARD_CONSTRAINTS_TROP_STRICT: 0 ETF après hard constraints")
        if stages.get("qc", 0) == 0:
            issues.append("QC_TROP_STRICT: 0 ETF après data quality check")
        n_broken = 0
        for name, stats in components.items():
            pct_valid = stats.get("pct_valid", 0)
            std_val = stats.get("std", 0)
            if pct_valid == 0:
                issues.append(f"COLONNE_100%_NAN: {name}")
                n_broken += 1
            elif pct_valid < 20:
                issues.append(f"COLONNE_SPARSE: {name} ({pct_valid:.1f}% valide)")
            if std_val is not None and std_val < 1e-6 and pct_valid > 0:
                issues.append(f"VARIANCE_NULLE: {name} (toutes valeurs identiques)")
                n_broken += 1
        total_components = len(components)
        if total_components > 0 and n_broken >= total_components - 1:
            issues.append(f"COMPOSANTES_CASSEES: {n_broken}/{total_components} composantes inutilisables")
        if is_flat and "UNIVERS_TROP_PETIT" not in str(issues):
            issues.append("SCORE_PLAT: variance=0 après calcul (toutes valeurs identiques)")
        return issues

    def _determine_root_cause(self, issues: List[str]) -> str:
        if not issues:
            return "OK"
        if any("PRESETS_VIDE" in i for i in issues):
            return "PRESETS_TROP_RESTRICTIFS"
        if any("UNIVERS_TROP_PETIT" in i for i in issues):
            return "FILTRAGE_EXCESSIF"
        if any("HARD_CONSTRAINTS_TROP_STRICT" in i for i in issues):
            return "HARD_CONSTRAINTS_TROP_STRICT"
        if any("COLONNE_100%_NAN" in i for i in issues):
            return "COLONNES_MANQUANTES_CSV"
        if any("COMPOSANTES_CASSEES" in i for i in issues):
            return "DONNEES_CORROMPUES"
        if any("VARIANCE_NULLE" in i for i in issues):
            return "DONNEES_UNIFORMES"
        if any("SCORE_PLAT" in i for i in issues):
            return "SCORING_DEGENERE"
        return "MULTIPLE_ISSUES"

    def track_profile_hard_filters(self, profile: str, before: List[Dict], after: List[Dict], filter_stats: Dict):
        rejection_reasons = filter_stats.get("reasons", {})
        self.report.hard_filter_stats[profile] = {
            "before": filter_stats.get("before", len(before)),
            "after": filter_stats.get("after", len(after)),
            "rejected": filter_stats.get("rejected", len(before) - len(after)),
            "reasons": {reason: {"count": count, "explanation": explain_hard_filter_reason(reason)} for reason, count in rejection_reasons.items()},
        }
        after_ids = {self._get_asset_id(a) for a in after}
        rejected = [a for a in before if self._get_asset_id(a) not in after_ids]
        for asset in rejected:
            asset_id = self._get_asset_id(asset)
            asset_reasons = self._determine_rejection_reasons(asset, profile)
            self._rejections[asset_id] = {"filter": f"hard_filters_{profile}", "reason": "; ".join(asset_reasons), "threshold": f"Profile={profile}", "details": asset_reasons}
        self.track_filter(filter_name=f"hard_filters_{profile}", category="equity", before_count=len(before), after_count=len(after), rejected_assets=rejected, threshold=f"Profile={profile}", rejection_reasons=rejection_reasons)
        yield_trap_count = rejection_reasons.get("payout_missing", 0) + sum(v for k, v in rejection_reasons.items() if k.startswith("payout>")) + rejection_reasons.get("coverage_missing", 0) + sum(v for k, v in rejection_reasons.items() if k.startswith("coverage<"))
        if yield_trap_count > 0:
            logger.warning(f"⚠️ [{profile}] {yield_trap_count} yield traps détectés et filtrés")

    def _determine_rejection_reasons(self, asset: Dict, profile: str) -> List[str]:
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
                    if vol < 1 or vol > 120:
                        reasons.append("vol_aberrant")
                    if "volatility_3y_min" in filters and vol < filters["volatility_3y_min"]:
                        reasons.append(f"vol<{filters['volatility_3y_min']}")
                    if "volatility_3y_max" in filters and vol > filters["volatility_3y_max"]:
                        reasons.append(f"vol>{filters['volatility_3y_max']}")
            if "roe_min" in filters:
                if roe is None:
                    reasons.append("roe_missing")
                elif roe < filters["roe_min"]:
                    reasons.append(f"roe<{filters['roe_min']}")
            if "dividend_yield_min" in filters:
                if div_yield is None:
                    reasons.append("div_yield_missing")
                elif div_yield < filters["dividend_yield_min"]:
                    reasons.append(f"div<{filters['dividend_yield_min']}")
            if "payout_ratio_max" in filters:
                if payout is None:
                    reasons.append("payout_missing")
                elif payout > filters["payout_ratio_max"]:
                    reasons.append(f"payout>{filters['payout_ratio_max']}")
            if "dividend_coverage_min" in filters:
                if coverage is None:
                    reasons.append("coverage_missing")
                elif coverage < filters["dividend_coverage_min"]:
                    reasons.append(f"coverage<{filters['dividend_coverage_min']}")
        except ImportError:
            reasons.append("preset_meta_unavailable")
        return reasons if reasons else ["score_insuffisant"]

    def track_buffett_filter(self, before: List[Dict], after: List[Dict], min_score: int = 40):
        rejected = [a for a in before if a not in after]
        for asset in rejected:
            score = asset.get("_buffett_score") or asset.get("buffett_score") or 0
            reason = asset.get("_buffett_reject_reason") or f"Score {score} < {min_score}"
            asset["_rejection_reason"] = reason
        self.track_filter(filter_name="buffett", category="equity", before_count=len(before), after_count=len(after), rejected_assets=rejected, threshold=f"min_score={min_score}")

    def track_volatility_filter(self, category: str, before: List[Dict], after: List[Dict], max_vol: float = 60.0):
        rejected = [a for a in before if a not in after]
        for asset in rejected:
            vol = asset.get("vol") or asset.get("volatility_3y") or 0
            asset["_rejection_reason"] = f"Volatilité {vol}% > {max_vol}%"
        self.track_filter(filter_name="volatility", category=category, before_count=len(before), after_count=len(after), rejected_assets=rejected, threshold=f"max_vol={max_vol}%")

    def track_liquidity_filter(self, category: str, before: List[Dict], after: List[Dict], min_value: str = "1B"):
        rejected = [a for a in before if a not in after]
        for asset in rejected:
            mcap = asset.get("market_cap") or asset.get("aum") or "N/A"
            asset["_rejection_reason"] = f"Market cap/AUM {mcap} < {min_value}"
        self.track_filter(filter_name="liquidity", category=category, before_count=len(before), after_count=len(after), rejected_assets=rejected, threshold=f"min={min_value}")

    def record_profile_selection(self, profile: str, selected: List[Dict], all_candidates: List[Dict], selection_meta: Dict):
        self.report.profile_stats[profile] = {"selected_count": len(selected), "candidates_count": len(all_candidates), "stages": selection_meta.get("stages", {}), "stats": selection_meta.get("stats", {})}
        logger.info(f"📊 Audit: [{profile}] {len(selected)}/{len(all_candidates)} selected")

    # ============= v1.5.0: CATEGORY RANKINGS =============

    def record_category_ranking(self, category: str, all_candidates: List[Dict], selected: List[Dict], max_entries: int = 100):
        """v1.5.0: Record the FULL ranked list for a category."""
        selected_ids = set()
        for s in selected:
            sid = self._get_asset_id(s)
            selected_ids.add(sid)
            if s.get("ticker"):
                selected_ids.add(s["ticker"])
            if s.get("name"):
                selected_ids.add(s["name"])

        def _score_key(asset: Dict) -> float:
            for key in ["composite_score", "_composite_score", "_profile_score", "bond_quality_raw", "_buffett_score", "buffett_score"]:
                val = asset.get(key)
                if val is not None:
                    try:
                        return float(val)
                    except (TypeError, ValueError):
                        pass
            return 0.0

        sorted_candidates = sorted(all_candidates, key=_score_key, reverse=True)
        ranking_entries: List[Dict] = []
        for rank_idx, asset in enumerate(sorted_candidates[:max_entries], 1):
            asset_id = self._get_asset_id(asset)
            is_selected = (asset_id in selected_ids or asset.get("ticker") in selected_ids or asset.get("name") in selected_ids)
            entry = CategoryRankingEntry(
                rank=rank_idx,
                name=asset.get("name") or asset.get("ticker") or "Unknown",
                ticker=asset.get("ticker") or asset.get("symbol"),
                composite_score=self._safe_round(asset.get("composite_score") or asset.get("_composite_score"), 4),
                profile_score=self._safe_round(asset.get("_profile_score"), 4),
                buffett_score=self._safe_round(asset.get("_buffett_score") or asset.get("buffett_score"), 1),
                selected=is_selected,
                matched_preset=asset.get("_matched_preset"),
            )
            fs = asset.get("factor_scores")
            if fs and isinstance(fs, dict):
                entry.factor_scores = {k: round(float(v), 3) for k, v in fs.items() if v is not None and k != "_meta"}
            if not is_selected:
                if asset_id in self._rejections:
                    entry.rejection_reason = self._rejections[asset_id].get("reason", "")
                else:
                    entry.rejection_reason = "Score insuffisant ou quota atteint"
            if category == "etf":
                entry.sector = extract_etf_sector(asset) or None
            else:
                entry.sector = asset.get("sector") or asset.get("_sector_key") or None
            entry.country = asset.get("country") or None
            for vk in ["vol", "volatility_3y", "vol_3y", "vol_pct", "vol_30d_annual_pct", "vol_7d_annual_pct"]:
                v = asset.get(vk)
                if v is not None:
                    try:
                        entry.volatility = round(float(v), 1)
                        break
                    except (TypeError, ValueError):
                        pass
            ytd_val = asset.get("ytd") or asset.get("perf_ytd")
            if ytd_val is not None:
                entry.ytd = f"{ytd_val}%" if isinstance(ytd_val, (int, float)) else str(ytd_val)
            if category == "etf":
                entry.ter = self._safe_round(asset.get("ter"), 3)
                aum = asset.get("aum")
                if aum:
                    entry.aum = self._format_market_cap(aum)
            elif category == "bond":
                entry.credit_rating = asset.get("credit_rating") or None
                entry.duration = self._safe_round(asset.get("duration"), 2)
                aum = asset.get("aum") or asset.get("market_cap")
                if aum:
                    entry.aum = self._format_market_cap(aum)
            elif category == "equity":
                roe = asset.get("roe")
                if roe is not None:
                    entry.roe = f"{roe}%" if isinstance(roe, (int, float)) else str(roe)
                mcap = asset.get("market_cap")
                if mcap:
                    entry.market_cap = self._format_market_cap(mcap)
            elif category == "crypto":
                mcap = asset.get("market_cap")
                if mcap:
                    entry.market_cap = self._format_market_cap(mcap)
            ranking_entries.append(entry.to_dict())
        self.report.category_rankings[category] = ranking_entries
        n_sel = sum(1 for e in ranking_entries if e.get("selected"))
        logger.info(f"📊 Audit v1.5.0: {category} ranking recorded – {len(ranking_entries)} entries, {n_sel} selected")

    @staticmethod
    def _safe_round(value, decimals: int = 2) -> Optional[float]:
        if value is None:
            return None
        try:
            return round(float(value), decimals)
        except (TypeError, ValueError):
            return None

    def record_final_selection(self, selected: List[Dict], all_candidates: List[Dict], category: str = "equity", top_selected: int = 50, top_rejected: int = 50):
        selected_ids = {self._get_asset_id(a) for a in selected}
        selected_entries = []
        for i, asset in enumerate(selected[:top_selected], 1):
            entry = self._create_audit_entry(asset, category)
            entry["selected"] = True
            entry["ranking"] = i
            entry["selection_reason"] = self._get_selection_reason(asset, category)
            selected_entries.append(entry)
        rejected = [a for a in all_candidates if self._get_asset_id(a) not in selected_ids]
        rejected_sorted = self._sort_by_importance(rejected, category)
        rejected_entries = []
        for asset in rejected_sorted[:top_rejected]:
            entry = self._create_audit_entry(asset, category)
            entry["selected"] = False
            asset_id = self._get_asset_id(asset)
            if asset_id in self._rejections:
                entry["rejection_reason"] = self._rejections[asset_id]["reason"]
                entry["rejection_filter"] = self._rejections[asset_id]["filter"]
                if "details" in self._rejections[asset_id]:
                    entry["rejection_details"] = [explain_hard_filter_reason(r) for r in self._rejections[asset_id]["details"]]
            else:
                entry["rejection_reason"] = "Non sélectionné (score insuffisant ou quota atteint)"
            rejected_entries.append(entry)
        if category == "equity":
            self.report.equities_selected = selected_entries
            self.report.equities_rejected = rejected_entries
        elif category == "etf":
            self.report.etf_selected = selected_entries
            self.report.etf_rejected = rejected_entries
        elif category == "crypto":
            self.report.crypto_selected = selected_entries
            self.report.crypto_rejected = rejected_entries
        elif category == "bond":
            self.report.bonds_selected = selected_entries
            self.report.bonds_rejected = rejected_entries
        self.record_category_ranking(category=category, all_candidates=all_candidates, selected=selected)
        logger.info(f"📊 Audit: {category} final - {len(selected_entries)} selected, {len(rejected_entries)} notable rejected")

    def generate_report(self) -> SelectionAuditReport:
        self.report.summary = {
            "equities_initial": self._stage_counts.get("equity_initial", 0),
            "equities_selected": len(self.report.equities_selected),
            "equities_rejected_notable": len(self.report.equities_rejected),
            "etf_initial": self._stage_counts.get("etf_initial", 0),
            "etf_selected": len(self.report.etf_selected),
            "etf_rejected_notable": len(self.report.etf_rejected),
            "crypto_initial": self._stage_counts.get("crypto_initial", 0),
            "crypto_selected": len(self.report.crypto_selected),
            "crypto_rejected_notable": len(self.report.crypto_rejected),
            "bonds_initial": self._stage_counts.get("bond_initial", 0),
            "bonds_selected": len(self.report.bonds_selected),
            "total_filters_applied": len(self.report.filters_applied),
            "etf_scoring_issues": sum(len(d.get("issues", [])) for d in self.report.etf_scoring_debug.values()),
            "category_rankings_sizes": {cat: len(entries) for cat, entries in self.report.category_rankings.items()},
        }
        return self.report

    def save_report(self, output_path: str = "data/selection_audit.json"):
        report = self.generate_report()
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(report.to_dict(), f, ensure_ascii=False, indent=2)
        logger.info(f"✅ Selection audit saved: {output_path}")
        return output_path

    def _get_asset_id(self, asset: Dict) -> str:
        return asset.get("id") or asset.get("ticker") or asset.get("symbol") or asset.get("name") or str(id(asset))

    def _enrich_asset(self, asset: Dict, category: str) -> Dict:
        asset = asset.copy()
        asset["_category"] = category
        return asset

    def _create_audit_entry(self, asset: Dict, category: str) -> Dict:
        entry = {"name": asset.get("name") or asset.get("ticker") or "Unknown", "ticker": asset.get("ticker") or asset.get("symbol"), "category": category}
        if asset.get("_matched_preset"):
            entry["matched_preset"] = asset["_matched_preset"]
        if asset.get("_buffett_score") is not None:
            entry["buffett_score"] = round(asset["_buffett_score"], 1)
        elif asset.get("buffett_score") is not None:
            entry["buffett_score"] = round(asset["buffett_score"], 1)
        composite = asset.get("composite_score") or asset.get("_composite_score")
        if composite is not None:
            try:
                entry["composite_score"] = round(float(composite), 3)
            except (TypeError, ValueError):
                pass
        if asset.get("_profile_score") is not None:
            entry["profile_score"] = round(asset["_profile_score"], 3)
        if asset.get("_momentum_score") is not None:
            entry["momentum_score"] = round(asset["_momentum_score"], 2)
        if asset.get("_quality_score") is not None:
            entry["quality_score"] = round(asset["_quality_score"], 2)
        if category in ["etf", "bond", "crypto"]:
            factor_scores = asset.get("factor_scores") or {}
            if factor_scores and isinstance(factor_scores, dict):
                entry["factor_scores"] = {k: round(float(v), 3) for k, v in factor_scores.items() if v is not None and k not in ["_meta"]}
            if category == "bond":
                if asset.get("bond_quality_raw") is not None:
                    try:
                        entry["bond_quality_raw"] = round(float(asset["bond_quality_raw"]), 1)
                    except (TypeError, ValueError):
                        pass
                if asset.get("bond_risk_bucket"):
                    entry["bond_risk_bucket"] = str(asset["bond_risk_bucket"])
                if asset.get("credit_rating"):
                    entry["credit_rating"] = str(asset["credit_rating"])
                if asset.get("duration") is not None:
                    try:
                        entry["duration"] = round(float(asset["duration"]), 2)
                    except (TypeError, ValueError):
                        pass
            if category == "etf":
                if asset.get("ter") is not None:
                    try:
                        entry["ter"] = round(float(asset["ter"]), 3)
                    except (TypeError, ValueError):
                        pass
                if asset.get("aum"):
                    entry["aum"] = self._format_market_cap(asset["aum"])
                if asset.get("tracking_error") is not None:
                    try:
                        entry["tracking_error"] = round(float(asset["tracking_error"]), 3)
                    except (TypeError, ValueError):
                        pass
            if category == "crypto":
                for vol_key in ["vol_30d_annual_pct", "vol_7d_annual_pct", "vol_pct"]:
                    if asset.get(vol_key) is not None:
                        try:
                            entry["volatility"] = round(float(asset[vol_key]), 1)
                            break
                        except (TypeError, ValueError):
                            pass
                if asset.get("market_cap"):
                    entry["market_cap"] = self._format_market_cap(asset["market_cap"])
        if asset.get("roe"):
            roe = asset["roe"]
            entry["roe"] = f"{roe}%" if isinstance(roe, (int, float)) else str(roe)
        if asset.get("de_ratio") is not None:
            try:
                entry["de_ratio"] = round(float(asset["de_ratio"]), 2)
            except (TypeError, ValueError):
                pass
        if asset.get("market_cap") and "market_cap" not in entry:
            entry["market_cap"] = self._format_market_cap(asset["market_cap"])
        if asset.get("aum") and "aum" not in entry:
            entry["aum"] = self._format_market_cap(asset["aum"])
        if "volatility" not in entry:
            for vol_key in ["vol", "volatility_3y", "vol_3y", "vol_3y_pct", "vol_pct"]:
                vol = asset.get(vol_key)
                if vol is not None:
                    try:
                        entry["volatility"] = round(float(vol), 1)
                        break
                    except (TypeError, ValueError):
                        pass
        if asset.get("ytd") or asset.get("perf_ytd"):
            ytd = asset.get("ytd") or asset.get("perf_ytd")
            entry["ytd"] = f"{ytd}%" if isinstance(ytd, (int, float)) else str(ytd)
        if asset.get("dividend_yield") is not None:
            try:
                entry["dividend_yield"] = round(float(asset["dividend_yield"]), 2)
            except (TypeError, ValueError):
                pass
        if asset.get("payout_ratio") is not None:
            try:
                entry["payout_ratio"] = round(float(asset["payout_ratio"]), 1)
            except (TypeError, ValueError):
                pass
        if asset.get("dividend_coverage") is not None:
            try:
                entry["dividend_coverage"] = round(float(asset["dividend_coverage"]), 2)
            except (TypeError, ValueError):
                pass
        if category == "etf":
            sector_raw = extract_etf_sector(asset)
        else:
            sector_raw = asset.get("sector") or asset.get("_sector_key") or ""
        entry["sector"] = sector_raw if sector_raw else None
        entry["country"] = asset.get("country")
        if self.report.radar_context:
            region_raw = entry.get("country") or ""
            sector_normalized = normalize_sector_for_tilts(sector_raw) if sector_raw else ""
            region_normalized = normalize_region_for_tilts(region_raw)
            favored_sectors = self.report.radar_context.get("favored_sectors", [])
            avoided_sectors = self.report.radar_context.get("avoided_sectors", [])
            favored_regions = self.report.radar_context.get("favored_regions", [])
            avoided_regions = self.report.radar_context.get("avoided_regions", [])
            sector_tilt = "neutral"
            region_tilt = "neutral"
            if sector_normalized and sector_normalized in favored_sectors:
                sector_tilt = "favored"
            elif sector_normalized and sector_normalized in avoided_sectors:
                sector_tilt = "avoided"
            if region_normalized and region_normalized in favored_regions:
                region_tilt = "favored"
            elif region_normalized and region_normalized in avoided_regions:
                region_tilt = "avoided"
            if sector_tilt == "favored" or region_tilt == "favored":
                entry["radar_tilt"] = "favored"
            elif sector_tilt == "avoided" or region_tilt == "avoided":
                entry["radar_tilt"] = "avoided"
            else:
                entry["radar_tilt"] = "neutral"
        return {k: v for k, v in entry.items() if v is not None}

    def _get_selection_reason(self, asset: Dict, category: str) -> str:
        reasons = []
        buffett = asset.get("_buffett_score") or asset.get("buffett_score")
        if buffett and buffett >= 70:
            reasons.append(f"Qualité Buffett excellente ({buffett:.0f})")
        elif buffett and buffett >= 50:
            reasons.append(f"Qualité Buffett solide ({buffett:.0f})")
        profile_score = asset.get("_profile_score")
        if profile_score and profile_score >= 0.7:
            reasons.append(f"Score profil élevé ({profile_score:.2f})")
        preset = asset.get("_matched_preset")
        if preset:
            reasons.append(f"Preset: {preset}")
        composite = asset.get("composite_score") or asset.get("_composite_score")
        if composite is not None and category in ["etf", "bond", "crypto"]:
            try:
                composite_val = float(composite)
                if composite_val >= 0.3:
                    reasons.append(f"Score composite élevé ({composite_val:.2f})")
                elif composite_val >= 0:
                    reasons.append(f"Score composite positif ({composite_val:.2f})")
            except (TypeError, ValueError):
                pass
        if category == "bond" and asset.get("bond_quality_raw"):
            try:
                bq = float(asset["bond_quality_raw"])
                if bq >= 70:
                    reasons.append(f"Qualité obligataire excellente ({bq:.0f})")
                elif bq >= 50:
                    reasons.append(f"Qualité obligataire solide ({bq:.0f})")
            except (TypeError, ValueError):
                pass
        roe = asset.get("roe")
        if roe:
            try:
                roe_val = float(str(roe).replace("%", ""))
                if roe_val >= 20:
                    reasons.append(f"ROE élevé ({roe_val:.0f}%)")
            except:
                pass
        if self.report.radar_context:
            if category == "etf":
                sector_raw = extract_etf_sector(asset)
            else:
                sector_raw = asset.get("sector") or asset.get("_sector_key") or ""
            region_raw = asset.get("country") or ""
            sector_normalized = normalize_sector_for_tilts(sector_raw) if sector_raw else ""
            region_normalized = normalize_region_for_tilts(region_raw)
            favored_sectors = self.report.radar_context.get("favored_sectors", [])
            favored_regions = self.report.radar_context.get("favored_regions", [])
            if sector_normalized in favored_sectors:
                reasons.append(f"Secteur favorisé RADAR ({sector_normalized})")
            if region_normalized in favored_regions:
                reasons.append(f"Région favorisée RADAR ({region_normalized})")
        momentum = asset.get("_momentum_score")
        if momentum and momentum > 0.7:
            reasons.append("Momentum fort")
        if not reasons:
            reasons.append("Score composite favorable")
        return "; ".join(reasons)

    def _get_rejection_reason(self, asset: Dict, filter_name: str) -> str:
        if asset.get("_rejection_reason"):
            return asset["_rejection_reason"]
        if asset.get("_buffett_reject_reason"):
            return asset["_buffett_reject_reason"]
        if filter_name == "buffett":
            score = asset.get("_buffett_score") or 0
            return f"Score Buffett insuffisant ({score:.0f})"
        if filter_name == "volatility":
            vol = asset.get("vol") or asset.get("volatility_3y") or 0
            return f"Volatilité trop élevée ({vol}%)"
        if filter_name == "liquidity":
            mcap = asset.get("market_cap") or "N/A"
            return f"Liquidité insuffisante (Market cap: {mcap})"
        return f"Filtré par {filter_name}"

    def _sort_by_importance(self, assets: List[Dict], category: str) -> List[Dict]:
        def get_sort_key(asset):
            if category in ["equity", "crypto"]:
                mcap = asset.get("market_cap") or "0"
                return self._parse_market_cap(mcap)
            elif category in ["etf", "bond"]:
                aum = asset.get("aum") or asset.get("market_cap") or "0"
                return self._parse_market_cap(aum)
            return 0
        return sorted(assets, key=get_sort_key, reverse=True)

    def _parse_market_cap(self, value) -> float:
        if isinstance(value, (int, float)):
            return float(value)
        if not isinstance(value, str):
            return 0
        value = value.upper().strip()
        multipliers = {"T": 1e12, "B": 1e9, "M": 1e6, "K": 1e3}
        for suffix, mult in multipliers.items():
            if suffix in value:
                try:
                    num = float(value.replace(suffix, "").replace("$", "").replace(",", "").strip())
                    return num * mult
                except:
                    return 0
        try:
            return float(value.replace("$", "").replace(",", ""))
        except:
            return 0

    def _format_market_cap(self, value) -> str:
        if isinstance(value, str):
            return value
        if isinstance(value, (int, float)):
            if value >= 1e12:
                return f"{value/1e12:.1f}T"
            elif value >= 1e9:
                return f"{value/1e9:.1f}B"
            elif value >= 1e6:
                return f"{value/1e6:.1f}M"
            else:
                return f"{value:.0f}"
        return str(value)


def create_selection_audit(config: Dict, equities_initial: List[Dict], equities_after_buffett: List[Dict], equities_final: List[Dict], etf_data: List[Dict] = None, etf_selected: List[Dict] = None, crypto_data: List[Dict] = None, crypto_selected: List[Dict] = None, bonds_data: List[Dict] = None, bonds_selected: List[Dict] = None, market_context: Dict = None, profile_selections: Dict[str, Dict] = None, etf_scoring_debug: Dict[str, Dict] = None, output_path: str = "data/selection_audit.json") -> str:
    auditor = SelectionAuditor(config)
    if market_context:
        auditor.set_radar_context(market_context)
    auditor.track_initial_universe(equities_initial, "equity")
    auditor.track_buffett_filter(before=equities_initial, after=equities_after_buffett, min_score=config.get("buffett_min_score", 40))
    if profile_selections:
        for profile, data in profile_selections.items():
            if "before" in data and "after" in data:
                auditor.track_profile_hard_filters(profile=profile, before=data["before"], after=data["after"], filter_stats=data.get("stats", {}))
            if "selected" in data and "meta" in data:
                auditor.record_profile_selection(profile=profile, selected=data["selected"], all_candidates=data.get("candidates", []), selection_meta=data["meta"])
    auditor.record_final_selection(selected=equities_final, all_candidates=equities_initial, category="equity", top_selected=50, top_rejected=50)
    if etf_data:
        auditor.track_initial_universe(etf_data, "etf")
        if etf_scoring_debug:
            for profile, debug_data in etf_scoring_debug.items():
                auditor.track_etf_scoring_diagnostic(profile=profile, stage_counts=debug_data.get("stage_counts", {}), scoring_components=debug_data.get("scoring_components", {}), score_stats=debug_data.get("score_stats", {}), is_flat=debug_data.get("is_flat", False), scoring_method=debug_data.get("scoring_method", "unknown"))
        auditor.record_final_selection(selected=etf_selected or [], all_candidates=etf_data, category="etf", top_selected=30, top_rejected=20)
    if crypto_data:
        auditor.track_initial_universe(crypto_data, "crypto")
        auditor.record_final_selection(selected=crypto_selected or [], all_candidates=crypto_data, category="crypto", top_selected=10, top_rejected=10)
    if bonds_data:
        auditor.track_initial_universe(bonds_data, "bond")
        auditor.record_final_selection(selected=bonds_selected or [], all_candidates=bonds_data, category="bond", top_selected=20, top_rejected=10)
    return auditor.save_report(output_path)
