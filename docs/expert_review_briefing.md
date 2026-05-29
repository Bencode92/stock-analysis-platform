# Expert Review — Briefing modélisation 3 portefeuilles modèles

**Date** : 2026-05-29
**Système** : `stock-analysis-platform` (open source, génération quotidienne par GitHub Actions)
**Cible du document** : gérant de portefeuille traditionnel pour revue méthodologique
**Statut data fraîcheur** : workflow `c7bb7af28`, backtest 90j, covariance trustworthy=True sur Modéré/Stable
**Niveau confidentialité** : pas de capitaux ni clients ; uniquement les modèles abstraits

---

## 1. Executive summary

### 1.1 Ce que fait le système

Génère quotidiennement **3 portefeuilles modèles** (Agressif / Modéré / Stable) à partir d'un univers de ~3 000 actions mondiales, ~1 400 ETF UCITS+US, et un panier de bonds. Le pipeline combine :

1. Univers et données fondamentales (TwelveData Ultra + FRED)
2. Filtres durs (sectorisés Buffett + nouveau gate liquidité)
3. Scoring factor multi-dimensionnel par profil (8 facteurs pondérés)
4. Préselection ETF via presets thématiques (16 presets)
5. Tilts macro déterministes (RADAR : multiplicateurs sectoriels)
6. Optimisation Markowitz hybride (SLSQP avec covariance shrinkage + structurée)
7. Heuristique fallback pour Stable (contraintes trop strictes pour Markowitz pur)
8. Post-processing cascade (caps individuels, dedup ETF, etc.)
9. Persistance avec diagnostics (trustworthiness covariance, coverage, etc.)

Les portefeuilles servent de modèles de référence (`data/portfolios.json`) pour
des outils d'allocation aval (`Allocator` web qui importe un CSV broker et propose
un plan d'arbitrage vers la cible).

### 1.2 Problème spécifique à arbitrer

**Modéré, profil cible vol 12% (tolérance ±3%), livre vol réalisée 6.75%** (cov trustworthy=True, coverage 83.6 %).
Le portefeuille est **structurellement sous-volatil** : beta vs benchmark = 0.38 sur backtest 90j,
information ratio -3.12, alpha -4.06%, upside capture 29.3 %.

Trois hypothèses candidates pour expliquer cette dérive défensive :

- **H1** Trop de bonds : 25% (juste au-dessus de bonds_min=22%) tirent la vol bas.
- **H2** ETF "factor dividend US" surreprésentés : SCHD + FNDX + FNDF + DIVB = **29.6 %** avec recouvrement holdings ~50-70 %.
- **H3** Hard gate liquidité 12 B€ filtre l'univers vers des mega-caps low-beta (PSE Group beta ~0.4, VICI ~0.6, Novartis ~0.6).

Le contre-test du recalibrage factor weights (`momentum 0.18→0.22`, `low_vol 0.22→0.18`)
n'a presque rien changé : vol 7.21 % → 6.75 %. La sensibilité au tilt facteur est faible parce
que les contraintes (bonds_min + sector caps + max_single + univers post-gate) dominent.

### 1.3 Questions clés posées à l'expert

1. **Quelle est la vraie cible de vol pour un profil "Balanced/Modéré" 2026 ?** Le repère 12% est-il pertinent ? 9-11% suffirait-il ?
2. **Faut-il "look-through holdings" pour casser le triplet SCHD/FNDX/DIVB** ? Ou la redondance factorielle est-elle acceptable si on contrôle la concentration via cap explicite ?
3. **Les hard filters Buffett v2.1 sont-ils calibrés correctement** ? Trop strict ? Trop laxiste ?
4. **Le rescaling ETF [40, 72] est-il un anti-pattern** ou une solution pragmatique aux différences d'échelle z-score actions vs ETF ?
5. **L'asymétrie de pénalité vol (`λ_under=8` vs `λ_over=2.5-10`) est-elle justifiée mathématiquement** ?
6. **Quels facteurs académiquement validés manquent** ? (Piotroski F-Score, Profitability Novy-Marx, Accruals, Investment factor)
7. **Le système devrait-il enforcer une "core allocation" minimale** (broad ETF VTI/VXUS/AGG type) pour ancrer la diversification ?

Le reste du document détaille chaque composant pour permettre une revue informée.

---

## 2. Architecture pipeline A→Z

### 2.1 Vue d'ensemble

```
+------------------+     +------------------+     +-----------------+
| 1. Univers brut  | --> | 2. Filtres durs  | --> | 3. Scoring      |
| ~3k stocks       |     | (Buffett + liq.) |     | factor          |
| ~1.4k ETF        |     |                  |     | (8 facteurs)    |
| ~450 bonds       |     |                  |     |                 |
+------------------+     +------------------+     +-----------------+
                                                            |
                                                            v
+--------------------+    +-------------------+    +-----------------+
| 7. Post-processing | <- | 6. Optimisation   | <- | 4. Tilts macro  |
| cascade            |    | SLSQP (ou        |    | (RADAR multi.)  |
| + caps             |    | heuristique)     |    +-----------------+
+--------------------+    +-------------------+            |
        |                          ^                       v
        v                          |              +-----------------+
+--------------------+              |              | 5. Présélection |
| 8. Sauvegarde +    |              +--------------+ ETF (16 presets)|
| diagnostics + UI   |                             +-----------------+
+--------------------+
```

### 2.2 Sources de données

| Source | Usage | Fraîcheur | Endpoint |
|---|---|---|---|
| TwelveData (Ultra plan) | Time series prix, returns 5y | Quotidien (cache 24h) | `api.twelvedata.com/time_series` |
| FRED | Macro context (FEDFUNDS, VIX, etc.) | Quotidien | `api.stlouisfed.org/fred` |
| `data/stocks_us.json` | 518 stocks US enrichis | Hebdomadaire (workflow `stock-filter`) | Local |
| `data/stocks_europe.json` | 275 stocks EU | Hebdomadaire | Local |
| `data/stocks_asia.json` | 268 stocks Asia | Hebdomadaire | Local |
| `data/combined_etfs.csv` | ~1 400 ETFs (TER, AUM, holdings) | Hebdomadaire (`etf-pipeline.yml`) | Local |
| `data/combined_bonds.csv` | Bonds ETF + governement | Hebdomadaire | Local |
| Anthropic Claude | Commentaires en langage naturel (asset_rationale) | À chaque run | `api.anthropic.com` |

### 2.3 Composants Python principaux

| Module | Rôle |
|---|---|
| `generate_portfolios_v4.py` (6 600+ LOC) | Orchestrateur principal |
| `portfolio_engine/optimizer.py` (5 600+ LOC) | Markowitz SLSQP + fallback heuristic + post-processing |
| `portfolio_engine/factors.py` (2 200+ LOC) | Calcul facteurs (momentum, quality, low_vol, …) |
| `portfolio_engine/sector_quality.py` | Filtre Buffett v2.1 (ROE, ROIC, D/E, FCF, EPS growth, payout, vol, max DD) |
| `portfolio_engine/preset_meta.py` | Presets actions par profil, CORPORATE_GROUPS dedup, DUAL_LISTING_TICKERS |
| `portfolio_engine/preset_etf.py` | 16 presets ETF (coeur_global, min_vol_global, …) |
| `portfolio_engine/historical_data.py` | Fetch TwelveData avec resolver mic_code |
| `portfolio_engine/ticker_resolver.py` | Mapping ticker → (symbol, mic, exchange) pour TwelveData |
| `portfolio_engine/price_loader.py` | Charge returns_series sur Asset objects, cache 24h |
| `portfolio_engine/market_context.py` + `update_macro_context.py` | Pipeline RADAR (favored/avoided sectors) |
| `backtest/engine.py` + `data_loader.py` | Backtest 90j à poids fixes |

### 2.4 Fréquence et persistance

- **Workflow principal** : `generate_portfolios.yml` — déclenché sur push + cron + manuel
- **Sortie principale** : `data/portfolios.json` (committed)
- **Historique** : `data/portfolio_history/portfolios_v4_YYYYMMDD_HHMMSS.json` (committed)
- **Backtest** : `data/backtest_results.json` (committed, regénéré par chaque run)
- **Cache prix** : `data/price_cache.json` (gitignored — non persisté entre runs)

---

## 3. Étape 1 — Univers brut

### 3.1 Construction

Lecture des 3 fichiers stocks JSON + CSV ETF/bonds. Pas de filtrage géographique appliqué
au niveau de cette étape — tout converge dans un pool unique avant filtres.

| Catégorie | Taille raw | Provenance |
|---|---|---|
| Actions US | 518 | Twelve Data + FMP enrichissement |
| Actions EU | 275 | Idem |
| Actions Asia | 268 | Idem |
| ETF | 1 405 | Twelve Data + reference data |
| Bonds | 450 | Twelve Data bond category |
| Crypto | ~30 | CoinGecko + Twelve Data |

### 3.2 Limites connues

- **Survivorship bias non mitigé** : seul les vivants sont chargés. Pas de tracker explicite "active_since" pour les nouvellement listés.
- **Pas de couverture frontier markets** (Vietnam, Égypte, etc.)
- **Pas de mid-cap value EU exhaustif** (couverture EU = top 275 par market cap)

---

## 4. Étape 2 — Filtres durs

### 4.1 Filtre Buffett v2.1 (sector_quality.py)

Sectorisé : chaque secteur a son propre profil de seuils (ex : tech tolère D/E plus élevé, REIT tolère payout plus haut, etc.).

| Métrique | Logique | Seuils (médian sectoriel) |
|---|---|---|
| ROE | Si négatif → rejet immédiat ; si positif, doit dépasser `roe_hard` | 2-10 % selon secteur |
| ROIC | Idem | 3-5 % |
| D/E | < `de_hard` | 200-350 % |
| FCF Yield | ≥ `fcf_yield_hard` | ≥ 0 % |
| EPS Growth 5y | ≥ `eps_growth_hard` | -5 à -10 % |
| Payout ratio TTM | ≤ `payout_hard` | 80-120 % |
| Volatility 3y | ≤ `vol_hard` | 50-70 % |
| Max Drawdown YTD | ≤ `dd_hard` | 50-55 % |

Mode "strict" rejette aussi les missing fields. Mode "soft" calcule une penalty
continue [0, 1] qui pondère le score.

### 4.2 Hard gate liquidité (`generate_portfolios_v4.py:_apply_liquidity_gate`)

Ajouté en Phase Sélection-1, hier (2026-05-28). Seuils sectionnés par profil et exprimés
en **devise locale** (pas de conversion FX — limite acceptée car mid-cap locale ≈ mid-cap réelle).

| Profil | `market_cap_min` | `share_volume_min` |
|---|---|---|
| Agressif | 2.0 × 10⁹ | 200 000 |
| Modéré | 12.0 × 10⁹ | 500 000 |
| Stable | 18.0 × 10⁹ | 1 000 000 |
| Dividende-PEA / CTO | 2.0 × 10⁹ | 100 000 |

**Rejets observés sur un run typique** :

- Agressif : 1 / 1 023 (~0 %)
- Modéré : 91 / 1 023 (~9 %)
- Stable : 183 / 1 023 (~18 %)

Le gate Modéré élimine BUZZI (9.58 B€), KLEPIERRE (10.05 B€), ITALGAS (10.69 B€).

### 4.3 Limites du dispositif filtres

- **Pas de filtre tracking error** sur les ETF
- **Pas de filtre PEA-éligibilité** explicite
- **Pas de filtre survivorship** ni listing age
- **Filtre coverage fondamentales absent** : un stock avec 50% de fondamentales NaN peut passer

---

## 5. Étape 3 — Scoring factor

### 5.1 Liste des facteurs

8 facteurs calculés en `factors.py` (~2 200 LOC).

| Facteur | Méthodologie | Échelle |
|---|---|---|
| `momentum` | Blend perf 12m + 3m + 1m + YTD (poids variables) | z-score normalisé puis [0, 1] |
| `quality_fundamental` | Score peer-relative sur ROE, ROIC, D/E, marge nette, FCF/EV | Idem |
| `low_vol` | Inverse de la vol_3y annualisée | Idem |
| `cost_efficiency` | TER (ETF) ou null (actions) | Idem |
| `bond_quality` | Duration, qualité crédit, type souverain/corp | Idem |
| `tactical_context` | Multiplicateur RADAR sectoriel (favored/avoided) | [0.85, 1.15] |
| `liquidity` | log(market_cap) ou log(AUM) | z-score |
| `mean_reversion` | Écart de prix vs MA90 | z-score |

### 5.2 PROFILE_WEIGHTS (`factors.py:PROFILE_WEIGHTS`)

**État au 2026-05-29 (commit `95e8e43d4`) :**

| Facteur | Agressif | Modéré | Stable |
|---|---|---|---|
| momentum | 0.40 | **0.22** | 0.12 |
| quality_fundamental | 0.25 | **0.30** | 0.20 |
| low_vol | 0.08 | **0.18** | 0.25 |
| cost_efficiency | 0.05 | 0.07 | 0.10 |
| bond_quality | 0.00 | 0.08 | 0.15 |
| tactical_context | 0.10 | 0.05 | 0.05 |
| liquidity | 0.07 | 0.05 | 0.08 |
| mean_reversion | 0.05 | 0.05 | 0.05 |
| **Σ** | **1.00** | **1.00** | **1.00** |

Profils Dividende-PEA et Dividende-CTO (personnels) : 100% actions, faible momentum
(anti-rotation), `quality=0.35`, `low_vol=0.20`, `mean_reversion=0.10`.

### 5.3 Historique des recalibrages Modéré (cette semaine)

| Étape | momentum | quality | low_vol | tactical | Vol réalisée |
|---|---|---|---|---|---|
| Originel | 0.28 | 0.25 | 0.15 | 0.07 | 18.91 % |
| Sélection-1 (Phase 1) | 0.18 | 0.30 | 0.22 | 0.05 | 7.21 % |
| Sélection-1.2 (actuel) | 0.22 | 0.30 | 0.18 | 0.05 | 6.75 % |

L'effet marginal des dernières modifs (±4 points momentum/low_vol = -0.5pp vol) suggère que
**le bottleneck n'est plus le scoring** mais l'univers post-gate et les contraintes d'allocation.

### 5.4 Facteurs académiquement validés MANQUANTS

- **Profitability** (Novy-Marx 2013) : `gross_profit / total_assets`
- **Investment** (Bender et al. / Fama-French 5) : ΔD/E, capex/assets trend
- **Accruals quality** : `(net_income - cash_flow_ops) / total_assets`
- **Piotroski F-Score** (9 signaux binaires) — détecte value traps
- **Idiosyncratic vol** : résidu CAPM vs vol totale
- **Quality+Momentum AQR composite** : score binaire de cumul des deux signaux

---

## 6. Étape 4 — Présélection ETF

### 6.1 16 presets (preset_etf.py)

Chaque preset a un rôle (CORE, DEFENSIVE, SATELLITE, ALTERNATIVE, INCOME), des keywords
matchers, et des hard rules (TER, AUM, yield, sector).

| Preset | Role | Risk | Profils | Critères clés |
|---|---|---|---|---|
| coeur_global | CORE | LOW | Stable, Modéré | TER<0.35%, AUM>200M, diversité sectorielle |
| min_vol_global | DEFENSIVE | LOW | Stable | Vol<25e perc, TER<50e perc |
| multi_factor | CORE | MOD | Modéré, Agressif | Factor keywords, TER<0.60% |
| rendement_etf | DEFENSIVE | LOW | Stable, Modéré | Yield>60e perc, Vol<70e perc |
| income_options | INCOME | HIGH | Agressif | Options overlay, Yield>5% |
| qualite_value | CORE | MOD | Modéré | Value/Quality factor, Yield>50e perc |
| croissance_tech | SATELLITE | HIGH | Modéré, Agressif | Tech keywords, Mom>-5% 3m |
| smid_quality | SATELLITE | HIGH | Agressif | Small/Mid-cap keywords |
| emergents | SATELLITE | HIGH | Modéré, Agressif | EM/Frontier/Asia keywords |
| sector_defensive | DEFENSIVE | LOW | Stable, Modéré | Utilities/Healthcare/Staples, Vol<50e perc |
| sector_cyclical | SATELLITE | HIGH | Modéré, Agressif | Financials/Industrials/Materials/Energy |
| sector_energy | SATELLITE | MOD | Modéré, Agressif | Energy sector, TER<0.80%, Vol<35% |
| sector_healthcare | DEFENSIVE | LOW | All | Healthcare/Biotech, Vol<35%, AUM>50M |
| inflation_shield | ALT | MOD | Modéré | TIPS, commodities, real assets, REIT |
| or_physique | ALT | LOW | Stable, Modéré | Gold physical (GLD, IAU, SGOL…) |
| commodities_broad | ALT | HIGH | Agressif | Commodities ex-gold |

### 6.2 Scoring ETF — 8 composantes

| Composante | Direction | Mesure |
|---|---|---|
| vol | négatif | rank percentile inverse |
| TER | négatif | rank percentile inverse |
| AUM | positif | rank percentile |
| diversif_sector | négatif | sector_top_weight_frac inverse |
| diversif_holdings | négatif | holding_top_frac inverse |
| momentum | positif | blend 5% 1d + 25% 1m + 35% 3m + 15% YTD + 20% 1y |
| yield | positif | rank percentile |
| data_quality | positif | rank percentile |

### 6.3 Rescaling ETF [40, 72] — POINT CRITIQUE

`optimizer.py:2307-2326` : après scoring, les ETF sont **rescalés linéairement** sur
[40, 72] (note historique : "v3.4.1: was 85, caused 50% ETF allocation").

Conséquence : un ETF "top 3 %" sort à 72 → toujours **derrière** une action z-scorée à 80-90.

Effet observable : alloc ETF tombe à ~30-40 % au lieu de ~50 % sans rescaling. Mais
**la redondance factorielle persiste** : si l'algo prend N ETF dividend US à 72 chacun,
le portefeuille reste sur-exposé à un même factor.

### 6.4 Déduplication ETF

`preset_etf.py` + `optimizer.py` font une déduplication **TER-aware** :

- Clé : `underlying_ticker` (sinon ISIN, sinon symbol)
- Score interne : 40 % TER rank inversé + 40 % profile_score + 20 % AUM rank
- Garde le meilleur de chaque groupe

**Limite** : la dédup est exact-match. SCHD vs DIVB ne sont pas dédupliqués parce qu'ils
trackent des indices différents (Dow Jones US Dividend 100 vs iShares Core Dividend) bien
qu'ils détiennent 50-70 % les mêmes large caps.

---

## 7. Étape 5 — Tilts tactiques RADAR

### 7.1 Mécanisme

`apply_macro_tilts_radar()` dans `generate_portfolios_v4.py` (v4.9.0+).

Multiplicateur sectoriel/régional `[0.85, 1.15]` appliqué sur `_profile_score`
AVANT optimisation. Source : `data/market_context.json` généré par
`update_macro_context.py` à partir de FRED + structured news.

Tilts par défaut (à 2026-05-29) :

- **Favored sectors** : healthcare, consumer-staples, utilities
- **Avoided sectors** : real-estate, consumer-discretionary

Pénalités géopolitiques additionnelles pour Stable (Russie, Belarus, Iran : ×0.75).

### 7.2 Critique méthodologique potentielle

- ±15 % de tilt peut **compenser 2 grades de qualité** fondamentale.
- Pas de cap absolu : un secteur fortement favored peut faire monter tous ses
  composants au-dessus de fondamentales meilleures hors-secteur.
- **Pas de mécanisme de "décay"** : un tilt RADAR reste actif jusqu'au prochain refresh.

---

## 8. Étape 6 — Optimisation Markowitz

### 8.1 PROFILES (`optimizer.py:PROFILES`)

**État au 2026-05-29 (commit `95e8e43d4`) :**

| Paramètre | Agressif | Modéré | Stable |
|---|---|---|---|
| `vol_target` | 24.0 | 12.0 | 6.0 |
| `vol_tolerance` | 6.0 | 3.0 | 3.0 |
| `crypto_max` | 10.0 | 5.0 | 0.0 |
| `bonds_min` | 10.0 | 22.0 | 35.0 |
| `bonds_max` | 20.0 | 50.0 | 65.0 |
| `max_sector` | 35.0 | défaut 30 | défaut 30 |
| `max_region` | défaut 50 | défaut 50 | défaut 50 |
| `max_single_position` | 13.0 | 10.0 | 13.0 |
| `min_assets` | 10 | 10 | 10 |
| `max_assets` | 18 | 18 | 18 |
| `max_turnover` | 30.0 | 25.0 | 15.0 |
| `turnover_penalty` (λ) | 1.0 | 2.0 | 4.0 |
| `score_scale` | 5.0 | 4.0 | 3.0 |
| `bucket_penalty_lambda` | 2.0 | 5.0 | 2.0 |
| `max_any_category` | 70.0 | 65.0 | 70.0 |

**Profils Dividende-PEA / CTO** : 100 % actions, vol_target ≈ 11 %, bonds_min=0, max_single 8-9%.

### 8.2 Fonction objectif SLSQP

```
maximize port_score
       - λ_vol_under × vol_diff²        (si vol < cible, λ=8)
       - λ_vol_over × vol_diff²         (si vol > cible, λ profil-dépendant)
       - λ_turnover × turnover          (λ ∈ [1, 4])
       - λ_bucket × buckets_deviation²  (CORE/SATELLITE/DEFENSIVE/LOTTERY targets)
       - λ_hhi × (HHI - 1/n)            (concentration)
```

Avec :

- `λ_vol_over` = {Agressif: 2.5, Modéré: 10.0, Stable: 8.0}
- Note v7.2.1 : Modéré était à 3.0 → 10.0 après A/B test (+3 % Sharpe)
- `port_score` = z-scored normalized × `score_scale`

### 8.3 Contraintes hard (SLSQP `ineq`)

- `Σwᵢ = 1.0`
- `0 ≤ wᵢ ≤ max_single_position`
- `bonds_min ≤ Σw_bonds ≤ bonds_max`
- `Σw_crypto ≤ crypto_max`
- `Σw_sector(s) ≤ max_sector` ∀ s
- `Σw_region(r) ≤ max_region` ∀ r ∈ {US, EU, Asia, Other}
- `0.5 × Σ|wᵢ - w_prevᵢ| ≤ max_turnover` (si `prev_weights` fourni)

### 8.4 Covariance hybride

`optimizer.py:compute_covariance()` :

1. **Empirique** (sample cov sur returns 252j) avec Ledoit-Wolf shrinkage automatique
   jusqu'à `condition_number ≤ 10 000`.
2. **Structurée** (déduite des secteurs, régions, type d'asset) — corrélations fixes
   par couple (intra-sector ~0.37, intra-region ~0.30, equity-bond ~-0.10, etc.).
3. **Blend** : `cov_hybrid = 0.85 × cov_empirical + 0.15 × cov_structured`.

Si `returns_series` absent (cache stale, API down, ticker non résolu) pour un asset,
sa ligne+colonne empirique est mise à 0 → cov 100 % structurée pour cet asset.

### 8.5 Quality gate covariance (`Phase Sélection-1 #3`)

Annotation propagée dans diagnostics depuis hier :

```python
covariance_trustworthy = (
    empirical_weight >= 0.5
    AND returns_coverage_pct >= 70.0
)
```

**Observations sur dernier run** :

| Profil | empirical_weight | returns_coverage_pct | trustworthy |
|---|---|---|---|
| Agressif | 0.85 | 66.1 % | False (sous seuil 70) |
| Modéré | 0.85 | 83.6 % | True |
| Stable | 0.85 | 80.7 % | True |

Agressif sous seuil parce qu'il contient des EM/Asia stocks récents (King Slide TWN, GE Vernova
India, FLKR Korea, XCEM Columbia EM ex-China) sans 5y d'historique TwelveData complète.

### 8.6 Fallback heuristique (Stable)

`FORCE_FALLBACK_PROFILES = {"Stable"}` : Markowitz est sauté pour Stable car les
contraintes (vol 6%±3%, bonds_min 35%, DEFENSIVE 45-60% bucket) sont mathématiquement
incompatibles avec SLSQP sur l'univers typique.

Heuristique appliquée :

1. Trier candidats par vol croissante (`(vol, id)`)
2. Distribuer bonds_min = 35% sur ≥ 3 bonds distincts, max_single_bond plafonné
3. Réserver 6 actions Stable minimum (≥ score median, max 1 financial sector)
4. Ajouter ETF defensifs (USMV-équivalents, dividend)
5. Healthcare guarantee (swap si pas d'expo HC)
6. Régionnaliser puis normaliser à 100 %
7. Si turnover prev > max, blend toward prev (`_blend_to_max_turnover`)

### 8.7 SLSQP success/failure observé

| Profil | Mode habituel | Note |
|---|---|---|
| Agressif | SLSQP converged | OK |
| Modéré | SLSQP converged (depuis Phase Sél-1) | OK |
| Stable | fallback_heuristic (intentionnel) | OK |

Avant Phase Sélection-1, Modéré tombait en `FALLBACK SLSQP FAILED` ~30 % des runs
à cause de la sensibilité aux conditions initiales et de la covariance dégradée.

---

## 9. Étape 7 — Post-processing cascade

Après l'optimum SLSQP ou la sortie de l'heuristique, une **cascade de 7 étapes** est appliquée
dans `generate_portfolios_v4.py` après l'optim et dans `save_portfolios()` à la persistance :

1. `post_process_allocation()` : prune assets sous min_weight, normalise
2. `_MAX_SINGLE_EQUITY` cap : Actions individuelles cappées à {Agressif: 10%, Modéré: 11%, Stable: 10%}
3. `_PE_CAP_RULES` : PE > seuil → cap individuel additionnel (Agressif: PE>60 → ≤6%, etc.)
4. **AGRÉGÉ cap** sectoriel/régional post-cascade (~ligne 3046)
5. **ETF Sector Dedup** (`save_portfolios`) : merge tickers exposés mêmes indices (XLE+VDE+FENY, etc.)
6. Equity final cap (par-position)
7. ETF individual cap (9%)
8. `allocation_rules_engine` : règles externes (thematic caps, anti-concentration)
9. **`_enforce_final_turnover()`** (Phase 2-B4) : recompute turnover post-cascade, blend si > max

**Risque méthodologique** : chaque étape redistribue les poids → l'allocation finale **n'est pas
exactement l'optimum SLSQP**. Le pipeline accepte cette dérive car les contraintes "externes"
(comme `_MAX_SINGLE_EQUITY=10% sur stocks individuels`) ne sont pas dans SLSQP.

---

## 10. Snapshot Modéré (workflow `c7bb7af28`, 2026-05-29 14:27)

### 10.1 Métriques optimizer

| Mesure | Valeur |
|---|---|
| Vol cible | 12.0 % |
| Vol réalisée | **6.75 %** (sous tolérance min 9.0 %) |
| Mode | SLSQP converged |
| Cov trustworthy | True |
| Returns coverage | 83.6 % |
| Empirical weight | 0.85 |
| n_assets | 16 |
| Turnover vs précédent | 25.0 % (au max) |

### 10.2 Allocation détaillée

| Bucket | Ticker | Nom | Poids | Sector | Region | Beta (vs SPX) |
|---|---|---|---|---|---|---|
| Actions | VICI | VICI Properties (REIT casino) | 5.2 % | Real Estate | US | ~0.6 |
| Actions | NOVN | Novartis | 7.2 % | Healthcare | CH | ~0.5 |
| Actions | EOG | EOG Resources | 5.6 % | Energy | US | ~1.4 |
| Actions | SCHN | Schindler Holding (registered) | 5.3 % | Industrials | CH | ~0.8 |
| Actions | ITX | Inditex | 3.3 % | Consumer Disc | ES | ~1.0 |
| Actions | RIO | Rio Tinto | 2.4 % | Materials | UK | ~1.2 |
| Actions | PEG | Public Service Enterprise Group | 9.0 % | Utilities | US | ~0.4 |
| ETF | SCHD | Schwab US Dividend Equity | 9.0 % | Dividend factor US | US | ~0.85 |
| ETF | FNDF | Schwab Fundamental Intl Large | 9.0 % | Fundamental Intl | World ex-US | ~0.90 |
| ETF | FNDX | Schwab Fundamental US Large | 8.2 % | Fundamental US | US | ~0.95 |
| ETF | DIVB | iShares Core Dividend | 3.3 % | Dividend factor US | US | ~0.85 |
| ETF | GLD | SPDR Gold | 5.0 % | Gold | Global | ~0.05 |
| ETF | XLV | Healthcare SPDR | 3.0 % | Healthcare | US | ~0.65 |
| Bonds | STIP | iShares 0-5Y TIPS | 8.2 % | TIPS | US | ~0.0 |
| Bonds | GBIL | GS Access Treasury 0-1Y | 8.2 % | T-Bill | US | ~0.0 |
| Bonds | VGSH | Vanguard Short Treasury | 8.2 % | Treasury short | US | ~0.0 |

### 10.3 Agrégats

| Critère | Valeur |
|---|---|
| Actions individuelles | 38 % |
| ETF | 38 % |
| Bonds | 25 % |
| Crypto | 0 % |
| Sector Energy | 5.6 % |
| Sector Utilities | 9.0 % |
| Sector Healthcare | 10.2 % (Novartis + XLV) |
| Sector Real Estate | 5.2 % |
| Sector Materials | 2.4 % |
| Sector Industrials | 5.3 % |
| Sector Consumer Disc | 3.3 % |
| **Total dividend/fundamental factor ETF** | **29.6 %** |
| Gold | 5.0 % |
| Region US | ~60 % (incl. via FNDX) |
| Region EU/CH/UK | ~25 % |

### 10.4 Backtest 90j (du 2026-02-25 au 2026-05-29)

| Métrique | Modéré | Benchmark (60/40 ou similaire) |
|---|---|---|
| Net return | -1.11 % | +7.69 % |
| CAGR (annualisé) | -4.23 % | n/a |
| Volatility annualisée | 8.16 % | 15.63 % |
| Max Drawdown | -5.67 % | n/a |
| Sharpe (90j, non significatif) | -1.05 | n/a |
| Win rate | 52.31 % | n/a |
| Beta vs benchmark | **0.38** | 1.00 |
| Alpha | **-4.06 %** | 0.00 % |
| Information Ratio | -3.12 | n/a |
| Upside capture | 29.3 % | 100 % |
| Downside capture | 46.1 % | 100 % |

**Lecture rapide** : Le portefeuille est défensif (beta 0.38, downside capture 46%) **mais
pas suffisamment pour compenser** la sous-performance — il ne capture que 29 % de l'upside.
C'est typiquement le profil d'un portefeuille **sur-allocué bonds + low-vol US**, qui sous-performe
en marché haussier sans gagner significativement en marché baissier.

### 10.5 Diagnostic ETF redondance (sujet central)

Holdings overlap estimé (analyse de top 50 holdings, basée sur factsheets publics) :

| Couple | Estimated holdings overlap | Justification |
|---|---|---|
| SCHD vs DIVB | 50-70 % | Both track US high-dividend names (Pepsi, Verizon, Cisco, Pfizer, JPM, ExxonMobil) |
| SCHD vs FNDX | 25-35 % | FNDX = fundamental value-tilted broad US large, overlap sur quality dividend names |
| FNDX vs DIVB | 25-35 % | Idem |
| FNDF vs SCHD/FNDX/DIVB | 0-5 % | FNDF est ex-US, peu d'overlap avec les 3 autres |

Allocation au triplet US dividend/fundamental : **20.5 %** (SCHD + FNDX + DIVB).
Plus FNDF (Intl factor) : **29.5 %**.

**Question pour l'expert** : est-ce que 20.5 % en US large cap value/dividend factor avec
50-70 % d'overlap holdings = diversification effective ou redondance qui consomme 20.5 %
de poids sans diversification marginale ?

---

## 11. Snapshot Stable (workflow `c7bb7af28`)

### 11.1 Métriques optimizer

| Mesure | Valeur |
|---|---|
| Vol cible | 6.0 % |
| Vol réalisée | **8.04 %** (dans tolérance max 9 %) |
| Mode | fallback_heuristic (intentionnel) |
| Cov trustworthy | True |
| Returns coverage | 80.7 % |
| n_assets | 16 |
| Turnover vs précédent | 12.0 % (< max 15 %) |

### 11.2 Allocation

| Bucket | Ticker | Nom | Poids |
|---|---|---|---|
| Actions | SCHP | Schindler Participation | 4.4 % |
| Actions | PG | Procter & Gamble | 4.4 % |
| Actions | GD | General Dynamics | 6.3 % |
| Actions | VICI | VICI Properties | 6.3 % |
| Actions | CS | AXA SA (Trading 212 ticker) | 4.5 % |
| Actions | SUNPHARMA | Sun Pharmaceutical | 4.5 % |
| Actions | KO | Coca-Cola | 4.5 % |
| ETF | ACWV | iShares MSCI Global Min Vol | 4.4 % |
| ETF | SPLV | Invesco S&P 500 Low Vol | 4.6 % |
| ETF | SPYV | SPDR Portfolio S&P 500 Value | 4.5 % |
| ETF | XLV | Healthcare SPDR | 3.0 % |
| ETF | GLD | SPDR Gold | 4.0 % |
| Bonds | VGSH | Vanguard Short Treasury | 11.9 % |
| Bonds | CLTL | Invesco Treasury Collateral | 10.6 % |
| Bonds | BSV | Vanguard Short-Term Bond | 8.0 % |
| Bonds | STIP | 0-5Y TIPS | 14.1 % |

### 11.3 Agrégats

| Critère | Valeur |
|---|---|
| Actions | 35 % |
| ETF | 20 % |
| Bonds | 45 % |
| Sector diversification | Healthcare, Industrials, Consumer Staples, Insurance, Defense, REIT, Energy |
| ETF low_vol overlap | ACWV 4.4 % + SPLV 4.6 % = 9 % en factor low vol (overlap holdings ~30 %) |

### 11.4 Backtest 90j Stable

| Métrique | Stable |
|---|---|
| Net return 90j | -2.74 % |
| CAGR annualisé | -10.2 % |
| Volatility annualisée | 6.03 % (≈ cible !) |
| Max DD | (non extrait) |
| Sharpe (non sig.) | -2.53 |

**Cohérence avec la cible vol** : sur 90j, Stable a livré 6.03 % vol = exactement la cible.
Le drawdown (-10.2 % CAGR) reflète un environnement de marché difficile pour bonds + low vol
sur la fenêtre considérée (rallye risk-on H2 2026).

---

## 12. Snapshot Agressif (workflow `c7bb7af28`)

### 12.1 Métriques

| Mesure | Valeur |
|---|---|
| Vol cible | 24.0 % |
| Vol réalisée affichée | **11.26 %** (cov non fiable) |
| Mode | SLSQP converged |
| Cov trustworthy | **False** |
| Returns coverage | 66.1 % (sous seuil 70 %) |
| n_assets | 16 |

### 12.2 Allocation

| Bucket | Ticker | Nom | Poids |
|---|---|---|---|
| Actions | NVDA | NVIDIA | 6.9 % |
| Actions | 2059 | King Slide Works (TW) | 7.5 % |
| Actions | FSLR | First Solar | 5.5 % |
| Actions | 000660 | SK Hynix (KR) | 9.1 % |
| Actions | GVT&D | GE Vernova T&D India | 5.4 % |
| Actions | BKR | Baker Hughes | 5.3 % |
| ETF | XLK | Tech Select Sector SPDR | 5.0 % |
| ETF | ICLN | iShares Global Clean Energy | 4.9 % |
| ETF | PICK | iShares MSCI Global Metals & Mining | 9.1 % |
| ETF | XCEM | Columbia EM ex-China | 9.0 % |
| ETF | FLKR | Franklin FTSE South Korea | 4.3 % |
| ETF | SOXX | iShares Semiconductor | 6.4 % |
| ETF | GLD | SPDR Gold | 7.3 % |
| ETF | XBI | SPDR S&P Biotech | 3.1 % |
| Bonds | FLTR | VanEck IG Floating Rate | 5.6 % |
| Bonds | PAAA | PGIM AAA CLO | 5.6 % |

### 12.3 Backtest 90j

| Métrique | Agressif | Benchmark (QQQ) |
|---|---|---|
| Net return 90j | +24.49 % | +20.97 % |
| CAGR (annualisé extrapolé) | +133.77 % | n/a |
| Volatility annualisée | 23.4 % (≈ cible 24) | 18.84 % |
| Max DD | -9.05 % | n/a |
| Excess return | +3.52 % | 0.00 % |
| Information Ratio | 0.97 | n/a |
| Beta | 0.99 | 1.00 |
| Alpha | +3.80 % | 0.00 % |
| Upside capture | 106.9 % | 100 % |
| Downside capture | 101.5 % | 100 % |

**Lecture** : Agressif a délivré sur 90j ! Beta 0.99 vs QQQ, alpha +3.8 %, IR 0.97.
La vol réelle backtest 23.4 % converge avec la cible 24 %, contre l'affichage 11.26 %
qui était basé sur cov non fiable.

---

## 13. Historique récent des optimisations (semaine du 2026-05-25)

### 13.1 Timeline

| Date | Phase | Commit | Effet mesurable |
|---|---|---|---|
| Avant 2026-05-28 | (baseline) | — | Modéré vol 18.91 % (cov non fiable), ETF redondants, BUZZI/KLEPIERRE dans Modéré, backtest cassé depuis 5 mars |
| 2026-05-28 | Phase 1 (turnover wiring) | `ee5cc99c7` | Câblage `prev_weights` 3 builders, suppression `_clip_turnover`, bump `turnover_penalty` ×20 |
| 2026-05-28 | Phase 1.5 (fallback turnover) | (incl.) | Helper `_blend_to_max_turnover` + remap ticker→id (Asset.id ≠ ticker) |
| 2026-05-28 | Phase 2-B4 | `5ec61fa0a` | `_enforce_final_turnover()` post-cascade, garde-fou avant écriture |
| 2026-05-28 | Phase 2-I2 | `4a35f7b34` | Modéré `bonds_max` 40 → 50 (fenêtre trop étroite) |
| 2026-05-29 | Phase Allocator-1 | `72dbe1484` | UI : plan complet par défaut, mapping UCITS 16→37 |
| 2026-05-29 | Phase Sélection-1 | `662f24aef` | Hard gate liquidité par profil + COV GATE + recalibrage Modéré (mom 28→18, low_vol 15→22, qual 25→30) |
| 2026-05-29 | Dedup Schindler | `81b6439ef` | DUAL_LISTING_TICKERS `SCHN: [SCHP]` |
| 2026-05-29 | Cov diag propagation | `6e9252a4a` | Exposer `covariance_trustworthy`, `returns_coverage_pct` dans `_optimization` |
| 2026-05-29 | Fix backtest ticker_resolver | `44c5d7814` | `get_resolver()` singleton dans `run_backtest_*` (était cassé depuis 5 mars) |
| 2026-05-29 | AXA override + COV seuil 80→70 | `6e812968d` | `MANUAL_OVERRIDES` dans TickerResolver + adjustment seuil |
| 2026-05-29 | Recalibrage Modéré v2 | `95e8e43d4` | mom 18→22, low_vol 22→18 (corrigeait surcompensation) |

### 13.2 Bilan quantitatif Modéré

| Étape | momentum | low_vol | Vol réalisée | Mode |
|---|---|---|---|---|
| Avant | 0.28 | 0.15 | 18.91 % | FALLBACK SLSQP FAILED |
| Sél-1 | 0.18 | 0.22 | 7.21 % | SLSQP converged |
| Sél-1.2 | 0.22 | 0.18 | 6.75 % | SLSQP converged |

L'écart vs cible 12 % persiste : -5.25 pp. Le **levier factor weights atteint sa limite**.

---

## 14. Issues connues / non corrigés

### 14.1 Bloquants méthodologiques

| ID | Issue | Impact mesuré |
|---|---|---|
| M-1 | **Look-through holdings ETF absent** : SCHD+DIVB overlap 50-70% non détecté | 20.5 % de l'alloc Modéré en US dividend factor redondant |
| M-2 | **Pas de cap factor exposure** : rien n'empêche 3 ETF "value-tilted US large" en parallèle | Diversification illusoire |
| M-3 | **Pas de quota broad ETF** : aucun min de VTI/VXUS/AGG type forcé | Optimizer ne fait pas naturellement de "core" |
| M-4 | **Rescaling [40, 72] hardcoded** : limite alloc ETF mais ne résout pas la redondance intra-ETF | Sous-allocation ETF parfois (~30%) |
| M-5 | **Tilt RADAR ±15 %** peut compenser 2 grades de qualité fondamentale | Risque de forçage tactique vs fondamentaux |

### 14.2 Importants

| ID | Issue | Impact |
|---|---|---|
| I-1 | **Agressif cov coverage 66 %** sous seuil 70 — EM/Asia sans 5y history | Vol affichée 11.26% non fiable (vraie ~23 % backtest) |
| I-2 | **Asymétrie vol penalty** : Agressif λ=2.5 < Modéré λ=10. Justifié par A/B test v7.2.1 (+3 % Sharpe) | Cohérent mais à challenger |
| I-3 | **PROFILES vs PROFILES_EUUS drift** : Modéré bonds_min EU/US=15 vs global=22 | Intentionnel ? À documenter |
| I-4 | **`max_assets = 18`** : géométriquement, avec max_single=10% on a déjà 10 positions mini → 18 est upper bound peu contraignant | OK mais paramètre flou |
| I-5 | **Pas de Piotroski / Profitability / Accruals factors** | Manque versus literature AQR/Fama-French |

### 14.3 Risques techniques

| ID | Issue | Impact |
|---|---|---|
| T-1 | **Cache price_loader non persisté** entre workflows (gitignore) | Chaque run repaie API calls (TwelveData Ultra absorbe) |
| T-2 | **Pas de stress test régime baissier** dans le pipeline | Sharpe / vol estimés sur 5y bull-biased |
| T-3 | **Survivorship bias non corrigé** dans l'univers source | Bias backtest positif |

---

## 15. Questions ouvertes pour l'expert (priorité décroissante)

### Q1 — Vol target Modéré

**Contexte** : le marché 2026 a un risk-free rate ~4.5 %. Un balanced classique tient ~10-12 % vol.
La cible 12 % était calibrée sur 2024 (vol structurelle plus basse) ; aujourd'hui Modéré
livre 6.75 % vs cible 12 %.

**Question** :
- Est-ce que la **cible 12 %** est encore pertinente, ou faut-il la baisser à 9-10 % pour
  matcher un Balanced 2026 réaliste ?
- Si on garde 12 %, quel est le **levier le plus impactant** pour y arriver
  (cf. options A/B/C ci-dessous) ?

### Q2 — ETF redondance dividend/fundamental

**Contexte** : SCHD+FNDX+DIVB = 20.5 % du Modéré, overlap holdings 50-70 %. Pas de
look-through holdings dans le pipeline.

**Questions** :
- **Faut-il implémenter look-through holdings** au niveau ETF, ou un simple cap
  `factor_concentration_max = 8-12 %` (par "factor theme" : dividend US, low_vol US,
  fundamental US, etc.) suffirait-il ?
- Est-ce que 20 % en "US large dividend/value factor" est **toujours** redondant,
  ou la diversification de provider (Schwab vs iShares vs Vanguard) apporte un bénéfice
  marginal (différence d'index, écart de méthodologie de rebalancement) ?

### Q3 — Force un "core" broad ETF

**Contexte** : pas de minimum forcé sur des ETF broad-market (VTI, VXUS, AGG).
Conséquence : tous les ETF du Modéré actuel sont factor-tilted, pas core.

**Question** : faut-il enforcer un **min 15-20 % en core ETF non-factor-tilted** ?
Si oui, comment éviter que ce min n'écrase la liberté d'optim (paradoxe contraintes ⇒ rigidité) ?

### Q4 — Liquidity gate calibration

**Contexte** : seuil Modéré 12 B€ market_cap. Élimine BUZZI/KLEPIERRE/ITALGAS (3.5-10.7 B).
Effet de bord : restreint l'univers aux mega-caps majoritairement low-beta.

**Questions** :
- Est-ce que 12 B€ est **trop élevé pour un Balanced** ? Quelle valeur pratiquée dans l'industrie ?
- Faut-il **distinguer market_cap_min par classe** (1 B pour SMid-cap, 5 B pour mid, 25 B pour mega) ?

### Q5 — Asymétrie vol penalty SLSQP

**Contexte** : `λ_vol_above` = {Agressif: 2.5, Modéré: 10.0, Stable: 8.0}.
Note v7.2.1 : "Modéré 3→10 (Sharpe +3%, A/B tested)". Agressif tolère plus de vol au-dessus
de cible, Modéré pénalise fortement.

**Question** : cette asymétrie est-elle justifiée par la **structure de profil**
(Agressif accepte plus de vol pour plus de score, Modéré veut rester sur cible),
ou est-ce un artefact qui rigidifie inutilement Modéré ?

### Q6 — Facteurs académiquement validés manquants

**Question** : parmi les facteurs suivants, lesquels sont **prioritaires à ajouter** pour un
système 2026 ?

1. **Piotroski F-Score** (9 signaux binaires earning quality) — filtre value traps
2. **Profitability Novy-Marx** (gross profit / total assets)
3. **Investment factor** (ΔD/E, capex/assets trend)
4. **Accruals quality** ((NI - CFO) / TA)
5. **Idiosyncratic vol** (résidu CAPM)

### Q7 — Sector concentration

**Contexte** : pas de cap sur **factor exposure agrégée** ; seuls les sector caps individuels
(max_sector = 30-35 %) sont contraints.

**Question** : faut-il ajouter une contrainte du type :
```
Σ w_i × IS_FACTOR(i, "low_vol") ≤ 12 %  ∀ factor theme
```
plutôt qu'un simple cap sectoriel ? Ou est-ce sur-régulation ?

---

## 16. Options de fix actuellement envisagées (à arbitrer)

### Option A — Bonds_min 22 → 17 sur Modéré

- **Effort** : 1 ligne de code, 5 min
- **Impact attendu** : libère 5 pp d'allocation vers actions ou ETF growth → vol +1-1.5 pp
- **Risque** : Modéré pourrait dépasser bonds_min 15 % (toujours conforme), perte d'income et de buffer DD

### Option B — Liquidity gate Modéré 12 → 5 B

- **Effort** : 1 ligne de code, 5 min
- **Impact** : réintroduit mid-caps EU (BUZZI, KLEPIERRE, ITALGAS) → vol +1.5-2 pp
- **Risque** : retour des mid-caps moins liquides ; effort de rebalance accru pour utilisateur retail

### Option C — Look-through ETF holdings + cap factor concentration

- **Effort** : 1.5 j
- **Impact** : casse SCHD+FNDX+DIVB → force VTI / VXUS broad ETF → vol +2-3 pp
- **Risque** : data load holdings (TwelveData ne fournit pas top holdings ETF, nécessite source alternative comme FMP ou direct issuer factsheet)
- **Préféré méthodologiquement** mais le plus coûteux à implémenter

### Option D (combinée) — Phase 5-M5 Piotroski F-Score + Option A

- **Effort** : 1-2 j (Piotroski) + 5 min (bonds_min)
- **Impact** : Piotroski filtre value traps (qualité hausse) ; bonds réduit pour libérer vol
- **Risque** : tuning à faire

---

## 17. Métadonnées système

### 17.1 Diagnostics propagés dans `data/portfolios.json`

```json
{
  "Modéré": {
    "_optimization": {
      "mode": "slsqp",
      "is_heuristic": false,
      "vol_realized": 6.75,
      "vol_target": 12.0,
      "covariance_trustworthy": true,
      "returns_coverage_pct": 83.6,
      "covariance_empirical_weight": 0.85
    },
    "Actions": { /* ticker → display name (with ticker), allocation %, etc. */ },
    "ETF": { /* idem */ },
    "Obligations": { /* idem */ },
    "_tickers": { "VICI": 0.0520, "NOVN": 0.0720, ... },  // poids décimal pour Allocator UI
    "_alternates": { /* candidats runner-up par bucket */ }
  }
}
```

### 17.2 Couverture quality gates (Phase 3 — non encore implémentée)

Le module `quality_gates.py` (7 gates : data_freshness, portfolio_coverage, fallback_rate,
covariance_condition, execution_time, asset_count, weights_sum) **est défini mais jamais
appelé**. Phase 3 (pending) consisterait à câbler `check_quality_gates()` après chaque optim
et stopper sur CRITICAL.

### 17.3 Outils auxiliaires

- **Allocator** (HTML/JS dans `portefeuille.html` + `js/allocator.js`) :
  importe CSV Trading 212, calcule plan d'arbitrage `current → target`, respecte
  préservation MV (no SELL on at_loss), supporte UCITS↔US mapping (37 entrées,
  `data/ticker_mapping_ucits.json`).
- **Allocateur en mode "auto"** depuis Phase Allocator-1 : plan complet par défaut, pas de slider turnover (alpha=1).

---

## 18. Glossaire technique

| Terme | Définition |
|---|---|
| Asset.id | Identifiant interne (`EQ_N` pour stocks, nom complet pour ETF/bonds) |
| `_tickers` | Mapping `{ticker: poids_décimal}` dans le JSON output (utilisé par UI) |
| BUFFETT_PROFILES | Seuils sectorisés ROE/D/E/etc. dans `sector_quality.py` |
| Bucket | Rôle d'asset : CORE / DEFENSIVE / SATELLITE / LOTTERY (préset_meta) |
| CORPORATE_GROUPS | Dedup max 1 stock par conglomérat (Hyundai, Samsung, …) |
| DUAL_LISTING_TICKERS | Dedup dual-class shares (GOOGL/GOOG, BRK.A/BRK.B, SCHN/SCHP, …) |
| empirical_weight | Part de la covariance empirique dans la cov hybride (0.85 par défaut) |
| FORCE_FALLBACK_PROFILES | Profils qui sautent SLSQP et appliquent l'heuristique (Stable) |
| HHI | Herfindahl-Hirschman Index — somme des carrés des poids |
| `_profile_score` | Score composite par profil, normalisé pour SLSQP |
| `prev_weights` | Allocation du run précédent, utilisée pour contrainte turnover |
| RADAR | Système deterministe de tilts macro (favored/avoided sectors) |
| `score_scale` | Multiplicateur du score dans l'objectif SLSQP (3-5 selon profil) |
| `_select_score` | Score utilisé par `select_candidates()` (filtrage avant optim) |
| `vol_target` / `vol_tolerance` | Cible vol annualisée et tolérance ±X% |

---

## 19. Pour aller plus loin

### 19.1 Ce que cet expert review doit produire

L'objectif est d'obtenir un **arbitrage entre les 4 options A/B/C/D**, **assorti d'un
plan d'attaque** pour les facteurs manquants identifiés. Idéalement :

1. **Avis sur la cible vol Modéré** : 12 % toujours pertinent ? Si non, proposer une cible motivée.
2. **Avis sur les 4 ETF dividend redondants** : tolérable ou problème ?
3. **Priorité de fix** entre A/B/C/D (ou combinaison).
4. **Liste ordonnée des facteurs à ajouter** parmi les 5 candidats.
5. **Critique méthodologique générale** : tilts RADAR ±15 %, asymétrie vol penalty, post-processing cascade.

### 19.2 Points secondaires

- **Cov covariance shrinkage** : Ledoit-Wolf appliqué jusqu'à condition_number 10 000. Cible raisonnable ?
- **Backtest 90j seulement** (sur-court pour Sharpe sig.) — faut-il étendre à 1-3 ans ?
- **Quality gate covariance seuil 70 %** : pertinent ? Trop laxiste ?

### 19.3 Liens repo

- Repo public : `https://github.com/Bencode92/stock-analysis-platform`
- Workflow `generate_portfolios.yml` : génération quotidienne
- Allocator UI : `portefeuille.html`
- Documentation diff : voir `git log --oneline` autour des commits cités dans la timeline

---

**Fin du briefing.**
*Auteur : Benoit Comas + Claude Opus 4.7 (assistant)*
*Date de génération : 2026-05-29*
