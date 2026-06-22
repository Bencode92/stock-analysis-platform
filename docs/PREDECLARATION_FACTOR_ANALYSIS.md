# Pré-déclaration v5 — Analyse factorielle (2026-06-20)

**Date d'écriture** : 2026-06-20 (soir), **AVANT** tout test factoriel.
**Statut** : pré-enregistrement scientifique. Aucune modification post-résultat.
**Tests** : à exécuter à FROID prochaine session, pas ce soir.

## Contexte

Suite aux verdicts D (sélection) et Neutre (survie -30%) sur le scoring Buffett-6-critères value-quality, l'observation a été faite que **6 facteurs n'épuisent pas la data disponible**. Le JSON stock-by-stock du système contient momentum, earnings surprise, croissance, stabilité — précisément les facteurs où l'edge actions long-only est le mieux documenté empiriquement, et que le scoring Buffett actuel **ignore**.

**Hypothèse de cette analyse** : le scoring Buffett a échoué non parce qu'il n'y a pas d'edge, mais parce qu'il **teste les mauvais facteurs**. L'analyse factorielle ci-dessous teste cette hypothèse de manière disciplinée.

## Inventaire data (CHECK 0a réalisé 2026-06-20)

| Facteur | Source | Statut historique |
|---|---|---|
| Stabilité rentabilité (`roe_std_3y`, `roic_std_3y`) | `metrics_by_year.csv` | ✅ 79-89% couverture (rolling 3y dispo dès 2022) |
| Niveau rentabilité (`roe`, `roic`) | `metrics_by_year.csv` | ✅ 86-95% couverture |
| Value (`pe_ratio`, `fcf_yield`) | `metrics_by_year.csv` | ✅ 92-99% couverture |
| Endettement (`de_ratio`) | `metrics_by_year.csv` | ✅ 94% couverture |
| Croissance EPS (`eps_growth_5y`) | À recalculer depuis income_statement | ✅ dispo (6 ans annuel) |
| Croissance Revenue (`revenue_growth_3y`) | À recalculer depuis `sales` historique | ✅ dispo |
| Momentum (`perf_12-1`) | À reconstruire depuis `time_series` TD | ✅ prix daily ~5 ans dispo |
| **Earnings surprise** (`eps_surprise`, `beat_streak`) | TD `/earnings?start_date=...` | ✅ dispo (31 pts ASML 2020-2026) — **à fetcher pour les 239** |
| **Quality subscores** (peer-relative) | `quality_subscores` | ❌ **NON RECONSTRUCTIBLE** : pool de pairs trop petit (EU Tech = 3 stocks). Sort de l'analyse |
| Forecast (`eps_growth_forecast_5y`) | Snapshot uniquement | ❌ **LOOK-AHEAD** : exclu |
| `peg_ratio`, `dividend_yield_forward` | Snapshot uniquement | ❌ exclu |

## Les 6 théories a priori (Fabre 2026-06-20, gravées AVANT test)

### 1. Stabilité de la rentabilité (`roe_std_3y`, `roic_std_3y`) — meilleur candidat

**Mécanisme** : une rentabilité régulière signale un moat durable et un pricing power réel. Une rentabilité erratique au même niveau moyen signale chance, levier opérationnel, ou avantage temporaire. Le marché sous-price la prévisibilité (« ennuyeuse »). Novy-Marx (2013) + école quality-growth : la *persistance* de la profitabilité prédit mieux que son *niveau*.

**Prédiction** : top-quintile de **faible** `roic_std` surperforme bottom-quintile, à niveau de ROIC comparable.

**Falsification** : si boîtes ROIC volatil performent autant ou plus → facteur stabilité sans edge sur cette fenêtre. **Piège construction** : neutraliser le niveau (trie stabilité au sein du tiers haut de ROIC), sinon on mesure "ROIC élevé" déguisé.

### 2. Momentum 12-1 (`perf_12m` moins dernier mois)

**Mécanisme** : sous-réaction comportementale (PEAD-like). Investisseurs intègrent les bonnes nouvelles trop lentement → gagnants continuent de gagner sur 3-12 mois. Anomalie la plus robuste/répliquée de la finance (Jegadeesh & Titman 1993, confirmée tous marchés/décennies).

**Prédiction** : top-quintile momentum 12-1 surperforme bottom-quintile.

**Falsification** : pas de spread → soit pas d'edge sur la fenêtre, soit erreur de construction (skip dernier mois OBLIGATOIRE). **Limite fenêtre** : 2021-2026 contient 2 retournements de régime (fin 2021, fin 2022) → momentum échoue dans les retournements → un résultat faible peut être vrai pour cette fenêtre sans réfuter le facteur en général.

### 3. Qualité pure (`roic`, `roe` niveau)

**Mécanisme** : boîtes très rentables génèrent du capital qu'elles réinvestissent à haut rendement → composition. Facteur "quality" robuste mais plus faible et cyclique que momentum/stabilité.

**Prédiction** : top-quintile ROIC surperforme, edge modéré.

**Falsification** : c'est le facteur le plus proche de Buffett actuel. S'il n'a pas d'edge isolé → **confirme** que le niveau seul ne suffit pas (cohérent avec D). Corrélé à #1 et #4 → démêler en test isolé avant toute combinaison.

### 4. Croissance (`eps_growth_5y`, `revenue_growth_3y`)

**Mécanisme** : croissance des bénéfices tire les rendements *si durable et sous-estimée*. Mais facteur le plus dangereux — le marché sur-price la croissance (« growth trap »). Edge n'existe que pour croissance *de qualité* (rentable, autofinancée).

**Prédiction** : ambiguë a priori. Croissance brute → neutre/négative possible. Croissance rentable (croisée ROIC) → positive.

**Falsification** : edge fort sur croissance brute = surprenant. Sur fenêtre tech 2021-2026 dominée par NVDA ×15, un edge croissance "trop beau" = probablement le régime, pas le facteur.

### 5. Value (`pe_ratio`, `fcf_yield`) — **TEST PIVOT, hypothèse de signe NÉGATIF**

**Mécanisme** : historiquement actions "pas chères" (P/E bas) surperforment (Fama-French value classique). **MAIS** hypothèse globale : sur 2021-2026, value a été *inversé* — régime growth/tech a puni les boîtes bon marché et récompensé les chères (NVDA P/E 70 ×15).

**Prédiction (pré-déclarée)** : value **neutre ou inversé** sur cette fenêtre. Top-quintile "pas cher" ne surperforme pas, peut-être sous-performe.

**Falsification** : si value a un edge positif net sur 2021-2026, **hypothèse globale s'effondre** et diagnostic D à repenser. **C'est le test le plus important des six** — il valide ou casse toute la lecture.

### 6. Earnings surprise (`eps_surprise`, `beat_streak`)

**Mécanisme** : post-earnings announcement drift (PEAD). Boîtes qui battent leurs estimations continuent de surperformer pendant semaines/mois — le marché sous-réagit. Robuste, persistante (Ball & Brown 1968).

**Prédiction** : top-quintile beat streak / surprise positive surperforme.

**Falsification** : pas de spread → pas d'edge sur fenêtre OU data de surprise trop grossière. **Limite mesurabilité** : PEAD se joue sur des semaines, mais on a des earnings trimestriels (TD) — c'est OK. Si on n'avait que de l'annuel, le facteur serait mal mesurable.

## Les protections anti-p-hacking (gravées AVANT test)

### Protections originales

1. **Théorie a priori obligatoire par facteur** — si on ne peut pas écrire *pourquoi* le facteur devrait marcher AVANT de le tester, on ne le teste pas. Les 6 ci-dessus ont leur théorie. Pas d'ajout post-hoc.
2. **Correction multi-tests** — 6 facteurs testés à α=5% = ~26% de chance qu'un passe par hasard. **Application** : seuil ajusté Bonferroni → α/6 = 0.83% par facteur. Ou FDR Benjamini-Hochberg équivalent. Pré-déclaré : un facteur n'est retenu que s'il passe le seuil ajusté.
3. **Tests isolés AVANT combinaison** — pas de score composite agrégé tant que chaque facteur n'a pas son verdict propre.

### Protections supplémentaires (Fabre 2026-06-20)

4. **Ordre de priorité interprétative** : **Value (#5) est le test pivot** — valide/casse l'hypothèse globale. **Stabilité (#1) est le meilleur candidat d'edge positif**. Lire ces deux EN PREMIER.

5. **Contrôle de corrélation multi-facteurs** : ROIC niveau (#3), stabilité (#1), croissance (#4) sont corrélés. Si plusieurs passent isolément, tester lequel **survit** quand on contrôle les autres (régression multivariate `return ~ facteur_A + facteur_B + ...`, garder ceux dont le coefficient reste significatif au seuil ajusté). **Sinon on compte le même signal plusieurs fois.**

6. **Limite de fenêtre, gravée pour chaque facteur** : 2021-2026 = 2 retournements de régime + domination tech. Momentum (#2) et value (#5) sont **régime-sensibles**. Un verdict "pas d'edge" sur ces deux-là est **conditionnel à cette fenêtre**, pas universel. Écrit MAINTENANT pour ne pas surinterpréter à froid.

## Hypothèse globale (Fabre 2026-06-20, pari pré-déclaré)

> *"Sur 2021-2026, momentum et stabilité-qualité auront un edge positif ; value (P/E) sera neutre ou négatif ; et le score Buffett a échoué parce qu'il surpondère value et ignore momentum."*

**Si vérifiée** : Verdict D devient diagnostic explicable, pas échec. Reconstruction d'un score fondée et défendable.

**Si réfutée** : retour à la lecture initiale du Verdict D (filtre = assurance contre ruine, pas plus). Pas d'ajustement de l'hypothèse post-hoc.

## Méthode de test (à exécuter PROCHAINE session, pas ce soir)

Pour chaque facteur disponible :
1. À chaque rebalance (5 dates : 2021-04 → 2025-04), trier les stocks éligibles par le facteur
2. Top-quintile vs Bottom-quintile (top 20% vs bottom 20%)
3. Calculer le return moyen annuel par quintile sur l'année suivante (rebalance N → N+1)
4. Spread = mean(top) - mean(bottom) sur les 5 années
5. Test de significativité : bootstrap IC95% (1000 iter, seed=42) sur le spread agrégé
6. Verdict :
   - **Edge positif** : spread > seuil ajusté Bonferroni ET IC95% exclut 0 ET dans la direction prédite
   - **Neutre** : spread non significatif au seuil ajusté
   - **Edge inversé** : significatif mais signe contraire à la prédiction → diagnostic

## Pré-requis avant exécution (étapes complémentaires à faire AVANT le test)

- **Reconstruire momentum 12-1** depuis prix daily TD (à fetcher si manquant) — convention 12-1 obligatoire
- **Fetcher /earnings** sur les 239 stocks pour earnings surprise historique (~10 min sur Ultra)
- **Recalculer `revenue_growth_3y`** depuis `sales` annuel dans `income_statement` raw
- **Implémenter régression multivariate** pour contrôle corrélation (statsmodels ou numpy.linalg)

## Engagement scientifique

1. Pas de modification de ce document après exécution
2. Pas d'ajout de facteur post-hoc (les 6 sont la liste finale)
3. Verdict accepté tel quel pour chaque facteur, même si tous Neutres
4. Hypothèse globale vérifiée OU réfutée — pas de "moyennement vérifiée"
5. Discipline : test à FROID, prochaine session, pas ce soir

**Discipline gravée 2026-06-20, accord explicite Fabre + Code.**

---

## Addendum 2026-06-22 — précisions Fabre + checks complémentaires

### 1. Quality fragile hors US — **fait de PRODUCTION, pas seulement de backtest**

Le check 0a (peer pools) a révélé : EU Tech = 3 stocks, EU Healthcare = 1, EU Utilities = 1, etc. **Conséquence au-delà du backtest** : en production, le `quality_peer_global_rank` calculé sur 2-3 pairs est déjà du bruit aujourd'hui. À noter dans la doctrine système :

> Le score Quality (peer-relative) n'est fiable que sur les zones où le pool de pairs est dense — typiquement US (cohortes 13-37 stocks). Hors US, s'appuyer sur les facteurs **bruts absolus** (ROE, ROIC, FCF yield), pas sur le rang relatif.

C'est un insight de fiabilité système qui dépasse l'analyse factorielle.

### 2. Earnings surprise — horodatage VÉRIFIÉ ✓

Check 2026-06-22 : le champ `date` de `/earnings` TD est bien la **date d'annonce** (ex. ASML Q1 2026 : `date = 2026-04-15`, soit ~2 semaines après clôture fiscale 31 mars). C'est précisément ce qu'il faut pour PEAD (effet à partir de l'annonce, pas de la fin de trimestre).

**Engagement** : dans l'implémentation du test factor #6, horodater chaque surprise à `e['date']` (date d'annonce), pas à `fiscal_date`. Si la donnée est récupérée depuis income_statement, recroiser avec `/earnings` pour récupérer la date d'annonce correspondante.

### 3. Earnings surprise — promu candidat sérieux (réordonnancement priorités)

Avec la granularité trimestrielle confirmée + l'horodatage à la date d'annonce, le facteur **earnings surprise n'est plus dégradé**. Il rejoint le tier des candidats à mécanisme robuste.

**Priorité interprétative révisée** :

| Tier | Facteurs | Lecture |
|---|---|---|
| **Tier 1 — meilleurs candidats** | #1 Stabilité, #2 Momentum 12-1, **#6 Earnings surprise** | Mécanisme robuste, data propre, à lire en priorité |
| **Tier pivot** | #5 Value (test pivot) | Valide/casse l'hypothèse globale |
| **Tier secondaire** | #3 Qualité niveau, #4 Croissance | Corrélés au Tier 1, démêler par contrôle multivariate |

Le pivot value reste en priorité interprétative aussi (verdict pivot pour l'hypothèse globale), mais le tier 1 gagne un 3e candidat sérieux.

### 4. Couverture roe_std_3y vérifiée — PAS de biais géographique

Check 2026-06-22 : taux manquant uniforme par région (US 21.4%, EU 20.2%, EM 16.7%, OTHER 22.2%). Les 21% manquants sont **structurels** (3 ans requis pour calculer std + années excluded_year), pas concentrés sur un type de stock. **Pas de limite géographique à reporter pour le test stabilité.**

Cohérent avec la doctrine : on n'attribue pas un biais géographique à des données qui sont uniformément réparties.

### Engagement de cet addendum

Ces 4 précisions sont issues des vérifs techniques 2026-06-22 (checks de fiabilité des inputs), pas d'observations sur les résultats des tests. Elles consolident la pré-déclaration v5 sans modifier les théories ni les protections anti-p-hacking.

**Discipline maintenue 2026-06-22, accord explicite Fabre + Code.**
