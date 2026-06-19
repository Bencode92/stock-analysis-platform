# Phase 3D Roadmap — Scoring & Toxicity (Juillet 2026)

**Statut** : gelé jusqu'à fin juin pour observation régime stable.

---

## ⭐ PRIORITÉ 0 — Fetcher historique fondamental (Fabre 2026-06-18 fin de session)

**Le vrai blocage de l'optimisation de sélection n'est pas le code, c'est la DONNÉE.**

L'étape 0 du diagnostic backtest a confirmé : `fundamentals_cache.json` est écrasé à chaque fetch (uniquement la dernière période). `data/history/` ne remonte qu'à avril 2026 (~2 mois). Twelve Data `/statistics` retourne le snapshot courant uniquement. Pour NVDA 2018/2020/2022 : **on n'a aucune donnée fondamentale historique**.

**Conséquence directe** : tout débat α/β, toute optimisation de seuil (gate 60 vs 70, max_per_sector, _fit weights), toute validation de la "Vision B" reste un **choix doctrinal sans validation empirique possible** tant que ce fetcher n'existe pas. Le commit `3de096ae2` (Vision B désarmée) peut être basculé β en juillet, mais ce sera sur la base d'un raisonnement de construction, pas d'un backtest.

### Profondeur réelle mesurée (Étape 0-bis/0-ter 2026-06-19)

Tests sur NVDA / ASML / INFY :
- `/income_statement` annuel : **6 ans** (2020 → 2026 selon FY)
- `/balance_sheet` annuel : **6 ans** (structure imbriquée `assets.*` / `liabilities.*` / `equity.*`)
- `/cash_flow` annuel : **6 ans** + **`free_cash_flow` direct** (bonus, pas à recalculer)

**Périmètre backtest accessible** : 2020 (COVID) + 2022 (bear tech) + 2023-2026 (rotation). Pas 2008, pas dot-com — limite assumée. Suffit pour tester α vs β sur 1 vrai stress + 1 rotation.

### Distinction labo (50) vs production (1000) — non négociable

- **Fetcher historique = laboratoire 50 stocks** : valide la RÈGLE de scoring (a-t-elle un edge ? α ou β ?)
- **Production = univers 1000 stocks** : applique la règle validée sur fondamentaux actuels

Le backtest ne sélectionne PAS les positions. Il valide la méthode. Une fois la méthode validée sur l'échantillon, elle s'applique aux 1000 en production. Si on confond les deux, on demande l'impossible au backtest.

### Univers laboratoire (50 stocks, armé pour les deux camps)

| Catégorie | Tickers | N |
|---|---|---|
| Tech US growth | NVDA, MSFT, AAPL, AMZN, GOOGL, META, AVGO, ORCL, ADBE, CRM | 10 |
| **Compounders chers gagnants (β-armed)** | CDNS, SNPS, LLY, FICO, ANET | 5 |
| Quality value US | PG, KO, JNJ, V, MA, COST, WMT, JPM | 8 |
| EU quality | ASML, NOVN, ITX, ROP, CS, NESN, LVMH, SAP | 8 |
| EM quality | INFY, HCLTECH, TSM, 005930 (Samsung) | 4 |
| Positions actuelles portefeuilles | ADM, BVI, PUB, NTGY, LOGN, EXPD, CBOE, CF, BMED, RMD | 10 |
| **Value-traps (α-armed)** | INTC, BABA, T, F, GE | 5 |
| **TOTAL** | | **50** |

L'univers doit armer les deux camps. Sans compounders chers gagnants → β sous-évalué. Sans value-traps → α sous-évalué.

### Endpoints + stockage

- **Endpoints TD** : `/income_statement` + `/balance_sheet` + `/cash_flow` (period=annual)
- **Brut INTOUCHABLE** : `data/fundamentals_history/raw/{TICKER}_{endpoint}.json` (snapshot TD fidèle, jamais modifié)
- **Métriques dérivées** : `data/fundamentals_history/derived/metrics_by_year.csv` (recalculable depuis raw/ sans re-fetch)
- **Market cap historique** : à reconstruire `shares_outstanding × prix /time_series` à chaque `fiscal_date`

### LE piège méthodologique fermé : lag de publication 90 jours

**Règle non négociable du backtest** : au rebalance T, scoring autorisé uniquement sur fundamentals avec :
```
fiscal_date + timedelta(days=90) <= T
```

Sans ce lag, on utilise des chiffres que personne ne connaissait à la date du rebalance → look-ahead déguisé → toute stratégie est artificiellement gonflée.

Exemple concret : rebalance 1er janvier 2022 → on utilise l'exercice 2020 (publié au printemps 2021), pas l'exercice 2021 (publié au printemps 2022). C'est ce qu'un investisseur réel avait sous la main.

### Paramètres backtest

| Paramètre | Valeur |
|---|---|
| Rebalance | annuel (cohérent avec fundamentals annuels) |
| Frais transaction | 0.15% par trade (T212 + spread) |
| **PFU sur dividendes** | 31.4% |
| **PFU sur PV réalisées au rebalance** | 31.4% (pénalise β plus que α via turnover mega-caps) |
| Sticky bonus | OFF (mesure scoring pur, pas viscosité) |
| Bench | VWCE seul |

### Modes de backtest (en parallèle, pas séquentiel)

- **Mode 1** : α vs β isolés sur Agressif. La question doctrinale. NVDA/MSFT/ASML éligibles si flag β + L1 + L2 appliqués.
- **Mode 3 (sanité)** : top 25 Buffett vs panier aléatoire de 25 dans l'univers (100 tirages Monte Carlo, médiane + IC 90%). **Si Mode 3 ne montre pas d'edge significatif → STOP, le débat α/β est vain.** Le scoring n'a pas d'edge même brut → revoir le scoring avant de raffiner.

Les deux modes tournent ensemble. Mode 3 est le test que personne ne fait : vérifier que le scoring vaut quoi que ce soit avant de l'optimiser.

### Séquence d'exécution (5 étapes, jamais sauter)

1. ✅ Correction comptable univers (50 stocks confirmés)
2. 🟡 Commit spec dans roadmap (ce commit même)
3. ⏳ Code fetcher (script Python, sans lancer les calls)
4. ⏳ **Test NVDA + ASML uniquement** + vérif manuelle JSON. Maillon faible : market_cap historique. Si TD ne fournit pas `shares_outstanding` par date, reconstruire via balance_sheet × time_series. Découvrir sur 2 stocks, pas 50.
5. ⏳ Si NVDA + ASML propres → lance les 48 restants

### Risques à anticiper

- Rate limits Twelve Data Ultra : 600/min, 50 stocks × 3 endpoints = 150 calls historiques + 50 market_cap = 200 calls. ~25-30 sec effectifs. Pas un chantier marathon.
- Normalisation FY : NVDA janvier ≠ ASML décembre ≠ INFY mars. Lag 90j harmonise.
- Manque cost_of_revenue (substitut `cost_of_goods`), manque P/E direct (à reconstruire prix × eps).

**P0 est le prérequis de P5bis (résolution conflit doctrinal) ET P7 (backtest β-Agressif) ET P4ter (resserrement Stable).** Sans P0, ces priorités restent du jugement doctrinal, pas de la décision validée.

---

## Items prévus (ordre indicatif)

### Toxicity actions (haute priorité — comble le trou de sortie)
- Position en violation hard_filters → flag VENDRE
- Perf relative VWCE < -35% (pas absolu, anti-vente au creux en bear)
- Buffett < seuil profil pendant 2 runs consécutifs (persistance)
- Vol > 50% + DD(VWCE) > -20% (market filter)
- Circuit prix-pur calculable à la main (mode dégradé pipeline)

### Re-validation mensuelle des positions
- Audit holdings.json vs hard_filters profil
- Sortie `revalidation_report.md` (flagged positions)
- DECK Modéré sortira mécaniquement (vol 45.74 > 45)

### Fix ROE négatif
- `equity < 0 AND fcf_ttm > 0` → retire pénalité ROE (buyback-driven OK)
- `equity < 0 AND fcf_ttm < 0` → garde pénalité (loss-driven mauvais)
- 53 stocks affectés dans l'univers (MCD, HD, KHC, etc.)
- Impact estimé : +1 candidat Stable, +0 Modéré, +3 Agressif

### Test ablation fit_score
- Mesurer overlap top 10 à N facteurs (10 actuel, 4, 2, 1)
- Si overlap > 90% à 4 facteurs : retirer 6 facteurs décoratifs
- **Pré-requis** avant de décider de sortir Buffett du fit_score

### Buffett retiré du fit_score (uniquement si ablation valide)
- Buffett reste gate T1 (filtre binaire qualité)
- Quality + subscores prennent tout le scoring fin
- Libère 0.22 de poids redistribué sur eps_growth + perf relative

### Audit cohérence scoring — ORDRE FABRE v7-final-final (2026-06-17)

L'audit du 17 juin a tué 3 hypothèses successives et révélé que **le « biais EM » est un BUG DATA, pas un biais de modèle**. Le bug est asymétrique par bourse, pas par région. Ordre corrigé en conséquence :

#### Mesure clé du 17 juin

| Région | % stocks avec ≥2 fondamentaux None | Polluants par pays |
|---|---:|---|
| US | 0.2% (1/515) | FERG seul |
| EU | 4.3% (12/278) | 5 autrichiens, 2 italiens, autres |
| EM | **20.7% (55/266)** | **Chine 52/52 (100%)** + Inde 3/98 (3%) |

**Diagnostic** : ZÉRO chinoise propre dans la base. Les 52 chinoises sont scotchées à Buf 60 par défaut (4/6 critères évalués), incapables d'atteindre 70+ par data quality. L'Autriche présente le même symptôme à plus petite échelle (5/12 EU polluants).

→ **Le bug n'est pas "EM" mais "couverture par bourse"** (Vienne + Milan + Shanghai/HK touchées).

#### Priorité 1 — Détecteur générique de couverture par bourse

Pas un fix par région, un fix par **complétude data** :
```
Si count(critères Buffett où value=None) ≥ seuil
  → marquer quality_coverage_insufficient
  → SORTIR du pool de sélection
  (au lieu de coller un faux 60)
```

Détection automatique de la Chine + Autriche + Italie d'un coup, sans liste noire de pays.

#### Priorité 2 — Re-run audit régional APRÈS nettoyage

Les médianes régionales par secteur du 17 juin sont **polluées par les 55 EM polluants et 12 EU polluants**. La conclusion "EU > US > EM sur Buffett" est en partie un artefact data. Re-faire l'audit **après** P1 avant de toucher à quoi que ce soit régional.

#### Priorité 3 — Trancher la Chine doctrinalement

**Recommandation Fabre** : exclusion structurelle assumée, pas enrichissement Bloomberg/Refinitiv. Raisons :
- Coût Bloomberg/Refinitiv prohibitif pour data complète Chine
- Fiabilité des états financiers chinois reste problématique même complétés
- Risque VIE (coquille caïmanaise) inchangé par data
- Risque réglementaire 2021 (secteurs effacés par décret) inchangé
- Exclure la Chine d'un portefeuille de conviction est une décision pro-courante

→ Le `coverage_insufficient` règle le problème mécaniquement : pas de chinoises dans le pool **pour la bonne raison** (data non fiable), pas par accident silencieux.

#### ⭐ PRIORITÉ 1 DOCTRINALE — α vs β sur `valuation_ok` (remonté Fabre 2026-06-18)

**Pourquoi c'est devenu P1** : c'est la décision qui définit si le système est de la **préservation** ou de la **performance**. Toutes les autres priorités sont secondaires à côté. Fabre v8 :

> "C'est exactement la décision qui décide si ton système est 'préservation' ou 'performance'. Tout le reste est secondaire à côté."

**Constat empirique du 17-18 juin** : la sélection actuelle exclut STRUCTURELLEMENT NVDA, ASML, TSMC, MSFT (déclassé), AAPL, GOOGL, AMZN, META (déclassé) — l'intégralité des moteurs de la performance actions 2015-2024. Le biais value n'a payé que depuis 18 mois (rotation 2025-2026).

**Sous-décision implicite** : quel est l'objectif de chaque profil ?
- Stable / Modéré / Agressif sont-ils des profils de **préservation** (drawdown contenu, sous-performance en bull acceptée) ?
- Ou des profils de **performance** (battre le marché, ce qui exige d'accepter les mega-cap tech) ?

**Sans réponse à cette question, le système est ambigu** — il prétend être agressif tout en filtrant les vrais agressifs. Cohérent doctrinalement, mais trompeur sur l'attente performance.

#### Priorité 4ter — Resserrement risque Stable (Fabre 2026-06-11)

**Symptôme** : post-fix yield + floor 2%, le pool Stable accueille **HCLTECH** (SSII indienne, vol 25%, risque pays + devise + déflation IA) en #4 et **BMED** (banque italienne, risque souverain périphérique) en #1. Ils passent le floor yield (4.1% et 5.7%) mais trahissent la promesse "je dors la nuit".

**Diagnostic** : le floor yield a réglé le critère *revenu*, pas le critère *risque défensif*. Stable n'a aucun garde-fou sur :
- vol haute (HCLTECH 25%, BMED 23.5%)
- risque pays concentré (EM India, périphérique EU)
- conso cyclique (ITX en #2)

Un dividende qualifié ne fait pas d'une tech EM volatile un titre de préservation.

**Fix proposé** (à chiffrer en 3D — ne pas appliquer ce soir) :
- `volatility_3y_max: 20%` (vs autres profils ≤ 30-45%)
- Étudier `exclude_emerging_markets: true` pour Stable uniquement
- Étudier `exclude_cyclical_consumer: true` pour Stable uniquement

**Protection en attendant** : le budget 1 swap/run rend la transition vers BMED/ITX/PG/HCLTECH progressive. Le resserrement peut être appliqué avant que les titres entrent réellement.

#### Priorité 4bis — Biais yield dans fit_score Stable (Fabre v8 2026-06-18)

**Symptôme** : PG (Buf 100, vol 17%, yield 2.7%) battu en Stable par NTGY (Buf 83, vol 22%, yield ~5%). Le `dividend_yield: 0.15` dans les poids du fit_score Stable fait que le rendement départage 2 candidats qualité, **alors que la doctrine est censée privilégier la qualité**.

**Conséquence cachée** : value-piège introduit par la porte de derrière. NTGY (gaz espagnol endetté, croissance nulle) préféré à PG (moat mondial) parce qu'il paye plus. Aucun gérant qualité ne valide ce choix.

**Fix proposé** : réduire `dividend_yield` de 0.15 → 0.05 dans Stable score_weights, ou utiliser `dividend_yield` comme tie-breaker (pas critère principal). À chiffrer en 3D : qui rentre/qui sort dans Stable post-fix.

#### Priorité 4 (ancienne) — Trancher α vs β sur `valuation_ok` (le débat NVDA)

**Diagnostic confirmé** : NVDA Quality 96 / Buffett 67 = pas une incohérence, c'est le système qui fait son travail (Quality = pur, Buffett = quality+value). Mais leur fusion dans `fit_score` réinjecte le P/E deux fois.

- **α** : garder `valuation_ok`, renommer score "quality+value", assumer tilt value/non-US permanent par écrit
- **β** : sortir `valuation_ok` du Buffett, score value séparé pour piloter le tilt explicitement (**reco Fabre**)

#### Priorité 5 — Bug CS finance (5/5 vs 5/6)

Si `roic_skipped: True` pour finance, CS devrait sortir 5/5 = 100, pas 5/6 = 83. **Test d'une ligne** à faire pour confirmer.

Si confirmé : toutes les financières (ADM, CS, TROW, HNR1, SREN, AXA) perdent ~17 pts injustement. Bug à fixer en priorité car classement finance faussé vers le bas.

---

### 🛑 VERDICT D BACKTEST 2026-06-19 — P5bis/P6/P7/P8 DEVENUS CADUCS

Le backtest empirique (PREDECLARATION_BACKTEST_D.md + addendum) a abouti au
**Verdict D terminal** sur univers élargi 239 stocks S&P 500 :
- CAGR neutre vs random IC90
- Sharpe neutre vs random IC90
- **MaxDD neutre** vs random IC90 (médiane Buffett -8.31% ≈ random -8.36%)

Conséquence : **le débat α vs β était mal posé**. Peu importe le filtre prix,
le scoring Buffett ne discrimine pas mieux que le hasard sur cette fenêtre.

Items rendus caducs par ce verdict (à archiver, pas à exécuter) :
- ❌ P5bis (résoudre conflit doctrinal v6.3 vs DOCTRINE_PROFILS) :
  la conclusion converge AVEC v6.3 (« agressivité vient du cœur, pas du
  satellite ») — pas de réécriture v6.3 nécessaire
- ❌ P6/P6bis/P6ter (flag β-Agressif + L1 + L2) : caducs comme leviers
  de performance. Les commits Code C et (α) Vision B désarmée restent en
  base mais inactifs, à supprimer dans cleanup future si jamais
- ❌ P7 (backtest β-Agressif) : DÉJÀ FAIT et tranché D
- ❌ P8 (épaisseur coussin Agressif) : caduc, plus de bascule β à protéger

### Question OUVERTE pour future session (à froid)

**Le scoring doit-il viser l'alpha de sélection (et donc être redesigné)
ou la structure/protection (et alors il fait déjà son job) ?**

Test différent à poser proprement :
- "Univers filtré Buf≥X vs univers complet sur le DOWNSIDE extrême"
- (pas "top 10 vs random sur le CAGR" qui mesure la sélection, pas la protection)
- Aurait sa propre pré-déclaration scientifique

À garder pour future session reposée, pas une 5e config interdite.

### Implémentation β-Agressif — DOCTRINE_PROFILS.md 2026-06-18 (archivé)

⚠️ **AVERTISSEMENT POST-TRACE NVDA (2026-06-18 fin de session)** ⚠️

Le trace NVDA dans le pipeline réel a révélé que **le flag `apply_valuation_ok` SEUL est INERTE pour Agressif satellite**. Le pipeline `_get_top_natives_for_profile` (core_satellite_discipline.py:374-540) filtre Agressif par :
- ligne 430 : `buffett_score >= 70` → bloque NVDA (Buf 67) avant tout
- ligne 438 : tri par `_fit_modere` (PAS `_fit_agressif`) — délibéré par doctrine v6.3

**Réaliser β-Agressif exige TROIS changements liés** :
1. `apply_valuation_ok=False` (flag déjà posé ce soir, désarmé)
2. **L1** — gate satellite ligne 430 : `>= 70` → `>= 60` (alignement avec PROFILE_POLICY['Agressif']['min_buffett_score']=60)
3. **L2** — tri ligne 438 : `_fit_modere` → `_fit_agressif` pour Agressif

**Sans L1+L2, le flag basculé ne touche pas le satellite Agressif.** C'est le piège "j'ai armé un levier qui ne commande rien" — à éviter absolument en juillet.

Conflit doctrinal de fond : v6.3 (*"l'agressivité vient EXCLUSIVEMENT du cœur"*) contredit DOCTRINE_PROFILS (*"poche actions moteur"*). À résoudre AVANT toute implémentation.

Trois étapes ordonnées : **résolution doctrinale → implémentation → backtest → calibration coussin**.

#### Priorité 5bis — Résoudre conflit doctrinal v6.3 vs DOCTRINE_PROFILS (PREMIER en juillet)

**Conflit** : v6.3 (`core_satellite_discipline.py:405-420`) acte *"l'agressivité vient EXCLUSIVEMENT du cœur, jamais du satellite"*. DOCTRINE_PROFILS.md (2026-06-18) acte *"Agressif = poche actions moteur"*. Les deux ne peuvent pas coexister.

**Décision attendue** : trancher laquelle gagne (probablement DOCTRINE_PROFILS vu qu'elle est signée ce soir avec raisonnement de construction). Réécrire v6.3 dans le code, ne pas contourner DOCTRINE_PROFILS.

**Sortie** : commentaire v6.4 dans `_get_top_natives_for_profile()` qui acte la nouvelle doctrine. Sans ça, L1/L2 reviennent à modifier du code dont la doctrine encadrante dit le contraire — incohérent à maintenir.

#### Priorité 6 — Implémentation flag `apply_valuation_ok` (✅ Code C posé 2026-06-18, DÉSARMÉ et INERTE)

**Statut** : code prêt, défaut `True` partout → comportement runtime inchangé. **Inerte sur Agressif satellite tant que L1+L2 (P6bis/P6ter) ne sont pas faits.**

- ✅ `apply_valuation_ok: True` ajouté dans `PROFILE_POLICY` Stable/Modéré/Agressif
- ✅ `evaluateBuffettScore()` calcule `score_no_valuation` (5 critères, valuation_ok exclu)
- ✅ Sérialisation expose `buffett_score_no_valuation` dans le payload stock
- ✅ Helper `get_effective_buffett_score(stock, profile)` dans `preset_meta.py`
- ⏳ **Câblage** : remplacer `stock.get("buffett_score")` par `get_effective_buffett_score(stock, profile)` aux call-sites (filtres `min_buffett_score`, score_weights `buffett_score`). À faire **après** P6bis/P6ter ET validation backtest.

#### Priorité 6bis — L1 : descendre le gate satellite Agressif 70 → 60

**Levier critique identifié par le trace NVDA (2026-06-18)** :
- Fichier : `core_satellite_discipline.py` ligne 430
- Avant : `and (s.get("buffett_score") or 0) >= 70`
- Après : `and (s.get("buffett_score") or 0) >= 60` pour Agressif uniquement
- Justification : aligne avec `PROFILE_POLICY['Agressif']['min_buffett_score']=60`. Le 70 en dur est probablement un reliquat incohérent.

Sans L1, NVDA reste filtré qualité même avec apply_valuation_ok basculé.

#### Priorité 6ter — L2 : tri satellite Agressif par `_fit_agressif` (pas `_fit_modere`)

**Levier critique #2 identifié par le trace** :
- Fichier : `core_satellite_discipline.py` ligne 438 (branche Agressif)
- Avant : tri par `_fit_modere` même pour Agressif (doctrine v6.3)
- Après : tri par `_fit_agressif` pour Agressif (cohérent avec DOCTRINE_PROFILS)
- Effet : NVDA monte du bas (faible _fit_modere) vers le haut (haut _fit_agressif), entre dans le top 5

Sans L2, NVDA passe le filtre L1 mais reste mal classé, donc absent du top 5 → flag inerte.

⚠️ **Les trois (flag + L1 + L2) doivent être appliqués ENSEMBLE.** Aucun seul ne suffit. Tester en local avant tout commit.

#### Priorité 7 — Backtest β-Agressif sur périmètre EXACT

**NON un backtest global théorique.** Périmètre exact :
- 25% actions β re-scoré à date (piège look-ahead fermé)
- Cœur ETF réel (VWCE 50% + IEMG 15% + IBGS 5% + SGLN 5%)
- Or/bonds tels que pondérés en réalité
- Output : drawdown agrégé profil, vol agrégée, récupération en mois, CAGR

**C'est ce qui valide ou invalide la direction β.** Si MaxDD > seuil tolérable réel → retour α ou β-amorti. La direction β du doc reste **réversible** explicitement.

#### Priorité 8 — Décision épaisseur coussin Agressif

Avec le backtest P7 sous les yeux, trancher :
- **β léger** : 10% filet (or 5% + bonds 5%) — punchy, drawdown brut
- **β amorti** : 15% filet (or 5% + bonds 10%) — moins punchy, drawdown contenu

Décision sur données, pas projection théorique. Updater `DOCTRINE_PROFILS.md` avec l'épaisseur retenue.

#### Priorité 9 — Vérifier contraintes résiduelles post-L1+L2

Une fois flag + L1 + L2 appliqués, **vérifier qu'aucune contrainte aval ne re-filtre NVDA** :
- `max_per_industry: 2` (Semiconductors saturé par MU/ASML/AMAT ?)
- `MAX_PER_SECTOR_BY_PROFILE['Agressif']: 2` (tech US saturé par 2 autres ?)
- Force diversité Agressif (`core_satellite_discipline.py:501-519`) : si NVDA déjà vol≥30, OK ; sinon swap forcé peut le sortir
- `_enforce_caps()` country cap 0.20 (US déjà saturé via 4 autres US ?)
- Coverage haircut, corr penalty (NVDA whitelistée ligne 2330)

Sortie attendue : log explicite "NVDA entré en position #X du satellite Agressif" ou "NVDA filtré aval par contrainte Y".

---

#### Item HORS-3D, ACTIONNABLE MAINTENANT

**Vérifier accès T212 sur INFY / HCLTECH / HEROMOTOCO** : trois indiennes Buf 100, Quality 83-90, ROE 23-31%, D/E < 0.10. Qualité world-class **bloquée par toggle broker_access**, pas par doctrine ni par data. Si dispo T212 → débloquer dans broker_access.html.

C'est le seul item de cette liste qui **améliore réellement la sélection maintenant**.

### Calibration sticky bonus (n=15+ snapshots)
- Mesurer σ run-to-run effectivement (besoin 15 snapshots PIT)
- Calibrer sticky à 1.5-2σ (au lieu de 0.03 arbitraire actuel)
- Estimation à n=15 = fin juin 2026

## Hors phase 3D

- Phase 3E (lecture seule) : briefing thématique trimestriel — déjà livré
- Phase 4 (août+) : exploration levier modéré avec sizing Kelly + stress path-dependent
- Réactivation crypto sleeve si user le demande (décision A actée OFF aujourd'hui)
