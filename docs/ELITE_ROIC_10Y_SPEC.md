# Socle actions elite — spécification FIGÉE de la clé de départage (ROIC 10 ans)

**Statut** : définition arrêtée le 2026-09-09, **AVANT** de charger les données (pour ne pas ajuster la
clé au résultat — critère d'arrêt : *la définition est-elle figée et justifiable sans regarder la sortie ?*).
**Origine** : 3 revues expert sur `portfolio_engine/equity_elite.py`. La clé sur 3 ans est fragile
(churn 68 % entre variantes) ; ce document gèle la clé cible pour un run UNIQUE quand le ROIC 10 ans sera
disponible. **Aucune nouvelle variante de clé ne doit être testée avant ce run.**

## 1. Définition du ROIC (une seule pour tout l'univers)

    ROIC = NOPAT / (capitaux propres + dette nette − trésorerie excédentaire)

- **NOPAT** = résultat d'exploitation × (1 − taux d'impôt effectif).
- **Goodwill INCLUS** dans le capital investi → punit les acquéreurs sériels (le goodwill est du capital
  réellement déployé).
- **Trésorerie excédentaire RETIRÉE** du dénominateur → corrige le biais Japon (bilans gorgés de cash qui
  écrasent artificiellement le ROIC). Trésorerie excédentaire ≈ cash au-delà de ~2 % du CA (à caler).
- **Financières** : jugées au **ROE** (le ROIC/D-E n'a pas de sens pour un assureur/broker), même logique.

## 2. Fenêtre — 6 ans (contrainte source : Twelve Data plafonne à 6 exercices)

Vérifié 2026-09 : Twelve Data (`/income_statement`, `/balance_sheet`, période `annual`) renvoie **6 années
max** (2020→2025), pas 10. Le « 10 ans » idéal exigerait une source payante (FMP, Sharadar). On retient
donc **6 exercices** — déjà 2× les 3 ans du départage v3, et couvrant COVID 2020 + choc taux 2022 (vrai
test de persistance). Minimum **4 disponibles**, sinon **« historique court »** → plafonné au demi-poids.

**Tous les champs ROIC sont dans Twelve Data** (mapping figé) :
- NOPAT = `operating_income` × (1 − `income_tax`/`pretax_income`).
- Capital = `shareholders_equity.total_shareholders_equity`
  + (`short_term_debt` + `long_term_debt`)  [dette]
  − (`cash_and_cash_equivalents` + `other_short_term_investments`)  [cash / trésorerie excédentaire].
- Goodwill INCLUS (`assets.non_current_assets.goodwill`, déjà dans le capital via l'équité — ne pas soustraire).

## 3. Les quatre clés, dans l'ORDRE FIGÉ (lexicographique, tout descriptif)

1. **Durabilité** (score anti-piège maison, A > B) — ce que l'entreprise EST.
2. **Persistance** = nombre d'exercices sur **6** avec **ROIC ≥ 12 %** (financières : ROE ≥ 12 %). Plus haut = mieux.
3. **Dispersion** = **semi-déviation SOUS la médiane 6 ans uniquement** — JAMAIS l'écart-type total.
   Une hausse de ROIC ne pénalise pas ; une baisse, oui. Plus bas = mieux.
4. **FCF yield vs médiane du secteur** (valorisation descriptive, pas prédiction). Plus haut = mieux.

**Interdits** (leçons des 3 revues) :
- ❌ écart-type/moyenne symétrique (punit la progression : Nvidia/TSMC exclus d'avoir monté).
- ❌ ROIC brut ou plancher en niveau (chasse l'asset-light : Rightmove 281 %, GTT).
- ❌ **sector-relatif** (leadership vs médiane du secteur) TANT QUE le run avec ces 4 clés n'a pas été fait
  — il réintroduit « le meilleur d'un secteur médiocre » (violation retirée en v2).
- ❌ **funnel / conviction dans le tri** — la conviction FILTRE, ne CLASSE pas. Funnel = tag seulement.

## 3bis. Porte VALORISATION — critère, pas grade (à corriger au run 10 ans)

La porte valo actuelle utilise `buffett_grade ∈ {A,B}`. Or un grade B peut s'obtenir en RATANT
précisément le critère valo (4/6 autres critères passés). Vérifié : ASML (grade B, `valuation_ok` ✗,
PE 56) et Lam (grade B, `valuation_ok` ✗, PE 53) passent la porte alors qu'ils sont chers ; Nvidia
(grade A, `valuation_ok` ✓, PE 28,7) passe légitimement. **Correctif figé** : la porte valo devient le
**critère binaire `valuation_ok` = vrai**, pas le grade. Avec ça, ASML/Lam sortent pour la valo,
Nvidia reste (et son exclusion serait alors purement le départage 3 ans).

**Journal ASML/Lam/Nvidia** (formulation correcte, laisse la méthode trancher) :
« ASML/Lam/Nvidia passent les portes de qualité. Nvidia passe aussi la valo (PE 28,7). ASML/Lam
échouent le critère valo (PE ~55) — exclus à raison une fois la porte valo passée au critère.
Nvidia : exclu TEMPORAIREMENT par le départage 3 ans (défaut connu) et un cap Tech rempli de B à
12-14 %. Réexamen au run ROIC 10 ans avec coupe intra-secteur par persistance. Détenus via SMH (11 %)
entre-temps ; le plafond look-through par titre (4 %) gère le cumul. » — PAS « pas leur place dans un
socle qualité » (résultat faux gravé en doctrine).

## 4. Portes d'entrée (inchangées vs v3, sauf porte valo → critère ci-dessus au run 10 ans)

Anti-piège (durab A/B + mirage=faux) · qualité A/B · **valo** buffett A/B · rentabilité ROIC ≥ 15 % (fin. :
ROE ≥ 15 %) · marge > 0 · FCF > 0 · levier D/E ≤ 2,5 (hors fin.) · investabilité **ADV ≥ 5 M$** · historique
≥ 3 ans + young_listing=faux. Caps : max 2/industrie fine, **8/secteur GICS**, **6 financières**.
Bannis manuels journalisés (JBS). Paires corrélées > 0,70 hebdo → **max 1** (ROST/TJX appliqué).

## 5. RÈGLE DE TRANSITION pour le run 10 ans (écrite AVANT de le lancer)

Le run 10 ans produira une liste différente de v3. Pour ne pas re-churner 60 % :

- Un nom v3 **ne sort que** s'il **casse une porte de SORTIE** *ou* **tombe hors du top-60** de la nouvelle
  clé (top-**60**, pas top-40 → zone tampon d'hystérésis).
- Un entrant **ne remplace qu'un sortant** (pas d'ajout net).
- **Plafond : 10 changements maximum** sur ce run. Le surplus se fait **par vagues trimestrielles**.
- Sans cette règle, un 3ᵉ churn de 60 % serait faussement appelé « la donnée qui tranche ».

## 6. Référence courante

`data/portfolios_elite.json` = **v3 figé** (clé symétrique provisoire, validé au contrôle facteurs :
R² 0,74 vs S&P500 EW, tilt qualité +0,51). La présente spec s'applique au **prochain** run, quand le ROIC
10 ans sera ingéré dans le pipeline. Réexamen déclenché par cette ingestion, pas avant.

## 7. INTÉGRATION CODÉE (2026-09-09) — gatée derrière `ELITE_KEY`, CI toujours en v3

L'ingestion 6 ans est **branchée dans le pipeline GitHub Actions existant, sans nouveau workflow ni appel
API** (la série 6 ans était déjà fetchée par Twelve Data et jetée à la sérialisation) :

- **`scripts/stock-filter-by-volume.js`** (job `filter-stocks.yml`, week-end) : calcule `roic_persist_6y`,
  `roe_persist_6y`, `roic_downside_6y`, `roe_downside_6y`, `years_roic_6y` depuis `yearlyRatios` (déjà là).
  Helpers `arrPersist` (nb ≥ 12 %) + `arrDownsideDev` (semi-déviation sous médiane). Écrits au CSV (HEADER),
  aux 3 sites d'assignation + placeholder. **`deriveElite6y`** dérive ces champs des `yearly_roic`/`yearly_roe`
  **déjà stockés dans `fundamentals_cache.json`** → les 15 655 entrées cache sont enrichies **sans refetch**.
- **`stock-advanced-filter.js`** (job `stock-filter.yml`) : parse les colonnes CSV, réémet dans l'objet
  écrit en `stocks_*.json`, et **propage** les 5 champs (entité-niveau) dans `reconcileEntities.FUND`.
- **`portfolio_engine/equity_elite.py`** : `ELITE_KEY` (défaut `v3`). `ELITE_KEY=v4` active la clé figée §3
  (persistance ↑ → semi-déviation ↓ → FCF), la **porte valo au critère `valuation_ok`** (§3bis), l'historique
  court à demi-poids (§2), et la **règle de transition §5** (top-60 + plafond 10 changements/run, sorties
  hors top-60 différées en vagues). `ELITE_DRY=1` = aperçu sans écraser les fichiers commités.

**Séquencement** : (1) prochain `filter-stocks.yml` peuple les champs (dérivés du cache, immédiat) ; (2)
`ELITE_KEY=v4 ELITE_DRY=1 python3 portfolio_engine/equity_elite.py` → montre le **before/after ≤ 10** ;
(3) validation humaine ; (4) bascule du défaut ou run réel `ELITE_KEY=v4`. Le CI par défaut (v3) est resté
**identique** (run de contrôle : 0 changement).

## 8. DÉCISION EXPERT 2026-09-10 — v4 REFUSÉ en l'état, découplé en v4a / v4b

Test sur données réelles : **8 sorties sur 10 viennent de la porte valo, pas du départage**. Basculer v4
bundlé = convertir un socle qualité en socle value sous couvert d'un fix data. **Décision : ne pas basculer v4
tel quel.** On découple, deux dossiers, deux dates :

- **v4a = départage 6 ans seul.** Ne se lance **qu'après T3 puis T2**, dans cet ordre :
  - **T3 (ROIC hors cash excédentaire)** — *avant tout*, non négociable. Capital investi = capitaux propres
    + dette financière − (trésorerie − max(0, 2 % du CA)). Sinon la persistance (n/6 ≥ 12 %) est biaisée pour
    ~1/3 de l'Asie (Keyence, OBIC, DISCO, MonotaRO). Cohérence d'affichage à mettre à jour en même temps.
  - **T2 (re-spéc de la clé downside)** — la semi-déviation sous médiane **punit les risers** (Nvidia 47,7),
    promesse non tenue mathématiquement. Remplacer par **max drawdown du ROIC** (plus grande baisse pic→creux
    *ultérieur* sur la fenêtre, en % du pic) : un riser pur = 0 ; une vraie chute (TSMC 2023, Nvidia 2022) =
    pénalité légitime. Ordre v4a figé : durabilité → persistance (n/6 ≥ 12 %) → **ROIC-drawdown ↓** → FCF yield ↑.
  - Puis figer v4a → **DRY sur le pool v3 (402)** → dossier v4a seul (churn attendu < 10). C'est le chiffre
    qui manque : mesurer l'effet PROPRE du départage, hors redécoupage du pool par la porte.
- **v4b = porte valo.** Un **PE plat ~30 n'est PAS une porte valo pour un socle qualité** (rejette l'archétype :
  ISRG/Fastenal/Keyence PE > 30 depuis 10 ans ; punit à contre-sens les cycliques : VAT PE 88 = creux de cycle,
  pas excès de prix ; contredit l'identité facteur VALUE −0,13 figée au §6 sans dossier facteur). Remplacer par
  une **porte d'ABSURDITÉ sectorielle** (EV/EBIT ≤ 2× médiane secteur ; financières P/B ≤ 2× médiane) + **rendement
  minimal** (FCF yield ≥ 1,5 % croissance / 3 % classique, barème adaptatif existant), et **laisser la valo au
  départage** (FCF yield, déjà clé 4). Pas de PEG (réintroduit une prévision de croissance, hors doctrine).
  **Avant tout seuil** : test rétroactif de `valuation_ok` sur les 40 tenus × 6 exercices — si > 25 % échouent
  *de façon persistante*, la porte change le STYLE, pas la sélection. Décision séparée, ~fin d'année, + dossier facteur.

### Corrections immédiates HORS v4 (revue expert, appliquées 2026-09-10)
1. **ADV en porte de SORTIE** (`_passes_exit`, seuil 3 M$, bande de grâce vs 5 M$ entrée) : un tenu devenu
   illiquide sort. Corrige une fuite v3 — le socle gelé tenait **5 noms < 3 M$** (Thinking 2,56 · Topco 2,81 ·
   Shanghai Conant 1,28 · Anjoy 2,18 · XPS 2,25). `EXIT_ADV_USD`. **Applique en v3, pas gaté.**
2. **Sélection déterministe des sortants au-delà du plafond** (`_gate_miss`) : ordre = pire rang de pool →
   pire échec de porte (distance au seuil) → ticker. Fini l'ordre-de-liste arbitraire.

**Correctif de la reco initiale** : la porte valo « critère `valuation_ok` obligatoire » (§3bis) a été proposée
sans connaître sa définition (PE plat non sectoriel). Elle est **mauvaise telle qu'implémentée** — c'est l'objet
de v4b. `valuation_ok` reste utilisé par v4 (gaté, non basculé) en attendant la refonte v4b.

## 9. T3 — ROIC HORS CASH EXCÉDENTAIRE : définition RE-FIGÉE (revue expert 2026-09-10)

**Historique** : l'expert a d'abord écrit une formule **côté financement** (`capital = CP + dette − max(0, cash −
2%·CA)`). Mesurée sur le cache (10 608 titres) AVANT de coder : **IC négatif pour 1 129 titres (11 %)** dès que
`cash > CP + dette` (précisément les riches en cash visés), 48 % de changement matériel, +1 191 franchissements
nets de la porte 12 %. **Défaut numérique, pas désaccord.** L'expert corrige et re-fige **côté actifs, avec
plancher** (une seule définition, tout l'univers **hors financières** — celles-ci restent au ROE) :

- **IC** = total actifs − dettes fournisseurs − charges à payer − autres passifs courants NON porteurs d'intérêt
  − max(0, trésorerie − 2 %·CA). Implémentation : `IC = total_assets − (total_current_liabilities −
  short_term_debt) − max(0, cash − 0,02·revenue)` (la dette court terme = seul passif courant porteur d'intérêt,
  reste dans l'IC comme financement).
- **NOPAT** = (EBIT − produits financiers sur trésorerie) × (1 − taux d'impôt effectif **borné 15-35 %**). Si on
  retire le cash du dénominateur, on retire ses intérêts du numérateur — sinon ROIC gonflé deux fois.
- **PLANCHER IC** = `max(IC, 0,10·CA)`. Un IC → 0 (plateformes asset-light) fait exploser le ratio ; le plancher
  borne le ROIC (affichage + drawdown), **PAS une porte** (ne change pas qui passe 12 %). Garantit `IC > 0` pour
  tout CA positif → critère « IC négatif = 0 » satisfait **par construction**.
- **COHÉRENCE** : cette définition remplace le ROIC **partout** (affichage, porte 4, persistance, drawdown). Pas
  deux ROIC. Le plancher 10 %·CA est un choix de robustesse **figé** (5 % ou 15 % défendables — ne pas optimiser).

### Critères d'acceptation — ÉCRITS AVANT LA MESURE (si un seul échoue : remonter, re-figer, relancer une fois)

| Test | Seuil |
|---|---|
| IC négatif | **0 titre** (garanti par le plancher) |
| Δ ROIC médian | **±2 pts** |
| Changement matériel (\|Δ\|>2 pts) | **< 25 %** de l'univers |
| Franchissent 12 % net vers le haut | **< +300** (≈ 3 %) — au-delà : buffer 2 % trop agressif → tester 5 %·CA |
| Japon (DISCO, MonotaRO, OBIC) | restent **relevés** (sens + ordre de grandeur) |
| p99 Δ | **< +30 pts** |

**Protocole** : la mesure exige une passe de données BRUTES (dettes fournisseurs / charges à payer / passifs
courants / produits financiers — AUCUN n'est dans le cache). `scripts/measure_roic_excash.mjs` fetche un
échantillon stratifié (tout le Japon cash-lourd + N aléatoires/région), calcule ROIC ancien vs nouveau, évalue
les 6 critères — **SANS toucher la prod**. Bascule (remplacement global du ROIC) **seulement si les 6 passent**.

**Point de méthode (journal)** : l'expert a écrit une formule côté-financement sans la tester ; le pipeline l'a
mesurée avant de coder. Règle qui en sort : *toute définition figée passe par une mesure d'impact sur l'univers
avant le run de sélection, même quand elle vient de l'expert.*

### 9bis. RE-FIGURATION après échec mesure #1 (2026-09-10) — plancher relatif

Mesure #1 (216 titres) : 4/6 ✅ mais **matériel 35,2 %** et **p99 +132** ÉCHOUENT. Diagnostic : buffer 2 % OK
(franchissements +102, Japon relevé) ; coupable = **plancher `10 %·CA`** (pathologique faibles-CA → pertes à
−50000 %, moyenne −8565 ; trop lâche asset-light). Deux décisions expert (seuils des 6 critères INCHANGÉS) :

- **Plancher RELATIF** (abandon du CA) : `IC_ajusté = max( IC_brut − max(0, cash − 2%·CA) , 0,5 × IC_brut )`
  avec `IC_brut = total_assets − (total_current_liabilities − short_term_debt)`. Retirer le cash ne peut au plus
  que **diviser l'IC par 2** (ROIC ×2 max). Justif : la plus forte correction légitime (DISCO +15 sur ~20 = ×1,75)
  reste sous ×2. Pas de dépendance CA, pas d'explosion asset-light, pas de cas négatif (`IC_brut ≤ 0` → titre écarté).
- **Population d'évaluation** : non-financières avec **ROIC_brut > 0**. Les pertes échouent la porte 4 de toute
  façon ; leur ROIC à −50000 % est un artefact de mesure. Stats univers entier = **info**, pas critère.

**RÈGLE D'ARRÊT (figée)** : **un seul re-run**. S'il échoue encore un critère → **T3 ABANDONNÉ pour ce cycle** :
on passe à T2 + v4a avec le ROIC actuel, biais Japon documenté comme limite connue, T3 revient au chantier
suivant. **Pas de 3ᵉ re-figuration** — une correction qui demande trois essais pour passer ses propres critères
n'est pas figée. **[Résultat 2026-09-10 : run #2 = 6/6 PASS → T3 adopté, basculé en prod, refetch en cours.]**

## 10. PREP v4a après revue de l'aperçu (2026-09-10) — corrections AVANT le run unique

Aperçu v3→v4a (drawdown dérivé, ancien ROIC) = 10 changements. Revue expert → 4 points réglés AVANT le run :

- **Un seul run, APRÈS T3** : ne PAS exécuter les 10 changements v4a maintenant (ancien ROIC) puis 10 autres
  après T3 = contourner le plafond de 10 en le respectant deux fois. L'aperçu est un aperçu ; le run unique
  attend le nouveau ROIC. Le run v4a se fait UNE fois, ≤ 10 changements.
- **Paire Visa/Mastercard** (réseaux paiement, corr hebdo > 0,8) ajoutée à `CORRELATED_PAIRS` → max 1
  (départage : Visa drawdown 0 % vs MA 1 % → Visa). MSFT rang 82 (hors socle) → pas de conflit Adobe.
- **Réseaux/bourses au ROIC** (`_FIN_ROIC_RE` : credit services + stock exchanges + financial data) : Visa/MA/SGX
  = capital investi réel → jugés au ROIC, pas au ROE (banques/assureurs/gérants restent au ROE). Libère aussi
  le cap 6 financières. v3 vérifié inchangé (0 chgt).
- **Journal des 6 sorties** : Anjoy (rang 440), Toyo Tire (331), Hannover Rück (446), Marsh (439), MGIC (370),
  RLI (355) — TOUS hors top-60 (spec §5), sortie légitime, pas « déclassé » vague. Games Workshop REVIENT
  (retiré à tort par la clé fautive, la persistance le réhabilite).
- **À surveiller (journal)** : Hugel ADV 9,1 M$ (passe le seuil 5 M$ mais juste, Corée) ; Wingstop fonds propres
  négatifs (IC côté actifs gère) mais PE très élevé → à vérifier contre la future porte v4b (ne pas le faire
  entrer puis sortir en 2 runs).

### DÉCISION FIGÉE (2026-09-10) — fenêtre 6 ans contient 2020 (COVID) : **ACCEPTER**
Le max drawdown punit ce qui a fermé en 2020 (retail/resto/luxe/voyage) et épargne le reste. **Décision : A —
accepter, ne pas neutraliser.** Aucun paramètre ajouté à la clé (drawdown 6 ans brut, 2020 inclus).

**Phrase de journal (figée)** : « Le socle traite un ROIC traversé sans chute en 2020 comme une information de
RÉSILIENCE, et l'assume. Conséquence acceptée : sous-pondération mécanique du conso discrétionnaire jusqu'à ce
que l'exercice 2020 quitte la fenêtre 6 ans (~2029). Choix figé, non re-débattu — cohérent avec la doctrine
"juger l'entreprise pour ce qu'elle EST", 2020 étant un vrai test de solidité, pas un artefact. »

## 11. RE-SPÉCIFICATION v4a (revue expert 2026-09-14) — FIGÉE AVANT LE DRY

**Constat** (DRY US+Europe sur données corrigées, 14/09) : ~200 éligibles sont à 6/6 de persistance → le drawdown seul
les classe **au dixième de point** (IBKR 0,9 vs Meitec 1,2). Un écart 3 % vs 4 % de drawdown n'est pas une différence
justifiable a priori : c'est un tri sur du bruit, qui ferait tourner la moitié du socle en trois trimestres (19 tenus
hors top-60). **La doctrine dit portes, pas classements. Le drawdown doit être une porte.**

**Clé v4a re-spécifiée** — ordre lexicographique, tout descriptif, une seule re-spec (pas de troisième clé) :

1. **Durabilité** A > B (inchangé)
2. **Persistance ≥ 12 %** : n/6 (inchangé ; historique court < 4 ans → demi-poids)
3. **PORTE drawdown ROIC ≤ 35 %** (pass/fail, à l'ENTRÉE) — au-delà, c'est une vraie chute, pas une normalisation.
   Un tenu qui la casse n'est plus dans le pool → sort **par vagues** (hors top-N), pas en sortie forcée.
4. **Échelle de persistance** : nombre d'exercices sur 6 avec ROIC ≥ **20 %** — départage « à quelle hauteur
   au-dessus de la barre », **sans classer par niveau de ROIC** (ce qui ramènerait l'asset-light). Même demi-poids si
   historique court. Financières : ROE, mêmes seuils.
5. **FCF yield** ↑ (inchangé, dernier)

Pourquoi pas « porte drawdown puis FCF directement » : avec 200 égalités, le FCF yield deviendrait le classement
effectif → le socle glisserait vers « la qualité la moins chère », biais value par la porte de derrière, sans dossier
facteur. L'échelle 20 % absorbe l'essentiel des égalités avant que le prix ne parle.

**Hystérésis** : top-60 sur un pool de ~395 est trop serré pour un book de 40 (15 % du pool). **TRANSITION_TOP_N = 100**
(2,5× le book). L'évolution douce est une règle, pas un vœu.

**Effet attendu sur les 19 tenus hors top-60 (à VÉRIFIER dans le DRY — si ce n'est pas ce qui sort, on remonte)** :
- **cassent la porte drawdown → sortent par vagues, légitimement** : Expeditors (50 %), VAT (45 %), T. Rowe (49 %),
  RLI (52 %), Universal Display (54 %), Thinking Electronic (43 %, déjà hors périmètre)
- **ne sont plus hors classement pour un dixième de point** : Coca-Cola (0 %), Chipotle (3 %), Veralto (1 %), Marsh (4 %)

**Règle d'exclusion (Q3, transforme le ban OppFi en méthode)** : la durabilité aurait dû le voir (PE 2,5 + vol 3 ans
68 % + subprime = mirage par définition).
- **Industries exclues du socle** : crédit conso subprime / prêteurs sur gages (pas d'industrie dédiée dans la
  nomenclature → traité par le flag ci-dessous + journal), jeux d'argent (`Gambling`, `Resorts & Casinos`).
- **Flag mirage automatique** : PE < 5 **et** vol 3 ans > 50 % → échec de porte (journalisé « mirage_auto »).
- Ban manuel OppFi journalisé (`BANNED`), motif « profil hors mandat compounder ».

**Paires max-1 (Q4)** : pas de bascule automatique. Le second (Visa) reste « prochain » et n'entre que si le premier
(Mastercard) casse une porte de sortie — c'est l'hystérésis. Règle valable pour toute paire.

**Europe (Q1)** : 34/6 accepté, structurel (ADV 3 M$ = +12 éligibles seulement). Pas de plancher régional. Réserves
journalisées : (i) 69 % d'Européens sous ROIC 12 % dépend en partie de la définition du capital investi (figée, assumé) ;
(ii) la file d'attente est déjà européenne (L'Oréal 16, Hermès 52, ASML 56, Ferrari, Publicis) → le 6 remontera seul.

**Séquence (Q5)** : re-spec → DRY → vérification des 19 → **run unique** (9 Asie + Hannover sortent, forcés ; 10 entrants
selon la nouvelle clé ; ≤ 10) → vagues trimestrielles journalisées avec la porte cassée nommée.

**Pilier 3** : priorité au socle. ASML (rang 56) est un cas limite : s'il entre au socle, il quitte le pilier 3.

**Données à corriger avant le run** : Lilly (volume/PE absents du flux → ADV null) ; Novo Nordisk (Twelve Data ne sert
pas `NOVO.B` XCSE sur le plan ; `NOVC` Xetra illiquide ; ADR `NVO` absent du seed US → décision d'univers à prendre).

## 12. DERNIÈRE RETOUCHE v4a (revue expert 2026-09-14, R1–R4) — FIGÉE, PUIS GEL 12 MOIS

**Constat du DRY §11** : la porte drawdown fait le travail (Expeditors, T. Rowe, OLED sortent, rien d'autre) mais
l'échelle ≥ 20 % ne casse pas les égalités en tête : 39 titres à (6/6, 6/6) → le FCF yield seul les classe → PROG
(FCF 103,8 % artefact), Bath & Body Works (fonds propres négatifs), BellRing en tête **par le prix**. Correction unique.

**R1 — Clé de départage (ordre lexicographique)** :
1. Durabilité A > B
2. Persistance : nb d'exercices /6 à ROIC (ROE fin.) ≥ 12 % à l'entrée — **≥ 10 % pour un tenu** (R4)
3. **Score de durabilité continu (0-100)** — « ce que l'entreprise EST », descriptif, non-prix
4. **Quality score (0-100)** — relais si la durabilité sature (39 titres US à 100, médiane 62)
5. FCF yield — parle en dernier : la valo départage à qualité vraiment égale, elle ne classe pas
L'échelle ≥ 20 % (§11 clé 4) est **retirée de la clé** (champ conservé, informatif). Pas de 3ᵉ barre à 30 %.

**R2 — Portes de données** :
- **FCF yield en PORTE** : ≥ 1 % à l'entrée. **FCF yield > 25 % = manquant** (artefact) → échoue la porte tant que la donnée
  n'est pas corrigée (PROG 103,8 %).
- **Porte levier** : `net debt / EBIT ≤ 3` remplace D/E ≤ 2,5. **Fonds propres négatifs → échec sauf net debt / EBIT ≤ 1,5**
  (rachats financés par du cash, pas par de la dette). *Proxy figé* : EBITDA indisponible (pas de D&A dans le flux) →
  EBIT au dénominateur, plus strict que l'EBITDA, seuils inchangés — à ratifier. Net debt = total_debt − cash & ST inv.
  Financières : porte non appliquée (levier structurel, jugées au ROE).

**R3 — Coca-Cola** : sort par vague sous §11 (5/6 à 12 %, 2020 = 11,45 %) ; la bande de grâce R4 le compte 6/6 **comme tenu**.

**R4 — Bande de grâce GÉNÉRALISÉE** (entrée stricte / sortie tolérante, comme ADV 5/3 M$ et ROIC 12/8) :
| Porte | Entrée | Tenu |
|---|---|---|
| Drawdown ROIC 6 ans | ≤ 35 % | ≤ 40 % |
| Persistance (barre de comptage) | ≥ 12 % | ≥ 10 % |
| ADV | ≥ 5 M$ | ≥ 3 M$ (existant) |
| ROIC 3 ans (sortie) | ≥ 12 % | ≥ 8 % (existant) |
Un tenu est classé dans le pool avec ses seuils « tenu » ; un entrant à 38 % ou 11,45 % ne rentre toujours pas.
Un tenu sorti volontairement (hors top-100) ne peut pas être ré-admis dans le même run.

**Garde-fous sur le DRY** : Marsh refetch (2 exercices) avant jugement ; Modivo (young_listing, ADV en $) ; Primerica
(financière au ROE → cap 6 avec IBKR). **Attendu** : Mastercard, Hermès, Medpace, Visa reviennent en tête ;
PROG / Bath & Body Works / BellRing disparaissent. Si ce n'est pas ce qui sort : on remonte, on ne règle pas.

**RÈGLE D'ARRÊT (figée)** : deuxième et dernière re-spécification. **Après ce DRY, la clé v4a est gelée douze mois**,
quel que soit le résultat : si elle passe → run ; sinon → on reste en v3 jusqu'au prochain cycle, journal du pourquoi.
Une clé qui demande une troisième retouche pour produire ce qu'on attend n'est pas une clé, c'est un ajustement au
résultat.

### 12bis. Lectures prises à l'implémentation (à ratifier, pas des retouches de clé)
- **FCF yield, bande tenu** : R4 dit « chaque porte » sans chiffrer le FCF → tenu = ancienne porte (> 0), entrant ≥ 1 % —
  même construction que ROIC 12/8 et ADV 5/3. Sans elle, Alphabet (FCF 0,55 %) sortait par vague.
- **Levier** : pas de bande (porte de sécurité bilan), identique tenu/entrant.
- **Marsh & McLennan** : changement de ticker MMC → MRSH (2025) → Twelve Data ne renvoie que 2 exercices sous MRSH.
  Structurel, pas transitoire. Option : rattacher l'historique MMC (alias) — décision d'univers.

### Résultat du DRY §12 (2026-09-14, périmètre US+Europe, cache corrigé) — pour verdict expert
- PROG / Bath & Body Works / BellRing (et Wingstop) **hors pool** ✓ (FCF artefact ; fonds propres négatifs + ND/EBIT > 1,5).
- **Visa rang 13 → entre** ✓ ; Mastercard rang 16 → bloqué par la paire ✓ (hystérésis).
- **Hermès rang 71, Medpace rang 80 ✗** — durabilité 85 / 83 : la tête du pool est aux scores 98-100 (NMI Holdings,
  United Therapeutics, Alphabet, Federated Hermes, Primerica, SEI, Games Workshop, Applied Industrial, Donaldson,
  Viscofan, Kinsale). 5 financières dans les 11 premiers.
- Coca-Cola tenu 6/6 (barre 10 %), rang 25 ✓ ; Howden (38,7 %) rang 17, Vontier (38,3 %) tenus ✓ (bande 40 %).
- Entrants du run : Visa, Publicis, Games Workshop, Applied Industrial, Viscofan, Gentex, Genpact, Gilead,
  Coca-Cola HBC, NMI Holdings. Federated Hermes / Primerica / SEI / Kinsale bloqués par le cap financières (6, tenus
  différés compris) ; Donaldson par le cap secteur Industrie.
- 12 tenus hors top-100 ou porte cassée → vagues : Marsh (2 exercices), Hannover Rück, Chipotle, Atmus, Veralto,
  Ross, MGIC (rang 101), Expeditors / T. Rowe / RLI / OLED (drawdown > 40 %), PROG (FCF artefact).
**Verdict expert attendu** : passe → run unique ; ne passe pas → v3 douze mois, journal. Aucune retouche possible.

## 13. PONDÉRATION (revue expert 2026-09-14) — FIGÉE AVEC LA CLÉ jusqu'au 2027-09-14

**Doctrine** : les poids ne varient que sur des grandeurs DESCRIPTIVES (secteur, risque, durabilité) — jamais sur un
rendement attendu (mean-variance, momentum, cap-weight = paris ou prédictions, refusés). « Plus de risque pour plus de
rendement » se règle dans l'AGRÉGATION entre piliers, pas dans les poids du socle.

**Mesure (14/09, 3 ans hebdo 2023-09-25 → 2026-09-14, liste v4a, réf. S&P 500 équipondéré)** : rendements indiscernables
(12,3 → 13,3 %/an = bruit), vol 11,9 → 13,0 %, max DD 10,8 → 13,1 %. Le choix de poids est un choix de RISQUE, fait sur la
doctrine, pas sur le 12,8 %. Sector-balanced brut inutilisable (12,5 % sur une ligne : secteur à 2 noms) → les bornes font
le travail.

**Schéma figé** : **sector-balanced × inverse-volatilité, bornes 1,5 – 4 % par ligne**
1. part égale par secteur GICS présent (1/n_secteurs), puis dans le secteur poids ∝ 1 / vol 3 ans hebdo ;
2. **vol bornée AVANT inversion** : plancher 15 %, plafond 50 % (sinon une ligne à 12 % pèse 4× une à 48 % et les bornes
   1,5-4 % font tout — ce ne serait plus de l'inverse-vol, ce seraient des bornes) ;
3. bornes 1,5 % / 4 % par ligne, itérées jusqu'à somme 100 %.

**Clauses**
- **Gel** : schéma figé jusqu'au 14/09/2027 comme la clé. On ne rouvre pas « inverse-vol vs durabilité » parce qu'un schéma
  a fait 0,8 point de mieux un trimestre.
- **Bandes de rebalancement** : cibles recalculées à chaque vague (vol 3 ans mise à jour) ; on ne trade une ligne que si
  son poids s'écarte de **± 25 % relatif** de sa cible ; sinon le poids précédent est conservé (renormalisé). Entrants /
  sortants : poids cible d'office.
- **Journal** : 12,5 % vs 15 % (S&P EW) sur 3 ans haussiers à vol égale, DD 13 vs 16 — c'est le PRIX DE LA STABILITÉ,
  écrit avant la prochaine année haussière ou baissière, pas réécrit après. Un socle qui ne bat pas l'indice EW en hausse
  et le bat en baisse fait ce qu'on lui demande. La mesure ex post sur la liste v4a compare des POIDS, pas la sélection :
  ne jamais citer ces 12,5 % comme performance du socle.

Après ce run, le socle est fermé : clé, portes, caps, poids. Reste l'agrégation.

## 14. JOURNAL DU RUN UNIQUE — 2026-09-15 07:20 UTC (clé v4a §12, poids §13, périmètre US+Europe)
- **Sorties (10)** : 9 cotations asiatiques (porte 0 « place accessible » : Topco, Anjoy, IGS, Keyence, OBIC, Toyo Tire,
  SGX, Thinking, Shanghai Conant) + VAT Group (drawdown 45 % > 40 % tenu).
- **Entrées (10)** : Visa, Publicis, Games Workshop, Applied Industrial, Gentex, Gilead, Coca-Cola HBC, Federated Hermes,
  Reply, ResMed.
- **Différées (11, vague 2026-12)** : Expeditors, Universal Display, PROG (FCF artefact), RLI, T. Rowe (drawdown > 40 %) ;
  Hannover Rück, Chipotle, Atmus, Veralto, Ross, MGIC (hors top-100).
- **Écarts aperçu (14/09 soir) → run** : Viscofan ADV 4,0 M$ le 15/09 (5,2 la veille) → porte liquidité ; Reply rang 14
  (absent de l'aperçu hydraté) → prend la 2ᵉ place IT Services avec Accenture → Genpact bloqué (cap 2/industrie) ;
  ResMed 10ᵉ sous les caps (prédit par l'expert). **VUSD** (Visa Londres) entrait en doublon de Visa NYSE → **porte 0 bis
  « une entité = une ligne, cotation la plus liquide »** ajoutée avant le run (129 cotations secondaires écartées).
- Poids §13 : 40 lignes, 1,5 – 4,0 %, total 100 ; Industrie 16 / Financials 16 / Conso disc. 15 / Santé 14 / Conso base
  13,5 / Tech 13,5 / Communication 8 / Matériaux 4. Financières au ROE : 6/6 du cap (Visa au ROIC).
- Cadence : wave_date = 2026-09-15 ; le run CI quotidien reproduit la liste jusqu'au 2026-12-14.
- **GEL** : clé, portes, bandes, caps, poids → 2027-09-14.

## 15. BILAN EXPERT POST-RUN (2026-09-15) — à connaître, pas à corriger avant 2027

**Solide** : 40 lignes traçables porte par porte, clé et poids gelés, journal des écarts ; stats dans le bon sens sans
dégrader la qualité (drawdown médian ROIC 21 → 16 %, PE 22 → 20, vol 31 → 28, persistance/durabilité inchangées) ;
hystérésis vérifiée sur le run (NMIH bloqué par la paire, Genpact par le cap, ResMed 10ᵉ, doublon Visa Londres attrapé).

**Faiblesses connues (journal, révision au cycle 2027)**
1. **Sector-balanced = gros poids aux secteurs minces** : Alphabet, Publicis, PG, Coca-Cola à 4 % parce que seuls de leur
   secteur, pas parce que « meilleurs ». Lire le haut du tableau comme « secteur peu peuplé », pas « conviction ».
2. **Les prochains entrants sont des financières** (NMIH, Primerica, SEI, Kinsale rangs 1-11) : à chaque vague, les
   sorties financières différées seront remplacées par d'autres financières via le score de durabilité. Le cap 6 borne
   la quantité mais c'est LUI qui sélectionne — le chantier « score généreux avec les financières » décide de 15 % du
   socle. → cycle de révision du score.
3. **Dérive vers la maturité** (Coca-Cola, PG, JNJ, Gilead, Publicis, Coca-Cola HBC) : aucune porte ne regarde la
   trajectoire (croissance, réinvestissement). Choix de doctrine — stabilité ici, croissance au pilier 3 — à savoir.
4. **Turnover de transition 21/40 sur trois trimestres** = coût unique v3 → v4a + sortie Asie. **Test 2027 : turnover
   réalisé attendu < 25 %/an** ; au-delà, la clé n'est pas aussi stable qu'elle en a l'air.

**Non utilisé, volontairement** : perf vs secteur / momentum / EPS surprise (rejetés au backtest ; utiles en DIAGNOSTIC :
une ligne qui sous-performe son secteur 12 mois = revue de la fiche durabilité) ; tags funnel / convictions (0/40 →
pilier 3 et sleeves ETF) ; score Buffett (grade en porte valo seulement → v4b) ; beta / vol (pondération seulement).
Le socle ignore ~60 % des champs de la fiche : plus de champs en sélection = plus d'overfitting, pas plus d'information.

**« Optimal » n'est pas ici** : sans règle d'agrégation (poids des trois piliers, détention totale d'un même titre à
travers socle + ETF + convictions), trois portefeuilles cohérents chacun et un patrimoine au risque inconnu.
→ Prochain et seul chantier : la RÈGLE D'AGRÉGATION.

## 16. VOCABULAIRE FIGÉ (revue expert 2026-09-15) — les mots comptent
- Le socle « **compose sans à-coups** ». Jamais « cherche à ne pas perdre » : c'est de l'action à drawdown PLUS FAIBLE, pas de
  la préservation de capital (−13 % sur 3 ans haussiers ; 2022 aurait coûté −20 à −25 %). Une année baissière n'est pas un
  échec de la méthode.
- Le pilier 3 s'appelle **Actions-Conviction**. Jamais « ETF » (ETF = large, à tout prix ; actions = maillon, sain, prix
  raisonnable — la seule frontière du système), jamais un nom daté (thèses 2026-2035).
- « Un ETF nucléaire détient Cameco à tout prix ; le pilier 3 ne le détient pas » — la largeur serait au pilier 2 ETF,
  SI Benoit le détient. Benoit a dit « pas d'ETF » : dans ce cas Cameco n'est nulle part, choix acté, pas oubli.
