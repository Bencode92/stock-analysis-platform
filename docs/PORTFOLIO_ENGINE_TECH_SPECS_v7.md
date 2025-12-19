# 🔧 Portfolio Engine v7 — Spécifications Techniques

> **Date**: 19 décembre 2025  
> **Auteur**: Audit Expert (Claude Opus + ChatGPT o1)  
> **Statut**: Approuvé pour implémentation

---

## Table des Matières

1. [Architecture Cible v7](#architecture-cible-v7)
2. [Schéma JSON v2](#schéma-json-v2)
3. [Patches P0 — Code Complet](#patches-p0--code-complet)
4. [Patches P1 — Code Complet](#patches-p1--code-complet)
5. [Tests Unitaires](#tests-unitaires)
6. [Migration Guide](#migration-guide)

---

## Architecture Cible v7

### Modules

```
portfolio_engine/
├── optimizer.py              # v7: Objectif avec pénalités HHI/turnover
├── constraint_oracle.py      # NOUVEAU: Recalcul indépendant
├── risk_model.py             # v7: Covariance hybride configurable
├── alpha_model.py            # v7: Scores z-normalisés
├── backtester.py             # v7: OOS + walk-forward
└── instrument_master.py      # NOUVEAU: Source de vérité instruments

config/
├── portfolio_config.yaml     # v7: Tous les hyperparams
└── instrument_master.json    # NOUVEAU: Référentiel instruments

data/
├── portfolios.json           # v7: Avec delivery_status
├── backtest_results.json     # v7: Avec stress tests
└── backtest_debug.json       # Inchangé
```

### Flux de Données

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Alpha Model    │───▶│   Optimizer     │───▶│ Constraint      │
│  (z-scores)     │    │  (SLSQP v2)     │    │ Oracle          │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                      │                      │
        ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Risk Model     │    │  Instrument     │    │  Gating         │
│  (Cov Hybride)  │    │  Master         │    │  (REJECT/PASS)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## Schéma JSON v2

### portfolios.json — Structure Cible

```json
{
  "Agressif": {
    "Actions": { "TICKER": "weight%" },
    "ETF": { "TICKER": "weight%" },
    "Obligations": { "TICKER": "weight%" },
    "Crypto": {},
    
    "_tickers": {
      "TICKER": 0.15  // Poids décimaux
    },
    
    "_optimization": {
      "mode": "slsqp_v2",
      "is_heuristic": false,
      "vol_realized": 17.24,
      "vol_target": 18.0,
      "hyperparams": {
        "lambda_vol": 5.0,
        "lambda_hhi": 0.001,
        "lambda_turnover": 0.01,
        "hhi_target": 1500
      }
    },
    
    "_constraint_report": {
      "profile_name": "Agressif",
      "constraints": [...],
      "summary": {
        "total": 14,
        "ok": 10,
        "binding": 3,
        "violated": 1,
        "critical": 0
      },
      "quality_score": 85.0,
      "exposures": {...},
      "concentration": {
        "hhi": 1340.0,           // CORRIGÉ
        "effective_n": 7.5,      // CORRIGÉ
        ...
      },
      "execution_summary": {
        "ready_for_execution": true,  // NOUVEAU
        "missing_ticker": 0,
        "missing_isin": 2
      }
    },
    
    // NOUVEAUX CHAMPS v7
    "delivery_status": "PASS",
    "delivery_message": "✅ Ship-ready",
    "gating_details": {
      "reject_reasons": [],
      "warn_reasons": [],
      "policy_version": "1.0"
    },
    
    "_limitations": []
  },
  
  "_meta": {
    "generated_at": "2025-12-19T...",
    "version": "v7.0.0",
    "engine_version": "optimizer_v2",
    ...
  }
}
```

---

## Patches P0 — Code Complet

### PATCH 1: compute_concentration_metrics()

**Fichier**: `portfolio_engine/optimizer.py`  
**Remplace**: Fonction existante ou ajouter si absente

```python
import numpy as np
from typing import Dict, Any

def compute_concentration_metrics(weights: Dict[str, float]) -> Dict[str, Any]:
    """
    Calcul HHI et effective_n - VERSION v7 CORRIGÉE
    
    HHI (Herfindahl-Hirschman Index):
    - Formule: sum(w_i^2) * 10000
    - Échelle: 0 (parfaitement diversifié) à 10000 (1 seul actif)
    - Seuils: <1000 well_diversified, <1500 diversified, <2500 moderate, >2500 concentrated
    
    Effective N:
    - Formule: 10000 / HHI
    - Interprétation: Nombre équivalent de positions égales
    
    Args:
        weights: Dict {ticker: weight_decimal} où sum(weights) ≈ 1.0
    
    Returns:
        Dict avec hhi, effective_n, top_5_weight, etc.
    """
    if not weights:
        return {
            "hhi": 10000.0,
            "hhi_interpretation": "highly_concentrated",
            "effective_n": 1.0,
            "n_positions": 0,
            "top_5_weight": 0.0,
            "top_10_weight": 0.0,
            "largest_position": 0.0,
            "smallest_position": 0.0,
        }
    
    # Convertir en array numpy et normaliser
    w = np.array(list(weights.values()), dtype=np.float64)
    
    # Normaliser pour que somme = 1 (robustesse)
    total = w.sum()
    if total > 0:
        w = w / total
    else:
        return {
            "hhi": 10000.0,
            "hhi_interpretation": "highly_concentrated",
            "effective_n": 1.0,
            "n_positions": len(w),
            "top_5_weight": 0.0,
            "top_10_weight": 0.0,
            "largest_position": 0.0,
            "smallest_position": 0.0,
        }
    
    # HHI standard (échelle 0-10000)
    hhi = float((w ** 2).sum() * 10000)
    
    # Effective N (inverse HHI)
    effective_n = float(10000 / hhi) if hhi > 0 else 0.0
    
    # Top N weights
    sorted_w = np.sort(w)[::-1]  # Tri décroissant
    n = len(sorted_w)
    
    top_5 = float(sorted_w[:min(5, n)].sum() * 100)
    top_10 = float(sorted_w[:min(10, n)].sum() * 100)
    
    # Interprétation HHI
    if hhi < 1000:
        interpretation = "well_diversified"
    elif hhi < 1500:
        interpretation = "diversified"
    elif hhi < 2500:
        interpretation = "moderately_concentrated"
    else:
        interpretation = "highly_concentrated"
    
    return {
        "hhi": round(hhi, 1),
        "hhi_interpretation": interpretation,
        "effective_n": round(effective_n, 1),
        "n_positions": n,
        "top_5_weight": round(top_5, 2),
        "top_10_weight": round(top_10, 2),
        "largest_position": round(float(sorted_w[0] * 100), 2),
        "smallest_position": round(float(sorted_w[-1] * 100), 2),
        "thresholds": {
            "well_diversified": "HHI < 1000",
            "diversified": "HHI 1000-1500",
            "moderately_concentrated": "HHI 1500-2500",
            "highly_concentrated": "HHI > 2500"
        }
    }
```

---

### PATCH 2: compute_max_region_constraint()

**Fichier**: `portfolio_engine/optimizer.py`  
**Contexte**: Dans `_build_constraint_report()` ou fonction dédiée

```python
from typing import Dict, Any

def compute_max_region_constraint(
    weights_by_region: Dict[str, float], 
    cap: float,
    scope: str = "equity_only"
) -> Dict[str, Any]:
    """
    Calcul correct de la contrainte max_region
    
    CORRECTION v7: observed = max(all_regions.values())
    Bug v4.9.1: observed était toujours 0
    
    Args:
        weights_by_region: Dict {region: weight_pct}
        cap: Limite maximale en %
        scope: "equity_only" ou "all"
    
    Returns:
        Constraint report dict
    """
    base_report = {
        "name": "max_region",
        "constraint_type": "max",
        "cap": cap,
    }
    
    if not weights_by_region:
        return {
            **base_report,
            "observed": 0.0,
            "slack": cap,
            "binding": False,
            "status": "OK",
            "details": {
                "most_concentrated": "N/A",
                "all_regions": {},
                "scope": scope
            }
        }
    
    # CORRECTION: observed = maximum des régions
    observed = max(weights_by_region.values())
    most_concentrated = max(weights_by_region, key=weights_by_region.get)
    slack = cap - observed
    
    # Déterminer le statut selon les seuils
    if slack < -5:
        status = "CRITICAL"
        binding = False
    elif slack < 0:
        status = "VIOLATED"
        binding = False
    elif slack < 2:
        status = "BINDING"
        binding = True
    else:
        status = "OK"
        binding = False
    
    return {
        **base_report,
        "observed": round(observed, 2),
        "slack": round(slack, 2),
        "binding": binding,
        "status": status,
        "details": {
            "most_concentrated": most_concentrated,
            "all_regions": {
                k: round(v, 2) 
                for k, v in sorted(weights_by_region.items(), key=lambda x: -x[1])
            },
            "scope": scope
        }
    }
```

---

### PATCH 3: compute_max_sector_constraint()

**Fichier**: `portfolio_engine/optimizer.py`  
**Décision produit**: max_sector exclut "Bonds"

```python
import pandas as pd
from typing import Dict, Any

def compute_max_sector_constraint(
    weights_df: pd.DataFrame,
    cap: float,
    scope: str = "equity_only"
) -> Dict[str, Any]:
    """
    Calcul de la contrainte max_sector
    
    CORRECTION v7: Exclure "Bonds" du calcul secteur
    Bug v4.9.1: "Bonds" comptait comme secteur → CRITICAL sur Stable
    
    Règle: max_sector s'applique uniquement aux actions et ETF equity-like
    
    Args:
        weights_df: DataFrame avec colonnes [ticker, weight, category, sector, risk_bucket]
        cap: Limite maximale en %
        scope: "equity_only" (défaut) ou "all"
    
    Returns:
        Constraint report dict
    """
    base_report = {
        "name": "max_sector",
        "constraint_type": "max",
        "cap": cap,
    }
    
    if weights_df.empty:
        return {
            **base_report,
            "observed": 0.0,
            "slack": cap,
            "binding": False,
            "status": "OK",
            "details": {"scope": scope, "note": "No positions"}
        }
    
    # Filtrer selon le scope
    if scope == "equity_only":
        # Inclure Actions + ETF (sauf bond_like)
        mask = (
            weights_df["category"].isin(["Actions", "ETF"]) &
            (weights_df["risk_bucket"] != "bond_like")
        )
        df_scoped = weights_df[mask].copy()
    else:
        df_scoped = weights_df.copy()
    
    # CORRECTION v7: Exclure "Bonds" explicitement
    df_scoped = df_scoped[df_scoped["sector"] != "Bonds"]
    
    if df_scoped.empty:
        return {
            **base_report,
            "observed": 0.0,
            "slack": cap,
            "binding": False,
            "status": "OK",
            "details": {
                "scope": f"{scope} (Bonds excluded)",
                "note": "No equity positions after filtering"
            }
        }
    
    # Calculer l'exposition par secteur (en %)
    # Note: weights sont en décimal, multiplier par 100
    if df_scoped["weight"].max() <= 1:
        sector_weights = df_scoped.groupby("sector")["weight"].sum() * 100
    else:
        sector_weights = df_scoped.groupby("sector")["weight"].sum()
    
    observed = float(sector_weights.max())
    most_concentrated = sector_weights.idxmax()
    slack = cap - observed
    
    # Déterminer le statut
    if slack < -5:
        status = "CRITICAL"
        binding = False
    elif slack < 0:
        status = "VIOLATED"
        binding = False
    elif slack < 2:
        status = "BINDING"
        binding = True
    else:
        status = "OK"
        binding = False
    
    return {
        **base_report,
        "observed": round(observed, 2),
        "slack": round(slack, 2),
        "binding": binding,
        "status": status,
        "details": {
            "scope": f"{scope} (Bonds excluded)",
            "most_concentrated": most_concentrated,
            "all_sectors": {
                k: round(v, 2)
                for k, v in sorted(sector_weights.items(), key=lambda x: -x[1])
            }
        }
    }
```

---

### PATCH 4: assign_risk_bucket()

**Fichier**: `portfolio_engine/optimizer.py`  
**Appel**: Lors du chargement des données

```python
import pandas as pd

def assign_risk_bucket(row: pd.Series) -> str:
    """
    Assigner un risk_bucket déterministe - JAMAIS "unknown"
    
    Règles v7:
    - Actions → equity_like
    - Obligations → bond_like  
    - ETF → selon type (analysé par nom/sector)
    - Crypto → crypto
    
    Args:
        row: Ligne d'un DataFrame avec colonnes [category, sector, name]
    
    Returns:
        risk_bucket: str parmi {equity_like, bond_like, alternative, crypto}
    """
    category = str(row.get("category", "")).strip()
    sector = str(row.get("sector", "")).strip().lower()
    name = str(row.get("name", "")).strip().lower()
    
    # Règle 1: Par catégorie principale
    if category == "Actions":
        return "equity_like"
    
    if category == "Obligations":
        return "bond_like"
    
    if category == "Crypto":
        return "crypto"
    
    # Règle 2: ETF - analyse plus fine
    if category == "ETF":
        # Bond ETFs
        bond_keywords = [
            "bond", "treasury", "tips", "aggregate", "short-term",
            "municipal", "corporate", "government", "fixed income",
            "bnd", "agg", "tlt", "ief", "shv", "sgov", "vgsh", "bsv"
        ]
        if any(kw in name for kw in bond_keywords):
            return "bond_like"
        
        # Alternative ETFs (strategies)
        alt_keywords = [
            "buywrite", "covered call", "defined outcome", 
            "buffer", "options", "derivative", "income & opportunities",
            "alternative", "hedge", "long/short"
        ]
        if any(kw in name for kw in alt_keywords):
            return "alternative"
        
        # Preferred / Income ETFs (quasi-equity)
        if any(kw in name for kw in ["preferred", "dividend", "income etf"]):
            return "equity_like"
        
        # Par sector
        if sector in ["bonds", "fixed income"]:
            return "bond_like"
        
        # Défaut ETF = equity_like
        return "equity_like"
    
    # Fallback (ne devrait jamais arriver avec données propres)
    return "equity_like"


def apply_risk_bucket_mapping(df: pd.DataFrame) -> pd.DataFrame:
    """
    Applique le mapping risk_bucket à tout le DataFrame
    
    Args:
        df: DataFrame avec colonnes [category, sector, name]
    
    Returns:
        DataFrame avec colonne risk_bucket mise à jour
    """
    df = df.copy()
    df["risk_bucket"] = df.apply(assign_risk_bucket, axis=1)
    
    # Vérification: 0% unknown
    unknown_count = (df["risk_bucket"] == "unknown").sum()
    if unknown_count > 0:
        raise ValueError(
            f"ERREUR: {unknown_count} actifs avec risk_bucket='unknown' - "
            f"Vérifier assign_risk_bucket()"
        )
    
    return df
```

---

### PATCH 5: apply_gating_policy()

**Fichier**: `portfolio_engine/optimizer.py`  
**Appel**: Après génération du `_constraint_report`

```python
from datetime import datetime
from typing import Dict, Any, List

def apply_gating_policy(constraint_report: Dict[str, Any]) -> Dict[str, Any]:
    """
    Politique de gating stricte v7
    
    Règles:
    - CRITICAL > 0 → REJECT
    - ready_for_execution = false → REJECT
    - Incohérences métriques → REJECT
    - VIOLATED > 0 → WARN
    - Sinon → PASS
    
    Args:
        constraint_report: Report généré par l'optimiseur
    
    Returns:
        Report enrichi avec delivery_status, delivery_message, gating_details
    """
    summary = constraint_report.get("summary", {})
    exec_summary = constraint_report.get("execution_summary", {})
    
    reject_reasons: List[str] = []
    warn_reasons: List[str] = []
    
    # Check 1: CRITICAL constraints
    critical_count = summary.get("critical", 0)
    if critical_count > 0:
        reject_reasons.append(
            f"{critical_count} constraint(s) CRITICAL"
        )
    
    # Check 2: Execution readiness
    ready_for_exec = exec_summary.get("ready_for_execution", False)
    if not ready_for_exec:
        missing_tickers = exec_summary.get("missing_ticker", 0)
        missing_isin = exec_summary.get("missing_isin", 0)
        reject_reasons.append(
            f"Not execution-ready: {missing_tickers} missing tickers, "
            f"{missing_isin} missing ISIN"
        )
    
    # Check 3: Métriques cohérentes (HHI, sum weights)
    total_weight = exec_summary.get("total_weight", 100.0)
    if abs(total_weight - 100.0) > 1.0:
        reject_reasons.append(
            f"Weights sum to {total_weight}% (expected 100%)"
        )
    
    # Check 4: VIOLATED (soft = WARN)
    violated_count = summary.get("violated", 0)
    if violated_count > 0:
        warn_reasons.append(
            f"{violated_count} soft constraint(s) violated"
        )
    
    # Check 5: Binding constraints (info)
    binding_count = summary.get("binding", 0)
    if binding_count >= 5:
        warn_reasons.append(
            f"{binding_count} constraints binding - consider relaxing profile"
        )
    
    # Déterminer le statut final
    if reject_reasons:
        delivery_status = "REJECT"
        delivery_message = "❌ NOT SHIP-READY: " + "; ".join(reject_reasons)
    elif warn_reasons:
        delivery_status = "WARN"
        delivery_message = "⚠️ REVIEW REQUIRED: " + "; ".join(warn_reasons)
    else:
        delivery_status = "PASS"
        delivery_message = "✅ Ship-ready"
    
    # Enrichir le report
    constraint_report["delivery_status"] = delivery_status
    constraint_report["delivery_message"] = delivery_message
    constraint_report["gating_details"] = {
        "reject_reasons": reject_reasons,
        "warn_reasons": warn_reasons,
        "policy_version": "1.0",
        "checked_at": datetime.now().isoformat()
    }
    
    return constraint_report
```

---

## Patches P1 — Code Complet

### PATCH 6: Objectif v2 avec pénalités

**Fichier**: `portfolio_engine/optimizer.py`  
**Remplace**: Fonction `objective()` actuelle

```python
import numpy as np
from typing import Optional

def objective_v2(
    w: np.ndarray,
    scores: np.ndarray,
    cov: np.ndarray,
    vol_target: float,
    lambda_vol: float = 5.0,
    lambda_hhi: float = 0.001,
    lambda_turnover: float = 0.01,
    hhi_target: float = 1500.0,
    w_prev: Optional[np.ndarray] = None
) -> float:
    """
    Fonction objectif v7 avec pénalités complètes
    
    Objectif: max(score - vol_penalty - hhi_penalty - turnover_penalty)
    
    Améliorations vs v4.9.1:
    1. Pénalité HHI pour éviter les corner solutions
    2. Pénalité turnover pour stabilité
    3. Paramètres exposés (pas hardcodés)
    
    Args:
        w: Vecteur de poids (somme = 1)
        scores: Scores alpha par actif
        cov: Matrice de covariance
        vol_target: Volatilité cible (décimal, ex: 0.18)
        lambda_vol: Pénalité écart volatilité (défaut: 5.0)
        lambda_hhi: Pénalité concentration (défaut: 0.001)
        lambda_turnover: Pénalité turnover (défaut: 0.01)
        hhi_target: HHI cible (défaut: 1500)
        w_prev: Poids précédents pour turnover (optionnel)
    
    Returns:
        Valeur négative de l'objectif (pour minimisation)
    """
    # 1. Score du portefeuille
    port_score = float(np.dot(w, scores))
    
    # 2. Pénalité volatilité
    port_var = float(np.dot(w, np.dot(cov, w)))
    port_vol = np.sqrt(max(port_var, 1e-10))
    vol_penalty = lambda_vol * (port_vol - vol_target) ** 2
    
    # 3. Pénalité concentration (HHI)
    hhi = float((w ** 2).sum() * 10000)
    hhi_excess = max(0, hhi - hhi_target)
    hhi_penalty = lambda_hhi * hhi_excess
    
    # 4. Pénalité turnover (si w_prev disponible)
    turnover_penalty = 0.0
    if w_prev is not None:
        turnover = float(np.abs(w - w_prev).sum())
        turnover_penalty = lambda_turnover * turnover
    
    # Objectif total (à minimiser → négatif)
    total = port_score - vol_penalty - hhi_penalty - turnover_penalty
    
    return -total


# Configuration des hyperparams par profil
OBJECTIVE_HYPERPARAMS = {
    "Agressif": {
        "lambda_vol": 5.0,
        "lambda_hhi": 0.001,
        "lambda_turnover": 0.01,
        "hhi_target": 1800.0,  # Plus tolérant
    },
    "Modéré": {
        "lambda_vol": 5.0,
        "lambda_hhi": 0.001,
        "lambda_turnover": 0.01,
        "hhi_target": 1500.0,
    },
    "Stable": {
        "lambda_vol": 5.0,
        "lambda_hhi": 0.0005,  # Moins strict car heuristique
        "lambda_turnover": 0.005,
        "hhi_target": 1200.0,  # Plus diversifié
    }
}
```

---

### PATCH 8: alternative_cap comme contrainte SLSQP

**Fichier**: `portfolio_engine/optimizer.py`  
**Ajouter dans**: `_build_constraints()`

```python
from typing import List, Dict, Any
import numpy as np

def build_constraints_v2(
    n_assets: int,
    profile: "ProfileConstraints",
    cov: np.ndarray,
    asset_metadata: List[Dict[str, Any]]
) -> List[Dict]:
    """
    Construire les contraintes SLSQP v7
    
    Ajout v7: alternative_cap comme vraie contrainte (pas post-hoc)
    
    Args:
        n_assets: Nombre d'actifs
        profile: Configuration du profil
        cov: Matrice de covariance
        asset_metadata: Liste de dicts avec {risk_bucket, category, ...}
    
    Returns:
        Liste de contraintes pour scipy.optimize.minimize
    """
    constraints = []
    
    # Contrainte 1: Somme des poids = 1
    constraints.append({
        "type": "eq",
        "fun": lambda w: w.sum() - 1.0
    })
    
    # Contrainte 2: Bonds minimum
    bonds_indices = [
        i for i, meta in enumerate(asset_metadata)
        if meta.get("risk_bucket") == "bond_like"
    ]
    if bonds_indices:
        bonds_min = profile.bonds_min / 100
        constraints.append({
            "type": "ineq",
            "fun": lambda w, idx=bonds_indices, m=bonds_min: 
                   w[idx].sum() - m  # sum(bonds) >= min
        })
    
    # Contrainte 3: Crypto maximum
    crypto_indices = [
        i for i, meta in enumerate(asset_metadata)
        if meta.get("risk_bucket") == "crypto"
    ]
    if crypto_indices and profile.crypto_max > 0:
        crypto_max = profile.crypto_max / 100
        constraints.append({
            "type": "ineq",
            "fun": lambda w, idx=crypto_indices, m=crypto_max:
                   m - w[idx].sum()  # sum(crypto) <= max
        })
    
    # Contrainte 4: Volatilité dans la bande (soft via objectif, mais peut être hard)
    vol_max = (profile.vol_target + profile.vol_tolerance) / 100
    constraints.append({
        "type": "ineq",
        "fun": lambda w, c=cov, m=vol_max:
               m - np.sqrt(np.dot(w, np.dot(c, w)))  # vol <= max
    })
    
    # NOUVEAU v7: Contrainte 5: Alternative cap
    alt_indices = [
        i for i, meta in enumerate(asset_metadata)
        if meta.get("risk_bucket") == "alternative"
    ]
    if alt_indices:
        alt_cap = getattr(profile, "alternative_cap", 20.0) / 100
        constraints.append({
            "type": "ineq",
            "fun": lambda w, idx=alt_indices, m=alt_cap:
                   m - w[idx].sum()  # sum(alternatives) <= cap
        })
    
    return constraints
```

---

## Tests Unitaires

**Fichier**: `tests/test_concentration.py`

```python
import pytest
import numpy as np
from portfolio_engine.optimizer import (
    compute_concentration_metrics,
    compute_max_region_constraint,
    compute_max_sector_constraint,
    assign_risk_bucket,
)

class TestHHI:
    """Tests pour le calcul HHI corrigé"""
    
    def test_equal_weight_10(self):
        """10 positions égales → HHI = 1000"""
        weights = {f"asset_{i}": 0.10 for i in range(10)}
        metrics = compute_concentration_metrics(weights)
        assert metrics["hhi"] == 1000.0
        assert metrics["effective_n"] == 10.0
        assert metrics["hhi_interpretation"] == "diversified"
    
    def test_equal_weight_5(self):
        """5 positions égales → HHI = 2000"""
        weights = {f"asset_{i}": 0.20 for i in range(5)}
        metrics = compute_concentration_metrics(weights)
        assert metrics["hhi"] == 2000.0
        assert metrics["effective_n"] == 5.0
    
    def test_concentrated_50_50(self):
        """2 positions à 50% → HHI = 5000"""
        weights = {"A": 0.50, "B": 0.50}
        metrics = compute_concentration_metrics(weights)
        assert metrics["hhi"] == 5000.0
        assert metrics["effective_n"] == 2.0
        assert metrics["hhi_interpretation"] == "highly_concentrated"
    
    def test_single_position(self):
        """1 seule position → HHI = 10000"""
        weights = {"A": 1.0}
        metrics = compute_concentration_metrics(weights)
        assert metrics["hhi"] == 10000.0
        assert metrics["effective_n"] == 1.0
    
    def test_agressif_real_weights(self):
        """Test avec poids réels Agressif"""
        weights = {
            "CEFS": 0.15, "BUYW": 0.146, "LLY": 0.146,
            "ASML": 0.146, "JNJ": 0.146, "STLD": 0.146,
            "AGG": 0.05, "TPR": 0.0441, "CMI": 0.02, "MUTHOOTFIN": 0.0059
        }
        metrics = compute_concentration_metrics(weights)
        # HHI attendu ≈ 1340 (pas 4820!)
        assert 1300 < metrics["hhi"] < 1400
        assert metrics["effective_n"] > 7


class TestMaxRegion:
    """Tests pour max_region corrigé"""
    
    def test_observed_not_zero(self):
        """observed doit être max(regions), pas 0"""
        regions = {"Etats-Unis": 50.21, "Global": 34.6, "Pays-Bas": 14.6}
        result = compute_max_region_constraint(regions, cap=50.0)
        
        assert result["observed"] == 50.21  # PAS 0!
        assert result["most_concentrated"] == "Etats-Unis"
        assert result["slack"] == -0.21
        assert result["status"] == "VIOLATED"
    
    def test_within_cap(self):
        """Régions sous le cap"""
        regions = {"US": 40.0, "EU": 30.0}
        result = compute_max_region_constraint(regions, cap=50.0)
        
        assert result["observed"] == 40.0
        assert result["status"] == "OK"


class TestMaxSector:
    """Tests pour max_sector (scope equity_only)"""
    
    def test_bonds_excluded(self):
        """Bonds ne doit pas compter dans max_sector"""
        import pandas as pd
        
        df = pd.DataFrame([
            {"ticker": "JNJ", "weight": 0.10, "category": "Actions", 
             "sector": "Santé", "risk_bucket": "equity_like"},
            {"ticker": "AGG", "weight": 0.50, "category": "Obligations",
             "sector": "Bonds", "risk_bucket": "bond_like"},
        ])
        
        result = compute_max_sector_constraint(df, cap=30.0, scope="equity_only")
        
        # observed = 10% (Santé), PAS 50% (Bonds)
        assert result["observed"] == 10.0
        assert result["status"] == "OK"
        assert "Bonds excluded" in result["details"]["scope"]


class TestRiskBucket:
    """Tests pour assign_risk_bucket"""
    
    def test_actions_equity_like(self):
        import pandas as pd
        row = pd.Series({"category": "Actions", "name": "Apple", "sector": "Tech"})
        assert assign_risk_bucket(row) == "equity_like"
    
    def test_obligations_bond_like(self):
        import pandas as pd
        row = pd.Series({"category": "Obligations", "name": "Treasury", "sector": "Gov"})
        assert assign_risk_bucket(row) == "bond_like"
    
    def test_etf_bond(self):
        import pandas as pd
        row = pd.Series({
            "category": "ETF", 
            "name": "iShares Core U.S. Aggregate Bond ETF",
            "sector": "Bonds"
        })
        assert assign_risk_bucket(row) == "bond_like"
    
    def test_etf_alternative(self):
        import pandas as pd
        row = pd.Series({
            "category": "ETF",
            "name": "Main Buywrite ETF",
            "sector": "Diversified"
        })
        assert assign_risk_bucket(row) == "alternative"
    
    def test_no_unknown(self):
        """Aucun cas ne doit retourner 'unknown'"""
        import pandas as pd
        
        test_cases = [
            {"category": "Actions", "name": "Test", "sector": ""},
            {"category": "ETF", "name": "Unknown ETF", "sector": "Unknown"},
            {"category": "Obligations", "name": "", "sector": ""},
            {"category": "", "name": "", "sector": ""},
        ]
        
        for case in test_cases:
            row = pd.Series(case)
            result = assign_risk_bucket(row)
            assert result != "unknown", f"Got 'unknown' for {case}"
```

---

## Migration Guide

### Étapes de migration v4.9.1 → v7.0.0

1. **Backup**
   ```bash
   cp portfolio_engine/optimizer.py portfolio_engine/optimizer_v4.9.1.py
   cp data/portfolios.json data/portfolios_v4.9.1.json
   ```

2. **Appliquer les patches**
   - Copier les fonctions PATCH 1-5 dans `optimizer.py`
   - Remplacer les appels existants

3. **Créer tests**
   ```bash
   mkdir -p tests
   # Copier test_concentration.py
   pytest tests/test_concentration.py -v
   ```

4. **Régénérer les portfolios**
   ```bash
   python -m portfolio_engine.optimizer --regenerate
   ```

5. **Vérifier le gating**
   ```bash
   cat data/portfolios.json | jq '.[].delivery_status'
   # Attendu: "PASS" pour les 3 profils
   ```

---

## Références

- [Action Plan v7](./PORTFOLIO_ENGINE_ACTION_PLAN_v7.md)
- [Constraints Documentation](./constraints.md)
- [Production Readiness](./production_readiness.md)
