/**
 * Serveur Express simple pour prévisualiser et tester l'envoi d'emails
 * 
 * Installation:
 * npm install express nodemailer moment handlebars fs-extra cors
 * 
 * Usage:
 * node email-server.js
 * 
 * Puis ouvrez http://localhost:3000 dans votre navigateur
 */

const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs-extra');
const Handlebars = require('handlebars');
const moment = require('moment');
const path = require('path');
const cors = require('cors');

// Configuration
const PORT = process.env.PORT || 3000;
moment.locale('fr');

// Initialiser l'application Express
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Servir les fichiers statiques du répertoire actuel
app.use(express.static('./'));

// Route pour la prévisualisation
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'email-preview.html'));
});

// Route pour générer l'email avec les données actuelles
app.get('/generate-email', async (req, res) => {
    try {
        // Récupérer le template
        const templateSource = await fs.readFile('./email-dashboard-template.html', 'utf8');
        const template = Handlebars.compile(templateSource);
        
        // Données de test
        const portfolioType = req.query.type || 'moderate';
        const data = getPortfolioData(portfolioType);
        
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
        
        res.send(html);
    } catch (error) {
        console.error('Erreur lors de la génération de l\'email:', error);
        res.status(500).send('Erreur lors de la génération de l\'email');
    }
});

// Route pour envoyer un email de test
app.post('/send-test-email', async (req, res) => {
    try {
        const { email, portfolioType = 'moderate' } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, message: 'Adresse email requise' });
        }
        
        // Configurer le transporteur SMTP
        // Pour les tests, nous utilisons un compte de test (ethereal.email)
        let testAccount = await nodemailer.createTestAccount();
        
        let transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            }
        });
        
        // Récupérer le template et les données
        const templateSource = await fs.readFile('./email-dashboard-template.html', 'utf8');
        const template = Handlebars.compile(templateSource);
        
        // Données de test basées sur le type de portefeuille sélectionné
        const data = getPortfolioData(portfolioType);
        
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
            to: email,
            subject: `TradePulse - Résumé du ${today.format('DD/MM/YYYY')}`,
            html: html
        };
        
        // Envoyer l'email
        let info = await transporter.sendMail(mailOptions);
        
        console.log('Email envoyé: %s', info.messageId);
        console.log('Aperçu URL: %s', nodemailer.getTestMessageUrl(info));
        
        res.json({ 
            success: true, 
            message: 'Email envoyé avec succès', 
            previewUrl: nodemailer.getTestMessageUrl(info)
        });
    } catch (error) {
        console.error('Erreur lors de l\'envoi de l\'email:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de l\'envoi de l\'email' });
    }
});

// Fonction pour obtenir les données selon le type de portefeuille
function getPortfolioData(portfolioType) {
    // Données communes
    const baseData = {
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
    
    // Données spécifiques au type de portefeuille
    let portfolioData = {};
    
    switch (portfolioType) {
        case 'aggressive':
            portfolioData = {
                totalValue: '32,415.25 €',
                performance: '+7.2%',
                monthlyPerformance: '+9.8%',
                benchmark: '+3.1% (S&P 500)',
                components: [
                    { name: 'NVIDIA Corporation', type: 'STOCK', allocation: '30%', performance: '+5.5%' },
                    { name: 'Tesla, Inc.', type: 'STOCK', allocation: '20%', performance: '+3.3%' },
                    { name: 'Bitcoin', type: 'CRYPTO', allocation: '15%', performance: '+18.7%' },
                    { name: 'ARK Innovation ETF', type: 'ETF', allocation: '15%', performance: '+2.2%' }
                ]
            };
            break;
            
        case 'moderate':
            portfolioData = {
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
            };
            break;
            
        case 'stable':
            portfolioData = {
                totalValue: '18,124.70 €',
                performance: '+1.2%',
                monthlyPerformance: '+3.1%',
                benchmark: '+2.3% (S&P 500)',
                components: [
                    { name: 'Vanguard Bond ETF', type: 'BOND', allocation: '25%', performance: '+0.4%' },
                    { name: 'Johnson & Johnson', type: 'STOCK', allocation: '12%', performance: '+0.8%' },
                    { name: 'Microsoft', type: 'STOCK', allocation: '10%', performance: '+2.2%' },
                    { name: 'S&P 500 ETF', type: 'ETF', allocation: '15%', performance: '+0.7%' }
                ]
            };
            break;
            
        default:
            portfolioData = {
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
            };
    }
    
    return {
        ...baseData,
        portfolio: portfolioData
    };
}

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
    console.log('Pour tester l\'envoi d\'emails, ouvrez http://localhost:${PORT} dans votre navigateur');
});
