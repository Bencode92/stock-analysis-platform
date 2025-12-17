# Market/Sector Radar v1.1

## Overview

Module déterministe pour générer des tilts tactiques basés sur les performances secteurs/marchés. Alternative au mode GPT, 100% data-driven et AMF-compliant.

## Fonctionnement

### Classification des secteurs/régions

| YTD | Daily | Classification | Raison |
|-----|-------|----------------|--------|
| < 0% | any | **AVOIDED** | Underperform |
| ≥ 50% | any | **NEUTRAL** | Surchauffe (mais pas de malus) |
| 10-35% | ≥ -0.5% | **FAVORED** | Sweet spot |
| autre | any | **NEUTRAL** | Hors zone |

### Régime de marché

- **risk-on** : ≥60% des secteurs ont YTD > 0
- **risk-off** : ≥60% des secteurs ont YTD < 0  
- **neutral** : marché mixte

## Usage standalone

```bash
# Générer market_context.json
python -m portfolio_engine.market_sector_radar --data-dir data

# Avec smoothing personnalisé
python -m portfolio_engine.market_sector_radar --smoothing 0.5

# Sans sauvegarder
python -m portfolio_engine.market_sector_radar --no-save
```

## Intégration dans generate_portfolios_v4.py

### 1. Ajouter l'import

```python
# Après: from portfolio_engine.market_context import load_market_context

try:
    from portfolio_engine.market_sector_radar import (
        generate_market_context_radar,
        RadarRules,
    )
    RADAR_AVAILABLE = True
except ImportError:
    RADAR_AVAILABLE = False
```

### 2. Modifier CONFIG

```python
CONFIG = {
    # ...existing config...
    
    # === v4.9: Tactical Context via RADAR ===
    "use_tactical_context": True,  # ACTIVER
    "tactical_mode": "radar",      # "radar" ou "gpt"
    "tactical_rules": {
        "sweet_ytd_min": 10.0,
        "sweet_ytd_max": 35.0,
        "sweet_daily_min": -0.5,
        "overheat_ytd_min": 50.0,
        "underperform_ytd_max": 0.0,
        "smoothing_alpha": 0.3,
    },
}
```

### 3. Dans build_portfolios_deterministic()

```python
market_context = None
if CONFIG.get("use_tactical_context", False):
    tactical_mode = CONFIG.get("tactical_mode", "radar")
    
    if tactical_mode == "radar" and RADAR_AVAILABLE:
        rules_config = CONFIG.get("tactical_rules", {})
        rules = RadarRules(**rules_config)
        
        market_context = generate_market_context_radar(
            data_dir=CONFIG.get("market_data_dir", "data"),
            rules=rules,
            save_to_file=True,
        )
    else:
        # Fallback vers load_market_context (mode GPT)
        market_context = load_market_context(...)
```

## Output format

Compatible avec `load_market_context()` existant :

```json
{
  "market_regime": "risk-on",
  "confidence": 0.85,
  "as_of": "2025-12-17",
  "macro_tilts": {
    "favored_sectors": ["healthcare", "financials"],
    "avoided_sectors": ["real-estate"],
    "favored_regions": ["united-states", "germany"],
    "avoided_regions": ["china"],
    "rationale": "8/11 secteurs positifs (73%)"
  },
  "key_trends": [...],
  "risks": [...],
  "_meta": {
    "model": "radar_deterministic_v1.1",
    "mode": "DATA_DRIVEN",
    "amf_compliant": true,
    ...
  }
}
```

## Fichiers requis

- `data/sectors.json` - Performances sectorielles
- `data/markets.json` - Performances pays/indices

## Anti-whipsaw (Smoothing)

Le paramètre `smoothing_alpha` (défaut 0.3) mélange les tilts précédents avec les nouveaux pour éviter les rotations brutales :

- `0.0` = tout nouveau (réactif mais volatil)
- `0.3` = 30% ancien + 70% nouveau (recommandé)
- `1.0` = tout ancien (pas de changement)

## Différences vs mode GPT

| Aspect | RADAR | GPT |
|--------|-------|-----|
| Déterministe | ✅ | ❌ |
| AMF-compliant | ✅ | ⚠️ Zone grise |
| Sourcé | ✅ Data | ❌ Non |
| Reproductible | ✅ | ❌ |
| Coût API | 0 | ~$0.01/call |
