#!/usr/bin/env python3
"""
Module partagé pour les scripts Twelve Data API
Factorise: rate limiting, timezone, calcul YTD, formatage

v5 - FIX: baseline_ytd debug logs + correct year boundary logic
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
# FONCTIONS API TWELVE DATA
# ============================================================

def quote_one(sym: str, region: str = "US", exchange: str = None, mic_code: str = None) -> Tuple[float, float, str]:
    """
    Récupère le dernier close propre + variation jour.
    Privilégie previous_close si le marché est ouvert.
    
    Args:
        sym: Symbole de l'instrument (ex: "EXV5", "AAPL")
        region: Région pour le timezone ("US", "Europe", "Asia", "Other")
        exchange: Code exchange (ex: "XETR", "NYSE") - REQUIS pour ETFs européens
        mic_code: MIC code ISO 10383 (ex: "XETR", "XWBO") - alternative à exchange
    
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
        
        # PRIORITÉ au mic_code/exchange du CSV (ne pas recalculer!)
        if mic_code:
            params["mic_code"] = mic_code
        elif exchange:
            params["exchange"] = exchange
        
        # Log de la requête pour debug
        logger.debug(f"📡 quote_one({sym}) params: {params}")
        
        q_json = TD.quote(**params).as_json()
        
        if isinstance(q_json, tuple):
            q_json = q_json[0]
        
        # Vérifier les erreurs API
        if isinstance(q_json, dict) and q_json.get("status") == "error":
            raise ValueError(f"API Error: {q_json.get('message', 'Unknown error')}")
        
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


def baseline_ytd(sym: str, region: str = "US", exchange: str = None, mic_code: str = None) -> Tuple[float, str]:
    """
    Calcule la baseline YTD = DERNIER jour de bourse de l'année N-1.
    Fallback: 1er jour de bourse de N si pas de données N-1.
    
    IMPORTANT: Le 31 décembre n'est PAS toujours un jour de bourse!
    On cherche le MAX des dates en année N-1 (souvent 30/12 en Europe).
    
    Args:
        sym: Symbole de l'instrument
        region: Région pour le timezone
        exchange: Code exchange (PRIORITÉ au CSV)
        mic_code: MIC code ISO 10383 (PRIORITÉ au CSV)
    
    Returns:
        (baseline_close, baseline_date_iso)
    """
    TD = get_td_client()
    if not TD:
        raise ValueError("Client Twelve Data non initialisé")
    
    # Appliquer le fallback VSE -> XETR
    sym, exchange, mic_code = _apply_vse_fallback(sym, exchange, mic_code)
    
    year = dt.date.today().year
    baseline_year = year - 1
    
    try:
        # ===== FIX v5: Fenêtre LARGE autour du changement d'année =====
        params = {
            "symbol": sym,
            "interval": "1day",
            "start_date": f"{baseline_year}-12-10",  # 10 décembre N-1
            "end_date": f"{year}-01-20",              # 20 janvier N
            "outputsize": 300,                         # Large marge
        }
        
        # PRIORITÉ au mic_code/exchange du CSV
        if mic_code:
            params["mic_code"] = mic_code
        elif exchange:
            params["exchange"] = exchange
        
        logger.info(f"📡 baseline_ytd({sym}) params: {params}")
        
        ts_json = TD.time_series(**params).as_json()

        if isinstance(ts_json, tuple):
            ts_json = ts_json[0]
            
        # Parser les valeurs - gérer les différents formats de réponse
        values = []
        if isinstance(ts_json, dict):
            if ts_json.get("values"):
                values = ts_json["values"]
            elif ts_json.get("status") == "error":
                raise ValueError(f"Erreur API: {ts_json.get('message', 'Unknown')}")
            elif {"datetime", "close"} <= set(ts_json.keys()):
                values = [ts_json]
        elif isinstance(ts_json, list):
            values = ts_json

        if not values:
            raise ValueError(f"Aucune donnée historique pour {sym} (params={params})")

        # ===== DEBUG: Afficher les dates reçues =====
        all_dates = [v.get("datetime", "")[:10] for v in values if v.get("datetime")]
        if all_dates:
            logger.info(f"  📅 {sym}: {len(values)} valeurs, min={min(all_dates)}, max={max(all_dates)}")
        
        # Trier par date (les valeurs arrivent souvent en ordre DESC)
        values_sorted = sorted(values, key=lambda v: v.get("datetime", ""))
        
        # Séparer année précédente vs année courante
        prev_year_values = [v for v in values_sorted if v.get("datetime", "").startswith(str(baseline_year))]
        curr_year_values = [v for v in values_sorted if v.get("datetime", "").startswith(str(year))]
        
        logger.info(f"  📊 {sym}: {len(prev_year_values)} jours en {baseline_year}, {len(curr_year_values)} jours en {year}")
        
        # 1) DERNIER jour de bourse de N-1 (max date)
        if prev_year_values:
            last_prev = prev_year_values[-1]  # Dernier après tri = plus récent
            base_date = last_prev.get("datetime", "")[:10]
            base_close = float(last_prev.get("close", 0))
            
            logger.info(f"  ✅ {sym}: Baseline = {base_date} (close: {base_close:.2f})")
            return base_close, base_date
        
        # 2) Fallback: PREMIER jour de bourse de N (min date)
        if curr_year_values:
            first_curr = curr_year_values[0]  # Premier après tri = plus ancien
            base_date = first_curr.get("datetime", "")[:10]
            base_close = float(first_curr.get("close", 0))
            
            logger.warning(f"  ⚠️ {sym}: Pas de {baseline_year}, fallback = {base_date} (close: {base_close:.2f})")
            return base_close, base_date
        
        # 3) Aucune donnée utilisable
        raise ValueError(f"Aucune donnée autour du changement d'année pour {sym}")

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
