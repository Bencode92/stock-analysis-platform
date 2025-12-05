# tests/test_sector_quality.py
"""
Tests unitaires pour le module sector_quality v2.0.
Inclut les nouvelles métriques: ROIC, FCF Yield, EPS Growth 5Y.
"""

import pytest
import sys
from pathlib import Path

# Ajouter le répertoire parent au path
sys.path.insert(0, str(Path(__file__).parent.parent))

from portfolio_engine.sector_quality import (
    SECTOR_PROFILES,
    SECTOR_MAPPING,
    METRIC_WEIGHTS,
    safe_float,
    get_sector_key,
    get_profile,
    enrich_with_sector_stats,
    compute_buffett_penalty,
    compute_buffett_score,
    compute_value_score,
    buffett_hard_filter,
    apply_buffett_filter,
    get_sector_summary,
    get_fundamentals_coverage,
)


# ============= FIXTURES =============

@pytest.fixture
def sample_asml():
    """ASML - Tech exemplaire avec toutes les métriques v2.0."""
    return {
        "ticker": "ASML",
        "name": "ASML HOLDING NV",
        "sector": "Technologie de l'information",
        "roe": 40.98,
        "roic": 35.5,  # v2.0
        "de_ratio": 0.25,
        "fcf_yield": 2.8,  # v2.0
        "eps_growth_5y": 22.5,  # v2.0
        "peg_ratio": 1.8,  # v2.0
        "payout_ratio_ttm": 26.7,
        "volatility_3y": "36.23",
        "max_drawdown_ytd": "42.91",
        "dividend_coverage": 3.7,
    }


@pytest.fixture
def sample_nvda():
    """NVDA - Tech croissance extrême."""
    return {
        "ticker": "NVDA",
        "name": "NVIDIA Corporation",
        "sector": "Technology",
        "roe": 89.5,
        "roic": 45.2,
        "de_ratio": 0.41,
        "fcf_yield": 1.5,  # Faible car valorisation élevée
        "eps_growth_5y": 48.3,
        "peg_ratio": 1.2,
        "payout_ratio_ttm": 3.2,
        "volatility_3y": "52",
        "max_drawdown_ytd": "35",
    }


@pytest.fixture
def sample_reit():
    """REIT typique - Haut payout, dette élevée, FCF important."""
    return {
        "ticker": "O",
        "name": "Realty Income Corp",
        "sector": "Immobilier",
        "roe": 3.5,
        "roic": 4.2,  # v2.0
        "de_ratio": 180,
        "fcf_yield": 5.8,  # v2.0 - REITs génèrent du FCF
        "eps_growth_5y": 2.1,  # v2.0
        "peg_ratio": 4.5,
        "payout_ratio_ttm": 95,
        "volatility_3y": "22",
        "max_drawdown_ytd": "25",
    }


@pytest.fixture
def sample_bank():
    """Banque - D/E très élevé normal, ROIC non pertinent."""
    return {
        "ticker": "JPM",
        "name": "JPMorgan Chase",
        "sector": "Finance",
        "roe": 15,
        "roic": None,  # Non pertinent pour banques
        "de_ratio": 1200,  # Banques ont des leviers énormes
        "fcf_yield": None,  # Non pertinent
        "eps_growth_5y": 8.5,
        "peg_ratio": 1.5,
        "payout_ratio_ttm": 35,
        "volatility_3y": "28",
        "max_drawdown_ytd": "30",
    }


@pytest.fixture
def sample_staple():
    """Consumer Staples - Cash cow stable."""
    return {
        "ticker": "PG",
        "name": "Procter & Gamble",
        "sector": "Consumer Staples",
        "roe": 32.5,
        "roic": 18.2,
        "de_ratio": 65,
        "fcf_yield": 4.5,  # Cash cow
        "eps_growth_5y": 6.2,
        "peg_ratio": 2.8,
        "payout_ratio_ttm": 62,
        "volatility_3y": "18",
        "max_drawdown_ytd": "15",
    }


@pytest.fixture
def sample_volatile_tech():
    """Tech volatile - TSLA style."""
    return {
        "ticker": "TSLA",
        "name": "Tesla Inc",
        "sector": "consumer discretionary",
        "roe": 25,
        "roic": 12.5,
        "de_ratio": 45,
        "fcf_yield": 1.2,
        "eps_growth_5y": 35.0,
        "peg_ratio": 3.5,
        "payout_ratio_ttm": 0,
        "volatility_3y": "55",
        "max_drawdown_ytd": "45",
    }


@pytest.fixture
def sample_value_trap():
    """Value trap - Métriques faibles, FCF négatif."""
    return {
        "ticker": "TRAP",
        "name": "Value Trap Inc",
        "sector": "Industrial",
        "roe": 3.0,
        "roic": 2.1,
        "de_ratio": 180,
        "fcf_yield": -2.5,  # FCF négatif = red flag
        "eps_growth_5y": -8.0,
        "peg_ratio": None,  # Pas de PEG si EPS négatif
        "payout_ratio_ttm": 120,  # Payout > 100% = unsustainable
        "volatility_3y": "45",
        "max_drawdown_ytd": "55",
    }


@pytest.fixture
def sample_universe(sample_asml, sample_nvda, sample_reit, sample_bank, 
                    sample_staple, sample_volatile_tech, sample_value_trap):
    """Univers de test complet v2.0."""
    return [sample_asml, sample_nvda, sample_reit, sample_bank, 
            sample_staple, sample_volatile_tech, sample_value_trap]


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
    
    def test_negative(self):
        assert safe_float("-2.5") == -2.5
        assert safe_float(-8.0) == -8.0
    
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
    
    def test_consumer_staples(self):
        assert get_sector_key("Consumer Staples") == "consumer_staples"
        assert get_sector_key("Consommation de base") == "consumer_staples"
    
    def test_unknown(self):
        assert get_sector_key("Secteur Inconnu XYZ") == "_default"
        assert get_sector_key(None) == "_default"
        assert get_sector_key("") == "_default"


class TestSectorProfiles:
    def test_all_profiles_have_required_keys(self):
        """Vérifie que tous les profils ont les clés v2.0."""
        required = [
            "roe_soft", "roe_hard", 
            "roic_soft", "roic_hard",  # v2.0
            "payout_soft", "payout_hard", 
            "vol_soft", "vol_hard", 
            "dd_soft", "dd_hard"
        ]
        for sector, profile in SECTOR_PROFILES.items():
            for key in required:
                assert key in profile, f"Missing {key} in {sector}"
    
    def test_v2_new_metrics_in_profiles(self):
        """Vérifie les nouvelles métriques v2.0."""
        tech = SECTOR_PROFILES["tech"]
        assert "fcf_yield_soft" in tech
        assert "fcf_yield_hard" in tech
        assert "eps_growth_soft" in tech
        assert "eps_growth_hard" in tech
        assert "peg_soft" in tech
        assert "peg_hard" in tech
    
    def test_tech_stricter_than_real_estate(self):
        tech = SECTOR_PROFILES["tech"]
        reit = SECTOR_PROFILES["real_estate"]
        assert tech["roe_soft"] > reit["roe_soft"]
        assert tech["roic_soft"] > reit["roic_soft"]  # v2.0
        assert tech["payout_soft"] < reit["payout_soft"]
    
    def test_finance_no_de_limit(self):
        finance = SECTOR_PROFILES["finance"]
        assert finance["de_soft"] is None
        assert finance["de_hard"] is None
        assert finance["roic_soft"] is None  # v2.0: ROIC non pertinent
        assert finance["fcf_yield_soft"] is None  # v2.0: FCF non pertinent
    
    def test_staples_high_fcf_expectation(self):
        """Consumer staples doivent générer du FCF."""
        staples = SECTOR_PROFILES["consumer_staples"]
        assert staples["fcf_yield_soft"] >= 4  # Cash cows
    
    def test_energy_allows_negative_fcf(self):
        """Energy peut avoir FCF négatif en phase d'investissement."""
        energy = SECTOR_PROFILES["energy"]
        assert energy["fcf_yield_hard"] < 0


class TestMetricWeights:
    def test_weights_sum_to_one(self):
        """Les poids doivent sommer à 1."""
        total = sum(METRIC_WEIGHTS.values())
        assert abs(total - 1.0) < 0.01
    
    def test_roic_higher_weight_than_roe(self):
        """ROIC doit avoir plus de poids que ROE."""
        assert METRIC_WEIGHTS["roic"] > METRIC_WEIGHTS["roe"]


# ============= TESTS SCORING v2.0 =============

class TestBuffettPenalty:
    def test_asml_low_penalty(self, sample_asml):
        penalty = compute_buffett_penalty(sample_asml)
        # ASML a un excellent ROE/ROIC, faible D/E, bon FCF
        assert penalty < 0.3, f"ASML penalty too high: {penalty}"
    
    def test_nvda_acceptable_penalty(self, sample_nvda):
        penalty = compute_buffett_penalty(sample_nvda)
        # NVDA: excellent ROIC mais FCF yield faible
        assert penalty < 0.4, f"NVDA penalty too high: {penalty}"
    
    def test_reit_acceptable_penalty(self, sample_reit):
        penalty = compute_buffett_penalty(sample_reit)
        # REIT: payout élevé mais acceptable pour le secteur
        assert penalty < 0.6, f"REIT penalty too high: {penalty}"
    
    def test_value_trap_high_penalty(self, sample_value_trap):
        penalty = compute_buffett_penalty(sample_value_trap)
        # Value trap: mauvais sur tous les critères
        assert penalty > 0.5, f"Value trap penalty too low: {penalty}"
    
    def test_volatile_tech_moderate_penalty(self, sample_volatile_tech):
        penalty = compute_buffett_penalty(sample_volatile_tech)
        # TSLA: croissance mais FCF yield faible
        assert 0.2 < penalty < 0.6, f"TSLA penalty unexpected: {penalty}"


class TestValueScore:
    def test_score_range(self, sample_asml):
        score = compute_value_score(sample_asml)
        assert 0 <= score <= 100
    
    def test_high_fcf_yield_high_score(self, sample_reit):
        """REIT avec bon FCF yield devrait avoir bon value score."""
        score = compute_value_score(sample_reit)
        assert score > 50, f"REIT value score too low: {score}"
    
    def test_high_growth_high_score(self, sample_nvda):
        """NVDA avec forte croissance EPS."""
        score = compute_value_score(sample_nvda)
        assert score > 60, f"NVDA value score too low: {score}"
    
    def test_negative_fcf_low_score(self, sample_value_trap):
        """FCF négatif = mauvais value score."""
        score = compute_value_score(sample_value_trap)
        assert score < 40, f"Value trap value score too high: {score}"
    
    def test_low_peg_good(self, sample_nvda):
        """Faible PEG = bon value score."""
        score = compute_value_score(sample_nvda)
        # NVDA a PEG=1.2 qui est excellent
        assert score > 60


class TestBuffettScore:
    def test_score_range(self, sample_asml):
        score = compute_buffett_score(sample_asml)
        assert 0 <= score <= 100
    
    def test_asml_high_score(self, sample_asml):
        score = compute_buffett_score(sample_asml)
        assert score > 65, f"ASML score too low: {score}"
    
    def test_staple_high_score(self, sample_staple):
        """Consumer staple (cash cow) devrait scorer haut."""
        score = compute_buffett_score(sample_staple)
        assert score > 60, f"PG score too low: {score}"
    
    def test_value_trap_low_score(self, sample_value_trap):
        score = compute_buffett_score(sample_value_trap)
        assert score < 50, f"Value trap score too high: {score}"
    
    def test_combined_score_formula(self, sample_asml):
        """Vérifie la formule combinée 60% quality + 40% value."""
        penalty = compute_buffett_penalty(sample_asml)
        quality = (1 - penalty) * 100
        value = compute_value_score(sample_asml)
        expected = round(quality * 0.6 + value * 0.4, 1)
        actual = compute_buffett_score(sample_asml)
        assert abs(actual - expected) < 0.2


# ============= TESTS HARD FILTER v2.0 =============

class TestBuffettHardFilter:
    def test_asml_passes(self, sample_asml):
        passed, reason = buffett_hard_filter(sample_asml)
        assert passed is True
        assert reason is None
    
    def test_reit_passes_with_sector_profile(self, sample_reit):
        passed, reason = buffett_hard_filter(sample_reit)
        assert passed is True, f"REIT rejected: {reason}"
    
    def test_bank_passes_no_de_limit(self, sample_bank):
        passed, reason = buffett_hard_filter(sample_bank)
        assert passed is True, f"Bank rejected: {reason}"
    
    def test_reject_very_low_roe(self):
        asset = {
            "sector": "tech",
            "roe": 2,  # Bien en dessous du hard limit tech (5%)
            "roic": 8,
            "de_ratio": 50,
        }
        passed, reason = buffett_hard_filter(asset)
        assert passed is False
        assert "roe" in reason.lower()
    
    def test_reject_very_low_roic(self):
        """v2.0: Test rejet sur ROIC trop bas."""
        asset = {
            "sector": "tech",
            "roe": 15,
            "roic": 3,  # En dessous du hard limit tech (5%)
            "de_ratio": 50,
        }
        passed, reason = buffett_hard_filter(asset)
        assert passed is False
        assert "roic" in reason.lower()
    
    def test_reject_negative_fcf(self):
        """v2.0: Test rejet sur FCF yield négatif."""
        asset = {
            "sector": "consumer_staples",  # Staples attendent FCF > 1%
            "roe": 15,
            "roic": 10,
            "de_ratio": 50,
            "fcf_yield": -1.0,  # Négatif
        }
        passed, reason = buffett_hard_filter(asset)
        assert passed is False
        assert "fcf" in reason.lower()
    
    def test_reject_negative_eps_growth(self):
        """v2.0: Test rejet sur EPS growth très négatif."""
        asset = {
            "sector": "tech",
            "roe": 15,
            "roic": 12,
            "eps_growth_5y": -10,  # En dessous du hard limit tech (-5%)
        }
        passed, reason = buffett_hard_filter(asset)
        assert passed is False
        assert "eps" in reason.lower()
    
    def test_reject_extreme_peg(self):
        """v2.0: Test rejet sur PEG extrême."""
        asset = {
            "sector": "tech",
            "roe": 15,
            "roic": 12,
            "peg_ratio": 6.0,  # Au-dessus du hard limit tech (5.0)
        }
        passed, reason = buffett_hard_filter(asset)
        assert passed is False
        assert "peg" in reason.lower()
    
    def test_reject_extreme_volatility(self):
        asset = {
            "sector": "tech",
            "roe": 15,
            "roic": 12,
            "volatility_3y": "80",  # Au-dessus du hard limit tech (70%)
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
            assert "_value_score" in asset  # v2.0
            assert "_sector_key" in asset
    
    def test_hard_mode_filters_value_trap(self, sample_universe):
        """Le value trap devrait être filtré en mode hard."""
        result = apply_buffett_filter(sample_universe, mode="hard")
        tickers = [a.get("ticker") for a in result]
        assert "TRAP" not in tickers
    
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
            assert "_sector_median_roic" in asset  # v2.0
            assert "_sector_median_fcf_yield" in asset  # v2.0
    
    def test_sector_summary_v2(self, sample_universe):
        enriched = apply_buffett_filter(sample_universe, mode="soft")
        summary = get_sector_summary(enriched)
        
        # Vérifier structure v2.0
        for sector, stats in summary.items():
            assert "count" in stats
            assert "avg_buffett_score" in stats
            assert "avg_value_score" in stats  # v2.0
            assert "avg_roic" in stats  # v2.0
            assert "avg_fcf_yield" in stats  # v2.0
            assert "avg_eps_growth" in stats  # v2.0


class TestFundamentalsCoverage:
    def test_coverage_returns_percentages(self, sample_universe):
        coverage = get_fundamentals_coverage(sample_universe)
        assert "roe" in coverage
        assert "roic" in coverage
        assert "fcf_yield" in coverage
        assert "eps_growth_5y" in coverage
        assert "peg_ratio" in coverage
        assert all(0 <= v <= 100 for v in coverage.values())
    
    def test_empty_list(self):
        coverage = get_fundamentals_coverage([])
        assert coverage == {}


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
        assert "_value_score" in result[0]
    
    def test_negative_values_handled(self):
        """Teste la gestion des valeurs négatives."""
        asset = {
            "ticker": "NEG",
            "sector": "industrial",
            "roe": -5.0,  # ROE négatif
            "roic": -3.0,  # ROIC négatif
            "fcf_yield": -10.0,  # FCF négatif
            "eps_growth_5y": -15.0,  # Croissance négative
        }
        result = apply_buffett_filter([asset], mode="soft")
        assert len(result) == 1
        # Le score devrait être bas mais pas d'erreur
        assert result[0]["_buffett_score"] < 50


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
