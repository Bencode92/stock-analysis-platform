# Smart Politician Portfolio — module `congress/`

Section autonome « copie des politiciens réguliers » pour TradePulse.
Tout le module vit sous `congress/` ; seul le workflow CI est dans `.github/workflows/`.

```
congress/
├── congress_fetch.py        # etage 1
├── politician_rank.py       # etage 2
├── schemas/                 # 3 contrats de la pipeline
└── data/                    # genere par la CI (cache + leaderboard)
.github/workflows/congress-pipeline.yml
```

## Pipeline (rappel)

| Etage | Fichier | Entree | Sortie |
|------|---------|--------|--------|
| 1. Listing | `congress/congress_fetch.py` | API Quiver | `congress/data/congress_trades.json` |
| 2. Ranking | `congress/politician_rank.py` | `congress_trades.json` | `congress/data/politician_leaderboard.json` |
| 3. Portfolio | *(à venir)* `congress/congress_portfolio.py` | leaderboard | `congress_portfolio.json` |
| 4. Backtest | *(à venir)* `congress/congress_backtest.py` | portfolio + Twelve Data | rapport |

## Mise en route

### En local
```bash
pip install quiverquant pandas numpy
export QUIVERAPI="ta_cle_quiver"          # nom du secret TradePulse (plan API Hobbyist 30$/mo)

python congress/congress_fetch.py             # -> congress/data/congress_trades.json
python congress/politician_rank.py --top 20   # -> congress/data/politician_leaderboard.json + Top 20
```

### En CI (GitHub Actions) — mode retenu
Le workflow `.github/workflows/congress-pipeline.yml` fait tourner les etages 1+2
tous les jours (cron 06:00 UTC) + bouton manuel, et recommit les JSON generes.
Secrets repo utilises : **`QUIVERAPI`** (et `TWELVE_DATA_API` pour l'etage 4 a venir).
Le script lit `QUIVERAPI` en priorite, sinon `QUIVER_API_KEY`.

## Garde-fous deja cables dans le code

- **Anti look-ahead** : le ranking horodate les trades sur `report_date` (date de
  declaration), jamais `transaction_date`. La surperf `ExcessReturn` de Quiver est
  deja calee sur ce principe.
- **Anti performance-chasing** : le score = REGULARITE (mediane annuelle + constance),
  pas le rendement brut d'une annee.
- **Anti-chance** : filtres `min_distinct_tickers` et `min_active_years` ecartent le
  +71% one-shot sur 2 titres.
- **Reproductibilite** : tous les parametres de score sont traces dans `meta.params`.

## Mapping des champs Quiver -> schema

| Quiver (brut) | Notre champ | Note |
|---------------|-------------|------|
| Representative | representative | |
| BioGuideID | bioguide_id | cle de jointure fiable (le nom varie) |
| TransactionDate | transaction_date | **execution** — JAMAIS l'entree backtest |
| ReportDate | report_date | **declaration** — l'entree backtest |
| Transaction | transaction | normalise Purchase/Sale -> buy/sell |
| Range | amount_min/max | "$1,001 - $15,000" -> 1001 / 15000 |
| ExcessReturn | excess_return | surperf vs SPY, pre-calculee |
| PriceChange / SPYChange | price_change / spy_change | |

## Reglage du score (`ml/politician_rank.py`)

Defauts dans `DEFAULTS`. Surchargeables en CLI :
`--min-trades`, `--min-tickers`, `--min-years`. Les poids
(median_return / consistency / diversity / sample) se modifient dans `DEFAULTS["weights"]`.

## Prochaine etape

Une fois la cle Quiver en place et le Top 20 valide, on enchaine sur
l'etage 3 (construction portefeuille, ponderation par `regularity_score`)
puis l'etage 4 (backtest vs QQQ / NANC via Twelve Data, validation walk-forward).
