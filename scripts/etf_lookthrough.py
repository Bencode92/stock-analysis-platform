#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
etf_lookthrough.py — exposition AGRÉGÉE (transparence) à travers le compte ETF thématique.

Répond au ⏳ de la revue expert : quelle est ma vraie expo Taïwan / Nvidia / ASML / TSMC une fois
qu'on regarde À TRAVERS les ETF (cœur + sleeves) ? Alerte si Taïwan > 6 % ou un titre > 4 %.

Données de composition, par ordre de priorité :
  1) CSV réels par ETF dans data/etf_lookthrough/<TICKER>.csv  (colonnes: name,country,weight_pct)
  2) sinon, compositions ILLUSTRATIVES ci-dessous (ordres de grandeur — À REMPLACER par les vrais holdings).

Lecture : `python3 scripts/etf_lookthrough.py`  (lit data/portfolios_split.json)
"""
import csv, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
HOLD_DIR = os.path.join(DATA, "etf_lookthrough")

TAIWAN_CAP = 6.0        # plafond agrégé écrit (revue expert)
NAME_CAP = 4.0          # plafond par titre unique

# --- Compositions ILLUSTRATIVES (poids EN % DANS l'ETF). Ordres de grandeur ex-mémoire, NON vérifiés.
# Ne listent que les contributeurs matériels (Taïwan + méga-caps) ; le reste est ignoré pour ces mesures.
# Déposer data/etf_lookthrough/<TICKER>.csv pour écraser par les vrais holdings émetteur.
ILLUSTRATIVE = {
    "EQQQ": [("NVIDIA", "US", 8.4), ("Apple", "US", 8.0), ("Microsoft", "US", 7.5), ("Broadcom", "US", 4.5)],
    "EIMI": [("TSMC", "Taiwan", 9.0), ("Tencent", "China", 3.5), ("Samsung", "Korea", 3.0),
             ("_autres_Taiwan", "Taiwan", 11.0)],  # Taïwan total ~20 % de l'EM IMI
    "SMH":  [("NVIDIA", "US", 10.0), ("TSMC", "Taiwan", 10.0), ("ASML", "Netherlands", 11.0),
             ("Broadcom", "US", 8.0), ("AMD", "US", 5.0)],
    "FGEQ": [("NVIDIA", "US", 1.0), ("_Taiwan_divers", "Taiwan", 1.0)],
    "ISPY": [("_Taiwan_divers", "Taiwan", 2.0)],
    "URNM": [], "WDEF": [], "COPX": [], "SGLN.AS": [], "FGEQ.L": [],
}
TRACK_NAMES = ["NVIDIA", "ASML", "TSMC"]  # titres à suivre nommément


def _load_account():
    p = json.load(open(os.path.join(DATA, "portfolios_split.json"), encoding="utf-8"))
    key = next((k for k in p if k.endswith("-ThematiqueETF")), None)
    if not key:
        raise SystemExit("Compte ETF introuvable dans portfolios_split.json (lancer `... split`).")
    etf = p[key]["ETF"]
    return key, {tk: float(str(v["allocation"]).replace("%", "").replace(",", ".")) for tk, v in etf.items()}


def _composition(ticker):
    """Vrais holdings (CSV) si présents, sinon illustratifs. Retourne [(name,country,weight_in_etf)]."""
    fp = os.path.join(HOLD_DIR, ticker + ".csv")
    if os.path.exists(fp):
        rows = []
        with open(fp, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                w = r.get("weight_pct") or r.get("weight") or 0
                rows.append((r.get("name", "?"), r.get("country", "?"), float(str(w).replace(",", "."))))
        return rows, "réel"
    return ILLUSTRATIVE.get(ticker, []), "illustratif"


def main():
    key, account = _load_account()
    total = sum(account.values())
    taiwan = 0.0
    names = {}
    src_used = set()
    print(f"### LOOK-THROUGH — {key}  (compte ETF = {total:.0f} %)\n")
    for tk, w in account.items():
        comp, src = _composition(tk)
        src_used.add(src)
        for nm, country, cw in comp:
            contrib = w * cw / 100.0
            if str(country).strip().lower() in ("taiwan", "taïwan", "tw"):
                taiwan += contrib
            base = nm.upper()
            for tracked in TRACK_NAMES:
                if tracked in base:
                    names[tracked] = names.get(tracked, 0.0) + contrib

    def flag(v, cap):
        return f"  ⛔ > {cap:.0f} %" if v > cap else f"  ✓ < {cap:.0f} %"
    print(f"Exposition TAÏWAN agrégée : {taiwan:.2f} %{flag(taiwan, TAIWAN_CAP)}")
    print("Titres suivis (exposition agrégée, look-through) :")
    for nm in TRACK_NAMES:
        v = names.get(nm, 0.0)
        print(f"   {nm:<8} {v:.2f} %{flag(v, NAME_CAP)}")
    src = "+".join(sorted(src_used))
    print(f"\nSource composition : {src}", end="")
    if "illustratif" in src_used:
        print("  ⚠ chiffres ILLUSTRATIFS (ordres de grandeur) — déposer les CSV holdings réels dans data/etf_lookthrough/ pour valider.")
    else:
        print()


if __name__ == "__main__":
    main()
