// StockPro - Application d'analyse d'actions en temps réel
document.addEventListener('DOMContentLoaded', function() {
    // Éléments DOM
    const searchInput = document.getElementById('stockSearch');
    const searchBtn = document.getElementById('searchBtn');
    const currentPrice = document.querySelector('.current-price');
    const priceChange = document.querySelector('.price-change');
    const stockInfoTitle = document.querySelector('.stock-info h2');
    const exchangeElement = document.querySelector('.exchange');
    const marketIndicator = document.querySelector('.market-indicator');
    const marketStatusText = document.querySelector('.market-status span');
    const aiAnalysisContent = document.getElementById('ai-analysis-content');
    const currentTimeElement = document.getElementById('current-time');
    const updateTimeElement = document.getElementById('update-time');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    
    // Métriques
    const openPrice = document.getElementById('open-price');
    const prevClose = document.getElementById('prev-close');
    const dayHigh = document.getElementById('day-high');
    const dayLow = document.getElementById('day-low');
    const volume = document.getElementById('volume');
    const marketCap = document.getElementById('market-cap');
    const peRatio = document.getElementById('pe-ratio');
    const dividend = document.getElementById('dividend');
    
    // Variables globales
    let currentSymbol = 'AAPL'; // Par défaut on affiche Apple
    let stockData = null; // Stockage des données actuelles pour l'action
    let widget = null; // Instance du widget TradingView
    
    // Liste des actions populaires pour suggestion
    const popularStocks = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'V', 'BRK.B'
    ];
    
    // Initialisation
    function init() {
        // Initialiser le graphique TradingView
        initTradingViewChart();
        
        // Charger les données en temps réel pour Apple
        fetchStockData(currentSymbol);
        
        // Configurer les écouteurs d'événements
        setupEventListeners();
        
        // Afficher les suggestions de stocks populaires
        showPopularStocksSuggestions();
        
        // Mettre à jour l'heure de marché
        updateMarketTime();
        
        // Configurer le mode plein écran
        setupFullscreenMode();
        
        // Mettre à jour régulièrement l'heure et les données
        setInterval(updateMarketTime, 1000);
        setInterval(() => fetchStockData(currentSymbol), 60000); // Rafraîchir toutes les minutes
    }
    
    // Initialiser le graphique TradingView
    function initTradingViewChart() {
        const chartContainer = document.getElementById('tradingview-chart');
        
        if (chartContainer) {
            widget = new TradingView.widget({
                container_id: 'tradingview-chart',
                symbol: 'NASDAQ:AAPL',
                interval: 'D',
                timezone: 'Europe/Paris',
                theme: 'dark',
                style: '1',
                locale: 'fr',
                toolbar_bg: '#0a0a14', // Couleur de fond pour le toolbar (noir avec nuance bleue)
                enable_publishing: false,
                allow_symbol_change: false,
                save_image: true,
                hide_side_toolbar: false,
                studies: [
                    "MASimple@tv-basicstudies",
                    "RSI@tv-basicstudies"
                ],
                studies_overrides: {
                    "volume.volume.color.0": "#ff2c2c", // Rouge pour le volume négatif
                    "volume.volume.color.1": "#12ff56", // Vert pour le volume positif
                },
                disabled_features: [
                    "header_symbol_search",
                    "symbol_search_hot_key"
                ],
                enabled_features: [
                    "use_localstorage_for_settings"
                ],
                overrides: {
                    // Couleurs de fond et de grille
                    "paneProperties.background": "#0a0a14", // Noir avec nuance bleue
                    "paneProperties.vertGridProperties.color": "rgba(28, 48, 80, 0.2)", // Bleu très foncé
                    "paneProperties.horzGridProperties.color": "rgba(28, 48, 80, 0.2)", // Bleu très foncé
                    
                    // Couleurs des chandeliers
                    "mainSeriesProperties.candleStyle.upColor": "#12ff56", // Vert vif
                    "mainSeriesProperties.candleStyle.downColor": "#ff2c2c", // Rouge vif
                    "mainSeriesProperties.candleStyle.wickUpColor": "#12ff56", // Vert vif
                    "mainSeriesProperties.candleStyle.wickDownColor": "#ff2c2c", // Rouge vif
                    "mainSeriesProperties.candleStyle.borderUpColor": "#12ff56", // Vert vif
                    "mainSeriesProperties.candleStyle.borderDownColor": "#ff2c2c", // Rouge vif
                    
                    // Barre de volume
                    "volumePaneSize": "medium",
                    
                    // Accentuation de couleurs
                    "scalesProperties.lineColor": "#1c3050", // Bleu foncé
                    "scalesProperties.textColor": "#8894a8", // Gris bleuté
                    
                    // Surlignement
                    "mainSeriesProperties.areaStyle.color1": "rgba(28, 118, 255, 0.2)", // Bleu primaire avec alpha
                    "mainSeriesProperties.areaStyle.color2": "rgba(28, 118, 255, 0.05)", // Bleu primaire avec alpha plus faible
                    "mainSeriesProperties.areaStyle.linecolor": "#1c76ff", // Bleu primaire
                }
            });
            
            // Attendre que le widget soit prêt
            widget.onChartReady(function() {
                console.log("TradingView chart ready");
                
                // Écouter le changement de symbole
                widget.chart().onSymbolChanged().subscribe(null, function(symbolData) {
                    const newSymbol = symbolData.ticker.split(':')[1];
                    console.log("Symbol changed to:", newSymbol);
                    if (newSymbol !== currentSymbol) {
                        searchStock(newSymbol);
                    }
                });
            });
        }
    }
    
    // Configurer le mode plein écran
    function setupFullscreenMode() {
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', toggleFullscreen);
            
            // Créer un bouton pour quitter le plein écran
            const exitButton = document.createElement('button');
            exitButton.className = 'fullscreen-exit-btn';
            exitButton.id = 'exit-fullscreen';
            exitButton.innerHTML = 'Quitter le plein écran <i class="fas fa-compress-alt"></i>';
            exitButton.addEventListener('click', toggleFullscreen);
            
            const chartSection = document.querySelector('.main-info-display');
            if (chartSection) {
                chartSection.appendChild(exitButton);
            }
            
            // Écouter la touche Échap
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && document.querySelector('.fullscreen-chart')) {
                    toggleFullscreen();
                }
            });
        }
    }
    
    // Basculer le mode plein écran
    function toggleFullscreen() {
        const chartSection = document.querySelector('.main-info-display');
        const exitButton = document.getElementById('exit-fullscreen');
        
        if (chartSection) {
            chartSection.classList.toggle('fullscreen-chart');
            
            if (chartSection.classList.contains('fullscreen-chart')) {
                fullscreenBtn.textContent = 'Quitter le plein écran';
                document.body.style.overflow = 'hidden'; // Empêcher le défilement
                
                // Redimensionner le graphique
                if (widget) {
                    widget.resize();
                }
            } else {
                fullscreenBtn.textContent = 'Agrandir le graphique';
                document.body.style.overflow = ''; // Rétablir le défilement
                
                // Redimensionner le graphique
                if (widget) {
                    widget.resize();
                }
            }
        }
    }
    
    // Afficher des suggestions de stocks populaires sous la barre de recherche
    function showPopularStocksSuggestions() {
        const searchContainer = document.querySelector('.search-container');
        
        if (!document.querySelector('.stock-suggestions')) {
            const suggestionsDiv = document.createElement('div');
            suggestionsDiv.className = 'stock-suggestions';
            suggestionsDiv.innerHTML = '<span>Populaires: </span>';
            
            popularStocks.forEach(symbol => {
                const stockLink = document.createElement('a');
                stockLink.href = '#';
                stockLink.textContent = symbol;
                stockLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    searchStock(symbol);
                });
                suggestionsDiv.appendChild(stockLink);
            });
            
            searchContainer.parentNode.insertBefore(suggestionsDiv, searchContainer.nextSibling);
        }
    }
    
    // Configurer les écouteurs d'événements
    function setupEventListeners() {
        // Bouton de recherche
        searchBtn.addEventListener('click', function() {
            const symbol = searchInput.value.trim().toUpperCase();
            if (symbol) {
                searchStock(symbol);
            }
        });
        
        // Recherche à la pression de Entrée
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const symbol = searchInput.value.trim().toUpperCase();
                if (symbol) {
                    searchStock(symbol);
                }
            }
        });
        
        // Tabs pour l'analyse IA
        const aiTabs = document.querySelectorAll('.ai-tab-btn');
        const aiContents = document.querySelectorAll('.ai-tab-content');
        
        aiTabs.forEach(tab => {
            tab.addEventListener('click', function() {
                // Enlever la classe active de tous les tabs
                aiTabs.forEach(t => t.classList.remove('active'));
                aiContents.forEach(c => c.classList.remove('active'));
                
                // Ajouter la classe active au tab cliqué
                this.classList.add('active');
                
                // Afficher le contenu correspondant
                const tabId = this.getAttribute('data-tab');
                document.getElementById(`${tabId}-tab`).classList.add('active');
            });
        });
        
        // Bouton d'actualisation
        const refreshBtn = document.getElementById('refresh-analysis');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                fetchStockData(currentSymbol);
            });
        }
        
        // Boutons de période
        const timeButtons = document.querySelectorAll('.time-btn');
        timeButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Enlever la classe active de tous les boutons
                timeButtons.forEach(btn => btn.classList.remove('active'));
                
                // Ajouter la classe active au bouton cliqué
                this.classList.add('active');
                
                // Changer l'intervalle du graphique TradingView
                const range = this.getAttribute('data-range');
                if (widget) {
                    let interval = 'D'; // Défaut: jour
                    
                    switch(range) {
                        case '1D':
                            interval = '30'; // 30 minutes
                            break;
                        case '1W':
                            interval = 'D'; // Jour
                            break;
                        case '1M':
                            interval = 'W'; // Semaine
                            break;
                        case '3M':
                            interval = 'W'; // Semaine
                            break;
                        case '1Y':
                            interval = 'M'; // Mois
                            break;
                        case 'ALL':
                            interval = 'M'; // Mois
                            break;
                    }
                    
                    widget.chart().setResolution(interval, function() {
                        console.log("Interval changed to:", interval);
                    });
                }
            });
        });
    }
    
    // Mettre à jour l'heure de marché
    function updateMarketTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        if(currentTimeElement) currentTimeElement.textContent = timeStr;
        
        // Mettre à jour également l'heure de la source des données
        const dateTimeStr = now.toLocaleDateString('fr-FR') + ' ' + timeStr;
        if(updateTimeElement) updateTimeElement.textContent = dateTimeStr;
        
        // Vérifier si le marché français (Euronext) est ouvert
        const hour = now.getHours();
        const minute = now.getMinutes();
        const dayOfWeek = now.getDay(); // 0 = dimanche, 6 = samedi
        
        // Marché français: ouvert de 9h00 à 17h30, du lundi au vendredi
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isBeforeOpen = hour < 9;
        const isAfterClose = hour > 17 || (hour === 17 && minute >= 30);
        
        const isMarketOpen = !isWeekend && !isBeforeOpen && !isAfterClose;
        
        // Mettre à jour l'indicateur et le texte
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
    
    // Chercher et afficher les données pour un nouveau titre
    function searchStock(symbol) {
        // Vérifier si le symbole est différent du symbole actuel
        if (currentSymbol !== symbol) {
            currentSymbol = symbol;
            
            // Mettre à jour l'affichage du symbole dans le champ de recherche
            searchInput.value = symbol;
            
            // Mettre à jour le graphique TradingView
            updateTradingViewSymbol(symbol);
            
            // Récupérer les données pour ce symbole
            fetchStockData(symbol);
            
            console.log(`Recherche effectuée pour: ${symbol}`);
        }
    }
    
    // Mettre à jour le symbole sur TradingView
    function updateTradingViewSymbol(symbol) {
        if (widget) {
            // Déterminer l'échange pour le préfixe TradingView
            let exchange = 'NASDAQ';
            
            if (symbol.endsWith('.PA')) {
                exchange = 'EURONEXT';
                // Nettoyer le symbole pour TradingView (sans .PA)
                symbol = symbol.replace('.PA', '');
            } else {
                exchange = getExchangePrefix(symbol);
            }
            
            const tvSymbol = `${exchange}:${symbol}`;
            
            console.log(`Setting TradingView symbol to: ${tvSymbol}`);
            
            widget.chart().setSymbol(tvSymbol, function() {
                console.log("Symbol updated to:", tvSymbol);
            });
        }
    }
    
    // Récupérer les données de stock via OpenAI
    async function fetchStockData(symbol) {
        try {
            // Afficher un indicateur de chargement
            if (aiAnalysisContent) {
                aiAnalysisContent.innerHTML = `
                    <div class="ai-status">
                        <div class="ai-loader">
                            <div class="spinner"></div>
                        </div>
                        <div class="ai-message">Analyse en cours...</div>
                    </div>`;
            }
            
            // Utiliser l'API OpenAI pour obtenir des données et une analyse
            const response = await fetchFromOpenAI(symbol);
            
            // Mettre à jour l'interface utilisateur avec ces données
            updateUI(response);
            
        } catch (error) {
            console.error('Erreur lors de la récupération des données:', error);
            if (aiAnalysisContent) {
                aiAnalysisContent.innerHTML = '<p>Erreur lors de la récupération des données. Veuillez réessayer.</p>';
            }
            
            // En cas d'erreur, fallback sur des données simulées
            const simulatedData = getSimulatedStockData(symbol);
            updateUI(simulatedData);
        }
    }
    
    // Interroger OpenAI pour les données et l'analyse
    async function fetchFromOpenAI(symbol) {
        try {
            // Construire la requête pour OpenAI
            const prompt = `Fournir les données financières actuelles et une analyse pour ${symbol} au format JSON structuré. 
                Inclure les champs suivants: 
                - symbol: le symbole de l'action
                - name: le nom complet de l'entreprise
                - exchange: la bourse sur laquelle l'action est cotée (NASDAQ, NYSE, etc.)
                - price: le prix actuel estimé (valeur numérique)
                - change: la variation en dollars (valeur numérique avec signe)
                - changePercent: la variation en pourcentage (valeur numérique avec signe)
                - dayHigh, dayLow, open, previousClose: les valeurs clés du jour (valeurs numériques)
                - volume: le volume d'échanges (format comme "42.8M")
                - marketCap: la capitalisation boursière (format comme "2.95T")
                - peRatio: le ratio P/E (valeur numérique)
                - dividend: le rendement du dividende (format comme "0.51%")
                - performance: {dayChange, weekChange, monthChange, threeMonthChange, yearChange} (valeurs numériques avec signes)
                - analysis: {
                    sentiment: "positif", "neutre" ou "négatif"
                    overview: résumé court de l'entreprise et sa position dans son secteur
                    riskLevel: évaluation du niveau de risque ("faible", "modéré", "élevé")
                    technicalAnalysis: analyse technique courte
                    fundamentalAnalysis: analyse fondamentale courte
                    recommendation: recommandation générale sur cette action
                    keyFactors: liste de 3-4 facteurs clés à surveiller
                    news: tableau de 3 actualités récentes avec titre, source et temps relatif
                }
                Assurez-vous que la réponse est uniquement en JSON valide sans texte supplémentaire.`;
                
            // Appel à l'API OpenAI
            const aiResponse = await chat_with_openai({
                content: prompt
            });
            
            // Extraire le JSON de la réponse
            const jsonMatch = aiResponse.content.match(/```json\s*([\s\S]*?)\s*```/) || 
                              aiResponse.content.match(/{[\s\S]*}/);
            
            let jsonData;
            if (jsonMatch) {
                jsonData = JSON.parse(jsonMatch[0].replace(/```json|```/g, ''));
            } else {
                // Si le JSON n'est pas correctement formaté, essayer de parser la réponse entière
                try {
                    jsonData = JSON.parse(aiResponse.content);
                } catch (e) {
                    throw new Error("Impossible de parser la réponse JSON d'OpenAI");
                }
            }
            
            return jsonData;
            
        } catch (error) {
            console.error("Erreur lors de la communication avec OpenAI:", error);
            throw error;
        }
    }
    
    // Fonction simulant un appel à OpenAI (pour la démo et comme fallback)
    async function chat_with_openai(params) {
        try {
            // Tentative d'utiliser le vrai MCP OpenAI s'il est disponible
            return await window.chat_with_openai(params);
        } catch (error) {
            console.log("Utilisation de données simulées car OpenAI n'est pas disponible", error);
            
            // Simulation de réponse en cas d'échec ou pour la démo
            const stockInfo = getSimulatedStockData(params.content.includes("AAPL") ? "AAPL" : 
                              params.content.includes("MSFT") ? "MSFT" : 
                              params.content.includes("GOOGL") ? "GOOGL" : "UNKNOWN");
            
            return {
                content: JSON.stringify(stockInfo)
            };
        }
    }
    
    // Générer des données simulées pour un symbole
    function getSimulatedStockData(symbol) {
        // Données préconfigurées pour les titres populaires
        const stocksData = {
            'AAPL': {
                symbol: "AAPL",
                name: "Apple Inc.",
                exchange: "NASDAQ",
                price: 189.97,
                change: 1.52,
                changePercent: 0.81,
                open: 188.45,
                previousClose: 188.45,
                dayHigh: 190.23,
                dayLow: 187.68,
                volume: "42.8M",
                marketCap: "2.95T",
                peRatio: 31.2,
                dividend: "0.51%",
                performance: {
                    dayChange: 0.81,
                    weekChange: 2.45,
                    monthChange: 5.32,
                    threeMonthChange: 12.78,
                    yearChange: 18.45
                },
                analysis: {
                    sentiment: "positif",
                    overview: "Apple Inc. est un leader mondial de la technologie, spécialisé dans les produits électroniques grand public, les logiciels et les services en ligne. L'entreprise maintient une position dominante dans son secteur, avec des produits phares comme l'iPhone, l'iPad, les Mac et les services comme Apple Music et Apple TV+.",
                    riskLevel: "faible",
                    technicalAnalysis: "L'action AAPL montre une tendance haussière soutenue avec un support solide autour de 180$. Les moyennes mobiles 50 et 200 jours confirment une configuration technique positive, avec un RSI qui n'indique pas de surachat excessif.",
                    fundamentalAnalysis: "Apple présente des fondamentaux solides avec un bilan robuste et une trésorerie importante. Ses marges bénéficiaires restent parmi les meilleures du secteur technologique, et la diversification vers les services contribue à améliorer la récurrence des revenus.",
                    recommendation: "Les perspectives d'Apple restent positives à long terme grâce à un écosystème solide et une fidélité client exceptionnelle. L'action constitue une base solide pour un portefeuille diversifié.",
                    keyFactors: [
                        "Cycle de renouvellement de l'iPhone 15",
                        "Croissance du segment des services",
                        "Développements en réalité augmentée",
                        "Expansion sur les marchés émergents"
                    ],
                    news: [
                        {
                            title: "Apple annonce un nouveau MacBook Pro avec une puce avancée",
                            source: "Bloomberg",
                            time: "Il y a 32 minutes"
                        },
                        {
                            title: "Les actions d'Apple montent suite à des prévisions positives sur les ventes d'iPhone",
                            source: "CNBC",
                            time: "Il y a 1 heure"
                        },
                        {
                            title: "Apple continue de renforcer ses investissements dans l'IA",
                            source: "Financial Times",
                            time: "Il y a 3 heures"
                        }
                    ]
                }
            },
            'MSFT': {
                symbol: "MSFT",
                name: "Microsoft Corporation",
                exchange: "NASDAQ",
                price: 428.73,
                change: 0.51,
                changePercent: 0.12,
                open: 426.50,
                previousClose: 425.35,
                dayHigh: 430.25,
                dayLow: 425.10,
                volume: "18.5M",
                marketCap: "3.18T",
                peRatio: 36.4,
                dividend: "0.73%",
                performance: {
                    dayChange: 0.12,
                    weekChange: 1.85,
                    monthChange: 4.25,
                    threeMonthChange: 9.35,
                    yearChange: 22.67
                },
                analysis: {
                    sentiment: "positif",
                    overview: "Microsoft est un leader mondial des logiciels, du cloud computing et des services technologiques. Sous la direction de Satya Nadella, l'entreprise a réussi une transformation remarquable en se concentrant sur le cloud et l'intelligence artificielle.",
                    riskLevel: "faible",
                    technicalAnalysis: "MSFT présente une tendance haussière de long terme. Les indicateurs techniques montrent une forte dynamique avec des supports solides. Le titre évolue confortablement au-dessus de ses moyennes mobiles principales.",
                    fundamentalAnalysis: "Microsoft affiche une croissance robuste de ses revenus et bénéfices, notamment grâce à Azure et aux services cloud. La transition vers un modèle d'abonnement pour Office 365 a considérablement amélioré la stabilité des revenus.",
                    recommendation: "Microsoft représente un investissement de haute qualité avec des perspectives de croissance solides dans le cloud et l'IA. La position dominante de l'entreprise dans le secteur B2B offre une sécurité supplémentaire.",
                    keyFactors: [
                        "Croissance d'Azure et du cloud computing",
                        "Intégration de l'IA dans les produits Microsoft",
                        "Développement de la division gaming (Xbox)",
                        "Innovations en informatique quantique"
                    ],
                    news: [
                        {
                            title: "Microsoft investit 1,5 milliard de dollars dans une entreprise d'IA au Moyen-Orient",
                            source: "Reuters",
                            time: "Il y a 2 heures"
                        },
                        {
                            title: "Les résultats trimestriels de Microsoft dépassent les attentes grâce au cloud",
                            source: "Wall Street Journal",
                            time: "Il y a 1 jour"
                        },
                        {
                            title: "Microsoft annonce de nouvelles fonctionnalités IA pour Office 365",
                            source: "TechCrunch",
                            time: "Il y a 2 jours"
                        }
                    ]
                }
            },
            'GOOGL': {
                symbol: "GOOGL",
                name: "Alphabet Inc. (Google)",
                exchange: "NASDAQ",
                price: 149.82,
                change: 1.52,
                changePercent: 1.02,
                open: 148.90,
                previousClose: 148.45,
                dayHigh: 150.75,
                dayLow: 148.30,
                volume: "23.2M",
                marketCap: "1.87T",
                peRatio: 25.8,
                dividend: "0.00%",
                performance: {
                    dayChange: 1.02,
                    weekChange: -0.45,
                    monthChange: -2.14,
                    threeMonthChange: 5.43,
                    yearChange: 11.26
                },
                analysis: {
                    sentiment: "positif",
                    overview: "Alphabet (Google) domine le marché de la recherche en ligne et de la publicité numérique. L'entreprise investit massivement dans l'IA, le cloud computing et les technologies de pointe via ses nombreuses filiales et projets.",
                    riskLevel: "modéré",
                    technicalAnalysis: "L'action GOOGL montre une tendance haussière à long terme avec quelques signes de consolidation à court terme. Le support à 145$ semble solide, et le titre reste au-dessus de sa moyenne mobile à 200 jours.",
                    fundamentalAnalysis: "Alphabet maintient une croissance constante de ses revenus publicitaires tout en développant des secteurs comme le cloud. Sa position dominante dans la recherche en ligne lui confère un avantage concurrentiel durable.",
                    recommendation: "Malgré les risques réglementaires, Alphabet reste un acteur incontournable du secteur technologique avec de solides perspectives de croissance dans l'IA et le cloud.",
                    keyFactors: [
                        "Développements en IA et machine learning",
                        "Croissance de Google Cloud",
                        "Pressions réglementaires antitrust",
                        "Diversification des revenus au-delà de la publicité"
                    ],
                    news: [
                        {
                            title: "Google présente sa nouvelle génération de modèles d'IA",
                            source: "The Verge",
                            time: "Il y a 5 heures"
                        },
                        {
                            title: "Google Cloud annonce un partenariat majeur avec une entreprise de santé",
                            source: "CNBC",
                            time: "Il y a 1 jour"
                        },
                        {
                            title: "L'UE lance une nouvelle enquête sur les pratiques de Google",
                            source: "Financial Times",
                            time: "Il y a 3 jours"
                        }
                    ]
                }
            }
        };
        
        // Si le symbole est dans nos données préconfigurées, utiliser ces valeurs
        if (stocksData[symbol]) {
            return stocksData[symbol];
        }
        
        // Sinon, générer des données génériques
        return {
            symbol: symbol,
            name: getCompanyName(symbol),
            exchange: getExchangePrefix(symbol),
            price: (100 + Math.random() * 900).toFixed(2),
            change: (Math.random() * 6 - 3).toFixed(2),
            changePercent: (Math.random() * 3 - 1.5).toFixed(2),
            open: (100 + Math.random() * 895).toFixed(2),
            previousClose: (100 + Math.random() * 890).toFixed(2),
            dayHigh: (100 + Math.random() * 910).toFixed(2),
            dayLow: (100 + Math.random() * 880).toFixed(2),
            volume: `${Math.floor(Math.random() * 100)}M`,
            marketCap: `${Math.floor(Math.random() * 1000)}B`,
            peRatio: (15 + Math.random() * 20).toFixed(1),
            dividend: `${(Math.random() * 3).toFixed(2)}%`,
            performance: {
                dayChange: parseFloat((Math.random() * 3 - 1.5).toFixed(2)),
                weekChange: parseFloat((Math.random() * 6 - 3).toFixed(2)),
                monthChange: parseFloat((Math.random() * 10 - 5).toFixed(2)),
                threeMonthChange: parseFloat((Math.random() * 20 - 10).toFixed(2)),
                yearChange: parseFloat((Math.random() * 40 - 20).toFixed(2))
            },
            analysis: {
                sentiment: ["positif", "neutre", "négatif"][Math.floor(Math.random() * 3)],
                overview: `${symbol} est une entreprise opérant dans son secteur d'activité principal. L'entreprise se positionne sur son marché face à ses concurrents directs.`,
                riskLevel: ["faible", "modéré", "élevé"][Math.floor(Math.random() * 3)],
                technicalAnalysis: `L'analyse technique de ${symbol} montre des tendances de prix qui peuvent indiquer des mouvements futurs en fonction du contexte de marché actuel.`,
                fundamentalAnalysis: `Les fondamentaux de ${symbol} incluent sa structure financière, ses revenus et sa position concurrentielle dans son secteur.`,
                recommendation: `Compte tenu des conditions actuelles du marché et des performances spécifiques de ${symbol}, les investisseurs pourraient envisager d'évaluer cette action dans le cadre d'une stratégie d'investissement diversifiée.`,
                keyFactors: [
                    "Performance du secteur",
                    "Innovations et développement produit",
                    "Contexte macroéconomique",
                    "Positionnement concurrentiel"
                ],
                news: [
                    {
                        title: `${symbol} annonce de nouveaux développements stratégiques`,
                        source: "Reuters",
                        time: "Il y a 1 jour"
                    },
                    {
                        title: `Résultats trimestriels pour ${symbol}`,
                        source: "Bloomberg",
                        time: "Il y a 3 jours"
                    },
                    {
                        title: `Analyse sectorielle incluant ${symbol}`,
                        source: "Financial Times",
                        time: "Il y a 5 jours"
                    }
                ]
            }
        };
    }
    
    // Mettre à jour l'interface utilisateur avec les données reçues
    function updateUI(data) {
        if (!data) return;
        
        // Stocker les données pour référence
        stockData = data;
        
        // Mise à jour du titre et info de l'action
        stockInfoTitle.textContent = `${data.name} (${data.symbol})`;
        exchangeElement.textContent = data.exchange;
        
        // Mise à jour du logo (si possible)
        try {
            const logoElement = document.querySelector('.company-logo');
            if (logoElement) {
                // Nettoyer le nom de l'entreprise pour l'URL du logo
                const companyName = data.name.toLowerCase().split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
                logoElement.src = `https://logo.clearbit.com/${companyName}.com`;
                logoElement.onerror = function() {
                    this.src = `https://via.placeholder.com/40x40?text=${data.symbol}`;
                };
            }
        } catch (error) {
            console.log('Erreur lors de la mise à jour du logo', error);
        }
        
        // Formater les valeurs numériques si nécessaires
        const priceValue = typeof data.price === 'number' ? data.price.toFixed(2) : data.price;
        const changeValue = typeof data.change === 'number' ? data.change.toFixed(2) : data.change;
        const changePercentValue = typeof data.changePercent === 'number' ? data.changePercent.toFixed(2) : data.changePercent;
        
        // Mise à jour du prix et de la variation
        currentPrice.textContent = `$${priceValue}`;
        
        // Déterminer si la variation est positive ou négative
        const isPositive = parseFloat(changeValue) >= 0;
        const changeText = `${isPositive ? '+' : ''}${changeValue} (${isPositive ? '+' : ''}${changePercentValue}%)`;
        priceChange.textContent = changeText;
        
        // Appliquer les classes CSS pour les couleurs
        if (isPositive) {
            priceChange.classList.remove('negative');
            priceChange.classList.add('positive');
        } else {
            priceChange.classList.remove('positive');
            priceChange.classList.add('negative');
        }
        
        // Mise à jour des métriques avec coloration
        updateMetricWithColor(openPrice, data.open, parseFloat(data.open) - parseFloat(data.previousClose));
        updateMetricWithColor(prevClose, data.previousClose);
        updateMetricWithColor(dayHigh, data.dayHigh, parseFloat(data.dayHigh) - parseFloat(data.price));
        updateMetricWithColor(dayLow, data.dayLow, parseFloat(data.dayLow) - parseFloat(data.price));
        
        // Métriques sans coloration
        if (volume) volume.textContent = data.volume;
        if (marketCap) marketCap.textContent = data.marketCap;
        if (peRatio) peRatio.textContent = data.peRatio;
        if (dividend) dividend.textContent = data.dividend;
        
        // Mise à jour des performances
        updatePerformanceBars(data.performance);
        
        // Mise à jour de l'analyse OpenAI
        updateAIAnalysis(data.analysis);
        
        // Mise à jour des actualités
        updateNews(data.analysis.news);
    }
    
    // Mettre à jour l'affichage de l'analyse OpenAI
    function updateAIAnalysis(analysis) {
        if (!aiAnalysisContent || !analysis) return;
        
        const sentimentClass = analysis.sentiment === 'positif' ? 'positive-trend' : 
                              analysis.sentiment === 'négatif' ? 'negative-trend' : 
                              'neutral-trend';
        
        const riskClass = analysis.riskLevel === 'faible' ? 'positive-trend' : 
                         analysis.riskLevel === 'élevé' ? 'negative-trend' : 
                         'neutral-trend';
        
        // Construire le HTML pour l'analyse
        const html = `
            <div class="ai-section">
                <div class="ai-heading">Aperçu de l'entreprise</div>
                <div class="ai-text">${analysis.overview}</div>
            </div>
            
            <div class="ai-section">
                <div class="ai-heading">Analyse technique</div>
                <div class="ai-text">${analysis.technicalAnalysis}</div>
            </div>
            
            <div class="ai-section">
                <div class="ai-heading">Analyse fondamentale</div>
                <div class="ai-text">${analysis.fundamentalAnalysis}</div>
            </div>
            
            <div class="ai-metrics">
                <div class="ai-metric">
                    <span class="ai-metric-label">Sentiment de marché</span>
                    <span class="ai-metric-value ${sentimentClass}">${analysis.sentiment.charAt(0).toUpperCase() + analysis.sentiment.slice(1)}</span>
                </div>
                
                <div class="ai-metric">
                    <span class="ai-metric-label">Niveau de risque</span>
                    <span class="ai-metric-value ${riskClass}">${analysis.riskLevel.charAt(0).toUpperCase() + analysis.riskLevel.slice(1)}</span>
                </div>
            </div>
            
            <div class="ai-section">
                <div class="ai-heading">Facteurs clés à surveiller</div>
                <ul>
                    ${analysis.keyFactors.map(factor => `<li>${factor}</li>`).join('')}
                </ul>
            </div>
            
            <div class="ai-recommendation">
                ${analysis.recommendation}
            </div>
        `;
        
        aiAnalysisContent.innerHTML = html;
    }
    
    // Mettre à jour les actualités
    function updateNews(news) {
        const newsContainer = document.getElementById('news-container');
        if (!newsContainer || !news || !Array.isArray(news)) return;
        
        // Construire le HTML pour les actualités
        const newsHtml = news.map(item => `
            <article class="news-item">
                <div class="news-meta">
                    <span class="news-source">${item.source}</span>
                    <span class="news-time">${item.time}</span>
                </div>
                <h4 class="news-title">${item.title}</h4>
            </article>
        `).join('');
        
        newsContainer.innerHTML = newsHtml;
    }
    
    // Mettre à jour une métrique avec coloration
    function updateMetricWithColor(element, value, changeValue = null) {
        if (!element) return;
        
        // Formater avec le symbole $ si c'est un prix et si c'est un nombre
        const formattedValue = typeof value === 'number' ? `$${value.toFixed(2)}` : 
                              (typeof value === 'string' && !value.includes('%') && !value.includes('$')) ? 
                              `$${value}` : value;
        
        element.textContent = formattedValue;
        
        // Si un changeValue est fourni, appliquer la coloration
        if (changeValue !== null) {
            if (changeValue > 0) {
                element.classList.remove('negative');
                element.classList.add('positive');
            } else if (changeValue < 0) {
                element.classList.remove('positive');
                element.classList.add('negative');
            } else {
                element.classList.remove('positive', 'negative');
            }
        } else {
            // Supprimer les classes de coloration si aucun changement n'est spécifié
            element.classList.remove('positive', 'negative');
        }
    }
    
    // Mettre à jour les barres de performance
    function updatePerformanceBars(performance) {
        if (!performance) return;
        
        // Jour
        updatePerformanceBar('day', performance.dayChange);
        
        // Semaine
        updatePerformanceBar('week', performance.weekChange);
        
        // Mois
        updatePerformanceBar('month', performance.monthChange);
        
        // 3 Mois
        updatePerformanceBar('three-months', performance.threeMonthChange);
        
        // Année
        updatePerformanceBar('year', performance.yearChange);
    }
    
    // Mettre à jour une barre de performance spécifique
    function updatePerformanceBar(period, changeValue) {
        const performanceValue = document.querySelector(`.${period}-performance .performance-value`);
        const performanceBar = document.querySelector(`.${period}-performance .performance-bar`);
        
        if (performanceValue && performanceBar && changeValue !== undefined) {
            // S'assurer que changeValue est un nombre
            const numericChange = typeof changeValue === 'string' ? parseFloat(changeValue) : changeValue;
            
            performanceValue.textContent = `${numericChange >= 0 ? '+' : ''}${numericChange}%`;
            
            // Appliquer les classes CSS pour les couleurs
            if (numericChange >= 0) {
                performanceValue.classList.remove('negative');
                performanceValue.classList.add('positive');
                performanceBar.classList.remove('negative');
                performanceBar.classList.add('positive');
            } else {
                performanceValue.classList.remove('positive');
                performanceValue.classList.add('negative');
                performanceBar.classList.remove('positive');
                performanceBar.classList.add('negative');
            }
            
            // Calculer la largeur de la barre (max 100%)
            const width = Math.min(Math.abs(numericChange) * 5, 100);
            performanceBar.style.width = `${width}%`;
        }
    }
    
    // Obtenir le préfixe d'échange pour un symbole
    function getExchangePrefix(symbol) {
        // Si c'est une action française (se termine par .PA)
        if (symbol.endsWith('.PA')) {
            return 'EURONEXT';
        }
        
        // Liste plus complète de symboles pour les bourses principales
        const exchangeMap = {
            // Symboles NASDAQ (pour les 100 principales)
            'AAPL': 'NASDAQ', 'MSFT': 'NASDAQ', 'AMZN': 'NASDAQ', 'GOOGL': 'NASDAQ', 'GOOG': 'NASDAQ',
            'META': 'NASDAQ', 'NVDA': 'NASDAQ', 'TSLA': 'NASDAQ', 'AVGO': 'NASDAQ', 'PEP': 'NASDAQ',
            'COST': 'NASDAQ', 'CSCO': 'NASDAQ', 'TMUS': 'NASDAQ', 'ADBE': 'NASDAQ', 'CMCSA': 'NASDAQ',
            'TXN': 'NASDAQ', 'INTC': 'NASDAQ', 'QCOM': 'NASDAQ', 'AMD': 'NASDAQ', 'INTU': 'NASDAQ',
            'AMGN': 'NASDAQ', 'HON': 'NASDAQ', 'SBUX': 'NASDAQ', 'GILD': 'NASDAQ', 'ADI': 'NASDAQ',
            'MDLZ': 'NASDAQ', 'AMAT': 'NASDAQ', 'ISRG': 'NASDAQ', 'REGN': 'NASDAQ', 'NFLX': 'NASDAQ',
            
            // Symboles NYSE (pour certaines principales)
            'JPM': 'NYSE', 'V': 'NYSE', 'JNJ': 'NYSE', 'UNH': 'NYSE', 'HD': 'NYSE',
            'PG': 'NYSE', 'XOM': 'NYSE', 'BAC': 'NYSE', 'MA': 'NYSE', 'DIS': 'NYSE',
            'CVX': 'NYSE', 'MRK': 'NYSE', 'KO': 'NYSE', 'PFE': 'NYSE', 'T': 'NYSE',
            'WMT': 'NYSE', 'VZ': 'NYSE', 'CRM': 'NYSE', 'ABT': 'NYSE', 'ORCL': 'NYSE',
            
            // Classes d'actions spéciales
            'BRK.A': 'NYSE', 'BRK.B': 'NYSE'
        };
        
        // Retourner le préfixe d'échange si connu, sinon NYSE par défaut
        return exchangeMap[symbol] || 'NYSE';
    }
    
    // Obtenir le nom d'une entreprise basé sur son symbole
    function getCompanyName(symbol) {
        // Si c'est une action française (se termine par .PA)
        if (symbol.endsWith('.PA')) {
            const baseName = symbol.replace('.PA', '');
            return `${baseName} S.A.`;
        }
        
        // Liste plus complète de noms d'entreprises
        const companies = {
            // NASDAQ
            'AAPL': 'Apple Inc.',
            'MSFT': 'Microsoft Corporation',
            'AMZN': 'Amazon.com Inc.',
            'GOOGL': 'Alphabet Inc. (Class A)',
            'GOOG': 'Alphabet Inc. (Class C)',
            'META': 'Meta Platforms Inc.',
            'NVDA': 'NVIDIA Corporation',
            'TSLA': 'Tesla Inc.',
            'AVGO': 'Broadcom Inc.',
            'PEP': 'PepsiCo Inc.',
            'COST': 'Costco Wholesale Corporation',
            'CSCO': 'Cisco Systems Inc.',
            'TMUS': 'T-Mobile US Inc.',
            'ADBE': 'Adobe Inc.',
            'CMCSA': 'Comcast Corporation',
            'NFLX': 'Netflix Inc.',
            
            // NYSE
            'JPM': 'JPMorgan Chase & Co.',
            'V': 'Visa Inc.',
            'JNJ': 'Johnson & Johnson',
            'UNH': 'UnitedHealth Group Inc.',
            'HD': 'Home Depot Inc.',
            'PG': 'Procter & Gamble Co.',
            'XOM': 'Exxon Mobil Corporation',
            'BAC': 'Bank of America Corp.',
            'MA': 'Mastercard Inc.',
            'DIS': 'Walt Disney Co.',
            'WMT': 'Walmart Inc.',
            
            // Classes d'actions spéciales
            'BRK.A': 'Berkshire Hathaway Inc. (Class A)',
            'BRK.B': 'Berkshire Hathaway Inc. (Class B)',
            
            // Actions françaises (Euronext Paris)
            'OR.PA': 'L\'Oréal S.A.',
            'BNP.PA': 'BNP Paribas S.A.',
            'AIR.PA': 'Airbus SE',
            'MC.PA': 'LVMH Moët Hennessy Louis Vuitton SE',
            'SAN.PA': 'Sanofi S.A.',
            'CS.PA': 'AXA S.A.',
            'BN.PA': 'Danone S.A.',
            'CAP.PA': 'Capgemini SE'
        };
        
        return companies[symbol] || `${symbol} Corp.`;
    }
    
    // Démarrer l'application
    init();
});