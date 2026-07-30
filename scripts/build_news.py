#!/usr/bin/env python3
"""Couche NEWS de l'entonnoir — fetch news RÉELLES (Google News RSS) → classe (codebook) → funnel_news.json.

Doctrine : on décrit et on cite (URL + date + source réelles), on n'invente pas. L'IA (v2) CLASSE
l'événement dans le codebook ; le CODE attribue la valeur. v1 = classification par règles mots-clés
(transparent, sans clé API). news_heat borné [-3,+3], AFFICHÉ à côté de la solidité, JAMAIS additionné.
"""
import json, os, re, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

BASE = os.path.join(os.path.dirname(__file__), "..", "data")
def load(fn): return json.load(open(os.path.join(BASE, fn), encoding="utf-8"))

FW  = load("framework.json")
SRC = load("news_sources.json")
CB  = load("news_codebook.json")
CFG = SRC["config"]
RULES = SRC["classify_rules"]
WARN_TYPES = set(SRC.get("warning_types", []))
HALF_LIFE = CB.get("half_life_days", 14)
HEAT_MIN, HEAT_MAX = CB.get("news_heat_bounds", [-3, 3])
NOW = datetime.now(timezone.utc)

def fetch_rss(query):
    url = ("https://news.google.com/rss/search?q=" + urllib.parse.quote(query)
           + f"&hl={CFG['lang']}&gl={CFG['region']}&ceid={CFG['region']}:{CFG['lang']}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (funnel-news-bot)"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            xml = r.read()
    except Exception as e:
        print(f"    ⚠️ fetch KO ({query[:30]}): {e}"); return []
    items = []
    try:
        root = ET.fromstring(xml)
        for it in root.findall(".//item"):
            title = (it.findtext("title") or "").strip()
            link  = (it.findtext("link") or "").strip()
            pub   = it.findtext("pubDate")
            src_el = it.find("{*}source") if it.find("{*}source") is not None else it.find("source")
            source = (src_el.text if src_el is not None else "") or "Google News"
            try: dt = parsedate_to_datetime(pub) if pub else None
            except Exception: dt = None
            if dt and dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
            items.append({"title": title, "url": link, "source": source,
                          "date": dt.strftime("%Y-%m-%d") if dt else None, "_dt": dt})
    except Exception as e:
        print(f"    ⚠️ parse KO: {e}")
    return items

def classify(title):
    """Règle mots-clés → type d'événement du codebook (v1). Retourne le type ou None."""
    t = title.lower()
    for ev, kws in RULES.items():
        if any(k in t for k in kws):
            return ev
    return None

def decayed(value, dt):
    if not dt: return value * 0.5  # date inconnue → poids réduit
    age = (NOW - dt).days
    return value * (0.5 ** (max(0, age) / HALF_LIFE))

def process_company(name, extra_kw):
    query = f'"{name}" {extra_kw}'.strip()
    raw = fetch_rss(query)
    # fenêtre temporelle + dédup par titre normalisé
    seen, items = set(), []
    for it in raw:
        if it["_dt"] and (NOW - it["_dt"]).days > CFG["days_window"]: continue
        key = re.sub(r"[^a-z0-9]", "", it["title"].lower())[:60]
        if key in seen: continue
        seen.add(key); items.append(it)
    items = items[: CFG["max_items_per_company"]]

    badges, warnings, heat = [], [], 0.0
    corpus = {it["url"] for it in items}  # garde-fou corpus : on ne badge QUE des items fetchés
    for it in items:
        ev = classify(it["title"])
        if not ev: continue
        meta = CB["events"].get(ev, {})
        if it["url"] not in corpus:  # (toujours vrai ici : v1 badge sur item fetché → corpus garanti)
            continue
        badge = {"type": ev, "date": it["date"], "src": it["source"], "url": it["url"], "title": it["title"]}
        if meta.get("alert"):
            badges.append(badge)  # tripwire → alerte, pas de heat
        else:
            heat += decayed(meta.get("value", 0), it["_dt"])
            badges.append(badge)
        if ev in WARN_TYPES:
            warnings.append({"title": it["title"], "src": it["source"], "date": it["date"], "url": it["url"]})
    heat = max(HEAT_MIN, min(HEAT_MAX, round(heat)))
    alert = any(CB["events"].get(b["type"], {}).get("alert") for b in badges)
    return {"badges": badges, "news_heat": heat, "warnings": warnings, "alert": alert,
            "news": [{"title": it["title"], "src": it["source"], "date": it["date"], "url": it["url"]} for it in items]}

def companies_of(chain_key):
    t = next((t for t in FW["themes"] if t["key"] == chain_key), None)
    out = []
    if t:
        for m in t["maillons"]:
            for c in m.get("companies", []):
                if c.get("ticker") and c.get("name"):
                    out.append((c["ticker"], c["name"]))
    return out

def main():
    out = {"meta": {"generated": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "codebook_version": CB.get("version"), "source": "Google News RSS"},
           "chains": {}}
    for ck in CFG["pilot_chains"]:
        print(f"■ {ck}")
        extra = SRC.get("chain_keywords", {}).get(ck, "")
        comp = {}
        for tk, name in companies_of(ck):
            print(f"  📰 {name} ({tk})")
            r = process_company(name, extra)
            if r["news"] or r["badges"]:
                comp[tk] = r
        out["chains"][ck] = {"global": [], "companies": comp}
        print(f"  → {len(comp)} sociétés avec news")
    json.dump(out, open(os.path.join(BASE, "funnel_news.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    tot = sum(len(c["companies"]) for c in out["chains"].values())
    print(f"\n✅ funnel_news.json écrit ({tot} sociétés, {len(out['chains'])} chaînes)")

if __name__ == "__main__":
    main()
