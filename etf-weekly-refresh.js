// etf-weekly-refresh.js
// Script optimisé pour la mise à jour hebdomadaire des données ETF
// Utilise /batch pour minimiser les crédits API et le temps d'exécution
// v2: Ajout de tous les champs manquants (change, TER, yield, sectors, etc.)

const fs = require('fs').promises;
const axios = require('axios');
const csv = require('csv-parse/sync');

const CONFIG = {
    API_KEY: process.env.TWELVE_DATA_API_KEY,
    DEBUG: process.env.DEBUG === '1',
    // Seuils par région
    THRESHOLDS: {
        US: { AUM: 1e9, ADV: 1e7 },      // 1 Md$ AUM, 10M$ ADV
        EU: { AUM: 2e8, ADV: 2e6 }       // 200M$ AUM, 2M$ ADV
    },
    // MIC codes US (pas de suffixe)
    US_MIC: new Set(['ARCX', 'BATS', 'XNAS', 'XNYS', 'XASE', 'XNGS', 'XNMS']),
    // Taille des batches
    BATCH_SIZE: 25,  // 25 ETF par batch (50 requêtes quote+stats)
    // Seuil fallback pour AUM manquant
    MIN_ADV_FALLBACK: 1e6  // 1M$/jour
};

// Cache des taux de change
const fxCache = new Map();

// Convertir en USD
function toUSD(amount, currency, fxRates) {
    if (!amount || amount === 0) return 0;
    if (currency === 'USD') return amount;
    
    const rate = fxRates[`${currency}/USD`] || fxCache.get(`${currency}/USD`) || 1;
    return amount * rate;
}

// Construire le symbole correct selon le marché
function buildSymbolParam(symbol, mic_code) {
    const cleaned = symbol.replace(/\.[A-Z]+$/, ''); // Retirer .EUR, .LON, etc.
    
    // Les symboles US n'utilisent PAS de suffixe MIC
    if (CONFIG.US_MIC.has(mic_code)) {
        return cleaned;
    }
    
    // Autres marchés : ajouter le MIC si disponible
    return mic_code ? `${cleaned}:${mic_code}` : cleaned;
}

// Appel batch à l'API
async function batchCall(payload) {
    try {
        const { data } = await axios.post('https://api.twelvedata.com/batch', payload, {
            headers: { 
                'Authorization': `apikey ${CONFIG.API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        return data?.data || {};
    } catch (error) {
        console.error('❌ Erreur batch:', error.message);
        return {};
    }
}

// Calculer le volume moyen sur 30 jours (fallback)
async function calculateAverageVolume(symbolParam) {
    try {
        const payload = {
            ts: { url: `/time_series?symbol=${encodeURIComponent(symbolParam)}&interval=1day&outputsize=30` }
        };
        const result = await batchCall(payload);
        const values = result.ts?.response?.values || [];
        
        if (values.length > 0) {
            return values.reduce((sum, v) => sum + Number(v.volume || 0), 0) / values.length;
        }
    } catch (error) {
        console.error(`Erreur calcul volume ${symbolParam}:`, error.message);
    }
    return 0;
}

// Traiter un batch d'ETF (étape A : pré-filtre)
async function preFilterBatch(items) {
    console.log(`\n📊 Pré-filtrage de ${items.length} ETF...`);
    
    // 1) Construire le payload pour quote + statistics + FX
    const payload = {};
    const needFx = new Set();
    
    items.forEach((item, i) => {
        const symbolParam = buildSymbolParam(item.symbol, item.mic_code);
        payload[`q_${i}`] = { url: `/quote?symbol=${encodeURIComponent(symbolParam)}` };
        payload[`s_${i}`] = { url: `/statistics?symbol=${encodeURIComponent(symbolParam)}` };
        
        // Ajouter la devise si différente de USD
        if (item.currency && item.currency !== 'USD') {
            needFx.add(`${item.currency}/USD`);
        }
    });
    
    // Ajouter les taux de change nécessaires
    [...needFx].forEach((pair, k) => {
        if (!fxCache.has(pair)) {
            payload[`fx_${k}`] = { url: `/exchange_rate?symbol=${pair}` };
        }
    });
    
    // 2) Appel batch
    const results = await batchCall(payload);
    
    // 3) Extraire les taux de change
    const fxRates = {};
    Object.entries(results).forEach(([key, value]) => {
        if (key.startsWith('fx_') && value.status === 'success') {
            const symbol = value.response.symbol;
            const rate = Number(value.response.rate) || 1;
            fxRates[symbol] = rate;
            fxCache.set(symbol, rate); // Mettre en cache
        }
    });
    
    // 4) Analyser et filtrer les ETF
    const survivors = [];
    const rejected = [];
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const symbolParam = buildSymbolParam(item.symbol, item.mic_code);
        const quote = results[`q_${i}`]?.response || {};
        const stats = results[`s_${i}`]?.response?.statistics || {};
        
        // Skip si erreur quote
        if (results[`q_${i}`]?.status === 'error') {
            rejected.push({ ...item, reason: 'SYMBOL_NOT_FOUND' });
            console.log(`  ❌ ${symbolParam} - Symbole non trouvé`);
            continue;
        }
        
        // Extraire les données de quote (incluant change et percent_change)
        const currency = quote.currency || item.currency || 'USD';
        const price = Number(quote.close) || 0;
        const change = Number(quote.change) || 0;
        const percentChange = Number(quote.percent_change) || 0;
        let avgVolume = Number(quote.average_volume) || 0;
        
        // Fallback volume pour marchés non-US si nécessaire
        if (!avgVolume && !CONFIG.US_MIC.has(item.mic_code)) {
            avgVolume = await calculateAverageVolume(symbolParam);
        }
        
        // Si toujours pas de volume, utiliser volume du jour * 0.8
        if (!avgVolume) {
            avgVolume = Number(quote.volume) * 0.8 || 0;
        }
        
        // Calculer ADV en USD
        const advUSD = toUSD(avgVolume * price, currency, fxRates);
        
        // AUM (net assets ou market cap)
        const aumRaw = Number(stats.net_assets) || Number(quote.market_capitalization) || 0;
        const aumUSD = toUSD(aumRaw, stats.currency || currency, fxRates);
        
        // Déterminer les seuils
        const isUS = CONFIG.US_MIC.has(item.mic_code);
        const thresholds = isUS ? CONFIG.THRESHOLDS.US : CONFIG.THRESHOLDS.EU;
        
        // Appliquer les filtres avec règle fallback pour AUM
        const passAUM = aumUSD >= thresholds.AUM || 
                       (aumUSD === 0 && advUSD >= CONFIG.MIN_ADV_FALLBACK);
        const passADV = advUSD >= thresholds.ADV;
        
        // Logger
        const aumInfo = aumUSD === 0 ? '0 (fallback)' : `${(aumUSD/1e6).toFixed(0)}M$`;
        console.log(`  ${symbolParam} | AUM: ${aumInfo} | ADV: ${(advUSD/1e6).toFixed(2)}M$ | Chg: ${percentChange.toFixed(2)}%`);
        
        if (passAUM && passADV) {
            survivors.push({
                ...item,
                symbolParam,
                currency,
                price,
                change,
                percent_change: percentChange,
                avg_volume: avgVolume,
                adv_usd: advUSD,
                aum_usd: aumUSD,
                quote_data: quote,
                stats_data: stats
            });
            console.log(`    ✅ PASS`);
        } else {
            const failedFilters = [];
            if (!passAUM) failedFilters.push('aum');
            if (!passADV) failedFilters.push('liquidity');
            
            rejected.push({
                ...item,
                symbolParam,
                adv_usd: advUSD,
                aum_usd: aumUSD,
                failed: failedFilters
            });
            console.log(`    ❌ FAIL: ${failedFilters.join(', ')}`);
        }
    }
    
    return { survivors, rejected };
}

// Enrichir les ETF avec données complètes (étape B)
async function enrichBatch(survivors) {
    if (survivors.length === 0) return [];
    
    console.log(`\n🎯 Enrichissement de ${survivors.length} ETF retenus...`);
    
    // Construire le payload pour /etfs/world (PAS /etfs/world/summary)
    const payload = {};
    survivors.forEach((item, i) => {
        payload[`w_${i}`] = { 
            url: `/etfs/world?symbol=${encodeURIComponent(item.symbolParam)}` 
        };
    });
    
    // Appel batch
    const results = await batchCall(payload);
    
    // Enrichir les données
    const enriched = survivors.map((item, i) => {
        const worldResponse = results[`w_${i}`]?.response || {};
        const etf = worldResponse.etf || worldResponse || {};
        
        // Extraire toutes les sections
        const summary = etf.summary || {};
        const performance = etf.performance || {};
        const composition = etf.composition || {};
        const risk = etf.risk || {};
        
        // AUM fallback : si stats.net_assets était 0, prendre summary.net_assets
        let finalAumUsd = item.aum_usd;
        if (finalAumUsd === 0 && summary.net_assets) {
            const summaryAum = Number(summary.net_assets) || 0;
            finalAumUsd = toUSD(summaryAum, summary.currency || item.currency, fxCache);
            if (CONFIG.DEBUG && finalAumUsd > 0) {
                console.log(`  → AUM fallback pour ${item.symbolParam}: ${(finalAumUsd/1e6).toFixed(0)}M$`);
            }
        }
        
        // NAV et premium/discount
        const nav = Number(summary.nav) || 0;
        const navAvailable = nav > 0;
        const lastPrice = Number(summary.last_price) || item.price;
        const premiumDiscount = navAvailable ? (lastPrice - nav) / nav : 0;
        
        // Trouver les métriques de risque sur 3 ans
        const risk3Y = (risk.volatility_measures || []).find(r => r.period === '3_year') || {};
        
        // Top 10 holdings avec détails
        const topHoldings = (composition.top_holdings || []).slice(0, 10).map(holding => ({
            symbol: holding.symbol || '',
            name: holding.name || '',
            weight: Number(holding.weight) || 0,
            shares: Number(holding.shares) || 0
        }));
        
        // Secteurs avec pourcentages
        const sectors = (composition.major_market_sectors || []).map(sector => ({
            name: sector.name || '',
            weight: Number(sector.weight) || 0
        }));
        
        // Allocation géographique
        const countries = (composition.country_allocation || []).map(country => ({
            name: country.name || '',
            weight: Number(country.weight) || 0
        }));
        
        // Performance trailing returns
        const trailingReturns = {};
        (performance.trailing_returns || []).forEach(tr => {
            if (tr.period && tr.return !== undefined) {
                trailingReturns[tr.period] = Number(tr.return) || 0;
            }
        });
        
        return {
            // === Identification ===
            symbol: item.symbol,
            symbol_param: item.symbolParam,
            mic_code: item.mic_code,
            isin: item.isin || summary.isin || null,
            name: summary.name || item.name || '',
            currency: item.currency,
            exchange: item.exchange || '',
            
            // === Métriques de marché (temps réel) ===
            price: lastPrice,
            change: item.change,
            percent_change: item.percent_change,
            volume: Number(item.quote_data.volume) || 0,
            avg_volume: item.avg_volume,
            
            // === Liquidité et AUM ===
            aum_usd: finalAumUsd,
            adv_usd: item.adv_usd,
            
            // === NAV et Premium/Discount ===
            nav: nav,
            nav_available: navAvailable,
            premium_discount: premiumDiscount,
            
            // === Informations du fonds ===
            fund_type: summary.fund_type || '',
            fund_family: summary.fund_family || '',
            expense_ratio: Number(summary.expense_ratio_net) || 0,
            yield_ttm: Number(summary.yield) || 0,
            inception_date: summary.share_class_inception_date || '',
            
            // === Performance ===
            trailing_returns: trailingReturns,
            ytd_return: Number(performance.ytd_return) || trailingReturns['ytd'] || 0,
            one_day_return: trailingReturns['1_day'] || 0,
            one_week_return: trailingReturns['1_week'] || 0,
            one_month_return: trailingReturns['1_month'] || 0,
            three_month_return: trailingReturns['3_month'] || 0,
            six_month_return: trailingReturns['6_month'] || 0,
            one_year_return: trailingReturns['1_year'] || 0,
            three_year_return: trailingReturns['3_year'] || 0,
            five_year_return: trailingReturns['5_year'] || 0,
            
            // === Composition ===
            sectors: sectors,
            top_holdings: topHoldings,
            countries: countries,
            asset_classes: composition.asset_class || [],
            
            // === Métriques de risque (3 ans) ===
            volatility_3y: risk3Y.volatility || null,
            sharpe_3y: risk3Y.sharpe_ratio || null,
            beta_3y: risk3Y.beta || null,
            standard_deviation_3y: risk3Y.standard_deviation || null,
            
            // === Metadata ===
            last_updated: new Date().toISOString(),
            data_quality: {
                has_nav: navAvailable,
                has_aum: finalAumUsd > 0,
                has_holdings: topHoldings.length > 0,
                has_sectors: sectors.length > 0,
                has_risk_metrics: risk3Y.volatility !== undefined
            }
        };
    });
    
    return enriched;
}

// Fonction principale
async function weeklyRefresh() {
    console.log('🚀 Mise à jour hebdomadaire des données ETF (v2)\n');
    console.log(`⚙️  Configuration:`);
    console.log(`   - Seuils US: AUM ≥ ${CONFIG.THRESHOLDS.US.AUM/1e9}Md$, ADV ≥ ${CONFIG.THRESHOLDS.US.ADV/1e6}M$`);
    console.log(`   - Seuils EU: AUM ≥ ${CONFIG.THRESHOLDS.EU.AUM/1e6}M$, ADV ≥ ${CONFIG.THRESHOLDS.EU.ADV/1e6}M$`);
    console.log(`   - Batch size: ${CONFIG.BATCH_SIZE} ETF\n`);
    
    const startTime = Date.now();
    
    try {
        // Lire les ETF depuis le CSV
        const etfData = await fs.readFile('data/all_etfs.csv', 'utf8');
        const etfs = csv.parse(etfData, { columns: true });
        
        console.log(`📂 ${etfs.length} ETF trouvés dans le CSV\n`);
        
        const allSurvivors = [];
        const allRejected = [];
        
        // Traiter par batches
        for (let i = 0; i < etfs.length; i += CONFIG.BATCH_SIZE) {
            const batch = etfs.slice(i, i + CONFIG.BATCH_SIZE);
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`📦 Batch ${Math.floor(i/CONFIG.BATCH_SIZE) + 1}/${Math.ceil(etfs.length/CONFIG.BATCH_SIZE)}: ETF ${i+1}-${Math.min(i+CONFIG.BATCH_SIZE, etfs.length)}`);
            
            // Étape A : Pré-filtrage
            const { survivors, rejected } = await preFilterBatch(batch);
            
            // Étape B : Enrichissement (seulement pour les survivors)
            let enriched = [];
            if (survivors.length > 0) {
                enriched = await enrichBatch(survivors);
            }
            
            allSurvivors.push(...enriched);
            allRejected.push(...rejected);
            
            console.log(`\n📈 Sous-total batch: ${survivors.length} retenus, ${rejected.length} rejetés`);
        }
        
        // Préparer les statistiques
        const elapsedTime = Date.now() - startTime;
        const rejectionReasons = {};
        allRejected.forEach(item => {
            if (item.reason) {
                rejectionReasons[item.reason] = (rejectionReasons[item.reason] || 0) + 1;
            } else if (item.failed) {
                item.failed.forEach(f => {
                    rejectionReasons[f] = (rejectionReasons[f] || 0) + 1;
                });
            }
        });
        
        // Statistiques de qualité des données
        const dataQualityStats = {
            with_nav: allSurvivors.filter(e => e.nav_available).length,
            with_aum: allSurvivors.filter(e => e.aum_usd > 0).length,
            with_holdings: allSurvivors.filter(e => e.top_holdings.length > 0).length,
            with_sectors: allSurvivors.filter(e => e.sectors.length > 0).length,
            with_risk_metrics: allSurvivors.filter(e => e.volatility_3y !== null).length
        };
        
        // Créer le snapshot final
        const snapshot = {
            metadata: {
                timestamp: new Date().toISOString(),
                total_etfs: etfs.length,
                retained: allSurvivors.length,
                rejected: allRejected.length,
                elapsed_seconds: Math.round(elapsedTime / 1000),
                rejection_reasons: rejectionReasons,
                data_quality: dataQualityStats,
                fx_rates: Object.fromEntries(fxCache)
            },
            etfs: allSurvivors,
            rejected_summary: allRejected.map(r => ({
                symbol: r.symbol,
                mic_code: r.mic_code,
                reason: r.reason || `Failed: ${r.failed?.join(', ')}`
            }))
        };
        
        // Sauvegarder
        await fs.writeFile('data/weekly_snapshot.json', JSON.stringify(snapshot, null, 2));
        
        // Créer aussi un fichier CSV détaillé pour analyse rapide
        const csvHeader = 'symbol,mic_code,name,price,change_%,aum_usd,adv_usd,expense_ratio,yield_ttm,ytd_return,1y_return,volatility_3y,sharpe_3y,nav,premium_discount\n';
        const csvRows = allSurvivors.map(etf => 
            `${etf.symbol},${etf.mic_code},"${etf.name.replace(/"/g, '""')}",${etf.price},${etf.percent_change},${etf.aum_usd},${etf.adv_usd},${etf.expense_ratio},${etf.yield_ttm},${etf.ytd_return},${etf.one_year_return},${etf.volatility_3y || ''},${etf.sharpe_3y || ''},${etf.nav || ''},${etf.premium_discount || ''}`
        ).join('\n');
        await fs.writeFile('data/weekly_snapshot.csv', csvHeader + csvRows);
        
        // Afficher le résumé
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 RÉSUMÉ FINAL:');
        console.log(`   ✅ ETF retenus: ${allSurvivors.length}/${etfs.length}`);
        console.log(`   ❌ ETF rejetés: ${allRejected.length}`);
        console.log(`   ⏱️  Temps total: ${Math.round(elapsedTime/1000)}s`);
        
        console.log('\n📈 Qualité des données:');
        console.log(`   - Avec NAV: ${dataQualityStats.with_nav}/${allSurvivors.length}`);
        console.log(`   - Avec AUM: ${dataQualityStats.with_aum}/${allSurvivors.length}`);
        console.log(`   - Avec Holdings: ${dataQualityStats.with_holdings}/${allSurvivors.length}`);
        console.log(`   - Avec Secteurs: ${dataQualityStats.with_sectors}/${allSurvivors.length}`);
        console.log(`   - Avec Risk 3Y: ${dataQualityStats.with_risk_metrics}/${allSurvivors.length}`);
        
        console.log('\n📁 Fichiers générés:');
        console.log('   - data/weekly_snapshot.json (données complètes)');
        console.log('   - data/weekly_snapshot.csv (résumé tabulaire)');
        
        if (Object.keys(rejectionReasons).length > 0) {
            console.log('\n❌ Raisons de rejet:');
            Object.entries(rejectionReasons).forEach(([reason, count]) => {
                console.log(`   - ${reason}: ${count}`);
            });
        }
        
        // Pour GitHub Actions
        if (process.env.GITHUB_ACTIONS) {
            console.log(`::set-output name=etfs_retained::${allSurvivors.length}`);
            console.log(`::set-output name=etfs_rejected::${allRejected.length}`);
        }
        
    } catch (error) {
        console.error('\n❌ Erreur fatale:', error);
        process.exit(1);
    }
}

// Lancer le script
if (!CONFIG.API_KEY) {
    console.error('❌ TWELVE_DATA_API_KEY manquante');
    process.exit(1);
}

weeklyRefresh().catch(error => {
    console.error('❌ Erreur:', error);
    process.exit(1);
});
