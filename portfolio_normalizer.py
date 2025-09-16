# ============= NORMALISATION V3 -> SCHÉMA FRONT HISTORIQUE =============
# Ce module contient les fonctions de normalisation pour convertir
# le format v3 (avec IDs) vers le format frontend historique

import datetime
import json
import os
from typing import Dict, Any

def _infer_category_from_id(asset_id: str) -> str:
    """Détermine la catégorie d'un actif depuis son ID"""
    if str(asset_id).startswith("EQ_"):    return "Actions"
    if str(asset_id).startswith("ETF_b"):  return "Obligations"
    if str(asset_id).startswith("ETF_s"):  return "ETF"
    if str(asset_id).startswith("CR_"):    return "Crypto"
    return "Autres"

def _build_asset_lookup(allowed_assets: dict) -> dict:
    """Construit une table de correspondance id -> {name, category}"""
    lut = {}
    for k, cat in [("allowed_equities","Actions"),
                   ("allowed_etfs_standard","ETF"),
                   ("allowed_bond_etfs","Obligations"),
                   ("allowed_crypto","Crypto")]:
        for a in allowed_assets.get(k, []):
            lut[a["id"]] = {"name": a.get("name", a["id"]), "category": cat}
    return lut

def _pct(v) -> str:
    """Formate une valeur en pourcentage"""
    try: 
        return f"{round(float(v))}%"
    except: 
        return f"{v}%"

def normalize_v3_to_frontend_v1(raw_obj: dict, allowed_assets: dict) -> dict:
    """
    Convertit le format v3 (avec IDs) vers le format frontend historique
    
    Entrées possibles:
      - v3 array: {"Portefeuilles":[{"Nom": "...", "Actifs":[{"id":"EQ_1","allocation":8.0}, ...]}, ...]}
      - v3 object: {"Agressif":{"Lignes":[...], "Commentaire":"..."}, ...}
    
    Sortie: Format frontend avec noms complets et structure Actions/ETF/Obligations/Crypto
    """
    # Vérification de sécurité
    if not allowed_assets:
        print("⚠️ Pas d'allowed_assets fourni, utilisation du mapping par défaut")
        allowed_assets = {"allowed_equities": [], "allowed_etfs_standard": [], 
                         "allowed_bond_etfs": [], "allowed_crypto": []}
    
    # Déjà au bon format ?
    if all(k in raw_obj for k in ("Agressif","Modéré","Stable")) and "Portefeuilles" not in raw_obj:
        # Vérifier si c'est déjà le format frontend (présence de Actions/ETF/etc comme dict)
        if isinstance(raw_obj.get("Agressif", {}).get("Actions"), dict):
            return {
                "timestamp": datetime.datetime.now().strftime('%Y%m%d_%H%M%S'),
                "date": datetime.datetime.now().isoformat(),
                "portfolios": raw_obj
            }

    lut = _build_asset_lookup(allowed_assets)
    
    # Mapping des noms de portefeuilles
    name_map = {
        "Portefeuille Agressif":"Agressif", "Agressif":"Agressif", "agressif":"Agressif",
        "Portefeuille Modéré":"Modéré", "Modéré":"Modéré", "modéré":"Modéré", "Modere":"Modéré",
        "Portefeuille Stable":"Stable", "Stable":"Stable", "stable":"Stable"
    }

    # Structure de sortie
    out = {
        "timestamp": datetime.datetime.now().strftime('%Y%m%d_%H%M%S'),
        "date": datetime.datetime.now().isoformat(),
        "portfolios": {
            "Agressif":{"Commentaire":"", "Actions":{}, "ETF":{}, "Obligations":{}, "Crypto":{}, "ActifsExclus":[], "Compliance":{}},
            "Modéré":{"Commentaire":"", "Actions":{}, "ETF":{}, "Obligations":{}, "Crypto":{}, "ActifsExclus":[], "Compliance":{}},
            "Stable":{"Commentaire":"", "Actions":{}, "ETF":{}, "Obligations":{}, "Crypto":{}, "ActifsExclus":[], "Compliance":{}},
        }
    }

    # Cas 1: Format v3 avec Lignes (generate_portfolios_v3)
    if "Agressif" in raw_obj or "Modéré" in raw_obj or "Stable" in raw_obj:
        for portfolio_name in ["Agressif", "Modéré", "Stable"]:
            if portfolio_name not in raw_obj:
                continue
            
            p = raw_obj[portfolio_name]
            bloc = out["portfolios"][portfolio_name]
            
            # Récupérer le commentaire
            bloc["Commentaire"] = p.get("Commentaire", "")
            
            # Récupérer la compliance
            if "Compliance" in p:
                bloc["Compliance"] = p["Compliance"]
            
            # Traiter les lignes
            for l in p.get("Lignes", []):
                aid = str(l.get("id",""))
                alloc = l.get("allocation_pct", 0)
                cat = l.get("category") or _infer_category_from_id(aid)
                name = l.get("name") or lut.get(aid, {}).get("name", aid)
                
                # Normaliser la catégorie
                if cat not in bloc:
                    bloc[cat] = {}
                    
                bloc[cat][name] = _pct(alloc)
            
            # Récupérer les actifs exclus
            if isinstance(p.get("ActifsExclus"), list):
                bloc["ActifsExclus"] = p["ActifsExclus"]
    
    # Cas 2: Format avec wrapper "Portefeuilles"
    else:
        pf_list = raw_obj.get("Portefeuilles", [])
        for p in pf_list:
            key = name_map.get(p.get("Nom"), p.get("Nom", "Agressif"))
            if key not in out["portfolios"]:
                print(f"⚠️ Type de portefeuille non reconnu: {p.get('Nom')}")
                continue
                
            bloc = out["portfolios"][key]
            bloc["Commentaire"] = p.get("Commentaire") or p.get("Description") or ""
            
            # Récupérer la compliance
            if "Compliance" in p:
                bloc["Compliance"] = p["Compliance"]

            # Structure simple "Actifs":[{"id","allocation"}]
            for l in p.get("Actifs", []):
                aid = str(l.get("id",""))
                alloc = l.get("allocation", 0)
                info = lut.get(aid, {"name": aid, "category": _infer_category_from_id(aid)})
                if info["category"] not in bloc:
                    bloc[info["category"]] = {}
                bloc[info["category"]][info["name"]] = _pct(alloc)

            # Structure détaillée "Lignes":[{"id","name","category","allocation_pct"}]
            for l in p.get("Lignes", []):
                aid = str(l.get("id",""))
                alloc = l.get("allocation_pct", 0)
                cat = l.get("category") or _infer_category_from_id(aid)
                name = l.get("name") or lut.get(aid, {}).get("name", aid)
                if cat not in bloc:
                    bloc[cat] = {}
                bloc[cat][name] = _pct(alloc)

            if isinstance(p.get("ActifsExclus"), list):
                bloc["ActifsExclus"] = p["ActifsExclus"]

    return out

def update_history_index_from_front(front_json: dict, history_file: str, version: str):
    """Met à jour l'index de l'historique des portefeuilles"""
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
            "timestamp": front_json.get("timestamp"),
            "date": front_json.get("date"),
            "features": ["normalisation_v3_frontend", "compliance_amf", "scoring_quantitatif"],
            "summary": {}
        }
        
        for pf_name, pf in front_json.get("portfolios", {}).items():
            entry["summary"][pf_name] = {
                "Actions": f"{len(pf.get('Actions',{}))} actifs",
                "ETF": f"{len(pf.get('ETF',{}))} actifs",
                "Obligations": f"{len(pf.get('Obligations',{}))} actifs",
                "Crypto": f"{len(pf.get('Crypto',{}))} actifs",
            }
            
        index_data.insert(0, entry)
        index_data = index_data[:100]  # Garder seulement les 100 derniers
        
        with open(index_file,'w',encoding='utf-8') as f:
            json.dump(index_data, f, ensure_ascii=False, indent=4)
            
    except Exception as e:
        print(f"⚠️ Avertissement: index non mis à jour ({e})")

def save_portfolios_dual(front_json: dict, raw_v3: dict, version_tag: str):
    """
    Sauvegarde duale: format frontend (portefeuilles.json) + archive v3 brute
    """
    history_dir = 'data/portfolio_history'
    os.makedirs(history_dir, exist_ok=True)
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')

    # 1) Fichier principal pour le frontend (ancien format)
    with open('portefeuilles.json','w',encoding='utf-8') as f:
        # Extraire juste les portefeuilles pour le frontend
        frontend_data = front_json.get("portfolios", front_json)
        json.dump(frontend_data, f, ensure_ascii=False, indent=4)
    
    print(f"✅ portefeuilles.json sauvegardé (format frontend)")

    # 2) Archive complète v3 pour debug/traçabilité
    history_file = f"{history_dir}/portefeuilles_{version_tag}_{ts}.json"
    with open(history_file,'w',encoding='utf-8') as f:
        json.dump({
            "version": version_tag,
            "timestamp": ts,
            "date": datetime.datetime.now().isoformat(),
            "portfolios_raw": raw_v3,
            "portfolios_normalized": front_json,
            "features": [
                "scoring_quantitatif_v3",
                "compliance_amf",
                "normalisation_frontend",
                "cache_univers",
                "retry_api_robuste"
            ]
        }, f, ensure_ascii=False, indent=4)
    
    print(f"✅ Archive v3 sauvegardée: {history_file}")

    # 3) Mise à jour de l'index
    update_history_index_from_front(front_json, history_file, version_tag)

def save_portfolios_normalized(portfolios: dict, allowed_assets: dict = None):
    """
    Fonction principale de sauvegarde avec normalisation automatique
    Remplace l'ancienne fonction save_portfolios()
    """
    # Essayer de récupérer allowed_assets du contexte global si non fourni
    if allowed_assets is None:
        allowed_assets = globals().get('_last_allowed_assets', {})
    
    # Normaliser vers le format frontend
    front_json = normalize_v3_to_frontend_v1(portfolios, allowed_assets)
    
    # Sauvegarder les deux formats
    save_portfolios_dual(front_json, portfolios, "v3_stable_compliance")
    
    print("✅ Portefeuilles normalisés et sauvegardés dans les deux formats")
