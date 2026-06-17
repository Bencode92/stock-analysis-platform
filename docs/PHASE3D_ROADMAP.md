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

### Audit cohérence scoring — ORDRE FABRE v7-final-final (2026-06-17)

L'audit du 17 juin a tué 3 hypothèses successives et révélé que **le « biais EM » est un BUG DATA, pas un biais de modèle**. Le bug est asymétrique par bourse, pas par région. Ordre corrigé en conséquence :

#### Mesure clé du 17 juin

| Région | % stocks avec ≥2 fondamentaux None | Polluants par pays |
|---|---:|---|
| US | 0.2% (1/515) | FERG seul |
| EU | 4.3% (12/278) | 5 autrichiens, 2 italiens, autres |
| EM | **20.7% (55/266)** | **Chine 52/52 (100%)** + Inde 3/98 (3%) |

**Diagnostic** : ZÉRO chinoise propre dans la base. Les 52 chinoises sont scotchées à Buf 60 par défaut (4/6 critères évalués), incapables d'atteindre 70+ par data quality. L'Autriche présente le même symptôme à plus petite échelle (5/12 EU polluants).

→ **Le bug n'est pas "EM" mais "couverture par bourse"** (Vienne + Milan + Shanghai/HK touchées).

#### Priorité 1 — Détecteur générique de couverture par bourse

Pas un fix par région, un fix par **complétude data** :
```
Si count(critères Buffett où value=None) ≥ seuil
  → marquer quality_coverage_insufficient
  → SORTIR du pool de sélection
  (au lieu de coller un faux 60)
```

Détection automatique de la Chine + Autriche + Italie d'un coup, sans liste noire de pays.

#### Priorité 2 — Re-run audit régional APRÈS nettoyage

Les médianes régionales par secteur du 17 juin sont **polluées par les 55 EM polluants et 12 EU polluants**. La conclusion "EU > US > EM sur Buffett" est en partie un artefact data. Re-faire l'audit **après** P1 avant de toucher à quoi que ce soit régional.

#### Priorité 3 — Trancher la Chine doctrinalement

**Recommandation Fabre** : exclusion structurelle assumée, pas enrichissement Bloomberg/Refinitiv. Raisons :
- Coût Bloomberg/Refinitiv prohibitif pour data complète Chine
- Fiabilité des états financiers chinois reste problématique même complétés
- Risque VIE (coquille caïmanaise) inchangé par data
- Risque réglementaire 2021 (secteurs effacés par décret) inchangé
- Exclure la Chine d'un portefeuille de conviction est une décision pro-courante

→ Le `coverage_insufficient` règle le problème mécaniquement : pas de chinoises dans le pool **pour la bonne raison** (data non fiable), pas par accident silencieux.

#### Priorité 4 — α vs β sur `valuation_ok` (le débat NVDA)

**Diagnostic confirmé** : NVDA Quality 96 / Buffett 67 = pas une incohérence, c'est le système qui fait son travail (Quality = pur, Buffett = quality+value). Mais leur fusion dans `fit_score` réinjecte le P/E deux fois.

- **α** : garder `valuation_ok`, renommer score "quality+value", assumer tilt value/non-US permanent par écrit
- **β** : sortir `valuation_ok` du Buffett, score value séparé pour piloter le tilt explicitement (**reco Fabre**)

#### Priorité 5 — Bug CS finance (5/5 vs 5/6)

Si `roic_skipped: True` pour finance, CS devrait sortir 5/5 = 100, pas 5/6 = 83. **Test d'une ligne** à faire pour confirmer.

Si confirmé : toutes les financières (ADM, CS, TROW, HNR1, SREN, AXA) perdent ~17 pts injustement. Bug à fixer en priorité car classement finance faussé vers le bas.

---

#### Item HORS-3D, ACTIONNABLE MAINTENANT

**Vérifier accès T212 sur INFY / HCLTECH / HEROMOTOCO** : trois indiennes Buf 100, Quality 83-90, ROE 23-31%, D/E < 0.10. Qualité world-class **bloquée par toggle broker_access**, pas par doctrine ni par data. Si dispo T212 → débloquer dans broker_access.html.

C'est le seul item de cette liste qui **améliore réellement la sélection maintenant**.

### Calibration sticky bonus (n=15+ snapshots)
- Mesurer σ run-to-run effectivement (besoin 15 snapshots PIT)
- Calibrer sticky à 1.5-2σ (au lieu de 0.03 arbitraire actuel)
- Estimation à n=15 = fin juin 2026

## Hors phase 3D

- Phase 3E (lecture seule) : briefing thématique trimestriel — déjà livré
- Phase 4 (août+) : exploration levier modéré avec sizing Kelly + stress path-dependent
- Réactivation crypto sleeve si user le demande (décision A actée OFF aujourd'hui)
