# tests/test_deterministic.py
"""
Tests pour portfolio_engine/deterministic.py

Valide:
- canonicalize_output() produit des hashes stables
- Les champs volatils sont bien exclus
- validate_deterministic_output() détecte les différences
- DeterministicConfig configure correctement l'environnement
"""

import pytest
import json
from typing import Dict, Any


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def sample_output_v1() -> Dict[str, Any]:
    """Output de portfolio avec timestamp v1."""
    return {
        "profile": "Modéré",
        "weights": {
            "AAPL": 0.14,
            "MSFT": 0.12,
            "QQQ": 0.20,
            "AGG": 0.30,
            "GOOGL": 0.24,
        },
        "stats": {
            "expected_return": 8.5,
            "volatility": 12.3,
            "sharpe": 0.69,
        },
        "generated_at": "2025-12-16T10:00:00Z",
        "timestamp": 1734343200,
        "version": "1.0.0",
    }


@pytest.fixture
def sample_output_v2() -> Dict[str, Any]:
    """Output de portfolio avec timestamp v2 (métadonnées différentes)."""
    return {
        "profile": "Modéré",
        "weights": {
            "AAPL": 0.14,
            "MSFT": 0.12,
            "QQQ": 0.20,
            "AGG": 0.30,
            "GOOGL": 0.24,
        },
        "stats": {
            "expected_return": 8.5,
            "volatility": 12.3,
            "sharpe": 0.69,
        },
        "generated_at": "2025-12-16T15:30:00Z",  # Different
        "timestamp": 1734363000,  # Different
        "version": "1.0.1",  # Different
    }


@pytest.fixture
def sample_output_different_data() -> Dict[str, Any]:
    """Output avec données métier différentes."""
    return {
        "profile": "Modéré",
        "weights": {
            "AAPL": 0.15,  # Changed from 0.14
            "MSFT": 0.12,
            "QQQ": 0.20,
            "AGG": 0.29,  # Changed from 0.30
            "GOOGL": 0.24,
        },
        "stats": {
            "expected_return": 8.7,  # Changed
            "volatility": 12.3,
            "sharpe": 0.71,  # Changed
        },
        "generated_at": "2025-12-16T10:00:00Z",
        "timestamp": 1734343200,
        "version": "1.0.0",
    }


# =============================================================================
# TESTS - canonicalize_output
# =============================================================================

class TestCanonicalizeOutput:
    """Tests pour la fonction canonicalize_output."""
    
    def test_same_data_different_timestamps_same_hash(
        self, sample_output_v1, sample_output_v2
    ):
        """Mêmes données métier + timestamps différents = même hash."""
        try:
            from portfolio_engine.deterministic import canonicalize_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        hash1 = canonicalize_output(sample_output_v1)
        hash2 = canonicalize_output(sample_output_v2)
        
        assert hash1 == hash2, (
            f"Same data should produce same hash regardless of timestamps.\n"
            f"Hash 1: {hash1}\n"
            f"Hash 2: {hash2}"
        )
    
    def test_different_data_different_hash(
        self, sample_output_v1, sample_output_different_data
    ):
        """Données métier différentes = hash différent."""
        try:
            from portfolio_engine.deterministic import canonicalize_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        hash1 = canonicalize_output(sample_output_v1)
        hash2 = canonicalize_output(sample_output_different_data)
        
        assert hash1 != hash2, (
            f"Different data should produce different hashes.\n"
            f"Hash 1: {hash1}\n"
            f"Hash 2: {hash2}"
        )
    
    def test_hash_format(self, sample_output_v1):
        """Le hash doit avoir le format sha256:XXXX."""
        try:
            from portfolio_engine.deterministic import canonicalize_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        hash_result = canonicalize_output(sample_output_v1)
        
        assert hash_result.startswith("sha256:"), f"Hash should start with 'sha256:', got {hash_result}"
        assert len(hash_result) == 23, f"Hash should be 23 chars (sha256: + 16), got {len(hash_result)}"
    
    def test_hash_is_deterministic(self, sample_output_v1):
        """Appels répétés produisent le même hash."""
        try:
            from portfolio_engine.deterministic import canonicalize_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        hashes = [canonicalize_output(sample_output_v1) for _ in range(10)]
        
        assert len(set(hashes)) == 1, f"Multiple calls should produce identical hashes, got {set(hashes)}"
    
    def test_float_precision_tolerance(self):
        """Petites différences float (epsilon) ne changent pas le hash."""
        try:
            from portfolio_engine.deterministic import canonicalize_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        data1 = {"value": 0.14000000001}
        data2 = {"value": 0.14000000002}
        
        hash1 = canonicalize_output(data1, precision=6)
        hash2 = canonicalize_output(data2, precision=6)
        
        assert hash1 == hash2, "Small float differences should be ignored with precision rounding"
    
    def test_key_order_does_not_matter(self):
        """L'ordre des clés ne change pas le hash."""
        try:
            from portfolio_engine.deterministic import canonicalize_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        data1 = {"a": 1, "b": 2, "c": 3}
        data2 = {"c": 3, "a": 1, "b": 2}
        
        hash1 = canonicalize_output(data1)
        hash2 = canonicalize_output(data2)
        
        assert hash1 == hash2, "Key order should not affect hash (JSON sorted)"
    
    def test_nested_volatile_fields_excluded(self):
        """Les champs volatils imbriqués sont exclus."""
        try:
            from portfolio_engine.deterministic import canonicalize_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        data1 = {
            "data": {"value": 1},
            "meta": {"created_at": "2025-01-01", "updated_at": "2025-01-02"},
        }
        data2 = {
            "data": {"value": 1},
            "meta": {"created_at": "2025-06-01", "updated_at": "2025-06-02"},
        }
        
        hash1 = canonicalize_output(data1)
        hash2 = canonicalize_output(data2)
        
        assert hash1 == hash2, "Nested volatile fields should be excluded"
    
    def test_empty_dict(self):
        """Dict vide produit un hash valide."""
        try:
            from portfolio_engine.deterministic import canonicalize_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        hash_result = canonicalize_output({})
        
        assert hash_result.startswith("sha256:")
        assert len(hash_result) == 23


# =============================================================================
# TESTS - validate_deterministic_output
# =============================================================================

class TestValidateDeterministicOutput:
    """Tests pour validate_deterministic_output."""
    
    def test_identical_outputs_are_deterministic(
        self, sample_output_v1, sample_output_v2
    ):
        """Outputs avec mêmes données = is_deterministic=True."""
        try:
            from portfolio_engine.deterministic import validate_deterministic_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        result = validate_deterministic_output(sample_output_v1, sample_output_v2)
        
        assert result["is_deterministic"] is True
        assert result["hash1"] == result["hash2"]
        assert "differences" not in result
    
    def test_different_outputs_not_deterministic(
        self, sample_output_v1, sample_output_different_data
    ):
        """Outputs avec données différentes = is_deterministic=False."""
        try:
            from portfolio_engine.deterministic import validate_deterministic_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        result = validate_deterministic_output(sample_output_v1, sample_output_different_data)
        
        assert result["is_deterministic"] is False
        assert result["hash1"] != result["hash2"]
        assert "differences" in result
        assert result["n_differences"] > 0
    
    def test_differences_are_detailed(
        self, sample_output_v1, sample_output_different_data
    ):
        """Les différences sont détaillées avec path et valeurs."""
        try:
            from portfolio_engine.deterministic import validate_deterministic_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        result = validate_deterministic_output(sample_output_v1, sample_output_different_data)
        
        differences = result.get("differences", [])
        assert len(differences) > 0
        
        # Check structure of differences
        for diff in differences:
            assert "path" in diff
            assert "type" in diff


# =============================================================================
# TESTS - DeterministicConfig
# =============================================================================

class TestDeterministicConfig:
    """Tests pour DeterministicConfig."""
    
    def test_default_config_values(self):
        """Les valeurs par défaut sont correctes."""
        try:
            from portfolio_engine.deterministic import DeterministicConfig
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        config = DeterministicConfig()
        
        assert config.openblas_num_threads == 1
        assert config.mkl_num_threads == 1
        assert config.pythonhashseed == 42
        assert config.timezone == "UTC"
        assert config.numpy_seed == 42
    
    def test_to_env_vars(self):
        """to_env_vars() retourne les bonnes variables."""
        try:
            from portfolio_engine.deterministic import DeterministicConfig
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        config = DeterministicConfig()
        env_vars = config.to_env_vars()
        
        assert "OPENBLAS_NUM_THREADS" in env_vars
        assert "MKL_NUM_THREADS" in env_vars
        assert "PYTHONHASHSEED" in env_vars
        assert "TZ" in env_vars
        
        assert env_vars["PYTHONHASHSEED"] == "42"
        assert env_vars["TZ"] == "UTC"
    
    def test_custom_config(self):
        """Configuration personnalisée fonctionne."""
        try:
            from portfolio_engine.deterministic import DeterministicConfig
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        config = DeterministicConfig(
            pythonhashseed=123,
            numpy_seed=456,
            timezone="Europe/Paris",
        )
        
        assert config.pythonhashseed == 123
        assert config.numpy_seed == 456
        assert config.timezone == "Europe/Paris"
        
        env_vars = config.to_env_vars()
        assert env_vars["PYTHONHASHSEED"] == "123"
        assert env_vars["TZ"] == "Europe/Paris"


# =============================================================================
# TESTS - set_deterministic_env
# =============================================================================

class TestSetDeterministicEnv:
    """Tests pour set_deterministic_env."""
    
    def test_sets_environment_variables(self):
        """Les variables d'environnement sont configurées."""
        import os
        
        try:
            from portfolio_engine.deterministic import set_deterministic_env, DeterministicConfig
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        # Sauvegarder les valeurs originales
        original_values = {}
        config = DeterministicConfig()
        for key in config.to_env_vars():
            original_values[key] = os.environ.get(key)
        
        try:
            # Configurer l'environnement
            result = set_deterministic_env()
            
            # Vérifier que les variables sont configurées
            assert os.environ.get("PYTHONHASHSEED") == "42"
            assert os.environ.get("TZ") == "UTC"
            assert os.environ.get("OPENBLAS_NUM_THREADS") == "1"
            
            # Vérifier le retour
            assert "PYTHONHASHSEED" in result
            
        finally:
            # Restaurer les valeurs originales
            for key, value in original_values.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value


# =============================================================================
# TESTS - Volatile Fields
# =============================================================================

class TestVolatileFields:
    """Tests pour la gestion des champs volatils."""
    
    def test_default_volatile_fields_excluded(self):
        """Les champs volatils par défaut sont exclus."""
        try:
            from portfolio_engine.deterministic import canonicalize_output, DEFAULT_VOLATILE_FIELDS
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        # Vérifier que les champs courants sont dans DEFAULT_VOLATILE_FIELDS
        expected_volatile = ["generated_at", "timestamp", "version", "created_at"]
        for field in expected_volatile:
            assert field in DEFAULT_VOLATILE_FIELDS, f"{field} should be in DEFAULT_VOLATILE_FIELDS"
    
    def test_custom_volatile_fields(self):
        """On peut spécifier des champs volatils personnalisés."""
        try:
            from portfolio_engine.deterministic import canonicalize_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        data1 = {"value": 1, "custom_volatile": "aaa"}
        data2 = {"value": 1, "custom_volatile": "bbb"}
        
        # Sans custom volatile: différent
        hash1_default = canonicalize_output(data1)
        hash2_default = canonicalize_output(data2)
        assert hash1_default != hash2_default
        
        # Avec custom volatile: identique
        custom_volatile = {"custom_volatile"}
        hash1_custom = canonicalize_output(data1, volatile_fields=custom_volatile)
        hash2_custom = canonicalize_output(data2, volatile_fields=custom_volatile)
        assert hash1_custom == hash2_custom


# =============================================================================
# TESTS - Edge Cases
# =============================================================================

class TestEdgeCases:
    """Tests pour les cas limites."""
    
    def test_deeply_nested_structure(self):
        """Structures profondément imbriquées fonctionnent."""
        try:
            from portfolio_engine.deterministic import canonicalize_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        deep = {"level1": {"level2": {"level3": {"level4": {"value": 42}}}}}
        
        hash_result = canonicalize_output(deep)
        assert hash_result.startswith("sha256:")
    
    def test_list_of_dicts(self):
        """Listes de dictionnaires fonctionnent."""
        try:
            from portfolio_engine.deterministic import canonicalize_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        data = {
            "items": [
                {"name": "a", "value": 1},
                {"name": "b", "value": 2},
            ]
        }
        
        hash_result = canonicalize_output(data)
        assert hash_result.startswith("sha256:")
    
    def test_special_characters_in_strings(self):
        """Caractères spéciaux dans les strings fonctionnent."""
        try:
            from portfolio_engine.deterministic import canonicalize_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        data = {"text": "Hello\nWorld\t€ éàü 中文 🎉"}
        
        hash_result = canonicalize_output(data)
        assert hash_result.startswith("sha256:")
    
    def test_none_values(self):
        """Les valeurs None fonctionnent."""
        try:
            from portfolio_engine.deterministic import canonicalize_output
        except ImportError:
            pytest.skip("portfolio_engine.deterministic not available")
        
        data = {"value": None, "other": 1}
        
        hash_result = canonicalize_output(data)
        assert hash_result.startswith("sha256:")


# =============================================================================
# RUN
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
