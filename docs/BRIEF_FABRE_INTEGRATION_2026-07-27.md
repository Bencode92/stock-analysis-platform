# Brief de décision — Intégration thématique + émergent (pour Fabre)

**Date :** 2026-07-27 · **Statut :** à présenter au **Fabre humain** → gel A5a possible avant, A5b après
**Rattaché à :** `PREREGISTRATION_CONVICTIONS_2026-07-27.md` (pari gelé + A1-A4) · `RESULTATS_3BRAS_2026-07-27.md` (preuve backtest) · `AMENDEMENTS_A5_2026-07-27.md`

> ⚠️ **Attribution des revues.** Les avis « revue IA » de ce document sont ceux d'IA co-construites avec
> l'utilisateur (Claude) — **pas** le troisième regard indépendant. Ce brief est un **support à présenter** au
> **Fabre humain** ; il ne l'a **pas encore vu**. La revue indépendante se fait en séance.

---

## 0. Ce qu'on te demande (5 décisions)
Valide ou amende — chaque décision entre dans le freeze comme **A5 daté**, pas de réécriture silencieuse :
1. **Curseurs de taille** des 3 profils (satellite 17 / 25 / 50 %).
2. **Surpoids EM (IEMG)** : gardé, et sur quels profils ?
3. **Plafond mono-titre look-through** : 5 % confirmé ?
4. **TSMC en ligne directe** : gate approuvé ? Critères de sortie validés ?
5. **Ordre** : on fige A5 maintenant (curseurs par défaut) ou après le re-run Asie ?

---

## 1. Ce qui est déjà gelé (rappel, non rouvert ici)
- **Backtest 3-bras** : aucune sélection ne bat le marché réel (ACWI). → **cœur = VWCE**, satellite thématique **petit & structurel** (diversification, pas alpha), enjeux = **filtre + rationnel de diversif**, jamais signal de rendement. Seul finding robuste = **hedge semi↔défense**.
- **Préreg** : 7 thèmes gelés, critères de falsification **F1-F5**, **plafond capex-IA 35 % sur le portefeuille ENTIER** (cœur VWCE porte déjà ~22 % mega-tech = IA implicite).
- **Amendements déjà actés** : A1 (curseurs de départ), A2 (robotique VEILLE exclue du satellite investi → plafond tient à 32 %, pas 39 %), A3 (`transition_progressive` : la poche scorée FHI/EXPD ne se vend PAS), A4 (dérive passive du cœur : recalcul trimestriel, tolérance ±3 pts).
- **Profil réel retenu (réalisme utilisateur)** : **les 3 — Modéré, Agressif, Agressif-Thématique.** Le Stable reste généré par la plateforme mais **hors cible**.

---

## 2. Construction proposée des 3 profils (curseurs à valider — sortie routeur v2)

| | **Modéré** | **Agressif** | **Agressif-Thématique** |
|---|---|---|---|
| Cœur VWCE | ~68 % | ~57 % | ~45 % |
| Ballast (oblig/or) | ~15 % | ~8 % | ~5 % |
| Satellite thématique | **17 %** | **25 %** | **50 %** |
| capex-IA total (plafond 35 %) | ~22 % ✅ | ~28 % ✅ | ~32 % ✅ |
| Thèmes du satellite (EW) | semi ↔ défense + réseau | semi, IA-infra, défense, nucléaire | 6 chaînes actives (robotique exclue) |

**Règles de construction (dérivées du backtest, non négociables) :** thèmes **equal-weight** (la conviction FILTRE, ne PONDÈRE pas) · **ETF-primary** · plafond capex-IA **portefeuille entier** · colonne vertébrale = **hedge semi↔défense**.

---

## 3. L'émergent — sur 2 étages, zéro nouveau pari

**Point de doctrine :** l'émergent n'est **pas une chaîne de valeur, c'est une géographie**. Il n'a donc **pas de thème/conviction propre** (ce serait un pari de régime « l'Asie va gagner », interdit par le backtest — l'EM sous-performe le DM depuis ~15 ans). Il **enrichit** les convictions existantes.

**Étage 1 — cœur (allocation)** : surpoids EM via **IEMG +15 %** (décision 17/06, additif aux ~10 % EM de VWCE → expo ~20-25 %). Gardé comme **diversification structurelle** (β, valo décorrélée), pas comme prédiction. → *À confirmer par profil (décision 2).*

**Étage 2 — satellite (chokepoints amont)** : l'amont irremplaçable de nos chaînes est **majoritairement asiatique**. Ces enablers sont **déjà dans le framework** en `hors_pipe`, ils deviennent `data` au re-run Asie (cache déjà chaud, chiffres vérifiés) :

| Thème | Chokepoint | ROE / ROIC (cache) | Statut |
|---|---|---|---|
| Semi | Tokyo Electron (8035) | 29,3 / 22,6 | ✅ active |
| Semi | Lasertec (6920, inspection EUV) | 46,9 / 38,2 | ✅ active |
| Semi | Advantest (6857, test) | 57,7 / 61,8 | ✅ active |
| Semi | **TSMC (2330, fonderie)** | 35,0 / 35,0 | ✅ active → **candidat direct** |
| Réseau | Hitachi (6501) | 13,3 / 6,8 | ✅ active |
| Réseau | HD Hyundai Electric (267260, transfos) | 41,3 / 24,6 | ✅ active |
| Semi | ASM Pacific (0522, packaging) | — | ❌ bloqué (bug padding code HK court) |
| Matières | Lynas (LYC, terres rares hors-Chine) | — | ⚠️ à vérifier au re-run |

→ **Activer ≠ créer.** Ce sont des enablers existants qui passent `hors_pipe` → `data`. Aucune nouvelle conviction, sauf TSMC (ci-dessous).

**Étage 3 — lens de risque (pas d'investissement)** : dépendance Chine (terres rares) + concentration Taïwan (semi) = déjà dans la matrice de stress (scénario Taïwan). Facteur à surveiller, jamais signal de rendement.

**Logique de dosage :** plus le satellite est gros, plus la chaîne charge d'amont asiatique → l'exposition émergente se dose **mécaniquement** avec l'agressivité, sans décision discrétionnaire.

---

## 4. Lignes directes — règle + candidats

**Règle (réconcilie ETF-only 12/06 + doctrine picks & shovels) :**
- Conviction de **thème** → **ETF** (défaut, cohérent backtest H4 : le direct ne bat quasi pas l'ETF).
- Conviction de **chokepoint** isolable qu'aucun ETF ne capture **ET** double conviction → **ligne directe**, gated.
- La ligne directe **partage** le poids du thème avec son ETF (ne s'ajoute PAS par-dessus = pas de levier déguisé).
- **Plafond mono-titre look-through** (portefeuille entier) = poids dans les ETF détenus + ligne directe. *Proposé : ≤ 5 % (décision 3).* Le routeur trime la ligne directe si dépassement (démontré : Cameco via URA 24,5 % → 5,19 % → trim).

**Candidats directs (gated, hors poids live tant que Fabre n'a pas tranché) :**

| Ticker | Rôle | Justification « isolable » | Critères de sortie (leading, falsifiables) |
|---|---|---|---|
| **ASML** | Litho EUV | Monopole EUV, aucun ETF ne donne un poids significatif sans empiler autre chose | **tripwires a/b/c** (érosion revenus Chine < 10 % / SMIC 7-5 nm SAQP en volume / machine sub-10 nm chinoise ou alternative EUV validée) — cf. A5 |
| **TSMC** | Fonderie | ⚠️ argument plus faible : SOXX **contient** TSM (4,26 %) ; le vrai point = « aucun ETF ne donne un poids TSMC sans empiler NVDA/AMD » | escalade Taïwan documentée / dérisque hors-Taïwan (Arizona-Kumamoto) / perte d'avance N2-N3 — **PAS** « risque Taïwan matérialisé » (= la catastrophe, inutilisable) |

**⚠️ Faille 1 (revue IA) — décisions 2 et 4 sont COUPLÉES.** TSMC = 1ʳᵉ ligne des indices EM. Look-through TSMC
complet, **avec la règle direct ≤ 1/3 du thème** :

| Profil | via VWCE | via IEMG | direct (≤ 1/3) | **TSMC total** | plafond 5 % |
|---|---|---|---|---|---|
| Modéré | 0,68 % | — | — | **0,68 %** ✅ | |
| Agressif | 0,57 % | 1,42 % | 2,08 % | **4,08 %** ✅ | |
| Agressif-Thématique | 0,45 % | 1,42 % | 2,78 % | **4,65 %** ✅ | |

Le surpoids IEMG pose ~1,4 pt de TSMC **avant** tout direct → il consomme le budget du direct → on ne peut pas
avoir IEMG surpondéré ET un gros direct TSMC. Et le direct TSMC = **ajout VOLONTAIRE de tail risk** là où l'archi
dit de plafonner (autorisé sur Agressif/Thématique, mais présenté comme tel).
*À 1/2 du thème, Agressif et Thématique breachaient (5,12 % / 6,04 %) → d'où la **règle ≤ 1/3** (A5a.4).*

**Deux garde-fous, pas un** (règle issue de la revue IA) : plafond 5 % look-through **ET** direct ≤ 1/3 du thème.
**ASML a le même problème** côté véhicule (~1/N du panier, ~8-10 % des ETF semi) → gate validé **en principe**,
mais son **sizing glisse en A5b** (recalcul sur le panier semi post-Asie, qui passe de 6 à 9 membres). Look-through
ASML ≤ 1/3 post-Asie : Agressif **2,83 %**, Thématique **3,62 %** ✅.

→ **Décision 4 (avis IA) :** gate TSMC **refusé en l'état**, re-soumis en A5b après critères corrigés +
look-through recalculé sur la composition semi finale. **ASML : gate solide en principe**, sizing en A5b.
Profils : ASML (Agressif / Thématique), TSMC (Agressif / Thématique — budget risque assumé).

---

## 5. État technique (contexte, pas à trancher)
- ✅ **Fix pushé sur main** (`stock-filter-by-volume.js`) : les `_filtered.csv` sont écrits **avant** l'enrichissement → un timeout ne perd plus le résultat du filtre (bug qui avait fait disparaître le Japon).
- ⏳ **Re-run Asie en attente** : ~1h30-2h30 (cache fondamentaux déjà chaud, 6 279 entrées asiatiques). Activera les chokepoints ci-dessus.
- ⏳ **Après le run** : merge `stocks_asia.json` dans le framework + patch collision région-aware (`framework_data.py`, clé ticker+pays — 1 979 tickers numériques en collision côté Asie).
- ✅ **Routeur v2 prêt** : look-through (etf_holdings réel), gate direct, plafond capex-IA, exclusion VEILLE.

---

## 6. Décisions — statut post-revue IA (Claude) (détail dans `AMENDEMENTS_A5_2026-07-27.md`)

**Scission A5a (gelable maintenant) / A5b (après re-run Asie)** — car l'arrivée de Tokyo Electron/Lasertec/
Advantest change la composition du thème semi, donc tous les look-through. Geler TSMC avant = geler un chiffre faux.

**A5a — maintenant (ne dépend pas de l'Asie) :**
1. **Curseurs 17 / 25 / 50 %** — OK (avis IA), avec reconnaissance écrite : Thématique 50 % → stress capex-IA −40 % coûte ~8-10 % du profil.
2. **Plafond mono-titre 5 %** — OK, + recalcul trimestriel (aligné A4). **+ règle direct ≤ 1/3 du thème (A5a.4).**
3. **Surpoids IEMG** — Agressif + Thématique ; Modéré = VWCE seul. **Conditionné à la Faille 1** + nouveau critère **F6** (à 24 mois, la décorrélation EM/DM réalisée justifie-t-elle le poids ?).

**A5b — après re-run Asie + avis terrain Fabre :**
4. **TSMC direct** — gate **refusé en l'état**, re-soumis avec critères leading corrigés + look-through recalculé + tail-risk assumé par écrit. **ASML** : gate validé.
5. **Activation chokepoints asiatiques** + **colonne `part_ca_chine`** par enabler semi (remplie jour 1 du run — double tenaille Chine/MATCH Act, cf. note Semi 27/07).

*Rappel de méthode : on lit des directions et on gèle des décisions datées, pas des p-values. On amende les CRITÈRES sur une news (tripwires ASML), on ne re-trade PAS la position gelée. Toute décision qui change plus tard = nouvel amendement daté, jamais une réécriture.*
