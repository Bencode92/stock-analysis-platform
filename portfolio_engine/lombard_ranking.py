"""
lombard_ranking.py — Classement Lombard rendement/qualité
Version: 2.0.0

Lit les stocks_*.json, classe par score Lombard composite
(yield × quality × LTV estimé), exporte data/lombard_ranking.json
consommable par le frontend HTML.

Appelé depuis generate_portfolios_v4.py section 4.7:
    from lombard_ranking import generate_lombard_ranking
    generate_lombard_ranking(CONFIG)
"""

import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional

logger = logging.getLogger("lombard-ranking")


# ══════════════════════════════════════════════════════════════
# LTV MODEL
# ══════════════════════════════════════════════════════════════

def estimate_ltv(stock: Dict) -> float:
    """
    Estime le LTV (Loan-to-Value) qu'une banque accorderait.
    Basé sur: market cap, quality score, volatilité, beta.
    """
    mcap = _safe_float(stock.get("market_cap", 0))
    is_etf = "etf" in (stock.get("type", "") or "").lower()
    
    # Base LTV par taille
    if is_etf:
        base = 0.65
    elif mcap > 10e9:
        base = 0.60  # Large cap
    elif mcap > 2e9:
        base = 0.50  # Mid cap
    else:
        base = 0.35  # Small cap
    
    # Ajustement qualité
    qs = _safe_float(stock.get("quality_score"))
    if qs is not None:
        if qs >= 75:
            base += 0.05  # Grade A
        elif qs >= 55:
            base += 0.02  # Grade B
        elif qs < 35:
            base -= 0.10  # Grade D
    
    # Ajustement volatilité
    vol = _safe_float(stock.get("volatility_3y")) or _safe_float(stock.get("vol")) or 20
    if vol < 15:
        base += 0.03
    elif vol > 30:
        base -= 0.08
    elif vol > 25:
        base -= 0.04
    
    # Ajustement beta
    beta = _safe_float(stock.get("beta")) or 1.0
    if beta < 0.7:
        base += 0.02
    elif beta > 1.3:
        base -= 0.05
    
    return max(0.20, min(0.75, base))


# ══════════════════════════════════════════════════════════════
# LOMBARD SCORING
# ══════════════════════════════════════════════════════════════

def compute_lombard_score(stock: Dict, lombard_rate: float = 3.0) -> Optional[Dict]:
    """
    Score Lombard composite: optimise carry × qualité × LTV.
    Retourne None si le stock n'a pas de dividend yield.
    """
    dy = _safe_float(stock.get("dividend_yield"))
    if dy is None or dy <= 0:
        return None
    
    ltv = estimate_ltv(stock)
    carry_net = dy - lombard_rate
    leveraged_carry = carry_net * (ltv / (1 - ltv)) if ltv < 1 else 0
    
    # Score composite v2.0
    qs = _safe_float(stock.get("quality_score")) or 50
    vol = _safe_float(stock.get("volatility_3y")) or _safe_float(stock.get("vol")) or 20
    payout = _safe_float(stock.get("payout_ratio_ttm")) or _safe_float(stock.get("payout_ratio")) or 50
    eps_surp = _safe_float(stock.get("eps_surprise_avg_2q"))

    carry_score = max(-30, min(40, carry_net * 15))
    quality_score = max(-15, min(25, (qs - 50) * 0.5))
    safety_score = max(-15, min(15, (25 - vol) * 1.0))
    ltv_score = max(-10, min(20, (ltv - 0.50) * 80))

    # v2.0: Payout ratio — payout > 90% = dividende en danger
    payout_score = 0
    if payout < 50:
        payout_score = 5   # Très soutenable
    elif payout < 70:
        payout_score = 2   # Soutenable
    elif payout > 100:
        payout_score = -10  # Danger de cut
    elif payout > 90:
        payout_score = -5   # Risqué

    # v2.0: EPS Surprise — beats réguliers = dividende sécurisé
    surprise_score = 0
    if eps_surp is not None:
        if eps_surp > 5:
            surprise_score = 5   # Beats réguliers
        elif eps_surp > 0:
            surprise_score = 2   # Légers beats
        elif eps_surp < -10:
            surprise_score = -5  # Misses importants = risque cut

    lombard_score = carry_score + quality_score + safety_score + ltv_score + payout_score + surprise_score
    
    # Margin call: drawdown avant que LTV effectif > 80%
    margin_call_dd = (1 - ltv / 0.80) * 100 if ltv < 0.80 else 0
    
    return {
        "dividend_yield": round(dy, 2),
        "carry_net": round(carry_net, 2),
        "leveraged_carry": round(leveraged_carry, 2),
        "ltv_estimated": round(ltv * 100),
        "lombard_score": round(lombard_score, 1),
        "margin_call_drawdown": round(margin_call_dd),
    }


# ══════════════════════════════════════════════════════════════
# MAIN RANKING FUNCTION
# ══════════════════════════════════════════════════════════════

def generate_lombard_ranking(
    config: Dict,
    lombard_rates: List[float] = None,
    min_yield: float = 2.0,
    min_quality: int = 0,
    min_market_cap: float = 2e9,
    max_positions: int = 30,
) -> Dict:
    """
    Génère le classement Lombard depuis les stocks_*.json existants.
    
    Args:
        config: CONFIG dict du pipeline (avec stocks_paths)
        lombard_rates: hypothèses de taux Lombard (défaut [2.0, 2.5, 3.0, 3.5, 4.0])
        min_yield: yield minimum pour être éligible
        min_quality: quality_score minimum
        min_market_cap: market cap minimum
        max_positions: nombre max de positions dans le classement
    
    Returns:
        Dict avec classements par taux et résumé
    """
    if lombard_rates is None:
        lombard_rates = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]
    
    logger.info("=" * 60)
    logger.info("📊 LOMBARD RANKING — Classement rendement/crédit")
    logger.info("=" * 60)
    
    # 1. Charger tous les stocks
    all_stocks = []
    stocks_paths = config.get("stocks_paths", [
        "data/stocks_us.json",
        "data/stocks_europe.json",
        "data/stocks_asia.json",
    ])
    
    for path in stocks_paths:
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            stocks = data.get("stocks", data.get("data", []))
            if isinstance(data, list):
                stocks = data
            region = data.get("region", os.path.basename(path).replace("stocks_", "").replace(".json", "").upper())
            for s in stocks:
                if not s.get("region"):
                    s["region"] = region
            all_stocks.extend(stocks)
            logger.info(f"  📁 {path}: {len(stocks)} stocks")
        except Exception as e:
            logger.warning(f"  ⚠️ Erreur chargement {path}: {e}")
    
    if not all_stocks:
        logger.warning("  ❌ Aucun stock chargé — classement vide")
        return {"error": "no_stocks", "rankings": {}}
    
    logger.info(f"  📊 Univers total: {len(all_stocks)} stocks")
    
    # 2. Filtrer les stocks éligibles
    eligible = []
    for s in all_stocks:
        dy = _safe_float(s.get("dividend_yield"))
        if dy is None or dy < min_yield:
            continue
        mcap = _safe_float(s.get("market_cap", 0))
        if mcap > 0 and mcap < min_market_cap:
            continue
        qs = _safe_float(s.get("quality_score"))
        if qs is not None and qs < min_quality:
            continue
        beta = _safe_float(s.get("beta")) or 1.0
        if beta > 1.8:
            continue
        eligible.append(s)
    
    logger.info(f"  ✅ Éligibles (yield≥{min_yield}%, mcap≥{min_market_cap/1e9:.0f}B): {len(eligible)}")
    
    # 3. Calculer les scores pour chaque hypothèse de taux
    rankings = {}
    
    for rate in lombard_rates:
        scored = []
        for s in eligible:
            lomb = compute_lombard_score(s, rate)
            if lomb is None:
                continue
            
            entry = {
                "ticker": s.get("ticker") or s.get("symbol") or s.get("Ticker", "?"),
                "name": s.get("name") or s.get("nm") or s.get("Stock", ""),
                "region": s.get("region", ""),
                "sector": s.get("sector") or s.get("Secteur", ""),
                "industry": s.get("industry", ""),
                "quality_score": _safe_float(s.get("quality_score")),
                "quality_grade": s.get("quality_grade"),
                "quality_profile": s.get("quality_profile", ""),
                "buffett_score": _safe_float(s.get("buffett_score")),
                "buffett_grade": s.get("buffett_grade"),
                "pe_ratio": _safe_float(s.get("pe_ratio")),
                "payout_ratio": _safe_float(s.get("payout_ratio_ttm")) or _safe_float(s.get("payout_ratio")),
                "eps_surprise_avg_2q": _safe_float(s.get("eps_surprise_avg_2q")),
                "beta": _safe_float(s.get("beta")),
                "volatility": _safe_float(s.get("volatility_3y")) or _safe_float(s.get("vol")),
                "market_cap": _safe_float(s.get("market_cap")),
                **lomb,
            }
            scored.append(entry)
        
        # Trier par lombard_score décroissant
        scored.sort(key=lambda x: x["lombard_score"], reverse=True)

        # Garder le top N et ajouter les rangs
        top = scored[:max_positions]
        for i, s in enumerate(top):
            s["rank"] = i + 1
        
        # Stats du classement
        if top:
            avg_yield = sum(x["dividend_yield"] for x in top) / len(top)
            avg_carry = sum(x["carry_net"] for x in top) / len(top)
            avg_ltv = sum(x["ltv_estimated"] for x in top) / len(top)
            avg_quality = sum(x["quality_score"] for x in top if x["quality_score"]) / max(1, sum(1 for x in top if x["quality_score"]))
            avg_margin_call = sum(x["margin_call_drawdown"] for x in top) / len(top)
        else:
            avg_yield = avg_carry = avg_ltv = avg_quality = avg_margin_call = 0
        
        rankings[str(rate)] = {
            "lombard_rate": rate,
            "count": len(top),
            "total_eligible": len(scored),
            "stocks": top,
            "summary": {
                "avg_yield": round(avg_yield, 2),
                "avg_carry_net": round(avg_carry, 2),
                "avg_ltv": round(avg_ltv),
                "avg_quality_score": round(avg_quality),
                "avg_margin_call_drawdown": round(avg_margin_call),
                "carry_positive_count": sum(1 for x in top if x["carry_net"] > 0),
            },
        }
        
        logger.info(f"  📈 Taux {rate}%: top {len(top)} | yield={avg_yield:.1f}% | carry={avg_carry:+.1f}% | LTV={avg_ltv:.0f}%")
    
    # 4. Construire l'output
    output = {
        "_meta": {
            "generated_at": datetime.now().isoformat(),
            "generator": "lombard_ranking.py v2.0",
            "universe_size": len(all_stocks),
            "eligible_count": len(eligible),
            "lombard_rates_tested": lombard_rates,
            "filters": {
                "min_yield": min_yield,
                "min_quality": min_quality,
                "min_market_cap": min_market_cap,
                "max_beta": 1.8,
                "max_positions": max_positions,
            },
        },
        "rankings": rankings,
    }
    
    # 5. Sauvegarder
    output_path = config.get("lombard_output_path", "data/lombard_ranking.json")
    try:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        logger.info(f"  ✅ Classement Lombard sauvegardé: {output_path}")
    except Exception as e:
        logger.error(f"  ❌ Erreur sauvegarde: {e}")
    
    # 6. Archive
    try:
        history_dir = config.get("history_dir", "data/portfolio_history")
        os.makedirs(history_dir, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        archive_path = f"{history_dir}/lombard_ranking_{ts}.json"
        with open(archive_path, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        logger.info(f"  📦 Archive: {archive_path}")
    except Exception as e:
        logger.warning(f"  ⚠️ Archive failed: {e}")
    
    return output


# ══════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════

def _safe_float(value) -> Optional[float]:
    """Parse un float de manière robuste."""
    if value is None or value == "" or value == "null" or value == "-":
        return None
    try:
        v = float(str(value).replace("%", "").replace(",", "").strip())
        return v if v == v else None  # NaN check
    except (ValueError, TypeError):
        return None


# ══════════════════════════════════════════════════════════════
# CLI (standalone)
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(name)s | %(message)s")
    
    config = {
        "stocks_paths": [
            "data/stocks_us.json",
            "data/stocks_europe.json",
        ],
        "lombard_output_path": "data/lombard_ranking.json",
        "history_dir": "data/portfolio_history",
    }
    
    result = generate_lombard_ranking(config)
    
    if result.get("rankings"):
        for rate, data in result["rankings"].items():
            print(f"\n{'='*60}")
            print(f"TAUX LOMBARD: {rate}%")
            print(f"{'='*60}")
            for i, s in enumerate(data["stocks"][:10], 1):
                print(f"  {i:2d}. {s['ticker']:6s} {s['region']:5s} yield={s['dividend_yield']:.1f}% carry={s['carry_net']:+.1f}% LTV={s['ltv_estimated']}% Q={s.get('quality_score', '-')} score={s['lombard_score']:.0f}")
