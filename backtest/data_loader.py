# backtest/data_loader.py
"""
Chargement des données de prix historiques via Twelve Data API.

Documentation API: https://twelvedata.com/docs
Plans:
- Free: 8 requests/minute, 800/day
- Ultra: pas de rate limit significatif

V2: Support pour charger les symboles depuis les portefeuilles générés
V3: Conversion automatique Yahoo → TwelveData format pour symboles internationaux
V4: Logique de fallback avec /stocks lookup (comme stock-filter-by-volume.js)
V5: Enrichissement massif du NAME_TO_TICKER_MAP pour couverture backtest complète
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

# Mapping MIC → country pour lookup
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


def parse_yahoo_symbol(symbol: str) -> Tuple[str, Optional[str], Optional[str]]:
    """
    Parse un symbole Yahoo pour extraire le ticker de base, le MIC et le pays.
    
    Returns:
        (base_ticker, mic_code, country)
    """
    if not symbol or "/" in symbol:
        return symbol, None, None
    
    # Trouver le suffixe Yahoo le plus long qui match
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
    """
    Client pour l'API Twelve Data.
    Gère le rate limiting, le caching et la résolution de symboles.
    """
    
    BASE_URL = "https://api.twelvedata.com"
    
    PLAN_LIMITS = {
        "free": 8,
        "basic": 30,
        "pro": 120,
        "ultra": 500,
    }
    
    def __init__(self, api_key: Optional[str] = None, plan: str = "ultra"):
        self.api_key = api_key or os.environ.get("TWELVE_DATA_API")
        if not self.api_key:
            raise ValueError(
                "Twelve Data API key required. "
                "Set TWELVE_DATA_API environment variable or pass api_key."
            )
        
        self.plan = plan.lower()
        self.session = requests.Session()
        self.last_request_time = 0
        
        requests_per_minute = self.PLAN_LIMITS.get(self.plan, 8)
        self.min_request_interval = 60.0 / requests_per_minute
        
        logger.info(f"TwelveData initialized with plan '{plan}' ({requests_per_minute} req/min)")
        
        self._cache: Dict[str, pd.DataFrame] = {}
        self._symbol_cache: Dict[str, str] = {}  # yahoo_symbol -> resolved_td_symbol
    
    def _rate_limit(self):
        """Respecter le rate limit de l'API."""
        if self.plan == "ultra":
            time.sleep(0.1)
            return
        
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_request_interval:
            sleep_time = self.min_request_interval - elapsed
            time.sleep(sleep_time)
        self.last_request_time = time.time()
    
    def _try_quote(self, symbol: str, mic: Optional[str] = None) -> Optional[dict]:
        """
        Essaie d'obtenir une quote pour un symbole.
        Teste plusieurs formats si MIC fourni.
        """
        formats_to_try = []
        
        if mic:
            # Format 1: symbol:MIC
            formats_to_try.append({"symbol": f"{symbol}:{mic}"})
            # Format 2: symbol avec mic_code séparé
            formats_to_try.append({"symbol": symbol, "mic_code": mic})
        
        # Format 3: symbole seul
        formats_to_try.append({"symbol": symbol})
        
        for params in formats_to_try:
            params["apikey"] = self.api_key
            try:
                self._rate_limit()
                response = self.session.get(
                    f"{self.BASE_URL}/quote",
                    params=params,
                    timeout=15
                )
                data = response.json()
                
                if data and data.get("status") != "error" and "symbol" in data:
                    logger.debug(f"Quote success with params: {params}")
                    return data
            except Exception as e:
                logger.debug(f"Quote failed for {params}: {e}")
                continue
        
        return None
    
    def _stocks_lookup(self, symbol: str, country: Optional[str] = None) -> List[dict]:
        """
        Recherche des symboles via l'endpoint /stocks.
        Similaire à tdStocksLookup dans stock-filter-by-volume.js
        """
        params = {
            "symbol": symbol,
            "apikey": self.api_key,
        }
        if country:
            params["country"] = country
        
        try:
            self._rate_limit()
            response = self.session.get(
                f"{self.BASE_URL}/stocks",
                params=params,
                timeout=15
            )
            data = response.json()
            
            if isinstance(data, dict) and "data" in data:
                return data["data"] if isinstance(data["data"], list) else []
            elif isinstance(data, list):
                return data
            return []
        except Exception as e:
            logger.debug(f"Stocks lookup failed for {symbol}: {e}")
            return []
    
    def _resolve_symbol(self, yahoo_symbol: str) -> Optional[str]:
        """
        Résout un symbole Yahoo en symbole TwelveData valide.
        Utilise la même logique que stock-filter-by-volume.js:
        1. Essaie le format direct (symbol:MIC)
        2. Si échec, recherche via /stocks et prend le meilleur match
        """
        # Check cache
        if yahoo_symbol in self._symbol_cache:
            return self._symbol_cache[yahoo_symbol]
        
        base_ticker, mic, country = parse_yahoo_symbol(yahoo_symbol)
        
        # Essai 1: Quote directe avec différents formats
        quote = self._try_quote(base_ticker, mic)
        if quote:
            resolved = quote.get("symbol", yahoo_symbol)
            self._symbol_cache[yahoo_symbol] = resolved
            logger.info(f"Resolved {yahoo_symbol} → {resolved} (direct quote)")
            return resolved
        
        # Essai 2: Lookup via /stocks
        if mic or country:
            candidates = self._stocks_lookup(base_ticker, country)
            
            if candidates:
                # Filtrer et trier les candidats
                # Préférer ceux qui matchent le MIC attendu
                best = None
                best_score = -1
                
                for c in candidates:
                    score = 0
                    c_mic = c.get("mic_code", "")
                    c_exchange = c.get("exchange", "").lower()
                    
                    # Bonus si MIC correspond
                    if mic and c_mic == mic:
                        score += 10
                    
                    # Bonus si exchange contient des mots-clés attendus
                    if mic == "XPAR" and "euronext" in c_exchange and "paris" in c_exchange:
                        score += 5
                    if mic == "XLON" and "london" in c_exchange:
                        score += 5
                    if mic == "XMAD" and "madrid" in c_exchange:
                        score += 5
                    if mic == "XNSE" and "national" in c_exchange and "india" in c_exchange:
                        score += 5
                    
                    # Malus si c'est une bourse US pour un symbole non-US
                    if any(x in c_exchange for x in ["nasdaq", "nyse", "nyse arca"]):
                        if country and country.lower() not in ["united states", "usa"]:
                            score -= 20
                    
                    if score > best_score:
                        best_score = score
                        best = c
                
                if best:
                    # Construire le symbole TwelveData
                    resolved_sym = best.get("symbol", base_ticker)
                    resolved_mic = best.get("mic_code")
                    
                    if resolved_mic:
                        resolved = f"{resolved_sym}:{resolved_mic}"
                    else:
                        resolved = resolved_sym
                    
                    # Vérifier que ça fonctionne
                    verify_quote = self._try_quote(resolved_sym, resolved_mic)
                    if verify_quote:
                        self._symbol_cache[yahoo_symbol] = resolved
                        logger.info(f"Resolved {yahoo_symbol} → {resolved} (stocks lookup)")
                        return resolved
        
        # Essai 3: Symbole brut sans conversion
        quote = self._try_quote(yahoo_symbol, None)
        if quote:
            self._symbol_cache[yahoo_symbol] = yahoo_symbol
            logger.info(f"Resolved {yahoo_symbol} → {yahoo_symbol} (raw)")
            return yahoo_symbol
        
        # Échec
        logger.warning(f"Could not resolve symbol: {yahoo_symbol}")
        self._symbol_cache[yahoo_symbol] = None
        return None
    
    def get_time_series(
        self,
        symbol: str,
        start_date: str,
        end_date: str,
        interval: str = "1day"
    ) -> Optional[pd.DataFrame]:
        """
        Récupère les prix historiques pour un symbole.
        Résout automatiquement les symboles Yahoo en format TwelveData.
        """
        # Résoudre le symbole
        resolved = self._resolve_symbol(symbol)
        if not resolved:
            logger.warning(f"Skipping {symbol} - could not resolve")
            return None
        
        cache_key = f"{resolved}_{start_date}_{end_date}_{interval}"
        if cache_key in self._cache:
            logger.debug(f"Cache hit: {symbol}")
            return self._cache[cache_key]
        
        self._rate_limit()
        
        params = {
            "symbol": resolved,
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
                logger.warning(f"API error for {symbol} ({resolved}): {data.get('message', 'Unknown')}")
                return None
            
            if "values" not in data:
                logger.warning(f"No data for {symbol} ({resolved})")
                return None
            
            df = pd.DataFrame(data["values"])
            df["datetime"] = pd.to_datetime(df["datetime"])
            df = df.set_index("datetime").sort_index()
            
            for col in ["open", "high", "low", "close", "volume"]:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors="coerce")
            
            self._cache[cache_key] = df
            logger.info(f"Loaded {symbol}: {len(df)} days")
            return df
            
        except requests.RequestException as e:
            logger.error(f"Request error for {symbol} ({resolved}): {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error for {symbol} ({resolved}): {e}")
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
        prices_df = prices_df.ffill()
        
        logger.info(f"Loaded {len(prices_df.columns)} symbols, {len(prices_df)} days")
        return prices_df


# ============ PORTFOLIO SYMBOL EXTRACTION ============

def extract_portfolio_symbols(portfolios_path: str = "data/portfolios.json") -> Set[str]:
    """
    Extrait tous les symboles uniques des portefeuilles générés.
    """
    symbols = set()
    
    try:
        with open(portfolios_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        logger.warning(f"Could not load portfolios from {portfolios_path}: {e}")
        return symbols
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        if profile not in data:
            continue
        
        profile_data = data[profile]
        
        for category in ["Actions", "ETF", "Obligations", "Crypto"]:
            if category not in profile_data:
                continue
            
            for name, weight in profile_data[category].items():
                ticker = name_to_ticker(name)
                if ticker:
                    symbols.add(ticker)
    
    logger.info(f"Extracted {len(symbols)} unique symbols from portfolios")
    return symbols


# ============ NAME TO TICKER MAPPING ============
# V5: Enrichissement massif pour couverture backtest complète

NAME_TO_TICKER_MAP = {
    # ========== Actions Européennes ==========
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
    "ALLIANZ": "ALV.DE",  # Alias court
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
    # Espagne
    "CAIXABANK SA": "CABK.MC",
    "CAIXABANK": "CABK.MC",
    "BANCO SANTANDER SA": "SAN.MC",
    "IBERDROLA SA": "IBE.MC",
    "INDITEX": "ITX.MC",
    # Italie
    "ENEL": "ENEL.MI",
    "ENEL SPA": "ENEL.MI",
    "ENI SPA": "ENI.MI",
    "INTESA SANPAOLO SPA": "ISP.MI",
    "UNICREDIT SPA": "UCG.MI",
    "FERRARI NV": "RACE.MI",
    # Allemagne
    "DEUTSCHE TELEKOM AG": "DTE.DE",
    "BMW AG": "BMW.DE",
    "MERCEDES BENZ GROUP AG": "MBG.DE",
    "VOLKSWAGEN AG": "VOW3.DE",
    "BAYER AG": "BAYN.DE",
    "ADIDAS AG": "ADS.DE",
    "DEUTSCHE BANK AG": "DBK.DE",
    "MUNICH RE": "MUV2.DE",
    # France
    "BNP PARIBAS SA": "BNP.PA",
    "AIR LIQUIDE SA": "AI.PA",
    "LOREAL SA": "OR.PA",
    "SCHNEIDER ELECTRIC SE": "SU.PA",
    "DANONE SA": "BN.PA",
    "VINCI SA": "DG.PA",
    "AIRBUS SE": "AIR.PA",
    "KERING SA": "KER.PA",
    
    # ========== Actions Asie ==========
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
    # Inde - Ajouts V5
    "MUTHOOT FINANCE LTD": "MUTHOOTFIN.NS",
    "MUTHOOT FINANCE": "MUTHOOTFIN.NS",
    "BAJAJ FINANCE LTD": "BAJFINANCE.NS",
    "ICICI BANK LTD": "ICICIBANK.NS",
    "STATE BANK OF INDIA": "SBIN.NS",
    "HINDUSTAN UNILEVER LTD": "HINDUNILVR.NS",
    "ITC LTD": "ITC.NS",
    "BHARTI AIRTEL LTD": "BHARTIARTL.NS",
    "WIPRO LTD": "WIPRO.NS",
    "HCL TECHNOLOGIES LTD": "HCLTECH.NS",
    "MARUTI SUZUKI INDIA LTD": "MARUTI.NS",
    "TITAN COMPANY LTD": "TITAN.NS",
    "SUN PHARMACEUTICAL INDUSTRIES LTD": "SUNPHARMA.NS",
    "KOTAK MAHINDRA BANK LTD": "KOTAKBANK.NS",
    "AXIS BANK LTD": "AXISBANK.NS",
    "LARSEN & TOUBRO LTD": "LT.NS",
    # Japon
    "TOYOTA MOTOR CORP": "7203.T",
    "SONY GROUP CORP": "6758.T",
    "KEYENCE CORP": "6861.T",
    "SOFTBANK GROUP CORP": "9984.T",
    "MITSUBISHI UFJ FINANCIAL GROUP": "8306.T",
    
    # ========== Actions US ==========
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
    # Ajouts V5 - US
    "ELI LILLY": "LLY",
    "ELI LILLY AND CO": "LLY",
    "ELI LILLY & CO": "LLY",
    "CUMMINS INC": "CMI",
    "CUMMINS": "CMI",
    "TJX INC": "TJX",
    "TJX COMPANIES INC": "TJX",
    "THE TJX COMPANIES INC": "TJX",
    "CATERPILLAR INC": "CAT",
    "DEERE & CO": "DE",
    "3M CO": "MMM",
    "HONEYWELL INTERNATIONAL INC": "HON",
    "LOCKHEED MARTIN CORP": "LMT",
    "RAYTHEON TECHNOLOGIES CORP": "RTX",
    "BOEING CO": "BA",
    "GENERAL ELECTRIC CO": "GE",
    "UNION PACIFIC CORP": "UNP",
    "UNITED PARCEL SERVICE INC": "UPS",
    "FEDEX CORP": "FDX",
    "PAYPAL HOLDINGS INC": "PYPL",
    "BLOCK INC": "SQ",
    "INTUIT INC": "INTU",
    "SERVICENOW INC": "NOW",
    "SNOWFLAKE INC": "SNOW",
    "PALANTIR TECHNOLOGIES INC": "PLTR",
    "COINBASE GLOBAL INC": "COIN",
    "MODERNA INC": "MRNA",
    "PFIZER INC": "PFE",
    "BRISTOL MYERS SQUIBB CO": "BMY",
    "GILEAD SCIENCES INC": "GILD",
    "REGENERON PHARMACEUTICALS INC": "REGN",
    "VERTEX PHARMACEUTICALS INC": "VRTX",
    "DANAHER CORP": "DHR",
    "THERMO FISHER SCIENTIFIC INC": "TMO",
    "ABBOTT LABORATORIES": "ABT",
    "MEDTRONIC PLC": "MDT",
    "STRYKER CORP": "SYK",
    "INTUITIVE SURGICAL INC": "ISRG",
    "MCDONALDS CORP": "MCD",
    "STARBUCKS CORP": "SBUX",
    "NIKE INC": "NKE",
    "LULULEMON ATHLETICA INC": "LULU",
    "TARGET CORP": "TGT",
    "LOWES COMPANIES INC": "LOW",
    "DOLLAR GENERAL CORP": "DG",
    "ROSS STORES INC": "ROST",
    "AUTOZONE INC": "AZO",
    "OREILLY AUTOMOTIVE INC": "ORLY",
    "BOOKING HOLDINGS INC": "BKNG",
    "AIRBNB INC": "ABNB",
    "UBER TECHNOLOGIES INC": "UBER",
    "DOORDASH INC": "DASH",
    "RIVIAN AUTOMOTIVE INC": "RIVN",
    "LUCID GROUP INC": "LCID",
    "BANK OF AMERICA CORP": "BAC",
    "WELLS FARGO & CO": "WFC",
    "CITIGROUP INC": "C",
    "GOLDMAN SACHS GROUP INC": "GS",
    "MORGAN STANLEY": "MS",
    "CHARLES SCHWAB CORP": "SCHW",
    "BLACKROCK INC": "BLK",
    "S&P GLOBAL INC": "SPGI",
    "MOODYS CORP": "MCO",
    "CME GROUP INC": "CME",
    "INTERCONTINENTAL EXCHANGE INC": "ICE",
    "AMERICAN EXPRESS CO": "AXP",
    "CAPITAL ONE FINANCIAL CORP": "COF",
    "PROGRESSIVE CORP": "PGR",
    "MARSH & MCLENNAN COMPANIES INC": "MMC",
    "AON PLC": "AON",
    "TRAVELERS COMPANIES INC": "TRV",
    "CHUBB LTD": "CB",
    "METLIFE INC": "MET",
    "PRUDENTIAL FINANCIAL INC": "PRU",
    "AFLAC INC": "AFL",
    "AMERICAN TOWER CORP": "AMT",
    "CROWN CASTLE INC": "CCI",
    "EQUINIX INC": "EQIX",
    "DIGITAL REALTY TRUST INC": "DLR",
    "PROLOGIS INC": "PLD",
    "PUBLIC STORAGE": "PSA",
    "SIMON PROPERTY GROUP INC": "SPG",
    "REALTY INCOME CORP": "O",
    "WELLTOWER INC": "WELL",
    "DUKE ENERGY CORP": "DUK",
    "SOUTHERN CO": "SO",
    "DOMINION ENERGY INC": "D",
    "NEXTERA ENERGY INC": "NEE",
    "AMERICAN ELECTRIC POWER CO INC": "AEP",
    "XCEL ENERGY INC": "XEL",
    "SEMPRA": "SRE",
    "CONSOLIDATED EDISON INC": "ED",
    
    # ========== ETF Gold ==========
    "SPDR Gold Shares": "GLD",
    "iShares Gold Trust": "IAU",
    "SPDR Gold MiniShares Trust": "GLDM",
    "abrdn Physical Gold Shares ETF": "SGOL",
    "iShares Gold Trust Micro": "IAUM",
    "abrdn Physical Precious Metals Basket Shares ETF": "GLTR",
    "Goldman Sachs Physical Gold ETF": "AAAU",
    
    # ========== ETF Country/Region ==========
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
    
    # ========== ETF Sectoriels ==========
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
    "Communication Services Select Sector SPDR Fund": "XLC",
    
    # ========== ETF Bonds/Fixed Income ==========
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
    # Ajouts V5 - Bonds ETF
    "SPDR DoubleLine Total Return Tactical ETF": "TOTL",
    "SPDR DoubleLine": "TOTL",
    "iShares 1-3 Year Treasury Bond ETF": "SHY",
    "iShares Short Treasury Bond ETF": "SHV",
    "Vanguard Short-Term Bond ETF": "BSV",
    "Vanguard Intermediate-Term Bond ETF": "BIV",
    "Vanguard Long-Term Bond ETF": "BLV",
    "iShares Core U.S. Aggregate Bond ETF": "AGG",
    "SPDR Bloomberg Barclays High Yield Bond ETF": "JNK",
    "iShares J.P. Morgan USD Emerging Markets Bond ETF": "EMB",
    "Vanguard Total International Bond ETF": "BNDX",
    "iShares National Muni Bond ETF": "MUB",
    "PIMCO Enhanced Short Maturity Active ETF": "MINT",
    "iShares 0-3 Month Treasury Bond ETF": "SGOV",
    "SPDR Bloomberg 1-3 Month T-Bill ETF": "BIL",
    
    # ========== ETF Dividendes ==========
    "Vanguard Dividend Appreciation ETF": "VIG",
    "Schwab U.S. Dividend Equity ETF": "SCHD",
    "iShares Select Dividend ETF": "DVY",
    "SPDR S&P Dividend ETF": "SDY",
    "Vanguard High Dividend Yield ETF": "VYM",
    "iShares Core Dividend Growth ETF": "DGRO",
    "ProShares S&P 500 Dividend Aristocrats ETF": "NOBL",
    
    # ========== ETF Large-cap ==========
    "SPDR S&P 500 ETF Trust": "SPY",
    "iShares Core S&P 500 ETF": "IVV",
    "Vanguard S&P 500 ETF": "VOO",
    "Invesco QQQ Trust": "QQQ",
    "Vanguard Total Stock Market ETF": "VTI",
    "iShares Russell 2000 ETF": "IWM",
    "Vanguard Growth ETF": "VUG",
    "Vanguard Value ETF": "VTV",
    "iShares Russell 1000 Growth ETF": "IWF",
    "iShares Russell 1000 Value ETF": "IWD",
    
    # ========== Crypto ==========
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
    "Binance Coin": "BNB/USD",
    "Tron": "TRX/USD",
    "Shiba Inu": "SHIB/USD",
}


def name_to_ticker(name: str) -> Optional[str]:
    """Convertit un nom d'actif en ticker."""
    name_clean = name.strip().upper()
    
    # Recherche exacte
    for map_name, ticker in NAME_TO_TICKER_MAP.items():
        if map_name.upper() == name_clean:
            return ticker
    
    # Recherche partielle
    for map_name, ticker in NAME_TO_TICKER_MAP.items():
        if map_name.upper() in name_clean or name_clean in map_name.upper():
            return ticker
    
    # Si c'est déjà un ticker court valide
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
    """Charge les prix pour le backtest."""
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")
    if start_date is None:
        lookback = config.get("backtest", {}).get("default_lookback_days", 90)
        start_dt = datetime.now() - timedelta(days=lookback + 30)
        start_date = start_dt.strftime("%Y-%m-%d")
    
    symbols = set()
    
    if portfolios_path and Path(portfolios_path).exists():
        portfolio_symbols = extract_portfolio_symbols(portfolios_path)
        symbols.update(portfolio_symbols)
        logger.info(f"Loaded {len(portfolio_symbols)} symbols from portfolios")
    
    if include_benchmark:
        if benchmark_symbols is None:
            benchmark_symbols = ["URTH"]
        for bench in benchmark_symbols:
            symbols.add(bench)
            logger.info(f"Added benchmark: {bench}")
    
    if not symbols:
        logger.warning("No portfolio symbols found, falling back to config.test_universe")
        test_universe = config.get("backtest", {}).get("test_universe", {})
        symbols.update(test_universe.get("stocks", []))
        symbols.update(test_universe.get("etfs", []))
        symbols.update(test_universe.get("crypto", []))
    
    if not symbols:
        raise ValueError("No symbols to load.")
    
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


def add_ticker_mapping(name: str, ticker: str):
    """Ajoute un mapping nom → ticker dynamiquement."""
    NAME_TO_TICKER_MAP[name] = ticker
    logger.info(f"Added mapping: {name} → {ticker}")


def get_all_mappings() -> Dict[str, str]:
    """Retourne tous les mappings nom → ticker."""
    return NAME_TO_TICKER_MAP.copy()


def get_supported_exchanges() -> Dict[str, str]:
    """Retourne les bourses supportées avec leur code MIC."""
    return YAHOO_TO_TWELVEDATA_MIC.copy()
