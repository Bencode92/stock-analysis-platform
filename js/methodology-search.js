// methodology-search.js - Moteur de recherche pour l'onglet Méthodologie
// Optimisé pour l'accessibilité et les performances

// Fonction debounce pour limiter la fréquence d'exécution des recherches
function debounce(func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}

// Fonction pour déterminer la catégorie d'un terme
function getCategoryFromTerm(key) {
  if (key.includes("impot") || key.includes("fiscal") || key.includes("tva") || 
      key.includes("is") || key.includes("ir") || key.includes("pfu")) {
    return "fiscal";
  } 
  if (key.includes("tns") || key.includes("salarie") || 
      key.includes("cotisations") || key.includes("acre")) {
    return "social";
  }
  return "juridique";
}

document.addEventListener('DOMContentLoaded', function() {
  // S'initialise quand l'onglet Méthodologie est cliqué - méthode ROBUSTE par texte
  const tabItems = document.querySelectorAll('.tab-item');
  
  // Rechercher l'onglet par son texte plutôt que son index
  tabItems.forEach(item => {
    if (item.textContent.trim() === "Méthodologie") {
      item.addEventListener('click', initMethodologyTab);
      console.log("Écouteur ajouté à l'onglet Méthodologie");
    }
  });
});

function initMethodologyTab() {
  console.log("Initialisation de l'onglet Méthodologie");
  
  // Masquer contenu du simulateur
  document.getElementById('question-container').style.display = 'none';
  document.getElementById('results-container').style.display = 'none';
  const progressElements = document.querySelectorAll('.progress-info, .progress-bar-container, #progress-steps-container');
  progressElements.forEach(el => { if(el) el.style.display = 'none'; });
  
  // Afficher contenu de l'onglet
  const tabContainer = document.getElementById('tab-content-container');
  tabContainer.style.display = 'block';
  
  // Mettre à jour l'onglet actif
  const tabItems = document.querySelectorAll('.tab-item');
  tabItems.forEach(item => item.classList.remove('active'));
  
  // Activer l'onglet Méthodologie
  tabItems.forEach(item => {
    if (item.textContent.trim() === "Méthodologie") {
      item.classList.add('active');
    }
  });
  
  // Générer l'interface
  tabContainer.innerHTML = createSearchInterface();
  
  // Vérifier si les données sont déjà en cache
  if (window.legalTermsData) {
    initializeSearchInterface(window.legalTermsData);
  } else {
    loadLegalTerms();
  }
}

function createSearchInterface() {
  return `
    <div class="max-w-4xl mx-auto">
      <h2 class="text-3xl font-bold text-green-400 mb-6">Glossaire Fiscal et Juridique</h2>
      
      <div class="bg-blue-900 bg-opacity-30 p-6 rounded-xl mb-8">
        <div class="relative">
          <input type="text" id="terms-search" aria-label="Rechercher un terme juridique ou fiscal" class="w-full bg-blue-800 bg-opacity-50 border border-blue-700 rounded-lg px-4 py-3 pl-10 text-white placeholder-gray-300" placeholder="Rechercher un terme...">
          <i class="fas fa-search absolute left-3 top-3.5 text-gray-300" aria-hidden="true"></i>
          
          <!-- Container for autocomplete suggestions -->
          <div id="search-suggestions" class="absolute w-full bg-blue-900 rounded-lg mt-1 shadow-lg z-10 overflow-hidden" style="display: none;">
            <!-- Suggestions will be added here -->
          </div>
        </div>
      </div>
      
      <!-- Cette div restera vide, les résultats principaux ne seront pas affichés -->
      <div id="terms-results" class="mt-6" aria-live="polite">
        <div class="text-center text-gray-400">
          <i class="fas fa-spinner fa-spin text-2xl"></i>
          <p class="mt-2">Chargement des termes...</p>
        </div>
      </div>
      
      <!-- Contenu personnalisé -->
      <div id="my-custom-content" class="mt-12">
        <div class="flex items-center">
          <i class="fas fa-building text-green-400 text-3xl mr-4"></i>
          <h3 class="text-2xl font-bold">Quel statut juridique pour votre projet ?</h3>
        </div>
        
        <p class="mt-4 text-lg">
          Le choix de la forme juridique est une étape cruciale dans la création d'une entreprise. Ce simulateur vous aide à trouver le statut le plus adapté à votre situation en fonction de vos besoins, objectifs et contraintes. Répondez aux questions ci-dessous pour obtenir une recommandation personnalisée.
        </p>
      </div>
    </div>
  `;
}

function loadLegalTerms() {
  console.log("Chargement des termes juridiques...");
  fetch('js/legal-terms.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Fichier non trouvé');
      }
      return response.json();
    })
    .then(data => {
      console.log("Données chargées:", Object.keys(data).length, "termes");
      // Convertir en format plus facile à utiliser
      const termsArray = Object.entries(data).map(([key, value]) => {
        return {
          terme: key.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase()),
          definition: value.definition,
          detail: value.example,
          related: value.related_terms,
          categorie: getCategoryFromTerm(key)
        };
      });
      
      // Mettre en cache pour les prochaines utilisations
      window.legalTermsData = termsArray;
      
      // Initialiser l'interface
      initializeSearchInterface(termsArray);
    })
    .catch(error => {
      console.error("Erreur chargement termes:", error);
      document.getElementById('terms-results').innerHTML = `
        <div class="bg-red-900 bg-opacity-30 p-4 rounded-lg text-center">
          <i class="fas fa-exclamation-triangle text-red-400 text-2xl mb-2"></i>
          <p>Impossible de charger les termes: ${error.message}</p>
        </div>
      `;
    });
}

function initializeSearchInterface(terms) {
  console.log("Initialisation interface, termes:", terms.length);
  
  // Vider le conteneur de résultats
  const resultsContainer = document.getElementById('terms-results');
  resultsContainer.innerHTML = '';
  
  // Référence à l'élément de suggestions
  const suggestionsContainer = document.getElementById('search-suggestions');
  
  // Configurer la recherche avec autocomplete
  const searchInput = document.getElementById('terms-search');
  
  // Événement d'entrée avec debounce pour afficher les suggestions
  searchInput.addEventListener('input', debounce(function() {
    const query = this.value.toLowerCase().trim();
    
    // Si la requête est vide, masquer les suggestions
    if (!query) {
      suggestionsContainer.style.display = 'none';
      return;
    }
    
    // Filtrer les termes selon la requête
    const filteredTerms = window.legalTermsData.filter(term => {
      return term.terme.toLowerCase().includes(query);
    }).slice(0, 5); // Limiter à 5 suggestions
    
    // Afficher les suggestions si des résultats sont trouvés
    if (filteredTerms.length > 0) {
      renderSuggestions(filteredTerms);
      suggestionsContainer.style.display = 'block';
    } else {
      suggestionsContainer.style.display = 'none';
    }
  }, 200));
  
  // Masquer les suggestions quand on clique ailleurs
  document.addEventListener('click', function(e) {
    if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
      suggestionsContainer.style.display = 'none';
    }
  });
}

// Fonction pour afficher les suggestions de recherche
function renderSuggestions(terms) {
  const container = document.getElementById('search-suggestions');
  
  let html = '';
  
  terms.forEach(term => {
    // Couleur basée sur la catégorie
    const categoryColor = term.categorie === 'fiscal' ? 'text-green-400' : 
                          term.categorie === 'juridique' ? 'text-blue-400' : 
                          'text-purple-400';
                          
    const categoryBadge = `<span class="ml-2 px-2 py-0.5 rounded text-xs ${term.categorie === 'fiscal' ? 'bg-green-900 text-green-300' : 
                            term.categorie === 'juridique' ? 'bg-blue-900 text-blue-300' : 
                            'bg-purple-900 text-purple-300'}">${term.categorie}</span>`;
    
    html += `
      <div class="suggestion-item p-3 cursor-pointer hover:bg-blue-800 border-b border-blue-700 flex items-center">
        <span class="mr-2">•</span>
        <span class="${categoryColor} font-medium">${term.terme}</span>
        ${categoryBadge}
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Ajouter des événements de clic aux suggestions
  document.querySelectorAll('.suggestion-item').forEach((item, index) => {
    item.addEventListener('click', function() {
      // Récupérer le terme sélectionné
      const selectedTerm = terms[index].terme;
      
      // Mettre à jour l'input de recherche
      document.getElementById('terms-search').value = selectedTerm;
      
      // Cacher les suggestions
      document.getElementById('search-suggestions').style.display = 'none';
      
      // Afficher le détail du terme (optionnel - actuellement désactivé)
      // displayTermDetail(terms[index]);
    });
  });
}

// Fonction désactivée pour le moment - serait utilisée pour afficher le détail d'un terme
function displayTermDetail(term) {
  // Cette fonction n'est pas utilisée actuellement car vous voulez garder l'espace sous la recherche vide
  // Mais elle pourrait être réactivée si nécessaire
}
