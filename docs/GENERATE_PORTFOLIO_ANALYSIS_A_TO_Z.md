# Analyse complète du pipeline `generate_portfolios_v4.py` — de A à Z

**Date :** 2026-05-22
**Fichier source :** `generate_portfolios_v4.py` (~7 200 lignes)
**Modules dépendants :** `portfolio_engine/` (optimizer.py, preset_meta.py, factors.py, etc.) + `data/` + `config/`
**Output principal :** `data/portfolios.json` (5 profils : Agressif / Modéré / Stable / Dividende-PEA / Dividende-CTO)
**Durée typique :** 30-60s par run complet (hors LLM/backtest qui peuvent ajouter 2-4 min)

---

## Vue d'ensemble — Architecture en 7 phases

```
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 1 — INITIALISATION & CHARGEMENT DES DONNÉES                    │
│ (lignes 6919 → 2363 dans main + helpers)                             │
│  ─ CONFIG dict (14+ flags)                                           │
│  ─ Load stocks_*.json (US + EU + Asia)                               │
│  ─ Load ETF / Bonds / Crypto                                         │
│  ─ Construct universe (~3000 equities → eq_rows)                     │
│  ─ Enrichissement Buffett                                            │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 2 — CONTEXTE TACTIQUE (RADAR ou GPT)                           │
│  ─ generate_market_context_radar()                                   │
│  ─ Identifie favored/avoided sectors via régimes de marché           │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 3 — BOUCLE PRINCIPALE PAR PROFIL (lignes 2582-4383)            │
│ for profile in [Agressif, Modéré, Stable, Dividende-PEA, -CTO]       │
│   ├─ Filtre pays (PEA/CTO/override)                                  │
│   ├─ Filtre baseline figé (Dividende seulement)                      │
│   ├─ Hard filters PROFILE_POLICY (yield, payout, ROE, FCF, vol...)   │
│   ├─ Buffett gate (per profile threshold)                            │
│   ├─ Scoring composite (multi-factor)                                │
│   ├─ Sector-balanced selection (top N)                               │
│   ├─ Geo-resilience penalty (Stable only)                            │
│   ├─ Select ETF/Bonds/Crypto (skip pour Dividende)                   │
│   ├─ Optimizer (Markowitz max Sharpe sous contraintes)               │
│   ├─ Equal-weight baseline (Dividende only, anti-turnover)           │
│   └─ Post-process : caps, dedup, sector guarantees                   │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 4 — NORMALISATION FRONTEND & SAVE                              │
│  ─ normalize_to_frontend_v1() → Actions/ETF/Obligations/Crypto       │
│  ─ ETF dedup (XLE+VDE+FENY → 1 keeper)                               │
│  ─ Caps multiples (équités 10-11%, ETF 9%, NUCLEAR 15%, crypto)      │
│  ─ Allocation Rules Engine (thematic caps, hedges)                   │
│  ─ Corporate group dedup (CAP + SITE = Capgemini group)              │
│  ─ save_portfolios() → data/portfolios.json + history archive        │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 5 — POST-PROCESS DIVIDENDE & ENRICHISSEMENTS                   │
│  ─ inject_etf_foundation_dividende() v8.x.5                          │
│      Amundi MSCI EU HD 64% + Cash 8% pour PEA                        │
│      SCHD 67% pour CTO                                               │
│  ─ LLM commentary (Claude Sonnet → GPT-4o fallback)                  │
│  ─ Benchmarks injection (SCHD/EEI/IWDA refs)                         │
│  ─ Correlation diagnostics                                           │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 6 — VARIANTES OPTIONNELLES                                     │
│  ─ Portefeuilles EU/US Focus → data/portfolios_euus.json             │
│  ─ Backtest 90j → data/backtest_results.json                         │
│  ─ Stress test (5 scénarios historiques)                             │
│  ─ Risk analysis enrichment (VaR, CVaR, ES)                          │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 7 — CLASSEMENTS SPÉCIALISÉS                                    │
│  ─ Lombard ranking → data/lombard_ranking.json                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 1 — Initialisation & chargement des données

### 1.1 Entry point `main()` (ligne 6919)

Le point d'entrée orchestre les 7 phases. Structure :

```python
def main():
    # Initialisation audit collector + validation deps
    portfolios, assets = build_portfolios_deterministic()  # Phase 3 entière
    save_portfolios(portfolios, assets)                     # Phase 4
    inject_etf_foundation_dividende(...)                    # Phase 5
    # LLM commentary, benchmarks, correlation diagnostics
    if generate_euus_portfolios: build_portfolios_euus()    # Phase 6
    if run_backtest: run_backtest_all_profiles(...)
    if stress_test_enabled: run_stress_test(...)
    if generate_lombard_ranking: generate_lombard()         # Phase 7
```

### 1.2 CONFIG dict (ligne 402)

Le contrôleur central du comportement. **14+ flags critiques** :

| Flag | Valeur défaut | Effet |
|---|---|---|
| `stocks_paths` | `["stocks_us.json", "stocks_europe.json", "stocks_asia.json"]` | Sources d'univers actions |
| `etf_csv` | `data/combined_etfs.csv` | Source ETF |
| `bonds_csv` | `data/bonds.csv` | Source obligations |
| `buffett_mode` | `"soft"` | Enrichissement (pas filtrage absolu) |
| `buffett_min_score_by_profile` | Agressif 50, Modéré 60, Stable 70, Dividende 55 | Seuils Buffett |
| `enable_dividende` | `True` | Active les 2 sous-enveloppes PEA/CTO (v8.x) |
| `force_dividende_rebalance` | `False` | Reset le baseline figé (mode audit) |
| `use_tactical_context` | `True` | Active les tilts sectoriels par RADAR |
| `tactical_mode` | `"radar"` | ML-driven (vs `"gpt"` legacy) |
| `equity_scoring_mode` | `"preset"` | Délègue scoring à preset_meta.py |
| `run_backtest` | True | Lance backtest 90j en fin de pipeline |
| `generate_asset_rationales` | True | Justifications LLM par titre |
| `generate_lombard_ranking` | True | Classement collatéral Lombard |
| `output_path` | `data/portfolios.json` | Cible principale |

### 1.3 Chargement données (lignes 1294-2363)

**Étapes successives** :

| # | Étape | Source | Output |
|---|---|---|---|
| 1 | `load_stocks_data()` ligne 1294 | `stocks_us.json` + `stocks_europe.json` + `stocks_asia.json` (~3 000 équités) | `stocks_data` list |
| 2 | Load ETF CSV ligne 2260 | `data/combined_etfs.csv` via `load_csv_robust()` | `etf_df_master` DataFrame |
| 3 | Load bonds CSV | `data/bonds.csv` | `bonds_data` list |
| 4 | Load crypto CSV | `data/crypto.csv` | `crypto_data` list |
| 5 | Construire `eq_rows` ligne 2298 | Denormalize stocks_data → 25 champs (perf, vol, ROE, quality_score, beta...) | `eq_rows` list |
| 6 | **Apply Buffett enrichment** ligne 2381 | `apply_buffett_filter(eq_rows, mode="soft", min_score=0)` | `_buffett_score` field ajouté |
| 7 | Scoring conditionnel ligne 2413 | Si `equity_scoring_mode != "preset"`: `compute_scores()` | `composite_score` field |
| 8 | **Hard filters initiaux** ligne 2431 | `filter_equities()` retire missing market_cap/sector | `eq_filtered` (~2 100 équités après ~30% rejet) |
| 9 | TickerResolver ligne 2523 | `from_equities()` mappe ticker → MIC, exchange | `_ticker_resolver` (cache) |
| 10 | Build universe_others ligne 2493 | `build_scored_universe()` convertit dicts → Asset objects | `universe_others` (ETF/Bond/Crypto) |

**Failure modes Phase 1** :
- Source JSON manquante → log warning, liste vide retournée
- ETF CSV manquant → liste vide, pipeline continue
- Aucun crash sur cette phase

---

## PHASE 2 — Contexte tactique (RADAR ou GPT)

### 2.1 RADAR market context (lignes 2191-2247)

Si `use_tactical_context=True` et `tactical_mode="radar"` :

```python
market_context = generate_market_context_radar()
# Output:
# {
#   "regime": "growth" | "value" | "neutral" | "stagflation",
#   "macro_tilts": {
#       "favored_sectors": ["Energy", "Healthcare"],
#       "avoided_sectors": ["Real Estate"],
#       "favored_regions": ["US"],
#       "avoided_regions": ["China"]
#   },
#   "sweet_zone_*": ...,
#   "overheat_*": ...
# }
```

Le contexte est ensuite **propagé** dans `select_equities_for_profile()` pour bonifier les titres des secteurs favorisés (+5% score) et pénaliser les évités (-5% à -20%).

### 2.2 Si `tactical_mode="gpt"` (legacy)

Lecture de `brief_ia.json` produit par un workflow LLM séparé. Non-déterministe — déprécié au profit du RADAR.

---

## PHASE 3 — Boucle principale par profil

C'est le **cœur du pipeline**, ligne 2582 à 4383. Pour chaque profil de `_active_profiles(CONFIG)` :

### 3.1 Filtre pays (ligne 2585) — sous-enveloppe fiscale

```python
eq_filtered_for_profile = _apply_envelope_country_filter(eq_filtered, profile)
```

| Profil | Pays autorisés |
|---|---|
| Agressif / Modéré / Stable | Tous (no-op) |
| Dividende-PEA | UE + EEE (sauf UK post-Brexit) + overrides PEA (ACN via siège IE) |
| Dividende-CTO | US + UK + Suisse + Canada + Australie |

**Overrides** : `config/pea_eligibility_overrides.json` force ACN/STM/EXOR en PEA-éligibles via siège fiscal réel.

### 3.2 Filtre baseline figé (ligne 2594) — Dividende uniquement

```python
eq_filtered_for_profile = _apply_dividende_baseline_filter(eq_filtered_for_profile, profile)
```

Si baseline présent (`config/dividende_baseline.json`) ET pas de `force_dividende_rebalance` :
- Restreint l'univers aux tickers du baseline (4 picks PEA + 2 picks CTO actuellement)
- Marque chaque équité `_baseline_protected=True` (bypass hard filters downstream)
- Sauf si **toxicity détectée** : quality<40, payout>100%, dividend_growth<-20% → force rebalance

→ **Garantit turnover ≈ 0** entre runs pour Dividende.

### 3.3 Hard filters & sélection par profil (lignes 2614-2633)

```python
profile_equities, meta = select_equities_for_profile(
    eq_filtered_for_profile, profile, market_context, target_n=250
)
```

Cette fonction (déléguée à `portfolio_engine/preset_meta.py`) :

1. **Applique `PROFILE_POLICY[profile]["hard_filters"]`** : volatility max, ROE min, payout max, FCF min, quality coverage min, dividend_yield range, etc. Avec **`sector_relaxations`** : banques bypass FCF, REITs bypass payout strict.
2. **Buffett gate** : min_buffett_score selon profil
3. **Scoring composite** `score_equity_for_profile()` :
   - Pour Dividende : 18% yield + 17% growth + 32% quality + 5% coverage − 20% pénalité vol/drawdown
   - Pour Agressif : pondération growth/momentum
   - Pour Stable : pondération yield/safety
4. **Relaxation progressive** si trop strict (vol_min descend de 2%, payout monte de 5%, etc.)
5. **RADAR tilts** : multiplie score × bonus/malus sectoriel
6. **Sector-balanced selection** : top N avec cap par secteur

Output : 250 équités candidates, méta complète d'audit.

### 3.4 Geo-resilience penalty (Stable uniquement, lignes 2681-2779)

Pour le profil Stable, pénalité multiplicative sur `_profile_score` :
- Énergie : ×0.95 (risque géopolitique Russie/OPEP)
- Matériaux : ×0.85 (dépendance Chine)
- Tech IT : ×0.92
- Defense bonus : +5%

→ Découle de la philosophie "Stable = anti-fragile".

### 3.5 Sélection ETF / Bonds / Crypto (lignes 2781-2962)

**Dividende-PEA & Dividende-CTO** : **skip entièrement** (100% equity par construction).

Autres profils :
- `select_etfs_for_profile()` : top 100 ETF via scoring preset_etf
- `select_bonds_for_profile()` : 6-15 obligations selon profil (Stable=6, Agressif=15)
- `select_crypto_for_profile()` : 20-30 cryptos (core BTC/ETH, satellites PAXG/alts)

### 3.6 Optimizer Markowitz (ligne 3180)

```python
allocation, diagnostics = optimizer.build_portfolio(assets, profile)
```

Dans `portfolio_engine/optimizer.py`, **PortfolioOptimizer.build_portfolio()** :

1. **Construit le pool** : equities + ETF + bonds + crypto (filtre par catégorie)
2. **Charge la covariance** : Ledoit-Wolf shrinkage + EWMA + PCA fallback (depuis returns_series)
3. **Solve max Sharpe** sous contraintes :
   - `vol_target` ± `vol_tolerance`
   - `max_single_position` (8% Dividende-PEA, 14% Agressif, etc.)
   - `bonds_min`/`bonds_max` (0% pour Dividende, 35% pour Stable)
   - `crypto_max` (0% Dividende, 10% Agressif)
   - `max_sector` (25% Dividende, 35% autres)
   - `turnover_penalty` (0.30-0.50 pour Dividende, 0.10-0.20 sinon)
4. **Fallback** si infaisable : equal-weight ou yield-weighted

Output : `allocation` dict `{asset_id: weight_decimal}` + `diagnostics` (Sharpe, vol réalisée, mode utilisé).

### 3.7 Equal-weight baseline override (lignes 3182-3189) — Dividende only

```python
if profile in _DIVIDENDE_BASELINE_ACTIVE:
    allocation = _equal_weight_baseline(assets, profile)
```

**Remplace** l'output optimizer par equal-weight tilté ±20% par score. Garantit que les baseline tickers ont tous un poids minimum (sinon optimizer peut les zéro-er).

### 3.8 Max country enforcement itératif (Dividende only)

```python
allocation = _enforce_caps_iterative(allocation, assets, profile, max_iter=20)
```

Itère cap_position (8-14%) + cap_country (35% PEA, 65% CTO) jusqu'à convergence. Évite que la France dépasse 35% du PEA (cas où optimizer met 3 lignes FR à 12% chacune).

### 3.9 Post-process allocation (lignes 3205-3282)

- Normalisation décimal → % (sum 1.0 → 100)
- `post_process_allocation()` : prune dust <0.1%, cap PE > 60 à max 6%
- Redistribution des excès au prorata

### 3.10 Sector guarantees post-Markowitz (lignes 3306-3557, v5.3.3)

Si market_context fourni :
- **FAVORED sector guarantee** : si 0% alloué à un secteur favorisé (ex: Énergie), inject le meilleur candidat
- **ESSENTIAL sector guarantee** (Healthcare) : pareil
- **AVOIDED cap** : max 5% par stock AVOIDED

Évite que l'optimizer "oublie" un secteur identifié comme favorable par le RADAR.

---

## PHASE 4 — Normalisation frontend & save

### 4.1 normalize_to_frontend_v1() (ligne 5558)

Convertit l'output technique en **format frontend** :

```json
{
  "Agressif": {
    "Actions": {"NVIDIA CORP (NVDA)": "12.5%", ...},
    "ETF": {"Vanguard FTSE Developed (VEA)": "8%", ...},
    "Obligations": {"iShares Short Treasury (SHV)": "5%", ...},
    "Crypto": {"BTC": "5%", ...},
    "_tickers": {"NVDA": 0.125, "VEA": 0.08, ...},
    "_tickers_meta": {"NVDA": {"category": "Actions", ...}},
    "_numeric_weights": {"Actions:NVIDIA CORP (NVDA)": 12.5, ...},
    "diagnostics": {...}
  },
  ...
}
```

### 4.2 ETF dedup (lignes 6142-6218)

Groupes pré-définis (`_ETF_DEDUP_GROUPS`) :
- `energy_us`: [XLE, VDE, FENY, IYE] → keeper = plus gros AUM
- `us_large_value`: [VTV, SCHV, VONV, IVE, VOOV, RPV, IUSV]
- `gold_physical`: [GLD, IAU, SGOL, AAAU, PHYS, BAR, OUNZ]
- `core_aggregate`: [BND, AGG]

Redistribue les poids des supprimés sur le keeper.

### 4.3 Caps en cascade (lignes 6220-6440)

| Étape | Cap | Itérations max |
|---|---|---|
| Equity cap | Agressif/Stable 10%, Modéré 11% | 5 |
| ETF cap | 9% | 3 |
| **NUCLEAR cap** | **15% absolu** | 5 |
| Crypto cap | Profile-dependent (Agressif 10%, Stable 0%) | jusqu'à conformité |

### 4.4 Allocation Rules Engine (lignes 6442-6550, v5.4.0)

Charge `config/allocation_rules.json` :
- **Thematic caps** : semi ≤15%, AI ≤15%, gold ≤10%, healthcare ≤12%
- **Hedges obligatoires** : gold position si VIX > X, BTC si crypto autorisée
- **Profile replacements** : TTE → IBE pour Stable si vol macro élevée

Utilise APIs market data (Brent, VIX, gold spot) si clés dispo, sinon règles statiques.

### 4.5 Dedup dual-listings & corporate groups

- **DUAL_LISTING_TICKERS** : GOOG↔GOOGL, BRK.A↔BRK.B, HEN↔HEN3 (Henkel ord/pref), VOW↔VOW3
- **CORPORATE_GROUPS** : Capgemini (CAP+SITE+SOPRA via parent), LVMH (Christian Dior+Hennessy), Hyundai (HYUNDAI MOTOR+MOBIS+KIA)

Garde 1 par groupe, merge les poids.

### 4.6 save_portfolios() (ligne 6135)

- `normalize_to_frontend_v1()` → JSON
- Applique toutes les caps & dedup ci-dessus
- Écrit `data/portfolios.json`
- **Archive** : `data/portfolio_history/portfolios_v4_YYYYMMDD_HHMMSS.json` (audit trail)

---

## PHASE 5 — Post-process Dividende & enrichissements

### 5.1 inject_etf_foundation_dividende() — v8.x.5

**Spécifique aux profils Dividende** (post-save). Lit `data/portfolios.json`, modifie en place :

| Profil | Composition injectée |
|---|---|
| Dividende-PEA | Picks scalés à 28% (equal-weight = 7% × 4) + Amundi MSCI EU HD 64% + Cash réserve 8% |
| Dividende-CTO | Picks scalés à 33% (equal-weight = 16.5% × 2) + SCHD 67% |

Le résultat reflète exactement le **plan d'exécution validé expert**. Le frontend `portefeuille.html` affiche alors les 3 sections (Actions + ETF + Cash) au lieu des seuls picks.

### 5.2 LLM commentary (lignes 6969-7051) — v7.4

Pour chaque profil et chaque ticker :
1. Build prompt avec fundamentals + macro context + position dans portefeuille
2. **Claude Sonnet via proxy Cloudflare** (priorité 1)
3. **Fallback OpenAI GPT-4o-mini** si `API_CHAT` env var
4. **Fallback déterministe** (templates par profil) si tout échoue

Injecté dans `_asset_details` du JSON sauvé. **Templates dédiés Dividende** ajoutés (mentions PEA 0% IR + 17.2% PS, CTO PFU 30%/31.4% 2026).

### 5.3 Benchmarks injection

Lit `config/dividend_benchmarks.json`, injecte dans les profils Dividende :
- **CTO** : VIG (Vanguard Dividend Appreciation) primary + NOBL alternative + SCHD income
- **PEA** : EEI WisdomTree EU Equity Income + SXRZ Stoxx 30 alternative
- **Global** : IWDA discipline

Avec **protocole de comparaison** : outperform +2%/5Y net → continue, underperform -2%/5Y → bascule sur ETF.

### 5.4 Correlation diagnostics (lignes 7052-7062) — v7.2.1

Calcule la matrice de corrélation des positions finales. Détecte les clusters > 0.9 (diversification illusoire). Écrit `data/correlation_diagnostics.json`.

---

## PHASE 6 — Variantes optionnelles

### 6.1 build_portfolios_euus() (ligne 7071)

Si `generate_euus_portfolios=True` : refait toute la Phase 3 mais avec :
- Univers filtré à Europe + USA uniquement (pas d'Asie ni d'Émergents)
- Profile constraints `euus_mode=True` (caps régionaux différents)

Output : `data/portfolios_euus.json` (même structure).

### 6.2 Backtest 90 jours (lignes 7092-7106)

Si `run_backtest=True` :
1. Lit le JSON final, extrait `_tickers` par profil
2. Fetch 90 jours de prix via Twelve Data (avec ticker_resolver pour non-US)
3. Simule rebalancement quotidien
4. Calcule NAV, Sharpe, max drawdown, perf cumulée

Output : `data/backtest_results.json` (par profil). Échec sur 1 ticker → backtest entier skippé pour ce profil.

### 6.3 Stress test (lignes 7115-7164)

Si `stress_test.py` disponible :
- 5 scénarios historiques : 2008 crise, 2020 COVID, 2022 rate shock, dot-com 2000, energy crisis 2022
- Worst-case drawdown par profil
- Injecté dans `_stress_test` du JSON

### 6.4 Risk analysis (v5.2.0)

Si `HAS_RISK_ANALYSIS` :
- VaR 95% + 99%
- CVaR (expected shortfall)
- 5 ans de données historiques
- Modèle hybride paramétrique + historique
- Injecté dans `_risk_analysis`

---

## PHASE 7 — Lombard ranking (ligne 7166-7204)

Si `generate_lombard_ranking=True` :
- Sélectionne les meilleures actions à **haut yield + grade de collatéral** pour un emprunt Lombard
- Filtres : market cap > 2 Md€, qualité élevée, yield stable
- Plusieurs scénarios de taux d'emprunt (2%, 2.5%, 3%, 3.5%, 4%)
- Output dédié `data/lombard_ranking.json` (pas dans portfolios.json)

---

## Récapitulatif des outputs produits

| Fichier | Contenu | Phase |
|---|---|---|
| `data/portfolios.json` | 5 profils + meta + commentary | 4 + 5 |
| `data/portfolio_history/portfolios_v4_*.json` | Archive timestamped | 4 |
| `data/portfolios_euus.json` | Variante EU/US Focus | 6.1 |
| `data/backtest_results.json` | Perf 90j par profil | 6.2 |
| `data/backtest_results_euus.json` | Backtest EU/US | 6.2 |
| `data/lombard_ranking.json` | Classement collatéral Lombard | 7 |
| `data/correlation_diagnostics.json` | Matrice de corrélation | 5.4 |
| `data/selection_audit.json` | Audit trail des filtrages | 3 |
| `data/selection_explained.json` | Explications top caps | 3 |
| `data/market_context.json` | RADAR macro tilts | 2 |
| `data/market_intelligence_audit/*.json` | Diagnostics RADAR | 2 |

---

## Points de décision majeurs (les "leviers" du système)

| Levier | Localisation | Effet |
|---|---|---|
| `CONFIG["enable_dividende"]` | ligne 446 | Active/désactive les 2 profils Dividende |
| `CONFIG["force_dividende_rebalance"]` | ligne 451 | Reset le baseline figé (mode audit) |
| `PROFILE_POLICY[profile]["hard_filters"]` | preset_meta.py | Filtres durs par profil |
| `PROFILE_POLICY[profile]["score_weights"]` | preset_meta.py | Pondération scoring composite |
| `PROFILE_POLICY[profile]["sector_relaxations"]` | preset_meta.py | Bypass filters pour banques/REITs |
| `PROFILES[profile]` | optimizer.py | ProfileConstraints (vol_target, caps, turnover_penalty) |
| `PROFILE_WEIGHTS[profile]` | factors.py | Pondération factor scoring legacy |
| `config/dividende_baseline.json` | config/ | Tickers figés Dividende (anti-turnover) |
| `config/pea_eligibility_overrides.json` | config/ | Override PEA (ACN, STM, EXOR) |
| `config/dividend_benchmarks.json` | config/ | Benchmarks VIG/SCHD/EEI/IWDA |
| `config/allocation_rules.json` | config/ | Thematic caps, hedges, replacements |
| `ETF_FOUNDATION_DIVIDENDE` | generate_portfolios_v4.py | Constantes Amundi/SCHD pour injection |
| `DIVIDENDE_MAX_COUNTRY_PCT` | generate_portfolios_v4.py | Cap pays Dividende (35% PEA, 65% CTO) |

---

## Modes d'échec & récupération

| Étape | Échec possible | Comportement |
|---|---|---|
| Load stocks JSON | Fichier manquant | Warning, liste vide, continue |
| Load ETF/Bonds CSV | Fichier manquant | Listes vides, optimizer fonctionne sans |
| Buffett enrichment | Score manquant | Warning, profil utilise score brut |
| Hard filters | Univers vide | Warning, profil sauté ou fallback heuristique |
| Optimizer Markowitz | Contraintes infaisables | Fallback equal-weight, log error |
| Optimizer | Prices manquants (cache vide) | Fallback covariance structurée |
| Backtest | Ticker introuvable | Skip backtest pour profil entier |
| LLM commentary | API timeout | Fallback boilerplate déterministe |
| ETF dedup | Portefeuille vide | No-op |
| Save JSON | Disk full | **CRASH** (rare) |
| Allocation Rules | Config manquante | Warning, skip règles |
| Lombard ranking | Insufficient eligible | Warning, file pas généré |
| Stress test | Module absent | Silent skip |

→ Pipeline **robuste** : 80% des erreurs sont silencieuses et le run produit quand même un output utilisable.

---

## Détection des collisions de tickers (v8.x.5)

Au démarrage de la boucle profile, `_detect_ticker_collisions()` scanne l'univers pour les tickers présents avec **plusieurs (country, MIC)** distincts. Logue tous les cas (19 actuellement détectés : ADM, SAN, RKT, MRK, PRU, DG, TSCO...).

**Sans impact direct** sur le baseline Dividende (aucun ticker en collision dedans), mais alerte au cas où un futur ajout au baseline serait ambigu. La résolution se fait via **clés composites** dans `dividende_baseline.json` (ex: `ADM@XLON` pour Admiral UK, `ADM@XNYS` pour Archer Daniels US).

---

## Le pipeline en chiffres (run typique)

- **3 sources** stocks JSON (~3 000 lignes brutes)
- **1 source** ETF CSV (~1 500 ETFs)
- **1 source** bonds CSV (~300 obligations)
- **1 source** crypto (~50 cryptos)
- **5 profils** itérés en parallèle conceptuel
- **~30 fonctions** majeures appelées
- **6 modules portfolio_engine/** importés (optimizer, preset_meta, factors, market_intelligence, risk_analysis, llm_commentary)
- **3-4 configs** consultés (baseline, overrides, benchmarks, allocation_rules)
- **Output principal** : ~6 000 lignes JSON
- **Durée** : 30-60s (sans LLM/backtest) ou 3-5 min avec

---

## Conclusion — Forces & limites du pipeline

### Forces ✅

1. **Modulaire** : 6 modules portfolio_engine séparés, chacun avec responsabilité claire
2. **Configurable** : 14+ flags CONFIG + 4+ fichiers config/ permettent de tuner sans toucher au code
3. **Robuste** : 80% des erreurs sont silencieuses, pipeline produit un output utilisable même en mode dégradé
4. **Audité** : selection_audit.json + selection_explained.json + portfolio_history archives pour traçabilité
5. **Déterministe** : sur mêmes inputs, mêmes outputs (sauf LLM commentary non-déterministe)
6. **Baseline figé Dividende** : turnover = 0.00% prouvé matériellement
7. **Détection auto des bugs data** : ticker collisions, name mismatches, schema validation

### Limites ⚠️

1. **6661 → 7236 lignes dans un seul fichier** : difficile à maintenir, à splitter en modules
2. **Beaucoup de "if profile == X" hardcodé** : ajouter un 6e profil = ~10 endroits à modifier
3. **Caps en cascade** (5 passes : equity → ETF → nuclear → crypto → rules) : difficile à débugger si conflit
4. **Dépendances externes** : Twelve Data API + Claude Sonnet API pour fonctionner pleinement
5. **Pas de test unitaire** sur les fonctions de scoring (heuristique multi-factor difficile à tester)
6. **LLM commentary non-déterministe** : sort différent à chaque run même avec mêmes inputs
7. **ETF Foundation Dividende hardcodée** dans le code (Amundi MSCI EU HD + SCHD) — pas dans un config externe

### Évolutions possibles (non requises)

- Split `generate_portfolios_v4.py` en 5-7 modules par phase
- Externaliser `ETF_FOUNDATION_DIVIDENDE` dans `config/`
- Tests unitaires sur les fonctions de scoring critiques
- Versioning du baseline dans git (déjà fait via commits) avec changelog automatique

---

*Document généré le 2026-05-22. Source : analyse statique du code (commit `3e2650f3b` sur main) + cartographie pipeline via Explore agent.*
