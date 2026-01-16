# RADAR TIE-BREAKER FIX v4.0.0

## Problème identifié

**Root cause** (diagnostiqué avec Claude + ChatGPT):

```python
# AVANT (problème):
self._macro_tilts = None  # ← reste None si market_context vide

if self.market_context:
    self._build_lookups()  # ← jamais appelé si market_context={}
```

**Conséquence**: `compute_factor_tactical_context()` fait un early-return → `_radar_matching` n'existe jamais → tie-breaker inopérant → **swaps = 0**.

## Solution en 4 fixes

### FIX #1: _macro_tilts fallback (factors.py)

Initialiser `_macro_tilts = DEFAULT_MACRO_TILTS.copy()` AVANT le if.

```python
# APRÈS (fix):
self._macro_tilts = DEFAULT_MACRO_TILTS.copy()  # ← Toujours initialisé

if self.market_context:
    self._build_lookups()
else:
    logger.warning("market_context vide → utilisation DEFAULT_MACRO_TILTS")
```

### FIX #1b: Helper bonus (factors.py)

Nouvelle fonction `compute_radar_bonus_from_matching()` pour calcul depuis `_radar_matching` existant.

### FIX #2-4: Tie-breaker (universe.py)

- `_calibrate_eps()`: EPS data-driven (0.25×std ou IQR/20)
- `_compute_radar_coverage()`: Check coverage minimum 40%
- `sector_balanced_selection()`: Tie-band + bonus RADAR + mesure swaps ON/OFF

## Impact attendu

| Métrique | Avant | Après |
|----------|-------|-------|
| Coverage `_radar_matching` | ~0% | ~80-100% |
| Swaps RADAR dans top-25 | 0 | 2-5 |
| EPS calibré | N/A | ~0.02 (data-driven) |

## Validation

```bash
python tests/test_radar_tiebreaker.py
```

Critères de succès:
- ✅ `_macro_tilts` non-None sans market_context
- ✅ `_radar_matching` créé pour tous les assets
- ✅ `compute_radar_bonus_from_matching()` fonctionne
- ✅ EPS calibré automatiquement
- ✅ 2-5 swaps dans top-25

## Auteurs

- Claude (Anthropic) - Diagnostic initial + implémentation
- ChatGPT (OpenAI) - Validation + identification root cause
