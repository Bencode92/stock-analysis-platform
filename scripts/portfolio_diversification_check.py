"""Diagnostic de diversification — DR Choueifaty + PC1 + stress test.

Usage:
    cd /Users/benoit/stock-analysis-platform
    python3 scripts/portfolio_diversification_check.py
    # Ou avec un fichier précis :
    python3 scripts/portfolio_diversification_check.py /path/to/portfolios.json

Mesure 3 chiffres assumption-light qui survivent à n'importe quel risk manager :
  1. DR Choueifaty       (paris effectifs, robuste long-only)
  2. PC1 share           (% variance porté par le facteur dominant)
  3. Stress 2022 hike    (perf réalisée Jan-Oct 2022, choc taux)

Requiert : pip install yfinance pandas numpy scipy
"""
import json, sys, glob, os, re
from pathlib import Path
import numpy as np
import pandas as pd

try:
    import yfinance as yf
except ImportError:
    print("Install : python3 -m pip install yfinance")
    sys.exit(1)

# Mapping ticker → Yahoo (suffixes marché)
YAHOO_SUFFIX = {
    # Europe
    "GALP": ".LS", "ITX": ".MC", "NTGY": ".MC", "CS": ".PA",
    "SCHP": ".SW", "NOVN": ".SW", "ROG": ".SW", "ABBN": ".SW",
    "BMED": ".MI", "REC": ".MI", "RACE": ".MI",
    "BVI": ".PA", "VIE": ".PA", "BNP": ".PA",
    # India
    "LUPIN": ".NS", "HEROMOTOCO": ".NS", "INFY": ".NS", "TCS": ".NS",
    "CUMMINSIND": ".NS", "BAJAJ-AUTO": ".NS",
    # Korea (numerical)
    "000660": ".KS", "005935": ".KS", "005930": ".KS",
    # Taiwan
    "2059": ".TW", "2330": ".TW", "2345": ".TW", "3443": ".TW",
    "3653": ".TW", "6669": ".TW", "5274": ".TWO",
}

def to_yahoo(ticker):
    """Convertit ticker projet → ticker Yahoo (avec suffix si besoin)."""
    if not ticker: return None
    tk = ticker.strip().upper()
    if tk in YAHOO_SUFFIX:
        return tk + YAHOO_SUFFIX[tk]
    return tk

def find_latest_portfolio():
    """Trouve portfolios.json le plus récent."""
    candidates = []
    if os.path.exists("data/portfolios.json"):
        candidates.append("data/portfolios.json")
    candidates.extend(sorted(glob.glob("data/portfolio_history/portfolios_v4_*.json")))
    return candidates[-1] if candidates else None

def load_portfolio(path):
    """Charge portfolios.json (format simple ou format v4) et retourne
    {profile: {yahoo_ticker: weight}}."""
    d = json.load(open(path))
    if "portfolios" in d:
        d = d["portfolios"]
    result = {}
    for prof in ["Agressif", "Modéré", "Stable"]:
        p = d.get(prof, {})
        weights = {}
        # Format A : _tickers_meta (portfolios.json simple)
        meta = p.get("_tickers_meta") or {}
        if meta:
            for tk, m in meta.items():
                y = to_yahoo(tk)
                if y:
                    weights[y] = (m.get("weight") or 0)
        # Format B : allocation + assets[] (portfolios_v4_*.json)
        if not weights:
            alloc = p.get("allocation") or {}
            assets = p.get("assets") or []
            id_to_ticker = {}
            for a in assets:
                if isinstance(a, str):
                    id_m = re.search(r"id='([^']+)'", a)
                    tk_m = re.search(r"ticker='([^']+)'", a)
                    sym_m = re.search(r"symbol='([^']+)'", a)
                    if id_m:
                        tk = (tk_m.group(1) if tk_m else (sym_m.group(1) if sym_m else id_m.group(1)))
                        id_to_ticker[id_m.group(1)] = tk
            for key, w in alloc.items():
                # key peut être EQ_X (action) ou nom complet (ETF/bond)
                if key in id_to_ticker:
                    tk = id_to_ticker[key]
                else:
                    # ETF/bond : nom complet → match Yahoo via symbol si extractible
                    tk = key
                    # Cherche dans assets si match par name
                    for a in assets:
                        if isinstance(a, str) and f"name='{key}'" in a:
                            tkm = re.search(r"ticker='([^']+)'", a)
                            sym = re.search(r"symbol='([^']+)'", a)
                            if tkm or sym:
                                tk = (tkm.group(1) if tkm else sym.group(1))
                            break
                w_frac = (w/100.0) if w > 1 else w  # alloc en %, convert en fraction
                y = to_yahoo(tk)
                if y:
                    weights[y] = weights.get(y, 0) + w_frac
        if weights:
            result[prof] = weights
    return result

def diversification_ratio(w_dict, returns):
    cols = list(returns.columns)
    w = np.array([w_dict[t] for t in cols]); w = w / w.sum()
    cov = returns.cov().values * 252
    vols = np.sqrt(np.diag(cov))
    port_vol = np.sqrt(w @ cov @ w)
    dr = float((w @ vols) / port_vol)
    return dr, dr ** 2, port_vol, float(w @ vols)

def top_pc_share(returns, k=3):
    lam = np.sort(np.linalg.eigvalsh(returns.cov().values))[::-1]
    return [float(l / lam.sum()) for l in lam[:k]]

STRESS = {
    "2022 hike (Jan-Oct)":   ("2022-01-03", "2022-10-14"),
    "Pull-back 2025":        ("2025-01-02", "2025-04-30"),
}

def analyse(name, weights):
    print("\n" + "="*72)
    print(f"PROFIL {name}  —  {len(weights)} positions")
    print("="*72)
    tickers = list(weights.keys())
    raw = yf.download(tickers, period="5y", auto_adjust=True, progress=False)
    px = raw["Close"] if "Close" in raw.columns.get_level_values(0) else raw
    avail = [t for t in tickers if t in px.columns and px[t].notna().sum() > 100]
    missing = [t for t in tickers if t not in avail]
    if missing:
        print(f"[!] Ignorés (pas de prix Yahoo) : {missing}")
    if len(avail) < 3:
        print("[!] Trop peu de tickers → skip"); return
    px = px[avail].dropna()
    rets = px.pct_change().dropna()
    w = {t: weights[t] for t in avail}
    w = {t: v/sum(w.values()) for t, v in w.items()}

    # DR Choueifaty
    dr, dr2, pvol, wvol = diversification_ratio(w, rets)
    print(f"\n[Choueifaty Diversification Ratio]")
    print(f"  Σ wᵢσᵢ (vol pondérée des positions) = {wvol*100:5.1f}%")
    print(f"  σ portefeuille                       = {pvol*100:5.1f}%")
    print(f"  DR  = {dr:.2f}    DR² = {dr2:.1f} paris effectifs ({dr2/len(avail)*100:.0f}% de {len(avail)} lignes)")

    verdict = "❌ TRÈS CONCENTRÉ" if dr2/len(avail) < 0.20 else "⚠️ moyen" if dr2/len(avail) < 0.40 else "✅ diversifié"
    print(f"  → {verdict}")

    # PC1
    pcs = top_pc_share(rets)
    print(f"\n[Variance par composante principale]")
    print(f"  PC1 = {pcs[0]*100:5.1f}%  PC2 = {pcs[1]*100:5.1f}%  PC3 = {pcs[2]*100:5.1f}%")
    if pcs[0] > 0.45:
        print(f"  → ❌ Facteur dominant fort (>{pcs[0]*100:.0f}%)")
    elif pcs[0] > 0.30:
        print(f"  → ⚠️ Facteur dominant modéré")
    else:
        print(f"  → ✅ Pas de facteur dominant")

    # Stress
    port = (rets * pd.Series(w)).sum(axis=1)
    print(f"\n[Stress historiques]")
    for label, (start, end) in STRESS.items():
        try:
            s = port.loc[start:end]
            if len(s) > 1:
                c = (1 + s).prod() - 1
                mdd = ((1+s).cumprod() / (1+s).cumprod().cummax() - 1).min()
                print(f"  {label:22s}: {c*100:+6.1f}%  MDD {mdd*100:5.1f}%")
            else:
                print(f"  {label:22s}: pas de données")
        except Exception as e:
            print(f"  {label:22s}: {e}")

    # Risque global 5y
    vol = port.std() * np.sqrt(252)
    ret_ann = (1+port.mean())**252 - 1
    sharpe = (ret_ann - 0.04) / vol if vol else 0
    cum = (1 + port).cumprod()
    mdd = (cum / cum.cummax() - 1).min()
    print(f"\n[Risque 5y]  Vol={vol*100:.1f}%  Perf={ret_ann*100:+.1f}%  Sharpe={sharpe:.2f}  MaxDD={mdd*100:.1f}%")


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else find_latest_portfolio()
    if not path or not os.path.exists(path):
        print(f"Fichier portefeuille introuvable. Cherché : data/portfolios.json"); sys.exit(1)
    print(f"📂 Chargement : {path}")
    portfolios = load_portfolio(path)
    if not portfolios:
        print("Aucun profil trouvé (Agressif/Modéré/Stable)"); sys.exit(1)
    for name, w in portfolios.items():
        analyse(name, w)
    print("\n" + "="*72)
    print("Triangulation : DR + PC1 + stress 2022 = vérité robuste.")
    print("="*72)


if __name__ == "__main__":
    main()
