# compliance/amf.py
"""
Compliance AMF (Autorité des Marchés Financiers).

Gestion des disclaimers, avertissements et blocs réglementaires
conformes aux exigences AMF pour les communications financières.
"""

import re
from typing import List, Tuple, Optional
from datetime import datetime


# ============= DISCLAIMERS STANDARDS =============

AMF_DISCLAIMER = (
    "⚠️ AVERTISSEMENT : Ce portefeuille est généré à titre informatif uniquement "
    "et ne constitue pas un conseil en investissement. Les performances passées "
    "ne préjugent pas des performances futures. Investir comporte des risques de "
    "perte en capital. Consultez un conseiller financier agréé avant toute décision "
    "d'investissement."
)

AMF_DISCLAIMER_FULL = """⚠️ AVERTISSEMENT RÉGLEMENTAIRE

Ce document est fourni à titre d'information uniquement et ne constitue en aucun cas :
• Un conseil en investissement personnalisé
• Une recommandation d'achat ou de vente
• Une offre ou sollicitation d'offre de services financiers

RISQUES :
• Les performances passées ne préjugent pas des performances futures
• Tout investissement comporte un risque de perte en capital, partielle ou totale
• Les marchés financiers sont volatils et peuvent évoluer défavorablement

RECOMMANDATIONS :
• Consultez un conseiller financier agréé AMF avant toute décision d'investissement
• Assurez-vous que les produits correspondent à votre profil de risque
• Diversifiez vos investissements et n'investissez que ce que vous pouvez perdre

Ce contenu est généré automatiquement à des fins éducatives.
Il ne remplace pas l'avis d'un professionnel qualifié."""

AMF_DISCLAIMER_SHORT = (
    "⚠️ Information uniquement, pas un conseil d'investissement. "
    "Risque de perte en capital. Consultez un professionnel."
)


# ============= GÉNÉRATEUR DE BLOCS COMPLIANCE =============

def generate_compliance_block(
    profile: str,
    vol_estimate: Optional[float] = None,
    crypto_exposure: Optional[float] = None,
    include_crypto_warning: bool = True,
    format_type: str = "standard"
) -> str:
    """
    Génère un bloc compliance adapté au profil et à la composition.
    
    Args:
        profile: 'Agressif' | 'Modéré' | 'Stable'
        vol_estimate: Volatilité estimée du portefeuille (%)
        crypto_exposure: Exposition crypto (%)
        include_crypto_warning: Ajouter un avertissement crypto spécifique
        format_type: 'standard' | 'full' | 'short'
    
    Returns:
        Bloc compliance formaté
    """
    # Base selon le format
    if format_type == "full":
        base = AMF_DISCLAIMER_FULL
    elif format_type == "short":
        base = AMF_DISCLAIMER_SHORT
    else:
        base = AMF_DISCLAIMER
    
    # Avertissements additionnels selon le profil
    profile_warnings = {
        "Agressif": (
            "\n\n🔴 PROFIL AGRESSIF : Ce portefeuille présente un niveau de risque élevé. "
            "Il est destiné aux investisseurs ayant une tolérance au risque importante "
            "et un horizon d'investissement long terme (>5 ans)."
        ),
        "Modéré": (
            "\n\n🟡 PROFIL MODÉRÉ : Ce portefeuille présente un niveau de risque modéré. "
            "Il convient aux investisseurs acceptant une certaine volatilité "
            "avec un horizon moyen terme (3-5 ans)."
        ),
        "Stable": (
            "\n\n🟢 PROFIL STABLE : Ce portefeuille vise une volatilité réduite. "
            "Il convient aux investisseurs prudents avec un horizon court à moyen terme."
        ),
    }
    
    result = base
    
    # Ajouter le warning profil
    if profile in profile_warnings:
        result += profile_warnings[profile]
    
    # Avertissement volatilité si fournie
    if vol_estimate is not None:
        if vol_estimate > 20:
            result += (
                f"\n\n📊 Volatilité estimée : {vol_estimate:.1f}% (élevée). "
                "Les fluctuations de valeur peuvent être importantes."
            )
        elif vol_estimate > 12:
            result += (
                f"\n\n📊 Volatilité estimée : {vol_estimate:.1f}% (modérée)."
            )
    
    # Avertissement crypto si exposition
    if include_crypto_warning and crypto_exposure and crypto_exposure > 0:
        result += (
            f"\n\n₿ EXPOSITION CRYPTO ({crypto_exposure:.1f}%) : Les crypto-actifs sont "
            "des actifs hautement spéculatifs et volatils. Ils ne sont pas régulés "
            "et présentent un risque de perte totale du capital investi."
        )
    
    return result


# ============= VALIDATION COMPLIANCE =============

def validate_compliance_text(text: str) -> Tuple[bool, List[str]]:
    """
    Vérifie qu'un texte respecte les exigences compliance de base.
    
    Returns:
        (is_valid, list of issues)
    """
    issues = []
    
    # Vérifier la présence d'un avertissement
    has_warning = any(w in text.lower() for w in [
        "avertissement", "warning", "⚠️", "risque", "attention"
    ])
    if not has_warning:
        issues.append("Aucun avertissement détecté")
    
    # Vérifier mention du risque de perte
    has_risk_mention = any(r in text.lower() for r in [
        "perte en capital", "perte", "risque", "loss"
    ])
    if not has_risk_mention:
        issues.append("Pas de mention du risque de perte")
    
    # Vérifier non-conseil
    has_disclaimer = any(d in text.lower() for d in [
        "ne constitue pas", "pas un conseil", "informatif", 
        "not advice", "information only"
    ])
    if not has_disclaimer:
        issues.append("Pas de disclaimer 'ne constitue pas un conseil'")
    
    # Vérifier longueur minimale
    if len(text) < 100:
        issues.append("Bloc compliance trop court (<100 caractères)")
    
    return len(issues) == 0, issues


def ensure_compliance_present(
    portfolio_data: dict,
    fallback: str = AMF_DISCLAIMER
) -> dict:
    """
    S'assure qu'un bloc compliance est présent dans les données du portefeuille.
    Ajoute le fallback si manquant.
    """
    if "compliance" not in portfolio_data or not portfolio_data["compliance"]:
        portfolio_data["compliance"] = fallback
    
    # Valider le bloc existant
    is_valid, issues = validate_compliance_text(portfolio_data["compliance"])
    if not is_valid:
        # Log les problèmes et utiliser le fallback
        import logging
        logger = logging.getLogger("compliance.amf")
        logger.warning(f"Bloc compliance invalide: {issues}. Utilisation du fallback.")
        portfolio_data["compliance"] = fallback
    
    return portfolio_data


# ============= FORMATEURS =============

def format_compliance_html(compliance_text: str) -> str:
    """Formate le bloc compliance en HTML."""
    # Convertir les emojis en spans pour meilleur rendu
    html = compliance_text
    
    # Remplacer les sauts de ligne
    html = html.replace("\n\n", "</p><p>")
    html = html.replace("\n", "<br>")
    
    # Wrapper
    html = f'<div class="compliance-block"><p>{html}</p></div>'
    
    return html


def format_compliance_markdown(compliance_text: str) -> str:
    """Formate le bloc compliance en Markdown."""
    lines = compliance_text.split("\n")
    md_lines = []
    
    for line in lines:
        line = line.strip()
        if line.startswith("•"):
            md_lines.append(f"- {line[1:].strip()}")
        elif line.startswith("⚠️") or line.startswith("🔴") or line.startswith("🟡") or line.startswith("🟢"):
            md_lines.append(f"\n**{line}**\n")
        else:
            md_lines.append(line)
    
    return "\n".join(md_lines)


# ============= TIMESTAMP =============

def add_generation_timestamp(compliance_text: str) -> str:
    """Ajoute un timestamp de génération au bloc compliance."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M UTC")
    return f"{compliance_text}\n\n📅 Généré le {timestamp}"
