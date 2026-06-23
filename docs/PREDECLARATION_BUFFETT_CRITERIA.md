# Pré-déclaration v6 — Analyse factorielle des 6 critères Buffett (2026-06-23)

**Date d'écriture** : 2026-06-23, **AVANT** tout test.
**Statut** : pré-enregistrement scientifique. Aucune modification post-résultat.
**Référence** : extension de `PREDECLARATION_FACTOR_ANALYSIS.md` (v5, 2026-06-20).
**Distinction v5** : v5 testait des facteurs continus (momentum, stabilité, growth). v6 teste les **6 critères Buffett actuels** comme variables **binaires** (passe/échoue).

## Question testée

> **Parmi les 6 critères du scoring Buffett actuel, lesquels portent un signal réel de surperformance sur 2021-2026 ?**

Ce n'est PAS un test pour optimiser les seuils. C'est un test descriptif : chaque critère, tel qu'il est défini aujourd'hui, discrimine-t-il ou non ?

## Objectif

Croiser le résultat avec le raisonnement économique a priori (régime taux 2026) pour construire le scoring Buffett v2026 :
- Si critère **a signal data** ET **raisonnement économique le justifie** → garder + éventuellement renforcer
- Si critère **n'a aucun signal** ET **raisonnement économique faible** → retirer
- Si critère **a signal data** mais **raisonnement faible** → garder en l'état, prudence sur l'extrapolation
- Si critère **pas de signal** mais **raisonnement fort** → garder par doctrine, accepter limite

## Les 6 critères testés (figés AVANT exécution)

Définitions actuelles dans `stock-advance-filter.js:evaluateBuffettScore()` :

| # | Critère | Définition binaire actuelle |
|---|---|---|
| 1 | `roe_consistent` | ROE 3y ≥ 15% ET CV < 30% |
| 2 | `roic_moat` | ROIC 3y ≥ 10% |
| 3 | `leverage_safe` | 0 ≤ D/E ≤ 1.5 |
| 4 | `cash_generation` | FCF yield > 3% |
| 5 | `valuation_ok` | 0 < PE ≤ 25 |
| 6 | `moat_expansion` | ROE_N / ROE_3y ≥ 0.90 |

## Méthode de test (adaptée pour binaire)

Pour chaque critère :
1. À chaque rebalance (5 dates : 2021-04 → 2025-04), classifier chaque stock éligible : **PASS** ou **FAIL** sur ce critère
2. Calculer le return annuel (rebalance N → N+1) pour chaque stock
3. **Spread** = mean(return PASS) - mean(return FAIL) sur l'ensemble des (stock × année)
4. Bootstrap IC95% sur le spread (1000 itérations, seed=42)
5. Bootstrap IC95% sur la **différence de proportions catastrophes** (return < -30% et < -50%)

## Théorie a priori par critère (Fabre 2026-06-23)

### 1. `roe_consistent` (ROE 3y ≥ 15%, CV < 30%)

**Mécanisme** : combine niveau et stabilité de rentabilité. C'est précisément le facteur où l'edge actions long-only est documenté (Novy-Marx).

**Prédiction** : edge positif sur return moyen, edge fort sur catastrophes -50% (rentabilité régulière = pas de faillites).

**Falsification** : si pas d'edge, le critère agrégé est trop laxiste (seuil ROE 15% trop bas pour 2026 ? CV 30% trop tolérant ?).

### 2. `roic_moat` (ROIC ≥ 10%)

**Mécanisme** : moat capital-efficient. En 2026, coût du capital ~7-8% → ROIC 10% laisse 2-3 pts seulement. **A priori : seuil trop bas pour le régime actuel.**

**Prédiction** : edge modéré sur return moyen, edge réel sur catastrophes (ROIC < 10% = destruction de valeur).

**Falsification** : pas d'edge → critère sans valeur discriminante, à reconsidérer.

### 3. `leverage_safe` (D/E ≤ 1.5)

**Mécanisme** : éviter la dette excessive. En régime taux 4-5%, dette coûte 4× plus qu'en 2015. **A priori : critère devrait être très discriminant en 2026.**

**Prédiction** : edge FORT sur catastrophes (boîtes sur-endettées font faillite/dilution en taux hauts), edge modéré sur return moyen.

**Falsification** : pas d'edge → seuil 1.5 trop laxiste, ou la dette n'a pas mordu sur cette fenêtre.

### 4. `cash_generation` (FCF yield > 3%)

**Mécanisme** : cash réel, pas accident comptable. En taux hauts, FCF positif vaut beaucoup plus que promesse de cash futur (CVNA, BBBY exclus). **A priori : critère devrait avoir signal fort.**

**Prédiction** : edge fort sur catastrophes (FCF négatif = ruine fréquente), edge modéré return moyen.

**Falsification** : si pas d'edge → seuil 3% pas assez sélectif ou TTM trop court (besoin de durabilité 3 ans).

### 5. `valuation_ok` (PE ≤ 25) — **TEST PIVOT**

**Mécanisme** : value classique Fama-French. **A priori (verdict D) : inversé sur 2021-2026** (régime growth tech).

**Prédiction** : edge NUL OU INVERSÉ. Spread négatif ou IC95% inclut 0.

**Falsification** : si edge positif net → hypothèse globale "Buffett a échoué car surpondère value" s'effondre.

### 6. `moat_expansion` (ROE_N / ROE_3y ≥ 0.90)

**Mécanisme** : continuité du moat (pas d'érosion). **A priori** : signal faible (le ratio est rétrospectif, pas prédictif).

**Prédiction** : edge modéré ou neutre. Plus utile en signal d'érosion qu'en prédicteur d'outperformance.

**Falsification** : pas d'edge → critère décoratif, à reconsidérer.

## Hypothèse globale a priori (Fabre 2026-06-23)

> *"Sur les 6 critères Buffett actuels, ceux qui ont le plus de signal seront : `cash_generation` (FCF) et `leverage_safe` (dette) — parce qu'ils captent le régime taux hauts. `valuation_ok` (PE) sera neutre ou inversé. `roe_consistent`, `roic_moat`, `moat_expansion` auront un signal faible à modéré (proches du facteur 'quality niveau' qui est cyclique)."*

Si vérifiée → le scoring v2026 met le poids sur FCF + dette + ROE/ROIC, retire ou neutralise PE, considère moat_expansion comme décoratif.

## Seuils de significativité (figés AVANT)

**Correction multi-tests Bonferroni** : 6 critères testés → seuil ajusté α = 5% / 6 = **0.83% par critère**.

**Verdict par critère** :
- **Edge** : spread > 0 + IC95% exclut 0 au seuil 0.83%
- **Neutre** : IC95% inclut 0
- **Edge inversé** : spread < 0 + IC95% exclut 0 au seuil 0.83%

**Verdict catastrophes** : ratio (FAIL < -50%) / (PASS < -50%) ≥ 2× ET IC95% exclut 0.

## Limites pré-déclarées (gravées AVANT)

1. **5 rebalances annuels = peu de points temporels** → résultat est INDICATIF, pas définitif. À croiser avec raisonnement économique.
2. **Fenêtre 2021-2026 = régime growth tech extrême** → critères value-sensibles (valuation_ok) testés dans leur pire régime. Verdict conditionnel à la fenêtre.
3. **Univers 239 stocks S&P 500 + labo** → résultat valide pour cet univers, pas extrapolable directement à tous marchés.
4. **Critère binaire** : on teste la définition actuelle, pas un seuil optimisé. Si signal nul, ça peut être le seuil ou le critère lui-même — le test ne tranche pas entre les deux.

## Engagement anti-p-hacking (Fabre exigence répétée)

1. Pas de modification de ce document après exécution
2. Pas de test de variantes de seuil (10 vs 12 vs 14 sur ROIC = INTERDIT)
3. Verdict accepté tel quel pour chaque critère
4. Croisement avec raisonnement économique pré-déclaré, pas avec le résultat
5. Pas de 7e critère ajouté post-hoc

## Décision post-test (pré-déclarée)

Pour chaque critère, matrice 2×2 (signal data × raisonnement économique) :

| Data | Raisonnement | Décision v2026 |
|---|---|---|
| Edge | Fort | Garder + renforcer (seuil resserré possible par raisonnement) |
| Edge | Faible | Garder en l'état |
| Neutre | Fort | Garder par doctrine, accepter limite mesure |
| Neutre | Faible | Retirer ou neutraliser |
| Inversé | Fort | Investiguer (sur-conception ?) |
| Inversé | Faible | Retirer urgence |

**Pour `valuation_ok` spécifiquement** : si neutre/inversé + raisonnement faible 2026 (PE médian marché 25.55 ≈ seuil) → décision = retirer du score core ou monter à PE ≤ 30 par raisonnement (anti-bulle).

**Discipline gravée 2026-06-23, accord explicite Fabre + Code.**
