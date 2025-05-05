/**
 * TradePulse - Glossaire juridique interactif
 * Ce script charge les termes juridiques depuis le JSON et les met en évidence
 * dans le contenu de la page, affichant leur définition en cliquant.
 * 
 * Version optimisée : architecture en deux temps (scan au build, highlight au runtime)
 */

// Configuration globale
const GLOSSARY_CONFIG = {
    highlightColor: '#00FF87', // Couleur verte LED
    targetSelectors: ['.question-card', '.recommendation-card', '.results-container', '.main-content p'], // Conteneurs où rechercher les termes
    excludeSelectors: ['button', 'input', 'select', 'a', 'h1', 'h2', 'h3', '.glossary-tooltip'], // Éléments à ignorer
    jsonPath: 'data/legal-terms.json', // Chemin vers le fichier JSON complet des définitions
    indexPath: 'data/glossary-index.json', // Chemin vers le fichier d'index des termes (généré au build)
    maxTooltipWidth: '350px', // Largeur maximale de l'info-bulle
    animationDuration: 300 // Durée de l'animation en ms
};

// Classe principale du glossaire
class LegalGlossary {
    constructor(config) {
        this.config = config;
        this.terms = {}; // Stockera les définitions complètes
        this.allowedIds = []; // Stockera la liste des IDs validés (termes qui ont une définition)
        this.activeTooltip = null;
        this.isLoading = false;
        this.isLoaded = false;
        this.regex = null; // 🔹 Cache pour la RegExp
        this.observer = null; // 🔹 Référence au MutationObserver
        this.injectStyles();
        this.loadTerms();
        
        // Nouveau : extraction des termes à partir des questions
        this.questionTerms = [];
    }

    // Injecter les styles CSS directement dans la page
    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .glossary-term {
                color: ${this.config.highlightColor} !important;
                cursor: pointer;
                font-weight: 500;
                transition: text-shadow 0.3s ease;
                position: relative;
            }
            
            .glossary-term:hover {
                text-shadow: 0 0 8px rgba(0, 255, 135, 0.6);
            }
            
            .glossary-term::after {
                content: '';
                position: absolute;
                bottom: -2px;
                left: 0;
                width: 100%;
                height: 1px;
                background-color: ${this.config.highlightColor};
                transform: scaleX(0);
                transition: transform 0.3s ease;
            }
            
            .glossary-term:hover::after {
                transform: scaleX(1);
            }
            
            .glossary-tooltip {
                position: absolute;
                z-index: 1000;
                max-width: ${this.config.maxTooltipWidth};
                background-color: rgba(1, 42, 74, 0.95);
                color: #fff;
                padding: 12px 16px;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(0, 255, 135, 0.3);
                backdrop-filter: blur(5px);
                font-size: 14px;
                line-height: 1.5;
                animation: glossary-pulse 2s infinite;
            