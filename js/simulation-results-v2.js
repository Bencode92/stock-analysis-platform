/**
 * simulation-results-v2.js - Interface utilisateur v2.0 pour les résultats de simulation
 * TradePulse Finance Intelligence Platform
 * Architecture modulaire avec accessibilité et performance optimisées
 */

// Configuration globale
const SimulationUIConfig = {
    throttleDelay: 60, // ms pour le slider
    animationDuration: 300, // ms pour les transitions
    mobileBreakpoint: 480 // px pour désactiver certaines features
};

// Données de simulation (sera connecté à votre système existant)
let SimulationData = {
    initialInvestment: 1000,
    years: 10,
    annualReturn: 0.07,
    currentYear: 10,
    grossAmount: 1967,
    netAmount: 1801,
    taxAmount: 166,
    annualizedReturn: 6.1,
    vehicle: 'pea',
    alerts: []
};

// ============================================
// MODULE FLIP CARD - Carte retournable
// ============================================
const FlipCard = {
    init() {
        this.element = document.getElementById('mainFlipCard');
        if (!this.element) return;
        
        this.bindEvents();
        console.log('✅ FlipCard initialisé');
    },

    bindEvents() {
        // Clic et toucher
        this.element.addEventListener('click', () => this.toggle());
        
        // Support clavier (accessibilité)
        this.element.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.toggle();
            }
        });
    },

    toggle() {
        this.element.classList.toggle('flipped');
        const isFlipped = this.element.classList.contains('flipped');
        this.element.setAttribute('aria-pressed', isFlipped);
        
        // Feedback haptique sur mobile
        if ('vibrate' in navigator) {
            navigator.vibrate(50);
        }
    },

    update(netAmount, taxAmount, investedAmount, annualizedReturn) {
        const elements = {
            netAmount: document.getElementById('netAmount'),
            taxAmount: document.getElementById('taxAmount'),
            investedAmount: document.getElementById('investedAmount'),
            annualizedReturn: document.getElementById('annualizedReturn')
        };
        
        // Mise à jour sécurisée avec vérification d'existence
        if (elements.netAmount) elements.netAmount.textContent = this.formatCurrency(netAmount);
        if (elements.taxAmount) elements.taxAmount.textContent = this.formatCurrency(taxAmount);
        if (elements.investedAmount) elements.investedAmount.textContent = this.formatCurrency(investedAmount);
        if (elements.annualizedReturn) elements.annualizedReturn.textContent = annualizedReturn.toFixed(1) + '%';
    },

    formatCurrency(amount) {
        return Math.round(amount).toLocaleString('fr-FR') + ' €';
    }
};

// ============================================
// MODULE TIMELINE - Slider temporel avec mini-chart
// ============================================
const Timeline = {
    init() {
        this.slider = document.getElementById('timeSlider');
        this.yearDisplay = document.getElementById('currentYear');
        this.chart = null;
        this.throttleTimeout = null;
        
        if (!this.slider || !this.yearDisplay) return;
        
        this.bindEvents();
        this.initChart();
        console.log('✅ Timeline initialisé');
    },

    bindEvents() {
        // Throttling pour performance mobile
        this.slider.addEventListener('input', (e) => {
            if (this.throttleTimeout) return;
            
            this.throttleTimeout = setTimeout(() => {
                this.updateYear(parseInt(e.target.value));
                this.throttleTimeout = null;
            }, SimulationUIConfig.throttleDelay);
        });
    },

    updateYear(year) {
        SimulationData.currentYear = year;
        this.yearDisplay.textContent = year;
        this.calculateForYear(year);
        this.updateChart();
    },

    calculateForYear(year) {
        // Calculs basés sur vos formules existantes
        const grossAmount = SimulationData.initialInvestment * Math.pow(1 + SimulationData.annualReturn, year);
        const gain = grossAmount - SimulationData.initialInvestment;
        
        // Logique fiscale PEA (à adapter selon votre système)
        const taxRate = year < 5 ? 0.172 : 0.172; // Simplifiée pour demo
        const taxAmount = gain * taxRate;
        const netAmount = grossAmount - taxAmount;
        const annualizedReturn = ((netAmount / SimulationData.initialInvestment) ** (1/year) - 1) * 100;

        // Mise à jour des données globales\n        Object.assign(SimulationData, {\n            grossAmount,\n            netAmount,\n            taxAmount,\n            annualizedReturn\n        });\n\n        // Mise à jour de tous les modules\n        FlipCard.update(netAmount, taxAmount, SimulationData.initialInvestment, annualizedReturn);\n        TaxToggle.updateAmounts(grossAmount, netAmount, taxAmount);\n        AlertSystem.refresh();\n        DetailsSection.updateStats();\n    },\n\n    initChart() {\n        const ctx = document.getElementById('miniChart');\n        if (!ctx) return;\n        \n        // Optimisation mobile : pas de chart si écran trop petit\n        if (window.innerWidth < SimulationUIConfig.mobileBreakpoint) {\n            console.log('📱 Mini-chart désactivé sur mobile');\n            return;\n        }\n        \n        const data = this.generateChartData();\n        \n        this.chart = new Chart(ctx, {\n            type: 'line',\n            data: {\n                labels: data.labels,\n                datasets: [{\n                    data: data.values,\n                    borderColor: '#10b981',\n                    backgroundColor: 'rgba(16, 185, 129, 0.1)',\n                    borderWidth: 2,\n                    fill: true,\n                    tension: 0.4,\n                    pointRadius: 0,\n                    pointHoverRadius: 4\n                }]\n            },\n            options: {\n                responsive: true,\n                maintainAspectRatio: false,\n                animation: false, // Performance boost\n                plugins: {\n                    legend: { display: false },\n                    tooltip: { enabled: false }\n                },\n                scales: {\n                    x: { display: false },\n                    y: { display: false }\n                },\n                elements: {\n                    point: { radius: 0 }\n                }\n            }\n        });\n    },\n\n    updateChart() {\n        if (!this.chart) return;\n        \n        const data = this.generateChartData();\n        this.chart.data.labels = data.labels;\n        this.chart.data.datasets[0].data = data.values;\n        this.chart.update('none'); // Pas d'animation pour fluidité\n    },\n\n    generateChartData() {\n        const labels = [];\n        const values = [];\n        const maxYear = SimulationData.currentYear;\n        \n        for (let i = 0; i <= maxYear; i++) {\n            labels.push(i);\n            const amount = SimulationData.initialInvestment * Math.pow(1 + SimulationData.annualReturn, i);\n            values.push(amount);\n        }\n        \n        return { labels, values };\n    }\n};\n\n// ============================================\n// MODULE TAX TOGGLE - Bascule fiscale\n// ============================================\nconst TaxToggle = {\n    init() {\n        this.afterBtn = document.getElementById('afterTaxBtn');\n        this.beforeBtn = document.getElementById('beforeTaxBtn');\n        this.barFill = document.getElementById('taxBarFill');\n        this.barReduction = document.getElementById('taxBarReduction');\n        this.displayAmount = document.getElementById('displayAmount');\n        this.reductionAmount = document.getElementById('reductionAmount');\n        this.taxPercentage = document.getElementById('taxPercentage');\n        \n        if (!this.afterBtn || !this.beforeBtn) return;\n        \n        this.bindEvents();\n        console.log('✅ TaxToggle initialisé');\n    },\n\n    bindEvents() {\n        this.afterBtn.addEventListener('click', () => this.setView('after'));\n        this.beforeBtn.addEventListener('click', () => this.setView('before'));\n    },\n\n    setView(view) {\n        // Mise à jour visuelle et accessibilité ARIA\n        this.afterBtn.classList.toggle('active', view === 'after');\n        this.beforeBtn.classList.toggle('active', view === 'before');\n        this.afterBtn.setAttribute('aria-selected', view === 'after');\n        this.beforeBtn.setAttribute('aria-selected', view === 'before');\n        \n        const { grossAmount, netAmount, taxAmount } = SimulationData;\n        const taxPercentage = grossAmount > 0 ? (taxAmount / grossAmount) * 100 : 0;\n        \n        if (view === 'before') {\n            // Mode \"Avant impôt\" - montre l'impact fiscal\n            this.barReduction.style.width = taxPercentage + '%';\n            this.reductionAmount.classList.add('visible');\n            this.displayAmount.textContent = this.formatCurrency(grossAmount);\n            this.taxPercentage.style.opacity = '1';\n        } else {\n            // Mode \"Après impôt\" - montre le net\n            this.barReduction.style.width = '0';\n            this.reductionAmount.classList.remove('visible');\n            this.displayAmount.textContent = this.formatCurrency(netAmount);\n            this.taxPercentage.style.opacity = '0';\n        }\n    },\n\n    updateAmounts(grossAmount, netAmount, taxAmount) {\n        const currentView = this.beforeBtn.classList.contains('active') ? 'before' : 'after';\n        \n        // Mise à jour des montants\n        if (this.reductionAmount) {\n            this.reductionAmount.textContent = '- ' + this.formatCurrency(taxAmount);\n        }\n        \n        const taxPercentage = grossAmount > 0 ? (taxAmount / grossAmount) * 100 : 0;\n        if (this.taxPercentage) {\n            this.taxPercentage.textContent = '-' + taxPercentage.toFixed(1) + '%';\n        }\n        \n        // Application de la vue actuelle\n        if (currentView === 'before') {\n            if (this.displayAmount) this.displayAmount.textContent = this.formatCurrency(grossAmount);\n            if (this.barReduction) this.barReduction.style.width = taxPercentage + '%';\n        } else {\n            if (this.displayAmount) this.displayAmount.textContent = this.formatCurrency(netAmount);\n        }\n    },\n\n    formatCurrency(amount) {\n        return Math.round(amount).toLocaleString('fr-FR') + ' €';\n    }\n};\n\n// ============================================\n// MODULE ALERT SYSTEM - Alertes intelligentes\n// ============================================\nconst AlertSystem = {\n    init() {\n        this.container = document.getElementById('alertsContainer');\n        this.alertCounter = 0;\n        \n        if (!this.container) return;\n        \n        this.refresh();\n        console.log('✅ AlertSystem initialisé');\n    },\n\n    refresh() {\n        if (!this.container) return;\n        \n        this.container.innerHTML = '';\n        this.generateAlerts().forEach(alert => this.addAlert(alert));\n    },\n\n    generateAlerts() {\n        const alerts = [];\n        const { netAmount, currentYear, vehicle, grossAmount } = SimulationData;\n        \n        // Alerte plafond selon l'enveloppe\n        if (vehicle === 'pea') {\n            const plafond = 150000;\n            const remaining = plafond - netAmount;\n            if (remaining > 0 && remaining < plafond * 0.8) {\n                alerts.push({\n                    type: 'info',\n                    icon: 'fas fa-info-circle',\n                    message: `Il vous reste <strong>${this.formatCurrency(remaining)}</strong> de plafond PEA disponible`\n                });\n            } else if (remaining <= 0) {\n                alerts.push({\n                    type: 'warning',\n                    icon: 'fas fa-exclamation-triangle',\n                    message: `Plafond PEA dépassé de <strong>${this.formatCurrency(-remaining)}</strong>`\n                });\n            }\n        }\n        \n        // Alerte seuil fiscal\n        if (currentYear < 5 && vehicle === 'pea') {\n            alerts.push({\n                type: 'warning',\n                icon: 'fas fa-exclamation-triangle',\n                message: 'Retrait avant 5 ans = clôture automatique du PEA'\n            });\n        }\n        \n        // Alerte optimisation fiscale\n        if (currentYear >= 5 && vehicle === 'pea') {\n            alerts.push({\n                type: 'info',\n                icon: 'fas fa-lightbulb',\n                message: 'Optimisation fiscale atteinte ! Plus-values exonérées d\\'impôt'\n            });\n        }\n        \n        return alerts;\n    },\n\n    addAlert(alert) {\n        const alertId = `alert-${++this.alertCounter}`;\n        const alertElement = document.createElement('div');\n        alertElement.id = alertId;\n        alertElement.className = `alert-v2 alert-${alert.type}-v2`;\n        alertElement.innerHTML = `\n            <i class=\"${alert.icon} alert-icon-v2\"></i>\n            <span>${alert.message}</span>\n        `;\n        this.container.appendChild(alertElement);\n    },\n\n    formatCurrency(amount) {\n        return Math.round(amount).toLocaleString('fr-FR') + ' €';\n    }\n};\n\n// ============================================\n// MODULE DETAILS SECTION - Section détails pliable\n// ============================================\nconst DetailsSection = {\n    init() {\n        this.toggle = document.getElementById('detailsToggle');\n        this.content = document.getElementById('detailsContent');\n        this.chevron = document.getElementById('detailsChevron');\n        this.chart = null;\n        \n        if (!this.toggle || !this.content) return;\n        \n        this.bindEvents();\n        console.log('✅ DetailsSection initialisé');\n    },\n\n    bindEvents() {\n        this.toggle.addEventListener('click', () => this.toggleExpanded());\n        this.toggle.addEventListener('keydown', (e) => {\n            if (e.key === 'Enter' || e.key === ' ') {\n                e.preventDefault();\n                this.toggleExpanded();\n            }\n        });\n    },\n\n    toggleExpanded() {\n        const isExpanded = this.content.classList.contains('expanded');\n        this.content.classList.toggle('expanded');\n        \n        if (this.chevron) {\n            this.chevron.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';\n        }\n        \n        this.toggle.setAttribute('aria-expanded', !isExpanded);\n        \n        if (!isExpanded && !this.chart) {\n            setTimeout(() => this.initChart(), SimulationUIConfig.animationDuration);\n        }\n        \n        this.updateStats();\n    },\n\n    initChart() {\n        // Optimisation mobile : pas de chart détaillé\n        if (window.innerWidth < SimulationUIConfig.mobileBreakpoint) {\n            console.log('📱 Chart détaillé désactivé sur mobile');\n            return;\n        }\n        \n        const ctx = document.getElementById('detailedChart');\n        if (!ctx) return;\n        \n        const data = this.generateDetailedChartData();\n        \n        this.chart = new Chart(ctx, {\n            type: 'line',\n            data: {\n                labels: data.labels,\n                datasets: [\n                    {\n                        label: 'Capital net',\n                        data: data.netValues,\n                        borderColor: '#10b981',\n                        backgroundColor: 'rgba(16, 185, 129, 0.1)',\n                        borderWidth: 3,\n                        fill: true,\n                        tension: 0.4\n                    },\n                    {\n                        label: 'Capital brut',\n                        data: data.grossValues,\n                        borderColor: '#3b82f6',\n                        backgroundColor: 'rgba(59, 130, 246, 0.1)',\n                        borderWidth: 2,\n                        fill: false,\n                        tension: 0.4\n                    }\n                ]\n            },\n            options: {\n                responsive: true,\n                maintainAspectRatio: false,\n                animation: false,\n                plugins: {\n                    legend: { \n                        position: 'top',\n                        labels: { color: 'white' }\n                    }\n                },\n                scales: {\n                    x: { \n                        grid: { color: 'rgba(255,255,255,0.1)' },\n                        ticks: { color: 'white' }\n                    },\n                    y: { \n                        grid: { color: 'rgba(255,255,255,0.1)' },\n                        ticks: { \n                            color: 'white',\n                            callback: function(value) {\n                                return value.toLocaleString('fr-FR') + ' €';\n                            }\n                        }\n                    }\n                }\n            }\n        });\n    },\n\n    updateStats() {\n        const { grossAmount, netAmount, initialInvestment, taxAmount, currentYear } = SimulationData;\n        const gain = grossAmount - initialInvestment;\n        const growthRate = currentYear > 0 ? ((grossAmount / initialInvestment) ** (1/currentYear) - 1) * 100 : 0;\n        const effectiveTaxRate = gain > 0 ? (taxAmount / gain) * 100 : 0;\n\n        // Mise à jour sécurisée des statistiques\n        const stats = {\n            grossAmountStat: this.formatCurrency(grossAmount),\n            gainStat: this.formatCurrency(gain),\n            growthRateStat: growthRate.toFixed(1) + '%',\n            effectiveTaxRateStat: effectiveTaxRate.toFixed(1) + '%'\n        };\n\n        Object.entries(stats).forEach(([id, value]) => {\n            const element = document.getElementById(id);\n            if (element) element.textContent = value;\n        });\n    },\n\n    generateDetailedChartData() {\n        const labels = [];\n        const grossValues = [];\n        const netValues = [];\n        \n        for (let i = 0; i <= 30; i++) {\n            labels.push('Année ' + i);\n            const grossAmount = SimulationData.initialInvestment * Math.pow(1 + SimulationData.annualReturn, i);\n            const gain = grossAmount - SimulationData.initialInvestment;\n            const taxAmount = gain * 0.172; // Simplification\n            const netAmount = grossAmount - taxAmount;\n            \n            grossValues.push(grossAmount);\n            netValues.push(netAmount);\n        }\n        \n        return { labels, grossValues, netValues };\n    },\n\n    formatCurrency(amount) {\n        return Math.round(amount).toLocaleString('fr-FR') + ' €';\n    }\n};\n\n// ============================================\n// API PUBLIQUE - Interface avec le système existant\n// ============================================\nwindow.SimulationResultsV2 = {\n    // Initialisation complète\n    init() {\n        console.log('🚀 Initialisation SimulationResults v2.0');\n        \n        FlipCard.init();\n        Timeline.init();\n        TaxToggle.init();\n        AlertSystem.init();\n        DetailsSection.init();\n        \n        // Calcul initial\n        Timeline.calculateForYear(SimulationData.currentYear);\n        \n        console.log('✅ SimulationResults v2.0 prêt !');\n    },\n    \n    // Mise à jour avec nouvelles données (appelé depuis votre simulation.js)\n    updateResults(results) {\n        console.log('📊 Mise à jour des résultats v2.0', results);\n        \n        // Mapping de vos données vers notre structure\n        Object.assign(SimulationData, {\n            initialInvestment: results.initialDeposit || results.investedTotal,\n            grossAmount: results.finalAmount,\n            netAmount: results.afterTaxAmount,\n            taxAmount: results.taxAmount,\n            years: results.years,\n            vehicle: results.vehicleId,\n            annualReturn: results.annualReturn\n        });\n        \n        // Recalcul du rendement annualisé\n        if (results.years > 0) {\n            SimulationData.annualizedReturn = ((results.afterTaxAmount / SimulationData.initialInvestment) ** (1/results.years) - 1) * 100;\n        }\n        \n        // Mise à jour de tous les modules\n        FlipCard.update(\n            SimulationData.netAmount, \n            SimulationData.taxAmount, \n            SimulationData.initialInvestment, \n            SimulationData.annualizedReturn\n        );\n        \n        TaxToggle.updateAmounts(\n            SimulationData.grossAmount,\n            SimulationData.netAmount,\n            SimulationData.taxAmount\n        );\n        \n        AlertSystem.refresh();\n        DetailsSection.updateStats();\n        \n        // Mise à jour du slider si nécessaire\n        const timeSlider = document.getElementById('timeSlider');\n        if (timeSlider && timeSlider.value != results.years) {\n            timeSlider.value = results.years;\n            Timeline.updateYear(results.years);\n        }\n    },\n    \n    // Accès aux données pour debug\n    getData() {\n        return { ...SimulationData };\n    },\n    \n    // Nettoyage (au besoin)\n    destroy() {\n        if (Timeline.chart) Timeline.chart.destroy();\n        if (DetailsSection.chart) DetailsSection.chart.destroy();\n        console.log('🧹 SimulationResults v2.0 nettoyé');\n    }\n};\n\n// Auto-initialisation si le DOM est prêt\nif (document.readyState === 'loading') {\n    document.addEventListener('DOMContentLoaded', () => {\n        window.SimulationResultsV2.init();\n    });\n} else {\n    window.SimulationResultsV2.init();\n}"