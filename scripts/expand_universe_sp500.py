"""Tirage aléatoire d'un échantillon S&P 500 — Étape (D) (2026-06-19).

Source : S&P 500 (constituents Wikipedia, fetched 2026-06-19, ~470 tickers visibles).
Tirage : 200 stocks random avec seed=42 (figée), exclus les 50 stocks labo existants.

Engagement (PREDECLARATION_BACKTEST_D.md) :
- seed=42 UNIQUE, jamais re-tirée
- Si homogénéité du tirage ≥ 15% → switch Russell 3000, pas re-tirer
- Composition sectorielle mesurée APRÈS fetch (sector dans payload TD)

Output : data/fundamentals_history/derived/sp500_sample_200.json
"""

import json
import random
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DERIVED_DIR = PROJECT_ROOT / "data" / "fundamentals_history" / "derived"

# ─── Liste S&P 500 (extraite Wikipedia 2026-06-19) ──────────────────────────
SP500_TICKERS = [
    # A-C
    "MMM","AOS","ABT","ABBV","ACN","ADBE","AMD","AES","AFL","A","APD","ABNB","AKAM",
    "ALB","ARE","ALGN","ALLE","LNT","ALL","GOOGL","GOOG","MO","AMZN","AMCR","AEE",
    "AEP","AXP","AIG","AMT","AWK","AMP","AME","AMGN","APH","ADI","AON","APA","APO",
    "AAPL","AMAT","APP","APTV","ACGL","ADM","ARES","ANET","AJG","AIZ","T","ATO",
    "ADSK","ADP","AZO","AVB","AVY","AXON","BKR","BALL","BAC","BAX","BDX","BRK.B",
    "BBY","TECH","BIIB","BLK","BX","XYZ","BNY","BA","BKNG","BSX","BMY","AVGO","BR",
    "BRO","BF.B","BLDR","BG","BXP","CHRW","CDNS","CPT","CPB","COF","CAH","CCL",
    "CARR","CVNA","CASY","CAT","CBOE","CBRE","CDW","COR","CNC","CNP","CF","CRL",
    "SCHW","CHTR","CVX","CMG","CB","CHD","CIEN","CI","CINF","CTAS","CSCO","C",
    "CFG","CLX","CME","CMS","KO","CTSH","COHR","COIN","CL","CMCSA","FIX","CAG",
    "COP","ED","STZ","CEG","COO","CPRT","GLW","CPAY","CTVA","CSGP","COST","CRH",
    "CRWD","CCI","CSX","CMI","CVS",
    # D-F
    "DHR","DRI","DDOG","DVA","DECK","DE","DELL","DAL","DVN","DXCM","FANG","DLR",
    "DG","DLTR","D","DPZ","DASH","DOV","DOW","DHI","DTE","DUK","DD","ETN","EBAY",
    "SATS","ECL","EIX","EW","EA","ELV","EME","EMR","ETR","EOG","EQT","EFX","EQIX",
    "EQR","ERIE","ESS","EL","EG","EVRG","ES","EXC","EXE","EXPE","EXPD","EXR","XOM",
    "FFIV","FDS","FICO","FAST","FRT","FDX","FIS","FITB","FSLR","FE","F","FTNT",
    "FTV","FOXA","FOX","BEN","FCX",
    # G-K
    "GRMN","IT","GE","GEHC","GEV","GEN","GNRC","GD","GIS","GM","GPC","GILD","GPN",
    "GL","GDDY","GS","HAL","HIG","HAS","HCA","DOC","HSIC","HSY","HPE","HLT","HD",
    "HON","HRL","HST","HWM","HPQ","HUBB","HUM","HBAN","HII","IBM","IEX","IDXX",
    "ITW","INCY","IR","PODD","INTC","IBKR","ICE","IFF","IP","INTU","ISRG","IVZ",
    "INVH","IQV","IRM","JBHT","JBL","JKHY","J","JNJ","JCI","JPM","KVUE","KDP",
    "KEY","KEYS","KMB","KIM","KMI","KKR","KLAC","KHC","KR",
    # L-O
    "LHX","LH","LRCX","LVS","LDOS","LEN","LII","LLY","LIN","LYV","LMT","L","LOW",
    "LULU","LYB","MTB","MPC","MAR","MLM","MAS","MA","MKC","MCD","MCK","MDT","MRK",
    "META","MET","MTD","MGM","MCHP","MU","MSFT","MAA","MRNA","TAP","MDLZ","MPWR",
    "MNST","MCO","MS","MOS","MSI","MSCI","NDAQ","NTAP","NFLX","NEM","NWSA","NWS",
    "NEE","NKE","NI","NDSN","NSC","NTRS","NOC","NCLH","NRG","NUE","NVDA","NVR",
    "NXPI","ORLY","OXY","ODFL","OMC","ON","OKE","ORCL","OTIS",
    # P-S
    "PCAR","PKG","PLTR","PANW","PH","PAYX","PYPL","PNR","PEP","PFE","PCG","PM",
    "PSX","PNW","PNC","POOL","PPG","PPL","PLD","PRU","PEG","PSA","PWR","QCOM",
    "QRVO","RSG","RJF","RTX","REGN","RHI","ROK","ROP","ROST","RTO","SAP","SBAC",
    "SLB","SEE","SLG","SMCI","SNA","SNPS","SO","SRE","STX","SYK","SYF","SYY",
    # T-Z
    "TER","TEL","TFX","TGT","TKR","TM","TPR","TRMB","TRV","TSM","TSN","TT","TTWO",
    "TYL","UDR","UGI","ULTA","UNH","UNP","UPS","URI","USB","V","VFC","VICI","VLO",
    "VMC","VRT","VRSN","VRSK","VST","VTR","VTRS","VZ","WAB","WAT","WBA","WBD",
    "WEC","WELL","WST","WFC","WHR","WM","WMB","WMT","WRB","WSM","WTW","WY","WYNN",
    "XEL","XRAY","XYL","YUM","ZBH","ZBRA","ZTS",
]

# ─── Labo existant (50 stocks) — anti-doublon ───────────────────────────────
# Source : metrics_by_year.csv tickers + EXCLUDED (TSM/ITX/CS/LVMH/BMED)
LABO_EXISTING = {
    # Tech US growth (10)
    "NVDA","MSFT","AAPL","AMZN","GOOGL","META","AVGO","ORCL","ADBE","CRM",
    # Compounders chers (5)
    "CDNS","SNPS","LLY","FICO","ANET",
    # Quality value US (8)
    "PG","KO","JNJ","V","MA","COST","WMT","JPM",
    # EU quality (8) — TSM/ITX/CS/LVMH déjà exclus
    "ASML","NOVN","ITX","ROP","CS","NESN","LVMH","SAP",
    # EM quality (4)
    "INFY","HCLTECH","TSM","005930",
    # Positions actuelles (10) — BMED déjà exclu
    "ADM","BVI","PUB","NTGY","LOGN","EXPD","CBOE","CF","BMED","RMD",
    # Value-traps (5)
    "INTC","BABA","T","F","GE",
}


def main():
    DERIVED_DIR.mkdir(parents=True, exist_ok=True)

    # Dedupe et filtre
    sp500_unique = list(dict.fromkeys(SP500_TICKERS))  # ordre préservé, dédupé
    candidates = [t for t in sp500_unique if t not in LABO_EXISTING]
    print(f"S&P 500 source : {len(sp500_unique)} tickers uniques")
    print(f"Exclus (labo existant) : {len(sp500_unique) - len(candidates)} tickers")
    print(f"Candidats pour tirage : {len(candidates)}")

    # Tirage UNIQUE, seed=42 figée par pré-déclaration
    rng = random.Random(42)
    n_sample = min(200, len(candidates))
    sample = rng.sample(candidates, n_sample)

    print(f"\n✓ Tirage seed=42, {n_sample} stocks :")
    for i in range(0, len(sample), 10):
        print(f"  {', '.join(sample[i:i+10])}")

    # Sauvegarde
    output = {
        "seed": 42,
        "n_sample": n_sample,
        "n_candidates": len(candidates),
        "n_sp500_source": len(sp500_unique),
        "labo_excluded": sorted(LABO_EXISTING),
        "sample": sample,
    }
    out_path = DERIVED_DIR / "sp500_sample_200.json"
    with out_path.open("w") as f:
        json.dump(output, f, indent=2)
    print(f"\n✓ Sauvegardé : {out_path}")
    print(f"\nProchaine étape : fetcher fundamentals sur ces {n_sample} stocks.")
    print(f"  Commande : python3 scripts/fetch_fundamentals_history.py --live \\")
    print(f"             --tickers \"{','.join(sample[:5])},...\" (lire la liste depuis le JSON)")


if __name__ == "__main__":
    main()
