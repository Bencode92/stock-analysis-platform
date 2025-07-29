/* ---------------------------------------------------------------------
 * news-hierarchy.js — v2025‑07‑29
 * Système de hiérarchisation + filtrage géographique intelligent
 * --------------------------------------------------------------------*/

/***** 1.  Constantes « géographie » ****************************************/
// (1‑a)  Table mots‑clés → codes ISO‑2
const COUNTRY_KEYWORDS = [
  // 🇺🇸 United States
  { iso: 'us', rx: /\b(?:s&p\s*500|dow jones|nasdaq|usd\b|\bu\.s\.?(?:a)?\b|wall street|federal reserve|treasur(?:y|ies)|washington)\b/i },
  // 🇫🇷 France
  { iso: 'fr', rx: /\b(?:cac\s*40|euronext paris|banque de france|\beur\b|paris)\b/i },
  // 🇬🇧 United Kingdom
  { iso: 'gb', rx: /\b(?:ftse(?:\s*100)?|bank of england|london|\bboe\b|\bgbp\b|pound sterling)\b/i },
  // 🇯🇵 Japan
  { iso: 'jp', rx: /\b(?:nikkei|topix|tokyo|\bboj\b|\byen\b|\bjpy\b)\b/i },
  // 🇨🇳 China
  { iso: 'cn', rx: /\b(?:shanghai composite|shenzhen|csi\s*300|pbo[cs]|yuan\b|cny\b|beijing)\b/i },
  // …complétez au besoin
];

// (1‑b)  Groupes régionaux qui apparaissent dans le <select>
const COUNTRY_GROUPS = {
  eu:   ['de','es','it','nl','be','se','ch','at','fi','dk','pt','ie','no','gr','pl','cz','hu','ro','sk','si','bg','hr','lu'],
  asia: ['cn','jp','kr','in','id','th','sg','hk','my','tw','vn','ph'],
  em:   ['br','mx','za','tr','ru','sa','qa','ae','cl','co','pe','eg','ng']
};

// (1‑c)  Dictionnaire de normalisation (au cas où)
const COUNTRY_NAME_TO_ISO = {
  'états-unis': 'us',
  'etats-unis': 'us',
  'france': 'fr',
  'royaume-uni': 'gb',
  'japon': 'jp',
  'chine': 'cn',
  'europe': 'eu',
  'asie': 'asia',
  'marchés émergents': 'em',
  'marches emergents': 'em'
};

// (1‑d)  Fonction de normalisation
function normalizeCountryCode(value) {
  if (!value) return 'all';
  const normalized = value.toLowerCase().trim();
  // Si c'est déjà un code ISO ou un groupe, on le retourne
  if (['all', 'us', 'fr', 'gb', 'jp', 'cn', 'eu', 'asia', 'em'].includes(normalized)) {
    return normalized;
  }
  // Sinon on cherche dans le dictionnaire
  return COUNTRY_NAME_TO_ISO[normalized] || normalized;
}

// (1‑e)  Détection rapide
function detectCountries(text = '') {
  const found = new Set();
  for (const { iso, rx } of COUNTRY_KEYWORDS) {
    if (rx.test(text)) found.add(iso);
  }
  return [...found];                // ex. ["us","ca"]
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

  card.innerHTML = `
    <header class="flex items-center gap-2 mb-3 flex-wrap">
      <span class="badge badge-${item.impact} uppercase text-xs px-2 py-1 rounded font-semibold ${getImpactBadgeClass(item.impact)}">${impactText}</span>
      <span class="chip text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300">${categoryLabel}</span>
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

  // 6‑d. Enrichissement géographie + hiérarchie
  allNews.forEach(n => {
    /* geo */
    if (!n.country || n.country==='other'){
      const corpus = [n.title,n.snippet,n.content,n.source].filter(Boolean).join('  ');
      const iso   = detectCountries(corpus);
      n.country   = iso.length ? iso.join(',') : 'other';
    } else {
      n.country = n.country.toLowerCase();
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

/***** 9.  Filtrage dynamique *********************************************/
window.NewsSystem.filterNews = filterNews;

// Ecouteur sur le <select id="country-select">
document.addEventListener('DOMContentLoaded',()=>{
  const sel=document.getElementById('country-select');
  if(sel) sel.addEventListener('change',e=>filterNews('country',e.target.value.toLowerCase()));
});

function filterNews(type,val){
  const cards=document.querySelectorAll('.news-card');
  // récupérer filtres actuels
  const currentCategory = document.querySelector('#category-filters .filter-active')?.getAttribute('data-category') || 'all';
  const currentImpact   = document.getElementById('impact-select')?.value || 'all';
  const currentSent     = document.getElementById('sentiment-select')?.value || 'all';
  let currentCountry  = (type==='country'?val:(document.getElementById('country-select')?.value||'all')).toLowerCase();
  
  // Normaliser le pays avec notre dictionnaire
  currentCountry = normalizeCountryCode(currentCountry);

  cards.forEach(card=>{
    const cat = card.getAttribute('data-category');
    const imp = card.getAttribute('data-impact');
    const sen = card.getAttribute('data-sentiment');
    const ctry= card.getAttribute('data-country');      // ex "us" ou "us,gb"

    const matchCat = currentCategory==='all' || cat===currentCategory;
    const matchImp = currentImpact==='all'  || imp===currentImpact;
    const matchSen = currentSent==='all'    || sen===currentSent;

    // Trim les espaces dans la liste ISO
    const isoList = ctry.split(',').map(s => s.trim());
    const matchCtry = currentCountry==='all' ||
                      isoList.includes(currentCountry) ||
                      (COUNTRY_GROUPS[currentCountry]||[]).some(x=>isoList.includes(x));

    const visible = matchCat && matchImp && matchSen && matchCtry;
    card.style.display = visible?'flex':'none';
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