// === GESTIONNAIRE DES RÉGIMES FISCAUX ===
// Système de popup/modal pour afficher les définitions des régimes fiscaux

class RegimesFiscauxManager {
    constructor() {
        this.regimesData = null;
        this.modal = null;
        this.init();
    }

    async init() {
        console.log('🏦 Initialisation du gestionnaire de régimes fiscaux...');
        
        // Charger les données
        await this.loadRegimesData();
        
        // Créer le modal
        this.createModal();
        
        // Attacher les événements
        this.attachEvents();
        
        console.log('✅ RegimesFiscauxManager initialisé');
    }

    async loadRegimesData() {
        try {
            const response = await fetch('./data/regimes-fiscaux.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            this.regimesData = await response.json();
            console.log('✅ Données des régimes fiscaux chargées:', this.regimesData.length + ' régimes');
        } catch (error) {
            console.error('❌ Erreur lors du chargement des régimes fiscaux:', error);
            // Données de fallback en cas d'erreur
            this.regimesData = [];
        }
    }

    createModal() {
        // Vérifier si le modal existe déjà
        if (document.getElementById('regime-modal')) return;

        const modalHTML = `
            <div id="regime-modal" class="regime-modal hidden">
                <div class="regime-modal-backdrop"></div>
                <div class="regime-modal-content">
                    <div class="regime-modal-header">
                        <h2 id="regime-modal-title" class="regime-modal-title">Titre</h2>
                        <button id="regime-modal-close" class="regime-modal-close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="regime-modal-body">
                        <div id="regime-definition" class="regime-section"></div>
                        
                        <div id="regime-conditions" class="regime-section hidden">
                            <h3><i class="fas fa-clipboard-check"></i> Conditions</h3>
                            <p id="regime-conditions-text"></p>
                        </div>
                        
                        <div id="regime-exemple" class="regime-section">
                            <h3><i class="fas fa-lightbulb"></i> Exemple pratique</h3>
                            <p id="regime-exemple-text"></p>
                        </div>
                        
                        <div id="regime-comparaison" class="regime-section">
                            <h3><i class="fas fa-balance-scale"></i> Comparaison</h3>
                            <p id="regime-comparaison-text"></p>
                        </div>
                        
                        <div class="regime-pros-cons">
                            <div class="regime-pros">
                                <h3><i class="fas fa-check-circle"></i> Avantages</h3>
                                <ul id="regime-avantages"></ul>
                            </div>
                            <div class="regime-cons">
                                <h3><i class="fas fa-times-circle"></i> Inconvénients</h3>
                                <ul id="regime-inconvenients"></ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('regime-modal');
    }

    attachEvents() {
        // Fermer le modal
        document.getElementById('regime-modal-close')?.addEventListener('click', () => this.closeModal());
        document.querySelector('.regime-modal-backdrop')?.addEventListener('click', () => this.closeModal());
        
        // Échap pour fermer
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
                this.closeModal();
            }
        });

        // Attendre que le DOM soit chargé
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.attachRegimeClickHandlers());
        } else {
            this.attachRegimeClickHandlers();
        }
    }

    attachRegimeClickHandlers() {
        // Sélectionner tous les éléments de régime fiscal (adapter selon votre HTML)
        const regimeElements = document.querySelectorAll('.regime-card, .regime-option');
        
        regimeElements.forEach(element => {
            // Récupérer le nom du régime depuis le texte de l'élément
            const regimeName = this.extractRegimeName(element);
            
            if (regimeName) {
                element.style.cursor = 'pointer';
                element.setAttribute('data-regime', regimeName);
                
                // Ajouter une icône d'info si elle n'existe pas
                if (!element.querySelector('.regime-info-icon')) {
                    const infoIcon = document.createElement('span');
                    infoIcon.className = 'regime-info-icon';
                    infoIcon.innerHTML = '<i class="fas fa-info-circle"></i>';
                    element.appendChild(infoIcon);
                }
                
                element.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showRegimeInfo(regimeName);
                });
            }
        });
    }

    extractRegimeName(element) {
        // Extraire le nom du régime depuis différentes sources possibles
        const h3 = element.querySelector('h3');
        const h4 = element.querySelector('h4');
        const text = h3?.textContent || h4?.textContent || element.textContent;
        
        // Nettoyer le texte
        const cleanedText = text.trim()
            .replace(/Déclar.*?\d{4}/gi, '') // Enlever "Déclar" et année
            .replace(/BIC/g, '')
            .replace(/IS/g, '')
            .trim();
        
        // Mapper les textes trouvés aux noms dans le JSON
        const mappings = {
            'Micro-foncier': 'Micro-foncier',
            'Réel foncier': 'Réel foncier',
            'LMNP micro': 'LMNP micro-BIC',
            'LMNP réel': 'LMNP réel',
            'SCI à l': 'SCI à l\'IS',
            'SAS': 'SAS',
            'SARL': 'SARL'
        };
        
        for (const [key, value] of Object.entries(mappings)) {
            if (cleanedText.includes(key)) {
                return value;
            }
        }
        
        return null;
    }

    showRegimeInfo(regimeName) {
        const regime = this.regimesData.find(r => r.nom === regimeName);
        if (!regime) {
            console.warn('Régime non trouvé:', regimeName);
            return;
        }

        // Remplir le modal
        document.getElementById('regime-modal-title').textContent = regime.nom;
        document.getElementById('regime-definition').innerHTML = `<p>${regime.definition}</p>`;
        
        // Conditions (si présentes)
        const conditionsSection = document.getElementById('regime-conditions');
        if (regime.conditions_statut) {
            conditionsSection.classList.remove('hidden');
            document.getElementById('regime-conditions-text').textContent = regime.conditions_statut;
        } else {
            conditionsSection.classList.add('hidden');
        }
        
        // Exemple
        document.getElementById('regime-exemple-text').textContent = regime.exemple;
        
        // Comparaison
        document.getElementById('regime-comparaison-text').textContent = regime.comparaison;
        
        // Avantages
        const avantagesList = document.getElementById('regime-avantages');
        avantagesList.innerHTML = regime.avantages
            .map(avantage => `<li>${avantage}</li>`)
            .join('');
        
        // Inconvénients
        const inconvenientsList = document.getElementById('regime-inconvenients');
        inconvenientsList.innerHTML = regime.inconvenients
            .map(inconvenient => `<li>${inconvenient}</li>`)
            .join('');

        // Afficher le modal
        this.openModal();
    }

    openModal() {
        this.modal.classList.remove('hidden');
        setTimeout(() => {
            this.modal.classList.add('show');
        }, 10);
        
        // Empêcher le scroll du body
        document.body.style.overflow = 'hidden';
    }

    closeModal() {
        this.modal.classList.remove('show');
        setTimeout(() => {
            this.modal.classList.add('hidden');
        }, 300);
        
        // Réactiver le scroll
        document.body.style.overflow = '';
    }
}

// === INITIALISATION ===
document.addEventListener('DOMContentLoaded', function() {
    console.log('🏦 Chargement du module régimes fiscaux...');
    window.regimesFiscauxManager = new RegimesFiscauxManager();
});

// === EXPORT ===
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RegimesFiscauxManager };
}