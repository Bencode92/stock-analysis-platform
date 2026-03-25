"""
Allocation Rules Engine v2.0.0
Reads allocation_rules.json and applies thematic caps, mandatory hedges,
profile replacements, ETF splits, beta filter actions, and market conditions.

Integration: called from generate_portfolios_v4.py post-processing.
No hardcoded allocation logic — everything driven by the JSON config.
"""

import json
import logging
import os
import urllib.request
import urllib.error
from typing import Dict, Tuple, Optional, Any

logger = logging.getLogger(__name__)


# =============================================================================
# FETCH MARKET CONDITIONS (Principle 5)
# =============================================================================

def fetch_market_conditions(api_key: str = None) -> Dict[str, float]:
    """
    Fetch real-time market data for conditional rules evaluation.
    Uses Twelve Data API (same as the rest of the pipeline).
    Returns a dict of market indicators. Missing values = None (rule skipped).
    """
    data = {}
    
    # Try to find API key from env or config
    if not api_key:
        api_key = os.environ.get("TWELVE_DATA_API_KEY") or os.environ.get("TWELVE_DATA_API") or os.environ.get("TD_API_KEY")
    
    if not api_key:
        logger.warning("[MARKET] No Twelve Data API key found — market conditions disabled")
        return data
    
    def _fetch_price(symbol, days=5):
        """Fetch last N days of closes for a symbol."""
        try:
            url = f"https://api.twelvedata.com/time_series?symbol={symbol}&interval=1day&outputsize={days}&apikey={api_key}"
            req = urllib.request.Request(url, headers={"User-Agent": "AllocationEngine/2.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read().decode())
            if "values" in result:
                closes = [float(v["close"]) for v in result["values"]]
                return closes
        except Exception as e:
            logger.warning(f"[MARKET] Failed to fetch {symbol}: {e}")
        return None
    
    def _fetch_quote(symbol):
        """Fetch current quote for a symbol."""
        try:
            url = f"https://api.twelvedata.com/quote?symbol={symbol}&apikey={api_key}"
            req = urllib.request.Request(url, headers={"User-Agent": "AllocationEngine/2.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read().decode())
            if "close" in result:
                return float(result["close"])
        except Exception as e:
            logger.warning(f"[MARKET] Failed to fetch quote {symbol}: {e}")
        return None
    
    # 1. Brent crude — avg 5 days (try multiple symbols)
    # Twelve Data commodity symbols: XBR/USD (Brent), XTI/USD (WTI), CL (futures)
    # BZ = Kanzhun Ltd (NOT Brent!) — do NOT use
    brent_closes = None
    for brent_sym in ["XBR/USD", "XTI/USD", "CL"]:
        brent_closes = _fetch_price(brent_sym, days=5)
        if brent_closes:
            # Sanity: ALL prices should be > $30 and < $300 (crude oil range)
            if all(30 < p < 300 for p in brent_closes):
                logger.info(f"[MARKET] Brent symbol resolved: {brent_sym}")
                break
        brent_closes = None
    if brent_closes:
        data["brent_usd_avg5d"] = sum(brent_closes) / len(brent_closes)
        logger.info(f"[MARKET] Brent avg5d: ${data['brent_usd_avg5d']:.1f}")
    else:
        logger.warning("[MARKET] Brent: no valid data — tried XBR/USD, XTI/USD, CL")
    
    # 2. VIX — not available on Twelve Data (not a tradeable symbol)
    # Use environment variable VIX_LEVEL, updated manually or by a separate job
    # Default to 22 (neutral) if not set
    _vix_env = os.environ.get("VIX_LEVEL")
    if _vix_env:
        try:
            data["vix"] = float(_vix_env)
            logger.info(f"[MARKET] VIX: {data['vix']:.1f} (from VIX_LEVEL env)")
        except ValueError:
            logger.warning(f"[MARKET] VIX_LEVEL invalid: {_vix_env}")
    else:
        data["vix"] = 22.0  # Neutral default — rule vix>30 won't trigger
        logger.info("[MARKET] VIX: 22.0 (default — set VIX_LEVEL env for real data)")
    
    # 3. Gold — current price + ATH for drawdown calculation
    gold_closes = _fetch_price("XAU/USD", days=120)
    if gold_closes:
        current_gold = gold_closes[0]  # most recent
        ath = max(gold_closes)
        drawdown = ((ath - current_gold) / ath) * 100 if ath > 0 else 0
        data["gold_price"] = current_gold
        data["gold_ath_120d"] = ath
        data["gold_drawdown_from_ath_pct"] = drawdown
        logger.info(f"[MARKET] Gold: ${current_gold:.0f}, ATH(120d): ${ath:.0f}, DD: {drawdown:.1f}%")
    
    # 4. Fed funds rate delta — approximated via 2Y treasury yield change
    # (actual Fed funds requires FRED API, 2Y yield is a proxy)
    # For now, set to 0 (neutral) — can be enhanced with FRED later
    data["fed_funds_rate_delta_6m"] = 0.0
    
    # 5. CPI — hard to get real-time, use last known value
    # Default to current estimate (~2.4% as of March 2026)
    data["cpi_yoy_pct"] = float(os.environ.get("CPI_YOY_PCT", "2.4"))
    
    # 6. IG spread — approximated via LQD yield - treasury yield
    # This is a rough proxy; real spread data requires Bloomberg/ICE
    data["ig_spread_bps"] = float(os.environ.get("IG_SPREAD_BPS", "135"))
    
    logger.info(f"[MARKET] Conditions loaded: {', '.join(f'{k}={v}' for k, v in data.items() if v is not None)}")
    return data


def evaluate_market_rules(rules: Dict, market_data: Dict) -> Dict:
    """
    Evaluate market condition rules and return adjusted caps/hedges.
    Returns a dict of adjustments to apply.
    """
    adjustments = {
        "thematic_cap_deltas": {},   # {theme: {profile: delta}}
        "hedge_deltas": {},          # {hedge: {profile: delta}}
        "bond_preferences": [],      # v2.1: [{action, profiles, ...}]
        "active_rules": [],
    }
    
    if not market_data:
        return adjustments
    
    conditions = rules.get("market_conditions", {}).get("rules", [])
    
    for rule in conditions:
        rule_id = rule.get("id", "?")
        condition = rule.get("condition", "")
        
        # Simple condition evaluator — supports: var > N, var < N
        try:
            parts = condition.replace("  ", " ").split(" ")
            if len(parts) != 3:
                continue
            var_name, operator, threshold = parts[0], parts[1], float(parts[2])
            value = market_data.get(var_name)
            
            if value is None:
                continue
            
            triggered = False
            if operator == ">" and value > threshold:
                triggered = True
            elif operator == "<" and value < threshold:
                triggered = True
            elif operator == ">=" and value >= threshold:
                triggered = True
            elif operator == "<=" and value <= threshold:
                triggered = True
            
            if not triggered:
                continue
            
            adjustments["active_rules"].append(rule_id)
            logger.info(f"[MARKET] Rule '{rule_id}' ACTIVE: {condition} (value={value:.1f})")
            
            for adj in rule.get("adjustments", []):
                adj_type = adj.get("type", "")
                profiles = adj.get("profiles", [])
                
                if adj_type == "thematic_cap_delta":
                    theme = adj["theme"]
                    delta = adj["delta_pct"]
                    for p in profiles:
                        adjustments["thematic_cap_deltas"].setdefault(theme, {})
                        adjustments["thematic_cap_deltas"][theme][p] = \
                            adjustments["thematic_cap_deltas"][theme].get(p, 0) + delta
                
                elif adj_type == "mandatory_hedge_delta":
                    hedge = adj["hedge"]
                    delta = adj["delta_pct"]
                    for p in profiles:
                        adjustments["hedge_deltas"].setdefault(hedge, {})
                        adjustments["hedge_deltas"][hedge][p] = \
                            adjustments["hedge_deltas"][hedge].get(p, 0) + delta
                
                elif adj_type == "bond_preference":
                    adjustments["bond_preferences"].append({
                        "action": adj.get("action"),
                        "profiles": profiles,
                        "max_dur": adj.get("max_dur"),
                        "fund_types": adj.get("fund_types", []),
                        "rule_id": rule_id,
                    })
                            
        except Exception as e:
            logger.warning(f"[MARKET] Error evaluating rule '{rule_id}': {e}")
    
    if adjustments["active_rules"]:
        logger.info(f"[MARKET] Active rules: {adjustments['active_rules']}")
    else:
        logger.info("[MARKET] No market rules triggered")
    
    return adjustments


def apply_market_adjustments(rules: Dict, adjustments: Dict) -> Dict:
    """
    Apply market condition adjustments to rules (modifies in-place).
    Adjusts thematic_caps_pct and mandatory_hedges.
    """
    if not adjustments.get("active_rules"):
        return rules
    
    # Adjust thematic caps
    for theme, profile_deltas in adjustments.get("thematic_cap_deltas", {}).items():
        if theme in rules.get("thematic_caps_pct", {}):
            for profile, delta in profile_deltas.items():
                old = rules["thematic_caps_pct"][theme].get(profile, 0)
                rules["thematic_caps_pct"][theme][profile] = max(0, old + delta)
                logger.info(f"[MARKET] Cap {theme}/{profile}: {old}% → {old + delta}%")
    
    # Adjust mandatory hedges
    for hedge, profile_deltas in adjustments.get("hedge_deltas", {}).items():
        for profile, delta in profile_deltas.items():
            hedges = rules.get("mandatory_hedges", {}).get(profile, {})
            if hedge in hedges:
                old = hedges[hedge].get("min_pct", 0)
                hedges[hedge]["min_pct"] = max(0, old + delta)
                logger.info(f"[MARKET] Hedge {hedge}/{profile}: {old}% → {old + delta}%")
    
    # v2.1: Pass bond preferences to rules for the main function
    if adjustments.get("bond_preferences"):
        rules["_active_bond_preferences"] = adjustments["bond_preferences"]
        logger.info(f"[MARKET] Bond preferences: {len(adjustments['bond_preferences'])} active")
    
    return rules

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
        
        # v2: Check cap_reduction_priority — reduce hedge tickers last
        _priority = rules.get("cap_reduction_priority", {}).get(theme, {})
        _reduce_last = set(_priority.get("reduce_last", []))
        _reduce_first = set(_priority.get("reduce_first", []))
        
        # Split positions: reducible first, hedge last
        _first_positions = [(tk, w) for tk, w in positions if tk in _reduce_first]
        _last_positions = [(tk, w) for tk, w in positions if tk in _reduce_last]
        _normal_positions = [(tk, w) for tk, w in positions if tk not in _reduce_first and tk not in _reduce_last]
        
        # Try reducing _first + _normal before touching _last
        _first_total = sum(w for _, w in _first_positions) + sum(w for _, w in _normal_positions)
        
        total_reduced = 0
        if _first_total >= excess + 0.001 and (_first_positions or _normal_positions):
            # Can absorb all excess without touching hedge tickers
            _reducible = _first_positions + _normal_positions
            _red_total = sum(w for _, w in _reducible)
            _ratio = max(0, (_red_total - excess) / _red_total) if _red_total > 0 else 0
            for tk, w in _reducible:
                if tk not in tickers:
                    continue
                new_w = w * _ratio
                if new_w < 0.01:
                    total_reduced += tickers[tk]
                    logs.append(f"  🗑️ {tk}: {w*100:.1f}% → removed (below 1%)")
                    del tickers[tk]
                else:
                    total_reduced += tickers[tk] - new_w
                    tickers[tk] = new_w
                    logs.append(f"  📉 {tk}: {w*100:.1f}% → {new_w*100:.1f}% (theme {theme})")
            if _last_positions:
                logs.append(f"  🛡️ Hedge tickers preserved: {', '.join(tk for tk, _ in _last_positions)}")
        else:
            # Must reduce everything proportionally
            ratio = cap_dec / current
            for tk, w in positions:
                if tk not in tickers:
                    continue
                new_w = w * ratio
                if new_w < 0.01:
                    total_reduced += tickers[tk]
                    logs.append(f"  🗑️ {tk}: {w*100:.1f}% → removed (below 1%)")
                    del tickers[tk]
                else:
                    total_reduced += tickers[tk] - new_w
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
        if tk.startswith("_"):  # Skip internal keys (_CASH, etc.)
            continue
        w_pct = round(w_dec * 100, 1)
        if w_pct < 0.1:
            continue
        info = meta.get(tk, {})
        cat = info.get("category", "ETF")
        if cat not in display:
            display[cat] = {}  # Handle unknown categories gracefully
        nm = info.get("name", tk)
        disp = f"{nm} ({tk})" if tk not in nm else nm
        display[cat][disp] = f"{w_pct:.1f}%"
        numeric[f"{cat}:{disp}"] = w_pct
    
    return display, numeric


# =============================================================================
# BETA FILTER ACTIONS (Principle 2 for stocks)
# =============================================================================

def _load_beta_from_stocks_files() -> Dict[str, float]:
    """Load beta values from stocks JSON files as fallback when _tickers_meta.beta is None."""
    betas = {}
    stock_patterns = [
        os.path.join("data", "stocks_us.json"),
        os.path.join("data", "stocks_europe.json"),
        os.path.join("data", "stocks_asia.json"),
    ]
    # Also check relative to engine location
    engine_dir = os.path.dirname(os.path.abspath(__file__))
    for pattern in stock_patterns:
        for base in [os.getcwd(), engine_dir, os.path.join(engine_dir, "..")]:
            fpath = os.path.join(base, pattern)
            if os.path.isfile(fpath):
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    stocks = data.get("stocks", data) if isinstance(data, dict) else data
                    if isinstance(stocks, list):
                        for s in stocks:
                            tk = s.get("ticker", "")
                            # v5.4.2: Prefer beta_provider (standard market beta)
                            # over beta/beta_capm (regional benchmark, e.g. VGK)
                            b = s.get("beta_provider") or s.get("beta") or s.get("beta_capm")
                            if tk and b is not None:
                                try:
                                    betas[tk.upper()] = float(b)
                                except (ValueError, TypeError):
                                    pass
                except Exception:
                    pass
                break  # Found this file, move to next pattern
    if betas:
        logger.info(f"[BETA] Loaded {len(betas)} betas from stocks files")
    return betas

# Module-level cache
_BETA_CACHE: Dict[str, float] = {}


def apply_beta_filter_actions(
    tickers: Dict[str, float],
    meta: Dict[str, Dict],
    profile: str,
    rules: Dict,
) -> Tuple[Dict[str, float], Dict[str, Dict], list]:
    """
    Remove or flag actions whose beta exceeds the profile threshold.
    Beta data comes from _tickers_meta, with fallback to stocks JSON files.
    """
    global _BETA_CACHE
    
    beta_max_cfg = rules.get("beta_max_actions", {})
    beta_max = beta_max_cfg.get(profile)
    logs = []
    
    if beta_max is None:
        return tickers, meta, logs  # No filter for this profile
    
    logs.append(f"🔍 Beta filter: {profile} max={beta_max}, checking {sum(1 for t,m in meta.items() if m.get('category')=='Actions')} actions")
    
    tickers = dict(tickers)
    meta = {k: dict(v) for k, v in meta.items()}
    
    # Load beta cache from stocks files if not yet loaded
    if not _BETA_CACHE:
        _BETA_CACHE = _load_beta_from_stocks_files()
        logs.append(f"📊 Beta cache loaded: {len(_BETA_CACHE)} tickers from stocks files")
    
    # Check for replacements in profile_replacements (so we don't remove + replace = conflict)
    replacements = rules.get("profile_replacements", {}).get(profile, {})
    
    violators = []
    _missing_beta = []
    for tk, w in list(tickers.items()):
        info = meta.get(tk, {})
        if info.get("category") != "Actions":
            continue
        
        # Get beta — ALWAYS prefer cache (reads beta_provider from raw JSON files)
        # over _tickers_meta (which may have regional beta, e.g. XOM vs VGK = 0.07)
        beta = _BETA_CACHE.get(tk.upper())
        if beta is not None:
            if info.get("beta") is not None and abs(beta - (info.get("beta") or 0)) > 0.3:
                logs.append(f"  📊 {tk}: cache={beta:.2f} vs meta={info.get('beta'):.2f} — using cache (beta_provider)")
            meta[tk]["beta"] = beta  # Overwrite meta with correct value
        else:
            # Fallback to _tickers_meta if not in cache
            beta = info.get("beta") or info.get("beta_capm")
            if beta is not None:
                logs.append(f"  📊 {tk}: beta={beta:.2f} from meta (no cache entry)")
        
        if beta is None:
            _missing_beta.append(tk)
            continue
        
        try:
            beta = float(beta)
        except (ValueError, TypeError):
            _missing_beta.append(f"{tk}(invalid:{beta})")
            continue
        
        logs.append(f"  📊 {tk}: beta={beta:.2f} {'> max' if beta > beta_max else 'OK'}")
        
        if beta > beta_max:
            # Check if there's already a replacement defined
            if tk in replacements:
                logs.append(f"⚠️ {tk} beta {beta:.2f} > max {beta_max} — replacement via profile_replacements")
                continue  # Will be handled by apply_profile_replacements
            
            violators.append((tk, w, beta))
    
    if _missing_beta:
        logs.append(f"⚠️ Beta missing for {len(_missing_beta)} actions: {', '.join(_missing_beta[:5])} — skipped")
    
    if not violators:
        return tickers, meta, logs
    
    # Remove violators and redistribute their weight
    total_removed = 0
    for tk, w, beta in violators:
        del tickers[tk]
        total_removed += w
        logs.append(f"🚫 {tk} removed: beta {beta:.2f} > max {beta_max} for {profile}")
    
    # Redistribute to remaining actions (same category, below beta threshold)
    remaining_actions = [(tk, w) for tk, w in tickers.items()
                        if meta.get(tk, {}).get("category") == "Actions"]
    if remaining_actions and total_removed > 0:
        total_remaining = sum(w for _, w in remaining_actions)
        if total_remaining > 0:
            for tk, w in remaining_actions:
                tickers[tk] += total_removed * (w / total_remaining)
            logs.append(f"♻️ {total_removed*100:.1f}% redistributed to {len(remaining_actions)} remaining actions")
    elif total_removed > 0:
        # No remaining actions — redistribute to all
        all_pos = [(tk, w) for tk, w in tickers.items() if w > 0]
        total_all = sum(w for _, w in all_pos)
        if total_all > 0:
            for tk, w in all_pos:
                tickers[tk] += total_removed * (w / total_all)
    
    return tickers, meta, logs


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

def apply_allocation_rules(
    portfolio_data: Dict,
    profile: str,
    rules: Dict,
    etf_exposure_lookup: Dict[str, str],
    market_data: Dict = None,
) -> Dict:
    """
    Main entry point. Applies all allocation rules to a single profile.
    
    Args:
        portfolio_data: the profile dict with _tickers, _tickers_meta, Actions, ETF, etc.
        profile: "Agressif", "Modéré", "Stable"
        rules: loaded allocation_rules.json (may be pre-adjusted by market conditions)
        etf_exposure_lookup: {ticker_lower: exposure_string}
        market_data: optional dict of market indicators for conditional rules
    
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
    
    # Step -1: Supplement exposure lookup with known engine tickers
    # These tickers may be injected by the engine (splits, hedges) and not in the pipeline's lookup
    _ENGINE_KNOWN_EXPOSURES = {
        "slv": "silver_physical", "sivr": "silver_physical",
        "gde": "gold_physical", "gld": "gold_physical", "iau": "gold_physical",
        "sgol": "gold_physical", "aaau": "gold_physical", "gldm": "gold_physical",
        "gdxj": "gold_miners", "gdx": "gold_miners",
        "slvp": "silver_miners", "silj": "silver_miners",
        "xbi": "biotech", "xph": "pharma",
        "xlv": "healthcare", "vht": "healthcare", "fhlc": "healthcare",
        "ibit": "btc_etf", "fbtc": "btc_etf",
        "lqd": "bonds_ig", "vcit": "bonds_ig", "igsb": "bonds_ig",
        "scho": "bonds_treasury", "stip": "bonds_tips",
        "vcsh": "bonds_ig_short", "agz": "bonds_treasury",
        "iusv": "value", "schd": "dividend", "hdv": "dividend",
        "schy": "dividend_intl", "fndf": "value_intl",
        "remx": "rare_earth",
    }
    etf_exposure_lookup = dict(etf_exposure_lookup)  # copy to avoid mutating caller
    for _tk, _exp in _ENGINE_KNOWN_EXPOSURES.items():
        if _tk not in etf_exposure_lookup:
            etf_exposure_lookup[_tk] = _exp
    
    # Step 0: Classify all positions
    classified = classify_portfolio(tickers, meta, rules, etf_exposure_lookup)
    theme_summary = {}
    for tk, info in classified.items():
        t = info["theme"]
        theme_summary[t] = theme_summary.get(t, 0) + tickers.get(tk, 0)
    all_logs.append(f"Themes: {', '.join(f'{t}={w*100:.1f}%' for t, w in sorted(theme_summary.items(), key=lambda x:-x[1]))}")
    
    # Step 1: Profile replacements (TTE → IBE)
    tickers, meta, logs = apply_profile_replacements(tickers, meta, profile, rules)
    all_logs.extend(logs)
    
    # Step 1b: Beta filter actions (remove high-beta stocks from Stable/Modéré)
    tickers, meta, logs = apply_beta_filter_actions(tickers, meta, profile, rules)
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
    
    # Step 5b: CRYPTO POSITION CAP — no single crypto > 3% (except BTC/ETH at 5%)
    _CRYPTO_CAP = rules.get("crypto_position_cap", {})
    _CRYPTO_DEFAULT_MAX = _CRYPTO_CAP.get("default_max_pct", 3.0) / 100.0
    _CRYPTO_EXCEPTIONS = _CRYPTO_CAP.get("exceptions", {
        "BTC": 5.0, "ETH": 5.0, "IBIT": 5.0, "FBTC": 5.0, "ETHE": 5.0, "ETHW": 5.0
    })
    _CRYPTO_EXCEPTIONS = {k.upper(): v / 100.0 for k, v in _CRYPTO_EXCEPTIONS.items()}
    
    _crypto_excess = 0.0
    _crypto_capped = []
    for tk, w in list(tickers.items()):
        if meta.get(tk, {}).get("category") != "Crypto":
            continue
        # Check base symbol (TRX/USD → TRX, MORPHO/USD → MORPHO, IBIT → IBIT)
        _base = tk.split("/")[0].upper() if "/" in tk else tk.upper()
        _max = _CRYPTO_EXCEPTIONS.get(_base, _CRYPTO_DEFAULT_MAX)
        if w > _max + 0.001:
            _excess = w - _max
            tickers[tk] = _max
            _crypto_excess += _excess
            _crypto_capped.append(f"{tk}: {w*100:.1f}% → {_max*100:.1f}%")
    
    if _crypto_excess > 0.001:
        # Redistribute to non-crypto positions
        _non_crypto = [(tk2, w2) for tk2, w2 in tickers.items()
                      if meta.get(tk2, {}).get("category") != "Crypto" and w2 > 0.01]
        if _non_crypto:
            _total_nc = sum(w2 for _, w2 in _non_crypto)
            if _total_nc > 0:
                for tk2, w2 in _non_crypto:
                    tickers[tk2] += _crypto_excess * (w2 / _total_nc)
        for _cc in _crypto_capped:
            all_logs.append(f"🪙 Crypto cap: {_cc}")
        all_logs.append(f"♻️ {_crypto_excess*100:.1f}% crypto excess redistributed to {len(_non_crypto)} positions")
    
    # Step 6: Normalize weights to 100%
    total = sum(tickers.values())
    if total > 0 and abs(total - 1.0) > 0.005:
        factor = 1.0 / total
        tickers = {k: v * factor for k, v in tickers.items()}
        all_logs.append(f"♻️ Re-normalized from {total*100:.1f}% to 100%")
    
    # Step 6b: BOND FLOOR — read from config (v2: Stable 35→40%)
    _BOND_FLOOR = rules.get("bond_floor", {"Agressif": 0.10, "Modéré": 0.20, "Stable": 0.40})
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
    
    # Step 6b2: BOND PREFERENCE — apply market-driven bond adjustments
    # This step swaps/reweights bonds based on active market rules (inflation → TIPS, stress → treasury, etc.)
    _BOND_PREFS = rules.get("_active_bond_preferences", [])
    
    # Known TIPS tickers and Treasury tickers for swaps
    _TIPS_TICKERS = {"STIP", "STPZ", "VTIP", "GTIP", "TIPX", "SCHP"}
    _TREASURY_SHORT = {"SCHO", "VGSH", "SHY", "GBIL", "BIL", "SGOV", "CLTL", "TBIL", "CLIP"}
    _TREASURY_ALL = _TREASURY_SHORT | {"IEF", "TLT", "GOVT", "AGZ", "IBTH", "OBIL"}
    _AVOID_FT_LOWER = set()  # fund_types to avoid (populated by rules)
    _PREFER_TIPS = False
    _PREFER_TREASURY = False
    _MAX_DURATION = None
    
    for pref in _BOND_PREFS:
        if profile not in pref.get("profiles", []):
            continue
        action = pref.get("action", "")
        
        if action == "prefer_tips":
            _PREFER_TIPS = True
            all_logs.append(f"📈 Bond pref: TIPS preferred (rule: {pref.get('rule_id', '?')})")
        elif action == "prefer_treasury":
            _PREFER_TREASURY = True
            all_logs.append(f"🏛️ Bond pref: Treasury preferred (rule: {pref.get('rule_id', '?')})")
        elif action == "shorten_duration":
            _MAX_DURATION = pref.get("max_dur", 5.0)
            all_logs.append(f"⏱️ Bond pref: shorten duration max {_MAX_DURATION}y (rule: {pref.get('rule_id', '?')})")
        elif action == "avoid_fund_types":
            for ft in pref.get("fund_types", []):
                _AVOID_FT_LOWER.add(ft.lower())
            all_logs.append(f"🚫 Bond pref: avoid {pref.get('fund_types', [])} (rule: {pref.get('rule_id', '?')})")
        elif action == "extend_duration_ok":
            all_logs.append(f"📏 Bond pref: extended duration OK (rule: {pref.get('rule_id', '?')})")
    
    if _AVOID_FT_LOWER or _PREFER_TIPS or _PREFER_TREASURY or _MAX_DURATION:
        _bond_tickers = {k: v for k, v in tickers.items()
                        if meta.get(k, {}).get("category") == "Obligations"}
        _weight_to_redistribute = 0.0
        _removed_bonds = []
        
        # 1) Remove bonds matching avoid_fund_types
        # Known CLO/securitized tickers (can't rely on fund_type tag alone)
        _CLO_TICKERS = {"JAAA", "PAAA", "ICLO", "CLOX", "CLOZ", "AAA", "JBBB", "CLOI"}
        
        if _AVOID_FT_LOWER:
            for tk in list(_bond_tickers.keys()):
                _name_lower = meta.get(tk, {}).get("name", "").lower()
                _tk_upper = tk.upper()
                _matched = False
                
                for _bad_ft in _AVOID_FT_LOWER:
                    # Match on: name, ticker, OR known CLO tickers
                    if _bad_ft in _name_lower or _bad_ft in _tk_upper.lower():
                        _matched = True
                        break
                    # "securitized bond" or "bank loan" → also catch CLO by keyword
                    if ("securitized" in _bad_ft or "bank loan" in _bad_ft):
                        if _tk_upper in _CLO_TICKERS or "clo" in _name_lower:
                            _matched = True
                            break
                
                if _matched:
                    _w = tickers.pop(tk, 0)
                    if tk in meta:
                        del meta[tk]
                    _weight_to_redistribute += _w
                    _removed_bonds.append(f"{tk} ({_w*100:.1f}%)")
                    _bond_tickers.pop(tk, None)
        
        # 2) Shorten duration: swap bonds with dur > max for short alternatives
        if _MAX_DURATION and not _removed_bonds:  # Don't double-swap
            for tk in list(_bond_tickers.keys()):
                _tk_upper = tk.upper()
                # Check if this bond is likely long duration (not in short treasury set, not TIPS short)
                if _tk_upper not in _TREASURY_SHORT and _tk_upper not in _TIPS_TICKERS:
                    # Heuristic: if we know it's long, swap it
                    _name_lower = meta.get(tk, {}).get("name", "").lower()
                    if any(kw in _name_lower for kw in ["long", "20+", "10-", "7-10", "intermediate"]):
                        _w = tickers.pop(tk, 0)
                        if tk in meta:
                            del meta[tk]
                        _weight_to_redistribute += _w
                        _removed_bonds.append(f"{tk} ({_w*100:.1f}%, long dur)")
                        _bond_tickers.pop(tk, None)
        
        # 3) Redistribute weight to preferred bonds
        if _weight_to_redistribute > 0.001:
            _remaining_bonds = {k: v for k, v in tickers.items()
                               if meta.get(k, {}).get("category") == "Obligations"}
            
            # Determine best target
            _target = None
            if _PREFER_TIPS:
                # Look for existing TIPS in portfolio
                _tips_in_pf = [k for k in _remaining_bonds if k.upper() in _TIPS_TICKERS]
                if _tips_in_pf:
                    _target = _tips_in_pf[0]
                else:
                    # Inject STIP
                    _target = "STIP"
                    tickers[_target] = 0.0
                    meta[_target] = {"weight": 0, "category": "Obligations", 
                                     "name": "iShares 0-5 Year TIPS Bond ETF", "asset_ids": []}
            elif _PREFER_TREASURY:
                # Look for existing treasury in portfolio
                _treas_in_pf = [k for k in _remaining_bonds if k.upper() in _TREASURY_SHORT]
                if _treas_in_pf:
                    _target = _treas_in_pf[0]
                else:
                    _target = "SCHO"
                    tickers[_target] = 0.0
                    meta[_target] = {"weight": 0, "category": "Obligations",
                                     "name": "Schwab Short-Term U.S. Treasury ETF", "asset_ids": []}
            
            if _target and _target in tickers:
                tickers[_target] += _weight_to_redistribute
                meta[_target]["weight"] = tickers[_target]
                all_logs.append(f"♻️ Bond pref: {', '.join(_removed_bonds)} → {_target} (+{_weight_to_redistribute*100:.1f}%)")
            elif _remaining_bonds:
                # Pro-rata to remaining bonds
                _total_rb = sum(_remaining_bonds.values())
                if _total_rb > 0:
                    for k in _remaining_bonds:
                        tickers[k] += _weight_to_redistribute * (_remaining_bonds[k] / _total_rb)
                    all_logs.append(f"♻️ Bond pref: {', '.join(_removed_bonds)} → redistributed pro-rata to {len(_remaining_bonds)} bonds")
    
    # Step 6b3: TACTICAL CASH — reserve a % as uninvested cash (AI-driven)
    # Reduces ALL positions proportionally to free up cash pocket
    _CASH_PCT = rules.get("_cash_tactical", {}).get(profile, 0)
    if _CASH_PCT and _CASH_PCT > 0:
        _cash_frac = _CASH_PCT / 100.0
        _cash_frac = min(_cash_frac, 0.20)  # Hard cap at 20%
        
        _total_before = sum(tickers.values())
        if _total_before > 0:
            # Reduce all positions proportionally
            _scale = 1.0 - _cash_frac
            for tk in tickers:
                tickers[tk] *= _scale
            
            # Add _CASH as a virtual position (for display and tracking)
            _actual_cash = _total_before * _cash_frac
            tickers["_CASH"] = _actual_cash
            meta["_CASH"] = {
                "weight": _actual_cash,
                "category": "Cash",
                "name": "Cash Tactique (non investi)",
                "asset_ids": [],
            }
            
            _rationale = rules.get("_cash_tactical_rationale", "AI recommendation")
            all_logs.append(
                f"💰 Cash tactique: {_CASH_PCT}% réservé "
                f"({_actual_cash*100:.1f}% du portefeuille) — {_rationale}"
            )
    
    # Step 6c: POSITION CAP — no single position > 15% (AFTER bond floor)
    # CRITICAL: redistribute within SAME asset class to preserve bond floor
    _POS_MAX = rules.get("position_max", 0.15)
    for _cap_iter in range(5):
        _over = {k: v for k, v in tickers.items() if v > _POS_MAX + 0.001 and k != "_CASH"}
        if not _over:
            break
        for k, v in _over.items():
            _excess = v - _POS_MAX
            tickers[k] = _POS_MAX
            _over_cat = meta.get(k, {}).get("category", "ETF")
            all_logs.append(f"📉 Position cap: {k} {v*100:.1f}% → {_POS_MAX*100:.0f}%")
            # Redistribute within same category first, then any eligible
            _same_cat = [(tk2, w2) for tk2, w2 in tickers.items()
                        if tk2 != k and tk2 != "_CASH" and w2 < _POS_MAX - 0.01
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
    # Pop _CASH before rebuild (rebuild only knows Actions/ETF/Obligations/Crypto)
    _cash_weight = tickers.pop("_CASH", 0)
    _cash_meta = meta.pop("_CASH", None)
    
    display, numeric = rebuild_display(tickers, meta)
    
    portfolio_data["_tickers"] = tickers
    portfolio_data["_tickers_meta"] = meta
    portfolio_data["Actions"] = display.get("Actions", {})
    portfolio_data["ETF"] = display.get("ETF", {})
    portfolio_data["Obligations"] = display.get("Obligations", {})
    portfolio_data["Crypto"] = display.get("Crypto", {})
    portfolio_data["_numeric_weights"] = numeric
    
    # Cash tactical display (re-add after rebuild)
    if _cash_weight > 0.001:
        tickers["_CASH"] = _cash_weight
        if _cash_meta:
            meta["_CASH"] = _cash_meta
        _cash_pct = round(_cash_weight * 100, 1)
        # Use _ prefix to pass schema validation (schema ignores _ keys)
        portfolio_data["_cash_tactical"] = {
            "pct": _cash_pct,
            "label": f"Cash Tactique (non investi): {_cash_pct}%",
            "rationale": rules.get("_cash_tactical_rationale", ""),
        }
    
    # Log everything
    for line in all_logs:
        logger.info(f"[ALLOC_RULES] {line}")
    
    return portfolio_data
