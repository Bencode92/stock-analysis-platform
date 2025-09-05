/* ETF Search Integration Module - Barre de recherche optimisée pour ETF A→Z */

// Ce module s'intègre dans l'IIFE existant de etf-az.js
// Ajoutez ce code dans la section appropriée de votre script

// ============================================
// 1) VARIABLES D'ÉTAT POUR LA RECHERCHE
// ============================================
// À ajouter en haut de l'IIFE, avec les autres variables
let q = ''; // terme de recherche
let previousTab = 'a'; // mémoriser l'onglet avant recherche

// ============================================
// 2) HELPERS DE RECHERCHE
// ============================================
function escapeRegExp(s) { 
  return s ? s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''; 
}

function highlight(str) {
  if (!q || !str) return str || '—';
  const re = new RegExp(escapeRegExp(q), 'ig');
  return String(str).replace(re, m => `<span class="search-highlight">${m}</span>`);
}

// Recherche fuzzy optionnelle (plus tolérante)
function fuzzyMatch(needle, haystack) {
  if (!needle || !haystack) return false;
  needle = needle.toLowerCase().replace(/[\s-_]/g, '');
  haystack = haystack.toLowerCase().replace(/[\s-_]/g, '');
  
  let j = 0;
  for (let i = 0; i < haystack.length && j < needle.length; i++) {
    if (haystack[i] === needle[j]) j++;
  }
  return j === needle.length;
}

// Filtre texte utilisant les helpers existants
function applyTextSearch(list) {
  if (!q) return list;
  const needle = q.toLowerCase();
  const useFuzzy = q.length > 3; // Active fuzzy pour les requêtes > 3 chars
  
  return list.filter(e => {
    const fields = [
      getTicker(e),
      getName(e),
      e.isin,
      getCountry(e),
      getSectorMain(e),
      getFundType(e)
    ].filter(Boolean);
    
    if (useFuzzy) {
      return fields.some(f => fuzzyMatch(needle, String(f)));
    } else {
      return fields.some(f => String(f).toLowerCase().includes(needle));
    }
  });
}

// Debounce amélioré avec indication de chargement
function debounce(fn, ms = 150) { 
  let t; 
  return (...args) => { 
    clearTimeout(t);
    document.body.classList.add('searching');
    t = setTimeout(() => {
      fn(...args);
      document.body.classList.remove('searching');
    }, ms); 
  }; 
}

// ============================================
// 3) MODIFICATION DE LA FONCTION RENDER
// ============================================
// Remplacez le début de votre fonction render() existante par :
function render() {
  // Sauvegarde de l'onglet actuel avant recherche
  if (!q && !previousTab) {
    const currentActive = $('#etf-az-tabs .region-tab.active');
    if (currentActive && !currentActive.classList.contains('all-results')) {
      previousTab = currentActive.dataset.letter;
    }
  }
  
  const scoped = takeScope(dataAll);
  const searched = applyTextSearch(scoped);     // Application de la recherche
  const filtered = applySubfilters(searched);
  
  indexAZ = indexByLetter(filtered);
  $('#etf-az-count').textContent = filtered.length;
  if (lastUpdate) $('#etf-az-lastupdate').textContent = new Date(lastUpdate).toLocaleString('fr-FR');
  
  // Gestion de l'affichage des infos de recherche
  const info = $('#etf-az-search-info');
  const count = $('#etf-az-search-count');
  const hint = $('#etf-az-search-hint');
  
  if (info && count) {
    const hasQ = !!q;
    info.classList.toggle('hidden', !hasQ);
    count.textContent = filtered.length;
    
    // Message contextuel
    if (hint && hasQ) {
      if (filtered.length === 0) {
        hint.textContent = '• Essayez avec moins de caractères ou vérifiez l\'orthographe';
      } else if (filtered.length === 1) {
        hint.textContent = '• Appuyez sur Entrée pour voir les détails';
      } else if (filtered.length > 50) {
        hint.textContent = '• Affinez votre recherche pour moins de résultats';
      } else {
        hint.textContent = '';
      }
    }
    
    if (hasQ) {
      // Forcer l'onglet "TOUS" pendant la recherche
      const allBtn = $$('#etf-az-tabs .region-tab').find(b => b.dataset.letter === 'all');
      if (allBtn) {
        $$('#etf-az-tabs .region-tab').forEach(t => t.classList.remove('active'));
        allBtn.classList.add('active');
      }
      $$('#etf-az-container .etf-letter').forEach(div => div.classList.remove('hidden'));
    } else if (previousTab && !hasQ) {
      // Restaurer l'onglet précédent après suppression de la recherche
      const tabToRestore = $(`#etf-az-tabs [data-letter="${previousTab}"]`);
      if (tabToRestore) {
        $$('#etf-az-tabs .region-tab').forEach(t => t.classList.remove('active'));
        tabToRestore.classList.add('active');
        $$('#etf-az-container .etf-letter').forEach(div => {
          div.classList.toggle('hidden', div.id !== `etf-az-${previousTab}`);
        });
      }
    }
  }
  
  // Dans la boucle de rendu des lignes, remplacez l'affichage du ticker et nom par :
  // const tickerHTML = highlight(getTicker(etf));
  // const nameHTML = highlight(getName(etf));
  
  // ... reste de la fonction render() ...
}

// ============================================
// 4) CÂBLAGE DES ÉVÉNEMENTS DE RECHERCHE
// ============================================
// Ajoutez cette fonction et appelez-la dans init()
function wireSearchControls() {
  const searchInput = $('#etf-az-search');
  const clearBtn = $('#etf-az-clear');
  
  // Restaurer la recherche sauvegardée
  const savedSearch = sessionStorage.getItem('etf-search');
  if (savedSearch && searchInput) {
    searchInput.value = savedSearch;
    q = savedSearch;
    if (clearBtn) clearBtn.style.opacity = '1';
    searchInput.classList.add('active');
  }
  
  if (searchInput) {
    // Recherche avec debounce
    searchInput.addEventListener('input', debounce(e => {
      q = e.target.value.trim();
      sessionStorage.setItem('etf-search', q);
      searchInput.classList.toggle('active', !!q);
      if (clearBtn) clearBtn.style.opacity = q ? '1' : '0';
      render();
    }, 150));
    
    // Gestion des touches
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        searchInput.value = '';
        q = '';
        sessionStorage.removeItem('etf-search');
        searchInput.classList.remove('active');
        if (clearBtn) clearBtn.style.opacity = '0';
        render();
      } else if (e.key === 'Enter' && q) {
        e.preventDefault();
        // Optionnel : ouvrir automatiquement les détails du premier résultat
        const firstToggle = $('#etf-az-container tr:not(.details-row) .details-toggle');
        if (firstToggle) {
          firstToggle.click();
          firstToggle.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!searchInput) return;
      searchInput.value = '';
      q = '';
      sessionStorage.removeItem('etf-search');
      searchInput.classList.remove('active');
      clearBtn.style.opacity = '0';
      searchInput.focus();
      render();
    });
  }
}

// ============================================
// 5) HTML À AJOUTER DANS #etf-az-controls
// ============================================
/*
<!-- Barre de recherche (ETF A→Z) -->
<div class="search-container mt-3">
  <div class="search-wrapper relative">
    <input
      type="text"
      id="etf-az-search"
      placeholder="Rechercher un ETF (ticker, nom, ISIN, pays, secteur…)"
      class="w-full py-3 px-12 rounded-lg border bg-white/5 border-white/10 focus:outline-none focus:ring-0"
      autocomplete="off"
      aria-label="Rechercher un ETF"
      aria-describedby="etf-az-search-info"
    />
    <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 opacity-70"></i>
    <button
      id="etf-az-clear"
      class="clear-btn absolute right-4 top-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-200"
      aria-label="Effacer la recherche"
      tabindex="-1"
    >
      <i class="fas fa-times"></i>
    </button>
  </div>
  <div id="etf-az-search-info" class="mt-2 text-sm opacity-70 hidden" aria-live="polite">
    <span id="etf-az-search-count">0</span> résultat(s) trouvé(s)
    <span id="etf-az-search-hint" class="ml-2 text-xs opacity-60"></span>
  </div>
</div>
*/

// ============================================
// 6) CSS ADDITIONNELS (déjà dans le fichier)
// ============================================
/*
.search-highlight {
  background: var(--accent-subtle);
  border-radius: 4px;
  padding: 0 2px;
  font-weight: 600;
  color: var(--accent-color);
}

.searching #etf-az-container {
  opacity: 0.6;
  transition: opacity 0.2s ease;
}
*/

// ============================================
// 7) INTÉGRATION DANS init()
// ============================================
// Dans votre fonction init() existante, ajoutez :
// wireSearchControls(); // après wireControls();