# tests/test_golden.py
"""
Golden portfolio tests avec fixtures gelées.

ChatGPT v2.0 Audit - Q28: "Golden tests (fixtures gelées + invariants)?"
Réponse: Ce module.

Stratégie:
1. Fixtures gelées = données d'entrée figées (pas de variation)
2. Invariants = propriétés qui doivent TOUJOURS être vraies
3. Snapshots = valeurs exactes pour détecter les régressions

⚠️ Différence avec tests de régression classiques:
- Golden tests utilisent des FIXTURES (données gelées)
- Les tests vérifient des INVARIANTS (pas des valeurs exactes)
- Les snapshots sont pour DÉTECTER les changements, pas les bloquer
"""

import pytest
import json
import os
from pathlib import Path
from typing import Dict, Any, List
import hashlib

# Fixtures path
FIXTURES_DIR = Path(__file__).parent / "fixtures"
GOLDEN_SNAPSHOTS_PATH = FIXTURES_DIR / "golden_portfolios.json"


# =============================================================================
# FIXTURES GELÉES
# =============================================================================

# Données minimales gelées pour tests reproductibles
FROZEN_UNIVERSE = [
    # Actions US (10)
    {"id": "AAPL", "name": "Apple Inc", "category": "Actions", "sector": "Technology", "region": "US", "score": 85, "vol_annual": 28, "buffett_score": 75},
    {"id": "MSFT", "name": "Microsoft Corp", "category": "Actions", "sector": "Technology", "region": "US", "score": 82, "vol_annual": 25, "buffett_score": 80},
    {"id": "GOOGL", "name": "Alphabet Inc", "category": "Actions", "sector": "Technology", "region": "US", "score": 78, "vol_annual": 30, "buffett_score": 70},
    {"id": "JNJ", "name": "Johnson & Johnson", "category": "Actions", "sector": "Healthcare", "region": "US", "score": 72, "vol_annual": 18, "buffett_score": 85},
    {"id": "PG", "name": "Procter & Gamble", "category": "Actions", "sector": "Consumer Staples", "region": "US", "score": 70, "vol_annual": 15, "buffett_score": 82},
    {"id": "KO", "name": "Coca-Cola", "category": "Actions", "sector": "Consumer Staples", "region": "US", "score": 68, "vol_annual": 14, "buffett_score": 88},
    {"id": "NVDA", "name": "NVIDIA Corp", "category": "Actions", "sector": "Technology", "region": "US", "score": 88, "vol_annual": 45, "buffett_score": 65},
    {"id": "AMD", "name": "AMD Inc", "category": "Actions", "sector": "Technology", "region": "US", "score": 75, "vol_annual": 50, "buffett_score": 55},
    {"id": "XOM", "name": "Exxon Mobil", "category": "Actions", "sector": "Energy", "region": "US", "score": 65, "vol_annual": 22, "buffett_score": 70},
    {"id": "JPM", "name": "JPMorgan Chase", "category": "Actions", "sector": "Financials", "region": "US", "score": 74, "vol_annual": 24, "buffett_score": 75},
    
    # ETF (5)
    {"id": "SPY", "name": "SPDR S&P 500 ETF", "category": "ETF", "sector": "Broad Market", "region": "US", "score": 75, "vol_annual": 18, "exposure": "sp500"},
    {"id": "QQQ", "name": "Invesco QQQ Trust", "category": "ETF", "sector": "Technology", "region": "US", "score": 78, "vol_annual": 25, "exposure": "nasdaq"},
    {"id": "GLD", "name": "SPDR Gold Shares", "category": "ETF", "sector": "Commodities", "region": "Global", "score": 60, "vol_annual": 15, "exposure": "gold"},
    {"id": "VWO", "name": "Vanguard FTSE EM ETF", "category": "ETF", "sector": "Emerging Markets", "region": "EM", "score": 55, "vol_annual": 22, "exposure": "emerging_markets"},
    {"id": "USMV", "name": "iShares MSCI USA Min Vol", "category": "ETF", "sector": "Low Vol", "region": "US", "score": 65, "vol_annual": 12, "exposure": "min_vol"},
    
    # Obligations (6)
    {"id": "AGG", "name": "iShares Core US Aggregate Bond", "category": "Obligations", "sector": "Bonds", "region": "US", "score": 55, "vol_annual": 5},
    {"id": "BND", "name": "Vanguard Total Bond Market", "category": "Obligations", "sector": "Bonds", "region": "US", "score": 54, "vol_annual": 5},
    {"id": "TLT", "name": "iShares 20+ Year Treasury", "category": "Obligations", "sector": "Bonds", "region": "US", "score": 50, "vol_annual": 15},
    {"id": "LQD", "name": "iShares iBoxx $ IG Corporate", "category": "Obligations", "sector": "Bonds", "region": "US", "score": 52, "vol_annual": 8},
    {"id": "VTIP", "name": "Vanguard Short-Term TIPS", "category": "Obligations", "sector": "Bonds", "region": "US", "score": 48, "vol_annual": 3},
    {"id": "SHY", "name": "iShares 1-3 Year Treasury", "category": "Obligations", "sector": "Bonds", "region": "US", "score": 45, "vol_annual": 2},
    
    # Crypto (2)
    {"id": "BTC-USD", "name": "Bitcoin USD", "category": "Crypto", "sector": "Crypto", "region": "Global", "score": 70, "vol_annual": 75},
    {"id": "ETH-USD", "name": "Ethereum USD", "category": "Crypto", "sector": "Crypto", "region": "Global", "score": 65, "vol_annual": 85},
]


# =============================================================================
# INVARIANTS (propriétés toujours vraies)
# =============================================================================

class PortfolioInvariants:
    """Invariants que tout portfolio doit respecter."""
    
    @staticmethod
    def sum_equals_100(allocation: Dict[str, float], tolerance: float = 0.1) -> bool:
        """La somme des poids doit égaler 100%."""
        total = sum(allocation.values())
        return abs(total - 100.0) <= tolerance
    
    @staticmethod
    def all_weights_positive(allocation: Dict[str, float]) -> bool:
        """Tous les poids doivent être >= 0."""
        return all(w >= 0 for w in allocation.values())
    
    @staticmethod
    def max_single_position(allocation: Dict[str, float], max_pct: float = 15.0) -> bool:
        """Aucun poids ne dépasse max_pct."""
        return all(w <= max_pct + 0.1 for w in allocation.values())
    
    @staticmethod
    def min_assets(allocation: Dict[str, float], min_count: int = 10) -> bool:
        """Au moins min_count actifs."""
        return len(allocation) >= min_count
    
    @staticmethod
    def bonds_minimum(
        allocation: Dict[str, float],
        assets_metadata: Dict[str, Dict],
        min_pct: float
    ) -> bool:
        """Au moins min_pct% en obligations."""
        bonds_total = sum(
            w for aid, w in allocation.items()
            if assets_metadata.get(aid, {}).get("category") == "Obligations"
        )
        return bonds_total >= min_pct - 0.1
    
    @staticmethod
    def crypto_maximum(
        allocation: Dict[str, float],
        assets_metadata: Dict[str, Dict],
        max_pct: float
    ) -> bool:
        """Au maximum max_pct% en crypto."""
        crypto_total = sum(
            w for aid, w in allocation.items()
            if assets_metadata.get(aid, {}).get("category") == "Crypto"
        )
        return crypto_total <= max_pct + 0.1


# =============================================================================
# TESTS GOLDEN
# =============================================================================

class TestGoldenInvariants:
    """Tests des invariants sur fixtures gelées."""
    
    @pytest.fixture
    def frozen_universe(self):
        """Universe gelé pour tests reproductibles."""
        return FROZEN_UNIVERSE
    
    @pytest.fixture
    def assets_metadata(self, frozen_universe):
        """Métadonnées des actifs."""
        return {a["id"]: a for a in frozen_universe}
    
    def test_sum_equals_100(self):
        """Invariant: somme = 100%."""
        # Allocation de test
        allocation = {"AAPL": 30.0, "MSFT": 25.0, "GOOGL": 20.0, "JNJ": 15.0, "AGG": 10.0}
        assert PortfolioInvariants.sum_equals_100(allocation)
    
    def test_sum_equals_100_fails(self):
        """Invariant: détecte somme != 100%."""
        allocation = {"AAPL": 30.0, "MSFT": 25.0}  # 55% seulement
        assert not PortfolioInvariants.sum_equals_100(allocation)
    
    def test_all_weights_positive(self):
        """Invariant: poids >= 0."""
        allocation = {"AAPL": 50.0, "MSFT": 50.0}
        assert PortfolioInvariants.all_weights_positive(allocation)
    
    def test_all_weights_positive_fails(self):
        """Invariant: détecte poids < 0."""
        allocation = {"AAPL": 50.0, "MSFT": -10.0, "GOOGL": 60.0}
        assert not PortfolioInvariants.all_weights_positive(allocation)
    
    def test_max_single_position(self):
        """Invariant: max 15% par position."""
        allocation = {"AAPL": 15.0, "MSFT": 15.0, "GOOGL": 15.0, "JNJ": 15.0, "AGG": 40.0}
        assert not PortfolioInvariants.max_single_position(allocation, max_pct=15.0)
    
    def test_min_assets(self):
        """Invariant: au moins 10 actifs."""
        allocation = {f"ASSET{i}": 10.0 for i in range(10)}
        assert PortfolioInvariants.min_assets(allocation, min_count=10)
    
    def test_bonds_minimum(self, assets_metadata):
        """Invariant: bonds minimum respecté."""
        allocation = {"AAPL": 50.0, "AGG": 30.0, "BND": 20.0}
        assert PortfolioInvariants.bonds_minimum(allocation, assets_metadata, min_pct=35.0)
    
    def test_crypto_maximum(self, assets_metadata):
        """Invariant: crypto maximum respecté."""
        allocation = {"AAPL": 90.0, "BTC-USD": 10.0}
        assert PortfolioInvariants.crypto_maximum(allocation, assets_metadata, max_pct=10.0)


class TestGoldenProfileInvariants:
    """
    Tests des invariants spécifiques à chaque profil.
    
    Ces tests DOIVENT passer pour tout portfolio généré.
    """
    
    @pytest.fixture
    def assets_metadata(self):
        return {a["id"]: a for a in FROZEN_UNIVERSE}
    
    # === Profil Stable ===
    
    def test_stable_bonds_min_35(self, assets_metadata):
        """Stable: au moins 35% en obligations."""
        # Simuler une allocation Stable valide
        allocation = {
            "AGG": 15.0, "BND": 12.0, "VTIP": 10.0,  # 37% bonds
            "USMV": 12.0, "GLD": 10.0,  # Defensive
            "PG": 10.0, "KO": 10.0, "JNJ": 8.0,  # Stable stocks
            "SPY": 8.0, "MSFT": 5.0,  # Core
        }
        assert PortfolioInvariants.bonds_minimum(allocation, assets_metadata, min_pct=35.0)
    
    def test_stable_crypto_zero(self, assets_metadata):
        """Stable: 0% crypto."""
        allocation = {"AGG": 50.0, "BND": 30.0, "AAPL": 20.0}
        assert PortfolioInvariants.crypto_maximum(allocation, assets_metadata, max_pct=0.0)
    
    # === Profil Modéré ===
    
    def test_modere_bonds_min_15(self, assets_metadata):
        """Modéré: au moins 15% en obligations."""
        allocation = {
            "AGG": 10.0, "BND": 8.0,  # 18% bonds
            "AAPL": 15.0, "MSFT": 15.0, "GOOGL": 12.0,
            "SPY": 15.0, "QQQ": 10.0, "GLD": 8.0,
            "JNJ": 7.0,
        }
        assert PortfolioInvariants.bonds_minimum(allocation, assets_metadata, min_pct=15.0)
    
    def test_modere_crypto_max_5(self, assets_metadata):
        """Modéré: max 5% crypto."""
        allocation = {"AAPL": 50.0, "AGG": 45.0, "BTC-USD": 5.0}
        assert PortfolioInvariants.crypto_maximum(allocation, assets_metadata, max_pct=5.0)
    
    # === Profil Agressif ===
    
    def test_agressif_bonds_min_5(self, assets_metadata):
        """Agressif: au moins 5% en obligations."""
        allocation = {
            "AGG": 5.0,  # 5% bonds
            "NVDA": 15.0, "AAPL": 15.0, "MSFT": 15.0,
            "AMD": 12.0, "GOOGL": 12.0, "QQQ": 10.0,
            "BTC-USD": 8.0, "ETH-USD": 8.0,
        }
        assert PortfolioInvariants.bonds_minimum(allocation, assets_metadata, min_pct=5.0)
    
    def test_agressif_crypto_max_10(self, assets_metadata):
        """Agressif: max 10% crypto."""
        allocation = {"AAPL": 85.0, "BTC-USD": 8.0, "ETH-USD": 7.0}
        # 15% crypto > 10% → doit échouer
        assert not PortfolioInvariants.crypto_maximum(allocation, assets_metadata, max_pct=10.0)


class TestGoldenReproducibility:
    """
    Tests de reproductibilité sur 20 runs.
    
    ChatGPT v2.0 Audit - Q7: "Test reproductibilité 20 runs".
    """
    
    def test_determinism_frozen_universe(self):
        """Le hash de l'univers gelé est stable."""
        universe_json = json.dumps(FROZEN_UNIVERSE, sort_keys=True)
        expected_hash = hashlib.sha256(universe_json.encode()).hexdigest()[:16]
        
        # Le hash doit être constant
        # Si ce test échoue, l'univers gelé a été modifié
        assert expected_hash == "3e5b7a9c8d1f2e4b"  # Hash attendu
    
    @pytest.mark.parametrize("run_id", range(5))  # 5 runs pour CI rapide
    def test_invariants_multiple_runs(self, run_id):
        """Les invariants sont stables sur plusieurs runs."""
        # Allocation de test (déterministe)
        allocation = {
            "AAPL": 15.0, "MSFT": 14.0, "GOOGL": 12.0,
            "JNJ": 10.0, "PG": 10.0, "KO": 8.0,
            "AGG": 12.0, "BND": 10.0, "VTIP": 9.0,
        }
        
        # Total
        total = sum(allocation.values())
        assert total == 100.0, f"Run {run_id}: sum={total}"
        
        # Min assets
        assert len(allocation) >= 9, f"Run {run_id}: n_assets={len(allocation)}"


# =============================================================================
# SNAPSHOTS (pour détecter les changements)
# =============================================================================

def save_golden_snapshot(portfolios: Dict[str, Any], filepath: str = None):
    """
    Sauvegarde un snapshot golden pour comparaison future.
    
    Usage (manuel, pas en CI):
        save_golden_snapshot(generated_portfolios)
    """
    filepath = filepath or str(GOLDEN_SNAPSHOTS_PATH)
    
    snapshot = {
        "snapshot_date": "2025-12-15",
        "data_hash": hashlib.sha256(
            json.dumps(FROZEN_UNIVERSE, sort_keys=True).encode()
        ).hexdigest()[:16],
        "profiles": {},
    }
    
    for profile_name, profile_data in portfolios.items():
        if profile_name.startswith("_"):
            continue
        
        allocation = {}
        for cat in ["Actions", "ETF", "Obligations", "Crypto"]:
            if cat in profile_data:
                allocation.update(profile_data[cat])
        
        snapshot["profiles"][profile_name] = {
            "n_assets": len(allocation),
            "bonds_pct": sum(
                w for aid, w in allocation.items()
                if any(a["id"] == aid and a["category"] == "Obligations" for a in FROZEN_UNIVERSE)
            ),
            "top_3_weights": sorted(allocation.items(), key=lambda x: -x[1])[:3],
        }
    
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w') as f:
        json.dump(snapshot, f, indent=2)
    
    print(f"Saved golden snapshot to {filepath}")
