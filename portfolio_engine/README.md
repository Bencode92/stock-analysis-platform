# Portfolio Engine 🧮

Moteur quantitatif de construction de portefeuilles.

## Architecture

```
portfolio_engine/
├── __init__.py       # Exports publics
├── universe.py       # Construction univers d'actifs scorés
├── factors.py        # Scoring multi-facteur configurable
└── optimizer.py      # Optimisation mean-variance sous contraintes
```

## Philosophie

> **Python décide les poids (déterministe)**
> **LLM = voix off (justifications uniquement)**

Le moteur produit des portefeuilles reproductibles : mêmes données → mêmes poids.

## Utilisation

```python
from portfolio_engine import (
    load_and_build_universe,
    rescore_universe_by_profile,
    PortfolioOptimizer,
    convert_universe_to_assets,
    PROFILES,
)

# 1. Charger l'univers
universe = load_and_build_universe(
    stocks_paths=["data/stocks_us.json", "data/stocks_europe.json"],
    etf_csv="data/combined_etfs.csv",
    crypto_csv="data/filtered/Crypto_filtered_volatility.csv"
)

# 2. Optimiser pour chaque profil
optimizer = PortfolioOptimizer()

for profile in ["Agressif", "Modéré", "Stable"]:
    # Rescorer selon le profil
    scored = rescore_universe_by_profile(universe, profile)
    assets = convert_universe_to_assets(scored)
    
    # Obtenir allocation optimale
    allocation, diagnostics = optimizer.build_portfolio(assets, profile)
    
    print(f"{profile}: {len(allocation)} actifs, vol={diagnostics['portfolio_vol']}%")
```

## Modules

### `universe.py`

Construction de l'univers d'actifs avec scoring initial :

- `load_and_build_universe()` : Chargement complet depuis fichiers
- `build_scored_universe()` : Construction avec données préchargées
- `compute_scores()` : Scoring quantitatif par type d'actif
- Filtres : vol, drawdown, sur-extension

### `factors.py`

Scoring multi-facteur adapté au profil :

| Facteur | Description | Agressif | Modéré | Stable |
|---------|-------------|----------|--------|--------|
| momentum | Perf 1m/3m/YTD | 40% | 30% | 20% |
| low_vol | Inverse volatilité | 15% | 25% | 35% |
| quality | Proxy via drawdown | 15% | 20% | 25% |
| liquidity | Log(market_cap) | 15% | 15% | 10% |
| mean_reversion | Pénalité sur-extension | 15% | 10% | 10% |

### `optimizer.py`

Optimisation mean-variance avec contraintes :

| Contrainte | Agressif | Modéré | Stable |
|------------|----------|--------|--------|
| Vol cible (indicatif) | 18% | 12% | 8% |
| Crypto max | 10% | 5% | 0% |
| Bonds min | 5% | 15% | 40% |
| Max par position | 15% | 15% | 15% |
| Max par secteur | 30% | 30% | 30% |
| Nb actifs | 10-18 | 10-18 | 10-18 |

## Tests

```bash
# Exécuter les tests
python tests/test_portfolio_engine.py

# Ou avec pytest
python -m pytest tests/test_portfolio_engine.py -v
```

## Intégration avec le pipeline existant

Le module remplace la partie "décision LLM" de `generate_portfolios.py`.
Le LLM continue de générer :
- Justifications par ligne
- Commentaire global
- Bloc Compliance AMF

Mais il ne touche plus aux poids.

## Prochaines étapes

- [ ] `llm_commentary.py` : Prompt compact pour justifications
- [ ] `compliance/amf.py` : Extraction bloc compliance
- [ ] Backtest 90j pour validation
