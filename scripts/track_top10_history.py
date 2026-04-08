#!/usr/bin/env python3
"""
track_top10_history.py — v9.1
Calcule le Top 10 actuel pour chaque profil et sauvegarde dans un historique JSON.

Lancé quotidiennement après que les données stocks_*.json soient à jour.
Permet de mesurer le score de stabilité de chaque action (jours présents
dans le Top 10 sur les 30 derniers jours).

Fichier de sortie : data/top10_history.json
Format :
{
    "2026-04-08": {
        "defensif": ["IMB", "NOVN", "IBE", ...],
        "rendement": ["LI", "VICI", ...],
        ...
    },
    "2026-04-07": { ... }
}
"""
import json
import os
from datetime import datetime, timedelta
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
HISTORY_FILE = os.path.join(DATA_DIR, 'top10_history.json')
PROFILES_CONFIG = os.path.join(DATA_DIR, 'profiles_config.json')
HISTORY_DAYS_KEEP = 90  # Buffer for stability calc on 30 days


# ============================================================================
# v9.2: Profiles loaded from data/profiles_config.json (single source of truth)
# Shared with mc-module.js (frontend) — eliminates desync risk.
# ============================================================================
def load_profiles():
    """Load profiles from JSON config. Returns (version, profiles_dict)."""
    if not os.path.exists(PROFILES_CONFIG):
        raise FileNotFoundError(
            f"❌ {PROFILES_CONFIG} not found. "
            f"Profiles config is required (v9.2+)."
        )
    with open(PROFILES_CONFIG) as f:
        config = json.load(f)
    version = config.get('version', 'unknown')
    profiles = config.get('profiles', {})
    print(f"📋 Loaded profiles config v{version} ({len(profiles)} profiles)")
    return version, profiles

# Direction: True = higher is better, False = lower is better
DIRECTION = {
    'perf_1m': True, 'perf_3m': True, 'ytd': True, 'perf_1y': True, 'perf_3y': True,
    'volatility_3y': False, 'max_drawdown_3y': False,
    'dividend_yield_reg': True, 'payout_ratio': False,
    'quality_score': True, 'buffett_score': True, 'eps_surprise': True,
}

# Field accessors (mirror mc-module.js METRICS)
def get_metric(stock, key):
    if key == 'perf_1m':           return _f(stock.get('perf_1m'))
    if key == 'perf_3m':           return _f(stock.get('perf_3m'))
    if key == 'ytd':               return _f(stock.get('perf_ytd') or stock.get('ytd'))
    if key == 'perf_1y':           return _f(stock.get('perf_1y'))
    if key == 'perf_3y':           return _f(stock.get('perf_3y') or stock.get('perf_3_years'))
    if key == 'volatility_3y':     return _f(stock.get('volatility_3y'))
    if key == 'max_drawdown_3y':   return _f(stock.get('max_drawdown_3y'))
    if key == 'dividend_yield_reg':return _f(stock.get('dividend_yield_regular') or stock.get('dividend_yield'))
    if key == 'payout_ratio':      return _f(stock.get('payout_ratio_ttm') or stock.get('payout_ratio'))
    if key == 'quality_score':     return _f(stock.get('quality_score'))
    if key == 'buffett_score':     return _f(stock.get('buffett_score'))
    if key == 'eps_surprise':      return _f(stock.get('eps_surprise_avg_2q'))
    return None


def _f(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(',', '.').replace('%', '').replace('+', '').strip())
    except (ValueError, TypeError):
        return None


# ============================================================================
# Liquidity filter (5 bps Russell)
# ============================================================================
def has_liquidity(stock):
    try:
        v = float(stock.get('volume') or 0)
        p = float(stock.get('price') or 0)
        c = float(stock.get('market_cap') or 0)
        if c <= 0:
            return True  # missing data → keep
        return (v * p / c) >= 0.0005
    except (ValueError, TypeError):
        return True


# ============================================================================
# Sector-neutral percentile ranking
# ============================================================================
SECTOR_MIN = 15

def compute_sector_neutral_pcts(stocks, metric_key):
    """Returns list of percentiles (0-100) per stock for one metric."""
    n = len(stocks)
    pcts = [None] * n

    # Group by sector
    sector_groups = defaultdict(list)
    for i, s in enumerate(stocks):
        sector_groups[s.get('sector') or '__UNK__'].append(i)
    eligible = {sec for sec, idxs in sector_groups.items() if len(idxs) >= SECTOR_MIN}

    # Get raw values
    values = [get_metric(s, metric_key) for s in stocks]
    hib = DIRECTION.get(metric_key, True)

    def rank_subset(indices):
        valid = [(i, values[i]) for i in indices if values[i] is not None]
        if len(valid) < 2:
            return {}
        valid.sort(key=lambda x: x[1] if hib else -x[1])
        ranks = {}
        k = 0
        while k < len(valid):
            j = k + 1
            while j < len(valid) and abs(valid[j][1] - valid[k][1]) < 1e-12:
                j += 1
            r = (k + j - 1) / 2
            hazen = (r + 0.5) / len(valid)
            for t in range(k, j):
                ranks[valid[t][0]] = hazen * 100
            k = j
        return ranks

    # Sector-relative for eligible sectors
    for sec in eligible:
        for i, p in rank_subset(sector_groups[sec]).items():
            pcts[i] = p

    # Global fallback for non-eligible
    rest = [i for i in range(n) if pcts[i] is None and values[i] is not None]
    if rest:
        for i, p in rank_subset(rest).items():
            pcts[i] = p

    return pcts


# ============================================================================
# Weighted scoring (mirror rankWeighted from mc-module.js)
# ============================================================================
def compute_top10(stocks, weights):
    """Returns list of 10 tickers ranked by weighted percentile score."""
    # Pre-compute percentiles per metric
    metric_pcts = {}
    for metric in weights:
        metric_pcts[metric] = compute_sector_neutral_pcts(stocks, metric)

    # Score each stock
    scores = []
    for i, s in enumerate(stocks):
        weighted_sum = 0
        total_weight = 0
        for metric, w in weights.items():
            p = metric_pcts[metric][i]
            if p is not None:
                weighted_sum += p * w
                total_weight += w
        if total_weight > 0:
            scores.append((i, weighted_sum / total_weight))

    scores.sort(key=lambda x: -x[1])
    return [stocks[i].get('ticker') for i, _ in scores[:10]]


# ============================================================================
# Main
# ============================================================================
def main():
    # v9.2: Load profiles from JSON config (single source of truth)
    try:
        version, profiles = load_profiles()
    except Exception as e:
        print(f"❌ Failed to load profiles config: {e}")
        return 1

    # Load all stocks
    all_stocks = []
    for region_file, region in [('stocks_us.json', 'US'),
                                ('stocks_europe.json', 'EUROPE'),
                                ('stocks_asia.json', 'ASIA')]:
        path = os.path.join(DATA_DIR, region_file)
        if not os.path.exists(path):
            print(f"⚠️  Skip missing file: {path}")
            continue
        try:
            with open(path) as f:
                data = json.load(f)
            for s in data.get('stocks', []):
                if s.get('ticker'):
                    s['region'] = region
                    all_stocks.append(s)
        except Exception as e:
            print(f"❌ Error loading {region_file}: {e}")

    print(f"📦 Loaded {len(all_stocks)} stocks")

    # Apply liquidity filter
    all_stocks = [s for s in all_stocks if has_liquidity(s)]
    print(f"💧 After liquidity filter: {len(all_stocks)} stocks")

    if len(all_stocks) == 0:
        print("❌ No stocks to process, abort")
        return 1

    # Compute Top 10 for each profile
    today = datetime.utcnow().strftime('%Y-%m-%d')
    today_snapshot = {
        '_profile_version': version,  # v9.2: version stamp on each snapshot
    }
    for profile_id, config in profiles.items():
        weights = config.get('weights', {})
        if not weights:
            continue
        top10 = compute_top10(all_stocks, weights)
        today_snapshot[profile_id] = top10
        print(f"   {profile_id:18s} → {' '.join(top10[:5])}...")

    # Load existing history
    history = {}
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE) as f:
                history = json.load(f)
        except Exception as e:
            print(f"⚠️  Could not load existing history: {e}, starting fresh")

    # Add today's snapshot (overwrites if same day)
    history[today] = today_snapshot

    # Prune old entries (keep last HISTORY_DAYS_KEEP days)
    cutoff = (datetime.utcnow() - timedelta(days=HISTORY_DAYS_KEEP)).strftime('%Y-%m-%d')
    history = {k: v for k, v in history.items() if k >= cutoff}

    # Save
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(HISTORY_FILE, 'w') as f:
        json.dump(history, f, indent=2)

    # Count snapshots matching current version
    matching_version = sum(
        1 for snap in history.values()
        if isinstance(snap, dict) and snap.get('_profile_version') == version
    )
    print(f"✅ History saved: {len(history)} days total, {matching_version} match v{version}")
    print(f"   File: {HISTORY_FILE}")
    return 0


if __name__ == '__main__':
    exit(main())
