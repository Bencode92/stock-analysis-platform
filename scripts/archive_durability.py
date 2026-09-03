#!/usr/bin/env python3
"""Archive HEBDO des grades de durabilité — pour VALIDER la logique dans le temps (forward).

On fige le score de durabilité de chaque action, daté, une fois par semaine ISO. But : dans quelques
mois, mesurer « un grade D a-t-il vraiment chuté ENSUITE ? » en joignant ces grades figés aux prix
futurs. C'est de la validation DESCRIPTIVE (le grade prédit-il la casse ?), JAMAIS du tuning de poids
(doctrine : on ne recale pas un seuil sur un backtest). Fichier compact ; on garde les 60 dernières semaines.
"""
import json, os
from datetime import datetime, timezone

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
HIST = os.path.join(DATA, "durability_history.json")
MAX_WEEKS = 60


def load(fn):
    try:
        d = json.load(open(os.path.join(DATA, fn), encoding="utf-8"))
        return d if isinstance(d, list) else d.get("stocks", [])
    except Exception:
        return []


def main():
    now = datetime.now(timezone.utc)
    week = now.strftime("%G-W%V")  # semaine ISO, ex. 2026-W36

    hist = {}
    if os.path.exists(HIST):
        try:
            hist = json.load(open(HIST, encoding="utf-8"))
        except Exception:
            hist = {}
    hist.setdefault("weeks", {})

    if week in hist["weeks"]:
        print(f"ℹ️ durabilité : semaine {week} déjà archivée — skip (1 snapshot/semaine)")
        return

    scores = {}
    for fn in ("stocks_us.json", "stocks_europe.json", "stocks_asia.json"):
        for s in load(fn):
            tk, sc = s.get("ticker"), s.get("durability_score")
            if tk and sc is not None:
                scores[str(tk)] = sc

    hist["weeks"][week] = {"date": now.strftime("%Y-%m-%d"), "n": len(scores), "scores": scores}
    for k in sorted(hist["weeks"].keys())[:-MAX_WEEKS]:   # prune
        del hist["weeks"][k]
    hist["meta"] = {"updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "weeks_kept": len(hist["weeks"])}

    json.dump(hist, open(HIST, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"🗄️ durabilité archivée : {week}, {len(scores)} titres ({len(hist['weeks'])} semaines conservées)")


if __name__ == "__main__":
    main()
