// Début du fichier liste-script.js modifié
// Les changements principaux sont:
// 1. La section A→Z charge toujours TOUTES les régions (GLOBAL)
// 2. Les filtres du Top 10 n'affectent plus les données A→Z

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
    
    // Variables globales
    let stocksData = {
        indices: {},
        meta: {
            source: 'TradePulse',
            timestamp: null,
            count: 0,
            isStale: false
        }
    };
    
    // État pour le Top 10 (séparé de la section A→Z)
    let topScope = 'GLOBAL';
    let selectedRegions = new Set(['GLOBAL']);
    
    // NOUVEAU: Variable fixe pour la section A→Z (toujours GLOBAL)
    const AZ_SCOPE = 'GLOBAL'; // Toujours charger toutes les régions pour A→Z
    
    // Initialiser les composants
    initAlphabetTabs();
    initMarketSelector();
    initPagination();
    initSearchFunctionality();
    updateMarketTime();
    setInterval(updateMarketTime, 1000);
    initTheme();
    wireScopeButtons();
    
    // Charger les données A→Z avec TOUTES les régions (indépendamment des filtres Top 10)
    loadAZDataForCurrentSelection(false, true); // forceGlobal = true
    
    // Charger les autres données
    loadStocksData();
    loadGlobalData();
    loadTopsOverview();
    
    // Écouter les événements de changement de filtres depuis liste.html
    window.addEventListener('topFiltersChanged', function(event) {
        const detail = event.detail;
        console.log('Filtres changés:', detail);
        
        // Mettre à jour topScope pour le Top 10 UNIQUEMENT
        const regions = detail.regions;
        if (regions.includes('GLOBAL')) {
            topScope = 'GLOBAL';
        } else if (regions.length === 1) {
            topScope = regions[0];
        } else if (regions.length === 2) {
            const ordered = regions.sort((a,b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b));
            topScope = COMBO_MAP[`${ordered[0]},${ordered[1]}`] || 'GLOBAL';
        }
        
        // MODIFICATION: Ne recharger QUE les données du Top 10, PAS les données A→Z
        renderTop();
        // SUPPRIMÉ: loadAZDataForCurrentSelection(true);
    });
    
    /**
     * Charge les données A→Z - MODIFIÉ pour forcer GLOBAL si nécessaire
     */
    async function loadAZDataForCurrentSelection(forceRefresh = false, forceGlobal = false) {
        // MODIFICATION: Toujours utiliser GLOBAL pour la section A→Z
        const scope = forceGlobal ? 'GLOBAL' : AZ_SCOPE;
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
        
        // Afficher message de chargement
        const loadingText = document.querySelector('#indices-loading .loader');
        if (loadingText) {
            const parent = loadingText.parentElement;
            parent?.querySelector('.loading-msg')?.remove();
            
            const loadingMessage = document.createElement('p');
            loadingMessage.className = 'loading-msg mt-4 text-sm text-gray-400';
            loadingMessage.textContent = `Chargement des données globales (US + Europe + Asie)...`;
            parent.appendChild(loadingMessage);
        }
        
        try {
            console.log(`🔍 Chargement A→Z GLOBAL (toutes régions)`);
            
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
            
            const validPayloads = payloads.filter(p => p !== null);
            
            if (validPayloads.length === 0) {
                throw new Error('Aucune donnée disponible');
            }
            
            // Collecter toutes les données
            const all = [];
            let latestTs = null;
            
            validPayloads.forEach((data, i) => {
                const region = regions[i];
                
                if (data.timestamp) {
                    const ts = Date.parse(data.timestamp);
                    latestTs = latestTs ? Math.max(latestTs, ts) : ts;
                }
                
                if (data.indices) {
                    Object.values(data.indices).forEach(list => {
                        (list || []).forEach(r => all.push(normalizeRecord(r, region)));
                    });
                } else if (Array.isArray(data.stocks)) {
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
            
            // Calculer les statistiques
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
                    stats
                }
            };
            
            console.log(`✅ Section A→Z: ${stats.total} actions globales chargées`);
            
            // Afficher les données
            renderStocksData();
            lastUpdate = new Date();
            
        } catch (err) {
            console.error('❌ Erreur lors du chargement A→Z:', err);
            showElement('indices-error');
            hideElement('indices-loading');
        } finally {
            isLoading = false;
        }
    }
    
    /**
     * Initialise les boutons de sélection multi-régions pour les Top 10
     * MODIFIÉ: Ne recharge plus les données A→Z
     */
    function wireScopeButtons() {
        const box = document.getElementById('top-scope');
        if (!box) return;
        const btns = [...box.querySelectorAll('.market-btn')];

        const updateButtonsUI = () => {
            btns.forEach(b => {
                const k = b.dataset.scope;
                b.classList.toggle('active', selectedRegions.has(k));
            });
            const lab = document.getElementById('top-scope-label');
            if (lab) {
                if (selectedRegions.has('GLOBAL') || selectedRegions.size === 0) {
                    lab.textContent = 'GLOBAL';
                } else {
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
            const arr = Array.from(selectedRegions).sort(
                (a,b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b)
            );
            const key = COMBO_MAP[`${arr[0]},${arr[1]}`] || COMBO_MAP[`${arr[1]},${arr[0]}`];
            if (!key) {
                console.warn(`Combo non trouvée: ${arr.join(',')}`);
                return 'GLOBAL';
            }
            return key;
        };

        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.scope;

                if (key === 'GLOBAL') {
                    selectedRegions.clear();
                    selectedRegions.add('GLOBAL');
                } else {
                    if (selectedRegions.has('GLOBAL')) selectedRegions.delete('GLOBAL');

                    if (selectedRegions.has(key)) {
                        selectedRegions.delete(key);
                    } else {
                        if (selectedRegions.size >= 2) {
                            btn.classList.add('ring-2','ring-red-400');
                            setTimeout(() => btn.classList.remove('ring-2','ring-red-400'), 400);
                            showToast('Maximum 2 régions simultanément');
                            return;
                        }
                        selectedRegions.add(key);
                    }

                    if (selectedRegions.size === 0) selectedRegions.add('GLOBAL');
                }

                updateButtonsUI();
                topScope = computeTopKey();
                renderTop(); // Recharge SEULEMENT les tops, PAS les données A→Z
                // SUPPRIMÉ: loadAZDataForCurrentSelection(true);
            });
        });

        updateButtonsUI();
        topScope = 'GLOBAL';
    }

    // ... Le reste du code reste identique ...
    // (Inclure toutes les autres fonctions sans modification)
});
