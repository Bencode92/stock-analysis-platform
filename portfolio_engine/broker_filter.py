"""Pré-filtrage broker — applique config/broker_access.json à l'univers.

Doctrine (phase 2.1, 2026-06-11) :
    Un ticker `access: false` ne peut jamais apparaître dans aucun pool de
    sélection d'aucun profil. Le filtrage se fait EN AMONT, avant tout
    scoring/sélection, pas via substitution post-hoc.

Remplace l'ancien chemin `apply_broker_access_substitution()` (substitution
aveugle alt[0] sans re-validation T1-T3) qui avait introduit le bug DECK
Modéré (vol 45.74 > band max 45.0).

Usage :
    from portfolio_engine.broker_filter import filter_broker_accessible
    stocks_clean = filter_broker_accessible(stocks_raw)
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Set

logger = logging.getLogger(__name__)

_CACHE: Dict[str, Set[str]] = {}


def load_blocked_tickers(config_path: Optional[Path] = None) -> Set[str]:
    """Lit config/broker_access.json et retourne les tickers `access: false`.

    Cache (par path) pour éviter les relectures dans un même run du pipeline.
    """
    if config_path is None:
        config_path = Path(__file__).parent.parent / "config" / "broker_access.json"
    key = str(config_path)
    if key in _CACHE:
        return _CACHE[key]
    if not Path(config_path).exists():
        _CACHE[key] = set()
        return set()
    try:
        cfg = json.loads(Path(config_path).read_text(encoding="utf-8"))
        access = cfg.get("access", {})
        blocked = {tk for tk, ok in access.items() if ok is False}
    except (OSError, ValueError) as exc:
        logger.warning(f"broker_filter: échec lecture {config_path}: {exc}")
        blocked = set()
    _CACHE[key] = blocked
    return blocked


def filter_broker_accessible(
    stocks: List[Dict],
    ticker_field: str = "ticker",
    log_label: str = "",
) -> List[Dict]:
    """Retire les stocks dont le ticker est marqué `access: false`.

    Préserve l'ordre. Si broker_access.json absent → no-op (retourne tel quel).
    """
    blocked = load_blocked_tickers()
    if not blocked or not stocks:
        return stocks
    before = len(stocks)
    out = [s for s in stocks if s.get(ticker_field) not in blocked]
    removed = before - len(out)
    if removed > 0 and log_label:
        logger.info(
            f"   [{log_label}] broker_filter : {removed} ticker(s) bloqué(s) "
            f"retiré(s) ({before} → {len(out)})"
        )
    return out


def _reset_cache_for_tests() -> None:
    """Utilitaire pour les tests : vider le cache."""
    _CACHE.clear()
