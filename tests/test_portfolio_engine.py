# tests/test_portfolio_engine.py
"""
Tests d'intégration pour le module portfolio_engine.
Run: python -m pytest tests/test_portfolio_engine.py -v
"""

import sys
import os
import json
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)

# Ajouter le répertoire racine au path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_import_modules():
    """Test que tous les modules s'importent correctement."""
    from portfolio_engine import (
        FactorScorer,
        PortfolioOptimizer,
        PROFILES,
        convert_universe_to_assets,
    )
    assert FactorScorer is not None
    assert PortfolioOptimizer is not None
    assert "Agressif" in PROFILES
    print("✅ Import modules OK")


def test_factor_scorer():
    """Test du scoring multi-facteur."""
    from portfolio_engine.factors import FactorScorer, PROFILE_WEIGHTS
    
    # Données de test
    assets = [
        {"name": "AAPL", "perf_1m": 5, "perf_3m": 12, "ytd": 25, "vol_3y": 28, "max_drawdown_ytd": -15, "liquidity": 3e12},
        {"name": "MSFT", "perf_1m": 3, "perf_3m": 8, "ytd": 18, "vol_3y": 22, "max_drawdown_ytd": -12, "liquidity": 2.8e12},
        {"name": "XYZ", "perf_1m": -2, "perf_3m": -5, "ytd": 90, "vol_3y": 45, "max_drawdown_ytd": -25, "liquidity": 1e9},
    ]
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        scorer = FactorScorer(profile)
        scored = scorer.compute_scores(assets.copy())
        
        assert all("composite_score" in a for a in scored)
        assert all("factor_scores" in a for a in scored)
        
        # XYZ devrait être pénalisé (sur-extension YTD>80 + momentum négatif)
        xyz = next(a for a in scored if a["name"] == "XYZ")
        aapl = next(a for a in scored if a["name"] == "AAPL")
        assert xyz["composite_score"] < aapl["composite_score"], \
            f"XYZ devrait être pénalisé vs AAPL dans {profile}"
    
    print("✅ Factor scorer OK")


def test_optimizer_constraints():
    """Test que l'optimiseur respecte les contraintes."""
    from portfolio_engine.optimizer import (
        PortfolioOptimizer, 
        Asset, 
        PROFILES,
        validate_portfolio
    )
    
    # Créer un univers de test
    assets = []
    
    # Actions (20)
    for i in range(20):
        assets.append(Asset(
            id=f"EQ_{i+1}",
            name=f"Stock_{i+1}",
            category="Actions",
            sector=["Tech", "Finance", "Healthcare", "Consumer", "Industrial"][i % 5],
            region=["US", "Europe", "Asia"][i % 3],
            score=1.0 - i * 0.03,
            vol_annual=20 + i * 0.5,
        ))
    
    # ETF (10)
    for i in range(10):
        assets.append(Asset(
            id=f"ETF_{i+1}",
            name=f"ETF_{i+1}",
            category="ETF",
            sector="Diversified",
            region="Global",
            score=0.8 - i * 0.05,
            vol_annual=12 + i * 0.3,
        ))
    
    # Bonds (8)
    for i in range(8):
        assets.append(Asset(
            id=f"BOND_{i+1}",
            name=f"Bond_{i+1}",
            category="Obligations",
            sector="Bonds",
            region="Global",
            score=0.3 - i * 0.02,
            vol_annual=4 + i * 0.2,
        ))
    
    # Crypto (3)
    for i in range(3):
        assets.append(Asset(
            id=f"CRYPTO_{i+1}",
            name=f"Crypto_{i+1}",
            category="Crypto",
            sector="Crypto",
            region="Global",
            score=1.2 - i * 0.3,
            vol_annual=70 + i * 10,
        ))
    
    optimizer = PortfolioOptimizer()
    
    for profile_name in ["Agressif", "Modéré", "Stable"]:
        profile = PROFILES[profile_name]
        allocation, diag = optimizer.build_portfolio(assets, profile_name)
        
        # Validation
        is_valid, errors = validate_portfolio(allocation, assets, profile)
        
        print(f"\n{profile_name}:")
        print(f"  Actifs: {diag['n_assets']}")
        print(f"  Vol: {diag['portfolio_vol']}% (cible: {diag['vol_target']}%)")
        print(f"  Score: {diag['portfolio_score']}")
        print(f"  Valid: {is_valid}")
        if errors:
            for e in errors:
                print(f"    - {e}")
        
        # Assertions
        assert abs(sum(allocation.values()) - 100) < 0.1, f"Somme ≠ 100% pour {profile_name}"
        assert diag['n_assets'] >= profile.min_assets, f"Pas assez d'actifs pour {profile_name}"
        assert max(allocation.values()) <= profile.max_single_position + 0.1, \
            f"Position max dépassée pour {profile_name}"
    
    print("\n✅ Optimizer constraints OK")


def test_full_pipeline():
    """Test du pipeline complet univers → scoring → optimisation."""
    from portfolio_engine.universe import build_scored_universe
    from portfolio_engine.factors import rescore_universe_by_profile
    from portfolio_engine.optimizer import PortfolioOptimizer, convert_universe_to_assets, PROFILES
    
    # Simuler des données d'entrée
    stocks_data = {
        "stocks": [
            {"ticker": "AAPL", "name": "Apple", "sector": "Technology", "country": "US",
             "perf_1m": 5, "perf_3m": 12, "perf_ytd": 25, "volatility_3y": 28, 
             "max_drawdown_ytd": -15, "market_cap": 3e12},
            {"ticker": "MSFT", "name": "Microsoft", "sector": "Technology", "country": "US",
             "perf_1m": 3, "perf_3m": 8, "perf_ytd": 18, "volatility_3y": 22,
             "max_drawdown_ytd": -12, "market_cap": 2.8e12},
            {"ticker": "NESN", "name": "Nestlé", "sector": "Consumer", "country": "CH",
             "perf_1m": 2, "perf_3m": 5, "perf_ytd": 8, "volatility_3y": 15,
             "max_drawdown_ytd": -8, "market_cap": 300e9},
        ]
    }
    
    # Simuler univers pré-construit (pour éviter de charger les vrais fichiers)
    universe = {
        "equities": [
            {"id": "AAPL", "name": "Apple", "sector": "Technology", "country": "US",
             "perf_1m": 5, "perf_3m": 12, "ytd": 25, "vol_3y": 28, 
             "max_drawdown_ytd": -15, "liquidity": 3e12, "score": 0.8},
            {"id": "MSFT", "name": "Microsoft", "sector": "Technology", "country": "US",
             "perf_1m": 3, "perf_3m": 8, "ytd": 18, "vol_3y": 22,
             "max_drawdown_ytd": -12, "liquidity": 2.8e12, "score": 0.7},
        ] + [
            {"id": f"EQ_{i}", "name": f"Stock_{i}", "sector": ["Finance", "Healthcare", "Consumer"][i%3],
             "country": ["US", "EU", "JP"][i%3], "perf_1m": 2, "perf_3m": 5, "ytd": 10,
             "vol_3y": 20+i, "max_drawdown_ytd": -10, "liquidity": 100e9, "score": 0.5-i*0.02}
            for i in range(15)
        ],
        "etfs": [
            {"id": f"ETF_{i}", "name": f"ETF_{i}", "sector": "Diversified", "country": "Global",
             "ytd": 8, "vol_3y": 12+i, "liquidity": 50e9, "score": 0.6-i*0.03}
            for i in range(10)
        ],
        "bonds": [
            {"id": f"BOND_{i}", "name": f"Bond_{i}", "sector": "Bonds", "country": "Global",
             "ytd": 3, "vol_3y": 4+i*0.5, "liquidity": 20e9, "score": 0.3-i*0.02}
            for i in range(8)
        ],
        "crypto": [
            {"id": "BTC", "name": "Bitcoin", "sector": "Crypto", "country": "Global",
             "perf_7d": 5, "perf_24h": 2, "ytd": 40, "vol30": 60, "score": 1.0},
            {"id": "ETH", "name": "Ethereum", "sector": "Crypto", "country": "Global",
             "perf_7d": 8, "perf_24h": 3, "ytd": 50, "vol30": 70, "score": 0.9},
        ],
    }
    
    optimizer = PortfolioOptimizer()
    results = {}
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        # Rescorer pour ce profil
        scored_universe = rescore_universe_by_profile(universe, profile)
        assets = convert_universe_to_assets(scored_universe)
        
        # Optimiser
        allocation, diag = optimizer.build_portfolio(assets, profile)
        results[profile] = {"allocation": allocation, "diagnostics": diag}
        
        print(f"\n{profile}: {len(allocation)} actifs, vol={diag['portfolio_vol']}%")
        print(f"  Top 3: {list(allocation.items())[:3]}")
    
    # Vérifications
    assert len(results) == 3
    for profile, data in results.items():
        assert 10 <= len(data["allocation"]) <= 18
        assert abs(sum(data["allocation"].values()) - 100) < 0.1
    
    print("\n✅ Full pipeline OK")


def run_all_tests():
    """Exécute tous les tests."""
    print("=" * 60)
    print("TESTS PORTFOLIO ENGINE")
    print("=" * 60)
    
    test_import_modules()
    test_factor_scorer()
    test_optimizer_constraints()
    test_full_pipeline()
    
    print("\n" + "=" * 60)
    print("✅ TOUS LES TESTS PASSENT")
    print("=" * 60)


if __name__ == "__main__":
    run_all_tests()
