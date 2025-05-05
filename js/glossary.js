/**
 * TradePulse - Glossaire juridique interactif
 * Ce script charge les termes juridiques depuis le JSON et les met en évidence
 * dans le contenu de la page, affichant leur définition en cliquant.
 */

// Configuration globale
const GLOSSARY_CONFIG = {
    highlightColor: '#00FF87', // Couleur verte LED
    targetSelectors: [
        '.question-card', 
        '.recommendation-card', 
        '.results-container', 
        '.main-content p',
        '.question-card h3',            // Titres des questions
        '.question-card p',             // Descriptions des questions
        '.option-btn label',            // Texte des options
        '.option-btn span',             // Texte des options (variante)
        '.question-card .mb-2'          // Autres textes dans les questions
    ],
    excludeSelectors: ['button', 'input', 'select', 'a', 'h1', 'h2', 'h3.font-semibold', '.glossary-tooltip'], // Éléments à ignorer
    jsonPath: 'data/legal-terms.json', // Chemin vers le fichier JSON
    maxTooltipWidth: '350px', // Largeur maximale de l'info-bulle
    animationDuration: 300 // Durée de l'animation en ms
};

// Cache pour les regex compilées
const regexCache = new Map();

// Classe principale du glossaire
class LegalGlossary {
    constructor(config) {
        this.config = config;
        this.terms = {};
        this.activeTooltip = null;
        this.isLoading = false;
        this.isLoaded = false;
        this.injectStyles();
        this.loadTerms();
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
    }

    // Supprime tous les diacritiques (accents) via Unicode NFD
    stripDiacritics(str) {
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    // Charge les termes depuis le fichier JSON
    async loadTerms() {
        // D'abord essayer d'utiliser les données prédéfinies si disponibles
        if (this.initWithPredefinedData()) {
            return;
        }
        
        try {
            this.isLoading = true;
            console.log('Chargement du glossaire juridique...');
            console.log(`Tentative de chargement depuis: ${this.config.jsonPath}`);
            
            const response = await fetch(this.config.jsonPath);
            if (!response.ok) {
                console.warn(`Erreur HTTP: ${response.status} lors du chargement de ${this.config.jsonPath}`);
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            
            this.terms = await response.json();
            this.isLoaded = true;
            this.isLoading = false;
            console.log(`Glossaire juridique chargé avec ${Object.keys(this.terms).length} termes`);
            
            // Lancer le processus de mise en évidence après le chargement
            this.highlightTermsInContent();
            
            // Émettre un événement pour informer que le glossaire est prêt
            document.dispatchEvent(new Event('glossaryLoaded'));
        } catch (error) {
            this.isLoading = false;
            console.error('Impossible de charger le glossaire juridique:', error);
            console.error(`Détails de l'erreur: ${error.message}`);
            
            // Essayer de charger depuis un chemin alternatif si le premier échoue
            this.tryAlternativePaths();
        }
    }
    
    // Utiliser des données prédéfinies si disponibles
    initWithPredefinedData() {
        console.log("Vérification pour des données prédéfinies");
        
        // Vérifier si des données sont définies dans window.legalTermsData
        if (window.legalTermsData) {
            console.log("Données prédéfinies trouvées dans window.legalTermsData");
            this.terms = window.legalTermsData;
            this.isLoaded = true;
            this.highlightTermsInContent();
            document.dispatchEvent(new Event('glossaryLoaded'));
            return true;
        }
        
        // Chercher si le contenu JSON est intégré dans la page
        const jsonScriptTag = document.querySelector('script[id="legal-terms-data"]');
        if (jsonScriptTag) {
            try {
                console.log("Données prédéfinies trouvées dans une balise script");
                this.terms = JSON.parse(jsonScriptTag.textContent);
                this.isLoaded = true;
                this.highlightTermsInContent();
                document.dispatchEvent(new Event('glossaryLoaded'));
                return true;
            } catch (e) {
                console.error("Erreur lors du parsing des données prédéfinies:", e);
            }
        }
        
        return false;
    }
    
    // Tente de charger le fichier JSON depuis des chemins alternatifs
    async tryAlternativePaths() {
        const alternativePaths = [
            'js/legal-terms.json',
            '/js/legal-terms.json',
            'legal-terms.json',
            '/legal-terms.json',
            '../legal-terms.json',
            'data/legal-terms.json',
            '/data/legal-terms.json',
            '../data/legal-terms.json'
        ];
        
        console.log("Tentative de chargement avec des chemins alternatifs...");
        
        for (const path of alternativePaths) {
            try {
                console.log(`Tentative avec le chemin alternatif: ${path}`);
                const response = await fetch(path);
                
                if (response.ok) {
                    console.log(`Réponse OK pour ${path}, tentative de parse JSON...`);
                    const data = await response.json();
                    
                    if (data && Object.keys(data).length > 0) {
                        this.terms = data;
                        this.isLoaded = true;
                        console.log(`Glossaire chargé avec succès depuis ${path} avec ${Object.keys(data).length} termes`);
                        this.highlightTermsInContent();
                        document.dispatchEvent(new Event('glossaryLoaded'));
                        return;
                    } else {
                        console.warn(`Le fichier ${path} a été chargé mais ne contient pas de données valides`);
                    }
                } else {
                    console.warn(`Échec du chargement depuis ${path}: statut ${response.status}`);
                }
            } catch (e) {
                console.warn(`Erreur lors du chargement depuis ${path}: ${e.message}`);
            }
        }
        
        console.error("Tous les chemins alternatifs ont échoué");
        
        // Fallback ultime: essayer de charger directement depuis le repo GitHub
        try {
            const githubPath = "https://raw.githubusercontent.com/Bencode92/stock-analysis-platform/main/js/legal-terms.json";
            console.log(`Tentative avec URL GitHub: ${githubPath}`);
            const response = await fetch(githubPath);
            
            if (response.ok) {
                const data = await response.json();
                if (data && Object.keys(data).length > 0) {
                    this.terms = data;
                    this.isLoaded = true;
                    console.log(`Glossaire chargé avec succès depuis GitHub`);
                    this.highlightTermsInContent();
                    document.dispatchEvent(new Event('glossaryLoaded'));
                    return;
                }
            }
        } catch (e) {
            console.error(`Même la tentative GitHub a échoué: ${e.message}`);
        }
    }

    // Trouve et met en évidence les termes du glossaire dans le contenu
    highlightTermsInContent() {
        if (!this.isLoaded) return;

        // Sélectionner tous les conteneurs cibles
        const containers = document.querySelectorAll(this.config.targetSelectors.join(', '));
        
        containers.forEach(container => {
            this.processNode(container);
        });
        
        // Ajouter un écouteur pour les nouvelles sections chargées dynamiquement
        this.observeDynamicContent();
    }

    // Observer les changements dans le DOM pour traiter le contenu dynamique
    observeDynamicContent() {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Vérifier si le nœud correspond à l'un des sélecteurs cibles
                            if (this.config.targetSelectors.some(selector => 
                                node.matches && node.matches(selector) || 
                                node.querySelector && node.querySelector(selector))) {
                                this.processNode(node);
                            }
                        }
                    });
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Traite un nœud DOM pour mettre en évidence les termes
    processNode(node) {
        // S'assurer de ne pas traiter les nœuds exclus
        if (this.shouldExcludeNode(node)) return;

        const textNodes = this.getTextNodes(node);
        
        textNodes.forEach(textNode => {
            this.highlightTermsInNode(textNode);
        });
    }

    // Vérifie si un nœud doit être exclu du traitement
    shouldExcludeNode(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        
        // Vérifier si le nœud ou l'un de ses parents correspond à un sélecteur d'exclusion
        return this.config.excludeSelectors.some(selector => {
            return node.matches && node.matches(selector) || 
                   node.closest && node.closest(selector);
        });
    }

    // Récupère tous les nœuds de texte dans un élément
    getTextNodes(element) {
        const textNodes = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Ignorer les nœuds vides ou dans des éléments exclus
                    if (node.nodeValue.trim() === '' || 
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

        return textNodes;
    }

    // Convertit l'ID du terme en motif de recherche avec normalisation Unicode
    getTermPattern(termId) {
        // Vérifier si le pattern est déjà dans le cache
        if (regexCache.has(termId)) {
            return regexCache.get(termId);
        }
        
        // Traitement des espaces, tirets et camelCase
        let pattern = termId
            .replace(/[_-]/g, '[\\s\\-_]+')
            .replace(/([a-z])([A-Z])/g, '$1\\s*$2');
        
        // Normaliser et supprimer les accents
        pattern = this.stripDiacritics(pattern.toLowerCase());
        
        // Mettre en cache pour les prochaines utilisations
        regexCache.set(termId, pattern);
        return pattern;
    }

    // MODIFIÉE : Met en évidence les termes dans un nœud de texte avec amélioration pour les accents
    highlightTermsInNode(textNode) {
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
        
        // Créer une version normalisée du texte (sans accents) pour la recherche
        const normalizedText = this.removeAccents(text.toLowerCase());
        
        // Rechercher tous les termes du glossaire dans le texte
        for (const [termId, termData] of Object.entries(this.terms)) {
            // Convertir l'ID du terme en motif de recherche
            const termPattern = this.getTermPattern(termId);
            
            // Rechercher le terme dans le texte normalisé
            const regex = new RegExp(`\\b(${termPattern})\\b`, 'gi');
            let match;
            
            while ((match = regex.exec(normalizedText)) !== null) {
                // Ajouter le texte avant le terme
                if (match.index > currentPosition) {
                    fragment.appendChild(document.createTextNode(
                        text.substring(currentPosition, match.index)
                    ));
                }
                
                // Récupérer le texte original (avec les accents) du match
                const originalMatch = text.substring(match.index, match.index + match[0].length);
                
                // Créer un élément pour le terme surligné
                const termElement = document.createElement('span');
                termElement.className = 'glossary-term';
                termElement.textContent = originalMatch;
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
        if (currentPosition > 0) {
            parent.replaceChild(fragment, textNode);
        }
    }
    
    // Fonction utilitaire pour enlever les accents (utilisée par highlightTermsInNode)
    removeAccents(str) {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
        tooltip.style.position = 'absolute';
        tooltip.style.zIndex = '1000';
        tooltip.style.maxWidth = this.config.maxTooltipWidth;
        tooltip.style.backgroundColor = 'rgba(1, 42, 74, 0.95)';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '12px 16px';
        tooltip.style.borderRadius = '8px';
        tooltip.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.2)';
        tooltip.style.border = '1px solid rgba(0, 255, 135, 0.3)';
        tooltip.style.backdropFilter = 'blur(5px)';
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translateY(10px)';
        tooltip.style.transition = `all ${this.config.animationDuration}ms ease`;
        
        // Contenu HTML de la bulle
        tooltip.innerHTML = this.generateTooltipContent(termId, termData);
        
        // Ajouter un bouton de fermeture
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.style.position = 'absolute';
        closeButton.style.top = '8px';
        closeButton.style.right = '8px';
        closeButton.style.background = 'none';
        closeButton.style.border = 'none';
        closeButton.style.color = '#00FF87';
        closeButton.style.fontSize = '20px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.padding = '0 5px';
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
    }

    // Génère le contenu HTML de la bulle d'information
    generateTooltipContent(termId, termData) {
        // Utiliser displayTerm s'il existe, sinon formater l'ID du terme
        const termTitle = termData.displayTerm || termId
            .replace(/[_-]/g, ' ')
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
}

// Initialiser le glossaire après le chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    // Créer l'instance du glossaire
    window.legalGlossary = new LegalGlossary(GLOSSARY_CONFIG);
    
    // Ajouter un écouteur pour les contenus chargés dynamiquement
    document.addEventListener('contentUpdated', () => {
        if (window.legalGlossary && window.legalGlossary.isLoaded) {
            window.legalGlossary.highlightTermsInContent();
        }
    });
});

// Fonction utilitaire pour déclencher l'analyse après un chargement de contenu dynamique
function refreshGlossary() {
    if (window.legalGlossary && window.legalGlossary.isLoaded) {
        window.legalGlossary.highlightTermsInContent();
    }
}
