# compliance/sanitizer.py
"""
Sanitisation du langage marketing et filtrage LLM pour conformité AMF.

v2.1 - Ajout patterns P0 compliance (ChatGPT + Claude review):
1. Patterns additionnels FR: "vous convient", "conseillé pour", "personnalisé pour"
2. Patterns additionnels EN: "tailored for you", "designed for you"
3. Amélioration détection "suitability" implicite

v2.0 - Refonte complète pour gates P0 conformité:
1. Filtrage LLM STRICT (suppression phrase entière)
2. Patterns FR + EN pour sites bilingues
3. Warning patterns (log sans suppression)
4. Rapport détaillé pour audit

Nettoie les textes générés par le LLM pour :
- Supprimer les termes de conseil personnalisé (AMF/MiFID)
- Supprimer les termes promotionnels interdits
- Neutraliser le langage trop affirmatif
- Remplacer les superlatifs par des formulations neutres
"""

import re
from typing import List, Tuple, Dict, Optional, Any
from dataclasses import dataclass, field
import logging

logger = logging.getLogger("compliance.sanitizer")


# ============= v2.1: PATTERNS LLM STRICTS (AMF/MiFID) =============

# Patterns INTERDITS - déclenchent suppression de la phrase entière
# Stratégie: supprimer la phrase > remplacer un mot (le sens "conseil" reste sinon)

LLM_FORBIDDEN_PATTERNS: List[Tuple[str, str]] = [
    # === FR: Recommandations personnalisées ===
    (r"\b(recommand(e|é|ée|és|ées|ons|ez|er)?|je\s+vous\s+recommande)\b", "recommandation"),
    (r"\b(adapt(e|é|ée|és|ées)?\s+(à|pour)\s+(vous|votre|vos|toi|ton|ta|tes))\b", "personnalisation"),
    (r"\b(vous\s+devriez|tu\s+devrais|il\s+faut\s+que\s+vous|vous\s+devez)\b", "injonction"),
    (r"\b(pour\s+vous|fait\s+pour\s+vous|correspond\s+à\s+votre)\b", "personnalisation_implicite"),
    (r"\b(selon\s+votre\s+profil|vu\s+votre\s+situation)\b", "personnalisation_profil"),
    
    # === v2.1 FR: Patterns additionnels (review ChatGPT + Claude) ===
    (r"\b(vous\s+convient|te\s+convient|convient\s+à\s+votre)\b", "suitability_direct"),
    (r"\b(conseill[ée]\s+(pour|à)\s+(vous|toi|votre))\b", "conseil_direct"),
    (r"\b(personnalis[ée]\s+(pour|à)\s+(vous|toi))\b", "personnalisation_directe"),
    (r"\b(sur\s+mesure\s+pour\s+(vous|votre))\b", "sur_mesure"),
    (r"\b(en\s+fonction\s+de\s+(vos|votre|tes|ton)\s+(besoins|objectifs|attentes))\b", "fonction_besoins"),
    (r"\b(correspond(ant)?\s+à\s+(vos|votre|tes|ton)\s+(attentes|besoins|objectifs|profil))\b", "correspondance_profil"),
    
    # === FR: Superlatifs et promesses ===
    (r"\b(idéal|parfait|excellent|formidable)\b", "superlatif"),
    (r"\b(meilleur(e|s|es)?|optim(al|ale|aux|ales)?)\b", "promesse_meilleur"),
    (r"\b(garanti(e|es|r|ssons)?|certifi(e|é|ée|és|ées|er)?)\b", "promesse_garantie"),
    (r"\b(sans\s+risque|risque\s+(zéro|nul)|aucun\s+risque)\b", "promesse_risque"),
    (r"\b(sûr(e|s|es)?|sécurisé(e|s|es)?|protégé(e|s|es)?)\b", "fausse_securite"),
    
    # === FR: Urgence et manipulation ===
    (r"\b(opportunit(é|e)\s+unique|chance\s+unique)\b", "urgence"),
    (r"\b(derni(è|e)re\s+chance|maintenant\s+ou\s+jamais)\b", "urgence_forte"),
    (r"\b(ne\s+(ratez|manquez)\s+pas|profitez\s+vite)\b", "urgence_action"),
    (r"\b(offre\s+limit[ée]e|temps\s+limit[ée])\b", "urgence_offre"),
    
    # === FR: Promesses de rendement ===
    (r"\b(rendement\s+(assuré|garanti)|gains?\s+garanti)\b", "promesse_rendement"),
    (r"\b(vous\s+allez\s+gagner|fortune\s+assurée)\b", "promesse_gains"),
    (r"\b(doubler|tripler)\s+(votre|vos|son|ses)\b", "promesse_multiplication"),
    (r"\b(enrichi(r|ssement)\s+(rapide|facile|assuré))\b", "promesse_enrichissement"),
    
    # === EN: Personal recommendations ===
    (r"\b(I\s+recommend|we\s+recommend|recommended\s+for\s+you)\b", "recommendation_en"),
    (r"\b(you\s+should|you\s+must|you\s+need\s+to)\b", "advice_en"),
    (r"\b(ideal\s+for\s+you|perfect\s+for\s+you|suited\s+to\s+you)\b", "personalization_en"),
    (r"\b(based\s+on\s+your\s+profile|given\s+your\s+situation)\b", "personalization_profile_en"),
    
    # === v2.1 EN: Patterns additionnels ===
    (r"\b(tailored\s+(for|to)\s+you)\b", "tailored_en"),
    (r"\b(designed\s+(for|with)\s+you)\b", "designed_en"),
    (r"\b(fits\s+your\s+(needs|profile|goals))\b", "fits_profile_en"),
    (r"\b(matches\s+your\s+(profile|situation|needs))\b", "matches_profile_en"),
    (r"\b(personalized\s+for\s+you)\b", "personalized_en"),
    (r"\b(customized\s+(for|to)\s+your)\b", "customized_en"),
    
    # === EN: Promises and guarantees ===
    (r"\b(guaranteed|risk[\s-]?free|no\s+risk)\b", "promise_en"),
    (r"\b(best|optimal|perfect|ideal)\s+(choice|option|investment)\b", "superlative_en"),
    (r"\b(certified|assured|secure\s+investment)\b", "guarantee_en"),
    (r"\b(can't\s+lose|cannot\s+fail|sure\s+thing)\b", "promise_sure_en"),
]

# Patterns WARNING - loggés mais pas supprimés (zone grise)
LLM_WARNING_PATTERNS: List[Tuple[str, str]] = [
    (r"\b(convient|approprié|adapté)\b", "suitability_hint"),
    (r"\b(performant|surperform(er|e|ance)?)\b", "performance_claim"),
    (r"\b(profil\s+(prudent|dynamique|agressif|modéré|stable))\b", "profile_mention"),
    (r"\b(investisseur(s)?\s+(prudent|dynamique|agressif))\b", "investor_profile"),
    (r"\b(suitable|appropriate|fits)\b", "suitability_hint_en"),
    # v2.1: Warnings additionnels
    (r"\b(croissance\s+(forte|rapide|exceptionnelle))\b", "growth_claim"),
    (r"\b(potentiel\s+(énorme|exceptionnel|important))\b", "potential_claim"),
    (r"\b(outperform|beat\s+the\s+market)\b", "outperform_claim_en"),
]


# ============= TERMES MARKETING INTERDITS (legacy) =============

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

# Patterns regex pour détection (legacy)
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


# ============= v2.0: DATA CLASSES =============

@dataclass
class SanitizeReport:
    """Rapport détaillé de sanitization pour audit."""
    hits: List[Tuple[str, str]] = field(default_factory=list)  # (label, matched_text)
    warnings: List[Tuple[str, str]] = field(default_factory=list)
    removed_sentences: int = 0
    original_length: int = 0
    sanitized_length: int = 0
    
    @property
    def sanitized(self) -> bool:
        return self.removed_sentences > 0
    
    @property
    def removal_ratio(self) -> float:
        if self.original_length == 0:
            return 0.0
        return 1 - (self.sanitized_length / self.original_length)
    
    def to_dict(self) -> Dict[str, Any]:
        """Sérialisation pour JSON/diagnostics."""
        return {
            "sanitized": self.sanitized,
            "removed_sentences": self.removed_sentences,
            "hits": [(label, match) for label, match in self.hits],
            "warnings": [(label, match) for label, match in self.warnings],
            "removal_ratio": round(self.removal_ratio, 3),
            "original_length": self.original_length,
            "sanitized_length": self.sanitized_length,
        }


# ============= v2.0: FONCTIONS PRINCIPALES LLM =============

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def sanitize_llm_output(
    text: str,
    replacement: str = "",
    strict: bool = True,
    log_hits: bool = True
) -> Tuple[str, SanitizeReport]:
    """
    Filtre les outputs LLM pour conformité AMF.
    
    STRATÉGIE STRICTE: Supprime la phrase ENTIÈRE contenant un pattern interdit.
    Remplacer juste un mot laisse le sens "conseil" → insuffisant.
    
    Args:
        text: Texte brut du LLM
        replacement: Texte de remplacement (vide = suppression)
        strict: Si True, supprime la phrase entière; sinon juste le mot
        log_hits: Logger les hits pour audit
    
    Returns:
        (texte_nettoyé, rapport)
    """
    if not text:
        return text, SanitizeReport()
    
    report = SanitizeReport(original_length=len(text))
    sentences = _SENTENCE_SPLIT.split(text.strip())
    kept = []
    
    for sentence in sentences:
        s = sentence.strip()
        if not s:
            continue
        
        forbidden = False
        
        # Check forbidden patterns (suppression)
        for pattern, label in LLM_FORBIDDEN_PATTERNS:
            match = re.search(pattern, s, flags=re.IGNORECASE)
            if match:
                report.hits.append((label, match.group(0)))
                forbidden = True
                if log_hits:
                    logger.warning(
                        f"[SANITIZER] FORBIDDEN [{label}]: '{match.group(0)}' "
                        f"in: \"{s[:60]}...\""
                    )
        
        # Check warning patterns (log only, no removal)
        for pattern, label in LLM_WARNING_PATTERNS:
            match = re.search(pattern, s, flags=re.IGNORECASE)
            if match:
                report.warnings.append((label, match.group(0)))
                if log_hits:
                    logger.info(
                        f"[SANITIZER] WARNING [{label}]: '{match.group(0)}'"
                    )
        
        if forbidden:
            report.removed_sentences += 1
            if replacement:
                kept.append(replacement)
        else:
            kept.append(s)
    
    result = " ".join(kept).strip()
    report.sanitized_length = len(result)
    
    # Alerte si trop de contenu supprimé
    if report.removal_ratio > 0.5:
        logger.error(
            f"[SANITIZER] ALERT: Removed >50% of content ({report.removal_ratio:.0%}). "
            f"Check LLM prompt or model behavior. Hits: {[h[0] for h in report.hits]}"
        )
    
    if report.sanitized:
        logger.info(
            f"[SANITIZER] Cleaned: {report.removed_sentences} sentences removed, "
            f"{len(report.hits)} hits, {len(report.warnings)} warnings"
        )
    
    return result, report


def check_text_compliance(text: str) -> Tuple[bool, List[str]]:
    """
    Vérifie la conformité sans modifier.
    Utile pour audit pré-déploiement.
    
    Returns:
        (is_compliant, list_of_issues)
    """
    _, report = sanitize_llm_output(text, strict=True, log_hits=False)
    
    issues = []
    for label, matched in report.hits:
        issues.append(f"❌ INTERDIT [{label}]: '{matched}'")
    for label, matched in report.warnings:
        issues.append(f"⚠️ ATTENTION [{label}]: '{matched}'")
    
    return len(report.hits) == 0, issues


# ============= FONCTIONS LEGACY (compatibilité) =============

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
    v2.0: Utilise aussi le filtrage LLM strict.
    """
    # v2.0: D'abord appliquer le filtrage LLM strict
    text, _ = sanitize_llm_output(commentary, strict=True, log_hits=True)
    
    # Puis appliquer la sanitisation marketing legacy
    text = sanitize_marketing_language(text, aggressive=False)
    
    # Vérifications spécifiques aux commentaires
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

def full_compliance_check(text: str) -> Dict[str, Any]:
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
    # v2.0: Utiliser le nouveau check
    is_compliant, issues = check_text_compliance(text)
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
    sanitized, report = sanitize_llm_output(text)
    sanitized = sanitize_marketing_language(sanitized)
    
    return {
        "is_compliant": is_compliant and not has_forbidden and len(warnings) == 0,
        "forbidden_terms": forbidden,
        "llm_hits": [h[0] for h in report.hits],
        "warnings": warnings,
        "issues": issues,
        "sanitized_text": sanitized,
        "changes_made": text != sanitized,
        "sanitizer_report": report.to_dict(),
    }


# ============= BATCH PROCESSING =============

def sanitize_all_justifications(justifications: Dict[str, str]) -> Tuple[Dict[str, str], Dict[str, SanitizeReport]]:
    """
    Nettoie toutes les justifications d'un portefeuille.
    
    Returns:
        (justifications_nettoyées, rapports_par_asset)
    """
    cleaned = {}
    reports = {}
    
    for asset_id, text in justifications.items():
        # v2.0: Appliquer le filtrage LLM
        sanitized, report = sanitize_llm_output(text, strict=True, log_hits=True)
        # Puis la sanitisation legacy
        sanitized = sanitize_justification(sanitized, asset_id)
        cleaned[asset_id] = sanitized
        reports[asset_id] = report
    
    return cleaned, reports


def sanitize_portfolio_output(portfolio_data: Dict) -> Dict:
    """
    Nettoie tous les textes d'un portefeuille.
    """
    result = portfolio_data.copy()
    
    # Justifications
    if "justifications" in result:
        result["justifications"], _ = sanitize_all_justifications(result["justifications"])
    
    # Commentaire
    if "comment" in result:
        result["comment"] = sanitize_portfolio_commentary(result["comment"])
    
    # Note: Ne pas toucher au bloc compliance (déjà validé)
    
    return result
