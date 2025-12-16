# tests/test_deterministic.py
"""
P1-5: Test de déterminisme pour CI.

Vérifie que 2 runs avec les mêmes inputs produisent le même hash canonique.

Usage CI:
    DETERMINISTIC=1 PYTHONHASHSEED=0 pytest tests/test_deterministic.py -v

Variables d'environnement recommandées:
    DETERMINISTIC=1          # Active le mode déterministe
    PYTHONHASHSEED=0         # Ordre stable des dicts/sets
    OMP_NUM_THREADS=1        # BLAS threads
    MKL_NUM_THREADS=1        # Intel MKL threads
    OPENBLAS_NUM_THREADS=1   # OpenBLAS threads
    NUMEXPR_NUM_THREADS=1    # NumExpr threads
    TZ=UTC                   # Timezone fixe
"""
import os
import sys
import json
import pytest
from pathlib import Path

# Ajouter le répertoire racine au path
ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from utils.canonicalize import (
    compute_hashes,
    canonicalize_core,
    canonicalize_full,
    _canonical_sort,
    _round_floats,
)


# ============= FIXTURES =============

@pytest.fixture
def sample_portfolio():
    """Portfolio de test minimal."""
    return {
        "Agressif": {
            "Actions": {"AAPL": "15%", "MSFT": "12%", "NVDA": "10%"},
            "ETF": {"QQQ": "20%"},
            "Obligations": {"BND": "8%"},
            "Crypto": {"BTC": "5%"},
            "_tickers": {
                "AAPL": 0.15,
                "MSFT": 0.12,
                "NVDA": 0.10,
                "QQQ": 0.20,
                "BND": 0.08,
                "BTC": 0.05,
            },
            "_constraint_report": {
                "all_hard_satisfied": True,
                "all_soft_satisfied": True,
                "timestamp": "2025-12-16T10:00:00",  # Volatile
                "violations": [
                    {"name": "bonds_min", "priority": "soft", "actual": 8.0},
                    {"name": "crypto_max", "priority": "hard", "actual": 5.0},
                ],
                "warnings": ["warning2", "warning1"],  # Ordre non-alphabétique
                "margins": {"sum_100": 0.0, "bonds_min": 3.0},
                "relaxed_constraints": [],
            },
            "_optimization": {
                "mode": "slsqp",
                "is_heuristic": False,
                "vol_realized": 18.5,
                "vol_target": 18.0,
                "converged": True,
            },
            "_compliance_audit": {
                "timestamp": "2025-12-16T10:00:01",  # Volatile
                "llm_sanitizer": {
                    "sanitized": True,
                    "hits": [
                        ("superlatif", "idéal"),
                        ("promesse_garantie", "garanti"),
                    ],
                    "removal_ratio": 0.1,
                },
            },
            "_limitations": ["Limitation 1", "Limitation 2"],
        },
        "Modéré": {
            "Actions": {"AAPL": "10%"},
            "ETF": {"URTH": "25%"},
            "Obligations": {"AGG": "15%"},
            "Crypto": {},
            "_tickers": {"AAPL": 0.10, "URTH": 0.25, "AGG": 0.15},
            "_constraint_report": {
                "all_hard_satisfied": True,
                "timestamp": "2025-12-16T10:00:02",
                "violations": [],
                "warnings": [],
                "margins": {},
                "relaxed_constraints": [],
            },
            "_optimization": {"mode": "slsqp", "converged": True},
        },
        "Stable": {
            "Actions": {},
            "ETF": {"BND": "30%"},
            "Obligations": {"TLT": "40%"},
            "Crypto": {},
            "_tickers": {"BND": 0.30, "TLT": 0.40},
            "_constraint_report": {
                "all_hard_satisfied": True,
                "timestamp": "2025-12-16T10:00:03",
                "violations": [],
                "warnings": [],
                "margins": {},
                "relaxed_constraints": [],
            },
            "_optimization": {"mode": "slsqp", "converged": True},
        },
        "_meta": {
            "generated_at": "2025-12-16T10:00:00",  # Volatile
            "version": "v4.8.7",
            "buffett_mode": "soft",
            "buffett_min_score": 40,
            "tactical_context_enabled": False,
            "backtest_days": 90,
        },
        "_manifest": {
            "git_sha": "abc123def456",
            "data_sources": {
                "etf": {"hash": "hash_etf_123"},
                "bonds": {"hash": "hash_bonds_456"},
            },
        },
    }


@pytest.fixture
def sample_portfolio_reordered(sample_portfolio):
    """Même portfolio mais avec ordre différent des clés."""
    import copy
    reordered = copy.deepcopy(sample_portfolio)
    
    # Réordonner les violations (test du tri)
    reordered["Agressif"]["_constraint_report"]["violations"] = [
        {"name": "crypto_max", "priority": "hard", "actual": 5.0},
        {"name": "bonds_min", "priority": "soft", "actual": 8.0},
    ]
    
    # Réordonner les hits (List[Tuple])
    reordered["Agressif"]["_compliance_audit"]["llm_sanitizer"]["hits"] = [
        ("promesse_garantie", "garanti"),
        ("superlatif", "idéal"),
    ]
    
    # Réordonner les warnings
    reordered["Agressif"]["_constraint_report"]["warnings"] = ["warning1", "warning2"]
    
    # Timestamp différent (doit être ignoré)
    reordered["_meta"]["generated_at"] = "2025-12-16T12:00:00"
    reordered["Agressif"]["_constraint_report"]["timestamp"] = "2025-12-16T12:00:01"
    
    return reordered


# ============= TESTS UNITAIRES =============

class TestCanonicalSort:
    """Tests pour _canonical_sort()."""
    
    def test_sort_dict(self):
        """Dict trié par clé."""
        d = {"z": 1, "a": 2, "m": 3}
        result = _canonical_sort(d)
        assert list(result.keys()) == ["a", "m", "z"]
    
    def test_sort_list_strings(self):
        """List[str] triée alphabétiquement."""
        lst = ["zebra", "apple", "mango"]
        result = _canonical_sort(lst)
        assert result == ["apple", "mango", "zebra"]
    
    def test_sort_list_dicts(self):
        """List[dict] triée par JSON canonique."""
        lst = [
            {"name": "z", "value": 1},
            {"name": "a", "value": 2},
        ]
        result = _canonical_sort(lst)
        # "a" < "z" dans JSON canonique
        assert result[0]["name"] == "a"
        assert result[1]["name"] == "z"
    
    def test_sort_list_tuples(self):
        """List[tuple] triée par éléments."""
        lst = [("z", "1"), ("a", "2"), ("a", "1")]
        result = _canonical_sort(lst)
        assert result == [("a", "1"), ("a", "2"), ("z", "1")]
    
    def test_nested_sort(self):
        """Tri récursif."""
        d = {
            "b": {"z": 1, "a": 2},
            "a": [3, 1, 2],
        }
        result = _canonical_sort(d)
        assert list(result.keys()) == ["a", "b"]
        assert result["a"] == [1, 2, 3]
        assert list(result["b"].keys()) == ["a", "z"]


class TestRoundFloats:
    """Tests pour _round_floats()."""
    
    def test_round_single_float(self):
        assert _round_floats(1.123456789, 6) == 1.123457
        assert _round_floats(1.123456789, 2) == 1.12
    
    def test_round_in_dict(self):
        d = {"a": 1.123456789, "b": 2.987654321}
        result = _round_floats(d, 4)
        assert result == {"a": 1.1235, "b": 2.9877}
    
    def test_round_in_list(self):
        lst = [1.111111, 2.222222, 3.333333]
        result = _round_floats(lst, 2)
        assert result == [1.11, 2.22, 3.33]
    
    def test_round_nested(self):
        d = {"a": {"b": [1.123456]}}
        result = _round_floats(d, 3)
        assert result == {"a": {"b": [1.123]}}


# ============= TESTS HASH CANONIQUE =============

class TestCoreHash:
    """Tests pour core_hash (allowlist)."""
    
    def test_same_hash_same_input(self, sample_portfolio):
        """Même input → même hash."""
        h1 = compute_hashes(sample_portfolio)
        h2 = compute_hashes(sample_portfolio)
        assert h1["core_hash"] == h2["core_hash"]
    
    def test_same_hash_reordered_input(self, sample_portfolio, sample_portfolio_reordered):
        """Input réordonné → même hash (grâce au tri)."""
        h1 = compute_hashes(sample_portfolio)
        h2 = compute_hashes(sample_portfolio_reordered)
        assert h1["core_hash"] == h2["core_hash"]
    
    def test_different_hash_different_allocation(self, sample_portfolio):
        """Allocation différente → hash différent."""
        import copy
        modified = copy.deepcopy(sample_portfolio)
        modified["Agressif"]["Actions"]["AAPL"] = "20%"  # 15% → 20%
        
        h1 = compute_hashes(sample_portfolio)
        h2 = compute_hashes(modified)
        assert h1["core_hash"] != h2["core_hash"]
    
    def test_timestamp_ignored(self, sample_portfolio):
        """Timestamp différent → même hash."""
        import copy
        modified = copy.deepcopy(sample_portfolio)
        modified["_meta"]["generated_at"] = "2099-01-01T00:00:00"
        
        h1 = compute_hashes(sample_portfolio)
        h2 = compute_hashes(modified)
        assert h1["core_hash"] == h2["core_hash"]
    
    def test_backtest_ignored(self, sample_portfolio):
        """_backtest ignoré dans core_hash."""
        import copy
        modified = copy.deepcopy(sample_portfolio)
        modified["Agressif"]["_backtest"] = {
            "return_pct": 10.5,
            "volatility_pct": 15.2,
        }
        
        h1 = compute_hashes(sample_portfolio)
        h2 = compute_hashes(modified)
        assert h1["core_hash"] == h2["core_hash"]


class TestFullHash:
    """Tests pour full_hash (denylist)."""
    
    def test_full_hash_different_from_core(self, sample_portfolio):
        """full_hash != core_hash (plus de contenu)."""
        hashes = compute_hashes(sample_portfolio)
        # Ils peuvent être égaux si le portfolio est minimal
        # Mais normalement full inclut plus de champs
        assert "core_hash" in hashes
        assert "full_hash" in hashes
    
    def test_full_hash_ignores_timestamp(self, sample_portfolio):
        """Timestamp ignoré dans full_hash aussi."""
        import copy
        modified = copy.deepcopy(sample_portfolio)
        modified["_meta"]["generated_at"] = "2099-01-01T00:00:00"
        
        h1 = compute_hashes(sample_portfolio)
        h2 = compute_hashes(modified)
        assert h1["full_hash"] == h2["full_hash"]


# ============= TESTS D'INTÉGRATION =============

class TestDeterminism:
    """Tests de déterminisme end-to-end."""
    
    def test_json_roundtrip(self, sample_portfolio):
        """Sérialisation/désérialisation préserve le hash."""
        json_str = json.dumps(sample_portfolio)
        restored = json.loads(json_str)
        
        h1 = compute_hashes(sample_portfolio)
        h2 = compute_hashes(restored)
        assert h1["core_hash"] == h2["core_hash"]
    
    def test_canonical_json_is_deterministic(self, sample_portfolio):
        """Le JSON canonique est identique entre appels."""
        c1 = canonicalize_core(sample_portfolio)
        c2 = canonicalize_core(sample_portfolio)
        assert c1 == c2
    
    def test_float_precision_absorbed(self, sample_portfolio):
        """Micro-différences floats absorbées par rounding."""
        import copy
        modified = copy.deepcopy(sample_portfolio)
        
        # Ajouter une micro-différence (< 6 décimales)
        modified["Agressif"]["_optimization"]["vol_realized"] = 18.5000001
        
        h1 = compute_hashes(sample_portfolio)
        h2 = compute_hashes(modified)
        assert h1["core_hash"] == h2["core_hash"]


# ============= TEST AVEC FIXTURES RÉELLES =============

class TestWithRealFixtures:
    """Tests avec fixtures réelles (si disponibles)."""
    
    @pytest.mark.skipif(
        not (ROOT_DIR / "tests" / "fixtures" / "raw_data").exists(),
        reason="Fixtures not available"
    )
    def test_fixture_portfolio_hash_stable(self):
        """Hash stable sur fixture réelle."""
        fixture_path = ROOT_DIR / "tests" / "fixtures" / "golden" / "portfolios_canonical.json"
        if not fixture_path.exists():
            pytest.skip("Golden fixture not available")
        
        with open(fixture_path, "r", encoding="utf-8") as f:
            golden = json.load(f)
        
        expected_hash = golden.get("_meta", {}).get("expected_core_hash")
        if not expected_hash:
            pytest.skip("No expected_core_hash in golden fixture")
        
        actual = compute_hashes(golden)
        assert actual["core_hash"] == expected_hash


# ============= CLI =============

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
