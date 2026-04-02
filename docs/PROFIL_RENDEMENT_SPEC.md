# Profil "Rendement Maximisé" — Spécification v1.0

## Objectif

Créer un 5ème profil orienté **income/cash flow** pour les investisseurs qui cherchent à maximiser le rendement courant (dividendes) tout en maintenant une qualité minimale. C'est le profil idéal pour le nantissement Lombard — les dividendes couvrent le coût du crédit.

## Positionnement vs les 4 profils existants

| Profil | Vol target | Objectif principal | Dividende |
|---|---|---|---|
| Agressif | 24% | Croissance/momentum | Négatif (pénalisé) |
| Modéré | 12% | Équilibre qualité/risque | Neutre (+0.10) |
| Stable | 6% | Préservation capital | Important (+0.15) |
| **Rendement** | **8-10%** | **Cash flow maximum** | **Dominant (+0.30)** |

Le Rendement se positionne entre Modéré et Stable en termes de risque, mais avec un objectif fondamentalement différent : maximiser le yield net, pas minimiser la vol.

---

## Contraintes du profil

### Optimizer (PROFILES dans optimizer.py)

```python
"Rendement": ProfileConstraints(
    name="Rendement",
    vol_target=9.0,           # Entre Modéré (12) et Stable (6)
    vol_tolerance=3.0,        # ±3% acceptable
    bonds_min=20.0,           # 20% min bonds (income bonds, pas cash)
    bonds_max=40.0,           # Pas trop de bonds (actions = meilleur yield)
    crypto_max=0.0,           # Pas de crypto — pas de dividende
    max_single_position=10.0, # Diversification income
    max_assets=20,            # Plus de positions pour diversifier le risque de cut
    min_assets=12,
    max_sector=25.0,          # Pas trop concentré sur un secteur
    max_region=40.0,
    max_any_category=60.0,
    score_scale=3.5,          # Entre Modéré (4.0) et Stable (3.0)
    bucket_penalty_lambda=3.0,
    turnover_penalty=0.15,    # Turnover modéré (dividendes = long terme)
    max_turnover=20.0,
    stock_pos_threshold=1.0,
    min_stock_positions=0,
    min_stock_weight=0.0,
    max_stock_weight=100.0,
    euus_mode=False,
)
```

### Hard filters (PROFILE_POLICY dans preset_meta.py)

```python
"Rendement": {
    "allowed_equity_presets": {
        "rendement",          # High dividend yield
        "value_dividend",     # Dividend + value
        "defensif",           # Low vol defensives (utilities, staples)
        "quality_premium",    # Quality avec dividende
        "low_volatility",     # Min vol
    },
    "min_buffett_score": 55,      # Plus strict que Agressif (50), moins que Modéré (60)
    "min_quality_gate": 60,       # OR gate — rescue via quality
    "hard_filters": {
        "volatility_3y_max": 35.0,    # Pas de stocks ultra-volatils
        "roe_min": 8.0,               # Rentabilité minimale
        "de_ratio_max": 2.5,          # Pas trop de dette (risque de cut)
        "quality_score_min": 40,      # Qualité minimale
        "quality_coverage_min": 70,   # Données complètes
        "dividend_yield_min": 1.5,    # ★ FILTRE CLÉ: yield minimum 1.5%
        "payout_ratio_max": 95.0,     # ★ Payout < 95% (soutenabilité)
    },
    "equity_min_weight": 0.40,    # 40-65% en actions
    "equity_max_weight": 0.65,
    "min_equity_positions": 10,   # Au moins 10 actions pour diversifier le risque de cut
}
```

### Score weights

```python
"Rendement": {
    "score_weights": {
        # ═══ INCOME DOMINANT (40%) ═══
        "dividend_yield":      0.25,   # ★★ Yield courant — critère #1
        "dividend_growth_3y":  0.10,   # Croissance du dividende — pérennité
        # NE PAS utiliser dividend_coverage ici — déjà dans quality_safety_sub

        # ═══ QUALITÉ/SÉCURITÉ (35%) ═══
        "quality_safety_sub":  0.20,   # ★ D/E + payout — soutenabilité dividende
        "quality_quality_sub": 0.10,   # ROE/ROIC — capacité à payer
        "quality_value_sub":   0.05,   # P/E — pas surpayer

        # ═══ FORWARD (10%) ═══
        "eps_growth_forecast_5y": 0.05, # Croissance future (modeste)
        "eps_surprise":        0.05,   # EPS surprise — beats = dividende sécurisé

        # ═══ RISQUE (20%) ═══
        "volatility_3y":      -0.10,   # Vol pénalisée (income = stabilité)
        "max_drawdown_3y":    -0.10,   # Drawdown pénalisé

        # ═══ MOMENTUM (5%) ═══
        "perf_1y":             0.05,   # Léger momentum — évite les chutes

        # ABSENT: perf_3m (trop bruité pour income)
        # ABSENT: quality_growth_sub (pas prioritaire pour income)
    },
}
```

**Somme : pos=0.85, neg=-0.20, total=0.65**

### Justification des poids

| Métrique | Poids | Justification |
|---|---|---|
| **dividend_yield** | **+0.25** | Le critère #1 — c'est l'objectif du profil |
| **quality_safety_sub** | **+0.20** | D/E + payout peer-relative — le dividende est-il soutenable ? |
| **dividend_growth_3y** | +0.10 | Un dividende qui croît est plus sûr qu'un yield statique |
| **quality_quality_sub** | +0.10 | ROE/ROIC — l'entreprise peut-elle continuer à payer ? |
| **volatility_3y** | **-0.10** | Pénalise la vol — income investors veulent de la stabilité |
| **max_drawdown_3y** | **-0.10** | Pénalise les drawdowns — risque de margin call Lombard |
| eps_growth_forecast_5y | +0.05 | Croissance future modeste |
| eps_surprise | +0.05 | Beats réguliers = dividende sécurisé |
| quality_value_sub | +0.05 | Pas surpayer le yield |
| perf_1y | +0.05 | Filet de sécurité momentum |

---

## Bucket targets

```python
"Rendement": {
    Role.CORE: (0.40, 0.60),       # Actions quality + dividend ETFs
    Role.DEFENSIVE: (0.25, 0.45),   # Bonds income + utilities
    Role.SATELLITE: (0.05, 0.20),   # Small caps dividend, REITs
    Role.LOTTERY: (0.00, 0.00),     # Pas de lottery pour income
}
```

---

## ETF presets autorisés

```python
PROFILE_PRESET_PRIORITY["Rendement"] = [
    # CORE
    "rendement_etf",        # HDV, SCHD — US high dividend
    "qualite_value",        # VTV, IUSV — value/quality
    "coeur_global",         # ACWI, VT — broad diversification

    # DEFENSIVE
    "sector_defensive",     # XLU, XLP — utilities/staples
    "sector_healthcare",    # XLV — healthcare (dividendes stables)
    "min_vol_global",       # ACWV — minimum volatility
    "or_physique",          # GLD — hedge (pas de dividende mais decorrelation)

    # SATELLITE
    "sector_energy",        # XLE — energy (haut yield cyclique)
    "emergents",            # VWO — EM dividendes (yield élevé)
]
```

---

## Bond presets

```python
PROFILE_PRESETS["Rendement"] = ["defensif_oblig", "tips_inflation"]
# Pas de HY — trop de risque de défaut pour un profil income
# TIPS pour protection inflation sur les revenus
```

---

## Sélection des actions — Ce qui change vs Modéré

| Critère | Modéré | Rendement |
|---|---|---|
| **dividend_yield_min** | Pas de filtre | **1.5% minimum** |
| **payout_ratio_max** | Pas de filtre | **95% maximum** |
| dividend_yield weight | +0.10 | **+0.25** (×2.5) |
| dividend_growth_3y weight | 0 | **+0.10** (nouveau) |
| quality_growth_sub weight | +0.10 | **0** (supprimé) |
| perf_3m weight | +0.03 | **0** (supprimé) |
| volatility_3y weight | -0.10 | -0.10 (identique) |

---

## Exemple de portefeuille Rendement attendu

### Actions (~50%)
| Ticker | Nom | Yield | Payout | Sector |
|---|---|---|---|---|
| VICI | VICI Properties | 6.5% | 68% | REIT |
| PGR | Progressive | 7.0% | 72% | Insurance |
| JNJ | Johnson & Johnson | 2.1% | 45% | Healthcare |
| PG | Procter & Gamble | 2.3% | 62% | Staples |
| XOM | ExxonMobil | 3.3% | 55% | Energy |
| KO | Coca-Cola | 2.8% | 70% | Staples |
| AXA | AXA SA | 5.5% | 63% | Insurance EU |
| RIO | Rio Tinto | 4.2% | 60% | Materials EU |
| CMCSA | Comcast | 5.8% | 18% | Telecom |
| TROW | T. Rowe Price | 5.8% | 65% | Finance |

### ETF (~25%)
| Ticker | Nom | Yield | Type |
|---|---|---|---|
| HDV | iShares High Dividend | 3.8% | US Dividend |
| SCHY | Schwab Intl Dividend | 4.2% | Intl Dividend |
| XLU | Utilities SPDR | 3.0% | Utilities |

### Obligations (~25%)
| Ticker | Nom | Yield | Type |
|---|---|---|---|
| VGSH | Vanguard Short Treasury | 4.3% | Short Gov |
| STIP | iShares TIPS 0-5Y | 3.8% | TIPS |
| VCIT | Vanguard Corp Bond | 4.5% | IG Corp |

### Métriques attendues
- **Yield portefeuille brut : ~4.0-5.0%**
- **Yield net CTO (après 30%) : ~2.8-3.5%**
- **Yield net PEA (après 17.2%) : ~3.3-4.1%**
- **Vol ex-ante : 8-10%**
- **Sharpe estimé : 0.8-1.2**
- **Carry Lombard net (taux 2.5%) : +0.3% à +1.0%**

---

## Fichiers à modifier

| Fichier | Modification |
|---|---|
| `portfolio_engine/optimizer.py` | Ajouter ProfileConstraints "Rendement" + PROFILE_BUCKET_TARGETS |
| `portfolio_engine/preset_meta.py` | Ajouter PROFILE_POLICY["Rendement"] + score_weights |
| `portfolio_engine/preset_etf.py` | Ajouter PROFILE_PRESET_PRIORITY["Rendement"] |
| `portfolio_engine/preset_bond.py` | Ajouter PROFILE_PRESETS["Rendement"] |
| `generate_portfolios_v4.py` | Ajouter "Rendement" dans la boucle des profils |
| `portefeuille.html` | Ajouter 5ème onglet |
| `portfolio-loader.js` | Config couleur/icône pour "Rendement" |
| `.github/workflows/generate_portfolios.yml` | Ajouter au commit si nécessaire |

---

## Risques et mitigations

| Risque | Mitigation |
|---|---|
| **Value trap** : haut yield = stock en chute | Hard filter `payout_ratio_max: 95%` + `quality_score_min: 40` |
| **Concentration sectorielle** : REITs + utilities dominent | `max_sector: 25%` + bucket diversification |
| **Sensibilité taux** : REITs et utilities souffrent si taux montent | TIPS en bonds + energy en satellite (hedge inflation) |
| **Cut de dividende** : une position coupe → perte de yield | 10+ positions actions minimum + `eps_surprise` dans le scoring |
| **Overlap avec Modéré** : trop similaire | `dividend_yield_min: 1.5%` filtre dur exclut les growth stocks |

---

## Question pour l'expert

1. **Vol target 9% ou 8% ?** Plus bas = plus de bonds, moins de yield actions
2. **Dividend yield minimum 1.5% ou 2.0% ?** 2.0% exclut MSFT, AAPL, mais c'est plus "pur income"
3. **REITs plafonnés ?** Les REITs ont les meilleurs yields mais sont sensibles aux taux. Max 15% REITs ?
4. **Actions EU incluses ?** Pour le PEA, c'est important. Faut-il un sous-filtre EU-only comme le Lombard ?
5. **Le profil doit-il être compatible avec le Lombard ?** Si oui, on optimise le carry net (yield − taux Lombard) au lieu du yield brut
