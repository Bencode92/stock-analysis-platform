# Portfolio Engine 🧮

Moteur quantitatif de construction de portefeuilles.

## Architecture

```
portfolio_engine/
├── __init__.py           # Exports publics
├── universe.py           # Construction univers d'actifs scorés
├── factors.py            # Scoring multi-facteur configurable
├── optimizer.py          # Optimisation mean-variance sous contraintes
└── llm_commentary.py     # Génération commentaires LLM (prompt compact)

compliance/
├── __init__.py           # Exports compliance
├── amf.py                # Blocs disclaimers AMF
└── sanitizer.py          # Nettoyage langage marketing
```

## Philosophie

> **Python décide les poids (déterministe)**
> **LLM = voix off (justifications uniquement)**

Le moteur produit des portefeuilles reproductibles : mêmes données → mêmes poids.

## Utilisation

### Pipeline complet

```python
from portfolio_engine import (
    load_and_build_universe,
    rescore_universe_by_profile,
    PortfolioOptimizer,
    convert_universe_to_assets,
    PROFILES,
    build_commentary_prompt,
    generate_fallback_commentary,
    merge_commentary_into_portfolios,
)
from compliance import sanitize_portfolio_output, generate_compliance_block

# 1. Charger l'univers
universe = load_and_build_universe(
    stocks_paths=["data/stocks_us.json", "data/stocks_europe.json"],
    etf_csv="data/combined_etfs.csv",
    crypto_csv="data/filtered/Crypto_filtered_volatility.csv"
)

# 2. Optimiser pour chaque profil (SANS LLM)
optimizer = PortfolioOptimizer()
portfolios = {}

for profile in ["Agressif", "Modéré", "Stable"]:
    scored = rescore_universe_by_profile(universe, profile)
    assets = convert_universe_to_assets(scored)
    allocation, diagnostics = optimizer.build_portfolio(assets, profile)
    portfolios[profile] = {"allocation": allocation, "diagnostics": diagnostics}

# 3. Générer commentaires (avec LLM ou fallback)
commentary = generate_fallback_commentary(portfolios, assets)
portfolios = merge_commentary_into_portfolios(portfolios, commentary)

# 4. Sanitiser et ajouter compliance
for profile in portfolios:
    portfolios[profile] = sanitize_portfolio_output(portfolios[profile])
    portfolios[profile]["compliance"] = generate_compliance_block(
        profile=profile,
        vol_estimate=portfolios[profile]["diagnostics"]["portfolio_vol"],
        crypto_exposure=sum(
            w for aid, w in portfolios[profile]["allocation"].items() 
            if "CRYPTO" in aid or "BTC" in aid or "ETH" in aid
        )
    )
```

### Avec LLM (OpenAI)

```python
from openai import OpenAI
from portfolio_engine import generate_commentary_sync

client = OpenAI()
commentary = generate_commentary_sync(
    portfolios=portfolios,
    assets=assets,
    brief_data={"macro": ["Fed hawkish", "Inflation stable"]},
    openai_client=client,
    model="gpt-4o-mini"
)
```

## Modules

### `universe.py`

Construction de l'univers d'actifs avec scoring initial.

| Fonction | Description |
|----------|-------------|
| `load_and_build_universe()` | Chargement complet depuis fichiers |
| `build_scored_universe()` | Construction avec données préchargées |
| `compute_scores()` | Scoring quantitatif par type d'actif |
| `filter_equities/etfs/crypto()` | Filtres vol, drawdown, sur-extension |

### `factors.py`

Scoring multi-facteur adapté au profil.

| Facteur | Description | Agressif | Modéré | Stable |
|---------|-------------|----------|--------|--------|
| momentum | Perf 1m/3m/YTD | 40% | 30% | 20% |
| low_vol | Inverse volatilité | 15% | 25% | 35% |
| quality | Proxy via drawdown | 15% | 20% | 25% |
| liquidity | Log(market_cap) | 15% | 15% | 10% |
| mean_reversion | Pénalité sur-extension | 15% | 10% | 10% |

### `optimizer.py`

Optimisation mean-variance avec contraintes.

| Contrainte | Agressif | Modéré | Stable |
|------------|----------|--------|--------|
| Vol cible (indicatif) | 18% | 12% | 8% |
| Crypto max | 10% | 5% | 0% |
| Bonds min | 5% | 15% | 40% |
| Max par position | 15% | 15% | 15% |
| Max par secteur | 30% | 30% | 30% |
| Nb actifs | 10-18 | 10-18 | 10-18 |

### `llm_commentary.py`

Génération des commentaires via LLM.

**Prompt réduit : ~300 mots (vs ~2000 avant)**

| Fonction | Description |
|----------|-------------|
| `build_commentary_prompt()` | Construit le prompt compact |
| `generate_commentary_sync()` | Appel API OpenAI synchrone |
| `generate_fallback_commentary()` | Commentaires sans LLM |
| `merge_commentary_into_portfolios()` | Fusionne résultats |

### `compliance/amf.py`

Blocs disclaimers et avertissements AMF.

| Export | Description |
|--------|-------------|
| `AMF_DISCLAIMER` | Disclaimer standard |
| `AMF_DISCLAIMER_FULL` | Version complète |
| `generate_compliance_block()` | Génère bloc adapté au profil |
| `validate_compliance_text()` | Vérifie conformité |

### `compliance/sanitizer.py`

Nettoyage du langage marketing.

| Fonction | Description |
|----------|-------------|
| `sanitize_marketing_language()` | Nettoie termes interdits |
| `check_forbidden_terms()` | Détecte termes problématiques |
| `sanitize_portfolio_output()` | Nettoie tout le portefeuille |

**Termes interdits :** garanti, meilleur, sans risque, opportunité unique, etc.

## Tests

```bash
# Exécuter les tests
python tests/test_portfolio_engine.py

# Ou avec pytest
python -m pytest tests/test_portfolio_engine.py -v
```

## Comparaison avant/après

| Aspect | Avant (v1) | Après (v2) |
|--------|------------|------------|
| Décision poids | LLM | Python (déterministe) |
| Prompt LLM | ~8000 tokens | ~1500 tokens |
| Reproductibilité | ❌ Variable | ✅ Identique |
| Contraintes | Post-validation | Par construction |
| Fichier principal | 4000+ lignes | ~300 lignes |

## Prochaines étapes

- [x] `universe.py` - Construction univers
- [x] `factors.py` - Scoring multi-facteur
- [x] `optimizer.py` - Optimisation contraintes
- [x] `llm_commentary.py` - Prompt compact
- [x] `compliance/` - AMF + sanitizer
- [ ] Refactorer `generate_portfolios.py` (Phase 5)
- [ ] Backtest 90j pour validation (Phase 6)
