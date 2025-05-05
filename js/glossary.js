/**
 * TradePulse - Glossaire juridique interactif (Version améliorée)
 * Ce script charge les termes juridiques depuis le JSON et les met en évidence
 * dans le contenu de la page, affichant leur définition en cliquant.
 */

// Configuration globale
const GLOSSARY_CONFIG = {
    highlightColor: '#00FF87', // Couleur verte LED
    targetSelectors: ['.question-card', '.recommendation-card', '.results-container', '.main-content p', '.score-explanation'], // Ajout de .score-explanation
    excludeSelectors: ['button', 'input', 'select', 'a', 'h1', 'h2', 'h3', '.glossary-tooltip', '.glossary-term'], // Ajout de .glossary-term pour éviter les boucles
    jsonPath: 'data/legal-terms.json', 
    maxTooltipWidth: '350px',
    animationDuration: 300,
    debugMode: window.GLOSSARY_DEBUG || false // Support pour le mode debug
};

// Classe principale du glossaire
class LegalGlossary {
    constructor(config) {
        this.config = config;
        this.terms = {};
        this.activeTooltip = null;
        this.isLoading = false;
        this.isLoaded = false;
        this.processedElements = new WeakSet(); // Pour éviter de traiter plusieurs fois les mêmes éléments
        this.injectStyles();
        this.loadTerms();

        // Référence explicite à la méthode de traitement pour l'événement contentUpdated
        this.handleContentUpdated = this.handleContentUpdated.bind(this);
    }

    // Injecter les styles CSS directement dans la page
    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .glossary-term {
                color: ${this.config.highlightColor} !important;
                cursor: pointer;
                font-weight: 500;
                transition: text-shadow 0.3s ease;
                position: relative;
            }
            
            .glossary-term:hover {
                text-shadow: 0 0 8px rgba(0, 255, 135, 0.6);
            }
            
            .glossary-term::after {
                content: '';
                position: absolute;
                bottom: -2px;
                left: 0;
                width: 100%;
                height: 1px;
                background-color: ${this.config.highlightColor};
                transform: scaleX(0);
                transition: transform 0.3s ease;
            }
            
            .glossary-term:hover::after {
                transform: scaleX(1);
            }
            
            .glossary-tooltip {
                position: absolute;
                z-index: 1000;
                max-width: ${this.config.maxTooltipWidth};
                background-color: rgba(1, 42, 74, 0.95);
                color: #fff;
                padding: 12px 16px;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(0, 255, 135, 0.3);
                backdrop-filter: blur(5px);
                font-size: 14px;
                line-height: 1.5;
                animation: glossary-pulse 2s infinite;
            }
            
            @keyframes glossary-pulse {
                0% { box-shadow: 0 0 0 0 rgba(0, 255, 135, 0.4); }
                70% { box-shadow: 0 0 0 6px rgba(0, 255, 135, 0); }
                100% { box-shadow: 0 0 0 0 rgba(0, 255, 135, 0); }
            }
        `;
        document.head.appendChild(style);
        if (this.config.debugMode) console.log('[Glossary]', 'Styles injectés');
    }

    // Charge les termes depuis le fichier JSON
    async loadTerms() {
        try {
            this.isLoading = true;
            if (this.config.debugMode) console.log('[Glossary]', 'Chargement du glossaire juridique...');
            
            const response = await fetch(this.config.jsonPath);
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            
            this.terms = await response.json();
            this.isLoaded = true;
            this.isLoading = false;
            if (this.config.debugMode) console.log('[Glossary]', `Glossaire juridique chargé avec ${Object.keys(this.terms).length} termes`);
            
            // Lancer le processus de mise en évidence après le chargement
            this.highlightTermsInContent();
            
            // Ajouter un écouteur pour les mises à jour de contenu
            document.addEventListener('contentUpdated', this.handleContentUpdated);
            
            // Émettre un événement pour informer que le glossaire est prêt
            document.dispatchEvent(new Event('glossaryLoaded'));
        } catch (error) {
            this.isLoading = false;
            console.error('Impossible de charger le glossaire juridique:', error);
            
            // Initialiser un glossaire de secours en cas d'erreur
            this.terms = {
                "impot_societes": {
                    "definition": "Impôt payé par les sociétés sur leurs bénéfices. Le taux standard en 2025 est de 25%.",
                    "example": "Une SAS avec 100 000€ de bénéfices paie 25 000€ d'IS."
                },
                "micro_entreprise": {
                    "definition": "Régime simplifié pour entrepreneurs individuels avec des plafonds de chiffre d'affaires (188 700€ pour les ventes et 77 700€ pour les services en 2025).",
                    "example": "Un consultant en micro-entreprise bénéficie d'un abattement forfaitaire de 34% sur son CA."
                },
                "tva": {
                    "definition": "Taxe sur la Valeur Ajoutée, impôt indirect sur la consommation.",
                    "example": "Une entreprise facture la TVA à ses clients et la reverse à l'État."
                },
                "sasu": {
                    "definition": "Société par Actions Simplifiée Unipersonnelle, forme juridique avec un actionnaire unique et grande flexibilité.",
                    "example": "Un entrepreneur a créé une SASU pour son activité de conseil avec 1€ de capital social."
                },
                "eurl": {
                    "definition": "Entreprise Unipersonnelle à Responsabilité Limitée, SARL à associé unique.",
                    "example": "L'EURL lui permet de choisir entre l'IR et l'IS tout en protégeant son patrimoine personnel."
                }
            };
            this.isLoaded = true;
            if (this.config.debugMode) console.log('[Glossary]', "Utilisation d'un glossaire de secours minimal");
            this.highlightTermsInContent();
            document.addEventListener('contentUpdated', this.handleContentUpdated);
            document.dispatchEvent(new Event('glossaryLoaded'));
        }
    }

    // Gestionnaire pour l'événement contentUpdated
    handleContentUpdated(event) {
        if (this.config.debugMode) console.log('[Glossary]', 'Événement contentUpdated reçu', event.detail);
        
        // Attendre un peu que le DOM soit stabilisé
        setTimeout(() => {
            this.highlightTermsInContent();
        }, 50);
    }

    // Trouve et met en évidence les termes du glossaire dans le contenu
    highlightTermsInContent() {
        if (!this.isLoaded) {
            if (this.config.debugMode) console.log('[Glossary]', 'Glossaire non chargé, analyse reportée');
            return;
        }

        // Sélectionner tous les conteneurs cibles
        const containers = document.querySelectorAll(this.config.targetSelectors.join(', '));
        
        if (this.config.debugMode) console.log('[Glossary]', `${containers.length} conteneurs cibles trouvés`);
        
        containers.forEach(container => {
            // Vérifier si l'élément a déjà été traité
            if (!this.processedElements.has(container)) {
                this.processNode(container);
                this.processedElements.add(container);
            }
        });
        
        // Ajouter un écouteur pour les nouvelles sections chargées dynamiquement si pas déjà fait
        this.observeDynamicContent();
    }

    // Observer les changements dans le DOM pour traiter le contenu dynamique
    observeDynamicContent() {
        // Ne créer l'observateur qu'une seule fois
        if (this.mutationObserver) return;
        
        this.mutationObserver = new MutationObserver(mutations => {
            let shouldProcess = false;
            
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Vérifier si le nœud correspond à l'un des sélecteurs cibles
                            const matches = this.config.targetSelectors.some(selector => 
                                node.matches && node.matches(selector) || 
                                node.querySelector && node.querySelector(selector));
                            
                            if (matches) {
                                shouldProcess = true;
                                if (this.config.debugMode) console.log('[Glossary]', 'Nouvel élément détecté:', node);
                                
                                // Vérifier si l'élément a déjà été traité
                                if (!this.processedElements.has(node)) {
                                    this.processNode(node);
                                    this.processedElements.add(node);
                                }
                            }
                        }
                    });
                }
            });
            
            // Si des conteneurs ont été modifiés mais pas traités directement, déclencher une analyse générale
            if (shouldProcess) {
                if (this.config.debugMode) console.log('[Glossary]', 'Déclenchement analyse complète après mutations');
                this.highlightTermsInContent();
            }
        });
        
        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        if (this.config.debugMode) console.log('[Glossary]', 'Observateur de mutations configuré');
    }

    // Traite un nœud DOM pour mettre en évidence les termes
    processNode(node) {
        // S'assurer de ne pas traiter les nœuds exclus
        if (this.shouldExcludeNode(node)) {
            if (this.config.debugMode) console.log('[Glossary]', 'Nœud exclu:', node);
            return;
        }

        const textNodes = this.getTextNodes(node);
        
        if (this.config.debugMode && textNodes.length > 0) {
            console.log('[Glossary]', `${textNodes.length} nœuds texte trouvés dans:`, node);
        }
        
        textNodes.forEach(textNode => {
            // Vérifier que le textNode a bien une valeur et un parent
            if (textNode && textNode.nodeValue && textNode.parentNode) {
                this.highlightTermsInNode(textNode);
            }
        });
    }

    // Vérifie si un nœud doit être exclu du traitement
    shouldExcludeNode(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
        
        // Vérifier si le nœud ou l'un de ses parents correspond à un sélecteur d'exclusion
        return this.config.excludeSelectors.some(selector => {
            return node.matches && node.matches(selector) || 
                   node.closest && node.closest(selector);
        });
    }

    // Récupère tous les nœuds de texte dans un élément
    getTextNodes(element) {
        const textNodes = [];
        
        // Vérifier si l'élément existe
        if (!element) return textNodes;
        
        try {
            const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function(node) {
                        // Ignorer les nœuds vides ou dans des éléments exclus
                        if (!node || !node.nodeValue || node.nodeValue.trim() === '' || 
                            node.parentElement && this.shouldExcludeNode(node.parentElement)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }.bind(this)
                }
            );

            let node;
            while (node = walker.nextNode()) {
                textNodes.push(node);
            }
        } catch (error) {
            console.error('Erreur lors de la récupération des nœuds de texte:', error);
        }

        return textNodes;
    }

    // Met en évidence les termes dans un nœud de texte
    highlightTermsInNode(textNode) {
        if (!textNode || !textNode.nodeValue) return;
        
        const text = textNode.nodeValue;
        const parent = textNode.parentNode;
        
        // Si le parent est déjà un terme de glossaire, ne pas le traiter à nouveau
        if (parent.classList && parent.classList.contains('glossary-term')) {
            return;
        }
        
        // Créer un fragment de document pour stocker le contenu modifié
        const fragment = document.createDocumentFragment();
        
        // Position de départ dans le texte
        let currentPosition = 0;
        let termsFound = false;
        
        // Rechercher tous les termes du glossaire dans le texte
        for (const [termId, termData] of Object.entries(this.terms)) {
            // Convertir l'ID du terme en texte lisible (suppression des underscores, etc.)
            const termPattern = this.getTermPattern(termId);
            
            // Rechercher le terme dans le texte restant
            const regex = new RegExp(`\\b(${termPattern})\\b`, 'gi');
            let match;
            
            while ((match = regex.exec(text)) !== null) {
                termsFound = true;
                
                // Ajouter le texte avant le terme
                if (match.index > currentPosition) {
                    fragment.appendChild(document.createTextNode(
                        text.substring(currentPosition, match.index)
                    ));
                }
                
                // Créer un élément pour le terme surligné
                const termElement = document.createElement('span');
                termElement.className = 'glossary-term';
                termElement.textContent = match[0];
                termElement.dataset.termId = termId;
                
                // Ajouter un gestionnaire de clic pour afficher la définition
                termElement.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showDefinition(termId, termElement);
                });
                
                fragment.appendChild(termElement);
                
                // Mettre à jour la position courante
                currentPosition = match.index + match[0].length;
            }
        }
        
        // Ajouter le reste du texte
        if (currentPosition < text.length) {
            fragment.appendChild(document.createTextNode(
                text.substring(currentPosition)
            ));
        }
        
        // Remplacer le nœud de texte par le fragment uniquement si des modifications ont été apportées
        if (termsFound && currentPosition > 0 && parent) {
            try {
                parent.replaceChild(fragment, textNode);
                if (this.config.debugMode) console.log('[Glossary]', `Termes mis en évidence dans: "${text.substring(0, 50)}..."`);
            } catch (error) {
                console.error('Erreur lors du remplacement du nœud de texte:', error, {
                    nodeValue: textNode?.nodeValue,
                    parentExists: !!parent
                });
            }
        }
    }

    // Convertit l'ID du terme en motif de recherche
    getTermPattern(termId) {
        let pattern = termId
            .replace(/_/g, '\\s+') // Remplacer les underscores par des espaces
            .replace(/([a-z])([A-Z])/g, '$1\\s*$2'); // Insérer des espaces facultatifs entre camelCase
        
        // Éviter les expressions régulières trop permissives
        if (pattern.length < 3) {
            pattern = `\\b${pattern}\\b`;
        }
        
        return pattern;
    }

    // Affiche la définition d'un terme
    showDefinition(termId, element) {
        // Fermer la bulle active si elle existe
        this.closeActiveTooltip();
        
        const termData = this.terms[termId];
        if (!termData) return;
        
        // Créer la bulle d'information
        const tooltip = document.createElement('div');
        tooltip.className = 'glossary-tooltip';
        
        // Définir les styles pour l'animation
        Object.assign(tooltip.style, {
            position: 'absolute',
            zIndex: '1000',
            maxWidth: this.config.maxTooltipWidth,
            backgroundColor: 'rgba(1, 42, 74, 0.95)',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
            border: '1px solid rgba(0, 255, 135, 0.3)',
            backdropFilter: 'blur(5px)',
            opacity: '0',
            transform: 'translateY(10px)',
            transition: `all ${this.config.animationDuration}ms ease`
        });
        
        // Contenu HTML de la bulle
        tooltip.innerHTML = this.generateTooltipContent(termId, termData);
        
        // Ajouter un bouton de fermeture
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        Object.assign(closeButton.style, {
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'none',
            border: 'none',
            color: '#00FF87',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '0 5px'
        });
        closeButton.onclick = () => this.closeActiveTooltip();
        
        tooltip.appendChild(closeButton);
        
        // Ajouter la bulle au document
        document.body.appendChild(tooltip);
        
        // Positionner la bulle près de l'élément cliqué
        this.positionTooltip(tooltip, element);
        
        // Animer l'apparition
        setTimeout(() => {
            tooltip.style.opacity = '1';
            tooltip.style.transform = 'translateY(0)';
        }, 10);
        
        // Enregistrer la bulle active
        this.activeTooltip = tooltip;
        
        // Fermer la bulle lors d'un clic en dehors
        document.addEventListener('click', this.handleDocumentClick = (e) => {
            if (!tooltip.contains(e.target) && e.target !== element) {
                this.closeActiveTooltip();
            }
        });
        
        if (this.config.debugMode) console.log('[Glossary]', `Définition affichée pour: ${termId}`);
    }

    // Génère le contenu HTML de la bulle d'information
    generateTooltipContent(termId, termData) {
        // Titre du terme (transforme termId en texte lisible)
        const termTitle = termId
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .replace(/\b\w/g, l => l.toUpperCase());
        
        let content = `
            <div style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; margin-bottom: 8px;">
                <h3 style="margin: 0 0 5px; font-size: 16px; color: #00FF87;">${termTitle}</h3>
            </div>
        `;
        
        // Traiter différents formats de données
        if (termData.definition) {
            content += `<p style="margin: 0 0 8px; line-height: 1.4;">${termData.definition}</p>`;
        }
        
        if (termData.example) {
            content += `
                <div style="background: rgba(0, 255, 135, 0.1); border-radius: 4px; padding: 8px; margin: 8px 0; font-size: 14px;">
                    <strong style="color: #00FF87;">Exemple:</strong> ${termData.example}
                </div>
            `;
        }
        
        // Pour les objets imbriqués
        if (termData.application) {
            content += `<div style="margin-top: 8px;"><strong style="color: #00FF87;">Application:</strong>`;
            for (const [key, value] of Object.entries(termData.application)) {
                const readableKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                content += `<div style="margin: 4px 0 4px 12px;"><strong>${readableKey}:</strong> ${value}</div>`;
            }
            content += `</div>`;
        }
        
        // Pour les tableaux
        if (Array.isArray(termData.related_terms) && termData.related_terms.length > 0) {
            content += `
                <div style="margin-top: 8px;">
                    <strong style="color: #00FF87;">Termes liés:</strong> 
                    <span style="font-style: italic; color: #ccc;">${termData.related_terms.join(', ')}</span>
                </div>
            `;
        }
        
        if (Array.isArray(termData.elements_couverts) && termData.elements_couverts.length > 0) {
            content += `<div style="margin-top: 8px;"><strong style="color: #00FF87;">Éléments couverts:</strong><ul style="margin: 4px 0; padding-left: 20px;">`;
            termData.elements_couverts.forEach(item => {
                content += `<li>${item}</li>`;
            });
            content += `</ul></div>`;
        }
        
        // Pour les autres propriétés simples
        const simpleProps = ['variabilité', 'importance'];
        simpleProps.forEach(prop => {
            if (termData[prop]) {
                const readableProp = prop.charAt(0).toUpperCase() + prop.slice(1);
                content += `<div style="margin-top: 6px;"><strong style="color: #00FF87;">${readableProp}:</strong> ${termData[prop]}</div>`;
            }
        });
        
        return content;
    }

    // Positionne la bulle d'information près de l'élément
    positionTooltip(tooltip, element) {
        if (!element || !tooltip) return;
        
        const rect = element.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        // Position initiale sous l'élément
        tooltip.style.top = `${rect.bottom + scrollTop + 10}px`;
        tooltip.style.left = `${rect.left + scrollLeft}px`;
        
        // Ajuster si la bulle dépasse de la fenêtre
        setTimeout(() => {
            const tooltipRect = tooltip.getBoundingClientRect();
            
            // Ajuster horizontalement
            if (tooltipRect.right > window.innerWidth) {
                tooltip.style.left = `${window.innerWidth - tooltipRect.width - 20 + scrollLeft}px`;
            }
            
            // Ajuster verticalement
            if (tooltipRect.bottom > window.innerHeight) {
                tooltip.style.top = `${rect.top + scrollTop - tooltipRect.height - 10}px`;
            }
        }, 0);
    }

    // Ferme la bulle d'information active
    closeActiveTooltip() {
        if (this.activeTooltip) {
            // Animation de fermeture
            this.activeTooltip.style.opacity = '0';
            this.activeTooltip.style.transform = 'translateY(10px)';
            
            // Supprimer après l'animation
            setTimeout(() => {
                if (this.activeTooltip && this.activeTooltip.parentNode) {
                    this.activeTooltip.parentNode.removeChild(this.activeTooltip);
                }
                this.activeTooltip = null;
            }, this.config.animationDuration);
            
            // Supprimer le gestionnaire de clic sur le document
            if (this.handleDocumentClick) {
                document.removeEventListener('click', this.handleDocumentClick);
                this.handleDocumentClick = null;
            }
        }
    }
    
    // Méthode de nettoyage pour éviter les fuites de mémoire
    destroy() {
        if (this.config.debugMode) console.log('[Glossary]', 'Destruction du glossaire');
        
        // Supprimer l'écouteur contentUpdated
        document.removeEventListener('contentUpdated', this.handleContentUpdated);
        
        // Déconnecter l'observateur de mutations
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        
        // Fermer toute bulle active
        this.closeActiveTooltip();
        
        // Nettoyer les références
        this.terms = null;
        this.processedElements = null;
    }
}

// Initialiser le glossaire après le chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    // Créer l'instance du glossaire
    window.legalGlossary = new LegalGlossary(GLOSSARY_CONFIG);
    
    // Ajouter un écouteur pour les contenus chargés dynamiquement
    document.addEventListener('contentUpdated', () => {
        if (window.legalGlossary && window.legalGlossary.isLoaded) {
            if (GLOSSARY_CONFIG.debugMode) console.log('[Glossary]', 'Rafraîchissement du glossaire via l\'écouteur global contentUpdated');
            window.legalGlossary.highlightTermsInContent();
        }
    });
});

// Fonction utilitaire pour déclencher l'analyse après un chargement de contenu dynamique
function refreshGlossary() {
    if (window.legalGlossary && window.legalGlossary.isLoaded) {
        if (GLOSSARY_CONFIG.debugMode) console.log('[Glossary]', 'Rafraîchissement manuel du glossaire');
        
        // Déclencher un événement contentUpdated pour informer le glossaire
        const event = new CustomEvent('contentUpdated', {
            detail: { source: 'manual', timestamp: new Date().getTime() }
        });
        document.dispatchEvent(event);
    }
}

// Exposer des fonctions utilitaires pour le débogage
if (GLOSSARY_CONFIG.debugMode) {
    window.glossaryDebug = {
        inspect: () => {
            console.log({
                isLoaded: window.legalGlossary.isLoaded,
                termsCount: Object.keys(window.legalGlossary.terms).length,
                processedElementsCount: window.legalGlossary.processedElements ? 'WeakSet (count unavailable)' : 'Not initialized',
                activeTooltip: window.legalGlossary.activeTooltip ? 'Present' : 'None'
            });
        },
        forceRefresh: () => {
            window.legalGlossary.processedElements = new WeakSet();
            window.legalGlossary.highlightTermsInContent();
            console.log('[Glossary Debug]', 'Forced complete refresh');
        },
        listTerms: () => {
            return Object.keys(window.legalGlossary.terms);
        }
    };
}