/**
 * news-display-fix.js
 * Ce script s'assure que le format d'affichage des actualités générales
 * correspond au même format que les actualités critiques et importantes
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 Initialisation du correctif d\'affichage des actualités...');
    
    // S'assurer que le système de hiérarchie est complètement chargé
    const checkNewsSystem = setInterval(function() {
        if (window.NewsSystem && !window.NewsSystem.isLoading) {
            clearInterval(checkNewsSystem);
            applyDisplayFix();
        }
    }, 100);
    
    // Après 3 secondes, essayer d'appliquer quand même le correctif
    setTimeout(function() {
        clearInterval(checkNewsSystem);
        applyDisplayFix();
    }, 3000);
});

/**
 * Applique le correctif pour uniformiser l'affichage des actualités
 */
function applyDisplayFix() {
    console.log('🛠️ Application du correctif d\'affichage des actualités...');
    
    // 1. Identifier le conteneur d'actualités générales
    const recentNewsContainer = document.getElementById('recent-news');
    
    if (!recentNewsContainer) {
        console.error('❌ Conteneur des actualités générales non trouvé');
        return;
    }
    
    // 2. Sauvegarder la référence au conteneur parent pour faciliter l'insertion
    const parentContainer = recentNewsContainer.parentNode;
    
    // 3. Si le conteneur actuel a déjà des actualités au format non souhaité, le vider
    if (recentNewsContainer.classList.contains('news-grid') || 
        recentNewsContainer.querySelector('.news-item') ||
        recentNewsContainer.querySelector('.loading-state')) {
        
        console.log('🧹 Nettoyage du conteneur d\'actualités générales pour permettre un format uniforme');
        recentNewsContainer.innerHTML = '';
    }
    
    // 4. Vérifier que les données d'actualités sont disponibles
    if (!window.NewsSystem || !window.NewsSystem.categorizedNews || !window.NewsSystem.categorizedNews.regular) {
        console.warn('⚠️ Données d\'actualités non disponibles, réchargement des données...');
        
        // 4.1 Essayer de forcer le chargement des données
        if (window.NewsSystem && window.NewsSystem.initializeNewsData) {
            window.NewsSystem.initializeNewsData();
        }
        
        return;
    }
    
    // 5. Redessiner manuellement les actualités avec le format souhaité
    const regularNews = window.NewsSystem.categorizedNews.regular;
    
    // Si le module news-hierarchy a déjà une fonction pour afficher les actualités, l'utiliser
    if (window.NewsSystem.displayRecentNews) {
        console.log('✅ Réaffichage des actualités générales avec le format uniforme');
        window.NewsSystem.displayRecentNews(regularNews);
    } else {
        console.log('⚠️ Fonction d\'affichage non disponible, création d\'une fonction personnalisée');
        
        // Créer un conteneur pour les actualités
        const newsGrid = document.createElement('div');
        newsGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';
        
        // Créer chaque carte d'actualité
        regularNews.forEach((item, index) => {
            // Format similaire à celui des actualités critiques/importantes
            const impactClass = item.impact === 'negative' ? 'bg-red-700 bg-opacity-10 border-red-600' : 
                                item.impact === 'positive' ? 'bg-green-700 bg-opacity-10 border-green-600' : 
                                'bg-yellow-700 bg-opacity-10 border-yellow-600';
            
            const impactText = item.impact === 'negative' ? 'IMPACT NÉGATIF' : 
                              item.impact === 'positive' ? 'IMPACT POSITIF' : 'IMPACT NEUTRE';
            
            const sentimentIcon = item.sentiment === 'positive' ? '<i class="fas fa-arrow-up"></i>' : 
                                 item.sentiment === 'negative' ? '<i class="fas fa-arrow-down"></i>' : 
                                 '<i class="fas fa-minus"></i>';
            
            const scoreDisplay = `<span class="ml-score-badge">${item.score || 0}</span>`;
            
            const newsCard = document.createElement('div');
            newsCard.className = `news-card glassmorphism ${impactClass}`;
            
            // Attributs pour le filtrage
            newsCard.setAttribute('data-category', item.category || 'general');
            newsCard.setAttribute('data-impact', item.impact || 'neutral');
            newsCard.setAttribute('data-sentiment', item.sentiment || 'neutral');
            newsCard.setAttribute('data-news-id', `news-regular-${index}`);
            newsCard.setAttribute('data-country', item.country || 'other');
            
            // URL cliquable
            if (item.url) {
                newsCard.setAttribute('data-url', item.url);
                newsCard.style.cursor = 'pointer';
                newsCard.addEventListener('click', function() {
                    window.open(item.url, '_blank');
                });
                newsCard.classList.add('clickable-news');
            }
            
            // Contenu HTML au format souhaité
            newsCard.innerHTML = `
                <div class="p-4">
                    <div class="mb-2">
                        <span class="impact-indicator impact-${item.impact}">${impactText}</span>
                        <span class="impact-indicator">${(item.category || 'GENERAL').toUpperCase()}</span>
                        <span class="sentiment-indicator sentiment-${item.sentiment || 'neutral'}">
                            ${sentimentIcon}
                            ${scoreDisplay}
                        </span>
                    </div>
                    <h3 class="text-md font-semibold">${item.title}</h3>
                    <p class="text-sm mt-2">${item.content || ''}</p>
                    <div class="news-meta">
                        <span class="source">${item.source || 'Financial Data'}</span>
                        <div class="date-time">
                            <i class="fas fa-clock mr-1"></i>
                            ${item.date || ''} ${item.time || ''}
                        </div>
                        ${item.url ? '<div class="read-more"><i class="fas fa-external-link-alt mr-1"></i> Lire l\'article</div>' : ''}
                    </div>
                </div>
            `;
            
            newsGrid.appendChild(newsCard);
        });
        
        // Vider et remplir le conteneur
        recentNewsContainer.innerHTML = '';
        recentNewsContainer.appendChild(newsGrid);
    }
    
    console.log('✅ Correctif d\'affichage des actualités appliqué avec succès');
}
