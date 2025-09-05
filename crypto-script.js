/**
 * crypto-script.js — version CSV avec volatilité (sans tops volatilité)
 * Source: data/filtered/Crypto_filtered_volatility.csv
 * Champs utilisés: symbol, currency_base, currency_quote, last_close, last_datetime,
 *                  ret_1d_pct, ret_7d_pct, ret_30d_pct, ret_90d_pct,
 *                  vol_7d_annual_pct, vol_30d_annual_pct, atr14_pct, drawdown_90d_pct
 */

document.addEventListener('DOMContentLoaded', function () {
  // --- État global
  let cryptoData = {
    indices: {},      // { a: [coins...], ... }
    top_performers: { // tops 24h et 90j seulement
      daily: { best: [], worst: [] },
      qtr:   { best: [], worst: [] }
    },
    meta: { timestamp: null, count: 0, isStale: false, source: "CSV filtré avec volatilité" }
  };

  let isLoading = false;
  const AUTO_REFRESH_INTERVAL = 2 * 60 * 60 * 1000; // 2h
  let autoRefreshTimer = null;
  let nextRefreshTime = null;

  // --- Boot
  createAlphabetSections();
  initAlphabetTabs();
  initDefaultTab(); // Ajout: Active la lettre "A" par défaut
  initSearchFunctionality();
  updateMarketTime();
  setInterval(updateMarketTime, 1000);
  initTheme();
  loadCryptoData();
  startAutoRefresh();

  document.getElementById('retry-button')?.addEventListener('click', function () {
    hide('indices-error');
    show('indices-loading');
    loadCryptoData(true);
  });

  // --------- Chargement & parsing CSV ---------
  async function loadCryptoData(forceRefresh = false) {
    if (isLoading) return;
    isLoading = true;

    show('indices-loading');
    hide('indices-error');
    hide('indices-container');

    try {
      const url = 'data/filtered/Crypto_filtered_volatility.csv';
      const cacheBuster = forceRefresh ? `?t=${Date.now()}` : '';
      const res = await fetch(`${url}${cacheBuster}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();
      const rows = csvToObjects(text);

      // Adapter/typer avec tous les champs
      const coins = rows.map(r => ({
        name: r.currency_base || r.symbol || '',
        symbol: r.symbol || '',
        quote: r.currency_quote || 'US Dollar',
        price: toNum(r.last_close),
        ret1d:  toNum(r.ret_1d_pct),
        ret7d:  toNum(r.ret_7d_pct),
        ret30d: toNum(r.ret_30d_pct),
        ret90d: toNum(r.ret_90d_pct),
        vol7:   toNum(r.vol_7d_annual_pct),
        vol30:  toNum(r.vol_30d_annual_pct),
        atr14:  toNum(r.atr14_pct),
        dd90:   toNum(r.drawdown_90d_pct),
        last_datetime: r.last_datetime || null
      })).filter(c => c.name);

      // Méta
      cryptoData.meta.count = coins.length;
      cryptoData.meta.timestamp = maxDate(coins.map(c => c.last_datetime));
      cryptoData.meta.isStale = isStale(cryptoData.meta.timestamp, 60 * 60 * 1000); // 1h

      // Par lettre
      cryptoData.indices = organizeByLetter(coins);

      // Tops (24h / 90j seulement)
      cryptoData.top_performers = {
        daily: {
          best: topN(coins, c => c.ret1d, 10, 'desc'),
          worst: topN(coins, c => c.ret1d, 10, 'asc')
        },
        qtr: {
          best: topN(coins, c => c.ret90d, 10, 'desc'),
          worst: topN(coins, c => c.ret90d, 10, 'asc')
        }
      };

      renderCryptoData();
      updateTopTenCrypto();

      showNotification('Données mises à jour avec succès', 'success');
    } catch (e) {
      console.error(e);
      hide('indices-loading');
      show('indices-error');
      loadDemoData(); // fallback visuel
    } finally {
      isLoading = false;
    }
  }

  // --------- Rendu principal ---------
  function renderCryptoData() {
    try {
      // Titre / timestamp
      const ts = cryptoData.meta.timestamp ? new Date(cryptoData.meta.timestamp) : new Date();
      let formatted = ts.toLocaleString('fr-FR', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      if (cryptoData.meta.isStale) formatted += ' (anciennes données)';
      byId('last-update-time').textContent = formatted;
      byId('crypto-count').textContent = cryptoData.meta.count ?? 0;

      // Tables par lettre
      const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
      alphabet.forEach(letter => {
        const body = byId(`${letter}-indices-body`);
        if (!body) return;
        body.innerHTML = '';

        const items = (cryptoData.indices[letter] || []).slice().sort((a, b) =>
          (a.name || '').localeCompare(b.name || '')
        );

        if (!items.length) {
          body.innerHTML = `
            <tr>
              <td colspan="9" class="text-center py-4 text-gray-400">
                <i class="fas fa-info-circle mr-2"></i>
                Aucune cryptomonnaie disponible pour cette lettre
              </td>
            </tr>`;
          return;
        }

        items.forEach(c => {
          const td1dCls = valClass(c.ret1d);
          const td7dCls = valClass(c.ret7d);
          const td30dCls = valClass(c.ret30d);
          const td90dCls = valClass(c.ret90d);

          const row = document.createElement('tr');
          row.innerHTML = `
            <td class="font-medium">${esc(c.name)}</td>
            <td>${esc(c.symbol)}</td>
            <td>${formatPrice(c.price, c.quote)}</td>
            <td class="${td1dCls}">${formatPct(c.ret1d)}</td>
            <td class="${td7dCls}">${formatPct(c.ret7d)}</td>
            <td class="${td30dCls}">${formatPct(c.ret30d)}</td>
            <td class="${td90dCls}">${formatPct(c.ret90d)}</td>
            <td class="neutral">${formatPct(c.vol7)}</td>
            <td class="neutral">${formatPct(c.vol30)}</td>
          `;
          body.appendChild(row);
        });
      });

      hide('indices-loading');
      hide('indices-error');
      show('indices-container');
    } catch (e) {
      console.error(e);
      hide('indices-loading');
      show('indices-error');
    }
  }

  // --------- Top 10 cartes ---------
  function updateTopTenCrypto() {
    const { daily, qtr } = cryptoData.top_performers || {};

    renderTopTenCards('top-daily-gainers', daily?.best,  c => c.ret1d);
    renderTopTenCards('top-daily-losers',  daily?.worst, c => c.ret1d);

    renderTopTenCards('top-qtr-gainers',   qtr?.best,    c => c.ret90d);
    renderTopTenCards('top-qtr-losers',    qtr?.worst,   c => c.ret90d);
  }

  function renderTopTenCards(containerId, list, valFn) {
    const container = byId(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (!list || !list.length) {
      container.innerHTML = `
        <div class="flex justify-center items-center py-4 text-gray-400">
          <i class="fas fa-info-circle mr-2"></i>Aucune donnée disponible
        </div>`;
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'stock-cards-container';

    list.slice(0, 10).forEach((c, i) => {
      const v = valFn(c);
      const cls = valClass(v);
      const rankStyle =
        i === 0 ? 'bg-amber-500 text-white' :
        i === 1 ? 'bg-gray-300 text-gray-800' :
        i === 2 ? 'bg-amber-700 text-white' : '';

      const card = document.createElement('div');
      card.className = 'stock-card';
      card.innerHTML = `
        <div class="rank ${rankStyle}">#${i + 1}</div>
        <div class="stock-info">
          <div class="stock-name">${esc(c.symbol || c.name || '-')}</div>
          <div class="stock-fullname">${esc(c.name || '-')}</div>
        </div>
        <div class="stock-performance ${cls}">${formatPct(v)}</div>
      `;
      wrap.appendChild(card);
    });

    container.appendChild(wrap);
  }

  // --------- Recherche ---------
  function initSearchFunctionality() {
    const searchInput = byId('crypto-search');
    const clearButton = byId('clear-search');
    const searchInfo = byId('search-info');
    const searchCount = byId('search-count');
    const tabs = document.querySelectorAll('.region-tab');
    if (!searchInput || !clearButton) return;

    searchInput.addEventListener('input', function () {
      const q = this.value.trim().toLowerCase();
      clearButton.style.opacity = q ? '1' : '0';
      if (!q) return clear();
      perform(q);
    });

    clearButton.addEventListener('click', () => {
      searchInput.value = ''; clear();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchInput.value.trim()) {
        searchInput.value = ''; clear();
      }
    });

    tabs.forEach(t => t.addEventListener('click', () => {
      if (searchInput.value.trim()) { searchInput.value = ''; clear(); }
    }));

    function perform(term) {
      let total = 0;
      const abc = 'abcdefghijklmnopqrstuvwxyz'.split('');
      const allTab = document.querySelector('.region-tab[data-region="all"]');
      if (allTab) {
        document.querySelectorAll('.region-tab').forEach(t => t.classList.remove('active'));
        allTab.classList.add('active');
      }

      abc.forEach(letter => {
        const body = byId(`${letter}-indices-body`);
        const container = byId(`${letter}-indices`);
        if (!body || !container) return;
        let hits = 0;

        body.querySelectorAll('tr').forEach(row => {
          if (row.cells.length <= 1) return;
          const name = row.cells[0].textContent.toLowerCase();
          const symb = row.cells[1].textContent.toLowerCase();
          const ok = name.includes(term) || symb.includes(term);
          row.classList.toggle('search-highlight', ok);
          row.style.display = ok ? '' : 'none';
          row.classList.toggle('hidden', !ok);
          if (ok) hits++, total++;
        });

        container.classList.toggle('hidden', hits === 0);
      });

      searchCount.textContent = total;
      searchInfo.classList.remove('hidden');

      const first = document.querySelector('.search-highlight');
      if (total > 0 && first) setTimeout(() => first.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }

    function clear() {
      searchInfo.classList.add('hidden');
      const abc = 'abcdefghijklmnopqrstuvwxyz'.split('');
      abc.forEach(letter => {
        const body = byId(`${letter}-indices-body`);
        const container = byId(`${letter}-indices`);
        if (!body || !container) return;
        body.querySelectorAll('tr').forEach(row => {
          row.classList.remove('search-highlight', 'hidden');
          row.style.display = '';
        });
        container.classList.remove('hidden');
      });
      clearButton.style.opacity = '0';
    }
  }

  // --------- UI générique existante ---------
  function startAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    nextRefreshTime = new Date(Date.now() + AUTO_REFRESH_INTERVAL);

    let info = byId('refresh-info');
    if (!info) {
      info = document.createElement('div');
      info.id = 'refresh-info';
      info.className = 'text-sm text-gray-400 mt-2';
      const anchor = byId('last-update-time');
      anchor?.parentNode?.appendChild(info);
    }

    const updateCounter = () => {
      const now = new Date();
      const remaining = nextRefreshTime - now;
      if (remaining <= 0) {
        info.textContent = "Actualisation en cours...";
        loadCryptoData(true);
        return;
      }
      const h = Math.floor(remaining / 3_600_000);
      const m = Math.floor((remaining % 3_600_000) / 60_000);
      info.textContent = `Prochaine actualisation dans ${h}h ${m}min`;
    };

    updateCounter();
    setInterval(updateCounter, 60_000);

    autoRefreshTimer = setInterval(() => {
      loadCryptoData(true);
      nextRefreshTime = new Date(Date.now() + AUTO_REFRESH_INTERVAL);
    }, AUTO_REFRESH_INTERVAL);
  }

  function initAlphabetTabs() {
    const tabs = document.querySelectorAll('.region-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', function () {
        tabs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        const key = this.getAttribute('data-region');
        document.querySelectorAll('.region-content').forEach(c => c.classList.add('hidden'));
        byId(`${key}-indices`)?.classList.remove('hidden');
      });
    });
  }

  // Nouvelle fonction pour activer l'onglet par défaut
  function initDefaultTab() {
    // Active la lettre "A" par défaut
    const defaultTab = document.querySelector('.region-tab[data-region="a"]');
    const defaultContent = document.getElementById('a-indices');
    
    if (defaultTab && defaultContent) {
      // Active l'onglet "A"
      document.querySelectorAll('.region-tab').forEach(t => t.classList.remove('active'));
      defaultTab.classList.add('active');
      
      // Affiche le contenu de "A"
      document.querySelectorAll('.region-content').forEach(c => c.classList.add('hidden'));
      defaultContent.classList.remove('hidden');
    }
  }

  function createAlphabetSections() {
    const container = byId('indices-container');
    if (!container) return;
    const abc = 'abcdefghijklmnopqrstuvwxyz'.split('');

    abc.forEach(letter => {
      if (byId(`${letter}-indices`)) return;
      const wrap = document.createElement('div');
      wrap.id = `${letter}-indices`;
      wrap.className = 'region-content hidden';
      wrap.innerHTML = `
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>NOM</th>
                <th>SYMBOLE</th>
                <th>PRIX</th>
                <th>% 24H</th>
                <th>% 7J</th>
                <th>% 30J</th>
                <th>% 90J</th>
                <th>VOL 7J (ann.)</th>
                <th>VOL 30J (ann.)</th>
              </tr>
            </thead>
            <tbody id="${letter}-indices-body"></tbody>
          </table>
        </div>
      `;
      container.appendChild(wrap);
    });
  }

  // --------- Utilitaires ---------
  function csvToObjects(text) {
    // parsing amélioré pour gérer les virgules dans les valeurs entre guillemets
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
      // Gère les valeurs avec virgules entre guillemets
      const cells = line.match(/(".*?"|[^,]+)/g)?.map(c => 
        c.trim().replace(/^"|"$/g, '')
      ) || [];
      
      const obj = {};
      headers.forEach((h, i) => (obj[h] = cells[i] ?? ''));
      return obj;
    });
  }

  function organizeByLetter(coins) {
    const res = {};
    'abcdefghijklmnopqrstuvwxyz'.split('').forEach(l => (res[l] = []));
    coins.forEach(c => {
      const l = (c.name?.[0] || '').toLowerCase();
      if (res[l]) res[l].push(c);
    });
    return res;
  }

  function topN(arr, val, n, dir = 'desc') {
    const copy = arr.filter(x => Number.isFinite(val(x)));
    copy.sort((a, b) => val(a) - val(b));
    return dir === 'desc' ? copy.slice(-n).reverse() : copy.slice(0, n);
  }

  function toNum(x) {
    if (x === null || x === undefined) return NaN;
    if (typeof x === 'number') return x;
    const s = String(x).replace(/[%\s]/g, '');
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : NaN;
  }

  function maxDate(list) {
    const valid = list.map(d => +new Date(d)).filter(n => Number.isFinite(n));
    if (!valid.length) return new Date().toISOString();
    return new Date(Math.max(...valid)).toISOString();
  }

  function isStale(tsISO, maxAgeMs) {
    const t = +new Date(tsISO);
    return !Number.isFinite(t) ? false : (Date.now() - t) > maxAgeMs;
  }

  function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function byId(id) { return document.getElementById(id); }
  function show(id) { byId(id)?.classList.remove('hidden'); }
  function hide(id) { byId(id)?.classList.add('hidden'); }

  function valClass(v) {
    if (!Number.isFinite(v) || v === 0) return 'neutral';
    return v > 0 ? 'positive' : 'negative';
  }

  function formatPct(v) {
    if (!Number.isFinite(v)) return '-';
    const sign = v > 0 ? '+' : v < 0 ? '' : '';
    return `${sign}${v.toFixed(2)}%`;
  }

  function formatPrice(p, quote) {
    if (!Number.isFinite(p)) return '-';
    const symbol = (quote || '').toLowerCase().includes('euro') ? '€' : '$';
    return `${symbol}${p.toLocaleString('fr-FR', { maximumFractionDigits: 8 })}`;
  }

  function showNotification(message, type = 'info') {
    let el = document.querySelector('.notification-popup');
    if (!el) {
      el = document.createElement('div');
      el.className = 'notification-popup';
      el.style.position = 'fixed';
      el.style.bottom = '20px';
      el.style.right = '20px';
      el.style.padding = '15px 25px';
      el.style.borderRadius = '4px';
      el.style.zIndex = '1000';
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      document.body.appendChild(el);
    }
    el.style.backgroundColor = 'rgba(0, 255, 135, 0.1)';
    el.style.borderLeft = '3px solid var(--accent-color)';
    el.style.color = 'var(--text-color)';
    if (type === 'warning') { el.style.borderLeft = '3px solid #FFC107'; el.style.color = '#FFC107'; }
    if (type === 'success') { el.style.borderLeft = '3px solid var(--accent-color)'; el.style.color = 'var(--accent-color)'; }
    el.textContent = message;
    setTimeout(() => {
      el.style.opacity = '1'; el.style.transform = 'translateY(0)';
      setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(20px)'; setTimeout(() => el.remove(), 300); }, 4000);
    }, 100);
  }

  function updateMarketTime() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const el = byId('marketTime');
    if (el) el.textContent = `${hh}:${mm}:${ss}`;
  }

  function initTheme() {
    const btn = byId('theme-toggle-btn');
    const darkIcon = byId('dark-icon');
    const lightIcon = byId('light-icon');
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
      document.body.classList.remove('dark'); document.body.classList.add('light'); document.documentElement.classList.remove('dark');
      darkIcon.style.display = 'none'; lightIcon.style.display = 'block';
    } else {
      document.body.classList.add('dark'); document.body.classList.remove('light'); document.documentElement.classList.add('dark');
      darkIcon.style.display = 'block'; lightIcon.style.display = 'none';
    }
    btn.addEventListener('click', () => {
      document.body.classList.toggle('dark'); document.body.classList.toggle('light'); document.documentElement.classList.toggle('dark');
      const isDark = document.body.classList.contains('dark');
      darkIcon.style.display = isDark ? 'block' : 'none';
      lightIcon.style.display = isDark ? 'none' : 'block';
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
  }

  // --------- Données de démo (fallback visuel) ---------
  function loadDemoData() {
    const demo = [
      { name: "Bitcoin",  symbol: "BTC", quote: "US Dollar", price: 62150.25, ret1d: 1.2,  ret7d: 3.5,  ret30d: 12.2, ret90d: 45.8,  vol7: 68.5, vol30: 72.3, atr14: 3.2, dd90: -18.5 },
      { name: "Ethereum", symbol: "ETH", quote: "US Dollar", price: 3340.18,  ret1d: 2.5,  ret7d: 4.1,  ret30d: 10.0, ret90d: 32.9,  vol7: 75.2, vol30: 78.9, atr14: 4.1, dd90: -22.3 },
      { name: "Solana",   symbol: "SOL", quote: "US Dollar", price: 146.75,   ret1d: 5.3,  ret7d: 7.5,  ret30d: 22.0, ret90d: 120.1, vol7: 95.3, vol30: 98.7, atr14: 5.8, dd90: -35.2 },
      { name: "Cardano",  symbol: "ADA", quote: "US Dollar", price: 0.65,     ret1d: -1.2, ret7d: -2.5, ret30d: 5.0,  ret90d: -12.5, vol7: 82.1, vol30: 85.6, atr14: 4.5, dd90: -42.1 },
    ];
    cryptoData.indices = organizeByLetter(demo);
    cryptoData.meta = { timestamp: new Date().toISOString(), count: demo.length, isStale: false, source: 'demo avec volatilité' };
    cryptoData.top_performers = {
      daily: { best: topN(demo, c => c.ret1d, 10, 'desc'), worst: topN(demo, c => c.ret1d, 10, 'asc') },
      qtr:   { best: topN(demo, c => c.ret90d, 10, 'desc'), worst: topN(demo, c => c.ret90d, 10, 'asc') }
    };
    renderCryptoData();
    updateTopTenCrypto();
    showNotification('Utilisation de données de démonstration', 'warning');
  }
});