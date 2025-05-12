// fiscal-guide.js - Simulateur fiscal simplifié pour l'onglet Guide fiscal
// Version 3.8 - Mai 2025 - Correction de l'affichage des valeurs avec options sectorielles

document.addEventListener('DOMContentLoaded', function() {
    // S'assurer que l'onglet Guide fiscal initialise correctement ce code
    const guideTab = document.querySelector('.tab-item:nth-child(3)'); // Le 3ème onglet
    
    if (guideTab) {
        guideTab.addEventListener('click', initFiscalSimulator);
    }
    
    // Chercher si le simulateur existe déjà sur la page
    if (document.getElementById('fiscal-simulator')) {
        initFiscalSimulator();
    }
    
    // Ajouter les styles personnalisés pour le simulateur
    addCustomStyles();
    
    // Créer un contenu pour l'onglet méthodologie
    setupMethodologyTab();
});

// Fonction pour configurer l'onglet méthodologie
function setupMethodologyTab() {
    // Écouter le clic sur l'onglet Méthodologie
    const tabItems = document.querySelectorAll('.tab-item');
    if (tabItems && tabItems.length > 4) { // L'onglet Méthodologie est le 5ème
        tabItems[4].addEventListener('click', function() {
            // Cacher le contenu du simulateur
            document.getElementById('question-container').style.display = 'none';
            document.getElementById('results-container').style.display = 'none';
            document.querySelector('.progress-info').style.display = 'none';
            document.querySelector('.progress-bar-container').style.display = 'none';
            document.getElementById('progress-steps-container').style.display = 'none';
            
            // Afficher le contenu de l'onglet
            const tabContainer = document.getElementById('tab-content-container');
            tab