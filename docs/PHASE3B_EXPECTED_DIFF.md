# Phase 3B — Diff attendu (à valider avant merge)

**Date** : 2026-06-12
**Branche** : `phase3b-doctrine`
**Décisions actées** (Fabre v4) :
- Thematique = ETF-only, satellites actions supprimés, 20% redistribués anti-concentration
- Crypto OFF, le sleeve quasi-vide est neutralisé doctrinalement
- Gel post-3C jusqu'à début juillet (~3 semaines stabilité régime)

---

## Modifications de code

### 3B.1 Thematique ETF-only

`portfolio_engine/core_satellite_discipline.py`

**THEMATIQUE_CORE** — refonte allocation (sans EWT, total 100%) :
```python
THEMATIQUE_CORE = {
    "QQQ":     0.20,
    "IEMG":    0.25,    # +10pts (était 0.15) — diluant tech, EM cluster
    "VGT":     0.10,
    "CGXU":    0.10,
    "VBK":     0.12,    # +4pts (était 0.08)
    "VOT":     0.05,
    "XLE":     0.10,    # +5pts (était 0.05)
    "SGLN.AS": 0.08,    # +3pts (était 0.05)
    # EWT : SUPPRIMÉ (était 0.02). Redondant avec IEMG (Taiwan déjà ~13% de IEMG).
}
# total = 1.00 exactement, 8 lignes
```

**`_build_agressif_thematique()`** : ne plus appeler `_get_top_thematic_satellite()`.
- Ne plus injecter de satellite stocks (les 5 lignes 4% disparaissent)
- Le cœur ETF est désormais 100% du sleeve

**`_get_top_thematic_satellite()`** : conservée pour rétro-compat avec docstring DEPRECATED ; warning si appelée.

### 3B.2 Crypto OFF

`generate_portfolios_v4.py` :
- Nouveau flag `CONFIG["enable_crypto"] = False` (ligne ~425)
- Bloc chargement crypto (ligne ~2604) court-circuité si flag à False : `crypto_data = []` explicite + log info

`portfolio_engine/preset_meta.py` :
- Docstring DEPRECATED sur `CRYPTO_PRESETS`, `CRYPTO_RANKING_WEIGHTS`, `CRYPTO_CORE_CONFIG`
- Pointeurs vers la décision 2026-06-12 (gouvernance turnover incompatible avec momentum quotidien)

---

## Diff portfolios.json attendu

### Agressif-Thematique

**Section ETF** : 8 lignes au lieu de 9 :
| Ticker | Avant | Après |
|---|---:|---:|
| QQQ | 20% | **20%** |
| IEMG | 15% | **25%** |
| VGT | 10% | **10%** |
| CGXU | 10% | **10%** |
| VBK | 8% | **12%** |
| VOT | 5% | **5%** |
| XLE | 5% | **10%** |
| SGLN.AS | 5% | **8%** |
| EWT | 2% | ❌ supprimé |

**Section Actions** : disparaît entièrement. Avant : FRES, EME, FIX, 2330, ASML × 4% = 20%. Après : section vide ou absente.

**Total** : 100% (8 lignes ETF, 0 ligne Action).

### Stable, Modéré, Agressif

**Aucun changement attendu** sur les sections Actions / ETF / Obligations.

### Dividende-PEA, Dividende-CTO

**Aucun changement attendu**.

### Crypto

**Toutes sections Crypto disparaissent** de tous les profils (étaient déjà vides ou intermittentes — BCH/BNB ponctuels). Le sleeve `Crypto: {}` peut subsister mais sans contenu.

---

## Critères d'acceptation

| # | Critère | Vérification |
|---|---|---|
| C1 | Thematique.ETF a exactement 8 lignes, total 100% | parse + sum |
| C2 | Thematique.Actions est vide ou absent | check |
| C3 | EWT absent de toutes les sections ETF | grep |
| C4 | Aucun profil n'a de ticker crypto dans aucune section | check |
| C5 | Stable/Modéré/Agressif/Dividende-PEA/Dividende-CTO Actions inchangés | diff strict |
| C6 | Tests test_no_blocked_in_pools.py passent (régression phase 2) | run tests |

---

## Plan d'exécution

1. Diff attendu écrit ✓ (ce document)
2. Modifs core_satellite_discipline.py (Thematique ETF-only) → commit 3B.1
3. Modifs generate_portfolios_v4.py + preset_meta.py (Crypto OFF) → commit 3B.2
4. Run pipeline local → comparer diff observé vs attendu
5. Tests d'acceptation + tests régression phase 2
6. Si tout PASS : push branche, merge dans main, push origin/main

---

## Politique post-3B

Doctrine actée Fabre v4 : **gel de tout chantier de scoring/composition jusqu'à début juillet (~3-4 semaines)** sauf bugs critiques.

Raison : besoin d'observer le système en régime stable pour mesurer empiriquement :
- Vrai turnover post-stabilisation
- σ run-to-run du sticky (n≥15 snapshots fin juin)
- Comportement de la cadence hebdo (post-3C)

Pendant ce gel : remplir `data/holdings.json` quand tu auras 10 min avec ton relevé T212. Pas urgent.
