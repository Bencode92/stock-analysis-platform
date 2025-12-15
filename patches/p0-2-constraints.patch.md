# P0-2: verify_constraints_post_arrondi() Patch

## Overview
Ce patch ajoute l'appel à `verify_constraints_post_arrondi()` après l'arrondi des poids.

## Fichier cible
`generate_portfolios_v4.py`

## Modifications

### 1. Import (après ligne 70)

```python
# v4.8 P0-7: Import du sanitizer LLM
from compliance.sanitizer import sanitize_llm_output

# v4.8.1 P0-2: Import du vérificateur de contraintes post-arrondi
from portfolio_engine.constraints import verify_constraints_post_arrondi, ConstraintReport
```

### 2. Version strings

- Docstring: `V4.8.0` → `V4.8.1`
- `_meta["version"]`: `"v4.8.0_p0_compliance"` → `"v4.8.1_p0_constraints"`
- Banner: `Portfolio Engine v4.8.0` → `Portfolio Engine v4.8.1`

### 3. Constraint verification (dans normalize_to_frontend_v1, après round_weights_to_100)

```python
        # === v4.8.1 P0-2: Vérification des contraintes post-arrondi ===
        assets_metadata_for_check = {}
        for cat_v1 in ["Actions", "ETF", "Obligations", "Crypto"]:
            for name in result[profile][cat_v1].keys():
                assets_metadata_for_check[f"{cat_v1}:{name}"] = {"category": cat_v1}
        
        profile_cfg = PROFILES.get(profile, {})
        profile_constraints_check = {
            "bonds_min": profile_cfg.get("bonds_min", 0) * 100,
            "crypto_max": profile_cfg.get("crypto_max", 0) * 100,
            "max_single_position": profile_cfg.get("max_single_position", 0.15) * 100,
            "max_single_bond": profile_cfg.get("max_single_bond", 0.25) * 100,
            "min_assets": profile_cfg.get("n_assets", {}).get("min", 10),
            "max_assets": profile_cfg.get("n_assets", {}).get("max", 18),
            "bucket_targets": profile_cfg.get("bucket_targets", {}),
        }
        
        constraint_report = verify_constraints_post_arrondi(
            allocation=all_readable_weights,
            assets_metadata=assets_metadata_for_check,
            profile_constraints=profile_constraints_check,
            profile_name=profile,
        )
        
        result[profile]["_constraint_report"] = constraint_report.to_dict()
        
        if not constraint_report.all_hard_satisfied:
            for v in constraint_report.violations:
                if v.priority.value == "hard":
                    logger.error(
                        f"[P0-2] HARD VIOLATION {profile}: {v.constraint_name} "
                        f"(expected {v.expected}, got {v.actual:.2f})"
                        + (f" [{v.context}]" if v.context else "")
                    )
        
        for w in constraint_report.warnings:
            logger.warning(f"[P0-2] {profile}: {w}")
        
        if constraint_report.all_hard_satisfied and not constraint_report.warnings:
            logger.info(f"[P0-2] {profile}: All constraints satisfied ✅")
```

### 4. Feature log (dans main())

```python
    logger.info("   • 🆕 P0-2: verify_constraints_post_arrondi() + _constraint_report ✅")
```

## Output

Le champ `_constraint_report` sera ajouté à chaque profil dans `portfolios.json`:

```json
{
  "Agressif": {
    "_constraint_report": {
      "profile": "Agressif",
      "timestamp": "2024-12-15T...",
      "all_hard_satisfied": true,
      "all_soft_satisfied": true,
      "n_violations": 0,
      "violations": [],
      "warnings": [],
      "margins": {
        "sum_100": 0.0,
        "max_single_position": 3.0,
        "bonds_min": 5.0
      }
    }
  }
}
```
