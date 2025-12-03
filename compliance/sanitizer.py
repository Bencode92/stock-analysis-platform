# compliance/sanitizer.py
"""
Sanitisation du langage marketing et termes interdits.

Nettoie les textes générés par le LLM pour :
- Supprimer les termes promotionnels interdits (AMF)
- Neutraliser le langage trop affirmatif
- Remplacer les superlatifs par des formulations neutres
"""

import re
from typing import List, Tuple, Dict, Optional
import logging

logger = logging.getLogger("compliance.sanitizer")


# ============= TERMES INTERDITS =============

FORBIDDEN_TERMS = [
    # Garanties illusoires
    "garanti", "garantie", "sans risque", "100% sûr", "certain", "certitude",
    "assuré", "infaillible", "impossible de perdre",
    
    # Superlatifs promotionnels
    "meilleur", "le plus", "optimal", "parfait", "idéal", "inégalé",
    "exceptionnel", "extraordinaire", "unique", "incomparable",
    
    # Promesses de rendement
    "rendement assuré", "gains garantis", "profits certains",
    "vous allez gagner", "fortune", "enrichissement",
    "multiplication", "doubler", "tripler",
    
    # Urgence artificielle
    "opportunité unique", "dernière chance", "ne ratez pas",
    "offre limitée", "maintenant ou jamais", "urgent",
    "avant qu'il ne soit trop tard",
    
    # Fausse expertise
    "secret", "méthode secrète", "astuce", "technique infaillible",
    "les experts", "tout le monde sait",
    
    # Minimisation des risques
    "risque minime", "quasi nul", "négligeable", "sans danger",
    "en toute sécurité", "sereinement",
]

# Patterns regex pour détection
FORBIDDEN_PATTERNS = [
    r"garanti[es]?",
    r"sans\s+risque",
    r"100\s*%\s*s[uû]r",
    r"rendement\s+assur[ée]",
    r"gains?\s+garanti",
    r"opportunit[ée]\s+unique",
    r"derni[eè]re\s+chance",
    r"meilleur[es]?\s+(du\s+march[ée]|investissement)",
    r"ne\s+(ratez|manquez)\s+pas",
    r"fortun[ee]s?",
    r"enrichi(r|ssement)",
    r"doubler\s+(votre|son|vos)",
    r"tripler\s+(votre|son|vos)",
]


# ============= REMPLACEMENTS =============

REPLACEMENTS = {
    # Superlatifs → Neutre
    "meilleur": "adapté",
    "le plus performant": "performant",
    "optimal": "approprié",
    "parfait": "adapté",
    "idéal": "approprié",
    "exceptionnel": "notable",
    "extraordinaire": "significatif",
    "unique": "spécifique",
    
    # Garanties → Conditionnel
    "garanti": "potentiel",
    "certain": "possible",
    "assuré": "envisagé",
    "infaillible": "basé sur une méthodologie",
    
    # Promesses → Objectifs
    "vous allez gagner": "l'objectif est de générer",
    "gains garantis": "objectif de rendement",
    "profits certains": "potentiel de plus-value",
    
    # Urgence → Neutre
    "opportunité unique": "opportunité identifiée",
    "dernière chance": "période favorable",
    "ne ratez pas": "considérez",
    
    # Risque → Réaliste
    "sans risque": "avec un niveau de risque maîtrisé",
    "risque minime": "risque existant mais limité",
    "en toute sécurité": "selon une approche prudente",
}


# ============= FONCTIONS PRINCIPALES =============

def check_forbidden_terms(text: str) -> Tuple[bool, List[str]]:
    """
    Vérifie la présence de termes interdits.
    
    Returns:
        (has_forbidden, list of found terms)
    """
    text_lower = text.lower()
    found = []
    
    # Vérifier les termes simples
    for term in FORBIDDEN_TERMS:
        if term.lower() in text_lower:
            found.append(term)
    
    # Vérifier les patterns regex
    for pattern in FORBIDDEN_PATTERNS:
        matches = re.findall(pattern, text_lower)
        found.extend(matches)
    
    # Dédupliquer
    found = list(set(found))
    
    return len(found) > 0, found


def sanitize_marketing_language(
    text: str,
    aggressive: bool = False,
    log_changes: bool = True
) -> str:
    """
    Nettoie le langage marketing d'un texte.
    
    Args:
        text: Texte à nettoyer
        aggressive: Mode agressif (supprime plus de termes)
        log_changes: Logger les modifications
    
    Returns:
        Texte nettoyé
    """
    original = text
    changes = []
    
    # Appliquer les remplacements
    for old, new in REPLACEMENTS.items():
        pattern = re.compile(re.escape(old), re.IGNORECASE)
        if pattern.search(text):
            text = pattern.sub(new, text)
            changes.append(f"'{old}' → '{new}'")
    
    # Mode agressif : supprimer les phrases entières avec termes interdits
    if aggressive:
        sentences = re.split(r'(?<=[.!?])\s+', text)
        clean_sentences = []
        
        for sentence in sentences:
            has_forbidden, _ = check_forbidden_terms(sentence)
            if not has_forbidden:
                clean_sentences.append(sentence)
            else:
                changes.append(f"Phrase supprimée: '{sentence[:50]}...'")
        
        text = " ".join(clean_sentences)
    
    # Neutraliser les superlatifs restants
    text = _neutralize_superlatives(text)
    
    # Logger les changements
    if log_changes and changes:
        logger.info(f"Sanitization: {len(changes)} modifications")
        for change in changes[:5]:  # Max 5 logs
            logger.debug(f"  - {change}")
    
    return text


def _neutralize_superlatives(text: str) -> str:
    """Neutralise les superlatifs courants."""
    patterns = [
        (r"\btrès\s+(bon|performant|rentable)\b", r"relativement \1"),
        (r"\bextrêmement\s+", "particulièrement "),
        (r"\bincroyablement\s+", ""),
        (r"\bénormément\s+", "significativement "),
        (r"\bfantastique\b", "intéressant"),
        (r"\bspectaculaire\b", "notable"),
        (r"\bimpressionnant\b", "significatif"),
    ]
    
    for pattern, replacement in patterns:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    
    return text


def sanitize_justification(justification: str, asset_name: str = "") -> str:
    """
    Nettoie une justification d'actif spécifique.
    Version légère pour les justifications individuelles.
    """
    text = justification
    
    # Supprimer les affirmations trop fortes
    strong_claims = [
        r"va\s+(monter|exploser|performer)",
        r"ne\s+peut\s+que\s+(monter|réussir)",
        r"succès\s+garanti",
        r"impossible\s+de\s+(perdre|échouer)",
    ]
    
    for pattern in strong_claims:
        text = re.sub(pattern, "présente un potentiel", text, flags=re.IGNORECASE)
    
    # Remplacer les certitudes par des possibilités
    certainties = [
        (r"\bva\s+surperformer\b", "pourrait surperformer"),
        (r"\bva\s+générer\b", "vise à générer"),
        (r"\best\s+certain\s+de\b", "a le potentiel de"),
        (r"\bsans\s+aucun\s+doute\b", "selon notre analyse"),
    ]
    
    for pattern, replacement in certainties:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    
    return text


def sanitize_portfolio_commentary(commentary: str) -> str:
    """
    Nettoie le commentaire global d'un portefeuille.
    """
    # Appliquer la sanitisation standard
    text = sanitize_marketing_language(commentary, aggressive=False)
    
    # Vérifications spécifiques aux commentaires
    # Ajouter des nuances si trop affirmatif
    affirmative_patterns = [
        (r"ce portefeuille (est|sera) le meilleur", 
         "ce portefeuille vise à être bien adapté"),
        (r"vous (allez|devez) investir",
         "vous pourriez considérer d'investir"),
        (r"performance exceptionnelle attendue",
         "potentiel de performance intéressant"),
    ]
    
    for pattern, replacement in affirmative_patterns:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    
    return text


# ============= VALIDATION COMPLÈTE =============

def full_compliance_check(text: str) -> Dict[str, any]:
    """
    Effectue une vérification compliance complète.
    
    Returns:
        {
            "is_compliant": bool,
            "forbidden_terms": [...],
            "warnings": [...],
            "sanitized_text": str
        }
    """
    has_forbidden, forbidden = check_forbidden_terms(text)
    
    warnings = []
    
    # Vérifier la longueur des phrases (trop longues = moins claires)
    sentences = re.split(r'[.!?]', text)
    for s in sentences:
        if len(s.split()) > 50:
            warnings.append(f"Phrase très longue ({len(s.split())} mots)")
    
    # Vérifier l'équilibre positif/négatif
    positive_words = len(re.findall(r'\b(opportunité|croissance|gain|hausse|positif)\b', text, re.I))
    negative_words = len(re.findall(r'\b(risque|perte|baisse|volatilité|prudence)\b', text, re.I))
    
    if positive_words > 0 and negative_words == 0:
        warnings.append("Texte trop positif, manque de mentions des risques")
    
    # Sanitiser
    sanitized = sanitize_marketing_language(text)
    
    return {
        "is_compliant": not has_forbidden and len(warnings) == 0,
        "forbidden_terms": forbidden,
        "warnings": warnings,
        "sanitized_text": sanitized,
        "changes_made": text != sanitized
    }


# ============= BATCH PROCESSING =============

def sanitize_all_justifications(justifications: Dict[str, str]) -> Dict[str, str]:
    """
    Nettoie toutes les justifications d'un portefeuille.
    """
    return {
        asset_id: sanitize_justification(text, asset_id)
        for asset_id, text in justifications.items()
    }


def sanitize_portfolio_output(portfolio_data: Dict) -> Dict:
    """
    Nettoie tous les textes d'un portefeuille.
    """
    result = portfolio_data.copy()
    
    # Justifications
    if "justifications" in result:
        result["justifications"] = sanitize_all_justifications(result["justifications"])
    
    # Commentaire
    if "comment" in result:
        result["comment"] = sanitize_portfolio_commentary(result["comment"])
    
    # Note: Ne pas toucher au bloc compliance (déjà validé)
    
    return result
