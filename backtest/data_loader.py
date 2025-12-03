# backtest/data_loader.py
"""
Chargement des données de prix historiques via Twelve Data API.

Documentation API: https://twelvedata.com/docs
Rate limit free tier: 8 requests/minute, 800/day
"""

import os
import time
import logging
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import requests
import pandas as pd

logger = logging.getLogger("backtest.data_loader")


class TwelveDataLoader:
    """
    Client pour l'API Twelve Data.
    Gère le rate limiting et le caching.
    """
    
    BASE_URL = "https://api.twelvedata.com"
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Args:
            api_key: Clé API Twelve Data (ou variable env TWELVE_DATA_API)
        """
        self.api_key = api_key or os.environ.get("TWELVE_DATA_API")
        if not self.api_key:
            raise ValueError(
                "Twelve Data API key required. "
                "Set TWELVE_DATA_API environment variable or pass api_key."
            )
        
        self.session = requests.Session()
        self.last_request_time = 0
        self.min_request_interval = 7.5  # 8 requests/minute = 1 every 7.5s
        self._cache: Dict[str, pd.DataFrame] = {}
    
    def _rate_limit(self):
        """Respecter le rate limit de l'API."""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_request_interval:
            sleep_time = self.min_request_interval - elapsed
            logger.debug(f"Rate limit: sleeping {sleep_time:.1f}s")
            time.sleep(sleep_time)
        self.last_request_time = time.time()
    
    def get_time_series(
        self,
        symbol: str,
        start_date: str,
        end_date: str,
        interval: str = "1day"
    ) -> Optional[pd.DataFrame]:
        """
        Récupère les prix historiques pour un symbole.
        
        Args:
            symbol: Ticker (ex: "AAPL", "BTC/USD")
            start_date: Date début "YYYY-MM-DD"
            end_date: Date fin "YYYY-MM-DD"
            interval: "1day", "1week", etc.
        
        Returns:
            DataFrame avec colonnes [open, high, low, close, volume]
            Index = datetime
        """
        cache_key = f"{symbol}_{start_date}_{end_date}_{interval}"
        if cache_key in self._cache:
            logger.debug(f"Cache hit: {symbol}")
            return self._cache[cache_key]
        
        self._rate_limit()
        
        params = {
            "symbol": symbol,
            "interval": interval,
            "start_date": start_date,
            "end_date": end_date,
            "apikey": self.api_key,
            "format": "JSON",
            "timezone": "America/New_York",
        }
        
        try:
            response = self.session.get(
                f"{self.BASE_URL}/time_series",
                params=params,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            
            if "code" in data and data["code"] != 200:
                logger.warning(f"API error for {symbol}: {data.get('message', 'Unknown')}")
                return None
            
            if "values" not in data:
                logger.warning(f"No data for {symbol}")
                return None
            
            df = pd.DataFrame(data["values"])
            df["datetime"] = pd.to_datetime(df["datetime"])
            df = df.set_index("datetime").sort_index()
            
            # Convertir en float
            for col in ["open", "high", "low", "close", "volume"]:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors="coerce")
            
            self._cache[cache_key] = df
            logger.info(f"Loaded {symbol}: {len(df)} days")
            return df
            
        except requests.RequestException as e:
            logger.error(f"Request error for {symbol}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error for {symbol}: {e}")
            return None
    
    def get_multiple_time_series(
        self,
        symbols: List[str],
        start_date: str,
        end_date: str,
        interval: str = "1day"
    ) -> pd.DataFrame:
        """
        Récupère les prix pour plusieurs symboles.
        
        Returns:
            DataFrame pivot avec colonnes = symboles, index = dates, valeurs = close
        """
        all_data = {}
        
        for i, symbol in enumerate(symbols):
            logger.info(f"Loading {symbol} ({i+1}/{len(symbols)})...")
            df = self.get_time_series(symbol, start_date, end_date, interval)
            
            if df is not None and "close" in df.columns:
                all_data[symbol] = df["close"]
            else:
                logger.warning(f"Skipping {symbol} - no data")
        
        if not all_data:
            raise ValueError("No data loaded for any symbol")
        
        prices_df = pd.DataFrame(all_data)
        prices_df = prices_df.sort_index()
        
        # Forward fill pour les jours manquants (weekends, holidays)
        prices_df = prices_df.ffill()
        
        logger.info(f"Loaded {len(prices_df.columns)} symbols, {len(prices_df)} days")
        return prices_df


def load_prices_for_backtest(
    config: dict,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    api_key: Optional[str] = None
) -> pd.DataFrame:
    """
    Charge les prix pour le backtest depuis la config.
    
    Args:
        config: Configuration chargée depuis portfolio_config.yaml
        start_date: Override date début (défaut: 90j avant aujourd'hui)
        end_date: Override date fin (défaut: aujourd'hui)
        api_key: Override clé API
    
    Returns:
        DataFrame des prix (colonnes = symboles, index = dates)
    """
    # Dates par défaut
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")
    if start_date is None:
        lookback = config.get("backtest", {}).get("default_lookback_days", 90)
        start_dt = datetime.now() - timedelta(days=lookback + 30)  # +30 pour marge
        start_date = start_dt.strftime("%Y-%m-%d")
    
    # Récupérer l'univers de test
    test_universe = config.get("backtest", {}).get("test_universe", {})
    symbols = []
    symbols.extend(test_universe.get("stocks", []))
    symbols.extend(test_universe.get("etfs", []))
    symbols.extend(test_universe.get("crypto", []))
    
    if not symbols:
        raise ValueError("No symbols defined in config.backtest.test_universe")
    
    logger.info(f"Loading {len(symbols)} symbols from {start_date} to {end_date}")
    
    loader = TwelveDataLoader(api_key=api_key)
    prices = loader.get_multiple_time_series(
        symbols=symbols,
        start_date=start_date,
        end_date=end_date
    )
    
    return prices


def compute_returns(prices: pd.DataFrame) -> pd.DataFrame:
    """Calcule les rendements journaliers."""
    return prices.pct_change().fillna(0)


def compute_rolling_metrics(
    prices: pd.DataFrame,
    window: int = 20
) -> Dict[str, pd.DataFrame]:
    """
    Calcule les métriques roulantes pour le scoring.
    
    Returns:
        Dict avec:
        - 'returns_1m': rendements 20j
        - 'returns_3m': rendements 60j
        - 'volatility': vol annualisée 20j
        - 'max_drawdown': DD max sur window
    """
    returns = prices.pct_change()
    
    metrics = {
        "returns_1m": prices.pct_change(20) * 100,  # En %
        "returns_3m": prices.pct_change(60) * 100,
        "volatility": returns.rolling(window).std() * (252 ** 0.5) * 100,  # Annualisée en %
    }
    
    # Max drawdown (simplifié)
    rolling_max = prices.rolling(window, min_periods=1).max()
    drawdown = (prices - rolling_max) / rolling_max * 100
    metrics["max_drawdown"] = drawdown.rolling(window).min()
    
    return metrics
