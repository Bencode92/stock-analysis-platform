# portfolio_engine/deterministic.py
"""
Module pour garantir la reproductibilité des outputs du portfolio engine.

V1.0.0 (2025-12-16):
- canonicalize_output(): Hash stable d'un JSON en excluant les champs volatils
- FixtureProvider: Inputs figés pour tests CI
- set_deterministic_env(): Configure l'environnement pour reproductibilité
- DeterministicConfig: Configuration pour mode déterministe

OBJECTIF:
- En CI: tests non flaky (même inputs → même hash)
- En audit: preuve "même inputs → même output"
- En prod: les fichiers peuvent changer daily (normal)

Ref: ChatGPT audit - "canonicalize + deterministic mode en CI"
"""

import os
import json
import hashlib
import logging
from typing import Dict, List, Any, Optional, Set
from datetime import datetime
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

__version__ = "1.0.0"


# =============================================================================
# VOLATILE FIELDS - Champs à exclure du hash canonique
# =============================================================================

# Ces champs changent à chaque run même avec les mêmes inputs
DEFAULT_VOLATILE_FIELDS: Set[str] = {
    # Timestamps
    "generated_at",
    "timestamp",
    "created_at",
    "updated_at",
    "last_updated",
    "run_timestamp",
    "execution_time",
    "computation_time_ms",
    
    # Version/build info
    "version",
    "schema_version",
    "engine_version",
    
    # Random seeds (si exposés)
    "random_seed",
    "seed",
    
    # Metadata volatils
    "_meta",
    "_manifest",
    "_debug",
    
    # Hashes (circulaire si inclus)
    "content_hash",
    "canonical_hash",
    "checksum",
}

# Champs à exclure récursivement (dans les objets imbriqués)
RECURSIVE_VOLATILE_PATTERNS: List[str] = [
    "_timestamp",
    "_at",
    "_time",
    "_hash",
]


# =============================================================================
# CANONICALIZE OUTPUT
# =============================================================================

def canonicalize_output(
    data: Dict[str, Any],
    volatile_fields: Optional[Set[str]] = None,
    recursive: bool = True,
    precision: int = 6,
) -> str:
    """
    Produit un hash canonique d'un dictionnaire JSON.
    
    Le hash est stable si les données métier sont identiques,
    même si les timestamps ou métadonnées changent.
    
    Args:
        data: Dictionnaire à canonicaliser
        volatile_fields: Champs à exclure (défaut: DEFAULT_VOLATILE_FIELDS)
        recursive: Appliquer récursivement aux sous-objets
        precision: Précision décimale pour les floats (évite les différences epsilon)
    
    Returns:
        Hash SHA256 tronqué (16 chars) du contenu canonique
    
    Example:
        >>> data1 = {"weights": {"AAPL": 0.14}, "generated_at": "2025-01-01"}
        >>> data2 = {"weights": {"AAPL": 0.14}, "generated_at": "2025-01-02"}
        >>> canonicalize_output(data1) == canonicalize_output(data2)
        True
    """
    if volatile_fields is None:
        volatile_fields = DEFAULT_VOLATILE_FIELDS
    
    # Nettoyer récursivement
    cleaned = _clean_volatile(data, volatile_fields, recursive, precision)
    
    # Sérialiser de manière déterministe
    canonical_json = json.dumps(
        cleaned,
        sort_keys=True,
        ensure_ascii=True,
        separators=(',', ':'),  # Compact, pas d'espaces
        default=_json_serializer,
    )
    
    # Hash
    hash_full = hashlib.sha256(canonical_json.encode('utf-8')).hexdigest()
    return f"sha256:{hash_full[:16]}"


def _clean_volatile(
    obj: Any,
    volatile_fields: Set[str],
    recursive: bool,
    precision: int,
) -> Any:
    """Nettoie récursivement les champs volatils."""
    if isinstance(obj, dict):
        cleaned = {}
        for key, value in obj.items():
            # Skip volatile fields
            if key in volatile_fields:
                continue
            
            # Skip pattern-matched volatile fields
            if any(pattern in key.lower() for pattern in RECURSIVE_VOLATILE_PATTERNS):
                continue
            
            if recursive:
                cleaned[key] = _clean_volatile(value, volatile_fields, recursive, precision)
            else:
                cleaned[key] = _round_floats(value, precision)
        return cleaned
    
    elif isinstance(obj, list):
        if recursive:
            return [_clean_volatile(item, volatile_fields, recursive, precision) for item in obj]
        else:
            return [_round_floats(item, precision) for item in obj]
    
    elif isinstance(obj, float):
        return round(obj, precision)
    
    else:
        return obj


def _round_floats(obj: Any, precision: int) -> Any:
    """Arrondit les floats à la précision spécifiée."""
    if isinstance(obj, float):
        return round(obj, precision)
    elif isinstance(obj, dict):
        return {k: _round_floats(v, precision) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_round_floats(item, precision) for item in obj]
    return obj


def _json_serializer(obj: Any) -> Any:
    """Sérialiseur JSON pour types non-standard."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, set):
        return sorted(list(obj))
    if hasattr(obj, '__dict__'):
        return obj.__dict__
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


# =============================================================================
# DETERMINISTIC ENVIRONMENT
# =============================================================================

@dataclass
class DeterministicConfig:
    """Configuration pour le mode déterministe."""
    
    # NumPy/BLAS threads (évite variations multi-thread)
    openblas_num_threads: int = 1
    mkl_num_threads: int = 1
    numexpr_num_threads: int = 1
    omp_num_threads: int = 1
    
    # Python hash seed (pour dict ordering pre-3.7 compat)
    pythonhashseed: int = 42
    
    # Timezone (évite variations TZ)
    timezone: str = "UTC"
    
    # NumPy random seed
    numpy_seed: int = 42
    
    # Precision pour comparaisons float
    float_precision: int = 6
    
    def to_env_vars(self) -> Dict[str, str]:
        """Retourne les variables d'environnement à configurer."""
        return {
            "OPENBLAS_NUM_THREADS": str(self.openblas_num_threads),
            "MKL_NUM_THREADS": str(self.mkl_num_threads),
            "NUMEXPR_NUM_THREADS": str(self.numexpr_num_threads),
            "OMP_NUM_THREADS": str(self.omp_num_threads),
            "PYTHONHASHSEED": str(self.pythonhashseed),
            "TZ": self.timezone,
        }


def set_deterministic_env(config: Optional[DeterministicConfig] = None) -> Dict[str, str]:
    """
    Configure l'environnement pour un comportement déterministe.
    
    IMPORTANT: Appeler AVANT d'importer numpy/pandas.
    
    Args:
        config: Configuration déterministe (défaut: DeterministicConfig())
    
    Returns:
        Dict des variables d'environnement configurées
    """
    if config is None:
        config = DeterministicConfig()
    
    env_vars = config.to_env_vars()
    
    for key, value in env_vars.items():
        os.environ[key] = value
        logger.debug(f"Set {key}={value}")
    
    # Configure numpy si déjà importé
    try:
        import numpy as np
        np.random.seed(config.numpy_seed)
        logger.debug(f"Set numpy random seed to {config.numpy_seed}")
    except ImportError:
        pass
    
    logger.info(f"Deterministic environment configured: {len(env_vars)} env vars set")
    return env_vars


def get_deterministic_env_for_ci() -> str:
    """
    Retourne les commandes shell pour configurer l'environnement CI.
    
    Usage dans GitHub Actions:
        env:
          OPENBLAS_NUM_THREADS: 1
          MKL_NUM_THREADS: 1
          PYTHONHASHSEED: 42
          TZ: UTC
    """
    config = DeterministicConfig()
    lines = ["# Add to CI environment variables:"]
    for key, value in config.to_env_vars().items():
        lines.append(f"export {key}={value}")
    return "\n".join(lines)


# =============================================================================
# FIXTURE PROVIDER
# =============================================================================

@dataclass
class FixtureProvider:
    """
    Fournisseur d'inputs figés pour tests déterministes.
    
    En CI, on utilise des fixtures (données figées) au lieu des données live
    pour garantir la reproductibilité des tests.
    """
    
    fixture_dir: Path = field(default_factory=lambda: Path("tests/fixtures"))
    
    # Mapping nom → fichier fixture
    fixtures: Dict[str, str] = field(default_factory=lambda: {
        "stocks_us": "stocks_us_fixture.json",
        "stocks_europe": "stocks_europe_fixture.json",
        "combined_etfs": "combined_etfs_fixture.csv",
        "combined_bonds": "combined_bonds_fixture.csv",
        "portfolios": "portfolios_fixture.json",
        "prices": "prices_fixture.csv",
    })
    
    def get_fixture_path(self, name: str) -> Optional[Path]:
        """Retourne le chemin vers une fixture."""
        if name not in self.fixtures:
            logger.warning(f"Unknown fixture: {name}")
            return None
        
        path = self.fixture_dir / self.fixtures[name]
        if not path.exists():
            logger.warning(f"Fixture not found: {path}")
            return None
        
        return path
    
    def load_json_fixture(self, name: str) -> Optional[Dict]:
        """Charge une fixture JSON."""
        path = self.get_fixture_path(name)
        if path is None:
            return None
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading fixture {name}: {e}")
            return None
    
    def load_csv_fixture(self, name: str) -> Optional["pd.DataFrame"]:
        """Charge une fixture CSV."""
        import pandas as pd
        
        path = self.get_fixture_path(name)
        if path is None:
            return None
        
        try:
            return pd.read_csv(path)
        except Exception as e:
            logger.error(f"Error loading fixture {name}: {e}")
            return None
    
    def has_all_fixtures(self) -> bool:
        """Vérifie que toutes les fixtures existent."""
        for name in self.fixtures:
            if self.get_fixture_path(name) is None:
                return False
        return True
    
    def list_available_fixtures(self) -> List[str]:
        """Liste les fixtures disponibles."""
        available = []
        for name in self.fixtures:
            if self.get_fixture_path(name) is not None:
                available.append(name)
        return available


# =============================================================================
# DETERMINISTIC OUTPUT VALIDATOR
# =============================================================================

def validate_deterministic_output(
    run1_output: Dict[str, Any],
    run2_output: Dict[str, Any],
    volatile_fields: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    """
    Valide que deux runs produisent le même output canonique.
    
    Args:
        run1_output: Output du premier run
        run2_output: Output du second run
        volatile_fields: Champs à exclure de la comparaison
    
    Returns:
        Dict avec:
        - is_deterministic: bool
        - hash1, hash2: hashes canoniques
        - differences: liste des différences (si non déterministe)
    """
    hash1 = canonicalize_output(run1_output, volatile_fields)
    hash2 = canonicalize_output(run2_output, volatile_fields)
    
    is_deterministic = hash1 == hash2
    
    result = {
        "is_deterministic": is_deterministic,
        "hash1": hash1,
        "hash2": hash2,
    }
    
    if not is_deterministic:
        # Trouver les différences
        differences = _find_differences(run1_output, run2_output, volatile_fields or DEFAULT_VOLATILE_FIELDS)
        result["differences"] = differences
        result["n_differences"] = len(differences)
    
    return result


def _find_differences(
    obj1: Any,
    obj2: Any,
    volatile_fields: Set[str],
    path: str = "",
) -> List[Dict[str, Any]]:
    """Trouve les différences entre deux objets."""
    differences = []
    
    if type(obj1) != type(obj2):
        differences.append({
            "path": path or "root",
            "type": "type_mismatch",
            "value1": str(type(obj1)),
            "value2": str(type(obj2)),
        })
        return differences
    
    if isinstance(obj1, dict):
        all_keys = set(obj1.keys()) | set(obj2.keys())
        for key in all_keys:
            if key in volatile_fields:
                continue
            
            new_path = f"{path}.{key}" if path else key
            
            if key not in obj1:
                differences.append({
                    "path": new_path,
                    "type": "missing_in_first",
                    "value2": obj2[key],
                })
            elif key not in obj2:
                differences.append({
                    "path": new_path,
                    "type": "missing_in_second",
                    "value1": obj1[key],
                })
            else:
                differences.extend(_find_differences(obj1[key], obj2[key], volatile_fields, new_path))
    
    elif isinstance(obj1, list):
        if len(obj1) != len(obj2):
            differences.append({
                "path": path,
                "type": "length_mismatch",
                "value1": len(obj1),
                "value2": len(obj2),
            })
        else:
            for i, (item1, item2) in enumerate(zip(obj1, obj2)):
                differences.extend(_find_differences(item1, item2, volatile_fields, f"{path}[{i}]"))
    
    elif isinstance(obj1, float):
        if abs(obj1 - obj2) > 1e-6:
            differences.append({
                "path": path,
                "type": "value_mismatch",
                "value1": obj1,
                "value2": obj2,
                "diff": abs(obj1 - obj2),
            })
    
    elif obj1 != obj2:
        differences.append({
            "path": path,
            "type": "value_mismatch",
            "value1": obj1,
            "value2": obj2,
        })
    
    return differences


# =============================================================================
# CLI / DEBUG
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Test canonicalize
    data1 = {
        "weights": {"AAPL": 0.14000001, "MSFT": 0.12},
        "generated_at": "2025-01-01T10:00:00",
        "stats": {"return": 5.123456789},
    }
    
    data2 = {
        "weights": {"AAPL": 0.14000002, "MSFT": 0.12},
        "generated_at": "2025-01-02T15:30:00",  # Different timestamp
        "stats": {"return": 5.123456790},  # Slightly different float
    }
    
    hash1 = canonicalize_output(data1)
    hash2 = canonicalize_output(data2)
    
    print(f"\n📊 Canonicalize Test")
    print(f"   Hash 1: {hash1}")
    print(f"   Hash 2: {hash2}")
    print(f"   Match:  {hash1 == hash2}")
    
    # Test validation
    result = validate_deterministic_output(data1, data2)
    print(f"\n   Deterministic: {result['is_deterministic']}")
    
    # Print CI env vars
    print(f"\n📋 CI Environment Variables:")
    print(get_deterministic_env_for_ci())
