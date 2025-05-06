// app.js - Fichier principal d'initialisation du simulateur de forme juridique

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
    
    // Charger les outils fiscaux avancés
    loadFiscalUtilities();
});

/**
 * Charge les outils fiscaux avancés
 */
function loadFiscalUtilities() {
    // Vérifier si les utilitaires fiscaux sont déjà chargés
    if (window.FiscalUtils) {
        console.log("FiscalUtils déjà chargé");
        return;
    }
    
    // Charger le script des utilitaires fiscaux
    const script = document.createElement('script');
    script.src = 'js/fiscal-utils.js?v=20250506_1';
    script.async = true;
    script.onload = () => {
        console.log("FiscalUtils chargé avec succès");
        // Déclencher un événement pour indiquer que les utilitaires sont disponibles
        document.dispatchEvent(new CustomEvent('fiscalUtilsLoaded'));
    };
    script.onerror = (error) => {
        console.error("Erreur lors du chargement de FiscalUtils:", error);
    };
    document.body.appendChild(script);
}

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
                            <h2 class="text-2xl font-bold mb-4 flex items-center">
                                <i class="fas fa-calculator mr-3 text-green-400"></i>
                                Guide fiscal pour entrepreneurs
                            </h2>
                            
                            <div class="bg-blue-900 bg-opacity-20 p-4 rounded-lg mb-6">
                                <p class="mb-2">Ce guide présente les principales informations fiscales à connaître pour chaque forme juridique, avec un simulateur amélioré.</p>
                                <p>
                                    <a href="docs/methodologie-calculs-fiscaux.md" target="_blank" class="text-green-400 hover:underline">
                                        <i class="fas fa-file-alt mr-1"></i> Consulter la méthodologie détaillée
                                    </a>
                                </p>
                            </div>
                            
                            <!-- Simulateur amélioré -->
                            <div id="fiscal-simulator" class="max-w-4xl mx-auto bg-blue-900 bg-opacity-30 p-6 rounded-xl">
                                <h2 class="text-2xl font-bold text-green-400 mb-4">Simulation rapide par statut juridique</h2>
                                
                                <!-- Formulaire de saisie -->
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                    <div>
                                        <label class="block text-gray-300 mb-2">Chiffre d'affaires annuel</label>
                                        <div class="relative">
                                            <input type="number" id="sim-ca" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white" value="50000">
                                            <span class="absolute right-3 top-2 text-gray-400">€</span>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label class="block text-gray-300 mb-2">Taux de marge (%)</label>
                                        <div class="relative">
                                            <input type="number" id="sim-marge" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white" value="30" min="0" max="100">
                                            <span class="absolute right-3 top-2 text-gray-400">%</span>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label class="block text-gray-300 mb-2">Répartition salaire (%)</label>
                                        <div class="relative">
                                            <input type="number" id="sim-salaire" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white" value="70" min="0" max="100">
                                            <span class="absolute right-3 top-2 text-gray-400">%</span>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label class="block text-gray-300 mb-2">Votre TMI actuelle (%)</label>
                                        <div class="relative">
                                            <select id="sim-tmi" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white">
                                                <option value="0">Non imposable</option>
                                                <option value="11">11%</option>
                                                <option value="30" selected>30%</option>
                                                <option value="41">41%</option>
                                                <option value="45">45%</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Options avancées -->
                                <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg mb-6">
                                    <h3 class="font-medium mb-3 text-green-400">Options avancées</h3>
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label class="inline-flex items-center">
                                                <input type="checkbox" id="sim-progressive-ir" class="form-checkbox h-4 w-4 text-green-400">
                                                <span class="ml-2">Calcul progressif de l'IR</span>
                                            </label>
                                        </div>
                                        <div>
                                            <label class="inline-flex items-center">
                                                <input type="checkbox" id="sim-optimize" class="form-checkbox h-4 w-4 text-green-400">
                                                <span class="ml-2">Optimisation salaire/dividendes</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="flex justify-center mb-6">
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
                                    <p><i class="fas fa-info-circle mr-1"></i> Cette simulation est une estimation basée sur des hypothèses simplifiées. Pour une analyse détaillée, consultez un expert-comptable.</p>
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
                    
                    // Initialiser les nouvelles options de simulation
                    initAdvancedFiscalOptions();
                    
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
            'Barèmes 2025': {
                content: () => {
                    return `
                        <div class="max-w-4xl mx-auto mb-12">
                            <h2 class="text-2xl font-bold mb-4">Barèmes fiscaux et sociaux 2025</h2>
                            <p class="mb-4">Retrouvez les barèmes à jour pour l'année 2025.</p>
                            <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg">
                                <p class="text-center">Contenu des barèmes 2025 en cours de chargement...</p>
                            </div>
                        </div>
                    `;
                }
            },
            'Historique': {
                content: () => {
                    return `
                        <div class="max-w-4xl mx-auto mb-12">
                            <h2 class="text-2xl font-bold mb-4">Historique de vos simulations</h2>
                            <p class="mb-4">Retrouvez ici l'historique de vos précédentes simulations.</p>
                            <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg">
                                <p class="text-center">Aucune simulation enregistrée pour le moment.</p>
                            </div>
                        </div>
                    `;
                }
            },
            'Méthodologie': {
                content: () => {
                    return `
                        <div class="max-w-4xl mx-auto mb-12">
                            <h2 class="text-2xl font-bold mb-4">Méthodologie de calcul</h2>
                            <p class="mb-4">Comprendre comment fonctionnent nos simulations fiscales.</p>
                            
                            <div class="bg-blue-900 bg-opacity-30 p-6 rounded-lg mb-8">
                                <h3 class="text-xl font-bold mb-3">Chargement du contenu</h3>
                                <p class="mb-4">Le contenu détaillé de la méthodologie est en cours de chargement depuis le document Markdown...</p>
                                
                                <div class="text-center">
                                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-400 mb-2"></div>
                                </div>
                            </div>
                            
                            <div id="methodologie-content">
                                <!-- Le contenu de la méthodologie sera chargé ici -->
                            </div>
                        </div>
                    `;
                },
                onLoad: () => {
                    // Charger le contenu de la méthodologie
                    fetch('docs/methodologie-calculs-fiscaux.md')
                        .then(response => response.text())
                        .then(text => {
                            // Convertir le markdown en HTML (utilisation de bibliothèque simple ou affichage brut)
                            document.getElementById('methodologie-content').innerHTML = `<pre class="bg-blue-900 bg-opacity-30 p-4 rounded-lg whitespace-pre-wrap">${text}</pre>`;
                            
                            // Masquer l'indicateur de chargement
                            const loadingDiv = document.querySelector('.bg-blue-900.bg-opacity-30.p-6');
                            if (loadingDiv) loadingDiv.style.display = 'none';
                        })
                        .catch(error => {
                            console.error("Erreur lors du chargement de la méthodologie:", error);
                            document.getElementById('methodologie-content').innerHTML = `
                                <div class="bg-red-900 bg-opacity-20 p-4 rounded-lg text-center">
                                    <p class="text-red-400"><i class="fas fa-exclamation-triangle mr-2"></i>Erreur lors du chargement de la méthodologie</p>
                                    <p class="text-sm mt-2">Veuillez rafraîchir la page ou contactez l'administrateur</p>
                                </div>
                            `;
                            
                            // Masquer l'indicateur de chargement
                            const loadingDiv = document.querySelector('.bg-blue-900.bg-opacity-30.p-6');
                            if (loadingDiv) loadingDiv.style.display = 'none';
                        });
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
        
        // Ajouter l'onglet Méthodologie s'il n'existe pas
        const methodologyTab = Array.from(tabItems).find(tab => tab.textContent.trim() === 'Méthodologie');
        if (!methodologyTab) {
            const tabNavigation = document.querySelector('.tab-navigation');
            if (tabNavigation) {
                const newTab = document.createElement('div');
                newTab.className = 'tab-item';
                newTab.textContent = 'Méthodologie';
                tabNavigation.appendChild(newTab);
                tabItems.forEach(item => item.classList.remove('active'));
                // Ne pas l'activer tout de suite
                
                // Mettre à jour la collection d'onglets
                const allTabs = document.querySelectorAll('.tab-item');
                
                // Rattacher les événements pour tous les onglets
                allTabs.forEach((tab, index) => {
                    tab.addEventListener('click', () => changeTab(index));
                });
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
            
            if (tabName !== 'Simulateur') {
                if (progressInfo) progressInfo.style.display = 'none';
                if (progressBarContainer) progressBarContainer.style.display = 'none';
                if (progressStepsContainer) progressStepsContainer.style.display = 'none';
                if (questionContainer) questionContainer.style.display = 'none';
                if (resultsContainer) resultsContainer.style.display = 'none';
                
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

/**
 * Initialiser les options avancées du simulateur fiscal
 */
function initAdvancedFiscalOptions() {
    const simCompareBtn = document.getElementById('sim-compare-btn');
    const simProgressiveIR = document.getElementById('sim-progressive-ir');
    const simOptimize = document.getElementById('sim-optimize');
    
    if (simCompareBtn && window.FiscalUtils) {
        // Remplacer l'événement de clic existant par la nouvelle version
        simCompareBtn.addEventListener('click', runAdvancedComparison);
        
        // Mettre à jour le tooltip du bouton
        simCompareBtn.setAttribute('title', 'Lancer la simulation avec les options avancées');
        
        console.log("Options avancées du simulateur fiscal initialisées");
    } else {
        console.warn("FiscalUtils ou le bouton de comparaison non disponible");
    }
    
    /**
     * Exécuter la comparaison avancée avec les options sélectionnées
     */
    function runAdvancedComparison() {
        // Récupérer les valeurs du formulaire
        const ca = parseFloat(document.getElementById('sim-ca').value) || 50000;
        const marge = parseFloat(document.getElementById('sim-marge').value) / 100 || 0.3;
        const ratioSalaire = parseFloat(document.getElementById('sim-salaire').value) / 100 || 0.7;
        const tmi = parseFloat(document.getElementById('sim-tmi').value) || 30;
        
        // Récupérer les options avancées
        const useProgressiveIR = simProgressiveIR && simProgressiveIR.checked;
        const optimize = simOptimize && simOptimize.checked;
        
        const resultsBody = document.getElementById('sim-results-body');
        if (!resultsBody) return;
        
        // Afficher un indicateur de chargement
        resultsBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4">
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-400 mb-2"></div>
                    <p>Calculs avancés en cours...</p>
                </td>
            </tr>
        `;
        
        // Utiliser FiscalUtils si disponible, sinon utiliser la fonction standard
        if (window.FiscalUtils && typeof window.SimulationsFiscalesV2 === 'object') {
            // Utiliser la version avancée des simulations
            const params = { ca, tauxMarge: marge, tauxRemuneration: ratioSalaire, tmiActuel: tmi };
            
            // Simuler quelques statuts avec la nouvelle méthode pour démonstration
            Promise.all([
                window.SimulationsFiscalesV2.simulerMicroEntrepriseV2(params, useProgressiveIR),
                window.SimulationsFiscalesV2.simulerSASUV2(params, useProgressiveIR, optimize)
            ])
            .then(results => {
                displayAdvancedResults(results, useProgressiveIR, optimize);
            })
            .catch(error => {
                console.error("Erreur lors de la simulation avancée:", error);
                resultsBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center py-4 text-red-400">
                            <i class="fas fa-exclamation-triangle mr-2"></i>
                            Erreur lors de la simulation avancée. Utilisation de la méthode standard à la place.
                        </td>
                    </tr>
                `;
                // Fallback à la méthode standard après un délai
                setTimeout(() => {
                    if (typeof window.runComparison === 'function') {
                        window.runComparison();
                    }
                }, 1000);
            });
        } else {
            // Utiliser la fonction standard existante
            if (typeof window.runComparison === 'function') {
                window.runComparison();
            } else {
                resultsBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center py-4 text-red-400">
                            <i class="fas fa-exclamation-triangle mr-2"></i>
                            Module de simulation non disponible. Veuillez rafraîchir la page.
                        </td>
                    </tr>
                `;
            }
        }
    }
    
    /**
     * Affiche les résultats avancés dans le tableau
     * @param {Array} results - Résultats des simulations avancées
     * @param {boolean} useProgressiveIR - Si l'IR progressif a été utilisé
     * @param {boolean} optimize - Si l'optimisation a été utilisée
     */
    function displayAdvancedResults(results, useProgressiveIR, optimize) {
        const resultsBody = document.getElementById('sim-results-body');
        if (!resultsBody) return;
        
        // Vider les résultats précédents
        resultsBody.innerHTML = '';
        
        // Formater les nombres
        const formatter = new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
        
        // Afficher les badges pour les options activées
        const headerRow = document.createElement('tr');
        headerRow.className = 'bg-blue-900 bg-opacity-40 text-sm';
        headerRow.innerHTML = `
            <td colspan="5" class="px-4 py-2 text-center">
                Options activées: 
                ${useProgressiveIR ? '<span class="bg-green-600 text-white px-2 py-1 rounded-md text-xs mx-1">IR progressif</span>' : ''}
                ${optimize ? '<span class="bg-green-600 text-white px-2 py-1 rounded-md text-xs mx-1">Optimisation auto</span>' : ''}
                ${!useProgressiveIR && !optimize ? '<span class="bg-gray-600 text-white px-2 py-1 rounded-md text-xs mx-1">Standard</span>' : ''}
            </td>
        `;
        resultsBody.appendChild(headerRow);
        
        // Afficher chaque résultat
        results.forEach((res, index) => {
            if (!res.compatible) {
                const row = document.createElement('tr');
                row.className = index % 2 === 0 ? 'bg-blue-900 bg-opacity-20' : '';
                row.innerHTML = `
                    <td class="px-4 py-3 font-medium">${res.typeEntreprise || ''}</td>
                    <td colspan="4" class="px-4 py-3 text-red-400">${res.message || 'Incompatible'}</td>
                `;
                resultsBody.appendChild(row);
                return;
            }
            
            const isOptimized = res.optimisation;
            const isTopResult = index === 0;
            
            const row = document.createElement('tr');
            row.className = isTopResult 
                ? 'bg-green-900 bg-opacity-20 font-medium' 
                : (index % 2 === 0 ? 'bg-blue-900 bg-opacity-20' : '');
            
            // Pour les résultats optimisés, afficher différemment
            if (isOptimized) {
                row.innerHTML = `
                    <td class="px-4 py-3 font-medium">
                        ${isTopResult ? '<i class="fas fa-star text-yellow-400 mr-2"></i>' : ''}
                        ${res.typeEntreprise}
                        <div class="text-xs text-green-400 mt-1">Ratio optimal: ${Math.round(res.ratioOptimal * 100)}% salaire</div>
                    </td>
                    <td class="px-4 py-3">${formatter.format(res.remuneration)}</td>
                    <td class="px-4 py-3">
                        ${formatter.format(res.cotisationsSociales || 0)}
                        <div class="text-xs text-gray-400 mt-1">~${Math.round((res.cotisationsSociales || 0) / res.remuneration * 100)}%</div>
                    </td>
                    <td class="px-4 py-3">
                        ${formatter.format((res.impotRevenu || 0) + (res.prelevementForfaitaire || 0))}
                        <div class="text-xs text-gray-400 mt-1">IR: ${formatter.format(res.impotRevenu || 0)}</div>
                        ${res.prelevementForfaitaire ? `<div class="text-xs text-gray-400">PFU: ${formatter.format(res.prelevementForfaitaire)}</div>` : ''}
                    </td>
                    <td class="px-4 py-3 font-medium ${isTopResult ? 'text-green-400' : ''}">
                        ${formatter.format(res.revenuNetTotal)}
                        <div class="text-xs text-gray-400 mt-1">${Math.round(res.ratioNetCA)}% du CA</div>
                    </td>
                `;
            } else {
                row.innerHTML = `
                    <td class="px-4 py-3 font-medium">
                        ${isTopResult ? '<i class="fas fa-star text-yellow-400 mr-2"></i>' : ''}
                        ${res.typeEntreprise}
                    </td>
                    <td class="px-4 py-3">${formatter.format(res.remuneration || res.ca)}</td>
                    <td class="px-4 py-3">${formatter.format(res.cotisationsSociales || 0)}</td>
                    <td class="px-4 py-3">${formatter.format((res.impotRevenu || 0) + (res.prelevementForfaitaire || 0))}</td>
                    <td class="px-4 py-3 font-medium ${isTopResult ? 'text-green-400' : ''}">
                        ${formatter.format(res.revenuNetTotal || res.revenuNetApresImpot)}
                        <div class="text-xs text-gray-400 mt-1">${Math.round(res.ratioNetCA)}% du CA</div>
                    </td>
                `;
            }
            
            resultsBody.appendChild(row);
        });
        
        // Ajouter une note sur les calculs optimisés
        if (optimize) {
            const noteRow = document.createElement('tr');
            noteRow.className = 'text-sm italic';
            noteRow.innerHTML = `
                <td colspan="5" class="px-4 py-2 text-center">
                    <i class="fas fa-info-circle mr-1 text-blue-400"></i>
                    L'optimisation recherche le meilleur ratio salaire/dividendes pour maximiser le revenu net
                </td>
            `;
            resultsBody.appendChild(noteRow);
        }
        
        // Ajouter un bouton pour voir plus de résultats complets
        const moreRow = document.createElement('tr');
        moreRow.className = 'border-t border-gray-700';
        moreRow.innerHTML = `
            <td colspan="5" class="px-4 py-3 text-center">
                <button id="more-results-btn" class="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
                    <i class="fas fa-plus-circle mr-2"></i> Voir tous les statuts juridiques
                </button>
            </td>
        `;
        resultsBody.appendChild(moreRow);
        
        // Ajouter l'événement pour voir plus de résultats
        document.getElementById('more-results-btn')?.addEventListener('click', () => {
            // Si la fonction originale existe, l'appeler (pour l'instant)
            if (typeof window.runComparison === 'function') {
                window.runComparison();
            }
        });
    }
}
