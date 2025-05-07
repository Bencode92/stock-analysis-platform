// fiscal-guide.js - Simulateur fiscal simplifié pour l'onglet Guide fiscal
// Version 3.2 - Mai 2025 - Optimisation automatique et dividendes toujours affichés

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
    
    // Créer un contenu pour l'onglet méthodologie
    setupMethodologyTab();
});

// Fonction pour configurer l'onglet méthodologie
function setupMethodologyTab() {
    // Écouter le clic sur l'onglet Méthodologie
    const tabItems = document.querySelectorAll('.tab-item');
    if (tabItems && tabItems.length > 4) { // L'onglet Méthodologie est le 5ème
        tabItems[4].addEventListener('click', function() {
            // Cacher le contenu du simulateur
            document.getElementById('question-container').style.display = 'none';
            document.getElementById('results-container').style.display = 'none';
            document.querySelector('.progress-info').style.display = 'none';
            document.querySelector('.progress-bar-container').style.display = 'none';
            document.getElementById('progress-steps-container').style.display = 'none';
            
            // Afficher le contenu de l'onglet
            const tabContainer = document.getElementById('tab-content-container');
            tabContainer.style.display = 'block';
            
            // Générer le contenu de méthodologie
            tabContainer.innerHTML = getMethodologyContent();
            
            // Mettre à jour l'onglet actif
            tabItems.forEach(item => item.classList.remove('active'));
            this.classList.add('active');
        });
    }
}

// Fonction pour générer le contenu de l'onglet méthodologie
function getMethodologyContent() {
    return `
    <div class="max-w-4xl mx-auto">
        <h2 class="text-3xl font-bold text-green-400 mb-6">Méthodologie de calcul</h2>
        
        <div class="bg-blue-900 bg-opacity-30 p-6 rounded-xl mb-8">
            <h3 class="text-xl font-semibold mb-4">Introduction à la méthodologie</h3>
            <p class="mb-4">Ce simulateur a été conçu pour vous offrir une estimation précise de l'impact fiscal et social des différents statuts juridiques. Les calculs s'appuient sur les barèmes officiels 2025 et les règles fiscales en vigueur à cette date.</p>
            <p>Pour simplifier la présentation, certaines situations particulières ou niches fiscales ne sont pas prises en compte. Il est recommandé de consulter un expert-comptable pour une analyse personnalisée complète.</p>
        </div>
        
        <h3 class="text-2xl font-bold text-green-400 mb-4">Fiches méthodologiques par statut</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <!-- Micro-entreprise -->
            <div class="bg-blue-900 bg-opacity-20 p-4 rounded-lg border border-blue-800">
                <h4 class="font-bold text-blue-400 mb-2 flex items-center">
                    <i class="fas fa-store-alt mr-2"></i> Micro-entreprise
                </h4>
                <div class="text-sm">
                    <p class="mb-2"><strong>Cotisations sociales:</strong> Calculées sur le CA (12.3% pour vente, 21.2% pour services)</p>
                    <p class="mb-2"><strong>Abattement fiscal:</strong> 71% (vente), 50% (services BIC), 34% (BNC)</p>
                    <p class="mb-2"><strong>Impôt sur le revenu:</strong> (CA × (1 - Abattement)) × Taux marginal</p>
                    <p class="mb-2"><strong>Net en poche:</strong> CA - Cotisations - Impôt</p>
                </div>
            </div>
            
            <!-- EURL -->
            <div class="bg-blue-900 bg-opacity-20 p-4 rounded-lg border border-blue-800">
                <h4 class="font-bold text-blue-400 mb-2 flex items-center">
                    <i class="fas fa-user-tie mr-2"></i> EURL
                </h4>
                <div class="text-sm">
                    <p class="mb-2"><strong>IR:</strong> Transparence fiscale, le bénéfice est imposé au nom du gérant</p>
                    <p class="mb-2"><strong>IS:</strong> Impôt société sur le bénéfice après rémunération + PFU sur dividendes</p>
                    <p class="mb-2"><strong>Cotisations TNS:</strong> ~45% sur la rémunération</p>
                    <p class="mb-2"><strong>Optimisation:</strong> Ratio rémunération/dividendes à l'IS</p>
                </div>
            </div>
            
            <!-- SASU -->
            <div class="bg-blue-900 bg-opacity-20 p-4 rounded-lg border border-blue-800">
                <h4 class="font-bold text-blue-400 mb-2 flex items-center">
                    <i class="fas fa-user-shield mr-2"></i> SASU
                </h4>
                <div class="text-sm">
                    <p class="mb-2"><strong>Charges sociales:</strong> ~80% sur salaire (55% patronales, 22% salariales)</p>
                    <p class="mb-2"><strong>IS:</strong> 15% jusqu'à 42 500€, 25% au-delà</p>
                    <p class="mb-2"><strong>Dividendes:</strong> PFU 30% (17.2% PS + 12.8% IR)</p>
                    <p class="mb-2"><strong>Optimisation:</strong> Équilibre salaire/dividendes</p>
                </div>
            </div>
            
            <!-- Autres statuts -->
            <div class="bg-blue-900 bg-opacity-20 p-4 rounded-lg border border-blue-800">
                <h4 class="font-bold text-blue-400 mb-2 flex items-center">
                    <i class="fas fa-building mr-2"></i> Autres statuts
                </h4>
                <div class="text-sm">
                    <p class="mb-2">Chaque statut applique une combinaison spécifique de ces mécanismes:</p>
                    <ul class="list-disc pl-4 mb-2">
                        <li>Cotisations TNS ou charges assimilé salarié</li>
                        <li>Imposition à l'IR ou IS + PFU</li>
                        <li>Répartition entre rémunération et dividendes</li>
                    </ul>
                    <p>Le simulateur prend en compte les spécificités de chaque régime.</p>
                </div>
            </div>
        </div>
        
        <div class="bg-green-900 bg-opacity-20 border border-green-800 p-6 rounded-xl mb-8">
            <h3 class="text-xl font-semibold text-green-400 mb-4">Exemple de calcul détaillé</h3>
            
            <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg mb-4">
                <h4 class="font-medium mb-2">Micro-entreprise (BIC Services)</h4>
                <div class="text-sm">
                    <p class="mb-1">CA = 50 000€</p>
                    <p class="mb-1">Cotisations sociales = 50 000 × 21.2% = 10 600€</p>
                    <p class="mb-1">Abattement forfaitaire = 50 000 × 50% = 25 000€</p>
                    <p class="mb-1">Revenu imposable = 50 000 - 25 000 = 25 000€</p>
                    <p class="mb-1">Avec TMI à 30% → Impôt = 25 000 × 30% = 7 500€</p>
                    <p class="mb-1">Revenu net = 50 000 - 10 600 - 7 500 = 31 900€</p>
                </div>
            </div>
            
            <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg">
                <h4 class="font-medium mb-2">SASU</h4>
                <div class="text-sm">
                    <p class="mb-1">CA = 50 000€, Marge = 30% → Résultat = 15 000€</p>
                    <p class="mb-1">Rémunération brute (70%) = 10 500€</p>
                    <p class="mb-1">Charges patronales = 10 500 × 55% = 5 775€</p>
                    <p class="mb-1">Charges salariales = 10 500 × 22% = 2 310€</p>
                    <p class="mb-1">Net avant IR = 8 190€</p>
                    <p class="mb-1">IR (TMI 30%) = 8 190 × 30% = 2 457€</p>
                    <p class="mb-1">Résultat après rémunération = 4 500€</p>
                    <p class="mb-1">IS (15%) = 4 500 × 15% = 675€</p>
                    <p class="mb-1">Dividendes bruts = 3 825€</p>
                    <p class="mb-1">PFU (30%) = 3 825 × 30% = 1 148€</p>
                    <p class="mb-1">Dividendes nets = 2 677€</p>
                    <p class="mb-1">Net total = 5 733€ (salaire) + 2 677€ (dividendes) = 8 410€</p>
                </div>
            </div>
        </div>
        
        <div class="bg-purple-900 bg-opacity-20 border border-purple-800 p-6 rounded-xl mb-8">
            <h3 class="text-xl font-semibold text-purple-400 mb-4">Calcul avancé de l'impôt sur le revenu</h3>
            
            <p class="mb-4">L'IR est calculé selon les tranches progressives 2025:</p>
            
            <div class="grid grid-cols-2 gap-4 text-sm mb-4">
                <div class="bg-blue-900 bg-opacity-40 p-2 rounded">
                    <strong>Tranche</strong>
                </div>
                <div class="bg-blue-900 bg-opacity-40 p-2 rounded">
                    <strong>Taux</strong>
                </div>
                <div class="p-2">0€ à 11 294€</div>
                <div class="p-2">0%</div>
                <div class="p-2">11 295€ à 28 797€</div>
                <div class="p-2">11%</div>
                <div class="p-2">28 798€ à 82 341€</div>
                <div class="p-2">30%</div>
                <div class="p-2">82 342€ à 177 106€</div>
                <div class="p-2">41%</div>
                <div class="p-2">Au-delà de 177 106€</div>
                <div class="p-2">45%</div>
            </div>
            
            <p class="text-sm">Cette méthode est plus précise que l'application directe du TMI, particulièrement pour les revenus élevés ou à cheval sur plusieurs tranches.</p>
        </div>
        
        <div class="bg-blue-900 bg-opacity-20 border border-blue-800 p-6 rounded-xl">
            <h3 class="text-xl font-semibold mb-4">Limites et précautions</h3>
            
            <ul class="list-disc pl-6 space-y-2 text-sm">
                <li>Ces calculs sont indicatifs et ne remplacent pas l'avis d'un expert-comptable.</li>
                <li>Les éléments non pris en compte incluent: situation familiale détaillée, autres revenus, crédits d'impôt spécifiques, régimes spéciaux.</li>
                <li>Tous les montants sont arrondis à l'euro près.</li>
                <li>L'outil ne constitue pas un conseil fiscal personnalisé.</li>
            </ul>
        </div>
    </div>
    `;
}

// Fonction pour ajouter des styles personnalisés
function addCustomStyles() {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        /* Styles pour l'accordéon */
        .accordion-toggle {
            display: flex;
            align-items: center;
            border-radius: 8px;
            transition: all 0.2s ease;
            padding: 1rem 1.5rem;
            background: rgba(13, 37, 87, 0.6);
            margin-bottom: 0.5rem;
            border-left: 4px solid transparent;
        }
        
        .accordion-toggle:hover {
            background: rgba(27, 60, 131, 0.7);
            transform: translateX(3px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        
        .accordion-toggle.active {
            border-left-color: #00FF87;
        }
        
        .accordion-toggle i:first-of-type {
            font-size: 1.25rem;
            margin-right: 0.75rem;
        }
        
        .status-badge {
            margin-left: auto;
            margin-right: 1rem;
            font-weight: 500;
            padding: 0.2rem 0.6rem;
            border-radius: 4px;
            font-size: 0.8rem;
        }
        
        .status-badge.ir {
            background: rgba(0, 255, 135, 0.2);
            color: #00FF87;
        }
        
        .status-badge.is {
            background: rgba(59, 130, 246, 0.2);
            color: #60A5FA;
        }
        
        .status-badge.iris {
            background: linear-gradient(90deg, rgba(0, 255, 135, 0.1), rgba(59, 130, 246, 0.1));
            color: #A5F3C9;
        }
        
        /* Styles pour le tableau de résultats */
        /* Conteneur de tableau avec défilement horizontal */
        #sim-results-container {
            width: 100%;
            overflow-x: auto;
            margin-bottom: 2rem;
            padding-bottom: 0.5rem;
            -webkit-overflow-scrolling: touch;
        }
        
        #sim-results {
            border-collapse: separate;
            border-spacing: 0;
            width: 100%;
            min-width: 900px; /* Largeur minimum pour assurer que toutes les colonnes sont visibles */
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        
        #sim-results thead tr {
            background: linear-gradient(90deg, #112240, #1A365D);
        }
        
        #sim-results th {
            padding: 1rem 1rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-size: 0.85rem;
            text-align: left;
            white-space: nowrap;
        }
        
        #sim-results tbody tr {
            transition: all 0.2s;
        }
        
        #sim-results tbody tr:hover {
            background-color: rgba(30, 58, 138, 0.5) !important;
        }
        
        #sim-results td {
            padding: 0.75rem 1rem;
            white-space: nowrap;
        }
        
        .result-top-row {
            background: linear-gradient(90deg, rgba(0, 255, 135, 0.1), rgba(0, 204, 106, 0.05)) !important;
            border-left: 4px solid #00FF87;
        }
        
        .net-value {
            font-weight: 600;
            font-size: 1.05rem;
        }
        
        .net-value.top {
            color: #00FF87;
        }
        
        .status-icon {
            font-size: 1.2rem;
            margin-right: 0.5rem;
            vertical-align: middle;
        }
        
        .ratio-row {
            background: rgba(30, 58, 138, 0.2) !important;
            font-style: italic;
        }
        
        /* Styles pour les boutons de filtre */
        .status-filter-btn {
            transition: all 0.2s ease;
        }
        
        .status-filter-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
        }
        
        /* Styles pour les badges de régime fiscal */
        .regime-badge {
            display: inline-block;
            padding: 0.1rem 0.5rem;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 600;
            margin-left: 0.5rem;
            vertical-align: middle;
        }
        
        .regime-badge.ir {
            background: rgba(0, 255, 135, 0.2);
            color: #00FF87;
        }
        
        .regime-badge.is {
            background: rgba(59, 130, 246, 0.2);
            color: #60A5FA;
        }
        
        /* Zone de sélection personnalisée */
        #custom-status-options {
            border-radius: 8px;
            background: rgba(17, 34, 64, 0.6);
            box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.2);
        }
        
        /* Style pour les ratio optimaux */
        .ratio-optimal-value {
            padding: 0.2rem 0.5rem;
            background-color: rgba(139, 92, 246, 0.2);
            border-radius: 4px;
            color: #A78BFA;
            font-weight: 600;
        }
        
        /* Ajout de styles pour rendre l'interface plus responsive */
        @media (max-width: 768px) {
            #sim-results-container {
                margin-left: -1rem;
                margin-right: -1rem;
                width: calc(100% + 2rem);
            }
            
            .content-wrapper {
                padding-left: 0.5rem;
                padding-right: 0.5rem;
            }
        }
    `;
    document.head.appendChild(styleElement);
}

function initFiscalSimulator() {
    console.log("Initialisation du simulateur fiscal simplifié...");
    
    // Attendre que SimulationsFiscales et FiscalUtils soient chargés
    const checkDependencies = setInterval(() => {
        if (window.SimulationsFiscales && window.FiscalUtils) {
            clearInterval(checkDependencies);
            console.log("Dépendances trouvées, configuration du simulateur...");
            setupSimulator();
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
                            </div>
                            <div>
                                <span class="bg-purple-900 bg-opacity-20 px-3 py-1 rounded-md text-purple-300 font-medium">
                                    <i class="fas fa-magic mr-2"></i>Optimisation automatique du ratio rémunération/dividendes
                                </span>
                            </div>
                        </div>
                    </div>
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
        
        // Ajouter un événement aux cases à cocher
        document.querySelectorAll('.status-checkbox').forEach(checkbox => {
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
    
    // Mode expert toujours activé
    const modeExpert = true;
    
    const resultsContainer = document.querySelector('#sim-results');
    if (!resultsContainer) {
        // Si le tableau n'existe pas encore, créer son conteneur avec la classe pour le défilement
        const resultsTableContainer = document.createElement('div');
        resultsTableContainer.id = 'sim-results-container';
        
        const resultsTable = document.createElement('table');
        resultsTable.id = 'sim-results';
        resultsTable.innerHTML = `
            <thead>
                <tr>
                    <th class="px-4 py-3 rounded-tl-lg">Statut</th>
                    <th class="px-4 py-3">Rémunération brute</th>
                    <th class="px-4 py-3">Charges sociales</th>
                    <th class="px-4 py-3">Impôts</th>
                    <th class="px-4 py-3">Dividendes nets</th>
                    <th class="px-4 py-3">Ratio optimal</th>
                    <th class="px-4 py-3 rounded-tr-lg">Net en poche</th>
                </tr>
            </thead>
            <tbody id="sim-results-body"></tbody>
        `;
        
        resultsTableContainer.appendChild(resultsTable);
        
        // Trouver l'élément results-container
        const container = document.getElementById('results-container');
        if (container) {
            container.appendChild(resultsTableContainer);
        }
    }
    
    const resultsBody = document.getElementById('sim-results-body');
    if (!resultsBody) return;
    
    // Paramètres communs pour toutes les simulations
    const params = {
        ca: ca,
        tauxMarge: marge,
        tauxRemuneration: ratioSalaire,
        tmiActuel: tmi,
        modeExpert: modeExpert
    };
    
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
    
    // Optimisation toujours activée pour les statuts à l'IS
    const shouldOptimize = true;
    
    // Définir les stratégies d'optimisation par type de statut
    const optimisationParStatut = {
        // Structures assimilées salarié: charge lourdes (favoriser dividendes)
        'sasu': { ratioMin: 0, ratioMax: 1, favoriserDividendes: true },
        'sas': { ratioMin: 0, ratioMax: 1, favoriserDividendes: true },
        'sa': { ratioMin: 0, ratioMax: 1, favoriserDividendes: true },
        'selas': { ratioMin: 0, ratioMax: 1, favoriserDividendes: true },
        
        // Structures TNS: charges moins lourdes (plus équilibré)
        'eurlIS': { ratioMin: 0, ratioMax: 1, favoriserDividendes: false },
        'sarl': { ratioMin: 0, ratioMax: 1, favoriserDividendes: false },
        'selarl': { ratioMin: 0, ratioMax: 1, favoriserDividendes: false },
        'sca': { ratioMin: 0, ratioMax: 1, favoriserDividendes: false },
        
        // Structures sans distinction rémunération/dividendes (pas d'optimisation)
        'micro': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false }, // Tout en rémunération
        'ei': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false }, // Tout en rémunération
        'eurl': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false }, // Tout en rémunération
        'snc': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false }, // Tout en rémunération
        'sci': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false } // Pas de rémunération pour SCI
    };
    
    // Associer chaque statut à sa fonction de simulation et son nom d'affichage
    const statutsComplets = {
        'micro': { 
            nom: 'Micro-entreprise', 
            simuler: () => window.SimulationsFiscales.simulerMicroEntreprise({
                ca: ca,
                typeMicro: 'BIC',
                tmiActuel: tmi,
                modeExpert: modeExpert
            })
        },
        'ei': { 
            nom: 'Entreprise Individuelle', 
            simuler: () => window.SimulationsFiscales.simulerEI({
                ca: ca,
                tauxMarge: marge,
                tmiActuel: tmi,
                modeExpert: modeExpert
            })
        },
        'eurl': { 
            nom: 'EURL à l\'IR', 
            simuler: () => window.SimulationsFiscales.simulerEURL({
                ca: ca,
                tauxMarge: marge,
                tauxRemuneration: ratioSalaire,
                optionIS: false,
                tmiActuel: tmi,
                modeExpert: modeExpert
            })
        },
        'eurlIS': { 
            nom: 'EURL à l\'IS', 
            simuler: () => {
                // Si optimisation activée, trouver le meilleur ratio selon les contraintes du statut
                if (shouldOptimize) {
                    const config = optimisationParStatut['eurlIS'];
                    const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                        { ...params, 
                          ratioMin: config.ratioMin, 
                          ratioMax: config.ratioMax, 
                          favoriserDividendes: config.favoriserDividendes 
                        },
                        (p) => window.SimulationsFiscales.simulerEURL({...p, optionIS: true})
                    );
                    return optimisation.resultat;
                }
                
                return window.SimulationsFiscales.simulerEURL({
                    ca: ca,
                    tauxMarge: marge,
                    tauxRemuneration: ratioSalaire,
                    optionIS: true,
                    tmiActuel: tmi,
                    modeExpert: modeExpert
                });
            }
        },
        'sasu': { 
            nom: 'SASU', 
            simuler: () => {
                // Si optimisation activée, trouver le meilleur ratio selon les contraintes du statut
                if (shouldOptimize) {
                    const config = optimisationParStatut['sasu'];
                    const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                        { ...params, 
                          ratioMin: config.ratioMin, 
                          ratioMax: config.ratioMax, 
                          favoriserDividendes: config.favoriserDividendes 
                        },
                        (p) => window.SimulationsFiscales.simulerSASU(p)
                    );
                    return optimisation.resultat;
                }
                
                return window.SimulationsFiscales.simulerSASU({
                    ca: ca,
                    tauxMarge: marge,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi,
                    modeExpert: modeExpert
                });
            }
        },
        'sarl': { 
            nom: 'SARL', 
            simuler: () => {
                // Si optimisation activée, trouver le meilleur ratio selon les contraintes du statut
                if (shouldOptimize) {
                    const config = optimisationParStatut['sarl'];
                    const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                        { ...params, 
                          ratioMin: config.ratioMin, 
                          ratioMax: config.ratioMax, 
                          favoriserDividendes: config.favoriserDividendes 
                        },
                        (p) => window.SimulationsFiscales.simulerSARL({...p, gerantMajoritaire: true})
                    );
                    return optimisation.resultat;
                }
                
                return window.SimulationsFiscales.simulerSARL({
                    ca: ca,
                    tauxMarge: marge,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi,
                    gerantMajoritaire: true,
                    modeExpert: modeExpert
                });
            }
        },
        'sas': { 
            nom: 'SAS', 
            simuler: () => {
                // Si optimisation activée, trouver le meilleur ratio selon les contraintes du statut
                if (shouldOptimize) {
                    const config = optimisationParStatut['sas'];
                    const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                        { ...params, 
                          ratioMin: config.ratioMin, 
                          ratioMax: config.ratioMax, 
                          favoriserDividendes: config.favoriserDividendes 
                        },
                        (p) => window.SimulationsFiscales.simulerSAS(p)
                    );
                    return optimisation.resultat;
                }
                
                return window.SimulationsFiscales.simulerSAS({
                    ca: ca,
                    tauxMarge: marge,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi,
                    modeExpert: modeExpert
                });
            }
        },
        'sa': { 
            nom: 'SA', 
            simuler: () => {
                // Si optimisation activée, trouver le meilleur ratio selon les contraintes du statut
                if (shouldOptimize) {
                    const config = optimisationParStatut['sa'];
                    const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                        { ...params, 
                          ratioMin: config.ratioMin, 
                          ratioMax: config.ratioMax, 
                          favoriserDividendes: config.favoriserDividendes 
                        },
                        (p) => window.SimulationsFiscales.simulerSA(p)
                    );
                    return optimisation.resultat;
                }
                
                return window.SimulationsFiscales.simulerSA({
                    ca: ca,
                    tauxMarge: marge,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi,
                    modeExpert: modeExpert
                });
            }
        },
        'snc': { 
            nom: 'SNC', 
            simuler: () => window.SimulationsFiscales.simulerSNC({
                ca: ca,
                tauxMarge: marge,
                tmiActuel: tmi,
                modeExpert: modeExpert
            })
        },
        'sci': { 
            nom: 'SCI', 
            simuler: () => window.SimulationsFiscales.simulerSCI({
                revenuLocatif: ca,
                chargesDeductibles: ca * (1 - marge),
                tmiActuel: tmi,
                modeExpert: modeExpert
            })
        },
        'selarl': { 
            nom: 'SELARL', 
            simuler: () => {
                // Si optimisation activée, trouver le meilleur ratio selon les contraintes du statut
                if (shouldOptimize) {
                    const config = optimisationParStatut['selarl'];
                    const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                        { ...params, 
                          ratioMin: config.ratioMin, 
                          ratioMax: config.ratioMax, 
                          favoriserDividendes: config.favoriserDividendes 
                        },
                        (p) => window.SimulationsFiscales.simulerSELARL(p)
                    );
                    return optimisation.resultat;
                }
                
                return window.SimulationsFiscales.simulerSELARL({
                    ca: ca,
                    tauxMarge: marge,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi,
                    modeExpert: modeExpert
                });
            }
        },
        'selas': { 
            nom: 'SELAS', 
            simuler: () => {
                // Si optimisation activée, trouver le meilleur ratio selon les contraintes du statut
                if (shouldOptimize) {
                    const config = optimisationParStatut['selas'];
                    const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                        { ...params, 
                          ratioMin: config.ratioMin, 
                          ratioMax: config.ratioMax, 
                          favoriserDividendes: config.favoriserDividendes 
                        },
                        (p) => window.SimulationsFiscales.simulerSELAS(p)
                    );
                    return optimisation.resultat;
                }
                
                return window.SimulationsFiscales.simulerSELAS({
                    ca: ca,
                    tauxMarge: marge,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi,
                    modeExpert: modeExpert
                });
            }
        },
        'sca': { 
            nom: 'SCA', 
            simuler: () => {
                // Si optimisation activée, trouver le meilleur ratio selon les contraintes du statut
                if (shouldOptimize) {
                    const config = optimisationParStatut['sca'];
                    const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                        { ...params, 
                          ratioMin: config.ratioMin, 
                          ratioMax: config.ratioMax, 
                          favoriserDividendes: config.favoriserDividendes 
                        },
                        (p) => window.SimulationsFiscales.simulerSCA(p)
                    );
                    return optimisation.resultat;
                }
                
                return window.SimulationsFiscales.simulerSCA({
                    ca: ca,
                    tauxMarge: marge,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi,
                    modeExpert: modeExpert
                });
            }
        }
    };
    
    // Simuler chaque statut sélectionné
    for (const statutId of selectedStatuses) {
        if (statutsComplets[statutId]) {
            try {
                const statut = statutsComplets[statutId];
                const sim = statut.simuler();
                
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
                    charges = sim.cotisationsSociales;
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
                    brut = sim.remuneration || sim.resultatEntreprise * ratioSalaire;
                    charges = sim.cotisationsSociales || (sim.chargesPatronales + sim.chargesSalariales);
                    impots = (sim.impotRevenu || 0) + (sim.is || 0) + (sim.prelevementForfaitaire || 0);
                    net = sim.revenuNetTotal || sim.revenuNetApresImpot;
                }
                
                resultats.push({
                    statutId: statutId,
                    statut: statut.nom,
                    brut: brut,
                    charges: charges,
                    impots: impots,
                    net: net,
                    sim: sim,
                    score: 100 * (net / ca),
                    ratioOptimise: sim.ratioOptimise,
                    dividendesNets: sim.dividendesNets || 0
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
            optimisationValue = `<span class="ratio-optimal-value">${Math.round(res.ratioOptimise*100)}% rém.</span>`;
        } else if (res.statutId === 'micro' || res.statutId === 'ei' || res.statutId === 'eurl' || res.statutId === 'snc' || res.statutId === 'sci') {
            optimisationValue = "N/A";
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
                <span class="net-value ${isTopResult ? 'top' : ''}">${res.net === '-' ? '-' : (typeof res.net === 'string' ? res.net : formatter.format(res.net))}</span>
            </td>
        `;
        
        resultsBody.appendChild(row);
    });
    
    // Ajouter une ligne de mode de calcul
    const modeRow = document.createElement('tr');
    modeRow.className = 'bg-pink-900 bg-opacity-20 text-sm border-t border-pink-800';
    
    modeRow.innerHTML = `
        <td colspan="7" class="px-4 py-2 font-medium text-pink-300">
            <i class="fas fa-chart-line mr-2"></i> 
            Mode expert activé : calcul par tranches progressives d'IR + optimisation automatique du ratio rémunération/dividendes
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
            <p class="mb-2"><strong>Charges sociales :</strong> 12.3% (vente), 21.2% (services) du CA</p>
            <p class="mb-2"><strong>Plafonds 2025 :</strong> 188 700€ (vente), 77 700€ (services)</p>
            <p class="mb-2"><strong>Option versement libératoire :</strong> Possible si revenu fiscal N-2 < plafond</p>
        `,
        'EI': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR par défaut</p>
            <p class="mb-2"><strong>Option IS :</strong> Possible</p>
            <p class="mb-2"><strong>Charges sociales :</strong> Environ 45% sur le bénéfice</p>
            <p class="mb-2"><strong>Plafonds :</strong> Aucun</p>
            <p class="mb-2"><strong>Particularité :</strong> Patrimoine professionnel distinct depuis 2022</p>
        `,
        'EURL': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR par défaut (gérant associé unique)</p>
            <p class="mb-2"><strong>Option fiscale :</strong> IS possible</p>
            <p class="mb-2"><strong>Charges sociales :</strong> TNS (~40-45% sur rémunération)</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
        `,
        'SASU': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS (Impôt sur les Sociétés)</p>
            <p class="mb-2"><strong>Charges sociales :</strong> Environ 80-85% sur salaire brut (part salariale + patronale)</p>
            <p class="mb-2"><strong>Rémunération président :</strong> Assimilé salarié</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
        `,
        'SARL': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS (option IR possible sur 5 ans)</p>
            <p class="mb-2"><strong>Charges sociales :</strong> TNS pour gérant majoritaire, assimilé salarié pour gérant minoritaire</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2"><strong>Particularité :</strong> Structure flexible adaptée aux PME et entreprises familiales</p>
        `,
        'SAS': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Charges sociales :</strong> Assimilé salarié pour le président</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2"><strong>Particularité :</strong> Adaptée aux structures avec investisseurs</p>
        `,
        'SA': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Capital minimum :</strong> 37 000€</p>
            <p class="mb-2"><strong>Charges sociales :</strong> Assimilé salarié pour les dirigeants</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2"><strong>Particularité :</strong> Structure pour grandes entreprises ou cotation en bourse</p>
        `,
        'SNC': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR (transparence fiscale)</p>
            <p class="mb-2"><strong>Option IS :</strong> Possible</p>
            <p class="mb-2"><strong>Charges sociales :</strong> TNS pour les associés</p>
            <p class="mb-2"><strong>Particularité :</strong> Imposition directe des bénéfices aux associés (IR)</p>
            <p class="mb-2"><strong>Responsabilité :</strong> Indéfinie et solidaire des associés</p>
        `,
        'SCI': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR par défaut (transparence fiscale)</p>
            <p class="mb-2"><strong>Option IS :</strong> Possible mais généralement défavorable</p>
            <p class="mb-2"><strong>TVA :</strong> Exonération possible pour location nue</p>
            <p class="mb-2"><strong>Particularité :</strong> Revenus fonciers pour les associés à l'IR</p>
            <p class="mb-2"><strong>Usage :</strong> Gestion et transmission de patrimoine immobilier</p>
        `,
        'SELARL': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Charges sociales :</strong> TNS pour gérant majoritaire</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2"><strong>Particularité :</strong> Réservée aux professions libérales réglementées</p>
        `,
        'SELAS': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Charges sociales :</strong> Assimilé salarié pour le président</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2"><strong>Particularité :</strong> Réservée aux professions libérales réglementées</p>
            <p class="mb-2"><strong>Avantages :</strong> Combine flexibilité de la SAS et exercice libéral</p>
        `,
        'SCA': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Structure :</strong> Commandités (responsabilité illimitée) et commanditaires (limitée)</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2"><strong>Particularité :</strong> Protection contre les OPA hostiles</p>
            <p class="mb-2"><strong>Usage :</strong> Structure familiale cherchant à lever des fonds</p>
        `
    };
    
    return infosFiscales[statutId] || `<p class="mb-2">Informations fiscales non disponibles pour ce statut.</p>`;
}

// Exposer l'initialisation au niveau global pour l'onglet
window.initFiscalSimulator = initFiscalSimulator;
