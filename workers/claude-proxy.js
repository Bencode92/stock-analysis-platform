/**
 * Cloudflare Worker — Proxy Anthropic API
 * 
 * SETUP :
 * 1. Aller sur https://dash.cloudflare.com → Workers & Pages → Create
 * 2. Coller ce code
 * 3. Settings → Variables → Ajouter ANTHROPIC_API_KEY = sk-ant-...
 * 4. Deploy → noter l'URL (ex: https://claude-proxy.votre-compte.workers.dev)
 * 5. Mettre cette URL dans js/transmission-engine.js (PROXY_URL)
 * 
 * Sécurité : 
 * - La clé API reste côté serveur (jamais exposée au navigateur)
 * - CORS restreint à votre domaine GitHub Pages
 * - Rate limit basique inclus
 */

const ALLOWED_ORIGINS = [
  'https://bencode92.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:5500'
];

const RATE_LIMIT = new Map(); // IP -> {count, resetAt}
const MAX_REQUESTS_PER_MINUTE = 10;

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    // Only POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Check origin
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
      return new Response('Forbidden', { status: 403 });
    }

    // Basic rate limit
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(ip)) {
      return corsResponse(origin, JSON.stringify({ error: 'Rate limit exceeded' }), 429);
    }

    // Check API key is configured
    if (!env.ANTHROPIC_API_KEY) {
      return corsResponse(origin, JSON.stringify({ error: 'API key not configured' }), 500);
    }

    try {
      const body = await request.json();

      // Restrict to allowed models
      const allowedModels = ['claude-sonnet-4-20250514', 'claude-opus-4-6'];
      if (!allowedModels.includes(body.model)) {
        body.model = 'claude-sonnet-4-20250514';
      }

      // Cap max_tokens
      if (!body.max_tokens || body.max_tokens > 4000) {
        body.max_tokens = 3000;
      }

      // Forward to Anthropic
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });

      const data = await response.text();
      return corsResponse(origin, data, response.status);

    } catch (err) {
      return corsResponse(origin, JSON.stringify({ error: err.message }), 500);
    }
  }
};

function handleCORS(request) {
  const origin = request.headers.get('Origin') || '';
  const matched = ALLOWED_ORIGINS.find(o => origin.startsWith(o)) || '';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': matched,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}

function corsResponse(origin, body, status) {
  const matched = ALLOWED_ORIGINS.find(o => origin.startsWith(o)) || '';
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': matched
    }
  });
}

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = RATE_LIMIT.get(ip);
  if (!entry || now > entry.resetAt) {
    RATE_LIMIT.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_REQUESTS_PER_MINUTE;
}
