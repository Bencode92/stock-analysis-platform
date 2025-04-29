// Rechercher et remplacer uniquement la fonction showResults dans le fichier question-manager.js

/**
 * Afficher les résultats
 */
showResults() {
    // Rediriger vers la page de résultats
    this.questionContainer.innerHTML = `
        <div class="bg-green-900 bg-opacity-20 p-8 rounded-xl text-center">
            <div class="text-6xl text-green-400 mb-4"><i class="fas fa-check-circle"></i></div>
            <h2 class="text-2xl font-bold mb-4">Merci d'avoir complété le questionnaire !</h2>
            <p class="mb-6">Vos réponses ont été enregistrées. Nous allons maintenant calculer la forme juridique la plus adaptée à votre projet.</p>
            <button id="show-results-btn" class="bg-green-500 hover:bg-green-400 text-gray-900 font-semibold py-3 px-6 rounded-lg transition">
                Voir les résultats
            </button>
        </div>
    `;
    
    // Attacher l'événement au bouton
    const showResultsBtn = document.getElementById('show-results-btn');
    if (showResultsBtn) {
        showResultsBtn.addEventListener('click', () => {
            // Afficher l'indicateur de chargement immédiatement
            let loadingInterval = window.showLoadingIndicator();
            
            // Nouvelle approche: utiliser la fonction loadRecommendationEngine si disponible
            if (typeof window.loadRecommendationEngine === 'function') {
                console.log("Utilisation de loadRecommendationEngine");
                window.loadRecommendationEngine()
                    .then(engine => {
                        console.log("Moteur chargé avec succès via Promise");
                        const recommendations = engine.calculateRecommendations(this.answers);
                        engine.displayResults(recommendations);
                        window.hideLoadingIndicator(loadingInterval);
                    })
                    .catch(error => {
                        console.error("Erreur lors du chargement du moteur via Promise:", error);
                        this.showEngineErrorMessage(error);
                        window.hideLoadingIndicator(loadingInterval);
                    });
                return;
            }
            
            // Ancienne approche comme fallback
            try {
                // Vérifier si le moteur est accessible directement
                if (window.RecommendationEngine) {
                    console.log("Création d'une nouvelle instance de RecommendationEngine");
                    window.recommendationEngine = new window.RecommendationEngine();
                    const recommendations = window.recommendationEngine.calculateRecommendations(this.answers);
                    window.recommendationEngine.displayResults(recommendations);
                    window.hideLoadingIndicator(loadingInterval);
                    return;
                }
                
                // Si toujours pas accessible, utiliser l'approche par événement 
                console.log("Utilisation de l'approche par événement");
                const answersData = this.answers;
                
                const engineReadyHandler = function() {
                    try {
                        console.log("Événement reçu, initialisation du moteur");
                        window.recommendationEngine = new window.RecommendationEngine();
                        const recommendations = window.recommendationEngine.calculateRecommendations(answersData);
                        window.recommendationEngine.displayResults(recommendations);
                    } catch (error) {
                        console.error("Erreur lors de l'utilisation du moteur:", error);
                        this.showEngineErrorMessage(error);
                    } finally {
                        window.hideLoadingIndicator(loadingInterval);
                        document.removeEventListener('recommendationEngineReady', engineReadyHandler);
                    }
                }.bind(this);
                
                document.addEventListener('recommendationEngineReady', engineReadyHandler);
                
                // Timeout plus long (60 secondes)
                setTimeout(() => {
                    if (document.querySelector('#loading-indicator').style.display !== 'none') {
                        console.error("Timeout lors du chargement du moteur de recommandation");
                        window.hideLoadingIndicator(loadingInterval);
                        document.removeEventListener('recommendationEngineReady', engineReadyHandler);
                        this.showEngineErrorMessage(new Error("Le moteur de recommandation n'a pas pu être chargé dans le délai imparti."));
                    }
                }, 60000); // 60 secondes de timeout
                
            } catch (error) {
                console.error("Erreur générale lors de l'affichage des résultats:", error);
                this.showEngineErrorMessage(error);
                window.hideLoadingIndicator(loadingInterval);
            }
        });
    }
}