/**
 * Améliorations pour le simulateur d'investissement
 * Version 2.0 - Optimisations et nouvelles fonctionnalités
 */

// ✅ 1. Correction du problème de duplication des icônes info
function preventDuplicateInfoIcons() {
    // Nettoyer les icônes existantes avant d'en ajouter de nouvelles
    document.querySelectorAll('.info-icon').forEach(icon => {
        if (icon.parentNode && !icon.dataset.permanent) {
            icon.remove();
        }
    });
}

// ✅ 2. Amélioration du système de notification
class EnhancedNotificationSystem {
    constructor() {
        this.container = this.createContainer();
        this.notifications = new Map();
    }

    createContainer() {
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.className = 'fixed top-4 right-4 z-50 space-y-2';
            document.body.appendChild(container);
        }
        return container;
    }

    show(message, type = 'info', duration = 5000) {
        const id = Date.now().toString();
        const notification = this.createNotification(id, message, type, duration);
        
        this.container.appendChild(notification);
        this.notifications.set(id, notification);

        // Animation d'entrée
        requestAnimationFrame(() => {
            notification.classList.add('translate-x-0', 'opacity-100');
            notification.classList.remove('translate-x-full', 'opacity-0');
        });

        // Auto-suppression
        if (duration > 0) {
            setTimeout(() => this.remove(id), duration);
        }

        return id;
    }

    createNotification(id, message, type, duration) {
        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            warning: 'bg-yellow-500',
            info: 'bg-blue-500'
        };

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const notification = document.createElement('div');
        notification.className = `
            transform transition-all duration-300 ease-out
            translate-x-full opacity-0
            max-w-sm w-full ${colors[type]} text-white
            rounded-lg shadow-lg p-4 backdrop-blur-sm
        `;
        
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${icons[type]} mr-3 text-lg"></i>
                <div class="flex-1">
                    <p class="text-sm font-medium">${message}</p>
                </div>
                <button class="ml-4 text-white hover:text-gray-200 transition-colors" onclick="notificationSystem.remove('${id}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            ${duration > 0 ? `
                <div class="mt-2 w-full bg-white bg-opacity-20 rounded-full h-1">
                    <div class="bg-white h-1 rounded-full progress-bar" style="animation: shrink ${duration}ms linear;"></div>
                </div>
            ` : ''}
        `;

        return notification;
    }

    remove(id) {
        const notification = this.notifications.get(id);
        if (notification) {
            notification.classList.add('translate-x-full', 'opacity-0');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                this.notifications.delete(id);
            }, 300);
        }
    }
}

// ✅ 3. Gestionnaire de performance amélioré
class PerformanceTracker {
    constructor() {
        this.metrics = new Map();
        this.startTime = performance.now();
    }

    start(label) {
        this.metrics.set(label, performance.now());
    }

    end(label) {
        const startTime = this.metrics.get(label);
        if (startTime) {
            const duration = performance.now() - startTime;
            console.log(`⚡ ${label}: ${duration.toFixed(2)}ms`);
            this.metrics.delete(label);
            return duration;
        }
    }

    async measureAsync(label, asyncFn) {
        this.start(label);
        try {
            const result = await asyncFn();
            this.end(label);
            return result;
        } catch (error) {
            this.end(label);
            throw error;
        }
    }
}

// ✅ 4. Amélioration de la gestion des formulaires
class SmartFormManager {
    constructor(formSelector) {
        this.form = document.querySelector(formSelector);
        this.validators = new Map();
        this.autoSave = true;
        this.init();
    }

    init() {
        if (!this.form) return;

        // Validation en temps réel
        this.form.addEventListener('input', this.debounce((e) => {
            this.validateField(e.target);
            if (this.autoSave) this.saveToLocalStorage();
        }, 300));

        // Restaurer les données sauvegardées
        this.restoreFromLocalStorage();
    }

    addValidator(fieldName, validatorFn, errorMessage) {
        this.validators.set(fieldName, { validatorFn, errorMessage });
    }

    validateField(field) {
        const validator = this.validators.get(field.name);
        if (!validator) return true;

        const isValid = validator.validatorFn(field.value);
        this.toggleFieldError(field, isValid, validator.errorMessage);
        return isValid;
    }

    toggleFieldError(field, isValid, errorMessage) {
        let errorEl = field.parentNode.querySelector('.field-error');
        
        if (isValid) {
            if (errorEl) errorEl.remove();
            field.classList.remove('border-red-500');
            field.classList.add('border-green-500');
        } else {
            if (!errorEl) {
                errorEl = document.createElement('div');
                errorEl.className = 'field-error text-red-400 text-sm mt-1';
                field.parentNode.appendChild(errorEl);
            }
            errorEl.textContent = errorMessage;
            field.classList.remove('border-green-500');
            field.classList.add('border-red-500');
        }
    }

    saveToLocalStorage() {
        const data = new FormData(this.form);
        const formData = Object.fromEntries(data.entries());
        localStorage.setItem(`form_${this.form.id}`, JSON.stringify(formData));
    }

    restoreFromLocalStorage() {
        const saved = localStorage.getItem(`form_${this.form.id}`);
        if (saved) {
            const data = JSON.parse(saved);
            Object.entries(data).forEach(([key, value]) => {
                const field = this.form.querySelector(`[name="${key}"]`);
                if (field) field.value = value;
            });
        }
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// ✅ 5. Calculateur financier optimisé
class FinancialCalculator {
    static calculateCompoundInterest(principal, rate, time, frequency = 1) {
        return principal * Math.pow(1 + (rate / frequency), frequency * time);
    }

    static calculateAnnuity(principal, rate, periods) {
        if (rate === 0) return principal / periods;
        return principal * (rate * Math.pow(1 + rate, periods)) / (Math.pow(1 + rate, periods) - 1);
    }

    static calculatePresentValue(futureValue, rate, periods) {
        return futureValue / Math.pow(1 + rate, periods);
    }

    static calculateTaxImpact(gains, taxRate, vehicleType = 'cto') {
        const rates = {
            'pea': gains > 0 ? 0.172 : 0, // Prélèvements sociaux uniquement après 5 ans
            'cto': 0.30, // PFU
            'av': gains > 0 ? (gains < 4600 ? 0.172 : 0.247) : 0, // Selon abattement
            'per': 0 // Exonéré pendant la phase d'épargne
        };
        
        const effectiveRate = rates[vehicleType] || 0.30;
        return gains * effectiveRate;
    }

    static calculateVolatility(returns) {
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((acc, ret) => acc + Math.pow(ret - mean, 2), 0) / returns.length;
        return Math.sqrt(variance);
    }

    static monteCarloSimulation(params, iterations = 1000) {
        const { principal, expectedReturn, volatility, years } = params;
        const results = [];

        for (let i = 0; i < iterations; i++) {
            let value = principal;
            for (let year = 0; year < years; year++) {
                // Simulation avec distribution normale
                const randomReturn = this.normalRandom(expectedReturn, volatility);
                value *= (1 + randomReturn);
            }
            results.push(value);
        }

        results.sort((a, b) => a - b);
        
        return {
            mean: results.reduce((a, b) => a + b, 0) / results.length,
            median: results[Math.floor(results.length / 2)],
            percentile5: results[Math.floor(results.length * 0.05)],
            percentile95: results[Math.floor(results.length * 0.95)],
            worstCase: results[0],
            bestCase: results[results.length - 1]
        };
    }

    static normalRandom(mean, stdDev) {
        // Box-Muller transform pour distribution normale
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z0 * stdDev;
    }
}

// ✅ 6. Gestionnaire d'état global amélioré
class AppStateManager {
    constructor() {
        this.state = {
            currentSimulation: null,
            userProfile: this.loadUserProfile(),
            simulations: this.loadSimulations(),
            preferences: this.loadPreferences()
        };
        this.listeners = new Map();
        this.history = [];
        this.maxHistorySize = 50;
    }

    setState(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;
        
        // Historique pour annulation
        this.history.push({ key, oldValue, newValue: value, timestamp: Date.now() });
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }

        // Déclencher les écouteurs
        if (this.listeners.has(key)) {
            this.listeners.get(key).forEach(callback => callback(value, oldValue));
        }

        // Sauvegarder automatiquement
        this.persist();
    }

    getState(key) {
        return this.state[key];
    }

    subscribe(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(callback);

        // Retourner une fonction de désabonnement
        return () => {
            this.listeners.get(key).delete(callback);
        };
    }

    undo() {
        if (this.history.length === 0) return false;

        const lastChange = this.history.pop();
        this.state[lastChange.key] = lastChange.oldValue;
        
        // Déclencher les écouteurs sans ajouter à l'historique
        if (this.listeners.has(lastChange.key)) {
            this.listeners.get(lastChange.key).forEach(callback => 
                callback(lastChange.oldValue, lastChange.newValue)
            );
        }

        this.persist();
        return true;
    }

    persist() {
        try {
            localStorage.setItem('appState', JSON.stringify(this.state));
        } catch (error) {
            console.warn('Impossible de sauvegarder l\'état:', error);
        }
    }

    loadUserProfile() {
        try {
            return JSON.parse(localStorage.getItem('userProfile')) || {
                riskTolerance: 'moderate',
                investmentGoals: [],
                experienceLevel: 'beginner'
            };
        } catch {
            return { riskTolerance: 'moderate', investmentGoals: [], experienceLevel: 'beginner' };
        }
    }

    loadSimulations() {
        try {
            return JSON.parse(localStorage.getItem('savedSimulations')) || [];
        } catch {
            return [];
        }
    }

    loadPreferences() {
        try {
            return JSON.parse(localStorage.getItem('userPreferences')) || {
                theme: 'dark',
                currency: 'EUR',
                notifications: true
            };
        } catch {
            return { theme: 'dark', currency: 'EUR', notifications: true };
        }
    }
}

// ✅ 7. Système d'analyse de performance
class PerformanceAnalyzer {
    static analyzePortfolio(investments) {
        const totalValue = investments.reduce((sum, inv) => sum + inv.currentValue, 0);
        const totalCost = investments.reduce((sum, inv) => sum + inv.initialInvestment, 0);
        const totalGains = totalValue - totalCost;
        
        const performance = {
            totalReturn: (totalGains / totalCost) * 100,
            totalValue,
            totalGains,
            sharpeRatio: this.calculateSharpeRatio(investments),
            maxDrawdown: this.calculateMaxDrawdown(investments),
            volatility: this.calculatePortfolioVolatility(investments),
            diversificationScore: this.calculateDiversificationScore(investments)
        };

        return {
            ...performance,
            rating: this.getRating(performance),
            recommendations: this.generateRecommendations(performance, investments)
        };
    }

    static calculateSharpeRatio(investments, riskFreeRate = 0.01) {
        const returns = investments.map(inv => (inv.currentValue - inv.initialInvestment) / inv.initialInvestment);
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const volatility = FinancialCalculator.calculateVolatility(returns);
        
        return volatility > 0 ? (avgReturn - riskFreeRate) / volatility : 0;
    }

    static calculateMaxDrawdown(investments) {
        // Simulation simplifiée - en réalité nécessiterait les données historiques
        return Math.random() * 0.15; // 0-15% de drawdown simulé
    }

    static calculatePortfolioVolatility(investments) {
        // Calcul simplifié basé sur la diversification
        const sectors = new Set(investments.map(inv => inv.sector));
        const sectorDiversification = Math.min(sectors.size / 10, 1); // Max 10 secteurs
        
        return Math.max(0.05, 0.25 - (sectorDiversification * 0.1));
    }

    static calculateDiversificationScore(investments) {
        const sectors = investments.reduce((acc, inv) => {
            acc[inv.sector] = (acc[inv.sector] || 0) + inv.currentValue;
            return acc;
        }, {});

        const total = Object.values(sectors).reduce((a, b) => a + b, 0);
        const weights = Object.values(sectors).map(value => value / total);
        
        // Indice Herfindahl-Hirschman inversé
        const hhi = weights.reduce((sum, weight) => sum + weight * weight, 0);
        return Math.max(0, (1 - hhi) * 100);
    }

    static getRating(performance) {
        let score = 0;
        
        // Score basé sur le rendement
        if (performance.totalReturn > 20) score += 3;
        else if (performance.totalReturn > 10) score += 2;
        else if (performance.totalReturn > 5) score += 1;
        
        // Score basé sur le ratio de Sharpe
        if (performance.sharpeRatio > 2) score += 3;
        else if (performance.sharpeRatio > 1) score += 2;
        else if (performance.sharpeRatio > 0.5) score += 1;
        
        // Score basé sur la diversification
        if (performance.diversificationScore > 70) score += 2;
        else if (performance.diversificationScore > 50) score += 1;
        
        if (score >= 7) return 'Excellent';
        if (score >= 5) return 'Bon';
        if (score >= 3) return 'Moyen';
        return 'À améliorer';
    }

    static generateRecommendations(performance, investments) {
        const recommendations = [];

        if (performance.diversificationScore < 50) {
            recommendations.push({
                type: 'diversification',
                priority: 'high',
                message: 'Votre portefeuille manque de diversification. Considérez ajouter des actifs de secteurs différents.'
            });
        }

        if (performance.volatility > 0.2) {
            recommendations.push({
                type: 'risk',
                priority: 'medium',
                message: 'La volatilité de votre portefeuille est élevée. Envisagez d\'ajouter des actifs moins risqués.'
            });
        }

        if (performance.totalReturn < 5) {
            recommendations.push({
                type: 'performance',
                priority: 'high',
                message: 'La performance de votre portefeuille est en dessous des attentes. Réévaluez votre stratégie d\'allocation.'
            });
        }

        return recommendations;
    }
}

// ✅ 8. Initialisation globale
document.addEventListener('DOMContentLoaded', function() {
    // Initialiser les systèmes globaux
    window.notificationSystem = new EnhancedNotificationSystem();
    window.performanceTracker = new PerformanceTracker();
    window.appState = new AppStateManager();
    
    // Ajouter les styles d'animation
    const animationStyles = `
        @keyframes shrink {
            from { width: 100%; }
            to { width: 0%; }
        }
        
        .progress-bar {
            transition: width 0.1s linear;
        }
        
        .fade-in {
            animation: fadeIn 0.3s ease-out;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    
    const styleEl = document.createElement('style');
    styleEl.textContent = animationStyles;
    document.head.appendChild(styleEl);

    // Message de bienvenue
    setTimeout(() => {
        notificationSystem.show('Simulateur initialisé avec succès! 🚀', 'success');
    }, 1000);
});

// Export pour utilisation dans d'autres modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        EnhancedNotificationSystem,
        PerformanceTracker,
        SmartFormManager,
        FinancialCalculator,
        AppStateManager,
        PerformanceAnalyzer
    };
}