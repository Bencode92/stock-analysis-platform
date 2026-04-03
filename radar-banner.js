/**
 * radar-banner.js — RADAR Market Intelligence overlay
 *
 * Shared module for marches.html and secteurs.html.
 * Loads market_context.json and injects:
 *   1. Regime banner (top of page)
 *   2. SIGNAL +/− badges on sector/market cards
 *   3. Collapsible "Signaux RADAR" section
 */

const RadarBanner = {

  data: null,

  // Sector key → data-sector attribute mapping
  SECTOR_MAP: {
    'energy':                  'energy',
    'financials':              'financials',
    'information-technology':  'technology',
    'communication-services':  'communication-services',
    'consumer-staples':        'consumer-staples',
    'consumer-discretionary':  'consumer-discretionary',
    'healthcare':              'healthcare',
    'industrials':             'industrials',
    'materials':               'materials',
    'utilities':               'utilities',
    'real-estate':             'real-estate',
  },

  // Market key → data-index attribute mapping (flexible)
  MARKET_MAP: {
    'brazil':         'brazil',
    'taiwan':         'taiwan',
    'turkey':         'turkey',
    'india':          'india',
    'germany':        'germany',
    'switzerland':    'switzerland',
    'italy':          'italy',
    'south-korea':    'korea',
    'japan':          'japan',
    'china':          'china',
    'france':         'france',
    'united-kingdom': 'uk',
    'mexico':         'mexico',
    'chile':          'chile',
    'argentina':      'argentina',
  },

  REASON_FR: {
    'sweet_spot':        'zone favorable',
    'w52_confirmed':     '52S confirme',
    'm6_confirmed':      '6M positif',
    'm3_confirmed':      '3M positif',
    'underperform':      'sous-performance',
    'cooling_m3':        'refroidissement 3M',
    'divergent':         'divergence YTD/52S',
    'high_beta_warning': 'beta élevé',
    'defensive_asset':   'actif défensif',
    'dead_zone':         'zone neutre',
    'overheat_w52':      'surchauffe 52S',
    'out_of_range':      'hors zone',
    'strong_momentum':   'momentum fort',
  },

  async init() {
    try {
      const resp = await fetch('data/market_context.json?' + Date.now());
      if (!resp.ok) return;
      this.data = await resp.json();
      this._renderBanner();
      this._renderSignalsSection();
      this._applyBadges();
    } catch (e) {
      console.warn('[RADAR]', e);
    }
  },

  // ═══════════════════════════════════════════════
  // 1. REGIME BANNER
  // ═══════════════════════════════════════════════
  _renderBanner() {
    const d = this.data;
    const regime = d.market_regime || 'neutral';
    const confidence = d.confidence || 0.5;
    const tilts = d.macro_tilts || {};
    const nFavored = (tilts.favored_sectors || []).length;
    const srp = d.sector_risk_profile || {};
    const nTotal = Object.keys(srp).length || 11;
    const nAvoided = (tilts.avoided_sectors || []).length;
    const nCooling = (d.key_trends || []).filter(t => t.includes('refroidissement')).length > 0
      ? parseInt(((d.key_trends || []).find(t => t.includes('refroidissement')) || '').match(/(\d+)/)?.[1] || '0')
      : 0;

    const regimeConfig = {
      'risk_on':  { label: 'RISK-ON',  color: '#4caf50', bg: 'rgba(76,175,80,0.08)',  border: 'rgba(76,175,80,0.25)' },
      'neutral':  { label: 'NEUTRE',   color: '#ff9800', bg: 'rgba(255,152,0,0.08)', border: 'rgba(255,152,0,0.25)' },
      'risk_off': { label: 'RISK-OFF', color: '#f44336', bg: 'rgba(244,67,54,0.08)', border: 'rgba(244,67,54,0.25)' },
      'caution':  { label: 'PRUDENCE', color: '#ff9800', bg: 'rgba(255,152,0,0.08)', border: 'rgba(255,152,0,0.25)' },
    };
    const cfg = regimeConfig[regime] || regimeConfig.neutral;

    // Confidence bars (1-5)
    const confBars = Math.round(confidence * 5);
    const bars = Array.from({length: 5}, (_, i) =>
      `<span style="display:inline-block;width:4px;height:${10 + i * 2}px;border-radius:1px;margin:0 1px;background:${i < confBars ? cfg.color : 'rgba(255,255,255,0.1)'};vertical-align:bottom;"></span>`
    ).join('');

    const asOf = d.as_of ? new Date(d.as_of).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';

    const banner = document.createElement('div');
    banner.id = 'radar-banner';
    banner.style.cssText = `padding:0.6rem 1.2rem;background:${cfg.bg};border:1px solid ${cfg.border};border-radius:10px;margin-bottom:1.5rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;`;
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.8rem;">
        <span style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);">RADAR</span>
        <span style="font-weight:700;color:${cfg.color};font-size:0.9rem;">${cfg.label}</span>
        <span style="display:flex;align-items:end;gap:0;">${bars}</span>
      </div>
      <div style="display:flex;gap:1.2rem;flex-wrap:wrap;font-size:0.75rem;color:var(--text-muted);">
        <span><strong style="color:#4caf50;">${nFavored}</strong> secteur${nFavored > 1 ? 's' : ''} SIGNAL+</span>
        <span><strong style="color:#f44336;">${nAvoided}</strong> secteur${nAvoided > 1 ? 's' : ''} SIGNAL−</span>
        ${nCooling ? `<span><strong style="color:#ff9800;">${nCooling}</strong> en refroidissement</span>` : ''}
        ${asOf ? `<span style="opacity:0.5;">${asOf}</span>` : ''}
      </div>
    `;

    // Insert before the overview section
    const target = document.querySelector('.market-overview-section') || document.querySelector('.sector-overview-section');
    if (target) {
      target.parentNode.insertBefore(banner, target);
    }
  },

  // ═══════════════════════════════════════════════
  // 2. BADGES SIGNAL+/SIGNAL− on cards
  // ═══════════════════════════════════════════════
  // Determine badge type from classification + reason
  // Returns: 'favored' | 'avoided' | 'warning' | null
  _getBadgeType(classification, reason) {
    if (classification === 'favored') return 'favored';
    if (classification === 'avoided') return 'avoided';
    // Warning: rescued from avoided BUT still cooling or divergent
    if (reason && reason.includes('avoided_rescued_w52_positive')) {
      if (reason.includes('cooling_m3') || reason.includes('divergent')) {
        return 'warning';
      }
    }
    // Also flag cooling sectors even if neutral
    if (reason && reason.includes('cooling_m3') && reason.includes('underperform')) {
      return 'warning';
    }
    return null;
  },

  _applyBadges() {
    const d = this.data;
    const srp = d.sector_risk_profile || {};
    const rrp = d.region_risk_profile || {};

    // Sector badges (from sector_risk_profile with reason)
    for (const [sectorKey, profile] of Object.entries(srp)) {
      const badge = this._getBadgeType(profile.classification, profile.reason);
      if (!badge) continue;

      const dataAttr = this.SECTOR_MAP[sectorKey];
      if (!dataAttr) continue;

      const cards = document.querySelectorAll(`.sector-col[data-sector="${dataAttr}"], .market-index-col[data-sector="${dataAttr}"]`);
      cards.forEach(card => this._addBadgeToCard(card, badge, profile, '.sector-name'));
    }

    // Market/region badges (from region_risk_profile with reason)
    for (const [regionKey, profile] of Object.entries(rrp)) {
      const badge = this._getBadgeType(profile.classification, profile.reason);
      if (!badge) continue;

      const dataAttr = this.MARKET_MAP[regionKey];
      if (!dataAttr) continue;

      const cards = document.querySelectorAll(`.market-index-col[data-index="${dataAttr}"]`);
      cards.forEach(card => this._addBadgeToCard(card, badge, profile, '.market-index-name'));
    }
  },

  _addBadgeToCard(card, badgeType, profile, nameSelector) {
    const nameEl = card.querySelector(nameSelector);
    if (!nameEl) return;
    if (card.querySelector('.radar-badge')) return;

    const configs = {
      favored: { color: '#4caf50', label: 'SIGNAL +' },
      avoided: { color: '#f44336', label: 'SIGNAL −' },
      warning: { color: '#ff9800', label: 'SIGNAL ↓' },
    };
    const cfg = configs[badgeType];
    if (!cfg) return;

    const badge = document.createElement('span');
    badge.className = 'radar-badge';
    badge.style.cssText = `display:inline-block;font-size:0.55rem;padding:1px 5px;border-radius:4px;margin-left:6px;font-weight:700;letter-spacing:0.5px;background:${cfg.color}22;color:${cfg.color};vertical-align:middle;`;
    badge.textContent = cfg.label;

    // Tooltip from reason
    const reason = profile?.reason || '';
    const tooltipParts = reason.split('|').filter(Boolean).map(r => this.REASON_FR[r] || r).slice(0, 3);
    if (tooltipParts.length) badge.title = tooltipParts.join(' · ');

    nameEl.appendChild(badge);
  },

  // ═══════════════════════════════════════════════
  // 3. SIGNAUX RADAR section (collapsible)
  // ═══════════════════════════════════════════════
  _renderSignalsSection() {
    const d = this.data;
    const trends = d.key_trends || [];
    const risks = d.risks || [];
    const srp = d.sector_risk_profile || {};

    if (trends.length === 0 && risks.length === 0) return;

    // Build signal items
    let items = '';
    for (const t of trends) {
      items += `<div style="padding:0.3rem 0;font-size:0.78rem;color:rgba(255,255,255,0.7);">
        <span style="color:#4caf50;margin-right:0.3rem;">▲</span> ${t}
      </div>`;
    }
    for (const r of risks) {
      items += `<div style="padding:0.3rem 0;font-size:0.78rem;color:rgba(255,255,255,0.7);">
        <span style="color:#f44336;margin-right:0.3rem;">▼</span> ${r}
      </div>`;
    }

    // Sector risk flags
    const flagged = Object.entries(srp).filter(([_, p]) => p.risk_flag);
    if (flagged.length > 0) {
      items += '<div style="margin-top:0.5rem;border-top:1px solid rgba(255,255,255,0.06);padding-top:0.5rem;">';
      for (const [key, p] of flagged) {
        const label = key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const flag = this.REASON_FR[p.risk_flag] || p.risk_flag;
        items += `<div style="padding:0.2rem 0;font-size:0.72rem;color:rgba(255,255,255,0.5);">
          <span style="color:#ff9800;">⚠</span> ${label}: ${flag} (beta ${p.beta?.toFixed(2) || '?'})
        </div>`;
      }
      items += '</div>';
    }

    const section = document.createElement('details');
    section.style.cssText = 'margin-bottom:1.5rem;';
    section.innerHTML = `
      <summary style="cursor:pointer;padding:0.6rem 1rem;background:var(--surface-1, rgba(255,255,255,0.03));border:1px solid var(--border-subtle, rgba(255,255,255,0.08));
        border-radius:10px;font-size:0.8rem;color:var(--text-muted, rgba(255,255,255,0.5));font-weight:600;list-style:none;display:flex;align-items:center;gap:0.5rem;">
        <i class="fas fa-satellite-dish" style="font-size:0.65rem;color:#ff9800;"></i>
        Signaux RADAR — ${trends.length} tendance${trends.length > 1 ? 's' : ''}, ${risks.length} risque${risks.length > 1 ? 's' : ''}
      </summary>
      <div style="padding:0.8rem 1rem;margin-top:0.3rem;background:var(--surface-1, rgba(255,255,255,0.03));border-radius:8px;">
        ${items}
      </div>
    `;

    // Insert after the banner
    const banner = document.getElementById('radar-banner');
    if (banner) {
      banner.parentNode.insertBefore(section, banner.nextSibling);
    }
  },
};

// Auto-init after DOM + data loaded
document.addEventListener('DOMContentLoaded', () => {
  // Delay slightly to let main scripts render first
  setTimeout(() => RadarBanner.init(), 500);
});
