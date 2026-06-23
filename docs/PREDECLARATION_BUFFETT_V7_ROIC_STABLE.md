# Pré-déclaration v7 — Test 7e critère candidat : `roic_stable` (2026-06-23)

**Date d'écriture** : 2026-06-23, **AVANT** calcul de `roic_std_3y` et test.
**Statut** : pré-enregistrement scientifique. Aucune modification post-résultat.
**Référence** : suit `PREDECLARATION_BUFFETT_CRITERIA.md` (v6) + Buffett v2026 commit `279214c29`.

## Contexte (Fabre 2026-06-23)

L'analyse factorielle v6 a confirmé que le scoring Buffett v2026 (6 critères) est un **bouclier anti-ruine, pas un générateur d'alpha**. 3 critères validés data (catastrophes -50%), 2 paris régime, 1 non soutenu.

Question résiduelle : **un 7e critère candidat à théorie forte (Novy-Marx), capturant une dimension indépendante (corrélation r=0.10 vs roic_moat), mérite-t-il sa place** ?

**Vérification corrélation faite** : r(roe_std_3y, roic_avg_3y) = 0.103 sur 999 (stock × année). Indépendance confirmée, le test n'est pas redondant.

## Théorie a priori (gravée AVANT calcul)

**Mécanisme Novy-Marx (2013) + école quality-growth Fundsmith/Seilern** :

Une rentabilité **régulière** (faible écart-type ROIC sur 3 ans) signale un moat durable et un pricing power réel. Une rentabilité **erratique** au même niveau moyen signale chance, levier opérationnel, ou avantage temporaire. Le marché sous-price la prévisibilité car elle est "ennuyeuse" (pas de narratif de croissance explosive).

**Prédiction spécifique au rôle anti-ruine** : les boîtes à ROIC régulier font **moins de faillites/dilutions massives** que celles à ROIC erratique au même niveau moyen. Le modèle économique est compris, le pricing power tient — donc le profil de risque catastrophique est meilleur.

**Falsification** : si les boîtes à ROIC stable n'évitent PAS plus les catastrophes -50%, alors la stabilité ne sert PAS le rôle anti-ruine du scoring. Le facteur peut quand même générer un edge de performance (Novy-Marx) ailleurs, mais **pas dans ce scoring qui est défensif par construction**.

## Méthode (figée AVANT calcul)

### Variable testée

`roic_std_3y` = écart-type du ROIC sur les 3 années *connues à la date du rebalance* (point-in-time, **PAS look-ahead** — même discipline que `roe_std_3y`).

### Définition du critère binaire (seuil par quantile, PAS X absolu)

**Engagement Fabre 2026-06-23 : seuil par quantile, non négociable** pour éviter le p-hacking sur le X absolu.

- **PASS** = `roic_std_3y` dans le **tiers le plus bas** de l'univers à la date du rebalance (les plus stables)
- **FAIL** = `roic_std_3y` dans les **deux tiers supérieurs** (les moins stables)
- Quantile calculé sur l'univers éligible à chaque rebalance (pas global)

Ce choix est insensible à un X arbitraire. Il teste l'hypothèse Novy-Marx ("les plus stables battent les moins stables") sans deviner un seuil.

### Métrique de verdict

**UNIQUE métrique de décision : taux de catastrophes -50%** (cohérent avec rôle anti-ruine du scoring).

- Ratio FAIL / PASS sur (% stocks avec return annuel < -50%)
- Bootstrap IC95% (1000 itérations, seed=42) sur la différence de proportions

**Métrique secondaire reportée (NON décisionnelle)** : spread de return moyen (pour info, pas pour verdict).

### Seuil de significativité

**Bonferroni à 7 tests** : α = 5% / 7 = **0.71% par test**.

Pour ce 7e test isolé, IC retenu = 99.29% (IC complémentaire de 0.71%).

**Edge confirmé** SI :
- Ratio FAIL/PASS ≥ 2× sur catastrophes -50%
- IC99.29% bootstrap sur diff de proportions exclut 0
- **Les deux conditions cumulatives**

## Verdict terminal (gravé AVANT test)

| Résultat | Décision |
|---|---|
| **Edge confirmé** (les 2 conditions) | Ajouter `roic_stable` comme 7e critère dans Buffett v2026 |
| **Pas d'edge** (IC inclut 0 ou ratio < 2×) | Buffett v2026 reste à 6 critères. **PAS DE 8e CANDIDAT TESTÉ.** |
| **Inversé** (IC95% < 0, ROIC stable attire plus de catastrophes) | Bug à investiguer — résultat contre-théorique fort |

**Engagement** : un facteur, un verdict, accepté tel quel. Pas de test de variant de quantile (tiers vs quintile vs décile), pas de test sur métrique alternative si -50% n'edge pas.

## Limites pré-déclarées (gravées AVANT)

1. **Couverture probablement ~79%** (mêmes contraintes que `roe_std_3y` : 3 ans requis + excluded_year). Si concentration sur EU (biais US), à noter dans le verdict.
2. **5 rebalances annuels** : résultat indicatif, pas définitif. Croiser avec raisonnement Novy-Marx.
3. **Fenêtre 2021-2026** : régime tech extrême. La stabilité pourrait être pénalisée si elle exclut les hypergrowth volatiles qui ont fait l'edge de la fenêtre.

## Engagement anti-p-hacking (gravé)

1. Pas de modification de ce document après exécution
2. Pas de test de seuil alternatif (quartile vs quintile vs décile = INTERDIT)
3. Pas de métrique alternative testée si -50% n'edge pas
4. **Verdict TERMINAL** : pas de 8e candidat ("essayons momentum dans le scoring") si roic_stable échoue
5. Si edge inversé, investiguer comme bug, pas comme nouveau facteur

## Pré-requis techniques

- Ajouter `roic_std_3y` au build derived (`build_derived_metrics.py`) avec même logique point-in-time que `roe_std_3y`
- Relancer build sur 239 stocks pour produire le CSV à jour
- Coder le test factoriel isolé `roic_stable` (script séparé)

## Hypothèse globale a priori (mon pari)

Au vu du fait que **3 critères validés data sur catastrophes -50% montrent ratios 4-11×** et que la stabilité Novy-Marx est documentée comme protectrice, **je m'attends à un edge modéré (ratio 2-4×) sur catastrophes -50%**. Si ratio < 2×, l'effet est noyé dans le bruit de la petite fenêtre — verdict honnête "pas d'edge sur cette mesure".

Si confirmé → 7e critère ajouté, scoring v2026 final à 7 critères.
Si réfuté → 6 critères suffisent, scoring v2026 fermé.

**Discipline gravée 2026-06-23, accord explicite Fabre + Code.**
