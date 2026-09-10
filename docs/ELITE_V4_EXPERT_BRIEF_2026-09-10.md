# Socle actions elite — bascule ROIC 6 ans (v4) : dossier de décision pour expert

**Date** : 2026-09-10 · **Statut** : intégration codée + testée sur données réelles complètes, **non basculée**
(CI toujours en v3). Décision demandée avant tout basculement.

---

## 0. Contexte doctrinal (rappel)

Le **socle actions elite** = 40 compounders full-actions sélectionnés par **empilement de filtres** (portes),
**jamais** par classement prédictif. Doctrine constante :
- La conviction/qualité **FILTRE**, elle ne **PONDÈRE** pas (départage = descriptif, pas prédictif).
- Juger l'entreprise pour ce qu'elle **EST** (valeur réelle + ratios sains), pas la notoriété.
- **Filtrer par doctrine, pas par backtest** ; la clé se fige **avant** de voir la sortie.
- Anti-overfitting : un churn de 60 % entre variantes de clé = preuve d'instabilité, pas « la donnée qui tranche ».

La **clé v3 actuelle** (figée, en production) départage par *stabilité symétrique du ROIC* (écart-type/moyenne
sur 3 ans). Défaut connu et documenté : elle **punit une hausse** de ROIC (exclut les ROIC en progression type
Nvidia/TSMC). C'est ce défaut qui a motivé la spec ROIC 6 ans (v4).

## 1. Ce que v4 change (spec figée `ELITE_ROIC_10Y_SPEC.md`)

Deux choses, **bundlées** dans la spec :

**(A) Porte VALORISATION — au critère, plus au grade (§3bis).**
- v3 : porte valo = `buffett_grade ∈ {A, B}`. Or un grade B peut s'obtenir **en ratant précisément la valo**
  (4 des 6 autres critères Buffett passés). Donc des titres **chers** entrent quand même.
- v4 : porte valo = **critère binaire `valuation_ok` = vrai** (PE raisonnable). Les chers sortent, point.

**(B) Départage — persistance + semi-déviation, plus la stabilité symétrique (§3).**
Ordre lexicographique, tout descriptif : durabilité (A>B) → **persistance** (nb d'exercices sur 6 avec
ROIC ≥ 12 %) ↑ → **semi-déviation SOUS la médiane 6 ans** ↓ → FCF yield ↑.
- Intention affichée : « une hausse de ROIC ne pénalise pas ; une baisse, oui » (corriger le défaut v3).

Fenêtre : **6 ans** (Twelve Data plafonne à 6 exercices, pas 10). Historique < 4 ans → persistance à demi-poids.
Règle de transition §5 : un tenu ne sort que s'il casse la porte de sortie **ou** tombe hors top-60 ;
**≤ 10 changements par run**, le surplus par vagues trimestrielles.

## 2. Intégration pipeline (faite, sans nouveau workflow ni appel API)

La série ROIC 6 ans était **déjà fetchée** par Twelve Data puis jetée à la sérialisation. On calcule désormais
`roic/roe_persist_6y`, `roic/roe_downside_6y`, `years_roic_6y` depuis la série déjà en main (et depuis le cache
`fundamentals_cache.json` pour les 15 655 titres déjà stockés → **aucun refetch**). Ces champs traversent
volume-CSV → scorer → `stocks_*.json` → propagation entité. **Testé en production** : US 2621/2813, EU 1342/1616,
Asie 5460/6679 titres peuplés. La clé v4 est **gatée derrière `ELITE_KEY=v4`** ; le CI par défaut reste v3.

## 3. Résultat empirique v4 vs v3, sur données FRAÎCHES complètes

**Contrôle de confusion fait** : v3 relancé sur les données fraîches = **0 changement** → pas de dérive de
données, le socle v3 est stable. **Donc les 10 changements observés sont du pur effet v4.**

| | v3 (actuel) | v4 |
|---|---|---|
| Porte valo | grade B/A | critère `valuation_ok` |
| **Taille du pool éligible** | **402** | **336** (−16 %) |
| Départage | stabilité symétrique 3 ans | persistance + downside 6 ans |
| Changements vs socle gelé | 0 | **10 exécutés + 10 différés** (v4 en « voulait » ~20) |

### Décomposition HONNÊTE des 10 sorties

| Cause | Titres (PE) | Nb |
|---|---|---|
| **Porte valo `valuation_ok`=faux** (chers) | JNJ (32), ISRG (43), FASTENAL (42), ARISTA (61), KEYENCE (45), ROLLINS (33), SGX (39), VAT (88) | **8** |
| **Règle transition §5 (top-60)** rattrape des **illiquides** que l'hystérésis v3 gardait | Shin-Etsu Thinking (2428, ADV 2,6 M$), Topco (5434, ADV 2,8 M$) — **ADV < 5 M$** | **2** |

- 2 valo-failers de plus (**Agilent PE 30, Chipotle PE 36**) auraient dû sortir aussi mais sont **différés** :
  le plafond de 10 changements était atteint. → **quel valo-failer sort vs est différé ce run est en partie
  arbitraire** (tie de rang de pool entre titres tous hors-pool).

### Les 10 entrants (qualité moins chère, tous 1er/2e de leur industrie)
PAYCHEX, SEI Investments, Jack Henry, Donaldson, Cirrus Logic, Skyline Champion, Energy Recovery,
Balfour Beatty, Shin-Etsu Chemical, Nongfu Spring. Tous durab A, persist ROIC 6/6.

### Constat central
**Le levier dominant de v4 = la porte valo (A), pas le départage (B).** 8 des 10 sorties sont dues au
durcissement valo. Le départage persistance/downside ne déplace quasiment rien de visible ici : il départage
*à l'intérieur* d'un pool déjà redessiné par la porte.

## 4. Trois tensions à trancher (le cœur de la question à l'expert)

**T1 — La porte `valuation_ok` est-elle la bonne discipline valo pour un socle QUALITÉ ?**
C'est un critère à **seuil de PE** (JNJ PE 32 exclu ; Nvidia PE 28,7 gardé → seuil effectif ~30, apparemment
non sectoriel). Question de fond : un socle de compounders doit-il refuser *toute* qualité au-dessus de ~30× ?
Un seuil PE plat, aveugle au secteur et à la croissance, exclut potentiellement de la qualité qui **mérite une
prime** (ISRG, ARISTA, Fastenal ne sont pas chers « par erreur »). Risque symétrique de la doctrine « ne pas
surpayer » : verser dans un **biais value** qui vend les meilleurs composeurs parce qu'ils sont populaires.

**T2 — Incohérence latente de la clé §3 (départage) : la semi-déviation SOUS la médiane PUNIT quand même
les ROIC en forte hausse.**
Exemple mesuré : **Nvidia downside_6y = 47,7** (son ROIC a explosé → les années anciennes sont très loin
SOUS la médiane 6 ans → comptées comme « baisse »). Or l'intention affichée de la clé était « une hausse ne
pénalise pas ». Mathématiquement, une semi-déviation sous la **médiane** pénalise tout riser monotone (années
initiales < médiane). La clé v4 corrige donc **moins bien qu'annoncé** le défaut v3 qu'elle devait corriger.
Secondaire ici (la porte domine), mais c'est une faille de conception de la clé figée à signaler.

**T3 — Raffinement spec §2 non appliqué : ROIC hors trésorerie excédentaire (biais Japon).**
Décision prise : réutiliser le ROIC du pipeline (cohérent avec l'affichage), **sans** retirer la trésorerie
excédentaire du dénominateur. Conséquence : les bilans japonais gorgés de cash gardent un ROIC artificiellement
bas → persistance sous-estimée. KEYENCE échouait la valo de toute façon, donc invisible ici, mais le levier
reste non tiré.

## 5. Ce qui est solide vs fragile

**Solide** : intégration data propre et vérifiée ; v3 stable (0 dérive) ; transition bornée à 10 ; la porte
valo fait *exactement* ce que §3bis décrivait ; effet isolé du pur v4.

**Fragile / à valider par l'expert** :
1. La bascule v4 est **de facto une bascule value** (T1) — assumé ou effet de bord non voulu ?
2. La clé de départage ne tient pas sa promesse anti-hausse (T2).
3. « Quel valo-failer sort vs différé » dans le plafond de 10 est arbitraire (pas de tie-break principiel
   entre titres hors-pool).
4. Le raffinement anti-biais-Japon (T3) reste non appliqué.

## 6. Question précise à l'expert

> Faut-il basculer le socle elite en v4 (porte valo stricte `valuation_ok` + départage persistance/downside),
> sachant que **l'effet réel est ~entièrement le durcissement valo** qui sort 12 compounders chers
> (JNJ, ISRG, Fastenal, Arista, Keyence, Rollins, SGX, VAT, Agilent, Chipotle…) ?
>
> Sous-questions :
> - (a) Un **seuil PE plat** (`valuation_ok`) est-il la bonne porte valo pour un socle qualité, ou faut-il un
>   critère valo **sectoriel / ajusté croissance** (PEG, EV/EBIT relatif secteur) avant de basculer ?
> - (b) Faut-il **découpler** : garder la porte valo v3 (grade) et n'adopter QUE le départage 6 ans ? (revient
>   à ne changer *presque rien* puisque le départage est secondaire — donc quel intérêt ?)
> - (c) La clé §3 (semi-déviation sous médiane) **punit les risers** (T2). La re-spécifier (déviation sous une
>   TENDANCE, ou sous le niveau récent, pas sous la médiane) — ou l'assumer comme figée ?
> - (d) Appliquer enfin le ROIC hors trésorerie excédentaire (T3) avant de figer une décision persistance ?

---

### Annexe — chiffres reproductibles
- Pool v3 = 402, pool v4 = 336. Tenus v3 échouant `valuation_ok` = 10/40.
- Reproduire : `ELITE_KEY=v4 ELITE_DRY=1 python3 portfolio_engine/equity_elite.py` (aperçu, n'écrit rien).
- Isolation dérive : `ELITE_KEY=v3 ELITE_DRY=1 …` = 0 changement.
- PE sortants : JNJ 32,0 · ISRG 42,8 · FAST 42,4 · ANET 61,3 · KEYENCE 44,8 · ROL 32,9 · SGX 38,7 · VAT 88,3 ·
  Agilent 30,3 (différé) · Chipotle 35,7 (différé). Nvidia 28,7 (garde la valo, exclu par cap secteur).
