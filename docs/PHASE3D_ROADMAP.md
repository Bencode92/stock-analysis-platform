# Phase 3D Roadmap — Scoring & Toxicity (Juillet 2026)

**Statut** : gelé jusqu'à fin juin pour observation régime stable.

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

### Implémentation β-Agressif — DOCTRINE_PROFILS.md 2026-06-18

Direction β retenue ce soir pour Agressif, **réversible** sous validation backtest. Trois étapes ordonnées : implémentation → backtest → calibration coussin.

#### Priorité 6 — Implémentation flag profil-dépendant `apply_valuation_ok` (✅ Code C posé 2026-06-18, DÉSARMÉ)

**Statut** : code prêt, défaut `True` partout → comportement runtime inchangé. Reste à câbler aux call-sites APRÈS backtest P7.

- ✅ `apply_valuation_ok: True` ajouté dans `PROFILE_POLICY` Stable/Modéré/Agressif
- ✅ `evaluateBuffettScore()` calcule `score_no_valuation` (5 critères, valuation_ok exclu)
- ✅ Sérialisation expose `buffett_score_no_valuation` dans le payload stock
- ✅ Helper `get_effective_buffett_score(stock, profile)` dans `preset_meta.py`
- ⏳ **P8 juillet** : remplacer `stock.get("buffett_score")` par `get_effective_buffett_score(stock, profile)` aux call-sites (filtres `min_buffett_score`, score_weights `buffett_score`). À faire **après** validation backtest, jamais avant.
- ⏳ **Bascule** : changer `Agressif.apply_valuation_ok` de `True` → `False`. **Décision manuelle uniquement.**

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
