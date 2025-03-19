/**
 * news-display-fix.js
 * Correctifs pour l'affichage des actualités financières
 * 
 * Ce script résout deux problèmes principaux:
 * 1. Absence du score et de l'impact dans les actualités générales
 * 2. Duplication des actualités entre les sections critiques/importantes et générales
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initialisation des correctifs d\'affichage des actualités...');
    
    // Attendre que les données soient chargées
    document.addEventListener('newsDataReady', function() {
        console.log('Correctifs appliqués après chargement des données');
        fixNewsDisplayIssues();
    });
    
    // Au cas où l'événement a déjà été déclenché
    setTimeout(fixNewsDisplayIssues, 1000);
});

/**
 * Applique les correctifs pour l'affichage des actualités
 */
function fixNewsDisplayIssues() {
    // 1. Assurer que les actualités générales affichent le score et l'impact
    addScoreAndImpactToGeneralNews();
    
    // 2. Éviter la duplication des actualités entre les sections
    removeNewsRepeatsFromGeneralSection();
}

/**
 * Ajoute les indications de score et d'impact aux actualités générales
 */
function addScoreAndImpactToGeneralNews() {
    const regularNewsContainer = document.getElementById('recent-news');
    if (!regularNewsContainer) {
        console.warn('Conteneur d\'actualités générales non trouvé');
        return;
    }
    
    const newsCards = regularNewsContainer.querySelectorAll('.news-card');
    
    newsCards.forEach(card => {
        // Vérifier si la carte a déjà des indicateurs d'impact et de score
        const hasImpactIndicator = card.querySelector('.news-impact') !== null;
        const hasScoreIndicator = card.querySelector('.news-score') !== null;
        
        if (!hasImpactIndicator || !hasScoreIndicator) {
            // Récupérer les données
            const impact = card.getAttribute('data-impact') || 'N/A';
            const score = card.getAttribute('data-score') || 'N/A';
            const sentiment = card.getAttribute('data-sentiment') || 'N/A';
            
            console.log(`Ajout des indicateurs pour l'actualité: Impact=${impact}, Score=${score}, Sentiment=${sentiment}`);
            
            // Créer un conteneur pour les indicateurs s'il n'existe pas
            let indicatorsContainer = card.querySelector('.news-indicators');
            if (!indicatorsContainer) {
                indicatorsContainer = document.createElement('div');
                indicatorsContainer.className = 'news-indicators flex flex-wrap gap-2 mb-2';
                
                // Insérer le conteneur au début de la carte ou après l'en-tête
                const newsContent = card.querySelector('.news-content');
                if (newsContent) {
                    // Insérer après les indicateurs existants s'ils sont présents
                    const existingIndicators = newsContent.querySelector('div[style*="display:flex"]');
                    if (existingIndicators) {
                        existingIndicators.insertAdjacentElement('afterend', indicatorsContainer);
                    } else {
                        newsContent.insertBefore(indicatorsContainer, newsContent.firstChild);
                    }
                } else {
                    card.insertBefore(indicatorsContainer, card.firstChild);
                }
            }
            
            // Ajouter l'indicateur de score s'il n'existe pas
            if (!hasScoreIndicator) {
                const scoreIndicator = document.createElement('div');
                scoreIndicator.className = 'news-score text-xs px-2 py-1 rounded bg-blue-800 bg-opacity-20 text-blue-400 border border-blue-800 border-opacity-30';
                scoreIndicator.innerHTML = `<i class="fas fa-chart-bar mr-1"></i> Score: ${score}`;
                indicatorsContainer.appendChild(scoreIndicator);
            }
            
            // Ajouter l'indicateur d'impact s'il n'existe pas déjà
            if (!hasImpactIndicator && !card.querySelector('.impact-indicator')) {
                const impactIndicator = document.createElement('div');
                
                // Déterminer la classe en fonction de l'impact
                let impactClass = '';
                if (impact === 'positive') {
                    impactClass = 'bg-green-800 bg-opacity-20 text-green-400 border-green-800';
                } else if (impact === 'negative') {
                    impactClass = 'bg-red-800 bg-opacity-20 text-red-400 border-red-800';
                } else {
                    impactClass = 'bg-yellow-800 bg-opacity-20 text-yellow-400 border-yellow-800';
                }
                
                impactIndicator.className = `news-impact text-xs px-2 py-1 rounded ${impactClass} border border-opacity-30`;
                
                // Texte de l'impact
                const impactText = impact === 'positive' ? 'IMPACT POSITIF' : 
                                   impact === 'negative' ? 'IMPACT NÉGATIF' : 
                                   'IMPACT NEUTRE';
                
                impactIndicator.innerHTML = `<i class="fas fa-bolt mr-1"></i> ${impactText}`;
                indicatorsContainer.appendChild(impactIndicator);
            }
        }
    });
    
    console.log('✅ Indicateurs de score et d\'impact ajoutés aux actualités générales');
}

/**
 * Évite la duplication des actualités entre les sections critiques/importantes et la section générale
 */
function removeNewsRepeatsFromGeneralSection() {
    // Vérifier si nous utilisons le système de hiérarchisation
    if (!window.NewsSystem || !window.NewsSystem.categorizedNews) {
        console.warn('Système de hiérarchisation non disponible, impossible d\'éviter les doublons');
        return;
    }
    
    // Récupérer les actualités déjà classées comme critiques ou importantes
    const criticalTitles = window.NewsSystem.categorizedNews.critical.map(news => news.title);
    const importantTitles = window.NewsSystem.categorizedNews.important.map(news => news.title);
    const alreadyClassifiedTitles = [...criticalTitles, ...importantTitles];
    
    console.log(`Titres déjà classifiés: ${alreadyClassifiedTitles.length} (${criticalTitles.length} critiques + ${importantTitles.length} importantes)`);
    
    // Trouver le conteneur des actualités générales
    const regularNewsContainer = document.getElementById('recent-news');
    if (!regularNewsContainer) {
        console.warn('Conteneur d\'actualités générales non trouvé');
        return;
    }
    
    // Trouver toutes les cartes d'actualités
    const newsCards = regularNewsContainer.querySelectorAll('.news-card');
    let removedCount = 0;
    
    // Masquer les actualités qui sont déjà dans les sections critiques ou importantes
    newsCards.forEach(card => {
        const titleElement = card.querySelector('h3');
        if (!titleElement) return;
        
        const title = titleElement.textContent.trim();
        
        // Si le titre est déjà dans une autre section, masquer la carte
        if (alreadyClassifiedTitles.includes(title)) {
            card.style.display = 'none';
            card.classList.add('duplicate-news');
            removedCount++;
            console.log(`Actualité dupliquée masquée: "${title.substring(0, 30)}..."`);
        }
    });
    
    console.log(`✅ ${removedCount} actualités dupliquées masquées dans la section générale`);
    
    // Afficher un message s'il ne reste plus d'actualités
    const visibleCards = regularNewsContainer.querySelectorAll('.news-card:not([style*="display: none"])');
    if (visibleCards.length === 0 && newsCards.length > 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'no-data-message flex flex-col items-center justify-center py-8';
        emptyMessage.innerHTML = `
            <i class="fas fa-check-circle text-green-400 text-3xl mb-3"></i>
            <h3 class="text-white font-medium mb-2">Toutes les actualités sont déjà classées</h3>
            <p class="text-gray-400">Consultez les sections Critiques et Importantes pour voir toutes les actualités disponibles.</p>
        `;
        regularNewsContainer.appendChild(emptyMessage);
    }
}
