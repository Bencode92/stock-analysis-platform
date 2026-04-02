# Optimisation Rendement — Option dans chaque profil existant

## Concept

Pas un 5ème profil. Un **toggle "Maximiser le rendement"** dans chaque profil existant (Agressif, Modéré, Stable) qui réoptimise les poids des actions **déjà sélectionnées** pour maximiser le yield du portefeuille.

L'utilisateur garde le même univers d'actions (sélectionné par le scoring quality/momentum/risk habituel) mais les **poids sont redistribués** pour favoriser les positions à haut dividende.

## Comment ça fonctionne

```
FLOW NORMAL:
  Scoring → Sélection → Optimisation (score-driven) → Portefeuille

FLOW RENDEMENT:
  Scoring → Sélection → Optimisation (yield-driven) → Portefeuille Rendement
                ↑                         ↑
          Mêmes actions           Poids redistribués
          que le profil            vers les hauts yields
          de base
```

### Exemple concret — Profil Modéré

**Allocation normale :**
| Ticker | Yield | Poids normal |
|---|---|---|
| VICI | 6.5% | 8.2% |
| EOG | 2.8% | 7.6% |
| ITX | 1.2% | 7.2% |
| JNJ | 2.1% | 6.5% |
| GLD | 0.0% | 8.1% |
| SCHD | 3.5% | 6.8% |

**Allocation rendement (mêmes actions, poids redistribués) :**
| Ticker | Yield | Poids rendement | Changement |
|---|---|---|---|
| VICI | 6.5% | **12.0%** | +3.8% (haut yield → surpondéré) |
| EOG | 2.8% | 7.0% | -0.6% |
| ITX | 1.2% | **4.0%** | -3.2% (bas yield → sous-pondéré) |
| JNJ | 2.1% | 5.5% | -1.0% |
| GLD | 0.0% | **3.0%** | -5.1% (pas de yield → minimum) |
| SCHD | 3.5% | **9.0%** | +2.2% (dividend ETF → surpondéré) |

**Yield portefeuille : 2.8% → 4.1%** (même actions, poids différents)

---

## Implémentation technique

### Option A — Modifier l'objectif de l'optimizer (RECOMMANDÉ)

Dans `optimize()`, quand le toggle rendement est actif, changer la fonction objectif :

```python
def objective_rendement(w):
    # Rendement pondéré du portefeuille
    port_yield = np.dot(w, yields)  # yields = array de dividend_yield par candidat

    # Pénalité vol (garde le contrôle du risque)
    port_var = np.dot(w, np.dot(cov, w))
    port_vol = np.sqrt(max(port_var, 0))
    vol_penalty = vol_lambda * (port_vol - vol_target) ** 2

    # Pénalité concentration (HHI)
    hhi_penalty = hhi_lambda * np.sum(w ** 2)

    # Pénalité payout (éviter les value traps)
    payout_penalty = sum(w[i] * max(0, payouts[i] - 90) * 0.5
                         for i in range(n) if payouts[i] is not None)

    # Maximiser yield - pénalités
    return -(port_yield - vol_penalty - hhi_penalty - payout_penalty)
```

**Ce qui change vs l'objectif normal :**
- Normal : maximise `port_score` (quality + momentum + risk)
- Rendement : maximise `port_yield` (dividend yield pondéré)
- Les contraintes (bonds_min, crypto_max, max_single) restent identiques
- La covariance reste identique (même matrice, même diversification)

### Option B — Post-processing des poids (PLUS SIMPLE)

Après l'optimisation normale, redistribuer les poids proportionnellement au yield :

```python
def reweight_for_yield(allocation, candidates):
    """Redistribue les poids pour maximiser le yield tout en gardant les mêmes positions."""
    yields = {c.id: get_dividend_yield(c) or 0 for c in candidates}

    new_alloc = {}
    for aid, w in allocation.items():
        dy = yields.get(aid, 0)
        # Score = poids actuel × (1 + yield_bonus)
        yield_bonus = dy / 5.0  # 5% yield → bonus 1.0 (double le poids)
        new_alloc[aid] = w * (1 + yield_bonus)

    # Renormaliser à 100%
    total = sum(new_alloc.values())
    new_alloc = {k: v / total * 100 for k, v in new_alloc.items()}

    # Respecter max_single_position
    # ... (cap + redistribution comme le FINAL GUARD existant)

    return new_alloc
```

---

## Interface utilisateur

### Dans portefeuille.html

Un toggle sous les onglets de profil :

```
[ 🚀 AGRESSIF ] [ ⚖ MODÉRÉ ] [ 🛡 STABLE ] [ 🏛 LOMBARD ]

                    ○ Standard    ● Rendement maximisé

    Yield portefeuille: 2.8% → 4.1% (+46%)
```

Quand activé :
- Les mêmes positions sont affichées mais avec les poids redistribués
- Un badge "Rendement" apparaît à côté du nom du profil
- Le yield du portefeuille est affiché en gros
- Chaque position montre son yield et le montant de dividende annuel
  (si le simulateur montant est rempli : VICI 12% × 10 000€ = 1 200€ → yield 6.5% → 78€/an)

### Affichage par position

```
VICI PPTYS INC                                    12.0%  (+3.8%)
  Yield: 6.5% | Div/an: 78€ (sur 1 200€ investis)
  ████████████████████░░░░░░░░░░

GLD (SPDR Gold Shares)                             3.0%  (-5.1%)
  Yield: 0.0% | Pas de dividende
  ██████░░░░░░░░░░░░░░░░░░░░░░░
```

---

## Données nécessaires

Tout est **déjà disponible** dans les stocks JSON :
- `dividend_yield` — dans stocks_us/eu/asia.json (519/521 couverture)
- `payout_ratio_ttm` — dans stocks_us/eu/asia.json (521/521)
- `dividend_growth_3y` — dans stocks_us.json (394/521 = 76%)

Pour les ETFs et bonds :
- `yield_ttm` — dans combined_etfs.csv (1374/1406 = 98%)
- `yield_ttm` — dans combined_bonds.csv (424/433 = 98%)

**Aucune nouvelle donnée à fetcher.**

---

## Ce qu'il faut implémenter

### Backend (generate_portfolios_v4.py)

1. Après `optimizer.build_portfolio(assets, profile)`, si mode rendement activé :
   - Récupérer les yields de chaque candidat
   - Appliquer `reweight_for_yield()` (Option B) ou re-optimiser avec objectif yield (Option A)
   - Sauvegarder comme variante `_rendement` dans le portfolio

2. Dans `portfolios.json`, ajouter pour chaque profil :
```json
{
  "Modéré": {
    "_tickers": { ... },           // allocation normale
    "_tickers_rendement": { ... }, // allocation optimisée yield
    "_yield_stats": {
      "normal": { "yield_brut": 2.8, "yield_net_cto": 2.0 },
      "rendement": { "yield_brut": 4.1, "yield_net_cto": 2.9 }
    }
  }
}
```

### Frontend (portfolio-loader.js)

1. Ajouter un toggle radio "Standard / Rendement"
2. Quand "Rendement" activé : afficher `_tickers_rendement` au lieu de `_tickers`
3. Afficher le yield par position et le yield total du portefeuille
4. Si montant rempli : afficher le dividende annuel estimé par position

---

## Contraintes de sécurité

- **Max single position** : identique au profil de base (pas de 30% sur un seul stock haut yield)
- **Payout > 95%** : pénalisé dans le reweighting (risque de cut)
- **Yield > 8%** : suspect — capé à 8% dans le calcul (évite les yield traps)
- **Actions sans yield** (GLD, growth stocks) : gardées mais sous-pondérées (minimum 2% si dans le portefeuille de base)

---

## Questions pour l'expert

1. **Option A (re-optimisation) ou Option B (reweighting) ?**
   - A = plus précis, prend en compte la covariance dans la redistribution
   - B = plus simple, prévisible, pas de risque de divergence SLSQP

2. **Le toggle doit-il être persistant ?** (sauvegardé dans le pipeline) ou **calculé côté frontend** ? (pas de backend, juste un reweighting JS)

3. **Yield cap à combien ?** 8% ? 10% ? (au-dessus = suspect, souvent un stock en chute)

4. **Les bonds et ETF sont-ils aussi reweightés ?** Ou seulement les actions ?

5. **Faut-il un avertissement ?** "Le mode Rendement surpondère les hauts dividendes au détriment de la diversification. Le risque de concentration sectorielle (REITs, utilities, énergie) augmente."
