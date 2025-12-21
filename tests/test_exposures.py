# tests/test_exposures.py
"""
Tests unitaires pour portfolio_engine/exposures.py — PR0

Ces tests valident les INVARIANTS MATHÉMATIQUES, pas les outputs historiques.
Si l'ancien code était bugué, ces tests détectent les corrections (pas les régressions).

Catégories de tests:
1. Invariants mathématiques (HHI = Σw², somme = 1.0)
2. Pas de defaults silencieux (role manquant → unknown)
3. Scope correct (region equity_only, sector equity_only)
4. Edge cases (portefeuille vide, un seul actif)

Run: pytest tests/test_exposures.py -v
"""

import pytest
from typing import Dict, Any

# Import du module à tester
from portfolio_engine.exposures import (
    compute_hhi,
    compute_role_exposures,
    compute_region_exposures,
    compute_sector_exposures,
    compute_category_exposures,
    compute_concentration_metrics,
    compute_all_exposures,
    validate_weights_sum,
    validate_exposures_sum,
    compare_exposures,
    extract_asset_data_from_candidates,
    ExposureResult,
    VALID_ROLES,
)


# ============= TEST FIXTURES =============

@pytest.fixture
def simple_weights():
    """Portefeuille simple 3 actifs."""
    return {"A": 0.5, "B": 0.25, "C": 0.25}


@pytest.fixture
def equal_weights_10():
    """10 actifs égaux (HHI = 1000)."""
    return {f"Asset_{i}": 0.1 for i in range(10)}


@pytest.fixture
def concentrated_weights():
    """Portefeuille concentré (2 actifs)."""
    return {"A": 0.9, "B": 0.1}


@pytest.fixture
def sample_asset_data():
    """Données d'actifs pour tests complets."""
    return {
        "AAPL": {
            "role": "satellite",
            "region": "US",
            "sector": "Technology",
            "category": "Actions",
            "risk_bucket": "equity_like",
        },
        "BND": {
            "role": "defensive",
            "region": "US",
            "sector": "Bonds",
            "category": "Obligations",
            "risk_bucket": "bond_like",
        },
        "SPY": {
            "role": "core",
            "region": "US",
            "sector": "Diversified",
            "category": "ETF",
            "risk_bucket": "equity_like",
        },
        "VWO": {
            "role": "satellite",
            "region": "Emerging",
            "sector": "Diversified",
            "category": "ETF",
            "risk_bucket": "equity_like",
        },
    }


# ============= TEST HHI (INVARIANTS MATHÉMATIQUES) =============

class TestComputeHHI:
    """Tests pour compute_hhi — vérifie la définition mathématique."""
    
    def test_hhi_formula_simple(self, simple_weights):
        """HHI = Σ(w²) × 10000 pour {0.5, 0.25, 0.25}."""
        # Calcul manuel: 0.5² + 0.25² + 0.25² = 0.25 + 0.0625 + 0.0625 = 0.375
        # HHI = 0.375 × 10000 = 3750
        hhi, eff_n = compute_hhi(simple_weights)
        
        assert hhi == 3750.0
        assert round(eff_n, 2) == round(1/0.375, 2)  # ≈ 2.67
    
    def test_hhi_equal_weights_10(self, equal_weights_10):
        """10 actifs égaux → HHI = 1000, effective_n = 10."""
        # Calcul: 10 × 0.1² = 10 × 0.01 = 0.1
        # HHI = 0.1 × 10000 = 1000
        hhi, eff_n = compute_hhi(equal_weights_10)
        
        assert hhi == 1000.0
        assert eff_n == 10.0
    
    def test_hhi_single_position(self):
        """1 actif à 100% → HHI = 10000, effective_n = 1."""
        weights = {"A": 1.0}
        hhi, eff_n = compute_hhi(weights)
        
        assert hhi == 10000.0
        assert eff_n == 1.0
    
    def test_hhi_two_equal_positions(self):
        """2 actifs égaux → HHI = 5000, effective_n = 2."""
        weights = {"A": 0.5, "B": 0.5}
        hhi, eff_n = compute_hhi(weights)
        
        # 2 × 0.5² = 2 × 0.25 = 0.5 → HHI = 5000
        assert hhi == 5000.0
        assert eff_n == 2.0
    
    def test_hhi_empty_portfolio(self):
        """Portefeuille vide → HHI = 0."""
        hhi, eff_n = compute_hhi({})
        
        assert hhi == 0.0
        assert eff_n == 0.0
    
    def test_hhi_ignores_zero_weights(self):
        """Les poids nuls sont ignorés."""
        weights = {"A": 0.5, "B": 0.5, "C": 0.0, "D": 0.0}
        hhi, eff_n = compute_hhi(weights)
        
        # Seulement A et B comptent → comme two_equal_positions
        assert hhi == 5000.0
        assert eff_n == 2.0


# ============= TEST ROLE EXPOSURES (NO SILENT DEFAULTS) =============

class TestComputeRoleExposures:
    """Tests pour compute_role_exposures — CRITIQUE: pas de defaults silencieux."""
    
    def test_all_roles_assigned(self):
        """Tous les actifs ont un role → unknown = 0."""
        weights = {"A": 0.4, "B": 0.3, "C": 0.3}
        roles = {"A": "core", "B": "satellite", "C": "defensive"}
        
        result = compute_role_exposures(weights, roles)
        
        assert result["core"] == 0.4
        assert result["satellite"] == 0.3
        assert result["defensive"] == 0.3
        assert result["unknown"] == 0.0
        assert result["lottery"] == 0.0
    
    def test_missing_role_goes_to_unknown(self):
        """
        CRITICAL TEST: Role manquant → unknown, PAS satellite.
        
        C'est le bug que ChatGPT a identifié: l'ancien code utilisait
        default="satellite" qui masquait les erreurs de mapping.
        """
        weights = {"A": 0.4, "B": 0.3, "C": 0.3}
        roles = {"A": "core", "B": "satellite"}  # C manquant!
        
        result = compute_role_exposures(weights, roles)
        
        assert result["core"] == 0.4
        assert result["satellite"] == 0.3
        assert result["unknown"] == 0.3  # ← C va dans unknown, pas satellite!
        assert result["defensive"] == 0.0
    
    def test_invalid_role_goes_to_unknown(self):
        """Role invalide → unknown avec warning."""
        weights = {"A": 0.5, "B": 0.5}
        roles = {"A": "core", "B": "invalid_role"}  # Role invalide
        
        result = compute_role_exposures(weights, roles)
        
        assert result["core"] == 0.5
        assert result["unknown"] == 0.5
    
    def test_case_insensitive_roles(self):
        """Roles sont case-insensitive."""
        weights = {"A": 0.25, "B": 0.25, "C": 0.25, "D": 0.25}
        roles = {"A": "CORE", "B": "Satellite", "C": "defensive", "D": "LOTTERY"}
        
        result = compute_role_exposures(weights, roles)
        
        assert result["core"] == 0.25
        assert result["satellite"] == 0.25
        assert result["defensive"] == 0.25
        assert result["lottery"] == 0.25
        assert result["unknown"] == 0.0
    
    def test_sum_equals_total_weights(self):
        """Somme des expositions = somme des poids."""
        weights = {"A": 0.4, "B": 0.3, "C": 0.2, "D": 0.1}
        roles = {"A": "core", "B": "satellite"}  # C, D manquants
        
        result = compute_role_exposures(weights, roles)
        
        total_exposure = sum(result.values())
        total_weights = sum(weights.values())
        
        assert abs(total_exposure - total_weights) < 0.001


# ============= TEST REGION EXPOSURES (SCOPE) =============

class TestComputeRegionExposures:
    """Tests pour compute_region_exposures — vérifie le scope equity_only."""
    
    def test_all_regions(self):
        """Sans filtre, toutes les régions comptent."""
        weights = {"A": 0.5, "B": 0.3, "C": 0.2}
        regions = {"A": "US", "B": "US", "C": "Europe"}
        
        result = compute_region_exposures(weights, regions)
        
        assert result["US"] == 0.8
        assert result["Europe"] == 0.2
    
    def test_equity_only_excludes_bonds(self):
        """equity_only=True exclut les obligations."""
        weights = {"AAPL": 0.3, "BND": 0.4, "SPY": 0.3}
        regions = {"AAPL": "US", "BND": "US", "SPY": "US"}
        risk_buckets = {
            "AAPL": "equity_like",
            "BND": "bond_like",  # Obligation → exclu
            "SPY": "equity_like",
        }
        
        result = compute_region_exposures(
            weights, regions, risk_buckets, equity_only=True
        )
        
        # BND exclu → seulement AAPL + SPY = 0.6
        assert result["US"] == 0.6
    
    def test_equity_only_includes_leveraged(self):
        """equity_only=True inclut leveraged."""
        weights = {"A": 0.5, "B": 0.5}
        regions = {"A": "US", "B": "US"}
        risk_buckets = {"A": "equity_like", "B": "leveraged"}
        
        result = compute_region_exposures(
            weights, regions, risk_buckets, equity_only=True
        )
        
        # Leveraged compte → 1.0
        assert result["US"] == 1.0
    
    def test_missing_region_is_unknown(self):
        """Région manquante → 'Unknown'."""
        weights = {"A": 0.5, "B": 0.5}
        regions = {"A": "US"}  # B manquant
        
        result = compute_region_exposures(weights, regions)
        
        assert result["US"] == 0.5
        assert result["Unknown"] == 0.5


# ============= TEST SECTOR EXPOSURES (SCOPE) =============

class TestComputeSectorExposures:
    """Tests pour compute_sector_exposures — sépare equity sectors vs categories."""
    
    def test_equity_only_excludes_obligations(self):
        """Les obligations ne comptent pas dans max_sector."""
        weights = {"AAPL": 0.3, "BND": 0.4, "MSFT": 0.3}
        sectors = {"AAPL": "Technology", "BND": "Bonds", "MSFT": "Technology"}
        categories = {"AAPL": "Actions", "BND": "Obligations", "MSFT": "Actions"}
        
        result = compute_sector_exposures(weights, sectors, categories, equity_only=True)
        
        # BND exclu → Technology = 0.6
        assert result["Technology"] == 0.6
        assert "Bonds" not in result  # BND exclu
    
    def test_etf_sectors_count(self):
        """Les ETF comptent dans les secteurs."""
        weights = {"SPY": 0.5, "QQQ": 0.5}
        sectors = {"SPY": "Diversified", "QQQ": "Technology"}
        categories = {"SPY": "ETF", "QQQ": "ETF"}
        
        result = compute_sector_exposures(weights, sectors, categories, equity_only=True)
        
        assert result["Diversified"] == 0.5
        assert result["Technology"] == 0.5


# ============= TEST CONCENTRATION METRICS =============

class TestComputeConcentrationMetrics:
    """Tests pour compute_concentration_metrics."""
    
    def test_concentration_level_well_diversified(self, equal_weights_10):
        """HHI < 1000 → well_diversified."""
        metrics = compute_concentration_metrics(equal_weights_10)
        
        assert metrics.hhi == 1000.0  # Exactement 1000
        assert metrics.concentration_level == "diversified"  # 1000 est pile sur la limite
    
    def test_concentration_level_highly_concentrated(self, concentrated_weights):
        """HHI > 2500 → highly_concentrated."""
        # 0.9² + 0.1² = 0.81 + 0.01 = 0.82 → HHI = 8200
        metrics = compute_concentration_metrics(concentrated_weights)
        
        assert metrics.hhi == 8200.0
        assert metrics.concentration_level == "highly_concentrated"
    
    def test_top_5_weight(self):
        """top_5_weight = somme des 5 plus gros."""
        weights = {f"A{i}": 0.1 for i in range(10)}
        
        metrics = compute_concentration_metrics(weights)
        
        assert metrics.top_5_weight == 0.5
        assert metrics.top_10_weight == 1.0
    
    def test_n_positions(self):
        """n_positions compte seulement les poids > 0."""
        weights = {"A": 0.5, "B": 0.5, "C": 0.0, "D": 0.0}
        
        metrics = compute_concentration_metrics(weights)
        
        assert metrics.n_positions == 2


# ============= TEST VALIDATION FUNCTIONS =============

class TestValidation:
    """Tests pour les fonctions de validation."""
    
    def test_valid_weights_sum(self):
        """Somme = 1.0 → valide."""
        weights = {"A": 0.5, "B": 0.5}
        
        is_valid, total, msg = validate_weights_sum(weights)
        
        assert is_valid is True
        assert total == 1.0
    
    def test_invalid_weights_sum(self):
        """Somme ≠ 1.0 → invalide."""
        weights = {"A": 0.6, "B": 0.6}  # Somme = 1.2
        
        is_valid, total, msg = validate_weights_sum(weights)
        
        assert is_valid is False
        assert total == 1.2
    
    def test_tolerance_respected(self):
        """Dans la tolérance → valide."""
        weights = {"A": 0.505, "B": 0.500}  # Somme = 1.005
        
        is_valid, total, msg = validate_weights_sum(weights, tolerance=0.01)
        
        assert is_valid is True


# ============= TEST COMPUTE_ALL_EXPOSURES =============

class TestComputeAllExposures:
    """Tests pour compute_all_exposures — fonction principale."""
    
    def test_full_exposure_result(self, sample_asset_data):
        """Test complet avec toutes les métriques."""
        weights = {"AAPL": 0.2, "BND": 0.3, "SPY": 0.4, "VWO": 0.1}
        
        result = compute_all_exposures(weights, sample_asset_data)
        
        # Vérifier la structure
        assert isinstance(result, ExposureResult)
        assert "core" in result.by_role
        assert "unknown" in result.by_role
        
        # Vérifier les valeurs de role
        assert result.by_role["core"] == 0.4  # SPY
        assert result.by_role["satellite"] == 0.3  # AAPL + VWO
        assert result.by_role["defensive"] == 0.3  # BND
        assert result.by_role["unknown"] == 0.0
    
    def test_execution_ready_when_no_unknown(self, sample_asset_data):
        """is_execution_ready = True si unknown < 0.1%."""
        weights = {"AAPL": 0.5, "SPY": 0.5}
        
        result = compute_all_exposures(weights, sample_asset_data)
        
        assert result.is_execution_ready is True
        assert result.unknown_weight == 0.0
    
    def test_not_execution_ready_with_unknown(self, sample_asset_data):
        """is_execution_ready = False si unknown > 0.1%."""
        weights = {"AAPL": 0.5, "UNKNOWN_TICKER": 0.5}  # Ticker non mappé
        
        result = compute_all_exposures(weights, sample_asset_data)
        
        assert result.is_execution_ready is False
        assert result.unknown_weight == 0.5
        assert len(result.warnings) > 0
    
    def test_to_dict_conversion(self, sample_asset_data):
        """to_dict() produit un dict JSON-serializable."""
        weights = {"AAPL": 0.5, "SPY": 0.5}
        
        result = compute_all_exposures(weights, sample_asset_data)
        result_dict = result.to_dict()
        
        assert isinstance(result_dict, dict)
        assert "by_role" in result_dict
        assert "concentration" in result_dict
        assert isinstance(result_dict["concentration"]["hhi"], float)


# ============= TEST DUAL-RUN COMPARISON =============

class TestCompareExposures:
    """Tests pour compare_exposures — migration dual-run."""
    
    def test_no_diff_when_identical(self):
        """Pas de diff si identique."""
        old = {"core": 0.4, "satellite": 0.6}
        new = {"core": 0.4, "satellite": 0.6}
        
        result = compare_exposures(old, new)
        
        assert result["has_significant_diff"] is False
        assert len(result["diffs"]) == 0
    
    def test_diff_detected(self):
        """Diff détectée si > epsilon."""
        old = {"core": 0.4, "satellite": 0.6}
        new = {"core": 0.35, "satellite": 0.65}  # Diff de 0.05
        
        result = compare_exposures(old, new, epsilon=0.01)
        
        assert result["has_significant_diff"] is True
        assert "core" in result["diffs"]
        assert result["diffs"]["core"]["diff"] == -0.05
    
    def test_within_epsilon_no_diff(self):
        """Dans epsilon → pas de diff significative."""
        old = {"core": 0.400, "satellite": 0.600}
        new = {"core": 0.405, "satellite": 0.595}  # Diff de 0.005
        
        result = compare_exposures(old, new, epsilon=0.01)
        
        assert result["has_significant_diff"] is False


# ============= TEST EDGE CASES =============

class TestEdgeCases:
    """Tests pour les cas limites."""
    
    def test_empty_weights(self):
        """Portefeuille vide."""
        result = compute_all_exposures({}, {})
        
        assert result.unknown_weight == 0.0
        assert result.concentration.n_positions == 0
    
    def test_single_asset(self):
        """Un seul actif."""
        weights = {"A": 1.0}
        asset_data = {"A": {"role": "core", "region": "US", "sector": "Tech", "category": "Actions"}}
        
        result = compute_all_exposures(weights, asset_data)
        
        assert result.by_role["core"] == 1.0
        assert result.concentration.hhi == 10000.0
        assert result.concentration.effective_n == 1.0
    
    def test_negative_weights_ignored(self):
        """Poids négatifs ignorés."""
        weights = {"A": 0.5, "B": 0.5, "C": -0.1}
        roles = {"A": "core", "B": "satellite", "C": "defensive"}
        
        result = compute_role_exposures(weights, roles)
        
        # C ignoré car poids négatif
        assert result["defensive"] == 0.0


# ============= TEST EXTRACT FROM CANDIDATES =============

class TestExtractAssetData:
    """Tests pour extract_asset_data_from_candidates."""
    
    def test_extract_from_dict_list(self):
        """Extraction depuis List[dict]."""
        candidates = [
            {"id": "A", "role": "core", "region": "US"},
            {"id": "B", "role": "satellite", "region": "EU"},
        ]
        
        result = extract_asset_data_from_candidates(candidates)
        
        assert "A" in result
        assert result["A"]["role"] == "core"
        assert result["B"]["region"] == "EU"


# ============= RUN TESTS =============

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
