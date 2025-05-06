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
                            <h2 class="text-2xl font-bold mb-4">Comparatif des formes juridiques</h2>
                            <p class="mb-4">Le tableau comparatif ci-dessous présente les principales caractéristiques des différentes formes juridiques d'entreprise en France en 2025.</p>
                            <!-- Suppression des filtres en double -->
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
                            <p class="mb-4">Ce guide présente les principales informations fiscales à connaître pour chaque forme juridique.</p>
                            <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg">
                                <p class="text-center">Contenu du guide fiscal en cours de chargement...</p>
                            </div>
                        </div>
                    `;
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
            
            if (tabName !== 'Simulateur') {
                if (progressInfo) progressInfo.style.display = 'none';
                if (progressBarContainer) progressBarContainer.style.display = 'none';
                if (progressStepsContainer) progressStepsContainer.style.display = 'none';
                if (questionContainer) questionContainer.style.display = 'none';
                if (resultsContainer) resultsContainer.style.display = 'none';
                
                // Afficher le contenu de l'onglet
                tabContentContainer.innerHTML = tabContents[tabName].content();
                tabContentContainer.style.display = 'block';
                
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