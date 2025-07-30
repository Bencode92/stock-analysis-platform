#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TradePulse - Commodity Correlation Mapping
Based on critical export exposures from provided data
"""

COMMODITY_CODES = [
    # Energy commodities
    "US:PETROLEUM_CRUDE",       # Pétrole brut (RU, UAE, US)
    "US:NATGAS",               # Gaz naturel (AU, NO, US)
    "FR:ELECTRICITY",          # Électricité (FR)
    
    # Precious metals
    "US:GOLD",                 # Or (CH, GB)
    "US:SILVER",               # Argent (CN, HK, GB)
    
    # Base metals
    "UK:COPPER_ORE",           # Minerai de cuivre (CL, PE)
    "UK:COPPER_REFINED",       # Cuivre raffiné (CL, CD)
    "CN:IRON_ORE",             # Minerai de fer (AU, BR)
    "CA:NICKEL",               # Nickel (CA, CN, NO)
    "CA:ALUMINIUM",            # Aluminium (CA)
    
    # Agricultural - Grains
    "US:WHEAT",                # Blé (AU, CA, US)
    "US:SOYBEAN",              # Soja (BR, US)
    
    # Agricultural - Softs
    "BR:COFFEE",               # Café (BR)
    "BR:SUGAR",                # Sucre (BR)
    "NL:COCOA",                # Cacao (DE, NL)
    "FR:BEVERAGES",            # Boissons (FR)
    
    # Livestock & Food
    "US:MEAT",                 # Viande (BR, US)
    "NO:FISH",                 # Poisson (NO)
    "MY:PALM_OIL",             # Huile de palme (ID, MY)
    
    # Industrial & Manufacturing
    "CN:MACHINERY",            # Machines (CN)
    "CN:ELECTRICAL_MACHINERY", # Machines électriques (CN, HK)
    "CN:APPAREL",              # Vêtements (CN)
    "CN:VEHICLES",             # Véhicules (CN, DE, US)
    "CN:OPTICAL_INSTRUMENTS",  # Instruments optiques (CN, DE, US)
    "FR:AIRCRAFT",             # Aéronefs (FR, DE)
    
    # Chemicals & Materials
    "CN:PLASTICS",             # Plastiques (CN, US)
    "CN:CHEMICALS_ORGANIC",    # Produits chimiques organiques (CN, US)
    "CH:PHARMACEUTICALS",      # Produits pharmaceutiques (CH, DE, US)
    
    # Services
    "IN:IT_SERVICES",          # Services informatiques (IN)
    "LU:FINANCIAL_SERVICES",   # Services financiers (FR, LU, SG)
    "US:TRAVEL",               # Services de voyage (US)
    
    # Strategic
    "KZ:URANIUM",              # Uranium (KZ)
]

# Mapping par catégories pour faciliter le filtrage
CATEGORY_MAPPING = {
    "energy": [
        "US:PETROLEUM_CRUDE",
        "US:NATGAS",
        "FR:ELECTRICITY"
    ],
    "metals": [
        "US:GOLD",
        "US:SILVER", 
        "UK:COPPER_ORE",
        "UK:COPPER_REFINED",
        "CN:IRON_ORE",
        "CA:NICKEL",
        "CA:ALUMINIUM"
    ],
    "agriculture": [
        "US:WHEAT",
        "US:SOYBEAN",
        "BR:COFFEE",
        "BR:SUGAR",
        "NL:COCOA",
        "FR:BEVERAGES",
        "US:MEAT",
        "NO:FISH",
        "MY:PALM_OIL"
    ],
    "industrial": [
        "CN:MACHINERY",
        "CN:ELECTRICAL_MACHINERY",
        "CN:APPAREL",
        "CN:VEHICLES",
        "CN:OPTICAL_INSTRUMENTS",
        "FR:AIRCRAFT"
    ],
    "chemicals": [
        "CN:PLASTICS",
        "CN:CHEMICALS_ORGANIC",
        "CH:PHARMACEUTICALS"
    ],
    "services": [
        "IN:IT_SERVICES",
        "LU:FINANCIAL_SERVICES",
        "US:TRAVEL"
    ],
    "strategic": [
        "KZ:URANIUM"
    ]
}

# Mapping des pays principaux par commodité (basé sur impact "pivot" et "major")
PIVOT_EXPORTERS = {
    # Energy
    "US:PETROLEUM_CRUDE": ["RU", "AE", "US"],
    "US:NATGAS": ["AU", "NO", "US"],
    "FR:ELECTRICITY": ["FR"],
    
    # Precious metals
    "US:GOLD": ["CH", "GB"],
    "US:SILVER": ["CN", "HK", "GB"],
    
    # Base metals  
    "UK:COPPER_ORE": ["CL", "PE"],
    "UK:COPPER_REFINED": ["CL", "CD"],
    "CN:IRON_ORE": ["AU", "BR"],
    "CA:NICKEL": ["CA", "CN", "NO"],
    "CA:ALUMINIUM": ["CA"],
    
    # Agricultural
    "US:WHEAT": ["AU", "CA", "US"],
    "US:SOYBEAN": ["BR", "US"],
    "BR:COFFEE": ["BR"],
    "BR:SUGAR": ["BR"],
    "NL:COCOA": ["DE", "NL"],
    "FR:BEVERAGES": ["FR"],
    "US:MEAT": ["BR", "US"],
    "NO:FISH": ["NO"],
    "MY:PALM_OIL": ["ID", "MY"],
    
    # Industrial
    "CN:MACHINERY": ["CN"],
    "CN:ELECTRICAL_MACHINERY": ["CN", "HK"],
    "CN:APPAREL": ["CN"],
    "CN:VEHICLES": ["CN", "DE", "US"],
    "CN:OPTICAL_INSTRUMENTS": ["CN", "DE", "US"],
    "FR:AIRCRAFT": ["FR", "DE"],
    
    # Chemicals
    "CN:PLASTICS": ["CN", "US"],
    "CN:CHEMICALS_ORGANIC": ["CN", "US"],
    "CH:PHARMACEUTICALS": ["CH", "DE", "US"],
    
    # Services
    "IN:IT_SERVICES": ["IN"],
    "LU:FINANCIAL_SERVICES": ["FR", "LU", "SG"],
    "US:TRAVEL": ["US"],
    
    # Strategic
    "KZ:URANIUM": ["KZ"]
}
