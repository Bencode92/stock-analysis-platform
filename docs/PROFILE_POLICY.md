# PROFILE_POLICY — source de vérité

_Généré le 2026-06-11 11:26 depuis `portfolio_engine/preset_meta.py`._

Toute divergence entre ce document et un brief/audit doit être tranchée en faveur du code. Régénérer ce fichier après toute modification de `PROFILE_POLICY` :

```bash
python3 scripts/dump_policy_to_markdown.py
```

## Vue synthétique — profils principaux

| Profil | Gate | min_buffett | min_quality | Vol band | Equity weight |
|---|---|---:|---:|---|---|
| **Stable** | AND | 70 | 62 | — – 28.0 | 25–45% |
| **Modéré** | AND | 65 | 65 | 12.0 – 45.0 | 40–60% |
| **Agressif** | OR | 60 | 55 | 22.0 – 120.0 | 50–75% |

## Stable

_Profil défensif, faible volatilité, haut dividende_

**Vol attendue (cible)** : (6, 10)

### Gates qualité

- `min_buffett_score` : **70**
- `min_quality_gate` : **62**
- `gate_logic` : **AND**
- `allowed_equity_presets` : `defensif`, `low_volatility`, `quality_premium`, `rendement`, `value_dividend`

### Hard filters

| Filtre | Valeur |
|---|---:|
| `dividend_coverage_min` | 1.0 |
| `dividend_yield_min` | 0.5 |
| `fcf_yield_min` | 0.0 |
| `payout_ratio_max` | 85.0 |
| `perf_3y_min` | -5.0 |
| `quality_coverage_min` | 70 |
| `quality_score_min` | 50 |
| `roe_min` | 10.0 |
| `volatility_3y_max` | 28.0 |

### Score weights (pondération du fit_score)

| Facteur | Poids | % absolu | Cumul |
|---|---:|---:|---:|
| `buffett_score` | +0.200 | 18.2% | 18.2% |
| `quality_safety_sub` | +0.200 | 18.2% | 36.4% |
| `volatility_3y` | -0.200 | 18.2% | 54.5% |
| `dividend_yield` | +0.150 | 13.6% | 68.2% |
| `max_drawdown_3y` | -0.100 | 9.1% | 77.3% |
| `quality_quality_sub` | +0.050 | 4.5% | 81.8% |
| `quality_value_sub` | +0.050 | 4.5% | 86.4% |
| `eps_growth_forecast_5y` | +0.050 | 4.5% | 90.9% |
| `dividend_growth_3y` | +0.050 | 4.5% | 95.5% |
| `perf_1y` | +0.050 | 4.5% | 100.0% |

### Bucket targets (allocation par rôle)

| Bucket | Min | Max |
|---|---:|---:|
| core | 15% | 40% |
| defensive | 50% | 85% |
| satellite | 0% | 10% |
| lottery | 0% | 0% |

### Region caps

| Région | Cap |
|---|---:|
| ASIA_EX_IN | 8% |
| EU | 20% |
| IN | 8% |
| LATAM | 5% |
| OTHER | 10% |
| US | 25% |

### Limites de relaxation

| Paramètre | Plancher/Plafond |
|---|---:|
| `quality_score_min` | 40.0 |
| `roe_min` | 5.0 |
| `volatility_3y_max` | 35.0 |

## Modéré

_Profil équilibré qualité/momentum, risque maîtrisé_

**Vol attendue (cible)** : (10, 15)

### Gates qualité

- `min_buffett_score` : **65**
- `min_quality_gate` : **65**
- `gate_logic` : **AND**
- `allowed_equity_presets` : `croissance`, `defensif`, `low_volatility`, `momentum_trend`, `quality_premium`, `rendement`, `value_dividend`

### Hard filters

| Filtre | Valeur |
|---|---:|
| `de_ratio_max` | 2.0 |
| `perf_3y_min` | -40.0 |
| `quality_coverage_min` | 70 |
| `quality_score_min` | 40 |
| `roe_min` | 8.0 |
| `volatility_3y_max` | 45.0 |
| `volatility_3y_min` | 12.0 |

### Score weights (pondération du fit_score)

| Facteur | Poids | % absolu | Cumul |
|---|---:|---:|---:|
| `buffett_score` | +0.220 | 21.4% | 21.4% |
| `quality_safety_sub` | +0.120 | 11.7% | 33.0% |
| `quality_quality_sub` | +0.100 | 9.7% | 42.7% |
| `volatility_3y` | -0.100 | 9.7% | 52.4% |
| `max_drawdown_3y` | -0.100 | 9.7% | 62.1% |
| `quality_value_sub` | +0.080 | 7.8% | 69.9% |
| `quality_growth_sub` | +0.080 | 7.8% | 77.7% |
| `eps_growth_forecast_5y` | +0.080 | 7.8% | 85.4% |
| `eps_surprise` | +0.050 | 4.9% | 90.3% |
| `perf_1y` | +0.040 | 3.9% | 94.2% |
| `dividend_yield` | +0.030 | 2.9% | 97.1% |
| `perf_3m` | +0.030 | 2.9% | 100.0% |

### Bucket targets (allocation par rôle)

| Bucket | Min | Max |
|---|---:|---:|
| core | 50% | 70% |
| defensive | 10% | 25% |
| satellite | 10% | 25% |
| lottery | 0% | 2% |

### Region caps

| Région | Cap |
|---|---:|
| ASIA_EX_IN | 10% |
| EU | 25% |
| IN | 10% |
| LATAM | 8% |
| OTHER | 12% |
| US | 30% |

### Limites de relaxation

| Paramètre | Plancher/Plafond |
|---|---:|
| `roe_min` | 3.0 |
| `volatility_3y_max` | 48.0 |

## Agressif

_Profil croissance fondamentale (v6.1 — fondamental dominant, momentum 5% anti-value-trap)_

**Vol attendue (cible)** : (15, 22)

### Gates qualité

- `min_buffett_score` : **60**
- `min_quality_gate` : **55**
- `gate_logic` : **OR**
- `allowed_equity_presets` : `agressif`, `croissance`, `defensif`, `momentum_trend`, `quality_high_vol`, `recovery`

### Hard filters

| Filtre | Valeur |
|---|---:|
| `quality_coverage_min` | 60 |
| `roe_min` | 0.0 |
| `volatility_3y_max` | 120.0 |
| `volatility_3y_min` | 22.0 |

### Score weights (pondération du fit_score)

| Facteur | Poids | % absolu | Cumul |
|---|---:|---:|---:|
| `buffett_score` | +0.220 | 24.2% | 24.2% |
| `quality_quality_sub` | +0.120 | 13.2% | 37.4% |
| `eps_growth_forecast_5y` | +0.110 | 12.1% | 49.5% |
| `quality_value_sub` | +0.100 | 11.0% | 60.4% |
| `quality_growth_sub` | +0.100 | 11.0% | 71.4% |
| `eps_surprise` | +0.100 | 11.0% | 82.4% |
| `quality_safety_sub` | +0.060 | 6.6% | 89.0% |
| `max_drawdown_3y` | -0.050 | 5.5% | 94.5% |
| `perf_1y` | +0.030 | 3.3% | 97.8% |
| `perf_3m` | +0.020 | 2.2% | 100.0% |

### Bucket targets (allocation par rôle)

| Bucket | Min | Max |
|---|---:|---:|
| core | 30% | 50% |
| defensive | 5% | 15% |
| satellite | 35% | 55% |
| lottery | 0% | 5% |

### Region caps

| Région | Cap |
|---|---:|
| ASIA_EX_IN | 15% |
| EU | 30% |
| IN | 15% |
| LATAM | 10% |
| OTHER | 15% |
| US | 35% |

### Limites de relaxation

_(aucune limite spécifique — limites globales s'appliquent)_

## Autres profils

### Dividende-PEA

_Profil rendement dividende+qualité — enveloppe PEA > 5 ans_

- `min_buffett_score` : 55
- `min_quality_gate` : 60

**Hard filters**

| Filtre | Valeur |
|---|---:|
| `dividend_coverage_min` | 1.3 |
| `dividend_yield_max` | 8.0 |
| `dividend_yield_min` | 2.5 |
| `fcf_yield_min` | 2.0 |
| `payout_ratio_max` | 75.0 |
| `quality_coverage_min` | 65 |
| `quality_score_min` | 60 |
| `roe_min` | 10.0 |
| `volatility_3y_max` | 35.0 |

**Score weights**

| Facteur | Poids | % absolu | Cumul |
|---|---:|---:|---:|
| `quality_safety_sub` | +0.200 | 20.0% | 20.0% |
| `quality_quality_sub` | +0.180 | 18.0% | 38.0% |
| `dividend_growth_3y` | +0.170 | 17.0% | 55.0% |
| `dividend_yield` | +0.120 | 12.0% | 67.0% |
| `volatility_3y` | -0.100 | 10.0% | 77.0% |
| `max_drawdown_3y` | -0.100 | 10.0% | 87.0% |
| `dividend_coverage` | +0.050 | 5.0% | 92.0% |
| `quality_value_sub` | +0.050 | 5.0% | 97.0% |
| `perf_1y` | +0.030 | 3.0% | 100.0% |

### Dividende-CTO

_Profil rendement dividende+qualité — enveloppe CTO (US/UK/CH)_

- `min_buffett_score` : 55
- `min_quality_gate` : 60

**Hard filters**

| Filtre | Valeur |
|---|---:|
| `dividend_coverage_min` | 1.3 |
| `dividend_yield_max` | 8.0 |
| `dividend_yield_min` | 2.5 |
| `fcf_yield_min` | 2.0 |
| `payout_ratio_max` | 75.0 |
| `quality_coverage_min` | 65 |
| `quality_score_min` | 60 |
| `roe_min` | 10.0 |
| `volatility_3y_max` | 35.0 |

**Score weights**

| Facteur | Poids | % absolu | Cumul |
|---|---:|---:|---:|
| `quality_safety_sub` | +0.200 | 20.0% | 20.0% |
| `quality_quality_sub` | +0.180 | 18.0% | 38.0% |
| `dividend_growth_3y` | +0.170 | 17.0% | 55.0% |
| `dividend_yield` | +0.120 | 12.0% | 67.0% |
| `volatility_3y` | -0.100 | 10.0% | 77.0% |
| `max_drawdown_3y` | -0.100 | 10.0% | 87.0% |
| `dividend_coverage` | +0.050 | 5.0% | 92.0% |
| `quality_value_sub` | +0.050 | 5.0% | 97.0% |
| `perf_1y` | +0.030 | 3.0% | 100.0% |

