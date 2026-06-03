"""Régression des positions sur 10 facteurs orthogonaux.

Livrables pour S-18 :
  1. Loadings factoriels des 3 profils (exposition pondérée)
  2. Stabilité des bêtas (split 2021-23 vs 2023-25)
  3. Rolling corr SOXX⇆MTUM (12 mois)

Architecture facteurs (validée audit_v2) :
  F1 = ACWI                                            (bêta marché)
  F2 = SOXX résid vs ACWI                              (AI capex)
  F3 = MTUM résid vs ACWI                              (Momentum)
  F4 = IWN résid vs ACWI                               (Value)
  F5 = IEF (déjà décorrélé)                            (Duration)
  F6 = LQD résid vs ACWI résid vs IEF                  (Spread crédit pur)
  F7 = TIP résid vs ACWI résid vs IEF                  (Breakeven inflation pur)
  F8 = GLD                                             (Or)
  F9 = XLE résid vs ACWI                               (Energy commodité)
  F10 = XLP résid vs ACWI                              (Staples défensif)

Note Claude : XME exclu (R²=45% vs marché = risk-on déguisé, pas commodité pure)
"""
import sys, json, glob, os, re
from pathlib import Path
import numpy as np
import pandas as pd

try:
    import yfinance as yf
    import statsmodels.api as sm
except ImportError:
    print("python3 -m pip install yfinance pandas numpy statsmodels")
    sys.exit(1)

# Mapping ticker → Yahoo
YAHOO_SUFFIX = {
    "GALP": ".LS", "ITX": ".MC", "NTGY": ".MC", "CS": ".PA",
    "SCHP": ".SW", "NOVN": ".SW", "BMED": ".MI",
    "LUPIN": ".NS", "HEROMOTOCO": ".NS", "INFY": ".NS", "CUMMINSIND": ".NS",
    "000660": ".KS", "005935": ".KS", "2059": ".TW", "2330": ".TW",
    "3653": ".TW", "6669": ".TW", "5274": ".TWO",
}
def to_yahoo(t):
    if not t: return None
    tk = t.strip().upper()
    return tk + YAHOO_SUFFIX.get(tk, "")

FACTOR_PROXIES = ["ACWI", "SOXX", "MTUM", "IWN", "IEF", "LQD", "TIP", "GLD", "XLE", "XLP"]


def build_orthogonal_factors(rets):
    """Construit les 10 facteurs orthogonaux."""
    factors = pd.DataFrame(index=rets.index)
    factors["F1_market"] = rets["ACWI"]

    def resid(y, X_cols):
        X = sm.add_constant(rets[X_cols]) if isinstance(X_cols, list) else sm.add_constant(rets[[X_cols]])
        return sm.OLS(y, X, missing="drop").fit().resid

    factors["F2_AI"]      = resid(rets["SOXX"], "ACWI")
    factors["F3_momentum"] = resid(rets["MTUM"], "ACWI")
    factors["F4_value"]    = resid(rets["IWN"], "ACWI")
    factors["F5_duration"] = rets["IEF"]  # déjà décorrélé du marché (R²<5%)
    # Crédit et inflation : ortho vs marché PUIS vs IEF
    lqd_resid_mkt = resid(rets["LQD"], "ACWI")
    tip_resid_mkt = resid(rets["TIP"], "ACWI")
    factors["F6_credit"]   = sm.OLS(lqd_resid_mkt, sm.add_constant(factors["F5_duration"])).fit().resid
    factors["F7_inflation"]= sm.OLS(tip_resid_mkt, sm.add_constant(factors["F5_duration"])).fit().resid
    factors["F8_gold"]     = rets["GLD"]
    factors["F9_energy"]   = resid(rets["XLE"], "ACWI")
    factors["F10_staples"] = resid(rets["XLP"], "ACWI")

    return factors.dropna()


def regress_position(asset_ret, factors):
    """Régresse 1 actif sur les 10 facteurs orthogonaux. Retourne dict {factor: beta}."""
    aligned = pd.concat([asset_ret, factors], axis=1).dropna()
    if len(aligned) < 100:
        return None
    y = aligned.iloc[:, 0]
    X = sm.add_constant(aligned.iloc[:, 1:])
    fit = sm.OLS(y, X).fit()
    return fit.params.drop("const").to_dict(), fit.rsquared


def find_latest_portfolio():
    if os.path.exists("data/portfolios.json"):
        return "data/portfolios.json"
    files = sorted(glob.glob("data/portfolio_history/portfolios_v4_*.json"))
    return files[-1] if files else None


def load_portfolio(path):
    d = json.load(open(path))
    if "portfolios" in d:
        d = d["portfolios"]
    result = {}
    for prof in ["Agressif", "Modéré", "Stable"]:
        p = d.get(prof, {})
        weights = {}
        meta = p.get("_tickers_meta") or {}
        if meta:
            for tk, m in meta.items():
                y = to_yahoo(tk)
                if y: weights[y] = m.get("weight") or 0
        if not weights:
            alloc = p.get("allocation") or {}
            id_to_tk = {}
            for a in p.get("assets") or []:
                if isinstance(a, str):
                    im = re.search(r"id='([^']+)'", a)
                    tm = re.search(r"ticker='([^']+)'", a)
                    sm_ = re.search(r"symbol='([^']+)'", a)
                    if im:
                        id_to_tk[im.group(1)] = (tm.group(1) if tm else sm_.group(1) if sm_ else im.group(1))
            for key, w in alloc.items():
                tk = id_to_tk.get(key, key)
                wf = (w/100.0) if w > 1 else w
                y = to_yahoo(tk)
                if y: weights[y] = weights.get(y, 0) + wf
        if weights:
            result[prof] = weights
    return result


def compute_loadings(prof_weights, factors, prices_dict):
    """Calcule loadings pondérés du portefeuille."""
    agg = {f: 0.0 for f in factors.columns}
    n_resolved = 0
    for tk, w in prof_weights.items():
        if tk not in prices_dict: continue
        asset_ret = prices_dict[tk].pct_change().dropna()
        res = regress_position(asset_ret, factors)
        if res is None: continue
        betas, r2 = res
        for f, b in betas.items():
            agg[f] += w * b
        n_resolved += 1
    total_w = sum(prof_weights[t] for t in prof_weights if t in prices_dict)
    return agg, n_resolved, total_w


def split_stability(prof_weights, factors_full, prices_dict, mid_date="2024-06-01"):
    """Stabilité bêtas : régresse sur 2 sous-périodes."""
    f1 = factors_full.loc[:mid_date]
    f2 = factors_full.loc[mid_date:]
    if len(f1) < 100 or len(f2) < 100:
        return None
    agg1 = {f: 0.0 for f in factors_full.columns}
    agg2 = {f: 0.0 for f in factors_full.columns}
    for tk, w in prof_weights.items():
        if tk not in prices_dict: continue
        r = prices_dict[tk].pct_change().dropna()
        for label, f, agg in [("p1", f1, agg1), ("p2", f2, agg2)]:
            res = regress_position(r, f)
            if res is None: continue
            for fname, b in res[0].items():
                agg[fname] += w * b
    return agg1, agg2


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else find_latest_portfolio()
    print(f"📂 {path}")

    portfolios = load_portfolio(path)
    all_tickers = set(FACTOR_PROXIES)
    for w in portfolios.values():
        all_tickers.update(w.keys())
    all_tickers = list(all_tickers)

    print(f"⚡ Téléchargement {len(all_tickers)} tickers...")
    raw = yf.download(all_tickers, period="5y", auto_adjust=True, progress=False)
    px = raw["Close"] if "Close" in raw.columns.get_level_values(0) else raw
    px = px.dropna(axis=1, how="all")
    rets_full = px.pct_change().dropna(how="all")

    # Construit les 10 facteurs
    factors_rets = rets_full[FACTOR_PROXIES].dropna()
    factors = build_orthogonal_factors(factors_rets)
    print(f"✓ Facteurs construits sur {len(factors)} jours")
    print()

    # === LOADINGS PAR PROFIL ===
    print("="*84)
    print("EXPOSITION FACTORIELLE — bêtas pondérés par profil")
    print("="*84)
    factor_names = list(factors.columns)
    header = f"{'Profil':10} " + " ".join(f"{f.replace('_',' '):>10}" for f in factor_names)
    print(header)
    print("-"*len(header))
    for prof in ["Agressif", "Modéré", "Stable"]:
        if prof not in portfolios: continue
        prices_dict = {tk: px[tk] for tk in portfolios[prof] if tk in px.columns}
        loadings, n, totw = compute_loadings(portfolios[prof], factors, prices_dict)
        row = f"{prof:10} " + " ".join(f"{loadings[f]:>10.2f}" for f in factor_names)
        print(row)
    print()

    # === STABILITÉ ===
    print("="*84)
    print("STABILITÉ DES BÊTAS — split 2021/06-2024/06 vs 2024/06-2026/06")
    print("="*84)
    for prof in ["Agressif", "Modéré", "Stable"]:
        if prof not in portfolios: continue
        prices_dict = {tk: px[tk] for tk in portfolios[prof] if tk in px.columns}
        result = split_stability(portfolios[prof], factors, prices_dict)
        if result is None:
            print(f"  {prof}: pas assez d'historique"); continue
        agg1, agg2 = result
        print(f"\n[{prof}] |β_p2 - β_p1| (>0.20 = facteur instable)")
        for f in factor_names:
            d = abs(agg2[f] - agg1[f])
            marker = "⚠️" if d > 0.20 else "✓"
            print(f"  {f:14}: p1={agg1[f]:+.2f}  p2={agg2[f]:+.2f}  Δ={d:+.2f}  {marker}")

    # === ROLLING CORR SOXX⇆MTUM ===
    print()
    print("="*84)
    print("ROLLING CORRELATION SOXX⇆MTUM (résidus vs marché, fenêtre 252j)")
    print("="*84)
    soxx_r = factors["F2_AI"]
    mtum_r = factors["F3_momentum"]
    rolling = soxx_r.rolling(252).corr(mtum_r).dropna()
    print(f"  Full-sample : {soxx_r.corr(mtum_r):.2f}")
    print(f"  Rolling min : {rolling.min():.2f}  (date: {rolling.idxmin().date()})")
    print(f"  Rolling max : {rolling.max():.2f}  (date: {rolling.idxmax().date()})")
    print(f"  Rolling moy : {rolling.mean():.2f}  std: {rolling.std():.2f}")
    print(f"  Dernière 12m: {rolling.iloc[-1]:.2f}")


if __name__ == "__main__":
    main()
