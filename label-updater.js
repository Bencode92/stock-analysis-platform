// ============ LABEL UPDATER MODULE ============
// Module pour mettre à jour automatiquement les labels de l'interface
// Version 1.0 - Changement Rendement → DIVIDENDE TTM

const LabelUpdater = {
    // Configuration centralisée des labels
    labels: {
        headers: {
            'Rendement': 'DIVIDENDE TTM',
            'RENDEMENT': 'DIVIDENDE TTM',
            'Volatilité 3Y %': 'VOLATILITÉ 3A %', // Plus cohérent en français
        },
        details: {
            'Rendement:': 'Dividende TTM:',
            'Payout:': 'Payout TTM:',
            'Volatilité:': 'Volatilité 3A:'
        }
    },

    // Mise à jour des en-têtes de table
    updateTableHeaders() {
        document.querySelectorAll('.data-table thead th').forEach(th => {
            const text = th.textContent.trim();
            if (this.labels.headers[text]) {
                th.textContent = this.labels.headers[text];
                th.setAttribute('data-original-label', text); // Pour réversibilité
            }
        });
    },

    // Mise à jour des tooltips au survol
    addTooltips() {
        document.querySelectorAll('.data-table thead th').forEach(th => {
            if (th.textContent.includes('DIVIDENDE TTM')) {
                th.title = 'Rendement des dividendes sur les 12 derniers mois';
                th.style.cursor = 'help';
            }
            if (th.textContent.includes('YTD')) {
                th.title = 'Performance depuis le début de l\'année (Year To Date)';
                th.style.cursor = 'help';
            }
            if (th.textContent.includes('VOLATILITÉ')) {
                th.title = 'Volatilité annualisée sur 3 ans';
                th.style.cursor = 'help';
            }
        });
    },

    // Observer pour gérer le contenu dynamique
    observeChanges() {
        const observer = new MutationObserver(() => {
            this.updateTableHeaders();
            this.addTooltips();
        });

        // Observer les changements dans les tableaux
        document.querySelectorAll('.region-content').forEach(content => {
            observer.observe(content, { childList: true, subtree: true });
        });
    },

    // Mise à jour des panneaux de détails (si présents)
    updateDetailPanels() {
        // Cette fonction sera appelée depuis liste-script.js lors du rendu des détails
        document.querySelectorAll('.stock-details').forEach(panel => {
            panel.querySelectorAll('span.opacity-60').forEach(label => {
                const text = label.textContent;
                if (this.labels.details[text]) {
                    label.textContent = this.labels.details[text];
                }
            });
        });
    },

    // Ajouter indicateur de source pour les dividendes
    formatDividendSource(source) {
        const sourceMap = {
            'TTM': '📅 12 derniers mois',
            'REG': '📊 Régulier (hors spéciaux)',
            'FWD': '📈 Prévisionnel',
            'TTM (calc)': '📅 Calculé TTM',
            'TTM (calc, split-adj)': '📅 TTM ajusté (split)'
        };
        return sourceMap[source] || source;
    },

    // Ajouter indicateur de statut payout
    formatPayoutStatus(status) {
        const statusMap = {
            'conservative': '🟢 Conservateur',
            'moderate': '🔵 Modéré',
            'high': '🟡 Élevé',
            'very_high': '🟠 Très élevé',
            'unsustainable': '🔴 Non soutenable'
        };
        return statusMap[status] || status;
    },

    // Initialisation
    init() {
        // Attendre que le DOM soit prêt
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
            return;
        }

        // Mise à jour initiale
        setTimeout(() => {
            this.updateTableHeaders();
            this.addTooltips();
            this.observeChanges();
            console.log('✅ Label Updater initialized - Headers updated to TTM format');
        }, 100);
    }
};

// Auto-initialisation
LabelUpdater.init();

// Export pour utilisation dans d'autres modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LabelUpdater;
}