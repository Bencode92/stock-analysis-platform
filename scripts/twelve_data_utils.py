#!/usr/bin/env python3
"""
Module partagé pour les scripts Twelve Data API
Factorise: rate limiting, timezone, calcul YTD, formatage

v11 - FIX: Requête ciblée dec-jan avec start_date/end_date EXPLICITES
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
    Baseline YTD = valeur la plus proche du 1er janvier de l'année en cours.
    
    Stratégie:
    1. Dernier close de décembre N-1 (ex: 2024-12-30)
    2. OU premier close de janvier N (ex: 2025-01-02)
    
    v11: Requête CIBLÉE sur dec-jan avec start_date/end_date EXPLICITES
    Plusieurs tentatives avec différentes combinaisons de paramètres.
    
    Args:
        sym: Symbole de l'instrument
        region: Région (non utilisé)
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
    
    # === v11: MULTIPLE STRATEGIES ===
    # Chaque stratégie est une liste de paramètres à essayer
    
    strategies = []
    
    # Stratégie 1: start_date/end_date CIBLÉS sur dec-jan avec mic_code
    if mic_code:
        strategies.append({
            "symbol": sym,
            "interval": "1day",
            "start_date": f"{prev}-12-01",
            "end_date": f"{year}-01-31",
            "mic_code": mic_code,
            "label": f"targeted dec-jan + mic_code={mic_code}"
        })
    
    # Stratégie 2: start_date/end_date CIBLÉS avec exchange
    if exchange:
        strategies.append({
            "symbol": sym,
            "interval": "1day",
            "start_date": f"{prev}-12-01",
            "end_date": f"{year}-01-31",
            "exchange": exchange,
            "label": f"targeted dec-jan + exchange={exchange}"
        })
    
    # Stratégie 3: start_date/end_date sans exchange/mic (symbol seul)
    strategies.append({
        "symbol": sym,
        "interval": "1day",
        "start_date": f"{prev}-12-01",
        "end_date": f"{year}-01-31",
        "label": "targeted dec-jan + symbol only"
    })
    
    # Stratégie 4: outputsize large avec mic_code (fallback)
    if mic_code:
        strategies.append({
            "symbol": sym,
            "interval": "1day",
            "outputsize": 400,
            "mic_code": mic_code,
            "label": f"outputsize=400 + mic_code={mic_code}"
        })
    
    # Stratégie 5: outputsize large avec exchange (fallback)
    if exchange:
        strategies.append({
            "symbol": sym,
            "interval": "1day",
            "outputsize": 400,
            "exchange": exchange,
            "label": f"outputsize=400 + exchange={exchange}"
        })
    
    # Stratégie 6: outputsize large sans rien (dernier recours)
    strategies.append({
        "symbol": sym,
        "interval": "1day",
        "outputsize": 400,
        "label": "outputsize=400 + symbol only"
    })
    
    last_error = None
    
    for i, strategy in enumerate(strategies, 1):
        label = strategy.pop("label")
        
        logger.info(f"📡 baseline_ytd({sym}) tentative {i}/{len(strategies)}: {label}")
        
        try:
            ts = TD.time_series(**strategy)
            
            # Log de l'URL pour debug
            try:
                url = ts.as_url()
                # Masquer l'API key
                safe_url = url.split("apikey=")[0] + "apikey=***" if "apikey=" in url else url
                logger.info(f"  🔗 {safe_url}")
            except Exception:
                pass
            
            js = ts.as_json()
            
            if isinstance(js, tuple):
                js = js[0]
            
            if isinstance(js, dict) and js.get("status") == "error":
                logger.warning(f"  ⚠️ API error: {js.get('message', 'Unknown')}")
                last_error = js.get('message', 'Unknown')
                continue
            
            # Extraire les valeurs
            values = _extract_ts_values(js)
            
            if not values:
                logger.warning(f"  ⚠️ Aucune valeur retournée")
                last_error = "Aucune valeur"
                continue
            
            # Parser les dates et closes
            rows = []
            for v in values:
                d = (v.get("datetime") or "")[:10]
                c = _safe_float(v.get("close"))
                if d and c is not None:
                    rows.append((d, c))
            
            if not rows:
                logger.warning(f"  ⚠️ Aucune donnée valide")
                last_error = "Aucune donnée valide"
                continue
            
            # Trier par date
            rows.sort(key=lambda x: x[0])
            
            # Log des dates reçues
            logger.info(f"  📅 {len(rows)} points, min={rows[0][0]}, max={rows[-1][0]}")
            
            # === TROUVER LA BASELINE LA PLUS PROCHE DU 1ER JANVIER ===
            
            # 1) DERNIER jour de décembre N-1 (idéal: 2024-12-30 ou 2024-12-31)
            dec_rows = [(d, c) for (d, c) in rows if d.startswith(f"{prev}-12")]
            if dec_rows:
                d0, c0 = max(dec_rows, key=lambda x: x[0])
                logger.info(f"  ✅ Baseline = {d0} (close: {c0:.2f}) [dernier jour dec {prev}]")
                return c0, d0
            
            # 2) PREMIER jour de janvier N (idéal: 2025-01-02)
            jan_rows = [(d, c) for (d, c) in rows if d.startswith(f"{year}-01")]
            if jan_rows:
                d0, c0 = min(jan_rows, key=lambda x: x[0])
                logger.info(f"  ✅ Baseline = {d0} (close: {c0:.2f}) [premier jour jan {year}]")
                return c0, d0
            
            # 3) Fallback: premier jour de N-1 disponible (dernier recours)
            prev_rows = [(d, c) for (d, c) in rows if d.startswith(str(prev))]
            if prev_rows:
                d0, c0 = max(prev_rows, key=lambda x: x[0])
                logger.warning(f"  ⚠️ Baseline approximative = {d0} (close: {c0:.2f}) [dernier jour {prev}]")
                return c0, d0
            
            # 4) Fallback: premier jour de N disponible (très dernier recours)
            curr_rows = [(d, c) for (d, c) in rows if d.startswith(str(year))]
            if curr_rows:
                d0, c0 = min(curr_rows, key=lambda x: x[0])
                logger.warning(f"  ⚠️ Baseline approximative = {d0} (close: {c0:.2f}) [premier jour {year}]")
                return c0, d0
            
            # Pas de données exploitables
            logger.warning(f"  ⚠️ Pas de données {prev} ou {year} dans cette réponse")
            last_error = f"Pas de données {prev} ou {year}"
            
        except Exception as e:
            logger.warning(f"  ⚠️ Exception: {e}")
            last_error = str(e)
            continue
    
    raise ValueError(f"Aucune donnée exploitable pour {sym}. Dernière erreur: {last_error}")


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
