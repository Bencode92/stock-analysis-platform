# Pré-déclaration backtest Mode 3 — reformulation après FAIL initial

**Date d'écriture** : 2026-06-19, **AVANT** exécution du test reformulé.
**Statut** : engagement scientifique de pré-enregistrement. Aucune modification de ce document après vue du résultat.

## Contexte

Le Mode 3 initial (top 25 sur 45 stocks, juge = CAGR seul) a échoué :
- Buffett top 25 : CAGR net = 10.20%
- Random 25 médiane : 10.41% (IC90 [7.87%, 12.96%])
- Edge = -0.21 pts CAGR, **dans l'IC90 random**

Trois défauts de construction identifiés a posteriori, **dont les corrections sont justifiées indépendamment du résultat** :

1. Top 25 sur 45 stocks = 55% de l'univers → pas une sélection
2. Égalités massives au cutoff (13-16 stocks au score 67) → ranking arbitraire
3. CAGR seul ignore ce que le scoring vise (résilience défensive — doctrine signée DOCTRINE_PROFILS.md commit 258baa861, écrite AVANT ce test)

## Les 3 corrections du test (justifiées a priori)

1. **Top 10 au lieu de 25** — sélection vraie (22% au lieu de 55%). Correction de construction.
2. **Tie-breaker orthogonal = market_cap décroissant** — casse les égalités sans réinjecter les composantes du scoring (Fabre 2026-06-19 : éviter d'amplifier le signal qu'on teste). Market_cap est neutre vs la thèse qualité. Correction de mesure.
3. **Double métrique : CAGR + Sharpe annualisé** — la doctrine signée dit que Buffett est un filtre de qualité défensive. Mesurer le CAGR seul ne teste pas la promesse. Correction de juge.

## Définitions opérationnelles (figées AVANT exécution)

- **Sharpe annualisé** : `mean(returns_annuels_nets) / stdev(returns_annuels_nets)`. Pas de rf (taux sans risque ~0 sur 2021-2026).
- **Edge significatif sur une métrique** : Buffett **>** IC90_high de la distribution random (100 tirages MC)
- **Pas d'edge** : Buffett **dans** IC90 [low, high]
- **Edge INVERSÉ** : Buffett **<** IC90_low (scoring anti-sélectionne — info distincte de "neutre", Fabre 2026-06-19)
- **Univers homogène en qualité** : médiane sur les rebalances du % stocks éligibles avec buffett_score ≥ 83 **> 25%**

## Les 4 verdicts pré-déclarés

| Verdict | CAGR | Sharpe | Interprétation | Action suivante |
|---|---|---|---|---|
| **A** | edge | edge | Scoring robuste sur les 2 dimensions | Passe à Mode 1 (α/β) |
| **B** | pas d'edge | edge | Scoring défensif confirmé, pas d'alpha pur. La question α/β devient "lequel protège mieux" pas "lequel rapporte plus". Cohérent avec doctrine "Thematique = moteur perf, Buffett = filtre défensif" | Passe à Mode 1 lu en protection |
| **C** | pas d'edge | pas d'edge | Scoring sans edge sur sa propre promesse | **Vérifier d'abord homogénéité univers** : si médiane % ≥83 > 25% → test non concluant, faux négatif probable, (D) légitime. Sinon → STOP, repenser scoring. |
| **D-bis** | edge inversé OU Sharpe inversé | (symétrique) | Scoring anti-sélectionne (sous IC90_low) — diagnostic distinct, le scoring fait l'inverse de ce qu'il prétend | STOP urgent, diagnostic immédiat avant tout autre test |

## Garde-fous anti-p-hacking (engagement)

1. **Pas de modification de ce document après exécution.** S'il y a une faute dans la pré-déclaration, on l'identifie publiquement et on documente la décision, on ne réécrit pas en silence.
2. **Pas de 4e config.** Si Verdict C avec univers hétérogène → repenser scoring (pas relancer une variante).
3. **(D) élargissement univers** activable UNIQUEMENT si Verdict C + homogénéité univers démontrée. Pas comme énième tentative, mais comme test du contrefactuel (la limite est dans la donnée, pas dans le scoring).
4. Le verdict est lu **dans l'ordre** : (D-bis) inversé d'abord (urgent), puis (A/B/C). Pas de mélange ex-post des critères.

## Engagement

Cette pré-déclaration est committée AVANT exécution du test reformulé. Le code du test sera écrit pour matcher exactement ces définitions opérationnelles, sans ajustement après lecture du résultat.

Si le verdict est inconfortable, il est inconfortable. Le but du backtest est de découvrir une vérité sur le scoring, pas de le faire passer.

**Discipline gravée le 2026-06-19, par accord explicite Fabre.**
