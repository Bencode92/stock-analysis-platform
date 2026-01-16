#!/usr/bin/env python3
"""
Test de validation RADAR TIE-BREAKER v4.0.0
==========================================

Ce script valide que les 4 fixes sont correctement appliqués:
1. _macro_tilts initialisé avec DEFAULT_MACRO_TILTS
2. _radar_matching créé même sans market_context
3. compute_radar_bonus_from_matching fonctionne
4. sector_balanced_selection avec tie-breaker RADAR

Usage:
    python tests/test_radar_tiebreaker.py
"""

import sys
import json
from pathlib import Path

# Ajouter le path parent pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent))

def test_macro_tilts_fallback():
    """Test FIX #1: _macro_tilts = DEFAULT_MACRO_TILTS par défaut."""
    print("\n=== TEST 1: _macro_tilts fallback ===")
    
    from portfolio_engine.factors import FactorScorer, DEFAULT_MACRO_TILTS
    
    # Test sans market_context
    scorer = FactorScorer("Modéré", market_context=None)
    
    assert scorer._macro_tilts is not None, "_macro_tilts ne devrait pas être None"
    assert scorer._macro_tilts == DEFAULT_MACRO_TILTS, "_macro_tilts devrait être DEFAULT"
    
    # Test avec market_context vide
    scorer2 = FactorScorer("Modéré", market_context={})
    assert scorer2._macro_tilts is not None, "_macro_tilts ne devrait pas être None avec {}"
    
    print("✅ FIX #1: _macro_tilts fallback OK")
    return True


def test_radar_matching_created():
    """Test FIX #1b: _radar_matching créé même sans market_context."""
    print("\n=== TEST 2: _radar_matching création ===")
    
    from portfolio_engine.factors import FactorScorer
    
    scorer = FactorScorer("Modéré", market_context=None)
    
    test_assets = [
        {
            "symbol": "AAPL", 
            "category": "equity", 
            "sector": "Technology",
            "country": "Etats-Unis",
            "ytd": 10, 
            "perf_1m": 2,
            "vol_3y": 25,
            "market_cap": 3000e9,
        },
        {
            "symbol": "MSFT", 
            "category": "equity", 
            "sector": "Healthcare",
            "country": "Etats-Unis",
            "ytd": 15,
            "perf_1m": 3,
            "vol_3y": 22,
            "market_cap": 2500e9,
        },
    ]
    
    scored = scorer.compute_scores(test_assets)
    
    has_radar = sum(1 for a in scored if a.get("_radar_matching"))
    print(f"   Assets avec _radar_matching: {has_radar}/{len(scored)}")
    
    assert has_radar > 0, "_radar_matching devrait être présent"
    
    print("✅ FIX #1b: _radar_matching créé sans market_context OK")
    return True


def test_radar_bonus_function():
    """Test FIX #2: compute_radar_bonus_from_matching."""
    print("\n=== TEST 3: compute_radar_bonus_from_matching ===")
    
    from portfolio_engine.factors import compute_radar_bonus_from_matching
    
    # Asset avec matching favored
    asset_favored = {
        "symbol": "TEST_FAVORED",
        "category": "equity",
        "_radar_matching": {
            "sector_tilt": "favored",
            "region_tilt": "favored",
        }
    }
    bonus, meta = compute_radar_bonus_from_matching(asset_favored, cap=0.03)
    print(f"   Favored: bonus={bonus}, units={meta['units']}")
    assert bonus == 0.03, f"Bonus devrait être 0.03, got {bonus}"
    assert meta["units"] == 2, f"Units devrait être 2, got {meta['units']}"
    
    # Asset avoided
    asset_avoided = {
        "symbol": "TEST_AVOIDED",
        "category": "equity",
        "_radar_matching": {
            "sector_tilt": "avoided",
            "region_tilt": "avoided",
        }
    }
    bonus, meta = compute_radar_bonus_from_matching(asset_avoided, cap=0.03)
    print(f"   Avoided: bonus={bonus}, units={meta['units']}")
    assert bonus == -0.03, f"Bonus devrait être -0.03, got {bonus}"
    
    # Asset sans _radar_matching
    asset_none = {"symbol": "TEST_NONE", "category": "equity"}
    bonus, meta = compute_radar_bonus_from_matching(asset_none, cap=0.03)
    print(f"   No matching: bonus={bonus}, reason={meta.get('reason')}")
    assert bonus == 0.0, f"Bonus devrait être 0.0, got {bonus}"
    
    print("✅ FIX #2: compute_radar_bonus_from_matching OK")
    return True


def test_eps_calibration():
    """Test FIX #3: _calibrate_eps data-driven."""
    print("\n=== TEST 4: _calibrate_eps ===")
    
    from portfolio_engine.universe import _calibrate_eps
    import random
    
    random.seed(42)
    scores = [0.5 + random.gauss(0, 0.09) for _ in range(100)]
    
    result = _calibrate_eps(scores, fallback=0.02)
    
    print(f"   n={result['n']}, method={result['method']}")
    print(f"   EPS calibré: {result['eps']:.4f}")
    
    assert 0.01 < result["eps"] < 0.05, f"EPS hors range attendu: {result['eps']}"
    assert result["method"] == "data-driven"
    
    # Test avec peu d'échantillons (fallback)
    result_small = _calibrate_eps([0.5, 0.6, 0.7], fallback=0.02)
    assert result_small["method"] == "fallback"
    
    print("✅ FIX #3: _calibrate_eps OK")
    return True


def test_full_selection_with_radar():
    """Test FIX #4: sector_balanced_selection avec RADAR."""
    print("\n=== TEST 5: sector_balanced_selection avec RADAR ===")
    
    from portfolio_engine.factors import FactorScorer
    from portfolio_engine.universe import sector_balanced_selection
    
    scorer = FactorScorer("Modéré")
    
    test_assets = []
    sectors = ["Technology", "Healthcare", "Finance", "Energy", "Consumer Discretionary"]
    countries = ["Etats-Unis", "Chine", "Allemagne", "France", "Suisse"]
    
    for i in range(50):
        test_assets.append({
            "symbol": f"STOCK{i}",
            "category": "equity",
            "sector": sectors[i % len(sectors)],
            "country": countries[i % len(countries)],
            "ytd": 10 + i,
            "perf_1m": 2 + (i % 5),
            "vol_3y": 20 + (i % 10),
            "market_cap": 1e9 * (50 - i),
        })
    
    scored = scorer.compute_scores(test_assets)
    
    selected, metadata = sector_balanced_selection(
        scored,
        target_n=25,
        enable_radar_tiebreaker=True,
    )
    
    print(f"   Sélectionnés: {len(selected)}/25")
    print(f"   RADAR actif: {metadata['radar']['enabled']}")
    print(f"   Swaps: {metadata['swaps']['count']}")
    
    assert len(selected) == 25, f"Devrait sélectionner 25, got {len(selected)}"
    assert metadata["radar"]["enabled"] == True, "RADAR devrait être actif"
    
    print("✅ FIX #4: sector_balanced_selection avec RADAR OK")
    return True


def run_all_tests():
    """Exécute tous les tests."""
    print("=" * 60)
    print("VALIDATION RADAR TIE-BREAKER v4.0.0")
    print("=" * 60)
    
    tests = [
        ("FIX #1: _macro_tilts fallback", test_macro_tilts_fallback),
        ("FIX #1b: _radar_matching création", test_radar_matching_created),
        ("FIX #2: compute_radar_bonus", test_radar_bonus_function),
        ("FIX #3: _calibrate_eps", test_eps_calibration),
        ("FIX #4: sector_balanced_selection", test_full_selection_with_radar),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, "PASS" if result else "FAIL"))
        except Exception as e:
            print(f"❌ ERREUR: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, f"ERROR: {e}"))
    
    print("\n" + "=" * 60)
    print("RÉSUMÉ")
    print("=" * 60)
    
    all_pass = True
    for name, status in results:
        icon = "✅" if status == "PASS" else "❌"
        print(f"{icon} {name}: {status}")
        if status != "PASS":
            all_pass = False
    
    print("=" * 60)
    
    if all_pass:
        print("✅ TOUS LES TESTS PASSENT - RADAR TIE-BREAKER OPÉRATIONNEL")
        return 0
    else:
        print("❌ CERTAINS TESTS ÉCHOUENT - VÉRIFIER LES ERREURS")
        return 1


if __name__ == "__main__":
    sys.exit(run_all_tests())
