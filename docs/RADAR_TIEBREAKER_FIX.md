# RADAR TIE-BREAKER FIX v1.3

## Historique des versions

| Version | Date | Changements |
|---------|------|-------------|
| v1.0 | Initial | Diagnostic root cause |
| v1.1 | +deepcopy | Fix mutation global |
| v1.2 | +coverage meaningful | Fix métrique trompeuse |
| v1.3 | +coverage_tilt strict | Gate sur tilt effectif uniquement |

## Problème identifié

**Root cause** (diagnostiqué avec Claude + ChatGPT):

```python
# AVANT (problème):
self._macro_tilts = None  # ← reste None si market_context vide

if self.market_context:
    self._build_lookups()  # ← jamais appelé si market_context={}
```

**Chaîne de conséquences**:
1. `_macro_tilts = None`
2. `compute_factor_tactical_context()` early-return
3. `_radar_matching` jamais créé
4. Tie-breaker inopérant
5. **swaps = 0**

## Solution v1.3

### FIX #1: `_build_lookups()` TOUJOURS appelé

```python
# APRÈS:
self.market_context = market_context or {}
self._build_lookups()  # TOUJOURS
```

### FIX #2: `deepcopy` DANS `_build_lookups()`

```python
import copy

def _build_lookups(self):
    # v1.3: deepcopy TOUJOURS
    tilts_src = self.market_context.get("macro_tilts") or DEFAULT_MACRO_TILTS
    self._macro_tilts = copy.deepcopy(tilts_src)
```

### FIX #3: Coverage séparée mapping vs tilt

```python
def _compute_radar_coverage(assets):
    return {
        "coverage_mapping": ...,  # sector/region normalisé non vide
        "coverage_tilt": ...,     # favored/avoided EFFECTIF ← GATE ICI
    }
```

### FIX #4: `has_meaningful_radar()` strict

```python
def has_meaningful_radar(asset):
    m = asset.get("_radar_matching") or {}
    # STRICT: tilt effectif seulement
    return bool(
        m.get("sector_in_favored") or m.get("sector_in_avoided") or
        m.get("region_in_favored") or m.get("region_in_avoided")
    )
```

### FIX #5: `floor()` au lieu de `round()`

```python
# v1.3: floor() prévisible aux limites
bucket = math.floor(score / eps) if eps > 0 else 0
```

## Métriques de succès

| Métrique | Critère | Pourquoi |
|----------|---------|----------|
| `coverage_tilt` | ≥ 40% | Sinon tie-breaker auto-désactivé |
| `bonus std` | > 0.001 | Distribution non-dégénérée |
| `swaps ON/OFF` | Mesurable | Preuve que ça fonctionne |

⚠️ **Note**: "2-5 swaps" n'est PAS garanti. Si les top-25 n'ont pas de tilt, swaps peut être 0 même avec le fix. La vraie métrique est `coverage_tilt` + `bonus distribution`.

## Validation

```bash
python tests/test_radar_tiebreaker.py
```

Tests inclus:
1. ✅ `_macro_tilts` non-None sans market_context
2. ✅ `DEFAULT_MACRO_TILTS` immutable (anti-mutation)
3. ✅ `_radar_matching` créé pour tous les assets
4. ✅ `compute_radar_bonus_from_matching()` fonctionne
5. ✅ Coverage mapping vs tilt séparées
6. ✅ EPS calibré automatiquement
7. ✅ **Tie-breaker change effectivement l'ordre**
8. ✅ Distribution bonus non-dégénérée
9. ✅ Full selection avec RADAR

## Crédits

- **Claude** (Anthropic) - Diagnostic initial + implémentation
- **ChatGPT** (OpenAI) - Validation + identification pièges v1.1/v1.2/v1.3
