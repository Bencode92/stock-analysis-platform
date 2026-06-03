"""Audit d'orthogonalité des proxys de facteurs — AVANT de budgéter.

Objectif : ne pas répéter l'erreur GICS un cran plus haut. Si 2 proxys
sont corrélés > 0.70, ils mesurent le MÊME facteur (peu importe l'étiquette).
On fusionne ou on élimine avant de poser un budget.

Usage:
    cd /Users/benoit/stock-analysis-platform
    python3 scripts/factor_orthogonality_audit.py

Sortie : matrice de corrélation + liste des fusions à faire + facteurs propres survivants.
"""
import sys
import numpy as np
import pandas as pd

try:
    import yfinance as yf
except ImportError:
    print("python3 -m pip install yfinance pandas numpy")
    sys.exit(1)

# Candidats — 17 proxys initiaux que l'on va auditer
CANDIDATES = {
    # Growth / Tech
    "SOXX": "AI capex / semis",
    "QQQ":  "Tech broad (Nasdaq 100)",
    "BLOK": "Blockchain infra",
    # Quality / Defensive
    "QUAL": "Quality (suspect : peut-être tech déguisé)",
    "XLP":  "Consumer Staples défensif pur",
    "USMV": "Min Vol US",
    # Value / Cycle
    "IWN":  "Small Value",
    "VLUE": "Value Factor large cap",
    # Commodités / Energy / Materials
    "XLE":  "Energy",
    "XME":  "Metals & Mining",
    "GLD":  "Gold (real assets)",
    # International / EM
    "VEA":  "International Developed (hedge USD)",
    "EEM":  "Emerging Markets broad",
    "INDA": "India (sous-pondération EM)",
    # Bonds
    "IEF":  "Treasury 7-10y (duration)",
    "LQD":  "IG Corporate (credit spread)",
    "TIP":  "TIPS (inflation ou duration?)",
    "VNQ":  "REITs (rate-sensitive yield)",
}

LOOKBACK = "5y"
FUSION_THRESHOLD = 0.70  # > 0.70 = même facteur, fusionner


def fetch():
    tickers = list(CANDIDATES.keys())
    raw = yf.download(tickers, period=LOOKBACK, auto_adjust=True, progress=False)
    px = raw["Close"] if "Close" in raw.columns.get_level_values(0) else raw
    return px.dropna()


def main():
    print("="*72)
    print(f"AUDIT ORTHOGONALITÉ — {len(CANDIDATES)} proxys candidats")
    print("="*72)
    px = fetch()
    rets = px.pct_change().dropna()
    print(f"Historique : {len(rets)} jours, depuis {rets.index[0].date()}")
    print()

    # 1) Matrice de corrélation
    corr = rets.corr()
    print("[Matrice de corrélation] (formats lisibles)")
    print(corr.round(2).to_string())
    print()

    # 2) Paires à fusionner (> seuil)
    print(f"[Paires redondantes — corrélation > {FUSION_THRESHOLD}]")
    pairs = []
    for i in corr.columns:
        for j in corr.columns:
            if i < j and corr.loc[i, j] > FUSION_THRESHOLD:
                pairs.append((corr.loc[i, j], i, j))
    pairs.sort(reverse=True)
    if not pairs:
        print("  Aucune — tous les proxys sont orthogonaux ✓")
    else:
        for c, i, j in pairs:
            print(f"  {c:.2f}  {i:5} ⇆ {j:5}   ({CANDIDATES[i]}  /  {CANDIDATES[j]})")
    print()

    # 3) Clustering : qui colle à qui
    print("[Clusters dérivés (chaque proxy à son groupe de corrélation maximale)]")
    from scipy.cluster.hierarchy import linkage, fcluster
    from scipy.spatial.distance import squareform
    dist = 1 - corr
    np.fill_diagonal(dist.values, 0)
    cond = squareform(dist.values, checks=False)
    Z = linkage(cond, method="average")
    labels = fcluster(Z, t=1 - FUSION_THRESHOLD, criterion="distance")
    clusters = {}
    for tk, lab in zip(corr.columns, labels):
        clusters.setdefault(int(lab), []).append(tk)
    for lab, members in sorted(clusters.items(), key=lambda x: -len(x[1])):
        if len(members) == 1:
            print(f"  Cluster {lab} (solo) : {members[0]:5}  → {CANDIDATES[members[0]]}")
        else:
            print(f"  Cluster {lab}        : {members}  ← FUSIONNER en 1 facteur")
    print()

    # 4) PCA — combien de vraies dimensions ?
    print("[PCA : variance expliquée par facteurs orthogonaux]")
    lam = np.sort(np.linalg.eigvalsh(rets.cov().values * 252))[::-1]
    total = lam.sum()
    cum = 0
    for i, l in enumerate(lam):
        cum += l / total
        marker = "  ← 80% atteint" if (cum >= 0.80 and (cum - l/total) < 0.80) else ""
        if i < 8:
            print(f"  PC{i+1}: {l/total*100:5.1f}%  (cumul {cum*100:5.1f}%){marker}")

    # 5) Recommandation factor list
    print()
    print("="*72)
    print("RECOMMANDATION : facteurs propres survivants")
    print("="*72)
    propres = []
    visited = set()
    for lab, members in sorted(clusters.items(), key=lambda x: -len(x[1])):
        if any(m in visited for m in members):
            continue
        # Choisir le proxy le plus liquide / représentatif
        # Heuristique : ticker le plus court ou le plus standard
        rep = sorted(members, key=lambda x: (len(x), x))[0]
        propres.append((rep, members))
        for m in members:
            visited.add(m)
    for rep, members in propres:
        if len(members) == 1:
            print(f"  ✓ {rep:5} → {CANDIDATES[rep]}")
        else:
            others = [m for m in members if m != rep]
            print(f"  ✓ {rep:5} → {CANDIDATES[rep]}   (absorbe : {others})")
    print(f"\n→ {len(propres)} facteurs propres (vs {len(CANDIDATES)} candidats)")


if __name__ == "__main__":
    main()
