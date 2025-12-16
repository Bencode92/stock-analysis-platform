# tests/test_ter_loader.py
"""
Tests pour portfolio_engine/ter_loader.py

Valide le chargement des TER et le calcul du TER pondéré.
"""

import pytest
from typing import Dict


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def sample_ter_data() -> Dict[str, float]:
    """TER data fictive pour tests (en basis points)."""
    return {
        "QQQ": 20.0,      # 0.20%
        "SPY": 9.0,       # 0.09%
        "AGG": 4.0,       # 0.04%
        "IEF": 15.0,      # 0.15%
        "URTH": 24.0,     # 0.24%
        "VGT": 10.0,      # 0.10%
        "BND": 3.0,       # 0.03%
        "GLD": 40.0,      # 0.40%
    }


@pytest.fixture
def sample_weights_mixed() -> Dict[str, float]:
    """Portfolio mixte actions/ETF pour tests."""
    return {
        "QQQ": 0.20,   # ETF avec TER
        "AAPL": 0.15,  # Action directe (TER = 0)
        "MSFT": 0.15,  # Action directe (TER = 0)
        "AGG": 0.20,   # ETF obligataire
        "URTH": 0.15,  # ETF mondial
        "GOOGL": 0.15, # Action directe (TER = 0)
    }


@pytest.fixture
def sample_weights_etf_only() -> Dict[str, float]:
    """Portfolio 100% ETF pour tests."""
    return {
        "QQQ": 0.30,
        "SPY": 0.30,
        "AGG": 0.20,
        "URTH": 0.20,
    }


# =============================================================================
# UNIT TESTS - compute_weighted_ter
# =============================================================================

class TestComputeWeightedTer:
    """Tests pour la fonction compute_weighted_ter."""
    
    def test_portfolio_etf_only(self, sample_ter_data, sample_weights_etf_only):
        """Portfolio 100% ETF - tous les tickers ont un TER."""
        try:
            from portfolio_engine.ter_loader import compute_weighted_ter
        except ImportError:
            pytest.skip("portfolio_engine.ter_loader not available")
        
        weighted_ter, ter_used, diag = compute_weighted_ter(
            sample_weights_etf_only,
            sample_ter_data
        )
        
        # Calcul manuel:
        # QQQ: 0.30 * 20 = 6.0
        # SPY: 0.30 * 9 = 2.7
        # AGG: 0.20 * 4 = 0.8
        # URTH: 0.20 * 24 = 4.8
        # Total: 14.3bp
        expected = 0.30*20 + 0.30*9 + 0.20*4 + 0.20*24
        
        assert abs(weighted_ter - expected) < 0.1, f"Expected {expected}bp, got {weighted_ter}bp"
        assert diag["n_tickers_with_ter"] == 4
        assert diag["n_tickers_assumed_zero"] == 0
        assert diag["coverage_pct"] == 100.0
    
    def test_portfolio_mixed_stocks_etf(self, sample_ter_data, sample_weights_mixed):
        """Portfolio mixte - actions directes ont TER = 0."""
        try:
            from portfolio_engine.ter_loader import compute_weighted_ter
        except ImportError:
            pytest.skip("portfolio_engine.ter_loader not available")
        
        weighted_ter, ter_used, diag = compute_weighted_ter(
            sample_weights_mixed,
            sample_ter_data
        )
        
        # Calcul manuel:
        # QQQ: 0.20 * 20 = 4.0
        # AAPL: 0.15 * 0 = 0.0 (action)
        # MSFT: 0.15 * 0 = 0.0 (action)
        # AGG: 0.20 * 4 = 0.8
        # URTH: 0.15 * 24 = 3.6
        # GOOGL: 0.15 * 0 = 0.0 (action)
        # Total: 8.4bp
        expected = 0.20*20 + 0.20*4 + 0.15*24
        
        assert abs(weighted_ter - expected) < 0.1, f"Expected {expected}bp, got {weighted_ter}bp"
        assert diag["n_tickers_with_ter"] == 3  # QQQ, AGG, URTH
        assert diag["n_tickers_assumed_zero"] == 3  # AAPL, MSFT, GOOGL
        
        # Vérifier que les actions ont TER = 0
        assert ter_used.get("AAPL", -1) == 0.0
        assert ter_used.get("MSFT", -1) == 0.0
        assert ter_used.get("GOOGL", -1) == 0.0
    
    def test_portfolio_100_stocks(self, sample_ter_data):
        """Portfolio 100% actions - TER devrait être 0."""
        try:
            from portfolio_engine.ter_loader import compute_weighted_ter
        except ImportError:
            pytest.skip("portfolio_engine.ter_loader not available")
        
        weights_stocks_only = {
            "AAPL": 0.25,
            "MSFT": 0.25,
            "GOOGL": 0.25,
            "AMZN": 0.25,
        }
        
        weighted_ter, ter_used, diag = compute_weighted_ter(
            weights_stocks_only,
            sample_ter_data
        )
        
        assert weighted_ter == 0.0, f"Actions-only portfolio should have 0 TER, got {weighted_ter}bp"
        assert diag["n_tickers_with_ter"] == 0
        assert diag["n_tickers_assumed_zero"] == 4
    
    def test_empty_portfolio(self, sample_ter_data):
        """Portfolio vide - TER = 0."""
        try:
            from portfolio_engine.ter_loader import compute_weighted_ter
        except ImportError:
            pytest.skip("portfolio_engine.ter_loader not available")
        
        weighted_ter, ter_used, diag = compute_weighted_ter({}, sample_ter_data)
        
        assert weighted_ter == 0.0
        assert diag["n_tickers_total"] == 0
    
    def test_single_etf(self, sample_ter_data):
        """Portfolio avec un seul ETF."""
        try:
            from portfolio_engine.ter_loader import compute_weighted_ter
        except ImportError:
            pytest.skip("portfolio_engine.ter_loader not available")
        
        weights = {"QQQ": 1.0}
        
        weighted_ter, ter_used, diag = compute_weighted_ter(weights, sample_ter_data)
        
        assert weighted_ter == 20.0, f"Single QQQ should have TER=20bp, got {weighted_ter}bp"
    
    def test_case_insensitive_ticker(self, sample_ter_data):
        """Les tickers doivent être case-insensitive."""
        try:
            from portfolio_engine.ter_loader import compute_weighted_ter
        except ImportError:
            pytest.skip("portfolio_engine.ter_loader not available")
        
        # Tickers en lowercase
        weights = {"qqq": 0.50, "agg": 0.50}
        
        weighted_ter, ter_used, diag = compute_weighted_ter(weights, sample_ter_data)
        
        # Should still find TERs (QQQ=20, AGG=4 → avg=12)
        expected = 0.50*20 + 0.50*4
        assert abs(weighted_ter - expected) < 0.1, f"Expected {expected}bp, got {weighted_ter}bp"


# =============================================================================
# UNIT TESTS - TER values sanity checks
# =============================================================================

class TestTerValuesSanity:
    """Tests de cohérence des valeurs TER."""
    
    def test_ter_values_in_reasonable_range(self, sample_ter_data):
        """Les TER doivent être dans une plage raisonnable (0-200bp)."""
        for ticker, ter_bp in sample_ter_data.items():
            assert 0 <= ter_bp <= 200, f"{ticker} has unreasonable TER: {ter_bp}bp"
    
    def test_weighted_ter_never_negative(self, sample_ter_data):
        """Le TER pondéré ne peut jamais être négatif."""
        try:
            from portfolio_engine.ter_loader import compute_weighted_ter
        except ImportError:
            pytest.skip("portfolio_engine.ter_loader not available")
        
        # Portfolio avec poids négatifs (short) - edge case
        weights = {
            "QQQ": 0.80,
            "SPY": 0.20,
        }
        
        weighted_ter, _, _ = compute_weighted_ter(weights, sample_ter_data)
        
        assert weighted_ter >= 0, f"Weighted TER should never be negative, got {weighted_ter}bp"
    
    def test_weighted_ter_bounded_by_max(self, sample_ter_data):
        """Le TER pondéré ne peut pas dépasser le max individuel."""
        try:
            from portfolio_engine.ter_loader import compute_weighted_ter
        except ImportError:
            pytest.skip("portfolio_engine.ter_loader not available")
        
        weights = {"QQQ": 0.30, "SPY": 0.30, "AGG": 0.20, "URTH": 0.20}
        
        weighted_ter, _, _ = compute_weighted_ter(weights, sample_ter_data)
        
        max_ter = max(sample_ter_data.values())
        assert weighted_ter <= max_ter, f"Weighted TER ({weighted_ter}bp) > max individual ({max_ter}bp)"


# =============================================================================
# INTEGRATION TESTS
# =============================================================================

class TestTerLoaderIntegration:
    """Tests d'intégration avec les vrais fichiers CSV."""
    
    @pytest.mark.skipif(
        not __import__("pathlib").Path("data/combined_etfs.csv").exists(),
        reason="combined_etfs.csv not found"
    )
    def test_load_ter_from_real_csv(self):
        """Charge les TER depuis les vrais fichiers CSV."""
        try:
            from portfolio_engine.ter_loader import load_ter_from_csv
        except ImportError:
            pytest.skip("portfolio_engine.ter_loader not available")
        
        ter_data = load_ter_from_csv()
        
        # Devrait charger au moins quelques TERs
        assert len(ter_data) > 0, "Should load at least some TERs from CSV"
        
        # Vérifier quelques ETF courants (si présents)
        for ticker in ["QQQ", "SPY", "AGG", "IEF", "URTH"]:
            if ticker in ter_data:
                assert 0 < ter_data[ticker] < 200, f"{ticker} TER out of range: {ter_data[ticker]}bp"
    
    @pytest.mark.skipif(
        not __import__("pathlib").Path("data/combined_etfs.csv").exists(),
        reason="combined_etfs.csv not found"
    )
    def test_get_portfolio_ter_info_real_data(self):
        """Test get_portfolio_ter_info avec données réelles."""
        try:
            from portfolio_engine.ter_loader import get_portfolio_ter_info
        except ImportError:
            pytest.skip("portfolio_engine.ter_loader not available")
        
        # Portfolio de test
        weights = {
            "QQQ": 0.20,
            "AAPL": 0.30,
            "AGG": 0.30,
            "MSFT": 0.20,
        }
        
        info = get_portfolio_ter_info(weights)
        
        assert "weighted_ter_bp" in info
        assert "ter_by_ticker" in info
        assert "diagnostics" in info
        assert info["weighted_ter_bp"] >= 0


# =============================================================================
# RUN
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
