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
    <div class="max-w-6xl mx-auto">
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
        #sim-results {
            border-collapse: separate;
            border-spacing: 0;
            width: 100%;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            table-layout: fixed;
        }
        
        #sim-results thead tr {
            background: linear-gradient(90deg, #112240, #1A365D);
        }
        
        #sim-results th {
            padding: 1rem 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-size: 0.85rem;
            text-align: left;
            white-space: nowrap;
        }
        
        #sim-results td {
            padding: 0.75rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        #sim-results tbody tr {
            transition: all 0.2s;
        }
        
        #sim-results tbody tr:hover {
            background-color: rgba(30, 58, 138, 0.5) !important;
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
        
        /* Amélioration de la largeur du tableau */
        #results-container {
            width: 98%;
            max-width: 1400px !important;
            margin-left: auto;
            margin-right: auto;
            overflow-x: auto;
        }
        
        /* Ajustement des colonnes pour une meilleure lisibilité */
        #sim-results th:first-child, #sim-results td:first-child {
            width: 20%;
        }
        
        #sim-results th:last-child, #sim-results td:last-child {
            width: 15%;
        }
        
        #sim-results th:not(:first-child):not(:last-child), 
        #sim-results td:not(:first-child):not(:last-child) {
            width: 13%;
            text-align: right;
        }
        
        /* Style pour le responsive sur petits écrans */
        @media (max-width: 768px) {
            #sim-results {
                display: block;
                overflow-x: auto;
                white-space: nowrap;
            }
            
            #results-container {
                width: 100%;
                max-width: 100% !important;
                padding: 0 !important;
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
    
    // Vérifier si les options ex