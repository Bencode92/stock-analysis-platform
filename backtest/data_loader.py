# backtest/data_loader.py
"""
Chargement des données de prix historiques via Twelve Data API.

Documentation API: https://twelvedata.com/docs
Plans:
- Free: 8 requests/minute, 800/day
- Ultra: pas de rate limit significatif

V2: Support pour charger les symboles depuis les portefeuilles générés
V3: Conversion automatique Yahoo → TwelveData format pour symboles internationaux
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


# ============ YAHOO → TWELVEDATA SYMBOL CONVERSION ============

# Mapping Yahoo Finance suffix → TwelveData MIC code
YAHOO_TO_TWELVEDATA_MIC = {
    # Europe
    ".PA": "XPAR",   # Paris (Euronext)
    ".MC": "XMAD",   # Madrid
    ".L": "XLON",    # London
    ".DE": "XETR",   # Frankfurt (Xetra)
    ".MI": "XMIL",   # Milan
    ".AS": "XAMS",   # Amsterdam
    ".BR": "XBRU",   # Brussels
    ".LS": "XLIS",   # Lisbon
    ".SW": "XSWX",   # Swiss
    ".VI": "XWBO",   # Vienna
    ".OL": "XOSL",   # Oslo
    ".CO": "XCSE",   # Copenhagen
    ".HE": "XHEL",   # Helsinki
    ".ST": "XSTO",   # Stockholm
    ".IR": "XDUB",   # Dublin
    
    # Asia
    ".HK": "XHKG",   # Hong Kong
    ".KS": "XKRX",   # Korea (KOSPI)
    ".KQ": "XKOS",   # Korea (KOSDAQ)
    ".NS": "XNSE",   # India (NSE)
    ".BO": "XBOM",   # India (BSE/Bombay)
    ".TW": "XTAI",   # Taiwan
    ".TWO": "ROCO", # Taiwan OTC
    ".T": "XTKS",    # Tokyo
    ".SS": "XSHG",   # Shanghai
    ".SZ": "XSHE",   # Shenzhen
    ".SI": "XSES",   # Singapore
    ".BK": "XBKK",   # Thailand
    ".KL": "XKLS",   # Malaysia
    ".JK": "XIDX",   # Indonesia
    
    # Australia
    ".AX": "XASX",   # Sydney
}


def yahoo_to_twelvedata(symbol: str) -> str:
    """
    Convertit un symbole Yahoo Finance vers le format TwelveData.
    
    Yahoo utilise des suffixes (.PA, .L, .MC) tandis que TwelveData
    utilise le format symbol:MIC (ENGI:XPAR).
    
    Args:
        symbol: Symbole au format Yahoo (ex: "ENGI.PA", "SSE.L")
    
    Returns:
        Symbole au format TwelveData (ex: "ENGI:XPAR", "SSE:XLON")
        ou le symbole original si pas de conversion nécessaire
    
    Examples:
        >>> yahoo_to_twelvedata("ENGI.PA")
        'ENGI:XPAR'
        >>> yahoo_to_twelvedata("AAPL")
        'AAPL'
        >>> yahoo_to_twelvedata("BTC/USD")
        'BTC/USD'
    """
    if not symbol or "/" in symbol:
        # Crypto (BTC/USD) ou symbole vide: pas de conversion
        return symbol
    
    # Trouver le suffixe Yahoo le plus long qui match
    # (important pour .TWO vs .TW)
    best_match = None
    best_suffix = ""
    
    for suffix, mic in YAHOO_TO_TWELVEDATA_MIC.items():
        if symbol.endswith(suffix) and len(suffix) > len(best_suffix):
            best_match = mic
            best_suffix = suffix
    
    if best_match:
        # Extraire le ticker de base et ajouter le MIC
        base_ticker = symbol[:-len(best_suffix)]
        converted = f"{base_ticker}:{best_match}"
        logger.debug(f"Converted {symbol} → {converted}")
        return converted
    
    # Pas de conversion nécessaire (symbole US ou déjà au bon format)
    return symbol


def convert_symbols_for_twelvedata(symbols: List[str]) -> List[str]:
    """
    Convertit une liste de symboles Yahoo vers le format TwelveData.
    
    Args:
        symbols: Liste de symboles au format Yahoo
    
    Returns:
        Liste de symboles au format TwelveData
    """
    converted = []
    for sym in symbols:
        converted_sym = yahoo_to_twelvedata(sym)
        if converted_sym != sym:
            logger.info(f"Symbol conversion: {sym} → {converted_sym}")
        converted.append(converted_sym)
    return converted


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
            symbol: Ticker (ex: "AAPL", "BTC/USD", "ENGI.PA")
                    Les symboles Yahoo sont automatiquement convertis.
            start_date: Date début "YYYY-MM-DD"
            end_date: Date fin "YYYY-MM-DD"
            interval: "1day", "1week", etc.
        
        Returns:
            DataFrame avec colonnes [open, high, low, close, volume]
            Index = datetime
        """
        # Convertir le symbole Yahoo → TwelveData si nécessaire
        td_symbol = yahoo_to_twelvedata(symbol)
        
        cache_key = f"{td_symbol}_{start_date}_{end_date}_{interval}"
        if cache_key in self._cache:
            logger.debug(f"Cache hit: {symbol}")
            return self._cache[cache_key]
        
        self._rate_limit()
        
        params = {
            "symbol": td_symbol,
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
                logger.warning(f"API error for {symbol} ({td_symbol}): {data.get('message', 'Unknown')}")
                return None
            
            if "values" not in data:
                logger.warning(f"No data for {symbol} ({td_symbol})")
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
            logger.error(f"Request error for {symbol} ({td_symbol}): {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error for {symbol} ({td_symbol}): {e}")
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
    # Actions Européennes
    "SSE PLC": "SSE.L",
    "INDUSTRIA DE DISENO TEXTIL SA": "ITX.MC",
    "BOUYGUES SA": "EN.PA",
    "ENGIE SA": "ENGI.PA",
    "IMPERIAL BRANDS PLC": "IMB.L",
    "HERMES INTERNATIONAL": "RMS.PA",
    "LVMH MOET HENNESSY LOUIS VUITTON": "MC.PA",
    "TOTALENERGIES SE": "TTE.PA",
    "SANOFI SA": "SAN.PA",
    "SAP SE": "SAP.DE",
    "SIEMENS AG": "SIE.DE",
    "ALLIANZ SE": "ALV.DE",
    "BASF SE": "BAS.DE",
    "ASML HOLDING NV": "ASML.AS",
    "NESTLE SA": "NESN.SW",
    "ROCHE HOLDING AG": "ROG.SW",
    "NOVARTIS AG": "NOVN.SW",
    "SHELL PLC": "SHEL.L",
    "ASTRAZENECA PLC": "AZN.L",
    "HSBC HOLDINGS PLC": "HSBA.L",
    "UNILEVER PLC": "ULVR.L",
    "BP PLC": "BP.L",
    "RIO TINTO PLC": "RIO.L",
    "GLAXOSMITHKLINE PLC": "GSK.L",
    "DIAGEO PLC": "DGE.L",
    "BRITISH AMERICAN TOBACCO PLC": "BATS.L",
    
    # Actions Asie
    "LG ELECTRONICS INC": "066570.KS",
    "ASIAN PAINTS LTD": "ASIANPAINT.NS",
    "TATA CONSULTANCY SERVICES LTD": "TCS.NS",
    "INFOSYS LTD": "INFY.NS",
    "RELIANCE INDUSTRIES LTD": "RELIANCE.NS",
    "HDFC BANK LTD": "HDFCBANK.NS",
    "TAIWAN SEMICONDUCTOR MFG CO LTD": "2330.TW",
    "SAMSUNG ELECTRONICS CO LTD": "005930.KS",
    "ALIBABA GROUP HOLDING LTD": "9988.HK",
    "TENCENT HOLDINGS LTD": "0700.HK",
    "MEITUAN": "3690.HK",
    "JD COM INC": "9618.HK",
    
    # Actions US
    "AMGEN INC": "AMGN",
    "STEEL DYNAMICS INC": "STLD",
    "EXPEDITORS INTERNATIONAL OF WASHIN": "EXPD",
    "INTERNATIONAL BUSINESS MACHINES CO": "IBM",
    "JOHNSON & JOHNSON": "JNJ",
    "APPLE INC": "AAPL",
    "MICROSOFT CORP": "MSFT",
    "NVIDIA CORP": "NVDA",
    "AMAZON COM INC": "AMZN",
    "ALPHABET INC CLASS A": "GOOGL",
    "ALPHABET INC CLASS C": "GOOG",
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
    "BROADCOM INC": "AVGO",
    "COSTCO WHOLESALE CORP": "COST",
    "WALMART INC": "WMT",
    "ADOBE INC": "ADBE",
    "NETFLIX INC": "NFLX",
    "SALESFORCE INC": "CRM",
    "CISCO SYSTEMS INC": "CSCO",
    "INTEL CORP": "INTC",
    "AMD INC": "AMD",
    "QUALCOMM INC": "QCOM",
    
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
    "iShares MSCI EAFE ETF": "EFA",
    "iShares MSCI Emerging Markets ETF": "EEM",
    "Vanguard FTSE Europe ETF": "VGK",
    "iShares MSCI Germany ETF": "EWG",
    "iShares MSCI France ETF": "EWQ",
    "iShares MSCI United Kingdom ETF": "EWU",
    "iShares MSCI Japan ETF": "EWJ",
    "iShares MSCI China ETF": "MCHI",
    "iShares MSCI India ETF": "INDA",
    "iShares MSCI Brazil ETF": "EWZ",
    
    # ETF Sectoriels
    "Technology Select Sector SPDR Fund": "XLK",
    "Financial Select Sector SPDR Fund": "XLF",
    "Health Care Select Sector SPDR Fund": "XLV",
    "Energy Select Sector SPDR Fund": "XLE",
    "Consumer Discretionary Select Sector SPDR Fund": "XLY",
    "Consumer Staples Select Sector SPDR Fund": "XLP",
    "Utilities Select Sector SPDR Fund": "XLU",
    "Industrial Select Sector SPDR Fund": "XLI",
    "Materials Select Sector SPDR Fund": "XLB",
    "Real Estate Select Sector SPDR Fund": "XLRE",
    
    # ETF Bonds/Fixed Income
    "Alpha Architect 1-3 Month Boxx Fund": "BOXX",
    "Eaton Vance Total Return Fund": "ETV",
    "JPMorgan Limited Duration ETF": "JPLD",
    "iShares 20+ Year Treasury Bond ETF": "TLT",
    "iShares 7-10 Year Treasury Bond ETF": "IEF",
    "iShares iBoxx $ Investment Grade Corporate Bond ETF": "LQD",
    "iShares iBoxx $ High Yield Corporate Bond ETF": "HYG",
    "Vanguard Total Bond Market ETF": "BND",
    "iShares TIPS Bond ETF": "TIP",
    "iShares Flexible Income Active ETF": "BINC",
    
    # ETF Dividendes
    "Vanguard Dividend Appreciation ETF": "VIG",
    "Schwab U.S. Dividend Equity ETF": "SCHD",
    "iShares Select Dividend ETF": "DVY",
    "SPDR S&P Dividend ETF": "SDY",
    
    # ETF Large-cap
    "SPDR S&P 500 ETF Trust": "SPY",
    "iShares Core S&P 500 ETF": "IVV",
    "Vanguard S&P 500 ETF": "VOO",
    "Invesco QQQ Trust": "QQQ",
    "Vanguard Total Stock Market ETF": "VTI",
    
    # Crypto (format TwelveData)
    "Bitcoin": "BTC/USD",
    "Ethereum": "ETH/USD",
    "Solana": "SOL/USD",
    "Cardano": "ADA/USD",
    "Polkadot": "DOT/USD",
    "Avalanche": "AVAX/USD",
    "Chainlink": "LINK/USD",
    "Polygon": "MATIC/USD",
    "Uniswap": "UNI/USD",
    "Litecoin": "LTC/USD",
    "XRP": "XRP/USD",
    "Dogecoin": "DOGE/USD",
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
    logger.info(f"Symbols: {symbols_list}")
    
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


def get_supported_exchanges() -> Dict[str, str]:
    """Retourne les bourses supportées avec leur code MIC."""
    return YAHOO_TO_TWELVEDATA_MIC.copy()
