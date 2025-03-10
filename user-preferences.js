/**
 * user-preferences.js - Gestion des préférences utilisateur pour TradePulse
 * 
 * Ce fichier gère:
 * - Le changement de thème clair/sombre
 * - La personnalisation de l'interface (couleurs, animations, etc.)
 * - La disposition personnalisable du tableau de bord
 */

class UserPreferences {
    constructor() {
        this.initThemeToggle();
        this.initCustomizationPanel();
        this.initDashboardCustomization();
    }
    
    /**
     * Initialise le sélecteur de thème clair/sombre
     */
    initThemeToggle() {
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
        
        // Chargement des préférences sauvegardées
        this.loadCustomizationPreferences();
        
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
        bgAnimationToggle.addEventListener('change', () => {
            const enabled = bgAnimationToggle.checked;
            this.toggleBackgroundAnimation(enabled);
        });
        
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
    
    /**
     * Initialise la personnalisation du tableau de bord
     */
    initDashboardCustomization() {
        const editDashboardBtn = document.getElementById('edit-dashboard');
        const dashboardGrid = document.getElementById('dashboard-grid');
        
        if (!dashboardGrid || !editDashboardBtn) return; // Ne pas continuer si on n'est pas sur la page du tableau de bord
        
        // Vérifier que Sortable.js est chargé
        if (typeof Sortable === 'undefined') {
            console.error('Sortable.js est requis pour la personnalisation du tableau de bord.');
            return;
        }
        
        // Initialiser Sortable.js
        const sortable = new Sortable(dashboardGrid, {
            animation: 150,
            handle: '.widget-header',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            disabled: true, // Désactivé par défaut
            onEnd: (evt) => {
                this.saveDashboardLayout();
            }
        });
        
        // Basculer le mode édition
        editDashboardBtn.addEventListener('click', () => {
            const isEditMode = dashboardGrid.classList.toggle('edit-mode');
            sortable.option('disabled', !isEditMode);
            editDashboardBtn.innerHTML = isEditMode ? 
                '<i class="fas fa-check"></i> Terminer' : 
                '<i class="fas fa-grip-lines"></i> Réorganiser';
        });
        
        // Initialiser la minimisation des widgets
        const minimizeButtons = document.querySelectorAll('.widget-control.minimize');
        minimizeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const widget = e.target.closest('.dashboard-widget');
                const content = widget.querySelector('.widget-content');
                const isMinimized = content.classList.toggle('minimized');
                
                // Changer l'icône du bouton
                if (btn.querySelector('i')) {
                    btn.querySelector('i').className = isMinimized ? 
                        'fas fa-plus' : 
                        'fas fa-minus';
                }
                
                this.saveWidgetState(widget.getAttribute('data-widget-id'), 'minimized', isMinimized);
            });
        });
        
        // Charger la disposition sauvegardée
        this.loadDashboardLayout();
    }
    
    /**
     * Sauvegarde la disposition actuelle du tableau de bord
     */
    saveDashboardLayout() {
        const dashboardGrid = document.getElementById('dashboard-grid');
        if (!dashboardGrid) return;
        
        const widgets = dashboardGrid.querySelectorAll('.dashboard-widget');
        const layout = [];
        
        widgets.forEach(widget => {
            layout.push(widget.getAttribute('data-widget-id'));
        });
        
        localStorage.setItem('tradepulse_dashboard_layout', JSON.stringify(layout));
    }
    
    /**
     * Charge la disposition sauvegardée du tableau de bord
     */
    loadDashboardLayout() {
        const savedLayout = localStorage.getItem('tradepulse_dashboard_layout');
        if (!savedLayout) return;
        
        try {
            const layout = JSON.parse(savedLayout);
            const dashboardGrid = document.getElementById('dashboard-grid');
            if (!dashboardGrid) return;
            
            // Réorganiser les widgets selon la disposition sauvegardée
            layout.forEach(widgetId => {
                const widget = dashboardGrid.querySelector(`.dashboard-widget[data-widget-id="${widgetId}"]`);
                if (widget) dashboardGrid.appendChild(widget);
            });
            
            // Restaurer l'état des widgets (minimisé ou non)
            dashboardGrid.querySelectorAll('.dashboard-widget').forEach(widget => {
                const widgetId = widget.getAttribute('data-widget-id');
                const isMinimized = this.getWidgetState(widgetId, 'minimized');
                
                if (isMinimized) {
                    const content = widget.querySelector('.widget-content');
                    const minBtn = widget.querySelector('.widget-control.minimize i');
                    
                    if (content) content.classList.add('minimized');
                    if (minBtn) minBtn.className = 'fas fa-plus';
                }
            });
        } catch (error) {
            console.error('Erreur lors du chargement de la disposition du tableau de bord', error);
        }
    }
    
    /**
     * Sauvegarde l'état d'un widget
     */
    saveWidgetState(widgetId, property, value) {
        let widgetStates = JSON.parse(localStorage.getItem('tradepulse_widget_states') || '{}');
        if (!widgetStates[widgetId]) widgetStates[widgetId] = {};
        
        widgetStates[widgetId][property] = value;
        localStorage.setItem('tradepulse_widget_states', JSON.stringify(widgetStates));
    }
    
    /**
     * Récupère l'état sauvegardé d'un widget
     */
    getWidgetState(widgetId, property) {
        const widgetStates = JSON.parse(localStorage.getItem('tradepulse_widget_states') || '{}');
        return widgetStates[widgetId] ? widgetStates[widgetId][property] : null;
    }
}

// Initialiser les préférences utilisateur lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    window.userPreferences = new UserPreferences();
});