/**
 * Script de génération de l'index du glossaire
 * 
 * Ce script analyse le contenu de question-data.js pour extraire tous les termes potentiels,
 * et vérifie lesquels ont une définition dans legal-terms.json.
 * Il génère ensuite un petit fichier d'index contenant uniquement les IDs des termes valides.
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
const legalTermsPath = path.resolve(__dirname, '../data/legal-terms.json');
const outputPath = path.resolve(__dirname, '../data/glossary-index.json');

console.log('🔍 Analyse des termes potentiels dans question-data.js...');

try {
  // Lire le contenu de question-data.js comme une chaîne
  const questionDataContent = fs.readFileSync(questionDataPath, 'utf8');
  
  // Extraire les questions avec une regex
  const questionObjects = questionDataContent.match(/{\s*id:\s*["']([^"']+)["'],[\s\S]*?}/g) || [];
  
  // 1) Ratisse toutes les chaînes potentielles
  const titles = [];
  
  for (const questionStr of questionObjects) {
    // Extraire le titre
    const titleMatch = questionStr.match(/title:\s*["']([^"']+)["']/);
    if (titleMatch && titleMatch[1]) titles.push(titleMatch[1]);
    
    // Extraire la description
    const descMatch = questionStr.match(/description:\s*["']([^"']+)["']/);
    if (descMatch && descMatch[1]) titles.push(descMatch[1]);
    
    // Extraire les options (plus complexe)
    const optionsMatch = questionStr.match(/options:\s*\[([\s\S]*?)\]/);
    if (optionsMatch && optionsMatch[1]) {
      const optionsStr = optionsMatch[1];
      const optionLabelMatches = optionsStr.match(/label:\s*["']([^"']+)["']/g) || [];
      
      for (const labelMatch of optionLabelMatches) {
        const label = labelMatch.match(/label:\s*["']([^"']+)["']/);
        if (label && label[1]) titles.push(label[1]);
      }
    }
  }
  
  console.log(`✓ ${titles.length} textes extraits des questions`);
  
  // 2) Les transforme en tokens « mots » (split sur espace & ponctuation)
  const candidateSet = new Set();
  titles.forEach(txt => {
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
  
  // 3) Garde ceux qui existent dans le JSON
  const legalTerms = JSON.parse(fs.readFileSync(legalTermsPath, 'utf8'));
  const glossaryIndex = [...candidateSet].filter(id => legalTerms[id]);
  
  console.log(`✓ ${glossaryIndex.length} termes ont une définition dans legal-terms.json`);
  
  // 4) Liste des termes manquants (optionnel)
  const missing = [...candidateSet].filter(id => !legalTerms[id]);
  if (missing.length) {
    console.warn('⚠️ Définitions manquantes :', missing.join(', '));
    fs.writeFileSync(
      path.resolve(__dirname, '../report-missing-terms.txt'), 
      missing.join('\n'),
      'utf8'
    );
    console.log('✓ Liste des termes manquants écrite dans report-missing-terms.txt');
  }
  
  // 5) Écrit le fichier d'index
  fs.writeFileSync(
    outputPath,
    JSON.stringify(glossaryIndex),
    'utf8'
  );
  
  console.log(`✅ Glossary index généré avec succès : ${glossaryIndex.length} termes`);
  console.log(`   Fichier créé : ${outputPath}`);
  
} catch (error) {
  console.error('❌ Erreur lors de la génération de l\'index du glossaire:', error);
  process.exit(1);
}
