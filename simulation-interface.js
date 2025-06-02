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
 */

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
        notification.innerHTML = message;
        resultsContainer.insertBefore(notification, resultsContainer.firstChild);
    }

    // Fonction pour nettoyer les anciens messages
    function nettoyerAnciensMesages() {
        document.querySelectorAll('.info-message, .notification').forEach(el => el.remove());
    }

    // Fonction pour gérer l'affichage des résultats de la simulation
    function afficherResultatsSimulation(resultats, pas) {
        const statusDiv = document.getElementById('simulation-status');
        
        // Si aucun résultat viable n'est trouvé
        if (!resultats.classique && !resultats.encheres) {
            if (statusDiv) {
                statusDiv.innerHTML = `
                    <div class="no-results-card">
                        <div class="no-results-icon">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <h3>Aucune solution viable trouvée</h3>
                        <p>Avec vos paramètres actuels, aucun investissement ne permet d'atteindre vos objectifs.</p>
                        <div class="suggestions">
                            <h4>Suggestions pour améliorer votre simulation :</h4>
                            <ul>
                                <li><i class="fas fa-plus-circle"></i> Augmenter votre apport</li>
                                <li><i class="fas fa-percentage"></i> Vérifier le taux d'emprunt</li>
                                <li><i class="fas fa-home"></i> Explorer d'autres villes</li>
                                <li><i class="fas fa-sliders-h"></i> Ajuster vos critères dans les paramètres avancés</li>
                            </ul>
                        </div>
                        <button class="btn btn-primary" onclick="location.reload()">
                            <i class="fas fa-redo"></i> Nouvelle simulation
                        </button>
                    </div>
                `;
                statusDiv.style.display = 'block';
                // Masquer les résultats si aucune solution
                if (resultsContainer) {
                    resultsContainer.classList.add('hidden');
                }
            }
            return;
        }
        
        // Si des résultats sont trouvés, masquer le statusDiv et afficher directement les résultats
        if (statusDiv) {
            statusDiv.style.display = 'none';
        }
        
        // Afficher le conteneur de résultats
        if (resultsContainer) {
            resultsContainer.classList.remove('hidden');
            resultsContainer.classList.add('fade-in');
        }
        
        // Mettre à jour le champ caché de surface
        const surfaceField = document.getElementById('surface');
        if (surfaceField && resultats.classique) {
            surfaceField.value = resultats.classique.surface;
        }
        
        // Animer les valeurs numériques (vérifier que la fonction existe)
        if (typeof window.afficherResultats === 'function') {
            window.afficherResultats(resultats);
        } else if (typeof afficherResultats === 'function') {
            afficherResultats(resultats);
        }
        
        // Créer les graphiques si la fonction existe
        if (typeof window.creerGraphiques === 'function') {
            window.creerGraphiques();
        } else if (typeof creerGraphiques === 'function') {
            creerGraphiques();
        }
        
        // Afficher le bouton de sauvegarde s'il existe
        if (btnSaveSimulation) {
            btnSaveSimulation.classList.remove('hidden');
        }
        
        // Défiler vers les résultats
        if (resultsContainer) {
            resultsContainer.scrollIntoView({ behavior: 'smooth' });
        }
    }

    // Fonction principale pour lancer la simulation
    function lancerSimulation() {
        // Afficher l'indicateur de chargement
        const loadingIndicator = document.querySelector('.loading');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
        }
        
        // Nettoyer les messages précédents
        nettoyerAnciensMesages();
        
        // Vérifier que le simulateur existe
        if (!window.simulateur) {
            afficherNotification(`
                <i class="fas fa-times-circle"></i> 
                <strong>Erreur:</strong> Le moteur de simulation n'est pas disponible.
            `, 'warning');
            
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            return;
        }
        
        try {
            // Récupérer les données du formulaire
            const formData = collecterDonneesFormulaire();
            
            // Charger les paramètres dans le simulateur
            simulateur.chargerParametres(formData);
            
            // Exécuter la simulation
            const resultats = simulateur.simuler();
            
            // Masquer l'indicateur de chargement
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            
            // Vérifier si des résultats ont été trouvés
            if (!resultats.classique && !resultats.encheres) {
                if (typeof afficherToast === 'function') {
                    afficherToast('Aucun prix viable avec ces paramètres.', 'warning');
                }
                return;
            }
            
            // Récupérer le pas de recherche utilisé
            const pasField = document.getElementById('pas-surface');
            const pas = pasField ? pasField.value : 1;
            
            // Afficher les résultats
            afficherResultatsSimulation(resultats, pas);
            
        } catch (error) {
            // Gérer les erreurs éventuelles
            console.error('Erreur lors de la simulation:', error);
            
            // Masquer l'indicateur de chargement
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            
            // Afficher un message d'erreur
            afficherNotification(`
                <i class="fas fa-exclamation-circle"></i> 
                <strong>Erreur lors de la simulation:</strong> ${error.message || 'Une erreur inattendue est survenue.'}
            `, 'warning');
        }
    }

    // Écouteurs d'événements
    // --------------------

    // Affichage/masquage des paramètres avancés
    btnAdvancedToggle.addEventListener('click', function() {
        advancedParams.classList.toggle('hidden');
        advancedParams.classList.toggle('fade-in');
        btnAdvancedToggle.innerHTML = advancedParams.classList.contains('hidden') 
            ? '<i class="fas fa-sliders-h"></i> Paramètres avancés'
            : '<i class="fas fa-times"></i> Masquer les paramètres';
    });

    // Gestion des onglets
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Retirer la classe active de tous les onglets et contenus
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Ajouter la classe active à l'onglet cliqué
            this.classList.add('active');
            
            // Afficher le contenu correspondant
            const tabId = this.getAttribute('data-tab');
            const tabContent = document.getElementById(tabId);
            tabContent.classList.add('active');
            tabContent.classList.add('fade-in');
        });
    });

    // Gestion des accordions
    accordionHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const body = this.nextElementSibling;
            body.classList.toggle('active');
            
            // Changer l'icône
            const icon = this.querySelector('i');
            if (body.classList.contains('active')) {
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-up');
            } else {
                icon.classList.remove('fa-chevron-up');
                icon.classList.add('fa-chevron-down');
            }
        });
    });

    // Lancement de la simulation
    btnSimulate.addEventListener('click', lancerSimulation);

    // Sauvegarde d'une simulation
    if (btnSaveSimulation) {
        btnSaveSimulation.addEventListener('click', function() {
            const nomSimulation = simulationNameInput.value || `Simulation du ${new Date().toLocaleDateString()}`;
            if (simulateur.sauvegarderSimulation(nomSimulation)) {
                // Mettre à jour l'affichage de l'historique
                mettreAJourHistoriqueSimulations();
                // Animation de confirmation
                this.innerHTML = '<i class="fas fa-check"></i> Sauvegardé';
                setTimeout(() => {
                    this.innerHTML = '<i class="fas fa-save"></i> Sauvegarder la simulation';
                }, 2000);
            }
        });
    }

    // Adapter l'interface selon l'appareil
    window.addEventListener('resize', adapterInterfaceSelonAppareil);
    window.addEventListener('DOMContentLoaded', adapterInterfaceSelonAppareil);

    // Fonctions
    // --------------------

    /**
     * Met à jour l'affichage de l'historique des simulations
     */
    function mettreAJourHistoriqueSimulations() {
        if (!historiqueList) return;
        
        // Vider la liste
        historiqueList.innerHTML = '';
        
        // Récupérer l'historique
        const historique = simulateur.getHistoriqueSimulations();
        
        if (historique.length === 0) {
            historiqueContainer.classList.add('hidden');
            return;
        }
        
        // Afficher l'historique
        historiqueContainer.classList.remove('hidden');
        
        // Ajouter chaque simulation à la liste
        historique.forEach(sim => {
            const item = document.createElement('div');
            item.className = 'historique-item';
            item.innerHTML = `
                <div class="historique-header">
                    <h3>${sim.nom}</h3>
                    <span class="historique-date">${sim.date.toLocaleDateString()}</span>
                </div>
                <div class="historique-details">
                    <div class="historique-option">
                        <strong>Achat classique:</strong> 
                        ${formaterMontant(sim.resultats.classique.prixAchat)} 
                        (${sim.resultats.classique.surface.toFixed(1)} m²)
                    </div>
                    <div class="historique-option">
                        <strong>Enchères:</strong> 
                        ${formaterMontant(sim.resultats.encheres.prixAchat)} 
                        (${sim.resultats.encheres.surface.toFixed(1)} m²)
                    </div>
                </div>
                <div class="historique-actions">
                    <button class="btn btn-sm btn-outline historique-btn-details" data-id="${sim.id}">
                        <i class="fas fa-eye"></i> Détails
                    </button>
                    <button class="btn btn-sm btn-outline historique-btn-charger" data-id="${sim.id}">
                        <i class="fas fa-upload"></i> Charger
                    </button>
                </div>
            `;
            
            historiqueList.appendChild(item);
        });
        
        // Ajouter les écouteurs d'événements
        document.querySelectorAll('.historique-btn-details').forEach(btn => {
            btn.addEventListener('click', function() {
                const simId = parseInt(this.getAttribute('data-id'));
                afficherDetailsSimulation(simId);
            });
        });
        
        document.querySelectorAll('.historique-btn-charger').forEach(btn => {
            btn.addEventListener('click', function() {
                const simId = parseInt(this.getAttribute('data-id'));
                chargerSimulation(simId);
            });
        });
    }

    /**
     * Affiche les détails d'une simulation sauvegardée
     * @param {number} simId - ID de la simulation
     */
    function afficherDetailsSimulation(simId) {
        const historique = simulateur.getHistoriqueSimulations();
        const simulation = historique.find(sim => sim.id === simId);
        
        if (!simulation) return;
        
        // Créer une modal pour afficher les détails
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${simulation.nom}</h2>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <h3>Paramètres</h3>
                    <div class="grid grid-2">
                        <div>
                            <p><strong>Apport:</strong> ${formaterMontant(simulation.params.base.apport)}</p>
                            <p><strong>Surface:</strong> ${simulation.params.base.surface} m²</p>
                            <p><strong>Taux:</strong> ${simulation.params.base.taux}%</p>
                            <p><strong>Durée:</strong> ${simulation.params.base.duree} ans</p>
                        </div>
                        <div>
                            <p><strong>Loyer m²:</strong> ${simulation.params.communs.loyerM2} €/m²</p>
                            <p><strong>Vacance:</strong> ${simulation.params.communs.vacanceLocative}%</p>
                            <p><strong>Travaux:</strong> ${simulation.params.communs.travauxM2} €/m²</p>
                        </div>
                    </div>
                    
                    <h3>Résultats</h3>
                    <div class="grid grid-2">
                        <div>
                            <h4>Achat Classique</h4>
                            <p><strong>Prix d'achat:</strong> ${formaterMontant(simulation.resultats.classique.prixAchat)}</p>
                            <p><strong>Surface:</strong> ${simulation.resultats.classique.surface.toFixed(1)} m²</p>
                            <p><strong>Coût total:</strong> ${formaterMontant(simulation.resultats.classique.coutTotal)}</p>
                            <p><strong>Emprunt:</strong> ${formaterMontant(simulation.resultats.classique.emprunt)}</p>
                            <p><strong>Mensualité:</strong> ${formaterMontantMensuel(simulation.resultats.classique.mensualite)}</p>
                            <p><strong>Cash-flow mensuel:</strong> ${formaterMontantMensuel(simulation.resultats.classique.cashFlow)}</p>
                            <p><strong>Cash-flow annuel:</strong> ${formaterMontant(simulation.resultats.classique.cashFlow * 12)}/an</p>
                            <p><strong>Rentabilité:</strong> ${formaterPourcentage(simulation.resultats.classique.rendementNet)}</p>
                        </div>
                        <div>
                            <h4>Vente aux Enchères</h4>
                            <p><strong>Prix d'achat:</strong> ${formaterMontant(simulation.resultats.encheres.prixAchat)}</p>
                            <p><strong>Surface:</strong> ${simulation.resultats.encheres.surface.toFixed(1)} m²</p>
                            <p><strong>Coût total:</strong> ${formaterMontant(simulation.resultats.encheres.coutTotal)}</p>
                            <p><strong>Emprunt:</strong> ${formaterMontant(simulation.resultats.encheres.emprunt)}</p>
                            <p><strong>Mensualité:</strong> ${formaterMontantMensuel(simulation.resultats.encheres.mensualite)}</p>
                            <p><strong>Cash-flow mensuel:</strong> ${formaterMontantMensuel(simulation.resultats.encheres.cashFlow)}</p>
                            <p><strong>Cash-flow annuel:</strong> ${formaterMontant(simulation.resultats.encheres.cashFlow * 12)}/an</p>
                            <p><strong>Rentabilité:</strong> ${formaterPourcentage(simulation.resultats.encheres.rendementNet)}</p>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline modal-close-btn">Fermer</button>
                    <button class="btn btn-primary btn-charger-sim" data-id="${simulation.id}">Charger cette simulation</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Ajouter les écouteurs pour fermer la modal
        modal.querySelector('.modal-close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        modal.querySelector('.modal-close-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Ajouter l'écouteur pour charger la simulation
        modal.querySelector('.btn-charger-sim').addEventListener('click', () => {
            chargerSimulation(simId);
            document.body.removeChild(modal);
        });
        
        // Fermer la modal si on clique en dehors
        modal.addEventListener('click', e => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    /**
     * Charge une simulation sauvegardée
     * @param {number} simId - ID de la simulation
     */
    function chargerSimulation(simId) {
        const historique = simulateur.getHistoriqueSimulations();
        const simulation = historique.find(sim => sim.id === simId);
        
        if (!simulation) return;
        
        // Remplir le formulaire avec les paramètres de la simulation
        document.getElementById('apport').value = simulation.params.base.apport;
        document.getElementById('surface').value = simulation.params.base.surface;
        document.getElementById('taux').value = simulation.params.base.taux;
        document.getElementById('duree').value = simulation.params.base.duree;
        document.getElementById('prix-m2-marche').value = simulation.params.communs.prixM2;
        document.getElementById('loyer-m2').value = simulation.params.communs.loyerM2;
        
        // Paramètres communs
        document.getElementById('frais-bancaires-dossier').value = simulation.params.communs.fraisBancairesDossier;
        document.getElementById('frais-bancaires-compte').value = simulation.params.communs.fraisBancairesCompte;
        document.getElementById('frais-garantie').value = simulation.params.communs.fraisGarantie;
        document.getElementById('taxe-fonciere').value = simulation.params.communs.taxeFonciere;
        document.getElementById('vacance-locative').value = simulation.params.communs.vacanceLocative;
        document.getElementById('travaux-m2').value = simulation.params.communs.travauxM2;
        
        // Récupération du pourcentage d'apport minimum s'il existe
        if (simulation.params.base.pourcentApportMin && document.getElementById('pourcent-apport')) {
            document.getElementById('pourcent-apport').value = simulation.params.base.pourcentApportMin;
        }
        
        // Récupération des paramètres de surface
        if (simulation.params.base.surfaceMax && document.getElementById('surface-max')) {
            document.getElementById('surface-max').value = simulation.params.base.surfaceMax;
        }
        if (simulation.params.base.surfaceMin && document.getElementById('surface-min')) {
            document.getElementById('surface-min').value = simulation.params.base.surfaceMin;
        }
        if (simulation.params.base.pasSurface && document.getElementById('pas-surface')) {
            document.getElementById('pas-surface').value = simulation.params.base.pasSurface;
        }
        
        // Récupération du mode de calcul s'il existe
        if (simulation.params.base.calculationMode) {
            const calculationMode = simulation.params.base.calculationMode;
            const radioButton = document.querySelector(`input[name="calculation-mode"][value="${calculationMode}"]`);
            if (radioButton) {
                radioButton.checked = true;
            }
        }
        
        // Afficher les paramètres avancés
        advancedParams.classList.remove('hidden');
        btnAdvancedToggle.innerHTML = '<i class="fas fa-times"></i> Masquer les paramètres';
        
        // Mettre focus sur le bouton de simulation
        btnSimulate.focus();
        btnSimulate.scrollIntoView({ behavior: 'smooth' });
        
        // Animation pour indiquer que les paramètres ont été chargés
        btnSimulate.classList.add('btn-highlight');
        setTimeout(() => {
            btnSimulate.classList.remove('btn-highlight');
        }, 1000);
        
        // Message de toast pour confirmer
        afficherToast(`Simulation "${simulation.nom}" chargée`, 'success');
    }

    /**
     * Affiche un message toast
     * @param {string} message - Message à afficher
     * @param {string} type - Type de message (info, success, warning, error)
     */
    function afficherToast(message, type = 'info') {
        // Vérifier si le conteneur des toasts existe, sinon le créer
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        
        // Créer le toast
        const toast = document.createElement('div');
        toast.className = `toast toast-${type} fade-in`;
        
        // Icône selon le type
        let icon;
        switch (type) {
            case 'success': icon = 'fa-check-circle'; break;
            case 'warning': icon = 'fa-exclamation-triangle'; break;
            case 'error': icon = 'fa-times-circle'; break;
            default: icon = 'fa-info-circle';
        }
        
        toast.innerHTML = `
            <div class="toast-icon"><i class="fas ${icon}"></i></div>
            <div class="toast-content">${message}</div>
            <button class="toast-close"><i class="fas fa-times"></i></button>
        `;
        
        // Ajouter au conteneur
        toastContainer.appendChild(toast);
        
        // Ajouter écouteur pour fermer
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                toastContainer.removeChild(toast);
            }, 300);
        });
        
        // Disparaître après la durée définie dans la constante
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toast.classList.add('fade-out');
                setTimeout(() => {
                    if (toastContainer.contains(toast)) {
                        toastContainer.removeChild(toast);
                    }
                }, 300);
            }
        }, TOAST_DURATION);
    }

    /**
     * Adapte l'interface selon la taille de l'écran
     */
    function adapterInterfaceSelonAppareil() {
        const estMobile = window.innerWidth < 768;
        
        if (estMobile) {
            document.querySelectorAll('.grid-2, .grid-3').forEach(grid => {
                grid.style.display = 'block';
            });
            document.querySelectorAll('.results-card').forEach(card => {
                card.style.marginBottom = '2rem';
            });
            // Ajouter la classe chart-container aux conteneurs de graphiques
            document.querySelectorAll('.chart-wrapper').forEach(wrapper => {
                wrapper.classList.add('chart-container');
            });
        } else {
            document.querySelectorAll('.grid-2').forEach(grid => {
                grid.style.display = 'grid';
                grid.style.gridTemplateColumns = '1fr 1fr';
            });
            document.querySelectorAll('.grid-3').forEach(grid => {
                grid.style.display = 'grid';
                grid.style.gridTemplateColumns = '1fr 1fr 1fr';
            });
        }
    }

    /**
     * Crée et affiche les graphiques de comparaison
     */
    function creerGraphiques() {
        // Détruire les graphiques existants
        if (comparisonChart) comparisonChart.destroy();
        if (cashflowChart) cashflowChart.destroy();
        if (valuationChart) valuationChart.destroy();
        if (costPieChartClassique) costPieChartClassique.destroy();
        if (costPieChartEncheres) costPieChartEncheres.destroy();
        
        // Récupérer les contextes
        const ctxComparison = document.getElementById('chart-comparison')?.getContext('2d');
        const ctxCashflow = document.getElementById('chart-cashflow')?.getContext('2d');
        const ctxValuation = document.getElementById('chart-valuation')?.getContext('2d');
        const ctxPieClassique = document.getElementById('chart-pie-classique')?.getContext('2d');
        const ctxPieEncheres = document.getElementById('chart-pie-encheres')?.getContext('2d');
        
        // Configuration commune des graphiques
        Chart.defaults.color = 'rgba(255, 255, 255, 0.7)';
        Chart.defaults.font.family = 'Inter';
        
        // Récupérer les données
        const comparisonData = simulateur.getComparisonChartData();
        const cashflowData = simulateur.getAmortissementData();
        const valuationData = simulateur.getEvolutionValeurData(2); // 2% d'appréciation annuelle
        const costPieData = simulateur.getCoutsPieChartData();
        
        // Créer le graphique de comparaison
        if (ctxComparison && comparisonData) {
            comparisonChart = new Chart(ctxComparison, {
                type: 'bar',
                data: comparisonData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: true,
                            text: 'Comparaison des options',
                            color: 'rgba(255, 255, 255, 0.9)',
                            font: {
                                size: 16,
                                weight: 'bold'
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        if (context.datasetIndex === 0 || context.datasetIndex === 1) {
                                            // Pour les prix et coûts, formater en euros
                                            if (context.dataIndex <= 1) {
                                                label += formaterMontant(context.parsed.y);
                                            }
                                            // Pour la rentabilité, formater en pourcentage
                                            else if (context.dataIndex === 2) {
                                                label += formaterPourcentage(context.parsed.y);
                                            }
                                            // Pour le cash-flow, formater en euros par mois
                                            else {
                                                label += formaterMontantMensuel(context.parsed.y);
                                            }
                                        }
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            ticks: {
                                callback: function(value) {
                                    // Formater les valeurs en fonction de l'axe
                                    if (value >= 1000) {
                                        return value / 1000 + 'k€';
                                    }
                                    return value + '€';
                                }
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        }
                    },
                    animation: {
                        duration: CHART_ANIMATION_DURATION,
                        easing: 'easeOutQuart'
                    }
                }
            });
        }
        
        // Créer le graphique d'évolution du cash-flow
        if (ctxCashflow && cashflowData) {
            cashflowChart = new Chart(ctxCashflow, {
                type: 'line',
                data: cashflowData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: true,
                            text: 'Évolution du cash-flow sur la durée du prêt',
                            color: 'rgba(255, 255, 255, 0.9)',
                            font: {
                                size: 16,
                                weight: 'bold'
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += formaterMontant(context.parsed.y);
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            ticks: {
                                callback: function(value) {
                                    return value / 1000 + 'k€';
                                }
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        },
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        }
                    },
                    animation: {
                        duration: CHART_ANIMATION_DURATION,
                        easing: 'easeOutQuart'
                    }
                }
            });
        }
        
        // Créer le graphique d'évolution de la valeur du bien
        if (ctxValuation && valuationData) {
            valuationChart = new Chart(ctxValuation, {
                type: 'line',
                data: valuationData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: true,
                            text: 'Évolution de la valeur patrimoniale',
                            color: 'rgba(255, 255, 255, 0.9)',
                            font: {
                                size: 16,
                                weight: 'bold'
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += formaterMontant(context.parsed.y);
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            ticks: {
                                callback: function(value) {
                                    return value / 1000 + 'k€';
                                }
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        }
                    },
                    animation: {
                        duration: CHART_ANIMATION_DURATION,
                        easing: 'easeOutQuart'
                    }
                }
            });
        }
        
        // Créer les graphiques en camembert pour la répartition des coûts
        if (ctxPieClassique && costPieData) {
            costPieChartClassique = new Chart(ctxPieClassique, {
                type: 'doughnut',
                data: costPieData.classique,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                        },
                        title: {
                            display: true,
                            text: 'Répartition des coûts - Achat Classique',
                            color: 'rgba(255, 255, 255, 0.9)',
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = formaterMontant(context.raw);
                                    // Méthode compatible avec Chart.js v3 et v4
                                    const total = context.chart.getDatasetMeta 
                                        ? context.chart.getDatasetMeta(0).total 
                                        : context.chart._metasets[0].total;
                                    const percentage = ((context.raw / total) * 100).toFixed(1) + '%';
                                    return `${label}: ${value} (${percentage})`;
                                }
                            }
                        }
                    },
                    animation: {
                        duration: CHART_ANIMATION_DURATION,
                        animateRotate: true,
                        animateScale: true
                    }
                }
            });
        }
        
        if (ctxPieEncheres && costPieData) {
            costPieChartEncheres = new Chart(ctxPieEncheres, {
                type: 'doughnut',
                data: costPieData.encheres,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                        },
                        title: {
                            display: true,
                            text: 'Répartition des coûts - Vente aux Enchères',
                            color: 'rgba(255, 255, 255, 0.9)',
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = formaterMontant(context.raw);
                                    // Méthode compatible avec Chart.js v3 et v4
                                    const total = context.chart.getDatasetMeta 
                                        ? context.chart.getDatasetMeta(0).total 
                                        : context.chart._metasets[0].total;
                                    const percentage = ((context.raw / total) * 100).toFixed(1) + '%';
                                    return `${label}: ${value} (${percentage})`;
                                }
                            }
                        }
                    },
                    animation: {
                        duration: CHART_ANIMATION_DURATION,
                        animateRotate: true,
                        animateScale: true
                    }
                }
            });
        }
    }

    /**
     * Récupère toutes les valeurs du formulaire
     * @returns {Object} - Données du formulaire
     */
    function collecterDonneesFormulaire() {
        const formData = {
            // Paramètres de base
            apport: document.getElementById('apport').value,
            surface: document.getElementById('surface').value,
            taux: document.getElementById('taux').value,
            duree: document.getElementById('duree').value,
            
            // CORRECTION: Récupérer le mode de calcul
            calculationMode: document.querySelector('input[name="calculation-mode"]:checked')?.value || 'loyer-mensualite',
            
            // Ajouter le paramètre d'apport minimum
            pourcentApportMin: document.getElementById('pourcent-apport')?.value || 10,
            
            // Paramètres de surface
            surfaceMax: document.getElementById('surface-max')?.value || 120,
            surfaceMin: document.getElementById('surface-min')?.value || 20,
            pasSurface: document.getElementById('pas-surface')?.value || 1,
            
            // Paramètres communs
            fraisBancairesDossier: document.getElementById('frais-bancaires-dossier').value,
            fraisBancairesCompte: document.getElementById('frais-bancaires-compte').value,
            fraisGarantie: document.getElementById('frais-garantie').value,
            taxeFonciere: document.getElementById('taxe-fonciere').value,
            vacanceLocative: document.getElementById('vacance-locative').value,
            loyerM2: document.getElementById('loyer-m2').value,
            travauxM2: document.getElementById('travaux-m2').value,
            prixM2: document.getElementById('prix-m2-marche').value,
            
            // Paramètres fiscaux (s'ils existent)
            tauxPrelevementsSociaux: document.getElementById('taux-prelevements-sociaux')?.value || 17.2,
            tauxMarginalImpot: document.getElementById('taux-marginal-impot')?.value || 30,
            deficitFoncier: document.getElementById('deficit-foncier')?.checked || true,
            
            // Paramètres entretien et charges (s'ils existent)
            entretienAnnuel: document.getElementById('entretien-annuel')?.value || 0.5,
            assurancePNO: document.getElementById('assurance-pno')?.value || 250,
            chargesNonRecuperables: document.getElementById('charges-non-recuperables')?.value || 10,
            
            // Paramètres achat classique
            publiciteFonciere: document.getElementById('publicite-fonciere').value,
            droitsMutation: document.getElementById('droits-mutation').value,
            securiteImmobiliere: document.getElementById('securite-immobiliere').value,
            emolumentsVente: document.getElementById('emoluments-vente').value,
            formalites: document.getElementById('formalites').value,
            debours: document.getElementById('debours').value,
            commissionImmo: document.getElementById('commission-immo').value,
            
            // Paramètres vente aux enchères
            droitsEnregistrement: document.getElementById('droits-enregistrement').value,
            coefMutation: document.getElementById('coef-mutation').value,
            emolumentsPoursuivant1: document.getElementById('emoluments-poursuivant-1').value,
            emolumentsPoursuivant2: document.getElementById('emoluments-poursuivant-2').value,
            emolumentsPoursuivant3: document.getElementById('emoluments-poursuivant-3').value,
            emolumentsPoursuivant4: document.getElementById('emoluments-poursuivant-4').value,
            honorairesAvocatCoef: document.getElementById('honoraires-avocat-coef').value,
            honorairesAvocatTVA: document.getElementById('honoraires-avocat-tva').value,
            publiciteFonciereEncheres: document.getElementById('publicite-fonciere-encheres').value,
            fraisFixes: document.getElementById('frais-fixes').value,
            avocatEnchere: document.getElementById('avocat-enchere').value,
            suiviDossier: document.getElementById('suivi-dossier').value,
            cautionPourcent: document.getElementById('caution-pourcent').value,
            cautionRestituee: document.getElementById('caution-restituee').checked
        };
        
        return formData;
    }

    /**
     * Formate un montant en euros
     * @param {number} montant - Montant à formater
     * @param {number} decimales - Nombre de décimales (par défaut 0)
     * @returns {string} - Montant formaté
     */
    function formaterMontant(montant, decimales = 0) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: decimales,
            maximumFractionDigits: decimales
        }).format(montant);
    }

    /**
     * Formate un pourcentage
     * @param {number} valeur - Valeur à formater
     * @param {number} decimales - Nombre de décimales (par défaut 2)
     * @returns {string} - Pourcentage formaté
     */
    function formaterPourcentage(valeur, decimales = 2) {
        return valeur.toFixed(decimales) + ' %';
    }

    /**
     * Formate un montant mensuel
     * @param {number} montant - Montant à formater
     * @returns {string} - Montant formaté
     */
    function formaterMontantMensuel(montant) {
        return formaterMontant(montant) + '/mois';
    }
    
    /**
     * Formate un montant annuel
     * @param {number} montant - Montant à formater
     * @returns {string} - Montant formaté
     */
    function formaterMontantAnnuel(montant) {
        return formaterMontant(montant) + '/an';
    }

    /**
     * Applique une classe positive ou négative selon la valeur
     * @param {number} valeur - Valeur à évaluer
     * @returns {string} - Classe CSS
     */
    function getClasseValeur(valeur) {
        return valeur >= 0 ? 'positive' : 'negative';
    }

    /**
     * Affiche un montant avec signe
     * @param {number} montant - Montant à formater
     * @returns {string} - Montant formaté avec signe
     */
    function formaterMontantAvecSigne(montant) {
        return (montant > 0 ? '+' : '') + formaterMontant(montant);
    }

    /**
     * Met à jour la classe d'un badge de rentabilité selon sa valeur
     * @param {HTMLElement} element - Élément badge à mettre à jour
     * @param {number} rentabilite - Valeur de rentabilité
     */
    function majClasseRentabilite(element, rentabilite) {
        element.classList.remove('tag-success', 'tag-warning', 'tag-danger');
        
        if (rentabilite >= 7) {
            element.classList.add('tag-success');
        } else if (rentabilite >= 4) {
            element.classList.add('tag-warning');
        } else {
            element.classList.add('tag-danger');
        }
    }

    /**
     * Ajoute une infobulle explicative à un élément
     * @param {HTMLElement} element - L'élément auquel ajouter l'infobulle
     * @param {string} texte - Le texte explicatif de l'infobulle
     */
    function ajouterInfobulle(element, texte) {
        // Vérifier que l'élément existe
        if (!element) return;
        
        // CORRECTION: Vérifier si une infobulle existe déjà
        const existingIcon = element.querySelector('.info-icon') || 
                            element.parentNode?.querySelector('.info-icon');
        if (existingIcon) {
            // Mettre à jour le texte si nécessaire
            const tooltipText = existingIcon.querySelector('.tooltip-text');
            if (tooltipText) tooltipText.textContent = texte;
            return; // Ne pas ajouter une nouvelle icône
        }
        
        // S'assurer que l'élément a une position relative ou absolute
        const position = window.getComputedStyle(element).position;
        if (position !== 'relative' && position !== 'absolute') {
            element.style.position = 'relative';
        }
        
        // Créer l'icône d'info
        const infoIcon = document.createElement('span');
        infoIcon.className = 'info-icon';
        infoIcon.innerHTML = '<i class="fas fa-info-circle"></i>';
        infoIcon.title = texte; // Fallback pour les navigateurs sans support des infobulles personnalisées
        
        // Créer le contenu de l'infobulle
        const tooltipContent = document.createElement('span');
        tooltipContent.className = 'tooltip-text';
        tooltipContent.textContent = texte;
        
        // Ajouter l'infobulle à l'icône
        infoIcon.appendChild(tooltipContent);
        
        // Ajouter l'icône à l'élément ou à son parent
        if (element.tagName === 'LABEL') {
            element.appendChild(infoIcon);
        } else {
            element.parentNode.appendChild(infoIcon);
        }
    }

    /**
     * Configure les infobulles explicatives sur les éléments importants
     */
    function ajouterInfobullesExplicatives() {
        // Liste des éléments avec leurs explications
        const infobulles = {
            // Paramètres de base
            'apport': "Somme que vous pouvez investir initialement. Il s'agit généralement de votre épargne personnelle.",
            'prix-m2-marche': "Prix moyen au mètre carré dans le secteur où vous souhaitez investir. Ce prix détermine directement le budget maximum.",
            'loyer-m2': "Loyer mensuel par mètre carré dans le secteur. Cette valeur permet de calculer vos revenus locatifs.",
            'taux': "Taux d'intérêt annuel de votre crédit immobilier. Plus il est bas, plus votre mensualité sera faible.",
            'duree': "Durée du prêt en années. Une durée plus longue diminue la mensualité mais augmente le coût total des intérêts.",
            
            // Résultats - Cash-flow
            'classique-cashflow': "Le cash-flow est l'argent qui reste dans votre poche chaque mois après avoir payé toutes les charges. C'est un indicateur clé de la performance de votre investissement.",
            'encheres-cashflow': "Le cash-flow est l'argent qui reste dans votre poche chaque mois après avoir payé toutes les charges. C'est un indicateur clé de la performance de votre investissement.",
            
            // Résultats - Rentabilité
            'classique-rentabilite': "La rentabilité nette est le rapport entre le revenu net annuel et le coût total de l'investissement. Une bonne rentabilité est généralement supérieure à 7%.",
            'encheres-rentabilite': "La rentabilité nette est le rapport entre le revenu net annuel et le coût total de l'investissement. Une bonne rentabilité est généralement supérieure à 7%."
        };
        
        // Ajouter les infobulles aux éléments
        for (const [id, texte] of Object.entries(infobulles)) {
            const element = document.getElementById(id);
            if (element) {
                ajouterInfobulle(element, texte);
            }
        }
        
        // Ajouter des infobulles aux labels des champs
        document.querySelectorAll('.form-label').forEach(label => {
            const forAttr = label.getAttribute('for');
            if (forAttr && infobulles[forAttr]) {
                ajouterInfobulle(label, infobulles[forAttr]);
            }
        });
    }

    /**
     * Ajoute un bloc d'explication sur le cash-flow après les résultats
     */
    function ajouterExplicationCashFlow() {
        // Vérifier si le conteneur de résultats existe et est visible
        if (!resultsContainer || resultsContainer.classList.contains('hidden')) return;
        
        // Vérifier si l'explication existe déjà
        if (document.getElementById('cashflow-explanation')) return;
        
        // Créer le bloc d'explication
        const explanation = document.createElement('div');
        explanation.id = 'cashflow-explanation';
        explanation.className = 'cashflow-explanation fade-in';
        explanation.innerHTML = `
            <h3><i class="fas fa-question-circle mr-2"></i> Comprendre le cash-flow</h3>
            <p>Le cash-flow représente l'argent qui reste dans votre poche chaque mois après avoir payé toutes les charges liées à votre investissement immobilier. C'est un indicateur essentiel de la performance de votre investissement.</p>
            
            <div class="cashflow-formula">
                <strong>Cash-flow mensuel</strong> = Loyer net - Mensualité - Taxe foncière/12 - Charges non récupérables - Entretien - Assurance PNO/12
            </div>
            
            <p>Le cash-flow annuel est simplement le cash-flow mensuel multiplié par 12. Il permet d'avoir une vision plus globale de votre investissement sur une année complète.</p>
            
            <div class="terms-grid">
                <div class="term-card">
                    <div class="term-title">Cash-flow positif</div>
                    <div class="term-definition">Votre investissement génère plus de revenus que de charges. Il s'autofinance et vous procure un revenu complémentaire.</div>
                </div>
                <div class="term-card">
                    <div class="term-title">Cash-flow négatif</div>
                    <div class="term-definition">Votre investissement ne s'autofinance pas complètement. Vous devez compléter chaque mois avec vos fonds personnels.</div>
                </div>
                <div class="term-card">
                    <div class="term-title">Cash-flow après impôt</div>
                    <div class="term-definition">Le cash-flow après prise en compte de l'impact fiscal (économie d'impôt ou impôt supplémentaire).</div>
                </div>
            </div>
            
            <p class="mt-2">Un cash-flow légèrement négatif n'est pas forcément un mauvais investissement, surtout si vous visez une plus-value à la revente ou si vous êtes dans une logique patrimoniale sur le long terme.</p>
            
            <button id="btn-hide-explanation" class="btn btn-sm btn-outline mt-2">Masquer cette explication</button>
        `;
        
        // Ajouter le bloc après le conteneur de résultats
        resultsContainer.insertAdjacentElement('afterend', explanation);
        
        // Ajouter un écouteur pour masquer l'explication
        document.getElementById('btn-hide-explanation').addEventListener('click', function() {
            explanation.classList.add('hidden');
        });
    }

    /**
     * Ajoute un bouton pour afficher/masquer les explications sur le cash-flow
     */
    function ajouterBoutonExplication() {
        // Vérifier si le conteneur de résultats existe et est visible
        if (!resultsContainer || resultsContainer.classList.contains('hidden')) return;
        
        // Vérifier si le bouton existe déjà
        if (document.getElementById('btn-show-explanation')) return;
        
        // Créer le bouton
        const button = document.createElement('button');
        button.id = 'btn-show-explanation';
        button.className = 'btn btn-outline mt-4 mb-4';
        button.innerHTML = '<i class="fas fa-info-circle"></i> Comprendre le cash-flow';
        button.style.display = 'block';
        button.style.margin = '1rem auto';
        
        // Ajouter le bouton après le conteneur de résultats
        resultsContainer.insertAdjacentElement('afterend', button);
        
        // Ajouter un écouteur pour afficher/masquer l'explication
        button.addEventListener('click', function() {
            const explanation = document.getElementById('cashflow-explanation');
            if (!explanation) {
                // SUPPRESSION: Ne pas générer dynamiquement l'explication
                // Utiliser uniquement le panneau explicatif existant dans immoSim.html
                const existingExplanation = document.getElementById('cash-flow-explanation');
                if (existingExplanation) {
                    existingExplanation.classList.remove('hidden');
                    this.innerHTML = '<i class="fas fa-times-circle"></i> Masquer l\'explication';
                    existingExplanation.scrollIntoView({ behavior: 'smooth' });
                }
            } else if (explanation.classList.contains('hidden')) {
                explanation.classList.remove('hidden');
                this.innerHTML = '<i class="fas fa-times-circle"></i> Masquer l\'explication';
            } else {
                explanation.classList.add('hidden');
                this.innerHTML = '<i class="fas fa-info-circle"></i> Comprendre le cash-flow';
            }
        });
    }

    /**
     * Affiche les résultats de la simulation
     * @param {Object} resultats - Résultats de la simulation
     */
    function afficherResultats(resultats) {
        const { classique, encheres } = resultats;
        
        // Vérifier si des résultats ont été trouvés
        if (!classique || !encheres) {
            afficherToast('Impossible de trouver une solution avec les paramètres actuels. Veuillez ajuster vos critères.', 'error');
            return;
        }
        
        // Affichage des résultats pour l'achat classique
        // Nouveaux éléments pour budget et surface
        document.getElementById('classique-budget-max').textContent = formaterMontant(classique.prixAchat);
        document.getElementById('classique-surface-max').textContent = classique.surface.toFixed(1) + " m²";
        
        // Prix au m² final (si l'élément existe)
        const prixM2Classique = classique.prixAchat / classique.surface;
        if (document.getElementById('classique-prix-m2-final')) {
            document.getElementById('classique-prix-m2-final').textContent = 
                "Soit " + formaterMontant(prixM2Classique, 0) + "/m²";
        }
        
        // Anciens éléments et détails
        document.getElementById('classique-prix-achat').textContent = formaterMontant(classique.prixAchat);
        document.getElementById('classique-frais-notaire').textContent = formaterMontant(classique.fraisNotaire);
        document.getElementById('classique-commission').textContent = formaterMontant(classique.commission);
        document.getElementById('classique-travaux').textContent = formaterMontant(classique.travaux);
        document.getElementById('classique-frais-bancaires').textContent = formaterMontant(classique.fraisBancaires);
        document.getElementById('classique-total').textContent = formaterMontant(classique.coutTotal);
        document.getElementById('classique-mensualite').textContent = formaterMontantMensuel(classique.mensualite);
        document.getElementById('classique-loyer-net').textContent = formaterMontantMensuel(classique.loyerNet);
        
        // Cash-flow mensuel et annuel
        const cashflowClassique = document.getElementById('classique-cashflow');
        if (cashflowClassique) {
            // Créer un conteneur pour le cash-flow mensuel et annuel
            const cashflowContainer = document.createElement('div');
            cashflowContainer.className = 'cashflow-container';
            
            // Cash-flow mensuel
            const cashflowMensuel = document.createElement('div');
            cashflowMensuel.className = 'cashflow-monthly ' + getClasseValeur(classique.cashFlow);
            cashflowMensuel.textContent = formaterMontantMensuel(classique.cashFlow);
            
            // Cash-flow annuel
            const cashflowAnnuel = document.createElement('div');
            cashflowAnnuel.className = 'cashflow-annual ' + getClasseValeur(classique.cashFlow);
            cashflowAnnuel.textContent = formaterMontantAnnuel(classique.cashFlow * 12);
            
            // Ajouter au conteneur
            cashflowContainer.appendChild(cashflowMensuel);
            cashflowContainer.appendChild(cashflowAnnuel);
            
            // Remplacer le contenu actuel
            cashflowClassique.parentNode.replaceChild(cashflowContainer, cashflowClassique);
        }
        
        // Affichage de la marge loyer-dette
        const margeClassique = document.getElementById('classique-marge');
        if (margeClassique) {
            margeClassique.textContent = formaterMontantMensuel(classique.marge);
            margeClassique.className = getClasseValeur(classique.marge);
        }
        
        // Animation des rentabilités
        const classiqueRentabilite = document.getElementById('classique-rentabilite');
        const encheresRentabilite = document.getElementById('encheres-rentabilite');
        
        if (classiqueRentabilite && encheresRentabilite) {
            // Récupérer les valeurs de rentabilité
            const rentClassique = classique.rendementNet;
            const rentEncheres = encheres.rendementNet;
            
            classiqueRentabilite.textContent = formaterPourcentage(rentClassique);
            encheresRentabilite.textContent = formaterPourcentage(rentEncheres);
            
            // Mettre à jour les classes des badges selon le niveau de rentabilité
            majClasseRentabilite(classiqueRentabilite.parentElement, rentClassique);
            majClasseRentabilite(encheresRentabilite.parentElement, rentEncheres);
        }
        
        // Affichage des données fiscales pour l'achat classique si les éléments existent
        if (document.getElementById('classique-revenu-foncier')) {
            document.getElementById('classique-revenu-foncier').textContent = formaterMontant(classique.revenuFoncier);
            document.getElementById('classique-impact-fiscal').textContent = formaterMontant(classique.impactFiscal);
            
            // Cash-flow après impôt mensuel et annuel
            const cashflowApresImpotMensuel = classique.cashFlow + (classique.impactFiscal / 12);
            const cashflowApresImpotAnnuel = cashflowApresImpotMensuel * 12;
            
            const cashflowApresImpot = document.getElementById('classique-cashflow-apres-impot');
            if (cashflowApresImpot) {
                // Créer un conteneur pour le cash-flow après impôt
                const cashflowContainer = document.createElement('div');
                cashflowContainer.className = 'cashflow-container';
                
                // Cash-flow mensuel après impôt
                const cashflowMensuel = document.createElement('div');
                cashflowMensuel.className = 'cashflow-monthly ' + getClasseValeur(cashflowApresImpotMensuel);
                cashflowMensuel.textContent = formaterMontantMensuel(cashflowApresImpotMensuel);
                
                // Cash-flow annuel après impôt
                const cashflowAnnuel = document.createElement('div');
                cashflowAnnuel.className = 'cashflow-annual ' + getClasseValeur(cashflowApresImpotAnnuel);
                cashflowAnnuel.textContent = formaterMontantAnnuel(cashflowApresImpotAnnuel);
                
                // Ajouter au conteneur
                cashflowContainer.appendChild(cashflowMensuel);
                cashflowContainer.appendChild(cashflowAnnuel);
                
                // Remplacer le contenu actuel
                cashflowApresImpot.parentNode.replaceChild(cashflowContainer, cashflowApresImpot);
            }
        }
        
        // Affichage des résultats pour la vente aux enchères
        // Nouveaux éléments pour budget et surface
        document.getElementById('encheres-budget-max').textContent = formaterMontant(encheres.prixAchat);
        document.getElementById('encheres-surface-max').textContent = encheres.surface.toFixed(1) + " m²";
        
        // Prix au m² final pour enchères (si l'élément existe)
        const prixM2Encheres = encheres.prixAchat / encheres.surface;
        if (document.getElementById('encheres-prix-m2-final')) {
            document.getElementById('encheres-prix-m2-final').textContent = 
                "Soit " + formaterMontant(prixM2Encheres, 0) + "/m²";
        }
        
        // Anciens éléments et détails
        document.getElementById('encheres-prix-achat').textContent = formaterMontant(encheres.prixAchat);
        document.getElementById('encheres-droits').textContent = formaterMontant(encheres.droitsEnregistrement);
        document.getElementById('encheres-emoluments').textContent = formaterMontant(encheres.emolumentsPoursuivant);
        document.getElementById('encheres-honoraires').textContent = formaterMontant(encheres.honorairesAvocat);
        document.getElementById('encheres-publicite').textContent = formaterMontant(encheres.publiciteFonciere);
        document.getElementById('encheres-frais-divers').textContent = formaterMontant(encheres.fraisDivers);
        document.getElementById('encheres-travaux').textContent = formaterMontant(encheres.travaux);
        document.getElementById('encheres-frais-bancaires').textContent = formaterMontant(encheres.fraisBancaires);
        document.getElementById('encheres-total').textContent = formaterMontant(encheres.coutTotal);
        document.getElementById('encheres-mensualite').textContent = formaterMontantMensuel(encheres.mensualite);
        document.getElementById('encheres-loyer-net').textContent = formaterMontantMensuel(encheres.loyerNet);
        
        // Cash-flow mensuel et annuel pour les enchères
        const cashflowEncheres = document.getElementById('encheres-cashflow');
        if (cashflowEncheres) {
            // Créer un conteneur pour le cash-flow mensuel et annuel
            const cashflowContainer = document.createElement('div');
            cashflowContainer.className = 'cashflow-container';
            
            // Cash-flow mensuel
            const cashflowMensuel = document.createElement('div');
            cashflowMensuel.className = 'cashflow-monthly ' + getClasseValeur(encheres.cashFlow);
            cashflowMensuel.textContent = formaterMontantMensuel(encheres.cashFlow);
            
            // Cash-flow annuel
            const cashflowAnnuel = document.createElement('div');
            cashflowAnnuel.className = 'cashflow-annual ' + getClasseValeur(encheres.cashFlow);
            cashflowAnnuel.textContent = formaterMontantAnnuel(encheres.cashFlow * 12);
            
            // Ajouter au conteneur
            cashflowContainer.appendChild(cashflowMensuel);
            cashflowContainer.appendChild(cashflowAnnuel);
            
            // Remplacer le contenu actuel
            cashflowEncheres.parentNode.replaceChild(cashflowContainer, cashflowEncheres);
        }
        
        // Affichage de la marge loyer-dette
        const margeEncheres = document.getElementById('encheres-marge');
        if (margeEncheres) {
            margeEncheres.textContent = formaterMontantMensuel(encheres.marge);
            margeEncheres.className = getClasseValeur(encheres.marge);
        }
        
        // Affichage des données fiscales pour les enchères si les éléments existent
        if (document.getElementById('encheres-revenu-foncier')) {
            document.getElementById('encheres-revenu-foncier').textContent = formaterMontant(encheres.revenuFoncier);
            document.getElementById('encheres-impact-fiscal').textContent = formaterMontant(encheres.impactFiscal);
            
            // Cash-flow après impôt mensuel et annuel
            const cashflowApresImpotMensuel = encheres.cashFlow + (encheres.impactFiscal / 12);
            const cashflowApresImpotAnnuel = cashflowApresImpotMensuel * 12;
            
            const cashflowApresImpot = document.getElementById('encheres-cashflow-apres-impot');
            if (cashflowApresImpot) {
                // Créer un conteneur pour le cash-flow après impôt
                const cashflowContainer = document.createElement('div');
                cashflowContainer.className = 'cashflow-container';
                
                // Cash-flow mensuel après impôt
                const cashflowMensuel = document.createElement('div');
                cashflowMensuel.className = 'cashflow-monthly ' + getClasseValeur(cashflowApresImpotMensuel);
                cashflowMensuel.textContent = formaterMontantMensuel(cashflowApresImpotMensuel);
                
                // Cash-flow annuel après impôt
                const cashflowAnnuel = document.createElement('div');
                cashflowAnnuel.className = 'cashflow-annual ' + getClasseValeur(cashflowApresImpotAnnuel);
                cashflowAnnuel.textContent = formaterMontantAnnuel(cashflowApresImpotAnnuel);
                
                // Ajouter au conteneur
                cashflowContainer.appendChild(cashflowMensuel);
                cashflowContainer.appendChild(cashflowAnnuel);
                
                // Remplacer le contenu actuel
                cashflowApresImpot.parentNode.replaceChild(cashflowContainer, cashflowApresImpot);
            }
        }
        
        // Comparatif
        document.getElementById('comp-classique-prix').textContent = formaterMontant(classique.prixAchat);
        document.getElementById('comp-encheres-prix').textContent = formaterMontant(encheres.prixAchat);
        
        const diffPrix = encheres.prixAchat - classique.prixAchat;
        const compPrixDiff = document.getElementById('comp-prix-diff');
        compPrixDiff.textContent = formaterMontantAvecSigne(diffPrix);
        compPrixDiff.className = diffPrix < 0 ? 'positive' : diffPrix > 0 ? 'negative' : '';
        
        document.getElementById('comp-classique-total').textContent = formaterMontant(classique.coutTotal);
        document.getElementById('comp-encheres-total').textContent = formaterMontant(encheres.coutTotal);
        
        const diffTotal = encheres.coutTotal - classique.coutTotal;
        const compTotalDiff = document.getElementById('comp-total-diff');
        compTotalDiff.textContent = formaterMontantAvecSigne(diffTotal);
        compTotalDiff.className = diffTotal < 0 ? 'positive' : diffTotal > 0 ? 'negative' : '';
        
        document.getElementById('comp-classique-loyer').textContent = formaterMontant(classique.loyerBrut);
        document.getElementById('comp-encheres-loyer').textContent = formaterMontant(encheres.loyerBrut);
        
        const diffLoyer = encheres.loyerBrut - classique.loyerBrut;
        const compLoyerDiff = document.getElementById('comp-loyer-diff');
        compLoyerDiff.textContent = formaterMontantAvecSigne(diffLoyer);
        compLoyerDiff.className = diffLoyer > 0 ? 'positive' : diffLoyer < 0 ? 'negative' : '';
        
        document.getElementById('comp-classique-rentabilite').textContent = formaterPourcentage(classique.rendementNet);
        document.getElementById('comp-encheres-rentabilite').textContent = formaterPourcentage(encheres.rendementNet);
        
        const diffRentabilite = encheres.rendementNet - classique.rendementNet;
        const compRentabiliteDiff = document.getElementById('comp-rentabilite-diff');
        compRentabiliteDiff.textContent = formaterPourcentage(diffRentabilite, 2);
        compRentabiliteDiff.className = diffRentabilite > 0 ? 'positive' : diffRentabilite < 0 ? 'negative' : '';
        
        document.getElementById('comp-classique-cashflow').textContent = formaterMontantAvecSigne(classique.cashFlow);
        document.getElementById('comp-encheres-cashflow').textContent = formaterMontantAvecSigne(encheres.cashFlow);
        
        const diffCashflow = encheres.cashFlow - classique.cashFlow;
        const compCashflowDiff = document.getElementById('comp-cashflow-diff');
        compCashflowDiff.textContent = formaterMontantAvecSigne(diffCashflow);
        compCashflowDiff.className = diffCashflow > 0 ? 'positive' : diffCashflow < 0 ? 'negative' : '';
        
        // Mettre à jour les avantages en fonction des résultats réels
        let avantagesClassique = [];
        let avantagesEncheres = [];
        
        // Comparer les prix
        if (classique.prixAchat > encheres.prixAchat) {
            avantagesEncheres.push("Prix d'achat plus avantageux");
        } else {
            avantagesClassique.push("Prix d'achat plus avantageux");
        }
        
        // Comparer les coûts totaux
        if (classique.coutTotal > encheres.coutTotal) {
            avantagesEncheres.push("Coût total inférieur");
        } else {
            avantagesClassique.push("Coût total inférieur");
        }
        
        // Comparer les rendements
        if (classique.rendementNet < encheres.rendementNet) {
            avantagesEncheres.push("Meilleure rentabilité");
        } else {
            avantagesClassique.push("Meilleure rentabilité");
        }
        
        // Comparer les cash-flows
        if (classique.cashFlow < encheres.cashFlow) {
            avantagesEncheres.push("Cash-flow mensuel supérieur");
        } else {
            avantagesClassique.push("Cash-flow mensuel supérieur");
        }
        
        // Avantages fixes
        avantagesClassique.push("Processus d'achat plus simple");
        avantagesClassique.push("Risques juridiques limités");
        avantagesClassique.push("Délais plus courts");
        
        avantagesEncheres.push("Potentiel de valorisation supérieur");
        avantagesEncheres.push("Absence de négociation");
        avantagesEncheres.push("Possibilité de trouver des biens sous-évalués");
        
        // Afficher les avantages
        document.getElementById('classique-avantages').textContent = "Points forts: " + avantagesClassique.join(", ");
        document.getElementById('encheres-avantages').textContent = "Points forts: " + avantagesEncheres.join(", ");
        
        // Ajouter les infobulles explicatives
        setTimeout(ajouterInfobullesExplicatives, 500);
        
        // Ajouter le bouton d'explication
        setTimeout(ajouterBoutonExplication, 500);
        
        // Remplir le tableau comparatif détaillé
        if (classique && encheres) {
            remplirTableauComparatifDetaille(classique, encheres);
        }
    }

   
/**
 * Remplit le tableau comparatif détaillé
 * @param {Object} classique - Résultats achat classique
 * @param {Object} encheres - Résultats vente aux enchères
 */
function remplirTableauComparatifDetaille(classique, encheres) {
    // COÛTS D'ACQUISITION
    document.getElementById('comp-classique-prix').textContent = formaterMontant(classique.prixAchat);
    document.getElementById('comp-encheres-prix').textContent = formaterMontant(encheres.prixAchat);
    majDifference('comp-prix-diff', encheres.prixAchat - classique.prixAchat);
    
    document.getElementById('comp-classique-frais-notaire').textContent = formaterMontant(classique.fraisNotaire);
    document.getElementById('comp-encheres-droits').textContent = formaterMontant(encheres.droitsEnregistrement);
    majDifference('comp-frais-diff', encheres.droitsEnregistrement - classique.fraisNotaire);
    
    document.getElementById('comp-classique-commission').textContent = formaterMontant(classique.commission);
    const honorairesEncheres = (encheres.honorairesAvocat || 0) + (encheres.fraisDivers || 0);
    document.getElementById('comp-encheres-honoraires').textContent = formaterMontant(honorairesEncheres);
    majDifference('comp-commission-diff', honorairesEncheres - classique.commission);
    
    document.getElementById('comp-classique-travaux').textContent = formaterMontant(classique.travaux);
    document.getElementById('comp-encheres-travaux').textContent = formaterMontant(encheres.travaux);
    majDifference('comp-travaux-diff', encheres.travaux - classique.travaux);
    
    document.getElementById('comp-classique-frais-bancaires').textContent = formaterMontant(classique.fraisBancaires);
    document.getElementById('comp-encheres-frais-bancaires').textContent = formaterMontant(encheres.fraisBancaires);
    majDifference('comp-frais-bancaires-diff', encheres.fraisBancaires - classique.fraisBancaires);
    
    document.getElementById('comp-classique-total').textContent = formaterMontant(classique.coutTotal);
    document.getElementById('comp-encheres-total').textContent = formaterMontant(encheres.coutTotal);
    majDifference('comp-total-diff', encheres.coutTotal - classique.coutTotal);
    
    // FINANCEMENT
    const apport = simulateur.params.base.apport;
    document.getElementById('comp-classique-apport').textContent = formaterMontant(apport);
    document.getElementById('comp-encheres-apport').textContent = formaterMontant(apport);
    document.getElementById('comp-apport-diff').textContent = '0 €';
    
    document.getElementById('comp-classique-emprunt').textContent = formaterMontant(classique.emprunt);
    document.getElementById('comp-encheres-emprunt').textContent = formaterMontant(encheres.emprunt);
    majDifference('comp-emprunt-diff', encheres.emprunt - classique.emprunt);
    
    document.getElementById('comp-classique-mensualite').textContent = formaterMontantMensuel(classique.mensualite);
    document.getElementById('comp-encheres-mensualite').textContent = formaterMontantMensuel(encheres.mensualite);
    majDifference('comp-mensualite-diff', encheres.mensualite - classique.mensualite);
    
    // REVENUS
    document.getElementById('comp-classique-surface').textContent = classique.surface.toFixed(1) + ' m²';
    document.getElementById('comp-encheres-surface').textContent = encheres.surface.toFixed(1) + ' m²';
    const surfaceDiff = encheres.surface - classique.surface;
    document.getElementById('comp-surface-diff').textContent = (surfaceDiff > 0 ? '+' : '') + surfaceDiff.toFixed(1) + ' m²';
    document.getElementById('comp-surface-diff').className = surfaceDiff >= 0 ? 'positive' : 'negative';
    
    document.getElementById('comp-classique-loyer').textContent = formaterMontant(classique.loyerBrut);
    document.getElementById('comp-encheres-loyer').textContent = formaterMontant(encheres.loyerBrut);
    majDifference('comp-loyer-diff', encheres.loyerBrut - classique.loyerBrut);
    
    const vacanceClassique = classique.loyerBrut - classique.loyerNet;
    const vacanceEncheres = encheres.loyerBrut - encheres.loyerNet;
    document.getElementById('comp-classique-vacance').textContent = formaterMontant(-vacanceClassique);
    document.getElementById('comp-encheres-vacance').textContent = formaterMontant(-vacanceEncheres);
    majDifference('comp-vacance-diff', -(vacanceEncheres - vacanceClassique));
    
    document.getElementById('comp-classique-loyer-net').textContent = formaterMontant(classique.loyerNet);
    document.getElementById('comp-encheres-loyer-net').textContent = formaterMontant(encheres.loyerNet);
    majDifference('comp-loyer-net-diff', encheres.loyerNet - classique.loyerNet);
    
    // CHARGES MENSUELLES
    document.getElementById('comp-classique-mensualite2').textContent = formaterMontant(-classique.mensualite);
    document.getElementById('comp-encheres-mensualite2').textContent = formaterMontant(-encheres.mensualite);
    majDifference('comp-mensualite2-diff', -(encheres.mensualite - classique.mensualite));
    
    const taxeClassique = classique.taxeFonciere / 12;
    const taxeEncheres = encheres.taxeFonciere / 12;
    document.getElementById('comp-classique-taxe').textContent = formaterMontant(-taxeClassique);
    document.getElementById('comp-encheres-taxe').textContent = formaterMontant(-taxeEncheres);
    majDifference('comp-taxe-diff', -(taxeEncheres - taxeClassique));
    
    const chargesClassique = classique.chargesNonRecuperables / 12;
    const chargesEncheres = encheres.chargesNonRecuperables / 12;
    document.getElementById('comp-classique-charges').textContent = formaterMontant(-chargesClassique);
    document.getElementById('comp-encheres-charges').textContent = formaterMontant(-chargesEncheres);
    majDifference('comp-charges-diff', -(chargesEncheres - chargesClassique));
    
    const entretienClassique = classique.entretienAnnuel / 12;
    const entretienEncheres = encheres.entretienAnnuel / 12;
    document.getElementById('comp-classique-entretien').textContent = formaterMontant(-entretienClassique);
    document.getElementById('comp-encheres-entretien').textContent = formaterMontant(-entretienEncheres);
    majDifference('comp-entretien-diff', -(entretienEncheres - entretienClassique));
    
    const assuranceClassique = classique.assurancePNO / 12;
    const assuranceEncheres = encheres.assurancePNO / 12;
    document.getElementById('comp-classique-assurance').textContent = formaterMontant(-assuranceClassique);
    document.getElementById('comp-encheres-assurance').textContent = formaterMontant(-assuranceEncheres);
    majDifference('comp-assurance-diff', -(assuranceEncheres - assuranceClassique));
    
    const totalChargesClassique = classique.mensualite + taxeClassique + chargesClassique + entretienClassique + assuranceClassique;
    const totalChargesEncheres = encheres.mensualite + taxeEncheres + chargesEncheres + entretienEncheres + assuranceEncheres;
    document.getElementById('comp-classique-total-charges').textContent = formaterMontant(-totalChargesClassique);
    document.getElementById('comp-encheres-total-charges').textContent = formaterMontant(-totalChargesEncheres);
    majDifference('comp-total-charges-diff', -(totalChargesEncheres - totalChargesClassique));
    
    // FISCALITÉ
    if (document.getElementById('comp-classique-cashflow-avant')) {
        // Cash-flow avant impôt
        document.getElementById('comp-classique-cashflow-avant').textContent = formaterMontantAvecSigne(classique.cashFlow);
        document.getElementById('comp-encheres-cashflow-avant').textContent = formaterMontantAvecSigne(encheres.cashFlow);
        majDifference('comp-cashflow-avant-diff', encheres.cashFlow - classique.cashFlow);
        
        // Impôt mensuel
        if (classique.impot !== undefined && encheres.impot !== undefined) {
            const impotMensuelClassique = classique.impot / 12;
            const impotMensuelEncheres = encheres.impot / 12;
            document.getElementById('comp-classique-impot-mensuel').textContent = formaterMontant(-impotMensuelClassique);
            document.getElementById('comp-encheres-impot-mensuel').textContent = formaterMontant(-impotMensuelEncheres);
            majDifference('comp-impot-mensuel-diff', -(impotMensuelEncheres - impotMensuelClassique));
        }
    }
    
    // RÉSULTATS FINAUX
    // Priorité 1: Utiliser cashFlowApresImpot si disponible
    if (classique.cashFlowApresImpot !== undefined && encheres.cashFlowApresImpot !== undefined) {
        document.getElementById('comp-classique-cashflow').textContent = formaterMontantAvecSigne(classique.cashFlowApresImpot);
        document.getElementById('comp-encheres-cashflow').textContent = formaterMontantAvecSigne(encheres.cashFlowApresImpot);
        majDifference('comp-cashflow-diff', encheres.cashFlowApresImpot - classique.cashFlowApresImpot);
        
        document.getElementById('comp-classique-cashflow-annuel').textContent = formaterMontantAvecSigne(classique.cashFlowApresImpot * 12);
        document.getElementById('comp-encheres-cashflow-annuel').textContent = formaterMontantAvecSigne(encheres.cashFlowApresImpot * 12);
        majDifference('comp-cashflow-annuel-diff', (encheres.cashFlowApresImpot - classique.cashFlowApresImpot) * 12);
    }
    // Priorité 2: Récupérer depuis le DOM
    else {
        const cashflowClassiqueElement = document.querySelector('#classique-cashflow .cashflow-monthly') || 
                                        document.querySelector('.cashflow-container .cashflow-monthly');
        const cashflowEncheresElement = document.querySelector('#encheres-cashflow .cashflow-monthly') || 
                                       document.querySelector('.results-card:nth-child(2) .cashflow-container .cashflow-monthly');
        
        if (cashflowClassiqueElement && cashflowEncheresElement) {
            document.getElementById('comp-classique-cashflow').textContent = cashflowClassiqueElement.textContent.replace('/mois', '');
            document.getElementById('comp-encheres-cashflow').textContent = cashflowEncheresElement.textContent.replace('/mois', '');
            
            const cashflowClassiqueAnnuelElement = document.querySelector('#classique-cashflow .cashflow-annual') || 
                                                   document.querySelector('.cashflow-container .cashflow-annual');
            const cashflowEncheresAnnuelElement = document.querySelector('#encheres-cashflow .cashflow-annual') || 
                                                  document.querySelector('.results-card:nth-child(2) .cashflow-container .cashflow-annual');
            
            if (cashflowClassiqueAnnuelElement && cashflowEncheresAnnuelElement) {
                document.getElementById('comp-classique-cashflow-annuel').textContent = cashflowClassiqueAnnuelElement.textContent.replace('/an', '');
                document.getElementById('comp-encheres-cashflow-annuel').textContent = cashflowEncheresAnnuelElement.textContent.replace('/an', '');
            }
            
            const extractMontant = (text) => {
                const match = text.match(/(-?\d[\d\s]*(?:,\d+)?)\s*€/);
                if (match) {
                    return parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
                }
                return 0;
            };
            
            const cashflowClassiqueValue = extractMontant(cashflowClassiqueElement.textContent);
            const cashflowEncheresValue = extractMontant(cashflowEncheresElement.textContent);
            const cashflowDiff = cashflowEncheresValue - cashflowClassiqueValue;
            
            majDifference('comp-cashflow-diff', cashflowDiff);
            majDifference('comp-cashflow-annuel-diff', cashflowDiff * 12);
        }
        // Priorité 3: Fallback sur cashFlow simple
        else {
            document.getElementById('comp-classique-cashflow').textContent = formaterMontantAvecSigne(classique.cashFlow);
            document.getElementById('comp-encheres-cashflow').textContent = formaterMontantAvecSigne(encheres.cashFlow);
            majDifference('comp-cashflow-diff', encheres.cashFlow - classique.cashFlow);
            
            document.getElementById('comp-classique-cashflow-annuel').textContent = formaterMontantAvecSigne(classique.cashFlow * 12);
            document.getElementById('comp-encheres-cashflow-annuel').textContent = formaterMontantAvecSigne(encheres.cashFlow * 12);
            majDifference('comp-cashflow-annuel-diff', (encheres.cashFlow - classique.cashFlow) * 12);
        }
    }
    
    document.getElementById('comp-classique-rentabilite').textContent = formaterPourcentage(classique.rendementNet);
    document.getElementById('comp-encheres-rentabilite').textContent = formaterPourcentage(encheres.rendementNet);
    majDifference('comp-rentabilite-diff', encheres.rendementNet - classique.rendementNet, true);
    
    // Générer le résumé lisible
    genererResumeLisible(classique, encheres);
    
    // Ajouter les barres visuelles
    ajouterBarresVisuelles(classique, encheres);
}

    /**
     * Met à jour un élément de différence avec la bonne classe CSS
     */
    function majDifference(elementId, difference, isPourcentage = false) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        if (isPourcentage) {
            element.textContent = (difference > 0 ? '+' : '') + difference.toFixed(2) + ' %';
        } else {
            element.textContent = formaterMontantAvecSigne(difference);
        }
        element.className = difference > 0 ? 'positive' : difference < 0 ? 'negative' : '';
    }

    /**
     * Génère un résumé lisible pour les non-financiers
     */
    function genererResumeLisible(classique, encheres) {
        // Utiliser les valeurs synchronisées du DOM pour le cash-flow
        const cashflowClassiqueElement = document.querySelector('#classique-cashflow .cashflow-monthly');
        const cashflowEncheresElement = document.querySelector('#encheres-cashflow .cashflow-monthly');
        
        let cashflowDiff = encheres.cashFlow - classique.cashFlow; // Valeur par défaut
        
        if (cashflowClassiqueElement && cashflowEncheresElement) {
            // Extraire les montants numériques des textes
            const extractMontant = (text) => {
                const match = text.match(/(-?\d[\d\s]*(?:,\d+)?)\s*€/);
                if (match) {
                    return parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
                }
                return 0;
            };
            
            const cashflowClassiqueValue = extractMontant(cashflowClassiqueElement.textContent);
            const cashflowEncheresValue = extractMontant(cashflowEncheresElement.textContent);
            cashflowDiff = cashflowEncheresValue - cashflowClassiqueValue;
        }
        
        const surfaceDiff = encheres.surface - classique.surface;
        const coutDiff = encheres.coutTotal - classique.coutTotal;
        
        let texte = "";
        
        // Déterminer le gagnant basé sur le cash-flow après impôt
        const gagnant = cashflowDiff > 0 ? "vente aux enchères" : "achat classique";
        const gagnantCard = cashflowDiff > 0 ? "Vente aux enchères" : "Achat classique";
        
        // Construire le message
        if (Math.abs(cashflowDiff) > 10) {
            texte = `La ${gagnant} est plus intéressante : vous gagnez ${Math.abs(cashflowDiff).toFixed(0)}€ de plus chaque mois. `;
        }
        
        if (Math.abs(surfaceDiff) > 1) {
            if (surfaceDiff > 0) {
                texte += `Vous pourrez acheter ${surfaceDiff.toFixed(1)}m² de plus avec les enchères. `;
            } else {
                texte += `Vous aurez ${Math.abs(surfaceDiff).toFixed(1)}m² de moins avec les enchères. `;
            }
        }
        
        if (Math.abs(coutDiff) > 1000) {
            texte += coutDiff < 0 ? 
                `L'économie totale est de ${formaterMontant(Math.abs(coutDiff))}.` :
                `Le surcoût est de ${formaterMontant(Math.abs(coutDiff))}.`;
        }
        
        // Mettre à jour l'interface
        const summaryText = document.getElementById('summary-text');
        if (summaryText) summaryText.textContent = texte;
        
        const summaryMode = document.querySelector('.summary-mode');
        if (summaryMode) summaryMode.textContent = gagnantCard;
        
        const summaryGain = document.querySelector('.summary-gain');
        if (summaryGain) summaryGain.textContent = `${cashflowDiff > 0 ? '+' : ''}${cashflowDiff.toFixed(0)}€/mois`;
        
        const summaryAmount = document.querySelector('.summary-amount');
        if (summaryAmount) summaryAmount.textContent = formaterMontant(Math.abs(coutDiff));
        
        const summarySurface = document.querySelector('.summary-surface');
        if (summarySurface) summarySurface.textContent = `${surfaceDiff > 0 ? '+' : ''}${surfaceDiff.toFixed(1)} m²`;
        
        // Mettre à jour la carte gagnante
        const winnerCard = document.getElementById('summary-winner');
        if (winnerCard) {
            winnerCard.classList.toggle('winner', cashflowDiff > 0);
        }
    }

    /**
     * Ajoute des barres de progression visuelles
     */
    function ajouterBarresVisuelles(classique, encheres) {
        const container = document.getElementById('cashflow-visual-container');
        if (!container) return;
        
        // Récupérer les valeurs synchronisées du DOM
        const cashflowClassiqueElement = document.querySelector('#classique-cashflow .cashflow-monthly');
        const cashflowEncheresElement = document.querySelector('#encheres-cashflow .cashflow-monthly');
        
        let cashflowClassiqueValue = classique.cashFlow;
        let cashflowEncheresValue = encheres.cashFlow;
        
        if (cashflowClassiqueElement && cashflowEncheresElement) {
            // Extraire les montants numériques des textes
            const extractMontant = (text) => {
                const match = text.match(/(-?\d[\d\s]*(?:,\d+)?)\s*€/);
                if (match) {
                    return parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
                }
                return 0;
            };
            
            cashflowClassiqueValue = extractMontant(cashflowClassiqueElement.textContent);
            cashflowEncheresValue = extractMontant(cashflowEncheresElement.textContent);
        }
        
        const maxCashflow = Math.max(Math.abs(cashflowClassiqueValue), Math.abs(cashflowEncheresValue)) || 1;
        
        container.innerHTML = `
            <div class="cashflow-visual">
                <h3>📊 Comparaison visuelle du cash-flow mensuel</h3>
                ${createProgressBar(cashflowClassiqueValue, maxCashflow, 'Achat Classique')}
                ${createProgressBar(cashflowEncheresValue, maxCashflow, 'Vente aux Enchères')}
            </div>
        `;
    }

    /**
     * Crée une barre de progression
     */
    function createProgressBar(value, max, label) {
        const percentage = Math.abs(value / max * 100);
        const isPositive = value >= 0;
        
        return `
            <div class="progress-item">
                <span class="progress-label">${label}</span>
                <div class="progress-bar">
                    <div class="progress-fill ${isPositive ? 'positive' : 'negative'}" 
                         style="width: ${percentage}%">
                        ${formaterMontant(value)}
                    </div>
                </div>
            </div>
        `;
    }
});
