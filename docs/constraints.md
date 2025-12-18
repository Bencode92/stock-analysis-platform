# Contraintes d'Allocation — Documentation Technique

> **Version**: 6.19.0  
> **Dernière mise à jour**: 2025-12-18  
> **Statut**: Production

---

## 1. Vue d'ensemble

Ce document définit les contraintes appliquées par l'optimiseur de portefeuille et leur périmètre d'application.

### 1.1 Principes directeurs

1. **Transparence** : Chaque contrainte a un périmètre clairement défini
2. **Cohérence économique** : Les contraintes reflètent les risques réels de chaque classe d'actifs
3. **Auditabilité** : Les décisions sont documentées avec leur rationale

---

## 2. Contraintes par Profil

### 2.1 Tableau récapitulatif

| Contrainte | Agressif | Modéré | Stable | Périmètre |
|------------|----------|--------|--------|-----------|
| `vol_target` | 18% | 12% | 6% | Portfolio total |
| `vol_tolerance` | ±3% | ±3% | ±3% | Portfolio total |
| `bonds_min` | 5% | 15% | 35% | Obligations uniquement |
| `crypto_max` | 10% | 5% | 0% | Crypto uniquement |
| `max_single_position` | 15% | 15% | 15% | Tous actifs |
| `max_sector` | 30% | 30% | 30% | Tous actifs |
| `max_region` | 50% | 50% | 50% | **EQUITY_LIKE + LEVERAGED** |
| `min_assets` | 10 | 10 | 10 | Portfolio total |
| `max_assets` | 18 | 18 | 18 | Portfolio total |

### 2.2 Buckets (Rôles) par Profil

| Bucket | Agressif | Modéré | Stable |
|--------|----------|--------|--------|
| CORE | 35-45% | 45-55% | 30-40% |
| DEFENSIVE | 5-15% | 20-30% | 45-60% |
| SATELLITE | 35-50% | 15-25% | 5-15% |
| LOTTERY | 0-5% | 0-2% | 0% |

### 2.3 Caps additionnels (v6.19.0)

| Contrainte | Agressif | Modéré | Stable |
|------------|----------|--------|--------|
| `leveraged_cap` | 5% | 0% | 0% |
| `alternative_cap` | 20% | 10% | 5% |

---

## 3. Classification Risk Buckets (v6.19.0)

### 3.1 Les 7 Buckets

| Bucket | Description | Compte dans max_region ? |
|--------|-------------|-------------------------|
| `EQUITY_LIKE` | Actions, ETF actions, sectoriels | ✅ **Oui** |
| `BOND_LIKE` | Obligations, ETF obligataires | ❌ Non |
| `LEVERAGED` | ETF leveraged/inverse | ✅ **Oui** (mais gated) |
| `ALTERNATIVE` | Derivative Income, Defined Outcome, Allocations | ❌ Non (exempt + cap) |
| `REAL_ASSETS` | Commodities, Or, FX | ❌ Non |
| `CRYPTO` | Digital Assets | ❌ Non (compte dans crypto_max) |
| `UNKNOWN` | fund_type vide ou non mappé | ❌ **Quality gate FAIL** |

### 3.2 Règle max_region

```python
COUNTS_IN_MAX_REGION = {EQUITY_LIKE, LEVERAGED}
```

**Seuls les actifs EQUITY_LIKE et LEVERAGED comptent dans la contrainte max_region de 50%.**

### 3.3 Mapping fund_type → RiskBucket

#### BOND_LIKE (exclu de max_region)

```
Ultrashort Bond, Target Maturity, High Yield Bond, Intermediate Core Bond,
Short-Term Bond, Corporate Bond, Long-Term Bond, Multisector Bond,
Bank Loan, Securitized Bond, Inflation-Protected Bond, Government (Long/Short/Intermediate),
Emerging Markets Bond, Global Bond, Muni (National/Target), Prime Money Market,
Miscellaneous Fixed Income
```

#### EQUITY_LIKE (compte dans max_region)

```
Large/Mid/Small (Blend/Value/Growth), Technology, Health, Financial, 
Industrials, Utilities, Communications, Consumer (Cyclical/Defensive),
Real Estate, Infrastructure, Natural Resources, Equity Energy,
Global Large-Stock (Blend/Growth/Value), Foreign Large (Blend/Value/Growth),
Diversified Emerging Mkts, Europe Stock, Japan Stock, China Region,
India Equity, Latin America Stock, Pacific/Asia, Preferred Stock
```

#### LEVERAGED (compte dans max_region, gated par profil)

```
Trading--Leveraged Equity, Trading--Inverse Equity,
Trading--Leveraged Debt, Trading--Inverse Debt,
Trading--Leveraged Commodities, Trading--Inverse Commodities,
Multi-Asset Leveraged
```

#### ALTERNATIVE (exempt + cap)

```
Derivative Income, Defined Outcome, Equity Hedged, Systematic Trend,
Long-Short Equity, Equity Market Neutral, Multistrategy, Tactical Allocation,
Convertibles, Global/Moderate/Aggressive/Conservative Allocation
```

#### REAL_ASSETS (exempt)

```
Commodities Focused, Commodities Broad Basket, Equity Precious Metals,
Single Currency, USD
```

#### CRYPTO (compte dans crypto_max)

```
Digital Assets, Equity Digital Assets
```

---

## 4. Quality Gates

### 4.1 Gate 1 — UNKNOWN interdit

```
Si fund_type vide → bucket = UNKNOWN → EXCLUSION de l'univers
```

**Rationale** : Évite les loopholes où un actif non classifié échappe aux contraintes.

### 4.2 Gate 2 — LEVERAGED gated par profil

| Profil | Règle |
|--------|-------|
| Stable | LEVERAGED interdit (hard fail) |
| Modéré | LEVERAGED interdit (hard fail) |
| Agressif | LEVERAGED autorisé (cap 5% total) |

### 4.3 Gate 3 — Région connue requise

```
Si bucket ∈ {EQUITY_LIKE, LEVERAGED} ET région = UNKNOWN → FAIL
```

**Rationale** : Un actif comptant dans max_region avec région inconnue est un loophole.

---

## 5. Décision max_region — Historique

### 5.1 v6.18.1 — Actions Only

```
max_region = 50% s'applique UNIQUEMENT aux Actions
```

### 5.2 v6.19.0 — EQUITY_LIKE + LEVERAGED

```
max_region = 50% s'applique aux buckets EQUITY_LIKE et LEVERAGED
```

**Évolution** : La classification par Risk Bucket remplace la classification par catégorie simple.

### 5.3 Périmètre d'exclusion

| Bucket | max_region ? | Justification |
|--------|--------------|---------------|
| BOND_LIKE | ❌ Non | Risque = duration/crédit, pas géographique |
| ALTERNATIVE | ❌ Non | Structures complexes, look-through non fiable |
| REAL_ASSETS | ❌ Non | Commodities = marché global, pas régional |
| CRYPTO | ❌ Non | Actif décorrélé, pas de risque géo traditionnel |

---

## 6. Sous-métriques pour Auditabilité

Le rapport de contraintes inclut des sous-métriques pour analyse détaillée :

### 6.1 Alternative breakdown

```json
{
  "alt_derivative_income": 3.5,
  "alt_defined_outcome": 2.0,
  "alt_allocation_funds": 1.5,
  "alt_other": 0.5
}
```

### 6.2 Real Assets breakdown

```json
{
  "real_commodities": 2.0,
  "real_precious_metals": 3.0,
  "real_fx": 0.0
}
```

### 6.3 Region exposure

```json
{
  "region_exposure_risky": 45.0,
  "region_exposure_exempt": 55.0,
  "counts_in_max_region_buckets": ["equity_like", "leveraged"]
}
```

---

## 7. Implémentation

### 7.1 Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `portfolio_engine/risk_buckets.py` | Classification + Quality Gates |
| `portfolio_engine/optimizer.py` | Intégration contraintes |
| `portfolio_engine/preset_meta.py` | Buckets de rôle (CORE/DEFENSIVE/etc.) |

### 7.2 Usage

```python
from portfolio_engine.risk_buckets import (
    classify_asset,
    RiskBucket,
    counts_in_max_region,
    filter_universe_by_gates,
    compute_bucket_exposures,
)

# Classifier un actif
bucket, metadata = classify_asset(asset_data)

# Vérifier si compte dans max_region
if counts_in_max_region(bucket):
    region_weights[asset.region] += weight

# Filtrer l'univers
passed, failed = filter_universe_by_gates(assets, "Stable")

# Calculer expositions pour rapport
exposures = compute_bucket_exposures(allocation, assets)
```

---

## 8. Historique des décisions

| Version | Date | Décision | Validé par |
|---------|------|----------|------------|
| v6.18 | 2025-12-17 | Ajout check max_region dans fallback | - |
| v6.18.1 | 2025-12-18 | max_region = Actions only | ChatGPT review ✅ |
| v6.19.0 | 2025-12-18 | Classification 6 buckets + Quality Gates | ChatGPT review ✅ |

---

## 9. Références

- `portfolio_engine/risk_buckets.py` : Classification et gates
- `portfolio_engine/optimizer.py` : Implémentation des contraintes
- `docs/production_readiness.md` : Checklist production

---

*Document généré dans le cadre de l'audit ChatGPT v2.0 — Conformité AMF P0-9*
