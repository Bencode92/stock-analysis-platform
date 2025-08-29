// Script d'intégration pour ajouter le composeur multi-critères
// À exécuter après le chargement de la page

// 1. Ajouter les styles CSS
const mcStyles = document.createElement('style');
mcStyles.textContent = `
/* ===== STYLES POUR LE COMPOSEUR MULTI-CRITÈRES ===== */
.mini-input,.mini-select{padding:8px 10px;border-radius:8px;border:1px solid var(--card-border);background:rgba(255,255,255,0.05);font-size:.9rem}
.mc-pill{display:inline-flex;gap:8px;align-items:center;padding:6px 10px;border:1px solid var(--card-border);border-radius:10px;background:rgba(255,255,255,0.04);cursor:pointer;font-size:.9rem;transition:all 0.2s ease}
.mc-pill:hover{background:rgba(0,255,135,0.08);border-color:var(--accent-medium)}
.mc-pill input{accent-color:#00FF87}
.mc-row{display:flex;gap:8px;align-items:center}
.mc-score{font-weight:800;color:var(--accent-color)}
`;
document.head.appendChild(mcStyles);

// 2. Masquer les anciens blocs NASDAQ et insérer le nouveau bloc
document.addEventListener('DOMContentLoaded', function() {
    // Masquer le sélecteur de marché
    const marketSelector = document.querySelector('.market-selector');
    if (marketSelector && !marketSelector.classList.contains('hidden')) {
        marketSelector.classList.add('hidden');
    }
    
    // Masquer la pagination
    const paginationContainer = document.getElementById('pagination-container');
    if (paginationContainer && !paginationContainer.classList.contains('hidden')) {
        paginationContainer.classList.add('hidden');
    }
    
    // Masquer le bloc Top 10 NASDAQ
    const nasdaqTopContainer = document.querySelector('.top-stocks-container:nth-of-type(3)');
    if (nasdaqTopContainer && !nasdaqTopContainer.classList.contains('hidden')) {
        nasdaqTopContainer.classList.add('hidden');
    }
    
    // Insérer le nouveau bloc MC juste avant le marketSelector (donc à la place du bloc NASDAQ)
    if (marketSelector && !document.getElementById('mc-section')) {
        const mcSection = document.createElement('div');
        mcSection.innerHTML = `
<!-- ===== COMPOSER MULTI-CRITÈRES (remplace l'ancien Top 10 NASDAQ) ===== -->
<section id="mc-section" class="mb-10">
  <h2 class="section-title mb-4">Top 10 — Composer multi-critères</h2>

  <div id="mc-root" class="glassmorphism rounded-lg p-4 mb-4">
    <div class="grid md:grid-cols-3 gap-4">
      <!-- (A) Critères -->
      <div>
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

        <div class="text-xs opacity-60 mt-2">
          Mode : <b>Équilibre auto</b> (par défaut) ou <b>Priorités</b>
        </div>
        <div class="flex gap-2 mt-2">
          <label class="mc-pill"><input type="radio" name="mc-mode" value="balanced" checked> Équilibre auto</label>
          <label class="mc-pill"><input type="radio" name="mc-mode" value="lexico"> Priorités</label>
        </div>
        <div id="mc-lexico" class="mt-2 hidden">
          <div class="text-xs opacity-70 mb-1">Priorités</div>
          <div class="grid grid-cols-3 gap-2">
            <select id="mc-prio1" class="mini-select"></select>
            <select id="mc-prio2" class="mini-select"></select>
            <select id="mc-prio3" class="mini-select"></select>
          </div>
        </div>
      </div>

      <!-- (B) Filtres rapides -->
      <div>
        <div class="text-sm opacity-70 mb-2">Filtres rapides</div>
        <div class="space-y-2">
          <label class="mc-row"><input id="q-1y10" type="checkbox"> Inclure seulement : Perf 1Y ≥ <b>+10%</b></label>
          <label class="mc-row"><input id="q-ytd10" type="checkbox"> Inclure seulement : YTD ≥ <b>+10%</b></label>
          <label class="mc-row"><input id="q-noNeg1y" type="checkbox"> Exclure : Perf 1Y ≤ <b>0%</b></label>
          <label class="mc-row"><input id="q-vol40" type="checkbox"> Exclure : Vol 3Y ≥ <b>40%</b></label>
        </div>
      </div>

      <!-- (C) Actions -->
      <div>
        <div class="text-sm opacity-70 mb-2">Actions</div>
        <div class="flex gap-2 mb-2">
          <button id="mc-apply" class="search-button"><i class="fas fa-magic mr-2"></i>Appliquer</button>
          <button id="mc-reset" class="action-button"><i class="fas fa-undo mr-2"></i>Réinitialiser</button>
        </div>
        <div class="text-xs opacity-60">
          Sortie : <b>Top 10</b> ci-dessous.
          <div id="mc-summary" class="mt-1"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Résultats Top 10 multi-critères -->
  <div id="mc-results" class="glassmorphism rounded-lg p-4">
    <div class="stock-cards-container">
      <div class="stock-card">
        <div class="rank">#1</div>
        <div class="stock-info">
          <div class="stock-name">En attente <i class="fas fa-spinner fa-spin ml-1"></i></div>
          <div class="stock-fullname">Clique "Appliquer"</div>
        </div>
        <div class="stock-performance neutral">—</div>
      </div>
    </div>
  </div>
</section>
        `;
        // Insérer juste avant le marketSelector (donc à la place du bloc NASDAQ)
        marketSelector.parentElement.insertBefore(mcSection.firstElementChild, marketSelector);
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