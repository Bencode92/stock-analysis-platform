// scraper.js - Script Node.js pour extraire les données de Boursorama avec Puppeteer
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const BOURSORAMA_URL = 'https://www.boursorama.com/bourse/indices/internationaux';
const OUTPUT_FILE = path.join(__dirname, 'indices_data.json');
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes en millisecondes

async function scrapeMarketIndices() {
    console.log('Démarrage de l\'extraction des indices boursiers...');
    
    // Vérifier si les données en cache sont récentes
    if (fs.existsSync(OUTPUT_FILE)) {
        const stats = fs.statSync(OUTPUT_FILE);
        const fileModTime = new Date(stats.mtime).getTime();
        const now = Date.now();
        
        if (now - fileModTime < CACHE_DURATION) {
            console.log('Utilisation des données en cache (moins de 15 minutes)');
            return JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
        }
    }
    
    // Lancer le navigateur
    const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        
        // Configurer le navigateur pour qu'il ressemble à un utilisateur normal
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        // Configurer l'interception des requêtes pour optimiser les performances
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            // Bloquer les ressources non essentielles
            const resourceType = req.resourceType();
            if (resourceType === 'image' || resourceType === 'font' || resourceType === 'media') {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        // Naviguer vers la page Boursorama
        console.log('Accès à la page Boursorama...');
        await page.goto(BOURSORAMA_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Accepter les cookies si nécessaire
        try {
            const cookieButtonSelector = '#didomi-notice-agree-button';
            const cookieButton = await page.$(cookieButtonSelector);
            if (cookieButton) {
                console.log('Acceptation des cookies...');
                await cookieButton.click();
                await page.waitForTimeout(1000);
            }
        } catch (error) {
            console.log('Pas de popup de cookies ou erreur:', error.message);
        }
        
        // Attendre que le tableau d'indices soit chargé
        console.log('Attente du chargement des données...');
        await page.waitForSelector('table.c-table', { timeout: 10000 });
        
        // Extraire les indices internationaux
        console.log('Extraction des données...');
        const indices = await page.evaluate(() => {
            const result = [];
            
            // Sélectionner toutes les lignes du tableau des indices
            const rows = document.querySelectorAll('table.c-table tbody tr');
            
            rows.forEach(row => {
                try {
                    // Extraire les données de chaque colonne
                    const name = row.querySelector('.c-table__cell--name')?.textContent.trim();
                    const value = row.querySelector('.c-table__cell--value')?.textContent.trim();
                    const change = row.querySelector('.c-table__cell--variation')?.textContent.trim();
                    const changePercent = row.querySelector('.c-table__cell--variation-percent')?.textContent.trim();
                    const opening = row.querySelector('.c-table__cell--open')?.textContent.trim();
                    const high = row.querySelector('.c-table__cell--high')?.textContent.trim();
                    const low = row.querySelector('.c-table__cell--low')?.textContent.trim();
                    
                    // Déterminer la tendance (hausse ou baisse)
                    const trend = row.querySelector('.c-table__cell--variation-percent')?.classList.contains('c-table__cell--down') 
                        ? 'down' 
                        : 'up';
                    
                    // Extraire le ticker/symbole (dans l'URL)
                    const linkElement = row.querySelector('.c-table__cell--name a');
                    const href = linkElement?.getAttribute('href') || '';
                    const tickerMatch = href.match(/([^\/]+)$/);
                    const ticker = tickerMatch ? tickerMatch[1] : '';
                    
                    if (name && value) {
                        result.push({
                            name,
                            ticker,
                            value,
                            change,
                            changePercent,
                            opening,
                            high,
                            low,
                            trend
                        });
                    }
                } catch (err) {
                    console.error('Erreur lors de l\'extraction d\'une ligne:', err);
                }
            });
            
            return result;
        });
        
        // Grouper les indices par régions
        const groupedIndices = {
            europe: indices.filter(index => 
                index.name.includes('CAC') || 
                index.name.includes('DAX') || 
                index.name.includes('FTSE') ||
                index.name.includes('STOXX') ||
                index.name.includes('AEX') ||
                index.name.includes('IBEX') ||
                index.name.includes('SMI')
            ),
            us: indices.filter(index => 
                index.name.includes('DOW') || 
                index.name.includes('S&P') || 
                index.name.includes('NASDAQ') ||
                index.name.includes('NYSE')
            ),
            asia: indices.filter(index => 
                index.name.includes('NIKKEI') || 
                index.name.includes('HANG') || 
                index.name.includes('SSE') ||
                index.name.includes('BSE') ||
                index.name.includes('KOSPI')
            ),
            other: indices.filter(index => 
                !index.name.includes('CAC') && 
                !index.name.includes('DAX') && 
                !index.name.includes('FTSE') &&
                !index.name.includes('STOXX') &&
                !index.name.includes('AEX') &&
                !index.name.includes('IBEX') &&
                !index.name.includes('SMI') &&
                !index.name.includes('DOW') && 
                !index.name.includes('S&P') && 
                !index.name.includes('NASDAQ') &&
                !index.name.includes('NYSE') &&
                !index.name.includes('NIKKEI') && 
                !index.name.includes('HANG') && 
                !index.name.includes('SSE') &&
                !index.name.includes('BSE') &&
                !index.name.includes('KOSPI')
            )
        };
        
        // Ajouter des métadonnées
        const results = {
            indices: groupedIndices,
            meta: {
                source: 'Boursorama',
                url: BOURSORAMA_URL,
                timestamp: new Date().toISOString(),
                count: indices.length
            }
        };
        
        // Sauvegarder les données dans un fichier JSON
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
        
        console.log(`✅ Extraction réussie: ${indices.length} indices récupérés`);
        
        return results;
    } finally {
        // Fermer le navigateur
        await browser.close();
    }
}

// Fonction pour exécuter le scraper régulièrement
async function runScheduledScraping() {
    try {
        await scrapeMarketIndices();
        console.log('Extraction terminée.');
    } catch (error) {
        console.error('Erreur lors de l\'extraction:', error);
    }
    
    // Planifier la prochaine exécution dans 15 minutes
    setTimeout(runScheduledScraping, CACHE_DURATION);
}

// Fonction pour démarrer le serveur de fichiers statiques
function startStaticServer() {
    const express = require('express');
    const app = express();
    const PORT = 3001;
    
    // Configurer CORS pour permettre l'accès depuis n'importe quelle origine
    app.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
    });
    
    // Route pour accéder aux données des indices
    app.get('/api/indices', (req, res) => {
        try {
            if (fs.existsSync(OUTPUT_FILE)) {
                const data = fs.readFileSync(OUTPUT_FILE, 'utf8');
                res.json(JSON.parse(data));
            } else {
                res.status(404).json({ error: 'Données non disponibles' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Servir les fichiers statiques du projet
    app.use(express.static(path.join(__dirname)));
    
    // Démarrer le serveur
    app.listen(PORT, () => {
        console.log(`Serveur démarré sur http://localhost:${PORT}`);
        console.log(`Accédez aux données des indices sur http://localhost:${PORT}/api/indices`);
    });
}

// Si exécuté directement (node scraper.js)
if (require.main === module) {
    // Démarrer le scraping immédiatement
    runScheduledScraping();
    
    // Démarrer le serveur de fichiers statiques
    startStaticServer();
}

module.exports = { scrapeMarketIndices };