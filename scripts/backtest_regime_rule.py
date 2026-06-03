"""Backtest walk-forward d'une règle de régime explicite (déterministe).

Objectif : test honnête pour trancher fork B (vrais tilts factoriels timés)
vs fork A (book + 3 leviers, abandon du market timing).

Architecture proposée par Claude (gratuit, déterministe, sans look-ahead) :

  1. Macro INPUT : proxys yfinance datés (TIP/IEF pour breakeven inflation,
     courbe taux 10Y-3M via ^TNX/^IRX, USD index ^DX-Y.NYB, oil USO, etc.).
     Toutes données publiées en temps réel → pas de look-ahead.

  2. Facteurs OUTPUT : rendements mensuels Ken French via pandas-datareader
     (Mkt-RF, SMB, HML, RMW, CMA, Mom). Disponibles depuis 1963 (US) ou 1990
     (factor-by-region).

  3. Règle régime explicite : 4 régimes définis par (inflation_trend) ×
     (growth_trend) avec seuils ex-ante :
       R1 : inflation↑ + growth↑ = surchauffe
       R2 : inflation↑ + growth↓ = stagflation
       R3 : inflation↓ + growth↑ = goldilocks (soft landing)
       R4 : inflation↓ + growth↓ = récession

  4. Mapping régime → tilt factoriel (intuitions académiques ex-ante) :
       R1 : Value+ Momentum+ (cycle solide)
       R2 : Quality+ Low-Vol+ (defensif)
       R3 : Momentum+ Quality+ (croissance saine)
       R4 : Quality+ Low-Vol+ (défensif)

  5. Walk-forward : à chaque mois, déterminer régime t avec données
     publiées AVANT t. Allouer selon le tilt. Mesurer t+1.

  6. Comparer vs 2 benchmarks :
       - Statique : 60/40 (Mkt 60% + RF 40%)
       - Risk parity : allocation inverse-vol

Usage :
    python3 scripts/backtest_regime_rule.py
"""
import sys, warnings
warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd

try:
    import pandas_datareader.data as pdr
    import yfinance as yf
except ImportError:
    print("python3 -m pip install pandas-datareader yfinance")
    sys.exit(1)


# ============================================================================
# 1. LOAD KEN FRENCH FACTORS
# ============================================================================

def load_french_factors(start="2000-01-01", end="2026-06-01"):
    """Télécharge les facteurs Ken French (US 5 factors + Momentum), mensuel."""
    print("📊 Téléchargement facteurs Ken French...")
    try:
        ff5 = pdr.get_data_famafrench("F-F_Research_Data_5_Factors_2x3", start, end)[0]
        mom = pdr.get_data_famafrench("F-F_Momentum_Factor", start, end)[0]
        # Joindre
        df = ff5.join(mom, how="inner")
        df.columns = ["Mkt_RF", "SMB", "HML", "RMW", "CMA", "RF", "Mom"]
        df = df / 100  # Ken French = en pourcents, convertir en décimales
        # Aligner sur fin de mois (Yahoo resample 'M' → fin de mois)
        df.index = df.index.to_timestamp(how="end").normalize()
        print(f"   ✓ {len(df)} mois, depuis {df.index[0].date()} jusqu'à {df.index[-1].date()}")
        return df
    except Exception as e:
        print(f"   ✗ Erreur : {e}")
        sys.exit(1)


# ============================================================================
# 2. LOAD MACRO INDICATORS (proxys yfinance datés)
# ============================================================================

def load_macro_proxies(start="2000-01-01"):
    """Télécharge proxys macro datés. Pas de look-ahead car prix de marché."""
    print("📊 Téléchargement macro proxies...")
    tickers = {
        "TIP":       "TIPS US ETF (breakeven inflation proxy)",
        "IEF":       "Treasury 7-10y",
        "TLT":       "Treasury 20y+",
        "SHY":       "Treasury 1-3y",
        "DX-Y.NYB":  "USD index",
        "GLD":       "Gold (real assets/crisis)",
    }
    px = {}
    for tk in tickers:
        try:
            data = yf.download(tk, start=start, auto_adjust=True, progress=False)
            if not data.empty:
                px[tk] = data["Close"]
                print(f"   ✓ {tk}")
        except Exception as e:
            print(f"   ✗ {tk} : {e}")
    df = pd.concat(px, axis=1).dropna(how="all")
    df.columns = list(px.keys())
    # Resample mensuel (last)
    monthly = df.resample("M").last()
    return monthly


# ============================================================================
# 3. DÉFINIR LES RÉGIMES (règles explicites ex-ante)
# ============================================================================

def classify_regime(macro_monthly):
    """Définit le régime à chaque date à partir de signaux datés.

    Signaux ex-ante (pas optimisés sur backtest) :
    - Inflation trend = (TIP/IEF) variation 6m vs 6m antérieur
      → si breakeven inflation monte = inflation↑
    - Growth trend = (TLT/SHY) inverse-pente
      → si courbe se redresse = growth↑ ; si s'inverse = growth↓

    Note : ces deux signaux sont des PROXYS de marché. Les vrais indicateurs
    (CPI YoY, ISM, chômage) nécessitent FRED API. Cette v1 utilise les proxys
    pour démontrer le mécanisme.
    """
    # Breakeven inflation proxy (TIP/IEF ratio en moyenne mobile)
    breakeven = (macro_monthly["TIP"] / macro_monthly["IEF"])
    breakeven_trend = breakeven.rolling(6).mean().diff(6)  # variation 6m vs 6m antérieur

    # Yield curve slope (TLT/SHY) : pente longue/courte
    curve_slope = (macro_monthly["TLT"] / macro_monthly["SHY"])
    curve_trend = curve_slope.rolling(6).mean().diff(6)

    # Régimes
    regime = pd.Series(index=macro_monthly.index, dtype=object)
    for date in macro_monthly.index:
        bt = breakeven_trend.loc[date] if date in breakeven_trend.index else np.nan
        ct = curve_trend.loc[date] if date in curve_trend.index else np.nan
        if pd.isna(bt) or pd.isna(ct):
            regime.loc[date] = "unknown"
            continue
        inf_up = bt > 0
        grw_up = ct > 0  # courbe se redresse = anticipation croissance
        if inf_up and grw_up:
            regime.loc[date] = "R1_surchauffe"
        elif inf_up and not grw_up:
            regime.loc[date] = "R2_stagflation"
        elif not inf_up and grw_up:
            regime.loc[date] = "R3_goldilocks"
        else:
            regime.loc[date] = "R4_recession"
    return regime


# ============================================================================
# 4. MAPPING RÉGIME → TILT FACTORIEL (ex-ante, intuitions académiques)
# ============================================================================

REGIME_TILTS = {
    "R1_surchauffe":  {"Mkt_RF": 0.50, "HML": 0.20, "Mom": 0.20, "RMW": 0.10, "RF": 0.00},
    "R2_stagflation": {"Mkt_RF": 0.30, "RMW": 0.30, "HML": 0.10, "Mom": 0.00, "RF": 0.30},
    "R3_goldilocks":  {"Mkt_RF": 0.60, "Mom": 0.20, "RMW": 0.10, "HML": 0.10, "RF": 0.00},
    "R4_recession":   {"Mkt_RF": 0.20, "RMW": 0.30, "HML": 0.10, "Mom": 0.00, "RF": 0.40},
    "unknown":        {"Mkt_RF": 0.50, "RMW": 0.10, "HML": 0.10, "Mom": 0.10, "RF": 0.20},
}


# ============================================================================
# 5. BACKTEST WALK-FORWARD
# ============================================================================

def backtest_strategy(factors, regime, tilts):
    """Pour chaque mois t, alloue selon régime(t-1), mesure rendement t."""
    aligned = factors.copy()
    aligned["regime"] = regime
    # Lag : utiliser régime de t-1 pour décider à t
    aligned["regime_lag"] = aligned["regime"].shift(1)

    strategy_ret = []
    for date, row in aligned.iterrows():
        reg = row["regime_lag"]
        if pd.isna(reg) or reg not in tilts:
            strategy_ret.append(np.nan)
            continue
        weights = tilts[reg]
        r = 0.0
        for fname, w in weights.items():
            if fname == "RF":
                # RF est le taux sans risque, non un "rendement actif"
                r += w * row["RF"]
            elif fname in row.index:
                # Pour les facteurs L/S Ken French : valeur ajoutée au marché
                # On considère Mkt_RF comme le market return ; les autres comme add-on
                # Simplification : rendement = sum(w_i * factor_return_i)
                # mais Mkt_RF est déjà excess return, donc total = w*Mkt + w*HML + ... + RF
                r += w * row[fname]
        strategy_ret.append(r)
    aligned["strategy_ret"] = strategy_ret

    # Benchmarks
    aligned["bench_static_6040"] = 0.6 * aligned["Mkt_RF"] + 0.4 * aligned["RF"]
    aligned["bench_mkt_only"]    = aligned["Mkt_RF"] + aligned["RF"]  # market total

    return aligned.dropna(subset=["strategy_ret"])


def perf_stats(returns, name=""):
    if len(returns) < 12:
        return {}
    ann_ret = (1 + returns.mean()) ** 12 - 1
    ann_vol = returns.std() * np.sqrt(12)
    sharpe = ann_ret / ann_vol if ann_vol > 0 else 0
    cum = (1 + returns).cumprod()
    mdd = (cum / cum.cummax() - 1).min()
    return {
        "Ann.Ret %": round(ann_ret * 100, 2),
        "Ann.Vol %": round(ann_vol * 100, 2),
        "Sharpe": round(sharpe, 2),
        "MaxDD %": round(mdd * 100, 2),
        "n_months": len(returns),
    }


# ============================================================================
# 6. MAIN
# ============================================================================

def main():
    factors = load_french_factors()
    macro = load_macro_proxies(start="2003-01-01")  # macro proxies starting ETF avail
    print()

    # Aligner sur mensuel commun
    macro_monthly = macro.resample("M").last()
    common_idx = factors.index.intersection(macro_monthly.index)
    if len(common_idx) < 60:
        print(f"❌ Historique commun trop court : {len(common_idx)} mois")
        return
    print(f"📅 Historique commun : {len(common_idx)} mois ({common_idx[0].date()} → {common_idx[-1].date()})")
    print()

    # Classifier régimes
    regime = classify_regime(macro_monthly)
    factors_filtered = factors.loc[common_idx]
    regime_filtered = regime.loc[common_idx]

    print("📊 Distribution régimes (avec lag 1m) :")
    counts = regime_filtered.shift(1).value_counts()
    for r, c in counts.items():
        pct = c / len(regime_filtered) * 100
        print(f"   {r:18s}: {c:4d} mois ({pct:5.1f}%)")
    print()

    # Backtest
    result = backtest_strategy(factors_filtered, regime_filtered, REGIME_TILTS)
    print("="*70)
    print("RÉSULTATS BACKTEST WALK-FORWARD")
    print("="*70)
    print()
    stats_strat = perf_stats(result["strategy_ret"], "Stratégie régime")
    stats_60_40 = perf_stats(result["bench_static_6040"], "60/40 statique")
    stats_mkt   = perf_stats(result["bench_mkt_only"], "Marché 100%")

    df_stats = pd.DataFrame({
        "Régime-switching": stats_strat,
        "60/40 statique":   stats_60_40,
        "Marché 100%":      stats_mkt,
    })
    print(df_stats.to_string())
    print()

    # Comparaison
    diff_sharpe_vs_60_40 = stats_strat["Sharpe"] - stats_60_40["Sharpe"]
    diff_sharpe_vs_mkt   = stats_strat["Sharpe"] - stats_mkt["Sharpe"]
    print(f"Δ Sharpe vs 60/40 : {diff_sharpe_vs_60_40:+.2f}")
    print(f"Δ Sharpe vs marché: {diff_sharpe_vs_mkt:+.2f}")
    print()

    # Verdict
    print("="*70)
    if diff_sharpe_vs_60_40 > 0.10:
        print("✅ La règle régime AJOUTE de la valeur ajustée du risque.")
        print("   → Fork B (vrais tilts factoriels timés) testable et prometteur")
    elif diff_sharpe_vs_60_40 < -0.10:
        print("❌ La règle régime DÉTRUIT de la valeur ajustée du risque.")
        print("   → Fork A (book + 3 leviers honnête) par défaut")
    else:
        print("⚠️ La règle régime n'AJOUTE/RETIRE rien de matériel.")
        print("   → Fork A par défaut (simplicité)")
    print("="*70)


if __name__ == "__main__":
    main()
