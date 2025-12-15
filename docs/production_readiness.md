# 🔍 Production Readiness Audit - Stock Analysis Platform

**Version:** 1.0.0  
**Date:** 2025-12-15  
**Statut global:** ⚠️ **NON PRÊT PROD** (17/35 critères satisfaits)  
**Prochaine revue:** Après implémentation P0

---

## 📊 Tableau de Synthèse

| Section | Score | Critères critiques |
|---------|-------|-------------------|
| 1. Definition of Done | 1/2 | Q2 ❌ |
| 2. Reproductibilité | 2/3 | Q5 ⚠️ |
| 3. Data Pipeline | 2/5 | Q6 ❌, Q9 ❌ |
| 4. Modèle de Risque | 3/5 | Q12 ❌, Q14 ❌ |
| 5. Optimisation | 3/5 | Q16 ⚠️, Q19 ❌ |
| 6. Backtest | 1/4 | Q21 ❌, Q22 ❌ |
| 7. LLM Conformité | 3/3 | ✅ Tous |
| 8. Tilts Tactiques | 2/2 | ✅ Tous |
| 9. Observabilité | 0/3 | Q30 ❌, Q31 ❌, Q32 ❌ |
| 10. Sécurité | 2/3 | Q35 ❌ |

**Critères bloquants (MUST FIX):** Q6, Q9, Q16, Q25, Q30

---

## 1️⃣ Définition de "parfait techniquement" (gates)

### Q1. Quelle est ta "Definition of Done" versionnée ?

**Statut:** ✅ PARTIEL  
**Preuve:** Ce document (`docs/production_readiness.md`)

**Critères de passage (DoD v1.0):**

| Critère | Seuil | Statut |
|---------|-------|--------|
| Tests unitaires | >80% coverage modules critiques | ⚠️ ~60% |
| Tests intégration | 3 profils × 2 runs = identique | ✅ |
| Contraintes post-arrondi | 0 violation | ⚠️ Non vérifié systématiquement |
| LLM sanitizer | 100% patterns détectés | ✅ |
| Backtest reproductible | ±0.01% sur 10 runs | ⚠️ Non testé |
| Data lineage | 100% traçable | ❌ Manquant |
| Monitoring | Logs structurés JSON | ❌ Manquant |

---

### Q2. As-tu un "run manifest" complet à chaque génération ?

**Statut:** ❌ INCOMPLET  
**Ce qui existe:**

```python
# generate_portfolios_v4.py - _meta actuel
"_meta": {
    "generated_at": "2025-12-15T14:12:52Z",
    "version": "v4.8.0_p0_compliance",
    "buffett_mode": "soft",
    "buffett_min_score": 40,
    "tactical_context_enabled": False,
    "backtest_days": 90
}
```

**Ce qui manque:**

```python
# MANIFEST COMPLET REQUIS
"_manifest": {
    # Versioning
    "git_sha": "abc123...",
    "modules_versions": {
        "portfolio_engine": "6.13",
        "compliance": "2.1",
        "backtest": "1.0"
    },
    
    # Data lineage
    "data_sources": {
        "stocks_us": {"path": "data/stocks_us.json", "hash": "sha256:...", "rows": 150},
        "etf": {"path": "data/combined_etfs.csv", "hash": "sha256:...", "rows": 89},
        "bonds": {"path": "data/combined_bonds.csv", "hash": "sha256:...", "rows": 45}
    },
    
    # Paramètres
    "parameters": {
        "vol_targets": {"Agressif": 18, "Modéré": 12, "Stable": 6},
        "covariance_window": 252,
        "seed": null  # ou fixé pour repro
    },
    
    # Execution
    "execution": {
        "timezone": "UTC",
        "duration_ms": 4523,
        "memory_peak_mb": 512
    }
}
```

**Action:** Créer `ManifestBuilder` dans `portfolio_engine/manifest.py`

---

## 2️⃣ Reproductibilité & déterminisme

### Q3. À inputs identiques, obtiens-tu exactement les mêmes poids ?

**Statut:** ✅ OUI (tolérance ±0.01%)  
**Preuve:**

```python
# portfolio_engine/optimizer.py - Déterminisme assuré par:
1. Pas de random/seed dans SLSQP
2. Tri explicite par score (stable sort)
3. Fallback heuristique = règles fixes
4. LLM désactivé pour poids (use_llm=False n'affecte que commentaires)
```

**Test existant:** `tests/test_portfolio_generation.py::test_determinism`

**Limite:** Non testé sur 20 runs automatisés.

---

### Q4. L'ordre des actifs est-il figé et stable ?

**Statut:** ✅ OUI  
**Preuve:**

```python
# portfolio_engine/optimizer.py:select_candidates()
sorted_assets = sorted(universe, key=lambda x: x.score, reverse=True)

# optimizer.py:_fallback_allocation()
sorted_candidates = sorted(candidates, key=lambda a: a.vol_annual)  # Stable par vol
```

**Risque résiduel:** Égalités de score → tri secondaire par `id` manquant.

**Action:** Ajouter `key=lambda x: (x.score, x.id)` pour stabilité totale.

---

### Q5. Sources de non-déterminisme neutralisées ?

**Statut:** ⚠️ PARTIEL

| Source | Neutralisée | Comment |
|--------|-------------|---------|
| LLM | ✅ | `use_tactical_context=False`, poids Python uniquement |
| Random | ✅ | Pas de `random.seed()` utilisé |
| Temps courant | ⚠️ | `datetime.now()` dans timestamps (cosmétique) |
| Appels API externes | ⚠️ | TwelveData pour backtest = données live |

**Mode DETERMINISTIC manquant:**

```python
# REQUIS: config/deterministic.yaml
deterministic_mode:
  enabled: false
  freeze_timestamp: "2025-12-15T00:00:00Z"
  use_cached_prices: true
  llm_enabled: false
  market_context_enabled: false
```

---

## 3️⃣ Data Pipeline & Qualité

### Q6. Source de vérité prix vs fondamentaux ?

**Statut:** ❌ NON DOCUMENTÉ  
**Réalité actuelle:**

| Donnée | Source | Fichier |
|--------|--------|---------|
| Prix historiques | TwelveData API | `backtest/data_loader.py` |
| Fondamentaux (ROE, D/E) | FMP API (via scraping) | `data/stocks_*.json` |
| Volatilité | Calculée sur prix | `portfolio_engine/scoring.py` |
| Performances (1m, 3m, YTD) | Sources mixtes | `data/stocks_*.json` |

**Problème:** Pas d'objet `METHODOLOGY` unique importé partout.

**Action requise:**

```python
# portfolio_engine/data_lineage.py (À CRÉER)
METHODOLOGY = {
    "prices": {
        "source": "TwelveData",
        "type": "adjusted_close",
        "currency": "USD",
        "frequency": "daily"
    },
    "fundamentals": {
        "source": "FMP",
        "lag_days": 1,
        "point_in_time": False  # ⚠️ LIMITATION
    },
    "volatility": {
        "window": 252,
        "method": "std_annualized"
    }
}
```

---

### Q7. Gestion splits/dividendes/delistings ?

**Statut:** ⚠️ IMPLICITE  
**Ce qui existe:**

```python
# backtest/data_loader.py
# Utilise "adjusted close" de TwelveData = splits/dividendes inclus
```

**Ce qui manque:**
- Documentation explicite
- Test sur un split connu (ex: TSLA 3:1 août 2022)
- Gestion des delistings (actifs supprimés = survivorship bias)

---

### Q8. Survivorship bias et point-in-time ?

**Statut:** ❌ NON TRAITÉ  
**Réalité:**

```python
# LIMITATIONS NON EXPOSÉES
limitations = [
    "survivorship_bias: L'univers ne contient que les actifs actuellement listés",
    "point_in_time: Les fondamentaux ne sont pas point-in-time (look-ahead bias possible)",
    "backfill_bias: Données historiques peuvent inclure des corrections ex-post"
]
```

**Action:** Ajouter dans `portfolios.json`:

```json
"_limitations": {
    "survivorship_free": false,
    "pit_fundamentals": false,
    "adjusted_prices": true
}
```

---

### Q9. Alignement calendriers multi-actifs ?

**Statut:** ❌ NON GÉRÉ PROPREMENT  
**Problème:**

```python
# backtest/data_loader.py - PROBLÈME
# Actions = 5/7 (lundi-vendredi)
# Crypto = 7/7 (tous les jours)
# Obligations = 5/7 avec jours fériés différents

# ACTUELLEMENT: forward-fill implicite de pandas
prices_df = prices_df.ffill()  # Dangereux pour covariance
```

**Solution requise:**

```python
# backtest/calendar.py (À CRÉER)
def align_to_business_days(prices_df: pd.DataFrame, calendar: str = "NYSE") -> pd.DataFrame:
    """
    Aligne toutes les séries sur le calendrier business days.
    - Crypto: prendre uniquement les jours où NYSE ouvert
    - NaN: PAS de forward-fill, lever une alerte
    """
    business_days = pd.bdate_range(start=prices_df.index.min(), end=prices_df.index.max())
    aligned = prices_df.reindex(business_days)
    
    nan_pct = aligned.isna().sum() / len(aligned)
    if (nan_pct > 0.05).any():
        raise DataQualityError(f"Too many NaN after alignment: {nan_pct.to_dict()}")
    
    return aligned
```

---

### Q10. Garde-fous data sanity ?

**Statut:** ⚠️ PARTIEL  
**Ce qui existe:**

```python
# portfolio_engine/optimizer.py
def _clean_float(value, default=15.0, min_val=0.1, max_val=200.0):
    """Nettoie une valeur float (gère NaN, Inf, None)."""
    # ...

def _is_valid_id(val) -> bool:
    """Vérifie si une valeur est un ID valide."""
    # ...
```

**Ce qui manque:**

```python
# data_quality.py (À CRÉER)
class DataQualityChecker:
    MAX_NAN_PCT = 0.05
    MIN_PRICE = 0.01
    MAX_DAILY_RETURN = 0.50  # 50%
    MIN_HISTORY_DAYS = 60
    
    def check(self, prices_df: pd.DataFrame) -> DataQualityReport:
        issues = []
        
        # Check NaN
        nan_pct = prices_df.isna().sum() / len(prices_df)
        if (nan_pct > self.MAX_NAN_PCT).any():
            issues.append(f"NaN > {self.MAX_NAN_PCT:.0%}")
        
        # Check prix <= 0
        if (prices_df <= 0).any().any():
            issues.append("Prix <= 0 détectés")
        
        # Check outliers returns
        returns = prices_df.pct_change()
        if (returns.abs() > self.MAX_DAILY_RETURN).any().any():
            issues.append(f"Returns > {self.MAX_DAILY_RETURN:.0%}")
        
        return DataQualityReport(passed=len(issues)==0, issues=issues)
```

---

## 4️⃣ Modèle de Risque (Covariance)

### Q11. Covariance garantie PSD ?

**Statut:** ✅ OUI  
**Preuve:**

```python
# portfolio_engine/optimizer.py:HybridCovarianceEstimator
def _ensure_positive_definite(self, cov: np.ndarray, min_eigenvalue: float = 1e-6) -> np.ndarray:
    """Force la matrice à être positive semi-définie."""
    cov = np.nan_to_num(cov, nan=0.0, posinf=0.0, neginf=0.0)
    cov = (cov + cov.T) / 2
    n = cov.shape[0]
    cov += np.eye(n) * min_eigenvalue
    
    eigenvalues, eigenvectors = np.linalg.eigh(cov)
    eigenvalues = np.maximum(eigenvalues, min_eigenvalue)
    cov_fixed = eigenvectors @ np.diag(eigenvalues) @ eigenvectors.T
    return (cov_fixed + cov_fixed.T) / 2
```

**Test existant:** `tests/test_portfolio_engine.py::test_covariance_psd`

---

### Q12. Métriques qualité covariance ?

**Statut:** ❌ MANQUANT  
**Ce qui existe:**

```python
# Diagnostics actuels
"covariance_method": "hybrid",
"covariance_empirical_weight": 0.6
```

**Ce qui manque:**

```python
# Métriques à ajouter
"covariance_quality": {
    "condition_number": 1234.5,
    "eigenvalues_clipped_pct": 0.05,
    "frobenius_adjustment": 0.02,
    "avg_correlation_delta": 0.03  # vs structurée
}
```

---

### Q13. Empirical window 252j justifié ?

**Statut:** ⚠️ CHOIX PAR DÉFAUT  
**Réalité:**

```python
# portfolio_engine/optimizer.py
self.min_history_days = 60  # Minimum
returns_matrix = [r[-252:] for r in returns_matrix]  # Fenêtre fixe 252j
```

**Problème:** 252j (1 an) peut être trop court pour bonds et insuffisant pour régimes différents.

**Action:** Ajouter option multi-horizon:

```yaml
# config/portfolio_config.yaml
covariance:
  windows:
    short: 126  # 6 mois
    medium: 252  # 1 an (défaut)
    long: 756   # 3 ans
  blend_weights: [0.2, 0.5, 0.3]
```

---

### Q14. Stress test corrélations structurées ?

**Statut:** ❌ MANQUANT  
**Corrélations fixes actuelles:**

```python
# portfolio_engine/optimizer.py
CORR_EQUITY_BOND = -0.20  # Critique pour Stable
CORR_SAME_SECTOR = 0.45
CORR_CRYPTO_OTHER = 0.25
```

**Problème:** Pas de stress test systématique.

**Action requise:**

```python
# risk/stress_test.py (À CRÉER)
STRESS_SCENARIOS = {
    "correlation_spike": {
        "CORR_EQUITY_BOND": [0.0, 0.30, 0.50],  # De -0.20 à +0.50
        "CORR_SAME_SECTOR": [0.60, 0.75, 0.85]
    },
    "vol_regime": {
        "equity_vol_multiplier": [1.0, 1.5, 2.0],
        "bond_vol_multiplier": [1.0, 1.2, 1.5]
    }
}

def run_stress_pack(portfolio, scenarios):
    """Recalcule vol/allocation pour chaque scénario."""
    results = []
    for name, params in scenarios.items():
        stressed_cov = apply_stress(base_cov, params)
        stressed_vol = compute_portfolio_vol(weights, stressed_cov)
        results.append({
            "scenario": name,
            "base_vol": base_vol,
            "stressed_vol": stressed_vol,
            "delta": stressed_vol - base_vol
        })
    return results
```

---

### Q15. Validation vol reportée = vol finale ?

**Statut:** ✅ OUI  
**Preuve:**

```python
# portfolio_engine/optimizer.py:optimize()
# Vol calculée SUR l'allocation finale (après arrondi)
final_weights = np.array([allocation.get(c.id, 0)/100 for c in candidates])
port_vol = self._compute_portfolio_vol(final_weights, cov)

diagnostics["portfolio_vol"] = round(port_vol, 2)
```

---

## 5️⃣ Optimisation & Contraintes

### Q16. Contraintes respectées APRÈS arrondi/adjust ?

**Statut:** ⚠️ NON VÉRIFIÉ SYSTÉMATIQUEMENT  
**Ce qui existe:**

```python
# optimizer.py:_adjust_to_100()
# Ajuste à 100% mais NE VÉRIFIE PAS les autres contraintes après
```

**Ce qui manque:**

```python
# optimizer.py (À AJOUTER)
def _verify_constraints_post_adjustment(
    self, 
    allocation: Dict[str, float], 
    candidates: List[Asset],
    profile: ProfileConstraints
) -> ConstraintReport:
    """Vérifie TOUTES les contraintes après arrondi."""
    violations = []
    
    # 1. Bonds minimum
    bonds_total = sum(w for aid, w in allocation.items() 
                      if any(c.id == aid and c.category == "Obligations" for c in candidates))
    if bonds_total < profile.bonds_min:
        violations.append(f"bonds_min: {bonds_total:.1f}% < {profile.bonds_min}%")
    
    # 2. Max single position
    for aid, w in allocation.items():
        if w > profile.max_single_position:
            violations.append(f"max_position: {aid} = {w:.1f}% > {profile.max_single_position}%")
    
    # 3. Max single bond
    max_bond = MAX_SINGLE_BOND_WEIGHT.get(profile.name, 10.0)
    for aid, w in allocation.items():
        asset = next((c for c in candidates if c.id == aid), None)
        if asset and asset.category == "Obligations" and w > max_bond:
            violations.append(f"max_bond: {aid} = {w:.1f}% > {max_bond}%")
    
    # 4. Bucket constraints
    # ...
    
    return ConstraintReport(
        passed=len(violations) == 0,
        violations=violations,
        margins={...}  # Marge restante par contrainte
    )
```

---

### Q17. Hiérarchie formelle des contraintes ?

**Statut:** ⚠️ IMPLICITE  
**Réalité actuelle:**

```python
# Hiérarchie implicite (non documentée):
# HARD: sum = 100%, bounds [0, max_single]
# SOFT: vol_target (via pénalité)
# RELAXABLE: bucket_targets (±relaxation)
```

**Action:** Ajouter enum explicite:

```python
# portfolio_engine/constraints.py (À CRÉER)
from enum import Enum

class ConstraintPriority(Enum):
    HARD = "hard"      # Jamais violée
    SOFT = "soft"      # Pénalisée
    RELAXABLE = "relaxable"  # Peut être relâchée

CONSTRAINT_REGISTRY = {
    "sum_100": ConstraintPriority.HARD,
    "bounds": ConstraintPriority.HARD,
    "bonds_min": ConstraintPriority.HARD,
    "crypto_max": ConstraintPriority.HARD,
    "vol_target": ConstraintPriority.SOFT,
    "bucket_core": ConstraintPriority.RELAXABLE,
    "bucket_defensive": ConstraintPriority.RELAXABLE,
}
```

---

### Q18. Repair respecte tous les caps ?

**Statut:** ✅ OUI (pour fallback)  
**Preuve:**

```python
# optimizer.py:_fallback_allocation()
max_single_bond = MAX_SINGLE_BOND_WEIGHT.get(profile.name, 10.0)
# ...
weight = min(base_weight, 100 - total_weight, target_pct - current_weight)
weight = min(weight, profile.max_single_position)
```

---

### Q19. Test de faisabilité AVANT optimisation ?

**Statut:** ❌ MANQUANT  
**Action requise:**

```python
# optimizer.py (À AJOUTER)
def _check_feasibility(
    self,
    candidates: List[Asset],
    profile: ProfileConstraints
) -> FeasibilityReport:
    """Vérifie si les contraintes sont satisfiables."""
    
    # Bonds disponibles
    bonds = [a for a in candidates if a.category == "Obligations"]
    bonds_capacity = sum(MAX_SINGLE_BOND_WEIGHT.get(profile.name, 10.0) for _ in bonds)
    
    if bonds_capacity < profile.bonds_min:
        return FeasibilityReport(
            feasible=False,
            reason=f"Bonds capacity {bonds_capacity:.0f}% < bonds_min {profile.bonds_min}%"
        )
    
    # Vol atteignable
    min_possible_vol = min(a.vol_annual for a in candidates if a.role == Role.DEFENSIVE)
    max_possible_vol = max(a.vol_annual for a in candidates)
    
    if profile.vol_target - profile.vol_tolerance > max_possible_vol:
        return FeasibilityReport(
            feasible=False,
            reason=f"Vol target {profile.vol_target}% unreachable (max={max_possible_vol:.0f}%)"
        )
    
    return FeasibilityReport(feasible=True)
```

---

### Q20. Stable heuristic documenté ?

**Statut:** ✅ OUI  
**Preuve:**

```python
# generate_portfolios_v4.py - Output JSON
"_optimization": {
    "mode": "fallback_heuristic",
    "is_heuristic": true,
    "disclaimer": "Ce portefeuille utilise une allocation heuristique..."
}

# optimizer.py - Log
logger.info(f"🔧 {profile.name}: Utilisation du FALLBACK HEURISTIC")
```

---

## 6️⃣ Backtest & Métriques

### Q21. Coûts inclus/exclus cohérents ?

**Statut:** ❌ INCOHÉRENT  
**Réalité:**

```python
# backtest/engine.py
transaction_cost_bp=10  # 10 bp = 0.10%

# MAIS: config peut overrider
# ET: pas de champ unique "costs_included" dans output
```

**Action:**

```json
// backtest_results.json (À AJOUTER)
"_methodology": {
    "costs_included": true,
    "transaction_cost_bp": 10,
    "slippage_model": "none",
    "tax_model": "none"
}
```

---

### Q22. Mode R&D long vs illustratif 90j ?

**Statut:** ❌ NON SÉPARÉ  
**Réalité:**

```python
# Actuellement: un seul mode
"backtest_days": 90  # Hardcodé comme illustratif
```

**Action requise:**

```yaml
# config/portfolio_config.yaml
backtest:
  modes:
    illustrative:
      days: 90
      display_ui: true
      disclaimer: "Période courte, non représentative"
    research:
      days: 1825  # 5 ans
      display_ui: false
      requires_api_premium: true
```

---

### Q23. Turnover, slippage, impact rebalancing ?

**Statut:** ⚠️ PARTIEL  
**Ce qui existe:**

```python
# backtest/engine.py
"weight_coverage_pct": 95.2  # Couverture des poids
```

**Ce qui manque:**

```python
"turnover_annual_pct": 45.2,
"estimated_costs_bp": 15,
"gross_return_pct": 12.5,
"net_return_pct": 12.35
```

---

### Q24. Risk-free rate cohérent ?

**Statut:** ⚠️ IMPLICITE  
**Réalité:**

```python
# backtest/engine.py
# Sharpe calculé avec rf implicite (probablement 0 ou T-bill US)
# Pas documenté
```

**Action:**

```json
"_risk_metrics": {
    "base_currency": "USD",
    "risk_free_rate_source": "US T-Bill 3M",
    "risk_free_rate_value": 0.045,
    "sharpe_annualized": true
}
```

---

## 7️⃣ LLM & Conformité Texte

### Q25. Double barrière LLM ?

**Statut:** ✅ OUI (v4.8.0)  
**Preuve:**

```python
# generate_portfolios_v4.py:add_commentary()
# Barrière 1: Immédiatement après génération LLM
cleaned, report = sanitize_llm_output(raw_comment, strict=True)

# compliance/__init__.py:sanitize_portfolio_output()
# Barrière 2: À la fin du pipeline
portfolios = apply_compliance(portfolios)
```

**Tests:** `tests/test_llm_sanitizer.py` (60+ tests)

---

### Q26. Fallback si >50% supprimé ?

**Statut:** ✅ OUI  
**Preuve:**

```python
# generate_portfolios_v4.py:add_commentary()
if report.removal_ratio > 0.5:
    cleaned = FALLBACK_COMPLIANCE_COMMENT
    merged[profile]["_compliance_audit"]["fallback_used"] = True
```

---

### Q27. Audit trail modifications compliance ?

**Statut:** ✅ OUI  
**Preuve:**

```python
# Output JSON
"_compliance_audit": {
    "llm_sanitizer": {
        "sanitized": true,
        "removed_sentences": 2,
        "hits": [["recommandation", "recommande"], ["superlatif", "idéal"]],
        "removal_ratio": 0.15
    },
    "timestamp": "2025-12-15T14:12:52Z",
    "fallback_used": false
}
```

---

## 8️⃣ Tilts Tactiques / Market Context

### Q28. Tilts influencent poids ou explication seulement ?

**Statut:** ✅ DÉSACTIVÉ (v4.8.0 P0-8)  
**Preuve:**

```python
# generate_portfolios_v4.py
CONFIG = {
    "use_tactical_context": False,  # P0-8: GPT-generated = zone grise AMF
}
```

**Comportement:** Tilts n'influencent NI les poids NI l'explication actuellement.

---

### Q29. Safe mode neutralise tilts ?

**Statut:** ✅ OUI  
**Preuve:**

```python
# generate_portfolios_v4.py
if CONFIG.get("use_tactical_context", False):
    market_context = load_market_context(...)
else:
    market_context = None  # Pas de tilts

# optimizer.py reçoit market_context=None → scoring neutre
```

---

## 9️⃣ Observabilité & Exploitation

### Q30. SLO/SLA techniques ?

**Statut:** ❌ NON DÉFINIS  
**Action requise:**

```yaml
# slo.yaml (À CRÉER)
slo:
  generation:
    max_duration_seconds: 60
    success_rate_target: 0.99
  
  fallback:
    max_rate: 0.10  # Max 10% de fallback par jour
    
  data_quality:
    max_missing_tickers_pct: 0.05
    
  constraints:
    violation_rate: 0.0  # Zéro tolérance
```

---

### Q31. Détection de drift ?

**Statut:** ❌ MANQUANT  
**Action requise:**

```python
# monitoring/drift.py (À CRÉER)
class DriftDetector:
    def check_score_distribution(self, current_scores, baseline_scores):
        """Détecte si la distribution des scores a changé."""
        ks_stat, p_value = scipy.stats.ks_2samp(current_scores, baseline_scores)
        if p_value < 0.01:
            alert("Score distribution drift detected")
    
    def check_vol_realized_vs_target(self, realized_vols, targets):
        """Vérifie que vol réalisée ≈ vol cible."""
        for profile, vol in realized_vols.items():
            target = targets[profile]
            if abs(vol - target) > 5:  # 5% tolérance
                alert(f"Vol drift: {profile} realized={vol}% vs target={target}%")
```

---

### Q32. Tests golden portfolios ?

**Statut:** ❌ MANQUANT  
**Action requise:**

```python
# tests/golden/portfolios_snapshot.json (À CRÉER)
{
    "snapshot_date": "2025-12-15",
    "data_hash": "sha256:abc123...",
    "profiles": {
        "Agressif": {
            "n_assets": 14,
            "bonds_pct": 5.0,
            "vol": 17.2,
            "top_3_weights": [["NVDA", 12], ["MSFT", 10], ["AAPL", 9]]
        },
        "Modéré": {...},
        "Stable": {...}
    }
}

# tests/test_golden.py
def test_golden_portfolio_agressif():
    portfolios = generate_portfolios()
    snapshot = load_golden("Agressif")
    
    assert portfolios["Agressif"]["n_assets"] == snapshot["n_assets"]
    assert abs(portfolios["Agressif"]["vol"] - snapshot["vol"]) < 1.0
```

---

## 🔟 Sécurité & Robustesse

### Q33. Gestion clés API et logs ?

**Statut:** ✅ OK  
**Preuve:**

```python
# generate_portfolios_v4.py
api_key = os.environ.get("API_CHAT") or os.environ.get("OPENAI_API_KEY")
# Jamais loggé, jamais hardcodé

# .gitignore
.env
*.key
secrets/
```

---

### Q34. Comportement défensif API down ?

**Statut:** ✅ PARTIEL  
**Preuve:**

```python
# generate_portfolios_v4.py:add_commentary()
try:
    commentary = generate_commentary_sync(...)
except Exception as e:
    logger.error(f"Erreur LLM: {e}, fallback sans LLM")
    commentary = generate_fallback_commentary(...)

# backtest/data_loader.py
if not api_key:
    logger.warning("⚠️ TWELVE_DATA_API non définie, backtest ignoré")
    return {"error": "TWELVE_DATA_API not set", "skipped": True}
```

**Manque:** Retry avec exponential backoff explicite.

---

### Q35. Versioning et migrations JSON ?

**Statut:** ❌ NON FORMALISÉ  
**Réalité:**

```python
# Output actuel
"version": "v4.8.0_p0_compliance"  # Version code, pas schema
```

**Action requise:**

```json
{
    "_schema": {
        "version": "2.0.0",
        "compatible_since": "1.5.0",
        "breaking_changes": ["_optimization added in 2.0.0"]
    }
}
```

---

## 📋 Plan d'Action Prioritaire

### P0 - Bloquant Production (1-2 semaines)

| # | Action | Fichier | Effort |
|---|--------|---------|--------|
| 1 | Créer `METHODOLOGY` data lineage | `portfolio_engine/data_lineage.py` | 2h |
| 2 | Implémenter calendar alignment | `backtest/calendar.py` | 4h |
| 3 | Ajouter `_verify_constraints_post_adjustment()` | `optimizer.py` | 3h |
| 4 | Ajouter test de faisabilité | `optimizer.py` | 2h |
| 5 | Créer tests golden portfolios | `tests/test_golden.py` | 3h |

### P1 - Critique Qualité (2-4 semaines)

| # | Action | Fichier | Effort |
|---|--------|---------|--------|
| 6 | Manifest complet | `portfolio_engine/manifest.py` | 4h |
| 7 | DataQualityChecker | `portfolio_engine/data_quality.py` | 4h |
| 8 | Covariance quality metrics | `optimizer.py` | 3h |
| 9 | Stress test corrélations | `risk/stress_test.py` | 6h |
| 10 | Schema versioning | `output/schema.py` | 2h |

### P2 - Nice to Have (1 mois+)

| # | Action | Fichier | Effort |
|---|--------|---------|--------|
| 11 | Mode DETERMINISTIC | `config/deterministic.yaml` | 4h |
| 12 | Multi-horizon covariance | `optimizer.py` | 6h |
| 13 | Backtest mode R&D | `backtest/engine.py` | 8h |
| 14 | Drift detector | `monitoring/drift.py` | 8h |
| 15 | SLO dashboard | `monitoring/slo.py` | 12h |

---

## ✅ Checklist Finale

```
[ ] Q1  Definition of Done versionnée          ⚠️ Ce document
[ ] Q2  Run manifest complet                   ❌ À implémenter
[ ] Q3  Reproductibilité ±0.01%                ✅ Oui (non testé 20 runs)
[ ] Q4  Ordre actifs stable                    ✅ Oui
[ ] Q5  Non-déterminisme neutralisé            ⚠️ Partiel
[ ] Q6  Data lineage documentée                ❌ À implémenter
[ ] Q7  Splits/dividendes/delistings           ⚠️ Implicite
[ ] Q8  Survivorship/PIT documentés            ❌ À documenter
[ ] Q9  Calendar alignment                     ❌ À implémenter
[ ] Q10 Data sanity checks                     ⚠️ Partiel
[ ] Q11 Covariance PSD                         ✅ Oui
[ ] Q12 Covariance quality metrics             ❌ À implémenter
[ ] Q13 Multi-horizon covariance               ⚠️ Single 252j
[ ] Q14 Stress test corrélations               ❌ À implémenter
[ ] Q15 Vol reportée = vol finale              ✅ Oui
[ ] Q16 Contraintes post-arrondi               ⚠️ Non vérifié
[ ] Q17 Hiérarchie contraintes                 ⚠️ Implicite
[ ] Q18 Repair sous contraintes                ✅ Oui
[ ] Q19 Test faisabilité                       ❌ À implémenter
[ ] Q20 Stable heuristic documenté             ✅ Oui
[ ] Q21 Coûts cohérents                        ❌ À clarifier
[ ] Q22 Mode R&D vs illustratif                ❌ À séparer
[ ] Q23 Turnover/slippage                      ⚠️ Partiel
[ ] Q24 Risk-free rate documenté               ⚠️ Implicite
[ ] Q25 Double barrière LLM                    ✅ Oui
[ ] Q26 Fallback si >50% supprimé              ✅ Oui
[ ] Q27 Audit trail compliance                 ✅ Oui
[ ] Q28 Tilts documentés                       ✅ Désactivés
[ ] Q29 Safe mode tilts                        ✅ Oui
[ ] Q30 SLO/SLA définis                        ❌ À définir
[ ] Q31 Drift detection                        ❌ À implémenter
[ ] Q32 Golden portfolios tests                ❌ À créer
[ ] Q33 Secrets management                     ✅ Oui
[ ] Q34 API down handling                      ✅ Partiel
[ ] Q35 Schema versioning                      ❌ À implémenter
```

**Score: 17/35 (49%)**

---

## 🚦 Verdict

| Critère | Statut |
|---------|--------|
| **Prêt MVP interne** | ✅ Oui |
| **Prêt beta privée** | ⚠️ Avec disclaimers |
| **Prêt B2C payant** | ❌ Non (P0 requis) |
| **Prêt audit régulateur** | ❌ Non (P0+P1 requis) |

**Prochaine milestone:** Implémenter les 5 actions P0 → Score 22/35 → Beta publique possible.
