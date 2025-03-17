/**
 * actualites.js - Interface utilisateur pour les actualités financières
 * Ce script gère l'interface utilisateur et les filtres pour les actualités.
 * Il s'appuie sur news-hierarchy.js pour le chargement et la hiérarchisation des données.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Pour l'initialisation des données, on utilise NewsSystem si disponible
    if (window.NewsSystem) {
        console.log('Utilisation du système de hiérarchie des actualités existant');
    } else {
        console.error('Le système de hiérarchie des actualités n\'est pas disponible');
        // Afficher un message d'erreur
        displaySystemError();
        return;
    }
    
    // Configuration des filtres et tris
    setupFilters();
    
    // Configuration des boutons d'événements
    setupEventButtons();
    
    // Configuration du bouton "Voir plus"
    setupLoadMoreButton();
    
    // Mise à jour de l'heure de marché
    setupMarketTimer();
});

/**
 * Configure les filtres de catégorie, tri et impact
 */
function setupFilters() {
    // Configuration des filtres de catégorie
    const categoryFilters = document.querySelectorAll('#category-filters button');
    categoryFilters.forEach(filter => {
        filter.addEventListener('click', function() {
            // Retirer la classe active de tous les filtres
            categoryFilters.forEach(f => f.classList.remove('filter-active'));
            
            // Ajouter la classe active au filtre cliqué
            this.classList.add('filter-active');
            
            // Appliquer le filtre
            const category = this.getAttribute('data-category');
            window.NewsSystem.filterNews('category', category);
        });
    });
    
    // Filtre d'impact
    const impactSelect = document.getElementById('impact-select');
    if (impactSelect) {
        impactSelect.addEventListener('change', function() {
            window.NewsSystem.filterNews('impact', this.value);
        });
    }
    
    // Filtre de pays
    const countrySelect = document.getElementById('country-select');
    if (countrySelect) {
        countrySelect.addEventListener('change', function() {
            window.NewsSystem.filterNews('country', this.value);
        });
    }
}

/**
 * Configure les boutons de filtre des événements
 */
function setupEventButtons() {
    const highImpactBtn = document.getElementById('high-impact-btn');
    const mediumImpactBtn = document.getElementById('medium-impact-btn');
    const allImpactBtn = document.getElementById('all-impact-btn');
    
    if (highImpactBtn && mediumImpactBtn && allImpactBtn) {
        // Filtres pour les événements
        highImpactBtn.addEventListener('click', function() {
            toggleActiveFilter(this);
            filterEventsByImpact('high');
        });
        
        mediumImpactBtn.addEventListener('click', function() {
            toggleActiveFilter(this);
            filterEventsByImpact('medium');
        });
        
        allImpactBtn.addEventListener('click', function() {
            toggleActiveFilter(this);
            filterEventsByImpact('all');
        });
    }
}

/**
 * Configure le bouton "Voir plus"
 */
function setupLoadMoreButton() {
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', function() {
            loadMoreNews();
        });
    }
}

/**
 * Configure le timer pour l'heure de marché
 */
function setupMarketTimer() {
    function updateMarketTime() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const timeStr = `${hours}:${minutes}:${seconds}`;
        
        const marketTimeElement = document.getElementById('marketTime');
        if (marketTimeElement) {
            marketTimeElement.textContent = timeStr;
        }
    }
    
    updateMarketTime();
    setInterval(updateMarketTime, 1000);
}

/**
 * Filtre les événements en fonction de leur niveau d'importance
 * @param {string} impactLevel - Niveau d'importance (high, medium, all)
 */
function filterEventsByImpact(impactLevel) {
    const eventElements = document.querySelectorAll('#events-container .event-card');
    
    eventElements.forEach(element => {
        if (impactLevel === 'all') {
            element.style.display = 'flex';
        } else {
            const impact = element.dataset.impact;
            element.style.display = (impact === impactLevel) ? 'flex' : 'none';
        }
    });
}

/**
 * Change la classe active pour les boutons de filtre
 * @param {HTMLElement} button - Bouton à activer
 */
function toggleActiveFilter(button) {
    document.querySelectorAll('.filter-button.active').forEach(el => {
        el.classList.remove('active');
    });
    button.classList.add('active');
}

/**
 * Charge plus d'actualités
 */
function loadMoreNews() {
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (!loadMoreBtn) return;
    
    // Afficher l'animation de chargement
    loadMoreBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Chargement...';
    loadMoreBtn.disabled = true;
    
    // Simuler un chargement (sera remplacé par un vrai appel API)
    setTimeout(() => {
        // Restaurer le bouton
        loadMoreBtn.innerHTML = 'Voir plus d\'actualités';
        loadMoreBtn.disabled = false;
        
        // Afficher un message si aucune nouvelle actualité n'est disponible
        const recentNewsContainer = document.getElementById('recent-news');
        if (!recentNewsContainer) return;
        
        const noMoreMessage = document.createElement('div');
        noMoreMessage.className = 'no-data-message flex flex-col items-center justify-center py-8 my-4';
        noMoreMessage.innerHTML = `
            <i class="fas fa-check-circle text-green-400 text-3xl mb-3"></i>
            <h3 class="text-white font-medium mb-2">Toutes les actualités sont affichées</h3>
            <p class="text-gray-400">Vous êtes à jour ! Revenez plus tard pour voir de nouvelles actualités.</p>
        `;
        
        recentNewsContainer.appendChild(noMoreMessage);
        
        // Désactiver le bouton
        loadMoreBtn.disabled = true;
        loadMoreBtn.style.opacity = '0.5';
        loadMoreBtn.style.cursor = 'not-allowed';
    }, 1000);
}

/**
 * Affiche un message d'erreur système
 */
function displaySystemError() {
    const containers = ['critical-news-container', 'important-news-container', 'recent-news'];
    
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        
        container.innerHTML = `
            <div class="error-message bg-gray-800 bg-opacity-70 rounded-lg p-4 text-center">
                <i class="fas fa-exclamation-triangle text-yellow-400 text-2xl mb-2"></i>
                <h3 class="text-white font-medium mb-2">Erreur système</h3>
                <p class="text-gray-400 mb-3">Le système de traitement des actualités n'est pas disponible.</p>
                <button class="retry-button" onclick="window.location.reload()">
                    <i class="fas fa-sync-alt mr-1"></i> Actualiser la page
                </button>
            </div>
        `;
    });
}