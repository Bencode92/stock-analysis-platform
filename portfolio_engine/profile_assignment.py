"""
Phase Sélection-4 — Coherence-driven profile assignment.

Problème adressé : Le système actuel attribue les actions au profil qui les
sélectionne en premier (Agressif rafle AAPL, GOOG, ASML car gate permissif).
Conséquence : Modéré récupère le "second tier" alors qu'il devrait avoir
les mega-caps quality.

Solution : pour chaque action, calculer un `fit_score` par profil basé sur
ses caractéristiques fondamentales (vol, ROE, dividend, growth, Buffett).
L'action est attribuée au profil où son `fit_score` est maximal.

Approche conceptuelle :
  - Stable    : low vol + high dividend + strong coverage + quality solide
  - Modéré    : Buffett haut + ROE solide + vol modérée (Goldilocks 18-30%) + quality
  - Agressif  : momentum fort + vol élevée + growth + croissance EPS

Pour chaque (action, profil), `fit_score ∈ [0, 1]`. Action allouée au
profil avec le `fit_score` le plus élevé (profile_native).

Inspiré du « multi-criteria coherence ranking » + assignment heuristique
(version simplifiée du Hungarian algorithm pour cas multi-action/profil).
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

logger = logging.getLogger("portfolio_engine.profile_assignment")


# ============================================================================
# Normalisation helpers
# ============================================================================

def _safe_float(v, default: float = 0.0) -> float:
    """Convertit en float, retourne default si None/NaN."""
    if v is None:
        return default
    try:
        f = float(v)
        if f != f:  # NaN
            return default
        return f
    except (ValueError, TypeError):
        return default


def _normalize_high(value: float, target: float, cap: float = 1.0) -> float:
    """Score qui croît vers 1 quand value approche target. Au-delà = saturé.
    Ex : value=20, target=25 → 0.80. value=30, target=25 → 1.0 (saturé)."""
    if target <= 0:
        return 0.5
    if value <= 0:
        return 0.0
    return min(cap, value / target)


def _normalize_low(value: float, target: float, max_val: float, cap: float = 1.0) -> float:
    """Score qui décroît à mesure que value s'éloigne de la cible (low is good).
    Ex : vol=15, target=15 → 1.0. vol=30, target=15, max=50 → 0.57."""
    if value <= target:
        return cap
    if value >= max_val:
        return 0.0
    return max(0.0, cap * (max_val - value) / (max_val - target))


def _normalize_target_band(value: float, low: float, high: float) -> float:
    """Score qui = 1 dans la bande [low, high], décroît linéairement en dehors.
    Ex : vol=25, band=[20,30] → 1.0. vol=15, band=[20,30] → 0.5."""
    if low <= value <= high:
        return 1.0
    if value < low:
        if value <= 0:
            return 0.0
        return max(0.0, value / low)
    # value > high
    over_range = high  # extend by same range
    if value >= high + over_range:
        return 0.0
    return max(0.0, 1.0 - (value - high) / over_range)


# ============================================================================
# Fit scores par profil
# ============================================================================

def fit_score_stable(stock: Dict) -> float:
    """Score d'adéquation pour profil Stable [0, 1].

    Caractéristiques recherchées :
      - Vol basse (cible 12-22 %, idéal ~15)
      - Dividend yield ≥ 2 % (cible 3.5 %)
      - Dividend coverage solide (≥ 1.5)
      - Buffett ≥ 70 (élite)
      - Quality safety subscore haut
      - Performance 3y stable, pas de chute violente
    """
    vol = _safe_float(stock.get("volatility_3y") or stock.get("vol_3y_pct"), 50)
    dy = _safe_float(stock.get("dividend_yield"), 0)
    dc = _safe_float(stock.get("dividend_coverage"), 0)
    buf = _safe_float(stock.get("buffett_score"), 0)
    qual = _safe_float(stock.get("quality_score"), 0)
    safety = _safe_float(stock.get("quality_safety_sub"), 50)
    perf3y = _safe_float(stock.get("perf_3y"), 0)
    payout = _safe_float(stock.get("payout_ratio"), 0)

    # Pondération
    score = (
        0.25 * _normalize_target_band(vol, 12, 22)            # vol basse
        + 0.20 * _normalize_high(dy, target=3.5)              # dividend
        + 0.15 * _normalize_high(dc, target=2.0)              # coverage
        + 0.15 * _normalize_high(buf, target=85, cap=1.0)     # Buffett élite
        + 0.10 * _normalize_high(safety, target=80)           # safety subscore
        + 0.10 * _normalize_target_band(perf3y, 0, 50)        # croissance modérée
        + 0.05 * _normalize_low(payout, target=50, max_val=100)  # payout raisonnable
    )
    return min(1.0, max(0.0, score))


def fit_score_modere(stock: Dict) -> float:
    """Score d'adéquation pour profil Modéré [0, 1].

    Caractéristiques recherchées :
      - Buffett haut (cible 80+) = qualité absolue
      - ROE solide (cible 20-30 %)
      - Quality_score peer-relative haut
      - Vol "Goldilocks" (cible 18-30 %, ni trop bas ni trop haut)
      - Perf 1y/3y positive mais pas extrême
      - Pas de drawdown long
    """
    vol = _safe_float(stock.get("volatility_3y") or stock.get("vol_3y_pct"), 50)
    buf = _safe_float(stock.get("buffett_score"), 0)
    qual = _safe_float(stock.get("quality_score"), 0)
    roe = _safe_float(stock.get("roe"), 0)
    roic = _safe_float(stock.get("roic"), 0)
    perf1y = _safe_float(stock.get("perf_1y"), 0)
    perf3y = _safe_float(stock.get("perf_3y"), 0)
    quality_growth_sub = _safe_float(stock.get("quality_growth_sub"), 50)

    score = (
        0.25 * _normalize_high(buf, target=90)                # Buffett dominant
        + 0.15 * _normalize_high(qual, target=80)             # Quality élevée
        + 0.15 * _normalize_high(roe, target=25)              # ROE solide
        + 0.10 * _normalize_high(roic, target=15)             # ROIC
        + 0.15 * _normalize_target_band(vol, 18, 32)          # Goldilocks vol
        + 0.10 * _normalize_target_band(perf1y, 10, 60)       # momentum modéré
        + 0.05 * _normalize_target_band(perf3y, 20, 150)      # croissance 3y modérée
        + 0.05 * _normalize_high(quality_growth_sub, target=70)  # growth quality
    )
    return min(1.0, max(0.0, score))


def fit_score_agressif(stock: Dict) -> float:
    """Score d'adéquation pour profil Agressif [0, 1].

    Caractéristiques recherchées :
      - Momentum fort (perf_1y ≥ 50 %, perf_3y ≥ 100 %)
      - Vol élevée (cible 35-70 %)
      - Croissance EPS forward forte
      - Quality minimum (Buffett ≥ 50, Quality ≥ 55)
      - Pas de pondération dividend (yield neutre)
    """
    vol = _safe_float(stock.get("volatility_3y") or stock.get("vol_3y_pct"), 0)
    buf = _safe_float(stock.get("buffett_score"), 0)
    qual = _safe_float(stock.get("quality_score"), 0)
    perf1y = _safe_float(stock.get("perf_1y"), 0)
    perf3y = _safe_float(stock.get("perf_3y"), 0)
    eps_growth_fwd = _safe_float(stock.get("eps_growth_forecast_5y"), 0)
    eps_surprise = _safe_float(stock.get("eps_surprise_last"), 0)

    score = (
        0.25 * _normalize_high(perf1y, target=80)             # momentum 1y
        + 0.20 * _normalize_high(perf3y, target=200)          # momentum 3y
        + 0.20 * _normalize_target_band(vol, 30, 65)          # vol élevée (mais pas extrême)
        + 0.15 * _normalize_high(eps_growth_fwd, target=15)   # growth attendue
        + 0.10 * _normalize_high(qual, target=70)             # quality minimum
        + 0.05 * _normalize_high(buf, target=70)              # Buffett baseline
        + 0.05 * _normalize_high(eps_surprise, target=15)     # PEAD factor
    )
    return min(1.0, max(0.0, score))


# ============================================================================
# Compute fit scores + native profile
# ============================================================================

PROFILE_FIT_FUNCTIONS = {
    "Stable": fit_score_stable,
    "Modéré": fit_score_modere,
    "Agressif": fit_score_agressif,
}


def compute_profile_native(stock: Dict) -> str:
    """Détermine le profil "natif" d'une action — celui où son fit_score est max.

    Args:
        stock: dict avec les caractéristiques fondamentales.

    Returns:
        Nom du profil natif ('Stable', 'Modéré', 'Agressif').
    """
    fits = {p: fn(stock) for p, fn in PROFILE_FIT_FUNCTIONS.items()}
    native = max(fits, key=fits.get)
    return native


def annotate_universe_with_fits(stocks: List[Dict]) -> None:
    """Annote chaque action avec :
       - `_fit_stable`, `_fit_modere`, `_fit_agressif` : scores per profil
       - `_profile_native` : profil au fit le plus haut
       - `_coherence` : différence entre fit native et 2e profil (= conviction)

    Modifie les dicts in-place.
    """
    for s in stocks:
        fits = {p: fn(s) for p, fn in PROFILE_FIT_FUNCTIONS.items()}
        s["_fit_stable"] = round(fits["Stable"], 4)
        s["_fit_modere"] = round(fits["Modéré"], 4)
        s["_fit_agressif"] = round(fits["Agressif"], 4)
        native = max(fits, key=fits.get)
        s["_profile_native"] = native
        sorted_fits = sorted(fits.values(), reverse=True)
        s["_coherence"] = round(sorted_fits[0] - sorted_fits[1], 4)


def get_native_candidates(
    stocks: List[Dict],
    profile: str,
    coherence_min: float = 0.0,
) -> List[Dict]:
    """Retourne les actions dont le profil natif == profile.

    Triées par fit_score décroissant (les plus alignées en premier).

    Args:
        stocks: univers complet annoté par annotate_universe_with_fits().
        profile: profil cible ('Stable', 'Modéré', 'Agressif').
        coherence_min: si > 0, exige une conviction min (fit_native - fit_2nd).

    Returns:
        list de stocks dont _profile_native == profile.
    """
    fit_key = {
        "Stable": "_fit_stable",
        "Modéré": "_fit_modere",
        "Agressif": "_fit_agressif",
    }.get(profile)
    if not fit_key:
        return []

    native = [
        s for s in stocks
        if s.get("_profile_native") == profile
        and s.get("_coherence", 0) >= coherence_min
    ]
    native.sort(key=lambda s: s.get(fit_key, 0), reverse=True)
    return native


def get_eligible_non_native(
    stocks: List[Dict],
    profile: str,
    min_fit: float = 0.3,
) -> List[Dict]:
    """Retourne les actions ÉLIGIBLES pour ce profil mais NON natives.

    Utile comme fallback si le pool natif est insuffisant.
    """
    fit_key = {
        "Stable": "_fit_stable",
        "Modéré": "_fit_modere",
        "Agressif": "_fit_agressif",
    }.get(profile)
    if not fit_key:
        return []

    non_native = [
        s for s in stocks
        if s.get("_profile_native") != profile
        and s.get(fit_key, 0) >= min_fit
    ]
    non_native.sort(key=lambda s: s.get(fit_key, 0), reverse=True)
    return non_native


# ============================================================================
# Diagnostic / Log helpers
# ============================================================================

def log_assignment_summary(stocks: List[Dict]) -> Dict[str, int]:
    """Log la distribution des profils natifs + retourne le comptage."""
    counts = {"Stable": 0, "Modéré": 0, "Agressif": 0}
    for s in stocks:
        native = s.get("_profile_native")
        if native in counts:
            counts[native] += 1
    logger.info(
        f"[Profile-native assignment] Stable={counts['Stable']}, "
        f"Modéré={counts['Modéré']}, Agressif={counts['Agressif']} "
        f"(total {sum(counts.values())}/{len(stocks)} stocks)"
    )
    return counts


def get_top_by_profile(
    stocks: List[Dict], profile: str, top_n: int = 20
) -> List[Dict]:
    """Top N actions pour un profil (parmi les natives, triées par fit)."""
    return get_native_candidates(stocks, profile)[:top_n]
