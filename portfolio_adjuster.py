"""
Module d'ajustement des portefeuilles pour garantir les minimums d'ETF et obligations
Ce fichier sera utilisé par generate_portfolios.py
"""

# Variables globales pour stocker les ETF et obligations valides
valid_etfs_cache = []
valid_bonds_cache = []

def check_portfolio_constraints(portfolios):
    """Vérifie que les portefeuilles générés respectent les contraintes."""
    is_valid = True
    issues = []
    
    for portfolio_type, portfolio in portfolios.items():
        # Compter le nombre total d'actifs (hors commentaire)
        total_assets = 0
        for category, assets in portfolio.items():
            if category != "Commentaire":
                total_assets += len(assets)
        
        # Vérifier que le nombre d'actifs est entre 12 et 15
        if total_assets < 12 or total_assets > 15:
            is_valid = False
            issues.append(f"Portfolio {portfolio_type} a {total_assets} actifs (doit être entre 12-15)")
        
        # Vérifier qu'il y a au moins 2 catégories d'actifs
        categories = [cat for cat in portfolio.keys() if cat != "Commentaire"]
        if len(categories) < 2:
            is_valid = False
            issues.append(f"Portfolio {portfolio_type} a seulement {len(categories)} catégories (minimum 2)")
        
        # Vérifier que la somme des allocations est égale à 100%
        total_allocation = 0
        for category, assets in portfolio.items():
            if category != "Commentaire":
                for allocation in assets.values():
                    try:
                        total_allocation += float(allocation.replace('%', '').strip())
                    except ValueError:
                        is_valid = False
                        issues.append(f"Portfolio {portfolio_type} contient une allocation non numérique: {allocation}")
        
        # Tolérance pour les erreurs d'arrondi
        if total_allocation < 99.5 or total_allocation > 100.5:
            is_valid = False
            issues.append(f"Portfolio {portfolio_type} a une allocation totale de {total_allocation}% (doit être 100%)")
        
        # Vérifier les contraintes minimales d'ETF et d'obligations
        has_etf = "ETF" in portfolio and len(portfolio["ETF"]) > 0
        has_bonds = "Obligations" in portfolio and len(portfolio["Obligations"]) > 0
        
        if portfolio_type == "Agressif" and not has_etf:
            is_valid = False
            issues.append(f"Portfolio Agressif doit avoir au moins 1 ETF")
        elif portfolio_type in ["Modéré", "Stable"] and (not has_etf or not has_bonds):
            missing = []
            if not has_etf:
                missing.append("ETF")
            if not has_bonds:
                missing.append("Obligations")
            is_valid = False
            issues.append(f"Portfolio {portfolio_type} doit avoir au moins 1 ETF et 1 Obligation (manquant: {', '.join(missing)})")
    
    return is_valid, issues

def adjust_portfolios(portfolios):
    """Ajuste les portefeuilles pour respecter les contraintes minimales d'ETF et obligations."""
    adjusted_portfolios = {}
    
    # Accéder aux variables globales
    global valid_etfs_cache, valid_bonds_cache
    
    for portfolio_type, portfolio in portfolios.items():
        # Créer une copie pour ne pas modifier l'original
        adjusted_portfolio = {key: (value.copy() if key != "Commentaire" else value) 
                             for key, value in portfolio.items()}
        
        # Compter le nombre total d'actifs actuels
        total_assets = sum(len(assets) for category, assets in adjusted_portfolio.items() 
                          if category != "Commentaire")
        
        # Si plus de 15 actifs, supprimer les plus petites allocations
        if total_assets > 15:
            # Créer une liste de tous les actifs avec leurs allocations
            all_assets = []
            for category, assets in adjusted_portfolio.items():
                if category != "Commentaire":
                    for asset, allocation in assets.items():
                        alloc_value = float(allocation.replace('%', '').strip())
                        all_assets.append((category, asset, alloc_value))
            
            # Trier par allocation croissante
            all_assets.sort(key=lambda x: x[2])
            
            # Supprimer les actifs avec les plus petites allocations jusqu'à atteindre 15 actifs
            to_remove = total_assets - 15
            removed_allocation = 0
            
            for i in range(to_remove):
                cat, asset, alloc = all_assets[i]
                removed_allocation += alloc
                del adjusted_portfolio[cat][asset]
                
                # Supprimer également la catégorie si elle est vide
                if not adjusted_portfolio[cat]:
                    del adjusted_portfolio[cat]
            
            # Redistribuer l'allocation supprimée
            if removed_allocation > 0:
                # Trouver l'actif avec la plus grande allocation
                if all_assets and len(all_assets) > to_remove:
                    max_cat, max_asset, max_alloc = all_assets[-1]
                    
                    # Vérifier que l'actif existe toujours dans le portefeuille
                    if max_cat in adjusted_portfolio and max_asset in adjusted_portfolio[max_cat]:
                        adjusted_portfolio[max_cat][max_asset] = f"{max_alloc + removed_allocation:.1f}%"
        
        # Vérifier les contraintes minimales d'ETF et d'obligations
        has_etf = "ETF" in adjusted_portfolio and len(adjusted_portfolio["ETF"]) > 0
        has_bonds = "Obligations" in adjusted_portfolio and len(adjusted_portfolio["Obligations"]) > 0
        
        # Si ETF manquant pour les portfolios Agressif, Modéré, Stable
        if not has_etf:
            if "ETF" not in adjusted_portfolio:
                adjusted_portfolio["ETF"] = {}
            
            # Ajouter un ETF s'il en existe un valide
            if valid_etfs_cache and len(valid_etfs_cache) > 0:
                etf_to_add = valid_etfs_cache[0]  # Prendre le premier ETF disponible
                adjusted_portfolio["ETF"][etf_to_add] = "2.0%"
                print(f"✅ Ajout de l'ETF {etf_to_add} au portefeuille {portfolio_type}")
                
                # Réduire l'allocation d'un actif existant pour compenser
                reduced = False
                for category in adjusted_portfolio:
                    if category != "Commentaire" and category != "ETF" and adjusted_portfolio[category]:
                        # Prendre le premier actif de la première catégorie disponible
                        first_asset = next(iter(adjusted_portfolio[category]))
                        current_alloc = float(adjusted_portfolio[category][first_asset].replace('%', '').strip())
                        if current_alloc >= 3.0:  # Vérifier qu'il y a assez à réduire
                            adjusted_portfolio[category][first_asset] = f"{current_alloc - 2.0:.1f}%"
                            reduced = True
                            break
                
                # Si aucun actif n'a pu être réduit, en prendre plusieurs
                if not reduced:
                    remaining = 2.0
                    for category in adjusted_portfolio:
                        if category != "Commentaire" and category != "ETF" and remaining > 0:
                            for asset in list(adjusted_portfolio[category].keys()):
                                current_alloc = float(adjusted_portfolio[category][asset].replace('%', '').strip())
                                if current_alloc > 1.0:  # Ne pas réduire en dessous de 1%
                                    reduction = min(remaining, current_alloc - 1.0)
                                    adjusted_portfolio[category][asset] = f"{current_alloc - reduction:.1f}%"
                                    remaining -= reduction
                                    if remaining <= 0:
                                        break
            else:
                print(f"❌ Impossible d'ajouter un ETF au portefeuille {portfolio_type} - aucun ETF valide disponible")
        
        # Si obligations manquantes pour les portfolios Modéré et Stable
        if portfolio_type in ["Modéré", "Stable"] and not has_bonds:
            if "Obligations" not in adjusted_portfolio:
                adjusted_portfolio["Obligations"] = {}
            
            # Ajouter une obligation s'il en existe une valide
            if valid_bonds_cache and len(valid_bonds_cache) > 0:
                bond_to_add = valid_bonds_cache[0]  # Prendre la première obligation disponible
                adjusted_portfolio["Obligations"][bond_to_add] = "2.0%"
                print(f"✅ Ajout de l'obligation {bond_to_add} au portefeuille {portfolio_type}")
                
                # Réduire l'allocation d'un actif existant pour compenser
                reduced = False
                for category in adjusted_portfolio:
                    if category != "Commentaire" and category != "Obligations" and adjusted_portfolio[category]:
                        # Prendre le premier actif de la première catégorie disponible
                        first_asset = next(iter(adjusted_portfolio[category]))
                        current_alloc = float(adjusted_portfolio[category][first_asset].replace('%', '').strip())
                        if current_alloc >= 3.0:  # Vérifier qu'il y a assez à réduire
                            adjusted_portfolio[category][first_asset] = f"{current_alloc - 2.0:.1f}%"
                            reduced = True
                            break
                
                # Si aucun actif n'a pu être réduit, en prendre plusieurs
                if not reduced:
                    remaining = 2.0
                    for category in adjusted_portfolio:
                        if category != "Commentaire" and category != "Obligations" and remaining > 0:
                            for asset in list(adjusted_portfolio[category].keys()):
                                current_alloc = float(adjusted_portfolio[category][asset].replace('%', '').strip())
                                if current_alloc > 1.0:  # Ne pas réduire en dessous de 1%
                                    reduction = min(remaining, current_alloc - 1.0)
                                    adjusted_portfolio[category][asset] = f"{current_alloc - reduction:.1f}%"
                                    remaining -= reduction
                                    if remaining <= 0:
                                        break
            else:
                print(f"❌ Impossible d'ajouter une obligation au portefeuille {portfolio_type} - aucune obligation valide disponible")
        
        # Vérifier et ajuster le total pour qu'il soit exactement 100%
        total_allocation = 0
        for category, assets in adjusted_portfolio.items():
            if category != "Commentaire":
                for allocation in assets.values():
                    total_allocation += float(allocation.replace('%', '').strip())
        
        # Ajuster si nécessaire
        if total_allocation != 100:
            diff = 100 - total_allocation
            # Distribuer la différence sur le plus grand actif
            max_alloc = 0
            max_cat = None
            max_asset = None
            for category, assets in adjusted_portfolio.items():
                if category != "Commentaire":
                    for asset, allocation in assets.items():
                        alloc_value = float(allocation.replace('%', '').strip())
                        if alloc_value > max_alloc:
                            max_alloc = alloc_value
                            max_cat = category
                            max_asset = asset
            
            if max_cat and max_asset:
                new_alloc = max_alloc + diff
                adjusted_portfolio[max_cat][max_asset] = f"{new_alloc:.1f}%"
                print(f"✅ Ajustement de l'allocation de {max_asset} de {max_alloc}% à {new_alloc:.1f}% pour total=100%")
        
        adjusted_portfolios[portfolio_type] = adjusted_portfolio
    
    return adjusted_portfolios

def get_portfolio_prompt_additions():
    """Retourne les ajouts à faire au prompt pour générer les portefeuilles."""
    return """
⚠️ CONTRAINTES MINIMALES OBLIGATOIRES PAR PORTEFEUILLE:
- Portefeuille Agressif: Au moins 1 ETF
- Portefeuille Modéré: Au moins 1 ETF et 1 Obligation
- Portefeuille Stable: Au moins 1 ETF et 1 Obligation
Le non-respect de ces contraintes minimales entraînera un rejet automatique.
"""
