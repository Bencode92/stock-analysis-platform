# backtest/data_loader.py
"""
Chargement des données de prix historiques via Twelve Data API.

Documentation API: https://twelvedata.com/docs
Plans:
- Free: 8 requests/minute, 800/day
- Ultra: pas de rate limit significatif

V2: Support pour charger les symboles depuis les portefeuilles générés
"""

import os
import time
import json
import logging
from typing import List, Dict, Optional, Set
from datetime import datetime, timedelta
from pathlib import Path
import requests
import pandas as pd

logger = logging.getLogger("backtest.data_loader")


class TwelveDataLoader:
    """
    Client pour l'API Twelve Data.
    Gère le rate limiting et le caching.
    """
    
    BASE_URL = "https://api.twelvedata.com"
    
    # Plans et leurs rate limits (requests/minute)
    PLAN_LIMITS = {
        "free": 8,
        "basic": 30,
        "pro": 120,
        "ultra": 500,  # Pratiquement pas de limite
    }
    
    def __init__(self, api_key: Optional[str] = None, plan: str = "ultra"):
        """
        Args:
            api_key: Clé API Twelve Data (ou variable env TWELVE_DATA_API)
            plan: "free", "basic", "pro", "ultra" - détermine le rate limiting
        """
        self.api_key = api_key or os.environ.get("TWELVE_DATA_API")
        if not self.api_key:
            raise ValueError(
                "Twelve Data API key required. "
                "Set TWELVE_DATA_API environment variable or pass api_key."
            )
        
        self.plan = plan.lower()
        self.session = requests.Session()
        self.last_request_time = 0
        
        # Calculer l'intervalle minimum entre requêtes
        requests_per_minute = self.PLAN_LIMITS.get(self.plan, 8)
        self.min_request_interval = 60.0 / requests_per_minute
        
        logger.info(f"TwelveData initialized with plan '{plan}' ({requests_per_minute} req/min)")
        
        self._cache: Dict[str, pd.DataFrame] = {}
    
    def _rate_limit(self):
        """Respecter le rate limit de l'API."""
        if self.plan == "ultra":
            # Plan ultra: juste un petit délai pour éviter les erreurs
            time.sleep(0.1)
            return
        
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


# ============ PORTFOLIO SYMBOL EXTRACTION ============

def extract_portfolio_symbols(portfolios_path: str = "data/portfolios.json") -> Set[str]:
    """
    Extrait tous les symboles uniques des portefeuilles générés.
    
    Args:
        portfolios_path: Chemin vers portfolios.json
    
    Returns:
        Set de symboles (tickers)
    """
    symbols = set()
    
    try:
        with open(portfolios_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        logger.warning(f"Could not load portfolios from {portfolios_path}: {e}")
        return symbols
    
    # Parcourir les 3 profils
    for profile in ["Agressif", "Modéré", "Stable"]:
        if profile not in data:
            continue
        
        profile_data = data[profile]
        
        # Parcourir les catégories
        for category in ["Actions", "ETF", "Obligations", "Crypto"]:
            if category not in profile_data:
                continue
            
            for name, weight in profile_data[category].items():
                # Convertir le nom en ticker (si possible)
                ticker = name_to_ticker(name)
                if ticker:
                    symbols.add(ticker)
    
    logger.info(f"Extracted {len(symbols)} unique symbols from portfolios")
    return symbols


# ============ NAME TO TICKER MAPPING ============

# Mapping des noms courants vers leurs tickers
NAME_TO_TICKER_MAP = {
    # Actions
    "SSE PLC": "SSE.L",
    "LG ELECTRONICS INC": "066570.KS",
    "AMGEN INC": "AMGN",
    "STEEL DYNAMICS INC": "STLD",
    "EXPEDITORS INTERNATIONAL OF WASHIN": "EXPD",
    "INDUSTRIA DE DISENO TEXTIL SA": "ITX.MC",
    "ASIAN PAINTS LTD": "ASIANPAINT.NS",
    "BOUYGUES SA": "EN.PA",
    "INTERNATIONAL BUSINESS MACHINES CO": "IBM",
    "ENGIE SA": "ENGI.PA",
    "JOHNSON & JOHNSON": "JNJ",
    "IMPERIAL BRANDS PLC": "IMB.L",
    
    # ETF Gold
    "SPDR Gold Shares": "GLD",
    "iShares Gold Trust": "IAU",
    "SPDR Gold MiniShares Trust": "GLDM",
    "abrdn Physical Gold Shares ETF": "SGOL",
    "iShares Gold Trust Micro": "IAUM",
    "abrdn Physical Precious Metals Basket Shares ETF": "GLTR",
    "Goldman Sachs Physical Gold ETF": "AAAU",
    
    # ETF Country/Region
    "iShares MSCI Spain ETF": "EWP",
    "iShares MSCI World ETF": "URTH",
    
    # Bonds
    "Alpha Architect 1-3 Month Boxx Fund": "BOXX",
    "Eaton Vance Total Return Fund": "ETV",
    "JPMorgan Limited Duration ETF": "JPLD",
    
    # US Stocks
    "APPLE INC": "AAPL",
    "MICROSOFT CORP": "MSFT",
    "NVIDIA CORP": "NVDA",
    "AMAZON COM INC": "AMZN",
    "ALPHABET INC CLASS A": "GOOGL",
    "META PLATFORMS INC": "META",
    "TESLA INC": "TSLA",
    "BERKSHIRE HATHAWAY INC CLASS B": "BRK.B",
    "VISA INC": "V",
    "UNITEDHEALTH GROUP INC": "UNH",
    "JPMORGAN CHASE & CO": "JPM",
    "PROCTER & GAMBLE CO": "PG",
    "MASTERCARD INC": "MA",
    "HOME DEPOT INC": "HD",
    "COCA COLA CO": "KO",
    "PEPSICO INC": "PEP",
    "MERCK & CO INC": "MRK",
    "ABBVIE INC": "ABBV",
    "EXXON MOBIL CORP": "XOM",
    "CHEVRON CORP": "CVX",
    
    # Crypto (format TwelveData)
    "Bitcoin": "BTC/USD",
    "Ethereum": "ETH/USD",
    "Solana": "SOL/USD",
}


def name_to_ticker(name: str) -> Optional[str]:
    """
    Convertit un nom d'actif en ticker.
    
    Args:
        name: Nom de l'actif (ex: "SPDR Gold Shares")
    
    Returns:
        Ticker correspondant (ex: "GLD") ou None
    """
    # Nettoyage
    name_clean = name.strip().upper()
    
    # Recherche exacte (case insensitive)
    for map_name, ticker in NAME_TO_TICKER_MAP.items():
        if map_name.upper() == name_clean:
            return ticker
    
    # Recherche partielle
    for map_name, ticker in NAME_TO_TICKER_MAP.items():
        if map_name.upper() in name_clean or name_clean in map_name.upper():
            return ticker
    
    # Si le nom ressemble déjà à un ticker (alphanumérique court)
    if len(name) <= 10 and name.replace(".", "").replace("-", "").replace("/", "").isalnum():
        return name
    
    logger.debug(f"No ticker mapping found for: {name}")
    return None


# ============ LOAD PRICES FOR BACKTEST ============

def load_prices_for_backtest(
    config: dict,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    api_key: Optional[str] = None,
    plan: str = "ultra",
    portfolios_path: Optional[str] = "data/portfolios.json",
    include_benchmark: bool = True,
    benchmark_symbols: List[str] = None,
) -> pd.DataFrame:
    """
    Charge les prix pour le backtest.
    
    PRIORITÉ DES SYMBOLES:
    1. Symboles extraits des portefeuilles (portfolios_path)
    2. + Benchmark (URTH par défaut)
    3. Fallback: config.backtest.test_universe si rien d'autre
    
    Args:
        config: Configuration chargée depuis portfolio_config.yaml
        start_date: Override date début (défaut: 90j avant aujourd'hui)
        end_date: Override date fin (défaut: aujourd'hui)
        api_key: Override clé API
        plan: Plan Twelve Data ("free", "basic", "pro", "ultra")
        portfolios_path: Chemin vers portfolios.json pour extraire les symboles
        include_benchmark: Ajouter URTH automatiquement
        benchmark_symbols: Liste de benchmarks à ajouter (défaut: ["URTH"])
    
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
    
    # === PRIORITÉ 1: Extraire les symboles des portefeuilles ===
    symbols = set()
    
    if portfolios_path and Path(portfolios_path).exists():
        portfolio_symbols = extract_portfolio_symbols(portfolios_path)
        symbols.update(portfolio_symbols)
        logger.info(f"Loaded {len(portfolio_symbols)} symbols from portfolios")
    
    # === PRIORITÉ 2: Ajouter les benchmarks ===
    if include_benchmark:
        if benchmark_symbols is None:
            benchmark_symbols = ["URTH"]  # MSCI World par défaut
        
        for bench in benchmark_symbols:
            symbols.add(bench)
            logger.info(f"Added benchmark: {bench}")
    
    # === PRIORITÉ 3: Fallback vers config si aucun symbole ===
    if not symbols:
        logger.warning("No portfolio symbols found, falling back to config.test_universe")
        test_universe = config.get("backtest", {}).get("test_universe", {})
        symbols.update(test_universe.get("stocks", []))
        symbols.update(test_universe.get("etfs", []))
        symbols.update(test_universe.get("crypto", []))
    
    if not symbols:
        raise ValueError(
            "No symbols to load. Either provide portfolios.json or "
            "define config.backtest.test_universe"
        )
    
    # Convertir en liste triée pour reproductibilité
    symbols_list = sorted(list(symbols))
    
    logger.info(f"Loading {len(symbols_list)} symbols from {start_date} to {end_date}")
    logger.info(f"Symbols: {symbols_list[:10]}{'...' if len(symbols_list) > 10 else ''}")
    
    loader = TwelveDataLoader(api_key=api_key, plan=plan)
    prices = loader.get_multiple_time_series(
        symbols=symbols_list,
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


# ============ UTILITY ============

def add_ticker_mapping(name: str, ticker: str):
    """
    Ajoute un mapping nom → ticker dynamiquement.
    
    Utile pour les nouveaux actifs non encore mappés.
    """
    NAME_TO_TICKER_MAP[name] = ticker
    logger.info(f"Added mapping: {name} → {ticker}")


def get_all_mappings() -> Dict[str, str]:
    """Retourne tous les mappings nom → ticker."""
    return NAME_TO_TICKER_MAP.copy()
