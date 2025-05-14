/**
 * simulation-interface.js - Gestion de l'interface pour le simulateur immobilier
 * 
 * Ce script gère l'interaction avec l'utilisateur, le rendu des résultats
 * et l'affichage dynamique des éléments d'interface.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialiser le simulateur
    const simulateur = new SimulateurImmo();

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
    btnSimulate.addEventListener('click', function() {
        // Afficher l'indicateur de chargement
        document.querySelector('.loading').style.display = 'flex';
        
        // Délai artificiel pour montrer le chargement (à retirer en production)
        setTimeout(() => {
            // Récupérer les données du formulaire
            const formData = collecterDonneesFormulaire();
            
            // Charger les paramètres dans le simulateur
            simulateur.chargerParametres(formData);
            
            // Exécuter la simulation
            const resultats = simulateur.simuler();
            
            // Masquer l'indicateur de chargement
            document.querySelector('.loading').style.display = 'none';
            
            // Vérifier si des résultats ont été trouvés
            if (!resultats.classique || !resultats.encheres) {
                afficherToast('Aucun prix viable avec ces paramètres.', 'warning');
                return;
            }
            
            // Afficher les résultats avec animation
            resultsContainer.classList.remove('hidden');
            resultsContainer.classList.add('fade-in');
            
            // Ajouter la notification de prix maximum calculé
            const notification = document.createElement('div');
            notification.className = 'info-message fade-in';
            notification.innerHTML = `<i class="fas fa-check-circle"></i> Calcul terminé : <strong>Prix maximum finançable</strong> déterminé par une marge positive entre loyer et mensualité`;
            
            // Mettre à jour le champ caché de surface
            document.getElementById('surface').value = resultats.classique.surface;
            
            // Ajouter la notification avant les résultats
            resultsContainer.insertBefore(notification, resultsContainer.firstChild);
            
            // Animer les valeurs numériques
            afficherResultats(resultats);
            
            // Créer les graphiques
            creerGraphiques();
            
            // Afficher le bouton de sauvegarde
            if (btnSaveSimulation) {
                btnSaveSimulation.classList.remove('hidden');
            }
            
            // Défiler vers les résultats
            resultsContainer.scrollIntoView({ behavior: 'smooth' });
        }, 1000);
    });

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
                            <p><strong>Cash-flow:</strong> ${formaterMontantMensuel(simulation.resultats.classique.cashFlow)}</p>
                            <p><strong>Rentabilité:</strong> ${formaterPourcentage(simulation.resultats.classique.rendementNet)}</p>
                        </div>
                        <div>
                            <h4>Vente aux Enchères</h4>
                            <p><strong>Prix d'achat:</strong> ${formaterMontant(simulation.resultats.encheres.prixAchat)}</p>
                            <p><strong>Surface:</strong> ${simulation.resultats.encheres.surface.toFixed(1)} m²</p>
                            <p><strong>Coût total:</strong> ${formaterMontant(simulation.resultats.encheres.coutTotal)}</p>
                            <p><strong>Emprunt:</strong> ${formaterMontant(simulation.resultats.encheres.emprunt)}</p>
                            <p><strong>Mensualité:</strong> ${formaterMontantMensuel(simulation.resultats.encheres.mensualite)}</p>
                            <p><strong>Cash-flow:</strong> ${formaterMontantMensuel(simulation.resultats.encheres.cashFlow)}</p>
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
        
        // Disparaître après 5 secondes
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toast.classList.add('fade-out');
                setTimeout(() => {
                    if (toastContainer.contains(toast)) {
                        toastContainer.removeChild(toast);
                    }
                }, 300);
            }
        }, 5000);
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
                        duration: 2000,
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
                        duration: 2000,
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
                        duration: 2000,
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
                                    const percentage = ((context.raw / context.chart._metasets[0].total) * 100).toFixed(1) + '%';
                                    return `${label}: ${value} (${percentage})`;
                                }
                            }
                        }
                    },
                    animation: {
                        duration: 2000,
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
                                    const percentage = ((context.raw / context.chart._metasets[0].total) * 100).toFixed(1) + '%';
                                    return `${label}: ${value} (${percentage})`;
                                }
                            }
                        }
                    },
                    animation: {
                        duration: 2000,
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
            emolementsPoursuivant2: document.getElementById('emoluments-poursuivant-2').value,
            emolementsPoursuivant3: document.getElementById('emoluments-poursuivant-3').value,
            emolementsPoursuivant4: document.getElementById('emoluments-poursuivant-4').value,
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
        
        const cashflowClassique = document.getElementById('classique-cashflow');
        cashflowClassique.textContent = formaterMontantMensuel(classique.cashFlow);
        cashflowClassique.className = getClasseValeur(classique.cashFlow);
        
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
            document.getElementById('classique-cashflow-apres-impot').textContent = formaterMontantMensuel(
                classique.cashFlow + (classique.impactFiscal / 12)
            );
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
        
        const cashflowEncheres = document.getElementById('encheres-cashflow');
        cashflowEncheres.textContent = formaterMontantMensuel(encheres.cashFlow);
        cashflowEncheres.className = getClasseValeur(encheres.cashFlow);
        
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
            document.getElementById('encheres-cashflow-apres-impot').textContent = formaterMontantMensuel(
                encheres.cashFlow + (encheres.impactFiscal / 12)
            );
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
    }
});