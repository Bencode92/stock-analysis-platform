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
    
    // Variables pour les suggestions
    let suggestionTimeout;
    let currentSuggestions = [];
    let selectedSuggestionIndex = -1;
    
    // Référence à la catégorie d'ETF actuellement sélectionnée
    let currentEtfCategory = 'top50'; // Valeur par défaut: 'top50', 'bonds', 'shortterm'
    
    // Observer les changements de catégorie
    const categoryButtons = document.querySelectorAll('.market-btn[data-category]');
    categoryButtons.forEach(button => {
        button.addEventListener('click', function() {
            currentEtfCategory = this.getAttribute('data-category');
            console.log(`🔄 Catégorie ETF changée: ${currentEtfCategory}`);
            
            // Si une recherche est active, la relancer avec la nouvelle catégorie
            if (searchInput.value.trim().length >= 2) {
                performSearch(searchInput.value.trim().toLowerCase());
            }
        });
    });
    
    // Déterminer la catégorie active au chargement de la page
    function determineInitialCategory() {
        const activeButton = document.querySelector('.market-btn.active[data-category]');
        if (activeButton) {
            currentEtfCategory = activeButton.getAttribute('data-category');
            console.log(`📊 Catégorie ETF initiale: ${currentEtfCategory}`);
        }
    }
    
    // Appeler au chargement
    determineInitialCategory();
    
    if (searchInput && clearButton) {
        console.log('🔍 Initialisation du système de recherche ETF');
        
        // Recherche en temps réel
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.trim().toLowerCase();
            
            // Afficher/masquer le bouton d'effacement
            clearButton.style.opacity = searchTerm ? '1' : '0';
            
            // Annuler le timeout précédent pour les suggestions
            clearTimeout(suggestionTimeout);
            
            // Effectuer la recherche et afficher des suggestions après un court délai
            if (searchTerm && searchTerm.length >= 2) {
                // Définir un délai avant de montrer les suggestions (pour éviter trop de requêtes)
                suggestionTimeout = setTimeout(() => {
                    // Vérifier si les données sont disponibles
                    if (!window.etfsData) {
                        console.warn("Attente du chargement des données ETF...");
                        checkDataAndRetry(searchTerm, 5);
                        return;
                    }
                    
                    performSearch(searchTerm);
                    updateSuggestions(searchTerm);
                }, 300);
            } else {
                clearSearch();
                hideSuggestions();
            }
        });
        
        // Fonction pour vérifier si les données sont disponibles et réessayer
        function checkDataAndRetry(searchTerm, attempts) {
            if (attempts <= 0) {
                console.error("Impossible de charger les données ETF pour la recherche");
                showDataLoadingError();
                return;
            }
            
            setTimeout(() => {
                if (window.etfsData) {
                    performSearch(searchTerm);
                    updateSuggestions(searchTerm);
                } else {
                    checkDataAndRetry(searchTerm, attempts - 1);
                }
            }, 1000); // Attendre 1 seconde avant de réessayer
        }
        
        // Afficher un message d'erreur si les données ne se chargent pas
        function showDataLoadingError() {
            if (searchResultsBody) {
                searchResultsBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-center py-4 text-red-400">
                            <i class="fas fa-exclamation-triangle mr-2"></i>
                            Impossible de charger les données ETF. Veuillez recharger la page.
                        </td>
                    </tr>
                `;
                
                // Afficher la section de résultats
                if (searchResults) {
                    searchResults.classList.remove('hidden');
                    setTimeout(() => {
                        searchResults.classList.add('visible');
                    }, 50);
                }
            }
        }
        
        // Effacer la recherche
        clearButton.addEventListener('click', function() {
            searchInput.value = '';
            searchInput.focus();
            clearSearch();
            hideSuggestions();
            this.style.opacity = '0';
        });
        
        // Navigation au clavier dans les suggestions
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentSuggestions.length > 0) {
                    selectedSuggestionIndex = (selectedSuggestionIndex + 1) % currentSuggestions.length;
                    highlightSuggestion(selectedSuggestionIndex);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentSuggestions.length > 0) {
                    if (selectedSuggestionIndex <= 0) {
                        selectedSuggestionIndex = currentSuggestions.length - 1;
                    } else {
                        selectedSuggestionIndex--;
                    }
                    highlightSuggestion(selectedSuggestionIndex);
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                
                // Si une suggestion est sélectionnée, l'utiliser
                if (selectedSuggestionIndex >= 0 && currentSuggestions.length > 0) {
                    const selectedSuggestion = currentSuggestions[selectedSuggestionIndex];
                    searchInput.value = selectedSuggestion.name;
                    performSearch(selectedSuggestion.name.toLowerCase());
                    hideSuggestions();
                } else {
                    // Sinon, effectuer une recherche normale
                    const searchTerm = this.value.trim().toLowerCase();
                    if (searchTerm && searchTerm.length >= 2) {
                        performSearch(searchTerm);
                        hideSuggestions();
                    }
                }
            } else if (e.key === 'Escape') {
                hideSuggestions();
            }
        });
        
        // Masquer les suggestions lors du clic en dehors
        document.addEventListener('click', function(e) {
            if (!searchInput.contains(e.target) && !searchSuggestions?.contains(e.target)) {
                hideSuggestions();
            }
        });
        
        // Focus sur l'input au chargement de la page
        setTimeout(() => {
            searchInput.focus();
        }, 500);
    } else {
        console.error("❌ Éléments de recherche non trouvés dans le DOM");
    }
    
    // Fonction pour mettre en évidence une suggestion
    function highlightSuggestion(index) {
        const searchSuggestions = document.getElementById('search-suggestions');
        if (!searchSuggestions) return;
        
        const suggestionItems = searchSuggestions.querySelectorAll('.suggestion-item');
        
        suggestionItems.forEach((item, i) => {
            if (i === index) {
                item.classList.add('bg-accent-subtle');
            } else {
                item.classList.remove('bg-accent-subtle');
            }
        });
    }
    
    // Fonction pour masquer les suggestions
    function hideSuggestions() {
        const searchSuggestions = document.getElementById('search-suggestions');
        if (searchSuggestions) {
            searchSuggestions.classList.remove('active');
            searchSuggestions.innerHTML = '';
            currentSuggestions = [];
            selectedSuggestionIndex = -1;
        }
    }
    
    // Fonction pour mettre à jour les suggestions
    function updateSuggestions(searchTerm) {
        const searchSuggestions = document.getElementById('search-suggestions');
        if (!searchSuggestions) return;
        
        if (!window.etfsData) {
            console.warn("Les données ETF ne sont pas encore disponibles pour les suggestions");
            return;
        }
        
        currentSuggestions = [];
        
        // Déterminer la source de données en fonction de la catégorie
        let dataSource = [];
        
        // Ajouter les ETF de la catégorie actuelle
        if (currentEtfCategory === 'top50' && window.etfsData.top50_etfs) {
            dataSource = window.etfsData.top50_etfs;
        } else if (currentEtfCategory === 'bonds' && window.etfsData.top_bond_etfs) {
            dataSource = window.etfsData.top_bond_etfs;
        } else if (currentEtfCategory === 'shortterm' && window.etfsData.top_short_term_etfs) {
            dataSource = window.etfsData.top_short_term_etfs;
        }
        
        // Collecter les ETF correspondants dans la catégorie actuelle
        dataSource.forEach(etf => {
            if (etf.name && etf.name.toLowerCase().includes(searchTerm) && 
                currentSuggestions.length < 5) {
                currentSuggestions.push(etf);
            }
        });
        
        // Si on n'a pas assez de suggestions, chercher aussi dans l'index général
        if (currentSuggestions.length < 5 && window.etfsData.indices) {
            const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
            
            alphabet.forEach(letter => {
                const etfs = window.etfsData.indices[letter] || [];
                
                etfs.forEach(etf => {
                    if (etf.name && etf.name.toLowerCase().includes(searchTerm) && 
                        !currentSuggestions.some(s => s.name === etf.name) && 
                        currentSuggestions.length < 5) {
                        currentSuggestions.push(etf);
                    }
                });
            });
        }
        
        // Afficher les suggestions
        if (currentSuggestions.length > 0) {
            searchSuggestions.innerHTML = '';
            
            currentSuggestions.forEach((etf, index) => {
                const suggestionItem = document.createElement('div');
                suggestionItem.className = 'suggestion-item';
                
                // Mettre en évidence la partie correspondante
                const regex = new RegExp(`(${searchTerm})`, 'gi');
                const highlightedName = etf.name.replace(regex, '<span class="text-green-400 font-medium">$1</span>');
                
                suggestionItem.innerHTML = highlightedName;
                
                // Ajouter un event listener pour le clic
                suggestionItem.addEventListener('click', () => {
                    searchInput.value = etf.name;
                    performSearch(etf.name.toLowerCase());
                    hideSuggestions();
                });
                
                // Ajouter un event listener pour le survol
                suggestionItem.addEventListener('mouseover', () => {
                    selectedSuggestionIndex = index;
                    highlightSuggestion(index);
                });
                
                searchSuggestions.appendChild(suggestionItem);
            });
            
            searchSuggestions.classList.add('active');
        } else {
            hideSuggestions();
        }
    }
    
    // Fonction pour effectuer la recherche
    function performSearch(searchTerm) {
        if (!window.etfsData) {
            console.warn("Les données ETF ne sont pas encore chargées pour la recherche");
            return;
        }
        
        console.log(`🔍 Recherche d'ETF pour: "${searchTerm}" dans la catégorie: ${currentEtfCategory}`);
        
        // Vider le tableau de résultats
        if (searchResultsBody) {
            searchResultsBody.innerHTML = '';
        } else {
            console.warn("Élément searchResultsBody non trouvé");
            return;
        }
        
        // Afficher la section de résultats avec animation
        if (searchResults) {
            searchResults.classList.remove('hidden');
            
            // Ajouter la classe visible après un court délai pour l'animation
            setTimeout(() => {
                searchResults.classList.add('visible');
            }, 50);
        }
        
        let totalResults = 0;
        let matchingETFs = [];
        
        // Déterminer la source de données en fonction de la catégorie
        if (currentEtfCategory === 'top50' && window.etfsData.top50_etfs) {
            // Recherche dans TOP 50 ETF
            window.etfsData.top50_etfs.forEach(etf => {
                if (etf.name && etf.name.toLowerCase().includes(searchTerm)) {
                    const adaptedEtf = {
                        name: etf.name,
                        category: 'TOP 50',
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
        } else if (currentEtfCategory === 'bonds' && window.etfsData.top_bond_etfs) {
            // Recherche dans TOP ETF Obligations
            window.etfsData.top_bond_etfs.forEach(etf => {
                if (etf.name && etf.name.toLowerCase().includes(searchTerm)) {
                    const adaptedEtf = {
                        name: etf.name,
                        category: 'Obligations',
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
        } else if (currentEtfCategory === 'shortterm' && window.etfsData.top_short_term_etfs) {
            // Recherche dans TOP ETF Court Terme
            window.etfsData.top_short_term_etfs.forEach(etf => {
                if (etf.name && etf.name.toLowerCase().includes(searchTerm)) {
                    const adaptedEtf = {
                        name: etf.name,
                        category: 'Court Terme',
                        provider: '-',
                        last: '-',
                        change: etf.oneMonth || '-',
                        ytd: etf.sixMonth || '-', // Utiliser sixMonth comme proxy pour ytd
                        assets: '-',
                        ratio: '-'
                    };
                    
                    matchingETFs.push(adaptedEtf);
                    totalResults++;
                }
            });
        }
        
        // Mettre à jour le compteur de résultats avec animation
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
                            Aucun ETF ne correspond à votre recherche dans la catégorie ${getCategoryDisplayName(currentEtfCategory)}
                        </td>
                    </tr>
                `;
            } else {
                // Trier les résultats par nom
                matchingETFs.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
                
                // Ajouter chaque ETF au tableau
                matchingETFs.forEach(etf => {
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
                    
                    // Ajouter l'effet d'apparition progressive
                    row.style.opacity = '0';
                    row.style.transform = 'translateY(10px)';
                    row.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                    
                    searchResultsBody.appendChild(row);
                    
                    // Déclencher l'animation avec un délai croissant pour chaque ligne
                    setTimeout(() => {
                        row.style.opacity = '1';
                        row.style.transform = 'translateY(0)';
                    }, 50 + matchingETFs.indexOf(etf) * 30);
                });
            }
        }
    }
    
    // Fonction pour obtenir le nom d'affichage d'une catégorie
    function getCategoryDisplayName(category) {
        switch(category) {
            case 'top50': return 'TOP 50 ETF';
            case 'bonds': return 'TOP ETF Obligations';
            case 'shortterm': return 'TOP ETF Court Terme';
            default: return 'ETF';
        }
    }
    
    // Fonction pour effacer la recherche
    function clearSearch() {
        // Masquer le compteur de résultats
        if (searchInfo) {
            searchInfo.classList.remove('visible');
        }
        
        // Masquer la section de résultats
        if (searchResults) {
            searchResults.classList.remove('visible');
            setTimeout(() => {
                searchResults.classList.add('hidden');
            }, 300);
        }
        
        // Vider le tableau de résultats
        if (searchResultsBody) {
            searchResultsBody.innerHTML = '';
        }
    }
    
    // Exposer window.performGlobalSearch pour pouvoir être appelé depuis etf-script.js
    window.performGlobalSearch = performSearch;
    window.clearGlobalSearch = clearSearch;
});