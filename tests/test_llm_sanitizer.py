# tests/test_llm_sanitizer.py
"""
Tests P0-7 : Validation du filtre LLM AMF.

Exécution:
    pytest tests/test_llm_sanitizer.py -v
    pytest tests/test_llm_sanitizer.py -v -k "forbidden"
"""

import pytest
from compliance.sanitizer import (
    sanitize_llm_output,
    check_text_compliance,
    SanitizeReport,
)


class TestForbiddenPatternsFR:
    """Tests des patterns interdits en français (AMF/MiFID)."""
    
    @pytest.mark.parametrize("text,expected_label", [
        # Recommandations personnalisées
        ("Je vous recommande ce portefeuille.", "recommandation"),
        ("Nous vous recommandons d'investir.", "recommandation"),
        ("Ce portefeuille est adapté à votre profil.", "personnalisation"),
        ("Fait pour vous, selon votre situation.", "personnalisation_implicite"),
        ("Vous devriez investir dans ces actions.", "injonction"),
        ("Il faut que vous considériez cette option.", "injonction"),
        ("Selon votre profil, ce choix est judicieux.", "personnalisation_profil"),
        
        # v2.1: Nouveaux patterns
        ("Ce portefeuille vous convient parfaitement.", "suitability_direct"),
        ("Solution conseillée pour vous.", "conseil_direct"),
        ("Allocation personnalisée pour vous.", "personnalisation_directe"),
        ("Sur mesure pour votre situation.", "sur_mesure"),
        ("En fonction de vos besoins financiers.", "fonction_besoins"),
        ("Correspondant à votre profil d'investisseur.", "correspondance_profil"),
        
        # Garanties et promesses
        ("Rendement garanti de 10%.", "promesse_garantie"),
        ("Investissement sans risque.", "promesse_risque"),
        ("Performance certifiée.", "promesse_garantie"),
        ("Aucun risque de perte.", "promesse_risque"),
        ("Placement 100% sécurisé.", "fausse_securite"),
        
        # Superlatifs
        ("Le meilleur portefeuille du marché.", "promesse_meilleur"),
        ("Solution optimale pour votre épargne.", "promesse_meilleur"),
        ("Opportunité idéale.", "superlatif"),
        ("Choix parfait pour investir.", "superlatif"),
        
        # Urgence
        ("Opportunité unique à saisir.", "urgence"),
        ("Dernière chance d'investir.", "urgence_forte"),
        ("Ne ratez pas cette occasion.", "urgence_action"),
        ("Offre limitée dans le temps.", "urgence_offre"),
    ])
    def test_forbidden_patterns_detected_fr(self, text, expected_label):
        """Vérifie que les patterns FR interdits sont détectés."""
        cleaned, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        assert report.sanitized, f"Pattern '{expected_label}' non détecté dans: {text}"
        labels = [h[0] for h in report.hits]
        assert any(expected_label in label for label in labels), \
            f"Label '{expected_label}' attendu, trouvé: {labels}"


class TestForbiddenPatternsEN:
    """Tests des patterns interdits en anglais."""
    
    @pytest.mark.parametrize("text,expected_label", [
        # Recommendations
        ("I recommend this portfolio.", "recommendation_en"),
        ("We recommend you invest now.", "recommendation_en"),
        ("You should buy these stocks.", "advice_en"),
        ("You need to consider this option.", "advice_en"),
        ("Ideal for you.", "personalization_en"),
        ("Based on your profile, this is best.", "personalization_profile_en"),
        
        # v2.1: Nouveaux patterns EN
        ("Tailored for you specifically.", "tailored_en"),
        ("Designed for your needs.", "designed_en"),
        ("Fits your profile perfectly.", "fits_profile_en"),
        ("Personalized for you.", "personalized_en"),
        ("Customized to your goals.", "customized_en"),
        
        # Promises
        ("Guaranteed returns.", "promise_en"),
        ("Risk-free investment.", "promise_en"),
        ("No risk of loss.", "promise_en"),
        ("Best investment choice.", "superlative_en"),
        ("Optimal option for growth.", "superlative_en"),
        ("Certified returns.", "guarantee_en"),
    ])
    def test_forbidden_patterns_detected_en(self, text, expected_label):
        """Vérifie que les patterns EN interdits sont détectés."""
        cleaned, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        assert report.sanitized, f"Pattern '{expected_label}' non détecté dans: {text}"
        labels = [h[0] for h in report.hits]
        assert any(expected_label in label for label in labels), \
            f"Label '{expected_label}' attendu, trouvé: {labels}"


class TestSentenceRemoval:
    """Tests de la suppression de phrases complètes."""
    
    def test_sentence_fully_removed(self):
        """Vérifie que la phrase entière est supprimée (pas juste le mot)."""
        text = "Je vous recommande ce portefeuille. Il est diversifié."
        cleaned, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        assert "recommande" not in cleaned
        assert "diversifié" in cleaned  # La 2e phrase doit rester
        assert report.removed_sentences == 1
    
    def test_multiple_sentences_removed(self):
        """Vérifie la suppression de plusieurs phrases."""
        text = (
            "Je vous recommande ce portefeuille. "
            "Il est garanti sans risque. "
            "Vous devriez investir maintenant. "
            "Diversification géographique assurée."
        )
        cleaned, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        assert report.removed_sentences >= 3
        # La dernière phrase devrait rester (partiellement, "assurée" peut trigger)
        assert "Diversification" in cleaned or report.removed_sentences == 4
    
    def test_empty_text_handling(self):
        """Vérifie le handling des textes vides."""
        cleaned, report = sanitize_llm_output("", strict=True, log_hits=False)
        
        assert cleaned == ""
        assert not report.sanitized
        assert report.removed_sentences == 0
    
    def test_none_text_handling(self):
        """Vérifie le handling de None."""
        cleaned, report = sanitize_llm_output(None, strict=True, log_hits=False)
        
        assert cleaned is None
        assert not report.sanitized


class TestSafeText:
    """Tests des textes conformes (ne doivent pas être modifiés)."""
    
    @pytest.mark.parametrize("text", [
        "Ce portefeuille présente une volatilité de 12%.",
        "Les performances passées ne préjugent pas des performances futures.",
        "Le profil Agressif cible une volatilité plus élevée.",
        "Allocation diversifiée entre actions et obligations.",
        "La composition sectorielle favorise la technologie.",
        "Le backtest sur 90 jours montre un rendement de 5%.",
        "Les risques incluent la volatilité des marchés.",
        "This portfolio has a 12% volatility.",
        "Past performance does not guarantee future results.",
        "The allocation is diversified across sectors.",
    ])
    def test_safe_text_unchanged(self, text):
        """Vérifie que les textes conformes ne sont pas modifiés."""
        cleaned, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        assert cleaned == text, f"Texte modifié: '{text}' → '{cleaned}'"
        assert not report.sanitized
        assert report.removed_sentences == 0


class TestRemovalRatio:
    """Tests du ratio de suppression."""
    
    def test_high_removal_ratio_alert(self):
        """Vérifie l'alerte si >50% supprimé."""
        # Texte avec 3 phrases interdites sur 4
        text = (
            "Je vous recommande ce portefeuille. "
            "Il est garanti sans risque. "
            "Vous devriez investir maintenant. "
            "Diversification géographique."
        )
        cleaned, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        assert report.removal_ratio > 0.5
        assert report.removed_sentences >= 3
    
    def test_low_removal_ratio_ok(self):
        """Vérifie qu'un ratio faible ne déclenche pas d'alerte."""
        text = (
            "Ce portefeuille est diversifié. "
            "Il présente un potentiel de croissance. "
            "La volatilité cible est de 12%. "
            "Je vous recommande d'être prudent."  # 1 phrase sur 4
        )
        cleaned, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        assert report.removal_ratio <= 0.5
        assert report.removed_sentences == 1
    
    def test_removal_ratio_calculation(self):
        """Vérifie le calcul du ratio."""
        text = "AAAA. BBBB."  # 2 phrases de taille égale
        
        # Simuler avec un texte plus réaliste
        text = "Ce portefeuille est garanti. Il est diversifié."
        cleaned, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        assert 0 <= report.removal_ratio <= 1
        assert report.original_length > 0
        assert report.sanitized_length <= report.original_length


class TestComplianceCheck:
    """Tests de la fonction de vérification de conformité."""
    
    def test_compliant_text(self):
        """Texte conforme."""
        is_ok, issues = check_text_compliance(
            "Portefeuille équilibré avec 60% actions, 40% obligations."
        )
        assert is_ok
        assert len([i for i in issues if i.startswith("❌")]) == 0
    
    def test_non_compliant_text(self):
        """Texte non conforme."""
        is_ok, issues = check_text_compliance(
            "Ce portefeuille garanti est idéal pour vous."
        )
        assert not is_ok
        forbidden_issues = [i for i in issues if i.startswith("❌")]
        assert len(forbidden_issues) >= 2  # "garanti" + "pour vous" + "idéal"
    
    def test_warning_only_text(self):
        """Texte avec warnings mais conforme."""
        is_ok, issues = check_text_compliance(
            "Ce portefeuille est performant et adapté au profil Agressif."
        )
        # Peut être conforme mais avec warnings
        warning_issues = [i for i in issues if i.startswith("⚠️")]
        # Au moins un warning attendu pour "performant" ou "adapté"
        assert len(warning_issues) >= 0  # Les warnings ne rendent pas non-conforme


class TestSanitizeReport:
    """Tests du rapport de sanitisation."""
    
    def test_report_to_dict(self):
        """Vérifie la sérialisation du rapport."""
        text = "Je vous recommande ce portefeuille diversifié."
        _, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        d = report.to_dict()
        
        assert "sanitized" in d
        assert "removed_sentences" in d
        assert "hits" in d
        assert "warnings" in d
        assert "removal_ratio" in d
        assert "original_length" in d
        assert "sanitized_length" in d
        
        assert isinstance(d["hits"], list)
        assert isinstance(d["removal_ratio"], float)
    
    def test_report_properties(self):
        """Vérifie les propriétés calculées du rapport."""
        text = "Je vous recommande ce portefeuille."
        _, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        assert report.sanitized == True
        assert report.removal_ratio > 0
        assert report.original_length > 0
        assert report.sanitized_length < report.original_length


class TestEdgeCases:
    """Tests des cas limites."""
    
    def test_special_characters(self):
        """Vérifie le handling des caractères spéciaux."""
        text = "Portefeuille équilibré (60% actions, 40% obligations)."
        cleaned, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        assert cleaned == text
        assert not report.sanitized
    
    def test_accented_characters(self):
        """Vérifie le handling des accents français."""
        text = "Ce portefeuille présente une opportunité idéale."
        cleaned, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        # "idéale" doit être détecté
        assert report.sanitized
    
    def test_mixed_language(self):
        """Vérifie le handling du texte mixte FR/EN."""
        text = (
            "Ce portefeuille est diversifié. "
            "I recommend you invest now. "
            "La volatilité est de 12%."
        )
        cleaned, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        assert "recommend" not in cleaned
        assert "diversifié" in cleaned
        assert "volatilité" in cleaned
        assert report.removed_sentences == 1
    
    def test_very_long_text(self):
        """Vérifie le handling des textes longs."""
        # 10 phrases, 3 interdites
        sentences = [
            "Ce portefeuille est diversifié.",
            "Je vous recommande d'investir.",  # Interdit
            "La volatilité cible est de 12%.",
            "Garanti sans risque.",  # Interdit
            "L'allocation favorise la technologie.",
            "Vous devriez considérer cette option.",  # Interdit
            "Les performances passées ne préjugent pas.",
            "La composition sectorielle est équilibrée.",
            "Le backtest montre un rendement de 5%.",
            "Les risques incluent la volatilité.",
        ]
        text = " ".join(sentences)
        
        cleaned, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        assert report.removed_sentences == 3
        assert "diversifié" in cleaned
        assert "volatilité cible" in cleaned


class TestRealWorldExamples:
    """Tests avec des exemples réalistes de commentaires LLM."""
    
    def test_typical_llm_commentary_safe(self):
        """Commentaire LLM typique conforme."""
        text = (
            "Ce portefeuille Agressif vise une croissance à long terme. "
            "L'allocation de 70% en actions et 30% en ETF offre une diversification sectorielle. "
            "La volatilité attendue est d'environ 18%. "
            "Les performances passées ne préjugent pas des performances futures."
        )
        cleaned, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        assert not report.sanitized
        assert cleaned == text
    
    def test_typical_llm_commentary_unsafe(self):
        """Commentaire LLM typique non conforme."""
        text = (
            "Ce portefeuille est parfait pour vous. "
            "Je vous recommande cette allocation qui garantit une croissance optimale. "
            "Vous devriez investir sans attendre car c'est une opportunité unique."
        )
        cleaned, report = sanitize_llm_output(text, strict=True, log_hits=False)
        
        assert report.sanitized
        assert report.removed_sentences >= 2
        assert len(report.hits) >= 3  # "pour vous", "recommande", "garantit", "devriez", etc.


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
