# portfolio_engine/universe.py
"""
Construction de l'univers d'actifs v4.0 — RADAR Tie-Breaker Integration.

CHANGEMENTS v4.0 (RADAR Tie-Breaker v1.3):
- NOUVEAU: has_meaningful_radar() - strict: tilt effectif seulement
- NOUVEAU: _calibrate_eps() - calibration EPS data-driven
- NOUVEAU: _compute_radar_coverage() - coverage mapping vs tilt séparées
- AMÉLIORÉ: sector_balanced_selection() avec RADAR tie-breaker intégré
  - Paramètres: enable_radar_tiebreaker, radar_bonus_cap, radar_min_coverage
  - floor() au lieu de round() pour bucketisation
  - Gate sur coverage_tilt (pas coverage_raw)
  - Mesure des swaps ON/OFF

CHANGEMENTS v3.9 (Étape 1.3 - Top-N Garanti):
- NOUVEAU: sector_balanced_selection() avec relaxation progressive
- Garantit TOUJOURS 25 titres (sauf univers &lt; 25)
- Multi-passes: max=4 → max=6 → max=8 → illimité
- Retourne métadonnées de sélection (pass utilisé, rejets, etc.)
- Log clair des raisons de sélection/rejet
- Corrige le bug du champ "score" → "composite_score"

CHANGEMENTS v3.8 (Étape 1.1 - Volatility Sanity):
- Intégration automatique de batch_sanitize_volatility() depuis data_quality
- Corrige les volatilités aberrantes (ex: GSK 376% → 3.76%)
- Règle générique (pas de hardcoding par pays)
- Log des corrections appliquées

CHANGEMENTS v3.6 (ETF Momentum Fix):
- Mappe perf_1m_pct → perf_1m et perf_3m_pct → perf_3m pour ETF/Bonds
- Permet à factors.py d'utiliser le momentum académique (50% 3m + 30% 1m + 20% YTD)
- Corrige le biais momentum ETF (était 70% YTD + 30% daily = trop bruité)

CHANGEMENTS v3.5 (Crypto Quote Filter - ChatGPT review):
- Utilise crypto_utils.crypto_quote_filter() pour filtrage robuste
- Autorise EUR + USD + stablecoins (portefeuille base EUR)
- STRICT: filtre si quote non déterminable (évite les faux positifs)

CHANGEMENTS v3.3.1 (Fix Diversification):
- ETF: dd_max 40% → 55% (permet QQQ, VTI, etc.)
- Bond: dd_max 20% → 35%, vol_max 20% → 25% (permet TLT, LQD, HYG)
- Crypto: dd_max 70% → 85%, var_max 20% → 30%
- Crypto: tier1_listed filter désactivé (trop restrictif)

CHANGEMENTS v3.3 (Bond Risk Factors Integration):
- Import et appel automatique de add_bond_risk_factors() sur bonds
- Nouvelles colonnes bonds: bond_avg_duration, bond_avg_maturity, 
  bond_credit_score, bond_credit_rating
- Colonnes f_bond_* et bond_risk_bucket ajoutées automatiquement

CHANGEMENTS v3.2 (P0 Quick Wins):
- ETF/Bonds: charge total_expense_ratio, yield_ttm, one_year_return_pct
- Crypto: charge sharpe_ratio, var_95_pct, tier1_listed, enough_history_90d
- Crypto: nouveaux filtres hard (VaR > 20%, DD > 80%, tier1, history)

CHANGEMENTS v3.1:
- FIX: Ajout des champs ticker/symbol pour ETF et bonds (V4.2.4 fix)

CHANGEMENTS MAJEURS v3.0:
1. SUPPRESSION du scoring interne (double comptage éliminé)
2. FactorScorer est maintenant le SEUL moteur d'alpha
3. Ce module se concentre sur le CHARGEMENT et la PRÉPARATION des données

Workflow:
1. universe.py charge et prépare les données brutes
2. factors.py calcule les scores (SEUL moteur d'alpha)
3. optimizer.py applique le hard filter Buffett et optimise
"""

import re
import math
import json
import logging
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, List, Any, Optional, Union, Tuple
from collections import defaultdict

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


def zscore(values: List[float], winsor_pct: float = 0.02) -> np.ndarray:
    """Z-score winsorisé (compatibilité)."""
    arr = np.array(values, dtype=float)
    arr = np.nan_to_num(arr, nan=0.0)
    
    if len(arr) == 0 or arr.std() < 1e-8:
        return np.zeros_like(arr)
    
    lo, hi = np.percentile(arr, [winsor_pct * 100, 100 - winsor_pct * 100])
    arr = np.clip(arr, lo, hi)
    
    return (arr - arr.mean()) / arr.std()


def winsorize(arr: np.ndarray, pct: float = 0.02) -> np.ndarray:
    """Winsorisation des outliers (compatibilité)."""
    arr = np.array(arr, dtype=float)
    lo, hi = np.percentile(arr, [pct * 100, 100 - pct * 100])
    return np.clip(arr, lo, hi)
  
 # ============= SECTOR GUARD HELPER v3.7 =============

def _build_sector_top_dict(data: dict) -> Optional[dict]:
    """
    Reconstruit sector_top comme dict pour factors.py.
    
    CSV a: sector_top="Technology", sector_top_weight=48.12
    factors.py attend: {"sector": "Technology", "weight": 0.4812}
    """
    sector = data.get("sector_top")
    if not sector or (pd.isna(sector) if hasattr(pd, 'isna') else sector is None):
        return None
    
    weight = data.get("sector_top_weight")
    if weight and not (pd.isna(weight) if hasattr(pd, 'isna') else False):
        # Convertir de % (48.12) en décimal (0.4812)
        weight_decimal = float(weight) / 100.0 if float(weight) > 1 else float(weight)
    else:
        weight_decimal = None
    
    return {"sector": str(sector), "weight": weight_decimal} 


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
    """Charge et prépare les ETF depuis CSV."""
    df = pd.read_csv(path)
    
    # v3.6: Colonnes numériques étendues (TER, yield, bond metrics, perf_1m/3m)
    num_cols = [
        "daily_change_pct", "ytd_return_pct", "one_year_return_pct",
        "perf_1m_pct", "perf_3m_pct",  # v3.6: Nouvelles colonnes momentum
        "vol_pct", "vol_3y_pct", "aum_usd", "total_expense_ratio",
        "yield_ttm",
        # v3.3: Bond-specific metrics
        "bond_avg_duration", "bond_avg_maturity", "bond_credit_score"
    ]
    for c in num_cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    
    name_col = next(
        (c for c in ["name", "long_name", "etf_name", "symbol", "ticker"] if c in df.columns),
        None
    )
    if name_col is None:
        df["name"] = [f"ETF_{i}" for i in range(len(df))]
    else:
        df["name"] = df[name_col].astype(str)
    
    def _series(col, default=""):
        return df[col] if col in df.columns else pd.Series(default, index=df.index)
    
    df["is_bond"] = (
        _series("fund_type").str.contains(r"Bond|Fixed Income|Obligation", case=False, na=False)
        | _series("etf_type").str.contains(r"Bond|Fixed Income|Obligation", case=False, na=False)
        | _series("category").str.contains(r"Bond|Fixed Income|Obligation", case=False, na=False)
    )
    
    df["is_leveraged"] = df.apply(
        lambda r: is_leveraged_etf(
            r.get("name", ""),
            r.get("etf_type", ""),
            str(r.get("leverage", ""))
        ),
        axis=1
    )
    
    logger.info(f"ETF chargés: {len(df)} | Bonds: {df['is_bond'].sum()} | Leveraged (exclus): {df['is_leveraged'].sum()}")
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
    
    Returns:
        {asset_name: np.array de rendements}
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


# ============= FILTRES DE RISQUE v3.5 =============

def filter_by_risk_bounds(rows: List[dict], asset_type: str) -> List[dict]:
    """
    Filtre simple par bornes de volatilité.
    
    v3.5: Filtre crypto robuste via crypto_utils (ChatGPT review)
    - Autorise EUR + USD + stablecoins (portefeuille base EUR)
    - STRICT: filtre si quote non déterminable
    
    v3.3.1: Seuils relaxés pour permettre la diversification:
    - ETF: dd_max 40% → 55% (permet QQQ, VTI, etc.)
    - Bond: dd_max 20% → 35%, vol_max 20% → 25%
    - Crypto: dd_max 70% → 85%, var_max 20% → 30%, tier1 désactivé
    
    v3.2: Filtres crypto améliorés (VaR, tier1, history).
    v3.0: Simplifié - pas de scoring, juste des filtres de risque.
    """
    # v3.3.1: Seuils RELAXÉS pour permettre la diversification
    risk_bounds = {
        "equity": {"vol_min": 8, "vol_max": 70, "dd_max": 50},
        "etf": {"vol_min": 3, "vol_max": 50, "dd_max": 55},      # v3.3.1: 40→55%
        "crypto": {"vol_min": 20, "vol_max": 180, "dd_max": 85, "var_max": 30},  # v3.3.1: dd:70→85, var:20→30
        "bond": {"vol_min": 1, "vol_max": 25, "dd_max": 35},     # v3.3.1: vol:20→25, dd:20→35
    }
    
    bounds = risk_bounds.get(asset_type, risk_bounds["etf"])
    
    # v3.5: Import lazy crypto_utils
    HAS_CRYPTO_UTILS = False
    crypto_quote_filter = None
    if asset_type == "crypto":
        try:
            from .crypto_utils import crypto_quote_filter as _cqf
            crypto_quote_filter = _cqf
            HAS_CRYPTO_UTILS = True
        except ImportError:
            pass
    
    def is_valid(r):
        v = fnum(r.get("vol_3y") or r.get("vol30") or r.get("vol") or r.get("vol_pct") or 20)
        dd = abs(fnum(r.get("max_drawdown_ytd") or r.get("maxdd90") or r.get("max_dd") or 0))
        
        # Filtre vol/DD standard
        if not (bounds["vol_min"] <= v <= bounds["vol_max"] and dd <= bounds["dd_max"]):
            return False
        
        # v3.5: Filtres spécifiques crypto (avec crypto_utils robuste - ChatGPT review)
        if asset_type == "crypto":
            # NOUVEAU v3.5: Filtre stale (données obsolètes)
            stale = r.get("stale")
            if stale is True:
                logger.debug(f"Crypto filtrée stale: {r.get('symbol')} (stale=True)")
                return False
            
            # NOUVEAU v3.5: Filtre devise robuste via crypto_utils
            # Portefeuille base EUR → autorise EUR + USD + stablecoins
            if HAS_CRYPTO_UTILS and crypto_quote_filter:
                if not crypto_quote_filter(r, portfolio_base="EUR", logger_instance=logger):
                    return False  # Déjà loggé dans crypto_quote_filter
            else:
                # Fallback si crypto_utils non disponible
                currency_quote = str(r.get("currency_quote", "")).upper()
                symbol = str(r.get("symbol") or r.get("id") or "").upper()
                
                # Si currency_quote présent et non autorisé → filtrer
                if currency_quote and currency_quote not in ["US DOLLAR", "USD", "EUR", "USDT", "USDC", ""]:
                    logger.debug(f"Crypto filtrée non-autorisée: {r.get('symbol')} (quote={currency_quote})")
                    return False
                
                # Si pas de currency_quote, vérifier le symbole (STRICT)
                if not currency_quote and "/" in symbol:
                    quote = symbol.split("/")[-1]
                    if quote not in ["USD", "EUR", "USDT", "USDC", "BUSD"]:
                        logger.debug(f"Crypto filtrée (symbol quote={quote}): {symbol}")
                        return False
            
            # Filtre VaR 95% (risque extrême)
            var_95 = abs(fnum(r.get("var_95_pct", 0)))
            if var_95 > bounds.get("var_max", 30):
                logger.debug(f"Crypto filtrée VaR: {r.get('symbol')} (VaR={var_95}%)")
                return False
            
            # Filtre historique insuffisant
            enough_history = r.get("enough_history_90d")
            if enough_history is False:
                logger.debug(f"Crypto filtrée history: {r.get('symbol')}")
                return False
            
            # Filtre drawdown extrême
            if dd > 85:
                logger.debug(f"Crypto filtrée DD: {r.get('symbol')} (DD={dd}%)")
                return False
        
        return True
    
    filtered = [r for r in rows if is_valid(r)]
    rejected = len(rows) - len(filtered)
    logger.info(f"{asset_type.capitalize()} filtrés par risque: {len(filtered)}/{len(rows)} (rejetés: {rejected})")
    return filtered


# ============= FILTRES PAR CATÉGORIE (COMPATIBILITÉ) =============

def filter_equities(rows: List[dict]) -> List[dict]:
    """Filtre les actions par bornes de risque (compatibilité)."""
    return filter_by_risk_bounds(rows, "equity")


def filter_etfs(rows: List[dict]) -> List[dict]:
    """Filtre les ETF par bornes de risque (compatibilité)."""
    return filter_by_risk_bounds(rows, "etf")


def filter_crypto(rows: List[dict]) -> List[dict]:
    """Filtre les crypto par bornes de risque (compatibilité)."""
    return filter_by_risk_bounds(rows, "crypto")


# =============================================================================
# v4.0: RADAR TIE-BREAKER HELPERS (ChatGPT-reviewed v1.3)
# =============================================================================

def has_meaningful_radar(asset: dict) -> bool:
    """
    v1.3 STRICT: meaningful seulement si tilt EFFECTIF (favored/avoided).
    Un mapping non-vide sans tilt = inutile pour le tie-breaker.
    
    Args:
        asset: Dictionnaire de l'actif avec _radar_matching
        
    Returns:
        True si l'asset a un tilt effectif (favored ou avoided)
    """
    m = asset.get("_radar_matching") or {}
    if not m:
        return False
    
    # meaningful = tilt effectif uniquement
    return bool(
        m.get("sector_in_favored") or m.get("sector_in_avoided") or
        m.get("region_in_favored") or m.get("region_in_avoided")
    )


def _calibrate_eps(scores: List[float], fallback: float = 0.02) -> Dict[str, Any]:
    """
    Calibre EPS (tie-band epsilon) de manière data-driven.
    
    v1.3: Formule: EPS = max(0.005, 0.25 * std, IQR/20)
    Fallback si < 30 échantillons.
    
    Args:
        scores: Liste des scores composite
        fallback: Valeur EPS par défaut si pas assez de données
        
    Returns:
        Dict avec eps, std, iqr, n, method
    """
    valid_scores = [s for s in scores if s is not None and not (isinstance(s, float) and math.isnan(s))]
    
    n = len(valid_scores)
    if n < 30:
        std_val = float(np.std(valid_scores)) if n > 1 else 0.0
        return {"eps": fallback, "std": std_val, "iqr": 0.0, "n": n, "method": "fallback"}
    
    arr = np.array(valid_scores, dtype=float)
    std_val = float(np.std(arr))
    q75, q25 = np.percentile(arr, [75, 25])
    iqr = float(q75 - q25)
    
    eps_std = 0.25 * std_val
    eps_iqr = iqr / 20.0 if iqr > 0 else 0.0
    eps = max(0.005, eps_std, eps_iqr)
    
    return {
        "eps": float(eps), 
        "std": std_val, 
        "iqr": iqr, 
        "n": n,
        "method": "data-driven",
    }


def _compute_radar_coverage(assets: List[dict]) -> Dict[str, Any]:
    """
    v1.3: Sépare coverage_mapping (normalisé) de coverage_tilt (effectif).
    Le gate tie-breaker utilise coverage_tilt.
    
    Args:
        assets: Liste des actifs avec _radar_matching
        
    Returns:
        Dict avec total, with_radar_key, with_mapping, with_tilt, 
        coverage_raw, coverage_mapping, coverage_tilt
    """
    total = len(assets)
    if total == 0:
        return {
            "total": 0, 
            "with_radar_key": 0,
            "with_mapping": 0,
            "with_tilt": 0,
            "coverage_raw": 0,
            "coverage_mapping": 0,
            "coverage_tilt": 0,
        }
    
    with_radar_key = 0
    with_mapping = 0  # sector_normalized ou region_normalized non vide
    with_tilt = 0     # favored/avoided effectif (CELUI QUI COMPTE)
    
    for a in assets:
        m = a.get("_radar_matching") or {}
        if m:
            with_radar_key += 1
            
            # Mapping coverage (informatif)
            if m.get("sector_normalized") or m.get("region_normalized"):
                with_mapping += 1
            
            # Tilt coverage (pour gate) - STRICT
            if (m.get("sector_in_favored") or m.get("sector_in_avoided") or
                m.get("region_in_favored") or m.get("region_in_avoided")):
                with_tilt += 1
    
    return {
        "total": total,
        "with_radar_key": with_radar_key,
        "with_mapping": with_mapping,
        "with_tilt": with_tilt,
        "coverage_raw": round(with_radar_key / total, 4),
        "coverage_mapping": round(with_mapping / total, 4),
        "coverage_tilt": round(with_tilt / total, 4),  # ← GATE SUR CELUI-CI
    }


# ============= TOP-N GUARANTEED SELECTION v4.0 =============

def sector_balanced_selection(
    assets: List[dict], 
    target_n: int = 25,
    initial_max_per_sector: int = 4,
    score_field: str = "composite_score",
    # v4.0: RADAR tie-breaker params
    enable_radar_tiebreaker: bool = True,
    radar_bonus_cap: float = 0.03,
    radar_min_coverage: float = 0.40,
    eps_fallback: float = 0.02,
    market_context: Optional[Dict] = None,
) -> Tuple[List[dict], Dict[str, Any]]:
    """
    Sélection Top-N GARANTIE avec contrainte secteur progressive + RADAR tie-breaker.
    
    v4.0: Intégration RADAR tie-breaker (ChatGPT-reviewed v1.3).
    v3.9: Nouvelle implémentation multi-passes (Étape 1.3).
    
    RADAR Tie-Breaker:
        - Calibre EPS data-driven (0.25*std ou IQR/20)
        - Calcule bonus RADAR pour chaque asset (±0.03 max)
        - Tri: bucket (floor) > radar_bonus > score > symbol
        - Gate: désactivé si coverage_tilt < 40%
        - Mesure: swaps ON/OFF pour validation
    
    Algorithme Multi-Pass:
        PASS 1: Top-N avec contrainte secteur stricte (max=4)
        PASS 2: Relaxer contrainte (max=6) si nécessaire
        PASS 3: Relaxer encore (max=8) si nécessaire  
        PASS 4: Ignorer contrainte secteur (garantie N)
    
    Args:
        assets: Liste des actifs scorés
        target_n: Nombre de titres cibles (défaut: 25)
        initial_max_per_sector: Contrainte initiale par secteur (défaut: 4)
        score_field: Champ de score à utiliser (défaut: "composite_score")
        enable_radar_tiebreaker: Activer le tie-breaker RADAR (défaut: True)
        radar_bonus_cap: Bonus RADAR maximum (défaut: 0.03)
        radar_min_coverage: Coverage minimum pour activer RADAR (défaut: 0.40)
        eps_fallback: EPS fallback si pas assez de données (défaut: 0.02)
        market_context: Context marché optionnel
    
    Returns:
        Tuple[selected_assets, metadata]
        - selected_assets: Liste des actifs sélectionnés (len = min(target_n, len(assets)))
        - metadata: Dict avec stats de sélection (passes, rejets, radar, swaps, etc.)
    
    Critères de succès:
        - TOUJOURS target_n titres (sauf univers < target_n)
        - Contrainte secteur respectée quand possible
        - RADAR tie-breaker actif si coverage_tilt >= 40%
        - Log clair des raisons de sélection/rejet
    """
    if not assets:
        return [], {
            "pass_used": 0, 
            "total_universe": 0, 
            "selected": 0, 
            "reason": "empty_universe",
            "radar": {"enabled": False, "reason": "empty_universe"},
            "swaps": {"count": 0, "interpretation": "n/a"},
        }
    
    # Ajuster target si univers trop petit
    actual_target = min(target_n, len(assets))
    
    # === STEP 1: Score helper ===
    def get_score(asset: dict) -> float:
        for field in [score_field, f"_{score_field}", "score", "_score"]:
            val = asset.get(field)
            if val is not None:
                return fnum(val)
        return 0.0
    
    # === STEP 2: RADAR Tie-Breaker Setup ===
    radar_active = False
    radar_disable_reason = None
    eps_stats = {"eps": eps_fallback, "method": "fallback", "n": 0}
    coverage_stats = _compute_radar_coverage(assets)
    
    if enable_radar_tiebreaker:
        # Calibrer EPS
        all_scores = [get_score(a) for a in assets]
        eps_stats = _calibrate_eps(all_scores, fallback=eps_fallback)
        eps = eps_stats["eps"]
        
        # v1.3: Gate sur coverage_tilt (pas coverage_raw ni coverage_mapping)
        if coverage_stats["coverage_tilt"] >= radar_min_coverage:
            radar_active = True
            logger.info(
                f"[RADAR] Activé: coverage_tilt {coverage_stats['coverage_tilt']:.1%} "
                f">= seuil {radar_min_coverage:.0%}. EPS={eps:.4f} ({eps_stats['method']})"
            )
        else:
            radar_disable_reason = f"coverage_tilt_too_low ({coverage_stats['coverage_tilt']:.1%})"
            logger.warning(
                f"[RADAR] Désactivé: coverage_tilt {coverage_stats['coverage_tilt']:.1%} "
                f"< seuil {radar_min_coverage:.0%}. "
                f"(mapping={coverage_stats['coverage_mapping']:.1%}, "
                f"tilt={coverage_stats['with_tilt']}/{coverage_stats['total']})"
            )
    else:
        radar_disable_reason = "disabled_by_param"
        eps = eps_fallback
    
    # === STEP 3: Compute RADAR bonus for each asset ===
    if radar_active:
        try:
            from .factors import compute_radar_bonus_from_matching
            
            for asset in assets:
                bonus, bonus_meta = compute_radar_bonus_from_matching(
                    asset, cap=radar_bonus_cap
                )
                asset["_radar_bonus"] = bonus
                asset["_radar_bonus_meta"] = bonus_meta
        except ImportError as e:
            logger.warning(f"[RADAR] compute_radar_bonus_from_matching non disponible: {e}")
            radar_active = False
            radar_disable_reason = "import_error"
            for asset in assets:
                asset["_radar_bonus"] = 0.0
    else:
        for asset in assets:
            asset["_radar_bonus"] = 0.0
    
    # === STEP 4: Define sort keys ===
    def sort_key_radar(a: dict):
        """Tri avec RADAR: bucket > radar_bonus > score > symbol"""
        score = get_score(a)
        # v1.3: floor() au lieu de round() (comportement prévisible aux limites)
        bucket = math.floor(score / eps) if eps > 0 else 0
        radar = float(a.get("_radar_bonus", 0.0))
        aid = str(a.get("symbol") or a.get("ticker") or a.get("id") or "").lower()
        return (-bucket, -radar, -score, aid)
    
    def sort_key_no_radar(a: dict):
        """Tri sans RADAR: score > symbol"""
        score = get_score(a)
        aid = str(a.get("symbol") or a.get("ticker") or a.get("id") or "").lower()
        return (-score, aid)
    
    # === STEP 5: Multi-pass selection function ===
    def run_selection(sorted_assets: List[dict]) -> Tuple[List[dict], int, Dict]:
        """Exécute la sélection multi-pass."""
        relaxation_levels = [
            (initial_max_per_sector, "strict"),
            (initial_max_per_sector + 2, "relaxed"),
            (initial_max_per_sector + 4, "loose"),
            (float('inf'), "no_constraint"),
        ]
        
        selected = []
        selection_log = []
        rejected_by_sector = defaultdict(list)
        
        for pass_num, (max_per_sector, constraint_name) in enumerate(relaxation_levels, 1):
            sector_count = defaultdict(int)
            
            for asset in selected:
                sector = asset.get("sector", "Unknown")
                sector_count[sector] += 1
            
            for asset in sorted_assets:
                if asset in selected:
                    continue
                if len(selected) >= actual_target:
                    break
                
                sector = asset.get("sector", "Unknown")
                score = get_score(asset)
                name = asset.get("name") or asset.get("ticker") or asset.get("id", "?")
                
                if sector_count[sector] < max_per_sector:
                    selected.append(asset)
                    sector_count[sector] += 1
                    asset["_selection_pass"] = pass_num
                    asset["_selection_reason"] = f"selected_pass{pass_num}_{constraint_name}"
                    selection_log.append({
                        "action": "selected",
                        "pass": pass_num,
                        "name": name,
                        "sector": sector,
                        "score": round(score, 4),
                        "radar_bonus": round(asset.get("_radar_bonus", 0), 4),
                        "sector_count": sector_count[sector],
                    })
                else:
                    if pass_num == 1:
                        rejected_by_sector[sector].append({
                            "name": name,
                            "score": round(score, 4)
                        })
            
            if len(selected) >= actual_target:
                break
        
        final_pass = selected[-1].get("_selection_pass", 1) if selected else 0
        return selected, final_pass, {"log": selection_log, "rejected": rejected_by_sector}
    
    # === STEP 6: Run selection WITH RADAR ===
    sorted_with_radar = sorted(assets, key=sort_key_radar if radar_active else sort_key_no_radar)
    selected, final_pass, selection_meta = run_selection(sorted_with_radar)
    
    # === STEP 7: Measure swaps (RADAR ON vs OFF) ===
    swaps_count = 0
    swaps_details = []
    
    if radar_active:
        # Run selection WITHOUT RADAR for comparison
        sorted_no_radar = sorted(assets, key=sort_key_no_radar)
        selected_no_radar, _, _ = run_selection(sorted_no_radar)
        
        # Compare IDs
        ids_with = set(a.get("symbol") or a.get("id") for a in selected)
        ids_without = set(a.get("symbol") or a.get("id") for a in selected_no_radar)
        
        swaps_count = len(ids_with.symmetric_difference(ids_without)) // 2
        
        # Details
        added_by_radar = ids_with - ids_without
        removed_by_radar = ids_without - ids_with
        swaps_details = {
            "added_by_radar": list(added_by_radar)[:5],  # Top 5
            "removed_by_radar": list(removed_by_radar)[:5],
        }
        
        if swaps_count > 0:
            logger.info(f"[RADAR] Swaps ON/OFF: {swaps_count} changements dans top-{actual_target}")
    
    # === STEP 8: Compile metadata ===
    sector_distribution = defaultdict(int)
    for asset in selected:
        sector_distribution[asset.get("sector", "Unknown")] += 1
    
    # Bonus distribution stats
    bonuses = [a.get("_radar_bonus", 0) for a in selected]
    bonus_stats = {
        "non_zero": sum(1 for b in bonuses if b != 0),
        "positive": sum(1 for b in bonuses if b > 0),
        "negative": sum(1 for b in bonuses if b < 0),
        "mean": round(np.mean(bonuses), 4) if bonuses else 0,
        "std": round(np.std(bonuses), 4) if bonuses else 0,
    }
    
    metadata = {
        "version": "v4.0_radar_tiebreaker",
        "total_universe": len(assets),
        "target_n": target_n,
        "selected": len(selected),
        "selection_rate": f"{len(selected)/len(assets)*100:.1f}%",
        "pass_used": final_pass,
        "constraint_respected": final_pass <= 3,
        "initial_max_per_sector": initial_max_per_sector,
        "sector_distribution": dict(sector_distribution),
        "sectors_count": len(sector_distribution),
        # RADAR metadata
        "radar": {
            "enabled": radar_active,
            "disable_reason": radar_disable_reason,
            "coverage": coverage_stats,
            "bonus_stats": bonus_stats,
        },
        "eps": eps_stats,
        "swaps": {
            "count": swaps_count,
            "details": swaps_details,
            "interpretation": (
                "significant" if swaps_count >= 3 else
                "moderate" if swaps_count >= 1 else
                "none"
            ),
        },
        "selection_log_sample": selection_meta["log"][:10],
    }
    
    # === STEP 9: Logging ===
    if final_pass > 1:
        logger.warning(
            f"[TOP-N] ⚠️ Contrainte secteur relaxée (PASS {final_pass}). "
            f"Secteurs saturés en PASS 1: {list(selection_meta['rejected'].keys())}"
        )
    
    logger.info(
        f"[TOP-N] ✅ Sélection terminée: {len(selected)}/{actual_target} actifs "
        f"(PASS {final_pass}, RADAR={'ON' if radar_active else 'OFF'}, swaps={swaps_count})"
    )
    
    return selected, metadata


def sector_balanced_selection_simple(
    assets: List[dict], 
    max_per_sector: int = 5, 
    top_n: int = 50
) -> List[dict]:
    """
    Wrapper de compatibilité pour l'ancienne signature.
    
    DEPRECATED: Utilisez sector_balanced_selection() avec la nouvelle signature.
    Retourne uniquement la liste (sans métadonnées) pour compatibilité.
    """
    selected, metadata = sector_balanced_selection(
        assets=assets,
        target_n=top_n,
        initial_max_per_sector=max_per_sector
    )
    
    # Log le warning si on a dû relaxer
    if metadata["pass_used"] > 1:
        logger.warning(
            f"[TOP-N LEGACY] Contrainte relaxée "
            f"(PASS {metadata['pass_used']}) pour atteindre {len(selected)}/{top_n} actifs"
        )
    
    return selected


# ============= ENRICHISSEMENT BONDS v3.3 =============

def _enrich_bonds_with_risk_factors(bond_rows: List[dict]) -> List[dict]:
    """
    Enrichit les bonds avec les facteurs de risque f_bond_*.
    
    v3.3: Utilise add_bond_risk_factors de factors.py si disponible.
    Fallback: calcul inline si import échoue.
    """
    if not bond_rows:
        return bond_rows
    
    try:
        # Import dynamique pour éviter import circulaire
        from .factors import add_bond_risk_factors
        
        # Convertir en DataFrame pour utiliser add_bond_risk_factors
        df = pd.DataFrame(bond_rows)
        df = add_bond_risk_factors(df)
        
        # Reconvertir en liste de dicts
        enriched = df.to_dict('records')
        logger.info(f"🔹 Bonds enrichis avec risk factors: {len(enriched)} bonds")
        return enriched
        
    except ImportError as e:
        logger.warning(f"Impossible d'importer add_bond_risk_factors: {e}. Fallback inline.")
        # Fallback: calcul simplifié inline
        return _enrich_bonds_inline(bond_rows)
    except Exception as e:
        logger.error(f"Erreur enrichissement bonds: {e}")
        return bond_rows


def _enrich_bonds_inline(bond_rows: List[dict]) -> List[dict]:
    """
    Fallback: calcul inline des facteurs bond si import échoue.
    Version simplifiée de add_bond_risk_factors.
    """
    D_MAX = 10.0
    V_MAX = 12.0
    
    for row in bond_rows:
        # Score crédit (0-1)
        credit = fnum(row.get("bond_credit_score", 50)) / 100.0
        row["f_bond_credit_score"] = min(1.0, max(0.0, credit))
        
        # Score duration (0-1, plus court = mieux)
        dur = fnum(row.get("bond_avg_duration", 5))
        row["f_bond_duration_score"] = 1.0 - min(1.0, max(0.0, dur / D_MAX))
        
        # Score vol (0-1, plus bas = mieux)
        vol = fnum(row.get("vol_pct") or row.get("vol") or 6)
        row["f_bond_volatility_score"] = 1.0 - min(1.0, max(0.0, vol / V_MAX))
        
        # Score qualité composite
        f_quality = (
            0.50 * row["f_bond_credit_score"] +
            0.25 * row["f_bond_duration_score"] +
            0.25 * row["f_bond_volatility_score"]
        )
        row["f_bond_quality"] = min(1.0, max(0.0, f_quality))
        row["f_bond_quality_0_100"] = round(f_quality * 100, 1)
        
        # Bucket de risque
        if f_quality >= 0.8:
            row["bond_risk_bucket"] = "defensive"
        elif f_quality >= 0.6:
            row["bond_risk_bucket"] = "core"
        elif f_quality >= 0.3:
            row["bond_risk_bucket"] = "risky"
        else:
            row["bond_risk_bucket"] = "very_risky"
    
    return bond_rows


# ============= VOLATILITY SANITY CHECK v3.8 =============

def _apply_volatility_sanity_check(all_assets: List[dict]) -> List[dict]:
    """
    Applique le sanity check de volatilité sur tous les actifs.
    
    v3.8: Nouvelle fonction - corrige les volatilités aberrantes.
    Utilise batch_sanitize_volatility de data_quality.py.
    
    Règle générique (pas de hardcoding par pays):
    - Si vol > 150% (equity) et pas crypto/leveraged
    - Tenter rescaling: vol/100, vol/10
    - Si rescalé dans range valide: accepter + log
    - Sinon: flagger comme suspect
    """
    try:
        from .data_quality import batch_sanitize_volatility
        
        all_assets, vol_stats = batch_sanitize_volatility(all_assets)
        
        if vol_stats["corrected"] > 0 or vol_stats["suspect"] > 0:
            logger.warning(
                f"[VOL SANITY] {vol_stats['corrected']} assets corrected, "
                f"{vol_stats['suspect']} flagged suspect"
            )
            if vol_stats.get("corrections"):
                for corr in vol_stats["corrections"][:5]:  # Log les 5 premiers
                    logger.info(
                        f"  → {corr['symbol']}: {corr['field']} "
                        f"{corr['original']:.2f}% → {corr['corrected']:.4f}% (÷{corr['factor']})"
                    )
        
        return all_assets
        
    except ImportError as e:
        logger.warning(f"[VOL SANITY] Impossible d'importer batch_sanitize_volatility: {e}")
        return all_assets
    except Exception as e:
        logger.error(f"[VOL SANITY] Erreur: {e}")
        return all_assets


# ============= CONSTRUCTION UNIVERS v4.0 =============

def build_raw_universe(
    stocks_data: Union[List[dict], None] = None,
    etf_data: Union[List[dict], None] = None,
    crypto_data: Union[List[dict], None] = None,
    returns_series: Optional[Dict[str, np.ndarray]] = None,
    apply_risk_filters: bool = True,
    enrich_bonds: bool = True,  # v3.3: Activer par défaut
    apply_vol_sanity: bool = True  # v3.8: Nouveau - sanity check volatilité
) -> List[dict]:
    """
    Construction de l'univers BRUT (sans scoring).
    
    v4.0: RADAR tie-breaker integration (coverage, eps, swaps)
    v3.9: Top-N guaranteed selection avec relaxation progressive
    v3.8: Sanity check volatilité automatique (corrige GSK 376% → 3.76%)
    v3.6: Mappe perf_1m_pct → perf_1m et perf_3m_pct → perf_3m pour ETF/Bonds
    v3.5: Filtre crypto robuste via crypto_utils (autorise EUR + USD + stables)
    v3.3.1: Filtres relaxés (ETF dd 55%, Bond dd 35%, Crypto var 30%)
    v3.3: Enrichissement automatique des bonds avec f_bond_* factors
    v3.2: Chargement colonnes étendues (TER, yield, sharpe, var)
    v3.1: Ajout des champs ticker/symbol pour ETF et bonds (fix V4.2.4)
    v3.0: Le scoring est fait par FactorScorer, pas ici.
    Ce module se concentre sur le chargement et la préparation.
    
    Args:
        stocks_data: Liste des dicts stocks ou [{"stocks": [...]}]
        etf_data: Liste des dicts ETF
        crypto_data: Liste des dicts crypto
        returns_series: Dict optionnel des séries de rendements
        apply_risk_filters: Appliquer les filtres de risque basiques
        enrich_bonds: v3.3 - Enrichir bonds avec f_bond_* factors
        apply_vol_sanity: v3.8 - Appliquer sanity check volatilité
    
    Returns:
        Liste plate de tous les actifs avec leurs métriques brutes
    """
    logger.info("🧮 Construction de l'univers brut v4.0...")
    
    all_assets = []
    
    # ====== ACTIONS ======
    eq_rows = []
    if stocks_data:
        for data in stocks_data:
            stocks_list = data.get("stocks", []) if isinstance(data, dict) else data
            for it in stocks_list:
                eq_rows.append({
                    "id": it.get("ticker") or it.get("symbol") or it.get("name") or f"EQ_{len(eq_rows)+1}",
                    "name": it.get("name") or it.get("ticker"),
                    "ticker": it.get("ticker"),
                    # Performance
                    "perf_1m": it.get("perf_1m"),
                    "perf_3m": it.get("perf_3m"),
                    "ytd": it.get("perf_ytd") or it.get("ytd"),
                    "perf_24h": it.get("perf_1d"),
                    # Risque
                    "vol_3y": it.get("volatility_3y") or it.get("vol"),
                    "vol": it.get("volatility_3y") or it.get("vol"),
                    "max_dd": it.get("max_drawdown_ytd"),
                    "max_drawdown_ytd": it.get("max_drawdown_ytd"),
                    # Méta
                    "liquidity": it.get("market_cap"),
                    "market_cap": it.get("market_cap"),
                    "sector": it.get("sector", "Unknown"),
                    "country": it.get("country", "Global"),
                    "category": "equity",
                    # === Métriques fondamentales Buffett ===
                    "roe": it.get("roe"),
                    "roic": it.get("roic"),
                    "de_ratio": it.get("de_ratio"),
                    "fcf_yield": it.get("fcf_yield"),
                    "eps_growth_5y": it.get("eps_growth_5y"),
                    "peg_ratio": it.get("peg_ratio"),
                    "payout_ratio_ttm": it.get("payout_ratio_ttm"),
                    "dividend_yield": it.get("dividend_yield"),
                    "pe_ratio": it.get("pe_ratio"),
                })
    
    if eq_rows:
        if apply_risk_filters:
            eq_rows = filter_by_risk_bounds(eq_rows, "equity")
        all_assets.extend(eq_rows)
    
    # ====== ETF ======
    etf_rows = []
    bond_rows = []
    if etf_data:
        for it in etf_data:
            is_bond = "bond" in str(it.get("fund_type", "")).lower()
            row = {
                "id": it.get("isin") or it.get("ticker") or it.get("symbol") or it.get("name") or f"ETF_{len(etf_rows)+1}",
                "name": it.get("name"),
                # === V3.1 FIX: Ajout ticker/symbol pour résolution API ===
                "ticker": it.get("ticker") or it.get("symbol"),
                "symbol": it.get("symbol") or it.get("ticker"),
                # Performance
                "perf_24h": it.get("daily_change_pct"),
                "ytd": it.get("ytd_return_pct") or it.get("ytd"),
                "one_year_return_pct": it.get("one_year_return_pct"),  # v3.2
                # === v3.6: Nouvelles colonnes momentum ===
                "perf_1m": it.get("perf_1m_pct"),  # Mappe perf_1m_pct → perf_1m
                "perf_3m": it.get("perf_3m_pct"),  # Mappe perf_3m_pct → perf_3m
                # Risque
                "vol_3y": it.get("vol_3y_pct") or it.get("vol_pct") or it.get("vol"),
                "vol30": it.get("vol_pct"),
                "vol": it.get("vol_pct") or it.get("vol"),
                "vol_pct": it.get("vol_pct"),  # v3.3: Garder pour bond enrichment
                # Méta
                "liquidity": it.get("aum_usd"),
                "aum_usd": it.get("aum_usd"),  # v3.2: Garder aussi le nom original
                "sector": "Bonds" if is_bond else it.get("sector", "Diversified"),
                "country": it.get("domicile", "Global"),
                "category": "bond" if is_bond else "etf",
                "fund_type": it.get("fund_type"),  # v3.2: Pour distinguer bonds
                # ISIN pour référence
                "isin": it.get("isin"),
                # === v3.2: Nouvelles colonnes coût/rendement ===
                "total_expense_ratio": it.get("total_expense_ratio"),
                "yield_ttm": it.get("yield_ttm"),
                # === v3.3: Nouvelles colonnes bond-specific ===
                "bond_avg_duration": it.get("bond_avg_duration"),
                "bond_avg_maturity": it.get("bond_avg_maturity"),
                "bond_credit_score": it.get("bond_credit_score"),
                "bond_credit_rating": it.get("bond_credit_rating"),
                # === v3.7 FIX: Sector Guard v14.2 fields for RADAR ===
                "sector_bucket": it.get("sector_bucket"),
                "sector_signal_ok": it.get("sector_signal_ok"),
                "sector_trust": it.get("sector_trust"),
                "etf_type": it.get("etf_type"),
                # Reconstruire sector_top comme dict pour factors.py
                "sector_top": _build_sector_top_dict(it),
            }
            if is_bond:
                bond_rows.append(row)
            else:
                etf_rows.append(row)
    
    if etf_rows:
        if apply_risk_filters:
            etf_rows = filter_by_risk_bounds(etf_rows, "etf")
        all_assets.extend(etf_rows)
    
    if bond_rows:
        if apply_risk_filters:
            bond_rows = filter_by_risk_bounds(bond_rows, "bond")
        # v3.3: Enrichir avec f_bond_* factors
        if enrich_bonds:
            bond_rows = _enrich_bonds_with_risk_factors(bond_rows)
        all_assets.extend(bond_rows)
    
    # ====== CRYPTO ======
    cr_rows = []
    if crypto_data:
        for it in crypto_data:
            cr_rows.append({
                "id": it.get("symbol") or it.get("pair") or f"CR_{len(cr_rows)+1}",
                "name": it.get("symbol") or it.get("name"),
                "ticker": it.get("symbol"),
                "symbol": it.get("symbol"),
                "perf_24h": it.get("ret_1d_pct") or it.get("perf_24h"),
                "perf_7d": it.get("ret_7d_pct") or it.get("perf_7d"),
                "perf_1m": it.get("ret_30d_pct"),                       # NOUVEAU v3.4
                "perf_3m": it.get("ret_90d_pct"),                       # NOUVEAU v3.4
                "ret_90d_pct": it.get("ret_90d_pct"),                   # NOUVEAU v3.4
                "ytd": it.get("ret_ytd_pct") or it.get("ytd"),
                "vol30": it.get("vol_30d_annual_pct") or it.get("vol"),
                "vol": it.get("vol_30d_annual_pct") or it.get("vol"),
                "maxdd90": it.get("drawdown_90d_pct"),
                "drawdown_90d_pct": it.get("drawdown_90d_pct"),         # NOUVEAU v3.4
                "sector": "Crypto",
                "country": "Global",
                "category": "crypto",
                # === v3.2: Nouvelles colonnes risque/qualité ===
                "sharpe_ratio": it.get("sharpe_ratio"),
                "var_95_pct": it.get("var_95_pct"),
                "tier1_listed": it.get("tier1_listed"),
                "enough_history_90d": it.get("enough_history_90d"),
                "coverage_ratio": it.get("coverage_ratio"),
                # === v3.5: Colonne currency_quote pour filtrage ===
                "currency_quote": it.get("currency_quote"),
                "stale": it.get("stale"),
            })
    
    if cr_rows:
        if apply_risk_filters:
            cr_rows = filter_by_risk_bounds(cr_rows, "crypto")
        all_assets.extend(cr_rows)
    
    # Ajouter les séries de rendements si disponibles
    if returns_series:
        for asset in all_assets:
            name = asset.get("name")
            if name and name in returns_series:
                asset["returns_series"] = returns_series[name]
    
    # === v3.8: Sanity check volatilité (Étape 1.1) ===
    if apply_vol_sanity:
        all_assets = _apply_volatility_sanity_check(all_assets)
    
    logger.info(f"✅ Univers brut construit: {len(all_assets)} actifs")
    
    return all_assets


# ============= CONSTRUCTION UNIVERS DEPUIS FICHIERS =============

def build_raw_universe_from_files(
    stocks_jsons: List[dict],
    etf_csv_path: str,
    crypto_csv_path: str,
    returns_series: Optional[Dict[str, np.ndarray]] = None,
    apply_risk_filters: bool = True,
    enrich_bonds: bool = True,  # v3.3
    apply_vol_sanity: bool = True  # v3.8: Nouveau
) -> Dict[str, List[dict]]:
    """
    Construction de l'univers brut depuis fichiers.
    Retourne un dict organisé par catégorie.
    
    v4.0: RADAR tie-breaker integration
    v3.9: Top-N guaranteed selection avec relaxation progressive
    v3.8: Sanity check volatilité automatique
    v3.6: Mappe perf_1m_pct → perf_1m et perf_3m_pct → perf_3m pour ETF/Bonds
    v3.5: Filtre crypto robuste via crypto_utils (autorise EUR + USD + stables)
    v3.3.1: Filtres relaxés (ETF dd 55%, Bond dd 35%, Crypto var 30%)
    v3.3: Enrichissement automatique des bonds avec f_bond_* factors
    v3.2: Chargement colonnes étendues (TER, yield, sharpe, var)
    v3.1: Ajout des champs ticker/symbol pour ETF et bonds (fix V4.2.4)
    v3.0: Pas de scoring - juste chargement et préparation.
    """
    logger.info("🧮 Construction de l'univers brut v4.0 (fichiers)...")
    
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
                "category": "equity",
                # Fondamentaux Buffett
                "roe": it.get("roe"),
                "roic": it.get("roic"),
                "de_ratio": it.get("de_ratio"),
                "fcf_yield": it.get("fcf_yield"),
                "eps_growth_5y": it.get("eps_growth_5y"),
                "peg_ratio": it.get("peg_ratio"),
                "payout_ratio_ttm": it.get("payout_ratio_ttm"),
            })
    
    if apply_risk_filters:
        eq_rows = filter_by_risk_bounds(eq_rows, "equity")
    
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
        """Convertit un DataFrame en liste de dicts avec colonnes étendues (V3.6)."""
        rows = []
        for _, r in df.iterrows():
            rows.append({
                "id": r.get("isin") or r.get("ticker") or r.get("symbol") or r.get("name"),
                "name": str(r.get("name", "")),
                # === V3.1 FIX: Ajout ticker/symbol pour résolution API ===
                "ticker": r.get("ticker") or r.get("symbol"),
                "symbol": r.get("symbol") or r.get("ticker"),
                # Performance
                "perf_24h": r.get("daily_change_pct"),
                "ytd": r.get("ytd_return_pct"),
                "one_year_return_pct": r.get("one_year_return_pct"),  # v3.2
                # === v3.6: Nouvelles colonnes momentum ===
                "perf_1m": r.get("perf_1m_pct"),  # Mappe perf_1m_pct → perf_1m
                "perf_3m": r.get("perf_3m_pct"),  # Mappe perf_3m_pct → perf_3m
                # Risque
                "vol_3y": r.get("vol_3y_pct") or r.get("vol_pct"),
                "vol30": r.get("vol_pct"),
                "vol_pct": r.get("vol_pct"),  # v3.3: Pour bond enrichment
                # Méta
                "liquidity": r.get("aum_usd"),
                "aum_usd": r.get("aum_usd"),  # v3.2
                "sector": "Bonds" if is_bond else r.get("sector", "Diversified"),
                "country": r.get("domicile", "Global"),
                "category": "bond" if is_bond else "etf",
                "fund_type": r.get("fund_type"),  # v3.2
                # ISIN pour référence
                "isin": r.get("isin"),
                # === v3.2: Nouvelles colonnes coût/rendement ===
                "total_expense_ratio": r.get("total_expense_ratio"),
                "yield_ttm": r.get("yield_ttm"),
                # === v3.3: Nouvelles colonnes bond-specific ===
                "bond_avg_duration": r.get("bond_avg_duration"),
                "bond_avg_maturity": r.get("bond_avg_maturity"),
                "bond_credit_score": r.get("bond_credit_score"),
                "bond_credit_rating": r.get("bond_credit_rating"),
                # === v3.7 FIX: Sector Guard v14.2 fields for RADAR ===
                "sector_bucket": r.get("sector_bucket"),
                "sector_signal_ok": r.get("sector_signal_ok"),
                "sector_trust": r.get("sector_trust"),
                "etf_type": r.get("etf_type"),
                # Reconstruire sector_top comme dict pour factors.py
                "sector_top": _build_sector_top_dict(r.to_dict()),
            })
        return rows
    
    etf_rows = df_to_rows(etf_std)
    bond_rows = df_to_rows(etf_bonds, is_bond=True)
    
    if apply_risk_filters:
        etf_rows = filter_by_risk_bounds(etf_rows, "etf")
        bond_rows = filter_by_risk_bounds(bond_rows, "bond")
    
    # v3.3: Enrichir bonds avec f_bond_* factors
    if enrich_bonds and bond_rows:
        bond_rows = _enrich_bonds_with_risk_factors(bond_rows)
    
    # ====== CRYPTO ======
    try:
        cdf = pd.read_csv(crypto_csv_path)
        cr_rows = []
        for _, r in cdf.iterrows():
            cr_rows.append({
                "id": r.get("symbol") or r.get("pair"),
                "name": str(r.get("symbol", "")),
                "ticker": r.get("symbol"),
                "symbol": r.get("symbol"),
                "perf_24h": r.get("ret_1d_pct"),
                "perf_7d": r.get("ret_7d_pct"),
                "perf_1m": r.get("ret_30d_pct"),                       # NOUVEAU v3.4
                "perf_3m": r.get("ret_90d_pct"),                       # NOUVEAU v3.4
                "ret_90d_pct": r.get("ret_90d_pct"),                   # NOUVEAU v3.4
                "ytd": r.get("ret_ytd_pct"),
                "vol30": r.get("vol_30d_annual_pct"),
                "maxdd90": r.get("drawdown_90d_pct"),
                "drawdown_90d_pct": r.get("drawdown_90d_pct"),         # NOUVEAU v3.4
                "sector": "Crypto",
                "country": "Global",
                "category": "crypto",
                # === v3.2: Nouvelles colonnes risque/qualité ===
                "sharpe_ratio": r.get("sharpe_ratio"),
                "var_95_pct": r.get("var_95_pct"),
                "tier1_listed": r.get("tier1_listed"),
                "enough_history_90d": r.get("enough_history_90d"),
                "coverage_ratio": r.get("coverage_ratio"),
                # === v3.5: Colonnes pour filtrage devise ===
                "currency_quote": r.get("currency_quote"),
                "stale": r.get("stale"),
            })
        if apply_risk_filters:
            cr_rows = filter_by_risk_bounds(cr_rows, "crypto")
    except Exception as e:
        logger.error(f"Erreur chargement crypto: {e}")
        cr_rows = []
    
    # === v3.8: Sanity check volatilité (Étape 1.1) ===
    # Appliquer sur toutes les catégories combinées
    if apply_vol_sanity:
        all_combined = eq_rows + etf_rows + bond_rows + cr_rows
        all_combined = _apply_volatility_sanity_check(all_combined)
        
        # Reséparer par catégorie
        eq_rows = [a for a in all_combined if a.get("category") == "equity"]
        etf_rows = [a for a in all_combined if a.get("category") == "etf"]
        bond_rows = [a for a in all_combined if a.get("category") == "bond"]
        cr_rows = [a for a in all_combined if a.get("category") == "crypto"]
    
    universe = {
        "equities": eq_rows,
        "etfs": etf_rows,
        "bonds": bond_rows,
        "crypto": cr_rows,
    }
    
    total = sum(len(v) for v in universe.values())
    logger.info(f"✅ Univers brut construit: {total} actifs")
    logger.info(f"   Actions: {len(eq_rows)} | ETF: {len(etf_rows)} | Bonds: {len(bond_rows)} | Crypto: {len(cr_rows)}")
    
    return universe


# ============= INTERFACE SIMPLIFIÉE =============

def load_and_prepare_universe(
    stocks_paths: List[str],
    etf_csv: Optional[str] = None,
    crypto_csv: Optional[str] = None,
    load_returns: bool = False,
    apply_risk_filters: bool = True,
    enrich_bonds: bool = True,  # v3.3
    apply_vol_sanity: bool = True  # v3.8: Nouveau
) -> List[dict]:
    """
    Interface haut niveau pour charger et préparer l'univers.
    
    v4.0: RADAR tie-breaker integration
    v3.9: Top-N guaranteed selection avec relaxation progressive
    v3.8: Sanity check volatilité automatique
    v3.6: Mappe perf_1m_pct → perf_1m et perf_3m_pct → perf_3m pour ETF/Bonds
    v3.5: Filtre crypto robuste via crypto_utils (autorise EUR + USD + stables)
    v3.3.1: Filtres relaxés (ETF dd 55%, Bond dd 35%, Crypto var 30%)
    v3.3: Enrichissement automatique des bonds avec f_bond_* factors
    v3.2: Chargement colonnes étendues (TER, yield, sharpe, var)
    v3.1: Ajout des champs ticker/symbol pour ETF et bonds (fix V4.2.4)
    v3.0: Pas de scoring. Le scoring est fait par FactorScorer.
    
    Workflow recommandé:
    ```python
    from portfolio_engine.universe import load_and_prepare_universe
    from portfolio_engine.factors import FactorScorer
    
    # 1. Charger l'univers brut (bonds auto-enrichis avec f_bond_*)
    raw_universe = load_and_prepare_universe(stocks_paths, etf_csv, crypto_csv)
    
    # 2. Scorer avec FactorScorer (SEUL moteur d'alpha)
    scorer = FactorScorer(profile="Modéré")
    scored_universe = scorer.compute_scores(raw_universe)
    
    # 3. Passer à l'optimizer (qui applique le hard filter Buffett)
    from portfolio_engine.optimizer import PortfolioOptimizer, convert_universe_to_assets
    assets = convert_universe_to_assets(scored_universe)
    optimizer = PortfolioOptimizer()
    allocation, diagnostics = optimizer.build_portfolio(assets, "Modéré")
    ```
    
    Args:
        stocks_paths: Liste des chemins vers les fichiers stocks_*.json
        etf_csv: Chemin vers combined_etfs.csv
        crypto_csv: Chemin vers Crypto_filtered_volatility.csv
        load_returns: Charger les séries de rendements si disponibles
        apply_risk_filters: Appliquer les filtres de risque basiques
        enrich_bonds: v3.3 - Enrichir bonds avec f_bond_* factors
        apply_vol_sanity: v3.8 - Appliquer sanity check volatilité
    
    Returns:
        Liste plate de tous les actifs (NON scorés, mais bonds enrichis)
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
    
    return build_raw_universe(
        stocks_data, 
        etf_data, 
        crypto_data, 
        returns_series,
        apply_risk_filters=apply_risk_filters,
        enrich_bonds=enrich_bonds,
        apply_vol_sanity=apply_vol_sanity
    )


# ============= FONCTIONS UTILITAIRES v3.3 =============

def get_bonds_summary(universe: Union[List[dict], Dict[str, List[dict]]]) -> Dict[str, Any]:
    """
    Retourne un résumé des bonds dans l'univers.
    
    v3.3: Nouveau - stats sur les bond risk factors.
    """
    # Extraire les bonds
    if isinstance(universe, dict):
        bonds = universe.get("bonds", [])
    else:
        bonds = [a for a in universe if a.get("category") == "bond"]
    
    if not bonds:
        return {"count": 0, "message": "Aucun bond dans l'univers"}
    
    # Stats de base
    summary = {
        "count": len(bonds),
        "with_credit_score": sum(1 for b in bonds if b.get("bond_credit_score")),
        "with_duration": sum(1 for b in bonds if b.get("bond_avg_duration")),
        "with_f_bond_quality": sum(1 for b in bonds if b.get("f_bond_quality")),
    }
    
    # Distribution des buckets
    buckets = {}
    for b in bonds:
        bucket = b.get("bond_risk_bucket", "unknown")
        buckets[bucket] = buckets.get(bucket, 0) + 1
    summary["buckets"] = buckets
    
    # Moyennes si enrichis
    if summary["with_f_bond_quality"] > 0:
        qualities = [b.get("f_bond_quality", 0) for b in bonds if b.get("f_bond_quality")]
        summary["avg_quality"] = round(sum(qualities) / len(qualities), 3) if qualities else None
    
    return summary


# ============= COMPATIBILITÉ LEGACY =============

def compute_scores(assets: List[dict], asset_type_or_profile: Optional[str] = None, profile: Optional[str] = None) -> List[dict]:
    """
    DEPRECATED: Utilisez FactorScorer.compute_scores() directement.
    
    Cette fonction est conservée pour compatibilité avec l'ancienne signature:
    - compute_scores(assets, profile)              <- nouvelle signature
    - compute_scores(assets, asset_type, profile)  <- ancienne signature (3 args)
    
    Le paramètre asset_type est ignoré pour compatibilité.
    """
    logger.warning(
        "⚠️ compute_scores dans universe.py est DEPRECATED. "
        "Utilisez FactorScorer.compute_scores() pour éviter le double comptage."
    )
    
    # Déterminer le profil (compatibilité avec ancienne signature à 3 arguments)
    actual_profile = "Modéré"
    if profile is not None:
        # Ancienne signature: compute_scores(assets, asset_type, profile)
        actual_profile = profile if profile else "Modéré"
    elif asset_type_or_profile is not None:
        # Soit nouvelle signature compute_scores(assets, profile)
        # Soit ancienne avec asset_type mais sans profile
        if asset_type_or_profile in ["Agressif", "Modéré", "Stable"]:
            actual_profile = asset_type_or_profile
        # Sinon c'est un asset_type (equity, etf, etc.) qu'on ignore
    
    from .factors import FactorScorer
    scorer = FactorScorer(profile=actual_profile)
    return scorer.compute_scores(assets)


def build_scored_universe(*args, **kwargs):
    """
    DEPRECATED: Utilisez build_raw_universe + FactorScorer.
    
    Cette fonction est conservée pour compatibilité mais affiche un warning.
    Le scoring doit être fait via FactorScorer (seul moteur d'alpha).
    """
    logger.warning(
        "⚠️ build_scored_universe est DEPRECATED. "
        "Utilisez build_raw_universe + FactorScorer pour éviter le double comptage."
    )
    
    from .factors import FactorScorer
    
    profile = kwargs.pop("profile", "Modéré")
    # Ignorer les anciens paramètres Buffett (maintenant dans optimizer)
    kwargs.pop("buffett_mode", None)
    kwargs.pop("buffett_min_score", None)
    
    raw = build_raw_universe(*args, **kwargs)
    scorer = FactorScorer(profile=profile)
    return scorer.compute_scores(raw)


def build_scored_universe_from_files(
    stocks_jsons: List[dict],
    etf_csv_path: str,
    crypto_csv_path: str,
    profile: str = "Modéré",
    **kwargs
) -> Dict[str, List[dict]]:
    """
    DEPRECATED: Utilisez build_raw_universe_from_files + FactorScorer.
    
    Conservé pour compatibilité avec generate_portfolios_v4.py.
    """
    logger.warning(
        "⚠️ build_scored_universe_from_files est DEPRECATED. "
        "Utilisez build_raw_universe_from_files + FactorScorer."
    )
    
    from .factors import FactorScorer
    
    # Construire l'univers brut
    raw_universe = build_raw_universe_from_files(
        stocks_jsons, etf_csv_path, crypto_csv_path, **kwargs
    )
    
    # Scorer chaque catégorie
    scorer = FactorScorer(profile=profile)
    
    scored_universe = {}
    for category, assets in raw_universe.items():
        if assets:
            scored_universe[category] = scorer.compute_scores(list(assets))
        else:
            scored_universe[category] = []
    
    return scored_universe


def load_and_build_universe(*args, **kwargs):
    """
    DEPRECATED: Utilisez load_and_prepare_universe + FactorScorer.
    """
    logger.warning(
        "⚠️ load_and_build_universe est DEPRECATED. "
        "Utilisez load_and_prepare_universe + FactorScorer."
    )
    
    from .factors import FactorScorer
    
    profile = kwargs.pop("profile", "Modéré")
    kwargs.pop("buffett_mode", None)
    kwargs.pop("buffett_min_score", None)
    
    raw = load_and_prepare_universe(*args, **kwargs)
    
    scorer = FactorScorer(profile=profile)
    return scorer.compute_scores(raw)
