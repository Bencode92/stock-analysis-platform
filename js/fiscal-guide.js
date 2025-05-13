// fiscal-guide.js - Simulateur fiscal simplifié pour l'onglet Guide fiscal
// Version 3.7 - Mai 2025 - Mise à jour des taux et barèmes 2025

document.addEventListener('DOMContentLoaded', function() {
    // S'assurer que l'onglet Guide fiscal initialise correctement ce code
    const guideTab = document.querySelector('.tab-item:nth-child(3)'); // Le 3ème onglet
    
    if (guideTab) {
        guideTab.addEventListener('click', initFiscalSimulator);
    }
    
    // Chercher si le simulateur existe déjà sur la page
    if (document.getElementById('fiscal-simulator')) {
        initFiscalSimulator();
    }
    
    // Ajouter les styles personnalisés pour le simulateur
    addCustomStyles();
    
});

function setupSectorOptions() {
    // Find selector elements
    const secteurSelect = document.querySelector('#secteur-select, [id$="secteur-select"]');
    const tailleSelect = document.querySelector('#taille-select, [id$="taille-select"]');
    console.log("Éléments trouvés:", !!secteurSelect, !!tailleSelect);
    
    // CRITICAL: Initialize immediately at load time
    if (secteurSelect && tailleSelect) {
        // Set initial values right away
        window.sectorOptions = {
            secteur: secteurSelect.value,
            taille: tailleSelect.value
        };
        console.log("Options sectorielles initiales:", window.sectorOptions);
        
        // Broadcast initial values
        document.dispatchEvent(new CustomEvent('sectorOptionsChanged', { 
            detail: window.sectorOptions 
        }));
        
        // Add change listeners
        secteurSelect.addEventListener('change', function() {
            window.sectorOptions = {
                secteur: this.value,
                taille: tailleSelect.value
            };
            console.log("Options sectorielles mises à jour:", window.sectorOptions);
            
            // Broadcast changes
            document.dispatchEvent(new CustomEvent('sectorOptionsChanged', { 
                detail: window.sectorOptions 
            }));
            
            runComparison();
        });
        
        tailleSelect.addEventListener('change', function() {
            window.sectorOptions = {
                secteur: secteurSelect.value,
                taille: this.value
            };
            console.log("Options sectorielles mises à jour:", window.sectorOptions);
            
            // Broadcast changes
            document.dispatchEvent(new CustomEvent('sectorOptionsChanged', { 
                detail: window.sectorOptions 
            }));
            
            runComparison();
        });
    } else {
        // Set defaults if elements not found
        window.sectorOptions = {
            secteur: "Tous",
            taille: "<50"
        };
        console.log("Options sectorielles par défaut:", window.sectorOptions);
    }
}

// Add listener for debugging
document.addEventListener('sectorOptionsChanged', function(e) {
    console.log("ÉVÉNEMENT: Options sectorielles modifiées:", e.detail);
});

function initFiscalSimulator() {
    console.log("Initialisation du simulateur fiscal simplifié...");
    
    // Attendre que SimulationsFiscales et FiscalUtils soient chargés
    const checkDependencies = setInterval(() => {
        if (window.SimulationsFiscales && window.FiscalUtils) {
            clearInterval(checkDependencies);
            console.log("Dépendances trouvées, configuration du simulateur...");
            setupSimulator();
            setupSectorOptions(); // Ajout de cette ligne
        }
    }, 200);
}

function setupSimulator() {
    const compareBtn = document.getElementById('sim-compare-btn');
    if (!compareBtn) return;
    
    compareBtn.addEventListener('click', runComparison);
    
    // Écouter les changements dans les champs pour mettre à jour automatiquement
    const inputFields = ['sim-ca', 'sim-marge', 'sim-salaire', 'sim-tmi'];
    inputFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', runComparison);
    });
    
    // Configurer l'accordéon pour les statuts juridiques
    setupAccordion();
    
    // Mettre à jour l'interface du simulateur pour inclure tous les statuts
    updateSimulatorInterface();
    
    // Exécuter une première simulation au chargement
    setTimeout(runComparison, 100);
}

// Fonction pour mettre à jour l'interface du simulateur
function updateSimulatorInterface() {
    // Récupérer le conteneur du simulateur
    const simulatorContainer = document.getElementById('fiscal-simulator');
    if (!simulatorContainer) return;
    
    // Vérifier si les options existent déjà pour éviter les doublons
    if (document.getElementById('sim-options-container')) {
        console.log("Options de simulation déjà présentes, pas de reconstruction");
        return;
    }
    
    // Ajouter un sélecteur de statuts et des options de simulation avancées
    const formContainer = simulatorContainer.querySelector('.grid');
    
    if (formContainer) {
        // Ajouter une nouvelle ligne pour les options de simulation
        const optionsRow = document.createElement('div');
        optionsRow.className = 'col-span-1 md:col-span-2 mb-4';
        optionsRow.id = 'sim-options-container';
        optionsRow.innerHTML = `
            <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg">
                <h3 class="font-medium mb-3 text-green-400">Options de simulation</h3>
                
                <!-- Message d'information sur les statuts -->
                <div class="status-info-message mb-4">
                    <i class="fas fa-info-circle mr-2"></i> Par défaut, tous les statuts juridiques sont inclus dans la simulation. Utilisez les filtres ci-dessous pour comparer des groupes spécifiques.
                </div>
                
                <!-- Filtres de statuts avec boutons visuels -->
                <div class="mb-4">
                    <label class="block text-gray-300 mb-2">Filtres rapides</label>
                    <div class="flex flex-wrap gap-2" id="status-filter-buttons">
                        <button class="status-filter-btn px-3 py-2 rounded-md bg-blue-800 text-white" data-filter="common">
                            <i class="fas fa-star mr-1"></i> Recommandés
                        </button>
                        <button class="status-filter-btn px-3 py-2 rounded-md bg-green-500 text-gray-900 font-medium" data-filter="all">
                            <i class="fas fa-list mr-1"></i> Tous
                        </button>
                        <button class="status-filter-btn px-3 py-2 rounded-md bg-blue-800 text-white" data-filter="is_only">
                            <i class="fas fa-building mr-1"></i> IS uniquement
                        </button>
                        <button class="status-filter-btn px-3 py-2 rounded-md bg-blue-800 text-white" data-filter="ir_only">
                            <i class="fas fa-user mr-1"></i> IR uniquement
                        </button>
                        <button class="status-filter-btn px-3 py-2 rounded-md bg-blue-800 text-white" data-filter="commercial">
                            <i class="fas fa-store mr-1"></i> Commercial
                        </button>
                        <button class="status-filter-btn px-3 py-2 rounded-md bg-blue-800 text-white" data-filter="liberal">
                            <i class="fas fa-briefcase-medical mr-1"></i> Libéral
                        </button>
                        <button class="status-filter-btn px-3 py-2 rounded-md bg-blue-800 text-white" data-filter="custom">
                            <i class="fas fa-sliders-h mr-1"></i> Personnalisé
                        </button>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="sim-options">
                    <div>
                        <label class="block text-gray-300 mb-2">Statuts à comparer</label>
                        <select id="sim-status-filter" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white">
                            <option value="common">Statuts courants (5)</option>
                            <option value="all" selected>Tous les statuts (13)</option>
                            <option value="is_only">IS uniquement</option>
                            <option value="ir_only">IR uniquement</option>
                            <option value="commercial">Statuts commerciaux</option>
                            <option value="liberal">Professions libérales</option>
                            <option value="custom">Personnalisé</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-gray-300 mb-2">Fonctionnalités activées</label>
                        <div class="flex flex-col space-y-2">
                            <div class="flex items-center">
                                <span class="bg-pink-900 bg-opacity-20 px-3 py-1 rounded-md text-pink-300 font-medium">
                                    <i class="fas fa-chart-line mr-2"></i>Mode expert activé
                                </span>
                                <input type="hidden" id="sim-expert-mode" checked>
                                <span class="info-tooltip ml-2">
                                    <i class="fas fa-question-circle text-gray-400"></i>
                                    <span class="tooltiptext">Le mode expert utilise le calcul par tranches progressives d'IR plutôt que le TMI simple.</span>
                                </span>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="use-optimal-ratio" class="mr-2 h-4 w-4" checked>
                                <span class="bg-purple-900 bg-opacity-20 px-3 py-1 rounded-md text-purple-300 font-medium">
                                    <i class="fas fa-magic mr-2"></i>Utiliser le ratio optimal rémunération/dividendes
                                </span>
                                <span class="info-tooltip ml-2">
                                    <i class="fas fa-question-circle text-gray-400"></i>
                                    <span class="tooltiptext">Optimise automatiquement le ratio entre rémunération et dividendes pour maximiser le revenu net.</span>
                                </span>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="use-avg-charge-rate" class="mr-2 h-4 w-4" checked>
                                <span class="bg-amber-900 bg-opacity-20 px-3 py-1 rounded-md text-amber-300 font-medium">
                                    <i class="fas fa-percentage mr-2"></i>Taux de charge réel (frais professionnels)
                                </span>
                                <span class="info-tooltip ml-2">
                                    <i class="fas fa-question-circle text-gray-400"></i>
                                    <span class="tooltiptext">Utilise le taux de charge pour calculer les frais déductibles réels plutôt qu'un taux de marge fixe.</span>
                                </span>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="sarl-gerant-minoritaire" class="mr-2 h-4 w-4">
                                <span class="bg-blue-900 bg-opacity-20 px-3 py-1 rounded-md text-blue-300 font-medium">
                                    <i class="fas fa-users mr-2"></i>Gérant minoritaire pour SARL
                                </span>
                                <span class="info-tooltip ml-2">
                                    <i class="fas fa-question-circle text-gray-400"></i>
                                    <span class="tooltiptext">Le gérant détient moins de 50% des parts sociales (assimilé salarié).</span>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Ajouter le sélecteur de type d'activité pour micro-entreprise -->
                <div class="mt-4">
                    <label class="block text-gray-300 mb-2">Type d'activité pour Micro-entreprise</label>
                    <select id="micro-type" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white">
                        <option value="BIC_SERVICE" selected>BIC Services (abattement 50%)</option>
                        <option value="BIC_VENTE">BIC Vente (abattement 71%)</option>
                        <option value="BNC">BNC (abattement 34%)</option>
                    </select>
                </div>
                
                <!-- Option versement libératoire pour micro-entreprise -->
                <div class="mt-2">
                    <div class="flex items-center">
                        <input type="checkbox" id="micro-vfl" class="mr-2 h-4 w-4">
                        <label for="micro-vfl" class="text-gray-300">Versement libératoire de l'impôt sur le revenu</label>
                        <span class="info-tooltip ml-2">
                            <i class="fas fa-question-circle text-gray-400"></i>
                            <span class="tooltiptext">Remplace l'IR par un prélèvement de 1% (vente), 1,7% (services) ou 2,2% (libéral) sur votre CA.</span>
                        </span>
                    </div>
                </div>
                
                <!-- Avertissement sur les limites du simulateur -->
                <div class="fiscal-warning mt-4">
                    <p><i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i> <strong>Limites du simulateur:</strong> Ce simulateur simplifie certains aspects fiscaux pour faciliter la comparaison. Pour une analyse complète, consultez un expert-comptable.</p>
                </div>
                
                <!-- Sélection personnalisée de statuts avec catégorisation -->
                <div id="custom-status-options" class="hidden mt-4 p-4 rounded-lg">
                    <div class="mb-2 text-green-400 font-medium">Sélectionnez les statuts à comparer</div>
                    
                    <!-- Catégorie IS -->
                    <div class="mb-3">
                        <div class="text-sm text-gray-300 mb-1 border-b border-gray-700 pb-1">
                            <i class="fas fa-building mr-1 text-blue-400"></i> Statuts à l'IS
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-sm">
                            <div class="flex items-center">
                                <input type="checkbox" id="status-eurlIS" value="eurlIS" class="status-checkbox mr-2 h-4 w-4 text-green-400">
                                <label for="status-eurlIS" class="text-sm">
                                    <span class="regime-badge is">IS</span> EURL-IS
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="status-sasu" value="sasu" class="status-checkbox mr-2 h-4 w-4 text-green-400">
                                <label for="status-sasu" class="text-sm">
                                    <span class="regime-badge is">IS</span> SASU
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="status-sarl" value="sarl" class="status-checkbox mr-2 h-4 w-4 text-green-400">
                                <label for="status-sarl" class="text-sm">
                                    <span class="regime-badge is">IS</span> SARL
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="status-sas" value="sas" class="status-checkbox mr-2 h-4 w-4 text-green-400">
                                <label for="status-sas" class="text-sm">
                                    <span class="regime-badge is">IS</span> SAS
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="status-sa" value="sa" class="status-checkbox mr-2 h-4 w-4 text-green-400">
                                <label for="status-sa" class="text-sm">
                                    <span class="regime-badge is">IS</span> SA
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="status-selarl" value="selarl" class="status-checkbox mr-2 h-4 w-4 text-green-400">
                                <label for="status-selarl" class="text-sm">
                                    <span class="regime-badge is">IS</span> SELARL
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="status-selas" value="selas" class="status-checkbox mr-2 h-4 w-4 text-green-400">
                                <label for="status-selas" class="text-sm">
                                    <span class="regime-badge is">IS</span> SELAS
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="status-sca" value="sca" class="status-checkbox mr-2 h-4 w-4 text-green-400">
                                <label for="status-sca" class="text-sm">
                                    <span class="regime-badge is">IS</span> SCA
                                </label>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Catégorie IR -->
                    <div>
                        <div class="text-sm text-gray-300 mb-1 border-b border-gray-700 pb-1">
                            <i class="fas fa-user mr-1 text-green-400"></i> Statuts à l'IR
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-sm">
                            <div class="flex items-center">
                                <input type="checkbox" id="status-micro" value="micro" class="status-checkbox mr-2 h-4 w-4 text-green-400">
                                <label for="status-micro" class="text-sm">
                                    <span class="regime-badge ir">IR</span> Micro
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="status-ei" value="ei" class="status-checkbox mr-2 h-4 w-4 text-green-400">
                                <label for="status-ei" class="text-sm">
                                    <span class="regime-badge ir">IR</span> EI
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="status-eurl" value="eurl" class="status-checkbox mr-2 h-4 w-4 text-green-400">
                                <label for="status-eurl" class="text-sm">
                                    <span class="regime-badge ir">IR</span> EURL-IR
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="status-snc" value="snc" class="status-checkbox mr-2 h-4 w-4 text-green-400">
                                <label for="status-snc" class="text-sm">
                                    <span class="regime-badge ir">IR</span> SNC
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input type="checkbox" id="status-sci" value="sci" class="status-checkbox mr-2 h-4 w-4 text-green-400">
                                <label for="status-sci" class="text-sm">
                                    <span class="regime-badge ir">IR</span> SCI
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Simplification de l'insertion pour éviter les doublons
        try {
            const compareButton = simulatorContainer.querySelector('#sim-compare-btn');
            if (compareButton) {
                const compareButtonWrapper = compareButton.closest('.col-span-1, .col-span-2');
                if (compareButtonWrapper && formContainer.contains(compareButtonWrapper)) {
                    formContainer.insertBefore(optionsRow, compareButtonWrapper);
                } else {
                    formContainer.appendChild(optionsRow);
                }
            } else {
                formContainer.appendChild(optionsRow);
            }
        } catch (error) {
            console.error("Erreur lors de l'insertion des options:", error);
            formContainer.appendChild(optionsRow);
        }
        
        // Ajouter les événements
        const statusFilter = document.getElementById('sim-status-filter');
        statusFilter.addEventListener('change', function() {
            const isCustom = this.value === 'custom';
            document.getElementById('custom-status-options').style.display = isCustom ? 'block' : 'none';
            
            // Cocher/décocher les cases selon le filtre sélectionné
            if (!isCustom) {
                const selectedStatuses = getSelectedStatuses(this.value);
                document.querySelectorAll('.status-checkbox').forEach(checkbox => {
                    checkbox.checked = selectedStatuses.includes(checkbox.value);
                });
            }
            
            // Mettre à jour les boutons de filtre
            document.querySelectorAll('.status-filter-btn').forEach(btn => {
                const filter = btn.getAttribute('data-filter');
                if (filter === this.value) {
                    btn.classList.remove('bg-blue-800', 'text-white');
                    btn.classList.add('bg-green-500', 'text-gray-900', 'font-medium');
                } else {
                    btn.classList.remove('bg-green-500', 'text-gray-900', 'font-medium');
                    btn.classList.add('bg-blue-800', 'text-white');
                }
            });
            
            // Relancer la comparaison
            runComparison();
        });
        
        // Ajouter des événements aux boutons de filtre
        document.querySelectorAll('.status-filter-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                // Mettre à jour l'apparence des boutons
                document.querySelectorAll('.status-filter-btn').forEach(b => {
                    b.classList.remove('bg-green-500', 'text-gray-900', 'font-medium');
                    b.classList.add('bg-blue-800', 'text-white');
                });
                this.classList.remove('bg-blue-800', 'text-white');
                this.classList.add('bg-green-500', 'text-gray-900', 'font-medium');
                
                // Mettre à jour le select
                const filter = this.getAttribute('data-filter');
                statusFilter.value = filter;
                
                // Afficher/masquer les options personnalisées
                const isCustom = filter === 'custom';
                document.getElementById('custom-status-options').style.display = isCustom ? 'block' : 'none';
                
                // Mettre à jour les cases à cocher
                if (!isCustom) {
                    const selectedStatuses = getSelectedStatuses(filter);
                    document.querySelectorAll('.status-checkbox').forEach(checkbox => {
                        checkbox.checked = selectedStatuses.includes(checkbox.value);
                    });
                }
                
                // Relancer la comparaison
                runComparison();
            });
        });
        
        // Ajouter un événement aux cases à cocher et autres options
        document.querySelectorAll('.status-checkbox, #use-optimal-ratio, #use-avg-charge-rate, #micro-type, #micro-vfl, #sarl-gerant-minoritaire').forEach(checkbox => {
            checkbox.addEventListener('change', runComparison);
        });
        
        // Par défaut, sélectionner le filtre "all" pour afficher tous les statuts
        statusFilter.value = "all";
        statusFilter.dispatchEvent(new Event('change'));
    }
}

// Fonction pour obtenir les statuts sélectionnés selon le filtre
function getSelectedStatuses(filter) {
    switch(filter) {
        case 'common':
            return ['micro', 'ei', 'eurl', 'eurlIS', 'sasu'];
        case 'all':
            return ['micro', 'ei', 'eurl', 'eurlIS', 'sarl', 'sasu', 'sas', 'sa', 'snc', 'sci', 'selarl', 'selas', 'sca'];
        case 'is_only':
            return ['eurlIS', 'sasu', 'sarl', 'sas', 'sa', 'selarl', 'selas', 'sca'];
        case 'ir_only':
            return ['micro', 'ei', 'eurl', 'snc', 'sci'];
        case 'commercial':
            return ['micro', 'ei', 'eurl', 'eurlIS', 'sarl', 'sasu', 'sas', 'sa', 'snc'];
        case 'liberal':
            return ['micro', 'ei', 'eurl', 'eurlIS', 'selarl', 'selas'];
        case 'custom':
            // Récupérer les statuts cochés
            return Array.from(document.querySelectorAll('.status-checkbox:checked')).map(cb => cb.value);
        default:
            return ['micro', 'ei', 'eurl', 'eurlIS', 'sarl', 'sasu', 'sas', 'sa', 'snc', 'sci', 'selarl', 'selas', 'sca']; // Par défaut, tous les statuts
    }
}

function runComparison() {
    // Récupérer les valeurs du formulaire
    const ca = parseFloat(document.getElementById('sim-ca').value) || 50000;
    const marge = parseFloat(document.getElementById('sim-marge').value) / 100 || 0.3;
    const ratioSalaire = parseFloat(document.getElementById('sim-salaire').value) / 100 || 0.7;
    const tmi = parseFloat(document.getElementById('sim-tmi').value) || 30;
    
    // Récupérer les options sectorielles actuelles
    const secteurSelect = document.querySelector('#secteur-select, [id$="secteur-select"]');
    const tailleSelect = document.querySelector('#taille-select, [id$="taille-select"]');
    
    if (secteurSelect && tailleSelect) {
        window.sectorOptions = {
            secteur: secteurSelect.value,
            taille: tailleSelect.value
        };
        console.log("runComparison: Options sectorielles utilisées:", window.sectorOptions);
    }
    
    // Récupérer les options avancées
    const modeExpert = true; // Toujours activé
    const useOptimalRatio = document.getElementById('use-optimal-ratio') && document.getElementById('use-optimal-ratio').checked;
    const useAvgChargeRate = document.getElementById('use-avg-charge-rate') && document.getElementById('use-avg-charge-rate').checked;
    const versementLiberatoire = document.getElementById('micro-vfl') && document.getElementById('micro-vfl').checked;
    const gerantMajoritaire = !(document.getElementById('sarl-gerant-minoritaire') && document.getElementById('sarl-gerant-minoritaire').checked);
    
    // Définir marge ou frais de façon exclusive selon l'option
    const params = {
        ca: ca,
        tauxMarge: useAvgChargeRate ? undefined : marge,
        tauxFrais: useAvgChargeRate ? (1 - marge) : undefined, // Changé de null à undefined
        tauxRemuneration: ratioSalaire,
        tmiActuel: tmi,
        modeExpert: modeExpert,
        gerantMajoritaire: gerantMajoritaire,
        secteur: window.sectorOptions?.secteur, // Ajouter ces paramètres
        taille: window.sectorOptions?.taille
    };

    
    // Logger pour debug
    console.log("Paramètres:", params);
    console.log("useAvgChargeRate:", useAvgChargeRate);
    console.log("versementLiberatoire:", versementLiberatoire);
    console.log("gerantMajoritaire:", gerantMajoritaire);
    
    const resultsBody = document.getElementById('sim-results-body');
    if (!resultsBody) return;
    
    // Vider les résultats précédents
    resultsBody.innerHTML = '';
    
    // Obtenir les statuts à simuler selon le filtre sélectionné
    const statusFilter = document.getElementById('sim-status-filter');
    const selectedStatuses = getSelectedStatuses(statusFilter ? statusFilter.value : 'all'); // Par défaut, tous les statuts
    
    // Tableau pour stocker les résultats de simulation
    const resultats = [];
    
    // Association icônes pour les statuts
    const statutIcons = {
        'micro': '<i class="fas fa-store-alt text-green-400 status-icon"></i>',
        'ei': '<i class="fas fa-user text-green-400 status-icon"></i>',
        'eurl': '<i class="fas fa-user-tie text-green-400 status-icon"></i>',
        'eurlIS': '<i class="fas fa-building text-blue-400 status-icon"></i>',
        'sasu': '<i class="fas fa-user-shield text-blue-400 status-icon"></i>',
        'sarl': '<i class="fas fa-users text-blue-400 status-icon"></i>',
        'sas': '<i class="fas fa-building text-blue-400 status-icon"></i>',
        'sa': '<i class="fas fa-landmark text-blue-400 status-icon"></i>',
        'snc': '<i class="fas fa-handshake text-green-400 status-icon"></i>',
        'sci': '<i class="fas fa-home text-green-400 status-icon"></i>',
        'selarl': '<i class="fas fa-user-md text-blue-400 status-icon"></i>',
        'selas': '<i class="fas fa-stethoscope text-blue-400 status-icon"></i>',
        'sca': '<i class="fas fa-chart-line text-blue-400 status-icon"></i>'
    };
    
    // Badge régime fiscal
    const regimeBadges = {
        'micro': '<span class="regime-badge ir">IR</span>',
        'ei': '<span class="regime-badge ir">IR</span>',
        'eurl': '<span class="regime-badge ir">IR</span>',
        'eurlIS': '<span class="regime-badge is">IS</span>',
        'sasu': '<span class="regime-badge is">IS</span>',
        'sarl': '<span class="regime-badge is">IS</span>',
        'sas': '<span class="regime-badge is">IS</span>',
        'sa': '<span class="regime-badge is">IS</span>',
        'snc': '<span class="regime-badge ir">IR</span>',
        'sci': '<span class="regime-badge ir">IR</span>',
        'selarl': '<span class="regime-badge is">IS</span>',
        'selas': '<span class="regime-badge is">IS</span>',
        'sca': '<span class="regime-badge is">IS</span>'
    };
    
    // Définir les stratégies d'optimisation par type de statut
    const optimisationParStatut = {
        // Structures assimilées salarié: charges lourdes (favoriser dividendes)
        'sasu': { ratioMin: 0.1, ratioMax: 1, favoriserDividendes: true, minRatioForFiscal: 0.1, capitalSocial: 1000 },
        'sas': { ratioMin: 0.1, ratioMax: 1, favoriserDividendes: true, minRatioForFiscal: 0.1, capitalSocial: 1000 },
        'sa': { ratioMin: 0.1, ratioMax: 1, favoriserDividendes: true, minRatioForFiscal: 0.1, capitalSocial: 37000 },
        'selas': { ratioMin: 0.1, ratioMax: 1, favoriserDividendes: true, minRatioForFiscal: 0.1, capitalSocial: 37000 },
        
        // Structures TNS: charges sociales sur dividendes >10% du capital (équilibre)
        'eurlIS': { ratioMin: 0.1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 0.5, capitalSocial: 1 },
        'sarl': { ratioMin: 0.1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 0.5, capitalSocial: 1 },
        'selarl': { ratioMin: 0.1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 0.5, capitalSocial: 1 },
        'sca': { ratioMin: 0.1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 0.5, capitalSocial: 37000 },
        
        // Structures sans distinction rémunération/dividendes (pas d'optimisation)
        'micro': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 1, capitalSocial: 0 },
        'ei': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 1, capitalSocial: 0 },
        'eurl': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 1, capitalSocial: 1 },
        'snc': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 1, capitalSocial: 0 },
        'sci': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 1, capitalSocial: 0 }
    };
    
    // Associer chaque statut à sa fonction de simulation et son nom d'affichage
    const statutsComplets = {
        'micro': { 
            nom: 'Micro-entreprise', 
            simuler: () => window.SimulationsFiscales.simulerMicroEntreprise({
                ca: ca,
                typeMicro: document.getElementById('micro-type').value,
                tmiActuel: tmi,
                modeExpert: modeExpert,
                versementLiberatoire: versementLiberatoire
            })
        },
        'ei': { 
            nom: 'Entreprise Individuelle', 
            simuler: () => window.SimulationsFiscales.simulerEI({
                ...params,
                ca: ca,
                tmiActuel: tmi
            })
        },
        'eurl': { 
            nom: 'EURL à l\'IR', 
            simuler: () => window.SimulationsFiscales.simulerEURL({
                ...params,
                ca: ca,
                tauxRemuneration: ratioSalaire,
                optionIS: false,
                tmiActuel: tmi
            })
        },
        'eurlIS': { 
            nom: 'EURL à l\'IS', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['eurlIS'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerEURL({...p, optionIS: true})
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerEURL({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    optionIS: true,
                    tmiActuel: tmi
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        },
        'sasu': { 
            nom: 'SASU', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['sasu'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerSASU(p)
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerSASU({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        },
        'sarl': { 
            nom: 'SARL', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['sarl'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerSARL({...p, gerantMajoritaire: gerantMajoritaire})
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerSARL({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi,
                    gerantMajoritaire: gerantMajoritaire
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        },
        'sas': { 
            nom: 'SAS', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['sas'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerSAS(p)
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerSAS({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        },
        'sa': { 
            nom: 'SA', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['sa'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerSA(p)
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerSA({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi,
                    capitalInvesti: 37000 // Minimum légal
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        },
        'snc': { 
            nom: 'SNC', 
            simuler: () => {
                console.log("Paramètres SNC:", {...params, ca: ca, tmiActuel: tmi});
                return window.SimulationsFiscales.simulerSNC({
                    ...params,
                    ca: ca,
                    tmiActuel: tmi
                });
            }
        },
        'sci': { 
            nom: 'SCI', 
            simuler: () => {
                console.log("Paramètres SCI:", {...params, revenuLocatif: ca, tmiActuel: tmi});
                return window.SimulationsFiscales.simulerSCI({
                    ...params,
                    revenuLocatif: ca,
                    tmiActuel: tmi
                });
            }
        },
        'selarl': { 
            nom: 'SELARL', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['selarl'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerSELARL(p)
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerSELARL({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        },
        'selas': { 
            nom: 'SELAS', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['selas'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerSELAS(p)
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerSELAS({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        },
        'sca': { 
            nom: 'SCA', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['sca'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerSCA({...p, capitalInvesti: 37000})
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerSCA({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi,
                    capitalInvesti: 37000 // Minimum légal
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        }
    };
    
    // Simuler chaque statut sélectionné
    for (const statutId of selectedStatuses) {
        if (statutsComplets[statutId]) {
            try {
                const statut = statutsComplets[statutId];
                const sim = statut.simuler();
                
                // Debug pour vérifier que les paramètres sont bien passés
                console.log(`Simulation ${statutId}:`, sim);
                
                // Si incompatible, afficher un message
                if (!sim.compatible) {
                    resultats.push({
                        statutId: statutId,
                        statut: statut.nom,
                        brut: '-',
                        charges: '-',
                        impots: '-',
                        net: `<span class="text-red-400">${sim.message || 'Incompatible'}</span>`,
                        sim: sim,
                        score: 0
                    });
                    continue;
                }
                
                // Déterminer les montants à afficher selon le type de statut
                let brut, charges, impots, net;
                
                // Ces valeurs varient selon le type de statut
                if (statutId === 'micro') {
                    brut = sim.ca;
                    charges = sim.cotisationsSociales + (sim.cfp || 0) + (sim.cfe || 0);
                    impots = sim.impotRevenu;
                    net = sim.revenuNetApresImpot;
                } else if (statutId === 'ei') {
                    brut = sim.beneficeAvantCotisations;
                    charges = sim.cotisationsSociales;
                    impots = sim.impotRevenu;
                    net = sim.revenuNetApresImpot;
                } else if (statutId === 'eurl' && !sim.is) {
                    brut = sim.beneficeImposable + sim.cotisationsSociales;
                    charges = sim.cotisationsSociales;
                    impots = sim.impotRevenu;
                    net = sim.revenuNetApresImpot;
                } else if (statutId === 'snc') {
                    brut = sim.beneficeAssociePrincipal;
                    charges = sim.cotisationsSociales;
                    impots = sim.impotRevenu;
                    net = sim.revenuNetApresImpot;
                } else if (statutId === 'sci') {
                    // SCI est un cas particulier
                    brut = sim.resultatFiscalAssocie;
                    charges = sim.prelevementsSociaux || 0;
                    impots = sim.impotRevenu;
                    net = sim.revenuNetApresImpot;
                } else {
                      // Cas général pour les statuts à l'IS (SASU, EURL-IS, SAS, SARL, etc.)
                  brut = sim.remuneration || sim.resultatEntreprise * (useOptimalRatio ? sim.ratioOptimise : ratioSalaire);
                  charges = sim.cotisationsSociales || (sim.chargesPatronales + sim.chargesSalariales);
                 impots = (sim.impotRevenu || 0) + (sim.is || 0) + (sim.prelevementForfaitaire || 0);
                    if (sim.cotTNSDiv) impots += sim.cotTNSDiv; // Ajout des cotisations TNS sur dividendes
    
                 // Recalculer explicitement le net en tenant compte des charges mises à jour
                const revenuNetSalaire = sim.salaireNetApresIR || sim.revenuNetSalaire || 0;
                   const dividendesNets = sim.dividendesNets || 0;
                 net = sim.revenuNetTotal || (revenuNetSalaire + dividendesNets);
    
                  // Log de debug pour vérifier les valeurs
                     console.log(`[FIX] ${statutId} - Charges: ${charges}, Salaire net: ${revenuNetSalaire}, Dividendes: ${dividendesNets}, NET: ${net}`);
}
                
                // Calcul du score avec prise en compte de la progressivité fiscale
                const scoreNet = 100 * (net / ca); // Score standard
                
                // Coefficient d'évolutivité: moins favorable aux statuts forfaitaires à CA élevé
                let coeffEvolution = 1;
                if (statutId === 'micro' && ca > 30000) {
                    // Pénaliser légèrement la micro pour CA important (moins évolutif)
                    coeffEvolution = 0.95;
                } else if ((statutId === 'sasu' || statutId === 'sas' || statutId === 'selas') && ca > 80000) {
                    // Légèrement favorable aux structures avec assimilé salarié à CA élevé
                    coeffEvolution = 1.05;
                }
                
                // Score avec coefficient d'évolutivité
                const score = scoreNet * coeffEvolution;
                
                // Calculer la répartition rémunération/dividendes
                const ratioEffectif = useOptimalRatio && sim.ratioOptimise ? sim.ratioOptimise : ratioSalaire;
                
                resultats.push({
                    statutId: statutId,
                    statut: statut.nom,
                    brut: brut,
                    charges: charges,
                    impots: impots,
                    net: net,
                    sim: sim,
                    score: score,
                    ratioOptimise: sim.ratioOptimise,
                    dividendesNets: sim.dividendesNets || 0,
                    ratioEffectif: ratioEffectif
                });
            } catch (e) {
                console.error(`Erreur lors de la simulation pour ${statutsComplets[statutId].nom}:`, e);
                resultats.push({
                    statutId: statutId,
                    statut: statutsComplets[statutId].nom,
                    brut: '-',
                    charges: '-',
                    impots: '-',
                    net: `<span class="text-red-400">Erreur de calcul</span>`,
                    score: 0
                });
            }
        }
    }
    
    // Trier par net décroissant
    resultats.sort((a, b) => b.score - a.score);
    
    // Formater les nombres
    const formatter = new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
    
    // Calculer la moyenne des scores pour les statuts compatibles
    const scoresCompatibles = resultats.filter(r => r.score > 0).map(r => r.score);
    const scoresMoyen = scoresCompatibles.length > 0 
        ? scoresCompatibles.reduce((sum, score) => sum + score, 0) / scoresCompatibles.length 
        : 0;
    
    // Modifier l'en-tête du tableau - toujours inclure les dividendes et optimisation
    const tableHeader = document.querySelector('#sim-results thead tr');
    if (tableHeader) {
        tableHeader.innerHTML = `
            <th class="px-4 py-3 rounded-tl-lg">Statut</th>
            <th class="px-4 py-3">Rémunération brute</th>
            <th class="px-4 py-3">Charges sociales</th>
            <th class="px-4 py-3">Impôts</th>
            <th class="px-4 py-3">Dividendes nets</th>
            <th class="px-4 py-3">Ratio optimal</th>
            <th class="px-4 py-3 rounded-tr-lg">Net en poche</th>
        `;
    }
    
    // Afficher les résultats dans le tableau
    resultats.forEach((res, index) => {
        const isTopResult = index === 0;
        
        const row = document.createElement('tr');
        row.className = isTopResult 
            ? 'result-top-row' 
            : (index % 2 === 0 ? 'bg-blue-900 bg-opacity-20' : '');
        
        // Valeur d'optimisation du ratio
        let optimisationValue = "";
        if (res.ratioOptimise) {
            const ratioDisplay = Math.round(res.ratioOptimise*100);
            const isMicroOrEI = res.statutId === 'micro' || res.statutId === 'ei' || res.statutId === 'eurl' || res.statutId === 'snc' || res.statutId === 'sci';
            
            if (useOptimalRatio && !isMicroOrEI) {
                optimisationValue = `<span class="ratio-optimal-value">${ratioDisplay}% rém.</span>`;
            } else if (isMicroOrEI) {
                optimisationValue = "N/A";
            } else {
                const ratioManuel = Math.round(ratioSalaire*100); 
                optimisationValue = `${ratioDisplay}% <small>(${ratioManuel}% manuel)</small>`;
            }
        } else {
            optimisationValue = `${Math.round(ratioSalaire*100)}% (manuel)`;
        }
        
        // Format avec dividendes et optimisation
        row.innerHTML = `
            <td class="px-4 py-3 font-medium">
                ${isTopResult ? '<i class="fas fa-star text-yellow-400 mr-2"></i>' : ''}
                ${statutIcons[res.statutId] || ''} ${res.statut} ${regimeBadges[res.statutId] || ''}
            </td>
            <td class="px-4 py-3">${res.brut === '-' ? '-' : formatter.format(res.brut)}</td>
            <td class="px-4 py-3">${res.charges === '-' ? '-' : formatter.format(res.charges)}</td>
            <td class="px-4 py-3">${res.impots === '-' ? '-' : formatter.format(res.impots)}</td>
            <td class="px-4 py-3">${res.dividendesNets ? formatter.format(res.dividendesNets) : '-'}</td>
            <td class="px-4 py-3">${optimisationValue}</td>
            <td class="px-4 py-3">
                <span class="net-value ${isTopResult ? 'top' : ''} cursor-pointer show-detail-btn" data-statut="${res.statutId}">
                    ${res.net === '-' ? '-' : (typeof res.net === 'string' ? res.net : formatter.format(res.net))}
                </span>
                ${isTopResult ? 
                '<div class="text-xs text-green-400 mt-1"><i class="fas fa-check-circle mr-1"></i>Optimal pour ce CA</div>' : ''}
                <div class="text-xs text-blue-400 mt-1"><i class="fas fa-info-circle mr-1"></i>Cliquez pour détails</div>
            </td>
        `;
        
        resultsBody.appendChild(row);
    });
    
    // Ajouter une ligne de mode de calcul avec état de l'optimisation
    const modeRow = document.createElement('tr');
    modeRow.className = 'bg-pink-900 bg-opacity-20 text-sm border-t border-pink-800';
    
    modeRow.innerHTML = `
        <td colspan="7" class="px-4 py-2 font-medium text-pink-300">
            <i class="fas fa-chart-line mr-2"></i> 
            Mode expert activé : calcul par tranches progressives d'IR + ${useOptimalRatio ? 'optimisation automatique' : 'ratio manuel'} du ratio rémunération/dividendes
            ${useAvgChargeRate ? ' + calcul avec frais réels' : ''}
            ${versementLiberatoire ? ' + versement libératoire pour micro-entreprise' : ''}
        </td>
    `;
    
    resultsBody.appendChild(modeRow);
    
    // Ajouter ligne de ratio net/brut pour les statuts compatibles
    const ratioRow = document.createElement('tr');
    ratioRow.className = 'ratio-row';
    
    ratioRow.innerHTML = `
        <td class="px-4 py-2 italic" colspan="6">Ratio net/CA</td>
        <td class="px-4 py-2 font-medium">
            ${scoresCompatibles.length > 0 
                ? `${resultats[0].score.toFixed(1)}% (max) / ${scoresMoyen.toFixed(1)}% (moy)` 
                : 'N/A'}
        </td>
    `;
    
    resultsBody.appendChild(ratioRow);
    
    // Ajouter avertissement sur les limites de la simulation
    const warningRow = document.createElement('tr');
    warningRow.className = 'bg-blue-900 bg-opacity-30 text-xs border-t border-blue-800';
    
    warningRow.innerHTML = `
        <td colspan="7" class="px-4 py-3">
            <div class="flex items-start">
                <i class="fas fa-info-circle text-blue-400 mr-2 mt-0.5"></i>
                <div>
                    <strong class="text-blue-400">Note sur les limites de la simulation :</strong>
                    <ul class="mt-1 space-y-1 text-gray-300">
                        <li>• Les statuts à l'IR (Micro, EI, EURL IR) permettent plus de déductions fiscales que ce qui est simulé ici.</li>
                        <li>• Dans le régime Micro, l'abattement forfaitaire peut être avantageux si vos charges réelles sont faibles.</li>
                        <li>• Pour les statuts à l'IS, certaines optimisations spécifiques ne sont pas prises en compte (épargne salariale, etc.).</li>
                    </ul>
                </div>
            </div>
        </td>
    `;
    
    resultsBody.appendChild(warningRow);
    
    // Ajouter les gestionnaires d'événements pour afficher les détails
    const detailButtons = document.querySelectorAll('.show-detail-btn');
    detailButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const statutId = this.getAttribute('data-statut');
            showCalculationDetails(statutId, resultats);
        });
    });
}

// Fonction pour afficher le détail des calculs
function showCalculationDetails(statutId, simulationResults) {
    // Trouver les résultats pour ce statut
    const result = simulationResults.find(r => r.statutId === statutId);
    if (!result) return;
    
    // Formatter les nombres
    const formatter = new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
    
    // Créer le modal
    const modal = document.createElement('div');
    modal.className = 'detail-modal';
    
    // Adapter l'affichage en fonction du statut juridique
    let detailContent = '';
    
    if (statutId === 'micro') {
        detailContent = `
            <h2 class="text-2xl font-bold text-green-400 mb-4">Détail du calcul - Micro-entreprise</h2>
            
            <div class="detail-category">Données de base</div>
            <table class="detail-table">
                <tr>
                    <td>Chiffre d'affaires</td>
                    <td>${formatter.format(result.sim.ca)}</td>
                </tr>
                <tr>
                    <td>Type de micro-entreprise</td>
                    <td>${result.sim.typeMicro || 'BIC'}</td>
                </tr>
                <tr>
                    <td>Abattement forfaitaire</td>
                    <td>${result.sim.abattement}</td>
                </tr>
                <tr>
                    <td>Versement libératoire</td>
                    <td>${result.sim.versementLiberatoire ? 'Activé' : 'Désactivé'}</td>
                </tr>
            </table>
            
            <div class="detail-category">Charges sociales</div>
            <table class="detail-table">
                <tr>
                    <td>Base de calcul</td>
                    <td>${formatter.format(result.sim.ca)}</td>
                </tr>
                <tr>
                    <td>Taux de cotisations sociales</td>
                    <td>${(result.sim.cotisationsSociales / result.sim.ca * 100).toFixed(1)}%</td>
                </tr>
                <tr>
                    <td>Montant des cotisations sociales</td>
                    <td>${formatter.format(result.sim.cotisationsSociales)}</td>
                </tr>
                <tr>
                    <td>Contribution à la Formation Professionnelle (CFP)</td>
                    <td>${formatter.format(result.sim.cfp || 0)}</td>
                </tr>
                <tr>
                    <td>Cotisation Foncière des Entreprises (CFE)</td>
                    <td>${formatter.format(result.sim.cfe || 0)}</td>
                </tr>
            </table>
            
            <div class="detail-category">Impôt sur le revenu</div>
            <table class="detail-table">
                <tr>
                    <td>Revenu imposable après abattement</td>
                    <td>${formatter.format(result.sim.revenuImposable)}</td>
                </tr>
                <tr>
                    <td>Impôt sur le revenu</td>
                    <td>${formatter.format(result.sim.impotRevenu)}</td>
                </tr>
            </table>
            
            <div class="detail-category">Résultat final</div>
            <table class="detail-table">
                <tr>
                    <td>Chiffre d'affaires</td>
                    <td>${formatter.format(result.sim.ca)}</td>
                </tr>
                <tr>
                    <td>- Cotisations sociales</td>
                    <td>${formatter.format(result.sim.cotisationsSociales)}</td>
                </tr>
                <tr>
                    <td>- CFP</td>
                    <td>${formatter.format(result.sim.cfp || 0)}</td>
                </tr>
                <tr>
                    <td>- CFE</td>
                    <td>${formatter.format(result.sim.cfe || 0)}</td>
                </tr>
                <tr>
                    <td>- Impôt sur le revenu</td>
                    <td>${formatter.format(result.sim.impotRevenu)}</td>
                </tr>
                <tr>
                    <td><strong>= Revenu net en poche</strong></td>
                    <td><strong>${formatter.format(result.sim.revenuNetApresImpot)}</strong></td>
                </tr>
                <tr>
                    <td>Ratio Net/CA</td>
                    <td>${result.sim.ratioNetCA.toFixed(1)}%</td>
                </tr>
            </table>
        `;
    } else if (statutId === 'sasu' || statutId === 'sas' || statutId === 'sa') {
        // Cas des structures avec dirigeant assimilé salarié (SASU, SAS, etc.)
        detailContent = `
            <h2 class="text-2xl font-bold text-blue-400 mb-4">Détail du calcul - ${result.statut}</h2>
            
            <div class="detail-category">Données de base</div>
            <table class="detail-table">
                <tr>
                    <td>Chiffre d'affaires</td>
                    <td>${formatter.format(result.sim.ca)}</td>
                </tr>
                <tr>
                    <td>Résultat de l'entreprise (marge)</td>
                    <td>${formatter.format(result.sim.resultatEntreprise)}</td>
                </tr>
                <tr>
                    <td>Ratio rémunération/dividendes ${result.sim.ratioOptimise ? '(optimisé)' : '(manuel)'}</td>
                    <td>${result.sim.ratioOptimise ? (result.sim.ratioOptimise * 100).toFixed(0) : (result.ratioEffectif * 100).toFixed(0)}% / ${result.sim.ratioOptimise ? (100 - result.sim.ratioOptimise * 100).toFixed(0) : (100 - result.ratioEffectif * 100).toFixed(0)}%</td>
                </tr>
            </table>
            
            <div class="detail-category">Rémunération</div>
            <table class="detail-table">
                <tr>
                    <td>Rémunération brute</td>
                    <td>${formatter.format(result.sim.remuneration)}</td>
                </tr>
                <tr>
                    <td>Charges patronales</td>
                    <td>${formatter.format(result.sim.chargesPatronales)}</td>
                </tr>
                <tr>
                    <td>Charges salariales</td>
                    <td>${formatter.format(result.sim.chargesSalariales)}</td>
                </tr>
                <tr>
                    <td>Coût total employeur</td>
                    <td>${formatter.format(result.sim.coutTotalEmployeur || (result.sim.remuneration + result.sim.chargesPatronales))}</td>
                </tr>
                <tr>
                    <td>Salaire net avant IR</td>
                    <td>${formatter.format(result.sim.salaireNet)}</td>
                </tr>
                <tr>
                    <td>Impôt sur le revenu</td>
                    <td>${formatter.format(result.sim.impotRevenu)}</td>
                </tr>
                <tr>
                    <td>Salaire net après IR</td>
                    <td>${formatter.format(result.sim.salaireNetApresIR)}</td>
                </tr>
            </table>
            
            <div class="detail-category">Dividendes</div>
            <table class="detail-table">
                <tr>
                    <td>Résultat après rémunération</td>
                    <td>${formatter.format(result.sim.resultatApresRemuneration)}</td>
                </tr>
                <tr>
                    <td>Impôt sur les sociétés</td>
                    <td>${formatter.format(result.sim.is)}</td>
                </tr>
                <tr>
                    <td>Résultat après IS</td>
                    <td>${formatter.format(result.sim.resultatApresIS)}</td>
                </tr>
                <tr>
                    <td>Dividendes bruts</td>
                    <td>${formatter.format(result.sim.dividendes)}</td>
                </tr>
                <tr>
                    <td>Prélèvement Forfaitaire Unique (30%)</td>
                    <td>${formatter.format(result.sim.prelevementForfaitaire)}</td>
                </tr>
                <tr>
                    <td>Dividendes nets</td>
                    <td>${formatter.format(result.sim.dividendesNets)}</td>
                </tr>
            </table>
            
            <div class="detail-category">Résultat final</div>
            <table class="detail-table">
                <tr>
                    <td>Salaire net après IR</td>
                    <td>${formatter.format(result.sim.salaireNetApresIR)}</td>
                </tr>
                <tr>
                    <td>+ Dividendes nets</td>
                    <td>${formatter.format(result.sim.dividendesNets)}</td>
                </tr>
                <tr>
                    <td><strong>= Revenu net total</strong></td>
                    <td><strong>${formatter.format(result.sim.revenuNetTotal)}</strong></td>
                </tr>
                <tr>
                    <td>Ratio Net/CA</td>
                    <td>${result.sim.ratioNetCA.toFixed(1)}%</td>
                </tr>
            </table>
        `;
    } else if (statutId === 'eurlIS' || statutId === 'sarl' || statutId === 'selarl') {
        // Cas des structures à l'IS avec un gérant TNS
        detailContent = `
            <h2 class="text-2xl font-bold text-blue-400 mb-4">Détail du calcul - ${result.statut}</h2>
            
            <div class="detail-category">Données de base</div>
            <table class="detail-table">
                <tr>
                    <td>Chiffre d'affaires</td>
                    <td>${formatter.format(result.sim.ca)}</td>
                </tr>
                <tr>
                    <td>Résultat de l'entreprise</td>
                    <td>${formatter.format(result.sim.resultatAvantRemuneration || result.sim.resultatEntreprise)}</td>
                </tr>
                <tr>
                    <td>Ratio rémunération/dividendes ${result.sim.ratioOptimise ? '(optimisé)' : '(manuel)'}</td>
                    <td>${result.sim.ratioOptimise ? (result.sim.ratioOptimise * 100).toFixed(0) : (result.ratioEffectif * 100).toFixed(0)}% / ${result.sim.ratioOptimise ? (100 - result.sim.ratioOptimise * 100).toFixed(0) : (100 - result.ratioEffectif * 100).toFixed(0)}%</td>
                </tr>
                ${statutId === 'sarl' ? `
                <tr>
                    <td>Statut du gérant</td>
                    <td>${result.sim.gerantMajoritaire ? 'Majoritaire (TNS)' : 'Minoritaire (assimilé salarié)'}</td>
                </tr>` : ''}
            </table>
            
            <div class="detail-category">Rémunération</div>
            <table class="detail-table">
                <tr>
                    <td>Rémunération brute</td>
                    <td>${formatter.format(result.sim.remuneration)}</td>
                </tr>
                <tr>
                    <td>Cotisations sociales TNS</td>
                    <td>${formatter.format(result.sim.cotisationsSociales)}</td>
                </tr>
                <tr>
                    <td>Revenu net social</td>
                    <td>${formatter.format(result.sim.remunerationNetteSociale)}</td>
                </tr>
                <tr>
                    <td>Impôt sur le revenu</td>
                    <td>${formatter.format(result.sim.impotRevenu)}</td>
                </tr>
                <tr>
                    <td>Revenu net après IR</td>
                    <td>${formatter.format(result.sim.revenuNetSalaire)}</td>
                </tr>
            </table>
            
            <div class="detail-category">Dividendes</div>
            <table class="detail-table">
                <tr>
                    <td>Résultat après rémunération</td>
                    <td>${formatter.format(result.sim.resultatApresRemuneration)}</td>
                </tr>
                <tr>
                    <td>Impôt sur les sociétés</td>
                    <td>${formatter.format(result.sim.is)}</td>
                </tr>
                <tr>
                    <td>Résultat après IS</td>
                    <td>${formatter.format(result.sim.resultatApresIS)}</td>
                </tr>
                <tr>
                    <td>Dividendes bruts</td>
                    <td>${formatter.format(result.sim.dividendes)}</td>
                </tr>
                ${result.sim.cotTNSDiv ? `
                <tr>
                    <td>Cotisations TNS sur dividendes > 10% du capital</td>
                    <td>${formatter.format(result.sim.cotTNSDiv)}</td>
                </tr>` : ''}
                <tr>
                    <td>Prélèvement Forfaitaire Unique (30%)</td>
                    <td>${formatter.format(result.sim.prelevementForfaitaire)}</td>
                </tr>
                <tr>
                    <td>Dividendes nets</td>
                    <td>${formatter.format(result.sim.dividendesNets)}</td>
                </tr>
            </table>
            
            <div class="detail-category">Résultat final</div>
            <table class="detail-table">
                <tr>
                    <td>Revenu net après IR</td>
                    <td>${formatter.format(result.sim.revenuNetSalaire)}</td>
                </tr>
                <tr>
                    <td>+ Dividendes nets</td>
                    <td>${formatter.format(result.sim.dividendesNets)}</td>
                </tr>
                <tr>
                    <td><strong>= Revenu net total</strong></td>
                    <td><strong>${formatter.format(result.sim.revenuNetTotal)}</strong></td>
                </tr>
                <tr>
                    <td>Ratio Net/CA</td>
                    <td>${result.sim.ratioNetCA.toFixed(1)}%</td>
                </tr>
            </table>
        `;
    } else if (statutId === 'ei' || statutId === 'eurl' || statutId === 'snc') {
        // Cas des entreprises à l'IR
        detailContent = `
            <h2 class="text-2xl font-bold text-green-400 mb-4">Détail du calcul - ${result.statut}</h2>
            
            <div class="detail-category">Données de base</div>
            <table class="detail-table">
                <tr>
                    <td>Chiffre d'affaires</td>
                    <td>${formatter.format(result.sim.ca)}</td>
                </tr>
                <tr>
                    <td>Bénéfice avant cotisations</td>
                    <td>${formatter.format(result.sim.beneficeAvantCotisations || result.sim.resultatAvantRemuneration || result.brut)}</td>
                </tr>
            </table>
            
            <div class="detail-category">Charges sociales</div>
            <table class="detail-table">
                <tr>
                    <td>Base de calcul</td>
                    <td>${formatter.format(result.sim.beneficeAvantCotisations || result.sim.resultatAvantRemuneration || result.brut)}</td>
                </tr>
                <tr>
                    <td>Taux de cotisations sociales TNS</td>
                    <td>~45%</td>
                </tr>
                <tr>
                    <td>Montant des cotisations sociales</td>
                    <td>${formatter.format(result.sim.cotisationsSociales)}</td>
                </tr>
            </table>
            
            <div class="detail-category">Impôt sur le revenu</div>
            <table class="detail-table">
                <tr>
                    <td>Bénéfice après cotisations</td>
                    <td>${formatter.format(result.sim.beneficeApresCotisations || result.sim.beneficeImposable)}</td>
                </tr>
                <tr>
                    <td>Impôt sur le revenu</td>
                    <td>${formatter.format(result.sim.impotRevenu)}</td>
                </tr>
            </table>
            
            <div class="detail-category">Résultat final</div>
            <table class="detail-table">
                <tr>
                    <td>Bénéfice avant cotisations</td>
                    <td>${formatter.format(result.sim.beneficeAvantCotisations || result.sim.resultatAvantRemuneration || result.brut)}</td>
                </tr>
                <tr>
                    <td>- Cotisations sociales</td>
                    <td>${formatter.format(result.sim.cotisationsSociales)}</td>
                </tr>
                <tr>
                    <td>- Impôt sur le revenu</td>
                    <td>${formatter.format(result.sim.impotRevenu)}</td>
                </tr>
                <tr>
                    <td><strong>= Revenu net en poche</strong></td>
                    <td><strong>${formatter.format(result.sim.revenuNetApresImpot)}</strong></td>
                </tr>
                <tr>
                    <td>Ratio Net/CA</td>
                    <td>${result.sim.ratioNetCA.toFixed(1)}%</td>
                </tr>
            </table>
        `;
    } else {
        // Cas par défaut
        detailContent = `
            <h2 class="text-2xl font-bold text-blue-400 mb-4">Détail du calcul - ${result.statut}</h2>
            
            <div class="detail-category">Résultat final</div>
            <table class="detail-table">
                <tr>
                    <td>Chiffre d'affaires</td>
                    <td>${formatter.format(result.sim.ca)}</td>
                </tr>
                <tr>
                    <td>Charges sociales</td>
                    <td>${formatter.format(result.charges)}</td>
                </tr>
                <tr>
                    <td>Impôts (IR + IS + PFU)</td>
                    <td>${formatter.format(result.impots)}</td>
                </tr>
                <tr>
                    <td><strong>Revenu net total</strong></td>
                    <td><strong>${formatter.format(result.net)}</strong></td>
                </tr>
                <tr>
                    <td>Ratio Net/CA</td>
                    <td>${(result.score || 0).toFixed(1)}%</td>
                </tr>
            </table>
            
            <div class="mt-4 p-4 bg-blue-900 bg-opacity-30 rounded-lg text-sm">
                <p><i class="fas fa-info-circle text-blue-400 mr-2"></i> Les calculs détaillés pour ce statut sont spécifiques et complexes. Pour plus d'informations, consultez la documentation fiscale ou un expert-comptable.</p>
            </div>
        `;
    }
    
    modal.innerHTML = `
        <div class="detail-content">
            <span class="close-modal"><i class="fas fa-times"></i></span>
            ${detailContent}
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Ajouter un gestionnaire d'événement pour fermer le modal
    modal.querySelector('.close-modal').addEventListener('click', function() {
        document.body.removeChild(modal);
    });
    
    // Fermer le modal en cliquant en dehors du contenu
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Configurer l'accordéon pour les sections d'informations fiscales
function setupAccordion() {
    // Récupérer le conteneur pour l'accordéon
    const accordionContainer = document.querySelector('.space-y-4');
    if (!accordionContainer) return;
    
    // Vider le conteneur actuel
    accordionContainer.innerHTML = '';
    
    // Récupérer la liste des statuts depuis legalStatuses si disponible, sinon utiliser une liste par défaut
    let statuts = [];
    if (window.legalStatuses) {
        statuts = Object.keys(window.legalStatuses);
    } else {
        // Liste des statuts par défaut
        statuts = ['MICRO', 'EI', 'EURL', 'SASU', 'SARL', 'SAS', 'SA', 'SNC', 'SCI', 'SELARL', 'SELAS', 'SCA'];
    }
    
    // Icônes pour les statuts juridiques
    const statutIcons = {
        'MICRO': '<i class="fas fa-store-alt text-green-400 mr-2"></i>',
        'EI': '<i class="fas fa-user text-green-400 mr-2"></i>',
        'EURL': '<i class="fas fa-user-tie text-green-400 mr-2"></i>',
        'SASU': '<i class="fas fa-user-shield text-blue-400 mr-2"></i>',
        'SARL': '<i class="fas fa-users text-blue-400 mr-2"></i>',
        'SAS': '<i class="fas fa-building text-blue-400 mr-2"></i>',
        'SA': '<i class="fas fa-landmark text-blue-400 mr-2"></i>',
        'SNC': '<i class="fas fa-handshake text-green-400 mr-2"></i>',
        'SCI': '<i class="fas fa-home text-green-400 mr-2"></i>',
        'SELARL': '<i class="fas fa-user-md text-blue-400 mr-2"></i>',
        'SELAS': '<i class="fas fa-stethoscope text-blue-400 mr-2"></i>',
        'SCA': '<i class="fas fa-chart-line text-blue-400 mr-2"></i>'
    };
 // Badge régime fiscal
    const regimeBadges = {
        'MICRO': '<span class="status-badge ir">IR</span>',
        'EI': '<span class="status-badge ir">IR</span>',
        'EURL': '<span class="status-badge iris">IR/IS</span>',
        'SASU': '<span class="status-badge is">IS</span>',
        'SARL': '<span class="status-badge is">IS</span>',
        'SAS': '<span class="status-badge is">IS</span>',
        'SA': '<span class="status-badge is">IS</span>',
        'SNC': '<span class="status-badge ir">IR</span>',
        'SCI': '<span class="status-badge ir">IR</span>',
        'SELARL': '<span class="status-badge is">IS</span>',
        'SELAS': '<span class="status-badge is">IS</span>',
        'SCA': '<span class="status-badge is">IS</span>'
    };
    
    // Générer l'accordéon pour chaque statut
    statuts.forEach(statutId => {
        const nomStatut = window.legalStatuses && window.legalStatuses[statutId] 
            ? window.legalStatuses[statutId].name 
            : getDefaultNomStatut(statutId);
        
        // Créer l'élément d'accordéon
        const accordionItem = document.createElement('div');
        accordionItem.className = 'mb-3';
        
        // Contenu de l'accordéon basé sur le statut
        accordionItem.innerHTML = `
            <button class="accordion-toggle w-full">
                ${statutIcons[statutId] || ''} ${nomStatut} 
                ${regimeBadges[statutId] || ''}
                <i class="fas fa-plus ml-auto"></i>
            </button>
            <div class="hidden px-4 py-3 border-t border-gray-700 bg-blue-900 bg-opacity-20 rounded-b-lg">
                ${getStatutFiscalInfo(statutId)}
            </div>
        `;
        
        accordionContainer.appendChild(accordionItem);
    });
    
    // Attacher les événements aux boutons de l'accordéon
    const toggleBtns = document.querySelectorAll('.accordion-toggle');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const content = this.nextElementSibling;
            content.classList.toggle('hidden');
            
            // Changer l'icône
            const icon = this.querySelector('i:last-child');
            icon.classList.toggle('fa-plus');
            icon.classList.toggle('fa-minus');
            
            // Ajouter/supprimer la classe active
            this.classList.toggle('active');
        });
    });
}

// Fonction d'aide pour obtenir le nom par défaut si legalStatuses n'est pas disponible
function getDefaultNomStatut(statutId) {
    const noms = {
        'MICRO': 'Micro-entreprise',
        'EI': 'Entreprise Individuelle',
        'EURL': 'Entreprise Unipersonnelle à Responsabilité Limitée',
        'SASU': 'Société par Actions Simplifiée Unipersonnelle',
        'SARL': 'Société à Responsabilité Limitée',
        'SAS': 'Société par Actions Simplifiée',
        'SA': 'Société Anonyme',
        'SNC': 'Société en Nom Collectif',
        'SCI': 'Société Civile Immobilière',
        'SELARL': 'Société d\'Exercice Libéral à Responsabilité Limitée',
        'SELAS': 'Société d\'Exercice Libéral par Actions Simplifiée',
        'SCA': 'Société en Commandite par Actions'
    };
    return noms[statutId] || statutId;
}

// Fonction pour générer les informations fiscales de chaque statut
function getStatutFiscalInfo(statutId) {
    // Informations fiscales par défaut pour chaque statut
    const infosFiscales = {
        'MICRO': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR avec abattement forfaitaire</p>
            <p class="mb-2"><strong>Abattements :</strong> 71% (vente), 50% (services BIC), 34% (BNC)</p>
            <p class="mb-2"><strong>Charges sociales :</strong> 12.3% (vente), 21.2% (services), 24.6% (BNC)</p>
            <p class="mb-2"><strong>Versement libératoire :</strong> 1% (vente), 1,7% (services), 2,2% (BNC) sur CA</p>
            <p class="mb-2"><strong>Plafonds 2025 :</strong> 188 700€ (vente) / 77 700€ (services)</p>
        `,
        'EI': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR, imposition sur le bénéfice</p>
            <p class="mb-2"><strong>Cotisations sociales :</strong> ~45% du bénéfice</p>
            <p class="mb-2"><strong>Avantages :</strong> Simplicité de gestion, frais réels déductibles</p>
            <p class="mb-2"><strong>Inconvénients :</strong> Pas de distinction entre patrimoine privé/pro</p>
        `,
        'EURL': `
            <p class="mb-2"><strong>Régimes fiscaux possibles :</strong> IR par défaut ou option IS</p>
            <p class="mb-2"><strong>IR :</strong> Imposition sur la totalité du bénéfice</p>
            <p class="mb-2"><strong>IS :</strong> Impôt sur les sociétés + PFU sur dividendes</p>
            <p class="mb-2"><strong>Cotisations sociales :</strong> Environ 45% de la rémunération du gérant (TNS)</p>
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
        `,
        'SASU': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS uniquement</p>
            <p class="mb-2"><strong>Social :</strong> Président assimilé salarié</p>
            <p class="mb-2"><strong>Cotisations :</strong> ~80% sur rémunération (22% salariales, 55% patronales)</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS (15%/25%) + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Optimisation:</strong> Favoriser les dividendes</p>
        `,
        'SARL': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS presque toujours</p>
            <p class="mb-2"><strong>Social gérant majoritaire :</strong> TNS (~45% de cotisations)</p>
            <p class="mb-2"><strong>Social gérant minoritaire :</strong> Assimilé salarié (~80%)</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
        `,
        'SAS': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS (impôt sur les sociétés)</p>
            <p class="mb-2"><strong>Social :</strong> Président assimilé salarié</p>
            <p class="mb-2"><strong>Cotisations :</strong> ~80% sur rémunération (22% salariales, 55% patronales)</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS (15%/25%) + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Capital minimal :</strong> Libre (1€ suffit)</p>
        `,
        'SA': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS (impôt sur les sociétés)</p>
            <p class="mb-2"><strong>Social :</strong> Président du CA assimilé salarié</p>
            <p class="mb-2"><strong>Particularités :</strong> Conseil d'administration obligatoire (3 membres min)</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Capital minimal :</strong> 37 000€</p>
        `,
        'SNC': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR (transparence fiscale)</p>
            <p class="mb-2"><strong>Particularités :</strong> Responsabilité indéfinie et solidaire des associés</p>
            <p class="mb-2"><strong>Social :</strong> Gérants et associés = TNS</p>
            <p class="mb-2"><strong>Fiscalité :</strong> Bénéfice imposé directement chez les associés</p>
        `,
        'SCI': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR par défaut, option IS possible</p>
            <p class="mb-2"><strong>Activité :</strong> Gestion immobilière (location nue principalement)</p>
            <p class="mb-2"><strong>IR :</strong> Revenus fonciers pour les associés + prélèvements sociaux 17.2%</p>
            <p class="mb-2"><strong>IS :</strong> Rarement avantageux sauf activité commerciale</p>
        `,
        'SELARL': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS presque toujours</p>
            <p class="mb-2"><strong>Particularités :</strong> Réservée aux professions libérales réglementées</p>
            <p class="mb-2"><strong>Social :</strong> Gérant majoritaire = TNS</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
        `,
        'SELAS': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Particularités :</strong> Réservée aux professions libérales réglementées</p>
            <p class="mb-2"><strong>Social :</strong> Président assimilé salarié</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Capital minimal :</strong> Libre</p>
        `,
        'SCA': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Structure :</strong> Commandités (responsabilité illimitée) et commanditaires</p>
            <p class="mb-2"><strong>Social :</strong> Gérants = TNS</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
            <p class="mb-2"><strong>Capital minimal :</strong> 37 000€</p>
        `
    };
    
    return infosFiscales[statutId] || `<p>Informations non disponibles pour ${statutId}</p>`;
}// Contenu trop volumineux pour être inclus dans la demande
