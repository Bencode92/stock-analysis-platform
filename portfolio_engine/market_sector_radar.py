# portfolio_engine/market_sector_radar.py
"""
Market/Sector Radar v1.1 (Deterministic, Anti-overheat)
=======================================================

Objectif:
- Exploiter sectors.json + markets.json pour produire un market_context.json
  (format compatible avec le pipeline existant).
- Zéro GPT, règles fixes, auditable, AMF-compliant.

Règles (ajustées v1.1):
SECTEURS:
- avoided  : ytd < 0 (underperform)
- neutral  : ytd >= 50 (surchauffe → pas de pénalité, mais pas de bonus)
- favored  : 10 <= ytd <= 35  AND  daily >= -0.5  (sweet spot avec tolérance)
- neutral  : sinon

RÉGIONS (marchés/pays):
- Mêmes règles

Régime:
- risk-on  si >=60% des secteurs ont ytd > 0
- risk-off si >=60% des secteurs ont ytd < 0
- neutral sinon

Ajustements v1.1 vs v1.0:
- sweet_daily_min: 0 → -0.5 (tolérance bruit quotidien)
- smoothing_alpha: 0 → 0.3 (anti-whipsaw par défaut)
- overheat: avoided → NEUTRAL (un marché peut rester chaud longtemps)
- sweet_ytd_max: 40 → 35 (plus prudent)
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, asdict, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("portfolio_engine.market_sector_radar")


# -------------------- Rules --------------------

@dataclass(frozen=True)
class RadarRules:
    """
    Règles paramétrables pour la classification secteurs/régions.
    
    Ajustements v1.1:
    - daily_min abaissé pour tolérer le bruit
    - smoothing activé par défaut
    - overheat = neutre (pas avoided)
    """
    # Sweet spot (zone favorable)
    sweet_ytd_min: float = 10.0      # Min YTD pour être favored
    sweet_ytd_max: float = 35.0      # Max YTD (au-delà = potentiellement surchauffe)
    sweet_daily_min: float = -0.5    # Tolérance: un léger rouge n'exclut pas

    # Overheat threshold (>= ce seuil = neutre, PAS avoided)
    overheat_ytd_min: float = 50.0
    
    # Underperform (< ce seuil = avoided)
    underperform_ytd_max: float = 0.0

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
    tilt_avoided: float = -0.15      # -15% score pour avoided
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


# -------------------- Loaders --------------------

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


def load_sectors(data_dir: str) -> Dict[str, Dict[str, Any]]:
    """
    Charge sectors.json et retourne un dict normalisé.
    
    Format attendu:
    {
      "sectors": {
        "information-technology": [{"ytd_num":..., "change_num":...}, ...],
        ...
      }
    }
    
    Retour:
      {sector_key: {"ytd": float, "daily": float, "raw": {...}}}
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

    if isinstance(sectors_block, dict):
        for sector_name, entries in sectors_block.items():
            if not entries:
                continue
            
            entry = None
            if isinstance(entries, list) and entries:
                # Prendre l'entrée US si disponible, sinon la première
                entry = next(
                    (e for e in entries if isinstance(e, dict) and e.get("region") == "US"),
                    entries[0] if isinstance(entries[0], dict) else None
                )
            elif isinstance(entries, dict):
                entry = entries
            
            if entry and isinstance(entry, dict):
                ytd = _safe_num(
                    entry.get("ytd_num") or entry.get("_ytd_value") or entry.get("ytd"),
                    0.0
                )
                daily = _safe_num(
                    entry.get("change_num") or entry.get("_change_value") or entry.get("change") or entry.get("daily"),
                    0.0
                )
                key = normalize_sector(sector_name)
                out[key] = {"ytd": ytd, "daily": daily, "raw": entry}

    logger.info(f"✅ Chargé {len(out)} secteurs depuis {path}")
    return out


def load_markets(data_dir: str) -> Dict[str, Dict[str, Any]]:
    """
    Charge markets.json et retourne un dict normalisé par pays.
    
    Format attendu:
    {"indices": {"developed":[{country,...}], "asia":[...], ...}}
    
    Retour:
      {country_key: {"ytd": float, "daily": float, "raw": {...}}}
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
                    continue  # Déjà traité (évite doublons)
                
                ytd = _safe_num(
                    e.get("ytd_num") or e.get("_ytd_value") or e.get("ytd"),
                    0.0
                )
                daily = _safe_num(
                    e.get("change_num") or e.get("_change_value") or e.get("change") or e.get("daily"),
                    0.0
                )
                out[key] = {"ytd": ytd, "daily": daily, "raw": e}

    logger.info(f"✅ Chargé {len(out)} marchés/pays depuis {path}")
    return out


# -------------------- Classification --------------------

def classify(ytd: float, daily: float, rules: RadarRules) -> Tuple[str, str]:
    """
    Classifie un secteur/région selon les règles.
    
    Retourne: (classification, raison)
    
    v1.1 IMPORTANT: overheat = NEUTRAL (pas avoided)
    Un marché peut rester "chaud" longtemps (momentum).
    """
    # Underperform: YTD négatif → avoided
    if ytd < rules.underperform_ytd_max:
        return "avoided", "underperform"
    
    # Overheat: YTD très élevé → NEUTRAL (pas de bonus, pas de malus)
    if ytd >= rules.overheat_ytd_min:
        return "neutral", "overheat"
    
    # Sweet spot: YTD modéré + daily pas trop rouge → favored
    if (rules.sweet_ytd_min <= ytd <= rules.sweet_ytd_max 
        and daily >= rules.sweet_daily_min):
        return "favored", "sweet_spot"
    
    # Sinon: neutral
    return "neutral", "out_of_range"


def pick_lists(
    items: Dict[str, Dict[str, Any]],
    rules: RadarRules,
    max_favored: int,
    max_avoided: int,
) -> Tuple[List[str], List[str], List[Dict[str, Any]]]:
    """
    Applique la classification et retourne les listes favored/avoided.
    
    Retourne: (favored_list, avoided_list, diagnostics)
    
    - favored trié par YTD décroissant (meilleurs momentum d'abord)
    - avoided trié par YTD croissant (pires d'abord)
    """
    favored: List[Tuple[str, float, float, str]] = []
    avoided: List[Tuple[str, float, float, str]] = []
    neutral: List[Tuple[str, float, float, str]] = []
    diag: List[Dict[str, Any]] = []

    for key, data in items.items():
        ytd = _safe_num(data.get("ytd", 0.0), 0.0)
        daily = _safe_num(data.get("daily", 0.0), 0.0)
        
        classification, reason = classify(ytd, daily, rules)
        
        diag_entry = {
            "key": key,
            "ytd": round(ytd, 2),
            "daily": round(daily, 2),
            "classification": classification,
            "reason": reason,
        }
        diag.append(diag_entry)

        if classification == "favored":
            favored.append((key, ytd, daily, reason))
        elif classification == "avoided":
            avoided.append((key, ytd, daily, reason))
        else:
            neutral.append((key, ytd, daily, reason))

    # Tri: favored par YTD desc, avoided par YTD asc
    favored.sort(key=lambda x: x[1], reverse=True)
    avoided.sort(key=lambda x: x[1])

    return (
        [x[0] for x in favored[:max_favored]],
        [x[0] for x in avoided[:max_avoided]],
        diag,
    )


def compute_regime(
    sectors: Dict[str, Dict[str, Any]], 
    rules: RadarRules
) -> Tuple[str, float, str]:
    """
    Détermine le régime de marché basé sur la proportion de secteurs positifs/négatifs.
    
    Retourne: (regime, confidence, rationale)
    """
    if not sectors:
        return "neutral", 0.5, "no sector data available"

    total = len(sectors)
    pos = sum(1 for d in sectors.values() if _safe_num(d.get("ytd", 0.0), 0.0) > 0)
    neg = sum(1 for d in sectors.values() if _safe_num(d.get("ytd", 0.0), 0.0) < 0)

    pos_ratio = pos / total if total else 0.0
    neg_ratio = neg / total if total else 0.0

    if pos_ratio >= rules.risk_on_threshold:
        # Risk-on: majorité des secteurs en hausse
        conf = min(0.95, 0.70 + 0.25 * pos_ratio)
        return "risk-on", round(conf, 2), f"{pos}/{total} secteurs positifs ({pos_ratio:.0%})"
    
    if neg_ratio >= rules.risk_off_threshold:
        # Risk-off: majorité des secteurs en baisse
        conf = min(0.95, 0.70 + 0.25 * neg_ratio)
        return "risk-off", round(conf, 2), f"{neg}/{total} secteurs négatifs ({neg_ratio:.0%})"
    
    # Neutral: marché mixte
    return "neutral", 0.60, f"marché mixte: {pos} pos, {neg} neg / {total}"


# -------------------- Smoothing (anti-whipsaw) --------------------

def _smooth_list(
    old: List[str], 
    new: List[str], 
    alpha: float, 
    cap: int
) -> List[str]:
    """
    Lisse la transition entre ancienne et nouvelle liste.
    
    alpha=0 → tout nouveau
    alpha=1 → tout ancien
    alpha=0.3 → 30% ancien conservé, complété par nouveau
    """
    if alpha <= 0.0:
        return new[:cap]
    if alpha >= 1.0:
        return old[:cap]

    # Nombre d'éléments à conserver de l'ancien
    keep_old = int(round(alpha * cap))
    
    # Commencer avec les anciens éléments (stabilité)
    kept = old[:keep_old]
    
    # Compléter avec les nouveaux (si pas déjà présents)
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
    """
    Applique le smoothing si un ancien contexte existe et alpha > 0.
    """
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

    # Mettre à jour les métadonnées
    smoothed["_meta"] = dict(new_ctx.get("_meta", {}))
    smoothed["_meta"]["smoothing_applied"] = True
    smoothed["_meta"]["smoothing_alpha"] = alpha
    
    return smoothed


# -------------------- Public API --------------------

def generate_market_context_radar(
    data_dir: str = "data",
    rules: Optional[RadarRules] = None,
    save_to_file: bool = True,
    output_path: Optional[str] = None,
    previous_context_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Génère le contexte marché de manière déterministe (sans GPT).
    
    Args:
        data_dir: Répertoire contenant sectors.json et markets.json
        rules: Règles de classification (défaut: RadarRules())
        save_to_file: Sauvegarder en JSON
        output_path: Chemin de sortie (défaut: data/market_context.json)
        previous_context_path: Ancien contexte pour smoothing
    
    Returns:
        Dict compatible avec load_market_context() et apply_macro_tilts()
    """
    rules = rules or RadarRules()

    # Charger les données
    sectors = load_sectors(data_dir)
    markets = load_markets(data_dir)

    if not sectors and not markets:
        logger.warning("⚠️ Aucune donnée marché disponible, contexte neutre")
        return _get_fallback_context(rules)

    # Déterminer le régime
    regime, confidence, rationale = compute_regime(sectors, rules)

    # Classifier secteurs et régions
    favored_sectors, avoided_sectors, sector_diag = pick_lists(
        sectors, rules, rules.max_favored_sectors, rules.max_avoided_sectors
    )
    favored_regions, avoided_regions, region_diag = pick_lists(
        markets, rules, rules.max_favored_regions, rules.max_avoided_regions
    )

    # Construire le contexte
    ctx: Dict[str, Any] = {
        "market_regime": regime,
        "confidence": confidence,
        "as_of": datetime.now().strftime("%Y-%m-%d"),
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
            "model": "radar_deterministic_v1.1",
            "mode": "DATA_DRIVEN",
            "amf_compliant": True,
            "is_fallback": False,
            "rules": asdict(rules),
            "tilt_config": {
                "favored": rules.tilt_favored,
                "avoided": rules.tilt_avoided,
                "max_tactical": rules.tilt_max,
            },
            "diagnostics": {
                "sectors_loaded": len(sectors),
                "markets_loaded": len(markets),
                "sector_classifications": sector_diag[:20],  # Limiter pour lisibilité
                "region_classifications": region_diag[:20],
            },
        },
    }

    # Smoothing optionnel (anti-whipsaw)
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
        # Essayer de charger l'ancien contexte depuis le même chemin
        out_p = Path(output_path) if output_path else Path(data_dir) / "market_context.json"
        if out_p.exists():
            try:
                old_ctx = json.loads(out_p.read_text(encoding="utf-8"))
                logger.info(f"📊 Ancien contexte chargé pour smoothing: {out_p}")
            except Exception:
                pass

    ctx = maybe_smooth_context(old_ctx, ctx, rules)

    # Sauvegarder
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

    return ctx


def _extract_trends(
    sectors: Dict[str, Dict[str, Any]], 
    markets: Dict[str, Dict[str, Any]],
    rules: RadarRules
) -> List[str]:
    """Extrait les tendances clés."""
    trends = []
    
    # Top 3 secteurs par YTD
    sorted_sectors = sorted(
        sectors.items(), 
        key=lambda x: _safe_num(x[1].get("ytd", 0), 0), 
        reverse=True
    )
    if sorted_sectors:
        top = sorted_sectors[0]
        trends.append(f"Secteur leader: {top[0]} (+{_safe_num(top[1].get('ytd', 0), 0):.1f}% YTD)")
    
    # Top région
    sorted_markets = sorted(
        markets.items(),
        key=lambda x: _safe_num(x[1].get("ytd", 0), 0),
        reverse=True
    )
    if sorted_markets:
        top = sorted_markets[0]
        trends.append(f"Région leader: {top[0]} (+{_safe_num(top[1].get('ytd', 0), 0):.1f}% YTD)")
    
    # Compter secteurs en surchauffe
    overheat_count = sum(
        1 for d in sectors.values() 
        if _safe_num(d.get("ytd", 0), 0) >= rules.overheat_ytd_min
    )
    if overheat_count > 0:
        trends.append(f"{overheat_count} secteur(s) en zone de surchauffe (YTD ≥ {rules.overheat_ytd_min}%)")
    
    return trends


def _extract_risks(
    sectors: Dict[str, Dict[str, Any]], 
    markets: Dict[str, Dict[str, Any]],
    rules: RadarRules
) -> List[str]:
    """Extrait les risques identifiés."""
    risks = []
    
    # Secteurs en underperform
    underperform = [
        k for k, d in sectors.items() 
        if _safe_num(d.get("ytd", 0), 0) < rules.underperform_ytd_max
    ]
    if underperform:
        risks.append(f"Secteurs en difficulté: {', '.join(underperform[:3])}")
    
    # Régions en underperform
    underperform_regions = [
        k for k, d in markets.items()
        if _safe_num(d.get("ytd", 0), 0) < rules.underperform_ytd_max
    ]
    if underperform_regions:
        risks.append(f"Régions en difficulté: {', '.join(underperform_regions[:3])}")
    
    # Concentration (si peu de secteurs favored)
    favored_count = sum(
        1 for d in sectors.values()
        if (rules.sweet_ytd_min <= _safe_num(d.get("ytd", 0), 0) <= rules.sweet_ytd_max
            and _safe_num(d.get("daily", 0), 0) >= rules.sweet_daily_min)
    )
    if favored_count <= 2:
        risks.append("Concentration: peu de secteurs en zone favorable (rotation possible)")
    
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
            "model": "radar_deterministic_v1.1",
            "mode": "FALLBACK",
            "amf_compliant": True,
            "is_fallback": True,
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
    """
    Applique les tilts tactiques basés sur le market_context.
    
    Alternative à apply_macro_tilts() de market_context.py
    pour une application directe sans import circulaire.
    
    Returns:
        Tilt total (clampé à [-max_tactical, +max_tactical])
    """
    tilts = market_context.get("macro_tilts", {})
    cfg = market_context.get("_meta", {}).get("tilt_config", {})

    tilt_f = float(cfg.get("favored", 0.15))
    tilt_a = float(cfg.get("avoided", -0.15))
    tilt_max = float(cfg.get("max_tactical", 0.30))

    s = normalize_sector(sector)
    c = normalize_region(country)

    # Calculer tilt secteur
    sector_t = 0.0
    if s in tilts.get("favored_sectors", []):
        sector_t = tilt_f
    elif s in tilts.get("avoided_sectors", []):
        sector_t = tilt_a

    # Calculer tilt région
    region_t = 0.0
    if c in tilts.get("favored_regions", []):
        region_t = tilt_f
    elif c in tilts.get("avoided_regions", []):
        region_t = tilt_a

    # Clamp au budget max
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
        description="Génère market_context.json de manière déterministe (sans GPT)"
    )
    ap.add_argument("--data-dir", default="data", help="Répertoire des données")
    ap.add_argument("--output", default=None, help="Chemin de sortie")
    ap.add_argument("--previous", default=None, help="Ancien market_context.json pour smoothing")
    ap.add_argument("--smoothing", type=float, default=0.3, help="Alpha smoothing (0-1)")
    ap.add_argument("--no-save", action="store_true", help="Ne pas sauvegarder")
    args = ap.parse_args()

    print("=" * 60)
    print("🎯 MARKET/SECTOR RADAR v1.1 (Déterministe)")
    print("=" * 60)

    rules = RadarRules(smoothing_alpha=args.smoothing)

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
        "as_of": ctx["as_of"],
    }, indent=2, ensure_ascii=False))
    
    print("\n" + "=" * 60)
