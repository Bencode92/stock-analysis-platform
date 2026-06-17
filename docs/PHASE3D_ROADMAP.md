# Phase 3D Roadmap — Scoring & Toxicity (Juillet 2026)

**Statut** : gelé jusqu'à fin juin pour observation régime stable.

## Items prévus (ordre indicatif)

### Toxicity actions (haute priorité — comble le trou de sortie)
- Position en violation hard_filters → flag VENDRE
- Perf relative VWCE < -35% (pas absolu, anti-vente au creux en bear)
- Buffett < seuil profil pendant 2 runs consécutifs (persistance)
- Vol > 50% + DD(VWCE) > -20% (market filter)
- Circuit prix-pur calculable à la main (mode dégradé pipeline)

### Re-validation mensuelle des positions
- Audit holdings.json vs hard_filters profil
- Sortie `revalidation_report.md` (flagged positions)
- DECK Modéré sortira mécaniquement (vol 45.74 > 45)

### Fix ROE négatif
- `equity < 0 AND fcf_ttm > 0` → retire pénalité ROE (buyback-driven OK)
- `equity < 0 AND fcf_ttm < 0` → garde pénalité (loss-driven mauvais)
- 53 stocks affectés dans l'univers (MCD, HD, KHC, etc.)
- Impact estimé : +1 candidat Stable, +0 Modéré, +3 Agressif

### Test ablation fit_score
- Mesurer overlap top 10 à N facteurs (10 actuel, 4, 2, 1)
- Si overlap > 90% à 4 facteurs : retirer 6 facteurs décoratifs
- **Pré-requis** avant de décider de sortir Buffett du fit_score

### Buffett retiré du fit_score (uniquement si ablation valide)
- Buffett reste gate T1 (filtre binaire qualité)
- Quality + subscores prennent tout le scoring fin
- Libère 0.22 de poids redistribué sur eps_growth + perf relative

### Test biais régional Buffett (Fabre v7)
**Justification** : seuils Tech US et Tech EU identiques (ROE > 12%) alors que ROE médian est structurellement plus haut US (~15%) > EU (~10%) > EM (~8%). Hypothèse : le filtre Buffett pénalise les bonnes boîtes EU/EM juste parce qu'elles vivent dans un régime de ROE plus bas.

**3 mesures empiriques** :
1. Buffett médian par (secteur × région) — si US >> EU >> EM, biais confirmé
2. Faux négatifs régionaux : stocks qui échouent `roe_consistent` mais sont au-dessus de la médiane de LEUR région
3. Skew US en sortie des portfolios Modéré/Agressif vs poids US de l'univers éligible

**Si 3/3 pointent même direction** : calibrer Buffett en percentile intra-(secteur, région) comme Quality. Sinon : biais théorique, on n'y touche pas.

### Calibration sticky bonus (n=15+ snapshots)
- Mesurer σ run-to-run effectivement (besoin 15 snapshots PIT)
- Calibrer sticky à 1.5-2σ (au lieu de 0.03 arbitraire actuel)
- Estimation à n=15 = fin juin 2026

## Hors phase 3D

- Phase 3E (lecture seule) : briefing thématique trimestriel — déjà livré
- Phase 4 (août+) : exploration levier modéré avec sizing Kelly + stress path-dependent
- Réactivation crypto sleeve si user le demande (décision A actée OFF aujourd'hui)
