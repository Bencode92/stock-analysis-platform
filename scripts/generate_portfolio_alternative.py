"""generate_portfolio_alternative.py — version ALTERNATIVE poussée thématique.

But : produire data/portfolios_alternative.json pour COMPARAISON dans le dashboard
vs le data/portfolios.json principal (sain).

Composition Agressif Prédateur Thématique Poussé :
  - Cœur 70 % : VWCE 25 + SMH 15 + XLK 10 + ICLN 5 + COPX 5 + XBI 5 + SGLN 5
  - Satellite 30 % : 6 actions thématiques haut β (NVDA, SK Hynix, TSM, FSLR, ANET, ASML)
  - Pas de bonds
  - β attendu : ~1.0-1.1
  - MaxDD attendu : -40 % en krach normal, -60/-70 % en dotcom-style

Stable et Modéré inchangés (l'alternative concerne uniquement l'Agressif).

Usage :
    python3 scripts/generate_portfolio_alternative.py

Output :
    data/portfolios_alternative.json (Format B, chargeable dans audit_dashboard.html)
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
SOURCE = ROOT / "data" / "portfolios.json"
OUTPUT = ROOT / "data" / "portfolios_alternative.json"


# ─── COMPOSITION ALTERNATIVE AGRESSIF — Prédateur Thématique Équilibré ───
# v6.8 : Refactorisée avec les ETFs hard-exclude leveraged que le user a listés.
# DIFFÉRENCE avec v6.7 : plus de mono-secteur ultra-volatil (SMH/SOXX),
# remplacé par un mix DIVERSIFIÉ Growth/Tech/EM/Small-cap/Mid-cap/Énergie.
# Vol panier ~17-19% (vs 23% précédent), MaxDD attendu plus modéré.
ALT_AGRESSIF_CORE = {
    "QQQ": {
        "weight": 0.20,
        "name": "Invesco QQQ Trust (Nasdaq 100)",
        "fund_type": "Large Growth / Tech-heavy",
        "currency": "USD",
    },
    "VGT": {
        "weight": 0.10,
        "name": "Vanguard Information Technology ETF",
        "fund_type": "US Tech sector broad",
        "currency": "USD",
    },
    "IEMG": {
        "weight": 0.15,
        "name": "iShares Core MSCI EM IMI",
        "fund_type": "Emerging Markets diversified",
        "currency": "USD",
    },
    "VBK": {
        "weight": 0.08,
        "name": "Vanguard Small-Cap Growth ETF",
        "fund_type": "US Small-Cap Growth (Russell 2000 ish)",
        "currency": "USD",
    },
    "VOT": {
        "weight": 0.05,
        "name": "Vanguard Mid-Cap Growth ETF",
        "fund_type": "US Mid-Cap Growth",
        "currency": "USD",
    },
    "CGXU": {
        "weight": 0.10,
        "name": "Capital Group International Focus Eq",
        "fund_type": "Foreign Large Growth (intl developed)",
        "currency": "USD",
    },
    "XLE": {
        "weight": 0.05,
        "name": "Energy Select Sector SPDR",
        "fund_type": "US Energy (oil & gas)",
        "currency": "USD",
    },
    "EWT": {
        "weight": 0.02,
        "name": "iShares MSCI Taiwan ETF",
        "fund_type": "Taiwan (very high vol, small tilt)",
        "currency": "USD",
    },
    "SGLN.AS": {
        "weight": 0.05,
        "name": "iShares Physical Gold ETC",
        "fund_type": "Gold hedge (crisis protection)",
        "isin": "IE00B4ND3602", "ter": 0.0012, "currency": "EUR",
    },
}  # total = 0.80

# Satellite : actions de qualité hors-tech pour DIVERSIFIER vs cœur tech-heavy.
# Réutilise les top natifs Agressif du pipeline v4 (HEROMOTOCO/EXPD/CF/ITX/LUPIN)
# pour CONTINUITÉ avec le Principal (les 2 portefeuilles partagent le satellite).
ALT_AGRESSIF_SATELLITE = {
    "HEROMOTOCO": {
        "weight": 0.04,
        "name": "HERO MOTOCORP LTD",
        "industry": "Auto Manufacturers",
        "category": "Actions",
    },
    "EXPD": {
        "weight": 0.04,
        "name": "EXPEDITORS INTERNATIONAL",
        "industry": "Integrated Freight & Logistics",
        "category": "Actions",
    },
    "CF": {
        "weight": 0.04,
        "name": "CF INDUSTRIES HOLDINGS",
        "industry": "Agricultural Inputs",
        "category": "Actions",
    },
    "ITX": {
        "weight": 0.04,
        "name": "INDUSTRIA DE DISENO TEXTIL",
        "industry": "Apparel Retail",
        "category": "Actions",
    },
    "LUPIN": {
        "weight": 0.04,
        "name": "LUPIN LTD",
        "industry": "Drug Manufacturers — Specialty",
        "category": "Actions",
    },
}  # total = 0.20


def build_format_b_profile(core: dict, satellite: dict, profile_name: str) -> dict:
    """Construit la structure Format B (compatible audit_dashboard.html)."""
    actions, etf, obligations = {}, {}, {}
    tickers_meta = {}
    tickers = {}

    for tk, info in {**core, **satellite}.items():
        weight = info["weight"]
        name = info.get("name", tk)
        cat = info.get("category", "ETF")  # default ETF for core
        weight_pct = weight * 100
        # Display in Format B AllocationMap
        display = f"{name} ({tk})"
        if cat == "Actions":
            actions[display] = f"{weight_pct:.1f}%"
        elif cat in ("Obligations", "Bond"):
            obligations[display] = f"{weight_pct:.1f}%"
        else:
            etf[display] = f"{weight_pct:.1f}%"

        tickers[tk] = round(weight, 4)

        meta = {
            "weight": weight,
            "category": "Actions" if cat == "Actions" else ("Obligations" if cat in ("Obligations","Bond") else "ETF"),
            "name": name,
            "asset_ids": [tk],
            "industry": info.get("industry", info.get("fund_type", "")),
            "beta": None,
            "role": "core" if tk in core else "satellite",
        }
        for k in ("isin", "ter", "currency", "fund_type"):
            if k in info:
                meta[k] = info[k]
        tickers_meta[tk] = meta

    return {
        "Actions": actions,
        "ETF": etf,
        "Obligations": obligations,
        "Crypto": {},
        "_tickers": tickers,
        "_tickers_meta": tickers_meta,
        "Commentaire": (
            f"PORTEFEUILLE ALTERNATIVE — version Prédateur Thématique Poussé. "
            f"Cœur 70 % concentré AI/semis/tech/clean energy/biotech/cuivre + or. "
            f"Satellite 30 % en 6 actions thématiques haut β (NVDA/SK Hynix/TSM/"
            f"FSLR/ANET/ASML). Pas de bonds. Σ = 100 %. À COMPARER vs principal "
            f"(portfolios.json) dans le dashboard, PAS à acheter sans validation. "
            f"⚠️ Risque accru : MaxDD attendu -40 % normal, -60 à -70 % dotcom-style."
        ),
    }


def main():
    print("=" * 78)
    print("  GENERATE_PORTFOLIO_ALTERNATIVE — Prédateur Thématique Poussé")
    print("=" * 78)

    # On part du principal pour Stable/Modéré (inchangés)
    if not SOURCE.exists():
        print(f"❌ {SOURCE} introuvable. Lance d'abord generate_portfolios_v4.py.")
        return

    principal = json.load(open(SOURCE))
    out = {}

    # Préserve les clés non-modifiées
    for k, v in principal.items():
        if k in ("Stable", "Modéré", "Dividende-PEA", "Dividende-CTO", "_meta"):
            out[k] = v

    # Remplace l'Agressif par la version Prédateur Thématique Poussé
    out["Agressif"] = build_format_b_profile(
        ALT_AGRESSIF_CORE,
        ALT_AGRESSIF_SATELLITE,
        "Agressif"
    )

    # Sauvegarde
    OUTPUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n✅ Sauvegardé : {OUTPUT}")

    # Affichage de comparaison
    print(f"\n  AGRESSIF — COMPARAISON RAPIDE")
    print(f"  {'':30} {'Principal v6.6':>18} {'Alternative':>16}")
    print(f"  " + "-" * 70)
    p_meta = principal.get("Agressif", {}).get("_tickers_meta", {})
    a_meta = out["Agressif"]["_tickers_meta"]

    p_lines = len(p_meta)
    a_lines = len(a_meta)
    p_actions = sum(1 for m in p_meta.values() if m.get("category") == "Actions")
    a_actions = sum(1 for m in a_meta.values() if m.get("category") == "Actions")
    p_etf = sum(1 for m in p_meta.values() if m.get("category") == "ETF")
    a_etf = sum(1 for m in a_meta.values() if m.get("category") == "ETF")
    p_bonds = sum(1 for m in p_meta.values() if m.get("category") == "Obligations")
    a_bonds = sum(1 for m in a_meta.values() if m.get("category") == "Obligations")
    p_total = sum(m.get("weight", 0) for m in p_meta.values())
    a_total = sum(m.get("weight", 0) for m in a_meta.values())

    print(f"  {'Nombre de lignes':30} {p_lines:>18} {a_lines:>16}")
    print(f"  {'  dont Actions':30} {p_actions:>18} {a_actions:>16}")
    print(f"  {'  dont ETF':30} {p_etf:>18} {a_etf:>16}")
    print(f"  {'  dont Obligations':30} {p_bonds:>18} {a_bonds:>16}")
    print(f"  {'Σ weights':30} {p_total*100:>17.2f}% {a_total*100:>15.2f}%")

    print(f"\n  Composition Alternative Agressif :")
    print(f"    CŒUR (70 %) — ETF thématiques concentrés")
    for tk, info in ALT_AGRESSIF_CORE.items():
        print(f"      {tk:10} {info['weight']*100:5.1f}%  {info['name'][:50]}")
    print(f"    SATELLITE (30 %) — actions haut β AI/semis/transition")
    for tk, info in ALT_AGRESSIF_SATELLITE.items():
        print(f"      {tk:10} {info['weight']*100:5.1f}%  {info['name'][:50]}")

    print(f"\n  ⚠️  RAPPEL CRITIQUE :")
    print(f"     - data/portfolios.json (Principal) = celui à ACHETER, sain, validé walk-forward")
    print(f"     - data/portfolios_alternative.json = pour COMPARER dans le dashboard")
    print(f"     - Si tu veux exécuter l'alternative, c'est un pari assumé non prouvé OOS")
    print("=" * 78)


if __name__ == "__main__":
    main()
