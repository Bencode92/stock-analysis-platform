// Script d'intégration MC pour ETFs - Non nécessaire car déjà intégré dans etf.html
// La section MC est directement dans le HTML
console.log('✅ ETF MC Integration - Structure déjà dans HTML');

// Synchroniser les pills avec checkboxes
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('#etf-mc-section .mc-pill input').forEach(inp => {
        const label = inp.closest('.mc-pill');
        if (!label) return;
        
        const sync = () => label.classList.toggle('is-checked', inp.checked);
        inp.addEventListener('change', sync);
        sync();
    });
});