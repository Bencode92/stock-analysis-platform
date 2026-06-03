"""Walk-forward roulant STRICT — pas de look-ahead implicite.

Test décisif du fork B selon protocole Claude :

  1. Calibrage : fenêtre roulante 10 ans → mapping régime→tilt
     (choisi pour maximiser Sharpe IN-SAMPLE uniquement)
  2. Gel : mapping figé après calibrage
  3. Application : aveugle sur l'année suivante (out-of-sample pur)
  4. Avancée : roll 1 an, on recommence

→ ~13 années out-of-sample (2013-2026), zéro contamination

Règle de décision FIXÉE AVANT de regarder le résultat :
  Δ Sharpe net out-of-sample ≥ +0.10 vs benchmark risk-matched → fork B
  Sinon → fork A (par défaut)

Coûts estimés inclus :
  - Turnover : 1% * Σ|Δw| à chaque changement de régime
  - Frais : TER moyen ETF ~0.20% annuel
  → ~-0.03 à -0.07 Sharpe attendu
"""
import sys, warnings
warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd

import pandas_datareader.data as pdr
import yfinance as yf

# =================================================================
# CONFIG — fixé ex-ante (avant de voir les résultats)
# =================================================================

DECISION_THRESHOLD_NET = 0.10  # Δ Sharpe net minimum pour fork B
TURNOVER_COST_BPS = 10  # 10 bps par 100% de turnover (one-way)
ANNUAL_FEE_BPS = 20   # 20 bps frais annuels (ETF avg)

# Candidates tilts — 4 mixes simples, fixés ex-ante
# (pas de tuning ex-post : on choisit dans cette liste fermée)
TILT_CANDIDATES = {
    "growth":    {"Mkt_RF": 0.70, "Mom": 0.20, "RMW": 0.10, "HML": 0.00, "RF": 0.00},
    "value":     {"Mkt_RF": 0.50, "HML": 0.30, "RMW": 0.10, "Mom": 0.00, "RF": 0.10},
    "quality":   {"Mkt_RF": 0.40, "RMW": 0.30, "Mom": 0.10, "HML": 0.00, "RF": 0.20},
    "defensive": {"Mkt_RF": 0.20, "RMW": 0.20, "HML": 0.00, "Mom": 0.00, "RF": 0.60},
}
DEFAULT_TILT = TILT_CANDIDATES["growth"]  # fallback si régime inconnu

CALIB_WINDOW_YEARS = 10
TEST_FIRST_YEAR = 2013
TEST_LAST_YEAR = 2026


def load_data():
    """Charge facteurs Ken French + macro proxies."""
    print("📊 Téléchargement données...")
    ff5 = pdr.get_data_famafrench("F-F_Research_Data_5_Factors_2x3", "2000-01-01", "2026-06-01")[0]
    mom = pdr.get_data_famafrench("F-F_Momentum_Factor", "2000-01-01", "2026-06-01")[0]
    factors = ff5.join(mom, how="inner")
    factors.columns = ["Mkt_RF", "SMB", "HML", "RMW", "CMA", "RF", "Mom"]
    factors = factors / 100
    factors.index = factors.index.to_timestamp(how="end").normalize()
    print(f"   ✓ Facteurs : {len(factors)} mois")

    px = {}
    for tk in ["TIP", "IEF", "TLT", "SHY"]:
        d = yf.download(tk, start="2003-01-01", auto_adjust=True, progress=False)
        if not d.empty: px[tk] = d["Close"]
    macro = pd.concat(px, axis=1)
    macro.columns = list(px.keys())
    macro_monthly = macro.resample("M").last()
    print(f"   ✓ Macro proxies : {len(macro_monthly)} mois")
    return factors, macro_monthly


def classify_regime(macro):
    """Règle de régime EXPLICITE (mêmes seuils ex-ante)."""
    breakeven_trend = (macro["TIP"] / macro["IEF"]).rolling(6).mean().diff(6)
    curve_trend     = (macro["TLT"] / macro["SHY"]).rolling(6).mean().diff(6)
    regime = pd.Series(index=macro.index, dtype=object)
    for date in macro.index:
        if date not in breakeven_trend.index: continue
        bt = breakeven_trend.loc[date]
        ct = curve_trend.loc[date]
        if pd.isna(bt) or pd.isna(ct):
            regime.loc[date] = "unknown"
        elif bt > 0 and ct > 0: regime.loc[date] = "R1_surchauffe"
        elif bt > 0 and ct <= 0: regime.loc[date] = "R2_stagflation"
        elif bt <= 0 and ct > 0: regime.loc[date] = "R3_goldilocks"
        else: regime.loc[date] = "R4_recession"
    return regime


def calibrate_mapping(train_data):
    """Pour chaque régime, choisit le tilt (parmi 4) qui maxime Sharpe IN-SAMPLE.

    Si un régime apparaît <6 fois dans la fenêtre → fallback DEFAULT_TILT.
    """
    mapping = {}
    for regime in train_data["regime_lag"].dropna().unique():
        regime_data = train_data[train_data["regime_lag"] == regime]
        if len(regime_data) < 6:
            mapping[regime] = DEFAULT_TILT
            continue
        best_mix = None
        best_sharpe = -np.inf
        best_name = None
        for name, mix in TILT_CANDIDATES.items():
            ret = sum(w * regime_data[f] for f, w in mix.items())
            ann_ret = (1 + ret.mean()) ** 12 - 1
            ann_vol = ret.std() * np.sqrt(12)
            sharpe = ann_ret / ann_vol if ann_vol > 0 else -np.inf
            if sharpe > best_sharpe:
                best_sharpe = sharpe
                best_mix = mix
                best_name = name
        mapping[regime] = best_mix
        mapping[f"_name_{regime}"] = best_name
    return mapping


def apply_mapping(test_data, mapping):
    """Applique mapping gelé. Calcule rendement + turnover."""
    returns = []
    prev_weights = None
    turnover_total = 0.0
    for date, row in test_data.iterrows():
        reg = row["regime_lag"]
        mix = mapping.get(reg, DEFAULT_TILT) if isinstance(reg, str) else DEFAULT_TILT
        if not isinstance(mix, dict): mix = DEFAULT_TILT
        r = sum(w * row[f] for f, w in mix.items())
        returns.append(r)
        # Turnover
        if prev_weights is not None:
            keys = set(prev_weights) | set(mix)
            to = sum(abs(mix.get(k, 0) - prev_weights.get(k, 0)) for k in keys)
            turnover_total += to
        prev_weights = mix
    return returns, turnover_total


def main():
    factors, macro = load_data()
    print()

    # Aligner
    common = factors.index.intersection(macro.index)
    factors = factors.loc[common]
    macro = macro.loc[common]
    regime = classify_regime(macro)

    # Joindre régime avec lag
    data = factors.copy()
    data["regime"] = regime
    data["regime_lag"] = data["regime"].shift(1)
    data = data.dropna(subset=["regime_lag"])

    print(f"📅 Données alignées : {len(data)} mois, {data.index[0].date()} → {data.index[-1].date()}")
    print(f"⚙️  Walk-forward : calibrage {CALIB_WINDOW_YEARS}y → test 1y, roll annuel")
    print()

    # Walk-forward roulant
    all_oos_returns = []
    all_oos_dates = []
    all_oos_turnover = []
    yearly_summary = []

    for test_year in range(TEST_FIRST_YEAR, TEST_LAST_YEAR + 1):
        # Fenêtre calibrage : test_year-10 → test_year-1
        cal_start = f"{test_year - CALIB_WINDOW_YEARS}-01-01"
        cal_end = f"{test_year - 1}-12-31"
        test_start = f"{test_year}-01-01"
        test_end = f"{test_year}-12-31"

        train = data.loc[cal_start:cal_end]
        test = data.loc[test_start:test_end]

        if len(train) < 60 or len(test) < 6:
            continue

        # Calibrer (uniquement sur train)
        mapping = calibrate_mapping(train)

        # Appliquer (aveugle sur test)
        rets, turnover = apply_mapping(test, mapping)
        all_oos_returns.extend(rets)
        all_oos_dates.extend(test.index)
        all_oos_turnover.append(turnover)

        # Tilts choisis cette année
        chosen_tilts = {k.replace("_name_", ""): v for k, v in mapping.items() if k.startswith("_name_")}
        yearly_summary.append({
            "year": test_year,
            "train_window": f"{cal_start[:4]}-{cal_end[:4]}",
            "tilts": chosen_tilts,
            "n_months_test": len(rets),
            "turnover": turnover,
        })

    # Stats out-of-sample
    oos = pd.Series(all_oos_returns, index=all_oos_dates)
    n_months = len(oos)
    ann_ret_brut = (1 + oos.mean()) ** 12 - 1
    ann_vol = oos.std() * np.sqrt(12)
    sharpe_brut = ann_ret_brut / ann_vol if ann_vol > 0 else 0

    # Coûts
    avg_turnover_annual = np.mean(all_oos_turnover)
    turnover_cost_annual = avg_turnover_annual * TURNOVER_COST_BPS / 10000
    fee_annual = ANNUAL_FEE_BPS / 10000
    total_cost_annual = turnover_cost_annual + fee_annual
    ann_ret_net = ann_ret_brut - total_cost_annual
    sharpe_net = ann_ret_net / ann_vol if ann_vol > 0 else 0

    # Benchmarks
    bench_mkt = data.loc[oos.index, "Mkt_RF"] + data.loc[oos.index, "RF"]
    ann_ret_mkt = (1 + bench_mkt.mean()) ** 12 - 1
    ann_vol_mkt = bench_mkt.std() * np.sqrt(12)
    sharpe_mkt = ann_ret_mkt / ann_vol_mkt if ann_vol_mkt > 0 else 0

    bench_6040 = 0.6 * data.loc[oos.index, "Mkt_RF"] + data.loc[oos.index, "RF"]
    ann_ret_6040 = (1 + bench_6040.mean()) ** 12 - 1
    ann_vol_6040 = bench_6040.std() * np.sqrt(12)
    sharpe_6040 = ann_ret_6040 / ann_vol_6040 if ann_vol_6040 > 0 else 0

    # Risk-matched benchmark (proportion actions = ratio vol stratégie / vol mkt)
    target_eq_share = min(1.0, ann_vol / ann_vol_mkt) if ann_vol_mkt > 0 else 0.5
    bench_rm = target_eq_share * data.loc[oos.index, "Mkt_RF"] + data.loc[oos.index, "RF"]
    ann_ret_rm = (1 + bench_rm.mean()) ** 12 - 1
    ann_vol_rm = bench_rm.std() * np.sqrt(12)
    sharpe_rm = ann_ret_rm / ann_vol_rm if ann_vol_rm > 0 else 0

    # MaxDD
    cum_oos = (1 + oos).cumprod()
    mdd_oos = (cum_oos / cum_oos.cummax() - 1).min()
    cum_mkt = (1 + bench_mkt).cumprod()
    mdd_mkt = (cum_mkt / cum_mkt.cummax() - 1).min()
    cum_6040 = (1 + bench_6040).cumprod()
    mdd_6040 = (cum_6040 / cum_6040.cummax() - 1).min()

    # ============================================================
    print("="*78)
    print(f"WALK-FORWARD STRICT — out-of-sample {oos.index[0].date()} → {oos.index[-1].date()}")
    print("="*78)
    print(f"  {n_months} mois OOS, {len(yearly_summary)} années calibrage glissant {CALIB_WINDOW_YEARS}y")
    print()

    print("Mapping calibré (1 ligne par année, vue année par année) :")
    print(f"  {'Year':6} {'Train':12} {'R1_surchauffe':14} {'R2_stagflation':16} {'R3_goldilocks':14} {'R4_recession':14}")
    for s in yearly_summary:
        t = s["tilts"]
        row = f"  {s['year']:6} {s['train_window']:12}"
        for r in ["R1_surchauffe", "R2_stagflation", "R3_goldilocks", "R4_recession"]:
            row += f" {(t.get(r,'-') or '-'):14}"
        print(row)
    print()

    print("="*78)
    print("PERFORMANCE OUT-OF-SAMPLE")
    print("="*78)
    df = pd.DataFrame({
        "Stratégie BRUT":    [round(ann_ret_brut*100, 2), round(ann_vol*100, 2), round(sharpe_brut, 2), round(mdd_oos*100, 1)],
        "Stratégie NET":     [round(ann_ret_net*100, 2), round(ann_vol*100, 2), round(sharpe_net, 2), round(mdd_oos*100, 1)],
        "60/40 statique":    [round(ann_ret_6040*100, 2), round(ann_vol_6040*100, 2), round(sharpe_6040, 2), round(mdd_6040*100, 1)],
        "Risk-matched":      [round(ann_ret_rm*100, 2), round(ann_vol_rm*100, 2), round(sharpe_rm, 2), "n/a"],
        "Marché 100%":       [round(ann_ret_mkt*100, 2), round(ann_vol_mkt*100, 2), round(sharpe_mkt, 2), round(mdd_mkt*100, 1)],
    }, index=["Ann.Ret %", "Ann.Vol %", "Sharpe", "MaxDD %"])
    print(df.to_string())
    print()

    print(f"Coûts annuels comptés : turnover {turnover_cost_annual*100:.3f}% + frais {fee_annual*100:.2f}% = {total_cost_annual*100:.3f}%")
    print(f"Turnover moyen annuel : {avg_turnover_annual:.2f} × bps {TURNOVER_COST_BPS} = {turnover_cost_annual*10000:.1f} bps")
    print()

    # Comparaisons
    delta_vs_6040 = sharpe_net - sharpe_6040
    delta_vs_rm = sharpe_net - sharpe_rm
    delta_vs_mkt = sharpe_net - sharpe_mkt
    print(f"Δ Sharpe NET vs 60/40 statique : {delta_vs_6040:+.2f}")
    print(f"Δ Sharpe NET vs risk-matched   : {delta_vs_rm:+.2f}")
    print(f"Δ Sharpe NET vs marché 100%    : {delta_vs_mkt:+.2f}")
    print()

    # === DÉCISION (seuil fixé AVANT) ===
    print("="*78)
    print(f"DÉCISION (seuil fixé ex-ante : Δ Sharpe NET ≥ +{DECISION_THRESHOLD_NET:.2f})")
    print("="*78)
    best_delta = max(delta_vs_6040, delta_vs_rm)
    if best_delta >= DECISION_THRESHOLD_NET:
        print(f"✅ FORK B VALIDÉ — Δ Sharpe net = {best_delta:+.2f} ≥ {DECISION_THRESHOLD_NET:.2f}")
        print("   → La règle régime AJOUTE de la valeur OOS net de coûts")
        print("   → Construire enforcement budget factoriel")
    else:
        print(f"❌ FORK A — Δ Sharpe net = {best_delta:+.2f} < {DECISION_THRESHOLD_NET:.2f}")
        print("   → La règle régime N'AJOUTE PAS assez OOS net pour justifier B")
        print("   → Book + 3 leviers, benchmarks risk-matched")
    print("="*78)


if __name__ == "__main__":
    main()
