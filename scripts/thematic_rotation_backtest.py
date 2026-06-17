#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thematic_rotation_backtest.py
================================================================
But : trancher empiriquement la question centrale du brief.
      "Piloter l'allocation ETF thématique par le contexte macro
       ajoute-t-il de la valeur OOS, ou est-ce du factor-timing
       déguisé qui détruit du Sharpe (comme le walk-forward 23y
       l'a montré sur les actions) ?"

On compare 3 stratégies sur le MÊME univers, MÊME période, frais inclus :
  1. STATIC      = ton THEMATIQUE_CORE figé (benchmark honnête)
  2. NAIVE_CHASE = rotation vers les leaders YTD (le piège : chasing momentum)
  3. GATED_TILT  = tilt momentum CONFIRMÉ 6M+12M, filtre sur-extension,
                   cap de turnover (la version "propre" que propose le brief)

Aucune optimisation de paramètres -> pas d'overfitting, lecture OOS honnête.
Rebalancement mensuel sans look-ahead (signaux = données passées only).

Dépendances : pip install yfinance pandas numpy
À lancer en local (yfinance a besoin d'internet).
================================================================
"""

import numpy as np
import pandas as pd
import yfinance as yf
import warnings
warnings.filterwarnings("ignore")

# ----------------------------------------------------------------------
# 1. UNIVERS — proxys US liquides pour avoir un historique long
# ----------------------------------------------------------------------
UNIVERSE = {
    "tech_us":        "QQQ",
    "tech_software":  "VGT",
    "em_broad":       "IEMG",
    "em_korea":       "EWY",
    "energy_us":      "XLE",
    "industrials_us": "XLI",
    "real_estate_us": "VNQ",
    "defense":        "ITA",
    "gold":           "IAU",
    "smallcap_growth":"VBK",
}

# Ton allocation figée actuelle (THEMATIQUE_CORE, normalisée sur cet univers)
STATIC_WEIGHTS = {
    "tech_us": 0.20, "em_broad": 0.25, "tech_software": 0.10,
    "energy_us": 0.10, "smallcap_growth": 0.12, "industrials_us": 0.05,
    "gold": 0.08, "defense": 0.05, "real_estate_us": 0.03, "em_korea": 0.02,
}

START = "2010-01-01"
ANNUAL_TER = 0.0050
TC_BPS = 0.0010
MAX_WEIGHT = 0.30
TURNOVER_CAP = 0.20

def load_prices():
    tickers = list(UNIVERSE.values())
    px = yf.download(tickers, start=START, auto_adjust=True, progress=False)["Close"]
    px = px.rename(columns={v: k for k, v in UNIVERSE.items()})
    px = px.dropna(how="all").ffill().dropna()
    return px

def monthly_signals(px):
    m = px.resample("ME").last()
    ret = m.pct_change()
    mom_12 = m.pct_change(12)
    mom_6  = m.pct_change(6)
    mom_ytd = m.groupby(m.index.year).transform(lambda s: s / s.iloc[0] - 1)
    return m, ret, mom_12, mom_6, mom_ytd

def w_static(_date, _ctx):
    w = pd.Series(STATIC_WEIGHTS).reindex(_ctx["themes"]).fillna(0)
    return w / w.sum()

def w_naive_chase(date, ctx):
    ytd = ctx["mom_ytd"].loc[date]
    rank = ytd.rank(ascending=False)
    w = (rank <= 5).astype(float)
    if w.sum() == 0:
        return w_static(date, ctx)
    return w / w.sum()

def w_gated_tilt(date, ctx):
    base = pd.Series(STATIC_WEIGHTS).reindex(ctx["themes"]).fillna(0)
    m6  = ctx["mom_6"].loc[date]
    m12 = ctx["mom_12"].loc[date]
    ytd = ctx["mom_ytd"].loc[date]
    confirmed_up   = (m6 > 0) & (m12 > 0) & (ytd < 0.50)
    confirmed_down = (m6 < 0) & (m12 < 0)
    tilt = pd.Series(0.0, index=base.index)
    tilt[confirmed_up]   = +0.04
    tilt[confirmed_down] = -0.04
    w = (base + tilt).clip(lower=0, upper=MAX_WEIGHT)
    if w.sum() == 0:
        return base / base.sum()
    return w / w.sum()

STRATS = {"STATIC": w_static, "NAIVE_CHASE": w_naive_chase, "GATED_TILT": w_gated_tilt}

def backtest(px, weight_fn, apply_turnover_cap=False):
    m, ret, mom_12, mom_6, mom_ytd = monthly_signals(px)
    themes = list(px.columns)
    ctx = {"themes": themes, "mom_12": mom_12, "mom_6": mom_6, "mom_ytd": mom_ytd}
    dates = m.index[12:]
    w_prev = pd.Series(0.0, index=themes)
    port_rets, turnovers = [], []
    for i, date in enumerate(dates[:-1]):
        w_target = weight_fn(date, ctx).reindex(themes).fillna(0)
        if apply_turnover_cap and w_prev.sum() > 0:
            delta = w_target - w_prev
            gross = delta.abs().sum()
            if gross > TURNOVER_CAP:
                w_target = w_prev + delta * (TURNOVER_CAP / gross)
            w_target = w_target / w_target.sum()
        turn = (w_target - w_prev).abs().sum()
        nxt = dates[i + 1]
        gross_ret = float((w_target * ret.loc[nxt]).sum())
        net_ret = gross_ret - ANNUAL_TER / 12 - turn * TC_BPS
        port_rets.append(net_ret)
        turnovers.append(turn)
        w_prev = w_target * (1 + ret.loc[nxt])
        w_prev = w_prev / w_prev.sum() if w_prev.sum() else w_target
    s = pd.Series(port_rets, index=dates[1:len(port_rets) + 1])
    return s, np.mean(turnovers)

def metrics(r, avg_turn):
    cum = (1 + r).cumprod()
    cagr = cum.iloc[-1] ** (12 / len(r)) - 1
    vol = r.std() * np.sqrt(12)
    sharpe = (r.mean() * 12) / vol if vol else np.nan
    downside = r[r < 0].std() * np.sqrt(12)
    sortino = (r.mean() * 12) / downside if downside else np.nan
    dd = cum / cum.cummax() - 1
    maxdd = dd.min()
    calmar = cagr / abs(maxdd) if maxdd else np.nan
    return {
        "CAGR": cagr, "Vol": vol, "Sharpe": sharpe, "Sortino": sortino,
        "MaxDD": maxdd, "Calmar": calmar, "Turnover/mois": avg_turn,
        "Turnover/an": avg_turn * 12,
    }

STRESS = {
    "COVID 2020-02→03": ("2020-02-01", "2020-03-31"),
    "Bear 2022":        ("2022-01-01", "2022-10-31"),
    "Hausse taux H2-23":("2023-08-01", "2023-10-31"),
}

def stress(r):
    out = {}
    for name, (a, b) in STRESS.items():
        w = r.loc[a:b]
        out[name] = float((1 + w).prod() - 1) if len(w) else np.nan
    return out

def main():
    print("Téléchargement des prix...")
    px = load_prices()
    print(f"Période : {px.index[0].date()} → {px.index[-1].date()}  ({len(px)} jours)\n")

    rows, stress_rows = {}, {}
    for name, fn in STRATS.items():
        cap = (name == "GATED_TILT")
        r, turn = backtest(px, fn, apply_turnover_cap=cap)
        rows[name] = metrics(r, turn)
        stress_rows[name] = stress(r)

    perf = pd.DataFrame(rows).T
    print("=== PERFORMANCE (net de frais) ===")
    print(perf.to_string(float_format=lambda x: f"{x:,.3f}"))
    print("\n=== STRESS (perte cumulée sur la fenêtre) ===")
    print(pd.DataFrame(stress_rows).T.to_string(float_format=lambda x: f"{x:+.1%}"))

    print("\n=== VERDICT ===")
    base = perf.loc["STATIC", "Sharpe"]
    for name in ["NAIVE_CHASE", "GATED_TILT"]:
        d = perf.loc[name, "Sharpe"] - base
        verdict = "AJOUTE de la valeur" if d > 0.10 else \
                  "MARGINAL" if d > -0.10 else "DÉTRUIT du Sharpe"
        print(f"{name:12s} : Δ Sharpe vs STATIC = {d:+.3f}  -> {verdict}")
    print("\nRappel : le walk-forward 23y sur les actions donnait Δ Sharpe -0.11 OOS.")
    print("Si GATED_TILT ne bat pas STATIC d'au moins +0.10 net, le tilt ne se justifie pas.")

if __name__ == "__main__":
    main()
