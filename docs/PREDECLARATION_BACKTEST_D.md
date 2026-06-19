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
