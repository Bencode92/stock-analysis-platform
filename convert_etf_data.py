#!/usr/bin/env python3
"""
Script de conversion des données ETF CSV vers JSON
Adapté pour combined_etfs.csv et combined_bonds.csv
"""

import pandas as pd
import json
import numpy as np
from datetime import datetime
from pathlib import Path

def clean_percentage(value):
    """Nettoie et convertit les pourcentages"""
    if pd.isna(value) or value == '-':
        return None
    if isinstance(value, str):
        value = value.replace('%', '').replace(',', '.').strip()
        if value.startswith('+'):
            value = value[1:]
    try:
        return float(value)
    except:
        return None

def clean_number(value):
    """Nettoie et convertit les nombres"""
    if pd.isna(value) or value == '-':
        return None
    if isinstance(value, str):
        # Gérer les formats européens et les suffixes (M, B, K)
        value = value.replace(' ', '').replace(',', '')
        multiplier = 1
        if value.endswith('M'):
            multiplier = 1000000
            value = value[:-1]
        elif value.endswith('B'):
            multiplier = 1000000000
            value = value[:-1]
        elif value.endswith('K'):
            multiplier = 1000
            value = value[:-1]
        try:
            return float(value) * multiplier
        except:
            return None
    return float(value)

def process_etf_data(filepath, etf_type='equity'):
    """Traite un fichier CSV d'ETFs"""
    print(f"📊 Traitement de {filepath}...")
    
    # Lire le CSV
    df = pd.read_csv(filepath, encoding='utf-8-sig')
    
    # Colonnes attendues (à adapter selon votre CSV)
    column_mapping = {
        'Ticker': 'ticker',
        'Name': 'name',
        'ISIN': 'isin',
        'Exchange': 'exchange',
        'Currency': 'currency',
        'TER': 'ter',
        'AUM': 'aum',
        'Price': 'price',
        '1D %': 'perf_1d',
        '1M %': 'perf_1m',
        '3M %': 'perf_3m',
        'YTD %': 'perf_ytd',
        '1Y %': 'perf_1y',
        '3Y %': 'perf_3y',
        '5Y %': 'perf_5y',
        'Volatility': 'volatility_1y',
        'Sharpe Ratio': 'sharpe_ratio',
        'Max Drawdown': 'max_drawdown',
        'Dividend Yield': 'distribution_yield',
        'Volume': 'avg_volume',
        'Tracking Error': 'tracking_error',
        'Provider': 'provider',
        'Index': 'index_tracked',
        'Replication': 'replication_method',
        'Distribution': 'distribution_policy'
    }
    
    # Renommer les colonnes
    df.rename(columns=column_mapping, inplace=True)
    
    # Nettoyer les données
    percentage_cols = ['ter', 'perf_1d', 'perf_1m', 'perf_3m', 'perf_ytd', 
                      'perf_1y', 'perf_3y', 'perf_5y', 'volatility_1y', 
                      'max_drawdown', 'distribution_yield', 'tracking_error']
    
    for col in percentage_cols:
        if col in df.columns:
            df[col] = df[col].apply(clean_percentage)
    
    number_cols = ['aum', 'price', 'sharpe_ratio', 'avg_volume']
    for col in number_cols:
        if col in df.columns:
            df[col] = df[col].apply(clean_number)
    
    # Ajouter des métadonnées
    df['type'] = etf_type
    df['last_updated'] = datetime.now().isoformat()
    
    # Calculer des métriques dérivées
    if 'ter' in df.columns and 'perf_1y' in df.columns:
        df['efficiency_score'] = df.apply(
            lambda x: x['perf_1y'] / (x['ter'] + 0.01) if pd.notna(x['ter']) and pd.notna(x['perf_1y']) else None,
            axis=1
        )
    
    # Score de liquidité
    if 'aum' in df.columns and 'avg_volume' in df.columns:
        df['liquidity_score'] = df.apply(
            lambda x: calculate_liquidity_score(x['aum'], x['avg_volume']),
            axis=1
        )
    
    # Catégorisation
    df['category'] = df['name'].apply(categorize_etf)
    
    # Région
    df['region'] = df['name'].apply(extract_region)
    
    # Convertir en dictionnaire
    etfs = df.to_dict('records')
    
    # Nettoyer les NaN
    for etf in etfs:
        for key, value in etf.items():
            if pd.isna(value):
                etf[key] = None
    
    print(f"✅ {len(etfs)} ETFs traités")
    return etfs

def calculate_liquidity_score(aum, volume):
    """Calcule un score de liquidité"""
    if pd.isna(aum) or pd.isna(volume):
        return None
    
    aum_score = min(np.log10(max(aum, 1)) / 10, 1)
    volume_score = min(np.log10(max(volume, 1)) / 5, 1)
    
    return (aum_score * 0.6 + volume_score * 0.4) * 100

def categorize_etf(name):
    """Catégorise un ETF selon son nom"""
    name_lower = name.lower() if isinstance(name, str) else ''
    
    if any(term in name_lower for term in ['s&p', 'nasdaq', 'dow', 'russell', 'msci', 'ftse', 'stoxx']):
        return 'index'
    elif any(term in name_lower for term in ['technology', 'tech', 'innovation', 'digital']):
        return 'sector_tech'
    elif any(term in name_lower for term in ['energy', 'oil', 'gas', 'renewable']):
        return 'sector_energy'
    elif any(term in name_lower for term in ['financial', 'bank', 'insurance']):
        return 'sector_financial'
    elif any(term in name_lower for term in ['healthcare', 'pharma', 'biotech']):
        return 'sector_health'
    elif any(term in name_lower for term in ['real estate', 'reit', 'property']):
        return 'sector_realestate'
    elif any(term in name_lower for term in ['gold', 'silver', 'commodity', 'metal']):
        return 'commodity'
    elif any(term in name_lower for term in ['bond', 'treasury', 'fixed income']):
        return 'bonds'
    elif any(term in name_lower for term in ['emerging', 'frontier']):
        return 'emerging'
    else:
        return 'other'

def extract_region(name):
    """Extrait la région depuis le nom de l'ETF"""
    name_lower = name.lower() if isinstance(name, str) else ''
    
    if any(term in name_lower for term in ['us', 'usa', 'america', 's&p', 'nasdaq', 'dow']):
        return 'US'
    elif any(term in name_lower for term in ['europe', 'euro', 'stoxx', 'ftse']):
        return 'Europe'
    elif any(term in name_lower for term in ['asia', 'china', 'japan', 'india', 'msci asia']):
        return 'Asia'
    elif any(term in name_lower for term in ['emerging', 'em ', 'frontier']):
        return 'Emerging'
    elif any(term in name_lower for term in ['world', 'global', 'msci world', 'all country']):
        return 'Global'
    else:
        return 'Other'

def process_holdings(filepath):
    """Traite le fichier des holdings"""
    print(f"📊 Traitement des holdings {filepath}...")
    
    df = pd.read_csv(filepath, encoding='utf-8-sig')
    
    # Grouper par ETF
    holdings_by_etf = {}
    
    for etf_ticker, group in df.groupby('ETF_Ticker'):
        holdings = group.to_dict('records')
        # Trier par poids
        holdings.sort(key=lambda x: x.get('Weight', 0), reverse=True)
        holdings_by_etf[etf_ticker] = holdings
    
    print(f"✅ Holdings pour {len(holdings_by_etf)} ETFs traités")
    return holdings_by_etf

def generate_top_performers(etfs):
    """Génère les top performers par catégorie"""
    df = pd.DataFrame(etfs)
    
    top_performers = {
        'best_ter': df.nsmallest(10, 'ter')[['ticker', 'name', 'ter']].to_dict('records'),
        'best_1y_perf': df.nlargest(10, 'perf_1y')[['ticker', 'name', 'perf_1y']].to_dict('records'),
        'worst_1y_perf': df.nsmallest(10, 'perf_1y')[['ticker', 'name', 'perf_1y']].to_dict('records'),
        'largest_aum': df.nlargest(10, 'aum')[['ticker', 'name', 'aum']].to_dict('records'),
        'best_sharpe': df.nlargest(10, 'sharpe_ratio')[['ticker', 'name', 'sharpe_ratio']].to_dict('records'),
        'most_liquid': df.nlargest(10, 'liquidity_score')[['ticker', 'name', 'liquidity_score']].to_dict('records'),
        'lowest_volatility': df.nsmallest(10, 'volatility_1y')[['ticker', 'name', 'volatility_1y']].to_dict('records'),
    }
    
    # Par catégorie
    for category in df['category'].unique():
        if pd.notna(category):
            cat_df = df[df['category'] == category]
            if len(cat_df) > 0:
                top_performers[f'best_{category}'] = cat_df.nlargest(
                    min(5, len(cat_df)), 'perf_1y'
                )[['ticker', 'name', 'perf_1y']].to_dict('records')
    
    return top_performers

def main():
    """Fonction principale"""
    print("🚀 Démarrage de la conversion des données ETF...\n")
    
    # Créer le dossier data s'il n'existe pas
    Path('data').mkdir(exist_ok=True)
    
    # Traiter les ETFs actions
    if Path('combined_etfs.csv').exists():
        equity_etfs = process_etf_data('combined_etfs.csv', 'equity')
        
        # Sauvegarder en JSON
        with open('data/etfs_equity.json', 'w', encoding='utf-8') as f:
            json.dump(equity_etfs, f, indent=2, ensure_ascii=False)
        print(f"💾 Sauvegardé dans data/etfs_equity.json\n")
    
    # Traiter les ETFs obligations
    if Path('combined_bonds.csv').exists():
        bond_etfs = process_etf_data('combined_bonds.csv', 'bonds')
        
        with open('data/etfs_bonds.json', 'w', encoding='utf-8') as f:
            json.dump(bond_etfs, f, indent=2, ensure_ascii=False)
        print(f"💾 Sauvegardé dans data/etfs_bonds.json\n")
    
    # Traiter les holdings
    if Path('combined_etfs_holdings.csv').exists():
        etf_holdings = process_holdings('combined_etfs_holdings.csv')
        
        with open('data/etfs_holdings.json', 'w', encoding='utf-8') as f:
            json.dump(etf_holdings, f, indent=2, ensure_ascii=False)
        print(f"💾 Sauvegardé dans data/etfs_holdings.json\n")
    
    # Générer les top performers
    all_etfs = []
    if Path('data/etfs_equity.json').exists():
        with open('data/etfs_equity.json', 'r') as f:
            all_etfs.extend(json.load(f))
    if Path('data/etfs_bonds.json').exists():
        with open('data/etfs_bonds.json', 'r') as f:
            all_etfs.extend(json.load(f))
    
    if all_etfs:
        top_performers = generate_top_performers(all_etfs)
        
        with open('data/etfs_top_performers.json', 'w', encoding='utf-8') as f:
            json.dump(top_performers, f, indent=2, ensure_ascii=False)
        print(f"💾 Top performers sauvegardés dans data/etfs_top_performers.json\n")
    
    print("✅ Conversion terminée avec succès!")
    print(f"📊 Total: {len(all_etfs)} ETFs traités")

if __name__ == '__main__':
    main()