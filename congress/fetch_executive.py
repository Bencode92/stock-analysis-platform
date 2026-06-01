"""
Source EXECUTIVE (Trump & co) — a part du Congres, meme schema.

Trump n'est pas dans le dataset Congress (regime declaratif OGE, pas STOCK Act).
On le recupere via l'endpoint Quiver filtre par representant (/live?representative=)
et on le tague house="Executive" pour qu'il traverse le meme pipeline
(enrichissement Twelve Data + ranking) tout en restant identifiable a part.

Best-effort : si l'endpoint ne renvoie rien, on ecrit un cache vide et le pipeline
continue normalement (Congres non impacte).

Usage:
    export QUIVERAPI="..."
    python congress/fetch_executive.py
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from congress_fetch import normalize_row  # noqa: E402

OUT_PATH = HERE / "data" / "executive_trades.json"

# (nom tel qu'attendu par Quiver, branche affichee)
EXECUTIVES = [("Donald Trump", "Executive")]


def fetch_rows() -> list[dict]:
    import quiverquant

    token = os.environ.get("QUIVERAPI") or os.environ.get("QUIVER_API_KEY")
    if not token:
        raise SystemExit("Cle Quiver manquante. -> export QUIVERAPI=...")
    client = quiverquant.quiver(token)

    rows: list[dict] = []
    for name, branch in EXECUTIVES:
        try:
            df = client.congress_trading(name, politician=True)  # /live?representative=
            recs = df.to_dict(orient="records") if hasattr(df, "to_dict") else []
        except Exception as ex:  # endpoint absent / nom inconnu -> on n'echoue pas
            print(f"  ! {name}: {ex}")
            recs = []
        for r in recs:
            t = normalize_row(r)
            t["house"] = branch            # tag executif explicite
            if not t["representative"]:
                t["representative"] = name
            rows.append(t)
        print(f"  {name}: {len(recs)} trades bruts")
    return rows


def main() -> None:
    rows = [
        t for t in fetch_rows()
        if t["ticker"] and t["ticker"] not in ("-",) and t["report_date"] and t["transaction"]
    ]
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps({
        "meta": {
            "source": "quiver-executive",
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "count": len(rows),
        },
        "trades": rows,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {len(rows)} trades executifs exploitables -> {OUT_PATH}")


if __name__ == "__main__":
    main()
