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
        </div>
        
        <div class="mt-4">
          <div role="tablist" class="flex flex-wrap gap-2" id="category-filters">
            <button role="tab" aria-selected="true" class="category-btn px-3 py-1 rounded-md bg-green-500 text-gray-900 font-medium" data-category="all">Tous</button>
            <button role="tab" aria-selected="false" class="category-btn px-3 py-1 rounded-md bg-blue-800 text-white" data-category="fiscal">Fiscal</button>
            <button role="tab" aria-selected="false" class="category-btn px-3 py-1 rounded-md bg-blue-800 text-white" data-category="juridique">Juridique</button>
            <button role="tab" aria-selected="false" class="category-btn px-3 py-1 rounded-md bg-blue-800 text-white" data-category="social">Social</button>
          </div>
        </div>
      </div>
      
      <div id="terms-results" class="mt-6" aria-live="polite">
        <div class="text-center text-gray-400">
          <i class="fas fa-spinner fa-spin text-2xl"></i>
          <p class="mt-2">Chargement des termes...</p>
        </div>
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
        </div>
      `;
    });
}

function initializeSearchInterface(terms) {
  console.log("Initialisation interface, termes:", terms.length);
  
  // Afficher tous les termes
  renderTermsList(terms, 'all');
  
  // Configurer la recherche avec debounce
  const searchInput = document.getElementById('terms-search');
  searchInput.addEventListener('input', debounce(function() {
    const query = this.value.toLowerCase();
    const activeCategory = document.querySelector('.category-btn[aria-selected="true"]').dataset.category;
    
    const filteredTerms = window.legalTermsData.filter(term => {
      const matchesQuery = term.terme.toLowerCase().includes(query) || 
                          term.definition.toLowerCase().includes(query);
      const matchesCategory = activeCategory === 'all' || term.categorie === activeCategory;
      
      return matchesQuery && matchesCategory;
    });
    
    renderTermsList(filteredTerms, activeCategory);
  }, 200));
  
  // Configurer les filtres de catégorie
  document.querySelectorAll('.category-btn').forEach(button => {
    button.addEventListener('click', function() {
      // Update button appearance and ARIA
      document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('bg-green-500', 'text-gray-900', 'font-medium');
        btn.classList.add('bg-blue-800', 'text-white');
        btn.setAttribute('aria-selected', 'false');
      });
      this.classList.remove('bg-blue-800', 'text-white');
      this.classList.add('bg-green-500', 'text-gray-900', 'font-medium');
      this.setAttribute('aria-selected', 'true');
      
      // Filter results
      const category = this.dataset.category;
      const query = document.getElementById('terms-search').value.toLowerCase();
      
      const filteredTerms = window.legalTermsData.filter(term => {
        const matchesQuery = term.terme.toLowerCase().includes(query) || 
                            term.definition.toLowerCase().includes(query);
        const matchesCategory = category === 'all' || term.categorie === category;
        
        return matchesQuery && matchesCategory;
      });
      
      renderTermsList(filteredTerms, category);
    });
  });
}

function renderTermsList(terms, category) {
  console.log("Rendu de", terms.length, "termes, catégorie:", category);
  const resultsContainer = document.getElementById('terms-results');
  
  if (terms.length === 0) {
    resultsContainer.innerHTML = `
      <div class="bg-blue-900 bg-opacity-20 p-4 rounded-lg text-center">
        <p>Aucun terme trouvé pour cette recherche.</p>
      </div>
    `;
    return;
  }
  
  // Trier par ordre alphabétique
  terms.sort((a, b) => a.terme.localeCompare(b.terme, 'fr'));
  
  // Générer le HTML
  let html = '';
  let currentLetter = '';
  
  terms.forEach(term => {
    const firstLetter = term.terme.charAt(0).toUpperCase();
    
    // Ajouter séparateur de lettre
    if (firstLetter !== currentLetter) {
      currentLetter = firstLetter;
      html += `
        <div class="letter-divider mt-6 mb-3 border-b border-blue-700 pb-1">
          <span class="text-xl font-bold text-green-400">${currentLetter}</span>
        </div>
      `;
    }
    
    // Couleur par catégorie
    const categoryColor = term.categorie === 'fiscal' ? 'bg-green-900 text-green-300' : 
                          term.categorie === 'juridique' ? 'bg-blue-900 text-blue-300' : 
                          'bg-purple-900 text-purple-300';
    
    // Liens termes associés
    const relatedLinks = term.related ? 
      `<div class="mt-2 text-sm">
        <span class="text-gray-400">Termes associés:</span> 
        ${term.related.map(r => `<button class="related-term cursor-pointer text-blue-400 hover:underline" role="button">${r}</button>`).join(', ')}
      </div>` : '';
    
    html += `
      <div class="term-card mb-4 bg-blue-900 bg-opacity-20 p-4 rounded-lg border border-blue-800">
        <div class="flex justify-between items-start">
          <h4 class="font-bold text-white text-lg">${term.terme}</h4>
          <span class="category-badge ${categoryColor} px-2 py-1 rounded text-xs">${term.categorie}</span>
        </div>
        <p class="mt-2">${term.definition}</p>
        ${term.detail ? `<p class="mt-2 text-gray-300 text-sm italic">${term.detail}</p>` : ''}
        ${relatedLinks}
      </div>
    `;
  });
  
  resultsContainer.innerHTML = html;
  
  // Ajouter événements pour les termes associés
  document.querySelectorAll('.related-term').forEach(link => {
    link.addEventListener('click', function() {
      const searchTerm = this.textContent.toLowerCase();
      const searchInput = document.getElementById('terms-search');
      searchInput.value = searchTerm;
      // Déclencher une recherche
      searchInput.dispatchEvent(new Event('input'));
      // Scroller vers le haut pour voir les résultats
      window.scrollTo({top: searchInput.offsetTop - 100, behavior: 'smooth'});
    });
  });
}