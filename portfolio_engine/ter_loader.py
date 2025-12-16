# portfolio_engine/ter_loader.py
"""
Chargement des TER (Total Expense Ratio) depuis les fichiers CSV.

V1.0.0 (2025-12-16):
- Charge les TER depuis combined_etfs.csv et combined_bonds.csv
- Calcule le TER pondéré d'un portfolio
- Actions directes ont TER = 0

IMPORTANT: Les TER sont déjà inclus dans les prix ETF (adjusted close).
Ce module sert à EXPOSER l'info, pas à déduire les TER une seconde fois.

Ref: ChatGPT audit - "utilise les TER réels, pas un hardcode"
"""

import pandas as pd
import logging
from pathlib import Path
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

__version__ = "1.0.0"


# =============================================================================
# TER LOADING FROM CSV FILES
# =============================================================================

def load_ter_from_csv(
    etf_csv_path: str = "data/combined_etfs.csv",
    bonds_csv_path: str = "data/combined_bonds.csv",
) -> Dict[str, float]:
    """
    Charge les TER depuis les fichiers CSV.
    
    Les fichiers doivent avoir une colonne 'ticker' et 'total_expense_ratio'.
    Le TER est en décimal (ex: 0.0020 = 0.20% = 20bp).
    
    Args:
        etf_csv_path: Chemin vers combined_etfs.csv
        bonds_csv_path: Chemin vers combined_bonds.csv
    
    Returns:
        Dict {ticker: ter_bp} où ter_bp est en basis points (ex: 20.0 pour 0.20%)
    """
    ter_by_ticker: Dict[str, float] = {}
    
    # === ETFs ===
    etf_path = Path(etf_csv_path)
    if etf_path.exists():
        try:
            df_etf = pd.read_csv(etf_path)
            
            # Trouver les colonnes ticker et TER
            ticker_col = _find_column(df_etf, ["ticker", "symbol", "Ticker", "Symbol"])
            ter_col = _find_column(df_etf, ["total_expense_ratio", "ter", "expense_ratio", "TER"])
            
            if ticker_col and ter_col:
                for _, row in df_etf.iterrows():
                    ticker = str(row[ticker_col]).strip().upper()
                    ter_value = row[ter_col]
                    
                    if pd.notna(ter_value) and ticker:
                        # Convertir en basis points
                        ter_decimal = float(ter_value)
                        if ter_decimal > 1:
                            # Déjà en bp ou pourcentage
                            ter_bp = ter_decimal if ter_decimal < 100 else ter_decimal / 100
                        else:
                            # En décimal (ex: 0.0020 → 20bp)
                            ter_bp = ter_decimal * 10000
                        
                        ter_by_ticker[ticker] = round(ter_bp, 2)
                
                logger.info(f"Loaded {len(ter_by_ticker)} TERs from {etf_path.name}")
            else:
                logger.warning(f"Could not find ticker/TER columns in {etf_path.name}")
                
        except Exception as e:
            logger.warning(f"Error loading ETF TERs from {etf_path}: {e}")
    else:
        logger.debug(f"ETF CSV not found: {etf_path}")
    
    # === Bonds ===
    bonds_path = Path(bonds_csv_path)
    if bonds_path.exists():
        try:
            df_bonds = pd.read_csv(bonds_path)
            
            ticker_col = _find_column(df_bonds, ["ticker", "symbol", "Ticker", "Symbol"])
            ter_col = _find_column(df_bonds, ["total_expense_ratio", "ter", "expense_ratio", "TER"])
            
            if ticker_col and ter_col:
                n_loaded = 0
                for _, row in df_bonds.iterrows():
                    ticker = str(row[ticker_col]).strip().upper()
                    ter_value = row[ter_col]
                    
                    if pd.notna(ter_value) and ticker and ticker not in ter_by_ticker:
                        ter_decimal = float(ter_value)
                        if ter_decimal > 1:
                            ter_bp = ter_decimal if ter_decimal < 100 else ter_decimal / 100
                        else:
                            ter_bp = ter_decimal * 10000
                        
                        ter_by_ticker[ticker] = round(ter_bp, 2)
                        n_loaded += 1
                
                logger.info(f"Loaded {n_loaded} additional TERs from {bonds_path.name}")
                
        except Exception as e:
            logger.warning(f"Error loading bond TERs from {bonds_path}: {e}")
    else:
        logger.debug(f"Bonds CSV not found: {bonds_path}")
    
    logger.info(f"Total TERs loaded: {len(ter_by_ticker)} tickers")
    return ter_by_ticker


def _find_column(df: pd.DataFrame, candidates: list) -> Optional[str]:
    """Trouve la première colonne correspondante dans le DataFrame."""
    for col in candidates:
        if col in df.columns:
            return col
        # Case-insensitive search
        for df_col in df.columns:
            if df_col.lower() == col.lower():
                return df_col
    return None


# =============================================================================
# WEIGHTED TER CALCULATION
# =============================================================================

def compute_weighted_ter(
    weights: Dict[str, float],
    ter_by_ticker: Dict[str, float],
    default_ter_bp: float = 0.0,
) -> Tuple[float, Dict[str, float], Dict]:
    """
    Calcule le TER pondéré d'un portfolio.
    
    Args:
        weights: Dict {ticker: weight} où weight est en décimal (ex: 0.14 = 14%)
        ter_by_ticker: Dict {ticker: ter_bp} où ter_bp est en basis points
        default_ter_bp: TER par défaut pour les tickers sans TER connu (0 pour actions)
    
    Returns:
        Tuple (weighted_ter_bp, ter_by_ticker_used, diagnostics)
        - weighted_ter_bp: TER pondéré en basis points
        - ter_by_ticker_used: Dict des TER utilisés pour chaque ticker
        - diagnostics: Dict avec statistiques
    
    Example:
        >>> weights = {"QQQ": 0.30, "AAPL": 0.20, "AGG": 0.50}
        >>> ter_by_ticker = {"QQQ": 20.0, "AGG": 4.0}
        >>> ter, used, diag = compute_weighted_ter(weights, ter_by_ticker)
        >>> print(f"Portfolio TER: {ter:.1f}bp")
        Portfolio TER: 8.0bp
    """
    ter_used: Dict[str, float] = {}
    weighted_sum = 0.0
    total_weight = 0.0
    
    tickers_with_ter = []
    tickers_without_ter = []
    tickers_assumed_zero = []
    
    for ticker, weight in weights.items():
        ticker_upper = ticker.upper()
        
        if ticker_upper in ter_by_ticker:
            ter = ter_by_ticker[ticker_upper]
            ter_used[ticker] = ter
            tickers_with_ter.append(ticker)
        else:
            # Actions directes → TER = 0 (pas de frais de gestion)
            ter = default_ter_bp
            ter_used[ticker] = ter
            
            if default_ter_bp == 0:
                tickers_assumed_zero.append(ticker)
            else:
                tickers_without_ter.append(ticker)
        
        weighted_sum += weight * ter
        total_weight += weight
    
    # TER pondéré
    if total_weight > 0:
        weighted_ter_bp = weighted_sum / total_weight
    else:
        weighted_ter_bp = 0.0
    
    # Diagnostics
    diagnostics = {
        "weighted_ter_bp": round(weighted_ter_bp, 2),
        "weighted_ter_pct": round(weighted_ter_bp / 100, 4),
        "n_tickers_total": len(weights),
        "n_tickers_with_ter": len(tickers_with_ter),
        "n_tickers_assumed_zero": len(tickers_assumed_zero),
        "n_tickers_defaulted": len(tickers_without_ter),
        "tickers_with_ter": tickers_with_ter[:10],  # Limit for logging
        "tickers_assumed_zero": tickers_assumed_zero[:10],
        "coverage_pct": round(len(tickers_with_ter) / max(1, len(weights)) * 100, 1),
        "default_ter_bp_used": default_ter_bp,
    }
    
    logger.info(
        f"Weighted TER: {weighted_ter_bp:.1f}bp "
        f"({len(tickers_with_ter)}/{len(weights)} tickers with TER data, "
        f"{len(tickers_assumed_zero)} assumed 0 for stocks)"
    )
    
    return round(weighted_ter_bp, 2), ter_used, diagnostics


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def get_portfolio_ter_info(
    weights: Dict[str, float],
    etf_csv_path: str = "data/combined_etfs.csv",
    bonds_csv_path: str = "data/combined_bonds.csv",
) -> Dict:
    """
    Fonction de commodité pour obtenir toutes les infos TER d'un portfolio.
    
    Args:
        weights: Dict {ticker: weight}
        etf_csv_path: Chemin vers combined_etfs.csv
        bonds_csv_path: Chemin vers combined_bonds.csv
    
    Returns:
        Dict avec weighted_ter_bp, ter_by_ticker, et diagnostics
    """
    # Charger les TER
    ter_by_ticker = load_ter_from_csv(etf_csv_path, bonds_csv_path)
    
    # Calculer le TER pondéré
    weighted_ter, ter_used, diagnostics = compute_weighted_ter(weights, ter_by_ticker)
    
    return {
        "weighted_ter_bp": weighted_ter,
        "weighted_ter_pct": round(weighted_ter / 100, 4),
        "ter_by_ticker": ter_used,
        "ter_source": {
            "etf_csv": etf_csv_path,
            "bonds_csv": bonds_csv_path,
        },
        "diagnostics": diagnostics,
        "note": "TER is already embedded in ETF adjusted close prices - this is INFO ONLY, not deducted separately",
    }


# =============================================================================
# CLI / DEBUG
# =============================================================================

if __name__ == "__main__":
    # Test avec un portfolio fictif
    import sys
    
    logging.basicConfig(level=logging.INFO)
    
    # Charger les TER
    ter_data = load_ter_from_csv()
    
    print(f"\n📊 TER Data Summary")
    print(f"   Total tickers with TER: {len(ter_data)}")
    
    if ter_data:
        # Top 10 TER les plus élevés
        sorted_ter = sorted(ter_data.items(), key=lambda x: x[1], reverse=True)[:10]
        print(f"\n   Top 10 highest TER:")
        for ticker, ter in sorted_ter:
            print(f"      {ticker}: {ter:.1f}bp ({ter/100:.2f}%)")
        
        # Top 10 TER les plus bas (>0)
        sorted_ter_low = sorted([(t, v) for t, v in ter_data.items() if v > 0], key=lambda x: x[1])[:10]
        print(f"\n   Top 10 lowest TER (>0):")
        for ticker, ter in sorted_ter_low:
            print(f"      {ticker}: {ter:.1f}bp ({ter/100:.2f}%)")
    
    # Test weighted calculation
    test_weights = {
        "QQQ": 0.20,
        "AAPL": 0.15,
        "MSFT": 0.15,
        "AGG": 0.20,
        "URTH": 0.15,
        "IEF": 0.15,
    }
    
    info = get_portfolio_ter_info(test_weights)
    print(f"\n📋 Test Portfolio TER:")
    print(f"   Weighted TER: {info['weighted_ter_bp']:.1f}bp ({info['weighted_ter_pct']:.2%})")
    print(f"   Coverage: {info['diagnostics']['coverage_pct']}%")
