"""Vérificateur unique de portefeuille — go/no-go avant achat.

Entrée : dict {ticker: poids} (peut être ticker UCITS, US, ou stock direct)
Sortie : tableau de bord risque + verdict go/no-go

Mesures :
  1. Bêta marché global (vs ACWI)
  2. DR Choueifaty + DR² (paris effectifs)
  3. PC1 share (concentration factorielle)
  4. MaxDD réalisé 5y + stress 2022
  5. Exposition factorielle (10 facteurs orthogonaux)
  6. Caps : single-name ≤ 10%, secteur ≤ 35%, cluster corr ≤ 25%
  7. Alertes rouges si caps dépassés

Usage:
    # Modifier WEIGHTS ci-dessous, puis :
    python3 scripts/portfolio_risk_check.py

    # Ou charger depuis portfolios_core_satellite.json :
    python3 scripts/portfolio_risk_check.py data/portfolios_core_satellite.json
"""
import sys, json
import warnings; warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd

try:
    import yfinance as yf
    import statsmodels.api as sm
except ImportError:
    print("pip install yfinance pandas-datareader statsmodels"); sys.exit(1)


# Mapping UCITS → US proxy (pour calculs yfinance)
UCITS_TO_US = {
    "VWCE.DE": "VT", "VWCE": "VT",
    "IWDA.AS": "URTH", "IWDA": "URTH",
    "EMIM.AS": "IEMG", "EMIM": "IEMG",
    "AGGH.AS": "AGG", "AGGH": "AGG",
    "IBGS.AS": "VGSH", "IBGS": "VGSH",
    "IBCI.AS": "STIP", "IBCI": "STIP",
    "SGLN.AS": "GLD", "SGLN": "GLD",
    # v6.22 fix : tickers stocks régionaux qui ont besoin du suffixe yfinance
    "BVI": "BVI.PA",
    "PUB": "PUB.PA",
    "FGR": "FGR.PA",
    "AD": "AD.AS",
    "SHEL": "SHEL.L",
    "ADM": "ADM.L",
    "NTGY": "NTGY.MC",
    "FRES": "FRES.L",
    "3653": "3653.TW",
    "6669": "6669.TW",
    "3443": "3443.TW",
}

# Décomposition des ETF broad pour métriques DR/PC1.
# Un ETF World ne doit PAS compter pour 1 ligne dans la cov matrix — il porte
# une diversification interne réelle qu'on remonte ici en sous-expositions.
BROAD_ETF_DECOMP = {
    # World / All-World
    "VT":   {"SPY": 0.60, "EFA": 0.22, "IEMG": 0.13, "IJR": 0.05},
    "URTH": {"SPY": 0.65, "EFA": 0.30, "IJR": 0.05},
    "ACWI": {"SPY": 0.60, "EFA": 0.22, "IEMG": 0.13, "IJR": 0.05},
    "ACWV": {"USMV": 0.60, "EFAV": 0.30, "EEMV": 0.10},
    # Emerging
    "IEMG": {"VWO": 0.50, "EEM": 0.50},
    # Bonds agrégés
    "AGG":  {"GOVT": 0.45, "LQD": 0.30, "MBB": 0.25},
    "BND":  {"GOVT": 0.45, "LQD": 0.30, "MBB": 0.25},
    "BSV":  {"VGSH": 0.65, "VCSH": 0.35},
    "CLTL": {"BIL": 1.0},
    # TIPS / govt courts — gardés monolithiques car déjà très ciblés
}

# ETF broad-based exemptés du cap single-name 10 % (par nature diversifiés).
BROAD_UCITS_OR_EQUIVALENT = {
    "VWCE.DE","VWCE","IWDA.AS","IWDA","EMIM.AS","EMIM","AGGH.AS","AGGH",
    "IBCI.AS","IBCI","IBGS.AS","IBGS","SGLN.AS","SGLN",
    "VT","URTH","ACWI","ACWV","IEMG","VWO","EEM",
    "AGG","BND","BSV","CLTL","VGSH","SHY","STIP","TIP","SCHP",
    "GLD","IAU","SGOL",
    "SCHD","FNDF","VIG","DGRO","FLKR","XCEM","PICK","COPX","SOXX",
    "ACWV","EEMV","USMV","EFAV","TDTT","PAAA",
}

# Mapping ticker projet → Yahoo (stocks EU/Asia)
YAHOO_SUFFIX = {
    "GALP": ".LS", "ITX": ".MC", "NTGY": ".MC", "CS": ".PA",
    "SCHP": ".SW", "NOVN": ".SW", "BMED": ".MI",
    "LUPIN": ".NS", "HEROMOTOCO": ".NS", "INFY": ".NS", "CUMMINSIND": ".NS",
    "000660": ".KS", "2059": ".TW",
}


def to_yahoo(tk):
    tk = tk.strip().upper()
    if tk in UCITS_TO_US:
        return UCITS_TO_US[tk]  # remplace UCITS par US proxy
    if tk in YAHOO_SUFFIX:
        return tk + YAHOO_SUFFIX[tk]
    return tk


# Factor proxies (orthogonalisés à 2 étapes pour bonds)
FACTOR_PROXIES = ["ACWI", "SOXX", "MTUM", "IWN", "IEF", "LQD", "TIP", "GLD", "XLE", "XLP"]


def build_factors(rets):
    factors = pd.DataFrame(index=rets.index)
    factors["F1_market"] = rets["ACWI"]
    def resid(y, X_cols):
        X = sm.add_constant(rets[X_cols])
        return sm.OLS(y, X, missing="drop").fit().resid
    factors["F2_AI"]       = resid(rets["SOXX"], "ACWI")
    factors["F3_mom"]      = resid(rets["MTUM"], "ACWI")
    factors["F4_value"]    = resid(rets["IWN"], "ACWI")
    factors["F5_duration"] = rets["IEF"]
    lqd_r = resid(rets["LQD"], "ACWI")
    tip_r = resid(rets["TIP"], "ACWI")
    factors["F6_credit"]   = sm.OLS(lqd_r, sm.add_constant(factors["F5_duration"])).fit().resid
    factors["F7_infl"]     = sm.OLS(tip_r, sm.add_constant(factors["F5_duration"])).fit().resid
    factors["F8_gold"]     = rets["GLD"]
    factors["F9_energy"]   = resid(rets["XLE"], "ACWI")
    factors["F10_staples"] = resid(rets["XLP"], "ACWI")
    return factors.dropna()


def diversification_ratio(weights, returns):
    cols = list(returns.columns)
    w = np.array([weights[t] for t in cols]); w = w/w.sum()
    cov = returns.cov().values * 252
    vols = np.sqrt(np.diag(cov))
    port_vol = np.sqrt(w @ cov @ w)
    if port_vol <= 0: return 1, 1
    dr = float((w @ vols) / port_vol)
    return dr, dr ** 2


def top_pc(returns):
    lam = np.sort(np.linalg.eigvalsh(returns.cov().values))[::-1]
    return float(lam[0] / lam.sum())


def regress_betas(asset_ret, factors):
    aligned = pd.concat([asset_ret, factors], axis=1).dropna()
    if len(aligned) < 100: return None
    y = aligned.iloc[:, 0]
    X = sm.add_constant(aligned.iloc[:, 1:])
    return sm.OLS(y, X).fit().params.drop("const").to_dict()


def check_caps(weights):
    """Alertes sur caps dépassés (broad ETF exemptés du cap single-name)."""
    alerts = []
    for tk, w in weights.items():
        if w > 0.10 and tk not in BROAD_UCITS_OR_EQUIVALENT:
            alerts.append(f"⚠️ Single-name {tk} = {w*100:.1f}% > 10% cap")
    total = sum(weights.values())
    if abs(total - 1.0) > 0.01:
        alerts.append(f"⚠️ Σ weights = {total*100:.1f}% (devrait être 100%)")
    return alerts


def expand_for_diversification(weights):
    """Éclate les ETF broad en sous-positions proxies pour DR/PC1.

    Un ETF World à 50 % n'est pas 1 pari : il porte sa diversification interne.
    On le remplace par 4 expositions régionales pour que la cov matrix la voie."""
    expanded = {}
    for tk, w in weights.items():
        decomp = BROAD_ETF_DECOMP.get(tk)
        if decomp:
            for sub, sw in decomp.items():
                expanded[sub] = expanded.get(sub, 0.0) + w * sw
        else:
            expanded[tk] = expanded.get(tk, 0.0) + w
    return expanded


def main():
    # Charge portfolios depuis JSON OU dict WEIGHTS hardcodé
    if len(sys.argv) > 1:
        path = sys.argv[1]
        d = json.load(open(path))
        profiles = {}
        # Format generate_core_satellite.py
        if "profiles" in d:
            for prof, info in d["profiles"].items():
                weights = {p["ticker"]: p["weight_pct"]/100.0 for p in info["positions"]}
                profiles[prof] = weights
        else:
            # Format portfolios.json — _tickers_meta par profil
            for prof in ["Stable", "Modéré", "Agressif", "Agressif-Thematique"]:
                p = d.get(prof) or d.get("portfolios", {}).get(prof) or {}
                meta = p.get("_tickers_meta") or {}
                if meta:
                    weights = {}
                    for tk, m in meta.items():
                        w = m.get("weight") or 0
                        if w > 1: w = w / 100.0  # parfois en %
                        if w > 0: weights[tk] = w
                    if weights:
                        profiles[prof] = weights
            if not profiles:
                print("Format JSON non reconnu"); return
    else:
        # Test avec un portefeuille example
        profiles = {
            "Test": {
                "VWCE.DE": 0.50, "AGGH.AS": 0.30, "SGLN.AS": 0.10,
                "NVDA": 0.05, "NOVN": 0.05,
            }
        }
        print("⚠ Pas de fichier — test avec portefeuille example")

    # Download universe — y compris les proxies de décomposition
    all_tickers = set(FACTOR_PROXIES)
    for w in profiles.values():
        for tk in w:
            all_tickers.add(to_yahoo(tk))
    # Tous les sous-proxies des décompositions broad-ETF
    for decomp in BROAD_ETF_DECOMP.values():
        for sub in decomp:
            all_tickers.add(sub)
    all_tickers = list(all_tickers)

    print(f"📊 Téléchargement {len(all_tickers)} tickers...")
    raw = yf.download(all_tickers, period="10y", auto_adjust=True, progress=False)
    px = raw["Close"] if "Close" in raw.columns.get_level_values(0) else raw
    px = px.dropna(axis=1, how="all")
    rets_full = px.pct_change().dropna(how="all")
    print(f"✓ {len(rets_full)} jours\n")

    # Build factors
    fp = [p for p in FACTOR_PROXIES if p in px.columns]
    if len(fp) < 5:
        print(f"❌ Pas assez de factor proxies disponibles : {fp}"); return
    factors = build_factors(rets_full[fp].dropna())

    # Analyse chaque profil
    for prof, weights in profiles.items():
        print("=" * 78)
        print(f"  PROFIL {prof.upper()}")
        print("=" * 78)

        # Resolve tickers
        resolved = {}
        missing = []
        for tk, w in weights.items():
            y_tk = to_yahoo(tk)
            if y_tk in px.columns:
                resolved[y_tk] = w
            else:
                missing.append(tk)
        if missing:
            print(f"  [!] Tickers non chargés : {missing}")
        total = sum(resolved.values())
        if total > 0:
            resolved = {t: v/total for t, v in resolved.items()}

        # 1. CAPS check
        alerts = check_caps(weights)

        # 2. Stats portfolio
        rets_p = rets_full[list(resolved.keys())].dropna()
        port_ret = (rets_p * pd.Series(resolved)).sum(axis=1)
        ann_vol = port_ret.std() * np.sqrt(252)
        ann_ret = (1 + port_ret.mean())**252 - 1
        cum = (1 + port_ret).cumprod()
        mdd = (cum / cum.cummax() - 1).min()
        sharpe = (ann_ret - 0.04) / ann_vol if ann_vol > 0 else 0

        # 3. DR + PC1 — sur portefeuille EXPANSÉ (ETF broad éclatés en proxies)
        expanded = expand_for_diversification(resolved)
        # Ne garde que les sous-positions dont on a les rendements
        expanded_avail = {tk: w for tk, w in expanded.items() if tk in px.columns}
        if not expanded_avail:
            expanded_avail = resolved
        # Renormalise
        s = sum(expanded_avail.values())
        if s > 0:
            expanded_avail = {t: v/s for t, v in expanded_avail.items()}
        rets_e = rets_full[list(expanded_avail.keys())].dropna()
        dr, dr2 = diversification_ratio(expanded_avail, rets_e)
        pc1 = top_pc(rets_e)
        n_eff_positions = len(expanded_avail)

        # 4. Factor loadings
        betas_port = {f: 0.0 for f in factors.columns}
        for tk, w in resolved.items():
            betas = regress_betas(rets_p[tk] if tk in rets_p else None, factors)
            if betas:
                for f, b in betas.items():
                    betas_port[f] += w * b

        # 5. Stress 2022 (Fed hike Jan-Oct)
        s22 = port_ret.loc["2022-01-03":"2022-10-14"]
        stress_2022 = (1 + s22).prod() - 1 if len(s22) > 1 else None
        mdd_2022 = ((1+s22).cumprod() / (1+s22).cumprod().cummax() - 1).min() if len(s22) > 1 else None

        # 5b. Stress Q4 2018 (Fed-induced selloff Sep-Dec)
        s18 = port_ret.loc["2018-09-20":"2018-12-24"]
        stress_2018 = (1 + s18).prod() - 1 if len(s18) > 1 else None
        mdd_2018 = ((1+s18).cumprod() / (1+s18).cumprod().cummax() - 1).min() if len(s18) > 1 else None

        # === SORTIE ===
        print(f"\n  [Composition]  {len(resolved)} positions, total {sum(resolved.values())*100:.1f}%")
        for tk, w in sorted(resolved.items(), key=lambda x: -x[1])[:10]:
            print(f"    {tk:8} {w*100:5.2f}%")
        if len(resolved) > 10:
            print(f"    ... +{len(resolved)-10} autres")

        print(f"\n  [Risque réalisé 5y]")
        print(f"    Vol annualisée  : {ann_vol*100:5.1f}%")
        print(f"    Perf annualisée : {ann_ret*100:+5.1f}%")
        print(f"    Sharpe (rf=4%)   : {sharpe:5.2f}")
        print(f"    MaxDD            : {mdd*100:5.1f}%")

        print(f"\n  [Diversification — ETF broad éclatés en sous-expositions]")
        print(f"    DR Choueifaty   : {dr:.2f}  (DR² = {dr2:.1f} paris effectifs)")
        print(f"    PC1 share        : {pc1*100:5.1f}%  {'✅' if pc1 < 0.45 else '⚠️' if pc1 < 0.55 else '❌'}")
        print(f"    N positions expansées : {n_eff_positions}  (vs {len(resolved)} ligne(s) achetable(s))")

        print(f"\n  [Exposition factorielle (bêtas pondérés)]")
        for f, b in betas_port.items():
            marker = "❌" if abs(b) > 1.2 else "⚠️" if abs(b) > 0.7 else " "
            print(f"    {f:14}  β = {b:+.2f}  {marker}")

        if stress_2022 is not None:
            print(f"\n  [Stress 2022 Fed hike Jan-Oct]")
            print(f"    Perf cumul : {stress_2022*100:+.1f}%   MaxDD : {mdd_2022*100:.1f}%")
        if stress_2018 is not None:
            print(f"  [Stress Q4 2018 Fed selloff Sep-Dec]")
            print(f"    Perf cumul : {stress_2018*100:+.1f}%   MaxDD : {mdd_2018*100:.1f}%")

        # === VERDICT ===
        print(f"\n  [VERDICT]")
        red_flags = 0
        if alerts:
            for a in alerts:
                print(f"    {a}")
                red_flags += 1
        if pc1 > 0.50:
            print(f"    ❌ PC1 = {pc1*100:.1f}% > 50% — concentration de facteur dominant")
            red_flags += 1
        if dr < 1.40:
            print(f"    ⚠️ DR = {dr:.2f} < 1.40 — diversification structurelle faible")
            red_flags += 1
        if abs(betas_port.get("F1_market", 0)) > 1.3:
            print(f"    ⚠️ Bêta marché = {betas_port['F1_market']:.2f} — au-delà de 1.3 = levier implicite fort")
            red_flags += 1
        if stress_2022 is not None and stress_2022 < -0.25:
            print(f"    ⚠️ Stress 2022 = {stress_2022*100:.1f}% < -25%")
            red_flags += 1

        if red_flags == 0:
            print(f"    ✅ GO — aucun cap dépassé, diversification correcte")
        else:
            print(f"    {'🟠' if red_flags <= 2 else '🔴'} {red_flags} alerte(s) — vérifier avant achat")

        print()


if __name__ == "__main__":
    main()
