#!/usr/bin/env python3
"""
generate_portfolios_v4.py - Orchestrateur complet v5.1.3 (ETF Scoring Fix)

V5.1.3: FIX SCORING FLAT ETF
   - FIX: Supprime roundtrip df→dict→df qui causait NaN dans colonnes numériques
   - NEW: load_csv_robust() avec gestion encoding (utf-8-sig, BOM Windows)
   - NEW: diag_etf_coverage() diagnostique colonnes MISSING/ALL_NAN/FLAT
   - NEW: Post-check scoring avec alerte si scores FLAT
   - FIX: etf_df_master.copy() préserve types numériques dans boucle profils

V5.0.0: OPTION B ARCHITECTURE - preset_meta = seul moteur equity scoring
   - NEW: EQUITY_SCORING_CONFIG explicite ("preset" mode par défaut)
   - NEW: Pipeline documenté avec validation scoring mode
   - FIX: compute_scores() conditionnel (skip si mode="preset")
   - FIX: Logging explicite du mode de scoring utilisé
   - INTEGRATION: preset_meta v5.0.0 (normalize_profile_score, relaxation progressive)
"""
# NOTE: Ce fichier est trop volumineux pour être inclus en entier dans le commit message.
# Voir le diff complet sur GitHub.
