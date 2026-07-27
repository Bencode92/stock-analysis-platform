# PRÉ-ENREGISTREMENT — Convictions thématiques picks & shovels
## Pari horodaté & critères de falsification

> **Gelé le 2026-07-27** par commit Git (l'horodatage = la preuve).
> Réponse au « plafond honnête » : on ne peut pas backtester son jugement *vers l'arrière*
> (le hindsight s'infiltre), donc on le teste **vers l'avant** — pré-enregistrement + critères
> de succès/échec écrits **AVANT** de connaître le résultat. C'est le seul test du jugement
> qui ne peut pas tricher.
>
> **Règle de gel** : ce document et l'état de `convictions-framework.html` au commit de ce jour
> ne sont **jamais édités rétroactivement**. Toute évolution = nouvelle version datée ; le gelé
> reste le témoin. Modifier le pari après coup = tricher.

---

## 1. Le pari (état gelé au 2026-07-27)

| Rang | Thème | Position (conviction Claude) | Facteur capex-IA | Complétude |
|---|---|---|---|---|
| 1 | Réseau électrique européen | PROGRESSIF → PLEIN | 25 % | 94 % |
| 2 | Énergie / Nucléaire & combustible | ACTIF (combustible + existant) · SMR = VEILLE | 15 % | 82 % |
| 3 | IA-infra (power & cooling) | ACTIF | 100 % | 100 % |
| 4 | Défense & Aéro (EU + US) | SELECTIF sur repli (composants > primes) | 0 % | 94 % |
| 5 | Semi-conducteurs (équipement + HBM) | PROGRESSIF (sur correction) | 100 % | 100 % |
| 6 | Matières critiques | Diagnostic FORT / véhicules FAIBLES (exposition bornée) | 20 % | 100 % |
| 7 | Robotique / Humanoïdes | **VEILLE** | 80 % | 100 % |

- **Plafond commun capex-IA** : Σ(poids × facteur) ≤ **35 %**, défini AVANT les achats.
- **Matrice de stress** obligatoire : capex-IA déçoit / Taïwan / taux +200 bps.
- **Conviction utilisateur** (Benoit) : `[À COMPLÉTER]` — les positions de l'utilisateur ne sont
  PAS encore posées ; le gel enregistre l'état, y compris ce vide.

## 2. Ce qu'on affirme (les hypothèses en jeu)

- **H-hedge** (le seul finding déjà robuste en données) : semi et défense se **décorrèlent en stress**
  (validé rétrospectivement : 2022, semi −28 % / primes défense +71 %).
- **H-structure** : la valeur du framework est un **filtre + une structure de risque**, pas un alpha
  de stock-picking (sélection intra-thème ≈ random) ni de theme-timing (le momentum de thème perd
  contre le hold diversifié : 34,2 % vs 37,5 % CAGR sur 2018-2026).
- **H-plafond** : contraindre l'exposition capex-IA réduit le drawdown sans détruire le rendement.

## 3. CRITÈRES DE FALSIFICATION (écrits AVANT le résultat)

> Évaluation à **12 mois (2027-07-27)** et **24 mois (2028-07-27)**, net de coûts (20 bps + TER).

**F1 — Le picks & shovels bat-il l'ETF-thème ?** (le test du framework comme *sélection*)
Le panier equal-weight des enablers des **fiches actives** (position ≠ VEILLE) doit battre, en Sharpe
net, le panier equal-weight des **ETF-thèmes correspondants**.
→ **Échec si** le panier n'ajoute rien (Δ Sharpe ≤ 0) → conclusion : rester en ETF-thème (le direct
n'apporte pas). *Cohérent avec la doctrine ETF-only si F1 échoue.*

**F2 — Le plafond capex-IA a-t-il une valeur de risque ?**
Le maxDD du portefeuille **contraint** (Σ poids×capex-IA ≤ 35 %) doit rester **sous** celui du
portefeuille **non contraint**, sans coût de CAGR > 3 pts/an.
→ **Échec si** DD non réduit OU coût de rendement > 3 pts → le plafond = garde-fou nominal, pas contrainte.

**F3 — Le hedge semi ↔ défense tient-il hors-échantillon ?**
Dans la **prochaine fenêtre de stress marché** (drawdown > 10 %), la corrélation semi/défense doit rester
≤ 0 (ou nettement sous sa moyenne calme).
→ **Échec si** corrélation positive en stress → la thèse diversifiante était un artefact 2022.

**F4 — Discipline VEILLE robotique.**
La robotique ne passe ACTIVE **que si** les 3 critères pré-définis sont remplis : (a) carnets composants
(Harmonic Drive/Nabtesco) en inflexion vérifiable, (b) couverture Asie opérationnelle, (c) déploiement
humanoïde commercial payant documenté.
→ **Échec de discipline si** activée sans les 3 critères.

**F5 — Le null honnête.**
Si **F1, F2 et F3 échouent tous** → le framework est un narratif : on **revient à ETF-thèmes + marché
large**, taille thématique réduite, et on l'assume.

## 4. Ce que ce pré-enregistrement NE prétend PAS

- Ce n'est pas un backtest flatteur. C'est un **pari daté et ses conditions de réfutation**.
- 12-24 mois = un régime possible, pas une preuve éternelle. On lit une **direction**, pas une p-value.
- Le jugement « quels chokepoints » reste subjectif — c'est justement pourquoi on l'**enregistre** au
  lieu de le backtester (on ne peut pas backtester son jugement hors de la boucle).

## 5. Journal de revue (à remplir aux dates, sans toucher au reste)

| Date | F1 | F2 | F3 | F4 | Verdict | Note |
|---|---|---|---|---|---|---|
| 2027-07-27 (12 mo) | | | | | | |
| 2028-07-27 (24 mo) | | | | | | |

## 6. Amendements datés (append-only — le pari §1 reste intact)

> Règle : on n'efface ni ne réécrit le pari gelé. Toute décision de construction s'**ajoute** ici,
> datée, avec son rationnel. Un plafond ou une règle qui se négocie après coup au fil de l'eau
> n'est plus une règle ; daté et écrit, c'est une décision assumée.

**A1 — 2026-07-27 · Sizing des 4 profils (curseurs par défaut).**
Cœur VWCE / ballast (oblig+or) / satellite thématique = **Stable 57/35/8 · Modéré 68/15/17 ·
Agressif 67/8/25 · Agressif-Thématique 45/5/50**. Dans le satellite : thèmes **equal-weight**
(le backtest interdit de classer par conviction), **ETF-primary** (H4 : le direct ne bat quasi pas
l'ETF-thème). Rationnel : cœur = marché (rien ne le bat) ; satellite = STRUCTURE de risque, pas alpha.
*Ces chiffres sont les curseurs de départ manipulables ; tout resizing final = nouvel amendement daté.*

**A2 — 2026-07-27 · Robotique exclue du satellite investi (résout le point 1 d'audit).**
La robotique est en **VEILLE** (critères d'activation non remplis) → elle ne peut pas figurer dans un
satellite investi. Le pré-calcul qui donnait l'Agressif-Thématique à ~39 % de capex-IA **comptait à tort
la robotique**. Recalcul robotique exclue : **32 % ≤ 35 %**. **Conséquence : le plafond 35 % tient sans
amendement ni trim.** On n'a pas eu à « assumer un dépassement » — il n'y en avait pas.

**A3 — 2026-07-27 · `transition_progressive` de la poche actions scorées (point 2).**
Le bras B a testé un **proxy** qualité sur ~200 large-caps US, pas le composite ni l'univers. Il ne
justifie pas de **vendre** FHI/EXPD/CBOE/CF : le coût (frottement + PFU 30 % sur PV latentes hors enveloppe)
est **réel et certain**, le bénéfice **théorique et hors-univers**. Décision : **gel des achats** dans la
poche scorée, **décroissance naturelle** ou transition par tranches vers le satellite structurel. **Aucune
vente forcée.** Flag `transition_progressive` dans le générateur.

**A4 — 2026-07-27 · Règle de dérive passive du cœur (point 4).**
`CORE_MEGATECH` (part IA implicite de VWCE, ~22 % à date) est une **variable, pas une constante** : si les
mega-caps montent, le cœur consomme davantage du budget capex-IA sans transaction. Règle écrite d'avance :
**recalcul à chaque revue trimestrielle** ; **bande de tolérance ±3 pts** ; **action (trim satellite)
seulement au rebalancement annuel**, sauf dépassement passif > 3 pts qui déclenche un trim hors-cycle.
Un dépassement passif ne se **renégocie** pas — il applique cette règle.

---

*Ce document rend la démarche crédible précisément parce qu'il peut échouer publiquement.
C'est ce qu'on met devant un conseiller : pas un graphe qui monte, un pari qu'on ose dater.*
