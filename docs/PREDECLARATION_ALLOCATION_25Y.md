# Pré-déclaration v8 — Allocation 25 ans (le seul edge prouvable)

**Date d'écriture** : 2026-06-24, **AVANT** tout code et tout fetch.
**Statut** : pré-enregistrement scientifique. Aucune modification post-résultat.
**Contexte** : après 5 jours de scoring (verdict D, v7.1 finalisé), Fabre a tranché — *"le scoring c'est fait, ce qui peut vraiment changer ton argent c'est l'allocation"*. Les portefeuilles réels sont en v6.9 (β-cible théorique), la doctrine reformulée (World cœur + Thematique moteur + coussin) n'est PAS encore dans les portefeuilles.

## Question testée

> **Quel dosage World / Thematique / Bonds / Or pour chaque profil (Stable / Modéré / Agressif), validé sur 25 ans de data incluant 4 régimes (dot-com 2000-02, GFC 2008-09, COVID 2020, bear tech 2022) ?**

Et **falsification forte** : le bucket Thematique mérite-t-il sa place une fois testé sur dot-com inclus, où Nasdaq a fait -80% et mis 15 ans à revenir ?

## Pourquoi c'est l'edge prouvable (vs sélection, qui ne l'est pas)

- **Sélection** (verdict D, 5 jours) : 30+ variables / 5 obs temporelles → ratio variables/observations catastrophique → overfit garanti → impossible à prouver
- **Allocation** : 4 buckets / 25 ans de data ≈ 6000+ obs hebdo → ratio observations/paramètres respecté → distinction signal/bruit possible

C'est ce qui fait que **les fonds actions long-only à edge documenté** (Fundsmith, Seilern) ne le tiennent pas par du stock-picking mais par leur allocation thématique persistante.

## Méthode (figée AVANT exécution)

### Source data

| Bucket | Proxy testable | Profondeur cible |
|---|---|---|
| **World cœur** | MSCI World TR (ou ACWI TR) | 25-30 ans (1995+) |
| **Thematique** | Nasdaq 100 TR | 30+ ans (1995+, dot-com inclus) |
| **Bonds EUR** | US Agg ou Euro Agg TR | 25+ ans |
| **Or** | Gold spot ou GLD TR | 25+ ans |

**TR (Total Return) obligatoire** — sinon on sous-estime World vs Nasdaq de 1-2 pts/an de dividende.

### Fenêtre

**2000-01-01 → 2025-12-31** (26 ans). Inclut dot-com (essentiel), GFC, COVID, 2022.

### Méthode walk-forward (anti-p-hacking critique)

Pas de "trouver le meilleur dosage in-sample". Au lieu de ça :
1. **Fenêtre d'optimisation** : 10 ans glissants
2. **Fenêtre de test out-of-sample** : 5 ans suivants
3. Walk-forward windows :
   - Train 2000-2009 → Test 2010-2014
   - Train 2005-2014 → Test 2015-2019
   - Train 2010-2019 → Test 2020-2024
4. **Pour chaque fenêtre** : sélectionner le mix optimal in-sample, mesurer sa perf out-of-sample
5. **Verdict** : un mix retenu DOIT battre le bench naïf 60/40 sur ≥ 2/3 des windows out-of-sample

### Grille discrète (pas continue)

Mix testés par pas de 10% :
- World : 0, 10, 20, ..., 100
- Thematique : 0, 10, 20, ..., 50 (max 50% du portefeuille)
- Bonds : 0, 10, 20, ..., 60
- Or : 0, 5, 10, 15 (max 15%)
- Somme = 100%

→ ~50-100 mixes par profil. Grille fine mais discrète (évite overfit de précision continue).

### Contraintes par profil (figées a priori)

| Profil | MaxDD max | Cible perf | Contrainte structurelle |
|---|---|---|---|
| Stable | -15% | Sharpe maximisé | World ≤ 40%, Bonds ≥ 40% |
| Modéré | -25% | CAGR > 60/40 | World 40-70%, Bonds 15-35% |
| Agressif | -40% | CAGR > World seul | World 50-80%, Bonds ≤ 20% |

### Rebalance + frais

- **Rebalance annuel** (cohérent gestion réelle)
- **TER 0.20%/an** (proxy ETF)
- **PFU 31.4%** sur PV réalisées au rebalance + dividendes
- Pas de sticky bonus (mesure brute)

### Bench naïf de référence

**60/40** (60% World + 40% Bonds) — le bench mondial classique. Tout mix retenu doit le battre out-of-sample.

## Falsification forte pré-déclarée (Fabre)

> **Si Nasdaq 100 TR n'apporte pas au moins +1 pt de CAGR net out-of-sample vs MSCI World TR seul, sur les walk-forward incluant le dot-com et 2022, alors le bucket Thematique ne mérite pas sa place.**

Si réfuté → portefeuille optimal = World + Bonds + Or, sans pari thématique. La Thematique +2.4 pts vs VT mesurée post-2020 serait un artefact de fenêtre récente (régime tech extrême).

Si confirmé → Thematique reste un bucket distinct, taille à doser par profil.

## Hypothèse globale a priori (pari Fabre + moi)

> *"Sur 2000-2025, le mix optimal pour Agressif sera plus proche de '70% World + 30% Nasdaq + 10% coussin' que de '100% World'. Pour Modéré, '60-70% World + 15-20% Nasdaq + 15-20% coussin'. Pour Stable, '30-40% World + 50-60% coussin + 10% Nasdaq résiduel'. La Thematique apporte une surperformance mesurable mais pas écrasante (~1-3 pts CAGR), assortie d'un drawdown plus violent (2000-02, 2022)."*

Si vérifiée → triangle confirmé, on grave le dosage par profil.
Si réfutée → on apprend quelque chose de fort (ex: World seul suffit, ou Thematique sur-promise).

## Rapport à 5 lignes par profil (Fabre exigence)

Pour chaque mix retenu et le bench 60/40 :
1. **CAGR net** (après frais + PFU)
2. **MaxDD** sur la fenêtre 25 ans
3. **DD spécifique 2000-02** (dot-com) + **DD spécifique 2008-09** + **DD spécifique 2022**
4. **Sous-perf glissante 3 ans max**
5. **Turnover/an** (proxy frais réels)

## Protections anti-p-hacking (gravées AVANT)

1. **Pas de modification de ce document après exécution** — pré-enregistrement
2. **Walk-forward strict** — pas d'optim in-sample sur l'ensemble de la fenêtre
3. **Grille discrète** — pas d'optim continue qui sur-fit la précision
4. **Bench naïf 60/40** — référence externe, pas un score relatif interne
5. **Verdict accepté tel quel** — même si Thematique tombe
6. **Pas de 2e batch de mix testés** si le premier ne donne pas le résultat attendu
7. **Pas d'ajout de bucket post-hoc** (pas de "essayons aussi commodities ou crypto")

## Pré-requis techniques (AVANT exécution)

- **Fetcher data 25 ans** : tester les sources gratuites (Yahoo, Stooq) sur MSCI World TR, Nasdaq 100 TR, US Agg TR, Gold spot. Vérifier profondeur réelle.
- **Coder walk-forward harness** : ~200 lignes Python
- **Implémenter Markowitz contraint OU enumeration sur grille** (préférence grille = plus simple, plus robuste, moins overfit)
- **Test unitaire** sur bench 60/40 : doit reproduire CAGR ~6-7% sur 2000-2025

## Décision post-test (pré-déclarée)

Pour chaque profil, **un seul mix retenu** :
- Celui qui maximise la perf out-of-sample SOUS contrainte MaxDD du profil
- ET qui passe le bench 60/40 sur ≥ 2/3 des walk-forward windows
- Si aucun mix ne passe → profil garde l'allocation actuelle (v6.9), résultat reporté

## Engagement

**Test à exécuter à FROID prochaine session, pas ce soir.** Cadrage ce soir, exécution discipline tête reposée. C'est le test qui peut réellement bouger le patrimoine — il mérite la rigueur que les 5 jours de scoring ont prouvée fonctionner.

**Discipline gravée 2026-06-24, accord explicite Fabre + Code.**
