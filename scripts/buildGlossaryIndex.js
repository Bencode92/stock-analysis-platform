/**
 * Script de génération de l'index du glossaire
 * 
 * Version améliorée qui combine:
 * 1. Les termes extraits de question-data.js
 * 2. Les termes définis dans legal-terms.json
 * 
 * L'objectif est de créer un glossaire complet avec les termes 
 * de l'interface utilisateur et les définitions juridiques.
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

// Fonction pour extraire spécifiquement les termes manquants
function extractSpecificMissingTerms() {
  const missingTerms = [
    // 1. Termes spécifiques liés au capital social
    'capital_social',
    'liberation_du_capital_social',
    'capital',
    'liberation',
    
    // 2. Termes liés à la comptabilité
    'comptabilite_simple',
    'comptabilite_moderee',
    'comptabilite_complete',
    'simple',
    'moderate',
    'complete',
    'outsourced',
    
    // 3. Termes d'expertise comptable
    'externalite_expert_comptable',
    'expert_comptable',
    
    // 4. Termes fiscaux
    'abattement_forfaitaire'
  ];
  
  // Versions avec espaces (sans underscores) pour certains termes complexes
  const termVariants = [
    'capital social',
    'libération du capital social',
    'comptabilité simple',
    'comptabilité modérée',
    'comptabilité complète',
    'comptabilité d\'engagement',
    'expertise comptable',
    'abattement forfaitaire'
  ];
  
  // Convertir en IDs
  const variantIds = termVariants.map(term => toId(term));
  
  // Combiner les deux listes, éliminer les doublons
  return [...new Set([...missingTerms, ...variantIds])];
}

// Fonction pour extraire des termes de la question "accounting_complexity"
function extractAccountingComplexityTerms(content) {
  const terms = [];
  
  // Trouver la question accounting_complexity
  const accountingComplexityRegex = /id:\s*["']accounting_complexity["'][\s\S]*?options:\s*\[([\s\S]*?)\]/;
  const match = content.match(accountingComplexityRegex);
  
  if (match && match[1]) {
    const optionsContent = match[1];
    
    // Extraire les IDs des options
    const optionIdMatches = optionsContent.match(/id:\s*["']([^"']+)["']/g) || [];
    optionIdMatches.forEach(match => {
      const id = match.replace(/id:\s*["']|["']/g, '');
      terms.push(id);
    });
    
    // Extraire les labels des options
    const labelMatches = optionsContent.match(/label:\s*["']([^"']+)["']/g) || [];
    labelMatches.forEach(match => {
      const label = match.replace(/label:\s*["']|["']/g, '');
      
      // Ajouter le label entier
      terms.push(toId(label));
      
      // Extraire les mots individuels significatifs
      const words = label.split(/\s+\(/)[0].split(/\s+/);
      words.forEach(word => {
        if (word.length > 3) {
          terms.push(toId(word));
        }
      });
    });
  }
  
  return terms;
}

// Fonction pour extraire des termes liés au capital
function extractCapitalTerms(content) {
  const terms = [];
  
  // Chercher les questions liées au capital
  const capitalQuestions = [
    'available_capital',
    'capital_percentage',
    'associate_current_account',
    'capital_structure',
    'progressive_contribution'
  ];
  
  // Créer une regex pour trouver ces questions et leurs descriptions
  const capitalRegexPattern = capitalQuestions
    .map(id => `id:\\s*["']${id}["'][\\s\\S]*?description:\\s*["']([^"']+)["']`)
    .join('|');
  
  const capitalRegex = new RegExp(capitalRegexPattern, 'g');
  let match;
  
  while ((match = capitalRegex.exec(content)) !== null) {
    // Extraire la description trouvée (elle sera dans l'un des groupes de capture)
    const description = match.find((group, index) => index > 0 && group);
    
    if (description) {
      // Ajouter des mots-clés spécifiques au capital
      const keywords = ['capital', 'apport', 'libéré', 'libération', 'social', 'progressif'];
      
      // Traiter la description
      const words = description.split(/\s+/);
      
      // Rechercher les mots-clés
      words.forEach((word, i) => {
        const processedWord = word.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        if (keywords.some(keyword => processedWord.includes(keyword))) {
          // Ajouter le mot individuel
          terms.push(toId(word));
          
          // Ajouter des expressions de 2-3 mots autour du mot-clé
          if (i > 0) {
            terms.push(toId(`${words[i-1]} ${words[i]}`));
          }
          
          if (i < words.length - 1) {
            terms.push(toId(`${words[i]} ${words[i+1]}`));
          }
        }
      });
    }
  }
  
  return terms;
}

// Chemins des fichiers
const questionDataPath = path.resolve(__dirname, '../js/question-data.js');
const legalTermsPath = path.resolve(__dirname, '../data/legal-terms.json');
const outputPath = path.resolve(__dirname, '../data/glossary-index.json');

console.log('🔍 Analyse des termes pour le glossaire...');

try {
  // Vérifier si les fichiers source existent
  if (!fs.existsSync(questionDataPath)) {
    throw new Error(`Fichier question-data.js non trouvé: ${questionDataPath}`);
  }
  
  if (!fs.existsSync(legalTermsPath)) {
    console.warn(`⚠️ Fichier legal-terms.json non trouvé: ${legalTermsPath}. Certains termes pourraient manquer.`);
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
  
  // AMÉLIORATION: Ajouter les termes spécifiques manquants
  const specificTerms = extractSpecificMissingTerms();
  specificTerms.forEach(term => candidateSet.add(term));
  console.log(`✓ ${specificTerms.length} termes spécifiques manuels ajoutés`);
  
  // AMÉLIORATION: Extraire les termes liés à la comptabilité
  const accountingTerms = extractAccountingComplexityTerms(questionDataContent);
  accountingTerms.forEach(term => candidateSet.add(term));
  console.log(`✓ ${accountingTerms.length} termes liés à la comptabilité extraits`);
  
  // AMÉLIORATION: Extraire les termes liés au capital
  const capitalTerms = extractCapitalTerms(questionDataContent);
  capitalTerms.forEach(term => candidateSet.add(term));
  console.log(`✓ ${capitalTerms.length} termes liés au capital extraits`);
  
  // NOUVELLE AMÉLIORATION: Incorporer les termes de legal-terms.json
  let legalTermsCount = 0;
  
  if (fs.existsSync(legalTermsPath)) {
    try {
      // Lire les termes juridiques
      const legalTermsContent = fs.readFileSync(legalTermsPath, 'utf8');
      const legalTerms = JSON.parse(legalTermsContent);
      
      // Ajouter les clés des termes juridiques
      Object.keys(legalTerms).forEach(key => {
        candidateSet.add(key);
        legalTermsCount++;
      });
      
      // BONUS: Extraire des termes associés (related_terms) pour enrichissement
      Object.values(legalTerms).forEach(termData => {
        if (termData.related_terms && Array.isArray(termData.related_terms)) {
          termData.related_terms.forEach(relatedTerm => {
            const relatedTermId = toId(relatedTerm);
            if (relatedTermId.length > 2) {
              candidateSet.add(relatedTermId);
              legalTermsCount++;
            }
          });
        }
      });
      
      console.log(`✓ ${legalTermsCount} termes juridiques ajoutés depuis legal-terms.json`);
    } catch (error) {
      console.warn(`⚠️ Erreur lors de la lecture des termes juridiques: ${error.message}`);
    }
  }
  
  console.log(`✓ ${candidateSet.size} termes candidats extraits au total`);
  
  // 6) Créer l'index du glossaire
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
