# portfolio_engine/factors.py
"""
FactorScorer v2.1 — SEUL MOTEUR D'ALPHA
=======================================

Phase 2.5 Refactoring:
- Suppression du double comptage avec universe.py
- Intégration du score Buffett comme facteur "quality_fundamental"
- Pari central explicite: QUALITY + MOMENTUM

v2.1 Changes (P0 Quick Wins):
- Nouveau facteur cost_efficiency (TER + yield_ttm) pour ETF/Bonds
- Bonus Sharpe ratio pour crypto dans momentum
- Meilleure utilisation des données existantes

Facteurs:
- momentum: 45% (Agressif) → 20% (Stable) — Driver principal
- quality_fundamental: 25-30% — Score Buffett intégré (ROIC, FCF, ROE)
- low_vol: 15-35% — Contrôle du risque
- cost_efficiency: 5-10% — TER + Yield (ETF/Bonds) [v2.1]
- liquidity: 5-10% — Filtre technique
- mean_reversion: 5% — Évite sur-extension

Le pari central:
"Des entreprises de qualité fondamentale (ROIC > 10%, FCF positif, dette maîtrisée)
avec un momentum positif sur 3-12 mois surperforment à horizon 1-3 ans."
"""

import numpy as np
from typing import Dict, List, Optional, Union
from dataclasses import dataclass
import logging
import math

logger = logging.getLogger("portfolio_engine.factors")


# ============= FACTOR WEIGHTS v2.1 =============

@dataclass
class FactorWeights:
    """
    Poids des facteurs pour un profil donné.
    
    v2.1: Ajout cost_efficiency (TER + Yield) pour ETF/Bonds.
    v2.0: quality_fundamental remplace quality (proxy DD) et intègre Buffett.
    """
    momentum: float = 0.30           # Driver principal d'alpha
    quality_fundamental: float = 0.25  # Score Buffett (ROIC, FCF, ROE, D/E)
    low_vol: float = 0.25            # Contrôle risque
    cost_efficiency: float = 0.05    # v2.1: TER + Yield (ETF/Bonds)
    liquidity: float = 0.10          # Filtre technique
    mean_reversion: float = 0.05     # Évite sur-extension


# Configurations par profil — PARI CENTRAL EXPLICITE
PROFILE_WEIGHTS = {
    "Agressif": FactorWeights(
        momentum=0.45,              # Driver principal fort
        quality_fundamental=0.25,   # Buffett toujours important
        low_vol=0.10,               # Accepte plus de vol
        cost_efficiency=0.05,       # v2.1: Coûts moins prioritaires
        liquidity=0.10,
        mean_reversion=0.05
    ),
    "Modéré": FactorWeights(
        momentum=0.35,              # Équilibré
        quality_fundamental=0.25,   # Qualité renforcée
        low_vol=0.20,               # Contrôle risque
        cost_efficiency=0.08,       # v2.1: Coûts importants
        liquidity=0.07,
        mean_reversion=0.05
    ),
    "Stable": FactorWeights(
        momentum=0.20,              # Momentum réduit
        quality_fundamental=0.25,   # Qualité maximale
        low_vol=0.30,               # Risque minimal prioritaire
        cost_efficiency=0.10,       # v2.1: Coûts très importants (long terme)
        liquidity=0.10,
        mean_reversion=0.05
    ),
}


# ============= HELPERS =============

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


# ============= BUFFETT QUALITY INTEGRATION =============

# Seuils par secteur pour le scoring Buffett
SECTOR_QUALITY_THRESHOLDS = {
    "tech": {"roe_good": 15, "roic_good": 12, "de_max": 80, "fcf_good": 3},
    "finance": {"roe_good": 10, "roic_good": None, "de_max": None, "fcf_good": None},
    "real_estate": {"roe_good": 6, "roic_good": 5, "de_max": 200, "fcf_good": 4},
    "healthcare": {"roe_good": 12, "roic_good": 10, "de_max": 150, "fcf_good": 3},
    "consumer_staples": {"roe_good": 15, "roic_good": 12, "de_max": 100, "fcf_good": 4},
    "energy": {"roe_good": 10, "roic_good": 8, "de_max": 80, "fcf_good": 5},
    "utilities": {"roe_good": 8, "roic_good": 6, "de_max": 200, "fcf_good": 4},
    "_default": {"roe_good": 12, "roic_good": 10, "de_max": 120, "fcf_good": 3},
}

SECTOR_MAPPING = {
    "technology": "tech", "tech": "tech", "software": "tech", "semiconductors": "tech",
    "finance": "finance", "financials": "finance", "banking": "finance", "insurance": "finance",
    "real estate": "real_estate", "reit": "real_estate", "immobilier": "real_estate",
    "healthcare": "healthcare", "health care": "healthcare", "pharmaceuticals": "healthcare",
    "consumer staples": "consumer_staples", "consommation de base": "consumer_staples",
    "energy": "energy", "oil & gas": "energy", "énergie": "energy",
    "utilities": "utilities", "services publics": "utilities",
}


def get_sector_key(sector: Optional[str]) -> str:
    """Normalise le secteur vers une clé de seuils."""
    if not sector:
        return "_default"
    sector_lower = sector.lower().strip()
    for pattern, key in SECTOR_MAPPING.items():
        if pattern in sector_lower or sector_lower in pattern:
            return key
    return "_default"


def compute_buffett_quality_score(asset: dict) -> float:
    """
    Calcule un score de qualité Buffett [0, 100] pour un actif.
    
    Métriques utilisées:
    - ROE (Return on Equity)
    - ROIC (Return on Invested Capital) — Plus important que ROE
    - FCF Yield (Free Cash Flow Yield)
    - D/E Ratio (Debt-to-Equity)
    - EPS Growth 5Y
    
    Returns:
        Score entre 0 et 100. 100 = qualité maximale.
    """
    sector_key = get_sector_key(asset.get("sector"))
    thresholds = SECTOR_QUALITY_THRESHOLDS.get(sector_key, SECTOR_QUALITY_THRESHOLDS["_default"])
    
    scores = []
    weights = []
    
    # === ROE ===
    roe = fnum(asset.get("roe"))
    roe_good = thresholds.get("roe_good", 12)
    if roe > 0:
        roe_score = min(100, (roe / roe_good) * 70)  # 70 = score if at threshold
        scores.append(roe_score)
        weights.append(0.20)
    
    # === ROIC (plus important que ROE) ===
    roic = fnum(asset.get("roic"))
    roic_good = thresholds.get("roic_good")
    if roic_good and roic > 0:
        roic_score = min(100, (roic / roic_good) * 70)
        scores.append(roic_score)
        weights.append(0.30)  # Poids plus élevé
    
    # === FCF Yield ===
    fcf = fnum(asset.get("fcf_yield"))
    fcf_good = thresholds.get("fcf_good", 3)
    if fcf != 0:
        if fcf < 0:
            fcf_score = max(0, 30 + fcf * 5)  # Pénalité pour FCF négatif
        else:
            fcf_score = min(100, 50 + (fcf / fcf_good) * 25)
        scores.append(fcf_score)
        weights.append(0.20)
    
    # === D/E Ratio (inversé: moins = mieux) ===
    de = fnum(asset.get("de_ratio"))
    de_max = thresholds.get("de_max")
    if de_max and de >= 0:
        if de <= de_max:
            de_score = 80 - (de / de_max) * 30  # 80 si 0, 50 si at max
        else:
            de_score = max(0, 50 - (de - de_max) / de_max * 50)
        scores.append(de_score)
        weights.append(0.15)
    
    # === EPS Growth 5Y ===
    eps_growth = fnum(asset.get("eps_growth_5y"))
    if asset.get("eps_growth_5y") is not None:
        if eps_growth >= 15:
            eps_score = 90
        elif eps_growth >= 10:
            eps_score = 75
        elif eps_growth >= 5:
            eps_score = 60
        elif eps_growth >= 0:
            eps_score = 45
        else:
            eps_score = max(0, 30 + eps_growth * 2)
        scores.append(eps_score)
        weights.append(0.15)
    
    # Calcul du score pondéré
    if not scores or sum(weights) == 0:
        return 50.0  # Neutre si pas de données
    
    weighted_score = sum(s * w for s, w in zip(scores, weights)) / sum(weights)
    return round(weighted_score, 1)


# ============= FACTOR SCORER v2.1 =============

class FactorScorer:
    """
    Calcule des scores multi-facteur adaptés au profil.
    
    v2.1 — Ajout cost_efficiency:
    - momentum: Performance récente (1m/3m/YTD) + Sharpe bonus (crypto)
    - quality_fundamental: Score Buffett intégré (ROIC, FCF, ROE, D/E)
    - low_vol: Inverse de la volatilité
    - cost_efficiency: TER (coûts) + yield_ttm (rendement bonds) [NOUVEAU]
    - liquidity: Log(market_cap ou AUM)
    - mean_reversion: Pénalise les sur-extensions
    
    Pari central: Quality + Momentum surperforment à horizon 1-3 ans.
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
        Facteur momentum: combinaison perf 1m/3m/YTD.
        
        v2.1: Ajout bonus Sharpe ratio pour crypto.
        
        Horizon implicite: 6-12 mois.
        """
        n = len(assets)
        
        p1m = [fnum(a.get("perf_1m")) for a in assets]
        p3m = [fnum(a.get("perf_3m")) for a in assets]
        ytd = [fnum(a.get("ytd")) for a in assets]
        
        has_3m = any(p3m)
        has_1m = any(p1m)
        
        if has_3m and has_1m:
            # Pondération standard: 3M > 1M > YTD
            raw = [0.5 * p3m[i] + 0.3 * p1m[i] + 0.2 * ytd[i] for i in range(n)]
        elif has_3m:
            raw = [0.7 * p3m[i] + 0.3 * ytd[i] for i in range(n)]
        elif has_1m:
            raw = [0.6 * p1m[i] + 0.4 * ytd[i] for i in range(n)]
        else:
            # Fallback crypto: 7d + 24h
            p7d = [fnum(a.get("perf_7d")) for a in assets]
            p24h = [fnum(a.get("perf_24h")) for a in assets]
            raw = [0.7 * p7d[i] + 0.3 * p24h[i] for i in range(n)]
        
        # v2.1: Bonus Sharpe ratio pour crypto
        for i, a in enumerate(assets):
            category = a.get("category", "").lower()
            if category == "crypto":
                sharpe = fnum(a.get("sharpe_ratio", 0))
                # Bonus/malus: Sharpe 2 → +20%, Sharpe -2 → -20%
                sharpe_bonus = max(-20, min(20, sharpe * 10))
                raw[i] += sharpe_bonus
        
        return self._zscore(raw)
    
    def compute_factor_quality_fundamental(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur qualité fondamentale: Score Buffett intégré.
        
        v2.0: Remplace "quality" (proxy DD) par scoring Buffett complet.
        """
        scores = []
        for asset in assets:
            category = asset.get("category", "").lower()
            
            if category in ["equity", "equities", "action", "actions", "stock"]:
                # Actions: utiliser le score Buffett complet
                buffett_score = compute_buffett_quality_score(asset)
                # Normaliser vers z-score compatible (centré sur 50)
                scores.append(buffett_score)
            else:
                # ETF, Crypto, Bonds: score neutre (50)
                scores.append(50.0)
        
        return self._zscore(scores)
    
    def compute_factor_low_vol(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur low volatility: inverse de la vol (vol basse = score haut).
        
        Utilisé pour contrôler le risque, pas pour générer de l'alpha.
        """
        vol = [fnum(a.get("vol_3y") or a.get("vol30") or a.get("vol_annual") or a.get("vol") or 20) for a in assets]
        return -self._zscore(vol)
    
    def compute_factor_cost_efficiency(self, assets: List[dict]) -> np.ndarray:
        """
        v2.1 NOUVEAU: Facteur coût/rendement pour ETF et Bonds.
        
        - Pénalise TER élevé (Total Expense Ratio)
        - Bonifie yield_ttm pour bonds ETF
        - Neutre pour actions et crypto (pas de TER)
        
        Score: TER bas + Yield élevé = meilleur score
        """
        scores = []
        
        for a in assets:
            category = a.get("category", "").lower()
            fund_type = str(a.get("fund_type", "")).lower()
            
            if category in ["etf", "bond", "bonds"]:
                # === TER Score ===
                # TER est en décimal (0.003 = 0.3%) ou en pourcentage selon source
                ter_raw = fnum(a.get("total_expense_ratio", 0))
                
                # Normaliser: si > 1, c'est déjà en %, sinon convertir
                ter_pct = ter_raw * 100 if ter_raw < 1 else ter_raw
                
                # Score TER: 0% → 100, 0.5% → 50, 1%+ → 0
                if ter_pct <= 0:
                    ter_score = 75.0  # Neutre si pas de données
                else:
                    ter_score = max(0, 100 - ter_pct * 100)
                
                # === Yield Score (surtout pour bonds) ===
                yield_ttm = fnum(a.get("yield_ttm", 0))
                
                if "bond" in fund_type or "bond" in category:
                    # Bonds: yield important
                    # 0% → 0, 4% → 50, 8%+ → 100
                    yield_score = min(100, yield_ttm * 12.5)
                    # Mix: 50% TER + 50% Yield pour bonds
                    final_score = 0.5 * ter_score + 0.5 * yield_score
                else:
                    # ETF actions: principalement TER, yield bonus léger
                    yield_bonus = min(20, yield_ttm * 5)  # Max 20 points bonus
                    final_score = 0.8 * ter_score + 0.2 * yield_bonus
                
                scores.append(final_score)
            else:
                # Actions et Crypto: neutre (pas de TER)
                scores.append(50.0)
        
        return self._zscore(scores)
    
    def compute_factor_liquidity(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur liquidité: log(market_cap ou AUM).
        
        Filtre technique pour éviter les small caps illiquides.
        """
        liq = [
            math.log(max(fnum(a.get("liquidity") or a.get("market_cap") or a.get("aum_usd") or 1), 1))
            for a in assets
        ]
        return self._zscore(liq)
    
    def compute_factor_mean_reversion(self, assets: List[dict]) -> np.ndarray:
        """
        Facteur mean reversion: pénalise les sur-extensions.
        
        YTD très élevé + momentum récent faible = risque de retournement.
        """
        scores = []
        
        for a in assets:
            ytd = fnum(a.get("ytd"))
            p1m = fnum(a.get("perf_1m"))
            
            # Flag sur-extension forte
            if ytd > 80 and p1m <= 0:
                scores.append(-1.5)  # Pénalité forte
            elif ytd > 50 and p1m <= 2:
                scores.append(-0.5)  # Pénalité modérée
            elif ytd > 100:
                scores.append(-1.0)  # Très sur-étendu
            elif ytd > 150:
                scores.append(-2.0)  # Extrême
            else:
                scores.append(0.0)  # Neutre
        
        return np.array(scores)
    
    def compute_scores(self, assets: List[dict]) -> List[dict]:
        """
        Calcule le score composite pour chaque actif.
        
        v2.1: Ajout facteur cost_efficiency.
        v2.0: SEUL moteur d'alpha — utilisé directement par l'optimizer.
        
        Args:
            assets: Liste d'actifs avec leurs métriques
        
        Returns:
            assets enrichis avec 'factor_scores', 'composite_score', 'score'
        """
        if not assets:
            return assets
        
        n = len(assets)
        
        # Calculer chaque facteur
        factors = {
            "momentum": self.compute_factor_momentum(assets),
            "quality_fundamental": self.compute_factor_quality_fundamental(assets),
            "low_vol": self.compute_factor_low_vol(assets),
            "cost_efficiency": self.compute_factor_cost_efficiency(assets),  # v2.1
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
            asset["score"] = asset["composite_score"]  # Alias pour compatibilité
            
            # Ajouter le score Buffett brut pour diagnostics
            if asset.get("category", "").lower() in ["equity", "equities", "action", "actions", "stock"]:
                asset["buffett_score"] = compute_buffett_quality_score(asset)
            
            # Flag sur-extension pour diagnostics
            ytd = fnum(asset.get("ytd"))
            p1m = fnum(asset.get("perf_1m"))
            asset["flags"] = {
                "overextended": (ytd > 80 and p1m <= 0) or (ytd > 150)
            }
        
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
    
    v2.1: Utilise FactorScorer avec cost_efficiency.
    v2.0: Utilise FactorScorer comme SEUL moteur d'alpha.
    
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
            "quality_fundamental": w.quality_fundamental,
            "low_vol": w.low_vol,
            "cost_efficiency": w.cost_efficiency,  # v2.1
            "liquidity": w.liquidity,
            "mean_reversion": w.mean_reversion,
        }
        for profile, w in PROFILE_WEIGHTS.items()
    }


def compare_factor_profiles() -> str:
    """Génère une comparaison textuelle des profils."""
    lines = [
        "Comparaison des poids factoriels par profil (v2.1):",
        "",
        "PARI CENTRAL: Quality + Momentum surperforment à horizon 1-3 ans.",
        ""
    ]
    
    factors = ["momentum", "quality_fundamental", "low_vol", "cost_efficiency", "liquidity", "mean_reversion"]
    header = f"{'Facteur':<20} | {'Agressif':>10} | {'Modéré':>10} | {'Stable':>10}"
    lines.append(header)
    lines.append("-" * len(header))
    
    for factor in factors:
        vals = [getattr(PROFILE_WEIGHTS[p], factor) for p in ["Agressif", "Modéré", "Stable"]]
        line = f"{factor:<20} | {vals[0]:>10.0%} | {vals[1]:>10.0%} | {vals[2]:>10.0%}"
        lines.append(line)
    
    return "\n".join(lines)


# ============= DIAGNOSTIC =============

def get_quality_coverage(assets: List[dict]) -> Dict[str, float]:
    """
    Calcule le taux de couverture des métriques de qualité.
    
    v2.1: Ajout couverture TER et yield_ttm.
    
    Returns:
        Dict avec % d'actifs ayant chaque métrique.
    """
    if not assets:
        return {}
    
    total = len(assets)
    equities = [a for a in assets if a.get("category", "").lower() in ["equity", "equities", "action", "actions", "stock"]]
    etf_bonds = [a for a in assets if a.get("category", "").lower() in ["etf", "bond", "bonds"]]
    n_eq = len(equities) or 1
    n_etf = len(etf_bonds) or 1
    
    return {
        # Métriques actions
        "roe": round(sum(1 for a in equities if fnum(a.get("roe")) > 0) / n_eq * 100, 1),
        "roic": round(sum(1 for a in equities if fnum(a.get("roic")) > 0) / n_eq * 100, 1),
        "fcf_yield": round(sum(1 for a in equities if a.get("fcf_yield") is not None) / n_eq * 100, 1),
        "de_ratio": round(sum(1 for a in equities if fnum(a.get("de_ratio")) >= 0) / n_eq * 100, 1),
        "eps_growth_5y": round(sum(1 for a in equities if a.get("eps_growth_5y") is not None) / n_eq * 100, 1),
        # v2.1: Métriques ETF/Bonds
        "total_expense_ratio": round(sum(1 for a in etf_bonds if fnum(a.get("total_expense_ratio")) > 0) / n_etf * 100, 1),
        "yield_ttm": round(sum(1 for a in etf_bonds if fnum(a.get("yield_ttm")) > 0) / n_etf * 100, 1),
        # Compteurs
        "equities_count": len(equities),
        "etf_bonds_count": len(etf_bonds),
        "total_count": total,
    }
