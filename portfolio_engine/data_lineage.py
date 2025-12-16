# portfolio_engine/data_lineage.py
"""
Source unique de vérité pour la méthodologie et les sources de données.

Ce module définit METHODOLOGY qui DOIT être importé partout où une
référence aux sources de données est nécessaire (optimizer, backtest, frontend).

ChatGPT v2.0 Audit - Q5: "As-tu un contrôle data_source unique importé partout?"
Réponse: OUI, ce fichier.

v1.1.0 (2025-12-16):
- FIX: TwelveData prices are split-adjusted only, NOT dividend-adjusted
- Reference: https://support.twelvedata.com/en/articles/5179064-are-the-prices-adjusted
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime
import hashlib
import json

__version__ = "1.1.0"


# =============================================================================
# METHODOLOGY - SOURCE UNIQUE DE VÉRITÉ
# =============================================================================

METHODOLOGY = {
    "version": "1.1.0",
    "last_updated": "2025-12-16",
    
    # Sources de prix
    # FIX v1.1.0: TwelveData n'inclut PAS les dividendes dans les prix
    # Ref: https://support.twelvedata.com/en/articles/5179064-are-the-prices-adjusted
    "prices": {
        "source": "Twelve Data API",
        "source_url": "https://twelvedata.com",
        "type": "split_adjusted_close",  # FIX: était "adjusted_close" (trop fort)
        "adjustments": ["splits"],  # FIX: était ["splits", "dividends"] (FAUX)
        "dividends_included": False,  # EXPLICITE: dividendes NON inclus
        "currency": "USD",
        "frequency": "daily",
        "timezone": "America/New_York",
        "lag_days": 0,  # T+0 (fin de journée)
        "note": "TwelveData daily prices are split-adjusted only. Dividends are NOT included. Use /dividends endpoint for dividend data.",
    },
    
    # Sources de fondamentaux
    "fundamentals": {
        "source": "Financial Modeling Prep (FMP)",
        "source_url": "https://financialmodelingprep.com",
        "type": "quarterly_reports",
        "lag_days": 1,  # T+1 (publication décalée)
        "point_in_time": False,  # LIMITATION: pas de données PIT
    },
    
    # Calcul de volatilité
    "volatility": {
        "window_days": 252,
        "method": "std_annualized",
        "formula": "std(returns) * sqrt(252) * 100",
        "min_history_days": 60,
    },
    
    # Covariance
    "covariance": {
        "method": "hybrid",
        "empirical_weight": 0.60,
        "structured_weight": 0.40,
        "window_days": 252,
        "psd_correction": "eigenvalue_clipping",
        "min_eigenvalue": 1e-6,
    },
    
    # Backtest
    "backtest": {
        "default_period_days": 90,
        "research_period_days": 1825,  # 5 ans
        "rebalancing": "none",  # buy-and-hold
        "transaction_cost_bp": 10,
        "slippage_model": "none",
        "tax_model": "none",
        "costs_included": True,
    },
    
    # Risk metrics
    "risk_metrics": {
        "risk_free_rate_source": "US Fed Funds Rate",
        "risk_free_rate_value": 0.045,  # 4.5% (Dec 2024)
        "base_currency": "USD",
        "sharpe_annualized": True,
        "sharpe_min_days": 252,
    },
    
    # Benchmarks par profil
    "benchmarks": {
        "Agressif": {"symbol": "QQQ", "name": "Nasdaq-100 ETF"},
        "Modéré": {"symbol": "URTH", "name": "MSCI World ETF"},
        "Stable": {"symbol": "AGG", "name": "US Aggregate Bond ETF"},
    },
    
    # Calendrier
    "calendar": {
        "equity_calendar": "NYSE",
        "crypto_calendar": "24/7",
        "alignment_strategy": "intersection",  # Seulement jours NYSE
        "ffill_allowed": False,  # INTERDIT
    },
}


# =============================================================================
# LIMITATIONS - Exposées explicitement (ChatGPT Q6, Q11)
# =============================================================================

LIMITATIONS = {
    "survivorship_bias": {
        "present": True,
        "description": "L'univers ne contient que les actifs actuellement listés. Les actifs délistés ne sont pas inclus.",
        "impact": "Biais positif potentiel sur les performances historiques.",
        "mitigation": "Utiliser avec prudence pour analyse historique > 1 an.",
    },
    "point_in_time": {
        "compliant": False,
        "description": "Les fondamentaux ne sont pas point-in-time. Look-ahead bias possible.",
        "impact": "Le scoring peut utiliser des informations non disponibles à la date de calcul.",
        "mitigation": "Fondamentaux utilisés avec lag de 1 jour minimum.",
    },
    "backfill_bias": {
        "present": True,
        "description": "Les données historiques peuvent inclure des corrections ex-post.",
        "impact": "Performance historique peut différer de ce qui était observable en temps réel.",
    },
    "fx_handling": {
        "method": "USD_only",
        "description": "Tous les actifs sont convertis en USD. Pas de hedging FX.",
        "impact": "Exposition implicite au risque de change.",
    },
    "costs": {
        "included": ["transaction_cost_10bp"],
        "excluded": ["slippage", "market_impact", "custody_fees", "taxes"],
        "description": "Seuls les coûts de transaction sont modélisés (10 bp).",
    },
    # FIX v1.1.0: Nouvelle limitation explicite
    "dividends_not_adjusted": {
        "present": True,
        "description": "Les prix TwelveData sont ajustés pour les splits UNIQUEMENT. Les dividendes ne sont PAS réinvestis dans les séries de prix.",
        "impact": "Le rendement total (total return) est sous-estimé pour les actifs à dividendes élevés.",
        "mitigation": "Pour une analyse total return, récupérer les dividendes via /dividends endpoint et les réinvestir manuellement.",
        "reference": "https://support.twelvedata.com/en/articles/5179064-are-the-prices-adjusted",
    },
}


# =============================================================================
# SCHEMA VERSIONING (ChatGPT Q2, Q8)
# =============================================================================

SCHEMA = {
    "version": "2.0.0",
    "min_compatible_version": "1.5.0",
    "breaking_changes": [
        {"version": "2.0.0", "change": "Added _optimization block", "date": "2025-12-15"},
        {"version": "1.5.0", "change": "Added _compliance_audit", "date": "2025-12-10"},
    ],
    "required_fields": [
        "_meta",
        "_schema",
        "Agressif",
        "Modéré", 
        "Stable",
    ],
    "optional_fields": [
        "_manifest",
        "_limitations",
    ],
}


def get_methodology() -> Dict[str, Any]:
    """Retourne la méthodologie complète (pour export JSON)."""
    return {
        "methodology": METHODOLOGY,
        "limitations": LIMITATIONS,
        "schema": SCHEMA,
    }


def get_data_source_string() -> str:
    """
    Retourne la chaîne standardisée pour data_source.
    
    À UTILISER PARTOUT où une référence à la source est nécessaire.
    Plus de "Yahoo Finance" ou autres strings hardcodés.
    """
    return f"{METHODOLOGY['prices']['source']} ({METHODOLOGY['prices']['type']})"


def get_limitations_for_output() -> Dict[str, Any]:
    """Retourne les limitations formatées pour l'output JSON."""
    return {
        "survivorship_free": not LIMITATIONS["survivorship_bias"]["present"],
        "pit_fundamentals": LIMITATIONS["point_in_time"]["compliant"],
        "split_adjusted_prices": True,  # Splits: OUI
        "dividend_adjusted_prices": False,  # FIX v1.1.0: Dividendes: NON
        "total_return": False,  # FIX v1.1.0: Ce n'est PAS du total return
        "costs_included": METHODOLOGY["backtest"]["costs_included"],
        "base_currency": METHODOLOGY["risk_metrics"]["base_currency"],
        "risk_free_rate_source": METHODOLOGY["risk_metrics"]["risk_free_rate_source"],
        "risk_free_rate_pct": METHODOLOGY["risk_metrics"]["risk_free_rate_value"] * 100,
    }


def validate_price_source_claim() -> bool:
    """
    Garde-fou: vérifie la cohérence entre les claims et la réalité.
    
    Lève un warning si on prétend avoir des dividendes alors qu'on ne les a pas.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    prices_config = METHODOLOGY.get("prices", {})
    adjustments = prices_config.get("adjustments", [])
    dividends_included = prices_config.get("dividends_included", False)
    
    # Guard: si on prétend avoir des dividendes mais dividends_included=False
    if "dividends" in adjustments and not dividends_included:
        logger.error(
            "INCONSISTENCY: 'dividends' in adjustments but dividends_included=False. "
            "Fix METHODOLOGY to be consistent."
        )
        return False
    
    # Guard: si dividends_included=True mais pas de traitement explicite
    if dividends_included and "dividends" not in adjustments:
        logger.warning(
            "dividends_included=True but 'dividends' not in adjustments. "
            "Verify dividend reinvestment is actually implemented."
        )
    
    return True


# =============================================================================
# HASH HELPERS (pour manifest)
# =============================================================================

def compute_file_hash(filepath: str) -> str:
    """Calcule le hash SHA256 d'un fichier."""
    try:
        with open(filepath, 'rb') as f:
            return f"sha256:{hashlib.sha256(f.read()).hexdigest()[:16]}"
    except Exception:
        return "sha256:unavailable"


def compute_dict_hash(data: dict) -> str:
    """Calcule le hash d'un dictionnaire (pour reproductibilité)."""
    json_str = json.dumps(data, sort_keys=True, default=str)
    return f"sha256:{hashlib.sha256(json_str.encode()).hexdigest()[:16]}"
