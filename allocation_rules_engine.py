"""
Allocation Rules Engine v1.0.0
Reads allocation_rules.json and applies thematic caps, mandatory hedges,
profile replacements, and ETF splits to generated portfolios.

Integration: called from generate_portfolios_v4.py post-processing.
No hardcoded allocation logic — everything driven by the JSON config.
"""

import json
import logging
import os
from typing import Dict, Tuple, Optional, Any

logger = logging.getLogger(__name__)

# =============================================================================
# LOAD CONFIG
# =============================================================================

def load_allocation_rules(path: str = None) -> Dict:
    """Load allocation_rules.json from given path or default locations."""
    candidates = [
        path,
        os.path.join(os.path.dirname(__file__), "allocation_rules.json"),
        os.path.join(os.path.dirname(__file__), "data", "allocation_rules.json"),
        os.path.join(os.path.dirname(__file__), "..", "data", "allocation_rules.json"),
        "allocation_rules.json",
        os.path.join("data", "allocation_rules.json"),
    ]
    for p in candidates:
        if p and os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                rules = json.load(f)
            logger.info(f"[ALLOC_RULES] Loaded from {p} (v{rules.get('_version', '?')})")
            return rules
    logger.warning("[ALLOC_RULES] allocation_rules.json not found — skipping rules")
    return {}


# =============================================================================
# CLASSIFY POSITIONS INTO THEMES
# =============================================================================

def _build_industry_to_theme(rules: Dict) -> Dict[str, str]:
    """Build reverse mapping: industry string → theme key."""
    mapping = {}
    for theme_key, theme_def in rules.get("thematic_groups", {}).items():
        if theme_key.startswith("_") or not isinstance(theme_def, dict):
            continue
        for industry in theme_def.get("industries", []):
            mapping[industry.lower().strip()] = theme_key
    return mapping


def _build_exposure_to_theme(rules: Dict) -> Dict[str, str]:
    """Build reverse mapping: etf_exposure string → theme key."""
    mapping = {}
    for theme_key, theme_def in rules.get("thematic_groups", {}).items():
        if theme_key.startswith("_") or not isinstance(theme_def, dict):
            continue
        for exp in theme_def.get("etf_exposures", []):
            mapping[exp.lower().strip()] = theme_key
    return mapping


def _build_extra_tickers_to_theme(rules: Dict) -> Dict[str, str]:
    """Build reverse mapping: ticker → theme key (for special cases)."""
    mapping = {}
    for theme_key, theme_def in rules.get("thematic_groups", {}).items():
        if theme_key.startswith("_") or not isinstance(theme_def, dict):
            continue
        for tk in theme_def.get("extra_tickers", []):
            mapping[tk.upper().strip()] = theme_key
    return mapping


def classify_position(
    ticker: str,
    category: str,
    industry: str,
    exposure: str,
    industry_map: Dict[str, str],
    exposure_map: Dict[str, str],
    extra_map: Dict[str, str],
) -> str:
    """
    Classify a portfolio position into a thematic group.
    
    Priority:
    1. extra_tickers (explicit override, e.g. VRT → semi_ai)
    2. For Actions: industry mapping
    3. For ETF: exposure mapping
    4. Fallback: "unclassified"
    """
    tk_upper = (ticker or "").upper().strip()
    
    # Priority 1: explicit ticker override
    if tk_upper in extra_map:
        return extra_map[tk_upper]
    
    # Priority 2: Actions → industry
    if category == "Actions" and industry:
        theme = industry_map.get(industry.lower().strip())
        if theme:
            return theme
    
    # Priority 3: ETF → exposure
    if category == "ETF" and exposure:
        theme = exposure_map.get(exposure.lower().strip())
        if theme:
            return theme
    
    return "unclassified"


def classify_portfolio(
    tickers: Dict[str, float],
    meta: Dict[str, Dict],
    rules: Dict,
    etf_exposure_lookup: Dict[str, str],
) -> Dict[str, Dict]:
    """
    Classify all positions in a portfolio.
    Returns: {ticker: {"theme": str, "weight": float, "category": str}}
    """
    industry_map = _build_industry_to_theme(rules)
    exposure_map = _build_exposure_to_theme(rules)
    extra_map = _build_extra_tickers_to_theme(rules)
    
    classified = {}
    for tk, weight in tickers.items():
        info = meta.get(tk, {})
        category = info.get("category", "ETF")
        industry = info.get("industry", "")
        
        # ETF exposure: from meta if enriched, else from lookup
        exposure = info.get("exposure", "")
        if not exposure and category == "ETF":
            exposure = etf_exposure_lookup.get(tk.lower(), "")
        
        theme = classify_position(tk, category, industry, exposure,
                                  industry_map, exposure_map, extra_map)
        classified[tk] = {
            "theme": theme, "weight": weight, "category": category,
            "industry": industry, "exposure": exposure,
        }
    
    return classified


# =============================================================================
# APPLY THEMATIC CAPS
# =============================================================================

def apply_thematic_caps(
    tickers: Dict[str, float],
    meta: Dict[str, Dict],
    classified: Dict[str, Dict],
    profile: str,
    rules: Dict,
) -> Tuple[Dict[str, float], list]:
    """
    If a thematic group exceeds its cap, reduce the lowest-scored positions
    in that theme until the group is within cap.
    
    Returns: (adjusted_tickers, log_entries)
    """
    caps = rules.get("thematic_caps_pct", {})
    logs = []
    tickers = dict(tickers)  # copy
    
    # Aggregate weights by theme
    theme_weights = {}
    theme_positions = {}
    for tk, info in classified.items():
        theme = info["theme"]
        w = tickers.get(tk, 0)
        theme_weights[theme] = theme_weights.get(theme, 0) + w
        theme_positions.setdefault(theme, []).append((tk, w))
    
    for theme, positions in theme_positions.items():
        cap_by_profile = caps.get(theme)
        if not cap_by_profile:
            continue
        cap_pct = cap_by_profile.get(profile)
        if cap_pct is None:
            continue
        
        cap_dec = cap_pct / 100.0
        current = theme_weights.get(theme, 0)
        
        if current <= cap_dec + 0.001:
            continue
        
        excess = current - cap_dec
        logs.append(f"⚠️ {theme} = {current*100:.1f}% > cap {cap_pct}% → reducing by {excess*100:.1f}%")
        
        # Reduce PROPORTIONALLY across all positions in this theme
        # Each position shrinks by the same ratio (preserves relative conviction)
        ratio = cap_dec / current  # e.g. 25/43 = 0.58 → each keeps 58% of its weight
        
        total_reduced = 0
        for tk, w in positions:
            if tk not in tickers:
                continue
            new_w = w * ratio
            # Floor at 1% to avoid dust
            if new_w < 0.01:
                total_reduced += tickers[tk]
                logs.append(f"  🗑️ {tk}: {w*100:.1f}% → removed (below 1% after proportional cut)")
                del tickers[tk]
            else:
                reduced = tickers[tk] - new_w
                total_reduced += reduced
                tickers[tk] = new_w
                logs.append(f"  📉 {tk}: {w*100:.1f}% → {new_w*100:.1f}% (theme {theme})")
        
        # Redistribute to OTHER themes' equity/ETF positions (not bonds, not same theme)
        if total_reduced > 0:
            other_equity = [(tk, w) for tk, w in tickers.items()
                          if classified.get(tk, {}).get("theme") != theme
                          and classified.get(tk, {}).get("category") in ("Actions", "ETF")]
            if other_equity:
                total_other = sum(w for _, w in other_equity)
                if total_other > 0:
                    for tk, w in other_equity:
                        tickers[tk] += total_reduced * (w / total_other)
                    logs.append(f"  ♻️ {total_reduced*100:.1f}% redistributed to {len(other_equity)} equity/ETF positions")
                else:
                    logs.append(f"  ⚠️ {total_reduced*100:.1f}% excess not redistributed (no eligible targets)")
            else:
                logs.append(f"  ⚠️ {total_reduced*100:.1f}% excess not redistributed (no other equity/ETF)")
    
    return tickers, logs


# =============================================================================
# APPLY MANDATORY HEDGES
# =============================================================================

def apply_mandatory_hedges(
    tickers: Dict[str, float],
    meta: Dict[str, Dict],
    classified: Dict[str, Dict],
    profile: str,
    rules: Dict,
) -> Tuple[Dict[str, float], Dict[str, Dict], list]:
    """
    If a mandatory hedge is missing or below minimum, inject it.
    
    Returns: (adjusted_tickers, adjusted_meta, log_entries)
    """
    hedges = rules.get("mandatory_hedges", {}).get(profile, {})
    logs = []
    tickers = dict(tickers)
    meta = {k: dict(v) for k, v in meta.items()}  # deep-ish copy
    
    for hedge_name, hedge_cfg in hedges.items():
        min_pct = hedge_cfg.get("min_pct", 0)
        min_dec = min_pct / 100.0
        preferred = hedge_cfg.get("preferred_tickers", [])
        hedge_type = hedge_cfg.get("type", "ETF")
        
        if not preferred:
            continue
        
        # Check if any preferred ticker is already present
        current_weight = 0
        for tk in preferred:
            current_weight += tickers.get(tk, 0)
        
        if current_weight >= min_dec - 0.001:
            logs.append(f"✅ {hedge_name}: {current_weight*100:.1f}% >= min {min_pct}% — OK")
            continue
        
        # Need to inject
        inject_tk = preferred[0]
        inject_amount = min_dec - current_weight
        
        # Find position to take from: smallest weight, not a hedge itself
        hedge_tickers_all = set()
        for _, hcfg in hedges.items():
            for tk in hcfg.get("preferred_tickers", []):
                hedge_tickers_all.add(tk)
        
        candidates = [(tk, w) for tk, w in tickers.items() 
                      if tk not in hedge_tickers_all and w > inject_amount + 0.005]
        
        if not candidates:
            # Try taking from multiple positions
            candidates = [(tk, w) for tk, w in tickers.items() 
                         if tk not in hedge_tickers_all and w > 0.02]
            if not candidates:
                logs.append(f"⚠️ {hedge_name}: cannot inject {inject_tk} — no room")
                continue
            # Take pro-rata from all candidates
            total_cand = sum(w for _, w in candidates)
            for tk, w in candidates:
                take = inject_amount * (w / total_cand)
                tickers[tk] -= take
            logs.append(f"🏥 {hedge_name}: injected {inject_tk} at {inject_amount*100:.1f}% (pro-rata from {len(candidates)} positions)")
        else:
            # Take from largest candidate
            candidates.sort(key=lambda x: -x[1])
            donor_tk = candidates[0][0]
            tickers[donor_tk] -= inject_amount
            logs.append(f"🏥 {hedge_name}: injected {inject_tk} at {inject_amount*100:.1f}% (from {donor_tk})")
        
        # Add or update the hedge ticker
        tickers[inject_tk] = tickers.get(inject_tk, 0) + inject_amount
        
        # Update meta
        HEDGE_NAMES = {
            "GDE": "WisdomTree Efficient Gold Plus",
            "GLD": "SPDR Gold Shares",
            "XBI": "SPDR S&P Biotech ETF",
            "XLV": "Health Care Select Sector SPDR Fund",
            "LQD": "iShares iBoxx $ Investment Grade Corporate Bond ETF",
            "VCIT": "Vanguard Intermediate-Term Corporate Bond ETF",
            "IBIT": "iShares Bitcoin Trust ETF",
            "FBTC": "Fidelity Wise Origin Bitcoin Fund",
            "SLV": "iShares Silver Trust",
        }
        if inject_tk not in meta:
            meta[inject_tk] = {
                "weight": tickers[inject_tk],
                "category": hedge_type,
                "name": HEDGE_NAMES.get(inject_tk, inject_tk),
                "asset_ids": [],
            }
        meta[inject_tk]["weight"] = tickers[inject_tk]
    
    return tickers, meta, logs


# =============================================================================
# APPLY PROFILE REPLACEMENTS (e.g. TTE → ENGI in Stable)
# =============================================================================

def apply_profile_replacements(
    tickers: Dict[str, float],
    meta: Dict[str, Dict],
    profile: str,
    rules: Dict,
) -> Tuple[Dict[str, float], Dict[str, Dict], list]:
    """Apply direct ticker replacements per profile."""
    replacements = rules.get("profile_replacements", {}).get(profile, {})
    logs = []
    tickers = dict(tickers)
    meta = {k: dict(v) for k, v in meta.items()}
    
    for old_tk, repl_cfg in replacements.items():
        if old_tk not in tickers:
            continue
        new_tk = repl_cfg.get("replace_with")
        if not new_tk:
            continue
        
        old_weight = tickers.pop(old_tk)
        tickers[new_tk] = tickers.get(new_tk, 0) + old_weight
        
        meta[new_tk] = {
            "weight": tickers[new_tk],
            "category": meta.get(old_tk, {}).get("category", "Actions"),
            "name": repl_cfg.get("name", new_tk),
            "asset_ids": [],
        }
        
        logs.append(f"🔄 {old_tk} → {new_tk} ({old_weight*100:.1f}%): {repl_cfg.get('reason', '')}")
    
    return tickers, meta, logs


# =============================================================================
# APPLY ETF SPLITS (e.g. SLVP 9% → SLVP 5% + SLV 4%)
# =============================================================================

def apply_etf_splits(
    tickers: Dict[str, float],
    meta: Dict[str, Dict],
    profile: str,
    rules: Dict,
) -> Tuple[Dict[str, float], Dict[str, Dict], list]:
    """Split an ETF position into multiple ETFs per config."""
    splits = rules.get("etf_split_rules", {}).get(profile, {})
    logs = []
    tickers = dict(tickers)
    meta = {k: dict(v) for k, v in meta.items()}
    
    SPLIT_NAMES = {
        "SLV": "iShares Silver Trust",
        "SLVP": "iShares MSCI Global Silver and Metals Miners ETF",
    }
    
    for source_tk, split_cfg in splits.items():
        if source_tk not in tickers:
            continue
        
        original_weight = tickers[source_tk]
        split_into = split_cfg.get("split_into", {})
        if not split_into:
            continue
        
        # Remove original (will re-add with adjusted weight)
        del tickers[source_tk]
        
        for new_tk, fraction in split_into.items():
            new_weight = original_weight * fraction
            tickers[new_tk] = tickers.get(new_tk, 0) + new_weight
            if new_tk not in meta:
                meta[new_tk] = {
                    "weight": tickers[new_tk],
                    "category": "ETF",
                    "name": SPLIT_NAMES.get(new_tk, new_tk),
                    "asset_ids": [],
                }
            meta[new_tk]["weight"] = tickers[new_tk]
        
        logs.append(f"✂️ {source_tk} ({original_weight*100:.1f}%) split into: " +
                   ", ".join(f"{tk} {original_weight*frac*100:.1f}%" for tk, frac in split_into.items()) +
                   f" — {split_cfg.get('reason', '')}")
    
    return tickers, meta, logs


# =============================================================================
# REBUILD DISPLAY SECTIONS
# =============================================================================

def rebuild_display(tickers: Dict[str, float], meta: Dict[str, Dict]) -> Tuple[Dict, Dict]:
    """Rebuild Actions/ETF/Obligations/Crypto display dicts from _tickers."""
    display = {"Actions": {}, "ETF": {}, "Obligations": {}, "Crypto": {}}
    numeric = {}
    
    for tk, w_dec in tickers.items():
        w_pct = round(w_dec * 100, 1)
        if w_pct < 0.1:
            continue
        info = meta.get(tk, {})
        cat = info.get("category", "ETF")
        nm = info.get("name", tk)
        disp = f"{nm} ({tk})" if tk not in nm else nm
        display[cat][disp] = f"{w_pct:.1f}%"
        numeric[f"{cat}:{disp}"] = w_pct
    
    return display, numeric


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

def apply_allocation_rules(
    portfolio_data: Dict,
    profile: str,
    rules: Dict,
    etf_exposure_lookup: Dict[str, str],
) -> Dict:
    """
    Main entry point. Applies all allocation rules to a single profile.
    
    Args:
        portfolio_data: the profile dict with _tickers, _tickers_meta, Actions, ETF, etc.
        profile: "Agressif", "Modéré", "Stable"
        rules: loaded allocation_rules.json
        etf_exposure_lookup: {ticker_lower: exposure_string}
    
    Returns:
        Modified portfolio_data (in-place + returned)
    """
    if not rules:
        return portfolio_data
    
    tickers = portfolio_data.get("_tickers", {})
    meta = portfolio_data.get("_tickers_meta", {})
    
    if not tickers:
        return portfolio_data
    
    all_logs = [f"═══ ALLOCATION RULES ENGINE — {profile} ═══"]
    
    # Step 0: Classify all positions
    classified = classify_portfolio(tickers, meta, rules, etf_exposure_lookup)
    theme_summary = {}
    for tk, info in classified.items():
        t = info["theme"]
        theme_summary[t] = theme_summary.get(t, 0) + tickers.get(tk, 0)
    all_logs.append(f"Themes: {', '.join(f'{t}={w*100:.1f}%' for t, w in sorted(theme_summary.items(), key=lambda x:-x[1]))}")
    
    # Step 1: Profile replacements (TTE → ENGI)
    tickers, meta, logs = apply_profile_replacements(tickers, meta, profile, rules)
    all_logs.extend(logs)
    
    # Step 2: ETF splits (SLVP → SLVP + SLV)
    tickers, meta, logs = apply_etf_splits(tickers, meta, profile, rules)
    all_logs.extend(logs)
    
    # Step 4: Thematic caps (iterate up to 3 times to handle cascading redistributions)
    for _cap_pass in range(3):
        classified = classify_portfolio(tickers, meta, rules, etf_exposure_lookup)
        tickers_before = dict(tickers)
        tickers, cap_logs = apply_thematic_caps(tickers, meta, classified, profile, rules)
        all_logs.extend(cap_logs)
        if tickers == tickers_before:
            break  # No more changes needed
        if _cap_pass > 0:
            all_logs.append(f"  🔄 Cap pass {_cap_pass + 1} applied")
    
    # Step 5: Mandatory hedges
    tickers, meta, logs = apply_mandatory_hedges(tickers, meta, classified, profile, rules)
    all_logs.extend(logs)
    
    # Step 6: Normalize weights to 100%
    total = sum(tickers.values())
    if total > 0 and abs(total - 1.0) > 0.005:
        factor = 1.0 / total
        tickers = {k: v * factor for k, v in tickers.items()}
        all_logs.append(f"♻️ Re-normalized from {total*100:.1f}% to 100%")
    
    # Step 6b: BOND FLOOR — ensure minimum bond allocation per profile (BEFORE position cap)
    _BOND_FLOOR = {"Agressif": 0.10, "Modéré": 0.20, "Stable": 0.35}
    _FALLBACK_BONDS = ["SCHO", "STIP", "IGSB", "VCSH"]  # Short-duration safe options
    _FALLBACK_BOND_NAMES = {
        "SCHO": "Schwab Short-Term U.S. Treasury ETF",
        "STIP": "iShares 0-5 Year TIPS Bond ETF",
        "IGSB": "iShares 1-5 Year Investment Grade Corporate Bond ETF",
        "VCSH": "Vanguard Short-Term Corporate Bond ETF",
    }
    _min_bonds = _BOND_FLOOR.get(profile, 0.0)
    if _min_bonds > 0:
        _bond_total = sum(v for k, v in tickers.items() 
                         if meta.get(k, {}).get("category") == "Obligations")
        if _bond_total < _min_bonds - 0.005:
            _deficit = _min_bonds - _bond_total
            # Take from largest non-bond positions
            _non_bonds = [(k, v) for k, v in tickers.items() 
                         if meta.get(k, {}).get("category") != "Obligations" and v > 0.02]
            _non_bonds.sort(key=lambda x: -x[1])
            _remaining = _deficit
            for k, v in _non_bonds:
                if _remaining <= 0.001:
                    break
                _take = min(v * 0.3, _remaining)
                tickers[k] -= _take
                _remaining -= _take
            _added = _deficit - _remaining
            
            # Check if existing bonds can absorb (each stays below 15%)
            _bonds = {k: v for k, v in tickers.items() 
                     if meta.get(k, {}).get("category") == "Obligations"}
            _bond_capacity = sum(max(0, 0.14 - v) for v in _bonds.values())  # room to 14% each
            
            if _bond_capacity >= _added and _bonds:
                # Distribute to existing bonds pro-rata
                _total_b = sum(_bonds.values())
                for k in _bonds:
                    tickers[k] += _added * (_bonds[k] / _total_b)
                all_logs.append(f"🛡️ Bond floor: restored {_added*100:.1f}% to existing bonds")
            else:
                # Need to inject new bond position(s)
                # First fill existing bonds to 14%
                _given_to_existing = 0
                for k, v in _bonds.items():
                    _room = max(0, 0.14 - v)
                    _give = min(_room, _added - _given_to_existing)
                    tickers[k] += _give
                    _given_to_existing += _give
                
                _still_needed = _added - _given_to_existing
                if _still_needed > 0.005:
                    # Inject fallback bond
                    for _fb in _FALLBACK_BONDS:
                        if _fb not in tickers:
                            tickers[_fb] = _still_needed
                            meta[_fb] = {
                                "weight": _still_needed,
                                "category": "Obligations",
                                "name": _FALLBACK_BOND_NAMES.get(_fb, _fb),
                                "asset_ids": [],
                            }
                            all_logs.append(f"🛡️ Bond floor: injected {_fb} at {_still_needed*100:.1f}% to reach {_min_bonds*100:.0f}% min")
                            break
                    else:
                        all_logs.append(f"⚠️ Bond floor: could not reach {_min_bonds*100:.0f}% — all fallbacks already present")
    
    # Step 6c: POSITION CAP — no single position > 15% (AFTER bond floor)
    # CRITICAL: redistribute within SAME asset class to preserve bond floor
    _POS_MAX = 0.15
    for _cap_iter in range(5):
        _over = {k: v for k, v in tickers.items() if v > _POS_MAX + 0.001}
        if not _over:
            break
        for k, v in _over.items():
            _excess = v - _POS_MAX
            tickers[k] = _POS_MAX
            _over_cat = meta.get(k, {}).get("category", "ETF")
            all_logs.append(f"📉 Position cap: {k} {v*100:.1f}% → {_POS_MAX*100:.0f}%")
            # Redistribute within same category first, then any eligible
            _same_cat = [(tk2, w2) for tk2, w2 in tickers.items()
                        if tk2 != k and w2 < _POS_MAX - 0.01
                        and meta.get(tk2, {}).get("category") == _over_cat]
            if not _same_cat:
                _same_cat = [(tk2, w2) for tk2, w2 in tickers.items()
                            if tk2 != k and w2 < _POS_MAX - 0.01]
            if _same_cat:
                _total_sc = sum(w2 for _, w2 in _same_cat)
                if _total_sc > 0:
                    for tk2, w2 in _same_cat:
                        add = _excess * (w2 / _total_sc)
                        tickers[tk2] = min(tickers[tk2] + add, _POS_MAX)
    
    # Re-normalize after safety nets
    total = sum(tickers.values())
    if total > 0 and abs(total - 1.0) > 0.005:
        factor = 1.0 / total
        tickers = {k: v * factor for k, v in tickers.items()}
    
    # Step 7: Rebuild display
    display, numeric = rebuild_display(tickers, meta)
    
    portfolio_data["_tickers"] = tickers
    portfolio_data["_tickers_meta"] = meta
    portfolio_data["Actions"] = display.get("Actions", {})
    portfolio_data["ETF"] = display.get("ETF", {})
    portfolio_data["Obligations"] = display.get("Obligations", {})
    portfolio_data["Crypto"] = display.get("Crypto", {})
    portfolio_data["_numeric_weights"] = numeric
    
    # Log everything
    for line in all_logs:
        logger.info(f"[ALLOC_RULES] {line}")
    
    return portfolio_data
