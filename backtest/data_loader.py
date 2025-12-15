# backtest/data_loader.py
"""
Chargement des données de prix historiques via Twelve Data API.

V11: FIX - Rename calendar → trading_calendar (avoid stdlib shadowing)
V10: FIX CRITIQUE - Suppression ffill() + calendar alignment
- Import trading_calendar.align_to_reference_calendar() pour alignement propre
- Plus de ffill() implicite (cassait la covariance)
- Ajout DataQualityChecker pour validation

V9: FIX - Lire _tickers en priorité (Solution C)
- extract_portfolio_weights() lit d'abord le bloc _tickers
- Fallback sur mapping nom→ticker si _tickers absent (rétrocompat)
- Log le % de poids effectivement chargé et les tickers introuvables

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

# Import data lineage pour source unique de vérité
try:
    from portfolio_engine.data_lineage import METHODOLOGY, get_data_source_string
    HAS_DATA_LINEAGE = True
except ImportError:
    HAS_DATA_LINEAGE = False
    METHODOLOGY = {"prices": {"source": "Twelve Data API", "type": "adjusted_close"}}
    def get_data_source_string():
        return "Twelve Data API (adjusted_close)"

# Import trading_calendar pour alignement sans ffill
# NOTE: Renamed from 'calendar' to 'trading_calendar' to avoid shadowing Python stdlib
try:
    from portfolio_engine.trading_calendar import (
        align_to_reference_calendar,
        CalendarAlignmentReport,
        validate_no_ffill_contamination,
    )
    HAS_CALENDAR = True
except ImportError:
    HAS_CALENDAR = False

# Import data quality pour validation
try:
    from portfolio_engine.data_quality import DataQualityChecker, DataQualityReport
    HAS_DATA_QUALITY = True
except ImportError:
    HAS_DATA_QUALITY = False

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
    """Parse un symbole qui peut être au format TICKER:MIC."""
    if not symbol:
        return symbol, None
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
        
        # Log data source from METHODOLOGY
        data_source = get_data_source_string()
        logger.info(f"TwelveDataLoader initialized: {data_source}, plan '{plan}' ({requests_per_minute} req/min)")
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
        """Récupère les prix historiques pour un symbole."""
        base_symbol, mic_code = parse_symbol_with_mic(symbol)
        
        cache_key = f"{symbol}_{start_date}_{end_date}_{interval}"
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        self._rate_limit()
        
        params = {
            "symbol": base_symbol,
            "interval": interval,
            "start_date": start_date,
            "end_date": end_date,
            "apikey": self.api_key,
            "format": "JSON",
            "timezone": "America/New_York",
        }
        
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
        interval: str = "1day",
        align_calendar: bool = True,  # v10: NEW
        validate_quality: bool = True,  # v10: NEW
    ) -> Tuple[pd.DataFrame, Dict]:
        """
        Récupère les prix pour plusieurs symboles.
        
        v10 FIX:
        - align_calendar=True: utilise trading_calendar.align_to_reference_calendar()
        - validate_quality=True: utilise DataQualityChecker
        - Plus de ffill() implicite
        
        Returns:
            Tuple (prices_df, diagnostics)
        """
        all_data = {}
        loaded = 0
        failed = []
        
        for i, symbol in enumerate(symbols):
            logger.info(f"Loading {symbol} ({i+1}/{len(symbols)})...")
            df = self.get_time_series(symbol, start_date, end_date, interval)
            
            if df is not None and "close" in df.columns:
                all_data[symbol] = df["close"]
                loaded += 1
            else:
                failed.append(symbol)
        
        # Coverage report
        total = len(symbols)
        coverage_pct = (loaded / total * 100) if total > 0 else 0
        
        print("\n" + "="*60)
        print("📊 DATA COVERAGE REPORT")
        print("="*60)
        print(f"   Data source:        {get_data_source_string()}")
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
        prices_df = prices_df.sort_index()
        
        diagnostics = {
            "data_source": get_data_source_string(),
            "n_symbols_requested": total,
            "n_symbols_loaded": loaded,
            "n_symbols_failed": len(failed),
            "coverage_pct": round(coverage_pct, 1),
            "failed_symbols": failed,
            "calendar_aligned": False,
            "quality_validated": False,
        }
        
        # ============ v10 FIX: CALENDAR ALIGNMENT (NO FFILL) ============
        if align_calendar and HAS_CALENDAR:
            logger.info("Aligning to NYSE calendar (no ffill)...")
            try:
                prices_df, cal_report = align_to_reference_calendar(
                    prices_df,
                    reference_calendar="NYSE",
                    max_nan_pct=0.05,
                    interpolation_method=None,  # NO interpolation
                )
                diagnostics["calendar_aligned"] = True
                diagnostics["calendar_report"] = cal_report.to_dict()
                logger.info(f"Calendar aligned: {cal_report.original_dates} → {cal_report.aligned_dates} dates")
            except Exception as e:
                logger.warning(f"Calendar alignment failed: {e}, using raw data")
        elif not HAS_CALENDAR:
            logger.warning("⚠️ trading_calendar module not available, using dropna() fallback (NOT ffill)")
            # FALLBACK SAFE: dropna au lieu de ffill
            prices_df = prices_df.dropna(how='any')
        
        # ============ v10 FIX: DATA QUALITY VALIDATION ============
        if validate_quality and HAS_DATA_QUALITY:
            logger.info("Validating data quality...")
            checker = DataQualityChecker()
            quality_report = checker.check(prices_df)
            diagnostics["quality_validated"] = True
            diagnostics["quality_report"] = quality_report.to_dict()
            
            if not quality_report.passed:
                logger.warning(f"⚠️ Data quality issues: {quality_report.n_symbols_rejected} symbols rejected")
                # Exclure les symboles problématiques
                for symbol in quality_report.rejected_symbols:
                    if symbol in prices_df.columns:
                        prices_df = prices_df.drop(columns=[symbol])
                        logger.info(f"Excluded {symbol}: {quality_report.rejection_reasons.get(symbol)}")
        
        # ============ v10 FIX: VALIDATE NO FFILL CONTAMINATION ============
        if HAS_CALENDAR:
            suspects = validate_no_ffill_contamination(prices_df)
            if suspects:
                diagnostics["ffill_suspects"] = suspects
                logger.warning(f"⚠️ Possible ffill contamination in: {suspects}")
        
        logger.info(f"Final dataset: {len(prices_df.columns)} symbols, {len(prices_df)} days")
        
        return prices_df, diagnostics


# ============ DYNAMIC NAME → TICKER MAPPING ============

def build_name_to_ticker_map(data_dir: str = "data") -> Dict[str, str]:
    """Construit dynamiquement le mapping nom → ticker depuis les fichiers stocks_*.json."""
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
                ticker = stock.get("resolved_symbol") or stock.get("ticker")
                
                if name and ticker:
                    mapping[name] = ticker
                    ticker_upper = ticker.upper()
                    if ticker_upper != name:
                        mapping[ticker_upper] = ticker
            
            logger.info(f"Loaded {len(stocks)} mappings from {filepath.name}")
        
        except Exception as e:
            logger.warning(f"Error loading {filepath}: {e}")
    
    # ETF et benchmarks standards
    etf_mapping = {
        "URTH": "URTH", "IEF": "IEF", "SPY": "SPY", "QQQ": "QQQ",
        "ISHARES MSCI WORLD ETF": "URTH",
        "ISHARES 7-10 YEAR TREASURY BOND ETF": "IEF",
        "SPDR DOUBLELINE TOTAL RETURN TACTICAL ETF": "TOTL",
        "ISHARES 20+ YEAR TREASURY BOND ETF": "TLT",
        "VANGUARD TOTAL BOND MARKET ETF": "BND",
        "ISHARES CORE U.S. AGGREGATE BOND ETF": "AGG",
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
    
    if name_clean in mapping:
        return mapping[name_clean]
    
    for map_name, ticker in mapping.items():
        if map_name in name_clean or name_clean in map_name:
            return ticker
    
    if len(name) <= 12 and name.replace(".", "").replace("-", "").replace("/", "").replace(":", "").isalnum():
        return name
    
    logger.debug(f"No ticker mapping found for: {name}")
    return None


# ============ PORTFOLIO SYMBOL EXTRACTION ============

def extract_portfolio_symbols(portfolios_path: str = "data/portfolios.json") -> Tuple[Set[str], int, int]:
    """Extrait tous les symboles uniques des portefeuilles générés."""
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
        
        if "_tickers" in profile_data and profile_data["_tickers"]:
            tickers_block = profile_data["_tickers"]
            for ticker in tickers_block.keys():
                total_requested += 1
                symbols.add(ticker)
                total_resolved += 1
            logger.info(f"✅ {profile}: Using _tickers block ({len(tickers_block)} tickers)")
        else:
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
            logger.warning(f"⚠️ {profile}: Fallback to name→ticker mapping")
    
    if unresolved:
        logger.warning(f"Unresolved names ({len(unresolved)}): {unresolved[:5]}...")
    
    logger.info(f"Extracted {len(symbols)} unique symbols ({total_resolved}/{total_requested} resolved)")
    return symbols, total_requested, total_resolved


def parse_weight_value(weight) -> float:
    """Parse un poids (string "14%" ou int 14 → float 0.14)."""
    if weight is None:
        return 0.0
    
    if isinstance(weight, str):
        weight_str = weight.strip().replace("%", "").replace(",", ".")
        try:
            weight_num = float(weight_str)
        except ValueError:
            logger.warning(f"Cannot parse weight: {weight}")
            return 0.0
    else:
        weight_num = float(weight)
    
    if weight_num > 1:
        return weight_num / 100.0
    else:
        return weight_num


def extract_portfolio_weights(portfolios_path: str = "data/portfolios.json") -> Dict[str, Dict[str, float]]:
    """Extrait les poids de chaque profil depuis portfolios.json."""
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
        source = "unknown"
        unresolved_names = []
        
        if "_tickers" in profile_data and profile_data["_tickers"]:
            tickers_block = profile_data["_tickers"]
            source = "_tickers"
            
            for ticker, weight in tickers_block.items():
                weight_decimal = float(weight)
                if weight_decimal > 0:
                    profile_weights[ticker] = weight_decimal
            
            logger.info(f"✅ {profile}: Loaded {len(profile_weights)} weights from _tickers block")
        
        else:
            source = "name_mapping"
            logger.warning(f"⚠️ {profile}: _tickers block not found, falling back to name→ticker mapping")
            
            for category in ["Actions", "ETF", "Obligations", "Crypto"]:
                if category not in profile_data:
                    continue
                
                for name, weight in profile_data[category].items():
                    ticker = name_to_ticker(name)
                    if ticker:
                        weight_decimal = parse_weight_value(weight)
                        if weight_decimal > 0:
                            profile_weights[ticker] = weight_decimal
                    else:
                        unresolved_names.append(name)
            
            if unresolved_names:
                logger.warning(f"   ❌ Unresolved ({len(unresolved_names)}): {unresolved_names[:5]}...")
        
        # Normalisation
        total = sum(profile_weights.values())
        if total > 0 and abs(total - 1.0) > 0.01:
            logger.warning(f"   ⚠️ {profile}: weights sum to {total:.2%}, normalizing...")
            profile_weights = {k: v/total for k, v in profile_weights.items()}
        
        weights_by_profile[profile] = profile_weights
        
        final_total = sum(profile_weights.values())
        print(f"\n📋 {profile} weights loaded:")
        print(f"   Source:           {source}")
        print(f"   Tickers:          {len(profile_weights)}")
        print(f"   Total weight:     {final_total:.2%}")
        if unresolved_names:
            print(f"   Unresolved:       {len(unresolved_names)}")
    
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
) -> Tuple[pd.DataFrame, Dict]:
    """
    Charge les prix pour le backtest.
    
    v10: Retourne maintenant (prices_df, diagnostics) au lieu de juste prices_df.
    """
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")
    if start_date is None:
        lookback = config.get("backtest", {}).get("default_lookback_days", 90)
        start_dt = datetime.now() - timedelta(days=lookback + 30)
        start_date = start_dt.strftime("%Y-%m-%d")
    
    symbols = set()
    
    global _NAME_TO_TICKER_CACHE
    _NAME_TO_TICKER_CACHE = None
    
    if portfolios_path and Path(portfolios_path).exists():
        portfolio_symbols, requested, resolved = extract_portfolio_symbols(portfolios_path)
        symbols.update(portfolio_symbols)
        
        print(f"\n📋 PORTFOLIO SYMBOL RESOLUTION")
        print(f"   Names in portfolio:  {requested}")
        print(f"   Resolved to ticker:  {resolved}")
        print(f"   Resolution rate:     {resolved/max(1,requested)*100:.1f}%")
    
    if include_benchmark:
        if benchmark_symbols is None:
            benchmark_symbols = ["URTH", "IEF"]
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
    prices, diagnostics = loader.get_multiple_time_series(
        symbols=symbols_list,
        start_date=start_date,
        end_date=end_date,
        align_calendar=True,
        validate_quality=True,
    )
    
    return prices, diagnostics


def compute_returns(prices: pd.DataFrame) -> pd.DataFrame:
    """Calcule les rendements journaliers (APRÈS alignement, sans fillna(0))."""
    returns = prices.pct_change()
    # v10 FIX: dropna() au lieu de fillna(0)
    return returns.dropna()


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
