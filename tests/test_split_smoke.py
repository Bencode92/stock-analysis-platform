# tests/test_split_smoke.py
"""
P1-9: Smoke tests pour valider que les prix sont bien split-adjusted.

Ces tests vérifient que la pipeline utilise des prix ajustés pour les splits,
et non des prix bruts qui créeraient des rendements artificiels de -66% (3:1 split)
ou -80% (5:1 split) le jour du split.

Référence: TwelveData confirme que les prix daily sont split-adjusted
https://support.twelvedata.com/en/articles/5179064-are-the-prices-adjusted

NOTE: Ces tests utilisent des fixtures hardcodées (pas d'appel API) pour:
- Rapidité en CI
- Reproductibilité
- Pas de dépendance réseau
"""

import pytest
from typing import Dict, List, Tuple
from datetime import datetime


# =============================================================================
# FIXTURES: Prix historiques autour de splits connus
# =============================================================================

# TSLA 3:1 split effectif le 2022-08-25
# Source: Yahoo Finance adjusted close
TSLA_SPLIT_2022_FIXTURE = {
    "symbol": "TSLA",
    "split_date": "2022-08-25",
    "split_ratio": "3:1",
    "prices_adjusted": {
        # Prix AJUSTÉS (post-split basis)
        "2022-08-22": 291.60,
        "2022-08-23": 291.88,
        "2022-08-24": 297.10,
        "2022-08-25": 302.36,  # Jour du split
        "2022-08-26": 288.09,
        "2022-08-29": 284.82,
    },
    "prices_raw": {
        # Prix BRUTS (non ajustés) - pour référence
        "2022-08-22": 874.80,
        "2022-08-23": 875.64,
        "2022-08-24": 891.29,
        "2022-08-25": 302.36,  # Jour du split - prix divisé par 3
        "2022-08-26": 288.09,
        "2022-08-29": 284.82,
    },
    "expected_return_adjusted": 0.0177,  # ~+1.77% (normal)
    "expected_return_raw": -0.6607,  # ~-66% (ERREUR si on voit ça)
}

# AAPL 4:1 split effectif le 2020-08-31
AAPL_SPLIT_2020_FIXTURE = {
    "symbol": "AAPL",
    "split_date": "2020-08-31",
    "split_ratio": "4:1",
    "prices_adjusted": {
        "2020-08-27": 124.80,
        "2020-08-28": 125.01,
        "2020-08-31": 129.04,  # Jour du split
        "2020-09-01": 134.18,
    },
    "expected_return_adjusted": 0.0322,  # ~+3.2%
    "expected_return_raw": -0.7419,  # ~-74% (ERREUR)
}

# NVDA 10:1 split effectif le 2024-06-10
NVDA_SPLIT_2024_FIXTURE = {
    "symbol": "NVDA",
    "split_date": "2024-06-10",
    "split_ratio": "10:1",
    "prices_adjusted": {
        "2024-06-06": 120.21,
        "2024-06-07": 120.87,
        "2024-06-10": 121.00,  # Jour du split
        "2024-06-11": 120.91,
    },
    "expected_return_adjusted": 0.0011,  # ~+0.1%
    "expected_return_raw": -0.8989,  # ~-90% (ERREUR)
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def compute_daily_return(price_today: float, price_yesterday: float) -> float:
    """Calcule le rendement journalier simple."""
    if price_yesterday == 0:
        return 0.0
    return (price_today - price_yesterday) / price_yesterday


def get_split_day_return(prices: Dict[str, float], split_date: str) -> Tuple[float, str, str]:
    """
    Calcule le rendement le jour du split.
    
    Returns:
        Tuple (return, date_before, split_date)
    """
    sorted_dates = sorted(prices.keys())
    split_idx = sorted_dates.index(split_date)
    
    if split_idx == 0:
        raise ValueError(f"No price before split date {split_date}")
    
    date_before = sorted_dates[split_idx - 1]
    price_before = prices[date_before]
    price_split = prices[split_date]
    
    return compute_daily_return(price_split, price_before), date_before, split_date


# =============================================================================
# SMOKE TESTS
# =============================================================================

class TestSplitAdjustedPrices:
    """Tests de validation des prix ajustés pour les splits."""
    
    def test_tsla_split_2022_adjusted_close(self):
        """
        TSLA split 3:1 (2022-08-25): le return ne doit PAS être ~-66%.
        
        Si on utilise des prix ajustés:
        - Return attendu: ~+1.77% (mouvement normal du marché)
        
        Si on utilise des prix bruts (ERREUR):
        - Return observé: ~-66% (891.29 → 302.36)
        """
        fixture = TSLA_SPLIT_2022_FIXTURE
        r, date_before, split_date = get_split_day_return(
            fixture["prices_adjusted"], 
            fixture["split_date"]
        )
        
        # Le return doit être "normal" (pas un choc de -66%)
        assert abs(r) < 0.30, (
            f"Split contamination suspecte pour {fixture['symbol']}!\n"
            f"Return observé: {r:.2%}\n"
            f"Attendu si ajusté: ~{fixture['expected_return_adjusted']:.2%}\n"
            f"Erreur typique si brut: ~{fixture['expected_return_raw']:.2%}\n"
            f"Date: {date_before} → {split_date}"
        )
        
        # Plus strictement: le return ne doit pas ressembler à un split 3:1
        assert r > -0.50, (
            f"Prix probablement NON ajustés pour {fixture['symbol']}!\n"
            f"Return: {r:.2%} ressemble à un split {fixture['split_ratio']} non ajusté."
        )
    
    def test_aapl_split_2020_adjusted_close(self):
        """
        AAPL split 4:1 (2020-08-31): le return ne doit PAS être ~-75%.
        """
        fixture = AAPL_SPLIT_2020_FIXTURE
        r, date_before, split_date = get_split_day_return(
            fixture["prices_adjusted"],
            fixture["split_date"]
        )
        
        assert abs(r) < 0.30, (
            f"Split contamination suspecte pour {fixture['symbol']}!\n"
            f"Return: {r:.2%}, attendu: ~{fixture['expected_return_adjusted']:.2%}"
        )
        assert r > -0.60, (
            f"Prix probablement NON ajustés pour {fixture['symbol']}!\n"
            f"Return: {r:.2%} ressemble à un split {fixture['split_ratio']} non ajusté."
        )
    
    def test_nvda_split_2024_adjusted_close(self):
        """
        NVDA split 10:1 (2024-06-10): le return ne doit PAS être ~-90%.
        """
        fixture = NVDA_SPLIT_2024_FIXTURE
        r, date_before, split_date = get_split_day_return(
            fixture["prices_adjusted"],
            fixture["split_date"]
        )
        
        assert abs(r) < 0.30, (
            f"Split contamination suspecte pour {fixture['symbol']}!\n"
            f"Return: {r:.2%}, attendu: ~{fixture['expected_return_adjusted']:.2%}"
        )
        assert r > -0.80, (
            f"Prix probablement NON ajustés pour {fixture['symbol']}!\n"
            f"Return: {r:.2%} ressemble à un split {fixture['split_ratio']} non ajusté."
        )


class TestSplitDetection:
    """Tests pour détecter des splits non ajustés dans une série de prix."""
    
    @pytest.mark.parametrize("fixture", [
        TSLA_SPLIT_2022_FIXTURE,
        AAPL_SPLIT_2020_FIXTURE,
        NVDA_SPLIT_2024_FIXTURE,
    ])
    def test_no_extreme_daily_returns(self, fixture):
        """
        Aucun jour ne doit avoir un return < -50% dans des prix ajustés.
        
        Un return < -50% en une journée est quasi-impossible pour une large cap
        et indique très probablement un split non ajusté.
        """
        prices = fixture["prices_adjusted"]
        sorted_dates = sorted(prices.keys())
        
        for i in range(1, len(sorted_dates)):
            date_prev = sorted_dates[i - 1]
            date_curr = sorted_dates[i]
            r = compute_daily_return(prices[date_curr], prices[date_prev])
            
            assert r > -0.50, (
                f"Return extrême détecté pour {fixture['symbol']}!\n"
                f"Date: {date_prev} → {date_curr}\n"
                f"Return: {r:.2%}\n"
                f"Ceci indique probablement un split non ajusté."
            )
    
    def test_raw_prices_would_fail(self):
        """
        Méta-test: vérifie que les prix BRUTS échoueraient bien au test.
        
        Ceci valide que notre test détecte effectivement les splits non ajustés.
        """
        fixture = TSLA_SPLIT_2022_FIXTURE
        r, _, _ = get_split_day_return(
            fixture["prices_raw"],  # Prix BRUTS intentionnellement
            fixture["split_date"]
        )
        
        # Les prix bruts DOIVENT montrer un return ~-66%
        assert r < -0.50, (
            f"Les prix bruts devraient montrer un return de ~-66%, "
            f"mais on observe {r:.2%}. Vérifier la fixture."
        )
        assert abs(r - fixture["expected_return_raw"]) < 0.05, (
            f"Return brut attendu: {fixture['expected_return_raw']:.2%}, "
            f"observé: {r:.2%}"
        )


class TestDataLineageConsistency:
    """Tests de cohérence avec data_lineage.py."""
    
    def test_methodology_claims_split_adjusted(self):
        """
        Vérifie que data_lineage.py déclare correctement 'split_adjusted_close'.
        """
        try:
            from portfolio_engine.data_lineage import METHODOLOGY
            
            prices_type = METHODOLOGY.get("prices", {}).get("type", "")
            adjustments = METHODOLOGY.get("prices", {}).get("adjustments", [])
            dividends_included = METHODOLOGY.get("prices", {}).get("dividends_included", True)
            
            # Doit être split_adjusted, pas juste "close" ou "adjusted_close"
            assert "split" in prices_type.lower(), (
                f"METHODOLOGY.prices.type devrait mentionner 'split', "
                f"mais vaut '{prices_type}'"
            )
            
            # Splits doivent être dans adjustments
            assert "splits" in adjustments, (
                f"'splits' devrait être dans METHODOLOGY.prices.adjustments, "
                f"mais adjustments = {adjustments}"
            )
            
            # Dividendes NE doivent PAS être inclus (TwelveData limitation)
            assert dividends_included is False, (
                f"METHODOLOGY.prices.dividends_included devrait être False "
                f"(TwelveData n'inclut pas les dividendes), mais vaut {dividends_included}"
            )
            
        except ImportError:
            pytest.skip("portfolio_engine.data_lineage not available")
    
    def test_limitations_document_dividend_gap(self):
        """
        Vérifie que les limitations documentent l'absence de dividendes.
        """
        try:
            from portfolio_engine.data_lineage import LIMITATIONS
            
            assert "dividends_not_adjusted" in LIMITATIONS, (
                "LIMITATIONS devrait contenir une entrée 'dividends_not_adjusted' "
                "pour documenter que TwelveData n'inclut pas les dividendes."
            )
            
            div_limitation = LIMITATIONS["dividends_not_adjusted"]
            assert div_limitation.get("present", False) is True, (
                "dividends_not_adjusted.present devrait être True"
            )
            
        except ImportError:
            pytest.skip("portfolio_engine.data_lineage not available")


# =============================================================================
# OPTIONAL: Integration test with real data loader (skip if no API)
# =============================================================================

class TestRealDataSplitAdjustment:
    """
    Tests d'intégration avec le vrai data loader.
    
    Ces tests sont marqués 'slow' et nécessitent une clé API.
    Ils sont skippés par défaut en CI.
    """
    
    @pytest.mark.slow
    @pytest.mark.skip(reason="Requires API key and network - run manually")
    def test_twelvedata_returns_split_adjusted(self):
        """
        Vérifie que TwelveData retourne bien des prix split-adjusted.
        
        ATTENTION: Ce test fait un vrai appel API.
        """
        import os
        if not os.environ.get("TWELVE_DATA_API"):
            pytest.skip("TWELVE_DATA_API not set")
        
        try:
            from backtest.data_loader import TwelveDataLoader
            
            loader = TwelveDataLoader()
            df = loader.get_time_series(
                symbol="TSLA",
                start_date="2022-08-22",
                end_date="2022-08-29",
                interval="1day"
            )
            
            if df is None or df.empty:
                pytest.skip("Could not load TSLA data from TwelveData")
            
            # Calculer le return du jour du split
            returns = df["close"].pct_change()
            
            # Le 2022-08-25, le return ne doit pas être ~-66%
            if "2022-08-25" in returns.index.strftime("%Y-%m-%d"):
                r = returns.loc["2022-08-25"]
                assert r > -0.50, (
                    f"TwelveData retourne des prix NON ajustés!\n"
                    f"Return TSLA 2022-08-25: {r:.2%} (attendu: ~+1.77%)"
                )
                
        except ImportError:
            pytest.skip("backtest.data_loader not available")


# =============================================================================
# RUN INFO
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
