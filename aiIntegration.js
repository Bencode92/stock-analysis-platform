// Module d'intégration Perplexity → Claude pour TradePulse
// Ajouter ce fichier et l'importer dans index.html avec:
// <script src="aiIntegration.js"></script>

// Obtenir des instruments financiers recommandés (stocks, ETF, crypto) de Perplexity
async function getFinancialInstrumentsFromPerplexity(newsData) {
  try {
    console.log("Obtention des instruments financiers depuis Perplexity...");
    
    // Formatter les news pour le prompt
    const newsPrompt = newsData.map(news => 
      `- ${news.title} (${news.source}): ${news.summary}`
    ).join('\n');
    
    // Construire un prompt spécifique pour Perplexity avec date explicite pour récence
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    
    const formattedToday = today.toLocaleDateString('fr-FR');
    const formattedWeekAgo = weekAgo.toLocaleDateString('fr-FR');
    
    const prompt = `
      Analyse ces actualités financières récentes:
      
      ${newsPrompt}
      
      En te basant UNIQUEMENT sur ces actualités et les tendances DE LA DERNIÈRE SEMAINE (${formattedWeekAgo} à ${formattedToday}):
      
      1. Quels ETF spécifiques seraient pertinents à considérer? Pour chacun, donne son nom complet, son symbole boursier, et explique brièvement pourquoi il est lié à ces actualités.
      
      2. Quelles actions (stocks) spécifiques semblent prometteuses ou à risque? Pour chacune, donne son nom complet, son symbole boursier, et explique brièvement pourquoi elle est liée à ces actualités.
      
      3. Quelles cryptomonnaies pourraient être impactées positivement ou négativement? Pour chacune, donne son nom, son symbole, et explique brièvement pourquoi elle est liée à ces actualités.
      
      IMPORTANT: Ne prends en compte QUE l'actualité TRÈS RÉCENTE (aujourd'hui ou cette semaine), ignore les tendances historiques plus anciennes.
      
      Format de réponse demandé:
      
      ETF:
      - [Nom de l'ETF] (SYMBOLE): Explication brève
      
      STOCKS:
      - [Nom de l'entreprise] (SYMBOLE): Explication brève
      
      CRYPTO:
      - [Nom de la crypto] (SYMBOLE): Explication brève
    `;
    
    // Dans une implémentation réelle, envoyer ce prompt à Perplexity via leur API
    console.log("Envoi du prompt à Perplexity:", prompt.substring(0, 100) + "...");
    
    // Simulation pour le moment, dans une implémentation réelle:
    // const perplexityResponse = await chat_with_perplexity({ content: prompt });
    
    // Parser la réponse simulée de Perplexity
    const instruments = await parsePerplexityResponse(simulatePerplexityResponse(newsData));
    
    console.log("Instruments financiers obtenus:", instruments);
    return instruments;
  } catch (error) {
    console.error("Erreur lors de l'obtention des instruments financiers:", error);
    throw error;
  }
}

// Parser la réponse de Perplexity
async function parsePerplexityResponse(response) {
  // Initialiser les structures pour stocker les instruments
  const stocks = [];
  const etfs = [];
  const cryptos = [];
  
  // Fonction utilitaire pour parser une ligne
  function parseLine(line, collection, type) {
    if (!line.trim()) return;
    
    // Regex pour extraire le nom, le symbole et l'info
    const match = line.match(/- (.*?) \((.*?)\): (.*)/);
    if (match) {
      collection.push({
        name: match[1].trim(),
        symbol: match[2].trim(),
        info: match[3].trim(),
        type: type
      });
    }
  }
  
  // Diviser la réponse en sections
  const sections = response.split('\n\n');
  
  for (const section of sections) {
    if (section.trim().startsWith('ETF:')) {
      // Parser la section ETF
      const lines = section.split('\n').slice(1); // Ignorer l'en-tête
      lines.forEach(line => parseLine(line, etfs, 'etf'));
    } else if (section.trim().startsWith('STOCKS:')) {
      // Parser la section STOCKS
      const lines = section.split('\n').slice(1); // Ignorer l'en-tête
      lines.forEach(line => parseLine(line, stocks, 'stock'));
    } else if (section.trim().startsWith('CRYPTO:')) {
      // Parser la section CRYPTO
      const lines = section.split('\n').slice(1); // Ignorer l'en-tête
      lines.forEach(line => parseLine(line, cryptos, 'crypto'));
    }
  }
  
  return {
    stocks,
    etfs,
    cryptos
  };
}

// Générer un portefeuille optimisé avec Claude au lieu d'OpenAI
async function generatePortfolioWithClaude(newsData, sectorData, financialInstruments) {
  // Préparer le prompt pour Claude
  const prompt = prepareClaudePromptWithInstruments(newsData, sectorData, financialInstruments);
  
  console.log("Envoi du prompt à Claude:", prompt.substring(0, 200) + "...");
  
  try {
    // Utiliser Claude au lieu d'OpenAI
    // Dans une implémentation réelle, utiliser l'API Claude
    // Pour ce MVP, nous simulons une réponse Claude
    const response = simulateClaudeResponse(newsData, sectorData, financialInstruments);
    
    console.log("Réponse brute de Claude:", response.substring(0, 200) + "...");
    
    // Tenter d'extraire le JSON de la réponse
    try {
      // Si la réponse est déjà un objet JSON, utiliser directement
      if (typeof response === 'object' && Array.isArray(response)) {
        return addTimestampToReasons(response);
      }
      
      // Extraire le JSON de la réponse textuelle
      const portfolio = extractJSONFromText(response);
      
      if (portfolio && Array.isArray(portfolio)) {
        return addTimestampToReasons(portfolio);
      } else {
        throw new Error("Format de portefeuille non valide");
      }
    } catch (parseError) {
      console.error("Erreur d'analyse de la réponse Claude:", parseError);
      
      // Si l'extraction JSON échoue, essayer d'extraire les informations de manière plus souple
      const fallbackPortfolio = extractPortfolioManually(response);
      if (fallbackPortfolio.length > 0) {
        return addTimestampToReasons(fallbackPortfolio);
      }
      
      throw parseError;
    }
  } catch (error) {
    console.error("Erreur lors de l'appel à Claude:", error);
    throw error;
  }
}

// Préparer le prompt pour Claude avec les instruments financiers
function prepareClaudePromptWithInstruments(newsData, sectorData, financialInstruments) {
  // Extraire les informations pertinentes des actualités
  const newsContext = newsData.map(news => 
    `- ${news.title} (${news.source}): ${news.summary} [Impact: ${news.sentiment === 'positive' ? 'Positif' : 'Négatif'}]`
  ).join('\n');
  
  // Extraire les informations des secteurs
  const bullishSectors = sectorData.bullish.map(sector => 
    `- ${sector.name}: ${sector.reason}`
  ).join('\n');
  
  const bearishSectors = sectorData.bearish.map(sector => 
    `- ${sector.name}: ${sector.reason}`
  ).join('\n');
  
  // Préparer les instruments financiers
  const stocksInfo = financialInstruments.stocks.map(stock => 
    `- ${stock.name} (${stock.symbol}): ${stock.info}`
  ).join('\n');
  
  const etfsInfo = financialInstruments.etfs.map(etf => 
    `- ${etf.name} (${etf.symbol}): ${etf.info}`
  ).join('\n');
  
  const cryptosInfo = financialInstruments.cryptos.map(crypto => 
    `- ${crypto.name} (${crypto.symbol}): ${crypto.info}`
  ).join('\n');
  
  // Obtenir la date actuelle pour des recommandations fraîches
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR');
  const timeStr = now.toLocaleTimeString('fr-FR');
  
  // Construire le prompt complet avec des instructions claires pour un portefeuille à risque modéré
  // Optimisé pour Claude, en insistant sur la flexibilité de l'allocation
  return `En tant qu'analyste financier expert, tu dois créer un portefeuille d'investissement optimisé pour ${dateStr} à ${timeStr} en te basant sur les données ci-dessous.

ACTUALITÉS FINANCIÈRES RÉCENTES (dernière semaine):
${newsContext}

SECTEURS HAUSSIERS:
${bullishSectors}

SECTEURS BAISSIERS:
${bearishSectors}

INSTRUMENTS FINANCIERS DISPONIBLES:
ACTIONS:
${stocksInfo}

ETF:
${etfsInfo}

CRYPTOMONNAIES:
${cryptosInfo}

Consignes:
1. IMPORTANT: Crée un portefeuille équilibré à RISQUE MODÉRÉ basé sur ces informations.
2. Ne suis AUCUN modèle d'allocation prédéfini (pas de 45%/30%/25% ou autre formule fixe).
3. Analyse la situation actuelle et détermine librement l'équilibre optimal entre actions, ETF et cryptomonnaies.
4. Choisis uniquement parmi les instruments listés ci-dessus.
5. Pour chaque instrument, détermine un pourcentage d'allocation approprié.
6. Justifie brièvement chaque choix en lien avec les actualités RÉCENTES ou tendances sectorielles ACTUELLES.
7. TRÈS IMPORTANT: Assure-toi que le total des allocations fasse exactement 100%.

Réponds directement au format JSON sans texte explicatif avant ou après:
[
  {
    "name": "Nom de l'instrument",
    "symbol": "SYMBOLE",
    "type": "stock/etf/crypto",
    "allocation": XX,
    "reason": "Justification concise liée à l'actualité récente"
  },
  ...
]`;
}

// Extraire un objet JSON d'une réponse textuelle
function extractJSONFromText(text) {
  try {
    // Rechercher un tableau JSON dans le texte
    const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    console.error("Aucun JSON trouvé dans:", text);
    return null;
  } catch (error) {
    console.error("Erreur lors de l'extraction du JSON:", error);
    return null;
  }
}

// Fonction pour extraire manuellement les informations du portefeuille si l'extraction JSON échoue
function extractPortfolioManually(text) {
  const portfolio = [];
  const lines = text.split('\n');
  let currentAsset = null;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Détecter une nouvelle entrée d'actif
    if (trimmedLine.match(/^\d+\.|\-|\*/) || 
        trimmedLine.match(/^[A-Z].*\([A-Z]+\):/) || 
        trimmedLine.match(/^(Bitcoin|Ethereum|Binance Coin|Cardano|Solana)/)) {
      
      // Sauvegarder l'actif précédent si complet
      if (currentAsset && 
          currentAsset.name && 
          currentAsset.symbol && 
          currentAsset.type && 
          currentAsset.allocation) {
        portfolio.push(currentAsset);
      }
      
      // Initialiser un nouvel actif
      currentAsset = {
        name: '',
        symbol: '',
        type: '',
        allocation: 0,
        reason: ''
      };
      
      // Extraction des infos de base
      const symbolMatch = trimmedLine.match(/\(([A-Z]+)\)/);
      if (symbolMatch) {
        currentAsset.symbol = symbolMatch[1];
        currentAsset.name = trimmedLine.split('(')[0].trim();
      }
      
      // Détection du type
      if (trimmedLine.toLowerCase().includes('stock') || 
          trimmedLine.toLowerCase().includes('action')) {
        currentAsset.type = 'stock';
      } else if (trimmedLine.toLowerCase().includes('etf')) {
        currentAsset.type = 'etf';
      } else if (trimmedLine.toLowerCase().includes('crypto') || 
              trimmedLine.includes('Bitcoin') || 
              trimmedLine.includes('Ethereum')) {
        currentAsset.type = 'crypto';
      }
      
      // Extraction de l'allocation
      const allocationMatch = trimmedLine.match(/(\d+)%/);
      if (allocationMatch) {
        currentAsset.allocation = parseInt(allocationMatch[1]);
      }
    }
    
    // Complétion des informations
    if (currentAsset) {
      // Extraction du symbole
      if (!currentAsset.symbol && trimmedLine.match(/symbol|symbole/i)) {
        const symbolMatch = trimmedLine.match(/[A-Z]{2,5}/);
        if (symbolMatch) currentAsset.symbol = symbolMatch[0];
      }
      
      // Extraction du type
      if (!currentAsset.type) {
        if (trimmedLine.toLowerCase().includes('stock') || 
            trimmedLine.toLowerCase().includes('action')) {
          currentAsset.type = 'stock';
        } else if (trimmedLine.toLowerCase().includes('etf')) {
          currentAsset.type = 'etf';
        } else if (trimmedLine.toLowerCase().includes('crypto')) {
          currentAsset.type = 'crypto';
        }
      }
      
      // Extraction de l'allocation
      if (!currentAsset.allocation && trimmedLine.match(/allocation|pourcentage|%/i)) {
        const allocationMatch = trimmedLine.match(/(\d+)%/);
        if (allocationMatch) currentAsset.allocation = parseInt(allocationMatch[1]);
      }
      
      // Extraction de la raison
      if (trimmedLine.match(/raison|justification|explication|en raison|car|parce que/i) ||
          (currentAsset.name && currentAsset.symbol && currentAsset.type && 
           currentAsset.allocation && !currentAsset.reason)) {
        currentAsset.reason = trimmedLine.replace(/^raison|justification|explication:/i, '').trim();
      }
    }
  }
  
  // Ajouter le dernier actif s'il est complet
  if (currentAsset && currentAsset.name && currentAsset.symbol && 
      currentAsset.type && currentAsset.allocation) {
    portfolio.push(currentAsset);
  }
  
  return portfolio;
}

// Ajouter un horodatage aux raisons
function addTimestampToReasons(portfolio) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  return portfolio.map(asset => ({
    ...asset,
    reason: `${asset.reason} (Analyse à ${timeStr})`
  }));
}

// Fonction simulant une réponse de Perplexity pour des actualités récentes
function simulatePerplexityResponse(newsData) {
  // Cette fonction est simplifiée pour cet exemple
  // Pour une implémentation complète, voir le fichier app.js original
  // La différence principale est que maintenant on insiste sur les actualités RÉCENTES
  
  return `ETF:
- Invesco QQQ Trust (QQQ): Impacté positivement par les records de Nvidia annoncés aujourd'hui, suivant la tendance bullish actuelle de la tech.
- iShares Global Clean Energy ETF (ICLN): Une réponse directe aux initiatives de transition énergétique mentionnées dans les actualités d'hier.
- SPDR S&P 500 ETF Trust (SPY): Alternative de diversification face aux incertitudes économiques signalées par la BCE cette semaine.

STOCKS:
- NVIDIA Corporation (NVDA): Le titre vient d'atteindre un nouveau sommet historique selon Bloomberg aujourd'hui, porté par des prévisions optimistes sur la demande de puces IA.
- Tesla, Inc. (TSLA): L'annonce d'hier sur l'augmentation de production dans la gigafactory de Berlin crée une opportunité immédiate.
- Amazon.com, Inc. (AMZN): Sa nouvelle stratégie logistique dévoilée cette semaine promet d'impacter positivement ses performances à court terme.

CRYPTO:
- Bitcoin (BTC): Les commentaires de la SEC cette semaine ont provoqué un rebond significatif, créant une dynamique haussière immédiate.
- Ethereum (ETH): Suit la tendance haussière du Bitcoin actuellement, avec des perspectives positives pour les 7 prochains jours.`;
}

// Fonction simulant une réponse de Claude (remplace OpenAI)
function simulateClaudeResponse(newsData, sectorData, financialInstruments) {
  // Cette simulation reflète comment Claude répondrait - avec une allocation plus flexible
  return `[
  {
    "name": "NVIDIA Corporation",
    "symbol": "NVDA",
    "type": "stock",
    "allocation": 22,
    "reason": "Leader incontesté des puces IA avec un nouveau record historique selon les actualités du jour, bénéficiant directement de la demande croissante pour l'IA."
  },
  {
    "name": "Tesla, Inc.",
    "symbol": "TSLA",
    "type": "stock",
    "allocation": 18,
    "reason": "L'augmentation de production dans la gigafactory de Berlin annoncée cette semaine crée une opportunité immédiate dans un secteur haussier."
  },
  {
    "name": "Microsoft Corporation",
    "symbol": "MSFT",
    "type": "stock",
    "allocation": 14,
    "reason": "Position dominante dans le cloud et l'IA, profitant de la tendance haussière du secteur technologique tout en étant moins exposé aux tensions sino-américaines."
  },
  {
    "name": "Global X Autonomous & Electric Vehicles ETF",
    "symbol": "DRIV",
    "type": "etf",
    "allocation": 12,
    "reason": "Exposition au secteur des VE bénéficiant directement de l'annonce récente de la Maison Blanche sur le report des droits de douane."
  },
  {
    "name": "Invesco Solar ETF",
    "symbol": "TAN",
    "type": "etf",
    "allocation": 8,
    "reason": "Exposition au secteur de l'énergie solaire qui reste porteur selon les analyses sectorielles de cette semaine."
  },
  {
    "name": "SPDR S&P 500 ETF Trust",
    "symbol": "SPY",
    "type": "etf",
    "allocation": 11,
    "reason": "Diversification stratégique face aux incertitudes économiques mentionnées par la BCE dans ses déclarations d'aujourd'hui."
  },
  {
    "name": "Bitcoin",
    "symbol": "BTC",
    "type": "crypto",
    "allocation": 9,
    "reason": "Le rebond significatif suite aux commentaires de la SEC cette semaine crée une opportunité tactique à court terme."
  },
  {
    "name": "Ethereum",
    "symbol": "ETH",
    "type": "crypto",
    "allocation": 6,
    "reason": "Bénéficie actuellement du développement des applications décentralisées et suit la tendance haussière récente du Bitcoin."
  }
]`;
}

// Exporter les fonctions pour les rendre disponibles
window.aiIntegration = {
  getFinancialInstrumentsFromPerplexity,
  generatePortfolioWithClaude,
  parsePerplexityResponse,
  prepareClaudePromptWithInstruments,
  extractJSONFromText,
  extractPortfolioManually,
  addTimestampToReasons
};
