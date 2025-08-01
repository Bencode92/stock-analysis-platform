// etf-performance.js
// Script pour récupérer les performances (YTD, daily) des ETF filtrés

const fs = require('fs').promises;
const axios = require('axios');

class ETFPerformance {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.twelvedata.com';
        this.rateLimit = 800;
    }

    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getPerformance(symbol) {
        try {
            // Données actuelles
            const quote = await axios.get(`${this.baseUrl}/quote`, {
                params: { symbol, apikey: this.apiKey }
            });
            
            await this.wait(this.rateLimit);
            
            // Données YTD
            const startOfYear = new Date();
            startOfYear.setMonth(0, 1);
            
            const timeSeries = await axios.get(`${this.baseUrl}/time_series`, {
                params: {
                    symbol,
                    interval: '1day',
                    outputsize: 2,
                    start_date: startOfYear.toISOString().split('T')[0],
                    apikey: this.apiKey
                }
            });
            
            // Calculer YTD
            let ytd = null;
            if (timeSeries.data.values?.length > 0) {
                const oldestPrice = parseFloat(timeSeries.data.values[timeSeries.data.values.length - 1].close);
                const currentPrice = parseFloat(quote.data.close);
                ytd = ((currentPrice - oldestPrice) / oldestPrice * 100).toFixed(2);
            }
            
            return {
                symbol,
                name: quote.data.name,
                price: parseFloat(quote.data.close),
                change: parseFloat(quote.data.change),
                percent_change: parseFloat(quote.data.percent_change),
                volume: parseInt(quote.data.volume),
                ytd: ytd
            };
        } catch (error) {
            console.error(`❌ ${symbol}: ${error.message}`);
            return null;
        }
    }

    formatPercentage(value) {
        if (!value) return '0,00%';
        const formatted = parseFloat(value).toFixed(2).replace('.', ',');
        return parseFloat(value) > 0 ? `+${formatted}%` : `${formatted}%`;
    }

    async processFilteredETFs() {
        // Charger les ETF filtrés
        const filtered = JSON.parse(await fs.readFile('filtered_etfs.json'));
        console.log(`📊 Récupération des performances pour ${filtered.etfs.length} ETFs et ${filtered.bonds.length} Bonds\n`);
        
        const result = {
            etfs: [],
            bonds: [],
            top_performers: {},
            meta: {
                timestamp: new Date().toISOString(),
                source: 'Twelve Data API',
                count: 0
            }
        };

        // Traiter les ETFs
        console.log('📈 ETFs...');
        for (let i = 0; i < filtered.etfs.length; i++) {
            const etf = filtered.etfs[i];
            console.log(`${i+1}/${filtered.etfs.length}: ${etf.symbol}`);
            
            const perf = await this.getPerformance(etf.symbol);
            await this.wait(this.rateLimit);
            
            if (perf) {
                result.etfs.push({
                    ...etf,
                    ...perf,
                    change_formatted: this.formatPercentage(perf.percent_change),
                    ytd_formatted: this.formatPercentage(perf.ytd)
                });
            }
            
            if ((i + 1) % 25 === 0) {
                console.log('⏸️  Pause...');
                await this.wait(10000);
            }
        }

        // Traiter les Bonds
        console.log('\n📊 Bonds...');
        for (let i = 0; i < filtered.bonds.length; i++) {
            const bond = filtered.bonds[i];
            console.log(`${i+1}/${filtered.bonds.length}: ${bond.symbol}`);
            
            const perf = await this.getPerformance(bond.symbol);
            await this.wait(this.rateLimit);
            
            if (perf) {
                result.bonds.push({
                    ...bond,
                    ...perf,
                    change_formatted: this.formatPercentage(perf.percent_change),
                    ytd_formatted: this.formatPercentage(perf.ytd)
                });
            }
            
            if ((i + 1) % 25 === 0) {
                console.log('⏸️  Pause...');
                await this.wait(10000);
            }
        }

        // Calculer les top performers
        result.top_performers = {
            daily: {
                best: result.etfs.sort((a, b) => b.percent_change - a.percent_change).slice(0, 10),
                worst: result.etfs.sort((a, b) => a.percent_change - b.percent_change).slice(0, 10)
            },
            ytd: {
                best: result.etfs.filter(e => e.ytd).sort((a, b) => parseFloat(b.ytd) - parseFloat(a.ytd)).slice(0, 10),
                worst: result.etfs.filter(e => e.ytd).sort((a, b) => parseFloat(a.ytd) - parseFloat(b.ytd)).slice(0, 10)
            }
        };

        result.meta.count = result.etfs.length + result.bonds.length;

        // Sauvegarder
        await fs.writeFile('etf_performance.json', JSON.stringify(result, null, 2));
        
        console.log(`\n✅ Terminé!`);
        console.log(`Fichier créé: etf_performance.json`);
        console.log(`Total: ${result.meta.count} instruments`);
    }
}

// Exécution
async function main() {
    const apiKey = process.env.TWELVE_DATA_API_KEY || 'YOUR_KEY';
    const performance = new ETFPerformance(apiKey);
    await performance.processFilteredETFs();
}

if (require.main === module) {
    main().catch(console.error);
}
