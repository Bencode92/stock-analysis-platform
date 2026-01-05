#!/usr/bin/env python3
"""
selection_explainer.py - Explique pourquoi les grandes capitalisations sont/ne sont pas sélectionnées

Génère un fichier JSON documentant:
1. La logique globale de sélection (pipeline complet)
2. Les TOP 20 capitalisations US/Europe/Asie avec leur statut détaillé
3. Les raisons précises de sélection/rejet

v1.0.0 - Initial version
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

logger = logging.getLogger("selection-explainer")


# === LOGIQUE DE SÉLECTION DOCUMENTÉE ===

SELECTION_PIPELINE = {
    "version": "v4.12.0",
    "description": "Pipeline de sélection des actions pour les portefeuilles",
    "steps": [
        {
            "step": 1,
            "name": "Chargement des données",
            "source": "data/stocks_us.json, data/stocks_europe.json, data/stocks_asia.json",
            "description": "Charge toutes les actions avec leurs métriques fondamentales (ROE, D/E, PE, YTD, volatilité, market cap)",
            "output": "~450-500 actions brutes",
        },
        {
            "step": 2,
            "name": "Filtre Buffett",
            "mode": "soft (par défaut)",
            "threshold": "score_min = 40",
            "description": "Évalue la qualité fondamentale selon les critères Warren Buffett",
            "formula": {
                "ROE_score": "0-40 points (ROE >= 20% = 40pts, >= 15% = 30pts, >= 10% = 20pts)",
                "DE_score": "0-30 points (D/E <= 50% = 30pts, <= 100% = 20pts, <= 150% = 10pts)",
                "Stability_score": "0-30 points (basé sur volatilité et drawdown)",
                "Total": "ROE_score + DE_score + Stability_score (max 100)",
            },
            "rejection_reasons": [
                "ROE trop faible (< 10%)",
                "Endettement excessif (D/E > 150%)",
                "Données manquantes (ROE ou D/E non disponible)",
                "Score total < 40",
            ],
            "output": "~280-350 actions après filtre",
        },
        {
            "step": 3,
            "name": "Scoring quantitatif",
            "description": "Calcule un score composite pour chaque action",
            "components": {
                "momentum_score": "Performance YTD + 3M + 1M normalisée (0-1)",
                "quality_score": "ROE + stabilité des fondamentaux (0-1)",
                "risk_score": "Inverse de volatilité et drawdown (0-1)",
                "composite_score": "0.4 * momentum + 0.3 * quality + 0.3 * risk",
            },
            "output": "Actions scorées et classées",
        },
        {
            "step": 4,
            "name": "Filtre volatilité/liquidité",
            "thresholds": {
                "max_volatility": "60% annualisée",
                "min_market_cap": "Implicite (données disponibles = liquide)",
            },
            "description": "Élimine les actions trop volatiles ou illiquides",
            "output": "~200-300 actions filtrées",
        },
        {
            "step": 5,
            "name": "Sélection équilibrée par secteur",
            "function": "sector_balanced_selection()",
            "target": "25 actions maximum",
            "logic": {
                "diversification": "Max 3-4 actions par secteur",
                "ranking": "Tri par composite_score décroissant dans chaque secteur",
                "selection": "Prend les meilleurs de chaque secteur jusqu'à 25 total",
            },
            "rejection_reasons": [
                "Quota sectoriel atteint (ex: déjà 4 actions Technologie)",
                "Score composite insuffisant vs concurrents du secteur",
                "Secteur surreprésenté dans l'univers",
            ],
            "output": "25 actions finales pour les portefeuilles",
        },
        {
            "step": 6,
            "name": "Tilts RADAR (optionnel)",
            "description": "Ajuste les scores selon le contexte marché",
            "adjustments": {
                "favored_sectors": "+15% sur le score",
                "avoided_sectors": "-15% sur le score",
                "favored_regions": "+15% sur le score",
                "avoided_regions": "-15% sur le score",
            },
            "source": "data/market_context.json (généré par RADAR)",
        },
    ],
    "key_points": [
        "Les grandes capitalisations NE SONT PAS automatiquement sélectionnées",
        "La qualité fondamentale (Buffett) prime sur la taille",
        "La diversification sectorielle limite le nombre d'actions par secteur",
        "Une action peut être rejetée même avec un bon score si son secteur est déjà plein",
        "Les données manquantes (ROE, D/E) entraînent un rejet",
    ],
}


def parse_market_cap(value) -> float:
    """Parse market cap string to float (in billions)."""
    if isinstance(value, (int, float)):
        return float(value) / 1e9
    
    if not isinstance(value, str):
        return 0.0
    
    value = value.upper().strip().replace("$", "").replace(",", "")
    
    multipliers = {"T": 1000, "B": 1, "M": 0.001, "K": 0.000001}
    
    for suffix, mult in multipliers.items():
        if suffix in value:
            try:
                num = float(value.replace(suffix, "").strip())
                return num * mult
            except:
                return 0.0
    
    try:
        return float(value) / 1e9
    except:
        return 0.0


def format_market_cap(value_billions: float) -> str:
    """Format market cap in human readable format."""
    if value_billions >= 1000:
        return f"{value_billions/1000:.1f}T"
    elif value_billions >= 1:
        return f"{value_billions:.1f}B"
    else:
        return f"{value_billions*1000:.0f}M"


def get_region(country: str) -> str:
    """Determine region from country."""
    country = (country or "").upper()
    
    us_countries = {"USA", "US", "UNITED STATES", "ÉTATS-UNIS"}
    europe_countries = {
        "FRANCE", "GERMANY", "ALLEMAGNE", "UK", "UNITED KINGDOM", "ROYAUME-UNI",
        "NETHERLANDS", "PAYS-BAS", "SWITZERLAND", "SUISSE", "ITALY", "ITALIE",
        "SPAIN", "ESPAGNE", "BELGIUM", "BELGIQUE", "SWEDEN", "SUÈDE",
        "DENMARK", "DANEMARK", "NORWAY", "NORVÈGE", "FINLAND", "FINLANDE",
        "IRELAND", "IRLANDE", "PORTUGAL", "AUSTRIA", "AUTRICHE", "LUXEMBOURG"
    }
    asia_countries = {
        "JAPAN", "JAPON", "CHINA", "CHINE", "HONG KONG", "SOUTH KOREA", "CORÉE DU SUD",
        "TAIWAN", "TAÏWAN", "INDIA", "INDE", "SINGAPORE", "SINGAPOUR",
        "AUSTRALIA", "AUSTRALIE", "INDONESIA", "INDONÉSIE", "THAILAND", "THAÏLANDE"
    }
    
    if country in us_countries:
        return "US"
    elif country in europe_countries:
        return "Europe"
    elif country in asia_countries:
        return "Asia"
    else:
        return "Other"


def analyze_rejection_reason(
    asset: Dict,
    selected_ids: set,
    selected_by_sector: Dict[str, List],
    buffett_min_score: int = 40,
    max_per_sector: int = 4,
) -> Tuple[str, Dict]:
    """
    Analyse détaillée de la raison de rejet d'un actif.
    
    Returns:
        Tuple[reason_text, details_dict]
    """
    details = {}
    
    asset_id = asset.get("id") or asset.get("ticker")
    name = asset.get("name") or asset.get("ticker") or "Unknown"
    
    # 1. Vérifier si sélectionné
    if asset_id in selected_ids:
        return "✅ SÉLECTIONNÉ", {"status": "selected"}
    
    # 2. Check Buffett score
    buffett_score = asset.get("_buffett_score")
    buffett_reject = asset.get("_buffett_reject_reason")
    
    if buffett_reject:
        details["buffett_score"] = buffett_score
        details["buffett_reject_reason"] = buffett_reject
        return f"❌ Filtre Buffett: {buffett_reject}", details
    
    if buffett_score is not None and buffett_score < buffett_min_score:
        roe = asset.get("roe")
        de = asset.get("de_ratio")
        details["buffett_score"] = buffett_score
        details["roe"] = roe
        details["de_ratio"] = de
        return f"❌ Score Buffett insuffisant ({buffett_score:.0f} < {buffett_min_score})", details
    
    # 3. Check données manquantes
    roe = asset.get("roe")
    de_ratio = asset.get("de_ratio")
    
    if roe is None or roe == "N/A":
        details["missing"] = "ROE"
        return "❌ Données manquantes: ROE non disponible", details
    
    # 4. Check volatilité
    vol = asset.get("vol") or asset.get("volatility_3y") or asset.get("vol_3y")
    if vol:
        try:
            vol_float = float(str(vol).replace("%", ""))
            if vol_float > 60:
                details["volatility"] = vol_float
                return f"❌ Volatilité excessive ({vol_float:.1f}% > 60%)", details
        except:
            pass
    
    # 5. Check quota sectoriel
    sector = asset.get("sector") or asset.get("_sector_key") or "Unknown"
    sector_count = len(selected_by_sector.get(sector, []))
    
    if sector_count >= max_per_sector:
        composite = asset.get("_composite_score") or 0
        # Trouver le score min des sélectionnés dans ce secteur
        selected_in_sector = selected_by_sector.get(sector, [])
        if selected_in_sector:
            min_selected_score = min(s.get("_composite_score", 0) for s in selected_in_sector)
            details["sector"] = sector
            details["sector_quota"] = f"{sector_count}/{max_per_sector}"
            details["your_score"] = round(composite, 3)
            details["min_selected_score"] = round(min_selected_score, 3)
            details["selected_in_sector"] = [s.get("name", "?")[:20] for s in selected_in_sector]
            return f"❌ Quota sectoriel atteint ({sector}: {sector_count}/{max_per_sector}), score {composite:.3f} < seuil {min_selected_score:.3f}", details
    
    # 6. Score composite insuffisant
    composite = asset.get("_composite_score") or 0
    details["composite_score"] = round(composite, 3)
    details["sector"] = sector
    
    # Trouver le seuil de coupure global
    return f"❌ Score composite insuffisant ({composite:.3f})", details


def generate_selection_explanation(
    all_equities: List[Dict],
    selected_equities: List[Dict],
    config: Dict = None,
    market_context: Dict = None,
    output_path: str = "data/selection_explained.json",
) -> Dict:
    """
    Génère un fichier JSON expliquant la sélection des actions.
    
    Args:
        all_equities: Toutes les actions chargées (avant filtres)
        selected_equities: Actions finalement sélectionnées
        config: Configuration du pipeline
        market_context: Contexte RADAR si disponible
        output_path: Chemin de sortie
    
    Returns:
        Dict avec l'explication complète
    """
    config = config or {}
    buffett_min_score = config.get("buffett_min_score", 40)
    
    # Build selected IDs set
    selected_ids = set()
    selected_by_sector = {}
    
    for eq in selected_equities:
        eq_id = eq.get("id") or eq.get("ticker")
        selected_ids.add(eq_id)
        
        sector = eq.get("sector") or eq.get("_sector_key") or "Unknown"
        if sector not in selected_by_sector:
            selected_by_sector[sector] = []
        selected_by_sector[sector].append(eq)
    
    # Séparer par région et trier par market cap
    by_region = {"US": [], "Europe": [], "Asia": [], "Other": []}
    
    for eq in all_equities:
        country = eq.get("country") or eq.get("country_top") or ""
        region = get_region(country)
        
        mcap_raw = eq.get("market_cap") or eq.get("liquidity") or 0
        mcap_billions = parse_market_cap(mcap_raw)
        eq["_mcap_billions"] = mcap_billions
        eq["_region"] = region
        
        by_region[region].append(eq)
    
    # Trier chaque région par market cap décroissant
    for region in by_region:
        by_region[region].sort(key=lambda x: x.get("_mcap_billions", 0), reverse=True)
    
    # Analyser TOP 20 de chaque région
    top_by_region = {}
    
    for region, equities in by_region.items():
        if region == "Other":
            continue
            
        top_20 = equities[:20]
        analyzed = []
        
        for eq in top_20:
            name = eq.get("name") or eq.get("ticker") or "Unknown"
            ticker = eq.get("ticker") or "N/A"
            mcap = eq.get("_mcap_billions", 0)
            sector = eq.get("sector") or "Unknown"
            country = eq.get("country") or "Unknown"
            
            # Analyser la raison
            reason, details = analyze_rejection_reason(
                eq, selected_ids, selected_by_sector, buffett_min_score
            )
            
            entry = {
                "rank": len(analyzed) + 1,
                "name": name,
                "ticker": ticker,
                "market_cap": format_market_cap(mcap),
                "market_cap_billions": round(mcap, 1),
                "sector": sector,
                "country": country,
                "selected": eq.get("id") in selected_ids or ticker in selected_ids,
                "status": reason,
                "details": details,
            }
            
            # Ajouter métriques clés
            if eq.get("_buffett_score") is not None:
                entry["buffett_score"] = round(eq["_buffett_score"], 1)
            if eq.get("_composite_score") is not None:
                entry["composite_score"] = round(eq["_composite_score"], 3)
            if eq.get("roe"):
                entry["roe"] = eq["roe"]
            if eq.get("de_ratio") is not None:
                entry["de_ratio"] = eq["de_ratio"]
            if eq.get("ytd") or eq.get("perf_ytd"):
                entry["ytd"] = eq.get("ytd") or eq.get("perf_ytd")
            
            analyzed.append(entry)
        
        # Stats de la région
        selected_count = sum(1 for a in analyzed if a["selected"])
        
        top_by_region[region] = {
            "total_in_universe": len(equities),
            "top_20_analyzed": len(analyzed),
            "selected_in_top_20": selected_count,
            "rejection_rate_top_20": f"{100 * (20 - selected_count) / 20:.0f}%",
            "stocks": analyzed,
        }
    
    # Construire le rapport final
    report = {
        "generated_at": datetime.now().isoformat(),
        "version": "v1.0.0",
        
        "selection_pipeline": SELECTION_PIPELINE,
        
        "config_used": {
            "buffett_mode": config.get("buffett_mode", "soft"),
            "buffett_min_score": buffett_min_score,
            "max_equities": 25,
            "max_per_sector": 4,
            "tactical_context_enabled": config.get("use_tactical_context", False),
        },
        
        "summary": {
            "total_universe": len(all_equities),
            "total_selected": len(selected_equities),
            "selection_rate": f"{100 * len(selected_equities) / max(1, len(all_equities)):.1f}%",
            "by_region": {
                region: {
                    "universe": len(equities),
                    "in_top_20_selected": top_by_region.get(region, {}).get("selected_in_top_20", 0),
                }
                for region, equities in by_region.items()
                if region != "Other"
            },
        },
        
        "sectors_distribution": {
            sector: {
                "selected_count": len(eqs),
                "selected_names": [e.get("name", "?")[:25] for e in eqs],
            }
            for sector, eqs in selected_by_sector.items()
        },
        
        "top_caps_by_region": top_by_region,
        
        "radar_context": None,
    }
    
    # Ajouter contexte RADAR si disponible
    if market_context:
        report["radar_context"] = {
            "regime": market_context.get("market_regime"),
            "favored_sectors": market_context.get("macro_tilts", {}).get("favored_sectors", []),
            "avoided_sectors": market_context.get("macro_tilts", {}).get("avoided_sectors", []),
            "favored_regions": market_context.get("macro_tilts", {}).get("favored_regions", []),
            "avoided_regions": market_context.get("macro_tilts", {}).get("avoided_regions", []),
            "impact": "Les secteurs/régions favorisés reçoivent +15% sur leur score, les évités -15%",
        }
    
    # Sauvegarder
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    logger.info(f"✅ Selection explanation saved: {output_path}")
    
    # Log summary
    for region, data in top_by_region.items():
        selected = data["selected_in_top_20"]
        logger.info(f"   {region} TOP 20: {selected}/20 sélectionnés ({data['rejection_rate_top_20']} rejetés)")
    
    return report


# === FONCTION SIMPLE POUR INTÉGRATION ===

def explain_top_caps_selection(
    eq_rows_initial: List[Dict],
    equities_final: List[Dict],
    config: Dict = None,
    market_context: Dict = None,
    output_path: str = "data/selection_explained.json",
) -> str:
    """
    Fonction simple pour intégration dans generate_portfolios_v4.py
    
    Args:
        eq_rows_initial: Actions brutes chargées depuis les JSON
        equities_final: Actions sélectionnées après tous les filtres
        config: CONFIG dict
        market_context: Contexte RADAR
        output_path: Chemin de sortie
    
    Returns:
        Chemin du fichier généré
    """
    report = generate_selection_explanation(
        all_equities=eq_rows_initial,
        selected_equities=equities_final,
        config=config,
        market_context=market_context,
        output_path=output_path,
    )
    
    return output_path
