# portfolio_engine/llm_commentary.py
"""
Génération des commentaires et justifications via LLM.

v2.0 - Intégration sanitizer AMF:
- Filtrage strict des outputs LLM
- Logging des hits pour traçabilité
- Rapport sanitizer dans diagnostics

Le LLM ne décide PAS des poids — il génère uniquement :
- Justifications par ligne (≤50 mots)
- Commentaire global par portefeuille (≤200 mots)
- Bloc Compliance AMF

Prompt compact : ~1500 tokens (vs ~8000 avant)
"""

import json
import logging
import re
from typing import Dict, List, Any, Optional
from dataclasses import dataclass

# v2.0: Import du sanitizer AMF
try:
    from compliance.sanitizer import (
        sanitize_llm_output,
        sanitize_portfolio_commentary,
        sanitize_all_justifications,
        SanitizeReport,
    )
    HAS_SANITIZER = True
except ImportError:
    HAS_SANITIZER = False
    SanitizeReport = None

logger = logging.getLogger("portfolio_engine.llm_commentary")


# ============= PROMPT TEMPLATES =============

SYSTEM_PROMPT = """Tu es un analyste financier senior. Tu reçois des portefeuilles DÉJÀ OPTIMISÉS.
Tu génères UNIQUEMENT des justifications et commentaires. Tu ne modifies JAMAIS les poids.

RÈGLES STRICTES (conformité AMF):
- NE JAMAIS utiliser: "recommandé", "idéal", "parfait", "garanti", "certifié", "sans risque"
- NE JAMAIS utiliser: "adapté à vous", "pour vous", "selon votre profil"
- NE JAMAIS utiliser: "vous devriez", "vous devez", "il faut que vous"
- TOUJOURS utiliser des formulations neutres: "ce portefeuille modèle", "à titre informatif"
- TOUJOURS mentionner les risques

Réponds UNIQUEMENT en JSON valide, sans markdown."""

COMMENTARY_PROMPT_TEMPLATE = """# PORTEFEUILLES À COMMENTER

{portfolios_json}

# CONTEXTE MARCHÉ (résumé)
{market_brief}

# INSTRUCTIONS

Pour chaque portefeuille, génère :
1. `justifications` : dict {{asset_id: "justification ≤50 mots avec refs [BR], [MC], [SEC], [TH]"}}
2. `comment` : commentaire global ≤200 mots
3. `compliance` : bloc AMF (voir format ci-dessous)

## Références à utiliser :
- [BR] = Brief macro/géopolitique
- [MC] = Conditions de marché
- [SEC] = Analyse sectorielle
- [TH] = Thème d'investissement

## Format Compliance AMF :
"⚠️ AVERTISSEMENT : Ce portefeuille est généré à titre informatif uniquement et ne constitue pas un conseil en investissement. Les performances passées ne préjugent pas des performances futures. Investir comporte des risques de perte en capital. Consultez un conseiller financier agréé avant toute décision d'investissement."

# FORMAT DE SORTIE (JSON strict)

{{
  "Agressif": {{
    "justifications": {{"ASSET_ID": "justification...", ...}},
    "comment": "Commentaire global...",
    "compliance": "⚠️ AVERTISSEMENT : ..."
  }},
  "Modéré": {{ ... }},
  "Stable": {{ ... }}
}}

Réponds UNIQUEMENT avec le JSON, sans ```json ni autre texte."""


# ============= DATA CLASSES =============

@dataclass
class PortfolioForCommentary:
    """Portefeuille simplifié pour le prompt LLM."""
    profile: str
    allocation: Dict[str, float]  # {asset_id: weight%}
    assets_info: List[Dict[str, Any]]  # [{id, name, category, sector, score}]
    diagnostics: Dict[str, Any]


@dataclass
class Commentary:
    """Résultat du LLM pour un portefeuille."""
    justifications: Dict[str, str]
    comment: str
    compliance: str
    sanitizer_report: Optional[Dict] = None  # v2.0: Rapport de sanitization


# ============= PROMPT BUILDER =============

def build_portfolio_summary(
    allocation: Dict[str, float],
    assets: List[Any],
    diagnostics: Dict[str, Any],
    profile: str
) -> Dict[str, Any]:
    """
    Construit un résumé compact du portefeuille pour le prompt.
    """
    # Lookup des assets par ID
    asset_lookup = {a.id if hasattr(a, 'id') else a.get('id'): a for a in assets}
    
    lines = []
    for asset_id, weight in sorted(allocation.items(), key=lambda x: -x[1]):
        asset = asset_lookup.get(asset_id, {})
        if hasattr(asset, 'name'):
            name = asset.name
            category = asset.category
            sector = asset.sector
            score = asset.score
        else:
            name = asset.get('name', asset_id)
            category = asset.get('category', 'Unknown')
            sector = asset.get('sector', 'Unknown')
            score = asset.get('score', 0)
        
        lines.append({
            "id": asset_id,
            "name": name,
            "weight": weight,
            "category": category,
            "sector": sector,
            "score": round(score, 2)
        })
    
    return {
        "profile": profile,
        "vol_realized": diagnostics.get("portfolio_vol", "N/A"),
        "vol_target": diagnostics.get("vol_target", "N/A"),
        "n_assets": len(allocation),
        "holdings": lines
    }


def build_market_brief(
    brief_data: Optional[Dict] = None,
    max_points: int = 5
) -> str:
    """
    Construit un résumé marché compact pour le contexte.
    """
    if not brief_data:
        return "Contexte : marchés globalement stables, focus sur la diversification."
    
    points = []
    
    # Extraire les points clés du brief
    if "macro" in brief_data:
        macro = brief_data["macro"]
        if isinstance(macro, list):
            points.extend(macro[:2])
        elif isinstance(macro, str):
            points.append(macro[:200])
    
    if "sectors" in brief_data:
        sectors = brief_data["sectors"]
        if isinstance(sectors, dict):
            bullish = sectors.get("bullish", [])[:2]
            bearish = sectors.get("bearish", [])[:1]
            if bullish:
                points.append(f"Secteurs favorables: {', '.join(bullish)}")
            if bearish:
                points.append(f"Secteurs à éviter: {', '.join(bearish)}")
    
    if "themes" in brief_data:
        themes = brief_data["themes"]
        if isinstance(themes, list):
            points.append(f"Thèmes: {', '.join(themes[:3])}")
    
    # Limiter et formater
    points = points[:max_points]
    if not points:
        return "Contexte : environnement de marché mixte."
    
    return "\n".join(f"- {p}" for p in points)


def build_commentary_prompt(
    portfolios: Dict[str, Dict],
    assets: List[Any],
    brief_data: Optional[Dict] = None
) -> str:
    """
    Construit le prompt complet pour le LLM.
    
    Args:
        portfolios: {profile: {"allocation": {...}, "diagnostics": {...}}}
        assets: Liste des assets (pour lookup)
        brief_data: Données de contexte marché (optionnel)
    
    Returns:
        Prompt formaté (~1500 tokens)
    """
    # Construire les résumés de portefeuilles
    portfolios_summary = {}
    for profile, data in portfolios.items():
        portfolios_summary[profile] = build_portfolio_summary(
            allocation=data["allocation"],
            assets=assets,
            diagnostics=data.get("diagnostics", {}),
            profile=profile
        )
    
    # Brief marché
    market_brief = build_market_brief(brief_data)
    
    # Assembler le prompt
    prompt = COMMENTARY_PROMPT_TEMPLATE.format(
        portfolios_json=json.dumps(portfolios_summary, indent=2, ensure_ascii=False),
        market_brief=market_brief
    )
    
    return prompt


# ============= RESPONSE PARSER =============

def parse_llm_response(response_text: str) -> Dict[str, Commentary]:
    """
    Parse la réponse JSON du LLM.
    Gère les erreurs de format courantes.
    """
    # Nettoyer la réponse
    text = response_text.strip()
    
    # Supprimer les blocs markdown si présents
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    
    # Tenter le parsing JSON
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Erreur parsing JSON LLM: {e}")
        logger.debug(f"Réponse brute: {text[:500]}...")
        
        # Tentative de réparation basique
        data = _repair_json(text)
        if data is None:
            raise ValueError(f"Impossible de parser la réponse LLM: {e}")
    
    # Convertir en objets Commentary
    result = {}
    for profile in ["Agressif", "Modéré", "Stable"]:
        if profile in data:
            profile_data = data[profile]
            result[profile] = Commentary(
                justifications=profile_data.get("justifications", {}),
                comment=profile_data.get("comment", ""),
                compliance=profile_data.get("compliance", _default_compliance())
            )
        else:
            logger.warning(f"Profil {profile} manquant dans la réponse LLM")
            result[profile] = Commentary(
                justifications={},
                comment="",
                compliance=_default_compliance()
            )
    
    return result


def _repair_json(text: str) -> Optional[Dict]:
    """Tentative de réparation JSON basique."""
    import re
    
    # Trouver le premier { et le dernier }
    start = text.find('{')
    end = text.rfind('}')
    
    if start == -1 or end == -1:
        return None
    
    json_str = text[start:end+1]
    
    # Corrections courantes
    json_str = re.sub(r',\s*}', '}', json_str)  # Trailing commas
    json_str = re.sub(r',\s*]', ']', json_str)
    
    try:
        return json.loads(json_str)
    except:
        return None


def _default_compliance() -> str:
    """Compliance AMF par défaut."""
    return (
        "⚠️ AVERTISSEMENT : Ce portefeuille est généré à titre informatif uniquement "
        "et ne constitue pas un conseil en investissement. Les performances passées "
        "ne préjugent pas des performances futures. Investir comporte des risques de "
        "perte en capital. Consultez un conseiller financier agréé avant toute décision "
        "d'investissement."
    )


# ============= v2.0: SANITIZATION POST-LLM =============

def _sanitize_commentary(commentary: Dict[str, Commentary]) -> Dict[str, Commentary]:
    """
    v2.0: Applique le sanitizer AMF sur les outputs LLM.
    
    Stratégie:
    1. Sanitize chaque justification
    2. Sanitize chaque commentaire global
    3. Log les hits pour audit
    4. Stocker le rapport dans Commentary
    """
    if not HAS_SANITIZER:
        logger.warning("[SANITIZER] Module compliance.sanitizer non disponible")
        return commentary
    
    sanitized = {}
    total_hits = 0
    total_warnings = 0
    
    for profile, c in commentary.items():
        # Sanitize justifications
        cleaned_justifications, just_reports = sanitize_all_justifications(c.justifications)
        
        # Sanitize comment
        cleaned_comment = sanitize_portfolio_commentary(c.comment)
        
        # Collecter les stats
        profile_hits = sum(len(r.hits) for r in just_reports.values())
        profile_warnings = sum(len(r.warnings) for r in just_reports.values())
        
        # Créer le rapport agrégé
        sanitizer_report = {
            "profile": profile,
            "justifications_cleaned": len([r for r in just_reports.values() if r.sanitized]),
            "total_hits": profile_hits,
            "total_warnings": profile_warnings,
            "hit_labels": list(set(h[0] for r in just_reports.values() for h in r.hits)),
        }
        
        sanitized[profile] = Commentary(
            justifications=cleaned_justifications,
            comment=cleaned_comment,
            compliance=c.compliance,
            sanitizer_report=sanitizer_report,
        )
        
        total_hits += profile_hits
        total_warnings += profile_warnings
        
        if profile_hits > 0:
            logger.info(
                f"[SANITIZER] {profile}: {profile_hits} hits removed, "
                f"{profile_warnings} warnings"
            )
    
    if total_hits > 0:
        logger.warning(
            f"[SANITIZER] TOTAL: {total_hits} forbidden patterns removed from LLM output"
        )
    
    return sanitized


# ============= LLM CLIENT =============

async def generate_commentary_async(
    portfolios: Dict[str, Dict],
    assets: List[Any],
    brief_data: Optional[Dict] = None,
    openai_client: Any = None,
    model: str = "gpt-4o-mini"
) -> Dict[str, Commentary]:
    """
    Génère les commentaires via l'API OpenAI (async).
    
    v2.0: Applique le sanitizer AMF sur les outputs.
    
    Args:
        portfolios: {profile: {"allocation": {...}, "diagnostics": {...}}}
        assets: Liste des assets
        brief_data: Contexte marché
        openai_client: Client OpenAI initialisé
        model: Modèle à utiliser
    
    Returns:
        {profile: Commentary}
    """
    if openai_client is None:
        raise ValueError("openai_client requis")
    
    prompt = build_commentary_prompt(portfolios, assets, brief_data)
    
    logger.info(f"Prompt LLM: ~{len(prompt.split())} mots")
    
    response = await openai_client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3,
        max_tokens=2000
    )
    
    response_text = response.choices[0].message.content
    commentary = parse_llm_response(response_text)
    
    # v2.0: Sanitization AMF
    commentary = _sanitize_commentary(commentary)
    
    return commentary


def generate_commentary_sync(
    portfolios: Dict[str, Dict],
    assets: List[Any],
    brief_data: Optional[Dict] = None,
    openai_client: Any = None,
    model: str = "gpt-4o-mini"
) -> Dict[str, Commentary]:
    """
    Génère les commentaires via l'API OpenAI (sync).
    
    v2.0: Applique le sanitizer AMF sur les outputs.
    """
    if openai_client is None:
        raise ValueError("openai_client requis")
    
    prompt = build_commentary_prompt(portfolios, assets, brief_data)
    
    logger.info(f"Prompt LLM: ~{len(prompt.split())} mots")
    
    response = openai_client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3,
        max_tokens=2000
    )
    
    response_text = response.choices[0].message.content
    commentary = parse_llm_response(response_text)
    
    # v2.0: Sanitization AMF
    commentary = _sanitize_commentary(commentary)
    
    return commentary


# ============= MERGE RESULTS =============

def merge_commentary_into_portfolios(
    portfolios: Dict[str, Dict],
    commentary: Dict[str, Commentary]
) -> Dict[str, Dict]:
    """
    Fusionne les commentaires LLM dans les portefeuilles.
    
    v2.0: Inclut le rapport sanitizer dans les diagnostics.
    
    Returns:
        Portefeuilles enrichis avec justifications, comment, compliance
    """
    result = {}
    
    for profile, data in portfolios.items():
        result[profile] = {
            **data,
            "justifications": {},
            "comment": "",
            "compliance": _default_compliance()
        }
        
        if profile in commentary:
            c = commentary[profile]
            result[profile]["justifications"] = c.justifications
            result[profile]["comment"] = c.comment
            result[profile]["compliance"] = c.compliance
            
            # v2.0: Ajouter le rapport sanitizer aux diagnostics
            if c.sanitizer_report:
                if "diagnostics" not in result[profile]:
                    result[profile]["diagnostics"] = {}
                result[profile]["diagnostics"]["llm_sanitizer"] = c.sanitizer_report
    
    return result


# ============= FALLBACK SANS LLM =============

def generate_fallback_commentary(
    portfolios: Dict[str, Dict],
    assets: List[Any]
) -> Dict[str, Commentary]:
    """
    Génère des commentaires basiques sans LLM (fallback).
    Utile en cas d'erreur API ou pour les tests.
    """
    asset_lookup = {
        (a.id if hasattr(a, 'id') else a.get('id')): a 
        for a in assets
    }
    
    result = {}
    
    for profile, data in portfolios.items():
        allocation = data.get("allocation", {})
        diag = data.get("diagnostics", {})
        
        # Justifications génériques
        justifications = {}
        for asset_id, weight in allocation.items():
            asset = asset_lookup.get(asset_id, {})
            name = asset.name if hasattr(asset, 'name') else asset.get('name', asset_id)
            category = asset.category if hasattr(asset, 'category') else asset.get('category', 'Actif')
            sector = asset.sector if hasattr(asset, 'sector') else asset.get('sector', '')
            
            justifications[asset_id] = (
                f"{name} ({weight:.1f}%) : {category} "
                f"{'du secteur ' + sector if sector else ''} "
                f"sélectionné pour son profil risque/rendement dans ce portefeuille modèle {profile}."
            )
        
        # Commentaire générique
        n_assets = len(allocation)
        vol = diag.get("portfolio_vol", "N/A")
        comment = (
            f"Portefeuille modèle {profile} composé de {n_assets} lignes avec une volatilité "
            f"estimée de {vol}%. L'allocation vise un équilibre entre performance et "
            f"gestion du risque. Ce portefeuille est présenté à titre informatif uniquement."
        )
        
        result[profile] = Commentary(
            justifications=justifications,
            comment=comment,
            compliance=_default_compliance()
        )
    
    return result


# ============= EXEMPLE D'UTILISATION =============

if __name__ == "__main__":
    # Test du builder de prompt
    test_portfolios = {
        "Agressif": {
            "allocation": {"AAPL": 12.5, "MSFT": 10.0, "BTC": 8.0},
            "diagnostics": {"portfolio_vol": 18.5, "vol_target": 18}
        },
        "Modéré": {
            "allocation": {"AAPL": 8.0, "BOND_1": 15.0},
            "diagnostics": {"portfolio_vol": 11.2, "vol_target": 12}
        },
        "Stable": {
            "allocation": {"BOND_1": 25.0, "BOND_2": 20.0},
            "diagnostics": {"portfolio_vol": 7.5, "vol_target": 8}
        }
    }
    
    test_assets = [
        {"id": "AAPL", "name": "Apple", "category": "Actions", "sector": "Technology", "score": 0.8},
        {"id": "MSFT", "name": "Microsoft", "category": "Actions", "sector": "Technology", "score": 0.7},
        {"id": "BTC", "name": "Bitcoin", "category": "Crypto", "sector": "Crypto", "score": 1.0},
        {"id": "BOND_1", "name": "iShares Euro Govt", "category": "Obligations", "sector": "Bonds", "score": 0.3},
        {"id": "BOND_2", "name": "Vanguard Bonds", "category": "Obligations", "sector": "Bonds", "score": 0.25},
    ]
    
    prompt = build_commentary_prompt(test_portfolios, test_assets)
    print(f"Prompt généré ({len(prompt.split())} mots):\n")
    print(prompt[:2000])
    print("\n... [tronqué]")
    
    # Test fallback
    print("\n\nTest fallback (sans LLM):")
    fallback = generate_fallback_commentary(test_portfolios, test_assets)
    for profile, c in fallback.items():
        print(f"\n{profile}:")
        print(f"  Comment: {c.comment[:100]}...")
