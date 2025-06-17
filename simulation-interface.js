/**
 * simulation-interface.js - Gestion de l'interface pour le simulateur immobilier
 * 
 * Ce script gère l'interaction avec l'utilisateur, le rendu des résultats
 * et l'affichage dynamique des éléments d'interface.
 * 
 * Version 1.0 - Version initiale
 * Version 1.1 - Corrections des coquilles et optimisations mineures
 * Version 1.2 - Refactorisation et améliorations de la gestion des résultats
 * Version 1.3 - Ajout d'explications détaillées sur le cash-flow et amélioration de l'affichage du cash-flow annuel
 * Version 1.4 - Correction du problème du mode de calcul cash-flow positif et optimisation de l'interface
 * Version 1.5 - Correction du conflit CSS avec les cartes de mode de calcul
 * Version 1.6 - Amélioration de l'affichage des résultats (messages de succès/échec)
 * Version 1.7 - Ajout du tableau comparatif détaillé avec barres visuelles
 * Version 1.8 - Correction de la duplication des icônes info lors de simulations multiples
 * Version 1.9 - Synchronisation du tableau comparatif avec les valeurs incluant l'impact fiscal
 * Version 2.0 - Affichage du cash-flow avant impôt en annuel dans le tableau comparatif
 */
// Désactiver complètement l'impact fiscal
window.disableFiscalImpact = true;

document.addEventListener('DOMContentLoaded', function() {
    // Constantes globales
    const TOAST_DURATION = 5000; // Durée d'affichage des toasts en millisecondes
    const CHART_ANIMATION_DURATION = 2000; // Durée des animations de graphique

    // Initialiser le simulateur
    const simulateur = new SimulateurImmo();
    // Rendre le simulateur accessible globalement pour les extensions
    window.simulateur = simulateur;

    // Éléments DOM
    const btnAdvancedToggle = document.getElementById('btn-advanced-toggle');
    const advancedParams = document.getElementById('advanced-params');
    const btnSimulate = document.getElementById('btn-simulate');
    const btnSaveSimulation = document.getElementById('btn-save-simulation');
    const simulationNameInput = document.getElementById('simulation-name');
    const resultsContainer = document.getElementById('results');
    const montantEmpruntMaxGroup = document.getElementById('montant-emprunt-max-group');
    const historiqueContainer = document.getElementById('historique-container');
    const historiqueList = document.getElementById('historique-list');

    // Masquer les champs non nécessaires
    if (montantEmpruntMaxGroup) {
        montantEmpruntMaxGroup.style.display = 'none';
    }
    
    // Masquer le champ surface visée
    const surfaceField = document.getElementById('surface');
    if (surfaceField && surfaceField.parentNode) {
        surfaceField.parentNode.style.display = 'none';
    }

    // Ajouter un style pour les éléments mis en évidence
    const styleEl = document.createElement('style');
    styleEl.id = 'highlight-styles';
    styleEl.textContent = `
        .highlight-field {
            border-color: var(--primary-color) !important;
            box-shadow: 0 0 0 3px rgba(0, 255, 135, 0.2) !important;
            animation: pulse-border 1.5s infinite;
        }
        
        @keyframes pulse-border {
            0% { border-color: var(--primary-color); }
            50% { border-color: rgba(0, 255, 135, 0.5); }
            100% { border-color: var(--primary-color); }
        }
        
        .info-message {
            margin-bottom: 1rem;
            padding: 0.75rem;
            background-color: rgba(0, 255, 135, 0.1);
            border-radius: 0.5rem;
            border: 1px solid rgba(0, 255, 135, 0.3);
        }
        
        .info-message.warning {
            background-color: rgba(245, 158, 11, 0.1);
            border: 1px solid rgba(245, 158, 11, 0.3);
        }
        
        .optimization-badge {
            display: inline-block;
            margin-left: 0.5rem;
            padding: 0.2rem 0.5rem;
            background-color: rgba(139, 92, 246, 0.2);
            color: #A78BFA;
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: 600;
        }
        
        /* Ajout de style pour les conteneurs de graphiques en vue mobile */
        .chart-container {
            overflow-x: auto;
            margin-bottom: 1rem;
        }
        
        /* Nouveaux styles pour l'affichage du cash-flow annuel */
        .cashflow-container {
            display: flex;
            flex-direction: column;
        }
        
        .cashflow-monthly {
            font-weight: bold;
        }
        
        .cashflow-annual {
            font-size: 0.9rem;
            opacity: 0.9;
            margin-top: 0.25rem;
        }
        
        /* Style pour les infobulles */
        .info-icon {
            display: inline-flex;
            margin-left: 0.5rem;
            color: var(--primary-color);
            font-size: 0.9rem;
            cursor: help;
            position: relative;
        }
        
        .info-icon .tooltip-text {
            visibility: hidden;
            position: absolute;
            bottom: 125%;
            left: 50%;
            transform: translateX(-50%);
            width: 250px;
            background-color: rgba(1, 42, 74, 0.95);
            color: white;
            text-align: center;
            padding: 0.5rem;
            border-radius: 6px;
            font-size: 0.8rem;
            z-index: 100;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
            box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(0, 255, 135, 0.3);
        }
        
        .info-icon:hover .tooltip-text {
            visibility: visible;
            opacity: 1;
        }
        
        /* Flèche en bas de l'infobulle */
        .info-icon .tooltip-text::after {
            content: "";
            position: absolute;
            top: 100%;
            left: 50%;
            margin-left: -5px;
            border-width: 5px;
            border-style: solid;
            border-color: rgba(1, 42, 74, 0.95) transparent transparent transparent;
        }

        /* Styles pour la section d'explication */
        .cashflow-explanation {
            background-color: rgba(0, 255, 135, 0.05);
            border: 1px solid rgba(0, 255, 135, 0.1);
            border-radius: 8px;
            padding: 1rem;
            margin-top: 1rem;
            margin-bottom: 1rem;
        }
        
        .cashflow-explanation h3 {
            font-size: 1.2rem;
            color: var(--primary-color);
            margin-bottom: 0.75rem;
        }
        
        .cashflow-explanation p {
            margin-bottom: 0.75rem;
            line-height: 1.6;
        }
        
        .cashflow-formula {
            background-color: rgba(1, 42, 74, 0.5);
            padding: 0.75rem;
            border-radius: 6px;
            font-family: monospace;
            margin: 0.75rem 0;
        }
        
        .terms-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 0.75rem;
            margin-top: 0.75rem;
        }
        
        .term-card {
            background-color: rgba(1, 42, 74, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 0.5rem 0.75rem;
        }
        
        .term-title {
            color: var(--primary-color);
            font-weight: 600;
            margin-bottom: 0.3rem;
        }
    `;
    document.head.appendChild(styleEl);

    // Éléments des onglets
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    // Éléments accordion
    const accordionHeaders = document.querySelectorAll('.accordion-header');

    // Variables pour stocker les instances de graphiques
    let comparisonChart = null;
    let cashflowChart = null;
    let valuationChart = null;
    let costPieChartClassique = null;
    let costPieChartEncheres = null;

    // === CORRECTION DU CONFLIT CSS ===
    // Les cartes de mode de calcul sont gérées entièrement par CSS
    // via input:checked + .mode-card
    // Aucune manipulation de classes nécessaire en JavaScript
    
    // Écouteur pour les changements de mode de calcul (logique métier uniquement)
    const calculationModeInputs = document.querySelectorAll('input[name="calculation-mode"]');
    calculationModeInputs.forEach(input => {
        input.addEventListener('change', function() {
            if (this.checked) {
                console.log('Mode de calcul sélectionné:', this.value);
                // Logique métier uniquement, pas de modification de styles
            }
        });
    });

    // Fonction modulaire pour afficher des notifications
    function afficherNotification(message, type = 'info') {
        if (!resultsContainer) return;
        
        const notification = document.createElement('div');
        notification.className = `info-message fade-in ${type === 'warning' ? 'warning' : ''}`;
        notification