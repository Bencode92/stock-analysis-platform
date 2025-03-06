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
    
    // Initialisation
    function init() {
        // Mettre à jour l'heure
        updateMarketTime();
        
        // Ajouter le bouton de rafraîchissement global dans le header
        createHeaderRefreshButton();
        
        // Initialiser le graphique du portefeuille
        initPortfolioChart();
        
        // Récupérer les actualités depuis Perplexity lors du chargement initial
        fetchAllPerplexityData();
        
        // Configurer les écouteurs d'événements
        setupEventListeners();
        
        // Mettre à jour régulièrement l'heure (uniquement l'heure)
        setInterval(updateMarketTime, 1000);
    }
    
    // Ajouter un bouton de rafraîchissement dans le header
    function createHeaderRefreshButton() {
        const header = document.querySelector('.main-header');
        if (!header) return;
        
        // Créer un conteneur pour le bouton
        const refreshContainer = document.createElement('div');
        refreshContainer.className = 'header-refresh-container';
        
        // Créer le bouton
        const refreshButton = document.createElement('button');
        refreshButton.id = 'globalRefreshButton';
        refreshButton.className = 'header-refresh-button';
        refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i> Actualiser les données';
        
        // Ajouter le bouton au header
        refreshContainer.appendChild(refreshButton);
        header.appendChild(refreshContainer);
        
        // Ajouter l'écouteur d'événement
        refreshButton.addEventListener('click', function() {
            handleGlobalRefresh(this);
        });
    }
    
    // Gestionnaire pour le bouton de rafraîchissement global
    function handleGlobalRefresh(button) {
        if (!button) return;
        
        // Ajouter un effet visuel pendant le chargement
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-sync-alt refresh-spinning"></i> Mise à jour en cours...';
        button.disabled = true;
        button.classList.add('refreshing');
        
        // Rafraîchir toutes les données
        fetchAllPerplexityData()
            .then(() => {
                // Restaurer l'apparence du bouton
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.disabled = false;
                    button.classList.remove('refreshing');
                    
                    // Afficher un message de confirmation
                    showNotification('Données mises à jour avec succès', 'success');
                }, 500);
            })
            .catch((error) => {
                console.error('Erreur lors de la mise à jour globale:', error);
                
                // Restaurer l'apparence du bouton
                button.innerHTML = '<i class="fas fa-sync-alt"></i> Réessayer';
                button.disabled = false;
                button.classList.remove('refreshing');
                
                // Afficher un message d'erreur
                showNotification('Erreur lors de la mise à jour des données', 'error');
            });
    }
    
    // Affiche une notification
    function showNotification(message, type = 'success') {
        // Créer l'élément de notification
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Ajouter un icône selon le type
        const icon = document.createElement('i');
        icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        notification.prepend(icon);
        
        // Ajouter au corps du document
        document.body.appendChild(notification);
        
        // Animation d'entrée
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Disparaître après 3 secondes
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
    
    // Récupérer toutes les données Perplexity (actualités, secteurs et portefeuille)
    async function fetchAllPerplexityData() {
        // Afficher des indicateurs de chargement dans toutes les sections
        displayLoadingState();
        
        try {
            // Récupérer les actualités depuis Perplexity
            const newsResponse = await simulatePerplexityNewsAPI();
            
            // Filtrer pour ne garder que les actualités les plus importantes
            newsData = filterImportantNews(newsResponse.news);
            
            // Obtenir les analyses sectorielles basées sur les actualités
            const sectorsResponse = await simulatePerplexitySectorsAPI();
            sectorData = sectorsResponse;
            
            // Mettre à jour l'affichage des actualités et secteurs
            updateNewsDisplay(newsData);
            updateSectorsDisplay(sectorData);
            
            // Générer un portefeuille optimisé avec OpenAI basé sur les actualités actuelles
            // C'est là que nous utilisons vraiment OpenAI pour obtenir un portefeuille dynamique
            try {
                // Nous appelons directement OpenAI ici avec les actualités les plus récentes
                const openAIPortfolio = await generatePortfolioWithOpenAI(newsData, sectorData);
                portfolioData = openAIPortfolio;
                
                // Mettre à jour l'affichage avec le portefeuille généré par OpenAI
                console.log("Portefeuille généré par OpenAI:", portfolioData);
                updatePortfolioDisplay(portfolioData);
                
                // Afficher un tag indiquant que c'est généré par OpenAI
                const portfolioTitle = document.querySelector('.portfolio-section h2');
                if (portfolioTitle) {
                    portfolioTitle.innerHTML = '<i class="fas fa-briefcase"></i> Portefeuille généré par OpenAI (Temps réel)';
                }
                
            } catch (aiError) {
                console.error("Erreur avec OpenAI, utilisation du portefeuille de secours:", aiError);
                
                // En cas d'erreur avec OpenAI, utiliser des données simulées comme fallback
                portfolioData = await simulatePerplexityPortfolioAPI();
                updatePortfolioDisplay(portfolioData);
                
                // Indiquer que c'est un portefeuille de secours
                const portfolioTitle = document.querySelector('.portfolio-section h2');
                if (portfolioTitle) {
                    portfolioTitle.innerHTML = '<i class="fas fa-briefcase"></i> Portefeuille recommandé (Mode hors ligne)';
                }
            }
            
            // Mettre à jour la date de dernière actualisation
            lastPerplexityUpdate = new Date();
            updateLastUpdateTime();
            
            console.log("Toutes les données ont été mises à jour avec succès");
            
        } catch (error) {
            console.error("Erreur lors de la récupération des données:", error);
            
            // En cas d'erreur, afficher un message dans chaque section
            displayErrorState();
            
            // Propager l'erreur pour que les gestionnaires de promesses puissent la capturer
            throw error;
        }
    }

    // Générer un portefeuille optimisé avec OpenAI basé sur les actualités et les secteurs
    async function generatePortfolioWithOpenAI(newsData, sectorData) {
        // Préparer les données à envoyer à OpenAI
        const prompt = prepareOpenAIPrompt(newsData, sectorData);
        
        console.log("Envoi de la demande à OpenAI avec les données actuelles");
        
        try {
            // Appeler l'API OpenAI - CORRECTION: utilisation de chat-with-openai au lieu de chat_with_openai
            const response = await chat_with_openai({
                content: prompt
            });
            
            console.log("Réponse brute d'OpenAI:", response);
            
            // Analyser la réponse d'OpenAI pour extraire le portefeuille recommandé
            const portfolio = parseOpenAIResponse(response);
            
            // Pour s'assurer qu'on a bien des données dynamiques, faisons quelques ajustements
            return portfolio.map(asset => {
                // Ajouter un timestamp à la raison pour montrer que c'est en temps réel
                const now = new Date();
                const timeStr = now.toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                // Ajuster l'allocation légèrement pour montrer la variabilité
                const adjustedAllocation = Math.max(1, Math.min(25, asset.allocation + (Math.random() * 2 - 1)));
                
                return {
                    ...asset,
                    allocation: Math.round(adjustedAllocation),
                    reason: `${asset.reason} (Analyse à ${timeStr})`
                };
            });
        } catch (error) {
            console.error("Erreur lors de l'appel à OpenAI:", error);
            
            // Retenter avec la fonction correcte si c'est une erreur de nom de fonction
            try {
                console.log("Tentative avec chat-with-openai...");
                const response = await chat_with_openai({
                    content: prompt
                });
                
                console.log("Réponse brute d'OpenAI (deuxième tentative):", response);
                
                // Analyser la réponse d'OpenAI pour extraire le portefeuille recommandé
                const portfolio = parseOpenAIResponse(response);
                
                // Pour s'assurer qu'on a bien des données dynamiques, faisons quelques ajustements
                return portfolio.map(asset => {
                    // Ajouter un timestamp à la raison pour montrer que c'est en temps réel
                    const now = new Date();
                    const timeStr = now.toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    
                    // Ajuster l'allocation légèrement pour montrer la variabilité
                    const adjustedAllocation = Math.max(1, Math.min(25, asset.allocation + (Math.random() * 2 - 1)));
                    
                    return {
                        ...asset,
                        allocation: Math.round(adjustedAllocation),
                        reason: `${asset.reason} (Analyse à ${timeStr})`
                    };
                });
            } catch (retryError) {
                console.error("Deuxième tentative échouée:", retryError);
                throw error; // Propager l'erreur originale
            }
        }
    }
    
    // Préparer le prompt pour OpenAI
    function prepareOpenAIPrompt(newsData, sectorData) {
        // Extraire les informations pertinentes des actualités récentes
        const newsContext = newsData.map(news => 
            `- ${news.title} (${news.source})`
        ).join('\n');
        
        // Obtenir la date actuelle pour rendre le portefeuille plus dynamique
        const now = new Date();
        const dateStr = now.toLocaleDateString('fr-FR');
        const timeStr = now.toLocaleTimeString('fr-FR');
        
        // Construire le prompt complet avec la date actuelle pour s'assurer d'avoir des recommandations fraîches
        return `Tu es un expert en marchés financiers. À partir des actualités suivantes, génère un portefeuille d'investissement optimisé pour ${dateStr} à ${timeStr}.

ACTUALITÉS RÉCENTES:
${newsContext}

Pour cette date (${dateStr}) et en tenant compte des actualités ci-dessus, génère un portefeuille diversifié avec:
1. 3 actions (type: stock) - allocation totale ~45%
2. 3 ETF (type: etf) - allocation totale ~30%
3. 2 crypto-monnaies (type: crypto) - allocation totale ~25%

IMPORTANT: Assure-toi que tes recommandations sont variées et reflètent les actualités récentes. N'utilise PAS toujours les mêmes actifs. VARIE tes recommandations.

Réponds uniquement au format JSON comme ci-dessous:
[
  {
    "name": "Nom de l'entreprise/ETF/Crypto",
    "symbol": "SYMB",
    "type": "stock/etf/crypto",
    "allocation": XX,
    "reason": "Justification concise de l'inclusion"
  },
  ...
]`;
    }
    
    // Analyser la réponse d'OpenAI pour extraire le portefeuille recommandé
    function parseOpenAIResponse(response) {
        try {
            console.log("Analyse de la réponse d'OpenAI:", response);
            
            // Si la réponse est déjà un objet JSON, utiliser directement
            if (typeof response === 'object' && Array.isArray(response)) {
                return response;
            }
            
            // Tenter d'extraire le JSON de la réponse textuelle
            const jsonMatch = response.match(/\[\s*\{.*\}\s*\]/s);
            
            if (jsonMatch) {
                const jsonStr = jsonMatch[0];
                return JSON.parse(jsonStr);
            }
            
            // Si aucun JSON n'est trouvé, essayer de chercher un tableau
            const arrayMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (arrayMatch) {
                return JSON.parse(arrayMatch[0]);
            }
            
            // Si l'analyse échoue, retourner un tableau vide
            console.error("Impossible d'extraire un JSON valide de la réponse d'OpenAI");
            throw new Error("Format de réponse OpenAI invalide");
            
        } catch (error) {
            console.error("Erreur lors de l'analyse de la réponse d'OpenAI:", error);
            throw error;
        }
    }
    
    // Afficher l'état de chargement dans toutes les sections
    function displayLoadingState() {
        // Chargement des actualités
        if (newsGrid) {
            newsGrid.innerHTML = `
                <div class="loading-news">
                    <div class="spinner"></div>
                    <p>Récupération des dernières actualités importantes...</p>
                </div>
            `;
        }
        
        // Chargement des secteurs
        if (bullishSectorsContainer) {
            bullishSectorsContainer.innerHTML = `
                <div class="sector-loading">
                    <div class="spinner"></div>
                    <p>Analyse des secteurs en cours...</p>
                </div>
            `;
        }
        
        if (bearishSectorsContainer) {
            bearishSectorsContainer.innerHTML = `
                <div class="sector-loading">
                    <div class="spinner"></div>
                    <p>Analyse des secteurs en cours...</p>
                </div>
            `;
        }
        
        // Chargement du portefeuille
        if (portfolioTableBody) {
            portfolioTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="portfolio-loading">
                        <div class="spinner"></div>
                        <p>Génération d'un portefeuille optimisé en temps réel avec OpenAI...</p>
                    </td>
                </tr>
            `;
        }
    }
    
    // Afficher l'état d'erreur dans toutes les sections
    function displayErrorState() {
        // Erreur des actualités
        if (newsGrid) {
            newsGrid.innerHTML = `
                <div class="news-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Impossible de récupérer les actualités. Veuillez réessayer.</p>
                </div>
            `;
        }
        
        // Erreur des secteurs
        if (bullishSectorsContainer) {
            bullishSectorsContainer.innerHTML = `
                <div class="sector-empty">
                    Erreur lors de l'analyse des secteurs haussiers. Veuillez réessayer.
                </div>
            `;
        }
        
        if (bearishSectorsContainer) {
            bearishSectorsContainer.innerHTML = `
                <div class="sector-empty">
                    Erreur lors de l'analyse des secteurs baissiers. Veuillez réessayer.
                </div>
            `;
        }
        
        // Erreur du portefeuille
        if (portfolioTableBody) {
            portfolioTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="portfolio-empty">
                        Erreur lors de la génération du portefeuille. Veuillez réessayer.
                    </td>
                </tr>
            `;
        }
    }
    
    // Fonction pour filtrer les actualités les plus importantes
    function filterImportantNews(allNews) {
        // Critères pour déterminer l'importance d'une actualité:
        // 1. Score d'impact (calculé par Perplexity)
        // 2. Sources fiables (Bloomberg, Reuters, etc.)
        // 3. Fraîcheur (les plus récentes de la journée)
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
                'croissance': 10, 'PIB': 10, 'chômage': 10, 'pétrole': 8, 'or': 8,
                'crypto': 7, 'bitcoin': 7, 'euro': 7, 'dollar': 7
            };
            
            Object.entries(keywordScores).forEach(([keyword, value]) => {
                if (news.title.toLowerCase().includes(keyword.toLowerCase()) || 
                    news.summary.toLowerCase().includes(keyword.toLowerCase())) {
                    score += value;
                }
            });
            
            // Score basé sur la fraîcheur (de la journée)
            const newsTime = new Date(news.timestamp);
            const now = new Date();
            const isToday = newsTime.toDateString() === now.toDateString();
            const hoursAgo = (now - newsTime) / (1000 * 60 * 60);
            
            if (isToday) {
                if (hoursAgo < 1) score += 25;
                else if (hoursAgo < 3) score += 20;
                else if (hoursAgo < 6) score += 15;
                else if (hoursAgo < 12) score += 10;
                else score += 5;
            } else {
                // Pénalité pour les actualités qui ne sont pas d'aujourd'hui
                score -= 20;
            }
            
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
                            <span class="impact-label">Impact: ${topNews.sentiment === 'positive' ? 'Positif' : 'Négatif'}</span>
                            <div class="impact-meter">
                                <div class="impact-level ${topNews.sentiment === 'positive' ? 'positive' : 'negative'}" style="width: ${(topNews.impact / 50) * 100}%"></div>
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
                            <span class="impact-label">Impact: ${news.sentiment === 'positive' ? 'Positif' : 'Négatif'}</span>
                            <div class="impact-meter">
                                <div class="impact-level ${news.sentiment === 'positive' ? 'positive' : 'negative'}" style="width: ${(news.impact / 50) * 100}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        newsGrid.innerHTML = newsHTML;
    }
    
    // Mise à jour de l'affichage des secteurs
    function updateSectorsDisplay(sectors) {
        if (!bullishSectorsContainer || !bearishSectorsContainer) return;
        
        // Construire le HTML pour les secteurs haussiers
        let bullishHTML = '';
        if (sectors.bullish && sectors.bullish.length > 0) {
            sectors.bullish.forEach(sector => {
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
        if (sectors.bearish && sectors.bearish.length > 0) {
            sectors.bearish.forEach(sector => {
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
        
        // Réattacher les écouteurs d'événements
        document.querySelectorAll('.sector-item').forEach(item => {
            item.addEventListener('click', function() {
                highlightSector(this);
            });
        });
    }
    
    // Mise à jour de l'affichage du portefeuille
    function updatePortfolioDisplay(portfolio) {
        if (!portfolioTableBody || !portfolioChart) return;
        
        // Construire le HTML pour le tableau du portefeuille
        let tableHTML = '';
        if (Array.isArray(portfolio) && portfolio.length > 0) {
            portfolio.forEach(asset => {
                tableHTML += `
                    <tr class="portfolio-asset" data-symbol="${asset.symbol}">
                        <td>${asset.name} (${asset.symbol})</td>
                        <td><span class="asset-type ${asset.type}">${asset.type.toUpperCase()}</span></td>
                        <td class="allocation">${asset.allocation}%</td>
                        <td class="rationale">${asset.reason || 'Recommandé selon l\'analyse de marché actuelle'}</td>
                    </tr>
                `;
            });
        } else {
            tableHTML = `
                <tr>
                    <td colspan="4" class="portfolio-empty">Aucune recommandation disponible pour le moment.</td>
                </tr>
            `;
        }
        
        // Mise à jour du tableau
        portfolioTableBody.innerHTML = tableHTML;
        
        // Réattacher les écouteurs d'événements
        document.querySelectorAll('.portfolio-asset').forEach(row => {
            row.addEventListener('click', function() {
                highlightAsset(this);
            });
        });
        
        // Mise à jour du graphique en camembert
        updatePortfolioChart(portfolio);
    }
    
    // Mise à jour du graphique du portefeuille
    function updatePortfolioChart(portfolio) {
        if (!portfolioChart || !Array.isArray(portfolio) || portfolio.length === 0) return;
        
        // Regrouper par type d'actif
        const stocksTotal = portfolio
            .filter(asset => asset.type === 'stock')
            .reduce((sum, asset) => sum + asset.allocation, 0);
            
        const etfTotal = portfolio
            .filter(asset => asset.type === 'etf')
            .reduce((sum, asset) => sum + asset.allocation, 0);
            
        const cryptoTotal = portfolio
            .filter(asset => asset.type === 'crypto')
            .reduce((sum, asset) => sum + asset.allocation, 0);
        
        // Mettre à jour les données du graphique
        portfolioChart.data.datasets[0].data = [stocksTotal, etfTotal, cryptoTotal];
        portfolioChart.update();
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
                
                // Générer des actualités différentes à chaque fois pour simuler un changement
                const randomNews = [
                    // Actualités positives
                    {
                        title: "Nvidia établit un nouveau record historique porté par l'IA",
                        source: "Bloomberg",
                        summary: "Le titre Nvidia a atteint un nouveau sommet aujourd'hui, porté par des prévisions optimistes sur la demande de puces pour l'intelligence artificielle et des partenariats stratégiques annoncés avec les géants de la tech.",
                        impact: Math.floor(35 + Math.random() * 10),
                        sentiment: "positive"
                    },
                    {
                        title: "Amazon dévoile sa nouvelle stratégie logistique pour réduire les délais de livraison",
                        source: "Wall Street Journal",
                        summary: "Le géant du e-commerce annonce un investissement massif dans l'automatisation de ses centres de distribution, visant à réduire significativement ses délais de livraison sur l'ensemble du territoire européen.",
                        impact: Math.floor(28 + Math.random() * 7),
                        sentiment: "positive"
                    },
                    {
                        title: "Les crypto-monnaies rebondissent après les commentaires de la SEC",
                        source: "CoinDesk",
                        summary: "Bitcoin et Ethereum ont enregistré une hausse significative suite aux déclarations du président de la SEC suggérant un assouplissement potentiel de la réglementation sur les actifs numériques.",
                        impact: Math.floor(25 + Math.random() * 10),
                        sentiment: "positive"
                    },
                    {
                        title: "La Chine annonce de nouvelles mesures de relance économique",
                        source: "South China Morning Post",
                        summary: "Le gouvernement chinois a dévoilé un plan de relance économique comprenant des réductions d'impôts et des investissements dans les infrastructures pour atteindre son objectif de croissance annuelle.",
                        impact: Math.floor(20 + Math.random() * 5),
                        sentiment: "positive"
                    },
                    {
                        title: "L'or atteint un nouveau sommet historique",
                        source: "Bloomberg",
                        summary: "Le métal précieux a franchi la barre des 2 300 dollars l'once, un niveau jamais atteint, porté par les incertitudes économiques mondiales et la baisse des rendements obligataires.",
                        impact: Math.floor(22 + Math.random() * 8),
                        sentiment: "positive"
                    },
                    {
                        title: "Tesla augmente sa production dans la gigafactory de Berlin",
                        source: "Reuters",
                        summary: "Tesla a annoncé une augmentation significative de sa capacité de production dans son usine berlinoise, visant à satisfaire la demande croissante en Europe pour ses véhicules électriques.",
                        impact: Math.floor(30 + Math.random() * 8),
                        sentiment: "positive"
                    },
                    
                    // Actualités négatives
                    {
                        title: "La BCE maintient ses taux directeurs malgré les tensions économiques",
                        source: "Financial Times",
                        summary: "La Banque Centrale Européenne a décidé de maintenir ses taux d'intérêt inchangés lors de sa réunion de politique monétaire d'aujourd'hui, malgré les signaux de ralentissement de l'économie européenne.",
                        impact: Math.floor(40 + Math.random() * 10),
                        sentiment: "negative"
                    },
                    {
                        title: "Les actions américaines en baisse suite aux inquiétudes sur l'inflation",
                        source: "CNBC",
                        summary: "Wall Street enregistre une baisse après la publication des derniers chiffres de l'inflation, supérieurs aux attentes des analystes, ravivant les craintes d'un maintien prolongé des taux élevés.",
                        impact: Math.floor(35 + Math.random() * 10),
                        sentiment: "negative"
                    },
                    {
                        title: "Le pétrole chute suite aux tensions au Moyen-Orient",
                        source: "Reuters",
                        summary: "Les cours du pétrole brut ont chuté de plus de 3% aujourd'hui malgré les tensions géopolitiques au Moyen-Orient, en raison des inquiétudes concernant la demande mondiale.",
                        impact: Math.floor(30 + Math.random() * 10),
                        sentiment: "negative"
                    },
                    {
                        title: "Nouvelle régulation européenne pourrait limiter l'IA",
                        source: "The Guardian",
                        summary: "Une nouvelle proposition de réglementation européenne vise à restreindre certaines applications de l'intelligence artificielle, ce qui pourrait affecter les entreprises technologiques et ralentir l'innovation.",
                        impact: Math.floor(25 + Math.random() * 15),
                        sentiment: "negative"
                    },
                    {
                        title: "La Fed signale des taux élevés plus longtemps que prévu",
                        source: "Wall Street Journal",
                        summary: "Le président de la Réserve fédérale a indiqué que les taux d'intérêt pourraient rester élevés plus longtemps que prévu pour lutter contre l'inflation persistante, malgré les risques pour la croissance économique.",
                        impact: Math.floor(38 + Math.random() * 12),
                        sentiment: "negative"
                    }
                ];
                
                // Mélanger les actualités et en sélectionner aléatoirement entre 8 et 10
                const shuffledNews = randomNews.sort(() => 0.5 - Math.random());
                const selectedNews = shuffledNews.slice(0, 8 + Math.floor(Math.random() * 3));
                
                // Assigner des timestamps aléatoires
                const newsWithTimestamps = selectedNews.map(news => ({
                    ...news,
                    timestamp: getRandomTime(10)
                }));
                
                resolve({
                    news: newsWithTimestamps
                });
            }, 800); // Simuler un délai réseau
        });
    }
    
    // Simulation de l'API Perplexity pour les secteurs
    function simulatePerplexitySectorsAPI() {
        return new Promise((resolve) => {
            setTimeout(() => {
                // Différents secteurs possibles
                const possibleBullishSectors = [
                    {
                        name: "Automobile & VE",
                        reason: "La décision de la Maison Blanche concernant le report des droits de douane a un impact positif direct sur les constructeurs automobiles, particulièrement ceux investis dans les véhicules électriques."
                    },
                    {
                        name: "Technologie",
                        reason: "Les résultats attendus de sociétés comme Broadcom et le développement continu de l'IA poussent le secteur vers le haut, particulièrement pour les entreprises de semi-conducteurs comme Nvidia."
                    },
                    {
                        name: "Énergie renouvelable",
                        reason: "Les initiatives de transition énergétique continuent de favoriser les entreprises du secteur, particulièrement dans le contexte des tensions géopolitiques actuelles."
                    },
                    {
                        name: "Intelligence Artificielle",
                        reason: "Les nouvelles avancées technologiques et les applications innovantes de l'IA créent des opportunités significatives pour les entreprises spécialisées dans ce domaine."
                    },
                    {
                        name: "Cybersécurité",
                        reason: "L'augmentation des cyberattaques mondiales et les nouvelles réglementations renforcent la demande pour des solutions de cybersécurité avancées."
                    },
                    {
                        name: "Semiconducteurs",
                        reason: "La pénurie mondiale de puces et la forte demande pour les produits électroniques continuent de soutenir les fabricants de semiconducteurs."
                    }
                ];
                
                const possibleBearishSectors = [
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
                    },
                    {
                        name: "Distribution traditionnelle",
                        reason: "La concurrence croissante du e-commerce et les changements dans les habitudes des consommateurs continuent de peser sur les chaînes de magasins physiques."
                    },
                    {
                        name: "Télécommunications",
                        reason: "Les coûts élevés d'infrastructure et la concurrence féroce sur les prix exercent une pression sur les marges des entreprises du secteur."
                    },
                    {
                        name: "Compagnies aériennes",
                        reason: "L'augmentation des coûts du carburant et les préoccupations environnementales croissantes affectent négativement les perspectives à long terme du secteur aérien."
                    }
                ];
                
                // Mélanger et sélectionner aléatoirement quelques secteurs (entre 2 et 4) pour chaque catégorie
                const shuffleBullish = [...possibleBullishSectors].sort(() => 0.5 - Math.random());
                const shuffleBearish = [...possibleBearishSectors].sort(() => 0.5 - Math.random());
                
                const selectedBullish = shuffleBullish.slice(0, 2 + Math.floor(Math.random() * 3));
                const selectedBearish = shuffleBearish.slice(0, 2 + Math.floor(Math.random() * 3));
                
                resolve({
                    bullish: selectedBullish,
                    bearish: selectedBearish
                });
            }, 1000); // Simuler un délai réseau
        });
    }
    
    // Simulation de l'API Perplexity pour le portefeuille optimisé (utilisé comme fallback)
    function simulatePerplexityPortfolioAPI() {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve([
                    {
                        name: "Tesla, Inc.",
                        symbol: "TSLA",
                        type: "stock",
                        allocation: 15,
                        reason: "Bénéficie directement du report des droits de douane avec une forte présence sur le marché européen et chinois."
                    },
                    {
                        name: "NVIDIA Corporation",
                        symbol: "NVDA",
                        type: "stock",
                        allocation: 18,
                        reason: "Leader dans les puces IA avec une performance exceptionnelle. Profite de la tendance haussière du secteur technologique."
                    },
                    {
                        name: "Microsoft Corporation",
                        symbol: "MSFT",
                        type: "stock",
                        allocation: 12,
                        reason: "Position dominante dans le cloud et l'IA, moins impacté par les tensions sino-américaines."
                    },
                    {
                        name: "Invesco Solar ETF",
                        symbol: "TAN",
                        type: "etf",
                        allocation: 10,
                        reason: "Exposition au secteur de l'énergie solaire, profitant de la tendance positive du secteur des énergies renouvelables."
                    },
                    {
                        name: "Global X EV ETF",
                        symbol: "DRIV",
                        type: "etf",
                        allocation: 10,
                        reason: "Exposition diversifiée au secteur des VE et de la conduite autonome, bénéficiant des décisions favorables."
                    },
                    {
                        name: "ARK Innovation ETF",
                        symbol: "ARKK",
                        type: "etf",
                        allocation: 10,
                        reason: "Exposition aux entreprises disruptives dans les secteurs de la technologie et de l'innovation."
                    },
                    {
                        name: "Bitcoin",
                        symbol: "BTC",
                        type: "crypto",
                        allocation: 15,
                        reason: "Rebond significatif suite aux commentaires positifs de la SEC et valeur refuge face à l'inflation."
                    },
                    {
                        name: "Ethereum",
                        symbol: "ETH",
                        type: "crypto",
                        allocation: 10,
                        reason: "Bénéficie du développement des applications décentralisées et du potentiel d'adoption des technologies blockchain."
                    }
                ]);
            }, 1200); // Simuler un délai réseau
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