"""Walk-forward backtest Core-Satellite vs benchmark risk-matched.

Test décisif après 7 tours de débat :
  - Strat A : Core-only (ETF cœur statiques) — sans satellite
  - Strat B : Core+Satellite (cœur + stocks qualité fundamentaux)
  - Bench  : 25/75 (Stable), 50/50 (Modéré), 100% equity broad (Agressif)

Période : 2005-01 → 2026-06 (≈21 ans, post-EEM inception)
Calibration : 5 ans rolling
Rebalance : annuel (vers cibles statiques) + recompose satellite équipondéré
Friction : TER 15 bps/an + 10 bps turnover/rebalance

Verdict :
  Δ Sharpe net (Strat B vs Bench)  → satellite vaut quelque chose ?
  Δ Sharpe net (Strat A vs Bench)  → architecture cœur vaut quelque chose ?
  Δ Sharpe (B vs A)                → satellite contribue net de frais ?

Si |Δ Sharpe| < 0.10 vs Bench → bascule (équivalent + plus simple/robuste).
Si B ≤ A net de frais → satellite ne paie pas → indiciel pur (cœur seul).
"""
import sys, warnings
warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd

try:
    import yfinance as yf
except ImportError:
    print("pip install yfinance"); sys.exit(1)


# Approximation des cœurs UCITS par US proxies (long history)
# Mapping : VWCE → SPY+EFA+EEM (60/30/10 ≈ FTSE All-World), IWDA → SPY+EFA, etc.
CORE_WEIGHTS = {
    "Stable": {
        # VWCE 15% → équivalent SPY 9 + EFA 4.5 + EEM 1.5
        "SPY": 0.090, "EFA": 0.045, "EEM": 0.015,
        # AGGH 20% → AGG
        "AGG": 0.20,
        # IBGS 15% → SHY
        "SHY": 0.15,
        # IBCI 20% → TIP
        "TIP": 0.20,
        # SGLN 15% → GLD
        "GLD": 0.15,
    },  # sum = 0.85
    "Modéré": {
        # 51.77% equity broad → SPY 30 + EFA 14 + EEM 7
        "SPY": 0.30, "EFA": 0.14, "EEM": 0.07,
        "AGG": 0.14, "SHY": 0.05, "TIP": 0.05, "GLD": 0.05,
    },  # sum = 0.80
    "Agressif": {
        # 70% equity broad → SPY 40 + EFA 18 + EEM 12
        "SPY": 0.40, "EFA": 0.18, "EEM": 0.12,
        "SHY": 0.05, "GLD": 0.05,
    },  # sum = 0.80
}

# Satellite univers (qualité fondamentaux — proche du basket final actuel)
SATELLITE_UNIVERSE = ["PAYX", "INTU", "DECK", "NOVN.SW", "ITX.MC", "REC.MI"]
SATELLITE_BUDGET = {"Stable": 0.15, "Modéré": 0.20, "Agressif": 0.20}

# Benchmarks risk-matched (équivalents UCITS via proxies US)
BENCH_WEIGHTS = {
    "Stable":   {"SPY": 0.15, "EFA": 0.075, "EEM": 0.025, "AGG": 0.75},
    "Modéré":   {"SPY": 0.30, "EFA": 0.14,  "EEM": 0.06,  "AGG": 0.50},
    "Agressif": {"SPY": 0.60, "EFA": 0.28,  "EEM": 0.12},  # ≈ MSCI ACWI
}

START_DATE = "2005-01-01"
END_DATE   = "2026-06-01"
CALIB_YEARS = 5            # fenêtre rolling pour gating satellite
TER_ANNUAL = 0.0015        # 15 bps/an, embedded daily
TURNOVER_COST = 0.0010     # 10 bps par rebalance annuel
RF_ANNUAL = 0.025          # taux sans risque moyen long terme


def download_prices():
    all_tk = set()
    for w in CORE_WEIGHTS.values(): all_tk.update(w)
    for w in BENCH_WEIGHTS.values(): all_tk.update(w)
    all_tk.update(SATELLITE_UNIVERSE)
    print(f"📊 Téléchargement {len(all_tk)} tickers ({START_DATE} → {END_DATE})...")
    raw = yf.download(list(all_tk), start=START_DATE, end=END_DATE,
                      auto_adjust=True, progress=False)
    px = raw["Close"] if "Close" in raw.columns.get_level_values(0) else raw
    return px.dropna(axis=1, how="all")


def walk_forward_returns(px, weights, satellite=None, sat_budget=0.0):
    """Retours net friction du portefeuille en walk-forward annuel.

    weights : dict {ticker: poids} pour le cœur statique
    satellite : liste de tickers à pondérer équipondéré dans sat_budget
    sat_budget : poids total à donner au satellite (cœur réduit d'autant)
    """
    rets = px.pct_change()
    daily_ter = TER_ANNUAL / 252

    # Construit la série de poids cibles par jour
    n_days = len(rets)
    port_rets = []
    prev_targets = None
    last_year = None

    # Resample : rebalance annuel le 1er jour de janvier
    rebalance_dates = pd.date_range(rets.index[0], rets.index[-1], freq="YS")
    rebalance_dates = [d for d in rebalance_dates if d in rets.index or rets.index.searchsorted(d) < n_days]

    for date, row in rets.iterrows():
        # À chaque début d'année → recalcule target weights, applique coût turnover
        year = date.year
        new_year = (last_year is None) or (year != last_year)
        if new_year:
            # Cible : cœur + satellite équipondéré (sur tickers dispos à cette date)
            core_part = {tk: w for tk, w in weights.items() if tk in rets.columns}
            total_core = sum(core_part.values())
            if total_core > 0:
                # Renormalise sur (1 - sat_budget)
                target_core_total = 1.0 - sat_budget if satellite else 1.0
                scale = target_core_total / total_core
                target = {tk: w * scale for tk, w in core_part.items()}
            else:
                target = {}

            # Ajoute satellite équipondéré sur tickers dispos
            if satellite and sat_budget > 0:
                # Filtre : on garde les sat tickers qui ont des données récentes (90j historique mini)
                window_start = date - pd.Timedelta(days=120)
                sat_avail = []
                for tk in satellite:
                    if tk not in rets.columns: continue
                    hist = rets[tk].loc[window_start:date].dropna()
                    if len(hist) >= 60:
                        sat_avail.append(tk)
                if sat_avail:
                    w_each = sat_budget / len(sat_avail)
                    for tk in sat_avail:
                        target[tk] = target.get(tk, 0) + w_each

            # Coût turnover : 10 bps × somme |Δw|
            if prev_targets is not None:
                all_tk = set(target) | set(prev_targets)
                delta = sum(abs(target.get(t, 0) - prev_targets.get(t, 0)) for t in all_tk)
                cost = TURNOVER_COST * delta
            else:
                cost = TURNOVER_COST * sum(target.values())  # initial allocation
            # Première perf du jour = -cost (les retours du jour suivront)
            day_ret_pre = -cost
            last_year = year
            prev_targets = target.copy()
            current_weights = target.copy()
        else:
            day_ret_pre = 0.0

        # Performance journalière du portefeuille
        if current_weights:
            day_ret = sum(current_weights.get(tk, 0) * (row.get(tk) or 0)
                          for tk in current_weights if pd.notna(row.get(tk)))
        else:
            day_ret = 0.0

        # Net friction
        net_ret = day_ret + day_ret_pre - daily_ter
        port_rets.append((date, net_ret))

        # Mise à jour des poids effectifs (drift intra-année)
        if current_weights:
            new_weights = {}
            tot = 0
            for tk, w in current_weights.items():
                r = row.get(tk)
                if pd.notna(r):
                    new_weights[tk] = w * (1 + r)
                    tot += new_weights[tk]
                else:
                    new_weights[tk] = w
                    tot += w
            if tot > 0:
                current_weights = {tk: v/tot for tk, v in new_weights.items()}

    return pd.Series([r for _, r in port_rets], index=[d for d, _ in port_rets])


def stats(rets, name):
    rets = rets.dropna()
    if len(rets) < 100:
        return {"name": name, "n_days": len(rets)}
    ann_ret = (1 + rets.mean()) ** 252 - 1
    ann_vol = rets.std() * np.sqrt(252)
    sharpe = (ann_ret - RF_ANNUAL) / ann_vol if ann_vol > 0 else 0
    # Sortino (downside dev)
    downside = rets[rets < 0]
    dd_vol = downside.std() * np.sqrt(252) if len(downside) > 0 else ann_vol
    sortino = (ann_ret - RF_ANNUAL) / dd_vol if dd_vol > 0 else 0
    cum = (1 + rets).cumprod()
    mdd = (cum / cum.cummax() - 1).min()
    # CAGR
    n_years = len(rets) / 252
    cagr = cum.iloc[-1] ** (1/n_years) - 1
    return dict(name=name, n_days=len(rets), cagr=cagr, ann_vol=ann_vol,
                sharpe=sharpe, sortino=sortino, mdd=mdd)


def fmt_row(s):
    if "cagr" not in s:
        return f"  {s['name']:30}  [pas assez de données]"
    return (f"  {s['name']:30}  CAGR {s['cagr']*100:+5.1f}%  "
            f"Vol {s['ann_vol']*100:4.1f}%  Sharpe {s['sharpe']:5.2f}  "
            f"Sortino {s['sortino']:5.2f}  MaxDD {s['mdd']*100:5.1f}%")


def main():
    px = download_prices()
    print(f"✓ {len(px)} jours, {px.shape[1]} tickers chargés")
    print(f"  Période effective : {px.index[0].date()} → {px.index[-1].date()}\n")

    results = {}
    for profile in ["Stable", "Modéré", "Agressif"]:
        print("=" * 86)
        print(f"  PROFIL {profile.upper()}")
        print("=" * 86)
        core = CORE_WEIGHTS[profile]
        bench = BENCH_WEIGHTS[profile]
        sat_budget = SATELLITE_BUDGET[profile]

        # Strat A : Core-only (tout le budget, pas de satellite)
        # Renormalisé pour sommer à 1.0 (pas de cash buffer)
        core_full = {tk: w/sum(core.values()) for tk, w in core.items()}
        ret_A = walk_forward_returns(px, core_full, satellite=None, sat_budget=0.0)
        sA = stats(ret_A, "A) Core-only")

        # Strat B : Core+Satellite
        ret_B = walk_forward_returns(px, core, satellite=SATELLITE_UNIVERSE,
                                     sat_budget=sat_budget)
        sB = stats(ret_B, "B) Core+Satellite")

        # Benchmark risk-matched
        bench_full = {tk: w/sum(bench.values()) for tk, w in bench.items()}
        ret_BM = walk_forward_returns(px, bench_full, satellite=None, sat_budget=0.0)
        sBM = stats(ret_BM, "Bench risk-matched")

        results[profile] = {"A": sA, "B": sB, "BM": sBM}

        print(fmt_row(sBM))
        print(fmt_row(sA))
        print(fmt_row(sB))

        # Verdicts
        print(f"\n  [Δ vs benchmark]")
        if "sharpe" in sA and "sharpe" in sBM:
            dA = sA["sharpe"] - sBM["sharpe"]
            print(f"    Core-only vs Bench       : Δ Sharpe = {dA:+.2f}  "
                  f"{'✅ équivalent' if abs(dA) < 0.10 else '⚠️ écart > 0.10'}")
        if "sharpe" in sB and "sharpe" in sBM:
            dB = sB["sharpe"] - sBM["sharpe"]
            print(f"    Core+Sat vs Bench        : Δ Sharpe = {dB:+.2f}  "
                  f"{'✅ équivalent' if abs(dB) < 0.10 else '✅ edge' if dB > 0.10 else '❌ sous-perf'}")
        if "sharpe" in sA and "sharpe" in sB:
            dAB = sB["sharpe"] - sA["sharpe"]
            print(f"    Satellite contribution   : Δ Sharpe = {dAB:+.2f}  "
                  f"{'✅ satellite paie' if dAB > 0.05 else '⚠️ marginal' if dAB > 0 else '❌ satellite ne paie pas'}")
        print()

    # === SYNTHÈSE ===
    print("=" * 86)
    print("  SYNTHÈSE — Δ Sharpe net après frais & turnover")
    print("=" * 86)
    print(f"  {'Profil':10}  {'Bench':>7}  {'Core-only':>10}  {'Core+Sat':>10}  "
          f"{'Δ A-BM':>8}  {'Δ B-BM':>8}  {'Δ B-A':>8}  Verdict")
    print("  " + "-" * 96)
    for prof, r in results.items():
        sA, sB, sBM = r["A"], r["B"], r["BM"]
        if "sharpe" not in sA or "sharpe" not in sB or "sharpe" not in sBM:
            print(f"  {prof:10}  [pas assez de données]"); continue
        dA = sA["sharpe"] - sBM["sharpe"]
        dB = sB["sharpe"] - sBM["sharpe"]
        dAB = sB["sharpe"] - sA["sharpe"]
        if abs(dB) < 0.10:
            verdict = "🟢 bascule OK (équivalent)"
        elif dB > 0.10:
            verdict = "🟢 bascule (edge net)"
        else:
            verdict = "🔴 sous-perf vs bench"
        if dAB < 0.02:
            verdict += " — satellite ≈ inutile"
        elif dAB < 0:
            verdict += " — satellite détruit"
        print(f"  {prof:10}  {sBM['sharpe']:>7.2f}  {sA['sharpe']:>10.2f}  "
              f"{sB['sharpe']:>10.2f}  {dA:>+8.2f}  {dB:>+8.2f}  {dAB:>+8.2f}  {verdict}")


if __name__ == "__main__":
    main()
