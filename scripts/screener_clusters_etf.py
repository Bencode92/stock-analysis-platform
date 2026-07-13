"""
Screener de clustering ETF — étapes 1-3 du framework thématique
================================================================
Pipeline :
  1. Filtres d'exécutabilité (métadonnées fournies par CSV : UCITS, AUM,
     TER, âge, réplication) — colonnes absentes = filtre ignoré + warning
  2. Fetch prix hebdo (Twelve Data, fallback yfinance), 10 ans max
  3. Filtre de redondance : rho(x, COEUR) — étiquette, n'élimine PAS
     (un cluster redondant reste visible, il est juste marqué)
  4. Clustering hiérarchique (average linkage, distance = 1 - rho)
  5. Représentant par cluster : TER min, tie-break AUM max puis historique

Entrée  : univers.csv avec au minimum une colonne `ticker`.
          Colonnes optionnelles : ter, aum_meur, ucits (0/1), age_annees,
          replication (physical/synthetic), nom
Sortie  : clusters_etf.csv (1 ligne par ETF survivant, colonne cluster,
          rho_vs_coeur, representant 0/1) + résumé console par cluster.

Usage :
  export TWELVE_DATA_KEY=...   # sinon fallback yfinance automatique
  python screener_clusters_etf.py univers.csv --coeur VWCE.DE \\
         --rho-redondance 0.85 --seuil-cluster 0.35

Dépendances : pip install pandas numpy scipy scikit-learn requests yfinance

Origine : livré par expert externe (Fabre) 2026-07-09 dans le cadre
du framework thématique doctrinal v6.10 (clustering, pas timing).
"""

import argparse
import os
import sys
import time

import numpy as np
import pandas as pd
import requests
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform
from sklearn.covariance import LedoitWolf

# Support double naming : TWELVE_DATA_KEY (Fabre) et TWELVE_DATA_API (convention repo)
TD_KEY = os.environ.get("TWELVE_DATA_KEY", "") or os.environ.get("TWELVE_DATA_API", "")
TD_URL = "https://api.twelvedata.com/time_series"
PAUSE_S = 0.35          # ~170 req/min, marge sous les limites du plan Ultra
MIN_ANNEES_HISTO = 3.0  # en-deçà : corrélation non mesurable + biais hype
MIN_SEMAINES_COMMUNES = 130  # ~2.5 ans de chevauchement avec le cœur

# ----------------------------------------------------------------------
# ÉTAPE 1 — FILTRES D'EXÉCUTABILITÉ (sur métadonnées CSV)
# ----------------------------------------------------------------------
def filtres_executabilite(meta: pd.DataFrame) -> pd.DataFrame:
    n0 = len(meta)
    regles = [
        ("ucits",       lambda d: d["ucits"] == 1,          "non-UCITS"),
        ("aum_meur",    lambda d: d["aum_meur"] >= 100,     "AUM < 100 MEUR"),
        ("ter",         lambda d: d["ter"] <= 0.60,         "TER > 0.60%"),
        ("age_annees",  lambda d: d["age_annees"] >= MIN_ANNEES_HISTO,
                        f"âge < {MIN_ANNEES_HISTO} ans"),
    ]
    for col, regle, label in regles:
        if col in meta.columns:
            avant = len(meta)
            meta = meta[regle(meta)]
            print(f"  filtre {label:<18}: -{avant - len(meta)}")
        else:
            print(f"  [WARN] colonne '{col}' absente -> filtre '{label}' ignoré")
    print(f"  Univers : {n0} -> {len(meta)}")
    return meta

# ----------------------------------------------------------------------
# ÉTAPE 2 — PRIX HEBDO
# ----------------------------------------------------------------------
def fetch_twelvedata(ticker: str):
    try:
        r = requests.get(TD_URL, params={
            "symbol": ticker, "interval": "1week", "outputsize": 520,
            "apikey": TD_KEY, "order": "asc"}, timeout=15)
        js = r.json()
        if js.get("status") == "error" or "values" not in js:
            return None
        df = pd.DataFrame(js["values"])
        s = pd.Series(df["close"].astype(float).values,
                      index=pd.to_datetime(df["datetime"]), name=ticker)
        return s[~s.index.duplicated()]
    except Exception:
        return None

def fetch_yfinance(ticker: str):
    try:
        import yfinance as yf
        px = yf.download(ticker, period="10y", interval="1wk",
                         auto_adjust=True, progress=False)["Close"]
        if isinstance(px, pd.DataFrame):
            px = px.iloc[:, 0]
        px.name = ticker
        return px.dropna() if len(px.dropna()) else None
    except Exception:
        return None

def charger_prix(tickers):
    series, rates = [], []
    for i, t in enumerate(tickers, 1):
        s = fetch_twelvedata(t) if TD_KEY else None
        if s is None:
            s = fetch_yfinance(t)
        if s is not None and len(s) >= MIN_SEMAINES_COMMUNES:
            series.append(s)
        else:
            rates.append(t)
        if TD_KEY:
            time.sleep(PAUSE_S)
        if i % 50 == 0:
            print(f"  ... {i}/{len(tickers)} fetchés ({len(rates)} rejetés)")
    if rates:
        print(f"  [INFO] {len(rates)} tickers sans historique suffisant "
              f"(exclus, anti-hype par construction) : {rates[:15]}"
              f"{' ...' if len(rates) > 15 else ''}")
    return pd.concat(series, axis=1)

# ----------------------------------------------------------------------
# ÉTAPES 3-4 — CORRÉLATION, REDONDANCE, CLUSTERING
# ----------------------------------------------------------------------
def matrice_corr(px: pd.DataFrame):
    """Corrélation pairwise robuste aux NaN internes.

    FIX 2026-07-11 : Ledoit-Wolf exige matrice sans NaN → dropna(how="any")
    tirait l'intersection commune à 34 semaines à cause d'un seul ticker
    aux trous internes. Résultat : 173 clusters sur 175 tickers.

    Solution : pd.DataFrame.corr(min_periods=130) calcule chaque paire sur
    son overlap propre. On perd le shrinkage Ledoit-Wolf mais on gagne un
    clustering exploitable. Le shrinkage restait de toute façon marginal
    sur ~200 tickers × 260 semaines.
    """
    rets = np.log(px / px.shift(1))
    # Filtrer les colonnes avec très peu de données (< 130 valeurs non-NaN)
    coverage = rets.notna().sum()
    keep = coverage[coverage >= MIN_SEMAINES_COMMUNES].index
    rets = rets[keep]
    print(f"  [DEBUG] {len(keep)} tickers avec >= {MIN_SEMAINES_COMMUNES} semaines de returns")

    # Corrélation pairwise (chaque paire sur son overlap propre)
    corr = rets.corr(min_periods=MIN_SEMAINES_COMMUNES)
    # Paires sans overlap suffisant → NaN. On les met à 0 (pas d'info = neutre).
    n_nan = corr.isna().sum().sum()
    if n_nan > 0:
        print(f"  [DEBUG] {n_nan} paires (sur {len(corr)**2}) sans overlap suffisant → mises à 0")
    corr = corr.fillna(0).clip(-1, 1)
    return corr, rets

def clusteriser(corr: pd.DataFrame, coeur: str, seuil: float) -> pd.Series:
    dist = 1.0 - corr.values
    np.fill_diagonal(dist, 0.0)
    Z = linkage(squareform(dist, checks=False), method="average")
    labels = fcluster(Z, t=seuil, criterion="distance")
    return pd.Series(labels, index=corr.columns, name="cluster")

def choisir_representants(res: pd.DataFrame) -> pd.DataFrame:
    res["representant"] = 0
    for c, grp in res.groupby("cluster"):
        g = grp.copy()
        for col, asc in [("ter", True), ("aum_meur", False),
                         ("nb_semaines", False)]:
            if col in g.columns and g[col].notna().any():
                g = g.sort_values(col, ascending=asc, kind="stable")
        res.loc[g.index[0], "representant"] = 1
    return res

# ----------------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("univers_csv")
    ap.add_argument("--coeur", default="VWCE.DE")
    ap.add_argument("--rho-redondance", type=float, default=0.85)
    ap.add_argument("--seuil-cluster", type=float, default=0.35,
                    help="distance 1-rho de coupe (0.35 <=> rho intra ~0.65)")
    ap.add_argument("--out", default="clusters_etf.csv")
    args = ap.parse_args()

    meta = pd.read_csv(args.univers_csv)
    if "ticker" not in meta.columns:
        sys.exit("Le CSV doit contenir une colonne 'ticker'.")
    meta = meta.drop_duplicates("ticker").set_index("ticker")

    print("=== ÉTAPE 1 : filtres d'exécutabilité ===")
    meta = filtres_executabilite(meta)

    tickers = list(dict.fromkeys([args.coeur] + meta.index.tolist()))
    print(f"\n=== ÉTAPE 2 : fetch prix hebdo ({len(tickers)} tickers) ===")
    px = charger_prix(tickers)
    if args.coeur not in px.columns:
        sys.exit(f"Cœur {args.coeur} introuvable dans les prix — abandon.")

    print("\n=== ÉTAPES 3-4 : corrélations + clustering ===")
    corr, rets = matrice_corr(px)
    clusters = clusteriser(corr, args.coeur, args.seuil_cluster)

    res = pd.DataFrame({
        "cluster": clusters,
        "rho_vs_coeur": corr[args.coeur].round(3),
        "nb_semaines": rets.notna().sum(),
    })
    res["redondant_coeur"] = (res["rho_vs_coeur"] >= args.rho_redondance).astype(int)
    res = res.join(meta, how="left")
    res = choisir_representants(res)
    res = res.sort_values(["cluster", "representant"],
                          ascending=[True, False])
    res.to_csv(args.out)

    print(f"\n{res['cluster'].nunique()} clusters sur {len(res)} ETF "
          f"(prédiction : ~10-15 clusters réels)")
    print(f"Cluster du cœur ({args.coeur}) : {clusters[args.coeur]} — tout "
          "ce cluster est du bêta déguisé.\n")
    for c, grp in res.groupby("cluster"):
        rep = grp[grp["representant"] == 1].index[0]
        tag = " [REDONDANT CŒUR]" if grp["redondant_coeur"].all() else ""
        print(f"Cluster {c:>2} ({len(grp):>3} ETF){tag}  "
              f"rho_coeur médian {grp['rho_vs_coeur'].median():+.2f}  "
              f"-> représentant : {rep}")
    print(f"\nDétail complet : {args.out}")
    print("""
Limites (à garder devant les yeux) :
- Corrélations LONG TERME : elles convergent vers 1 en crise. Un cluster
  'diversifiant' peut fusionner avec le cœur en stress.
- Les ETF < 3 ans sont exclus : anti-hype assumé, thèmes émergents ratés
  par construction.
- Le seuil de coupe (0.35) est un jugement : fais varier 0.25-0.45 et
  vérifie la stabilité des clusters avant de graver quoi que ce soit.
- Ledoit-Wolf sur ~500 tickers x 400 semaines : le shrinkage est fort,
  les rho extrêmes sont tirés vers la moyenne — c'est voulu (anti-bruit).
""")

if __name__ == "__main__":
    main()
