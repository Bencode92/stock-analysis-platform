"""
Etage 5 : ALERTES d'achat — detecte les nouveaux achats des performers suivis.

A chaque run (cron quotidien), on compare les achats recents (flux /live/ avec montants)
aux achats deja vus. Tout NOUVEL achat d'un performer de qualite (median d'exces >= seuil)
genere une alerte. Les alertes sont accumulees dans congress/data/alerts.json
(affichees sur la page + utilisables pour une notif email/webhook).

"Ceux qui font du trade recemment" = les achats viennent du /live/, donc par construction
ce sont les actifs. On garde le plancher qualite pour ne pas alerter sur du bruit.

Usage:
    python congress/alerts.py
Env: MIN_MEDIAN (5), ALERT_DAYS (21), ALERT_MIN_AMOUNT (0), MAX_ALERTS (200)
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
LEADERBOARD = DATA / "politician_leaderboard.json"
LIVE = DATA / "congress_live.json"
OUT = DATA / "alerts.json"

MIN_MEDIAN = float(os.environ.get("MIN_MEDIAN", "5"))
ALERT_DAYS = int(os.environ.get("ALERT_DAYS", "21"))
MIN_AMOUNT = float(os.environ.get("ALERT_MIN_AMOUNT", "0") or 0)
MAX_ALERTS = int(os.environ.get("MAX_ALERTS", "200"))


def _pid(t):
    b = t.get("bioguide_id")
    return b if isinstance(b, str) and b.strip() else t.get("representative")


def _amount_mid(t):
    lo, hi = t.get("amount_min"), t.get("amount_max")
    if lo is None:
        return None
    return (lo + hi) / 2 if hi is not None else lo


def main() -> None:
    if not LEADERBOARD.exists() or not LIVE.exists():
        print("leaderboard ou live manquant -> pas d'alertes")
        return
    lb = json.loads(LEADERBOARD.read_text(encoding="utf-8"))
    live = json.loads(LIVE.read_text(encoding="utf-8")).get("trades", [])

    # Performers suivis : eligibles Congres au-dessus du plancher de qualite.
    followed = {}
    for r in lb.get("ranking", []):
        if (r.get("eligible") and r.get("branch") == "Congress"
                and r.get("median_annual_excess_return") is not None
                and r["median_annual_excess_return"] >= MIN_MEDIAN):
            followed[r["pid"]] = r
    print(f"{len(followed)} performers suivis (median >= {MIN_MEDIAN}%)")

    # Etat precedent (cles deja alertees) pour ne pas re-alerter.
    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"seen": [], "alerts": []}
    seen = set(prev.get("seen", []))
    first_run = not OUT.exists()

    last = max((t.get("report_date") for t in live if t.get("report_date")), default=None)
    if not last:
        print("pas de date dans le live")
        return
    cutoff = (datetime.strptime(last, "%Y-%m-%d") - timedelta(days=ALERT_DAYS)).strftime("%Y-%m-%d")

    new_alerts = []
    for t in live:
        if t.get("transaction") != "buy" or not t.get("ticker") or not t.get("report_date"):
            continue
        pid = _pid(t)
        if pid not in followed or t["report_date"] < cutoff:
            continue
        mid = _amount_mid(t)
        if MIN_AMOUNT and mid is not None and mid < MIN_AMOUNT:
            continue
        key = f"{pid}|{t['ticker']}|{t['report_date']}"
        if key in seen:
            continue
        seen.add(key)
        r = followed[pid]
        new_alerts.append({
            "report_date": t["report_date"],
            "transaction_date": t.get("transaction_date"),
            "representative": r["representative"],
            "party": r.get("party"),
            "ticker": t["ticker"],
            "amount_usd": round(mid) if mid is not None else None,
            "regularity_score": r["regularity_score"],
            "median_excess": r["median_annual_excess_return"],
            "win_rate": r.get("win_rate"),
        })

    new_alerts.sort(key=lambda a: a["report_date"], reverse=True)
    # Sur le tout premier run on amorce sans spammer : on marque comme vu sans pousser d'alerte.
    pushed = [] if first_run else new_alerts
    all_alerts = (pushed + prev.get("alerts", []))[:MAX_ALERTS]

    OUT.write_text(json.dumps({
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "as_of": last,
            "new_count": len(pushed),
            "followed": len(followed),
            "params": {"min_median": MIN_MEDIAN, "alert_days": ALERT_DAYS, "min_amount": MIN_AMOUNT},
        },
        "seen": sorted(seen)[-5000:],   # borne la memoire des cles
        "alerts": all_alerts,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    # Corps d'email + signal pour l'etape de notification.
    def _line(a):
        amt = f"~{round(a['amount_usd']/1000)}k$" if a["amount_usd"] else "montant n/a"
        return f"• {a['report_date']} — {a['representative']} ACHETE {a['ticker']} ({amt}, mediane {a['median_excess']}%, win {a.get('win_rate')}%)"
    body = ("Nouveaux achats des performers suivis :\n\n" + "\n".join(_line(a) for a in pushed)
            + f"\n\nPage : https://bencode92.github.io/stock-analysis-platform/congress/index.html") if pushed else "Aucun nouvel achat."
    (DATA / "alert_email.txt").write_text(body, encoding="utf-8")
    go = os.environ.get("GITHUB_OUTPUT")
    if go:
        with open(go, "a", encoding="utf-8") as f:
            f.write(f"new={len(pushed)}\n")

    if first_run:
        print(f"1er run : {len(new_alerts)} achats amorces (pas d'alerte poussee).")
    else:
        print(f"{len(pushed)} NOUVELLE(S) alerte(s) d'achat :")
        for a in pushed[:15]:
            print("  🔔 " + _line(a))


if __name__ == "__main__":
    main()
