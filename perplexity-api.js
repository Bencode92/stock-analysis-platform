/**
 * perplexity-api.js - API Middleware pour Perplexity
 * Ce script est conçu pour être déployé en tant que Cloudflare Worker
 * Il sert de proxy entre votre frontend et l'API Perplexity
 */

// Configuration
const PERPLEXITY_API_KEY = 'YOUR_PERPLEXITY_API_KEY'; // À remplacer par votre vraie clé API

/**
 * Gestionnaire principal pour les requêtes entrantes
 */
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

/**
 * Traite les requêtes entrantes et les dirige vers les fonctions appropriées
 */
async function handleRequest(request) {
  // Configurer les headers CORS pour permettre les requêtes cross-origin
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Gérer les requêtes OPTIONS (preflight CORS)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // Extraire le chemin de la requête
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // Router les requêtes basées sur le chemin
    if (path === '/api/perplexity/news') {
      return await handleNewsRequest(request, corsHeaders);
    } else if (path === '/api/perplexity/portfolios') {
      return await handlePortfoliosRequest(request, corsHeaders);
    } else {
      return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

/**
 * Traite les requêtes pour obtenir les actualités financières
 */
async function handleNewsRequest(request, corsHeaders) {
  // Vérifier si la requête est une requête POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  try {
    // Analyser le corps de la requête
    const body = await request.json();
    const { prompt } = body;

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Appeler Perplexity API
    const perplexityResponse = await fetchFromPerplexity(prompt);

    // Renvoyer la réponse au client
    return new Response(JSON.stringify(perplexityResponse), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

/**
 * Traite les requêtes pour obtenir les recommandations de portefeuille
 */
async function handlePortfoliosRequest(request, corsHeaders) {
  // Vérifier si la requête est une requête POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  try {
    // Analyser le corps de la requête
    const body = await request.json();
    const { prompt } = body;

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Appeler Perplexity API
    const perplexityResponse = await fetchFromPerplexity(prompt);

    // Renvoyer la réponse au client
    return new Response(JSON.stringify(perplexityResponse), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

/**
 * Envoie une requête à l'API Perplexity et retourne la réponse
 */
async function fetchFromPerplexity(prompt) {
  try {
    // Dans un environnement de production, vous appelleriez directement l'API Perplexity
    // Pour ce prototype, nous utiliserons la fonction chat-with-perplexity disponible via MCP
    
    // Construction du corps de la requête pour l'API Perplexity
    const requestBody = {
      model: 'perplexity',
      prompt: prompt,
      max_tokens: 2000, // Ajustez selon vos besoins
      temperature: 0.7
    };

    // Appel à l'API Perplexity
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Perplexity API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error calling Perplexity API:', error);
    throw error;
  }
}
