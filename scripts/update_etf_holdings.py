#!/usr/bin/env python3
"""
Script hebdomadaire pour récupérer les holdings des ETFs sectoriels
Génère un fichier consolidé data/etf_holdings.json
À exécuter 1x/semaine (dimanche) pour économiser les crédits API
"""

import os
import json
import datetime as dt
import time
import re
import logging
import requests
from typing import Dict, List, Optional

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
API_KEY = os.getenv("TWELVE_DATA_API")
SECTORS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "sectors.json")
HOLDINGS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "etf_holdings.json")

# Paramètres holdings
HOLDINGS_MAX = int(os.getenv("HOLDINGS_MAX", "10"))  # Top 10 holdings par ETF
HOLDINGS_STALE_DAYS = int(os.getenv("HOLDINGS_STALE_DAYS", "7"))  # Rafraîchir si > 7 jours
HOLDINGS_SLEEP = float(os.getenv("HOLDINGS_SLEEP", "0.5"))  # Pause entre appels API
API_BASE = "https://api.twelvedata.com"

def _num(x):
    """Convertit un pourcentage en nombre 0..1"""
    try:
        if x is None:
            return None
        s = str(x).replace('%', '').replace(',', '.')
        v = float(s)
        # Si > 1, on considère que c'est un pourcentage (ex: "12.5" = 12.5%)
        return v / 100.0 if v > 1.00001 else v
    except:
        return None

def is_stale(filepath: str) -> bool:
    """Vérifie si un fichier est périmé (> HOLDINGS_STALE_DAYS jours)"""
    if not os.path.exists(filepath):
        return True
    
    mtime = dt.datetime.fromtimestamp(os.path.getmtime(filepath), tz=dt.timezone.utc)
    age_days = (dt.datetime.now(dt.timezone.utc) - mtime).days
    
    logger.info(f"Fichier {os.path.basename(filepath)} a {age_days} jours (limite: {HOLDINGS_STALE_DAYS})")
    return age_days >= HOLDINGS_STALE_DAYS

def fetch_etf_holdings(symbol: str, apikey: str, maxn: int = 10) -> Optional[Dict]:
    """
    Récupère les holdings d'un ETF via l'API Twelve Data
    Endpoint: /etfs/world/composition (200 crédits)
    """
    try:
        url = f"{API_BASE}/etfs/world/composition"
        params = {
            "symbol": symbol,
            "apikey": apikey,
            "dp": 5  # decimal places
        }
        
        logger.info(f"📡 Récupération holdings pour {symbol}...")
        r = requests.get(url, params=params, timeout=20)
        j = r.json()
        
        # Vérifier les erreurs
        if j.get("status") == "error":
            error_msg = j.get("message", "composition error")
            logger.error(f"❌ Erreur API pour {symbol}: {error_msg}")
            return None
        
        # Extraire les données de composition
        etf_data = j.get("etf", {})
        comp = etf_data.get("composition", {})
        
        # Date de mise à jour
        as_of = comp.get("as_of") or j.get("meta", {}).get("as_of") or dt.date.today().isoformat()
        
        # Récupérer les holdings (plusieurs formats possibles)
        holdings_raw = (
            comp.get("top_holdings") or
            comp.get("holdings") or
            (comp.get("equities", {}).get("holdings")) or
            []
        )
        
        # Parser les holdings
        holdings = []
        for h in holdings_raw:
            holding = {
                "symbol": h.get("symbol") or h.get("ticker") or "",
                "name": h.get("name") or h.get("company") or h.get("issuer") or "",
                "weight": _num(h.get("weight") or h.get("allocation") or h.get("pct")),
                "country": h.get("country") or h.get("country_of_risk"),
                "sector": h.get("sector"),
                "shares": h.get("shares"),
                "market_value": h.get("market_value")
            }
            
            # Garder seulement si on a un poids valide
            if holding["weight"] is not None:
                holdings.append(holding)
        
        # Trier par poids décroissant et garder le top N
        holdings.sort(key=lambda x: x["weight"], reverse=True)
        holdings = holdings[:maxn]
        
        # Statistiques supplémentaires
        total_weight = sum(h["weight"] for h in holdings if h["weight"])
        
        result = {
            "symbol": symbol,
            "name": etf_data.get("name"),
            "as_of": as_of,
            "holdings_count": len(holdings),
            "top_weight": round(total_weight * 100, 2),  # % du top N
            "holdings": holdings,
            "updated_at": dt.datetime.utcnow().isoformat() + "Z"
        }
        
        logger.info(f"✅ {symbol}: {len(holdings)} holdings récupérés (top weight: {result['top_weight']}%)")
        return result
        
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Erreur réseau pour {symbol}: {e}")
        return None
    except Exception as e:
        logger.error(f"❌ Erreur inattendue pour {symbol}: {e}")
        return None

def load_existing_holdings() -> Dict:
    """Charge le fichier holdings existant s'il existe"""
    if os.path.exists(HOLDINGS_FILE):
        try:
            with open(HOLDINGS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                logger.info(f"📂 Fichier holdings existant chargé: {len(data.get('etfs', {}))} ETFs")
                return data
        except Exception as e:
            logger.error(f"Erreur lecture fichier holdings: {e}")
    
    return {
        "meta": {
            "generated_at": None,
            "etf_count": 0,
            "total_holdings": 0,
            "api_credits_used": 0
        },
        "etfs": {}
    }

def extract_etf_symbols() -> List[str]:
    """Extrait la liste des symboles ETF depuis sectors.json"""
    symbols = set()
    
    if not os.path.exists(SECTORS_FILE):
        logger.error(f"❌ Fichier sectors.json introuvable: {SECTORS_FILE}")
        return []
    
    try:
        with open(SECTORS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        # Parcourir toutes les catégories de secteurs
        for category, sectors in data.get("sectors", {}).items():
            for sector in sectors:
                if sector.get("symbol"):
                    symbols.add(sector["symbol"])
        
        logger.info(f"📋 {len(symbols)} ETFs trouvés dans sectors.json")
        return sorted(list(symbols))
        
    except Exception as e:
        logger.error(f"Erreur lecture sectors.json: {e}")
        return []

def main():
    logger.info("=" * 60)
    logger.info("🚀 Début de la mise à jour hebdomadaire des holdings ETF")
    logger.info("=" * 60)
    
    if not API_KEY:
        logger.error("❌ Clé API Twelve Data manquante (TWELVE_DATA_API)")
        return
    
    # Vérifier si mise à jour nécessaire
    if not is_stale(HOLDINGS_FILE):
        logger.info(f"ℹ️ Fichier holdings encore valide, pas de mise à jour nécessaire")
        return
    
    # Charger les données existantes (pour mise à jour incrémentale si besoin)
    holdings_data = load_existing_holdings()
    
    # Extraire les symboles depuis sectors.json
    symbols = extract_etf_symbols()
    
    if not symbols:
        logger.error("❌ Aucun symbole ETF trouvé")
        return
    
    logger.info(f"📊 Traitement de {len(symbols)} ETFs...")
    logger.info(f"⚙️ Paramètres: max={HOLDINGS_MAX} holdings/ETF, pause={HOLDINGS_SLEEP}s")
    
    # Traiter chaque ETF
    processed = 0
    errors = 0
    api_credits = 0
    
    for idx, symbol in enumerate(symbols, 1):
        logger.info(f"\n[{idx}/{len(symbols)}] Traitement {symbol}...")
        
        try:
            # Récupérer les holdings
            etf_data = fetch_etf_holdings(symbol, API_KEY, HOLDINGS_MAX)
            
            if etf_data:
                holdings_data["etfs"][symbol] = etf_data
                processed += 1
                api_credits += 200  # Chaque appel coûte ~200 crédits
            else:
                errors += 1
                # Garder les anciennes données si elles existent
                if symbol in holdings_data["etfs"]:
                    logger.info(f"↻ Conservation des données précédentes pour {symbol}")
            
            # Pause entre les appels (respect rate limit)
            if idx < len(symbols):
                time.sleep(HOLDINGS_SLEEP)
                
        except KeyboardInterrupt:
            logger.warning("\n⚠️ Interruption utilisateur")
            break
        except Exception as e:
            logger.error(f"❌ Erreur pour {symbol}: {e}")
            errors += 1
    
    # Mettre à jour les métadonnées
    total_holdings = sum(
        len(etf.get("holdings", [])) 
        for etf in holdings_data["etfs"].values()
    )
    
    holdings_data["meta"] = {
        "generated_at": dt.datetime.utcnow().isoformat() + "Z",
        "etf_count": len(holdings_data["etfs"]),
        "total_holdings": total_holdings,
        "api_credits_used": api_credits,
        "max_holdings_per_etf": HOLDINGS_MAX,
        "stale_days": HOLDINGS_STALE_DAYS,
        "data_source": "Twelve Data ETF Composition API"
    }
    
    # Sauvegarder le fichier
    os.makedirs(os.path.dirname(HOLDINGS_FILE), exist_ok=True)
    with open(HOLDINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(holdings_data, f, ensure_ascii=False, indent=2)
    
    # Résumé
    logger.info("\n" + "=" * 60)
    logger.info("✅ Mise à jour terminée!")
    logger.info(f"📄 Fichier sauvegardé: {HOLDINGS_FILE}")
    logger.info(f"📊 Statistiques:")
    logger.info(f"   - ETFs traités: {processed}/{len(symbols)}")
    logger.info(f"   - Erreurs: {errors}")
    logger.info(f"   - Holdings totaux: {total_holdings}")
    logger.info(f"   - Crédits API utilisés: ~{api_credits}")
    logger.info(f"   - Taille fichier: {os.path.getsize(HOLDINGS_FILE) / 1024:.1f} KB")
    logger.info("=" * 60)

if __name__ == "__main__":
    main()
