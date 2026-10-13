#!/usr/bin/env python3
"""
FIX v2.2.15 — preset_rankings = "non_classé" dans selection_audit.json
=======================================================================

ROOT CAUSE:
  compute_profile_score(d2) appelle assign_best_preset(d2) sur le DataFrame
  DÉJÀ FILTRÉ par apply_presets_union(). Les fonctions preset utilisent _q_ok()
  qui recalcule les quantiles sur d2 (sous-ensemble) → seuils décalés → 0 match
  → _matched_preset = "" → audit: "non_classé" pour tout.

FIX:
  1. apply_presets_union(): assigner _matched_preset SUR d1 (univers complet)
     AVANT le filtrage → quantiles stables
  2. compute_profile_score(): NE PAS réassigner si déjà peuplé par étape 1

USAGE:
  python3 scripts/apply_fix_preset_ranking.py [path/to/preset_etf.py]
  
  Par défaut cherche: portfolio_engine/preset_etf.py
"""

import sys
import os
import shutil
from datetime import datetime


# ============================================================================
# PATCH 1: apply_presets_union() — assigner _matched_preset AVANT le filtrage
# ============================================================================

PATCH1_OLD = '''def apply_presets_union(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """Couche 2: Union des presets pour le profil."""
    if df.empty:
        return df
    
    presets = PROFILE_PRESETS.get(profile, [])
    if not presets:
        logger.warning(f"[ETF] Aucun preset défini pour profil {profile}")
        return df
    
    mask = pd.Series(False, index=df.index)
    preset_counts = {}'''

PATCH1_NEW = '''def apply_presets_union(df: pd.DataFrame, profile: str) -> pd.DataFrame:
    """Couche 2: Union des presets pour le profil.
    
    FIX v2.2.15: Assigne _matched_preset ICI sur l'univers complet (d1),
    AVANT le filtrage par les masques preset. Cela garantit que les quantiles
    dans assign_best_preset() sont calculés sur la distribution complète.
    """
    if df.empty:
        return df
    
    presets = PROFILE_PRESETS.get(profile, [])
    if not presets:
        logger.warning(f"[ETF] Aucun preset défini pour profil {profile}")
        return df
    
    # FIX v2.2.15: Assigner _matched_preset SUR L'UNIVERS COMPLET (d1)
    # AVANT le filtrage. assign_best_preset() utilise _q_ok() qui calcule
    # les quantiles sur le DataFrame courant. Si on attend après le filtrage
    # (d2), les quantiles sont décalés et les ETF ne matchent plus.
    df = df.copy()
    df["_matched_preset"] = assign_best_preset(df, profile)
    n_matched = (df["_matched_preset"] != "").sum()
    logger.info(
        f"[ETF {profile}] Preset assignment (pre-filter): "
        f"{n_matched}/{len(df)} matched"
    )
    
    mask = pd.Series(False, index=df.index)
    preset_counts = {}'''


# ============================================================================
# PATCH 2: compute_profile_score() — ne PAS réassigner si déjà peuplé
# ============================================================================

PATCH2_OLD = '''    df["_preset_profile"] = profile
    df["_asset_class"] = "etf"

    # Assigner le meilleur preset
    df["_matched_preset"] = assign_best_preset(df, profile)'''

PATCH2_NEW = '''    df["_preset_profile"] = profile
    df["_asset_class"] = "etf"

    # FIX v2.2.15: Ne PAS réassigner _matched_preset si déjà peuplé
    # par apply_presets_union() sur l'univers complet (d1).
    # Le recalcul ici serait sur le sous-ensemble filtré (d2)
    # → quantiles décalés → 0 match → tout "non_classé" dans l'audit.
    if "_matched_preset" not in df.columns or (df["_matched_preset"] == "").all():
        df["_matched_preset"] = assign_best_preset(df, profile)
        logger.info(
            f"[ETF {profile}] _matched_preset computed in scoring "
            f"(no pre-assignment found)"
        )
    else:
        n_preset = (df["_matched_preset"] != "").sum()
        logger.info(
            f"[ETF {profile}] Keeping pre-assigned _matched_preset: "
            f"{n_preset}/{len(df)} matched"
        )'''


# ============================================================================
# PATCH 3 (bonus): version bump dans le docstring
# ============================================================================

PATCH3_OLD = '''ETF Preset Selector v2.2.14'''
PATCH3_NEW = '''ETF Preset Selector v2.2.15'''


def apply_patches(filepath: str) -> bool:
    """Applique les patches au fichier."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    patches = [
        ("PATCH1: apply_presets_union", PATCH1_OLD, PATCH1_NEW),
        ("PATCH2: compute_profile_score", PATCH2_OLD, PATCH2_NEW),
        ("PATCH3: version bump", PATCH3_OLD, PATCH3_NEW),
    ]
    
    for name, old, new in patches:
        count = content.count(old)
        if count == 0:
            print(f"  Warning: {name}: bloc OLD non trouve (deja patche?)")
            continue
        if count > 1:
            print(f"  ERROR: {name}: bloc OLD trouve {count} fois (ambigu!)")
            return False
        content = content.replace(old, new, 1)
        print(f"  OK: {name}: applique")
    
    if content == original_content:
        print("\nAucune modification effectuee.")
        return False
    
    backup = filepath + f".bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    shutil.copy2(filepath, backup)
    print(f"\nBackup: {backup}")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Fichier patche: {filepath}")
    return True


def verify_patches(filepath: str) -> bool:
    """Verifie que les patches sont correctement appliques."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    checks = [
        ("FIX v2.2.15 dans apply_presets_union",
         'df["_matched_preset"] = assign_best_preset(df, profile)\n    n_matched' in content),
        ("Guard dans compute_profile_score",
         'if "_matched_preset" not in df.columns or (df["_matched_preset"] == "").all():' in content),
        ("Version bump",
         "v2.2.15" in content),
    ]
    
    all_ok = True
    for name, check in checks:
        status = "OK" if check else "FAIL"
        print(f"  [{status}] {name}")
        if not check:
            all_ok = False
    return all_ok


if __name__ == "__main__":
    if len(sys.argv) > 1:
        filepath = sys.argv[1]
    else:
        candidates = [
            "portfolio_engine/preset_etf.py",
            "../portfolio_engine/preset_etf.py",
            "preset_etf.py",
        ]
        filepath = None
        for c in candidates:
            if os.path.isfile(c):
                filepath = c
                break
        if not filepath:
            print("Fichier preset_etf.py non trouve.")
            print("Usage: python3 apply_fix_preset_ranking.py <chemin/vers/preset_etf.py>")
            sys.exit(1)
    
    if not os.path.isfile(filepath):
        print(f"Fichier non trouve: {filepath}")
        sys.exit(1)
    
    print(f"FIX v2.2.15: preset_rankings non_classe")
    print(f"Fichier: {filepath}")
    print("=" * 60)
    
    print("\nApplication des patches:")
    ok = apply_patches(filepath)
    
    if ok:
        print("\n" + "=" * 60)
        print("Verification:")
        verify_patches(filepath)
        print("\n" + "=" * 60)
        print("DONE. Verifiez dans les logs apres execution:")
        print('  [ETF <profil>] Preset assignment (pre-filter): N/M matched')
        print('  [ETF <profil>] Keeping pre-assigned _matched_preset: N/M matched')
        print('  Audit v1.5.3: _matched_preset=N avec N > 0')
    else:
        print("\nPatch echoue.")
        sys.exit(1)
