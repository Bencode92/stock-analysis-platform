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
