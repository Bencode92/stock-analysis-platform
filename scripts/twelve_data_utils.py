#!/usr/bin/env python3
"""
Module partagé pour les scripts Twelve Data API
Factorise: rate limiting, timezone, calcul YTD, formatage

v9 - FIX: baseline_ytd sans start/end_date + log URL + staleness check
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
    
    Returns:
        (symbol, exchange, mic_code) - potentiellement modifiés
    """
    exchange_upper = (exchange or "").upper()
    mic_upper = (mic_code or "").upper()
    
    # Détecter si c'est un ticker VSE/Vienna
    if exchange_upper == "VSE" or mic_upper == "XWBO":
        if sym in VSE_TO_XETR:
            new_sym = VSE_TO_XETR[sym]
            logger.warning(f"🔄 Fallback VSE→XETR: {sym} → {new_sym}")
            return new_sym, "XETR", "XETR"
        else:
            logger.warning(f"⚠️ Ticker VSE inconnu: {sym} - tentative avec XETR quand même")
            return sym, "XETR", "XETR"
    
    return sym, exchange, mic_code


# ============================================================
# HELPERS PARSING ROBUSTE
# ============================================================

def _extract_ts_values(js: Any) -> List[dict]:
    """
    Extrait les valeurs time_series de façon robuste.
    Gère: list, dict{"values":[...]}, dict "single bar", tuple
    """
    if isinstance(js, tuple):
        js = js[0]
    
    if isinstance(js, dict):
        # Cas standard: {"values": [...]}
        if isinstance(js.get("values"), list):
            return js["values"]
        # Cas "single bar": {"datetime": ..., "close": ...}
        if "datetime" in js and ("close" in js or "price" in js):
            return [js]
        # Erreur API
        if js.get("status") == "error":
            return []
        return []
    
    if isinstance(js, list):
        return js
    
    return []


def _safe_float(x: Any) -> Optional[float]:
    """Convertit en float de façon sécurisée"""
    if x is None or x == "" or x == "None":
        return None
    try:
        return float(x)
    except (ValueError, TypeError):
        return None


# ============================================================
# FONCTIONS API TWELVE DATA
# ============================================================

def quote_one(sym: str, region: str = "US", exchange: str = None, mic_code: str = None) -> Tuple[float, float, str]:
    """
    Récupère le dernier close propre + variation jour.
    Privilégie previous_close si le marché est ouvert.
    
    Args:
        sym: Symbole de l'instrument (ex: "EXV5", "AAPL")
        region: Région pour le timezone ("US", "Europe", "Asia", "Other")
        exchange: Code exchange (ex: "XETR", "NYSE")
        mic_code: MIC code ISO 10383 (ex: "XETR", "ARCX") - PLUS PRÉCIS
    
    Returns:
        (last_close, day_percent_change, source)
        source = 'close' ou 'previous_close'
    """
    TD = get_td_client()
    if not TD:
        raise ValueError("Client Twelve Data non initialisé (API_KEY manquante?)")
    
    # Appliquer le fallback VSE -> XETR
    sym, exchange, mic_code = _apply_vse_fallback(sym, exchange, mic_code)
    
    try:
        timezone = TZ_BY_REGION.get(region, "UTC")
        
        # Construire les paramètres de la requête
        params = {
            "symbol": sym,
            "timezone": timezone
        }
        
        # Priorité: mic_code > exchange (MIC est plus précis)
        if mic_code:
            params["mic_code"] = mic_code
        elif exchange:
            params["exchange"] = exchange
        
        logger.debug(f"📡 quote_one({sym}) params: {params}")
        
        q_json = TD.quote(**params).as_json()
        
        if isinstance(q_json, tuple):
            q_json = q_json[0]
        
        # Vérifier les erreurs API
        if isinstance(q_json, dict) and q_json.get("status") == "error":
            raise ValueError(f"API Error: {q_json.get('message', 'Unknown error')}")
        
        # Extraire close et previous_close
        close = _safe_float(q_json.get("close"))
        pc = _safe_float(q_json.get("previous_close"))
        
        # Déterminer si le marché est ouvert
        is_open_raw = q_json.get("is_market_open", False)
        is_open = is_open_raw == "true" if isinstance(is_open_raw, str) else bool(is_open_raw)
        
        # Si marché ouvert et previous_close existe -> on prend previous_close
        last_close = pc if (is_open and pc is not None) else close
        
        if last_close is None:
            raise ValueError(f"Quote sans close valide pour {sym}: {q_json}")
        
        day_pct = _safe_float(q_json.get("percent_change")) or 0.0
        source = "previous_close" if (is_open and pc is not None) else "close"
        
        logger.debug(f"Quote {sym}: {last_close} ({day_pct:+.2f}%), source: {source}")
        
        return last_close, day_pct, source
        
    except Exception as e:
        logger.error(f"Erreur quote pour {sym}: {e}")
        raise


def baseline_ytd(sym: str, region: str = "US", exchange: str = None, mic_code: str = None) -> Tuple[float, str]:
    """
    Baseline YTD = dernier close de l'année N-1.
    Fallback = premier close de N si pas de point N-1.
    
    v9: Fix critique - NE PAS utiliser start_date/end_date
    - Utilise outputsize=120 pour récupérer les 120 derniers jours
    - order="desc" pour avoir les plus récents d'abord
    - Pas de filtre date (souvent ignoré par l'API)
    - Log de l'URL pour debug
    - Staleness check (baseline trop ancienne = warning)
    
    Args:
        sym: Symbole de l'instrument
        region: Région (non utilisé - on force timezone="Exchange")
        exchange: Code exchange (ex: "NYSE", "XETR")
        mic_code: MIC code ISO 10383 (ex: "ARCX", "XETR")
    
    Returns:
        (baseline_close, baseline_date_iso)
    """
    TD = get_td_client()
    if not TD:
        raise ValueError("Client Twelve Data non initialisé")
    
    # Appliquer le fallback VSE -> XETR
    sym, exchange, mic_code = _apply_vse_fallback(sym, exchange, mic_code)
    
    year = dt.date.today().year
    prev = year - 1
    
    # === v9: Requête SIMPLE sans start/end_date ===
    # Les filtres date ne sont pas fiables avec Twelve Data
    # On récupère les 120 derniers jours et on filtre côté client
    params = {
        "symbol": sym,
        "interval": "1day",
        "outputsize": 120,         # ~4-5 mois de données
        "timezone": "Exchange",    # Évite les décalages
        "order": "desc",           # Plus récents d'abord (minuscules!)
    }
    
    # Priorité: exchange > mic_code (inversé par rapport à quote)
    # Car time_series semble mieux fonctionner avec exchange
    if exchange:
        params["exchange"] = exchange
    elif mic_code:
        params["mic_code"] = mic_code
    else:
        raise ValueError(f"exchange/mic_code manquant pour {sym}")
    
    logger.info(f"📡 baseline_ytd({sym})")
    
    try:
        ts = TD.time_series(**params)
        
        # Log de l'URL pour debug (sans API key)
        try:
            url = ts.as_url()
            # Masquer l'API key dans les logs
            safe_url = url.split("apikey=")[0] + "apikey=***" if "apikey=" in url else url
            logger.info(f"  🔗 URL: {safe_url}")
        except Exception:
            pass
        
        js = ts.as_json()
        
        if isinstance(js, tuple):
            js = js[0]
        
        if isinstance(js, dict) and js.get("status") == "error":
            raise ValueError(f"Erreur API: {js.get('message', 'Unknown')}")
        
        # Extraire les valeurs
        values = _extract_ts_values(js)
        
        if not values:
            raise ValueError(f"Aucune donnée time_series pour {sym}")
        
        # Parser les dates et closes
        rows = []
        for v in values:
            d = (v.get("datetime") or "")[:10]
            c = _safe_float(v.get("close"))
            if d and c is not None:
                rows.append((d, c))
        
        if not rows:
            raise ValueError(f"Aucune donnée valide pour {sym}")
        
        # Log des dates reçues
        all_dates = sorted([r[0] for r in rows])
        logger.info(f"  📅 {len(rows)} points, min={all_dates[0]}, max={all_dates[-1]}")
        
        # 1) Baseline = DERNIER jour coté de N-1
        prev_rows = [(d, c) for (d, c) in rows if d.startswith(str(prev))]
        
        if prev_rows:
            d0, c0 = max(prev_rows, key=lambda x: x[0])
            
            # Staleness check: baseline doit être fin décembre
            if d0 < f"{prev}-12-15":
                logger.warning(f"  ⚠️ Baseline trop ancienne ({d0}) → données incomplètes?")
            else:
                logger.info(f"  ✅ Baseline = {d0} (close: {c0:.2f})")
            
            return c0, d0
        
        # 2) Fallback = PREMIER jour coté de N
        curr_rows = [(d, c) for (d, c) in rows if d.startswith(str(year))]
        
        if curr_rows:
            d0, c0 = min(curr_rows, key=lambda x: x[0])
            logger.warning(f"  ⚠️ Pas de {prev}, fallback = {d0} (close: {c0:.2f})")
            return c0, d0
        
        raise ValueError(f"Aucune donnée {prev} ou {year} pour {sym}")
        
    except Exception as e:
        logger.error(f"Erreur baseline YTD pour {sym}: {e}")
        raise


# ============================================================
# FONCTIONS DE FORMATAGE
# ============================================================

def format_value(value: float, currency: str) -> str:
    """
    Formate une valeur selon la devise.
    
    Note: GBp = pence britanniques (1 GBP = 100 GBp)
    On affiche en GBp tel quel pour éviter toute confusion.
    """
    # Devises avec 2 décimales
    if currency in ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "HKD", "SGD", "MXN"]:
        return f"{value:,.2f}"
    # GBp (pence) - afficher tel quel avec indication
    elif currency == "GBp":
        return f"{value:,.2f}"  # Sera affiché avec "GBp" comme unité
    # Devises sans décimales
    elif currency in ["JPY", "KRW", "TWD", "INR", "TRY"]:
        return f"{value:,.0f}"
    else:
        return f"{value:,.2f}"


def format_value_with_currency(value: float, currency: str) -> str:
    """
    Formate une valeur AVEC le symbole de devise.
    Gère correctement GBp (pence) vs GBP (livres).
    """
    CURRENCY_SYMBOLS = {
        "EUR": "€",
        "USD": "$",
        "GBP": "£",
        "GBp": "p",  # Pence symbol
        "CHF": "CHF",
        "JPY": "¥",
        "CAD": "C$",
        "AUD": "A$",
    }
    
    formatted = format_value(value, currency)
    symbol = CURRENCY_SYMBOLS.get(currency, currency)
    
    # Pour GBp, le symbole va après (ex: "4004.50p")
    if currency == "GBp":
        return f"{formatted}{symbol}"
    # Pour les autres, symbole avant
    return f"{symbol}{formatted}"


def format_percent(value: float) -> str:
    """Formate un pourcentage avec signe"""
    return f"{value:+.2f} %"


def parse_percentage(percent_str: str) -> float:
    """Convertit une chaîne de pourcentage en float"""
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
    """Détermine la région API (US/Europe/Asia/Other) depuis le pays"""
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
    """Détermine la région pour le JSON de sortie (europe/north-america/etc)"""
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
