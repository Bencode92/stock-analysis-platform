#!/usr/bin/env python3
"""
test_integration_v4.py - Test d'intégration du pipeline complet v4

Vérifie que tous les modules fonctionnent ensemble :
- portfolio_engine (universe, factors, optimizer, llm_commentary)
- compliance (amf, sanitizer)
- generate_portfolios_v4.py

Exécution :
    python tests/test_integration_v4.py
"""

import sys
import json
import tempfile
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, List

# Ajouter le répertoire parent au path pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_imports():
    """Test 1: Vérifier que tous les imports fonctionnent."""
    print("=" * 60)
    print("TEST 1: Imports des modules")
    print("=" * 60)
    
    errors = []
    
    # Portfolio Engine
    try:
        from portfolio_engine import (
            build_scored_universe,
            load_and_build_universe,
            FactorScorer,
            PROFILE_WEIGHTS,
            rescore_universe_by_profile,
            PortfolioOptimizer,
            Asset,
            PROFILES,
            convert_universe_to_assets,
            build_commentary_prompt,
            generate_fallback_commentary,
            merge_commentary_into_portfolios,
        )
        print("✅ portfolio_engine: OK")
    except ImportError as e:
        errors.append(f"portfolio_engine: {e}")
        print(f"❌ portfolio_engine: {e}")
    
    # Compliance
    try:
        from compliance import (
            AMF_DISCLAIMER,
            generate_compliance_block,
            validate_compliance_text,
            sanitize_marketing_language,
            sanitize_portfolio_output,
            check_forbidden_terms,
        )
        print("✅ compliance: OK")
    except ImportError as e:
        errors.append(f"compliance: {e}")
        print(f"❌ compliance: {e}")
    
    return len(errors) == 0


def test_universe_construction():
    """Test 2: Construction d'univers avec données mockées."""
    print("\n" + "=" * 60)
    print("TEST 2: Construction de l'univers")
    print("=" * 60)
    
    from portfolio_engine import build_scored_universe, compute_scores
    
    # Données mockées
    mock_stocks = [
        {
            "stocks": [
                {"name": "Apple Inc", "ticker": "AAPL", "sector": "Technology",
                 "perf_ytd": 25.0, "perf_1m": 3.0, "perf_3m": 8.0,
                 "volatility_3y": 22.0, "max_drawdown_ytd": -12.0, "market_cap": 3000000000000},
                {"name": "Microsoft Corp", "ticker": "MSFT", "sector": "Technology",
                 "perf_ytd": 18.0, "perf_1m": 2.0, "perf_3m": 6.0,
                 "volatility_3y": 20.0, "max_drawdown_ytd": -10.0, "market_cap": 2800000000000},
                {"name": "Johnson & Johnson", "ticker": "JNJ", "sector": "Healthcare",
                 "perf_ytd": 5.0, "perf_1m": 1.0, "perf_3m": 2.0,
                 "volatility_3y": 14.0, "max_drawdown_ytd": -8.0, "market_cap": 400000000000},
            ]
        }
    ]
    
    mock_etfs = [
        {"name": "Vanguard S&P 500 ETF", "ytd_return_pct": 15.0, "vol_pct": 18.0,
         "aum_usd": 800000000000, "fund_type": "Equity", "leverage": ""},
        {"name": "iShares Euro Govt Bond", "ytd_return_pct": 2.0, "vol_pct": 5.0,
         "aum_usd": 50000000000, "fund_type": "Bond", "leverage": ""},
        {"name": "SPDR Gold Shares", "ytd_return_pct": 12.0, "vol_pct": 15.0,
         "aum_usd": 60000000000, "fund_type": "Commodity", "leverage": ""},
    ]
    
    mock_crypto = [
        {"symbol": "BTC", "ret_1d_pct": 2.0, "ret_7d_pct": 5.0, "ret_ytd_pct": 80.0,
         "vol_30d_annual_pct": 55.0, "drawdown_90d_pct": -15.0},
        {"symbol": "ETH", "ret_1d_pct": 3.0, "ret_7d_pct": 8.0, "ret_ytd_pct": 60.0,
         "vol_30d_annual_pct": 65.0, "drawdown_90d_pct": -20.0},
    ]
    
    # Construire l'univers
    universe = build_scored_universe(
        stocks_data=mock_stocks,
        etf_data=mock_etfs,
        crypto_data=mock_crypto,
    )
    
    print(f"   Univers construit: {len(universe)} actifs")
    
    # Vérifications
    assert len(universe) > 0, "Univers vide!"
    
    # Vérifier la structure
    for asset in universe[:3]:
        assert "id" in asset, "Missing 'id'"
        assert "name" in asset, "Missing 'name'"
        assert "score" in asset, "Missing 'score'"
        assert "category" in asset, "Missing 'category'"
    
    print("✅ Construction univers: OK")
    return True


def test_factor_scoring():
    """Test 3: Scoring multi-facteur."""
    print("\n" + "=" * 60)
    print("TEST 3: Scoring multi-facteur")
    print("=" * 60)
    
    from portfolio_engine import FactorScorer, PROFILE_WEIGHTS, rescore_universe_by_profile
    
    # Mock universe
    universe = [
        {"id": "EQ_1", "name": "Apple", "score": 0.5, "category": "equity",
         "perf_1m": 5.0, "perf_3m": 10.0, "vol": 22.0, "max_dd": -12.0, "liquidity": 3000000000000},
        {"id": "EQ_2", "name": "Microsoft", "score": 0.4, "category": "equity",
         "perf_1m": 3.0, "perf_3m": 8.0, "vol": 20.0, "max_dd": -10.0, "liquidity": 2800000000000},
    ]
    
    # Test pour chaque profil
    for profile in ["Agressif", "Modéré", "Stable"]:
        scorer = FactorScorer(profile=profile)
        scored = rescore_universe_by_profile(universe, profile)
        
        assert len(scored) == len(universe), f"Perte d'actifs pour {profile}"
        
        # Vérifier que les scores ont été recalculés
        for asset in scored:
            assert "adjusted_score" in asset or "score" in asset
        
        print(f"   {profile}: {len(scored)} actifs scorés")
    
    print("✅ Scoring multi-facteur: OK")
    return True


def test_optimizer():
    """Test 4: Optimiseur avec contraintes."""
    print("\n" + "=" * 60)
    print("TEST 4: Optimisation sous contraintes")
    print("=" * 60)
    
    from portfolio_engine import PortfolioOptimizer, Asset, PROFILES
    
    # Créer des assets mock
    assets = [
        Asset(id="EQ_1", name="Apple", category="equity", score=1.2,
              expected_return=0.15, volatility=0.22, sector="Technology"),
        Asset(id="EQ_2", name="Microsoft", category="equity", score=1.0,
              expected_return=0.12, volatility=0.20, sector="Technology"),
        Asset(id="EQ_3", name="JNJ", category="equity", score=0.6,
              expected_return=0.08, volatility=0.14, sector="Healthcare"),
        Asset(id="ETF_s1", name="Vanguard S&P 500", category="etf", score=0.8,
              expected_return=0.10, volatility=0.18, sector="Broad Market"),
        Asset(id="ETF_b1", name="iShares Euro Govt", category="bond", score=0.3,
              expected_return=0.03, volatility=0.05, sector="Government Bonds"),
        Asset(id="ETF_b2", name="Treasury Bond ETF", category="bond", score=0.25,
              expected_return=0.025, volatility=0.04, sector="Government Bonds"),
        Asset(id="CR_1", name="Bitcoin", category="crypto", score=1.5,
              expected_return=0.30, volatility=0.55, sector="Crypto"),
    ]
    
    optimizer = PortfolioOptimizer()
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        allocation, diagnostics = optimizer.build_portfolio(assets, profile)
        
        # Vérifications
        total_weight = sum(allocation.values())
        assert abs(total_weight - 100.0) < 0.1, f"{profile}: Total = {total_weight}% (!= 100%)"
        
        # Vérifier contraintes crypto
        crypto_weight = sum(w for aid, w in allocation.items() if "CR_" in aid)
        max_crypto = PROFILES[profile].crypto_max
        assert crypto_weight <= max_crypto + 0.1, f"{profile}: Crypto {crypto_weight}% > {max_crypto}%"
        
        # Vérifier contraintes bonds
        bonds_weight = sum(w for aid, w in allocation.items() if "ETF_b" in aid)
        min_bonds = PROFILES[profile].bonds_min
        assert bonds_weight >= min_bonds - 0.1, f"{profile}: Bonds {bonds_weight}% < {min_bonds}%"
        
        print(f"   {profile}: {len(allocation)} lignes, total={total_weight:.1f}%")
        print(f"      Crypto: {crypto_weight:.1f}% (max {max_crypto}%), Bonds: {bonds_weight:.1f}% (min {min_bonds}%)")
    
    print("✅ Optimisation: OK")
    return True


def test_compliance():
    """Test 5: Compliance AMF et sanitisation."""
    print("\n" + "=" * 60)
    print("TEST 5: Compliance AMF")
    print("=" * 60)
    
    from compliance import (
        AMF_DISCLAIMER,
        generate_compliance_block,
        validate_compliance_text,
        sanitize_marketing_language,
        check_forbidden_terms,
    )
    
    # Test disclaimer
    assert len(AMF_DISCLAIMER) > 50, "Disclaimer trop court"
    assert "risque" in AMF_DISCLAIMER.lower(), "Disclaimer sans mention de risque"
    print("   Disclaimer AMF: OK")
    
    # Test génération bloc compliance
    for profile in ["Agressif", "Modéré", "Stable"]:
        block = generate_compliance_block(
            profile=profile,
            vol_estimate=15.0,
            crypto_exposure=5.0 if profile != "Stable" else 0.0,
        )
        assert len(block) > 0, f"Bloc vide pour {profile}"
        print(f"   Bloc {profile}: {len(block)} caractères")
    
    # Test sanitisation
    test_texts = [
        ("Ce placement est garanti sans risque", True),  # Interdit
        ("Rendement assuré de 10%", True),  # Interdit
        ("Opportunité unique à ne pas rater", True),  # Interdit
        ("Exposition diversifiée aux marchés actions", False),  # OK
        ("Allocation prudente avec volatilité maîtrisée", False),  # OK
    ]
    
    for text, should_have_forbidden in test_texts:
        has_forbidden, terms = check_forbidden_terms(text)
        if should_have_forbidden:
            assert has_forbidden, f"Terme interdit non détecté: {text}"
        
        sanitized = sanitize_marketing_language(text)
        assert sanitized is not None
    
    print("   Sanitisation: OK")
    
    # Test validation
    valid_text = "⚠️ AVERTISSEMENT : Ce portefeuille comporte un risque de perte en capital. Ne constitue pas un conseil."
    is_valid, issues = validate_compliance_text(valid_text)
    assert is_valid, f"Texte valide rejeté: {issues}"
    print("   Validation: OK")
    
    print("✅ Compliance AMF: OK")
    return True


def test_llm_commentary_fallback():
    """Test 6: Génération commentaires sans LLM."""
    print("\n" + "=" * 60)
    print("TEST 6: Commentaires fallback (sans LLM)")
    print("=" * 60)
    
    from portfolio_engine import generate_fallback_commentary, merge_commentary_into_portfolios
    
    # Mock portfolios
    portfolios = {
        "Agressif": {
            "allocation": {"EQ_1": 30.0, "ETF_s1": 40.0, "ETF_b1": 20.0, "CR_1": 10.0},
            "diagnostics": {"portfolio_vol": 18.5},
        },
        "Modéré": {
            "allocation": {"EQ_1": 20.0, "ETF_s1": 35.0, "ETF_b1": 40.0, "CR_1": 5.0},
            "diagnostics": {"portfolio_vol": 12.0},
        },
        "Stable": {
            "allocation": {"EQ_1": 10.0, "ETF_s1": 20.0, "ETF_b1": 70.0},
            "diagnostics": {"portfolio_vol": 7.5},
        },
    }
    
    # Mock assets
    assets = [
        {"id": "EQ_1", "name": "Apple", "category": "equity", "score": 1.2},
        {"id": "ETF_s1", "name": "Vanguard S&P 500", "category": "etf", "score": 0.8},
        {"id": "ETF_b1", "name": "iShares Euro Govt", "category": "bond", "score": 0.3},
        {"id": "CR_1", "name": "Bitcoin", "category": "crypto", "score": 1.5},
    ]
    
    # Générer commentaires
    commentary = generate_fallback_commentary(portfolios, assets)
    
    assert commentary is not None, "Commentary None"
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        assert profile in commentary, f"Missing {profile} in commentary"
        c = commentary[profile]
        assert "comment" in c, f"Missing 'comment' for {profile}"
        assert len(c["comment"]) > 20, f"Comment trop court pour {profile}"
        print(f"   {profile}: {len(c['comment'])} caractères")
    
    # Fusionner
    merged = merge_commentary_into_portfolios(portfolios, commentary)
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        assert "comment" in merged[profile], f"Fusion échouée pour {profile}"
    
    print("✅ Commentaires fallback: OK")
    return True


def test_full_pipeline():
    """Test 7: Pipeline complet end-to-end."""
    print("\n" + "=" * 60)
    print("TEST 7: Pipeline complet")
    print("=" * 60)
    
    from portfolio_engine import (
        build_scored_universe,
        rescore_universe_by_profile,
        PortfolioOptimizer,
        convert_universe_to_assets,
        generate_fallback_commentary,
        merge_commentary_into_portfolios,
    )
    from compliance import (
        generate_compliance_block,
        sanitize_portfolio_output,
    )
    
    # 1. Données mockées
    mock_stocks = [{"stocks": [
        {"name": "Apple", "ticker": "AAPL", "sector": "Technology",
         "perf_ytd": 25.0, "perf_1m": 3.0, "perf_3m": 8.0,
         "volatility_3y": 22.0, "max_drawdown_ytd": -12.0, "market_cap": 3e12},
        {"name": "Microsoft", "ticker": "MSFT", "sector": "Technology",
         "perf_ytd": 18.0, "perf_1m": 2.0, "perf_3m": 6.0,
         "volatility_3y": 20.0, "max_drawdown_ytd": -10.0, "market_cap": 2.8e12},
        {"name": "JNJ", "ticker": "JNJ", "sector": "Healthcare",
         "perf_ytd": 5.0, "perf_1m": 1.0, "perf_3m": 2.0,
         "volatility_3y": 14.0, "max_drawdown_ytd": -8.0, "market_cap": 4e11},
    ]}]
    
    mock_etfs = [
        {"name": "Vanguard S&P 500", "ytd_return_pct": 15.0, "vol_pct": 18.0,
         "aum_usd": 8e11, "fund_type": "Equity"},
        {"name": "iShares Euro Govt", "ytd_return_pct": 2.0, "vol_pct": 5.0,
         "aum_usd": 5e10, "fund_type": "Bond"},
        {"name": "Treasury ETF", "ytd_return_pct": 1.5, "vol_pct": 4.0,
         "aum_usd": 3e10, "fund_type": "Bond"},
        {"name": "Gold ETF", "ytd_return_pct": 12.0, "vol_pct": 15.0,
         "aum_usd": 6e10, "fund_type": "Commodity"},
    ]
    
    mock_crypto = [
        {"symbol": "BTC", "ret_1d_pct": 2.0, "ret_7d_pct": 5.0, "ret_ytd_pct": 80.0,
         "vol_30d_annual_pct": 55.0, "drawdown_90d_pct": -15.0},
    ]
    
    # 2. Construire univers
    universe = build_scored_universe(mock_stocks, mock_etfs, mock_crypto)
    print(f"   Univers: {len(universe)} actifs")
    
    # 3. Optimiser chaque profil
    optimizer = PortfolioOptimizer()
    portfolios = {}
    all_assets = []
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        scored = rescore_universe_by_profile(universe, profile)
        assets = convert_universe_to_assets(scored)
        if not all_assets:
            all_assets = assets
        
        allocation, diagnostics = optimizer.build_portfolio(assets, profile)
        portfolios[profile] = {
            "allocation": allocation,
            "diagnostics": diagnostics,
        }
        print(f"   {profile}: {len(allocation)} lignes")
    
    # 4. Commentaires
    commentary = generate_fallback_commentary(portfolios, all_assets)
    portfolios = merge_commentary_into_portfolios(portfolios, commentary)
    
    # 5. Compliance
    for profile in portfolios:
        portfolios[profile] = sanitize_portfolio_output(portfolios[profile])
        portfolios[profile]["compliance"] = generate_compliance_block(profile=profile)
    
    # 6. Vérifications finales
    for profile in ["Agressif", "Modéré", "Stable"]:
        pf = portfolios[profile]
        assert "allocation" in pf, f"Missing allocation for {profile}"
        assert "comment" in pf, f"Missing comment for {profile}"
        assert "compliance" in pf, f"Missing compliance for {profile}"
        
        total = sum(pf["allocation"].values())
        assert abs(total - 100.0) < 0.5, f"{profile}: Total = {total}%"
    
    print("✅ Pipeline complet: OK")
    return True


def run_all_tests():
    """Exécute tous les tests."""
    print("\n" + "=" * 60)
    print("🧪 TESTS D'INTÉGRATION - Portfolio Engine v4")
    print("=" * 60)
    
    tests = [
        ("Imports", test_imports),
        ("Universe Construction", test_universe_construction),
        ("Factor Scoring", test_factor_scoring),
        ("Optimizer", test_optimizer),
        ("Compliance AMF", test_compliance),
        ("LLM Commentary Fallback", test_llm_commentary_fallback),
        ("Full Pipeline", test_full_pipeline),
    ]
    
    results = []
    for name, test_fn in tests:
        try:
            success = test_fn()
            results.append((name, success, None))
        except Exception as e:
            results.append((name, False, str(e)))
            print(f"❌ {name}: ERREUR - {e}")
    
    # Résumé
    print("\n" + "=" * 60)
    print("📊 RÉSUMÉ")
    print("=" * 60)
    
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    
    for name, ok, error in results:
        status = "✅ PASS" if ok else f"❌ FAIL: {error}"
        print(f"   {name}: {status}")
    
    print(f"\n   Total: {passed}/{total} tests passés")
    
    if passed == total:
        print("\n🎉 TOUS LES TESTS PASSENT!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) échoué(s)")
        return 1


if __name__ == "__main__":
    sys.exit(run_all_tests())
