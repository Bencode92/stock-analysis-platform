"""rebalance_check.py — règle de bande pour le rebalancement.

v6.16 (2026-06-04) — Priorité #2 selon Claude externe :
  "Une bande de tolérance (ne rééquilibrer une ligne que si elle dévie de
   plus de, disons, 5 points absolus de sa cible) est plus efficiente que
   le calendrier seul — moins de frais, et tu n'agis que quand ça compte."

GARDE-FOU CRITIQUE (Claude externe) :
  "La bande de 5 points doit s'appliquer aux LIGNES DU CŒUR (VWCE, or, bonds),
   pas déclencher une re-sélection du satellite. Le but est de remettre les
   poids dérivés vers leur cible QUAND ils dérivent trop, pas de rouvrir le
   choix des actions. Remettre VWCE de 54% à 50% = oui. Re-screener les 5
   satellites parce qu'une ligne a bougé = non."

Outil de POIDS, pas de SÉLECTION.

Usage:
    # Compare la cible (portfolios.json) avec un fichier d'allocations actuelles
    python3 scripts/rebalance_check.py --current data/current_holdings.json --profile "Modéré"

    # Ou en mode interactif (entre les poids actuels au prompt)
    python3 scripts/rebalance_check.py --profile "Modéré"

Format data/current_holdings.json (optionnel) :
    {
      "Modéré": {
        "VWCE.DE": 53.5,   # poids actuel en %
        "AGGH.AS": 13.0,
        ...
      }
    }
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent

# Seuil de bande : ne rééquilibrer une ligne que si elle dévie de >= 5 points absolus
BAND_THRESHOLD_PCT = 5.0


def load_target_allocation(profile: str) -> dict:
    """Charge l'allocation cible depuis data/portfolios.json."""
    pf_path = ROOT / "data" / "portfolios.json"
    if not pf_path.exists():
        print(f"❌ {pf_path} introuvable.")
        sys.exit(1)
    d = json.load(open(pf_path))
    prof = d.get(profile, {})
    meta = prof.get("_tickers_meta", {})
    if not meta:
        print(f"❌ Profil '{profile}' n'a pas de _tickers_meta.")
        sys.exit(1)
    return {tk: m.get("weight", 0) * 100 for tk, m in meta.items()}


def load_current_holdings(path: str, profile: str) -> dict:
    """Charge l'allocation actuelle depuis un fichier optionnel."""
    p = Path(path)
    if not p.exists():
        return {}
    d = json.load(open(p))
    return d.get(profile, {})


def check_rebalance(target: dict, current: dict, profile: str):
    """Compare cible vs actuelle, affiche les lignes à rééquilibrer."""
    print(f"\n{'='*78}")
    print(f"  RULE OF BANDS — {profile} (seuil ±{BAND_THRESHOLD_PCT} pts)")
    print(f"{'='*78}")
    print(f"\n  {'Ticker':12} {'Cible':>8} {'Actuel':>8} {'Dérive':>9} {'Action':>30}")
    print("  " + "-" * 70)

    actions = []
    all_tickers = set(target) | set(current)

    for tk in sorted(all_tickers):
        t_pct = target.get(tk, 0)
        c_pct = current.get(tk, 0)
        drift = c_pct - t_pct

        # GARDE-FOU CRITIQUE : on ne RAJOUTE PAS de nouvelles lignes ni n'enlève
        # de lignes du panier — la bande agit uniquement sur les POIDS des lignes
        # existantes (cœur ou satellite déjà sélectionné par le pipeline).
        if t_pct == 0 and c_pct > 0:
            # Ligne en trop (vendue par dérive cible mais toujours détenue) — alerte
            action = f"⚠️ ligne hors cible (vendre {c_pct:.1f}%)"
            actions.append((tk, t_pct, c_pct, drift, action))
            continue
        if t_pct > 0 and c_pct == 0:
            # Ligne attendue mais absente — alerte
            action = f"⚠️ ligne manquante (acheter {t_pct:.1f}%)"
            actions.append((tk, t_pct, c_pct, drift, action))
            continue

        if abs(drift) >= BAND_THRESHOLD_PCT:
            sign = "+" if drift > 0 else ""
            action = f"⚙️ rebalance ({sign}{drift:.1f} pts hors bande)"
            actions.append((tk, t_pct, c_pct, drift, action))
        # else : dans la bande, ne fait RIEN (économie de frais)

    if not actions:
        print(f"\n  ✅ Toutes les lignes sont dans la bande ±{BAND_THRESHOLD_PCT} pts.")
        print(f"     AUCUN rééquilibrage nécessaire — économie de frais.\n")
    else:
        for tk, t_pct, c_pct, drift, action in actions:
            sign = "+" if drift > 0 else ""
            print(f"  {tk:12} {t_pct:>7.1f}% {c_pct:>7.1f}% {sign}{drift:>7.1f}  {action}")

        print(f"\n  📊 {len(actions)} ligne(s) à rééquilibrer (vs {len(all_tickers)} totales)")
        n_in_band = len(all_tickers) - len(actions)
        if n_in_band > 0:
            print(f"  ✅ {n_in_band} ligne(s) dans la bande ±{BAND_THRESHOLD_PCT} pts — pas touche")
        print(f"\n  ⚠️  RAPPEL :")
        print(f"     - Cette règle s'applique aux POIDS des lignes existantes uniquement.")
        print(f"     - Pas de re-sélection du satellite via cette règle.")
        print(f"     - Les satellites sont recalculés à chaque run du pipeline complet.")

    print(f"\n{'='*78}\n")


def main():
    ap = argparse.ArgumentParser(description="Vérifie quelles lignes du portefeuille sont hors bande ±5 pts.")
    ap.add_argument("--profile", "-p", required=True,
                    choices=["Stable", "Modéré", "Agressif", "Agressif-Thematique"],
                    help="Profil à vérifier")
    ap.add_argument("--current", "-c", default="data/current_holdings.json",
                    help="Fichier JSON des allocations actuelles (défaut: data/current_holdings.json)")
    args = ap.parse_args()

    target = load_target_allocation(args.profile)
    current = load_current_holdings(args.current, args.profile)

    if not current:
        print(f"⚠️  Pas de fichier {args.current} trouvé pour le profil '{args.profile}'.")
        print(f"   Crée-le manuellement (format JSON: {{\"{args.profile}\": {{\"VWCE.DE\": 53.5, ...}}}})")
        print(f"   ou utilise la cible comme test (toutes lignes dans bande):")
        current = target.copy()  # test : montre que tout est OK quand current == target

    check_rebalance(target, current, args.profile)


if __name__ == "__main__":
    main()
