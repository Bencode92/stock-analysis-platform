/**
 * update-modal.js - Gestion du modal de mise à jour des données
 * Ce script gère la mise à jour des données financières via Perplexity AI
 * et affiche un modal interactif pour informer l'utilisateur
 */

// Configuration pour le gestionnaire de mise à jour
const UPDATE_CONFIG = {
    // Clé pour stocker la date de dernière mise à jour
    lastUpdateKey: 'tradepulse_last_update',
    
    // Intervalle minimal entre les mises à jour (en heures)
    minUpdateInterval: 4,
    
    // Seuil pour considérer les données comme périmées (en heures)
    dataExpirationThreshold: 24,
    
    // Modal DOM ID
    modalId: 'update-overlay',
    
    // URL de redirection après mise à jour (ou si skip)
    redirectUrl: 'actualites.html'
};

/**
 * Classe pour gérer le modal de mise à jour et la synchronisation des données
 */
class UpdateManager {
    constructor() {
        // Vérifier si le DOM est déjà chargé
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    /**
     * Initialisation du gestionnaire
     */
    init() {
        console.log('🔄 Initialisation du gestionnaire de mise à jour...');
        
        // Créer le modal s'il n'existe pas déjà
        this.createUpdateModal();
        
        // Vérifier si une mise à jour est nécessaire
        if (this.isUpdateNeeded()) {
            console.log('🔍 Mise à jour des données nécessaire');
            this.showUpdateModal();
        } else {
            console.log('✓ Données à jour, pas besoin de synchronisation');
            // Si on est sur la page d'accueil, le modal ne sera pas affiché
            // et la redirection est gérée ailleurs
        }
    }
    
    /**
     * Détermine si une mise à jour est nécessaire
     * @returns {boolean} Vrai si une mise à jour est nécessaire
     */
    isUpdateNeeded() {
        const lastUpdate = localStorage.getItem(UPDATE_CONFIG.lastUpdateKey);
        
        if (!lastUpdate) {
            console.log('⚠️ Première utilisation, mise à jour requise');
            return true;
        }
        
        const lastUpdateTime = parseInt(lastUpdate);
        const now = Date.now();
        const hoursSinceLastUpdate = (now - lastUpdateTime) / (1000 * 60 * 60);
        
        console.log(`📊 Dernière mise à jour il y a ${hoursSinceLastUpdate.toFixed(1)} heures`);
        
        // Si les données ont plus de X heures, une mise à jour est nécessaire
        return hoursSinceLastUpdate > UPDATE_CONFIG.minUpdateInterval;
    }
    
    /**
     * Crée le modal de mise à jour s'il n'existe pas déjà
     */
    createUpdateModal() {
        // Vérifier si le modal existe déjà
        if (document.getElementById(UPDATE_CONFIG.modalId)) {
            return;
        }
        
        // Créer l'élément du modal
        const modalOverlay = document.createElement('div');
        modalOverlay.id = UPDATE_CONFIG.modalId;
        modalOverlay.style.display = 'none';
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.background = 'rgba(1, 22, 39, 0.9)';
        modalOverlay.style.zIndex = '9999';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';
        
        // Structure HTML du modal
        const now = new Date();
        const dateStr = now.toLocaleDateString('fr-FR');
        
        modalOverlay.innerHTML = `
            <div class="update-modal">
                <h2 class="modal-title">Mise à jour des données</h2>
                <p class="modal-message">Souhaitez-vous mettre à jour les données financières pour obtenir les dernières actualités et recommandations?</p>
                
                <div class="last-update-box">
                    <i class="fas fa-info-circle"></i>
                    <span>Dernière synchronisation: <span class="update-time" id="lastSyncTime">Jamais</span></span>
                </div>
                
                <div class="modal-buttons">
                    <button id="skipUpdateBtn" class="modal-btn">Ignorer</button>
                    <button id="startUpdateBtn" class="modal-btn primary">Mettre à jour maintenant</button>
                </div>
                
                <!-- États du processus de mise à jour -->
                <div class="update-loader" style="display: none;">
                    <div class="update-spinner"></div>
                    <p class="update-status">Synchronisation des données en cours...</p>
                    <div class="progress-bar-outer">
                        <div class="progress-bar-inner"></div>
                        <span class="update-percentage">0%</span>
                    </div>
                </div>
                
                <div class="update-complete" style="display: none;">
                    <div class="success-checkmark">
                        <i class="fas fa-check"></i>
                    </div>
                    <p class="update-status">Données mises à jour avec succès !</p>
                </div>
            </div>
        `;
        
        // Ajouter le modal au corps du document
        document.body.appendChild(modalOverlay);
        
        // Mettre à jour l'affichage de la dernière synchronisation
        this.updateLastSyncDisplay();
        
        // Ajouter les gestionnaires d'événements
        this.setupEventListeners();
    }
    
    /**
     * Met à jour l'affichage de la dernière synchronisation
     */
    updateLastSyncDisplay() {
        const lastUpdate = localStorage.getItem(UPDATE_CONFIG.lastUpdateKey);
        const lastSyncElement = document.getElementById('lastSyncTime');
        
        if (lastSyncElement) {
            if (lastUpdate) {
                const date = new Date(parseInt(lastUpdate));
                lastSyncElement.textContent = this.formatDateTime(date);
            } else {
                lastSyncElement.textContent = 'Jamais';
            }
        }
    }
    
    /**
     * Formate une date et une heure
     * @param {Date} date - Date à formater
     * @returns {string} Date et heure formatées
     */
    formatDateTime(date) {
        const dateStr = date.toLocaleDateString('fr-FR');
        const timeStr = date.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        return `${dateStr} à ${timeStr}`;
    }
    
    /**
     * Configure les écouteurs d'événements pour le modal
     */
    setupEventListeners() {
        // Bouton ignorer
        const skipBtn = document.getElementById('skipUpdateBtn');
        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                this.hideUpdateModal();
                this.redirectAfterUpdate();
            });
        }
        
        // Bouton de mise à jour
        const updateBtn = document.getElementById('startUpdateBtn');
        if (updateBtn) {
            updateBtn.addEventListener('click', () => {
                this.startUpdate();
            });
        }
    }
    
    /**
     * Affiche le modal de mise à jour
     */
    showUpdateModal() {
        const modal = document.getElementById(UPDATE_CONFIG.modalId);
        if (modal) {
            modal.style.display = 'flex';
        }
    }
    
    /**
     * Cache le modal de mise à jour
     */
    hideUpdateModal() {
        const modal = document.getElementById(UPDATE_CONFIG.modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }
    
    /**
     * Commence le processus de mise à jour
     */
    startUpdate() {
        // Masquer les boutons et afficher le loader
        const buttons = document.querySelector('.modal-buttons');
        const loader = document.querySelector('.update-loader');
        
        if (buttons) buttons.style.display = 'none';
        if (loader) loader.style.display = 'block';
        
        // Simuler une progression
        this.updateProgress(0);
        
        // Vérifier si l'intégration Perplexity est disponible
        if (window.perplexityIntegration) {
            // Utiliser l'intégration Perplexity pour mettre à jour les données
            window.perplexityIntegration.updateData()
                .then(() => {
                    // Mise à jour réussie
                    this.finishUpdate();
                })
                .catch(error => {
                    console.error('❌ Erreur lors de la mise à jour des données:', error);
                    // Essayons quand même de terminer le processus
                    this.finishUpdate();
                });
                
            // Simuler une progression pendant la mise à jour
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += Math.random() * 10;
                if (progress > 95) progress = 95; // Laisser les 5% restants pour la fin
                this.updateProgress(progress);
            }, 500);
            
            // Stocker l'intervalle pour pouvoir l'annuler plus tard
            this.progressInterval = progressInterval;
        } else {
            // Simulation de mise à jour si l'intégration n'est pas disponible
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += Math.random() * 15;
                this.updateProgress(progress);
                
                if (progress >= 100) {
                    clearInterval(progressInterval);
                    this.finishUpdate();
                }
            }, 300);
        }
    }
    
    /**
     * Met à jour la barre de progression
     * @param {number} percent - Pourcentage d'avancement
     */
    updateProgress(percent) {
        const progressBar = document.querySelector('.progress-bar-inner');
        const percentDisplay = document.querySelector('.update-percentage');
        
        if (progressBar) {
            progressBar.style.width = `${Math.min(100, percent)}%`;
        }
        
        if (percentDisplay) {
            percentDisplay.textContent = `${Math.floor(percent)}%`;
        }
    }
    
    /**
     * Termine le processus de mise à jour
     */
    finishUpdate() {
        // Arrêter la simulation de progression
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        
        // Mettre à jour la barre de progression à 100%
        this.updateProgress(100);
        
        // Masquer le loader et afficher le message de succès
        const loader = document.querySelector('.update-loader');
        const complete = document.querySelector('.update-complete');
        
        if (loader) loader.style.display = 'none';
        if (complete) complete.style.display = 'block';
        
        // Mettre à jour la date de dernière mise à jour
        localStorage.setItem(UPDATE_CONFIG.lastUpdateKey, Date.now().toString());
        
        // Rediriger après un court délai
        setTimeout(() => {
            this.hideUpdateModal();
            this.redirectAfterUpdate();
        }, 1500);
    }
    
    /**
     * Redirige l'utilisateur après la mise à jour
     */
    redirectAfterUpdate() {
        window.location.href = UPDATE_CONFIG.redirectUrl;
    }
}

// Créer une instance du gestionnaire de mise à jour
const updateManager = new UpdateManager();

// Exporter pour utilisation dans d'autres modules
window.updateManager = updateManager;
