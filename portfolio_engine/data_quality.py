# portfolio_engine/data_quality.py
"""
Contrôles de qualité des données.

ChatGPT v2.0 Audit:
- Q10: "Quels sont tes seuils de rejet data?"
- Q14: "As-tu une couverture univers coverage?"
- Q15: "As-tu un data freshness SLA?"

Réponse: Ce module.

v1.1 (2026-01-14): Ajout sanity check volatilité générique (Étape 1.1)
"""

import pandas as pd
import numpy as np
import math
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import logging

logger = logging.getLogger("portfolio_engine.data_quality")


# =============================================================================
# SEUILS DE REJET (Q10)
# =============================================================================

@dataclass
class DataQualityThresholds:
    """Seuils de rejet pour la qualité des données."""
    
    # NaN
    max_nan_pct: float = 0.05          # 5% max de NaN
    max_nan_consecutive: int = 5        # Max 5 NaN consécutifs
    
    # Prix
    min_price: float = 0.01             # Prix minimum
    max_price_change_pct: float = 50.0  # Max 50% de variation journalière
    
    # Returns
    max_daily_return: float = 0.50      # 50% max return journalier
    min_daily_return: float = -0.50     # -50% min return journalier
    
    # Historique
    min_history_days: int = 60          # 60 jours minimum
    
    # Freshness
    max_stale_days: int = 3             # Données max 3 jours de retard


DEFAULT_THRESHOLDS = DataQualityThresholds()


# =============================================================================
# DATA QUALITY REPORT (Q10)
# =============================================================================

@dataclass
class DataQualityIssue:
    """Un problème de qualité détecté."""
    symbol: str
    issue_type: str
    severity: str  # "warning", "error", "critical"
    description: str
    value: Optional[float] = None
    threshold: Optional[float] = None


@dataclass
class DataQualityReport:
    """
    Rapport complet de qualité des données.
    
    Si passed=False et severity="critical", blocage de la génération.
    """
    timestamp: str
    
    # Résultat global
    passed: bool
    n_symbols_checked: int
    n_symbols_passed: int
    n_symbols_rejected: int
    
    # Détails
    issues: List[DataQualityIssue] = field(default_factory=list)
    rejected_symbols: List[str] = field(default_factory=list)
    rejection_reasons: Dict[str, str] = field(default_factory=dict)
    
    # Statistiques
    nan_stats: Dict[str, float] = field(default_factory=dict)
    return_stats: Dict[str, float] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "passed": self.passed,
            "n_symbols_checked": self.n_symbols_checked,
            "n_symbols_passed": self.n_symbols_passed,
            "n_symbols_rejected": self.n_symbols_rejected,
            "rejection_rate_pct": round(self.n_symbols_rejected / max(1, self.n_symbols_checked) * 100, 1),
            "issues": [
                {
                    "symbol": i.symbol,
                    "type": i.issue_type,
                    "severity": i.severity,
                    "description": i.description,
                }
                for i in self.issues[:20]  # Limiter à 20
            ],
            "rejected_symbols": self.rejected_symbols,
            "nan_stats": self.nan_stats,
            "return_stats": self.return_stats,
        }


# =============================================================================
# DATA QUALITY CHECKER
# =============================================================================

class DataQualityChecker:
    """
    Vérifie la qualité des données de prix.
    
    Usage:
        checker = DataQualityChecker()
        report = checker.check(prices_df)
        if not report.passed:
            raise DataQualityError(report.issues)
    """
    
    def __init__(self, thresholds: DataQualityThresholds = None):
        self.thresholds = thresholds or DEFAULT_THRESHOLDS
    
    def check(self, prices_df: pd.DataFrame) -> DataQualityReport:
        """
        Vérifie la qualité des données de prix.
        
        Args:
            prices_df: DataFrame des prix (colonnes = symboles, index = dates)
        
        Returns:
            DataQualityReport
        """
        issues = []
        rejected = []
        rejection_reasons = {}
        nan_stats = {}
        return_stats = {}
        
        for symbol in prices_df.columns:
            series = prices_df[symbol]
            symbol_issues = self._check_symbol(symbol, series)
            
            # Agréger les issues
            critical_issues = [i for i in symbol_issues if i.severity == "critical"]
            
            if critical_issues:
                rejected.append(symbol)
                rejection_reasons[symbol] = critical_issues[0].description
            
            issues.extend(symbol_issues)
            
            # Stats
            nan_stats[symbol] = round(series.isna().mean() * 100, 2)
        
        # Stats globales des returns
        returns = prices_df.pct_change().dropna()
        if len(returns) > 0:
            return_stats = {
                "mean_daily_pct": round(returns.mean().mean() * 100, 4),
                "max_daily_pct": round(returns.max().max() * 100, 2),
                "min_daily_pct": round(returns.min().min() * 100, 2),
                "std_daily_pct": round(returns.std().mean() * 100, 4),
            }
        
        n_checked = len(prices_df.columns)
        n_rejected = len(rejected)
        n_passed = n_checked - n_rejected
        
        # Passed si moins de 20% rejetés
        passed = (n_rejected / max(1, n_checked)) < 0.20
        
        return DataQualityReport(
            timestamp=datetime.now().isoformat(),
            passed=passed,
            n_symbols_checked=n_checked,
            n_symbols_passed=n_passed,
            n_symbols_rejected=n_rejected,
            issues=issues,
            rejected_symbols=rejected,
            rejection_reasons=rejection_reasons,
            nan_stats=nan_stats,
            return_stats=return_stats,
        )
    
    def _check_symbol(self, symbol: str, series: pd.Series) -> List[DataQualityIssue]:
        """Vérifie un symbole individuel."""
        issues = []
        
        # 1. NaN percentage
        nan_pct = series.isna().mean()
        if nan_pct > self.thresholds.max_nan_pct:
            issues.append(DataQualityIssue(
                symbol=symbol,
                issue_type="nan_excessive",
                severity="critical" if nan_pct > 0.20 else "warning",
                description=f"NaN {nan_pct:.1%} > {self.thresholds.max_nan_pct:.0%} threshold",
                value=nan_pct,
                threshold=self.thresholds.max_nan_pct,
            ))
        
        # 2. Prix <= 0
        non_nan = series.dropna()
        if (non_nan <= 0).any():
            n_bad = (non_nan <= 0).sum()
            issues.append(DataQualityIssue(
                symbol=symbol,
                issue_type="price_negative",
                severity="critical",
                description=f"{n_bad} prices <= 0",
                value=n_bad,
            ))
        
        # 3. Historique minimum
        if len(non_nan) < self.thresholds.min_history_days:
            issues.append(DataQualityIssue(
                symbol=symbol,
                issue_type="history_short",
                severity="critical",
                description=f"Only {len(non_nan)} days < {self.thresholds.min_history_days} required",
                value=len(non_nan),
                threshold=self.thresholds.min_history_days,
            ))
        
        # 4. Returns extrêmes
        if len(non_nan) > 1:
            returns = non_nan.pct_change().dropna()
            
            extreme_up = (returns > self.thresholds.max_daily_return).sum()
            extreme_down = (returns < self.thresholds.min_daily_return).sum()
            
            if extreme_up > 0:
                max_ret = returns.max()
                issues.append(DataQualityIssue(
                    symbol=symbol,
                    issue_type="return_extreme_up",
                    severity="warning",
                    description=f"{extreme_up} days with return > {self.thresholds.max_daily_return:.0%} (max: {max_ret:.0%})",
                    value=max_ret,
                    threshold=self.thresholds.max_daily_return,
                ))
            
            if extreme_down > 0:
                min_ret = returns.min()
                issues.append(DataQualityIssue(
                    symbol=symbol,
                    issue_type="return_extreme_down",
                    severity="warning",
                    description=f"{extreme_down} days with return < {self.thresholds.min_daily_return:.0%} (min: {min_ret:.0%})",
                    value=min_ret,
                    threshold=self.thresholds.min_daily_return,
                ))
        
        # 5. NaN consécutifs
        nan_mask = series.isna()
        if nan_mask.any():
            consecutive = nan_mask.astype(int).groupby((~nan_mask).cumsum()).cumsum()
            max_consecutive = consecutive.max()
            
            if max_consecutive > self.thresholds.max_nan_consecutive:
                issues.append(DataQualityIssue(
                    symbol=symbol,
                    issue_type="nan_consecutive",
                    severity="warning",
                    description=f"{max_consecutive} consecutive NaN > {self.thresholds.max_nan_consecutive} threshold",
                    value=max_consecutive,
                    threshold=self.thresholds.max_nan_consecutive,
                ))
        
        return issues


# =============================================================================
# UNIVERSE COVERAGE (Q14)
# =============================================================================

@dataclass
class UniverseCoverageReport:
    """Rapport de couverture de l'univers."""
    total_requested: int
    total_resolved: int
    total_with_data: int
    coverage_pct: float
    
    rejected_no_ticker: List[str] = field(default_factory=list)
    rejected_no_data: List[str] = field(default_factory=list)
    rejected_quality: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_requested": self.total_requested,
            "total_resolved": self.total_resolved,
            "total_with_data": self.total_with_data,
            "coverage_pct": round(self.coverage_pct, 1),
            "rejected_no_ticker": self.rejected_no_ticker[:10],
            "rejected_no_data": self.rejected_no_data[:10],
            "rejected_quality": self.rejected_quality[:10],
        }


# =============================================================================
# DATA FRESHNESS (Q15)
# =============================================================================

def check_data_freshness(
    prices_df: pd.DataFrame,
    max_stale_days: int = 3
) -> Tuple[bool, Dict[str, Any]]:
    """
    Vérifie que les données sont fraîches.
    
    Args:
        prices_df: DataFrame des prix
        max_stale_days: Nombre max de jours de retard
    
    Returns:
        Tuple (is_fresh, details)
    """
    if len(prices_df) == 0:
        return False, {"error": "Empty DataFrame"}
    
    last_date = prices_df.index.max()
    today = datetime.now().date()
    
    # Exclure weekends
    expected_date = today
    while expected_date.weekday() >= 5:  # Samedi ou Dimanche
        expected_date -= timedelta(days=1)
    
    stale_days = (expected_date - last_date.date()).days
    is_fresh = stale_days <= max_stale_days
    
    details = {
        "last_data_date": last_date.strftime("%Y-%m-%d"),
        "expected_date": expected_date.strftime("%Y-%m-%d"),
        "stale_days": stale_days,
        "max_stale_days": max_stale_days,
        "is_fresh": is_fresh,
    }
    
    if not is_fresh:
        logger.warning(f"Data is stale: {stale_days} days old (max: {max_stale_days})")
    
    return is_fresh, details


# =============================================================================
# VOLATILITY SANITY CHECK v1.0 (Étape 1.1 - 2026-01-14)
# =============================================================================
# Corrige les volatilités aberrantes de manière GÉNÉRIQUE
# (pas de hardcoding par pays comme UK)
# =============================================================================

# Seuils de volatilité par type d'actif
VOL_THRESHOLDS = {
    "equity": {
        "suspect_threshold": 150,    # Vol > 150% = suspect pour equity
        "invalid_threshold": 300,    # Vol > 300% = invalide
        "valid_range": (5, 100),     # Range acceptable après correction
    },
    "etf": {
        "suspect_threshold": 100,
        "invalid_threshold": 250,
        "valid_range": (3, 80),
    },
    "bond": {
        "suspect_threshold": 50,
        "invalid_threshold": 100,
        "valid_range": (1, 30),
    },
    "crypto": {
        "suspect_threshold": 300,    # Crypto peut être très volatile
        "invalid_threshold": 500,
        "valid_range": (20, 200),
    },
}

# Champs de volatilité à vérifier
VOL_FIELDS = ["vol_3y", "vol30", "vol_annual", "vol", "vol_pct", "volatility_3y"]


def _fnum(x) -> float:
    """Conversion robuste vers float."""
    if x is None:
        return 0.0
    if isinstance(x, (int, float)):
        if math.isnan(x):
            return 0.0
        return float(x)
    try:
        s = re.sub(r"[^0-9.\-]", "", str(x))
        return float(s) if s not in ("", "-", ".", "-.") else 0.0
    except:
        return 0.0


def _is_leveraged_asset(asset: dict) -> bool:
    """Vérifie si l'actif est leveraged (ETF 2x, 3x, etc.)."""
    # Champ leverage explicite
    leverage = asset.get("leverage")
    if leverage and str(leverage).strip() not in ("", "0", "1", "none", "nan", "n/a"):
        return True
    
    # Patterns dans le nom
    name = str(asset.get("name") or "").lower()
    etf_type = str(asset.get("etf_type") or "").lower()
    
    leveraged_patterns = ["2x", "3x", "-2x", "-3x", "ultra", "leveraged", "inverse", "bear", "short"]
    
    for pattern in leveraged_patterns:
        if pattern in name or pattern in etf_type:
            return True
    
    return False


def _try_rescale_volatility(vol: float, valid_range: Tuple[float, float]) -> Tuple[Optional[float], Optional[int]]:
    """
    Tente de rescaler une volatilité vers un range valide.
    
    Args:
        vol: Volatilité originale
        valid_range: (min, max) du range acceptable
    
    Returns:
        (vol_corrigée, facteur) ou (None, None) si échec
    """
    min_valid, max_valid = valid_range
    
    # Essayer différents facteurs de division
    for factor in [100, 10]:
        rescaled = vol / factor
        if min_valid <= rescaled <= max_valid:
            return round(rescaled, 4), factor
    
    return None, None


def sanitize_volatility(asset: dict) -> dict:
    """
    Corrige les volatilités aberrantes de manière GÉNÉRIQUE.
    
    Règle:
    1. Si vol > seuil_suspect ET actif n'est PAS crypto/leveraged:
       - Tenter rescaling: vol/100, vol/10
       - Si rescalé dans range valide: ACCEPTER + LOG
       - Sinon: FLAGGER comme suspect
    
    Args:
        asset: Dictionnaire de l'actif
    
    Returns:
        Asset modifié avec champs de correction si applicable:
        - _vol_rescaled: True si corrigé
        - _vol_original: Valeur originale
        - _vol_correction_factor: Facteur de division appliqué
        - _vol_suspect: True si non corrigeable
        - _vol_correction_reason: Raison de la correction
    
    Example:
        >>> asset = {"symbol": "GSK", "vol_3y": 376.12, "category": "equity"}
        >>> sanitize_volatility(asset)
        >>> asset["vol_3y"]
        3.7612  # Corrigé (÷100)
        >>> asset["_vol_rescaled"]
        True
    """
    # Déterminer le type d'actif
    category = str(asset.get("category", "") or "").lower()
    if category not in VOL_THRESHOLDS:
        category = "equity"  # Default
    
    thresholds = VOL_THRESHOLDS[category]
    
    # Vérifier si c'est un actif leveraged (ne pas corriger)
    is_leveraged = _is_leveraged_asset(asset)
    if is_leveraged:
        return asset
    
    # Parcourir tous les champs de volatilité
    for field in VOL_FIELDS:
        vol_raw = asset.get(field)
        if vol_raw is None:
            continue
        
        vol = _fnum(vol_raw)
        if vol <= 0:
            continue
        
        # Vérifier si la vol est suspecte
        if vol > thresholds["suspect_threshold"]:
            symbol = asset.get("symbol") or asset.get("id") or asset.get("name") or "?"
            
            # Tenter le rescaling
            corrected, factor = _try_rescale_volatility(vol, thresholds["valid_range"])
            
            if corrected is not None:
                # Correction réussie
                asset[field] = corrected
                asset["_vol_rescaled"] = True
                asset["_vol_original"] = vol
                asset["_vol_correction_factor"] = factor
                asset["_vol_correction_reason"] = f"rescaled_by_{factor}"
                asset["_vol_field_corrected"] = field
                
                logger.warning(
                    f"[VOL SANITY] Corrected {symbol} ({category}): "
                    f"{field}={vol:.2f}% → {corrected:.2f}% (÷{factor})"
                )
            else:
                # Impossible à corriger → flagger comme suspect
                if vol > thresholds["invalid_threshold"]:
                    asset["_vol_suspect"] = True
                    asset["_vol_suspect_value"] = vol
                    asset["_vol_suspect_field"] = field
                    
                    logger.warning(
                        f"[VOL SANITY] SUSPECT {symbol} ({category}): "
                        f"{field}={vol:.2f}% > {thresholds['invalid_threshold']}% (cannot rescale)"
                    )
    
    return asset


def batch_sanitize_volatility(assets: List[dict]) -> Tuple[List[dict], Dict]:
    """
    Applique sanitize_volatility sur une liste d'actifs.
    
    Args:
        assets: Liste des actifs
    
    Returns:
        (assets_modifiés, statistiques)
    
    Example:
        >>> assets, stats = batch_sanitize_volatility(raw_assets)
        >>> print(stats)
        {
            "total": 1006,
            "corrected": 12,
            "suspect": 3,
            "by_category": {"equity": 8, "etf": 4},
            "corrections": [...]
        }
    """
    stats = {
        "total": len(assets),
        "corrected": 0,
        "suspect": 0,
        "by_category": {},
        "corrections": [],  # Liste des corrections pour audit
    }
    
    for asset in assets:
        # Avant correction
        was_corrected = asset.get("_vol_rescaled", False)
        was_suspect = asset.get("_vol_suspect", False)
        
        # Appliquer la correction
        sanitize_volatility(asset)
        
        # Compter les nouvelles corrections
        if asset.get("_vol_rescaled") and not was_corrected:
            stats["corrected"] += 1
            category = asset.get("category", "unknown")
            stats["by_category"][category] = stats["by_category"].get(category, 0) + 1
            
            # Log pour audit
            stats["corrections"].append({
                "symbol": asset.get("symbol") or asset.get("id"),
                "category": category,
                "field": asset.get("_vol_field_corrected"),
                "original": asset.get("_vol_original"),
                "corrected": asset.get(asset.get("_vol_field_corrected", "vol")),
                "factor": asset.get("_vol_correction_factor"),
            })
        
        if asset.get("_vol_suspect") and not was_suspect:
            stats["suspect"] += 1
    
    # Log résumé
    if stats["corrected"] > 0 or stats["suspect"] > 0:
        logger.info(
            f"[VOL SANITY] Batch complete: {stats['corrected']}/{stats['total']} corrected, "
            f"{stats['suspect']} suspect"
        )
        
        if stats["by_category"]:
            logger.info(f"[VOL SANITY] By category: {stats['by_category']}")
    
    return assets, stats


def validate_volatility_sanity(assets: List[dict]) -> Dict:
    """
    Valide que les volatilités sont dans des ranges acceptables.
    
    Utilisé pour les tests de non-régression.
    
    Returns:
        {
            "passed": bool,
            "violations": [...],
            "stats": {...}
        }
    """
    violations = []
    
    for asset in assets:
        category = str(asset.get("category", "equity")).lower()
        if category not in VOL_THRESHOLDS:
            category = "equity"
        
        thresholds = VOL_THRESHOLDS[category]
        market_cap = _fnum(asset.get("market_cap", 0))
        is_large_cap = market_cap > 50e9
        
        for field in VOL_FIELDS:
            vol = _fnum(asset.get(field, 0))
            if vol <= 0:
                continue
            
            symbol = asset.get("symbol") or asset.get("id") or "?"
            
            # Règle 1: Large cap ne doit pas avoir vol > 150%
            if is_large_cap and vol > 150:
                violations.append({
                    "symbol": symbol,
                    "rule": "large_cap_vol_max",
                    "field": field,
                    "value": vol,
                    "threshold": 150,
                    "market_cap": market_cap,
                })
            
            # Règle 2: Aucun equity ne doit avoir vol > 250%
            if category == "equity" and vol > 250:
                violations.append({
                    "symbol": symbol,
                    "rule": "equity_vol_max",
                    "field": field,
                    "value": vol,
                    "threshold": 250,
                })
    
    return {
        "passed": len(violations) == 0,
        "violation_count": len(violations),
        "violations": violations[:20],  # Limiter à 20 pour lisibilité
        "stats": {
            "total_assets": len(assets),
            "large_caps_checked": sum(1 for a in assets if _fnum(a.get("market_cap", 0)) > 50e9),
        }
    }
