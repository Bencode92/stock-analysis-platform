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

## AGRESSIF — direction β, réversible sous validation backtest

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

### Conditions de validation juillet
- **P5** : flag `apply_valuation_ok=False` implémenté pour ce profil uniquement
- **P6** : backtest sur 25% actions β re-scoré à date + cœur réel + or/bonds (périmètre EXACT, pas global théorique)
- **P7** : décision épaisseur coussin (10% léger vs 15% amorti) avec backtest sous les yeux

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
