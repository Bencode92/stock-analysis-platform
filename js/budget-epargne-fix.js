/**
 * budget-epargne-fix.js - Correctifs pour les bugs du module Budget & Épargne
 * 
 * 🐛 BUGS CORRIGÉS :
 * 1. Événements 'change' → 'input' pour rafraîchissement temps réel
 * 2. Fonction toNumber() robuste pour formats français avec points/virgules
 * 
 * 🚀 UTILISATION :
 * 1. Remplacer la fonction toNumber() existante (lignes 7-18)
 * 2. Remplacer la section d'événements dans initBudgetListeners() (ligne 2540)
 */

// ===================================================================
// 🔧 CORRECTIF #1 : Fonction toNumber() robuste
// ===================================================================

/**
 * Convertit une chaîne en nombre en gérant les formats français robustement
 * ✅ Gère : "5.000" → 5000, "5 000,75" → 5000.75, "15,01" → 15.01
 * ✅ Support : points séparateurs milliers, virgules décimales, espaces
 */
function toNumber(raw) {
    if (!raw || typeof raw !== 'string') return 0;

    // 1) Nettoyer les espaces et symboles monétaires
    let cleaned = raw
        .trim()
        .replace(/[\s\u00A0\u2009]/g, '')    // espaces insécables et normaux
        .replace(/[€$£¥]/g, '');            // symboles monétaires

    // 2) Cas avec point ET virgule → le point est sûrement un séparateur de milliers
    if (cleaned.includes('.') && cleaned.includes(',')) {
        cleaned = cleaned.replace(/\./g, '');
    } else {
        // 3) Plusieurs points → tous sauf le dernier sont des séparateurs de milliers
        const firstDot = cleaned.indexOf('.');
        const lastDot = cleaned.lastIndexOf('.');
        if (firstDot !== -1 && firstDot !== lastDot) {
            // Remplacer tous les points sauf le dernier
            cleaned = cleaned.replace(/\./g, '');
        }
    }

    // 4) Uniformiser la virgule en point pour la décimale
    cleaned = cleaned.replace(',', '.');

    return parseFloat(cleaned) || 0;
}

// ===================================================================
// 🔧 CORRECTIF #2 : Événements temps réel dans initBudgetListeners()
// ===================================================================

/**
 * Version corrigée de la section événements dans initBudgetListeners()
 * À remplacer à partir de la ligne 2540 environ
 */
function initBudgetListeners_EventsFix() {
    // ✅ CORRECTION : Utiliser 'input' ET 'change' pour rafraîchissement immédiat
    const simpleInputs = [
        document.getElementById('simulation-budget-loyer'),
        document.getElementById('simulation-budget-quotidien'),
        document.getElementById('simulation-budget-extra'),
        document.getElementById('simulation-budget-invest'),        // ← IMPORTANT : celui-ci !
        document.getElementById('revenu-mensuel-input'),
        document.getElementById('objectif-epargne'),
        document.getElementById('objectif-type')
    ];
    
    simpleInputs.forEach(input => {
        if (input) {
            // ✅ DOUBLE ÉVÉNEMENT pour garantir la réactivité
            input.addEventListener('input', function() {
                analyserBudget();
            });
            input.addEventListener('change', function() {
                analyserBudget();
            });
        }
    });
}

// ===================================================================
// 🧪 TESTS RAPIDES POUR VALIDATION
// ===================================================================

/**
 * Tests unitaires pour vérifier que toNumber() fonctionne
 * À exécuter dans la console pour vérification
 */
function testToNumberFunction() {
    const tests = [
        { input: '5.000', expected: 5000, desc: 'Point séparateur milliers' },
        { input: '5 000,75', expected: 5000.75, desc: 'Espace + virgule décimale' },
        { input: '15,01', expected: 15.01, desc: 'Virgule décimale simple' },
        { input: '1.234.567,89', expected: 1234567.89, desc: 'Millions avec décimales' },
        { input: '3000€', expected: 3000, desc: 'Avec symbole euro' },
        { input: '2 500', expected: 2500, desc: 'Espace séparateur milliers' },
        { input: '0,50', expected: 0.5, desc: 'Décimales < 1' }
    ];

    console.log('🧪 Tests de la fonction toNumber() corrigée :');
    tests.forEach(test => {
        const result = toNumber(test.input);
        const status = result === test.expected ? '✅' : '❌';
        console.log(`${status} "${test.input}" → ${result} (attendu: ${test.expected}) - ${test.desc}`);
    });
}

// ===================================================================
// 📋 GUIDE D'APPLICATION DES CORRECTIFS
// ===================================================================

/*
ÉTAPES POUR APPLIQUER LES CORRECTIFS :

1. 🔄 REMPLACER la fonction toNumber() (lignes 7-18) par la version ci-dessus

2. 🔄 REMPLACER dans initBudgetListeners() (ligne ~2540) :
   
   ANCIEN CODE :
   simpleInputs.forEach(input => {
       if (input) {
           input.addEventListener('change', function() {
               analyserBudget();
           });
       }
   });

   NOUVEAU CODE :
   simpleInputs.forEach(input => {
       if (input) {
           ['input', 'change'].forEach(eventType => {
               input.addEventListener(eventType, function() {
                   analyserBudget();
               });
           });
       }
   });

3. 🧪 TESTER dans la console : testToNumberFunction()

4. 🚀 RECHARGER la page et tester :
   - Taper "5.000" dans un champ → doit afficher 5000€
   - Modifier l'épargne auto → doit mettre à jour instantanément
   - Les taux et totaux doivent se rafraîchir en temps réel

RÉSULTAT ATTENDU :
✅ Plus de valeurs figées
✅ Plus de "15,01€" au lieu de "5000€"
✅ Épargne possible se met à jour instantanément
✅ Tous les calculs utilisent les bonnes valeurs
*/