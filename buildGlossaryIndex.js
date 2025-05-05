/**
 * buildGlossaryIndex.js - Script pour créer un index JSON des termes extraits de question-data.js
 * 
 * Ce script extrait les termes pertinents de question-data.js pour créer un index de glossaire
 * qui peut être utilisé par glossary.js pour mettre en évidence efficacement les termes dans le contenu.
 * 
 * Utilisation: 
 * 1. Exécuter avec: node buildGlossaryIndex.js
 * 2. Le script générera data/glossary-index.json
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    inputFiles: [
        'js/question-data.js'        // Source principale des termes
    ],
    outputFile: 'data/glossary-index.json',
    minWordLength: 2                  // Longueur minimale des mots à inclure
};

// Fonction pour extraire les termes de question-data.js
function extractTermsFromQuestionData(content) {
    const terms = new Set();
    
    try {
        // Extraire les IDs de questions
        const questionIdRegex = /id:\s*["']([^"']+)["']/g;
        let match;
        while ((match = questionIdRegex.exec(content)) !== null) {
            terms.add(match[1]);
        }
        
        // Extraire les IDs d'options
        const optionIdRegex = /id:\s*["']([^"']+)["']/g;
        while ((match = optionIdRegex.exec(content)) !== null) {
            terms.add(match[1]);
        }
        
        // Extraire les labels (sensible à la casse pour capturer les noms propres et termes spécifiques)
        const labelRegex = /label:\s*["']([^"']+)["']/g;
        while ((match = labelRegex.exec(content)) !== null) {
            // Si le label contient plusieurs mots, ajouter la phrase entière et les mots individuels
            const phrase = match[1];
            terms.add(phrase);
            
            // Ajouter les mots individuels des phrases multi-mots
            const words = phrase.split(/\s+/);
            if (words.length > 1) {
                words.forEach(word => {
                    if (word.length >= CONFIG.minWordLength) {
                        terms.add(word);
                    }
                });
            }
        }
        
        // Extraire les titres de sections
        const titleRegex = /title:\s*["']([^"']+)["']/g;
        while ((match = titleRegex.exec(content)) !== null) {
            terms.add(match[1]);
        }
        
        // Extraire les descriptions de sections
        const descRegex = /description:\s*["']([^"']+)["']/g;
        while ((match = descRegex.exec(content)) !== null) {
            // Pour les longues descriptions, extraire des phrases nominales clés
            const desc = match[1];
            const nounPhrases = extractNounPhrases(desc);
            nounPhrases.forEach(phrase => terms.add(phrase));
        }
        
    } catch (error) {
        console.error('Erreur lors de l\'analyse de question-data.js:', error);
    }
    
    return Array.from(terms);
}

// Fonction spéciale pour extraire les termes spécifiques manquants
function extractSpecificMissingTerms(content) {
    const missingTerms = new Set();
    
    // 1. Termes spécifiques liés au capital social
    missingTerms.add('capital_social');
    missingTerms.add('liberation_du_capital_social');
    missingTerms.add('capital social');
    missingTerms.add('libération du capital social');
    missingTerms.add('capital');
    missingTerms.add('libération');
    
    // 2. Termes liés à la comptabilité
    missingTerms.add('comptabilite_simple');
    missingTerms.add('comptabilite_moderee');
    missingTerms.add('comptabilite_complete');
    missingTerms.add('comptabilité simple');
    missingTerms.add('comptabilité modérée');
    missingTerms.add('comptabilité complète');
    missingTerms.add('simple');
    missingTerms.add('moderate');
    missingTerms.add('complete');
    
    // 3. Termes d'expertise comptable
    missingTerms.add('externalite_expert_comptable');
    missingTerms.add('expert-comptable');
    missingTerms.add('expertise comptable');
    missingTerms.add('outsourced');
    
    // 4. Termes fiscaux
    missingTerms.add('abattement_forfaitaire');
    missingTerms.add('abattement forfaitaire');
    
    // 5. Chercher spécifiquement les termes dans les options de la question "accounting_complexity"
    const accountingComplexityRegex = /id:\s*["']accounting_complexity["'][\s\S]*?options:\s*\[([\s\S]*?)\]/g;
    let match;
    
    while ((match = accountingComplexityRegex.exec(content)) !== null) {
        const optionsContent = match[1];
        
        // Extraire les IDs des options
        const optionIdRegex = /id:\s*["']([^"']+)["']/g;
        let optionMatch;
        
        while ((optionMatch = optionIdRegex.exec(optionsContent)) !== null) {
            missingTerms.add(optionMatch[1]);
        }
        
        // Extraire les labels des options
        const labelRegex = /label:\s*["']([^"']+)["']/g;
        
        while ((optionMatch = labelRegex.exec(optionsContent)) !== null) {
            missingTerms.add(optionMatch[1]);
            
            // Décomposer les expressions multi-mots
            const words = optionMatch[1].split(/\s+\(/)[0].split(/\s+/);
            if (words.length > 1) {
                for (let i = 0; i < words.length; i++) {
                    if (words[i].length > 3) {  // Ignorer les mots très courts
                        missingTerms.add(words[i]);
                    }
                    
                    // Ajouter des bi-grammes (paires de mots)
                    if (i < words.length - 1 && words[i].length > 2 && words[i+1].length > 2) {
                        missingTerms.add(`${words[i]} ${words[i+1]}`);
                    }
                }
            }
        }
    }
    
    // 6. Chercher spécifiquement le contenu lié au capital social
    const capitalQuestionRegex = /id:\s*["'](?:available_capital|capital_percentage|associate_current_account)["'][\s\S]*?description:\s*["']([^"']+)["']/g;
    
    while ((match = capitalQuestionRegex.exec(content)) !== null) {
        const description = match[1];
        
        // Extraire des expressions liées au capital
        const capitalPhrases = extractPhrasesByKeywords(description, ['capital', 'apport', 'libéré', 'libération']);
        capitalPhrases.forEach(phrase => missingTerms.add(phrase));
    }
    
    return Array.from(missingTerms);
}

// Fonction utilitaire pour extraire des phrases basées sur des mots-clés
function extractPhrasesByKeywords(text, keywords) {
    const phrases = new Set();
    const words = text.split(/\s+/);
    
    // Rechercher les mots-clés
    for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase();
        
        // Si c'est un mot-clé ou contient un mot-clé
        if (keywords.some(keyword => word.includes(keyword.toLowerCase()))) {
            // Ajouter le mot seul
            phrases.add(word);
            
            // Ajouter des expressions de 2-3 mots autour du mot-clé
            if (i > 0) {
                phrases.add(`${words[i-1]} ${words[i]}`);
            }
            
            if (i < words.length - 1) {
                phrases.add(`${words[i]} ${words[i+1]}`);
            }
            
            if (i > 0 && i < words.length - 1) {
                phrases.add(`${words[i-1]} ${words[i]} ${words[i+1]}`);
            }
        }
    }
    
    return Array.from(phrases);
}

// Heuristique simple pour extraire les phrases nominales probables des descriptions
function extractNounPhrases(text) {
    const phrases = [];
    
    // Diviser par les séparateurs communs
    const segments = text.split(/[,.;:?!()]/);
    
    segments.forEach(segment => {
        // Rechercher des phrases nominales (approche simpliste)
        const words = segment.trim().split(/\s+/);
        
        // Mots uniques qui sont des noms ou des termes clés
        words.forEach(word => {
            if (word.length >= CONFIG.minWordLength && 
                isLikelyNoun(word) && 
                !isCommonWord(word)) {
                phrases.push(word);
            }
        });
        
        // Phrases courtes (2-3 mots)
        for (let i = 0; i < words.length - 1; i++) {
            const phrase = words.slice(i, i + 2).join(' ');
            if (isLikelyNounPhrase(phrase) && !isCommonPhrase(phrase)) {
                phrases.push(phrase);
            }
            
            if (i < words.length - 2) {
                const phrase3 = words.slice(i, i + 3).join(' ');
                if (isLikelyNounPhrase(phrase3) && !isCommonPhrase(phrase3)) {
                    phrases.push(phrase3);
                }
            }
        }
    });
    
    return phrases;
}

// Heuristique simple pour vérifier si un mot est probablement un nom
function isLikelyNoun(word) {
    // Vérifier les terminaisons de noms courants en français (simplifié)
    const nounEndings = ['tion', 'sion', 'ment', 'age', 'ure', 'esse', 'ence', 'ance', 'ité', 'té'];
    word = word.toLowerCase();
    
    for (const ending of nounEndings) {
        if (word.endsWith(ending)) {
            return true;
        }
    }
    
    // Vérifier si le mot commence par une majuscule (pourrait être un nom propre)
    if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
        return true;
    }
    
    // Repli sur la longueur du mot comme heuristique
    return word.length >= 5;
}

// Vérifier si une phrase est susceptible d'être une phrase nominale significative
function isLikelyNounPhrase(phrase) {
    // Vérifier les modèles de termes commerciaux/juridiques courants
    const businessTerms = ['compte', 'apport', 'impôt', 'social', 'fiscal', 'entreprise', 'société', 'revenu', 'bénéfice', 'statut'];
    const words = phrase.toLowerCase().split(' ');
    
    for (const term of businessTerms) {
        if (words.some(word => word.includes(term))) {
            return true;
        }
    }
    
    // Par défaut, vérification de base
    return words.length > 1 && words.every(word => word.length > 2);
}

// Listes de mots courants à exclure
function isCommonWord(word) {
    const commonWords = ['le', 'la', 'les', 'un', 'une', 'des', 'pour', 'avec', 'dans', 'sur', 'par', 'que', 'qui', 'quoi', 'dont', 'est', 'sont', 'suis', 'etes', 'sommes'];
    return commonWords.includes(word.toLowerCase());
}

// Vérifier si une phrase est trop courante pour être utile
function isCommonPhrase(phrase) {
    const commonPhrases = ['dans le', 'sur la', 'pour les', 'avec un', 'est un'];
    return commonPhrases.includes(phrase.toLowerCase());
}

// Traiter tous les fichiers d'entrée et générer l'index
async function buildGlossaryIndex() {
    try {
        const allTerms = new Set();
        
        // Traiter chaque fichier d'entrée
        for (const inputFile of CONFIG.inputFiles) {
            console.log(`Traitement de ${inputFile}...`);
            
            const filePath = path.resolve(inputFile);
            if (!fs.existsSync(filePath)) {
                console.warn(`Fichier non trouvé: ${filePath}`);
                continue;
            }
            
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Extraction standard
            const terms = extractTermsFromQuestionData(content);
            terms.forEach(term => allTerms.add(term));
            
            // Extraire spécifiquement les termes manquants
            const missingTerms = extractSpecificMissingTerms(content);
            console.log(`Termes spécifiques ajoutés: ${missingTerms.length}`);
            missingTerms.forEach(term => allTerms.add(term));
        }
        
        // Filtrer les termes très courts et trier alphabétiquement
        const filteredTerms = Array.from(allTerms)
            .filter(term => term && term.length >= CONFIG.minWordLength)
            .sort();
        
        // Écrire l'index dans le fichier de sortie
        const outputPath = path.resolve(CONFIG.outputFile);
        fs.writeFileSync(outputPath, JSON.stringify(filteredTerms, null, 2));
        
        console.log(`Index du glossaire généré avec succès: ${filteredTerms.length} termes dans ${CONFIG.outputFile}`);
    } catch (error) {
        console.error('Erreur lors de la construction de l\'index du glossaire:', error);
    }
}

// Exécuter la fonction principale
buildGlossaryIndex().catch(console.error);
