/**
 * process-feedback-requests.js
 * 
 * Script pour traiter les demandes de feedback ML et mettre à jour le fichier ml_feedback.json
 * Exécuté automatiquement via GitHub Actions
 */

const fs = require('fs');
const path = require('path');

// Chemins importants
const REQUESTS_DIR = path.join('data', 'feedback_requests');
const FEEDBACK_FILE = path.join('data', 'ml_feedback.json');

// Fonction principale
async function main() {
    console.log('🔍 Recherche des demandes de feedback...');
    
    try {
        // Vérifier si le dossier existe, sinon le créer
        if (!fs.existsSync(REQUESTS_DIR)) {
            fs.mkdirSync(REQUESTS_DIR, { recursive: true });
            console.log(`✅ Dossier ${REQUESTS_DIR} créé`);
        }
        
        // Charger le fichier ml_feedback.json existant
        let feedbackData;
        try {
            const feedbackContent = fs.readFileSync(FEEDBACK_FILE, 'utf8');
            feedbackData = JSON.parse(feedbackContent);
            console.log('✅ Fichier de feedback chargé avec succès');
        } catch (err) {
            console.log('⚠️ Fichier de feedback introuvable, création d\'un nouveau fichier');
            feedbackData = [{
                meta: {
                    version: "1.0.0",
                    lastUpdated: new Date().toISOString(),
                    feedbackCount: 0,
                    model: "finbert-v1"
                },
                feedbacks: []
            }];
        }
        
        // Lister les fichiers de demande
        const requestFiles = fs.readdirSync(REQUESTS_DIR)
            .filter(file => file.endsWith('.json'));
        
        console.log(`📋 ${requestFiles.length} demandes de feedback trouvées`);
        
        if (requestFiles.length === 0) {
            console.log('ℹ️ Aucune demande à traiter');
            return;
        }
        
        // Traiter chaque demande
        for (const file of requestFiles) {
            try {
                const filePath = path.join(REQUESTS_DIR, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const feedbackRequest = JSON.parse(content);
                
                // Ajouter le feedback à la liste
                feedbackData[0].feedbacks.push(feedbackRequest);
                
                // Supprimer le fichier de demande une fois traité
                fs.unlinkSync(filePath);
                console.log(`✅ Demande ${file} traitée et supprimée`);
            } catch (err) {
                console.error(`❌ Erreur lors du traitement de ${file}:`, err);
            }
        }
        
        // Mettre à jour les métadonnées
        feedbackData[0].meta.feedbackCount = feedbackData[0].feedbacks.length;
        feedbackData[0].meta.lastUpdated = new Date().toISOString();
        
        // Enregistrer les modifications
        fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedbackData, null, 2));
        console.log(`✅ Fichier de feedback mis à jour avec ${feedbackData[0].feedbacks.length} entrées`);
        
    } catch (error) {
        console.error('❌ Erreur lors du traitement des demandes de feedback:', error);
        process.exit(1);
    }
}

// Exécution de la fonction principale
main();
