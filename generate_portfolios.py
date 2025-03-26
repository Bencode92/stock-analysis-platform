# NOUVELLE FONCTION: Extraction des actifs valides des données filtrées (en remplaçant l'ancienne)
def extract_valid_assets(filtered_etfs):
    """Extrait spécifiquement les Top ETF et Top Obligations depuis les données filtrées"""
    valid_etfs = []
    valid_bonds = []
    
    # Identifier les sections spécifiques d'ETF et d'obligations
    lines = filtered_etfs.split('\n')
    current_section = None
    
    for line in lines:
        # Détecter spécifiquement les sections qui nous intéressent
        if "TOP ETF" in line.upper() or "TOP 50 ETF" in line.upper():
            current_section = "TOP_ETF"
            continue
        elif "ETF COURT TERME" in line.upper():
            current_section = "ETF_COURT_TERME"
            continue
        elif "TOP" in line.upper() and "OBLIGATION" in line.upper():
            current_section = "TOP_BOND"
            continue
            
        # Extraire les noms d'actifs (lignes commençant par "•") pour les sections ciblées
        if line.startswith("•") and current_section:
            # Nettoyer pour extraire juste le nom (avant les ":")
            parts = line.split('•')[1].split(':')
            asset_name = parts[0].strip()
            
            if current_section in ["TOP_ETF", "ETF_COURT_TERME"]:
                valid_etfs.append(asset_name)
            elif current_section == "TOP_BOND":
                valid_bonds.append(asset_name)
    
    # Vérifier si nous avons trouvé suffisamment d'éléments
    min_required = 5  # Au moins 5 éléments dans chaque catégorie
    
    print(f"📊 ETF trouvés: {len(valid_etfs)} (TOP ETF et court terme)")
    print(f"📊 Obligations trouvées: {len(valid_bonds)} (TOP Bonds)")
    
    # Si pas assez d'ETF trouvés, ajouter des valeurs par défaut
    if len(valid_etfs) < min_required:
        print("⚠️ Pas assez d'ETF trouvés dans les données filtrées, ajout de valeurs par défaut")
        default_etfs = [
            "Vanguard S&P 500 ETF", 
            "iShares MSCI World ETF", 
            "Invesco QQQ ETF",
            "SPDR Gold Shares ETF",
            "Vanguard Total Bond Market ETF",
            "iShares Core MSCI Emerging Markets ETF",
            "Vanguard FTSE Europe ETF",
            "ARK Innovation ETF",
            "Vanguard Dividend Appreciation ETF",
            "iShares MSCI Japan ETF"
        ]
        for etf in default_etfs:
            if etf not in valid_etfs:
                valid_etfs.append(etf)
    
    # Si pas assez d'obligations trouvées, ajouter des valeurs par défaut
    if len(valid_bonds) < min_required:
        print("⚠️ Pas assez d'obligations trouvées dans les données filtrées, ajout de valeurs par défaut")
        default_bonds = [
            "US Treasury 10Y", 
            "US Treasury 5Y", 
            "US Treasury 30Y",
            "German Bunds 10Y",
            "French OAT 10Y",
            "iShares Corporate Bond ETF",
            "SPDR Bloomberg High Yield Bond ETF",
            "Vanguard Total International Bond ETF",
            "PIMCO Total Return Bond Fund",
            "iShares iBoxx $ Investment Grade Corporate Bond ETF"
        ]
        for bond in default_bonds:
            if bond not in valid_bonds:
                valid_bonds.append(bond)
    
    print(f"✓ Extraction réussie après validation: {len(valid_etfs)} ETF et {len(valid_bonds)} obligations")
    return valid_etfs, valid_bonds