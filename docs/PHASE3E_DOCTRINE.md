# PHASE3E_DOCTRINE.md — Découverte thématique sans allocation dynamique

**Date d'arrêt** : 2026-06-17 (Fabre v6)
**Statut** : doctrine arrêtée. Toute déviation = retour à NAIVE_CHASE, empiriquement rejeté (Δ Sharpe +0.026 OOS, intradeable après PFU 31,4 %).
**Principe directeur** : le briefing *découvre*, il n'*alloue* jamais. La seule chose qu'il peut déclencher est l'ajout d'un sleeve structurel neuf. Il ne peut **jamais** justifier de toucher au poids d'un thème déjà présent.

## 1. La distinction qui fonde tout

Deux signaux, deux traitements, **jamais mélangés** :

| | DÉCOUVERTE structurelle | RE-CLASSEMENT momentum |
|---|---|---|
| Déclencheur | Un thème **absent** de l'univers devient structurellement pertinent | Un thème **déjà dans l'univers** monte/descend dans le classement |
| Backtest | Muet (biais de survivance) → zone d'action permise | Rejeté → zone interdite |
| Action max | Ajout d'1 sleeve permanent 3-5 % | **Zéro**. Lecture seule |

**Règle de tri** : un thème ne peut apparaître en section Découverte **que s'il n'a aucun ETF présent dans `THEMATIQUE_CORE` ni recouvrement d'exposition matériel** avec une ligne existante. Sinon il bascule d'office en section Re-classement (lecture seule). Le script tranche par appartenance à l'univers, pas par jugement.

## 2. Règle d'entrée (non négociable)

Un ajout n'est légitime que si **les cinq** sont vrais :

1. **Absence** : aucune exposition matérielle dans `THEMATIQUE_CORE` (test mécanique, cf. §1).
2. **Thèse structurelle écrite** : 2-3 lignes sur le *driver pluriannuel* (réarmement, cycle capex nucléaire…). Interdiction d'employer la performance récente comme thèse. Si la seule justification disponible est un chiffre de rendement, **refus automatique**.
3. **Pas en surchauffe** : le flag overheat du radar (YTD > 50 %) est **off**. S'il est on, l'ajout est *gelé* jusqu'à normalisation — on n'entre pas au pic.
4. **Liquidité** : AUM > 200 M€ et spread acceptable (sinon le thème attend un meilleur véhicule).
5. **Budget d'action disponible** : cf. §3.

Si un seul échoue → pas d'ajout. Le briefing l'écrit noir sur blanc (« bloqué par règle n »).

## 3. Cap d'action et hurdle fiscal

- **Max 2 ajouts / an**, glissant. Le briefing affiche le compteur (« ajouts 2026 : 1/2 »).
- **Taille** : 3-5 % du sleeve, financé par réduction du cœur stable, **pas** par rotation entre thèmes existants.
- **Hurdle after-tax explicite** : chaque édition de `THEMATIQUE_CORE` réalise des PV taxées à 31,4 % (PFU 2026, compte-titres). Le briefing chiffre le coût fiscal estimé de l'arbitrage de financement, et exige que la thèse le justifie. Pas de hurdle quantitatif magique — la friction est rendue *visible* pour casser l'impulsion.

### 3.bis Règle de financement (précisée Fabre v6 — trou révélé par run Q2 2026)

**Définitions** :
- **Cœur stable du sleeve Thematique** = exposition broad/diversifiée non thématique. Dans la composition actuelle : aucun ligne n'est strictement "cœur stable" car tout est tilté factor → on prend la convention que **VWCE.DE / IWDA.AS / AGGH.AS / IBGS.AS** (s'ils sont présents) sont les véhicules de financement légitimes.
- **Sleeve thématique** = QQQ / IEMG / VGT / CGXU / VBK / VOT / XLE / SGLN.AS / les nouveaux sleeves structurels ajoutés. CHAQUE ligne est un pari factoriel/thématique distinct.

**Règles** :
1. **Financement par réduction prorata du cœur stable** : la voie par défaut. Tu réduis VWCE/IWDA/AGGH prorata pour libérer les 3-5% d'allocation, tu ajoutes le nouveau sleeve. Pas d'arbitrage sleeve-à-sleeve.
2. **Si aucun cœur stable significatif dans le sleeve concerné** (cas Thematique post-3B qui est 100% factor-tilted) : alors la décision devient un **arbitrage explicite conviction-vs-conviction**. Tu déclares dans le journal de décision : « je réduis VBK 3% parce que je crois MOINS en small-cap growth qu'en uranium ». Ne le déguise pas en « financement neutre ». L'écriture force l'honnêteté.
3. **Interdit** : prélever sur un thème performant pour financer un nouveau thème performant (= rotation momentum déguisée).
4. **Le briefing doit afficher l'option de financement par défaut** (cœur prorata si dispo) et exiger une justification explicite si l'utilisateur veut financer autrement.

## 4. Format du briefing — deux sections étanches

```
THEMATIC REVIEW YYYY-QX
Source: market_context.json (généré le AAAA-MM-JJ — fraîcheur: N jours [OK / ⚠ PÉRIMÉ >30j])
Compteur ajouts: X/2 cette année

═══ SECTION 1 — DÉCOUVERTE (action possible) ═══
Thèmes structurels ABSENTS de l'univers, candidats à un sleeve neuf.
Pour chacun : driver structurel | overheat? | liquidité | verdict règle d'entrée (5 tests)
→ "ÉLIGIBLE sous thèse" ou "BLOQUÉ par règle n"

═══ SECTION 2 — DIAGNOSTIC (lecture seule, AUCUNE action) ═══
Thèmes DÉJÀ dans l'univers. Pur monitoring.
- Couverts + favored/leader : RAS, on ne surpondère pas (rappel: backtest)
- Couverts + avoided/en difficulté : noté, on ne sous-pondère pas non plus
Bandeau en-tête: "Cette section ne déclenche aucune action. Re-pondération = NAIVE_CHASE."
```

Le bandeau de la section 2 est **codé en dur**, pas optionnel. Tout « leader YTD » y porte son flag overheat à côté. Aucun « → candidat EWY » n'apparaît jamais pour un thème déjà couvert.

## 5. Garde-fous anti-dérive (à graver dans le code, pas dans ta tête)

- **Catalogue plafonné** : bar haut à l'entrée. Un thème n'entre au catalogue que sur thèse structurelle, pas « parce qu'il existe un ETF ». Le réflexe « ajoutons AI + cyber + nuclear + robotics + clean energy » est explicitement à refuser — chaque ligne de menu est une tentation future.
- **Section 2 ne produit jamais de suggestion de poids.** Si une version future du script génère un delta d'allocation pour un thème existant, c'est un bug de doctrine, à traiter comme régression.
- **Fraîcheur bloquante** : si `market_context.json` > 30 jours, le briefing s'ouvre sur ⚠ et la section Découverte est suspendue (on n'agit pas sur un régime périmé — précédent `macro_tilts.json`).
- **Journal de décision** : chaque ajout retenu logge thèse + date + coût fiscal dans `docs/thematic_decisions.log`. Révision à 12 mois : le sleeve a-t-il tenu sa thèse *structurelle*, indépendamment de sa perf ? (on juge la thèse, pas le rendement — sinon on réintroduit le momentum par la porte de derrière).

## 6. Ce que cette doctrine n'autorise pas (rappel explicite)

- ❌ Surpondérer un thème parce qu'il est leader.
- ❌ Sous-pondérer un thème parce qu'il sous-performe.
- ❌ Tourner entre thèmes existants.
- ❌ Ajouter sur la base d'un YTD/52W.
- ❌ Plus de 2 mouvements/an.
- ✅ Uniquement : ajouter un sleeve structurel neuf, petit, sticky, sous thèse écrite, hors surchauffe, sur data fraîche, dans le budget.

---

## 7. Limite honnête de la doctrine

Même la section Découverte n'est pas blanchie par un backtest — elle est *permise* parce que le backtest est aveugle à l'univers hors-échantillon, pas parce qu'elle est prouvée gagnante. C'est une zone de jugement encadrée, pas une source d'edge démontrée.

**Porte de sortie** : si après 12-18 mois le journal `docs/thematic_decisions.log` montre que les sleeves « structurels » ajoutés se comportent comme des paris momentum déguisés, la doctrine elle-même devra être resserrée, voire la découverte gelée.

## 8. Implémentation

Le script `scripts/thematic_review.py` doit :
- **Refuser mécaniquement** de produire quoi que ce soit hors de ce cadre.
- **Lever une exception** (pas une suggestion) si la logique tente d'écrire un « → candidat X » pour un thème déjà couvert.
- **Hardcoder** le bandeau de la section 2 (« Cette section ne déclenche aucune action »).
- **Bloquer** la section Découverte si `market_context.json` > 30 jours.
- **Tester** les 5 règles d'entrée pour chaque candidat de la section Découverte, et afficher le verdict noir sur blanc.

Si le code ne respecte pas une de ces contraintes, c'est une régression doctrinale.
