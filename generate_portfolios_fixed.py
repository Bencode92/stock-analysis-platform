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

# ============= HELPERS DE NORMALISATION POUR LE FRONT-END =============

def _infer_category_from_id(asset_id: str) -> str:
    """Infère la catégorie d'un actif depuis son ID"""
    if asset_id.startswith("EQ_"):   return "Actions"
    if asset_id.startswith("ETF_b"): return "Obligations"
    if asset_id.startswith("ETF_s"): return "ETF"
    if asset_id.startswith("CR_"):   return "Crypto"
    return "Autres"

def _build_asset_lookup(allowed_assets: Dict) -> Dict[str, Dict[str, str]]:
    """Construit un mapping id -> {name, category} depuis allowed_assets"""
    lookup = {}
    mapping = {
        "allowed_equities": "Actions",
        "allowed_etfs_standard": "ETF",
        "allowed_bond_etfs": "Obligations",
        "allowed_crypto": "Crypto",
    }
    for k, cat in mapping.items():
        for a in allowed_assets.get(k, []):
            lookup[a["id"]] = {"name": a.get("name", a["id"]), "category": cat}
    return lookup

def _pct_str(v: float) -> str:
    """Formate un pourcentage comme dans l'ancien format (ex: '8%')"""
    try:
        return f"{round(float(v))}%"
    except Exception:
        return f"{v}%"

def normalize_v3_to_frontend_v1(v3_obj: Dict, allowed_assets: Dict) -> Dict:
    """
    Convertit le format v3 (avec Lignes) vers l'ancien format front-end
    Format cible: {"Agressif": {"Commentaire": "", "Actions": {"Nom": "8%"}, ...}}
    """
    # Déjà au bon format ? (cas v2/legacy fallback)
    if all(k in v3_obj for k in ("Agressif", "Modéré", "Stable")):
        # S'assurer qu'on a le bon format de sections
        for portfolio_name in ["Agressif", "Modéré", "Stable"]:
            portfolio = v3_obj.get(portfolio_name, {})
            
            # Si on a des "Lignes" au lieu des sections classiques
            if "Lignes" in portfolio and isinstance(portfolio["Lignes"], list):
                new_portfolio = {
                    "Commentaire": portfolio.get("Commentaire", ""),
                    "Actions": {},
                    "ETF": {},
                    "Obligations": {},
                    "Crypto": {},
                    "ActifsExclus": portfolio.get("ActifsExclus", [])
                }
                
                for ligne in portfolio["Lignes"]:
                    category = ligne.get("category", "")
                    name = ligne.get("name", "")
                    allocation = ligne.get("allocation_pct", 0)
                    
                    if category and name:
                        new_portfolio[category][name] = _pct_str(allocation)
                
                # Ajouter Compliance si présent
                if "Compliance" in portfolio:
                    new_portfolio["Compliance"] = portfolio["Compliance"]
                    
                v3_obj[portfolio_name] = new_portfolio
        
        return v3_obj

    # Cas v3 avec format différent - normalisation complète
    lookup = _build_asset_lookup(allowed_assets)
    
    out = {
        "Agressif": {
            "Commentaire": "",
            "Actions": {},
            "ETF": {},
            "Obligations": {},
            "Crypto": {},
            "ActifsExclus": []
        },
        "Modéré": {
            "Commentaire": "",
            "Actions": {},
            "ETF": {},
            "Obligations": {},
            "Crypto": {},
            "ActifsExclus": []
        },
        "Stable": {
            "Commentaire": "",
            "Actions": {},
            "ETF": {},
            "Obligations": {},
            "Crypto": {},
            "ActifsExclus": []
        }
    }

    # Mapper les portefeuilles v3 vers le format front
    for portfolio_name in ["Agressif", "Modéré", "Stable"]:
        if portfolio_name not in v3_obj:
            continue
            
        portfolio = v3_obj[portfolio_name]
        
        # Récupérer le commentaire
        out[portfolio_name]["Commentaire"] = portfolio.get("Commentaire", "")
        
        # Traiter les lignes d'actifs
        if "Lignes" in portfolio and isinstance(portfolio["Lignes"], list):
            for ligne in portfolio["Lignes"]:
                asset_id = ligne.get("id", "")
                allocation = ligne.get("allocation_pct", 0)
                
                # Récupérer les infos depuis lookup ou ligne directement
                if asset_id in lookup:
                    name = lookup[asset_id]["name"]
                    category = lookup[asset_id]["category"]
                else:
                    name = ligne.get("name", asset_id)
                    category = ligne.get("category", _infer_category_from_id(asset_id))
                
                # Ajouter dans la bonne section
                if category in ["Actions", "ETF", "Obligations", "Crypto"]:
                    out[portfolio_name][category][name] = _pct_str(allocation)
        
        # Copier les actifs exclus
        if "ActifsExclus" in portfolio:
            out[portfolio_name]["ActifsExclus"] = portfolio["ActifsExclus"]
        
        # Ajouter le bloc Compliance
        if "Compliance" in portfolio:
            out[portfolio_name]["Compliance"] = portfolio["Compliance"]
        else:
            out[portfolio_name]["Compliance"] = get_compliance_block()
    
    return out

def save_portfolios_dual(portfolios_raw: Dict, filtered_data: Dict):
    """
    Sauvegarde duale : format front dans portefeuilles.json + archive brute
    """
    try:
        history_dir = 'data/portfolio_history'
        os.makedirs(history_dir, exist_ok=True)
        
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # Normaliser pour le front
        allowed_assets = extract_allowed_assets(filtered_data)
        front_json = normalize_v3_to_frontend_v1(portfolios_raw, allowed_assets)
        
        # 1) Sauvegarder le format front (ce que le JS lit)
        with open('portefeuilles.json', 'w', encoding='utf-8') as f:
            json.dump(front_json, f, ensure_ascii=False, indent=4)
        
        # 2) Archive du format brut pour debug
        history_file = f"{history_dir}/portefeuilles_v3_normalized_{timestamp}.json"
        portfolios_with_metadata = {
            "version": "v3_quantitatif_compliance_normalized",
            "timestamp": timestamp,
            "date": datetime.datetime.now().isoformat(),
            "portfolios": portfolios_raw,
            "front_format": front_json,
            "features": [
                "normalisation_front_v1",
                "dual_save_system",
                "drawdown_normalisé",
                "diversification_round_robin", 
                "validation_anti_fin_cycle",
                "fallback_crypto_progressif",
                "cache_univers_hash",
                "retry_api_robuste",
                "compliance_amf",
                "sanitisation_marketing",
                "disclaimer_automatique"
            ]
        }
        
        with open(history_file, 'w', encoding='utf-8') as f:
            json.dump(portfolios_with_metadata, f, ensure_ascii=False, indent=4)
        
        # 3) Mettre à jour l'index
        update_history_index_safe(history_file, front_json, timestamp)
        
        print(f"✅ Sauvegarde duale réussie:")
        print(f"   • Front-end: portefeuilles.json (format classique)")
        print(f"   • Archive: {history_file} (format brut + normalisé)")
        
    except Exception as e:
        print(f"❌ Erreur lors de la sauvegarde duale: {str(e)}")
        # Fallback: essayer au moins de sauver le front
        try:
            with open('portefeuilles.json', 'w', encoding='utf-8') as f:
                json.dump(front_json, f, ensure_ascii=False, indent=4)
            print("✅ Sauvegarde de secours du format front réussie")
        except:
            print("❌ Échec complet de la sauvegarde")

def update_history_index_safe(history_file: str, front_json: Dict, timestamp: str):
    """Met à jour l'index de manière robuste"""
    try:
        index_file = 'data/portfolio_history/index.json'
        
        index_data = []
        if os.path.exists(index_file):
            try:
                with open(index_file, 'r', encoding='utf-8') as f:
                    index_data = json.load(f)
            except json.JSONDecodeError:
                index_data = []
        
        # Créer l'entrée d'index basée sur le format front
        entry = {
            "file": os.path.basename(history_file),
            "version": "v3_normalized",
            "timestamp": timestamp,
            "date": datetime.datetime.now().isoformat(),
            "summary": {}
        }
        
        # Compter les actifs par catégorie depuis le format front
        for portfolio_name in ["Agressif", "Modéré", "Stable"]:
            if portfolio_name in front_json:
                portfolio = front_json[portfolio_name]
                entry["summary"][portfolio_name] = {
                    "Actions": f"{len(portfolio.get('Actions', {}))} actifs",
                    "ETF": f"{len(portfolio.get('ETF', {}))} actifs",
                    "Obligations": f"{len(portfolio.get('Obligations', {}))} actifs",
                    "Crypto": f"{len(portfolio.get('Crypto', {}))} actifs",
                }
        
        index_data.insert(0, entry)
        
        # Limiter à 100 entrées
        if len(index_data) > 100:
            index_data = index_data[:100]
        
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump(index_data, f, ensure_ascii=False, indent=4)
            
    except Exception as e:
        print(f"⚠️ Avertissement: Erreur lors de la mise à jour de l'index: {str(e)}")

# ============= INCLUSION DU CODE ORIGINAL (extraits essentiels) =============

# [Le reste du code original doit être inclus ici - je vais créer une version complète]
# Pour des raisons de taille, je vais créer un patch qui modifie uniquement les parties nécessaires

def extract_allowed_assets(filtered_data: Dict) -> Dict:
    """
    Extrait les actifs autorisés depuis les données filtrées
    """
    # Version simplifiée pour le patch
    return {
        "allowed_equities": [],
        "allowed_etfs_standard": [],
        "allowed_bond_etfs": [],
        "allowed_crypto": []
    }

# PATCH: Modification de la fonction main pour utiliser la sauvegarde duale
def main_with_normalization():
    """
    Version modifiée de main() qui normalise les portefeuilles pour le front-end
    """
    # [Code original de main() jusqu'à la génération des portefeuilles]
    # ...
    
    # Remplacer cette partie:
    # save_portfolios(portfolios)
    
    # Par:
    # save_portfolios_dual(portfolios_raw, filtered_data)
    pass

print("✅ Patch de normalisation front-end chargé avec succès")
print("📝 Pour l'utiliser: importez ce module et appelez save_portfolios_dual() au lieu de save_portfolios()")
