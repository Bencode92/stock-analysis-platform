# Phase 3C.2 — Cadence hebdo : doctrine actée, déploiement en 2 étapes

**Date** : 2026-06-12
**Statut** : ÉTAPE 1 livrée (workflow opt-in). ÉTAPE 2 à déclencher manuellement.

## Pourquoi le déploiement est en 2 étapes

Modifier le workflow critique `generate_portfolios.yml` pour rediriger l'output vers `portfolios_preview.json` au lieu de `portfolios.json` est invasif :
- Beaucoup de steps post-pipeline lisent `data/portfolios.json` directement (schema validation, push, top_picks generation, etc.)
- Un bug en CI casserait la prod pendant qu'il faut le débugger
- Test impossible en local — il faut tester sur GitHub Actions

Donc l'approche pragmatique :
- **ÉTAPE 1 (livrée)** : `weekly_promotion.yml` en `workflow_dispatch` seulement. Déclenche manuellement les tests d'acceptation et tag le commit comme "promu". Aucun changement au pipeline existant.
- **ÉTAPE 2 (à faire plus tard)** : refactoring du `generate_portfolios.yml` pour gérer le mode `preview` vs `promote` selon variable d'env. À tester sur une branche dédiée.

## Pour l'instant (jusqu'à étape 2)

**Discipline d'usage** : tu ouvres le frontend le lundi matin (ou quand tu veux). Le `portfolios.json` reflète le dernier run CI (peut dater de < 24h). En attendant l'étape 2, il n'y a pas de différence technique entre cible "preview" et "promue" — c'est ta discipline d'ouvrir une fois par semaine qui matérialise la cadence.

**Sauf si nécessaire** : tu peux lancer `weekly_promotion` manuellement (Actions → Weekly Promotion → Run workflow) pour vérifier que les tests acceptation passent à la date du jour. Si OK, ton portfolios.json courant est valide.

## ÉTAPE 2 — Refactoring `generate_portfolios.yml` (à activer plus tard)

Quand tu auras quelques semaines de recul avec la cadence "soft" (étape 1), on pourra activer la mécanique stricte :

```yaml
# Dans generate_portfolios.yml, après le step "Save previous portfolio" :

- name: 🗓️ Determine output mode (3C.2)
  id: output_mode
  run: |
    DAY_OF_WEEK=$(date -u +%u)  # 1=lundi
    if [ "$DAY_OF_WEEK" = "1" ]; then
      echo "mode=promote" >> "$GITHUB_OUTPUT"
      echo "📤 Lundi : output → data/portfolios.json (PROMOTE)"
    else
      echo "mode=preview" >> "$GITHUB_OUTPUT"
      echo "👁️ Pas lundi : output → data/portfolios_preview.json (PREVIEW)"
    fi

- name: 🚀 Exécuter le moteur
  env:
    PORTFOLIO_OUTPUT_MODE: ${{ steps.output_mode.outputs.mode }}
  run: |
    python generate_portfolios_v4.py

# Le pipeline V4 lit PORTFOLIO_OUTPUT_MODE et écrit où il faut.
```

Côté Python (à coder en étape 2) :
```python
# generate_portfolios_v4.py
mode = os.environ.get("PORTFOLIO_OUTPUT_MODE", "promote")
if mode == "preview":
    CONFIG["output_path"] = "data/portfolios_preview.json"
```

Frontend : `portefeuille.html` continue de lire `data/portfolios.json` (cible exécutable, fraîche du lundi). Pas d'onglet preview pour anti-tentation comportementale (Fabre v4).

## Workflow weekly_promotion.yml — usage actuel

Trigger : `workflow_dispatch` (manuel).

Action : lance `pytest tests/test_no_blocked_in_pools.py`. Si PASS, tag le commit `weekly-promotion-YYYYMMDD`. Si FAIL, ouvre une issue avec le log.

Pas de modification de `portfolios.json` — juste un check/marqueur.
