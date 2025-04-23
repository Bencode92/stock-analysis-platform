/**
 * Glossaire juridique pour le simulateur de formes juridiques
 * Permet d'afficher les définitions des termes techniques avec exemples
 * Version 1.0.0 - Avril 2025
 */

document.addEventListener('DOMContentLoaded', function() {
    const glossaryPanel = document.getElementById('glossary-panel');
    const glossaryCloseBtn = document.getElementById('glossary-close');
    const glossaryTermTitle = document.getElementById('glossary-term-title');
    const glossaryDefinition = document.getElementById('glossary-definition');
    const glossaryExample = document.getElementById('glossary-example');
    
    // Données du glossaire
    let glossaryData = null;

    // Chargement des données du glossaire depuis le fichier JSON
    fetch('js/glossaire-juridique.json')
        .then(response => response.json())
        .then(data => {
            glossaryData = data;
            // Une fois les données chargées, on initialise les termes du glossaire
            initGlossaryTerms();
        })
        .catch(error => {
            console.error('Erreur lors du chargement du glossaire:', error);
        });

    // Initialisation des termes du glossaire
    function initGlossaryTerms() {
        // Sélectionner tous les éléments avec la classe .glossary-term
        const glossaryTerms = document.querySelectorAll('.glossary-term');
        
        // Ajouter un gestionnaire d'événements pour chaque terme
        glossaryTerms.forEach(term => {
            term.addEventListener('click', function(e) {
                e.preventDefault();
                const termName = this.getAttribute('data-term');
                displayGlossaryTerm(termName);
            });
        });
    }

    // Afficher le terme du glossaire
    function displayGlossaryTerm(termName) {
        if (!glossaryData || !glossaryData.termes[termName]) {
            console.error(`Terme non trouvé dans le glossaire: ${termName}`);
            return;
        }
        
        const term = glossaryData.termes[termName];
        
        // Remplir le contenu du panneau
        glossaryTermTitle.textContent = term.titre;
        glossaryDefinition.textContent = term.definition;
        glossaryExample.textContent = term.exemple;
        
        // Afficher le panneau avec animation
        glossaryPanel.classList.add('visible');
    }

    // Fermer le panneau du glossaire
    glossaryCloseBtn.addEventListener('click', function() {
        glossaryPanel.classList.remove('visible');
    });

    // Fermer le panneau en cliquant à l'extérieur
    document.addEventListener('click', function(e) {
        if (glossaryPanel.classList.contains('visible')) {
            // Vérifier si le clic est en dehors du panneau et n'est pas sur un terme
            if (!glossaryPanel.contains(e.target) && 
                !e.target.classList.contains('glossary-term') && 
                !e.target.closest('.glossary-term')) {
                glossaryPanel.classList.remove('visible');
            }
        }
    });

    // Observer l'ajout de nouveaux éléments dans le DOM
    // Utile lorsque les résultats sont générés dynamiquement
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                // Rechercher les nouveaux termes du glossaire parmi les éléments ajoutés
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    const node = mutation.addedNodes[i];
                    if (node.nodeType === 1) { // Only process Element nodes
                        const newTerms = node.querySelectorAll('.glossary-term');
                        if (newTerms.length > 0) {
                            newTerms.forEach(term => {
                                term.addEventListener('click', function(e) {
                                    e.preventDefault();
                                    const termName = this.getAttribute('data-term');
                                    displayGlossaryTerm(termName);
                                });
                            });
                        }
                    }
                }
            }
        });
    });

    // Observer le conteneur des résultats pour les termes ajoutés dynamiquement
    const resultsContainer = document.getElementById('results-container');
    if (resultsContainer) {
        observer.observe(resultsContainer, { 
            childList: true, 
            subtree: true 
        });
    }

    // Mettre à jour la barre de progression
    function updateProgressBar(section) {
        const progressBar = document.getElementById('progress-bar');
        const progressPercentage = document.getElementById('progress-percentage');
        const timeEstimate = document.getElementById('time-estimate');
        
        let progress = 0;
        
        switch(section) {
            case 1:
                progress = 20;
                break;
            case 2:
                progress = 40;
                break;
            case 3:
                progress = 60;
                break;
            case 4:
                progress = 80;
                break;
            case 5:
                progress = 100;
                break;
        }
        
        progressBar.style.width = `${progress}%`;
        progressPercentage.textContent = `${progress}% complété`;
        
        if (progress < 30) {
            timeEstimate.textContent = 'Temps estimé: 4 minutes';
        } else if (progress < 60) {
            timeEstimate.textContent = 'Temps estimé: 3 minutes';
        } else if (progress < 90) {
            timeEstimate.textContent = 'Temps estimé: 2 minutes';
        } else {
            timeEstimate.textContent = 'Temps estimé: 1 minute';
        }
    }

    // Intercepter les clics sur les boutons de navigation pour mettre à jour la barre de progression
    const navButtons = document.querySelectorAll('#next1, #next2, #next3, #prev2, #prev3, #prev4, #submit-btn');
    
    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Déterminer vers quelle section on se dirige
            let targetSection = 1;
            
            if (this.id === 'next1') targetSection = 2;
            else if (this.id === 'next2') targetSection = 3;
            else if (this.id === 'next3') targetSection = 4;
            else if (this.id === 'submit-btn') targetSection = 5;
            else if (this.id === 'prev2') targetSection = 1;
            else if (this.id === 'prev3') targetSection = 2;
            else if (this.id === 'prev4') targetSection = 3;
            
            // Mise à jour de la barre de progression
            setTimeout(() => {
                updateProgressBar(targetSection);
            }, 100);
        });
    });

    // Initialiser la barre de progression
    updateProgressBar(1);
});

// Fonction pour afficher plus/moins de résultats
function toggleSecondaryResults() {
    const showMoreBtn = document.getElementById('show-more-results');
    const secondaryResults = document.getElementById('secondary-results');
    
    if (showMoreBtn && secondaryResults) {
        showMoreBtn.addEventListener('click', function() {
            if (secondaryResults.classList.contains('hidden')) {
                secondaryResults.classList.remove('hidden');
                this.querySelector('button').innerHTML = '<i class="fas fa-chevron-up mr-2"></i> Masquer les autres options';
            } else {
                secondaryResults.classList.add('hidden');
                this.querySelector('button').innerHTML = '<i class="fas fa-chevron-down mr-2"></i> Voir les autres options compatibles';
            }
        });
    }
}

// Exécuter cette fonction lorsque les résultats sont chargés
document.addEventListener('resultsLoaded', toggleSecondaryResults);
