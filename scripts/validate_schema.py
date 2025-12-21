#!/usr/bin/env python3
"""
Portfolio JSON Schema Validator

P0-1: Validates portfolio output against JSON Schema.
Used by CI and can be run locally.

v2.1.0: Updated max position limits to match optimizer.py v6.19
- Stable: 25% max for bonds (was 15%)
- Per-profile limits for bonds vs other assets

Usage:
    python scripts/validate_schema.py data/portfolios.json
    python scripts/validate_schema.py --all  # Validate all portfolio files
"""

import json
import sys
import argparse
from pathlib import Path
from typing import List, Tuple, Optional

try:
    import jsonschema
    from jsonschema import validate, ValidationError, SchemaError
except ImportError:
    print("ERROR: jsonschema not installed. Run: pip install jsonschema")
    sys.exit(1)


# Paths
SCHEMA_PATH = Path(__file__).parent.parent / "schemas" / "portfolio_output.json"
DATA_DIR = Path(__file__).parent.parent / "data"


def load_schema() -> dict:
    """Load the JSON schema."""
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"Schema not found: {SCHEMA_PATH}")
    
    with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_json(filepath: Path) -> dict:
    """Load a JSON file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def validate_portfolio(filepath: Path, schema: dict) -> Tuple[bool, List[str]]:
    """
    Validate a portfolio JSON file against the schema.
    
    Returns:
        (is_valid, list of error messages)
    """
    errors = []
    
    try:
        data = load_json(filepath)
    except json.JSONDecodeError as e:
        return False, [f"Invalid JSON: {e}"]
    except FileNotFoundError:
        return False, [f"File not found: {filepath}"]
    
    # Validate against schema
    try:
        validate(instance=data, schema=schema)
    except ValidationError as e:
        # Get detailed error path
        path = " -> ".join(str(p) for p in e.absolute_path) or "root"
        errors.append(f"Validation error at '{path}': {e.message}")
        return False, errors
    except SchemaError as e:
        errors.append(f"Schema error: {e.message}")
        return False, errors
    
    # Additional business logic validations
    business_errors = validate_business_rules(data)
    if business_errors:
        errors.extend(business_errors)
        return False, errors
    
    return True, []


def validate_business_rules(data: dict) -> List[str]:
    """
    Validate business rules beyond JSON Schema.
    
    Checks:
    1. Sum of weights = 100% (with tolerance)
    2. Max single position per profile (bonds have higher limits)
    3. Profile-specific constraints (bonds min/max, crypto max)
    4. _meta required fields
    
    v2.1.0: Updated limits to match optimizer.py v6.19
    """
    errors = []
    
    profiles = ["Agressif", "Modéré", "Stable"]
    
    # Profile-specific constraints - aligned with optimizer.py v6.19
    constraints = {
        "Agressif": {
            "bonds_min": 5, 
            "crypto_max": 10,
            "max_single_position": 15,  # Default max
            "max_single_bond": 5,       # From MAX_SINGLE_BOND_WEIGHT
        },
        "Modéré": {
            "bonds_min": 15, 
            "crypto_max": 5,
            "max_single_position": 15,  # Default max
            "max_single_bond": 15,      # Relaxed for diversification
        },
        "Stable": {
            "bonds_min": 35, 
            "crypto_max": 0,
            "max_single_position": 15,  # Default max for non-bonds
            "max_single_bond": 25,      # From MAX_SINGLE_BOND_WEIGHT
        },
    }
    
    for profile in profiles:
        if profile not in data:
            errors.append(f"Missing profile: {profile}")
            continue
        
        portfolio = data[profile]
        profile_constraints = constraints[profile]
        
        # Get bond tickers for special handling
        bond_tickers = set()
        for bond_name in portfolio.get("Obligations", {}).keys():
            # Try to find the ticker in _tickers that corresponds to this bond
            # Bond names in Obligations map to tickers
            pass  # We'll identify bonds by checking Obligations section
        
        # Build set of bond tickers from Obligations section
        # Match by checking if ticker weight matches obligation weight
        obligations = portfolio.get("Obligations", {})
        tickers_data = portfolio.get("_tickers", {})
        
        # Parse obligation weights
        bond_weights = {}
        for name, pct_str in obligations.items():
            try:
                weight = float(pct_str.rstrip('%')) / 100
                bond_weights[name] = weight
            except:
                pass
        
        # Try to identify which tickers are bonds by matching weights
        # This is a heuristic - bonds in _tickers should have same weight as in Obligations
        identified_bond_tickers = set()
        for ticker, weight in tickers_data.items():
            for bond_name, bond_weight in bond_weights.items():
                if abs(weight - bond_weight) < 0.001:  # Same weight = likely the same
                    identified_bond_tickers.add(ticker)
                    break
        
        # Check _tickers exists and sum to ~100%
        if "_tickers" in portfolio:
            tickers = portfolio["_tickers"]
            total_weight = sum(tickers.values())
            
            if abs(total_weight - 1.0) > 0.01:  # 1% tolerance
                errors.append(
                    f"{profile}: _tickers sum = {total_weight:.4f} "
                    f"(expected ~1.0, diff = {abs(total_weight - 1.0):.4f})"
                )
            
            # Check max single position with different limits for bonds
            for ticker, weight in tickers.items():
                is_bond = ticker in identified_bond_tickers
                
                if is_bond:
                    max_allowed = profile_constraints["max_single_bond"] / 100
                    asset_type = "bond"
                else:
                    max_allowed = profile_constraints["max_single_position"] / 100
                    asset_type = "position"
                
                # Add 0.5% tolerance for rounding
                if weight > max_allowed + 0.005:
                    errors.append(
                        f"{profile}: {asset_type.capitalize()} {ticker} = {weight:.1%} "
                        f"(exceeds {max_allowed:.0%} limit for {asset_type}s)"
                    )
        
        # Check bonds minimum (from Obligations category)
        bonds_weight = sum(
            float(v.rstrip('%')) / 100 
            for v in portfolio.get("Obligations", {}).values()
        )
        bonds_min = profile_constraints["bonds_min"] / 100
        
        if bonds_weight < bonds_min - 0.01:  # 1% tolerance
            errors.append(
                f"{profile}: Bonds = {bonds_weight:.1%} "
                f"(minimum {bonds_min:.0%} required)"
            )
        
        # Check crypto maximum
        crypto_weight = sum(
            float(v.rstrip('%')) / 100 
            for v in portfolio.get("Crypto", {}).values()
        )
        crypto_max = profile_constraints["crypto_max"] / 100
        
        if crypto_weight > crypto_max + 0.01:  # 1% tolerance
            errors.append(
                f"{profile}: Crypto = {crypto_weight:.1%} "
                f"(maximum {crypto_max:.0%} allowed)"
            )
    
    # Check _meta
    if "_meta" in data:
        meta = data["_meta"]
        if "generated_at" not in meta:
            errors.append("_meta: missing 'generated_at'")
        if "version" not in meta:
            errors.append("_meta: missing 'version'")
    else:
        errors.append("Missing '_meta' section")
    
    return errors


def find_portfolio_files() -> List[Path]:
    """Find all portfolio JSON files in data directory."""
    patterns = [
        "portfolios.json",
        "portfolios_*.json",
        "portfolio_*.json",
    ]
    
    files = []
    for pattern in patterns:
        files.extend(DATA_DIR.glob(pattern))
    
    return sorted(set(files))


def main():
    parser = argparse.ArgumentParser(
        description="Validate portfolio JSON against schema"
    )
    parser.add_argument(
        "file",
        nargs="?",
        help="Path to portfolio JSON file"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Validate all portfolio files in data/"
    )
    parser.add_argument(
        "--schema",
        type=Path,
        default=SCHEMA_PATH,
        help="Path to JSON schema file"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output"
    )
    
    args = parser.parse_args()
    
    # Determine files to validate
    if args.all:
        files = find_portfolio_files()
        if not files:
            print("No portfolio files found in data/")
            sys.exit(1)
    elif args.file:
        files = [Path(args.file)]
    else:
        # Default: validate data/portfolios.json
        files = [DATA_DIR / "portfolios.json"]
    
    # Load schema
    try:
        schema = load_schema()
        if args.verbose:
            print(f"✓ Loaded schema: {SCHEMA_PATH}")
    except Exception as e:
        print(f"✗ Failed to load schema: {e}")
        sys.exit(1)
    
    # Validate each file
    all_valid = True
    results = []
    
    for filepath in files:
        is_valid, errors = validate_portfolio(filepath, schema)
        results.append((filepath, is_valid, errors))
        
        if not is_valid:
            all_valid = False
    
    # Print results
    print("\n" + "=" * 60)
    print("PORTFOLIO SCHEMA VALIDATION REPORT")
    print("=" * 60 + "\n")
    
    for filepath, is_valid, errors in results:
        status = "✓ PASS" if is_valid else "✗ FAIL"
        print(f"{status}: {filepath.name}")
        
        if errors:
            for error in errors:
                print(f"    └─ {error}")
        elif args.verbose:
            print("    └─ All validations passed")
    
    print("\n" + "-" * 60)
    passed = sum(1 for _, v, _ in results if v)
    total = len(results)
    print(f"Summary: {passed}/{total} files passed validation")
    
    if all_valid:
        print("\n✓ All validations PASSED")
        sys.exit(0)
    else:
        print("\n✗ Some validations FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
