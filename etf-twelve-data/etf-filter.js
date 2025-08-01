// etf-filter.js
// Script pour filtrer vos ETF/Bonds selon volume et market cap

const fs = require('fs').promises;
const axios = require('axios');

class ETFFilter {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.twelvedata.com';
        this.rateLimit = 800;
    }

    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getMarketData(symbol) {
        try {
            const [quote, stats] = await Promise.all([
                axios.get(`${this.baseUrl}/quote`, {
                    params: { symbol, apikey: this.apiKey }
                }),
                axios.get(`${this.baseUrl}/statistics`, {
                    params: { symbol, apikey: this.apiKey }
                })
            ]);

            return {
                symbol,
                name: quote.data.name,
                volume: parseInt(quote.data.volume) || 0,
                average_volume: parseInt(quote.data.average_volume) || 0,
                market_cap: parseFloat(stats.data?.statistics?.market_capitalization) || 0,
                price: parseFloat(quote.data.close) || 0
            };
        } catch (error) {
            console.error(`❌ ${symbol}: ${error.message}`);
            return null;
        }
    }

    async filterETFs(config) {
        // Charger vos listes complètes
        const etfList = JSON.parse(await fs.readFile(config.ETF_FILE));
        const bondList = JSON.parse(await fs.readFile(config.BOND_FILE));
        
        console.log(`📊 Filtrage de ${etfList.length} ETFs et ${bondList.length} Bonds\n`);
        
        const filtered = {
            etfs: [],
            bonds: [],
            rejected: [],
            timestamp: new Date().toISOString()
        };

        // Filtrer les ETFs
        console.log('🔍 Filtrage des ETFs...');
        for (let i = 0; i < etfList.length; i++) {
            const etf = etfList[i];
            console.log(`ETF ${i+1}/${etfList.length}: ${etf.symbol}`);
            
            const data = await this.getMarketData(etf.symbol);
            await this.wait(this.rateLimit);
            
            if (data && (data.volume >= config.MIN_VOLUME_ETF || data.market_cap >= config.MIN_MARKET_CAP_ETF)) {
                filtered.etfs.push({ ...etf, ...data });
                console.log(`✅ Retenu - Volume: ${data.volume.toLocaleString()}, MCap: ${(data.market_cap/1e9).toFixed(1)}B`);
            } else if (data) {
                filtered.rejected.push({ ...etf, reason: 'Volume/MCap insuffisant' });
            }
            
            if ((i + 1) % 50 === 0) {
                console.log('⏸️  Pause...');
                await this.wait(10000);
            }
        }

        // Filtrer les Bonds
        console.log('\n🔍 Filtrage des Bonds...');
        for (let i = 0; i < bondList.length; i++) {
            const bond = bondList[i];
            console.log(`Bond ${i+1}/${bondList.length}: ${bond.symbol}`);
            
            const data = await this.getMarketData(bond.symbol);
            await this.wait(this.rateLimit);
            
            if (data && (data.volume >= config.MIN_VOLUME_BOND || data.market_cap >= config.MIN_MARKET_CAP_BOND)) {
                filtered.bonds.push({ ...bond, ...data });
                console.log(`✅ Retenu - Volume: ${data.volume.toLocaleString()}, MCap: ${(data.market_cap/1e9).toFixed(1)}B`);
            } else if (data) {
                filtered.rejected.push({ ...bond, reason: 'Volume/MCap insuffisant' });
            }
            
            if ((i + 1) % 50 === 0) {
                console.log('⏸️  Pause...');
                await this.wait(10000);
            }
        }

        // Sauvegarder les résultats
        await fs.writeFile('filtered_etfs.json', JSON.stringify(filtered, null, 2));
        
        console.log(`\n✅ Filtrage terminé!`);
        console.log(`ETFs retenus: ${filtered.etfs.length}/${etfList.length}`);
        console.log(`Bonds retenus: ${filtered.bonds.length}/${bondList.length}`);
        console.log(`Fichier créé: filtered_etfs.json`);
    }
}

// Configuration
const config = {
    API_KEY: process.env.TWELVE_DATA_API_KEY || 'YOUR_KEY',
    ETF_FILE: 'all_etfs.json',      // Votre fichier avec TOUS les ETF
    BOND_FILE: 'all_bonds.json',     // Votre fichier avec TOUS les bonds
    MIN_VOLUME_ETF: 500000,
    MIN_MARKET_CAP_ETF: 100000000,   // 100M
    MIN_VOLUME_BOND: 100000,
    MIN_MARKET_CAP_BOND: 50000000    // 50M
};

// Exécution
async function main() {
    const filter = new ETFFilter(config.API_KEY);
    await filter.filterETFs(config);
}

if (require.main === module) {
    main().catch(console.error);
}
