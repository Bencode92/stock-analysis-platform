// Module d'intégration Perplexity pour TradePulse
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
  const bonds = [];  // Ajout pour les obligations
  
  // Fonction utilitaire pour parser une ligne
  function parseLine(line, collection, type) {
    if (!line.trim()) return;
    
    // Regex pour extraire le nom, le symbole et l'info
    const match = line.match(/- (.*?) \((.*?)\): (.*)/) || line.match(/- (.*?) \[(.*?)\]: (.*)/);
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
    } else if (section.trim().startsWith('BONDS:') || section.trim().startsWith('OBLIGATIONS:')) {
      // Parser la section BONDS/OBLIGATIONS
      const lines = section.split('\n').slice(1); // Ignorer l'en-tête
      lines.forEach(line => parseLine(line, bonds, 'bond'));
    }
  }
  
  return {
    stocks,
    etfs,
    cryptos,
    bonds
  };
}

// Générer les 3 types de portefeuilles avec Perplexity au lieu de Claude
async function generatePortfoliosWithPerplexity(newsData, sectorData, financialInstruments) {
  // Préparer le prompt pour Perplexity
  const prompt = preparePerplexityPromptForPortfolios(newsData, sectorData, financialInstruments);
  
  console.log("Envoi du prompt à Perplexity pour générer les portefeuilles:", prompt.substring(0, 200) + "...");
  
  try {
    // Utiliser Perplexity
    // Dans une implémentation réelle, utiliser l'API Perplexity
    // Pour ce MVP, nous simulons une réponse Perplexity
    const response = simulatePerplexityPortfolioResponse(newsData, sectorData, financialInstruments);
    
    console.log("Réponse brute de Perplexity:", response.substring(0, 200) + "...");
    
    // Tenter d'extraire le JSON de la réponse
    try {
      // Extraire les différents portefeuilles
      const portfolios = extractPortfoliosFromText(response);
      
      if (portfolios && Object.keys(portfolios).length > 0) {
        // Ajouter un horodatage aux raisons
        for (const profile in portfolios) {
          portfolios[profile] = addTimestampToReasons(portfolios[profile]);
        }
        return portfolios;
      } else {
        throw new Error("Format de portefeuille non valide");
      }
    } catch (parseError) {
      console.error("Erreur d'analyse de la réponse Perplexity:", parseError);
      
      // Si l'extraction JSON échoue, essayer le fallback
      return generateFallbackPortfolios(financialInstruments);
    }
  } catch (error) {
    console.error("Erreur lors de l'appel à Perplexity:", error);
    throw error;
  }
}

// Préparer le prompt pour Perplexity pour générer les 3 types de portefeuilles
function preparePerplexityPromptForPortfolios(newsData, sectorData, financialInstruments) {
  // Extraire les informations pertinentes des actualités
  const newsContext = newsData.map(news => 
    `- ${news.title} (${news.source}): ${news.summary}`
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
  
  const bondsInfo = financialInstruments.bonds ? financialInstruments.bonds.map(bond => 
    `- ${bond.name} (${bond.symbol}): ${bond.info}`
  ).join('\n') : "";
  
  // Obtenir la date actuelle pour des recommandations fraîches
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR');
  const timeStr = now.toLocaleTimeString('fr-FR');
  
  // Construire le prompt complet pour générer 3 types de portefeuilles
  return `En tant qu'analyste financier expert, tu dois créer TROIS portefeuilles d'investissement optimisés pour ${dateStr} à ${timeStr} en te basant sur les données ci-dessous.

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
${bondsInfo ? '\nOBLIGATIONS:\n' + bondsInfo : ''}

Consignes:
Tu vas créer 3 portefeuilles distincts:
1) Un portefeuille AGRESSIF visant une croissance maximale, avec une forte exposition aux secteurs en croissance et aux actifs à haut risque
2) Un portefeuille MODÉRÉ équilibré entre croissance et stabilité
3) Un portefeuille STABLE à faible risque, privilégiant la préservation du capital et les dividendes

Pour chaque portefeuille:
- Choisis uniquement parmi les instruments listés ci-dessus
- Pour chaque instrument, détermine un pourcentage d'allocation approprié
- Justifie brièvement chaque choix en lien avec les actualités RÉCENTES ou tendances sectorielles ACTUELLES
- Chaque portefeuille doit totaliser exactement 100%

Réponds en utilisant le format JSON suivant:
{
  "agressif": [
    {
      "name": "Nom de l'instrument",
      "symbol": "SYMBOLE",
      "type": "stock/etf/crypto/bond",
      "allocation": XX,
      "reason": "Justification liée à l'actualité récente"
    },
    ...
  ],
  "modere": [
    {
      "name": "Nom de l'instrument",
      "symbol": "SYMBOLE",
      "type": "stock/etf/crypto/bond",
      "allocation": XX,
      "reason": "Justification liée à l'actualité récente"
    },
    ...
  ],
  "stable": [
    {
      "name": "Nom de l'instrument",
      "symbol": "SYMBOLE",
      "type": "stock/etf/crypto/bond",
      "allocation": XX,
      "reason": "Justification liée à l'actualité récente"
    },
    ...
  ]
}`;
}

// Fonction pour extraire les portefeuilles de la réponse
function extractPortfoliosFromText(text) {
  try {
    // Rechercher un objet JSON dans le texte
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
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

// Générer des portefeuilles de secours en cas d'échec
function generateFallbackPortfolios(financialInstruments) {
  // Trier par type
  const stocks = financialInstruments.stocks || [];
  const etfs = financialInstruments.etfs || [];
  const cryptos = financialInstruments.cryptos || [];
  const bonds = financialInstruments.bonds || [];
  
  // Horodatage pour les raisons
  const now = new Date();
  const timeStr = now.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // Portefeuille agressif
  const agressif = [];
  
  // Priorité aux actions tech et crypto
  let allocations = [];
  stocks.slice(0, 4).forEach(stock => {
    if (stock.info.toLowerCase().includes('tech') || 
        stock.info.toLowerCase().includes('ia') || 
        stock.info.toLowerCase().includes('intelligence artificielle') ||
        stock.name.toLowerCase().includes('nvidia') ||
        stock.name.toLowerCase().includes('tesla')) {
      allocations.push(Math.floor(Math.random() * 10) + 10); // 10-20%
    } else {
      allocations.push(Math.floor(Math.random() * 5) + 5); // 5-10%
    }
  });
  
  // Ajuster pour atteindre ~65% en actions
  const totalStocks = allocations.reduce((a, b) => a + b, 0);
  if (totalStocks < 65) {
    const factor = 65 / totalStocks;
    allocations = allocations.map(a => Math.round(a * factor));
  }
  
  // Ajouter les actions au portefeuille
  stocks.slice(0, 4).forEach((stock, i) => {
    agressif.push({
      name: stock.name,
      symbol: stock.symbol,
      type: 'stock',
      allocation: allocations[i],
      reason: `${stock.info} (Analyse à ${timeStr})`
    });
  });
  
  // Ajouter des ETF (15%)
  const etfAllocation = 15 / Math.min(2, etfs.length);
  etfs.slice(0, 2).forEach(etf => {
    agressif.push({
      name: etf.name,
      symbol: etf.symbol,
      type: 'etf',
      allocation: Math.round(etfAllocation),
      reason: `${etf.info} (Analyse à ${timeStr})`
    });
  });
  
  // Ajouter des crypto (20%)
  const cryptoAllocation = 20 / Math.min(2, cryptos.length);
  cryptos.slice(0, 2).forEach(crypto => {
    agressif.push({
      name: crypto.name,
      symbol: crypto.symbol,
      type: 'crypto',
      allocation: Math.round(cryptoAllocation),
      reason: `${crypto.info} (Analyse à ${timeStr})`
    });
  });
  
  // Portefeuille modéré
  const modere = [];
  
  // 40% actions
  const stockAllocModere = 40 / Math.min(4, stocks.length);
  stocks.slice(0, 4).forEach(stock => {
    modere.push({
      name: stock.name,
      symbol: stock.symbol,
      type: 'stock',
      allocation: Math.round(stockAllocModere),
      reason: `Allocation équilibrée dans une valeur de qualité: ${stock.info} (Analyse à ${timeStr})`
    });
  });
  
  // 40% ETF
  const etfAllocModere = 40 / Math.min(3, etfs.length);
  etfs.slice(0, 3).forEach(etf => {
    modere.push({
      name: etf.name,
      symbol: etf.symbol,
      type: 'etf',
      allocation: Math.round(etfAllocModere),
      reason: `Diversification sectorielle: ${etf.info} (Analyse à ${timeStr})`
    });
  });
  
  // 10% crypto
  const cryptoAllocModere = 10 / Math.min(1, cryptos.length);
  cryptos.slice(0, 1).forEach(crypto => {
    modere.push({
      name: crypto.name,
      symbol: crypto.symbol,
      type: 'crypto',
      allocation: Math.round(cryptoAllocModere),
      reason: `Exposition mesurée: ${crypto.info} (Analyse à ${timeStr})`
    });
  });
  
  // 10% obligations
  const bondAllocModere = 10 / Math.max(1, bonds.length);
  if (bonds.length > 0) {
    bonds.slice(0, 1).forEach(bond => {
      modere.push({
        name: bond.name,
        symbol: bond.symbol,
        type: 'bond',
        allocation: Math.round(bondAllocModere),
        reason: `Stabilité et réduction du risque global: ${bond.info} (Analyse à ${timeStr})`
      });
    });
  } else {
    // Si pas d'obligations, ajouter un ETF
    if (etfs.length > 3) {
      const safeEtf = etfs[3];
      modere.push({
        name: safeEtf.name,
        symbol: safeEtf.symbol,
        type: 'etf',
        allocation: 10,
        reason: `Substitut d'obligations pour la stabilité: ${safeEtf.info} (Analyse à ${timeStr})`
      });
    } else {
      // Distribuer aux actions existantes
      modere.forEach(asset => {
        if (asset.type === 'stock') {
          asset.allocation += Math.round(10 / (modere.filter(a => a.type === 'stock').length));
        }
      });
    }
  }
  
  // Portefeuille stable
  const stable = [];
  
  // 20% actions défensives
  const stockAllocStable = 20 / Math.min(2, stocks.length);
  stocks.slice(0, 2).forEach(stock => {
    stable.push({
      name: stock.name,
      symbol: stock.symbol,
      type: 'stock',
      allocation: Math.round(stockAllocStable),
      reason: `Valeur défensive avec bon historique: ${stock.info} (Analyse à ${timeStr})`
    });
  });
  
  // 40% ETF
  const etfAllocStable = 40 / Math.min(3, etfs.length);
  etfs.slice(0, 3).forEach(etf => {
    stable.push({
      name: etf.name,
      symbol: etf.symbol,
      type: 'etf',
      allocation: Math.round(etfAllocStable),
      reason: `Diversification maximale pour réduire la volatilité: ${etf.info} (Analyse à ${timeStr})`
    });
  });
  
  // 40% obligations
  if (bonds.length > 0) {
    const bondAllocStable = 40 / Math.min(3, bonds.length);
    bonds.slice(0, 3).forEach(bond => {
      stable.push({
        name: bond.name,
        symbol: bond.symbol,
        type: 'bond',
        allocation: Math.round(bondAllocStable),
        reason: `Sécurité et rendement régulier: ${bond.info} (Analyse à ${timeStr})`
      });
    });
  } else {
    // Sans obligations, allouer aux ETF les plus stables
    const extraEtfAlloc = 40 / Math.min(2, etfs.length - 3);
    etfs.slice(3, 5).forEach(etf => {
      stable.push({
        name: etf.name,
        symbol: etf.symbol,
        type: 'etf',
        allocation: Math.round(extraEtfAlloc),
        reason: `Stabilité et préservation du capital: ${etf.info} (Analyse à ${timeStr})`
      });
    });
  }
  
  // Ajuster les totaux pour atteindre exactement 100%
  const adjustAllocation = (portfolio) => {
    const total = portfolio.reduce((sum, asset) => sum + asset.allocation, 0);
    if (total !== 100) {
      const diff = 100 - total;
      // Répartir la différence sur tous les actifs
      const assetCount = portfolio.length;
      let remaining = diff;
      
      for (let i = 0; i < assetCount && remaining !== 0; i++) {
        const adjustment = remaining > 0 ? 1 : -1;
        portfolio[i].allocation += adjustment;
        remaining -= adjustment;
      }
    }
    return portfolio;
  };
  
  return {
    agressif: adjustAllocation(agressif),
    modere: adjustAllocation(modere),
    stable: adjustAllocation(stable)
  };
}

// Fonction simulant une réponse de Perplexity pour des actualités récentes
function simulatePerplexityResponse(newsData) {
  // Cette fonction est simplifiée pour cet exemple
  // Pour une implémentation complète, voir le fichier app.js original
  
  return `ETF:
- Invesco QQQ Trust (QQQ): Impacté positivement par les records de Nvidia annoncés aujourd'hui, suivant la tendance bullish actuelle de la tech.
- iShares Global Clean Energy ETF (ICLN): Une réponse directe aux initiatives de transition énergétique mentionnées dans les actualités d'hier.
- SPDR S&P 500 ETF Trust (SPY): Alternative de diversification face aux incertitudes économiques signalées par la BCE cette semaine.
- Vanguard Total Bond Market ETF (BND): Protection contre la volatilité du marché dans le contexte actuel d'incertitude.

STOCKS:
- NVIDIA Corporation (NVDA): Le titre vient d'atteindre un nouveau sommet historique selon Bloomberg aujourd'hui, porté par des prévisions optimistes sur la demande de puces IA.
- Tesla, Inc. (TSLA): L'annonce d'hier sur l'augmentation de production dans la gigafactory de Berlin crée une opportunité immédiate.
- Amazon.com, Inc. (AMZN): Sa nouvelle stratégie logistique dévoilée cette semaine promet d'impacter positivement ses performances à court terme.
- Microsoft Corporation (MSFT): Position dominante dans le cloud et l'IA, profitant des nouvelles annonces sur l'adoption de l'IA.
- Johnson & Johnson (JNJ): Valeur défensive dans un contexte d'incertitude économique après les annonces de la BCE.

CRYPTO:
- Bitcoin (BTC): Les commentaires de la SEC cette semaine ont provoqué un rebond significatif, créant une dynamique haussière immédiate.
- Ethereum (ETH): Suit la tendance haussière du Bitcoin actuellement, avec des perspectives positives pour les 7 prochains jours.

OBLIGATIONS:
- iShares 20+ Year Treasury Bond ETF (TLT): Protection contre l'incertitude économique signalée par la BCE.
- iShares iBoxx $ Investment Grade Corporate Bond ETF (LQD): Rendement stable dans un contexte de politique monétaire changeante.`;
}

// Fonction simulant une réponse de Perplexity pour les portefeuilles
function simulatePerplexityPortfolioResponse(newsData, sectorData, financialInstruments) {
  // Cette simulation reflète comment Perplexity répondrait avec 3 portefeuilles différents
  return `{
  "agressif": [
    {
      "name": "NVIDIA Corporation",
      "symbol": "NVDA",
      "type": "stock",
      "allocation": 25,
      "reason": "Leader incontesté des puces IA avec un nouveau record historique selon les actualités du jour, bénéficiant directement de la demande croissante pour l'IA."
    },
    {
      "name": "Tesla, Inc.",
      "symbol": "TSLA",
      "type": "stock",
      "allocation": 22,
      "reason": "L'augmentation de production dans la gigafactory de Berlin annoncée cette semaine crée une opportunité immédiate dans un secteur haussier."
    },
    {
      "name": "Amazon.com, Inc.",
      "symbol": "AMZN",
      "type": "stock",
      "allocation": 18,
      "reason": "Sa nouvelle stratégie logistique annoncée cette semaine promet d'améliorer ses performances à court terme."
    },
    {
      "name": "Invesco QQQ Trust",
      "symbol": "QQQ",
      "type": "etf",
      "allocation": 10,
      "reason": "Exposition aux grandes entreprises technologiques qui bénéficient de la tendance haussière actuelle du secteur tech."
    },
    {
      "name": "iShares Global Clean Energy ETF",
      "symbol": "ICLN",
      "type": "etf",
      "allocation": 8,
      "reason": "Profite des initiatives de transition énergétique mentionnées dans les actualités récentes."
    },
    {
      "name": "Bitcoin",
      "symbol": "BTC",
      "type": "crypto",
      "allocation": 12,
      "reason": "Le rebond significatif suite aux commentaires de la SEC cette semaine crée une opportunité tactique à court terme."
    },
    {
      "name": "Ethereum",
      "symbol": "ETH",
      "type": "crypto",
      "allocation": 5,
      "reason": "Bénéficie actuellement du développement des applications décentralisées et suit la tendance haussière récente du Bitcoin."
    }
  ],
  "modere": [
    {
      "name": "Microsoft Corporation",
      "symbol": "MSFT",
      "type": "stock",
      "allocation": 15,
      "reason": "Position dominante dans le cloud et l'IA, profitant de la tendance haussière du secteur technologique avec un profil de risque modéré."
    },
    {
      "name": "Amazon.com, Inc.",
      "symbol": "AMZN",
      "type": "stock",
      "allocation": 12,
      "reason": "Sa nouvelle stratégie logistique dévoilée cette semaine et sa diversification sectorielle offrent un bon équilibre risque/rendement."
    },
    {
      "name": "NVIDIA Corporation",
      "symbol": "NVDA",
      "type": "stock",
      "allocation": 10,
      "reason": "Exposition limitée au leader des puces IA pour bénéficier de la croissance sans surpondération."
    },
    {
      "name": "SPDR S&P 500 ETF Trust",
      "symbol": "SPY",
      "type": "etf",
      "allocation": 20,
      "reason": "Diversification large sur le marché américain pour réduire la volatilité globale du portefeuille."
    },
    {
      "name": "Invesco QQQ Trust",
      "symbol": "QQQ",
      "type": "etf",
      "allocation": 15,
      "reason": "Exposition contrôlée au secteur technologique pour capturer la croissance sans risque excessif."
    },
    {
      "name": "iShares 20+ Year Treasury Bond ETF",
      "symbol": "TLT",
      "type": "bond",
      "allocation": 15,
      "reason": "Protection contre la volatilité des marchés actions dans un contexte d'incertitude économique."
    },
    {
      "name": "iShares iBoxx $ Investment Grade Corporate Bond ETF",
      "symbol": "LQD",
      "type": "bond",
      "allocation": 8,
      "reason": "Rendements supérieurs aux bons du Trésor avec un risque modéré."
    },
    {
      "name": "Bitcoin",
      "symbol": "BTC",
      "type": "crypto",
      "allocation": 5,
      "reason": "Exposition limitée pour diversification, suite aux commentaires positifs de la SEC cette semaine."
    }
  ],
  "stable": [
    {
      "name": "Johnson & Johnson",
      "symbol": "JNJ",
      "type": "stock",
      "allocation": 15,
      "reason": "Valeur défensive peu corrélée aux turbulences du marché, offrant stabilité et dividendes dans un contexte d'incertitude."
    },
    {
      "name": "Microsoft Corporation",
      "symbol": "MSFT",
      "type": "stock",
      "allocation": 10,
      "reason": "Entreprise à forte capitalisation avec solides fondamentaux et flux de trésorerie stable, offrant à la fois sécurité et croissance modérée."
    },
    {
      "name": "SPDR S&P 500 ETF Trust",
      "symbol": "SPY",
      "type": "etf",
      "allocation": 15,
      "reason": "Exposition large au marché avec une volatilité moindre que les secteurs individuels."
    },
    {
      "name": "Vanguard Total Bond Market ETF",
      "symbol": "BND",
      "type": "bond",
      "allocation": 25,
      "reason": "Large diversification obligataire offrant stabilité et préservation du capital dans le contexte actuel."
    },
    {
      "name": "iShares 20+ Year Treasury Bond ETF",
      "symbol": "TLT",
      "type": "bond",
      "allocation": 20,
      "reason": "Protection maximale contre l'incertitude des marchés, particulièrement utile suite aux annonces récentes de la BCE."
    },
    {
      "name": "iShares iBoxx $ Investment Grade Corporate Bond ETF",
      "symbol": "LQD",
      "type": "bond",
      "allocation": 15,
      "reason": "Rendement prévisible avec risque limité grâce aux obligations d'entreprises de qualité."
    }
  ]
}`;
}

// Exporter les fonctions pour les rendre disponibles
window.aiIntegration = {
  getFinancialInstrumentsFromPerplexity,
  generatePortfoliosWithPerplexity,
  parsePerplexityResponse,
  preparePerplexityPromptForPortfolios,
  extractPortfoliosFromText,
  addTimestampToReasons
};
