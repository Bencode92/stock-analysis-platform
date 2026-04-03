# portfolio_engine/market_sector_radar.py
"""
Market/Sector Radar v1.6.1 (Expert Fixes: Dead Zone + Sweet Max + Circuit Breaker)
==================================================================================

v1.6.1 — Expert-validated corrections (3 fixes prioritaires)
- P0: Dead zone [-1%, +1%] → neutral (micro-négatifs = bruit, pas signal)
       Exception: M3 < -5% confirme vraie tendance → maintien avoided
- P1: Sweet spot max dynamique par régime (risk-on:35, neutral:40, risk-off:45)
       Energy à 36.08% capté directement au lieu de fallback
- P3: Circuit breaker daily ±5% → tilt ×0.5 (protection stress intraday)
- Dispersion sectorielle dans les stats (warning si std > 15%)

v1.6 — Beta sectoriel dans le scoring (Expert-validated Option 2+)
- Flags beta: high_beta (US only), defensive (US+EU) avec buffer zones
- Tilts ajustés par régime: favored+HB ×0.50-1.0, avoided+def ×0.80-1.0
- Floor neutral pour défensifs en risk-off (gate drawdown |YTD|/vol_3y < 0.8)
- sector_risk_profile dans le JSON de sortie

v1.5 — Preferred ETF + January Mode + Fallback + 3M/6M Gates
v1.4 — Gates 3M/6M, overheat_w52, m3_cooling_threshold
v1.3 — 52W Gate sign-based
v1.2 — Anti-contamination smoothing
v1.1 — sweet_daily_min, smoothing, overheat=neutral
"""

from __future__ import annotations

import json
import logging
import math
import statistics
from dataclasses import dataclass, asdict, field
from datetime import datetime, date
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("portfolio_engine.market_sector_radar")


# -------------------- v1.5: Preferred ETFs --------------------

PREFERRED_US: Dict[str, List[str]] = {
    "energy": ["XLE"],
    "materials": ["XLB"],
    "industrials": ["XLI"],
    "consumer-discretionary": ["XLY"],
    "consumer-staples": ["XLP"],
    "healthcare": ["XLV", "IYH"],
    "financials": ["XLF", "IYG"],
    "information-technology": ["XLK", "IYW"],
    "communication-services": ["XLC"],
    "utilities": ["XLU"],
    "real-estate": ["XLRE"],
}

PREFERRED_EU: Dict[str, List[str]] = {
    "energy": ["SXEP", "EXH1"],
    "materials": ["SXPP"],
    "industrials": ["SXNP"],
    "consumer-discretionary": ["SXRP"],
    "consumer-staples": ["SXFP"],
    "healthcare": ["SXDP"],
    "financials": ["SX7P"],
    "information-technology": ["SX8P"],
    "communication-services": ["SXKP"],
    "utilities": ["SX6P"],
    "real-estate": ["SX86P"],
}

CORE_METRICS = ["ytd_num", "m3_num", "m6_num", "w52_num", "change_num"]


# -------------------- v1.6: Beta Config (Option 2+ Expert-validated) --------------------

# Asymmetric US/EU: high-beta flag US only, defensive both
BETA_CONFIG = {
    "US": {
        "high_beta_upper": 1.4,    # β ≥ 1.4 → full high-beta factor
        "high_beta_lower": 1.2,    # β ≤ 1.2 → no adjustment (buffer zone)
        "defensive_upper": 0.7,    # β ≥ 0.7 → no adjustment
        "defensive_lower": 0.5,    # β ≤ 0.5 → full defensive factor
    },
    "Europe": {
        "high_beta_upper": None,   # NO high-beta flag for EU (dispersion too low)
        "high_beta_lower": None,
        "defensive_upper": 0.55,
        "defensive_lower": 0.35,
    },
}

# Tilt multipliers by classification × regime
BETA_TILT_MULTIPLIERS = {
    "favored_high_beta": {
        "risk-on": 1.0,       # let momentum carry
        "neutral": 0.75,      # moderate reduction
        "risk-off": 0.50,     # strong reduction
    },
    "avoided_defensive": {
        "risk-on": 1.0,       # full penalty (rotation justifies it)
        "neutral": 0.80,      # reduced penalty
        "risk-off": 0.80,     # reduced penalty (want defensives in stress)
    },
}

# Floor neutral for defensives in risk-off
DEFENSIVE_FLOOR_BETA_MAX = 0.5
DEFENSIVE_FLOOR_DD_RATIO_MAX = 0.8  # |YTD| / vol_3y


# -------------------- Rules --------------------

@dataclass(frozen=True)
class RadarRules:
    sweet_ytd_min: float = 10.0
    sweet_ytd_max: float = 35.0
    sweet_daily_min: float = -0.5
    overheat_ytd_min: float = 50.0
    underperform_ytd_max: float = 0.0
    confirm_favored_requires_w52_positive: bool = True
    confirm_avoided_requires_w52_negative: bool = True
    ytd_mild_negative_floor: float = -5.0
    divergence_threshold: float = 20.0
    overheat_w52_min: float = 60.0
    m6_confirm_favored_min: float = 0.0
    m3_cooling_threshold: float = -2.0
    january_mode_ramp_days: int = 90
    january_mode_ytd_floor: float = 2.0
    fallback_top_n: int = 3
    january_mode_enabled: bool = True
    max_favored_sectors: int = 5
    max_avoided_sectors: int = 3
    max_favored_regions: int = 4
    max_avoided_regions: int = 3
    risk_on_threshold: float = 0.60
    risk_off_threshold: float = 0.60
    tilt_favored: float = 0.15
    tilt_avoided: float = -0.25
    tilt_max: float = 0.30
    smoothing_alpha: float = 0.3
    # v1.6.1: Expert fixes
    dead_zone_width: float = 1.0         # P0: YTD in [-1%, +1%] → neutral
    dead_zone_m3_override: float = -5.0  # P0: unless M3 confirms downtrend
    circuit_breaker_daily: float = 5.0   # P3: |daily| > 5% → tilt ×0.5


# v1.6.1: Sweet spot max dynamic by regime (P1)
SWEET_MAX_BY_REGIME = {
    "risk-on": 35.0,   # standard — marché porteur, sélectivité forte
    "neutral": 40.0,   # élargi — capte Energy à 36% directement
    "risk-off": 45.0,  # très élargi — on cherche du positif, rare
}


# -------------------- Normalization --------------------

SECTOR_ALIASES: Dict[str, str] = {
    "consumer-cyclical": "consumer-discretionary",
    "consumer-discretionary": "consumer-discretionary",
    "consumer discretionary": "consumer-discretionary",
    "consumer cyclical": "consumer-discretionary",
    "consumer-defensive": "consumer-staples",
    "consumer-staples": "consumer-staples",
    "consumer staples": "consumer-staples",
    "consumer defensive": "consumer-staples",
    "technology": "information-technology",
    "information-technology": "information-technology",
    "information technology": "information-technology",
    "tech": "information-technology",
    "health-care": "healthcare",
    "healthcare": "healthcare",
    "health care": "healthcare",
    "santé": "healthcare",
    "telecommunications": "communication-services",
    "communication-services": "communication-services",
    "communication services": "communication-services",
    "services de communication": "communication-services",
    "basic-materials": "materials",
    "materials": "materials",
    "basic materials": "materials",
    "matériaux": "materials",
    "real-estate": "real-estate",
    "real estate": "real-estate",
    "immobilier": "real-estate",
    "financial-services": "financials",
    "financials": "financials",
    "financial services": "financials",
    "services financiers": "financials",
    "finance": "financials",
    "industrials": "industrials",
    "industrial": "industrials",
    "industrie": "industrials",
    "utilities": "utilities",
    "services aux collectivités": "utilities",
    "energy": "energy",
    "énergie": "energy",
    "technologie de l'information": "information-technology",
    "consommation discrétionnaire": "consumer-discretionary",
    "consommation de base": "consumer-staples",
    "biens de consommation cycliques": "consumer-discretionary",
    "biens de consommation défensifs": "consumer-staples",
}

REGION_ALIASES: Dict[str, str] = {
    "us": "united-states", "usa": "united-states", "united states": "united-states",
    "etats-unis": "united-states", "états-unis": "united-states",
    "uk": "united-kingdom", "united kingdom": "united-kingdom",
    "royaume-uni": "united-kingdom", "royaume uni": "united-kingdom",
    "germany": "germany", "allemagne": "germany",
    "france": "france",
    "netherlands": "netherlands", "pays-bas": "netherlands",
    "spain": "spain", "espagne": "spain",
    "italy": "italy", "italie": "italy",
    "switzerland": "switzerland", "suisse": "switzerland",
    "belgium": "belgium", "belgique": "belgium",
    "sweden": "sweden", "suède": "sweden",
    "denmark": "denmark", "danemark": "denmark",
    "norway": "norway", "norvège": "norway",
    "finland": "finland", "finlande": "finland",
    "ireland": "ireland", "irlande": "ireland",
    "austria": "austria", "autriche": "austria",
    "portugal": "portugal",
    "china": "china", "chine": "china",
    "japan": "japan", "japon": "japan",
    "south korea": "south-korea", "korea": "south-korea", "corée du sud": "south-korea",
    "taiwan": "taiwan", "taïwan": "taiwan",
    "hong kong": "hong-kong",
    "singapore": "singapore", "singapour": "singapore",
    "india": "india", "inde": "india",
    "indonesia": "indonesia", "indonésie": "indonesia",
    "thailand": "thailand", "thaïlande": "thailand",
    "malaysia": "malaysia", "malaisie": "malaysia",
    "vietnam": "vietnam", "viêt nam": "vietnam",
    "philippines": "philippines",
    "israel": "israel", "israël": "israel",
    "saudi arabia": "saudi-arabia", "arabie saoudite": "saudi-arabia",
    "uae": "uae", "emirates": "uae", "émirats arabes unis": "uae",
    "turkey": "turkey", "turquie": "turkey",
    "canada": "canada",
    "brazil": "brazil", "brésil": "brazil",
    "mexico": "mexico", "mexique": "mexico",
    "argentina": "argentina", "argentine": "argentina",
    "chile": "chile", "chili": "chile",
    "australia": "australia", "australie": "australia",
    "new zealand": "new-zealand", "nouvelle-zélande": "new-zealand",
    "south africa": "south-africa", "afrique du sud": "south-africa",
}


def normalize_sector(x: Optional[str]) -> str:
    if not x:
        return ""
    k = x.strip().lower().replace("_", "-")
    return SECTOR_ALIASES.get(k, k)


def normalize_region(x: Optional[str]) -> str:
    if not x:
        return ""
    k = x.strip().lower()
    return REGION_ALIASES.get(k, k)


# -------------------- Helpers --------------------

def _safe_num(v: Any, default: float = 0.0) -> float:
    try:
        if v is None:
            return default
        if isinstance(v, str):
            v = v.strip().replace(",", ".").replace("%", "")
            if not v or v.lower() in ("n/a", "nan", "-"):
                return default
        return float(v)
    except Exception:
        return default


def _safe_num_opt(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        if isinstance(v, str):
            v = v.strip().replace(",", ".").replace("%", "")
            if not v or v.lower() in ("n/a", "nan", "-", "—", ""):
                return None
        result = float(v)
        if result != result:
            return None
        return result
    except Exception:
        return None


def _is_number(x: Any) -> bool:
    return isinstance(x, (int, float)) and not (isinstance(x, float) and math.isnan(x))


# -------------------- v1.6: Beta Helpers --------------------

def _get_beta_region(entry_data: Dict[str, Any]) -> str:
    """Infer region from ETF entry data for beta config selection."""
    region = entry_data.get("raw", {}).get("region", "")
    if not region:
        # Fallback: check symbol in PREFERRED tables
        sym = entry_data.get("symbol", "")
        for s_key, syms in PREFERRED_EU.items():
            if sym in syms:
                return "Europe"
        return "US"
    return "Europe" if region.lower() in ("europe", "eu") else "US"


def _compute_beta_tilt_factor(
    beta: Optional[float],
    vol_3y: Optional[float],
    region: str,
    classification: str,
    regime: str,
    ytd: float,
) -> Tuple[float, Optional[str]]:
    """
    Compute tilt multiplier based on beta (Option 2+ with buffer zones).
    
    v1.6: Expert-validated asymmetric logic:
    - High-beta: US only, buffer 1.2-1.4, regime-conditional
    - Defensive: US+EU, region-specific thresholds, regime-conditional
    
    Returns (factor, flag_string_or_None)
    """
    if beta is None or not _is_number(beta):
        return 1.0, None
    
    cfg = BETA_CONFIG.get(region, BETA_CONFIG["US"])
    
    # === FAVORED + HIGH-BETA (US only) ===
    if classification == "favored" and cfg.get("high_beta_upper") is not None:
        hb_low = cfg["high_beta_lower"]
        hb_high = cfg["high_beta_upper"]
        if beta > hb_low:
            regime_mult = BETA_TILT_MULTIPLIERS["favored_high_beta"].get(regime, 0.75)
            # Linear ramp: β=1.2 → 1.0, β=1.4 → regime_mult
            if beta >= hb_high:
                factor = regime_mult
            else:
                t = (beta - hb_low) / (hb_high - hb_low)
                factor = 1.0 - t * (1.0 - regime_mult)
            if factor < 0.999:
                return round(factor, 3), f"high_beta_adj({regime}:{factor:.2f})"
    
    # === AVOIDED + DEFENSIVE (US + EU) ===
    if classification == "avoided" and cfg.get("defensive_upper") is not None:
        def_low = cfg["defensive_lower"]
        def_high = cfg["defensive_upper"]
        if beta < def_high:
            regime_mult = BETA_TILT_MULTIPLIERS["avoided_defensive"].get(regime, 0.80)
            # Linear ramp: β=defensive_lower → regime_mult, β=defensive_upper → 1.0
            if beta <= def_low:
                factor = regime_mult
            else:
                t = (beta - def_low) / (def_high - def_low)
                factor = regime_mult + t * (1.0 - regime_mult)
            if factor < 0.999:
                return round(factor, 3), f"defensive_adj({regime}:{factor:.2f})"
    
    return 1.0, None


def _should_floor_neutral_defensive(
    beta: Optional[float],
    vol_3y: Optional[float],
    ytd: float,
    regime: str,
) -> bool:
    """
    Check if a defensive sector should be floored to neutral in risk-off.
    
    v1.6: Only if β < 0.5 AND |YTD|/vol_3y < 0.8 AND regime == risk-off
    """
    if regime != "risk-off":
        return False
    if beta is None or not _is_number(beta) or beta >= DEFENSIVE_FLOOR_BETA_MAX:
        return False
    if vol_3y is not None and _is_number(vol_3y) and vol_3y > 0:
        dd_ratio = abs(ytd) / vol_3y
        if dd_ratio >= DEFENSIVE_FLOOR_DD_RATIO_MAX:
            return False
    return True


# -------------------- v1.5: ETF Selection Logic --------------------

def _entry_usable(e: Dict[str, Any]) -> bool:
    if not isinstance(e, dict):
        return False
    available = sum(1 for k in CORE_METRICS if _is_number(e.get(k)))
    has_price = _is_number(e.get("value_num"))
    ytd = e.get("ytd_num")
    change = e.get("change_num")
    is_zero_zero = (ytd == 0 or ytd == 0.0) and (change == 0 or change == 0.0)
    return available >= 2 and has_price and not is_zero_zero


def _quality_score(e: Dict[str, Any]) -> float:
    s = 0.0
    s += sum(1.0 for k in CORE_METRICS if _is_number(e.get(k)))
    fam = (e.get("indexFamily") or "").lower()
    if "s&p 500" in fam or "stoxx europe 600" in fam:
        s += 2.0
    elif "dow jones" in fam or "msci" in fam:
        s += 1.5
    elif "s&p us" in fam:
        s += 1.0
    elif "nasdaq us" in fam:
        s += 0.5
    return s


def _median_ignore_none(values: List[Optional[float]]) -> Optional[float]:
    vals = [v for v in values if _is_number(v)]
    if not vals:
        return None
    return statistics.median(vals)


def _distance_to_profile(e: Dict[str, Any], profile: Dict[str, Optional[float]]) -> float:
    d2 = 0.0
    n = 0
    for k, target in profile.items():
        v = e.get(k)
        if _is_number(v) and _is_number(target):
            d2 += (float(v) - float(target)) ** 2
            n += 1
    if n == 0:
        return float("inf")
    return math.sqrt(d2 / n)


def pick_representative_sector_entry(
    sector_key: str,
    entries: List[Dict[str, Any]],
    region: str = "US",
) -> Tuple[Optional[Dict[str, Any]], str]:
    if region == "US":
        candidates = [e for e in entries if isinstance(e, dict) and e.get("region") == "US"]
        preferred_table = PREFERRED_US
    elif region in ("EU", "Europe"):
        candidates = [e for e in entries if isinstance(e, dict) and e.get("region") == "Europe"]
        preferred_table = PREFERRED_EU
    else:
        candidates = [e for e in entries if isinstance(e, dict)]
        preferred_table = PREFERRED_US
    if not candidates:
        candidates = [e for e in entries if isinstance(e, dict)]
    usable = [e for e in candidates if _entry_usable(e)]
    if not usable:
        if candidates:
            return candidates[0], "fallback"
        return None, "none"
    preferred_symbols = preferred_table.get(sector_key, [])
    for sym in preferred_symbols:
        for e in usable:
            if e.get("symbol") == sym:
                return e, "preferred"
    profile = {k: _median_ignore_none([c.get(k) for c in usable]) for k in CORE_METRICS}
    scored = sorted(usable, key=lambda e: (_distance_to_profile(e, profile), -_quality_score(e)))
    return scored[0], "medoid"


# -------------------- v1.5: January Mode --------------------

def effective_momentum(today: date, ytd: float, m6: Optional[float], rules: RadarRules) -> float:
    if not rules.january_mode_enabled or m6 is None:
        return ytd
    doy = today.timetuple().tm_yday
    w = min(1.0, doy / float(rules.january_mode_ramp_days))
    return (1.0 - w) * m6 + w * ytd


def sweet_ytd_min_dynamic(today: date, rules: RadarRules) -> float:
    if not rules.january_mode_enabled:
        return rules.sweet_ytd_min
    doy = today.timetuple().tm_yday
    ramp = min(1.0, doy / float(rules.january_mode_ramp_days))
    return max(rules.january_mode_ytd_floor, rules.sweet_ytd_min * ramp)


# -------------------- Loaders --------------------

def load_sectors(data_dir: str) -> Dict[str, Dict[str, Any]]:
    path = Path(data_dir) / "sectors.json"
    if not path.exists():
        logger.warning(f"sectors.json introuvable: {path}")
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.error(f"Erreur lecture sectors.json: {e}")
        return {}
    sectors_block = data.get("sectors", data)
    out: Dict[str, Dict[str, Any]] = {}
    selection_stats = {"preferred": 0, "medoid": 0, "fallback": 0, "none": 0}

    if isinstance(sectors_block, dict):
        for sector_name, entries in sectors_block.items():
            if not entries:
                continue
            key = normalize_sector(sector_name)
            if isinstance(entries, list) and entries:
                entry, method = pick_representative_sector_entry(key, entries, region="US")
                selection_stats[method] = selection_stats.get(method, 0) + 1
            elif isinstance(entries, dict):
                entry = entries
                method = "single"
            else:
                entry = None
                method = "none"
            if entry and isinstance(entry, dict):
                ytd = _safe_num(entry.get("ytd_num") or entry.get("_ytd_value") or entry.get("ytd"), 0.0)
                daily = _safe_num(entry.get("change_num") or entry.get("_change_value") or entry.get("change") or entry.get("daily"), 0.0)
                w52 = _safe_num_opt(entry.get("w52_num") or entry.get("w52") or entry.get("w52Change"))
                m3 = _safe_num_opt(entry.get("m3_num") or entry.get("m3") or entry.get("m3Change"))
                m6 = _safe_num_opt(entry.get("m6_num") or entry.get("m6") or entry.get("m6Change"))
                # v1.6: Load beta and vol_3y
                beta = _safe_num_opt(entry.get("beta") or entry.get("beta_3y"))
                vol_3y = _safe_num_opt(entry.get("vol_3y") or entry.get("volatility_3y"))
                beta_source = entry.get("beta_source")
                
                out[key] = {
                    "ytd": ytd, "daily": daily, "w52": w52, "m3": m3, "m6": m6,
                    "beta": beta, "vol_3y": vol_3y, "beta_source": beta_source,  # v1.6
                    "raw": entry,
                    "selection_method": method,
                    "symbol": entry.get("symbol", "N/A"),
                }

    logger.info(f"✅ Chargé {len(out)} secteurs depuis {path}")
    logger.info(f"   └─ Sélection: preferred={selection_stats['preferred']}, medoid={selection_stats['medoid']}, fallback={selection_stats['fallback']}")
    w52_count = sum(1 for d in out.values() if d.get("w52") is not None)
    m3_count = sum(1 for d in out.values() if d.get("m3") is not None)
    m6_count = sum(1 for d in out.values() if d.get("m6") is not None)
    beta_count = sum(1 for d in out.values() if d.get("beta") is not None)
    logger.info(f"   └─ Couverture: w52={w52_count}/{len(out)}, m3={m3_count}/{len(out)}, m6={m6_count}/{len(out)}, beta={beta_count}/{len(out)}")
    return out


def load_markets(data_dir: str) -> Dict[str, Dict[str, Any]]:
    path = Path(data_dir) / "markets.json"
    if not path.exists():
        logger.warning(f"markets.json introuvable: {path}")
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.error(f"Erreur lecture markets.json: {e}")
        return {}
    indices = data.get("indices", data)
    out: Dict[str, Dict[str, Any]] = {}
    if isinstance(indices, dict):
        for region_name, entries in indices.items():
            if not isinstance(entries, list):
                continue
            for e in entries:
                if not isinstance(e, dict):
                    continue
                country = e.get("country") or e.get("name")
                if not country:
                    continue
                key = normalize_region(country)
                if key in out:
                    continue
                ytd = _safe_num(e.get("ytd_num") or e.get("_ytd_value") or e.get("ytd"), 0.0)
                daily = _safe_num(e.get("change_num") or e.get("_change_value") or e.get("change") or e.get("daily"), 0.0)
                w52 = _safe_num_opt(e.get("w52_num") or e.get("w52") or e.get("w52Change"))
                m3 = _safe_num_opt(e.get("m3_num") or e.get("m3") or e.get("m3Change"))
                m6 = _safe_num_opt(e.get("m6_num") or e.get("m6") or e.get("m6Change"))
                out[key] = {"ytd": ytd, "daily": daily, "w52": w52, "m3": m3, "m6": m6, "raw": e}
    logger.info(f"✅ Chargé {len(out)} marchés/pays depuis {path}")
    return out


# -------------------- Classification --------------------

def classify_v3(
    ytd: float, daily: float, w52: Optional[float],
    m3: Optional[float], m6: Optional[float],
    rules: RadarRules, effective_ytd_min: float = 10.0,
    effective_ytd_max: float = 35.0,  # v1.6.1: P1 dynamic sweet max
) -> Tuple[str, str]:
    # v1.6.1 P0: Dead zone — micro-negatives are noise, not signal
    if -rules.dead_zone_width <= ytd <= rules.dead_zone_width:
        if m3 is not None and m3 < rules.dead_zone_m3_override:
            # M3 confirms real downtrend → proceed to normal classification
            pass
        else:
            return "neutral", "dead_zone"

    if ytd < rules.underperform_ytd_max:
        cls, reason = "avoided", "underperform"
    elif ytd >= rules.overheat_ytd_min:
        cls, reason = "neutral", "overheat"
    elif (effective_ytd_min <= ytd <= effective_ytd_max and daily >= rules.sweet_daily_min):
        cls, reason = "favored", "sweet_spot"
    else:
        cls, reason = "neutral", "out_of_range"
    
    flags: List[str] = []
    is_overheat = w52 is not None and w52 >= rules.overheat_w52_min
    if is_overheat:
        flags.append("overheat_w52")
    is_cooling = m3 is not None and m3 <= rules.m3_cooling_threshold
    if is_cooling:
        flags.append("cooling_m3")
    is_m6_weak = m6 is not None and m6 <= rules.m6_confirm_favored_min
    
    if w52 is None:
        flags.append("w52_missing")
    else:
        if abs(ytd - w52) > rules.divergence_threshold:
            flags.append("divergent")
    
    if cls == "favored":
        if w52 is not None and rules.confirm_favored_requires_w52_positive:
            if w52 < 0:
                flag_str = "|".join(flags) if flags else ""
                return "neutral", reason + "|favored_blocked_w52_negative" + (f"|{flag_str}" if flag_str else "")
            else:
                flags.append("w52_confirmed")
        if m6 is not None and is_m6_weak:
            flags.append("m6_weak")
            flag_str = "|".join(flags) if flags else ""
            return "neutral", reason + "|favored_blocked_m6_nonpositive" + (f"|{flag_str}" if flag_str else "")
        elif m6 is not None and m6 > rules.m6_confirm_favored_min:
            flags.append("m6_confirmed")
        if is_overheat and is_cooling:
            flag_str = "|".join(flags) if flags else ""
            return "neutral", reason + "|favored_blocked_overheat_cooling" + (f"|{flag_str}" if flag_str else "")
        elif is_overheat and not is_cooling:
            flags.append("overheat_warning")
    
    if cls == "avoided" and rules.confirm_avoided_requires_w52_negative:
        if w52 is not None:
            if w52 < 0:
                flags.append("underperform_confirmed")
            else:
                if ytd >= rules.ytd_mild_negative_floor:
                    flag_str = "|".join(flags) if flags else ""
                    return "neutral", reason + "|avoided_rescued_w52_positive" + (f"|{flag_str}" if flag_str else "")
                else:
                    flags.append("deep_negative_kept")
    
    flag_str = "|".join(flags) if flags else ""
    return cls, reason + (f"|{flag_str}" if flag_str else "")


def pick_lists(
    items: Dict[str, Dict[str, Any]],
    rules: RadarRules,
    max_favored: int,
    max_avoided: int,
    today: Optional[date] = None,
    regime: str = "neutral",  # v1.6: needed for beta floor logic
) -> Tuple[List[str], List[str], List[Dict[str, Any]]]:
    today = today or date.today()
    effective_ytd_min = sweet_ytd_min_dynamic(today, rules)
    # v1.6.1 P1: Sweet spot max dynamic by regime
    effective_ytd_max = SWEET_MAX_BY_REGIME.get(regime, rules.sweet_ytd_max)
    
    favored: List[Tuple[str, float, float, Optional[float], Optional[float], Optional[float], str, float]] = []
    avoided: List[Tuple[str, float, float, Optional[float], Optional[float], Optional[float], str]] = []
    neutral: List[Tuple[str, float, float, Optional[float], Optional[float], Optional[float], str, float]] = []
    diag: List[Dict[str, Any]] = []

    for key, data in items.items():
        ytd = _safe_num(data.get("ytd", 0.0), 0.0)
        daily = _safe_num(data.get("daily", 0.0), 0.0)
        w52 = data.get("w52")
        m3 = data.get("m3")
        m6 = data.get("m6")
        beta = data.get("beta")       # v1.6
        vol_3y = data.get("vol_3y")   # v1.6
        
        eff_mom = effective_momentum(today, ytd, m6, rules)
        classification, reason = classify_v3(ytd, daily, w52, m3, m6, rules, effective_ytd_min, effective_ytd_max)
        
        # v1.6: Beta flags (informational, added to reason string)
        beta_flag = None
        beta_region = _get_beta_region(data)
        if _is_number(beta):
            cfg = BETA_CONFIG.get(beta_region, BETA_CONFIG["US"])
            # High-beta flag (US only)
            if cfg.get("high_beta_upper") is not None and beta > cfg["high_beta_lower"]:
                beta_flag = "high_beta"
                reason += "|high_beta_warning"
            # Defensive flag (US + EU)
            elif cfg.get("defensive_upper") is not None and beta < cfg["defensive_upper"]:
                beta_flag = "defensive"
                reason += "|defensive_asset"
        
        # v1.6: Floor neutral for defensives in risk-off
        if classification == "avoided" and _should_floor_neutral_defensive(beta, vol_3y, ytd, regime):
            classification = "neutral"
            reason += "|floor_neutral_defensive_riskoff"
            beta_flag = (beta_flag or "") + "|floored"
        
        diag_entry = {
            "key": key,
            "ytd": round(ytd, 2),
            "daily": round(daily, 2),
            "w52": round(w52, 2) if w52 is not None else None,
            "m3": round(m3, 2) if m3 is not None else None,
            "m6": round(m6, 2) if m6 is not None else None,
            "beta": round(beta, 2) if _is_number(beta) else None,              # v1.6
            "vol_3y": round(vol_3y, 2) if _is_number(vol_3y) else None,        # v1.6
            "beta_flag": beta_flag,                                              # v1.6
            "beta_region": beta_region,                                          # v1.6
            "effective_momentum": round(eff_mom, 2),
            "classification": classification,
            "reason": reason,
            "symbol": data.get("symbol", "N/A"),
            "selection_method": data.get("selection_method", "N/A"),
        }
        diag.append(diag_entry)

        if classification == "favored":
            favored.append((key, ytd, daily, w52, m3, m6, reason, eff_mom))
        elif classification == "avoided":
            avoided.append((key, ytd, daily, w52, m3, m6, reason))
        else:
            neutral.append((key, ytd, daily, w52, m3, m6, reason, eff_mom))

    favored.sort(key=lambda x: x[7], reverse=True)
    avoided.sort(key=lambda x: x[1])

    favored_list = [x[0] for x in favored[:max_favored]]
    avoided_list = [x[0] for x in avoided[:max_avoided]]
    
    # v1.5: Fallback si favored vide
    if not favored_list and rules.fallback_top_n > 0:
        logger.warning(f"⚠️ Aucun secteur favored, activation fallback top {rules.fallback_top_n}")
        eligible_neutral = [
            n for n in neutral
            if (n[3] is None or n[3] < rules.overheat_w52_min)
            and (n[5] is None or n[5] > 0)
        ]
        eligible_neutral.sort(key=lambda x: x[7], reverse=True)
        fallback_list = [x[0] for x in eligible_neutral[:rules.fallback_top_n]]
        if fallback_list:
            logger.info(f"   └─ Fallback activé: {fallback_list}")
            favored_list = fallback_list
            for d in diag:
                if d["key"] in fallback_list:
                    d["classification"] = "favored"
                    d["reason"] += "|fallback_top_n"

    return favored_list, avoided_list, diag


def _load_macro_signals(data_dir: str = "data") -> Dict[str, Any]:
    """Load VIX + HY spread from macro_indicators.json for regime override."""
    import os
    path = os.path.join(data_dir, "macro_indicators.json")
    if not os.path.exists(path):
        return {}
    try:
        import json
        with open(path, "r") as f:
            mi = json.load(f)
        macro = mi.get("macro_environment", {})
        return {
            "vix": _safe_num(macro.get("vix", {}).get("value") if isinstance(macro.get("vix"), dict) else macro.get("vix"), None),
            "hy_spread_bps": _safe_num(macro.get("hy_spread", {}).get("value_bps") if isinstance(macro.get("hy_spread"), dict) else None, None),
            "yield_2s10s": _safe_num(macro.get("yield_curve_2s10s", {}).get("value_bps") if isinstance(macro.get("yield_curve_2s10s"), dict) else None, None),
        }
    except Exception:
        return {}


def compute_regime(sectors: Dict[str, Dict[str, Any]], rules: RadarRules, data_dir: str = "data") -> Tuple[str, float, str]:
    # ── Step 1: Sector-based regime (existing logic) ──
    if not sectors:
        sector_regime, sector_conf, sector_rationale = "neutral", 0.5, "no sector data available"
    else:
        total = len(sectors)
        pos = sum(1 for d in sectors.values() if _safe_num(d.get("ytd", 0.0), 0.0) > 0)
        neg = sum(1 for d in sectors.values() if _safe_num(d.get("ytd", 0.0), 0.0) < 0)
        pos_ratio = pos / total if total else 0.0
        neg_ratio = neg / total if total else 0.0
        if pos_ratio >= rules.risk_on_threshold:
            conf = min(0.95, 0.70 + 0.25 * pos_ratio)
            sector_regime, sector_conf, sector_rationale = "risk-on", round(conf, 2), f"{pos}/{total} secteurs positifs ({pos_ratio:.0%})"
        elif neg_ratio >= rules.risk_off_threshold:
            conf = min(0.95, 0.70 + 0.25 * neg_ratio)
            sector_regime, sector_conf, sector_rationale = "risk-off", round(conf, 2), f"{neg}/{total} secteurs négatifs ({neg_ratio:.0%})"
        else:
            sector_regime, sector_conf, sector_rationale = "neutral", 0.60, f"marché mixte: {pos} pos, {neg} neg / {total}"

    # ── Step 2: Macro override (VIX + HY spread) ── v7.3
    macro = _load_macro_signals(data_dir)
    vix = macro.get("vix")
    hy_spread = macro.get("hy_spread_bps")
    curve_2s10s = macro.get("yield_2s10s")

    macro_regime = "neutral"
    macro_signals = []

    if vix is not None:
        if vix > 35:
            macro_regime = "risk-off"
            macro_signals.append(f"VIX={vix:.0f} (crisis >35)")
        elif vix > 25:
            macro_signals.append(f"VIX={vix:.0f} (elevated)")
            if macro_regime != "risk-off":
                macro_regime = "caution"
        elif vix < 15:
            macro_signals.append(f"VIX={vix:.0f} (low vol)")
            if macro_regime == "neutral":
                macro_regime = "risk-on"

    if hy_spread is not None:
        if hy_spread > 500:
            macro_regime = "risk-off"
            macro_signals.append(f"HY spread={hy_spread:.0f}bps (crisis >500)")
        elif hy_spread > 350:
            macro_signals.append(f"HY spread={hy_spread:.0f}bps (stress)")
            if macro_regime not in ("risk-off",):
                macro_regime = "caution"

    if curve_2s10s is not None:
        if curve_2s10s < 0:
            macro_signals.append(f"2s10s={curve_2s10s:.0f}bps (inverted — recession signal)")
            if macro_regime not in ("risk-off",):
                macro_regime = "caution"

    # ── Step 3: Combine — macro overrides sector if more negative ──
    REGIME_SEVERITY = {"risk-on": 0, "neutral": 1, "caution": 2, "risk-off": 3}
    sector_sev = REGIME_SEVERITY.get(sector_regime, 1)
    macro_sev = REGIME_SEVERITY.get(macro_regime, 1)

    if macro_sev > sector_sev:
        # Macro override: more stress than sectors suggest
        final_regime = macro_regime
        final_conf = max(sector_conf, 0.70)
        final_rationale = f"{sector_rationale} | MACRO OVERRIDE: {', '.join(macro_signals)}"
        logger.info(f"[RADAR] Macro override: {sector_regime}→{macro_regime} ({', '.join(macro_signals)})")
    else:
        final_regime = sector_regime
        final_conf = sector_conf
        macro_note = f" | macro: {', '.join(macro_signals)}" if macro_signals else ""
        final_rationale = sector_rationale + macro_note

    return final_regime, final_conf, final_rationale


# -------------------- Smoothing --------------------

def _smooth_list(old: List[str], new: List[str], alpha: float, cap: int) -> List[str]:
    if alpha <= 0.0:
        return new[:cap]
    if alpha >= 1.0:
        return old[:cap]
    keep_old = int(round(alpha * cap))
    kept = old[:keep_old]
    for x in new:
        if x not in kept:
            kept.append(x)
        if len(kept) >= cap:
            break
    return kept[:cap]


def maybe_smooth_context(old_ctx: Optional[Dict[str, Any]], new_ctx: Dict[str, Any], rules: RadarRules) -> Dict[str, Any]:
    if not old_ctx or rules.smoothing_alpha <= 0.0:
        return new_ctx
    alpha = rules.smoothing_alpha
    old_tilts = old_ctx.get("macro_tilts", {})
    new_tilts = new_ctx.get("macro_tilts", {})
    smoothed = dict(new_ctx)
    smoothed["macro_tilts"] = dict(new_tilts)
    smoothed["macro_tilts"]["favored_sectors"] = _smooth_list(old_tilts.get("favored_sectors", []), new_tilts.get("favored_sectors", []), alpha, rules.max_favored_sectors)
    smoothed["macro_tilts"]["avoided_sectors"] = _smooth_list(old_tilts.get("avoided_sectors", []), new_tilts.get("avoided_sectors", []), alpha, rules.max_avoided_sectors)
    smoothed["macro_tilts"]["favored_regions"] = _smooth_list(old_tilts.get("favored_regions", []), new_tilts.get("favored_regions", []), alpha, rules.max_favored_regions)
    smoothed["macro_tilts"]["avoided_regions"] = _smooth_list(old_tilts.get("avoided_regions", []), new_tilts.get("avoided_regions", []), alpha, rules.max_avoided_regions)
    smoothed["_meta"] = dict(new_ctx.get("_meta", {}))
    smoothed["_meta"]["smoothing_applied"] = True
    smoothed["_meta"]["smoothing_alpha"] = alpha
    return smoothed


def _is_radar_context(ctx: Optional[Dict[str, Any]]) -> bool:
    if not ctx:
        return False
    model = ctx.get("_meta", {}).get("model", "")
    return str(model).startswith("radar_")


# -------------------- Public API --------------------

def generate_market_context_radar(
    data_dir: str = "data",
    rules: Optional[RadarRules] = None,
    save_to_file: bool = True,
    output_path: Optional[str] = None,
    previous_context_path: Optional[str] = None,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    rules = rules or RadarRules()
    today = today or date.today()

    sectors = load_sectors(data_dir)
    markets = load_markets(data_dir)

    if not sectors and not markets:
        logger.warning("⚠️ Aucune donnée marché disponible, contexte neutre")
        return _get_fallback_context(rules)

    regime, confidence, rationale = compute_regime(sectors, rules, data_dir)

    # v1.6: Pass regime to pick_lists for floor neutral logic
    favored_sectors, avoided_sectors, sector_diag = pick_lists(
        sectors, rules, rules.max_favored_sectors, rules.max_avoided_sectors, today, regime
    )
    favored_regions, avoided_regions, region_diag = pick_lists(
        markets, rules, rules.max_favored_regions, rules.max_avoided_regions, today, regime
    )

    effective_ytd_min = sweet_ytd_min_dynamic(today, rules)
    doy = today.timetuple().tm_yday

    # v1.6.1 P1: Sweet spot max dynamic by regime
    effective_ytd_max = SWEET_MAX_BY_REGIME.get(regime, rules.sweet_ytd_max)

    # v1.6.1: Dispersion sectorielle (signal complémentaire)
    sector_ytds = [_safe_num(d.get("ytd", 0), 0) for d in sectors.values()]
    if sector_ytds:
        mean_ytd = sum(sector_ytds) / len(sector_ytds)
        dispersion_std = (sum((y - mean_ytd) ** 2 for y in sector_ytds) / len(sector_ytds)) ** 0.5
    else:
        mean_ytd, dispersion_std = 0.0, 0.0
    
    momentum_stats = {
        "sectors_with_w52": sum(1 for d in sectors.values() if d.get("w52") is not None),
        "sectors_with_m3": sum(1 for d in sectors.values() if d.get("m3") is not None),
        "sectors_with_m6": sum(1 for d in sectors.values() if d.get("m6") is not None),
        "sectors_total": len(sectors),
        "markets_with_w52": sum(1 for d in markets.values() if d.get("w52") is not None),
        "markets_with_m3": sum(1 for d in markets.values() if d.get("m3") is not None),
        "markets_with_m6": sum(1 for d in markets.values() if d.get("m6") is not None),
        "markets_total": len(markets),
        "favored_blocked_by_w52": sum(1 for d in sector_diag if "favored_blocked_w52_negative" in d.get("reason", "")),
        "favored_blocked_by_m6": sum(1 for d in sector_diag if "favored_blocked_m6_nonpositive" in d.get("reason", "")),
        "favored_blocked_by_overheat_cooling": sum(1 for d in sector_diag if "favored_blocked_overheat_cooling" in d.get("reason", "")),
        "avoided_rescued_by_w52": sum(1 for d in sector_diag if "avoided_rescued_w52_positive" in d.get("reason", "")),
        "overheat_w52_count": sum(1 for d in sector_diag if "overheat_w52" in d.get("reason", "") or "overheat_warning" in d.get("reason", "")),
        "cooling_m3_count": sum(1 for d in sector_diag if "cooling_m3" in d.get("reason", "")),
        "fallback_activated": sum(1 for d in sector_diag if "fallback_top_n" in d.get("reason", "")),
        # v1.6: Beta stats
        "beta_high_beta_warnings": sum(1 for d in sector_diag if "high_beta_warning" in d.get("reason", "")),
        "beta_defensive_flags": sum(1 for d in sector_diag if "defensive_asset" in d.get("reason", "")),
        "beta_floor_neutral_count": sum(1 for d in sector_diag if "floor_neutral_defensive_riskoff" in d.get("reason", "")),
        # v1.6.1: Expert fix stats
        "dead_zone_activated": sum(1 for d in sector_diag if "dead_zone" in d.get("reason", "")),
        "circuit_breaker_threshold": rules.circuit_breaker_daily,
        "dispersion_std": round(dispersion_std, 2),
        "dispersion_stressed": dispersion_std > 15.0,
        "effective_ytd_max": effective_ytd_max,
    }
    
    selection_stats = {
        "preferred": sum(1 for d in sector_diag if d.get("selection_method") == "preferred"),
        "medoid": sum(1 for d in sector_diag if d.get("selection_method") == "medoid"),
        "fallback": sum(1 for d in sector_diag if d.get("selection_method") == "fallback"),
    }

    # v1.6: Build sector_risk_profile
    sector_risk_profile = {}
    for d in sector_diag:
        key = d.get("key")
        beta_val = d.get("beta")
        vol_val = d.get("vol_3y")
        if key and (beta_val is not None or vol_val is not None):
            profile = {}
            if beta_val is not None:
                profile["beta"] = beta_val
            if vol_val is not None:
                profile["vol_3y"] = vol_val
            if d.get("beta_flag"):
                profile["risk_flag"] = d["beta_flag"]
            if d.get("beta_region"):
                profile["region"] = d["beta_region"]
            profile["classification"] = d.get("classification", "neutral")
            profile["daily"] = d.get("daily", 0.0)  # v1.6.1 P3: for circuit breaker
            profile["reason"] = d.get("reason", "")  # v1.7: for frontend signal badges
            sector_risk_profile[key] = profile

    # v1.7: Build region_risk_profile (same structure as sector, for frontend badges)
    region_risk_profile = {}
    for d in region_diag:
        key = d.get("key")
        if not key:
            continue
        profile = {
            "classification": d.get("classification", "neutral"),
            "reason": d.get("reason", ""),
            "ytd": d.get("ytd"),
            "w52": d.get("w52"),
            "m3": d.get("m3"),
            "daily": d.get("daily", 0.0),
        }
        if d.get("beta") is not None:
            profile["beta"] = d["beta"]
        if d.get("beta_flag"):
            profile["risk_flag"] = d["beta_flag"]
        region_risk_profile[key] = profile

    ctx: Dict[str, Any] = {
        "market_regime": regime,
        "confidence": confidence,
        "as_of": today.strftime("%Y-%m-%d"),
        "macro_tilts": {
            "favored_sectors": favored_sectors,
            "avoided_sectors": avoided_sectors,
            "favored_regions": favored_regions,
            "avoided_regions": avoided_regions,
            "rationale": rationale,
        },
        "key_trends": _extract_trends(sectors, markets, rules),
        "risks": _extract_risks(sectors, markets, rules),
        "sector_risk_profile": sector_risk_profile,  # v1.6
        "region_risk_profile": region_risk_profile,  # v1.7
        "_meta": {
            "generated_at": datetime.now().isoformat(),
            "model": "radar_deterministic_v1.6.1",
            "mode": "DATA_DRIVEN",
            "amf_compliant": True,
            "is_fallback": False,
            "gates_enabled": {
                "w52_gate": True,
                "m3_cooling_gate": True,
                "m6_confirm_gate": True,
                "overheat_cooling_veto": True,
                "preferred_etf_selection": True,
                "january_mode": rules.january_mode_enabled,
                "fallback_top_n": rules.fallback_top_n > 0,
                "beta_adjustment": True,  # v1.6
            },
            "beta_config": {  # v1.6
                "method": "option_2plus_buffer_zones",
                "us_high_beta_range": [BETA_CONFIG["US"]["high_beta_lower"], BETA_CONFIG["US"]["high_beta_upper"]],
                "us_defensive_range": [BETA_CONFIG["US"]["defensive_lower"], BETA_CONFIG["US"]["defensive_upper"]],
                "eu_defensive_range": [BETA_CONFIG["Europe"]["defensive_lower"], BETA_CONFIG["Europe"]["defensive_upper"]],
                "eu_high_beta": "disabled",
                "regime_multipliers": BETA_TILT_MULTIPLIERS,
                "floor_neutral_threshold": DEFENSIVE_FLOOR_BETA_MAX,
                "floor_neutral_dd_gate": DEFENSIVE_FLOOR_DD_RATIO_MAX,
            },
            "january_mode_info": {
                "day_of_year": doy,
                "effective_ytd_min": round(effective_ytd_min, 2),
                "ramp_days": rules.january_mode_ramp_days,
                "ytd_floor": rules.january_mode_ytd_floor,
            },
            "selection_stats": selection_stats,
            "rules": asdict(rules),
            "tilt_config": {
                "favored": rules.tilt_favored,
                "avoided": rules.tilt_avoided,
                "max_tactical": rules.tilt_max,
            },
            "momentum_stats": momentum_stats,
            "diagnostics": {
                "sectors_loaded": len(sectors),
                "markets_loaded": len(markets),
                "sector_classifications": sector_diag[:20],
                "region_classifications": region_diag[:20],
            },
        },
    }

    # Smoothing
    old_ctx = None
    if previous_context_path:
        p = Path(previous_context_path)
        if p.exists():
            try:
                old_ctx = json.loads(p.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning(f"⚠️ Impossible de charger ancien contexte: {e}")
    elif save_to_file:
        out_p = Path(output_path) if output_path else Path(data_dir) / "market_context.json"
        if out_p.exists():
            try:
                old_ctx = json.loads(out_p.read_text(encoding="utf-8"))
            except Exception:
                pass

    if old_ctx and not _is_radar_context(old_ctx):
        old_model = old_ctx.get("_meta", {}).get("model", "unknown")
        logger.warning(f"⚠️ Ancien contexte non-RADAR détecté (model={old_model}), smoothing désactivé")
        old_ctx = None
        ctx["_meta"]["smoothing_skipped_reason"] = f"old_context_not_radar (was: {old_model})"
    
    ctx = maybe_smooth_context(old_ctx, ctx, rules)

    if save_to_file:
        out = Path(output_path) if output_path else Path(data_dir) / "market_context.json"
        out.write_text(json.dumps(ctx, indent=2, ensure_ascii=False), encoding="utf-8")
        logger.info(f"✅ market_context.json écrit: {out}")

    logger.info(f"📈 Régime: {regime} (confidence: {confidence})")
    logger.info(f"   Secteurs favored: {favored_sectors}")
    logger.info(f"   Secteurs avoided: {avoided_sectors}")
    logger.info(f"   Régions favored: {favored_regions}")
    logger.info(f"   Régions avoided: {avoided_regions}")
    logger.info(f"🎯 v1.6 Features:")
    logger.info(f"   └─ ETF Selection: preferred={selection_stats['preferred']}, medoid={selection_stats['medoid']}")
    logger.info(f"   └─ January Mode: doy={doy}, effective_ytd_min={effective_ytd_min:.1f}%")
    logger.info(f"   └─ Beta: {momentum_stats['beta_high_beta_warnings']} high-beta, {momentum_stats['beta_defensive_flags']} defensive, {momentum_stats['beta_floor_neutral_count']} floored")
    logger.info(f"   └─ Sector risk profiles: {len(sector_risk_profile)}")

    return ctx


def _extract_trends(sectors, markets, rules) -> List[str]:
    trends = []
    sorted_sectors = sorted(sectors.items(), key=lambda x: _safe_num(x[1].get("ytd", 0), 0), reverse=True)
    if sorted_sectors:
        top = sorted_sectors[0]
        trends.append(f"Secteur leader: {top[0]} (+{_safe_num(top[1].get('ytd', 0), 0):.1f}% YTD)")
    sorted_markets = sorted(markets.items(), key=lambda x: _safe_num(x[1].get("ytd", 0), 0), reverse=True)
    if sorted_markets:
        top = sorted_markets[0]
        trends.append(f"Région leader: {top[0]} (+{_safe_num(top[1].get('ytd', 0), 0):.1f}% YTD)")
    cooling_count = sum(1 for d in sectors.values() if d.get("m3") is not None and d.get("m3") <= rules.m3_cooling_threshold)
    if cooling_count > 0:
        trends.append(f"{cooling_count} secteur(s) en refroidissement (3M ≤ {rules.m3_cooling_threshold}%)")
    w52_leaders = [(k, d.get("w52")) for k, d in sectors.items() if d.get("w52") is not None and d.get("w52") > 30]
    if w52_leaders:
        w52_leaders.sort(key=lambda x: x[1], reverse=True)
        trends.append(f"52W leader: {w52_leaders[0][0]} (+{w52_leaders[0][1]:.1f}% sur 12 mois)")
    m6_leaders = [(k, d.get("m6")) for k, d in sectors.items() if d.get("m6") is not None and d.get("m6") > 15]
    if m6_leaders:
        m6_leaders.sort(key=lambda x: x[1], reverse=True)
        trends.append(f"6M leader: {m6_leaders[0][0]} (+{m6_leaders[0][1]:.1f}% sur 6 mois)")
    return trends


def _extract_risks(sectors, markets, rules) -> List[str]:
    risks = []
    underperform = [k for k, d in sectors.items() if _safe_num(d.get("ytd", 0), 0) < rules.underperform_ytd_max]
    if underperform:
        risks.append(f"Secteurs en difficulté: {', '.join(underperform[:3])}")
    underperform_regions = [k for k, d in markets.items() if _safe_num(d.get("ytd", 0), 0) < rules.underperform_ytd_max]
    if underperform_regions:
        risks.append(f"Régions en difficulté: {', '.join(underperform_regions[:3])}")
    favored_count = sum(1 for d in sectors.values() if (rules.sweet_ytd_min <= _safe_num(d.get("ytd", 0), 0) <= rules.sweet_ytd_max and _safe_num(d.get("daily", 0), 0) >= rules.sweet_daily_min))
    if favored_count <= 2:
        risks.append("Concentration: peu de secteurs en zone favorable (rotation possible)")
    m6_weak = [k for k, d in sectors.items() if d.get("m6") is not None and d.get("m6") < 0]
    if len(m6_weak) >= 3:
        risks.append(f"{len(m6_weak)} secteurs avec 6M négatif (momentum moyen-terme dégradé)")
    return risks


def _get_fallback_context(rules: RadarRules) -> Dict[str, Any]:
    return {
        "market_regime": "neutral",
        "confidence": 0.5,
        "as_of": datetime.now().strftime("%Y-%m-%d"),
        "macro_tilts": {
            "favored_sectors": [], "avoided_sectors": [],
            "favored_regions": [], "avoided_regions": [],
            "rationale": "Données marché non disponibles - mode neutre",
        },
        "key_trends": [],
        "risks": ["Contexte marché non disponible"],
        "sector_risk_profile": {},
        "_meta": {
            "generated_at": datetime.now().isoformat(),
            "model": "radar_deterministic_v1.6.1",
            "mode": "FALLBACK",
            "amf_compliant": True,
            "is_fallback": True,
        },
    }


# -------------------- Tilt Application --------------------

def apply_macro_tilts_radar(
    sector: str,
    country: str,
    market_context: Dict[str, Any],
) -> float:
    """
    Applique les tilts tactiques basés sur le market_context.
    
    v1.6: Ajustement beta Option 2+ (buffer zones, regime-conditional)
    """
    tilts = market_context.get("macro_tilts", {})
    cfg = market_context.get("_meta", {}).get("tilt_config", {})

    tilt_f = float(cfg.get("favored", 0.15))
    tilt_a = float(cfg.get("avoided", -0.25))
    tilt_max = float(cfg.get("max_tactical", 0.30))

    s = normalize_sector(sector) if sector else ""
    c = normalize_region(country) if country else ""

    regime = market_context.get("market_regime", "neutral")

    # --- Tilt sectoriel ---
    sector_t = 0.0
    classification = None
    if s in tilts.get("favored_sectors", []):
        sector_t = tilt_f
        classification = "favored"
    elif s in tilts.get("avoided_sectors", []):
        sector_t = tilt_a
        classification = "avoided"

    # v1.6: Beta adjustment via sector_risk_profile
    if classification and sector_t != 0:
        risk_profile = market_context.get("sector_risk_profile", {}).get(s, {})
        beta = risk_profile.get("beta")
        vol_3y = risk_profile.get("vol_3y")
        beta_region = risk_profile.get("region", "US")
        
        if beta is not None:
            factor, flag = _compute_beta_tilt_factor(
                beta, vol_3y, beta_region, classification, regime, 0.0
            )
            if factor < 1.0:
                sector_t = sector_t * factor
                logger.debug(f"  📐 Beta adj {s}: {flag} → tilt={sector_t:.3f}")

        # v1.6.1 P3: Circuit breaker — extreme daily move → reduce tilt
        daily_move = abs(risk_profile.get("daily", 0.0))
        cb_threshold = market_context.get("_meta", {}).get("rules", {}).get("circuit_breaker_daily", 5.0)
        if daily_move > cb_threshold:
            sector_t = sector_t * 0.5
            logger.debug(f"  ⚡ Circuit breaker {s}: |daily|={daily_move:.1f}% > {cb_threshold}% → tilt halved to {sector_t:.3f}")

    # --- Tilt régional (inchangé) ---
    region_t = 0.0
    if c in tilts.get("favored_regions", []):
        region_t = tilt_f
    elif c in tilts.get("avoided_regions", []):
        region_t = tilt_a

    total = sector_t + region_t
    return max(-tilt_max, min(tilt_max, total))


# -------------------- CLI --------------------

if __name__ == "__main__":
    import argparse
    
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    ap = argparse.ArgumentParser(description="Génère market_context.json - v1.6 avec Beta Adjustment")
    ap.add_argument("--data-dir", default="data")
    ap.add_argument("--output", default=None)
    ap.add_argument("--previous", default=None)
    ap.add_argument("--smoothing", type=float, default=0.3)
    ap.add_argument("--no-save", action="store_true")
    ap.add_argument("--no-january-mode", action="store_true")
    ap.add_argument("--fallback-top-n", type=int, default=3)
    args = ap.parse_args()

    print("=" * 70)
    print("🎯 MARKET/SECTOR RADAR v1.6.1")
    print("   Expert Fixes: Dead Zone + Sweet Max Dynamic + Circuit Breaker")
    print("=" * 70)

    rules = RadarRules(
        smoothing_alpha=args.smoothing,
        january_mode_enabled=not args.no_january_mode,
        fallback_top_n=args.fallback_top_n,
    )

    ctx = generate_market_context_radar(
        data_dir=args.data_dir,
        rules=rules,
        save_to_file=not args.no_save,
        output_path=args.output,
        previous_context_path=args.previous,
    )

    print("\n📊 RÉSULTAT:")
    print(json.dumps({
        "market_regime": ctx["market_regime"],
        "confidence": ctx["confidence"],
        "macro_tilts": ctx["macro_tilts"],
        "sector_risk_profile": ctx.get("sector_risk_profile", {}),
        "key_trends": ctx.get("key_trends", []),
        "risks": ctx.get("risks", []),
        "beta_stats": {
            "high_beta_warnings": ctx.get("_meta", {}).get("momentum_stats", {}).get("beta_high_beta_warnings", 0),
            "defensive_flags": ctx.get("_meta", {}).get("momentum_stats", {}).get("beta_defensive_flags", 0),
            "floor_neutral": ctx.get("_meta", {}).get("momentum_stats", {}).get("beta_floor_neutral_count", 0),
        },
        "as_of": ctx["as_of"],
    }, indent=2, ensure_ascii=False))
    print("\n" + "=" * 70)
