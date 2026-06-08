# Méthodologie du scoring — limites et tests empiriques

## Composite score (top_picks_curated)

```
Composite = 0.40 × Buffett/100 + 0.30 × Quality/100 + 0.15 × Perf_norm + 0.15 × RADAR
```

## Tests empiriques sur snapshot 2026-06-08 (univers 1072 stocks)

### 1. Redondance Buffett ↔ Quality ✅ FIABLE

- **Corrélation Pearson : 0.741**
- **Corrélation Spearman : 0.759**

→ Les deux scores capturent ~75% du même signal fondamental. **Le composite pondère effectivement ~70% sur un seul facteur "qualité" dupliqué.** Mesure cross-section sur un snapshot — pas de problème de sample size.

### 2. Concentration sectorielle Top 25 ✅ FIABLE

67% Tech + Industries + Finance → le composite favorise structurellement ces secteurs. Mesure cross-section.

### 3. Pouvoir prédictif (IC, spread décile) ❌ NON MESURABLE

**Pas de test possible aujourd'hui.** Pourquoi :
- Seulement 3 snapshots PIT archivés (2026-06-04, 06-05, 06-08) → horizon forward effectif ~2 jours de bourse
- Un facteur qualité opère sur 3-12 mois — mesurer son IC sur 2 jours capture du bruit
- Si on essaie naïvement `spearmanr(Buffett_actuel, perf_1y)` on obtient un chiffre (-0.16 sur l'univers actuel), mais c'est **PAS un IC forward** :
  - `perf_1y` est la perf des 12 derniers mois (look-ahead total)
  - Et le composite contient déjà Perf 1y (15%) → contamination mécanique par le short-term reversal du momentum, bien documenté
- **Ce chiffre n'est ni une bonne ni une mauvaise nouvelle : c'est un non-résultat.**

### Ce qu'il faudra pour mesurer la prédictivité

Le bon test est `composite(t) vs perf(t, t+H)` pour H ∈ {1m, 3m, 6m, 12m}, sur plusieurs cross-sections indépendantes, en évitant l'overlap des fenêtres (sinon l'autocorrélation gonfle artificiellement la confiance).

Estimation :
- **Hold long (1 an+)** : besoin de **3-5 ans** de PIT pour avoir plusieurs fenêtres forward complètes
- **Rebalancing mensuel** : 12-18 mois exploitables si on compte en *cross-sections indépendantes* (loi fondamentale : pouvoir ≈ IC × √breadth) — chaque cross-section sur centaines de noms apporte du signal

Action en cours : `portfolio_engine/score_archiver.py` archive snapshots quotidiens dans `data/score_history/scores_YYYY-MM-DD.json`. Il faudra aussi **archiver les rendements forward alignés** (1m/3m/6m/12m) au fur et à mesure.

## Conclusions actuelles

1. **Buffett ↔ Quality redondants à 0.76** (mesuré). Si refonte future, ajouter low-vol 3y (seul facteur orthogonal valide, price-based).
2. **Concentration sectorielle 67% top décile** (mesuré). À surveiller — risque de "diversification" illusoire.
3. **Pouvoir prédictif inconnu** — pas de test valide possible avant 12-18 mois d'historique PIT.
4. **Usage défendable** : filtre d'exclusion ("Buffett ≥ 60" écarte les pièges), pas classement prédictif.

## Risque réglementaire (France)

Le statut CIF (Conseil en Investissement Financier, art. L.541-1 CMF) régule la fourniture de **recommandations personnalisées portant sur des instruments financiers** à titre habituel. Un avis informel ponctuel entre collègues n'est pas "à titre de profession habituelle" — mais répété et systématique, ça glisse vers la zone régulée.

**Mitigations** :
- Présenter comme outil éducatif / screener, pas comme "achète X"
- Disclaimer explicite "pas un conseil personnalisé, fais ta propre analyse"
- Ne jamais se positionner sur l'adéquation à *leur* situation (profil de risque, horizon)

## Référence

- Buffett score = 60% Quality penalty + 40% Value (`portfolio_engine/sector_quality.py` lignes 793-816)
- Quality score = ML-based pré-calculé (workflow externe, `quality_raw_score` ajusté par couverture)
- RADAR = `portfolio_engine/market_sector_radar.py` — neutralisé dans le pipeline core mais utilisé en bonus contextuel (15%) dans top_picks_curated. **L'angle mort réel à tester en priorité quand l'historique est dispo : composite avec RADAR vs sans RADAR.**
