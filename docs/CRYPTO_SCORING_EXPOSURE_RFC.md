# RFC — Exposer le scoring `preset_crypto` à la page `crypto.html`

**Auteur :** Benoit
**Date :** 2026-04-08
**Statut :** Demande d'avis expert
**Repo :** [Bencode92/stock-analysis-platform](https://github.com/Bencode92/stock-analysis-platform)

---

## 1. Contexte

La plateforme dispose de deux univers parallèles autour des cryptos :

### 1.1. Pipeline UI (consommé par `crypto.html`)
```
crypto-pipeline.yml
   └── scripts/crypto-volatility-return.js
         └── data/filtered/Crypto_filtered_volatility.csv
               └── crypto-script.js (fetch CSV)
                     └── crypto.html (cartes + composer multi-critères)
```

Colonnes disponibles côté front aujourd'hui : `symbol`, `currency_base`,
`last_close`, `ret_1d/7d/30d/90d_pct`, `vol_7d/30d_annual_pct`, `atr14_pct`,
`drawdown_90d_pct`, `sharpe_ratio` (présent dans CSV mais **non exploité** UI),
`exchange_used`, `last_datetime`.

### 1.2. Pipeline portefeuille (consommé par `portfolios.json`)
```
generate_portfolios.yml
   └── generate_portfolios_v4.py
         └── portfolio_engine.preset_crypto.select_crypto_for_profile()
               ├── Stage 1 : Data QC (tier1, coverage_ratio, data_points, …)
               ├── Stage 2 : Hard filters par profil (Modéré / Agressif)
               ├── Stage 3 : Scoring pondéré → _profile_score [0–100]
               └── Stage 4 : Diversification core/satellite par catégorie
         └── DataFrame enrichi en mémoire (jamais persisté)
               └── Seuls les tickers + poids finissent dans data/portfolios.json
```

Colonnes calculées par `preset_crypto` mais **jamais écrites sur disque** :
`_profile_score`, `_role` (core/satellite), `_crypto_category` (16 catégories :
blue_chip, defi, layer2, smart_contract, gaming_nft, oracle, …),
`_score_sharpe_ratio`, `_score_ret_90d`, `_score_ret_1y`, `_score_vol_penalty`,
`_score_dd_penalty`.

## 2. Problème

`crypto.html` affiche un classement basé sur la **performance brute** (perf 24h,
7j, 90j…). Résultat observé en production : le top des "hausses" est dominé par
des tokens douteux (GIGGLE, SOON, MODE, EUL…) qui seraient **automatiquement
écartés** par les hard filters QC de `preset_crypto.py` (tier1_listed,
data_points ≥ 60, coverage ≥ 0.85, blacklist réputationnelle).

L'utilisateur n'a aucune visibilité sur :
- Le **score composite** de chaque crypto pour un profil donné
- La **catégorie** (impossible de filtrer "que les L1" ou "que la DeFi")
- Le **rôle** dans une stratégie (core vs satellite)
- La **qualité des données** (Tier-1, historique suffisant)

## 3. Contrainte forte de l'auteur

> **Ne pas modifier `generate_portfolios_v4.py`.**

Ce fichier est central pour la production de `portfolios.json` et l'auteur
ne souhaite prendre **aucun risque de régression** sur le pipeline portefeuille.
Toute solution doit être **strictement additive** et isolée du moteur principal.

## 4. Options évaluées

### Option A1 — Workflow + script Python dédiés (recommandé)

**Principe :** Créer un nouveau script `scripts/dump_scored_crypto.py` qui
importe `select_crypto_for_profile` et persiste son output, déclenché par un
workflow GitHub Actions séparé.

```python
# scripts/dump_scored_crypto.py
import pandas as pd
from pathlib import Path
from portfolio_engine.preset_crypto import select_crypto_for_profile

df = pd.read_csv("data/filtered/Crypto_filtered_volatility.csv")
out_dir = Path("data/filtered")
for profile in ["Modéré", "Agressif"]:
    scored = select_crypto_for_profile(df, profile, top_n=None)
    if not scored.empty:
        scored.to_json(
            out_dir / f"Crypto_scored_{profile.lower()}.json",
            orient="records", force_ascii=False, indent=2,
        )
```

```yaml
# .github/workflows/score-cryptos.yml
name: Score cryptos for UI
on:
  workflow_run:
    workflows: ["Crypto Pipeline"]
    types: [completed]
  workflow_dispatch:
jobs:
  score:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install pandas numpy
      - run: python scripts/dump_scored_crypto.py
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "chore: update scored crypto JSON"
          file_pattern: "data/filtered/Crypto_scored_*.json"
```

**Avantages :**
- ✅ **Zéro modification** de `generate_portfolios_v4.py`
- ✅ Isolé : tomber le workflow ne casse rien d'autre
- ✅ Source de vérité unique (`preset_crypto.py`) — pas de divergence
- ✅ Reverter = supprimer 2 fichiers
- ✅ Cohérent avec l'architecture existante (pipelines découplés)

**Inconvénients :**
- ⚠️ Lit le CSV en double (`generate_portfolios_v4.py` + `dump_scored_crypto.py`),
  mais les deux pipelines tournent indépendamment de toute façon
- ⚠️ Latence : le JSON est régénéré après le pipeline crypto, pas en même temps
  que `portfolios.json` (acceptable car données crypto < 1h fraîches)
- ⚠️ Si la signature de `select_crypto_for_profile` change, deux call sites à
  mettre à jour (mais c'est une fonction publique du module, le risque est faible)

### Option A2 — Étendre `crypto-pipeline.yml`

**Principe :** Ajouter une étape Python à la fin du workflow crypto existant
qui exécute le même script que A1.

**Avantages :**
- Un workflow en moins
- Régénération immédiate après production du CSV

**Inconvénients :**
- Mélange Node.js (existant) et Python (nouveau) dans un même workflow
- Couple le pipeline crypto à `portfolio_engine` (dépendance Python qui
  n'existait pas avant) → augmente la surface de casse du pipeline crypto

### Option B — Réimplémenter `preset_crypto` en JavaScript

**Principe :** Porter pondérations, hard filters et catégories directement dans
`crypto-script.js`.

**Avantages :**
- Aucun nouveau workflow
- Tout est calculé à la volée côté client

**Inconvénients :**
- ❌ **Divergence garantie** à terme avec le moteur Python (deux sources de
  vérité pour un scoring sensible)
- ❌ Duplication de la liste des 16 catégories et de leurs membres (~200 lignes)
- ❌ Duplique les pondérations et la logique de normalisation par percentile
- ❌ Toute évolution future de `preset_crypto.py` doit être répercutée à la main

### Option C — Front-only quick wins (complémentaire, pas alternatif)

Indépendamment de A/B, des améliorations sont faisables **immédiatement** sur
`crypto-script.js` avec les seules colonnes du CSV actuel :

- Ajout de `sharpe_ratio` au composer multi-critères (déjà dans le CSV)
- Toggles QC : "Tier-1 only", "≥1 an d'historique", "masquer suspects"
- Hard filters profil Modéré/Agressif appliqués en JS (vol/dd seuils)
- Liste d'exclusion stablecoins + blacklist hardcodée

**Limite :** ne donne pas accès au score composite, à la catégorie ni au rôle.

## 5. Patch front déjà appliqué (inoffensif)

Une modification à `crypto-script.js` est déjà en place : `loadCryptoData()`
tente d'abord de charger `data/filtered/Crypto_scored_{profile}.json`, et
retombe **silencieusement** sur le CSV si le JSON n'existe pas. Tant qu'aucune
des options A n'est implémentée, le comportement utilisateur est strictement
identique à l'existant.

```js
// extrait
const profile = (window.CRYPTO_PROFILE || 'agressif').toLowerCase();
const scoredUrl = `data/filtered/Crypto_scored_${profile}.json`;
try {
  const jr = await fetch(`${scoredUrl}${cacheBuster}`);
  if (jr.ok) { rows = await jr.json(); usedSource = 'scored-json'; }
} catch (_) { /* fall through to CSV */ }
if (!rows) { /* fetch CSV comme avant */ }
```

## 6. Question pour l'expert

1. **L'option A1 est-elle effectivement la plus sûre** étant donné la contrainte
   "ne pas toucher à `generate_portfolios_v4.py`" ? Y a-t-il un piège que je ne
   vois pas (race conditions entre workflows, droits d'écriture du
   `git-auto-commit-action`, cache GitHub Pages, …) ?

2. **Faut-il préférer un appel direct à la fonction Python** dans un nouveau
   script, ou plutôt **invoquer `generate_portfolios_v4.py` en mode dry-run**
   avec un flag qui forcerait juste le dump du DataFrame intermédiaire ? La
   première option est plus simple, la seconde garantit que l'environnement
   d'exécution est exactement le même que la prod.

3. **Y a-t-il une troisième voie** que je n'ai pas explorée ? Par exemple :
   - Un endpoint HTTP servi par GitHub Pages qui exécuterait le scoring à la
     volée (impossible sans backend, mais peut-être un service edge ?)
   - Réutiliser `data/portfolios.json` qui contient déjà la sortie finale du
     moteur (mais limitée aux ~5 cryptos sélectionnées par profil, pas l'univers
     entier)

4. **Le scoring de `preset_crypto` est-il calibré pour l'usage UI** ? Les
   pondérations sont conçues pour la **construction de portefeuille** (sélection
   de 2 core + 2-3 satellites). Les afficher comme un classement public a-t-il
   du sens, ou faut-il un scoring dédié "vitrine" plus simple ?

5. **Le format JSON dumpé** doit-il rester aligné 1:1 avec les colonnes
   internes (`_profile_score`, `_role`, …), ou faut-il créer un schéma stable
   plus restreint pour découpler l'UI des évolutions internes du moteur ?

## 7. Annexes

### 7.1. Référence `preset_crypto.py`

- Stage 1 — Data QC : `tier1_listed`, `stale`, `coverage_ratio ≥ 0.85`,
  `data_points ≥ 60`, `enough_history_90d`, `currency_quote ∈ fiat`
- Stage 2 — Hard filters Modéré : `vol_30d ≤ 80%`, `dd_90d ≥ -35%`,
  `enough_history_1y`, `ret_1y_suspect == False`
- Stage 2 — Hard filters Agressif : `vol_30d ≤ 200%`, `dd_90d ≥ -70%`
- Stage 3 — Scoring (Modéré) : `+0.25·sharpe +0.10·ret90d +0.15·ret1y
  −0.30·vol_pen −0.20·dd_pen` → normalisé [0, 100]
- Stage 3 — Scoring (Agressif) : `+0.30·sharpe +0.25·ret90d +0.15·ret1y
  −0.10·vol_pen −0.20·dd_pen`
- Discount Sharpe v2.0.1 : actifs avec `data_points < 365` ET `sharpe > 2.0`
  pénalisés × 0.7
- Stage 4 — Diversification : 2 core + 2-3 satellite, max 1 par catégorie en
  core, max 2 par catégorie au total
- Catégories (16) : `tokenized_gold`, `blue_chip`, `smart_contract`, `defi`,
  `payment`, `privacy`, `pow_legacy`, `exchange`, `meme`, `gaming_nft`,
  `storage`, `oracle`, `layer2`, `fan_token`, `other`, …
- Exclusions globales : 20 stablecoins + blacklist v2.0.2
  (TRX, MORPHO, SHIB, DOGE, PEPE, FLOKI, BONK, WIF, OFFICIAL TRUMP, PUDGY PENGUINS)

### 7.2. État actuel des fichiers touchés

| Fichier | État |
|---|---|
| `generate_portfolios_v4.py` | **Inchangé** (revert effectué) |
| `crypto-script.js` | Patché (loader hybride JSON→CSV, inoffensif sans JSON) |
| `scripts/dump_scored_crypto.py` | À créer (option A1) |
| `.github/workflows/score-cryptos.yml` | À créer (option A1) |
| `data/filtered/Crypto_scored_*.json` | À générer par workflow |
