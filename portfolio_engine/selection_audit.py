#!/usr/bin/env python3
"""
selection_audit.py - Audit trail for asset selection decisions

Generates a detailed JSON report explaining:
- Which assets were selected and why (scores, rankings)
- Which assets were rejected and why (filters, thresholds)
- Filter statistics and thresholds used
- v1.6.0: REFACTOR – factored _build_ranking_entry, use get_stable_uid, anomaly guard-rails
- v1.5.2: ADD: preset_rankings – top 10 per preset (value_dividend, quality_premium, etc.)
- v1.5.1: FIX: Robust rejection reasons + sort_score_source diagnostic
- v1.5.0: FULL per-category rankings (ETF, equity, bond, crypto) for debugging

v1.6.0 - REFACTOR:
  1. Guard-rail: warn when >80% assets are non_classé (detects HAS_MODULAR_SELECTORS=False)
  2. Use get_stable_uid() everywhere instead of fragile _get_asset_id()
  3. Factor _build_ranking_entry() shared by record_category_ranking + record_preset_rankings
  4. Move preset_meta import to module level with fallback
  5. Fix _format_market_cap suffix detection (avoid "BANK" → "B" false positive)
v1.5.2 - ADD: preset_rankings – top 10 par preset
v1.5.1 - FIX: Robust rejection reason lookup + sort_score_source + deduced reasons
v1.5.0 - ADD: category_rankings – classement complet par catégorie
v1.4.0 - ADD: ETF scoring diagnostic for flat score debugging
v1.3.1 - FIX: Capture composite_score and factor_scores for ETF/bond/crypto
v1.3.0 - Aligned with preset_meta v4.15.2
v1.2.0 - Fixed ETF sector extraction from sector_top field
v1.1.0 - Added RADAR tilts normalization
v1.0.0 - Initial version
"""

import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field, asdict

logger = logging.getLogger("selection-audit")


# ============= v1.6.0: MODULE-LEVEL PRESET_META IMPORT =============
# Moved from _determine_rejection_reasons() inner import to avoid
# repeated import overhead inside loops (~3000 calls per run).
try:
    from .preset_meta import get_profile_policy, get_metric_value
    HAS_PRESET_META = True
except ImportError:
    HAS_PRESET_META = False
    get_profile_policy = None
    get_metric_value = None


# ============= PHASE 2: STABLE UID =============
def get_stable_uid(item: dict, category: str = "") -> str:
    """
    Génère un UID stable pour traçabilité cross-runs.
    Priorité: ISIN > ticker > symbol > name normalisé.
    
    v1.6.0: Added optional category prefix to avoid cross-category collisions
    (e.g. ticker "BTC" in crypto vs ETF crypto tracker).
    """
    prefix = f"{category}:" if category else ""
    
    for key in ["isin", "ticker", "symbol"]:
        val = item.get(key)
        if val is not None:
            val_str = str(val).strip()
            if val_str and val_str.lower() not in ["nan", "none", "", "null"]:
                return f"{prefix}{val_str}"
    
    # Fallback: name normalisé
    name = item.get("name", "UNKNOWN") or "UNKNOWN"
    return f"{prefix}{name.upper().replace(' ', '_').replace(',', '')[:50]}"


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


# ============= v1.3.0: HARD FILTER REASONS =============

HARD_FILTER_EXPLANATIONS = {
    "vol_missing": "Volatilité manquante (donnée non disponible)",
    "vol_aberrant": "Volatilité aberrante (< 1% ou > 120%)",
    "roe_missing": "ROE manquant (donnée non disponible)",
    "div_yield_missing": "Dividend yield manquant (donnée non disponible)",
    "payout_missing": "Payout ratio manquant (donnée non disponible)",
    "coverage_missing": "Dividend coverage manquant (donnée non disponible)",
}


def explain_hard_filter_reason(reason: str) -> str:
    """v1.3.0: Génère une explication lisible pour un code de rejet."""
    if reason in HARD_FILTER_EXPLANATIONS:
        return HARD_FILTER_EXPLANATIONS[reason]
    
    _DYNAMIC_PATTERNS = [
        ("vol<",     lambda t: f"Volatilité trop faible (< {t}%) - Profil trop défensif pour Agressif"),
        ("vol>",     lambda t: f"Volatilité trop élevée (> {t}%) - Risque excessif"),
        ("roe<",     lambda t: f"ROE insuffisant (< {t}%) - Qualité fondamentale faible"),
        ("div<",     lambda t: f"Dividend yield trop faible (< {t}%) - Profil rendement non atteint"),
        ("payout>",  lambda t: f"Payout ratio excessif (> {t}%) - ⚠️ YIELD TRAP suspect"),
        ("coverage<", lambda t: f"Dividend coverage insuffisant (< {t}x) - ⚠️ YIELD TRAP suspect"),
    ]
    
    for prefix, formatter in _DYNAMIC_PATTERNS:
        if reason.startswith(prefix):
            return formatter(reason[len(prefix):])
    
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
    # FR mappings
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
    """v1.1.0: Normalise un secteur vers le format RADAR."""
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
    """v1.1.0: Normalise un pays vers le format RADAR."""
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
    """v1.2.0: Extract sector from ETF asset."""
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


# ============= v1.6.0: SHARED UTILITIES =============

_SCORE_PRIORITY_KEYS = [
    "composite_score", "_composite_score",
    "_profile_score",
    "bond_quality_raw",
    "_buffett_score", "buffett_score",
]


def _score_with_source(asset: Dict) -> Tuple[float, str]:
    """v1.6.0: Extract best available score + its source field name."""
    for key in _SCORE_PRIORITY_KEYS:
        val = asset.get(key)
        if val is not None:
            try:
                return float(val), key
            except (TypeError, ValueError):
                pass
    return 0.0, "none"


# v1.6.0 FIX: regex anchored to end-of-string to avoid "BANK" → "B" false positive
_MCAP_PATTERN = re.compile(r'^[\$\s]*([\d,.]+)\s*([TBMK])\s*$', re.IGNORECASE)
_MCAP_MULTIPLIERS = {"T": 1e12, "B": 1e9, "M": 1e6, "K": 1e3}


def _parse_market_cap(value) -> float:
    """Parse market cap string to float. v1.6.0: fixed suffix detection."""
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return 0.0
    m = _MCAP_PATTERN.match(value.strip())
    if m:
        try:
            return float(m.group(1).replace(",", "")) * _MCAP_MULTIPLIERS[m.group(2).upper()]
        except (ValueError, KeyError):
            return 0.0
    try:
        return float(value.replace("$", "").replace(",", "").strip())
    except (ValueError, TypeError):
        return 0.0


def _format_market_cap(value) -> str:
    """Format market cap for display."""
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


def _safe_round(value, decimals: int = 2) -> Optional[float]:
    """Round a value safely, returning None if not a number."""
    if value is None:
        return None
    try:
        return round(float(value), decimals)
    except (TypeError, ValueError):
        return None


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


@dataclass
class CategoryRankingEntry:
    rank: int
    name: str
    ticker: Optional[str] = None
    sort_score: Optional[float] = None
    sort_score_source: Optional[str] = None
    composite_score: Optional[float] = None
    profile_score: Optional[float] = None
    buffett_score: Optional[float] = None
    factor_scores: Optional[Dict[str, float]] = None
    selected: bool = False
    rejection_reason: Optional[str] = None
    rejection_filter: Optional[str] = None
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
    version: str = "v1.6.0"
    preset_meta_version: str = "v4.15.2"
    summary: Dict[str, int] = field(default_factory=dict)
    profile_stats: Dict[str, Dict] = field(default_factory=dict)
    filters_applied: List[Dict] = field(default_factory=list)
    hard_filter_stats: Dict[str, Dict] = field(default_factory=dict)
    etf_scoring_debug: Dict[str, Dict] = field(default_factory=dict)
    category_rankings: Dict[str, List[Dict]] = field(default_factory=dict)
    preset_rankings: Dict[str, List[Dict]] = field(default_factory=dict)
    anomaly_warnings: List[str] = field(default_factory=list)
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
    Tracks and records asset selection decisions throughout the pipeline.
    
    v1.6.0: REFACTOR – get_stable_uid, _build_ranking_entry, anomaly guard-rails.
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

    # ============= v1.6.0: STABLE UID =============

    def _uid(self, asset: Dict, category: str = "") -> str:
        """v1.6.0: Stable UID with category prefix. Replaces _get_asset_id."""
        return get_stable_uid(asset, category)
    
    def _uid_set(self, assets: List[Dict], category: str = "") -> set:
        """v1.6.0: Build set of UIDs + raw identifiers for matching."""
        ids = set()
        for a in assets:
            ids.add(self._uid(a, category))
            for key in ["ticker", "symbol", "name", "etfsymbol"]:
                val = a.get(key)
                if val:
                    ids.add(str(val))
        return ids

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
        store = {"equity": "_all_equities", "etf": "_all_etf", "crypto": "_all_crypto", "bond": "_all_bonds"}
        attr = store.get(category)
        if attr:
            setattr(self, attr, [self._enrich_asset(a, category) for a in assets])
        logger.info(f"📊 Audit: {category} initial universe = {count}")

    def track_filter(self, filter_name, category, before_count, after_count, rejected_assets=None, threshold=None, rejection_reasons=None):
        rejected_count = before_count - after_count
        stats = FilterStats(name=filter_name, threshold=threshold, input_count=before_count, output_count=after_count, rejected_count=rejected_count, rejection_reasons=rejection_reasons or {})
        self.report.filters_applied.append(asdict(stats))
        self._stage_counts[f"{category}_after_{filter_name}"] = after_count
        if rejected_assets:
            for asset in rejected_assets:
                uid = self._uid(asset, category)
                self._rejections[uid] = {"filter": filter_name, "reason": self._get_rejection_reason(asset, filter_name), "threshold": threshold}
        logger.info(f"📊 Audit: {filter_name} on {category}: {before_count} → {after_count} (-{rejected_count}, {stats.rejection_rate_pct}%)")

    # ============= ETF SCORING DIAGNOSTIC =============

    def track_etf_scoring_diagnostic(self, profile, stage_counts, scoring_components, score_stats, is_flat, scoring_method):
        issues = self._identify_etf_scoring_issues(scoring_components, stage_counts, is_flat)
        self.report.etf_scoring_debug[profile] = {
            "stage_counts": stage_counts, "scoring_components": scoring_components,
            "score_stats": score_stats, "is_flat": is_flat, "scoring_method": scoring_method,
            "issues": issues, "root_cause": self._determine_root_cause(issues),
        }
        if issues:
            logger.warning(f"⚠️ [ETF {profile}] Scoring issues: {issues}")
        else:
            logger.info(f"✅ [ETF {profile}] Scoring OK: method={scoring_method}")

    def _identify_etf_scoring_issues(self, components, stages, is_flat):
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
        if len(components) > 0 and n_broken >= len(components) - 1:
            issues.append(f"COMPOSANTES_CASSEES: {n_broken}/{len(components)} composantes inutilisables")
        if is_flat and "UNIVERS_TROP_PETIT" not in str(issues):
            issues.append("SCORE_PLAT: variance=0 après calcul")
        return issues

    def _determine_root_cause(self, issues):
        if not issues:
            return "OK"
        for pattern, cause in [("PRESETS_VIDE","PRESETS_TROP_RESTRICTIFS"),("UNIVERS_TROP_PETIT","FILTRAGE_EXCESSIF"),("HARD_CONSTRAINTS","HARD_CONSTRAINTS_TROP_STRICT"),("COLONNE_100%","COLONNES_MANQUANTES_CSV"),("COMPOSANTES_CASSEES","DONNEES_CORROMPUES"),("VARIANCE_NULLE","DONNEES_UNIFORMES"),("SCORE_PLAT","SCORING_DEGENERE")]:
            if pattern in str(issues):
                return cause
        return "MULTIPLE_ISSUES"

    # ============= HARD FILTERS =============

    def track_profile_hard_filters(self, profile, before, after, filter_stats):
        rejection_reasons = filter_stats.get("reasons", {})
        self.report.hard_filter_stats[profile] = {
            "before": filter_stats.get("before", len(before)),
            "after": filter_stats.get("after", len(after)),
            "rejected": filter_stats.get("rejected", len(before) - len(after)),
            "reasons": {r: {"count": c, "explanation": explain_hard_filter_reason(r)} for r, c in rejection_reasons.items()},
        }
        after_ids = {self._uid(a, "equity") for a in after}
        rejected = [a for a in before if self._uid(a, "equity") not in after_ids]
        for asset in rejected:
            uid = self._uid(asset, "equity")
            reasons = self._determine_rejection_reasons(asset, profile)
            self._rejections[uid] = {"filter": f"hard_filters_{profile}", "reason": "; ".join(reasons), "threshold": f"Profile={profile}", "details": reasons}
        self.track_filter(f"hard_filters_{profile}", "equity", len(before), len(after), rejected, f"Profile={profile}", rejection_reasons)
        yt = rejection_reasons.get("payout_missing", 0) + sum(v for k, v in rejection_reasons.items() if k.startswith("payout>")) + rejection_reasons.get("coverage_missing", 0) + sum(v for k, v in rejection_reasons.items() if k.startswith("coverage<"))
        if yt > 0:
            logger.warning(f"⚠️ [{profile}] {yt} yield traps détectés et filtrés")

    def _determine_rejection_reasons(self, asset, profile):
        if not HAS_PRESET_META:
            return ["preset_meta_unavailable"]
        reasons = []
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
        return reasons if reasons else ["score_insuffisant"]

    def track_buffett_filter(self, before, after, min_score=40):
        rejected = [a for a in before if a not in after]
        for asset in rejected:
            score = asset.get("_buffett_score") or asset.get("buffett_score") or 0
            asset["_rejection_reason"] = asset.get("_buffett_reject_reason") or f"Score {score} < {min_score}"
        self.track_filter("buffett", "equity", len(before), len(after), rejected, f"min_score={min_score}")

    def track_volatility_filter(self, category, before, after, max_vol=60.0):
        rejected = [a for a in before if a not in after]
        for a in rejected:
            a["_rejection_reason"] = f"Volatilité {a.get('vol') or a.get('volatility_3y', 0)}% > {max_vol}%"
        self.track_filter("volatility", category, len(before), len(after), rejected, f"max_vol={max_vol}%")

    def track_liquidity_filter(self, category, before, after, min_value="1B"):
        rejected = [a for a in before if a not in after]
        for a in rejected:
            a["_rejection_reason"] = f"Market cap/AUM {a.get('market_cap') or a.get('aum', 'N/A')} < {min_value}"
        self.track_filter("liquidity", category, len(before), len(after), rejected, f"min={min_value}")

    def record_profile_selection(self, profile, selected, all_candidates, selection_meta):
        self.report.profile_stats[profile] = {"selected_count": len(selected), "candidates_count": len(all_candidates), "stages": selection_meta.get("stages", {}), "stats": selection_meta.get("stats", {})}
        logger.info(f"📊 Audit: [{profile}] {len(selected)}/{len(all_candidates)} selected")

    # ============= v1.6.0: FACTORED RANKING BUILDER =============

    def _build_ranking_entry(self, rank, asset, category, selected_ids, *, include_etf_extras=False):
        """v1.6.0: Single builder for ranking entries. Used by record_category_ranking + record_preset_rankings."""
        sort_score, sort_source = _score_with_source(asset)
        is_selected = any(str(asset.get(k, "")) in selected_ids for k in ["id", "isin", "ticker", "symbol", "name", "etfsymbol"])
        ticker = asset.get("etfsymbol") or asset.get("ticker") or asset.get("symbol") or ""
        entry: Dict[str, Any] = {"rank": rank, "name": asset.get("name") or ticker or "Unknown", "ticker": ticker or None, "sort_score": _safe_round(sort_score, 4), "sort_score_source": sort_source, "selected": is_selected, "matched_preset": asset.get("_matched_preset")}
        # Scores
        cs = asset.get("composite_score") or asset.get("_composite_score")
        if cs is not None: entry["composite_score"] = _safe_round(cs, 4)
        ps = asset.get("_profile_score")
        if ps is not None: entry["profile_score"] = _safe_round(ps, 4)
        bs = asset.get("_buffett_score") or asset.get("buffett_score")
        if bs is not None: entry["buffett_score"] = _safe_round(bs, 1)
        fs = asset.get("factor_scores")
        if fs and isinstance(fs, dict):
            entry["factor_scores"] = {k: round(float(v), 3) for k, v in fs.items() if v is not None and k != "_meta"}
        # Rejection
        if not is_selected:
            rej = self._find_rejection(asset, category)
            if rej:
                entry["rejection_reason"] = rej.get("reason", "")
                entry["rejection_filter"] = rej.get("filter")
            else:
                entry["rejection_reason"] = self._deduce_rejection_reason(asset, category, sort_source)
        # Sector / Country
        entry["sector"] = extract_etf_sector(asset) or None if category == "etf" else asset.get("sector") or asset.get("_sector_key") or None
        entry["country"] = asset.get("country") or None
        # Volatility
        for vk in ["vol", "volatility_3y", "vol_3y", "vol_pct", "vol_30d_annual_pct", "vol_7d_annual_pct", "vol_3y_pct"]:
            v = asset.get(vk)
            if v is not None:
                r = _safe_round(v, 1)
                if r is not None:
                    entry["volatility"] = r
                    break
        # YTD
        ytd_val = asset.get("ytd") or asset.get("perf_ytd") or asset.get("ytd_return_pct")
        if ytd_val is not None:
            entry["ytd"] = f"{ytd_val}%" if isinstance(ytd_val, (int, float)) else str(ytd_val)
        # Category-specific
        if category == "etf":
            ter = asset.get("total_expense_ratio") or asset.get("ter")
            if ter is not None: entry["ter"] = _safe_round(ter, 4)
            aum = asset.get("aum_usd") or asset.get("aum")
            if aum is not None: entry["aum"] = _format_market_cap(aum)
            yld = asset.get("yield_ttm")
            if yld is not None: entry["yield_ttm"] = _safe_round(yld, 2)
            if include_etf_extras:
                for fk, ek in [("_role","role"),("_risk","risk"),("_correlation_group","correlation_group")]:
                    val = asset.get(fk)
                    if val: entry[ek] = str(val)
                for mk in ["perf_3m_pct", "perf_1m_pct"]:
                    mv = asset.get(mk)
                    if mv is not None: entry["momentum_3m" if "3m" in mk else "momentum_1m"] = _safe_round(mv, 2)
        elif category == "bond":
            entry["credit_rating"] = asset.get("credit_rating") or None
            entry["duration"] = _safe_round(asset.get("duration"), 2)
            aum = asset.get("aum") or asset.get("market_cap")
            if aum: entry["aum"] = _format_market_cap(aum)
        elif category == "equity":
            roe = asset.get("roe")
            if roe is not None: entry["roe"] = f"{roe}%" if isinstance(roe, (int, float)) else str(roe)
            mcap = asset.get("market_cap")
            if mcap: entry["market_cap"] = _format_market_cap(mcap)
            dy = asset.get("dividend_yield")
            if dy is not None:
                try: entry["dividend_yield"] = f"{float(dy):.2f}%"
                except (TypeError, ValueError): entry["dividend_yield"] = str(dy)
        elif category == "crypto":
            mcap = asset.get("market_cap")
            if mcap: entry["market_cap"] = _format_market_cap(mcap)
        return {k: v for k, v in entry.items() if v is not None}

    # ============= CATEGORY + PRESET RANKINGS =============

    def record_category_ranking(self, category, all_candidates, selected, max_entries=100):
        """v1.6.2: Two-tier sort for equity to fix _buffett_score scale mismatch."""
        selected_ids = self._uid_set(selected, category)
        # v1.6.2 FIX: Two-tier sort pour equity — _profile_score (0-1) first, puis _buffett_score normalisé
        if category == "equity":
            sorted_cands = sorted(all_candidates, key=lambda a: (
                1 if a.get("_profile_score") is not None else 0,
                a.get("_profile_score") or (a.get("_buffett_score") or 0) / 100.0
            ), reverse=True)
        else:
            sorted_cands = sorted(all_candidates, key=lambda a: _score_with_source(a)[0], reverse=True)
        entries = [self._build_ranking_entry(i, a, category, selected_ids) for i, a in enumerate(sorted_cands[:max_entries], 1)]
        self.report.category_rankings[category] = entries
        n_sel = sum(1 for e in entries if e.get("selected"))
        logger.info(f"📊 Audit v1.6.2: {category} ranking – {len(entries)} entries, {n_sel} selected")
        if category in ("equity", "etf"):
            self.record_preset_rankings(category, all_candidates, selected)

        """v1.6.2: Two-tier sort for equity presets + anomaly guard-rail."""
        selected_ids = self._uid_set(selected, category)
        by_preset: Dict[str, List[Dict]] = {}
        for asset in all_candidates:
            preset = asset.get("_matched_preset") or "non_classé"
            by_preset.setdefault(preset, []).append(asset)
        # Guard-rail
        total = len(all_candidates)
        nc = len(by_preset.get("non_classé", []))
        if total > 0 and nc / total > 0.8:
            w = f"🚨 [{category}] {nc/total:.0%} des assets ({nc}/{total}) sont non_classé – probable HAS_MODULAR_SELECTORS=False ou import manquant dans portfolio_engine/__init__.py"
            logger.warning(w)
            self.report.anomaly_warnings.append(w)
        preset_rankings = {}
        for pname, cands in sorted(by_preset.items()):
            # v1.6.2 FIX: Two-tier sort pour equity presets (même fix que record_category_ranking)
            if category == "equity":
                sc = sorted(cands, key=lambda a: (
                    1 if a.get("_profile_score") is not None else 0,
                    a.get("_profile_score") or (a.get("_buffett_score") or 0) / 100.0
                ), reverse=True)
            else:
                sc = sorted(cands, key=lambda a: _score_with_source(a)[0], reverse=True)
            preset_rankings[pname] = [self._build_ranking_entry(i, a, category, selected_ids, include_etf_extras=(category == "etf")) for i, a in enumerate(sc[:top_n], 1)]
        if not isinstance(self.report.preset_rankings, dict):
            self.report.preset_rankings = {}
        self.report.preset_rankings[category] = preset_rankings
        parts = [f"{p}: {len(e)} ({sum(1 for x in e if x.get('selected'))} sel)" for p, e in sorted(preset_rankings.items())]
        logger.info(f"📊 Audit v1.6.2: {category} preset_rankings – {len(preset_rankings)} presets: " + ", ".join(parts))

    # ============= REJECTION LOOKUP =============

    def _find_rejection(self, asset, category=""):
        for cat in [category, ""]:
            uid = self._uid(asset, cat)
            if uid in self._rejections:
                return self._rejections[uid]
        for key in ["id", "ticker", "symbol", "name"]:
            val = asset.get(key)
            if val and val in self._rejections:
                return self._rejections[val]
        return None

    def _deduce_rejection_reason(self, asset, category, sort_source):
        has_composite = asset.get("composite_score") is not None or asset.get("_composite_score") is not None
        has_profile = asset.get("_profile_score") is not None
        if category == "equity" and not has_composite and not has_profile:
            reasons = []
            vol = asset.get("vol") or asset.get("volatility_3y") or asset.get("vol_3y")
            if vol is None:
                reasons.append("Volatilité manquante → rejeté par hard filters")
            else:
                try:
                    vf = float(str(vol).replace("%", ""))
                    if vf < 1 or vf > 120: reasons.append(f"Volatilité aberrante ({vf}%)")
                except (TypeError, ValueError): reasons.append("Volatilité non parsable")
            roe = asset.get("roe")
            if roe is None or str(roe).upper() in ["N/A", "NAN", "NONE", ""]:
                reasons.append("ROE manquant → rejeté par hard filters")
            for label, key in [("Dividend yield","dividend_yield"),("Payout ratio","payout_ratio"),("Dividend coverage","dividend_coverage")]:
                if asset.get(key) is None: reasons.append(f"{label} manquant")
            if reasons: return "Hard filter (données manquantes): " + "; ".join(reasons[:3])
            return "Éjecté par hard filters du profil (hors range vol/ROE)"
        if category in ["etf", "bond", "crypto"] and not has_composite:
            return "Pas de composite_score → non scoré (filtré avant scoring)"
        if has_composite or has_profile:
            score = asset.get("_profile_score") or asset.get("composite_score") or asset.get("_composite_score")
            if score is not None:
                try: return f"Score composite ({float(score):.3f}) insuffisant pour le quota"
                except (TypeError, ValueError): pass
        if sort_source and "buffett" in sort_source:
            return f"Classé par {sort_source} uniquement → probablement filtré par hard filters"
        return "Non sélectionné (raison non tracée)"

    # ============= FINAL SELECTION + REPORT =============

    def record_final_selection(self, selected, all_candidates, category="equity", top_selected=50, top_rejected=50):
        # === DEBUG LOG 3: Vérifier ce que reçoit record_final_selection ===
        if category == "equity":
            _ac_ps = sum(1 for a in all_candidates if a.get("_profile_score") is not None)
            _ac_bs = sum(1 for a in all_candidates if a.get("_buffett_score") is not None)
            logger.info(f"🔍 DEBUG-3A: record_final_selection(equity): {len(selected)} selected, {len(all_candidates)} all_candidates")
            logger.info(f"🔍 DEBUG-3B: all_candidates: {_ac_ps} _profile_score, {_ac_bs} _buffett_score")
            if all_candidates:
                _sc, _src = _score_with_source(all_candidates[0])
                logger.info(f"🔍 DEBUG-3C: all_candidates[0] score={_sc:.4f}, source={_src}, name={all_candidates[0].get('name','?')[:30]}")
        selected_ids = {self._uid(a, category) for a in selected}
        sel_entries = []
        for i, asset in enumerate(selected[:top_selected], 1):
            entry = self._create_audit_entry(asset, category)
            entry["selected"] = True
            entry["ranking"] = i
            entry["selection_reason"] = self._get_selection_reason(asset, category)
            sel_entries.append(entry)
        rejected = [a for a in all_candidates if self._uid(a, category) not in selected_ids]
        rejected_sorted = self._sort_by_importance(rejected, category)
        rej_entries = []
        for asset in rejected_sorted[:top_rejected]:
            entry = self._create_audit_entry(asset, category)
            entry["selected"] = False
            uid = self._uid(asset, category)
            if uid in self._rejections:
                entry["rejection_reason"] = self._rejections[uid]["reason"]
                entry["rejection_filter"] = self._rejections[uid]["filter"]
                if "details" in self._rejections[uid]:
                    entry["rejection_details"] = [explain_hard_filter_reason(r) for r in self._rejections[uid]["details"]]
            else:
                entry["rejection_reason"] = "Non sélectionné (score insuffisant ou quota atteint)"
            rej_entries.append(entry)
        _MAP = {"equity":("equities_selected","equities_rejected"),"etf":("etf_selected","etf_rejected"),"crypto":("crypto_selected","crypto_rejected"),"bond":("bonds_selected","bonds_rejected")}
        sa, ra = _MAP.get(category, ("equities_selected","equities_rejected"))
        setattr(self.report, sa, sel_entries)
        setattr(self.report, ra, rej_entries)
        self.record_category_ranking(category, all_candidates, selected)
        logger.info(f"📊 Audit: {category} final - {len(sel_entries)} selected, {len(rej_entries)} notable rejected")

    def generate_report(self):
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
            "etf_scoring_issues": sum(len(d.get("issues",[])) for d in self.report.etf_scoring_debug.values()),
            "category_rankings_sizes": {c: len(e) for c, e in self.report.category_rankings.items()},
            "preset_rankings_sizes": {c: {p: {"total": len(e), "selected": sum(1 for x in e if x.get("selected"))} for p, e in ps.items()} for c, ps in self.report.preset_rankings.items() if isinstance(ps, dict)},
            "anomaly_warnings_count": len(self.report.anomaly_warnings),
        }
        return self.report

    def save_report(self, output_path="data/selection_audit.json"):
        report = self.generate_report()
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(report.to_dict(), f, ensure_ascii=False, indent=2)
        logger.info(f"✅ Selection audit saved: {output_path}")
        return output_path

    # === Private helpers ===

    def _enrich_asset(self, asset, category):
        a = asset.copy()
        a["_category"] = category
        return a

    def _create_audit_entry(self, asset, category):
        entry = {"name": asset.get("name") or asset.get("ticker") or "Unknown", "ticker": asset.get("ticker") or asset.get("symbol"), "category": category}
        if asset.get("_matched_preset"): entry["matched_preset"] = asset["_matched_preset"]
        if asset.get("_buffett_score") is not None: entry["buffett_score"] = round(asset["_buffett_score"], 1)
        elif asset.get("buffett_score") is not None: entry["buffett_score"] = round(asset["buffett_score"], 1)
        composite = asset.get("composite_score") or asset.get("_composite_score")
        if composite is not None:
            try: entry["composite_score"] = round(float(composite), 3)
            except (TypeError, ValueError): pass
        if asset.get("_profile_score") is not None: entry["profile_score"] = round(asset["_profile_score"], 3)
        if asset.get("_momentum_score") is not None: entry["momentum_score"] = round(asset["_momentum_score"], 2)
        if asset.get("_quality_score") is not None: entry["quality_score"] = round(asset["_quality_score"], 2)
        if category in ["etf", "bond", "crypto"]:
            fs = asset.get("factor_scores") or {}
            if fs and isinstance(fs, dict): entry["factor_scores"] = {k: round(float(v), 3) for k, v in fs.items() if v is not None and k != "_meta"}
            if category == "bond":
                if asset.get("bond_quality_raw") is not None: entry["bond_quality_raw"] = _safe_round(asset["bond_quality_raw"], 1)
                if asset.get("bond_risk_bucket"): entry["bond_risk_bucket"] = str(asset["bond_risk_bucket"])
                if asset.get("credit_rating"): entry["credit_rating"] = str(asset["credit_rating"])
                if asset.get("duration") is not None: entry["duration"] = _safe_round(asset["duration"], 2)
            if category == "etf":
                if asset.get("ter") is not None: entry["ter"] = _safe_round(asset["ter"], 3)
                if asset.get("aum"): entry["aum"] = _format_market_cap(asset["aum"])
                if asset.get("tracking_error") is not None: entry["tracking_error"] = _safe_round(asset["tracking_error"], 3)
            if category == "crypto":
                for vk in ["vol_30d_annual_pct", "vol_7d_annual_pct", "vol_pct"]:
                    if asset.get(vk) is not None: entry["volatility"] = _safe_round(asset[vk], 1); break
                if asset.get("market_cap"): entry["market_cap"] = _format_market_cap(asset["market_cap"])
        if asset.get("roe"):
            roe = asset["roe"]
            entry["roe"] = f"{roe}%" if isinstance(roe, (int, float)) else str(roe)
        if asset.get("de_ratio") is not None: entry["de_ratio"] = _safe_round(asset["de_ratio"], 2)
        if asset.get("market_cap") and "market_cap" not in entry: entry["market_cap"] = _format_market_cap(asset["market_cap"])
        if asset.get("aum") and "aum" not in entry: entry["aum"] = _format_market_cap(asset["aum"])
        if "volatility" not in entry:
            for vk in ["vol", "volatility_3y", "vol_3y", "vol_3y_pct", "vol_pct"]:
                if asset.get(vk) is not None: entry["volatility"] = _safe_round(asset[vk], 1); break
        if asset.get("ytd") or asset.get("perf_ytd"):
            ytd = asset.get("ytd") or asset.get("perf_ytd")
            entry["ytd"] = f"{ytd}%" if isinstance(ytd, (int, float)) else str(ytd)
        for mk in ["dividend_yield", "payout_ratio", "dividend_coverage"]:
            val = asset.get(mk)
            if val is not None: entry[mk] = _safe_round(val, 2 if mk != "payout_ratio" else 1)
        sector_raw = extract_etf_sector(asset) if category == "etf" else asset.get("sector") or asset.get("_sector_key") or ""
        entry["sector"] = sector_raw if sector_raw else None
        entry["country"] = asset.get("country")
        if self.report.radar_context:
            sn = normalize_sector_for_tilts(sector_raw) if sector_raw else ""
            rn = normalize_region_for_tilts(entry.get("country") or "")
            fs_list = self.report.radar_context.get("favored_sectors", [])
            as_list = self.report.radar_context.get("avoided_sectors", [])
            fr_list = self.report.radar_context.get("favored_regions", [])
            ar_list = self.report.radar_context.get("avoided_regions", [])
            st = "favored" if sn in fs_list else ("avoided" if sn in as_list else "neutral")
            rt = "favored" if rn in fr_list else ("avoided" if rn in ar_list else "neutral")
            entry["radar_tilt"] = "favored" if "favored" in (st,rt) else ("avoided" if "avoided" in (st,rt) else "neutral")
        return {k: v for k, v in entry.items() if v is not None}

    def _get_selection_reason(self, asset, category):
        reasons = []
        b = asset.get("_buffett_score") or asset.get("buffett_score")
        if b and b >= 70: reasons.append(f"Qualité Buffett excellente ({b:.0f})")
        elif b and b >= 50: reasons.append(f"Qualité Buffett solide ({b:.0f})")
        ps = asset.get("_profile_score")
        if ps and ps >= 0.7: reasons.append(f"Score profil élevé ({ps:.2f})")
        preset = asset.get("_matched_preset")
        if preset: reasons.append(f"Preset: {preset}")
        c = asset.get("composite_score") or asset.get("_composite_score")
        if c is not None and category in ["etf","bond","crypto"]:
            try:
                cv = float(c)
                if cv >= 0.3: reasons.append(f"Score composite élevé ({cv:.2f})")
                elif cv >= 0: reasons.append(f"Score composite positif ({cv:.2f})")
            except (TypeError, ValueError): pass
        if category == "bond" and asset.get("bond_quality_raw"):
            try:
                bq = float(asset["bond_quality_raw"])
                if bq >= 70: reasons.append(f"Qualité obligataire excellente ({bq:.0f})")
                elif bq >= 50: reasons.append(f"Qualité obligataire solide ({bq:.0f})")
            except (TypeError, ValueError): pass
        roe = asset.get("roe")
        if roe:
            try:
                rv = float(str(roe).replace("%",""))
                if rv >= 20: reasons.append(f"ROE élevé ({rv:.0f}%)")
            except (TypeError, ValueError): pass
        if self.report.radar_context:
            sr = extract_etf_sector(asset) if category == "etf" else asset.get("sector") or asset.get("_sector_key") or ""
            rr = asset.get("country") or ""
            sn = normalize_sector_for_tilts(sr) if sr else ""
            rn = normalize_region_for_tilts(rr)
            if sn in self.report.radar_context.get("favored_sectors",[]): reasons.append(f"Secteur favorisé RADAR ({sn})")
            if rn in self.report.radar_context.get("favored_regions",[]): reasons.append(f"Région favorisée RADAR ({rn})")
        m = asset.get("_momentum_score")
        if m and m > 0.7: reasons.append("Momentum fort")
        return "; ".join(reasons) if reasons else "Score composite favorable"

    def _get_rejection_reason(self, asset, filter_name):
        if asset.get("_rejection_reason"): return asset["_rejection_reason"]
        if asset.get("_buffett_reject_reason"): return asset["_buffett_reject_reason"]
        m = {"buffett": lambda a: f"Score Buffett insuffisant ({a.get('_buffett_score',0):.0f})", "volatility": lambda a: f"Volatilité trop élevée ({a.get('vol') or a.get('volatility_3y',0)}%)", "liquidity": lambda a: f"Liquidité insuffisante (Market cap: {a.get('market_cap','N/A')})"}
        return m[filter_name](asset) if filter_name in m else f"Filtré par {filter_name}"

    def _sort_by_importance(self, assets, category):
        def key(a):
            if category in ["equity","crypto"]: return _parse_market_cap(a.get("market_cap") or "0")
            return _parse_market_cap(a.get("aum") or a.get("market_cap") or "0")
        return sorted(assets, key=key, reverse=True)


# === Convenience function ===

def create_selection_audit(config, equities_initial, equities_after_buffett, equities_final, etf_data=None, etf_selected=None, crypto_data=None, crypto_selected=None, bonds_data=None, bonds_selected=None, market_context=None, profile_selections=None, etf_scoring_debug=None, output_path="data/selection_audit.json"):
    """Convenience function to create audit report. v1.6.0: anomaly_warnings."""
    auditor = SelectionAuditor(config)
    if market_context: auditor.set_radar_context(market_context)
    auditor.track_initial_universe(equities_initial, "equity")
    auditor.track_buffett_filter(equities_initial, equities_after_buffett, config.get("buffett_min_score", 40))
    if profile_selections:
        for profile, data in profile_selections.items():
            if "before" in data and "after" in data:
                auditor.track_profile_hard_filters(profile, data["before"], data["after"], data.get("stats", {}))
            if "selected" in data and "meta" in data:
                auditor.record_profile_selection(profile, data["selected"], data.get("candidates", []), data["meta"])
    auditor.record_final_selection(equities_final, equities_after_buffett, "equity", 50, 50)
    if etf_data:
        auditor.track_initial_universe(etf_data, "etf")
        if etf_scoring_debug:
            for p, d in etf_scoring_debug.items():
                auditor.track_etf_scoring_diagnostic(p, d.get("stage_counts",{}), d.get("scoring_components",{}), d.get("score_stats",{}), d.get("is_flat",False), d.get("scoring_method","unknown"))
        auditor.record_final_selection(etf_selected or [], etf_data, "etf", 30, 20)
    if crypto_data:
        auditor.track_initial_universe(crypto_data, "crypto")
        auditor.record_final_selection(crypto_selected or [], crypto_data, "crypto", 10, 10)
    if bonds_data:
        auditor.track_initial_universe(bonds_data, "bond")
        auditor.record_final_selection(bonds_selected or [], bonds_data, "bond", 20, 10)
    return auditor.save_report(output_path)
