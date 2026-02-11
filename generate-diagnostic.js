// generate-diagnostic.js
// Module de diagnostic — génère data/diagnostic_missing.json
// Appelé depuis stock-advanced-filter.js main()

async function generateDiagnostic(byRegion, OUT_DIR, path, fs) {
    const allForDiag = [...(byRegion.US || []), ...(byRegion.EUROPE || []), ...(byRegion.ASIA || [])];

    const diag = {
        generated_at: new Date().toISOString(),
        total_stocks: allForDiag.length,

        // 1. Stocks avec NO_DATA complet (price=null)
        no_data: allForDiag
            .filter(s => s.error === 'NO_DATA')
            .map(s => ({
                ticker: s.symbol || s.ticker,
                name: s.name,
                country: s.country,
                exchange_csv: s.exchange,
                resolved_symbol: s.resolved_symbol || null,
                data_exchange: s.data_exchange || null,
                data_mic: s.data_mic || null,
            })),

        // 2. Stocks sans ROE
        missing_roe: allForDiag
            .filter(s => !s.error && s.roe == null)
            .map(s => ({
                ticker: s.ticker,
                name: s.name,
                country: s.country,
                exchange_csv: s.exchange,
                resolved_symbol: s.resolved_symbol,
                data_exchange: s.data_exchange,
                data_mic: s.data_mic,
            })),

        // 3. Stocks sans D/E ratio
        missing_de_ratio: allForDiag
            .filter(s => !s.error && s.de_ratio == null)
            .map(s => ({
                ticker: s.ticker,
                name: s.name,
                country: s.country,
                exchange_csv: s.exchange,
                resolved_symbol: s.resolved_symbol,
                data_exchange: s.data_exchange,
                data_mic: s.data_mic,
            })),

        // 4. Stocks sans ROIC
        missing_roic: allForDiag
            .filter(s => !s.error && s.roic == null)
            .map(s => ({
                ticker: s.ticker,
                name: s.name,
                country: s.country,
                exchange_csv: s.exchange,
                resolved_symbol: s.resolved_symbol,
                data_exchange: s.data_exchange,
                data_mic: s.data_mic,
            })),

        // 5. Stocks sans performance (perf_ytd=null)
        missing_perf: allForDiag
            .filter(s => !s.error && s.perf_ytd == null)
            .map(s => ({
                ticker: s.ticker,
                name: s.name,
                country: s.country,
                exchange_csv: s.exchange,
                resolved_symbol: s.resolved_symbol,
                data_exchange: s.data_exchange,
                data_mic: s.data_mic,
                has_price: s.price != null,
                has_perf_1d: s.perf_1d != null,
            })),

        // 6. Stocks sans dividende yield
        missing_dividend: allForDiag
            .filter(s => !s.error && s.dividend_yield == null)
            .map(s => ({
                ticker: s.ticker,
                name: s.name,
                country: s.country,
                resolved_symbol: s.resolved_symbol,
                data_exchange: s.data_exchange,
                data_mic: s.data_mic,
            })),

        // 7. Résumé par exchange CSV → taux échec
        by_exchange: (() => {
            const map = {};
            for (const s of allForDiag) {
                const ex = s.exchange || 'UNKNOWN';
                if (!map[ex]) map[ex] = { total: 0, no_data: 0, no_roe: 0, no_de: 0, no_perf: 0 };
                map[ex].total++;
                if (s.error === 'NO_DATA') map[ex].no_data++;
                if (!s.error && s.roe == null) map[ex].no_roe++;
                if (!s.error && s.de_ratio == null) map[ex].no_de++;
                if (!s.error && s.perf_ytd == null) map[ex].no_perf++;
            }
            return Object.entries(map)
                .sort((a, b) => b[1].no_data - a[1].no_data)
                .map(([exchange, counts]) => ({ exchange, ...counts }));
        })(),

        // 8. Résumé par data_mic → vérifier résolution
        by_data_mic: (() => {
            const map = {};
            for (const s of allForDiag.filter(s => !s.error)) {
                const mic = s.data_mic || 'NO_MIC';
                if (!map[mic]) map[mic] = { total: 0, no_roe: 0, no_de: 0, no_perf: 0, tickers: [] };
                map[mic].total++;
                if (s.roe == null) map[mic].no_roe++;
                if (s.de_ratio == null) map[mic].no_de++;
                if (s.perf_ytd == null) map[mic].no_perf++;
                if (s.roe == null || s.de_ratio == null || s.perf_ytd == null) {
                    map[mic].tickers.push(s.ticker);
                }
            }
            return Object.entries(map)
                .filter(([_, v]) => v.no_roe + v.no_de + v.no_perf > 0)
                .sort((a, b) => (b[1].no_roe + b[1].no_de) - (a[1].no_roe + a[1].no_de))
                .map(([mic, counts]) => ({ mic, ...counts, tickers: counts.tickers.slice(0, 20) }));
        })()
    };

    // Résumé console
    console.log('\n🔍 DIAGNOSTIC:');
    console.log(`  NO_DATA complet: ${diag.no_data.length}/${diag.total_stocks}`);
    console.log(`  Missing ROE:     ${diag.missing_roe.length}`);
    console.log(`  Missing D/E:     ${diag.missing_de_ratio.length}`);
    console.log(`  Missing ROIC:    ${diag.missing_roic.length}`);
    console.log(`  Missing Perf:    ${diag.missing_perf.length}`);

    if (diag.no_data.length > 0) {
        console.log('\n  ❌ NO_DATA tickers:');
        for (const s of diag.no_data.slice(0, 15)) {
            console.log(`     ${(s.ticker || '').padEnd(8)} | csv=${s.exchange_csv} | resolved=${s.resolved_symbol || 'NONE'} | mic=${s.data_mic || 'NONE'}`);
        }
        if (diag.no_data.length > 15) console.log(`     ... +${diag.no_data.length - 15} autres`);
    }

    const diagPath = path.join(OUT_DIR, 'diagnostic_missing.json');
    await fs.writeFile(diagPath, JSON.stringify(diag, null, 2));
    console.log(`\n📋 Diagnostic complet: ${diagPath}`);
}

module.exports = generateDiagnostic;
