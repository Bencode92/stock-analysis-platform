#!/bin/bash
# Script pour appliquer les patches RADAR TIE-BREAKER
# Usage: ./apply_patches.sh

set -e

echo "=== RADAR TIE-BREAKER PATCH APPLICATOR ==="
echo ""

# Backup
echo "1. Création des backups..."
cp portfolio_engine/factors.py portfolio_engine/factors.py.backup
cp portfolio_engine/universe.py portfolio_engine/universe.py.backup
echo "✅ Backups créés"

# Instructions
echo ""
echo "2. MODIFICATIONS MANUELLES REQUISES:"
echo ""
echo "   A) Dans portfolio_engine/factors.py:"
echo "      - Ligne ~1290: Remplacer 'self._macro_tilts = None'"
echo "        Par: 'self._macro_tilts = DEFAULT_MACRO_TILTS.copy()'"
echo "      - Après 'if self.market_context: _build_lookups()'"
echo "        Ajouter le bloc 'else:' avec warning"
echo "      - Avant 'if __name__': Ajouter compute_radar_bonus_from_matching()"
echo ""
echo "   B) Dans portfolio_engine/universe.py:"
echo "      - Avant sector_balanced_selection: Ajouter _calibrate_eps() et _compute_radar_coverage()"
echo "      - Modifier sector_balanced_selection() avec nouveaux paramètres RADAR"
echo ""
echo "   Voir patches/RADAR_FIX_FACTORS.patch et patches/RADAR_FIX_UNIVERSE.patch"
echo ""

echo "3. Après modifications, exécuter les tests:"
echo "   python tests/test_radar_tiebreaker.py"
echo ""
echo "=== FIN ==="
