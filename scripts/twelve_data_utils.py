#!/usr/bin/env python3
"""
Module partagé pour les scripts Twelve Data API
Factorise: rate limiting, timezone, calcul YTD, formatage

v17 - AJOUT: baseline_period() générique + baseline_3m() / baseline_6m()
     - Fonction générique pour calculer des baselines sur n jours
     - Wrappers 3M (91j), 6M (182j), 52W (365j)
     - Logging de la date réellement utilisée (audit)

v16 - AJOUT: baseline_52w() pour calcul 52 semaines glissant
     - Méthode calendaire (365 jours)
     - Retourne None si historique insuffisant
"""

import os
import time
import datetime as dt
import logging
import requests
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
# CONSTANTES POUR LES PÉRIODES (jours calendaires)
# ============================================================
PERIOD_3M_DAYS = 91      # ~3 mois calendaires (~63 jours de bourse)
PERIOD_6M_DAYS = 182     # ~6 mois calendaires (~126 jours de bourse)
PERIOD_52W_DAYS = 365    # ~52 semaines (~252 jours de bourse)

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
# APPEL HTTP DIRECT (bypass du wrapper bugué)
# ============================================================

def _time_series_http(symbol: str, **params) -> dict:
    """
    Appel HTTP direct à l'API Twelve Data.
    
    Le wrapper Python twelvedata a un bug qui tronque les résultats
    (retourne 1 point au lieu de 100). On bypass le wrapper.
    """
    if not API_KEY:
        raise ValueError("API_KEY Twelve Data manquante")

    url = "https://api.twelvedata.com/time_series"
    q = {
        "apikey": API_KEY,
        "symbol": symbol,
        "interval": "1day",
        "format": "JSON",
        "timezone": "Exchange",
        "dp": 5,
        "prepost": "false",
        **params,
    }
    
    # Log URL sans API key
    safe_params = {k: v for k, v in q.items() if k != "apikey"}
    logger.info(f"  🔗 HTTP: {url}?{safe_params}")
    
    r = requests.get(url, params=q, timeout=30)
    r.raise_for_status()
    js = r.json()

    if isinstance(js, dict) and js.get("status") == "error":
        raise ValueError(f"TwelveData error: {js.get('message', 'unknown')}")
    
    return js


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
    
    v15 - FIX CRITIQUE:
    - Bypass du wrapper twelvedata bugué → appel HTTP direct avec requests
    - Le wrapper retourne 1 point, l'HTTP direct retourne 100 points
    - Fenêtre de filtrage: 01 déc → 31 jan
    """
    sym, exchange, mic_code = _apply_vse_fallback(sym, exchange, mic_code)
    
    year = dt.date.today().year
    prev = year - 1
    
    # Fenêtre large pour couvrir déc-jan
    end = f"{year}-01-31"
    outputsize = 100  # ~2 mois de bourse
    
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
            
            # ✅ FIX: Appel HTTP direct au lieu du wrapper bugué
            js = _time_series_http(
                sym,
                end_date=end,
                outputsize=outputsize,
                order="ASC",
                **kwargs,
            )
            
            # === NORMALISER ET TRIER ===
            rows = _normalize_and_sort(js)
            
            if not rows:
                last_diag = f"{label}: aucune donnée"
                logger.warning(f"  ⚠️ {last_diag}")
                continue
            
            # Log de la couverture
            logger.info(f"  📅 {len(rows)} points, min={rows[0][0]}, max={rows[-1][0]}")
            
            # Fenêtre de filtrage LARGE (01 déc → 31 jan)
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
# BASELINE GÉNÉRIQUE POUR PÉRIODES (3M, 6M, 52W)
# ============================================================

def baseline_period(
    sym: str,
    lookback_days: int,
    region: str = "US",
    exchange: str = None,
    mic_code: str = None,
    outputsize: int = None,
    max_gap_days: int = 10,
    period_label: str = None,
) -> Tuple[Optional[float], Optional[str]]:
    """
    Baseline générique = close le plus proche de (today - lookback_days).
    
    v17 - Fonction générique pour 3M, 6M, 52W, ou toute autre période.
    
    - Méthode calendaire (jours calendaires), pas "trading days".
    - Retourne (None, None) si historique insuffisant (ETF trop récent).
    - Loggue la date réellement utilisée pour audit.

    Args:
        sym: Symbole de l'ETF/action
        lookback_days: Nombre de jours calendaires à remonter
        region: Région pour le timezone (US, Europe, Asia, Other)
        exchange: Exchange optionnel
        mic_code: MIC code optionnel
        outputsize: Nombre de points à charger (auto-calculé si None)
        max_gap_days: Tolérance en jours entre date cible et date trouvée
        period_label: Label pour les logs (ex: "3M", "6M", "52W")

    Returns:
        (close_value, date_str) ou (None, None) si historique insuffisant
    """
    sym, exchange, mic_code = _apply_vse_fallback(sym, exchange, mic_code)

    # Auto-calculer outputsize si non fourni (~1.2x jours de bourse)
    if outputsize is None:
        # Approximation: 252 jours de bourse / 365 jours calendaires ≈ 0.69
        outputsize = int(lookback_days * 0.8) + 50  # Marge de sécurité

    # Label pour les logs
    label_str = period_label or f"{lookback_days}d"

    today = dt.date.today()
    target = today - dt.timedelta(days=lookback_days)

    # Tentatives: mic_code -> exchange -> symbol seul
    attempts = []
    if mic_code:
        attempts.append(("mic_code", {"mic_code": mic_code}))
        attempts.append(("mic_as_exchange", {"exchange": mic_code}))
    if exchange:
        attempts.append(("exchange", {"exchange": exchange}))
    attempts.append(("symbol_only", {}))

    last_diag = None

    for attempt_label, kwargs in attempts:
        logger.info(f"📡 baseline_{label_str}({sym}) tentative: {attempt_label}")
        try:
            rate_limit_pause()

            js = _time_series_http(
                sym,
                end_date=today.isoformat(),
                outputsize=outputsize,
                order="ASC",
                **kwargs,
            )

            rows = _normalize_and_sort(js)
            if not rows:
                last_diag = f"{attempt_label}: aucune donnée"
                logger.warning(f"  ⚠️ {last_diag}")
                continue

            first_date = dt.date.fromisoformat(rows[0][0])
            last_date = dt.date.fromisoformat(rows[-1][0])
            logger.info(f"  📅 {len(rows)} points, min={rows[0][0]}, max={rows[-1][0]}")

            # Historique insuffisant : la date cible est avant le 1er point
            if target < first_date:
                logger.info(f"  ℹ️ Historique insuffisant pour {label_str}: target={target} < first={first_date}")
                return None, None

            # Trouver la date la plus proche de target
            best_d, best_c = None, None
            best_diff = None

            for d_str, close in rows:
                d = dt.date.fromisoformat(d_str)
                diff = abs((d - target).days)
                if best_diff is None or diff < best_diff:
                    best_diff = diff
                    best_d, best_c = d_str, close

            if best_d is None or best_c is None:
                last_diag = f"{attempt_label}: impossible de sélectionner un point"
                logger.warning(f"  ⚠️ {last_diag}")
                continue

            # Garde-fou: si la meilleure date est trop loin, renvoyer None (plus safe)
            if best_diff is not None and best_diff > max_gap_days:
                logger.warning(f"  ⚠️ {label_str} baseline trop éloignée: diff={best_diff}j (> {max_gap_days}j)")
                return None, None

            logger.info(f"  ✅ Baseline {label_str} = {best_d} (close: {best_c:.2f}) diff={best_diff}j")
            return float(best_c), best_d

        except Exception as e:
            last_diag = f"{attempt_label}: exception {type(e).__name__}: {e}"
            logger.warning(f"  ⚠️ {last_diag}")
            continue

    # Si toutes les tentatives échouent, retourner None (pas d'exception)
    logger.warning(f"⚠️ Aucune baseline {label_str} exploitable pour {sym}. Last={last_diag}")
    return None, None


# ============================================================
# WRAPPERS SPÉCIFIQUES (3M, 6M, 52W)
# ============================================================

def baseline_3m(
    sym: str,
    region: str = "US",
    exchange: str = None,
    mic_code: str = None,
    max_gap_days: int = 7,
) -> Tuple[Optional[float], Optional[str]]:
    """
    Baseline 3M = close le plus proche de (today - 91 jours).
    
    v17 - Wrapper pour baseline_period() avec lookback=91 jours.
    
    - ~3 mois calendaires (~63 jours de bourse)
    - Utile pour détecter les retournements récents (cooling)
    - Retourne (None, None) si historique < 3 mois

    Args:
        sym: Symbole de l'ETF/action
        region: Région pour le timezone
        exchange: Exchange optionnel
        mic_code: MIC code optionnel
        max_gap_days: Tolérance (défaut: 7 jours, plus strict que 52W)

    Returns:
        (close_value, date_str) ou (None, None) si historique insuffisant
    """
    return baseline_period(
        sym=sym,
        lookback_days=PERIOD_3M_DAYS,
        region=region,
        exchange=exchange,
        mic_code=mic_code,
        outputsize=120,  # ~4 mois de données
        max_gap_days=max_gap_days,
        period_label="3M",
    )


def baseline_6m(
    sym: str,
    region: str = "US",
    exchange: str = None,
    mic_code: str = None,
    max_gap_days: int = 10,
) -> Tuple[Optional[float], Optional[str]]:
    """
    Baseline 6M = close le plus proche de (today - 182 jours).
    
    v17 - Wrapper pour baseline_period() avec lookback=182 jours.
    
    - ~6 mois calendaires (~126 jours de bourse)
    - Utile pour confirmer les trends moyen-terme
    - Retourne (None, None) si historique < 6 mois

    Args:
        sym: Symbole de l'ETF/action
        region: Région pour le timezone
        exchange: Exchange optionnel
        mic_code: MIC code optionnel
        max_gap_days: Tolérance (défaut: 10 jours)

    Returns:
        (close_value, date_str) ou (None, None) si historique insuffisant
    """
    return baseline_period(
        sym=sym,
        lookback_days=PERIOD_6M_DAYS,
        region=region,
        exchange=exchange,
        mic_code=mic_code,
        outputsize=200,  # ~7 mois de données
        max_gap_days=max_gap_days,
        period_label="6M",
    )


def baseline_52w(
    sym: str,
    region: str = "US",
    exchange: str = None,
    mic_code: str = None,
    lookback_days: int = 365,
    outputsize: int = 420,
    max_gap_days: int = 10,
) -> Tuple[Optional[float], Optional[str]]:
    """
    Baseline 52W = close le plus proche de (today - 365 jours).
    
    v17 - Refactorisé comme wrapper de baseline_period().
    
    - ~52 semaines calendaires (~252 jours de bourse)
    - Retourne (None, None) si historique < 1 an

    Args:
        sym: Symbole de l'ETF/action
        region: Région pour le timezone
        exchange: Exchange optionnel
        mic_code: MIC code optionnel
        lookback_days: Nombre de jours (défaut: 365)
        outputsize: Nombre de points à charger (défaut: 420)
        max_gap_days: Tolérance (défaut: 10 jours)

    Returns:
        (close_value, date_str) ou (None, None) si historique insuffisant
    """
    return baseline_period(
        sym=sym,
        lookback_days=lookback_days,
        region=region,
        exchange=exchange,
        mic_code=mic_code,
        outputsize=outputsize,
        max_gap_days=max_gap_days,
        period_label="52W",
    )


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
    """Formate un pourcentage. Retourne None si value est None."""
    if value is None:
        return None
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
