# portfolio_engine/factors.py
"""
FactorScorer v2.2 — SEUL MOTEUR D'ALPHA
=======================================

v2.2 Changes (Bond Risk Factors):
- Nouveau: add_bond_risk_factors() pour enrichir DataFrames bonds
- Nouveau: f_bond_credit_score, f_bond_duration_score, f_bond_volatility_score
- Nouveau: f_bond_quality (composite 0-1) et f_bond_quality_0_100
- Nouveau: bond_risk_bucket (defensive/core/risky/very_risky)
- Intégration dans FactorScorer.compute_factor_bond_quality()

v2.1 Changes (P0 Quick Wins):
- Facteur cost_efficiency (TER + yield_ttm) pour ETF/Bonds
- Bonus Sharpe ratio pour crypto dans momentum

Facteurs:
- momentum: 45% (Agressif) → 20% (Stable) — Driver principal
- quality_fundamental: 25-30% — Score Buffett intégré (ROIC, FCF, ROE)
- low_vol: 15-35% — Contrôle du risque
- cost_efficiency: 5-10% — TER + Yield (ETF/Bonds)
- bond_quality: 0-15% — Qualité obligataire (crédit + duration + vol) [v2.2]
- liquidity: 5-10% — Filtre technique
- mean_reversion: 5% — Évite sur-extension

Le pari central:
"Des entreprises de qualité fondamentale (ROIC > 10%, FCF positif, dette maîtrisée)
avec un momentum positif sur 3-12 mois surperforment à horizon 1-3 ans."
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Union
from dataclasses import dataclass
import logging
import math

logger = logging.getLogger("portfolio_engine.factors")


# ============= RATING TO SCORE MAPPING (v2.2) =============

RATING_TO_SCORE = {
    # Government / Supranational
    "U.S. Government": 100, "GOVERNMENT": 100, "SOVEREIGN": 100,
    "Government": 100, "Sovereign": 100,

    # AAA tier
    "AAA": 95, "AAA ": 95, "AAA\n": 95, "AAA\r": 95,
    "AAA+": 95, "AAA-": 95, "AAA/Aaa": 95,
    "Aaa": 95,

    # AA tier
    "AA+": 90, "AA PLUS": 90, "AA POSITIVE": 90, "AA POS": 90,
    "AA": 85,
    "AA-": 80,
    "Aa1": 90, "Aa2": 85, "Aa3": 80,

    # A tier
    "A+": 77,
    "A": 75,
    "A-": 72,
    "A1": 77, "A2": 75, "A3": 72,

    # BBB tier (Investment Grade floor)
    "BBB+": 65,
    "BBB": 60,
    "BBB-": 55,
    "Baa1": 65, "Baa2": 60, "Baa3": 55,

    # BB tier (High Yield starts)
    "BB+": 50,
    "BB": 45,
    "BB-": 40,
    "Ba1": 50, "Ba2": 45, "Ba3": 40,

    # B tier
    "B+": 35,
    "B": 30,
    "B-": 25,
    "B1": 35, "B2": 30, "B3": 25,

    # CCC and below
    "CCC": 15, "CCC+": 17, "CCC-": 13,
    "Caa": 15, "Caa1": 15, "Caa2": 12, "Caa3": 10,
    "CC": 10, "Ca": 10,
    "C": 5, "D": 0,

    # Not rated
    "NOT RATED": 40, "NR": 40, "N/R": 40, "N/A": 40,
    "Not Rated": 40,
}


def _rating_to_score(rating: str) -> float:
    """Convertit un rating texte en score numérique (0-100)."""
    if pd.isna(rating):
        return np.nan
    s = str(rating).strip()
    return RATING_TO_SCORE.get(s) or RATING_TO_SCORE.get(s.upper(), np.nan)


# ============= BOND RISK FACTORS (v2.2) =============

def add_bond_risk_factors(df: pd.DataFrame) -> pd.DataFrame:
    """
    Enrichit un DataFrame de bonds (issu de combined_bonds.csv)
    avec des facteurs de risque/qualité obligataire.

    Colonnes utilisées :
      - bond_credit_score (0–100, calculé côté JS)
      - bond_credit_rating (texte AA, BBB+, U.S. Government… fallback)
      - bond_avg_duration (années)
      - vol_pct (vol annualisée en %)

    Ajoute les colonnes :
      - f_bond_credit_score     (0-1)
      - f_bond_duration_score   (0-1, plus court = mieux)
      - f_bond_volatility_score (0-1, plus bas = mieux)
      - f_bond_quality          (0-1, composite pondéré)
      - f_bond_quality_0_100    (0-100, pour affichage)
      - bond_risk_bucket        ('defensive' / 'core' / 'risky' / 'very_risky')
    
    Usage:
        bonds = pd.read_csv("data/combined_bonds.csv")
        bonds = add_bond_risk_factors(bonds)
        top_bonds = bonds.sort_values("f_bond_quality", ascending=False)
    """
    out = df.copy()

    # --- 1) Score de crédit (0–1) ---
    credit_num = pd.to_numeric(out.get("bond_credit_score"), errors="coerce")

    # Fallback: si score numérique manquant, utiliser bond_credit_rating texte
    if "bond_credit_rating" in out.columns:
        missing = credit_num.isna()
        if missing.any():
            from_rating = out.loc[missing, "bond_credit_rating"].map(_rating_to_score)
            credit_num = credit_num.copy()
            credit_num.loc[missing] = from_rating

    out["f_bond_credit_score"] = (credit_num / 100.0).clip(lower=0, upper=1)

    # --- 2) Score de duration (0–1, plus c'est court, mieux c'est) ---
    D_MAX = 10.0  # 10 ans = "très long" → score ≈ 0
    dur = pd.to_numeric(out.get("bond_avg_duration"), errors="coerce")
    dur_clamped = dur.clip(lower=0, upper=D_MAX)
    dur_norm = dur_clamped / D_MAX
    out["f_bond_duration_score"] = 1.0 - dur_norm  # 1 = très court, 0 = très long

    # --- 3) Score de volatilité (0–1, plus c'est bas, mieux c'est) ---
    V_MAX = 12.0  # 12% de vol annualisée = plafond
    vol = pd.to_numeric(out.get("vol_pct"), errors="coerce")
    vol_clamped = vol.clip(lower=0, upper=V_MAX)
    vol_norm = vol_clamped / V_MAX
    out["f_bond_volatility_score"] = 1.0 - vol_norm

    # --- 4) Combinaison en score global de "qualité obligataire" ---
    w_credit = 0.50
    w_duration = 0.25
    w_vol = 0.25

    f_credit = out["f_bond_credit_score"].copy()
    f_dur = out["f_bond_duration_score"].copy()
    f_vol = out["f_bond_volatility_score"].copy()

    # Pour éviter de perdre des lignes à cause de NaN → remplir par médiane
    for s in (f_credit, f_dur, f_vol):
        if s.isna().any():
            median_val = s.median()
            if pd.isna(median_val):
                median_val = 0.5  # Fallback neutre
            s.fillna(median_val, inplace=True)

    out["f_bond_quality"] = (
        w_credit * f_credit +
        w_duration * f_dur +
        w_vol * f_vol
    ).clip(lower=0, upper=1)

    out["f_bond_quality_0_100"] = (out["f_bond_quality"] * 100).round(1)

    # --- 5) Bucket de risque lisible pour la UI ---
    bins = [-np.inf, 0.3, 0.6, 0.8, np.inf]
    labels = ["very_risky", "risky", "core", "defensive"]
    out["bond_risk_bucket"] = pd.cut(out["f_bond_quality"], bins=bins, labels=labels)

    return out


def get_bond_quality_stats(df: pd.DataFrame) -> Dict[str, any]:
    """
    Retourne des statistiques sur la qualité obligataire d'un DataFrame.
    Utile pour diagnostics et monitoring.
    """
    if "f_bond_quality" not in df.columns:
        return {"error": "f_bond_quality not found - run add_bond_risk_factors first"}
    
    quality = df["f_bond_quality"]
    bucket_counts = df["bond_risk_bucket"].value_counts().to_dict() if "bond_risk_bucket" in df.columns else {}
    
    return {
        "count": len(df),
        "quality_mean": round(quality.mean(), 3) if not quality.isna().all() else None,
        "quality_median": round(quality.median(), 3) if not quality.isna().all() else None,
        "quality_std": round(quality.std(), 3) if not quality.isna().all() else None,
        "quality_min": round(quality.min(), 3) if not quality.isna().all() else None,
        "quality_max": round(quality.max(), 3) if not quality.isna().all() else None,
        "buckets": bucket_counts,
        "coverage": {
            "credit_score": round((~df["f_bond_credit_score"].isna()).mean() * 100, 1),
            "duration_score": round((~df["f_bond_duration_score"].isna()).mean() * 100, 1),
            "volatility_score": round((~df["f_bond_volatility_score"].isna()).mean() * 100, 1),
        }
    }


# ============= FACTOR WEIGHTS v2.2 =============

@dataclass
class FactorWeights:
    """
    Poids des facteurs pour un profil donné.
    
    v2.2: Ajout bond_quality pour les fonds obligataires.
    v2.1: Ajout cost_efficiency (TER + Yield) pour ETF/Bonds.
    v2.0: quality_fundamental remplace quality (proxy DD) et intègre Buffett.
    """
    momentum: float = 0.30           # Driver principal d'alpha
    quality_fundamental: float = 0.25  # Score Buffett (ROIC, FCF, ROE, D/E)
    low_vol: float = 0.25            # Contrôle risque
    cost_efficiency: float = 0.05    # TER + Yield (ETF/Bonds)
    bond_quality: float = 0.00       # v2.2: Qualité obligataire (bonds only)
    liquidity: float = 0.10          # Filtre technique
    mean_reversion: float = 0.05     # Évite sur-extension


# Configurations par profil — PARI CENTRAL EXPLICITE
PROFILE_WEIGHTS = {
    "Agressif": FactorWeights(
        momentum=0.45,              # Driver principal fort
        quality_fundamental=0.25,   # Buffett toujours important
        low_vol=0.10,               # Accepte plus de vol
        cost_efficiency=0.05,       # Coûts moins prioritaires
        bond_quality=0.00,          # v2.2: Pas pertinent pour profil agressif
        liquidity=0.10,
        mean_reversion=0.05
    ),
    "Modéré": FactorWeights(
        momentum=0.30,              # Équilibré
        quality_fundamental=0.25,   # Qualité renforcée
        low_vol=0.18,               # Contrôle risque
        cost_efficiency=0.07,       # Coûts importants
        bond_quality=0.08,          # v2.2: Qualité bonds compte
        liquidity=0.07,
        mean_reversion=0.05
    ),
    "Stable": FactorWeights(
        momentum=0.15,              # Momentum réduit
        quality_fundamental=0.20,   # Qualité importante
        low_vol=0.25,               # Risque minimal prioritaire
        cost_efficiency=0.10,       # Coûts très importants (long terme)
        bond_quality=0.15,          # v2.2: Qualité bonds très importante
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


# ============= FACTOR SCORER v2.2 =============

class FactorScorer:
    """
    Calcule des scores multi-facteur adaptés au profil.
    
    v2.2 — Ajout bond_quality:
    - momentum: Performance récente (1m/3m/YTD) + Sharpe bonus (crypto)
    - quality_fundamental: Score Buffett intégré (ROIC, FCF, ROE, D/E)
    - low_vol: Inverse de la volatilité
    - cost_efficiency: TER (coûts) + yield_ttm (rendement bonds)
    - bond_quality: Crédit + Duration + Vol pour bonds [NOUVEAU v2.2]
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
        vol = [fnum(a.get("vol_3y") or a.get("vol30") or a.get("vol_annual") or a.get("vol") or a.get("vol_pct") or 20) for a in assets]
        return -self._zscore(vol)
    
    def compute_factor_cost_efficiency(self, assets: List[dict]) -> np.ndarray:
        """
        v2.1: Facteur coût/rendement pour ETF et Bonds.
        
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
                    yield_score = min(100, yield_ttm * 12.5)
                    final_score = 0.5 * ter_score + 0.5 * yield_score
                else:
                    # ETF actions: principalement TER, yield bonus léger
                    yield_bonus = min(20, yield_ttm * 5)
                    final_score = 0.8 * ter_score + 0.2 * yield_bonus
                
                scores.append(final_score)
            else:
                # Actions et Crypto: neutre (pas de TER)
                scores.append(50.0)
        
        return self._zscore(scores)
    
    def compute_factor_bond_quality(self, assets: List[dict]) -> np.ndarray:
        """
        v2.2 NOUVEAU: Facteur qualité obligataire spécifique.
        
        Combine:
        - Score crédit (bond_credit_score ou fallback rating)
        - Score duration (plus court = mieux)
        - Score volatilité (plus bas = mieux)
        
        Neutre pour non-bonds.
        """
        scores = []
        
        for a in assets:
            category = a.get("category", "").lower()
            fund_type = str(a.get("fund_type", "")).lower()
            
            is_bond = "bond" in category or "bond" in fund_type
            
            if is_bond:
                # === Score crédit (0-1) ===
                credit_raw = fnum(a.get("bond_credit_score", 0))
                if credit_raw <= 0:
                    # Fallback sur rating texte
                    rating = a.get("bond_credit_rating", "")
                    credit_raw = _rating_to_score(rating) if rating else 50.0
                    if pd.isna(credit_raw):
                        credit_raw = 50.0
                f_credit = min(1.0, max(0.0, credit_raw / 100.0))
                
                # === Score duration (0-1, plus court = mieux) ===
                D_MAX = 10.0
                dur = fnum(a.get("bond_avg_duration", 5))  # Default 5 ans
                f_dur = 1.0 - min(1.0, max(0.0, dur / D_MAX))
                
                # === Score volatilité (0-1, plus bas = mieux) ===
                V_MAX = 12.0
                vol = fnum(a.get("vol_pct") or a.get("vol_3y") or 6)  # Default 6%
                f_vol = 1.0 - min(1.0, max(0.0, vol / V_MAX))
                
                # Combinaison pondérée
                bond_quality = 0.50 * f_credit + 0.25 * f_dur + 0.25 * f_vol
                
                # Convertir en score centré sur 50 pour z-score
                scores.append(bond_quality * 100)
            else:
                # Non-bonds: neutre
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
        
        v2.2: Ajout facteur bond_quality.
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
            "cost_efficiency": self.compute_factor_cost_efficiency(assets),
            "bond_quality": self.compute_factor_bond_quality(assets),  # v2.2
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
            
            # v2.2: Ajouter bond_risk_bucket pour bonds
            category = asset.get("category", "").lower()
            fund_type = str(asset.get("fund_type", "")).lower()
            if "bond" in category or "bond" in fund_type:
                bq = factors["bond_quality"][i]
                # Convertir z-score en bucket (approximatif)
                if bq > 0.8:
                    asset["bond_risk_bucket"] = "defensive"
                elif bq > 0:
                    asset["bond_risk_bucket"] = "core"
                elif bq > -0.8:
                    asset["bond_risk_bucket"] = "risky"
                else:
                    asset["bond_risk_bucket"] = "very_risky"
            
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
    
    v2.2: Utilise FactorScorer avec bond_quality.
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
            "cost_efficiency": w.cost_efficiency,
            "bond_quality": w.bond_quality,  # v2.2
            "liquidity": w.liquidity,
            "mean_reversion": w.mean_reversion,
        }
        for profile, w in PROFILE_WEIGHTS.items()
    }


def compare_factor_profiles() -> str:
    """Génère une comparaison textuelle des profils."""
    lines = [
        "Comparaison des poids factoriels par profil (v2.2):",
        "",
        "PARI CENTRAL: Quality + Momentum surperforment à horizon 1-3 ans.",
        ""
    ]
    
    factors = ["momentum", "quality_fundamental", "low_vol", "cost_efficiency", "bond_quality", "liquidity", "mean_reversion"]
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
    
    v2.2: Ajout couverture métriques bond.
    v2.1: Ajout couverture TER et yield_ttm.
    
    Returns:
        Dict avec % d'actifs ayant chaque métrique.
    """
    if not assets:
        return {}
    
    total = len(assets)
    equities = [a for a in assets if a.get("category", "").lower() in ["equity", "equities", "action", "actions", "stock"]]
    etf_bonds = [a for a in assets if a.get("category", "").lower() in ["etf", "bond", "bonds"]]
    bonds_only = [a for a in assets if "bond" in a.get("category", "").lower() or "bond" in str(a.get("fund_type", "")).lower()]
    n_eq = len(equities) or 1
    n_etf = len(etf_bonds) or 1
    n_bonds = len(bonds_only) or 1
    
    return {
        # Métriques actions
        "roe": round(sum(1 for a in equities if fnum(a.get("roe")) > 0) / n_eq * 100, 1),
        "roic": round(sum(1 for a in equities if fnum(a.get("roic")) > 0) / n_eq * 100, 1),
        "fcf_yield": round(sum(1 for a in equities if a.get("fcf_yield") is not None) / n_eq * 100, 1),
        "de_ratio": round(sum(1 for a in equities if fnum(a.get("de_ratio")) >= 0) / n_eq * 100, 1),
        "eps_growth_5y": round(sum(1 for a in equities if a.get("eps_growth_5y") is not None) / n_eq * 100, 1),
        # Métriques ETF/Bonds
        "total_expense_ratio": round(sum(1 for a in etf_bonds if fnum(a.get("total_expense_ratio")) > 0) / n_etf * 100, 1),
        "yield_ttm": round(sum(1 for a in etf_bonds if fnum(a.get("yield_ttm")) > 0) / n_etf * 100, 1),
        # v2.2: Métriques Bonds spécifiques
        "bond_credit_score": round(sum(1 for a in bonds_only if fnum(a.get("bond_credit_score")) > 0) / n_bonds * 100, 1),
        "bond_avg_duration": round(sum(1 for a in bonds_only if fnum(a.get("bond_avg_duration")) > 0) / n_bonds * 100, 1),
        "bond_avg_maturity": round(sum(1 for a in bonds_only if fnum(a.get("bond_avg_maturity")) > 0) / n_bonds * 100, 1),
        # Compteurs
        "equities_count": len(equities),
        "etf_bonds_count": len(etf_bonds),
        "bonds_only_count": len(bonds_only),
        "total_count": total,
    }
