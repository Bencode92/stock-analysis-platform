/**
 * regimes-fiscaux.js - Gestionnaire des régimes fiscaux immobiliers
 * Permet de sélectionner un régime fiscal et affiche des définitions interactives
 */

class RegimesFiscauxManager {
    constructor() {
        this.regimesData = null;
        this.selectedRegime = null;
        this.container = null;
        this.init();
    }

    async init() {
        console.log('🏛️ Initialisation du gestionnaire de régimes fiscaux...');
        await this.loadRegimesData();
        this.createUI();
        this.attachEventListeners();
    }

    async loadRegimesData() {
        try {
            const response = await fetch('./data/regimes-fiscaux.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const rawData = await response.json();
            
            // Adapter la structure: le JSON est un tableau direct, pas un objet avec propriétés
            this.regimesData = {
                regimes: rawData,
                definitions: {} // Pas de définitions dans le JSON actuel
            };
            
            // Ajouter des couleurs et icônes par défaut
            this.regimesData.regimes.forEach(regime => {
                if (!regime.couleur) {
                    switch(regime.id) {
                        case 'micro-foncier':
                            regime.couleur = '#10b981';
                            regime.icone = 'fa-home';
                            break;
                        case 'reel-foncier':
                            regime.couleur = '#3b82f6';
                            regime.icone = 'fa-calculator';
                            break;
                        case 'lmnp-micro-bic':
                            regime.couleur = '#f59e0b';
                            regime.icone = 'fa-bed';
                            break;
                        case 'lmnp-reel':
                            regime.couleur = '#8b5cf6';
                            regime.icone = 'fa-chart-line';
                            break;
                        case 'sci-is':
                            regime.couleur = '#ef4444';
                            regime.icone = 'fa-building';
                            break;
                        case 'sas':
                            regime.couleur = '#14b8a6';
                            regime.icone = 'fa-briefcase';
                            break;
                        case 'sarl-famille':
                            regime.couleur = '#ec4899';
                            regime.icone = 'fa-users';
                            break;
                        default:
                            regime.couleur = '#6b7280';
                            regime.icone = 'fa-file-invoice-dollar';
                    }
                }
                
                // Corriger l'orthographe si nécessaire
                if (regime.specifites_fiscales && !regime.specificites_fiscales) {
                    regime.specificites_fiscales = regime.specifites_fiscales;
                    delete regime.specifites_fiscales;
                }
            });
            
            console.log('✅ Données des régimes fiscaux chargées:', this.regimesData.regimes.length, 'régimes');
        } catch (error) {
            console.error('❌ Erreur lors du chargement des régimes fiscaux:', error);
            // Données de fallback
            this.regimesData = {
                regimes: [
                    {
                        id: "micro-foncier",
                        nom: "Micro-foncier",
                        description: "Abattement 30%",
                        icone: "fa-home",
                        couleur: "#10b981"
                    }
                ],
                definitions: {}
            };
        }
    }

    createUI() {
        // Créer le conteneur principal s'il n'existe pas
        this.container = document.getElementById('regimes-fiscaux-container');
        if (!this.container) {
            console.log('📍 Création du conteneur de régimes fiscaux');
            this.container = document.createElement('div');
            this.container.id = 'regimes-fiscaux-container';
            this.container.className = 'card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg transition-all mt-4';
            
            // Trouver où l'insérer (après les paramètres avancés)
            const advancedParams = document.getElementById('advanced-params');
            if (advancedParams) {
                advancedParams.insertAdjacentElement('afterend', this.container);
            } else {
                const resultsSection = document.getElementById('results');
                if (resultsSection) {
                    resultsSection.insertAdjacentElement('beforebegin', this.container);
                }
            }
        }

        // Construire l'interface
        this.container.innerHTML = `
            <div class="card-header">
                <div class="card-icon">
                    <i class="fas fa-landmark"></i>
                </div>
                <h2 class="card-title">Choisissez un régime fiscal pour calculer l'impact sur votre investissement:</h2>
            </div>
            
            <div id="regimes-grid" class="regimes-grid">
                ${this.regimesData.regimes.map(regime => this.createRegimeCard(regime)).join('')}
            </div>
            
            <div id="regime-info" class="regime-info-panel hidden">
                <div class="regime-info-header">
                    <h3 id="regime-info-title"></h3>
                    <button class="regime-info-close" onclick="window.regimesFiscaux.closeInfo()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div id="regime-info-content"></div>
            </div>
        `;

        // Ajouter le conteneur de tooltips s'il n'existe pas
        if (!document.getElementById('regime-tooltip')) {
            const tooltip = document.createElement('div');
            tooltip.id = 'regime-tooltip';
            tooltip.className = 'regime-tooltip';
            document.body.appendChild(tooltip);
        }
    }

    createRegimeCard(regime) {
        // Extraire la description courte du résumé simplifié si disponible
        const shortDesc = regime.resume_simplifie?.c_est_quoi?.substring(0, 100) + '...' || regime.description;
        
        return `
            <div class="regime-card ${regime.id === this.selectedRegime ? 'selected' : ''}" 
                 data-regime="${regime.id}"
                 onclick="window.regimesFiscaux.selectRegime('${regime.id}')">
                <div class="regime-card-header">
                    <div class="regime-icon" style="background: ${regime.couleur ? `linear-gradient(135deg, ${regime.couleur}, ${regime.couleur}88)` : ''}">
                        <i class="fas ${regime.icone || 'fa-file-invoice-dollar'}"></i>
                    </div>
                    ${regime.dateEffet ? `<span class="regime-date">${regime.dateEffet}</span>` : ''}
                </div>
                <h4 class="regime-name">${regime.nom}</h4>
                <p class="regime-desc">${shortDesc}</p>
                ${regime.plafond ? `<div class="regime-plafond">Plafond: ${this.formatMontant(regime.plafond)}</div>` : ''}
            </div>
        `;
    }

    selectRegime(regimeId) {
        console.log('📋 Sélection du régime:', regimeId);
        
        // Retirer la sélection précédente
        document.querySelectorAll('.regime-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Ajouter la nouvelle sélection
        const selectedCard = document.querySelector(`[data-regime="${regimeId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }
        
        this.selectedRegime = regimeId;
        
        // Afficher les détails du régime
        this.showRegimeDetails(regimeId);
        
        // Déclencher un événement pour que le simulateur puisse réagir
        window.dispatchEvent(new CustomEvent('regimeFiscalChange', { 
            detail: { regimeId, regime: this.regimesData.regimes.find(r => r.id === regimeId) }
        }));
    }

    showRegimeDetails(regimeId) {
        const regime = this.regimesData.regimes.find(r => r.id === regimeId);
        if (!regime) return;

        const infoPanel = document.getElementById('regime-info');
        const titleEl = document.getElementById('regime-info-title');
        const contentEl = document.getElementById('regime-info-content');

        titleEl.textContent = regime.nom;
        
        let content = '<div class="regime-details">';
        
        // Résumé simplifié
        if (regime.resume_simplifie) {
            content += '<div class="regime-section"><h4><i class="fas fa-lightbulb"></i> En résumé</h4>';
            content += `<p>${regime.resume_simplifie.c_est_quoi}</p>`;
            content += `<p><strong>Comment ça marche :</strong> ${regime.resume_simplifie.comment_ca_marche}</p>`;
            if (regime.resume_simplifie.a_retenir) {
                content += '<p><strong>À retenir :</strong></p><ul>';
                regime.resume_simplifie.a_retenir.forEach(point => {
                    content += `<li>${point}</li>`;
                });
                content += '</ul>';
            }
            content += '</div>';
        }
        
        // Conditions
        if (regime.conditions_eligibilite?.length) {
            content += '<div class="regime-section"><h4><i class="fas fa-check-circle"></i> Conditions d\'éligibilité</h4><ul>';
            regime.conditions_eligibilite.forEach(condition => {
                content += `<li>${condition}</li>`;
            });
            content += '</ul></div>';
        } else if (regime.conditions_application?.length) {
            content += '<div class="regime-section"><h4><i class="fas fa-info-circle"></i> Conditions d\'application</h4><ul>';
            regime.conditions_application.forEach(condition => {
                content += `<li>${condition}</li>`;
            });
            content += '</ul></div>';
        }
        
        // Modalités d'application
        if (regime.modalites_application?.length) {
            content += '<div class="regime-section"><h4><i class="fas fa-cogs"></i> Modalités d\'application</h4><ul>';
            regime.modalites_application.forEach(modalite => {
                content += `<li>${modalite}</li>`;
            });
            content += '</ul></div>';
        }
        
        // Spécificités fiscales
        if (regime.specificites_fiscales?.length || regime.specifites_fiscales?.length) {
            const specs = regime.specificites_fiscales || regime.specifites_fiscales;
            content += '<div class="regime-section"><h4><i class="fas fa-star"></i> Spécificités fiscales</h4><ul>';
            specs.forEach(spec => {
                content += `<li>${spec}</li>`;
            });
            content += '</ul></div>';
        }
        
        // Déficit foncier
        if (regime.deficit_foncier) {
            content += '<div class="regime-section"><h4><i class="fas fa-chart-line"></i> Déficit foncier</h4><ul>';
            for (const [key, value] of Object.entries(regime.deficit_foncier)) {
                content += `<li><strong>${this.formatKey(key)}:</strong> ${value}</li>`;
            }
            content += '</ul></div>';
        }
        
        // Calcul fiscal
        if (regime.calcul) {
            content += '<div class="regime-section"><h4><i class="fas fa-calculator"></i> Calcul fiscal</h4><ul>';
            if (regime.calcul.abattement > 0) {
                content += `<li>Abattement forfaitaire: ${regime.calcul.abattement * 100}%</li>`;
            }
            if (regime.calcul.deficitDeductible !== undefined) {
                content += `<li>Déficit déductible: ${regime.calcul.deficitDeductible ? 'Oui' : 'Non'}`;
                if (regime.calcul.plafondDeficit) {
                    content += ` (plafond: ${this.formatMontant(regime.calcul.plafondDeficit)})`;
                }
                content += '</li>';
            }
            if (regime.calcul.amortissement) {
                content += `<li>Amortissement du bien possible</li>`;
            }
            if (regime.calcul.reportable) {
                content += `<li>Déficit reportable sur 10 ans</li>`;
            }
            content += '</ul></div>';
        }
        
        content += '</div>';
        
        contentEl.innerHTML = content;
        infoPanel.classList.remove('hidden');
        infoPanel.classList.add('fade-in');
    }

    closeInfo() {
        const infoPanel = document.getElementById('regime-info');
        if (infoPanel) {
            infoPanel.classList.add('hidden');
        }
    }

    attachEventListeners() {
        // Gestion des termes cliquables avec définitions
        document.addEventListener('click', (e) => {
            // Fermer le tooltip si on clique ailleurs
            if (!e.target.closest('.definition-term') && !e.target.closest('.regime-tooltip')) {
                this.hideTooltip();
            }
        });

        // Créer des liens pour les termes définis
        this.createDefinitionLinks();
    }

    createDefinitionLinks() {
        // Parcourir le contenu pour trouver et remplacer les termes définis
        const definitions = this.regimesData.definitions;
        const termsToReplace = Object.keys(definitions);
        
        // Cette fonction sera appelée après chaque mise à jour du DOM
        this.replaceTermsWithLinks = () => {
            const textNodes = this.getTextNodes(document.getElementById('regimes-fiscaux-container'));
            
            textNodes.forEach(node => {
                let text = node.textContent;
                let hasReplacement = false;
                
                termsToReplace.forEach(term => {
                    const regex = new RegExp(`\\b${term}\\b`, 'gi');
                    if (regex.test(text)) {
                        hasReplacement = true;
                        text = text.replace(regex, `<span class="definition-term" data-term="${term}" onclick="window.regimesFiscaux.showDefinition('${term}')">${term}</span>`);
                    }
                });
                
                if (hasReplacement && node.parentNode) {
                    const span = document.createElement('span');
                    span.innerHTML = text;
                    node.parentNode.replaceChild(span, node);
                }
            });
        };
    }

    getTextNodes(element) {
        const textNodes = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    // Ignorer les scripts, styles et éléments déjà traités
                    if (node.parentElement.matches('script, style, .definition-term')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );
        
        while (walker.nextNode()) {
            textNodes.push(walker.currentNode);
        }
        
        return textNodes;
    }

    showDefinition(term) {
        const definition = this.regimesData.definitions[term];
        if (!definition) return;

        const tooltip = document.getElementById('regime-tooltip');
        
        let content = `
            <div class="tooltip-header">
                <h4>${definition.titre || term}</h4>
                <button class="tooltip-close" onclick="window.regimesFiscaux.hideTooltip()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="tooltip-body">
                <p>${definition.description}</p>
        `;
        
        if (definition.exemple) {
            content += `
                <div class="tooltip-example">
                    <strong>Exemple:</strong> ${definition.exemple}
                </div>
            `;
        }
        
        if (definition.conditions) {
            content += '<div class="tooltip-conditions"><strong>Conditions:</strong><ul>';
            definition.conditions.forEach(condition => {
                content += `<li>${condition}</li>`;
            });
            content += '</ul></div>';
        }
        
        if (definition.termes) {
            content += `
                <div class="tooltip-terms">
                    <strong>Termes liés:</strong> ${definition.termes.join(', ')}
                </div>
            `;
        }
        
        content += '</div>';
        
        tooltip.innerHTML = content;
        tooltip.style.display = 'block';
        
        // Positionner le tooltip
        setTimeout(() => {
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
        }, 10);
    }

    hideTooltip() {
        const tooltip = document.getElementById('regime-tooltip');
        if (tooltip) {
            tooltip.classList.remove('visible');
            setTimeout(() => {
                tooltip.style.display = 'none';
            }, 300);
        }
    }

    formatMontant(montant) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(montant);
    }

    formatKey(key) {
        return key.replace(/_/g, ' ')
                  .replace(/\b\w/g, l => l.toUpperCase())
                  .replace('Imputation Revenu Global', 'Imputation sur le revenu global')
                  .replace('Report Solde', 'Report du solde')
                  .replace('Condition Maintien Location', 'Condition de maintien en location');
    }

    getSelectedRegime() {
        return this.selectedRegime;
    }

    getRegimeData(regimeId) {
        return this.regimesData.regimes.find(r => r.id === regimeId);
    }
}

// Initialiser le gestionnaire
document.addEventListener('DOMContentLoaded', () => {
    console.log('🏛️ Chargement du module régimes fiscaux...');
    window.regimesFiscaux = new RegimesFiscauxManager();
});

// Intégration avec le simulateur immobilier
window.addEventListener('regimeFiscalChange', (event) => {
    console.log('🔄 Changement de régime fiscal:', event.detail);
    
    // Mettre à jour les paramètres du simulateur si disponible
    if (window.simulateur) {
        const regime = event.detail.regime;
        
        // Appliquer les paramètres fiscaux selon le régime
        if (regime.calcul) {
            if (regime.id === 'micro-foncier') {
                window.simulateur.params.fiscalite.abattementMicroFoncier = regime.calcul.abattement;
                window.simulateur.params.fiscalite.regimeFiscal = 'micro-foncier';
            } else if (regime.id === 'reel-foncier') {
                window.simulateur.params.fiscalite.deficitFoncier = true;
                window.simulateur.params.fiscalite.plafondDeficit = regime.calcul.plafondDeficit;
                window.simulateur.params.fiscalite.regimeFiscal = 'reel-foncier';
            } else if (regime.id.includes('lmnp')) {
                window.simulateur.params.fiscalite.regimeFiscal = regime.id;
                window.simulateur.params.fiscalite.abattementLMNP = regime.calcul.abattement;
            }
        }
        
        // Relancer la simulation si des résultats existent
        if (window.simulateur.params.resultats.classique) {
            console.log('🔄 Recalcul avec le nouveau régime fiscal...');
            window.simuler && window.simuler();
        }
    }
});