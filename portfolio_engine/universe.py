# portfolio_engine/universe.py
"""
Construction de l'univers d'actifs scorés v2.0.
Extrait de generate_portfolios.py — logique préservée et améliorée.

v2.0: Intègre les nouvelles métriques:
- ROIC (depuis stock-filter-by-volume.js)
- FCF Yield (depuis stock-advanced-filter.js)
- EPS Growth 5Y (depuis stock-advanced-filter.js)
"""

import re
import math
import json
import logging
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, List, Any, Optional, Union
from collections import defaultdict

# Import du filtre Buffett v2.0
from .sector_quality import (
    apply_buffett_filter, 
    get_sector_summary,
    get_fundamentals_coverage,
)

logger = logging.getLogger("portfolio_engine.universe")


# ============= HELPERS NUMÉRIQUES =============

def fnum(x) -> float:
    """Conversion robuste vers float."""
    if x is None:
        return 0.0
    if isinstance(x, (int, float)):
        return float(x)
    s = re.sub(r"[^0-9.\-]", "", str(x))
    try:
        return float(s) if s not in ("", "-", ".", "-.") else 0.0
    except:
        return 0.0


def winsorize(arr: np.ndarray, percentile: float = 0.02) -> np.ndarray:
    """Winsorisation pour éliminer les outliers."""
    if len(arr) == 0:
        return np.array([])
    arr = np.nan_to_num(arr, nan=0.0)
    lo, hi = np.nanpercentile(arr, [percentile * 100, 100 - percentile * 100])
    return np.clip(arr, lo, hi)


def zscore(arr: List[float]) -> np.ndarray:
    """Z-score normalisé avec winsorisation."""
    v = np.array([fnum(a) for a in arr], dtype=float)
    if len(v) == 0:
        return v
    v = winsorize(v)
    mu, sd = np.nanmean(v), np.nanstd(v)
    if sd < 1e-8:
        return np.zeros_like(v)
    return (v - mu) / sd


# ============= DÉTECTION ETF LEVIER =============

LEVERAGED_PATTERN = re.compile(
    r"(?:2x|3x|ultra|lev|leverage|inverse|bear|-1x|-2x|-3x)", 
    re.IGNORECASE
)


def is_leveraged_etf(name: str, etf_type: str = "", leverage_field: str = "") -> bool:
    """Détecte les ETF à effet de levier."""
    lev = str(leverage_field).strip().lower()
    if lev not in ("", "0", "none", "nan", "na", "n/a"):
        return True
    
    if LEVERAGED_PATTERN.search(name or ""):
        return True
    if LEVERAGED_PATTERN.search(etf_type or ""):
        return True
    
    return False


# ============= CHARGEMENT ETF =============

def load_etf_csv(path: str) -> pd.DataFrame:
    """
    Charge et prépare les ETF depuis CSV.
    Ajoute les colonnes is_bond et is_leveraged.
    """
    df = pd.read_csv(path)
    
    # Colonnes numériques
    num_cols = [
        "daily_change_pct", "ytd_return_pct", "one_year_return_pct",
        "vol_pct", "vol_3y_pct", "aum_usd", "total_expense_ratio"
    ]
    for c in num_cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    
    # Colonne name (fallback)
    name_col = next(
        (c for c in ["name", "long_name", "etf_name", "symbol", "ticker"] if c in df.columns),
        None
    )
    if name_col is None:
        df["name"] = [f"ETF_{i}" for i in range(len(df))]
    else:
        df["name"] = df[name_col].astype(str)
    
    # Détection obligations
    def _series(col, default=""):
        return df[col] if col in df.columns else pd.Series(default, index=df.index)
    
    df["is_bond"] = (
        _series("fund_type").str.contains(r"Bond|Fixed Income|Obligation", case=False, na=False)
        | _series("etf_type").str.contains(r"Bond|Fixed Income|Obligation", case=False, na=False)
        | _series("category").str.contains(r"Bond|Fixed Income|Obligation", case=False, na=False)
    )
    
    # Détection levier
    df["is_leveraged"] = df.apply(
        lambda r: is_leveraged_etf(
            r.get("name", ""),
            r.get("etf_type", ""),
            str(r.get("leverage", ""))
        ),
        axis=1
    )
    
    logger.info(
        f"ETF chargés: {len(df)} | Bonds: {df['is_bond'].sum()} | "
        f"Leveraged (exclus): {df['is_leveraged'].sum()}"
    )
    
    return df


# ============= CHARGEMENT SÉRIES DE RENDEMENTS =============

def load_returns_series(
    stocks_paths: List[str],
    etf_path: str,
    crypto_path: str,
    lookback_days: int = 252
) -> Dict[str, np.ndarray]:
    """
    Charge les séries de rendements pour covariance empirique.
    Retourne: {asset_name: np.array de rendements}
    """
    returns = {}
    
    for path in stocks_paths:
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            for stock in data.get("stocks", []):
                name = stock.get("name") or stock.get("ticker")
                rets = stock.get("returns") or stock.get("daily_returns")
                if name and rets and len(rets) >= 60:
                    returns[name] = np.array(rets[-lookback_days:], dtype=float)
        except Exception as e:
            logger.debug(f"Pas de séries dans {path}: {e}")
    
    logger.info(f"Séries de rendements chargées: {len(returns)} actifs")
    return returns


# ============= SCORING QUANTITATIF =============

def compute_scores(
    rows: List[dict],
    asset_type: str,
    returns_series: Optional[Dict[str, np.ndarray]] = None
) -> List[dict]:
    """
    Calcul du score quantitatif multi-facteur.
    
    Facteurs:
    - Momentum (adapté au type d'actif)
    - Risque (volatilité + drawdown)
    - Sur-extension (anti-fin-de-cycle)
    - Liquidité
    
    Args:
        rows: Liste d'actifs avec métriques
        asset_type: 'equity' | 'etf' | 'crypto'
        returns_series: Dict optionnel pour vol empirique
    
    Returns:
        rows enrichis avec 'score', 'risk_class', 'flags'
    """
    n = len(rows)
    if n == 0:
        return rows
    
    # --- Momentum adaptatif ---
    if asset_type == "crypto":
        mom_raw = [
            0.5 * fnum(r.get("perf_7d")) + 0.5 * fnum(r.get("perf_24h"))
            for r in rows
        ]
    else:
        m1 = [fnum(r.get("perf_1m")) for r in rows]
        m3 = [fnum(r.get("perf_3m")) for r in rows]
        ytd = [fnum(r.get("ytd")) for r in rows]
        
        if any(m3) or any(m1):
            mom_raw = [0.5 * m3[i] + 0.3 * m1[i] + 0.2 * ytd[i] for i in range(n)]
        else:
            d1 = [fnum(r.get("perf_24h") or r.get("perf_1d")) for r in rows]
            mom_raw = [0.7 * ytd[i] + 0.3 * (d1[i] * 20.0) for i in range(n)]
    
    mom = zscore(mom_raw)
    
    # --- Risque (vol_3y + drawdown) ---
    vol = [fnum(r.get("vol_3y") or r.get("vol30") or r.get("volatility_3y") or r.get("vol")) for r in rows]
    
    # Enrichir avec vol empirique si disponible
    if returns_series:
        for i, r in enumerate(rows):
            name = r.get("name")
            if name in returns_series:
                emp_vol = np.std(returns_series[name]) * np.sqrt(252) * 100
                vol[i] = emp_vol
    
    risk_vol = zscore(vol)
    
    dd = [abs(fnum(r.get("maxdd90") or r.get("max_drawdown_ytd") or r.get("max_dd"))) for r in rows]
    risk_dd = zscore(dd) if any(dd) else np.zeros(n)
    
    # --- Sur-extension (flag) ---
    ytd_vals = [fnum(r.get("ytd")) for r in rows]
    p1m = [fnum(r.get("perf_1m")) for r in rows]
    
    overext = []
    for i, r in enumerate(rows):
        flag = (ytd_vals[i] > 80 and p1m[i] <= 0) or (ytd_vals[i] > 150)
        overext.append(1.0 if flag else 0.0)
        r["flags"] = {"overextended": bool(flag)}
    
    # --- Liquidité ---
    liq_raw = [
        math.log(max(fnum(r.get("liquidity") or r.get("market_cap") or r.get("aum_usd")), 1.0))
        for r in rows
    ]
    liq = zscore(liq_raw) if any(liq_raw) else np.zeros(n)
    
    liq_weight = {"etf": 0.30, "equity": 0.15, "crypto": 0.05}.get(asset_type, 0.1)
    
    # --- Score final ---
    score = mom - (0.6 * risk_vol + 0.4 * risk_dd) - np.array(overext) * 0.8 + liq_weight * liq
    
    # --- Classification risque ---
    for i, r in enumerate(rows):
        r["score"] = float(score[i])
        v = vol[i] if vol[i] > 0 else 20
        
        if asset_type == "etf":
            r["risk_class"] = "low" if 5 <= v <= 20 else ("mid" if 20 < v <= 40 else "high")
        elif asset_type == "equity":
            r["risk_class"] = "low" if 10 <= v <= 25 else ("mid" if 25 < v <= 45 else "high")
        else:  # crypto
            r["risk_class"] = "low" if 40 <= v <= 70 else ("mid" if 70 < v <= 120 else "high")
        
        # Ajouter category si manquante
        if "category" not in r:
            r["category"] = asset_type
    
    return rows


# ============= FILTRES =============

def filter_equities(rows: List[dict]) -> List[dict]:
    """Filtre les actions selon critères de risque."""
    def is_valid(r):
        v = fnum(r.get("vol_3y") or r.get("vol"))
        dd = abs(fnum(r.get("max_drawdown_ytd") or r.get("maxdd90") or r.get("max_dd")))
        overext = r.get("flags", {}).get("overextended", False)
        # Critères assouplis pour permettre plus d'actifs
        return 8 <= v <= 70 and dd <= 40 and not overext
    
    filtered = [r for r in rows if is_valid(r)]
    logger.info(f"Actions filtrées: {len(filtered)}/{len(rows)}")
    return filtered


def filter_etfs(rows: List[dict]) -> List[dict]:
    """Filtre les ETF selon critères."""
    def is_valid(r):
        v = fnum(r.get("vol_3y") or r.get("vol30") or r.get("vol"))
        overext = r.get("flags", {}).get("overextended", False)
        return 3 <= v <= 50 and not overext
    
    filtered = [r for r in rows if is_valid(r)]
    logger.info(f"ETF filtrés: {len(filtered)}/{len(rows)}")
    return filtered


def filter_crypto(rows: List[dict]) -> List[dict]:
    """Filtre les cryptos selon tendance et vol."""
    def is_valid(r):
        p7d = fnum(r.get("perf_7d"))
        p24h = fnum(r.get("perf_24h"))
        v = fnum(r.get("vol30") or r.get("vol"))
        dd = abs(fnum(r.get("maxdd90") or r.get("drawdown_90d_pct")))
        
        ok_trend = p7d > p24h > 0 and p24h <= 0.5 * p7d
        ok_vol = 20 <= v <= 180
        ok_dd = dd <= 60
        
        return ok_trend and ok_vol and ok_dd
    
    filtered = [r for r in rows if is_valid(r)]
    
    # Fallback si trop peu
    if len(filtered) < 2:
        relaxed = [r for r in rows if fnum(r.get("perf_7d")) > 0]
        filtered = sorted(relaxed, key=lambda x: x.get("score", 0), reverse=True)[:5]
        logger.warning(f"Crypto: fallback appliqué → {len(filtered)} actifs")
    
    logger.info(f"Crypto filtrées: {len(filtered)}/{len(rows)}")
    return filtered


# ============= DIVERSIFICATION SECTORIELLE =============

def sector_balanced_selection(
    rows: List[dict],
    n: int,
    sector_cap: float = 0.30
) -> List[dict]:
    """Sélection équilibrée par secteur (round-robin)."""
    if not rows:
        return []
    
    buckets = defaultdict(list)
    for r in sorted(rows, key=lambda x: x.get("score", 0), reverse=True):
        buckets[r.get("sector", "Unknown")].append(r)
    
    sector_order = sorted(
        buckets.keys(),
        key=lambda s: buckets[s][0]["score"] if buckets[s] else -1e9,
        reverse=True
    )
    
    out = []
    picked_per_sector = defaultdict(int)
    max_per_sector = max(1, int(n * sector_cap))
    
    while len(out) < n:
        progressed = False
        for s in sector_order:
            if picked_per_sector[s] >= max_per_sector:
                continue
            if buckets[s]:
                out.append(buckets[s].pop(0))
                picked_per_sector[s] += 1
                progressed = True
                if len(out) >= n:
                    break
        if not progressed:
            break
    
    return out[:n]


# ============= CONSTRUCTION UNIVERS (DEPUIS DONNÉES) =============

def build_scored_universe(
    stocks_data: Union[List[dict], None] = None,
    etf_data: Union[List[dict], None] = None,
    crypto_data: Union[List[dict], None] = None,
    returns_series: Optional[Dict[str, np.ndarray]] = None,
    buffett_mode: str = "soft",
    buffett_min_score: float = 0.0
) -> List[dict]:
    """
    Construction de l'univers fermé avec scoring quantitatif.
    Accepte les données directement (pas les chemins).
    
    v2.0: Intègre ROIC, FCF Yield, EPS Growth dans le scoring Buffett.
    
    Args:
        stocks_data: Liste des dicts stocks ou [{"stocks": [...]}]
        etf_data: Liste des dicts ETF
        crypto_data: Liste des dicts crypto
        returns_series: Dict optionnel des séries de rendements
        buffett_mode: "soft" (pénalité), "hard" (rejet), "both", "none" (désactivé)
        buffett_min_score: Score Buffett minimum (0-100)
    
    Returns:
        Liste plate de tous les actifs avec id, name, score, category, etc.
    """
    logger.info("🧮 Construction de l'univers quantitatif v2.0...")
    
    all_assets = []
    
    # ====== ACTIONS ======
    eq_rows = []
    if stocks_data:
        for data in stocks_data:
            # Support format [{"stocks": [...]}] ou juste liste
            stocks_list = data.get("stocks", []) if isinstance(data, dict) else data
            for it in stocks_list:
                eq_rows.append({
                    "id": f"EQ_{len(eq_rows)+1}",
                    "name": it.get("name") or it.get("ticker"),
                    "ticker": it.get("ticker"),
                    "perf_1m": it.get("perf_1m"),
                    "perf_3m": it.get("perf_3m"),
                    "ytd": it.get("perf_ytd") or it.get("ytd"),
                    "perf_24h": it.get("perf_1d"),
                    "vol_3y": it.get("volatility_3y") or it.get("vol"),
                    "vol": it.get("volatility_3y") or it.get("vol"),
                    "max_dd": it.get("max_drawdown_ytd"),
                    "max_drawdown_ytd": it.get("max_drawdown_ytd"),
                    "liquidity": it.get("market_cap"),
                    "market_cap": it.get("market_cap"),
                    "sector": it.get("sector", "Unknown"),
                    "country": it.get("country", "Global"),
                    "category": "equity",
                    # === Métriques fondamentales Buffett v1.0 ===
                    "roe": it.get("roe"),
                    "de_ratio": it.get("de_ratio"),
                    "payout_ratio_ttm": it.get("payout_ratio_ttm"),
                    "dividend_yield": it.get("dividend_yield"),
                    "dividend_coverage": it.get("dividend_coverage"),
                    "pe_ratio": it.get("pe_ratio"),
                    "eps_ttm": it.get("eps_ttm"),
                    # === Métriques Buffett v2.0 (nouvelles) ===
                    "roic": it.get("roic"),  # Depuis stock-filter-by-volume.js
                    "fcf_yield": it.get("fcf_yield"),  # Depuis stock-advanced-filter.js
                    "eps_growth_5y": it.get("eps_growth_5y"),  # Depuis stock-advanced-filter.js
                    "eps_growth_forecast_5y": it.get("eps_growth_forecast_5y"),
                    "peg_ratio": it.get("peg_ratio"),
                    "fcf_ttm": it.get("fcf_ttm"),
                })
    
    if eq_rows:
        eq_rows = compute_scores(eq_rows, "equity", returns_series)
        
        # === BUFFETT FILTER v2.0 ===
        if buffett_mode != "none":
            logger.info(f"🎯 Application du filtre Buffett v2.0 (mode={buffett_mode})")
            eq_rows = apply_buffett_filter(
                eq_rows,
                mode=buffett_mode,
                strict=False,
                min_score=buffett_min_score
            )
            
            # Log coverage des métriques v2.0
            coverage = get_fundamentals_coverage(eq_rows)
            logger.info(f"📊 Couverture métriques: ROE={coverage.get('roe', 0):.1f}% | "
                       f"ROIC={coverage.get('roic', 0):.1f}% | "
                       f"FCF Yield={coverage.get('fcf_yield', 0):.1f}% | "
                       f"EPS Growth={coverage.get('eps_growth_5y', 0):.1f}%")
            
            # Log summary par secteur
            summary = get_sector_summary(eq_rows)
            for sector, stats in summary.items():
                if stats['count'] >= 3:
                    logger.debug(f"  {sector}: {stats['count']} actifs, "
                               f"score={stats['avg_buffett_score']}, "
                               f"ROIC={stats.get('avg_roic', 'N/A')}")
        
        eq_filtered = filter_equities(eq_rows)
        equities = sector_balanced_selection(eq_filtered, min(25, len(eq_filtered)))
        all_assets.extend(equities)
    
    # ====== ETF ======
    etf_rows = []
    bond_rows = []
    if etf_data:
        for i, it in enumerate(etf_data):
            is_bond = "bond" in str(it.get("fund_type", "")).lower()
            row = {
                "id": f"ETF_{'b' if is_bond else 's'}{len(etf_rows if not is_bond else bond_rows)+1}",
                "name": it.get("name"),
                "perf_24h": it.get("daily_change_pct"),
                "ytd": it.get("ytd_return_pct") or it.get("ytd"),
                "vol_3y": it.get("vol_3y_pct") or it.get("vol_pct") or it.get("vol"),
                "vol30": it.get("vol_pct"),
                "vol": it.get("vol_pct") or it.get("vol"),
                "liquidity": it.get("aum_usd"),
                "sector": "Bonds" if is_bond else it.get("sector", "Diversified"),
                "country": it.get("domicile", "Global"),
                "category": "bond" if is_bond else "etf",
            }
            if is_bond:
                bond_rows.append(row)
            else:
                etf_rows.append(row)
    
    if etf_rows:
        etf_rows = compute_scores(etf_rows, "etf", returns_series)
        etf_filtered = filter_etfs(etf_rows)
        etfs = sorted(etf_filtered, key=lambda x: x["score"], reverse=True)[:15]
        all_assets.extend(etfs)
    
    if bond_rows:
        bond_rows = compute_scores(bond_rows, "etf", returns_series)
        bonds = sorted(bond_rows, key=lambda x: x["score"], reverse=True)[:10]
        all_assets.extend(bonds)
    
    # ====== CRYPTO ======
    cr_rows = []
    if crypto_data:
        for i, it in enumerate(crypto_data):
            cr_rows.append({
                "id": f"CR_{i+1}",
                "name": it.get("symbol") or it.get("name"),
                "perf_24h": it.get("ret_1d_pct") or it.get("perf_24h"),
                "perf_7d": it.get("ret_7d_pct") or it.get("perf_7d"),
                "ytd": it.get("ret_ytd_pct") or it.get("ytd"),
                "vol30": it.get("vol_30d_annual_pct") or it.get("vol"),
                "vol": it.get("vol_30d_annual_pct") or it.get("vol"),
                "maxdd90": it.get("drawdown_90d_pct"),
                "sector": "Crypto",
                "country": "Global",
                "category": "crypto",
            })
    
    if cr_rows:
        cr_rows = compute_scores(cr_rows, "crypto", returns_series)
        crypto = filter_crypto(cr_rows)[:5]
        all_assets.extend(crypto)
    
    logger.info(f"✅ Univers construit: {len(all_assets)} actifs")
    
    return all_assets


# ============= CONSTRUCTION UNIVERS (DEPUIS FICHIERS) =============

def build_scored_universe_from_files(
    stocks_jsons: List[dict],
    etf_csv_path: str,
    crypto_csv_path: str,
    returns_series: Optional[Dict[str, np.ndarray]] = None,
    buffett_mode: str = "soft",
    buffett_min_score: float = 0.0
) -> Dict[str, List[dict]]:
    """
    Construction de l'univers fermé depuis les fichiers.
    Retourne un dict organisé par catégorie.
    
    v2.0: Intègre ROIC, FCF Yield, EPS Growth.
    
    Args:
        stocks_jsons: Liste des données stocks (depuis stocks_*.json)
        etf_csv_path: Chemin vers combined_etfs.csv
        crypto_csv_path: Chemin vers Crypto_filtered_volatility.csv
        returns_series: Dict optionnel des séries de rendements
        buffett_mode: "soft" (pénalité), "hard" (rejet), "both", "none" (désactivé)
        buffett_min_score: Score Buffett minimum (0-100)
    
    Returns:
        {
            "equities": [...],
            "etfs": [...],
            "bonds": [...],
            "crypto": [...]
        }
    """
    logger.info("🧮 Construction de l'univers quantitatif v2.0 (fichiers)...")
    
    # ====== ACTIONS ======
    eq_rows = []
    for data in stocks_jsons:
        for it in data.get("stocks", []):
            eq_rows.append({
                "id": it.get("ticker") or it.get("symbol") or it.get("name"),
                "name": it.get("name") or it.get("ticker"),
                "ticker": it.get("ticker"),
                "perf_1m": it.get("perf_1m"),
                "perf_3m": it.get("perf_3m"),
                "ytd": it.get("perf_ytd"),
                "perf_24h": it.get("perf_1d"),
                "vol_3y": it.get("volatility_3y"),
                "volatility_3y": it.get("volatility_3y"),
                "max_drawdown_ytd": it.get("max_drawdown_ytd"),
                "liquidity": it.get("market_cap"),
                "market_cap": it.get("market_cap"),
                "sector": it.get("sector", "Unknown"),
                "country": it.get("country", "Global"),
                # === Métriques fondamentales Buffett v1.0 ===
                "roe": it.get("roe"),
                "de_ratio": it.get("de_ratio"),
                "payout_ratio_ttm": it.get("payout_ratio_ttm"),
                "dividend_yield": it.get("dividend_yield"),
                "dividend_coverage": it.get("dividend_coverage"),
                "pe_ratio": it.get("pe_ratio"),
                "eps_ttm": it.get("eps_ttm"),
                # === Métriques Buffett v2.0 (nouvelles) ===
                "roic": it.get("roic"),
                "fcf_yield": it.get("fcf_yield"),
                "eps_growth_5y": it.get("eps_growth_5y"),
                "eps_growth_forecast_5y": it.get("eps_growth_forecast_5y"),
                "peg_ratio": it.get("peg_ratio"),
                "fcf_ttm": it.get("fcf_ttm"),
            })
    
    eq_rows = compute_scores(eq_rows, "equity", returns_series)
    
    # === BUFFETT FILTER v2.0 ===
    if buffett_mode != "none":
        logger.info(f"🎯 Application du filtre Buffett v2.0 (mode={buffett_mode})")
        eq_rows = apply_buffett_filter(
            eq_rows,
            mode=buffett_mode,
            strict=False,
            min_score=buffett_min_score
        )
        
        # Log coverage
        coverage = get_fundamentals_coverage(eq_rows)
        logger.info(f"📊 Couverture: ROE={coverage.get('roe', 0):.1f}% | "
                   f"ROIC={coverage.get('roic', 0):.1f}% | "
                   f"FCF={coverage.get('fcf_yield', 0):.1f}% | "
                   f"EPS Growth={coverage.get('eps_growth_5y', 0):.1f}%")
    
    eq_filtered = filter_equities(eq_rows)
    equities = sector_balanced_selection(eq_filtered, min(25, len(eq_filtered)))
    
    # ====== ETF ======
    try:
        etf_df = load_etf_csv(etf_csv_path)
        etf_std = etf_df[~etf_df["is_bond"] & ~etf_df["is_leveraged"]]
        etf_bonds = etf_df[etf_df["is_bond"] & ~etf_df["is_leveraged"]]
    except Exception as e:
        logger.error(f"Erreur chargement ETF: {e}")
        etf_std = pd.DataFrame()
        etf_bonds = pd.DataFrame()
    
    def df_to_rows(df, is_bond=False):
        rows = []
        for _, r in df.iterrows():
            rows.append({
                "id": r.get("isin") or r.get("ticker") or r.get("name"),
                "name": str(r.get("name", "")),
                "perf_24h": r.get("daily_change_pct"),
                "ytd": r.get("ytd_return_pct"),
                "vol_3y": r.get("vol_3y_pct") or r.get("vol_pct"),
                "vol30": r.get("vol_pct"),
                "liquidity": r.get("aum_usd"),
                "sector": "Bonds" if is_bond else r.get("sector", "Diversified"),
                "country": r.get("domicile", "Global"),
            })
        return rows
    
    etf_rows = compute_scores(df_to_rows(etf_std), "etf", returns_series)
    etf_filtered = filter_etfs(etf_rows)
    etfs = sorted(etf_filtered, key=lambda x: x["score"], reverse=True)[:15]
    
    bond_rows = compute_scores(df_to_rows(etf_bonds, is_bond=True), "etf", returns_series)
    bonds = sorted(bond_rows, key=lambda x: x["score"], reverse=True)[:10]
    
    # ====== CRYPTO ======
    try:
        cdf = pd.read_csv(crypto_csv_path)
        cr_rows = []
        for _, r in cdf.iterrows():
            cr_rows.append({
                "id": r.get("symbol") or r.get("pair"),
                "name": str(r.get("symbol", "")),
                "perf_24h": r.get("ret_1d_pct"),
                "perf_7d": r.get("ret_7d_pct"),
                "ytd": r.get("ret_ytd_pct"),
                "vol30": r.get("vol_30d_annual_pct"),
                "maxdd90": r.get("drawdown_90d_pct"),
                "sector": "Crypto",
                "country": "Global",
            })
        cr_rows = compute_scores(cr_rows, "crypto", returns_series)
        crypto = filter_crypto(cr_rows)[:5]
    except Exception as e:
        logger.error(f"Erreur chargement crypto: {e}")
        crypto = []
    
    # ====== RÉSUMÉ ======
    universe = {
        "equities": equities,
        "etfs": etfs,
        "bonds": bonds,
        "crypto": crypto,
    }
    
    total = sum(len(v) for v in universe.values())
    logger.info(f"✅ Univers construit: {total} actifs")
    logger.info(f"   Actions: {len(equities)} | ETF: {len(etfs)} | Bonds: {len(bonds)} | Crypto: {len(crypto)}")
    
    return universe


# ============= INTERFACE SIMPLIFIÉE =============

def load_and_build_universe(
    stocks_paths: List[str],
    etf_csv: Optional[str] = None,
    crypto_csv: Optional[str] = None,
    load_returns: bool = False,
    buffett_mode: str = "soft",
    buffett_min_score: float = 0.0
) -> List[dict]:
    """
    Interface haut niveau pour charger et construire l'univers.
    
    v2.0: Supporte les nouvelles métriques ROIC, FCF Yield, EPS Growth.
    
    Args:
        stocks_paths: Liste des chemins vers les fichiers stocks_*.json
        etf_csv: Chemin vers combined_etfs.csv
        crypto_csv: Chemin vers Crypto_filtered_volatility.csv
        load_returns: Charger les séries de rendements si disponibles
        buffett_mode: "soft" (pénalité), "hard" (rejet), "both", "none" (désactivé)
        buffett_min_score: Score Buffett minimum (0-100)
    
    Returns:
        Liste plate de tous les actifs scorés
    """
    # Charger les JSON stocks
    stocks_data = []
    for path in stocks_paths:
        try:
            with open(path, 'r', encoding='utf-8') as f:
                stocks_data.append(json.load(f))
        except Exception as e:
            logger.warning(f"Impossible de charger {path}: {e}")
    
    # Charger ETF
    etf_data = []
    if etf_csv and Path(etf_csv).exists():
        try:
            df = pd.read_csv(etf_csv)
            etf_data = df.to_dict('records')
        except Exception as e:
            logger.warning(f"Impossible de charger ETF: {e}")
    
    # Charger crypto
    crypto_data = []
    if crypto_csv and Path(crypto_csv).exists():
        try:
            df = pd.read_csv(crypto_csv)
            crypto_data = df.to_dict('records')
        except Exception as e:
            logger.warning(f"Impossible de charger crypto: {e}")
    
    # Charger séries de rendements (optionnel)
    returns_series = None
    if load_returns and stocks_paths:
        returns_series = load_returns_series(stocks_paths, etf_csv or "", crypto_csv or "")
    
    return build_scored_universe(
        stocks_data, 
        etf_data, 
        crypto_data, 
        returns_series,
        buffett_mode=buffett_mode,
        buffett_min_score=buffett_min_score
    )
