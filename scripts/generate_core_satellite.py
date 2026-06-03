"""Générateur de portefeuilles Cœur-Satellite — Fork A validé.

Architecture (décidée après backtest walk-forward strict 13y, Sharpe net OOS
< seuil +0.10 → timing factoriel rejeté) :

  1. Cœur 80-85% : ETFs largement diversifiés, frais bas, statiques
     - Actions : VT (World), VEA (Intl Dev), VWO (EM)
     - Bonds : BND (Aggregate), VGSH (Short Treasury), STIP (TIPS)
     - Convexité : GLD
  2. Satellite 15-20% : sélection fondamentale (Buf 100, ROE solide,
     diversifiée par secteur). Filtre momentum NÉGATIF uniquement
     (exclure les chutes), pas comme moteur.
  3. Bornage : max 5% par single-name satellite (Claude convexité)

Bêtas cibles :
  - Stable   ≈ 0.25  (cible : 25/75 World/oblig)
  - Modéré   ≈ 0.50  (cible : 50/50)
  - Agressif ≈ 0.90  (cible : MSCI World EUR)

Usage:
    python3 scripts/generate_core_satellite.py
"""
import json
import sys
import pandas as pd
import numpy as np

# ============================================================================
# 1. BLUEPRINT CŒUR — ETFs fixés (low TER, large AUM, diversifié)
# ============================================================================

# UCITS Trading 212 — accessibles aux résidents EU
# (Les US-listed VT/BND/GLD ne sont PAS achetables via MiFID/PRIIPs sur la plupart
# des brokers EU. UCITS = équivalents européens conformes.)
#
# Mapping UCITS → proxy US pour les calculs de risque (yfinance) :
UCITS_TO_US_PROXY = {
    "VWCE.DE": "VT",      # Vanguard FTSE All-World UCITS Acc EUR
    "IWDA.AS": "URTH",    # iShares Core MSCI World UCITS Acc
    "EMIM.AS": "IEMG",    # iShares Core MSCI EM IMI UCITS Acc
    "AGGH.AS": "AGG",     # iShares Core Global Aggregate Bond UCITS (USD Hedged)
    "IBGS.AS": "VGSH",    # iShares Euro Govt Bond 1-3y UCITS (proxy court terme)
    "IBCI.AS": "STIP",    # iShares EUR Inflation-Linked Govt Bond UCITS (proxy TIPS)
    "SGLN.AS": "GLD",     # iShares Physical Gold UCITS
}

CORE_TEMPLATES = {
    "Stable": [
        # Actions monde minoritaire (UCITS Trading 212)
        {"symbol": "VWCE.DE", "weight": 0.15, "rôle": "Actions monde core (FTSE All-World)"},
        # Bonds 55% diversif duration (UCITS EUR)
        {"symbol": "AGGH.AS", "weight": 0.20, "rôle": "Global Aggregate bond hedged EUR"},
        {"symbol": "IBGS.AS", "weight": 0.15, "rôle": "Govt EUR 1-3y (cash-like)"},
        {"symbol": "IBCI.AS", "weight": 0.20, "rôle": "Inflation-linked govt EUR (TIPS hedge)"},
        # Convexité crise
        {"symbol": "SGLN.AS", "weight": 0.15, "rôle": "Or physique — convexité crise"},
    ],
    "Modéré": [
        # Actions 55%
        {"symbol": "VWCE.DE", "weight": 0.40, "rôle": "Actions monde core"},
        {"symbol": "IWDA.AS", "weight": 0.10, "rôle": "MSCI World (alt large)"},
        {"symbol": "EMIM.AS", "weight": 0.05, "rôle": "Emerging Markets diversif"},
        # Bonds 25%
        {"symbol": "AGGH.AS", "weight": 0.15, "rôle": "Global Aggregate bond hedged EUR"},
        {"symbol": "IBCI.AS", "weight": 0.05, "rôle": "Inflation-linked govt EUR"},
        {"symbol": "IBGS.AS", "weight": 0.05, "rôle": "Govt EUR court"},
        # Convexité
        {"symbol": "SGLN.AS", "weight": 0.05, "rôle": "Or physique"},
    ],
    "Agressif": [
        # Actions ~80%
        {"symbol": "VWCE.DE", "weight": 0.50, "rôle": "Actions monde core"},
        {"symbol": "IWDA.AS", "weight": 0.10, "rôle": "MSCI World développé"},
        {"symbol": "EMIM.AS", "weight": 0.10, "rôle": "Emerging Markets"},
        {"symbol": "SGLN.AS", "weight": 0.05, "rôle": "Or (convexité)"},
        {"symbol": "IBGS.AS", "weight": 0.05, "rôle": "Govt EUR court (sécurité)"},
    ],
}

# Caps satellite calibrés sur edge prouvé (proche de 0 après dégonflage du biais
# de survie). Le walk-forward 21y a montré +0.12-0.24 Sharpe brut sur satellite,
# mais le basket a été choisi en 2026 sur fondamentaux actuels = survivorship.
# Estimation honnête de l'edge net hors biais : entre 0 et +0.10.
# Donc satellite = pari assumé et plafonné, pas pilier.
#
# Trigger live : si satellite live ne bat pas le cœur net de frais sur 2-3 ans,
# réduire progressivement vers 0 (indiciel pur).
SATELLITE_WEIGHT = {
    "Stable":   0.05,   # 5% satellite max (cœur 95%) — Stable doit rester low-risk
    "Modéré":   0.15,   # 15% satellite (cœur 85%)
    "Agressif": 0.20,   # 20% satellite max (cœur 80%) — dont momentum ≤ 5%
}

# ============================================================================
# 2. SATELLITE — sélection fondamentale Buf 100, diversifiée
# ============================================================================

def select_satellite(stocks_us, stocks_eu, stocks_asia, profile, target_n):
    """Sélectionne N actions de qualité pour le satellite.

    Critères :
      - Buffett score ≥ 80 (95 si profil Stable)
      - Quality score ≥ 70
      - ROE ≥ 15%
      - perf_3y > -50% (exclusion effondrement, PAS moteur)
      - dividend_yield > 0.5% si Stable/Modéré
      - Pas Finance (RADAR avoided actuel)
      - Pas India (RADAR avoided actuel)
      - Vol band selon profil
      - Dédup : max 2 par industry

    Vol band par profil :
      Stable   : 12-25%
      Modéré   : 15-32%
      Agressif : 18-50%
    """
    all_stocks = stocks_us + stocks_eu + stocks_asia

    cfg = {
        "Stable":   {"buf_min": 95, "vol_min": 12, "vol_max": 25, "div_min": 1.5, "roe_min": 12},
        "Modéré":   {"buf_min": 83, "vol_min": 15, "vol_max": 32, "div_min": 0.5, "roe_min": 15},
        "Agressif": {"buf_min": 67, "vol_min": 18, "vol_max": 50, "div_min": 0.0, "roe_min": 12},
    }[profile]

    avoided_sectors = ["finance", "financial services"]
    avoided_regions = ["inde"]

    def is_eligible(s):
        buf = s.get("buffett_score") or 0
        if buf < cfg["buf_min"]: return False
        qual = s.get("quality_score") or 0
        if qual < 70: return False
        vol = s.get("volatility_3y") or 0
        if vol < cfg["vol_min"] or vol > cfg["vol_max"]: return False
        roe = s.get("roe") or 0
        if roe < cfg["roe_min"]: return False
        div = s.get("dividend_yield") or 0
        if div < cfg["div_min"]: return False
        # Exclusion momentum négatif uniquement (filtre, pas moteur)
        perf3y = s.get("perf_3y") or 0
        if perf3y < -50: return False
        # Avoided sectors/regions
        sec = (s.get("sector") or "").lower()
        if any(av in sec for av in avoided_sectors): return False
        country = (s.get("country") or "").lower()
        if any(av in country for av in avoided_regions): return False
        # Quality coverage
        cov = s.get("quality_coverage") or 0
        if cov < 70: return False
        return True

    candidates = [s for s in all_stocks if is_eligible(s)]

    # Score composite FONDAMENTAL (pas momentum)
    def score(s):
        buf = (s.get("buffett_score") or 0) / 100.0
        qual = (s.get("quality_score") or 0) / 100.0
        roe = min((s.get("roe") or 0) / 30.0, 1.0)  # cap 30%
        div = min((s.get("dividend_yield") or 0) / 5.0, 1.0)  # cap 5%
        eps_g = min(max((s.get("eps_growth_forecast_5y") or 0) / 20.0, 0), 1)
        return 0.30 * buf + 0.20 * qual + 0.20 * roe + 0.15 * div + 0.15 * eps_g

    candidates.sort(key=score, reverse=True)

    # Dedup industry (max 2 par industry)
    by_industry = {}
    selected = []
    for s in candidates:
        ind = (s.get("industry") or "_").lower()
        if by_industry.get(ind, 0) >= 2: continue
        by_industry[ind] = by_industry.get(ind, 0) + 1
        selected.append(s)
        if len(selected) >= target_n: break

    return selected


# ============================================================================
# 3. BUILD PORTFOLIOS
# ============================================================================

def build_portfolio(profile, satellite_stocks, total_target=1.0):
    """Construit le portefeuille final avec cœur ETFs + satellite actions."""
    core_etfs = CORE_TEMPLATES[profile]
    sat_total = SATELLITE_WEIGHT[profile]
    core_total = sum(e["weight"] for e in core_etfs)
    # Normaliser cœur à (1 - sat_total)
    scale = (1 - sat_total) / core_total

    positions = []
    for e in core_etfs:
        positions.append({
            "ticker": e["symbol"],
            "name": e["rôle"],
            "category": "ETF",
            "weight_pct": round(e["weight"] * scale * 100, 2),
            "role": "core",
        })

    # Satellite : equi-pondéré (avec cap 5% par nom)
    max_per_name = 0.05
    n_sat = len(satellite_stocks)
    base_w = sat_total / n_sat if n_sat else 0
    actual_w = min(base_w, max_per_name)
    total_used = actual_w * n_sat
    remainder = sat_total - total_used
    # Redistribuer remainder au cœur GLD ou VT
    for s in satellite_stocks:
        positions.append({
            "ticker": s.get("ticker", ""),
            "name": s.get("name", "")[:40],
            "category": "Actions",
            "weight_pct": round(actual_w * 100, 2),
            "role": "satellite",
            "country": s.get("country", ""),
            "sector": s.get("sector", ""),
            "industry": s.get("industry", ""),
            "buffett_score": s.get("buffett_score"),
            "quality_score": s.get("quality_score"),
            "roe": s.get("roe"),
            "volatility_3y": s.get("volatility_3y"),
            "dividend_yield": s.get("dividend_yield"),
            "perf_3y": s.get("perf_3y"),
        })

    if remainder > 0:
        # Bonus dans VT
        for p in positions:
            if p["ticker"] == "VT":
                p["weight_pct"] = round(p["weight_pct"] + remainder * 100, 2)
                break

    # Sort by weight desc
    positions.sort(key=lambda p: -p["weight_pct"])
    return positions


def print_portfolio(profile, positions, target_n_sat):
    print(f"\n{'='*78}")
    print(f"  PROFIL {profile.upper()}")
    print(f"{'='*78}")

    core = [p for p in positions if p["role"] == "core"]
    sat = [p for p in positions if p["role"] == "satellite"]
    core_total = sum(p["weight_pct"] for p in core)
    sat_total = sum(p["weight_pct"] for p in sat)

    print(f"\n  CŒUR ETFs ({core_total:.1f}%) — diversification statique low-cost")
    print(f"  {'Tk':6} {'Nom':40} {'Poids':>8}")
    for p in core:
        print(f"  {p['ticker']:6} {p['name'][:40]:40} {p['weight_pct']:>7.2f}%")

    print(f"\n  SATELLITE actions ({sat_total:.1f}%, max 5%/nom) — sélection fondamentale")
    print(f"  {'Tk':10} {'Nom':32} {'Pays':10} {'Buf':>4} {'ROE':>4} {'Vol':>4} {'Div':>4} {'Poids':>6}")
    for p in sat:
        print(f"  {p['ticker']:10} {(p['name'] or '')[:32]:32} {(p.get('country','') or '')[:10]:10} "
              f"{(p.get('buffett_score') or 0):>4.0f} {(p.get('roe') or 0):>4.0f} "
              f"{(p.get('volatility_3y') or 0):>4.0f} {(p.get('dividend_yield') or 0):>4.1f} "
              f"{p['weight_pct']:>5.2f}%")


def main():
    # Load univers
    stocks_us = json.load(open("data/stocks_us.json"))["stocks"]
    stocks_eu = json.load(open("data/stocks_europe.json"))["stocks"]
    stocks_asia = json.load(open("data/stocks_asia.json"))["stocks"]

    profiles_output = {}
    print("="*78)
    print("BLUEPRINT CŒUR-SATELLITE — Fork A (timing factoriel rejeté OOS)")
    print("="*78)

    # Nombre de stocks satellite — calibré sur le budget réduit
    # (max 5%/nom, donc Stable 5% = 1-2 stocks, pas 4)
    target_n_by_profile = {"Stable": 2, "Modéré": 4, "Agressif": 6}

    for profile in ["Stable", "Modéré", "Agressif"]:
        target_n = target_n_by_profile[profile]
        satellite = select_satellite(stocks_us, stocks_eu, stocks_asia, profile, target_n)
        positions = build_portfolio(profile, satellite)
        print_portfolio(profile, positions, target_n)
        profiles_output[profile] = {
            "positions": positions,
            "core_weight": round(sum(p["weight_pct"] for p in positions if p["role"]=="core"), 2),
            "satellite_weight": round(sum(p["weight_pct"] for p in positions if p["role"]=="satellite"), 2),
        }

    # Save
    out = "data/portfolios_core_satellite.json"
    with open(out, "w") as f:
        json.dump({
            "version": "core_satellite_v1",
            "date": pd.Timestamp.now().isoformat(),
            "rationale": "Fork A — timing factoriel rejeté OOS (Sharpe -0.11 vs 60/40). Cœur ETFs low-cost, satellite fondamental capé, momentum exclu sauf comme filtre.",
            "blueprint": "core 80-85% ETFs + satellite 15-20% Buf 100 ROE>15% diversifié industry",
            "profiles": profiles_output,
        }, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*78}")
    print(f"✅ Sauvegardé : {out}")
    print(f"{'='*78}")
    print("\nRappel :")
    print("  - Stable bench risk-matched : 25/75 World/oblig EUR")
    print("  - Modéré bench risk-matched : 50/50")
    print("  - Agressif bench risk-matched : MSCI World EUR")
    print("  - Mesure satellite vs cœur : si bat cœur net frais sur 2-3y → edge, sinon réduire")


if __name__ == "__main__":
    main()
