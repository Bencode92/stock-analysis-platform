/**
 * liste-script.js - Script pour afficher les actions du NASDAQ Composite et DJ STOXX 600
 * Données mises à jour régulièrement par GitHub Actions
 * Version améliorée avec chargement dynamique des données par marché et sélection multi-régions
 * Ajout de panneaux détails extensibles pour chaque action
 * MODIFIÉ: Section A→Z indépendante des filtres Top 10 avec ses propres filtres
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
    
    // Mapping pays par région (depuis mc-module.js)
    const COUNTRIES_BY_REGION = {
        US: ['États-Unis'],
        EUROPE: ['Allemagne', 'France', 'Suisse', 'Pays-Bas', 'Royaume-Uni', 'Espagne', 'Italie', 'Belgique', 'Suède', 'Danemark', 'Norvège', 'Finlande'],
        ASIA: ['Chine', 'Japon', 'Corée', 'Taïwan', 'Inde', 'Singapour', 'Hong Kong']
    };
    
    // État pour les filtres A→Z (indépendant du Top 10)
    let azSelectedRegions = new Set(['GLOBAL']);
    let azScope = 'GLOBAL';
    let azCountryFilter = '';
    let azSectorFilter = '';
    
    // NOUVEAU: Constante pour forcer GLOBAL sur la section A→Z
    const AZ_SCOPE = 'GLOBAL'; // Section A→Z toujours en mode GLOBAL (toutes régions)
    
    // Variables globales pour stocker les données
    let stock