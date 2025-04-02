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
            console.log("Données de thèmes chargées:", data);
            
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
    for (const axe of Object.keys(themesData)) {
        const container = document.getElementById(`${axe}-themes`);
        if (!container) continue;
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Récupérer les thèmes pour cet axe
        const themes = themesData[axe];
        
        // Si l'objet themes est vide
        if (Object.keys(themes).length === 0) {
            const li = document.createElement('li');
            li.className = 'text-gray-500 text-sm italic';
            li.textContent = 'Aucun thème dominant identifié';
            container.appendChild(li);
            continue;
        }
        
        // Identifier le score maximum pour le calcul des pourcentages
        let maxCount = 0;
        Object.values(themes).forEach(themeData => {
            if (themeData.count > maxCount) {
                maxCount = themeData.count;
            }
        });
        
        // Ajouter chaque thème
        Object.entries(themes).forEach(([theme, themeData]) => {
            const li = document.createElement('li');
            li.className = 'theme-item flex justify-between items-center py-2';
            
            // Nom du thème traduit
            const displayName = THEME_TRANSLATIONS[theme] || theme;
            
            // Calculer le pourcentage pour la barre de progression
            const percentValue = Math.min(100, Math.round((themeData.count / maxCount) * 100));
            
            // Icône spécifique ou générique
            const icon = SPECIFIC_THEME_ICONS[theme] || THEME_ICONS[axe];
            
            // Construire l'élément HTML
            li.innerHTML = `
                <div class="flex items-center">
                    <i class="${icon} mr-2 text-xs" style="color: ${THEME_COLORS[axe]}"></i>
                    <span>${displayName}</span>
                </div>
                <div class="flex items-center">
                    <span class="text-xs mr-2">${themeData.count}</span>
                    <div class="w-16 bg-gray-700 rounded-full h-2">
                        <div class="h-2 rounded-full" style="width: ${percentValue}%; background-color: ${THEME_COLORS[axe]}"></div>
                    </div>
                </div>
            `;
            
            // Ajouter un tooltip avec le résumé GPT si disponible
            if (themeData.gpt_summary) {
                li.setAttribute('title', themeData.gpt_summary.replace(/\*\*/g, ''));
                li.classList.add('cursor-help');
                
                // Ajout d'un indicateur visuel pour montrer qu'il y a un résumé
                const infoIcon = document.createElement('i');
                infoIcon.className = 'fas fa-info-circle text-xs ml-2';
                infoIcon.style.color = THEME_COLORS[axe];
                li.querySelector('.flex.items-center').appendChild(infoIcon);
                
                // Ajouter une popup de détail au clic
                li.addEventListener('click', () => {
                    showThemeDetail(theme, displayName, themeData, axe);
                });
            }
            
            container.appendChild(li);
        });
    }
}

/**
 * Affiche une popup avec les détails d'un thème
 */
function showThemeDetail(themeKey, themeName, themeData, axe) {
    // Vérifier si une popup existe déjà et la supprimer
    const existingPopup = document.querySelector('.theme-detail-popup');
    if (existingPopup) {
        existingPopup.remove();
    }
    
    // Créer la popup
    const popup = document.createElement('div');
    popup.className = 'theme-detail-popup fixed inset-0 flex items-center justify-center z-50';
    
    // Fond semi-transparent
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black bg-opacity-75';
    overlay.addEventListener('click', () => popup.remove());
    
    // Contenu de la popup
    const content = document.createElement('div');
    content.className = 'bg-gray-900 rounded-lg p-6 max-w-2xl w-full mx-4 relative z-10 border border-gray-700';
    content.style.boxShadow = `0 0 20px ${THEME_COLORS[axe]}`;
    
    // Titre
    const title = document.createElement('h3');
    title.className = 'text-xl font-bold mb-4 flex items-center';
    title.innerHTML = `<i class="${SPECIFIC_THEME_ICONS[themeKey] || THEME_ICONS[axe]} mr-2" style="color: ${THEME_COLORS[axe]}"></i> ${themeName}`;
    
    // Corps avec le résumé GPT
    const body = document.createElement('div');
    body.className = 'prose prose-sm prose-invert mb-4';
    
    // Utiliser le résumé GPT s'il existe, sinon un message simple
    if (themeData.gpt_summary) {
        // Convertir le markdown simple en HTML
        const summaryHtml = themeData.gpt_summary
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')  // Bold
            .replace(/\n/g, '<br>');                             // Line breaks
        
        body.innerHTML = summaryHtml;
    } else {
        body.innerHTML = `<p>Ce thème a été mentionné dans <strong>${themeData.count}</strong> articles récents.</p>`;
    }
    
    // Exemples si disponibles
    if (themeData.examples && themeData.examples.length > 0) {
        const examples = document.createElement('div');
        examples.className = 'mt-4';
        
        const exampleTitle = document.createElement('h4');
        exampleTitle.className = 'text-gray-400 text-sm font-medium mb-2';
        exampleTitle.textContent = 'Articles représentatifs:';
        examples.appendChild(exampleTitle);
        
        const exampleList = document.createElement('ul');
        exampleList.className = 'list-disc pl-5 text-sm text-gray-300 space-y-1';
        
        themeData.examples.forEach(example => {
            const item = document.createElement('li');
            item.textContent = example;
            exampleList.appendChild(item);
        });
        
        examples.appendChild(exampleList);
        body.appendChild(examples);
    }
    
    // Bouton de fermeture
    const closeButton = document.createElement('button');
    closeButton.className = 'absolute top-4 right-4 text-gray-400 hover:text-white';
    closeButton.innerHTML = '<i class="fas fa-times"></i>';
    closeButton.addEventListener('click', () => popup.remove());
    
    // Assembler la popup
    content.appendChild(title);
    content.appendChild(body);
    content.appendChild(closeButton);
    popup.appendChild(overlay);
    popup.appendChild(content);
    
    // Ajouter la popup au document
    document.body.appendChild(popup);
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

// Ajouter des styles CSS pour la popup
const styleElement = document.createElement('style');
styleElement.textContent = `
.theme-item {
    transition: all 0.2s ease;
    cursor: pointer;
}
.theme-item:hover {
    background-color: rgba(255, 255, 255, 0.05);
}
.theme-detail-popup {
    animation: fadeIn 0.3s ease;
}
@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}
`;
document.head.appendChild(styleElement);
