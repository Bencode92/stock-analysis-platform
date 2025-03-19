/**
 * feedback-endpoint.js - Point d'entrée API pour les feedbacks ML
 * Ce fichier peut être utilisé avec Netlify Functions, Vercel Serverless, etc.
 * 
 * Pour utiliser avec Netlify Functions, placez-le dans le dossier netlify/functions/
 * Pour utiliser avec Vercel, placez-le dans le dossier api/
 */

// Import pour les API GitHub
const { Octokit } = require("@octokit/rest");

// Configuration GitHub
const GITHUB_REPO = 'stock-analysis-platform';
const GITHUB_OWNER = 'Bencode92';
const GITHUB_TOKEN = process.env.ML_GITHUB_TOKEN;

// Handler principal - Doit être adapté selon la plateforme serverless utilisée
module.exports = async (req, res) => {
  // Vérifier la méthode HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  try {
    // Récupérer les données du feedback
    const feedback = req.body;
    
    if (!feedback || !feedback.id || !feedback.title) {
      return res.status(400).json({ error: 'Données de feedback invalides' });
    }
    
    // Créer le client GitHub avec le token
    const octokit = new Octokit({
      auth: GITHUB_TOKEN
    });
    
    // Générer un nom de fichier unique
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `data/feedback_requests/request_${timestamp}.json`;
    
    // Créer le fichier directement sur GitHub
    const result = await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: filename,
      message: `Demande de feedback ML: ${feedback.title.substring(0, 50)}`,
      content: Buffer.from(JSON.stringify(feedback, null, 2)).toString('base64'),
      branch: 'main'
    });
    
    console.log(`✅ Feedback enregistré dans ${filename}`);
    
    // Renvoyer une réponse de succès
    return res.status(200).json({ 
      success: true,
      message: 'Feedback enregistré avec succès',
      sha: result.data.commit.sha
    });
    
  } catch (error) {
    console.error('❌ Erreur lors du traitement du feedback:', error);
    
    return res.status(500).json({
      error: 'Erreur serveur lors du traitement du feedback',
      message: error.message
    });
  }
};

// Si vous utilisez Vercel, le code ci-dessous est nécessaire
// export default async function handler(req, res) {
//   return module.exports(req, res);
// }
