# portfolio_engine/market_sector_radar.py
"""
Market/Sector Radar v1.5 (Deterministic, 3M/6M Gates, Preferred ETF, January Mode)
==================================================================================

Objectif:
- Exploiter sectors.json + markets.json pour produire un market_context.json
  (format compatible avec le pipeline existant).
- Zéro GPT, règles fixes, auditable, AMF-compliant.

Règles SECTEURS (ajustées v1.5):
- avoided  : ytd < 0 ET w52 < 0 (underperform confirmé)
- avoided  : ytd < -5 même si w52 > 0 (deep negative)
- neutral  : ytd < 0 ET w52 > 0 ET ytd >= -5 (rescued par 52W)
- neutral  : ytd >= 50 (surchauffe → pas de pénalité, mais pas de bonus)
- favored  : 10 <= ytd <= 35 AND daily >= -0.5 AND w52 > 0 (sweet spot confirmé)
- neutral  : favored legacy mais w52 < 0 (blocked)
- neutral  : favored mais m6 <= 0 (blocked par m6 gate) [v1.4]
- neutral  : w52 >= 60% ET m3 <= -2% (overheat + cooling = veto) [v1.4]
- neutral  : sinon

RÉGIONS (marchés/pays):
- Mêmes règles

Régime:
- risk-on  si >=60% des secteurs ont ytd > 0
- risk-off si >=60% des secteurs ont ytd < 0
- neutral sinon

Ajustements v1.5 vs v1.4:
- PREFERRED_US: Table des ETFs "core" par secteur (XLY > FTXD, XLK > CIBR)
- pick_representative_sector_entry(): Logique core → qualité → medoïde
- effective_momentum(): Score hybride m6/ytd selon day-of-year (January mode)
- Fallback top N si favored vide (RADAR jamais "muet")
- _entry_usable(): Filtre les entrées avec données incomplètes

Ajustements v1.4 vs v1.3:
- Gates 3M/6M: confirmation momentum court/moyen terme
- overheat_w52_min: cap à 60% pour flag overheat
- m6_confirm_favored_min: m6 > 0 pour confirmer favored
- m3_cooling_threshold: m3 < -2% = signal cooling
- VETO combiné: overheat + cooling → neutral (pas favored seul)
- Chargement m3_num, m6_num depuis sectors/markets.json

Ajustements v1.3 vs v1.2:
- 52W Gate: sign-based logic (pas de seuil arbitraire)
- _safe_num_opt(): retourne None au lieu de 0 pour w52
- classify_v2(): intègre w52 comme gate de confirmation
- Diagnostics enrichis avec w52 et flags

Ajustements v1.2 vs v1.1:
- Anti-contamination: smoothing ignoré si ancien contexte non-RADAR (GPT)
- Logging amélioré pour audit trail

Ajustements v1.1 vs v1.0:
- sweet_daily_min: 0 → -0.5 (tolérance bruit quotidien)
- smoothing_alpha: 0 → 0.3 (anti-whipsaw par défaut)
- overheat: avoided → NEUTRAL (un marché peut rester chaud longtemps)
- sweet_ytd_max: 40 → 35 (plus prudent)
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

# Table des ETFs "core" par secteur (SPDR Select Sector, iShares)
# Priorité : premier de la liste si présent
PREFERRED_US: Dict[str, List[str]] = {
    "energy": ["XLE"],
    "materials": ["XLB"],
    "industrials": ["XLI"],
    "consumer-discretionary": ["XLY"],  # FIX: évite FTXD (0/0)
    "consumer-staples": ["XLP"],
    "healthcare": ["XLV", "IYH"],
    "financials": ["XLF", "IYG"],
    "information-technology": ["XLK", "IYW"],  # FIX: évite CIBR
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

# Métriques de base pour évaluer la qualité d'une entrée
CORE_METRICS = ["ytd_num", "m3_num", "m6_num", "w52_num", "change_num"]


# -------------------- Rules --------------------

@dataclass(frozen=True)
class RadarRules:
    """
    Règles paramétrables pour la classification secteurs/régions.
    
    Ajustements v1.5:
    - january_mode_ramp_days: jours pour passer de m6 à ytd
    - january_mode_ytd_floor: seuil YTD minimum en début d'année
    - fallback_top_n: nombre de secteurs à prendre si favored vide
    
    Ajustements v1.4:
    - Gates 3M/6M: confirmation momentum court/moyen terme
    - overheat_w52_min: cap à 60% pour flag overheat
    - m6_confirm_favored_min: m6 > 0 pour confirmer favored
    - m3_cooling_threshold: m3 < -2% = signal cooling
    - VETO combiné: overheat + cooling → neutral
    
    Ajustements v1.3:
    - 52W Gate: confirmation sign-based
    - ytd_mild_negative_floor: seuil pour rescue
    
    Ajustements v1.1:
    - daily_min abaissé pour tolérer le bruit
    - smoothing activé par défaut
    - overheat = neutre (pas avoided)
    """
    # Sweet spot (zone favorable)
    sweet_ytd_min: float = 10.0      # Min YTD pour être favored (ajusté par January mode)
    sweet_ytd_max: float = 35.0      # Max YTD (au-delà = potentiellement surchauffe)
    sweet_daily_min: float = -0.5    # Tolérance: un léger rouge n'exclut pas

    # Overheat threshold (>= ce seuil = neutre, PAS avoided)
    overheat_ytd_min: float = 50.0
    
    # Underperform (< ce seuil = avoided)
    underperform_ytd_max: float = 0.0

    # ========== v1.3: 52W Gate (sign-based) ==========
    # Confirmer favored: exiger w52 > 0
    confirm_favored_requires_w52_positive: bool = True
    
    # Confirmer avoided: logique sign-based
    confirm_avoided_requires_w52_negative: bool = True
    
    # Seuil pour rescue: si ytd >= ce seuil ET w52 > 0, rescue possible
    # En-dessous de ce seuil, on garde avoided même si w52 > 0 (deep negative)
    ytd_mild_negative_floor: float = -5.0
    
    # Divergence threshold: tag info seulement (pas veto)
    divergence_threshold: float = 20.0

    # ========== v1.4: 3M/6M Gates ==========
    # Cap overheat sur 52W: w52 >= ce seuil = flag "overheat"
    # MAIS veto favored SEULEMENT si overheat + cooling combinés
    overheat_w52_min: float = 60.0
    
    # Gate m6: m6 > ce seuil pour confirmer favored (si m6 disponible)
    m6_confirm_favored_min: float = 0.0
    
    # Seuil cooling: m3 <= ce seuil = signal de refroidissement
    m3_cooling_threshold: float = -2.0

    # ========== v1.5: January Mode ==========
    # Nombre de jours pour la rampe m6 → ytd (en début d'année, m6 domine)
    january_mode_ramp_days: int = 90
    
    # Seuil YTD minimum en début d'année (floor)
    january_mode_ytd_floor: float = 2.0
    
    # Fallback: nombre de secteurs à prendre si favored vide
    fallback_top_n: int = 3
    
    # Activer le January mode (score hybride m6/ytd)
    january_mode_enabled: bool = True

    # Selection caps
    max_favored_sectors: int = 5
    max_avoided_sectors: int = 3
    max_favored_regions: int = 4
    max_avoided_regions: int = 3

    # Regime thresholds
    risk_on_threshold: float = 0.60
    risk_off_threshold: float = 0.60

    # Tilt magnitudes (appliquées par apply_macro_tilts)
    tilt_favored: float = 0.15       # +15% score pour favored
    tilt_avoided: float = -0.25      # -25% score pour avoided (v5.3.1: renforcé, -15% insuffisant)
    tilt_max: float = 0.30           # Plafond total

    # Smoothing: mélange ancien/nouveau contexte pour stabilité
    # 0.0 = pas de smoothing ; 0.3 = 30% ancien + 70% nouveau
    smoothing_alpha: float = 0.3


# -------------------- Normalization --------------------

SECTOR_ALIASES: Dict[str, str] = {
    # English variants
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
    
    # French variants (from your stocks data)
    "technologie de l'information": "information-technology",
    "consommation discrétionnaire": "consumer-discretionary",
    "consommation de base": "consumer-staples",
    "biens de consommation cycliques": "consumer-discretionary",
    "biens de consommation défensifs": "consumer-staples",
}

REGION_ALIASES: Dict[str, str] = {
    # US
    "us": "united-states", 
    "usa": "united-states", 
    "united states": "united-states",
    "etats-unis": "united-states",
    "états-unis": "united-states",
    
    # UK
    "uk": "united-kingdom", 
    "united kingdom": "united-kingdom",
    "royaume-uni": "united-kingdom",
    "royaume uni": "united-kingdom",
    
    # Europe
    "germany": "germany",
    "allemagne": "germany",
    "france": "france",
    "netherlands": "netherlands",
    "pays-bas": "netherlands",
    "spain": "spain",
    "espagne": "spain",
    "italy": "italy",
    "italie": "italy",
    "switzerland": "switzerland",
    "suisse": "switzerland",
    "belgium": "belgium",
    "belgique": "belgium",
    "sweden": "sweden",
    "suède": "sweden",
    "denmark": "denmark",
    "danemark": "denmark",
    "norway": "norway",
    "norvège": "norway",
    "finland": "finland",
    "finlande": "finland",
    "ireland": "ireland",
    "irlande": "ireland",
    "austria": "austria",
    "autriche": "austria",
    "portugal": "portugal",
    
    # Asia
    "china": "china",
    "chine": "china",
    "japan": "japan",
    "japon": "japan",
    "south korea": "south-korea",
    "korea": "south-korea",
    "corée du sud": "south-korea",
    "taiwan": "taiwan",
    "taïwan": "taiwan",
    "hong kong": "hong-kong",
    "singapore": "singapore",
    "singapour": "singapore",
    "india": "india",
    "inde": "india",
    "indonesia": "indonesia",
    "indonésie": "indonesia",
    "thailand": "thailand",
    "thaïlande": "thailand",
    "malaysia": "malaysia",
    "malaisie": "malaysia",
    "vietnam": "vietnam",
    "viêt nam": "vietnam",
    "philippines": "philippines",
    
    # Middle East
    "israel": "israel",
    "israël": "israel",
    "saudi arabia": "saudi-arabia",
    "arabie saoudite": "saudi-arabia",
    "uae": "uae",
    "emirates": "uae",
    "émirats arabes unis": "uae",
    "turkey": "turkey",
    "turquie": "turkey",
    
    # Americas
    "canada": "canada",
    "brazil": "brazil",
    "brésil": "brazil",
    "mexico": "mexico",
    "mexique": "mexico",
    "argentina": "argentina",
    "argentine": "argentina",
    "chile": "chile",
    "chili": "chile",
    
    # Oceania
    "australia": "australia",
    "australie": "australia",
    "new zealand": "new-zealand",
    "nouvelle-zélande": "new-zealand",
    
    # Africa
    "south africa": "south-africa",
    "afrique du sud": "south-africa",
}


def normalize_sector(x: Optional[str]) -> str:
    """Normalise un nom de secteur vers la forme standard (kebab-case)."""
    if not x:
        return ""
    k = x.strip().lower().replace("_", "-")
    return SECTOR_ALIASES.get(k, k)


def normalize_region(x: Optional[str]) -> str:
    """Normalise un nom de pays/région vers la forme standard (kebab-case)."""
    if not x:
        return ""
    k = x.strip().lower()
    return REGION_ALIASES.get(k, k)


# -------------------- Helpers --------------------

def _safe_num(v: Any, default: float = 0.0) -> float:
    """Convertit une valeur en float de manière sûre."""
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
    """
    Convertit une valeur en float, retourne None si invalide.
    
    v1.3: CRITIQUE pour w52/m3/m6 - ne jamais transformer un manque en 0.
    """
    try:
        if v is None:
            return None
        if isinstance(v, str):
            v = v.strip().replace(",", ".").replace("%", "")
            if not v or v.lower() in ("n/a", "nan", "-", "—", ""):
                return None
        result = float(v)
        # Vérifier NaN
        if result != result:  # NaN check
            return None
        return result
    except Exception:
        return None


def _is_number(x: Any) -> bool:
    """Vérifie si une valeur est un nombre valide (pas None, pas NaN)."""
    return isinstance(x, (int, float)) and not (isinstance(x, float) and math.isnan(x))


# -------------------- v1.5: ETF Selection Logic --------------------

def _entry_usable(e: Dict[str, Any]) -> bool:
    """
    Vérifie si une entrée ETF a suffisamment de données pour être utilisée.
    
    v1.5: Filtre les entrées avec données incomplètes (ex: FTXD avec 0/0).
    Exige au moins 3 métriques disponibles + une valeur de prix.
    """
    if not isinstance(e, dict):
        return False
    
    # Compter les métriques disponibles
    available = sum(1 for k in CORE_METRICS if _is_number(e.get(k)))
    
    # Exiger au moins 3 métriques + prix valide
    has_price = _is_number(e.get("value_num"))
    
    # Rejeter les entrées avec ytd=0 ET change=0 (données probablement invalides)
    ytd = e.get("ytd_num")
    change = e.get("change_num")
    is_zero_zero = (ytd == 0 or ytd == 0.0) and (change == 0 or change == 0.0)
    
    return available >= 2 and has_price and not is_zero_zero


def _quality_score(e: Dict[str, Any]) -> float:
    """
    Calcule un score de qualité pour une entrée ETF.
    
    Plus le score est élevé, plus l'entrée est fiable.
    """
    s = 0.0
    
    # +1 par métrique disponible
    s += sum(1.0 for k in CORE_METRICS if _is_number(e.get(k)))
    
    # Bonus pour les familles d'indices "core"
    fam = (e.get("indexFamily") or "").lower()
    if "s&p 500" in fam or "stoxx europe 600" in fam:
        s += 2.0
    elif "dow jones" in fam or "msci" in fam:
        s += 1.5
    elif "s&p us" in fam:
        s += 1.0
    elif "nasdaq us" in fam:
        s += 0.5  # Moins stable, souvent thématique
    
    return s


def _median_ignore_none(values: List[Optional[float]]) -> Optional[float]:
    """Calcule la médiane en ignorant les None."""
    vals = [v for v in values if _is_number(v)]
    if not vals:
        return None
    return statistics.median(vals)


def _distance_to_profile(e: Dict[str, Any], profile: Dict[str, Optional[float]]) -> float:
    """
    Calcule la distance euclidienne entre une entrée et un profil médian.
    
    Utilisé pour trouver le "medoïde" (entrée la plus représentative).
    """
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
    """
    Sélectionne l'entrée ETF la plus représentative pour un secteur.
    
    v1.5: Logique de sélection:
    1. Filtre par région + qualité des données
    2. Si ETF "core" présent (PREFERRED_US/EU), le prendre
    3. Sinon, calculer profil médian et prendre le medoïde
    
    Retourne: (entry, method) où method = "preferred" | "medoid" | "fallback" | None
    """
    # 1. Filtrer par région
    if region == "US":
        candidates = [e for e in entries if isinstance(e, dict) and e.get("region") == "US"]
        preferred_table = PREFERRED_US
    elif region in ("EU", "Europe"):
        candidates = [e for e in entries if isinstance(e, dict) and e.get("region") == "Europe"]
        preferred_table = PREFERRED_EU
    else:
        candidates = [e for e in entries if isinstance(e, dict)]
        preferred_table = PREFERRED_US
    
    # Fallback: toutes les entrées si aucune pour la région
    if not candidates:
        candidates = [e for e in entries if isinstance(e, dict)]
    
    # Filtrer les entrées utilisables
    usable = [e for e in candidates if _entry_usable(e)]
    
    if not usable:
        # Dernier recours: prendre la première entrée même si pas idéale
        if candidates:
            logger.warning(f"⚠️ {sector_key}: Aucune entrée utilisable, fallback sur première entrée")
            return candidates[0], "fallback"
        return None, "none"
    
    # 2. Chercher un ETF "core" préféré
    preferred_symbols = preferred_table.get(sector_key, [])
    for sym in preferred_symbols:
        for e in usable:
            if e.get("symbol") == sym:
                logger.debug(f"✅ {sector_key}: ETF préféré trouvé: {sym}")
                return e, "preferred"
    
    # 3. Calculer le profil médian et trouver le medoïde
    profile = {k: _median_ignore_none([c.get(k) for c in usable]) for k in CORE_METRICS}
    
    # Trier par (distance au profil, puis qualité décroissante)
    scored = sorted(
        usable,
        key=lambda e: (_distance_to_profile(e, profile), -_quality_score(e))
    )
    
    selected = scored[0]
    logger.debug(f"📊 {sector_key}: Medoïde sélectionné: {selected.get('symbol')} (parmi {len(usable)} candidats)")
    
    return selected, "medoid"


# -------------------- v1.5: January Mode --------------------

def effective_momentum(
    today: date,
    ytd: float,
    m6: Optional[float],
    rules: RadarRules
) -> float:
    """
    Calcule un score de momentum hybride m6/ytd selon le jour de l'année.
    
    v1.5: En début d'année, m6 est plus informatif que ytd.
    - En janvier (doy ~7): w ≈ 0.08 → score ≈ 92% m6 + 8% ytd
    - En avril (doy ~100): w ≈ 1.0 → score = ytd
    
    Args:
        today: Date actuelle
        ytd: Performance YTD (%)
        m6: Performance 6 mois (%) ou None
        rules: Règles RADAR
    
    Returns:
        Score de momentum effectif
    """
    if not rules.january_mode_enabled:
        return ytd
    
    if m6 is None:
        return ytd
    
    doy = today.timetuple().tm_yday
    w = min(1.0, doy / float(rules.january_mode_ramp_days))
    
    # w proche de 0 en janvier → m6 dominant
    # w proche de 1 en avril+ → ytd dominant
    return (1.0 - w) * m6 + w * ytd


def sweet_ytd_min_dynamic(today: date, rules: RadarRules) -> float:
    """
    Calcule le seuil YTD minimum ajusté selon le jour de l'année.
    
    v1.5: En début d'année, le seuil est plus bas (floor).
    - Janvier: ~2%
    - Avril+: 10% (valeur standard)
    """
    if not rules.january_mode_enabled:
        return rules.sweet_ytd_min
    
    doy = today.timetuple().tm_yday
    ramp = min(1.0, doy / float(rules.january_mode_ramp_days))
    
    return max(rules.january_mode_ytd_floor, rules.sweet_ytd_min * ramp)


# -------------------- Loaders --------------------

def load_sectors(data_dir: str) -> Dict[str, Dict[str, Any]]:
    """
    Charge sectors.json et retourne un dict normalisé.
    
    v1.5: Utilise pick_representative_sector_entry() au lieu de "premier US".
    
    Retour:
      {sector_key: {"ytd": float, "daily": float, "w52": Optional[float], 
                    "m3": Optional[float], "m6": Optional[float], "raw": {...},
                    "selection_method": str, "symbol": str}}
    """
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
            
            # v1.5: Utiliser la nouvelle logique de sélection
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
                ytd = _safe_num(
                    entry.get("ytd_num") or entry.get("_ytd_value") or entry.get("ytd"),
                    0.0
                )
                daily = _safe_num(
                    entry.get("change_num") or entry.get("_change_value") or entry.get("change") or entry.get("daily"),
                    0.0
                )
                w52 = _safe_num_opt(
                    entry.get("w52_num") or entry.get("w52") or entry.get("w52Change")
                )
                m3 = _safe_num_opt(
                    entry.get("m3_num") or entry.get("m3") or entry.get("m3Change")
                )
                m6 = _safe_num_opt(
                    entry.get("m6_num") or entry.get("m6") or entry.get("m6Change")
                )
                
                out[key] = {
                    "ytd": ytd, 
                    "daily": daily, 
                    "w52": w52, 
                    "m3": m3, 
                    "m6": m6, 
                    "raw": entry,
                    "selection_method": method,
                    "symbol": entry.get("symbol", "N/A"),
                }

    logger.info(f"✅ Chargé {len(out)} secteurs depuis {path}")
    logger.info(f"   └─ Sélection: preferred={selection_stats['preferred']}, medoid={selection_stats['medoid']}, fallback={selection_stats['fallback']}")
    
    # Log coverage
    w52_count = sum(1 for d in out.values() if d.get("w52") is not None)
    m3_count = sum(1 for d in out.values() if d.get("m3") is not None)
    m6_count = sum(1 for d in out.values() if d.get("m6") is not None)
    logger.info(f"   └─ Couverture: w52={w52_count}/{len(out)}, m3={m3_count}/{len(out)}, m6={m6_count}/{len(out)}")
    
    return out


def load_markets(data_dir: str) -> Dict[str, Dict[str, Any]]:
    """
    Charge markets.json et retourne un dict normalisé par pays.
    
    Retour:
      {country_key: {"ytd": float, "daily": float, "w52": Optional[float],
                     "m3": Optional[float], "m6": Optional[float], "raw": {...}}}
    """
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
                
                ytd = _safe_num(
                    e.get("ytd_num") or e.get("_ytd_value") or e.get("ytd"),
                    0.0
                )
                daily = _safe_num(
                    e.get("change_num") or e.get("_change_value") or e.get("change") or e.get("daily"),
                    0.0
                )
                w52 = _safe_num_opt(
                    e.get("w52_num") or e.get("w52") or e.get("w52Change")
                )
                m3 = _safe_num_opt(
                    e.get("m3_num") or e.get("m3") or e.get("m3Change")
                )
                m6 = _safe_num_opt(
                    e.get("m6_num") or e.get("m6") or e.get("m6Change")
                )
                
                out[key] = {"ytd": ytd, "daily": daily, "w52": w52, "m3": m3, "m6": m6, "raw": e}

    logger.info(f"✅ Chargé {len(out)} marchés/pays depuis {path}")
    
    w52_count = sum(1 for d in out.values() if d.get("w52") is not None)
    m3_count = sum(1 for d in out.values() if d.get("m3") is not None)
    m6_count = sum(1 for d in out.values() if d.get("m6") is not None)
    logger.info(f"   └─ Couverture: w52={w52_count}/{len(out)}, m3={m3_count}/{len(out)}, m6={m6_count}/{len(out)}")
    
    return out


# -------------------- Classification --------------------

def classify(ytd: float, daily: float, rules: RadarRules) -> Tuple[str, str]:
    """
    Classification LEGACY (v1.2) basée sur YTD + daily uniquement.
    
    Note: Cette fonction est conservée pour compatibilité.
    Utiliser classify_v3() pour la classification avec 52W/3M/6M gates.
    """
    if ytd < rules.underperform_ytd_max:
        return "avoided", "underperform"
    
    if ytd >= rules.overheat_ytd_min:
        return "neutral", "overheat"
    
    if (rules.sweet_ytd_min <= ytd <= rules.sweet_ytd_max 
        and daily >= rules.sweet_daily_min):
        return "favored", "sweet_spot"
    
    return "neutral", "out_of_range"


def classify_v3(
    ytd: float, 
    daily: float, 
    w52: Optional[float],
    m3: Optional[float],
    m6: Optional[float],
    rules: RadarRules,
    effective_ytd_min: float = 10.0,
) -> Tuple[str, str]:
    """
    Classification v1.5 avec 52W Gate + 3M/6M Gates + January mode.
    
    Args:
        effective_ytd_min: Seuil YTD minimum effectif (ajusté par January mode)
    """
    # 1. Classification de base avec seuil ajusté
    if ytd < rules.underperform_ytd_max:
        cls, reason = "avoided", "underperform"
    elif ytd >= rules.overheat_ytd_min:
        cls, reason = "neutral", "overheat"
    elif (effective_ytd_min <= ytd <= rules.sweet_ytd_max 
          and daily >= rules.sweet_daily_min):
        cls, reason = "favored", "sweet_spot"
    else:
        cls, reason = "neutral", "out_of_range"
    
    # Collecter les flags
    flags: List[str] = []
    
    # Détection des conditions v1.4
    is_overheat = w52 is not None and w52 >= rules.overheat_w52_min
    if is_overheat:
        flags.append("overheat_w52")
    
    is_cooling = m3 is not None and m3 <= rules.m3_cooling_threshold
    if is_cooling:
        flags.append("cooling_m3")
    
    is_m6_weak = m6 is not None and m6 <= rules.m6_confirm_favored_min
    
    # Gates 52W
    if w52 is None:
        flags.append("w52_missing")
    else:
        if abs(ytd - w52) > rules.divergence_threshold:
            flags.append("divergent")
    
    # Gate favored: w52 + m6 + veto combiné
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
    
    # Gate avoided
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
) -> Tuple[List[str], List[str], List[Dict[str, Any]]]:
    """
    Applique la classification v1.5 et retourne les listes favored/avoided.
    
    v1.5: 
    - Utilise effective_momentum pour le tri en January mode
    - Fallback top N si favored vide
    """
    today = today or date.today()
    effective_ytd_min = sweet_ytd_min_dynamic(today, rules)
    
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
        
        # v1.5: Calcul du momentum effectif
        eff_mom = effective_momentum(today, ytd, m6, rules)
        
        classification, reason = classify_v3(ytd, daily, w52, m3, m6, rules, effective_ytd_min)
        
        diag_entry = {
            "key": key,
            "ytd": round(ytd, 2),
            "daily": round(daily, 2),
            "w52": round(w52, 2) if w52 is not None else None,
            "m3": round(m3, 2) if m3 is not None else None,
            "m6": round(m6, 2) if m6 is not None else None,
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

    # Tri: favored par effective_momentum desc
    favored.sort(key=lambda x: x[7], reverse=True)
    avoided.sort(key=lambda x: x[1])

    favored_list = [x[0] for x in favored[:max_favored]]
    avoided_list = [x[0] for x in avoided[:max_avoided]]
    
    # v1.5: Fallback si favored vide
    if not favored_list and rules.fallback_top_n > 0:
        logger.warning(f"⚠️ Aucun secteur favored, activation fallback top {rules.fallback_top_n}")
        
        # Prendre les meilleurs neutral par effective_momentum
        # Exclure ceux avec overheat (w52 >= 60) ou m6 négatif
        eligible_neutral = [
            n for n in neutral
            if (n[3] is None or n[3] < rules.overheat_w52_min)  # w52 pas overheat
            and (n[5] is None or n[5] > 0)  # m6 positif ou absent
        ]
        
        # Trier par effective_momentum
        eligible_neutral.sort(key=lambda x: x[7], reverse=True)
        
        fallback_list = [x[0] for x in eligible_neutral[:rules.fallback_top_n]]
        
        if fallback_list:
            logger.info(f"   └─ Fallback activé: {fallback_list}")
            favored_list = fallback_list
            
            # Marquer dans les diagnostics
            for d in diag:
                if d["key"] in fallback_list:
                    d["classification"] = "favored"
                    d["reason"] += "|fallback_top_n"

    return favored_list, avoided_list, diag


def compute_regime(
    sectors: Dict[str, Dict[str, Any]], 
    rules: RadarRules
) -> Tuple[str, float, str]:
    """Détermine le régime de marché."""
    if not sectors:
        return "neutral", 0.5, "no sector data available"

    total = len(sectors)
    pos = sum(1 for d in sectors.values() if _safe_num(d.get("ytd", 0.0), 0.0) > 0)
    neg = sum(1 for d in sectors.values() if _safe_num(d.get("ytd", 0.0), 0.0) < 0)

    pos_ratio = pos / total if total else 0.0
    neg_ratio = neg / total if total else 0.0

    if pos_ratio >= rules.risk_on_threshold:
        conf = min(0.95, 0.70 + 0.25 * pos_ratio)
        return "risk-on", round(conf, 2), f"{pos}/{total} secteurs positifs ({pos_ratio:.0%})"
    
    if neg_ratio >= rules.risk_off_threshold:
        conf = min(0.95, 0.70 + 0.25 * neg_ratio)
        return "risk-off", round(conf, 2), f"{neg}/{total} secteurs négatifs ({neg_ratio:.0%})"
    
    return "neutral", 0.60, f"marché mixte: {pos} pos, {neg} neg / {total}"


# -------------------- Smoothing (anti-whipsaw) --------------------

def _smooth_list(old: List[str], new: List[str], alpha: float, cap: int) -> List[str]:
    """Lisse la transition entre ancienne et nouvelle liste."""
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


def maybe_smooth_context(
    old_ctx: Optional[Dict[str, Any]],
    new_ctx: Dict[str, Any],
    rules: RadarRules,
) -> Dict[str, Any]:
    """Applique le smoothing si un ancien contexte existe."""
    if not old_ctx or rules.smoothing_alpha <= 0.0:
        return new_ctx

    alpha = rules.smoothing_alpha
    old_tilts = old_ctx.get("macro_tilts", {})
    new_tilts = new_ctx.get("macro_tilts", {})

    smoothed = dict(new_ctx)
    smoothed["macro_tilts"] = dict(new_tilts)

    smoothed["macro_tilts"]["favored_sectors"] = _smooth_list(
        old_tilts.get("favored_sectors", []),
        new_tilts.get("favored_sectors", []),
        alpha,
        rules.max_favored_sectors,
    )
    smoothed["macro_tilts"]["avoided_sectors"] = _smooth_list(
        old_tilts.get("avoided_sectors", []),
        new_tilts.get("avoided_sectors", []),
        alpha,
        rules.max_avoided_sectors,
    )
    smoothed["macro_tilts"]["favored_regions"] = _smooth_list(
        old_tilts.get("favored_regions", []),
        new_tilts.get("favored_regions", []),
        alpha,
        rules.max_favored_regions,
    )
    smoothed["macro_tilts"]["avoided_regions"] = _smooth_list(
        old_tilts.get("avoided_regions", []),
        new_tilts.get("avoided_regions", []),
        alpha,
        rules.max_avoided_regions,
    )

    smoothed["_meta"] = dict(new_ctx.get("_meta", {}))
    smoothed["_meta"]["smoothing_applied"] = True
    smoothed["_meta"]["smoothing_alpha"] = alpha
    
    return smoothed


def _is_radar_context(ctx: Optional[Dict[str, Any]]) -> bool:
    """Vérifie si un contexte a été généré par RADAR."""
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
    """
    Génère le contexte marché de manière déterministe (sans GPT).
    
    v1.5: Preferred ETF selection + January mode + Fallback
    """
    rules = rules or RadarRules()
    today = today or date.today()

    sectors = load_sectors(data_dir)
    markets = load_markets(data_dir)

    if not sectors and not markets:
        logger.warning("⚠️ Aucune donnée marché disponible, contexte neutre")
        return _get_fallback_context(rules)

    regime, confidence, rationale = compute_regime(sectors, rules)

    favored_sectors, avoided_sectors, sector_diag = pick_lists(
        sectors, rules, rules.max_favored_sectors, rules.max_avoided_sectors, today
    )
    favored_regions, avoided_regions, region_diag = pick_lists(
        markets, rules, rules.max_favored_regions, rules.max_avoided_regions, today
    )

    # Stats
    effective_ytd_min = sweet_ytd_min_dynamic(today, rules)
    doy = today.timetuple().tm_yday
    
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
    }
    
    selection_stats = {
        "preferred": sum(1 for d in sector_diag if d.get("selection_method") == "preferred"),
        "medoid": sum(1 for d in sector_diag if d.get("selection_method") == "medoid"),
        "fallback": sum(1 for d in sector_diag if d.get("selection_method") == "fallback"),
    }

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
        "_meta": {
            "generated_at": datetime.now().isoformat(),
            "model": "radar_deterministic_v1.5",
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
                logger.info(f"📊 Ancien contexte chargé pour smoothing: {p}")
            except Exception as e:
                logger.warning(f"⚠️ Impossible de charger ancien contexte: {e}")
    elif save_to_file:
        out_p = Path(output_path) if output_path else Path(data_dir) / "market_context.json"
        if out_p.exists():
            try:
                old_ctx = json.loads(out_p.read_text(encoding="utf-8"))
                logger.info(f"📊 Ancien contexte chargé pour smoothing: {out_p}")
            except Exception:
                pass

    if old_ctx and not _is_radar_context(old_ctx):
        old_model = old_ctx.get("_meta", {}).get("model", "unknown")
        logger.warning(f"⚠️ Ancien contexte non-RADAR détecté (model={old_model})")
        logger.warning(f"⚠️ Smoothing désactivé pour éviter contamination GPT")
        old_ctx = None
        ctx["_meta"]["smoothing_skipped_reason"] = f"old_context_not_radar (was: {old_model})"
    elif old_ctx:
        old_model = old_ctx.get("_meta", {}).get("model", "unknown")
        logger.info(f"✅ Ancien contexte RADAR détecté (model={old_model})")

    ctx = maybe_smooth_context(old_ctx, ctx, rules)

    if save_to_file:
        out = Path(output_path) if output_path else Path(data_dir) / "market_context.json"
        out.write_text(json.dumps(ctx, indent=2, ensure_ascii=False), encoding="utf-8")
        logger.info(f"✅ market_context.json écrit: {out}")

    # Log résumé
    logger.info(f"📈 Régime: {regime} (confidence: {confidence})")
    logger.info(f"   Secteurs favored: {favored_sectors}")
    logger.info(f"   Secteurs avoided: {avoided_sectors}")
    logger.info(f"   Régions favored: {favored_regions}")
    logger.info(f"   Régions avoided: {avoided_regions}")
    
    logger.info(f"🎯 v1.5 Features:")
    logger.info(f"   └─ ETF Selection: preferred={selection_stats['preferred']}, medoid={selection_stats['medoid']}")
    logger.info(f"   └─ January Mode: doy={doy}, effective_ytd_min={effective_ytd_min:.1f}%")
    logger.info(f"   └─ Fallback activé: {momentum_stats['fallback_activated']} secteurs")

    return ctx


def _extract_trends(
    sectors: Dict[str, Dict[str, Any]], 
    markets: Dict[str, Dict[str, Any]],
    rules: RadarRules
) -> List[str]:
    """Extrait les tendances clés."""
    trends = []
    
    sorted_sectors = sorted(
        sectors.items(), 
        key=lambda x: _safe_num(x[1].get("ytd", 0), 0), 
        reverse=True
    )
    if sorted_sectors:
        top = sorted_sectors[0]
        trends.append(f"Secteur leader: {top[0]} (+{_safe_num(top[1].get('ytd', 0), 0):.1f}% YTD)")
    
    sorted_markets = sorted(
        markets.items(),
        key=lambda x: _safe_num(x[1].get("ytd", 0), 0),
        reverse=True
    )
    if sorted_markets:
        top = sorted_markets[0]
        trends.append(f"Région leader: {top[0]} (+{_safe_num(top[1].get('ytd', 0), 0):.1f}% YTD)")
    
    overheat_ytd_count = sum(
        1 for d in sectors.values() 
        if _safe_num(d.get("ytd", 0), 0) >= rules.overheat_ytd_min
    )
    if overheat_ytd_count > 0:
        trends.append(f"{overheat_ytd_count} secteur(s) en zone de surchauffe YTD (≥ {rules.overheat_ytd_min}%)")
    
    overheat_w52_count = sum(
        1 for d in sectors.values() 
        if d.get("w52") is not None and d.get("w52") >= rules.overheat_w52_min
    )
    if overheat_w52_count > 0:
        trends.append(f"{overheat_w52_count} secteur(s) avec 52W ≥ {rules.overheat_w52_min}% (overheat long terme)")
    
    cooling_count = sum(
        1 for d in sectors.values()
        if d.get("m3") is not None and d.get("m3") <= rules.m3_cooling_threshold
    )
    if cooling_count > 0:
        trends.append(f"{cooling_count} secteur(s) en refroidissement (3M ≤ {rules.m3_cooling_threshold}%)")
    
    w52_leaders = [
        (k, d.get("w52")) for k, d in sectors.items() 
        if d.get("w52") is not None and d.get("w52") > 30
    ]
    if w52_leaders:
        w52_leaders.sort(key=lambda x: x[1], reverse=True)
        top_w52 = w52_leaders[0]
        trends.append(f"52W leader: {top_w52[0]} (+{top_w52[1]:.1f}% sur 12 mois)")
    
    m6_leaders = [
        (k, d.get("m6")) for k, d in sectors.items() 
        if d.get("m6") is not None and d.get("m6") > 15
    ]
    if m6_leaders:
        m6_leaders.sort(key=lambda x: x[1], reverse=True)
        top_m6 = m6_leaders[0]
        trends.append(f"6M leader: {top_m6[0]} (+{top_m6[1]:.1f}% sur 6 mois)")
    
    return trends


def _extract_risks(
    sectors: Dict[str, Dict[str, Any]], 
    markets: Dict[str, Dict[str, Any]],
    rules: RadarRules
) -> List[str]:
    """Extrait les risques identifiés."""
    risks = []
    
    underperform = [
        k for k, d in sectors.items() 
        if _safe_num(d.get("ytd", 0), 0) < rules.underperform_ytd_max
    ]
    if underperform:
        risks.append(f"Secteurs en difficulté: {', '.join(underperform[:3])}")
    
    underperform_regions = [
        k for k, d in markets.items()
        if _safe_num(d.get("ytd", 0), 0) < rules.underperform_ytd_max
    ]
    if underperform_regions:
        risks.append(f"Régions en difficulté: {', '.join(underperform_regions[:3])}")
    
    favored_count = sum(
        1 for d in sectors.values()
        if (rules.sweet_ytd_min <= _safe_num(d.get("ytd", 0), 0) <= rules.sweet_ytd_max
            and _safe_num(d.get("daily", 0), 0) >= rules.sweet_daily_min)
    )
    if favored_count <= 2:
        risks.append("Concentration: peu de secteurs en zone favorable (rotation possible)")
    
    divergent_count = sum(
        1 for d in sectors.values()
        if d.get("w52") is not None and abs(_safe_num(d.get("ytd", 0), 0) - d.get("w52")) > rules.divergence_threshold
    )
    if divergent_count >= 3:
        risks.append(f"{divergent_count} secteurs avec divergence YTD/52W (retournement possible)")
    
    overheat_cooling = [
        k for k, d in sectors.items()
        if (d.get("w52") is not None and d.get("w52") >= rules.overheat_w52_min
            and d.get("m3") is not None and d.get("m3") <= rules.m3_cooling_threshold)
    ]
    if overheat_cooling:
        risks.append(f"Risque retournement: {', '.join(overheat_cooling[:3])} (52W chaud + 3M en baisse)")
    
    m6_weak = [
        k for k, d in sectors.items()
        if d.get("m6") is not None and d.get("m6") < 0
    ]
    if len(m6_weak) >= 3:
        risks.append(f"{len(m6_weak)} secteurs avec 6M négatif (momentum moyen-terme dégradé)")
    
    return risks


def _get_fallback_context(rules: RadarRules) -> Dict[str, Any]:
    """Contexte neutre si aucune donnée disponible."""
    return {
        "market_regime": "neutral",
        "confidence": 0.5,
        "as_of": datetime.now().strftime("%Y-%m-%d"),
        "macro_tilts": {
            "favored_sectors": [],
            "avoided_sectors": [],
            "favored_regions": [],
            "avoided_regions": [],
            "rationale": "Données marché non disponibles - mode neutre",
        },
        "key_trends": [],
        "risks": ["Contexte marché non disponible"],
        "_meta": {
            "generated_at": datetime.now().isoformat(),
            "model": "radar_deterministic_v1.5",
            "mode": "FALLBACK",
            "amf_compliant": True,
            "is_fallback": True,
            "gates_enabled": {
                "w52_gate": True,
                "m3_cooling_gate": True,
                "m6_confirm_gate": True,
                "overheat_cooling_veto": True,
                "preferred_etf_selection": True,
                "january_mode": rules.january_mode_enabled,
                "fallback_top_n": rules.fallback_top_n > 0,
            },
            "tilt_config": {
                "favored": rules.tilt_favored,
                "avoided": rules.tilt_avoided,
                "max_tactical": rules.tilt_max,
            },
        },
    }


# -------------------- Tilt Application --------------------

def apply_macro_tilts_radar(
    sector: str, 
    country: str, 
    market_context: Dict[str, Any]
) -> float:
    """Applique les tilts tactiques basés sur le market_context."""
    tilts = market_context.get("macro_tilts", {})
    cfg = market_context.get("_meta", {}).get("tilt_config", {})

    tilt_f = float(cfg.get("favored", 0.15))
    tilt_a = float(cfg.get("avoided", -0.15))
    tilt_max = float(cfg.get("max_tactical", 0.30))

    s = normalize_sector(sector)
    c = normalize_region(country)

    sector_t = 0.0
    if s in tilts.get("favored_sectors", []):
        sector_t = tilt_f
    elif s in tilts.get("avoided_sectors", []):
        sector_t = tilt_a

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
    
    logging.basicConfig(
        level=logging.INFO, 
        format="%(asctime)s | %(levelname)s | %(message)s"
    )

    ap = argparse.ArgumentParser(
        description="Génère market_context.json - v1.5 avec Preferred ETF + January Mode"
    )
    ap.add_argument("--data-dir", default="data", help="Répertoire des données")
    ap.add_argument("--output", default=None, help="Chemin de sortie")
    ap.add_argument("--previous", default=None, help="Ancien market_context.json pour smoothing")
    ap.add_argument("--smoothing", type=float, default=0.3, help="Alpha smoothing (0-1)")
    ap.add_argument("--no-save", action="store_true", help="Ne pas sauvegarder")
    ap.add_argument("--overheat-w52", type=float, default=60.0, help="Seuil overheat 52W")
    ap.add_argument("--m3-cooling", type=float, default=-2.0, help="Seuil cooling 3M")
    ap.add_argument("--no-january-mode", action="store_true", help="Désactiver January mode")
    ap.add_argument("--fallback-top-n", type=int, default=3, help="Fallback top N si favored vide")
    args = ap.parse_args()

    print("=" * 70)
    print("🎯 MARKET/SECTOR RADAR v1.5")
    print("   Preferred ETF + January Mode + Fallback + 3M/6M Gates")
    print("=" * 70)

    rules = RadarRules(
        smoothing_alpha=args.smoothing,
        overheat_w52_min=args.overheat_w52,
        m3_cooling_threshold=args.m3_cooling,
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
        "key_trends": ctx.get("key_trends", []),
        "risks": ctx.get("risks", []),
        "january_mode_info": ctx.get("_meta", {}).get("january_mode_info", {}),
        "selection_stats": ctx.get("_meta", {}).get("selection_stats", {}),
        "momentum_stats": ctx.get("_meta", {}).get("momentum_stats", {}),
        "as_of": ctx["as_of"],
    }, indent=2, ensure_ascii=False))
    
    print("\n" + "=" * 70)
