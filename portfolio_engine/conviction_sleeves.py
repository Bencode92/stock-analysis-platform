#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
conviction_sleeves.py — construit un "sleeve de conviction" par thème du funnel.

DOCTRINE (cf docs/PHASE3E_DOCTRINE.md + mémoire projet) :
  - La conviction FILTRE (qui, quel véhicule), elle ne PONDÈRE JAMAIS.
  - Le poids d'un sleeve = plafond profil (allocation_rules.thematic_caps_pct), FIXE.
    Jamais indexé sur le rang funnel ni sur un momentum (zone NAIVE_CHASE rejetée OOS).
  - "Précis" = le bon maillon value-chain (amont/enabler : ASML pas Nvidia), pas le timing.
  - Anti-piège : veto durabilité (grade D ou mirage), null = neutre (jamais veto l'inconnu).

STANDALONE : `python portfolio_engine/conviction_sleeves.py [profil]`
  → n'écrit rien, n'injecte rien dans le générateur. Affiche seulement le rendu.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# --- mapping thème funnel -> clé de plafond (allocation_rules). JUGEMENT éditable, PAS doctrine. ---
THEME_CAP_MAP = {
    "semi": "semi", "ai_infra": "ai_infra",
    "defense": "defense_aero", "materials": "materials_mining",
    "nuclear": "green_transition",  # nucléaire civil = transition bas-carbone (pas d'entrée dédiée)
    "grid": "industrials",          # équipementiers réseau = industrials
    "robotics": "industrials",      # robotique / automation = industrials
    "emerging": None,               # bucket géographique, pas un sleeve value-chain
}
# thème funnel -> thème catalogue ETF validé (etf_thematic_catalog, ETF discipliné)
THEME_CATALOG_MAP = {
    "defense": "defense_global", "nuclear": "nuclear_uranium", "materials": "transition_metals",
}
# gate qualité (approx du gate live preset_meta) + seuils
GATE_BUFFETT_MIN = 60
GATE_QUALITY_MIN = 55


def _load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def _num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"-?\d+(?:[.,]\d+)?", str(v).replace(" ", ""))
    return float(m.group().replace(",", ".")) if m else None


def _durability_index():
    """Map d'entité -> durabilité, par ticker ET par nom (fallback). Depuis stocks_*.json."""
    by_t, by_n = {}, {}
    for f in ("stocks_us.json", "stocks_europe.json", "stocks_asia.json"):
        try:
            j = _load(f)
        except FileNotFoundError:
            continue
        arr = j if isinstance(j, list) else j.get("stocks", [])
        for s in arr:
            d = {"g": s.get("durability_grade"), "mir": s.get("durability_mirage"),
                 "sc": s.get("durability_score")}
            t = s.get("ticker")
            if t and t not in by_t:
                by_t[t] = d
            for k in (s.get("name"), s.get("name_api")):
                if k:
                    by_n[k.upper()] = d
    return by_t, by_n


def _pick_etf(theme_key, catalog):
    """ETF pour le thème : d'abord catalogue validé (UCITS d'abord), sinon suggestion funnel."""
    ck = THEME_CATALOG_MAP.get(theme_key)
    if ck and ck in catalog.get("themes", {}):
        cands = catalog["themes"][ck].get("etf_candidates", [])
        # UCITS d'abord (investisseur EU) : nom "UCITS" ou région hors-US
        ucits = [c for c in cands if "UCITS" in (c.get("name") or "") or c.get("region") != "US"]
        c = (ucits or cands or [None])[0]
        if c:
            return {"symbol": c["ticker"], "name": c["name"], "source": "catalogue validé"}
    return None  # pas d'ETF discipliné ; l'appelant retombera sur framework.etf_buy


def build_theme_sleeve(theme, profile, dur_by_t, dur_by_n, rules, catalog):
    """Retourne le sleeve d'un thème pour un profil, ou None si non éligible."""
    key = theme.get("key")
    cap_key = THEME_CAP_MAP.get(key)
    if cap_key is None:
        return {"key": key, "label": theme.get("label"), "eligible": False,
                "reason": "bucket géographique / pas de sleeve value-chain"}
    caps = rules.get("thematic_caps_pct", {}).get(cap_key, {})
    target = _num(caps.get(profile))
    if not target:
        return {"key": key, "label": theme.get("label"), "eligible": False,
                "reason": f"pas de plafond {cap_key}/{profile}"}
    pos_max = _num((rules.get("position_max_per_profile") or {}).get(profile)) or 12.0
    pos_min = _num((rules.get("position_minimum_pct") or {}).get(profile)) or 2.0

    # --- surchauffe (PHASE3E règle 3) : YTD du thème > seuil catalogue -> gel de l'ajout ETF ---
    overheat_thr = _num(catalog.get("_overheat_ytd_threshold")) or 50.0
    ytd = _num((theme.get("etf_signal") or {}).get("ytd"))
    overheated = ytd is not None and ytd > overheat_thr

    # --- ETF disponible ? catalogue validé, sinon suggestion funnel (etf_buy) ---
    etf = _pick_etf(key, catalog)
    if not etf:
        eb = theme.get("etf_buy") or {}
        if eb.get("symbol") and eb["symbol"] != "—":
            etf = {"symbol": eb["symbol"], "name": eb.get("name", ""), "source": "funnel (non discipliné)"}
    has_etf = etf is not None

    # --- contenu DIRECT : enablers funnel, en ordre de maillon (amont d'abord), gate + veto, dédup ---
    holdings, dropped, seen = [], [], set()
    for mi, m in enumerate(theme.get("maillons", [])):
        for c in m.get("companies", []):
            tk = c.get("ticker")
            if not tk or tk in seen:
                continue
            seen.add(tk)
            mm = c.get("m") or {}
            b, q = _num(mm.get("buffett")), _num(mm.get("quality"))
            gate_ok = (b is not None and b >= GATE_BUFFETT_MIN) or (q is not None and q >= GATE_QUALITY_MIN)
            d = dur_by_t.get(tk) or dur_by_n.get((c.get("name") or "").upper()) or {"g": None, "mir": None}
            veto = d["g"] == "D" or d["mir"] is True
            row = {"ticker": tk, "name": c.get("name"), "role": c.get("role"),
                   "maillon": mi + 1, "maillon_label": m.get("label"),
                   "buffett": b, "quality": q, "dur": d["g"], "dur_sc": d.get("sc"),
                   "mirage": bool(d["mir"])}
            if not gate_ok:
                row["drop"] = "gate qualité (données manquantes ou faible)"
                dropped.append(row)
            elif veto:
                row["drop"] = "veto durabilité (" + ("grade D" if d["g"] == "D" else "mirage") + ")"
                dropped.append(row)
            else:
                holdings.append(row)

    # (b) CAPACITÉ : plus de titres que de places → garder les plus SOLIDES d'abord
    # (durabilité desc, null=neutre 50). Tri STABLE → à durabilité égale, l'ordre de maillon
    # (amont d'abord) tranche. C'est un tiebreak de CAPACITÉ, jamais une pondération de rendement.
    holdings.sort(key=lambda r: (r["dur_sc"] if r["dur_sc"] is not None else 50), reverse=True)
    # borne le nb de titres pour que chacun >= pos_min : n_max = target // pos_min.
    n_max = max(1, int(target // pos_min))
    kept = holdings[:n_max]
    overflow = holdings[n_max:]

    # --- POLITIQUE DE VÉHICULE (adaptative, cf tableau) ---
    if not has_etf:
        vehicle, why = "direct", "aucun ETF pur → direct obligatoire"
    elif overheated:
        vehicle, why = ("direct", f"ETF gelé (surchauffe YTD {ytd:.0f}%>{overheat_thr:.0f}%)") \
            if profile == "Agressif" else ("frozen", f"thème gelé (surchauffe YTD {ytd:.0f}%)")
    elif profile == "Agressif":
        if len(kept) < 3:
            vehicle, why = "ETF (repli)", f"conviction directe trop mince ({len(kept)} titre(s)) → filet ETF"
        else:
            vehicle, why = "direct", "agressif → précision enablers en direct"
    else:
        vehicle, why = "ETF", "profil non-agressif → ETF large (zéro risque mono-titre)"

    # poids — ② sleeve mince (<3 titres) : dénominateur plancher à 3 → il SOUS-REMPLIT son plafond
    # au lieu de forcer 15% dans 2 noms. Le solde retourne au satellite générique / autres thèmes.
    if vehicle.startswith("direct"):
        n = len(kept)
        denom = max(n, 3)
        w = round(min(target / denom, pos_max), 2) if n else 0.0
        for r in kept:
            r["weight"] = w
        positions, allocated = kept, round(n * w, 2)
    elif vehicle == "frozen":
        positions, allocated = [], 0.0
    else:  # ETF ou repli ETF
        etf["weight"] = round(target, 2)
        positions, allocated = [], round(target, 2)

    return {"key": key, "label": theme.get("label"), "eligible": True,
            "profile": profile, "cap_key": cap_key, "target_pct": round(target, 2),
            "allocated_pct": allocated,
            "survives_ai": theme.get("survives_ai"), "ytd": ytd, "overheated": overheated,
            "vehicle": vehicle, "vehicle_why": why, "etf": etf,
            "holdings": positions, "overflow": overflow, "dropped": dropped}


def _fmt(sl):
    out = []
    if not sl.get("eligible"):
        return f"  ⊘ {sl['label']:<40} — {sl['reason']}"
    head = (f"══ {sl['label']}  [{sl['key']}]  cap {sl['cap_key']} {sl['target_pct']}%"
            f" | survives_ai:{sl['survives_ai']}"
            + (f" | ⚠ SURCHAUFFE YTD {sl['ytd']:.0f}%" if sl['overheated'] else ""))
    out.append(head)
    fill = ""
    if sl["vehicle"].startswith("direct") and sl["allocated_pct"] < sl["target_pct"]:
        fill = f"  [rempli {sl['allocated_pct']}% / plafond {sl['target_pct']}% — sleeve mince, solde rendu]"
    out.append(f"   VÉHICULE → {sl['vehicle'].upper()}  ({sl['vehicle_why']}){fill}")
    if sl["vehicle"].startswith("ETF") or (sl["vehicle"] == "direct" and sl["etf"]):
        e = sl["etf"]
        if e:
            tag = f"{e.get('weight','')}%" if "weight" in e else "(dispo, non retenu)"
            out.append(f"   ETF: {e['symbol']} — {e['name'][:44]}  [{e['source']}]  {tag}")
    circ = "①②③④⑤⑥⑦⑧"
    for r in sl["holdings"]:
        mnum = circ[r["maillon"] - 1] if 1 <= r["maillon"] <= len(circ) else str(r["maillon"])
        out.append(f"     ✓ {r['ticker']:<6}{(r['name'] or '')[:24]:<25}{r['weight']:>5}%"
                   f"  B{r['buffett']} Q{r['quality']} dur:{r['dur'] or '-'}"
                   f"   {mnum}  {(r['role'] or '')[:30]}")
    if sl["overflow"]:
        out.append("     · au-delà du plafond de titres (place prise par l'amont) : "
                   + ", ".join(r["ticker"] for r in sl["overflow"]))
    for r in sl["dropped"]:
        out.append(f"     ✗ {r['ticker']:<6}{(r['name'] or '')[:24]:<25}      "
                   f"B{r['buffett']} Q{r['quality']} dur:{r['dur'] or '-'}"
                   f"{'M' if r['mirage'] else ''}  → {r['drop']}")
    return "\n".join(out)


def main():
    profile = sys.argv[1] if len(sys.argv) > 1 else "Agressif"
    fw = _load("framework.json")
    rules = _load("allocation_rules.json")
    catalog = _load("etf_thematic_catalog.json")
    dur_by_t, dur_by_n = _durability_index()
    print(f"\n### SLEEVES DE CONVICTION — profil {profile} ###")
    print("(standalone : lecture seule, aucune injection dans le générateur)\n")
    total = 0.0
    for theme in fw.get("themes", []):
        sl = build_theme_sleeve(theme, profile, dur_by_t, dur_by_n, rules, catalog)
        print(_fmt(sl), "\n")
        if sl.get("eligible"):
            total += sl.get("allocated_pct", 0.0)
    print(f"→ Enveloppe thématique RÉELLEMENT allouée (avant caps globaux) : {total:.0f}% du portefeuille {profile}")
    print("  (chaque poids = plafond profil FIXE ou sous-rempli si mince ; caps globaux/corrélation ensuite)")


if __name__ == "__main__":
    main()
