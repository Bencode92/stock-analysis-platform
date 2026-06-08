#!/usr/bin/env python3
"""
Archive les rendements forward propres pour backtest futur.

Architecture (corrections post-feedback Claude externe v6.30) :

1. **Devise** : convertit tous les rendements en EUR au taux PIT du snapshot
   et du close. Évite le bruit FX qui dominerait le signal qualité sur
   univers multi-devises (US/UK/Asie).

2. **Total return** : inclut les dividendes versés sur la fenêtre. Sinon
   biais systématique contre les profils dividende.

3. **Délisting** : si un ticker disparaît à la date de close, enregistre
   un rendement de -100% (faillite par défaut). Ne PAS dropper silencieusement.

4. **Tagging fenêtres** : chaque obs forward est étiquetée avec
   (snapshot_date, horizon, close_date) pour dédupliquer les fenêtres
   chevauchantes au moment du test (Newey-West ou cross-sections non-overlap).

Output : data/forward_returns/returns_{horizon}.json (un fichier par
horizon, append-only pour traçabilité).
"""
from __future__ import annotations
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional
import logging

logger = logging.getLogger("forward_returns_archiver")
ROOT = Path(__file__).resolve().parent.parent
SCORE_HIST = ROOT / "data" / "score_history"
FWD_DIR = ROOT / "data" / "forward_returns"

HORIZONS = {"1m": 30, "3m": 91, "6m": 182, "12m": 365}

# FX rates approximatifs en EUR (à remplacer par fetch PIT propre quand dispo)
FX_TO_EUR_DEFAULT = {
    "EUR": 1.000, "USD": 0.920, "GBP": 1.175, "GBp": 0.01175, "CHF": 1.040,
    "JPY": 0.0062, "INR": 0.0108, "KRW": 0.00069, "TWD": 0.0285, "HKD": 0.118,
    "CNY": 0.128, "SEK": 0.087, "DKK": 0.134, "NOK": 0.088, "PLN": 0.232,
    "THB": 0.0259, "PHP": 0.0161, "CAD": 0.674, "AUD": 0.605,
}


def load_snapshot(date_str: str) -> Optional[Dict]:
    path = SCORE_HIST / f"scores_{date_str}.json"
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Échec lecture snapshot {date_str}: {e}")
        return None


def get_current_universe() -> Dict[str, Dict]:
    out = {}
    for f in ("stocks_us.json", "stocks_europe.json", "stocks_asia.json"):
        path = ROOT / "data" / f
        if not path.exists():
            continue
        try:
            with open(path) as fh:
                d = json.load(fh)
            for s in d.get("stocks", []):
                tk = s.get("ticker") or s.get("symbol")
                if tk:
                    out[tk] = s
        except Exception as e:
            logger.warning(f"Échec lecture {f}: {e}")
    return out


def convert_to_eur(amount: float, currency: str) -> Optional[float]:
    if amount is None:
        return None
    rate = FX_TO_EUR_DEFAULT.get(currency or "EUR")
    if rate is None:
        return amount  # fallback : assume EUR
    return amount * rate


def compute_forward_return(snap_entry: Dict, cur_entry: Optional[Dict],
                          horizon_days: int, div_yield_at_snap: float = 0.0) -> Optional[Dict]:
    p_snap = snap_entry.get("last_close")
    ccy_snap = snap_entry.get("currency_native") or "USD"

    if p_snap is None or p_snap <= 0:
        return {"status": "no_snapshot_price"}

    # Délisting détecté
    if cur_entry is None:
        return {
            "status": "delisted",
            "return_local": -1.0,
            "return_eur": -1.0,
            "snapshot_price_local": p_snap,
            "snapshot_currency": ccy_snap,
        }

    p_close = cur_entry.get("price") or cur_entry.get("last_close")
    ccy_close = cur_entry.get("data_currency") or cur_entry.get("currency") or ccy_snap

    if p_close is None or p_close <= 0:
        return {"status": "no_close"}

    # Total return local approximation : div_yield × horizon_years
    div_paid_local = (div_yield_at_snap / 100.0) * p_snap * (horizon_days / 365.0)
    return_local = (p_close + div_paid_local - p_snap) / p_snap

    # EUR
    p_snap_eur = convert_to_eur(p_snap, ccy_snap)
    p_close_eur = convert_to_eur(p_close, ccy_close)
    div_eur = convert_to_eur(div_paid_local, ccy_snap) or 0

    return_eur = None
    if p_snap_eur and p_snap_eur > 0 and p_close_eur is not None:
        return_eur = (p_close_eur + div_eur - p_snap_eur) / p_snap_eur

    return {
        "status": "normal",
        "return_local": round(return_local, 6),
        "return_eur": round(return_eur, 6) if return_eur is not None else None,
        "snapshot_price_local": p_snap,
        "snapshot_currency": ccy_snap,
        "close_price_local": p_close,
        "close_currency": ccy_close,
        "div_paid_local": round(div_paid_local, 6),
    }


def archive_forward_returns(today: Optional[str] = None) -> Dict[str, int]:
    FWD_DIR.mkdir(parents=True, exist_ok=True)
    today_dt = datetime.strptime(today, "%Y-%m-%d") if today else datetime.now()
    today_str = today_dt.strftime("%Y-%m-%d")

    snapshots = sorted([p.stem.replace("scores_", "") for p in SCORE_HIST.glob("scores_*.json")])
    if not snapshots:
        logger.info("Aucun snapshot — rien à archiver")
        return {}

    current_universe = get_current_universe()
    if not current_universe:
        logger.warning("Univers courant vide — abort")
        return {}

    n_added = {h: 0 for h in HORIZONS}

    for h_label, h_days in HORIZONS.items():
        candidates = []
        for snap_date in snapshots:
            snap_dt = datetime.strptime(snap_date, "%Y-%m-%d")
            close_dt = snap_dt + timedelta(days=h_days)
            if abs((today_dt - close_dt).days) <= 3:  # tolérance weekend
                candidates.append((snap_date, snap_dt, close_dt))

        if not candidates:
            continue

        out_path = FWD_DIR / f"returns_{h_label}.json"
        existing = []
        if out_path.exists():
            try:
                with open(out_path) as f:
                    existing = json.load(f).get("observations", [])
            except Exception:
                existing = []

        already_keys = {(o["snapshot_date"], o["ticker"], o["horizon"]) for o in existing}
        new_obs = []
        for snap_date, snap_dt, close_dt in candidates:
            snap_data = load_snapshot(snap_date)
            if not snap_data:
                continue
            for s in snap_data.get("stocks", []):
                tk = s.get("ticker")
                if not tk:
                    continue
                if (snap_date, tk, h_label) in already_keys:
                    continue
                cur = current_universe.get(tk)
                div_y = s.get("dividend_yield_ttm") or s.get("dividend_yield") or 0
                fwd = compute_forward_return(s, cur, h_days, div_y)
                if not fwd:
                    continue
                obs = {
                    "snapshot_date": snap_date,
                    "close_date": today_str,
                    "horizon": h_label,
                    "horizon_days": h_days,
                    "ticker": tk,
                    "buffett_score_at_snapshot": s.get("buffett_score"),
                    "quality_score_at_snapshot": s.get("quality_score"),
                    "perf_1y_at_snapshot": s.get("perf_1y"),
                    "sector": s.get("sector"),
                    "country": s.get("country"),
                    **fwd,
                }
                new_obs.append(obs)
                n_added[h_label] += 1

        if new_obs:
            all_obs = existing + new_obs
            payload = {
                "version": "fwd_returns_v1",
                "horizon": h_label,
                "horizon_days": h_days,
                "last_updated": today_str,
                "n_observations": len(all_obs),
                "observations": all_obs,
            }
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=1, ensure_ascii=False)
            logger.info(f"[fwd_returns] {h_label}: +{len(new_obs)} obs → total {len(all_obs)}")

    return n_added


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(name)s | %(message)s")
    result = archive_forward_returns()
    print(f"\nObservations ajoutées par horizon : {result}")
    print(f"Snapshots disponibles : {len(list(SCORE_HIST.glob('scores_*.json')))}")
    print(f"Snapshots requis pour test fiable : ≥ 12-18 mois cross-sections (loi √breadth)")
