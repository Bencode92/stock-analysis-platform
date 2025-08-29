// Script d'intégration pour ajouter le composeur multi-critères avec nouvelle structure
// À exécuter après le chargement de la page

// 1. Ajouter les styles CSS améliorés (avec idempotence)
if (!document.getElementById('mc-styles')) {
  const mcStyles = document.createElement('style');
  mcStyles.id = 'mc-styles';
  mcStyles.textContent = `
  /* ===== STYLES POUR LE COMPOSEUR MULTI-CRITÈRES ===== */
  :root { --section-gap: 80px; }
  .section { margin-bottom: var(--section-gap); }

  /* Ligne flashy au-dessus du titre */
  .section-highlight-top {
    position: relative;
    height: 2px;
    margin: 0 auto 20px;
    max-width: 500px;
    background: linear-gradient(90deg, 
      transparent, 
      rgba(0,255,255,0.6) 15%,
      rgba(0,255,255,0.8) 50%,
      rgba(0,255,255,0.6) 85%,
      transparent);
    box-shadow: 0 0 15px rgba(0,255,255,0.3);
  }
  
  /* Support pour reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .section-highlight-top { 
      box-shadow: none;
    }
  }

  /* Titre du Composer en CYAN */
  .composer-title {
    font-size: 1.3rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #00ffff !important;
    text-align: center;
    margin-bottom: 20px;
    text-shadow: 0 0 10px rgba(0,255,255,0.4);
  }

  /* Ligne sous-titre simple et élégante */
  .section-highlight {
    position: relative;
    height: 2px;
    margin: 0 auto 30px;
    max-width: 300px;
    background: linear-gradient(90deg, 
      transparent, 
      rgba(0,255,255,0.6) 20%,
      rgba(0,255,255,0.6) 80%,
      transparent);
  }

  /* Diviseur entre sections */
  .section-divider {
    position: relative;
    height: 2px;
    margin: 80px 0 60px;
    background: linear-gradient(90deg, 
      transparent, 
      rgba(0,255,135,0.3) 20%, 
      rgba(0,255,135,0.3) 80%, 
      transparent);
    box-shadow: 0 0 20px rgba(0,255,135,0.2);
  }

  /* Grille Composer ÉLARGIE pour les filtres */
  .composer-grid {
    display: grid;
    grid-template-columns: minmax(380px, 450px) 1fr;
    gap: 24px;
  }
  
  @media (max-width: 1200px) {
    .composer-grid { 
      grid-template-columns: minmax(340px, 400px) 1fr;
      gap: 20px;
    }
  }
  
  @media (max-width: 1024px) {
    .composer-grid { 
      grid-template-columns: 1fr; 
    }
  }

  /* === PANNEAU FILTRES EN CYAN ÉLARGI === */
  .composer-filters { 
    position: sticky; 
    top: calc(var(--header-height, 60px) + 12px);
    align-self: start;
    max-height: calc(100vh - (var(--header-height, 60px) + 24px));
    overflow-y: auto;
    
    /* Style cyan SANS brillance */
    background: linear-gradient(135deg, 
      rgba(0, 200, 255, 0.05), 
      rgba(0, 255, 255, 0.03)) !important;
    border: 1px solid rgba(0, 200, 255, 0.3) !important;
    box-shadow: 0 4px 12px rgba(0, 200, 255, 0.1) !important;
  }

  /* Styles existants MC avec accent cyan */
  .mini-input,.mini-select{
    padding:8px 12px;
    border-radius:8px;
    border:1px solid rgba(0, 200, 255, 0.3);
    background:rgba(0, 255, 255, 0.05);
    font-size:.9rem;
    color: #fff;
    width: 100%;
  }
  
  .mini-input:focus, .mini-select:focus {
    border-color: #00ffff;
    box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
    outline: none;
  }
  
  /* Ajustement pour les contrôles de filtres */
  .filter-controls .mini-select,
  .filter-controls .mini-input {
    padding: 6px 8px;
    font-size: 0.85rem;
  }
  
  .mc-pill{
    display:inline-flex;
    gap:8px;
    align-items:center;
    padding:6px 10px;
    border:1px solid rgba(0, 200, 255, 0.2);
    border-radius:10px;
    background:rgba(0, 255, 255, 0.03);
    cursor:pointer;
    font-size:.9rem;
    transition:all 0.2s ease;
  }
  
  .mc-pill:hover{
    background:rgba(0, 255, 255, 0.1);
    border-color: rgba(0, 255, 255, 0.5);
  }
  
  /* Effet cyan au clic */
  .mc-pill:active,
  .mc-pill input:checked + .mc-pill {
    background:rgba(0, 255, 255, 0.2) !important;
    border-color: #00ffff !important;
    box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
  }
  
  .mc-pill input{accent-color:#00ffff}
  
  .mc-row{
    display:flex;
    gap:8px;
    align-items:center;
  }
  
  .mc-score{font-weight:800;color:#00ffff}
  
  /* Amélioration accessibilité fieldsets avec plus d'espace */
  fieldset {
    border: none;
    padding: 0;
    margin: 0 0 1.25rem;
  }
  
  fieldset legend {
    padding: 0;
    margin-bottom: 0.75rem;
    color: rgba(0, 255, 255, 0.8);
    font-weight: 600;
  }
  
  /* Espacement pour les filtres géographiques */
  #geo-filters-container .flex {
    margin-bottom: 0.75rem;
  }
  
  #geo-filters-container label {
    min-width: 80px !important;
  }
  
  /* Boutons avec style cyan et effet clic */
  .composer-filters .search-button {
    background: linear-gradient(135deg, rgba(0, 200, 255, 0.2), rgba(0, 255, 255, 0.1));
    border: 1px solid rgba(0, 255, 255, 0.5);
    color: #00ffff;
    transition: all 0.2s ease;
  }
  
  .composer-filters .search-button:hover {
    background: linear-gradient(135deg, rgba(0, 200, 255, 0.3), rgba(0, 255, 255, 0.2));
    border-color: #00ffff;
  }
  
  .composer-filters .search-button:active {
    background: rgba(0, 255, 255, 0.4) !important;
    box-shadow: 0 0 15px rgba(0, 255, 255, 0.5);
    transform: scale(0.98);
  }
  
  .composer-filters .action-button {
    background: rgba(0, 255, 255, 0.1);
    border: 1px solid rgba(0, 255, 255, 0.3);
    transition: all 0.2s ease;
  }
  
  .composer-filters .action-button:hover {
    background: rgba(0, 255, 255, 0.2);
    border-color: rgba(0, 255, 255, 0.5);
  }
  
  .composer-filters .action-button:active {
    background: rgba(0, 255, 255, 0.3) !important;
    transform: scale(0.95);
  }
  
  /* === ZONE DE RÉSULTATS CYAN SANS BRILLANCE === */
  
  #mc-results {
    background: linear-gradient(135deg, 
      rgba(0, 200, 255, 0.05), 
      rgba(0, 255, 255, 0.03)) !important;
    border: 1px solid rgba(0, 200, 255, 0.3) !important;
    box-shadow: 0 4px 12px rgba(0, 200, 255, 0.1) !important;
    position: relative;
    overflow: hidden;
  }
  
  /* Suppression de l'animation brillante */
  #mc-results::before {
    display: none;
  }
  
  /* Conteneur de résultats verticaux */
  #mc-results .space-y-2 > div {
    margin-bottom: 0.5rem;
  }
  
  /* Carte de résultat avec teinte cyan SANS brillance */
  #mc-results .glassmorphism {
    background: linear-gradient(135deg,
      rgba(0, 200, 255, 0.03),
      rgba(0, 255, 255, 0.02)) !important;
    border: 1px solid rgba(0, 200, 255, 0.15) !important;
    transition: all 0.2s ease;
  }
  
  #mc-results .glassmorphism:hover {
    background: linear-gradient(135deg,
      rgba(0, 200, 255, 0.06),
      rgba(0, 255, 255, 0.04)) !important;
    border-color: rgba(0, 255, 255, 0.3) !important;
    transform: translateX(2px);
  }
  
  /* Effet cyan au clic sur les cartes */
  #mc-results .glassmorphism:active {
    background: rgba(0, 255, 255, 0.15) !important;
    border-color: #00ffff !important;
    transform: translateX(0) scale(0.99);
  }
  
  /* Rang avec couleur cyan */
  #mc-results .rank {
    font-size: 1.5rem;
    font-weight: 900;
    color: #00ffff;
    text-shadow: 0 0 5px rgba(0, 255, 255, 0.3);
    opacity: 0.9;
    min-width: 50px;
  }
  
  /* === DRAG & DROP POUR PRIORITÉS === */
  
  #priority-container {
    background: rgba(0, 255, 255, 0.03);
    border: 1px solid rgba(0, 255, 255, 0.2);
  }
  
  .priority-item {
    cursor: move;
    transition: all 0.2s ease;
    user-select: none;
    background: rgba(0, 255, 255, 0.05);
    border: 1px solid rgba(0, 255, 255, 0.2);
  }
  
  .priority-item:hover {
    background: rgba(0, 255, 255, 0.1) !important;
    border-color: rgba(0, 255, 255, 0.4);
  }
  
  .priority-item:active {
    background: rgba(0, 255, 255, 0.2) !important;
    border-color: #00ffff !important;
  }
  
  .priority-item.dragging {
    opacity: 0.5;
  }
  
  .priority-item .drag-handle {
    color: #00ffff;
    opacity: 0.7;
    font-size: 0.9rem;
    cursor: grab;
  }
  
  .priority-item:active .drag-handle {
    cursor: grabbing;
  }
  
  .priority-number {
    min-width: 20px;
    font-weight: 600;
    color: #00ffff;
  }
  
  /* Conteneur de priorités vide */
  #priority-list:empty::after {
    content: "Cochez des critères pour définir les priorités";
    display: block;
    text-align: center;
    opacity: 0.5;
    font-size: 0.75rem;
    padding: 1rem;
  }
  
  /* Explications des modes */
  #mode-explanation {
    background: rgba(0, 255, 255, 0.05);
    border-left: 2px solid #00ffff;
    font-size: 0.75rem;
  }
  
  #mode-explanation strong {
    color: #00ffff;
    display: block;
    margin-bottom: 0.25rem;
  }
  
  /* Colonnes de métriques dans les résultats */
  #mc-results .flex.gap-4 {
    display: flex;
    gap: 1rem;
    align-items: center;
  }
  
  #mc-results .flex.gap-4 > div {
    min-width: 70px;
  }
  
  /* Couleurs pour les valeurs */
  .text-green-400 { color: #4ade80; }
  .text-red-400 { color: #f87171; }
  .text-yellow-400 { color: #facc15; }
  .text-blue-400 { color: #60a5fa; }
  .text-cyan-400 { color: #00ffff; }
  
  /* Info sur le nombre d'actions */
  #mc-results .text-center.text-xs {
    border-top: 1px solid rgba(0, 200, 255, 0.2);
    padding-top: 1rem;
    margin-top: 1rem;
    color: rgba(0, 255, 255, 0.7);
  }
  
  /* Filtres personnalisés avec style cyan */
  .filter-item {
    background: rgba(0, 255, 255, 0.05);
    border: 1px solid rgba(0, 255, 255, 0.2);
    transition: all 0.2s ease;
  }
  
  .filter-item:hover {
    background: rgba(0, 255, 255, 0.08) !important;
    border-color: rgba(0, 255, 255, 0.4);
  }
  
  .filter-item:active {
    background: rgba(0, 255, 255, 0.15) !important;
    border-color: #00ffff !important;
  }
  
  /* Summary avec style cyan */
  #mc-summary {
    color: rgba(0, 255, 255, 0.7);
    line-height: 1.4;
    padding: 0.5rem 0;
  }
  
  #mc-summary strong {
    color: #00ffff;
  }
  
  /* Divider en bas des filtres */
  .composer-filters .border-t {
    border-color: rgba(0, 255, 255, 0.2) !important;
  }
  
  /* Bouton + pour ajouter filtre */
  #add-filter {
    background: rgba(0, 255, 255, 0.1) !important;
    border-color: rgba(0, 255, 255, 0.3) !important;
    color: #00ffff !important;
  }
  
  #add-filter:hover {
    background: rgba(0, 255, 255, 0.2) !important;
    border-color: rgba(0, 255, 255, 0.5) !important;
  }
  
  #add-filter:active {
    background: rgba(0, 255, 255, 0.3) !important;
    border-color: #00ffff !important;
    transform: scale(0.9);
  }
  
  /* Amélioration du padding pour les filtres */
  .composer-filters.glassmorphism {
    padding: 1.25rem !important;
  }
  
  /* Plus d'espace entre les sections */
  .composer-filters fieldset + fieldset {
    margin-top: 1.5rem;
  }
  `;
  document.head.appendChild(mcStyles);
}

// 2. Restructurer la page avec diviseurs
document.addEventListener('DOMContentLoaded', function() {
    // Éviter double exécution
    if (document.getElementById('mc-section')) return;
    
    // Suppression plus robuste des anciens blocs
    // Supprimer le sélecteur de marché
    document.querySelector('.market-selector')?.remove();
    
    // Supprimer la pagination
    document.getElementById('pagination-container')?.remove();
    
    // Supprimer le bloc NASDAQ/STOXX de façon plus ciblée
    const marketNameSpan = document.querySelector('#current-market-name');
    if (marketNameSpan) {
        const topStocksWrapper = marketNameSpan.closest('.top-stocks-container');
        if (topStocksWrapper) {
            // Supprimer aussi le titre s'il existe
            const prevSibling = topStocksWrapper.previousElementSibling;
            if (prevSibling && prevSibling.tagName === 'H2') {
                prevSibling.remove();
            }
            topStocksWrapper.remove();
        }
    }
    
    // Fallback : supprimer par index si structure attendue
    const nasdaqTopContainers = document.querySelectorAll('.top-stocks-container');
    nasdaqTopContainers.forEach((container, index) => {
        if (index === 1) { // Le 2e container est généralement NASDAQ/STOXX
            const prevTitle = container.previousElementSibling;
            if (prevTitle && prevTitle.tagName === 'H2') {
                prevTitle.remove();
            }
            container.remove();
        }
    });
    
    // Créer la nouvelle section Composer
    const actionsParLettre = Array.from(document.querySelectorAll('h2.section-title'))
        .find(title => title.textContent.includes('Actions par lettre'));
    
    if (actionsParLettre && !document.getElementById('mc-section')) {
        // Créer section Composer avec structure accessible et critères RÉORGANISÉS
        const mcSection = document.createElement('section');
        mcSection.id = 'mc-section';
        mcSection.className = 'section';
        mcSection.innerHTML = `
  <div class="section-highlight-top"></div>
  <h2 class="composer-title">Top 10 — Composer multi-critères</h2>
  <div class="section-highlight"></div>
  
  <div class="composer-grid">
    <!-- Colonne gauche : Filtres avec interface unifiée et style cyan -->
    <aside class="composer-filters glassmorphism rounded-lg p-4" role="complementary" aria-label="Filtres du composeur">
      <fieldset>
        <legend class="text-sm opacity-70 mb-2">Critères sélectionnés = Ordre de priorité</legend>
        <div class="flex flex-wrap gap-2">
          <!-- Performance (organisé par période) -->
          <label class="mc-pill"><input id="m-perf_daily" type="checkbox" aria-label="Performance journalière"> Perf Daily ↑</label>
          <label class="mc-pill"><input id="m-perf_1m" type="checkbox" aria-label="Performance 1 mois"> Perf 1M ↑</label>
          <label class="mc-pill"><input id="m-perf_3m" type="checkbox" aria-label="Performance 3 mois"> Perf 3M ↑</label>
          <label class="mc-pill"><input id="m-ytd" type="checkbox" checked aria-label="Year to date"> YTD ↑</label>
          <label class="mc-pill"><input id="m-perf_1y" type="checkbox" aria-label="Performance 1 an"> Perf 1Y ↑</label>
          <label class="mc-pill"><input id="m-perf_3y" type="checkbox" aria-label="Performance 3 ans"> Perf 3Y ↑</label>
          <!-- Risque -->
          <label class="mc-pill"><input id="m-volatility_3y" type="checkbox" aria-label="Volatilité 3 ans"> Vol 3Y ↓</label>
          <label class="mc-pill"><input id="m-max_drawdown_3y" type="checkbox" aria-label="Drawdown maximum 3 ans"> Max DD 3Y ↓</label>
          <!-- Dividende -->
          <label class="mc-pill"><input id="m-dividend_yield" type="checkbox" checked aria-label="Rendement dividende"> Div. Yield ↑</label>
        </div>
      </fieldset>

      <fieldset role="radiogroup" aria-label="Mode de tri">
        <legend class="text-xs opacity-60 mb-2">Mode de tri</legend>
        <div class="flex gap-2">
          <label class="mc-pill"><input type="radio" name="mc-mode" value="balanced" checked> Équilibre auto</label>
          <label class="mc-pill"><input type="radio" name="mc-mode" value="lexico"> Priorités</label>
        </div>
        <!-- Le conteneur de priorités sera ajouté dynamiquement ici par JS -->
      </fieldset>

      <fieldset>
        <legend class="text-sm opacity-70 mb-2">Filtres personnalisés</legend>
        <!-- L'interface des filtres sera générée dynamiquement par JS -->
      </fieldset>

      <div class="border-t border-white/10 pt-4">
        <div class="flex gap-2">
          <button id="mc-apply" class="search-button flex-1" aria-label="Appliquer les filtres"><i class="fas fa-magic mr-2"></i>Appliquer</button>
          <button id="mc-reset" class="action-button" aria-label="Réinitialiser les filtres"><i class="fas fa-undo"></i></button>
        </div>
        <div id="mc-summary" class="text-xs opacity-60 mt-2" role="status" aria-live="polite"></div>
      </div>
    </aside>

    <!-- Colonne droite : Résultats avec aria-live et style cyan -->
    <div>
      <div id="mc-results" class="glassmorphism rounded-lg p-4" aria-live="polite" aria-label="Résultats du composeur">
        <div class="stock-cards-container">
          <!-- Les résultats seront générés ici en affichage vertical -->
        </div>
      </div>
    </div>
  </div>
        `;
        
        // Créer diviseur visible entre Composer et Actions par lettre
        const divider = document.createElement('div');
        divider.className = 'section-divider';
        
        // Insérer les éléments
        actionsParLettre.parentElement.insertBefore(mcSection, actionsParLettre);
        actionsParLettre.parentElement.insertBefore(divider, actionsParLettre);
        
        // Marquer les sections existantes avec data attributes
        const topGlobal = document.getElementById('top-global-container');
        if (topGlobal) {
            topGlobal.parentElement.parentElement.classList.add('section');
            topGlobal.parentElement.parentElement.id = 'sec-global';
            topGlobal.parentElement.parentElement.setAttribute('data-section', 'global');
        }
        
        actionsParLettre.parentElement.classList.add('section');
        actionsParLettre.parentElement.id = 'sec-letters';
        actionsParLettre.parentElement.setAttribute('data-section', 'letters');
    }
    
    // Charger le module MC sans setTimeout
    if (!window.MC) {
        const script = document.createElement('script');
        script.src = 'mc-module.js';
        script.defer = true;
        script.addEventListener('load', () => {
            console.log('✅ MC module prêt');
        });
        document.body.appendChild(script);
    }
});

console.log('✅ Script d\'intégration MC chargé');