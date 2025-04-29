// app.js - Fichier principal d'initialisation du simulateur de forme juridique

// Fonction d'initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    // Mettre à jour la date de dernière mise à jour
    updateLastUpdateDate();
    
    // Initialiser le gestionnaire de questions
    initQuestionManager();
    
    // Initialiser les événements de l'interface
    initUIEvents();
    
    // NE PAS initialiser directement le moteur de recommandation
    // initRecommendationEngine();  
    
    // À la place, créer une fonction lazy-load qui utilise notre fonction createRecommendationEngine
    window.loadRecommendationEngine = function() {
        return new Promise((resolve, reject) => {
            try {
                // Afficher l'indicateur de chargement
                const loadingInterval = window.showLoadingIndicator ? window.showLoadingIndicator() : null;
                
                // Vérifier si le moteur est déjà chargé
                if (window.recommendationEngine) {
                    if (loadingInterval) window.hideLoadingIndicator(loadingInterval);
                    resolve(window.recommendationEngine);
                    return;
                }
                
                // Sinon, utiliser la fonction createRecommendationEngine
                if (window.createRecommendationEngine) {
                    window.createRecommendationEngine()
                        .then(engine => {
                            console.log("Moteur de recommandation créé avec succès via createRecommendationEngine");
                            if (loadingInterval) window.hideLoadingIndicator(loadingInterval);
                            resolve(engine);
                        })
                        .catch(error => {
                            console.error("Erreur lors de la création du moteur:", error);
                            if (loadingInterval) window.hideLoadingIndicator(loadingInterval);
                            reject(error);
                        });
                } else if (window.RecommendationEngine) {
                    // Fallback à l'ancienne méthode si createRecommendationEngine n'est pas disponible
                    console.log("Utilisation de la construction directe du moteur");
                    const engineOrPromise = new window.RecommendationEngine();
                    
                    // Vérifier si le constructeur a retourné une promesse
                    if (engineOrPromise instanceof Promise) {
                        engineOrPromise
                            .then(engine => {
                                window.recommendationEngine = engine;
                                if (loadingInterval) window.hideLoadingIndicator(loadingInterval);
                                resolve(engine);
                            })
                            .catch(error => {
                                console.error("Erreur lors de la création du moteur:", error);
                                if (loadingInterval) window.hideLoadingIndicator(loadingInterval);
                                reject(error);
                            });
                    } else {
                        // Si c'est une instance directe
                        window.recommendationEngine = engineOrPromise;
                        if (loadingInterval) window.hideLoadingIndicator(loadingInterval);
                        resolve(engineOrPromise);
                    }
                } else {
                    console.error("Ni RecommendationEngine ni createRecommendationEngine ne sont disponibles");
                    if (loadingInterval) window.hideLoadingIndicator(loadingInterval);
                    reject(new Error("Moteur de recommandation non disponible"));
                }
            } catch (error) {
                console.error("Erreur dans loadRecommendationEngine:", error);
                const loadingInterval = window.showLoadingIndicator ? window.showLoadingIndicator() : null;
                if (loadingInterval) window.hideLoadingIndicator(loadingInterval);
                reject(error);
            }
        });
    };
});

/**
 * Initialiser le moteur de recommandation directement (fonction conservée pour compatibilité)
 */
function initRecommendationEngine() {
    // Cette fonction sera appelée quand RecommendationEngine sera disponible globalement
    if (window.createRecommendationEngine) {
        window.createRecommendationEngine()
            .then(engine => {
                console.log("Moteur de recommandation initialisé avec succès");
            })
            .catch(error => {
                console.error("Erreur lors de l'initialisation du moteur:", error);
            });
    } else if (window.RecommendationEngine) {
        try {
            const engineOrPromise = new window.RecommendationEngine();
            
            if (engineOrPromise instanceof Promise) {
                engineOrPromise
                    .then(engine => {
                        window.recommendationEngine = engine;
                        console.log("Moteur de recommandation initialisé avec succès (asynchrone)");
                    })
                    .catch(error => {
                        console.error("Erreur lors de l'initialisation du moteur:", error);
                    });
            } else {
                window.recommendationEngine = engineOrPromise;
                console.log("Moteur de recommandation initialisé avec succès (synchrone)");
            }
        } catch (error) {
            console.error("RecommendationEngine n'a pas pu être initialisé correctement:", error);
        }
    } else {
        console.error("RecommendationEngine n'est pas disponible. Assurez-vous que recommendation-engine.js est chargé correctement.");
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
                        <div class="max-w-4xl mx-auto mb-12">
                            <h2 class="text-2xl font-bold mb-4">Comparatif des formes juridiques</h2>
                            <p class="mb-4">Le tableau comparatif ci-dessous présente les principales caractéristiques des différentes formes juridiques d'entreprise en France.</p>
                            <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg">
                                <p class="text-center">Contenu du comparatif des statuts en cours de chargement...</p>
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
