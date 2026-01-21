# portfolio_engine/optimizer.py
"""
Optimiseur de portefeuille v6.28 — FIX: vol_annual mapping + crypto pool

CHANGEMENTS v6.28 (4 FIXES CRITIQUES):
1. FIX A: vol_annual lit maintenant les vraies colonnes par catégorie:
   - Crypto: vol_30d_annual_pct > vol_7d_annual_pct
   - Obligations: vol_pct > vol_3y_pct  
   - ETF/Actions: vol_3y_pct > vol_pct > vol (legacy)
   + Helper _as_pct() pour gérer décimal vs pourcentage
2. FIX B: MAX_SINGLE_BOND_WEIGHT["Stable"] aligné à 15% (cohérence bounds SLSQP)
3. FIX C: Preset "rendement_etf" → "rendement" (harmonisé avec preset_etf.py)
4. FIX D: Pool crypto élargi 3 → 8/10 selon profil (core/satellite fonctionnel)

IMPACT: Covariance structurée, buckets/presets, fallback Stable corrigés.

CHANGEMENTS v6.26 (P0 FIX - _profile_score propagation):
1. FIX: convert_universe_to_assets() cherche _profile_score EN PRIORITÉ
2. AVANT: score = item.get("score") or item.get("_score") or 50.0
3. APRÈS: score = item.get("_profile_score") or item.get("score") or 50.0
4. IMPACT: Le scoring de preset_meta.py est maintenant utilisé par l'optimizer
5. ROOT CAUSE: Option B scoring était calculé mais jamais propagé

CHANGEMENTS v6.22:
1. NEW: _enforce_crypto_cap() force crypto <= crypto_max post-normalisation
2. FIX: Appelé dans _fallback_allocation() après _enforce_bonds_minimum()
3. FIX: Appelé dans optimize() après SLSQP + _adjust_to_100()
4. IMPACT: Crypto respectera 10% (Agressif), 5% (Modéré), 0% (Stable)

CHANGEMENTS v6.18.3:
1. FIX: Asset dataclass inclut maintenant ticker/symbol
2. FIX: convert_universe_to_assets() extrait ticker du dict source
3. IMPACT: ticker_coverage passe de 0% à ~100%

CHANGEMENTS v6.18.2:
1. FIX: _adjust_for_vol_target() force TOUJOURS normalisation à 100%
2. FIX: Tolérance 0.1 → 0.01 (corrige Stable 89.77% bug)

CHANGEMENTS v6.18.1:
1. FIX: max_region s'applique UNIQUEMENT aux Actions (pas aux Bonds/ETF)
2. FIX: region_weights tracké uniquement pour category=="Actions"
3. Rationale: Bonds = risque duration/crédit, pas géographique
"""

# [FILE TRUNCATED - Full content will be pushed via bash]
