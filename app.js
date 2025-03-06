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
    
    // Variables globales
    let portfolioChart = null;
    let sectorData = {};
    let portfolioData = [];
    let lastPerplexityUpdate = null;
    let perplexityUpdateInterval = 3600000; // 1 heure
    
    // Initialisation
    function init() {
        // Mettre à jour l'heure
        updateMarketTime();
        
        // Initialiser le graphique du portefeuille
        initPortfolioChart();
        
        // Charger les données de Perplexity
        loadPerplexityData();
        
        // Configurer les écouteurs d'événements
        setupEventListeners();
        
        // Mettre à jour régulièrement l'heure
        setInterval(updateMarketTime, 1000);
        
        // Vérifier régulièrement si une mise à jour des données est nécessaire
        setInterval(checkPerplexityUpdate, 300000); // 5 minutes
    }
    
    // Vérifier si une mise à jour de Perplexity est nécessaire
    function checkPerplexityUpdate() {
        const now = new Date();
        if (!lastPerplexityUpdate || (now - lastPerplexityUpdate) > perplexityUpdateInterval) {
            console.log("Actualisation des données Perplexity nécessaire");
            loadPerplexityData();
        }
    }
    
    // Chargement des données Perplexity
    function loadPerplexityData() {
        console.log("Chargement des données de Perplexity...");
        
        // Pour la démo, nous utilisons des données simulées
        // Dans une application réelle, vous appelleriez l'API de Perplexity ici
        
        // Simulation des données des secteurs
        sectorData = {
            bullish: [
                {
                    name: "Automobile & VE",
                    reason: "La décision de la Maison Blanche concernant le report des droits de douane a un impact positif direct sur les constructeurs automobiles, particulièrement ceux investis dans les véhicules électriques."
                },
                {
                    name: "Technologie",
                    reason: "Les résultats attendus de sociétés comme Broadcom et le développement continu de l'IA poussent le secteur vers le haut, malgré les tensions sino-américaines."
                },
                {
                    name: "Énergie renouvelable",
                    reason: "Les initiatives de transition énergétique continuent de favoriser les entreprises du secteur, particulièrement dans le contexte des tensions géopolitiques actuelles."
                }
            ],
            bearish: [
                {
                    name: "Obligations",
                    reason: "La hausse historique des rendements obligataires européens indique une pression à la baisse sur les prix des obligations, impactant les détenteurs d'obligations à long terme."
                },
                {
                    name: "Immobilier",
                    reason: "La hausse des taux d'intérêt et l'incertitude concernant les décisions de la BCE exercent une pression sur le secteur immobilier, particulièrement sensible aux variations de taux."
                },
                {
                    name: "Importateurs chinois",
                    reason: "Les tensions commerciales croissantes entre les États-Unis et la Chine menacent les entreprises fortement dépendantes des importations chinoises, créant de l'incertitude pour leurs modèles d'approvisionnement."
                }
            ]
        };
        
        // Simulation des données du portefeuille
        portfolioData = [
            {
                name: "Tesla, Inc.",
                symbol: "TSLA",
                type: "stock",
                allocation: 15
            },
            {
                name: "NVIDIA Corporation",
                symbol: "NVDA",
                type: "stock",
                allocation: 18
            },
            {
                name: "Microsoft Corporation",
                symbol: "MSFT",
                type: "stock",
                allocation: 12
            },
            {
                name: "Invesco Solar ETF",
                symbol: "TAN",
                type: "etf",
                allocation: 10
            },
            {
                name: "Global X Autonomous & Electric Vehicles ETF",
                symbol: "DRIV",
                type: "etf",
                allocation: 10
            },
            {
                name: "ARK Innovation ETF",
                symbol: "ARKK",
                type: "etf",
                allocation: 10
            },
            {
                name: "Bitcoin",
                symbol: "BTC",
                type: "crypto",
                allocation: 15
            },
            {
                name: "Ethereum",
                symbol: "ETH",
                type: "crypto",
                allocation: 10
            }
        ];
        
        // Mise à jour de l'affichage
        updateSectorsDisplay();
        updatePortfolioChart();
        
        // Mise à jour de la date de dernière actualisation
        lastPerplexityUpdate = new Date();
        
        // Mise à jour de l'heure de dernière mise à jour affichée
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
                    '#00a0ff', // Bleu clair pour les ETF
                    '#4fc3f7'  // Bleu très clair pour les crypto
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
    
    // Mise à jour du graphique du portefeuille
    function updatePortfolioChart() {
        if (!portfolioChart || !portfolioData || portfolioData.length === 0) return;
        
        // Regrouper par type d'actif
        const stocksTotal = portfolioData
            .filter(asset => asset.type === 'stock')
            .reduce((sum, asset) => sum + asset.allocation, 0);
            
        const etfTotal = portfolioData
            .filter(asset => asset.type === 'etf')
            .reduce((sum, asset) => sum + asset.allocation, 0);
            
        const cryptoTotal = portfolioData
            .filter(asset => asset.type === 'crypto')
            .reduce((sum, asset) => sum + asset.allocation, 0);
        
        // Mettre à jour les données du graphique
        portfolioChart.data.datasets[0].data = [stocksTotal, etfTotal, cryptoTotal];
        portfolioChart.update();
    }
    
    // Mise à jour de l'affichage des secteurs
    function updateSectorsDisplay() {
        if (!bullishSectorsContainer || !bearishSectorsContainer || !sectorData) return;
        
        // Construire le HTML pour les secteurs haussiers
        let bullishHTML = '';
        if (sectorData.bullish && sectorData.bullish.length > 0) {
            sectorData.bullish.forEach(sector => {
                bullishHTML += `
                    <div class="sector-item">
                        <div class="sector-name">${sector.name} <i class="fas fa-arrow-up"></i></div>
                        <div class="sector-reason">${sector.reason}</div>
                    </div>
                `;
            });
        } else {
            bullishHTML = `
                <div class="sector-empty">Aucun secteur haussier identifié aujourd'hui</div>
            `;
        }
        
        // Construire le HTML pour les secteurs baissiers
        let bearishHTML = '';
        if (sectorData.bearish && sectorData.bearish.length > 0) {
            sectorData.bearish.forEach(sector => {
                bearishHTML += `
                    <div class="sector-item">
                        <div class="sector-name">${sector.name} <i class="fas fa-arrow-down"></i></div>
                        <div class="sector-reason">${sector.reason}</div>
                    </div>
                `;
            });
        } else {
            bearishHTML = `
                <div class="sector-empty">Aucun secteur baissier identifié aujourd'hui</div>
            `;
        }
        
        // Mise à jour des conteneurs
        bullishSectorsContainer.innerHTML = bullishHTML;
        bearishSectorsContainer.innerHTML = bearishHTML;
    }
    
    // Configurer les écouteurs d'événements
    function setupEventListeners() {
        // Recherche d'action
        if (searchBtn) {
            searchBtn.addEventListener('click', function() {
                const symbol = searchInput.value.trim().toUpperCase();
                if (symbol) {
                    alert(`Recherche pour ${symbol} - Cette fonctionnalité est simplifiée dans cette version`);
                }
            });
        }
        
        // Recherche avec la touche Entrée
        if (searchInput) {
            searchInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    const symbol = searchInput.value.trim().toUpperCase();
                    if (symbol) {
                        alert(`Recherche pour ${symbol} - Cette fonctionnalité est simplifiée dans cette version`);
                    }
                }
            });
        }
        
        // Interaction avec les éléments du portefeuille
        document.querySelectorAll('.portfolio-asset').forEach(row => {
            row.addEventListener('click', function() {
                const symbol = this.getAttribute('data-symbol');
                if (symbol) {
                    alert(`Vous avez sélectionné ${symbol} - Cette fonctionnalité est simplifiée dans cette version`);
                }
            });
        });
        
        // Interaction avec les secteurs
        document.querySelectorAll('.sector-item').forEach(item => {
            item.addEventListener('click', function() {
                const sectorName = this.querySelector('.sector-name').textContent.split(' ')[0];
                if (sectorName) {
                    alert(`Secteur sélectionné: ${sectorName} - Cette fonctionnalité est simplifiée dans cette version`);
                }
            });
        });
        
        // Ajouter un bouton d'actualisation des données
        const refreshButton = document.createElement('button');
        refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
        refreshButton.className = 'refresh-button';
        refreshButton.title = 'Actualiser les données';
        
        // Ajouter le bouton aux sections concernées
        const sectionHeaders = document.querySelectorAll('.sectors-section h2, .portfolio-section h2');
        sectionHeaders.forEach(header => {
            const button = refreshButton.cloneNode(true);
            header.appendChild(button);
            
            // Ajouter l'écouteur d'événement
            button.addEventListener('click', function() {
                this.classList.add('refresh-spinning');
                
                // Recharger les données
                loadPerplexityData();
                
                // Arrêter l'animation après un délai
                setTimeout(() => {
                    this.classList.remove('refresh-spinning');
                }, 1000);
            });
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
