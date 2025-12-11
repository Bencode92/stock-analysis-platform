# tests/test_market_context.py
"""
Tests unitaires pour market_context.py
Suggestion ChatGPT: valider apply_macro_tilts() avant intégration
"""

import pytest
import sys
from pathlib import Path

# Ajouter le répertoire racine au path
sys.path.insert(0, str(Path(__file__).parent.parent))

from portfolio_engine.market_context import (
    apply_macro_tilts,
    normalize_sector,
    normalize_region,
    get_fallback_context,
    TILT_CONFIG,
)


class TestNormalization:
    """Tests de normalisation secteur/région."""
    
    def test_normalize_sector_standard(self):
        assert normalize_sector("Technology") == "information-technology"
        assert normalize_sector("Healthcare") == "healthcare"
        assert normalize_sector("Real Estate") == "real-estate"
    
    def test_normalize_sector_variants(self):
        # Test aliasing
        assert normalize_sector("Consumer Discretionary") == "consumer-discretionary"
        assert normalize_sector("Consumer Cyclical") == "consumer-discretionary"
        assert normalize_sector("consumer-cyclical") == "consumer-discretionary"
        
        assert normalize_sector("Consumer Defensive") == "consumer-staples"
        assert normalize_sector("Consumer Staples") == "consumer-staples"
        
        assert normalize_sector("Health Care") == "healthcare"
        assert normalize_sector("health-care") == "healthcare"
    
    def test_normalize_sector_empty(self):
        assert normalize_sector("") == ""
        assert normalize_sector(None) == ""
    
    def test_normalize_region_standard(self):
        assert normalize_region("United States") == "united states"
        assert normalize_region("China") == "china"
        assert normalize_region("France") == "france"
    
    def test_normalize_region_aliases(self):
        assert normalize_region("USA") == "united states"
        assert normalize_region("US") == "united states"
        assert normalize_region("Etats-Unis") == "united states"
        
        assert normalize_region("UK") == "united kingdom"
        assert normalize_region("Royaume Uni") == "united kingdom"
        
        assert normalize_region("Corée du Sud") == "south korea"
        assert normalize_region("Korea") == "south korea"


class TestApplyMacroTilts:
    """Tests de apply_macro_tilts() - cas critiques."""
    
    @pytest.fixture
    def sample_context(self):
        """Contexte de test avec secteurs/régions favorisés et évités."""
        return {
            "market_regime": "risk-on",
            "macro_tilts": {
                "favored_sectors": ["information-technology", "healthcare"],
                "avoided_sectors": ["real-estate"],
                "favored_regions": ["united states", "switzerland"],
                "avoided_regions": ["china", "hong kong"],
            },
            "confidence": 0.85
        }
    
    def test_both_favored_clamped(self, sample_context):
        """Cas 1: sector=favored, country=favored → tilt = +0.30 (clampé)"""
        tilt = apply_macro_tilts("Technology", "United States", sample_context)
        assert tilt == TILT_CONFIG["max_tactical"]  # +0.30
    
    def test_sector_favored_country_neutral(self, sample_context):
        """Cas 2: sector=favored, country=neutre → tilt = +0.15"""
        tilt = apply_macro_tilts("Technology", "France", sample_context)
        assert tilt == TILT_CONFIG["favored"]  # +0.15
    
    def test_both_avoided_clamped(self, sample_context):
        """Cas 3: sector=avoided, country=avoided → tilt = -0.30"""
        tilt = apply_macro_tilts("Real Estate", "China", sample_context)
        assert tilt == -TILT_CONFIG["max_tactical"]  # -0.30
    
    def test_neutral_neutral(self, sample_context):
        """Cas 4: rien dans les listes → tilt = 0.0"""
        tilt = apply_macro_tilts("Energy", "Germany", sample_context)
        assert tilt == 0.0
    
    def test_sector_favored_country_avoided(self, sample_context):
        """Cas mixte: sector favored + country avoided → net = 0"""
        tilt = apply_macro_tilts("Technology", "China", sample_context)
        assert tilt == 0.0  # +0.15 - 0.15 = 0
    
    def test_empty_context(self):
        """Contexte vide → pas de tilts"""
        empty_context = {"macro_tilts": {}}
        tilt = apply_macro_tilts("Technology", "United States", empty_context)
        assert tilt == 0.0
    
    def test_empty_sector_country(self, sample_context):
        """Secteur/pays vides → pas de tilts"""
        assert apply_macro_tilts("", "", sample_context) == 0.0
        assert apply_macro_tilts(None, None, sample_context) == 0.0
    
    def test_alias_matching(self, sample_context):
        """Test que les alias fonctionnent dans apply_macro_tilts"""
        # "Tech" devrait matcher "information-technology"
        tilt = apply_macro_tilts("Tech", "USA", sample_context)
        assert tilt == TILT_CONFIG["max_tactical"]  # +0.30
        
        # "Consumer Cyclical" ne devrait pas matcher (pas dans favored)
        tilt = apply_macro_tilts("Consumer Cyclical", "France", sample_context)
        assert tilt == 0.0


class TestFallbackContext:
    """Tests du contexte fallback."""
    
    def test_fallback_structure(self):
        fb = get_fallback_context()
        
        assert fb["market_regime"] == "neutral"
        assert fb["confidence"] == 0.0
        assert fb["macro_tilts"]["favored_sectors"] == []
        assert fb["macro_tilts"]["avoided_sectors"] == []
        assert fb["_meta"]["is_fallback"] == True
    
    def test_fallback_no_tilts(self):
        """Fallback ne doit appliquer aucun tilt"""
        fb = get_fallback_context()
        tilt = apply_macro_tilts("Technology", "United States", fb)
        assert tilt == 0.0


class TestTiltConfig:
    """Validation de la configuration des tilts."""
    
    def test_tilt_values(self):
        """Vérifie que les valeurs sont celles attendues."""
        assert TILT_CONFIG["favored"] == 0.15
        assert TILT_CONFIG["avoided"] == -0.15
        assert TILT_CONFIG["max_tactical"] == 0.30
    
    def test_tilt_symmetry(self):
        """Vérifie la symétrie favored/avoided."""
        assert TILT_CONFIG["favored"] == -TILT_CONFIG["avoided"]


# ============= RUN TESTS =============

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
