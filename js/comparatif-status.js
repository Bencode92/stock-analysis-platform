/**
 * comparatif-statuts.js - Tableau comparatif des formes juridiques
 * Version 2025 avec seuils à jour et comparaison intelligente
 */

// Fonction d'initialisation disponible globalement pour être appelée depuis app.js
window.initComparatifStatuts = function() {
    console.log("Initialisation du tableau comparatif des statuts");
    window.createComparatifTable('comparatif-container');
};

// Encapsulation du reste du code dans une IIFE
(function() {
    // Injecter le CSS nécessaire pour le tableau
    function injectCSS() {
        const style = document.createElement('style');
        style.textContent = `
            /* Conteneur principal */
            .comparatif-container {
                max-width: 100%;
                overflow-x: auto;
                font-family: 'Inter', sans-serif;
                color: #E6E6E6;
            }

            /* En-tête */
            .comparatif-header {
                margin-bottom: 1.5rem;
            }

            .comparatif-title {
                font-size: 1.75rem;
                font-weight: 700;
                margin-bottom: 0.75rem;
                color: #00FF87;
            }

            .comparatif-description {
                color: rgba(230, 230, 230, 0.8);
                margin-bottom: 1.5rem;
                line-height: 1.5;
            }

            /* Filtres */
            .comparatif-filters {
                display: flex;
                flex-wrap: wrap;
                gap: 1rem;
                margin-bottom: 1.5rem;
                align-items: flex-end;
            }

            .filter-group {
                flex: 1;
                min-width: 200px;
            }

            .filter-label {
                display: block;
                margin-bottom: 0.5rem;
                color: rgba(230, 230, 230, 0.7);
                font-size: 0.875rem;
            }

            .criteria-buttons {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                gap: 0.5rem;
            }

            .criteria-button {
                padding: 0.5rem 0.75rem;
                border-radius: 0.375rem;
                font-size: 0.875rem;
                cursor: pointer;
                background-color: rgba(1, 42, 74, 0.5);
                border: 1px solid rgba(0, 255, 135, 0.2);
                color: rgba(230, 230, 230, 0.8);
                transition: all 0.2s ease;
            }

            .criteria-button:hover {
                border-color: rgba(0, 255, 135, 0.4);
                background-color: rgba(1, 42, 74, 0.7);
            }

            .criteria-button.active {
                background-color: rgba(0, 255, 135, 0.15);
                border-color: rgba(0, 255, 135, 0.7);
                color: #00FF87;
            }

            .search-input {
                width: 100%;
                padding: 0.625rem 1rem;
                border-radius: 0.375rem;
                border: 1px solid rgba(1, 42, 74, 0.8);
                background-color: rgba(1, 42, 74, 0.5);
                color: #E6E6E6;
                transition: all 0.2s ease;
            }

            .search-input:focus {
                outline: none;
                border-color: rgba(0, 255, 135, 0.5);
                box-shadow: 0 0 0 2px rgba(0, 255, 135, 0.2);
            }

            /* Tableau */
            .comparatif-table-container {
                border-radius: 0.75rem;
                border: 1px solid rgba(1, 42, 74, 0.8);
                overflow: hidden;
                background-color: rgba(1, 42, 74, 0.3);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                position: relative;
            }

            .comparatif-table {
                width: 100%;
                border-collapse: collapse;
                text-align: left;
            }

            .comparatif-table th {
                padding: 1rem;
                background-color: rgba(1, 22, 39, 0.8);
                font-weight: 600;
                color: #00FF87;
                font-size: 0.875rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                border-bottom: 1px solid rgba(1, 42, 74, 0.8);
                position: sticky;
                top: 0;
                z-index: 10;
            }

            .comparatif-table td {
                padding: 0.875rem 1rem;
                border-bottom: 1px solid rgba(1, 42, 74, 0.5);
                font-size: 0.875rem;
                vertical-align: middle;
            }

            .comparatif-table tr:last-child td {
                border-bottom: none;
            }

            .comparatif-table tr:nth-child(odd) {
                background-color: rgba(1, 42, 74, 0.2);
            }

            .comparatif-table tr:hover {
                background-color: rgba(0, 255, 135, 0.05);
            }

            /* Cellules spécifiques */
            .statut-cell {
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }

            .statut-icon {
                width: 2.5rem;
                height: 2.5rem;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                background-color: rgba(1, 42, 74, 0.5);
                color: #00FF87;
                font-size: 1rem;
            }

            .statut-info {
                display: flex;
                flex-direction: column;
            }

            .statut-name {
                font-weight: 600;
                color: #E6E6E6;
            }

            .statut-fullname {
                font-size: 0.75rem;
                color: rgba(230, 230, 230, 0.6);
                max-width: 180px;
            }

            /* État du chargement */
            .loading-state {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 200px;
                flex-direction: column;
                gap: 1rem;
            }

            .spinner {
                width: 40px;
                height: 40px;
                border: 3px solid rgba(0, 255, 135, 0.3);
                border-radius: 50%;
                border-top-color: #00FF87;
                animation: spin 1s ease-in-out infinite;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            /* Légende et notes */
            .comparatif-notes {
                margin-top: 1.5rem;
                padding: 1rem;
                border-radius: 0.5rem;
                background-color: rgba(1, 42, 74, 0.3);
                font-size: 0.875rem;
            }

            .notes-title {
                font-weight: 600;
                color: #00FF87;
                margin-bottom: 0.5rem;
            }

            .notes-list {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                gap: 0.5rem;
                margin-bottom: 0.75rem;
            }

            .notes-item {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .notes-term {
                color: #00FF87;
                font-weight: 500;
            }

            .notes-disclaimer {
                font-style: italic;
                color: rgba(230, 230, 230, 0.6);
                font-size: 0.8125rem;
                text-align: center;
                margin-top: 0.75rem;
            }

            /* Responsive */
            @media (max-width: 768px) {
                .comparatif-filters {
                    flex-direction: column;
                }
                
                .criteria-buttons {
                    grid-template-columns: repeat(2, 1fr);
                }
                
                .statut-icon {
                    width: 2rem;
                    height: 2rem;
                    font-size: 0.875rem;
                }
                
                .comparatif-table th, 
                .comparatif-table td {
                    padding: 0.75rem 0.5rem;
                    font-size: 0.75rem;
                }
                
                .notes-list {
                    grid-template-columns: 1fr;
                }

                #smart-comparison .grid {
                    grid-template-columns: 1fr !important;
                }
            }

            /* NOUVELLES AMÉLIORATIONS ESTHÉTIQUES */

            /* 1. Mise en valeur des cellules importantes */
            .comparatif-table .key-cell {
                background-color: rgba(0, 255, 135, 0.05);
                font-weight: 500;
            }

            .comparatif-table .highlighted-value {
                color: #00FF87;
                font-weight: 600;
            }

            /* 3. Système d'évaluation visuelle (notation par étoiles) */
            .rating-stars {
                display: inline-flex;
                align-items: center;
            }

            .rating-stars .star {
                color: rgba(255, 255, 255, 0.2);
                margin-right: 2px;
            }

            .rating-stars .star.filled {
                color: #00FF87;
            }

            /* 4. Animation d'apparition en cascade */
            @keyframes fadeInUp {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .comparatif-table tr {
                animation: fadeInUp 0.3s ease forwards;
                opacity: 0;
            }

            .comparatif-table tr:nth-child(1) { animation-delay: 0.05s; }
            .comparatif-table tr:nth-child(2) { animation-delay: 0.1s; }
            .comparatif-table tr:nth-child(3) { animation-delay: 0.15s; }
            .comparatif-table tr:nth-child(4) { animation-delay: 0.2s; }
            .comparatif-table tr:nth-child(5) { animation-delay: 0.25s; }
            .comparatif-table tr:nth-child(6) { animation-delay: 0.3s; }
            .comparatif-table tr:nth-child(7) { animation-delay: 0.35s; }
            .comparatif-table tr:nth-child(8) { animation-delay: 0.4s; }
            .comparatif-table tr:nth-child(9) { animation-delay: 0.45s; }
            .comparatif-table tr:nth-child(10) { animation-delay: 0.5s; }

            /* 5. Barre de comparaison interactive */
            .comparison-bar {
                display: flex;
                align-items: center;
                padding: 0.75rem 1rem;
                background-color: rgba(1, 35, 65, 0.7);
                border-radius: 8px;
                margin-bottom: 1rem;
                flex-wrap: wrap;
                gap: 0.5rem;
            }

            .comparison-title {
                font-size: 0.875rem;
                font-weight: 500;
                color: rgba(255, 255, 255, 0.8);
                margin-right: 1rem;
            }

            .comparison-items {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
                flex-grow: 1;
            }

            .comparison-item {
                display: flex;
                align-items: center;
                padding: 0.375rem 0.75rem;
                background-color: rgba(0, 255, 135, 0.15);
                border: 1px solid rgba(0, 255, 135, 0.3);
                border-radius: 4px;
                font-size: 0.8125rem;
                color: #00FF87;
            }

            .comparison-item .remove-btn {
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.6);
                font-size: 0.75rem;
                margin-left: 0.5rem;
                cursor: pointer;
                padding: 2px;
            }

            .comparison-item .remove-btn:hover {
                color: #FF6B6B;
            }

            .add-comparison-btn,
            .add-comparison-select {
                padding: 0.375rem 0.75rem;
                background-color: rgba(1, 42, 74, 0.5);
                border: 1px solid rgba(0, 255, 135, 0.3);
                border-radius: 4px;
                font-size: 0.8125rem;
                color: rgba(255, 255, 255, 0.7);
                cursor: pointer;
                transition: all 0.2s;
            }

            .add-comparison-btn:hover {
                background-color: rgba(1, 42, 74, 0.7);
                border-color: rgba(255, 255, 255, 0.5);
                color: #fff;
            }
            
            .status-dropdown {
                margin-right: 0.5rem;
                width: 200px;
                padding: 0.5rem;
                background-color: rgba(1, 42, 74, 0.7);
                border: 1px solid rgba(0, 255, 135, 0.3);
                border-radius: 4px;
                color: #E6E6E6;
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2300FF87' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: calc(100% - 0.75rem) center;
                padding-right: 2rem;
            }
            
            .status-dropdown:focus {
                outline: none;
                border-color: rgba(0, 255, 135, 0.5);
                box-shadow: 0 0 0 2px rgba(0, 255, 135, 0.2);
            }

            /* 6. Tooltips informatifs */
            .info-tooltip {
                position: relative;
                cursor: help;
            }

            .info-tooltip:hover::after {
                content: attr(data-tooltip);
                position: absolute;
                left: 50%;
                transform: translateX(-50%);
                bottom: 100%;
                background-color: rgba(1, 22, 39, 0.95);
                color: #fff;
                padding: 6px 10px;
                border-radius: 6px;
                font-size: 0.875rem;
                white-space: nowrap;
                z-index: 10;
                box-shadow: 0 3px 6px rgba(0, 0, 0, 0.2);
                border: 1px solid rgba(0, 255, 135, 0.3);
                margin-bottom: 5px;
            }

            /* Boutons d'action flottants */
            .actions-floating-bar {
                position: fixed;
                bottom: 1.5rem;
                right: 1.5rem;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
                z-index: 20;
            }

            .action-btn {
                width: 3rem;
                height: 3rem;
                border-radius: 50%;
                background-color: rgba(0, 255, 135, 0.2);
                border: 1px solid rgba(0, 255, 135, 0.3);
                color: #00FF87;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.125rem;
                cursor: pointer;
                transition: all 0.2s;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
            }

            .action-btn:hover {
                background-color: rgba(0, 255, 135, 0.3);
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
            }

            /* Comparaison intelligente */
            #smart-comparison {
                margin-top: 0.75rem;
            }

            #smart-comparison .grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }

            #smart-comparison b {
                color: #00FF87;
            }
        `;
        document.head.appendChild(style);
    }

    // ========== NOUVEAUX UTILITAIRES 2025 ==========
    
    // Helpers légers
    const $ = (s, r=document)=>r.querySelector(s);
    const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
    const toText = v => (v==null || v==='') ? '—' : String(v);
    const fmtEuro = n => Number.isFinite(+n) ? (+n).toLocaleString('fr-FR')+' €' : toText(n);
    const debounce = (fn, ms=250)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

    // Seuils 2025 (priorité à tes données si présentes)
    function getThresholds2025() {
        const T = (window.recoEngine && window.recoEngine.thresholds2025) || window.thresholds2025 || {};
        const def = {
            micro: { bic_sales:188700, bic_service:77700, bnc:77700, meuble_classe_ca:77700, meuble_non_classe_ca:15000 },
            tva_franchise_base: { ventes:85000, services:37500, tolerance_ventes:93500, tolerance_services:41250 }
        };
        return {
            micro: { ...def.micro, ...(T.micro||{}) },
            tva_franchise_base: { ...def.tva_franchise_base, ...(T.tva_franchise_base||{}) }
        };
    }

    // Obligations clefs pour pédagogie (micro / EURL / SASU)
    function deriveObligations(shortName) {
        const T = getThresholds2025();
        const tvaFr = `Franchise TVA 2025 : ventes ${fmtEuro(T.tva_franchise_base.ventes)} (${fmtEuro(T.tva_franchise_base.tolerance_ventes)} tol.) • services ${fmtEuro(T.tva_franchise_base.services)} (${fmtEuro(T.tva_franchise_base.tolerance_services)} tol.)`;
        const microPlaf = `Ventes/Hébergement ${fmtEuro(T.micro.bic_sales)} • Services/BIC ${fmtEuro(T.micro.bic_service)} • BNC ${fmtEuro(T.micro.bnc)} • Meublés tourisme ${fmtEuro(T.micro.meuble_classe_ca)} (classé) / ${fmtEuro(T.micro.meuble_non_classe_ca)} (non classé)`;

        const SN = (shortName||'').toUpperCase();
        if (SN.includes('MICRO')) {
            return {
                obligationsCle: [
                    'Déclaration du CA (URSSAF) mensuelle/trimestrielle',
                    'Livre des recettes (+ registre achats si ventes)',
                    'Franchise TVA par défaut (option possible)',
                    'CFE (souvent exonérée la 1ʳᵉ année)',
                    'Compte pro dédié si CA > 10 000 € deux années de suite'
                ].join(' · '),
                plafondCA: microPlaf,
                regimeTVA: tvaFr
            };
        }
        if (SN==='EURL') {
            return {
                obligationsCle: [
                    'Comptabilité d\'engagement, dépôt des comptes',
                    'AG d\'approbation < 6 mois après clôture',
                    'TVA : réel simplifié/normal ou franchise si éligible',
                    'Cotisations TNS (et sur dividendes > 10 % si IS)'
                ].join(' · ')
            };
        }
        if (SN==='SASU') {
            return {
                obligationsCle: [
                    'Comptabilité d\'engagement, dépôt des comptes',
                    'Paie & DSN si rémunération du président',
                    'TVA : réel simplifié/normal ou franchise si éligible',
                    'Dividendes non soumis à cotisations sociales (PFU/barème)'
                ].join(' · ')
            };
        }
        return { obligationsCle: '' };
    }

    // Normalise une fiche statut pour l'affichage
    function enrichForDisplay(statut) {
        const derived = deriveObligations(statut.shortName || statut.name);
        const km = statut.key_metrics || {};
        return {
            ...statut,
            regimeTVA: statut.regimeTVA || derived.regimeTVA,
            plafondCA: statut.plafondCA || derived.plafondCA || '—',
            obligationsCle: statut.obligationsCle || derived.obligationsCle || '—',
            // Pour la colonne "Protection patrimoine": on affiche étoiles + texte si dispo
            _pp_stars: Number.isFinite(km.patrimony_protection) ? km.patrimony_protection : null,
            _pp_text: toText(statut.protectionPatrimoine)
        };
    }

    // ========== FIN NOUVEAUX UTILITAIRES ==========

    // Fonction principale pour créer le tableau comparatif - exposée globalement
    window.createComparatifTable = function(containerId) {
        // S'assurer que le conteneur existe
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Conteneur #${containerId} non trouvé`);
            return;
        }

        // Injecter le CSS
        injectCSS();

        // Créer la structure HTML de base
        container.innerHTML = `
            <div class="comparatif-container">
                <div class="comparatif-header">
                    <h2 class="comparatif-title">Comparatif des formes juridiques 2025</h2>
                    <p class="comparatif-description">
                        Tableau comparatif des principales caractéristiques des différentes formes juridiques en France.
                        Utilisez les filtres ci-dessous pour personnaliser l'affichage selon vos besoins.
                    </p>
                    
                    <div class="comparison-bar">
                        <div class="comparison-title">Comparer directement:</div>
                        <select id="status-dropdown" class="status-dropdown">
                            <option value="">Sélectionner un statut...</option>
                            <!-- Les options seront générées ici -->
                        </select>
                        <div class="comparison-items" id="comparison-items">
                            <!-- Les éléments de comparaison seront ici -->
                        </div>
                        <button class="add-comparison-btn" id="add-comparison-btn">
                            <i class="fas fa-plus mr-1"></i> Ajouter
                        </button>
                    </div>
                    
                    <div class="comparatif-filters">
                        <div class="filter-group">
                            <label class="filter-label">Filtrer par critères:</label>
                            <div class="criteria-buttons" id="criteria-buttons">
                                <!-- Les boutons seront générés ici -->
                            </div>
                        </div>
                        
                        <div class="filter-group" style="max-width: 300px;">
                            <label class="filter-label">Rechercher:</label>
                            <input type="text" id="search-input" class="search-input" placeholder="Rechercher un statut...">
                        </div>
                    </div>
                </div>
                
                <div class="comparatif-table-container">
                    <table class="comparatif-table" id="comparatif-table">
                        <thead>
                            <tr id="table-headers">
                                <!-- Les en-têtes seront générés ici -->
                            </tr>
                        </thead>
                        <tbody id="table-body">
                            <!-- Les données seront générées ici -->
                        </tbody>
                    </table>
                </div>
                
                <div class="comparatif-notes">
                    <h3 class="notes-title">Notes explicatives</h3>
                    <div class="notes-list">
                        <div class="notes-item">
                            <span class="notes-term">IR</span> - Impôt sur le Revenu
                        </div>
                        <div class="notes-item">
                            <span class="notes-term">IS</span> - Impôt sur les Sociétés
                        </div>
                        <div class="notes-item">
                            <span class="notes-term">TNS</span> - Travailleur Non Salarié
                        </div>
                        <div class="notes-item">
                            <span class="notes-term">CA</span> - Chiffre d'Affaires
                        </div>
                    </div>
                    <p class="notes-disclaimer">
                        Les informations présentées sont à jour pour l'année 2025. Pour plus de détails ou pour une 
                        recommandation personnalisée, utilisez notre simulateur.
                    </p>
                </div>
                
                <!-- Boutons d'action flottants -->
                <div class="actions-floating-bar">
                    <button class="action-btn" title="Imprimer" id="print-btn">
                        <i class="fas fa-print"></i>
                    </button>
                </div>
            </div>
        `;

        // Afficher l'état de chargement initial
        const tableBody = document.getElementById('table-body');
        tableBody.innerHTML = `
            <tr>
                <td colspan="10">
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <p>Chargement des données...</p>
                    </div>
                </td>
            </tr>
        `;

        // Définir les critères de comparaison
        const criteria = [
            { id: 'all', label: 'Tous les critères' },
            { id: 'basic', label: 'Critères de base' },
            { id: 'fiscal', label: 'Aspects fiscaux' },
            { id: 'social', label: 'Aspects sociaux' },
            { id: 'creation', label: 'Création et gestion' }
        ];

        // Générer les boutons de critère
        const criteriaButtons = document.getElementById('criteria-buttons');
        criteria.forEach(criterion => {
            const button = document.createElement('button');
            button.className = 'criteria-button' + (criterion.id === 'all' ? ' active' : '');
            button.setAttribute('data-criterion', criterion.id);
            button.textContent = criterion.label;
            criteriaButtons.appendChild(button);
        });

        // Variables pour le filtrage et la comparaison
        let selectedCriterion = 'all';
        let searchTerm = '';
        let compareStatuts = [];
        
        // Initialiser les événements de comparaison
        initComparisonEvents();

        // Charger et afficher les données
        loadStatutData();

        // Ajouter les écouteurs d'événements pour le filtrage
        document.querySelectorAll('.criteria-button').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.criteria-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                button.classList.add('active');
                selectedCriterion = button.getAttribute('data-criterion');
                updateTable();
            });
        });

        // ========== DEBOUNCE SUR LA RECHERCHE ==========
        const debouncedUpdate = debounce(()=>{ updateTable(); }, 200);
        $('#search-input').addEventListener('input', (e)=>{
            searchTerm = e.target.value.toLowerCase();
            debouncedUpdate();
        });
        
        // Ajouter les écouteurs d'événements pour les boutons d'action        
        document.getElementById('print-btn').addEventListener('click', () => {
            window.print();
        });

        // Fonction pour initialiser les événements de comparaison
        function initComparisonEvents() {
            const addComparisonBtn = document.getElementById('add-comparison-btn');
            const statusDropdown = document.getElementById('status-dropdown');
            
            // Remplir la liste déroulante avec les statuts disponibles
            function populateStatusDropdown() {
                if (window.legalStatuses) {
                    statusDropdown.innerHTML = '<option value="">Sélectionner un statut...</option>';
                    
                    // Trier les statuts par nom avec locale fr
                    const statuts = Object.values(window.legalStatuses)
                        .sort((a,b)=> a.shortName.localeCompare(b.shortName,'fr',{sensitivity:'base'}));
                    
                    statuts.forEach(statut => {
                        const option = document.createElement('option');
                        option.value = statut.shortName;
                        option.textContent = statut.shortName;
                        statusDropdown.appendChild(option);
                    });
                }
            }
            
            // Gérer le changement de sélection dans la liste déroulante
            statusDropdown.addEventListener('change', () => {
                if (statusDropdown.value) {
                    addToComparison(statusDropdown.value);
                    statusDropdown.value = ''; // Réinitialiser après la sélection
                }
            });
            
            // Gérer le clic sur le bouton Ajouter
            addComparisonBtn.addEventListener('click', () => {
                if (window.legalStatuses) {
                    // Créer une liste des statuts disponibles pour sélection
                    const statuts = Object.values(window.legalStatuses);
                    if (statuts.length > 0) {
                        // Trouver un statut qui n'est pas déjà dans la comparaison
                        const availableStatuts = statuts.filter(statut => 
                            !compareStatuts.includes(statut.shortName));
                        
                        if (availableStatuts.length > 0) {
                            // Ajouter le premier statut disponible à la comparaison
                            addToComparison(availableStatuts[0].shortName);
                        } else {
                            alert('Tous les statuts sont déjà inclus dans la comparaison');
                        }
                    }
                }
            });
            
            // Initialiser la liste déroulante quand les données sont disponibles
            if (window.legalStatuses) {
                populateStatusDropdown();
            } else {
                // Vérifier périodiquement si les données sont disponibles
                const checkInterval = setInterval(() => {
                    if (window.legalStatuses) {
                        populateStatusDropdown();
                        clearInterval(checkInterval);
                    }
                }, 500);
            }

            // Écouter l'événement custom si disponible
            window.addEventListener('legalStatuses:ready', ()=>populateStatusDropdown(), { once:true });
        }
        
        // Fonction pour ajouter un statut à la comparaison
        function addToComparison(statutShortName) {
            if (compareStatuts.includes(statutShortName)) return;
            
            if (compareStatuts.length >= 3) {
                // Limiter à 3 statuts maximum
                compareStatuts.shift(); // Retirer le premier
            }
            
            compareStatuts.push(statutShortName);
            updateComparisonBar();
            updateTable();
        }
        
        // Fonction pour retirer un statut de la comparaison
        function removeFromComparison(statutShortName) {
            const index = compareStatuts.indexOf(statutShortName);
            if (index !== -1) {
                compareStatuts.splice(index, 1);
                updateComparisonBar();
                updateTable();
            }
        }
        
        // Fonction pour mettre à jour la barre de comparaison
        function updateComparisonBar() {
            const comparisonItems = document.getElementById('comparison-items');
            comparisonItems.innerHTML = '';
            
            compareStatuts.forEach(shortName => {
                const statut = Object.values(window.legalStatuses).find(s => s.shortName === shortName);
                if (!statut) return;
                
                const itemDiv = document.createElement('div');
                itemDiv.className = 'comparison-item';
                itemDiv.setAttribute('data-status', shortName);
                itemDiv.innerHTML = `
                    <i class="fas ${statut.logo || 'fa-building'} mr-2"></i> ${shortName}
                    <button class="remove-btn"><i class="fas fa-times"></i></button>
                `;
                
                // Ajouter l'événement pour supprimer
                itemDiv.querySelector('.remove-btn').addEventListener('click', () => {
                    removeFromComparison(shortName);
                });
                
                comparisonItems.appendChild(itemDiv);
            });

            // ========== COMPARAISON INTELLIGENTE ==========
            renderSmartComparison();
        }

        // ========== FONCTION COMPARAISON INTELLIGENTE ==========
        function renderSmartComparison(){
            let host = $('#smart-comparison');
            if (!host){
                host = document.createElement('div');
                host.id = 'smart-comparison';
                host.style.marginTop = '0.75rem';
                const header = $('.comparatif-header');
                header && header.appendChild(host);
            }
            host.innerHTML = '';

            const has = x => compareStatuts.includes(x);
            const get = sn => enrichForDisplay(Object.values(window.legalStatuses||{}).find(s=>s.shortName===sn) || { shortName: sn, name: sn });

            if (has('EURL') && has('SASU')) {
                const eurl = get('EURL'), sasu = get('SASU');
                host.innerHTML = `
                    <div style="border:1px solid rgba(0,255,135,.3);border-radius:8px;padding:12px;background:rgba(1,35,65,.6)">
                        <div style="font-weight:600;color:#00FF87;margin-bottom:6px">💡 EURL vs SASU — points décisifs</div>
                        <div class="grid">
                            <div>
                                <div><b>Social dirigeant</b> : ${toText(eurl.regimeSocial)}</div>
                                <div><b>Fiscalité par défaut</b> : ${toText(eurl.fiscalite)}</div>
                                <div><b>Dividendes</b> : assujettis TNS au-delà de 10 % (si IS)</div>
                                <div><b>Capital</b> : ${toText(eurl.capital)}</div>
                            </div>
                            <div>
                                <div><b>Social dirigeant</b> : ${toText(sasu.regimeSocial)}</div>
                                <div><b>Fiscalité par défaut</b> : ${toText(sasu.fiscalite)}</div>
                                <div><b>Dividendes</b> : pas de cotisations sociales (PFU/barème)</div>
                                <div><b>Capital</b> : ${toText(sasu.capital)}</div>
                            </div>
                        </div>
                        <div style="margin-top:8px;font-size:.9rem;opacity:.9">
                            <b>Raccourci</b> : EURL = cotisations souvent plus basses (TNS) si salaire, SASU = meilleure couverture (assimilé salarié) et plus simple si investisseurs/associés arrivent.
                        </div>
                    </div>`;
            } else if (compareStatuts.length===1 && has('MICRO')) {
                const m = get('MICRO');
                host.innerHTML = `
                    <div style="border:1px solid rgba(0,255,135,.3);border-radius:8px;padding:12px;background:rgba(1,35,65,.6)">
                        <div style="font-weight:600;color:#00FF87;margin-bottom:6px">📋 Freelance en micro — ce qu'il faut faire en 2025</div>
                        <div style="line-height:1.5">${m.obligationsCle.split(' · ').map(x=>`• ${x}`).join('<br>')}</div>
                        <div style="margin-top:6px;font-size:.9rem;opacity:.9"><b>Plafonds</b> : ${m.plafondCA}</div>
                        <div style="font-size:.9rem;opacity:.9"><b>TVA</b> : ${m.regimeTVA || '—'}</div>
                    </div>`;
            }
        }

        // Fonction pour générer une notation par étoiles
        function generateStarRating(rating) {
            if (typeof rating !== 'number') return 'Non évalué';
            
            let stars = '';
            for (let i = 1; i <= 5; i++) {
                stars += `<span class="star ${i <= rating ? 'filled' : ''}">★</span>`;
            }
            return stars;
        }
        
        // ========== TOOLTIPS ENRICHIS ==========
        function getTooltipForProperty(propertyKey) {
            const tooltips = {
                'responsabilite': 'Niveau de responsabilité financière personnelle du dirigeant',
                'capital': 'Montant minimum légal pour constituer la société',
                'fiscalite': 'Régime fiscal par défaut (IR: Impôt sur le Revenu, IS: Impôt sur les Sociétés)',
                'fiscaliteOption': 'Options IR/IS/versement libératoire et fenêtres d\'option',
                'regimeSocial': 'Statut social du dirigeant (TNS: indépendant, Assimilé salarié: régime général)',
                'chargesSociales': 'Où se calculent les cotisations (rémunération, bénéfice, dividendes…)',
                'associes': 'Nombre minimum et maximum d\'associés autorisés',
                'protectionPatrimoine': 'Niveau de séparation entre patrimoines personnel et professionnel',
                'regimeTVA': 'Régime de TVA applicable',
                'formalites': 'Complexité des démarches administratives',
                'publicationComptes': 'Obligation de publier les comptes annuels',
                'obligationsCle': 'Obligations déclaratives/comptables clés 2025',
                'plafondCA': 'Plafonds micro 2025 selon l\'activité'
            };
            
            return tooltips[propertyKey] || 'Information complémentaire';
        }

        // Fonction pour charger les données des statuts
        function loadStatutData() {
            // Essayer d'obtenir les données depuis window.legalStatuses
            if (window.legalStatuses) {
                renderTable(window.legalStatuses);
            } else {
                // Si pas disponible, attendre un peu et réessayer
                console.log("Les données legalStatuses ne sont pas encore disponibles, tentative dans 500ms...");
                setTimeout(() => {
                    if (window.legalStatuses) {
                        renderTable(window.legalStatuses);
                    } else {
                        // Si toujours pas disponible, afficher un message d'erreur
                        tableBody.innerHTML = `
                            <tr>
                                <td colspan="10">
                                    <div class="loading-state">
                                        <p style="color: #FF6B6B;">
                                            <i class="fas fa-exclamation-triangle" style="margin-right: 0.5rem;"></i>
                                            Impossible de charger les données des statuts juridiques.
                                        </p>
                                        <button id="retry-load" style="
                                            padding: 0.5rem 1rem;
                                            background-color: rgba(0, 255, 135, 0.2);
                                            border: 1px solid rgba(0, 255, 135, 0.5);
                                            color: #00FF87;
                                            border-radius: 0.375rem;
                                            cursor: pointer;
                                            margin-top: 0.5rem;
                                        ">Réessayer</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                        document.getElementById('retry-load').addEventListener('click', loadStatutData);
                    }
                }, 500);
            }

            // Écouter l'événement custom si disponible
            window.addEventListener('legalStatuses:ready', ()=>renderTable(window.legalStatuses), { once:true });
        }

        // ========== COLONNES ENRICHIES ==========
        function getColumnsForCriterion(criterion) {
            switch (criterion) {
                case 'basic':
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'associes', label: 'Nombre d\'associés' },
                        { key: 'capital', label: 'Capital social' },
                        { key: 'responsabilite', label: 'Responsabilité' }
                    ];
                case 'fiscal':
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'fiscalite', label: 'Régime fiscal' },
                        { key: 'fiscaliteOption', label: 'Option fiscale' },
                        { key: 'regimeTVA', label: 'Régime TVA' }
                    ];
                case 'social':
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'regimeSocial', label: 'Régime social' },
                        { key: 'chargesSociales', label: 'Charges sociales' },
                        { key: 'protectionPatrimoine', label: 'Protection patrimoine' }
                    ];
                case 'creation':
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'formalites', label: 'Formalités' },
                        { key: 'publicationComptes', label: 'Publication comptes' },
                        { key: 'plafondCA', label: 'Plafond CA' },
                        { key: 'obligationsCle', label: 'Obligations clés' }
                    ];
                default: // 'all'
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'associes', label: 'Nombre d\'associés' },
                        { key: 'capital', label: 'Capital social' },
                        { key: 'responsabilite', label: 'Responsabilité' },
                        { key: 'fiscalite', label: 'Régime fiscal' },
                        { key: 'regimeSocial', label: 'Régime social' },
                        { key: 'plafondCA', label: 'Plafond CA' }
                    ];
            }
        }

        // Fonction pour filtrer les statuts en fonction du terme de recherche et de la comparaison
        function filterStatuts(statuts, term) {
            let filteredList = Object.values(statuts);
            
            // Si nous sommes en mode comparaison, filtrer uniquement les statuts sélectionnés
            if (compareStatuts.length > 0) {
                filteredList = filteredList.filter(statut => 
                    compareStatuts.includes(statut.shortName));
            }
            
            // Puis filtrer par terme de recherche
            if (term) {
                filteredList = filteredList.filter(statut =>
                    statut.name.toLowerCase().includes(term) || 
                    statut.shortName.toLowerCase().includes(term) ||
                    (statut.description && statut.description.toLowerCase().includes(term))
                );
            }
            
            return filteredList;
        }

        // Fonction principale pour mettre à jour le tableau
        function updateTable() {
            if (!window.legalStatuses) return;
            
            // Obtenir les colonnes à afficher selon le critère
            const columns = getColumnsForCriterion(selectedCriterion);
            
            // Mettre à jour les en-têtes du tableau
            const tableHeaders = document.getElementById('table-headers');
            tableHeaders.innerHTML = columns.map(col => 
                `<th>${col.label}</th>`
            ).join('');
            
            // Filtrer les statuts
            const filteredStatuts = filterStatuts(window.legalStatuses, searchTerm);
            
            // ========== ENRICHISSEMENT DES DONNÉES ==========
            const rowsData = filteredStatuts.map(enrichForDisplay);
            
            // Générer les lignes du tableau
            const tableBody = document.getElementById('table-body');
            
            if (rowsData.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="${columns.length}" style="text-align: center; padding: 2rem;">
                            Aucun statut ne correspond à votre recherche.
                        </td>
                    </tr>
                `;
                return;
            }
            
            tableBody.innerHTML = rowsData.map((statut, index) => {
                // Ajouter animation avec délai progressif
                let row = `<tr style="animation-delay: ${index * 0.05}s;">`;
                
                columns.forEach(column => {
                    if (column.key === 'name') {
                        // Style spécial pour la cellule du nom
                        row += `
                            <td>
                                <div class="statut-cell">
                                    <div class="statut-icon">
                                        <i class="fas ${statut.logo || 'fa-building'}"></i>
                                    </div>
                                    <div class="statut-info">
                                        <span class="statut-name">${statut.shortName}</span>
                                        <span class="statut-fullname">${statut.name}</span>
                                    </div>
                                </div>
                            </td>
                        `;
                    } else if (column.key === 'responsabilite') {
                        // Mise en évidence pour la responsabilité
                        const isLimited = statut[column.key] && statut[column.key].toLowerCase().includes('limitée');
                        row += `
                            <td class="${isLimited ? 'highlighted-value' : ''}">
                                <span class="info-tooltip" data-tooltip="${getTooltipForProperty(column.key)}">
                                    ${toText(statut[column.key])}
                                    ${isLimited ? ' <i class="fas fa-shield-alt text-green-400 ml-1"></i>' : ''}
                                </span>
                            </td>
                        `;
                    } else if (column.key === 'protectionPatrimoine') {
                        // ========== ÉTOILES + TEXTE ==========
                        const stars = Number.isFinite(statut._pp_stars) ? `
                            <div class="rating-stars" title="${statut._pp_stars}/5">
                                ${generateStarRating(statut._pp_stars)}
                            </div>` : '';
                        row += `
                            <td>
                                <span class="info-tooltip" data-tooltip="${getTooltipForProperty(column.key)}">
                                    ${stars}
                                    <span>${toText(statut._pp_text)}</span>
                                </span>
                            </td>
                        `;
                    } else if (column.key === 'capital') {
                        // Mise en valeur du capital minimal
                        row += `
                            <td class="key-cell">
                                <span class="info-tooltip" data-tooltip="${getTooltipForProperty(column.key)}">
                                    ${toText(statut[column.key])}
                                </span>
                            </td>
                        `;
                    } else {
                        // Style normal pour les autres cellules avec tooltip
                        row += `
                            <td>
                                <span class="info-tooltip" data-tooltip="${getTooltipForProperty(column.key)}">
                                    ${toText(statut[column.key])}
                                </span>
                            </td>
                        `;
                    }
                });
                
                row += '</tr>';
                return row;
            }).join('');
            
            // Ajouter écouteurs d'événements pour les lignes du tableau
            document.querySelectorAll('#table-body tr').forEach((row, index) => {
                // Ajouter un effet de survol plus prononcé
                row.addEventListener('mouseover', () => {
                    row.style.backgroundColor = 'rgba(0, 255, 135, 0.05)';
                });
                row.addEventListener('mouseout', () => {
                    row.style.backgroundColor = '';
                });
                
                // Ajouter clic pour sélectionner pour comparaison
                row.addEventListener('click', () => {
                    const statut = rowsData[index];
                    if (statut) {
                        addToComparison(statut.shortName);
                    }
                });
            });
        }

        // Fonction de rendu initial du tableau
        function renderTable(data) {
            updateTable();
        }
    };

    // Ne pas exécuter automatiquement au chargement pour éviter les conflits
    // L'initialisation se fera via window.initComparatifStatuts
})();
