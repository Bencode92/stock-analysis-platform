// TradePulse - Application d'analyse financière en temps réel
document.addEventListener('DOMContentLoaded', function() {
    // Éléments DOM
    const searchInput = document.getElementById('stockSearch');
    const searchBtn = document.getElementById('searchBtn');
    const marketIndicator = document.querySelector('.market-indicator');
    const marketStatusText = document.querySelector('.market-status span');
    const marketTimeElement = document.querySelector('.market-time');
    const updateTimeElement = document.querySelector('.update-time');
    const bullishSectorsContainer = document.getElementById('bullishSectors');
    const bearishSectorsContainer = document.getElementById('bearishSectors');
    const portfolioTableBody = document.getElementById('portfolioTableBody');
    const portfolioChartCanvas = document.getElementById('portfolioChart');
    const newsGrid = document.querySelector('.news-grid');
    
    // Variables globales
    let portfolioChart = null;
    let sectorData = {};
    let portfolioData = [];
    let newsData = [];
    let lastPerplexityUpdate = null;
    let perplexityUpdateInterval = 3600000; // 1 heure par défaut
    let newsUpdateInterval = 1800000; // 30 minutes par défaut
    
    // Initialisation
    function init() {
        // Mettre à jour l'heure
        updateMarketTime();
        
        // Initialiser le graphique du portefeuille
        initPortfolioChart();
        
        // Récupérer les actualités depuis Perplexity
        fetchNewsFromPerplexity();
        
        // Configurer les écouteurs d'événements
        setupEventListeners();
        
        // Mettre à jour régulièrement l'heure
        setInterval(updateMarketTime, 1000);
        
        // Vérifier régulièrement si une mise à jour des actualités est nécessaire
        setInterval(checkNewsUpdate, 300000); // Vérifier toutes les 5 minutes
    }
    
    // Vérifier si une mise à jour des actualités est nécessaire
    function checkNewsUpdate() {
        const now = new Date();
        if (!lastPerplexityUpdate || (now - lastPerplexityUpdate) > newsUpdateInterval) {
            console.log("Actualisation des actualités de Perplexity nécessaire");
            fetchNewsFromPerplexity();
        }
    }
    
    // Récupérer les actualités depuis Perplexity
    async function fetchNewsFromPerplexity() {
        // Afficher un indicateur de chargement
        if (newsGrid) {
            newsGrid.innerHTML = `
                <div class="loading-news">
                    <div class="spinner"></div>
                    <p>Récupération des dernières actualités...</p>
                </div>
            `;
        }
        
        try {
            // Dans une implémentation réelle, vous appelleriez ici l'API Perplexity
            // Pour cette démonstration, nous utilisons des données simulées
            const response = await simulatePerplexityNewsAPI();
            
            // Filtrer pour ne garder que les actualités les plus importantes
            newsData = filterImportantNews(response.news);
            
            // Mettre à jour l'affichage des actualités
            updateNewsDisplay(newsData);
            
            // Mettre à jour la date de dernière actualisation
            lastPerplexityUpdate = new Date();
            updateLastUpdateTime();
            
            console.log("Actualités mises à jour avec succès:", newsData.length, "actualités importantes");
            
        } catch (error) {
            console.error("Erreur lors de la récupération des actualités:", error);
            
            // En cas d'erreur, afficher un message
            if (newsGrid) {
                newsGrid.innerHTML = `
                    <div class="news-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Impossible de récupérer les dernières actualités. Veuillez réessayer.</p>
                        <button class="refresh-button" onclick="document.querySelector('.news-section h2 .refresh-button').click()">
                            <i class="fas fa-sync-alt"></i> Réessayer
                        </button>
                    </div>
                `;
            }
        }
    }
    
    // Fonction pour filtrer les actualités les plus importantes
    function filterImportantNews(allNews) {
        // Critères pour déterminer l'importance d'une actualité:
        // 1. Score d'impact (calculé par Perplexity)
        // 2. Sources fiables (Bloomberg, Reuters, etc.)
        // 3. Fraîcheur (les plus récentes)
        // 4. Mentions de mots-clés importants (taux, BCE, Fed, marché, etc.)
        
        // Trier les actualités par score d'importance
        const scoredNews = allNews.map(news => {
            let score = 0;
            
            // Score basé sur la source
            const premiumSources = ['Bloomberg', 'Reuters', 'Financial Times', 'Wall Street Journal', 'CNBC'];
            if (premiumSources.some(source => news.source.includes(source))) {
                score += 30;
            }
            
            // Score basé sur les mots-clés dans le titre
            const keywordScores = {
                'BCE': 20, 'Fed': 20, 'taux': 15, 'inflation': 15, 'récession': 15,
                'croissance': 10, 'PIB': 10, 'chômage': 10, 'pétrole': 8, 'or': 8
            };
            
            Object.entries(keywordScores).forEach(([keyword, value]) => {
                if (news.title.toLowerCase().includes(keyword.toLowerCase())) {
                    score += value;
                }
            });
            
            // Score basé sur la fraîcheur
            const newsTime = new Date(news.timestamp);
            const now = new Date();
            const hoursAgo = (now - newsTime) / (1000 * 60 * 60);
            
            if (hoursAgo < 1) score += 25;
            else if (hoursAgo < 3) score += 20;
            else if (hoursAgo < 6) score += 15;
            else if (hoursAgo < 12) score += 10;
            else if (hoursAgo < 24) score += 5;
            
            // Score d'impact de Perplexity (simulation)
            score += news.impact || 0;
            
            return { ...news, score };
        });
        
        // Trier par score décroissant et ne garder que les 5 premières actualités
        return scoredNews.sort((a, b) => b.score - a.score).slice(0, 5);
    }
    
    // Fonction pour mettre à jour l'affichage des actualités
    function updateNewsDisplay(newsItems) {
        if (!newsGrid) return;
        
        let newsHTML = '';
        
        // L'actualité la plus importante sera mise en évidence
        const [topNews, ...otherNews] = newsItems;
        
        if (topNews) {
            newsHTML += `
                <div class="news-card major-news">
                    <div class="news-content">
                        <div class="news-meta">
                            <span class="news-source">${topNews.source}
                                <span class="news-badge important">Majeur</span>
                            </span>
                            <span class="news-time">${formatNewsTime(topNews.timestamp)}</span>
                        </div>
                        <h3>${topNews.title}</h3>
                        <p>${topNews.summary}</p>
                        <div class="news-impact">
                            <span class="impact-label">Impact:</span>
                            <div class="impact-meter">
                                <div class="impact-level" style="width: ${(topNews.impact / 50) * 100}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Afficher les autres actualités importantes
        otherNews.forEach(news => {
            newsHTML += `
                <div class="news-card">
                    <div class="news-content">
                        <div class="news-meta">
                            <span class="news-source">${news.source}</span>
                            <span class="news-time">${formatNewsTime(news.timestamp)}</span>
                        </div>
                        <h3>${news.title}</h3>
                        <p>${news.summary}</p>
                        <div class="news-impact">
                            <span class="impact-label">Impact:</span>
                            <div class="impact-meter">
                                <div class="impact-level" style="width: ${(news.impact / 50) * 100}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        newsGrid.innerHTML = newsHTML;
    }
    
    // Formater l'heure des actualités
    function formatNewsTime(timestamp) {
        const newsDate = new Date(timestamp);
        const now = new Date();
        const diffMs = now - newsDate;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        
        if (diffMinutes < 60) {
            return `Il y a ${diffMinutes} min${diffMinutes > 1 ? 's' : ''}`;
        } else {
            const diffHours = Math.floor(diffMinutes / 60);
            if (diffHours < 24) {
                return `Il y a ${diffHours} h${diffHours > 1 ? '' : ''}`;
            } else {
                return newsDate.toLocaleDateString('fr-FR');
            }
        }
    }
    
    // Simulation de l'API Perplexity pour les actualités
    function simulatePerplexityNewsAPI() {
        return new Promise((resolve) => {
            setTimeout(() => {
                const now = new Date();
                
                // Générer des horodatages relatifs à maintenant
                const getRandomTime = (maxHoursAgo) => {
                    const hoursAgo = Math.random() * maxHoursAgo;
                    return new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();
                };
                
                resolve({
                    news: [
                        {
                            title: "La BCE maintient ses taux directeurs malgré les tensions économiques",
                            source: "Financial Times",
                            summary: "La Banque Centrale Européenne a décidé de maintenir ses taux d'intérêt inchangés lors de sa réunion de politique monétaire d'aujourd'hui, malgré les signaux de ralentissement de l'économie européenne.",
                            timestamp: getRandomTime(2),
                            impact: 42
                        },
                        {
                            title: "Les actions américaines en baisse suite aux inquiétudes sur l'inflation",
                            source: "CNBC",
                            summary: "Wall Street enregistre une baisse après la publication des derniers chiffres de l'inflation, supérieurs aux attentes des analystes, ravivant les craintes d'un maintien prolongé des taux élevés.",
                            timestamp: getRandomTime(4),
                            impact: 38
                        },
                        {
                            title: "Nvidia établit un nouveau record historique porté par l'IA",
                            source: "Bloomberg",
                            summary: "Le titre Nvidia a atteint un nouveau sommet aujourd'hui, porté par des prévisions optimistes sur la demande de puces pour l'intelligence artificielle et des partenariats stratégiques annoncés avec les géants de la tech.",
                            timestamp: getRandomTime(1),
                            impact: 35
                        },
                        {
                            title: "Le pétrole chute suite aux tensions au Moyen-Orient",
                            source: "Reuters",
                            summary: "Les cours du pétrole brut ont chuté de plus de 3% aujourd'hui malgré les tensions géopolitiques au Moyen-Orient, en raison des inquiétudes concernant la demande mondiale.",
                            timestamp: getRandomTime(5),
                            impact: 33
                        },
                        {
                            title: "Amazon dévoile sa nouvelle stratégie logistique pour réduire les délais de livraison",
                            source: "Wall Street Journal",
                            summary: "Le géant du e-commerce annonce un investissement massif dans l'automatisation de ses centres de distribution, visant à réduire significativement ses délais de livraison sur l'ensemble du territoire européen.",
                            timestamp: getRandomTime(8),
                            impact: 28
                        },
                        {
                            title: "Les crypto-monnaies rebondissent après les commentaires de la SEC",
                            source: "CoinDesk",
                            summary: "Bitcoin et Ethereum ont enregistré une hausse significative suite aux déclarations du président de la SEC suggérant un assouplissement potentiel de la réglementation sur les actifs numériques.",
                            timestamp: getRandomTime(3),
                            impact: 25
                        },
                        {
                            title: "L'or atteint un nouveau sommet historique",
                            source: "Bloomberg",
                            summary: "Le métal précieux a franchi la barre des 2 300 dollars l'once, un niveau jamais atteint, porté par les incertitudes économiques mondiales et la baisse des rendements obligataires.",
                            timestamp: getRandomTime(6),
                            impact: 22
                        },
                        {
                            title: "La Chine annonce de nouvelles mesures de relance économique",
                            source: "South China Morning Post",
                            summary: "Le gouvernement chinois a dévoilé un plan de relance économique comprenant des réductions d'impôts et des investissements dans les infrastructures pour atteindre son objectif de croissance annuelle.",
                            timestamp: getRandomTime(10),
                            impact: 20
                        }
                    ]
                });
            }, 800); // Simuler un délai réseau
        });
    }
    
    // Initialiser le graphique du portefeuille
    function initPortfolioChart() {
        if (!portfolioChartCanvas) return;
        
        // Préparer les données pour le graphique
        const stocksTotal = 45; // 15 + 18 + 12
        const etfTotal = 30;    // 10 + 10 + 10
        const cryptoTotal = 25; // 15 + 10
        
        // Configuration du graphique
        const data = {
            labels: ['Actions', 'ETF', 'Crypto'],
            datasets: [{
                data: [stocksTotal, etfTotal, cryptoTotal],
                backgroundColor: [
                    '#1E90FF', // Bleu électrique pour les actions
                    '#00BFFF', // Bleu ciel profond pour les ETF
                    '#87CEFA'  // Bleu ciel clair pour les crypto
                ],
                borderWidth: 0
            }]
        };
        
        // Options du graphique
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#e0e0e0',
                        font: {
                            size: 12
                        },
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map(function(label, i) {
                                    const meta = chart.getDatasetMeta(0);
                                    const style = meta.controller.getStyle(i);
                                    
                                    return {
                                        text: `${label} (${data.datasets[0].data[i]}%)`,
                                        fillStyle: style.backgroundColor,
                                        strokeStyle: '#000000',
                                        lineWidth: 0,
                                        hidden: isNaN(data.datasets[0].data[i]) || meta.data[i].hidden,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            return `${label}: ${value}%`;
                        }
                    }
                }
            }
        };
        
        // Créer le graphique
        portfolioChart = new Chart(portfolioChartCanvas, {
            type: 'pie',
            data: data,
            options: options
        });
    }
    
    // Configurer les écouteurs d'événements
    function setupEventListeners() {
        // Interaction avec les éléments du portefeuille
        document.querySelectorAll('.portfolio-asset').forEach(row => {
            row.addEventListener('click', function() {
                highlightAsset(this);
            });
        });
        
        // Interaction avec les secteurs
        document.querySelectorAll('.sector-item').forEach(item => {
            item.addEventListener('click', function() {
                highlightSector(this);
            });
        });
        
        // Ajouter un bouton d'actualisation des données
        const refreshButton = document.createElement('button');
        refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
        refreshButton.className = 'refresh-button';
        refreshButton.title = 'Actualiser les données';
        
        // Ajouter le bouton aux sections concernées
        const sectionHeaders = document.querySelectorAll('.news-section h2, .sectors-section h2, .portfolio-section h2');
        sectionHeaders.forEach(header => {
            const button = refreshButton.cloneNode(true);
            header.appendChild(button);
            
            // Ajouter l'écouteur d'événement
            button.addEventListener('click', function() {
                this.classList.add('refresh-spinning');
                
                // Identifier la section en cours de rafraîchissement
                const sectionId = header.closest('section').id;
                
                // Appliquer l'action spécifique en fonction de la section
                if (sectionId === 'breaking-news') {
                    // Actualiser les actualités
                    fetchNewsFromPerplexity().then(() => {
                        // Arrêter l'animation après l'actualisation
                        setTimeout(() => {
                            this.classList.remove('refresh-spinning');
                        }, 500);
                    });
                } else {
                    // Pour les autres sections, simple animation de rafraîchissement
                    animateRefresh(sectionId);
                    
                    // Arrêter l'animation après un délai
                    setTimeout(() => {
                        this.classList.remove('refresh-spinning');
                    }, 1000);
                }
            });
        });
        
        // Ajouter un bouton spécifique pour les actualités avec texte
        const newsHeader = document.querySelector('.news-section h2');
        if (newsHeader) {
            const newsRefreshBtn = document.createElement('button');
            newsRefreshBtn.className = 'news-refresh';
            newsRefreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> <span class="news-refresh-text">Auto (30min)</span>';
            newsRefreshBtn.title = 'Changer l\'intervalle de mise à jour';
            
            // Remplacer le bouton standard par ce bouton personnalisé
            const oldBtn = newsHeader.querySelector('.refresh-button');
            if (oldBtn) {
                newsHeader.replaceChild(newsRefreshBtn, oldBtn);
            } else {
                newsHeader.appendChild(newsRefreshBtn);
            }
            
            // Ajouter l'écouteur d'événement pour le bouton personnalisé
            newsRefreshBtn.addEventListener('click', function() {
                // Basculer entre les intervalles de mise à jour
                if (newsUpdateInterval === 1800000) { // 30min
                    newsUpdateInterval = 3600000; // 1h
                    this.querySelector('.news-refresh-text').textContent = 'Auto (1h)';
                } else if (newsUpdateInterval === 3600000) { // 1h
                    newsUpdateInterval = 10800000; // 3h
                    this.querySelector('.news-refresh-text').textContent = 'Auto (3h)';
                } else {
                    newsUpdateInterval = 1800000; // 30min
                    this.querySelector('.news-refresh-text').textContent = 'Auto (30min)';
                }
                
                // Afficher une confirmation
                const confirmMsg = document.createElement('div');
                confirmMsg.className = 'refresh-confirm';
                confirmMsg.textContent = `Actualisation automatique configurée pour ${newsUpdateInterval / 60000} minutes`;
                confirmMsg.style.position = 'fixed';
                confirmMsg.style.bottom = '20px';
                confirmMsg.style.right = '20px';
                confirmMsg.style.padding = '10px 15px';
                confirmMsg.style.backgroundColor = 'rgba(30, 144, 255, 0.8)';
                confirmMsg.style.color = '#ffffff';
                confirmMsg.style.borderRadius = '4px';
                confirmMsg.style.zIndex = '1000';
                document.body.appendChild(confirmMsg);
                
                // Supprimer après 3 secondes
                setTimeout(() => {
                    document.body.removeChild(confirmMsg);
                }, 3000);
                
                // Actualiser immédiatement les actualités
                this.innerHTML = '<i class="fas fa-sync-alt" class="refresh-spinning"></i> <span class="news-refresh-text">Actualisation...</span>';
                fetchNewsFromPerplexity().then(() => {
                    setTimeout(() => {
                        this.innerHTML = `<i class="fas fa-sync-alt"></i> <span class="news-refresh-text">Auto (${newsUpdateInterval / 60000}min)</span>`;
                    }, 500);
                });
            });
        }
    }
    
    // Mettre en évidence un actif du portefeuille lorsque cliqué
    function highlightAsset(element) {
        // Retirer la mise en évidence des autres éléments
        document.querySelectorAll('.portfolio-asset').forEach(row => {
            row.style.backgroundColor = '';
        });
        
        // Appliquer la mise en évidence
        element.style.backgroundColor = 'rgba(30, 144, 255, 0.15)';
        
        // Faire défiler pour centrer l'élément si nécessaire
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Mettre en évidence un secteur lorsque cliqué
    function highlightSector(element) {
        // Retirer la mise en évidence des autres éléments
        document.querySelectorAll('.sector-item').forEach(item => {
            item.style.backgroundColor = '';
            item.style.padding = '';
            item.style.borderRadius = '';
            item.style.margin = '';
        });
        
        // Appliquer la mise en évidence
        element.style.backgroundColor = 'rgba(30, 144, 255, 0.15)';
        element.style.padding = '0.5rem';
        element.style.borderRadius = '4px';
        element.style.margin = '-0.5rem';
        
        // Faire défiler pour centrer l'élément si nécessaire
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Animation de rafraîchissement pour une section
    function animateRefresh(sectionId) {
        const section = document.getElementById(sectionId);
        if (!section) return;
        
        // Ajouter une classe pour l'animation
        section.classList.add('refresh-animation');
        
        // Retirer la classe après l'animation
        setTimeout(() => {
            section.classList.remove('refresh-animation');
            
            // Mettre à jour l'heure de dernière mise à jour
            updateLastUpdateTime();
        }, 600);
    }
    
    // Mettre à jour l'heure de dernière mise à jour
    function updateLastUpdateTime() {
        if (updateTimeElement) {
            const now = new Date();
            const formattedDateTime = formatDateTime(now);
            updateTimeElement.textContent = formattedDateTime;
        }
    }
    
    // Formater la date et l'heure
    function formatDateTime(date) {
        return date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
    
    // Mettre à jour l'heure et le statut du marché
    function updateMarketTime() {
        const now = new Date();
        
        // Format de l'heure : HH:MM:SS
        const timeStr = now.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        // Mettre à jour l'heure
        if (marketTimeElement) {
            marketTimeElement.textContent = timeStr;
        }
        
        // Vérifier si le marché est ouvert (9h à 17h30, du lundi au vendredi)
        const hour = now.getHours();
        const minute = now.getMinutes();
        const dayOfWeek = now.getDay(); // 0 = dimanche, 6 = samedi
        
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isBeforeOpen = hour < 9;
        const isAfterClose = hour > 17 || (hour === 17 && minute >= 30);
        
        const isMarketOpen = !isWeekend && !isBeforeOpen && !isAfterClose;
        
        // Mettre à jour l'indicateur et le texte
        if (marketIndicator && marketStatusText) {
            if (isMarketOpen) {
                marketIndicator.classList.remove('red');
                marketIndicator.classList.add('green');
                marketStatusText.textContent = 'Marché ouvert';
            } else {
                marketIndicator.classList.remove('green');
                marketIndicator.classList.add('red');
                marketStatusText.textContent = 'Marché fermé';
            }
        }
    }
    
    // Démarrer l'application
    init();
});