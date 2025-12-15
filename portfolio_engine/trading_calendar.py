# portfolio_engine/trading_calendar.py
"""
Gestion du calendrier multi-actifs SANS ffill().

ChatGPT v2.0 Audit - Q9: "Comment alignes-tu actions (5/7) vs crypto (7/7) sans ffill()?"
Réponse: Ce module.

Stratégie:
1. Utiliser le calendrier NYSE comme référence (jours ouvrés US)
2. Pour chaque actif, ne garder QUE les jours où NYSE est ouvert
3. Les NaN sont traités par exclusion ou interpolation explicite (jamais ffill implicite)
4. Les returns sont calculés APRÈS alignement, pas avant

⚠️ INTERDIT: ffill() sur les prix (casse la covariance)
✅ AUTORISÉ: interpolation explicite avec documentation

NOTE: Renamed from calendar.py to trading_calendar.py to avoid shadowing
      Python's standard library 'calendar' module.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timedelta
import logging
from dataclasses import dataclass

logger = logging.getLogger("portfolio_engine.trading_calendar")


@dataclass
class CalendarAlignmentReport:
    """Rapport d'alignement calendrier."""
    original_dates: int
    aligned_dates: int
    removed_dates: int
    nan_before: Dict[str, float]  # % NaN par symbole avant
    nan_after: Dict[str, float]   # % NaN par symbole après
    symbols_excluded: List[str]   # Symboles avec trop de NaN
    alignment_method: str
    warnings: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "original_dates": self.original_dates,
            "aligned_dates": self.aligned_dates,
            "removed_dates": self.removed_dates,
            "nan_before_avg_pct": round(np.mean(list(self.nan_before.values())) * 100, 2) if self.nan_before else 0,
            "nan_after_avg_pct": round(np.mean(list(self.nan_after.values())) * 100, 2) if self.nan_after else 0,
            "symbols_excluded": self.symbols_excluded,
            "alignment_method": self.alignment_method,
            "warnings": self.warnings,
        }


# =============================================================================
# CALENDRIER NYSE (jours ouvrés US)
# =============================================================================

def get_nyse_calendar(start_date: str, end_date: str) -> pd.DatetimeIndex:
    """
    Génère le calendrier NYSE (jours ouvrés US).
    
    Note: Utilise pandas bdate_range comme approximation.
    Pour production, utiliser pandas_market_calendars.
    """
    # Jours ouvrés de base
    business_days = pd.bdate_range(start=start_date, end=end_date)
    
    # TODO: Exclure les jours fériés US (MLK, Presidents Day, etc.)
    # Pour l'instant, approximation avec bdate_range
    
    return business_days


def get_crypto_calendar(start_date: str, end_date: str) -> pd.DatetimeIndex:
    """Génère le calendrier crypto (24/7)."""
    return pd.date_range(start=start_date, end=end_date, freq='D')


# =============================================================================
# ALIGNEMENT MULTI-ACTIFS
# =============================================================================

def align_to_reference_calendar(
    prices_df: pd.DataFrame,
    reference_calendar: str = "NYSE",
    max_nan_pct: float = 0.05,
    interpolation_method: Optional[str] = None,  # None = pas d'interpolation
) -> Tuple[pd.DataFrame, CalendarAlignmentReport]:
    """
    Aligne les prix sur un calendrier de référence SANS ffill().
    
    Args:
        prices_df: DataFrame des prix (colonnes = symboles, index = dates)
        reference_calendar: "NYSE" ou "ALL"
        max_nan_pct: Seuil max de NaN accepté par symbole (défaut 5%)
        interpolation_method: "linear" ou None (interdit ffill)
    
    Returns:
        Tuple (DataFrame aligné, CalendarAlignmentReport)
    
    Raises:
        ValueError: Si trop de NaN après alignement
    
    ⚠️ IMPORTANT: Cette fonction n'utilise JAMAIS ffill() sur les prix.
    Les NaN sont soit:
    - Exclus (jours supprimés)
    - Interpolés linéairement (documenté)
    - Cause d'exclusion du symbole (si > max_nan_pct)
    """
    warnings = []
    original_dates = len(prices_df)
    
    # Calculer % NaN avant alignement
    nan_before = (prices_df.isna().sum() / len(prices_df)).to_dict()
    
    # Déterminer le calendrier de référence
    start_date = prices_df.index.min().strftime("%Y-%m-%d")
    end_date = prices_df.index.max().strftime("%Y-%m-%d")
    
    if reference_calendar == "NYSE":
        ref_calendar = get_nyse_calendar(start_date, end_date)
        method = "NYSE_business_days"
    else:
        ref_calendar = prices_df.index
        method = "all_available_days"
    
    # Aligner sur le calendrier de référence
    aligned_df = prices_df.reindex(ref_calendar)
    aligned_dates = len(aligned_df)
    removed_dates = original_dates - aligned_dates
    
    logger.info(f"Calendar alignment: {original_dates} → {aligned_dates} dates (removed {removed_dates})")
    
    # Calculer % NaN après alignement
    nan_after_raw = (aligned_df.isna().sum() / len(aligned_df)).to_dict()
    
    # Identifier les symboles avec trop de NaN
    symbols_excluded = []
    for symbol, nan_pct in nan_after_raw.items():
        if nan_pct > max_nan_pct:
            symbols_excluded.append(symbol)
            warnings.append(f"{symbol}: {nan_pct:.1%} NaN > {max_nan_pct:.0%} threshold")
            logger.warning(f"Symbol {symbol} excluded: {nan_pct:.1%} NaN > {max_nan_pct:.0%}")
    
    # Exclure les symboles problématiques
    if symbols_excluded:
        aligned_df = aligned_df.drop(columns=symbols_excluded, errors='ignore')
    
    nan_after = (aligned_df.isna().sum() / len(aligned_df)).to_dict()
    
    # Interpolation si demandée (JAMAIS ffill)
    if interpolation_method == "linear":
        # Interpolation linéaire explicite
        before_nan = aligned_df.isna().sum().sum()
        aligned_df = aligned_df.interpolate(method='linear', limit=3, limit_direction='both')
        after_nan = aligned_df.isna().sum().sum()
        
        if before_nan > after_nan:
            warnings.append(f"Linear interpolation applied: {before_nan} → {after_nan} NaN")
            logger.info(f"Linear interpolation: {before_nan} → {after_nan} NaN")
    elif interpolation_method is not None:
        raise ValueError(f"Unknown interpolation method: {interpolation_method}. Use 'linear' or None.")
    
    # Vérification finale: supprimer les lignes avec NaN restants
    rows_before = len(aligned_df)
    aligned_df = aligned_df.dropna(how='any')
    rows_after = len(aligned_df)
    
    if rows_before > rows_after:
        dropped = rows_before - rows_after
        warnings.append(f"Dropped {dropped} rows with remaining NaN")
        logger.info(f"Dropped {dropped} rows with remaining NaN")
    
    if len(aligned_df) < 20:
        raise ValueError(f"Not enough data after alignment: {len(aligned_df)} < 20 days")
    
    report = CalendarAlignmentReport(
        original_dates=original_dates,
        aligned_dates=len(aligned_df),
        removed_dates=original_dates - len(aligned_df),
        nan_before=nan_before,
        nan_after=nan_after,
        symbols_excluded=symbols_excluded,
        alignment_method=method,
        warnings=warnings,
    )
    
    return aligned_df, report


def compute_returns_after_alignment(
    prices_df: pd.DataFrame,
    method: str = "simple"
) -> pd.DataFrame:
    """
    Calcule les returns APRÈS alignement (jamais avant).
    
    Args:
        prices_df: DataFrame aligné (sans NaN)
        method: "simple" ou "log"
    
    Returns:
        DataFrame des returns
    """
    if prices_df.isna().any().any():
        raise ValueError("prices_df contains NaN - must be aligned first")
    
    if method == "simple":
        returns = prices_df.pct_change()
    elif method == "log":
        returns = np.log(prices_df / prices_df.shift(1))
    else:
        raise ValueError(f"Unknown method: {method}")
    
    # Supprimer la première ligne (NaN du pct_change)
    returns = returns.iloc[1:]
    
    # Vérifier pas de NaN (sécurité)
    if returns.isna().any().any():
        raise ValueError("Returns contain NaN after computation - data issue")
    
    return returns


# =============================================================================
# DETECTION CRYPTO vs EQUITY
# =============================================================================

def detect_asset_calendar(
    prices_series: pd.Series,
    threshold_weekend_pct: float = 0.10
) -> str:
    """
    Détecte si un actif est crypto (7/7) ou equity (5/7).
    
    Args:
        prices_series: Série de prix avec index datetime
        threshold_weekend_pct: Si > X% des jours sont weekend → crypto
    
    Returns:
        "crypto" ou "equity"
    """
    dates = prices_series.dropna().index
    if len(dates) < 20:
        return "unknown"
    
    # Compter les jours de weekend
    weekend_days = dates[dates.dayofweek >= 5]
    weekend_pct = len(weekend_days) / len(dates)
    
    if weekend_pct > threshold_weekend_pct:
        return "crypto"
    else:
        return "equity"


def categorize_assets_by_calendar(
    prices_df: pd.DataFrame
) -> Dict[str, List[str]]:
    """
    Catégorise les actifs par type de calendrier.
    
    Returns:
        {"crypto": [...], "equity": [...], "unknown": [...]}
    """
    categories = {"crypto": [], "equity": [], "unknown": []}
    
    for symbol in prices_df.columns:
        cal_type = detect_asset_calendar(prices_df[symbol])
        categories[cal_type].append(symbol)
    
    logger.info(f"Asset calendars: {len(categories['equity'])} equity, {len(categories['crypto'])} crypto")
    
    return categories


# =============================================================================
# VALIDATION
# =============================================================================

def validate_no_ffill_contamination(
    prices_df: pd.DataFrame,
    max_consecutive_same: int = 5
) -> List[str]:
    """
    Vérifie qu'il n'y a pas de ffill() caché (prix identiques consécutifs).
    
    Returns:
        Liste des symboles suspects
    """
    suspects = []
    
    for symbol in prices_df.columns:
        series = prices_df[symbol].dropna()
        if len(series) < 10:
            continue
        
        # Compter les séquences de prix identiques
        same_as_prev = (series == series.shift(1))
        consecutive_same = same_as_prev.groupby((~same_as_prev).cumsum()).cumsum()
        max_consecutive = consecutive_same.max()
        
        if max_consecutive > max_consecutive_same:
            suspects.append(symbol)
            logger.warning(
                f"{symbol}: {max_consecutive} consecutive identical prices - possible ffill contamination"
            )
    
    return suspects
