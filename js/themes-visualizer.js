/**
 * themes-visualizer.js
 * Script pour charger et afficher les thèmes dominants de l'actualité financière
 */

// Traduction des thèmes pour un affichage plus convivial
const THEME_TRANSLATIONS = {
    // Macroéconomie
    "inflation": "Inflation",
    "recession": "Récession",
    "politique_monetaire": "Politique monétaire",
    "geopolitique": "Géopolitique",
    "transition_energetique": "Transition énergétique",
    
    // Secteurs
    "technologie": "Technologie",
    "energie": "Énergie",
    "defense": "Défense",
    "finance": "Finance",
    "immobilier": "Immobilier",
    "consommation": "Consommation",
    
    // Régions
    "europe": "Europe",
    "usa": "États-Unis",
    "asie": "Asie",
    "latam": "Amérique latine",
    "global": "Mondial"
};

// Couleurs pour les différents axes
const THEME_COLORS = {
    "macroeconomie": "#00c8ff", // Bleu
    "secteurs": "#00ffb3",      // Vert
    "regions": "#ff9f00"        // Orange
};

// Icônes pour les différents axes
const THEME_ICONS = {
    "macroeconomie": "fas fa-chart-line",
    "secteurs": "fas fa-industry",
    "regions": "fas fa-globe-americas"
};

// Icônes pour les thèmes spécifiques (optionnel, pour affichage avancé)
const SPECIFIC_THEME_ICONS = {
    "inflation": "fas fa-money-bill-wave",
    "recession": "fas fa-arrow-trend-down",
    "technologie": "fas fa-microchip",
    "energie": "fas fa-bolt",
    "finance": "fas fa-landmark",
    "europe": "fas fa-euro-sign",
    "usa": "fas fa-dollar-sign"
};

/**
 * Charge les thèmes dominants depuis le serveur
 */
function loadDominantThemes() {
    fetch('data/themes.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Par défaut, afficher les thèmes hebdomadaires
            displayThemes(data.themes.weekly);
            
            // Configurer les boutons de période
            setupPeriodButtons(data.themes);
            
            // Mettre à jour le timestamp
            updateLastUpdateTime(data.lastUpdated);
        })
        .catch(error => {
            console.error('Erreur lors du chargement des thèmes:', error);
            showFallbackContent();
        });
}

/**
 * Configure les boutons de sélection de période
 */
function setupPeriodButtons(themesData) {
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            // Enlever la classe active de tous les boutons
            document.querySelectorAll('.period-btn').forEach(b => 
                b.classList.remove('active')
            );
            
            // Ajouter la classe active au bouton cliqué
            this.classList.add('active');
            
            // Afficher les thèmes pour la période sélectionnée
            const period = this.getAttribute('data-period');
            displayThemes(themesData[period]);
        });
    });
}

/**
 * Affiche les thèmes dominants dans l'interface
 */
function displayThemes(themesData) {
    // Pour chaque axe (macroéconomie, secteurs, régions)
    for (const [axe, themes] of Object.entries(themesData)) {
        const container = document.getElementById(`${axe}-themes`);
        if (!container) continue;
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Identifier le score maximum pour le calcul des pourcentages
        let maxScore = 0;
        if (themes.length > 0) {
            maxScore = themes[0][1]; // Le premier thème a le score le plus élevé
        }
        
        // Ajouter chaque thème
        themes.forEach(([theme, count]) => {
            const li = document.createElement('li');
            li.className = 'theme-item flex justify-between items-center py-2';
            
            // Nom du thème traduit
            const displayName = THEME_TRANSLATIONS[theme] || theme;
            
            // Calculer le pourcentage pour la barre de progression
            const percentValue = Math.min(100, Math.round((count / maxScore) * 100));
            
            // Icône spécifique ou générique
            const icon = SPECIFIC_THEME_ICONS[theme] || THEME_ICONS[axe];
            
            // Construire l'élément HTML
            li.innerHTML = `
                <div class="flex items-center">
                    <i class="${icon} mr-2 text-xs" style="color: ${THEME_COLORS[axe]}"></i>
                    <span>${displayName}</span>
                </div>
                <div class="flex items-center">
                    <span class="text-xs mr-2">${count}</span>
                    <div class="w-16 bg-gray-700 rounded-full h-2">
                        <div class="h-2 rounded-full" style="width: ${percentValue}%; background-color: ${THEME_COLORS[axe]}"></div>
                    </div>
                </div>
            `;
            
            container.appendChild(li);
        });
        
        // Si aucun thème n'a été trouvé
        if (themes.length === 0) {
            const li = document.createElement('li');
            li.className = 'text-gray-500 text-sm italic';
            li.textContent = 'Aucun thème dominant identifié';
            container.appendChild(li);
        }
    }
}

/**
 * Affiche un contenu de secours en cas d'erreur
 */
function showFallbackContent() {
    const axes = ['macroeconomie', 'secteurs', 'regions'];
    
    axes.forEach(axe => {
        const container = document.getElementById(`${axe}-themes`);
        if (!container) return;
        
        container.innerHTML = `
            <li class="text-gray-500">
                <i class="fas fa-exclamation-circle mr-2"></i>
                Données non disponibles
            </li>
        `;
    });
}

/**
 * Met à jour l'horodatage de dernière mise à jour
 */
function updateLastUpdateTime(timestamp) {
    const timeElement = document.getElementById('themes-last-updated');
    if (timeElement && timestamp) {
        try {
            const date = new Date(timestamp);
            const formattedDate = date.toLocaleDateString('fr-FR');
            const formattedTime = date.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            timeElement.textContent = `${formattedDate} ${formattedTime}`;
        } catch (e) {
            console.error('Erreur lors du formatage de la date:', e);
            timeElement.textContent = 'Date inconnue';
        }
    }
}

// Charger les thèmes au chargement de la page
document.addEventListener('DOMContentLoaded', loadDominantThemes);
