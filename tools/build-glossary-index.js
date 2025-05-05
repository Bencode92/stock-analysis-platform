/**
 * build-glossary-index.js
 * 
 * Script qui extrait tous les termes de question-data.js et génère
 * un glossary-index.json sans dépendre de legal-terms.json.
 * 
 * Usage: node tools/build-glossary-index.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const QUESTION_DATA_PATH = './js/question-data.js';
const OUTPUT_PATH = './data/glossary-index.json';

// Termes importants à s'assurer de capturer
const IMPORTANT_TERMS = [
  'capital_social',
  'liberation_du_capital_social',
  'comptabilite_simple',
  'comptabilite_moderee',
  'comptabilite_complete',
  'externalite_expert_comptable',
  'abattement_forfaitaire',
  'simple',
  'moderate',
  'complete',
  'outsourced'
];

// Mappings de termes pour capturer les variations
const TERM_MAPPINGS = {
  'comptabilite_de_tresorerie': 'comptabilite_simple',
  'comptabilite_sans_tva': 'comptabilite_moderee',
  'comptabilite_d_engagement': 'comptabilite_complete',
  'expert_comptable': 'externalite_expert_comptable',
  'capital': 'capital_social',
  'liberation': 'liberation_du_capital_social',
  'abattement': 'abattement_forfaitaire'
};

// Construire l'index de glossaire
async function buildGlossaryIndex() {
  try {
    console.log('Construction de l\'index du glossaire...');

    // Lire question-data.js
    const questionData = fs.readFileSync(QUESTION_DATA_PATH, 'utf8');
    
    // Set pour stocker tous les termes uniques
    const terms = new Set();
    
    // Ajouter directement les termes importants
    IMPORTANT_TERMS.forEach(term => terms.add(term));
    
    // Extraire et analyser les sections
    const sectionsRegex = /sections\s*=\s*\[([\s\S]*?)\];/;
    const sectionsMatch = questionData.match(sectionsRegex);
    if (sectionsMatch) {
      const sectionsBlock = sectionsMatch[1];
      extractTermsFromBlock(sectionsBlock, terms);
    }
    
    // Extraire et analyser les questions
    const questionsRegex = /questions\s*=\s*\[([\s\S]*?)\];/;
    const questionsMatch = questionData.match(questionsRegex);
    if (questionsMatch) {
      const questionsBlock = questionsMatch[1];
      extractTermsFromBlock(questionsBlock, terms);
      
      // Analyse spécifique pour trouver les termes manquants
      findSpecificMissingTerms(questionsBlock, terms);
    }
    
    // Extraire les questions pour quick start (souvent des termes importants)
    const quickStartRegex = /quickStartQuestions\s*=\s*\[([\s\S]*?)\];/;
    const quickStartMatch = questionData.match(quickStartRegex);
    if (quickStartMatch) {
      const quickStartBlock = quickStartMatch[1];
      // Extraire les IDs qui sont référencés ici
      const idMatches = quickStartBlock.match(/["']([^"']+)["']/g);
      if (idMatches) {
        idMatches.forEach(match => {
          const term = match.replace(/["']/g, '');
          terms.add(term);
        });
      }
    }
    
    // Écrire l'index du glossaire
    const sortedTerms = [...terms].sort();
    
    // Créer le répertoire de sortie s'il n'existe pas
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sortedTerms, null, 2));
    
    console.log(`Termes extraits: ${sortedTerms.length}`);
    console.log(`Index du glossaire créé: ${OUTPUT_PATH}`);
  } catch (error) {
    console.error('Erreur lors de la construction de l\'index du glossaire:', error);
    process.exit(1);
  }
}

// Extraire les termes d'un bloc de texte
function extractTermsFromBlock(block, termsSet) {
  // Extraire les IDs
  const idMatches = block.matchAll(/id:\s*["']([^"']+)["']/g);
  for (const match of idMatches) {
    const id = match[1];
    termsSet.add(id);
    
    // Vérifier si cet ID correspond à un mapping connu
    Object.entries(TERM_MAPPINGS).forEach(([key, value]) => {
      if (id.includes(key)) {
        termsSet.add(value);
      }
    });
  }
  
  // Extraire les titres
  const titleMatches = block.matchAll(/title:\s*["']([^"']+)["']/g);
  for (const match of titleMatches) {
    const title = match[1];
    
    // Ajouter le titre normalisé
    const normalizedTitle = normalizeTermId(title);
    if (normalizedTitle) termsSet.add(normalizedTitle);
    
    // Vérifier si ce titre contient un de nos termes importants
    IMPORTANT_TERMS.forEach(term => {
      const termWithSpaces = term.replace(/_/g, ' ');
      if (title.toLowerCase().includes(termWithSpaces)) {
        termsSet.add(term);
      }
    });
    
    // Extraire les termes significatifs du titre
    extractSignificantTerms(title).forEach(term => {
      if (term) termsSet.add(term);
    });
  }
  
  // Extraire les descriptions
  const descMatches = block.matchAll(/description:\s*["']([^"']+)["']/g);
  for (const match of descMatches) {
    const description = match[1];
    
    // Vérifier si cette description contient un de nos termes importants
    IMPORTANT_TERMS.forEach(term => {
      const termWithSpaces = term.replace(/_/g, ' ');
      if (description.toLowerCase().includes(termWithSpaces)) {
        termsSet.add(term);
      }
    });
    
    // Vérifier pour les mappings également
    Object.entries(TERM_MAPPINGS).forEach(([key, value]) => {
      const keyWithSpaces = key.replace(/_/g, ' ');
      if (description.toLowerCase().includes(keyWithSpaces)) {
        termsSet.add(value);
      }
    });
    
    // Extraire des termes significatifs de la description
    extractSignificantTerms(description).forEach(term => {
      if (term) termsSet.add(term);
    });
  }
  
  // Extraire les labels
  const labelMatches = block.matchAll(/label:\s*["']([^"']+)["']/g);
  for (const match of labelMatches) {
    const label = match[1];
    
    // Ajouter le label normalisé
    const normalizedLabel = normalizeTermId(label);
    if (normalizedLabel) termsSet.add(normalizedLabel);
    
    // Vérifier pour les termes importants
    IMPORTANT_TERMS.forEach(term => {
      const termWithSpaces = term.replace(/_/g, ' ');
      if (label.toLowerCase().includes(termWithSpaces)) {
        termsSet.add(term);
      }
    });
    
    // Extraire des termes significatifs du label
    extractSignificantTerms(label).forEach(term => {
      if (term) termsSet.add(term);
    });
  }
}

// Recherche spécifique pour les termes manquants mentionnés
function findSpecificMissingTerms(questionsBlock, termsSet) {
  // Recherche pour les termes liés à la comptabilité
  if (questionsBlock.includes('comptabilité') || questionsBlock.includes('comptable')) {
    termsSet.add('comptabilite_simple');
    termsSet.add('comptabilite_moderee');
    termsSet.add('comptabilite_complete');
    termsSet.add('externalite_expert_comptable');
    
    // Alternatives et variations
    termsSet.add('simple');
    termsSet.add('moderate');
    termsSet.add('complete');
    termsSet.add('outsourced');
  }
  
  // Recherche pour les termes liés au capital social
  if (questionsBlock.includes('capital social') || questionsBlock.includes('libéré')) {
    termsSet.add('capital_social');
    termsSet.add('liberation_du_capital_social');
  }
  
  // Recherche pour les termes liés à l'abattement
  if (questionsBlock.includes('abattement') || questionsBlock.includes('frais réels')) {
    termsSet.add('abattement_forfaitaire');
    termsSet.add('micro_vs_reel');
  }
  
  // Analyse spécifique des blocs d'options pour "accounting_complexity"
  const complexityPattern = /id:\s*["']accounting_complexity["'][\s\S]*?options:/;
  const complexityMatch = questionsBlock.match(complexityPattern);
  if (complexityMatch) {
    termsSet.add('comptabilite_simple');
    termsSet.add('comptabilite_moderee');
    termsSet.add('comptabilite_complete');
    termsSet.add('externalite_expert_comptable');
    termsSet.add('simple');
    termsSet.add('moderate');
    termsSet.add('complete');
    termsSet.add('outsourced');
  }
  
  // Analyse spécifique des blocs d'options pour "real_expenses_rate"
  const expensesPattern = /id:\s*["']real_expenses_rate["'][\s\S]*?description:/;
  const expensesMatch = questionsBlock.match(expensesPattern);
  if (expensesMatch) {
    termsSet.add('abattement_forfaitaire');
    termsSet.add('micro_vs_reel');
  }
  
  // Analyse des options pour "available_capital" et "liberated_percentage"
  if (questionsBlock.includes('available_capital') || questionsBlock.includes('liberated_percentage')) {
    termsSet.add('capital_social');
    termsSet.add('liberation_du_capital_social');
  }
}

// Extraire les termes significatifs d'un texte
function extractSignificantTerms(text) {
  if (!text) return [];
  
  const terms = new Set();
  
  // Diviser le texte en mots
  const words = text.split(/[\/\(\)\[\]\{\}\-:;,\s]+/);
  
  // Filtrer pour ne garder que les mots significatifs
  for (let i = 0; i < words.length; i++) {
    // Mots individuels significatifs (plus de 4 caractères)
    if (words[i] && words[i].length > 4) {
      const term = normalizeTermId(words[i]);
      if (term) terms.add(term);
    }
    
    // Combinaisons de 2 mots
    if (i < words.length - 1 && words[i] && words[i+1]) {
      const twoWordTerm = normalizeTermId(`${words[i]} ${words[i+1]}`);
      if (twoWordTerm) terms.add(twoWordTerm);
    }
    
    // Combinaisons de 3 mots
    if (i < words.length - 2 && words[i] && words[i+1] && words[i+2]) {
      const threeWordTerm = normalizeTermId(`${words[i]} ${words[i+1]} ${words[i+2]}`);
      if (threeWordTerm) terms.add(threeWordTerm);
    }
  }
  
  return Array.from(terms);
}

// Normaliser un terme pour créer un ID
function normalizeTermId(term) {
  if (!term) return null;
  
  // Mots courants à exclure (articles, prépositions, etc.)
  const stopWords = ['avec', 'dans', 'pour', 'votre', 'des', 'les', 'cette', 'que', 'vous', 'sur', 'par'];
  
  const normalized = term
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .trim()
    .replace(/[^a-z0-9\s_]/g, '') // Supprimer les caractères spéciaux
    .replace(/\s+/g, '_'); // Remplacer les espaces par des underscores
  
  // Ignorer les mots courants et les termes très courts
  if (stopWords.includes(normalized) || normalized.length < 3) {
    return null;
  }
  
  return normalized;
}

// Exécuter le script
buildGlossaryIndex();