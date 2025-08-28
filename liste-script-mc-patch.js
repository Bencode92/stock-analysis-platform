// Patch pour modifier le module MC afin d'utiliser mc-top-container au lieu de top-global-container
(function() {
  // Attendre que le module MC soit chargé
  const originalRenderTop10 = window.MC?.renderTop10 || function(){};
  
  // Redéfinir la fonction renderTop10 du module MC
  if (window.MC) {
    window.MC.renderTop10 = function(entries) {
      const host = document.getElementById('mc-top-container');
      if (!host) return;

      // Afficher le container des résultats MC
      const resultsContainer = document.getElementById('mc-results-container');
      if (resultsContainer) {
        resultsContainer.style.display = 'block';
      }

      const cards = document.createElement('div');
      cards.className = 'stock-cards-container';
      const top10 = entries.slice(0,10);

      // si <10 → compléter par des placeholders
      while (top10.length < 10) top10.push({ s: null, score: NaN, why:'' });

      top10.forEach((e, i) => {
        const card = document.createElement('div');
        card.className = 'stock-card';
        if (!e.s){
          card.innerHTML = `
            <div class="rank">#${i+1}</div>
            <div class="stock-info">
              <div class="stock-name">—</div>
              <div class="stock-fullname">Aucun titre</div>
            </div>
            <div class="stock-performance neutral">—</div>
          `;
          cards.appendChild(card);
          return;
        }
        const tkr = e.s.ticker || e.s.symbol || (e.s.name||'').split(' ')[0] || '—';
        const scoreText = Number.isFinite(e.score) ? `${Math.round(e.score*100)} pts` : (e.s.perf_1y || e.s.ytd || '—');
        card.innerHTML = `
          <div class="rank">#${i+1}</div>
          <div class="stock-info">
            <div class="stock-name">${tkr} ${e.s.marketIcon||''}</div>
            <div class="stock-fullname" title="${e.s.name||''}">${e.s.name||'—'}</div>
          </div>
          <div class="stock-performance positive"><span class="mc-score">${scoreText}</span></div>
        `;
        cards.appendChild(card);
      });

      host.innerHTML = '';
      host.appendChild(cards);
    };
  }
})();