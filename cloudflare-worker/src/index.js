// auth-worker.js
// Ce script doit être déployé en tant que Cloudflare Worker

/**
 * Gère les requêtes HTTP entrantes
 * @param {Request} request - La requête HTTP entrante
 * @param {Object} env - Les variables d'environnement
 * @param {Object} ctx - Le contexte d'exécution
 */
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const userStore = env.USER_STORE; // Le namespace KV pour stocker les utilisateurs
  const tokenStore = env.TOKEN_STORE; // Le namespace KV pour stocker les tokens

  // Configuration CORS pour permettre les requêtes depuis votre domaine
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // En production, limitez ceci à votre domaine
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };

  // Gestion des requêtes OPTIONS (préflight CORS)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  // Ajouter les headers CORS à toutes les réponses
  const addCorsHeaders = (response) => {
    const newHeaders = new Headers(response.headers);
    Object.keys(corsHeaders).forEach(key => {
      newHeaders.set(key, corsHeaders[key]);
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };

  try {
    // Définir les différentes routes
    if (url.pathname === '/api/auth/register' && request.method === 'POST') {
      const response = await handleRegister(request, userStore, tokenStore);
      return addCorsHeaders(response);
    } else if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      const response = await handleLogin(request, userStore, tokenStore);
      return addCorsHeaders(response);
    } else if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      const response = await handleLogout(request, tokenStore);
      return addCorsHeaders(response);
    } else if (url.pathname === '/api/auth/verify' && request.method === 'GET') {
      const response = await handleVerify(request, tokenStore, userStore);
      return addCorsHeaders(response);
    } else {
      return addCorsHeaders(new Response('Not Found', { status: 404 }));
    }
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }));
  }
}

/**
 * Gère l'inscription d'un nouvel utilisateur
 */
async function handleRegister(request, userStore, tokenStore) {
  const { name, email, password } = await request.json();

  // Validation de base
  if (!name || !email || !password) {
    return new Response(JSON.stringify({ error: 'Tous les champs sont requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Vérifier si l'email est déjà utilisé
  const existingUser = await userStore.get(email);
  if (existingUser) {
    return new Response(JSON.stringify({ error: 'Cet email est déjà utilisé' }), {
      status: 409, // Conflict
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Hachage du mot de passe (version simplifiée pour démo - en production, utilisez bcrypt)
  // Note: Dans un vrai environnement, utilisez une méthode de hachage sécurisée
  const hashedPassword = await hashPassword(password);

  // Créer un nouvel utilisateur
  const user = {
    name,
    email,
    password: hashedPassword,
    createdAt: new Date().toISOString(),
  };

  // Stocker l'utilisateur dans KV
  await userStore.put(email, JSON.stringify(user));

  // Générer un token pour la connexion automatique après inscription
  const token = generateToken();
  const tokenData = {
    email: user.email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Expire après 24h
  };

  // Stocker le token dans KV
  await tokenStore.put(token, JSON.stringify(tokenData));

  // Retourner les informations utilisateur (sans le mot de passe)
  const { password: _, ...userWithoutPassword } = user;
  
  return new Response(JSON.stringify({
    message: 'Inscription réussie',
    user: userWithoutPassword,
    token,
  }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Gère la connexion d'un utilisateur
 */
async function handleLogin(request, userStore, tokenStore) {
  const { email, password } = await request.json();

  // Validation de base
  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email et mot de passe requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Récupérer l'utilisateur depuis KV
  const userJson = await userStore.get(email);
  if (!userJson) {
    return new Response(JSON.stringify({ error: 'Email ou mot de passe incorrect' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = JSON.parse(userJson);

  // Vérifier le mot de passe
  const passwordMatch = await verifyPassword(password, user.password);
  if (!passwordMatch) {
    return new Response(JSON.stringify({ error: 'Email ou mot de passe incorrect' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Générer un token pour cette session
  const token = generateToken();
  const tokenData = {
    email: user.email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Expire après 24h
  };

  // Stocker le token dans KV
  await tokenStore.put(token, JSON.stringify(tokenData));

  // Retourner les informations utilisateur (sans le mot de passe)
  const { password: _, ...userWithoutPassword } = user;
  
  return new Response(JSON.stringify({
    message: 'Connexion réussie',
    user: userWithoutPassword,
    token,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Gère la déconnexion d'un utilisateur
 */
async function handleLogout(request, tokenStore) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Token non fourni' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.split(' ')[1];

  // Supprimer le token de KV
  await tokenStore.delete(token);

  return new Response(JSON.stringify({ message: 'Déconnexion réussie' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Vérifie si un token est valide et renvoie les informations utilisateur
 */
async function handleVerify(request, tokenStore, userStore) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Token non fourni' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.split(' ')[1];

  // Récupérer les données du token depuis KV
  const tokenDataJson = await tokenStore.get(token);
  if (!tokenDataJson) {
    return new Response(JSON.stringify({ error: 'Token invalide ou expiré' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tokenData = JSON.parse(tokenDataJson);

  // Vérifier si le token est expiré
  if (new Date(tokenData.expiresAt) < new Date()) {
    // Supprimer le token expiré
    await tokenStore.delete(token);
    return new Response(JSON.stringify({ error: 'Token expiré' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Récupérer les données utilisateur
  const userJson = await userStore.get(tokenData.email);
  if (!userJson) {
    return new Response(JSON.stringify({ error: 'Utilisateur non trouvé' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = JSON.parse(userJson);

  // Retourner les informations utilisateur (sans le mot de passe)
  const { password: _, ...userWithoutPassword } = user;
  
  return new Response(JSON.stringify({
    user: userWithoutPassword,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Fonctions utilitaires

/**
 * Génère un token aléatoire
 */
function generateToken() {
  // En production, utilisez crypto.randomUUID() ou crypto.getRandomValues()
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hashe un mot de passe
 * Note: Ceci est une version simplifiée. En production, utilisez bcrypt ou Argon2
 */
async function hashPassword(password) {
  // Créer un condensé SHA-256 (Notez que ce n'est pas assez sécurisé pour un vrai système)
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashedPassword = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashedPassword;
}

/**
 * Vérifie si un mot de passe correspond à sa version hashée
 */
async function verifyPassword(password, hashedPassword) {
  const passwordHash = await hashPassword(password);
  return passwordHash === hashedPassword;
}

// Configuration du Worker
export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};
