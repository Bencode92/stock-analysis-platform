# backtest/data_loader.py
"""
Chargement des données de prix historiques via Twelve Data API.

V8: FIX PARSE WEIGHT STRING
- Parse les poids au format "14%" (string) depuis portfolios.json
- Fonction parse_weight_value() pour gérer tous les formats

V7: FIX FORMAT TICKER:MIC
- Sépare TICKER:MIC en symbol + mic_code params séparés
- CABK:XMAD → symbol=CABK, mic_code=XMAD

V6: REFACTORING MAJEUR
- Utilise stocks_*.json (déjà validés par stock-advanced-filter.js) comme source de mapping
- Plus besoin de NAME_TO_TICKER_MAP statique - tout vient des fichiers générés
- Affiche le % de couverture des données

Documentation API: https://twelvedata.com/docs
"""

import os
import time
import json
import logging
from typing import List, Dict, Optional, Set, Tuple
from datetime import datetime, timedelta
from pathlib import Path
import requests
import pandas as pd

logger = logging.getLogger("backtest.data_loader")


# ============ YAHOO → TWELVEDATA SYMBOL CONVERSION ============

YAHOO_TO_TWELVEDATA_MIC = {
    # Europe
    ".PA": "XPAR", ".MC": "XMAD", ".L": "XLON", ".DE": "XETR",
    ".MI": "XMIL", ".AS": "XAMS", ".BR": "XBRU", ".LS": "XLIS",
    ".SW": "XSWX", ".VI": "XWBO", ".OL": "XOSL", ".CO": "XCSE",
    ".HE": "XHEL", ".ST": "XSTO", ".IR": "XDUB",
    # Asia
    ".HK": "XHKG", ".KS": "XKRX", ".KQ": "XKOS", ".NS": "XNSE",
    ".BO": "XBOM", ".TW": "XTAI", ".TWO": "ROCO", ".T": "XTKS",
    ".SS": "XSHG", ".SZ": "XSHE", ".SI": "XSES", ".BK": "XBKK",
    ".KL": "XKLS", ".JK": "XIDX", ".AX": "XASX",
}

MIC_TO_COUNTRY = {
    "XPAR": "France", "XAMS": "Netherlands", "XBRU": "Belgium", "XLIS": "Portugal",
    "XMAD": "Spain", "XMIL": "Italy", "XETR": "Germany", "XLON": "United Kingdom",
    "XSWX": "Switzerland", "XWBO": "Austria", "XOSL": "Norway", "XDUB": "Ireland",
    "XCSE": "Denmark", "XHEL": "Finland", "XSTO": "Sweden",
    "XHKG": "Hong Kong", "XKRX": "South Korea", "XKOS": "South Korea",
    "XNSE": "India", "XBOM": "India", "XTAI": "Taiwan", "ROCO": "Taiwan",
    "XTKS": "Japan", "XSHG": "China", "XSHE": "China", "XSES": "Singapore",
    "XBKK": "Thailand", "XKLS": "Malaysia", "XIDX": "Indonesia", "XASX": "Australia",
}


def parse_symbol_with_mic(symbol: str) -> Tuple[str, Optional[str]]:
    """
    Parse un symbole qui peut être au format TICKER:MIC.
    
    Args:
        symbol: "CABK:XMAD" ou "AAPL" ou "SSE.L"
    
    Returns:
        Tuple (base_ticker, mic_code ou None)
    """
    if not symbol:
        return symbol, None
    
    # Format TICKER:MIC (ex: CABK:XMAD)
    if ":" in symbol:
        parts = symbol.split(":")
        if len(parts) == 2:
            return parts[0], parts[1]
    
    return symbol, None


def parse_yahoo_symbol(symbol: str) -> Tuple[str, Optional[str], Optional[str]]:
    """Parse un symbole Yahoo pour extraire le ticker de base, le MIC et le pays."""
    if not symbol or "/" in symbol:
        return symbol, None, None
    
    best_suffix = ""
    best_mic = None
    
    for suffix, mic in YAHOO_TO_TWELVEDATA_MIC.items():
        if symbol.endswith(suffix) and len(suffix) > len(best_suffix):
            best_suffix = suffix
            best_mic = mic
    
    if best_mic:
        base_ticker = symbol[:-len(best_suffix)]
        country = MIC_TO_COUNTRY.get(best_mic)
        return base_ticker, best_mic, country
    
    return symbol, None, None


class TwelveDataLoader:
    """Client pour l'API Twelve Data avec gestion du rate limiting."""
    
    BASE_URL = "https://api.twelvedata.com"
    PLAN_LIMITS = {"free": 8, "basic": 30, "pro": 120, "ultra": 500}
    
    def __init__(self, api_key: Optional[str] = None, plan: str = "ultra"):
        self.api_key = api_key or os.environ.get("TWELVE_DATA_API")
        if not self.api_key:
            raise ValueError("Twelve Data API key required.")
        
        self.plan = plan.lower()
        self.session = requests.Session()
        self.last_request_time = 0
        
        requests_per_minute = self.PLAN_LIMITS.get(self.plan, 8)
        self.min_request_interval = 60.0 / requests_per_minute
        
        logger.info(f"TwelveData initialized with plan '{plan}' ({requests_per_minute} req/min)")
        self._cache: Dict[str, pd.DataFrame] = {}
    
    def _rate_limit(self):
        if self.plan == "ultra":
            time.sleep(0.1)
            return
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_request_interval:
            time.sleep(self.min_request_interval - elapsed)
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
        
        Gère automatiquement le format TICKER:MIC en séparant les paramètres.
        """
        # ✅ V7 FIX: Séparer TICKER:MIC en params distincts
        base_symbol, mic_code = parse_symbol_with_mic(symbol)
        
        cache_key = f"{symbol}_{start_date}_{end_date}_{interval}"
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        self._rate_limit()
        
        params = {
            "symbol": base_symbol,  # Juste le ticker, sans :MIC
            "interval": interval,
            "start_date": start_date,
            "end_date": end_date,
            "apikey": self.api_key,
            "format": "JSON",
            "timezone": "America/New_York",
        }
        
        # Ajouter mic_code si présent
        if mic_code:
            params["mic_code"] = mic_code
        
        try:
            response = self.session.get(f"{self.BASE_URL}/time_series", params=params, timeout=30)
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
            
            for col in ["open", "high", "low", "close", "volume"]:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors="coerce")
            
            self._cache[cache_key] = df
            logger.info(f"✅ Loaded {symbol}: {len(df)} days")
            return df
            
        except Exception as e:
            logger.error(f"❌ Error for {symbol}: {e}")
            return None
    
    def get_multiple_time_series(
        self,
        symbols: List[str],
        start_date: str,
        end_date: str,
        interval: str = "1day"
    ) -> pd.DataFrame:
        """Récupère les prix pour plusieurs symboles avec affichage de couverture."""
        all_data = {}
        loaded = 0
        failed = []
        
        for i, symbol in enumerate(symbols):
            logger.info(f"Loading {symbol} ({i+1}/{len(symbols)})...")
            df = self.get_time_series(symbol, start_date, end_date, interval)
            
            if df is not None and "close" in df.columns:
                # Utiliser le symbole original comme clé (pour le mapping des poids)
                all_data[symbol] = df["close"]
                loaded += 1
            else:
                failed.append(symbol)
        
        # ============ AFFICHAGE COUVERTURE ============
        total = len(symbols)
        coverage_pct = (loaded / total * 100) if total > 0 else 0
        
        print("\n" + "="*60)
        print("📊 DATA COVERAGE REPORT")
        print("="*60)
        print(f"   Symbols requested:  {total}")
        print(f"   Symbols loaded:     {loaded}")
        print(f"   Symbols failed:     {len(failed)}")
        print(f"   Coverage:           {coverage_pct:.1f}%")
        
        if failed:
            print(f"\n   ❌ Failed symbols: {', '.join(failed[:10])}")
            if len(failed) > 10:
                print(f"      ... and {len(failed)-10} more")
        
        if coverage_pct < 80:
            print(f"\n   ⚠️  WARNING: Coverage below 80% - backtest may be biased!")
        
        print("="*60 + "\n")
        
        if not all_data:
            raise ValueError("No data loaded for any symbol")
        
        prices_df = pd.DataFrame(all_data)
        prices_df = prices_df.sort_index().ffill()
        
        logger.info(f"Loaded {len(prices_df.columns)}/{total} symbols ({coverage_pct:.1f}%), {len(prices_df)} days")
        return prices_df


# ============ DYNAMIC NAME → TICKER MAPPING FROM stocks_*.json ============

def build_name_to_ticker_map(data_dir: str = "data") -> Dict[str, str]:
    """
    Construit dynamiquement le mapping nom → ticker depuis les fichiers stocks_*.json.
    Ces fichiers sont générés par stock-advanced-filter.js et contiennent les tickers
    déjà validés par TwelveData.
    """
    mapping = {}
    stocks_files = [
        Path(data_dir) / "stocks_us.json",
        Path(data_dir) / "stocks_europe.json",
        Path(data_dir) / "stocks_asia.json",
    ]
    
    for filepath in stocks_files:
        if not filepath.exists():
            logger.debug(f"File not found: {filepath}")
            continue
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            stocks = data.get("stocks", [])
            for stock in stocks:
                name = stock.get("name", "").strip().upper()
                # Priorité: resolved_symbol > ticker
                ticker = stock.get("resolved_symbol") or stock.get("ticker")
                
                if name and ticker:
                    mapping[name] = ticker
                    # Aussi mapper le ticker lui-même (pour les cas où le nom = ticker)
                    ticker_upper = ticker.upper()
                    if ticker_upper != name:
                        mapping[ticker_upper] = ticker
            
            logger.info(f"Loaded {len(stocks)} mappings from {filepath.name}")
        
        except Exception as e:
            logger.warning(f"Error loading {filepath}: {e}")
    
    # Ajouter les ETF et benchmarks courants (ne changent pas)
    etf_mapping = {
        # Benchmarks
        "URTH": "URTH", "IEF": "IEF", "SPY": "SPY", "QQQ": "QQQ",
        "ISHARES MSCI WORLD ETF": "URTH",
        "ISHARES 7-10 YEAR TREASURY BOND ETF": "IEF",
        # Bonds ETF
        "SPDR DOUBLELINE TOTAL RETURN TACTICAL ETF": "TOTL",
        "SPDR DOUBLELINE": "TOTL",
        "ISHARES 20+ YEAR TREASURY BOND ETF": "TLT",
        "VANGUARD TOTAL BOND MARKET ETF": "BND",
        "ISHARES CORE U.S. AGGREGATE BOND ETF": "AGG",
        "ISHARES IBOXX $ HIGH YIELD CORPORATE BOND ETF": "HYG",
        "ISHARES IBOXX $ INVESTMENT GRADE CORPORATE BOND ETF": "LQD",
        # Gold
        "SPDR GOLD SHARES": "GLD",
        "ISHARES GOLD TRUST": "IAU",
    }
    
    for name, ticker in etf_mapping.items():
        mapping[name.upper()] = ticker
    
    logger.info(f"Total name→ticker mappings: {len(mapping)}")
    return mapping


# Global mapping (lazy loaded)
_NAME_TO_TICKER_CACHE: Optional[Dict[str, str]] = None


def get_name_to_ticker_map() -> Dict[str, str]:
    """Retourne le mapping nom → ticker (avec lazy loading)."""
    global _NAME_TO_TICKER_CACHE
    if _NAME_TO_TICKER_CACHE is None:
        _NAME_TO_TICKER_CACHE = build_name_to_ticker_map()
    return _NAME_TO_TICKER_CACHE


def name_to_ticker(name: str) -> Optional[str]:
    """Convertit un nom d'actif en ticker."""
    if not name:
        return None
    
    name_clean = name.strip().upper()
    mapping = get_name_to_ticker_map()
    
    # Recherche exacte
    if name_clean in mapping:
        return mapping[name_clean]
    
    # Recherche partielle (pour gérer les variations de nom)
    for map_name, ticker in mapping.items():
        if map_name in name_clean or name_clean in map_name:
            return ticker
    
    # Si c'est déjà un ticker court valide (ex: "AAPL", "ALV.DE")
    if len(name) <= 12 and name.replace(".", "").replace("-", "").replace("/", "").replace(":", "").isalnum():
        return name
    
    logger.debug(f"No ticker mapping found for: {name}")
    return None


# ============ PORTFOLIO SYMBOL EXTRACTION ============

def extract_portfolio_symbols(portfolios_path: str = "data/portfolios.json") -> Tuple[Set[str], int, int]:
    """
    Extrait tous les symboles uniques des portefeuilles générés.
    
    Returns:
        Tuple (symbols_set, total_requested, total_resolved)
    """
    symbols = set()
    total_requested = 0
    total_resolved = 0
    unresolved = []
    
    try:
        with open(portfolios_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        logger.warning(f"Could not load portfolios from {portfolios_path}: {e}")
        return symbols, 0, 0
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        if profile not in data:
            continue
        
        profile_data = data[profile]
        
        for category in ["Actions", "ETF", "Obligations", "Crypto"]:
            if category not in profile_data:
                continue
            
            for name, weight in profile_data[category].items():
                total_requested += 1
                ticker = name_to_ticker(name)
                if ticker:
                    symbols.add(ticker)
                    total_resolved += 1
                else:
                    unresolved.append(name)
    
    if unresolved:
        logger.warning(f"Unresolved names ({len(unresolved)}): {unresolved[:5]}...")
    
    logger.info(f"Extracted {len(symbols)} unique symbols from portfolios ({total_resolved}/{total_requested} resolved)")
    return symbols, total_requested, total_resolved


# ============ V8 FIX: PARSE WEIGHT VALUE ============

def parse_weight_value(weight) -> float:
    """
    Parse un poids qui peut être au format:
    - "14%" (string avec %)
    - "14" (string sans %)
    - 14 (int)
    - 0.14 (float décimal)
    
    Returns:
        float en décimal (0.14 pour 14%)
    """
    if weight is None:
        return 0.0
    
    # Si c'est une string, nettoyer
    if isinstance(weight, str):
        weight_str = weight.strip().replace("%", "").replace(",", ".")
        try:
            weight_num = float(weight_str)
        except ValueError:
            logger.warning(f"Cannot parse weight: {weight}")
            return 0.0
    else:
        weight_num = float(weight)
    
    # Convertir en décimal si > 1 (14 → 0.14)
    if weight_num > 1:
        return weight_num / 100.0
    else:
        return weight_num


def extract_portfolio_weights(portfolios_path: str = "data/portfolios.json") -> Dict[str, Dict[str, float]]:
    """
    Extrait les poids de chaque profil depuis portfolios.json.
    
    Gère les formats:
    - "14%" (string avec %)
    - 14 (entier)
    - 0.14 (décimal)
    
    Returns:
        Dict[profile_name, Dict[ticker, weight_decimal]]
        Ex: {"Agressif": {"AAPL": 0.14, "MSFT": 0.12, ...}, ...}
    """
    weights_by_profile = {}
    
    try:
        with open(portfolios_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        logger.warning(f"Could not load portfolios from {portfolios_path}: {e}")
        return weights_by_profile
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        if profile not in data:
            continue
        
        profile_data = data[profile]
        profile_weights = {}
        
        for category in ["Actions", "ETF", "Obligations", "Crypto"]:
            if category not in profile_data:
                continue
            
            for name, weight in profile_data[category].items():
                ticker = name_to_ticker(name)
                if ticker:
                    # ✅ V8 FIX: Parser le poids correctement (string "14%" ou int 14)
                    weight_decimal = parse_weight_value(weight)
                    if weight_decimal > 0:
                        profile_weights[ticker] = weight_decimal
        
        # Normaliser pour s'assurer que la somme = 1
        total = sum(profile_weights.values())
        if total > 0 and abs(total - 1.0) > 0.01:
            logger.warning(f"Profile {profile}: weights sum to {total:.2%}, normalizing...")
            profile_weights = {k: v/total for k, v in profile_weights.items()}
        
        weights_by_profile[profile] = profile_weights
        logger.info(f"Extracted {len(profile_weights)} weights for {profile}: sum={sum(profile_weights.values()):.2%}")
    
    return weights_by_profile


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
    Charge les prix pour le backtest avec affichage de couverture.
    
    Returns:
        DataFrame des prix (colonnes = symboles, index = dates)
    """
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")
    if start_date is None:
        lookback = config.get("backtest", {}).get("default_lookback_days", 90)
        start_dt = datetime.now() - timedelta(days=lookback + 30)
        start_date = start_dt.strftime("%Y-%m-%d")
    
    symbols = set()
    
    # Forcer le rechargement du mapping depuis les fichiers stocks_*.json
    global _NAME_TO_TICKER_CACHE
    _NAME_TO_TICKER_CACHE = None  # Reset cache
    
    if portfolios_path and Path(portfolios_path).exists():
        portfolio_symbols, requested, resolved = extract_portfolio_symbols(portfolios_path)
        symbols.update(portfolio_symbols)
        
        print(f"\n📋 PORTFOLIO SYMBOL RESOLUTION")
        print(f"   Names in portfolio:  {requested}")
        print(f"   Resolved to ticker:  {resolved}")
        print(f"   Resolution rate:     {resolved/max(1,requested)*100:.1f}%")
    
    if include_benchmark:
        if benchmark_symbols is None:
            benchmark_symbols = ["URTH", "IEF"]  # World + Bonds
        for bench in benchmark_symbols:
            symbols.add(bench)
            logger.info(f"Added benchmark: {bench}")
    
    if not symbols:
        logger.warning("No portfolio symbols found, falling back to config.test_universe")
        test_universe = config.get("backtest", {}).get("test_universe", {})
        symbols.update(test_universe.get("stocks", []))
        symbols.update(test_universe.get("etfs", []))
    
    if not symbols:
        raise ValueError("No symbols to load.")
    
    symbols_list = sorted(list(symbols))
    
    print(f"\n📥 LOADING PRICE DATA")
    print(f"   Period: {start_date} → {end_date}")
    print(f"   Symbols to load: {len(symbols_list)}")
    print(f"   Symbols: {', '.join(symbols_list[:10])}{'...' if len(symbols_list) > 10 else ''}")
    
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


def compute_rolling_metrics(prices: pd.DataFrame, window: int = 20) -> Dict[str, pd.DataFrame]:
    """Calcule les métriques roulantes pour le scoring."""
    returns = prices.pct_change()
    
    metrics = {
        "returns_1m": prices.pct_change(20) * 100,
        "returns_3m": prices.pct_change(60) * 100,
        "volatility": returns.rolling(window).std() * (252 ** 0.5) * 100,
    }
    
    rolling_max = prices.rolling(window, min_periods=1).max()
    drawdown = (prices - rolling_max) / rolling_max * 100
    metrics["max_drawdown"] = drawdown.rolling(window).min()
    
    return metrics


def get_supported_exchanges() -> Dict[str, str]:
    """Retourne les bourses supportées avec leur code MIC."""
    return YAHOO_TO_TWELVEDATA_MIC.copy()
