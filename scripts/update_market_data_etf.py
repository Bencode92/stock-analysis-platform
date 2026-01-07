#!/usr/bin/env python3
"""
Script de mise à jour des données de marché via Twelve Data API
Utilise des ETFs pour représenter les indices boursiers

v3 - AJOUT: Calcul 52W (52 semaines glissant)
  - Nouvelle métrique w52Change
  - Retourne null si historique < 1 an
v2 - Aligné avec update_sectors_data_etf.py:
  - Rate limiting entre appels API
  - Timezone par région
  - YTD basé sur dernier close N-1 (cohérent avec secteurs)
  - Tracking des erreurs dans metadata
"""

import os
import csv
import json
import datetime as dt
from typing import Dict, List
import logging

# Import du module partagé
from twelve_data_utils import (
    get_td_client,
    quote_one,
    baseline_ytd,
    baseline_52w,
    format_value,
    format_percent,
    parse_percentage,
    rate_limit_pause,
    determine_region_from_country,
    determine_market_region,
    TZ_BY_REGION,
    API_KEY,
    RATE_LIMIT_DELAY
)

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration chemins
CSV_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "indices_etf_mapping.csv")
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "markets.json")


def create_empty_market_data() -> Dict:
    """Crée une structure de données vide pour les marchés"""
    return {
        "indices": {
            "europe": [],
            "north-america": [],
            "latin-america": [],
            "asia": [],
            "other": []
        },
        "top_performers": {
            "daily": {
                "best": [],
                "worst": []
            },
            "ytd": {
                "best": [],
                "worst": []
            },
            "w52": {
                "best": [],
                "worst": []
            }
        },
        "meta": {
            "source": "Twelve Data",
            "timestamp": None,
            "count": 0
        }
    }


def load_etf_mapping() -> List[Dict]:
    """Charge le mapping des ETFs depuis le CSV avec nettoyage"""
    rows = []
    with open(CSV_FILE, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            # Nettoyer tous les espaces dans les clés et valeurs
            r = {k.strip(): v.strip() for k, v in r.items()}
            
            # Récupérer le ticker avec différents noms possibles
            ticker = r.get("symbol") or r.get("symbol_td") or ""
            ticker = ticker.strip().upper()
            
            if not ticker:
                logger.warning("Ticker absent, ligne ignorée : %s", r)
                continue
                
            r["symbol"] = ticker
            rows.append(r)
    
    return rows


def clean_index_data(idx: dict) -> dict:
    """Nettoie un dictionnaire d'indice en supprimant les propriétés temporaires"""
    return {k: v for k, v in idx.items() if not k.startswith('_')}


def calculate_top_performers(market_data: Dict, all_indices: List):
    """Calcule les indices avec les meilleures et pires performances"""
    logger.info("Calcul des top performers...")
    
    daily_indices = [idx for idx in all_indices if idx.get("changePercent")]
    ytd_indices = [idx for idx in all_indices if idx.get("ytdChange")]
    w52_indices = [idx for idx in all_indices if idx.get("w52_num") is not None]
    
    # Trier par variation quotidienne
    if daily_indices:
        for idx in daily_indices:
            idx["_change_value"] = parse_percentage(idx["changePercent"])
        
        sorted_daily = sorted(daily_indices, key=lambda x: x["_change_value"], reverse=True)
        best_daily = sorted_daily[:3]
        worst_daily = sorted(sorted_daily, key=lambda x: x["_change_value"])[:3]
        
        market_data["top_performers"]["daily"]["best"] = [clean_index_data(idx) for idx in best_daily]
        market_data["top_performers"]["daily"]["worst"] = [clean_index_data(idx) for idx in worst_daily]
    
    # Trier par variation YTD
    if ytd_indices:
        for idx in ytd_indices:
            idx["_ytd_value"] = parse_percentage(idx["ytdChange"])
        
        sorted_ytd = sorted(ytd_indices, key=lambda x: x["_ytd_value"], reverse=True)
        best_ytd = sorted_ytd[:3]
        worst_ytd = sorted(sorted_ytd, key=lambda x: x["_ytd_value"])[:3]
        
        market_data["top_performers"]["ytd"]["best"] = [clean_index_data(idx) for idx in best_ytd]
        market_data["top_performers"]["ytd"]["worst"] = [clean_index_data(idx) for idx in worst_ytd]
    
    # Trier par variation 52W
    if w52_indices:
        sorted_w52 = sorted(w52_indices, key=lambda x: x["w52_num"], reverse=True)
        best_w52 = sorted_w52[:3]
        worst_w52 = sorted(sorted_w52, key=lambda x: x["w52_num"])[:3]
        
        market_data["top_performers"]["w52"]["best"] = [clean_index_data(idx) for idx in best_w52]
        market_data["top_performers"]["w52"]["worst"] = [clean_index_data(idx) for idx in worst_w52]


def main():
    logger.info("🚀 Début de la mise à jour des données de marché...")
    logger.info(f"API key loaded: {bool(API_KEY)}")
    
    if not API_KEY:
        logger.error("❌ Clé API Twelve Data manquante")
        return
    
    # Vérifier que le client est initialisé
    TD = get_td_client()
    if not TD:
        logger.error("❌ Client Twelve Data non initialisé")
        return
    
    # Test rapide de l'API
    try:
        logger.info("🔍 Test de connexion à l'API...")
        test_response = TD.quote(symbol="SPY").as_json()
        if isinstance(test_response, dict) and "close" in test_response:
            logger.info("✅ API fonctionnelle")
        else:
            logger.error(f"❌ Réponse API invalide: {test_response}")
            return
    except Exception as e:
        logger.error(f"❌ Erreur de connexion API: {e}")
        return
    
    # Créer structure de données
    MARKET_DATA = create_empty_market_data()
    ALL_INDICES = []
    
    # 1. Charger le mapping des ETFs
    etf_mapping = load_etf_mapping()
    logger.info(f"📊 {len(etf_mapping)} ETFs à traiter")
    
    # 2. Traiter chaque ETF individuellement
    processed_count = 0
    error_count = 0
    ytd_fallback_count = 0
    w52_missing_count = 0
    year = dt.date.today().year
    
    for idx, etf in enumerate(etf_mapping):
        sym = etf["symbol"]
        country = etf.get("Country", "")
        
        try:
            # Rate limiting entre les appels
            if idx > 0:
                rate_limit_pause()
            
            logger.info(f"📡 Traitement {idx+1}/{len(etf_mapping)}: {sym}")
            
            # Déterminer la région pour l'API
            api_region = determine_region_from_country(country)
            
            # Récupérer les données avec timezone
            last, day_pct, last_src = quote_one(sym, api_region)
            
            # Pause avant l'appel YTD
            rate_limit_pause(0.5)
            
            # Baseline YTD (dernier close N-1)
            base_close, base_date = baseline_ytd(sym, api_region)
            
            # Tracker les fallbacks YTD
            if base_date.startswith(str(year)):
                ytd_fallback_count += 1
                logger.info(f"ℹ️ {sym}: YTD baseline début {year} (pas de clôture {year-1})")
            
            # Calculer le YTD
            ytd_pct = 100 * (last - base_close) / base_close if base_close > 0 else 0
            
            # Pause avant l'appel 52W
            rate_limit_pause(0.5)
            
            # Baseline 52W (close le plus proche de J-365)
            base_52w_close, base_52w_date = baseline_52w(sym, api_region)
            
            # Calculer le 52W (None si historique insuffisant)
            w52_pct = None
            if base_52w_close and base_52w_close > 0:
                w52_pct = 100 * (last - base_52w_close) / base_52w_close
            else:
                w52_missing_count += 1
                logger.info(f"ℹ️ {sym}: Pas de données 52W (historique < 1 an)")
            
            # Créer l'objet de données
            market_entry = {
                "country": country,
                "index_name": etf.get("name", sym),
                "symbol": sym,
                "value": format_value(last, etf.get("currency", "USD")),
                "value_num": float(last),
                "changePercent": format_percent(day_pct),
                "change_num": float(day_pct),
                "ytdChange": format_percent(ytd_pct),
                "ytd_num": float(ytd_pct),
                "ytd_ref_date": base_date,
                "w52Change": format_percent(w52_pct) if w52_pct is not None else None,
                "w52_num": float(w52_pct) if w52_pct is not None else None,
                "w52_ref_date": base_52w_date,
                "trend": "down" if day_pct < 0 else "up"
            }
            
            # Ajouter à la bonne région
            market_region = determine_market_region(country)
            MARKET_DATA["indices"][market_region].append(market_entry)
            ALL_INDICES.append(market_entry)
            processed_count += 1
            
            w52_str = f"52W: {w52_pct:+.2f}%" if w52_pct is not None else "52W: N/A"
            logger.info(f"✅ {sym}: {last} ({day_pct:+.2f}%) YTD: {ytd_pct:+.2f}% {w52_str}")
            
        except Exception as e:
            error_count += 1
            logger.warning(f"⚠️  Pas de données pour {sym} - {e}")
            
            # Tracking des erreurs dans metadata
            if "errors" not in MARKET_DATA["meta"]:
                MARKET_DATA["meta"]["errors"] = []
            
            MARKET_DATA["meta"]["errors"].append({
                "symbol": sym,
                "name": etf.get("name", "N/A"),
                "error": str(e),
                "timestamp": dt.datetime.utcnow().isoformat()
            })
            continue
    
    # 3. Log résumé
    logger.info(f"\n📊 Résumé du traitement:")
    logger.info(f"  - ETFs traités avec succès: {processed_count}")
    logger.info(f"  - Erreurs: {error_count}")
    if ytd_fallback_count > 0:
        logger.info(f"  - ℹ️ Baselines YTD début {year}: {ytd_fallback_count}")
    if w52_missing_count > 0:
        logger.info(f"  - ℹ️ ETFs sans données 52W (historique < 1 an): {w52_missing_count}")
    
    for region, indices in MARKET_DATA["indices"].items():
        if indices:
            logger.info(f"  - {region}: {len(indices)} indices")
    
    # 4. Calculer les top performers
    if processed_count > 0:
        calculate_top_performers(MARKET_DATA, ALL_INDICES)
    else:
        logger.warning("⚠️  Aucune donnée pour calculer les top performers")
    
    # 5. Mettre à jour les métadonnées (aligné avec sectors)
    MARKET_DATA["meta"]["timestamp"] = dt.datetime.utcnow().isoformat() + "Z"
    MARKET_DATA["meta"]["count"] = processed_count
    MARKET_DATA["meta"]["total_etfs"] = len(etf_mapping)
    MARKET_DATA["meta"]["errors_count"] = error_count
    MARKET_DATA["meta"]["ytd_calculation"] = {
        "method": "price_last_close_prev_year_to_last_close_with_fallback",
        "baseline_year": year - 1,
        "timezone_mapping": TZ_BY_REGION,
        "outputsize": 250,
        "note": f"YTD basé sur le dernier close de {year-1} ou fallback 1er jour {year}"
    }
    MARKET_DATA["meta"]["w52_calculation"] = {
        "method": "price_close_nearest_to_today_minus_365d",
        "lookback_days": 365,
        "outputsize": 420,
        "max_gap_days": 10,
        "note": "Retourne null si historique < 1 an"
    }
    if ytd_fallback_count > 0:
        MARKET_DATA["meta"]["ytd_fallback_count"] = ytd_fallback_count
    if w52_missing_count > 0:
        MARKET_DATA["meta"]["w52_missing_count"] = w52_missing_count
    
    # 6. Sauvegarder le fichier JSON
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(MARKET_DATA, f, ensure_ascii=False, indent=2)
    
    logger.info(f"\n✅ Mise à jour terminée")
    logger.info(f"📄 Fichier sauvegardé : {OUTPUT_FILE}")
    logger.info(f"📊 {processed_count}/{len(etf_mapping)} indices traités avec succès")
    
    # Afficher quelques erreurs si présentes
    if error_count > 0 and "errors" in MARKET_DATA["meta"]:
        logger.info(f"\n⚠️  Détail des {min(5, error_count)} premières erreurs:")
        for err in MARKET_DATA["meta"]["errors"][:5]:
            logger.info(f"  - {err['symbol']}: {err['error']}")


if __name__ == "__main__":
    main()
