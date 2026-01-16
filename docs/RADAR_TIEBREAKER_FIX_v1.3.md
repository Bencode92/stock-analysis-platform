# RADAR TIE-BREAKER FIX v1.3

## Changelog

### v1.3 (Corrections ChatGPT)
- **deepcopy dans `_build_lookups()`** : Évite mutation du global
- **Coverage séparée** : `mapping` vs `tilt` (gate sur `tilt`)
- **`floor()` au lieu de `round()`** : Comportement prévisible
- **Tests renforcés** : Anti-mutation, ordre tie-breaker, distribution bonus

### v1.2 (Corrections initiales)
- deepcopy pour _macro_tilts
- Coverage meaningful

### v1.1
- _build_lookups() toujours appelé
- deepcopy (incomplet)

### v1.0
- Diagnostic initial

---

## Root Cause

```python
# AVANT (problème):
self._macro_tilts = None  # ← reste None si market_context vide

if self.market_context:
    self._build_lookups()  # ← jamais appelé si market_context={}
```

**Conséquence** : `_radar_matching` jamais créé → tie-breaker inopérant → swaps = 0

---

## Solution v1.3

### 1. `_build_lookups()` avec deepcopy

```python
import copy

def _build_lookups(self):
    # ...
    # v1.3 FIX: deepcopy TOUJOURS
    tilts_src = self.market_context.get("macro_tilts") or DEFAULT_MACRO_TILTS
    self._macro_tilts = copy.deepcopy(tilts_src)
    # ...
```

### 2. Coverage séparée

```python
def _compute_radar_coverage(assets):
    return {
        "coverage_raw": ...,      # Clé _radar_matching présente
        "coverage_mapping": ...,  # sector/region_normalized non vide
        "coverage_tilt": ...,     # favored/avoided effectif ← GATE
    }
```

### 3. Gate sur `coverage_tilt`

```python
if coverage_stats["coverage_tilt"] < radar_min_coverage:
    radar_active = False
```

### 4. `floor()` pour bucketisation

```python
bucket = math.floor(score / eps)  # Pas round()
```

---

## Tests v1.3 (9 tests)

| Test | Description |
|------|-------------|
| #1 | `_macro_tilts` fallback |
| #2 | `DEFAULT_MACRO_TILTS` immutable (anti-mutation) |
| #3 | `_radar_matching` créé |
| #4 | `compute_radar_bonus` fonctionne |
| #5 | Coverage tilt vs mapping séparées |
| #6 | `_calibrate_eps` data-driven |
| #7 | **Tie-breaker change l'ordre** |
| #8 | **Distribution bonus non-dégénérée** |
| #9 | Full selection end-to-end |

---

## Impact attendu

| Métrique | Avant | Après |
|----------|-------|-------|
| Coverage `_radar_matching` | ~0% | ~80-100% |
| Coverage tilt (effectif) | 0% | Variable (dépend univers) |
| Swaps RADAR top-25 | 0 | 2-5 (si coverage_tilt > 40%) |

⚠️ **Note** : 2-5 swaps n'est pas garanti. La bonne métrique est :
- `coverage_tilt >= 40%` sur top-100
- Distribution `_radar_bonus` non-dégénérée (std > 0)

---

## Validation

```bash
python tests/test_radar_tiebreaker.py
```

---

## Crédits

- **Claude** (Anthropic) - Diagnostic + Implémentation
- **ChatGPT** (OpenAI) - Review + Corrections critiques v1.2/v1.3
