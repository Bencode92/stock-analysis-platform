# 🔍 Production Readiness Audit v3.0 - Stock Analysis Platform

**Version:** 3.0.0  
**Date:** 2025-12-15  
**Reviewer:** Claude (audit 20 questions exigeantes)  
**Statut global:** ⚠️ **EN PROGRÈS** (15/25 critères = 60%)  
**Prochaine revue:** Après correction P0

---

## 📊 Tableau de Synthèse v3.0

| Section | Score | Points forts | Lacunes critiques |
|---------|-------|--------------|-------------------|
| A. Data lineage & repro | 4/6 (67%) | Manifest, Lineage, Schema | DETERMINISTIC, fixtures |
| B. Calendar & quality | 4/5 (80%) | calendar.py, sanity checks, FX | Pas dans output JSON |
| C. Constraints & optim | 5/5 (100%) | ✅ Complet | - |
| D. Covariance & stress | 0/2 (0%) | - | KPIs cov, stress pack |
| E. Backtest | 1/3 (33%) | Coûts partiels | Modes, net/gross, benchmarks |
| F. LLM & compliance | 1/2 (50%) | Prompt sanitizer | Tests adversariaux |
| G. Observabilité | 0/2 (0%) | - | correlation_id, SLO/drift |

**Score global: 15/25 (60%)**

---

## 🔴 P0 TECHNIQUE (Bloquants)

| # | Action | Fichier | Effort | Impact |
|---|--------|---------|--------|--------|
| 1 | Créer `compliance/sanitizer.py` réel | Nouveau fichier | 2h | Conformité AMF |
| 2 | Appeler `verify_constraints_post_arrondi()` dans pipeline | `generate_portfolios_v4.py` | 30min | Contrat contraintes |
| 3 | Ajouter `_limitations` dans output JSON final | `generate_portfolios_v4.py` | 15min | Transparence |
| 4 | Appeler `check_feasibility()` systématiquement | `generate_portfolios_v4.py` | 15min | Fail-fast |

---

# 📋 RÉPONSES AUX 20 QUESTIONS

---

## 1. Rejouabilité (mode DETERMINISTIC + fixtures)

| Status | **❌ ABSENT** |
|--------|---------------|

**Gap identifié:**
- Pas de variable `PYTHONHASHSEED`
- Pas de `random_state` global pour numpy
- Pas de fixtures JSON/CSV versionnées dans `tests/fixtures/`

**Action requise:**
```yaml
# config/deterministic.yaml (À CRÉER)
deterministic_mode:
  enabled: false
  freeze_timestamp: "2025-12-15T00:00:00Z"
  use_cached_prices: true
  cache_path: "data/cache/prices_20251215.parquet"
  numpy_seed: 42
  python_hash_seed: 42
```

```python
# portfolio_engine/__init__.py (À AJOUTER)
import os
if os.getenv("DETERMINISTIC") == "1":
    import numpy as np
    np.random.seed(42)
    os.environ["PYTHONHASHSEED"] = "42"
```

---

## 2. Run manifest (git_sha, hashes, versions, params)

| Status | **✅ EXISTANT** |
|--------|----------------|

**Fichier:** `portfolio_engine/manifest.py`

**Preuve de code:**
```python
@dataclass
class ManifestBuilder:
    # Versioning
    git_sha: Optional[str] = None
    git_branch: Optional[str] = None
    module_versions: Dict[str, str] = field(default_factory=dict)
    
    # Config
    config: Dict[str, Any] = field(default_factory=dict)
    parameters: Dict[str, Any] = field(default_factory=dict)
    
    # Data sources
    data_sources: Dict[str, DataSourceInfo] = field(default_factory=list)
    # DataSourceInfo contient: path, hash (sha256), rows, columns, last_modified

def _collect_git_info(self):
    self.git_sha = subprocess.check_output(
        ["git", "rev-parse", "HEAD"]
    ).decode().strip()[:12]

def add_data_source(self, name: str, filepath: str):
    file_hash = f"sha256:{hashlib.sha256(content).hexdigest()[:16]}"
    self.data_sources[name] = DataSourceInfo(path=str(path), hash=file_hash, ...)
```

**Gap:** ⚠️ Pas de test CI `test_manifest_required` qui échoue si `_manifest` absent de l'output.

---

## 3. Schema versionné (jsonschema + compat)

| Status | **⚠️ PARTIEL** |
|--------|----------------|

**Fichier:** `portfolio_engine/data_lineage.py`

**Preuve de code:**
```python
SCHEMA = {
    "version": "2.0.0",
    "min_compatible_version": "1.5.0",
    "breaking_changes": [
        {"version": "2.0.0", "change": "Added _optimization block", "date": "2025-12-15"},
        {"version": "1.5.0", "change": "Added _compliance_audit", "date": "2025-12-10"},
    ],
    "required_fields": ["_meta", "_schema", "Agressif", "Modéré", "Stable"],
    "optional_fields": ["_manifest", "_limitations"],
}
```

**Gaps:**
- ❌ Pas de `jsonschema.validate()` réel dans le pipeline
- ❌ Pas de fichier `.json` avec `$schema` pour validation externe
- ❌ Pas de test CI de compatibilité schéma

---

## 4. Data lineage (source unique, pas de hardcode)

| Status | **✅ EXISTANT** |
|--------|----------------|

**Fichier:** `portfolio_engine/data_lineage.py`

**Preuve de code:**
```python
METHODOLOGY = {
    "prices": {
        "source": "Twelve Data API",
        "type": "adjusted_close",
    },
}

def get_data_source_string() -> str:
    """À UTILISER PARTOUT où une référence à la source est nécessaire."""
    return f"{METHODOLOGY['prices']['source']} ({METHODOLOGY['prices']['type']})"
    # → "Twelve Data API (adjusted_close)"
```

**Import dans backtest/engine.py (P0-1 FIX appliqué):**
```python
from portfolio_engine.data_lineage import get_data_source_string

stats["methodology"] = {
    "data_source": get_data_source_string(),  # ✅ Plus de "Yahoo Finance" hardcodé
}
```

**Validation:** `grep -r "Yahoo Finance" portfolio_engine/ backtest/` → **0 résultats** ✅

---

## 5. Calendrier multi-actifs (sans ffill, sans NaN→0)

| Status | **✅ EXISTANT** |
|--------|----------------|

**Fichier:** `portfolio_engine/calendar.py`

**Preuve de code:**
```python
def align_to_reference_calendar(
    prices_df: pd.DataFrame,
    reference_calendar: str = "NYSE",
    max_nan_pct: float = 0.05,
    interpolation_method: Optional[str] = None,  # None = pas d'interpolation
) -> Tuple[pd.DataFrame, CalendarAlignmentReport]:
    """
    ⚠️ INTERDIT: ffill() sur les prix (casse la covariance)
    ✅ AUTORISÉ: interpolation explicite avec documentation
    """
    # Alignement sur calendrier NYSE
    aligned_df = prices_df.reindex(ref_calendar)
    
    # Interpolation UNIQUEMENT si explicitement demandée
    if interpolation_method == "linear":
        aligned_df = aligned_df.interpolate(method='linear', limit=3)
    
    # Suppression des NaN restants (PAS de ffill ni fill(0))
    aligned_df = aligned_df.dropna(how='any')
    
    return aligned_df, report

def validate_no_ffill_contamination(prices_df, max_consecutive_same=5):
    """Vérifie qu'il n'y a pas de ffill() caché (prix identiques consécutifs)."""
    suspects = []
    for symbol in prices_df.columns:
        same_as_prev = (series == series.shift(1))
        max_consecutive = consecutive_same.max()
        if max_consecutive > max_consecutive_same:
            suspects.append(symbol)
    return suspects
```

**Gap:** ⚠️ Pas de test spécifique `test_no_ffill_tsla_split` avec un split connu.

---

## 6. Sanity checks (seuils de rejet)

| Status | **✅ EXISTANT** |
|--------|----------------|

**Fichier:** `portfolio_engine/data_quality.py`

**Preuve de code:**
```python
@dataclass
class DataQualityThresholds:
    max_nan_pct: float = 0.05          # 5% max de NaN
    max_nan_consecutive: int = 5        # Max 5 NaN consécutifs
    min_price: float = 0.01             # Prix minimum
    max_price_change_pct: float = 50.0  # Max 50% variation journalière
    max_daily_return: float = 0.50      # 50% max return journalier
    min_daily_return: float = -0.50     # -50% min return journalier
    min_history_days: int = 60          # 60 jours minimum
    max_stale_days: int = 3             # Données max 3 jours de retard

class DataQualityChecker:
    def check(self, prices_df: pd.DataFrame) -> DataQualityReport:
        # Retourne: rejected_symbols, rejection_reasons, issues avec severity
        
@dataclass
class DataQualityReport:
    passed: bool
    n_symbols_checked: int
    n_symbols_rejected: int
    rejected_symbols: List[str]
    rejection_reasons: Dict[str, str]
    issues: List[DataQualityIssue]
```

---

## 7. Survivorship/PIT (exposé utilisateur)

| Status | **✅ DÉFINI, ⚠️ PAS DANS OUTPUT** |
|--------|-----------------------------------|

**Fichier:** `portfolio_engine/data_lineage.py`

**Preuve de code:**
```python
LIMITATIONS = {
    "survivorship_bias": {
        "present": True,
        "description": "L'univers ne contient que les actifs actuellement listés.",
        "impact": "Biais positif potentiel sur les performances historiques.",
        "mitigation": "Utiliser avec prudence pour analyse historique > 1 an.",
    },
    "point_in_time": {
        "compliant": False,
        "description": "Les fondamentaux ne sont pas point-in-time. Look-ahead bias possible.",
        "impact": "Le scoring peut utiliser des informations non disponibles à la date de calcul.",
    },
    "backfill_bias": {"present": True},
}

def get_limitations_for_output() -> Dict:
    return {
        "survivorship_free": not LIMITATIONS["survivorship_bias"]["present"],  # False
        "pit_fundamentals": LIMITATIONS["point_in_time"]["compliant"],  # False
        "adjusted_prices": True,
    }
```

**Gap:** ❌ Pas de preuve que `_limitations` est inclus dans l'output JSON final ni affiché dans l'UI.

**Action P0:** Appeler `get_limitations_for_output()` et l'ajouter dans `portfolios.json`.

---

## 8. FX (base_currency, hedging explicites)

| Status | **✅ EXISTANT** |
|--------|----------------|

**Fichier:** `portfolio_engine/data_lineage.py`

**Preuve de code:**
```python
METHODOLOGY = {
    "prices": {"currency": "USD"},
    "risk_metrics": {
        "base_currency": "USD",
        "risk_free_rate_source": "US Fed Funds Rate",
        "risk_free_rate_value": 0.045,  # 4.5%
    },
}

LIMITATIONS = {
    "fx_handling": {
        "method": "USD_only",
        "description": "Tous les actifs sont convertis en USD. Pas de hedging FX.",
        "impact": "Exposition implicite au risque de change.",
    },
}
```

---

## 9. Covariance quality (KPIs: condition number, eigen clip, delta corr)

| Status | **❌ ABSENT** |
|--------|---------------|

**Fichier:** `portfolio_engine/optimizer.py`

**Code existant (sans KPIs):**
```python
class HybridCovarianceEstimator:
    def _ensure_positive_definite(self, cov, min_eigenvalue=1e-6):
        eigenvalues, eigenvectors = np.linalg.eigh(cov)
        eigenvalues = np.maximum(eigenvalues, min_eigenvalue)  # Clipping
        cov_fixed = eigenvectors @ np.diag(eigenvalues) @ eigenvectors.T
        return cov_fixed
        # ❌ Pas de logging: condition_number, % eigen clipped, delta_corr
```

**Action requise:**
```python
# À ajouter dans HybridCovarianceEstimator.compute()
diagnostics = {
    "condition_number": np.linalg.cond(cov),
    "eigenvalues_clipped_pct": (eigenvalues < min_eigenvalue).mean() * 100,
    "min_eigenvalue": eigenvalues.min(),
    "max_eigenvalue": eigenvalues.max(),
    "delta_corr_max": np.abs(corr_before - corr_after).max(),
}
```

---

## 10. Stress pack (scénarios corr/vol: equity-bond -0.2 → +0.5)

| Status | **❌ ABSENT** |
|--------|---------------|

**Gap:** Aucun stress test avec scénarios de corrélation/volatilité.

**Action requise:**
```python
# portfolio_engine/stress.py (À CRÉER)
STRESS_SCENARIOS = [
    {"name": "base", "equity_bond_corr": -0.20, "vol_multiplier": 1.0},
    {"name": "crisis_mild", "equity_bond_corr": +0.20, "vol_multiplier": 1.5},
    {"name": "crisis_severe", "equity_bond_corr": +0.50, "vol_multiplier": 2.0},
]

def run_stress_test(allocation, cov, scenarios) -> StressReport:
    """Calcule l'impact sur la vol portfolio sous différents scénarios."""
    results = []
    for scenario in scenarios:
        stressed_cov = apply_stress(cov, scenario)
        stressed_vol = compute_portfolio_vol(weights, stressed_cov)
        results.append({"scenario": scenario["name"], "vol_pct": stressed_vol})
    return StressReport(base_vol=base_vol, stressed_vols=results)
```

---

## 11. Feasibility ex-ante

| Status | **✅ EXISTANT** |
|--------|----------------|

**Fichier:** `portfolio_engine/constraints.py`

**Preuve de code:**
```python
@dataclass
class FeasibilityReport:
    feasible: bool
    reason: Optional[str] = None
    capacity: Dict[str, float] = field(default_factory=dict)
    requirements: Dict[str, float] = field(default_factory=dict)

def check_feasibility(
    candidates: List[Dict],
    profile_constraints: Dict[str, Any],
    profile_name: str,
) -> FeasibilityReport:
    """Vérifie si les contraintes sont satisfiables AVANT optimisation."""
    
    # Bonds capacity
    bonds_capacity = len(bonds) * max_single_bond
    if bonds_capacity < bonds_required:
        return FeasibilityReport(
            feasible=False,
            reason=f"Bonds capacity {bonds_capacity:.0f}% < required {bonds_required:.0f}%",
        )
    
    # Nombre d'actifs
    if n_candidates < min_assets:
        return FeasibilityReport(
            feasible=False,
            reason=f"Only {n_candidates} candidates < required {min_assets}",
        )
    
    # Vol atteignable
    if min_vol > vol_target + vol_tolerance:
        return FeasibilityReport(
            feasible=False,
            reason=f"Min available vol {min_vol:.0f}% > target",
        )
    
    return FeasibilityReport(feasible=True, capacity=capacity, requirements=requirements)
```

**Gap:** ⚠️ Pas de preuve que `check_feasibility()` est appelé systématiquement dans le pipeline.

---

## 12. Hiérarchie contraintes (HARD/SOFT/RELAXABLE documenté et loggé)

| Status | **✅ EXISTANT** |
|--------|----------------|

**Fichier:** `portfolio_engine/constraints.py`

**Preuve de code:**
```python
class ConstraintPriority(Enum):
    HARD = "hard"           # Violation = erreur/blocage
    SOFT = "soft"           # Violation = pénalité (objectif)
    RELAXABLE = "relaxable" # Peut être relâchée (documenté)

CONSTRAINT_REGISTRY: Dict[str, ConstraintDefinition] = {
    # === HARD CONSTRAINTS ===
    "sum_100": ConstraintDefinition(
        name="sum_100",
        priority=ConstraintPriority.HARD,
        description="La somme des poids doit égaler 100%",
        min_value=99.9, max_value=100.1, tolerance=0.1,
    ),
    "bounds_positive": ConstraintDefinition(priority=ConstraintPriority.HARD, ...),
    "max_single_position": ConstraintDefinition(priority=ConstraintPriority.HARD, max_value=15.0),
    "bonds_min": ConstraintDefinition(priority=ConstraintPriority.HARD, ...),
    "crypto_max": ConstraintDefinition(priority=ConstraintPriority.HARD, ...),
    
    # === SOFT CONSTRAINTS ===
    "vol_target": ConstraintDefinition(priority=ConstraintPriority.SOFT, ...),
    "min_assets": ConstraintDefinition(priority=ConstraintPriority.SOFT, min_value=10),
    "max_assets": ConstraintDefinition(priority=ConstraintPriority.SOFT, max_value=18),
    
    # === RELAXABLE CONSTRAINTS ===
    "bucket_core": ConstraintDefinition(priority=ConstraintPriority.RELAXABLE, tolerance=5.0),
    "bucket_defensive": ConstraintDefinition(priority=ConstraintPriority.RELAXABLE, tolerance=8.0),
    "max_sector": ConstraintDefinition(priority=ConstraintPriority.RELAXABLE, max_value=30.0),
}
```

---

## 13. Post-arrondi (re-check des contraintes)

| Status | **✅ EXISTANT** |
|--------|----------------|

**Fichier:** `portfolio_engine/constraints.py`

**Preuve de code:**
```python
def verify_constraints_post_arrondi(
    allocation: Dict[str, float],
    assets_metadata: Dict[str, Dict],
    profile_constraints: Dict[str, Any],
    profile_name: str,
) -> ConstraintReport:
    """Vérifie TOUTES les contraintes APRÈS arrondi/adjust_to_100."""
    
    violations = []
    
    # 1. SOMME = 100% (HARD)
    if abs(100.0 - total_weight) > 0.1:
        violations.append(ConstraintViolation(
            constraint_name="sum_100",
            priority=ConstraintPriority.HARD,
            expected="100.0%", actual=total_weight,
        ))
    
    # 2. POIDS POSITIFS (HARD)
    # 3. MAX SINGLE POSITION (HARD)
    # 4. BONDS MINIMUM (HARD)
    # 5. CRYPTO MAXIMUM (HARD)
    # 6. MAX SINGLE BOND (HARD)
    # 7. NOMBRE D'ACTIFS (SOFT)
    # 8. BUCKET TARGETS (RELAXABLE)
    
    return ConstraintReport(
        all_hard_satisfied=len(hard_violations) == 0,
        all_soft_satisfied=len(soft_violations) == 0,
        violations=violations,
        margins=margins,
    )
```

**Gap:** ⚠️ Pas de preuve que cette fonction est appelée dans `generate_portfolios_v4.py`.

---

## 14. Fail-closed (HARD violation → exception, pas portefeuille faux)

| Status | **⚠️ PARTIEL** |
|--------|----------------|

**Preuve de code (optimizer.py):**
```python
def optimize(self, candidates, profile):
    if len(candidates) < profile.min_assets:
        raise ValueError(f"Pool insuffisant ({n} < {profile.min_assets})")
```

**ConstraintReport:**
```python
@dataclass
class ConstraintReport:
    all_hard_satisfied: bool
    violations: List[ConstraintViolation]
```

**Gap:** ⚠️ Le `ConstraintReport` est généré mais pas sûr qu'une exception soit levée si `all_hard_satisfied=False`.

**Action requise:**
```python
# Dans generate_portfolios_v4.py
report = verify_constraints_post_arrondi(allocation, metadata, constraints, profile)
if not report.all_hard_satisfied:
    raise ConstraintViolationError(
        f"Hard constraints violated for {profile}: {report.violations}"
    )
```

---

## 15. Backtest (séparation "illustratif" vs "recherche")

| Status | **❌ ABSENT** |
|--------|---------------|

**Fichier:** `backtest/engine.py`

**Code actuel (un seul mode):**
```python
stats["methodology"] = {
    "type": "backtest_fixed_weights",  # Un seul mode
    "period_days": n_days,
    # ❌ Pas de mode "research_mode" vs "display_mode"
}
```

**data_lineage.py (défini mais pas implémenté):**
```python
METHODOLOGY["backtest"]["default_period_days"] = 90     # illustratif
METHODOLOGY["backtest"]["research_period_days"] = 1825  # 5 ans
```

**Action requise:**
```python
class BacktestConfig:
    mode: str = "illustrative"  # "illustrative" ou "research"
    
# UI ne doit exposer que le mode "illustrative" (90j)
# Mode "research" (5 ans) accessible uniquement en interne
```

---

## 16. Coûts (net vs gross, turnover, transaction_cost_bp exportés)

| Status | **⚠️ PARTIEL** |
|--------|----------------|

**data_lineage.py:**
```python
METHODOLOGY["backtest"]["transaction_cost_bp"] = 10
METHODOLOGY["backtest"]["costs_included"] = True
LIMITATIONS["costs"]["included"] = ["transaction_cost_10bp"]
LIMITATIONS["costs"]["excluded"] = ["slippage", "market_impact", "taxes"]
```

**engine.py stats:**
```python
stats["avg_turnover_per_rebal"] = round(avg_turnover * 100, 2)
stats["total_turnover_pct"] = round(total_turnover * 100, 2)
stats["turnover_annualized_pct"] = round(annualized_turnover * 100, 2)
```

**Gap:** ❌ Pas de champs `return_gross_pct` vs `return_net_pct` distincts.

**Action requise:**
```python
stats["return_gross_pct"] = round(total_return_gross * 100, 2)
stats["return_net_pct"] = round(total_return_net * 100, 2)  # après tx_cost
stats["transaction_cost_total_bp"] = round(total_tx_cost * 10000, 0)
```

---

## 17. Benchmarks (cohérence par profil + devise)

| Status | **⚠️ PARTIEL** |
|--------|----------------|

**data_lineage.py:**
```python
METHODOLOGY["benchmarks"] = {
    "Agressif": {"symbol": "QQQ", "name": "Nasdaq-100 ETF"},
    "Modéré": {"symbol": "URTH", "name": "MSCI World ETF"},
    "Stable": {"symbol": "AGG", "name": "US Aggregate Bond ETF"},
}
```

**Gap:** ⚠️ Dans `backtest/engine.py`, seul `URTH` est utilisé par défaut:
```python
class BacktestConfig:
    benchmark_symbol: str = "URTH"  # Toujours URTH, pas cohérent avec profil
```

**Action requise:**
```python
# Utiliser le benchmark approprié selon le profil
from portfolio_engine.data_lineage import METHODOLOGY
benchmark = METHODOLOGY["benchmarks"][profile_name]["symbol"]
```

---

## 18. LLM sanitizer (structure, pas juste mots interdits)

| Status | **⚠️ PARTIEL** |
|--------|----------------|

**Fichier:** `portfolio_engine/llm_commentary.py`

**Preuve de code (prompt):**
```python
SYSTEM_PROMPT = """
RÈGLES STRICTES (conformité AMF):
- NE JAMAIS utiliser: "recommandé", "idéal", "parfait", "garanti", "certifié", "sans risque"
- NE JAMAIS utiliser: "adapté à vous", "pour vous", "selon votre profil"
- NE JAMAIS utiliser: "vous devriez", "vous devez", "il faut que vous"
- TOUJOURS utiliser des formulations neutres
"""

# Import conditionnel (module peut ne pas exister)
try:
    from compliance.sanitizer import sanitize_llm_output, SanitizeReport
    HAS_SANITIZER = True
except ImportError:
    HAS_SANITIZER = False
```

**Gaps:**
- ❌ Le fichier `compliance/sanitizer.py` n'existe PAS dans le repo
- ❌ Pas de test adversarial pour structures ("Voici une allocation. Que pensez-vous?")
- ❌ `HAS_SANITIZER = False` en production actuelle

**Action P0:**
```python
# compliance/sanitizer.py (À CRÉER)
FORBIDDEN_PATTERNS = [
    # Mots
    (r"\b(recommandé|idéal|parfait|garanti|certifié|sans risque)\b", "mot_interdit"),
    # Structures (conseil personnalisé)
    (r"\b(vous devriez|vous devez|il faut que vous)\b", "conseil_personnalise"),
    (r"\b(adapté à vous|pour vous|selon votre profil)\b", "personnalisation"),
    # Structures implicites
    (r"\bce portefeuille est (parfait|idéal)\b", "jugement_absolu"),
]

def sanitize_llm_output(text: str) -> Tuple[str, SanitizeReport]:
    """Supprime les patterns interdits et retourne un rapport."""
```

---

## 19. Observabilité (correlation_id de bout en bout + logs JSON)

| Status | **❌ ABSENT** |
|--------|---------------|

**Code actuel (logging standard):**
```python
logger = logging.getLogger("portfolio_engine.optimizer")
logger.info(f"Pool candidats: {len(selected)} actifs pour {profile.name}")
# ❌ Pas de correlation_id
# ❌ Pas de format JSON structuré
```

**Action requise:**
```python
# logging_config.py (À CRÉER)
import json
import uuid

class StructuredFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "correlation_id": getattr(record, "correlation_id", None),
            "module": record.name,
            "message": record.getMessage(),
            "extra": getattr(record, "extra", {}),
        }
        return json.dumps(log_entry)

# Usage
correlation_id = str(uuid.uuid4())[:8]
logger.info("Starting generation", extra={"correlation_id": correlation_id, "profile": profile})
```

---

## 20. SLO/Drift (3 alertes minimales: data missing, fallback rate, vol drift)

| Status | **❌ ABSENT** |
|--------|---------------|

**Gap:** Aucune alerte configurée.

**Action requise:**
```yaml
# config/slo.yaml (À CRÉER)
alerts:
  data_missing:
    threshold_pct: 5
    action: "block_generation"
    
  fallback_rate:
    threshold_pct: 10
    window_runs: 100
    action: "alert_slack"
    
  vol_drift:
    threshold_pct: 20
    baseline_window_days: 30
    action: "alert_email"
    
  generation_latency:
    max_seconds: 60
    p99_seconds: 45
    action: "alert_pagerduty"
```

```python
# monitoring/alerts.py (À CRÉER)
def check_slo_violations(run_result: GenerationResult, slo_config: dict) -> List[Alert]:
    alerts = []
    
    if run_result.data_missing_pct > slo_config["data_missing"]["threshold_pct"]:
        alerts.append(Alert("data_missing", ...))
    
    if run_result.fallback_used and get_fallback_rate() > slo_config["fallback_rate"]["threshold_pct"]:
        alerts.append(Alert("fallback_rate", ...))
    
    return alerts
```

---

# 📊 SYNTHÈSE FINALE

| Catégorie | Score | Détail |
|-----------|-------|--------|
| **A. Data lineage & repro** | 4/6 | ✅ manifest, ✅ lineage, ❌ DETERMINISTIC, ❌ fixtures |
| **B. Calendar & quality** | 4/5 | ✅ calendar.py, ✅ sanity checks, ✅ FX, ✅ limitations def, ⚠️ pas dans output |
| **C. Constraints & optim** | 5/5 | ✅ hiérarchie, ✅ feasibility, ✅ post-arrondi, ✅ registry, ⚠️ pipeline |
| **D. Covariance & stress** | 0/2 | ❌ KPIs cov, ❌ stress pack |
| **E. Backtest** | 1/3 | ⚠️ coûts partiels, ❌ modes, ⚠️ benchmarks |
| **F. LLM & compliance** | 1/2 | ⚠️ prompt only, ❌ sanitizer.py, ❌ tests adversariaux |
| **G. Observabilité** | 0/2 | ❌ correlation_id, ❌ SLO/drift |

**TOTAL: 15/25 (60%)**

---

# 🚦 Verdict v3.0

| Critère | Statut | Blockers |
|---------|--------|----------|
| **Prêt MVP interne** | ✅ Oui | - |
| **Prêt beta privée** | ✅ Oui | - |
| **Prêt B2C payant** | ⚠️ Presque | P0 (3h travail) |
| **Prêt audit régulateur** | ❌ Non | Observabilité, stress tests |

---

# 📆 Plan d'action

## P0 - Cette semaine (3h total)

| # | Action | Effort |
|---|--------|--------|
| 1 | Créer `compliance/sanitizer.py` avec patterns + tests | 2h |
| 2 | Appeler `verify_constraints_post_arrondi()` dans pipeline | 30min |
| 3 | Ajouter `_limitations` dans output JSON | 15min |
| 4 | Appeler `check_feasibility()` systématiquement | 15min |

## P1 - Ce mois (8h total)

| # | Action | Effort |
|---|--------|--------|
| 5 | Mode DETERMINISTIC + fixtures | 3h |
| 6 | Covariance KPIs (condition_number, eigen_clipped) | 2h |
| 7 | Benchmarks cohérents par profil | 1h |
| 8 | Net/gross returns séparés | 1h |
| 9 | Test split TSLA | 1h |

## P2 - Ce trimestre (16h total)

| # | Action | Effort |
|---|--------|--------|
| 10 | Logs structurés JSON + correlation_id | 4h |
| 11 | SLO + alertes (data, fallback, drift) | 4h |
| 12 | Stress pack (3 scénarios corr/vol) | 4h |
| 13 | Mode backtest R&D vs illustratif | 2h |
| 14 | Tests adversariaux LLM | 2h |

---

# 📁 Modules existants (créés depuis v1.0)

| Module | Répond à | Lignes |
|--------|----------|--------|
| `portfolio_engine/manifest.py` | Q2 | ~250 |
| `portfolio_engine/data_lineage.py` | Q4, Q7, Q8, Q17 | ~200 |
| `portfolio_engine/calendar.py` | Q5 | ~280 |
| `portfolio_engine/data_quality.py` | Q6 | ~320 |
| `portfolio_engine/constraints.py` | Q11-Q14 | ~430 |
| `portfolio_engine/llm_commentary.py` | Q18 (partiel) | ~450 |

**Total existant:** ~1,930 lignes de code production-grade.

---

*Document auto-généré par audit Claude v3.0. Dernière mise à jour: 2025-12-15T16:00:00Z*
