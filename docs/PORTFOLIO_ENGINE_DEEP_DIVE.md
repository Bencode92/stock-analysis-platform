# Analyse approfondie — Écosystème portfolio_engine, data/ et config/

**Date :** 2026-05-22
**Doc compagnon de :** [`GENERATE_PORTFOLIO_ANALYSIS_A_TO_Z.md`](GENERATE_PORTFOLIO_ANALYSIS_A_TO_Z.md)
**Couvre :** les 50 modules de `portfolio_engine/`, la structure `data/`, les fichiers `config/`, et `schemas/`

---

## Vue d'ensemble du codebase

```
~48 K lignes de Python en production
  ├─ generate_portfolios_v4.py        7 236 L  (orchestrateur)
  ├─ portfolio_engine/  (50 modules)  ~41 K L
  ├─ config/            (6 fichiers)
  ├─ data/              (50+ JSON/CSV)
  └─ schemas/           (1 schéma JSON)
```

---

## A. `portfolio_engine/` — Les 50 modules par rôle

### A.1 — Cœur de l'algorithme (4 modules, ~13 200 L)

| Module | L | Rôle | Fonctions clés |
|---|---|---|---|
| **optimizer.py** | 5 891 | Markowitz optimizer v6.32.2 — shrinkage covariance, SLSQP + fallback heuristique | `PortfolioOptimizer.build_portfolio()`, `_enforce_crypto_cap()`, `_adjust_for_vol_target()`, `diag_shrink_to_target()` |
| **preset_meta.py** | 3 072 | Source unique sélection actions : PROFILE_POLICY, presets, scoring, dedup | `select_equities_for_profile()`, `apply_hard_filters_with_custom()`, `check_preset_rules()` |
| **factors.py** | 2 649 | Scoring multi-actifs v4.1 (equity/ETF/bond/crypto unifié) | `FactorScorer.score_assets()`, `compute_factor_momentum()`, `_rank_by_class()` |
| **universe.py** | 1 603 | Construction et validation de l'univers | `build_scored_universe()`, `sector_balanced_selection()` |

### A.2 — Allocation & contraintes (5 modules, ~4 600 L)

| Module | L | Rôle |
|---|---|---|
| **allocation_rules_engine.py** | 1 596 | Méta-règles : thematic caps, hedges obligatoires, market conditions |
| **constraints.py** | 470 | Hiérarchie HARD/SOFT/RELAXABLE des contraintes |
| **constraint_report.py** | 1 533 | Vérification post-optim + génère rapport JSON |
| **bucket_penalty.py** | 434 | Pénalités si violations de risk buckets |
| **risk_buckets.py** | 566 | Classification CORE/DEFENSIVE/SATELLITE/LEVERAGED/ALTERNATIVE/UNKNOWN |

### A.3 — Sélecteurs preset par classe d'actif (5 modules, ~4 800 L)

| Module | L | Presets | Profils |
|---|---|---|---|
| **preset_etf.py** | 2 682 | 20+ presets : croissance_tech, emergents, rendement_etf, min_vol_global, sector_healthcare, sector_energy, qualite_value, multi_factor, defensif_oblig, cash_ultra_short, high_yield, tips_inflation | Agressif/Modéré/Stable |
| **preset_bond.py** | 724 | cash_ultra_short, defensif_oblig, high_yield + RATING_TO_SCORE (AAA→95, CCC→15) | Modéré/Stable |
| **preset_crypto.py** | 701 | Core/satellite split | Agressif/Modéré (Stable=0) |
| **etf_exposure.py** | 2 926 | Décomposition holdings ETF pour calcul exposures (40K+ ETFs mappés) | Tous |
| **ter_loader.py** | 301 | Charge Total Expense Ratio + confidence scoring | Tous ETF |

### A.4 — Market Intelligence & RADAR (3 modules, ~2 900 L)

| Module | L | Rôle |
|---|---|---|
| **market_intelligence.py** | 1 040 | Claude Opus en mode "CIO" → renvoie deltas tactiques (conviction 1-5) |
| **market_sector_radar.py** | 1 306 | Computes sector/region tilts depuis perfs YTD/3m/6m/52w/daily |
| **market_context.py** | 547 | Aggrégateur : régime, tilts, risques, sector_risk_profile |
| **update_macro_context.py** | 913 | Met à jour market_context.json hebdo (RADAR + macros) |

### A.5 — Risk & Stress (5 modules, ~5 400 L)

| Module | L | Rôle |
|---|---|---|
| **risk_analysis.py** | 2 161 | VaR, CVaR, tail risk, scenarios — produit enrichissement JSON |
| **stress_testing.py** | 1 395 | Scénarios market crash / stagflation / etc. v2.0 |
| **stress_test.py** | 589 | Stress checks rapides (legacy fallback) |
| **correlation_diagnostics.py** | 204 | Validation matrice covariance (condition number, eigenvalues) |
| **correlation_map.py** | 338 | Suivi corrélations peer pour analyse diversification |

### A.6 — Sélection audit & explainability (3 modules, ~2 800 L)

| Module | L | Output |
|---|---|---|
| **selection_audit.py** | 1 147 | `data/selection_audit.json` (preset_rankings, category_rankings, rejection_reasons, anomaly_checks) |
| **selection_explainer.py** | 1 202 | `data/selection_explained.json` (rationale par titre + RADAR match) |
| **asset_rationale_generator.py** | 488 | Justifications LLM par actif (Claude Sonnet → fallback OpenAI) |

### A.7 — Données & qualité (5 modules, ~2 100 L)

| Module | L | Rôle |
|---|---|---|
| **data_quality.py** | 667 | Sanity checks : vol aberrantes (376% → 3.76% bug), missing fields, outliers |
| **quality_gates.py** | 671 | Filtres durs sur complétude données + type instrument |
| **data_lineage.py** | 262 | Tracking provenance et fraîcheur des données |
| **deterministic.py** | 509 | Tie-breaker stable pour reproductibilité runs |
| **instrument_classifier.py** | 444 | Classification asset_class/sub_type (equity, ETF, bond, crypto, leveraged...) |

### A.8 — Compliance & logging (3 modules, ~1 700 L)

| Module | L | Rôle |
|---|---|---|
| **llm_commentary.py** | 679 | Commentary portfolio + sanitizer mots interdits + 4 phrases min + 2 mentions risque |
| **structured_logging.py** | 442 | Audit trail LLM (conformité AMF) |
| **audit_collector.py** | 647 | Collecte audit centralisée par phase pipeline |

### A.9 — Données prix & TER (3 modules, ~1 200 L)

| Module | L | Rôle |
|---|---|---|
| **price_loader.py** | 246 | Fetch prix daily via Twelve Data API |
| **historical_data.py** | 669 | Historique 5Y pour VaR (1260 jours) |
| **ticker_resolver.py** | 241 | Normalisation tickers ISIN ↔ ticker, ADR ↔ local |

### A.10 — Backtest & trading (4 modules, ~1 700 L)

| Module | L | Rôle |
|---|---|---|
| **backtest_modes.py** | 736 | Modes ILLUSTRATIVE (no Sharpe <1Y, AMF disclaimer) vs RESEARCH (Monte Carlo, bootstrap) |
| **trading_calendar.py** | 386 | Calendrier marchés (jours ouvrés, fériés, fréquence rebalance) |
| **calendar.py** | 74 | Utilities dates (month_end, rebalance_dates) |
| **trade_generator.py** | 526 | Génération d'ordres depuis rebalance (avec slippage) |

### A.11 — Benchmarks & expositions (3 modules, ~1 700 L)

| Module | L | Rôle |
|---|---|---|
| **benchmarks.py** | 229 | SPX, EuroStoxx50, EM + calculs drawdown/return |
| **exposures.py** | 756 | Reporting expositions (sector/region/style/factor) |
| **sector_quality.py** | 1 009 | Métriques qualité sector-specific + industry filters |
| **crypto_utils.py** | 373 | Helpers crypto : quote filter, stablecoin detection |

### A.12 — Utilitaires (2 modules, ~960 L)

| Module | L | Rôle |
|---|---|---|
| **manifest.py** | 299 | Run manifest (paramètres, versions, timestamps) pour reproductibilité |
| **etf_scoring_diagnostic.py** | 318 | Diagnostic scoring ETF (flat scores, métriques manquantes) |

### A.13 — Spécialisés (3 modules)

| Module | L | Rôle |
|---|---|---|
| **lombard_ranking.py** | 386 | Classement actions pour collatéral Lombard |
| **dividend_portfolio.py** | 754 | **DEPRECATED** — module standalone initial (intégré dans pipeline principal) |
| **optimizer_test.py** | 1 200+ | Tests unitaires optimizer |

---

## B. Carte des dépendances entre modules

### Flux principal — sélection action

```
preset_meta.py::select_equities_for_profile()
   │
   ├─→ filter_equities_by_profile()  (hard filters)
   │      └─→ apply_hard_filters_with_custom()
   │
   ├─→ assign_preset_to_equity_with_rules()  (preset categorization)
   │      └─→ check_preset_rules()
   │
   ├─→ score_equity_for_profile()  (composite scoring)
   │      └─→ normalize_profile_score()
   │
   ├─→ deduplicate_dual_listings()  (HEN3↔HEN, GOOG↔GOOGL...)
   ├─→ deduplicate_by_corporate_group()  (Capgemini group, Hyundai...)
   ├─→ apply_market_context_tilts()  (RADAR favored/avoided)
   │      └─→ market_sector_radar.py::compute_sector_tilt()
   │
   └─→ sector_balanced_selection()  (top N avec cap secteur)
```

### Flux principal — construction portefeuille

```
generate_portfolios_v4.py::build_portfolios_deterministic()
   │
   ├─→ universe.py::build_scored_universe()
   │      └─→ factors.py::FactorScorer.score_assets()
   │
   ├─→ pour chaque profil :
   │      ├─→ preset_meta.py::select_equities_for_profile()
   │      ├─→ preset_etf.py::select_etfs_for_profile()
   │      ├─→ preset_bond.py::select_bonds_for_profile()
   │      ├─→ preset_crypto.py::select_crypto_for_profile()
   │      │
   │      └─→ optimizer.py::PortfolioOptimizer.build_portfolio()
   │             ├─→ constraints.py::check_constraints()
   │             ├─→ risk_buckets.py::classify_asset()
   │             ├─→ correlation_diagnostics.py::diagnose_covariance_matrix()
   │             └─→ bucket_penalty.py::compute_bucket_penalties()
   │
   ├─→ allocation_rules_engine.py::apply_allocation_rules()
   ├─→ risk_analysis.py::enrich_portfolio_with_risk_analysis()
   ├─→ selection_audit.py::create_selection_audit()
   ├─→ selection_explainer.py::generate_explanations()
   └─→ llm_commentary.py::generate_portfolio_commentary()
```

### Flux Market Intelligence

```
update_macro_context.py (cron hebdo)
   │
   ├─→ market_sector_radar.py::compute_sector_tilt()
   │      Input: {ytd, m3, m6, w52, daily}_num
   │      Output: tilt [-100%, +100%], classification favored/neutral/avoided
   │
   ├─→ market_intelligence.py::get_market_adjustments()
   │      → Claude Opus call
   │      → returns: {thematic_deltas, hedge_deltas, bond_deltas, conviction 1-5}
   │
   └─→ market_context.py::build_market_context()
          → écrit data/market_context.json
          
generate_portfolios_v4.py lit market_context.json en input
```

---

## C. Structure `data/` détaillée

### C.1 — Univers brut (input)

| Fichier | Taille | Source | Refresh | Contenu |
|---|---|---|---|---|
| `stocks_us.json` | 2.9 M | Twelve Data + FMP | Plusieurs/jour via filter-stocks.yml | ~520 équités US avec 80+ champs |
| `stocks_europe.json` | 1.5 M | Idem | Plusieurs/jour | ~280 équités EU/UK |
| `stocks_asia.json` | 1.4 M | Idem | Plusieurs/jour | ~270 équités Asie |
| `all_etfs.csv` | 775 K | Twelve Data | Hebdo | Métadonnées ETF (ticker, AUM, TER, sectors) |
| `combined_etfs.csv` | 2.0 M | Merged | Hebdo | + perfs YTD, vol, yield, top_holdings |
| `all_bonds.csv` | 121 K | Internal | Hebdo | Bonds (ISIN, credit_score, duration, yield) |
| `combined_bonds.csv` | 406 K | Merged | Hebdo | + TER, perfs |
| `Crypto.csv` | 14.6 K | CoinMarketCap | Daily | Crypto (market_cap, vol_30d, sharpe, var_95) |
| `macro_indicators.json` | 3.9 K | Multi-API | Daily | VIX, Brent, gold, US yields, IG spreads, CPI |

### C.2 — Outputs du pipeline (consommés par frontend / API)

| Fichier | Taille | Producteur | Consommateur |
|---|---|---|---|
| `portfolios.json` | ~6 M | generate_portfolios_v4.py | portefeuille.html (frontend) |
| `portfolios_previous.json` | ~6 M | Idem (snapshot précédent) | Diff reporting |
| `portfolios_euus.json` | ~3 M | build_portfolios_euus() | Frontend variant EU/US |
| `lombard_ranking.json` | ~500 K | lombard_ranking.py | Frontend Lombard tab |

### C.3 — Audit & explainability

| Fichier | Taille | Contenu |
|---|---|---|
| `selection_audit.json` | 471 K | `preset_rankings` (top 20/preset) + `category_rankings` + `rejection_reasons` + `anomaly_warnings` + `_meta` |
| `selection_explained.json` | 126 K | `{ticker: {rationale, preset_assignment, score_breakdown, radar_match}}` |
| `selection_debug.json` | 50 K | Trace verbose (step_1_filtered, step_2_relaxed, ...) — debug only |
| `industry_audit.json` | 102 K | Vérification classifications industry |
| `correlation_diagnostics.json` | 46 K | Condition number + eigenvalues de la matrice de cov |

### C.4 — Market Intelligence

| Fichier | Taille | Refresh | Producteur |
|---|---|---|---|
| `market_context.json` | 27 K | 2×/semaine | update_macro_context.py |
| `market_intelligence_audit/*.json` | ~2 M (125 fichiers) | À chaque appel Claude Opus | market_intelligence.py |
| `macro_indicators.json` | 3.9 K | Daily | Workflows update-market-data |

### C.5 — Backtest & risk

| Fichier | Taille | Contenu |
|---|---|---|
| `backtest_results.json` | 32 K | Sharpe, max DD, perf 90j par profil |
| `backtest_debug.json` | 73 K | P&L détaillé par scénario |
| `fundamentals_cache.json` | 2.4 M | Cache P/E, ROE, dividend yield (refresh sélectif) |
| `daily_metrics.json` | 756 K | Métriques journalières par asset |
| `tops_overview.json` | 2.1 M | Top 10 performers par region/sector |

### C.6 — Histoire & archive

| Dossier | Contenu | Rétention |
|---|---|---|
| `portfolio_history/` | 1000+ JSON timestamped (portfolios_v4_YYYYMMDD_HHMMSS.json) | 1 mois roulant + index.json |
| `history/{YYYY-MM-DD}/` | Snapshots quotidiens par date | 3 mois |

### C.7 — Référence interne

| Fichier | Rôle |
|---|---|
| `combined_snapshot.json` | Snapshot univers complet (tous assets, toutes métriques) |
| `lists.json` | Listes prédéfinies (large cap, dividend aristocrats, etc.) |
| `ticker_mapping_ucits.json` | Mapping UCITS eligibility (PEA/UE) |
| `allocation_rules.json` | Thematic caps + mandatory hedges + market rules |
| `peer_groups.json` | Peer group mappings par ticker (148 K) |

---

## D. `config/` — Fichiers de configuration

| Fichier | Format | Rôle | Top-level keys |
|---|---|---|---|
| **portfolio_config.yaml** | YAML | Risk profiles, factor weights, optim params, filters | `profiles` (Agressif/Modéré/Stable), `risk_model`, `universe_filters`, `backtest`, `api`, `lombard` |
| **correlation_mapping.py** | Python | Corrélations sector-region | `SECTOR_PAIR_CORRELATIONS`, `SECTOR_TO_RADAR`, `COUNTRY_TO_RADAR` |
| **dividend_benchmarks.json** | JSON | Benchmarks VIG/SCHD/EEI/IWDA pour Dividende | `{profile: {primary, alternative, income_alternative}}` |
| **dividende_baseline.json** | JSON | Tickers figés Dividende (anti-turnover) | `{holdings: {Dividende-PEA: [...], Dividende-CTO: [...], _etf_foundation: {...}}}` |
| **pea_eligibility_overrides.json** | JSON | Exceptions PEA (ACN siège IE, STM NL, EXOR NL) | `{overrides: {ticker: {pea_eligible, real_hq, reason}}}` |
| **tradepulse.yaml** | YAML | API + frontend config | `api_endpoints`, `cache_ttl`, `logging` |

---

## E. `schemas/` — Validation JSON

| Schema | Valide | Champs requis | additionalProperties |
|---|---|---|---|
| `portfolio_output.json` | `data/portfolios.json` (v2.8.0) | `Agressif`, `Modéré`, `Stable`, `_meta` (+ `Dividende-PEA`, `Dividende-CTO` autorisés) | `false` au top level (strict) |
| ProfilePortfolio (sub-schema) | Chaque profil dans portfolios.json | Commentaire, Actions, ETF, Obligations, Crypto, _tickers | `false` (Cash récemment ajouté) |

→ Validation lancée par `.github/workflows/validate-schema.yml` à chaque commit sur main.

---

## F. Versions actuelles des modules critiques

| Module | Version | Dernier update | Note |
|---|---|---|---|
| optimizer.py | v6.32.2 | 2026-01-28 | P0 scoring fix, z-score, dedup fix |
| preset_meta.py | v5.2.0 | 2026-01-28 | Corporate groups + dual listings dedup |
| factors.py | v4.1.0 | 2026-01-20 | Vol mapping alignment crypto/bond/ETF |
| universe.py | v4.1 | 2026-01-20 | RADAR tie-breaker, calibrated EPS |
| preset_etf.py | v2.4.1 | 2026-01-26 | Sector_healthcare preset |
| preset_bond.py | v1.3.0 | 2026-01-26 | Tips_inflation pour Modéré/Stable |
| market_sector_radar.py | v1.6.1 | 2026-01-20 | Dead zone, sweet spot max, circuit breaker |
| market_intelligence.py | v1.0.0 | 2026-01-15 | Claude Opus CIO role |
| selection_audit.py | v1.7.1 | 2026-01-28 | Sync preset_meta v5.1.4 |
| llm_commentary.py | v2.1 | 2026-01-25 | Sanitizer + forbidden words |
| risk_analysis.py | v1.2.6 | 2026-01-28 | allocation_breakdown expose |
| backtest_modes.py | v1.0 | 2025-12-18 | ILLUSTRATIVE vs RESEARCH |
| allocation_rules_engine.py | v2.0.0 | 2026-03-20 | Market conditions + thematic caps |
| constraints.py | v1.0 | 2026-01-27 | Hiérarchie formelle (review ChatGPT Q19) |
| Notre code Dividende (v8.x) | v8.x.5 | 2026-05-21 | Baseline figé + ETF foundation injection |

---

## G. Le scoring composite — vue interne

### Pour Equity (`preset_meta.py::score_equity_for_profile()`)

```python
score = (
    weights["quality_quality_sub"]  × quality_quality_sub     # ROE+ROIC+margin peer-relative
  + weights["quality_safety_sub"]   × quality_safety_sub      # D/E+payout peer-relative
  + weights["quality_value_sub"]    × quality_value_sub       # P/E+FCF peer-relative
  + weights["quality_growth_sub"]   × quality_growth_sub      # EPS+revenue growth
  + weights["eps_growth_forecast_5y"] × eps_growth_forecast_5y
  + weights["eps_surprise"]         × eps_surprise            # PEAD
  + weights["perf_1y"]              × perf_1y                 # momentum
  + weights["perf_3m"]              × perf_3m
  + weights["volatility_3y"]        × volatility_3y_norm      # signe selon profil
  + weights["max_drawdown_3y"]      × max_drawdown_3y_norm
  + weights["dividend_yield"]       × dividend_yield_norm
  + weights["dividend_growth_3y"]   × dividend_growth_3y_norm
  + weights["dividend_coverage"]    × dividend_coverage_norm
)
```

**Pondération par profil** (dans PROFILE_POLICY) :

| Facteur | Agressif | Modéré | Stable | **Dividende** |
|---|---|---|---|---|
| Quality quality sub (ROE+ROIC+marge) | 0.10 | 0.15 | 0.10 | **0.12** |
| Quality safety sub (D/E+payout) | 0.05 | 0.15 | **0.25** | **0.20** |
| Quality value sub (P/E+FCF) | 0.05 | 0.10 | 0.10 | 0.05 |
| Quality growth sub (EPS+revenue) | **0.15** | 0.10 | — | — |
| EPS growth forecast 5Y | 0.10 | 0.08 | 0.05 | — |
| EPS surprise | 0.08 | 0.05 | — | — |
| Perf 1Y | **0.17** | 0.04 | 0.05 | 0.03 |
| Perf 3M | 0.05 | 0.03 | — | — |
| Volatility 3Y | +0.05 | −0.10 | **−0.20** | −0.10 |
| Max DD 3Y | −0.05 | −0.10 | −0.10 | −0.10 |
| **Dividend yield** | −0.05 | 0.10 | **0.15** | **0.18** |
| **Dividend growth 3Y** | — | — | 0.05 | **0.17** |
| Dividend coverage | — | — | — | 0.05 |

→ **Lecture** : Stable et Dividende sont **fortement income/safety-tilted**, Agressif est **growth/momentum**.

### Pour ETF (`preset_etf.py::compute_etf_score()`)

Score différent — basé sur :
- `_profile_score_target` matching (preset rules : croissance_tech doit avoir vol > 25%, qualité < 70...)
- AUM (>500 M$ bonus)
- TER (<0.30% bonus)
- Liquidité (volume médian × prix)
- Performance YTD + 1Y
- Sector exposure matching profile tilts

### Pour Bond (`preset_bond.py`)

```python
score = (
    rating_score (AAA=95, ..., CCC=15)
  + duration_match_profile (Stable=long, Agressif=short)
  + yield_ttm × profile_weight
  + ter_penalty
  − credit_risk_premium
)
```

### Pour Crypto (`preset_crypto.py`)

- Sharpe ratio 1Y
- VaR 95% inversed
- Market cap (top 30 dominants only)
- Stablecoin detection (USDT/USDC exclus du portefeuille)

---

## H. Optimizer Markowitz — détails (optimizer.py)

### Inputs
- `assets` : liste d'Asset objects avec `score`, `category`, `region`, `sector`, `vol_annual`, `returns_series`
- `profile` : nom du profil (Agressif/Modéré/Stable/Dividende-*)

### Pipeline interne (5 étapes)

1. **Préparation pool** :
   - Filter par catégorie (max_any_category 70% par défaut)
   - Inject defensifs si Stable manque de couverture
   - Inject ETF si pool actions trop petit

2. **Covariance** :
   - Empirique (returns_series) si dispo
   - Sinon **Ledoit-Wolf shrinkage** vers diagonal
   - **EWMA** sur 90j si recent
   - **PCA fallback** si matrice mal conditionnée
   - `correlation_diagnostics.py::diagnose_covariance_matrix()` valide (condition number < threshold)

3. **Solve max Sharpe** :
   - `scipy.optimize.minimize(method="SLSQP")`
   - Bounds : 0 ≤ w_i ≤ max_single_position
   - Contraintes égalité : sum(w) = 1
   - Contraintes inégalité : caps sector/region/category

4. **Vol target adjustment** :
   - Si vol portefeuille > vol_target + tolerance : `_adjust_for_vol_target()` réduit positions à plus haute vol
   - Itération jusqu'à convergence ou max 10 cycles

5. **Fallback heuristiques** si SLSQP fail :
   - **Equal-weight** (si <5 actifs)
   - **Yield-weighted** (pour Stable)
   - **Score-weighted with caps** (général)

### Diagnostics retournés

```python
{
    "sharpe_ratio": 0.85,
    "portfolio_vol": 11.2,           # % annualisé réalisé
    "vol_target": 11.0,
    "vol_realized_vs_target": "OK",
    "optimization_mode": "SLSQP" | "fallback_equal" | "fallback_yield",
    "iterations": 24,
    "constraint_violations": [],
    "n_assets": 17,
    "diversification_ratio": 1.42,
    "max_position": 14.0,
    "max_sector_exposure": 28.5,
    "max_region_exposure": 65.0,
}
```

---

## I. Allocation Rules Engine — méta-règles

`allocation_rules_engine.py` applique 4 types de règles après l'optimizer :

### 1. Thematic caps
```json
"thematic_caps": {
    "semi_us": {"max_pct": 15, "tickers": ["SOXX", "SMH", "NVDA", ...]},
    "ai": {"max_pct": 15, "tickers": ["NVDA", "AVGO", "AMD", ...]},
    "gold_physical": {"max_pct": 10, "tickers": ["GLD", "IAU", ...]},
    "healthcare": {"max_pct": 12, "tickers": [...]}
}
```

### 2. Mandatory hedges (market-conditional)
```json
"mandatory_hedges": {
    "if_vix_gt_25": {"add": "GLD", "weight": 0.05},
    "if_brent_gt_100": {"add": "OIH", "weight": 0.03},
    "if_crypto_allowed": {"min": "BTC", "weight": 0.02}
}
```

### 3. Bond strategy (per profile)
```json
"bond_strategy": {
    "Stable": {"duration_target": 7, "credit_quality_min": "A"},
    "Modéré": {"duration_target": 5, "credit_quality_min": "BBB"},
    "Agressif": {"duration_target": 2, "credit_quality_min": "BB"}
}
```

### 4. Profile replacements
```json
"profile_replacements": {
    "Stable": [
        {"if": "vol_macro > threshold", "replace": "TTE", "with": "IBE"}
    ]
}
```

Inputs externes (market conditions) via APIs : VIX, Brent, gold spot, CPI. Si non dispo, règles statiques uniquement.

---

## J. Risk Analysis — VaR & CVaR

`risk_analysis.py::enrich_portfolio_with_risk_analysis()` calcule :

| Métrique | Définition | Méthode |
|---|---|---|
| **VaR 95%** | Perte max attendue dans 5% des cas | Historique 5Y (paramétrique + bootstrap) |
| **VaR 99%** | Perte max attendue dans 1% des cas | Idem |
| **CVaR 95%** (Expected Shortfall) | Perte moyenne dans le pire 5% des cas | Moyenne queue distribution |
| **Tail risk ratio** | CVaR 95% / VaR 95% | > 1.3 = queue épaisse |
| **Vol annualisée réalisée** | Std des returns 252 jours | Empirique |
| **Max drawdown 5Y** | Plus grand pic-à-creux historique | Empirique |
| **Stress scenarios** | P&L sous 5 scénarios historiques | stress_testing.py |

Output injecté dans `data/portfolios.json` sous `_risk_analysis`.

---

## K. Synthèse — qui fait quoi en une page

```
        ┌──────────────────────────────────────────────────┐
        │  ENTRÉE : stocks_*.json + ETF.csv + bonds.csv    │
        │           + crypto.csv + macro_indicators.json    │
        └──────────────────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────────────────┐
        │  factors.py (FactorScorer)                       │
        │  → score unifié 8 facteurs par asset             │
        └──────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴───────────────────┐
        ▼                                         ▼
┌──────────────────┐                  ┌──────────────────┐
│ market_sector_   │                  │ preset_meta.py   │
│ radar.py         │                  │ select_equities_ │
│ → tilts sectors  │                  │ for_profile      │
└──────────────────┘                  │ + dedup          │
        │                             └──────────────────┘
        ▼                                         │
┌──────────────────┐                              │
│ market_          │            ┌─────────────────┤
│ intelligence.py  │            ▼                 ▼
│ → Claude Opus    │   ┌──────────────┐  ┌──────────────┐
│   CIO deltas     │   │ preset_etf.py│  │preset_bond.py│
└──────────────────┘   └──────────────┘  └──────────────┘
        │                       │                 │
        ▼                       ▼                 ▼
┌──────────────────────────────────────────────────┐
│  optimizer.py::PortfolioOptimizer.build_portfolio │
│  → Markowitz max Sharpe sous contraintes          │
│  → Covariance Ledoit-Wolf + EWMA + PCA fallback   │
└──────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────┐
│  allocation_rules_engine.py                       │
│  → Thematic caps + hedges + bond strategy         │
└──────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────┐
│  constraints.py + constraint_report.py            │
│  → Validation HARD/SOFT/RELAXABLE                 │
└──────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────┐
│  risk_analysis.py + stress_testing.py             │
│  → VaR, CVaR, scenarios                           │
└──────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────┐
│  selection_audit.py + selection_explainer.py     │
│  → JSON audit + explanations                      │
└──────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────┐
│  llm_commentary.py + asset_rationale_generator.py │
│  → Commentaire portefeuille + rationale par titre │
└──────────────────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────────┐
        │  SORTIE : data/portfolios.json (validé   │
        │  par schemas/portfolio_output.json)      │
        └──────────────────────────────────────────┘
```

---

## L. Statistiques globales du codebase

| Catégorie | Quantité |
|---|---|
| **Modules portfolio_engine/** | 50 |
| **Lignes Python totales** | ~48 000 |
| **Top 5 plus gros modules** | optimizer.py (5891), preset_meta.py (3072), etf_exposure.py (2926), preset_etf.py (2682), factors.py (2649) |
| **Configs externes** | 6 (config/) + 1 (schemas/) |
| **Fichiers data/ JSON** | 50+ |
| **Workflows GitHub Actions** | 41 .yml files |
| **Output portfolios.json final** | ~6 000 lignes JSON |
| **Profils calculés** | 5 (Agressif, Modéré, Stable, Dividende-PEA, Dividende-CTO) |
| **Backtest scénarios** | 5 historiques |
| **Stress test scénarios** | 5 (2008, 2020, 2022 rates, dot-com, energy) |
| **Conformité AMF** | Disclaimer auto + sanitizer + audit trail LLM |

---

## M. Ce qui rend le système rare

1. **Multi-asset unifié** : equity + ETF + bond + crypto avec scoring cohérent (`factors.py` v4.1)
2. **RADAR + LLM CIO** : tilts tactiques data-driven + ajustements qualitatifs Claude Opus
3. **Audit trail complet** : selection_audit + selection_explained + market_intelligence_audit + structured_logging
4. **Reproductibilité** : `deterministic.py` garantit même input → même output (sauf LLM commentary)
5. **AMF compliance** : sanitizer auto + forbidden words + min 4 phrases + 2 mentions risque
6. **Multi-versionning** : 14 modules versionnés indépendamment (optimizer v6.32.2, preset_meta v5.2, factors v4.1...)
7. **Stress-tested** : VaR + CVaR + 5 scénarios historiques + correlation diagnostics
8. **Baseline figé personnalisable** : v8.x.5 buy-and-hold strict pour Dividende avec turnover 0%

---

## N. Limites identifiées

1. **Gros modules monolithiques** : optimizer.py (5891L), preset_meta.py (3072L) — difficile à maintenir
2. **Couplage fort** generate_portfolios_v4.py ↔ preset_meta.py via hardcoded profile names
3. **Dépendances externes** : Twelve Data API (prix, ETF), Claude API (LLM), CoinMarketCap (crypto)
4. **Pas de tests unitaires complets** : `optimizer_test.py` existe mais limité
5. **Caches non centralisés** : fundamentals_cache.json, price_cache.json, ticker mappings éparpillés
6. **CONFIG en partie hardcodée** : certaines constantes (ETF_FOUNDATION_DIVIDENDE, DIVIDENDE_MAX_COUNTRY_PCT) dans le code Python plutôt qu'en config/
7. **Documentation API LLM** : sanitizer/forbidden words pas externalisés

---

## O. Évolutions possibles (pour info, non requises)

| Évolution | Bénéfice | Effort |
|---|---|---|
| Externaliser ETF_FOUNDATION dans config/ | Plus de flexibilité | 30 min |
| Tests unitaires sur scoring formulas | Détection régressions | 2-3 jours |
| Split optimizer.py en sous-modules | Maintenabilité | 1 jour |
| Centraliser caches dans cache/ folder | Clarté + invalidation simple | 1 jour |
| Versionner schemas/ avec migration tool | Évolution sans breaking | 2 jours |
| Ajouter mode "dry-run" sans écriture | Tests pipeline sans pollution data | 1 jour |
| Métriques pipeline (durée par phase, etc.) en JSON | Diagnostic perf | 1 jour |

---

*Document généré le 2026-05-22. Source : analyse statique du codebase complet `portfolio_engine/` + `data/` + `config/` + `schemas/` (commit `3ac3d65af` sur main).*
