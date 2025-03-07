# TradePulse API Server

Ce serveur proxy sécurise l'accès à l'API Perplexity et offre les fonctionnalités suivantes :
- Récupération d'actualités financières en temps réel
- Génération de recommandations de portefeuille selon différents profils de risque
- Réponses aux questions spécifiques sur les marchés financiers

## Configuration

### Prérequis
- Node.js v18 ou supérieur
- Compte Perplexity avec une clé API

### Installation

1. Clonez ce dépôt
```bash
git clone https://github.com/Bencode92/stock-analysis-platform.git
cd stock-analysis-platform/server
```

2. Installez les dépendances
```bash
npm install
```

3. Créez un fichier `.env` à partir du modèle `.env.example`
```bash
cp .env.example .env
```

4. Modifiez le fichier `.env` avec votre clé API Perplexity
```
PERPLEXITY_API_KEY=votre_clé_api_perplexity
```

### Démarrage du serveur

En développement (avec rechargement automatique) :
```bash
npm run dev
```

En production :
```bash
npm start
```

## Endpoints API

- `GET /` - Vérifier que le serveur est en ligne
- `POST /api/perplexity/news` - Obtenir les actualités financières
- `POST /api/perplexity/portfolios` - Obtenir des recommandations de portefeuille
- `POST /api/perplexity/search` - Rechercher des réponses à des questions financières spécifiques

## Déploiement

### Option 1: Deployer sur Render.com

1. Créez un compte sur [Render](https://render.com)
2. Connectez votre compte GitHub
3. Créez un nouveau Web Service en pointant vers ce répertoire
4. Configurez les variables d'environnement (PERPLEXITY_API_KEY)
5. Déployez

### Option 2: Deployer sur Heroku

1. Installez la CLI Heroku
2. Connectez-vous à Heroku : `heroku login`
3. Dans le dossier `server` :
```bash
heroku create tradepulse-api
git subtree push --prefix server heroku main
heroku config:set PERPLEXITY_API_KEY=your_api_key
```

### Option 3: Déployer sur tout autre service cloud

Le serveur est compatible avec tout fournisseur offrant un environnement Node.js, comme:
- AWS Elastic Beanstalk
- Google Cloud Run
- DigitalOcean App Platform
- Railway.app

## Sécurité

Ce serveur est configuré avec les mesures de sécurité suivantes :
- CORS limité aux domaines autorisés
- Clé API jamais exposée au frontend
- Validation des requêtes entrantes

## Support

Pour toute question ou problème, veuillez ouvrir un ticket dans la section Issues de ce dépôt.