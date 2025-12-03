# portfolio_engine/factors.py
"""
Scoring multi-facteur configurable par profil.
Les poids varient selon le profil (Agressif/Modéré/Stable).
"""

import numpy as np
from typing import Dict, List, Optional, Union
from dataclasses import dataclass
import logging
import math

logger = logging.getLogger("portfolio_engine.factors")


@dataclass
class FactorWeights:
    """Poids des facteurs pour un profil donné."""
    momentum: float = 0.30
    low_vol: float = 0.25
    quality: float = 0.20      # Proxy: faible drawdown
    liquidity: float = 0.15
    mean_reversion: float = 0.10  # Pénalise sur-extension


# Configurations par profil
PROFILE_WEIGHTS = {
    "Agressif": FactorWeights(
        momentum=0.40,
        low_vol=0.15,
        quality=0.15,
        liquidity=0.15,
        mean_reversion=0.15
    ),
    "Modéré": FactorWeights(
        momentum=0.30,
        low_vol=0.25,
        quality=0.20,
        liquidity=0.15,
        mean_reversion=0.10
    ),
    "Stable": FactorWeights(
        momentum=0.20,
        low_vol=0.35,
        quality=0.25,
        liquidity=0.10,
        mean_reversion=0.10
    ),
}


def fnum(x) -> float:
    """Conversion robuste vers float."""
    if x is None:
        return 0.0
    if isinstance(x, (int, float)):
        return float(x)
    try:
        import re
        s = re.sub(r"[^0-9.\-]", "", str(x))
        return float(s) if s not in ("", "-", ".", "-.") else 0.0
    except:
        return 0.0


class FactorScorer:
    """
    Calcule des scores multi-facteur adaptés au profil.
    
    Facteurs supportés:
    - momentum: Performance récente (1m/3m/YTD)
    - low_vol: Inverse de la volatilité
    - quality: Proxy via drawdown (faible DD = haute qualité)
    - liquidity: Log(market_cap ou AUM)
    - mean_reversion: Pénalise les sur-extensions
    """
    
    def __init__(self, profile: str = "Modéré"):
        if profile not in PROFILE_WEIGHTS:
            raise ValueError(f"Profil inconnu: {profile}. Valides: {list(PROFILE_WEIGHTS.keys())}")
        self.profile = profile
        self.weights = PROFILE_WEIGHTS[profile]
    
    @staticmethod
    def _zscore(values: List[float], winsor_pct: float = 0.02) -> np.ndarray:
        """Z-score winsorisé."""
        arr = np.array(values, dtype=float)
        arr = np.nan_to_num(arr, nan=0.0)
        
        if len(arr) == 0 or arr.std() < 1e-8:
            return np.zeros_like(arr)
        
        # Winsorisation
        lo, hi = np.percentile(arr, [winsor_pct * 100, 100 - winsor_pct * 100])
        arr = np.clip(arr, lo, hi)
        
        return (arr - arr.mean()) / arr.std()
    
    def compute_factor_momentum(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur momentum : combinaison perf 1m/3m/YTD.
        Pondération adaptée selon données disponibles.
        """
        n = len(assets)
        
        p1m = [fnum(a.get("perf_1m")) for a in assets]
        p3m = [fnum(a.get("perf_3m")) for a in assets]
        ytd = [fnum(a.get("ytd")) for a in assets]
        
        has_3m = any(p3m)
        has_1m = any(p1m)
        
        if has_3m and has_1m:
            raw = [0.5 * p3m[i] + 0.3 * p1m[i] + 0.2 * ytd[i] for i in range(n)]
        elif has_3m:
            raw = [0.7 * p3m[i] + 0.3 * ytd[i] for i in range(n)]
        elif has_1m:
            raw = [0.6 * p1m[i] + 0.4 * ytd[i] for i in range(n)]
        else:
            raw = ytd
        
        return self._zscore(raw)
    
    def compute_factor_low_vol(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur low volatility : inverse de la vol (vol basse = score haut).
        """
        vol = [fnum(a.get("vol_3y") or a.get("vol30") or a.get("vol_annual") or a.get("vol") or 20) for a in assets]
        return -self._zscore(vol)
    
    def compute_factor_quality(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur quality : proxy via drawdown (faible DD = haute qualité).
        """
        dd = [abs(fnum(a.get("max_drawdown_ytd") or a.get("maxdd90") or a.get("max_dd") or 0)) for a in assets]
        return -self._zscore(dd)
    
    def compute_factor_liquidity(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur liquidité : log(market_cap ou AUM).
        """
        liq = [
            math.log(max(fnum(a.get("liquidity") or a.get("market_cap") or a.get("aum_usd") or 1), 1))
            for a in assets
        ]
        return self._zscore(liq)
    
    def compute_factor_mean_reversion(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur mean reversion : pénalise les sur-extensions.
        YTD très élevé + momentum récent faible = risque de retournement.
        """
        scores = []
        
        for a in assets:
            ytd = fnum(a.get("ytd"))
            p1m = fnum(a.get("perf_1m"))
            
            if ytd > 80 and p1m <= 0:
                scores.append(-1.5)
            elif ytd > 50 and p1m <= 2:
                scores.append(-0.5)
            elif ytd > 100:
                scores.append(-1.0)
            else:
                scores.append(0.0)
        
        return np.array(scores)
    
    def compute_scores(self, assets: List[dict]) -> List[dict]:
        """
        Calcule le score composite pour chaque actif.
        
        Args:
            assets: Liste d'actifs avec leurs métriques
        
        Returns:
            assets enrichis avec 'factor_scores' et 'composite_score'
        """
        if not assets:
            return assets
        
        n = len(assets)
        
        # Calculer chaque facteur
        factors = {
            "momentum": self.compute_factor_momentum(assets),
            "low_vol": self.compute_factor_low_vol(assets),
            "quality": self.compute_factor_quality(assets),
            "liquidity": self.compute_factor_liquidity(assets),
            "mean_reversion": self.compute_factor_mean_reversion(assets),
        }
        
        # Score composite pondéré
        composite = np.zeros(n)
        for factor_name, factor_values in factors.items():
            weight = getattr(self.weights, factor_name, 0)
            composite += weight * factor_values
        
        # Enrichir les actifs
        for i, asset in enumerate(assets):
            asset["factor_scores"] = {
                name: round(float(values[i]), 3)
                for name, values in factors.items()
            }
            asset["composite_score"] = round(float(composite[i]), 3)
            asset["adjusted_score"] = asset["composite_score"]
            asset["score"] = asset["composite_score"]
        
        logger.info(
            f"Scores calculés: {n} actifs (profil {self.profile}) | "
            f"Score moyen: {composite.mean():.3f} | Range: [{composite.min():.2f}, {composite.max():.2f}]"
        )
        
        return assets
    
    def rank_assets(self, assets: List[dict], top_n: Optional[int] = None) -> List[dict]:
        """
        Trie les actifs par score décroissant et retourne le top N.
        """
        scored = self.compute_scores(assets)
        ranked = sorted(scored, key=lambda x: x.get("composite_score", 0), reverse=True)
        
        if top_n:
            ranked = ranked[:top_n]
        
        return ranked


# ============= UTILITAIRES =============

def rescore_universe_by_profile(
    universe: Union[List[dict], Dict[str, List[dict]]],
    profile: str
) -> List[dict]:
    """
    Recalcule les scores de tout l'univers pour un profil donné.
    
    Args:
        universe: Liste plate d'actifs OU dict avec 'equities', 'etfs', 'bonds', 'crypto'
        profile: 'Agressif' | 'Modéré' | 'Stable'
    
    Returns:
        Liste plate d'actifs avec scores recalculés
    """
    scorer = FactorScorer(profile)
    
    # Si c'est une liste plate, scorer directement
    if isinstance(universe, list):
        return scorer.compute_scores(list(universe))
    
    # Si c'est un dict, combiner toutes les catégories
    all_assets = []
    for category in ["equities", "etfs", "bonds", "crypto"]:
        assets = universe.get(category, [])
        all_assets.extend(list(assets))
    
    return scorer.compute_scores(all_assets)


def get_factor_weights_summary() -> Dict[str, Dict[str, float]]:
    """Retourne un résumé des poids par profil (pour debug/docs)."""
    return {
        profile: {
            "momentum": w.momentum,
            "low_vol": w.low_vol,
            "quality": w.quality,
            "liquidity": w.liquidity,
            "mean_reversion": w.mean_reversion,
        }
        for profile, w in PROFILE_WEIGHTS.items()
    }


def compare_factor_profiles() -> str:
    """Génère une comparaison textuelle des profils."""
    lines = ["Comparaison des poids factoriels par profil:", ""]
    
    factors = ["momentum", "low_vol", "quality", "liquidity", "mean_reversion"]
    header = f"{'Facteur':<15} | {'Agressif':>10} | {'Modéré':>10} | {'Stable':>10}"
    lines.append(header)
    lines.append("-" * len(header))
    
    for factor in factors:
        vals = [getattr(PROFILE_WEIGHTS[p], factor) for p in ["Agressif", "Modéré", "Stable"]]
        line = f"{factor:<15} | {vals[0]:>10.0%} | {vals[1]:>10.0%} | {vals[2]:>10.0%}"
        lines.append(line)
    
    return "\n".join(lines)
