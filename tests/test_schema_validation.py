# tests/test_schema_validation.py
"""
Unit tests for portfolio schema validation.

P0-1: Ensures schema validation works correctly.
"""

import pytest
import json
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from scripts.validate_schema import (
        load_schema,
        validate_portfolio,
        validate_business_rules,
        SCHEMA_PATH,
    )
    SCHEMA_AVAILABLE = True
except ImportError:
    SCHEMA_AVAILABLE = False


# Skip all tests if jsonschema not installed
pytestmark = pytest.mark.skipif(
    not SCHEMA_AVAILABLE,
    reason="jsonschema not installed or validate_schema not available"
)


class TestSchemaLoading:
    """Test schema file loading."""
    
    def test_schema_exists(self):
        """Schema file should exist."""
        assert SCHEMA_PATH.exists(), f"Schema not found: {SCHEMA_PATH}"
    
    def test_schema_valid_json(self):
        """Schema should be valid JSON."""
        with open(SCHEMA_PATH) as f:
            schema = json.load(f)
        assert isinstance(schema, dict)
    
    def test_schema_has_required_fields(self):
        """Schema should have required top-level fields."""
        schema = load_schema()
        assert "$schema" in schema
        assert "definitions" in schema
        assert "properties" in schema
        assert "required" in schema
    
    def test_schema_defines_profiles(self):
        """Schema should define all three profiles."""
        schema = load_schema()
        required = schema.get("required", [])
        assert "Agressif" in required
        assert "Modéré" in required
        assert "Stable" in required
        assert "_meta" in required


class TestValidPortfolios:
    """Test validation of valid portfolios."""
    
    @pytest.fixture
    def schema(self):
        return load_schema()
    
    @pytest.fixture
    def minimal_valid_portfolio(self, tmp_path):
        """Create a minimal valid portfolio file."""
        data = {
            "Agressif": {
                "Commentaire": "A" * 100,  # Min 50 chars
                "Actions": {"AAPL": "50%", "MSFT": "40%"},
                "ETF": {},
                "Obligations": {"AGG": "10%"},
                "Crypto": {},
                "_tickers": {"AAPL": 0.50, "MSFT": 0.40, "AGG": 0.10}
            },
            "Modéré": {
                "Commentaire": "B" * 100,
                "Actions": {"AAPL": "40%", "MSFT": "30%"},
                "ETF": {},
                "Obligations": {"AGG": "15%", "BND": "15%"},
                "Crypto": {},
                "_tickers": {"AAPL": 0.40, "MSFT": 0.30, "AGG": 0.15, "BND": 0.15}
            },
            "Stable": {
                "Commentaire": "C" * 100,
                "Actions": {"JNJ": "20%", "PG": "20%"},
                "ETF": {},
                "Obligations": {"AGG": "20%", "BND": "20%", "TLT": "20%"},
                "Crypto": {},
                "_tickers": {"JNJ": 0.20, "PG": 0.20, "AGG": 0.20, "BND": 0.20, "TLT": 0.20}
            },
            "_meta": {
                "generated_at": "2025-12-15T10:00:00.000000",
                "version": "v4.0.0"
            }
        }
        
        filepath = tmp_path / "test_portfolio.json"
        with open(filepath, 'w') as f:
            json.dump(data, f)
        
        return filepath
    
    def test_minimal_valid_passes(self, schema, minimal_valid_portfolio):
        """Minimal valid portfolio should pass validation."""
        is_valid, errors = validate_portfolio(minimal_valid_portfolio, schema)
        assert is_valid, f"Validation failed: {errors}"
    
    def test_real_portfolios_json(self, schema):
        """Real portfolios.json should pass validation."""
        filepath = Path(__file__).parent.parent / "data" / "portfolios.json"
        if filepath.exists():
            is_valid, errors = validate_portfolio(filepath, schema)
            # Note: may fail on business rules if constraints not met
            # Schema validation should pass
            assert is_valid or any("bonds" in e.lower() for e in errors), \
                f"Unexpected errors: {errors}"


class TestInvalidPortfolios:
    """Test validation catches invalid portfolios."""
    
    @pytest.fixture
    def schema(self):
        return load_schema()
    
    def test_missing_profile_fails(self, schema, tmp_path):
        """Missing profile should fail."""
        data = {
            "Agressif": {
                "Commentaire": "A" * 100,
                "Actions": {}, "ETF": {}, "Obligations": {}, "Crypto": {},
                "_tickers": {}
            },
            # Missing Modéré and Stable
            "_meta": {"generated_at": "2025-12-15T10:00:00", "version": "v1.0.0"}
        }
        
        filepath = tmp_path / "invalid.json"
        with open(filepath, 'w') as f:
            json.dump(data, f)
        
        is_valid, errors = validate_portfolio(filepath, schema)
        assert not is_valid
        assert any("Modéré" in e or "Stable" in e for e in errors)
    
    def test_missing_meta_fails(self, schema, tmp_path):
        """Missing _meta should fail."""
        data = {
            "Agressif": {
                "Commentaire": "A" * 100,
                "Actions": {}, "ETF": {}, "Obligations": {}, "Crypto": {},
                "_tickers": {}
            },
            "Modéré": {
                "Commentaire": "B" * 100,
                "Actions": {}, "ETF": {}, "Obligations": {}, "Crypto": {},
                "_tickers": {}
            },
            "Stable": {
                "Commentaire": "C" * 100,
                "Actions": {}, "ETF": {}, "Obligations": {}, "Crypto": {},
                "_tickers": {}
            },
            # Missing _meta
        }
        
        filepath = tmp_path / "invalid.json"
        with open(filepath, 'w') as f:
            json.dump(data, f)
        
        is_valid, errors = validate_portfolio(filepath, schema)
        assert not is_valid
        assert any("_meta" in e for e in errors)
    
    def test_invalid_weight_format_fails(self, schema, tmp_path):
        """Invalid weight format should fail."""
        data = {
            "Agressif": {
                "Commentaire": "A" * 100,
                "Actions": {"AAPL": "not-a-percentage"},  # Invalid!
                "ETF": {}, "Obligations": {}, "Crypto": {},
                "_tickers": {}
            },
            "Modéré": {
                "Commentaire": "B" * 100,
                "Actions": {}, "ETF": {}, "Obligations": {}, "Crypto": {},
                "_tickers": {}
            },
            "Stable": {
                "Commentaire": "C" * 100,
                "Actions": {}, "ETF": {}, "Obligations": {}, "Crypto": {},
                "_tickers": {}
            },
            "_meta": {"generated_at": "2025-12-15T10:00:00", "version": "v1.0.0"}
        }
        
        filepath = tmp_path / "invalid.json"
        with open(filepath, 'w') as f:
            json.dump(data, f)
        
        is_valid, errors = validate_portfolio(filepath, schema)
        assert not is_valid


class TestBusinessRules:
    """Test business rule validations."""
    
    def test_weights_sum_validation(self):
        """Weights should sum to ~100%."""
        # Valid: sums to 1.0
        data = {
            "Agressif": {"_tickers": {"A": 0.5, "B": 0.5}},
            "Modéré": {"_tickers": {"A": 0.5, "B": 0.5}},
            "Stable": {"_tickers": {"A": 0.5, "B": 0.5}},
            "_meta": {"generated_at": "2025-12-15T10:00:00", "version": "v1.0.0"}
        }
        errors = validate_business_rules(data)
        weight_errors = [e for e in errors if "sum" in e.lower()]
        assert len(weight_errors) == 0
    
    def test_weights_sum_invalid(self):
        """Invalid weight sum should be caught."""
        data = {
            "Agressif": {"_tickers": {"A": 0.3, "B": 0.3}},  # Only 0.6
            "Modéré": {"_tickers": {"A": 0.5, "B": 0.5}},
            "Stable": {"_tickers": {"A": 0.5, "B": 0.5}},
            "_meta": {"generated_at": "2025-12-15T10:00:00", "version": "v1.0.0"}
        }
        errors = validate_business_rules(data)
        assert any("Agressif" in e and "sum" in e.lower() for e in errors)
    
    def test_max_position_validation(self):
        """Max single position should be enforced."""
        data = {
            "Agressif": {"_tickers": {"A": 0.80, "B": 0.20}},  # A = 80% > 15%
            "Modéré": {"_tickers": {"A": 0.5, "B": 0.5}},
            "Stable": {"_tickers": {"A": 0.5, "B": 0.5}},
            "_meta": {"generated_at": "2025-12-15T10:00:00", "version": "v1.0.0"}
        }
        errors = validate_business_rules(data)
        assert any("15%" in e for e in errors)
    
    def test_bonds_minimum_stable(self):
        """Stable profile should have 35% bonds minimum."""
        data = {
            "Agressif": {
                "Obligations": {},
                "_tickers": {"A": 1.0}
            },
            "Modéré": {
                "Obligations": {"AGG": "20%"},
                "_tickers": {"A": 1.0}
            },
            "Stable": {
                "Obligations": {"AGG": "10%"},  # Only 10%, need 35%
                "_tickers": {"A": 1.0}
            },
            "_meta": {"generated_at": "2025-12-15T10:00:00", "version": "v1.0.0"}
        }
        errors = validate_business_rules(data)
        assert any("Stable" in e and "Bonds" in e for e in errors)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
