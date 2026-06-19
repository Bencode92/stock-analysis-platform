# Pré-déclaration backtest (D) — univers élargi S&P 500

**Date d'écriture** : 2026-06-19, **AVANT** exécution du test (D).
**Statut** : pré-enregistrement scientifique. Aucune modification post-résultat.
**Référence** : suit `PREDECLARATION_BACKTEST_MODE3.md` (Mode 3 reformulé → Verdict C* test non concluant).

## Pourquoi (D)

Mode 3 v2 a retourné Verdict C* (test non concluant) : Buffett dans IC90 sur CAGR + Sharpe, MAIS univers labo à 26.7% homogénéité-qualité (> 25% seuil).

La pré-déclaration Mode 3 autorisait (D) "élargissement univers" SI verdict C* (homogénéité > 25%), pour fournir un vrai contrefactuel marché.

## Méthode (D.1 hybride)

### Source = S&P 500 statique (non négociable)

- **Pas l'univers prod du projet** (`data/stocks_*.json`) : déjà filtré par broker_access + hard_filters du pipeline → introduit un biais qualité invisible
- **S&P 500 (β)** : biais documenté (500 plus grosses caps US, survivants) MAIS connu, beaucoup plus faible
- Si S&P 500 ≥ 15% homogénéité → switch Russell 3000, pas de re-tirage

### Tirage

- **200 stocks random S&P 500** (cible 150 utilisables après nettoyage anomalies)
- **seed = 42, UNIQUE, jamais re-tirée** (Fabre 2026-06-19 : hétérogénéité = propriété de la SOURCE, pas une seed chanceuse)
- Exclusion des 50 stocks labo déjà fetchés (anti-doublon)

### 2 mesures additionnelles AVANT le backtest (Fabre 2026-06-19)

**1. DOUBLE homogénéité** :
- `homog_with_price` = médiane sur rebalances du % stocks avec `buffett_score` ≥ 83 (6 critères, avec valuation_ok)
- `homog_no_price` = médiane sur rebalances du % stocks avec `buffett_score_no_valuation` ≥ 83 (5 critères, sans valuation_ok)
- Si **les deux < 15%** → univers vraiment hétérogène en qualité fondamentale
- Si seule `with_price` < 15% mais `no_price` ≥ 25% → c'est le **filtre prix** qui crée la fausse hétérogénéité (S&P 500 PE = 25.55 = à peine sous seuil), contrefactuel moins solide → noter dans le verdict

**2. Composition sectorielle du tirage** :
- Mesurer la répartition sectorielle des 200 tirés
- Comparer à la composition réelle du S&P 500 (Tech ~30%, Health ~12%, Finance ~11%, etc.)
- Si un secteur sur-représenté de **> 10 pts vs indice** → noter dans verdict comme limite (pas de re-tirage, règle anti-p-hack)
- Sur la fenêtre 2020-2026 dominée tech, une sur-représentation tech artificiellement gonflerait le random → biais à déclarer

## Verdicts pré-déclarés v3 (TRIDIMENSIONNEL : CAGR + Sharpe + MaxDD)

Chaque métrique classifiée indépendamment vs IC90 random :
- **edge** : Buffett > IC90_high
- **neutre** : Buffett dans IC90 [low, high]
- **inversé** : Buffett < IC90_low

| Verdict | CAGR | Sharpe | MaxDD | Lecture |
|---|---|---|---|---|
| **A** | edge | edge | (toute) | Scoring ROBUSTE — alpha pur. Passe Mode 1 α/β |
| **B** | edge | (toute) | edge | Scoring OFFENSIF différencié. Passe Mode 1 |
| **C** | neutre | neutre | **edge** | **Edge DÉFENSIF confirmé** — MaxDD significativement < random. Le scoring est un BOUCLIER pas une épée. Cohérent doctrine "Thematique = moteur perf, Buffett = filtre défensif". Tranche α/β vers **α + Thematique-moteur** |
| **D** | neutre | neutre | neutre | Scoring sans edge sur 3 dimensions. **TERMINAL** — STOP, retour design scoring. Pas de 5e config. |
| **E** | inversé | inversé | (toute) | Anti-sélection sur perf, diagnostic urgent |

Lus dans cet ordre : **E urgence → A → B → C → D**.

## Engagement anti-p-hacking

1. **Pas de modification de ce document après exécution.** Faute identifiée publiquement, pas réécrite en silence.
2. **Pas de re-tirage de seed.** Si S&P 500 ≥ 15% homogénéité → switch Russell 3000 (la source change, pas le hasard).
3. **Pas de 5e config.** Verdict D = STOP, retour design scoring.
4. **Composition sectorielle déclarée dans le verdict** comme limite, pas comme raison de relancer.
5. **MaxDD intégré dans le verdict** (pas écrasé par binaire CAGR/Sharpe). Un bouclier mesurable EST un edge, juste pas celui qu'on cherchait.

## Ce que ce test va probablement dire (anticipé par Fabre)

Le MaxDD Buffett -6.95% du Mode 3 v2 (vs marché ~-25% en 2022) crie déjà la conclusion : le scoring **protège mais ne performe pas**. Si (D) confirme verdict C (edge MaxDD seul), alors :

- La sélection d'actions n'est **pas le levier de performance** — c'est le levier de **protection**
- Thematique reste le moteur perf (+2.4 pts CAGR vs VT, le seul truc qui a battu un benchmark dans cette session)
- α (garder le filtre prix défensif) sur Agressif a soudain plus de sens que β
- Toute la réorientation doctrinale de la session se confirme

C'est l'inverse de l'intuition de départ (β pour battre le marché). Mais c'est la réponse honnête à "lequel choisir pour la sélection".

## Engagement final

Test lancé une fois, verdict accepté tel quel, lecture honnête même si contre-intuitive. C'est le but du pré-enregistrement.

**Discipline gravée le 2026-06-19, accord explicite Fabre + Code.**

---

## Addendum 2026-06-19 (post-mesure homogénéité, AVANT backtest)

### Résultat mesuré sur univers élargi 239 stocks

- Homogénéité **AVEC prix** (buffett_score ≥ 83) : **23.2%** (≥ seuil 15%)
- Homogénéité **SANS prix** (buffett_score_no_valuation ≥ 83) : **13.9%** (< seuil 15%)

### Cas asymétrique non anticipé par la pré-déclaration originelle

L'asymétrie observée est l'**INVERSE** de celle que Fabre redoutait :
- Cas redouté : avec-prix < 15% mais sans-prix ≥ 25% → "le filtre prix crée une fausse hétérogénéité"
- Cas mesuré : avec-prix ≥ 15% mais sans-prix < 15% → le filtre prix crée une fausse HOMOGÉNÉITÉ

Mécanisme : S&P 500 PE médian = 25.55 ≈ seuil valuation_ok. ~50% des stocks passent valuation_ok de justesse → s'agglutinent à Buf 83 (5/6 critères). Sans valuation_ok, ils se redispersent (FCF yield > 3% ou moat_expansion échouent souvent sur growth stocks chers).

### Règle de lecture gravée (Fabre 2026-06-19, avant toute lecture de chiffres)

**L'homogénéité qui détermine la validité du contrefactuel est l'homogénéité fondamentale (sans-prix).** Pourquoi : le random pioche dans l'univers sans utiliser le critère prix pour classer. Sa qualité de contrefactuel dépend de la dispersion en fondamentaux, pas du score-avec-prix. Le critère prix affecte **comment le score classe**, pas **comment le random se comporte**.

Donc :
1. **Le contrefactuel EST validé** par l'homogénéité fondamentale 13.9% < 15%. Test valide pour α ET pour β — tous deux comparés au même random dans le même univers hétérogène-en-fondamentaux.
2. **Le 23.2% avec-prix est un RÉSULTAT REPORTÉ, pas un critère de validité** : "le buffett_score (avec prix) discrimine mal dans le S&P 500 (effet plafond à 83), donc le top-décile α aura plus d'ex-aequo et un signal plus bruité que β — cette asymétrie de *finesse de classement* est une limite de α, pas un avantage de β". Limite à déclarer, pas à corriger.
3. **Pas de Russell 3000** : (I) est une sur-réaction sur lecture stricte d'un cas non anticipé. La règle d'origine voulait protéger contre "random pioche que de la qualité" → on protège contre ça via dispersion fondamentale (13.9%), pas via la dispersion d'un score affecté par un seuil arbitraire (PE ≤ 25).
4. **Verdicts v3 (A/B/C/D/E) inchangés** — jugés sur CAGR + Sharpe + MaxDD vs le même random.

### Test de symétrie logique (anti-rationalisation)

Si les chiffres avaient été inversés (13.9% avec-prix, 23.2% sans-prix = cas anticipé Fabre), la conclusion aurait été : "le filtre prix crée une fausse hétérogénéité, le contrefactuel est suspect". Dans les DEUX cas, la mesure qui compte est la **dispersion fondamentale** car c'est elle qui gouverne le random. La logique est symétrique, pas tordue pour faire passer le test.

### Engagement maintenu

Cet addendum est gravé AVANT la lecture des chiffres du backtest. La règle de lecture est définie a priori sur la base de la logique du contrefactuel, pas du résultat espéré.
