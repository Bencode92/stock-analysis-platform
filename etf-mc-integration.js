// Script d'intégration MC pour ETFs - v2.0 avec styles améliorés
// Ajout des styles CSS pour meilleure lisibilité des cartes

// 1. Ajouter les styles CSS améliorés (avec idempotence)
if (!document.getElementById('etf-mc-styles')) {
    const etfMcStyles = document.createElement('style');
    etfMcStyles.id = 'etf-mc-styles';
    etfMcStyles.textContent = `
    /* ===== STYLES AMÉLIORÉS POUR LE COMPOSEUR ETF ===== */
    
    /* Cartes : largeur mini par carte pour éviter la coupe du texte */
    #etf-mc-results .stock-cards-container,
    #top-global-container .stock-cards-container {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    }
    
    /* Sur écrans moyens, forcer encore plus d'espace */
    @media (min-width: 1024px) {
        #etf-mc-results .stock-cards-container,
        #top-global-container .stock-cards-container {
            grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
        }
    }
    
    /* Mise en page de la carte : plus de place pour le bloc texte */
    .stock-card {
        display: grid;
        grid-template-columns: 48px 1fr auto; /* rang | infos | perf */
        align-items: center;
        gap: 12px;
    }
    
    /* Nom complet : 2 lignes visibles + expansion au survol */
    .stock-fullname {
        display: -webkit-box;
        -webkit-line-clamp: 2;            /* 2 lignes au lieu de 1 */
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: normal;               /* autorise le retour à la ligne */
        word-break: break-word;
        max-width: 100%;
        transition: all 0.3s ease;
    }
    
    /* Afficher complet au survol de la carte */
    .stock-card:hover .stock-fullname {
        -webkit-line-clamp: unset;
        max-height: none;
    }
    
    /* Valeur de performance : ne se compresse plus */
    .stock-performance {
        white-space: nowrap;
        min-width: 8ch;                   /* Plus d'espace pour les valeurs */
        text-align: right;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
        padding: 6px 12px;
    }
    
    /* Rang plus visible */
    .stock-card .rank {
        width: 42px;
        height: 42px;
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 50%;
        font-weight: bold;
        font-size: 1.1rem;
        background-color: var(--accent-subtle);
        color: var(--accent-color);
        box-shadow: 0 0 8px rgba(0, 255, 135, 0.2);
    }
    
    /* Top 3 avec effet premium */
    .stock-card:nth-child(1) .rank {
        background: linear-gradient(135deg, #FFD700, #FFA500);
        color: #000;
        box-shadow: 0 0 15px rgba(255, 215, 0, 0.5);
    }
    
    .stock-card:nth-child(2) .rank {
        background: linear-gradient(135deg, #C0C0C0, #B8B8B8);
        color: #000;
        box-shadow: 0 0 15px rgba(192, 192, 192, 0.5);
    }
    
    .stock-card:nth-child(3) .rank {
        background: linear-gradient(135deg, #CD7F32, #B87333);
        color: #FFF;
        box-shadow: 0 0 15px rgba(205, 127, 50, 0.5);
    }
    
    /* Badges pour ETF/Bonds plus visibles */
    .ter-badge, .aum-badge {
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .ter-badge {
        background: rgba(255, 193, 7, 0.2);
        color: #FFC107;
        border: 1px solid rgba(255, 193, 7, 0.3);
    }
    
    .aum-badge {
        background: rgba(0, 212, 255, 0.2);
        color: #00D4FF;
        border: 1px solid rgba(0, 212, 255, 0.3);
    }
    
    /* Styles du composeur MC ETF */
    #etf-mc-results .glassmorphism {
        transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    
    #etf-mc-results .glassmorphism:hover {
        transform: translateX(3px);
    }
    
    /* Colonnes de métriques bien espacées */
    #etf-mc-results .flex.gap-4 > div {
        min-width: 80px;
    }
    
    /* Score en mode balanced */
    .mc-score-badge {
        background: linear-gradient(135deg, rgba(0, 255, 255, 0.1), rgba(0, 255, 255, 0.05));
        border: 1px solid rgba(0, 255, 255, 0.3);
        padding: 4px 10px;
        border-radius: 6px;
        font-weight: 700;
    }
    
    /* Pills sélectionnées */
    #etf-mc-section .mc-pill.is-checked {
        background: rgba(0, 255, 255, 0.2) !important;
        border-color: #00ffff !important;
        box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
    }
    
    /* Amélioration mini-select et mini-input */
    #etf-mc-section .mini-select,
    #etf-mc-section .mini-input {
        transition: all 0.2s ease;
    }
    
    #etf-mc-section .mini-select:focus,
    #etf-mc-section .mini-input:focus {
        border-color: #00ffff;
        box-shadow: 0 0 0 2px rgba(0, 255, 255, 0.2);
        outline: none;
    }
    `;
    document.head.appendChild(etfMcStyles);
}

// 2. Synchroniser les pills avec checkboxes
document.addEventListener('DOMContentLoaded', function() {
    // Synchronisation des checkboxes
    document.querySelectorAll('#etf-mc-section .mc-pill input').forEach(inp => {
        const label = inp.closest('.mc-pill');
        if (!label) return;
        
        const sync = () => label.classList.toggle('is-checked', inp.checked);
        inp.addEventListener('change', sync);
        sync();
    });
    
    // Améliorer l'accessibilité des boutons
    document.querySelectorAll('#etf-mc-section button').forEach(btn => {
        if (!btn.getAttribute('aria-label')) {
            const text = btn.textContent.trim();
            btn.setAttribute('aria-label', text);
        }
    });
    
    console.log('✅ ETF MC Integration v2.0 - Styles améliorés et accessibilité');
});
