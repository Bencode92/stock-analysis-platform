# Portefeuille Dividende Personnel — Mémo Expert v2

**Destinataire :** Benoit Comas
**Cadre :** Comptes personnels (PEA > 5 ans + CTO complémentaire) — distinct de la treasury ByCam/Cameleons
**Date :** 2026-05-14 (révision v2 intégrant le cadre fiscal PEA et la critique de l'expert externe)
**Objet :** Construction de deux portefeuilles rendement complémentaires (PEA + CTO) et arbitrage buy-and-hold vs dividend harvesting
**Auteur :** Analyse stratégique sur la base du module `dividend_portfolio.py` v1.1

---

## 1. Synthèse en 30 secondes

- Cadre fiscal optimal pour ta stratégie rendement = **PEA en première intention** (0% IR sur div et PV intra-PEA après 5 ans, 17.2% PS uniquement à la sortie, plafond 150k€) + **CTO en complément** pour les actions US/UK/CH non-éligibles PEA (PFU 30%).
- **Deux portefeuilles distincts générés** : 16 titres PEA (100% EU/EEE) + 10 titres CTO (US/UK pour diversifier).
- **Yield combiné estimé** : 5.18% avec une allocation 70% PEA / 30% CTO, qualité moyenne 64/100.
- **Stratégie principale recommandée** : buy-and-hold low-turnover sur les deux portefeuilles. Le **dividend harvesting** (rotation autour des ex-div dates) n'est tentable que dans le sleeve PEA, sur 5-10% maxi du capital, avec règles strictes — pas comme stratégie principale.
- Le **réinvestissement composé** des dividendes en PEA est ton vrai edge (+15 à +25% de capital final sur 20 ans vs CTO équivalent), pas le timing.

---

## 2. Architecture en deux portefeuilles complémentaires

### 2.1 Pourquoi cette séparation

Ta fiscalité personnelle dicte la structure :

| Cadre | Dividendes | Plus-values | Univers éligible |
|---|---|---|---|
| **PEA > 5 ans** | 0% IR + 17.2% PS à la sortie | 0% IR + 17.2% PS à la sortie | UE + EEE (hors UK depuis Brexit) |
| **CTO** (PP) | PFU 30% (12.8% IR + 17.2% PS) | PFU 30% | Tout (US, UK, Suisse, etc.) |
| Treasury IS (rappel) | IS 25% | IS 25% à la cession | Tout, mais cadre distinct |

→ Le PEA est **massivement plus avantageux** mais avec un univers contraint. Le CTO sert d'overflow pour les titres exclus et au-delà du plafond 150k€.

### 2.2 Portefeuille PEA — 16 titres EU/EEE

**Filtres appliqués** (univers brut → éligibles → sélection) :
- 806 titres → **26 éligibles** (-780 sur filtres pays + value-traps) → **16 sélectionnés**
- Pays autorisés : France, Allemagne, Espagne, Italie, Pays-Bas, Belgique, Portugal, Irlande, Autriche, Suède, Finlande, Danemark, Grèce, Pologne, Hongrie, etc., **+ EEE** (Norvège, Islande, Liechtenstein). UK exclu post-2021.
- Seuils anti value-trap : yield ≥ 2.5%, payout ≤ 85%, quality ≥ 50, dividend growth 3Y ≥ −2%, ROE ≥ 8%, FCF yield > 0.5%, market cap ≥ 2 Md€.

**Résultats** :

| Métrique | Valeur |
|---|---|
| Holdings | 16 |
| Yield portefeuille | **5.37%** |
| Quality moyenne | 68.1 |
| Payout moyen | 58.2% (sain) |
| Dividend growth 3Y moyen | +49.7% |
| Pays représentés | 8 (Pays-Bas, Espagne, Italie majoritaires) |
| Secteurs | 10 |
| Concentration max secteur | 25.3% (Finance) |
| Mois couverts par les dividendes | 9/12 |

**Holdings principaux** : Qiagen (Santé NL), Naturgy (Utilities ES), Wolters Kluwer (Industries NL), AIB Group (Finance IE), Galp (Énergie PT), Klépierre (Immobilier FR), Banca Mediolanum & Intesa Sanpaolo (Finance IT), Universal Music Group (Comm. NL), Iberdrola & BBVA (Utilities/Finance ES), Akzo Nobel & KPN & Ahold Delhaize (NL diversifié), Telenor (Comm. NO), Inditex (Conso ES).

→ Sortie : `data/dividend_portfolio_pea.json`

### 2.3 Portefeuille CTO — 10 titres US/UK

**Filtres appliqués** :
- 806 titres → **34 éligibles** → **10 sélectionnés**
- Pays : Etats-Unis principalement, Royaume-Uni en complément (2 titres).
- Yield mini relevé à 3.0% (l'univers US est plus généreux).
- Cap 2 titres / secteur (univers plus large).

**Résultats** :

| Métrique | Valeur |
|---|---|
| Holdings | 10 |
| Yield portefeuille | **4.75%** |
| Quality moyenne | 57.8 |
| Payout moyen | 47.6% (sain) |
| Dividend growth 3Y moyen | +55.2% |
| Pays | US (8) + UK (2) |
| Secteurs | 7 |
| Mois couverts par les dividendes | **13/12** (paiements trimestriels US qui se recouvrent) |

**Holdings principaux** : Reckitt Benckiser (UK Conso), General Mills (US Conso), Progressive (US Finance), VICI Properties (US Immobilier), Best Buy (US Conso cyclique), Comcast (US Comm.), T. Rowe Price (US Finance), Prudential (US Finance), Intertek (UK Industries), ONEOK (US Énergie).

→ Sortie : `data/dividend_portfolio_cto.json`

### 2.4 Combinaison cible

Allocation recommandée (à adapter selon ton capital total et l'occupation actuelle du PEA) :

```
70% PEA   →  16 titres EU/EEE, yield 5.37%
30% CTO   →  10 titres US/UK, yield 4.75%
─────────────────────────────────────────
Total : 26 titres, yield combiné ≈ 5.18%
```

Si ton PEA n'est pas plein, **mets le PEA en priorité** : son avantage fiscal compense largement le yield un peu plus modeste sur l'univers EU.

---

## 3. Méthodologie commune

### 3.1 Score composite (anti value-trap)

```
score = yield_score × (0.4 + 0.6 × quality_block)

avec :
  yield_score   = (yield_cappé / 9%)^0.7   (concave, ne surpaye pas les yields suspects)
  quality_block = 0.35 × quality_score/100
                + 0.30 × payout_safety
                + 0.20 × growth_factor (sigmoid de dividend_growth_3y)
                + 0.15 × coverage_factor (FCF / dividendes)
```

→ Un yield de 6% bien couvert vaut plus qu'un yield de 8% à payout 90%.

### 3.2 Pondération low-turnover

```
weight_i = (1/N) × (1 + 0.3 × (score_i / score_moyen − 1))
bornes : [3%, 8%]
```

Equipondération + tilt léger par score, bornes serrées. Si une ligne +50%, elle reste dans la zone, **pas de trade forcé**.

### 3.3 Optimisation calendrier dividendes

Pour chaque titre : `frequency_detected` (1/2/4/12) + mois récurrents de `dividends_history`. Agrégation pondérée puis swaps si le coefficient de Gini diminue de ≥ 0.05 (sans détériorer le score moyen).

**Swap effectué automatiquement sur le PEA** : TTE → BBVA (gain Gini 0.108 — meilleure couverture mensuelle).

---

## 4. Évaluation de la stratégie de dividend harvesting (intégration critique de l'expert externe)

### 4.1 Le mécanisme reprécisé

Tu envisages : acheter avant ex-div → encaisser coupon → attendre récupération du cours + petite plus-value > inflation → revendre → rotation vers titre à yield modéré. C'est du **dividend harvesting hybride**.

### 4.2 Verdict consolidé (mon avis + expert externe)

**3 problèmes structurels** :

1. **Récupération du cours non garantie**
   - Décote ex-div initiale typiquement 80-100% du dividende
   - Temps moyen de récupération : 30-90 jours sur les bons titres, **jamais** sur les value traps
   - Probabilité de récupération < 30 jours : ~55-65% en marché neutre, **<40% en marché baissier**

2. **Frottements transactionnels qui survivent même en PEA**
   - Spread bid-ask aller-retour : 0.10-0.40% (jusqu'à 0.8% sur small caps EU peu liquides)
   - Courtage PEA : varie de 0.10% à 1% selon broker — **vérifie le tien**
   - Slippage : 0.10-0.20%
   - Total : 0.5-1.5% de friction par rotation, peu importe la fiscalité

3. **Sélection adverse sur les hauts yields**
   - Les titres à yield 7-9% n'y sont pas par hasard : signal de coupe imminente, secteur en stress, vraie opportunité rare
   - Sur un univers PEA éligible déjà restreint, le pool de titres "sticky" haute qualité ET haut yield est **très petit** (5-10 noms maxi)

### 4.3 Ce que change le PEA > 5 ans (vs IS)

✅ **Fiscalité disparaît comme frein** : 0% IR sur div et PV intra-PEA. Tu peux faire tourner sans pénalité immédiate.
✅ **Le différé d'impôt du buy-and-hold disparaît comme argument** : il n'y a plus d'impôt à différer dans le PEA.

Sur le calcul d'une rotation typique (achat 1000€ titre 8%, capture 80€ div, +3% PV) :
```
Brut : 80 + 30 = 110€
PEA réinvesti : 110 − 6.5 (frais) = 103.5€  (+10.35% sur 2 mois)
IS équivalent : ≈ 76€  (+7.6%)
→ Gain PEA vs IS : +35% net pour la même opération
```

### 4.4 Évidence académique

- **Frank & Jagannathan (1998), Boyd & Jagannathan (1994)** : la sous-décote ex-div < dividende existe surtout pour les titres à faible yield (<3%). Sur les hauts yields, l'edge est statistiquement **petit voire négatif** dans la majorité des études.
- **Backtests pratiques** (publics) : les stratégies de dividend harvesting sur hauts yields **sous-performent** un buy-and-hold sur le même panier sur 5+ ans, avant fiscalité.

⚠️ Littérature mitigée — certaines études (HK, Australie) trouvent un edge sur hauts yields. Conclusion robuste : **edge marginal, inconsistant, sensible aux frais**.

### 4.5 Verdict honnête sur le harvesting en PEA

**Ni stupide ni génial.** La fiscalité ne le pénalise plus dans le PEA, mais les autres frictions restent. Edge théorique : **1.5-3% annualisé net** sur le sleeve, **si** tu sélectionnes bien les titres sticky et **si** tu exécutes avec discipline.

À encadrer strictement (cf. section 5).

---

## 5. Recommandation actionnable

### 5.1 Architecture finale révisée

```
┌──────────────────────────────────────────────────────────────┐
│ PEA — 80-85% du PEA disponible (~120k€ si plein)             │
│ ─ CORE buy-and-hold : 16 titres EU/EEE                       │
│ ─ Yield 5.37%, rebalancement annuel ±3pp                     │
│ ─ Réinvestissement automatique des div (vrai edge composé)   │
├──────────────────────────────────────────────────────────────┤
│ PEA — 10-15% en SLEEVE harvesting (~15-20k€)                 │
│ ─ Univers ultra-restreint : 5-8 titres sticky du core        │
│ ─ Règles strictes (cf. 5.2)                                  │
│ ─ Tracking P&L séparé, audit annuel                          │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ CTO — overflow + diversification                             │
│ ─ 10 titres US/UK, yield 4.75%                               │
│ ─ Buy-and-hold uniquement (harvesting moins rentable au PFU) │
│ ─ Réinvestissement net de PFU                                │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Règles non négociables pour le sleeve harvesting (PEA uniquement)

1. **Univers de 6-8 titres présélectionnés** :
   - Yield brut > 5.5%
   - Sticky : décote ex-div historique < 90% du dividende sur les 8 derniers détachements (à mesurer empiriquement)
   - Spread bid-ask < 0.20%
   - Beta < 1.0
2. **Sizing fixe** : 3% du PEA maxi par opération, jamais plus
3. **Stop-loss obligatoire** : −4% sous prix d'achat = vente immédiate, sans débat
4. **Take-profit règle** :
   - Si PV ≥ inflation pro-rata + 1% (≈ 0.5% par mois) : vente OK
   - Si pas atteint sous 90 jours : vente forcée, retour en core
5. **Max 3 opérations en parallèle**
6. **Tracking P&L séparé** : net de frais broker, audit à 12 mois. Si edge < 1.5% annualisé → **tu coupes le sleeve** et tu remets en core.

### 5.3 Vérifications avant de démarrer

🔴 **Critiques (à faire dans la semaine)** :
- Vérifier auprès de ton broker la **liste exacte des actions éligibles PEA** (certains brokers peuvent avoir des restrictions supplémentaires sur small caps).
- Connaître tes **frais broker précis** : courtage par ordre, droits de garde annuels, frais de change EUR/devise si applicable.
- Confirmer le statut UK de chaque titre (Reckitt, Imperial Brands, Intertek **ne sont pas dans le PEA**, ils sont dans le CTO).

🟠 **Important** :
- Si ton PEA n'est pas plein, plan d'apport annuel pour le remplir avant utilisation du CTO.
- Activer le **réinvestissement automatique des dividendes** (DRIP) si disponible chez ton broker.

---

## 6. Le vrai edge à long terme (que l'agitation cache)

L'expert externe l'a souligné, je le confirme :

**Le réinvestissement composé en PEA > 5 ans est ton vrai edge.**

Simulation rapide avec 50k€ initial, yield 5%, réinvestissement intégral, 20 ans :
- **PEA** : 50k€ × (1.05)^20 = **132 700€** (impôt zéro intra-PEA, 17.2% PS à la sortie sur le gain de 82.7k€ → net ~118 500€)
- **CTO** : 50k€ × (1 + 0.05 × 0.70)^20 = **99 100€** (PFU 30% sur chaque div réinvesti)
- **Delta** : +19 400€ soit **+19.6%** uniquement grâce au cadre fiscal

Toutes les stratégies de rotation, de timing, de capture, peuvent péniblement viser quelques % par an de plus en moyenne. **Le PEA bien rempli avec réinvestissement bat tout cela par construction.**

---

## 7. Limitations honnêtes

- **Univers PEA limité** : 26 titres éligibles sur 806 dans la base. Si plusieurs sont coupés (coupes de div, changement de siège, downgrade qualité), le pool de remplacement est faible.
- **Concentration sectorielle PEA** : Finance 25.3%, Communications 17.7%, Utilities 12.9%. Trois secteurs cycliques aux taux. Surveillance trimestrielle requise.
- **Pas de Royaume-Uni dans le PEA** : on perd Reckitt, Unilever, Imperial Brands, Diageo, GlaxoSmithKline, BAT — un univers historique de dividend aristocrats. **Compensation partielle dans le CTO**.
- **Pas d'Asie / pas d'émergents** : aucun module pour Singapour, HK, Australie qui ont aussi des cultures dividende fortes. Possibilité d'ajouter un ETF PEA synthétique monde (5-10%) en complément si tu veux exposer la zone non-EU sans CTO.

---

## 8. Prochaines étapes proposées

| Priorité | Action | Effort | Statut |
|---|---|---|---|
| ✅ | Module `dividend_portfolio.py` v1.1 (PEA + CTO) | — | livré |
| ✅ | Sortie `data/dividend_portfolio_pea.json` + `_cto.json` | — | livré |
| 🔴 | Vérifier liste broker PEA + frais | 1h utilisateur | à faire |
| 🟠 | Onglet UI dual PEA/CTO sur `portefeuille.html` | 1h | proposé |
| 🟠 | Calcul cash flow EUR pour notionnel configurable (chaque mode) | 30min | proposé |
| 🟡 | Module `dividend_capture.py` (sleeve harvesting + analyse décote ex-div historique) | 2-3h | optionnel |
| 🟡 | Backtest 5 ans comparant buy-and-hold vs harvesting net de frais | 1-2h | optionnel |
| 🟡 | Ajouter ETF PEA monde pour diversification non-EU | 30min | optionnel |

---

## 9. En une phrase

**Le rendement sérieux vient du temps, du cadre fiscal optimal (PEA), et du réinvestissement composé — pas du timing autour des ex-div dates.** Construis le core en buy-and-hold sur PEA + CTO, automatise le DRIP, et si tu veux explorer le harvesting, isole-le sur 10% maxi avec des règles militaires et un audit annuel pour mesurer l'edge réel.

---

## Annexes

### A. Holdings PEA — détail complet

| # | Ticker | Pays | Secteur | Poids | Yield | Payout | Quality | ROE | Fréq |
|---|---|---|---|---|---|---|---|---|---|
| 1 | QIA | Allemagne | Santé | 7.02% | 7.96% | 13% | 50 | 12.5% | 2 |
| 2 | NTGY | Espagne | Services publics | 6.86% | 8.09% | 80% | 73 | 20.7% | 4 |
| 3 | WKL | Pays-Bas | Industries | 6.73% | 6.86% | 43% | 72 | 111.7% | 4 |
| 4 | A5G | Irlande | Finance | 6.68% | 6.45% | 53% | 78 | 14.2% | 2 |
| 5 | GALP | Portugal | Énergie | 6.53% | 6.81% | 63% | 67 | 23.7% | 4 |
| 6 | LI | France | Immobilier | 6.41% | 5.34% | 41% | 71 | 13.2% | 2 |
| 7 | BMED | Italie | Finance | 6.31% | 5.24% | 74% | 85 | 29.9% | 2 |
| 8 | ISP | Italie | Finance | 6.27% | 5.39% | 67% | 70 | 14.3% | 2 |
| 9 | UMG | Pays-Bas | Communication | 6.11% | 5.31% | 63% | 63 | 33.8% | 4 |
| 10 | IBE | Espagne | Services publics | 6.07% | 4.94% | 83% | 63 | 10.9% | 4 |
| 11 | BBVA | Espagne | Finance | 6.00% | 3.40% | 40% | 79 | 18.3% | 2 |
| 12 | AKZA | Pays-Bas | Matériaux | 5.93% | 3.87% | 55% | 67 | 13.9% | 2 |
| 13 | KPN | Pays-Bas | Communication | 5.81% | 3.96% | 83% | 58 | 24.1% | 1 |
| 14 | TEL | Norvège | Communication | 5.79% | 4.44% | 78% | 52 | 10.6% | 2 |
| 15 | AD | Pays-Bas | Conso de base | 5.77% | 3.28% | 47% | 63 | 15.3% | 1 |
| 16 | ITX | Espagne | Conso cyclique | 5.72% | 3.06% | 56% | 77 | 31.1% | 2 |

### B. Holdings CTO — détail complet

| # | Ticker | Pays | Secteur | Poids | Yield | Payout | Quality | ROE | Fréq |
|---|---|---|---|---|---|---|---|---|---|
| 1 | RKT | UK | Conso de base | 8.00% | 7.87% | 44% | 72 | 44.0% | 2 |
| 2 | GIS | US | Conso de base | 8.00% | 6.90% | 59% | 78 | 24.6% | 4 |
| 3 | PGR | US | Finance | 8.00% | 7.06% | 71% | 78 | 40.5% | 4 |
| 4 | VICI | US | Immobilier | 8.00% | 6.04% | 61% | 88 | 10.2% | 4 |
| 5 | BBY | US | Conso cyclique | 8.00% | 6.47% | 75% | 69 | 37.0% | 4 |
| 6 | CMCSA | US | Communication | 8.00% | 4.99% | 26% | 76 | 21.4% | 4 |
| 7 | TROW | US | Finance | 8.00% | 4.79% | 55% | 80 | 18.8% | 4 |
| 8 | PRU | US | Finance | 8.00% | 5.39% | 56% | 61 | 11.4% | 4 |
| 9 | ITRK | UK | Industries | 8.00% | 5.00% | 74% | 68 | 28.2% | 4 |
| 10 | OKE | US | Énergie | 8.00% | 4.81% | 74% | 53% | 15.5% | 4 |

### C. Calendrier de dividendes mensuel agrégé (PEA + CTO si pondérés 70/30)

```
2026-05   ████████████████████  0.59%
2026-06   ███████              0.21%  (creux mensuel)
2026-07   ███████████████      0.58%
2026-08   ███████████          0.37%
2026-09   ████████             0.27%
2026-10   ███████████          0.40%
2026-11   ████████████         0.46%
2026-12   ████                 0.10%  (creux)
2027-01   ███████████          0.36%
2027-02   ██████████           0.34%
2027-03   █████████████        0.47%
2027-04   ██████████████████████ 0.93%  (pic des annuels EU)
```

Bonne couverture globale, deux creux modérés (juin, décembre). Pic d'avril dû à la concentration des dividendes annuels EU au printemps — comportement structurel non corrigeable sans dégrader la sélection.

---

*Document généré à partir du module `portfolio_engine/dividend_portfolio.py` v1.1 et des sorties `data/dividend_portfolio_pea.json` et `data/dividend_portfolio_cto.json`. Pour mises à jour, regénérer via `python3 -m portfolio_engine.dividend_portfolio`.*
