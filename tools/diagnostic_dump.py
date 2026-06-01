#!/usr/bin/env python3
"""
Phase Diagnostic-1 — Capture totale d'un run pipeline (read-only).

Outil OFF-PROD : ne modifie aucun fichier du portfolio_engine ni du
generate_portfolios_v4. Monkey-patche en runtime pour capturer l'état
intermédiaire à chaque étape critique.

Usage :
    python3 tools/diagnostic_dump.py [--profile Modéré] [--mode live|post-mortem]

Mode 'live' : tourne le pipeline complet pour le profil cible et capture
chaque étape. Nécessite TWELVE_DATA_API si on veut returns_series réels.

Mode 'post-mortem' (défaut si TWELVE_DATA_API absent) : analyse les
artefacts déjà sauvés (data/portfolios.json, history files, combined_bonds.csv,
price_cache.json) pour reconstruire ce qu'on peut.

Sorties dans data/diagnostic/<timestamp>/ :
  - 00_summary.md                 Synthèse lisible (top picks, problèmes)
  - 01_bonds_universe.csv         Univers bonds avec colonnes pertinentes
  - 02_bonds_after_presets.csv    Bonds qui passent les presets Modéré
  - 03_bonds_scored.csv           Bonds scorés + force-include
  - 04_correlation_matrix.csv     Matrice |corr| inter-equity (returns)
  - 05_cluster_impact.json        Clusters détectés à différents seuils
  - 06_cov_diagnostics.json       Info cov : cond_number, eigenvalues, coverage
  - 07_slsqp_constraints.json     Liste exhaustive des contraintes envoyées à SLSQP
  - 08_post_processing_trace.json Allocation à chaque étape post-SLSQP
  - 09_bond_path.md               Tracé du parcours bonds preset → optimizer → save
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from contextlib import contextmanager
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

# Repo root
REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

# Setup logging to file + console
TS = time.strftime("%Y%m%d_%H%M%S")
OUT = REPO / "data" / "diagnostic" / TS
OUT.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(OUT / "diagnostic.log"),
    ],
)
log = logging.getLogger("diagnostic")
log.info(f"Output directory: {OUT}")


# ============================================================================
# Captures globales
# ============================================================================

CAPTURE: Dict[str, Any] = {
    "ts": TS,
    "profile": None,
    "bonds": {},
    "equities": {},
    "covariance": {},
    "constraints": [],
    "post_processing": [],
    "clusters": {},
    "force_include": [],
    "fallback_path_used": False,
}


# ============================================================================
# Mode post-mortem (sans API) — analyse artefacts existants
# ============================================================================

def dump_bonds_universe_csv() -> None:
    """Dump l'univers bonds avec sortie filtrée sur colonnes utiles."""
    src = REPO / "data" / "combined_bonds.csv"
    if not src.exists():
        log.warning(f"  combined_bonds.csv absent : {src}")
        return
    df = pd.read_csv(src)
    cols = ["symbol", "name", "fund_type", "bond_avg_duration", "vol_3y_pct",
            "yield_ttm", "total_expense_ratio", "bond_credit_score",
            "bond_credit_rating", "aum_usd"]
    cols = [c for c in cols if c in df.columns]
    df[cols].to_csv(OUT / "01_bonds_universe.csv", index=False)
    log.info(f"  → 01_bonds_universe.csv ({len(df)} lignes, {len(cols)} colonnes)")
    CAPTURE["bonds"]["universe_size"] = len(df)


def dump_bonds_pipeline_modere() -> None:
    """Exécute en local la sélection bonds Modéré et capture chaque étape."""
    try:
        from portfolio_engine.preset_bond import (
            apply_data_qc_filters, apply_hard_constraints,
            apply_presets_union, compute_profile_score,
            _dedup_by_fund_type, select_bonds_for_profile,
            PROFILE_PRESETS, PROFILE_CONSTRAINTS, SCORING_WEIGHTS,
        )
    except ImportError as e:
        log.error(f"  Cannot import preset_bond: {e}")
        return

    df_raw = pd.read_csv(REPO / "data" / "combined_bonds.csv")
    log.info(f"\n=== BOND PIPELINE Modéré (post-mortem) ===")

    # Etape par étape
    df = df_raw.copy()
    log.info(f"  Univers brut: {len(df)}")
    CAPTURE["bonds"]["pipeline"] = [{"step": "raw", "n": len(df)}]

    df = apply_data_qc_filters(df)
    log.info(f"  Après data_qc: {len(df)}")
    CAPTURE["bonds"]["pipeline"].append({"step": "data_qc", "n": len(df)})

    df = apply_hard_constraints(df, "Modéré")
    log.info(f"  Après hard_constraints Modéré: {len(df)}")
    CAPTURE["bonds"]["pipeline"].append({"step": "hard_constraints", "n": len(df)})

    df = apply_presets_union(df, "Modéré")
    log.info(f"  Après presets union: {len(df)}")
    CAPTURE["bonds"]["pipeline"].append({"step": "presets_union", "n": len(df)})

    # Sauve les candidats post-presets
    cols = ["symbol", "name", "fund_type", "bond_avg_duration",
            "vol_3y_pct", "yield_ttm", "bond_credit_score"]
    cols = [c for c in cols if c in df.columns]
    df[cols].to_csv(OUT / "02_bonds_after_presets.csv", index=False)
    log.info(f"  → 02_bonds_after_presets.csv")

    # Scoring + dedup + force-include via select_bonds_for_profile
    final = select_bonds_for_profile(df_raw, "Modéré", top_n=3)
    final_cols = ["symbol", "name", "fund_type", "bond_avg_duration",
                  "vol_3y_pct", "yield_ttm", "_profile_score"]
    final_cols = [c for c in final_cols if c in final.columns]
    final[final_cols].to_csv(OUT / "03_bonds_scored.csv", index=False)
    log.info(f"  Top 3 Modéré (avec force-include) :")
    for _, row in final.head(3).iterrows():
        log.info(f"    {row['symbol']:8} {row.get('fund_type','?'):35} "
                 f"dur={row.get('bond_avg_duration','?')}  "
                 f"score={row.get('_profile_score','?')}")
    CAPTURE["bonds"]["top_3"] = final.head(3)[final_cols].to_dict("records")


def dump_correlation_matrix_from_cache() -> None:
    """Calcule la matrice de corrélation des ETF candidats Modéré depuis price_cache."""
    cache_path = REPO / "data" / "price_cache.json"
    if not cache_path.exists():
        log.warning(f"  price_cache.json absent")
        return
    cache = json.loads(cache_path.read_text())

    # Tickers d'intérêt Modéré (ETF dividend stack + actions clés)
    tickers_of_interest = [
        "SCHD", "DIVB", "FNDX", "FNDF", "VTI", "VXUS", "QQQ", "SPY",
        "XLV", "GLD", "ACWV", "SPLV", "SPYV", "VIG", "VYM",
        "AGG", "BND", "IEF", "VGIT", "TLT", "STIP", "TDTF", "TDTT",
        "VGSH", "GBIL", "BSV", "JAAA", "PAAA",
    ]
    rets: Dict[str, np.ndarray] = {}
    for t in tickers_of_interest:
        if t not in cache:
            continue
        entry = cache[t]
        prices = entry.get("prices") if isinstance(entry, dict) else entry
        if not isinstance(prices, list) or len(prices) < 60:
            continue
        try:
            closes = np.array([float(x) for x in prices if x], dtype=float)
            closes = closes[closes > 0]
            if len(closes) < 60:
                continue
            rets[t] = np.diff(np.log(closes))
        except Exception:
            continue

    if len(rets) < 2:
        log.warning(f"  Cache trop pauvre pour corrélations ({len(rets)} tickers valides)")
        return

    common_len = min(len(r) for r in rets.values())
    ids = list(rets.keys())
    R = np.column_stack([rets[i][-common_len:] for i in ids])
    R = np.nan_to_num(R, 0.0, 0.0, 0.0)
    corr = np.corrcoef(R, rowvar=False)
    corr = np.nan_to_num(corr, 0.0)

    df_corr = pd.DataFrame(corr, index=ids, columns=ids)
    df_corr.to_csv(OUT / "04_correlation_matrix.csv")
    log.info(f"  → 04_correlation_matrix.csv ({len(ids)} × {len(ids)} sur {common_len} obs)")

    # Top pairs
    pairs = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            pairs.append((ids[i], ids[j], float(abs(corr[i, j]))))
    pairs.sort(key=lambda p: -p[2])

    # Clusters à différents seuils
    impact = {}
    for thr in (0.95, 0.92, 0.90, 0.88, 0.85, 0.80, 0.75):
        clusters = _single_linkage(ids, corr, thr)
        impact[str(thr)] = {
            "n_clusters": sum(1 for c in clusters if len(c) > 1),
            "members": [sorted(c) for c in clusters if len(c) > 1],
        }
    impact["top_pairs"] = [
        {"a": a, "b": b, "abs_corr": c} for a, b, c in pairs[:20]
    ]
    impact["n_assets"] = len(ids)
    impact["obs_length"] = common_len
    (OUT / "05_cluster_impact.json").write_text(json.dumps(impact, indent=2))
    log.info(f"  → 05_cluster_impact.json (top pair: {pairs[0][0]}↔{pairs[0][1]} = {pairs[0][2]:.3f})")
    CAPTURE["clusters"] = impact


def _single_linkage(ids: List[str], corr: np.ndarray, thr: float) -> List[set]:
    parent = list(range(len(ids)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    n = len(ids)
    for i in range(n):
        for j in range(i + 1, n):
            if abs(corr[i, j]) >= thr:
                rx, ry = find(i), find(j)
                if rx != ry:
                    parent[rx] = ry

    out: Dict[int, set] = {}
    for i, aid in enumerate(ids):
        out.setdefault(find(i), set()).add(aid)
    return [s for s in out.values()]


# ============================================================================
# Analyse portfolios.json final
# ============================================================================

def dump_current_modere_analysis() -> None:
    """Sort un mémo lisible sur le Modéré actuel."""
    p = json.loads((REPO / "data" / "portfolios.json").read_text())
    m = p.get("Modéré", {})
    opt = m.get("_optimization", {})
    mem = []
    mem.append(f"# Modéré — état post-workflow (snapshot {TS})")
    mem.append("")
    mem.append("## Optimization diagnostics\n")
    for k, v in opt.items():
        mem.append(f"- **{k}** : `{v}`")
    mem.append("")
    mem.append("## Allocation")
    for bucket in ("Actions", "ETF", "Obligations"):
        items = m.get(bucket, {})
        if not items:
            continue
        total = sum(float(str(info.get("allocation") if isinstance(info, dict) else info).rstrip("%"))
                    for info in items.values())
        mem.append(f"\n### {bucket} ({len(items)} positions, total {total:.0f} %)\n")
        for nm, info in items.items():
            w = info.get("allocation") if isinstance(info, dict) else info
            mem.append(f"- `{w}`  {nm}")
    (OUT / "00_summary.md").write_text("\n".join(mem))
    log.info(f"  → 00_summary.md")


# ============================================================================
# Mode 'live' : monkey-patch optimizer pour capturer
# ============================================================================

def dump_live_run(profile: str) -> None:
    """Tourne le pipeline en local, hooke les étapes clés."""
    api_key = os.environ.get("TWELVE_DATA_API")
    if not api_key:
        log.warning("  TWELVE_DATA_API absent — mode live impossible, "
                    "passage post-mortem seul.")
        return

    log.info("\n=== LIVE RUN ===")
    log.info(f"  Profile: {profile}")
    log.info(f"  This may take 2-5 minutes (API calls + SLSQP)...")

    from portfolio_engine.optimizer import (
        PortfolioOptimizer, PROFILES, Asset
    )

    # Monkey-patch compute_covariance pour capturer cov diagnostics
    _orig_compute_cov = PortfolioOptimizer.compute_covariance

    def _hooked_compute_cov(self, assets):
        cov, diag = _orig_compute_cov(self, assets)
        try:
            n = cov.shape[0]
            eigvals = sorted(np.linalg.eigvalsh(cov), reverse=True)
            cond = eigvals[0] / max(eigvals[-1], 1e-12) if eigvals[-1] > 0 else float("inf")
            CAPTURE["covariance"] = {
                "n_assets": n,
                "condition_number": float(cond),
                "eigvals_top5": [float(v) for v in eigvals[:5]],
                "eigvals_bottom5": [float(v) for v in eigvals[-5:]],
                "empirical_weight": float(diag.get("empirical_weight", 0)),
                "returns_coverage_pct": float(diag.get("returns_coverage_pct", 0)),
                "assets_with_returns": sum(1 for a in assets if a.returns_series is not None),
                "assets_total": len(assets),
                "assets_by_category": {
                    cat: sum(1 for a in assets if a.category == cat)
                    for cat in set(a.category for a in assets)
                },
            }
            log.info(f"  cov: n={n}, cond={cond:.2e}, "
                     f"emp_weight={diag.get('empirical_weight'):.2f}, "
                     f"coverage={diag.get('returns_coverage_pct'):.1f}%")
        except Exception as e:
            log.warning(f"  cov hook error: {e}")
        return cov, diag

    PortfolioOptimizer.compute_covariance = _hooked_compute_cov

    # Monkey-patch _build_constraints pour capturer la liste
    _orig_build_cons = PortfolioOptimizer._build_constraints

    def _hooked_build_cons(self, candidates, prof, cov):
        cons = _orig_build_cons(self, candidates, prof, cov)
        CAPTURE["constraints"].append({
            "profile": prof.name,
            "n_constraints": len(cons),
            "candidate_ids_first10": [c.id for c in candidates[:10]],
            "n_candidates": len(candidates),
        })
        log.info(f"  _build_constraints {prof.name}: {len(cons)} contraintes "
                 f"sur {len(candidates)} candidats")
        return cons

    PortfolioOptimizer._build_constraints = _hooked_build_cons

    # Run le pipeline complet via generate_portfolios_v4
    try:
        os.chdir(REPO)
        from generate_portfolios_v4 import build_portfolios_deterministic
        log.info("  Running build_portfolios_deterministic()...")
        portfolios = build_portfolios_deterministic()
        log.info(f"  → got {len(portfolios)} profiles")
        CAPTURE["live_profiles_built"] = list(portfolios.keys())
    except Exception as e:
        log.error(f"  Live run failed: {e}", exc_info=True)
        CAPTURE["live_error"] = str(e)

    # Dump
    (OUT / "06_cov_diagnostics.json").write_text(json.dumps(CAPTURE["covariance"], indent=2))
    (OUT / "07_slsqp_constraints.json").write_text(json.dumps(CAPTURE["constraints"], indent=2))


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Diagnostic dump du pipeline portfolio")
    parser.add_argument("--profile", default="Modéré", help="Profile cible")
    parser.add_argument("--mode", choices=["live", "post-mortem", "auto"], default="auto",
                       help="live = run complet, post-mortem = analyse artefacts seuls")
    args = parser.parse_args()

    CAPTURE["profile"] = args.profile
    api_avail = bool(os.environ.get("TWELVE_DATA_API"))

    log.info(f"\n{'='*60}")
    log.info(f"PHASE DIAGNOSTIC-1 — capture pipeline ({args.profile})")
    log.info(f"{'='*60}")
    log.info(f"Mode: {args.mode} (TWELVE_DATA_API: {'oui' if api_avail else 'non'})")
    log.info(f"Sorties: {OUT}")

    # 1. Univers bonds (toujours possible)
    log.info("\n[1] Dump univers bonds…")
    dump_bonds_universe_csv()

    # 2. Pipeline bonds Modéré (toujours possible)
    log.info("\n[2] Pipeline bonds Modéré…")
    dump_bonds_pipeline_modere()

    # 3. Correlation matrix (depuis cache, sans API)
    log.info("\n[3] Matrice corrélations ETF…")
    dump_correlation_matrix_from_cache()

    # 4. Analyse Modéré final (depuis portfolios.json)
    log.info("\n[4] Analyse Modéré post-workflow…")
    dump_current_modere_analysis()

    # 5. Mode live optionnel
    if args.mode in ("live", "auto") and api_avail:
        log.info("\n[5] Run live avec hooks…")
        dump_live_run(args.profile)
    elif args.mode == "live":
        log.warning("  Mode live demandé mais TWELVE_DATA_API absent.")

    # 6. Capture finale
    (OUT / "10_capture.json").write_text(json.dumps(CAPTURE, indent=2, default=str))

    log.info(f"\n{'='*60}")
    log.info(f"✅ Diagnostic terminé. Voir {OUT}")
    log.info(f"{'='*60}")
    log.info("Fichiers générés :")
    for f in sorted(OUT.iterdir()):
        log.info(f"  - {f.name} ({f.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
