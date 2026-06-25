# DOCTRINE_PROFILS.md — ce que chaque profil promet (et ne promet pas)

**Date d'arrêt** : 2026-06-18
**Statut** : doctrine arrêtée pour Stable v3, Modéré v2, Thematique. **Direction** β retenue pour Agressif, **réversible** sous validation backtest juillet (P6/P7).
**Lien backtest** : ce doc DÉFINIT la question. Le backtest β-Agressif de juillet ne *confirme pas* la décision, il la *valide ou l'invalide*.

---

## STABLE v3

### Promesse
Préservation du capital avec un revenu modeste (3-5% sleeve via dividendes + bonds courts + or). Sous-performance assumée des indices actions large en régime bull. Capacité à dormir en bear market.

### Comportement attendu dans le pire régime (non garanti)
En bear actions -30% sur MSCI World, Stable encaisse **MaxDD plafonné cible -15%** (objectif doctrinal, pas garantie contractuelle). En rotation hostile (taux montants + équités plates), Stable génère ~3-5% via dividendes + bonds courts + or, **sous-performe l'indice de 15-20 pts cumulés sur 3 ans** sans se déprécier en absolu.

### Pré-engagement anti-panique
*"Je m'engage à NE PAS basculer vers Modéré/Agressif en bull market parce que Stable sous-performe VWCE. Le manque à gagner est le prix payé pour le coussin, qui n'a de valeur qu'au moment où je n'en veux pas (= au pic du bull)."*

### Engagements de non-faire
- Ne course pas le yield (un dividende élevé n'est pas un signal qualité — fix Fabre v8 + floor dur 2% appliqués)
- Ne détient pas de mega-cap tech sans dividende (MSFT/AAPL/NVDA/GOOGL exclus structurellement par le floor)
- Ne tient pas plus de 1 action par secteur (anti-concentration sectorielle)
- Ne vise pas à battre VWCE — vise à protéger le capital en bear

### Trou identifié — resserrement risque P4ter juillet
Post-floor yield, le pool accueille HCLTECH (tech EM, vol 25%) et BMED (banque italienne périphérique). Le floor a réglé le critère **revenu**, pas le critère **risque défensif**. À ajouter en juillet :
- Plafond vol ≤ 20% sur Stable uniquement
- Étudier exclusion EM ou cyclique consumer

En attendant : budget 1 swap/run rend la transition progressive, le resserrement peut être posé avant que les titres entrent réellement en portefeuille.

---

## MODÉRÉ v2

### Promesse
Capture **partielle** de la performance actions long terme. CAGR cible **fourchette 6-9%** sur 7-10 ans (à comparer VWCE ~9-11%), avec drawdown contenu (cible -22 à -28%). Quasi-balanced fund, **pas un sous-Agressif**.

### Comportement attendu dans le pire régime (non garanti)
β estimé **0.61 — hérité du backtest, pas une cible**. En bear -30% MSCI World, Modéré attend MaxDD ~-22%. En bull tech +35%, Modéré attend +12 à +18% (capture partielle assumée).

Cohérence bornes par construction : MaxDD -22/-28% ↔ vol cible 28-35% ↔ CAGR 6-9% — les trois sont alignés, pas indépendants.

### Pré-engagement anti-panique
*"Je m'engage à NE PAS basculer vers Agressif pour rattraper le bull, ni vers Stable pour fuir le bear. Modéré est par construction le profil où 'je ne fais rien' est la stratégie. Tout swap profil = échec doctrinal personnel."*

### Engagements de non-faire
- Ne vise pas à égaler VWCE en bull
- Ne tient pas de positions de concentration sectorielle > 1/secteur sur la sleeve actions
- Ne sous-estime pas le β 0.61 — il vient du passé, le futur peut être plus haut ou plus bas

---

## 🏁 CLÔTURE FINALE 2026-06-25 (post-run + leçon NTAP)

Après le run portefeuille post-réconciliation, deux observations Fabre tranchées :

### NTAP est revenu naturellement par le pool — leçon mécanique

Hier, FORCED_EXIT={Agressif: {NTAP}} a sorti NTAP. Aujourd'hui, le système l'a RÉINTRODUIT via le pool natif Modéré+Agressif (NTAP a Buf 93, flag stabilité PASS, fondamentaux sains malgré D/E 2.0 issu des buybacks).

**Enseignement** : FORCED_EXIT ne bloque que la *restauration* sticky d'un titre sorti, pas l'*entrée naturelle* d'un titre que le pool considère légitime. Donc forcer la sortie d'un titre que la mécanique considère valide = **lutter contre son propre système sans bénéfice**.

**Règle Fabre 2026-06-25** : FORCED_EXIT réservé aux **vraies bombes** (thèse cassée, fondamentaux pourris, aberration de risque), PAS pour des préférences cosmétiques. NTAP n'est pas une bombe → retiré du FORCED_EXIT. Seul ADM reste forcé (Buf 33 dans Stable qui exige ≥ 70 = vraie incohérence doctrinale).

### Overlap Modéré ↔ Agressif à 75% — confirmation verdict D

Modéré et Agressif partagent EXPD/ITX/LOGN (3 stocks). Modéré spécifique : NOVN. Agressif spécifique : CBOE/NTAP.

**Avec poids identiques (Réglage 2), on aurait attendu 100% overlap.** Le 75% n'est PAS une anomalie à corriger — c'est la confirmation empirique du **verdict D** : le scoring sans edge fort ne sépare pas finement le peloton. Les titres en bas du pool sont à égalité statistique, le sticky + contraintes secteur + nombre de positions (5 vs 4) suffisent à créer de petites différences.

**Règle Fabre 2026-06-25** : ne pas optimiser ce bruit. Modéré et Agressif sont "presque identiques aux satellites près" — cohérent avec "même portefeuille, curseur ETF/bonds différent". Pas de tentative de force le 100% overlap.

### État final validé (sujet clos)

Le portefeuille est officiellement **en accord avec 7 jours de discussion** :

```
SÉLECTION (assumée sans-edge)
  - Stable      : SREN/BVI/HEN/PUB (4 actions, 10% du profil)
  - Modéré      : EXPD/ITX/LOGN/NOVN (4 actions, 20% du profil)
  - Agressif    : EXPD/ITX/LOGN/CBOE/NTAP (5 actions, 25% du profil)
  - Thematique  : pas d'actions, 100% ETF thématiques

CŒUR (l'edge réel)
  - Stable      : VWCE 20% + bonds 60% + or 10% (β ~0.22)
  - Modéré      : VWCE 50% + bonds 25% + or 5%  (β ~0.61)
  - Agressif    : VWCE 50% + IEMG 15% + or 5% + bonds 5% (β ~0.80)
  - Thematique  : QQQ/VGT/VBK/CGXU/VOT/XLE/IEMG/or (moteur perf assumé)

DOCTRINE GRAVÉE
  - Scoring v7.1 anti-ruine actif (4 critères validés data + bonus sectoriel)
  - β abandonné comme levier satellite (Vision B désarmée définitivement)
  - Agressivité par le cœur, pas par les satellites
  - Test allocation 25 ans abandonné (data Yahoo/Stooq insuffisante)
  - Dosages World/Thematique/coussin par profil = jugement a priori, assumé
  - FORCED_EXIT réservé aux vraies bombes (ADM oui, NTAP non)
```

### Ce qui reste à FAIRE (rien d'urgent)

Aucune action requise. Le système est en régime stable :
- MAX_SWAPS=1/run (dérive lente naturelle quand un titre sort vraiment du cadre)
- FORCED_EXIT={Stable: {ADM}} maintenu (vraie incohérence doctrinale)
- Pas de tentative de forcer migration vers pool v7.1
- Pas d'optimisation cosmétique de l'overlap Modéré/Agressif

**Le sujet "portefeuille en accord avec la discussion" est CLOS le 2026-06-25.**

---

## RÉCONCILIATION FINALE 2026-06-25 — Portefeuille en accord avec la doctrine

Après dérive proxy d'indices (Yahoo/Stooq pour test allocation 25 ans), recadrage Fabre : revenir au sujet réel, **mettre le portefeuille en accord avec la doctrine sans dépendre de données externes**. Trois réglages tranchés :

### Réglage 1 — Agressif satellite = clone Modéré, β vient du cœur

Doctrine v6.3 officiellement actée et explicitée :

> **L'Agressif n'a pas de satellites distincts du Modéré. Les deux profils tirent du même pool de sélection. L'agressivité vient EXCLUSIVEMENT du cœur ETF/bonds** :
> - Modéré : VWCE 50% + bonds 25% + or 5% = β cible ~0.61
> - Agressif : VWCE 50% + IEMG 20% + bonds 5% + or 5% = β cible ~0.85
>
> **Différence structurelle entre les deux** : +20% IEMG / -20% bonds. Pas plus.

**Justification empirique** :
- Verdict D (sélection sans edge) : peu importe les actions choisies, elles ne génèrent pas d'alpha
- Donc créer un pool Agressif distinct du Modéré n'aurait aucun fondement empirique
- Le système avait déjà commencé à pencher dans cette direction (NTAP→IEMG 15→20%)
- Réglage 1 ne fait qu'**acter la réalité observée** + l'aligner avec la doctrine

**Conséquence acceptée** : Modéré et Agressif partagent les mêmes 4-5 satellites. C'est cohérent. Ils ne sont pas deux profils de sélection, mais un seul moteur de sélection servant deux dosages d'allocation différents.

### Réglage 2 — `score_weights` Agressif = `score_weights` Modéré

Cohérent avec Réglage 1 : même rôle = mêmes poids. Effet :
- Supprime le push growth/momentum qui faisait remonter NVDA en #3 du pool Agressif
- NVDA reste exclu (pas dans le pool natif Modéré → pas dans Agressif non plus)
- Pas de différence de classement entre les deux profils
- Cohérent doctrine "satellite ≠ moteur, scoring filtre admissibilité"

### Réglage 3 — Dérive lente, pas migration forcée

**MAX_SWAPS_PER_RUN remis à 1** (pas 0 du gel intégral, pas migration de 13 positions).

**Justification Fabre** : v7.1 est validé comme **bouclier anti-ruine** (catastrophes -50% évitées), PAS comme sélecteur de performance. Migrer les 13 satellites actuels (tous sains, vérifiés 11/11) vers le pool v7.1 = remplacer du sans-edge par du sans-edge en payant frais + PFU. Aucun bénéfice de performance prouvé.

Approche retenue : **dérive lente naturelle**.
- MAX_SWAPS=1/run : le système s'aligne doucement quand un titre sort vraiment du cadre
- FORCED_EXIT_BY_PROFILE maintenu : nettoyage des héritages évidents (déjà fait pour ADM, NTAP)
- Pas de remplacement urgent de positions saines juste parce qu'elles ne sont pas dans le top pool

### Dosage Thematique/coussin par profil (non testable, fixé par jugement a priori)

Sans test allocation 25 ans (données Yahoo/Stooq pas suffisamment propres — proxies World TR manquent), le dosage Thematique vs coussin par profil est fixé par **jugement de bon sens** :
- **Stable** : beaucoup de coussin (bonds 60% + or 10%), peu/pas de Thematique
- **Modéré** : équilibre (VWCE 50% + bonds 25% + or 5%), pas de Thematique séparé
- **Agressif** : peu de coussin (bonds 5% + or 5%), Thematique séparé à 30% du patrimoine
- **Thematique** : moteur perf assumé, ETF thématiques diversifiés

Ce dosage n'est PAS prouvé empiriquement (le test 25 ans aurait répondu, données indisponibles). Il est **fixé par jugement et assumé comme tel**, pas comme un résultat validé.

### État final atteint après ces 3 réglages

- ✓ Sélection clonée Modéré/Agressif (assumée sans-edge, doctrine explicite)
- ✓ Agressivité par le cœur ETF/bonds, pas par les satellites
- ✓ Scoring v7.1 anti-ruine actif (les 4 critères validés data + 2 paris régime + bonus stabilité sectorielle)
- ✓ Héritages morts sortis (ADM, NTAP) via FORCED_EXIT
- ✓ Pas de méga-cap tech chère en satellite (NVDA exclu par doctrine, pas par sticky)
- ✓ Dérive lente naturelle (MAX_SWAPS=1, FORCED_EXIT actif)
- ✓ Dosage Thematique/coussin par profil fixé par jugement (assumé non-prouvé)

**Le portefeuille est enfin en accord avec la discussion complète** (5 jours de tests + 1 jour de recadrage).

---

## BUFFETT v7.1 FINAL — bonus sectoriel gradué validé (2026-06-23)

Suite analyse factorielle v6 (6 critères), test v7 roic_stable (edge anti-ruine
confirmé), mesure d'impact v7 binaire (52% rotation, 6 assureurs entrants =
musée pro-régulés), refactor v7.1 (bonus sectoriel gradué Fabre 2026-06-23) :

**STRUCTURE FINALE** :
- 6 critères pass/fail (carte 3 catégories : 3 validés data, 2 paris régime, 1 non soutenu)
- + bonus +10 si PASS sectoriel (médiane mondiale par secteur, cap 100)
- Le bonus INCLINE, n'EXCLUT pas

**MESURE D'IMPACT v7.1 (vs v2026)** :
- Rotation top 25 : 32% (vs 52% en v7 binaire)
- Diversité sectorielle entrants : Finance 5, Tech 1, Conso 1, Indus 1
- ASML : 67 → 77 (PASS sectoriel, gagne bonus, pas évincée)

**VÉRIF FABRE 2026-06-23 — Finance entrants par bonus ou critères ?** :
Les 5 Finance entrants (V, TRV, HIG, ACGL, CINF) ont TOUS un score 100 SANS bonus.
0/5 portés par le bonus. Tous entrent par leurs 5-6 critères de base.
→ ✓ SAIN : le bonus modeste +10 ne sur-promeut PAS les assureurs.
→ La domination Finance dans entrants reflète la qualité Buffett objective
  des assureurs P&C d'élite en 2026 (taux hauts = investment income +),
  pas un artefact d'implémentation.

**LEÇON DOCTRINALE GRAVÉE (5 jours)** :
"Validation factorielle ≠ implémentation : un facteur validé peut être mal mis
en œuvre". Le test v7 a validé l'edge, v7 binaire l'a mal implémenté, v7.1
sectoriel gradué l'a correctement traduit. La validation d'un facteur et son
poids dans le système sont deux décisions séparées.

---

## CONCLUSION DÉFINITIVE 2026-06-22 — Sélection vs Allocation, où est l'edge prouvable

**Insight final Fabre 2026-06-22** : tout débat sur la sélection (Verdict D, Survie Neutre, micro-edge panier) se heurte au même mur — **ratio variables/observations temporelles catastrophique**. 30+ variables candidates dans le JSON stock, 5 points de rebalance annuels disponibles. Statistiquement, plus on cherche, plus on trouve un faux edge qui s'évaporerait en réel.

**Ce n'est pas que la sélection n'a pas d'edge — c'est qu'on ne peut pas le prouver** avec 6 ans de data, indépendamment de la méthode ou du score utilisé. Une analyse factorielle sur 30 variables avec 5 observations garantit le surapprentissage.

**L'edge prouvable est dans l'allocation, pas la sélection** :
- Allocation testable sur **25-30 ans** d'indices/ETF longs (dot-com, 2008, COVID, 2022, multiple régimes monétaires)
- Sélection testable seulement sur les 6 ans de fondamentaux dispo TD
- Le ratio observations/paramètres requis pour distinguer signal et bruit est respecté **uniquement pour l'allocation**

**Décisions actées 2026-06-22** :

1. **L'énergie va à l'allocation**, où l'edge est mesurable empiriquement (Thematique +2.4 pts CAGR vs VT, à creuser dans une démarche dédiée sur indices longs)

2. **Le scoring actuel reste en place** comme filtre d'admissibilité défensif (rôle de garde-fou contre les ruines extrêmes, signal -50% du test Survie en pointant l'hypothèse). **Pas de redesign.**

3. **Analyse factorielle PREDECLARATION_FACTOR_ANALYSIS.md abandonnée comme programme d'exécution** : la pré-déclaration v5 reste committée pour traçabilité scientifique, mais elle ne sera **pas exécutée** — le ratio variables/observations rend les verdicts non-actionnables (même un facteur "significatif" serait probablement un mirage statistique sur 5 points temporels)

4. **Stabilité de la doctrine signée** : Stable préservation, Modéré capture partielle, Agressif structure (pas moteur), Thematique moteur perf, β-Agressif définitivement abandonné

### Programme de recherche futur (à froid, sessions dédiées)

**Tester sur indices longs (20-30 ans de data publique)** :
- Sensibilité réelle β cœur Agressif (VWCE 50% + IEMG 15%) sur multi-régimes
- Confirmation Thematique +2.4 pts vs VT : fenêtre, méthode, IC95%
- Allocation 4-régimes (bull/bear/stagflation/déflation) testable historiquement
- Profil Thematique (QQQ/IEMG/VGT/CGXU/VBK/VOT) vs équipondération naïve
- α + Thematique + cœur ETF : robustesse de la structure sur 25 ans

Chaque question = sa propre pré-déclaration, à froid, comme cette semaine.

### Ce qui s'arrête

- Recherche d'edge de sélection (verdict matériel sur la data, pas méthodologique)
- Redesign du scoring (suffisant pour son rôle réel : filtre défensif)
- Micro-edge panier 100 vs random (R1/R2 = 54% recouvrement = test sans pouvoir)
- Backtest factoriel des 30 variables (overfit garanti vs 5 obs temporelles)

**Insight Fabre gravé** : *"Tu ne manques pas de variables. Tu manques de données dans le temps pour les distinguer du hasard. C'est une limite matérielle de ta data, pas de ta méthode."*

---

## SYNTHÈSE EMPIRIQUE 2026-06-19/20 — Ce que le scoring Buffett FAIT et NE FAIT PAS

**Trois verdicts pré-déclarés successifs**, tous trois acceptés tels quels (engagement scientifique) :

| Verdict | Date | Question | Résultat |
|---|---|---|---|
| **D** | 2026-06-19 | Edge de SÉLECTION (CAGR/Sharpe/MaxDD) ? | **Pas d'edge mesurable** sur 239 stocks S&P 500 contrefactuel valide |
| **Neutre** | 2026-06-20 | Edge de PROTECTION sur baisses modérées (-30%) ? | **Pas d'edge au seuil pré-déclaré 2×** (ratio 1.76×, IC95% exclut 0 mais sous seuil) |
| **Observation non-décisionnelle** | 2026-06-20 | Catastrophes extrêmes (-50%) ? | **Signal réel** (ratio 4.95×, IC95% exclut 0) — mais c'était la métrique secondaire, **PAS le critère opérationnel** → piste pour test futur, pas conclusion |

### Lecture doctrinale juste (Fabre verdict 2026-06-20)

**Ce que le scoring NE FAIT PAS** :
- Pas générateur d'alpha de sélection (Verdict D)
- Pas amortisseur de volatilité ordinaire (les -30% arrivent à toute bonne boîte en bear)

**Ce que le scoring FAIT PEUT-ÊTRE** (non encore prouvé au standard fixé) :
- Évite les **désastres irréversibles** (-50%/-80% qui ne reviennent jamais) : faillites, dilutions massives, modèles cassés type CVNA/BBBY
- C'est de l'**assurance contre la ruine**, pas un avantage de performance ni de confort

**Implication critique** (Fabre) : *"Un filtre binaire grossier (« exclure FCF négatif persistant + sur-endettées + ROE négatif 3 ans ») ferait probablement le même job d'évitement-des-désastres. La complexité de ton scoring n'est pas justifiée par ce qu'il prouve apporter."*

### Question doctrinale OUVERTE (à froid, future session)

**Le scoring Buffett 6 critères + Quality + 13 paliers est-il sur-conçu pour ce qu'il prouve faire ?**

Hypothèses possibles à explorer (avec pré-déclaration scientifique stricte chacune) :
1. **Simplification radicale** : filtre binaire d'exclusion désastres remplace le scoring complexe → testable
2. **Quality vs Buffett** comme filtre de survie : hypothèse distincte à pré-déclarer
3. **Test signal -50% sur autre fenêtre/univers** : confirmer ou infirmer le ratio 4.95× sans circularité

**Ces tests ne sont PAS pour ce soir.** Sont à conduire chacun avec pré-déclaration séparée, fenêtre/univers différents pour éviter circularité.

### Direction doctrinale immédiate (pas de redesign)

- **Le scoring actuel reste en place** dans la prod (pas de cassure)
- **Mais on n'attend plus de lui ce qu'il ne prouve pas faire** : ni alpha, ni amortisseur ordinaire
- **L'énergie va à l'allocation et Thematique** — là où l'edge est empiriquement prouvé (+2.4 pts CAGR vs VT, mentionné en session)
- **Le débat α vs β reste clos** (Verdict D)
- **L'éventuelle simplification du scoring** est une question doctrinale, pas un test à courir

### Ce que cette session a empiriquement établi (résumé)

1. ✅ Méthode scientifique tenue : 3 pré-déclarations committées AVANT exécution, 3 verdicts acceptés tels quels, aucune modification post-hoc
2. ✅ Outils construits : fetcher historique fondamental, build derived, harness backtest tridimensionnel, test survie
3. ✅ Question principale tranchée : le scoring n'a pas d'edge de sélection ni d'amortissement ordinaire
4. ✅ Direction doctrinale claire : Thematique = moteur perf, scoring = filtre de structure (et peut-être garde-fou contre la ruine, à confirmer)
5. 🔓 Hypothèse résiduelle : protection contre catastrophes extrêmes (à tester proprement plus tard, sur autre périmètre)

---

## AGRESSIF — verdict backtest D (2026-06-19) : β abandonné, α conservé pour structure

### ⚠️ ADDENDUM 2026-06-19 — Le backtest empirique a tranché

**Pré-déclaration scientifique** : `docs/PREDECLARATION_BACKTEST_D.md` (committée AVANT exécution, addendum compris).

**Résultat empirique** sur univers élargi 239 stocks S&P 500 (test contrefactuel hétérogénéité fondamentale 13.9% < 15%) :

```
Buffett top 10 : CAGR 5.85%    Sharpe 0.642    MaxDD -8.31%
Random 100 MC  : CAGR IC90 [1.51%, 17.44%]  Sharpe IC90 [0.21, 1.42]  MaxDD IC90 [-16.24%, 0%]

Verdict 3D : CAGR neutre, Sharpe neutre, MaxDD neutre → VERDICT D TERMINAL
```

**Le scoring Buffett actuel n'a aucun edge mesurable sur cette fenêtre 2021-2026** :
- Ni en performance (CAGR)
- Ni en rapport risque/rendement (Sharpe)
- **Ni en protection** (MaxDD identique à médiane random)

Le MaxDD -4.09% du test labo 45 stocks était un **artefact d'univers homogène en qualité**, pas un edge réel.

### Implications doctrinales (Fabre verdict 2026-06-19)

**β est abandonné comme levier de performance** — pas parce qu'il aurait échoué, mais parce que le débat était mal posé : peu importe le filtre prix si le moteur en amont ne discrimine pas mieux que le hasard. Le commit `(α) Vision B β-Agressif désarmée` (3de096ae2) et le Code C (f094506e7) restent désarmés mais deviennent **caducs comme leviers de perf** — à conserver pour archive doctrinale, à supprimer dans une future cleanup si jamais.

**α est conservé** — non pas parce qu'il génère de l'alpha (le verdict D le contredit), mais parce qu'il structure proprement les profils Stable/Modéré et évite les catastrophes value-trap (TSM/CVNA/BKNG-bug auto-détectés en (D) en sont la preuve). **α sert la discipline défensive, pas la surperformance.**

**La performance vient de Thematique** (seul levier prouvé +2.4 pts CAGR vs VT). Le stock-picking est l'**ossature** des profils, pas leur moteur.

### Limites du verdict (à reporter)

1. **Fenêtre 2021-2026 dominée NVDA ×15** — régime growth extrême défavorable à un filtre value. Sur 2000-2002 ou 2008, l'edge défensif aurait peut-être émergé. Pas testable (pas de données fondamentales historiques pré-2020).
2. **Random sous-tech de 10-12 pts vs S&P 500** — biais qui FAVORISAIT le scoring (random désavantagé sur la tech gagnante). Verdict D malgré ce vent dans le dos → renforce le signal, ne l'atténue pas.
3. **Le verdict D tranche "alpha de sélection"**, pas "valeur de garde-fou" — le filtre peut encore exclure le pire (TSLA Buf 17, value-traps) sans avoir d'edge top-décile. Test différent à poser dans une future session (avec sa propre pré-déclaration).

### Question ouverte (à froid, future session)

**Le scoring doit-il viser l'alpha (et alors le redesigner) ou la structure/protection (et alors il fait déjà son job) ?**

Si la réponse est "structure/protection" (probable), le scoring actuel est suffisant et le verdict D ne nécessite **pas** de redesign. La doctrine signée (DOCTRINE_PROFILS) reste cohérente : Thematique = moteur, actions = filet de qualité.

---

## AGRESSIF — section historique (avant verdict D)
*Conservée pour traçabilité de la décision doctrinale ayant mené au test.*

### Statut doctrinal
**Direction retenue ce soir** : Agressif est structuré comme **poche actions moteur (β, `valuation_ok` désactivé, tech mega-cap éligible) + cœur ETF amortisseur (VWCE/IEMG) + or/bonds**.

**Réversible** : la direction β n'est PAS un acté de conviction. Elle est conditionnée à :
1. La validation backtest sur le **périmètre exact du profil** (P6 juillet) — pas global théorique
2. La vérification que **le coussin tient** (P7 juillet — épaisseur 10% vs 15%)

Si le backtest montre un drawdown agrégé supérieur au seuil tolérable réel, **retour α ou β-amorti sans trahison doctrinale**. Cette ligne est gravée pour qu'aucun engagement prématuré ne lie les mains.

### Promesse (conditionnelle à validation juillet)
Moteur de performance pure. CAGR cible 9-12% sur 10 ans, drawdown bear attendu **-28 à -32% sur le profil isolé** (à confirmer backtest). NVDA/MSFT/ASML/AMZN éligibles si scoring quality le justifie.

### Comportement attendu dans le pire régime (non garanti)
En bear tech -50% : poche actions β ~-45%, cœur ETF ~-30%, or +10%, bonds +2%. **MaxDD profil estimé -28 à -32%**. À confirmer par backtest sur périmètre exact.

### Pré-engagement anti-panique
*"Je m'engage à NE PAS vendre la poche actions β en bear -30%, à NE PAS basculer en α au creux. Si le backtest juillet révèle que le coussin (10% filet) est insuffisant pour mon vrai seuil de tolérance, je passe en β-amorti (15% filet) ou en α — décision rationnelle, pas panique."*

### Engagements de non-faire
- **ZÉRO levier** (gravé, non négociable)
- Ne course pas le momentum — sélection sur quality+momentum, pas momentum seul
- Ne déguise pas en Agressif un portefeuille de spéculation
- **Ne pas confondre direction prise avec conviction acquise** — le backtest est juge

### État d'implémentation — Code C (Fabre 2026-06-18)

**Le flag est déjà implémenté ce soir, mais DÉSARMÉ.** Concrètement :
- `apply_valuation_ok: True` est présent dans `PROFILE_POLICY` pour Stable/Modéré/Agressif (les 3 à `True`)
- `evaluateBuffettScore()` calcule et expose **les deux scores** : `buffett_score` (6 critères) et `buffett_score_no_valuation` (5 critères)
- `get_effective_buffett_score(stock, profile)` lit le flag et retourne le bon score
- **Aucun call-site n'utilise encore le helper** : la sélection actuelle continue de filtrer sur `buffett_score` classique → comportement runtime INCHANGÉ

**La bascule β = changement manuel d'une seule ligne** dans `preset_meta.py["Agressif"]["apply_valuation_ok"]` de `True` → `False`, après validation backtest. Pas d'auto-flip, pas de défaut piège.

### ⚠️ CONFLIT DOCTRINAL IDENTIFIÉ 2026-06-18 (trace NVDA + Fabre)

**Le flag `apply_valuation_ok` seul est INERTE pour Agressif satellite.** Le trace NVDA a révélé une contradiction frontale entre ce doc et le code :

**DOCTRINE_PROFILS.md (ce soir, signé)** : *"Agressif = poche actions moteur (β, tech mega-cap éligible) + cœur ETF amortisseur. L'agressivité vient de la sélection."*

**core_satellite_discipline.py v6.3 (2026-06-04)** lignes 405-420, codé en dur :
> *"Le profil Agressif ne pioche PAS dans `_fit_agressif`. Le pool ici est `_profile_native ∈ {Agressif, Modéré}` filtré vol ≥ 20 et trié par `_fit_modere`. **L'agressivité du profil vient EXCLUSIVEMENT de l'allocation cœur**, jamais de la sélection satellite."*

**Conséquence pratique** : NVDA Buf 67 est filtré ligne 430 par `buffett_score >= 70`. Avec bascule β (Buf 80), NVDA passerait ce filtre — mais resterait trié par `_fit_modere` (logique Modéré), donc mal classé, donc absent du top 5 quand même.

**Pour réaliser RÉELLEMENT la décision β-Agressif, trois changements liés sont nécessaires** :
1. `apply_valuation_ok=False` sur Agressif (déjà préparé, désarmé)
2. **L1** : descendre le gate ligne 430 de `>= 70` à `>= 60` (alignement avec `PROFILE_POLICY['Agressif']['min_buffett_score']=60`)
3. **L2** : remplacer le tri `_fit_modere` par `_fit_agressif` pour Agressif

**Les trois sont nécessaires. Aucun seul ne suffit.**

**Résolution** : ce conflit doit être tranché AVANT toute implémentation. C'est P5bis juillet. DOCTRINE_PROFILS étant signée ce soir, la séquence logique est de **réécrire la doctrine v6.3 dans le code**, pas de contourner DOCTRINE_PROFILS.

### Conditions de validation juillet
- **P6** : ✅ implémentation Code C (flag + score_no_valuation + helper) — POSÉ 2026-06-18, désarmé
- **P7** : backtest sur 25% actions β re-scoré à date + cœur réel + or/bonds (périmètre EXACT, pas global théorique)
- **P8** : décision épaisseur coussin (10% léger vs 15% amorti) avec backtest sous les yeux + **si validé** : bascule `apply_valuation_ok=False` sur Agressif + remplacement call-sites `buffett_score` par `get_effective_buffett_score()`

### Honnêteté sur les fondements de la décision
- ✓ Raisonnement de construction (poche moteur + cœur amortisseur sur profil avec coussin) = **base valide**
- ✗ Ressenti "α me fait chier" = biais de beau temps, démonté lors du recadrage Fabre 2026-06-18
- → Seul le raisonnement de construction légitime β. Ce raisonnement dépend de **l'existence réelle du coussin**, à confirmer P6/P7.

---

## THEMATIQUE — moteur thématique séparé

### Promesse
Compartiment ETF séparé (QQQ/VGT/secteurs/régions) = **moteur de performance thématique indépendant**. PAS un sous-bucket d'Agressif. Capture des facteurs (semi, defense, uranium, transition metals) sans dilution dans un blend équilibré.

### Comportement attendu dans le pire régime (non garanti)
En bear tech -50%, Thematique tech-heavy attend **-45 à -50%** (suit le facteur). En bull tech +35%, Thematique capture +30 à +40% (idem). Volatilité élevée assumée — c'est un moteur, pas un coussin.

### Pré-engagement anti-panique
*"Je m'engage à NE PAS vendre Thematique en bear même si elle tombe plus que VWCE. C'est le prix du facteur capture. Si je ne tolère pas le drawdown thématique, je réduis le poids du profil entre deux briefings trimestriels, je ne vends pas au creux."*

### Engagements de non-faire
- **ZÉRO levier** (gravé)
- Ne fait pas de stock-picking dans Thematique — compartiment ETF uniquement
- Ne course pas la rotation thématique — sélection par briefing trimestriel (Phase 3E), pas mensuelle
- N'utilise pas Thematique comme excuse pour ajouter du β à Agressif (les deux sont indépendants par construction)

---

## §Cohérence scoring — Buffett profil-dépendant

**Décision** : à compter de juillet 2026, le filtre `valuation_ok` du Buffett score sera désactivé pour le profil Agressif uniquement.

| Profil | `apply_valuation_ok` | Conséquence |
|---|---|---|
| Stable | ✓ activé | NVDA/MSFT/AAPL exclus (PE > seuil) — cohérent avec promesse préservation |
| Modéré | ✓ activé | Même logique — équilibre quality + value préservé |
| Agressif | ✗ désactivé (juillet, conditionnel) | NVDA/MSFT/ASML/AMZN éligibles si quality le justifie |
| Thematique | N/A | ETF only — pas de scoring stock |

### Pourquoi c'est doctrinalement cohérent
Buffett devient profil-dépendant parce que la définition opérationnelle de "qualité" dépend de l'horizon et de la promesse :
- Un profil de **préservation** veut la qualité ET le prix (Buffett complet, valuation_ok actif)
- Un profil **moteur** veut la qualité pure (quality + leverage + cash + moat) sans pénalité de prix

### Pourquoi c'est logué noir sur blanc
Pour que dans 3 mois on sache pourquoi NVDA est éligible Agressif et pas Modéré. Évite le bug doctrinal silencieux du type `macro_tilts.json` (décision implicite découverte 6 mois plus tard).

---

## Engagements transverses (tous profils)

- **ZÉRO levier sur Agressif ET Agressif-Thematique** (gravé, non négociable)
- `market_context = None` reste en place dans `preset_meta.py` — protection contre tout impact RADAR
- Toute déviation d'allocation passe par modification écrite de ce doc
- Le backtest juillet est juge des conditions d'Agressif β, pas formalité de confirmation
