/**
 * Script pour visualiser les résultats de test avec Puppeteer
 * 
 * Utilisation:
 * 1. Installer Puppeteer: npm install puppeteer
 * 2. Exécuter: node puppeteer_visualize.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Chemin vers le dossier des résultats
const RESULTS_DIR = path.join(__dirname, 'test_results');
const HTML_FILE = path.join(RESULTS_DIR, 'visualize_results.html');

// Fonction principale
async function main() {
    console.log("🚀 Démarrage de la visualisation avec Puppeteer...");
    
    // Vérifier si le fichier HTML existe
    if (!fs.existsSync(HTML_FILE)) {
        console.error(`❌ Fichier HTML non trouvé: ${HTML_FILE}`);
        return;
    }
    
    // Trouver le fichier JSON le plus récent
    const jsonFiles = fs.readdirSync(RESULTS_DIR)
        .filter(file => file.startsWith('impact_test_results_') && file.endsWith('.json'))
        .sort()
        .reverse();
    
    if (jsonFiles.length === 0) {
        console.error("❌ Aucun fichier de résultats trouvé.");
        return;
    }
    
    const latestJson = jsonFiles[0];
    console.log(`📊 Fichier de résultats le plus récent: ${latestJson}`);
    
    // Copier le fichier vers impact_test_results_latest.json
    const latestJsonPath = path.join(RESULTS_DIR, latestJson);
    const copyPath = path.join(RESULTS_DIR, 'impact_test_results_latest.json');
    
    try {
        fs.copyFileSync(latestJsonPath, copyPath);
        console.log(`✅ Copié vers: ${copyPath}`);
    } catch (error) {
        console.error(`❌ Erreur lors de la copie: ${error.message}`);
    }
    
    try {
        // Lancer le navigateur
        const browser = await puppeteer.launch({
            headless: false,  // Afficher le navigateur
            defaultViewport: { width: 1200, height: 800 }
        });
        
        // Ouvrir une nouvelle page
        const page = await browser.newPage();
        
        // Aller à la page HTML
        const fileUrl = `file://${HTML_FILE}`;
        console.log(`🌐 Ouverture de: ${fileUrl}`);
        await page.goto(fileUrl);
        
        // Attendre que la page soit chargée
        await page.waitForTimeout(2000);
        
        // Prendre une capture d'écran
        const screenshotPath = path.join(RESULTS_DIR, 'test_results_screenshot.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Capture d'écran enregistrée: ${screenshotPath}`);
        
        // Gardez le navigateur ouvert pour que l'utilisateur puisse interagir
        console.log("✅ Visualisation terminée. Le navigateur reste ouvert pour interaction.");
        console.log("👉 Fermez manuellement le navigateur quand vous avez terminé.");
        
        // Attendre que l'utilisateur ferme le navigateur
        await browser.waitForTarget(() => false);
    } catch (error) {
        console.error(`❌ Erreur: ${error.message}`);
    }
}

// Exécuter le script
main();
