# 📋 Portfolio Engine v7 — Plan d'Action Complet

> **Date**: 19 décembre 2025  
> **Version**: v4.9.1 → v7.0.0  
> **Statut actuel**: BETA AVANCÉE (non production-ready)  
> **Objectif**: Ship-ready pour plateforme d'investissement

---

## 📊 Résumé Exécutif

### Audit Expert (Claude Opus + ChatGPT o1)

| Métrique | Score | Interprétation |
|----------|-------|----------------|
| **Engine/Process** | 54/100 | Beta avancée, pas production |
| **Portfolio Agressif** | 38/100 | ❌ Non ship-ready |
| **Portfolio Modéré** | 46/100 | ⚠️ Fragile |
| **Portfolio Stable** | 55/100 | ✅ Le plus cohérent |

### Problèmes Critiques Identifiés

| Bug | Impact | Profils touchés |
|-----|--------|-----------------|
| HHI/effective_n incorrect | Métriques audit fausses | Agressif, Modéré |
| max_region observed=0 | Compliance non vérifiable | Agressif |
| max_sector inclut "Bonds" | Faux CRITICAL sur Stable | Stable |
| risk_bucket "unknown" 60%+ | Classification impossible | Tous |
| ready_for_execution=false | Non exécutable | Tous |
| Pénalités manquantes objectif | Corner solutions | Agressif, Modéré |

---

## 🎯 Definition of Done (DoD)

**Un portefeuille est "Ship-ready" si et seulement si :**

```
✅ summary.critical == 0
✅ Métriques cohérentes (observed = recalcul indépendant)
✅ HHI / effective_n corrects (vérifiés par test unitaire)
✅ ready_for_execution == true (tickers + ISIN présents)
✅ Aucun risk_bucket == "unknown"
✅ delivery_status == "PASS"
```

---

## 🚀 Plan d'Action Priorisé

### P0 — BLOQUANTS (Sprint 1 : cette semaine)

| # | Action | Fichier | Effort | DoD |
|---|--------|---------|--------|-----|
| 1 | Fix HHI/effective_n | `optimizer.py` | 30min | Test: 10 lignes equal-weight → HHI=1000 |
| 2 | Fix max_region observed | `optimizer.py` | 30min | observed = max(all_regions.values()) |
| 3 | Fix max_sector scope | `optimizer.py` | 1h | Exclure "Bonds" du calcul secteur |
| 4 | Éliminer risk_bucket "unknown" | `optimizer.py` | 1h | 0% unknown dans output |
| 5 | Gating REJECT si critical>0 | `optimizer.py` | 30min | delivery_status dans JSON |

**Livrable P0**: `portfolios.json` avec `delivery_status: PASS` sur 3 profils

---

### P1 — QUALITÉ OPTIMISATION (Sprint 2 : semaine prochaine)

| # | Action | Fichier | Effort | Impact |
|---|--------|---------|--------|--------|
| 6 | Pénalité HHI dans objectif | `optimizer.py` | 2h | Réduire corner solutions |
| 7 | Pénalité turnover dans objectif | `optimizer.py` | 1h | Stabilité allocations |
| 8 | alternative_cap comme contrainte SLSQP | `optimizer.py` | 1h | Agressif compliant |
| 9 | Instrument Master | `data/instrument_master.json` | 3h | ready_for_execution=true |
| 10 | Oracle de recalcul indépendant | `constraint_oracle.py` | 4h | Audit-proof |

**Livrable P1**: Objectif SLSQP v2 + Instrument Master complet

---

### P2 — ROBUSTESSE (Sprint 3-4 : mois prochain)

| # | Action | Fichier | Effort | Impact |
|---|--------|---------|--------|--------|
| 11 | Sensibilité λ_vol | `tests/sensitivity.py` | 4h | Robustesse paramètres |
| 12 | Sensibilité corrélations | `tests/sensitivity.py` | 2h | Stress covariance |
| 13 | Stress synthétiques | `tests/stress_tests.py` | 4h | Queue risk couvert |
| 14 | Backtest OOS | `backtester.py` | 8h | Validation long terme |
| 15 | Walk-forward | `backtester.py` | 8h | Anti sur-optimisation |

**Livrable P2**: Rapport de robustesse + Backtest 3-5 ans

---

## 🔧 Spécifications Techniques P0

### PATCH 1: Fix HHI / effective_n

**Problème**: HHI affiché 4820 (Agressif) vs recalculé ~1340

**Cause**: Probable erreur d'échelle ou de normalisation

**Solution**:

```python
def compute_concentration_metrics(weights: dict) -> dict:
    """
    Calcul HHI et effective_n - VERSION CORRIGÉE
    
    HHI = sum(w^2) * 10000 où w en décimal (somme = 1)
    effective_n = 10000 / HHI
    """
    import numpy as np
    
    w = np.array(list(weights.values()), dtype=float)
    w = w / w.sum()  # Normaliser à 1
    
    hhi = float((w ** 2).sum() * 10000)
    effective_n = float(10000 / hhi) if hhi > 0 else 0.0
    
    sorted_w = np.sort(w)[::-1]
    
    return {
        "hhi": round(hhi, 1),
        "hhi_interpretation": (
            "well_diversified" if hhi < 1000 else
            "diversified" if hhi < 1500 else
            "moderately_concentrated" if hhi < 2500 else
            "highly_concentrated"
        ),
        "effective_n": round(effective_n, 1),
        "n_positions": len(w),
        "top_5_weight": round(float(sorted_w[:5].sum() * 100), 2),
        "top_10_weight": round(float(sorted_w[:10].sum() * 100), 2),
        "largest_position": round(float(sorted_w[0] * 100), 2),
        "smallest_position": round(float(sorted_w[-1] * 100), 2),
    }
```

**Test unitaire obligatoire**:

```python
def test_hhi_equal_weight():
    # 10 positions à 10% chacune
    weights = {f"asset_{i}": 0.10 for i in range(10)}
    metrics = compute_concentration_metrics(weights)
    assert metrics["hhi"] == 1000.0
    assert metrics["effective_n"] == 10.0

def test_hhi_concentrated():
    # 2 positions à 50% chacune
    weights = {"A": 0.50, "B": 0.50}
    metrics = compute_concentration_metrics(weights)
    assert metrics["hhi"] == 5000.0
    assert metrics["effective_n"] == 2.0
```

---

### PATCH 2: Fix max_region observed=0

**Problème**: `observed=0` alors que `all_regions["Etats-Unis"]=50.21%`

**Cause**: Bug de calcul ou mauvaise agrégation

**Solution**:

```python
def compute_max_region_constraint(weights_by_region: dict, cap: float) -> dict:
    """
    observed = max des régions (PAS 0!)
    """
    if not weights_by_region:
        return {"name": "max_region", "observed": 0, "status": "OK", ...}
    
    # CORRECTION: observed = max des valeurs
    observed = max(weights_by_region.values())
    most_concentrated = max(weights_by_region, key=weights_by_region.get)
    slack = cap - observed
    
    status = (
        "CRITICAL" if slack < -5 else
        "VIOLATED" if slack < 0 else
        "BINDING" if slack < 2 else
        "OK"
    )
    
    return {
        "name": "max_region",
        "constraint_type": "max",
        "cap": cap,
        "observed": round(observed, 2),
        "slack": round(slack, 2),
        "binding": status == "BINDING",
        "status": status,
        "details": {
            "most_concentrated": most_concentrated,
            "all_regions": weights_by_region
        }
    }
```

---

### PATCH 3: Fix max_sector scope

**Problème**: "Bonds" = 53.86% déclenche CRITICAL sur max_sector (cap 30%)

**Décision produit**: max_sector = secteurs EQUITY uniquement

**Solution**:

```python
def compute_max_sector_constraint(weights_df, cap, scope="equity_only"):
    """
    max_sector - appliqué UNIQUEMENT aux actions et ETF equity-like
    Bonds n'est PAS un secteur (c'est une catégorie)
    """
    if scope == "equity_only":
        equity_mask = weights_df["category"].isin(["Actions", "ETF"]) & \
                      (weights_df["risk_bucket"] != "bond_like")
        df_scoped = weights_df[equity_mask]
    else:
        df_scoped = weights_df
    
    # Exclure "Bonds" explicitement
    df_scoped = df_scoped[df_scoped["sector"] != "Bonds"]
    
    if df_scoped.empty:
        return {"name": "max_sector", "observed": 0, "status": "OK", ...}
    
    sector_weights = df_scoped.groupby("sector")["weight"].sum() * 100
    observed = sector_weights.max()
    
    # ... reste du calcul
```

---

### PATCH 4: Éliminer risk_bucket "unknown"

**Problème**: 60-65% des actions ont `risk_bucket: "unknown"`

**Solution**: Mapping déterministe

```python
def assign_risk_bucket(row: pd.Series) -> str:
    """
    Assigner un risk_bucket déterministe - JAMAIS "unknown"
    """
    category = row.get("category", "")
    name = row.get("name", "").lower()
    
    if category == "Actions":
        return "equity_like"
    
    if category == "Obligations":
        return "bond_like"
    
    if category == "Crypto":
        return "crypto"
    
    if category == "ETF":
        if any(kw in name for kw in ["bond", "treasury", "tips", "aggregate"]):
            return "bond_like"
        if any(kw in name for kw in ["preferred", "income", "dividend"]):
            return "equity_like"
        if any(kw in name for kw in ["buywrite", "covered call", "defined outcome"]):
            return "alternative"
        return "equity_like"  # Défaut ETF
    
    return "equity_like"  # Fallback
```

---

### PATCH 5: Gating REJECT

**Politique**:

| Condition | Statut | Action |
|-----------|--------|--------|
| critical > 0 | REJECT | Pas de livraison |
| ready_for_execution = false | REJECT | Pas de livraison |
| violated > 0 | WARN | Review requis |
| Sinon | PASS | Ship-ready |

```python
def apply_gating_policy(constraint_report: dict) -> dict:
    """
    Ajoute delivery_status au report
    """
    summary = constraint_report.get("summary", {})
    exec_summary = constraint_report.get("execution_summary", {})
    
    reject_reasons = []
    warn_reasons = []
    
    if summary.get("critical", 0) > 0:
        reject_reasons.append(f"{summary['critical']} CRITICAL constraint(s)")
    
    if not exec_summary.get("ready_for_execution", False):
        reject_reasons.append("Not execution-ready")
    
    if summary.get("violated", 0) > 0:
        warn_reasons.append(f"{summary['violated']} soft constraint(s) violated")
    
    if reject_reasons:
        status = "REJECT"
        message = "❌ " + "; ".join(reject_reasons)
    elif warn_reasons:
        status = "WARN"
        message = "⚠️ " + "; ".join(warn_reasons)
    else:
        status = "PASS"
        message = "✅ Ship-ready"
    
    constraint_report["delivery_status"] = status
    constraint_report["delivery_message"] = message
    
    return constraint_report
```

---

## 📈 Spécifications Techniques P1

### PATCH 6: Pénalité HHI dans l'objectif

**Objectif actuel**:
```python
return -(score - 5.0 * (vol - vol_target)**2)
```

**Objectif v2**:
```python
def objective_v2(w, scores, cov, vol_target, hhi_target=1500, w_prev=None):
    # Score
    port_score = np.dot(w, scores)
    
    # Pénalité volatilité
    port_vol = np.sqrt(np.dot(w, np.dot(cov, w)))
    vol_penalty = 5.0 * (port_vol - vol_target) ** 2
    
    # Pénalité concentration (HHI)
    hhi = (w ** 2).sum() * 10000
    hhi_penalty = 0.001 * max(0, hhi - hhi_target)  # Pénalise si HHI > target
    
    # Pénalité turnover (si w_prev disponible)
    turnover_penalty = 0.0
    if w_prev is not None:
        turnover = np.abs(w - w_prev).sum()
        turnover_penalty = 0.01 * turnover
    
    return -(port_score - vol_penalty - hhi_penalty - turnover_penalty)
```

---

### PATCH 8: alternative_cap comme contrainte SLSQP

**Actuellement**: Vérifié après coup, pas contraint

**Solution**: Ajouter comme contrainte d'inégalité

```python
def build_constraints(candidates, profile, alternative_indices):
    constraints = [...]
    
    # Alternative cap (20% pour Agressif)
    if alternative_indices:
        constraints.append({
            "type": "ineq",
            "fun": lambda w, idx=alternative_indices, cap=profile.alternative_cap: 
                   cap/100 - w[idx].sum()  # sum(alternatives) <= cap
        })
    
    return constraints
```

---

## 📊 Pack Robustesse P2

### Sensibilité Paramètres

**Grille de test**:

| Paramètre | Valeurs | Métrique à observer |
|-----------|---------|---------------------|
| `lambda_vol` | 0.5, 1, 2, 5, 10 | Vol réalisée, violations |
| `COVARIANCE_EMPIRICAL_WEIGHT` | 0.2, 0.4, 0.6, 0.8 | Stabilité poids |
| `CORR_SAME_SECTOR` | 0.35, 0.45, 0.55 | HHI, diversification |
| `CONDITION_NUMBER_TARGET` | 2k, 10k, 50k | Conditionnement |

**Output**: Heatmap sensibilité + rapport stabilité

### Stress Synthétiques

**Scénarios**:

| Scénario | Choc Actions | Choc Bonds | Choc Crypto | Choc Alternatives |
|----------|--------------|------------|-------------|-------------------|
| Crash 2020 | -35% | +5% | -50% | -20% |
| Bear 2022 | -25% | -15% | -70% | -15% |
| Crise taux | -10% | -10% | -20% | -5% |
| Flight to quality | -15% | +10% | -30% | -10% |

**Output**: Perte max par scénario + contribution par poche

---

## ✅ Checklist de Livraison

### Sprint 1 (P0)

- [ ] PATCH 1: HHI/effective_n corrigé + test unitaire
- [ ] PATCH 2: max_region observed corrigé
- [ ] PATCH 3: max_sector scope = equity_only
- [ ] PATCH 4: risk_bucket mapping (0% unknown)
- [ ] PATCH 5: Gating REJECT policy
- [ ] Régénérer `portfolios.json` avec delivery_status
- [ ] Vérifier: 3 profils avec `delivery_status: PASS`

### Sprint 2 (P1)

- [ ] PATCH 6: Pénalité HHI dans objectif
- [ ] PATCH 7: Pénalité turnover dans objectif
- [ ] PATCH 8: alternative_cap comme contrainte SLSQP
- [ ] Créer `data/instrument_master.json`
- [ ] Créer `portfolio_engine/constraint_oracle.py`
- [ ] ready_for_execution = true sur tous les profils

### Sprint 3-4 (P2)

- [ ] Tests sensibilité paramètres
- [ ] Stress synthétiques
- [ ] Backtest 3-5 ans
- [ ] Walk-forward OOS
- [ ] Rapport de robustesse complet

---

## 📚 Références

- **Audit ChatGPT**: Scoring 54/100 Engine, 38-55/100 Portfolios
- **Audit Claude**: Note 7.2/10 Senior (pas Partner/Production)
- **Version actuelle**: v4.9.1
- **Version cible**: v7.0.0 (Ship-ready)

---

## 🔗 Liens Utiles

- [portfolios.json](../data/portfolios.json)
- [optimizer.py](../portfolio_engine/optimizer.py)
- [backtest_results.json](../data/backtest_results.json)
- [portfolio_config.yaml](../config/portfolio_config.yaml)
- [constraints.md](./constraints.md)
- [production_readiness.md](./production_readiness.md)
