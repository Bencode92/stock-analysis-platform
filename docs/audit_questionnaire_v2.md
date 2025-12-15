# 📋 Réponse au Questionnaire ChatGPT v2.0

**Date:** 2025-12-15  
**Version:** 1.0.0  
**Statut:** EN COURS D'IMPLÉMENTATION

---

## Score Résumé

| Section | Questions | Répondu | Implémenté |
|---------|-----------|---------|------------|
| A. Data lineage & reproductibilité | 8 | 8/8 | 6/8 |
| B. Calendrier & data quality | 7 | 7/7 | 5/7 |
| C. Contraintes & optimisation | 5 | 5/5 | 5/5 |
| D. Backtest & métriques | 5 | 5/5 | 3/5 |
| E. Observabilité | 4 | 4/4 | 2/4 |
| **TOTAL** | **29** | **29/29** | **21/29** |

---

## A. Data lineage & reproductibilité (8)

### Q1. As-tu un `_manifest` complet par run ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `portfolio_engine/manifest.py`

```python
from portfolio_engine.manifest import ManifestBuilder

manifest = ManifestBuilder()
manifest.start()
manifest.add_data_source("stocks_us", "data/stocks_us.json")
# ... génération ...
manifest.end()
result = manifest.to_dict()
```

**Contenu du manifest:**
- `git_sha`, `git_branch`
- `module_versions` (numpy, pandas, portfolio_engine)
- `config` et `parameters`
- `data_sources` avec hash SHA256
- `execution` (start_time, end_time, duration_ms, timezone)
- `errors`, `warnings`

---

### Q2. Ton schéma JSON est-il versionné et validé ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `portfolio_engine/data_lineage.py`

```python
SCHEMA = {
    "version": "2.0.0",
    "min_compatible_version": "1.5.0",
    "breaking_changes": [...],
    "required_fields": ["_meta", "_schema", "Agressif", "Modéré", "Stable"],
}
```

**TODO:** Validation pydantic en CI.

---

### Q3. Peux-tu rerun "à l'identique" offline ?

**Statut:** ⚠️ PARTIEL  
**Preuve:** `CONFIG.use_tactical_context = False` désactive LLM pour les poids.

**TODO:** Mode `DETERMINISTIC=true` complet avec:
- Cache prix local
- Freeze timestamp
- Seed random (si utilisé)

---

### Q4. Tes tris sont-ils totalement stables ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `portfolio_engine/optimizer.py`

```python
# Tri stable par (score DESC, id ASC)
sorted_assets = sorted(universe, key=lambda x: (-x.score, x.id))
```

---

### Q5. As-tu un contrôle "data_source unique" importé partout ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `portfolio_engine/data_lineage.py`

```python
from portfolio_engine.data_lineage import METHODOLOGY, get_data_source_string

# Plus de "Yahoo Finance" hardcodé
data_source = get_data_source_string()  # "Twelve Data API (adjusted_close)"
```

**FIX appliqué:** `backtest/engine.py` corrigé ("Yahoo Finance" → import depuis METHODOLOGY).

---

### Q6. Peux-tu prouver l'absence de look-ahead ou l'exposer ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `portfolio_engine/data_lineage.py`

```python
LIMITATIONS = {
    "point_in_time": {
        "compliant": False,
        "description": "Les fondamentaux ne sont pas point-in-time.",
    },
    "survivorship_bias": {
        "present": True,
        "description": "L'univers ne contient que les actifs listés.",
    },
}

# Exposé dans output JSON
"_limitations": get_limitations_for_output()
```

---

### Q7. As-tu un test "reproductibilité 20 runs" ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `tests/test_golden.py::TestGoldenReproducibility`

```python
@pytest.mark.parametrize("run_id", range(20))
def test_invariants_multiple_runs(self, run_id):
    # Vérifie que les invariants sont stables
```

---

### Q8. As-tu une matrice de compatibilité ?

**Statut:** ⚠️ PARTIEL  
**Preuve:** `SCHEMA.min_compatible_version` dans `data_lineage.py`.

**TODO:** Doc complète matrice versions.

---

## B. Calendrier multi-actifs & data quality (7)

### Q9. Comment alignes-tu actions vs crypto sans ffill() ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `portfolio_engine/calendar.py`

```python
def align_to_reference_calendar(
    prices_df: pd.DataFrame,
    reference_calendar: str = "NYSE",
    max_nan_pct: float = 0.05,
    interpolation_method: Optional[str] = None,  # None = pas d'interpolation
) -> Tuple[pd.DataFrame, CalendarAlignmentReport]:
    """
    ⚠️ IMPORTANT: Cette fonction n'utilise JAMAIS ffill().
    """
```

**FIX appliqué:** `backtest/data_loader.py` modifié pour utiliser `calendar.py`.

---

### Q10. Quels sont tes seuils de rejet data ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `portfolio_engine/data_quality.py`

```python
@dataclass
class DataQualityThresholds:
    max_nan_pct: float = 0.05          # 5% max de NaN
    max_nan_consecutive: int = 5        # Max 5 NaN consécutifs
    min_price: float = 0.01             # Prix minimum
    max_daily_return: float = 0.50      # 50% max return
    min_history_days: int = 60          # 60 jours minimum

checker = DataQualityChecker()
report = checker.check(prices_df)  # DataQualityReport
```

---

### Q11. Comment gères-tu delisting/survivorship ?

**Statut:** ✅ DOCUMENTÉ  
**Preuve:** `LIMITATIONS["survivorship_bias"]` dans `data_lineage.py`.

Limitation exposée, pas de promesse implicite.

---

### Q12. As-tu des tests sur corporate actions ?

**Statut:** ⚠️ NON  
**TODO:** Test sur split TSLA (août 2022).

---

### Q13. FX : base_currency explicitée ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `METHODOLOGY["risk_metrics"]`

```python
"risk_metrics": {
    "base_currency": "USD",
    "risk_free_rate_source": "US Fed Funds Rate",
    "risk_free_rate_value": 0.045,
}
```

---

### Q14. As-tu une couverture "univers coverage" ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `portfolio_engine/data_quality.py::UniverseCoverageReport`

```python
@dataclass
class UniverseCoverageReport:
    total_requested: int
    total_resolved: int
    total_with_data: int
    coverage_pct: float
    rejected_no_ticker: List[str]
    rejected_no_data: List[str]
    rejected_quality: List[str]
```

---

### Q15. As-tu un "data freshness SLA" ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `portfolio_engine/data_quality.py::check_data_freshness()`

```python
is_fresh, details = check_data_freshness(prices_df, max_stale_days=3)
# {"last_data_date": "2025-12-13", "stale_days": 2, "is_fresh": True}
```

---

## C. Contraintes & optimisation (5)

### Q16. As-tu un constraint_report post-arrondi ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `portfolio_engine/constraints.py`

```python
report = verify_constraints_post_arrondi(
    allocation={"AAPL": 12.5, "AGG": 35.0, ...},
    assets_metadata=metadata,
    profile_constraints=constraints,
    profile_name="Stable"
)

# report.all_hard_satisfied = True/False
# report.violations = [...]
# report.margins = {"bonds_min": 5.2, ...}
```

---

### Q17. As-tu une fonction de repair ?

**Statut:** ✅ EXISTANT  
**Preuve:** `optimizer.py::_fallback_allocation()` respecte tous les caps.

---

### Q18. As-tu un test de faisabilité ex-ante ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `portfolio_engine/constraints.py::check_feasibility()`

```python
report = check_feasibility(candidates, profile_constraints, "Stable")
if not report.feasible:
    raise InfeasibleError(report.reason)
```

---

### Q19. Hiérarchie des contraintes formalisée ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `portfolio_engine/constraints.py`

```python
class ConstraintPriority(Enum):
    HARD = "hard"           # Jamais violée
    SOFT = "soft"           # Pénalisée
    RELAXABLE = "relaxable"  # Peut être relâchée

CONSTRAINT_REGISTRY = {
    "sum_100": ConstraintDefinition(priority=ConstraintPriority.HARD, ...),
    "vol_target": ConstraintDefinition(priority=ConstraintPriority.SOFT, ...),
    "bucket_core": ConstraintDefinition(priority=ConstraintPriority.RELAXABLE, ...),
}
```

---

### Q20. "Stable = heuristique" exposé côté sortie ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `generate_portfolios_v4.py` et output JSON

```json
"_optimization": {
    "mode": "fallback_heuristic",
    "is_heuristic": true,
    "disclaimer": "Ce portefeuille utilise une allocation heuristique..."
}
```

---

## D. Backtest & métriques (5)

### Q21. Coûts : inclus ou exclus ?

**Statut:** ✅ CLARIFIÉ  
**Preuve:** `METHODOLOGY["backtest"]["costs_included"] = True`

```python
# engine.py
"methodology": {
    "transaction_cost_bp": 10,
    "costs_included": True,
    "data_source": get_data_source_string(),  # FIX: plus "Yahoo Finance"
}
```

---

### Q22. Séparé "illustratif" vs "research" ?

**Statut:** ⚠️ PARTIEL  
**TODO:** Deux modes distincts avec métriques différentes.

---

### Q23. Turnover + coûts estimés + net/gross ?

**Statut:** ⚠️ PARTIEL  
**Existant:** `turnover_annualized_pct` dans stats.

**TODO:** `net_return_pct` vs `gross_return_pct`.

---

### Q24. Sharpe masqué < 252j ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `backtest/engine.py`

```python
if n_days < MIN_DAYS_FOR_STATS:
    stats["sharpe_ratio"] = None
    stats["sharpe_display"] = "Non calculable (période < 1 an)"
```

---

### Q25. Benchmarks cohérents ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `METHODOLOGY["benchmarks"]`

```python
"benchmarks": {
    "Agressif": {"symbol": "QQQ"},
    "Modéré": {"symbol": "URTH"},
    "Stable": {"symbol": "AGG"},
}
```

---

## E. Observabilité & exploitation (4)

### Q26. SLO définis et mesurés ?

**Statut:** ❌ NON  
**TODO:** `monitoring/slo.yaml`

---

### Q27. Drift detection ?

**Statut:** ❌ NON  
**TODO:** `monitoring/drift.py`

---

### Q28. Golden tests ?

**Statut:** ✅ IMPLÉMENTÉ  
**Preuve:** `tests/test_golden.py`

---

### Q29. Logs structurés JSON + correlation_id ?

**Statut:** ⚠️ PARTIEL  
**Existant:** Logs structurés via `logging`.

**TODO:** `correlation_id` par run.

---

## Incohérences Factuelles Corrigées

| Problème | Fichier | Fix |
|----------|---------|-----|
| `ffill()` sur prix | `backtest/data_loader.py` | Remplacé par `calendar.align_to_reference_calendar()` |
| "Yahoo Finance" | `backtest/engine.py` | Import depuis `METHODOLOGY` |
| Narratif "incompatible" Stable | `optimizer.py` | Documentation cohérente |

---

## Plan d'Action Restant

### P0 (Cette semaine)
- [x] ~~calendar.py sans ffill()~~
- [x] ~~constraints.py post-arrondi~~
- [x] ~~data_lineage.py METHODOLOGY~~
- [ ] Intégration dans `generate_portfolios_v4.py`

### P1 (Semaine prochaine)
- [ ] Mode DETERMINISTIC complet
- [ ] Test split TSLA
- [ ] net/gross returns

### P2 (Mois prochain)
- [ ] SLO dashboard
- [ ] Drift detection
- [ ] Validation pydantic CI
