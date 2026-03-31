"""
correlation_diagnostics.py — Generate correlation diagnostics JSON after portfolio generation.

Called by generate_portfolios_v4.py after all profiles are built.
Outputs data/correlation_diagnostics.json with:
- Per-profile weighted average correlation + top/bottom pairs
- Full correlation matrix across all portfolio tickers
- Exposure and family mapping for each pair

Usage:
    from portfolio_engine.correlation_diagnostics import generate_correlation_diagnostics
    generate_correlation_diagnostics(portfolios_dict, assets_list, cov_matrix)
"""

import json
import logging
import os
import time
from pathlib import Path
from typing import Dict, List, Optional, Any

import numpy as np

logger = logging.getLogger("portfolio_engine.correlation_diagnostics")


def generate_correlation_diagnostics(
    portfolios: Dict[str, dict],
    output_path: str = "data/correlation_diagnostics.json",
) -> Optional[dict]:
    """
    Generate correlation diagnostics from the current portfolios.

    Args:
        portfolios: The full portfolios dict (same as data/portfolios.json)
        output_path: Where to write the JSON

    Returns:
        The diagnostics dict, or None on failure
    """
    try:
        from portfolio_engine.optimizer import Asset, HybridCovarianceEstimator
        from portfolio_engine.price_loader import load_returns_for_assets
        from portfolio_engine.etf_exposure import TICKER_TO_EXPOSURE
        from portfolio_engine.correlation_map import get_family, get_exposure_correlation
    except ImportError as e:
        logger.warning(f"[corr_diag] Import failed: {e}")
        return None

    t0 = time.time()

    # 1. Collect all tickers across profiles
    all_tickers = {}
    for profile in ["Agressif", "Modéré", "Stable"]:
        if profile not in portfolios:
            continue
        meta = portfolios[profile].get("_tickers_meta", {})
        tickers = portfolios[profile].get("_tickers", {})
        for tk, info in meta.items():
            if tk not in all_tickers:
                all_tickers[tk] = {
                    "weight": {},
                    "category": info.get("category", "?"),
                    "name": info.get("name", tk),
                }
            all_tickers[tk]["weight"][profile] = round(tickers.get(tk, 0) * 100, 2)

    if len(all_tickers) < 3:
        logger.warning("[corr_diag] Too few tickers, skipping")
        return None

    # 2. Build assets
    assets = []
    for tk, info in sorted(all_tickers.items()):
        cat = info["category"]
        cat_norm = "Obligations" if cat == "Obligations" else \
                   "ETF" if cat == "ETF" else "Actions"
        vol_default = {"Obligations": 5.0, "ETF": 18.0}.get(cat_norm, 25.0)

        assets.append(Asset(
            id=tk, name=info["name"], category=cat_norm,
            sector="Unknown", region="US",
            score=50, vol_annual=vol_default, ticker=tk,
        ))

    # 3. Load returns
    api_key = os.environ.get("TWELVE_DATA_API")
    if api_key:
        assets = load_returns_for_assets(assets, cache_path="data/price_cache.json", max_age_hours=48)

    n_with_returns = sum(1 for a in assets if getattr(a, "returns_series", None) is not None)

    # 4. Compute covariance
    est = HybridCovarianceEstimator()
    cov, diag = est.compute(assets)

    tickers = [a.ticker for a in assets]
    n = len(tickers)
    vols = np.sqrt(np.maximum(np.diag(cov), 1e-12))
    corr = cov / np.outer(vols, vols)
    np.fill_diagonal(corr, 1.0)
    corr = np.clip(corr, -1, 1)

    # 5. Build all pairs
    pairs = []
    for i in range(n):
        for j in range(i + 1, n):
            exp_i = TICKER_TO_EXPOSURE.get(tickers[i].lower())
            exp_j = TICKER_TO_EXPOSURE.get(tickers[j].lower())
            fam_i = get_family(exp_i) if exp_i else None
            fam_j = get_family(exp_j) if exp_j else None

            corr_struct = None
            if exp_i and exp_j:
                corr_struct = get_exposure_correlation(exp_i, exp_j)

            pairs.append({
                "t1": tickers[i], "t2": tickers[j],
                "corr_hybrid": round(float(corr[i, j]), 4),
                "corr_structured": round(corr_struct, 4) if corr_struct is not None else None,
                "cat1": assets[i].category[:3],
                "cat2": assets[j].category[:3],
                "exp1": exp_i, "exp2": exp_j,
                "fam1": fam_i, "fam2": fam_j,
            })

    pairs.sort(key=lambda p: -abs(p["corr_hybrid"]))

    # 6. Per-profile analysis
    idx_map = {tk: i for i, tk in enumerate(tickers)}
    profile_corr = {}

    for profile in ["Agressif", "Modéré", "Stable"]:
        if profile not in portfolios:
            continue
        ptickers = portfolios[profile].get("_tickers", {})
        valid = [tk for tk in ptickers if tk in idx_map]

        pair_list = []
        for a_idx, tk_a in enumerate(valid):
            for b_idx, tk_b in enumerate(valid):
                if a_idx >= b_idx:
                    continue
                i, j = idx_map[tk_a], idx_map[tk_b]
                pair_list.append({
                    "t1": tk_a, "t2": tk_b,
                    "corr": round(float(corr[i, j]), 4),
                    "w1": round(ptickers.get(tk_a, 0) * 100, 1),
                    "w2": round(ptickers.get(tk_b, 0) * 100, 1),
                    "combined_weight": round((ptickers.get(tk_a, 0) + ptickers.get(tk_b, 0)) * 100, 1),
                })

        pair_list.sort(key=lambda p: -p["corr"])

        # Weighted average correlation
        total_w = 0
        wavg_corr = 0
        for p in pair_list:
            w = p["w1"] * p["w2"] / 10000
            wavg_corr += p["corr"] * w
            total_w += w
        wavg = wavg_corr / total_w if total_w > 0 else 0

        profile_corr[profile] = {
            "n_assets": len(valid),
            "weighted_avg_correlation": round(wavg, 4),
            "most_correlated": pair_list[:10],
            "least_correlated": pair_list[-5:] if len(pair_list) >= 5 else pair_list,
            "high_corr_high_weight": [
                p for p in pair_list if p["corr"] > 0.70 and p["combined_weight"] > 10
            ][:5],
        }

    # 7. Build output
    output = {
        "_meta": {
            "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "portfolio_generated": portfolios.get("_meta", {}).get("generated_at", "?"),
            "n_assets": n,
            "n_with_returns": n_with_returns,
            "covariance_method": diag.get("method", "?"),
            "condition_number": diag.get("condition_number"),
            "pca_factors": diag.get("pca_factors"),
        },
        "profiles": profile_corr,
        "all_pairs_top_30": pairs[:30],
        "all_pairs_bottom_10": pairs[-10:],
        "correlation_matrix": {
            "tickers": tickers,
            "matrix": [[round(float(corr[i, j]), 4) for j in range(n)] for i in range(n)],
        },
    }

    # 8. Save
    try:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w") as f:
            json.dump(output, f, indent=2)
        logger.info(f"[corr_diag] Saved {output_path} ({n} assets, {len(pairs)} pairs, {time.time()-t0:.1f}s)")
    except Exception as e:
        logger.warning(f"[corr_diag] Save failed: {e}")

    return output
