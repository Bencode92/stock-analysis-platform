#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TradePulse - Commodity Correlation Mapping
Defines commodity codes for multi-label correlation predictions
"""

COMMODITY_CODES = [
    # Energy commodities
    "US:WTI", "UK:BRENT", "US:NATGAS", "US:GASOLINE", "US:HEATING_OIL",
    
    # Precious metals
    "US:GOLD", "US:SILVER", "US:PLATINUM", "US:PALLADIUM",
    
    # Base metals
    "UK:COPPER", "UK:ALUMINUM", "UK:ZINC", "UK:NICKEL", "UK:LEAD", "UK:TIN",
    
    # Agricultural - Grains
    "US:WHEAT", "US:CORN", "US:SOYBEANS", "US:RICE", "CN:SOY",
    
    # Agricultural - Softs
    "US:COTTON", "US:SUGAR", "US:COFFEE", "US:COCOA", "US:ORANGE_JUICE",
    
    # Livestock
    "US:LIVE_CATTLE", "US:FEEDER_CATTLE", "US:LEAN_HOGS",
    
    # Industrial
    "CN:IRON_ORE", "AU:IRON_ORE", "US:LUMBER", "UK:STEEL",
    
    # Energy transition
    "CN:LITHIUM", "AU:LITHIUM", "CN:COBALT", "CN:RARE_EARTHS",
    
    # Other
    "US:DXY", "VIX", "US10Y", "CARBON_EU"
]
