#!/usr/bin/env python3
"""
etf_scoring_diagnostic.py - Diagnostic pour le bug du score plat ETF (50.1)

Usage:
    from portfolio_engine.etf_scoring_diagnostic import diagnose_etf_scoring_pipeline
    
    # Après avoir chargé ton CSV
    diagnostic = diagnose_etf_scoring_pipeline(df, profile="Agressif")
    print(diagnostic)

v1.0.0 - Initial diagnostic tool for flat score (50.1) debugging
"""

import logging
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional

logger = logging.getLogger("etf-scoring-diagnostic")


def diagnose_etf_scoring_pipeline(
    df: pd.DataFrame,
    profile: str = "Agressif",
    verbose: bool = True,
) -> Dict[str, Any]:
    """
    Diagnostic complet du pipeline de scoring ETF.
    
    Identifie la cause du bug "score plat 50.1":
    - Univers trop petit après filtrage
    - Colonnes NaN
    - Variance nulle dans les composantes
    
    Args:
        df: DataFrame avec les ETF (avant ou après filtrage)
        profile: "Stable", "Modéré", ou "Agressif"
        verbose: Si True, affiche les résultats
    
    Returns:
        Dict avec le diagnostic complet
    """
    diagnostic = {
        "profile": profile,
        "n_initial": len(df),
        "stage_counts": {},
        "scoring_components": {},
        "issues": [],
        "root_cause": None,
        "recommendation": None,
    }
    
    if df.empty:
        diagnostic["issues"].append("DATAFRAME_VIDE")
        diagnostic["root_cause"] = "DATAFRAME_VIDE"
        return diagnostic
    
    # === STAGE 1: Colonnes présentes ===
    expected_cols = {
        "scoring": ["vol_3y_pct", "vol_pct", "total_expense_ratio", "aum_usd", 
                    "yield_ttm", "perf_1m_pct", "perf_3m_pct", "ytd_return_pct"],
        "diversification": ["sector_top_weight", "holding_top", "holdings_top10"],
        "quality": ["data_quality_score"],
    }
    
    missing_cols = []
    for category, cols in expected_cols.items():
        for col in cols:
            if col not in df.columns:
                missing_cols.append(col)
    
    if missing_cols:
        diagnostic["issues"].append(f"COLONNES_MANQUANTES: {missing_cols}")
    
    # === STAGE 2: Analyse des composantes de scoring ===
    components_to_check = [
        ("vol", ["vol_3y_pct", "vol_pct"]),
        ("ter", ["total_expense_ratio"]),
        ("aum", ["aum_usd"]),
        ("yield", ["yield_ttm"]),
        ("momentum_1m", ["perf_1m_pct"]),
        ("momentum_3m", ["perf_3m_pct"]),
        ("momentum_ytd", ["ytd_return_pct"]),
        ("sector_weight", ["sector_top_weight"]),
        ("holding_top", ["holding_top"]),
        ("data_quality", ["data_quality_score"]),
    ]
    
    for name, cols in components_to_check:
        # Trouver la première colonne disponible
        series = None
        used_col = None
        for col in cols:
            if col in df.columns:
                series = pd.to_numeric(df[col], errors="coerce")
                used_col = col
                break
        
        if series is None:
            diagnostic["scoring_components"][name] = {
                "status": "COLONNE_ABSENTE",
                "columns_checked": cols,
                "n_valid": 0,
                "pct_valid": 0.0,
            }
            continue
        
        n_total = len(series)
        n_valid = series.notna().sum()
        n_nan = series.isna().sum()
        pct_valid = (n_valid / n_total * 100) if n_total > 0 else 0
        
        stats = {
            "column_used": used_col,
            "n_total": n_total,
            "n_valid": int(n_valid),
            "n_nan": int(n_nan),
            "pct_valid": round(pct_valid, 1),
        }
        
        if n_valid > 0:
            valid_data = series.dropna()
            stats.update({
                "min": round(float(valid_data.min()), 4),
                "max": round(float(valid_data.max()), 4),
                "mean": round(float(valid_data.mean()), 4),
                "std": round(float(valid_data.std()), 4),
                "is_constant": valid_data.std() < 1e-6,
            })
            
            # Détecter les problèmes
            if pct_valid == 0:
                stats["status"] = "100%_NAN"
                diagnostic["issues"].append(f"COLONNE_100%_NAN: {name} ({used_col})")
            elif pct_valid < 20:
                stats["status"] = "SPARSE"
                diagnostic["issues"].append(f"COLONNE_SPARSE: {name} = {pct_valid:.1f}% valide")
            elif valid_data.std() < 1e-6:
                stats["status"] = "VARIANCE_NULLE"
                diagnostic["issues"].append(f"VARIANCE_NULLE: {name} (toutes valeurs = {valid_data.iloc[0]})")
            else:
                stats["status"] = "OK"
        else:
            stats["status"] = "100%_NAN"
            diagnostic["issues"].append(f"COLONNE_100%_NAN: {name} ({used_col})")
        
        diagnostic["scoring_components"][name] = stats
    
    # === STAGE 3: Simulation du pipeline ===
    try:
        from .preset_etf import (
            apply_data_qc_filters,
            _compute_diversification_metrics,
            apply_hard_constraints,
            apply_presets_union,
        )
        
        # QC
        d0 = apply_data_qc_filters(df.copy())
        diagnostic["stage_counts"]["initial"] = len(df)
        diagnostic["stage_counts"]["qc"] = len(d0)
        
        # Diversification metrics
        d0 = _compute_diversification_metrics(d0)
        
        # Hard constraints
        d1, _ = apply_hard_constraints(d0, profile, target_min=10)
        diagnostic["stage_counts"]["hard"] = len(d1)
        
        # Presets union
        d2 = apply_presets_union(d1, profile)
        diagnostic["stage_counts"]["presets"] = len(d2)
        diagnostic["stage_counts"]["scoring"] = len(d2)
        
        # Vérifier si univers trop petit
        if len(d2) < 5:
            diagnostic["issues"].append(
                f"UNIVERS_TROP_PETIT: seulement {len(d2)} ETF arrivent au scoring"
            )
        if len(d2) == 0:
            diagnostic["issues"].append("PRESETS_VIDE: 0 ETF après filtrage presets")
        
    except ImportError:
        diagnostic["issues"].append("IMPORT_ERROR: preset_etf non disponible")
        diagnostic["stage_counts"]["simulated"] = False
    
    # === STAGE 4: Déterminer la cause racine ===
    if not diagnostic["issues"]:
        diagnostic["root_cause"] = "OK"
        diagnostic["recommendation"] = "Pas de problème détecté"
    else:
        # Priorité des causes
        for prefix, cause in [
            ("DATAFRAME_VIDE", "DATAFRAME_VIDE"),
            ("PRESETS_VIDE", "PRESETS_TROP_RESTRICTIFS"),
            ("UNIVERS_TROP_PETIT", "FILTRAGE_EXCESSIF"),
            ("COLONNE_100%_NAN", "COLONNES_MANQUANTES"),
            ("VARIANCE_NULLE", "DONNEES_UNIFORMES"),
            ("COLONNE_SPARSE", "DONNEES_MANQUANTES"),
        ]:
            if any(prefix in issue for issue in diagnostic["issues"]):
                diagnostic["root_cause"] = cause
                break
        
        if diagnostic["root_cause"] is None:
            diagnostic["root_cause"] = "MULTIPLE_ISSUES"
        
        # Recommendations
        recommendations = {
            "PRESETS_TROP_RESTRICTIFS": 
                "Élargir les critères des presets ou ajouter des presets pour ce profil",
            "FILTRAGE_EXCESSIF": 
                "Relaxer les hard constraints dans PROFILE_CONSTRAINTS",
            "COLONNES_MANQUANTES": 
                "Vérifier que le CSV contient les colonnes attendues avec les bons noms",
            "DONNEES_UNIFORMES": 
                "Les données sont toutes identiques - vérifier la source de données",
            "DONNEES_MANQUANTES": 
                "Beaucoup de NaN dans les colonnes critiques - améliorer le scraping",
        }
        diagnostic["recommendation"] = recommendations.get(
            diagnostic["root_cause"], 
            "Investiguer les issues listées"
        )
    
    # === STAGE 5: Affichage ===
    if verbose:
        _print_diagnostic(diagnostic)
    
    return diagnostic


def _print_diagnostic(diag: Dict[str, Any]):
    """Affiche le diagnostic de façon lisible."""
    print("\n" + "=" * 70)
    print(f"📊 DIAGNOSTIC ETF SCORING - Profil: {diag['profile']}")
    print("=" * 70)
    
    # Stage counts
    if diag.get("stage_counts"):
        print("\n📈 PIPELINE STAGES:")
        for stage, count in diag["stage_counts"].items():
            print(f"  {stage}: {count}")
    
    # Components
    print("\n📋 COMPOSANTES DE SCORING:")
    for name, stats in diag.get("scoring_components", {}).items():
        status = stats.get("status", "?")
        icon = "✅" if status == "OK" else "❌" if "NAN" in status else "⚠️"
        
        if "n_valid" in stats:
            print(f"  {icon} {name}: {stats['n_valid']}/{stats.get('n_total', '?')} valid ({stats.get('pct_valid', 0):.1f}%)")
            if "std" in stats:
                print(f"      range=[{stats.get('min')}, {stats.get('max')}], std={stats.get('std')}")
        else:
            print(f"  {icon} {name}: {status}")
    
    # Issues
    if diag.get("issues"):
        print("\n🔴 ISSUES DÉTECTÉES:")
        for issue in diag["issues"]:
            print(f"  - {issue}")
    else:
        print("\n✅ Aucun problème détecté")
    
    # Root cause
    print(f"\n🎯 CAUSE RACINE: {diag.get('root_cause', 'Inconnue')}")
    print(f"💡 RECOMMENDATION: {diag.get('recommendation', 'N/A')}")
    
    print("=" * 70 + "\n")


def diagnose_csv_file(csv_path: str, profile: str = "Agressif") -> Dict[str, Any]:
    """
    Charge un CSV et lance le diagnostic.
    
    Usage:
        from portfolio_engine.etf_scoring_diagnostic import diagnose_csv_file
        diag = diagnose_csv_file("data/etf_pea.csv", "Agressif")
    """
    import pandas as pd
    
    df = pd.read_csv(csv_path)
    return diagnose_etf_scoring_pipeline(df, profile=profile, verbose=True)


def quick_check(df: pd.DataFrame) -> str:
    """
    Check rapide - retourne un message d'une ligne.
    
    Usage:
        print(quick_check(df))
    """
    if df.empty:
        return "❌ DataFrame vide"
    
    diag = diagnose_etf_scoring_pipeline(df, verbose=False)
    
    if diag["root_cause"] == "OK":
        return "✅ OK - pas de problème détecté"
    
    return f"⚠️ {diag['root_cause']}: {diag['recommendation']}"


# === CLI ===
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python etf_scoring_diagnostic.py <csv_path> [profile]")
        print("  profile: Stable, Modéré, Agressif (default: Agressif)")
        sys.exit(1)
    
    csv_path = sys.argv[1]
    profile = sys.argv[2] if len(sys.argv) > 2 else "Agressif"
    
    diagnose_csv_file(csv_path, profile)
