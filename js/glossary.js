/**
 * TradePulse - Glossaire juridique interactif
 * Ce script charge les termes juridiques depuis le JSON et les met en évidence
 * dans le contenu de la page, affichant leur définition en cliquant.
 * 
 * Version optimisée : architecture en deux temps (scan au build, highlight au runtime)
 */

// Configuration globale
const GLOSSARY_CONFIG = {
    highlightColor: '#00FF87', // Couleur verte LED
    targetSelectors: ['.question-card', '.recommendation-card', '.results-container', '.main-content p'], // Conteneurs où rechercher les termes
    excludeSelectors: ['button', 'input', 'select', 'a', 'h1', 'h2', 'h3', '.glossary-tooltip'], // Éléments à ignorer
    jsonPath: 'data/legal-terms.json', // Chemin vers le fichier JSON complet des définitions
    indexPath: 'data/glossary-index.json', // Chemin vers le fichier d'index des termes (généré au build)
    maxTooltipWidth: '350px', // Largeur maximale de l'info-bulle
    animationDuration: 300 // Durée de l'animation en ms
};

// Classe principale du glossaire
class LegalGlossary {
    constructor(config) {
        this.config = config;
        this.terms = {}; // Stockera les définitions complètes
        this.allowedIds = []; // Stockera la liste des IDs validés (termes qui ont une définition)
        this.activeTooltip = null;
        this.isLoading = false;
        this.isLoaded = false;
        this.regex = null; // 🔹 Cache pour la RegExp
        this.observer = null; // 🔹 Référence au MutationObserver
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

    // Charge les termes depuis le fichier JSON
    async loadTerms() {
        try {
            this.isLoading = true;
            console.log('Chargement du glossaire juridique optimisé...');
            
            // 1. D'abord, charge le petit fichier d'index (rapide)
            const indexResponse = await fetch(this.config.indexPath);
            if (!indexResponse.ok) {
                // Si le fichier d'index n'existe pas, on passe à l'ancien système
                console.warn('Fichier d\'index non trouvé, chargement en mode complet.');
                await this.loadFullTerms();
                return;
            }
            
            // Récupère la liste des IDs validés
            this.allowedIds = await indexResponse.json();
            console.log(`Index du glossaire chargé avec ${this.allowedIds.length} termes validés`);
            
            // Compile immédiatement la RegExp avec la liste des termes validés
            this.regex = this.buildGlossaryRegex();
            this.isLoaded = true;
            this.isLoading = false;
            
            // Lancer immédiatement la mise en évidence avec la liste réduite
            this.highlightTermsInContent();
            
            // 2. Ensuite, charge le fichier complet des définitions en arrière-plan
            fetch(this.config.jsonPath)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Erreur HTTP: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    this.terms = data;
                    console.log(`Définitions complètes chargées (${Object.keys(this.terms).length} termes)`);
                    
                    // Émettre un événement pour informer que le glossaire est totalement prêt
                    document.dispatchEvent(new Event('glossaryFullyLoaded'));
                })
                .catch(error => {
                    console.error('Impossible de charger les définitions complètes:', error);
                });
            
        } catch (error) {
            this.isLoading = false;
            console.error('Erreur lors du chargement du glossaire:', error);
            // Tenter de charger en mode complet en cas d'erreur
            await this.loadFullTerms();
        }
    }

    // Méthode de secours : charge tous les termes en mode complet (ancien système)
    async loadFullTerms() {
        try {
            const response = await fetch(this.config.jsonPath);
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            
            this.terms = await response.json();
            this.allowedIds = Object.keys(this.terms);
            this.isLoaded = true;
            this.isLoading = false;
            
            // Réinitialiser le cache de regex après chargement des termes
            this.regex = null;
            
            // Lancer le processus de mise en évidence
            this.highlightTermsInContent();
            
            console.log(`Glossaire juridique chargé en mode complet avec ${this.allowedIds.length} termes`);
            
            // Émettre un événement pour informer que le glossaire est prêt
            document.dispatchEvent(new Event('glossaryLoaded'));
        } catch (error) {
            this.isLoading = false;
            console.error('Impossible de charger le glossaire juridique:', error);
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
        // Éviter les observateurs multiples
        if (this.observer) return;
        
        this.observer = new MutationObserver(mutations => {
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
        
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    // Arrêter l'observation des mutations du DOM
    disconnect() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
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

    // Construit une RegExp unique pour tous les termes
    buildGlossaryRegex() {
        // Utiliser uniquement les IDs autorisés (termes qui ont une définition)
        const alternates = (this.allowedIds || [])
            .sort((a, b) => b.length - a.length)   // long -> court pour prioritiser les expressions longues
            .map(id => this.getTermPattern(id));
            
        return new RegExp(`\\b(?:${alternates.join('|')})\\b`, 'giu');
    }

    // Convertit l'ID d'un terme en modèle de recherche
    getTermPattern(termId) {
        // 1) snake_case -> texte + espaces souples
        let txt = termId.replace(/_/g, ' ');

        // 2) supprime les accents pour la recherche
        txt = txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '');  // enlève les diacritiques
        txt = txt.replace(/\s+/g, '\\s+');                           // espace(s) variable(s)
        
        // 3) échappe tout caractère spécial RegExp
        txt = txt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        return txt;
    }

    // Normaliser le texte trouvé en ID
    normalizeToId(str) {
        return str
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève les accents
            .trim()
            .replace(/\s+/g, '_');                            // espaces -> underscore
    }

    // Met en évidence les termes dans un nœud de texte (nouvelle implémentation)
    highlightTermsInNode(textNode) {
        const raw = textNode.nodeValue;
        const parent = textNode.parentNode;
        
        // Si le parent est déjà un terme de glossaire, ne pas le traiter à nouveau
        if (parent.classList && parent.classList.contains('glossary-term')) {
            return;
        }
        
        // Créer un fragment de document pour stocker le contenu modifié
        const fragment = document.createDocumentFragment();
        
        // Pré-normaliser le texte pour la recherche (sans accents)
        const norm = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        // Vérifier si nous avons des termes à chercher
        if (!this.regex) {
            this.regex = this.buildGlossaryRegex();
        }
        
        this.regex.lastIndex = 0; // Réinitialiser le lastIndex
        
        let match, lastIndex = 0;
        
        // Rechercher tous les termes dans une seule passe
        while ((match = this.regex.exec(norm)) !== null) {
            // Ajouter le texte avant le terme
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(
                    raw.substring(lastIndex, match.index)
                ));
            }
            
            // Récupérer le texte original avec accents
            const origSlice = raw.slice(match.index, regex.lastIndex);
            
            // Obtenir l'ID du terme à partir du texte trouvé
            const termId = this.normalizeToId(match[0]);
            
            // Créer un élément pour le terme trouvé
            const termElement = document.createElement('span');
            termElement.className = 'glossary-term';
            termElement.textContent = origSlice; // Utiliser le texte original avec accents
            termElement.dataset.termId = termId;
            
            // Ajouter un gestionnaire de clic pour afficher la définition
            termElement.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showDefinition(termId, termElement);
            });
            
            fragment.appendChild(termElement);
            
            // Mettre à jour la position courante
            lastIndex = regex.lastIndex;
        }
        
        // Ajouter le reste du texte après le dernier terme
        if (lastIndex < raw.length) {
            fragment.appendChild(document.createTextNode(
                raw.substring(lastIndex)
            ));
        }
        
        // Remplacer le nœud de texte par le fragment uniquement si des modifications ont été apportées
        if (lastIndex > 0) {
            parent.replaceChild(fragment, textNode);
        }
    }

    // Affiche la définition d'un terme
    showDefinition(termId, element) {
        // Fermer la bulle active si elle existe
        this.closeActiveTooltip();
        
        // Si les définitions complètes ne sont pas encore chargées, attendre un peu
        if (!this.terms || !this.terms[termId]) {
            // Montrer un indicateur de chargement sur l'élément
            element.style.opacity = '0.7';
            element.style.textDecoration = 'underline dashed';
            
            // Réessayer dans un court instant
            setTimeout(() => {
                element.style.opacity = '';
                element.style.textDecoration = '';
                this.showDefinition(termId, element);
            }, 100);
            return;
        }
        
        // Chercher le terme dans le dictionnaire des termes
        // On vérifie d'abord si le termId existe directement, sinon on cherche un terme qui pourrait correspondre
        let termData = this.terms[termId];
        if (!termData) {
            // Recherche alternative si l'ID exact n'est pas trouvé
            const possibleTermId = Object.keys(this.terms).find(id => 
                this.normalizeToId(id) === termId || id === termId
            );
            if (possibleTermId) {
                termData = this.terms[possibleTermId];
                termId = possibleTermId; // Mise à jour de l'ID utilisé pour la suite
            }
        }
        
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
        const rect = element.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        // Position initiale sous l'élément
        tooltip.style.top = `${rect.bottom + scrollTop + 10}px`;
        tooltip.style.left = `${rect.left + scrollLeft}px`;
        
        // Ajuster si la bulle dépasse de la fenêtre
        setTimeout(() => {
            const tooltipRect = tooltip.getBoundingClientRect();
            
            // Ajuster horizontalement avec une marge minimale de 20px
            if (tooltipRect.right > window.innerWidth) {
                tooltip.style.left = `${Math.max(20, window.innerWidth - tooltipRect.width - 20) + scrollLeft}px`;
            }
            
            // Ajuster verticalement avec une marge minimale de 20px
            if (tooltipRect.bottom > window.innerHeight) {
                tooltip.style.top = `${Math.max(20, rect.top + scrollTop - tooltipRect.height - 10)}px`;
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
    
    // Méthode pour tester le bon fonctionnement de la détection des termes
    runTests() {
        const testTerms = ['Autres revenus salariés', 'revenus', 'TMI', 'ARE', 'salariés'];
        console.group('Tests de détection des termes');
        testTerms.forEach(txt => {
            const normalized = txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const regex = this.buildGlossaryRegex();
            const matches = regex.test(normalized);
            console.log(`Terme "${txt}" (norm: "${normalized}"): ${matches ? '✅' : '❌'}`);
        });
        console.groupEnd();
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
    
    // Ajouter une fonction pour déconnecter l'observer lors du changement de page
    window.addEventListener('beforeunload', () => {
        if (window.legalGlossary) {
            window.legalGlossary.disconnect();
        }
    });
});

// Fonction utilitaire pour déclencher l'analyse après un chargement de contenu dynamique
function refreshGlossary() {
    if (window.legalGlossary && window.legalGlossary.isLoaded) {
        window.legalGlossary.highlightTermsInContent();
    }
}
            
