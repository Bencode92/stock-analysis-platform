"""explore_pocket_track.py — tracker informatif de la poche explore.

Compare la perf des positions choisies VS le benchmark thématique acheté-tenu.
La vraie question : "ma sélection bat-elle l'ETF du thème ?" (edge de sélection)
PAS "le thème a-t-il monté ?" (bruit sur 1 an).

Règles :
  - INFORMATIF UNIQUEMENT. Pas d'action automatique.
  - Horizon de jugement : 3 ans (révision en 2029-06-04).
  - 1 an = bruit pur sur des semis qui font ±50%/an, ne JAMAIS trader sur ça.

Usage :
    python3 scripts/explore_pocket_track.py
"""
import json
import sys
from datetime import date, datetime
from pathlib import Path

try:
    import yfinance as yf
    import pandas as pd
    import numpy as np
except ImportError:
    print("pip install yfinance pandas numpy"); sys.exit(1)


ROOT = Path(__file__).parent.parent
POCKET_PATH = ROOT / "data" / "explore_pocket.json"


def _safe_yticker(tk: str) -> str:
    """Mapping minimal pour yfinance (les .KS / .TW / .L sont déjà OK)."""
    return tk


def _fetch_price_series(tickers, start_date):
    """Récupère les prix ajustés de l'entry_date à aujourd'hui."""
    yticks = [_safe_yticker(t) for t in tickers]
    raw = yf.download(yticks, start=start_date, auto_adjust=True, progress=False)
    if "Close" in raw.columns.get_level_values(0):
        px = raw["Close"]
    else:
        px = raw
    return px.dropna(axis=1, how="all")


def _perf_since(prices, start_date):
    """Perf cumul d'une série de prix depuis start_date."""
    if isinstance(prices, pd.Series):
        prices = prices.dropna()
        if prices.empty:
            return None
        return float(prices.iloc[-1] / prices.iloc[0] - 1) * 100
    return None


def main():
    if not POCKET_PATH.exists():
        print(f"❌ {POCKET_PATH} introuvable. Crée-le d'abord.")
        sys.exit(1)

    pocket = json.load(open(POCKET_PATH))
    print("=" * 78)
    print("  EXPLORE POCKET — Tracker informatif (3 ans)")
    print("=" * 78)
    print(f"  Capital alloué    : {pocket['capital_allocation_pct']}% du capital total")
    print(f"  Thèse             : {pocket['thesis']}")
    print(f"  Benchmark         : {pocket['benchmark']['ticker']} ({pocket['benchmark']['name']})")
    print(f"  Date de création  : {pocket['created']}")
    print(f"  Revue prévue      : {pocket['review_date']} (3 ans, INFORMATIF)")

    # Combien de temps depuis création / jusqu'à révision
    created = datetime.strptime(pocket['created'], "%Y-%m-%d").date()
    review = datetime.strptime(pocket['review_date'], "%Y-%m-%d").date()
    today = date.today()
    days_elapsed = (today - created).days
    days_remaining = (review - today).days
    pct_horizon = days_elapsed / (days_elapsed + days_remaining) * 100 if (days_elapsed + days_remaining) > 0 else 0
    print(f"  Avancement        : {days_elapsed}j écoulés / {days_remaining}j restants ({pct_horizon:.1f}% horizon)")
    if days_elapsed < 365:
        print(f"  ⚠️  < 1 an écoulé : trop tôt pour conclure quoi que ce soit. Les semis font ±50%/an.")

    positions = pocket["positions"]
    bench_tk = pocket["benchmark"]["ticker"]

    # Récupère prix
    all_tickers = list(positions.keys()) + [bench_tk]
    print(f"\n  📊 Téléchargement {len(all_tickers)} tickers depuis {pocket['created']}...")
    px = _fetch_price_series(all_tickers, pocket['created'])
    if px.empty:
        print("  ⚠️  Pas de données disponibles encore (poche très récente).")
        return

    # Perf par position
    print(f"\n  POSITIONS — perf depuis entry_date")
    print(f"  {'Ticker':12} {'Nom':28} {'Poids':>6} {'Perf':>8} {'Contrib':>9}")
    print("  " + "-" * 70)

    weighted_perf = 0.0
    total_w = 0.0
    for tk, info in positions.items():
        y_tk = _safe_yticker(tk)
        if y_tk not in px.columns:
            print(f"  {tk:12} {info.get('name','')[:28]:28} {info['weight_pct']:>5.1f}% {'n/a':>8} {'n/a':>9}")
            continue
        p = _perf_since(px[y_tk], info["entry_date"])
        w = info["weight_pct"] / 100
        contrib = p * w if p is not None else 0
        weighted_perf += contrib
        total_w += w
        name = (info.get("name", "") or "")[:28]
        print(f"  {tk:12} {name:28} {info['weight_pct']:>5.1f}% {p:>+7.1f}% {contrib:>+8.1f}%")

    print("  " + "-" * 70)
    print(f"  {'POCHE TOTAL':12} {'':28} {total_w*100:>5.1f}% {weighted_perf:>+7.1f}% {weighted_perf:>+8.1f}%")

    # Perf benchmark
    bench_perf = _perf_since(px[bench_tk] if bench_tk in px.columns else None, pocket['created'])
    if bench_perf is None:
        print(f"\n  ⚠️  Benchmark {bench_tk} indisponible")
        return

    print(f"\n  BENCHMARK — {bench_tk} acheté-tenu sur la même période")
    print(f"  Perf benchmark   : {bench_perf:+.1f}%")

    # VERDICT (informatif uniquement)
    delta = weighted_perf - bench_perf
    print(f"\n  Δ Poche vs benchmark : {delta:+.1f} pts")
    print()
    if days_elapsed < 365:
        print(f"  📊 < 1 an = bruit. Ce Δ est insignifiant statistiquement.")
        print(f"     Attendre 2029 pour conclure. Aucune action.")
    elif days_elapsed < 365 * 2:
        print(f"  📊 1-2 ans. Tendance à observer mais encore trop tôt.")
        print(f"     Continuer à observer. Aucune action.")
    else:
        # Approche de la revue
        if days_remaining > 0:
            print(f"  📅 Approche revue ({days_remaining}j). Continuer à observer.")
        else:
            # On a passé la review date
            print(f"  ⏰ REVUE ÉCHUE — décision manuelle requise :")
            if delta > 2.0:
                print(f"     Δ = {delta:+.1f} pts > +2 → ma sélection a battu le benchmark sur 3 ans.")
                print(f"     Conclusion : edge de sélection apparent. Continuer ou augmenter la poche.")
            elif delta < -2.0:
                print(f"     Δ = {delta:+.1f} pts < -2 → ma sélection N'A PAS battu le benchmark.")
                print(f"     Conclusion : pas d'edge. Indexer (acheter SOXX direct) ou fermer la poche.")
            else:
                print(f"     Δ = {delta:+.1f} pts ≈ 0 → résultat ambigu sur 3 ans.")
                print(f"     Conclusion : pas d'edge claire. Indexer pour simplicité.")

    print()
    print("  ⚠️  RAPPEL :")
    print("     - Aucune action automatique sur ce script.")
    print("     - Trade jamais sur < 3 ans de données.")
    print("     - La perf de la poche ne doit JAMAIS toucher au pipeline principal.")
    print("=" * 78)


if __name__ == "__main__":
    main()
