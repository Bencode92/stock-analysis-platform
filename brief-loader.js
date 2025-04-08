/**
 * brief-loader.js - Chargement et affichage du brief stratégique
 * Ce script gère le chargement, le formatage et l'affichage du brief stratégique
 */

class BriefLoader {
    constructor() {
        this.briefHeader = document.getElementById('briefToggleHeader');
        this.briefContent = document.getElementById('briefContent');
        this.briefDate = document.getElementById('brief-date');
        this.toggleBtn = document.querySelector('.brief-toggle-btn');
        this.btnText = document.querySelector('.brief-btn-text');
        this.toggleIcon = document.querySelector('.brief-icon-toggle');
        
        this.isExpanded = false;
        this.isLoaded = false;
        this.briefData = null;
        
        // Initialiser les événements
        this.initEvents();
    }
    
    /**
     * Initialise les écouteurs d'événements
     */
    initEvents() {
        // Écouteur pour le clic sur l'en-tête ou le bouton
        this.briefHeader.addEventListener('click', () => this.toggleBrief());
        this.toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Empêche la propagation au header
            this.toggleBrief();
        });
    }
    
    /**
     * Bascule l'affichage du brief
     */
    toggleBrief() {
        if (this.isExpanded) {
            this.collapseBrief();
        } else {
            this.expandBrief();
            
            // Charger le contenu si pas encore fait
            if (!this.isLoaded) {
                this.loadBriefContent();
            }
        }
    }
    
    /**
     * Développe le brief
     */
    expandBrief() {
        this.isExpanded = true;
        this.briefContent.classList.add('expanded');
        this.briefContent.classList.remove('hidden');
        this.toggleIcon.classList.replace('fa-chevron-down', 'fa-chevron-up');
        this.btnText.textContent = 'Masquer le résumé';
    }
    
    /**
     * Réduit le brief
     */
    collapseBrief() {
        this.isExpanded = false;
        this.briefContent.classList.remove('expanded');
        setTimeout(() => {
            this.briefContent.classList.add('hidden');
        }, 500); // Délai correspondant à la transition
        this.toggleIcon.classList.replace('fa-chevron-up', 'fa-chevron-down');
        this.btnText.textContent = 'Afficher le résumé';
    }
    
    /**
     * Charge le contenu du brief depuis le fichier MD
     */
    loadBriefContent() {
        // Afficher l'animation de chargement
        this.briefContent.innerHTML = `
            <div class="brief-loading p-8 text-center">
                <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-400 mx-auto mb-4"></div>
                <p class="text-gray-400">Chargement du brief stratégique...</p>
            </div>
        `;
        
        // Charger le fichier brief_ia.json pour obtenir les métadonnées
        fetch('data/brief_ia.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Erreur lors du chargement des métadonnées du brief');
                }
                return response.json();
            })
            .then(data => {
                this.briefData = data;
                
                // Mettre à jour la date du brief
                if (data.generated_at) {
                    const date = new Date(data.generated_at);
                    const formattedDate = date.toLocaleDateString('fr-FR');
                    this.briefDate.textContent = formattedDate;
                }
                
                // Charger le contenu du fichier MD
                return fetch('data/brief_ia.md');
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Erreur lors du chargement du brief stratégique');
                }
                return response.text();
            })
            .then(mdContent => {
                // Convertir le markdown en HTML
                const htmlContent = this.convertMarkdownToHTML(mdContent);
                
                // Supprimer le spinner de chargement
                this.briefContent.innerHTML = '';
                
                // Créer un conteneur pour le contenu formaté
                const contentDiv = document.createElement('div');
                contentDiv.className = 'brief-markdown animate-fadeInUp';
                contentDiv.innerHTML = htmlContent;
                
                // Ajouter au DOM
                this.briefContent.appendChild(contentDiv);
                
                // Marquer comme chargé
                this.isLoaded = true;
            })
            .catch(error => {
                console.error('Erreur:', error);
                this.briefContent.innerHTML = `
                    <div class="p-8 text-center">
                        <i class="fas fa-exclamation-triangle text-yellow-400 text-3xl mb-4"></i>
                        <p class="text-gray-400">Impossible de charger le brief stratégique</p>
                        <button class="mt-4 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors" onclick="window.briefLoader.retryLoad()">
                            <i class="fas fa-sync-alt mr-2"></i>Réessayer
                        </button>
                    </div>
                `;
            });
    }
    
    /**
     * Réessaie de charger le brief
     */
    retryLoad() {
        this.isLoaded = false;
        this.loadBriefContent();
    }
    
    /**
     * Convertit le Markdown en HTML avec formatage amélioré
     * @param {string} markdown - Le contenu Markdown
     * @return {string} Le HTML formaté
     */
    convertMarkdownToHTML(markdown) {
        // Extraction du contenu principal (sans l'en-tête et le pied de page)
        const mainContent = this.extractMainContent(markdown);
        
        // Conversion en HTML en préservant la structure
        let html = mainContent
            // Titres
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^### (.*$)/gm, (match, p1) => {
                // Formater les scénarios et probabilités
                if (p1.includes('Scénario') && p1.includes('probabilité')) {
                    const scenario = p1.split('(')[0].trim();
                    const probability = p1.split('(')[1].replace(')', '').trim();
                    
                    let probClass = 'probability-medium';
                    if (probability.includes('élevée')) {
                        probClass = 'probability-high';
                    } else if (probability.includes('faible')) {
                        probClass = 'probability-low';
                    }
                    
                    return `<h3><span class="scenario">${scenario}</span> (<span class="${probClass}">${probability}</span>)</h3>`;
                }
                return `<h3>${p1}</h3>`;
            })
            // Listes non ordonnées
            .replace(/^\- (.*$)/gm, '<li>$1</li>')
            .replace(/<li>.*<\/li>/g, match => {
                return '<ul>' + match + '</ul>';
            })
            .replace(/<\/ul><ul>/g, '')
            // Paragraphes
            .replace(/^(?!<h|<ul|<li|<p|<strong|<table)(.*$)/gm, '<p>$1</p>')
            // Gras
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italique
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Lignes horizontales
            .replace(/^---$/gm, '<hr class="my-4 border-t border-green-400 opacity-30">');
            
        return html;
    }
    
    /**
     * Extrait le contenu principal du Markdown, sans l'en-tête et le pied de page
     * @param {string} markdown - Le contenu Markdown complet
     * @return {string} Le contenu principal
     */
    extractMainContent(markdown) {
        // Tenter d'extraire uniquement la partie principale (sans en-tête et pied de page)
        const lines = markdown.split('\n');
        let startIndex = 0;
        let endIndex = lines.length;
        
        // Trouver l'index après les métadonnées initiales
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('## 1. Macroéconomie') || 
                lines[i].startsWith('## 1.') || 
                lines[i].startsWith('## Macroéconomie')) {
                startIndex = i;
                break;
            }
        }
        
        // Trouver l'index avant le pied de page
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].startsWith('---') || lines[i].startsWith('*Cette note')) {
                endIndex = i;
                break;
            }
        }
        
        return lines.slice(startIndex, endIndex).join('\n');
    }
}

// Initialiser le chargeur de brief quand le DOM est chargé
document.addEventListener('DOMContentLoaded', function() {
    window.briefLoader = new BriefLoader();
});