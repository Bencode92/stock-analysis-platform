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
 * dans le même format que les actualités critiques et importantes
 */
function addScoreAndImpactToGeneralNews() {
    const regularNewsContainer = document.getElementById('recent-news');
    if (!regularNewsContainer) {
        console.warn('Conteneur d\'actualités générales non trouvé');
        return;
    }
    
    const newsCards = regularNewsContainer.querySelectorAll('.news-card');
    
    newsCards.forEach(card => {
        // Récupérer ou créer l'élément de contenu d'actualité
        let newsContent = card.querySelector('.news-content');
        if (!newsContent) {
            console.warn('Structure news-content non trouvée, impossible d\'ajouter les indicateurs');
            return;
        }
        
        // Vérifier si la carte a déjà des indicateurs
        const hasImpactIndicator = newsContent.querySelector('.impact-indicator') !== null;
        
        if (!hasImpactIndicator) {
            // Récupérer les données
            const impact = card.getAttribute('data-impact') || 'neutral';
            const score = card.getAttribute('data-score') || '0';
            const sentiment = card.getAttribute('data-sentiment') || 'neutral';
            const category = card.getAttribute('data-category') || 'general';
            const confidence = card.getAttribute('data-confidence') || '0.8';
            
            console.log(`Ajout des indicateurs pour l'actualité: Impact=${impact}, Score=${score}, Sentiment=${sentiment}`);
            
            // Calculer les classes et textes comme dans news-hierarchy.js
            const impactIndicatorClass = `impact-${impact}`;
            const impactText = impact === 'negative' ? 'IMPACT NÉGATIF' : 
                             impact === 'positive' ? 'IMPACT POSITIF' : 'IMPACT NEUTRE';
            
            const sentimentClass = `sentiment-${sentiment}`;
            const sentimentText = sentiment === 'positive' ? 'SENTIMENT POSITIF' : 
                                sentiment === 'negative' ? 'SENTIMENT NÉGATIF' : 'SENTIMENT NEUTRE';
            
            const confidenceValue = parseFloat(confidence);
            const confidenceClass = confidenceValue > 0.8 ? 'confidence-high' : 
                                    confidenceValue > 0.6 ? 'confidence-medium' : 'confidence-low';
            const confidencePercent = Math.round(confidenceValue * 100);
            
            // Créer le HTML pour les indicateurs (même format que pour les actualités critiques/importantes)
            const indicatorsHTML = `
                <div class="mb-2" style="display:flex; margin-bottom:10px; flex-wrap: wrap;">
                    <span class="impact-indicator ${impactIndicatorClass}">${impactText}</span>
                    <span class="impact-indicator">${category.toUpperCase()}</span>
                    <span class="sentiment-indicator ${sentimentClass}">
                        ${sentimentText}
                        <span class="confidence-badge ${confidenceClass}">${confidencePercent}%</span>
                        <span class="ml-score-badge">${score}</span>
                        <span class="ml-indicator"><i class="fas fa-robot"></i></span>
                    </span>
                </div>
            `;
            
            // Trouver le bon endroit pour insérer les indicateurs
            // Par défaut, au début du contenu de l'actualité
            const existingDiv = newsContent.querySelector('div[style*="display:flex"]');
            if (existingDiv) {
                // S'il existe déjà un div similaire, le remplacer
                existingDiv.outerHTML = indicatorsHTML;
            } else {
                // Sinon, insérer au début du contenu
                newsContent.insertAdjacentHTML('afterbegin', indicatorsHTML);
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
