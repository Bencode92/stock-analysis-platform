"""Score Archiver — snapshots datés des fondamentaux pour walk-forward futur.

v6.15 (2026-06-04) — Priorité #1 selon Claude externe :
  "Ton scoring Buffett/qualité repose sur des fondamentaux ACTUELS. Tu n'as
   pas d'historique daté de ces fondamentaux. Donc tu ne peux pas walk-forwarder
   ton score qualité — tu ne sais pas s'il prédisait bien AVANT, tu sais juste
   qu'il décrit bien MAINTENANT."

Solution : archiver à CHAQUE run un snapshot compact des scores critiques pour
chaque action de l'univers. Dans 2-3 ans, on aura les données point-in-time
nécessaires pour tester l'edge prédictif réel du score qualité.

Format compact (1 fichier par jour, écrasé si même jour) :
  data/score_history/scores_YYYY-MM-DD.json

Contenu par stock (champs minimaux mais essentiels) :
  {ticker, country, industry, buffett_score, quality_score, roe,
   volatility_3y, perf_1y, perf_3y, dividend_yield,
   _fit_stable, _fit_modere, _fit_agressif, _profile_native, price}

Pas de prix de marché en temps réel (juste last_close si dispo). C'est de la
photo des SCORES, pas du marché.
"""
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

ROOT = Path(__file__).parent.parent
ARCHIVE_DIR = ROOT / "data" / "score_history"


def _compact_stock_snapshot(s: Dict) -> Dict:
    """Extrait les champs essentiels pour archivage compact."""
    def gf(k, default=None):
        v = s.get(k)
        if v is None:
            return default
        try:
            return float(v) if isinstance(v, (int, float, str)) else default
        except (ValueError, TypeError):
            return default

    return {
        "ticker": s.get("ticker") or s.get("symbol") or "",
        "name": (s.get("name") or "")[:50],
        "country": s.get("country", ""),
        "industry": s.get("industry", ""),
        "sector": s.get("sector", ""),
        # Scores fondamentaux
        "buffett_score": gf("buffett_score"),
        "quality_score": gf("quality_score"),
        "quality_grade": s.get("quality_grade"),
        "roe": gf("roe"),
        "roic": gf("roic"),
        "fcf_yield": gf("fcf_yield"),
        "de_ratio": gf("de_ratio"),
        # Risque
        "volatility_3y": gf("volatility_3y"),
        "max_drawdown_3y": gf("max_drawdown_3y"),
        "beta": gf("beta"),
        # Performance (utile pour tester si haut momentum à T était signal négatif à T+1y)
        "perf_1y": gf("perf_1y"),
        "perf_3y": gf("perf_3y"),
        "perf_ytd": gf("perf_ytd"),
        # Income
        "dividend_yield": gf("dividend_yield"),
        "dividend_yield_ttm": gf("dividend_yield_ttm"),  # v6.30: pour total return
        # Forward
        "eps_growth_forecast_5y": gf("eps_growth_forecast_5y"),
        "eps_surprise_last": gf("eps_surprise_last"),
        # Fit scores (calculés par profile_assignment)
        "_fit_stable": gf("_fit_stable"),
        "_fit_modere": gf("_fit_modere"),
        "_fit_agressif": gf("_fit_agressif"),
        "_profile_native": s.get("_profile_native"),
        "_coherence": gf("_coherence"),
        # === v6.30: Données critiques pour backtest forward propre ===
        # Prix natif + devise native (pas de conversion à ce stade pour éviter
        # un FX rate qui change rétroactivement — la conversion EUR se fait au
        # moment du calcul forward avec un FX rate PIT séparément stocké)
        "last_close": gf("price") or gf("last_close"),
        "currency_native": s.get("data_currency") or s.get("currency"),
        "exchange": s.get("data_exchange") or s.get("exchange"),
        "mic": s.get("data_mic"),
        # Identifiants pérennes pour gérer délisting (si ticker change, isin
        # reste — utile pour M&A renaming)
        "isin": s.get("isin"),
        "figi": s.get("figi") or s.get("composite_figi"),
        # Status pour détecter futurs délistings (à comparer entre snapshots)
        "is_delisted": s.get("is_delisted", False),
        "data_last_updated": s.get("last_updated"),
    }


def archive_scores(all_stocks: List[Dict], date_label: Optional[str] = None) -> str:
    """Archive un snapshot daté de tous les scores des stocks.

    Args:
        all_stocks: liste de dicts (univers complet US+EU+Asia annoté avec fit_scores)
        date_label: optionnel, défaut = aujourd'hui (YYYY-MM-DD)

    Returns:
        Chemin du fichier écrit.
    """
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    if date_label is None:
        date_label = datetime.now().strftime("%Y-%m-%d")
    output_path = ARCHIVE_DIR / f"scores_{date_label}.json"

    snapshots = [_compact_stock_snapshot(s) for s in all_stocks]
    # Garde seulement ceux qui ont au moins un fit_score (annotés)
    snapshots = [s for s in snapshots if s.get("_fit_modere") is not None]

    payload = {
        "version": "score_archive_v1",
        "date": date_label,
        "timestamp_iso": datetime.now().isoformat(),
        "n_stocks": len(snapshots),
        "stocks": snapshots,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)

    logger.info(f"[score_archiver] {len(snapshots)} stocks archivés → {output_path}")
    return str(output_path)


def archive_from_universe_files() -> str:
    """Charge stocks_*.json + annote avec fit_scores + archive.

    Utilisable en standalone pour rattraper un archivage manqué.
    """
    try:
        from portfolio_engine.profile_assignment import annotate_universe_with_fits
    except ImportError:
        from .profile_assignment import annotate_universe_with_fits

    all_stocks = []
    for fname in ("stocks_us.json", "stocks_europe.json", "stocks_asia.json"):
        path = ROOT / "data" / fname
        if not path.exists():
            continue
        try:
            data = json.load(open(path))
            stocks = data.get("stocks", []) if isinstance(data, dict) else data
            all_stocks.extend(stocks)
        except Exception as e:
            logger.warning(f"[score_archiver] Erreur chargement {fname}: {e}")

    if not all_stocks:
        logger.warning("[score_archiver] Aucun stock chargé")
        return ""

    annotate_universe_with_fits(all_stocks)
    return archive_scores(all_stocks)


__all__ = ["archive_scores", "archive_from_universe_files", "ARCHIVE_DIR"]


if __name__ == "__main__":
    # Standalone : archive manuel
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(name)s | %(message)s")
    archive_from_universe_files()
