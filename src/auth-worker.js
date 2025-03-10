/**
 * TradePulse - Worker d'authentification
 * Ce worker gère les opérations d'authentification (inscription, connexion, validation de token)
 */

// Importation de crypto-js pour le hachage des mots de passe
import CryptoJS from 'crypto-js';

// En-têtes CORS pour permettre les requêtes depuis votre frontend
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// Fonction pour générer un JWT
function generateJWT(payload, secret, expiresIn = '24h') {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (expiresIn === '24h' ? 86400 : parseInt(expiresIn));
  
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify({ ...payload, exp }));
  
  const signature = CryptoJS.HmacSHA256(
    `${encodedHeader}.${encodedPayload}`, 
    secret
  ).toString(CryptoJS.enc.Base64);
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Fonction pour vérifier un JWT
function verifyJWT(token, secret) {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    
    const calculatedSignature = CryptoJS.HmacSHA256(
      `${encodedHeader}.${encodedPayload}`,
      secret
    ).toString(CryptoJS.enc.Base64);
    
    if (calculatedSignature !== signature) {
      return null;
    }
    
    const payload = JSON.parse(atob(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    
    if (payload.exp && payload.exp < now) {
      return null;
    }
    
    return payload;
  } catch (e) {
    return null;
  }
}

// Fonction pour hacher un mot de passe
function hashPassword(password) {
  return CryptoJS.SHA256(password).toString();
}

// Gestionnaire des requêtes
async function handleRequest(request, env) {
  // Gestion des requêtes OPTIONS (CORS preflight)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  const url = new URL(request.url);
  const path = url.pathname;
  
  // Ajout des en-têtes CORS à toutes les réponses
  const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json',
  };

  // Route d'inscription
  if (path === '/api/auth/register' && request.method === 'POST') {
    try {
      const { name, email, password } = await request.json();
      
      // Vérification des champs requis
      if (!email || !password || !name) {
        return new Response(
          JSON.stringify({ success: false, message: 'Tous les champs sont requis' }),
          { status: 400, headers }
        );
      }
      
      // Vérifier si l'utilisateur existe déjà
      const existingUser = await env.AUTH_STORE.get(`user:${email}`);
      if (existingUser) {
        return new Response(
          JSON.stringify({ success: false, message: 'Cet email est déjà utilisé' }),
          { status: 409, headers }
        );
      }
      
      // Création de l'utilisateur
      const hashedPassword = hashPassword(password);
      const user = {
        name,
        email,
        password: hashedPassword,
        createdAt: new Date().toISOString(),
      };
      
      // Stockage de l'utilisateur dans KV
      await env.AUTH_STORE.put(`user:${email}`, JSON.stringify(user));
      
      // Génération du token
      const token = generateJWT({ email, name }, env.JWT_SECRET);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Inscription réussie',
          token,
          user: { name, email }
        }),
        { status: 201, headers }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ success: false, message: 'Erreur lors de l\'inscription', error: error.message }),
        { status: 500, headers }
      );
    }
  }
  
  // Route de connexion
  if (path === '/api/auth/login' && request.method === 'POST') {
    try {
      const { email, password } = await request.json();
      
      // Vérification des champs requis
      if (!email || !password) {
        return new Response(
          JSON.stringify({ success: false, message: 'Email et mot de passe requis' }),
          { status: 400, headers }
        );
      }
      
      // Récupération de l'utilisateur
      const userJson = await env.AUTH_STORE.get(`user:${email}`);
      if (!userJson) {
        return new Response(
          JSON.stringify({ success: false, message: 'Identifiants incorrects' }),
          { status: 401, headers }
        );
      }
      
      const user = JSON.parse(userJson);
      const hashedPassword = hashPassword(password);
      
      // Vérification du mot de passe
      if (user.password !== hashedPassword) {
        return new Response(
          JSON.stringify({ success: false, message: 'Identifiants incorrects' }),
          { status: 401, headers }
        );
      }
      
      // Génération du token
      const token = generateJWT({ email, name: user.name }, env.JWT_SECRET);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Connexion réussie',
          token,
          user: { name: user.name, email }
        }),
        { status: 200, headers }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ success: false, message: 'Erreur lors de la connexion', error: error.message }),
        { status: 500, headers }
      );
    }
  }
  
  // Route de vérification de token
  if (path === '/api/auth/verify' && request.method === 'GET') {
    try {
      const authHeader = request.headers.get('Authorization');
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ success: false, message: 'Token non fourni' }),
          { status: 401, headers }
        );
      }
      
      const token = authHeader.split(' ')[1];
      const payload = verifyJWT(token, env.JWT_SECRET);
      
      if (!payload) {
        return new Response(
          JSON.stringify({ success: false, message: 'Token invalide ou expiré' }),
          { status: 401, headers }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Token valide',
          user: { name: payload.name, email: payload.email }
        }),
        { status: 200, headers }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ success: false, message: 'Erreur lors de la vérification du token', error: error.message }),
        { status: 500, headers }
      );
    }
  }
  
  // Route non trouvée
  return new Response(
    JSON.stringify({ success: false, message: 'Endpoint non trouvé' }),
    { status: 404, headers }
  );
}

// Exposition du handler pour Cloudflare Workers
export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
};