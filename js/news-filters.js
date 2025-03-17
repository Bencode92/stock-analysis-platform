/**
 * news-filters.js
 * Gestion des filtres pour les actualités financières
 */

document.addEventListener('DOMContentLoaded', function() {
    // Vérifier si nous sommes sur la page d'actualités
    const categoryFilters = document.getElementById('category-filters');
    const impactSelect = document.getElementById('impact-select');
    const countrySelect = document.getElementById('country-select');
    
    if (!categoryFilters) return;
    
    // Variables globales pour le suivi des filtres actifs
    let activeCategory = 'all';
    let activeImpact = 'all';
    let activeCountry = 'all';
    
    // Fonction pour filtrer les actualités selon plusieurs critères
    function applyFilters() {
        const newsCards = document.querySelectorAll('.news-card');
        
        newsCards.forEach(card => {
            // Récupérer les attributs pour la filtration
            const category = card.dataset.category || '';
            const impact = card.dataset.impact || '';
            const country = card.dataset.country || '';
            
            // Logique de filtration combinée
            const matchesCategory = activeCategory === 'all' || category === activeCategory;
            const matchesImpact = activeImpact === 'all' || impact === activeImpact;
            const matchesCountry = activeCountry === 'all' || country === activeCountry;
            
            // Appliquer la visibilité en fonction des filtres
            if (matchesCategory && matchesImpact && matchesCountry) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
        
        // Afficher un message si aucun résultat
        checkEmptyResults();
    }
    
    // Fonction pour vérifier s'il y a des résultats après filtrage
    function checkEmptyResults() {
        const criticalContainer = document.getElementById('critical-news-container');
        const importantContainer = document.getElementById('important-news-container');
        const recentContainer = document.getElementById('recent-news');
        
        const containers = [criticalContainer, importantContainer, recentContainer].filter(c => c);
        
        containers.forEach(container => {
            // Compter les cartes visibles
            const visibleCards = container.querySelectorAll('.news-card:not([style*="display: none"])');
            
            // Obtenir ou créer un message de résultats vides
            let emptyMessage = container.querySelector('.empty-results-message');
            
            if (visibleCards.length === 0) {
                if (!emptyMessage) {
                    emptyMessage = document.createElement('div');
                    emptyMessage.className = 'empty-results-message text-center text-gray-400 py-8';
                    emptyMessage.innerHTML = `
                        <i class="fas fa-search text-2xl mb-2"></i>
                        <p>Aucune actualité ne correspond à vos filtres</p>
                    `;
                    container.appendChild(emptyMessage);
                }
            } else if (emptyMessage) {
                emptyMessage.remove();
            }
        });
    }
    
    // Initialisation: ajouter des data-attributes aux cartes d'actualités
    function initializeNewsCards() {
        const newsCards = document.querySelectorAll('.news-card');
        
        newsCards.forEach(card => {
            // S'assurer que les cartes ont les attributs de données nécessaires
            if (!card.hasAttribute('data-category')) {
                const categoryEl = card.querySelector('.impact-indicator:nth-child(2)');
                const category = categoryEl ? categoryEl.textContent.toLowerCase() : 'general';
                card.setAttribute('data-category', category);
            }
            
            if (!card.hasAttribute('data-impact')) {
                const impactEl = card.querySelector('.impact-indicator:first-child');
                let impact = 'neutral';
                
                if (impactEl) {
                    const impactText = impactEl.textContent.toLowerCase();
                    if (impactText.includes('positif')) {
                        impact = 'positive';
                    } else if (impactText.includes('négatif')) {
                        impact = 'negative';
                    }
                }
                
                card.setAttribute('data-impact', impact);
            }
            
            if (!card.hasAttribute('data-country')) {
                const countryEl = card.querySelector('.source');
                const countryText = countryEl ? countryEl.textContent : '';
                
                let country = 'other';
                if (countryText.includes('US') || countryText.includes('États-Unis')) {
                    country = 'us';
                } else if (countryText.includes('FR') || countryText.includes('France')) {
                    country = 'fr';
                } else if (countryText.includes('EU') || countryText.includes('Europe')) {
                    country = 'eu';
                }
                
                card.setAttribute('data-country', country);
            }
        });
    }
    
    // Gestion des événements pour les filtres de catégorie
    function setupCategoryFilters() {
        const categoryButtons = categoryFilters.querySelectorAll('button');
        
        categoryButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Mettre à jour la classe active
                categoryButtons.forEach(btn => btn.classList.remove('filter-active', 'bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30'));
                categoryButtons.forEach(btn => btn.classList.add('bg-transparent', 'text-gray-400', 'border-gray-700'));
                
                button.classList.remove('bg-transparent', 'text-gray-400', 'border-gray-700');
                button.classList.add('filter-active', 'bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
                
                // Mettre à jour le filtre actif
                activeCategory = button.getAttribute('data-category');
                
                // Appliquer les filtres
                applyFilters();
            });
        });
    }
    
    // Gestion du filtre par impact
    function setupImpactFilter() {
        if (impactSelect) {
            impactSelect.addEventListener('change', function() {
                activeImpact = this.value;
                applyFilters();
            });
        }
    }
    
    // Gestion du filtre par pays
    function setupCountryFilter() {
        if (countrySelect) {
            countrySelect.addEventListener('change', function() {
                activeCountry = this.value;
                applyFilters();
            });
        }
    }
    
    // Initialisation
    function init() {
        // Attendre un court moment pour s'assurer que les cartes d'actualités sont chargées
        setTimeout(() => {
            initializeNewsCards();
            setupCategoryFilters();
            setupImpactFilter();
            setupCountryFilter();
            
            // Appliquer les filtres par défaut
            applyFilters();
            
            console.log('Filtres d\'actualités initialisés');
        }, 500);
    }
    
    // Démarrer l'initialisation
    init();
});