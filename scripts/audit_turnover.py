#!/usr/bin/env python3
"""
Audit turnover satellites — baseline AVANT phase 3 modifs.

Mesure pour chaque profil (Stable, Modéré, Agressif, Agressif-Thematique,
Dividende-PEA/CTO) les entrées/sorties satellites entre snapshots PIT
quotidiens de data/portfolio_history/.

Output console + écrit docs/AUDIT_TURNOVER_baseline.md pour archive.

Usage :
    python3 scripts/audit_turnover.py
    python3 scripts/audit_turnover.py --days 30   # fenêtre rolling

Ne modifie aucun fichier de pipeline. Lecture seule sur portfolio_history.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
PORTFOLIOS_PATH = "data/portfolios.json"

PROFILES = ["Stable", "Modéré", "Agressif", "Agressif-Thematique",
            "Dividende-PEA", "Dividende-CTO"]
SECTIONS = ["Actions", "Crypto"]  # ETF/Bonds = statiques, pas d'intérêt turnover


def _git_log_commits(since: str | None = None, max_count: int = 50) -> list[tuple[str, str]]:
    """Liste (sha, date) des commits qui ont modifié portfolios.json."""
    cmd = ["git", "log", "--pretty=format:%H|%ad", "--date=format:%Y%m%d",
           f"-n{max_count}"]
    if since:
        cmd.insert(-1, f"--since={since}")
    cmd += ["--", PORTFOLIOS_PATH]
    out = subprocess.check_output(cmd, cwd=ROOT, text=True)
    rows = []
    for line in out.strip().split("\n"):
        if "|" not in line:
            continue
        sha, date = line.split("|", 1)
        rows.append((sha, date))
    # Inverser pour avoir chronologique
    rows.reverse()
    return rows


def _list_latest_per_day() -> list[tuple[str, str]]:
    """Pour chaque jour, retourne le dernier commit SHA (chronologique)."""
    commits = _git_log_commits(max_count=200)
    by_day: dict[str, str] = {}
    for sha, day in commits:
        # Dernier dans la liste pour ce jour (commits déjà chrono)
        by_day[day] = sha
    return sorted(by_day.items())  # (day, sha)


def _load_from_git(sha: str) -> dict:
    out = subprocess.check_output(
        ["git", "show", f"{sha}:{PORTFOLIOS_PATH}"],
        cwd=ROOT, text=True,
    )
    return json.loads(out)


def _extract_tickers(portfolio: dict, profile: str, section: str) -> set[str]:
    """Set des tickers présents dans Actions/Crypto d'un profil."""
    if profile not in portfolio:
        return set()
    section_data = portfolio[profile].get(section, {}) or {}
    out = set()
    for label in section_data:
        if "(" in label and label.endswith(")"):
            tk = label.rsplit("(", 1)[1].rstrip(")").strip()
        else:
            tk = label.strip()
        out.add(tk)
    return out


def measure(days_window: int = 0) -> dict:
    """Pour chaque (profil, section), mesure :
       - n_snapshots
       - sleeve_size moyen
       - n_unique_tickers vus
       - n_entrees, n_sorties (cumulé sur fenêtre)
       - turnover_rate = (entrees + sorties) / (2 * jours * sleeve_size moyen)
       - liste détaillée par jour
    """
    days = _list_latest_per_day()
    if days_window > 0:
        days = days[-days_window:]
    if len(days) < 2:
        return {"error": "pas assez de snapshots"}

    results: dict = {
        "window": {
            "n_days": len(days),
            "from": days[0][0],
            "to": days[-1][0],
        },
        "by_profile": {},
    }

    snapshots = []
    for day, sha in days:
        try:
            snapshots.append((day, _load_from_git(sha)))
        except (subprocess.CalledProcessError, json.JSONDecodeError):
            continue
    if len(snapshots) < 2:
        return {"error": "pas assez de snapshots valides"}

    for profile in PROFILES:
        for section in SECTIONS:
            tickers_per_day: list[set[str]] = []
            for _, pf in snapshots:
                tickers_per_day.append(_extract_tickers(pf, profile, section))
            # Skip si section vide partout
            if all(len(t) == 0 for t in tickers_per_day):
                continue

            transitions = []
            all_seen: set[str] = set()
            n_entries, n_exits = 0, 0
            sizes = []
            for i in range(1, len(tickers_per_day)):
                prev, curr = tickers_per_day[i-1], tickers_per_day[i]
                entered = curr - prev
                exited = prev - curr
                if entered or exited:
                    transitions.append({
                        "from_day": snapshots[i-1][0],
                        "to_day": snapshots[i][0],
                        "entered": sorted(entered),
                        "exited": sorted(exited),
                    })
                n_entries += len(entered)
                n_exits += len(exited)
                all_seen |= prev | curr
                sizes.append(len(curr))
            sizes.append(len(tickers_per_day[0]))

            avg_size = sum(sizes) / len(sizes) if sizes else 0
            n_days = len(tickers_per_day)
            # Turnover annualized: (entries + exits) / (2 * avg_size * n_days) * 365
            if avg_size > 0 and n_days > 1:
                turnover_per_day = (n_entries + n_exits) / (2 * avg_size * (n_days - 1))
                turnover_annual = turnover_per_day * 365
            else:
                turnover_per_day = 0
                turnover_annual = 0

            key = f"{profile}/{section}"
            results["by_profile"][key] = {
                "n_snapshots": len(tickers_per_day),
                "avg_sleeve_size": round(avg_size, 2),
                "n_unique_tickers": len(all_seen),
                "n_entries": n_entries,
                "n_exits": n_exits,
                "turnover_per_day_pct": round(turnover_per_day * 100, 2),
                "turnover_annual_pct": round(turnover_annual * 100, 1),
                "n_transitions": len(transitions),
                "transitions": transitions[-10:],  # dernières 10 pour readability
            }

    return results


def render_markdown(results: dict, out_path: Path):
    w = results.get("window", {})
    lines = [
        "# Audit turnover satellites — baseline phase 3",
        "",
        f"_Généré le {datetime.now().strftime('%Y-%m-%d %H:%M')} via "
        "`scripts/audit_turnover.py`._",
        "",
        f"**Fenêtre** : {w.get('from','?')} → {w.get('to','?')} "
        f"({w.get('n_days','?')} snapshots)",
        "",
        "## Synthèse par profil/section",
        "",
        "| Profil/Section | Sleeve | Uniques vus | Entrées | Sorties | Turnover/j | Turnover/an |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for key, s in results.get("by_profile", {}).items():
        lines.append(
            f"| {key} | {s['avg_sleeve_size']} | {s['n_unique_tickers']} | "
            f"{s['n_entries']} | {s['n_exits']} | {s['turnover_per_day_pct']}% | "
            f"**{s['turnover_annual_pct']}%** |"
        )
    lines.append("")
    lines.append("> **Turnover/an** = (entrées + sorties) / (2 × sleeve moyen × n_jours) × 365")
    lines.append("> _100% annuel ≈ remplacement complet du sleeve une fois par an._")
    lines.append("")

    lines.append("## Dernières transitions par profil")
    lines.append("")
    for key, s in results.get("by_profile", {}).items():
        trs = s.get("transitions", [])
        if not trs:
            continue
        lines.append(f"### {key} ({len(trs)} dernières transitions)")
        lines.append("")
        lines.append("| Jour précédent | Jour | Entrées | Sorties |")
        lines.append("|---|---|---|---|")
        for tr in trs:
            lines.append(
                f"| {tr['from_day']} | {tr['to_day']} | "
                f"{', '.join(tr['entered']) or '—'} | "
                f"{', '.join(tr['exited']) or '—'} |"
            )
        lines.append("")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=0,
                    help="fenêtre rolling en jours (0 = tous les snapshots)")
    ap.add_argument("--out", default="docs/AUDIT_TURNOVER_baseline.md")
    args = ap.parse_args()

    results = measure(days_window=args.days)
    if "error" in results:
        print(f"ERROR: {results['error']}")
        return 1

    out_path = ROOT / args.out
    out_path.parent.mkdir(exist_ok=True)
    render_markdown(results, out_path)

    # Print synthèse console
    w = results["window"]
    print(f"\n=== Audit turnover {w['from']} → {w['to']} ({w['n_days']} snapshots) ===\n")
    print(f"{'Profil/Section':30s} {'Sleeve':>7s} {'Entr':>5s} {'Sort':>5s} {'TO/an':>8s}")
    for key, s in results["by_profile"].items():
        print(f"{key:30s} {s['avg_sleeve_size']:>7.1f} "
              f"{s['n_entries']:>5d} {s['n_exits']:>5d} "
              f"{s['turnover_annual_pct']:>7.1f}%")
    print(f"\n→ Rapport détaillé : {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
