// app.js - Fichier principal d'initialisation du simulateur de forme juridique

/**
 * ========== NOUVEAU : Initialiser le comparateur automatiquement ==========
 * (détecte #comparatif-container sur les pages en sections, ex. types-entreprise-v2.html)
 */
function initComparatifAuto() {
    // Attendre un peu que tous les scripts soient chargés
    setTimeout(() => {
        const comparatifContainer = document.getElementById('comparatif-container');

        if (comparatifContainer && typeof window.initComparatifStatuts === 'function') {
            console.log('✅ Conteneur comparatif détecté, initialisation automatique...');
            try {
                window.initComparatifStatuts();
                console.log('✅ Comparateur initialisé avec succès');
            } catch (error) {
                console.error('❌ Erreur lors de l\'initialisation du comparateur:', error);
            }
        } else if (comparatifContainer && typeof window.initComparatifStatuts !== 'function') {
            console.warn('⚠️ Conteneur présent mais fonction initComparatifStatuts non disponible, nouvelle tentative...');
            // Réessayer après 1 seconde
            setTimeout(() => {
                if (typeof window.initComparatifStatuts === 'function') {
                    try {
                        window.initComparatifStatuts();
                        console.log('✅ Comparateur initialisé avec succès (2ème tentative)');
                    } catch (error) {
                        console.error('❌ Erreur lors de l\'initialisation du comparateur (2ème tentative):', error);
                    }
                } else {
                    console.error('❌ Fonction initComparatifStatuts toujours non disponible');
                }
            }, 1000);
        }
    }, 500);
}

// Fonction d'initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    // Mettre à jour la date de dernière mise à jour
    updateLastUpdateDate();
    
    // Initialiser le gestionnaire de questions
    initQuestionManager();
    
    // Initialiser les événements de l'interface
    initUIEvents();
    
    // Initialiser le moteur de recommandation de manière asynchrone
    initRecommendationEngine();

    // ========== NOUVEAU : Initialiser le comparateur ==========
    initComparatifAuto();
});

/**
 * Initialiser le moteur de recommandation de manière asynchrone
 */
function initRecommendationEngine() {
    // Afficher l'indicateur de chargement
    const loadingInterval = window.showLoadingIndicator ? window.showLoadingIndicator() : null;
    
    // Version améliorée du mécanisme d'attente
    function initializeEngine() {
        // Vérifier d'abord la présence de RecommendationEngine
        if (!window.RecommendationEngine && window.legalStatuses) {
            console.log("Moteur de recommandation non disponible, création d'une version de secours");
            // Si les données sont là mais pas la classe, définir une classe temporaire
            window.RecommendationEngine = function() {
                console.log("Moteur de recommandation de secours initialisé");
                this.calculateRecommendations = function(answers) {
                    return Object.keys(window.legalStatuses).slice(0, 3).map(id => ({
                        id: id,
                        status: window.legalStatuses[id],
                        score: 75,
                        strengths: window.legalStatuses[id].advantages?.slice(0, 3) || [],
                        weaknesses: window.legalStatuses[id].disadvantages?.slice(0, 3) || [],
                        compatibilite: 'COMPATIBLE'
                    }));
                };
                
                // Ajouter la méthode displayResults qui sera appelée
                this.displayResults = function(recommendations) {
                    if (window.ResultsManager && typeof window.ResultsManager.displayResults === 'function') {
                        window.ResultsManager.displayResults(recommendations);
                    } else if (window.displayResults) {
                        window.displayResults(recommendations);
                    } else {
                        console.error("Aucune fonction d'affichage des résultats trouvée");
                    }
                };
            };
        }
    
        if (window.legalStatuses) {
            console.log("window.legalStatuses est disponible, initialisation immédiate du moteur");
            try {
                window.recommendationEngine = new window.RecommendationEngine();
                console.log("Moteur de recommandation initialisé avec succès");
                if (loadingInterval) window.hideLoadingIndicator(loadingInterval);
                // Déclencher un événement pour indiquer que le moteur est prêt
                document.dispatchEvent(new CustomEvent('engineReady'));
            } catch (error) {
                console.error("Erreur lors de l'initialisation du moteur:", error);
                if (loadingInterval) window.hideLoadingIndicator(loadingInterval);
                showErrorMessage(error);
            }
        } else {
            console.log("window.legalStatuses n'est pas disponible, attente de l'événement legalStatusesLoaded");
            document.addEventListener('legalStatusesLoaded', () => {
                console.log("Événement legalStatusesLoaded reçu, initialisation du moteur");
                try {
                    window.recommendationEngine = new window.RecommendationEngine();
                    console.log("Moteur de recommandation initialisé avec succès (après événement)");
                    if (loadingInterval) window.hideLoadingIndicator(loadingInterval);
                    // Déclencher un événement pour indiquer que le moteur est prêt
                    document.dispatchEvent(new CustomEvent('engineReady'));
                } catch (error) {
                    console.error("Erreur lors de l'initialisation du moteur (après événement):", error);
                    if (loadingInterval) window.hideLoadingIndicator(loadingInterval);
                    showErrorMessage(error);
                }
            }, { once: true });
        }
    }
    
    // Vérifier si RecommendationEngine est disponible
    if (window.RecommendationEngine) {
        initializeEngine();
    } else {
        console.log("window.RecommendationEngine n'est pas disponible, attente...");
        // Attendre que le script recommendation-engine.js soit chargé
        document.addEventListener('recommendationEngineReady', initializeEngine, { once: true });
        
        // Sécurité supplémentaire : timeout si le script ne charge pas
        setTimeout(() => {
            if (!window.recommendationEngine) {
                console.error("Timeout: Le moteur de recommandation n'a pas pu être initialisé dans le délai imparti");
                if (loadingInterval) window.hideLoadingIndicator(loadingInterval);
                showErrorMessage(new Error("Timeout: Le moteur de recommandation n'a pas pu être chargé"));
            }
        }, 30000); // 30 secondes de timeout au lieu de 10
    }
    
    // Fonction pour afficher un message d'erreur convivial
    function showErrorMessage(error) {
        const errorMessage = `Une erreur est survenue: ${error.message}. Rechargez la page ou videz le cache du navigateur.`;
        
        // Afficher l'erreur dans l'interface (si l'élément question-container existe)
        const questionContainer = document.getElementById('question-container');
        if (questionContainer) {
            questionContainer.innerHTML = `
                <div class="bg-red-900 bg-opacity-20 p-8 rounded-xl text-center">
                    <div class="text-4xl text-red-400 mb-4"><i class="fas fa-exclamation-circle"></i></div>
                    <h2 class="text-xl font-bold mb-4">Problème de chargement</h2>
                    <p class="mb-6">${errorMessage}</p>
                    <div class="text-xs bg-blue-900 bg-opacity-30 p-2 mb-4 overflow-auto text-left">
                        ${error.stack || "Erreur détaillée: " + error.message}
                    </div>
                    <button onclick="location.reload()" class="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg">
                        <i class="fas fa-redo mr-2"></i> Rafraîchir la page
                    </button>
                </div>
            `;
        } else {
            // Si questionContainer n'existe pas, utiliser une alerte
            alert(errorMessage);
        }
    }
    
    // Créer des ponts de compatibilité si nécessaire pour les modules auxiliaires
    if (!window.checkHardFails) {
        window.checkHardFails = function(forme, userResponses) {
            // Implémentation simplifiée qui pourrait être améliorée au besoin
            return [];  
        };
    }
}

/**
 * Initialiser le gestionnaire de questions
 */
function initQuestionManager() {
    // Créer une instance du gestionnaire de questions
    window.questionManager = new window.QuestionManager();
    
    // Initialiser l'application
    window.questionManager.init();
}

/**
 * Mettre à jour la date de dernière mise à jour
 */
function updateLastUpdateDate() {
    const lastUpdateDateElement = document.getElementById('lastUpdateDate');
    if (lastUpdateDateElement) {
        // Mettre la date actuelle formatée
        const currentDate = new Date();
        const day = String(currentDate.getDate()).padStart(2, '0');
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const year = currentDate.getFullYear();
        
        lastUpdateDateElement.textContent = `${day}/${month}/${year}`;
    }
    
    // Mettre à jour l'horloge du marché
    updateMarketClock();
}

/**
 * Mettre à jour l'horloge du marché
 */
function updateMarketClock() {
    const marketTimeElement = document.getElementById('marketTime');
    if (marketTimeElement) {
        // Mettre à jour l'heure toutes les secondes
        setInterval(() => {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            
            marketTimeElement.textContent = `${hours}:${minutes}:${seconds}`;
            
            // Mettre à jour l'état du marché (simplifié)
            updateMarketStatus(now);
        }, 1000);
    }
}

/**
 * Mettre à jour l'état du marché
 */
function updateMarketStatus(now) {
    const marketIndicator = document.querySelector('.market-indicator');
    const marketStatusText = document.querySelector('.market-status span:not(.market-time)');
    
    if (marketIndicator && marketStatusText) {
        // Heures d'ouverture du marché (9h-17h30 en semaine)
        const isWeekend = now.getDay() === 0 || now.getDay() === 6;
        const isMarketHours = now.getHours() >= 9 && (now.getHours() < 17 || (now.getHours() === 17 && now.getMinutes() <= 30));
        
        if (!isWeekend && isMarketHours) {
            // Marché ouvert
            marketIndicator.className = 'market-indicator green';
            marketStatusText.textContent = 'Marché ouvert';
        } else {
            // Marché fermé
            marketIndicator.className = 'market-indicator';
            marketIndicator.style.backgroundColor = '#777';
            marketStatusText.textContent = 'Marché fermé';
        }
    }
}

/**
 * Initialiser les événements de l'interface
 */
function initUIEvents() {
    // Basculer le thème (clair/sombre)
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const darkIcon = document.getElementById('dark-icon');
    const lightIcon = document.getElementById('light-icon');
    
    if (themeToggleBtn && darkIcon && lightIcon) {
        themeToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark');
            document.body.classList.toggle('light');
            
            darkIcon.classList.toggle('hidden');
            lightIcon.classList.toggle('hidden');
            
            // Enregistrer la préférence dans le localStorage
            const isDarkMode = document.body.classList.contains('dark');
            localStorage.setItem('darkMode', isDarkMode ? 'true' : 'false');
        });
        
        // Appliquer le thème enregistré
        const savedDarkMode = localStorage.getItem('darkMode');
        if (savedDarkMode) {
            const isDarkMode = savedDarkMode === 'true';
            document.body.classList.toggle('dark', isDarkMode);
            document.body.classList.toggle('light', !isDarkMode);
            
            darkIcon.classList.toggle('hidden', !isDarkMode);
            lightIcon.classList.toggle('hidden', isDarkMode);
        }
    }

    // Gestion des onglets horizontaux
    const tabItems = document.querySelectorAll('.tab-item');
    
    if (tabItems.length > 0) {
        // Définir le contenu des onglets
        const tabContents = {
            'Simulateur': {
                content: () => {
                    // Activer le conteneur des questions et de résultats pour l'onglet Simulateur
                    const progressInfo = document.querySelector('.progress-info');
                    const progressBarContainer = document.querySelector('.progress-bar-container');
                    const progressStepsContainer = document.getElementById('progress-steps-container');
                    const questionContainer = document.getElementById('question-container');
                    const resultsContainer = document.getElementById('results-container');
                    
                    if (progressInfo) progressInfo.style.display = 'flex';
                    if (progressBarContainer) progressBarContainer.style.display = 'block';
                    if (progressStepsContainer) progressStepsContainer.style.display = 'flex';
                    if (questionContainer) questionContainer.style.display = 'block';
                    if (resultsContainer) resultsContainer.style.display = 'none';
                    
                    return '';
                }
            },
            'Comparatif des statuts': {
                content: () => {
                    return `
                        <div class="max-w-5xl mx-auto mb-12">
                            <div id="comparatif-container" class="overflow-x-auto">
                                <!-- Le tableau comparatif sera inséré ici par le JavaScript -->
                                <div class="text-center p-4">
                                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-400 mb-2"></div>
                                    <p>Chargement du comparatif...</p>
                                </div>
                            </div>
                        </div>
                    `;
                }
            },
            'Guide fiscal': {
                content: () => {
                    return `
                        <div class="max-w-4xl mx-auto mb-12">
                            <h2 class="text-2xl font-bold mb-4">Guide fiscal pour entrepreneurs</h2>
                            <p class="mb-6">Ce guide présente les principales informations fiscales à connaître pour chaque forme juridique, avec un simulateur simplifié.</p>
                            
                            <!-- Simulateur simplifié -->
                            <div id="fiscal-simulator" class="max-w-4xl mx-auto">
                                <div class="bg-blue-900 bg-opacity-40 p-6 rounded-xl border border-green-400 border-opacity-20">
                                    <h2 class="text-2xl font-bold mb-6 text-green-400">
                                        <i class="fas fa-calculator mr-2"></i>Simulation rapide par statut juridique
                                    </h2>
                                    
                                    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-x-12 md:gap-y-8 lg:gap-x-16">
                                        <!-- Chiffre d'affaires -->
                                        <div class="flex flex-col space-y-2 min-w-[260px]">
                                            <label for="sim-ca" class="text-gray-200 font-medium">
                                                <i class="fas fa-euro-sign mr-2 text-green-400"></i>Chiffre d'affaires annuel
                                            </label>
                                            <div class="relative">
                                                <input id="sim-ca" type="number" value="100000"
                                                       class="peer w-full bg-blue-800/20 border border-blue-600 rounded-lg py-3 pl-6 pr-14 text-xl tracking-wide focus:outline-none focus:ring-2 focus:ring-green-400/60">
                                                <span class="absolute inset-y-0 right-4 flex items-center text-gray-300 peer-focus:text-green-300">€</span>
                                            </div>
                                        </div>
                                        
                                        <!-- Taux de marge -->
                                        <div class="flex flex-col space-y-2 min-w-[260px]">
                                            <label for="sim-marge" class="text-gray-200 font-medium">
                                                <i class="fas fa-percentage mr-2 text-amber-400"></i>Taux de marge (%)
                                            </label>
                                            <div class="relative">
                                                <input id="sim-marge" type="number" value="30" min="0" max="100"
                                                       class="peer w-full bg-blue-800/20 border border-blue-600 rounded-lg py-3 pl-6 pr-14 text-xl tracking-wide focus:outline-none focus:ring-2 focus:ring-green-400/60">
                                                <span class="absolute inset-y-0 right-4 flex items-center text-gray-300 peer-focus:text-green-300">%</span>
                                            </div>
                                        </div>
                                        
                                        <!-- Répartition salaire -->
                                        <div class="flex flex-col space-y-2 min-w-[260px]">
                                            <label for="sim-salaire" class="text-gray-200 font-medium">
                                                <i class="fas fa-coins mr-2 text-purple-400"></i>Répartition salaire (%)
                                            </label>
                                            <div class="relative">
                                                <input id="sim-salaire" type="number" value="70" min="0" max="100"
                                                       class="peer w-full bg-blue-800/20 border border-blue-600 rounded-lg py-3 pl-6 pr-14 text-xl tracking-wide focus:outline-none focus:ring-2 focus:ring-green-400/60">
                                                <span class="absolute inset-y-0 right-4 flex items-center text-gray-300 peer-focus:text-green-300">%</span>
                                            </div>
                                        </div>
                                                                        <!-- Nombre d'associés -->
                                        <div class="flex flex-col space-y-2 min-w-[260px]">
                                            <label for="sim-nb-associes" class="text-gray-200 font-medium">
                                                <i class="fas fa-users mr-2 text-blue-400"></i>Nombre d'associés
                                                <span class="info-tooltip ml-2">
                                                    <i class="fas fa-question-circle text-gray-400 text-sm"></i>
                                                    <span class="tooltiptext">
                                                        Nombre total d'associés dans la structure. 
                                                        Mettez 1 si vous êtes seul.
                                                    </span>
                                                </span>
                                            </label>
                                            <div class="relative">
                                                <input id="sim-nb-associes" type="number" value="1" min="1" step="1"
                                                       class="peer w-full bg-blue-800/20 border border-blue-600 rounded-lg py-3 pl-6 pr-14 text-xl tracking-wide focus:outline-none focus:ring-2 focus:ring-green-400/60">
                                                <span class="absolute inset-y-0 right-4 flex items-center text-gray-300 peer-focus:text-green-300">pers.</span>
                                            </div>
                                        </div>
                                        
                                        <!-- Part détenue -->
                                        <div class="flex flex-col space-y-2 min-w-[260px]">
                                            <label for="sim-part-associe" class="text-gray-200 font-medium">
                                                <i class="fas fa-chart-pie mr-2 text-yellow-400"></i>Part détenue (%)
                                                <span class="text-xs text-gray-400 ml-1">(ajusté automatiquement)</span>
                                            </label>
                                            <div class="relative">
                                                <input id="sim-part-associe" type="number" value="100" min="0.1" max="100" step="0.1"
                                                       class="peer w-full bg-blue-800/20 border border-blue-600 rounded-lg py-3 pl-6 pr-14 text-xl tracking-wide focus:outline-none focus:ring-2 focus:ring-green-400/60">
                                                <span class="absolute inset-y-0 right-4 flex items-center text-gray-300 peer-focus:text-green-300">%</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- TMI caché -->
                                    <input type="hidden" id="sim-tmi" value="30">
                                </div>
                                
                                <div class="flex justify-center mb-6 mt-6">
                                    <button id="sim-compare-btn" class="bg-green-500 hover:bg-green-400 text-gray-900 font-medium py-3 px-6 rounded-lg transition">
                                        <i class="fas fa-calculator mr-2"></i> Comparer les statuts
                                    </button>
                                </div>
                                
                                <!-- Résultats de simulation -->
                                <div id="sim-results" class="overflow-x-auto">
                                    <table class="w-full text-left">
                                        <thead class="bg-blue-800 bg-opacity-50">
                                            <tr>
                                                <th class="px-4 py-3 rounded-tl-lg">Statut</th>
                                                <th class="px-4 py-3">Rémunération brute</th>
                                                <th class="px-4 py-3">Charges sociales</th>
                                                <th class="px-4 py-3">Impôts</th>
                                                <th class="px-4 py-3 rounded-tr-lg">Net en poche</th>
                                            </tr>
                                        </thead>
                                        <tbody id="sim-results-body" class="text-gray-300">
                                            <!-- Les résultats seront injectés ici -->
                                        </tbody>
                                    </table>
                                </div>
                                
                                <div class="mt-6 text-sm text-gray-400">
                                    <p><i class="fas fa-info-circle mr-1"></i> Cette simulation est une estimation simplifiée. Pour un calcul détaillé, utilisez le simulateur complet.</p>
                                </div>
                            </div>
                            
                            <!-- Informations fiscales par statut -->
                            <div class="mt-10">
                                <h3 class="text-xl font-bold mb-4">Informations fiscales par statut</h3>
                                
                                <!-- Accordéon avec infos fiscales -->
                                <div class="space-y-4">
                                    <div class="bg-blue-900 bg-opacity-30 rounded-lg overflow-hidden">
                                        <button class="accordion-toggle w-full flex justify-between items-center px-4 py-3 text-left font-medium">
                                            Micro-entreprise
                                            <i class="fas fa-plus"></i>
                                        </button>
                                        <div class="hidden px-4 py-3 border-t border-gray-700">
                                            <p class="mb-2"><strong>Régime fiscal :</strong> IR avec abattement forfaitaire</p>
                                            <p class="mb-2"><strong>Abattements :</strong> 71% (vente), 50% (services BIC), 34% (BNC)</p>
                                            <p class="mb-2"><strong>Charges sociales :</strong> 12.3% (vente), 21.2% (services) du CA</p>
                                            <p class="mb-2"><strong>Plafonds 2025 :</strong> 188 700€ (vente), 77 700€ (services)</p>
                                            <p class="mb-2"><strong>Option versement libératoire :</strong> Possible si revenu fiscal N-2 < plafond</p>
                                        </div>
                                    </div>
                                    
                                    <div class="bg-blue-900 bg-opacity-30 rounded-lg overflow-hidden">
                                        <button class="accordion-toggle w-full flex justify-between items-center px-4 py-3 text-left font-medium">
                                            EURL / SARL
                                            <i class="fas fa-plus"></i>
                                        </button>
                                        <div class="hidden px-4 py-3 border-t border-gray-700">
                                            <p class="mb-2"><strong>Régime fiscal :</strong> IR par défaut (EURL), IS (SARL)</p>
                                            <p class="mb-2"><strong>Option fiscale :</strong> EURL peut opter pour l'IS</p>
                                            <p class="mb-2"><strong>Charges sociales :</strong> TNS (~40-45% sur rémunération)</p>
                                            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
                                            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
                                        </div>
                                    </div>
                                    
                                    <div class="bg-blue-900 bg-opacity-30 rounded-lg overflow-hidden">
                                        <button class="accordion-toggle w-full flex justify-between items-center px-4 py-3 text-left font-medium">
                                            SASU / SAS
                                            <i class="fas fa-plus"></i>
                                        </button>
                                        <div class="hidden px-4 py-3 border-t border-gray-700">
                                            <p class="mb-2"><strong>Régime fiscal :</strong> IS (Impôt sur les Sociétés)</p>
                                            <p class="mb-2"><strong>Charges sociales :</strong> Environ 80-85% sur salaire brut (part salariale + patronale)</p>
                                            <p class="mb-2"><strong>Rémunération président :</strong> Assimilé salarié</p>
                                            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
                                            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                },
                onLoad: () => {
                    // Initialiser le simulateur fiscal
                    if (typeof window.initFiscalSimulator === 'function') {
                        window.initFiscalSimulator();
                    } else {
                        console.log("Chargement du script fiscal-guide.js...");
                        // Vérifier si le script existe déjà
                        const scriptExists = document.querySelector('script[src*="fiscal-guide.js"]');
                        if (!scriptExists) {
                            // Charger le script si nécessaire
                            const script = document.createElement('script');
                            script.src = 'js/fiscal-guide.js?v=20250506_1';
                            document.body.appendChild(script);
                        }
                    }
                    
                    // Initialiser l'accordéon
                    setTimeout(() => {
                        const toggleBtns = document.querySelectorAll('.accordion-toggle');
                        toggleBtns.forEach(btn => {
                            btn.addEventListener('click', function() {
                                const content = this.nextElementSibling;
                                content.classList.toggle('hidden');
                                
                                // Changer l'icône
                                const icon = this.querySelector('i');
                                icon.classList.toggle('fa-plus');
                                icon.classList.toggle('fa-minus');
                            });
                        });
                    }, 100);
                }
            },
            'Glossaire': {
                content: () => {
                    return `
                        <div class="max-w-4xl mx-auto mb-12">
                            <h2 class="text-2xl font-bold mb-4">Glossaire juridique et fiscal</h2>
                            <p class="mb-6">Retrouvez les définitions des termes juridiques et fiscaux utilisés dans le simulateur.</p>
                            
                            <!-- Recherche -->
                            <div class="mb-6">
                                <input type="text" id="glossary-search" 
                                    class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-400" 
                                    placeholder="Rechercher un terme...">
                            </div>
                            
                            <!-- Conteneur du glossaire -->
                            <div id="glossary-container" class="bg-blue-900 bg-opacity-30 p-6 rounded-lg">
                                <div class="text-center p-4">
                                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-400 mb-2"></div>
                                    <p>Chargement du glossaire...</p>
                                </div>
                            </div>
                        </div>
                    `;
                },
                onLoad: () => {
                    // Initialiser le glossaire
                    if (typeof window.initGlossary === 'function') {
                        window.initGlossary();
                    } else {
                        console.log("Chargement du script glossary.js...");
                        const scriptExists = document.querySelector('script[src*="glossary.js"]');
                        if (!scriptExists) {
                            const script = document.createElement('script');
                            script.src = 'js/glossary.js?v=20250430_1';
                            document.body.appendChild(script);
                        }
                    }
                }
            }
        };
        
        // Créer un conteneur pour le contenu des onglets s'il n'existe pas déjà
        let tabContentContainer = document.getElementById('tab-content-container');
        if (!tabContentContainer) {
            tabContentContainer = document.createElement('div');
            tabContentContainer.id = 'tab-content-container';
            const contentWrapper = document.querySelector('.content-wrapper');
            
            // Insérer le conteneur après la navigation des onglets
            const tabNavigation = document.querySelector('.tab-navigation');
            if (contentWrapper && tabNavigation) {
                contentWrapper.insertBefore(tabContentContainer, tabNavigation.nextSibling);
            }
        }
        
        // Fonction pour changer d'onglet
        const changeTab = (index) => {
            // Désactiver tous les onglets
            tabItems.forEach(item => item.classList.remove('active'));
            
            // Activer l'onglet sélectionné
            tabItems[index].classList.add('active');
            
            // Obtenir le nom de l'onglet
            const tabName = tabItems[index].textContent.trim();
            
            // Masquer les éléments du simulateur si ce n'est pas l'onglet Simulateur
            const progressInfo = document.querySelector('.progress-info');
            const progressBarContainer = document.querySelector('.progress-bar-container');
            const progressStepsContainer = document.getElementById('progress-steps-container');
            const questionContainer = document.getElementById('question-container');
            const resultsContainer = document.getElementById('results-container');
            const navigationWrapper = document.getElementById('navigation-wrapper');
            
            if (tabName !== 'Simulateur') {
                if (progressInfo) progressInfo.style.display = 'none';
                if (progressBarContainer) progressBarContainer.style.display = 'none';
                if (progressStepsContainer) progressStepsContainer.style.display = 'none';
                if (questionContainer) questionContainer.style.display = 'none';
                if (resultsContainer) resultsContainer.style.display = 'none';
                // Masquer les boutons de navigation Suivant/Précédent
                if (navigationWrapper) navigationWrapper.style.display = 'none';
                
                // Afficher le contenu de l'onglet
                tabContentContainer.innerHTML = tabContents[tabName].content();
                tabContentContainer.style.display = 'block';
                
                // Exécuter le code onLoad si défini
                if (tabContents[tabName].onLoad) {
                    tabContents[tabName].onLoad();
                }
                
                // Si c'est l'onglet "Comparatif des statuts", initialiser le comparatif
                if (tabName === 'Comparatif des statuts') {
                    // Vérifier si la fonction globale initComparatifStatuts existe
                    if (typeof window.initComparatifStatuts === 'function') {
                        // Délai court pour permettre au DOM de se mettre à jour
                        setTimeout(() => {
                            try {
                                window.initComparatifStatuts();
                                console.log("Tableau comparatif initialisé avec succès");
                            } catch (error) {
                                console.error("Erreur lors de l'initialisation du tableau comparatif:", error);
                                // Fallback en cas d'erreur
                                const comparatifContainer = document.getElementById('comparatif-container');
                                if (comparatifContainer) {
                                    comparatifContainer.innerHTML = `
                                        <div class="bg-red-900 bg-opacity-20 p-4 rounded-lg text-center">
                                            <p class="text-red-400"><i class="fas fa-exclamation-triangle mr-2"></i>Erreur lors du chargement du comparatif</p>
                                            <button id="retry-comparatif" class="mt-3 bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg">
                                                <i class="fas fa-redo mr-2"></i>Réessayer
                                            </button>
                                        </div>
                                    `;
                                    
                                    document.getElementById('retry-comparatif')?.addEventListener('click', () => {
                                        if (typeof window.initComparatifStatuts === 'function') {
                                            window.initComparatifStatuts();
                                        }
                                    });
                                }
                            }
                        }, 100);
                    } else {
                        console.error("La fonction initComparatifStatuts n'est pas disponible");
                        // Message d'erreur si la fonction n'est pas disponible
                        const comparatifContainer = document.getElementById('comparatif-container');
                        if (comparatifContainer) {
                            comparatifContainer.innerHTML = `
                                <div class="bg-yellow-900 bg-opacity-20 p-4 rounded-lg text-center">
                                    <p class="text-yellow-400"><i class="fas fa-exclamation-circle mr-2"></i>Le module de comparaison n'est pas correctement chargé</p>
                                    <p class="text-sm mt-2">Essayez de rafraîchir la page ou de vider le cache du navigateur</p>
                                </div>
                            `;
                        }
                    }
                }
            } else {
                // Afficher les éléments du simulateur
                tabContentContainer.style.display = 'none';
                
                if (progressInfo) progressInfo.style.display = 'flex';
                if (progressBarContainer) progressBarContainer.style.display = 'block';
                if (progressStepsContainer) progressStepsContainer.style.display = 'flex';
                if (questionContainer) questionContainer.style.display = 'block';
                // Afficher les boutons de navigation Suivant/Précédent
                if (navigationWrapper) navigationWrapper.style.display = 'block';
                // Ne pas afficher les résultats automatiquement, ils seront affichés quand nécessaire
            }
            
            // Faire défiler la page vers le haut
            window.scrollTo(0, 0);
        };
        
        // Attacher l'événement de clic à chaque onglet
        tabItems.forEach((tab, index) => {
            tab.addEventListener('click', () => changeTab(index));
        });
        
        // Activer l'onglet Simulateur par défaut
        changeTab(0);
    }
}

