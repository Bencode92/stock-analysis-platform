# tests/test_sanitizer.py
"""
Tests unitaires pour le sanitizer AMF.

Couvre:
- Détection des patterns interdits (FR + EN)
- Préservation du texte neutre
- Sanitization partielle (seules phrases interdites supprimées)
- Warning patterns (loggés mais pas supprimés)
- Rapport de sanitization
- Fonction check_text_compliance
"""

import pytest
import sys
import os

# Ajouter le répertoire parent au path pour les imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from compliance.sanitizer import (
    sanitize_llm_output,
    check_text_compliance,
    sanitize_portfolio_commentary,
    sanitize_marketing_language,
    check_forbidden_terms,
    full_compliance_check,
    SanitizeReport,
)


class TestSanitizeLLMOutput:
    """Tests du sanitizer LLM principal."""
    
    @pytest.mark.parametrize("text,expected_label", [
        # FR: Recommandations
        ("Je vous recommande le profil Stable.", "recommandation"),
        ("Nous recommandons cet investissement.", "recommandation"),
        
        # FR: Personnalisation
        ("C'est adapté à vous.", "personnalisation"),
        ("Ce portefeuille est fait pour vous.", "personnalisation_implicite"),
        ("Selon votre profil, choisissez Stable.", "personnalisation_profil"),
        
        # FR: Injonctions
        ("Tu devrais choisir Modéré.", "injonction"),
        ("Vous devriez investir maintenant.", "injonction"),
        ("Il faut que vous achetiez.", "injonction"),
        
        # FR: Superlatifs
        ("C'est idéal pour les prudents.", "superlatif"),
        ("C'est parfait pour vous.", "superlatif"),
        
        # FR: Promesses
        ("Portefeuille garanti.", "promesse_garantie"),
        ("Mode certifié activé.", "promesse_garantie"),
        ("Investissement sans risque.", "promesse_risque"),
        ("C'est le meilleur choix.", "promesse_meilleur"),
        ("Solution optimale.", "promesse_meilleur"),
        
        # FR: Urgence
        ("Opportunité unique à saisir.", "urgence"),
        ("Dernière chance d'investir.", "urgence_forte"),
        ("Ne ratez pas cette occasion.", "urgence_action"),
        
        # EN: Recommendations
        ("I recommend this portfolio.", "recommendation_en"),
        ("This is recommended for you.", "recommendation_en"),
        
        # EN: Advice
        ("You should invest now.", "advice_en"),
        ("You must consider this.", "advice_en"),
        
        # EN: Personalization
        ("This is ideal for you.", "personalization_en"),
        ("Based on your profile, choose Stable.", "personalization_profile_en"),
        
        # EN: Promises
        ("This is guaranteed.", "promise_en"),
        ("Risk-free investment.", "promise_en"),
        ("The best choice for investors.", "superlative_en"),
    ])
    def test_forbidden_patterns_detected(self, text, expected_label):
        """Vérifie que les patterns interdits sont détectés et supprimés."""
        out, report = sanitize_llm_output(text, log_hits=False)
        
        assert report.sanitized is True, f"Expected sanitized=True for: {text}"
        assert any(
            label == expected_label for label, _ in report.hits
        ), f"Expected label '{expected_label}' in hits for: {text}. Got: {report.hits}"
        assert out == "", f"Expected empty output after sanitization for: {text}"
    
    def test_neutral_text_preserved(self):
        """Le texte neutre doit être préservé intégralement."""
        text = (
            "Voici un portefeuille modèle présenté à titre informatif. "
            "Il comporte un risque de perte en capital. "
            "Les performances passées ne préjugent pas des performances futures."
        )
        out, report = sanitize_llm_output(text, log_hits=False)
        
        assert report.sanitized is False
        assert out == text
        assert report.removed_sentences == 0
        assert len(report.hits) == 0
    
    def test_partial_sanitization(self):
        """Seules les phrases interdites sont supprimées."""
        text = (
            "Voici une allocation diversifiée. "
            "Je vous recommande ce portefeuille. "
            "Il contient 35% d'obligations."
        )
        out, report = sanitize_llm_output(text, log_hits=False)
        
        assert report.removed_sentences == 1
        assert "recommande" not in out.lower()
        assert "diversifiée" in out
        assert "obligations" in out
    
    def test_multiple_forbidden_in_same_sentence(self):
        """Une phrase avec plusieurs patterns interdits n'est supprimée qu'une fois."""
        text = "Je vous recommande ce portefeuille garanti parfait pour vous."
        out, report = sanitize_llm_output(text, log_hits=False)
        
        assert report.removed_sentences == 1
        assert len(report.hits) >= 2  # Plusieurs patterns détectés
        assert out == ""
    
    def test_warning_patterns_logged_not_removed(self):
        """Les patterns warning sont loggés mais pas supprimés."""
        text = "Ce portefeuille convient aux investisseurs prudents."
        out, report = sanitize_llm_output(text, log_hits=False)
        
        assert len(report.warnings) > 0
        assert report.removed_sentences == 0  # Pas supprimé
        assert out == text
    
    def test_removal_ratio_calculation(self):
        """Le ratio de suppression est correctement calculé."""
        text = "Phrase OK. Je recommande. Autre phrase OK."
        out, report = sanitize_llm_output(text, log_hits=False)
        
        assert 0 < report.removal_ratio < 1
        assert report.original_length > report.sanitized_length
    
    def test_empty_input(self):
        """Entrée vide gérée sans erreur."""
        out, report = sanitize_llm_output("", log_hits=False)
        assert out == ""
        assert report.sanitized is False
        assert report.removed_sentences == 0
    
    def test_none_handling(self):
        """None gérée sans erreur (retourne chaîne vide)."""
        # Note: None devrait être converti en string vide par l'appelant
        # mais on teste le cas où ça passe quand même
        pass  # Le sanitizer attend une string, None n'est pas un cas valide
    
    def test_report_to_dict(self):
        """Le rapport peut être sérialisé en dict."""
        text = "Je vous recommande ce portefeuille."
        _, report = sanitize_llm_output(text, log_hits=False)
        
        d = report.to_dict()
        assert isinstance(d, dict)
        assert "sanitized" in d
        assert "removed_sentences" in d
        assert "hits" in d
        assert "removal_ratio" in d


class TestCheckTextCompliance:
    """Tests de la fonction de vérification sans modification."""
    
    def test_compliant_text(self):
        """Texte conforme détecté comme tel."""
        text = "Portefeuille modèle à titre informatif uniquement. Risque de perte en capital."
        is_ok, issues = check_text_compliance(text)
        
        assert is_ok is True
        assert len([i for i in issues if i.startswith("❌")]) == 0
    
    def test_non_compliant_text(self):
        """Texte non-conforme détecté avec détails."""
        text = "Je vous recommande ce portefeuille optimal garanti."
        is_ok, issues = check_text_compliance(text)
        
        assert is_ok is False
        assert len([i for i in issues if i.startswith("❌")]) >= 2
    
    def test_warnings_dont_fail_compliance(self):
        """Les warnings ne font pas échouer la compliance."""
        text = "Ce portefeuille convient aux investisseurs prudents."
        is_ok, issues = check_text_compliance(text)
        
        # Warnings présents mais compliance OK
        assert is_ok is True
        assert len([i for i in issues if i.startswith("⚠️")]) > 0


class TestSanitizePortfolioCommentary:
    """Tests de la sanitization des commentaires de portefeuille."""
    
    def test_clean_commentary_unchanged(self):
        """Un commentaire propre n'est pas modifié."""
        text = (
            "Ce portefeuille modèle vise une volatilité de 12%. "
            "Il est présenté à titre informatif."
        )
        result = sanitize_portfolio_commentary(text)
        
        # Le texte devrait être identique ou très similaire
        assert "informatif" in result
        assert "volatilité" in result
    
    def test_forbidden_removed(self):
        """Les termes interdits sont supprimés."""
        text = (
            "Je vous recommande ce portefeuille. "
            "Il est garanti sans risque. "
            "Volatilité cible de 12%."
        )
        result = sanitize_portfolio_commentary(text)
        
        assert "recommande" not in result.lower()
        assert "garanti" not in result.lower()
        assert "12%" in result


class TestSanitizeMarketingLanguage:
    """Tests de la sanitization marketing legacy."""
    
    def test_superlatif_replaced(self):
        """Les superlatifs sont remplacés."""
        text = "C'est le meilleur investissement."
        result = sanitize_marketing_language(text, log_changes=False)
        
        assert "meilleur" not in result.lower() or "adapté" in result.lower()
    
    def test_garantie_replaced(self):
        """Les garanties sont remplacées."""
        text = "Rendement garanti."
        result = sanitize_marketing_language(text, log_changes=False)
        
        assert "garanti" not in result.lower()


class TestCheckForbiddenTerms:
    """Tests de la détection de termes interdits legacy."""
    
    def test_forbidden_detected(self):
        """Les termes interdits sont détectés."""
        text = "Investissement garanti sans risque."
        has_forbidden, found = check_forbidden_terms(text)
        
        assert has_forbidden is True
        assert len(found) > 0
    
    def test_clean_text(self):
        """Un texte propre ne déclenche pas de détection."""
        text = "Portefeuille diversifié avec risque mesuré."
        has_forbidden, found = check_forbidden_terms(text)
        
        assert has_forbidden is False
        assert len(found) == 0


class TestFullComplianceCheck:
    """Tests de la vérification compliance complète."""
    
    def test_compliant_result(self):
        """Un texte conforme passe tous les checks."""
        text = (
            "Ce portefeuille modèle présente un risque de perte en capital. "
            "Volatilité estimée à 12%."
        )
        result = full_compliance_check(text)
        
        assert result["is_compliant"] is True
        assert len(result["forbidden_terms"]) == 0
    
    def test_non_compliant_result(self):
        """Un texte non-conforme est détaillé."""
        text = "Investissement garanti parfait sans risque opportunité unique."
        result = full_compliance_check(text)
        
        assert result["is_compliant"] is False
        assert len(result["forbidden_terms"]) > 0
        assert result["changes_made"] is True
    
    def test_too_positive_warning(self):
        """Un texte trop positif génère un warning."""
        text = "Opportunité de croissance avec gains potentiels et hausse attendue."
        result = full_compliance_check(text)
        
        # Devrait avoir un warning sur le manque de mention des risques
        assert any("positif" in w.lower() for w in result["warnings"])


# ============= TESTS DE REGRESSION =============

class TestRegressions:
    """Tests de régression pour bugs connus."""
    
    def test_case_insensitive(self):
        """La détection est insensible à la casse."""
        texts = [
            "Je RECOMMANDE ce portefeuille.",
            "C'est GARANTI.",
            "SANS RISQUE.",
        ]
        for text in texts:
            _, report = sanitize_llm_output(text, log_hits=False)
            assert report.sanitized is True, f"Failed for: {text}"
    
    def test_accented_characters(self):
        """Les caractères accentués sont gérés."""
        text = "Recommandé pour les investisseurs. Adapté à vos besoins."
        _, report = sanitize_llm_output(text, log_hits=False)
        
        assert report.sanitized is True
    
    def test_multiple_sentences_same_pattern(self):
        """Plusieurs phrases avec le même pattern sont toutes supprimées."""
        text = (
            "Je recommande A. "
            "Je recommande aussi B. "
            "Texte neutre ici."
        )
        out, report = sanitize_llm_output(text, log_hits=False)
        
        assert report.removed_sentences == 2
        assert "recommande" not in out.lower()
        assert "neutre" in out


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
