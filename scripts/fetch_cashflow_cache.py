#!/usr/bin/env python3
"""
Hydrate data/cashflow_cache.json (flux de trésorerie annuels Twelve Data) pour les
candidats du pilier Actions-Conviction : maillons du framework + industries « enablers »
du radar, sur les trois régions (US, Europe, Asie).

Clé : TICKER:Région (identique à conviction_equities.py). Entrée :
  {fiscal_date, fcf, ocf, fcf_hist[6], meta, fetched}   ou   {error, fetched}
FCF = free_cash_flow TD (OCF − capex ; recalculé si absent). TTL 90 j (données annuelles),
les erreurs sont retentées après 1 j. Plafond de fetchs par run (quota partagé).

  python scripts/fetch_cashflow_cache.py            # incrémental
  CASHFLOW_MAX=600 python scripts/fetch_cashflow_cache.py
"""
import json, os, sys, time, re
from datetime import date, datetime, timedelta
from collections import defaultdict
import urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "cashflow_cache.json")
KEY = os.environ.get("TWELVE_DATA_API") or os.environ.get("TWELVE_DATA_API_KEY")
MAX_FETCH = int(os.environ.get("CASHFLOW_MAX", "500"))
TTL_OK, TTL_ERR = 90, 1                      # jours
SLEEP = float(os.environ.get("CASHFLOW_SLEEP", "2.6"))   # fondamentaux = 100 crédits → ~23 req/min sous les 2 584/min

ENABLER_INDUSTRIES = {
    "Semiconductor Equipment & Materials", "Semiconductors", "Electrical Equipment & Parts",
    "Specialty Industrial Machinery", "Engineering & Construction", "Electronic Components",
    "Aerospace & Defense", "Uranium", "Utilities - Independent Power Producers",
    "Copper", "Other Industrial Metals & Mining",
}
FX_TO_USD = {"USD": 1.0, "EUR": 1.08, "GBP": 1.27, "GBp": 0.0127, "CHF": 1.13, "SEK": 0.095, "NOK": 0.093,
             "DKK": 0.145, "PLN": 0.25, "JPY": 0.0067, "KRW": 0.00072, "TWD": 0.031, "HKD": 0.128,
             "CNY": 0.14, "INR": 0.012, "SGD": 0.74, "AUD": 0.66}
ADV_MIN_USD = 5e6


def _num(x):
    try:
        v = float(x); return v if v == v else None
    except (TypeError, ValueError):
        return None


def _adv(s):
    v = _num(s.get("average_volume")) or _num(s.get("volume"))
    p, fx = _num(s.get("price")), FX_TO_USD.get(s.get("data_currency"))
    return v * p * fx if (v and p and fx) else None


def framework_keys():
    fw = json.load(open(os.path.join(DATA, "framework.json"), encoding="utf-8"))
    acc = set()
    def walk(o):
        if isinstance(o, dict):
            if o.get("ticker") and o.get("country"):
                acc.add((str(o["ticker"]).upper(), o["country"].lower()))
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(fw); return acc


def candidates():
    fw = framework_keys(); out = []
    held = set()
    for fn in ("portfolios_conviction_equities.json",):
        try:
            held = {(h["ticker"], h["region"]) for h in json.load(open(os.path.join(DATA, fn), encoding="utf-8"))["holdings"]}
        except Exception:
            pass
    for reg, fn in (("US", "stocks_us.json"), ("Europe", "stocks_europe.json"), ("Asie", "stocks_asia.json")):
        try:
            rows = json.load(open(os.path.join(DATA, fn), encoding="utf-8")).get("stocks", [])
        except FileNotFoundError:
            continue
        for s in rows:
            t = s.get("ticker")
            if not t: continue
            in_fw = (t.upper(), (s.get("country") or "").lower()) in fw
            in_screen = s.get("industry") in ENABLER_INDUSTRIES and (s.get("durability_grade") in ("A", "B")) \
                        and (_adv(s) or 0) >= ADV_MIN_USD
            if in_fw or in_screen or (t, reg) in held:
                out.append((t, reg, s.get("data_mic") or s.get("resolved_symbol", "").split(":")[-1] or None, in_fw))
    # une clé = un fetch (priorité framework)
    seen, uniq = set(), []
    for c in sorted(out, key=lambda c: (not c[3])):
        if (c[0], c[1]) not in seen:
            seen.add((c[0], c[1])); uniq.append(c)
    return uniq


def fetch(ticker, mic):
    q = {"symbol": ticker, "period": "annual", "apikey": KEY}
    if mic and re.fullmatch(r"[A-Z]{4}", mic) and mic not in ("XNYS", "XNGS", "XNAS", "XASE"):
        q["mic_code"] = mic
    url = "https://api.twelvedata.com/cash_flow?" + urllib.parse.urlencode(q)
    with urllib.request.urlopen(url, timeout=20) as r:
        d = json.loads(r.read().decode())
    if d.get("status") == "error" or "cash_flow" not in d:
        return {"error": str(d.get("message") or d.get("code") or "no cash_flow")}
    vals = d["cash_flow"]
    hist = []
    for v in vals[:6]:
        fcf = _num(v.get("free_cash_flow"))                       # champ TD (OCF − capex)
        if fcf is None:
            ocf = _num((v.get("operating_activities") or {}).get("operating_cash_flow"))
            capex = _num((v.get("investing_activities") or {}).get("capital_expenditures"))
            fcf = (ocf + capex) if (ocf is not None and capex is not None) else None
        hist.append(fcf)
    if not vals or hist[0] is None:
        return {"error": "empty"}
    v0 = vals[0]
    return {"fiscal_date": v0.get("fiscal_date"), "fcf": hist[0],
            "ocf": _num((v0.get("operating_activities") or {}).get("operating_cash_flow")),
            "fcf_hist": hist, "meta": d.get("meta")}


def main():
    if not KEY:
        print("❌ TWELVE_DATA_API manquant"); return 1
    cache = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    today = date.today(); n_fetch = n_ok = n_err = 0; rate_limited = False
    cands = candidates()
    print(f"cash-flow : {len(cands)} candidats, cache {len(cache)} entrées")
    for t, reg, mic, in_fw in cands:
        k = f"{t}:{reg}"; e = cache.get(k)
        if e:
            try:
                age = (today - date.fromisoformat(e.get("fetched", "2000-01-01"))).days
            except ValueError:
                age = 999
            if ("fcf" in e and age < TTL_OK) or ("error" in e and age < TTL_ERR):
                continue
        if n_fetch >= MAX_FETCH:
            break
        n_fetch += 1
        for attempt in range(4):                              # 429 → pause puis MÊME ticker (pas de trou)
            try:
                r = fetch(t, mic)
            except Exception as ex:
                r = {"error": f"{type(ex).__name__}: {ex}"[:120]}
            if not ("error" in r and "429" in r["error"]):
                break
            if attempt == 3:
                rate_limited = True
            else:
                print("⚠️ 429 — pause 65 s"); time.sleep(65)
        if rate_limited:
            print("⚠️ 429 ×4 — arrêt du run, on garde ce qui est acquis"); break
        r["fetched"] = today.isoformat(); cache[k] = r
        if "fcf" in r: n_ok += 1
        else: n_err += 1
        time.sleep(SLEEP)
    json.dump(cache, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"✅ {n_fetch} fetch(s) : {n_ok} ok, {n_err} erreur(s) · cache {len(cache)} → {OUT}" + (" · 429" if rate_limited else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
