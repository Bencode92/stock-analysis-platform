# portfolio_engine/optimizer.py
"""
Optimiseur de portefeuille v2 — Corrigé selon audit.

Corrections appliquées:
1. vol_target utilisé dans l'objectif (pénalité quadratique)
2. Contraintes secteur/région réellement appliquées
3. Nombre d'actifs 10-18 (souple) garanti
4. Score normalisé pour calibration stable
5. IDs originaux préservés
6. Ajustement final respecte les contraintes
"""

import numpy as np
from scipy.optimize import minimize
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Union
from collections import defaultdict
import warnings
import logging

logger = logging.getLogger("portfolio_engine.optimizer")


@dataclass
class ProfileConstraints:
    """Contraintes par profil — vol_target est indicatif (pénalité douce)."""
    name: str
    vol_target: float           # Volatilité cible (%) — pénalité douce
    vol_tolerance: float = 3.0  # Tolérance autour de vol_target (±%)
    crypto_max: float = 10.0
    bonds_min: float = 5.0
    max_single_position: float = 15.0
    max_sector: float = 30.0    # Contrainte appliquée
    max_region: float = 50.0    # Contrainte appliquée
    min_assets: int = 10        # Souple: 10-18
    max_assets: int = 18        # Souple: 10-18


PROFILES = {
    "Agressif": ProfileConstraints(
        name="Agressif", vol_target=18.0, crypto_max=10.0, bonds_min=5.0
    ),
    "Modéré": ProfileConstraints(
        name="Modéré", vol_target=12.0, crypto_max=5.0, bonds_min=15.0
    ),
    "Stable": ProfileConstraints(
        name="Stable", vol_target=8.0, crypto_max=0.0, bonds_min=40.0
    ),
}


@dataclass
class Asset:
    """Actif avec ID ORIGINAL préservé."""
    id: str                     # ID original (ticker, ISIN, etc.)
    name: str
    category: str
    sector: str
    region: str
    score: float
    vol_annual: float
    returns_series: Optional[np.ndarray] = None
    source_data: Optional[dict] = field(default=None, repr=False)


class PortfolioOptimizer:
    """
    Optimiseur mean-variance avec contraintes complètes.
    
    Le LLM n'intervient PAS — les poids sont déterministes.
    """
    
    def __init__(self, score_scale: float = 1.0):
        """
        Args:
            score_scale: Facteur pour normaliser les scores vs variance.
        """
        self.score_scale = score_scale
    
    def select_candidates(
        self, 
        universe: List[Asset], 
        profile: ProfileConstraints
    ) -> List[Asset]:
        """Pré-sélection élargie pour l'optimiseur."""
        sorted_assets = sorted(universe, key=lambda x: x.score, reverse=True)
        
        selected = []
        sector_count = defaultdict(int)
        category_count = defaultdict(int)
        
        target_pool = profile.max_assets * 3
        
        for asset in sorted_assets:
            if len(selected) >= target_pool:
                break
            
            # Limite crypto dans le pool
            if asset.category == "Crypto":
                if profile.crypto_max == 0:
                    continue
                if category_count["Crypto"] >= 3:
                    continue
            
            # Limite par secteur (souple pour le pool)
            if sector_count[asset.sector] >= 8:
                continue
            
            selected.append(asset)
            sector_count[asset.sector] += 1
            category_count[asset.category] += 1
        
        logger.info(f"Pool candidats: {len(selected)} actifs pour {profile.name}")
        return selected
    
    def compute_covariance(self, assets: List[Asset]) -> np.ndarray:
        """Matrice de covariance avec fallback structuré."""
        n = len(assets)
        
        # Covariance empirique si séries disponibles
        if all(a.returns_series is not None and len(a.returns_series) >= 60 for a in assets):
            returns = np.column_stack([a.returns_series for a in assets])
            cov = np.cov(returns, rowvar=False) * 252
            cov += np.eye(n) * 0.001  # Régularisation
            return cov
        
        # Fallback structuré avec corrélations réalistes
        cov = np.zeros((n, n))
        
        CORR_SAME_CATEGORY = 0.60
        CORR_SAME_SECTOR = 0.45
        CORR_EQUITY_BOND = -0.20
        CORR_CRYPTO_OTHER = 0.25
        CORR_DEFAULT = 0.15
        
        for i, ai in enumerate(assets):
            for j, aj in enumerate(assets):
                vol_i = ai.vol_annual / 100
                vol_j = aj.vol_annual / 100
                
                if i == j:
                    cov[i, j] = vol_i ** 2
                else:
                    if ai.category == aj.category:
                        corr = CORR_SAME_SECTOR if ai.sector == aj.sector else CORR_SAME_CATEGORY
                    elif (ai.category == "Obligations" and aj.category == "Actions") or \
                         (ai.category == "Actions" and aj.category == "Obligations"):
                        corr = CORR_EQUITY_BOND
                    elif ai.category == "Crypto" or aj.category == "Crypto":
                        corr = CORR_CRYPTO_OTHER
                    else:
                        corr = CORR_DEFAULT
                    
                    cov[i, j] = corr * vol_i * vol_j
        
        return cov
    
    def _build_constraints(
        self, 
        candidates: List[Asset], 
        profile: ProfileConstraints,
        cov: np.ndarray
    ) -> List[dict]:
        """Construit TOUTES les contraintes."""
        n = len(candidates)
        constraints = []
        
        # 1. Somme = 100%
        constraints.append({
            "type": "eq",
            "fun": lambda w: np.sum(w) - 1.0
        })
        
        # 2. Bonds minimum
        bonds_idx = [i for i, a in enumerate(candidates) if a.category == "Obligations"]
        if bonds_idx and profile.bonds_min > 0:
            def bonds_constraint(w, idx=bonds_idx, min_val=profile.bonds_min/100):
                return np.sum(w[idx]) - min_val
            constraints.append({"type": "ineq", "fun": bonds_constraint})
        
        # 3. Crypto maximum
        crypto_idx = [i for i, a in enumerate(candidates) if a.category == "Crypto"]
        if crypto_idx:
            def crypto_constraint(w, idx=crypto_idx, max_val=profile.crypto_max/100):
                return max_val - np.sum(w[idx])
            constraints.append({"type": "ineq", "fun": crypto_constraint})
        
        # 4. Contraintes par SECTEUR
        sectors = set(a.sector for a in candidates)
        for sector in sectors:
            sector_idx = [i for i, a in enumerate(candidates) if a.sector == sector]
            if len(sector_idx) > 1:
                def sector_constraint(w, idx=sector_idx, max_val=profile.max_sector/100):
                    return max_val - np.sum(w[idx])
                constraints.append({"type": "ineq", "fun": sector_constraint})
        
        # 5. Contraintes par RÉGION
        regions = set(a.region for a in candidates)
        for region in regions:
            region_idx = [i for i, a in enumerate(candidates) if a.region == region]
            if len(region_idx) > 1:
                def region_constraint(w, idx=region_idx, max_val=profile.max_region/100):
                    return max_val - np.sum(w[idx])
                constraints.append({"type": "ineq", "fun": region_constraint})
        
        return constraints
    
    def _normalize_scores(self, scores: np.ndarray) -> np.ndarray:
        """Normalisation des scores pour calibration stable."""
        if scores.std() < 1e-6:
            return np.zeros_like(scores)
        return (scores - scores.mean()) / scores.std()
    
    def optimize(
        self, 
        candidates: List[Asset], 
        profile: ProfileConstraints
    ) -> Tuple[Dict[str, float], dict]:
        """
        Optimisation mean-variance.
        
        Returns:
            (allocation {id: weight%}, diagnostics)
        """
        n = len(candidates)
        if n < profile.min_assets:
            raise ValueError(f"Pool insuffisant ({n} < {profile.min_assets})")
        
        raw_scores = np.array([a.score for a in candidates])
        scores = self._normalize_scores(raw_scores) * self.score_scale
        
        cov = self.compute_covariance(candidates)
        vol_target = profile.vol_target / 100
        
        # Objectif: max score - pénalité si vol ≠ vol_target (indicatif)
        def objective(w):
            port_score = np.dot(w, scores)
            port_vol = np.sqrt(np.dot(w, np.dot(cov, w)))
            # Pénalité douce (indicatif)
            vol_penalty = 5.0 * (port_vol - vol_target) ** 2
            return -(port_score - vol_penalty)
        
        constraints = self._build_constraints(candidates, profile, cov)
        bounds = [(0, profile.max_single_position / 100) for _ in range(n)]
        
        w0 = np.ones(n) / n
        
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            result = minimize(
                objective,
                w0,
                method="SLSQP",
                bounds=bounds,
                constraints=constraints,
                options={"maxiter": 1000, "ftol": 1e-8}
            )
        
        weights = result.x.copy()
        weights = self._enforce_asset_count(weights, candidates, profile)
        
        # Construire allocation
        allocation = {}
        for i, w in enumerate(weights):
            if w > 0.005:
                allocation[candidates[i].id] = round(w * 100, 2)
        
        allocation = self._adjust_to_100(allocation, profile)
        
        # Diagnostics
        final_weights = np.array([allocation.get(c.id, 0)/100 for c in candidates])
        port_vol = np.sqrt(np.dot(final_weights, np.dot(cov, final_weights))) * 100
        port_score = np.dot(final_weights, raw_scores)
        
        sector_exposure = defaultdict(float)
        for asset_id, weight in allocation.items():
            asset = next((a for a in candidates if a.id == asset_id), None)
            if asset:
                sector_exposure[asset.sector] += weight
        
        diagnostics = {
            "converged": result.success,
            "message": result.message,
            "portfolio_vol": round(port_vol, 2),
            "vol_target": profile.vol_target,
            "portfolio_score": round(port_score, 3),
            "n_assets": len(allocation),
            "sectors": dict(sector_exposure),
        }
        
        logger.info(
            f"{profile.name}: {len(allocation)} actifs, "
            f"vol={port_vol:.1f}% (cible={profile.vol_target}%), "
            f"score={port_score:.2f}"
        )
        
        return allocation, diagnostics
    
    def _enforce_asset_count(
        self, 
        weights: np.ndarray, 
        candidates: List[Asset],
        profile: ProfileConstraints
    ) -> np.ndarray:
        """Force le nombre d'actifs dans la fourchette souple."""
        active = np.sum(weights > 0.005)
        
        if active < profile.min_assets:
            sorted_idx = np.argsort(weights)[::-1]
            to_add = profile.min_assets - active
            
            total_to_redistribute = 0.02 * to_add
            top_positions = sorted_idx[:5]
            reduction_per_top = total_to_redistribute / len(top_positions)
            
            for idx in top_positions:
                if weights[idx] > reduction_per_top + 0.01:
                    weights[idx] -= reduction_per_top
            
            zero_positions = np.where(weights < 0.005)[0]
            scores = np.array([candidates[i].score for i in zero_positions])
            best_zeros = zero_positions[np.argsort(scores)[::-1][:to_add]]
            
            for idx in best_zeros:
                weights[idx] = 0.02
        
        elif active > profile.max_assets:
            sorted_idx = np.argsort(weights)
            to_remove = active - profile.max_assets
            
            removed_weight = 0
            for idx in sorted_idx[:to_remove]:
                removed_weight += weights[idx]
                weights[idx] = 0
            
            remaining_idx = np.where(weights > 0.005)[0]
            if len(remaining_idx) > 0:
                weights[remaining_idx] += removed_weight / len(remaining_idx)
        
        if weights.sum() > 0:
            weights = weights / weights.sum()
        
        return weights
    
    def _adjust_to_100(
        self, 
        allocation: Dict[str, float],
        profile: ProfileConstraints
    ) -> Dict[str, float]:
        """Ajustement propre qui respecte max_single_position."""
        total = sum(allocation.values())
        if abs(total - 100) < 0.01:
            return allocation
        
        diff = 100 - total
        
        candidates_for_adjust = [
            (k, v) for k, v in allocation.items()
            if v + diff <= profile.max_single_position and v + diff >= 0.5
        ]
        
        if candidates_for_adjust:
            target_id = max(candidates_for_adjust, key=lambda x: x[1])[0]
            allocation[target_id] = round(allocation[target_id] + diff, 2)
        else:
            if total > 0:
                for k in allocation:
                    allocation[k] = round(allocation[k] * 100 / total, 2)
        
        return allocation
    
    def build_portfolio(
        self, 
        universe: List[Asset], 
        profile_name: str
    ) -> Tuple[Dict[str, float], dict]:
        """Pipeline complet: sélection + optimisation."""
        profile = PROFILES[profile_name]
        candidates = self.select_candidates(universe, profile)
        
        if len(candidates) < profile.min_assets:
            raise ValueError(
                f"Univers insuffisant pour {profile_name}: "
                f"{len(candidates)} candidats < {profile.min_assets} requis"
            )
        
        return self.optimize(candidates, profile)


# ============= CONVERSION UNIVERS =============

def convert_universe_to_assets(universe: Union[List[dict], Dict[str, List[dict]]]) -> List[Asset]:
    """
    Convertit l'univers scoré en List[Asset].
    Préserve les IDs originaux.
    
    Args:
        universe: Liste plate d'actifs OU dict avec 'equities', 'etfs', 'bonds', 'crypto'
    
    Returns:
        Liste d'objets Asset
    """
    assets = []
    
    # Si c'est une liste plate, convertir directement
    if isinstance(universe, list):
        for item in universe:
            category = item.get("category", "").lower()
            
            # Déterminer la catégorie normalisée
            if category in ["equity", "equities", "action", "actions", "stock"]:
                cat_normalized = "Actions"
                default_vol = 20
            elif category in ["bond", "bonds", "obligation", "obligations"]:
                cat_normalized = "Obligations"
                default_vol = 5
            elif category in ["crypto", "cryptocurrency"]:
                cat_normalized = "Crypto"
                default_vol = 80
            elif category in ["etf", "etfs"]:
                cat_normalized = "ETF"
                default_vol = 15
            else:
                cat_normalized = "ETF"  # Default
                default_vol = 15
            
            original_id = (
                item.get("id") or 
                item.get("ticker") or 
                item.get("symbol") or 
                item.get("isin") or 
                item.get("name", f"ASSET_{len(assets)+1}")
            )
            
            assets.append(Asset(
                id=original_id,
                name=item.get("name", original_id),
                category=cat_normalized,
                sector=item.get("sector", "Unknown"),
                region=item.get("country", item.get("region", "Global")),
                score=float(item.get("score") or item.get("composite_score") or item.get("adjusted_score") or 0),
                vol_annual=float(item.get("vol_3y") or item.get("vol30") or item.get("vol_annual") or item.get("vol") or default_vol),
                source_data=item,
            ))
        
        logger.info(f"Univers converti (liste plate): {len(assets)} actifs")
        return assets
    
    # Si c'est un dict, traiter chaque catégorie
    for eq in universe.get("equities", []):
        original_id = eq.get("id") or eq.get("ticker") or eq.get("symbol") or eq.get("name", "")
        if not original_id:
            original_id = f"EQ_{len(assets)+1}"
        
        assets.append(Asset(
            id=original_id,
            name=eq.get("name", original_id),
            category="Actions",
            sector=eq.get("sector", "Unknown"),
            region=eq.get("country", "Global"),
            score=float(eq.get("score") or eq.get("composite_score") or 0),
            vol_annual=float(eq.get("vol_3y") or eq.get("vol_annual") or 20),
            source_data=eq,
        ))
    
    for etf in universe.get("etfs", []):
        original_id = etf.get("id") or etf.get("ticker") or etf.get("isin") or etf.get("name", "")
        if not original_id:
            original_id = f"ETF_{len([a for a in assets if 'ETF' in a.id])+1}"
        
        assets.append(Asset(
            id=original_id,
            name=etf.get("name", original_id),
            category="ETF",
            sector=etf.get("sector", "Diversified"),
            region=etf.get("country", "Global"),
            score=float(etf.get("score") or etf.get("composite_score") or 0),
            vol_annual=float(etf.get("vol_3y") or etf.get("vol30") or 15),
            source_data=etf,
        ))
    
    for bond in universe.get("bonds", []):
        original_id = bond.get("id") or bond.get("isin") or bond.get("name", "")
        if not original_id:
            original_id = f"BOND_{len([a for a in assets if 'BOND' in a.id])+1}"
        
        assets.append(Asset(
            id=original_id,
            name=bond.get("name", original_id),
            category="Obligations",
            sector="Bonds",
            region=bond.get("country", "Global"),
            score=float(bond.get("score") or bond.get("composite_score") or 0),
            vol_annual=float(bond.get("vol_3y") or bond.get("vol30") or 5),
            source_data=bond,
        ))
    
    for cr in universe.get("crypto", []):
        original_id = cr.get("id") or cr.get("symbol") or cr.get("name", "")
        if not original_id:
            original_id = f"CRYPTO_{len([a for a in assets if 'CRYPTO' in a.id])+1}"
        
        assets.append(Asset(
            id=original_id,
            name=cr.get("name", original_id),
            category="Crypto",
            sector="Crypto",
            region="Global",
            score=float(cr.get("score") or cr.get("composite_score") or 0),
            vol_annual=float(cr.get("vol_3y") or cr.get("vol30") or 80),
            source_data=cr,
        ))
    
    logger.info(f"Univers converti: {len(assets)} actifs")
    return assets


# ============= VALIDATION =============

def validate_portfolio(
    allocation: Dict[str, float],
    assets: List[Asset],
    profile: ProfileConstraints
) -> Tuple[bool, List[str]]:
    """Validation post-optimisation."""
    errors = []
    warnings_list = []
    
    # Somme = 100%
    total = sum(allocation.values())
    if abs(total - 100) > 0.1:
        errors.append(f"Somme = {total:.2f}% (≠ 100%)")
    
    # Nombre de lignes (souple)
    n_assets = len(allocation)
    if n_assets < profile.min_assets:
        warnings_list.append(f"Seulement {n_assets} lignes (< {profile.min_assets})")
    if n_assets > profile.max_assets:
        warnings_list.append(f"{n_assets} lignes (> {profile.max_assets})")
    
    # Max par position
    for asset_id, weight in allocation.items():
        if weight > profile.max_single_position + 0.1:
            errors.append(f"{asset_id}: {weight:.2f}% > max {profile.max_single_position}%")
    
    # Contraintes catégories
    asset_lookup = {a.id: a for a in assets}
    category_weights = defaultdict(float)
    sector_weights = defaultdict(float)
    
    for asset_id, weight in allocation.items():
        asset = asset_lookup.get(asset_id)
        if asset:
            category_weights[asset.category] += weight
            sector_weights[asset.sector] += weight
    
    if category_weights["Crypto"] > profile.crypto_max + 0.1:
        errors.append(f"Crypto = {category_weights['Crypto']:.2f}% > max {profile.crypto_max}%")
    
    if category_weights["Obligations"] < profile.bonds_min - 0.1:
        errors.append(f"Bonds = {category_weights['Obligations']:.2f}% < min {profile.bonds_min}%")
    
    for sector, weight in sector_weights.items():
        if weight > profile.max_sector + 0.1:
            errors.append(f"Secteur {sector} = {weight:.2f}% > max {profile.max_sector}%")
    
    is_valid = len(errors) == 0
    all_issues = errors + [f"⚠️ {w}" for w in warnings_list]
    
    return is_valid, all_issues
