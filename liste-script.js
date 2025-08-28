/**
 * liste-script.js - Script pour afficher les actions du NASDAQ Composite et DJ STOXX 600
 * Données mises à jour régulièrement par GitHub Actions
 * Version améliorée avec chargement dynamique des données par marché et sélection multi-régions
 * Ajout de panneaux détails extensibles pour chaque action
 */

document.addEventListener('DOMContentLoaded', function() {
    // --- FICHIERS A→Z PAR RÉGION ---
    const AZ_FILES = {
        US:      'data/stocks_us.json',
        EUROPE:  'data/stocks_europe.json',
        ASIA:    'data/stocks_asia.json',
    };
    
    const SCOPE_TO_FILES = {
        GLOBAL:        ['US','EUROPE','ASIA'],
        US:            ['US'],
        EUROPE:        ['EUROPE'],
        ASIA:          ['ASIA'],
        US_EUROPE:     ['US','EUROPE'],
        US_ASIA:       ['US','ASIA'],
        EUROPE_ASIA:   ['EUROPE','ASIA'],
    };
    
    // Variables globales pour stocker les données
    let stocksData = {
        indices: {},
        meta: {
            source: 'TradePulse',
            timestamp: null,
            count: 0,
            isStale: false
        }
    };
    
    // Données des deux marchés pour le classement global
    let globalData = {
        nasdaq: null,
        stoxx: null
    };
    
    // État du scraper
    let isLoading = false;
    let lastUpdate = null;
    
    // État pour le marché actuel et la pagination
    let currentMarket = 'nasdaq'; // 'nasdaq' ou 'stoxx'
    let currentPage = 1;
    let totalPages = 1;
    
    // État pour la sélection multi-régions des Top 10
    let topScope = 'GLOBAL';                  // clé utilisée dans tops_overview.sets
    let selectedRegions = new Set(['GLOBAL']); // ensemble des boutons actifs (GLOBAL exclusif)
    const REGION_ORDER = ['US','EUROPE','ASIA']; // pour ordonner les combos
    const COMBO_MAP = {
      'US,EUROPE': 'US_EUROPE',
      'EUROPE,US': 'US_EUROPE',
      'US,ASIA': 'US_ASIA',
      'ASIA,US': 'US_ASIA',
      'EUROPE,ASIA': 'EUROPE_ASIA',
      'ASIA,EUROPE': 'EUROPE_ASIA'
    };
    
    // Données des tops overview
    let topsOverview = null;
    
    // Initialiser les onglets alphabet
    initAlphabetTabs();
    
    // Initialiser les sélecteurs de marché
    initMarketSelector();
    
    // Initialiser la pagination
    initPagination();
    
    // Initialiser la barre de recherche
    initSearchFunctionality();
    
    // Mettre à jour l'horloge du marché
    updateMarketTime();
    setInterval(updateMarketTime, 1000);
    
    // Initialiser le thème
    initTheme();
    
    // Initialiser les boutons de sélection multi-régions
    wireScopeButtons();
    
    // Premier chargement des données A→Z basé sur la sélection régionale
    loadAZDataForCurrentSelection();
    
    // Charger les données pour le marché sélectionné (NASDAQ/STOXX)
    loadStocksData();
    
    // Charger les données globales
    loadGlobalData();
    
    // Charger les données tops_overview.json
    loadTopsOverview();
    
    // Ajouter les gestionnaires d'événements
    document.getElementById('retry-button')?.addEventListener('click', function() {
        hideElement('indices-error');
        showElement('indices-loading');
        loadAZDataForCurrentSelection(true);
    });
    
    // Écouter les événements de changement de filtres depuis liste.html
    window.addEventListener('topFiltersChanged', function(event) {
        const detail = event.detail;
        console.log('Filtres changés:', detail);
        
        // Mettre à jour topScope si nécessaire
        const regions = detail.regions;
        if (regions.includes('GLOBAL')) {
            topScope = 'GLOBAL';
        } else if (regions.length === 1) {
            topScope = regions[0];
        } else if (regions.length === 2) {
            const ordered = regions.sort((a,b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b));
            topScope = COMBO_MAP[`${ordered[0]},${ordered[1]}`] || 'GLOBAL';
        }
        
        // Recharger les données et re-render
        renderTop();
        loadAZDataForCurrentSelection(true);
    });
    
    /**
     * Initialise les boutons de sélection multi-régions pour les Top 10
     */
    function wireScopeButtons() {
      const box = document.getElementById('top-scope');
      if (!box) return;
      const btns = [...box.querySelectorAll('.market-btn')];

      const updateButtonsUI = () => {
        // Active visuellement les bons boutons
        btns.forEach(b => {
          const k = b.dataset.scope;
          b.classList.toggle('active', selectedRegions.has(k));
        });
        // Met l'étiquette avec ordre cohérent
        const lab = document.getElementById('top-scope-label');
        if (lab) {
          if (selectedRegions.has('GLOBAL') || selectedRegions.size === 0) {
            lab.textContent = 'GLOBAL';
          } else {
            // Toujours ordonner selon REGION_ORDER pour le label
            const ordered = Array.from(selectedRegions).sort(
              (a,b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b)
            );
            lab.textContent = ordered.join(' + ');
          }
        }
      };

      const computeTopKey = () => {
        if (selectedRegions.has('GLOBAL') || selectedRegions.size === 0) return 'GLOBAL';
        if (selectedRegions.size === 1) return Array.from(selectedRegions)[0];
        // 2 régions → clé combo
        const arr = Array.from(selectedRegions).sort(
          (a,b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b)
        );
        const key = COMBO_MAP[`${arr[0]},${arr[1]}`] || COMBO_MAP[`${arr[1]},${arr[0]}`];
        if (!key) {
          console.warn(`Combo non trouvée: ${arr.join(',')}`);
          return 'GLOBAL'; // fallback
        }
        return key;
      };

      btns.forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.scope;

          if (key === 'GLOBAL') {
            // GLOBAL = exclusif
            selectedRegions.clear();
            selectedRegions.add('GLOBAL');
          } else {
            // Si GLOBAL était actif → on le retire
            if (selectedRegions.has('GLOBAL')) selectedRegions.delete('GLOBAL');

            // Toggle sur la région
            if (selectedRegions.has(key)) {
              selectedRegions.delete(key);
            } else {
              // Ajout avec limite 2
              if (selectedRegions.size >= 2) {
                // petit feedback visuel si on tente >2
                btn.classList.add('ring-2','ring-red-400');
                setTimeout(() => btn.classList.remove('ring-2','ring-red-400'), 400);
                showToast('Maximum 2 régions simultanément');
                return;
              }
              selectedRegions.add(key);
            }

            // Si plus rien de sélectionné → repasser en GLOBAL
            if (selectedRegions.size === 0) selectedRegions.add('GLOBAL');
          }

          updateButtonsUI();
          topScope = computeTopKey();
          renderTop(); // recharge les tops depuis tops_overview.sets[topScope]
          loadAZDataForCurrentSelection(true); // recharge A→Z selon la nouvelle sélection
        });
      });

      // init
      updateButtonsUI();
      topScope = 'GLOBAL';
    }
    
    /**
     * Mini toast notification
     */
    function showToast(msg) {
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-pulse';
      toast.textContent = msg;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }
    
    /**
     * Helpers de normalisation pour les données régionales
     */
    function pctToStr(x) {
        if (x == null || x === '-') return '-';
        const n = typeof x === 'string' ? parseFloat(x.replace(',', '.')) : Number(x);
        if (!Number.isFinite(n)) return '-';
        const s = (n > 0 ? '+' : '') + n.toFixed(2).replace('.', ',') + ' %';
        return s;
    }
    
    function numToStr(x, d = 2) {
        if (x == null || x === '-') return '-';
        const n = typeof x === 'string' ? parseFloat(x.replace(',', '.')) : Number(x);
        return Number.isFinite(n) ? n.toLocaleString('fr-FR', {
            minimumFractionDigits: d,
            maximumFractionDigits: d
        }) : '-';
    }
    
    function normalizeRecord(r, fallbackRegion) {
        // On accepte {price,change_percent,perf_ytd,open,high,low,volume} ou {last,change,ytd,...}
        const name = r.name || r.ticker || '—';
        const ticker = r.ticker || r.symbol || '';
        const region = r.region || fallbackRegion || 'GLOBAL';
        const country = r.country || r.location || '';
        const last = r.last ?? r.price;
        const change = r.change ?? r.change_percent;
        const ytd = r.ytd ?? r.perf_ytd;
        
        // Déterminer l'icône du marché
        const marketIcon = {
            US: '<i class="fas fa-flag-usa text-xs ml-1 text-blue-400" title="US"></i>',
            EUROPE: '<i class="fas fa-globe-europe text-xs ml-1 text-green-400" title="Europe"></i>',
            ASIA: '<i class="fas fa-globe-asia text-xs ml-1 text-red-400" title="Asie"></i>'
        }[region] || '';
        
        return {
            name,
            ticker,
            region,
            country,
            last: numToStr(last),
            change: pctToStr(change),
            open: numToStr(r.open),
            high: numToStr(r.high),
            low: numToStr(r.low),
            ytd: pctToStr(ytd),
            volume: r.volume == null ? '-' : Number(r.volume).toLocaleString('fr-FR'),
            marketIcon,
            regionBadgeClass: `region-${region.toLowerCase()}`,
            exchange: r.exchange || null,
            data_exchange: r.data_exchange || 'Boursorama',
            sector: r.sector || null,
            volatility_3y: r.volatility_3y ? pctToStr(r.volatility_3y) : '-',
            dividend_yield: r.dividend_yield ? pctToStr(r.dividend_yield) : '-',
            market_cap: r.market_cap ? Number(r.market_cap).toLocaleString('fr-FR') : null,
            range_52w: r.range_52w || null,
            perf_1m: r.perf_1m ? pctToStr(r.perf_1m) : null,
            perf_3m: r.perf_3m ? pctToStr(r.perf_3m) : null,
            perf_1y: r.perf_1y ? pctToStr(r.perf_1y) : '-',
            perf_3y: r.perf_3y ? pctToStr(r.perf_3y) : '-',
            max_drawdown_3y: r.max_drawdown_3y ? pctToStr(r.max_drawdown_3y) : '-'
        };
    }
    
    function dedupByNameTicker(arr) {
        const seen = new Set();
        return arr.filter(s => {
            const k = (s.name || '') + '|' + (s.ticker || '');
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    }
    
    /**
     * Charge les données A→Z basées sur la sélection régionale actuelle
     */
    async function loadAZDataForCurrentSelection(forceRefresh = false) {
        const scope = (typeof topScope === 'string' && SCOPE_TO_FILES[topScope]) ? topScope : 'GLOBAL';
        const regions = SCOPE_TO_FILES[scope];
        const urls = regions.map(r => AZ_FILES[r]).filter(Boolean);
        const cacheBuster = forceRefresh ? `?t=${Date.now()}` : '';
        
        // Éviter les chargements multiples simultanés
        if (isLoading) {
            console.log('⚠️ Chargement déjà en cours, opération ignorée');
            return;
        }
        
        isLoading = true;
        showElement('indices-loading');
        hideElement('indices-error');
        hideElement('indices-container');
        
        // Afficher quelles régions on charge (éviter l'accumulation de messages)
        const loadingText = document.querySelector('#indices-loading .loader');
        if (loadingText) {
            const parent = loadingText.parentElement;
            parent?.querySelector('.loading-msg')?.remove(); // Supprimer l'ancien message
            
            const regionsText = regions.join(' + ');
            const loadingMessage = document.createElement('p');
            loadingMessage.className = 'loading-msg mt-4 text-sm text-gray-400';
            loadingMessage.textContent = `Chargement des données ${regionsText}...`;
            parent.appendChild(loadingMessage);
        }
        
        try {
            console.log(`🔍 Chargement A→Z pour scope: ${scope}, régions: ${regions.join(', ')}`);
            
            const payloads = await Promise.all(
                urls.map(u => 
                    fetch(u + cacheBuster)
                        .then(r => r.ok ? r.json() : Promise.reject(u))
                        .catch(err => {
                            console.error(`Erreur lors du chargement de ${u}:`, err);
                            return null;
                        })
                )
            );
            
            // Filtrer les payloads null
            const validPayloads = payloads.filter(p => p !== null);
            
            if (validPayloads.length === 0) {
                throw new Error('Aucune donnée disponible');
            }
            
            // Collecter toutes les données
            const all = [];
            let latestTs = null;
            
            validPayloads.forEach((data, i) => {
                const region = regions[i];
                
                // Récupérer le timestamp le plus récent
                if (data.timestamp) {
                    const ts = Date.parse(data.timestamp);
                    latestTs = latestTs ? Math.max(latestTs, ts) : ts;
                }
                
                // Supporter 2 formats de données
                if (data.indices) {
                    // Format A: { meta, indices: { a:[...], b:[...] } }
                    Object.values(data.indices).forEach(list => {
                        (list || []).forEach(r => all.push(normalizeRecord(r, region)));
                    });
                } else if (Array.isArray(data.stocks)) {
                    // Format B: { meta, stocks: [...] }
                    data.stocks.forEach(r => all.push(normalizeRecord(r, region)));
                }
            });
            
            // Dédup + tri + dispatch A→Z
            const uniq = dedupByNameTicker(all);
            const indices = {};
            'abcdefghijklmnopqrstuvwxyz'.split('').forEach(l => indices[l] = []);
            
            uniq.forEach(s => {
                const firstChar = (s.name || s.ticker || '').charAt(0).toLowerCase();
                if (indices[firstChar]) {
                    indices[firstChar].push(s);
                }
            });
            
            // Trier chaque lettre par nom
            Object.keys(indices).forEach(l => {
                indices[l].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            });
            
            // Calculer les statistiques par région
            const stats = {
                total: uniq.length,
                byRegion: {}
            };
            
            regions.forEach(r => {
                stats.byRegion[r] = uniq.filter(s => s.region === r).length;
            });
            
            // Mettre à jour stocksData
            stocksData = {
                indices,
                meta: {
                    source: 'TradePulse',
                    timestamp: latestTs ? new Date(latestTs).toISOString() : new Date().toISOString(),
                    count: stats.total,
                    isStale: false,
                    stats // Ajout des statistiques
                }
            };
            
            console.log(`✅ Chargé ${stats.total} actions: ${Object.entries(stats.byRegion).map(([r,c]) => `${r}: ${c}`).join(', ')}`);
            
            // Afficher les statistiques dans l'UI
            const regionBreakdown = document.getElementById('region-breakdown');
            if (regionBreakdown) {
                regionBreakdown.textContent = Object.entries(stats.byRegion)
                    .map(([r, c]) => `${r}: ${c}`)
                    .join(' | ');
            }
            
            // Afficher les données
            renderStocksData();
            lastUpdate = new Date();
            
        } catch (err) {
            console.error('❌ Erreur lors du chargement A→Z régions:', err);
            showElement('indices-error');
            hideElement('indices-loading');
        } finally {
            isLoading = false;
        }
    }
    
    /**
     * Charge les données tops_overview.json
     */
    async function loadTopsOverview() {
      try {
        console.log("🔍 Chargement des données tops_overview.json...");
        const response = await fetch('data/tops_overview.json');
        
        if (response.ok) {
          topsOverview = await response.json();
          console.log("✅ Données tops_overview chargées avec succès");
          renderTop();
        } else {
          console.warn("⚠️ Fichier tops_overview.json non trouvé");
        }
      } catch (error) {
        console.error('❌ Erreur lors du chargement de tops_overview:', error);
      }
    }
    
    /**
     * Affiche les tops depuis tops_overview.json
     * MODIFIÉ: Passe le trend (up/down) selon le filtre actif
     */
    function renderTop() {
      if (!topsOverview?.sets?.[topScope]) {
        console.warn(`Pas de données pour topScope: ${topScope}`);
        return;
      }
      
      const set = topsOverview.sets[topScope];
      
      // Mise à jour des 4 sections basées sur les filtres actifs
      const container = document.getElementById('top-global-container');
      if (!container) return;
      
      // Déterminer quelle vue afficher basée sur les filtres de la nouvelle barre
      const directionUp = document.querySelector('.pill[data-dir="up"][aria-selected="true"]');
      const timeframeDaily = document.querySelector('.pill[data-frame="daily"][aria-selected="true"]');
      
      let data;
      if (timeframeDaily) {
        data = directionUp ? set.day?.up : set.day?.down;
      } else {
        data = directionUp ? set.ytd?.up : set.ytd?.down;
      }
      
      const valueField = timeframeDaily ? 'change_percent' : 'perf_ytd';
      
      if (data) {
        // Passer le trend (up ou down) selon le filtre actif
        renderTopTenCardsInContainer(
          container, 
          data, 
          valueField, 
          'global',
          { trend: directionUp ? 'up' : 'down' }
        );
      }
    }
    
    /**
     * Render des cartes directement dans un container
     * MODIFIÉ: Accepte opts en paramètre supplémentaire
     */
    function renderTopTenCardsInContainer(containerEl, stocks, valueField, marketSource, opts = {}) {
        if (!containerEl) return;
        // Déléguer à la version robuste de renderTopTenCards avec opts
        renderTopTenCards(containerEl, stocks, valueField, marketSource, opts);
    }
    
    /**
     * Initialise les onglets alphabet
     */
    function initAlphabetTabs() {
        const tabs = document.querySelectorAll('.region-tab');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                // Mettre à jour les onglets actifs
                tabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                // Afficher le contenu correspondant
                const letter = this.getAttribute('data-region');
                const contents = document.querySelectorAll('.region-content');
                
                contents.forEach(content => {
                    content.classList.add('hidden');
                });
                
                document.getElementById(`${letter}-indices`)?.classList.remove('hidden');
            });
        });
    }
    
    /**
     * Initialise les sélecteurs de marché
     */
    function initMarketSelector() {
        const nasdaqButton = document.getElementById('market-nasdaq');
        const stoxxButton = document.getElementById('market-stoxx');
        
        nasdaqButton?.addEventListener('click', function() {
            if (currentMarket !== 'nasdaq') {
                // Mettre à jour l'état
                currentMarket = 'nasdaq';
                currentPage = 1;
                
                // Mettre à jour l'interface
                updateMarketUI();
                
                // Charger les données
                loadStocksData(true);
            }
        });
        
        stoxxButton?.addEventListener('click', function() {
            if (currentMarket !== 'stoxx') {
                // Mettre à jour l'état
                currentMarket = 'stoxx';
                currentPage = 1;
                
                // Mettre à jour l'interface
                updateMarketUI();
                
                // Charger les données
                loadStocksData(true);
            }
        });
        
        // Initialiser les onglets du top 10
        const topTabs = document.querySelectorAll('.top-tab-btn');
        if (topTabs) {
            topTabs.forEach(tab => {
                tab.addEventListener('click', function() {
                    // Déterminer si c'est un groupe d'onglets de top global ou marché unique
                    const container = this.closest('.top-stocks-container');
                    if (!container) return;
                    
                    // Sélectionner uniquement les onglets du même groupe
                    const groupTabs = container.querySelectorAll('.top-tab-btn');
                    
                    // Mettre à jour l'état des onglets
                    groupTabs.forEach(t => t.classList.remove('active'));
                    this.classList.add('active');
                    
                    // Afficher le contenu correspondant
                    const index = this.getAttribute('data-index');
                    
                    // Si c'est un onglet du top global, utiliser un sélecteur spécifique
                    if (index.startsWith('global-')) {
                        const containers = document.querySelectorAll('#top-global-gainers, #top-global-losers, #top-global-ytd-gainers, #top-global-ytd-losers');
                        containers.forEach(content => {
                            content.classList.add('hidden');
                        });
                    } else {
                        // Pour les tops par marché
                        const containers = container.querySelectorAll('.top-stocks-content');
                        containers.forEach(content => {
                            content.classList.add('hidden');
                        });
                    }
                    
                    document.getElementById(`top-${index}`)?.classList.remove('hidden');
                });
            });
        }
    }
    
    /**
     * Initialise les boutons de pagination
     */
    function initPagination() {
        const prevButton = document.getElementById('prev-page');
        const nextButton = document.getElementById('next-page');
        
        prevButton?.addEventListener('click', function() {
            if (currentPage > 1) {
                currentPage--;
                updatePaginationUI();
                loadStocksData(true);
            }
        });
        
        nextButton?.addEventListener('click', function() {
            if (currentPage < totalPages) {
                currentPage++;
                updatePaginationUI();
                loadStocksData(true);
            }
        });
    }
    
    /**
     * Met à jour l'interface en fonction du marché sélectionné
     */
    function updateMarketUI() {
        // Mettre à jour les boutons de marché
        const nasdaqButton = document.getElementById('market-nasdaq');
        const stoxxButton = document.getElementById('market-stoxx');
        
        if (nasdaqButton && stoxxButton) {
            nasdaqButton.classList.toggle('active', currentMarket === 'nasdaq');
            stoxxButton.classList.toggle('active', currentMarket === 'stoxx');
        }
        
        // Mettre à jour le titre de la page
        const titleElement = document.getElementById('market-title');
        if (titleElement) {
            titleElement.textContent = currentMarket === 'nasdaq' 
                ? 'Actions NASDAQ Composite (États-Unis)' 
                : 'Actions DJ STOXX 600 (Europe)';
        }
        
        // Mettre à jour le lien source
        const sourceLink = document.getElementById('source-link');
        if (sourceLink) {
            const link = currentMarket === 'nasdaq'
                ? 'https://www.boursorama.com/bourse/actions/cotations/international/?international_quotation_az_filter%5Bcountry%5D=1&international_quotation_az_filter%5Bmarket%5D=%24COMPX'
                : 'https://www.boursorama.com/bourse/actions/cotations/international/?international_quotation_az_filter%5Bcountry%5D=EU&international_quotation_az_filter%5Bmarket%5D=2cSXXP';
            
            sourceLink.innerHTML = `Sources: <a href="${link}" target="_blank" class="text-green-400 hover:underline">Boursorama</a>`;
        }
        
        // Afficher/masquer la pagination selon le marché
        const paginationContainer = document.getElementById('pagination-container');
        if (paginationContainer) {
            if (currentMarket === 'stoxx') {
                paginationContainer.classList.remove('hidden');
                updatePaginationUI();
            } else {
                paginationContainer.classList.add('hidden');
            }
        }
    }
    
    /**
     * Met à jour l'interface de pagination
     */
    function updatePaginationUI() {
        const currentPageElement = document.getElementById('current-page');
        const totalPagesElement = document.getElementById('total-pages');
        const prevButton = document.getElementById('prev-page');
        const nextButton = document.getElementById('next-page');
        
        if (currentPageElement) {
            currentPageElement.textContent = currentPage.toString();
        }
        
        if (totalPagesElement) {
            totalPagesElement.textContent = totalPages.toString();
        }
        
        if (prevButton) {
            prevButton.disabled = currentPage <= 1;
        }
        
        if (nextButton) {
            nextButton.disabled = currentPage >= totalPages;
        }
        
        // Ajouter un log de débogage pour la pagination
        console.log(`Pagination mise à jour: Page ${currentPage}/${totalPages}, buttons: prev=${!prevButton?.disabled}, next=${!nextButton?.disabled}`);
    }
    
    /**
     * Charge les données d'actions depuis le fichier JSON approprié (pour les tops NASDAQ/STOXX)
     */
    async function loadStocksData(forceRefresh = false) {
        // Cette fonction reste pour charger les tops performers NASDAQ/STOXX
        // Les données A→Z sont maintenant chargées par loadAZDataForCurrentSelection
        
        try {
            // Charger les top performers spécifiques au marché sélectionné
            const topPerformersUrl = currentMarket === 'nasdaq' 
                ? 'data/top_nasdaq_performers.json' 
                : 'data/top_stoxx_performers.json';
            
            const cacheBuster = forceRefresh ? `?t=${Date.now()}` : '';
            
            console.log(`🔍 Chargement des top performers depuis ${topPerformersUrl}${cacheBuster}`);
            const topResponse = await fetch(`${topPerformersUrl}${cacheBuster}`);
            
            if (topResponse.ok) {
                const topData = await topResponse.json();
                const topPerformers = {
                    daily: topData.daily || {},
                    ytd: topData.ytd || {}
                };
                console.log(`✅ Top performers de ${currentMarket.toUpperCase()} chargés avec succès`);
                
                // Utiliser la fonction améliorée si disponible
                const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
                
                if (topPerformers.daily) {
                    topPerformers.daily.best = dedupFunction(topPerformers.daily.best || []);
                    topPerformers.daily.worst = dedupFunction(topPerformers.daily.worst || []);
                    
                    // Filtrer les variations extrêmes
                    topPerformers.daily.best = filterExtremeVariations(topPerformers.daily.best, 'change', true);
                    topPerformers.daily.worst = filterExtremeVariations(topPerformers.daily.worst, 'change', false);
                }
                
                if (topPerformers.ytd) {
                    topPerformers.ytd.best = dedupFunction(topPerformers.ytd.best || []);
                    topPerformers.ytd.worst = dedupFunction(topPerformers.ytd.worst || []);
                    
                    // Filtrer les variations extrêmes
                    topPerformers.ytd.best = filterExtremeVariations(topPerformers.ytd.best, 'ytd', true);
                    topPerformers.ytd.worst = filterExtremeVariations(topPerformers.ytd.worst, 'ytd', false);
                }
                
                // Mettre à jour le top 10 du marché sélectionné
                updateTopTenStocks({
                    top_performers: topPerformers,
                    meta: { timestamp: new Date().toISOString() }
                });
            } else {
                console.warn(`⚠️ Impossible de charger les top performers depuis ${topPerformersUrl}`);
            }
        } catch (error) {
            console.error('❌ Erreur lors du chargement des top performers:', error);
        }
    }
    
    /**
     * Filtre les variations extrêmes (>=+100% ou <=-100%)
     * @param {Array} stocks 
     * @param {string} field Le champ contenant la variation ('change' ou 'ytd')
     * @param {boolean} isGainer Si true, filtre les hausses extrêmes, sinon les baisses extrêmes
     * @returns {Array} Liste filtrée
     */
    function filterExtremeVariations(stocks, field, isGainer) {
        if (!stocks || !Array.isArray(stocks)) return [];
        
        return stocks.filter(stock => {
            const variationValue = parsePercentage(stock[field]);
            
            if (isGainer) {
                // Pour les hausses, exclure les valeurs >= 100%
                return variationValue < 100;
            } else {
                // Pour les baisses, exclure les valeurs <= -100%
                return variationValue > -100;
            }
        });
    }
    
    /**
     * Déduplique les actions en utilisant uniquement le nom
     * @param {Array} stocks 
     * @returns {Array} stocks dédupliqués
     */
    function dedupStocksByName(stocks) {
        if (!stocks || !Array.isArray(stocks)) return [];
        
        // Utiliser une Map pour garantir l'unicité par nom
        const uniqueStocks = new Map();
        
        stocks.forEach(stock => {
            // Utiliser uniquement le nom comme clé
            const name = stock.name || "";
            
            // Ne l'ajouter que s'il n'existe pas déjà
            if (!uniqueStocks.has(name)) {
                uniqueStocks.set(name, stock);
            }
        });
        
        // Convertir la Map en tableau et retourner
        return Array.from(uniqueStocks.values());
    }
    
    /**
     * S'assure qu'une liste contient au moins 10 éléments
     * en complétant avec des placeholders si nécessaire
     * @param {Array} stocks 
     * @param {string} market Le marché (nasdaq ou stoxx)
     * @param {boolean} isGainer Si true, tendance positive, sinon négative
     */
    function ensureAtLeastTenItems(stocks, market = 'nasdaq', isGainer = true) {
        // Si la liste a déjà 10 éléments ou plus, ne rien faire
        if (stocks.length >= 10) return;
        
        // Utiliser la fonction améliorée si disponible
        if (window.dedupFix?.generatePlaceholder) {
            const marketName = market.toUpperCase();
            
            // Générer des placeholders pour compléter jusqu'à 10
            const missingCount = 10 - stocks.length;
            for (let i = 0; i < missingCount; i++) {
                stocks.push(window.dedupFix.generatePlaceholder(stocks.length + 1, marketName, isGainer));
            }
            return;
        }
        
        // Fallback - Générer des placeholders pour compléter jusqu'à 10
        const missingCount = 10 - stocks.length;
        for (let i = 0; i < missingCount; i++) {
            stocks.push({
                name: `Stock ${stocks.length + 1}`,
                symbol: "",
                last: "-",
                change: isGainer ? "+0.00%" : "-0.00%",
                open: "-",
                high: "-",
                low: "-",
                ytd: isGainer ? "+0.00%" : "-0.00%",
                volume: "0",
                trend: isGainer ? "neutral" : "neutral",
                market: market.toUpperCase(),
                marketIcon: market === 'nasdaq' 
                    ? '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
                    : '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            });
        }
    }
    
    /**
     * Déduplique les actions en utilisant le nom et le symbole
     */
    function dedupStocks(stocks) {
        if (!stocks || !Array.isArray(stocks)) return [];
        
        // Déléguer à la fonction dedupStocksByName
        return dedupStocksByName(stocks);
    }
    
    /**
     * Déduplique les actions de manière plus approfondie en utilisant tous les attributs
     */
    function dedupStocksThoroughly(stocks) {
        if (!stocks || !Array.isArray(stocks)) return [];
        
        // Déléguer à la fonction dedupStocksByName
        return dedupStocksByName(stocks);
    }
    
    /**
     * Charge les données pour le Top 10 global
     * PATCH 3: Correction de la variable response -> globalResponse
     */
    async function loadGlobalData() {
        try {
            // MODIFICATION: Toujours charger directement le fichier global_top_performers.json
            console.log("🔍 Chargement des données du top 10 global...");
            const globalResponse = await fetch('data/global_top_performers.json');
            
            if (globalResponse.ok) {
                const globalData = await globalResponse.json(); // FIX: globalResponse au lieu de response
                console.log("✅ Données du top 10 global chargées avec succès");
                
                // Déduplication des données globales
                // Utiliser la fonction améliorée si disponible
                const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
                
                if (globalData.daily) {
                    globalData.daily.best = dedupFunction(globalData.daily.best || []);
                    globalData.daily.worst = dedupFunction(globalData.daily.worst || []);
                    
                    // Filtrer les variations extrêmes
                    globalData.daily.best = filterExtremeVariations(globalData.daily.best, 'change', true);
                    globalData.daily.worst = filterExtremeVariations(globalData.daily.worst, 'change', false);
                }
                
                if (globalData.ytd) {
                    globalData.ytd.best = dedupFunction(globalData.ytd.best || []);
                    globalData.ytd.worst = dedupFunction(globalData.ytd.worst || []);
                    
                    // Filtrer les variations extrêmes
                    globalData.ytd.best = filterExtremeVariations(globalData.ytd.best, 'ytd', true);
                    globalData.ytd.worst = filterExtremeVariations(globalData.ytd.worst, 'ytd', false);
                }
                
                updateGlobalTopTen(globalData);
                return;
            }
        } catch (error) {
            console.error('❌ Erreur lors du chargement des données globales:', error);
        }
    }
    
    /**
     * Toggle les détails d'une action
     */
    function toggleDetailsRow(button) {
        const stockKey = button.dataset.key;
        const detailsRow = document.querySelector(`.details-row[data-for="${CSS.escape(stockKey)}"]`);
        
        if (detailsRow) {
            const isHidden = detailsRow.classList.contains('hidden');
            detailsRow.classList.toggle('hidden');
            
            // Mettre à jour l'icône du bouton
            const icon = button.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-chevron-down', !isHidden);
                icon.classList.toggle('fa-chevron-up', isHidden);
            }
            
            // Mettre à jour le texte du bouton si texte visible
            if (button.textContent.includes('Détails') || button.textContent.includes('Masquer')) {
                button.textContent = isHidden ? 'Masquer ▴' : 'Détails ▾';
            }
        }
    }
    
    /**
     * Affiche les données d'actions dans l'interface
     */
    function renderStocksData() {
        try {
            // Mettre à jour l'horodatage
            const timestamp = new Date(stocksData.meta.timestamp);
            
            // Ajuster l'heure pour le fuseau horaire français (UTC+1)
            timestamp.setHours(timestamp.getHours() + 1);
            
            let formattedDate = timestamp.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            // Ajouter un indicateur si les données sont périmées
            if (stocksData.meta.isStale) {
                formattedDate += ' (anciennes données)';
            }
            
            document.getElementById('last-update-time').textContent = formattedDate;
            
            // Mettre à jour le titre de la page
            document.getElementById('stocks-count').textContent = stocksData.meta.count || 0;
            
            // Générer le HTML pour chaque lettre
            const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
            
            alphabet.forEach(letter => {
                const stocks = stocksData.indices[letter] || [];
                const tableBody = document.getElementById(`${letter}-indices-body`);
                
                if (tableBody) {
                    // Vider le corps du tableau
                    tableBody.innerHTML = '';
                    
                    // Si pas d'actions, afficher un message
                    if (stocks.length === 0) {
                        const emptyRow = document.createElement('tr');
                        emptyRow.innerHTML = `
                            <td colspan="9" class="text-center py-4 text-gray-400">
                                <i class="fas fa-info-circle mr-2"></i>
                                Aucune action disponible pour cette lettre
                            </td>
                        `;
                        tableBody.appendChild(emptyRow);
                    } else {
                        // Dédupliquer les stocks par nom plutôt que par tous les attributs
                        const uniqueStocks = dedupStocksByName(stocks);
                        
                        // Trier les actions par nom
                        const sortedStocks = [...uniqueStocks].sort((a, b) => {
                            return (a.name || "").localeCompare(b.name || "");
                        });
                        
                        // Remplir avec les données
                        sortedStocks.forEach(stock => {
                            const stockKey = `${stock.name||''}|${stock.ticker||''}`;
                            
                            // Ligne principale avec colonnes directement visibles
                            const row = document.createElement('tr');
                            row.setAttribute('data-region', stock.region);
                            row.className = 'border-b border-white/5 hover:bg-white/5 transition-colors';
                            
                            const changeClass = stock.change && stock.change.includes('-') ? 'negative' : 'positive';
                            const ytdClass = stock.ytd && stock.ytd.includes('-') ? 'negative' : 'positive';
                            const perf1yClass = stock.perf_1y && stock.perf_1y.includes('-') ? 'negative' : 'positive';
                            
                            row.innerHTML = `
                                <td class="py-2 px-3">
                                    <div class="font-medium">${stock.name || '-'} ${stock.marketIcon}</div>
                                    <div class="text-xs opacity-70 mt-1">
                                        <span class="px-2 py-0.5 rounded border border-white/10 mr-1 ${stock.regionBadgeClass}">${stock.region || 'GLOBAL'}</span>
                                        ${stock.country || ''}
                                        ${stock.exchange ? `<span class="ml-1 px-2 py-0.5 rounded border border-white/10">${stock.exchange}</span>` : ''}
                                    </div>
                                </td>
                                <td class="text-right">${stock.last || '-'}</td>
                                <td class="text-right ${changeClass}">${stock.change || '-'}</td>
                                <td class="text-right ${ytdClass}">${stock.ytd || '-'}</td>
                                <td class="text-right ${perf1yClass}">${stock.perf_1y || '-'}</td>
                                <td class="text-right">${stock.volatility_3y || '-'}</td>
                                <td class="text-right">${stock.dividend_yield || '-'}</td>
                                <td class="text-right">${stock.volume || '-'}</td>
                                <td class="text-center">
                                    <button onclick="toggleDetailsRow(this)" class="action-button details-toggle" data-key="${stockKey}">
                                        <i class="fas fa-chevron-down"></i>
                                    </button>
                                </td>
                            `;
                            
                            // Ligne de détails (cachée par défaut)
                            const detailsRow = document.createElement('tr');
                            detailsRow.className = 'details-row hidden';
                            detailsRow.setAttribute('data-for', stockKey);
                            detailsRow.innerHTML = `
                                <td colspan="9" style="background:rgba(0,255,135,0.02); border-top: 1px solid var(--card-border);">
                                    <div class="grid md:grid-cols-3 gap-6 p-4">
                                        <div>
                                            <div class="text-xs opacity-60 mb-2 uppercase tracking-wider">Informations</div>
                                            <div class="space-y-1 text-sm">
                                                <div><span class="opacity-60">Ticker:</span> <strong>${stock.ticker||'–'}</strong></div>
                                                <div><span class="opacity-60">Secteur:</span> ${stock.sector||'–'}</div>
                                                <div><span class="opacity-60">Source:</span> ${stock.data_exchange||'–'}</div>
                                                <div><span class="opacity-60">Cap. Marché:</span> ${stock.market_cap||'–'}</div>
                                            </div>
                                        </div>
                                        <div>
                                            <div class="text-xs opacity-60 mb-2 uppercase tracking-wider">Performances</div>
                                            <div class="space-y-1 text-sm">
                                                <div><span class="opacity-60">1 mois:</span> <span class="${stock.perf_1m && stock.perf_1m.includes('-') ? 'negative' : 'positive'}">${stock.perf_1m||'–'}</span></div>
                                                <div><span class="opacity-60">3 mois:</span> <span class="${stock.perf_3m && stock.perf_3m.includes('-') ? 'negative' : 'positive'}">${stock.perf_3m||'–'}</span></div>
                                                <div><span class="opacity-60">1 an:</span> <span class="${perf1yClass}">${stock.perf_1y||'–'}</span></div>
                                                <div><span class="opacity-60">3 ans:</span> <span class="${stock.perf_3y && stock.perf_3y.includes('-') ? 'negative' : 'positive'}">${stock.perf_3y||'–'}</span></div>
                                                <div><span class="opacity-60">YTD:</span> <span class="${ytdClass}">${stock.ytd||'–'}</span></div>
                                            </div>
                                        </div>
                                        <div>
                                            <div class="text-xs opacity-60 mb-2 uppercase tracking-wider">Métriques</div>
                                            <div class="space-y-1 text-sm">
                                                <div><span class="opacity-60">Volatilité 3Y:</span> ${stock.volatility_3y || '–'}</div>
                                                <div><span class="opacity-60">Rendement:</span> ${stock.dividend_yield || '–'}</div>
                                                <div><span class="opacity-60">52 semaines:</span> ${stock.range_52w || '–'}</div>
                                                <div><span class="opacity-60">Max Drawdown 3Y:</span> <span class="negative">${stock.max_drawdown_3y || '–'}</span></div>
                                                <div><span class="opacity-60">Volume:</span> ${stock.volume || '–'}</div>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                            `;
                            
                            tableBody.appendChild(row);
                            tableBody.appendChild(detailsRow);
                        });
                    }
                }
            });
            
            // Mettre à jour les top performers
            if (stocksData.top_performers) {
                updateTopPerformers(stocksData.top_performers);
            }
            
            // Masquer le loader et afficher les données
            hideElement('indices-loading');
            hideElement('indices-error');
            showElement('indices-container');
            
            // Réassigner la fonction toggle au window pour permettre l'accès global
            window.toggleDetailsRow = toggleDetailsRow;
            
        } catch (error) {
            console.error('❌ Erreur lors de l\'affichage des données:', error);
            hideElement('indices-loading');
            showElement('indices-error');
        }
    }
    
    /**
     * Met à jour le top 10 des actions
     * MODIFIÉ: Passe trend aux appels renderTopTenCards
     */
    function updateTopTenStocks(data) {
        // Vérifier d'abord si les données et top_performers existent
        if (!data || !data.top_performers) {
            console.error("❌ Données top performers manquantes");
            return;
        }
        
        const topPerformers = data.top_performers;
        
        // Mise à jour du top 10 Hausse quotidienne
        if (topPerformers.daily && topPerformers.daily.best) {
            // Déduplication par nom et ajout des attributs de marché
            const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
            const uniqueBest = dedupFunction(topPerformers.daily.best).map(stock => ({
                ...stock,
                market: currentMarket.toUpperCase(),
                marketIcon: currentMarket === 'nasdaq' 
                    ? '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
                    : '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            }));
            
            // Filtrer les variations extrêmes
            const filteredBest = filterExtremeVariations(uniqueBest, 'change', true);
            
            // S'assurer d'avoir 10 éléments
            const displayStocks = filteredBest.slice(0, 10);
            ensureAtLeastTenItems(displayStocks, currentMarket, true);
            
            renderTopTenCards('top-daily-gainers', displayStocks, 'change', currentMarket, {trend: 'up'});
        }
        
        // Mise à jour du top 10 Baisse quotidienne
        if (topPerformers.daily && topPerformers.daily.worst) {
            // Déduplication par nom et ajout des attributs de marché
            const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
            const uniqueWorst = dedupFunction(topPerformers.daily.worst).map(stock => ({
                ...stock,
                market: currentMarket.toUpperCase(),
                marketIcon: currentMarket === 'nasdaq' 
                    ? '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
                    : '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            }));
            
            // Filtrer les variations extrêmes
            const filteredWorst = filterExtremeVariations(uniqueWorst, 'change', false);
            
            // S'assurer d'avoir 10 éléments
            const displayStocks = filteredWorst.slice(0, 10);
            ensureAtLeastTenItems(displayStocks, currentMarket, false);
            
            renderTopTenCards('top-daily-losers', displayStocks, 'change', currentMarket, {trend: 'down'});
        }
        
        // Mise à jour du top 10 Hausse YTD
        if (topPerformers.ytd && topPerformers.ytd.best) {
            // Déduplication par nom et ajout des attributs de marché
            const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
            const uniqueBestYtd = dedupFunction(topPerformers.ytd.best).map(stock => ({
                ...stock,
                market: currentMarket.toUpperCase(),
                marketIcon: currentMarket === 'nasdaq' 
                    ? '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
                    : '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            }));
            
            // Filtrer les variations extrêmes
            const filteredBestYtd = filterExtremeVariations(uniqueBestYtd, 'ytd', true);
            
            // S'assurer d'avoir 10 éléments
            const displayStocks = filteredBestYtd.slice(0, 10);
            ensureAtLeastTenItems(displayStocks, currentMarket, true);
            
            renderTopTenCards('top-ytd-gainers', displayStocks, 'ytd', currentMarket, {trend: 'up'});
        }
        
        // Mise à jour du top 10 Baisse YTD
        if (topPerformers.ytd && topPerformers.ytd.worst) {
            // Déduplication par nom et ajout des attributs de marché
            const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
            const uniqueWorstYtd = dedupFunction(topPerformers.ytd.worst).map(stock => ({
                ...stock,
                market: currentMarket.toUpperCase(),
                marketIcon: currentMarket === 'nasdaq' 
                    ? '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
                    : '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            }));
            
            // Filtrer les variations extrêmes
            const filteredWorstYtd = filterExtremeVariations(uniqueWorstYtd, 'ytd', false);
            
            // S'assurer d'avoir 10 éléments
            const displayStocks = filteredWorstYtd.slice(0, 10);
            ensureAtLeastTenItems(displayStocks, currentMarket, false);
            
            renderTopTenCards('top-ytd-losers', displayStocks, 'ytd', currentMarket, {trend: 'down'});
        }
    }
    
    /**
     * Met à jour le top 10 global directement à partir des données pré-combinées
     * MODIFIÉ: Passe trend aux appels renderTopTenCards
     */
    function updateGlobalTopTen(globalData = null) {
        // Si nous avons des données globales pré-combinées, les utiliser directement
        if (globalData && globalData.daily && globalData.ytd) {
            console.log("✅ Utilisation des données globales pré-combinées");
            
            const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
            
            if (globalData.daily && globalData.daily.best) {
                const uniqueGainers = dedupFunction(globalData.daily.best);
                // Filtrer les variations extrêmes
                const filteredGainers = filterExtremeVariations(uniqueGainers, 'change', true);
                renderTopTenCards('top-global-gainers', filteredGainers, 'change', 'global', {trend: 'up'});
            }
            
            if (globalData.daily && globalData.daily.worst) {
                const uniqueLosers = dedupFunction(globalData.daily.worst);
                // Filtrer les variations extrêmes
                const filteredLosers = filterExtremeVariations(uniqueLosers, 'change', false);
                renderTopTenCards('top-global-losers', filteredLosers, 'change', 'global', {trend: 'down'});
            }
            
            if (globalData.ytd && globalData.ytd.best) {
                const uniqueYtdGainers = dedupFunction(globalData.ytd.best);
                // Filtrer les variations extrêmes
                const filteredYtdGainers = filterExtremeVariations(uniqueYtdGainers, 'ytd', true);
                renderTopTenCards('top-global-ytd-gainers', filteredYtdGainers, 'ytd', 'global', {trend: 'up'});
            }
            
            if (globalData.ytd && globalData.ytd.worst) {
                const uniqueYtdLosers = dedupFunction(globalData.ytd.worst);
                // Filtrer les variations extrêmes
                const filteredYtdLosers = filterExtremeVariations(uniqueYtdLosers, 'ytd', false);
                renderTopTenCards('top-global-ytd-losers', filteredYtdLosers, 'ytd', 'global', {trend: 'down'});
            }
            
            return;
        }
    }
    
    /**
     * Convertit le volume en nombre pour le tri
     */
    function parseVolumeToNumber(volumeStr) {
        if (!volumeStr || volumeStr === '-') return 0;
        
        // Supprimer les espaces, les points et les virgules pour normaliser
        const cleanedStr = volumeStr.replace(/\s+/g, '').replace(/\./g, '').replace(/,/g, '');
        
        // Extraire les chiffres
        const matches = cleanedStr.match(/(\d+)/);
        if (matches && matches[1]) {
            return parseInt(matches[1], 10);
        }
        
        return 0;
    }
    
    /**
     * Fonction améliorée pour afficher les cartes du top 10 avec un meilleur design
     * MODIFIÉ: Accepte opts pour gérer le trend (up/down) et forcer le signe/couleur
     */
    function renderTopTenCards(target, stocks, valueField, marketSource, opts = {}) {
        // target peut être un ID ou un Element
        let root = null;
        if (typeof target === 'string') {
            root = document.getElementById(target) || document.querySelector(target);
        } else {
            root = target;
        }
        if (!root) return;
        
        // Si on a un wrapper, prendre son .stock-cards-container ; sinon utiliser root
        let container = root.querySelector?.('.stock-cards-container') || root;
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Si pas de données, afficher un message
        if (!stocks || stocks.length === 0) {
            container.innerHTML = `
                <div class="flex justify-center items-center py-4 text-gray-400">
                    <i class="fas fa-info-circle mr-2"></i>
                    Aucune donnée disponible
                </div>
            `;
            return;
        }
        
        // Assurer la déduplication absolue des stocks par nom
        const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
        const uniqueStocks = dedupFunction(stocks);
        
        // Créer les cartes pour chaque action (jusqu'à 10)
        const displayStocks = uniqueStocks.slice(0, 10);
        
        // Assurer qu'il y a 10 éléments
        ensureAtLeastTenItems(displayStocks, marketSource === 'global' ? 'mixed' : marketSource, valueField === 'ytd' || valueField === 'perf_ytd');
        
        displayStocks.forEach((stock, index) => {
            // Déterminer le signe et la classe pour la valeur
            let value = stock[valueField] || stock.change || stock.ytd || '-';
            // Gérer les deux formats de champ
            if (valueField === 'change_percent' && !stock.change_percent && stock.change) {
                value = stock.change;
            }
            if (valueField === 'perf_ytd' && !stock.perf_ytd && stock.ytd) {
                value = stock.ytd;
            }
            
            // Convertir en string si c'est un nombre
            let text = typeof value === 'number' ? value.toFixed(2) + '%' : String(value);
            
            // Déterminer la classe de couleur
            let valueClass = /-/.test(text) ? 'negative' : 'positive';
            
            // NOUVEAU: Forcer le signe/couleur selon le filtre (up/down)
            if (opts.trend === 'down' && !/-/.test(text)) {
                // Si on affiche des baisses mais que la valeur n'a pas de signe négatif
                valueClass = 'negative';
                text = text.replace(/^\+?/, '-'); // Forcer le signe -
            } else if (opts.trend === 'up' && /^-/.test(text)) {
                // Si on affiche des hausses mais que la valeur a un signe négatif
                valueClass = 'positive';
                text = text.replace(/^-/, '+'); // Forcer le signe +
            } else if (opts.trend === 'up' && !text.startsWith('+') && !text.startsWith('-') && text !== '-') {
                // Ajouter le + si manquant pour les hausses
                text = '+' + text;
            }
            
            // Déterminer l'icône du marché et tag d'exchange pour l'Asie
            let marketIcon = stock.marketIcon || '';
            const exTag = stock.exchange && ['HK', 'TW', 'KR', 'IN', 'JP', 'SG'].includes(stock.exchange) 
                ? `<span class="ml-1 text-xs opacity-60">${stock.exchange}</span>` 
                : '';
            
            // Ajouter une animation subtile pour les 3 premiers
            let specialClass = '';
            let glowEffect = '';
            
            if (index < 3) {
                specialClass = 'top-performer';
                glowEffect = index === 0 ? 'glow-gold' : index === 1 ? 'glow-silver' : 'glow-bronze';
            }
            
            // Personnaliser le design en fonction du rang
            let rankStyle = '';
            let rankBg = '';
            
            if (index === 0) {
                rankBg = 'bg-amber-500'; // Or
                rankStyle = 'text-white';
            } else if (index === 1) {
                rankBg = 'bg-gray-300'; // Argent
                rankStyle = 'text-gray-800';
            } else if (index === 2) {
                rankBg = 'bg-amber-700'; // Bronze
                rankStyle = 'text-white';
            }
            
            // Créer la carte
            const card = document.createElement('div');
            card.className = 'stock-card';
            
            // Utiliser ticker si disponible, sinon symbole extrait du nom
            const ticker = stock.ticker || stock.symbol || stock.name?.split(' ')[0] || '-';
            
            card.innerHTML = `
                <div class="rank ${rankBg} ${rankStyle} ${glowEffect}">#${index + 1}</div>
                <div class="stock-info ${specialClass}">
                    <div class="stock-name">${ticker} ${marketIcon} ${exTag}</div>
                    <div class="stock-fullname" title="${stock.name || ''}">${stock.name || '-'}</div>
                </div>
                <div class="stock-performance ${valueClass}">
                    ${text}
                    ${index < 3 ? '<div class="trend-arrow"></div>' : ''}
                </div>
            `;
            
            container.appendChild(card);
        });
    }
    
    /**
     * Met à jour les top performers
     */
    function updateTopPerformers(topPerformersData) {
        if (!topPerformersData) return;
        
        // Mettre à jour les top/bottom performers journaliers
        if (topPerformersData.daily) {
            const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
            const uniqueBest = dedupFunction(topPerformersData.daily.best || []);
            const uniqueWorst = dedupFunction(topPerformersData.daily.worst || []);
            
            // Filtrer les variations extrêmes
            const filteredBest = filterExtremeVariations(uniqueBest, 'change', true);
            const filteredWorst = filterExtremeVariations(uniqueWorst, 'change', false);
            
            updateTopPerformersHTML('daily-top', filteredBest, 'change');
            updateTopPerformersHTML('daily-bottom', filteredWorst, 'change');
        }
        
        // Mettre à jour les top/bottom performers YTD
        if (topPerformersData.ytd) {
            const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
            const uniqueBestYtd = dedupFunction(topPerformersData.ytd.best || []);
            const uniqueWorstYtd = dedupFunction(topPerformersData.ytd.worst || []);
            
            // Filtrer les variations extrêmes
            const filteredBestYtd = filterExtremeVariations(uniqueBestYtd, 'ytd', true);
            const filteredWorstYtd = filterExtremeVariations(uniqueWorstYtd, 'ytd', false);
            
            updateTopPerformersHTML('ytd-top', filteredBestYtd, 'ytd');
            updateTopPerformersHTML('ytd-bottom', filteredWorstYtd, 'ytd');
        }
    }
    
    /**
     * Met à jour le HTML pour une section de top performers
     */
    function updateTopPerformersHTML(containerId, stocks, valueField) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Si pas de données, afficher un message
        if (!stocks || stocks.length === 0) {
            container.innerHTML = `
                <div class="flex justify-center items-center py-4 text-gray-400">
                    <i class="fas fa-info-circle mr-2"></i>
                    Aucune donnée disponible
                </div>
            `;
            return;
        }
        
        // Déduplication absolue des stocks par nom
        const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
        const uniqueStocks = dedupFunction(stocks);
        
        // Générer le HTML pour chaque action
        uniqueStocks.forEach((stock, i) => {
            const row = document.createElement('div');
            row.className = 'performer-row';
            
            const valueClass = (stock[valueField] || "").includes('-') ? 'negative' : 'positive';
            
            row.innerHTML = `
                <div class="performer-info">
                    <div class="performer-index">${stock.name || ""}</div>
                    <div class="performer-country">${stock.symbol || ""}</div>
                </div>
                <div class="performer-value ${valueClass}">
                    ${stock[valueField] || "-"}
                </div>
            `;
            
            container.appendChild(row);
        });
    }

    /**
     * Initialise la fonctionnalité de recherche
     */
    function initSearchFunctionality() {
        // Éléments du DOM
        const searchInput = document.getElementById('stock-search');
        const clearButton = document.getElementById('clear-search');
        const searchInfo = document.getElementById('search-info');
        const searchCount = document.getElementById('search-count');
        const alphabetTabs = document.querySelectorAll('.region-tab');
        
        if (!searchInput || !clearButton) return;
        
        // Ajouter un onglet "Tous" au début des filtres alphabétiques si nécessaire
        const tabsContainer = document.querySelector('.region-tabs');
        if (tabsContainer && !document.querySelector('.region-tab[data-region="all"]')) {
            const allTab = document.createElement('div');
            allTab.className = 'region-tab all-results';
            allTab.setAttribute('data-region', 'all');
            allTab.textContent = 'TOUS';
            
            // Insérer au début
            tabsContainer.insertBefore(allTab, tabsContainer.firstChild);
            
            // Ajouter l'événement de clic
            allTab.addEventListener('click', function() {
                // Réinitialiser la recherche si active
                if (searchInput.value.trim() !== '') {
                    searchInput.value = '';
                    clearSearch();
                }
                
                // Mettre à jour les onglets actifs
                alphabetTabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                // Afficher toutes les actions (en respectant la pagination)
                showAllStocks();
            });
        }
        
        // Fonction pour montrer toutes les actions (si possible)
        function showAllStocks() {
            // Si la pagination est active (STOXX), on ne peut pas tout montrer
            if (currentMarket === 'stoxx') {
                // Afficher une notification
                showNotification('La vue "TOUS" n\'est pas disponible pour ce marché en raison de la pagination.', 'warning');
                return;
            }
            
            // Afficher toutes les régions
            const regionContents = document.querySelectorAll('.region-content');
            regionContents.forEach(content => {
                content.classList.remove('hidden');
            });
            
            // Rendre visibles toutes les lignes qui étaient cachées par la recherche
            const allRows = document.querySelectorAll('table tbody tr');
            allRows.forEach(row => {
                row.classList.remove('hidden', 'search-highlight');
                row.style.display = '';
            });
        }
        
        // Recherche en temps réel
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.trim().toLowerCase();
            
            // Afficher/masquer le bouton d'effacement
            clearButton.style.opacity = searchTerm ? '1' : '0';
            
            // Effectuer la recherche
            if (searchTerm) {
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
        });
        
        // Fonction pour effectuer la recherche
        function performSearch(searchTerm) {
            let totalResults = 0;
            let foundInRegions = new Set();
            
            // Sélectionner l'onglet "Tous" si présent
            const allTab = document.querySelector('.region-tab[data-region="all"]');
            if (allTab) {
                alphabetTabs.forEach(tab => tab.classList.remove('active'));
                allTab.classList.add('active');
            }
            
            // Parcourir toutes les régions et rechercher dans chaque tableau
            const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
            
            alphabet.forEach(letter => {
                const tableBody = document.getElementById(`${letter}-indices-body`);
                if (!tableBody) return;
                
                let regionResults = 0;
                const rows = tableBody.querySelectorAll('tr:not(.details-row)');
                
                rows.forEach(row => {
                    // Ne pas rechercher dans les lignes vides ou messages
                    if (row.cells.length <= 1) return;
                    
                    const stockName = row.cells[0].textContent.toLowerCase();
                    
                    if (stockName.includes(searchTerm)) {
                        // Marquer cette ligne comme résultat de recherche
                        row.classList.add('search-highlight');
                        row.classList.remove('hidden');
                        row.style.display = '';
                        regionResults++;
                        totalResults++;
                        foundInRegions.add(letter);
                    } else {
                        // Masquer cette ligne
                        row.classList.remove('search-highlight');
                        row.classList.add('hidden');
                        row.style.display = 'none';
                    }
                });
                
                // Si pas de résultats dans cette région, ajouter un message
                if (regionResults === 0 && rows.length > 0) {
                    // Vérifier si un message existe déjà
                    let noResultsRow = tableBody.querySelector('.no-results-row');
                    if (!noResultsRow) {
                        noResultsRow = document.createElement('tr');
                        noResultsRow.className = 'no-results-row';
                        noResultsRow.innerHTML = `
                            <td colspan="9" class="no-results">
                                <i class="fas fa-search mr-2"></i>
                                Aucun résultat pour "${searchTerm}" dans cette section
                            </td>
                        `;
                        tableBody.appendChild(noResultsRow);
                    }
                } else {
                    // Supprimer les messages existants
                    const noResultsRow = tableBody.querySelector('.no-results-row');
                    if (noResultsRow) {
                        noResultsRow.remove();
                    }
                }
                
                // Afficher/masquer les régions en fonction des résultats
                const regionContent = document.getElementById(`${letter}-indices`);
                if (regionContent) {
                    if (regionResults > 0) {
                        regionContent.classList.remove('hidden');
                    } else {
                        regionContent.classList.add('hidden');
                    }
                }
            });
            
            // Mettre à jour le compteur de résultats
            searchCount.textContent = totalResults;
            searchInfo.classList.remove('hidden');
            
            // Actualiser les étiquettes des onglets
            alphabetTabs.forEach(tab => {
                const region = tab.getAttribute('data-region');
                if (region !== 'all') {
                    if (foundInRegions.has(region)) {
                        tab.classList.add('has-results');
                    } else {
                        tab.classList.remove('has-results');
                    }
                }
            });
            
            // Défiler vers le premier résultat si possible
            if (totalResults > 0) {
                const firstResult = document.querySelector('.search-highlight');
                if (firstResult) {
                    setTimeout(() => {
                        firstResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                }
            }
        }
        
        // Fonction pour effacer la recherche
        function clearSearch() {
            // Réinitialiser le compteur
            searchInfo.classList.add('hidden');
            
            // Restaurer la visibilité normal des contenus
            const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
            
            alphabet.forEach(letter => {
                const tableBody = document.getElementById(`${letter}-indices-body`);
                if (!tableBody) return;
                
                // Supprimer les messages de "pas de résultats"
                const noResultsRow = tableBody.querySelector('.no-results-row');
                if (noResultsRow) {
                    noResultsRow.remove();
                }
                
                // Réinitialiser toutes les lignes
                const rows = tableBody.querySelectorAll('tr');
                rows.forEach(row => {
                    row.classList.remove('search-highlight', 'hidden');
                    row.style.display = '';
                });
            });
            
            // Restaurer l'affichage normal des contenus de région
            // selon l'onglet actif
            const activeTab = document.querySelector('.region-tab.active');
            if (activeTab) {
                const activeRegion = activeTab.getAttribute('data-region');
                
                if (activeRegion === 'all') {
                    // Afficher toutes les régions
                    alphabet.forEach(letter => {
                        const regionContent = document.getElementById(`${letter}-indices`);
                        if (regionContent) {
                            regionContent.classList.remove('hidden');
                        }
                    });
                } else {
                    // Afficher uniquement la région active
                    alphabet.forEach(letter => {
                        const regionContent = document.getElementById(`${letter}-indices`);
                        if (regionContent) {
                            if (letter === activeRegion) {
                                regionContent.classList.remove('hidden');
                            } else {
                                regionContent.classList.add('hidden');
                            }
                        }
                    });
                }
            }
            
            // Masquer le bouton d'effacement
            clearButton.style.opacity = '0';
        }
        
        // Gérer les événements de clic sur les onglets alphabétiques
        alphabetTabs.forEach(tab => {
            tab.addEventListener('click', function() {
                // Si une recherche est active, l'effacer
                if (searchInput.value.trim() !== '') {
                    searchInput.value = '';
                    clearSearch();
                }
            });
        });
        
        // Support pour la touche Echap pour effacer la recherche
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && searchInput.value.trim() !== '') {
                searchInput.value = '';
                clearSearch();
            }
        });
    }
    
    /**
     * Fonctions utilitaires
     */
    function showElement(id) {
        const element = document.getElementById(id);
        if (element) {
            element.classList.remove('hidden');
        }
    }
    
    function hideElement(id) {
        const element = document.getElementById(id);
        if (element) {
            element.classList.add('hidden');
        }
    }
    
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
    
    /**
     * Met à jour l'heure du marché
     */
    function updateMarketTime() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const timeStr = `${hours}:${minutes}:${seconds}`;
        
        const marketTimeElement = document.getElementById('marketTime');
        if (marketTimeElement) {
            marketTimeElement.textContent = timeStr;
        }
    }
    
    /**
     * Gestion du mode sombre/clair
     */
    function initTheme() {
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        const darkIcon = document.getElementById('dark-icon');
        const lightIcon = document.getElementById('light-icon');
        
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.body.classList.remove('dark');
            document.body.classList.add('light');
            document.documentElement.classList.remove('dark');
            darkIcon.style.display = 'none';
            lightIcon.style.display = 'block';
        } else {
            document.body.classList.add('dark');
            document.body.classList.remove('light');
            document.documentElement.classList.add('dark');
            darkIcon.style.display = 'block';
            lightIcon.style.display = 'none';
        }
        
        themeToggleBtn.addEventListener('click', function() {
            document.body.classList.toggle('dark');
            document.body.classList.toggle('light');
            document.documentElement.classList.toggle('dark');
            
            if (document.body.classList.contains('dark')) {
                darkIcon.style.display = 'block';
                lightIcon.style.display = 'none';
                localStorage.setItem('theme', 'dark');
            } else {
                darkIcon.style.display = 'none';
                lightIcon.style.display = 'block';
                localStorage.setItem('theme', 'light');
            }
        });
    }
    
    /**
     * Fonction pour parser un pourcentage en nombre
     */
    function parsePercentage(percentStr) {
        if (!percentStr || percentStr === '-') return 0;
        
        // Remplacer les virgules par des points pour les décimales
        let cleanStr = percentStr.replace(',', '.');
        
        // Supprimer les symboles +, %, etc.
        cleanStr = cleanStr.replace(/[+%]/g, '');
        
        // Gérer les nombres négatifs qui pourraient être entre parenthèses
        if (cleanStr.includes('(') && cleanStr.includes(')')) {
            cleanStr = cleanStr.replace(/[\(\)]/g, '');
            cleanStr = '-' + cleanStr;
        }
        
        // Parser en nombre
        const value = parseFloat(cleanStr);
        return isNaN(value) ? 0 : value;
    }
});
