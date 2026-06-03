"""Audit d'orthogonalité v2 — SUR LES RÉSIDUS, pas sur le brut.

Correction Claude : "Corrélé ≠ redondant. PC1=60% est le bêta marché long-only,
pas un signal de fusion. Il faut orthogonaliser : retirer le bêta marché, regarder
ce qui reste. Value-resid, momentum-resid, EM-resid ré-émergent comme distincts."

Pipeline :
  1) market_ret = ACWI (proxy facteur commun) — le "bouton niveau"
  2) Pour chaque autre proxy : résidu = OLS(proxy ~ market_ret)
  3) Re-corrélations SUR LES RÉSIDUS
  4) Clusters sur résidus → vrais facteurs de STYLE orthogonaux

Usage:
    cd /Users/benoit/stock-analysis-platform
    python3 scripts/factor_orthogonality_audit_v2.py
"""
import sys
import numpy as np
import pandas as pd

try:
    import yfinance as yf
    import statsmodels.api as sm
except ImportError:
    print("python3 -m pip install yfinance pandas numpy statsmodels scipy")
    sys.exit(1)

# Univers candidate. ACWI = facteur marché commun.
CANDIDATES = {
    "ACWI": "Bêta marché (LE facteur commun)",
    # Growth / Tech
    "SOXX": "AI capex / semis",
    "QQQ":  "Tech broad",
    "MTUM": "Momentum factor",
    "BLOK": "Blockchain infra",
    # Quality / Defensive
    "QUAL": "Quality Factor",
    "XLP":  "Consumer Staples",
    "USMV": "Min Vol US",
    # Value
    "IWN":  "Small Value",
    "VLUE": "Value Factor",
    # Commodités
    "XLE":  "Energy",
    "XME":  "Metals & Mining",
    "GLD":  "Gold",
    # International / EM
    "VEA":  "International Developed",
    "EEM":  "Emerging Markets",
    "INDA": "India",
    # Bonds
    "IEF":  "Treasury 7-10y (duration)",
    "LQD":  "IG Corporate (credit)",
    "TIP":  "TIPS (inflation)",
    "VNQ":  "REITs",
}

LOOKBACK = "5y"
MARKET_PROXY = "ACWI"
FUSION_THRESHOLD = 0.70


def orthogonalize(factor_ret, market_ret):
    """Retire le bêta marché. Le résidu = facteur de style PUR."""
    aligned = pd.concat([factor_ret, market_ret], axis=1).dropna()
    if len(aligned) < 50:
        return None
    y = aligned.iloc[:, 0]
    X = sm.add_constant(aligned.iloc[:, 1])
    return sm.OLS(y, X).fit().resid


def cluster(corr, threshold=FUSION_THRESHOLD):
    from scipy.cluster.hierarchy import linkage, fcluster
    from scipy.spatial.distance import squareform
    dist = 1 - corr
    np.fill_diagonal(dist.values, 0)
    cond = squareform(dist.values, checks=False)
    Z = linkage(cond, method="average")
    labels = fcluster(Z, t=1-threshold, criterion="distance")
    clusters = {}
    for tk, lab in zip(corr.columns, labels):
        clusters.setdefault(int(lab), []).append(tk)
    return clusters


def main():
    print("="*72)
    print(f"AUDIT v2 — orthogonalisation SUR LES RÉSIDUS vs {MARKET_PROXY}")
    print("="*72)
    tickers = list(CANDIDATES.keys())
    raw = yf.download(tickers, period=LOOKBACK, auto_adjust=True, progress=False)
    px = raw["Close"] if "Close" in raw.columns.get_level_values(0) else raw
    px = px.dropna()
    rets = px.pct_change().dropna()
    print(f"Historique : {len(rets)} jours, depuis {rets.index[0].date()}")
    print()

    market = rets[MARKET_PROXY]

    # === STEP 1 : Corrélation BRUTE (rappel — l'erreur précédente) ===
    print("="*72)
    print("STEP 1 — Corrélation BRUTE (rappel : ce qui m'a induit en erreur)")
    print("="*72)
    corr_raw = rets.corr()
    clusters_raw = cluster(corr_raw)
    print(f"\n[Clusters BRUTS (corr > {FUSION_THRESHOLD})] — apparente concentration extrême :")
    for lab, members in sorted(clusters_raw.items(), key=lambda x: -len(x[1])):
        if len(members) > 1:
            print(f"  {len(members):2d} proxys → {members}")
    pcs_raw = np.sort(np.linalg.eigvalsh(rets.cov().values * 252))[::-1]
    print(f"\nPC1 brut = {pcs_raw[0]/pcs_raw.sum()*100:.1f}%  ← signal trompeur (bêta marché long-only)")
    print()

    # === STEP 2 : Calcul des résidus ===
    print("="*72)
    print("STEP 2 — Orthogonalisation vs marché (ACWI)")
    print("="*72)
    residuals = {MARKET_PROXY: market}
    r2_vs_market = {}
    for tk in tickers:
        if tk == MARKET_PROXY:
            continue
        res = orthogonalize(rets[tk], market)
        if res is None:
            continue
        residuals[tk] = res
        # R² vs marché : fraction de variance expliquée par marché
        var_total = rets[tk].var()
        var_resid = res.var()
        r2 = 1 - var_resid / var_total
        r2_vs_market[tk] = r2

    print("\n[Charge sur le marché — R² de chaque proxy vs ACWI] :")
    print("(plus R² est haut, plus le proxy est juste un 'amplificateur marché')")
    print()
    for tk, r2 in sorted(r2_vs_market.items(), key=lambda x: -x[1]):
        bar = "█" * int(r2 * 30)
        marker = "← surtout marché" if r2 > 0.80 else "← style propre" if r2 < 0.40 else ""
        print(f"  {tk:5} R²={r2*100:5.1f}%  {bar}  {marker}")
    print()

    # === STEP 3 : Corrélation SUR LES RÉSIDUS ===
    print("="*72)
    print("STEP 3 — Corrélation SUR LES RÉSIDUS (les vrais facteurs de style)")
    print("="*72)
    resid_df = pd.DataFrame(residuals)
    resid_no_market = resid_df.drop(columns=[MARKET_PROXY])
    corr_resid = resid_no_market.corr()

    print("\n[Matrice corrélation des RÉSIDUS] (arrondi) :")
    print(corr_resid.round(2).to_string())
    print()

    print(f"[Paires redondantes APRÈS orthogonalisation — corr résidus > {FUSION_THRESHOLD}]")
    pairs = []
    for i in corr_resid.columns:
        for j in corr_resid.columns:
            if i < j and corr_resid.loc[i, j] > FUSION_THRESHOLD:
                pairs.append((corr_resid.loc[i, j], i, j))
    pairs.sort(reverse=True)
    if not pairs:
        print("  Aucune — tous les facteurs sont orthogonaux ✓")
    else:
        for c, i, j in pairs:
            print(f"  {c:.2f}  {i:5} ⇆ {j:5}   ({CANDIDATES[i]}  /  {CANDIDATES[j]})")
    print()

    # === STEP 4 : Clusters sur résidus ===
    print("="*72)
    print("STEP 4 — Clusters SUR LES RÉSIDUS")
    print("="*72)
    clusters_resid = cluster(corr_resid)
    for lab, members in sorted(clusters_resid.items(), key=lambda x: -len(x[1])):
        if len(members) == 1:
            print(f"  ✓ {members[0]:5} (solo)  → {CANDIDATES[members[0]]}")
        else:
            print(f"  ⚠ FUSION  : {members}")
            for m in members: print(f"             {m:5} = {CANDIDATES[m]}")
    print()

    # === STEP 5 : PCA sur résidus ===
    print("="*72)
    print("STEP 5 — PCA sur résidus (vraie distribution de variance)")
    print("="*72)
    lam_resid = np.sort(np.linalg.eigvalsh(resid_no_market.cov().values * 252))[::-1]
    total = lam_resid.sum()
    cum = 0
    for i, l in enumerate(lam_resid[:10]):
        cum += l / total
        marker = "  ← 80% atteint" if (cum >= 0.80 and (cum - l/total) < 0.80) else ""
        print(f"  PC{i+1}: {l/total*100:5.1f}%  (cumul {cum*100:5.1f}%){marker}")
    print()

    # === Conclusion : facteurs propres ===
    print("="*72)
    print("CONCLUSION — Facteurs propres survivants")
    print("="*72)
    print(f"\n  1 facteur MARCHÉ commun : {MARKET_PROXY}  (le 'bouton niveau' qui diff Agr/Mod par degré)")
    survivors = []
    visited = set()
    for lab, members in sorted(clusters_resid.items(), key=lambda x: -len(x[1])):
        if any(m in visited for m in members):
            continue
        rep = sorted(members, key=lambda x: (len(x), x))[0]
        survivors.append((rep, members))
        for m in members:
            visited.add(m)
    print(f"  + {len(survivors)} facteurs de STYLE orthogonalisés vs marché :")
    for rep, members in survivors:
        if len(members) == 1:
            print(f"     ✓ {rep:5} → {CANDIDATES[rep]}")
        else:
            others = [m for m in members if m != rep]
            print(f"     ✓ {rep:5} → {CANDIDATES[rep]}   (absorbe : {others})")
    print(f"\n  = TOTAL {1 + len(survivors)} facteurs orthogonaux")
    print(f"\n  Différenciation Agr/Mod : par bêta-{MARKET_PROXY} + tilt de style (PAS long/short)")


if __name__ == "__main__":
    main()
