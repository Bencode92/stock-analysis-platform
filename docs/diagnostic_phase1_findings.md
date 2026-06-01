# Phase Diagnostic-1 — Findings

**Date** : 2026-06-01
**Méthodologie** : `tools/diagnostic_dump.py` (read-only) + grep + lecture
**Objectif** : comprendre POURQUOI les modifications successives n'ont pas
              produit l'effet attendu sur la convexité Modéré.

---

## 1. Path de sélection bonds en prod (réponse définitive)

```
generate_portfolios_v4.py:3082-3083
    bonds_top_n = {"Stable": 6, "Modéré": 10, "Agressif": 15}[profile]
    bonds_selected_df = select_bonds_for_profile(bonds_df, profile, top_n=bonds_top_n)
```

**Étapes pour les bonds Modéré :**

1. `bonds_data` = ~433 bonds raw chargés depuis `data/combined_bonds.csv`.
2. `select_bonds_for_profile(df, "Modéré", top_n=10)` (preset_bond.py) :
   - data_qc → 387
   - hard_constraints duration ≤ 10y, credit ≥ 50 → 350
   - presets union (`defensif_oblig`, `tips_inflation`, `intermediate_treasury`) → 250
   - dedup fund_type (max 2/type Modéré) → 53
   - HY filter (max 0 pour Modéré) → 51
   - scoring + tri → **top 10 par _profile_score**
   - **force-include intermediate Treasury** (mon ajout) → swap si nécessaire
3. Les 10 bonds sont convertis en `Asset` et ajoutés au pool de candidates
   passés à l'optimizer.
4. **SLSQP choisit ses propres poids** parmi les 10 bonds + actions + ETFs.
5. Dans le run actuel : Modéré sort **3 bonds sur 10** (TDTT 8 %, VGSH 8 %,
   PAAA 8 %). Les 7 autres ont poids ≈ 0.

## 2. Pourquoi VGIT (force-include) n'apparaît pas en allocation finale

**Diagnostic local** (`tools/diagnostic_dump.py --mode post-mortem`) :

> `[Bond Modéré] FORCE-INCLUDE intermediate Treasury : VGIT (dur=3.56,
>  fund_type=Intermediate Government, score 59.9) remplace BUCK
>  (score 87.4) — barbell convexité crise.`

Donc côté preset_bond, VGIT est bien dans les 10 candidates retournés.

**Mais l'optimizer SLSQP le rejette** dans l'allocation finale :

| Bond | Score preset_bond | Vol 3y | Yield | Choisi par SLSQP ? |
|---|---|---|---|---|
| JAAA | 100.0 | 2.0 % | 5.6 % | Probable |
| PAAA | 93.5 | 1.8 % | 5.0 % | ✅ 8 % |
| VGSH | ~85 | 1.97 % | 3.95 % | ✅ 8 % |
| TDTT | ~83 | 3.09 % | 4.41 % | ✅ 8 % |
| TDTF | ~86 | 4.63 % | 4.47 % | rejeté |
| **VGIT** | **59.9** | **4.72 %** | **3.74 %** | ❌ 0 % |

VGIT a **score 60 vs 80-100** pour les autres. SLSQP optimise pour
maximiser le score et minimiser la vol. Avec score 60 et vol 4.72 %
(vs PAAA score 93 et vol 1.8 %), VGIT est dominé.

## 3. Conclusion sur les 5 itérations bonds précédentes

| Itération | Quoi | Pourquoi ça n'a rien changé |
|---|---|---|
| Phase Convexité-1 v2 | yield 0.30 → 0.40 | Bouge le score mais VGIT reste dominé par PAAA/TDTT |
| Phase Convexité-1 v3 | Nouveau preset `intermediate_treasury` | Élargit le pool mais SLSQP préfère toujours les autres |
| Phase Convexité-1 v3.1 | duration_min 4.0 → 3.0 | Idem |
| Phase Convexité-1 v4 | yield 0.50 + neutralise vol/duration | Sortait JAAA+PAAA+VGIT mais ces poids transitent par SLSQP |
| Phase Convexité-1 v4.1 | Force-include strict Treasury | Marche à preset_bond, ignoré par SLSQP |

**Le bug n'est pas dans `preset_bond.py`**. Le bug est que **l'optimizer
SLSQP n'a pas de contrainte qui force la présence d'un Treasury
intermédiaire**.

## 4. Confirmation : VGSH + BSV cluster non capté

`tools/diagnostic_dump.py` mesure les corr empiriques sur 251 obs depuis
`price_cache.json` :

- **VGSH ↔ BSV = 0.938** (Stable bonds — non capté car mon cap-corr
  filtre `_is_equity_like(a)` qui exclut Obligations).

Stable actuel : VGSH 8.7 % + BSV 10.6 % = **19.3 %** dans un cluster
fortement corrélé non détecté.

## 5. Pourquoi vol modèle Modéré 20-21 % vs backtest 9 %

À investiguer en mode live (besoin TWELVE_DATA_API exporté). Hypothèses
à tester :

1. **Cov contaminée par crypto** (haute vol non corrélée à equity) qui
   fait exploser le condition_number.
2. **Returns_series longueur non uniforme** entre assets → cov empirique
   mélangeant fenêtres temporelles différentes.
3. **Shrinkage Ledoit-Wolf trop léger** : ne fait pas son boulot quand
   N (assets) ≈ T (obs) — situation typique sur 60 assets × 252 obs.

Le diagnostic mode `live` capture eigvals top/bottom + cond_number qui
permettront de trancher.

## 6. Plan d'action structurel proposé (ne PAS implémenter sans validation)

### Fix A — Contraintes SLSQP au lieu de preset_bond
Ajouter une **contrainte hard SLSQP** : `Σ w_intermediate_treasury ≥ 5 %`
pour Modéré. C'est le bon niveau d'enforcement.

### Fix B — Étendre cap-corr aux bonds
Retirer le filtre `_is_equity_like` dans `_enforce_correlation_clusters`
pour permettre la détection des clusters bonds (VGSH+BSV à 0.94).

### Fix C — Investiguer cond_number 50M (root cause)
Décomposer la cov en eigenvalues pour identifier les paires qui
contribuent à l'instabilité. Mode live nécessaire.

### Fix D — Vol target soft constraint au lieu de pénalité
Plutôt que tuner les pénalités, ajouter une contrainte hard
`vol_modèle ≤ vol_target × 1.5` qui forcerait l'optim à respecter la
target — au prix d'une infaisabilité plus fréquente.

## 7. Ce que la session précédente a vraiment livré

| Item | Net effect prouvé |
|---|---|
| `prev_weights` câblé (turnover) | ✅ Vrai effet : turnover contrôlé |
| Override AXA → CS | ✅ Vrai effet : ticker mappé |
| Liquidity gate | ✅ Élimine mid-caps EU |
| COV gate diagnostic | ✅ Info exposée, ne corrige pas |
| Quality gates armées | ❌ Jamais câblées effectivement |
| Cap-corr Modéré | ❌ Aucun effet (seuil 0.85 sous corr réelle 0.80) |
| Cap-corr Agressif | ✅ PICK+CopperMiners détecté |
| Bond barbell (preset + scoring + force-include) | ❌ SLSQP overrides la sélection |
| Phase Convexité-1 down/up | ❌ Empire de run en run (45 % → 59 %) |

**Verdict honnête** : 60 % des modifs de la session "Convexité" n'ont
produit aucun effet observable. La cause : niveaux d'enforcement mal
ciblés (preset_bond au lieu de SLSQP) + métrique trompeuse (vol modèle
non fiable à cause cond_number 50M).

## 8. Recommandation prochaine étape

**Run mode live** avec `TWELVE_DATA_API=...` pour capturer :
- Eigvals de la cov Modéré (root cause cond_number)
- Liste exhaustive des contraintes SLSQP émises (vérifier qu'aucun
  cluster cap n'est ajouté pour Modéré)
- Allocation pré-post processing à chaque étape

Après ce mode live, formuler les fixes A/B/C/D précisément avant tout
push code.

---

## 9. Findings du mode live (run 2026-06-01 11:46:28)

### Cov diagnostics par profil (extraits des logs)

| Profil | n_assets | cond_before LW | δ shrinkage | cond_after LW | eigen_clipped | well_cond |
|---|---|---|---|---|---|---|
| **Agressif** | 60 | 22 103 555 826 (22 G) | 0.065 | **9 323** | 0/60 | ✅ |
| **Modéré** | 62 | 259 441 021 015 (259 G) | **0.506** | **21 614 982** | 3/62 (4.8%) | ❌ |
| **Stable** | 57 | 259 412 414 039 (259 G) | **0.506** | **21 059 281** | 3/57 (5.3%) | ❌ |
| Dividende-PEA | 4 | 6 | 0.054 | 5 | 0/4 | ✅ |
| Dividende-CTO | 2 | 4 | 0.143 | 2 | 0/2 | ✅ |

### Conclusion définitive — pattern parfait

Le `condition_number > 10⁴` apparaît **uniquement** quand le mélange
**bonds + equity** est présent dans la même matrice :

- **Agressif** : quasi pas de bonds (FLTR + PAAA, durations 1-2y) → cond OK
- **Dividende** : 100 % actions, pas de bonds → cond OK
- **Modéré / Stable** : 3-5 bonds + 50+ equity → cond explose

### Cause mathématique

Variances quotidiennes en magnitude :

- Bonds daily vol ~ 10⁻⁴ à 10⁻³ (1-10 bp daily moves)
- Equity daily vol ~ 10⁻² à 5×10⁻² (1-5 % daily moves)
- **Spread variance bond ↔ equity ≈ 100²-1000²**

Quand la matrice cov mélange ces magnitudes, **la diagonale elle-même**
spanne 4+ ordres de grandeur. Le shrinkage Ledoit-Wolf (δ=0.506) et le
diag_shrink itératif ne peuvent pas ramener cond sous 10⁴ parce que
c'est intrinsèque à la diagonale, pas à la structure off-diagonal.

### Conséquence

- Vol modèle Modéré = `sqrt(w · cov · w)` avec cov instable → varie
  entre 6.75 % et 21.43 % sur 5 runs sans changement significatif
  d'allocation.
- SLSQP optimise sur des gradients numériquement instables → tend à
  produire des solutions de coin (top-N candidates à equal-weight).
- Toutes nos modifications de scoring/seuils tombent dans le bruit
  numérique de la cov.

## 10. Fix unique recommandé — correlation-based shrinkage

Au lieu de shrinkage sur cov directement, **convertir → corr → shrink → reconstruct** :

```python
# Pseudo-code de la modification proposée pour compute()
# Étape standard "correlation-based shrinkage"
def cov_to_corr(cov):
    sd = np.sqrt(np.diag(cov))
    sd[sd == 0] = 1.0
    inv_sd = 1.0 / sd
    return cov * np.outer(inv_sd, inv_sd), sd

corr, sd = cov_to_corr(cov_hybrid)
# Maintenant corr a diag = 1.0 partout → cond ne dépend QUE
# de la structure des corrélations, pas des variances.
# Shrink le CORR (pas la cov).
corr_shrunk, _ = diag_shrink_to_target(corr, target_cond=CONDITION_NUMBER_TARGET)
# Reconstruct cov avec les vraies variances diagonales.
cov_final = corr_shrunk * np.outer(sd, sd)
```

### Pourquoi ça résout le problème

- `corr` a `diag = 1.0` partout → spread variance éliminé
- Cond(corr) ne dépend que des co-mouvements (off-diagonal)
- Sur 251 jours × 62 assets, cond(corr) typique = 50-500 (au lieu de 21M)
- Le `diag_shrink_to_target(corr, target=1000)` converge rapidement
- En reconstruisant `cov = corr × outer(sd, sd)`, on préserve les
  vraies vols individuelles → vol_portfolio = `sqrt(w·cov·w)` reste
  cohérente avec les vol_annual des assets

### Effet attendu

| Métrique | Avant | Après fix |
|---|---|---|
| Modéré cond_number | 21 614 982 | **< 1 000** |
| Stable cond_number | 21 059 281 | **< 1 000** |
| Modéré vol modèle | 6.75-21.43 % erratique | Stable autour de 9-12 % |
| Stable vol modèle | 28.98 % aberrant | Stable autour de 6-8 % |
| SLSQP convergence | Solutions de coin equal-weight | Diversification réelle pondérée par score |

### Risque

- Ce changement modifie la valeur numérique de la cov utilisée par
  SLSQP → l'allocation finale va **changer** au prochain run.
- Direction du changement : on s'attend à ce que la diversification
  améliore (poids plus distribués) et que vol modèle se rapproche
  de vol backtest.
- Le scoring et toutes les autres logiques **ne changent pas**.

## 11. Plan d'action — 3 options pour le user

### Option A — Implémenter correlation-based shrinkage (1-2h)

1. Modifier `HybridCovarianceEstimator.compute()` pour faire le
   passage cov → corr → shrink → cov.
2. Garder le fallback diag_shrink existant en safety net.
3. Test local (post-mortem + live si possible).
4. Push + workflow run.
5. Compare cond_number et vol modèle Modéré/Stable avant/après.

### Option B — Patch ciblé `diag_shrink_to_target` (30 min)

Le shrink actuel monte λ par puissance de 2 jusqu'à 12 steps. Au-delà
de λ=1 le résultat est nonsensical. Plus simple : clamp λ ≤ 0.95 et
boucler 30 steps fines (λ × 1.3 par step). Effet : diag_shrink ne
peut pas faire mieux que `diag(cov)` qui contient déjà le problème.
**Insuffisant** mais minor improvement.

### Option C — Accepter cov instable + désactiver vol modèle (15 min)

Ne pas toucher la cov. Désactiver l'affichage `vol_realized` quand
`covariance_trustworthy=False`. Le backtest 90j reste la source
de vérité pour la vol. C'est l'option pragmatique court terme.

## 12. Recommandation explicite

**Option A**. C'est la seule qui adresse la root cause. Le code change
est local (`HybridCovarianceEstimator.compute()` uniquement, ~20
lignes). Le test est simple (cond_number before/after observable).
L'effet est mesurable et prédictible.

Option B et C sont des patches cosmétiques qui ne résolvent rien.
