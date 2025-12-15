# portfolio_engine/data_quality.py
"""
Contrôles de qualité des données.

ChatGPT v2.0 Audit:
- Q10: "Quels sont tes seuils de rejet data?"
- Q14: "As-tu une couverture univers coverage?"
- Q15: "As-tu un data freshness SLA?"

Réponse: Ce module.
"""

import pandas as pd
import numpy as np
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
