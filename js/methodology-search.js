// methodology-search.js - Moteur de recherche pour l'onglet Méthodologie
// Optimisé pour l'accessibilité et les performances

// Fonction debounce améliorée pour conserver le contexte
function debounce(func, timeout = 300) {
  let timer;
  return function(...args) {  // Function classique au lieu d'arrow function
    const context = this;     // Capture le contexte (this = élément input)
    clearTimeout(timer);
    timer = setTimeout(() => { 
      func.apply(context, args); 
    }, timeout);
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
          
          <!-- Container pour les suggestions avec attributs d'accessibilité -->
          <div id="search-suggestions" class="absolute w-full bg-blue-900 rounded-lg mt-1 shadow-lg z-10 hidden max-h-80 overflow-y-auto" role="listbox">
            <!-- Les suggestions seront ajoutées ici -->
          </div>
        </div>
      </div>
      
      <!-- Conteneur de résultats -->
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
  // Ajouter un log pour le chemin d'accès
  console.log("Tentative de chargement depuis: data/legal-terms.json");
  
  fetch('data/legal-terms.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Fichier non trouvé: ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      console.log("Données chargées avec succès:", Object.keys(data).length, "termes");
      // Convertir en format plus facile à utiliser
      const termsArray = Object.entries(data).map(([key, value]) => {
        return {
          terme: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
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
          <p class="mt-2 text-sm">Veuillez vérifier que le fichier data/legal-terms.json existe et est accessible.</p>
        </div>
      `;
      
      // Essayer un autre chemin comme fallback
      console.log("Tentative avec un chemin alternatif: ./data/legal-terms.json");
      setTimeout(() => {
        fetch('./data/legal-terms.json')
          .then(response => response.json())
          .then(data => {
            console.log("Données chargées avec le chemin alternatif!");
            // Même traitement que ci-dessus
            const termsArray = Object.entries(data).map(([key, value]) => ({
              terme: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              definition: value.definition,
              detail: value.example,
              related: value.related_terms,
              categorie: getCategoryFromTerm(key)
            }));
            window.legalTermsData = termsArray;
            initializeSearchInterface(termsArray);
          })
          .catch(err => console.error("Échec également avec le chemin alternatif:", err));
      }, 1000);
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
  searchInput.addEventListener('input', debounce(function(e) {
    // Utiliser e.target.value au lieu de this.value comme plan B
    const query = (this.value || e.target.value).toLowerCase().trim();
    console.log("Recherche pour:", query);
    
    // Si la requête est vide, masquer les suggestions
    if (!query) {
      suggestionsContainer.classList.add('hidden');
      return;
    }
    
    // Filtrer les termes selon la requête (commençant par la lettre/mot saisi)
    const filteredTerms = window.legalTermsData.filter(term => {
      return term.terme.toLowerCase().startsWith(query);
    }).slice(0, 10); // Limiter à 10 pour les performances
    
    console.log("Résultats trouvés:", filteredTerms.length);
    
    // Afficher les suggestions si des résultats sont trouvés
    if (filteredTerms.length > 0) {
      renderSuggestions(filteredTerms, query);
      suggestionsContainer.classList.remove('hidden');
    } else {
      suggestionsContainer.classList.add('hidden');
    }
  }, 200));
  
  // Masquer les suggestions quand on clique ailleurs
  document.addEventListener('click', function(e) {
    if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
      suggestionsContainer.classList.add('hidden');
    }
  });
}

// Fonction pour afficher les suggestions de recherche
function renderSuggestions(terms, query) {
  const container = document.getElementById('search-suggestions');
  
  let html = '';
  
  terms.forEach(term => {
    // Mettre en évidence la partie qui correspond à la requête
    const highlightedTerm = term.terme.replace(
      new RegExp('^' + query, 'i'), 
      '<span class="text-green-400">$&</span>'
    );
    
    html += `
      <div class="suggestion-item p-3 cursor-pointer hover:bg-blue-800 border-b border-blue-700 flex items-center" role="option">
        <span class="mr-2">•</span>
        <span class="font-medium">${highlightedTerm}</span>
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
      document.getElementById('search-suggestions').classList.add('hidden');
      
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