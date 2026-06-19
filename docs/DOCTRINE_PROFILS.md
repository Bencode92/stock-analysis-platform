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
