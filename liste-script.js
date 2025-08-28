/**
 * liste-script.js - Script pour afficher les actions du NASDAQ Composite et DJ STOXX 600
 * Données mises à jour régulièrement par GitHub Actions
 * Version améliorée avec chargement dynamique des données par marché et sélection multi-régions
 * Ajout de panneaux détails extensibles pour chaque action
 * Module MC (Multi-Critères) pour composer des Top 10 personnalisés
 */

document.addEventListener('DOMContentLoaded', function() {
    // --- FICHIERS A→Z PAR RÉGION ---
    const AZ_FILES = {
        US:      'data/stocks_us.json',
        EUROPE:  'data/stocks_europe.json',
        ASIA:    'data/stocks_asia.json',
    };
    
    const SCOPE_TO_FILES = {
        GLOBAL:        ['US','EUROPE','ASIA'],
        US:            ['US'],
        EUROPE:        ['EUROPE'],
        ASIA:          ['ASIA'],
        US_EUROPE:     ['US','EUROPE'],
        US_ASIA:       ['US','ASIA'],
        EUROPE_ASIA:   ['EUROPE','ASIA'],
    };
    
    // Variables globales pour stocker les données
    let stocksData = {
        indices: {},
        meta: {
            source: 'TradePulse',
            timestamp