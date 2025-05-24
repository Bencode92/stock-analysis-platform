/**
 * multi-ville-comparator.js - Module de comparaison multi-villes
 * Permet de sélectionner plusieurs villes et identifier les meilleures opportunités
 */

class MultiVilleComparator {
    constructor(simulateur) {
        this.simulateur = simulateur;
        this.villesSelectionnees = [];
        this.resultatsComparaison = [];
        this.init();
    }
    
    init() {
        console.log('🏙️ Initialisation du comparateur multi-villes');
        this.injecterInterface();
        this.attacherEvenements();
    }
    
    injecterInterface() {
        // Trouver le bon endroit pour injecter l'interface
        const villeSearchContainer = document.querySelector('#ville-search').closest('.form-group');
        
        if (!villeSearchContainer) return;
        
        // Créer le conteneur pour la comparaison multi-villes
        const multiVilleHTML = `
            <div id="multi-ville-container" class="form-group mt-6 p-4 bg-blue-900 bg-opacity-20 rounded-lg border border-blue-400/20">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-green-400 flex items-center">
                        <i class="fas fa-city mr-2"></i>
                        Comparateur multi-villes
                    </h3>
                    <button id="toggle-multi-ville" class="text-sm px-3 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition">
                        <i class="fas fa-plus mr-1"></i> Activer
                    </button>
                </div>
                
                <div id="multi-ville-content" class="hidden">
                    <!-- Villes sélectionnées -->
                    <div class="mb-4">
                        <label class="text-sm text-gray-300 mb-2 block">Villes sélectionnées pour comparaison:</label>
                        <div id="villes-selectionnees" class="flex flex-wrap gap-2 min-h-[40px] p-3 bg-blue-800/30 rounded border border-blue-700/50">
                            <span class="text-gray-500 text-sm">Aucune ville sélectionnée</span>
                        </div>
                    </div>
                    
                    <!-- Bouton de comparaison -->
                    <button id="comparer-villes" class="w-full py-3 px-4 bg-gradient-to-r from-green-500 to-green-400 text-gray-900 font-semibold rounded-lg shadow-lg hover:shadow-green-500/30 hover:-translate-y-1 transition-all duration-300 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                        <i class="fas fa-chart-bar mr-2"></i> 
                        Comparer les villes sélectionnées
                    </button>
                    
                    <!-- Zone de résultats -->
                    <div id="resultats-multi-villes" class="mt-6 hidden">
                        <!-- Les résultats seront affichés ici -->
                    </div>
                </div>
            </div>
        `;
        
        // Injecter après la zone de recherche de ville
        villeSearchContainer.insertAdjacentHTML('afterend', multiVilleHTML);
    }
    
    attacherEvenements() {
        // Toggle du mode multi-villes
        const toggleBtn = document.getElementById('toggle-multi-ville');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleMode());
        }
        
        // Modifier le comportement de sélection de ville
        this.intercepterSelectionVille();
        
        // Bouton de comparaison
        const comparerBtn = document.getElementById('comparer-villes');
        if (comparerBtn) {
            comparerBtn.addEventListener('click', () => this.comparerVilles());
        }
    }
    
    toggleMode() {
        const content = document.getElementById('multi-ville-content');
        const toggleBtn = document.getElementById('toggle-multi-ville');
        const isActive = !content.classList.contains('hidden');
        
        if (isActive) {
            // Désactiver
            content.classList.add('hidden');
            toggleBtn.innerHTML = '<i class="fas fa-plus mr-1"></i> Activer';
            toggleBtn.classList.remove('bg-red-500/20', 'text-red-400');
            toggleBtn.classList.add('bg-green-500/20', 'text-green-400');
            this.modeMultiVille = false;
        } else {
            // Activer
            content.classList.remove('hidden');
            toggleBtn.innerHTML = '<i class="fas fa-times mr-1"></i> Désactiver';
            toggleBtn.classList.remove('bg-green-500/20', 'text-green-400');
            toggleBtn.classList.add('bg-red-500/20', 'text-red-400');
            this.modeMultiVille = true;
        }
    }
    
    intercepterSelectionVille() {
        // Intercepter les clics sur les suggestions de ville
        const originalDisplaySuggestions = window.villeSearchManager.displaySuggestions;
        const self = this;
        
        window.villeSearchManager.displaySuggestions = function(villes) {
            originalDisplaySuggestions.call(this, villes);
            
            // Si le mode multi-villes est actif, modifier le comportement
            if (self.modeMultiVille) {
                const suggestions = document.querySelectorAll('.ville-suggestion');
                suggestions.forEach(suggestion => {
                    suggestion.onclick = null; // Supprimer l'ancien gestionnaire
                    suggestion.addEventListener('click', function(e) {
                        e.preventDefault();
                        const villeIndex = Array.from(suggestions).indexOf(this);
                        if (villeIndex >= 0 && villeIndex < villes.length) {
                            self.ajouterVille(villes[villeIndex]);
                        }
                    });
                });
            }
        };
    }
    
    ajouterVille(ville) {
        // Vérifier si la ville n'est pas déjà sélectionnée
        if (this.villesSelectionnees.find(v => v.nom === ville.nom)) {
            this.afficherNotification('Cette ville est déjà sélectionnée', 'warning');
            return;
        }
        
        // Limiter à 10 villes maximum
        if (this.villesSelectionnees.length >= 10) {
            this.afficherNotification('Maximum 10 villes peuvent être comparées', 'warning');
            return;
        }
        
        this.villesSelectionnees.push(ville);
        this.mettreAJourAffichage();
        
        // Masquer les suggestions
        document.getElementById('ville-suggestions').style.display = 'none';
        document.getElementById('ville-search').value = '';
    }
    
    retirerVille(index) {
        this.villesSelectionnees.splice(index, 1);
        this.mettreAJourAffichage();
    }
    
    mettreAJourAffichage() {
        const container = document.getElementById('villes-selectionnees');
        const comparerBtn = document.getElementById('comparer-villes');
        
        if (this.villesSelectionnees.length === 0) {
            container.innerHTML = '<span class="text-gray-500 text-sm">Aucune ville sélectionnée</span>';
            comparerBtn.disabled = true;
        } else {
            container.innerHTML = this.villesSelectionnees.map((ville, index) => `
                <div class="ville-tag bg-blue-800/50 px-3 py-1 rounded-full flex items-center gap-2">
                    <span class="text-white">${ville.nom}</span>
                    <button onclick="window.multiVilleComparator.retirerVille(${index})" class="text-red-400 hover:text-red-300">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');
            
            comparerBtn.disabled = this.villesSelectionnees.length < 2;
        }
    }
    
    async comparerVilles() {
        const resultatsContainer = document.getElementById('resultats-multi-villes');
        resultatsContainer.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-2xl text-green-400"></i></div>';
        resultatsContainer.classList.remove('hidden');
        
        // Récupérer les paramètres actuels du formulaire
        const formData = this.collecterParametres();
        
        // Simuler pour chaque ville
        this.resultatsComparaison = [];
        
        for (const ville of this.villesSelectionnees) {
            // Pour chaque type de logement disponible dans la ville
            const resultatsVille = {};
            
            for (const [type, data] of Object.entries(ville.pieces)) {
                // Configurer les paramètres pour cette simulation
                this.simulateur.params.communs.prixM2 = data.prix_m2;
                this.simulateur.params.communs.loyerM2 = data.loyer_m2;
                
                // Charger les autres paramètres du formulaire
                this.simulateur.chargerParametres(formData);
                
                // Rechercher la surface maximale pour chaque mode
                const resultClassique = this.simulateur.chercheSurfaceDesc('classique');
                const resultEncheres = this.simulateur.chercheSurfaceDesc('encheres');
                
                resultatsVille[type] = {
                    classique: resultClassique,
                    encheres: resultEncheres,
                    prixM2: data.prix_m2,
                    loyerM2: data.loyer_m2
                };
            }
            
            this.resultatsComparaison.push({
                ville: ville,
                resultats: resultatsVille
            });
        }
        
        // Analyser et afficher les résultats
        this.afficherResultatsComparaison();
    }
    
    collecterParametres() {
        return {
            apport: document.getElementById('apport').value,
            taux: document.getElementById('taux').value,
            duree: document.getElementById('duree').value,
            calculationMode: document.querySelector('input[name="calculation-mode"]:checked')?.value || 'loyer-mensualite',
            pourcentApportMin: document.getElementById('pourcent-apport')?.value || 10,
            vacanceLocative: document.getElementById('vacance-locative').value,
            taxeFonciere: document.getElementById('taxe-fonciere').value,
            // Ajouter tous les autres paramètres nécessaires...
        };
    }
    
    afficherResultatsComparaison() {
        // Identifier les 3 meilleures opportunités
        const opportunites = [];
        
        this.resultatsComparaison.forEach(({ville, resultats}) => {
            Object.entries(resultats).forEach(([type, data]) => {
                // Pour l'achat classique
                if (data.classique) {
                    opportunites.push({
                        ville: ville.nom,
                        departement: ville.departement,
                        type: type,
                        mode: 'Classique',
                        surface: data.classique.surface,
                        loyerBrut: data.classique.loyerBrut,
                        loyerNet: data.classique.loyerNet,
                        loyerAnnuel: data.classique.loyerNet * 12,
                        cashflow: data.classique.cashFlow,
                        cashflowAnnuel: data.classique.cashFlow * 12,
                        rendement: data.classique.rendementNet,
                        prixAchat: data.classique.prixAchat,
                        coutTotal: data.classique.coutTotal
                    });
                }
                
                // Pour les enchères
                if (data.encheres) {
                    opportunites.push({
                        ville: ville.nom,
                        departement: ville.departement,
                        type: type,
                        mode: 'Enchères',
                        surface: data.encheres.surface,
                        loyerBrut: data.encheres.loyerBrut,
                        loyerNet: data.encheres.loyerNet,
                        loyerAnnuel: data.encheres.loyerNet * 12,
                        cashflow: data.encheres.cashFlow,
                        cashflowAnnuel: data.encheres.cashFlow * 12,
                        rendement: data.encheres.rendementNet,
                        prixAchat: data.encheres.prixAchat,
                        coutTotal: data.encheres.coutTotal
                    });
                }
            });
        });
        
        // Trier par loyer net décroissant
        opportunites.sort((a, b) => b.loyerNet - a.loyerNet);
        
        // Prendre les 3 meilleures
        const top3 = opportunites.slice(0, 3);
        
        // Afficher les résultats
        const resultatsContainer = document.getElementById('resultats-multi-villes');
        resultatsContainer.innerHTML = `
            <h3 class="text-xl font-semibold text-green-400 mb-4 flex items-center">
                <i class="fas fa-trophy mr-2"></i>
                Top 3 des meilleures opportunités
            </h3>
            
            <div class="space-y-4">
                ${top3.map((opp, index) => this.genererCarteOpportunite(opp, index + 1)).join('')}
            </div>
            
            <div class="mt-6">
                <h4 class="text-lg font-semibold text-gray-300 mb-3">Tableau comparatif complet</h4>
                ${this.genererTableauComparatif(opportunites)}
            </div>
        `;
    }
    
    genererCarteOpportunite(opp, rang) {
        const medalColor = rang === 1 ? 'text-yellow-400' : rang === 2 ? 'text-gray-300' : 'text-orange-600';
        const borderColor = rang === 1 ? 'border-yellow-400/50' : rang === 2 ? 'border-gray-300/50' : 'border-orange-600/50';
        
        return `
            <div class="p-4 bg-blue-900/30 rounded-lg border ${borderColor} hover:bg-blue-900/40 transition">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-3 mb-2">
                            <div class="${medalColor} text-2xl">
                                <i class="fas fa-medal"></i>
                            </div>
                            <h4 class="text-lg font-semibold text-white">
                                ${opp.ville} - ${opp.type}
                                <span class="text-sm font-normal text-gray-400 ml-2">(${opp.mode})</span>
                            </h4>
                        </div>
                        
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <span class="text-gray-400">Surface:</span>
                                <span class="text-white font-medium ml-1">${opp.surface.toFixed(1)} m²</span>
                            </div>
                            <div>
                                <span class="text-gray-400">Loyer net:</span>
                                <span class="text-green-400 font-medium ml-1">${this.formaterMontant(opp.loyerNet)}/mois</span>
                            </div>
                            <div>
                                <span class="text-gray-400">Loyer annuel:</span>
                                <span class="text-green-400 font-medium ml-1">${this.formaterMontant(opp.loyerAnnuel)}/an</span>
                            </div>
                            <div>
                                <span class="text-gray-400">Rendement:</span>
                                <span class="text-white font-medium ml-1">${opp.rendement.toFixed(2)}%</span>
                            </div>
                        </div>
                        
                        <div class="mt-3 pt-3 border-t border-blue-700/50 flex items-center justify-between">
                            <div class="text-sm">
                                <span class="text-gray-400">Cash-flow:</span>
                                <span class="${opp.cashflow >= 0 ? 'text-green-400' : 'text-red-400'} font-medium ml-1">
                                    ${this.formaterMontant(opp.cashflow)}/mois
                                    <span class="text-xs ml-1">(${this.formaterMontant(opp.cashflowAnnuel)}/an)</span>
                                </span>
                            </div>
                            <button onclick="window.multiVilleComparator.afficherDetails('${opp.ville}', '${opp.type}', '${opp.mode}')" 
                                    class="text-sm px-3 py-1 bg-blue-800/50 text-blue-400 rounded hover:bg-blue-800/70 transition">
                                <i class="fas fa-info-circle mr-1"></i> Détails
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    genererTableauComparatif(opportunites) {
        return `
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b border-blue-700/50">
                            <th class="text-left py-2 px-3">Ville</th>
                            <th class="text-left py-2 px-3">Type</th>
                            <th class="text-left py-2 px-3">Mode</th>
                            <th class="text-right py-2 px-3">Surface</th>
                            <th class="text-right py-2 px-3">Loyer net/mois</th>
                            <th class="text-right py-2 px-3">Loyer net/an</th>
                            <th class="text-right py-2 px-3">Cash-flow/mois</th>
                            <th class="text-right py-2 px-3">Rendement</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${opportunites.map((opp, index) => `
                            <tr class="border-b border-blue-800/30 hover:bg-blue-900/20">
                                <td class="py-2 px-3">${opp.ville}</td>
                                <td class="py-2 px-3">${opp.type}</td>
                                <td class="py-2 px-3">
                                    <span class="px-2 py-0.5 rounded text-xs ${opp.mode === 'Classique' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}">
                                        ${opp.mode}
                                    </span>
                                </td>
                                <td class="text-right py-2 px-3">${opp.surface.toFixed(1)} m²</td>
                                <td class="text-right py-2 px-3 text-green-400 font-medium">${this.formaterMontant(opp.loyerNet)}</td>
                                <td class="text-right py-2 px-3 text-green-400">${this.formaterMontant(opp.loyerAnnuel)}</td>
                                <td class="text-right py-2 px-3 ${opp.cashflow >= 0 ? 'text-green-400' : 'text-red-400'}">
                                    ${this.formaterMontant(opp.cashflow)}
                                </td>
                                <td class="text-right py-2 px-3">${opp.rendement.toFixed(2)}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    afficherDetails(villeNom, type, mode) {
        // Trouver les données correspondantes
        const resultat = this.resultatsComparaison.find(r => r.ville.nom === villeNom);
        if (!resultat) return;
        
        const data = resultat.resultats[type][mode.toLowerCase()];
        if (!data) return;
        
        // Créer et afficher une modal avec les détails complets
        // (Vous pouvez personnaliser cette partie selon vos besoins)
        alert(`Détails pour ${villeNom} - ${type} (${mode}):\n\nPrix d'achat: ${this.formaterMontant(data.prixAchat)}\nCoût total: ${this.formaterMontant(data.coutTotal)}\nSurface: ${data.surface.toFixed(1)} m²`);
    }
    
    afficherNotification(message, type = 'info') {
        // Créer une notification temporaire
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
            type === 'warning' ? 'bg-orange-500' : 'bg-green-500'
        } text-white`;
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${type === 'warning' ? 'fa-exclamation-triangle' : 'fa-check-circle'} mr-2"></i>
                ${message}
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    formaterMontant(montant) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(montant);
    }
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    // Attendre que le simulateur soit chargé
    const checkSimulator = setInterval(() => {
        if (window.simulateur && window.villeSearchManager) {
            clearInterval(checkSimulator);
            window.multiVilleComparator = new MultiVilleComparator(window.simulateur);
            console.log('✅ Comparateur multi-villes initialisé');
        }
    }, 100);
});
