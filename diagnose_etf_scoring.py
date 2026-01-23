#!/usr/bin/env python3
"""
DIAGNOSTIC ETF SCORING - Identifier la cause racine des NaN
============================================================
Exécuter depuis la racine du projet:
    python diagnose_etf_scoring.py

Ce script vérifie chaque étape du pipeline pour identifier
où les colonnes numériques deviennent NaN.
"""

import pandas as pd
import numpy as np
import sys
import logging
from pathlib import Path

# Setup logging pour voir les logs de preset_etf
logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)

# Colonnes critiques pour le scoring
CRITICAL_COLS = [
    "total_expense_ratio", "aum_usd", "yield_ttm",
    "perf_1m_pct", "perf_3m_pct", "vol_pct", "vol_3y_pct",
    "data_quality_score", "sector_top_weight", "holdings_top10"
]

def print_section(title):
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)

def check_column(df, col, label=""):
    """Vérifie une colonne et retourne son statut."""
    if col not in df.columns:
        return "ABSENT", 0, 0, None, []
    
    s = df[col]
    n_total = len(s)
    n_notna = s.notna().sum()
    dtype = s.dtype
    sample = s.dropna().head(3).tolist() if n_notna > 0 else []
    
    if n_notna == 0:
        status = "ALL_NAN"
    elif n_notna < n_total * 0.3:
        status = "LOW"
    else:
        status = "OK"
    
    return status, n_notna, n_total, dtype, sample

def diagnose():
    print("=" * 70)
    print("DIAGNOSTIC ETF SCORING - Cause racine NaN")
    print("=" * 70)
    
    # === ÉTAPE 1: Charger le CSV brut ===
    csv_path = Path("data/combined_etfs.csv")
    if not csv_path.exists():
        print(f"❌ ERREUR: {csv_path} n'existe pas!")
        print("   Vérifiez que vous exécutez depuis la racine du projet.")
        return False
    
    print(f"\n📁 Fichier: {csv_path}")
    
    # Charger avec pandas standard
    df_raw = pd.read_csv(csv_path, low_memory=False)
    print(f"✅ Chargé: {len(df_raw)} lignes, {len(df_raw.columns)} colonnes")
    
    # Vérifier les noms de colonnes (espaces invisibles?)
    print(f"\n📋 Premières colonnes: {df_raw.columns[:10].tolist()}")
    
    # === ÉTAPE 2: Vérifier colonnes critiques dans CSV brut ===
    print_section("ÉTAPE 1: Colonnes critiques dans CSV BRUT")
    
    raw_stats = {}
    for col in CRITICAL_COLS:
        status, n_notna, n_total, dtype, sample = check_column(df_raw, col)
        raw_stats[col] = (status, n_notna)
        
        if status == "ABSENT":
            print(f"❌ {col}: COLONNE ABSENTE!")
        elif status == "ALL_NAN":
            print(f"🔴 {col}: 100% NaN (dtype={dtype})")
        elif status == "LOW":
            print(f"🟡 {col}: {n_notna}/{n_total} ({100*n_notna/n_total:.1f}%) dtype={dtype}")
        else:
            print(f"✅ {col}: {n_notna}/{n_total} ({100*n_notna/n_total:.1f}%) dtype={dtype}, sample={sample[:2]}")
    
    # === ÉTAPE 3: Tester load_csv_robust ===
    print_section("ÉTAPE 2: Après load_csv_robust()")
    
    df_loaded = None
    try:
        from generate_portfolios_v4 import load_csv_robust, NUMERIC_COLS_ETF
        
        df_loaded = load_csv_robust(str(csv_path), numeric_cols=NUMERIC_COLS_ETF)
        print(f"✅ load_csv_robust: {len(df_loaded)} lignes")
        
        for col in CRITICAL_COLS:
            status, n_notna, n_total, dtype, sample = check_column(df_loaded, col)
            raw_status, raw_n = raw_stats.get(col, ("ABSENT", 0))
            
            # Comparer avec brut
            if raw_status != "ABSENT" and status != "ABSENT":
                diff = n_notna - raw_n
                if diff < -10:
                    print(f"🔴 {col}: PERTE de {abs(diff)} valeurs! ({raw_n}→{n_notna})")
                elif status == "ALL_NAN":
                    print(f"🔴 {col}: 100% NaN après conversion (dtype={dtype})")
                else:
                    print(f"✅ {col}: {n_notna}/{n_total} dtype={dtype}, sample={sample[:2]}")
            elif status == "ABSENT":
                print(f"❌ {col}: COLONNE ABSENTE après load_csv_robust!")
            else:
                print(f"✅ {col}: {n_notna}/{n_total} dtype={dtype}")
                
    except ImportError as e:
        print(f"⚠️ Impossible d'importer load_csv_robust: {e}")
        print("   → Utilisation du CSV brut pour la suite")
        df_loaded = df_raw.copy()
    except Exception as e:
        print(f"❌ Erreur load_csv_robust: {e}")
        df_loaded = df_raw.copy()
    
    # === ÉTAPE 4: Tester select_etfs_for_profile ===
    print_section("ÉTAPE 3: Après select_etfs_for_profile('Agressif')")
    print("(Les logs [DEBUG Agressif] apparaîtront ci-dessous)\n")
    
    try:
        from portfolio_engine import select_etfs_for_profile
        
        if select_etfs_for_profile is None:
            print("❌ select_etfs_for_profile est None (import échoué)")
            return False
        
        # Test avec profil Agressif
        df_input = df_loaded.copy() if df_loaded is not None else df_raw.copy()
        print(f"📊 Input: {len(df_input)} ETF, colonnes: {len(df_input.columns)}")
        
        df_selected = select_etfs_for_profile(df_input, "Agressif", top_n=100)
        print(f"\n✅ Sortie: {len(df_selected)} ETF sélectionnés")
        
        # Vérifier colonnes après sélection
        print("\n📋 Colonnes critiques après sélection:")
        for col in CRITICAL_COLS:
            status, n_notna, n_total, dtype, sample = check_column(df_selected, col)
            
            if status == "ABSENT":
                print(f"❌ {col}: COLONNE ABSENTE!")
            elif status == "ALL_NAN":
                print(f"🔴 {col}: 100% NaN!")
            else:
                print(f"✅ {col}: {n_notna}/{n_total} dtype={dtype}")
        
        # Vérifier le score
        if "_profile_score" in df_selected.columns:
            scores = df_selected["_profile_score"]
            print(f"\n📊 SCORES FINAUX:")
            print(f"   min={scores.min():.1f}, max={scores.max():.1f}")
            print(f"   mean={scores.mean():.1f}, std={scores.std():.2f}")
            print(f"   unique values: {scores.nunique()}")
            
            if scores.std() < 1:
                print("\n🔴 PROBLÈME CONFIRMÉ: Scores uniformes (std < 1)!")
                print("   → Les logs [DEBUG Agressif] ci-dessus indiquent la cause")
            else:
                print("\n✅ SCORES VARIÉS - Le fix fonctionne!")
        else:
            print("\n❌ Colonne _profile_score absente!")
                
    except ImportError as e:
        print(f"❌ Impossible d'importer select_etfs_for_profile: {e}")
        return False
    except Exception as e:
        print(f"❌ Erreur lors de la sélection: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # === CONCLUSION ===
    print_section("CONCLUSION ET ACTIONS")
    print("""
INTERPRÉTATION DES RÉSULTATS:

1. Si ÉTAPE 1 montre des NaN → Problème dans le CSV source
   → Vérifier le script qui génère combined_etfs.csv

2. Si ÉTAPE 1 OK mais ÉTAPE 2 montre des NaN → Problème dans load_csv_robust()
   → La fonction _safe_float() corrompt les données
   → FIX: Vérifier le format des nombres (virgule vs point)

3. Si ÉTAPE 2 OK mais ÉTAPE 3 montre des NaN → Problème dans preset_etf.py
   → Les logs [DEBUG Agressif] montrent exactement où
   → Regarder "COLONNE ABSENTE" ou "0/N non-NaN"

4. Si ÉTAPE 3 OK mais scores uniformes → Problème de variance
   → Toutes les valeurs sont identiques après filtrage
   → Vérifier les contraintes qui éliminent trop d'ETF

PROCHAINE ÉTAPE:
   Partager la sortie complète de ce script pour diagnostic.
""")
    
    return True

if __name__ == "__main__":
    success = diagnose()
    sys.exit(0 if success else 1)
