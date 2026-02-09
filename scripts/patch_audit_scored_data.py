#!/usr/bin/env python3
"""
patch_audit_scored_data.py - Fix ETF/Crypto/Bond audit in generate_portfolios_v4.py

ROOT CAUSE: create_selection_audit() receives RAW data (no _matched_preset, no _profile_score)
            instead of SCORED data from select_etfs_for_profile().

EFFECT: selection_audit.json shows:
  - preset_rankings.etf = only "non_classé"
  - category_rankings.etf = 0 selected (ID mismatch)
  - sort_score_source = "none" for all ETFs

FIX: Collect scored ETF/crypto/bonds during profile loop, pass to audit.

Run from repo root:
  python3 scripts/patch_audit_scored_data.py
"""

import sys
from pathlib import Path

TARGET = Path("generate_portfolios_v4.py")


def apply_patch(content: str) -> str:
    """Apply all 5 patches to the file content."""

    # ================================================================
    # PATCH 1: Add collectors after "equities_by_profile = {}"
    # ================================================================
    anchor1 = "equities_by_profile = {}"
    if anchor1 not in content:
        print("❌ PATCH 1 FAILED: cannot find 'equities_by_profile = {}'")
        return None

    idx = content.index(anchor1) + len(anchor1)
    inject1 = """
    
    # === v1.5.3 FIX: Collect SCORED ETF/crypto/bonds for audit ===
    # Raw data has no _matched_preset / _profile_score → audit shows "non_classé"
    all_scored_etfs = {}       # keyed by etfsymbol/name to dedup
    all_scored_cryptos = {}    # keyed by symbol/name
    all_scored_bonds = {}      # keyed by name/isin"""

    content = content[:idx] + inject1 + content[idx:]
    print("✅ PATCH 1: Added scored data collectors")

    # ================================================================
    # PATCH 2: Collect scored ETFs after _force_category in GLOBAL loop
    # We target the FIRST occurrence only (Global pipeline)
    # ================================================================
    # The block ends with:  etf["category"] = "etf"\n            else:\n                profile_etf_data = []
    etf_marker = '                    etf["category"] = "etf"\n            else:\n                profile_etf_data = []'

    inject2 = '''
                # v1.5.3 FIX: Collect scored ETFs for audit (keep highest score)
                for _etf in profile_etf_data:
                    _uid = _etf.get("etfsymbol") or _etf.get("ticker") or _etf.get("name") or ""
                    if _uid:
                        _existing = all_scored_etfs.get(_uid)
                        _new_s = _etf.get("_profile_score") or 0
                        _old_s = (_existing or {}).get("_profile_score") or 0
                        if _existing is None or _new_s > _old_s:
                            all_scored_etfs[_uid] = _etf.copy()'''

    if etf_marker in content:
        # Insert BEFORE the else clause (first occurrence only)
        first_idx = content.index(etf_marker)
        insert_at = first_idx + len('                    etf["category"] = "etf"')
        content = content[:insert_at] + inject2 + content[insert_at:]
        print("✅ PATCH 2: Collect scored ETFs in profile loop")
    else:
        print("⚠️  PATCH 2: ETF _force_category anchor not found (non-critical)")

    # ================================================================
    # PATCH 2b: Collect scored crypto after _force_category
    # ================================================================
    crypto_marker = '                    cr["category"] = "crypto"\n            else:\n                profile_crypto_data = []'

    inject2b = '''
                # v1.5.3 FIX: Collect scored crypto for audit
                for _cr in profile_crypto_data:
                    _uid = _cr.get("symbol") or _cr.get("ticker") or _cr.get("name") or ""
                    if _uid:
                        _existing = all_scored_cryptos.get(_uid)
                        _new_s = _cr.get("_profile_score") or _cr.get("composite_score") or 0
                        _old_s = (_existing or {}).get("_profile_score") or (_existing or {}).get("composite_score") or 0
                        if _existing is None or _new_s > _old_s:
                            all_scored_cryptos[_uid] = _cr.copy()'''

    if crypto_marker in content:
        first_idx = content.index(crypto_marker)
        insert_at = first_idx + len('                    cr["category"] = "crypto"')
        content = content[:insert_at] + inject2b + content[insert_at:]
        print("✅ PATCH 2b: Collect scored crypto in profile loop")
    else:
        print("⚠️  PATCH 2b: crypto _force_category anchor not found")

    # ================================================================
    # PATCH 2c: Collect scored bonds after _force_category
    # ================================================================
    bond_marker = '                    bond["category"] = "bond"\n            else:\n                profile_bonds_data = []'

    inject2c = '''
                # v1.5.3 FIX: Collect scored bonds for audit
                for _bond in profile_bonds_data:
                    _uid = _bond.get("isin") or _bond.get("name") or ""
                    if _uid:
                        _existing = all_scored_bonds.get(_uid)
                        _new_s = _bond.get("bond_quality_raw") or _bond.get("composite_score") or 0
                        _old_s = (_existing or {}).get("bond_quality_raw") or (_existing or {}).get("composite_score") or 0
                        if _existing is None or _new_s > _old_s:
                            all_scored_bonds[_uid] = _bond.copy()'''

    if bond_marker in content:
        first_idx = content.index(bond_marker)
        insert_at = first_idx + len('                    bond["category"] = "bond"')
        content = content[:insert_at] + inject2c + content[insert_at:]
        print("✅ PATCH 2c: Collect scored bonds in profile loop")
    else:
        print("⚠️  PATCH 2c: bonds _force_category anchor not found")

    # ================================================================
    # PATCH 3: Replace audit creation block
    # ================================================================
    old_audit_start = "    # === v4.12.2 FIX: Génération de l'audit de sélection avec extraction correcte ==="
    old_audit_end = '            logger.info("✅ Audit de sélection généré")\n        except Exception as e:\n            logger.warning(f"⚠️ Erreur génération audit: {e}")\n            import traceback\n            traceback.print_exc()'

    if old_audit_start not in content:
        print("❌ PATCH 3 FAILED: cannot find old audit block start")
        return content  # Return partially patched

    if old_audit_end not in content:
        print("❌ PATCH 3 FAILED: cannot find old audit block end")
        return content

    start_idx = content.index(old_audit_start)
    end_idx = content.index(old_audit_end) + len(old_audit_end)

    new_audit_block = """    # === v1.5.3 FIX: Génération de l'audit avec données SCORÉES ===
    if CONFIG.get("generate_selection_audit", False) and SELECTION_AUDIT_AVAILABLE:
        try:
            # Extraire les actifs sélectionnés depuis les allocations (union des 3 profils)
            selected_tickers = set()
            for profile_data in portfolios.values():
                for asset_id in profile_data.get("allocation", {}).keys():
                    selected_tickers.add(asset_id)
            
            # v4.13: Utiliser equities_by_profile pour l'audit
            all_profile_equities = []
            for profile_eqs in equities_by_profile.values():
                all_profile_equities.extend(profile_eqs)
            
            # Dédupliquer par ID
            seen_ids = set()
            equities_final = []
            for e in all_profile_equities:
                eid = e.get("id") or e.get("ticker")
                if eid not in seen_ids:
                    seen_ids.add(eid)
                    equities_final.append(e)
            
            # === v1.5.3 FIX: Use SCORED data (has _matched_preset, _profile_score) ===
            scored_etf_list = list(all_scored_etfs.values()) if all_scored_etfs else etf_data
            scored_crypto_list = list(all_scored_cryptos.values()) if all_scored_cryptos else crypto_data
            scored_bonds_list = list(all_scored_bonds.values()) if all_scored_bonds else []
            
            logger.info(f"   📊 Audit v1.5.3: scored ETFs={len(scored_etf_list)}, scored crypto={len(scored_crypto_list)}, scored bonds={len(scored_bonds_list)}")
            
            # Check preset coverage
            n_with_preset = sum(1 for e in scored_etf_list if e.get("_matched_preset"))
            n_with_score = sum(1 for e in scored_etf_list if e.get("_profile_score") is not None)
            logger.info(f"   📊 Audit v1.5.3: ETF _matched_preset={n_with_preset}/{len(scored_etf_list)}, _profile_score={n_with_score}/{len(scored_etf_list)}")
            
            # v1.5.3 FIX: Build selected using ALL identifiers from scored data
            etf_selected_audit = []
            for etf in scored_etf_list:
                identifiers = set()
                for key in ["id", "ticker", "symbol", "name", "etfsymbol", "isin"]:
                    val = etf.get(key)
                    if val:
                        identifiers.add(str(val))
                if identifiers & selected_tickers:
                    etf_copy = etf.copy()
                    etf_copy["category"] = "etf"
                    etf_selected_audit.append(etf_copy)
            
            crypto_selected_audit = []
            for cr in scored_crypto_list:
                identifiers = set()
                for key in ["id", "ticker", "symbol", "name"]:
                    val = cr.get(key)
                    if val:
                        identifiers.add(str(val))
                if identifiers & selected_tickers:
                    crypto_selected_audit.append(cr)
            
            logger.info(f"   📊 Audit: {len(equities_final)} equities, {len(etf_selected_audit)} ETF, {len(crypto_selected_audit)} crypto sélectionnés")
            
            create_selection_audit(
                config=CONFIG,
                equities_initial=eq_rows_before_buffett,
                equities_after_buffett=eq_rows,
                equities_final=equities_final,
                etf_data=scored_etf_list,
                etf_selected=etf_selected_audit,
                crypto_data=scored_crypto_list,
                crypto_selected=crypto_selected_audit,
                market_context=market_context,
                output_path=CONFIG.get("selection_audit_output", "data/selection_audit.json"),
            )
            logger.info("✅ Audit de sélection généré (v1.5.3 - scored data)")
        except Exception as e:
            logger.warning(f"⚠️ Erreur génération audit: {e}")
            import traceback
            traceback.print_exc()"""

    content = content[:start_idx] + new_audit_block + content[end_idx:]
    print("✅ PATCH 3: Use scored data in audit creation")

    # ================================================================
    # Verify all patches
    # ================================================================
    checks = [
        ("all_scored_etfs = {}", "PATCH 1"),
        ("all_scored_etfs[_uid] = _etf.copy()", "PATCH 2"),
        ("all_scored_cryptos[_uid] = _cr.copy()", "PATCH 2b"),
        ("all_scored_bonds[_uid] = _bond.copy()", "PATCH 2c"),
        ("scored_etf_list = list(all_scored_etfs.values())", "PATCH 3"),
        ("Audit v1.5.3", "PATCH 3 log"),
    ]

    all_ok = True
    for marker, label in checks:
        if marker in content:
            print(f"   ✓ {label}: verified")
        else:
            print(f"   ✗ {label}: MISSING")
            all_ok = False

    if all_ok:
        print(f"\n✅ All patches verified. {len(content.splitlines())} lines")
    else:
        print("\n⚠️  Some patches missing!")

    return content


def main():
    if not TARGET.exists():
        print(f"❌ {TARGET} not found. Run from stock-analysis-platform root.")
        sys.exit(1)

    print(f"📝 Reading {TARGET}...")
    content = TARGET.read_text(encoding="utf-8")
    print(f"   {len(content.splitlines())} lines")

    # Check if already patched
    if "all_scored_etfs = {}" in content:
        print("⚠️  Already patched (all_scored_etfs found). Skipping.")
        sys.exit(0)

    print(f"\n🔧 Applying patches...")
    patched = apply_patch(content)

    if patched is None:
        print("❌ Patching failed!")
        sys.exit(1)

    # Backup
    backup = TARGET.with_suffix(".py.pre_v153")
    import shutil
    shutil.copy2(TARGET, backup)
    print(f"\n💾 Backup: {backup}")

    # Write
    TARGET.write_text(patched, encoding="utf-8")
    print(f"✅ Patched: {TARGET}")

    print(f"""
╔════════════════════════════════════════════════════════════╗
║  v1.5.3 PATCH APPLIED                                     ║
╠════════════════════════════════════════════════════════════╣
║  BEFORE: audit receives RAW ETF data                       ║
║    → preset_rankings.etf = only "non_classé"               ║
║    → sort_score_source = "none"                            ║
║                                                            ║
║  AFTER: audit receives SCORED ETF data                     ║
║    → preset_rankings.etf = 14 presets                      ║
║    → sort_score_source = "_profile_score"                  ║
║                                                            ║
║  Next: run generate_portfolios_v4.py                       ║
║        check data/selection_audit.json                     ║
╚════════════════════════════════════════════════════════════╝
""")


if __name__ == "__main__":
    main()
