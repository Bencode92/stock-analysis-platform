#!/usr/bin/env python3
"""« Sortie depuis snapshot » : re-hydrate roic + quality dans stocks_*.json depuis le dernier état SAIN.

POURQUOI : la passe fondamentaux se fait tuer à 6h (limite GitHub) avant d'écrire roic → roic ET le
subscore `quality` (dépendant du roic) sortent null → gate solidité KO → « DONNÉES INSUFF. ». Ce script
tourne APRÈS le scoring : il remplit les trous depuis fundamentals_snapshot.json, et rafraîchit le
snapshot avec les valeurs FRAÎCHES quand le run a réussi (coverage haute). Idempotent, 0 appel API.

- Backfill = gap-fill STRICT (ne clobbe jamais une valeur fraîche non-nulle).
- quality_subscores : merge sous-clé par sous-clé (le momentum frais du run gagne, le quality stale comble).
- Concordance par ticker:pays normalisé (lowercase+trim), comme buildCacheKey v2.13.
"""
import json, os

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
SNAP = os.path.join(DATA, "fundamentals_snapshot.json")
FILES = ["stocks_us.json", "stocks_europe.json", "stocks_asia.json"]
SCALAR = ["roic", "roic_avg_3y", "roic_std_3y", "roe", "roe_avg_3y", "roe_std_3y",
          "de_ratio", "net_margin", "revenue_growth_3y", "quality_coverage"]
HEALTHY_COVERAGE = 90  # un run est "sain" pour ce titre si coverage >= 90 → on rafraîchit le snapshot


def key(tk, country):
    c = (country or "").lower().strip()
    return f"{tk}:{c}" if c else tk


def load_arr(path):
    d = json.load(open(path, encoding="utf-8"))
    if isinstance(d, list):
        return d, None
    return (d.get("stocks") or d.get("data") or []), d


def main():
    if not os.path.exists(SNAP):
        print("⚠️  pas de snapshot — lance d'abord build_fundamentals_snapshot.py"); return
    snap = json.load(open(SNAP, encoding="utf-8")); S = snap.setdefault("data", {})
    total_hydrated = total_refreshed = 0
    for fn in FILES:
        path = os.path.join(DATA, fn)
        if not os.path.exists(path):
            print(f"⚠️  {fn} absent"); continue
        arr, wrapper = load_arr(path)
        hydrated = refreshed = gate_ok = 0
        for s in arr:
            tk = str(s.get("ticker") or s.get("symbol") or "")
            k = key(tk, s.get("country") or s.get("Pays") or "")
            ss = s.get("quality_subscores") if isinstance(s.get("quality_subscores"), dict) else {}
            # un titre est SAIN si le roic 3 ans ET le subscore quality (qui dépend du roic) sont là
            healthy = s.get("roic_avg_3y") is not None and ss.get("quality") is not None

            if healthy and (s.get("quality_coverage") or 0) >= HEALTHY_COVERAGE:
                # run réussi → on rafraîchit le snapshot avec la valeur FRAÎCHE
                rec = {f: s.get(f) for f in SCALAR if s.get(f) is not None}
                if s.get("quality_subscores") is not None:
                    rec["quality_subscores"] = s.get("quality_subscores")
                S[k] = rec; refreshed += 1
            elif not healthy:
                # DÉGRADÉ (roic/quality perdus par le kill 6h) → restaure depuis le snapshot
                ref = S.get(k)
                if isinstance(ref, dict):
                    touched = False
                    for f in SCALAR:
                        # gap-fill les scalaires, MAIS écrase quality_coverage (36 dégradé ≠ vrai)
                        if ref.get(f) is not None and (s.get(f) is None or f == "quality_coverage"):
                            s[f] = ref[f]; touched = True
                    # subscores : comble les manquants (quality), garde les frais (safety/value/growth/momentum)
                    rss = ref.get("quality_subscores")
                    if isinstance(rss, dict):
                        cur = dict(ss)
                        for sk, sv in rss.items():
                            if cur.get(sk) is None and sv is not None:
                                cur[sk] = sv; touched = True
                        s["quality_subscores"] = cur
                    if touched: hydrated += 1

            if s.get("roic_avg_3y") is not None and (s.get("quality_coverage") or 0) >= 40:
                gate_ok += 1

        out = wrapper if wrapper is not None else arr
        json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"✅ {fn:20} hydraté:{hydrated:5}  rafraîchi:{refreshed:5}  gate solidité OK:{gate_ok:5} / {len(arr)}")
        total_hydrated += hydrated; total_refreshed += refreshed

    json.dump(snap, open(SNAP, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n🎯 hydraté {total_hydrated} · snapshot rafraîchi sur {total_refreshed} titres sains · {len(S)} entrées")


if __name__ == "__main__":
    main()
