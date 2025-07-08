/**
 * 🔧 SCRIPT DE CORRECTION - Badges d'impact TradePulse
 * Fichier : js/news-impact-badges-fix.js
 * 
 * Ce script gère automatiquement le positionnement des badges d'impact
 * pour éviter qu'ils se superposent aux dates dans les actualités
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 Correction badges d\'impact TradePulse initialisée');
    
    // Appliquer la correction immédiatement
    fixAllBadges();
    
    // Observer les nouvelles cartes ajoutées dynamiquement
    observeNewsCards();
    
    // Appliquer la correction périodiquement (au cas où)
    setInterval(fixAllBadges, 5000);
});

/**
 * Corrige tous les badges d'actualités
 */
function fixAllBadges() {
    const newsCards = document.querySelectorAll('.news-card');
    let fixedCount = 0;
    
    newsCards.forEach(card => {
        if (fixCardBadges(card)) {
            fixedCount++;
        }
    });
    
    if (fixedCount > 0) {
        console.log(`🔧 ${fixedCount} badges corrigés`);
    }
}

/**
 * Corrige les badges d'une carte spécifique
 * @param {HTMLElement} card - La carte d'actualité
 * @returns {boolean} - True si des corrections ont été apportées
 */
function fixCardBadges(card) {
    if (!card || !card.classList.contains('news-card')) {
        return false;
    }
    
    let fixed = false;
    
    // S'assurer que la carte a position relative
    const cardPosition = getComputedStyle(card).position;
    if (cardPosition === 'static') {
        card.style.position = 'relative';
        fixed = true;
    }
    
    // Corriger tous les badges dans cette carte
    const badges = card.querySelectorAll('.badge');
    badges.forEach(badge => {
        if (fixSingleBadge(badge, card)) {
            fixed = true;
        }
    });
    
    return fixed;
}

/**
 * Corrige un badge individuel
 * @param {HTMLElement} badge - L'élément badge
 * @param {HTMLElement} card - La carte parente
 * @returns {boolean} - True si des corrections ont été apportées
 */
function fixSingleBadge(badge, card) {
    if (!badge || !card) return false;
    
    let fixed = false;
    
    // Vérifier si le badge a déjà le bon positionnement
    const badgeStyle = getComputedStyle(badge);
    
    if (badgeStyle.position !== 'absolute' || 
        badgeStyle.top !== '12px' || 
        badgeStyle.right !== '12px') {
        
        // Appliquer les corrections
        badge.style.position = 'absolute';
        badge.style.top = '12px';
        badge.style.right = '12px';
        badge.style.zIndex = '15';
        badge.style.borderRadius = '6px';
        badge.style.padding = '4px 8px';
        badge.style.fontSize = '0.7rem';
        badge.style.fontWeight = '600';
        badge.style.textTransform = 'uppercase';
        badge.style.letterSpacing = '0.5px';
        badge.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
        badge.style.backdropFilter = 'blur(4px)';
        badge.style.webkitBackdropFilter = 'blur(4px)';
        badge.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        
        // Appliquer le style selon le type
        applyBadgeTypeStyle(badge);
        
        fixed = true;
    }
    
    return fixed;
}

/**
 * Applique le style selon le type de badge
 * @param {HTMLElement} badge - L'élément badge
 */
function applyBadgeTypeStyle(badge) {
    const badgeText = badge.textContent.toLowerCase().trim();
    
    // Détecter le type et appliquer le style approprié
    if (badge.classList.contains('urgent') || badgeText.includes('urgent')) {
        badge.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
        badge.style.color = 'white';
        badge.style.animation = 'pulse-urgent 2s infinite';
    } 
    else if (badge.classList.contains('important') || badgeText.includes('important')) {
        badge.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
        badge.style.color = 'white';
    }
    else if (badge.classList.contains('neutral') || badgeText.includes('neutre')) {
        badge.style.background = 'linear-gradient(135deg, #6b7280, #4b5563)';
        badge.style.color = 'white';
    }
    else if (badge.classList.contains('positive') || badgeText.includes('positif')) {
        badge.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        badge.style.color = 'white';
    }
    else if (badge.classList.contains('negative') || badgeText.includes('négatif')) {
        badge.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
        badge.style.color = 'white';
    }
    else {
        // Style par défaut pour les badges sans classe spécifique
        badge.style.background = 'linear-gradient(135deg, #6b7280, #4b5563)';
        badge.style.color = 'white';
    }
}

/**
 * Observer pour les nouvelles cartes ajoutées dynamiquement
 */
function observeNewsCards() {
    if (!window.MutationObserver) {
        console.warn('MutationObserver non supporté');
        return;
    }
    
    const observer = new MutationObserver(function(mutations) {
        let hasNewCards = false;
        
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Vérifier si c'est une carte d'actualité
                    if (node.classList && node.classList.contains('news-card')) {
                        fixCardBadges(node);
                        hasNewCards = true;
                    }
                    
                    // Ou si ça contient des cartes d'actualités
                    const newsCards = node.querySelectorAll && node.querySelectorAll('.news-card');
                    if (newsCards && newsCards.length > 0) {
                        newsCards.forEach(card => {
                            fixCardBadges(card);
                            hasNewCards = true;
                        });
                    }
                }
            });
        });
        
        if (hasNewCards) {
            console.log('🔧 Nouvelles cartes détectées et corrigées');
        }
    });
    
    // Observer les conteneurs d'actualités
    const containers = [
        '#critical-news-container',
        '#important-news-container', 
        '#recent-news',
        '#actualites-container'
    ];
    
    containers.forEach(selector => {
        const container = document.querySelector(selector);
        if (container) {
            observer.observe(container, {
                childList: true,
                subtree: true
            });
        }
    });
    
    console.log('🔧 Observer des nouvelles cartes configuré');
}

/**
 * Fonction de debug pour afficher les informations sur les badges
 */
function debugBadges() {
    const badges = document.querySelectorAll('.badge');
    console.log(`🔍 DEBUG: ${badges.length} badges trouvés`);
    
    badges.forEach((badge, index) => {
        const rect = badge.getBoundingClientRect();
        const parent = badge.closest('.news-card');
        const style = getComputedStyle(badge);
        
        console.log(`Badge ${index + 1}:`, {
            text: badge.textContent.trim(),
            position: style.position,
            top: style.top,
            right: style.right,
            zIndex: style.zIndex,
            hasParent: !!parent,
            classes: Array.from(badge.classList)
        });
    });
}

/**
 * Fonction de correction forcée en cas de problème
 */
function forceFixBadges() {
    console.log('🔧 Correction forcée des badges...');
    
    // Supprimer tous les styles inline pour repartir à zéro
    const badges = document.querySelectorAll('.badge');
    badges.forEach(badge => {
        badge.removeAttribute('style');
    });
    
    // Réappliquer les corrections après un court délai
    setTimeout(() => {
        fixAllBadges();
        console.log('✅ Correction forcée terminée');
    }, 100);
}

// Exposer les fonctions utiles globalement pour debug
window.debugBadges = debugBadges;
window.forceFixBadges = forceFixBadges;
window.fixAllBadges = fixAllBadges;

// Appliquer une correction responsive
window.addEventListener('resize', function() {
    // Réappliquer les corrections après un redimensionnement
    setTimeout(fixAllBadges, 300);
});

console.log('✅ Script de correction des badges d\'impact chargé');