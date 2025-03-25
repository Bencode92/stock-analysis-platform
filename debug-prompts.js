/**
 * Module de débogage pour TradePulse
 * Ce script gère l'accès aux fichiers de débogage des prompts ChatGPT
 */

class DebugPromptManager {
    constructor() {
        this.debugDir = 'debug/prompts';
        this.filesCache = {
            prompts: [],
            responses: []
        };
        this.lastRefresh = null;
    }

    /**
     * Initialise le gestionnaire de débogage
     */
    async init() {
        console.log('🔍 Initialisation du module de débogage des prompts...');
        await this.refreshFilesList();
        this.setupEventListeners();
    }

    /**
     * Configure les écouteurs d'événements
     */
    setupEventListeners() {
        document.getElementById('btnRefresh')?.addEventListener('click', () => this.refreshFilesList());

        // Délégation d'événement pour les boutons "Voir"
        document.addEventListener('click', async (e) => {
            if (e.target.matches('.view-btn')) {
                const path = e.target.getAttribute('data-path');
                const type = e.target.getAttribute('data-type');
                await this.viewFileContent(path, type);
            }
        });

        // Délégation d'événement pour les boutons "Ouvrir HTML"
        document.addEventListener('click', (e) => {
            if (e.target.matches('.open-html-btn')) {
                const htmlPath = e.target.getAttribute('data-html');
                this.openHtmlFile(htmlPath);
            }
        });
    }

    /**
     * Rafraîchit la liste des fichiers de débogage
     */
    async refreshFilesList() {
        try {
            console.log('🔄 Rafraîchissement de la liste des fichiers de débogage...');
            
            // Récupérer la liste des fichiers depuis le système de fichiers
            const files = await this.findDebugFiles();
            
            this.filesCache = files;
            this.lastRefresh = new Date();
            
            // Mettre à jour l'interface utilisateur
            this.updateUI();
            
            console.log(`✅ ${files.prompts.length} prompts et ${files.responses.length} réponses trouvés`);
            return files;
        } catch (error) {
            console.error('❌ Erreur lors du rafraîchissement des fichiers:', error);
            this.showError(`Erreur de chargement: ${error.message}`);
            return { prompts: [], responses: [] };
        }
    }

    /**
     * Trouve tous les fichiers de débogage disponibles
     */
    async findDebugFiles() {
        // Dans un navigateur, nous ne pouvons pas accéder directement au système de fichiers
        // Cette fonction serait normalement implémentée côté serveur

        // Pour TradePulse, nous utilisons un mécanisme de découverte basé sur
        // les données que nous avons stockées dans localStorage pour simuler l'accès au système de fichiers
        
        const debugFiles = {
            prompts: [],
            responses: []
        };

        try {
            // Récupérer la liste des fichiers depuis localStorage
            const savedFiles = localStorage.getItem('tradepulse_debug_files');
            
            if (savedFiles) {
                const parsedFiles = JSON.parse(savedFiles);
                return parsedFiles;
            }
            
            // Si nous n'avons pas de données sauvegardées, rechercher dans le répertoire de débogage
            // Ceci est une simulation - dans un cas réel, il faudrait une API serveur
            
            // Récupérer les fichiers depuis les noms que nous avons vu dans la console
            if (localStorage.getItem('debug_last_prompt')) {
                const lastPromptInfo = JSON.parse(localStorage.getItem('debug_last_prompt'));
                
                debugFiles.prompts.push({
                    filename: `prompt_${lastPromptInfo.timestamp}.txt`,
                    path: `debug/prompts/prompt_${lastPromptInfo.timestamp}.txt`,
                    htmlPath: `debug/prompts/prompt_${lastPromptInfo.timestamp}.html`,
                    timestamp: this.formatTimestamp(lastPromptInfo.timestamp)
                });
                
                debugFiles.responses.push({
                    filename: `response_${lastPromptInfo.timestamp}.txt`,
                    path: `debug/prompts/response_${lastPromptInfo.timestamp}.txt`,
                    htmlPath: '',
                    timestamp: this.formatTimestamp(lastPromptInfo.timestamp)
                });
            }
            
            return debugFiles;
        } catch (error) {
            console.error('Erreur lors de la recherche des fichiers de débogage:', error);
            return { prompts: [], responses: [] };
        }
    }

    /**
     * Formate un timestamp pour l'affichage
     */
    formatTimestamp(timestamp) {
        // Converti un timestamp au format YYYYMMDD_HHMMSS en date lisible
        if (!timestamp || typeof timestamp !== 'string') return 'Date inconnue';
        
        try {
            const year = timestamp.substring(0, 4);
            const month = timestamp.substring(4, 6);
            const day = timestamp.substring(6, 8);
            const hour = timestamp.substring(9, 11);
            const minute = timestamp.substring(11, 13);
            const second = timestamp.substring(13, 15);
            
            const date = new Date(year, month - 1, day, hour, minute, second);
            
            // Formatter en français
            const options = { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            };
            
            return date.toLocaleDateString('fr-FR', options);
        } catch (e) {
            console.error('Erreur de formatage de timestamp:', e);
            return timestamp;
        }
    }

    /**
     * Met à jour l'interface utilisateur avec les fichiers trouvés
     */
    updateUI() {
        // Mettre à jour la liste des prompts
        const promptsContainer = document.getElementById('debugList');
        const responsesContainer = document.getElementById('responsesList');
        
        if (!promptsContainer || !responsesContainer) return;
        
        // Mettre à jour les prompts
        if (this.filesCache.prompts.length > 0) {
            promptsContainer.innerHTML = '';
            this.filesCache.prompts.forEach(file => {
                promptsContainer.appendChild(this.createFileEntry(file, 'prompt'));
            });
        } else {
            promptsContainer.innerHTML = this.getEmptyStateHTML('prompts');
        }
        
        // Mettre à jour les réponses
        if (this.filesCache.responses.length > 0) {
            responsesContainer.innerHTML = '';
            this.filesCache.responses.forEach(file => {
                responsesContainer.appendChild(this.createFileEntry(file, 'response'));
            });
        } else {
            responsesContainer.innerHTML = this.getEmptyStateHTML('responses');
        }
    }

    /**
     * Crée un élément HTML pour un fichier de débogage
     */
    createFileEntry(file, type) {
        const entry = document.createElement('div');
        entry.className = 'debug-entry';
        
        const htmlButton = file.htmlPath ? 
            `<button class="debug-btn debug-btn-primary open-html-btn" data-html="${file.htmlPath}">Ouvrir HTML</button>` : 
            '';
        
        entry.innerHTML = `
            <div class="debug-timestamp">${file.timestamp}</div>
            <div class="debug-filename">${file.filename}</div>
            <div class="debug-actions">
                <button class="debug-btn view-btn" data-path="${file.path}" data-type="${type}">Voir</button>
                ${htmlButton}
            </div>
        `;
        
        return entry;
    }

    /**
     * Affiche le contenu d'un fichier
     */
    async viewFileContent(path, type) {
        try {
            console.log(`🔍 Affichage du fichier: ${path}`);
            
            // Dans un navigateur réel, nous ne pouvons pas accéder au contenu du fichier directement
            // Simulons le contenu basé sur le fichier que nous avons vu dans la console
            
            let content = "Le contenu du fichier n'est pas disponible via l'interface web.";
            content += "\n\nPour voir le contenu complet, suivez ces étapes :";
            content += "\n1. Ouvrez l'explorateur de fichiers sur votre ordinateur";
            content += `\n2. Naviguez vers le dossier du projet`;
            content += `\n3. Ouvrez le fichier '${path}'`;
            
            if (path.endsWith('.html')) {
                content += "\n\nVous pouvez aussi cliquer sur 'Ouvrir HTML' pour une meilleure visualisation.";
            }
            
            this.showContentModal(
                type === 'prompt' ? 'Contenu du prompt' : 'Réponse de ChatGPT', 
                content
            );
            
            // Enregistrer le dernier fichier visualisé
            localStorage.setItem('debug_last_viewed', JSON.stringify({
                path,
                type,
                timestamp: new Date().toISOString()
            }));
            
            return content;
        } catch (error) {
            console.error(`❌ Erreur lors de l'affichage du fichier ${path}:`, error);
            this.showError(`Impossible d'afficher le fichier: ${error.message}`);
            return null;
        }
    }

    /**
     * Ouvre un fichier HTML dans un nouvel onglet
     */
    openHtmlFile(path) {
        // Dans un navigateur web, nous ne pouvons pas accéder au système de fichiers
        // Affichez un message expliquant comment accéder au fichier
        alert(`Pour visualiser le fichier HTML, accédez à ce chemin sur votre système:\n\n${path}\n\nCe fichier contient une version formatée du prompt qui est plus facile à lire.`);
    }

    /**
     * Affiche le contenu dans une modale
     */
    showContentModal(title, content) {
        const modal = document.getElementById('debugModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalContent = document.getElementById('modalContent');
        
        if (!modal || !modalTitle || !modalContent) return;
        
        modalTitle.textContent = title;
        modalContent.textContent = content;
        modal.classList.add('active');
    }

    /**
     * Affiche un message d'erreur
     */
    showError(message) {
        const debugList = document.getElementById('debugList');
        if (!debugList) return;
        
        debugList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">❌</div>
                <h3>Erreur</h3>
                <p>${message}</p>
            </div>
        `;
    }

    /**
     * Obtient le HTML pour un état vide
     */
    getEmptyStateHTML(type) {
        if (type === 'prompts') {
            return `
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <h3>Aucun prompt trouvé</h3>
                    <p>Exécutez le script generate_portfolios.py pour générer des prompts de débogage</p>
                </div>
            `;
        } else {
            return `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <h3>Aucune réponse trouvée</h3>
                </div>
            `;
        }
    }

    /**
     * Enregistre un nouveau fichier de débogage
     * Cette fonction serait appelée par generate_portfolios.py via localStorage
     */
    static recordDebugFile(timestamp, data) {
        try {
            // Enregistrer les informations du dernier prompt dans localStorage
            localStorage.setItem('debug_last_prompt', JSON.stringify({
                timestamp,
                ...data
            }));
            
            // Mettre à jour la liste des fichiers connus
            const savedFiles = localStorage.getItem('tradepulse_debug_files');
            let files = savedFiles ? JSON.parse(savedFiles) : { prompts: [], responses: [] };
            
            // Ajouter le nouveau prompt à la liste
            files.prompts.unshift({
                filename: `prompt_${timestamp}.txt`,
                path: `debug/prompts/prompt_${timestamp}.txt`,
                htmlPath: `debug/prompts/prompt_${timestamp}.html`,
                timestamp: new Date().toLocaleString('fr-FR')
            });
            
            // Ajouter la nouvelle réponse à la liste
            files.responses.unshift({
                filename: `response_${timestamp}.txt`,
                path: `debug/prompts/response_${timestamp}.txt`,
                htmlPath: '',
                timestamp: new Date().toLocaleString('fr-FR')
            });
            
            // Limiter à 10 fichiers
            files.prompts = files.prompts.slice(0, 10);
            files.responses = files.responses.slice(0, 10);
            
            // Sauvegarder la liste mise à jour
            localStorage.setItem('tradepulse_debug_files', JSON.stringify(files));
            
            console.log('✅ Enregistrement du fichier de débogage réussi');
            return true;
        } catch (error) {
            console.error('❌ Erreur lors de l\'enregistrement du fichier de débogage:', error);
            return false;
        }
    }
}

// Initialisation du gestionnaire de débogage
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('debug-prompts.html')) {
        const debugManager = new DebugPromptManager();
        debugManager.init();
        
        // Exposer l'instance pour les tests
        window.debugManager = debugManager;
    }
});

// Exposer la méthode statique pour l'enregistrement des fichiers
window.recordDebugFile = DebugPromptManager.recordDebugFile;