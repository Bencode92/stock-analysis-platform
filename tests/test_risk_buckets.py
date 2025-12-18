# tests/test_risk_buckets.py
"""
Tests unitaires pour risk_buckets.py et constraint_report.py

Tests CI "must pass" basés sur les recommandations ChatGPT:
1. Contamination bonds: fund_type="Trading--Leveraged Equity" + bond fields → BOND_LIKE
2. Leveraged ETF: fund_type="Trading--Leveraged Equity" + leverage=2 → LEVERAGED, fail en Stable
3. ALTERNATIVE cap: dépassement → violation reportée
4. UNKNOWN: fund_type="" → fail gate
"""

import pytest
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_engine.risk_buckets import (
    RiskBucket,
    classify_asset,
    COUNTS_IN_MAX_REGION,
    LEVERAGED_CAP,
    ALTERNATIVE_CAP,
    run_quality_gates,
    filter_universe_by_gates,
    check_unknown_gate,
    check_leveraged_gate,
    check_region_known_gate,
    counts_in_max_region,
    get_leveraged_cap,
    get_alternative_cap,
    compute_bucket_exposures,
)


# ============= TEST FIXTURES =============

@pytest.fixture
def sample_equity_etf():
    """ETF Large Blend standard."""
    return {
        "id": "SPY",
        "name": "SPDR S&P 500 ETF",
        "category": "ETF",
        "fund_type": "Large Blend",
        "region": "US",
    }


@pytest.fixture
def sample_bond():
    """Obligation standard."""
    return {
        "id": "BND",
        "name": "Vanguard Total Bond Market",
        "category": "Obligations",
        "fund_type": "Intermediate Core Bond",
        "region": "US",
        "bond_avg_duration": 6.5,
        "bond_credit_rating": "AA",
    }


@pytest.fixture
def sample_leveraged_etf():
    """ETF leveraged."""
    return {
        "id": "TQQQ",
        "name": "ProShares UltraPro QQQ",
        "category": "ETF",
        "fund_type": "Trading--Leveraged Equity",
        "leverage": 3.0,
        "etf_type": "leveraged",
        "region": "US",
    }


@pytest.fixture
def sample_derivative_income():
    """ETF Derivative Income."""
    return {
        "id": "JEPI",
        "name": "JPMorgan Equity Premium Income",
        "category": "ETF",
        "fund_type": "Derivative Income",
        "region": "US",
    }


@pytest.fixture
def sample_crypto():
    """Crypto asset."""
    return {
        "id": "BTC",
        "name": "Bitcoin",
        "category": "Crypto",
        "fund_type": "Digital Assets",
        "region": "Global",
    }


@pytest.fixture
def sample_contaminated_bond():
    """
    CRITICAL TEST: Bond avec fund_type equity mais champs obligataires.
    Doit être classé BOND_LIKE (priorité aux caractéristiques).
    """
    return {
        "id": "WEIRD_BOND",
        "name": "Contaminated Bond Fund",
        "category": "Obligations",
        "fund_type": "Trading--Leveraged Equity",  # Wrong fund_type!
        "bond_avg_duration": 5.0,  # But has bond characteristics
        "bond_credit_rating": "BBB",
        "region": "US",
    }


@pytest.fixture
def sample_unknown_fund_type():
    """Asset avec fund_type vide."""
    return {
        "id": "MYSTERY",
        "name": "Mystery Fund",
        "category": "ETF",
        "fund_type": "",  # Empty!
        "region": "US",
    }


# ============= TEST CLASSIFICATION =============

class TestClassifyAsset:
    """Tests pour classify_asset()."""
    
    def test_equity_etf_classified_as_equity_like(self, sample_equity_etf):
        """ETF Large Blend → EQUITY_LIKE."""
        bucket, metadata = classify_asset(sample_equity_etf)
        assert bucket == RiskBucket.EQUITY_LIKE
        assert "Large Blend" in metadata["classification_rule"]
    
    def test_bond_classified_as_bond_like(self, sample_bond):
        """Obligation → BOND_LIKE."""
        bucket, metadata = classify_asset(sample_bond)
        assert bucket == RiskBucket.BOND_LIKE
        assert "bond" in metadata["classification_rule"].lower()
    
    def test_leveraged_etf_classified_as_leveraged(self, sample_leveraged_etf):
        """ETF leveraged → LEVERAGED."""
        bucket, metadata = classify_asset(sample_leveraged_etf)
        assert bucket == RiskBucket.LEVERAGED
        assert "leveraged" in metadata["classification_rule"].lower()
    
    def test_derivative_income_classified_as_alternative(self, sample_derivative_income):
        """Derivative Income → ALTERNATIVE."""
        bucket, metadata = classify_asset(sample_derivative_income)
        assert bucket == RiskBucket.ALTERNATIVE
    
    def test_crypto_classified_as_crypto(self, sample_crypto):
        """Digital Assets → CRYPTO."""
        bucket, metadata = classify_asset(sample_crypto)
        assert bucket == RiskBucket.CRYPTO
    
    def test_contaminated_bond_classified_as_bond_like(self, sample_contaminated_bond):
        """
        CRITICAL TEST #1: Contamination bonds.
        fund_type="Trading--Leveraged Equity" MAIS bond_avg_duration présent
        → Doit être classé BOND_LIKE (priorité aux caractéristiques bond).
        """
        bucket, metadata = classify_asset(sample_contaminated_bond)
        assert bucket == RiskBucket.BOND_LIKE, (
            f"Contaminated bond should be BOND_LIKE, got {bucket}. "
            f"Rule: {metadata['classification_rule']}"
        )
        assert "bond_characteristics" in metadata["classification_rule"]
        assert len(metadata["warnings"]) > 0  # Warning about mismatch
    
    def test_empty_fund_type_classified_as_unknown(self, sample_unknown_fund_type):
        """
        CRITICAL TEST #4: fund_type="" → UNKNOWN.
        """
        bucket, metadata = classify_asset(sample_unknown_fund_type)
        assert bucket == RiskBucket.UNKNOWN
        assert "fund_type_empty" in metadata["classification_rule"]
        assert len(metadata["warnings"]) > 0


class TestCountsInMaxRegion:
    """Tests pour la règle max_region."""
    
    def test_equity_like_counts_in_max_region(self):
        """EQUITY_LIKE compte dans max_region."""
        assert counts_in_max_region(RiskBucket.EQUITY_LIKE) is True
    
    def test_leveraged_counts_in_max_region(self):
        """LEVERAGED compte dans max_region."""
        assert counts_in_max_region(RiskBucket.LEVERAGED) is True
    
    def test_bond_like_excluded_from_max_region(self):
        """BOND_LIKE exclu de max_region."""
        assert counts_in_max_region(RiskBucket.BOND_LIKE) is False
    
    def test_alternative_excluded_from_max_region(self):
        """ALTERNATIVE exclu de max_region."""
        assert counts_in_max_region(RiskBucket.ALTERNATIVE) is False
    
    def test_crypto_excluded_from_max_region(self):
        """CRYPTO exclu de max_region."""
        assert counts_in_max_region(RiskBucket.CRYPTO) is False
    
    def test_real_assets_excluded_from_max_region(self):
        """REAL_ASSETS exclu de max_region."""
        assert counts_in_max_region(RiskBucket.REAL_ASSETS) is False


# ============= TEST QUALITY GATES =============

class TestQualityGates:
    """Tests pour les quality gates."""
    
    def test_unknown_gate_fails(self, sample_unknown_fund_type):
        """Gate 1: UNKNOWN → FAIL."""
        bucket, _ = classify_asset(sample_unknown_fund_type)
        result = check_unknown_gate(bucket, "MYSTERY")
        
        assert result.passed is False
        assert result.severity == "error"
        assert "UNKNOWN" in result.message
    
    def test_leveraged_gate_fails_for_stable(self, sample_leveraged_etf):
        """
        CRITICAL TEST #2: LEVERAGED interdit pour Stable.
        """
        bucket, _ = classify_asset(sample_leveraged_etf)
        result = check_leveraged_gate(bucket, "TQQQ", "Stable")
        
        assert result.passed is False
        assert "Stable" in result.message
        assert "interdit" in result.message.lower() or "forbidden" in result.message.lower()
    
    def test_leveraged_gate_fails_for_moderate(self, sample_leveraged_etf):
        """LEVERAGED interdit pour Modéré."""
        bucket, _ = classify_asset(sample_leveraged_etf)
        result = check_leveraged_gate(bucket, "TQQQ", "Modéré")
        
        assert result.passed is False
    
    def test_leveraged_gate_passes_for_aggressive(self, sample_leveraged_etf):
        """LEVERAGED autorisé pour Agressif (avec cap 5%)."""
        bucket, _ = classify_asset(sample_leveraged_etf)
        result = check_leveraged_gate(bucket, "TQQQ", "Agressif")
        
        assert result.passed is True
        assert "5" in result.message  # Cap 5%
    
    def test_region_gate_fails_if_unknown(self, sample_equity_etf):
        """Gate 3: EQUITY_LIKE avec région UNKNOWN → FAIL."""
        bucket, _ = classify_asset(sample_equity_etf)
        result = check_region_known_gate(bucket, "SPY", "UNKNOWN")
        
        assert result.passed is False
        assert "région" in result.message.lower() or "region" in result.message.lower()
    
    def test_region_gate_passes_if_known(self, sample_equity_etf):
        """EQUITY_LIKE avec région connue → PASS."""
        bucket, _ = classify_asset(sample_equity_etf)
        result = check_region_known_gate(bucket, "SPY", "US")
        
        assert result.passed is True


class TestFilterUniverseByGates:
    """Tests pour filter_universe_by_gates()."""
    
    def test_unknown_assets_filtered_out(self, sample_equity_etf, sample_unknown_fund_type):
        """Assets UNKNOWN sont filtrés."""
        assets = [sample_equity_etf, sample_unknown_fund_type]
        passed, failed = filter_universe_by_gates(assets, "Agressif")
        
        assert len(passed) == 1
        assert len(failed) == 1
        assert passed[0]["id"] == "SPY"
        assert failed[0]["id"] == "MYSTERY"
    
    def test_leveraged_filtered_for_stable(
        self, sample_equity_etf, sample_leveraged_etf, sample_bond
    ):
        """LEVERAGED filtré pour Stable."""
        assets = [sample_equity_etf, sample_leveraged_etf, sample_bond]
        passed, failed = filter_universe_by_gates(assets, "Stable")
        
        # TQQQ devrait être filtré
        passed_ids = [a["id"] for a in passed]
        assert "TQQQ" not in passed_ids
        assert "SPY" in passed_ids
        assert "BND" in passed_ids


# ============= TEST CAPS =============

class TestCaps:
    """Tests pour les caps par profil."""
    
    def test_leveraged_cap_stable(self):
        """Stable: LEVERAGED cap = 0%."""
        assert get_leveraged_cap("Stable") == 0.0
    
    def test_leveraged_cap_moderate(self):
        """Modéré: LEVERAGED cap = 0%."""
        assert get_leveraged_cap("Modéré") == 0.0
    
    def test_leveraged_cap_aggressive(self):
        """Agressif: LEVERAGED cap = 5%."""
        assert get_leveraged_cap("Agressif") == 5.0
    
    def test_alternative_cap_stable(self):
        """Stable: ALTERNATIVE cap = 5%."""
        assert get_alternative_cap("Stable") == 5.0
    
    def test_alternative_cap_moderate(self):
        """Modéré: ALTERNATIVE cap = 10%."""
        assert get_alternative_cap("Modéré") == 10.0
    
    def test_alternative_cap_aggressive(self):
        """Agressif: ALTERNATIVE cap = 20%."""
        assert get_alternative_cap("Agressif") == 20.0


# ============= TEST BUCKET EXPOSURES =============

class TestComputeBucketExposures:
    """Tests pour compute_bucket_exposures()."""
    
    def test_exposures_computed_correctly(self):
        """Les expositions sont calculées correctement."""
        # Setup: assets avec _risk_bucket déjà assigné
        assets = [
            {"id": "SPY", "_risk_bucket": "equity_like"},
            {"id": "BND", "_risk_bucket": "bond_like"},
            {"id": "JEPI", "_risk_bucket": "alternative"},
        ]
        allocation = {"SPY": 50.0, "BND": 40.0, "JEPI": 10.0}
        
        result = compute_bucket_exposures(allocation, assets)
        
        assert result["bucket_exposures"]["equity_like"] == 50.0
        assert result["bucket_exposures"]["bond_like"] == 40.0
        assert result["bucket_exposures"]["alternative"] == 10.0
        assert result["region_exposure_risky"] == 50.0  # Seul SPY compte
        assert result["region_exposure_exempt"] == 50.0  # BND + JEPI


# ============= TEST CONSTRAINT REPORT =============

class TestConstraintReport:
    """Tests pour constraint_report.py."""
    
    def test_import_constraint_report(self):
        """Le module s'importe correctement."""
        from portfolio_engine.constraint_report import (
            ConstraintMargin,
            ConstraintReport,
            ConstraintStatus,
            generate_constraint_report,
        )
        assert ConstraintMargin is not None
        assert ConstraintReport is not None
    
    def test_margin_calculation(self):
        """Les margins sont calculés correctement."""
        from portfolio_engine.constraint_report import _compute_margin, ConstraintStatus
        
        # Test max constraint respected with slack
        margin = _compute_margin("test_max", "max", cap=50.0, observed=40.0)
        assert margin.slack == 10.0
        assert margin.status == ConstraintStatus.OK
        assert margin.binding is False
        
        # Test max constraint binding
        margin = _compute_margin("test_max", "max", cap=50.0, observed=49.5)
        assert margin.slack == 0.5
        assert margin.status == ConstraintStatus.BINDING
        assert margin.binding is True
        
        # Test max constraint violated
        margin = _compute_margin("test_max", "max", cap=50.0, observed=53.0)
        assert margin.slack == -3.0
        assert margin.status == ConstraintStatus.VIOLATED
        
        # Test min constraint respected
        margin = _compute_margin("test_min", "min", cap=35.0, observed=40.0)
        assert margin.slack == 5.0
        assert margin.status == ConstraintStatus.OK
        
        # Test min constraint violated
        margin = _compute_margin("test_min", "min", cap=35.0, observed=30.0)
        assert margin.slack == -5.0
        assert margin.status == ConstraintStatus.VIOLATED


# ============= RUN TESTS =============

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
