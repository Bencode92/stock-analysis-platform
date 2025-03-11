/**
 * Script pour envoyer automatiquement le tableau de bord par email
 * Ce script peut être exécuté quotidiennement à 9h avec un cron job ou task scheduler
 * 
 * Prérequis:
 * - Node.js
 * - npm install nodemailer fs-extra handlebars moment node-fetch
 */

const nodemailer = require('nodemailer');
const fs = require('fs-extra');
const Handlebars = require('handlebars');
const moment = require('moment');
const fetch = require('node-fetch');
moment.locale('fr');

// Configuration du serveur SMTP
const transporter = nodemailer.createTransport({
    host: 'smtp.example.com', // Remplacer par votre serveur SMTP
    port: 587,
    secure: false, // true pour 465, false pour les autres ports
    auth: {
        user: 'your-email@example.com', // Remplacer par votre email
        pass: 'your-password' // Remplacer par votre mot de passe
    }
});

// Liste des destinataires
const recipients = [
    'user1@example.com',
    'user2@example.com'
    // Ajouter d'autres destinataires si nécessaire
];

// Configuration des API pour récupérer les données
const API_CONFIG = {
    news: 'https://stock-analysis-platform-q9tc.onrender.com/api/perplexity/news',
    portfolio: 'https://stock-analysis-platform-q9tc.onrender.com/api/perplexity/portfolios',
    markets: 'https://stock-analysis-platform-q9tc.onrender.com/api/markets'
};

/**
 * Récupère les données actuelles depuis les API
 */
async function fetchLatestData() {
    try {
        console.log('Récupération des données en cours...');
        
        // Simuler des données si les API ne sont pas disponibles
        // Dans une version de production, utilisez de vraies API avec fetch()
        
        return {
            news: [
                {
                    title: 'La Fed annonce une réunion exceptionnelle sur les taux',
                    source: 'Federal Reserve',
                    time: '08:15',
                    timeAgo: 'Il y a 1h'
                },
                {
                    title: 'LVMH dévoile des résultats trimestriels supérieurs aux attentes',
                    source: 'LVMH',
                    time: '16:30',
                    timeAgo: 'Hier, 16:30'
                },
                {
                    title: 'Bitcoin franchit un nouveau seuil à 75 000$',
                    source: 'CoinDesk',
                    time: '14:45',
                    timeAgo: 'Hier, 14:45'
                }
            ],
            portfolio: {
                totalValue: '26,842.15 €',
                performance: '+3.2%',
                monthlyPerformance: '+5.8%',
                benchmark: '+2.3% (S&P 500)',
                components: [
                    { name: 'NVIDIA', type: 'STOCK', allocation: '25%', performance: '+3.8%' },
                    { name: 'Microsoft', type: 'STOCK', allocation: '15%', performance: '+2.2%' },
                    { name: 'Amazon', type: 'STOCK', allocation: '12%', performance: '+2.1%' },
                    { name: 'S&P 500 ETF', type: 'ETF', allocation: '20%', performance: '+0.7%' }
                ]
            },
            markets: [
                { name: 'S&P 500', value: '5,187.52', change: '+0.68%', isPositive: true },
                { name: 'NASDAQ', value: '16,342.15', change: '+1.12%', isPositive: true },
                { name: 'CAC 40', value: '8,052.21', change: '-0.23%', isPositive: false }
            ],
            events: [
                {
                    date: '11',
                    month: 'MAR',
                    title: 'Réunion exceptionnelle Fed',
                    time: '08:15',
                    importance: 'high'
                },
                {
                    date: '11',
                    month: 'MAR',
                    title: 'Résultats trimestriels Amazon',
                    time: '16:30',
                    importance: 'medium'
                }
            ]
        };
        
        // Code pour les appels API réels (à décommenter et adapter si nécessaire)
        /*
        const [newsResponse, portfolioResponse, marketsResponse] = await Promise.all([
            fetch(API_CONFIG.news),
            fetch(API_CONFIG.portfolio),
            fetch(API_CONFIG.markets)
        ]);
        
        const news = await newsResponse.json();
        const portfolio = await portfolioResponse.json();
        const markets = await marketsResponse.json();
        
        return { news, portfolio, markets };
        */
    } catch (error) {
        console.error('Erreur lors de la récupération des données:', error);
        throw error;
    }
}

/**
 * Prépare et envoie l'email
 */
async function sendDailyEmail() {
    try {
        // Récupérer le template HTML
        const templateSource = await fs.readFile('./email-dashboard-template.html', 'utf8');
        const template = Handlebars.compile(templateSource);
        
        // Récupérer les données actuelles
        const data = await fetchLatestData();
        
        // Préparer les données pour le template
        const today = moment();
        const templateData = {
            DATE: today.format('DD.MM.YYYY'),
            JOUR: today.format('dddd D MMMM YYYY'),
            news: data.news,
            portfolio: data.portfolio,
            markets: data.markets,
            events: data.events
        };
        
        // Générer l'HTML avec les données
        const html = template(templateData);
        
        // Configuration de l'email
        const mailOptions = {
            from: '"TradePulse" <notifications@tradepulse.com>',
            to: recipients.join(', '), // Peut aussi être envoyé individuellement en boucle
            subject: `TradePulse - Résumé du ${today.format('DD/MM/YYYY')}`,
            html: html
        };
        
        // Envoyer l'email
        console.log('Envoi des emails en cours...');
        await transporter.sendMail(mailOptions);
        
        console.log('Emails envoyés avec succès!');
    } catch (error) {
        console.error('Erreur lors de l\'envoi des emails:', error);
    }
}

// Exécuter la fonction principale
sendDailyEmail();

// Pour un déploiement en production, vous pourriez utiliser un scheduler comme:
// - Un cron job sur un serveur Linux
// - Un Azure Function avec un timer trigger
// - AWS Lambda avec CloudWatch Events
// - Un worker Cloudflare programmé
// Exemple de cron expression pour 9h tous les jours : "0 9 * * *"
