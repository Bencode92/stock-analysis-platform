# portfolio_engine/market_context.py
"""
Market Context Generator v1.0
=============================

Génère un contexte marché unifié via GPT à partir de:
- sectors.json (performance sectorielle)
- markets.json (performance régionale)
- news.json (optionnel - actualités)

PRINCIPE FONDAMENTAL (validé Claude + ChatGPT):
- GPT = POLITIQUE QUALITATIVE (quels secteurs/régions favoriser/éviter)
- Python = QUANTIFICATION (combien valent les tilts en score)

Le fichier market_context.json généré remplace macro_tilts.json
et garantit la cohérence brief ↔ tilts.
"""

import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, List

logger = logging.getLogger("portfolio_engine.market_context")


# ============= CONFIGURATION DES TILTS (PYTHON, PAS GPT) =============

TILT_CONFIG = {
    "favored": +0.15,       # Bonus pour secteur/région favorisé
    "avoided": -0.15,       # Malus pour secteur/région évité
    "max_tactical": 0.30,   # Plafond total du tilt tactique
}


# ============= ALIAS NORMALIZATION (suggestion ChatGPT) =============

SECTOR_ALIASES = {
    # Normalise toutes les variantes vers kebab-case
    "consumer-discretionary": "consumer-discretionary",
    "consumer-cyclical": "consumer-discretionary",
    "consumer discretionary": "consumer-discretionary",
    "consumer cyclical": "consumer-discretionary",
    
    "consumer-staples": "consumer-staples",
    "consumer-defensive": "consumer-staples",
    "consumer staples": "consumer-staples",
    "consumer defensive": "consumer-staples",
    
    "information-technology": "information-technology",
    "technology": "information-technology",
    "tech": "information-technology",
    
    "health-care": "healthcare",
    "healthcare": "healthcare",
    "health care": "healthcare",
    
    "communication-services": "communication-services",
    "communication services": "communication-services",
    "telecommunications": "communication-services",
    
    "real-estate": "real-estate",
    "real estate": "real-estate",
    
    "financials": "financials",
    "financial-services": "financials",
    "financial services": "financials",
    
    "industrials": "industrials",
    "industrial": "industrials",
    
    "materials": "materials",
    "basic-materials": "materials",
    "basic materials": "materials",
    
    "utilities": "utilities",
    "energy": "energy",
}

REGION_ALIASES = {
    # Normalise pays/régions
    "united states": "united states",
    "usa": "united states",
    "us": "united states",
    "etats-unis": "united states",
    "états-unis": "united states",
    
    "united kingdom": "united kingdom",
    "uk": "united kingdom",
    "royaume uni": "united kingdom",
    "royaume-uni": "united kingdom",
    
    "china": "china",
    "chine": "china",
    
    "south korea": "south korea",
    "korea": "south korea",
    "corée du sud": "south korea",
    
    "germany": "germany",
    "allemagne": "germany",
    
    "france": "france",
    "spain": "spain",
    "espagne": "spain",
    
    "japan": "japan",
    "japon": "japan",
    
    "switzerland": "switzerland",
    "suisse": "switzerland",
    
    "hong kong": "hong kong",
    "taiwan": "taiwan",
    "india": "india",
    "inde": "india",
    
    "brazil": "brazil",
    "brésil": "brazil",
    
    "israel": "israel",
    "saudi arabia": "saudi arabia",
}


def normalize_sector(sector: str) -> str:
    """Normalise un nom de secteur vers la forme standard."""
    if not sector:
        return ""
    key = sector.lower().strip().replace("_", "-")
    return SECTOR_ALIASES.get(key, key)


def normalize_region(region: str) -> str:
    """Normalise un nom de région vers la forme standard."""
    if not region:
        return ""
    key = region.lower().strip()
    return REGION_ALIASES.get(key, key)


# ============= PROMPT GPT =============

MARKET_CONTEXT_PROMPT = """
Tu es un stratégiste macro-économique. Analyse les données marché et génère un contexte tactique cohérent.

## DONNÉES SECTORIELLES (Performance YTD)
{sectors_summary}

## DONNÉES RÉGIONALES (Performance YTD)
{markets_summary}

## INSTRUCTIONS
1. Identifie le régime de marché actuel (risk-on, risk-off, neutral)
2. Sélectionne les secteurs à favoriser (momentum positif, > +5% YTD)
3. Sélectionne les secteurs à éviter (momentum négatif ou risques)
4. Sélectionne les régions à favoriser (> +10% YTD, stabilité)
5. Sélectionne les régions à éviter (YTD négatif, risques géopolitiques)
6. Justifie brièvement tes choix

## FORMAT JSON STRICT
{{
  "market_regime": "risk-on|risk-off|neutral",
  "macro_tilts": {{
    "favored_sectors": ["sector1", "sector2", "sector3"],
    "avoided_sectors": ["sector1", "sector2"],
    "favored_regions": ["region1", "region2"],
    "avoided_regions": ["region1", "region2"],
    "rationale": "Justification en 2-3 phrases maximum"
  }},
  "key_trends": ["trend1", "trend2", "trend3"],
  "risks": ["risk1", "risk2"],
  "opportunities": ["opp1", "opp2"],
  "confidence": 0.0-1.0,
  "as_of": "{date}"
}}

## RÈGLES STRICTES
- favored_sectors: Maximum 5, uniquement ceux avec YTD > +5% ET momentum récent positif
- avoided_sectors: Maximum 3, ceux avec YTD négatif OU surachetés (YTD > +50%)
- favored_regions: Maximum 4, régions avec YTD > +10% ET stabilité politique
- avoided_regions: Maximum 3, régions avec YTD négatif OU instabilité
- Utilise les noms EXACTS des secteurs/pays dans les données d'entrée
- Tu ne donnes PAS de scores numériques, uniquement des listes qualitatives
- confidence: 0.9 si données complètes et claires, réduire si incertitudes

Réponds UNIQUEMENT avec le JSON, sans commentaires ni markdown.
"""


# ============= FALLBACK CONTEXT =============

def get_fallback_context() -> Dict[str, Any]:
    """
    Contexte neutre si GPT échoue.
    Aucun tilt appliqué = scoring 100% basé sur fondamentaux.
    """
    return {
        "market_regime": "neutral",
        "macro_tilts": {
            "favored_sectors": [],
            "avoided_sectors": [],
            "favored_regions": [],
            "avoided_regions": [],
            "rationale": "Fallback neutre - pas de tilts tactiques appliqués"
        },
        "key_trends": [],
        "risks": ["Contexte marché non disponible"],
        "opportunities": [],
        "confidence": 0.0,
        "as_of": datetime.now().strftime("%Y-%m-%d"),
        "_meta": {
            "generated_at": datetime.now().isoformat(),
            "model": "fallback",
            "tilt_config": TILT_CONFIG,
            "is_fallback": True,
        }
    }


# ============= DATA FORMATTERS =============

def _format_sectors_summary(sectors_data: Dict) -> str:
    """Formate les secteurs pour le prompt GPT."""
    lines = []
    sectors = sectors_data.get("sectors", {})
    
    # Extraire et trier par YTD
    sector_list = []
    for key, entries in sectors.items():
        if entries and isinstance(entries, list):
            # Prendre l'entrée US ou la première disponible
            entry = next((e for e in entries if e.get("region") == "US"), entries[0])
            ytd = entry.get("ytd_num", 0) or 0
            daily = entry.get("change_num", 0) or 0
            sector_list.append({
                "name": key,
                "ytd": ytd,
                "daily": daily
            })
    
    # Trier par YTD décroissant
    sector_list.sort(key=lambda x: x["ytd"], reverse=True)
    
    for s in sector_list:
        lines.append(f"- {s['name']}: YTD {s['ytd']:+.1f}%, Daily {s['daily']:+.2f}%")
    
    return "\n".join(lines) if lines else "Données sectorielles non disponibles"


def _format_markets_summary(markets_data: Dict) -> str:
    """Formate les marchés pour le prompt GPT."""
    lines = []
    indices = markets_data.get("indices", {})
    
    # Aplatir tous les pays
    all_countries = []
    for region, entries in indices.items():
        if isinstance(entries, list):
            for e in entries:
                if isinstance(e, dict):
                    all_countries.append({
                        "country": e.get("country", "Unknown"),
                        "ytd": e.get("ytd_num", 0) or e.get("_ytd_value", 0) or 0,
                        "daily": e.get("change_num", 0) or e.get("_change_value", 0) or 0,
                        "region": region
                    })
    
    # Trier par YTD
    all_countries.sort(key=lambda x: x["ytd"], reverse=True)
    
    lines.append("**Top 10 pays (YTD):**")
    for c in all_countries[:10]:
        lines.append(f"- {c['country']}: YTD {c['ytd']:+.1f}%")
    
    lines.append("\n**Bottom 5 pays (YTD):**")
    for c in all_countries[-5:]:
        lines.append(f"- {c['country']}: YTD {c['ytd']:+.1f}%")
    
    return "\n".join(lines) if lines else "Données régionales non disponibles"


# ============= MAIN GENERATOR =============

def generate_market_context(
    data_dir: str = "data",
    model: str = "gpt-4o-mini",
    fallback_on_error: bool = True,
    save_to_file: bool = True,
    output_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Génère le contexte marché unifié via GPT.
    
    Args:
        data_dir: Répertoire contenant sectors.json et markets.json
        model: Modèle OpenAI à utiliser
        fallback_on_error: Si True, retourne contexte neutre en cas d'erreur
        save_to_file: Si True, sauvegarde market_context.json
        output_path: Chemin de sortie (défaut: data/market_context.json)
    
    Returns:
        Dict avec market_regime, macro_tilts, key_trends, etc.
    """
    data_path = Path(data_dir)
    
    # 1. Charger les données brutes
    sectors_data = {}
    markets_data = {}
    
    sectors_path = data_path / "sectors.json"
    if sectors_path.exists():
        try:
            with open(sectors_path, "r", encoding="utf-8") as f:
                sectors_data = json.load(f)
            logger.info(f"✅ Chargé: {sectors_path}")
        except Exception as e:
            logger.warning(f"⚠️ Erreur lecture {sectors_path}: {e}")
    
    markets_path = data_path / "markets.json"
    if markets_path.exists():
        try:
            with open(markets_path, "r", encoding="utf-8") as f:
                markets_data = json.load(f)
            logger.info(f"✅ Chargé: {markets_path}")
        except Exception as e:
            logger.warning(f"⚠️ Erreur lecture {markets_path}: {e}")
    
    if not sectors_data and not markets_data:
        logger.warning("⚠️ Aucune donnée marché disponible, utilisation du fallback")
        if fallback_on_error:
            return get_fallback_context()
        raise ValueError("Données sectors.json et markets.json manquantes")
    
    # 2. Formater pour le prompt
    sectors_summary = _format_sectors_summary(sectors_data)
    markets_summary = _format_markets_summary(markets_data)
    
    # 3. Appeler GPT
    try:
        from openai import OpenAI
        
        client = OpenAI()
        
        prompt = MARKET_CONTEXT_PROMPT.format(
            sectors_summary=sectors_summary,
            markets_summary=markets_summary,
            date=datetime.now().strftime("%Y-%m-%d")
        )
        
        logger.info(f"🔄 Appel GPT ({model}) pour market_context...")
        
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,  # Faible pour cohérence
            max_tokens=1000,
        )
        
        raw = response.choices[0].message.content.strip()
        
        # Nettoyer les backticks markdown si présents
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        if raw.endswith("```"):
            raw = raw[:-3].strip()
        
        context = json.loads(raw)
        
        # 4. Normaliser les secteurs/régions
        macro_tilts = context.get("macro_tilts", {})
        macro_tilts["favored_sectors"] = [
            normalize_sector(s) for s in macro_tilts.get("favored_sectors", [])
        ]
        macro_tilts["avoided_sectors"] = [
            normalize_sector(s) for s in macro_tilts.get("avoided_sectors", [])
        ]
        macro_tilts["favored_regions"] = [
            normalize_region(r) for r in macro_tilts.get("favored_regions", [])
        ]
        macro_tilts["avoided_regions"] = [
            normalize_region(r) for r in macro_tilts.get("avoided_regions", [])
        ]
        context["macro_tilts"] = macro_tilts
        
        # 5. Ajouter métadonnées
        context["_meta"] = {
            "generated_at": datetime.now().isoformat(),
            "model": model,
            "tilt_config": TILT_CONFIG,
            "input_tokens": response.usage.prompt_tokens,
            "output_tokens": response.usage.completion_tokens,
            "is_fallback": False,
        }
        
        logger.info(f"✅ Contexte marché généré: régime={context.get('market_regime')}, confidence={context.get('confidence')}")
        
        # 6. Sauvegarder si demandé
        if save_to_file:
            out_path = Path(output_path) if output_path else data_path / "market_context.json"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(context, f, indent=2, ensure_ascii=False)
            logger.info(f"✅ Sauvegardé: {out_path}")
        
        return context
        
    except Exception as e:
        logger.error(f"❌ Erreur GPT: {e}")
        if fallback_on_error:
            context = get_fallback_context()
            if save_to_file:
                out_path = Path(output_path) if output_path else data_path / "market_context.json"
                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump(context, f, indent=2, ensure_ascii=False)
            return context
        raise


# ============= TILT APPLICATION (pour factors.py) =============

def apply_macro_tilts(
    sector: str,
    country: str,
    market_context: Dict[str, Any]
) -> float:
    """
    Applique les tilts tactiques basés sur market_context.
    
    IMPORTANT: Les valeurs numériques sont définies en Python (TILT_CONFIG),
    GPT fournit uniquement la politique (favored/avoided).
    
    Args:
        sector: Secteur de l'actif (sera normalisé)
        country: Pays de l'actif (sera normalisé)
        market_context: Contexte généré par generate_market_context()
    
    Returns:
        Tilt tactique total (clampé à [-max_tactical, +max_tactical])
    """
    tilts = market_context.get("macro_tilts", {})
    
    # Normaliser pour comparaison
    sector_norm = normalize_sector(sector) if sector else ""
    country_norm = normalize_region(country) if country else ""
    
    favored_sectors = tilts.get("favored_sectors", [])
    avoided_sectors = tilts.get("avoided_sectors", [])
    favored_regions = tilts.get("favored_regions", [])
    avoided_regions = tilts.get("avoided_regions", [])
    
    # Calculer tilts (valeurs FIXES définies en Python)
    sector_tilt = 0.0
    if sector_norm in favored_sectors:
        sector_tilt = TILT_CONFIG["favored"]
    elif sector_norm in avoided_sectors:
        sector_tilt = TILT_CONFIG["avoided"]
    
    region_tilt = 0.0
    if country_norm in favored_regions:
        region_tilt = TILT_CONFIG["favored"]
    elif country_norm in avoided_regions:
        region_tilt = TILT_CONFIG["avoided"]
    
    # Clamp au budget max
    total_tilt = sector_tilt + region_tilt
    max_tilt = TILT_CONFIG["max_tactical"]
    
    return max(-max_tilt, min(max_tilt, total_tilt))


def load_market_context(data_dir: str = "data") -> Dict[str, Any]:
    """
    Charge market_context.json existant ou retourne fallback.
    
    Pour utilisation dans factors.py et generate_portfolios.py.
    """
    path = Path(data_dir) / "market_context.json"
    
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                context = json.load(f)
            logger.info(f"✅ Chargé: {path}")
            return context
        except Exception as e:
            logger.warning(f"⚠️ Erreur lecture {path}: {e}")
    
    # Fallback vers macro_tilts.json (rétro-compatibilité)
    legacy_path = Path(data_dir) / "macro_tilts.json"
    if legacy_path.exists():
        try:
            with open(legacy_path, "r", encoding="utf-8") as f:
                legacy = json.load(f)
            logger.info(f"✅ Chargé (legacy): {legacy_path}")
            return {
                "market_regime": "neutral",
                "macro_tilts": legacy,
                "confidence": 0.7,
                "as_of": legacy.get("date", datetime.now().strftime("%Y-%m-%d")),
                "_meta": {"model": "legacy", "is_fallback": False}
            }
        except Exception as e:
            logger.warning(f"⚠️ Erreur lecture {legacy_path}: {e}")
    
    logger.warning("⚠️ Aucun contexte marché trouvé, utilisation du fallback neutre")
    return get_fallback_context()


# ============= CLI =============

if __name__ == "__main__":
    import argparse
    
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    
    parser = argparse.ArgumentParser(description="Génère market_context.json via GPT")
    parser.add_argument("--data-dir", default="data", help="Répertoire des données")
    parser.add_argument("--output", default=None, help="Fichier de sortie")
    parser.add_argument("--model", default="gpt-4o-mini", help="Modèle OpenAI")
    parser.add_argument("--no-save", action="store_true", help="Ne pas sauvegarder")
    args = parser.parse_args()
    
    print("=" * 60)
    print("🔄 GÉNÉRATION MARKET CONTEXT v1.0")
    print("=" * 60)
    
    context = generate_market_context(
        data_dir=args.data_dir,
        model=args.model,
        save_to_file=not args.no_save,
        output_path=args.output
    )
    
    print("\n📊 RÉSULTAT:")
    print(f"   Régime: {context.get('market_regime')}")
    print(f"   Confidence: {context.get('confidence')}")
    print(f"   Secteurs favorisés: {context.get('macro_tilts', {}).get('favored_sectors', [])}")
    print(f"   Secteurs évités: {context.get('macro_tilts', {}).get('avoided_sectors', [])}")
    print(f"   Régions favorisées: {context.get('macro_tilts', {}).get('favored_regions', [])}")
    print(f"   Régions évitées: {context.get('macro_tilts', {}).get('avoided_regions', [])}")
    print(f"   Trends: {context.get('key_trends', [])}")
    print(f"   Risques: {context.get('risks', [])}")
    print("=" * 60)
