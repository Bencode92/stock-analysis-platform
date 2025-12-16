#!/usr/bin/env python3
"""
Module partagé pour les scripts Twelve Data API
Factorise: rate limiting, timezone, calcul YTD, formatage

v14 - FIX: Fenêtre baseline_ytd élargie (01 déc → 31 jan) pour éviter problèmes week-end
"""

import os
import time
import datetime as dt
import logging
from typing import Tuple, Optional, List, Any
from twelvedata import TDClient

logger = logging.getLogger(__name__)

# ============================================================
# CONFIGURATION
# ============================================================

API_KEY = os.getenv("TWELVE_DATA_API")

# Mapping des fuseaux horaires par région
TZ_BY_REGION = {
    "US": "America/New_York",
    "Europe": "Europe/Paris",
    "Asia": "Asia/Tokyo",
    "Other": "UTC"
}

# Rate limiting config
RATE_LIMIT_DELAY = 0.8  # secondes entre chaque appel API

# Client Twelve Data (singleton)
_TD_CLIENT: Optional[TDClient] = None

# ============================================================
# FALLBACK VSE -> XETR (Vienna Stock Exchange -> Xetra)
# Les tickers VSE ne sont plus supportés par Twelve Data
# ============================================================
VSE_TO_XETR = {
    "EX37": "EXV5",   # Automobiles & Parts
    "EX28": "EXV1",   # Banks
    "EX38": "EXV6",   # Basic Resources
    "EX42": "EXV8",   # Construction & Materials
    "EX30": "EXH3",   # Food & Beverage
    "EX31": "EXV4",   # Health Care
    "EX33": "EXH1",   # Oil & Gas
    "EX43": "EXH7",   # Personal & Household Goods
    "EX34": "EXI5",   # Real Estate
    "EX41": "EXV9",   # Travel & Leisure
    "EX36": "EXH9",   # Utilities
}


def get_td_client() -> Optional[TDClient]:
    """Retourne le client Twelve Data (singleton)"""
    global _TD_CLIENT
    if _TD_CLIENT is None and API_KEY:
        _TD_CLIENT = TDClient(apikey=API_KEY)
    return _TD_CLIENT


def rate_limit_pause(delay: float = RATE_LIMIT_DELAY):
    """Pause pour respecter les limites API"""
    time.sleep(delay)


def _apply_vse_fallback(sym: str, exchange: str, mic_code: str) -> Tuple[str, str, str]:
    """
    Applique le fallback VSE -> XETR si nécessaire.
    """
    exchange_upper = (exchange or "").upper()
    mic_upper = (mic_code or "").upper()
    
    if exchange_upper == "VSE" or mic_upper == "XWBO":
        if sym in VSE_TO_XETR:
            new_sym = VSE_TO_XETR[sym]
            logger.warning(f"🔄 Fallback VSE→XETR: {sym} → {new_sym}")
            return new_sym, "XETR", "XETR"
        else:
            logger.warning(f"⚠️ Ticker VSE inconnu: {sym} - tentative avec XETR")
            return sym, "XETR", "XETR"
    
    return sym, exchange, mic_code


# ============================================================
# HELPERS
# ============================================================

def _safe_float(x: Any) -> Optional[float]:
    """Convertit en float de façon sécurisée"""
    if x is None or x == "" or x == "None":
        return None
    try:
        return float(x)
    except (ValueError, TypeError):
        return None


def _normalize_and_sort(values: Any) -> List[Tuple[str, float]]:
    """
    Normalise et TRIE les valeurs par date ASC.
    
    IMPORTANT: L'API Twelve Data retourne souvent en ordre DESC (plus récent d'abord).
    On DOIT trier nous-mêmes pour avoir l'ordre chronologique.
    
    Returns:
        Liste de tuples (date_str, close_float) triés par date ASC
    """
    rows = []
    
    # Extraire les valeurs selon le format
    if values is None:
        return []
    
    # Si c'est un tuple, prendre le premier élément
    if isinstance(values, tuple):
        values = values[0]
    
    # Si c'est un dict avec "values"
    if isinstance(values, dict):
        if "values" in values and isinstance(values["values"], list):
            values = values["values"]
        elif values.get("status") == "error":
            return []
        elif "datetime" in values:  # Single bar
            values = [values]
        else:
            return []
    
    # Maintenant values devrait être une liste
    if not isinstance(values, list):
        return []
    
    # Parser chaque valeur
    for v in values:
        if not isinstance(v, dict):
            continue
        d = (v.get("datetime") or "")[:10]
        c = _safe_float(v.get("close"))
        if d and c is not None:
            rows.append((d, c))
    
    # === TRI OBLIGATOIRE PAR DATE ASC ===
    rows.sort(key=lambda x: x[0])
    
    return rows


# ============================================================
# FONCTIONS API TWELVE DATA
# ============================================================

def quote_one(sym: str, region: str = "US", exchange: str = None, mic_code: str = None) -> Tuple[float, float, str]:
    """
    Récupère le dernier close propre + variation jour.
    """
    TD = get_td_client()
    if not TD:
        raise ValueError("Client Twelve Data non initialisé (API_KEY manquante?)")
    
    sym, exchange, mic_code = _apply_vse_fallback(sym, exchange, mic_code)
    
    try:
        timezone = TZ_BY_REGION.get(region, "UTC")
        params = {"symbol": sym, "timezone": timezone}
        
        if mic_code:
            params["mic_code"] = mic_code
        elif exchange:
            params["exchange"] = exchange
        
        q_json = TD.quote(**params).as_json()
        
        if isinstance(q_json, tuple):
            q_json = q_json[0]
        
        if isinstance(q_json, dict) and q_json.get("status") == "error":
            raise ValueError(f"API Error: {q_json.get('message', 'Unknown error')}")
        
        close = _safe_float(q_json.get("close"))
        pc = _safe_float(q_json.get("previous_close"))
        
        is_open_raw = q_json.get("is_market_open", False)
        is_open = is_open_raw == "true" if isinstance(is_open_raw, str) else bool(is_open_raw)
        
        last_close = pc if (is_open and pc is not None) else close
        
        if last_close is None:
            raise ValueError(f"Quote sans close valide pour {sym}")
        
        day_pct = _safe_float(q_json.get("percent_change")) or 0.0
        source = "previous_close" if (is_open and pc is not None) else "close"
        
        return last_close, day_pct, source
        
    except Exception as e:
        logger.error(f"Erreur quote pour {sym}: {e}")
        raise


def baseline_ytd(sym: str, region: str = "US", exchange: str = None, mic_code: str = None) -> Tuple[float, str]:
    """
    Baseline YTD = dernier close de déc N-1, sinon premier close de jan N.
    
    v14 - FIX CRITIQUE:
    - Suppression de start_date côté API (évite les effets week-end)
    - Fenêtre de filtrage élargie: 01 déc → 31 jan
    - outputsize=100 suffisant pour ~2 mois de bourse
    """
    TD = get_td_client()
    if not TD:
        raise ValueError("Client Twelve Data non initialisé")
    
    sym, exchange, mic_code = _apply_vse_fallback(sym, exchange, mic_code)
    
    year = dt.date.today().year
    prev = year - 1
    
    # ✅ FIX: On ne met PAS de start_date côté API
    # On filtre après avec une fenêtre large (évite les effets week-end)
    end = f"{year}-01-31"
    
    # Tentatives: mic_code -> exchange -> symbol seul
    attempts = []
    if mic_code:
        attempts.append(("mic_code", {"mic_code": mic_code}))
        attempts.append(("mic_as_exchange", {"exchange": mic_code}))
    if exchange:
        attempts.append(("exchange", {"exchange": exchange}))
    attempts.append(("symbol_only", {}))
    
    last_diag = None
    
    for label, kwargs in attempts:
        logger.info(f"📡 baseline_ytd({sym}) tentative: {label}")
        
        try:
            rate_limit_pause()
            
            ts = TD.time_series(
                symbol=sym,
                interval="1day",
                end_date=end,
                outputsize=100,  # ~2 mois de bourse, suffisant
                order="ASC",
                **kwargs
            )
            
            # Log URL (sans API key)
            try:
                url = ts.as_url()
                safe_url = url.split("apikey=")[0] + "apikey=***" if "apikey=" in url else url
                logger.info(f"  🔗 {safe_url}")
            except:
                pass
            
            js = ts.as_json()
            
            # === NORMALISER ET TRIER ===
            rows = _normalize_and_sort(js)
            
            if not rows:
                last_diag = f"{label}: aucune donnée"
                logger.warning(f"  ⚠️ {last_diag}")
                continue
            
            # Log de la couverture
            logger.info(f"  📅 {len(rows)} points, min={rows[0][0]}, max={rows[-1][0]}")
            
            # ✅ FIX: Fenêtre de filtrage LARGE (01 déc → 31 jan)
            # Évite les problèmes de week-end avec start_date=15/12
            start_guard = f"{prev}-12-01"
            end_guard = f"{year}-01-31"
            rows = [(d, c) for (d, c) in rows if start_guard <= d <= end_guard]
            
            if not rows:
                last_diag = f"{label}: données hors fenêtre déc-jan"
                logger.warning(f"  ⚠️ {last_diag}")
                continue
            
            # Séparer dec N-1 et jan N
            dec_rows = [(d, c) for (d, c) in rows if d.startswith(f"{prev}-12")]
            jan_rows = [(d, c) for (d, c) in rows if d.startswith(f"{year}-01")]
            
            logger.info(f"  📊 {len(dec_rows)} jours dec-{prev}, {len(jan_rows)} jours jan-{year}")
            
            # === SÉLECTION DE LA BASELINE ===
            
            # 1) DERNIER jour de décembre N-1 (idéal)
            if dec_rows:
                d0, c0 = max(dec_rows, key=lambda x: x[0])  # max = plus récent
                logger.info(f"  ✅ Baseline = {d0} (close: {c0:.2f}) [dernier dec-{prev}]")
                return c0, d0
            
            # 2) PREMIER jour de janvier N (fallback)
            if jan_rows:
                d0, c0 = min(jan_rows, key=lambda x: x[0])  # min = plus ancien
                logger.info(f"  ✅ Baseline = {d0} (close: {c0:.2f}) [premier jan-{year}]")
                return c0, d0
            
            last_diag = f"{label}: pas de dec-{prev} ni jan-{year}"
            logger.warning(f"  ⚠️ {last_diag}")
            
        except Exception as e:
            last_diag = f"{label}: exception {e}"
            logger.warning(f"  ⚠️ {last_diag}")
            continue
    
    raise ValueError(f"Aucune baseline exploitable pour {sym}. Last={last_diag}")


# ============================================================
# FONCTIONS DE FORMATAGE
# ============================================================

def format_value(value: float, currency: str) -> str:
    if currency in ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "HKD", "SGD", "MXN"]:
        return f"{value:,.2f}"
    elif currency == "GBp":
        return f"{value:,.2f}"
    elif currency in ["JPY", "KRW", "TWD", "INR", "TRY"]:
        return f"{value:,.0f}"
    else:
        return f"{value:,.2f}"


def format_value_with_currency(value: float, currency: str) -> str:
    CURRENCY_SYMBOLS = {
        "EUR": "€", "USD": "$", "GBP": "£", "GBp": "p",
        "CHF": "CHF", "JPY": "¥", "CAD": "C$", "AUD": "A$",
    }
    formatted = format_value(value, currency)
    symbol = CURRENCY_SYMBOLS.get(currency, currency)
    if currency == "GBp":
        return f"{formatted}{symbol}"
    return f"{symbol}{formatted}"


def format_percent(value: float) -> str:
    return f"{value:+.2f} %"


def parse_percentage(percent_str: str) -> float:
    if not percent_str:
        return 0.0
    clean_str = percent_str.replace('%', '').replace(' ', '').replace(',', '.')
    try:
        return float(clean_str)
    except ValueError:
        return 0.0


# ============================================================
# HELPERS RÉGION
# ============================================================

def determine_region_from_country(country: str) -> str:
    europe = ["France", "Allemagne", "Royaume Uni", "Italie", "Espagne", 
              "Suisse", "Pays-Bas", "Suède", "Zone Euro", "Europe", "Pays-bas"]
    north_america = ["États-Unis", "Etats-Unis", "Canada", "Mexique"]
    asia = ["Japon", "Chine", "Hong Kong", "Taiwan", "Corée du Sud", 
            "Singapour", "Inde", "Asie", "China"]
    
    if country in europe:
        return "Europe"
    elif country in north_america:
        return "US"
    elif country in asia:
        return "Asia"
    else:
        return "Other"


def determine_market_region(country: str) -> str:
    europe = ["France", "Allemagne", "Royaume Uni", "Italie", "Espagne", 
              "Suisse", "Pays-Bas", "Suède", "Zone Euro", "Europe", "Pays-bas"]
    north_america = ["États-Unis", "Etats-Unis", "Canada", "Mexique"]
    latin_america = ["Brésil", "Argentine", "Chili", "Colombie", "Pérou"]
    asia = ["Japon", "Chine", "Hong Kong", "Taiwan", "Corée du Sud", 
            "Singapour", "Inde", "Asie", "China"]
    
    if country in europe:
        return "europe"
    elif country in north_america:
        return "north-america"
    elif country in latin_america:
        return "latin-america"
    elif country in asia:
        return "asia"
    else:
        return "other"
