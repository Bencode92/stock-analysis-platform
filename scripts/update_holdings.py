#!/usr/bin/env python3
"""
Script hebdomadaire pour récupérer les holdings des ETFs
Traite BOTH secteurs (sectors.json) ET marchés (markets.json)
Génère un fichier consolidé data/etf_holdings.json
À exécuter 1x/semaine (dimanche) pour économiser les crédits API

v2 - AJOUT: Support markets.json en plus de sectors.json
"""

import os
import sys
import json
import datetime as dt
import time
import re
import logging
import requests
import random
from typing import Dict, List, Optional, Tuple

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
API_KEY = os.getenv("TWELVE_DATA_API")
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECTORS_FILE = os.path.join(BASE_DIR, "data", "sectors.json")
MARKETS_FILE = os.path.join(BASE_DIR, "data", "markets.json")
HOLDINGS_FILE = os.path.join(BASE_DIR, "data", "etf_holdings.json")

# Paramètres holdings
HOLDINGS_MAX = int(os.getenv("HOLDINGS_MAX", "10"))  # Top 10 holdings par ETF
HOLDINGS_STALE_DAYS = int(os.getenv("HOLDINGS_STALE_DAYS", "7"))  # Rafraîchir si > 7 jours
HOLDINGS_SLEEP = float(os.getenv("HOLDINGS_SLEEP", "0.2"))  # Pause entre appels API
FORCE_UPDATE = os.getenv("FORCE_UPDATE", "false").lower() == "true"  # Force la mise à jour
API_BASE = "https://api.twelvedata.com"

# Rate limiting par crédits
RATE_LIMIT = int(os.getenv("RATE_LIMIT_CREDITS_PER_MIN", "2584"))
COST = int(os.getenv("COST_COMPOSITION", "200"))
HEADROOM = int(os.getenv("RATE_LIMIT_HEADROOM", "100"))  # marge de sécurité

class CreditLimiter:
    """Rate limiter simple basé sur les crédits"""
    def __init__(self, limit, headroom=0):
        self.limit = max(1, limit - headroom)
        self.used = 0
        self.start = time.monotonic()

    def pay(self, cost):
        now = time.monotonic()
        elapsed = now - self.start
        if elapsed >= 60:
            self.used = 0
            self.start = now
        if self.used + cost > self.limit:
            sleep_s = max(0.05, 60 - elapsed + 0.05)
            logger.info(f"⏳ Crédit {self.used}/{self.limit} – pause {sleep_s:.1f}s pour éviter le plafond")
            time.sleep(sleep_s)
            self.used = 0
            self.start = time.monotonic()
        self.used += cost

limiter = CreditLimiter(RATE_LIMIT, HEADROOM)

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

def resolve_symbol(symbol: str, apikey: str) -> str:
    """
    Résout un symbole pour les ETFs européens qui nécessitent parfois TICKER:MIC
    """
    try:
        r = requests.get(
            f"{API_BASE}/symbol_search",
            params={"symbol": symbol, "apikey": apikey},
            timeout=15
        ).json()
        
        if r.get("data") and len(r["data"]) > 0:
            best = r["data"][0]
            mic = best.get("mic_code", "")
            
            # Pour les marchés US, on garde le symbole simple
            if mic in {"ARCX", "XNAS", "XNYS", "BATS", "XASE"}:
                return best["symbol"]
            # Pour les autres (européens), on utilise SYMBOL:MIC
            elif mic:
                return f"{best['symbol']}:{mic}"
                
    except Exception as e:
        logger.debug(f"Impossible de résoudre {symbol}: {e}")
    
    return symbol

def fetch_etf_holdings(symbol: str, apikey: str, maxn: int = 10) -> Optional[Dict]:
    """
    Récupère les holdings d'un ETF via l'API Twelve Data
    Endpoint: /etfs/world/composition (200 crédits)
    """
    try:
        # Payer les crédits AVANT l'appel
        limiter.pay(COST)
        
        url = f"{API_BASE}/etfs/world/composition"
        params = {
            "symbol": symbol,
            "apikey": apikey,
            "dp": 5  # decimal places
        }
        
        # Petit jitter pour éviter l'alignement pile
        time.sleep(random.uniform(0.05, 0.15))
        
        logger.info(f"📡 Récupération holdings pour {symbol}...")
        r = requests.get(url, params=params, timeout=20)
        j = r.json()
        
        # Limite atteinte côté serveur → attendre et RETRY 1 fois
        if isinstance(j, dict) and j.get("status") == "error" and "run out of API credits" in j.get("message", "").lower():
            wait = max(0.8, 60 - (time.monotonic() - limiter.start) + 0.25)
            logger.warning(f"⚠️ Crédit minute épuisé. Attente {wait:.1f}s puis retry…")
            time.sleep(wait)
            limiter.used = 0
            limiter.start = time.monotonic()
            limiter.pay(COST)
            r = requests.get(url, params=params, timeout=20)
            j = r.json()
        
        # Vérifier les erreurs et retry avec symbole résolu si nécessaire
        if j.get("status") == "error":
            error_msg = j.get("message", "composition error")
            
            # Si symbole non supporté, essayer de le résoudre
            if "not supported" in error_msg.lower() or "symbol" in error_msg.lower():
                logger.info(f"   Résolution du symbole {symbol}...")
                resolved = resolve_symbol(symbol, apikey)
                
                if resolved != symbol:
                    logger.info(f"   Retry avec {resolved}...")
                    params["symbol"] = resolved
                    time.sleep(random.uniform(0.05, 0.15))
                    r = requests.get(url, params=params, timeout=20)
                    j = r.json()
                    
                    if j.get("status") == "error":
                        logger.error(f"❌ Erreur API pour {symbol}/{resolved}: {j.get('message', 'error')}")
                        return None
                else:
                    logger.error(f"❌ Erreur API pour {symbol}: {error_msg}")
                    return None
            else:
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
            "provider_coverage": len(holdings_raw) > 0,  # false si l'ETF n'est pas couvert
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

def extract_symbols_from_sectors() -> Tuple[List[str], int]:
    """Extrait la liste des symboles ETF depuis sectors.json"""
    symbols = set()
    
    if not os.path.exists(SECTORS_FILE):
        logger.warning(f"⚠️ Fichier sectors.json introuvable: {SECTORS_FILE}")
        return [], 0
    
    try:
        with open(SECTORS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        # Parcourir toutes les catégories de secteurs
        for category, sectors in data.get("sectors", {}).items():
            for sector in sectors:
                if sector.get("symbol"):
                    symbols.add(sector["symbol"])
        
        logger.info(f"📋 {len(symbols)} ETFs trouvés dans sectors.json")
        return list(symbols), len(symbols)
        
    except Exception as e:
        logger.error(f"Erreur lecture sectors.json: {e}")
        return [], 0

def extract_symbols_from_markets() -> Tuple[List[str], int]:
    """Extrait la liste des symboles ETF depuis markets.json"""
    symbols = set()
    
    if not os.path.exists(MARKETS_FILE):
        logger.warning(f"⚠️ Fichier markets.json introuvable: {MARKETS_FILE}")
        return [], 0
    
    try:
        with open(MARKETS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        # Parcourir toutes les régions d'indices
        for region, indices in data.get("indices", {}).items():
            for index in indices:
                if index.get("symbol"):
                    symbols.add(index["symbol"])
        
        logger.info(f"📋 {len(symbols)} ETFs trouvés dans markets.json")
        return list(symbols), len(symbols)
        
    except Exception as e:
        logger.error(f"Erreur lecture markets.json: {e}")
        return [], 0

def extract_all_etf_symbols() -> Tuple[List[str], Dict[str, int]]:
    """
    Extrait et fusionne les symboles ETF depuis BOTH sectors.json ET markets.json
    Retourne la liste unique des symboles et les stats par source
    """
    sectors_symbols, sectors_count = extract_symbols_from_sectors()
    markets_symbols, markets_count = extract_symbols_from_markets()
    
    # Fusionner sans doublons
    all_symbols = set(sectors_symbols) | set(markets_symbols)
    
    # Identifier les symboles communs
    common = set(sectors_symbols) & set(markets_symbols)
    if common:
        logger.info(f"   ↳ {len(common)} symboles communs aux deux sources: {', '.join(sorted(common)[:5])}...")
    
    stats = {
        "sectors_count": sectors_count,
        "markets_count": markets_count,
        "common_count": len(common),
        "total_unique": len(all_symbols)
    }
    
    logger.info(f"📊 Total: {len(all_symbols)} ETFs uniques (secteurs: {sectors_count}, marchés: {markets_count}, communs: {len(common)})")
    
    return sorted(list(all_symbols)), stats

def main():
    logger.info("=" * 60)
    logger.info("🚀 Début de la mise à jour hebdomadaire des holdings ETF")
    logger.info("   Sources: sectors.json + markets.json")
    logger.info("=" * 60)
    
    # VÉRIFICATIONS CRITIQUES - Échouer proprement si prérequis manquants
    if not API_KEY:
        logger.error("❌ ERREUR FATALE: Clé API Twelve Data manquante (TWELVE_DATA_API)")
        logger.error("   Définissez la variable d'environnement: export TWELVE_DATA_API=votre_clé")
        sys.exit(2)  # Code d'erreur spécifique pour API key manquante
    
    # Vérifier qu'au moins un fichier source existe
    sectors_exists = os.path.exists(SECTORS_FILE)
    markets_exists = os.path.exists(MARKETS_FILE)
    
    if not sectors_exists and not markets_exists:
        logger.error(f"❌ ERREUR FATALE: Aucun fichier source trouvé!")
        logger.error(f"   - sectors.json: {'✓' if sectors_exists else '✗'}")
        logger.error(f"   - markets.json: {'✓' if markets_exists else '✗'}")
        sys.exit(3)
    
    logger.info(f"📁 Sources disponibles:")
    logger.info(f"   - sectors.json: {'✓' if sectors_exists else '✗ (ignoré)'}")
    logger.info(f"   - markets.json: {'✓' if markets_exists else '✗ (ignoré)'}")
    
    # Vérifier si mise à jour nécessaire (avec respect de FORCE_UPDATE)
    if not FORCE_UPDATE and not is_stale(HOLDINGS_FILE):
        logger.info("ℹ️ Fichier holdings encore frais, pas de mise à jour.")
        logger.info(f"   Pour forcer: export FORCE_UPDATE=true ou supprimez {HOLDINGS_FILE}")
        return
    else:
        if FORCE_UPDATE:
            logger.info("🔧 FORCE_UPDATE=true → on ignore la fenêtre de fraîcheur")
            if os.path.exists(HOLDINGS_FILE):
                logger.info(f"   Suppression du fichier existant pour forcer la régénération...")
                os.remove(HOLDINGS_FILE)
    
    # Charger les données existantes (pour mise à jour incrémentale si besoin)
    holdings_data = load_existing_holdings()
    
    # Extraire les symboles depuis BOTH sectors.json ET markets.json
    symbols, source_stats = extract_all_etf_symbols()
    
    if not symbols:
        logger.error("❌ ERREUR: Aucun symbole ETF trouvé dans aucune source")
        sys.exit(4)
    
    logger.info(f"📊 Traitement de {len(symbols)} ETFs uniques...")
    logger.info(f"⚙️ Paramètres:")
    logger.info(f"   - Max holdings/ETF: {HOLDINGS_MAX}")
    logger.info(f"   - Limite crédits/min: {RATE_LIMIT - HEADROOM} (avec marge {HEADROOM})")
    logger.info(f"   - Coût par appel: {COST}")
    logger.info(f"   - Max appels/min: {(RATE_LIMIT - HEADROOM) // COST}")
    
    # Traiter chaque ETF
    processed = 0
    errors = 0
    api_credits = 0
    no_coverage = 0
    
    for idx, symbol in enumerate(symbols, 1):
        logger.info(f"\n[{idx}/{len(symbols)}] Traitement {symbol}...")
        
        try:
            # Récupérer les holdings
            etf_data = fetch_etf_holdings(symbol, API_KEY, HOLDINGS_MAX)
            
            if etf_data:
                holdings_data["etfs"][symbol] = etf_data
                processed += 1
                api_credits += COST
                
                # Compter les ETFs sans couverture
                if not etf_data.get("provider_coverage", True):
                    no_coverage += 1
            else:
                errors += 1
                # Garder les anciennes données si elles existent
                if symbol in holdings_data["etfs"]:
                    logger.info(f"↻ Conservation des données précédentes pour {symbol}")
            
            # Mini pause avec jitter entre les appels (optionnel car le limiter gère)
            if idx < len(symbols):
                time.sleep(HOLDINGS_SLEEP)
                
        except KeyboardInterrupt:
            logger.warning("\n⚠️ Interruption utilisateur")
            break
        except Exception as e:
            logger.error(f"❌ Erreur pour {symbol}: {e}")
            errors += 1
    
    # Vérifier qu'on a au moins quelques données
    if processed == 0 and len(holdings_data["etfs"]) == 0:
        logger.error("❌ ERREUR: Aucun holding n'a pu être récupéré")
        logger.error("   Vérifiez votre clé API et votre connexion internet")
        sys.exit(5)  # Code d'erreur spécifique pour aucune donnée récupérée
    
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
        "force_update": FORCE_UPDATE,
        "credit_limit": RATE_LIMIT,
        "no_coverage_count": no_coverage,
        "data_source": "Twelve Data ETF Composition API",
        "source_files": {
            "sectors_json": source_stats["sectors_count"],
            "markets_json": source_stats["markets_count"],
            "common": source_stats["common_count"],
            "total_unique": source_stats["total_unique"]
        }
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
    logger.info(f"   - Sans couverture: {no_coverage}")
    logger.info(f"   - Holdings totaux: {total_holdings}")
    logger.info(f"   - Crédits API utilisés: ~{api_credits}")
    logger.info(f"   - Taille fichier: {os.path.getsize(HOLDINGS_FILE) / 1024:.1f} KB")
    logger.info(f"   - Sources:")
    logger.info(f"     · sectors.json: {source_stats['sectors_count']} ETFs")
    logger.info(f"     · markets.json: {source_stats['markets_count']} ETFs")
    logger.info(f"     · Communs: {source_stats['common_count']}")
    logger.info(f"   - Force update: {FORCE_UPDATE}")
    logger.info("=" * 60)

if __name__ == "__main__":
    main()
