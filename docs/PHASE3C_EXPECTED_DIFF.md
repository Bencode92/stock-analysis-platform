# Phase 3C — Diff attendu (à valider avant merge)

**Date** : 2026-06-12
**Branche** : `phase3c-gouvernance`
**Décisions actées** (Fabre v5) :
- 3 règles de gouvernance turnover : budget mensuel + cadence hebdo + bandes ±20%
- Aucune dépendance à `data/holdings.json` (les bandes lisent le CSV T212 uploadé dans l'allocator)
- Gel jusqu'à début juillet après merge 3C

---

## 📌 Décision explicite : report ROE négatif vers 3D

Le fix ROE négatif (`equity<0 AND fcf>0` → retire pénalité) **n'est PAS inclus dans 3C**. C'est un **report volontaire**, pas un glissement d'agenda.

**Raison** : 53 stocks affectés dans l'univers, impact estimé +3 candidats Agressif → modifie les pools de sélection. L'inclure pendant la fenêtre de gel polluerait la mesure baseline du régime stable visé pour début juillet.

**Programmé pour 3D** (après gel, en juillet) : le fix sera codé avec un diff attendu propre, mesure d'impact ex-post, et observation sur ≥ 2 runs avant validation.

---

## Modifications de code

### 3C.1 — Budget 1 remplacement satellite/profil/mois

`portfolio_engine/core_satellite_discipline.py`

Nouvelle fonction `_apply_monthly_swap_budget(profile, new_satellites, prev_satellites)` :

```python
def _apply_monthly_swap_budget(
    profile: str,
    new_satellites: List[Dict],
    prev_satellites: List[Dict],
    max_swaps_per_month: int = 1,
) -> Tuple[List[Dict], Dict]:
    """Limite les changements satellite à N par profil sur la fenêtre 30j.
    
    Mécanique :
    - Compare prev (snapshot du dernier portfolio sur fenêtre 30j) vs new
    - Si entrées + sorties > 2 * max_swaps : garder seulement le swap au
      plus fort écart de fit, restaurer les autres positions précédentes
    - Exception : positions qui violent les hard_filters passent outre
      (sortie forcée même si dépasse le budget)
    
    Returns: (satellites_finals, meta_dict)
    """
```

Appelée dans `_get_top_natives_for_profile()` et `_build_agressif_thematique()` (qui est désormais ETF-only — donc no-op pour Thematique en pratique).

### 3C.2 — Cadence hebdo + preview non-affiché

`.github/workflows/generate_portfolios.yml` (existant) :
- Modifie le step d'écriture : sortie sur `data/portfolios_preview.json` au lieu de `data/portfolios.json`
- Garde `data/portfolio_history/portfolios_v4_*.json` (archives PIT pour sticky σ inchangées)

`.github/workflows/weekly_promotion.yml` (NOUVEAU) :
- Trigger : `cron: '0 8 * * 1'` (lundi 8h UTC)
- Steps :
  1. Lit `data/portfolios_preview.json`
  2. Lance `pytest tests/test_no_blocked_in_pools.py`
  3. Si PASS : `cp data/portfolios_preview.json data/portfolios.json` + commit + push
  4. Si FAIL : ouvre une issue avec le log d'erreur, ne pousse rien

`portefeuille.html` / `top_picks.html` :
- Aucune modif visible — lecture du fichier `data/portfolios.json` inchangée
- Le preview n'est pas affiché par défaut (anti-tentation comportementale)
- Accessible via URL directe `data/portfolios_preview.json` pour debug

### 3C.3 — Bandes ±20% dans allocator

`js/allocator.js`

Nouvelle méthode `_computeDrift(position)` :
```js
_computeDrift(position) {
  const cible = position.target_weight;
  const effectif = position.current_weight;
  if (cible === 0 || cible == null) return { drift: 0, status: 'NEW' };
  const drift = (effectif - cible) / cible;
  if (Math.abs(drift) <= 0.20) return { drift, status: 'IN_BAND' };
  if (Math.abs(drift) <= 0.50) return { drift, status: 'DRIFT' };
  return { drift, status: 'REBALANCE' };
}
```

Intégration dans le rendu du plan d'arbitrage :
- Marqueur visuel ` IN_BAND` (gris) / `DRIFT` (orange) / `REBALANCE` (rouge)
- Affichage du % de drift dans le tooltip
- **Pas de blocage automatique** — l'user décide ligne par ligne

---

## Diff portfolios.json attendu

**Aucun changement de composition**. 3C ne change que la mécanique du système, pas la sélection. Les 4 critères :

| # | Critère | Vérification |
|---|---|---|
| C1 | Stable.Actions identique | diff strict vs main |
| C2 | Modéré.Actions identique | diff strict |
| C3 | Agressif.Actions identique | diff strict |
| C4 | Thematique = 8 ETF inchangé (phase 3B) | diff strict |
| C5 | Dividende-PEA / CTO identiques | diff strict |
| C6 | Tests régression phase 2 + 3B PASS | run pytest |

**Si on observe un swap satellite après run** : c'est probablement le pré-filtrage broker + sticky qui cumulent leur effet, pas 3C. À investiguer mais pas un bug 3C.

---

## Plan d'exécution

1. Diff attendu écrit ✓ (ce document)
2. **3C.1** budget mensuel → commit `phase3c.1: budget monthly swap satellite`
3. **3C.2** cadence hebdo → commit `phase3c.2: weekly promotion workflow`  
4. **3C.3** bandes ±20% allocator → commit `phase3c.3: drift bands in allocator`
5. Run pipeline local → comparer diff observé vs attendu (C1-C5 strict)
6. Tests d'acceptation phase 2 + smoke 3B
7. Push branche, force-with-lease sur main si nécessaire (cf. expérience phase 2 et 3B)

---

## Politique post-3C (gel)

**Gel ~3 semaines** (mi-juin → début juillet) :
- Système tourne en régime stable
- Mesure baseline propre : turnover réel, σ run-to-run sticky (n≥15 fin juin), comportement cadence hebdo
- Pendant gel : remplissage `data/holdings.json` quand pratique (10 min, pas urgent)
- Rien d'autre côté code, sauf bugs critiques

**Reprise début juillet — Phase 3D scoring** :
- Fix ROE négatif (report acté supra)
- Toxicity révisée (perf relative VWCE, market filter, persistance 2 runs)
- Test ablation fit_score
- Buffett retiré du fit_score (uniquement si ablation confirme overlap top 10 stable à moins de facteurs)
