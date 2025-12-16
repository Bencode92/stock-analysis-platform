#!/usr/bin/env python3
"""
Module partagé pour les scripts Twelve Data API
Factorise: rate limiting, timezone, calcul YTD, formatage

v4 - FIX: baseline_ytd fenêtre correcte + GBp handling
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
    
    IMPORTANT: Requête une fenêtre CIBLÉE autour du changement d'année
    (15 déc N-1 → 15 jan N) pour garantir la capture du dernier close N-1.
    
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
    tz = TZ_BY_REGION.get(region, "UTC")
    
    try:
        # ===== FIX v4: Fenêtre CIBLÉE autour du changement d'année =====
        # Avant: 1er nov N-1 → 31 jan N (trop large, outputsize insuffisant)
        # Après: 15 déc N-1 → 15 jan N (précis, ~20 jours de bourse)
        params = {
            "symbol": sym,
            "interval": "1day",
            "start_date": f"{baseline_year}-12-15",  # 15 décembre N-1
            "end_date": f"{year}-01-15",              # 15 janvier N
            "outputsize": 50,                          # Large marge (~20 jours réels)
        }
        
        # PRIORITÉ au mic_code/exchange du CSV
        if mic_code:
            params["mic_code"] = mic_code
        elif exchange:
            params["exchange"] = exchange
        
        logger.debug(f"📡 baseline_ytd({sym}) params: {params}")
        
        ts_json = TD.time_series(**params).as_json()

        if isinstance(ts_json, tuple):
            ts_json = ts_json[0]
            
        # Parser les valeurs
        vals = []
        if isinstance(ts_json, dict):
            if ts_json.get("values"):
                vals = ts_json["values"]
            elif ts_json.get("status") == "error":
                raise ValueError(f"Erreur API: {ts_json.get('message', 'Unknown')}")
            elif {"datetime", "close"} <= set(ts_json.keys()):
                vals = [ts_json]
        elif isinstance(ts_json, list):
            vals = ts_json

        if not vals:
            raise ValueError(f"Aucune donnée historique pour {sym}")

        # Convertir et TRIER par date (important!)
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
        
        # Trier par date croissante
        rows.sort(key=lambda x: x[0])
        
        logger.debug(f"{sym}: {len(rows)} jours de données récupérés")
        logger.debug(f"{sym}: Plage = {rows[0][0]} à {rows[-1][0]}")
        
        # 1) Chercher le DERNIER jour de bourse de N-1
        prev_year_rows = [(d, c) for (d, c) in rows if d.year == baseline_year]
        
        if prev_year_rows:
            # Dernier élément = dernier jour coté de N-1 (ex: 30/12/2024)
            base_date, base_close = prev_year_rows[-1]
            
            # Vérification de cohérence
            if base_date.month == 12 and base_date.day >= 27:
                logger.info(f"✅ {sym}: Baseline YTD = {base_date} (close: {base_close:.2f})")
            else:
                logger.warning(f"⚠️ {sym}: Baseline YTD = {base_date} (attendu: ~30 déc {baseline_year})")
            
            return base_close, base_date.isoformat()
        
        # 2) Fallback: premier jour de bourse de N
        current_year_rows = [(d, c) for (d, c) in rows if d.year == year]
        
        if current_year_rows:
            # Premier élément = premier jour coté de N (ex: 02/01/2025)
            first_date, first_close = current_year_rows[0]
            logger.warning(f"⚠️ {sym}: Pas de clôture {baseline_year}, fallback = 1er jour {year}: {first_date}")
            return first_close, first_date.isoformat()
        
        # 3) Dernier recours
        oldest_date, oldest_close = rows[0]
        logger.warning(f"⚠️ {sym}: Fallback ultime = {oldest_date}")
        return oldest_close, oldest_date.isoformat()

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
