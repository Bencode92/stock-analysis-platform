/**
 * regimes-fiscaux-definitions.js - Gestionnaire des définitions fiscales uniquement
 * Ajoute des tooltips interactifs pour les termes fiscaux
 */

class DefinitionsFiscalesManager {
    constructor() {
        this.definitions = {};
        this.init();
    }

    async init() {
        console.log('📖 Initialisation du gestionnaire de définitions fiscales...');
        await this.loadDefinitions();
        this.createTooltip();
        this.attachEventListeners();
        this.scanAndLinkTerms();
    }

    async loadDefinitions() {
        try {
            const response = await fetch('./data/regimes-fiscaux.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            this.definitions = data.definitions || {};
            console.log('✅ Définitions fiscales chargées:', Object.keys(this.definitions).length, 'termes');
        } catch (error) {
            console.error('❌ Erreur lors du chargement des définitions:', error);
            this.definitions = {};
        }
    }

    createTooltip() {
        if (!document.getElementById('definition-tooltip')) {
            const tooltip = document.createElement('div');
            tooltip.id = 'definition-tooltip';
            tooltip.className = 'definition-tooltip';
            tooltip.style.cssText = `
                display: none;
                position: fixed;
                background: rgba(10, 25, 47, 0.98);
                border: 1px solid rgba(0, 217, 255, 0.3);
                border-radius: 12px;
                padding: 20px;
                max-width: 400px;
                z-index: 10000;
                box-shadow: 0 8px 32px rgba(0, 217, 255, 0.2);
                backdrop-filter: blur(10px);
                color: #fff;
            `;
            document.body.appendChild(tooltip);
        }
    }

    scanAndLinkTerms() {
        // Scanner les cartes de régimes fiscaux existantes
        const cards = document.querySelectorAll('.regime-card');
        cards.forEach(card => {
            this.processTextNodes(card);
        });

        // Scanner aussi les résultats s'ils existent
        const results = document.getElementById('results');
        if (results && !results.classList.contains('hidden')) {
            this.processTextNodes(results);
        }
    }

    processTextNodes(element) {
        const termsToFind = Object.keys(this.definitions);
        const textNodes = this.getTextNodes(element);

        textNodes.forEach(node => {
            let html = node.textContent;
            let hasReplacement = false;

            termsToFind.forEach(term => {
                // Recherche insensible à la casse mais préserve la casse originale
                const regex = new RegExp(`\\b(${term})\\b`, 'gi');
                if (regex.test(html)) {
                    hasReplacement = true;
                    html = html.replace(regex, (match) => 
                        `<span class="definition-term" data-term="${term}" style="cursor: help; border-bottom: 1px dotted #00D9FF;">${match}</span>`
                    );
                }
            });

            if (hasReplacement && node.parentNode) {
                const span = document.createElement('span');
                span.innerHTML = html;
                node.parentNode.replaceChild(span, node);
            }
        });

        // Attacher les événements aux nouveaux termes
        element.querySelectorAll('.definition-term').forEach(termEl => {
            termEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showDefinition(termEl.getAttribute('data-term'), e);
            });
        });
    }

    getTextNodes(element) {
        const textNodes = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    if (node.parentElement.matches('script, style, .definition-term')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            }
        );
        
        while (walker.nextNode()) {
            textNodes.push(walker.currentNode);
        }
        
        return textNodes;
    }

    showDefinition(term, event) {
        const definition = this.definitions[term];
        if (!definition) return;

        const tooltip = document.getElementById('definition-tooltip');
        
        let content = `
            <div style="margin-bottom: 10px;">
                <h4 style="margin: 0 0 10px 0; color: #00D9FF; font-size: 1.1rem;">
                    ${definition.titre || term}
                </h4>
                <button onclick="window.definitionsFiscales.hideTooltip()" 
                        style="position: absolute; top: 10px; right: 10px; background: none; border: none; color: #8B9CB0; cursor: pointer; font-size: 1.2rem;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="color: #CBD5E1; line-height: 1.6;">
                <p style="margin: 0 0 10px 0;">${definition.description}</p>
        `;
        
        if (definition.exemple) {
            content += `
                <div style="background: rgba(0, 217, 255, 0.1); padding: 12px; border-radius: 8px; margin: 10px 0;">
                    <strong style="color: #00D9FF;">Exemple:</strong> ${definition.exemple}
                </div>
            `;
        }
        
        if (definition.calcul) {
            content += `
                <div style="background: rgba(0, 217, 255, 0.05); padding: 12px; border-radius: 8px; margin: 10px 0;">
                    <strong style="color: #00D9FF;">Calcul:</strong> ${definition.calcul}
                </div>
            `;
        }
        
        if (definition.conditions && definition.conditions.length > 0) {
            content += '<div style="margin-top: 10px;"><strong style="color: #00D9FF;">Conditions:</strong><ul style="margin: 5px 0 0 20px; padding: 0;">';
            definition.conditions.forEach(condition => {
                content += `<li style="margin: 3px 0;">${condition}</li>`;
            });
            content += '</ul></div>';
        }
        
        content += '</div>';
        
        tooltip.innerHTML = content;
        tooltip.style.display = 'block';
        
        // Positionner le tooltip
        const rect = event.target.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        let top = rect.bottom + 10;
        let left = rect.left;
        
        // Ajuster si dépasse à droite
        if (left + tooltipRect.width > window.innerWidth - 20) {
            left = window.innerWidth - tooltipRect.width - 20;
        }
        
        // Ajuster si dépasse en bas
        if (top + tooltipRect.height > window.innerHeight - 20) {
            top = rect.top - tooltipRect.height - 10;
        }
        
        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        tooltip.classList.add('visible');
    }

    hideTooltip() {
        const tooltip = document.getElementById('definition-tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    attachEventListeners() {
        // Fermer le tooltip en cliquant ailleurs
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.definition-term') && !e.target.closest('#definition-tooltip')) {
                this.hideTooltip();
            }
        });

        // Observer les changements du DOM pour ajouter des définitions aux nouveaux éléments
        const observer = new MutationObserver(() => {
            this.scanAndLinkTerms();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

// Initialiser le gestionnaire
document.addEventListener('DOMContentLoaded', () => {
    console.log('📖 Chargement du module définitions fiscales...');
    window.definitionsFiscales = new DefinitionsFiscalesManager();
});
