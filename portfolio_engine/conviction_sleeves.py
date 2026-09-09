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


# stance structurelle (funnel `position`) → multiplicateur de cap DISCRET (bandes, cf doctrine).
# Décidée avec expert, discrète, documentée → « moins de X, plus de Y » en pas bornés.
# ⚠ Le `rank` (1-8) NE pilote JAMAIS un poids : rank→poids = re-classement momentum INTERDIT (backtest OOS).
STANCE_MULT = {"ACTIF": 1.0, "PROGRESSIF": 0.5, "SÉLECTIF": 0.5, "BORNÉ": 0.33, "VEILLE": 0.0}

# --- RÈGLE DE POIDS (revue expert) : BASE UNIFORME par profil × stance = LE poids du thème.
# La stance devient le SEUL levier (règle précise, gérable). Fini le double-comptage cap×stance.
# Ex Agressif : ACTIF 10 % · PROGRESSIF/SÉLECTIF 5 % · BORNÉ 3,3 % · VEILLE 0.
PROFILE_BASE = {"Agressif": 10.0, "Modéré": 6.0, "Stable": 3.0}
# Stance décidée hors funnel (expert+user) — à reporter dans framework.json `position` à terme.
STANCE_OVERRIDE = {"materials": "PROGRESSIF"}  # cuivre = proxy réseau de facto (survit IA + réseau)
# Véhicules UCITS retenus après revue expert (achetables par un particulier FR ; meilleur AUM/thèse).
ETF_OVERRIDE = {
    "nuclear": ("URNM", "Sprott Uranium Miners UCITS"),
    "semi": ("SMH", "VanEck Semiconductor UCITS (ASML/TSMC en tête)"),
    "defense": ("WDEF", "WisdomTree Europe Defence UCITS (EU pur)"),
    "materials": ("COPX", "Global X Copper Miners UCITS"),
}
# Sleeve(s) ETF-only ajouté(s) hors value-chain (pas de maillons/actions) — cybersécurité SÉLECTIF.
EXTRA_ETF_SLEEVES = [
    {"key": "cyber", "label": "Cybersécurité", "stance": "SÉLECTIF",
     "etf": ("ISPY", "L&G Cyber Security UCITS")},
]


def _stance(position):
    s = (position or "").strip().upper()
    if s.startswith("VEILLE"):
        return "VEILLE", 0.0                    # robotics — non activé
    if "BORN" in s:
        return "BORNÉ", 0.33                     # materials — exposition bornée
    if "SELECT" in s or "SÉLECT" in s:
        return "SÉLECTIF", 0.5                   # defense — sélectif sur repli
    if "PROGRESSIF" in s:
        return "PROGRESSIF", 0.5                 # grid / semi / emerging — montée par palier
    if "ACTIF" in s or "PLEIN" in s:
        return "ACTIF", 1.0                      # nuclear / ai_infra — plein
    if "VEILLE" in s:
        return "VEILLE", 0.0
    return "ACTIF", 1.0                          # stance inconnue → plein (pas de pénalité silencieuse)


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
    # BASE UNIFORME par profil (revue expert) — plus de cap par thème ; la stance seule fait le poids.
    target_full = PROFILE_BASE.get(profile, 10.0)
    # stance : override expert d'abord (ex. cuivre PROGRESSIF), sinon la stance funnel `position`
    stance, mult = _stance(STANCE_OVERRIDE.get(key) or theme.get("position"))
    target = round(target_full * mult, 2)
    if mult == 0:  # VEILLE → thème non activé (fidèle à ta stance funnel)
        return {"key": key, "label": theme.get("label"), "eligible": True, "stance": stance,
                "position": theme.get("position"), "cap_key": cap_key, "target_full": round(target_full, 2),
                "target_pct": 0.0, "allocated_pct": 0.0, "survives_ai": theme.get("survives_ai"),
                "ytd": None, "overheated": False, "vehicle": "veille",
                "vehicle_why": f"stance {stance} → non détenu (critères d'activation à cocher)",
                "etf": None, "holdings": [], "overflow": [], "dropped": []}
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
                   "beta": _num(mm.get("beta")), "vol": _num(mm.get("vol")),
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
            "target_full": round(target_full, 2), "stance": stance, "position": theme.get("position"),
            "allocated_pct": allocated,
            "survives_ai": theme.get("survives_ai"), "ytd": ytd, "overheated": overheated,
            "vehicle": vehicle, "vehicle_why": why, "etf": etf,
            "holdings": positions, "overflow": overflow, "dropped": dropped}


# --- assemblage d'un portefeuille complet piloté-conviction (fichier de revue séparé) ---
GOLD_PCT = 8.0            # couverture
MIN_BROAD_CORE = 25.0     # plancher de béta/diversification broad (borne la concentration conviction)
# cœur broad : QQQ DEVANT (2:1) — un agressif croissance est Nasdaq-lourd, pas EM-lourd
BROAD_CORE = [("QQQ", "Invesco QQQ Trust (Nasdaq 100)", 2, 1.05),
              ("IEMG", "iShares Core MSCI EM IMI (UCITS via IS3N)", 1, 0.85)]
BETA_THEMATIC_ETF = 1.20  # ETF sectoriel (NUCG/COPM/NATO) — béta élevé
BETA_GOLD = 0.05
BETA_TARGET = 0.85        # cible pratique (le ballast dividende β~0.80 est un levier faible)
# BALLAST = ETF dividende QUALITÉ (pas high-yield = piège) : reste en actions, verse du rendement,
# β modéré ~0.80 → tire le β vers le bas MOINS qu'une oblig, mais garde le profil agressif/actions.
BETA_BALLAST = 0.80
BALLAST_MIN, BALLAST_MAX = 8.0, 20.0
BALLAST_TICKER, BALLAST_NAME = "FGEQ", "Fidelity Global Quality Income UCITS (dividende qualité)"


def assemble_conviction_portfolio(profile, fw, rules, catalog, dur_by_t, dur_by_n):
    sleeves = [build_theme_sleeve(t, profile, dur_by_t, dur_by_n, rules, catalog)
               for t in fw.get("themes", [])]
    elig = [s for s in sleeves if s.get("eligible")]
    # DÉDUP inter-thèmes : un ticker = 1 position, poids = MAX de ses thèmes (pas de somme → pas d'inflation)
    direct = {}
    for s in elig:
        if not s["vehicle"].startswith("direct"):
            continue
        for h in s["holdings"]:
            e = direct.get(h["ticker"])
            if not e:
                direct[h["ticker"]] = {"name": h["name"], "role": h["role"], "dur": h["dur"],
                                       "beta": h["beta"], "weight": h["weight"], "themes": [s["key"]]}
            else:
                e["weight"] = max(e["weight"], h["weight"])
                e["themes"].append(s["key"])
    # ETF thématiques (véhicule ETF/repli) — dédup par symbole
    tetf = {}
    for s in elig:
        if s["vehicle"].startswith("ETF") and s["etf"]:
            sym = s["etf"]["symbol"]
            e = tetf.get(sym)
            if not e:
                tetf[sym] = {"name": s["etf"]["name"], "weight": s["etf"].get("weight", 0.0),
                             "themes": [s["key"]], "source": s["etf"].get("source")}
            else:
                e["weight"] = max(e["weight"], s["etf"].get("weight", 0.0))
                e["themes"].append(s["key"])
    sat = round(sum(v["weight"] for v in direct.values()) + sum(v["weight"] for v in tetf.values()), 2)
    beta_core = sum(w * bt for _, _, w, bt in BROAD_CORE) / sum(w for _, _, w, _ in BROAD_CORE)

    def _satbeta(s):
        if s <= 0:
            return 1.0
        num = sum(v["weight"] * (v["beta"] if v["beta"] is not None else 1.1) for v in direct.values())
        num += sum(v["weight"] * BETA_THEMATIC_ETF for v in tetf.values())
        return num / s
    beta_sat = _satbeta(sat)

    # borne d'abord le satellite pour laisser cœur>=MIN + or + ballast min
    max_sat = 100 - GOLD_PCT - MIN_BROAD_CORE - BALLAST_MIN
    if sat > max_sat and sat > 0:
        k = max_sat / sat
        for v in list(direct.values()) + list(tetf.values()):
            v["weight"] = round(v["weight"] * k, 2)
        sat = round(sat * k, 2)

    # DIMENSIONNE LE BALLAST DIVIDENDE pour tirer le β vers BETA_TARGET. Résolveur général (βball ≠ 0) :
    # 100·T = or·βor + ball·βball + cœur·βcœur + sat·βsat, cœur=100-or-ball-sat
    # → ball = [100·T - or·βor - sat·βsat - (100-or-sat)·βcœur] / (βball - βcœur)
    denom = (BETA_BALLAST - beta_core)
    ball_raw = (100 * BETA_TARGET - GOLD_PCT * BETA_GOLD - sat * beta_sat
                - (100 - GOLD_PCT - sat) * beta_core) / denom if denom else BALLAST_MIN
    ballast = max(BALLAST_MIN, min(BALLAST_MAX, round(ball_raw, 2)))
    core_budget = round(100 - GOLD_PCT - ballast - sat, 2)
    if core_budget < MIN_BROAD_CORE:  # si le cœur passe sous le plancher, on rogne le satellite
        over = MIN_BROAD_CORE - core_budget
        k = max(0.0, (sat - over) / sat) if sat > 0 else 1.0
        for v in list(direct.values()) + list(tetf.values()):
            v["weight"] = round(v["weight"] * k, 2)
        sat = round(sat * k, 2)
        core_budget = MIN_BROAD_CORE

    tot = sum(w for _, _, w, _ in BROAD_CORE)
    core = [{"ticker": t, "name": n, "weight": round(core_budget * w / tot, 2), "beta": bt}
            for t, n, w, bt in BROAD_CORE]

    # β pondéré réel (recalculé sur les poids finaux)
    bsum = GOLD_PCT * BETA_GOLD + ballast * BETA_BALLAST
    for c in core:
        bsum += c["weight"] * c["beta"]
    for v in direct.values():
        bsum += v["weight"] * (v["beta"] if v["beta"] is not None else 1.1)
    for v in tetf.values():
        bsum += v["weight"] * BETA_THEMATIC_ETF
    beta = round(bsum / 100.0, 2)

    total = round(GOLD_PCT + ballast + sat + sum(c["weight"] for c in core), 1)
    return {"profile": profile, "direct": direct, "thematic_etf": tetf, "core": core,
            "gold_pct": GOLD_PCT, "ballast_pct": ballast, "satellite_pct": sat, "core_pct": core_budget,
            "beta_est": beta, "beta_target": BETA_TARGET, "total_pct": total}


# --- MODÈLE 2 COMPTES : ETF thématique (le gros) + livre d'actions conviction (le petit) ---
# Plus maintenable : le compte ETF est set-and-forget ; les MAJ funnel ne touchent que le petit
# compte actions (churn peu coûteux). grid/ai_infra (sans ETF) n'existent QUE côté actions.
ETF_ACCOUNT_GOLD = 8.0
ETF_ACCOUNT_DIVIDEND = 14.0     # revue expert : dividende ≠ décorrélation, l'or fait le ballast → 18→14
# Cœur UCITS (achetable par un particulier FR ; QQQ/IEMG US sont hors PRIIPs). Nasdaq gardé (World déjà en modéré).
CORE_UCITS = [("EQQQ", "Invesco Nasdaq-100 UCITS", 2), ("EIMI", "iShares Core MSCI EM IMI UCITS · couvre émergents", 1)]


def build_split_portfolios(profile, fw, rules, catalog, dur_by_t, dur_by_n):
    sleeves = [build_theme_sleeve(t, profile, dur_by_t, dur_by_n, rules, catalog)
               for t in fw.get("themes", [])]
    elig = [s for s in sleeves if s.get("eligible") and s.get("vehicle") != "veille"]

    # ---- COMPTE A : Thématique ETF (100 %) ----
    thematic = []  # (sym, name, target)
    for s in elig:
        ov = ETF_OVERRIDE.get(s["key"])   # véhicule UCITS retenu par l'expert
        if ov:
            thematic.append((ov[0], ov[1], s["target_pct"]))
            continue
        etf = s.get("etf") or _pick_etf(s["key"], catalog)
        if not etf:
            eb = next((t for t in fw["themes"] if t["key"] == s["key"]), {}).get("etf_buy") or {}
            if eb.get("symbol") and eb["symbol"] != "—":
                etf = {"symbol": eb["symbol"], "name": eb.get("name", "")}
        if etf:
            thematic.append((etf["symbol"], etf["name"], s["target_pct"]))
    # sleeves ETF-only ajoutés (cyber…) : stance × base uniforme
    for ex in EXTRA_ETF_SLEEVES:
        w = round(PROFILE_BASE.get(profile, 10.0) * STANCE_MULT.get(ex["stance"], 0.5), 2)
        thematic.append((ex["etf"][0], ex["etf"][1] + f" · {ex['label']} {ex['stance']}", w))
    th_tot = round(sum(w for _, _, w in thematic), 2)
    core_tot = round(100 - ETF_ACCOUNT_GOLD - ETF_ACCOUNT_DIVIDEND - th_tot, 2)
    if core_tot < 10:  # trop de thématique → on rogne proportionnellement
        k = (100 - ETF_ACCOUNT_GOLD - ETF_ACCOUNT_DIVIDEND - 10) / th_tot if th_tot else 1
        thematic = [(a, b, round(w * k, 2)) for a, b, w in thematic]
        th_tot = round(sum(w for _, _, w in thematic), 2)
        core_tot = 10.0
    ctot = sum(r[2] for r in CORE_UCITS)
    etf_account = {}
    for tk, nm, wt in CORE_UCITS:
        etf_account[tk] = {"w": round(core_tot * wt / ctot, 2), "name": nm, "role": "cœur broad"}
    etf_account[BALLAST_TICKER] = {"w": ETF_ACCOUNT_DIVIDEND, "name": BALLAST_NAME, "role": "dividende"}
    etf_account["SGLN.AS"] = {"w": ETF_ACCOUNT_GOLD, "name": "iShares Physical Gold", "role": "or"}
    for sym, nm, w in thematic:
        etf_account[sym] = {"w": w, "name": nm, "role": "thématique"}

    # ---- COMPTE B : Convictions actions seules (100 %, normalisé) ----
    direct = {}
    for s in elig:
        if not s["vehicle"].startswith("direct"):
            continue
        for h in s["holdings"]:
            e = direct.get(h["ticker"])
            if not e:
                direct[h["ticker"]] = {"name": h["name"], "dur": h["dur"], "w": h["weight"],
                                       "themes": [s["key"]]}
            else:
                e["w"] = max(e["w"], h["weight"])
                e["themes"].append(s["key"])
    raw = sum(v["w"] for v in direct.values())
    stock_account = {}
    if raw:
        for tk, v in sorted(direct.items(), key=lambda kv: -kv[1]["w"]):
            stock_account[tk] = {"w": round(v["w"] / raw * 100, 2), "name": v["name"],
                                 "dur": v["dur"], "themes": v["themes"]}
    return {"etf_account": etf_account, "stock_account": stock_account,
            "etf_lines": len(etf_account), "stock_lines": len(stock_account)}


def _fmt(sl):
    out = []
    if not sl.get("eligible"):
        return f"  ⊘ {sl['label']:<40} — {sl['reason']}"
    if sl.get("vehicle") == "veille":
        return (f"══ {sl['label']}  [{sl['key']}]  stance {sl['stance']} → EN VEILLE, NON DÉTENU"
                f"  (cap plein aurait été {sl['target_full']}%)")
    mult = STANCE_MULT.get(sl.get("stance", "ACTIF"), 1.0)
    head = (f"══ {sl['label']}  [{sl['key']}]  cap {sl['cap_key']} {sl['target_full']}%×{mult}"
            f"({sl['stance']})={sl['target_pct']}% | survives_ai:{sl['survives_ai']}"
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


def _assemble_and_write(profile, fw, rules, catalog, dur_by_t, dur_by_n):
    pf = assemble_conviction_portfolio(profile, fw, rules, catalog, dur_by_t, dur_by_n)
    print(f"\n### PORTEFEUILLE PILOTÉ-CONVICTION — {profile} (proposition, fichier de revue) ###\n")
    print(f"Structure : or {pf['gold_pct']}% · dividende {pf['ballast_pct']}% · cœur broad {pf['core_pct']}%"
          f" · satellite conviction {pf['satellite_pct']}%  → total {pf['total_pct']}%")
    print(f"β estimé ≈ {pf['beta_est']}  (cible {pf['beta_target']} ; broad seul ≈ 1.0)\n")
    print("— CŒUR BROAD + BALLAST DIVIDENDE (diversification/β/rendement) —")
    for c in pf["core"]:
        print(f"   {c['ticker']:<7}{c['weight']:>5}%  {c['name'][:40]}")
    print(f"   {BALLAST_TICKER:<7}{pf['ballast_pct']:>5}%  {BALLAST_NAME} (β~0.80, verse du rendement)")
    print(f"   {'SGLN':<7}{pf['gold_pct']:>5}%  or physique (couverture)")
    print("\n— SATELLITE CONVICTION : actions directes (enablers) —")
    for tk, v in sorted(pf["direct"].items(), key=lambda kv: -kv[1]["weight"]):
        th = "+".join(v["themes"])
        print(f"   {tk:<7}{v['weight']:>5}%  dur:{v['dur'] or '-'} β{v['beta'] or '?'}  {(v['name'] or '')[:24]:<25}[{th}]")
    if pf["thematic_etf"]:
        print("\n— SATELLITE CONVICTION : ETF thématiques (là où pas de pick propre) —")
        for sym, v in pf["thematic_etf"].items():
            print(f"   {sym:<7}{v['weight']:>5}%  {(v['name'] or '')[:34]:<35}[{'+'.join(v['themes'])}]")
    # écriture fichier de revue (NE TOUCHE PAS portfolios.json ni le générateur)
    actions = {tk: {"allocation": f"{v['weight']}%", "name": v["name"], "themes": v["themes"],
                    "durability": v["dur"]} for tk, v in pf["direct"].items()}
    etf = {c["ticker"]: {"allocation": f"{c['weight']}%", "name": c["name"], "role": "core broad"} for c in pf["core"]}
    etf[BALLAST_TICKER] = {"allocation": f"{pf['ballast_pct']}%", "name": BALLAST_NAME, "role": "ballast dividende"}
    etf["SGLN.AS"] = {"allocation": f"{pf['gold_pct']}%", "name": "iShares Physical Gold ETC", "role": "hedge"}
    for sym, v in pf["thematic_etf"].items():
        etf[sym] = {"allocation": f"{v['weight']}%", "name": v["name"], "role": "thematic", "themes": v["themes"]}
    out = {f"{profile}-Conviction": {"Actions": actions, "ETF": etf,
           "_meta": {"beta_est": pf["beta_est"], "beta_target": pf["beta_target"], "gold_pct": pf["gold_pct"],
                     "ballast_dividende_pct": pf["ballast_pct"], "core_pct": pf["core_pct"], "satellite_pct": pf["satellite_pct"],
                     "doctrine": "conviction FILTRE (qui+véhicule), poids=plafond profil FIXE ; standalone, non branché"}}}
    path = os.path.join(DATA, "portfolios_conviction.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"\n✅ écrit → data/portfolios_conviction.json (fichier de revue ; portfolios.json intact)")


def _split_and_write(profile, fw, rules, catalog, dur_by_t, dur_by_n):
    sp = build_split_portfolios(profile, fw, rules, catalog, dur_by_t, dur_by_n)
    print(f"\n### MODÈLE 2 COMPTES — {profile} (proposition, fichier de revue) ###\n")
    print(f"— COMPTE A · Thématique ETF ({sp['etf_lines']} lignes, le GROS des fonds, set-and-forget) —")
    for sym, v in sp["etf_account"].items():
        print(f"   {sym:<9}{v['w']:>6}%  [{v['role']:<10}] {v['name'][:40]}")
    print(f"\n— COMPTE B · Convictions actions ({sp['stock_lines']} lignes, PETIT montant, MAJ funnel ici) —")
    for tk, v in sp["stock_account"].items():
        print(f"   {tk:<9}{v['w']:>6}%  dur:{v['dur'] or '-'}  {v['name'][:24]:<25}[{'+'.join(v['themes'])}]")
    out = {
        f"{profile}-ThematiqueETF": {
            "ETF": {k: {"allocation": f"{v['w']}%", "name": v["name"], "role": v["role"]}
                    for k, v in sp["etf_account"].items()},
            "_meta": {"type": "full ETF, set-and-forget, gros des fonds", "lines": sp["etf_lines"]}},
        f"{profile}-ConvictionsActions": {
            "Actions": {k: {"allocation": f"{v['w']}%", "name": v["name"], "durability": v["dur"],
                            "themes": v["themes"]} for k, v in sp["stock_account"].items()},
            "_meta": {"type": "actions conviction seules, petit montant, piloté funnel", "lines": sp["stock_lines"]}},
    }
    path = os.path.join(DATA, "portfolios_split.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"\n✅ écrit → data/portfolios_split.json (revue ; portfolios.json intact)")


def main():
    args = [a for a in sys.argv[1:]]
    do_assemble = "assemble" in args
    do_split = "split" in args
    profile = next((a for a in args if a not in ("assemble", "split")), "Agressif")
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
    print(f"→ Enveloppe thématique RÉELLEMENT allouée (avant dédup/caps) : {total:.0f}% du portefeuille {profile}")
    if do_assemble:
        _assemble_and_write(profile, fw, rules, catalog, dur_by_t, dur_by_n)
    if do_split:
        _split_and_write(profile, fw, rules, catalog, dur_by_t, dur_by_n)


if __name__ == "__main__":
    main()
