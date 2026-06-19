"""Build derived metrics from raw fundamentals — Étape 6 (2026-06-19).

Construit la couche derived/ depuis les JSON bruts de raw/ :
- Applique les exclusions tracées (TSM, ITX, CS, LVMH, BMED) avec raison
- Normalise BABA /8 si shares > 10000M (flag shares_normalized=True)
- Force diluted shares partout (déjà le défaut du fetcher)
- Interpole les trous isolés (INFY 2026, BVI 2025)
- Calcule ROE, ROIC, D/E, FCF yield, P/E par année
- Calcule buffett_score (6 critères) et buffett_score_no_valuation (5 critères)
  par fiscal_date avec rolling 3y sur ROE/ROIC (point-in-time, lag interne)
- Re-check anomalies en sortie → DOIT sortir 0

Le brut dans raw/ N'EST JAMAIS modifié. Tout dans derived/ est recalculable.

Exigences Fabre 2026-06-19 :
1. Exclusions tracées dans CSV avec exclusion_reason
2. BABA flaggé shares_normalized=True (transformation visible et réversible)
3. Re-check anomalies en sortie = confirmation que derived/ est propre

Outputs :
- data/fundamentals_history/derived/metrics_by_year.csv
- data/fundamentals_history/derived/excluded_stocks.csv
- data/fundamentals_history/derived/_recheck_report.json
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from statistics import mean, stdev
from typing import Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "data" / "fundamentals_history" / "raw"
DERIVED_DIR = PROJECT_ROOT / "data" / "fundamentals_history" / "derived"

# ─── Exclusions tracées avec raison ─────────────────────────────────────────
# Fabre 2026-06-19 : la raison doit voyager avec la donnée. Une exclusion
# non tracée est un trou qui se redéguise en oubli dans 3 mois.
EXCLUDED = {
    "TSM":  "unit corruption (170,866 milliards shares 2023 — physiquement impossible, ratio incohérent)",
    "ITX":  "unit corruption (8.8M shares vs 3.1B réels chez Inditex — facteur ~350× inexplicable)",
    "CS":   "non-constant ratio TD/réel (8.8 → 5.88 → 3.67 sur 3 ans — AXA n'a pas d'ADR NYSE, pas de normalisation possible)",
    "LVMH": "no historical data in Twelve Data",
    "BMED": "no historical data in Twelve Data",
}

# ─── Normalisation BABA ─────────────────────────────────────────────────────
# BABA : ratio ADR officiel 1:8. TD switch ordinary→ADR entre FY2023 et FY2024.
# 2023 TD = 19,013M ordinary ≈ 2,377M ADR équivalent (19,013/8).
# 2024 TD = 2,522M ADR.
# Fix : si shares > 10,000M → /8. Flag shares_normalized=True pour traçabilité.
BABA_NORMALIZATION_THRESHOLD = 10_000_000_000  # 10B shares

# ─── Trous isolés à interpoler ──────────────────────────────────────────────
# Trous shares_outstanding (mais reste des données dans income_statement) :
# Fabre : interpoler avec moyenne des années adjacentes pour ne pas perdre l'année.
INTERPOLATION_TARGETS = {
    ("INFY", "2026-03-31"),
    ("BVI", "2025-12-31"),
}

# ─── Années spécifiques à exclure (Fabre 2026-06-19 — approche I chirurgicale) ──
# Préserver les stocks (ANET, V, NOVN, SAP, ASML, LOGN sont armés pour le test α/β),
# mais retirer les années où TD a des valeurs corrompues ou changement de convention
# non-identifiable. Chaque exclusion tracée avec sa RAISON exacte.
EXCLUDED_YEARS = {
    ("ASML", "2024-12-31"): "TD bug ponctuel (470M shares isolé vs 377-388M autres années — saut puis retour)",
    ("LOGN", "2009-12-31"): "gap d'historique 2009→2020 (TD a renvoyé 2009 isolée sans années intermédiaires)",
    ("NOVN", "2024-12-31"): "TD bug post-Sandoz spinoff (spinoff 1:5 = dividend-in-kind, ne modifie PAS les shares NOVN — vérifié Macrotrends)",
    ("NOVN", "2025-12-31"): "TD bug post-Sandoz spinoff (même cause)",
    ("SAP",  "2024-12-31"): "TD bug ponctuel (1376M vs 1126-1166M autres — pas de split/levée massive SAP 2024)",
    ("SAP",  "2025-12-31"): "TD bug ponctuel (retour bas après saut 2024)",
    ("V",    "2022-09-30"): "TD alterne Class A seul (~1650M) vs total A+B+C (~2130M) selon années — exclu Class A pour cohérence",
    ("V",    "2025-09-30"): "TD revient à Class A seul (1942M) — exclu pour cohérence convention 'total'",
}

# ─── Fix split partiel TD (Fabre 2026-06-19 — exigence #2 : continuité mcap) ──
# ANET : split 4:1 le 17 juin 2024. TD a ajusté 2023+ rétroactivement mais PAS
# 2020-2022 → fix shares × 4 sur années pré-2023.
# IMPORTANT : le market_cap stocké en raw/ est déjà CORRECT (prix ajusté × shares
# non-ajusté = valeur de marché réelle au moment T). Le fix shares NE TOUCHE PAS
# au market_cap (sinon double-comptage du split). Le contrôle continuité mcap
# (réalisé en fin de run) confirme l'absence de saut.
SPLIT_FIX = {
    "ANET": {"factor": 4.0, "before_date": "2023-01-01",
             "reason": "split 4:1 17 juin 2024 — TD a ajusté 2023+ mais pas 2020-2022"},
}

# ─── Auto-exclusion sur anomalies détectées (univers élargi S&P 500, 2026-06-19) ──
# Règle déterministe défendable a priori (cohérente pré-déclaration (D)) :
# - Saut shares > 200% sur une année consécutive = corruption pure type TSM
#   → exclusion du STOCK entier (les autres années sont inexploitables car
#     market_cap pollué par les shares fausses)
# - Saut shares entre 15% et 200% = anomalie année isolée
#   → exclusion de l'ANNÉE concernée (ticker conservé)
AUTO_EXCLUSION_THRESHOLD_STOCK = 2.0    # 200% : corruption pure
AUTO_EXCLUSION_THRESHOLD_YEAR = 0.15    # 15% : seuil détecteur


def load_raw(ticker: str, endpoint: str) -> Optional[dict]:
    """Charge un JSON brut. None si absent."""
    safe = ticker.replace("/", "_").replace(":", "_")
    path = RAW_DIR / f"{safe}_{endpoint}.json"
    if not path.exists():
        return None
    with path.open() as f:
        return json.load(f)


def load_market_cap(ticker: str) -> dict:
    """Charge le market_cap par fiscal_date."""
    safe = ticker.replace("/", "_").replace(":", "_")
    path = RAW_DIR / f"{safe}_market_cap.json"
    if not path.exists():
        return {}
    with path.open() as f:
        return json.load(f)


def extract_field(stmt: dict, *paths) -> Optional[float]:
    """Extrait un champ depuis une structure imbriquée (path multiple)."""
    for path in paths:
        parts = path.split(".")
        val = stmt
        try:
            for p in parts:
                val = val[p]
            if val is not None:
                return float(val)
        except (KeyError, TypeError, ValueError):
            continue
    return None


def extract_shares_outstanding(income_statement_payload: dict) -> dict:
    """Extrait shares_outstanding (diluted prioritaire) par fiscal_date depuis income_statement."""
    result = {}
    for stmt in income_statement_payload.get("income_statement", []) if isinstance(income_statement_payload, dict) else []:
        fd = stmt.get("fiscal_date")
        if not fd:
            continue
        shares = stmt.get("diluted_shares_outstanding") or stmt.get("basic_shares_outstanding")
        if shares is not None:
            result[fd] = float(shares)
    return result


def detect_share_anomalies_for_ticker(shares_by_date: dict, threshold: float = AUTO_EXCLUSION_THRESHOLD_YEAR) -> dict:
    """Détecte les années avec saut shares > threshold. Retourne {fiscal_date: max_jump}."""
    sorted_dates = sorted(shares_by_date.keys())
    anomalies = {}
    for i in range(1, len(sorted_dates)):
        fd_prev, fd_curr = sorted_dates[i - 1], sorted_dates[i]
        s_prev, s_curr = shares_by_date.get(fd_prev), shares_by_date.get(fd_curr)
        if not s_prev or not s_curr or s_prev <= 0:
            continue
        delta = abs(s_curr / s_prev - 1.0)
        if delta > threshold:
            anomalies[fd_curr] = max(anomalies.get(fd_curr, 0), delta)
    return anomalies


def is_ticker_corrupted(shares_by_date: dict) -> tuple[bool, Optional[str]]:
    """Test corruption ticker entier : ≥ 1 saut > AUTO_EXCLUSION_THRESHOLD_STOCK (200%)."""
    anomalies = detect_share_anomalies_for_ticker(shares_by_date, threshold=AUTO_EXCLUSION_THRESHOLD_STOCK)
    if anomalies:
        worst_date, worst_jump = max(anomalies.items(), key=lambda x: x[1])
        return True, f"TD corruption auto-detected, share jump {worst_jump*100:.0f}% at {worst_date}"
    return False, None


def build_ticker_metrics(ticker: str) -> tuple[list[dict], list[str]]:
    """Calcule les métriques annuelles d'un ticker. Retourne (rows, transforms_applied)."""
    inc_payload = load_raw(ticker, "income_statement")
    bs_payload = load_raw(ticker, "balance_sheet")
    cf_payload = load_raw(ticker, "cash_flow")
    market_caps = load_market_cap(ticker)

    if not inc_payload:
        return [], [f"NO_INCOME_STATEMENT"]

    inc_by_date = {s["fiscal_date"]: s for s in inc_payload.get("income_statement", []) if "fiscal_date" in s}
    bs_by_date = {s["fiscal_date"]: s for s in (bs_payload.get("balance_sheet", []) if bs_payload else []) if "fiscal_date" in s}
    cf_by_date = {s["fiscal_date"]: s for s in (cf_payload.get("cash_flow", []) if cf_payload else []) if "fiscal_date" in s}

    dates = sorted(inc_by_date.keys())
    rows = []
    transforms = []

    # Première passe : extraire et normaliser shares
    shares_by_date = {}
    for fd in dates:
        inc = inc_by_date[fd]
        # Force diluted partout (cohérence définition, évite les sauts basic↔diluted)
        shares = inc.get("diluted_shares_outstanding") or inc.get("basic_shares_outstanding")
        if shares is None:
            continue
        shares = float(shares)
        # Normalisation BABA (ratio ADR 1:8)
        if ticker == "BABA" and shares > BABA_NORMALIZATION_THRESHOLD:
            old_shares = shares
            shares = shares / 8.0
            transforms.append(f"{fd}: BABA normalized {old_shares/1e6:.1f}M → {shares/1e6:.1f}M (÷8 ADR)")
        # Fix split partiel ANET (split 4:1 juin 2024 — TD ajusté 2023+, pas 2020-2022)
        if ticker in SPLIT_FIX:
            cfg = SPLIT_FIX[ticker]
            if fd < cfg["before_date"]:
                old_shares = shares
                shares = shares * cfg["factor"]
                transforms.append(f"{fd}: {ticker} split fix x{cfg['factor']} ({old_shares/1e6:.1f}M → {shares/1e6:.1f}M) — {cfg['reason']}")
        shares_by_date[fd] = shares

    # Interpolation des trous isolés (INFY 2026, BVI 2025)
    for fd in dates:
        if fd in shares_by_date:
            continue
        if (ticker, fd) not in INTERPOLATION_TARGETS:
            continue
        # Trouve années adjacentes pour interpoler
        idx = dates.index(fd)
        prev_fd = dates[idx - 1] if idx > 0 else None
        next_fd = dates[idx + 1] if idx < len(dates) - 1 else None
        candidates = [shares_by_date[d] for d in (prev_fd, next_fd) if d and d in shares_by_date]
        if candidates:
            shares_by_date[fd] = mean(candidates)
            transforms.append(f"{fd}: interpolated shares {shares_by_date[fd]/1e6:.1f}M (avg of {[d for d in (prev_fd, next_fd) if d and d in shares_by_date]})")

    # Deuxième passe : calcul des métriques par année
    # Pour rolling 3y on collecte d'abord ROE/ROIC par année, puis calculs glissants
    metrics_raw = []
    for fd in dates:
        inc = inc_by_date[fd]
        bs = bs_by_date.get(fd, {})
        cf = cf_by_date.get(fd, {})
        shares = shares_by_date.get(fd)
        mcap = market_caps.get(fd)

        net_income = extract_field(inc, "net_income")
        operating_income = extract_field(inc, "operating_income", "ebit")
        income_tax = extract_field(inc, "income_tax")
        pretax_income = extract_field(inc, "pretax_income")

        # Balance sheet
        total_equity = extract_field(bs, "shareholders_equity.total_shareholders_equity",
                                     "shareholders_equity.common_stock_equity")
        total_debt = (extract_field(bs, "liabilities.non_current_liabilities.long_term_debt") or 0) + \
                     (extract_field(bs, "liabilities.current_liabilities.short_term_debt", "liabilities.current_liabilities.current_debt") or 0)
        if total_debt == 0:
            total_debt = extract_field(bs, "liabilities.total_debt")

        # Cash flow
        fcf = extract_field(cf, "free_cash_flow")

        # Métriques
        roe = (net_income / total_equity * 100) if (net_income is not None and total_equity and total_equity > 0) else None
        de_ratio = (total_debt / total_equity) if (total_debt is not None and total_equity and total_equity > 0) else None

        # ROIC = NOPAT / (debt + equity) ; tax_rate = income_tax / pretax_income
        if pretax_income and pretax_income > 0 and income_tax is not None and operating_income is not None:
            tax_rate = income_tax / pretax_income
            nopat = operating_income * (1 - tax_rate)
            invested_capital = (total_debt or 0) + (total_equity or 0)
            roic = (nopat / invested_capital * 100) if invested_capital > 0 else None
        else:
            roic = None

        fcf_yield = (fcf / mcap * 100) if (fcf is not None and mcap and mcap > 0) else None
        pe_ratio = (mcap / net_income) if (mcap and net_income and net_income > 0) else None

        metrics_raw.append({
            "fiscal_date": fd,
            "shares_outstanding": shares,
            "shares_normalized": (ticker == "BABA" and inc_by_date[fd].get("diluted_shares_outstanding", inc_by_date[fd].get("basic_shares_outstanding", 0)) > BABA_NORMALIZATION_THRESHOLD),
            "market_cap": mcap,
            "net_income": net_income,
            "total_equity": total_equity,
            "total_debt": total_debt,
            "free_cash_flow": fcf,
            "operating_income": operating_income,
            "roe": roe,
            "roic": roic,
            "de_ratio": de_ratio,
            "fcf_yield": fcf_yield,
            "pe_ratio": pe_ratio,
        })

    # Rolling 3y ROE et ROIC pour Buffett (avg + std)
    for i, m in enumerate(metrics_raw):
        window = metrics_raw[max(0, i - 2): i + 1]
        roe_vals = [w["roe"] for w in window if w["roe"] is not None]
        roic_vals = [w["roic"] for w in window if w["roic"] is not None]
        m["roe_avg_3y"] = mean(roe_vals) if roe_vals else None
        m["roe_std_3y"] = stdev(roe_vals) if len(roe_vals) >= 2 else None
        m["roic_avg_3y"] = mean(roic_vals) if roic_vals else None

    # Scoring Buffett par année (6 critères + version no_valuation 5 critères)
    for m in metrics_raw:
        criteria_passed = {}
        # 1. roe_consistent : avg 3y >= 15% ET cv < 30%
        roe_avg = m["roe_avg_3y"]
        roe_std = m["roe_std_3y"]
        if roe_avg is not None:
            roe_ok = roe_avg >= 15
            cv_ok = (roe_std is None) or (abs(roe_avg) > 0 and roe_std / abs(roe_avg) < 0.30)
            criteria_passed["roe_consistent"] = roe_ok and cv_ok
        # 2. roic_moat : avg 3y >= 10
        if m["roic_avg_3y"] is not None:
            criteria_passed["roic_moat"] = m["roic_avg_3y"] >= 10
        # 3. leverage_safe : 0 <= D/E <= 1.5
        if m["de_ratio"] is not None:
            criteria_passed["leverage_safe"] = 0 <= m["de_ratio"] <= 1.5
        # 4. cash_generation : FCF yield > 3
        if m["fcf_yield"] is not None:
            criteria_passed["cash_generation"] = m["fcf_yield"] > 3
        # 5. valuation_ok : 0 < PE <= 25
        if m["pe_ratio"] is not None:
            criteria_passed["valuation_ok"] = 0 < m["pe_ratio"] <= 25
        # 6. moat_expansion : roe_N / roe_avg_3y >= 0.90
        if m["roe"] is not None and m["roe_avg_3y"] and m["roe_avg_3y"] > 0:
            criteria_passed["moat_expansion"] = (m["roe"] / m["roe_avg_3y"]) >= 0.90

        n_total = len(criteria_passed)
        n_passed = sum(1 for v in criteria_passed.values() if v)
        m["buffett_score"] = round(n_passed / n_total * 100) if n_total >= 2 else None

        # No-valuation : exclure le critère valuation_ok
        criteria_no_val = {k: v for k, v in criteria_passed.items() if k != "valuation_ok"}
        n_total_nv = len(criteria_no_val)
        n_passed_nv = sum(1 for v in criteria_no_val.values() if v)
        m["buffett_score_no_valuation"] = round(n_passed_nv / n_total_nv * 100) if n_total_nv >= 2 else None

        # Ajout métadonnées
        m["ticker"] = ticker
        m["criteria_total"] = n_total
        # Marquage EXCLUDED_YEARS manuel (Fabre 2026-06-19 — préserve stock, retire l'année)
        excl_reason = EXCLUDED_YEARS.get((ticker, m["fiscal_date"]))
        m["excluded_year"] = bool(excl_reason)
        m["excluded_year_reason"] = excl_reason or ""

    # Auto-exclusion années avec saut shares > 15% (univers élargi 2026-06-19)
    auto_anomalies = detect_share_anomalies_for_ticker(shares_by_date)
    for m in metrics_raw:
        fd = m["fiscal_date"]
        if fd in auto_anomalies and not m["excluded_year"]:
            jump = auto_anomalies[fd] * 100
            m["excluded_year"] = True
            m["excluded_year_reason"] = f"AUTO: shares jump {jump:+.1f}% vs année précédente (seuil 15%)"

    return metrics_raw, transforms


def check_anet_mcap_continuity(rows: list[dict]) -> Optional[str]:
    """Garantie structurelle : le fix split shares ANET ne doit PAS toucher au mcap.

    Le mcap brut dans raw/{ANET}_market_cap.json est par construction correct
    (prix TD × shares TD au moment T). Le fix shares × 4 dans derived/ s'applique
    UNIQUEMENT au champ shares_outstanding pour cohérence inter-année du détecteur.
    Le mcap stocké en derived doit rester IDENTIQUE au mcap brut.

    Check : pour chaque ANET row, mcap_derived == mcap_raw (preuve que le fix
    shares n'a pas pollué le mcap par recalcul shares × prix accidentel).
    """
    anet = [r for r in rows if r["ticker"] == "ANET"]
    raw_mcap = load_market_cap("ANET")
    mismatches = []
    for r in anet:
        fd = r["fiscal_date"]
        m_derived = r.get("market_cap")
        m_raw = raw_mcap.get(fd)
        if m_derived is None or m_raw is None:
            continue
        if abs(m_derived - m_raw) > 1.0:  # tolérance arrondi flottant
            mismatches.append(f"{fd}: derived ${m_derived/1e9:.3f}B ≠ raw ${m_raw/1e9:.3f}B")
    if mismatches:
        return ("ANET mcap modifié par fix shares (double-comptage du split) : "
                + "; ".join(mismatches))
    return None


def detect_anomalies_on_derived(rows: list[dict], threshold: float = 0.15) -> list[str]:
    """Re-check anomalies inter-année sur shares_outstanding NORMALISÉ.

    Doit sortir 0 anomalies si les normalisations + interpolations + exclusions
    sont correctes. C'est la vérification de sortie exigée par Fabre.

    Filtre :
    - Skip les lignes EXCLUDED_YEARS (déjà tracées hors scoring)
    - Skip si gap > 1.5 ans entre fiscal_dates consécutives (cas LOGN 2009→2020,
      ce n'est pas une vraie anomalie inter-année consécutive)
    """
    flags = []
    by_ticker = {}
    for r in rows:
        if r.get("excluded_year"):
            continue  # année déjà tracée hors scoring
        by_ticker.setdefault(r["ticker"], []).append(r)
    for ticker, ts in by_ticker.items():
        ts_sorted = sorted(ts, key=lambda x: x["fiscal_date"])
        for i in range(1, len(ts_sorted)):
            prev, curr = ts_sorted[i - 1], ts_sorted[i]
            s_prev, s_curr = prev.get("shares_outstanding"), curr.get("shares_outstanding")
            if not s_prev or not s_curr or s_prev <= 0:
                continue
            # Skip si gap > 1.5 ans (pas une vraie anomalie consécutive)
            try:
                from datetime import datetime
                d_prev = datetime.fromisoformat(prev["fiscal_date"])
                d_curr = datetime.fromisoformat(curr["fiscal_date"])
                if (d_curr - d_prev).days > 547:  # ~1.5 ans
                    continue
            except (ValueError, KeyError):
                pass
            delta = (s_curr / s_prev) - 1.0
            if abs(delta) > threshold:
                sign = "+" if delta > 0 else ""
                flags.append(
                    f"RÉSIDUEL {ticker} {curr['fiscal_date']}: {s_curr/1e6:.1f}M vs "
                    f"{s_prev/1e6:.1f}M ({sign}{delta*100:.1f}%) — normalisation insuffisante"
                )
    return flags


def main() -> int:
    DERIVED_DIR.mkdir(parents=True, exist_ok=True)

    # Liste tickers depuis raw/
    ticker_files = sorted({p.stem.rsplit("_", 2)[0]
                           for p in RAW_DIR.glob("*_income_statement.json")})
    print(f"Tickers détectés dans raw/: {len(ticker_files)}")
    print(f"Exclusions doctrinales: {list(EXCLUDED.keys())}")

    all_rows = []
    all_transforms = {}
    excluded_rows = []

    for ticker in ticker_files:
        if ticker in EXCLUDED:
            excluded_rows.append({"ticker": ticker, "exclusion_reason": EXCLUDED[ticker]})
            continue

        # Auto-test corruption ticker entier (saut > 200% sur shares)
        inc_payload = load_raw(ticker, "income_statement")
        if inc_payload:
            shares_pre_check = extract_shares_outstanding(inc_payload)
            corrupted, corr_reason = is_ticker_corrupted(shares_pre_check)
            if corrupted:
                excluded_rows.append({"ticker": ticker, "exclusion_reason": corr_reason})
                continue

        rows, transforms = build_ticker_metrics(ticker)
        if not rows:
            excluded_rows.append({
                "ticker": ticker,
                "exclusion_reason": "no_metrics_built (income_statement vide ou inutilisable)"
            })
            continue
        all_rows.extend(rows)
        if transforms:
            all_transforms[ticker] = transforms

    print(f"\nMétriques calculées : {len(all_rows)} lignes sur {len({r['ticker'] for r in all_rows})} stocks")
    print(f"Exclusions tracées : {len(excluded_rows)} stocks")

    # Re-check anomalies sur shares NORMALISÉ
    print(f"\n=== RE-CHECK ANOMALIES sur shares normalisé (seuil 15%) ===")
    residual_flags = detect_anomalies_on_derived(all_rows)
    if residual_flags:
        print(f"⚠️  {len(residual_flags)} anomalie(s) RÉSIDUELLE(S) — normalisation insuffisante :")
        for f in residual_flags:
            print(f"  - {f}")
    else:
        print(f"✓ 0 anomalie résiduelle — derived/ propre, prêt pour scoring")

    # Contrôle continuité market_cap ANET (exigence Fabre #2 — pas de double-comptage split)
    print(f"\n=== CONTRÔLE CONTINUITÉ MARKET_CAP ANET (split fix) ===")
    anet_mcap_warning = check_anet_mcap_continuity(all_rows)
    if anet_mcap_warning:
        print(f"⚠️  {anet_mcap_warning}")
    else:
        print(f"✓ ANET mcap continu sur toutes les années — split fix appliqué correctement")

    # Compte des exclusions années
    n_excluded_years = sum(1 for r in all_rows if r.get("excluded_year"))
    print(f"\nExclusions années (EXCLUDED_YEARS chirurgical) : {n_excluded_years} lignes tracées")
    for (tk, fd), reason in sorted(EXCLUDED_YEARS.items()):
        print(f"  - {tk} {fd} : {reason}")

    # Note Fabre 2026-06-19 — biais géographique et fragilité EU 2024-2025
    print(f"\n=== NOTES DE LECTURE BACKTEST (Fabre 2026-06-19) ===")
    print(f"⚠️  Univers a perdu LVMH, TSM, ITX, CS → penche plus US qu'à l'origine.")
    print(f"   Verdict α/β sera surtout valide pour le sleeve US. Signal EU/EM réduit.")
    print(f"⚠️  Pattern systématique TD : 2024-2025 EU fragile (ASML, NOVN, SAP tous bugged).")
    print(f"   Garder en tête au moment de lire le backtest 2024-2026 (rotation visée).")

    # Écriture CSV métriques
    metrics_csv = DERIVED_DIR / "metrics_by_year.csv"
    fieldnames = ["ticker", "fiscal_date", "excluded_year", "excluded_year_reason",
                  "shares_outstanding", "shares_normalized",
                  "market_cap", "net_income", "total_equity", "total_debt", "free_cash_flow",
                  "operating_income", "roe", "roic", "de_ratio", "fcf_yield", "pe_ratio",
                  "roe_avg_3y", "roe_std_3y", "roic_avg_3y",
                  "buffett_score", "buffett_score_no_valuation", "criteria_total"]
    with metrics_csv.open("w") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for r in sorted(all_rows, key=lambda x: (x["ticker"], x["fiscal_date"])):
            writer.writerow(r)
    print(f"\n✓ Écrit : {metrics_csv} ({len(all_rows)} lignes)")

    # Écriture exclusions
    excluded_csv = DERIVED_DIR / "excluded_stocks.csv"
    with excluded_csv.open("w") as f:
        writer = csv.DictWriter(f, fieldnames=["ticker", "exclusion_reason"])
        writer.writeheader()
        for r in sorted(excluded_rows, key=lambda x: x["ticker"]):
            writer.writerow(r)
    print(f"✓ Écrit : {excluded_csv} ({len(excluded_rows)} stocks exclus)")

    # Rapport de re-check
    n_active = sum(1 for r in all_rows if not r.get("excluded_year"))
    recheck = {
        "n_stocks_metrics": len({r["ticker"] for r in all_rows}),
        "n_rows_total": len(all_rows),
        "n_rows_active": n_active,  # rows utilisables pour le scoring (hors excluded_year)
        "n_rows_excluded_years": len(all_rows) - n_active,
        "n_stocks_excluded": len(excluded_rows),
        "excluded_stocks": excluded_rows,
        "excluded_years": [{"ticker": tk, "fiscal_date": fd, "reason": reason}
                            for (tk, fd), reason in sorted(EXCLUDED_YEARS.items())],
        "transforms_applied": all_transforms,
        "residual_anomalies": residual_flags,
        "anet_mcap_continuity_warning": anet_mcap_warning,
        "passed_recheck": len(residual_flags) == 0 and anet_mcap_warning is None,
        "lecture_notes": [
            "Univers penche US (perdu LVMH, TSM, ITX, CS) — verdict α/β surtout valide US",
            "Pattern TD : 2024-2025 EU fragile (ASML, NOVN, SAP tous bugged) — signal rotation EU réduit",
        ],
    }
    report_path = DERIVED_DIR / "_recheck_report.json"
    with report_path.open("w") as f:
        json.dump(recheck, f, indent=2)
    print(f"✓ Écrit : {report_path}")

    print(f"\n{'='*70}")
    print(f"FIN. Univers exploitable : {recheck['n_stocks_metrics']} stocks / "
          f"{recheck['n_rows_active']} lignes actives (hors {recheck['n_rows_excluded_years']} excluded_year).")
    print(f"Re-check anomalies : {'✓ PASS' if not recheck['residual_anomalies'] else '✗ FAIL'}.")
    print(f"Continuité mcap ANET : {'✓ PASS' if not anet_mcap_warning else '✗ FAIL'}.")
    print(f"Verdict global : {'✓ PRÊT POUR SCORING' if recheck['passed_recheck'] else '✗ À INVESTIGUER'}.")
    print(f"{'='*70}")
    return 0 if recheck["passed_recheck"] else 1


if __name__ == "__main__":
    sys.exit(main())
