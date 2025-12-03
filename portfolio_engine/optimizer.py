# portfolio_engine/optimizer.py
"""
Optimiseur de portefeuille v3 — Avec fallback robuste.

Corrections v3:
1. Fallback score-based si SLSQP échoue
2. Matrice covariance régularisée (positive semi-définie)
3. Calcul vol robuste (jamais NaN)
4. Contraintes relaxées progressivement si incompatibles
5. Nettoyage des NaN/Inf dans les volatilités
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


def _clean_float(value, default: float = 15.0, min_val: float = 0.1, max_val: float = 200.0) -> float:
    """Nettoie une valeur float (gère NaN, Inf, None)."""
    try:
        v = float(value) if value is not None else default
        if np.isnan(v) or np.isinf(v):
            return default
        return max(min_val, min(v, max_val))
    except (TypeError, ValueError):
        return default


class PortfolioOptimizer:
    """
    Optimiseur mean-variance avec fallback robuste.
    
    Le LLM n'intervient PAS — les poids sont déterministes.
    """
    
    def __init__(self, score_scale: float = 1.0):
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
            
            if asset.category == "Crypto":
                if profile.crypto_max == 0:
                    continue
                if category_count["Crypto"] >= 3:
                    continue
            
            if sector_count[asset.sector] >= 8:
                continue
            
            selected.append(asset)
            sector_count[asset.sector] += 1
            category_count[asset.category] += 1
        
        logger.info(f"Pool candidats: {len(selected)} actifs pour {profile.name}")
        return selected
    
    def compute_covariance(self, assets: List[Asset]) -> np.ndarray:
        """Matrice de covariance régularisée et positive semi-définie."""
        n = len(assets)
        
        # Covariance empirique si séries disponibles
        if all(a.returns_series is not None and len(a.returns_series) >= 60 for a in assets):
            returns = np.column_stack([a.returns_series for a in assets])
            # Nettoyer les NaN
            returns = np.nan_to_num(returns, nan=0.0, posinf=0.0, neginf=0.0)
            cov = np.cov(returns, rowvar=False) * 252
            cov = self._ensure_positive_definite(cov)
            return cov
        
        # Fallback structuré avec corrélations réalistes
        cov = np.zeros((n, n))
        
        CORR_SAME_CATEGORY = 0.60
        CORR_SAME_SECTOR = 0.45
        CORR_EQUITY_BOND = -0.20
        CORR_CRYPTO_OTHER = 0.25
        CORR_DEFAULT = 0.15
        
        # Volatilités par défaut par catégorie
        DEFAULT_VOLS = {
            "Actions": 25.0,
            "ETF": 15.0,
            "Obligations": 5.0,
            "Crypto": 80.0,
        }
        
        for i, ai in enumerate(assets):
            for j, aj in enumerate(assets):
                # Nettoyer les volatilités
                default_vol_i = DEFAULT_VOLS.get(ai.category, 15.0)
                default_vol_j = DEFAULT_VOLS.get(aj.category, 15.0)
                
                vol_i = _clean_float(ai.vol_annual, default_vol_i, 1.0, 150.0) / 100
                vol_j = _clean_float(aj.vol_annual, default_vol_j, 1.0, 150.0) / 100
                
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
        
        cov = self._ensure_positive_definite(cov)
        return cov
    
    def _ensure_positive_definite(self, cov: np.ndarray, min_eigenvalue: float = 1e-6) -> np.ndarray:
        """Force la matrice à être positive semi-définie."""
        # Nettoyer les NaN/Inf d'abord
        cov = np.nan_to_num(cov, nan=0.0, posinf=0.0, neginf=0.0)
        
        # Symétriser
        cov = (cov + cov.T) / 2
        
        # Ajouter régularisation diagonale
        n = cov.shape[0]
        cov += np.eye(n) * min_eigenvalue
        
        try:
            # Décomposition en valeurs propres
            eigenvalues, eigenvectors = np.linalg.eigh(cov)
            
            # Forcer les valeurs propres positives
            eigenvalues = np.maximum(eigenvalues, min_eigenvalue)
            
            # Reconstruire
            cov_fixed = eigenvectors @ np.diag(eigenvalues) @ eigenvectors.T
            
            # Re-symétriser (précaution numérique)
            cov_fixed = (cov_fixed + cov_fixed.T) / 2
            
            return cov_fixed
        except Exception as e:
            logger.warning(f"Eigenvalue decomposition failed: {e}, using diagonal matrix")
            # Fallback: matrice diagonale simple
            diag_vals = np.maximum(np.diag(cov), min_eigenvalue)
            return np.diag(diag_vals)
    
    def _compute_portfolio_vol(self, weights: np.ndarray, cov: np.ndarray) -> float:
        """Calcul robuste de la volatilité du portefeuille."""
        try:
            # Nettoyer les poids
            weights = np.nan_to_num(weights, nan=0.0, posinf=0.0, neginf=0.0)
            
            variance = np.dot(weights, np.dot(cov, weights))
            if variance < 0 or np.isnan(variance) or np.isinf(variance):
                variance = 0
            vol = np.sqrt(variance) * 100
            
            if np.isnan(vol) or np.isinf(vol):
                # Fallback: moyenne pondérée des vols individuelles
                individual_vols = np.sqrt(np.maximum(np.diag(cov), 0)) * 100
                vol = np.dot(np.abs(weights), individual_vols)
            
            return float(vol) if not np.isnan(vol) else 15.0
        except Exception:
            return 15.0  # Default fallback
    
    def _build_constraints(
        self, 
        candidates: List[Asset], 
        profile: ProfileConstraints,
        cov: np.ndarray
    ) -> List[dict]:
        """Construit les contraintes."""
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
        scores = np.nan_to_num(scores, nan=0.0)
        if scores.std() < 1e-6:
            return np.zeros_like(scores)
        return (scores - scores.mean()) / scores.std()
    
    def _fallback_allocation(
        self,
        candidates: List[Asset],
        profile: ProfileConstraints
    ) -> Dict[str, float]:
        """
        Allocation fallback basée sur les scores (sans optimisation).
        Utilisée quand SLSQP échoue.
        """
        logger.warning(f"Utilisation du fallback score-based pour {profile.name}")
        
        # Trier par score
        sorted_candidates = sorted(candidates, key=lambda a: a.score, reverse=True)
        
        allocation = {}
        total_weight = 0
        
        # Catégories tracking
        category_weights = defaultdict(float)
        sector_weights = defaultdict(float)
        
        # D'abord, assurer bonds minimum
        bonds = [a for a in sorted_candidates if a.category == "Obligations"]
        bonds_needed = profile.bonds_min
        
        for bond in bonds[:8]:  # Max 8 obligations
            if bonds_needed <= 0:
                break
            weight = min(profile.max_single_position, bonds_needed, 100 - total_weight)
            if weight > 0.5:
                allocation[bond.id] = weight
                total_weight += weight
                bonds_needed -= weight
                category_weights["Obligations"] += weight
                sector_weights[bond.sector] += weight
        
        # Ensuite, remplir avec les meilleurs scores
        remaining = 100 - total_weight
        target_per_asset = remaining / max(profile.max_assets - len(allocation), 1)
        
        for asset in sorted_candidates:
            if asset.id in allocation:
                continue
            if len(allocation) >= profile.max_assets:
                break
            if total_weight >= 99.5:
                break
            
            # Vérifier contraintes
            if asset.category == "Crypto":
                if category_weights["Crypto"] >= profile.crypto_max:
                    continue
                max_allowed = profile.crypto_max - category_weights["Crypto"]
            else:
                max_allowed = profile.max_single_position
            
            # Vérifier secteur
            if sector_weights[asset.sector] >= profile.max_sector:
                continue
            max_sector_allowed = profile.max_sector - sector_weights[asset.sector]
            
            weight = min(target_per_asset, max_allowed, max_sector_allowed, 100 - total_weight)
            
            if weight > 0.5:
                allocation[asset.id] = round(weight, 2)
                total_weight += weight
                category_weights[asset.category] += weight
                sector_weights[asset.sector] += weight
        
        # Normaliser à 100%
        if total_weight > 0:
            factor = 100 / total_weight
            allocation = {k: round(v * factor, 2) for k, v in allocation.items()}
        
        return allocation
    
    def optimize(
        self, 
        candidates: List[Asset], 
        profile: ProfileConstraints
    ) -> Tuple[Dict[str, float], dict]:
        """
        Optimisation mean-variance avec fallback.
        """
        n = len(candidates)
        if n < profile.min_assets:
            raise ValueError(f"Pool insuffisant ({n} < {profile.min_assets})")
        
        raw_scores = np.array([_clean_float(a.score, 0.0, -100, 100) for a in candidates])
        scores = self._normalize_scores(raw_scores) * self.score_scale
        
        cov = self.compute_covariance(candidates)
        vol_target = profile.vol_target / 100
        
        # Objectif: max score - pénalité vol
        def objective(w):
            port_score = np.dot(w, scores)
            port_var = np.dot(w, np.dot(cov, w))
            port_vol = np.sqrt(max(port_var, 0))
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
        
        # Vérifier convergence
        if result.success:
            weights = result.x.copy()
            weights = self._enforce_asset_count(weights, candidates, profile)
            
            allocation = {}
            for i, w in enumerate(weights):
                if w > 0.005:
                    allocation[candidates[i].id] = round(w * 100, 2)
            
            allocation = self._adjust_to_100(allocation, profile)
            optimizer_converged = True
        else:
            # FALLBACK: allocation basée sur les scores
            logger.warning(f"SLSQP failed for {profile.name}: {result.message}")
            allocation = self._fallback_allocation(candidates, profile)
            optimizer_converged = False
        
        # Diagnostics (toujours calculés)
        final_weights = np.array([allocation.get(c.id, 0)/100 for c in candidates])
        port_vol = self._compute_portfolio_vol(final_weights, cov)
        port_score = np.dot(final_weights, raw_scores)
        
        sector_exposure = defaultdict(float)
        for asset_id, weight in allocation.items():
            asset = next((a for a in candidates if a.id == asset_id), None)
            if asset:
                sector_exposure[asset.sector] += weight
        
        diagnostics = {
            "converged": optimizer_converged,
            "message": result.message if result.success else "Fallback score-based",
            "portfolio_vol": round(port_vol, 2),
            "vol_target": profile.vol_target,
            "portfolio_score": round(float(port_score), 3),
            "n_assets": len(allocation),
            "sectors": dict(sector_exposure),
        }
        
        logger.info(
            f"{profile.name}: {len(allocation)} actifs, "
            f"vol={port_vol:.1f}% (cible={profile.vol_target}%), "
            f"score={port_score:.2f}, "
            f"converged={optimizer_converged}"
        )
        
        return allocation, diagnostics
    
    def _enforce_asset_count(
        self, 
        weights: np.ndarray, 
        candidates: List[Asset],
        profile: ProfileConstraints
    ) -> np.ndarray:
        """Force le nombre d'actifs dans la fourchette souple."""
        weights = np.nan_to_num(weights, nan=0.0)
        active = np.sum(weights > 0.005)
        
        if active < profile.min_assets:
            sorted_idx = np.argsort(weights)[::-1]
            to_add = profile.min_assets - int(active)
            
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
            to_remove = int(active) - profile.max_assets
            
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
    """
    assets = []
    
    if isinstance(universe, list):
        for item in universe:
            category = item.get("category", "").lower()
            
            if category in ["equity", "equities", "action", "actions", "stock"]:
                cat_normalized = "Actions"
                default_vol = 25
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
                cat_normalized = "ETF"
                default_vol = 15
            
            original_id = (
                item.get("id") or 
                item.get("ticker") or 
                item.get("symbol") or 
                item.get("isin") or 
                item.get("name", f"ASSET_{len(assets)+1}")
            )
            
            # Nettoyer la volatilité
            raw_vol = item.get("vol_3y") or item.get("vol30") or item.get("vol_annual") or item.get("vol")
            vol_annual = _clean_float(raw_vol, default_vol, 1.0, 150.0)
            
            # Nettoyer le score
            raw_score = item.get("score") or item.get("composite_score") or item.get("adjusted_score")
            score = _clean_float(raw_score, 0.0, -100, 100)
            
            assets.append(Asset(
                id=original_id,
                name=item.get("name", original_id),
                category=cat_normalized,
                sector=item.get("sector", "Unknown"),
                region=item.get("country", item.get("region", "Global")),
                score=score,
                vol_annual=vol_annual,
                source_data=item,
            ))
        
        logger.info(f"Univers converti (liste plate): {len(assets)} actifs")
        return assets
    
    # Si c'est un dict, traiter chaque catégorie
    for eq in universe.get("equities", []):
        original_id = eq.get("id") or eq.get("ticker") or eq.get("symbol") or eq.get("name", "")
        if not original_id:
            original_id = f"EQ_{len(assets)+1}"
        
        raw_vol = eq.get("vol_3y") or eq.get("vol_annual")
        vol_annual = _clean_float(raw_vol, 25.0, 1.0, 150.0)
        
        assets.append(Asset(
            id=original_id,
            name=eq.get("name", original_id),
            category="Actions",
            sector=eq.get("sector", "Unknown"),
            region=eq.get("country", "Global"),
            score=_clean_float(eq.get("score") or eq.get("composite_score"), 0.0, -100, 100),
            vol_annual=vol_annual,
            source_data=eq,
        ))
    
    for etf in universe.get("etfs", []):
        original_id = etf.get("id") or etf.get("ticker") or etf.get("isin") or etf.get("name", "")
        if not original_id:
            original_id = f"ETF_{len([a for a in assets if 'ETF' in a.id])+1}"
        
        raw_vol = etf.get("vol_3y") or etf.get("vol30")
        vol_annual = _clean_float(raw_vol, 15.0, 1.0, 150.0)
        
        assets.append(Asset(
            id=original_id,
            name=etf.get("name", original_id),
            category="ETF",
            sector=etf.get("sector", "Diversified"),
            region=etf.get("country", "Global"),
            score=_clean_float(etf.get("score") or etf.get("composite_score"), 0.0, -100, 100),
            vol_annual=vol_annual,
            source_data=etf,
        ))
    
    for bond in universe.get("bonds", []):
        original_id = bond.get("id") or bond.get("isin") or bond.get("name", "")
        if not original_id:
            original_id = f"BOND_{len([a for a in assets if 'BOND' in a.id])+1}"
        
        raw_vol = bond.get("vol_3y") or bond.get("vol30")
        vol_annual = _clean_float(raw_vol, 5.0, 1.0, 50.0)
        
        assets.append(Asset(
            id=original_id,
            name=bond.get("name", original_id),
            category="Obligations",
            sector="Bonds",
            region=bond.get("country", "Global"),
            score=_clean_float(bond.get("score") or bond.get("composite_score"), 0.0, -100, 100),
            vol_annual=vol_annual,
            source_data=bond,
        ))
    
    for cr in universe.get("crypto", []):
        original_id = cr.get("id") or cr.get("symbol") or cr.get("name", "")
        if not original_id:
            original_id = f"CRYPTO_{len([a for a in assets if 'CRYPTO' in a.id])+1}"
        
        raw_vol = cr.get("vol_3y") or cr.get("vol30")
        vol_annual = _clean_float(raw_vol, 80.0, 10.0, 200.0)
        
        assets.append(Asset(
            id=original_id,
            name=cr.get("name", original_id),
            category="Crypto",
            sector="Crypto",
            region="Global",
            score=_clean_float(cr.get("score") or cr.get("composite_score"), 0.0, -100, 100),
            vol_annual=vol_annual,
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
    
    total = sum(allocation.values())
    if abs(total - 100) > 0.1:
        errors.append(f"Somme = {total:.2f}% (≠ 100%)")
    
    n_assets = len(allocation)
    if n_assets < profile.min_assets:
        warnings_list.append(f"Seulement {n_assets} lignes (< {profile.min_assets})")
    if n_assets > profile.max_assets:
        warnings_list.append(f"{n_assets} lignes (> {profile.max_assets})")
    
    for asset_id, weight in allocation.items():
        if weight > profile.max_single_position + 0.1:
            errors.append(f"{asset_id}: {weight:.2f}% > max {profile.max_single_position}%")
    
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
