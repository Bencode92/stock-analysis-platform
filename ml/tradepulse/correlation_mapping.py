#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TradePulse - Commodity Correlation Mapping
Based on critical export exposures from the provided data
"""

COMMODITY_CODES = [
    # Energy commodities
    "US:PETROLEUM_CRUDE",    # Pétrole brut (US, RU, UAE)
    "US:NATGAS",            # Gaz naturel (AU, NO, US)
    "FR:ELECTRICITY",       # Électricité (FR)
    
    # Precious metals
    "US:GOLD",              # Or (CH, GB)
    "US:SILVER",            # Argent (CN, HK, GB)
    
    # Base metals
    "UK:COPPER",            # Cuivre (CL, PE, CD)
    "CN:IRON_ORE",          # Minerai de fer (AU, BR)
    "CA:NICKEL",            # Nickel (CA, CN, NO)
    "CA:ALUMINIUM",         # Aluminium (CA)
    
    # Agricultural - Grains
    "US:WHEAT",             # Blé (AU, CA, US)
    "US:SOYBEANS",          # Soja (BR, US)
    
    # Agricultural - Softs
    "BR:COFFEE",            # Café (BR)
    "BR:SUGAR",             # Sucre (BR)
    "NL:COCOA",             # Cacao (DE, NL)
    "FR:BEVERAGES",         # Boissons (FR)
    
    # Livestock & Food
    "US:MEAT",              # Viande (BR, US)
    "NO:FISH",              # Poisson (NO)
    "MY:PALM_OIL",          # Huile de palme (ID, MY)
    
    # Manufacturing & Technology
    "CN:APPAREL",           # Vêtements (CN)
    "CN:MACHINERY",         # Machines (CN)
    "CN:ELECTRICAL_MACHINERY",  # Machines électriques (CN, HK)
    "CN:VEHICLES",          # Véhicules (CN, DE, US)
    "CN:OPTICAL_INSTRUMENTS",   # Instruments optiques (CN, DE, US)
    "FR:AIRCRAFT",          # Aéronefs (FR, DE)
    
    # Chemicals & Materials
    "CN:CHEMICALS_ORGANIC", # Produits chimiques organiques (CN, US)
    "CN:PLASTICS",          # Plastiques (CN, US)
    "CH:PHARMACEUTICALS",   # Produits pharmaceutiques (CH, DE, US)
    
    # Services
    "IN:IT_SERVICES",       # Services IT (IN)
    "LU:FINANCIAL_SERVICES",    # Services financiers (FR, LU, SG)
    "US:TRAVEL",            # Services de voyage (US)
    
    # Strategic
    "KZ:URANIUM",           # Uranium (KZ)
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
        "UK:COPPER",
        "CN:IRON_ORE",
        "CA:NICKEL",
        "CA:ALUMINIUM"
    ],
    "agriculture": [
        "US:WHEAT",
        "US:SOYBEANS",
        "BR:COFFEE",
        "BR:SUGAR",
        "NL:COCOA",
        "FR:BEVERAGES",
        "US:MEAT",
        "NO:FISH",
        "MY:PALM_OIL"
    ],
    "manufacturing": [
        "CN:APPAREL",
        "CN:MACHINERY",
        "CN:ELECTRICAL_MACHINERY",
        "CN:VEHICLES",
        "CN:OPTICAL_INSTRUMENTS",
        "FR:AIRCRAFT"
    ],
    "chemicals": [
        "CN:CHEMICALS_ORGANIC",
        "CN:PLASTICS",
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
    "US:PETROLEUM_CRUDE": ["US", "RU", "AE"],
    "US:NATGAS": ["AU", "NO", "US"],
    "FR:ELECTRICITY": ["FR"],
    
    # Precious metals
    "US:GOLD": ["CH", "GB"],
    "US:SILVER": ["CN", "HK", "GB"],
    
    # Base metals
    "UK:COPPER": ["CL", "PE", "CD"],
    "CN:IRON_ORE": ["AU", "BR"],
    "CA:NICKEL": ["CA", "CN", "NO"],
    "CA:ALUMINIUM": ["CA"],
    
    # Agricultural
    "US:WHEAT": ["AU", "CA", "US"],
    "US:SOYBEANS": ["BR", "US"],
    "BR:COFFEE": ["BR"],
    "BR:SUGAR": ["BR"],
    "NL:COCOA": ["DE", "NL"],
    "FR:BEVERAGES": ["FR"],
    "US:MEAT": ["BR", "US"],
    "NO:FISH": ["NO"],
    "MY:PALM_OIL": ["ID", "MY"],
    
    # Manufacturing
    "CN:APPAREL": ["CN"],
    "CN:MACHINERY": ["CN"],
    "CN:ELECTRICAL_MACHINERY": ["CN", "HK"],
    "CN:VEHICLES": ["CN", "DE", "US"],
    "CN:OPTICAL_INSTRUMENTS": ["CN", "DE", "US"],
    "FR:AIRCRAFT": ["FR", "DE"],
    
    # Chemicals
    "CN:CHEMICALS_ORGANIC": ["CN", "US"],
    "CN:PLASTICS": ["CN", "US"],
    "CH:PHARMACEUTICALS": ["CH", "DE", "US"],
    
    # Services
    "IN:IT_SERVICES": ["IN"],
    "LU:FINANCIAL_SERVICES": ["FR", "LU", "SG"],
    "US:TRAVEL": ["US"],
    
    # Strategic
    "KZ:URANIUM": ["KZ"]
}

# Impact des scénarios de crise
CRISIS_IMPACT = {
    # Prix en HAUSSE
    "price_increase": [
        "CN:IRON_ORE", "US:WHEAT", "US:NATGAS", "BR:COFFEE", "US:SOYBEANS",
        "BR:SUGAR", "US:MEAT", "CA:NICKEL", "CA:ALUMINIUM", "UK:COPPER",
        "US:SILVER", "CN:CHEMICALS_ORGANIC", "FR:ELECTRICITY", "FR:BEVERAGES",
        "NL:COCOA", "MY:PALM_OIL", "NO:FISH", "US:PETROLEUM_CRUDE", "US:GOLD"
    ],
    # Prix en BAISSE
    "price_decrease": [
        "CN:APPAREL", "CN:MACHINERY", "CN:ELECTRICAL_MACHINERY", "CN:PLASTICS",
        "CN:VEHICLES", "CN:OPTICAL_INSTRUMENTS", "FR:AIRCRAFT", "LU:FINANCIAL_SERVICES",
        "CH:PHARMACEUTICALS", "IN:IT_SERVICES", "US:TRAVEL", "KZ:URANIUM"
    ]
}
