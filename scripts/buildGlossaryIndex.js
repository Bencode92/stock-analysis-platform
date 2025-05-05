/**
 * Script de génération de l'index du glossaire
 * 
 * Version simplifiée qui n'utilise PAS legal-terms.json
 * Ce script extrait uniquement les termes de question-data.js
 * pour créer un index du glossaire indépendant.
 * 
 * Usage: node scripts/buildGlossaryIndex.js
 */

const fs = require('fs');
const path = require('path');

// Helpers -------------
function toId(s) {
  if (!s || typeof s !== 'string') return '';
  
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // enlève les accents
    .trim()
    .replace(/\s+/g, '_')            // espaces -> underscore
    .replace(/[^\w_]/g, '');         // garde uniquement les caractères alphanumériques
}

// Chemins des fichiers
const questionDataPath = path.resolve(__dirname, '../js/question-data.js');
const outputPath = path.resolve(__dirname, '../data/glossary-index.json');

console.log('🔍 Analyse des termes potentiels dans question-data.js...');

try {
  // Vérifier si le fichier question-data.js existe
  if (!fs.existsSync(questionDataPath)) {
    throw new Error(`Fichier question-data.js non trouvé: ${questionDataPath}`);
  }
  
  console.log(`✓ Fichier question-data.js trouvé: ${questionDataPath}`);
  
  // Lire le contenu de question-data.js comme une chaîne
  const questionDataContent = fs.readFileSync(questionDataPath, 'utf8');
  
  // Approche simplifiée : extraire tous les textes pertinents directement
  
  // 1) Extraire tous les identifiants (IDs)
  const idMatches = questionDataContent.match(/id:\s*["']([^"']+)["']/g) || [];
  const ids = idMatches.map(match => match.replace(/id:\s*["']|["']/g, ''));
  
  // 2) Extraire les titres
  const titleMatches = questionDataContent.match(/title:\s*["']([^"']+)["']/g) || [];
  const titles = titleMatches.map(match => match.replace(/title:\s*["']|["']/g, ''));
  
  // 3) Extraire les descriptions
  const descMatches = questionDataContent.match(/description:\s*["']([^"']+)["']/g) || [];
  const descriptions = descMatches.map(match => match.replace(/description:\s*["']|["']/g, ''));
  
  // 4) Extraire les labels d'options
  const labelMatches = questionDataContent.match(/label:\s*["']([^"']+)["']/g) || [];
  const labels = labelMatches.map(match => match.replace(/label:\s*["']|["']/g, ''));
  
  // Fusionner tous les textes extraits
  const allTexts = [...ids, ...titles, ...descriptions, ...labels];
  
  console.log(`✓ ${allTexts.length} textes extraits des questions`);
  
  // 5) Les transforme en tokens « mots » (split sur espace & ponctuation)
  const candidateSet = new Set();
  
  // Ajouter les IDs directement (ils sont probablement déjà au bon format)
  ids.forEach(id => {
    const processedId = toId(id);
    if (processedId.length > 2) candidateSet.add(processedId);
  });
  
  // Traiter tous les textes
  allTexts.forEach(txt => {
    if (!txt) return;
    
    // Extraire des segments de mots (potentiellement multi-mots)
    const segments = txt.split(/[,.;:!?()[\]{}«»""''\/\\|<>~`#$%^&*=+]/);
    
    for (const segment of segments) {
      if (segment.trim().length < 3) continue;
      
      // Ajouter le segment complet (pour les termes multi-mots)
      if (segment.split(/\s+/).length > 1) {
        const id = toId(segment);
        if (id.length > 2) candidateSet.add(id);
      }
      
      // Ajouter les mots individuels
      segment.split(/\s+/).forEach(word => {
        const id = toId(word);
        if (id.length > 2) candidateSet.add(id);
      });
    }
  });
  
  console.log(`✓ ${candidateSet.size} termes candidats extraits`);
  
  // 6) Créer l'index du glossaire (sans vérification dans legal-terms.json)
  const glossaryIndex = [...candidateSet].filter(term => term.length > 2).sort();
  
  // 7) Créer le dossier data s'il n'existe pas
  const dataDir = path.dirname(outputPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`✓ Dossier créé: ${dataDir}`);
  }
  
  // 8) Écrit le fichier d'index
  fs.writeFileSync(
    outputPath,
    JSON.stringify(glossaryIndex, null, 2),
    'utf8'
  );
  
  console.log(`✅ Glossary index généré avec succès : ${glossaryIndex.length} termes`);
  console.log(`   Fichier créé : ${outputPath}`);
  
} catch (error) {
  console.error(`❌ Erreur lors de la génération de l'index du glossaire: ${error.message}`);
  console.error(error);
  process.exit(1);
}
