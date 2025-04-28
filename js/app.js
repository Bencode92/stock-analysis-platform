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
    
    // À la place, créer une fonction lazy-load
    window.loadRecommendationEngine = function() {
        return new Promise((resolve, reject) => {
            try {
                // Vérifier si le moteur est déjà chargé
                if (window.recommendationEngine) {
                    resolve(window.recommendationEngine);
                    return;
                }
                
                // Sinon, initialiser le moteur
                if (window.RecommendationEngine) {
                    window.recommendationEngine = new window.RecommendationEngine();
                    console.log("Moteur de recommandation initialisé avec succès");
                    
                    // Créer des ponts de compatibilité si nécessaire
                    if (!window.checkHardFails) {
                        window.checkHardFails = function(forme, userResponses) {
                            return [];  
                        };
                    }
                    
                    resolve(window.recommendationEngine);
                } else {
                    console.error("RecommendationEngine n'est pas disponible");
                    reject(new Error("RecommendationEngine n'est pas disponible"));
                }
            } catch (error) {
                console.error("Erreur lors de l'initialisation du moteur:", error);
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
    if (window.RecommendationEngine) {
        window.recommendationEngine = new window.RecommendationEngine();
        console.log("Moteur de recommandation initialisé avec succès");
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
        tabItems.forEach(tab => {
            tab.addEventListener('click', () => {
                // Désactiver tous les onglets
                tabItems.forEach(t => t.classList.remove('active'));
                
                // Activer l'onglet cliqué
                tab.classList.add('active');
                
                // Ici, vous pourriez ajouter la logique pour changer le contenu affiché
                // en fonction de l'onglet sélectionné
            });
        });
    }
}
