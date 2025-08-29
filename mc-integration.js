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
      rgba(0,255,135,0.8) 15%,
      rgba(0,255,170,0.9) 50%,
      rgba(0,255,135,0.8) 85%,
      transparent);
    box-shadow: 
      0 0 25px rgba(0,255,135,0.5),
      0 0 50px rgba(0,255,135,0.2);
    animation: pulse-line 2s ease-in-out infinite;
  }

  @keyframes pulse-line {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  
  /* Support pour reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .section-highlight-top { 
      animation: none; 
      box-shadow: 0 0 10px rgba(0,255,135,0.3);
    }
  }

  /* Titre du Composer centré et professionnel */
  .composer-title {
    font-size: 1.3rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent-color);
    text-align: center;
    margin-bottom: 20px;
    opacity: 0.95;
  }

  /* Ligne sous-titre simple et élégante */
  .section-highlight {
    position: relative;
    height: 2px;
    margin: 0 auto 30px;
    max-width: 300px;
    background: linear-gradient(90deg, 
      transparent, 
      rgba(0,255,135,0.6) 20%,
      rgba(0,255,135,0.6) 80%,
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

  /* Grille Composer plus flexible */
  .composer-grid {
    display: grid;
    grid-template-columns: minmax(280px, 360px) 1fr;
    gap: 20px;
  }
  @media (max-width: 1024px) {
    .composer-grid { grid-template-columns: 1fr; }
  }

  /* Panneau filtres sticky avec variables CSS */
  .composer-filters { 
    position: sticky; 
    top: calc(var(--header-height, 60px) + 12px);
    align-self: start;
    max-height: calc(100vh - (var(--header-height, 60px) + 24px));
    overflow-y: auto;
  }

  /* Styles existants MC */
  .mini-input,.mini-select{padding:8px 10px;border-radius:8px;border:1px solid var(--card-border);background:rgba(255,255,255,0.05);font-size:.9rem}
  .mc-pill{display:inline-flex;gap:8px;align-items:center;padding:6px 10px;border:1px solid var(--card-border);border-radius:10px;background:rgba(255,255,255,0.04);cursor:pointer;font-size:.9rem;transition:all 0.2s ease}
  .mc-pill:hover{background:rgba(0,255,135,0.08);border-color:var(--accent-medium)}
  .mc-pill input{accent-color:#00FF87}
  .mc-row{display:flex;gap:8px;align-items:center}
  .mc-score{font-weight:800;color:var(--accent-color)}
  
  /* Amélioration accessibilité fieldsets */
  fieldset {
    border: none;
    padding: 0;
    margin: 0 0 1rem;
  }
  fieldset legend {
    padding: 0;
    margin-bottom: 0.5rem;
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
        // Créer section Composer avec structure accessible
        const mcSection = document.createElement('section');
        mcSection.id = 'mc-section';
        mcSection.className = 'section';
        mcSection.innerHTML = `
  <div class="section-highlight-top"></div>
  <h2 class="composer-title">Top 10 — Composer multi-critères</h2>
  <div class="section-highlight"></div>
  
  <div class="composer-grid">
    <!-- Colonne gauche : Filtres avec fieldsets pour accessibilité -->
    <aside class="composer-filters glassmorphism rounded-lg p-4" role="complementary" aria-label="Filtres du composeur">
      <fieldset>
        <legend class="text-sm opacity-70 mb-2">Critères (sans pondération)</legend>
        <div class="flex flex-wrap gap-2">
          <label class="mc-pill"><input id="m-perf_1y" type="checkbox" checked aria-label="Performance 1 an"> Perf 1Y ↑</label>
          <label class="mc-pill"><input id="m-ytd" type="checkbox" aria-label="Year to date"> YTD ↑</label>
          <label class="mc-pill"><input id="m-perf_3m" type="checkbox" aria-label="Performance 3 mois"> Perf 3M ↑</label>
          <label class="mc-pill"><input id="m-perf_1m" type="checkbox" aria-label="Performance 1 mois"> Perf 1M ↑</label>
          <label class="mc-pill"><input id="m-volatility_3y" type="checkbox" checked aria-label="Volatilité 3 ans"> Vol 3Y ↓</label>
          <label class="mc-pill"><input id="m-max_drawdown_3y" type="checkbox" aria-label="Drawdown maximum 3 ans"> Max DD 3Y ↓</label>
          <label class="mc-pill"><input id="m-dividend_yield" type="checkbox" aria-label="Rendement dividende"> Div. Yield ↑</label>
        </div>
      </fieldset>

      <fieldset role="radiogroup" aria-label="Mode de tri">
        <legend class="text-xs opacity-60 mb-2">Mode de tri</legend>
        <div class="flex gap-2">
          <label class="mc-pill"><input type="radio" name="mc-mode" value="balanced" checked> Équilibre auto</label>
          <label class="mc-pill"><input type="radio" name="mc-mode" value="lexico"> Priorités</label>
        </div>
        <div id="mc-lexico" class="mt-2 hidden" aria-hidden="true">
          <div class="text-xs opacity-70 mb-1">Ordre des priorités</div>
          <div class="grid grid-cols-3 gap-2">
            <select id="mc-prio1" class="mini-select" aria-label="Priorité 1"></select>
            <select id="mc-prio2" class="mini-select" aria-label="Priorité 2"></select>
            <select id="mc-prio3" class="mini-select" aria-label="Priorité 3"></select>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend class="text-sm opacity-70 mb-2">Filtres rapides</legend>
        <div class="space-y-2">
          <label class="mc-row"><input id="q-1y10" type="checkbox" aria-label="Inclure performance 1 an supérieure à 10%"> Inclure : Perf 1Y ≥ <b>+10%</b></label>
          <label class="mc-row"><input id="q-ytd10" type="checkbox" aria-label="Inclure YTD supérieur à 10%"> Inclure : YTD ≥ <b>+10%</b></label>
          <label class="mc-row"><input id="q-noNeg1y" type="checkbox" aria-label="Exclure performance 1 an négative"> Exclure : Perf 1Y ≤ <b>0%</b></label>
          <label class="mc-row"><input id="q-vol40" type="checkbox" aria-label="Exclure volatilité supérieure à 40%"> Exclure : Vol 3Y ≥ <b>40%</b></label>
        </div>
      </fieldset>

      <div class="border-t border-white/10 pt-4">
        <div class="flex gap-2">
          <button id="mc-apply" class="search-button flex-1" aria-label="Appliquer les filtres"><i class="fas fa-magic mr-2"></i>Appliquer</button>
          <button id="mc-reset" class="action-button" aria-label="Réinitialiser les filtres"><i class="fas fa-undo"></i></button>
        </div>
        <div id="mc-summary" class="text-xs opacity-60 mt-2" role="status" aria-live="polite"></div>
      </div>
    </aside>

    <!-- Colonne droite : Résultats avec aria-live -->
    <div>
      <div id="mc-results" class="glassmorphism rounded-lg p-4" aria-live="polite" aria-label="Résultats du composeur">
        <div class="stock-cards-container">
          <div class="stock-card">
            <div class="rank">#1</div>
            <div class="stock-info">
              <div class="stock-name">En attente <i class="fas fa-spinner fa-spin ml-1"></i></div>
              <div class="stock-fullname">Configure et clique "Appliquer"</div>
            </div>
            <div class="stock-performance neutral">—</div>
          </div>
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