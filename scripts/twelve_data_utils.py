#!/usr/bin/env python3
"""
Module partagé pour les scripts Twelve Data API
Factorise: rate limiting, timezone, calcul YTD, formatage
"""

import os
import time
import datetime as dt
import logging
from typing import Tuple, Optional
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


def get_td_client() -> Optional[TDClient]:
    """Retourne le client Twelve Data (singleton)"""
    global _TD_CLIENT
    if _TD_CLIENT is None and API_KEY:
        _TD_CLIENT = TDClient(apikey=API_KEY)
    return _TD_CLIENT


def rate_limit_pause(delay: float = RATE_LIMIT_DELAY):
    """Pause pour respecter les limites API"""
    time.sleep(delay)


# ============================================================
# FONCTIONS API TWELVE DATA
# ============================================================

def quote_one(sym: str, region: str = "US") -> Tuple[float, float, str]:
    """
    Récupère le dernier close propre + variation jour.
    Privilégie previous_close si le marché est ouvert.
    
    Returns:
        (last_close, day_percent_change, source)
        source = 'close' ou 'previous_close'
    """
    TD = get_td_client()
    if not TD:
        raise ValueError("Client Twelve Data non initialisé (API_KEY manquante?)")
    
    try:
        timezone = TZ_BY_REGION.get(region, "UTC")
        q_json = TD.quote(symbol=sym, timezone=timezone).as_json()
        
        if isinstance(q_json, tuple):
            q_json = q_json[0]
        
        # Extraire close et previous_close
        close = None
        pc = None
        
        if q_json.get("close") not in (None, "None", ""):
            try:
                close = float(q_json.get("close"))
            except (ValueError, TypeError):
                pass
                
        if q_json.get("previous_close") not in (None, "None", ""):
            try:
                pc = float(q_json.get("previous_close"))
            except (ValueError, TypeError):
                pass
        
        # Déterminer si le marché est ouvert
        is_open_raw = q_json.get("is_market_open", False)
        is_open = is_open_raw == "true" if isinstance(is_open_raw, str) else bool(is_open_raw)
        
        # Si marché ouvert et previous_close existe -> on prend previous_close
        last_close = pc if (is_open and pc is not None) else close
        
        if last_close is None:
            raise ValueError(f"Quote sans close valide pour {sym}: {q_json}")
        
        day_pct = float(q_json.get("percent_change", 0))
        source = "previous_close" if (is_open and pc is not None) else "close"
        
        logger.debug(f"Quote {sym}: {last_close} ({day_pct:+.2f}%), source: {source}")
        
        return last_close, day_pct, source
        
    except Exception as e:
        logger.error(f"Erreur quote pour {sym}: {e}")
        raise


def baseline_ytd(sym: str, region: str = "US") -> Tuple[float, str]:
    """
    Calcule la baseline YTD = dernier jour ouvré de l'année N-1.
    Fallback: 1er jour ouvré de N si pas de données N-1.
    
    Returns:
        (baseline_close, baseline_date_iso)
    """
    TD = get_td_client()
    if not TD:
        raise ValueError("Client Twelve Data non initialisé")
    
    year = dt.date.today().year
    tz = TZ_BY_REGION.get(region, "UTC")
    
    try:
        ts_json = TD.time_series(
            symbol=sym,
            interval="1day",
            start_date=f"{year-1}-12-01",
            end_date=f"{year}-01-15",
            order="ASC",
            timezone=tz,
            outputsize=250
        ).as_json()

        if isinstance(ts_json, tuple):
            ts_json = ts_json[0]
            
        # Parser les valeurs
        vals = []
        if isinstance(ts_json, dict) and ts_json.get("values"):
            vals = ts_json["values"]
        elif isinstance(ts_json, list):
            vals = ts_json
        elif isinstance(ts_json, dict) and {"datetime", "close"} <= set(ts_json):
            vals = [ts_json]

        if not vals:
            raise ValueError(f"Aucune donnée historique pour {sym}")

        rows = []
        for r in vals:
            date_str = str(r.get("datetime", ""))[:10]
            close_val = r.get("close")
            
            if not date_str or close_val in (None, "None", ""):
                continue
                
            try:
                date_obj = dt.date.fromisoformat(date_str)
                rows.append((date_obj, float(close_val)))
            except Exception:
                continue
        
        if not rows:
            raise ValueError(f"Aucune donnée valide pour {sym}")
        
        # 1) Chercher dernier jour ouvré de N-1
        prev_year_rows = [(d, c) for (d, c) in rows if d.year == year-1]
        
        if prev_year_rows:
            base_date, base_close = max(prev_year_rows, key=lambda x: x[0])
            logger.debug(f"✅ {sym}: Baseline YTD au {base_date} (close: {base_close})")
            return base_close, base_date.isoformat()
        
        # 2) Fallback: premier jour ouvré de N
        current_year_rows = [(d, c) for (d, c) in rows if d.year == year]
        
        if current_year_rows:
            first_date, first_close = min(current_year_rows, key=lambda x: x[0])
            logger.warning(f"⚠️ {sym}: Pas de clôture {year-1}, baseline = 1er jour {year}: {first_date}")
            return first_close, first_date.isoformat()
        
        # 3) Dernier recours
        last_date, last_close = max(rows, key=lambda x: x[0])
        logger.warning(f"⚠️ {sym}: Fallback ultime = {last_date}")
        return last_close, last_date.isoformat()

    except Exception as e:
        logger.error(f"Erreur baseline YTD pour {sym}: {e}")
        raise


# ============================================================
# FONCTIONS DE FORMATAGE
# ============================================================

def format_value(value: float, currency: str) -> str:
    """Formate une valeur selon la devise"""
    if currency in ["EUR", "USD", "GBP", "GBp", "CHF", "CAD", "AUD", "HKD", "SGD", "ILA", "MXN"]:
        return f"{value:,.2f}"
    elif currency in ["JPY", "KRW", "TWD", "INR", "TRY"]:
        return f"{value:,.0f}"
    else:
        return f"{value:,.2f}"


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
