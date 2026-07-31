#!/usr/bin/env python3
"""Couche NEWS de l'entonnoir — fetch news RÉELLES (Yahoo Finance RSS) → classe (codebook) → funnel_news.json.

Doctrine : on décrit et on cite (URL + date + source réelles), on n'invente pas. L'IA (v2) CLASSE
l'événement dans le codebook ; le CODE attribue la valeur. v1 = classification par règles mots-clés
(transparent, sans clé API). news_heat borné [-3,+3], AFFICHÉ à côté de la solidité, JAMAIS additionné.
Source = Yahoo Finance RSS (datacenter-friendly ; Google News bloque les runners GitHub → 503).
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

# ── v2 : résumé IA (Claude). Grounded sur les titres RÉELLEMENT fetchés : on résume, on n'invente pas,
#    aucun conseil d'achat/vente (décrit, ne prescrit pas). Gardé sur la présence de la clé. ──
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")
AI_MODEL = "claude-haiku-4-5-20251001"

def ai_json(prompt, max_tokens=1500):
    if not ANTHROPIC_KEY: return None
    body = json.dumps({"model": AI_MODEL, "max_tokens": max_tokens,
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, method="POST",
        headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            txt = json.load(r)["content"][0]["text"]
        mm = re.search(r"\{.*\}", txt, re.S)
        return json.loads(mm.group(0)) if mm else None
    except Exception as e:
        print(f"    ⚠️ IA KO: {e}"); return None

AI_RULES = ("Résume UNIQUEMENT à partir de ces titres réels, en FRANÇAIS. N'invente RIEN (pas de chiffre/fait "
            "hors titres). AUCUN conseil d'achat/vente — décris, ne prescris pas. Factuel et bref.")

def fetch_rss(symbol):
    # Yahoo Finance RSS par ticker : datacenter-friendly. News taguées au ticker = plus précis.
    url = (f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={urllib.parse.quote(symbol)}"
           "&region=US&lang=en-US")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (funnel-news-bot)"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            xml = r.read()
    except Exception as e:
        print(f"    ⚠️ fetch KO ({symbol}): {e}"); return []
    items = []
    try:
        root = ET.fromstring(xml)
        for it in root.findall(".//item"):
            title = (it.findtext("title") or "").strip()
            link  = (it.findtext("link") or "").strip()
            pub   = it.findtext("pubDate")
            src_el = it.find("{*}source") if it.find("{*}source") is not None else it.find("source")
            source = (src_el.text if src_el is not None else "") or "Yahoo Finance"
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
    if not dt: return value * 0.5
    age = (NOW - dt).days
    return value * (0.5 ** (max(0, age) / HALF_LIFE))

def process_company(ticker, name):
    symbol = SRC.get("yahoo_map", {}).get(ticker, ticker)  # ticker funnel → symbole Yahoo (défaut=ticker, OK US)
    raw = fetch_rss(symbol)
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
        if not ev or it["url"] not in corpus: continue
        meta = CB["events"].get(ev, {})
        badges.append({"type": ev, "date": it["date"], "src": it["source"], "url": it["url"], "title": it["title"]})
        if not meta.get("alert"):
            heat += decayed(meta.get("value", 0), it["_dt"])
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
                    out.append((c["ticker"], c["name"], c.get("region", "")))
    return out

def chain_label(ck):
    return (next((t for t in FW["themes"] if t["key"] == ck), {}) or {}).get("label", ck)

def ai_chain_summary(label, comp):
    """Résumé IA : 1 phrase par entreprise (injectée dans comp) + synthèse de chaîne (retour)."""
    blocks = [f"{tk}: " + " ; ".join(n["title"] for n in co["news"][:4]) for tk, co in comp.items()]
    prompt = (f"News récentes de la chaîne « {label} » (titres réels).\n{AI_RULES}\n\n"
              "Réponds en JSON strict, rien d'autre :\n"
              '{"companies": {"<TICKER>": "<1 phrase de synthèse de son actu>"}, '
              '"chain": "<2 phrases : le thème dominant de la semaine sur cette chaîne>"}\n\n'
              + "\n".join(blocks))
    res = ai_json(prompt, max_tokens=500 + 200 * len(comp))  # scale : sinon JSON tronqué sur grosses chaînes
    if not res: return None
    for tk, s in (res.get("companies") or {}).items():
        if tk in comp: comp[tk]["summary"] = s
    return res.get("chain")

def ai_geo_summary(geo_news):
    names = {"US": "États-Unis", "EU": "Europe", "Asie": "Asie"}
    blocks = [f"[{names.get(r, r)}]\n" + "\n".join("- " + x for x in items[:20])
              for r, items in geo_news.items() if items]
    if not blocks: return {}
    prompt = (f"News récentes par région (titres réels).\n{AI_RULES}\n\n"
              "Résume l'actu de CHAQUE région en 2 phrases (le mouvement d'ensemble).\n"
              'JSON strict : {"US": "...", "EU": "...", "Asie": "..."}\n\n' + "\n\n".join(blocks))
    return ai_json(prompt) or {}

def main():
    out = {"meta": {"generated": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "codebook_version": CB.get("version"), "source": "Yahoo Finance RSS",
                    "ai": bool(ANTHROPIC_KEY)},
           "chains": {}, "geo": {}}
    geo_news = {"US": [], "EU": [], "Asie": []}
    for ck in CFG["pilot_chains"]:
        print(f"■ {chain_label(ck)}")
        comp = {}
        for tk, name, reg in companies_of(ck):
            print(f"  📰 {name} ({tk})")
            r = process_company(tk, name)
            if r["news"] or r["badges"]:
                comp[tk] = r
                geo_news.setdefault(reg, [])
                for n in r["news"][:2]:
                    geo_news[reg].append(f"{name}: {n['title']}")
        chain_obj = {"global": [], "companies": comp}
        if ANTHROPIC_KEY and comp:
            print("  🤖 résumé IA (entreprises + chaîne)…")
            chain_obj["summary"] = ai_chain_summary(chain_label(ck), comp)
        out["chains"][ck] = chain_obj
        print(f"  → {len(comp)} sociétés avec news")
    if ANTHROPIC_KEY:
        print("🤖 vue d'ensemble géo (IA)…")
        out["geo"] = ai_geo_summary(geo_news)
    json.dump(out, open(os.path.join(BASE, "funnel_news.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    tot = sum(len(c["companies"]) for c in out["chains"].values())
    print(f"\n✅ funnel_news.json écrit ({tot} sociétés, {len(out['chains'])} chaînes, IA={bool(ANTHROPIC_KEY)})")

if __name__ == "__main__":
    main()
