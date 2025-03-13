/**
 * dashboard-guide.js
 * Script pour ajouter un guide utilisateur et améliorer la lisibilité du tableau de bord
 */

document.addEventListener('DOMContentLoaded', function() {
    // Vérifier si nous sommes sur la page dashboard
    if (!window.location.pathname.includes('dashboard.html') && 
        !window.location.pathname.endsWith('/')) return;
    
    console.log('Initialisation du guide du tableau de bord...');
    
    // Fonction pour ajouter le guide utilisateur en haut du tableau de bord
    function addDashboardGuide() {
        // Trouver le conteneur principal
        const container = document.querySelector('.dashboard-container');
        if (!container) return;
        
        // Créer le guide
        const guideElement = document.createElement('div');
        guideElement.className = 'dashboard-guide';
        guideElement.innerHTML = `
            <div class="guide-title">
                <i class="fas fa-info-circle"></i> Bienvenue sur votre tableau de bord TradePulse
            </div>
            <div class="guide-text">
                Ce tableau de bord affiche une vue d'ensemble de votre portefeuille, des marchés et des événements importants. 
                Utilisez les filtres "Agressif", "Modéré" et "Stable" pour changer de vue de portefeuille. 
                <span class="text-neon-green">Les données des marchés sont mises à jour en temps réel.</span>
            </div>
            <button id="dismiss-guide" class="action-button action-button-primary mt-3">
                <i class="fas fa-check"></i> J'ai compris
            </button>
        `;
        
        // Insérer le guide au début du conteneur
        container.insertBefore(guideElement, container.firstChild);
        
        // Ajouter l'événement pour masquer le guide
        document.getElementById('dismiss-guide').addEventListener('click', function() {
            guideElement.style.display = 'none';
            localStorage.setItem('dashboardGuideHidden', 'true');
        });
        
        // Vérifier si le guide a déjà été masqué
        if (localStorage.getItem('dashboardGuideHidden') === 'true') {
            guideElement.style.display = 'none';
        }
    }
    
    // Fonction pour améliorer la lisibilité des sections existantes
    function enhanceSections() {
        // Ajouter des titres de section explicites
        addSectionHeaders();
        
        // Améliorer les cartes existantes
        enhanceCards();
        
        // Ajouter des infobulles pour expliquer certaines métriques
        addInfoTooltips();
        
        // Améliorer la lisibilité du tableau des composants du portefeuille
        enhancePortfolioTable();
        
        // Améliorer la section des marchés
        enhanceMarketsSection();
        
        // Ajouter des étiquettes descriptives aux statistiques
        addStatLabels();
    }
    
    // Fonction pour ajouter des titres de section explicites
    function addSectionHeaders() {
        // Liste des sections à améliorer
        const sections = [
            {
                targetElement: '#asset-allocation-widget',
                title: '<i class="fas fa-chart-pie"></i> Composition de votre portefeuille',
                description: 'Répartition de vos investissements par type d\'actifs'
            },
            {
                targetElement: '#portfolio-widget',
                title: '<i class="fas fa-briefcase"></i> Détails du portefeuille',
                description: 'Valeur, performance et composition détaillée'
            },
            {
                targetElement: '#events-widget',
                title: '<i class="fas fa-calendar-day"></i> Agenda financier du jour',
                description: 'Événements économiques importants à surveiller'
            },
            {
                targetElement: '#news-widget',
                title: '<i class="fas fa-newspaper"></i> Dernières actualités',
                description: 'Informations récentes pouvant impacter les marchés'
            },
            {
                targetElement: '#ai-credits-widget',
                title: '<i class="fas fa-robot"></i> Votre assistant IA',
                description: 'Crédit d\'utilisation et dernières mises à jour'
            },
            {
                targetElement: '#markets-widget',
                title: '<i class="fas fa-chart-line"></i> Aperçu des marchés',
                description: 'Indices principaux et performances du jour'
            }
        ];
        
        // Ajouter les titres
        sections.forEach(section => {
            const element = document.querySelector(section.targetElement);
            if (!element) return;
            
            const headerElement = element.querySelector('.flex.justify-between.items-center.p-5');
            if (!headerElement) return;
            
            // Remplacer le titre existant
            const titleElement = headerElement.querySelector('h3');
            if (titleElement) {
                titleElement.className = 'dashboard-section-title';
                titleElement.innerHTML = section.title;
            }
            
            // Ajouter une description si elle n'existe pas déjà
            if (!element.querySelector('.section-description')) {
                const descriptionElement = document.createElement('div');
                descriptionElement.className = 'section-description text-sm text-gray-400 mb-4 px-5 pt-2';
                descriptionElement.textContent = section.description;
                
                // Insérer après le header
                headerElement.parentNode.insertBefore(descriptionElement, headerElement.nextSibling);
            }
        });
    }
    
    // Fonction pour améliorer les cartes
    function enhanceCards() {
        // Améliorer toutes les cartes glassmorphism
        document.querySelectorAll('.glassmorphism').forEach(card => {
            card.classList.add('enhanced-card');
        });
        
        // Améliorer les en-têtes de carte
        document.querySelectorAll('.card-header, .flex.justify-between.items-center.p-5.border-b').forEach(header => {
            header.classList.add('card-header-enhanced');
        });
    }
    
    // Fonction pour ajouter des infobulles explicatives
    function addInfoTooltips() {
        // Liste des éléments auxquels ajouter des infobulles
        const tooltips = [
            {
                targetSelector: '#totalPortfolioValue',
                text: 'Valeur totale actuelle de votre portefeuille en euros'
            },
            {
                targetSelector: '#portfolioPerformance',
                text: 'Performance des 7 derniers jours par rapport à la valeur précédente'
            },
            {
                targetSelector: '#monthlyPerformance',
                text: 'Performance du portefeuille depuis le début du mois'
            },
            {
                targetSelector: '.legend-item:nth-child(1)',
                text: 'Actions : Parts de propriété dans une entreprise cotée en bourse'
            },
            {
                targetSelector: '.legend-item:nth-child(2)',
                text: 'ETFs : Fonds négociés en bourse qui suivent un indice ou un secteur'
            },
            {
                targetSelector: '.legend-item:nth-child(3)',
                text: 'Crypto : Actifs numériques basés sur la blockchain'
            },
            {
                targetSelector: '.legend-item:nth-child(4)',
                text: 'Obligations : Titres de créance émis par des entreprises ou gouvernements'
            }
        ];
        
        // Ajouter les infobulles
        tooltips.forEach(tooltip => {
            const element = document.querySelector(tooltip.targetSelector);
            if (!element) return;
            
            const infoIcon = document.createElement('span');
            infoIcon.className = 'info-tooltip';
            infoIcon.innerHTML = '<i class="fas fa-info-circle"></i><span class="tooltip-text">' + tooltip.text + '</span>';
            
            element.appendChild(infoIcon);
        });
    }
    
    // Fonction pour améliorer le tableau des composants du portefeuille
    function enhancePortfolioTable() {
        const table = document.querySelector('#portfolio-widget .portfolio-table');
        if (!table) return;
        
        // Ajouter une classe pour les styles améliorés
        table.classList.add('table-enhanced');
        
        // Améliorer les en-têtes de colonne avec des descriptions claires
        const headers = table.querySelectorAll('th');
        if (headers.length >= 4) {
            headers[0].innerHTML = 'ACTIF <span class="text-xs text-gray-400">(Nom)</span>';
            headers[1].innerHTML = 'TYPE <span class="text-xs text-gray-400">(Catégorie)</span>';
            headers[2].innerHTML = 'ALLOCATION <span class="text-xs text-gray-400">(%)</span>';
            headers[3].innerHTML = 'PERF. <span class="text-xs text-gray-400">(Variation)</span>';
        }
    }
    
    // Fonction pour améliorer la section des marchés
    function enhanceMarketsSection() {
        const marketsWidget = document.querySelector('#markets-widget');
        if (!marketsWidget) return;
        
        // Améliorer les cartes d'indice
        const indexCards = marketsWidget.querySelectorAll('.bg-\\[\\#011E34\\].bg-opacity-70.p-5.rounded-lg');
        indexCards.forEach(card => {
            // Ajouter une étiquette explicative
            const indexName = card.querySelector('.font-medium');
            if (indexName) {
                // Ajouter une description selon l'indice
                let description = '';
                switch(indexName.textContent.trim()) {
                    case 'S&P 500':
                        description = 'Indice boursier des 500 plus grandes entreprises américaines';
                        break;
                    case 'NASDAQ':
                        description = 'Indice boursier axé sur les entreprises technologiques américaines';
                        break;
                    case 'CAC 40':
                        description = 'Indice principal de la bourse de Paris (40 entreprises)';
                        break;
                }
                
                if (description) {
                    const descElement = document.createElement('div');
                    descElement.className = 'text-xs text-gray-400 mb-3';
                    descElement.textContent = description;
                    
                    // Insérer après le nom de l'indice
                    indexName.parentNode.insertBefore(descElement, indexName.nextSibling);
                }
            }
            
            // Améliorer les valeurs pour plus de lisibilité
            const valueElement = card.querySelector('.text-2xl.font-bold');
            if (valueElement) {
                const valueLabel = document.createElement('div');
                valueLabel.className = 'text-xs text-gray-400 mb-1';
                valueLabel.textContent = 'VALEUR ACTUELLE';
                
                // Insérer avant la valeur
                valueElement.parentNode.insertBefore(valueLabel, valueElement);
            }
        });
    }
    
    // Fonction pour ajouter des étiquettes descriptives aux statistiques
    function addStatLabels() {
        // Ajouter des explications aux cartes de statistiques
        const statCards = document.querySelectorAll('.stat-card');
        statCards.forEach(card => {
            card.classList.add('stat-card-enhanced');
            
            // Ajouter une info-bulle aux titres
            const titleElement = card.querySelector('.title');
            if (titleElement) {
                titleElement.classList.add('stat-title');
                
                // Déterminer le texte de l'info-bulle en fonction du titre
                let tooltipText = '';
                if (titleElement.textContent.includes('Valeur totale')) {
                    tooltipText = 'Somme de tous les actifs dans votre portefeuille actuel';
                } else if (titleElement.textContent.includes('Performance mensuelle')) {
                    tooltipText = 'Évolution en pourcentage depuis le début du mois en cours';
                }
                
                if (tooltipText) {
                    const infoIcon = document.createElement('span');
                    infoIcon.className = 'info-tooltip ml-1';
                    infoIcon.innerHTML = '<i class="fas fa-info-circle"></i><span class="tooltip-text">' + tooltipText + '</span>';
                    
                    titleElement.appendChild(infoIcon);
                }
            }
            
            // Améliorer les valeurs
            const valueElement = card.querySelector('.value');
            if (valueElement) {
                valueElement.classList.add('stat-value');
            }
            
            // Améliorer les variations
            const changeElement = card.querySelector('.change');
            if (changeElement) {
                changeElement.classList.add('stat-change');
            }
        });
    }
    
    // Ajouter le guide
    addDashboardGuide();
    
    // Améliorer les sections
    enhanceSections();
    
    console.log('Guide du tableau de bord initialisé');
});
