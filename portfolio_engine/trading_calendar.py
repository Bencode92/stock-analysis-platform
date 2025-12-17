# portfolio_engine/trading_calendar.py
"""
Gestion du calendrier multi-actifs avec ffill contrôlé.

v2.0 - P1 Fix: ffill contrôlé pour marchés non-US
- Ajout paramètre ffill_limit (défaut=3) après reindex
- Calcul %NaN APRÈS ffill (pas avant)
- Résout MUTHOOTFIN et autres actifs non-US (NSE, TSE, etc.)

v1.0 - ChatGPT v2.0 Audit - Q9: "Comment alignes-tu actions (5/7) vs crypto (7/7) sans ffill()?"
Réponse: Ce module.

Stratégie v2.0:
1. Utiliser le calendrier NYSE comme référence (jours ouvrés US)
2. Pour chaque actif, reindex sur NYSE
3. ffill CONTRÔLÉ (limit=3) pour combler les trous de calendrier (marché fermé)
4. Calculer %NaN APRÈS ffill → exclure seulement les vrais trous de données
5. Les returns sont calculés APRÈS alignement

⚠️ INTERDIT: ffill() SANS LIMITE (masque les vrais problèmes)
✅ AUTORISÉ: ffill(limit=3) pour trous calendrier (marché fermé = prix inchangé)

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
    nan_after_reindex: Dict[str, float]  # v2.0: % NaN après reindex (avant ffill)
    nan_after_ffill: Dict[str, float]    # v2.0: % NaN après ffill
    symbols_excluded: List[str]   # Symboles avec trop de NaN
    alignment_method: str
    ffill_limit: int              # v2.0: limite ffill utilisée
    ffill_applied: bool           # v2.0: si ffill a été appliqué
    warnings: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "original_dates": self.original_dates,
            "aligned_dates": self.aligned_dates,
            "removed_dates": self.removed_dates,
            "nan_before_avg_pct": round(np.mean(list(self.nan_before.values())) * 100, 2) if self.nan_before else 0,
            "nan_after_reindex_avg_pct": round(np.mean(list(self.nan_after_reindex.values())) * 100, 2) if self.nan_after_reindex else 0,
            "nan_after_ffill_avg_pct": round(np.mean(list(self.nan_after_ffill.values())) * 100, 2) if self.nan_after_ffill else 0,
            "symbols_excluded": self.symbols_excluded,
            "alignment_method": self.alignment_method,
            "ffill_limit": self.ffill_limit,
            "ffill_applied": self.ffill_applied,
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
# ALIGNEMENT MULTI-ACTIFS (v2.0 avec ffill contrôlé)
# =============================================================================

def align_to_reference_calendar(
    prices_df: pd.DataFrame,
    reference_calendar: str = "NYSE",
    max_nan_pct: float = 0.05,
    ffill_limit: int = 3,  # v2.0: NEW - limite ffill pour trous calendrier
    interpolation_method: Optional[str] = None,  # None = pas d'interpolation linéaire
) -> Tuple[pd.DataFrame, CalendarAlignmentReport]:
    """
    Aligne les prix sur un calendrier de référence avec ffill CONTRÔLÉ.
    
    v2.0 P1 Fix:
    - ffill(limit=3) après reindex pour combler les trous de calendrier
    - Un marché fermé = prix inchangé = return 0% ce jour-là
    - Calcul %NaN APRÈS ffill → exclure seulement les vrais trous
    
    Args:
        prices_df: DataFrame des prix (colonnes = symboles, index = dates)
        reference_calendar: "NYSE" ou "ALL"
        max_nan_pct: Seuil max de NaN accepté par symbole APRÈS ffill (défaut 5%)
        ffill_limit: Nombre max de jours consécutifs à forward-fill (défaut 3)
                     0 = pas de ffill (comportement v1.0)
        interpolation_method: "linear" ou None (en plus du ffill)
    
    Returns:
        Tuple (DataFrame aligné, CalendarAlignmentReport)
    
    Raises:
        ValueError: Si trop de NaN après alignement
    
    ⚠️ IMPORTANT v2.0:
    - ffill(limit=3) comble les trous de CALENDRIER (marché fermé)
    - Un trou > 3 jours consécutifs reste NaN → vraisemblablement un problème de data
    - Le %NaN est calculé APRÈS ffill pour ne pas exclure artificiellement
    """
    warnings = []
    original_dates = len(prices_df)
    
    # Calculer % NaN avant alignement (données brutes)
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
    
    # ========== ÉTAPE 1: REINDEX sur le calendrier de référence ==========
    aligned_df = prices_df.reindex(ref_calendar)
    aligned_dates = len(aligned_df)
    removed_dates = original_dates - aligned_dates
    
    logger.info(f"Calendar alignment: {original_dates} → {aligned_dates} dates (removed {removed_dates})")
    
    # Calculer % NaN APRÈS reindex (avant ffill) - pour diagnostic
    nan_after_reindex = (aligned_df.isna().sum() / len(aligned_df)).to_dict()
    
    # Log les symboles avec beaucoup de NaN après reindex (avant ffill)
    high_nan_symbols = {s: p for s, p in nan_after_reindex.items() if p > 0.01}
    if high_nan_symbols:
        logger.info(f"Symbols with >1% NaN after reindex (before ffill): {len(high_nan_symbols)}")
        for s, p in sorted(high_nan_symbols.items(), key=lambda x: -x[1])[:5]:
            logger.info(f"  {s}: {p:.1%} NaN (calendar mismatch)")
    
    # ========== ÉTAPE 2: FFILL CONTRÔLÉ (v2.0 P1 Fix) ==========
    ffill_applied = False
    if ffill_limit and ffill_limit > 0:
        nan_count_before_ffill = aligned_df.isna().sum().sum()
        
        # Forward-fill avec limite stricte
        # Logique: marché fermé → prix inchangé → return 0% ce jour-là
        aligned_df = aligned_df.ffill(limit=ffill_limit)
        
        nan_count_after_ffill = aligned_df.isna().sum().sum()
        filled_count = nan_count_before_ffill - nan_count_after_ffill
        
        if filled_count > 0:
            ffill_applied = True
            logger.info(
                f"✅ ffill(limit={ffill_limit}) applied: {filled_count} NaN filled "
                f"(calendar gaps ≤{ffill_limit} days)"
            )
            warnings.append(f"ffill(limit={ffill_limit}): {filled_count} values filled")
    else:
        logger.info("⚠️ ffill disabled (ffill_limit=0) - v1.0 behavior")
    
    # ========== ÉTAPE 3: CALCULER %NaN APRÈS FFILL ==========
    # C'est le calcul qui compte pour l'exclusion
    nan_after_ffill = (aligned_df.isna().sum() / len(aligned_df)).to_dict()
    
    # ========== ÉTAPE 4: IDENTIFIER LES SYMBOLES AVEC TROP DE NaN ==========
    # Maintenant basé sur nan_after_ffill (pas nan_after_reindex)
    symbols_excluded = []
    for symbol, nan_pct in nan_after_ffill.items():
        if nan_pct > max_nan_pct:
            symbols_excluded.append(symbol)
            # Log détaillé pour debug
            nan_reindex = nan_after_reindex.get(symbol, 0)
            warnings.append(
                f"{symbol}: {nan_pct:.1%} NaN after ffill > {max_nan_pct:.0%} threshold "
                f"(was {nan_reindex:.1%} after reindex)"
            )
            logger.warning(
                f"Symbol {symbol} excluded: {nan_pct:.1%} NaN after ffill > {max_nan_pct:.0%} "
                f"(reindex: {nan_reindex:.1%}, ffill recovered: {nan_reindex - nan_pct:.1%})"
            )
    
    # Exclure les symboles problématiques
    if symbols_excluded:
        aligned_df = aligned_df.drop(columns=symbols_excluded, errors='ignore')
        logger.info(f"Excluded {len(symbols_excluded)} symbols with too many NaN after ffill")
    else:
        logger.info(f"✅ All symbols passed NaN threshold ({max_nan_pct:.0%}) after ffill")
    
    # ========== ÉTAPE 5: INTERPOLATION LINÉAIRE (optionnelle) ==========
    if interpolation_method == "linear":
        # Interpolation linéaire explicite pour les NaN restants
        before_nan = aligned_df.isna().sum().sum()
        aligned_df = aligned_df.interpolate(method='linear', limit=3, limit_direction='both')
        after_nan = aligned_df.isna().sum().sum()
        
        if before_nan > after_nan:
            warnings.append(f"Linear interpolation applied: {before_nan} → {after_nan} NaN")
            logger.info(f"Linear interpolation: {before_nan} → {after_nan} NaN")
    elif interpolation_method is not None:
        raise ValueError(f"Unknown interpolation method: {interpolation_method}. Use 'linear' or None.")
    
    # ========== ÉTAPE 6: DROPNA FINAL ==========
    # Supprimer les lignes avec NaN restants (après ffill + interpolation)
    rows_before = len(aligned_df)
    aligned_df = aligned_df.dropna(how='any')
    rows_after = len(aligned_df)
    
    if rows_before > rows_after:
        dropped = rows_before - rows_after
        warnings.append(f"Dropped {dropped} rows with remaining NaN")
        logger.info(f"Dropped {dropped} rows with remaining NaN (edge effects)")
    
    if len(aligned_df) < 20:
        raise ValueError(f"Not enough data after alignment: {len(aligned_df)} < 20 days")
    
    # ========== RAPPORT ==========
    report = CalendarAlignmentReport(
        original_dates=original_dates,
        aligned_dates=len(aligned_df),
        removed_dates=original_dates - len(aligned_df),
        nan_before=nan_before,
        nan_after_reindex=nan_after_reindex,
        nan_after_ffill=nan_after_ffill,
        symbols_excluded=symbols_excluded,
        alignment_method=method,
        ffill_limit=ffill_limit,
        ffill_applied=ffill_applied,
        warnings=warnings,
    )
    
    logger.info(
        f"Calendar alignment complete: {len(aligned_df)} dates, "
        f"{len(aligned_df.columns)} symbols, "
        f"ffill={ffill_applied} (limit={ffill_limit})"
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
    Vérifie qu'il n'y a pas de ffill() EXCESSIF (prix identiques consécutifs > limite).
    
    v2.0: Ajusté pour tolérer ffill(limit=3) normal.
    
    Returns:
        Liste des symboles suspects (> max_consecutive_same jours identiques)
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
                f"{symbol}: {max_consecutive} consecutive identical prices - possible excessive ffill"
            )
    
    return suspects
