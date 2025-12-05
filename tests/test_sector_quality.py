# tests/test_sector_quality.py
"""
Tests unitaires pour le module sector_quality.
"""

import pytest
import sys
from pathlib import Path

# Ajouter le répertoire parent au path
sys.path.insert(0, str(Path(__file__).parent.parent))

from portfolio_engine.sector_quality import (
    SECTOR_PROFILES,
    SECTOR_MAPPING,
    safe_float,
    get_sector_key,
    get_profile,
    enrich_with_sector_stats,
    compute_buffett_penalty,
    compute_buffett_score,
    buffett_hard_filter,
    apply_buffett_filter,
    get_sector_summary,
)


# ============= FIXTURES =============

@pytest.fixture
def sample_asml():
    """ASML - Tech exemplaire."""
    return {
        "ticker": "ASML",
        "name": "ASML HOLDING NV",
        "sector": "Technologie de l'information",
        "roe": 40.98,
        "de_ratio": 0.25,
        "payout_ratio_ttm": 26.7,
        "volatility_3y": "36.23",
        "max_drawdown_ytd": "42.91",
        "dividend_coverage": 3.7,
    }


@pytest.fixture
def sample_reit():
    """REIT typique - Haut payout, dette élevée."""
    return {
        "ticker": "O",
        "name": "Realty Income Corp",
        "sector": "Immobilier",
        "roe": 3.5,
        "de_ratio": 180,
        "payout_ratio_ttm": 95,
        "volatility_3y": "22",
        "max_drawdown_ytd": "25",
    }


@pytest.fixture
def sample_bank():
    """Banque - D/E très élevé normal."""
    return {
        "ticker": "JPM",
        "name": "JPMorgan Chase",
        "sector": "Finance",
        "roe": 15,
        "de_ratio": 1200,  # Banques ont des leviers énormes
        "payout_ratio_ttm": 35,
        "volatility_3y": "28",
        "max_drawdown_ytd": "30",
    }


@pytest.fixture
def sample_volatile_tech():
    """Tech volatile - TSLA style."""
    return {
        "ticker": "TSLA",
        "name": "Tesla Inc",
        "sector": "consumer discretionary",
        "roe": 25,
        "de_ratio": 45,
        "payout_ratio_ttm": 0,
        "volatility_3y": "55",
        "max_drawdown_ytd": "45",
    }


@pytest.fixture
def sample_universe(sample_asml, sample_reit, sample_bank, sample_volatile_tech):
    """Univers de test."""
    return [sample_asml, sample_reit, sample_bank, sample_volatile_tech]


# ============= TESTS HELPERS =============

class TestSafeFloat:
    def test_none(self):
        assert safe_float(None) == 0.0
        assert safe_float(None, 99.0) == 99.0
    
    def test_int(self):
        assert safe_float(42) == 42.0
    
    def test_float(self):
        assert safe_float(3.14) == 3.14
    
    def test_string(self):
        assert safe_float("36.23") == 36.23
        assert safe_float("42.91") == 42.91
    
    def test_string_with_spaces(self):
        assert safe_float(" 36.23 ") == 36.23
    
    def test_invalid_string(self):
        assert safe_float("N/A") == 0.0
        assert safe_float("-") == 0.0


class TestSectorMapping:
    def test_french_tech(self):
        assert get_sector_key("Technologie de l'information") == "tech"
    
    def test_english_tech(self):
        assert get_sector_key("Technology") == "tech"
        assert get_sector_key("Information Technology") == "tech"
    
    def test_finance(self):
        assert get_sector_key("Finance") == "finance"
        assert get_sector_key("Services financiers") == "finance"
    
    def test_real_estate(self):
        assert get_sector_key("Immobilier") == "real_estate"
        assert get_sector_key("Real Estate") == "real_estate"
    
    def test_unknown(self):
        assert get_sector_key("Secteur Inconnu XYZ") == "_default"
        assert get_sector_key(None) == "_default"
        assert get_sector_key("") == "_default"


class TestSectorProfiles:
    def test_all_profiles_have_required_keys(self):
        required = ["roe_soft", "roe_hard", "payout_soft", "payout_hard", 
                   "vol_soft", "vol_hard", "dd_soft", "dd_hard"]
        for sector, profile in SECTOR_PROFILES.items():
            for key in required:
                assert key in profile, f"Missing {key} in {sector}"
    
    def test_tech_stricter_than_real_estate(self):
        tech = SECTOR_PROFILES["tech"]
        reit = SECTOR_PROFILES["real_estate"]
        assert tech["roe_soft"] > reit["roe_soft"]
        assert tech["payout_soft"] < reit["payout_soft"]
    
    def test_finance_no_de_limit(self):
        finance = SECTOR_PROFILES["finance"]
        assert finance["de_soft"] is None
        assert finance["de_hard"] is None


# ============= TESTS SCORING =============

class TestBuffettPenalty:
    def test_asml_low_penalty(self, sample_asml):
        penalty = compute_buffett_penalty(sample_asml)
        # ASML a un excellent ROE, faible D/E, payout conservateur
        assert penalty < 0.3, f"ASML penalty too high: {penalty}"
    
    def test_reit_acceptable_penalty(self, sample_reit):
        penalty = compute_buffett_penalty(sample_reit)
        # REIT: payout élevé mais acceptable pour le secteur
        # ROE faible mais acceptable pour le secteur
        assert penalty < 0.6, f"REIT penalty too high: {penalty}"
    
    def test_volatile_tech_higher_penalty(self, sample_volatile_tech):
        penalty = compute_buffett_penalty(sample_volatile_tech)
        # Vol et DD élevés
        assert penalty > 0.2, f"TSLA penalty too low: {penalty}"


class TestBuffettScore:
    def test_score_range(self, sample_asml):
        score = compute_buffett_score(sample_asml)
        assert 0 <= score <= 100
    
    def test_asml_high_score(self, sample_asml):
        score = compute_buffett_score(sample_asml)
        assert score > 70, f"ASML score too low: {score}"
    
    def test_score_inverse_of_penalty(self, sample_asml):
        penalty = compute_buffett_penalty(sample_asml)
        score = compute_buffett_score(sample_asml)
        expected = round((1 - penalty) * 100, 1)
        assert score == expected


# ============= TESTS HARD FILTER =============

class TestBuffettHardFilter:
    def test_asml_passes(self, sample_asml):
        passed, reason = buffett_hard_filter(sample_asml)
        assert passed is True
        assert reason is None
    
    def test_reit_passes_with_sector_profile(self, sample_reit):
        passed, reason = buffett_hard_filter(sample_reit)
        # REIT avec profil sectoriel devrait passer
        assert passed is True, f"REIT rejected: {reason}"
    
    def test_bank_passes_no_de_limit(self, sample_bank):
        passed, reason = buffett_hard_filter(sample_bank)
        # Banque: pas de limite D/E
        assert passed is True, f"Bank rejected: {reason}"
    
    def test_reject_very_low_roe(self):
        asset = {
            "sector": "tech",
            "roe": 2,  # Bien en dessous du hard limit tech (5%)
            "de_ratio": 50,
            "payout_ratio_ttm": 30,
            "volatility_3y": "25",
            "max_drawdown_ytd": "20",
        }
        passed, reason = buffett_hard_filter(asset)
        assert passed is False
        assert "roe" in reason.lower()
    
    def test_reject_extreme_volatility(self):
        asset = {
            "sector": "tech",
            "roe": 15,
            "de_ratio": 50,
            "payout_ratio_ttm": 30,
            "volatility_3y": "80",  # Au-dessus du hard limit tech (70%)
            "max_drawdown_ytd": "20",
        }
        passed, reason = buffett_hard_filter(asset)
        assert passed is False
        assert "vol" in reason.lower()
    
    def test_strict_mode_rejects_missing_data(self):
        asset = {
            "sector": "tech",
            "roe": None,  # Missing
            "de_ratio": 50,
        }
        passed, reason = buffett_hard_filter(asset, strict=True)
        assert passed is False
        assert "missing" in reason.lower()


# ============= TESTS PIPELINE COMPLET =============

class TestApplyBuffettFilter:
    def test_soft_mode_keeps_all(self, sample_universe):
        result = apply_buffett_filter(sample_universe, mode="soft")
        # Mode soft ne rejette pas, juste pénalise
        assert len(result) == len(sample_universe)
    
    def test_enriches_with_scores(self, sample_universe):
        result = apply_buffett_filter(sample_universe, mode="soft")
        for asset in result:
            assert "_buffett_score" in asset
            assert "_buffett_penalty" in asset
            assert "_sector_key" in asset
    
    def test_hard_mode_filters(self, sample_universe):
        # Ajouter un actif qui échouera
        bad_asset = {
            "ticker": "BAD",
            "name": "Bad Stock",
            "sector": "tech",
            "roe": 1,  # Trop bas
            "de_ratio": 300,  # Trop haut
            "volatility_3y": "80",  # Trop haut
        }
        universe = sample_universe + [bad_asset]
        result = apply_buffett_filter(universe, mode="hard")
        
        # Le mauvais actif devrait être filtré
        tickers = [a.get("ticker") for a in result]
        assert "BAD" not in tickers
    
    def test_min_score_filters(self, sample_universe):
        result = apply_buffett_filter(sample_universe, mode="soft", min_score=50)
        for asset in result:
            assert asset["_buffett_score"] >= 50


class TestSectorStats:
    def test_enriches_all_assets(self, sample_universe):
        result = enrich_with_sector_stats(sample_universe)
        for asset in result:
            assert "_sector_key" in asset
            assert "_sector_median_roe" in asset
    
    def test_sector_summary(self, sample_universe):
        enriched = apply_buffett_filter(sample_universe, mode="soft")
        summary = get_sector_summary(enriched)
        
        assert "tech" in summary
        assert "real_estate" in summary
        assert "finance" in summary
        
        # Vérifier structure
        for sector, stats in summary.items():
            assert "count" in stats
            assert "avg_buffett_score" in stats


# ============= TESTS CAS LIMITES =============

class TestEdgeCases:
    def test_empty_list(self):
        result = apply_buffett_filter([])
        assert result == []
    
    def test_missing_all_metrics(self):
        asset = {"ticker": "EMPTY", "name": "Empty Stock", "sector": "tech"}
        result = apply_buffett_filter([asset], mode="soft")
        assert len(result) == 1
        assert "_buffett_score" in result[0]
    
    def test_none_mode_disabled(self):
        """Test que mode='none' est géré dans universe.py, pas ici."""
        # sector_quality ne gère pas le mode 'none', c'est universe.py
        pass


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
