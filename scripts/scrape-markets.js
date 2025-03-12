// Script pour extraire les données boursières de Boursorama
// À exécuter via GitHub Actions

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  sourceUrl: 'https://www.boursorama.com/bourse/indices/internationaux',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  outputPath: path.join(__dirname, '../data/markets.json'),
  // Structure des régions pour la classification des indices
  regions: {
    europe: [
      'CAC', 'DAX', 'FTSE', 'IBEX', 'MIB', 'AEX', 'BEL', 'SMI', 'ATX',
      'OMX', 'OMXS', 'ISEQ', 'PSI', 'ATHEX', 'OSEBX', 'STOXX', 'EURO'
    ],
    us: [
      'DOW', 'S&P', 'NASDAQ', 'RUSSELL', 'CBOE', 'NYSE', 'AMEX'
    ],
    asia: [
      'NIKKEI', 'HANG SENG', 'SHANGHAI', 'SHENZHEN', 'KOSPI', 'SENSEX',
      'BSE', 'TAIEX', 'STRAITS', 'JAKARTA', 'KLSE', 'KOSDAQ', 'ASX'
    ],
    other: [
      'MERVAL', 'BOVESPA', 'IPC', 'IPSA', 'COLCAP', 'BVLG', 'IBC', 'CASE',
      'ISE', 'TA', 'QE', 'FTSE/JSE', 'MOEX', 'MSX30'
    ]
  }
};

// Structure pour les données
const marketData = {
  indices: {
    europe: [],
    us: [],
    asia: [],
    other: []
  },
  meta: {
    source: 'Boursorama',
    url: CONFIG.sourceUrl,
    timestamp: new Date().toISOString(),
    count: 0,
    lastUpdated: new Date().toISOString()
  }
};

/**
 * Récupère et parse la page de Boursorama
 */
async function scrapeMarketData() {
  console.log(`🔍 Récupération des données depuis ${CONFIG.sourceUrl}...`);
  
  try {
    // Faire la requête avec un user agent réaliste
    const response = await axios.get(CONFIG.sourceUrl, {
      headers: {
        'User-Agent': CONFIG.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    
    // Vérifier la réponse
    if (response.status !== 200) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    
    const html = response.data;
    
    // Vérifier qu'on a bien récupéré du HTML
    if (!html || html.length < 1000 || !html.includes('<!DOCTYPE html>')) {
      throw new Error('Réponse HTML invalide');
    }
    
    console.log('✅ Page récupérée avec succès');
    
    // Parser le HTML avec cheerio
    const $ = cheerio.load(html);
    
    // Trouver le tableau des indices
    const tables = $('table');
    console.log(`Nombre de tableaux trouvés: ${tables.length}`);
    
    let indicesTable = null;
    
    tables.each((i, table) => {
      // Vérifier si c'est le tableau des indices
      const headers = $(table).find('th');
      const headerTexts = headers.map((i, el) => $(el).text().trim().toLowerCase()).get();
      
      if (headerTexts.some(text => 
          text.includes('indice') || 
          text.includes('dernier') || 
          text.includes('var') ||
          text.includes('variation'))) {
        indicesTable = table;
        console.log(`Table des indices trouvée (table ${i})`);
        return false; // break each loop
      }
    });
    
    if (!indicesTable) {
      throw new Error('Tableau des indices non trouvé');
    }
    
    // Extraire les données des lignes
    const rows = $(indicesTable).find('tbody tr');
    console.log(`Nombre de lignes trouvées: ${rows.length}`);
    
    // Parcourir les lignes et extraire les données
    rows.each((i, row) => {
      try {
        const cells = $(row).find('td');
        
        if (cells.length >= 3) {
          // Extraire le nom de l'indice
          const nameEl = $(row).find('a').first();
          let name = nameEl.length ? nameEl.text().trim() : '';
          
          // Si pas de lien, essayer la première ou deuxième cellule
          if (!name && cells.length > 0) name = $(cells[0]).text().trim();
          if (!name && cells.length > 1) name = $(cells[1]).text().trim();
          
          // Vérifier que c'est un nom d'indice valide
          if (name && name.length > 1 && !/^\d+/.test(name)) {
            // Trouver les cellules de valeur et variation
            let value = '';
            let change = '';
            let changePercent = '';
            let opening = '';
            let high = '';
            let low = '';
            
            // Parcourir les cellules pour extraire les données
            for (let i = 1; i < cells.length; i++) {
              const text = $(cells[i]).text().trim();
              
              // Si c'est un pourcentage, c'est probablement la variation en %
              if (text.includes('%') && !changePercent) {
                changePercent = text;
                continue;
              }
              
              // Si c'est un nombre avec +/-, c'est probablement la variation absolue
              if ((text.includes('+') || text.includes('-')) && !change && text.match(/[0-9]/)) {
                change = text;
                continue;
              }
              
              // Si c'est un nombre et qu'on n'a pas encore de valeur
              if (text.match(/[0-9]/) && !value) {
                value = text;
                continue;
              }
              
              // Si c'est un nombre et qu'on a déjà une valeur mais pas d'ouverture
              if (text.match(/[0-9]/) && value && !opening) {
                opening = text;
                continue;
              }
              
              // Si c'est un nombre et qu'on a déjà une valeur et une ouverture mais pas de plus haut
              if (text.match(/[0-9]/) && value && opening && !high) {
                high = text;
                continue;
              }
              
              // Si c'est un nombre et qu'on a déjà une valeur, une ouverture et un plus haut mais pas de plus bas
              if (text.match(/[0-9]/) && value && opening && high && !low) {
                low = text;
                continue;
              }
            }
            
            // Créer l'indice uniquement si on a au moins une valeur
            if (value) {
              // Déterminer la tendance (hausse/baisse)
              const trend = (change && change.includes('-')) || (changePercent && changePercent.includes('-')) 
                ? 'down' : 'up';
              
              // Créer l'objet indice
              const index = {
                name,
                value,
                change: change || '',
                changePercent: changePercent || '',
                opening: opening || '',
                high: high || '',
                low: low || '',
                trend
              };
              
              // Classer l'indice dans la bonne région
              classifyIndex(index);
            }
          }
        }
      } catch (rowError) {
        console.warn(`Erreur lors du traitement de la ligne ${i}:`, rowError);
      }
    });
    
    // Mettre à jour le compteur
    marketData.meta.count = 
      marketData.indices.europe.length + 
      marketData.indices.us.length + 
      marketData.indices.asia.length + 
      marketData.indices.other.length;
    
    console.log(`✅ Données extraites avec succès: ${marketData.meta.count} indices`);
    
    // Vérifier qu'on a assez de données
    if (marketData.meta.count < 10) {
      throw new Error(`Trop peu d'indices trouvés: ${marketData.meta.count}`);
    }
    
    // Enregistrer les données dans un fichier JSON
    saveMarketData();
    
    return true;
  } catch (error) {
    console.error('❌ Erreur lors de l\'extraction des données:', error);
    throw error;
  }
}

/**
 * Classe un indice dans la bonne région
 */
function classifyIndex(index) {
  // Convertir le nom en majuscules pour faciliter la comparaison
  const name = index.name.toUpperCase();
  
  // Vérifier chaque région
  for (const [region, keywords] of Object.entries(CONFIG.regions)) {
    if (keywords.some(keyword => name.includes(keyword))) {
      marketData.indices[region].push(index);
      return;
    }
  }
  
  // Par défaut, ajouter à "other"
  marketData.indices.other.push(index);
}

/**
 * Enregistre les données dans un fichier JSON
 */
function saveMarketData() {
  // Créer le dossier data s'il n'existe pas
  const dataDir = path.dirname(CONFIG.outputPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Écrire le fichier JSON
  fs.writeFileSync(
    CONFIG.outputPath, 
    JSON.stringify(marketData, null, 2)
  );
  
  console.log(`✅ Données enregistrées dans ${CONFIG.outputPath}`);
}

// Point d'entrée principal
async function main() {
  try {
    await scrapeMarketData();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  }
}

// Exécuter le script
main();