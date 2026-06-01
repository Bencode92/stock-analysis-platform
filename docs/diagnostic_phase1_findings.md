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
