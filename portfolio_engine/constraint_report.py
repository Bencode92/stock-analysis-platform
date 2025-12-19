# portfolio_engine/constraint_report.py
"""
Constraint Report Module — v2.0

Génère un rapport structuré des contraintes avec margins explicites.
Chaque contrainte est documentée avec: {cap, observed, slack, binding, status}

v2.0 ADDITIONS (Phase 1.2-1.3):
- Exposures détaillées (category, sector, region, risk_bucket, role)
- Métriques de concentration (HHI, effective_n, top_5)
- Ticker mapping pour exécution (id → ticker → ISIN)

STRUCTURE MARGIN:
- cap: Limite configurée (ex: 50% pour max_region)
- observed: Valeur observée dans l'allocation
- slack: cap - observed (positif = marge, négatif = violation)
- binding: True si slack < 1% (contrainte saturée)
- status: "OK" | "BINDING" | "VIOLATED"

Intègre avec risk_buckets.py pour les nouvelles contraintes v6.19.0.
"""

from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict
from enum import Enum
import logging
import math

# Import risk_buckets si disponible
try:
    from portfolio_engine.risk_buckets import (
        RiskBucket,
        classify_asset,
        counts_in_max_region,
        LEVERAGED_CAP,
        ALTERNATIVE_CAP,
        compute_bucket_exposures,
    )
    HAS_RISK_BUCKETS = True
except ImportError:
    HAS_RISK_BUCKETS = False
    
    class RiskBucket(Enum):
        EQUITY_LIKE = "equity_like"
        BOND_LIKE = "bond_like"
        LEVERAGED = "leveraged"
        ALTERNATIVE = "alternative"
        REAL_ASSETS = "real_assets"
        CRYPTO = "crypto"
        UNKNOWN = "unknown"
    
    LEVERAGED_CAP = {"Stable": 0.0, "Modéré": 0.0, "Agressif": 5.0}
    ALTERNATIVE_CAP = {"Stable": 5.0, "Modéré": 10.0, "Agressif": 20.0}

logger = logging.getLogger("portfolio_engine.constraint_report")


# ============= CONSTANTS =============

# Seuil pour considérer une contrainte comme "binding" (saturée)
BINDING_THRESHOLD_PCT = 1.0  # < 1% de slack = binding

# Seuil pour considérer une violation comme critique
CRITICAL_VIOLATION_PCT = 5.0  # > 5% de dépassement = critique


# ============= DATA CLASSES =============

class ConstraintStatus(Enum):
    """Statut d'une contrainte."""
    OK = "OK"                    # Respectée avec marge
    BINDING = "BINDING"          # Respectée mais saturée (slack < 1%)
    VIOLATED = "VIOLATED"        # Violée (slack < 0)
    CRITICAL = "CRITICAL"        # Violation critique (slack < -5%)
    NOT_APPLICABLE = "N/A"       # Non applicable (ex: crypto_max=0)


@dataclass
class ConstraintMargin:
    """
    Structure explicite pour une contrainte.
    
    Attributes:
        name: Nom de la contrainte
        constraint_type: "max" | "min" | "range" | "target"
        cap: Limite configurée (% ou valeur absolue)
        observed: Valeur observée
        slack: Marge = cap - observed (pour max) ou observed - cap (pour min)
        binding: True si contrainte saturée
        status: OK | BINDING | VIOLATED | CRITICAL
        details: Infos additionnelles (ex: breakdown par région)
    """
    name: str
    constraint_type: str  # "max", "min", "range", "target"
    cap: float
    observed: float
    slack: float
    binding: bool
    status: ConstraintStatus
    details: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour JSON."""
        return {
            "name": self.name,
            "constraint_type": self.constraint_type,
            "cap": round(self.cap, 2),
            "observed": round(self.observed, 2),
            "slack": round(self.slack, 2),
            "binding": self.binding,
            "status": self.status.value,
            "details": self.details,
        }


@dataclass
class TickerMapping:
    """
    Mapping d'un actif pour exécution.
    
    Phase 1.3: Structure pour faciliter l'exécution broker.
    """
    id: str
    ticker: str
    isin: Optional[str]
    name: str
    weight_pct: float
    category: str
    risk_bucket: str
    sector: str
    region: str
    exchange: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour JSON."""
        return {
            "id": self.id,
            "ticker": self.ticker,
            "isin": self.isin,
            "name": self.name,
            "weight_pct": round(self.weight_pct, 2),
            "category": self.category,
            "risk_bucket": self.risk_bucket,
            "sector": self.sector,
            "region": self.region,
            "exchange": self.exchange,
        }


@dataclass
class ExposureReport:
    """
    Rapport des expositions détaillées.
    
    Phase 1.2: Breakdown complet pour audit.
    """
    by_category: Dict[str, float]
    by_sector: Dict[str, float]
    by_region: Dict[str, float]
    by_risk_bucket: Dict[str, float]
    by_role: Dict[str, float]
    concentration: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour JSON."""
        return {
            "by_category": {k: round(v, 2) for k, v in self.by_category.items()},
            "by_sector": {k: round(v, 2) for k, v in sorted(self.by_sector.items(), key=lambda x: -x[1])},
            "by_region": {k: round(v, 2) for k, v in sorted(self.by_region.items(), key=lambda x: -x[1])},
            "by_risk_bucket": {k: round(v, 2) for k, v in self.by_risk_bucket.items()},
            "by_role": {k: round(v, 2) for k, v in self.by_role.items()},
            "concentration": self.concentration,
        }


@dataclass
class ConstraintReport:
    """
    Rapport complet des contraintes.
    
    v2.0: Ajout exposures et ticker_mapping.
    
    Attributes:
        profile_name: Nom du profil (Stable, Modéré, Agressif)
        constraints: Liste des ConstraintMargin
        summary: Résumé (n_ok, n_binding, n_violated)
        quality_score: Score de qualité 0-100
        recommendations: Actions recommandées
        exposures: Breakdown des expositions (Phase 1.2)
        ticker_mapping: Liste des mappings pour exécution (Phase 1.3)
        execution_summary: Résumé pour exécution
    """
    profile_name: str
    constraints: List[ConstraintMargin]
    summary: Dict[str, int]
    quality_score: float
    recommendations: List[str]
    exposures: Optional[ExposureReport] = None
    ticker_mapping: Optional[List[TickerMapping]] = None
    execution_summary: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour JSON."""
        result = {
            "profile_name": self.profile_name,
            "constraints": [c.to_dict() for c in self.constraints],
            "summary": self.summary,
            "quality_score": round(self.quality_score, 1),
            "recommendations": self.recommendations,
        }
        
        # Phase 1.2: Exposures
        if self.exposures:
            result["exposures"] = self.exposures.to_dict()
        
        # Phase 1.3: Ticker mapping
        if self.ticker_mapping:
            result["ticker_mapping"] = [t.to_dict() for t in self.ticker_mapping]
        
        if self.execution_summary:
            result["execution_summary"] = self.execution_summary
        
        return result
    
    def get_violations(self) -> List[ConstraintMargin]:
        """Retourne les contraintes violées."""
        return [c for c in self.constraints if c.status in [ConstraintStatus.VIOLATED, ConstraintStatus.CRITICAL]]
    
    def get_binding(self) -> List[ConstraintMargin]:
        """Retourne les contraintes saturées."""
        return [c for c in self.constraints if c.status == ConstraintStatus.BINDING]
    
    def is_feasible(self) -> bool:
        """True si aucune contrainte violée."""
        return len(self.get_violations()) == 0


# ============= CONCENTRATION METRICS =============

def compute_hhi(weights: List[float]) -> float:
    """
    Calcule l'indice Herfindahl-Hirschman (HHI).
    
    HHI = Σ(w_i)² * 10000 où w_i en décimal (somme = 1)
    
    Échelle:
    - 0-1000: Well diversified (équivalent 10+ positions égales)
    - 1000-1500: Diversified
    - 1500-2500: Moderately concentrated
    - >2500: Highly concentrated
    
    Exemples:
    - 10 positions à 10% chacune → HHI = 1000
    - 5 positions à 20% chacune → HHI = 2000
    - 2 positions à 50% chacune → HHI = 5000
    - 1 position à 100% → HHI = 10000
    """
    if not weights:
        return 0.0
    
    # Filtrer les poids nuls
    w = [x for x in weights if x > 0]
    if not w:
        return 0.0
    
    # Normaliser pour que la somme = 1 (robuste aux deux formats)
    total = sum(w)
    if total <= 0:
        return 0.0
    
    w_normalized = [x / total for x in w]
    
    # HHI = sum(w²) * 10000
    hhi = sum(x * x for x in w_normalized) * 10000
    
    return round(hhi, 1)


def compute_effective_n(weights: List[float]) -> float:
    """
    Calcule le nombre effectif de positions (inverse HHI).
    
    Représente le nombre équivalent de positions si toutes égales.
    
    Exemples:
    - HHI = 1000 → effective_n = 10
    - HHI = 2000 → effective_n = 5
    - HHI = 5000 → effective_n = 2
    """
    hhi = compute_hhi(weights)
    if hhi <= 0:
        return 0.0
    return round(10000 / hhi, 1)


# ============= MARGIN CALCULATION FUNCTIONS =============

def _compute_margin(
    name: str,
    constraint_type: str,
    cap: float,
    observed: float,
    details: Optional[Dict] = None
) -> ConstraintMargin:
    """
    Calcule le margin pour une contrainte.
    
    Args:
        name: Nom de la contrainte
        constraint_type: "max" | "min" | "target"
        cap: Limite configurée
        observed: Valeur observée
        details: Infos additionnelles
    """
    if constraint_type == "max":
        slack = cap - observed
    elif constraint_type == "min":
        slack = observed - cap
    elif constraint_type == "target":
        slack = -abs(observed - cap)  # Négatif si loin de la cible
    else:
        slack = cap - observed
    
    # Déterminer le statut
    if slack < -CRITICAL_VIOLATION_PCT:
        status = ConstraintStatus.CRITICAL
    elif slack < 0:
        status = ConstraintStatus.VIOLATED
    elif slack < BINDING_THRESHOLD_PCT:
        status = ConstraintStatus.BINDING
    else:
        status = ConstraintStatus.OK
    
    binding = slack < BINDING_THRESHOLD_PCT and slack >= 0
    
    return ConstraintMargin(
        name=name,
        constraint_type=constraint_type,
        cap=cap,
        observed=observed,
        slack=slack,
        binding=binding,
        status=status,
        details=details or {},
    )


# ============= MAIN REPORT GENERATOR =============

class ConstraintReportGenerator:
    """
    Générateur de rapports de contraintes.
    
    v2.0: Ajout génération exposures et ticker_mapping.
    
    Usage:
        generator = ConstraintReportGenerator()
        report = generator.generate(allocation, candidates, profile)
    """
    
    def __init__(self):
        self.has_risk_buckets = HAS_RISK_BUCKETS
    
    def generate(
        self,
        allocation: Dict[str, float],
        candidates: List[Any],  # List[Asset]
        profile: Any,  # ProfileConstraints
        cov_diagnostics: Optional[Dict] = None,
        include_exposures: bool = True,
        include_ticker_mapping: bool = True,
    ) -> ConstraintReport:
        """
        Génère le rapport complet des contraintes.
        
        Args:
            allocation: Dict {asset_id: weight_pct}
            candidates: Liste des Asset candidats
            profile: ProfileConstraints
            cov_diagnostics: Diagnostics de covariance (optionnel)
            include_exposures: Inclure le rapport d'expositions (Phase 1.2)
            include_ticker_mapping: Inclure le mapping tickers (Phase 1.3)
        
        Returns:
            ConstraintReport avec toutes les margins, exposures et mapping
        """
        constraints = []
        
        # Build asset lookup
        asset_by_id = {self._get_asset_id(a): a for a in candidates}
        
        # 1. Volatilité (target avec tolérance)
        vol_margin = self._compute_vol_margin(allocation, candidates, profile, cov_diagnostics)
        if vol_margin:
            constraints.append(vol_margin)
        
        # 2. Bonds minimum
        bonds_margin = self._compute_bonds_margin(allocation, asset_by_id, profile)
        constraints.append(bonds_margin)
        
        # 3. Crypto maximum
        crypto_margin = self._compute_crypto_margin(allocation, asset_by_id, profile)
        if crypto_margin:
            constraints.append(crypto_margin)
        
        # 4. Max single position
        position_margins = self._compute_position_margins(allocation, asset_by_id, profile)
        constraints.extend(position_margins)
        
        # 5. Max sector
        sector_margins = self._compute_sector_margins(allocation, asset_by_id, profile)
        constraints.extend(sector_margins)
        
        # 6. Max region (EQUITY_LIKE + LEVERAGED only)
        region_margins = self._compute_region_margins(allocation, asset_by_id, profile)
        constraints.extend(region_margins)
        
        # 7. Asset count (min/max)
        count_margins = self._compute_count_margins(allocation, profile)
        constraints.extend(count_margins)
        
        # 8. Bucket constraints
        bucket_margins = self._compute_bucket_margins(allocation, asset_by_id, profile)
        constraints.extend(bucket_margins)
        
        # 9. Risk bucket caps (LEVERAGED, ALTERNATIVE)
        if self.has_risk_buckets:
            risk_bucket_margins = self._compute_risk_bucket_margins(allocation, asset_by_id, profile)
            constraints.extend(risk_bucket_margins)
        
        # Compute summary
        summary = self._compute_summary(constraints)
        
        # Compute quality score
        quality_score = self._compute_quality_score(constraints)
        
        # Generate recommendations
        recommendations = self._generate_recommendations(constraints, profile)
        
        # Phase 1.2: Generate exposures
        exposures = None
        if include_exposures:
            exposures = self._compute_exposures(allocation, asset_by_id)
        
        # Phase 1.3: Generate ticker mapping
        ticker_mapping = None
        execution_summary = None
        if include_ticker_mapping:
            ticker_mapping, execution_summary = self._compute_ticker_mapping(allocation, asset_by_id)
        
        return ConstraintReport(
            profile_name=profile.name,
            constraints=constraints,
            summary=summary,
            quality_score=quality_score,
            recommendations=recommendations,
            exposures=exposures,
            ticker_mapping=ticker_mapping,
            execution_summary=execution_summary,
        )
    
    def _get_asset_id(self, asset: Any) -> str:
        """Extrait l'ID d'un asset."""
        if hasattr(asset, 'id'):
            return asset.id
        if isinstance(asset, dict):
            return asset.get('id') or asset.get('ticker') or str(id(asset))
        return str(id(asset))
    
    def _get_asset_attr(self, asset: Any, attr: str, default: Any = None) -> Any:
        """Extrait un attribut d'un asset (dataclass ou dict)."""
        if hasattr(asset, attr):
            return getattr(asset, attr)
        if isinstance(asset, dict):
            return asset.get(attr, default)
        return default
    
    # ============= PHASE 1.2: EXPOSURES =============
    
    def _compute_exposures(
        self,
        allocation: Dict[str, float],
        asset_by_id: Dict[str, Any],
    ) -> ExposureReport:
        """
        Phase 1.2: Calcule les expositions détaillées.
        
        Returns:
            ExposureReport avec breakdown complet
        """
        by_category = defaultdict(float)
        by_sector = defaultdict(float)
        by_region = defaultdict(float)
        by_risk_bucket = defaultdict(float)
        by_role = defaultdict(float)
        
        weights_list = []
        
        for aid, weight in allocation.items():
            if weight <= 0:
                continue
            
            weights_list.append(weight)
            asset = asset_by_id.get(aid)
            
            if not asset:
                by_category["Unknown"] += weight
                by_sector["Unknown"] += weight
                by_region["Unknown"] += weight
                by_risk_bucket["unknown"] += weight
                by_role["unknown"] += weight
                continue
            
            # Category
            category = self._get_asset_attr(asset, 'category', 'Unknown')
            by_category[category] += weight
            
            # Sector
            sector = self._get_asset_attr(asset, 'sector', 'Unknown')
            by_sector[sector] += weight
            
            # Region
            region = self._get_asset_attr(asset, 'region', 'Global')
            by_region[region] += weight
            
            # Risk bucket
            risk_bucket = self._get_asset_attr(asset, '_risk_bucket', 'unknown')
            if not risk_bucket:
                # Fallback basé sur category
                if category == "Obligations":
                    risk_bucket = "bond_like"
                elif category == "Actions":
                    risk_bucket = "equity_like"
                elif category == "Crypto":
                    risk_bucket = "crypto"
                else:
                    risk_bucket = "equity_like"
            by_risk_bucket[risk_bucket] += weight
            
            # Role (bucket CORE/DEFENSIVE/etc.)
            role = self._get_asset_attr(asset, 'role')
            if role:
                role_value = role.value if hasattr(role, 'value') else str(role)
                by_role[role_value] += weight
            else:
                by_role["unassigned"] += weight
        
        # Concentration metrics
        sorted_weights = sorted(weights_list, reverse=True)
        top_5_weight = sum(sorted_weights[:5]) if len(sorted_weights) >= 5 else sum(sorted_weights)
        top_10_weight = sum(sorted_weights[:10]) if len(sorted_weights) >= 10 else sum(sorted_weights)
        
        hhi = compute_hhi(weights_list)
        effective_n = compute_effective_n(weights_list)
        
        # Déterminer le niveau de concentration
        if hhi < 1000:
            concentration_level = "well_diversified"
        elif hhi < 1500:
            concentration_level = "diversified"
        elif hhi < 2500:
            concentration_level = "moderately_concentrated"
        else:
            concentration_level = "highly_concentrated"
        
        concentration = {
            "hhi": round(hhi, 0),
            "hhi_interpretation": concentration_level,
            "effective_n": effective_n,
            "n_positions": len(weights_list),
            "top_5_weight": round(top_5_weight, 2),
            "top_10_weight": round(top_10_weight, 2),
            "largest_position": round(sorted_weights[0], 2) if sorted_weights else 0,
            "smallest_position": round(sorted_weights[-1], 2) if sorted_weights else 0,
            "thresholds": {
                "well_diversified": "HHI < 1000",
                "diversified": "HHI 1000-1500",
                "moderately_concentrated": "HHI 1500-2500",
                "highly_concentrated": "HHI > 2500",
            },
        }
        
        return ExposureReport(
            by_category=dict(by_category),
            by_sector=dict(by_sector),
            by_region=dict(by_region),
            by_risk_bucket=dict(by_risk_bucket),
            by_role=dict(by_role),
            concentration=concentration,
        )
    
    # ============= PHASE 1.3: TICKER MAPPING =============
    
    def _compute_ticker_mapping(
        self,
        allocation: Dict[str, float],
        asset_by_id: Dict[str, Any],
    ) -> Tuple[List[TickerMapping], Dict[str, Any]]:
        """
        Phase 1.3: Génère le mapping tickers pour exécution.
        
        Returns:
            (List[TickerMapping], execution_summary)
        """
        mappings = []
        exchanges = set()
        missing_isin = 0
        missing_ticker = 0
        
        # Trier par poids décroissant
        sorted_allocation = sorted(allocation.items(), key=lambda x: -x[1])
        
        for aid, weight in sorted_allocation:
            if weight <= 0:
                continue
            
            asset = asset_by_id.get(aid)
            
            if not asset:
                # Asset non trouvé, créer un mapping minimal
                mappings.append(TickerMapping(
                    id=aid,
                    ticker=aid,
                    isin=None,
                    name=f"Unknown ({aid})",
                    weight_pct=weight,
                    category="Unknown",
                    risk_bucket="unknown",
                    sector="Unknown",
                    region="Unknown",
                    exchange=None,
                ))
                missing_isin += 1
                continue
            
            # Extraire les informations
            ticker = self._get_asset_attr(asset, 'ticker') or \
                     self._get_asset_attr(asset, 'symbol') or \
                     aid
            
            # Chercher ISIN dans source_data si disponible
            source_data = self._get_asset_attr(asset, 'source_data', {})
            isin = None
            exchange = None
            
            if isinstance(source_data, dict):
                isin = source_data.get('isin') or source_data.get('ISIN')
                exchange = source_data.get('exchange') or source_data.get('Exchange') or \
                           source_data.get('market') or source_data.get('Market')
            
            if not isin:
                isin = self._get_asset_attr(asset, 'isin')
            
            if not exchange:
                exchange = self._get_asset_attr(asset, 'exchange')
            
            # Statistiques
            if not isin:
                missing_isin += 1
            if ticker == aid and not self._get_asset_attr(asset, 'ticker'):
                missing_ticker += 1
            if exchange:
                exchanges.add(exchange)
            
            # Risk bucket
            risk_bucket = self._get_asset_attr(asset, '_risk_bucket', '')
            if not risk_bucket:
                category = self._get_asset_attr(asset, 'category', '')
                if category == "Obligations":
                    risk_bucket = "bond_like"
                elif category == "Actions":
                    risk_bucket = "equity_like"
                elif category == "Crypto":
                    risk_bucket = "crypto"
                else:
                    risk_bucket = "equity_like"
            
            mappings.append(TickerMapping(
                id=aid,
                ticker=ticker,
                isin=isin,
                name=self._get_asset_attr(asset, 'name', aid)[:60],
                weight_pct=weight,
                category=self._get_asset_attr(asset, 'category', 'Unknown'),
                risk_bucket=risk_bucket,
                sector=self._get_asset_attr(asset, 'sector', 'Unknown'),
                region=self._get_asset_attr(asset, 'region', 'Unknown'),
                exchange=exchange,
            ))
        
        # Execution summary
        execution_summary = {
            "n_positions": len(mappings),
            "n_exchanges": len(exchanges),
            "exchanges": sorted(list(exchanges)) if exchanges else [],
            "total_weight": round(sum(m.weight_pct for m in mappings), 2),
            "missing_isin": missing_isin,
            "missing_ticker": missing_ticker,
            "data_quality": {
                "isin_coverage": round((len(mappings) - missing_isin) / max(len(mappings), 1) * 100, 1),
                "ticker_coverage": round((len(mappings) - missing_ticker) / max(len(mappings), 1) * 100, 1),
            },
            "ready_for_execution": missing_ticker == 0,
        }
        
        return mappings, execution_summary
    
    # ============= INDIVIDUAL CONSTRAINT METHODS =============
    
    def _compute_vol_margin(
        self,
        allocation: Dict[str, float],
        candidates: List[Any],
        profile: Any,
        cov_diagnostics: Optional[Dict],
    ) -> Optional[ConstraintMargin]:
        """Calcule le margin pour la volatilité."""
        # Utiliser la vol du rapport si disponible
        if cov_diagnostics and "portfolio_vol" in cov_diagnostics:
            observed_vol = cov_diagnostics["portfolio_vol"]
        else:
            # Estimation simple
            total_weight = sum(allocation.values())
            if total_weight == 0:
                return None
            
            asset_by_id = {self._get_asset_id(a): a for a in candidates}
            weighted_vol = 0.0
            for aid, weight in allocation.items():
                asset = asset_by_id.get(aid)
                if asset:
                    vol = self._get_asset_attr(asset, 'vol_annual', 15.0)
                    weighted_vol += (weight / 100) * vol
            observed_vol = weighted_vol
        
        vol_target = profile.vol_target
        vol_tolerance = profile.vol_tolerance
        
        # Pour volatilité, on veut être dans [target - tol, target + tol]
        diff = abs(observed_vol - vol_target)
        slack = vol_tolerance - diff
        
        if slack < -CRITICAL_VIOLATION_PCT:
            status = ConstraintStatus.CRITICAL
        elif slack < 0:
            status = ConstraintStatus.VIOLATED
        elif slack < BINDING_THRESHOLD_PCT:
            status = ConstraintStatus.BINDING
        else:
            status = ConstraintStatus.OK
        
        return ConstraintMargin(
            name="volatility",
            constraint_type="target",
            cap=vol_target,
            observed=round(observed_vol, 2),
            slack=round(slack, 2),
            binding=slack < BINDING_THRESHOLD_PCT and slack >= 0,
            status=status,
            details={
                "tolerance": vol_tolerance,
                "range_min": vol_target - vol_tolerance,
                "range_max": vol_target + vol_tolerance,
                "diff_from_target": round(observed_vol - vol_target, 2),
            },
        )
    
    def _compute_bonds_margin(
        self,
        allocation: Dict[str, float],
        asset_by_id: Dict[str, Any],
        profile: Any,
    ) -> ConstraintMargin:
        """Calcule le margin pour bonds_min."""
        bonds_weight = 0.0
        bonds_count = 0
        bonds_details = []
        
        for aid, weight in allocation.items():
            asset = asset_by_id.get(aid)
            if asset and self._get_asset_attr(asset, 'category') == "Obligations":
                bonds_weight += weight
                bonds_count += 1
                bonds_details.append({
                    "id": aid,
                    "name": self._get_asset_attr(asset, 'name', aid)[:30],
                    "weight": round(weight, 2),
                })
        
        return _compute_margin(
            name="bonds_min",
            constraint_type="min",
            cap=profile.bonds_min,
            observed=bonds_weight,
            details={
                "count": bonds_count,
                "breakdown": bonds_details,
            },
        )
    
    def _compute_crypto_margin(
        self,
        allocation: Dict[str, float],
        asset_by_id: Dict[str, Any],
        profile: Any,
    ) -> Optional[ConstraintMargin]:
        """Calcule le margin pour crypto_max."""
        if profile.crypto_max == 0:
            # Vérifier qu'il n'y a pas de crypto
            crypto_weight = sum(
                weight for aid, weight in allocation.items()
                if asset_by_id.get(aid) and 
                self._get_asset_attr(asset_by_id[aid], 'category') == "Crypto"
            )
            if crypto_weight > 0:
                return ConstraintMargin(
                    name="crypto_max",
                    constraint_type="max",
                    cap=0,
                    observed=crypto_weight,
                    slack=-crypto_weight,
                    binding=False,
                    status=ConstraintStatus.VIOLATED,
                    details={"message": "Crypto forbidden for this profile"},
                )
            return None  # N/A
        
        crypto_weight = 0.0
        crypto_details = []
        
        for aid, weight in allocation.items():
            asset = asset_by_id.get(aid)
            if asset and self._get_asset_attr(asset, 'category') == "Crypto":
                crypto_weight += weight
                crypto_details.append({
                    "id": aid,
                    "name": self._get_asset_attr(asset, 'name', aid)[:30],
                    "weight": round(weight, 2),
                })
        
        return _compute_margin(
            name="crypto_max",
            constraint_type="max",
            cap=profile.crypto_max,
            observed=crypto_weight,
            details={"breakdown": crypto_details},
        )
    
    def _compute_position_margins(
        self,
        allocation: Dict[str, float],
        asset_by_id: Dict[str, Any],
        profile: Any,
    ) -> List[ConstraintMargin]:
        """Calcule les margins pour max_single_position."""
        margins = []
        max_pos = profile.max_single_position
        
        # Trouver la position la plus grande
        if not allocation:
            return margins
        
        max_weight = max(allocation.values())
        max_asset_id = max(allocation.items(), key=lambda x: x[1])[0]
        max_asset = asset_by_id.get(max_asset_id)
        
        margin = _compute_margin(
            name="max_single_position",
            constraint_type="max",
            cap=max_pos,
            observed=max_weight,
            details={
                "largest_position": {
                    "id": max_asset_id,
                    "name": self._get_asset_attr(max_asset, 'name', max_asset_id)[:40] if max_asset else max_asset_id,
                    "weight": round(max_weight, 2),
                },
                "positions_above_10pct": [
                    {"id": aid, "weight": round(w, 2)}
                    for aid, w in allocation.items() if w > 10
                ],
            },
        )
        margins.append(margin)
        
        return margins
   def _compute_sector_margins(
        self,
        allocation: Dict[str, float],
        asset_by_id: Dict[str, Any],
        profile: Any,
    ) -> List[ConstraintMargin]:
        """
        Calcule les margins pour max_sector.
        
        IMPORTANT v7.0: Seuls les actifs EQUITY_LIKE comptent.
        Les obligations sont exclues car "Bonds" n'est pas un secteur économique.
        """
        sector_weights = defaultdict(float)
        sector_weights_all = defaultdict(float)
        
        for aid, weight in allocation.items():
            asset = asset_by_id.get(aid)
            if not asset:
                continue
            
            sector = self._get_asset_attr(asset, 'sector', 'Unknown')
            sector_weights_all[sector] += weight
            
            # Ne compter que les equity-like pour max_sector
            if self._counts_in_max_sector(asset):
                sector_weights[sector] += weight
        
        margins = []
        
        if sector_weights:
            max_sector_weight = max(sector_weights.values())
            max_sector = max(sector_weights.items(), key=lambda x: x[1])[0]
        else:
            max_sector_weight = 0
            max_sector = "N/A (no equity-like assets)"
        
        margin = _compute_margin(
            name="max_sector",
            constraint_type="max",
            cap=profile.max_sector,
            observed=max_sector_weight,
            details={
                "most_concentrated": max_sector,
                "counts_in_max_sector": {k: round(v, 2) for k, v in sorted(sector_weights.items(), key=lambda x: -x[1])},
                "all_sectors": {k: round(v, 2) for k, v in sorted(sector_weights_all.items(), key=lambda x: -x[1])},
                "scope": "EQUITY_LIKE only (excludes Bonds)",
            },
        )
        margins.append(margin)
        
        return margins

    def _compute_region_margins(
        self,
        allocation: Dict[str, float],
        asset_by_id: Dict[str, Any],
        profile: Any,
    ) -> List[ConstraintMargin]:
        """
        Calcule les margins pour max_region.
        
        IMPORTANT v7.0: Seuls les actifs EQUITY_LIKE et LEVERAGED comptent.
        Le fallback utilise category pour classifier si _risk_bucket est absent.
        """
        region_weights = defaultdict(float)
        region_weights_all = defaultdict(float)
        
        for aid, weight in allocation.items():
            asset = asset_by_id.get(aid)
            if not asset:
                continue
            
            region = self._get_asset_attr(asset, 'region', 'Global')
            region_weights_all[region] += weight
            
            counts = self._counts_in_max_region(asset)
            
            if counts:
                region_weights[region] += weight
        
        margins = []
        
        if region_weights:
            max_region_weight = max(region_weights.values())
            max_region = max(region_weights.items(), key=lambda x: x[1])[0]
        else:
            max_region_weight = 0
            max_region = "N/A (no equity-like assets)"
        
        margin = _compute_margin(
            name="max_region",
            constraint_type="max",
            cap=profile.max_region,
            observed=max_region_weight,
            details={
                "most_concentrated": max_region,
                "counts_in_max_region": {k: round(v, 2) for k, v in sorted(region_weights.items(), key=lambda x: -x[1])},
                "all_regions": {k: round(v, 2) for k, v in sorted(region_weights_all.items(), key=lambda x: -x[1])},
                "scope": "EQUITY_LIKE + LEVERAGED only",
            },
        )
        margins.append(margin)
        
        return margins

    def _counts_in_max_region(self, asset: Any) -> bool:
        """
        Détermine si un actif compte dans la contrainte max_region.
        
        Returns True si l'actif est EQUITY_LIKE ou LEVERAGED.
        Utilise un fallback sur category si _risk_bucket est absent ou "unknown".
        """
        bucket_str = self._get_asset_attr(asset, '_risk_bucket')
        
        # Utiliser risk_bucket SEULEMENT si c'est une classification valide (pas "unknown")
        if bucket_str and bucket_str != "unknown":
            try:
                bucket = RiskBucket(bucket_str)
                return bucket in [RiskBucket.EQUITY_LIKE, RiskBucket.LEVERAGED]
            except ValueError:
                pass
        
        # Fallback pour unknown OU missing risk_bucket
        category = self._get_asset_attr(asset, 'category', '')
        name = self._get_asset_attr(asset, 'name', '')
        
        if category == "Actions":
            return True
        
        if category == "Obligations":
            return False
        
        if category == "Crypto":
            return False
        
        if category == "ETF":
            name_lower = name.lower() if name else ""
            
            if any(kw in name_lower for kw in ["leveraged", "2x", "3x", "ultra"]):
                return True
            
            if any(kw in name_lower for kw in ["bond", "treasury", "fixed income", "aggregate"]):
                return False
            
            return True
        
        return False
    def _counts_in_max_sector(self, asset: Any) -> bool:
        """
        Détermine si un actif compte dans la contrainte max_sector.
        
        Seuls les actifs EQUITY_LIKE comptent (Actions et ETF actions).
        Les obligations (BOND_LIKE) sont exclues car "Bonds" n'est pas un secteur.
        """
        bucket_str = self._get_asset_attr(asset, '_risk_bucket')
        
        # Utiliser risk_bucket SEULEMENT si c'est une classification valide (pas "unknown")
        if bucket_str and bucket_str != "unknown":
            try:
                bucket = RiskBucket(bucket_str)
                return bucket in [RiskBucket.EQUITY_LIKE, RiskBucket.LEVERAGED]
            except ValueError:
                pass
        
        # Fallback pour unknown OU missing risk_bucket
        category = self._get_asset_attr(asset, 'category', '')
        name = self._get_asset_attr(asset, 'name', '')
        
        if category == "Actions":
            return True
        
        if category in ["Obligations", "Crypto"]:
            return False
        
        if category == "ETF":
            name_lower = name.lower() if name else ""
            
            if any(kw in name_lower for kw in ["leveraged", "2x", "3x", "ultra"]):
                return True
            
            if any(kw in name_lower for kw in ["bond", "treasury", "fixed income", "aggregate"]):
                return False
            
            return True
        
        return False
        

    def _compute_count_margins(
        self,
        allocation: Dict[str, float],
        profile: Any,
    ) -> List[ConstraintMargin]:
        """Calcule les margins pour min/max assets."""
        n_assets = len([w for w in allocation.values() if w > 0.5])
        
        margins = []
        
        margins.append(_compute_margin(
            name="min_assets",
            constraint_type="min",
            cap=profile.min_assets,
            observed=n_assets,
            details={},
        ))
        
        margins.append(_compute_margin(
            name="max_assets",
            constraint_type="max",
            cap=profile.max_assets,
            observed=n_assets,
            details={},
        ))
        
        return margins

    
    def _compute_bucket_margins(
        self,
        allocation: Dict[str, float],
        asset_by_id: Dict[str, Any],
        profile: Any,
    ) -> List[ConstraintMargin]:
        """Calcule les margins pour les bucket constraints."""
        # Import bucket targets
        try:
            from portfolio_engine.preset_meta import PROFILE_BUCKET_TARGETS, Role
        except ImportError:
            return []
        
        bucket_targets = PROFILE_BUCKET_TARGETS.get(profile.name, {})
        if not bucket_targets:
            return []
        
        # Calculer les poids par bucket
        bucket_weights = defaultdict(float)
        
        for aid, weight in allocation.items():
            asset = asset_by_id.get(aid)
            if asset:
                role = self._get_asset_attr(asset, 'role')
                if role:
                    role_value = role.value if hasattr(role, 'value') else str(role)
                    bucket_weights[role_value] += weight
        
        margins = []
        
        for role in Role:
            if role not in bucket_targets:
                continue
            
            min_pct, max_pct = bucket_targets[role]
            observed = bucket_weights.get(role.value, 0)
            
            # Min constraint
            min_slack = observed - (min_pct * 100)
            # Max constraint
            max_slack = (max_pct * 100) - observed
            
            # Le slack effectif est le min des deux
            if min_slack < 0:
                slack = min_slack
                status = ConstraintStatus.VIOLATED if min_slack < -CRITICAL_VIOLATION_PCT else ConstraintStatus.VIOLATED
            elif max_slack < 0:
                slack = max_slack
                status = ConstraintStatus.VIOLATED
            else:
                slack = min(min_slack, max_slack)
                status = ConstraintStatus.BINDING if slack < BINDING_THRESHOLD_PCT else ConstraintStatus.OK
            
            margins.append(ConstraintMargin(
                name=f"bucket_{role.value}",
                constraint_type="range",
                cap=max_pct * 100,  # Afficher le max
                observed=round(observed, 2),
                slack=round(slack, 2),
                binding=slack < BINDING_THRESHOLD_PCT and slack >= 0,
                status=status,
                details={
                    "range_min": round(min_pct * 100, 1),
                    "range_max": round(max_pct * 100, 1),
                    "slack_from_min": round(min_slack, 2),
                    "slack_from_max": round(max_slack, 2),
                },
            ))
        
        return margins
    
    def _compute_risk_bucket_margins(
        self,
        allocation: Dict[str, float],
        asset_by_id: Dict[str, Any],
        profile: Any,
    ) -> List[ConstraintMargin]:
        """Calcule les margins pour LEVERAGED et ALTERNATIVE caps."""
        margins = []
        
        # Calculer les poids par risk_bucket
        risk_bucket_weights = defaultdict(float)
        
        for aid, weight in allocation.items():
            asset = asset_by_id.get(aid)
            if not asset:
                continue
            
            bucket_str = self._get_asset_attr(asset, '_risk_bucket')
            if bucket_str:
                risk_bucket_weights[bucket_str] += weight
        
        # LEVERAGED cap
        leveraged_cap = LEVERAGED_CAP.get(profile.name, 0.0)
        leveraged_observed = risk_bucket_weights.get("leveraged", 0)
        
        if leveraged_cap == 0 and leveraged_observed > 0:
            # Interdit mais présent
            margins.append(ConstraintMargin(
                name="leveraged_cap",
                constraint_type="max",
                cap=0,
                observed=leveraged_observed,
                slack=-leveraged_observed,
                binding=False,
                status=ConstraintStatus.VIOLATED,
                details={"message": f"LEVERAGED forbidden for {profile.name}"},
            ))
        elif leveraged_cap > 0:
            margins.append(_compute_margin(
                name="leveraged_cap",
                constraint_type="max",
                cap=leveraged_cap,
                observed=leveraged_observed,
                details={},
            ))
        
        # ALTERNATIVE cap
        alternative_cap = ALTERNATIVE_CAP.get(profile.name, 5.0)
        alternative_observed = risk_bucket_weights.get("alternative", 0)
        
        margins.append(_compute_margin(
            name="alternative_cap",
            constraint_type="max",
            cap=alternative_cap,
            observed=alternative_observed,
            details={
                "includes": ["Derivative Income", "Defined Outcome", "Allocation funds"],
            },
        ))
        
        return margins
    
    # ============= SUMMARY & RECOMMENDATIONS =============
    
    def _compute_summary(self, constraints: List[ConstraintMargin]) -> Dict[str, int]:
        """Calcule le résumé des statuts."""
        summary = {
            "total": len(constraints),
            "ok": 0,
            "binding": 0,
            "violated": 0,
            "critical": 0,
        }
        
        for c in constraints:
            if c.status == ConstraintStatus.OK:
                summary["ok"] += 1
            elif c.status == ConstraintStatus.BINDING:
                summary["binding"] += 1
            elif c.status == ConstraintStatus.VIOLATED:
                summary["violated"] += 1
            elif c.status == ConstraintStatus.CRITICAL:
                summary["critical"] += 1
        
        return summary
    
    def _compute_quality_score(self, constraints: List[ConstraintMargin]) -> float:
        """
        Calcule un score de qualité 0-100.
        
        - Chaque contrainte OK = 100 / n_constraints points
        - BINDING = 80% des points
        - VIOLATED = 0 points
        - CRITICAL = -20% des points
        """
        if not constraints:
            return 100.0
        
        n = len(constraints)
        points_per_constraint = 100.0 / n
        
        total_score = 0.0
        for c in constraints:
            if c.status == ConstraintStatus.OK:
                total_score += points_per_constraint
            elif c.status == ConstraintStatus.BINDING:
                total_score += points_per_constraint * 0.8
            elif c.status == ConstraintStatus.VIOLATED:
                total_score += 0
            elif c.status == ConstraintStatus.CRITICAL:
                total_score -= points_per_constraint * 0.2
        
        return max(0, min(100, total_score))
    
    def _generate_recommendations(
        self,
        constraints: List[ConstraintMargin],
        profile: Any,
    ) -> List[str]:
        """Génère des recommandations basées sur les violations/bindings."""
        recommendations = []
        
        for c in constraints:
            if c.status == ConstraintStatus.CRITICAL:
                recommendations.append(
                    f"🔴 CRITICAL: {c.name} violated by {abs(c.slack):.1f}% — immediate action required"
                )
            elif c.status == ConstraintStatus.VIOLATED:
                recommendations.append(
                    f"🟠 VIOLATED: {c.name} exceeded by {abs(c.slack):.1f}% — reduce exposure"
                )
            elif c.status == ConstraintStatus.BINDING:
                if c.constraint_type == "max":
                    recommendations.append(
                        f"🟡 BINDING: {c.name} at {c.observed:.1f}% (cap={c.cap:.1f}%) — monitor closely"
                    )
        
        # Recommandations générales
        n_binding = sum(1 for c in constraints if c.status == ConstraintStatus.BINDING)
        if n_binding >= 3:
            recommendations.append(
                f"⚠️ {n_binding} constraints are binding — consider relaxing profile or reducing positions"
            )
        
        return recommendations


# ============= CONVENIENCE FUNCTIONS =============

def generate_constraint_report(
    allocation: Dict[str, float],
    candidates: List[Any],
    profile: Any,
    cov_diagnostics: Optional[Dict] = None,
    include_exposures: bool = True,
    include_ticker_mapping: bool = True,
) -> Dict[str, Any]:
    """
    Fonction de commodité pour générer un rapport de contraintes.
    
    Returns:
        Dict prêt pour JSON avec toutes les margins, exposures et mapping
    """
    generator = ConstraintReportGenerator()
    report = generator.generate(
        allocation, 
        candidates, 
        profile, 
        cov_diagnostics,
        include_exposures=include_exposures,
        include_ticker_mapping=include_ticker_mapping,
    )
    return report.to_dict()


def generate_exposures_only(
    allocation: Dict[str, float],
    candidates: List[Any],
) -> Dict[str, Any]:
    """
    Phase 1.2: Génère uniquement le rapport d'expositions.
    
    Returns:
        Dict avec exposures détaillées
    """
    generator = ConstraintReportGenerator()
    asset_by_id = {generator._get_asset_id(a): a for a in candidates}
    exposures = generator._compute_exposures(allocation, asset_by_id)
    return exposures.to_dict()


def generate_ticker_mapping_only(
    allocation: Dict[str, float],
    candidates: List[Any],
) -> Dict[str, Any]:
    """
    Phase 1.3: Génère uniquement le mapping tickers.
    
    Returns:
        Dict avec ticker_mapping et execution_summary
    """
    generator = ConstraintReportGenerator()
    asset_by_id = {generator._get_asset_id(a): a for a in candidates}
    mappings, summary = generator._compute_ticker_mapping(allocation, asset_by_id)
    return {
        "ticker_mapping": [m.to_dict() for m in mappings],
        "execution_summary": summary,
    }


# ============= INTEGRATION HELPERS =============

def enrich_diagnostics_with_margins(
    diagnostics: Dict[str, Any],
    allocation: Dict[str, float],
    candidates: List[Any],
    profile: Any,
) -> Dict[str, Any]:
    """
    Enrichit les diagnostics existants avec le rapport de contraintes.
    
    v2.0: Inclut exposures et ticker_mapping.
    
    Usage dans optimizer.py:
        diagnostics = enrich_diagnostics_with_margins(diagnostics, allocation, candidates, profile)
    """
    report = generate_constraint_report(
        allocation=allocation,
        candidates=candidates,
        profile=profile,
        cov_diagnostics=diagnostics,
        include_exposures=True,
        include_ticker_mapping=True,
    )
    
    diagnostics["constraint_report"] = report
    diagnostics["constraint_summary"] = report["summary"]
    diagnostics["constraint_quality_score"] = report["quality_score"]
    diagnostics["constraint_violations"] = [
        c for c in report["constraints"] 
        if c["status"] in ["VIOLATED", "CRITICAL"]
    ]
    diagnostics["constraint_bindings"] = [
        c for c in report["constraints"]
        if c["status"] == "BINDING"
    ]
    
    # Phase 1.2: Exposures au top-level
    if "exposures" in report:
        diagnostics["exposures"] = report["exposures"]
    
    # Phase 1.3: Execution summary au top-level
    if "execution_summary" in report:
        diagnostics["execution_summary"] = report["execution_summary"]
    
    return diagnostics
