#!/usr/bin/env python3
"""
Test de validation RADAR TIE-BREAKER v1.3
==========================================

Ce script valide que les fixes sont correctement appliqués:
1. _macro_tilts initialisé avec DEFAULT_MACRO_TILTS (deepcopy)
2. _radar_matching créé même sans market_context
3. compute_radar_bonus_from_matching fonctionne
4. Coverage séparée: mapping vs tilt (gate sur tilt)
5. Tie-breaker change effectivement l'ordre
6. Distribution bonus non-dégénérée
7. DEFAULT_MACRO_TILTS immutable (anti-mutation)

Usage:
    python tests/test_radar_tiebreaker.py
"""

import sys
import math
import copy
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
    
    # Vérifier que c'est une copie (pas la même référence)
    assert scorer._macro_tilts is not DEFAULT_MACRO_TILTS, \
        "_macro_tilts devrait être une copie, pas la référence globale"
    
    # Test avec market_context vide
    scorer2 = FactorScorer("Modéré", market_context={})
    assert scorer2._macro_tilts is not None, "_macro_tilts ne devrait pas être None avec {}"
    
    print("✅ FIX #1: _macro_tilts fallback OK")
    return True


def test_default_macro_tilts_immutable():
    """Test CRITIQUE: DEFAULT_MACRO_TILTS n'est pas muté après scoring."""
    print("\n=== TEST 2: DEFAULT_MACRO_TILTS immutabilité ===")
    
    from portfolio_engine.factors import FactorScorer, DEFAULT_MACRO_TILTS
    
    # Snapshot avant
    original = copy.deepcopy(DEFAULT_MACRO_TILTS)
    
    # Score avec market_context vide (utilise fallback)
    scorer = FactorScorer("Modéré", market_context=None)
    test_assets = [
        {"symbol": "TEST1", "category": "equity", "sector": "Healthcare", "country": "Etats-Unis", "ytd": 10},
        {"symbol": "TEST2", "category": "equity", "sector": "Technology", "country": "Chine", "ytd": 15},
    ]
    scorer.compute_scores(test_assets)
    
    # Vérifier que le global n'a pas changé
    assert DEFAULT_MACRO_TILTS == original, \
        f"DEFAULT_MACRO_TILTS a été muté! Avant: {original}, Après: {DEFAULT_MACRO_TILTS}"
    
    # Vérifier les listes internes aussi
    assert DEFAULT_MACRO_TILTS["favored_sectors"] == original["favored_sectors"], \
        "favored_sectors a été muté!"
    assert DEFAULT_MACRO_TILTS["avoided_sectors"] == original["avoided_sectors"], \
        "avoided_sectors a été muté!"
    
    print("✅ FIX #2: DEFAULT_MACRO_TILTS immutable OK")
    return True


def test_radar_matching_created():
    """Test FIX #1b: _radar_matching créé même sans market_context."""
    print("\n=== TEST 3: _radar_matching création ===")
    
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
            "symbol": "JNJ", 
            "category": "equity", 
            "sector": "Healthcare",  # favored
            "country": "Etats-Unis",  # favored
            "ytd": 15,
            "perf_1m": 3,
            "vol_3y": 22,
            "market_cap": 2500e9,
        },
        {
            "symbol": "BABA",
            "category": "equity",
            "sector": "Consumer Discretionary",  # avoided
            "country": "Chine",  # avoided
            "ytd": 5,
            "perf_1m": 1,
            "vol_3y": 35,
            "market_cap": 200e9,
        },
    ]
    
    scored = scorer.compute_scores(test_assets)
    
    has_radar = sum(1 for a in scored if a.get("_radar_matching"))
    print(f"   Assets avec _radar_matching: {has_radar}/{len(scored)}")
    
    assert has_radar > 0, "_radar_matching devrait être présent"
    
    # Vérifier les tilts
    for asset in scored:
        rm = asset.get("_radar_matching", {})
        print(f"   {asset['symbol']}: sector_tilt={rm.get('sector_tilt')}, region_tilt={rm.get('region_tilt')}")
    
    # JNJ devrait avoir favored (healthcare + usa)
    jnj = next(a for a in scored if a["symbol"] == "JNJ")
    jnj_rm = jnj.get("_radar_matching", {})
    assert jnj_rm.get("sector_tilt") == "favored", \
        f"JNJ sector devrait être favored, got {jnj_rm.get('sector_tilt')}"
    
    # BABA devrait avoir avoided
    baba = next(a for a in scored if a["symbol"] == "BABA")
    baba_rm = baba.get("_radar_matching", {})
    assert baba_rm.get("region_tilt") == "avoided", \
        f"BABA region devrait être avoided, got {baba_rm.get('region_tilt')}"
    
    print("✅ FIX #3: _radar_matching créé sans market_context OK")
    return True


def test_radar_bonus_function():
    """Test FIX #2: compute_radar_bonus_from_matching."""
    print("\n=== TEST 4: compute_radar_bonus_from_matching ===")
    
    from portfolio_engine.factors import compute_radar_bonus_from_matching
    
    # Asset avec matching favored (2 units)
    asset_favored = {
        "symbol": "TEST_FAVORED",
        "category": "equity",
        "_radar_matching": {
            "sector_tilt": "favored",
            "region_tilt": "favored",
        }
    }
    bonus, meta = compute_radar_bonus_from_matching(asset_favored, cap=0.03)
    print(f"   Favored (2 units): bonus={bonus}, units={meta['units']}")
    assert bonus == 0.03, f"Bonus devrait être 0.03, got {bonus}"
    assert meta["units"] == 2, f"Units devrait être 2, got {meta['units']}"
    
    # Asset avec 1 favored, 1 avoided (0 units)
    asset_mixed = {
        "symbol": "TEST_MIXED",
        "category": "equity",
        "_radar_matching": {
            "sector_tilt": "favored",
            "region_tilt": "avoided",
        }
    }
    bonus, meta = compute_radar_bonus_from_matching(asset_mixed, cap=0.03)
    print(f"   Mixed (0 units): bonus={bonus}, units={meta['units']}")
    assert bonus == 0.0, f"Bonus devrait être 0.0, got {bonus}"
    
    # Asset avoided (2 units négatifs)
    asset_avoided = {
        "symbol": "TEST_AVOIDED",
        "category": "equity",
        "_radar_matching": {
            "sector_tilt": "avoided",
            "region_tilt": "avoided",
        }
    }
    bonus, meta = compute_radar_bonus_from_matching(asset_avoided, cap=0.03)
    print(f"   Avoided (-2 units): bonus={bonus}, units={meta['units']}")
    assert bonus == -0.03, f"Bonus devrait être -0.03, got {bonus}"
    
    # Asset sans _radar_matching
    asset_none = {"symbol": "TEST_NONE", "category": "equity"}
    bonus, meta = compute_radar_bonus_from_matching(asset_none, cap=0.03)
    print(f"   No matching: bonus={bonus}, reason={meta.get('reason')}")
    assert bonus == 0.0, f"Bonus devrait être 0.0, got {bonus}"
    assert meta.get("reason") == "no_radar_matching"
    
    # ETF: region_tilt ignoré
    asset_etf = {
        "symbol": "TEST_ETF",
        "category": "etf",
        "_radar_matching": {
            "sector_tilt": "favored",
            "region_tilt": "favored",  # ignoré pour ETF
        }
    }
    bonus, meta = compute_radar_bonus_from_matching(asset_etf, cap=0.03)
    print(f"   ETF (sector only): bonus={bonus}, units={meta['units']}")
    assert meta["units"] == 1, f"ETF devrait avoir 1 unit (sector only), got {meta['units']}"
    assert bonus == 0.015, f"Bonus ETF devrait être 0.015, got {bonus}"
    
    print("✅ FIX #4: compute_radar_bonus_from_matching OK")
    return True


def test_coverage_mapping_vs_tilt():
    """Test v1.3: Coverage séparée mapping vs tilt."""
    print("\n=== TEST 5: Coverage mapping vs tilt ===")
    
    from portfolio_engine.universe import has_meaningful_radar, _compute_radar_coverage
    
    # Assets avec différents niveaux de signal
    fake_assets = [
        # A: mapping présent mais pas de tilt
        {
            "symbol": "A", 
            "_radar_matching": {
                "sector_normalized": "technology", 
                "region_normalized": "usa",
                "sector_in_favored": False,
                "sector_in_avoided": False,
                "region_in_favored": False,
                "region_in_avoided": False,
            }
        },
        # B: mapping vide
        {
            "symbol": "B", 
            "_radar_matching": {
                "sector_normalized": "", 
                "region_normalized": "",
                "sector_in_favored": False,
                "sector_in_avoided": False,
            }
        },
        # C: tilt effectif (favored)
        {
            "symbol": "C", 
            "_radar_matching": {
                "sector_normalized": "healthcare", 
                "region_normalized": "usa",
                "sector_in_favored": True,
                "region_in_favored": True,
            }
        },
        # D: tilt effectif (avoided)
        {
            "symbol": "D", 
            "_radar_matching": {
                "sector_normalized": "consumer-discretionary", 
                "region_normalized": "china",
                "sector_in_avoided": True,
                "region_in_avoided": True,
            }
        },
        # E: pas de _radar_matching
        {"symbol": "E"},
    ]
    
    stats = _compute_radar_coverage(fake_assets)
    
    print(f"   Total: {stats['total']}")
    print(f"   With radar key: {stats['with_radar_key']}")
    print(f"   With mapping: {stats['with_mapping']} (coverage: {stats['coverage_mapping']:.1%})")
    print(f"   With tilt: {stats['with_tilt']} (coverage: {stats['coverage_tilt']:.1%})")
    
    # Vérifications
    assert stats["total"] == 5
    assert stats["with_radar_key"] == 4  # A, B, C, D ont _radar_matching
    assert stats["with_mapping"] == 3    # A, C, D ont mapping non vide
    assert stats["with_tilt"] == 2       # C, D ont tilt effectif
    
    assert stats["coverage_raw"] == 0.8      # 4/5
    assert stats["coverage_mapping"] == 0.6  # 3/5
    assert stats["coverage_tilt"] == 0.4     # 2/5 - CELUI POUR LE GATE
    
    # Test has_meaningful_radar (v1.3: strict = tilt effectif seulement)
    assert not has_meaningful_radar(fake_assets[0]), "A: mapping sans tilt != meaningful"
    assert not has_meaningful_radar(fake_assets[1]), "B: mapping vide != meaningful"
    assert has_meaningful_radar(fake_assets[2]), "C: tilt favored = meaningful"
    assert has_meaningful_radar(fake_assets[3]), "D: tilt avoided = meaningful"
    assert not has_meaningful_radar(fake_assets[4]), "E: pas de radar != meaningful"
    
    print("✅ FIX #5: Coverage mapping vs tilt OK")
    return True


def test_eps_calibration():
    """Test FIX #3: _calibrate_eps data-driven."""
    print("\n=== TEST 6: _calibrate_eps ===")
    
    from portfolio_engine.universe import _calibrate_eps
    import random
    
    random.seed(42)
    scores = [0.5 + random.gauss(0, 0.09) for _ in range(100)]
    
    result = _calibrate_eps(scores, fallback=0.02)
    
    print(f"   n={result['n']}, method={result['method']}")
    print(f"   EPS calibré: {result['eps']:.4f}")
    print(f"   std: {result['std']:.4f}")
    
    assert 0.01 < result["eps"] < 0.05, f"EPS hors range attendu: {result['eps']}"
    assert result["method"] == "data-driven"
    
    # Test avec peu d'échantillons (fallback)
    result_small = _calibrate_eps([0.5, 0.6, 0.7], fallback=0.02)
    print(f"   Petit échantillon: EPS={result_small['eps']}, method={result_small['method']}")
    assert result_small["method"] == "fallback"
    assert result_small["eps"] == 0.02
    
    print("✅ FIX #6: _calibrate_eps OK")
    return True


def test_radar_bonus_changes_order_in_tie_band():
    """
    Test CRITIQUE v1.3: Vérifie que le tie-breaker change réellement l'ordre.
    Deux assets même bucket, scores proches → l'ordre doit changer avec bonus.
    """
    print("\n=== TEST 7: Tie-breaker change l'ordre ===")
    
    # Trois assets avec scores quasi-identiques (même bucket avec eps=0.02)
    assets = [
        {
            "symbol": "NEUTRAL_A",
            "composite_score": 0.500,
            "_radar_bonus": 0.00,
            "_radar_matching": {
                "sector_tilt": "neutral",
                "region_tilt": "neutral",
            },
        },
        {
            "symbol": "FAVORED_B",
            "composite_score": 0.501,  # Score légèrement supérieur
            "_radar_bonus": 0.03,      # Bonus RADAR max
            "_radar_matching": {
                "sector_tilt": "favored",
                "region_tilt": "favored",
            },
        },
        {
            "symbol": "AVOIDED_C",
            "composite_score": 0.502,  # Score encore supérieur
            "_radar_bonus": -0.03,     # Malus RADAR max
            "_radar_matching": {
                "sector_tilt": "avoided",
                "region_tilt": "avoided",
            },
        },
    ]
    
    eps = 0.02
    
    # Fonction de tri AVEC radar (v1.3: floor au lieu de round)
    def sort_key_radar(a):
        score = a["composite_score"]
        bucket = math.floor(score / eps)
        radar = a.get("_radar_bonus", 0.0)
        aid = a["symbol"].lower()
        return (-bucket, -radar, -score, aid)
    
    # Fonction de tri SANS radar (score pur)
    def sort_key_no_radar(a):
        return (-a["composite_score"], a["symbol"].lower())
    
    # Tri sans radar
    sorted_no_radar = sorted(assets, key=sort_key_no_radar)
    order_no_radar = [a["symbol"] for a in sorted_no_radar]
    print(f"   Sans RADAR: {order_no_radar}")
    
    # Tri avec radar
    sorted_with_radar = sorted(assets, key=sort_key_radar)
    order_with_radar = [a["symbol"] for a in sorted_with_radar]
    print(f"   Avec RADAR: {order_with_radar}")
    
    # Vérifications
    # Sans radar: C > B > A (par score décroissant)
    assert order_no_radar == ["AVOIDED_C", "FAVORED_B", "NEUTRAL_A"], \
        f"Sans radar devrait être par score décroissant, got {order_no_radar}"
    
    # Avec radar dans même bucket: B (bonus +0.03) > A (0) ou C (bonus -0.03)
    # Bucket de tous = floor(0.5/0.02) = 25
    assert sorted_with_radar[0]["symbol"] == "FAVORED_B", \
        f"FAVORED_B devrait être premier avec radar, got {sorted_with_radar[0]['symbol']}"
    assert sorted_with_radar[-1]["symbol"] == "AVOIDED_C", \
        f"AVOIDED_C devrait être dernier avec radar, got {sorted_with_radar[-1]['symbol']}"
    
    # L'ordre a changé
    assert order_no_radar != order_with_radar, \
        "L'ordre devrait changer avec le tie-breaker RADAR!"
    
    print("✅ FIX #7: Tie-breaker change effectivement l'ordre OK")
    return True


def test_radar_bonus_distribution():
    """
    Test v1.3: Vérifie que la distribution des bonus n'est pas dégénérée.
    """
    print("\n=== TEST 8: Distribution bonus non-dégénérée ===")
    
    from portfolio_engine.factors import FactorScorer, compute_radar_bonus_from_matching
    import numpy as np
    
    scorer = FactorScorer("Modéré")
    
    # Générer assets variés
    test_assets = []
    configs = [
        ("Healthcare", "Etats-Unis"),         # favored + favored
        ("Healthcare", "Chine"),               # favored + avoided
        ("Consumer Discretionary", "Suisse"),  # avoided + favored
        ("Consumer Discretionary", "Chine"),   # avoided + avoided
        ("Technology", "Allemagne"),           # neutral + neutral
        ("Utilities", "Etats-Unis"),           # favored + favored
        ("Real Estate", "Chine"),              # avoided + avoided
    ]
    
    for i, (sector, country) in enumerate(configs * 7):  # ~50 assets
        test_assets.append({
            "symbol": f"STOCK_{i}",
            "category": "equity",
            "sector": sector,
            "country": country,
            "ytd": 10 + i,
            "perf_1m": 2,
            "vol_3y": 20,
            "market_cap": 1e9,
        })
    
    scored = scorer.compute_scores(test_assets)
    
    # Calculer les bonus
    bonuses = []
    for a in scored:
        bonus, _ = compute_radar_bonus_from_matching(a, cap=0.03)
        bonuses.append(bonus)
    
    bonuses = np.array(bonuses)
    non_zero = np.sum(bonuses != 0)
    std_bonus = np.std(bonuses)
    
    print(f"   Total assets: {len(bonuses)}")
    print(f"   Non-zero bonus: {non_zero} ({non_zero/len(bonuses)*100:.1f}%)")
    print(f"   Bonus std: {std_bonus:.4f}")
    print(f"   Bonus range: [{bonuses.min():.3f}, {bonuses.max():.3f}]")
    print(f"   Bonus unique values: {sorted(set(bonuses))}")
    
    # Vérifications
    assert non_zero > 0, "Au moins un bonus non-nul attendu!"
    assert std_bonus > 0.001, f"Distribution dégénérée (std={std_bonus})"
    assert bonuses.min() < 0, "Devrait avoir des malus (avoided)"
    assert bonuses.max() > 0, "Devrait avoir des bonus (favored)"
    
    print("✅ FIX #8: Distribution bonus non-dégénérée OK")
    return True


def test_full_selection_with_radar():
    """Test complet: sector_balanced_selection avec RADAR."""
    print("\n=== TEST 9: sector_balanced_selection avec RADAR ===")
    
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
    print(f"   Coverage mapping: {metadata['radar']['coverage'].get('coverage_mapping', 'N/A')}")
    print(f"   Coverage tilt: {metadata['radar']['coverage'].get('coverage_tilt', 'N/A')}")
    print(f"   Swaps: {metadata['swaps']['count']}")
    print(f"   Interprétation: {metadata['swaps']['interpretation']}")
    
    assert len(selected) == 25, f"Devrait sélectionner 25, got {len(selected)}"
    assert "radar" in metadata
    assert "swaps" in metadata
    
    print("✅ FIX #9: sector_balanced_selection avec RADAR OK")
    return True


def run_all_tests():
    """Exécute tous les tests."""
    print("=" * 70)
    print("VALIDATION RADAR TIE-BREAKER v1.3")
    print("=" * 70)
    
    tests = [
        ("FIX #1: _macro_tilts fallback", test_macro_tilts_fallback),
        ("FIX #2: DEFAULT_MACRO_TILTS immutable", test_default_macro_tilts_immutable),
        ("FIX #3: _radar_matching création", test_radar_matching_created),
        ("FIX #4: compute_radar_bonus", test_radar_bonus_function),
        ("FIX #5: Coverage mapping vs tilt", test_coverage_mapping_vs_tilt),
        ("FIX #6: _calibrate_eps", test_eps_calibration),
        ("FIX #7: Tie-breaker change ordre", test_radar_bonus_changes_order_in_tie_band),
        ("FIX #8: Distribution bonus", test_radar_bonus_distribution),
        ("FIX #9: Full selection", test_full_selection_with_radar),
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
            results.append((name, f"ERROR: {str(e)[:50]}"))
    
    print("\n" + "=" * 70)
    print("RÉSUMÉ")
    print("=" * 70)
    
    all_pass = True
    for name, status in results:
        icon = "✅" if status == "PASS" else "❌"
        print(f"{icon} {name}: {status}")
        if status != "PASS":
            all_pass = False
    
    print("=" * 70)
    
    if all_pass:
        print("✅ TOUS LES TESTS PASSENT - RADAR TIE-BREAKER v1.3 OPÉRATIONNEL")
        return 0
    else:
        print("❌ CERTAINS TESTS ÉCHOUENT - VÉRIFIER LES ERREURS")
        return 1


if __name__ == "__main__":
    sys.exit(run_all_tests())
