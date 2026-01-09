#!/usr/bin/env python3
"""
selection_audit.py - Audit trail for asset selection decisions

Generates a detailed JSON report explaining:
- Which assets were selected and why (scores, rankings)
- Which assets were rejected and why (filters, thresholds)
- Filter statistics and thresholds used

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

# ============= v1.1.0: RADAR TILTS NORMALIZATION =============
# Imported from factors.py v2.4.5 for consistency

# Mapping secteur → format RADAR (lowercase, hyphenated)
SECTOR_TO_RADAR = {
    # === Depuis sectors.json (EN) ===
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
    
    # === Depuis stocks (FR) ===
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
    
    # === Depuis sectors.json (FR) ===
    "Pétrole & Gaz": "energy",
    "Énergie": "energy",
    "Ressources de base": "materials",
    "Chimie": "materials",
    "Construction & Matériaux": "industrials",
    "Industriels": "industrials",
    "Transports": "industrials",
    "Automobiles & Équipementiers": "consumer-discretionary",
    "Biens personnels & ménagers": "consumer-discretionary",
    "Distribution": "consumer-discretionary",
    "Voyages & Loisirs": "consumer-discretionary",
    "Consommation discrétionnaire": "consumer-discretionary",
    "Alimentation & Boissons": "consumer-staples",
    "Pharmaceutiques": "healthcare",
    "Biotechnologie": "healthcare",
    "Banques": "financials",
    "Services financiers": "financials",
    "Assurances": "financials",
    "Technologie": "information-technology",
    "Semi-conducteurs": "information-technology",
    "Télécommunications": "communication-services",
    "Infrastructures réseaux intelligents": "utilities",
    
    # === Mappings additionnels (lowercase) ===
    "healthcare": "healthcare",
    "financials": "financials",
    "information-technology": "information-technology",
    "consumer-discretionary": "consumer-discretionary",
    "consumer-staples": "consumer-staples",
    "energy": "energy",
    "industrials": "industrials",
    "materials": "materials",
    "communication-services": "communication-services",
    "utilities": "utilities",
    "real-estate": "real-estate",
}

# Mapping pays → format RADAR (lowercase, hyphenated)
COUNTRY_TO_RADAR = {
    # === Asie ===
    "Corée du Sud": "south-korea",
    "Corée": "south-korea",
    "South Korea": "south-korea",
    "Korea": "south-korea",
    
    "Chine": "china",
    "China": "china",
    
    "Japon": "japan",
    "Japan": "japan",
    
    "Inde": "india",
    "India": "india",
    
    "Taiwan": "taiwan",
    "Taïwan": "taiwan",
    
    "Hong Kong": "hong-kong",
    
    "Singapour": "singapore",
    "Singapore": "singapore",
    
    "Indonésie": "indonesia",
    "Indonesia": "indonesia",
    
    "Philippines": "philippines",
    
    "Thaïlande": "thailand",
    "Thailand": "thailand",
    
    "Malaisie": "malaysia",
    "Malaysia": "malaysia",
    
    # === Europe ===
    "Allemagne": "germany",
    "Germany": "germany",
    
    "France": "france",
    
    "Royaume-Uni": "uk",
    "Royaume Uni": "uk",
    "United Kingdom": "uk",
    "UK": "uk",
    
    "Italie": "italy",
    "Italy": "italy",
    
    "Espagne": "spain",
    "Spain": "spain",
    
    "Pays-Bas": "netherlands",
    "Netherlands": "netherlands",
    
    "Suisse": "switzerland",
    "Switzerland": "switzerland",
    
    "Belgique": "belgium",
    "Belgium": "belgium",
    
    "Autriche": "austria",
    "Austria": "austria",
    
    "Irlande": "ireland",
    "Ireland": "ireland",
    
    "Portugal": "portugal",
    
    "Norvège": "norway",
    "Norway": "norway",
    
    "Suède": "sweden",
    "Sweden": "sweden",
    
    "Danemark": "denmark",
    "Denmark": "denmark",
    
    "Finlande": "finland",
    "Finland": "finland",
    
    # === Amériques ===
    "Etats-Unis": "usa",
    "États-Unis": "usa",
    "United States": "usa",
    "USA": "usa",
    "US": "usa",
    
    "Canada": "canada",
    
    "Mexique": "mexico",
    "Mexico": "mexico",
    
    "Brésil": "brazil",
    "Brazil": "brazil",
    
    "Argentine": "argentina",
    "Argentina": "argentina",
    
    "Chili": "chile",
    "Chile": "chile",
    
    # === Autres ===
    "Australie": "australia",
    "Australia": "australia",
    
    "Israel": "israel",
    "Israël": "israel",
    
    "Saudi Arabia": "saudi-arabia",
    "Arabie Saoudite": "saudi-arabia",
    
    "South Africa": "south-africa",
    "Afrique du Sud": "south-africa",
    
    "Turquie": "turkey",
    "Turkey": "turkey",
    
    # === RÉGIONS À IGNORER (retournent chaîne vide) ===
    "Asie": "",
    "Europe": "",
    "Zone Euro": "",
    "Global": "",
}


def normalize_sector_for_tilts(sector: str) -> str:
    """
    v1.1.0: Normalise un secteur vers le format RADAR.
    
    Exemples:
        "Healthcare" → "healthcare"
        "Santé" → "healthcare"
        "Financial Services" → "financials"
        "Technologie de l'information" → "information-technology"
    """
    if not sector:
        return ""
    
    sector_clean = sector.strip()
    
    # 1. Mapping direct
    if sector_clean in SECTOR_TO_RADAR:
        return SECTOR_TO_RADAR[sector_clean]
    
    # 2. Essayer en lowercase
    sector_lower = sector_clean.lower()
    for key, value in SECTOR_TO_RADAR.items():
        if key.lower() == sector_lower:
            return value
    
    # 3. Recherche partielle (contient)
    for key, value in SECTOR_TO_RADAR.items():
        if sector_lower in key.lower() or key.lower() in sector_lower:
            return value
    
    # 4. Fallback: convertir en lowercase hyphenated
    return sector_clean.lower().replace(" ", "-").replace("_", "-")


def normalize_region_for_tilts(country: str) -> str:
    """
    v1.1.0: Normalise un pays vers le format RADAR.
    
    Exemples:
        "Corée du Sud" → "south-korea"
        "Corée" → "south-korea"
        "Chine" → "china"
        "Etats-Unis" → "usa"
    """
    if not country:
        return ""
    
    country_clean = country.strip()
    
    # 1. Mapping direct
    if country_clean in COUNTRY_TO_RADAR:
        return COUNTRY_TO_RADAR[country_clean]
    
    # 2. Essayer en lowercase
    country_lower = country_clean.lower()
    for key, value in COUNTRY_TO_RADAR.items():
        if key.lower() == country_lower:
            return value
    
    # 3. Fallback: convertir en lowercase hyphenated
    return country_clean.lower().replace(" ", "-").replace("_", "-")


# ============= DATACLASSES =============

@dataclass
class FilterStats:
    """Statistics for a single filter."""
    name: str
    threshold: Any
    input_count: int
    output_count: int
    rejected_count: int
    rejection_rate_pct: float = 0.0
    
    def __post_init__(self):
        if self.input_count > 0:
            self.rejection_rate_pct = round(
                100 * self.rejected_count / self.input_count, 1
            )


@dataclass
class AssetAuditEntry:
    """Audit entry for a single asset."""
    name: str
    ticker: Optional[str] = None
    category: str = "equity"
    
    # Scores
    buffett_score: Optional[float] = None
    composite_score: Optional[float] = None
    momentum_score: Optional[float] = None
    quality_score: Optional[float] = None
    
    # Metrics
    roe: Optional[str] = None
    de_ratio: Optional[float] = None
    market_cap: Optional[str] = None
    aum: Optional[str] = None
    volatility: Optional[float] = None
    ytd: Optional[str] = None
    sector: Optional[str] = None
    country: Optional[str] = None
    
    # Selection info
    selected: bool = False
    ranking: Optional[int] = None
    selection_reason: Optional[str] = None
    rejection_reason: Optional[str] = None
    rejection_filter: Optional[str] = None
    
    # RADAR context
    radar_tilt: Optional[str] = None  # "favored", "avoided", "neutral"
    
    def to_dict(self) -> Dict:
        """Convert to dict, excluding None values."""
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass 
class SelectionAuditReport:
    """Complete audit report for asset selection."""
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    version: str = "v1.1.0"
    
    # Summary counts
    summary: Dict[str, int] = field(default_factory=dict)
    
    # Filter statistics
    filters_applied: List[Dict] = field(default_factory=list)
    
    # Assets by category
    equities_selected: List[Dict] = field(default_factory=list)
    equities_rejected: List[Dict] = field(default_factory=list)
    
    etf_selected: List[Dict] = field(default_factory=list)
    etf_rejected: List[Dict] = field(default_factory=list)
    
    crypto_selected: List[Dict] = field(default_factory=list)
    crypto_rejected: List[Dict] = field(default_factory=list)
    
    bonds_selected: List[Dict] = field(default_factory=list)
    bonds_rejected: List[Dict] = field(default_factory=list)
    
    # RADAR context used
    radar_context: Optional[Dict] = None
    
    # Config used
    config: Dict = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        return asdict(self)


class SelectionAuditor:
    """
    Tracks and records asset selection decisions throughout the pipeline.
    
    v1.1.0: Added RADAR tilts normalization for correct sector/region matching.
    
    Usage:
        auditor = SelectionAuditor(config)
        
        # Track at each filter stage
        auditor.track_buffett_filter(before, after, rejected)
        auditor.track_volatility_filter(before, after, rejected)
        
        # Record final selections
        auditor.record_final_selection(selected_assets, all_candidates)
        
        # Generate report
        report = auditor.generate_report()
        auditor.save_report("data/selection_audit.json")
    """
    
    def __init__(self, config: Dict = None):
        self.config = config or {}
        self.report = SelectionAuditReport()
        self.report.config = {
            "buffett_mode": self.config.get("buffett_mode", "soft"),
            "buffett_min_score": self.config.get("buffett_min_score", 40),
            "tactical_mode": self.config.get("tactical_mode", "radar"),
            "use_tactical_context": self.config.get("use_tactical_context", False),
        }
        
        # Track all assets through pipeline
        self._all_equities: List[Dict] = []
        self._all_etf: List[Dict] = []
        self._all_crypto: List[Dict] = []
        self._all_bonds: List[Dict] = []
        
        # Track rejection reasons
        self._rejections: Dict[str, Dict] = {}  # asset_id -> rejection info
        
        # Counts at each stage
        self._stage_counts: Dict[str, int] = {}
        
    def set_radar_context(self, market_context: Dict):
        """Store RADAR context for the report."""
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
        """Track the initial universe before any filters."""
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
    
    def track_filter(
        self,
        filter_name: str,
        category: str,
        before_count: int,
        after_count: int,
        rejected_assets: List[Dict] = None,
        threshold: Any = None,
    ):
        """Track a filter application."""
        rejected_count = before_count - after_count
        
        stats = FilterStats(
            name=filter_name,
            threshold=threshold,
            input_count=before_count,
            output_count=after_count,
            rejected_count=rejected_count,
        )
        self.report.filters_applied.append(asdict(stats))
        
        self._stage_counts[f"{category}_after_{filter_name}"] = after_count
        
        # Record rejection reasons
        if rejected_assets:
            for asset in rejected_assets:
                asset_id = self._get_asset_id(asset)
                self._rejections[asset_id] = {
                    "filter": filter_name,
                    "reason": self._get_rejection_reason(asset, filter_name),
                    "threshold": threshold,
                }
        
        logger.info(
            f"📊 Audit: {filter_name} on {category}: "
            f"{before_count} → {after_count} (-{rejected_count}, {stats.rejection_rate_pct}%)"
        )
    
    def track_buffett_filter(
        self,
        before: List[Dict],
        after: List[Dict],
        min_score: int = 40,
    ):
        """Convenience method for Buffett filter tracking."""
        rejected = [a for a in before if a not in after]
        
        # Enrich with rejection reasons
        for asset in rejected:
            score = asset.get("_buffett_score") or asset.get("buffett_score") or 0
            reason = asset.get("_buffett_reject_reason") or f"Score {score} < {min_score}"
            asset["_rejection_reason"] = reason
        
        self.track_filter(
            filter_name="buffett",
            category="equity",
            before_count=len(before),
            after_count=len(after),
            rejected_assets=rejected,
            threshold=f"min_score={min_score}",
        )
    
    def track_volatility_filter(
        self,
        category: str,
        before: List[Dict],
        after: List[Dict],
        max_vol: float = 60.0,
    ):
        """Track volatility filter."""
        rejected = [a for a in before if a not in after]
        
        for asset in rejected:
            vol = asset.get("vol") or asset.get("volatility_3y") or 0
            asset["_rejection_reason"] = f"Volatilité {vol}% > {max_vol}%"
        
        self.track_filter(
            filter_name="volatility",
            category=category,
            before_count=len(before),
            after_count=len(after),
            rejected_assets=rejected,
            threshold=f"max_vol={max_vol}%",
        )
    
    def track_liquidity_filter(
        self,
        category: str,
        before: List[Dict],
        after: List[Dict],
        min_value: str = "1B",
    ):
        """Track liquidity/market cap filter."""
        rejected = [a for a in before if a not in after]
        
        for asset in rejected:
            mcap = asset.get("market_cap") or asset.get("aum") or "N/A"
            asset["_rejection_reason"] = f"Market cap/AUM {mcap} < {min_value}"
        
        self.track_filter(
            filter_name="liquidity",
            category=category,
            before_count=len(before),
            after_count=len(after),
            rejected_assets=rejected,
            threshold=f"min={min_value}",
        )
    
    def record_final_selection(
        self,
        selected: List[Dict],
        all_candidates: List[Dict],
        category: str = "equity",
        top_selected: int = 50,
        top_rejected: int = 50,
    ):
        """
        Record final selection with rankings.
        
        Args:
            selected: Assets that made it to the portfolio
            all_candidates: All assets that were candidates (after filters)
            category: Asset category
            top_selected: Max selected to include in report
            top_rejected: Max rejected to include in report
        """
        selected_ids = {self._get_asset_id(a) for a in selected}
        
        # Build selected list with rankings
        selected_entries = []
        for i, asset in enumerate(selected[:top_selected], 1):
            entry = self._create_audit_entry(asset, category)
            entry["selected"] = True
            entry["ranking"] = i
            entry["selection_reason"] = self._get_selection_reason(asset, category)
            selected_entries.append(entry)
        
        # Build rejected list (sorted by market cap / AUM for notability)
        rejected = [a for a in all_candidates if self._get_asset_id(a) not in selected_ids]
        rejected_sorted = self._sort_by_importance(rejected, category)
        
        rejected_entries = []
        for asset in rejected_sorted[:top_rejected]:
            entry = self._create_audit_entry(asset, category)
            entry["selected"] = False
            
            # Get rejection reason
            asset_id = self._get_asset_id(asset)
            if asset_id in self._rejections:
                entry["rejection_reason"] = self._rejections[asset_id]["reason"]
                entry["rejection_filter"] = self._rejections[asset_id]["filter"]
            else:
                entry["rejection_reason"] = "Non sélectionné (score insuffisant ou quota atteint)"
            
            rejected_entries.append(entry)
        
        # Store in report
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
        
        logger.info(
            f"📊 Audit: {category} final - "
            f"{len(selected_entries)} selected, {len(rejected_entries)} notable rejected"
        )
    
    def generate_report(self) -> SelectionAuditReport:
        """Generate the final audit report."""
        # Build summary
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
        }
        
        return self.report
    
    def save_report(self, output_path: str = "data/selection_audit.json"):
        """Save the report to JSON file."""
        report = self.generate_report()
        
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(report.to_dict(), f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Selection audit saved: {output_path}")
        return output_path
    
    # === Private helpers ===
    
    def _get_asset_id(self, asset: Dict) -> str:
        """Get unique identifier for an asset."""
        return (
            asset.get("id") or 
            asset.get("ticker") or 
            asset.get("symbol") or 
            asset.get("name") or 
            str(id(asset))
        )
    
    def _enrich_asset(self, asset: Dict, category: str) -> Dict:
        """Enrich asset with category info."""
        asset = asset.copy()
        asset["_category"] = category
        return asset
    
    def _create_audit_entry(self, asset: Dict, category: str) -> Dict:
        """
        Create audit entry from raw asset data.
        
        v1.1.0: Uses normalize_sector_for_tilts() and normalize_region_for_tilts()
        for correct RADAR tilt matching.
        """
        entry = {
            "name": asset.get("name") or asset.get("ticker") or "Unknown",
            "ticker": asset.get("ticker") or asset.get("symbol"),
            "category": category,
        }
        
        # Scores
        if asset.get("_buffett_score") is not None:
            entry["buffett_score"] = round(asset["_buffett_score"], 1)
        elif asset.get("buffett_score") is not None:
            entry["buffett_score"] = round(asset["buffett_score"], 1)
            
        if asset.get("_composite_score") is not None:
            entry["composite_score"] = round(asset["_composite_score"], 2)
        if asset.get("_momentum_score") is not None:
            entry["momentum_score"] = round(asset["_momentum_score"], 2)
        if asset.get("_quality_score") is not None:
            entry["quality_score"] = round(asset["_quality_score"], 2)
        
        # Metrics
        if asset.get("roe"):
            roe = asset["roe"]
            entry["roe"] = f"{roe}%" if isinstance(roe, (int, float)) else str(roe)
        
        if asset.get("de_ratio") is not None:
            entry["de_ratio"] = round(float(asset["de_ratio"]), 2)
        
        if asset.get("market_cap"):
            entry["market_cap"] = self._format_market_cap(asset["market_cap"])
        
        if asset.get("aum"):
            entry["aum"] = self._format_market_cap(asset["aum"])
        
        if asset.get("vol") or asset.get("volatility_3y"):
            vol = asset.get("vol") or asset.get("volatility_3y")
            entry["volatility"] = round(float(vol), 1) if vol else None
        
        if asset.get("ytd") or asset.get("perf_ytd"):
            ytd = asset.get("ytd") or asset.get("perf_ytd")
            entry["ytd"] = f"{ytd}%" if isinstance(ytd, (int, float)) else str(ytd)
        
        entry["sector"] = asset.get("sector") or asset.get("_sector_key")
        entry["country"] = asset.get("country")
        
        # v1.1.0 FIX: RADAR tilt with NORMALIZATION
        if self.report.radar_context:
            sector_raw = entry.get("sector") or ""
            region_raw = entry.get("country") or ""
            
            # Normalize to RADAR format
            sector_normalized = normalize_sector_for_tilts(sector_raw)
            region_normalized = normalize_region_for_tilts(region_raw)
            
            favored_sectors = self.report.radar_context.get("favored_sectors", [])
            avoided_sectors = self.report.radar_context.get("avoided_sectors", [])
            favored_regions = self.report.radar_context.get("favored_regions", [])
            avoided_regions = self.report.radar_context.get("avoided_regions", [])
            
            # Determine tilt based on NORMALIZED values
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
            
            # Combined tilt: favored if either is favored, avoided only if one is avoided and none favored
            if sector_tilt == "favored" or region_tilt == "favored":
                entry["radar_tilt"] = "favored"
            elif sector_tilt == "avoided" or region_tilt == "avoided":
                entry["radar_tilt"] = "avoided"
            else:
                entry["radar_tilt"] = "neutral"
            
            # v1.1.0: Store matching details for debugging
            entry["_radar_matching"] = {
                "sector_raw": sector_raw,
                "sector_normalized": sector_normalized,
                "sector_tilt": sector_tilt,
                "region_raw": region_raw,
                "region_normalized": region_normalized,
                "region_tilt": region_tilt,
            }
        
        # Remove None values (but keep _radar_matching)
        return {k: v for k, v in entry.items() if v is not None}
    
    def _get_selection_reason(self, asset: Dict, category: str) -> str:
        """Generate selection reason based on scores."""
        reasons = []
        
        buffett = asset.get("_buffett_score") or asset.get("buffett_score")
        if buffett and buffett >= 70:
            reasons.append(f"Qualité Buffett excellente ({buffett:.0f})")
        elif buffett and buffett >= 50:
            reasons.append(f"Qualité Buffett solide ({buffett:.0f})")
        
        roe = asset.get("roe")
        if roe:
            try:
                roe_val = float(str(roe).replace("%", ""))
                if roe_val >= 20:
                    reasons.append(f"ROE élevé ({roe_val:.0f}%)")
            except:
                pass
        
        # v1.1.0: RADAR context with normalization
        if self.report.radar_context:
            sector_raw = asset.get("sector") or asset.get("_sector_key") or ""
            region_raw = asset.get("country") or ""
            
            sector_normalized = normalize_sector_for_tilts(sector_raw)
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
        """Get rejection reason for an asset."""
        # Check if already has reason
        if asset.get("_rejection_reason"):
            return asset["_rejection_reason"]
        
        if asset.get("_buffett_reject_reason"):
            return asset["_buffett_reject_reason"]
        
        # Build reason based on filter
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
        """Sort assets by importance (market cap for equities, AUM for ETF)."""
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
        """Parse market cap string to float for sorting."""
        if isinstance(value, (int, float)):
            return float(value)
        
        if not isinstance(value, str):
            return 0
        
        value = value.upper().strip()
        
        multipliers = {
            "T": 1e12,
            "B": 1e9,
            "M": 1e6,
            "K": 1e3,
        }
        
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


# === Convenience function for integration ===

def create_selection_audit(
    config: Dict,
    equities_initial: List[Dict],
    equities_after_buffett: List[Dict],
    equities_final: List[Dict],
    etf_data: List[Dict] = None,
    etf_selected: List[Dict] = None,
    crypto_data: List[Dict] = None,
    crypto_selected: List[Dict] = None,
    bonds_data: List[Dict] = None,
    bonds_selected: List[Dict] = None,
    market_context: Dict = None,
    output_path: str = "data/selection_audit.json",
) -> str:
    """
    Convenience function to create audit report in one call.
    
    Returns:
        Path to saved report
    """
    auditor = SelectionAuditor(config)
    
    # Set RADAR context
    if market_context:
        auditor.set_radar_context(market_context)
    
    # Track equities
    auditor.track_initial_universe(equities_initial, "equity")
    auditor.track_buffett_filter(
        before=equities_initial,
        after=equities_after_buffett,
        min_score=config.get("buffett_min_score", 40),
    )
    auditor.record_final_selection(
        selected=equities_final,
        all_candidates=equities_initial,
        category="equity",
        top_selected=50,
        top_rejected=50,
    )
    
    # Track ETF
    if etf_data:
        auditor.track_initial_universe(etf_data, "etf")
        auditor.record_final_selection(
            selected=etf_selected or [],
            all_candidates=etf_data,
            category="etf",
            top_selected=30,
            top_rejected=20,
        )
    
    # Track Crypto
    if crypto_data:
        auditor.track_initial_universe(crypto_data, "crypto")
        auditor.record_final_selection(
            selected=crypto_selected or [],
            all_candidates=crypto_data,
            category="crypto",
            top_selected=10,
            top_rejected=10,
        )
    
    # Track Bonds
    if bonds_data:
        auditor.track_initial_universe(bonds_data, "bond")
        auditor.record_final_selection(
            selected=bonds_selected or [],
            all_candidates=bonds_data,
            category="bond",
            top_selected=20,
            top_rejected=10,
        )
    
    return auditor.save_report(output_path)
