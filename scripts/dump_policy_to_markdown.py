#!/usr/bin/env python3
"""
Dump PROFILE_POLICY -> markdown.

Source de vérité unique : ce script lit `portfolio_engine.preset_meta` et
produit `docs/PROFILE_POLICY.md` listant pour chaque profil les bands, gates,
hard_filters et score_weights réellement appliqués par le pipeline.

Usage :
    python3 scripts/dump_policy_to_markdown.py

Sortie : docs/PROFILE_POLICY.md (overwrite)
"""
import json
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))

from portfolio_engine.preset_meta import (
    PROFILE_POLICY,
    PROFILE_BUCKET_TARGETS,
    STOCK_REGION_CAPS,
    RELAX_PROFILE_LIMITS,
    Role,
)


def fmt_pct(v):
    if v is None:
        return "—"
    if isinstance(v, (int, float)):
        if abs(v) < 1.5:
            return f"{v*100:+.1f}%" if v != 0 else "0%"
        return f"{v:+.1f}"
    return str(v)


def render_score_weights(weights: dict) -> str:
    """Tableau markdown trié par |poids| décroissant + cumul."""
    abs_total = sum(abs(v) for v in weights.values() if v != 0)
    sorted_w = sorted(
        [(k, v) for k, v in weights.items() if v != 0],
        key=lambda x: -abs(x[1]),
    )
    lines = [
        "| Facteur | Poids | % absolu | Cumul |",
        "|---|---:|---:|---:|",
    ]
    cum = 0.0
    for k, v in sorted_w:
        pct = abs(v) / abs_total * 100 if abs_total else 0
        cum += pct
        lines.append(f"| `{k}` | {v:+.3f} | {pct:.1f}% | {cum:.1f}% |")
    return "\n".join(lines)


def render_hard_filters(hf: dict) -> str:
    if not hf:
        return "_(aucun filtre dur)_"
    lines = ["| Filtre | Valeur |", "|---|---:|"]
    for k, v in sorted(hf.items()):
        lines.append(f"| `{k}` | {v} |")
    return "\n".join(lines)


def render_buckets(profile: str) -> str:
    buckets = PROFILE_BUCKET_TARGETS.get(profile)
    if not buckets:
        return "_(non défini)_"
    lines = ["| Bucket | Min | Max |", "|---|---:|---:|"]
    for role, (mn, mx) in buckets.items():
        lines.append(f"| {role.value} | {mn*100:.0f}% | {mx*100:.0f}% |")
    return "\n".join(lines)


def render_region_caps(profile: str) -> str:
    caps = STOCK_REGION_CAPS.get(profile)
    if not caps:
        return "_(non défini)_"
    lines = ["| Région | Cap |", "|---|---:|"]
    for r, v in sorted(caps.items()):
        lines.append(f"| {r} | {v*100:.0f}% |")
    return "\n".join(lines)


def render_relax_limits(profile: str) -> str:
    limits = RELAX_PROFILE_LIMITS.get(profile)
    if not limits:
        return "_(aucune limite spécifique — limites globales s'appliquent)_"
    lines = ["| Paramètre | Plancher/Plafond |", "|---|---:|"]
    for k, v in sorted(limits.items()):
        lines.append(f"| `{k}` | {v} |")
    return "\n".join(lines)


def main(out_path: Path):
    sections = [
        "# PROFILE_POLICY — source de vérité",
        "",
        f"_Généré le {datetime.now().strftime('%Y-%m-%d %H:%M')} depuis "
        "`portfolio_engine/preset_meta.py`._",
        "",
        "Toute divergence entre ce document et un brief/audit doit être tranchée "
        "en faveur du code. Régénérer ce fichier après toute modification de "
        "`PROFILE_POLICY` :",
        "",
        "```bash",
        "python3 scripts/dump_policy_to_markdown.py",
        "```",
        "",
    ]

    main_profiles = ["Stable", "Modéré", "Agressif"]
    other_profiles = [p for p in PROFILE_POLICY if p not in main_profiles]

    sections.append("## Vue synthétique — profils principaux")
    sections.append("")
    sections.append(
        "| Profil | Gate | min_buffett | min_quality | Vol band | Equity weight |"
    )
    sections.append("|---|---|---:|---:|---|---|")
    for prof in main_profiles:
        pol = PROFILE_POLICY.get(prof, {})
        hf = pol.get("hard_filters", {})
        vol_min = hf.get("volatility_3y_min", "—")
        vol_max = hf.get("volatility_3y_max", "—")
        gate = pol.get("gate_logic", "or").upper()
        eq_min = pol.get("equity_min_weight", 0) * 100
        eq_max = pol.get("equity_max_weight", 0) * 100
        sections.append(
            f"| **{prof}** | {gate} | {pol.get('min_buffett_score','—')} | "
            f"{pol.get('min_quality_gate','—')} | {vol_min} – {vol_max} | "
            f"{eq_min:.0f}–{eq_max:.0f}% |"
        )
    sections.append("")

    for prof in main_profiles:
        pol = PROFILE_POLICY.get(prof)
        if not pol:
            continue
        sections.append(f"## {prof}")
        sections.append("")
        sections.append(f"_{pol.get('description', '')}_")
        sections.append("")
        sections.append(f"**Vol attendue (cible)** : {pol.get('expected_vol_range', '—')}")
        sections.append("")

        sections.append("### Gates qualité")
        sections.append("")
        sections.append(f"- `min_buffett_score` : **{pol.get('min_buffett_score','—')}**")
        sections.append(f"- `min_quality_gate` : **{pol.get('min_quality_gate','—')}**")
        sections.append(f"- `gate_logic` : **{pol.get('gate_logic', 'or').upper()}**")
        presets = sorted(pol.get("allowed_equity_presets", []))
        sections.append(f"- `allowed_equity_presets` : {', '.join(f'`{p}`' for p in presets)}")
        sections.append("")

        sections.append("### Hard filters")
        sections.append("")
        sections.append(render_hard_filters(pol.get("hard_filters", {})))
        sections.append("")

        sections.append("### Score weights (pondération du fit_score)")
        sections.append("")
        sections.append(render_score_weights(pol.get("score_weights", {})))
        sections.append("")

        sections.append("### Bucket targets (allocation par rôle)")
        sections.append("")
        sections.append(render_buckets(prof))
        sections.append("")

        sections.append("### Region caps")
        sections.append("")
        sections.append(render_region_caps(prof))
        sections.append("")

        sections.append("### Limites de relaxation")
        sections.append("")
        sections.append(render_relax_limits(prof))
        sections.append("")

    if other_profiles:
        sections.append("## Autres profils")
        sections.append("")
        for prof in other_profiles:
            pol = PROFILE_POLICY[prof]
            sections.append(f"### {prof}")
            sections.append("")
            sections.append(f"_{pol.get('description', '')}_")
            sections.append("")
            sections.append(f"- `min_buffett_score` : {pol.get('min_buffett_score','—')}")
            sections.append(f"- `min_quality_gate` : {pol.get('min_quality_gate','—')}")
            sections.append("")
            sections.append("**Hard filters**")
            sections.append("")
            sections.append(render_hard_filters(pol.get("hard_filters", {})))
            sections.append("")
            if pol.get("score_weights"):
                sections.append("**Score weights**")
                sections.append("")
                sections.append(render_score_weights(pol["score_weights"]))
                sections.append("")

    content = "\n".join(sections) + "\n"
    out_path.write_text(content, encoding="utf-8")
    print(f"✅ Wrote {out_path} ({len(content)} bytes)")


if __name__ == "__main__":
    root = Path(__file__).parent.parent
    docs = root / "docs"
    docs.mkdir(exist_ok=True)
    main(docs / "PROFILE_POLICY.md")
