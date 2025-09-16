import os
import json
import requests
import datetime
import locale
import time
import random
import re
import math
import hashlib
from pathlib import Path
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Tuple
from functools import lru_cache
from collections import defaultdict

# Importer les fonctions d'ajustement des portefeuilles
from portfolio_adjuster import check_portfolio_constraints, adjust_portfolios, get_portfolio_prompt_additions, valid_etfs_cache, valid_bonds_cache
# Importer la fonction de formatage du brief
from brief_formatter import format_brief_data
# ============= PARSER JSON RÉPARATEUR (NOUVEAU) =============

def parse_json_strict_or_repair(s: str) -> dict:
    """Essaye json.loads, sinon répare: retire fences, extrait le bloc {...} externe,
    échappe les retours de ligne dans les chaînes, supprime virgules traînantes, remplace guillemets "". """
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        print("⚠️ JSON invalide détecté, tentative de réparation...")
        
        # 1) retirer fences éventuels
        s2 = re.sub(r'^\s*```(?:json)?\s*', '', s)
        s2 = re.sub(r'\s*```\s*$', '', s2)

        # 2) ne garder que le premier '{' jusqu'au dernier '}'
        start = s2.find('{')
        end = s2.rfind('}')
        if start != -1 and end != -1 and end > start:
            s2 = s2[start:end+1]

        # 3) normaliser guillemets typographiques
        s2 = s2.replace('"', '"').replace('"', '"').replace(''', "'").replace(''', "'")

        # 4) remplacer retours de ligne CR/LF bruts à l'intérieur des chaînes par \n
        out = []
        in_str = False
        esc = False
        for ch in s2:
            if in_str:
                if esc:
                    out.append(ch)
                    esc = False
                elif ch == '\\':
                    out.append(ch)
                    esc = True
                elif ch == '"':
                    out.append(ch)
                    in_str = False
                elif ch in '\r\n':
                    out.append('\\n')
                else:
                    out.append(ch)
            else:
                out.append(ch)
                if ch == '"':
                    in_str = True
        s3 = ''.join(out)

        # 5) supprimer virgules finales avant } ou ]
        s3 = re.sub(r',(\s*[}\]])', r'\1', s3)
        
        print("✅ JSON réparé avec succès")
        return json.loads(s3)


# ============= COMPLIANCE AMF - GARDE-FOUS RÉGLEMENTAIRES =============

BANNED_MARKETING = [
    r"\bacheter\b", r"\bvendre\b", r"\bconserver\b",
    r"\b(prioriser|à\s*privilégier)\b", r"\bfortement recommandé\b",
    r"\bgaranti(e|s)?\b", r"\bsans\s*risque\b",
    r"\bobjectif de prix\b", r"\brendement attendu\b",
    r"\bdevez\b", r"\bil faut\b", r"\bconseillons\b",
    r"\brecommandons\b", r"\bvous devriez\b"
]

def sanitize_marketing_language(text: str) -> str:
    """Supprime le langage d'incitation interdit par l'AMF"""
    out = text or ""
    for pat in BANNED_MARKETING:
        out = re.sub(pat, "[formulation neutre]", out, flags=re.IGNORECASE)
    return out

def get_compliance_block() -> Dict:
    """Retourne le bloc de compliance standardisé AMF"""
    return {
        "jurisdiction": "FR",
        "disclaimer": (
            "Information à caractère purement indicatif et pédagogique. "
            "Ce contenu ne constitue ni un conseil en investissement, ni une recommandation personnalisée, "
            "ni une sollicitation d'achat/vente. Performances passées non indicatives des performances futures. "
            "Vous restez seul responsable de vos décisions. Si besoin, consultez un conseiller en investissement financier (CIF) agréé."
        ),
        "risk_notice": [
            "Les crypto-actifs sont très volatils et peuvent entraîner une perte totale.",
            "Les ETF à effet de levier et produits inverses sont exclus.",
            "Diversification et horizon d'investissement requis.",
            "Risques de change pour les actifs internationaux.",
            "Risque de liquidité sur certains marchés."
        ],
        "sources": ["Données de marché publiques/CSV internes"],
        "last_update": datetime.datetime.utcnow().isoformat() + "Z"
    }

def attach_compliance(portfolios: Dict) -> Dict:
    """Attache le bloc compliance de manière sûre en vérifiant les types"""
    if not isinstance(portfolios, dict):
        return portfolios
    
    block = get_compliance_block()
    for key in ["Agressif", "Modéré", "Stable"]:
        if isinstance(portfolios.get(key), dict):
            portfolios[key]["Compliance"] = block
    return portfolios

# ============= NOUVEAU SYSTÈME DE SCORING V3 - QUANTITATIF =============

# FIX 1: Regex non-capturant pour éviter le warning pandas
LEVERAGED_RE = re.compile(r"(?:2x|3x|ultra|lev|leverage|inverse|bear|-1x|-2x|-3x)", re.I)

def fnum(x):
    """Conversion robuste vers float"""
    s = re.sub(r"[^0-9.\-]", "", str(x or ""))
    try: 
        return float(s) if s not in ("", "-", ".", "-.") else 0.0
    except: 
        return 0.0

def _winsor(x, p=0.02):
    """Winsorisation pour éliminer les outliers"""
    if len(x) == 0: 
        return np.array([])
    lo, hi = np.nanpercentile(x, [p*100, 100-p*100])
    return np.clip(x, lo, hi)

def _z(arr):
    """Z-score normalisé"""
    v = np.array([fnum(a) for a in arr], dtype=float)
    if len(v) == 0: 
        return v
    v = _winsor(v)
    mu, sd = np.nanmean(v), (np.nanstd(v) or 1.0)
    return (v - mu) / sd

def compute_score(rows, kind):
    """
    Calcul du score quantitatif : momentum - risque - sur-extension + liquidité
    rows: [{name, perf_1m, perf_3m, perf_90d, perf_24h, perf_7d, ytd, vol30, vol_3y, maxdd90, liquidity}]
    kind: 'equity' | 'etf' | 'crypto'
    """
    n = len(rows)
    if n == 0: 
        return rows

    # -- Momentum adaptatif selon le type d'actif
    if kind == "crypto":
        mom_raw = [0.5*fnum(r.get("perf_7d")) + 0.5*fnum(r.get("perf_24h")) for r in rows]
    else:
        # Fallback robuste si 1m/3m manquants : 0.7*YTD + 0.3*Daily*20
        m1 = [fnum(r.get("perf_1m")) for r in rows]
        m3 = [fnum(r.get("perf_3m")) for r in rows]
        m90= [fnum(r.get("perf_90d")) for r in rows]
        ytd= [fnum(r.get("ytd")) for r in rows]
        d1 = [fnum(r.get("perf_24h")) for r in rows]
        have_m = any(m3) or any(m1) or any(m90)
        if have_m:
            mom_raw = [0.5*m3[i] + 0.3*m1[i] + 0.2*m90[i] for i in range(n)]
        else:
            mom_raw = [0.7*ytd[i] + 0.3*(d1[i]*20.0) for i in range(n)]
    mom = _z(mom_raw)

    # -- Mesure du risque (volatilité + drawdown)
    vol30 = [fnum(r.get("vol30")) for r in rows]
    vol3y = [fnum(r.get("vol_3y")) for r in rows]
    vol_used = [vol30[i] if vol30[i] != 0 else vol3y[i] for i in range(n)]
    risk_vol = _z(vol_used)

    # drawdown: toujours en valeur absolue
    dd = [abs(fnum(r.get("maxdd90"))) for r in rows]
    risk_dd = _z(dd) if any(dd) else np.zeros(n)

    # -- Détection de sur-extension (anti-fin-de-cycle)
    ytd = [fnum(r.get("ytd")) for r in rows]
    p1m = [fnum(r.get("perf_1m")) for r in rows]
    p7d = [fnum(r.get("perf_7d")) for r in rows]
    p24 = [fnum(r.get("perf_24h")) for r in rows]
    overext = []
    for i, r in enumerate(rows):
        if kind == "crypto":
            decel = p24[i] < (p7d[i]/3.0)
        else:
            decel = p1m[i] < (fnum(r.get("perf_3m"))/3.0)
        
        flag = (ytd[i] > 80 and (p1m[i] <= 0 or decel)) or (ytd[i] > 150)
        overext.append(1.0 if flag else 0.0)
        r["flags"] = {"overextended": bool(flag)}

    # -- Bonus liquidité (évite les nains illiquides)
    liq = _z([math.log(max(fnum(r.get("liquidity")), 1.0)) for r in rows]) if any(fnum(r.get("liquidity")) for r in rows) else np.zeros(n)
    liq_weight = 0.30 if kind == "etf" else (0.15 if kind == "equity" else 0.0)

    # -- Score final : momentum - risque - sur-extension + liquidité
    score = mom - (0.6*risk_vol + 0.4*risk_dd) - np.array(overext)*0.8 + liq_weight*liq
    
    for i, r in enumerate(rows):
        r["score"] = float(score[i])
    
    return rows

def read_combined_etf_csv(path_csv):
    """
    FIX 2: Lecture et préparation des ETF avec détection corrigée des ETF à effet de levier
    """
    df = pd.read_csv(path_csv)
    
    # Cast des colonnes numériques
    num_cols = ["daily_change_pct", "ytd_return_pct", "one_year_return_pct", 
                "vol_pct", "vol_3y_pct", "aum_usd", "total_expense_ratio", "yield_ttm"]
    for c in num_cols:
        if c in df.columns: 
            df[c] = pd.to_numeric(df[c], errors="coerce")
    
    # --- Détection obligations
    df["is_bond"] = (
        df.get("fund_type", "").astype(str).str.contains(r"Bond|Fixed Income|Obligation", case=False, na=False) |
        df.get("etf_type", "").astype(str).str.contains(r"Bond|Fixed Income|Obligation", case=False, na=False)
    )

    # --- FIX 2: Détection levier corrigée
    lev_field = df.get("leverage")
    if lev_field is not None:
        lev_text = lev_field.fillna("").astype(str).str.strip().str.lower()
        has_lev_value = ~lev_text.isin(["", "0", "none", "nan", "na", "n/a"])
    else:
        has_lev_value = pd.Series(False, index=df.index)

    looks_leveraged = (
        df.get("etf_type", "").astype(str).str.contains(r"\b(?:lev|inverse|bear|bull)\b", case=False, na=False) |
        df.get("name", "").astype(str).str.contains(LEVERAGED_RE, regex=True, na=False)
    )

    df["is_leveraged"] = has_lev_value | looks_leveraged
    
    print(f"  🔍 Debug ETF: Total={len(df)}, Bonds={df['is_bond'].sum()}, Leveraged={df['is_leveraged'].sum()}")
    print(f"  📊 ETF standards disponibles: {len(df[~df['is_bond'] & ~df['is_leveraged']])}")
    print(f"  📉 ETF obligations disponibles: {len(df[df['is_bond'] & ~df['is_leveraged']])}")
    
    return df

def build_scored_universe_v3(stocks_jsons, etf_csv_path, crypto_csv_path):
    """
    Construction de l'univers fermé avec scoring quantitatif
    Retourne les meilleurs actifs équilibrés par risque
    """
    print("🧮 Construction de l'univers quantitatif v3...")
    
    # ====== ACTIONS (depuis les stocks_*.json) ======
    eq_rows = []
    total_stocks = 0
    for data in stocks_jsons:
        for it in data.get("stocks", []):
            total_stocks += 1
            eq_rows.append({
                "name": it.get("name") or it.get("ticker"),
                "perf_1m": it.get("perf_1m"),
                "perf_3m": it.get("perf_3m"),
                "perf_90d": it.get("perf_3m"),     # fallback acceptable
                "ytd": it.get("perf_ytd"),
                "vol30": None,                     # pas de 30j; on utilisera vol_3y
                "vol_3y": it.get("volatility_3y"),
                "maxdd90": it.get("max_drawdown_ytd"),  # best proxy dispo
                "perf_24h": it.get("perf_1d"),
                "liquidity": it.get("market_cap"),
                "sector": it.get("sector", "Unknown"),
                "country": it.get("country", "Unknown")
            })
    
    print(f"  📊 Stocks chargées: {total_stocks} → Analyse: {len(eq_rows)}")
    eq_rows = compute_score(eq_rows, "equity")
    
    # Filtrage actions : vol contrôlée + drawdown acceptable + pas de sur-extension
    def in_equity_bounds(r):
        v = fnum(r.get("vol_3y"))
        dd = abs(fnum(r.get("maxdd90")))
        return 12 <= v <= 60 and dd <= 25 and not r["flags"]["overextended"]
    
    eq_filtered = [r for r in eq_rows if in_equity_bounds(r)]
    print(f"  ✅ Actions filtrées: {len(eq_filtered)}/{len(eq_rows)} (vol 12-60%, DD≤25%, non sur-étendues)")

    # ====== ETFs (CSV combiné) ======
    etf_df = read_combined_etf_csv(etf_csv_path)
    etf_std = etf_df[~etf_df["is_bond"] & ~etf_df["is_leveraged"]]
    etf_bonds = etf_df[etf_df["is_bond"] & ~etf_df["is_leveraged"]]
    
    print(f"  📊 ETF analysés: {len(etf_df)} → Standards: {len(etf_std)}, Obligations: {len(etf_bonds)}")
    print(f"  🚫 ETF à effet de levier exclus: {len(etf_df[etf_df['is_leveraged']])}")

    def _etf_rows(df):
        rows = []
        for _, r in df.iterrows():
            rows.append({
                "name": str(r["name"]),
                "perf_1m": None, "perf_3m": None, "perf_90d": None,
                "perf_24h": r.get("daily_change_pct"),
                "ytd": r.get("ytd_return_pct"),
                "vol30": r.get("vol_pct") if str(r.get("vol_window", "")).lower() in ("30d", "1m", "30") else None,
                "vol_3y": r.get("vol_3y_pct") or r.get("vol_pct"),
                "maxdd90": None,
                "liquidity": r.get("aum_usd"),
                "flags": {"overextended": False},
            })
        return rows

    etf_rows = compute_score(_etf_rows(etf_std), "etf")
    
    # Filtrage ETF standards
    def _v_etf(r):
        v = fnum(r.get("vol30")) or fnum(r.get("vol_3y"))
        return 8 <= v <= 40
    
    etf_filtered = [r for r in etf_rows if _v_etf(r) and not r["flags"]["overextended"]]
    print(f"  ✅ ETF standards filtrés: {len(etf_filtered)}/{len(etf_rows)} (vol 8-40%, non sur-étendus)")

    # ETF obligataires (liste blanche, pas de filtre strict)
    bond_rows = compute_score(_etf_rows(etf_bonds), "etf")
    print(f"  📋 ETF obligataires: {len(bond_rows)} (liste blanche)")

    # ====== CRYPTO (CSV filtré volatilité) ======
    try:
        cdf = pd.read_csv(crypto_csv_path)
        # Cast des colonnes crypto
        for c in ["ret_1d_pct", "ret_7d_pct", "ret_30d_pct", "ret_90d_pct", "ret_ytd_pct", "vol_30d_annual_pct", "drawdown_90d_pct", "atr14_pct"]:
            if c in cdf.columns: 
                cdf[c] = pd.to_numeric(cdf[c], errors="coerce")
        
        cr_rows = []
        for _, r in cdf.iterrows():
            cr_rows.append({
                "name": str(r.get("symbol")),
                "perf_24h": r.get("ret_1d_pct"),
                "perf_7d": r.get("ret_7d_pct"),
                "ytd": r.get("ret_ytd_pct"),
                "vol30": r.get("vol_30d_annual_pct"),
                "vol_3y": None,
                "maxdd90": r.get("drawdown_90d_pct"),
                "flags": {"overextended": False},
            })
        
        cr_rows = compute_score(cr_rows, "crypto")
        
        # Filtrage crypto : tendance + anti-spike + bornes vol
        crypto_filtered = []
        for r in cr_rows:
            p7d = fnum(r["perf_7d"])
            p24h = fnum(r["perf_24h"])
            ok_trend = p7d > p24h > 0 and p24h <= 0.4 * p7d  # Anti-spike
            
            v = fnum(r.get("vol30"))
            ok_vol = 40 <= v <= 140
            ok_dd = fnum(r.get("maxdd90")) > -40
            
            if ok_trend and ok_vol and ok_dd:
                crypto_filtered.append(r)
        
        print(f"  ✅ Cryptos filtrées: {len(crypto_filtered)}/{len(cr_rows)} (tendance stable + vol 40-140% + DD>-40%)")
        
        # Fallback: si trop peu de candidats, desserrer légèrement les critères
        if len(crypto_filtered) < 5:
            crypto_relaxed = []
            for r in cr_rows:
                p7d  = fnum(r.get("perf_7d"))
                p24h = fnum(r.get("perf_24h"))
                v    = fnum(r.get("vol30"))
                ddv  = abs(fnum(r.get("maxdd90")))
                ok_trend2 = p7d > p24h > 0 and p24h <= 0.5 * p7d
                ok_vol2   = 40 <= v <= 160
                ok_dd2    = ddv <= 50
                if ok_trend2 and ok_vol2 and ok_dd2:
                    crypto_relaxed.append(r)

            # Concat sans doublon puis limite à 10
            seen = set(id(x) for x in crypto_filtered)
            for r in crypto_relaxed:
                if id(r) not in seen:
                    crypto_filtered.append(r)
                    seen.add(id(r))
            print(f"  🔁 Fallback crypto appliqué → {len(crypto_filtered)} candidats")
    
    except Exception as e:
        print(f"  ⚠️ Erreur crypto: {e}")
        crypto_filtered = []

    # ====== CLASSIFICATION PAR RISQUE ET ÉQUILIBRAGE ======
    def risk_class(kind, r):
        v = fnum(r.get("vol30") or r.get("vol_3y"))
        if kind == "etf":   
            return "low" if 8 <= v <= 20 else ("mid" if 20 < v <= 40 else "out")
        if kind == "equity":
            return "low" if 12 <= v <= 25 else ("mid" if 25 < v <= 60 else "out")
        return "low" if 40 <= v <= 70 else ("mid" if 70 < v <= 140 else "out")

    for r in eq_filtered:    r["risk_class"] = risk_class("equity", r)
    for r in etf_filtered:   r["risk_class"] = risk_class("etf", r)
    for r in crypto_filtered: r["risk_class"] = risk_class("crypto", r)
    for r in bond_rows:      r["risk_class"] = "bond"

    def top_balanced(rows, n):
        """Équilibrage low/mid risque pour éviter la surconcentration"""
        rows = sorted(rows, key=lambda x: x["score"], reverse=True)
        low = [x for x in rows if x["risk_class"] == "low"][:n//2]
        mid = [x for x in rows if x["risk_class"] == "mid"][:n-len(low)]
        return low + mid

    # Diversification sectorielle pour les actions
    def sector_balanced(eq_rows, n, sector_cap=0.30):
        """Round-robin par secteur avec cap (30% par défaut)"""
        if not eq_rows:
            return []

        # Tri par score décroissant et bucket par secteur
        buckets = defaultdict(list)
        for x in sorted(eq_rows, key=lambda x: x["score"], reverse=True):
            buckets[x.get("sector", "Unknown")].append(x)

        # Ordre des secteurs: meilleur top-score en premier
        sector_order = sorted(
            buckets.keys(),
            key=lambda s: buckets[s][0]["score"] if buckets[s] else -1e9,
            reverse=True
        )

        out, picked_per_sector = [], defaultdict(int)
        max_per_sector = max(1, int(n * sector_cap))

        # Round-robin
        while len(out) < n:
            progressed = False
            for s in sector_order:
                if picked_per_sector[s] >= max_per_sector:
                    continue
                if buckets[s]:
                    out.append(buckets[s].pop(0))
                    picked_per_sector[s] += 1
                    progressed = True
                    if len(out) >= n:
                        break
            if not progressed:
                # plus rien à prendre
                break

        return out[:n]

    # Limiter le nombre d'actifs pour réduire la taille du prompt
    universe = {
        "equities": sector_balanced(eq_filtered, min(25, len(eq_filtered))),  # Réduit de 30 à 25
        "etfs": top_balanced(etf_filtered, min(15, len(etf_filtered))),       # Réduit de 20 à 15
        "bonds": sorted(bond_rows, key=lambda x: x["score"], reverse=True)[:10],  # Réduit de 20 à 10
        "crypto": sorted(crypto_filtered, key=lambda x: x["score"], reverse=True)[:5],  # Réduit de 10 à 5
    }

    # Stats de l'univers
    stats = {
        "equities_avg_score": np.mean([e["score"] for e in universe["equities"]]) if universe["equities"] else 0,
        "etfs_avg_score": np.mean([e["score"] for e in universe["etfs"]]) if universe["etfs"] else 0,
        "crypto_avg_score": np.mean([c["score"] for c in universe["crypto"]]) if universe["crypto"] else 0,
        "total_assets": sum(len(v) for v in universe.values())
    }
    
    print(f"  📊 Univers final: {stats['total_assets']} actifs (optimisé pour prompt)")
    print(f"     • Actions: {len(universe['equities'])} (score moy: {stats['equities_avg_score']:.2f})")
    print(f"     • ETF: {len(universe['etfs'])} (score moy: {stats['etfs_avg_score']:.2f})")  
    print(f"     • Obligations: {len(universe['bonds'])}")
    print(f"     • Crypto: {len(universe['crypto'])} (score moy: {stats['crypto_avg_score']:.2f})")

    return universe

# ============= NOUVELLES FONCTIONS ROBUSTES VERSION 3 =============

def prepare_structured_data(filtered_data: Dict) -> Dict:
    """
    Transforme les données filtrées en format structuré avec IDs courts
    pour réduire les tokens et améliorer la précision
    """
    
    # 1. Brief en points numérotés
    brief_points = []
    if filtered_data.get('brief'):
        brief_text = filtered_data['brief']
        # Extraire les points clés du brief et les structurer
        brief_lines = brief_text.split('\n')
        point_id = 1
        for line in brief_lines:
            line = line.strip()
            if line and len(line) > 20:  # Éviter les lignes trop courtes
                brief_points.append({
                    "id": f"BR{point_id}",
                    "text": line[:150] + "..." if len(line) > 150 else line
                })
                point_id += 1
                if point_id > 10:  # Limiter à 10 points max
                    break
    
    # 2. Points marchés (extraits depuis filtered_markets)
    market_points = []
    if filtered_data.get('markets'):
        markets_text = filtered_data['markets']
        market_lines = [line.strip() for line in markets_text.split('\n') if line.strip() and '•' in line]
        for i, line in enumerate(market_lines[:8]):  # Max 8 points
            market_points.append({
                "id": f"MC{i+1}",
                "text": line.replace('•', '').strip()[:120]
            })
    
    # 3. Points sectoriels (extraits depuis filtered_sectors)
    sector_points = []
    if filtered_data.get('sectors'):
        sectors_text = filtered_data['sectors']
        sector_lines = [line.strip() for line in sectors_text.split('\n') if line.strip() and '•' in line]
        for i, line in enumerate(sector_lines[:8]):  # Max 8 points
            sector_points.append({
                "id": f"SEC{i+1}",
                "text": line.replace('•', '').strip()[:120]
            })
    
    # 4. Thèmes (extraits depuis filtered_themes)
    theme_points = []
    if filtered_data.get('themes'):
        themes_text = filtered_data['themes']
        theme_lines = [line.strip() for line in themes_text.split('\n') if line.strip() and '•' in line]
        for i, line in enumerate(theme_lines[:6]):  # Max 6 points
            theme_points.append({
                "id": f"TH{i+1}",
                "text": line.replace('•', '').strip()[:120]
            })
    
    return {
        "brief_points": brief_points,
        "market_points": market_points,
        "sector_points": sector_points,
        "theme_points": theme_points
    }

def extract_allowed_assets(filtered_data: Dict) -> Dict:
    """
    Extrait les actifs autorisés depuis les données filtrées
    NOUVEAU: utilise l'univers quantitatif si disponible
    """
    
    # NOUVEAU: si on a 'universe', on l'utilise (système v3)
    u = filtered_data.get("universe")
    if u:
        def mk(items, prefix):
            out = []
            for i, it in enumerate(items, start=1):
                out.append({
                    "id": f"{prefix}{i}",
                    "name": it["name"],
                    "symbol": it["name"].split()[0][:6].upper(),
                    "score": round(float(it.get("score", 0)), 3),
                    "risk_class": it.get("risk_class", "mid"),
                    "flags": it.get("flags", {}),
                    "sector": it.get("sector", "Unknown"),
                    "country": it.get("country", "Global"),
                    # >>> métriques utiles à la validation
                    "ytd": fnum(it.get("ytd")),
                    "perf_1m": fnum(it.get("perf_1m")),
                })
            return out
        
        return {
            "allowed_equities": mk(u.get("equities", []), "EQ_"),
            "allowed_etfs_standard": mk(u.get("etfs", []), "ETF_s"),
            "allowed_bond_etfs": mk(u.get("bonds", []), "ETF_b"),
            "allowed_crypto": [{
                "id": f"CR_{i+1}",
                "name": it["name"],
                "symbol": it["name"][:6].upper(),
                "sevenDaysPositif": True,
                "score": round(float(it.get("score", 0)), 3),
                "risk_class": it.get("risk_class", "mid"),
                # métriques pour contrôles
                "ytd": fnum(it.get("ytd")),
                "perf_1m": fnum(it.get("perf_1m")),
            } for i, it in enumerate(u.get("crypto", []))]
        }
    
    # Fallback sur l'ancien parsing texte si pas d'univers quantitatif
    print("⚠️ Pas d'univers quantitatif, utilisation du fallback parsing texte")
    return extract_allowed_assets_legacy(filtered_data)

def extract_allowed_assets_legacy(filtered_data: Dict) -> Dict:
    """Version legacy pour compatibilité"""
    # Actions autorisées (extraire depuis filtered_lists)
    allowed_equities = []
    if filtered_data.get('lists'):
        lists_text = filtered_data['lists']
        equity_id = 1
        for line in lists_text.split('\n'):
            if '•' in line and 'YTD' in line:
                parts = line.split(':')
                if len(parts) >= 2:
                    name = parts[0].replace('•', '').strip()
                    name = re.sub(r'[🚩📉]', '', name).strip()
                    if '(' in name and 'potentielle' in name:
                        name = name.split('(')[0].strip()
                    
                    region = "US" if any(x in name for x in ["Inc", "Corp", "LLC"]) else "Europe"
                    sector = "Technology"
                    
                    allowed_equities.append({
                        "id": f"EQ_{equity_id}",
                        "name": name,
                        "symbol": name.split()[0] if len(name.split()) > 0 else name[:4].upper(),
                        "region": region,
                        "sector": sector,
                        "score": 0.0,
                        "risk_class": "mid",
                        "flags": {"overextended": False},
                        "ytd": 0.0,
                        "perf_1m": 0.0
                    })
                    equity_id += 1
                    if equity_id > 30:
                        break
    
    # ETF standards autorisés
    allowed_etfs_standard = []
    if filtered_data.get('etfs'):
        etfs_text = filtered_data['etfs']
        etf_id = 1
        for line in etfs_text.split('\n'):
            if '•' in line and 'ETF' in line and 'OBLIGATAIRE' not in line.upper():
                etf_name = line.split('•')[1].split(':')[0].strip() if '•' in line else ""
                if etf_name and len(etf_name) > 5:
                    allowed_etfs_standard.append({
                        "id": f"ETF_s{etf_id}",
                        "name": etf_name,
                        "symbol": etf_name.split()[0][:4].upper() if etf_name.split() else "ETF",
                        "score": 0.0,
                        "risk_class": "mid",
                        "flags": {"overextended": False},
                        "ytd": 0.0,
                        "perf_1m": 0.0
                    })
                    etf_id += 1
                    if etf_id > 20:
                        break
    
    # ETF obligataires autorisés
    allowed_bond_etfs = []
    if filtered_data.get('bond_etf_names'):
        for i, name in enumerate(filtered_data['bond_etf_names'][:15]):
            allowed_bond_etfs.append({
                "id": f"ETF_b{i+1}",
                "name": name,
                "symbol": name.split()[0][:4].upper() if name.split() else "BOND",
                "score": 0.0,
                "risk_class": "bond",
                "flags": {"overextended": False},
                "ytd": 0.0,
                "perf_1m": 0.0
            })
    
    # Cryptos autorisées
    allowed_crypto = []
    if filtered_data.get('crypto'):
        crypto_text = filtered_data['crypto']
        crypto_id = 1
        for line in crypto_text.split('\n'):
            if '•' in line and '7j:' in line:
                parts = line.split('(')[0].replace('•', '').strip()
                name = parts.split(':')[0].strip() if ':' in parts else parts
                
                seven_days_positive = '7j: +' in line or ('7j:' in line and '+' in line.split('7j:')[1][:10])
                
                allowed_crypto.append({
                    "id": f"CR_{crypto_id}",
                    "name": name,
                    "symbol": name.upper()[:3],
                    "sevenDaysPositif": seven_days_positive,
                    "score": 0.0,
                    "risk_class": "mid",
                    "ytd": 0.0,
                    "perf_1m": 0.0
                })
                crypto_id += 1
                if crypto_id > 10:
                    break
    
    return {
        "allowed_equities": allowed_equities,
        "allowed_etfs_standard": allowed_etfs_standard,
        "allowed_bond_etfs": allowed_bond_etfs,
        "allowed_crypto": allowed_crypto
    }

def build_robust_prompt_v3(structured_data: Dict, allowed_assets: Dict, current_month: str) -> str:
    """
    Construit le prompt v3 avec univers quantitatif et garde-fous renforcés + COMPLIANCE AMF
    """
    
    prompt = f"""Tu es un expert en allocation quantitative. Construis TROIS portefeuilles (Agressif, Modéré, Stable).

## Données structurées (univers fermés v3)
BRIEF_POINTS = {json.dumps(structured_data['brief_points'], ensure_ascii=False)}
MARKETS = {json.dumps(structured_data['market_points'], ensure_ascii=False)}
SECTORS = {json.dumps(structured_data['sector_points'], ensure_ascii=False)}
THEMES = {json.dumps(structured_data['theme_points'], ensure_ascii=False)}

ALLOWED_EQUITIES = {json.dumps(allowed_assets['allowed_equities'], ensure_ascii=False)}
ALLOWED_ETFS_STANDARD = {json.dumps(allowed_assets['allowed_etfs_standard'], ensure_ascii=False)}
ALLOWED_BOND_ETFS = {json.dumps(allowed_assets['allowed_bond_etfs'], ensure_ascii=False)}
ALLOWED_CRYPTO = {json.dumps(allowed_assets['allowed_crypto'], ensure_ascii=False)}

## Règles ABSOLUES v3 (scoring quantitatif)
- Choisir uniquement des actifs dont l'`id` figure dans les listes ALLOWED_*.
- 3 portefeuilles : chacun **12 à 15** lignes (somme Actions+ETF+Obligations+Crypto).
- **≥2 catégories** par portefeuille (parmi: Actions, ETF, Obligations, Crypto).
- **Somme des allocations = 100.00** avec **2 décimales**. La **dernière ligne** ajuste pour atteindre 100.00.
- Catégorie **Obligations** = ALLOWED_BOND_ETFS exclusivement. Interdit ailleurs.
- Catégorie **ETF** = uniquement ALLOWED_ETFS_STANDARD (aucun bond ETF ici).
- Catégorie **Crypto** = actifs de ALLOWED_CRYPTO avec `sevenDaysPositif=true`.
- Un même `id` ne peut apparaître qu'**une fois** par portefeuille.

## Règles de scoring quantitatif (NOUVELLES)
- N'utiliser que les actifs avec `flags.overextended=false`.
- **≥70% des lignes** d'un portefeuille doivent avoir `score ≥ 0`.
- La **médiane des scores par portefeuille ≥ 0**.
- Interdit: ETF à effet de levier (déjà exclus en amont).
- **Anti-fin-de-cycle**: Interdiction d'ajouter un actif avec `YTD>100%` si `Perf 1M ≤ 0`.
- Privilégier équilibrage `risk_class` : mix low/mid selon profil (Stable=80% low, Modéré=60% low, Agressif=40% low).

## COMPLIANCE (obligatoire)
- Ce contenu est une **information financière générale**. Il **ne constitue pas** un conseil en investissement personnalisé ni une recommandation individuelle.
- N'utilise **aucune** donnée personnelle, ne déduis **aucun** profil de l'utilisateur et **n'adapte** pas les portefeuilles au lecteur. Reste **strictement générique**.
- **Langage neutre uniquement** : interdit d'employer « acheter », « vendre », « conserver », « à privilégier », « fortement recommandé », « garanti », « sans risque », « objectif de prix », « rendement attendu ». Utiliser des formulations comme « pondération modèle », « exposition théorique », « scénarios possibles ».
- **Aucune incitation** à passer un ordre, **aucun lien affilié**, **aucune promesse** de performance.
- **Toujours** ajouter dans la sortie un bloc `Compliance` avec :
  - `Disclaimer` : texte court (2–3 phrases) rappelant que c'est de l'information générale, que les performances passées ne préjugent pas des performances futures, et qu'il existe un risque de perte en capital.
  - `Risques` : 3–6 puces, incluant au minimum : « Perte en capital possible », « Performances passées ≠ performances futures », « Volatilité des marchés », et pour la catégorie Crypto : « Forte volatilité, possibilité de perte totale ».
  - `Methodologie` : 1–2 phrases sur l'approche quantitative (scoring momentum/risque/liquidité) et ses limites (incertitudes, données susceptibles d'évoluer).
- Les commentaires/justifications doivent rester **descriptifs** (pas d'impératifs, pas d'injonctions).

## Logique d'investissement (synthèse)
- Chaque actif doit être justifié par **≥2 références** parmi BRIEF(Macro), MARKETS(Géo), SECTORS(Secteur), THEMES(Thèmes).
  Utilise les **IDs** (ex: ["BR2","MC1"]).
- Ne **jamais** choisir sur la seule base de la perf YTD ou du score.
- Mentionne brièvement le score et la classe de risque dans la justification.
- Préférer les actifs avec score > 0 et diversification sectorielle/géographique.

## Commentaires attendus (par portefeuille)
- `Commentaire` (≤1200 caractères), structure:
  1) Actualités (BRIEF) — 2–3 phrases neutres
  2) Marchés (MARKETS) — 2–3 phrases
  3) Secteurs (SECTORS/THEMES) — 2–3 phrases
  4) Approche quantitative — 2–3 phrases sur l'équilibrage score/risque

## Actifs exclus
- Fournis 2–3 `ActifsExclus` avec `reason` courte et `refs` (IDs) expliquant l'exclusion.
- Priorité aux actifs sur-étendus ou à score très négatif.

## Format de SORTIE (STRICT, JSON UNIQUEMENT, pas de markdown, aucun texte hors JSON)
{{
  "Agressif": {{
    "Commentaire": "...",
    "Lignes": [
      {{"id":"EQ_1",   "name":"Microsoft Corporation", "category":"Actions",     "allocation_pct":12.50, "justificationRefs":["BR1","SEC2"], "justification":"Score 1.23 (momentum tech) + résilience IA face ralentissement", "score":1.23, "risk_class":"low"}},
      {{"id":"ETF_s1", "name":"Vanguard S&P 500 ETF",  "category":"ETF",         "allocation_pct":25.00, "justificationRefs":["MC1","TH1"],  "justification":"Score 0.87 + exposition théorique large marché US", "score":0.87, "risk_class":"mid"}},
      {{"id":"ETF_b1", "name":"iShares Euro Govt Bond", "category":"Obligations", "allocation_pct":15.00, "justificationRefs":["BR3","SEC4"], "justification":"Pondération refuge géopolitique", "score":0.12, "risk_class":"bond"}},
      {{"id":"CR_1",   "name":"Bitcoin",               "category":"Crypto",      "allocation_pct":5.00,  "justificationRefs":["TH3","MC2"],  "justification":"Score 2.15 + exposition institutionnelle", "score":2.15, "risk_class":"mid"}}
    ],
    "ActifsExclus": [
      {{"name":"Tesla Inc", "reason":"Score -0.85 + sur-extension YTD >150%", "refs":["BR1","SEC1"]}},
      {{"name":"ARKK ETF", "reason":"Score -1.23 + exposition correction sévère", "refs":["BR2"]}}
    ],
    "Compliance": {{
      "Disclaimer": "Communication d'information financière à caractère général. Ce contenu n'est pas un conseil en investissement personnalisé. Les performances passées ne préjugent pas des performances futures. Investir comporte un risque de perte en capital. Aucune exécution ni transmission d'ordres n'est fournie.",
      "Risques": [
        "Perte en capital possible",
        "Performances passées ne préjugent pas des performances futures",
        "Volatilité accrue selon les classes d'actifs",
        "Crypto-actifs : volatilité élevée, perte totale possible",
        "Risques de change pour les actifs internationaux",
        "Risque de liquidité sur certains marchés"
      ],
      "Methodologie": "Allocation issue d'un scoring quantitatif (momentum, volatilité, drawdown, liquidité). Les données et le classement peuvent évoluer. Cette approche ne garantit aucun résultat."
    }}
  }},
  "Modéré": {{ "Commentaire": "...", "Lignes": [...], "ActifsExclus": [...], "Compliance": {{...}} }},
  "Stable": {{ "Commentaire": "...", "Lignes": [...], "ActifsExclus": [...], "Compliance": {{...}} }}
}}

### CONTRÔLE QUALITÉ v3 (obligatoire avant d'émettre la réponse)
- Vérifie que chaque portefeuille a 12–15 lignes, ≥2 catégories, somme = 100.00 exactement (2 décimales).
- Vérifie qu'aucun `id` n'est dupliqué et que chaque catégorie respecte ses univers autorisés.
- Vérifie que ≥70% des actifs ont score ≥ 0 et médiane des scores ≥ 0.
- Vérifie l'équilibrage risk_class selon profil.
- Vérifie que chaque portefeuille contient le bloc `Compliance` complet.
- Si une règle échoue, corrige puis ne sors que le JSON final conforme.
- Ta réponse doit commencer par `{{` et finir par `}}` — **aucun autre caractère**.

Contexte temporel: Portefeuilles optimisés pour {current_month} 2025.
"""
    
    return prompt

def validate_portfolios_v3(portfolios: Dict, allowed_assets: Dict) -> Tuple[bool, List[str]]:
    """
    Validation stricte des portefeuilles générés version 3 avec contrôle des scores + COMPLIANCE
    """
    errors = []
    
    # Créer un mapping id -> actif pour accès rapide aux scores
    id_to_asset = {}
    for asset_type in ["allowed_equities", "allowed_etfs_standard", "allowed_bond_etfs", "allowed_crypto"]:
        for asset in allowed_assets.get(asset_type, []):
            id_to_asset[asset["id"]] = asset
    
    for portfolio_name, portfolio in portfolios.items():
        if not isinstance(portfolio.get('Lignes'), list):
            errors.append(f"{portfolio_name}: 'Lignes' manquant ou invalide")
            continue
            
        lignes = portfolio['Lignes']
        
        # Vérifier le nombre d'actifs
        if not (12 <= len(lignes) <= 15):
            errors.append(f"{portfolio_name}: {len(lignes)} actifs (requis: 12-15)")
        
        # Vérifier la somme des allocations
        total_allocation = sum(ligne.get('allocation_pct', 0) for ligne in lignes)
        if abs(total_allocation - 100.0) > 0.01:
            errors.append(f"{portfolio_name}: allocation totale = {total_allocation:.2f}% (requis: 100.00%)")
        
        # Vérifier les IDs uniques
        ids = [ligne.get('id') for ligne in lignes]
        if len(ids) != len(set(ids)):
            errors.append(f"{portfolio_name}: IDs dupliqués détectés")
        
        # Vérifier les catégories
        categories = set(ligne.get('category') for ligne in lignes)
        if len(categories) < 2:
            errors.append(f"{portfolio_name}: moins de 2 catégories ({categories})")
        
        # NOUVEAU: Vérifier la présence du bloc Compliance
        compliance = portfolio.get('Compliance', {})
        if not compliance:
            errors.append(f"{portfolio_name}: bloc 'Compliance' manquant")
        else:
            required_compliance_fields = ['Disclaimer', 'Risques', 'Methodologie']
            for field in required_compliance_fields:
                if not compliance.get(field):
                    errors.append(f"{portfolio_name}: champ Compliance.{field} manquant")
        
        # NOUVEAU: Vérifier les scores et classes de risque
        scores = []
        overextended_count = 0
        risk_distribution = defaultdict(int)
        
        for ligne in lignes:
            asset_id = ligne.get('id', '')
            asset = id_to_asset.get(asset_id)
            
            # Règle anti-fin-de-cycle: si info dispo sur l'actif
            if asset:
                ytd_val = fnum(asset.get("ytd"))
                m1_val  = fnum(asset.get("perf_1m"))
                if ytd_val > 100 and m1_val <= 0:
                    errors.append(f"{portfolio_name}: {asset_id} viole 'YTD>100% & 1M≤0' (anti-fin-de-cycle)")
            
            if asset:
                score = asset.get('score', 0)
                scores.append(score)
                
                # Vérifier les flags
                if asset.get('flags', {}).get('overextended', False):
                    overextended_count += 1
                
                # Compter la distribution des classes de risque
                risk_class = asset.get('risk_class', 'unknown')
                risk_distribution[risk_class] += 1
                
                # Vérifier la cohérence des catégories
                category = ligne.get('category')
                if category == 'Obligations' and not asset_id.startswith('ETF_b'):
                    errors.append(f"{portfolio_name}: {asset_id} dans Obligations mais n'est pas un bond ETF")
                elif category == 'ETF' and asset_id.startswith('ETF_b'):
                    errors.append(f"{portfolio_name}: {asset_id} est un bond ETF mais placé dans ETF standard")
                elif category == 'Crypto' and not asset_id.startswith('CR_'):
                    errors.append(f"{portfolio_name}: {asset_id} dans Crypto mais n'est pas une crypto autorisée")
                elif category == 'Actions' and not asset_id.startswith('EQ_'):
                    errors.append(f"{portfolio_name}: {asset_id} dans Actions mais n'est pas une action autorisée")
        
        # Vérifications quantitatives v3
        if scores:
            positive_score_ratio = sum(1 for s in scores if s >= 0) / len(scores)
            median_score = np.median(scores)
            
            if positive_score_ratio < 0.70:
                errors.append(f"{portfolio_name}: seulement {positive_score_ratio:.1%} d'actifs avec score ≥ 0 (requis: ≥70%)")
            
            if median_score < 0:
                errors.append(f"{portfolio_name}: médiane des scores = {median_score:.2f} (requis: ≥ 0)")
        
        if overextended_count > 0:
            errors.append(f"{portfolio_name}: {overextended_count} actifs sur-étendus (interdit)")
        
        # Vérifier l'équilibrage des classes de risque selon le profil
        total_non_bond = sum(count for risk, count in risk_distribution.items() if risk != 'bond')
        if total_non_bond > 0:
            low_ratio = risk_distribution['low'] / total_non_bond
            expected_low = {"Stable": 0.80, "Modéré": 0.60, "Agressif": 0.40}.get(portfolio_name, 0.50)
            
            if abs(low_ratio - expected_low) > 0.20:  # Tolérance de 20%
                errors.append(f"{portfolio_name}: {low_ratio:.1%} d'actifs low-risk (attendu: ~{expected_low:.0%})")
    
    return len(errors) == 0, errors

def score_guard(portfolios: Dict, allowed_assets: Dict):
    """Garde-fou post-LLM pour la santé des scores"""
    import numpy as np
    
    # Map id -> score
    id2score = {}
    for k in ("allowed_equities", "allowed_etfs_standard", "allowed_bond_etfs", "allowed_crypto"):
        for a in allowed_assets.get(k, []):
            id2score[a["id"]] = float(a.get("score", 0))

    for name, p in portfolios.items():
        sc = [id2score.get(l["id"], 0.0) for l in p.get("Lignes", [])]
        if not sc: 
            continue
        
        med = float(np.median(sc))
        neg_ratio = sum(1 for s in sc if s < 0) / len(sc)
        
        if med < 0 or neg_ratio > 0.30:
            raise ValueError(f"{name}: score santé KO (médiane={med:.2f}<0) ou {neg_ratio:.0%} négatifs (>30%)")
    
    print("✅ Score guard: tous les portefeuilles passent les contrôles quantitatifs")

def fix_portfolios_v3(portfolios: Dict, errors: List[str]) -> Dict:
    """
    Correction automatique des portefeuilles si possible (version v3)
    """
    for portfolio_name, portfolio in portfolios.items():
        if 'Lignes' in portfolio:
            lignes = portfolio['Lignes']
            
            # Ajuster les allocations pour atteindre 100%
            total = sum(ligne.get('allocation_pct', 0) for ligne in lignes)
            if abs(total - 100.0) > 0.01 and len(lignes) > 0:
                diff = 100.0 - total
                lignes[-1]['allocation_pct'] = round(lignes[-1]['allocation_pct'] + diff, 2)
                print(f"  🔧 Ajustement {portfolio_name}: dernière ligne ajustée de {diff:.2f}%")
        
        # Ajouter le bloc Compliance s'il manque (protection type)
        if isinstance(portfolio, dict) and 'Compliance' not in portfolio:
            portfolio['Compliance'] = get_compliance_block()
            print(f"  🔧 Ajout bloc Compliance manquant pour {portfolio_name}")
    
    return portfolios

def apply_compliance_sanitization(portfolios: Dict) -> Dict:
    """Applique la sanitisation des termes marketing interdits"""
    for portfolio_name, portfolio in portfolios.items():
        if not isinstance(portfolio, dict):
            continue
            
        # Sanitiser le commentaire
        if 'Commentaire' in portfolio:
            portfolio['Commentaire'] = sanitize_marketing_language(portfolio['Commentaire'])
        
        # Sanitiser les justifications
        if 'Lignes' in portfolio and isinstance(portfolio['Lignes'], list):
            for ligne in portfolio['Lignes']:
                if isinstance(ligne, dict) and 'justification' in ligne:
                    ligne['justification'] = sanitize_marketing_language(ligne['justification'])
        
        # Sanitiser les raisons d'exclusion
        if 'ActifsExclus' in portfolio and isinstance(portfolio['ActifsExclus'], list):
            for actif in portfolio['ActifsExclus']:
                if isinstance(actif, dict) and 'reason' in actif:
                    actif['reason'] = sanitize_marketing_language(actif['reason'])
    
    return portfolios

# ============= CACHE D'UNIVERS AVEC HASH DE FICHIERS =============

_UNIVERSE_CACHE = {}

def _sha1_bytes(b: bytes) -> str:
    return hashlib.sha1(b).hexdigest()

def file_sha1(path: Path) -> str:
    try:
        with open(path, "rb") as fh:
            return _sha1_bytes(fh.read())
    except Exception:
        return "NA"

def json_sha1(obj: Any) -> str:
    try:
        blob = json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
        return _sha1_bytes(blob)
    except Exception:
        return str(random.random())

def set_cached_universe(etf_hash: str, stocks_hash: str, crypto_hash: str, universe: Dict):
    _UNIVERSE_CACHE[(etf_hash, stocks_hash, crypto_hash)] = universe

def get_cached_universe(etf_hash: str, stocks_hash: str, crypto_hash: str):
    return _UNIVERSE_CACHE.get((etf_hash, stocks_hash, crypto_hash))

# ============= FIX 3: RETRY API ROBUSTE AVEC TIMEOUTS ÉTENDUS =============

def post_with_retry(url, headers, payload, tries=5, timeout=(20, 180), backoff=2.0):
    """
    FIX 3: Retry robuste avec timeouts étendus
    timeout = (connect_timeout, read_timeout)
    """
    last_err = None
    for i in range(tries):
        try:
            return requests.post(url, headers=headers, json=payload, timeout=timeout)
        except (requests.ReadTimeout, requests.ConnectionError, requests.Timeout) as e:
            last_err = e
            wait = backoff ** i
            print(f"  ⚠️ API retry {i+1}/{tries} dans {wait:.1f}s: {e}")
            time.sleep(wait)
    raise last_err

# ============= FIX 4: FILET DE SÉCURITÉ CACHE =============

def load_cached_portfolios(path="portefeuilles.json"):
    """Charge le dernier portefeuille validé en cache"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def generate_portfolios_v3(filtered_data: Dict) -> Dict:
    """
    Version 3 améliorée avec système de scoring quantitatif + COMPLIANCE AMF
    """
    
    api_key = os.environ.get('API_CHAT')
    if not api_key:
        raise ValueError("La clé API OpenAI (API_CHAT) n'est pas définie.")
    
    current_month = get_current_month_fr()
    
    # Vérifier si on a un univers quantitatif
    if not filtered_data.get('universe'):
        print("⚠️ Pas d'univers quantitatif détecté, génération en mode legacy")
        return generate_portfolios_legacy(filtered_data)
    
    # Préparer les données structurées
    print("🔄 Préparation des données structurées v3...")
    structured_data = prepare_structured_data(filtered_data)
    allowed_assets = extract_allowed_assets(filtered_data)
    
    universe = filtered_data['universe']
    print(f"  📊 Brief: {len(structured_data['brief_points'])} points")
    print(f"  📈 Marchés: {len(structured_data['market_points'])} points")
    print(f"  🏭 Secteurs: {len(structured_data['sector_points'])} points")
    print(f"  🔍 Thèmes: {len(structured_data['theme_points'])} points")
    print(f"  💼 Actions autorisées: {len(allowed_assets['allowed_equities'])}")
    print(f"  📊 ETF standards: {len(allowed_assets['allowed_etfs_standard'])}")
    print(f"  📉 ETF obligataires: {len(allowed_assets['allowed_bond_etfs'])}")
    print(f"  🪙 Cryptos autorisées: {len(allowed_assets['allowed_crypto'])}")
    
    # Construire le prompt robuste v3 avec compliance AMF
    prompt = build_robust_prompt_v3(structured_data, allowed_assets, current_month)
    
    # Horodatage pour les fichiers de debug
    debug_timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Sauvegarder le prompt pour debug
    print("🔍 Sauvegarde du prompt v3 pour debug...")
    debug_file, html_file = save_prompt_to_debug_file(prompt, debug_timestamp)
    print(f"✅ Prompt v3 sauvegardé dans {debug_file}")
    
    # FIX 3: Configuration API avec forçage JSON, température 0 et limite de tokens
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": "gpt-4-turbo",  # Modèle stable et fiable
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,  # 0 pour maximum de déterminisme
        "response_format": {"type": "json_object"},  # Force le JSON
        "max_tokens": 1800  # FIX 3: Borne raisonnable pour éviter des réponses trop longues
    }
    
    print("🚀 Envoi de la requête à l'API OpenAI (prompt v3 quantitatif + compliance)...")
    response = post_with_retry("https://api.openai.com/v1/chat/completions", headers, data, tries=5, timeout=(20, 180))
    response.raise_for_status()
    
    result = response.json()
    content = result["choices"][0]["message"]["content"]
    
    # Sauvegarder la réponse
    response_debug_file = f"debug/prompts/response_v3_{debug_timestamp}.txt"
    os.makedirs("debug/prompts", exist_ok=True)
    with open(response_debug_file, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"✅ Réponse v3 sauvegardée dans {response_debug_file}")
    
    # Parsing direct (pas de nettoyage nécessaire avec response_format)
    try:
        portfolios = json.loads(content)
    except json.JSONDecodeError as e:
        print(f"❌ Erreur de parsing JSON: {e}")
        # Essayer de nettoyer le contenu
        content = re.sub(r'^```json', '', content)
        content = re.sub(r'```$', '', content)
        content = content.strip()
        portfolios = json.loads(content)
    
    # FIX 3: Attacher compliance de manière sûre
    portfolios = attach_compliance(portfolios)
    
    # NOUVEAU: Appliquer la sanitisation compliance
    print("🛡️ Application de la sanitisation compliance AMF...")
    portfolios = apply_compliance_sanitization(portfolios)
    
    # Validation post-génération v3
    validation_ok, errors = validate_portfolios_v3(portfolios, allowed_assets)
    if not validation_ok:
        print(f"⚠️ Erreurs de validation v3 détectées: {errors}")
        portfolios = fix_portfolios_v3(portfolios, errors)
        
        # Re-valider après correction
        validation_ok, remaining_errors = validate_portfolios_v3(portfolios, allowed_assets)
        if not validation_ok:
            print(f"⚠️ Erreurs restantes après correction: {remaining_errors}")
    
    # Contrôle final des scores
    try:
        score_guard(portfolios, allowed_assets)
    except ValueError as e:
        print(f"❌ Score guard failed: {e}")
        # On peut décider de régénérer ou accepter avec warning
    
    print("✅ Portefeuilles v3 générés avec succès (scoring quantitatif + compliance AMF)")
    
    # Afficher un résumé détaillé
    for portfolio_name, portfolio in portfolios.items():
        if isinstance(portfolio, dict) and 'Lignes' in portfolio:
            lignes = portfolio['Lignes']
            total_alloc = sum(ligne.get('allocation_pct', 0) for ligne in lignes)
            categories = set(ligne.get('category') for ligne in lignes)
            
            # Calculer stats des scores
            scores = []
            risk_counts = defaultdict(int)
            for ligne in lignes:
                asset_id = ligne.get('id', '')
                for asset_type in ["allowed_equities", "allowed_etfs_standard", "allowed_bond_etfs", "allowed_crypto"]:
                    for asset in allowed_assets.get(asset_type, []):
                        if asset["id"] == asset_id:
                            scores.append(asset.get('score', 0))
                            risk_counts[asset.get('risk_class', 'unknown')] += 1
                            break
            
            avg_score = np.mean(scores) if scores else 0
            median_score = np.median(scores) if scores else 0
            compliance_ok = bool(portfolio.get('Compliance'))
            
            print(f"  📊 {portfolio_name}: {len(lignes)} actifs, {len(categories)} catégories, {total_alloc:.2f}%")
            print(f"     Score moyen: {avg_score:.2f}, médiane: {median_score:.2f}")
            print(f"     Répartition risque: {dict(risk_counts)}")
            print(f"     Compliance AMF: {'✅' if compliance_ok else '❌'}")
    
    return portfolios
    # === NORMALISATION V3 -> SCHÉMA FRONT HISTORIQUE (Agressif/Modéré/Stable) ===
def _infer_category_from_id(asset_id: str) -> str:
    if str(asset_id).startswith("EQ_"):    return "Actions"
    if str(asset_id).startswith("ETF_b"):  return "Obligations"
    if str(asset_id).startswith("ETF_s"):  return "ETF"
    if str(asset_id).startswith("CR_"):    return "Crypto"
    return "Autres"

def _build_asset_lookup(allowed_assets: dict) -> dict:
    # id -> {name, category}
    lut = {}
    for k, cat in [("allowed_equities","Actions"),
                   ("allowed_etfs_standard","ETF"),
                   ("allowed_bond_etfs","Obligations"),
                   ("allowed_crypto","Crypto")]:
        for a in allowed_assets.get(k, []):
            lut[a["id"]] = {"name": a.get("name", a["id"]), "category": cat}
    return lut

def _pct(v) -> str:
    try: return f"{round(float(v))}%"
    except: return f"{v}%"

def normalize_v3_to_frontend_v1(raw_obj: dict, allowed_assets: dict) -> dict:
    """
    Convertit le format v3 (avec Lignes et id) vers l'ancien format frontend
    """
    lut = _build_asset_lookup(allowed_assets)
    
    out = {}
    
    # Traiter chaque type de portefeuille
    for portfolio_name in ["Agressif", "Modéré", "Stable"]:
        if portfolio_name not in raw_obj:
            continue
            
        portfolio_v3 = raw_obj[portfolio_name]
        portfolio_v1 = {
            "Commentaire": portfolio_v3.get("Commentaire", ""),
            "Actions": {},
            "ETF": {},
            "Obligations": {},
            "Crypto": {}
        }
        
        # Ajouter les autres champs s'ils existent
        if "ActifsExclus" in portfolio_v3:
            portfolio_v1["ActifsExclus"] = portfolio_v3["ActifsExclus"]
        if "Compliance" in portfolio_v3:
            portfolio_v1["Compliance"] = portfolio_v3["Compliance"]
        
        # Convertir les lignes
        if "Lignes" in portfolio_v3 and isinstance(portfolio_v3["Lignes"], list):
            for ligne in portfolio_v3["Lignes"]:
                asset_id = ligne.get("id", "")
                allocation = ligne.get("allocation_pct", 0)
                
                # Récupérer le nom et la catégorie depuis le lookup ou la ligne elle-même
                if asset_id in lut:
                    name = lut[asset_id]["name"]
                    category = lut[asset_id]["category"]
                else:
                    name = ligne.get("name", asset_id)
                    category = ligne.get("category", _infer_category_from_id(asset_id))
                
                # Ajouter l'actif dans la bonne catégorie
                if category in portfolio_v1:
                    portfolio_v1[category][name] = _pct(allocation)
        
        out[portfolio_name] = portfolio_v1
    
    return out

def update_history_index_from_normalized(normalized_json: dict, history_file: str, version: str):
    """Met à jour l'index avec les données normalisées"""
    try:
        index_file = 'data/portfolio_history/index.json'
        index_data = []
        if os.path.exists(index_file):
            try:
                with open(index_file,'r',encoding='utf-8') as f:
                    index_data = json.load(f)
            except json.JSONDecodeError:
                index_data = []

        entry = {
            "file": os.path.basename(history_file),
            "version": version,
            "timestamp": datetime.datetime.now().strftime('%Y%m%d_%H%M%S'),
            "date": datetime.datetime.now().isoformat(),
            "summary": {}
        }
        
        for pf_name, pf in normalized_json.items():
            if isinstance(pf, dict):
                entry["summary"][pf_name] = {
                    "Actions": f"{len(pf.get('Actions',{}))} actifs",
                    "ETF": f"{len(pf.get('ETF',{}))} actifs",
                    "Obligations": f"{len(pf.get('Obligations',{}))} actifs",
                    "Crypto": f"{len(pf.get('Crypto',{}))} actifs",
                }
        
        index_data.insert(0, entry)
        index_data = index_data[:100]
        
        with open(index_file,'w',encoding='utf-8') as f:
            json.dump(index_data, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print(f"⚠️ Avertissement: index non mis à jour ({e})")

def save_portfolios_normalized(portfolios_v3: dict, allowed_assets: dict):
    """Sauvegarde les portefeuilles en normalisant vers l'ancien format"""
    try:
        history_dir = 'data/portfolio_history'
        os.makedirs(history_dir, exist_ok=True)
        ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')

        # 1) Normaliser vers l'ancien format pour le frontend
        normalized_portfolios = normalize_v3_to_frontend_v1(portfolios_v3, allowed_assets)
        
        # 2) Sauvegarder le fichier principal pour le frontend
        with open('portefeuilles.json','w',encoding='utf-8') as f:
            json.dump(normalized_portfolios, f, ensure_ascii=False, indent=4)

        # 3) Archive du format v3 original pour debug/traçabilité
        history_file = f"{history_dir}/portefeuilles_v3_stable_{ts}.json"
        with open(history_file,'w',encoding='utf-8') as f:
            json.dump({
                "version": "v3_quantitatif_compliance_amf_stable",
                "timestamp": ts,
                "date": datetime.datetime.now().isoformat(),
                "portfolios": portfolios_v3,
                "features": [
                    "normalisation_v3_vers_v1",
                    "drawdown_normalisé",
                    "diversification_round_robin", 
                    "validation_anti_fin_cycle",
                    "fallback_crypto_progressif",
                    "cache_univers_hash",
                    "retry_api_robuste",
                    "compliance_amf",
                    "sanitisation_marketing",
                    "disclaimer_automatique",
                    "regex_pandas_fixed",
                    "etf_detection_fixed",
                    "timeout_extended",
                    "type_safety_improved",
                    "cache_fallback_system"
                ]
            }, f, ensure_ascii=False, indent=4)

        # 4) Mettre à jour l'index
        update_history_index_from_normalized(normalized_portfolios, history_file, "v3_stable_normalized")

        print(f"✅ Sauvegarde OK → portefeuilles.json (format v1 pour frontend) + {history_file} (archive v3)")
        
    except Exception as e:
        print(f"❌ Erreur lors de la sauvegarde des portefeuilles: {str(e)}")

# ============= FONCTIONS HELPER POUR LES NOUVEAUX FICHIERS (améliorées) =============

def build_lists_summary_from_stocks_files(stocks_paths):
    """Remplace filter_lists_data(lists_data) avec les nouveaux stocks_*.json."""
    def load_json_safe(p):
        try:
            with open(p, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"  ⚠️ Impossible de charger {p}: {str(e)}")
            return {}
    
    by_sector, by_country = {}, {}
    total_stocks_loaded = 0
    
    for p in stocks_paths:
        data = load_json_safe(p)
        items = data.get("stocks", [])
        print(f"  📊 {p.name}: {len(items)} stocks trouvées")
        total_stocks_loaded += len(items)
        
        for it in items:
            name = it.get("name") or it.get("ticker") or ""
            sector = it.get("sector") or "Non classé"
            country = it.get("country") or "Non précisé"
            ytd = it.get("perf_ytd") or it.get("ytd") or it.get("perf_1y") or 0
            daily = it.get("perf_1d") or it.get("change_percent") or 0
            ytd_v, daily_v = fnum(ytd), fnum(daily)
            
            # Filtre: YTD [-5,120], Daily > -10
            if -5 <= ytd_v <= 120 and daily_v > -10:
                display_name = name
                if ytd_v > 50 and daily_v < 0:
                    display_name = f"🚩 {name} (potentielle surévaluation)"
                elif ytd_v > 10 and daily_v < -5:
                    display_name = f"📉 {name} (forte baisse récente mais secteur haussier)"
                
                row = {
                    "name": display_name,
                    "ytd": ytd_v,
                    "daily": daily_v,
                    "sector": sector,
                    "country": country,
                    "original_name": name
                }
                by_sector.setdefault(sector, []).append(row)
                by_country.setdefault(country, []).append(row)

    print(f"  ✅ Total stocks chargées: {total_stocks_loaded}")
    print(f"  ✅ Stocks filtrées (YTD -5% à 120% et Daily > -10%): {sum(len(v) for v in by_sector.values())}")

    lines = ["📋 TOP 5 ACTIFS PAR SECTEUR (YTD -5% à 120% et Daily > -10%) :"]
    total = 0
    
    for sector in sorted(by_sector.keys()):
        xs = sorted(by_sector[sector], key=lambda r: r["ytd"], reverse=True)[:5]
        if not xs: 
            continue
        lines.append(f"\n🏭 SECTEUR: {sector.upper()} ({len(xs)} actifs)")
        for r in xs:
            country_info = f" | Pays: {r['country']}" if r['country'] != "Non précisé" else ""
            lines.append(f"• {r['name']}: YTD {r['ytd']:.2f}%, Daily {r['daily']:.2f}%{country_info}")
        total += len(xs)
    
    lines.insert(1, f"Total: {total} actifs répartis dans {len(by_sector)} secteurs")
    
    return "\n".join(lines) if total else "Aucune donnée d'actifs significative"

def load_etf_dict_from_csvs(etf_csv_path, bonds_csv_path):
    """Construit le dict attendu par filter_etf_data() à partir des CSV."""
    etf = {"top50_etfs": [], "top_short_term_etfs": [], "top_bond_etfs": []}
    
    # Charger les ETF obligataires
    try:
        if Path(bonds_csv_path).exists():
            bdf = pd.read_csv(bonds_csv_path)
            print(f"  📊 ETF obligataires: {len(bdf)} trouvés")
            
            name_col = next((c for c in bdf.columns if str(c).lower() in ["name", "etf_name", "long_name", "symbol"]), None)
            ytd_col = next((c for c in bdf.columns if "ytd" in str(c).lower()), None)
            
            if name_col:
                for _, r in bdf.iterrows():
                    etf["top_bond_etfs"].append({
                        "name": str(r[name_col]),
                        "ytd": str(r[ytd_col]) if ytd_col and pd.notna(r[ytd_col]) else "N/A"
                    })
    except Exception as e:
        print(f"  ⚠️ Erreur lors du chargement des bonds: {str(e)}")
    
    # Charger les ETF standards
    try:
        if Path(etf_csv_path).exists():
            df = pd.read_csv(etf_csv_path)
            print(f"  📊 ETF standards: {len(df)} trouvés")
            
            name_col = next((c for c in df.columns if str(c).lower() in ["name", "etf_name", "long_name", "symbol"]), None)
            ytd_col = next((c for c in df.columns if "ytd" in str(c).lower()), None)
            dur_col = next((c for c in df.columns if "duration" in str(c).lower()), None)
            
            if name_col:
                if ytd_col:
                    df_sorted = df.sort_values(ytd_col, ascending=False)
                else:
                    df_sorted = df
                    
                for _, r in df_sorted.head(50).iterrows():
                    etf["top50_etfs"].append({
                        "name": str(r[name_col]),
                        "ytd": str(r[ytd_col]) if ytd_col and pd.notna(r[ytd_col]) else "N/A"
                    })
                
                # ETF court terme
                if dur_col and dur_col in df.columns:
                    short = df[df[dur_col] <= 1.0]
                else:
                    pattern = r"short\s*term|ultra\s*short|0[-–]1|1[-–]3\s*year"
                    short = df[df[name_col].astype(str).str.contains(pattern, case=False, regex=True, na=False)]
                
                for _, r in short.head(20).iterrows():
                    etf["top_short_term_etfs"].append({
                        "name": str(r[name_col]),
                        "oneMonth": "N/A"
                    })
    except Exception as e:
        print(f"  ⚠️ Erreur lors du chargement des ETF: {str(e)}")
    
    return etf

def load_crypto_dict_from_csv(csv_path):
    """Construit une structure minimale compatible filter_crypto_data()."""
    out = {"categories": {"main": []}}
    
    try:
        if Path(csv_path).exists():
            df = pd.read_csv(csv_path)
            print(f"  🪙 Cryptos: {len(df)} trouvées dans le CSV")
        else:
            print(f"  ⚠️ Fichier crypto non trouvé: {csv_path}")
            return out
    except Exception as e:
        print(f"  ⚠️ Erreur lors du chargement des cryptos: {str(e)}")
        return out
    
    # Mapper les colonnes
    cols = {c.lower(): c for c in df.columns}
    c_sym = next((cols[x] for x in cols if x in ["symbol", "pair"]), None)
    c_r1 = next((cols[x] for x in cols if x in ["ret_1d_pct", "ret_1d", "ret_1d%", "perf_1d"]), None)
    c_r7 = next((cols[x] for x in cols if x in ["ret_7d_pct", "ret_7d", "ret_7d%", "perf_7d"]), None)
    c_pr = next((cols[x] for x in cols if "last_close" in x or "price" in x), None)
    c_tier = next((cols[x] for x in cols if "tier1" in x), None)
    
    def as_bool(v):
        return str(v).lower() in ["true", "1", "yes"]
    
    cryptos_added = 0
    for _, r in df.iterrows():
        # Filtrer par tier si la colonne existe
        if c_tier and not as_bool(r[c_tier]):
            continue
            
        name = str(r[c_sym]) if c_sym else ""
        out["categories"]["main"].append({
            "name": name,
            "symbol": name,
            "price": str(r[c_pr]) if c_pr and pd.notna(r[c_pr]) else "",
            "change_24h": f"{r[c_r1]}%" if c_r1 and pd.notna(r[c_r1]) else "0%",
            "change_7d": f"{r[c_r7]}%" if c_r7 and pd.notna(r[c_r7]) else "0%",
        })
        cryptos_added += 1
    
    print(f"  ✅ Cryptos ajoutées au dict: {cryptos_added}")
    return out

# ============= FONCTIONS ORIGINALES (gardées intactes) =============

def get_current_month_fr():
    """Retourne le nom du mois courant en français."""
    try:
        locale.setlocale(locale.LC_TIME, 'fr_FR.UTF-8')
    except locale.Error:
        month_names = {
            1: "janvier", 2: "février", 3: "mars", 4: "avril",
            5: "mai", 6: "juin", 7: "juillet", 8: "août",
            9: "septembre", 10: "octobre", 11: "novembre", 12: "décembre"
        }
        return month_names[datetime.datetime.now().month]
    
    return datetime.datetime.now().strftime('%B').lower()

def filter_news_data(news_data):
    """Filtre les données d'actualités pour n'inclure que les plus pertinentes."""
    if not news_data or not isinstance(news_data, dict):
        return "Aucune donnée d'actualité disponible"
    
    filtered_news = []
    
    for region, news_list in news_data.items():
        if not isinstance(news_list, list):
            continue
            
        important_news = []
        for news in news_list[:5]:
            if not isinstance(news, dict):
                continue
                
            important_news.append({
                "title": news.get("title", ""),
                "impact": news.get("impact", ""),
                "category": news.get("category", ""),
                "date": news.get("date", "")
            })
        
        if important_news:
            filtered_news.append(f"Région {region}: " + 
                               ", ".join([f"{n['title']} ({n['impact']})" for n in important_news]))
    
    return "\n".join(filtered_news) if filtered_news else "Aucune donnée d'actualité pertinente"

def filter_markets_data(markets_data):
    """Filtre les données de marché pour inclure les indices clés et les top performers."""
    if not markets_data or not isinstance(markets_data, dict):
        return "Aucune donnée de marché disponible"
    
    lines = []
    
    # Résumé par région – indices globaux
    indices_data = markets_data.get("indices", {})
    for region, indices in indices_data.items():
        if not isinstance(indices, list):
            continue
        
        lines.append(f"📈 {region}")
        for idx in indices[:5]:
            name = idx.get("index_name", "")
            var = idx.get("change", "")
            ytd = idx.get("ytdChange", "")
            if name and var:
                lines.append(f"• {name}: {var} | YTD: {ytd}")
    
    # Traitement des Top Performers
    if "top_performers" in markets_data and isinstance(markets_data["top_performers"], dict):
        if "daily" in markets_data["top_performers"]:
            daily = markets_data["top_performers"]["daily"]
            
            if "best" in daily and isinstance(daily["best"], list) and daily["best"]:
                lines.append("🏆 Top Hausses (variation quotidienne):")
                for item in daily["best"][:3]:
                    if isinstance(item, dict):
                        name = item.get("index_name", "")
                        change = item.get("change", "")
                        country = item.get("country", "")
                        if name and country:
                            lines.append(f"• {name} ({country}): {change}")
            
            if "worst" in daily and isinstance(daily["worst"], list) and daily["worst"]:
                lines.append("📉 Top Baisses (variation quotidienne):")
                for item in daily["worst"][:3]:
                    if isinstance(item, dict):
                        name = item.get("index_name", "")
                        change = item.get("change", "")
                        country = item.get("country", "")
                        if name and country:
                            lines.append(f"• {name} ({country}): {change}")
    
    return "\n".join(lines) if lines else "Aucune donnée de marché significative"

def filter_sectors_data(sectors_data):
    """Filtre les données sectorielles pour montrer les meilleures et pires variations par région."""
    if not sectors_data or not isinstance(sectors_data, dict):
        return "Aucune donnée sectorielle disponible"
    
    summary = []
    sectors = sectors_data.get("sectors", {})
    
    for region, sector_list in sectors.items():
        if not isinstance(sector_list, list):
            continue
        
        try:
            sector_list_sorted = sorted(
                sector_list, 
                key=lambda x: float(str(x.get("ytd", "0")).replace('%','').replace(',', '.')), 
                reverse=True
            )
        except (ValueError, TypeError):
            sector_list_sorted = sector_list
        
        summary.append(f"🏭 {region}")
        for sec in sector_list_sorted[:5]:
            name = sec.get("name", "")
            var = sec.get("change", "")
            ytd = sec.get("ytd", "")
            if name and var:
                summary.append(f"• {name} : {var} | YTD : {ytd}")
    
    return "\n".join(summary) if summary else "Aucune donnée sectorielle significative"

def filter_etf_data(etfs_data):
    """Filtre les ETF par catégories."""
    if not etfs_data or not isinstance(etfs_data, dict):
        return "Aucune donnée ETF disponible", []
    
    summary = []
    summary.append("📊 LISTE DES ETF STANDARDS DISPONIBLES POUR LES PORTEFEUILLES:")

    # TOP ETF 2025 → à utiliser comme ETF standards
    top_etfs = etfs_data.get("top50_etfs", [])
    selected_top = []
    for etf in top_etfs:
        if etf.get('name'):
            selected_top.append(f"{etf['name']} : {etf.get('ytd', 'N/A')}")
    if selected_top:
        summary.append("📊 TOP ETF STANDARDS 2025:")
        summary.extend(f"• {etf}" for etf in selected_top)

    # TOP ETF OBLIGATIONS 2025
    bond_etfs = etfs_data.get("top_bond_etfs", [])
    bond_names = []
    selected_bonds = []
    
    for etf in bond_etfs:
        if etf.get('name'):
            bond_names.append(etf['name'])
            selected_bonds.append(f"{etf['name']} : {etf.get('ytd', 'N/A')}")
    
    if selected_bonds:
        summary.append("📉 LISTE DES ETF OBLIGATAIRES (À UTILISER UNIQUEMENT DANS LA CATÉGORIE OBLIGATIONS):")
        summary.extend(f"• {etf}" for etf in selected_bonds)

    # ETF court terme
    short_term_etfs = etfs_data.get("top_short_term_etfs", [])
    selected_short_term = []
    for etf in short_term_etfs:
        if etf.get('name'):
            selected_short_term.append(f"{etf['name']} : {etf.get('oneMonth', 'N/A')}")
    if selected_short_term:
        summary.append("📆 ETF COURT TERME:")
        summary.extend(f"• {etf}" for etf in selected_short_term)
    
    # Fallback si aucun ETF obligataire
    if not bond_names:
        print("⚠️ Aucun ETF obligataire trouvé dans les données, ajout d'exemples de secours")
        bond_names = [
            "iShares Euro Government Bond 3-5yr UCITS ETF",
            "Xtrackers II Eurozone Government Bond UCITS ETF",
            "Lyxor Euro Government Bond UCITS ETF"
        ]
    
    return "\n".join(summary), bond_names

def filter_crypto_data(crypto_data):
    """Retourne toutes les cryptos où 7j > 24h > 0, ou à défaut 24h > 0 et 7j > -5"""
    if not crypto_data or not isinstance(crypto_data, dict):
        return "Aucune donnée de crypto-monnaie disponible"
    
    print("🔍 Débogage du filtre crypto: Analyse des données d'entrée")
    main = crypto_data.get('categories', {}).get('main', [])
    print(f"   Nombre de cryptos trouvées: {len(main)}")
    
    cryptos = []
    alt_cryptos = []

    for i, crypto in enumerate(main):
        try:
            name = crypto.get('name', '')
            symbol = crypto.get('symbol', '')
            price = crypto.get('price', '')
            
            c24h_raw = crypto.get('change_24h', '0%')
            c7d_raw = crypto.get('change_7d', '0%')
            
            c24_str = re.sub(r'[^0-9.\-]', '', str(c24h_raw))
            c7_str = re.sub(r'[^0-9.\-]', '', str(c7d_raw))
            
            c24 = float(c24_str or 0)
            c7 = float(c7_str or 0)
            
            if i < 5:
                print(f"   {name} ({symbol}) | 24h brut: {c24h_raw}, 7j brut: {c7d_raw}")
                print(f"   → Converti: 24h = {c24}, 7j = {c7}")
            
            if c7 > c24 > 0:
                cryptos.append((name, symbol, price, c24, c7))
                if i < 5:
                    print(f"   ✅ {name} PASSE le filtre ! 7j: {c7} > 24h: {c24} > 0")
            elif c24 > 0 and c7 > -5:
                alt_cryptos.append((name, symbol, price, c24, c7))
                
        except Exception as e:
            if i < 5:
                print(f"   ⚠️ ERREUR pour {crypto.get('name', 'inconnu')}: {str(e)}")
            continue

    # Fallback si aucun résultat strict
    if not cryptos and alt_cryptos:
        print("⚠️ Aucune crypto ne respecte 7j > 24h > 0 → Fallback: 24h > 0 et 7j > -5")
        cryptos = alt_cryptos
        criteria_desc = "24h > 0 ET 7j > -5%"
    elif cryptos:
        criteria_desc = "7j > 24h > 0%"
    else:
        criteria_desc = "aucun critère satisfait"

    if not cryptos:
        return "Aucune crypto ne respecte les critères de tendance positive stable"

    summary = [f"🪙 CRYPTOS AVEC TENDANCE POSITIVE ({criteria_desc}) :"]
    summary.append(f"Total: {len(cryptos)} cryptos")

    for name, symbol, price, c24, c7 in cryptos:
        stability = c7/c24 if c24 != 0 else 0
        stability_txt = f"| Stabilité: {stability:.1f}x" if criteria_desc == "7j > 24h > 0%" else ""
        sign_24 = "+" if c24 > 0 else ""
        sign_7 = "+" if c7 > 0 else ""
        summary.append(f"• {name} ({symbol}): 24h: {sign_24}{c24:.2f}%, 7j: {sign_7}{c7:.2f}% {stability_txt} | Prix: {price}")

    return "\n".join(summary)

def filter_themes_data(themes_data):
    """Filtre les données de thèmes et tendances pour les intégrer au prompt."""
    if not themes_data or not isinstance(themes_data, dict):
        return "Aucune donnée de tendances thématiques disponible"
    
    summary = ["📊 TENDANCES THÉMATIQUES ACTUELLES:"]
    
    if "bullish" in themes_data and isinstance(themes_data["bullish"], list):
        summary.append("🔼 THÈMES HAUSSIERS:")
        for theme in themes_data["bullish"]:
            if isinstance(theme, dict):
                name = theme.get("name", "")
                reason = theme.get("reason", "")
                score = theme.get("score", "")
                if name:
                    summary.append(f"• {name}: {reason} (Score: {score})")
    
    if "bearish" in themes_data and isinstance(themes_data["bearish"], list):
        summary.append("🔽 THÈMES BAISSIERS:")
        for theme in themes_data["bearish"]:
            if isinstance(theme, dict):
                name = theme.get("name", "")
                reason = theme.get("reason", "")
                score = theme.get("score", "")
                if name:
                    summary.append(f"• {name}: {reason} (Score: {score})")
    
    if "emerging" in themes_data and isinstance(themes_data["emerging"], list):
        summary.append("🔄 THÈMES ÉMERGENTS:")
        for theme in themes_data["emerging"]:
            if isinstance(theme, dict):
                name = theme.get("name", "")
                description = theme.get("description", "")
                if name:
                    summary.append(f"• {name}: {description}")
    
    return "\n".join(summary)

def save_prompt_to_debug_file(prompt, timestamp=None):
    """Sauvegarde le prompt complet dans un fichier de débogage."""
    debug_dir = "debug/prompts"
    os.makedirs(debug_dir, exist_ok=True)
    
    if timestamp is None:
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    
    debug_file = f"{debug_dir}/prompt_v3_{timestamp}.txt"
    
    with open(debug_file, 'w', encoding='utf-8') as f:
        f.write(prompt)
    
    # Générer un fichier HTML plus lisible
    html_file = f"{debug_dir}/prompt_v3_{timestamp}.html"
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>TradePulse - Debug de Prompt v3 Quantitatif + Compliance STABLE</title>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }}
            pre {{ background-color: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; white-space: pre-wrap; }}
            h1, h2 {{ color: #2c3e50; }}
            .info {{ background-color: #e8f4f8; padding: 10px; border-radius: 5px; margin-bottom: 20px; }}
            .highlight {{ background-color: #ffffcc; }}
            .v3-badge {{ background: linear-gradient(45deg, #6c5ce7, #a29bfe); color: white; padding: 5px 10px; border-radius: 15px; font-weight: bold; }}
            .feature {{ background: linear-gradient(45deg, #00b894, #00cec9); color: white; padding: 3px 8px; border-radius: 10px; font-size: 0.8em; margin: 0 3px; }}
            .compliance {{ background: linear-gradient(45deg, #d63031, #e84393); color: white; padding: 3px 8px; border-radius: 10px; font-size: 0.8em; margin: 0 3px; }}
            .fix {{ background: linear-gradient(45deg, #fdcb6e, #e17055); color: white; padding: 3px 8px; border-radius: 10px; font-size: 0.8em; margin: 0 3px; }}
        </style>
    </head>
    <body>
        <h1>TradePulse - Debug de Prompt v3 <span class="v3-badge">STABLE</span></h1>
        <div class="info">
            <p><strong>Version:</strong> v3 - Scoring quantitatif + Anti-hallucinations + Compliance AMF + Fixes de stabilité</p>
            <p><strong>Timestamp:</strong> {timestamp}</p>
            <p><strong>Taille totale du prompt:</strong> {len(prompt)} caractères</p>
            <p><strong>Fonctionnalités:</strong> 
                <span class="feature">Score Momentum</span>
                <span class="feature">Détection Sur-extension</span>
                <span class="feature">Classes de Risque</span>
                <span class="feature">Filtre Anti-Levier</span>
                <span class="feature">Équilibrage Sectoriel</span>
                <span class="feature">Retry API</span>
                <span class="feature">Cache Univers</span>
                <span class="compliance">Compliance AMF</span>
                <span class="compliance">Anti-Marketing</span>
                <span class="compliance">Disclaimer Auto</span>
                <span class="fix">Regex Fixed</span>
                <span class="fix">ETF Detection Fixed</span>
                <span class="fix">Timeout Extended</span>
                <span class="fix">Type Safety</span>
            </p>
        </div>
        <h2>Contenu du prompt v3 envoyé à OpenAI :</h2>
        <pre>{prompt.replace('<', '&lt;').replace('>', '&gt;')}</pre>
    </body>
    </html>
    """
    
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"✅ Pour voir le prompt v3 dans l'interface web, accédez à: debug-prompts.html")
    
    return debug_file, html_file

def generate_portfolios(filtered_data):
    """
    FIX 4: Fonction principale de génération avec filet de sécurité cache
    """
    print("🚀 Lancement de la génération de portefeuilles v3 (scoring quantitatif + compliance AMF)")
    
    try:
        # Utiliser la nouvelle version quantitative v3 avec compliance
        portfolios = generate_portfolios_v3(filtered_data)
        
        # Validation finale avec les fonctions existantes pour compatibilité
        validation_ok, validation_errors = check_portfolio_constraints(portfolios)
        if not validation_ok:
            print(f"⚠️ Validation finale échouée: {validation_errors}")
            portfolios = adjust_portfolios(portfolios)
            print("🔧 Portefeuilles ajustés avec les fonctions existantes")
        
        return portfolios
        
    except Exception as e:
        print(f"❌ Erreur dans la génération v3: {e}\n⚠️ Fallback v2…")
        try:
            portfolios = generate_portfolios_v2(filtered_data)
            return portfolios
        except Exception as e2:
            print(f"❌ Erreur v2: {e2}")
            # FIX 4: Filet de sécurité - utiliser le cache
            cached = load_cached_portfolios()
            if cached:
                print("🛟 API indisponible → on réutilise le dernier portefeuille en cache.")
                # S'assurer que le cache a la compliance
                cached = attach_compliance(cached)
                return cached
            raise  # plus rien en réserve → on laisse échouer

def generate_portfolios_v2(filtered_data):
    """Version v2 en fallback si v3 échoue"""
    print("⚠️ Utilisation de la version v2 en fallback")
    
    api_key = os.environ.get('API_CHAT')
    if not api_key:
        raise ValueError("La clé API OpenAI (API_CHAT) n'est pas définie.")
    
    current_month = get_current_month_fr()
    
    # Préparer les données structurées
    structured_data = prepare_structured_data(filtered_data)
    allowed_assets = extract_allowed_assets(filtered_data)
    
    # Construire le prompt v2
    prompt = build_robust_prompt_v2(structured_data, allowed_assets, current_month)
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": "gpt-4-turbo",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "max_tokens": 1800  # FIX 3: Même limite pour v2
    }
    
    print("🚀 Envoi de la requête à l'API OpenAI (prompt v2 fallback)...")
    response = post_with_retry("https://api.openai.com/v1/chat/completions", headers, data, tries=5, timeout=(20, 180))
    response.raise_for_status()
    
    result = response.json()
    content = result["choices"][0]["message"]["content"]
    
    try:
        portfolios = json.loads(content)
    except json.JSONDecodeError as e:
        print(f"❌ Erreur de parsing JSON: {e}")
        content = re.sub(r'^```json', '', content)
        content = re.sub(r'```$', '', content)
        content = content.strip()
        portfolios = json.loads(content)
    
    # FIX 3: Attacher compliance de manière sûre même en fallback
    portfolios = attach_compliance(portfolios)
    portfolios = apply_compliance_sanitization(portfolios)
    
    print("✅ Portefeuilles v2 générés avec succès (fallback + compliance)")
    return portfolios

def build_robust_prompt_v2(structured_data: Dict, allowed_assets: Dict, current_month: str) -> str:
    """Version v2 du prompt pour fallback"""
    prompt = f"""Tu es un expert en allocation. Construis TROIS portefeuilles (Agressif, Modéré, Stable).

## Données structurées (univers fermés)
BRIEF_POINTS = {json.dumps(structured_data['brief_points'], ensure_ascii=False)}
MARKETS = {json.dumps(structured_data['market_points'], ensure_ascii=False)}
SECTORS = {json.dumps(structured_data['sector_points'], ensure_ascii=False)}
THEMES = {json.dumps(structured_data['theme_points'], ensure_ascii=False)}

ALLOWED_EQUITIES = {json.dumps(allowed_assets['allowed_equities'], ensure_ascii=False)}
ALLOWED_ETFS_STANDARD = {json.dumps(allowed_assets['allowed_etfs_standard'], ensure_ascii=False)}
ALLOWED_BOND_ETFS = {json.dumps(allowed_assets['allowed_bond_etfs'], ensure_ascii=False)}
ALLOWED_CRYPTO = {json.dumps(allowed_assets['allowed_crypto'], ensure_ascii=False)}

## Règles ABSOLUES
- Choisir uniquement des actifs dont l'`id` figure dans les listes ALLOWED_*.
- 3 portefeuilles : chacun **12 à 15** lignes (somme Actions+ETF+Obligations+Crypto).
- **≥2 catégories** par portefeuille (parmi: Actions, ETF, Obligations, Crypto).
- **Somme des allocations = 100.00** avec **2 décimales**. La **dernière ligne** ajuste pour atteindre 100.00.
- Inclure un bloc `Compliance` dans chaque portefeuille.

Format JSON strict. Contexte temporel: Portefeuilles pour {current_month} 2025.
"""
    return prompt

def generate_portfolios_legacy(filtered_data):
    """Version originale en dernier recours"""
    print("⚠️ Utilisation de la version legacy en dernier recours")
    
    api_key = os.environ.get('API_CHAT')
    if not api_key:
        raise ValueError("La clé API OpenAI (API_CHAT) n'est pas définie.")
    
    current_month = get_current_month_fr()
    
    # Récupérer les données pré-filtrées du dictionnaire
    filtered_news = filtered_data.get('news', "Aucune donnée d'actualité disponible")
    filtered_markets = filtered_data.get('markets', "Aucune donnée de marché disponible")
    filtered_sectors = filtered_data.get('sectors', "Aucune donnée sectorielle disponible")
    filtered_lists = filtered_data.get('lists', "Aucune donnée d'actifs disponible")
    filtered_etfs = filtered_data.get('etfs', "Aucune donnée ETF disponible")
    filtered_crypto = filtered_data.get('crypto', "Aucune donnée crypto disponible")
    filtered_themes = filtered_data.get('themes', "Aucune donnée de tendances disponible")
    filtered_brief = filtered_data.get('brief', "Aucun résumé disponible")
    bond_etf_names = filtered_data.get('bond_etf_names', [])
    
    bond_etf_list = "\n".join([f"- {name}" for name in bond_etf_names])
    minimum_requirements = get_portfolio_prompt_additions()
    
    prompt = f"""
Tu es un expert en gestion de portefeuille. Crée TROIS portefeuilles (Agressif, Modéré, Stable) avec 12-15 actifs chacun.

📜 BRIEF STRATÉGIQUE: {filtered_brief[:500]}...
📰 ACTUALITÉS: {filtered_news[:300]}...
📈 MARCHÉS: {filtered_markets[:300]}...
🏭 SECTEURS: {filtered_sectors[:300]}...
📋 ACTIFS: {filtered_lists[:500]}...
📊 ETF: {filtered_etfs[:300]}...
🪙 CRYPTO: {filtered_crypto[:200]}...

ETF OBLIGATAIRES AUTORISÉS:
{bond_etf_list}

{minimum_requirements}

Format JSON strict:
{{
  "Agressif": {{"Commentaire": "...", "Actions": {{"Nom": "X%"}}, "ETF": {{}}, "Obligations": {{}}, "Crypto": {{}}, "Compliance": {{...}}}},
  "Modéré": {{...}},
  "Stable": {{...}}
}}
"""
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": "gpt-4-turbo",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": 1800  # FIX 3: Même limite pour legacy
    }
    
    response = post_with_retry("https://api.openai.com/v1/chat/completions", headers, data, tries=5, timeout=(20, 180))
    response.raise_for_status()
    
    result = response.json()
    content = result["choices"][0]["message"]["content"]
    
    content = re.sub(r'^```json', '', content)
    content = re.sub(r'```$', '', content)
    content = content.strip()
    
    portfolios = json.loads(content)
    
    # FIX 3: Attacher compliance même en legacy
    portfolios = attach_compliance(portfolios)
    portfolios = apply_compliance_sanitization(portfolios)
    
    print("✅ Portefeuilles legacy générés avec succès")
    return portfolios

def save_portfolios(portfolios):
    """Sauvegarder les portefeuilles dans un fichier JSON et conserver l'historique."""
    try:
        history_dir = 'data/portfolio_history'
        os.makedirs(history_dir, exist_ok=True)
        
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        
        with open('portefeuilles.json', 'w', encoding='utf-8') as file:
            json.dump(portfolios, file, ensure_ascii=False, indent=4)
        
        history_file = f"{history_dir}/portefeuilles_v3_stable_{timestamp}.json"
        with open(history_file, 'w', encoding='utf-8') as file:
            portfolios_with_metadata = {
                "version": "v3_quantitatif_compliance_amf_stable",
                "timestamp": timestamp,
                "date": datetime.datetime.now().isoformat(),
                "portfolios": portfolios,
                "features": [
                    "drawdown_normalisé",
                    "diversification_round_robin", 
                    "validation_anti_fin_cycle",
                    "fallback_crypto_progressif",
                    "cache_univers_hash",
                    "retry_api_robuste",
                    "compliance_amf",
                    "sanitisation_marketing",
                    "disclaimer_automatique",
                    "regex_pandas_fixed",
                    "etf_detection_fixed",
                    "timeout_extended",
                    "type_safety_improved",
                    "cache_fallback_system"
                ]
            }
            json.dump(portfolios_with_metadata, file, ensure_ascii=False, indent=4)
        
        update_history_index(history_file, portfolios_with_metadata)
        
        print(f"✅ Portefeuilles v3 (stable) sauvegardés avec succès dans portefeuilles.json et {history_file}")
    except Exception as e:
        print(f"❌ Erreur lors de la sauvegarde des portefeuilles: {str(e)}")

def update_history_index(history_file, portfolio_data):
    """Mettre à jour l'index des portefeuilles historiques."""
    try:
        index_file = 'data/portfolio_history/index.json'
        
        index_data = []
        if os.path.exists(index_file):
            try:
                with open(index_file, 'r', encoding='utf-8') as file:
                    index_data = json.load(file)
            except json.JSONDecodeError:
                index_data = []
        
        entry = {
            "file": os.path.basename(history_file),
            "version": portfolio_data.get("version", "legacy"),
            "timestamp": portfolio_data["timestamp"],
            "date": portfolio_data["date"],
            "features": portfolio_data.get("features", []),
            "summary": {}
        }

        for portfolio_type, portfolio in portfolio_data["portfolios"].items():
            entry["summary"][portfolio_type] = {}
            for category, assets in portfolio.items():
                if category not in ["Commentaire", "ActifsExclus", "Compliance"]:
                    if isinstance(assets, list):
                        count = len(assets)
                    elif isinstance(assets, dict):
                        count = len(assets)
                    else:
                        count = 0
                    entry["summary"][portfolio_type][category] = f"{count} actifs"
        
        index_data.insert(0, entry)
        
        if len(index_data) > 100:
            index_data = index_data[:100]
        
        with open(index_file, 'w', encoding='utf-8') as file:
            json.dump(index_data, file, ensure_ascii=False, indent=4)
            
    except Exception as e:
        print(f"⚠️ Avertissement: Erreur lors de la mise à jour de l'index: {str(e)}")

def main():
    """Version modifiée pour utiliser le système de scoring quantitatif v3 avec compliance AMF et fixes de stabilité."""
    print("🔍 Chargement des données financières...")
    print("=" * 60)
    
    # ========== CHARGEMENT DES DONNÉES DEPUIS LES NOUVEAUX FICHIERS ==========
    
    print("\n📂 Chargement des fichiers JSON standards...")
    markets_data = load_json_data('data/markets.json')
    sectors_data = load_json_data('data/sectors.json')
    themes_data = load_json_data('data/themes.json')
    news_data = load_json_data('data/news.json')
    
    print("\n📂 Chargement des nouveaux fichiers stocks...")
    stocks_files = [
        Path('data/stocks_us.json'),
        Path('data/stocks_europe.json'),
        Path('data/stocks_asia.json')
    ]
    stocks_files_exist = [f for f in stocks_files if f.exists()]
    print(f"  Fichiers trouvés: {[f.name for f in stocks_files_exist]}")
    
    print("\n📂 Chargement des nouveaux fichiers ETF/Bonds...")
    etf_csv = Path('data/combined_etfs.csv')
    bonds_csv = Path('data/combined_bonds.csv')
    print(f"  ETF CSV existe: {etf_csv.exists()}")
    print(f"  Bonds CSV existe: {bonds_csv.exists()}")
    
    print("\n📂 Chargement du nouveau fichier crypto...")
    crypto_csv = Path('data/filtered/Crypto_filtered_volatility.csv')
    print(f"  Crypto CSV existe: {crypto_csv.exists()}")
    
    print("\n📂 Recherche du brief stratégique...")
    brief_data = None
    brief_paths = ['brief_ia.json', './brief_ia.json', 'data/brief_ia.json']
    for path in brief_paths:
        try:
            with open(path, 'r', encoding='utf-8') as f:
                brief_data = json.load(f)
                print(f"  ✅ Brief chargé depuis {path}")
                break
        except Exception:
            pass
    
    if brief_data is None:
        print("  ⚠️ Aucun fichier brief_ia.json trouvé")
    
    print("\n" + "=" * 60)
    
    # ========== CONSTRUCTION DE L'UNIVERS QUANTITATIF V3 AVEC CACHE ==========
    
    print("\n🧮 Construction de l'univers quantitatif v3 (avec cache)...")
    
    # Charger les données JSON des stocks
    stocks_jsons = []
    for f in stocks_files_exist:
        stocks_jsons.append(load_json_data(str(f)))
    
    # Hash des sources pour cache
    etf_hash    = file_sha1(etf_csv) if etf_csv.exists() else "NA"
    stocks_hash = json_sha1(stocks_jsons)
    crypto_hash = file_sha1(crypto_csv) if crypto_csv.exists() else "NA"

    cached = get_cached_universe(etf_hash, stocks_hash, crypto_hash)
    if cached:
        print("🗃️ Univers récupéré depuis le cache")
        universe = cached
    else:
        universe = build_scored_universe_v3(
            stocks_jsons,
            str(etf_csv),
            str(crypto_csv)
        )
        set_cached_universe(etf_hash, stocks_hash, crypto_hash, universe)
        print("🗂️ Univers mis en cache")
    
    # ========== FILTRAGE ET PRÉPARATION DES DONNÉES ==========
    
    print("\n🔄 Filtrage et préparation des données...")
    
    # Créer le résumé des stocks (pour compatibilité avec affichage)
    filtered_lists = build_lists_summary_from_stocks_files(stocks_files_exist)
    
    # Charger et filtrer les ETF (pour compatibilité)
    etfs_data = load_etf_dict_from_csvs(str(etf_csv), str(bonds_csv))
    filtered_etfs, bond_etf_names = filter_etf_data(etfs_data)
    
    # Charger et filtrer les cryptos (pour compatibilité)
    crypto_data = load_crypto_dict_from_csv(str(crypto_csv))
    filtered_crypto = filter_crypto_data(crypto_data)
    
    # Filtrer les autres données avec les fonctions existantes
    filtered_news = filter_news_data(news_data) if news_data else "Aucune donnée d'actualité disponible"
    filtered_markets = filter_markets_data(markets_data) if markets_data else "Aucune donnée de marché disponible"
    filtered_sectors = filter_sectors_data(sectors_data) if sectors_data else "Aucune donnée sectorielle disponible"
    filtered_themes = filter_themes_data(themes_data) if themes_data else "Aucune donnée de tendances disponible"
    filtered_brief = format_brief_data(brief_data) if brief_data else "Aucun résumé d'actualités disponible"
    
    # ========== GÉNÉRATION DES PORTEFEUILLES AVEC UNIVERS QUANTITATIF ==========
    
    print("\n🧠 Génération des portefeuilles optimisés v3 (quantitatif + compliance AMF + stabilité)...")
    
    # Préparer le dictionnaire des données filtrées avec l'univers quantitatif
    filtered_data = {
        'news': filtered_news,
        'markets': filtered_markets,
        'sectors': filtered_sectors,
        'lists': filtered_lists,
        'etfs': filtered_etfs,
        'crypto': filtered_crypto,
        'themes': filtered_themes,
        'brief': filtered_brief,
        'bond_etf_names': bond_etf_names,
        'universe': universe  # <<—— NOUVEAU: Univers quantitatif
    }
    
    # Générer les portefeuilles avec la nouvelle version quantitative v3
    portfolios = generate_portfolios(filtered_data)
    
  # ========== SAUVEGARDE ==========
    print("\n💾 Sauvegarde des portefeuilles...")
    allowed_assets = extract_allowed_assets(filtered_data)  # mapping id -> nom/catégorie
    save_portfolios_normalized(portfolios, allowed_assets)
    
    print("\n✨ Traitement terminé avec la version v3 quantitative + COMPLIANCE AMF + STABILITÉ!")
    print("🎯 Fonctionnalités activées:")
    print("   • Scoring quantitatif (momentum, volatilité, drawdown)")
    print("   • Filtrage automatique des ETF à effet de levier")
    print("   • Détection des actifs sur-étendus")
    print("   • Équilibrage par classes de risque")
    print("   • Diversification sectorielle round-robin (cap 30%)")
    print("   • Validation anti-fin-de-cycle (YTD>100% & 1M≤0)")
    print("   • Fallback crypto progressif")
    print("   • Cache intelligent d'univers (hash fichiers)")
    print("   • Retry API robuste (5 tentatives, timeouts étendus)")
    print("   🛡️ COMPLIANCE AMF:")
    print("     ∘ Langage neutre (pas d'incitation)")
    print("     ∘ Disclaimer automatique")
    print("     ∘ Liste des risques")
    print("     ∘ Méthodologie transparente")
    print("     ∘ Sanitisation anti-marketing")
    print("   🔧 FIXES DE STABILITÉ:")
    print("     ∘ Regex pandas warning corrigé")
    print("     ∘ Détection ETF levier corrigée")
    print("     ∘ Timeouts API étendus (20s/180s)")
    print("     ∘ Protection de type améliorée")
    print("     ∘ Système de fallback cache")

def load_json_data(file_path):
    """Charger des données depuis un fichier JSON."""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            data = json.load(file)
            print(f"  ✅ {file_path}: {len(data)} entrées")
            return data
    except Exception as e:
        print(f"  ❌ Erreur {file_path}: {str(e)}")
        return {}

if __name__ == "__main__":
    main()
