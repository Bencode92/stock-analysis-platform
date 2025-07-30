/* ---------------------------------------------------------------------
 * news-hierarchy.js — v2025‑07‑30
 * Système de hiérarchisation simplifié
 * --------------------------------------------------------------------*/

/***** 1.  Constantes « géographie » ****************************************/

// (1‑a) Dictionnaire des mots-clés par pays (pour badges uniquement)
const GEO_KEYWORDS = {
  us: ['s&p 500', 'nasdaq', 'dow jones', 'fomc', 'fed', 'federal reserve', 
       'washington', 'capitol hill', 'white house', 'irs', 'treasury', 
       'department of commerce', 'wall street', 'u.s.', 'usa', 'united states'],
  fr: ['cac 40', 'euronext paris', 'banque de france', 'elysée', 
       'bourse de paris', 'palais bourbon', 'matignon'],
  gb: ['ftse', 'bank of england', 'london stock exchange', 'threadneedle street', 
       'downing street', 'westminster', 'boe', 'gbp', 'pound sterling', 'uk'],
  jp: ['nikkei', 'topix', 'boj', 'bank of japan', 'tokyo', 'jpy', 'yen'],
  cn: ['shanghai composite', 'csi 300', 'pboc', 'yuan', 'cny', 'beijing', 'npc'],
  eu: ['european union', 'union européenne', 'brussels', 'european commission',
       'ecb', 'european central bank', 'eu-wide', 'eurozone', 'eur'],
  de: ['dax', 'frankfurt', 'bundesbank', 'berlin', 'munich'],
  ca: ['tsx', 'toronto stock', 'bank of canada', 'ottawa', 'cad'],
  au: ['asx', 'sydney', 'melbourne', 'aud', 'rba', 'reserve bank of australia'],
  in: ['sensex', 'nifty', 'mumbai', 'delhi', 'inr', 'rupee'],
  kr: ['kospi', 'seoul', 'krw', 'won', 'bank of korea']
};

// Génération automatique des regex à partir du dictionnaire
const COUNTRY_KEYWORDS = Object.entries(GEO_KEYWORDS).map(
  ([iso, list]) => ({
    iso,
    rx: new RegExp(`\\b(?:${list.join('|')})\\b`, 'i')
  })
);

// (1‑b) Paires de pays courantes (génération automatique)
const COUNTRY_PAIRS = [
  ['us', 'eu'], ['us', 'cn'], ['us', 'jp'],
  ['eu', 'cn'], ['eu', 'gb'], ['gb', 'fr'],
  ['us', 'ca'], ['cn', 'au'], ['jp', 'kr']
];

const EXTRA_PAIR_RULES = [];
for (const [a, b] of COUNTRY_PAIRS) {
  const reg = new RegExp(`(?:${a}\\s*[-–—/&]?(?:and)?\\s*${b}|${b}\\s*[-–—/&]?(?:and)?\\s*${a})`, 'i');
  EXTRA_PAIR_RULES.push({ a, b, rx: reg });
}

// (1‑c) Fonction de déduplication
const canonicalizeCountries = list =>
  [...new Set(list.map(c => c.trim().toLowerCase()).filter(Boolean))];

// (1‑d) Détection rapide améliorée
function detectCountries(text = '') {
  const found = new Set();
  
  // Détection standard par mots-clés
  for (const { iso, rx } of COUNTRY_KEYWORDS) {
    if (rx.test(text)) found.add(iso);
  }
  
  // Détection des paires de pays
  for (const { a, b, rx } of EXTRA_PAIR_RULES) {
    if (rx.test(text)) {
      found.add(a);
      found.add(b);
    }
  }
  
  // Patterns spécifiques pour les relations commerciales
  if (/trade\s+(?:war|dispute|deal|agreement).*(?:between|avec)/i.test(text)) {
    const afterBetween = text.match(/(?:between|avec)\s+(\w+\s+(?:and|et)\s+\w+)/i);
    if (afterBetween) {
      const countries = afterBetween[1].split(/\s+(?:and|et)\s+/i);
      countries.forEach(c => {
        const normalized = normalizeIso(c.trim());
        if (normalized && normalized !== c.toLowerCase()) {
          found.add(normalized);
        }
      });
    }
  }
  
  return [...found];
}

/***** 2.  Namespace principal *********************************************/
window.NewsSystem = {
  data: null,
  isLoading: false,
  categorizedNews: { critical: [], important: [], regular: [] },
  dataReadyEvent: new CustomEvent('newsDataReady')
};

// Limites d'affichage par tier
const MAX_CRITICAL_NEWS  = 5;
const MAX_IMPORTANT_NEWS = 8;
const MAX_REGULAR_NEWS   = 12;

const MAX_NEWS_DAYS = 4;   // récence max affichée

// Traduction des catégories back‑end → front‑end
const CATEGORY_BACKEND_TO_FRONTEND = {
  companies: 'entreprises',
  economy:   'economie',
  markets:   'marches',
  tech:      'tech',
  crypto:    'crypto',
  general:   'general'
};

/***** 3.  Boot *************************************************************/
document.addEventListener('DOMContentLoaded', () => {
  const anyNewsContainer = document.getElementById('critical-news-container') ||
                           document.getElementById('important-news-container') ||
                           document.getElementById('recent-news');
  if (anyNewsContainer) initializeNewsData();
});

/***** 4.  Chargement données **********************************************/
async function initializeNewsData() {
  if (window.NewsSystem.isLoading) return;
  window.NewsSystem.isLoading = true;

  try {
    showLoadingState('critical-news-container');
    showLoadingState('important-news-container');
    showLoadingState('recent-news');

    const res = await fetch('data/news.json');
    if (!res.ok) throw new Error('Impossible de charger les données');

    const data = await res.json();
    window.NewsSystem.data = data;

    distributeNewsByImportance(data);

    document.dispatchEvent(window.NewsSystem.dataReadyEvent);
  } catch (err) {
    console.error(err);
    displayFallbackData();
  } finally {
    window.NewsSystem.isLoading = false;
  }
}

/***** 5.  Construction des cartes *****************************************/
function buildNewsCard(item, impactText, impactColor, sentimentIcon, index, tier) {
  const card = document.createElement('div');
  card.className = `news-card relative flex flex-col rounded-xl p-6 border border-${impactColor} bg-zinc-900 transition hover:shadow-lg min-h-[240px] cursor-pointer`;
  card.style.animationDelay = `${index * 0.1}s`;

  const mappedCategory = CATEGORY_BACKEND_TO_FRONTEND[item.category] || item.category;

  card.setAttribute('data-score', item.importance_score || item.imp || 0);
  card.setAttribute('data-category', mappedCategory);
  ['impact','sentiment','country'].forEach(k => card.setAttribute(`data-${k}`, item[k] || 'unknown'));

  card.setAttribute('data-news-id', `news-${tier}-${index}`);
  if (item.url) {
    card.classList.add('clickable-news');
    card.addEventListener('click', () => window.open(item.url, '_blank', 'noopener'));
  }

  const tmp = new DOMParser().parseFromString(item.content || item.snippet || '', 'text/html');
  let content = (tmp.body.textContent || '').replace(/\s+/g,' ').trim();
  const CHAR_LIMIT = { regular:120, important:180, critical:220 }[tier] ?? 160;
  if (content.length > CHAR_LIMIT) content = content.slice(0, CHAR_LIMIT-1) + '…';
  const descClamp = tier==='regular' ? 'line-clamp-3' : 'line-clamp-4';

  const categoryLabel = getCategoryLabel(item.category);
  const countryBadges = getCountryBadges(item.country);

  card.innerHTML = `
    <header class="flex items-center gap-2 mb-3 flex-wrap">
      <span class="badge badge-${item.impact} uppercase text-xs px-2 py-1 rounded font-semibold ${getImpactBadgeClass(item.impact)}">${impactText}</span>
      <span class="chip text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300">${categoryLabel}</span>
      ${countryBadges}
    </header>
    <h3 class="title text-lg font-bold line-clamp-2 text-white mb-3">${item.title}</h3>
    <p class="desc text-sm text-zinc-300 ${descClamp} flex-grow mb-4"></p>
    <footer class="footer mt-auto flex justify-between items-center text-xs">
      <span class="text-emerald-400 font-medium">${item.source || '—'}</span>
      <div class="flex items-center gap-2">
        <span class="sentiment-icon">${sentimentIcon}</span>
        <span class="date-time text-xs text-zinc-500">${item.date || ''} ${item.time || ''}</span>
        ${item.url ? '<span class="text-zinc-500"><i class="fas fa-external-link-alt"></i></span>' : ''}
      </div>
    </footer>`;
  card.querySelector('.desc').innerText = content;
  return card;
}

// Fonction pour afficher les badges de pays (avec déduplication)
function getCountryBadges(countries) {
  if (!countries || countries === 'other') return '';
  
  const countryList = canonicalizeCountries(countries.split(','));
  if (!countryList.length || (countryList.length === 1 && countryList[0] === 'other')) return '';
  
  const flags = {
    us: '🇺🇸', fr: '🇫🇷', gb: '🇬🇧', jp: '🇯🇵', cn: '🇨🇳', eu: '🇪🇺',
    de: '🇩🇪', ca: '🇨🇦', au: '🇦🇺', in: '🇮🇳', kr: '🇰🇷'
  };
  
  return countryList
    .filter(iso => iso !== 'other')
    .map(iso => {
      const flag = flags[iso] || '';
      const label = iso.toUpperCase();
      return `<span class="text-xs px-1.5 py-0.5 rounded bg-blue-900 bg-opacity-30 text-blue-300 border border-blue-700">${flag} ${label}</span>`;
    })
    .join('');
}

function getCategoryLabel(cat){
  const m = CATEGORY_BACKEND_TO_FRONTEND[cat] || cat;
  const lbl = { entreprises:'ENTREPRISES', economie:'ÉCONOMIE', marches:'MARCHÉS', tech:'TECH', crypto:'CRYPTO', general:'GÉNÉRAL' };
  return lbl[m] || (m||'général').toUpperCase();
}
function getImpactBadgeClass(impact){
  switch(impact){
    case 'negative':            return 'bg-red-800 text-red-200 border border-red-600';
    case 'slightly_negative':   return 'bg-red-900 text-red-300 border border-red-700';
    case 'positive':            return 'bg-emerald-800 text-emerald-200 border border-emerald-600';
    case 'slightly_positive':   return 'bg-emerald-900 text-emerald-300 border border-emerald-700';
    default:                    return 'bg-yellow-800 text-yellow-200 border border-yellow-600';
  }
}
function getImpactBorderColor(impact){
  return ['negative','slightly_negative'].includes(impact) ? 'red-600' :
         ['positive','slightly_positive'].includes(impact) ? 'emerald-600' : 'yellow-600';
}
function getSentimentIcon(s){
  return ['positive','slightly_positive'].includes(s) ? '⬆️' :
         ['negative','slightly_negative'].includes(s) ? '⬇️' : '➖';
}

/***** 6.  Hiérarchisation & enrichissement *******************************/
// Alias simples pour convertir les libellés pays du backend → codes ISO‑2
const COUNTRY_ALIAS = {
  'united states':'us','u.s.':'us','usa':'us','états-unis':'us','us':'us',
  'united-states':'us','us-stocks':'us','us_news':'us','us-news':'us',
  'france':'fr','french':'fr','fr':'fr',
  'united kingdom':'gb','great britain':'gb','uk':'gb','gb':'gb',
  'japan':'jp','jp':'jp','japanese':'jp',
  'china':'cn','cn':'cn','chinese':'cn',
  'european union':'eu','union européenne':'eu','ue':'eu','eu':'eu',
  'germany':'de','deutschland':'de','allemagne':'de','de':'de',
  'canada':'ca','ca':'ca','canadian':'ca',
  'australia':'au','au':'au','australian':'au',
  'india':'in','in':'in','indian':'in',
  'south korea':'kr','korea':'kr','kr':'kr','korean':'kr'
};

function normalizeIso(raw){
  if(!raw) return '';
  const k = raw.trim().toLowerCase();
  
  // Si c'est dans le dictionnaire
  if (k in COUNTRY_ALIAS) return COUNTRY_ALIAS[k];
  
  // Règles robustes par préfixe
  if (k.startsWith('us') || k.startsWith('united states')) return 'us';
  if (k.startsWith('fr')) return 'fr';
  if (k.startsWith('gb') || k.startsWith('uk')) return 'gb';
  if (k.startsWith('jp')) return 'jp';
  if (k.startsWith('cn') || k.startsWith('china')) return 'cn';
  if (k.startsWith('eu') || k.startsWith('europe')) return 'eu';
  if (k.startsWith('de') || k.startsWith('german')) return 'de';
  if (k.startsWith('ca') || k.startsWith('canad')) return 'ca';
  if (k.startsWith('au') || k.startsWith('austral')) return 'au';
  if (k.startsWith('in') || k.startsWith('india')) return 'in';
  if (k.startsWith('kr') || k.startsWith('korea')) return 'kr';
  
  return k; // sinon on garde tel quel
}

function distributeNewsByImportance(newsData){
  if (!newsData){ console.error('No data'); return; }

  // 6‑a. Fusionner toutes les régions
  let allNews = [];
  Object.keys(newsData).forEach(k => Array.isArray(newsData[k]) && (allNews = allNews.concat(newsData[k])));

  // 6‑b. Exclude some types
  const excludedTypes = ['economic','ipo','m&a'];
  allNews = allNews.filter(n => !excludedTypes.includes((n.type||'').toLowerCase()));

  // 6‑c. Filtre récence ≤ 4 jours
  const MS_PER_DAY = 864e5, today = new Date();
  allNews = allNews.filter(n => {
    const d = n.date?.includes('/')
      ? new Date(n.date.split('/').reverse().join('-')+'T00:00:00')
      : new Date(n.date);
    return d && !isNaN(d) && (today - d)/MS_PER_DAY <= MAX_NEWS_DAYS;
  });

  // 6‑d. Enrichissement géographie + hiérarchie (avec déduplication)
  allNews.forEach(n => {
    /* geo */
    let rawCtry = (n.country||'').toLowerCase();
    if (!rawCtry || rawCtry==='other'){
      const corpus = [n.title,n.snippet,n.content,n.source].filter(Boolean).join('  ');
      const iso = detectCountries(corpus);
      n.country = iso.length ? canonicalizeCountries(iso).join(',') : 'other';
    } else {
      // on convertit le label fourni par l'API → code ISO‑2 standard
      n.country = canonicalizeCountries(
        normalizeIso(rawCtry).split(',')
      ).join(',');
    }

    /* hiérarchie (simple rule based sur imp / ML) */
    if (!n.importance_level){
      const s = parseFloat(n.imp || n.quality_score || 0);
      n.importance_level = s>=80?'critical': s>=60?'important':'general';
    }
    n.hierarchy = (n.importance_level==='general')?'normal':n.importance_level.toLowerCase();
    n.importance_score = n.imp || n.quality_score || 0;
    n.impact    = n.impact    || 'neutral';
    n.sentiment = n.sentiment || n.impact;
  });

  // 6‑e. Tri + stockage
  const byTier = tier => allNews.filter(n => n.hierarchy===tier)
                                .sort((a,b)=>b.importance_score - a.importance_score);
  const criticalNews = byTier('critical');
  const importantNews= byTier('important');
  const regularNews  = byTier('normal');
  window.NewsSystem.categorizedNews = { critical:criticalNews, important:importantNews, regular:regularNews };

  displayCriticalNews(criticalNews);
  displayImportantNews(importantNews);
  displayRecentNews(regularNews);
}

/***** 7.  Affichage par tier *********************************************/
function displayCriticalNews(list){ paintTier(list,'critical-news-container','critical',MAX_CRITICAL_NEWS); }
function displayImportantNews(list){ paintTier(list,'important-news-container','important',MAX_IMPORTANT_NEWS); }
function displayRecentNews(list){ paintTier(list,'recent-news','regular',MAX_REGULAR_NEWS,true); }

function paintTier(list,containerId,tier,max,grid=false){
  const c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML='';
  if (grid){ c.className='grid grid-cols-1 md:grid-cols-2 gap-4'; }
  if (!list.length){
    c.innerHTML='<p class="text-center text-gray-400 col-span-full">Aucune actualité</p>';
    return;
  }
  list.slice(0,max).forEach((item,i)=>{
    const card = buildNewsCard(item,getImpactText(item.impact),getImpactBorderColor(item.impact),getSentimentIcon(item.sentiment),i,tier);
    c.appendChild(card);
  });
}

/***** 8.  Utilitaires divers *********************************************/
function showLoadingState(id){
  const c=document.getElementById(id); if(!c)return;
  c.innerHTML='<div class="flex items-center justify-center p-8"><div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-400 mr-3"></div><p class="text-zinc-400">Chargement…</p></div>';
}
function displayFallbackData(){ ['critical-news-container','important-news-container','recent-news'].forEach(id=>{
  const c=document.getElementById(id); if(!c)return;
  c.innerHTML='<div class="bg-zinc-800 bg-opacity-70 rounded-lg p-6 text-center"><i class="fas fa-exclamation-triangle text-yellow-400 text-3xl mb-3"></i><h3 class="text-white font-medium mb-2">Erreur de chargement</h3><p class="text-zinc-400 mb-4">Impossible de récupérer les actualités.</p><button class="retry-button bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded transition" onclick="initializeNewsData()"><i class="fas fa-sync-alt mr-2"></i>Réessayer</button></div>';
}); }
function getImpactText(i){return i==='negative'?'IMPACT NÉGATIF':i==='slightly_negative'?'IMPACT LÉGÈREMENT NÉGATIF':i==='positive'?'IMPACT POSITIF':i==='slightly_positive'?'IMPACT LÉGÈREMENT POSITIF':'IMPACT NEUTRE';}

/***** 9.  Filtrage dynamique simplifié ***********************************/
window.NewsSystem.filterNews = filterNews;

function filterNews(type,val){
  const cards=document.querySelectorAll('.news-card');

  // récupérer filtres actuels
  const currentCategory = document.querySelector('#category-filters .filter-active')?.getAttribute('data-category') || 'all';
  const currentImpact   = document.getElementById('impact-select')?.value || 'all';
  const currentSent     = document.getElementById('sentiment-select')?.value || 'all';

  cards.forEach(card=>{
    const cat  = card.getAttribute('data-category');
    const imp  = card.getAttribute('data-impact');
    const sen  = card.getAttribute('data-sentiment');

    const matchCat = currentCategory==='all' || cat===currentCategory;
    const matchImp = currentImpact==='all'   || imp===currentImpact;
    const matchSen = currentSent==='all'     || sen===currentSent;

    const visible = matchCat && matchImp && matchSen;
    card.style.display = visible ? 'flex' : 'none';
    card.classList.toggle('hidden',!visible);
  });

  checkVisibleItems();
}

function checkVisibleItems(){ ['recent-news','important-news-container','critical-news-container'].forEach(id=>{
  const cont=document.getElementById(id); if(!cont)return;
  const grid = cont.classList.contains('grid')?cont:cont.querySelector('.grid')||cont;
  const visible = grid.querySelectorAll('.news-card:not(.hidden)').length;
  let msg=grid.querySelector('.no-data-message');
  if(!visible && !msg){ msg=document.createElement('div'); msg.className='no-data-message flex flex-col items-center justify-center py-12 col-span-full'; msg.innerHTML='<i class="fas fa-filter text-zinc-600 text-4xl mb-4"></i><h3 class="text-white font-medium mb-2">Aucune actualité ne correspond à vos critères</h3><p class="text-zinc-400">Modifiez vos filtres pour voir d\'autres articles.</p>'; grid.appendChild(msg); }
  else if(visible && msg){ msg.remove(); }
}); }

/***** 10.  Exposition publique *******************************************/
window.NewsSystem.initializeNewsData = initializeNewsData;