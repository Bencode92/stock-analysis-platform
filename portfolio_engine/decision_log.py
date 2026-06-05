"""Decision Log — journal de décision daté du pipeline.

v6.15 (2026-06-04) — Priorité #4 selon Claude externe :
  "À chaque génération, logge non seulement les POIDS mais POURQUOI (quel
   fit_score, quel DR, quel MaxDD estimé). Dans 2 ans, face à ton portefeuille,
   tu sauras ce que tu pensais en juin 2026. C'est ce qui te permettra de juger
   ta PROPRE compétence — pas le marché, toi."

Format : un fichier par run dans data/decision_log/log_<TIMESTAMP>.json
Contenu :
  - Métadonnées du run (version, date, params)
  - Pour chaque profil :
      * Composition finale (ticker → weight + rationale)
      * Diagnostics : pool size, candidats screened, top N, fit moyen
      * Discipline appliquée (caps, budgets)
  - Cohérence cross-profile (overlap entre profils)
"""
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

ROOT = Path(__file__).parent.parent
LOG_DIR = ROOT / "data" / "decision_log"


def _summarize_profile(profile: str, positions: List[Dict],
                       pool_diag: Optional[Dict] = None) -> Dict:
    """Résume les décisions prises pour un profil."""
    if not positions:
        return {"profile": profile, "n_positions": 0}

    core = [p for p in positions if p.get("role") == "core"]
    sat = [p for p in positions if p.get("role") == "satellite"]

    core_total = sum(p.get("weight", 0) for p in core)
    sat_total = sum(p.get("weight", 0) for p in sat)

    # Détail satellite : fit_score + tier_compliance (v6.20) + tout le contexte
    satellite_detail = []
    for p in sat:
        entry = {
            "ticker": p.get("ticker"),
            "name": (p.get("name") or "")[:40],
            "weight_pct": round(p.get("weight", 0) * 100, 2),
            "country": p.get("country"),
            "sector": p.get("sector"),
            "industry": p.get("industry", ""),
            "buffett_score": p.get("buffett_score"),
            "quality_score": p.get("quality_score"),
            "volatility_3y": p.get("volatility_3y"),
            "perf_1y": p.get("perf_1y"),
            "dividend_yield": p.get("dividend_yield"),
            "roe": p.get("roe"),
            "fit_score": p.get("fit_score"),
            "source": p.get("_source", "top_natifs"),
            "rationale": "top fit_score parmi les candidats après hard filters",
        }
        # Propage tier_compliance si présent (v6.20)
        if p.get("tier_compliance"):
            entry["tier_compliance"] = p["tier_compliance"]
        satellite_detail.append(entry)

    # Détail cœur : juste ticker + poids + source (filler vs v4)
    core_detail = []
    for p in core:
        core_detail.append({
            "ticker": p.get("ticker"),
            "name": (p.get("name") or "")[:40],
            "weight_pct": round(p.get("weight", 0) * 100, 2),
            "source": p.get("source", "core_filler_canonique"),
            "rationale": "cœur UCITS broad canonique, hardcoded pour stabilité β cible",
        })

    summary = {
        "profile": profile,
        "n_positions": len(positions),
        "n_core": len(core),
        "n_satellite": len(sat),
        "weight_core_pct": round(core_total * 100, 2),
        "weight_satellite_pct": round(sat_total * 100, 2),
        "total_weight_pct": round((core_total + sat_total) * 100, 2),
        "core_positions": core_detail,
        "satellite_positions": satellite_detail,
    }

    if pool_diag:
        summary["pool_diagnostics"] = pool_diag

    return summary


PROFILE_FILTERS = {
    "Stable":   {"buf_min": 70, "qual_min": 70, "vol_min": 12, "vol_max": 22, "roe_min": 8,  "div_min": 1.5},
    "Modéré":   {"buf_min": 65, "qual_min": 65, "vol_min": 12, "vol_max": 45, "roe_min": 8,  "div_min": 0.0},
    "Agressif": {"buf_min": 60, "qual_min": 55, "vol_min": 22, "vol_max": 75, "roe_min": 0,  "div_min": 0.0},
    "Agressif-Thematique": {"buf_min": 65, "qual_min": 55, "vol_min": 30, "vol_max": 90, "roe_min": 0, "div_min": 0.0},
}

FIT_KEY_BY_PROFILE = {
    "Stable":   "_fit_stable",
    "Modéré":   "_fit_modere",
    "Agressif": "_fit_agressif",
    "Agressif-Thematique": "_fit_agressif",
}


def _check_tier_compliance(stock: Dict, profile: str) -> Dict:
    """Renvoie un dict {tier_1: bool/why, tier_2: ..., tier_3: ..., tier_4: ...}
    expliquant pourquoi cette action passe (ou pas) les 4 tiers du profil."""
    flt = PROFILE_FILTERS.get(profile, PROFILE_FILTERS["Modéré"])
    buf = stock.get("buffett_score") or 0
    qual = stock.get("quality_score") or 0
    vol = stock.get("volatility_3y") or 0
    return {
        "tier_1_qualite_absolue": {
            "ok": buf >= flt["buf_min"],
            "actual": f"Buffett {buf:.0f}",
            "threshold": f"≥ {flt['buf_min']}",
        },
        "tier_2_qualite_relative": {
            "ok": qual >= flt["qual_min"],
            "actual": f"Quality {qual:.0f}",
            "threshold": f"≥ {flt['qual_min']}",
        },
        "tier_3_risk_alignment": {
            "ok": flt["vol_min"] <= vol <= flt["vol_max"],
            "actual": f"Vol {vol:.0f}%",
            "threshold": f"{flt['vol_min']}-{flt['vol_max']}%",
        },
        # Tier 4 = diversification, vérifié au niveau panier (pas par stock)
    }


def _load_universe_for_alternatives() -> List[Dict]:
    """Charge et annote l'univers complet pour calculer les alternatives non prises."""
    try:
        from portfolio_engine.profile_assignment import annotate_universe_with_fits
    except ImportError:
        from .profile_assignment import annotate_universe_with_fits
    all_stocks = []
    root = Path(__file__).parent.parent
    for fname in ("stocks_us.json", "stocks_europe.json", "stocks_asia.json"):
        p = root / "data" / fname
        if not p.exists():
            continue
        try:
            d = json.load(open(p))
            s_list = d.get("stocks", []) if isinstance(d, dict) else d
            all_stocks.extend(s_list)
        except Exception:
            pass
    if all_stocks:
        annotate_universe_with_fits(all_stocks)
    return all_stocks


def _get_alternatives_for_profile(profile: str, retained_tickers: set,
                                    all_stocks: List[Dict], n_alternatives: int = 10) -> List[Dict]:
    """Pour un profil, retourne les top N candidats qui PASSENT les filtres
    mais N'ONT PAS été retenus. Permet d'expliquer 'pourquoi pas X'."""
    flt = PROFILE_FILTERS.get(profile, PROFILE_FILTERS["Modéré"])
    fit_key = FIT_KEY_BY_PROFILE.get(profile, "_fit_modere")

    candidates = []
    for s in all_stocks:
        tk = s.get("ticker") or s.get("symbol")
        if not tk or tk in retained_tickers:
            continue
        buf = s.get("buffett_score") or 0
        qual = s.get("quality_score") or 0
        vol = s.get("volatility_3y") or 0
        # Tier 1+2+3 doivent passer pour être une "alternative valide"
        if buf < flt["buf_min"] or qual < flt["qual_min"]:
            continue
        if vol < flt["vol_min"] or vol > flt["vol_max"]:
            continue
        candidates.append({
            "ticker": tk,
            "name": (s.get("name") or "")[:40],
            "country": s.get("country") or "",
            "sector": s.get("sector") or "",
            "industry": (s.get("industry") or "")[:30],
            "buffett_score": buf,
            "quality_score": qual,
            "volatility_3y": vol,
            "roe": s.get("roe"),
            "dividend_yield": s.get("dividend_yield"),
            "perf_1y": s.get("perf_1y"),
            "fit_score": s.get(fit_key),
            "_profile_native": s.get("_profile_native"),
            # Raison probable du rejet (sera affinée par le dashboard avec contexte secteur)
            "rejection_reason": "fit_score plus bas que les retenus OU secteur déjà saturé (max 1-2 par secteur GICS)",
        })

    # Tri par fit_score décroissant
    candidates.sort(key=lambda x: -(x.get("fit_score") or 0))
    return candidates[:n_alternatives]


def log_decision(portfolios_data: Dict,
                 pipeline_version: str = "v6.15",
                 extra_meta: Optional[Dict] = None) -> str:
    """Écrit un fichier journal pour un run de pipeline.

    Args:
        portfolios_data: dict {profile_name → profile_dict} produit par la discipline
        pipeline_version: tag de version (ex: "v6.15")
        extra_meta: méta supplémentaire à inclure

    Returns:
        Chemin du fichier journal écrit.
    """
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = LOG_DIR / f"log_{ts}.json"

    profile_summaries = {}
    all_tickers_by_profile = {}

    # v6.20 : charge l'univers une fois pour calculer les alternatives
    all_stocks_universe = _load_universe_for_alternatives()
    universe_by_ticker = {
        (s.get("ticker") or s.get("symbol")): s
        for s in all_stocks_universe
        if (s.get("ticker") or s.get("symbol"))
    }

    for profile in ("Stable", "Modéré", "Agressif", "Agressif-Thematique"):
        prof = portfolios_data.get(profile, {})
        meta = prof.get("_tickers_meta", {})
        if not meta:
            continue
        # Reconstruct positions list from _tickers_meta + ajoute tier_compliance
        positions = []
        for tk, m in meta.items():
            # Récupère les vraies données depuis l'univers (tier_compliance détaillé)
            universe_data = universe_by_ticker.get(tk, {})
            pos = {
                "ticker": tk,
                "name": m.get("name"),
                "weight": m.get("weight", 0),
                "role": m.get("role"),
                "industry": m.get("industry"),
                "country": m.get("country") or universe_data.get("country"),
                "sector": universe_data.get("sector") or universe_data.get("sector_api"),
                "buffett_score": m.get("buffett_score") or universe_data.get("buffett_score"),
                "quality_score": universe_data.get("quality_score"),
                "volatility_3y": universe_data.get("volatility_3y"),
                "roe": universe_data.get("roe"),
                "dividend_yield": universe_data.get("dividend_yield"),
                "perf_1y": universe_data.get("perf_1y"),
                "fit_score": m.get("fit_score"),
                "_source": m.get("_source"),
            }
            # Tier compliance — seulement pour actions (pas ETF)
            if m.get("category") == "Actions" and universe_data:
                pos["tier_compliance"] = _check_tier_compliance(universe_data, profile)
            positions.append(pos)
        profile_summaries[profile] = _summarize_profile(profile, positions)
        all_tickers_by_profile[profile] = set(meta.keys())

        # v6.20 : alternatives non retenues pour ce profil
        if all_stocks_universe:
            retained = set(meta.keys())
            alternatives = _get_alternatives_for_profile(
                profile, retained, all_stocks_universe, n_alternatives=10
            )
            profile_summaries[profile]["alternatives_non_retenues"] = alternatives

    # Overlap entre profils (utile si user cumule)
    overlaps = {}
    profiles_list = list(all_tickers_by_profile.keys())
    for i, p1 in enumerate(profiles_list):
        for p2 in profiles_list[i+1:]:
            common = all_tickers_by_profile[p1] & all_tickers_by_profile[p2]
            if common:
                overlaps[f"{p1}∩{p2}"] = sorted(common)

    payload = {
        "version": "decision_log_v1",
        "pipeline_version": pipeline_version,
        "timestamp_iso": datetime.now().isoformat(),
        "run_id": ts,
        "decision_log": {
            "rationale_global": (
                "Pipeline RADAR-neutralisé (walk-forward strict -0.11 OOS validé). "
                "Cœur UCITS broad statique pour stabilité β cible. "
                "Satellite dynamique par fit_score qualité (max 2/industry pour Principal, "
                "max 2/pays + 2/industry pour Agressif-Thematique). "
                "Décision Core-Satellite : timing factoriel rejeté, indexation cœur "
                "+ pari assumé sur qualité satellite."
            ),
            "key_constraints": {
                "MaxDD_tolere_user": "-30% à -40% selon definition (pire annee vs MaxDD intra)",
                "beta_cible_par_profil": {"Stable": 0.22, "Modéré": 0.61, "Agressif": 0.80},
                "satellite_budget_pct": {"Stable": 10, "Modéré": 20, "Agressif": 25, "Agressif-Thematique": 20},
                "cap_per_name_pct": 5,
                "cap_per_core_etf_pct": 50,
            },
            # v6.19 (2026-06-05) — Règles d'or à appliquer à chaque rebalance
            # Hiérarchie en 4 tiers (filtres + construction) ET règle de surveillance
            # Si jamais ce log est consulté dans 2-3 ans, ces règles doivent rester appliquées.
            "regles_de_selection_4_tiers": {
                "tier_1_qualite_absolue": "Buffett ≥ 60-70 selon profil (Stable 70 / Modéré 65 / Agressif 60)",
                "tier_2_qualite_relative": "Quality ≥ 60",
                "tier_3_risk_alignment": "Vol_3y dans la band du profil",
                "tier_4_diversification": "Max 1 secteur GICS L1 pour Stable, max 2 pour autres",
                "doctrine": "Buffett+Quality sont des FILTRES, pas une thèse. La diversification (tier 4) décide quoi va ensemble.",
            },
            "regle_or_n3_rebalance_checklist": {
                "principe": (
                    "À l'entrée : ANTI-MOMENTUM (achète qualité même en baisse, en solde). "
                    "À la sortie : VÉRIFICATION DU FONDAMENTAL (pas vente automatique sur la perf)."
                ),
                "checklist_rebalance_annuel": [
                    "1. Pour chaque ligne du portefeuille, regarder la perf 1 an actuelle.",
                    "2. Si perf < -30% sur 1 an : DÉCLENCHE une vérification du Buffett/Quality.",
                    "3. Comparer Buffett_actuel vs Buffett à l'entrée (consulter data/score_history/scores_<entrée>.json).",
                    "4. Si Buffett a chuté de >15 points OU si Quality < 50 désormais : le fondamental a CASSÉ → SORTIR.",
                    "5. Si Buffett/Quality tiennent (chute mineure ou stable) : l'action est en SOLDE → GARDER (achat additionnel si DCA).",
                    "6. La perf seule n'est JAMAIS un signal de vente — elle déclenche une vérification du fondamental.",
                ],
                "exception": "Si une action a fait > +200% sur 1 an, vérifier qu'elle ne dépasse pas le cap satellite 5%. Sinon, écrêter (vente partielle pour ramener à 5%) sans vendre tout.",
            },
        },
        "profiles": profile_summaries,
        "cross_profile_overlaps": overlaps,
        "extra_meta": extra_meta or {},
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    # v6.20 : copie aussi vers latest.json pour que le dashboard puisse le charger
    # automatiquement sans avoir besoin de lister le dossier côté serveur.
    latest_path = LOG_DIR / "latest.json"
    try:
        with open(latest_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"[decision_log] latest.json copy failed: {e}")

    logger.info(f"[decision_log] Run {ts} loggé → {output_path}")
    return str(output_path)


__all__ = ["log_decision", "LOG_DIR"]
