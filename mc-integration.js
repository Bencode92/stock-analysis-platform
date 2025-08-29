// Script d'intégration pour ajouter le composeur multi-critères avec nouvelle structure
// À exécuter après le chargement de la page

// 1. Ajouter les styles CSS améliorés
const mcStyles = document.createElement('style');
mcStyles.textContent = `
/* ===== STYLES POUR LE COMPOSEUR MULTI-CRITÈRES ===== */
:root { --section-gap: 80px; }
.section { margin-bottom: var(--section-gap); }

/* Titre du Composer avec effet glow */
.composer-title {
  font-size: 1.5rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--accent-color);
  text-shadow: 0 0 20px rgba(0,255,135,0.6);
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.composer-title::before,
.composer-title::after {
  content: "✨";
  font-size: 1.2rem;
  animation: sparkle 3s ease-in-out infinite;
}

@keyframes sparkle {
  0%, 100% { opacity: 0.5; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* Ligne sous-titre flashy pour Composer */
.section-highlight {
  position: relative;
  height: 3px;
  margin: 0 0 30px 0;
  background: linear-gradient(90deg, 
    transparent, 
    #00ff87 10%,
    #00ffaa 50%,
    #00ff87 90%,
    transparent);
  box-shadow: 
    0 0 30px rgba(0,255,135,0.5),
    0 0 60px rgba(0,255,135,0.2);
  animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}

/* Diviseur entre sections plus visible */
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

/* Grille Composer : filtres à gauche, résultats à droite */
.composer-grid {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 20px;
}
@media (max-width: 1024px) {
  .composer-grid { grid-template-columns: 1fr; }
}

/* Panneau filtres sticky */
.composer-filters { 
  position: sticky; 
  top: 80px; 
  align-self: start;
  max-height: calc(100vh - 100px);
  overflow-y: auto;
}

/* Styles existants MC */
.mini-input,.mini-select{padding:8px 10px;border-radius:8px;border:1px solid var(--card-border);background:rgba(255,255,255,0.05);font-size:.9rem}
.mc-pill{display:inline-flex;gap:8px;align-items:center;padding:6px 10px;border:1px solid var(--card-border);border-radius:10px;background:rgba(255,255,255,0.04);cursor:pointer;font-size:.9rem;transition:all 0.2s ease}
.mc-pill:hover{background:rgba(0,255,135,0.08);border-color:var(--accent-medium)}
.mc-pill input{accent-color:#00FF87}
.mc-row{display:flex;gap:8px;align-items:center}
.mc-score{font-weight:800;color:var(--accent-color)}
`;
document.head.appendChild(mcStyles);

// 2. Restructurer la page avec diviseurs
document.addEventListener('DOMContentLoaded', function() {
    // Supprimer les anciens blocs NASDAQ
    const marketSelector = document.querySelector('.market-selector');
    if (marketSelector) marketSelector.remove();
    
    const paginationContainer = document.getElementById('pagination-container');
    if (paginationContainer) paginationContainer.remove();
    
    const nasdaqTopContainers = document.querySelectorAll('.top-stocks-container');
    nasdaqTopContainers.forEach((container, index) => {
        if (index === 1) {
            const prevTitle = container.previousElementSibling;
            if (prevTitle && prevTitle.textContent.includes('NASDAQ')) {
                prevTitle.remove();
            }
            container.remove();
        }
    });
    
    // Créer la nouvelle section Composer
    const actionsParLettre = Array.from(document.querySelectorAll('h2.section-title'))
        .find(title => title.textContent.includes('Actions par lettre'));
    
    if (actionsParLettre && !document.getElementById('mc-section')) {
        // Créer section Composer avec titre stylé et ligne sous-titre
        const mcSection = document.createElement('section');
        mcSection.id = 'mc-section';
        mcSection.className = 'section';
        mcSection.innerHTML = `
  <h2 class="composer-title">Top 10 — Composer multi-critères</h2>
  <div class="section-highlight"></div>
  
  <div class="composer-grid">
    <!-- Colonne gauche : Filtres -->
    <aside class="composer-filters glassmorphism rounded-lg p-4">
      <div class="mb-4">
        <div class="text-sm opacity-70 mb-2">Critères (sans pondération)</div>
        <div class="flex flex-wrap gap-2">
          <label class="mc-pill"><input id="m-perf_1y" type="checkbox" checked> Perf 1Y ↑</label>
          <label class="mc-pill"><input id="m-ytd" type="checkbox"> YTD ↑</label>
          <label class="mc-pill"><input id="m-perf_3m" type="checkbox"> Perf 3M ↑</label>
          <label class="mc-pill"><input id="m-perf_1m" type="checkbox"> Perf 1M ↑</label>
          <label class="mc-pill"><input id="m-volatility_3y" type="checkbox" checked> Vol 3Y ↓</label>
          <label class="mc-pill"><input id="m-max_drawdown_3y" type="checkbox"> Max DD 3Y ↓</label>
          <label class="mc-pill"><input id="m-dividend_yield" type="checkbox"> Div. Yield ↑</label>
        </div>
      </div>

      <div class="mb-4">
        <div class="text-xs opacity-60 mb-2">Mode de tri</div>
        <div class="flex gap-2">
          <label class="mc-pill"><input type="radio" name="mc-mode" value="balanced" checked> Équilibre auto</label>
          <label class="mc-pill"><input type="radio" name="mc-mode" value="lexico"> Priorités</label>
        </div>
        <div id="mc-lexico" class="mt-2 hidden">
          <div class="text-xs opacity-70 mb-1">Ordre des priorités</div>
          <div class="grid grid-cols-3 gap-2">
            <select id="mc-prio1" class="mini-select"></select>
            <select id="mc-prio2" class="mini-select"></select>
            <select id="mc-prio3" class="mini-select"></select>
          </div>
        </div>
      </div>

      <div class="mb-4">
        <div class="text-sm opacity-70 mb-2">Filtres rapides</div>
        <div class="space-y-2">
          <label class="mc-row"><input id="q-1y10" type="checkbox"> Inclure : Perf 1Y ≥ <b>+10%</b></label>
          <label class="mc-row"><input id="q-ytd10" type="checkbox"> Inclure : YTD ≥ <b>+10%</b></label>
          <label class="mc-row"><input id="q-noNeg1y" type="checkbox"> Exclure : Perf 1Y ≤ <b>0%</b></label>
          <label class="mc-row"><input id="q-vol40" type="checkbox"> Exclure : Vol 3Y ≥ <b>40%</b></label>
        </div>
      </div>

      <div class="border-t border-white/10 pt-4">
        <div class="flex gap-2">
          <button id="mc-apply" class="search-button flex-1"><i class="fas fa-magic mr-2"></i>Appliquer</button>
          <button id="mc-reset" class="action-button"><i class="fas fa-undo"></i></button>
        </div>
        <div id="mc-summary" class="text-xs opacity-60 mt-2"></div>
      </div>
    </aside>

    <!-- Colonne droite : Résultats -->
    <div>
      <div id="mc-results" class="glassmorphism rounded-lg p-4">
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
        
        // Marquer les sections existantes
        const topGlobal = document.getElementById('top-global-container');
        if (topGlobal) {
            topGlobal.parentElement.parentElement.classList.add('section');
            topGlobal.parentElement.parentElement.id = 'sec-global';
        }
        
        actionsParLettre.parentElement.classList.add('section');
        actionsParLettre.parentElement.id = 'sec-letters';
    }
    
    // Charger le module MC
    setTimeout(() => {
        if (!window.MC) {
            const script = document.createElement('script');
            script.src = 'mc-module.js';
            document.body.appendChild(script);
        }
    }, 500);
});

console.log('✅ Script d\'intégration MC chargé');