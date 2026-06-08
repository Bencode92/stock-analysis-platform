# Méthodologie du scoring — limites et tests empiriques

## Composite score (top_picks_curated)

```
Composite = 0.40 × Buffett/100 + 0.30 × Quality/100 + 0.15 × Perf_norm + 0.15 × RADAR
```

## Tests empiriques sur snapshot 2026-06-08 (univers 1072 stocks)

### 1. Redondance Buffett ↔ Quality
- **Corrélation Pearson : 0.741**
- **Corrélation Spearman : 0.759**

→ Les deux scores capturent ~75% du même signal fondamental. Le composite pondère effectivement ~70% sur un seul facteur "qualité" dupliqué.

### 2. Information Coefficient (snapshot, biaisé look-ahead)
- IC Buffett seul vs perf 1y : **−0.156**
- IC Quality seul vs perf 1y : **−0.127**

→ Les hautes qualités ont sous-performé sur 12 derniers mois. **À nuancer** : test ex-post (Buffett(t) vs perf(t-12m, t)) non valide comme indicateur prédictif. Le vrai test requiert Buffett(t-12m) vs perf(t-12m, t), pas dispo (pas d'historique PIT exploitable encore).

### 3. Concentration sectorielle du top décile
67% Tech + Industries + Finance → le composite favorise structurellement ces secteurs.

## Conclusions actuelles

1. **Ne pas utiliser le composite comme classement prédictif** tant qu'un backtest PIT walk-forward n'a pas validé sa rentabilité nette de frais.
2. **Usage défendable** : filtre d'exclusion ("Buffett ≥ 60 pour écarter les pièges").
3. **Infrastructure PIT en place** : `portfolio_engine/score_archiver.py` archive snapshots quotidiens dans `data/score_history/scores_YYYY-MM-DD.json`. À utiliser dans 6-12 mois pour test rigoureux.

## Risque réglementaire (France)

Le statut CIF (Conseil en Investissement Financier, art. L.541-1 CMF) régule la fourniture de **recommandations personnalisées portant sur des instruments financiers** à titre habituel. Un avis informel ponctuel entre collègues n'est pas "à titre de profession habituelle" — mais répété et systématique, ça glisse vers la zone régulée.

**Mitigations** :
- Présenter comme outil éducatif / screener, pas comme "achète X"
- Disclaimer explicite "pas un conseil personnalisé, fais ta propre analyse"
- Ne jamais se positionner sur l'adéquation à *leur* situation (profil de risque, horizon)

## Référence

Buffett score = 60% Quality penalty + 40% Value (`portfolio_engine/sector_quality.py` lignes 793-816)
Quality score = ML-based pré-calculé (workflow externe, `quality_raw_score` ajusté par couverture)
RADAR = `portfolio_engine/market_sector_radar.py` — neutralisé dans le pipeline core mais utilisé en bonus contextuel (15%) dans top_picks_curated.
