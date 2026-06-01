"""
Etage 2 de la pipeline Smart Politician Portfolio (TradePulse).

Lit le cache `data/congress_trades.json` et produit un classement par politicien
fonde sur la REGULARITE, pas le rendement brut -> schema politician_leaderboard.

Principe (cf. plan): un +71% one-shot sur 2 titres = chance, pas skill.
On recompense: rendement median annuel, constance entre annees, diversite, echantillon.
Entree des trades = report_date (la surperf Quiver ExcessReturn est deja calee dessus).

Usage:
    python ml/politician_rank.py
    python ml/politician_rank.py --min-trades 30 --top 20

Dependances: pandas, numpy
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).resolve().parent / "data"
TRADES_PATH = DATA_DIR / "congress_trades.json"
OUT_PATH = DATA_DIR / "politician_leaderboard.json"

# ---- Parametres du score (traces dans le JSON pour reproductibilite) ----
DEFAULTS = {
    "min_trades": 20,           # echantillon minimum
    "min_distinct_tickers": 8,  # anti-concentration
    "min_active_years": 2,      # anti one-shot
    "weights": {
        "median_return": 0.45,  # le coeur: surperf mediane annuelle
        "consistency": 0.30,    # faible variance entre annees
        "diversity": 0.15,      # nb titres distincts
        "sample": 0.10,         # taille d'echantillon
    },
}


def _pid(row) -> str:
    """Cle d'identite par ligne : bioguide_id si present, sinon le nom.
    Evite de fusionner tous les bioguide_id nuls (ex. executif) sous un meme groupe."""
    b = row.get("bioguide_id")
    if isinstance(b, str) and b.strip():
        return b
    return str(row.get("representative") or "?")


def load_trades(paths: list[Path]) -> pd.DataFrame:
    """Charge et fusionne un ou plusieurs caches de trades (Congres + Executif)."""
    frames = []
    for path in paths:
        if not path.exists():
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        f = pd.DataFrame(payload["trades"])
        if not f.empty:
            frames.append(f)
    if not frames:
        return pd.DataFrame()
    df = pd.concat(frames, ignore_index=True)
    for col in ("bioguide_id", "house", "party", "excess_return"):
        if col not in df.columns:
            df[col] = None
    # On classe sur les ACHATS (le signal d'allocation). report_date = horodatage retenu.
    df = df[df["transaction"] == "buy"].copy()
    df["report_date"] = pd.to_datetime(df["report_date"], errors="coerce")
    df = df.dropna(subset=["report_date", "ticker"])
    df["year"] = df["report_date"].dt.year
    df["excess_return"] = pd.to_numeric(df["excess_return"], errors="coerce")
    df["branch"] = df["house"].apply(lambda h: "Executive" if h == "Executive" else "Congress")
    df["pid"] = df.apply(_pid, axis=1)
    return df


def per_year_table(g: pd.DataFrame) -> list[dict]:
    rows = []
    for year, yg in g.groupby("year"):
        rows.append({
            "year": int(year),
            "excess_return": _safe_float(yg["excess_return"].mean()),
            "n_trades": int(len(yg)),
            "n_distinct_tickers": int(yg["ticker"].nunique()),
        })
    return sorted(rows, key=lambda r: r["year"])


def _safe_float(v) -> float | None:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return float(v)


def _minmax(series: pd.Series) -> pd.Series:
    """Normalise [0..1]; constante -> 0.5 pour ne pas biaiser."""
    lo, hi = series.min(), series.max()
    if not np.isfinite(lo) or not np.isfinite(hi) or hi == lo:
        return pd.Series(0.5, index=series.index)
    return (series - lo) / (hi - lo)


def build_leaderboard(df: pd.DataFrame, params: dict) -> dict:
    universe = []

    for pid, g in df.groupby("pid"):
        by_year = per_year_table(g)
        annual = pd.Series([r["excess_return"] for r in by_year if r["excess_return"] is not None])
        n_trades = int(len(g))
        n_tickers = int(g["ticker"].nunique())
        n_years = int(g["year"].nunique())
        branch = "Executive" if (g["branch"] == "Executive").any() else "Congress"

        # L'executif (Trump) est montre "a part" : historique trop court / recent pour
        # un score de regularite valable -> on le garde dans le tableau mais hors classement.
        eligible = (
            branch != "Executive"
            and n_trades >= params["min_trades"]
            and n_tickers >= params["min_distinct_tickers"]
            and n_years >= params["min_active_years"]
        )
        universe.append({
            "representative": str(g["representative"].iloc[0]),
            "bioguide_id": (str(g["bioguide_id"].dropna().iloc[0]) if g["bioguide_id"].notna().any() else None),
            "pid": str(pid),
            "branch": branch,
            "party": (g["party"].dropna().iloc[0] if g["party"].notna().any() else None),
            "house": (g["house"].dropna().iloc[0] if g["house"].notna().any() else None),
            "eligible": bool(eligible),
            "median_annual_excess_return": _safe_float(annual.median()) if not annual.empty else None,
            "annual_return_std": _safe_float(annual.std(ddof=0)) if len(annual) > 1 else None,
            "n_trades": n_trades,
            "n_distinct_tickers": n_tickers,
            "n_active_years": n_years,
            "by_year": by_year,
        })

    frame = pd.DataFrame(universe)
    eligibles = frame[frame["eligible"]].copy()

    if not eligibles.empty:
        w = params["weights"]
        med = _minmax(eligibles["median_annual_excess_return"].fillna(eligibles["median_annual_excess_return"].min()))
        # consistance: variance faible = bon -> on inverse le min-max du std.
        cons = 1.0 - _minmax(eligibles["annual_return_std"].fillna(eligibles["annual_return_std"].max()))
        div = _minmax(eligibles["n_distinct_tickers"].astype(float))
        smp = _minmax(np.log1p(eligibles["n_trades"].astype(float)))
        score = 100.0 * (
            w["median_return"] * med
            + w["consistency"] * cons
            + w["diversity"] * div
            + w["sample"] * smp
        )
        eligibles["regularity_score"] = score.round(2)
    else:
        eligibles["regularity_score"] = []

    # Recolle scores; les non-eligibles (dont l'executif) gardent un score 0 (transparence).
    frame = frame.merge(eligibles[["pid", "regularity_score"]], on="pid", how="left")
    frame["regularity_score"] = frame["regularity_score"].fillna(0.0)
    frame = frame.sort_values(["eligible", "regularity_score"], ascending=[False, False]).reset_index(drop=True)
    frame["rank"] = frame.index + 1

    ranking = frame.to_dict(orient="records")
    return {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "universe_size": int(len(frame)),
            "eligible_count": int(frame["eligible"].sum()),
            "params": params,
        },
        "ranking": ranking,
    }


def main() -> None:
    p = argparse.ArgumentParser(description="Rank politicians by trading regularity.")
    p.add_argument("--trades", default=str(TRADES_PATH))
    p.add_argument("--executive", default=str(DATA_DIR / "executive_trades.json"),
                   help="Cache des trades executifs (Trump), montres a part.")
    p.add_argument("--out", default=str(OUT_PATH))
    p.add_argument("--min-trades", type=int, default=DEFAULTS["min_trades"])
    p.add_argument("--min-tickers", type=int, default=DEFAULTS["min_distinct_tickers"])
    p.add_argument("--min-years", type=int, default=DEFAULTS["min_active_years"])
    p.add_argument("--top", type=int, default=None, help="Affiche le Top N en console.")
    args = p.parse_args()

    params = {
        **DEFAULTS,
        "min_trades": args.min_trades,
        "min_distinct_tickers": args.min_tickers,
        "min_active_years": args.min_years,
    }

    df = load_trades([Path(args.trades), Path(args.executive)])
    if df.empty:
        raise SystemExit("Aucun trade 'buy' exploitable. Lance d'abord congress/congress_fetch.py.")

    board = build_leaderboard(df, params)
    Path(args.out).write_text(json.dumps(board, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {board['meta']['eligible_count']} eligibles / {board['meta']['universe_size']} -> {args.out}")

    if args.top:
        print(f"\nTop {args.top} (regularite):")
        for r in board["ranking"][:args.top]:
            if not r["eligible"]:
                break
            print(f"  {r['rank']:>2}. {r['representative']:<28} "
                  f"score={r['regularity_score']:>5}  "
                  f"med={r['median_annual_excess_return']}  "
                  f"trades={r['n_trades']}  tickers={r['n_distinct_tickers']}  yrs={r['n_active_years']}")


if __name__ == "__main__":
    main()
