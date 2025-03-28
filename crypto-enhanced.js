/**
 * crypto-enhanced.js
 * Fonctionnalités améliorées pour la page crypto
 */

document.addEventListener('DOMContentLoaded', function() {
    // Ajouter la classe pour rendre les onglets alphabétiques collants
    const alphabetTabs = document.querySelector('.region-tabs');
    if (alphabetTabs) {
        // Créer un conteneur pour les onglets
        const container = document.createElement('div');
        container.className = 'alphabet-tabs-container';
        
        // Déplacer les onglets dans le conteneur
        alphabetTabs.parentNode.insertBefore(container, alphabetTabs);
        container.appendChild(alphabetTabs);
    }
    
    // Ajouter les filtres rapides
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
        const filtersDiv = document.createElement('div');
        filtersDiv.className = 'quick-filters';
        filtersDiv.innerHTML = `
            <div class="filter-chip active" data-filter="all">Toutes</div>
            <div class="filter-chip" data-filter="top100">Top 100</div>
            <div class="filter-chip" data-filter="defi">DeFi</div>
            <div class="filter-chip" data-filter="gaming">Gaming</div>
            <div class="filter-chip" data-filter="layer1">Layer 1</div>
            <div class="filter-chip" data-filter="meme">Meme</div>
            <div class="filter-chip" data-filter="exchange">Exchange</div>
        `;
        
        searchContainer.after(filtersDiv);
        
        // Ajouter les événements aux filtres
        const filterChips = document.querySelectorAll('.filter-chip');
        filterChips.forEach(chip => {
            chip.addEventListener('click', function() {
                // Retirer la classe active des autres puces
                filterChips.forEach(c => c.classList.remove('active'));
                
                // Ajouter la classe active à cette puce
                this.classList.add('active');
                
                // Logique de filtrage (simulée)
                const filter = this.getAttribute('data-filter');
                console.log(`Filtrage par: ${filter}`);
                
                // Ajouter une notification pour indiquer que le filtrage est activé
                showFilterNotification(filter);
            });
        });
    }
    
    // Ajouter le sélecteur de vue tableau/cartes
    const indicesContainer = document.getElementById('indices-container');
    if (indicesContainer) {
        const viewToggle = document.createElement('div');
        viewToggle.className = 'view-toggle';
        viewToggle.innerHTML = `
            <div class="view-toggle-btn active" data-view="table">
                <i class="fas fa-table"></i> Tableau
            </div>
            <div class="view-toggle-btn" data-view="cards">
                <i class="fas fa-th-large"></i> Cartes
            </div>
        `;
        
        indicesContainer.parentNode.insertBefore(viewToggle, indicesContainer);
        
        // Ajouter les événements au sélecteur de vue
        const viewButtons = viewToggle.querySelectorAll('.view-toggle-btn');
        viewButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                // Ne rien faire si le bouton est déjà actif
                if (this.classList.contains('active')) return;
                
                // Retirer la classe active des autres boutons
                viewButtons.forEach(b => b.classList.remove('active'));
                
                // Ajouter la classe active à ce bouton
                this.classList.add('active');
                
                // Changer de vue
                const view = this.getAttribute('data-view');
                toggleView(view);
            });
        });
    }
    
    // Ajouter des badges à certaines cryptomonnaies
    addCryptoBadges();
    
    // Ajouter des mini-graphiques (simulés)
    addMiniCharts();
    
    // Ajouter des boutons d'action aux lignes
    addRowActions();
    
    // Générer la vue en cartes (mais cachée par défaut)
    generateCardView();
    
    /**
     * Ajoute des badges à certaines cryptomonnaies
     */
    function addCryptoBadges() {
        // Définition des badges par symbole
        const badges = {
            'UNI': 'defi',
            'AAVE': 'defi',
            'CRV': 'defi',
            'SUSHI': 'defi',
            'CAKE': 'defi',
            'AXS': 'gaming',
            'SAND': 'gaming',
            'MANA': 'gaming',
            'ENJ': 'gaming',
            'BTC': 'layer1',
            'ETH': 'layer1',
            'SOL': 'layer1',
            'AVAX': 'layer1',
            'DOT': 'layer1',
            'DOGE': 'meme',
            'SHIB': 'meme',
            'PEPE': 'meme',
            'BONK': 'meme',
            'BNB': 'exchange',
            'CRO': 'exchange',
            'FTT': 'exchange',
            'OKB': 'exchange'
        };
        
        // Pour chaque tableau, parcourir les lignes et ajouter des badges
        const tables = document.querySelectorAll('.data-table');
        tables.forEach(table => {
            const rows = table.querySelectorAll('tbody tr');
            
            rows.forEach(row => {
                if (row.cells.length < 2) return;
                
                const symbolCell = row.cells[1];
                const symbol = symbolCell.textContent.trim();
                
                if (badges[symbol]) {
                    const nameCell = row.cells[0];
                    const badge = document.createElement('span');
                    badge.className = `crypto-badge badge-${badges[symbol]}`;
                    badge.textContent = badges[symbol].toUpperCase();
                    nameCell.appendChild(badge);
                }
                
                // Ajouter la classe pour les effets de ligne
                row.classList.add('crypto-row');
                
                // Mettre en évidence les variations extrêmes
                const changeCell1h = row.cells[3];
                const changeCell24h = row.cells[4];
                const changeCell7d = row.cells[5];
                
                // Fonction pour ajouter la classe extreme-change si nécessaire
                const checkExtreme = (cell) => {
                    if (!cell) return;
                    const text = cell.textContent.trim();
                    const value = parseFloat(text.replace('%', '').replace('+', '').replace('-', ''));
                    
                    if (value >= 20) {
                        cell.classList.add('extreme-change');
                        cell.classList.add('positive');
                    } else if (value <= -15) {
                        cell.classList.add('extreme-change');
                        cell.classList.add('negative');
                    }
                };
                
                checkExtreme(changeCell1h);
                checkExtreme(changeCell24h);
                checkExtreme(changeCell7d);
            });
        });
    }
    
    /**
     * Ajoute des mini-graphiques aux lignes (simulés)
     */
    function addMiniCharts() {
        const rows = document.querySelectorAll('.crypto-row');
        
        rows.forEach(row => {
            if (row.cells.length < 5) return;
            
            // Ajouter le conteneur de mini-graphique à côté de la variation 24h
            const changeCell = row.cells[4];
            const chartContainer = document.createElement('div');
            chartContainer.className = 'mini-chart-container';
            changeCell.appendChild(chartContainer);
            
            // Simuler un graphique avec une SVG simple
            // Dans un cas réel, on pourrait utiliser Chart.js ou D3.js
            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute("width", "100%");
            svg.setAttribute("height", "100%");
            svg.setAttribute("viewBox", "0 0 60 20");
            
            // Générer des points aléatoires
            const points = Array.from({length: 10}, (_, i) => {
                const x = i * 6;
                const y = 10 + Math.random() * 10 - 5;
                return `${x},${y}`;
            }).join(' ');
            
            // Déterminer la couleur en fonction de la tendance
            const isPositive = !changeCell.textContent.includes('-');
            const color = isPositive ? 'var(--accent-color)' : 'var(--negative-color)';
            
            // Créer le polyline
            const polyline = document.createElementNS(svgNS, "polyline");
            polyline.setAttribute("points", points);
            polyline.setAttribute("fill", "none");
            polyline.setAttribute("stroke", color);
            polyline.setAttribute("stroke-width", "1.5");
            
            svg.appendChild(polyline);
            chartContainer.appendChild(svg);
        });
    }
    
    /**
     * Ajoute des boutons d'action aux lignes
     */
    function addRowActions() {
        const rows = document.querySelectorAll('.crypto-row');
        
        rows.forEach(row => {
            // Créer le conteneur d'actions
            const actions = document.createElement('div');
            actions.className = 'row-actions';
            
            // Ajouter les boutons d'action
            actions.innerHTML = `
                <div class="row-action-btn" title="Ajouter aux favoris">
                    <i class="far fa-star"></i>
                </div>
                <div class="row-action-btn" title="Voir les détails">
                    <i class="fas fa-info-circle"></i>
                </div>
            `;
            
            // Ajouter les événements aux boutons
            const favoriteBtn = actions.querySelector('.row-action-btn:first-child');
            favoriteBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const star = this.querySelector('i');
                
                // Basculer entre étoile pleine et vide
                if (star.classList.contains('far')) {
                    star.classList.remove('far');
                    star.classList.add('fas');
                    showNotification('Ajouté aux favoris');
                } else {
                    star.classList.remove('fas');
                    star.classList.add('far');
                    showNotification('Retiré des favoris');
                }
            });
            
            const detailBtn = actions.querySelector('.row-action-btn:last-child');
            detailBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                
                // Obtenir le nom de la crypto
                const name = row.cells[0].textContent.trim();
                
                // Afficher un message
                showNotification(`Affichage des détails pour ${name}`);
            });
            
            // Ajouter le conteneur à la ligne
            row.appendChild(actions);
        });
    }
    
    /**
     * Génère une vue en cartes pour les cryptomonnaies
     */
    function generateCardView() {
        const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
        
        alphabet.forEach(letter => {
            const tableSection = document.getElementById(`${letter}-indices`);
            if (!tableSection) return;
            
            // Créer le conteneur de cartes
            const cardView = document.createElement('div');
            cardView.className = 'card-view hidden';
            cardView.id = `${letter}-cards`;
            
            // Obtenir les données du tableau
            const rows = tableSection.querySelectorAll('tbody tr');
            
            // Créer une carte pour chaque ligne
            rows.forEach(row => {
                if (row.cells.length <= 1) {
                    // C'est une ligne de message "Aucune cryptomonnaie"
                    const emptyCard = document.createElement('div');
                    emptyCard.className = 'crypto-card';
                    emptyCard.innerHTML = `
                        <div class="text-center py-4 text-gray-400">
                            <i class="fas fa-info-circle mr-2"></i>
                            Aucune cryptomonnaie disponible pour cette lettre
                        </div>
                    `;
                    cardView.appendChild(emptyCard);
                    return;
                }
                
                // Extraire les données
                const name = row.cells[0].textContent.trim();
                const symbol = row.cells[1].textContent.trim();
                const price = row.cells[2].textContent.trim();
                const change1h = row.cells[3].textContent.trim();
                const change24h = row.cells[4].textContent.trim();
                const change7d = row.cells[5].textContent.trim();
                const volume = row.cells[6].textContent.trim();
                
                // Déterminer les classes CSS pour les variations
                const change1hClass = change1h.includes('-') ? 'negative' : 'positive';
                const change24hClass = change24h.includes('-') ? 'negative' : 'positive';
                const change7dClass = change7d.includes('-') ? 'negative' : 'positive';
                
                // Créer la carte
                const card = document.createElement('div');
                card.className = 'crypto-card';
                card.innerHTML = `
                    <div class="crypto-card-name">${name}</div>
                    <div class="crypto-card-symbol">${symbol}</div>
                    <div class="crypto-card-price">${price}</div>
                    <div class="crypto-card-changes">
                        <div class="crypto-card-change">
                            <span>1H</span>
                            <div class="${change1hClass}">${change1h}</div>
                        </div>
                        <div class="crypto-card-change">
                            <span>24H</span>
                            <div class="${change24hClass}">${change24h}</div>
                        </div>
                        <div class="crypto-card-change">
                            <span>7D</span>
                            <div class="${change7dClass}">${change7d}</div>
                        </div>
                    </div>
                    <div class="crypto-card-volume">Volume: ${volume}</div>
                    <div class="crypto-card-actions">
                        <div class="row-action-btn" title="Ajouter aux favoris">
                            <i class="far fa-star"></i>
                        </div>
                        <div class="row-action-btn" title="Voir les détails">
                            <i class="fas fa-info-circle"></i>
                        </div>
                    </div>
                `;
                
                // Ajouter les événements aux boutons d'action
                const favoriteBtn = card.querySelector('.row-action-btn:first-child');
                favoriteBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const star = this.querySelector('i');
                    
                    // Basculer entre étoile pleine et vide
                    if (star.classList.contains('far')) {
                        star.classList.remove('far');
                        star.classList.add('fas');
                        showNotification('Ajouté aux favoris');
                    } else {
                        star.classList.remove('fas');
                        star.classList.add('far');
                        showNotification('Retiré des favoris');
                    }
                });
                
                const detailBtn = card.querySelector('.row-action-btn:last-child');
                detailBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    showNotification(`Affichage des détails pour ${name}`);
                });
                
                cardView.appendChild(card);
            });
            
            // Ajouter la vue en cartes après la section du tableau
            tableSection.parentNode.insertBefore(cardView, tableSection.nextSibling);
        });
    }
    
    /**
     * Bascule entre la vue tableau et la vue cartes
     */
    function toggleView(view) {
        const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
        
        alphabet.forEach(letter => {
            const tableSection = document.getElementById(`${letter}-indices`);
            const cardSection = document.getElementById(`${letter}-cards`);
            
            if (tableSection && cardSection) {
                if (view === 'table') {
                    tableSection.classList.remove('hidden');
                    cardSection.classList.add('hidden');
                } else {
                    tableSection.classList.add('hidden');
                    cardSection.classList.remove('hidden');
                }
            }
        });
        
        // Afficher une notification
        showNotification(`Affichage en mode ${view === 'table' ? 'tableau' : 'cartes'}`);
    }
    
    /**
     * Affiche une notification de filtre
     */
    function showFilterNotification(filter) {
        let message = '';
        
        switch(filter) {
            case 'all':
                message = 'Affichage de toutes les cryptomonnaies';
                break;
            case 'top100':
                message = 'Filtrage des 100 premières cryptomonnaies';
                break;
            case 'defi':
                message = 'Filtrage des cryptomonnaies DeFi';
                break;
            case 'gaming':
                message = 'Filtrage des cryptomonnaies Gaming';
                break;
            case 'layer1':
                message = 'Filtrage des cryptomonnaies Layer 1';
                break;
            case 'meme':
                message = 'Filtrage des cryptomonnaies Meme';
                break;
            case 'exchange':
                message = 'Filtrage des cryptomonnaies Exchange';
                break;
            default:
                message = `Filtrage: ${filter}`;
        }
        
        showNotification(message);
    }
    
    /**
     * Affiche une notification
     */
    function showNotification(message, type = 'info') {
        // Vérifier si une notification existe déjà
        let notification = document.querySelector('.notification-popup');
        if (!notification) {
            notification = document.createElement('div');
            notification.className = 'notification-popup';
            notification.style.position = 'fixed';
            notification.style.bottom = '20px';
            notification.style.right = '20px';
            notification.style.padding = '15px 25px';
            notification.style.borderRadius = '4px';
            notification.style.zIndex = '1000';
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(20px)';
            notification.style.transition = 'opacity 0.3s, transform 0.3s';
            
            if (type === 'warning') {
                notification.style.backgroundColor = 'rgba(255, 193, 7, 0.1)';
                notification.style.borderLeft = '3px solid #FFC107';
                notification.style.color = '#FFC107';
            } else {
                notification.style.backgroundColor = 'rgba(0, 255, 135, 0.1)';
                notification.style.borderLeft = '3px solid var(--accent-color)';
                notification.style.color = 'var(--text-color)';
            }
            
            notification.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
            
            document.body.appendChild(notification);
        }
        
        notification.textContent = message;
        
        // Animer la notification
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
            
            // Masquer automatiquement après 4 secondes
            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transform = 'translateY(20px)';
                
                // Supprimer après la transition
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }, 4000);
        }, 100);
    }
});
