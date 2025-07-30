#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TradePulse - Commodity Correlation Mapping
Based on critical export exposures from export_exposure.json
"""

COMMODITY_CODES = [
    # Energy commodities
    "US:PETROLEUM_CRUDE",    # Pétrole brut (US, RU, UAE)
    "US:NATGAS",            # Gaz naturel (AU, NO, QA, US)
    
    # Precious metals
    "US:GOLD",              # Or (CH, GB)
    "US:SILVER",            # Argent (CN, HK, GB)
    
    # Base metals
    "UK:COPPER",            # Cuivre (CL, PE, CD)
    "CN:IRON_ORE",          # Minerai de fer (AU, BR)
    "CA:NICKEL",            # Nickel (CA, CN, NO)
    "CA:ALUMINIUM",         # Aluminium (CA)
    
    # Agricultural - Grains
    "US:WHEAT",             # Blé (AU, CA, RU, US)
    "US:CORN",              # Maïs (AR, BR, UA, US)
    "US:SOYBEANS",          # Soja (BR, US)
    "IN:RICE",              # Riz (IN, PK, TH, VN)
    
    # Agricultural - Softs
    "BR:COFFEE",            # Café (BR)
    "BR:SUGAR",             # Sucre (BR)
    "NL:COCOA",             # Cacao (DE, NL)
    
    # Livestock & Food
    "US:MEAT",              # Viande (BR, US)
    "NO:FISH",              # Poisson (NO)
    "MY:PALM_OIL",          # Huile de palme (ID, MY)
    
    # Energy transition & Strategic
    "KZ:URANIUM",           # Uranium (KZ, NA, NG)
    
    # Services & Manufacturing (non-commodities mais critiques)
    "CN:ELECTRICAL_MACHINERY",  # Machines électriques (CN, HK)
    "IN:IT_SERVICES",           # Services IT (IN)
    "LU:FINANCIAL_SERVICES",    # Services financiers (FR, DE, LU, SG)
    "CH:PHARMACEUTICALS",       # Produits pharmaceutiques (CH, DE, US)
]

# Mapping par catégories pour faciliter le filtrage
CATEGORY_MAPPING = {
    "energy": [
        "US:PETROLEUM_CRUDE",
        "US:NATGAS"
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
        "US:CORN",
        "US:SOYBEANS",
        "IN:RICE",
        "BR:COFFEE",
        "BR:SUGAR",
        "NL:COCOA",
        "US:MEAT",
        "NO:FISH",
        "MY:PALM_OIL"
    ],
    "strategic": [
        "KZ:URANIUM"
    ],
    "services": [
        "CN:ELECTRICAL_MACHINERY",
        "IN:IT_SERVICES",
        "LU:FINANCIAL_SERVICES",
        "CH:PHARMACEUTICALS"
    ]
}

# Mapping des pays principaux par commodité (basé sur impact "pivot")
PIVOT_EXPORTERS = {
    "US:PETROLEUM_CRUDE": ["US", "RU", "AE"],
    "US:NATGAS": ["AU", "NO", "QA", "US"],
    "US:GOLD": ["CH", "GB"],
    "US:SILVER": ["CN", "HK", "GB"],
    "UK:COPPER": ["CL", "PE", "CD"],
    "CN:IRON_ORE": ["AU", "BR"],
    "US:WHEAT": ["AU", "CA", "RU", "US"],
    "US:CORN": ["AR", "BR", "UA", "US"],
    "US:SOYBEANS": ["BR", "US"],
    "IN:RICE": ["IN", "PK", "TH", "VN"],
    "BR:COFFEE": ["BR"],
    "BR:SUGAR": ["BR"],
    "KZ:URANIUM": ["KZ", "NA", "NG"],
    "CN:ELECTRICAL_MACHINERY": ["CN"],
    "IN:IT_SERVICES": ["IN"],
    "LU:FINANCIAL_SERVICES": ["LU", "SG"],
    "CH:PHARMACEUTICALS": ["CH"]
}
