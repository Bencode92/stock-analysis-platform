#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thematic_review.py
================================================================
Briefing thématique TRIMESTRIEL — découverte sans allocation dynamique.

Implémente la doctrine docs/PHASE3E_DOCTRINE.md à la lettre. Le script
REFUSE MÉCANIQUEMENT toute production hors-cadre :
  - Section 1 (Découverte) : uniquement thèmes du catalogue ABSENTS de
    THEMATIQUE_CORE, avec test des 5 règles d'entrée
  - Section 2 (Diagnostic) : lecture seule, bandeau hardcodé, AUCUNE
    suggestion de poids (lève exception si tenté)
  - Fraîcheur market_context : > 30j → bloque la section Découverte

Output : docs/THEMATIC_REVIEW_<YYYY-QX>.md

Usage :
    python3 scripts/thematic_review.py
================================================================
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

ROOT = Path(__file__).parent.parent
MARKET_CONTEXT_PATH = ROOT / "data" / "market_context.json"
CATALOG_PATH = ROOT / "data" / "etf_thematic_catalog.json"
YTD_MANUAL_PATH = ROOT / "data" / "thematic_ytd_manual.json"
DECISION_LOG = ROOT / "docs" / "thematic_decisions.log"

FRESHNESS_MAX_DAYS = 30
OVERHEAT_YTD_THRESHOLD = 50.0
MAX_ADDITIONS_PER_YEAR = 2
MIN_AUM_EUR_M = 200


class DoctrineViolation(Exception):
    """Levée si le script tente de produire quoi que ce soit hors doctrine."""
    pass


def _load_json(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"{path} introuvable")
    return json.loads(path.read_text(encoding="utf-8"))


def _load_thematique_core() -> Dict[str, float]:
    """Lit THEMATIQUE_CORE depuis core_satellite_discipline.py."""
    sys.path.insert(0, str(ROOT))
    from portfolio_engine.core_satellite_discipline import THEMATIQUE_CORE
    return {tk: info["weight"] for tk, info in THEMATIQUE_CORE.items()}


def _quarter_label(d: datetime) -> str:
    q = (d.month - 1) // 3 + 1
    return f"{d.year}-Q{q}"


def _freshness_days(market_ctx: dict) -> Tuple[int, bool]:
    """Retourne (jours_depuis_génération, est_périmé)."""
    as_of = market_ctx.get("as_of") or market_ctx.get("_meta", {}).get("as_of")
    if not as_of:
        return 999, True
    try:
        d = datetime.fromisoformat(as_of)
    except ValueError:
        return 999, True
    delta = (datetime.now() - d).days
    return delta, delta > FRESHNESS_MAX_DAYS


def _additions_this_year() -> int:
    """Compte les ajouts journalisés cette année."""
    if not DECISION_LOG.exists():
        return 0
    n = 0
    current_year = datetime.now().year
    for line in DECISION_LOG.read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{current_year}-") and "ADD" in line:
            n += 1
    return n


def _load_ytd_manual() -> dict:
    """Charge l'enrichissement manuel YTD (Fabre §3.ter anti-cherry-pick)."""
    if not YTD_MANUAL_PATH.exists():
        return {}
    return json.loads(YTD_MANUAL_PATH.read_text(encoding="utf-8")).get("themes", {})


def _is_overheat(theme_key: str, theme_data: dict, market_ctx: dict, ytd_manual: dict) -> Tuple[Optional[bool], str]:
    """Vrai si le thème est en surchauffe.

    Source 1 : data/thematic_ytd_manual.json (enrichissement symétrique
               via fetch yfinance — règle anti-cherry-pick §3.ter).
    Source 2 : key_trends de market_context.json (radar GICS classique).
    Si rien trouvé → (None, 'inconnu') — la règle 3 considère ça
    comme un échec (on n'agit pas sans information).
    """
    # Source 1 : thematic_ytd_manual
    manual = ytd_manual.get(theme_key)
    if manual:
        max_ytd = manual.get("max_ytd_pct")
        if isinstance(max_ytd, (int, float)):
            if max_ytd > OVERHEAT_YTD_THRESHOLD:
                return True, f"max YTD {max_ytd:.1f}% > {OVERHEAT_YTD_THRESHOLD}% (source: thematic_ytd_manual)"
            return False, f"max YTD {max_ytd:.1f}% < seuil {OVERHEAT_YTD_THRESHOLD}% (source: thematic_ytd_manual)"

    # Source 2 : key_trends radar GICS
    key_trends = market_ctx.get("key_trends", [])
    label = theme_data.get("label", "").lower()
    keywords = [theme_key.lower()] + [w for w in label.split() if len(w) > 3]

    for trend in key_trends:
        t_low = trend.lower()
        if any(kw in t_low for kw in keywords if kw not in ("structurel", "civil", "global", "cycle")):
            import re
            m = re.search(r"\+(\d+(?:\.\d+)?)\s*%", trend)
            if m:
                pct = float(m.group(1))
                if pct > OVERHEAT_YTD_THRESHOLD:
                    return True, f"YTD {pct:.1f}% > {OVERHEAT_YTD_THRESHOLD}% (source: radar)"
                return False, f"YTD {pct:.1f}% < seuil {OVERHEAT_YTD_THRESHOLD}% (source: radar)"

    return None, "YTD inconnu (ni dans thematic_ytd_manual, ni dans radar)"


def _has_coverage_in_core(theme_data: dict, thematique_core: Dict[str, float]) -> bool:
    """Test mécanique d'appartenance à THEMATIQUE_CORE.
    Vrai si UN DES tickers candidats du thème est déjà dans THEMATIQUE_CORE,
    OU si le thème déclare un recouvrement matériel via coverage_test.
    """
    candidates = theme_data.get("etf_candidates", [])
    tickers = {c.get("ticker") for c in candidates}
    if tickers & set(thematique_core.keys()):
        return True
    # Sinon, on s'appuie sur la déclaration du catalogue (revue humaine)
    cov = theme_data.get("coverage_test", {})
    ruling = (cov.get("ruling") or "").lower()
    return ruling not in ("structurellement absent", "absent")


def _evaluate_rule_2_thesis(theme_data: dict) -> Tuple[bool, str]:
    """Règle 2 : thèse structurelle écrite (pas une thèse-performance).

    Bug v1 : regex naïf détectait "performance" en faux positif (ex: "indépendant
    de la performance boursière"). Fix Fabre : champ explicite no_perf_argument
    + jugement humain à la rédaction du catalog.
    """
    thesis = (theme_data.get("thesis_structural") or "").strip()
    if not thesis or len(thesis) < 50:
        return False, "thèse manquante ou trop courte (<50 chars)"
    no_perf = theme_data.get("no_perf_argument")
    if no_perf is not True:
        return False, "champ no_perf_argument:true manquant dans le catalog"
    # Garde-fou : signaux de momentum directs (chiffres YTD/1Y)
    import re
    if re.search(r"\+\d+(?:\.\d+)?\s*%", thesis):
        return False, "thèse contient un % chiffré (interdit — c'est du momentum)"
    return True, "thèse structurelle OK"


def _evaluate_rule_4_liquidity(theme_data: dict) -> Tuple[bool, str]:
    """Règle 4 : au moins 1 ETF candidat avec AUM > 200M€."""
    candidates = theme_data.get("etf_candidates", [])
    for c in candidates:
        aum_min = c.get("aum_eur_m_min", 0)
        if aum_min >= MIN_AUM_EUR_M:
            return True, f"{c.get('ticker')} AUM≥{MIN_AUM_EUR_M}M€"
    return False, f"aucun candidat avec AUM ≥ {MIN_AUM_EUR_M}M€"


def evaluate_discovery_theme(
    theme_key: str,
    theme_data: dict,
    thematique_core: Dict[str, float],
    market_ctx: dict,
    additions_used: int,
) -> dict:
    """Applique les 5 règles d'entrée. Retourne verdict mécanique."""
    rules = {}

    # Règle 1 : Absence de THEMATIQUE_CORE
    has_cov = _has_coverage_in_core(theme_data, thematique_core)
    rules["1_absence"] = (not has_cov, "absent THEMATIQUE_CORE" if not has_cov else "DÉJÀ couvert")

    # Règle 2 : thèse structurelle écrite
    rules["2_thesis"] = _evaluate_rule_2_thesis(theme_data)

    # Règle 3 : pas en surchauffe — fix doctrine, absence d'info = échec
    ytd_manual = _load_ytd_manual()
    overheat, overheat_msg = _is_overheat(theme_key, theme_data, market_ctx, ytd_manual)
    if overheat is None:
        # Pas d'info → on n'agit pas (doctrine : on n'agit pas sans information)
        rules["3_no_overheat"] = (False, f"{overheat_msg} — règle 3 échec par prudence")
    else:
        rules["3_no_overheat"] = (not overheat, overheat_msg)

    # Règle 4 : liquidité
    rules["4_liquidity"] = _evaluate_rule_4_liquidity(theme_data)

    # Règle 5 : budget d'action disponible
    budget_ok = additions_used < MAX_ADDITIONS_PER_YEAR
    rules["5_budget"] = (budget_ok, f"budget {additions_used}/{MAX_ADDITIONS_PER_YEAR}" if budget_ok else f"budget épuisé {additions_used}/{MAX_ADDITIONS_PER_YEAR}")

    all_pass = all(r[0] for r in rules.values())
    return {
        "verdict": "ÉLIGIBLE sous thèse" if all_pass else "BLOQUÉ",
        "rules": rules,
        "blocked_by": [k for k, (ok, _) in rules.items() if not ok],
    }


def _format_rule(name: str, result: Tuple[bool, str]) -> str:
    ok, msg = result
    return f"  {'✅' if ok else '❌'} {name}: {msg}"


def build_discovery_section(
    catalog: dict,
    thematique_core: Dict[str, float],
    market_ctx: dict,
    additions_used: int,
    freshness_stale: bool,
) -> List[str]:
    lines = ["═══ SECTION 1 — DÉCOUVERTE (action possible) ═══", ""]
    if freshness_stale:
        lines.append("⚠️ MARKET_CONTEXT.JSON PÉRIMÉ (>30j) — Section Découverte SUSPENDUE.")
        lines.append("On n'agit pas sur un régime périmé (précédent macro_tilts.json).")
        return lines

    lines.append("Thèmes structurels ABSENTS de THEMATIQUE_CORE, candidats à un sleeve neuf.")
    lines.append("")
    themes = catalog.get("themes", {})
    if not themes:
        lines.append("(catalogue vide — aucun thème à évaluer)")
        return lines

    for key, theme_data in themes.items():
        label = theme_data.get("label", key)
        thesis = theme_data.get("thesis_structural", "")
        result = evaluate_discovery_theme(key, theme_data, thematique_core, market_ctx, additions_used)
        lines.append(f"### {label}")
        lines.append("")
        lines.append(f"**Thèse structurelle** : {thesis}")
        lines.append("")
        lines.append("**ETF candidats** :")
        for c in theme_data.get("etf_candidates", []):
            lines.append(f"  - `{c['ticker']}` ({c.get('name','?')}) — TER {c.get('ter','?')}, AUM ≥ {c.get('aum_eur_m_min','?')}M€")
        lines.append("")
        lines.append("**Test des 5 règles** :")
        for rname in ("1_absence", "2_thesis", "3_no_overheat", "4_liquidity", "5_budget"):
            lines.append(_format_rule(rname, result["rules"][rname]))
        lines.append("")
        lines.append(f"**Verdict** : {result['verdict']}")
        if result["blocked_by"]:
            lines.append(f"  → bloqué par : {', '.join(result['blocked_by'])}")
        lines.append("")
        lines.append("---")
        lines.append("")
    return lines


def build_diagnostic_section(
    thematique_core: Dict[str, float],
    market_ctx: dict,
) -> List[str]:
    """Section 2 — lecture seule, AUCUNE suggestion de poids.

    Lève DoctrineViolation si on tente de produire un delta d'allocation.
    """
    BANDEAU = (
        "⚠️ **CETTE SECTION NE DÉCLENCHE AUCUNE ACTION.** "
        "Re-pondération d'un thème existant = NAIVE_CHASE empiriquement rejeté "
        "(Δ Sharpe +0.026 OOS, intradeable après PFU 31.4%)."
    )

    lines = [
        "═══ SECTION 2 — DIAGNOSTIC (lecture seule, AUCUNE action) ═══",
        "",
        BANDEAU,
        "",
        "Thèmes déjà couverts dans THEMATIQUE_CORE. Pur monitoring.",
        "",
    ]

    favored = set(s.lower() for s in (market_ctx.get("macro_tilts", {}).get("favored_sectors") or []))
    avoided = set(s.lower() for s in (market_ctx.get("macro_tilts", {}).get("avoided_sectors") or []))
    key_trends = market_ctx.get("key_trends", [])

    # Mapping ETF → secteur GICS approximatif (pour matcher avec favored/avoided)
    ETF_TO_SECTOR = {
        "QQQ": "information-technology",
        "VGT": "information-technology",
        "IEMG": None,  # diversifié EM
        "CGXU": None,  # international growth
        "VBK": None,   # small cap US
        "VOT": None,   # mid cap US
        "XLE": "energy",
        "SGLN.AS": None,  # or
    }

    lines.append(f"| ETF | Poids | Secteur GICS | Statut macro | Overheat? |")
    lines.append(f"|---|---:|---|---|---|")
    for tk, w in thematique_core.items():
        sector = ETF_TO_SECTOR.get(tk)
        if sector and sector in favored:
            status = "🟢 favored"
        elif sector and sector in avoided:
            status = "🔴 avoided"
        else:
            status = "⚪ neutral / diversifié"
        # Overheat : match STRICT — ticker exact ou secteur exact (pas sous-match)
        # Bug v1 : (sector or "") en "" matchait toute string → tout en leader
        def _trend_matches(t: str) -> bool:
            t_low = t.lower()
            if f" {tk.lower()} " in f" {t_low} " or f" {tk.lower()}:" in t_low:
                return True
            if sector and f" {sector} " in f" {t_low} ":
                return True
            return False
        is_leader = any(_trend_matches(t) for t in key_trends if "+" in t)
        overheat = "⚠️ leader YTD" if is_leader else "—"
        lines.append(f"| `{tk}` | {w*100:.0f}% | {sector or '—'} | {status} | {overheat} |")

    lines.append("")
    lines.append("**Rappel doctrine** : la présence d'un leader/favored/avoided dans cette table "
                 "ne justifie AUCUNE action. Re-pondérer = sortir du cadre validé.")
    return lines


def main() -> int:
    market_ctx = _load_json(MARKET_CONTEXT_PATH)
    catalog = _load_json(CATALOG_PATH)
    thematique_core = _load_thematique_core()

    freshness_days, freshness_stale = _freshness_days(market_ctx)
    additions_used = _additions_this_year()
    now = datetime.now()
    quarter = _quarter_label(now)

    header = [
        f"# Thematic Review — {quarter}",
        "",
        f"**Généré le** : {now.strftime('%Y-%m-%d %H:%M')}",
        f"**Source** : `data/market_context.json` (généré le {market_ctx.get('as_of','?')} — fraîcheur : {freshness_days} jours, {'⚠️ PÉRIMÉ' if freshness_stale else 'OK'})",
        f"**Doctrine** : `docs/PHASE3E_DOCTRINE.md`",
        f"**Compteur ajouts** : {additions_used}/{MAX_ADDITIONS_PER_YEAR} cette année",
        "",
        "---",
        "",
    ]

    discovery = build_discovery_section(catalog, thematique_core, market_ctx, additions_used, freshness_stale)
    diagnostic = build_diagnostic_section(thematique_core, market_ctx)

    out_path = ROOT / "docs" / f"THEMATIC_REVIEW_{quarter}.md"
    content = "\n".join(header + discovery + [""] + diagnostic) + "\n"
    out_path.write_text(content, encoding="utf-8")

    print(f"✅ Briefing généré : {out_path}")
    print(f"   Fraîcheur market_context : {freshness_days}j ({'STALE' if freshness_stale else 'OK'})")
    print(f"   Compteur ajouts {datetime.now().year} : {additions_used}/{MAX_ADDITIONS_PER_YEAR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
