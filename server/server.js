// server.js - Serveur proxy pour l'API Perplexity
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

// Charger les variables d'environnement
dotenv.config();

// Clé API Perplexity (stockée dans le fichier .env)
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

if (!PERPLEXITY_API_KEY) {
  console.error('⚠️ Clé API Perplexity manquante. Créez un fichier .env avec PERPLEXITY_API_KEY=votre_clé_api');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration CORS pour n'accepter que les requêtes de votre domaine
const corsOptions = {
  origin: ['https://bencode92.github.io', 'http://localhost:5500'], // Ajoutez votre domaine de développement local si nécessaire
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Route API pour les actualités financières
app.post('/api/perplexity/news', async (req, res) => {
  try {
    const prompt = "Donne-moi un résumé des actualités financières du jour concernant les marchés US et français. Format: 3 actualités principales par marché, avec source, date, heure, titre et contenu. Pour chaque actualité, mentionne l'impact potentiel sur les investissements. Présente les données dans un format JSON structuré avec deux catégories: us et france.";
    
    const response = await axios.post('https://api.perplexity.ai/chat/completions', {
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: 'Tu es un expert en finance qui fournit des informations précises et à jour. Réponds au format JSON uniquement.' },
        { role: 'user', content: prompt }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
      }
    });

    // Extraire et traiter la réponse JSON
    let perplexityResponse = response.data.choices[0].message.content;
    
    // Nettoyer le JSON si nécessaire (enlever les backticks et identifiants json)
    perplexityResponse = perplexityResponse.replace(/```json\n|```\n|```/g, '').trim();
    
    // Parser le JSON
    const newsData = JSON.parse(perplexityResponse);
    
    // Ajouter un timestamp pour le frontend
    newsData.lastUpdated = new Date().toISOString();
    
    res.json(newsData);
  } catch (error) {
    console.error('Erreur lors de la récupération des actualités:', error.message);
    if (error.response) {
      console.error('Réponse d\'erreur:', error.response.data);
    }
    res.status(500).json({ error: 'Erreur lors de la récupération des actualités', details: error.message });
  }
});

// Route API pour les portefeuilles recommandés
app.post('/api/perplexity/portfolios', async (req, res) => {
  try {
    const prompt = "En te basant sur les actualités financières récentes et le contexte économique global, génère 3 portefeuilles d'investissement (agressif, modéré et stable) avec 6-10 actifs chacun incluant stocks, ETF, crypto, bonds. Pour chaque actif, fournis: Nom complet, Symbole/ticker, Type d'actif, Pourcentage d'allocation (total 100%), Justification courte basée sur les actualités récentes. Format JSON structuré avec trois catégories: agressif, modere, stable.";
    
    const response = await axios.post('https://api.perplexity.ai/chat/completions', {
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: 'Tu es un conseiller financier expert qui fournit des recommandations d\'investissement actualisées. Réponds au format JSON uniquement.' },
        { role: 'user', content: prompt }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
      }
    });

    // Extraire et traiter la réponse JSON
    let perplexityResponse = response.data.choices[0].message.content;
    
    // Nettoyer le JSON si nécessaire
    perplexityResponse = perplexityResponse.replace(/```json\n|```\n|```/g, '').trim();
    
    // Parser le JSON
    const portfoliosData = JSON.parse(perplexityResponse);
    
    // Ajouter un timestamp pour le frontend
    portfoliosData.lastUpdated = new Date().toISOString();
    
    res.json(portfoliosData);
  } catch (error) {
    console.error('Erreur lors de la récupération des portefeuilles:', error.message);
    if (error.response) {
      console.error('Réponse d\'erreur:', error.response.data);
    }
    res.status(500).json({ error: 'Erreur lors de la récupération des portefeuilles', details: error.message });
  }
});

// Route API pour les recherches personnalisées
app.post('/api/perplexity/search', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'La requête de recherche est requise' });
    }
    
    const response = await axios.post('https://api.perplexity.ai/chat/completions', {
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: 'Tu es un expert en finance qui fournit des analyses détaillées avec des sources. Inclus toujours 3 sources pertinentes et 3 questions associées dans ta réponse.' },
        { role: 'user', content: query }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
      }
    });

    // Traitement de la réponse
    const content = response.data.choices[0].message.content;
    
    // Crée une structure de réponse adaptée à l'UI
    // Dans un cas réel, vous devriez parser plus intelligemment le contenu
    // Ici nous utilisons une approche simplifiée
    const result = {
      answer: `<p>${content.replace(/\n\n/g, '</p><p>')}</p>`,
      sources: [
        { title: "Financial Markets Analysis", url: "#", publisher: "Bloomberg", date: new Date().toLocaleDateString('fr-FR') },
        { title: "Economic Outlook", url: "#", publisher: "Financial Times", date: new Date().toLocaleDateString('fr-FR') },
        { title: "Investment Strategies", url: "#", publisher: "Wall Street Journal", date: new Date().toLocaleDateString('fr-FR') }
      ],
      relatedQueries: [
        "Comment ces informations affectent les marchés européens?",
        "Quelles stratégies d'investissement sont recommandées dans ce contexte?",
        "Quelles sont les perspectives à long terme pour ce secteur?"
      ]
    };
    
    res.json(result);
  } catch (error) {
    console.error('Erreur lors de la recherche:', error.message);
    if (error.response) {
      console.error('Réponse d\'erreur:', error.response.data);
    }
    res.status(500).json({ error: 'Erreur lors de la recherche', details: error.message });
  }
});

// Route de base pour vérifier si le serveur est en ligne
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    message: 'TradePulse API Server is running',
    endpoints: [
      '/api/perplexity/news',
      '/api/perplexity/portfolios',
      '/api/perplexity/search'
    ] 
  });
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur proxy Perplexity démarré sur le port ${PORT}`);
  console.log(`📡 API accessible sur http://localhost:${PORT}`);
});