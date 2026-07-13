"""
Prépare l'univers UCITS pour le screener de clustering.

Utilise les fichiers enrichis par le workflow etf-advanced-filter.js :
  combined_etfs.csv  (equity + or/matières premières)
  combined_bonds.csv (fixed income, duration, inflation-linked, credit)

Ces fichiers contiennent des tickers déjà validés côté Twelve Data + les
métadonnées nécessaires aux filtres exécutabilité (AUM, TER, holdings).

Sortie : univers_ucits.csv avec colonnes attendues par le screener :
  ticker, nom, mic_code, currency, bucket, ucits, aum_meur, ter, age_annees

Note : ce premier tour ignore le suffixe :MIC pour Twelve Data. TD résout
le symbol nu → premier match, qui peut être une place secondaire. Pour un
clustering, ça reste correct (même sous-jacent = corrélation 0.98+).
Un raffinement futur pourrait forcer :MIC via un mapping XLON→LSE, etc.
"""
import pandas as pd
from pathlib import Path
from datetime import datetime

REPO = Path("/Users/benoit/stock-analysis-platform")

# Conversion USD -> EUR (approximation, revalidable dans le screener)
FX_USD_EUR = 0.92


def _load_and_tag(path: Path, bucket: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["bucket"] = bucket
    print(f"  {bucket:<6} : {len(df)} lignes depuis {path.name}")
    return df


def prepare():
    print("Chargement univers UCITS :")
    etf = _load_and_tag(REPO / "data/combined_etfs.csv", "equity")
    bond = _load_and_tag(REPO / "data/combined_bonds.csv", "bond")
    combined = pd.concat([etf, bond], ignore_index=True)
    combined = combined[combined["symbol"].notna()]
    combined["symbol"] = combined["symbol"].astype(str).str.strip()
    combined = combined.drop_duplicates("symbol")

    out = pd.DataFrame({
        "ticker": combined["symbol"],
        "nom": combined["name"],
        "mic_code": combined["mic_code"],
        "currency": combined["currency"],
        "bucket": combined["bucket"],
        "ucits": 1,
    })

    # TER stocké en décimal (0.0052 = 0.52%). Screener attend en % (0.52).
    if "total_expense_ratio" in combined.columns:
        out["ter"] = combined["total_expense_ratio"] * 100

    # AUM en USD -> MEUR
    if "aum_usd" in combined.columns:
        out["aum_meur"] = combined["aum_usd"] / 1e6 * FX_USD_EUR

    out_path = REPO / "data/univers_ucits.csv"
    out.to_csv(out_path, index=False)

    print(f"Univers UCITS : {len(out)} tickers")
    print(f"  equity : {(out['bucket'] == 'equity').sum()}")
    print(f"  bond   : {(out['bucket'] == 'bond').sum()}")
    print()
    if "aum_meur" in out.columns:
        print(f"AUM disponible : {out['aum_meur'].notna().sum()}/{len(out)}")
        print(f"  médiane : {out['aum_meur'].median():.0f} M€")
        print(f"  passe filtre 100 M€ : {(out['aum_meur'] >= 100).sum()}")
    if "ter" in out.columns:
        print(f"TER disponible : {out['ter'].notna().sum()}/{len(out)}")
        print(f"  médiane : {out['ter'].median():.2f}%")
        print(f"  passe filtre <= 0.60% : {(out['ter'] <= 0.60).sum()}")
    print()
    print(f"Top mic_code :")
    print(out["mic_code"].value_counts().head(10).to_string())
    print()
    print(f"Output : {out_path}")


if __name__ == "__main__":
    prepare()
