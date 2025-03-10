/**
 * theme-common.js - Gestion du thème et des préférences utilisateur commune à toutes les pages
 * 
 * Ce script est conçu pour être inclus sur toutes les pages de l'application
 * afin d'assurer une expérience utilisateur cohérente.
 */

class ThemeManager {
    constructor() {
        this.initThemeToggle();
        this.initCustomizationPanel();
        this.loadCustomizationPreferences();
    }
    
    /**
     * Crée et initialise les éléments UI nécessaires s'ils n'existent pas déjà
     */
    createUIElements() {
        // 1. Bouton de changement de thème (si absent)
        if (!document.querySelector('.theme-toggle')) {
            const themeToggle = document.createElement('div');
            themeToggle.className = 'theme-toggle';
            themeToggle.innerHTML = `
                <button id="theme-toggle-btn" aria-label="Changer de thème" class="button-press">
                    <i class="fas fa-moon" id="dark-icon"></i>
                    <i class="fas fa-sun" id="light-icon" style="display: none;"></i>
                </button>
            `;
            document.body.appendChild(themeToggle);
        }
        
        // 2. Bouton de personnalisation (si absent)
        if (!document.querySelector('.customization-btn')) {
            const customizationBtn = document.createElement('button');
            customizationBtn.id = 'open-customization';
            customizationBtn.className = 'customization-btn button-press';
            customizationBtn.setAttribute('aria-label', 'Personnaliser l\'interface');
            customizationBtn.innerHTML = '<i class="fas fa-paint-brush"></i>';
            document.body.appendChild(customizationBtn);
        }
        
        // 3. Panneau de personnalisation (si absent)
        if (!document.getElementById('customization-panel')) {
            const customizationPanel = document.createElement('div');
            customizationPanel.id = 'customization-panel';
            customizationPanel.className = 'customization-panel';
            customizationPanel.innerHTML = `
                <div class="panel-header">
                    <h3>Personnalisation</h3>
                    <button id="close-customization" class="close-btn"><i class="fas fa-times"></i></button>
                </div>
                <div class="panel-content">
                    <div class="customize-section">
                        <h4>Couleur d'accent</h4>
                        <div class="color-options">
                            <button class="color-option active" data-color="#00FF87" style="background-color: #00FF87;"></button>
                            <button class="color-option" data-color="#ff6b6b" style="background-color: #ff6b6b;"></button>
                            <button class="color-option" data-color="#4d79ff" style="background-color: #4d79ff;"></button>
                            <button class="color-option" data-color="#ffd166" style="background-color: #ffd166;"></button>
                            <button class="color-option" data-color="#bb6bd9" style="background-color: #bb6bd9;"></button>
                        </div>
                    </div>
                    <div class="customize-section">
                        <h4>Animation de fond</h4>
                        <div class="toggle-switch">
                            <input type="checkbox" id="bg-animation-toggle" checked>
                            <label for="bg-animation-toggle"></label>
                            <span>Activer</span>
                        </div>
                    </div>
                    <div class="customize-section">
                        <h4>Densité de l'interface</h4>
                        <div class="density-options">
                            <button class="density-option" data-density="compact">Compacte</button>
                            <button class="density-option active" data-density="normal">Normale</button>
                            <button class="density-option" data-density="comfortable">Confortable</button>
                        </div>
                    </div>
                    <button id="reset-customization" class="reset-btn">Réinitialiser par défaut</button>
                </div>
            `;
            document.body.appendChild(customizationPanel);
        }
    }
    
    /**
     * Initialise le sélecteur de thème clair/sombre
     */
    initThemeToggle() {
        // Créer les éléments UI s'ils n'existent pas
        this.createUIElements();
        
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        if (!themeToggleBtn) return; // Ne pas continuer si le bouton n'existe pas
        
        const darkIcon = document.getElementById('dark-icon');
        const lightIcon = document.getElementById('light-icon');
        const savedTheme = localStorage.getItem('tradepulse_theme');
        
        // Appliquer le thème sauvegardé
        if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
            darkIcon.style.display = 'none';
            lightIcon.style.display = 'block';
        }
        
        themeToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('light-theme');
            
            if (document.body.classList.contains('light-theme')) {
                localStorage.setItem('tradepulse_theme', 'light');
                darkIcon.style.display = 'none';
                lightIcon.style.display = 'block';
            } else {
                localStorage.setItem('tradepulse_theme', 'dark');
                darkIcon.style.display = 'block';
                lightIcon.style.display = 'none';
            }
            
            // Ajouter un effet de succès si l'enhancer est disponible
            if (window.uiEnhancer) {
                window.uiEnhancer.showSuccessAnimation(themeToggleBtn);
            }
        });
    }
    
    /**
     * Initialise le panneau de personnalisation
     */
    initCustomizationPanel() {
        const openCustomizationBtn = document.getElementById('open-customization');
        if (!openCustomizationBtn) return; // Ne pas continuer si le bouton n'existe pas
        
        const closeCustomizationBtn = document.getElementById('close-customization');
        const customizationPanel = document.getElementById('customization-panel');
        const colorOptions = document.querySelectorAll('.color-option');
        const resetBtn = document.getElementById('reset-customization');
        const bgAnimationToggle = document.getElementById('bg-animation-toggle');
        const densityOptions = document.querySelectorAll('.density-option');
        
        // Événements d'ouverture/fermeture du panneau
        openCustomizationBtn.addEventListener('click', () => {
            customizationPanel.classList.add('open');
        });
        
        closeCustomizationBtn.addEventListener('click', () => {
            customizationPanel.classList.remove('open');
        });
        
        // Gestion des couleurs d'accent
        colorOptions.forEach(option => {
            option.addEventListener('click', () => {
                const color = option.getAttribute('data-color');
                this.setAccentColor(color);
                
                // Mise à jour visuelle des options
                colorOptions.forEach(o => o.classList.remove('active'));
                option.classList.add('active');
            });
        });
        
        // Gestion de l'animation de fond
        if (bgAnimationToggle) {
            bgAnimationToggle.addEventListener('change', () => {
                const enabled = bgAnimationToggle.checked;
                this.toggleBackgroundAnimation(enabled);
            });
        }
        
        // Gestion de la densité de l'interface
        densityOptions.forEach(option => {
            option.addEventListener('click', () => {
                const density = option.getAttribute('data-density');
                this.setInterfaceDensity(density);
                
                // Mise à jour visuelle des options
                densityOptions.forEach(o => o.classList.remove('active'));
                option.classList.add('active');
            });
        });
        
        // Réinitialisation des préférences
        resetBtn.addEventListener('click', () => {
            this.resetCustomization();
        });
    }
    
    /**
     * Définit la couleur d'accent de l'interface
     */
    setAccentColor(color) {
        document.documentElement.style.setProperty('--accent-color', color);
        localStorage.setItem('tradepulse_accent_color', color);
    }
    
    /**
     * Active/désactive les animations d'arrière-plan
     */
    toggleBackgroundAnimation(enabled) {
        const particles = document.getElementById('particles-js');
        const financialBg = document.querySelector('.financial-background');
        
        if (particles) particles.style.display = enabled ? 'block' : 'none';
        if (financialBg) financialBg.style.display = enabled ? 'block' : 'none';
        
        localStorage.setItem('tradepulse_bg_animation', enabled.toString());
    }
    
    /**
     * Définit la densité de l'interface (compacte, normale, confortable)
     */
    setInterfaceDensity(density) {
        document.body.className = document.body.className.replace(/density-\w+/g, '');
        document.body.classList.add(`density-${density}`);
        localStorage.setItem('tradepulse_interface_density', density);
    }
    
    /**
     * Charge les préférences de personnalisation sauvegardées
     */
    loadCustomizationPreferences() {
        // Charger couleur d'accent
        const savedColor = localStorage.getItem('tradepulse_accent_color');
        if (savedColor) {
            this.setAccentColor(savedColor);
            const activeOption = document.querySelector(`.color-option[data-color="${savedColor}"]`);
            if (activeOption) activeOption.classList.add('active');
        }
        
        // Charger préférence d'animation
        const savedAnimation = localStorage.getItem('tradepulse_bg_animation');
        if (savedAnimation !== null) {
            const enabled = savedAnimation === 'true';
            const bgToggle = document.getElementById('bg-animation-toggle');
            if (bgToggle) bgToggle.checked = enabled;
            this.toggleBackgroundAnimation(enabled);
        }
        
        // Charger densité d'interface
        const savedDensity = localStorage.getItem('tradepulse_interface_density');
        if (savedDensity) {
            this.setInterfaceDensity(savedDensity);
            const activeOption = document.querySelector(`.density-option[data-density="${savedDensity}"]`);
            if (activeOption) {
                document.querySelectorAll('.density-option').forEach(o => o.classList.remove('active'));
                activeOption.classList.add('active');
            }
        }
        
        // Charger le thème (clair/sombre)
        const savedTheme = localStorage.getItem('tradepulse_theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
            const darkIcon = document.getElementById('dark-icon');
            const lightIcon = document.getElementById('light-icon');
            if (darkIcon) darkIcon.style.display = 'none';
            if (lightIcon) lightIcon.style.display = 'block';
        }
    }
    
    /**
     * Réinitialise toutes les préférences de personnalisation
     */
    resetCustomization() {
        // Réinitialiser toutes les préférences
        this.setAccentColor('#00FF87');
        this.toggleBackgroundAnimation(true);
        this.setInterfaceDensity('normal');
        
        // Mise à jour visuelle
        const bgToggle = document.getElementById('bg-animation-toggle');
        if (bgToggle) bgToggle.checked = true;
        
        document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
        const defaultColor = document.querySelector('.color-option[data-color="#00FF87"]');
        if (defaultColor) defaultColor.classList.add('active');
        
        document.querySelectorAll('.density-option').forEach(o => o.classList.remove('active'));
        const normalDensity = document.querySelector('.density-option[data-density="normal"]');
        if (normalDensity) normalDensity.classList.add('active');
    }
}

// Initialiser le gestionnaire de thème au chargement de la page
window.themeManager = new ThemeManager();

// Fonction de démarrage automatique
(function() {
    // S'assurer que le DOM est chargé
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }
    
    function initTheme() {
        // Initialiser le gestionnaire de thème s'il n'est pas déjà initialisé
        if (!window.themeManager) {
            window.themeManager = new ThemeManager();
        }
    }
})();
