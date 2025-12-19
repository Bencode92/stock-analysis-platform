# 📊 Scoring & Alpha Model v5 — Architecture et Spécifications

> **Date**: 19 décembre 2025  
> **Auteur**: Audit Expert (ChatGPT o1)  
> **Statut**: Approuvé pour implémentation P1  
> **Prérequis**: Patches P0 complétés

---

## 🎯 Principe Directeur

**Le scoring v5 produit un `scores[ticker]` propre (alpha), et l'allocation reste du ressort de l'optimiseur (SLSQP + contraintes + pénalités).**

On **garde** l'objectif `score − pénalité vol`, et on améliore :
1. **La qualité du score** (multi-factor, robuste, no-leakage)
2. **Les pénalités/contraintes** manquantes (concentration, turnover, alternative_cap)
3. **Les garde-fous** (data coverage, filtres qualité)

---

## 📋 Table des Matières

1. [Étapes d'Implémentation](#étapes-dimplémentation)
2. [Structure de Fichiers](#structure-de-fichiers)
3. [Spécifications par Étape](#spécifications-par-étape)
4. [Code Squelette](#code-squelette)
5. [Intégration Pipeline](#intégration-pipeline)
6. [Décisions à Trancher](#décisions-à-trancher)
7. [Tests Obligatoires](#tests-obligatoires)

---

## 🚀 Étapes d'Implémentation

| # | Étape | Livrable | Effort | Dépendances |
|---|-------|----------|--------|-------------|
| 1 | Data Contract | `instrument_master.json` + schéma features | 4h | - |
| 2 | Filtres Qualité | `quality_filters.py` | 3h | Étape 1 |
| 3 | Feature Engineering | `features_prices.py` + `features_fundamentals.py` | 4h | Étape 1 |
| 4 | Normalisation Robuste | `transforms.py` | 2h | - |
| 5 | Score Composite v5 | `scoring_v5.py` | 4h | Étapes 3, 4 |
| 6 | Coverage Penalty | `coverage.py` | 1h | - |
| 7 | Intégration Optimiseur | Modification `optimizer.py` | 2h | P0 complété |
| 8 | Tests | `tests/test_scoring.py` | 4h | Toutes |

**Total estimé**: ~24h de développement

---

## 📁 Structure de Fichiers

```
portfolio_engine/
├── scoring/
│   ├── __init__.py
│   ├── config.py              # Configuration pondérations par profil
│   ├── quality_filters.py     # Filtres pré-scoring avec traçabilité
│   ├── features_prices.py     # Features calculées sur prix (momentum, vol, DD)
│   ├── features_fundamentals.py  # Features fondamentales (ROIC, FCF, PEG)
│   ├── transforms.py          # Winsorize + z-score + to_0_100
│   ├── coverage.py            # Calcul et pénalité coverage
│   ├── scoring_v5.py          # Score composite final
│   ├── schema.py              # Schéma de données attendu
│   └── tests/
│       ├── test_transforms.py
│       ├── test_filters.py
│       └── test_scoring.py
├── optimizer.py               # Utilise scores_z de scoring_v5
└── constraint_oracle.py       # Recalcul indépendant
```

---

## 📝 Spécifications par Étape

### Étape 1 — Data Contract (BLOQUANT)

**But**: Arrêter les "données manquantes = 50 neutre"

**Livrable**: `instrument_master.json`

```json
{
  "schema_version": "1.0",
  "assets": {
    "AAPL": {
      "ticker": "AAPL",
      "isin": "US0378331005",
      "asset_class": "stock",
      "currency": "USD",
      "country": "US",
      "region": "North America",
      "sector": "Technology",
      "industry": "Consumer Electronics",
      "risk_bucket": "equity_like",
      "market_cap_usd": 3000000000000,
      "avg_daily_volume": 50000000,
      "data_quality": {
        "price_available": true,
        "fundamentals_available": true,
        "last_fundamental_date": "2024-10-31",
        "coverage_ratio": 0.95
      }
    }
  }
}
```

**Checklist**:
- [ ] `ticker`, `asset_class` (stock/etf/bond_etf/crypto)
- [ ] `currency`, `country/region`, `sector`
- [ ] `risk_bucket` (equity_like/bond_like/alternative/crypto)
- [ ] Timestamps "as-of" (date prix, date fondamentaux)
- [ ] `coverage_ratio` (0–1) calculé et loggé

**⚠️ Hypothèse fragile #1**: Tu as réellement les dates de publication des fondamentaux. Sinon, risque de leakage.

---

### Étape 2 — Filtres Qualité (pré-scoring)

**But**: Filtrer avec traçabilité (pourquoi exclu)

**Livrable**: `quality_filters.py`

```python
@dataclass
class FilterResult:
    eligible: List[str]           # Tickers éligibles
    rejected: Dict[str, str]      # {ticker: reason}
    warnings: Dict[str, str]      # {ticker: warning}

def apply_quality_filters(
    universe: pd.DataFrame,
    config: Dict[str, Any]
) -> FilterResult:
    """
    Filtres par asset class:
    - stocks: market_cap_min, volume_min, data coverage
    - ETFs: AUM_min, leverage==1, TER disponible
    - bond_ETFs: duration/credit disponibles
    - crypto: tier1, historique min, vol < seuil
    """
```

**Règles par Asset Class**:

| Asset Class | Filtre | Valeur Défaut | Configurable |
|-------------|--------|---------------|--------------|
| **Stocks** | market_cap_min | $100M | ✅ |
| **Stocks** | avg_volume_min | $1M/jour | ✅ |
| **Stocks** | vol_data_required | true | ✅ |
| **ETFs** | AUM_min | $50M | ✅ |
| **ETFs** | leverage_max | 1x | ✅ |
| **ETFs** | TER_required | true | ✅ |
| **Bond ETFs** | duration_required | true | ✅ |
| **Crypto** | tier | 1 (BTC/ETH/SOL) | ✅ |
| **Crypto** | vol_max | 150% | ✅ |

**Point critique**: Filtres **config-driven**, pas hardcodés.

---

### Étape 3 — Feature Engineering "as-of"

**But**: Calculer momentum/vol/DD à partir des séries de prix jusqu'à date t, pas "aujourd'hui"

**Livrables**: `features_prices.py` + `features_fundamentals.py`

#### features_prices.py

```python
def compute_price_features(
    prices: pd.DataFrame,      # index=date, columns=tickers
    as_of_date: pd.Timestamp,
    lookbacks: Dict[str, int]  # {"1m": 21, "3m": 63, "12m": 252}
) -> pd.DataFrame:
    """
    Returns DataFrame avec colonnes:
    - mom_1m, mom_3m, mom_12m (returns cumulés)
    - vol_1y, vol_3y (annualisés)
    - max_dd_1y, max_dd_3y
    - sharpe_1y (si risk-free disponible)
    """
```

**Règles anti-leakage**:
- Utiliser uniquement `prices[:as_of_date]`
- Pas de forward-fill au-delà de 3 jours
- Logger les dates effectives utilisées

#### features_fundamentals.py

```python
def compute_fundamental_features(
    fundamentals: pd.DataFrame,  # Avec colonne 'report_date'
    as_of_date: pd.Timestamp
) -> pd.DataFrame:
    """
    Returns DataFrame avec colonnes:
    - roic, fcf_yield, peg, pe_ratio
    - revenue_growth_3y, earnings_growth_3y
    - debt_to_equity, interest_coverage
    
    RÈGLE: Utiliser le dernier report CONNU à as_of_date
    """
```

**⚠️ Hypothèse fragile #2**: Tes champs `perf_1y`, `YTD`, `max_drawdown_3y` sont déjà as-of. Si non → paper alpha.

---

### Étape 4 — Normalisation Robuste

**But**: Éviter les mappings "PEG=3 → 0" qui cassent selon secteur/régime

**Livrable**: `transforms.py`

```python
def winsorize(s: pd.Series, lo: float = 0.01, hi: float = 0.99) -> pd.Series:
    """Clip aux percentiles lo/hi pour robustesse aux outliers"""
    if s.dropna().empty:
        return s
    ql, qh = s.quantile(lo), s.quantile(hi)
    return s.clip(ql, qh)

def zscore(s: pd.Series) -> pd.Series:
    """Z-score cross-section (mean=0, std=1)"""
    s = s.astype(float)
    mu, sig = s.mean(), s.std(ddof=0)
    return (s - mu) / (sig + 1e-12)

def to_0_100(z: pd.Series) -> pd.Series:
    """Sigmoïde douce vers échelle 0-100 (audit-friendly)"""
    return (100.0 / (1.0 + np.exp(-z))).clip(0, 100)

def normalize_feature(
    s: pd.Series,
    method: str = "zscore",  # "zscore", "percentile", "minmax"
    winsorize_pct: Tuple[float, float] = (0.01, 0.99)
) -> pd.Series:
    """Pipeline complet: winsorize → normalize"""
    s_win = winsorize(s, *winsorize_pct)
    
    if method == "zscore":
        return zscore(s_win)
    elif method == "percentile":
        return s_win.rank(pct=True)
    elif method == "minmax":
        return (s_win - s_win.min()) / (s_win.max() - s_win.min() + 1e-12)
    else:
        raise ValueError(f"Unknown method: {method}")
```

---

### Étape 5 — Score Composite v5

**But**: Pondérer par profil sans mélanger métriques non comparables

**Livrable**: `scoring_v5.py`

#### Configuration par Profil

```yaml
# config/scoring_config.yaml
profiles:
  Agressif:
    stocks:
      quality: 0.25
      value: 0.15
      momentum: 0.45
      risk: 0.15
    etfs:
      cost: 0.30
      liquidity: 0.25
      momentum: 0.30
      tracking: 0.15
    bonds:
      yield: 0.35
      duration: 0.25
      credit: 0.25
      cost: 0.15
  
  Modéré:
    stocks:
      quality: 0.35
      value: 0.25
      momentum: 0.25
      risk: 0.15
    # ...
  
  Stable:
    stocks:
      quality: 0.40
      value: 0.30
      momentum: 0.10
      risk: 0.20
    # ...
```

#### Score par Asset Class

**Stocks**:
- Quality: ROIC, FCF Yield
- Value: PEG (inversé), P/E (inversé)
- Momentum: mom_3m, mom_12m
- Risk: vol_1y (inversé), max_dd_1y (inversé)

**ETFs Equity-like**:
- Cost: TER (inversé)
- Liquidity: AUM, volume
- Momentum: mom_3m
- Tracking: tracking_error (inversé)

**Bond ETFs**:
- Yield: yield_to_maturity
- Duration: duration (ajusté au profil)
- Credit: credit_quality score
- Cost: TER (inversé)

**Crypto** (si activé):
- Momentum: mom_1m, mom_3m
- Risk: vol_1m (inversé)
- Quality: tier, market_cap

**⚠️ Hypothèse fragile #3**: Tu veux intégrer "risk" dans le score alors que tu pénalises déjà la vol en optimisation → risque de double comptage. **Recommandation**: Risk léger (0.15) ou zéro dans le score.

---

### Étape 6 — Coverage Penalty

**But**: Un actif incomplet doit être pénalisé mécaniquement

**Livrable**: `coverage.py`

```python
def compute_coverage(feature_df: pd.DataFrame) -> pd.Series:
    """
    Ratio de features non-nulles par ticker
    Returns: Series index=ticker, values in [0, 1]
    """
    return (1.0 - feature_df.isna().mean(axis=1)).clip(0, 1)

def apply_coverage_penalty(
    score_z: pd.Series,
    coverage: pd.Series,
    min_multiplier: float = 0.5
) -> pd.Series:
    """
    score_final = score * (min_mult + (1-min_mult) * coverage)
    
    Exemples:
    - coverage=0 → score × 0.5
    - coverage=0.5 → score × 0.75
    - coverage=1 → score × 1.0
    """
    multiplier = min_multiplier + (1 - min_multiplier) * coverage
    return score_z * multiplier
```

**Règle audit-friendly**: Pénalité explicite et configurable, pas de "50 neutre" implicite.

---

### Étape 7 — Intégration Optimiseur

**But**: L'optimiseur prend `scores[ticker]` et optimise sous contraintes

**À NE PAS FAIRE**: Créer un `compute_final_weights()` heuristique qui bypass SLSQP.

**À FAIRE côté optimiseur** (déjà dans patches P0/P1):
- Pénalité HHI dans l'objectif
- Pénalité turnover active
- `alternative_cap` comme vraie contrainte SLSQP

```python
# Dans optimizer.py
def optimize_portfolio_v2(
    scores_z: pd.Series,        # Depuis scoring_v5
    cov: np.ndarray,
    profile: ProfileConstraints,
    asset_metadata: List[Dict],
    w_prev: Optional[np.ndarray] = None
) -> OptimizationResult:
    """
    Utilise scores_z (PAS scores_0_100) dans l'objectif
    """
    scores = scores_z.values
    
    def objective(w):
        return objective_v2(
            w, scores, cov, 
            vol_target=profile.vol_target/100,
            w_prev=w_prev
        )
    
    # ... SLSQP avec contraintes v2
```

---

## 💻 Code Squelette

### scoring_v5.py (complet)

```python
"""
Portfolio Engine - Scoring v5
Multi-factor scoring robuste et auditable
"""

from dataclasses import dataclass
from typing import Dict, Any, Tuple, List, Optional
import numpy as np
import pandas as pd


@dataclass(frozen=True)
class ScoreOutput:
    """Résultat du scoring v5"""
    scores_z: pd.Series                     # Z-scores (pour optimiseur)
    scores_0_100: pd.Series                 # Scores UI (0-100)
    breakdown: Dict[str, Dict[str, float]]  # ticker -> factor -> contribution
    coverage: pd.Series                     # Coverage ratio par ticker
    rejected: Dict[str, str]                # ticker -> rejection reason


def winsorize(s: pd.Series, lo: float = 0.01, hi: float = 0.99) -> pd.Series:
    """Clip aux percentiles pour robustesse outliers"""
    if s.dropna().empty:
        return s
    ql, qh = s.quantile(lo), s.quantile(hi)
    return s.clip(ql, qh)


def zscore(s: pd.Series) -> pd.Series:
    """Z-score cross-section"""
    s = s.astype(float)
    mu, sig = s.mean(), s.std(ddof=0)
    return (s - mu) / (sig + 1e-12)


def to_0_100(z: pd.Series) -> pd.Series:
    """Sigmoïde douce vers 0-100"""
    return (100.0 / (1.0 + np.exp(-z.clip(-10, 10)))).clip(0, 100)


def compute_coverage(feature_df: pd.DataFrame) -> pd.Series:
    """Ratio de features non-nulles"""
    return (1.0 - feature_df.isna().mean(axis=1)).clip(0, 1)


def apply_coverage_penalty(
    score_z: pd.Series, 
    coverage: pd.Series,
    min_mult: float = 0.5
) -> pd.Series:
    """Pénalise les actifs avec données manquantes"""
    mult = min_mult + (1 - min_mult) * coverage
    return score_z * mult


def normalize_and_weight(
    features: pd.DataFrame,
    feature_weights: Dict[str, Tuple[str, float]]  # {factor: (column, weight)}
) -> Tuple[pd.Series, Dict[str, pd.Series]]:
    """
    Normalise chaque feature et calcule le score pondéré
    
    Args:
        features: DataFrame avec colonnes de features
        feature_weights: {factor_name: (column_name, weight)}
                        weight > 0 = higher is better
                        weight < 0 = lower is better
    
    Returns:
        (score_z, contributions_by_factor)
    """
    contributions = {}
    total_weight = sum(abs(w) for _, w in feature_weights.values())
    
    score = pd.Series(0.0, index=features.index)
    
    for factor, (col, weight) in feature_weights.items():
        if col not in features.columns:
            contributions[factor] = pd.Series(0.0, index=features.index)
            continue
        
        # Normalize
        z = zscore(winsorize(features[col]))
        
        # Direction: positive weight = higher is better
        # Si weight négatif, on inverse (lower is better)
        if weight < 0:
            z = -z
            weight = abs(weight)
        
        # Contribution normalisée
        contrib = z * (weight / total_weight)
        contributions[factor] = contrib
        score += contrib
    
    return score, contributions


def score_stocks(
    features: pd.DataFrame,
    weights: Dict[str, float]
) -> Tuple[pd.Series, Dict[str, Dict[str, float]]]:
    """
    Score pour actions
    
    Features attendues: roic, fcf_yield, peg, pe_ratio, 
                       mom_3m, mom_12m, vol_1y, max_dd_1y
    """
    feature_weights = {
        # Quality (higher is better)
        "quality_roic": ("roic", weights.get("quality", 0.3) * 0.6),
        "quality_fcf": ("fcf_yield", weights.get("quality", 0.3) * 0.4),
        # Value (lower PEG/PE is better → negative weight)
        "value_peg": ("peg", -weights.get("value", 0.2) * 0.6),
        "value_pe": ("pe_ratio", -weights.get("value", 0.2) * 0.4),
        # Momentum (higher is better)
        "mom_3m": ("mom_3m", weights.get("momentum", 0.3) * 0.5),
        "mom_12m": ("mom_12m", weights.get("momentum", 0.3) * 0.5),
        # Risk (lower vol/DD is better → negative weight)
        "risk_vol": ("vol_1y", -weights.get("risk", 0.2) * 0.5),
        "risk_dd": ("max_dd_1y", -weights.get("risk", 0.2) * 0.5),
    }
    
    score_z, contribs = normalize_and_weight(features, feature_weights)
    
    # Build breakdown dict
    breakdown = {}
    for ticker in features.index:
        breakdown[ticker] = {
            factor: float(contrib.loc[ticker]) 
            for factor, contrib in contribs.items()
        }
    
    return score_z, breakdown


def score_etfs(
    features: pd.DataFrame,
    weights: Dict[str, float]
) -> Tuple[pd.Series, Dict[str, Dict[str, float]]]:
    """
    Score pour ETFs equity-like
    
    Features attendues: ter, aum, volume, mom_3m, tracking_error
    """
    feature_weights = {
        # Cost (lower TER is better)
        "cost_ter": ("ter", -weights.get("cost", 0.3)),
        # Liquidity (higher is better)
        "liq_aum": ("aum", weights.get("liquidity", 0.25) * 0.6),
        "liq_volume": ("volume", weights.get("liquidity", 0.25) * 0.4),
        # Momentum
        "mom_3m": ("mom_3m", weights.get("momentum", 0.3)),
        # Tracking (lower is better)
        "tracking": ("tracking_error", -weights.get("tracking", 0.15)),
    }
    
    score_z, contribs = normalize_and_weight(features, feature_weights)
    
    breakdown = {}
    for ticker in features.index:
        breakdown[ticker] = {
            factor: float(contrib.loc[ticker])
            for factor, contrib in contribs.items()
        }
    
    return score_z, breakdown


def score_bonds(
    features: pd.DataFrame,
    weights: Dict[str, float],
    profile_duration_target: Optional[float] = None
) -> Tuple[pd.Series, Dict[str, Dict[str, float]]]:
    """
    Score pour Bond ETFs
    
    Features attendues: ytm, duration, credit_score, ter
    """
    feature_weights = {
        # Yield (higher is better)
        "yield": ("ytm", weights.get("yield", 0.35)),
        # Duration (depends on profile - simplified: lower for Stable)
        "duration": ("duration", -weights.get("duration", 0.25) if profile_duration_target else 0),
        # Credit (higher score is better)
        "credit": ("credit_score", weights.get("credit", 0.25)),
        # Cost (lower is better)
        "cost": ("ter", -weights.get("cost", 0.15)),
    }
    
    score_z, contribs = normalize_and_weight(features, feature_weights)
    
    breakdown = {}
    for ticker in features.index:
        breakdown[ticker] = {
            factor: float(contrib.loc[ticker])
            for factor, contrib in contribs.items()
        }
    
    return score_z, breakdown


def compute_scores_v5(
    universe: pd.DataFrame,     # index=ticker, cols: asset_class, sector, etc.
    features: pd.DataFrame,     # index=ticker, cols: engineered features
    profile: str,
    config: Dict[str, Any],
) -> ScoreOutput:
    """
    Point d'entrée principal du scoring v5
    
    Args:
        universe: Métadonnées des actifs
        features: Features calculées (as-of date)
        profile: "Agressif", "Modéré", "Stable"
        config: Configuration avec pondérations par profil
    
    Returns:
        ScoreOutput avec scores, breakdown, coverage, rejected
    """
    rejected: Dict[str, str] = {}
    eligible = universe.index.tolist()
    
    # 1) Apply quality filters (stub - implement in quality_filters.py)
    # rejected[ticker] = "reason"
    # eligible = [t for t in eligible if t not in rejected]
    
    u = universe.loc[eligible]
    f = features.loc[eligible].copy()
    
    # 2) Compute coverage
    coverage = compute_coverage(f)
    
    # 3) Initialize scores
    scores_z = pd.Series(0.0, index=eligible, dtype=float)
    breakdown: Dict[str, Dict[str, float]] = {t: {} for t in eligible}
    
    profile_config = config.get("profiles", {}).get(profile, {})
    
    # 4) Score by asset class
    for asset_class in ["stock", "etf", "bond_etf", "crypto"]:
        mask = u["asset_class"] == asset_class
        tickers = u[mask].index.tolist()
        
        if not tickers:
            continue
        
        f_subset = f.loc[tickers]
        weights = profile_config.get(f"{asset_class}s", {})
        
        if asset_class == "stock":
            s_z, bd = score_stocks(f_subset, weights)
        elif asset_class == "etf":
            s_z, bd = score_etfs(f_subset, weights)
        elif asset_class == "bond_etf":
            s_z, bd = score_bonds(f_subset, weights)
        else:
            # Crypto or other - simplified
            s_z = pd.Series(0.0, index=tickers)
            bd = {t: {} for t in tickers}
        
        scores_z.loc[tickers] = s_z
        for t in tickers:
            breakdown[t].update(bd.get(t, {}))
    
    # 5) Apply coverage penalty
    scores_z_adj = apply_coverage_penalty(scores_z, coverage)
    
    # 6) Convert to 0-100 for UI
    scores_0_100 = to_0_100(scores_z_adj)
    
    return ScoreOutput(
        scores_z=scores_z_adj,
        scores_0_100=scores_0_100,
        breakdown=breakdown,
        coverage=coverage,
        rejected=rejected,
    )
```

---

## 🔄 Intégration Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    PIPELINE COMPLET v7                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. DATA LOADING                                                │
│     └── instrument_master.json                                  │
│     └── prices (as-of date t)                                   │
│     └── fundamentals (lagged)                                   │
│                                                                 │
│  2. FEATURE ENGINEERING                                         │
│     └── features_prices.py → mom, vol, dd                       │
│     └── features_fundamentals.py → roic, fcf, peg               │
│                                                                 │
│  3. QUALITY FILTERS                                             │
│     └── quality_filters.py → eligible, rejected                 │
│                                                                 │
│  4. SCORING v5                                                  │
│     └── scoring_v5.py → scores_z, scores_0_100, breakdown       │
│                                                                 │
│  5. OPTIMIZATION                                                │
│     └── optimizer.py (objective_v2 avec scores_z)               │
│     └── constraints_v2 (bonds, crypto, vol, alternatives)       │
│                                                                 │
│  6. CONSTRAINT ORACLE                                           │
│     └── constraint_oracle.py → recalcul indépendant             │
│                                                                 │
│  7. GATING                                                      │
│     └── apply_gating_policy() → PASS/WARN/REJECT                │
│                                                                 │
│  8. EXPORT                                                      │
│     └── portfolios.json (avec hyperparams, breakdown, coverage) │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚖️ Décisions à Trancher

### 1. Risk dans le score: OUI ou NON?

| Option | Avantage | Inconvénient |
|--------|----------|--------------|
| **OUI (léger 0.15)** | Favorise les actifs stables | Double comptage avec pénalité vol |
| **NON (0.0)** | Séparation alpha/risk | Moins de contrôle sur le risque individuel |

**Recommandation**: **Léger (0.15)** tant que pas de pénalité concentration/turnover active.

### 2. ETFs expositions sector/country: source fiable?

| Situation | Action |
|-----------|--------|
| **Source fiable** | Pénaliser concentration cachée |
| **Source absente/incomplète** | Ne pas pénaliser (ou WARN seulement) |

**Recommandation**: Commencer sans, ajouter plus tard avec source vérifiée.

---

## 🧪 Tests Obligatoires

### Unit Tests

```python
# tests/test_scoring.py

def test_winsorize_outliers():
    """Outliers sont clippés"""
    s = pd.Series([1, 2, 3, 100])  # 100 est outlier
    result = winsorize(s, 0.01, 0.99)
    assert result.max() < 100

def test_zscore_mean_zero():
    """Z-score a mean=0, std=1"""
    s = pd.Series([1, 2, 3, 4, 5])
    z = zscore(s)
    assert abs(z.mean()) < 1e-10
    assert abs(z.std() - 1) < 0.1

def test_coverage_penalty():
    """Coverage 0.5 → multiplier 0.75"""
    score = pd.Series([1.0])
    coverage = pd.Series([0.5])
    result = apply_coverage_penalty(score, coverage, min_mult=0.5)
    assert abs(result.iloc[0] - 0.75) < 1e-10

def test_score_monotonicity_ter():
    """TER plus bas → score ETF plus haut"""
    features = pd.DataFrame({
        "ter": [0.10, 0.50, 0.20],
        "aum": [1e9, 1e9, 1e9],
        "volume": [1e6, 1e6, 1e6],
        "mom_3m": [0.05, 0.05, 0.05],
    }, index=["ETF_A", "ETF_B", "ETF_C"])
    
    weights = {"cost": 0.5, "liquidity": 0.25, "momentum": 0.25}
    scores, _ = score_etfs(features, weights)
    
    # ETF_A (TER 0.10) > ETF_C (TER 0.20) > ETF_B (TER 0.50)
    assert scores["ETF_A"] > scores["ETF_C"]
    assert scores["ETF_C"] > scores["ETF_B"]
```

### Integration Tests

```python
def test_full_pipeline_deterministic():
    """Pipeline complet sur univers figé → résultats déterministes"""
    # Charger données de test
    # Exécuter scoring_v5
    # Vérifier résultats identiques à chaque run

def test_anti_leakage():
    """Rejouer t-30 avec données tronquées → même résultat"""
    # Calculer features à t
    # Calculer features à t-30 avec données[:t-30]
    # Scores doivent être cohérents (pas de futur utilisé)
```

---

## 📚 Références

- [Action Plan v7](./PORTFOLIO_ENGINE_ACTION_PLAN_v7.md)
- [Technical Specs v7](./PORTFOLIO_ENGINE_TECH_SPECS_v7.md)
- [Constraints Documentation](./constraints.md)
