# tests/test_no_blocked_in_pools.py
"""
Phase 2 acceptance test — Fabre v3 critère C1.

Vérifie qu'aucun ticker `access: false` dans config/broker_access.json
n'apparaît dans data/portfolios.json après run du pipeline.

Couvre tous les chemins de sélection :
- core_satellite_discipline._get_top_natives_for_profile (Stable, Modéré, Agressif)
- core_satellite_discipline._get_top_thematic_satellite (Agressif-Thematique)
- Sleeves Dividende-PEA / Dividende-CTO

Justification : avant phase 2 le bug HEROMOTOCO→DECK (substitution non re-validée)
mettait des tickers bloqués/substituts douteux dans les portefeuilles. Le pré-filtrage
broker en amont (phase 2.1) doit éliminer ces tickers de tous les pools.
"""
from __future__ import annotations

import json
from pathlib import Path

try:
    import pytest  # type: ignore
except ImportError:
    pytest = None


ROOT = Path(__file__).parent.parent


def _skip(msg: str):
    if pytest is not None:
        pytest.skip(msg)
    print(f"SKIP: {msg}")


def _load_blocked_tickers() -> set[str]:
    cfg_path = ROOT / "config" / "broker_access.json"
    if not cfg_path.exists():
        return set()
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    access = cfg.get("access", {})
    return {tk for tk, ok in access.items() if ok is False}


def _load_portfolios() -> dict:
    p = ROOT / "data" / "portfolios.json"
    return json.loads(p.read_text(encoding="utf-8"))


def _extract_ticker(label: str) -> str:
    """Parse 'NAME (TICKER)' ou retourne tel quel."""
    if "(" in label and label.endswith(")"):
        return label.rsplit("(", 1)[1].rstrip(")").strip()
    return label.strip()


def _iter_portfolio_tickers(portfolios: dict):
    """Itère sur (profile, section, ticker) pour Actions/ETF/Obligations."""
    for prof_name, prof in portfolios.items():
        if prof_name.startswith("_") or not isinstance(prof, dict):
            continue
        for section in ("Actions", "ETF", "Obligations"):
            section_data = prof.get(section) or {}
            for label in section_data:
                yield prof_name, section, _extract_ticker(label)


def test_no_blocked_in_actions():
    blocked = _load_blocked_tickers()
    if not blocked:
        _skip("Aucun ticker bloqué dans broker_access.json")
        return

    portfolios = _load_portfolios()
    violations = []
    for prof_name, section, ticker in _iter_portfolio_tickers(portfolios):
        if section != "Actions":
            continue
        if ticker in blocked:
            violations.append((prof_name, ticker))

    assert not violations, (
        f"Tickers bloqués dans Actions : {violations}\n"
        "Le pré-filtrage broker (phase 2.1) doit éliminer ces tickers du pool "
        "AVANT T1 dans tous les chemins de sélection."
    )


def test_no_broker_substitution_field():
    """Phase 2.2 : apply_broker_access_substitution archivée → plus de clé _broker_substitutions."""
    portfolios = _load_portfolios()
    violations = []
    for prof_name, prof in portfolios.items():
        if prof_name.startswith("_") or not isinstance(prof, dict):
            continue
        if "_broker_substitutions" in prof:
            violations.append(prof_name)

    assert not violations, (
        f"Profils avec _broker_substitutions résiduel : {violations}\n"
        "La phase 2.2 doit avoir supprimé apply_broker_access_substitution()."
    )


def test_no_blocked_in_pools_all_paths():
    """Couvre les sleeves Dividende qui ne passent pas par _get_top_natives_for_profile."""
    blocked = _load_blocked_tickers()
    if not blocked:
        _skip("Aucun ticker bloqué")
        return

    portfolios = _load_portfolios()
    violations = []
    for prof_name, section, ticker in _iter_portfolio_tickers(portfolios):
        if ticker in blocked:
            violations.append((prof_name, section, ticker))

    assert not violations, (
        f"Tickers bloqués détectés : {violations}\n"
        "Tous les chemins de sélection (incl. Dividende-PEA, Dividende-CTO, "
        "Thematique) doivent appliquer le pré-filtrage broker."
    )
