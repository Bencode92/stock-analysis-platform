#!/usr/bin/env python3
"""
Script hebdomadaire pour récupérer les holdings des ETFs sectoriels
Génère un fichier consolidé data/etf_holdings.json
À exécuter 1x/semaine (dimanche) pour économiser les crédits API
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
FORCE_UPDATE = os.getenv("FORCE_UPDATE", "false").lower() == "true"  # Force la mise à jour
API_BASE = "https://api.twelvedata.com"

# Rate limiting par crédits
TD_CREDIT_LIMIT = int(os.getenv("TD_CREDIT_LIMIT", "2584"))
TD_COST_COMPOSITION = int(os.getenv("TD_COST_COMPOSITION", "200"))
TD_BUFFER_CREDITS = int(os.getenv("TD_BUFFER_CREDITS", "50"))  # marge de sécurité

class CreditLimiter:
    """Gestionnaire de limite de crédits API par minute"""
    def __init__(self, limit_per_min):
        self.limit = limit_per_min
        self.window_start = time.monotonic()
        self.used = 0

    def _reset_if_needed(self):
        now = time.monotonic()
        if now - self.window_start >= 60:
            self.window_start = now
            self.used = 0

    def pay(self, cost):
        self._reset_if_needed()
        if self.used + cost > self.limit - TD_BUFFER_CREDITS:
            # attendre jusqu'à la prochaine minute + petite marge
            sleep_s = 60 - (time.monotonic() - self.window_start) + 0.25
            sleep_s = max(sleep_s, 0.25)
            logger.info(f"⏳ Crédit {self.used}/{self.limit} – pause {sleep_s:.1f}s pour éviter le plafond")
            time.sleep(sleep_s)
            self.window_start = time.monotonic()
            self.used = 0
        self.used += cost

credit_limiter = CreditLimiter(TD_CREDIT_LIMIT)

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
        # Payer les crédits avant l'appel
        credit_limiter.pay(TD_COST_COMPOSITION)
        
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
            wait = max(0.8, 60 - (time.monotonic() - credit_limiter.window_start) + 0.25)
            logger.warning(f"⚠️ Crédit minute épuisé. Attente {wait:.1f}s puis retry…")
            time.sleep(wait)
            credit_limiter.window_start = time.monotonic()
            credit_limiter.used = 0
            credit_limiter.pay(TD_COST_COMPOSITION)
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
    
    # VÉRIFICATIONS CRITIQUES - Échouer proprement si prérequis manquants
    if not API_KEY:
        logger.error("❌ ERREUR FATALE: Clé API Twelve Data manquante (TWELVE_DATA_API)")
        logger.error("   Définissez la variable d'environnement: export TWELVE_DATA_API=votre_clé")
        sys.exit(2)  # Code d'erreur spécifique pour API key manquante
    
    if not os.path.exists(SECTORS_FILE):
        logger.error(f"❌ ERREUR FATALE: Fichier sectors.json introuvable: {SECTORS_FILE}")
        logger.error("   Lancez d'abord la mise à jour des secteurs: python scripts/update_sectors_data_etf.py")
        sys.exit(3)  # Code d'erreur spécifique pour sectors.json manquant
    
    # Vérifier si mise à jour nécessaire (avec respect de FORCE_UPDATE)
    if FORCE_UPDATE:
        logger.info("🔧 FORCE_UPDATE=true → on ignore la fenêtre de fraîcheur")
        if os.path.exists(HOLDINGS_FILE):
            logger.info(f"   Suppression du fichier existant pour forcer la régénération...")
            os.remove(HOLDINGS_FILE)
    elif not is_stale(HOLDINGS_FILE):
        logger.info("ℹ️ Fichier holdings encore valide, pas de mise à jour nécessaire (FORCE_UPDATE=false)")
        logger.info(f"   Pour forcer: export FORCE_UPDATE=true ou supprimez {HOLDINGS_FILE}")
        return
    
    # Charger les données existantes (pour mise à jour incrémentale si besoin)
    holdings_data = load_existing_holdings()
    
    # Extraire les symboles depuis sectors.json
    symbols = extract_etf_symbols()
    
    if not symbols:
        logger.error("❌ ERREUR: Aucun symbole ETF trouvé dans sectors.json")
        logger.error("   Le fichier existe mais semble vide ou mal formaté")
        sys.exit(4)  # Code d'erreur spécifique pour sectors.json vide
    
    logger.info(f"📊 Traitement de {len(symbols)} ETFs...")
    logger.info(f"⚙️ Paramètres:")
    logger.info(f"   - Max holdings/ETF: {HOLDINGS_MAX}")
    logger.info(f"   - Limite crédits/min: {TD_CREDIT_LIMIT}")
    logger.info(f"   - Coût par appel: {TD_COST_COMPOSITION}")
    logger.info(f"   - Buffer sécurité: {TD_BUFFER_CREDITS}")
    
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
                api_credits += TD_COST_COMPOSITION
                
                # Compter les ETFs sans couverture
                if not etf_data.get("provider_coverage", True):
                    no_coverage += 1
            else:
                errors += 1
                # Garder les anciennes données si elles existent
                if symbol in holdings_data["etfs"]:
                    logger.info(f"↻ Conservation des données précédentes pour {symbol}")
            
            # Mini pause avec jitter entre les appels
            if idx < len(symbols):
                time.sleep(random.uniform(0.05, 0.15))
                
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
        "credit_limit": TD_CREDIT_LIMIT,
        "no_coverage_count": no_coverage,
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
    logger.info(f"   - Sans couverture: {no_coverage}")
    logger.info(f"   - Holdings totaux: {total_holdings}")
    logger.info(f"   - Crédits API utilisés: ~{api_credits}")
    logger.info(f"   - Taille fichier: {os.path.getsize(HOLDINGS_FILE) / 1024:.1f} KB")
    logger.info(f"   - Force update: {FORCE_UPDATE}")
    logger.info("=" * 60)

if __name__ == "__main__":
    main()
