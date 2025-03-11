const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');

// Configuration de l'application Express
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Données simulées pour différents types de portefeuilles
const portfolioData = {
  aggressive: {
    performanceValue: '+8.32%',
    performanceClass: 'positive',
    portfolioValue: '84 213',
    gainValue: '+6 487',
    gainClass: 'positive',
    sharpeRatio: '0.72'
  },
  moderate: {
    performanceValue: '+5.47%',
    performanceClass: 'positive',
    portfolioValue: '52 180',
    gainValue: '+2 705',
    gainClass: 'positive',
    sharpeRatio: '0.68'
  },
  stable: {
    performanceValue: '+2.19%',
    performanceClass: 'positive',
    portfolioValue: '35 420',
    gainValue: '+760',
    gainClass: 'positive',
    sharpeRatio: '0.61'
  }
};

// Données simulées pour les marchés
const marketData = {
  cac40: {
    value: '7 628,80',
    change: '+0.54%',
    class: 'positive'
  },
  sp500: {
    value: '5 125,14',
    change: '+0.32%',
    class: 'positive'
  },
  nasdaq: {
    value: '16 048,55',
    change: '-0.12%',
    class: 'negative'
  },
  eurusd: {
    value: '1.0865',
    change: '+0.08%',
    class: 'positive'
  }
};

// Actualités simulées
const newsData = [
  {
    title: 'La Fed envisage de nouvelles mesures de soutien économique',
    description: 'Face aux tensions économiques mondiales, la Réserve fédérale américaine pourrait annoncer de nouvelles mesures exceptionnelles.'
  },
  {
    title: 'Résultats trimestriels au-dessus des attentes pour le secteur tech',
    description: 'Les géants de la technologie publient des résultats dépassant les prévisions des analystes pour le premier trimestre 2025.'
  },
  {
    title: 'Hausse des tensions commerciales entre l\'UE et la Chine',
    description: 'De nouvelles barrières douanières pourraient affecter les échanges commerciaux entre l\'Union européenne et la Chine.'
  }
];

// Fonction pour remplacer les variables dans le template HTML
function processTemplate(template, data) {
  let processedTemplate = template;
  
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    processedTemplate = processedTemplate.replace(regex, value);
  }
  
  return processedTemplate;
}

// Route pour prévisualiser l'email
app.get('/preview-email', (req, res) => {
  try {
    // Lire le template HTML
    const templatePath = path.join(__dirname, 'email-dashboard-template.html');
    let template = fs.readFileSync(templatePath, 'utf8');
    
    // Obtenir le type de portefeuille depuis la requête
    const portfolioType = req.query.portfolioType || 'aggressive';
    const portfolio = portfolioData[portfolioType];
    
    // Préparer les données
    const today = new Date();
    const formattedDate = today.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    
    const templateData = {
      date: formattedDate,
      performanceValue: portfolio.performanceValue,
      performanceClass: portfolio.performanceClass,
      portfolioValue: portfolio.portfolioValue,
      gainValue: portfolio.gainValue,
      gainClass: portfolio.gainClass,
      sharpeRatio: portfolio.sharpeRatio,
      
      cac40Value: marketData.cac40.value,
      cac40Change: marketData.cac40.change,
      cac40Class: marketData.cac40.class,
      
      sp500Value: marketData.sp500.value,
      sp500Change: marketData.sp500.change,
      sp500Class: marketData.sp500.class,
      
      nasdaqValue: marketData.nasdaq.value,
      nasdaqChange: marketData.nasdaq.change,
      nasdaqClass: marketData.nasdaq.class,
      
      eurusdValue: marketData.eurusd.value,
      eurusdChange: marketData.eurusd.change,
      eurusdClass: marketData.eurusd.class,
      
      newsTitle1: newsData[0].title,
      newsDesc1: newsData[0].description,
      newsTitle2: newsData[1].title,
      newsDesc2: newsData[1].description,
      newsTitle3: newsData[2].title,
      newsDesc3: newsData[2].description,
      
      alertsSettingsUrl: 'https://bencode92.github.io/stock-analysis-platform/email-preview.html'
    };
    
    // Remplacer les variables dans le template
    const processedTemplate = processTemplate(template, templateData);
    
    // Envoyer le template traité
    res.send(processedTemplate);
  } catch (error) {
    console.error('Erreur lors de la prévisualisation de l\'email :', error);
    res.status(500).send('Erreur lors de la prévisualisation de l\'email');
  }
});

// Route pour envoyer un email de test
app.post('/send-test-email', async (req, res) => {
  try {
    const { email, portfolioType } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Adresse email requise' });
    }
    
    // Configuration du transporteur (pour un environnement de test)
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    
    // Lire le template HTML
    const templatePath = path.join(__dirname, 'email-dashboard-template.html');
    let template = fs.readFileSync(templatePath, 'utf8');
    
    // Données du portefeuille
    const portfolio = portfolioData[portfolioType || 'aggressive'];
    
    // Préparer les données
    const today = new Date();
    const formattedDate = today.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    
    const templateData = {
      date: formattedDate,
      performanceValue: portfolio.performanceValue,
      performanceClass: portfolio.performanceClass,
      portfolioValue: portfolio.portfolioValue,
      gainValue: portfolio.gainValue,
      gainClass: portfolio.gainClass,
      sharpeRatio: portfolio.sharpeRatio,
      
      cac40Value: marketData.cac40.value,
      cac40Change: marketData.cac40.change,
      cac40Class: marketData.cac40.class,
      
      sp500Value: marketData.sp500.value,
      sp500Change: marketData.sp500.change,
      sp500Class: marketData.sp500.class,
      
      nasdaqValue: marketData.nasdaq.value,
      nasdaqChange: marketData.nasdaq.change,
      nasdaqClass: marketData.nasdaq.class,
      
      eurusdValue: marketData.eurusd.value,
      eurusdChange: marketData.eurusd.change,
      eurusdClass: marketData.eurusd.class,
      
      newsTitle1: newsData[0].title,
      newsDesc1: newsData[0].description,
      newsTitle2: newsData[1].title,
      newsDesc2: newsData[1].description,
      newsTitle3: newsData[2].title,
      newsDesc3: newsData[2].description,
      
      alertsSettingsUrl: 'https://bencode92.github.io/stock-analysis-platform/email-preview.html'
    };
    
    // Remplacer les variables dans le template
    const processedTemplate = processTemplate(template, templateData);
    
    // Envoyer l'email
    const info = await transporter.sendMail({
      from: '"TradePulse" <alerts@tradepulse.io>',
      to: email,
      subject: 'TradePulse - Résumé quotidien du ' + formattedDate,
      html: processedTemplate
    });
    
    console.log('Email envoyé: %s', info.messageId);
    console.log('URL de prévisualisation: %s', nodemailer.getTestMessageUrl(info));
    
    res.json({
      success: true,
      message: 'Email de test envoyé avec succès',
      previewUrl: nodemailer.getTestMessageUrl(info)
    });
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email :', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de l\'email' });
  }
});

// Route pour sauvegarder les préférences d'email
app.post('/save-preferences', (req, res) => {
  try {
    const { daily, weekly, alerts } = req.body;
    
    // Dans un environnement de production, vous sauvegarderiez ces préférences dans une base de données
    // Pour l'instant, nous simulons le succès de l'opération
    
    res.json({
      success: true,
      message: 'Préférences sauvegardées avec succès',
      preferences: { daily, weekly, alerts }
    });
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des préférences :', error);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde des préférences' });
  }
});

// Démarrage du serveur
app.listen(port, () => {
  console.log(`Serveur d'emails démarré sur le port ${port}`);
});

module.exports = app;
