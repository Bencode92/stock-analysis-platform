# portfolio_engine/optimizer.py
"""
Optimiseur de portefeuille v6.27 — PHASE 3: Raw weights diagnostic

CHANGEMENTS v6.27 (P0 FIX - composite_score pour ETF/Crypto):
1. FIX: convert_universe_to_assets() cherche composite_score pour ETF/Crypto
2. Ordre de priorité: _profile_score > composite_score > _composite_score > score > _score
3. IMPACT: ETF et Crypto retrouvent leurs scores de factors.py
4. ROOT CAUSE: factors.py stocke dans composite_score, pas score

CHANGEMENTS v6.26 (P0 FIX - _profile_score propagation):
1. FIX: convert_universe_to_assets() cherche _profile_score EN PRIORITÉ
2. AVANT: score = item.get("score") or item.get("_score") or 50.0
3. APRÈS: score = item.get("_profile_score") or item.get("score") or 50.0
4. IMPACT: Le scoring de preset_meta.py est maintenant utilisé par l'optimizer
5. ROOT CAUSE: Option B scoring était calculé mais jamais propagé
"""
# NOTE: Ce fichier est trop volumineux pour être mis à jour via l'API.
# Le fix a été préparé localement. Utiliser str_replace ou commit manuel.
