# tests/test_benchmarks.py
"""
P1-7: Tests for profile-specific benchmarks.

Validates:
- Correct benchmark mapping per profile
- get_benchmark_for_profile() function
- Auto-selection in BacktestConfig
- Fallback mechanism
"""

import pytest
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))


class TestProfileBenchmarks:
    """Test profile-specific benchmark configuration."""
    
    def test_benchmarks_module_exists(self):
        """Verify benchmarks module can be imported."""
        from portfolio_engine.benchmarks import (
            PROFILE_BENCHMARKS,
            get_benchmark_for_profile,
            get_benchmark_symbol,
            get_all_benchmark_symbols,
        )
        assert PROFILE_BENCHMARKS is not None
    
    def test_profile_benchmark_mapping(self):
        """Test correct benchmark mapping for each profile."""
        from portfolio_engine.benchmarks import get_benchmark_symbol
        
        # Agressif → QQQ (growth/tech)
        assert get_benchmark_symbol("Agressif") == "QQQ"
        
        # Modéré → URTH (global diversified)
        assert get_benchmark_symbol("Modéré") == "URTH"
        
        # Stable → AGG (fixed income)
        assert get_benchmark_symbol("Stable") == "AGG"
    
    def test_profile_aliases(self):
        """Test that profile aliases work."""
        from portfolio_engine.benchmarks import get_benchmark_symbol
        
        # English aliases
        assert get_benchmark_symbol("Aggressive") == "QQQ"
        assert get_benchmark_symbol("Moderate") == "URTH"
        assert get_benchmark_symbol("Balanced") == "URTH"
        assert get_benchmark_symbol("Conservative") == "AGG"
        assert get_benchmark_symbol("Défensif") == "AGG"
    
    def test_default_fallback(self):
        """Test that unknown profiles get default benchmark."""
        from portfolio_engine.benchmarks import get_benchmark_symbol, DEFAULT_BENCHMARK
        
        # Unknown profile should return default (Modéré/URTH)
        unknown_result = get_benchmark_symbol("UnknownProfile")
        assert unknown_result == DEFAULT_BENCHMARK.symbol
        assert unknown_result == "URTH"
    
    def test_benchmark_metadata(self):
        """Test that benchmark metadata is complete."""
        from portfolio_engine.benchmarks import get_benchmark_metadata
        
        for profile in ["Agressif", "Modéré", "Stable"]:
            meta = get_benchmark_metadata(profile)
            
            # Required fields
            assert "symbol" in meta
            assert "name" in meta
            assert "rationale" in meta
            assert "asset_class" in meta
            
            # Optional alternatives
            assert "alternatives" in meta
            assert isinstance(meta["alternatives"], list)
    
    def test_all_benchmark_symbols(self):
        """Test get_all_benchmark_symbols returns all benchmarks."""
        from portfolio_engine.benchmarks import get_all_benchmark_symbols
        
        all_symbols = get_all_benchmark_symbols()
        
        # Primary benchmarks must be included
        assert "QQQ" in all_symbols  # Agressif
        assert "URTH" in all_symbols  # Modéré
        assert "AGG" in all_symbols  # Stable
        
        # Some alternatives
        assert "SPY" in all_symbols
        assert "IEF" in all_symbols or "BND" in all_symbols
    
    def test_benchmark_asset_classes(self):
        """Test asset class classification is correct."""
        from portfolio_engine.benchmarks import PROFILE_BENCHMARKS
        
        # Agressif and Modéré should be equity
        assert PROFILE_BENCHMARKS["Agressif"].asset_class == "equity"
        assert PROFILE_BENCHMARKS["Modéré"].asset_class == "equity"
        
        # Stable should be fixed income
        assert PROFILE_BENCHMARKS["Stable"].asset_class == "fixed_income"


class TestBacktestConfigBenchmark:
    """Test BacktestConfig auto-selection of benchmark."""
    
    def test_config_auto_selects_benchmark(self):
        """Test that BacktestConfig auto-selects benchmark based on profile."""
        from backtest.engine import BacktestConfig
        
        # Agressif → QQQ
        config_agressif = BacktestConfig(profile="Agressif")
        assert config_agressif.benchmark_symbol == "QQQ"
        
        # Modéré → URTH
        config_modere = BacktestConfig(profile="Modéré")
        assert config_modere.benchmark_symbol == "URTH"
        
        # Stable → AGG
        config_stable = BacktestConfig(profile="Stable")
        assert config_stable.benchmark_symbol == "AGG"
    
    def test_config_explicit_benchmark(self):
        """Test that explicit benchmark overrides auto-selection."""
        from backtest.engine import BacktestConfig
        
        # Explicit SPY should override default
        config = BacktestConfig(profile="Agressif", benchmark_symbol="SPY")
        assert config.benchmark_symbol == "SPY"  # Not QQQ
    
    def test_config_none_benchmark_triggers_auto(self):
        """Test that benchmark_symbol=None triggers auto-selection."""
        from backtest.engine import BacktestConfig
        
        config = BacktestConfig(profile="Stable", benchmark_symbol=None)
        assert config.benchmark_symbol == "AGG"


class TestBenchmarkValidation:
    """Test benchmark availability validation."""
    
    def test_validate_benchmark_availability_primary(self):
        """Test validation when primary benchmark is available."""
        from portfolio_engine.benchmarks import validate_benchmark_availability
        
        available = ["AAPL", "MSFT", "QQQ", "SPY"]
        result = validate_benchmark_availability(available, "Agressif")
        
        assert result["primary_available"] == True
        assert result["fallback_symbol"] == "QQQ"
    
    def test_validate_benchmark_availability_fallback(self):
        """Test validation fallback when primary unavailable."""
        from portfolio_engine.benchmarks import validate_benchmark_availability
        
        # QQQ unavailable but SPY available
        available = ["AAPL", "MSFT", "SPY", "VGT"]
        result = validate_benchmark_availability(available, "Agressif")
        
        assert result["primary_available"] == False
        assert result["primary_symbol"] == "QQQ"
        # Fallback should be one of the alternatives
        assert result["fallback_symbol"] in ["SPY", "VGT"]


class TestBenchmarkIntegration:
    """Integration tests for benchmark in backtest flow."""
    
    def test_benchmark_in_stats(self):
        """Test that benchmark metadata appears in backtest stats."""
        # This would require mock data, simplified check
        from portfolio_engine.benchmarks import get_benchmark_metadata
        
        meta = get_benchmark_metadata("Agressif")
        
        # Format should be suitable for inclusion in stats
        assert isinstance(meta, dict)
        assert "symbol" in meta
        assert meta["symbol"] == "QQQ"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
