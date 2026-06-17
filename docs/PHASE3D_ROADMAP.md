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

### Audit cohérence scoring — ORDRE FABRE v7-final (2026-06-17)

L'audit empirique du 17 juin a RÉFUTÉ l'hypothèse initiale (US > EU > EM) et révélé 3 trouvailles qui imposent un ordre de priorité différent :

#### Priorité 1 — Chiffrer les faux 50 (trous data EM/Asie) — **AVANT toute conclusion régionale**

**Mesure du 17 juin** :
- US : 0.2% des stocks ont ≥2 fondamentaux None
- EU : 4.3%
- **EM : 20.7% (55 stocks sur 266)** ← critique

**Conséquence** : Tencent et 54 autres EM sont notés 50 par défaut sur 2-3 critères évalués au lieu de 6. Ce ne sont PAS des "médiocres" — ce sont des "je ne sais pas" déguisés en "médiocres". Ces faux 50 polluent toutes les médianes régionales par secteur.

**Action 3D** :
- Auditer la source : pourquoi 20% des EM ont ROE/ROIC/D/E manquants ? (provider FMP/yfinance ? mapping ticker ? données comptables non-IFRS ?)
- Pour les stocks avec ≥2 gaps, marquer score Buffett comme `quality_coverage_insufficient` au lieu de 50 par défaut
- Re-mesurer ensuite les médianes régionales SANS ces faux 50

**On ne tranche le biais régional QU'APRÈS** ce nettoyage data.

#### Priorité 2 — Vérifier bug CS/finance (5/5 vs 5/6)

**Hypothèse Fabre** : si `roic_skipped: True` pour finance, le dénominateur devrait être 5 et CS devrait sortir à 5/5 = 100, pas 5/6 = 83. Le fait qu'il sorte 83 suggère que ROIC compte vraiment dans le score.

**Conséquence si confirmé** : toutes les financières (ADM, CS, TROW, HNR1, SREN, AXA...) perdent ~17 points injustement. Classement finance faussé vers le bas.

**Test d'une ligne** : prendre une banque qui passe les 5 autres critères et vérifier si elle sort 100 ou 83.

#### Priorité 3 — Trancher α vs β sur `valuation_ok`

**Diagnostic clarifié (Fabre v7-final)** : la "contradiction" NVDA Buffett 67 / Quality 96 n'est PAS une incohérence. Les deux scores mesurent des choses différentes (qualité absolue vs qualité+value). Le VRAI problème est qu'ils sont **fusionnés** dans `fit_score` (Buf 0.22 + Quality 0.38), ce qui réinjecte le P/E deux fois.

**Option α — Garder `valuation_ok` dans Buffett** :
- Doctrine Munger "wonderful business at a fair price" assumée
- Tilt value/non-US permanent assumé
- Renommer le score "quality+value", pas juste "quality"
- Acter "short US-growth méga-caps à vie" par écrit
- **Acceptable SI tu l'écris**, pas acceptable comme statu quo non documenté

**Option β — Sortir `valuation_ok` du Buffett** :
- Buffett devient pur qualité (ROE/ROIC/D/E/FCF/moat)
- NVDA passerait à 83-100
- Score value séparé pour piloter le tilt value explicitement et de manière sizée
- Cohérent avec doctrine "user décide ligne par ligne"
- **Recommandation Fabre**

**Décision à prendre en juillet à froid, après chiffrage P1 et fix P2.**

#### Bugs cosmétiques détectés en audit du 17 juin (pas critiques mais à logger)
- buffett_criteria affiche ROIC failed pour banques (devrait être skipped) — voir P2 ci-dessus
- LUPIN Inde Buf 83 OK → le malus EM n'est PAS uniforme, il vient des stocks avec trous data (P1)

### Calibration sticky bonus (n=15+ snapshots)
- Mesurer σ run-to-run effectivement (besoin 15 snapshots PIT)
- Calibrer sticky à 1.5-2σ (au lieu de 0.03 arbitraire actuel)
- Estimation à n=15 = fin juin 2026

## Hors phase 3D

- Phase 3E (lecture seule) : briefing thématique trimestriel — déjà livré
- Phase 4 (août+) : exploration levier modéré avec sizing Kelly + stress path-dependent
- Réactivation crypto sleeve si user le demande (décision A actée OFF aujourd'hui)
