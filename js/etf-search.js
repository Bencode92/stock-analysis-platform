/**
 * etf-search.js - Script pour la fonctionnalité de recherche des ETF
 * Ce script gère la recherche en temps réel dans la page etf.html
 */

document.addEventListener('DOMContentLoaded', function() {
    // Sélectionner les éléments nécessaires à la recherche
    const searchInput = document.getElementById('main-search-input');
    const clearButton = document.getElementById('clear-search');
    const searchInfo = document.getElementById('search-count');
    const searchResults = document.getElementById('search-results');
    const searchResultsBody = document.getElementById('search-results-body');
    
    if (searchInput && clearButton) {
        console.log('🔍 Initialisation du système de recherche ETF');
        
        // Recherche en temps réel
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.trim().toLowerCase();
            
            // Afficher/masquer le bouton d'effacement
            clearButton.style.opacity = searchTerm ? '1' : '0';
            
            // Effectuer la recherche
            if (searchTerm && searchTerm.length >= 2) {
                // Vérifier si les données sont disponibles
                if (!window.etfsData) {
                    console.warn("Attente du chargement des données ETF...");
                    return;
                }
                
                performSearch(searchTerm);
            } else {
                clearSearch();
            }
        });
        
        // Effacer la recherche
        clearButton.addEventListener('click', function() {
            searchInput.value = '';
            searchInput.focus();
            clearSearch();
            this.style.opacity = '0';
        });
        
        // Focus sur l'input au chargement de la page
        setTimeout(() => {
            searchInput.focus();
        }, 500);
    } else {
        console.error("❌ Éléments de recherche non trouvés dans le DOM");
    }
    
    // Fonction pour effectuer la recherche
    function performSearch(searchTerm) {
        if (!window.etfsData || !window.etfsData.indices) {
            console.warn("Les données ETF ne sont pas encore chargées");
            return;
        }
        
        console.log(`🔍 Recherche d'ETF pour: "${searchTerm}"`);
        
        // Vider le tableau de résultats
        if (searchResultsBody) {
            searchResultsBody.innerHTML = '';
        }
        
        // Afficher la section de résultats
        if (searchResults) {
            searchResults.classList.remove('hidden');
        }
        
        let totalResults = 0;
        let matchingETFs = [];
        
        // Parcourir toutes les lettres et chercher les ETFs correspondants
        const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
        
        alphabet.forEach(letter => {
            const etfs = window.etfsData.indices[letter] || [];
            
            etfs.forEach(etf => {
                // Recherche dans le nom d'ETF
                if (etf.name && etf.name.toLowerCase().includes(searchTerm)) {
                    matchingETFs.push(etf);
                    totalResults++;
                }
            });
        });
        
        // Chercher aussi dans les ETF TOP 50, Obligations et Court Terme
        ['top50_etfs', 'top_bond_etfs', 'top_short_term_etfs'].forEach(category => {
            if (window.etfsData[category]) {
                window.etfsData[category].forEach(etf => {
                    if (etf.name && etf.name.toLowerCase().includes(searchTerm) && 
                        !matchingETFs.some(m => m.name === etf.name)) {
                        // Adapter le format des ETF spéciaux à notre format d'affichage
                        const adaptedEtf = {
                            name: etf.name,
                            category: category === 'top50_etfs' ? 'TOP 50' : 
                                     (category === 'top_bond_etfs' ? 'Obligations' : 'Court Terme'),
                            provider: '-',
                            last: '-',
                            change: etf.one_month || '-',
                            ytd: etf.ytd || '-',
                            assets: '-',
                            ratio: '-'
                        };
                        
                        matchingETFs.push(adaptedEtf);
                        totalResults++;
                    }
                });
            }
        });
        
        // Mettre à jour le compteur de résultats
        if (searchInfo) {
            searchInfo.textContent = totalResults;
        }
        
        // Afficher les résultats
        if (searchResultsBody) {
            if (totalResults === 0) {
                searchResultsBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-center py-4 text-gray-400">
                            <i class="fas fa-info-circle mr-2"></i>
                            Aucun ETF ne correspond à votre recherche
                        </td>
                    </tr>
                `;
            } else {
                // Trier les résultats par nom
                matchingETFs.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
                
                // Limiter à 20 résultats pour la performance
                const displayETFs = matchingETFs.slice(0, 20);
                
                // Ajouter chaque ETF au tableau
                displayETFs.forEach(etf => {
                    const row = document.createElement('tr');
                    
                    // Déterminer les classes pour les performances
                    const changeClass = etf.change && etf.change.includes('-') ? 'negative' : 'positive';
                    const ytdClass = etf.ytd && etf.ytd.includes('-') ? 'negative' : 'positive';
                    
                    // Création de la ligne avec mise en évidence du terme recherché
                    let highlightedName = etf.name || '-';
                    if (searchTerm && highlightedName !== '-') {
                        // Mettre en évidence le terme recherché
                        const re = new RegExp(`(${searchTerm})`, 'gi');
                        highlightedName = highlightedName.replace(re, '<span class="search-highlight">$1</span>');
                    }
                    
                    row.innerHTML = `
                        <td class="font-medium">${highlightedName}</td>
                        <td>${etf.category || '-'}</td>
                        <td>${etf.provider || '-'}</td>
                        <td>${etf.last || '-'}</td>
                        <td class="${changeClass}">${etf.change || '-'}</td>
                        <td class="${ytdClass}">${etf.ytd || '-'}</td>
                        <td>${etf.assets || '-'}</td>
                        <td>${etf.ratio || '-'}</td>
                    `;
                    
                    searchResultsBody.appendChild(row);
                });
                
                // Afficher un message si les résultats sont limités
                if (totalResults > 20) {
                    const moreRow = document.createElement('tr');
                    moreRow.innerHTML = `
                        <td colspan="8" class="text-center py-2 text-gray-400">
                            <i class="fas fa-ellipsis-h mr-2"></i>
                            ${totalResults - 20} résultats supplémentaires trouvés. Affinez votre recherche pour des résultats plus précis.
                        </td>
                    `;
                    
                    searchResultsBody.appendChild(moreRow);
                }
            }
        }
    }
    
    // Fonction pour effacer la recherche
    function clearSearch() {
        // Masquer la section de résultats
        if (searchResults) {
            searchResults.classList.add('hidden');
        }
        
        // Vider le tableau de résultats
        if (searchResultsBody) {
            searchResultsBody.innerHTML = '';
        }
    }
    
    // Exposer les fonctions pour qu'elles puissent être appelées par etf-script.js
    window.performGlobalSearch = performSearch;
    window.clearGlobalSearch = clearSearch;
});