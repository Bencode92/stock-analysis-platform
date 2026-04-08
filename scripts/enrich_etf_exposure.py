#!/usr/bin/env python3
"""
Enrichit data/combined_etfs.csv avec 3 colonnes dérivées de etf_exposure.py :

  - exposure           : catégorie fine (61 valeurs : sp500, europe, china,
                         gold_physical, leveraged_3x_bull, ...)
  - geo_bucket         : bucket pour les pills géo de etf.html
                         (us | europe | asia | emerging | world | "")
  - sector_bucket_pill : bucket pour les pills secteur de etf.html
                         (tech | health | finance | energy | reits |
                          consumer | industrial | metals | "")

À exécuter après etf-bond-daily-metrics.js dans le workflow daily-metrics.yml.
Sans dépendance externe (stdlib uniquement).
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

# Permet d'importer portfolio_engine.* depuis la racine du repo
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from portfolio_engine.etf_exposure import detect_etf_exposure  # noqa: E402

CSV_PATH = ROOT / "data" / "combined_etfs.csv"

# ──────────────────────────────────────────────────────────────────────────────
# Mapping exposure (61 catégories) → buckets etf.html
# ──────────────────────────────────────────────────────────────────────────────
EXPOSURE_TO_GEO: dict[str, str] = {
    # === US ===
    "sp500": "us", "sp500_inverse": "us",
    "nasdaq100": "us", "nasdaq100_inverse": "us",
    "russell2000": "us", "russell2000_inverse": "us",
    "russell1000": "us", "dow": "us", "dow_inverse": "us",
    "us_total_market": "us", "sp400_midcap": "us", "sp600_smallcap": "us",
    "us_microcap": "us", "us_largecap": "us", "us_value": "us", "us_growth": "us",
    "us_equity": "us", "us_large_cap": "us", "us_mid_cap": "us", "us_small_cap": "us",
    "dow30": "us", "sp500_value": "us", "sp500_growth": "us", "sp500_quality": "us",

    # === Europe ===
    "europe": "europe", "eurozone": "europe",
    "ftse100": "europe", "uk": "europe",
    "germany": "europe", "france": "europe", "switzerland": "europe",
    "italy": "europe", "spain": "europe", "netherlands": "europe",
    "nordic": "europe", "msci_europe": "europe",

    # === Asie développée ===
    "japan": "asia", "japan_inverse": "asia",
    "korea": "asia", "taiwan": "asia",
    "australia": "asia", "hong_kong": "asia", "singapore": "asia",
    "asia_pacific": "asia", "south_korea": "asia", "asia_ex_japan": "asia",

    # === Émergents ===
    "emerging_markets": "emerging", "emerging_markets_inverse": "emerging",
    "china": "emerging", "china_inverse": "emerging",
    "india": "emerging", "india_inverse": "emerging",
    "brazil": "emerging", "mexico": "emerging", "turkey": "emerging",
    "south_africa": "emerging", "russia": "emerging", "frontier": "emerging",
    "latin_america": "emerging", "vietnam": "emerging", "indonesia": "emerging",
    "thailand": "emerging", "malaysia": "emerging", "saudi_arabia": "emerging",
    "philippines": "emerging", "poland": "emerging",

    # === Monde / global ===
    "acwi": "world", "msci_world": "world",
    "global_developed": "world", "eafe": "world", "world": "world",
    "international": "world", "global_equity": "world", "developed_markets": "world",
    "multi_country": "world",
}

COUNTRY_TO_REGION: dict[str, str] = {
    # US
    "united states": "us", "usa": "us", "u.s.": "us", "u.s.a.": "us",
    # Europe développée
    "france": "europe", "germany": "europe", "united kingdom": "europe",
    "great britain": "europe", "switzerland": "europe", "netherlands": "europe",
    "italy": "europe", "spain": "europe", "sweden": "europe", "belgium": "europe",
    "ireland": "europe", "norway": "europe", "denmark": "europe", "finland": "europe",
    "austria": "europe", "portugal": "europe", "luxembourg": "europe",
    "iceland": "europe", "greece": "europe",
    # Asie développée
    "japan": "asia", "hong kong": "asia", "singapore": "asia",
    "south korea": "asia", "korea": "asia", "taiwan": "asia",
    "australia": "asia", "new zealand": "asia",
    # Émergents
    "china": "emerging", "india": "emerging", "indonesia": "emerging",
    "thailand": "emerging", "malaysia": "emerging", "philippines": "emerging",
    "vietnam": "emerging", "pakistan": "emerging", "brazil": "emerging",
    "mexico": "emerging", "chile": "emerging", "colombia": "emerging",
    "peru": "emerging", "argentina": "emerging", "turkey": "emerging",
    "south africa": "emerging", "russia": "emerging", "egypt": "emerging",
    "saudi arabia": "emerging", "uae": "emerging", "qatar": "emerging",
    "poland": "emerging", "hungary": "emerging", "czech republic": "emerging",
}

EXPOSURE_TO_SECTOR: dict[str, str] = {
    # === Tech ===
    "tech": "tech", "technology": "tech", "semiconductors": "tech",
    "software": "tech", "internet": "tech", "cybersecurity": "tech",
    "cloud": "tech", "ai": "tech", "robotics": "tech", "fintech": "tech",
    "blockchain": "tech",
    "semiconductor": "tech", "communications": "tech",

    # === Santé ===
    "healthcare": "health", "biotech": "health", "pharma": "health",
    "medical_devices": "health", "genomics": "health",

    # === Finance ===
    "financials": "finance", "banks": "finance", "insurance": "finance",
    "regional_banks": "finance",

    # === Énergie ===
    "energy": "energy", "oil_gas": "energy", "clean_energy": "energy",
    "solar": "energy", "wind": "energy", "renewable_energy": "energy",
    "uranium": "energy",  # nucléaire compte ici aussi

    # === REITs / immobilier ===
    "reits": "reits", "real_estate": "reits", "mortgage_reits": "reits",

    # === Consommation ===
    "consumer_discretionary": "consumer", "consumer_staples": "consumer",
    "retail": "consumer",

    # === Industrie ===
    "industrials": "industrial", "aerospace_defense": "industrial",
    "transportation": "industrial", "infrastructure": "industrial",

    # === Métaux / matières premières ===
    "gold_physical": "metals", "gold_miners": "metals",
    "silver_physical": "metals", "silver_miners": "metals",
    "copper": "metals", "platinum": "metals", "palladium": "metals",
    "metals_mining": "metals", "materials": "metals",
}

# Mapping sector_top du provider (Morningstar/GICS) → pill
_SECTOR_TOP_TO_PILL: dict[str, str] = {
    "technology": "tech",
    "healthcare": "health", "health care": "health",
    "financial services": "finance", "financials": "finance", "financial": "finance",
    "energy": "energy",
    "real estate": "reits",
    "consumer cyclical": "consumer", "consumer defensive": "consumer",
    "consumer discretionary": "consumer", "consumer staples": "consumer",
    "industrials": "industrial", "industrial": "industrial",
    "basic materials": "metals", "materials": "metals",
}


def enrich() -> None:
    if not CSV_PATH.exists():
        print(f"❌ {CSV_PATH} introuvable", file=sys.stderr)
        sys.exit(1)

    with CSV_PATH.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    new_cols = ["exposure", "geo_bucket", "sector_bucket_pill"]
    for col in new_cols:
        if col not in fieldnames:
            fieldnames.append(col)

    n_exposure = 0
    n_geo = 0
    n_sector = 0
    for row in rows:
        name = row.get("name") or ""
        ticker = row.get("symbol") or ""
        fund_type = row.get("fund_type") or ""
        exposure = detect_etf_exposure(name, ticker, fund_type) or ""
        row["exposure"] = exposure

        # Geo bucket : 1) etf_exposure  2) fallback country_top du provider
        geo = EXPOSURE_TO_GEO.get(exposure, "")
        if not geo:
            ctop = (row.get("country_top") or "").strip().lower()
            geo = COUNTRY_TO_REGION.get(ctop, "")
        row["geo_bucket"] = geo

        # Sector bucket : 1) etf_exposure  2) fallback sector_top du provider
        sec = EXPOSURE_TO_SECTOR.get(exposure, "")
        if not sec:
            stop = (row.get("sector_top") or "").strip().lower()
            sec = _SECTOR_TOP_TO_PILL.get(stop, "")
        row["sector_bucket_pill"] = sec
        if exposure:
            n_exposure += 1
        if row["geo_bucket"]:
            n_geo += 1
        if row["sector_bucket_pill"]:
            n_sector += 1

    with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    total = len(rows)
    print(f"✅ Enrichi {CSV_PATH.name} : {total} lignes")
    print(f"   exposure           : {n_exposure}/{total} ({n_exposure*100//max(total,1)}%)")
    print(f"   geo_bucket         : {n_geo}/{total} ({n_geo*100//max(total,1)}%)")
    print(f"   sector_bucket_pill : {n_sector}/{total} ({n_sector*100//max(total,1)}%)")


if __name__ == "__main__":
    enrich()
