# Pré-déclaration backtest SURVIE — Branche B (2026-06-20)

**Date d'écriture** : 2026-06-20, **AVANT** exécution du test de survie.
**Statut** : pré-enregistrement scientifique. Aucune modification post-résultat.
**Référence** : suit `PREDECLARATION_BACKTEST_D.md` (Verdict D terminal — scoring sans edge de SÉLECTION). Branche B pose une question **différente** (edge de PROTECTION).

## Pourquoi un edge de survie devrait exister (théorie a priori, AVANT le test)

Un filtre qualité strict (`buffett_score ≥ 70`) **exclut structurellement** :
- Sur-endettement (leverage_safe fail, D/E > 1.5)
- FCF négatif persistent (cash_generation fail, FCF yield < 3%)
- ROE négatif sur 3 ans (roe_consistent fail)
- Moat en érosion (moat_expansion fail)

**Hypothèse** : ces boîtes sont **sur-représentées dans le pire décile** des returns annuels (faillites, dilutions massives, krachs idiosyncratiques). Le filtre devrait donc montrer un **edge de survie** : les stocks REJETÉS par le filtre concentrent les catastrophes vs les stocks GARDÉS.

Cette théorie est claire, écrite AVANT le test, distincte de l'hypothèse Branche A (edge de sélection en CAGR).

## Comparaison — GARDÉS vs REJETÉS (disjoints), pas complet vs filtré

**Correction Fabre 2026-06-20** : comparer un univers à son sous-ensemble dilue le signal. La comparaison qui ISOLE l'edge :
- **GARDÉS** = stocks éligibles avec `buffett_score ≥ 70` à chaque rebalance
- **REJETÉS** = stocks éligibles avec `buffett_score < 70` à chaque rebalance
- Groupes DISJOINTS, comparaison directe.

Univers source : 239 stocks actifs (post-nettoyage backtest D, contrefactuel valide par homogénéité fondamentale 13.9%).

## Métriques de survie (figées AVANT exécution)

### M1 — Queue gauche du return annuel

Pour chaque groupe (gardés, rejetés), sur l'ensemble des (stock × année) :
- **5e percentile** du return annuel
- **Pire return absolu** observé

Edge = M1(rejetés) PIRE que M1(gardés) — i.e. rejetés ont une queue gauche plus sévère.

### M2 — Taux de catastrophes

Pour chaque groupe :
- **% (stock × année) avec return < -30%** (catastrophe modérée)
- **% (stock × année) avec return < -50%** (catastrophe extrême)

Edge = taux rejetés ≥ 2× taux gardés (seuil chiffré a priori, voir significativité).

### M3 — Taux de ruine sur fenêtre complète (6 ans)

Pour chaque groupe, sur les stocks présents toute la fenêtre :
- **% stocks avec return cumulé < -50%** sur 2021→2026
- (return cumulé = produit des (1 + r_annuel) - 1 sur la fenêtre)

Edge = taux ruine rejetés > taux ruine gardés.

### Métrique SUPPRIMÉE (correction Fabre)

- ~~MaxDD agrégé sur l'ensemble des stocks~~ — bruit dominé par 1 outlier, pas une propriété du groupe.

## Seuil de significativité (chiffré a priori)

**Edge confirmé** = AU MOINS 2 conditions sur 3 :
1. M1 : 5e pct rejetés < 5e pct gardés - **10 pts** (en absolu)
2. M2 : taux catastrophes (< -30%) rejetés **≥ 2×** taux gardés
3. M3 : taux ruine rejetés **≥ 2×** taux gardés

**Contrôle effet taille** : pour M2 et M3, calculer **IC95% par bootstrap** (1000 ré-échantillonnages) sur la différence de proportions. Si l'IC95% inclut 0, la différence n'est pas significative malgré le ratio ≥ 2×.

## Les 3 verdicts pré-déclarés

| Verdict | Interprétation | Conséquence doctrinale |
|---|---|---|
| **Survie ✓** | ≥ 2 des 3 conditions remplies + IC95% n'inclut pas 0 | Edge de survie réel. Le filtre Buffett ≥ 70 a une valeur de **protection** (évite le pire), même sans edge de sélection. Doctrine signée tient : α conservé non pour alpha mais pour structure défensive **prouvée empiriquement**. |
| **Neutre** | Aucune des 3 conditions remplie significativement | Le filtre ne protège pas du pire. **Résultat dur** : le scoring n'a NI edge de sélection NI edge de protection. Implique refonte ou abandon au profit d'équipondération + Thematique. |
| **Survie inversée** | M2 ou M3 : gardés ≥ 2× rejetés (sens contraire) | Le filtre attire le pire (anti-sélection). Diagnostic urgent — bug dans le scoring lui-même. |

## Engagement anti-p-hacking (gravé)

1. **Pas de modification de ce document après exécution.** Si erreur dans la pré-déclaration, identifiée publiquement, pas réécrite en silence.
2. **Pas de 2e seuil testé.** Si Buf≥70 donne Neutre, on n'essaie PAS Buf≥60 ou Buf≥80.
3. **Pas de métrique ajoutée après-coup.** Les 3 ci-dessus, un point c'est tout.
4. **Verdict accepté tel quel**, même "Neutre" (= filtre sans valeur, ni alpha ni protection — résultat capital mais dur).
5. **Pré-déclaration committée AVANT le code du test, code committé AVANT exécution.** Séquence vérifiable ex-post via git log.

## Ce que ce test DOIT prouver (anticipé par Fabre)

> *"Vu la théorie et la fenêtre, je m'attends à ce que B montre un vrai edge de survie — c'est le test le mieux posé de toute la session, et le plus aligné avec ce qu'est réellement ton système."*

Mais pré-déclarer ne veut pas dire pré-décider. Le verdict honnête est celui que les chiffres diront, même s'ils contredisent l'attente.

**Discipline gravée le 2026-06-20, accord explicite Fabre.**
