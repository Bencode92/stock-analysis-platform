# portfolio_engine/llm_commentary.py
"""
Génération des commentaires et justifications via LLM.

v2.1 - Fix P0 sanitizer vide:
- Prompt renforcé avec liste explicite de mots interdits
- Exigence minimum 4 phrases + 2 mentions risques
- Fallback déterministe si sanitizer supprime >50%

v2.0 - Intégration sanitizer AMF:
- Filtrage strict des outputs LLM
- Logging des hits pour traçabilité
- Rapport sanitizer dans diagnostics

Le LLM ne décide PAS des poids — il génère uniquement :
- Justifications par ligne (≤50 mots)
- Commentaire global par portefeuille (≤200 mots)
- Bloc Compliance AMF
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

# v2.1: Liste explicite des mots qui déclenchent le sanitizer
FORBIDDEN_WORDS_BLOCK = """
MOTS STRICTEMENT INTERDITS (déclenchent suppression automatique de la phrase):
- "sûr", "sûrs", "sûre", "sûres" → utiliser: "à faible volatilité", "historiquement stable"
- "sécurisé", "sécurisés" → utiliser: "avec un profil défensif"
- "protégé", "protégés" → utiliser: "avec une exposition limitée"
- "garanti", "garantie" → utiliser: "vise à", "a pour objectif"
- "sans risque" → INTERDIT (tout investissement comporte des risques)
- "recommandé", "recommander" → utiliser: "ce portefeuille modèle présente"
- "idéal", "parfait", "optimal" → utiliser: "adapté", "approprié", "cohérent"
- "vous devriez", "vous devez" → utiliser: formulations impersonnelles
- "adapté à vous", "pour vous" → utiliser: "ce portefeuille modèle"
"""

SYSTEM_PROMPT = f"""Tu es un analyste financier senior. Tu reçois des portefeuilles DÉJÀ OPTIMISÉS.
Tu génères UNIQUEMENT des justifications et commentaires. Tu ne modifies JAMAIS les poids.

RÈGLES STRICTES (conformité AMF):
{FORBIDDEN_WORDS_BLOCK}

RÈGLES DE STRUCTURE OBLIGATOIRES:
- Chaque commentaire DOIT contenir MINIMUM 4 phrases complètes
- Chaque commentaire DOIT mentionner AU MOINS 2 risques ou limites
- Utiliser des formulations neutres: "ce portefeuille modèle", "à titre informatif"
- Terminer par une mention des risques

Réponds UNIQUEMENT en JSON valide, sans markdown."""

COMMENTARY_PROMPT_TEMPLATE = """# PORTEFEUILLES À COMMENTER

{portfolios_json}

# CONTEXTE MARCHÉ (résumé)
{market_brief}

# INSTRUCTIONS

Pour chaque portefeuille, génère :
1. `justifications` : dict {{asset_id: "justification ≤50 mots avec refs [BR], [MC], [SEC], [TH]"}}
2. `comment` : commentaire global de 4-6 phrases (≤200 mots), incluant 2 mentions de risques
3. `compliance` : bloc AMF (voir format ci-dessous)

## Références à utiliser :
- [BR] = Brief macro/géopolitique
- [MC] = Conditions de marché
- [SEC] = Analyse sectorielle
- [TH] = Thème d'investissement

## Format Compliance AMF :
"⚠️ AVERTISSEMENT : Ce portefeuille est généré à titre informatif uniquement et ne constitue pas un conseil en investissement. Les performances passées ne préjugent pas des performances futures. Investir comporte des risques de perte en capital. Consultez un conseiller financier agréé avant toute décision d'investissement."

## RAPPEL CRITIQUE - Ne JAMAIS utiliser ces mots (sinon phrase supprimée):
- sûr/sûrs/sûre → "à faible volatilité"
- sécurisé → "avec un profil défensif"
- garanti → "vise à"
- sans risque → INTERDIT
- recommandé → "ce portefeuille présente"

# FORMAT DE SORTIE (JSON strict)

{{
  "Agressif": {{
    "justifications": {{"ASSET_ID": "justification...", ...}},
    "comment": "Commentaire global 4-6 phrases incluant risques...",
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
    used_fallback: bool = False  # v2.1: Flag si fallback utilisé


# ============= v2.1: FALLBACK TEMPLATES =============

FALLBACK_COMMENTS = {
    "Agressif": (
        "Ce portefeuille modèle Agressif présente une allocation orientée croissance "
        "avec une volatilité cible élevée. La diversification sectorielle et géographique "
        "vise à capturer le potentiel de hausse des marchés actions. "
        "Toutefois, ce profil comporte un risque de perte en capital significatif "
        "en cas de correction des marchés. La volatilité historique peut entraîner "
        "des variations importantes de la valeur du portefeuille à court terme."
    ),
    "Modéré": (
        "Ce portefeuille modèle Modéré combine des actifs de croissance et des instruments "
        "à revenu fixe pour un équilibre rendement/risque. L'allocation vise une volatilité "
        "intermédiaire tout en maintenant un potentiel de performance. "
        "Le risque de perte en capital existe, notamment en période de stress de marché. "
        "La corrélation entre classes d'actifs peut augmenter en période de crise, "
        "réduisant les bénéfices de la diversification."
    ),
    "Stable": (
        "Ce portefeuille modèle Stable privilégie la préservation du capital avec une "
        "allocation majoritairement obligataire et des actifs à faible volatilité historique. "
        "L'objectif est de limiter les fluctuations tout en générant un rendement modéré. "
        "Malgré son profil défensif, ce portefeuille reste exposé au risque de taux "
        "et au risque de crédit. En période de hausse des taux, la valeur des obligations "
        "peut diminuer significativement."
    ),
}


def _generate_fallback_comment(profile: str, diagnostics: Dict[str, Any]) -> str:
    """
    v2.1: Génère un commentaire fallback déterministe si le LLM échoue ou
    si le sanitizer supprime trop de contenu.
    """
    base = FALLBACK_COMMENTS.get(profile, FALLBACK_COMMENTS["Modéré"])
    vol = diagnostics.get("portfolio_vol", "N/A")
    n_assets = diagnostics.get("n_assets", "plusieurs")
    
    return f"{base} Ce portefeuille compte {n_assets} lignes avec une volatilité estimée de {vol}%."


def _generate_fallback_justification(asset_id: str, asset_info: Dict, profile: str) -> str:
    """v2.1: Génère une justification fallback pour un actif."""
    name = asset_info.get("name", asset_id)
    category = asset_info.get("category", "Actif")
    sector = asset_info.get("sector", "")
    weight = asset_info.get("weight", 0)
    
    sector_part = f" du secteur {sector}" if sector and sector != "Unknown" else ""
    
    return (
        f"{name} ({weight:.1f}%) : {category}{sector_part} "
        f"sélectionné pour son profil risque/rendement dans ce portefeuille modèle {profile}. "
        f"Exposition soumise aux conditions de marché."
    )


# ============= PROMPT BUILDER =============

def build_portfolio_summary(
    allocation: Dict[str, float],
    assets: List[Any],
    diagnostics: Dict[str, Any],
    profile: str
) -> Dict[str, Any]:
    """Construit un résumé compact du portefeuille pour le prompt."""
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


def build_market_brief(brief_data: Optional[Dict] = None, max_points: int = 5) -> str:
    """Construit un résumé marché compact pour le contexte."""
    if not brief_data:
        return "Contexte : marchés globalement stables, focus sur la diversification."
    
    points = []
    
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
    
    points = points[:max_points]
    if not points:
        return "Contexte : environnement de marché mixte."
    
    return "\n".join(f"- {p}" for p in points)


def build_commentary_prompt(
    portfolios: Dict[str, Dict],
    assets: List[Any],
    brief_data: Optional[Dict] = None
) -> str:
    """Construit le prompt complet pour le LLM."""
    portfolios_summary = {}
    for profile, data in portfolios.items():
        portfolios_summary[profile] = build_portfolio_summary(
            allocation=data["allocation"],
            assets=assets,
            diagnostics=data.get("diagnostics", {}),
            profile=profile
        )
    
    market_brief = build_market_brief(brief_data)
    
    prompt = COMMENTARY_PROMPT_TEMPLATE.format(
        portfolios_json=json.dumps(portfolios_summary, indent=2, ensure_ascii=False),
        market_brief=market_brief
    )
    
    return prompt


# ============= RESPONSE PARSER =============

def parse_llm_response(response_text: str) -> Dict[str, Commentary]:
    """Parse la réponse JSON du LLM."""
    text = response_text.strip()
    
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Erreur parsing JSON LLM: {e}")
        logger.debug(f"Réponse brute: {text[:500]}...")
        
        data = _repair_json(text)
        if data is None:
            raise ValueError(f"Impossible de parser la réponse LLM: {e}")
    
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
    start = text.find('{')
    end = text.rfind('}')
    
    if start == -1 or end == -1:
        return None
    
    json_str = text[start:end+1]
    json_str = re.sub(r',\s*}', '}', json_str)
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


# ============= v2.0/2.1: SANITIZATION POST-LLM =============

def _sanitize_commentary(
    commentary: Dict[str, Commentary],
    portfolios: Optional[Dict[str, Dict]] = None
) -> Dict[str, Commentary]:
    """
    v2.0: Applique le sanitizer AMF sur les outputs LLM.
    v2.1: Utilise fallback si >50% du contenu supprimé.
    """
    if not HAS_SANITIZER:
        logger.warning("[SANITIZER] Module compliance.sanitizer non disponible")
        return commentary
    
    sanitized = {}
    total_hits = 0
    total_warnings = 0
    fallback_used = 0
    
    for profile, c in commentary.items():
        # Sanitize justifications
        cleaned_justifications, just_reports = sanitize_all_justifications(c.justifications)
        
        # Sanitize comment
        cleaned_comment = sanitize_portfolio_commentary(c.comment)
        
        # v2.1: Check if comment was mostly emptied
        used_fallback = False
        original_len = len(c.comment) if c.comment else 0
        cleaned_len = len(cleaned_comment) if cleaned_comment else 0
        
        if original_len > 0:
            removal_ratio = 1 - (cleaned_len / original_len)
            
            # Si >50% supprimé OU commentaire trop court → fallback
            if removal_ratio > 0.5 or cleaned_len < 100:
                logger.warning(
                    f"[SANITIZER] {profile}: {removal_ratio:.0%} removed, using fallback comment"
                )
                diag = {}
                if portfolios and profile in portfolios:
                    diag = portfolios[profile].get("diagnostics", {})
                    diag["n_assets"] = len(portfolios[profile].get("allocation", {}))
                
                cleaned_comment = _generate_fallback_comment(profile, diag)
                used_fallback = True
                fallback_used += 1
        elif original_len == 0:
            # Pas de commentaire du tout → fallback
            logger.warning(f"[SANITIZER] {profile}: Empty comment, using fallback")
            diag = {}
            if portfolios and profile in portfolios:
                diag = portfolios[profile].get("diagnostics", {})
                diag["n_assets"] = len(portfolios[profile].get("allocation", {}))
            cleaned_comment = _generate_fallback_comment(profile, diag)
            used_fallback = True
            fallback_used += 1
        
        # Collecter les stats
        profile_hits = sum(len(r.hits) for r in just_reports.values())
        profile_warnings = sum(len(r.warnings) for r in just_reports.values())
        
        sanitizer_report = {
            "profile": profile,
            "justifications_cleaned": len([r for r in just_reports.values() if r.sanitized]),
            "total_hits": profile_hits,
            "total_warnings": profile_warnings,
            "hit_labels": list(set(h[0] for r in just_reports.values() for h in r.hits)),
            "used_fallback": used_fallback,
        }
        
        sanitized[profile] = Commentary(
            justifications=cleaned_justifications,
            comment=cleaned_comment,
            compliance=c.compliance,
            sanitizer_report=sanitizer_report,
            used_fallback=used_fallback,
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
    
    if fallback_used > 0:
        logger.info(f"[SANITIZER] Used fallback comments for {fallback_used} profile(s)")
    
    return sanitized


# ============= LLM CLIENT =============

async def generate_commentary_async(
    portfolios: Dict[str, Dict],
    assets: List[Any],
    brief_data: Optional[Dict] = None,
    openai_client: Any = None,
    model: str = "gpt-4o-mini"
) -> Dict[str, Commentary]:
    """Génère les commentaires via l'API OpenAI (async)."""
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
    
    # v2.1: Pass portfolios for fallback generation
    commentary = _sanitize_commentary(commentary, portfolios)
    
    return commentary


def generate_commentary_sync(
    portfolios: Dict[str, Dict],
    assets: List[Any],
    brief_data: Optional[Dict] = None,
    openai_client: Any = None,
    model: str = "gpt-4o-mini"
) -> Dict[str, Commentary]:
    """Génère les commentaires via l'API OpenAI (sync)."""
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
    
    # v2.1: Pass portfolios for fallback generation
    commentary = _sanitize_commentary(commentary, portfolios)
    
    return commentary


# ============= MERGE RESULTS =============

def merge_commentary_into_portfolios(
    portfolios: Dict[str, Dict],
    commentary: Dict[str, Commentary]
) -> Dict[str, Dict]:
    """Fusionne les commentaires LLM dans les portefeuilles."""
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
            
            # v2.0/2.1: Ajouter le rapport sanitizer aux diagnostics
            if c.sanitizer_report:
                if "diagnostics" not in result[profile]:
                    result[profile]["diagnostics"] = {}
                result[profile]["diagnostics"]["llm_sanitizer"] = c.sanitizer_report
                result[profile]["diagnostics"]["used_fallback_comment"] = c.used_fallback
    
    return result


# ============= FALLBACK SANS LLM =============

def generate_fallback_commentary(
    portfolios: Dict[str, Dict],
    assets: List[Any]
) -> Dict[str, Commentary]:
    """Génère des commentaires basiques sans LLM (fallback complet)."""
    asset_lookup = {
        (a.id if hasattr(a, 'id') else a.get('id')): a 
        for a in assets
    }
    
    result = {}
    
    for profile, data in portfolios.items():
        allocation = data.get("allocation", {})
        diag = data.get("diagnostics", {})
        diag["n_assets"] = len(allocation)
        
        # Justifications génériques
        justifications = {}
        for asset_id, weight in allocation.items():
            asset = asset_lookup.get(asset_id, {})
            if hasattr(asset, 'name'):
                asset_info = {
                    "name": asset.name,
                    "category": asset.category,
                    "sector": asset.sector,
                    "weight": weight
                }
            else:
                asset_info = {
                    "name": asset.get('name', asset_id),
                    "category": asset.get('category', 'Actif'),
                    "sector": asset.get('sector', ''),
                    "weight": weight
                }
            justifications[asset_id] = _generate_fallback_justification(asset_id, asset_info, profile)
        
        # Commentaire fallback
        comment = _generate_fallback_comment(profile, diag)
        
        result[profile] = Commentary(
            justifications=justifications,
            comment=comment,
            compliance=_default_compliance(),
            used_fallback=True
        )
    
    return result


# ============= EXEMPLE D'UTILISATION =============

if __name__ == "__main__":
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
    
    print("\n\nTest fallback (sans LLM):")
    fallback = generate_fallback_commentary(test_portfolios, test_assets)
    for profile, c in fallback.items():
        print(f"\n{profile}:")
        print(f"  Comment: {c.comment[:100]}...")
