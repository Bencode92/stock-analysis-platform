# PR0-PR3 Architecture Documentation

## Overview

This document describes the new unified exposure and classification architecture implemented in PR0-PR3.

**Problem solved:** The previous codebase had two parallel systems (RiskBucket vs Role) that could produce divergent exposure calculations between `optimizer.py` and `constraint_report.py`.

**Solution:** A centralized system with:
1. Single source of truth for exposures (`exposures.py`)
2. Explicit classification with no silent defaults (`instrument_classifier.py`)
3. Soft penalties instead of hard constraints (`bucket_penalty.py`)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW                                      │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────────────┐
                    │  instrument_overrides │
                    │       .json           │
                    └───────────┬───────────┘
                                │
                                ▼
┌───────────────┐    ┌───────────────────────┐    ┌───────────────────────┐
│  source_data  │───▶│ instrument_classifier │───▶│  InstrumentClassifi-  │
│  (from API)   │    │       .py             │    │  cation objects       │
└───────────────┘    └───────────────────────┘    └───────────┬───────────┘
                                                              │
                     ┌────────────────────────────────────────┘
                     │
                     ▼
              ┌─────────────────┐
              │   exposures.py  │  ◀── SINGLE SOURCE OF TRUTH
              │                 │
              │ • compute_role_exposures()
              │ • compute_region_exposures()
              │ • compute_sector_exposures()
              │ • compute_hhi()
              └────────┬────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ optimizer   │ │ constraint  │ │   bucket    │
│    .py      │ │  _report.py │ │ _penalty.py │
└─────────────┘ └─────────────┘ └─────────────┘
```

---

## Module Descriptions

### 1. `exposures.py` (PR0)

**Purpose:** Single source of truth for all exposure calculations.

**Key Functions:**
```python
compute_role_exposures(weights, roles) → Dict[str, float]
compute_region_exposures(weights, regions, equity_only=True) → Dict[str, float]
compute_sector_exposures(weights, sectors, categories, equity_only=True) → Dict[str, float]
compute_hhi(weights) → Tuple[float, float]  # (HHI, effective_n)
compute_all_exposures(weights, asset_data) → ExposureResult
```

**Critical Design Decision:**
```python
# ❌ OLD CODE (silent default)
role = roles.get(asset_id, "satellite")  # Bug: masks classification errors

# ✅ NEW CODE (explicit unknown)
role = roles.get(asset_id, "unknown")  # Transparent: forces mapping fix
```

**Usage:**
```python
from portfolio_engine.exposures import compute_all_exposures

exposures = compute_all_exposures(weights, asset_data)
print(exposures.by_role)      # {"core": 0.4, "satellite": 0.3, ...}
print(exposures.unknown_weight)  # 0.0 if all mapped
print(exposures.is_execution_ready)  # True if unknown < 0.1%
```

---

### 2. `instrument_classifier.py` (PR1)

**Purpose:** Unified classification with override support.

**Priority Order:**
1. Explicit overrides from `instrument_overrides.json`
2. Automatic rules (category → role mapping)
3. "unknown" if nothing matches (NO silent default)

**Key Classes:**
```python
@dataclass
class InstrumentClassification:
    ticker: str
    role: str           # core | satellite | defensive | lottery | unknown
    risk_bucket: str    # equity_like | bond_like | leveraged | ...
    region: str
    sector: str
    category: str
    source: str         # "override" | "auto" | "unknown"
    is_valid: bool      # False if role or risk_bucket is "unknown"
```

**Usage:**
```python
from portfolio_engine.instrument_classifier import InstrumentClassifier

classifier = InstrumentClassifier()

# Single classification
cls = classifier.classify("AAPL", {"category": "Actions", "sector": "Technology"})
print(cls.role)  # "satellite"

# Portfolio validation
classifications = classifier.classify_portfolio(tickers, source_data_map)
is_ready, issues = classifier.validate_portfolio(classifications)
# is_ready = False if any instrument has role="unknown"
```

---

### 3. `instrument_overrides.json` (PR1)

**Purpose:** Explicit corrections for instruments that auto-classify incorrectly.

**Structure:**
```json
{
  "overrides": {
    "BUYW": {
      "role": "satellite",
      "risk_bucket": "equity_like",
      "region": "Global",
      "sector": "Diversified"
    },
    "TQQQ": {
      "role": "lottery",
      "risk_bucket": "leveraged",
      "flags": {"leveraged": true, "leverage_factor": 3.0}
    }
  }
}
```

**Corrected Instruments:**
| Ticker | Previous | Corrected |
|--------|----------|-----------|
| BUYW | Unknown | satellite/equity_like |
| CEFS | Unknown | satellite/alternative |
| FPE | Unknown | defensive/bond_like |
| TQQQ | satellite? | lottery/leveraged |

---

### 4. `bucket_penalty.py` (PR3)

**Purpose:** Soft enforcement of bucket targets (replaces hard SLSQP constraints).

**Why Soft Penalties?**
- Hard constraints make SLSQP infeasible when targets can't be met
- Soft penalties "orient" the optimizer without blocking
- Allows treating buckets as objectives vs absolute rules

**Key Functions:**
```python
bucket_penalty(w, asset_ids, roles, targets, lambda_bucket=20.0) → float
unknown_penalty(w, asset_ids, roles, lambda_unknown=50.0) → float
compute_total_bucket_penalty(...) → Tuple[float, Dict]  # penalty + diagnostics
create_penalty_function(...) → Callable  # Ready for optimizer integration
```

**Penalty Formula:**
```
penalty = Σ hinge²(exposure_role, min_target, max_target)

where hinge²(x, lo, hi) = {
    (lo - x)²  if x < lo
    0          if lo ≤ x ≤ hi
    (x - hi)²  if x > hi
}
```

**Calibration:**
- `lambda_bucket = 20.0` (relative to score scale 0-100)
- `lambda_unknown = 50.0` (high to force classification)

**Integration in optimizer.py:**
```python
from portfolio_engine.bucket_penalty import create_penalty_function

penalty_fn = create_penalty_function(
    asset_ids=candidate_ids,
    roles=role_mapping,
    targets=PROFILE_BUCKET_TARGETS[profile_name],
)

def objective(w):
    score = compute_score(w)
    vol_penalty = compute_vol_penalty(w)
    bucket_penalty = penalty_fn(w)
    return -(score - lambda_vol * vol_penalty - bucket_penalty)
```

---

## Migration Guide

### Step 1: Enable exposures.py

In `constraint_report.py`:
```python
from portfolio_engine.exposures import compute_all_exposures, USE_EXPOSURES_V2

def _compute_exposures(self, allocation, asset_by_id):
    if USE_EXPOSURES_V2:
        # New unified calculation
        weights = {a.id: w for a, w in allocation}
        asset_data = {a.id: extract_asset_data(a) for a, _ in allocation}
        return compute_all_exposures(weights, asset_data)
    else:
        # Old code (keep for dual-run comparison)
        return self._legacy_compute_exposures(allocation, asset_by_id)
```

### Step 2: Enable instrument_classifier.py

In `optimizer.py`:
```python
from portfolio_engine.instrument_classifier import InstrumentClassifier

classifier = InstrumentClassifier()
classifications = classifier.classify_portfolio(tickers, source_data_map)

# Validate before optimization
is_ready, issues = classifier.validate_portfolio(classifications)
if not is_ready:
    logger.warning(f"Portfolio has classification issues: {issues}")
    # Either: fix the issues, or proceed with warnings

role_mapping = classifier.get_role_mapping(classifications)
```

### Step 3: Enable bucket_penalty.py

In `optimizer.py`:
```python
from portfolio_engine.bucket_penalty import create_penalty_function

# In optimization setup
penalty_fn = create_penalty_function(
    asset_ids=candidate_ids,
    roles=role_mapping,
    targets=bucket_targets,
    lambda_bucket=20.0,
)

# In objective function
def objective(w):
    # ... existing score and vol_penalty calculation ...
    bucket_pen = penalty_fn(w)
    return -(score - lambda_vol * vol_penalty - bucket_pen)
```

---

## Testing

### Run all tests:
```bash
pytest tests/test_exposures.py -v
```

### Key test cases:
1. **HHI mathematical invariant:** `HHI = Σw² × 10000`
2. **No silent defaults:** Missing role → "unknown", NOT "satellite"
3. **Scope correctness:** `equity_only=True` excludes bonds from region calculation
4. **Sum validation:** `Σ exposures = 1.0 ± tolerance`

---

## Product Decision Required (PR2)

**Question:** Are bucket targets a **promise to clients** or an **indicator**?

| Option | Implication |
|--------|-------------|
| **Promise** | Must soft-enforce (PR3), show compliance status |
| **Indicator** | Rename "VIOLATED" to "outside target", remove constraint language |

**Recommended:** Soft-enforce via penalty (PR3) to start, decide on hard enforcement later based on data.

---

## File Summary

| File | PR | Purpose | Lines |
|------|-----|---------|-------|
| `exposures.py` | PR0 | Single source of truth for exposures | ~600 |
| `test_exposures.py` | PR0 | Unit tests for exposures | ~500 |
| `instrument_overrides.json` | PR1 | Explicit classification corrections | ~200 |
| `instrument_classifier.py` | PR1 | Unified classification system | ~400 |
| `bucket_penalty.py` | PR3 | Soft constraint enforcement | ~350 |

---

## Changelog

- **2024-12-21:** Initial PR0-PR3 implementation
  - Created `exposures.py` with unified exposure calculation
  - Created `instrument_classifier.py` with override support
  - Created `bucket_penalty.py` with soft penalties
  - Added comprehensive test suite
