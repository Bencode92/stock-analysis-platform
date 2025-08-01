// csv-to-json.js
// Convertit vos données CSV/TSV en JSON

const fs = require('fs').promises;
const path = require('path');

async function convertCSVtoJSON(csvFile, outputFile) {
    try {
        // Lire le fichier CSV
        const data = await fs.readFile(csvFile, 'utf8');
        
        // Séparer les lignes
        const lines = data.trim().split('\n');
        
        // Extraire les en-têtes
        const headers = ['symbol', 'name', 'name2', 'colonne3', 'currency', 'exchange', 'mic_code', 'country'];
        
        // Convertir en objets JSON
        const jsonData = [];
        
        for (let i = 1; i < lines.length; i++) {
            // Séparer par tabulation ou espaces multiples
            const values = lines[i].split(/\t|\s{2,}/);
            
            if (values.length >= 8) {
                const obj = {
                    symbol: values[0].trim(),
                    name: values[1].trim(),
                    name2: values[2].trim(),
                    currency: values[4].trim(),
                    exchange: values[5].trim(),
                    mic_code: values[6].trim(),
                    country: values[7].trim()
                };
                
                jsonData.push(obj);
            }
        }
        
        // Sauvegarder en JSON
        await fs.writeFile(outputFile, JSON.stringify(jsonData, null, 2));
        console.log(`✅ Converti ${jsonData.length} entrées`);
        console.log(`📁 Fichier créé: ${outputFile}`);
        
    } catch (error) {
        console.error('❌ Erreur:', error);
    }
}

// Usage
if (require.main === module) {
    const csvFile = process.argv[2] || 'etfs.csv';
    const outputFile = process.argv[3] || 'all_etfs.json';
    
    console.log(`📄 Conversion de ${csvFile} vers ${outputFile}...`);
    convertCSVtoJSON(csvFile, outputFile);
}

module.exports = { convertCSVtoJSON };
