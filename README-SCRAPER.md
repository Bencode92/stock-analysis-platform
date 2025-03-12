# Guide d'installation du scraper Boursorama avec Puppeteer

Ce guide explique comment installer et utiliser le scraper Puppeteer pour extraire les données des indices boursiers de Boursorama et les afficher dans votre application TradePulse.

## Prérequis

- Node.js (version 14 ou supérieure)
- npm (gestionnaire de paquets de Node.js)

## Installation

1. **Créez un dossier pour le scraper**

   ```bash
   mkdir -p scraper-boursorama
   cd scraper-boursorama
   ```

2. **Initialisez un projet Node.js**

   ```bash
   npm init -y
   ```

3. **Installez les dépendances nécessaires**

   ```bash
   npm install puppeteer express cors
   ```

4. **Créez le fichier scraper.js**

   Copiez le contenu du fichier `scraper.js` fourni dans ce dossier.

5. **Lancez le scraper**

   ```bash
   node scraper.js
   ```

## Configuration de l'application TradePulse

1. **Remplacez le fichier marches-script.js**

   Mettez à jour le fichier `marches-script.js` dans votre projet TradePulse avec la version fournie.

2. **Vérifiez que l'URL de l'API est correcte**

   Dans `marches-script.js`, vérifiez que l'URL de l'API correspond à l'adresse où tourne votre scraper :
   
   ```javascript
   const API_URL = 'http://localhost:3001/api/indices';
   ```

## Fonctionnement

Le système fonctionne comme suit :

1. Le scraper Puppeteer s'exécute localement en arrière-plan
2. Il accède au site Boursorama toutes les 15 minutes
3. Il extrait les données des indices boursiers
4. Il sauvegarde ces données dans un fichier JSON local (`indices_data.json`)
5. Il expose ces données via une petite API HTTP sur le port 3001
6. La page web TradePulse interroge cette API pour afficher les données

## Dépannage

- **Le scraper ne démarre pas**
  
  Vérifiez que Node.js est installé correctement :
  ```bash
  node --version
  ```

- **La page n'affiche pas les données**
  
  Vérifiez que le scraper est en cours d'exécution :
  ```bash
  curl http://localhost:3001/api/indices
  ```

- **Le scraper ne peut pas accéder à Boursorama**
  
  Vérifiez votre connexion internet et essayez de modifier le user-agent dans le fichier `scraper.js`.

## Avantages de cette solution

- Extraction fiable des données (Puppeteer simule un vrai navigateur)
- Contourne les restrictions CORS et les protections anti-scraping
- Données mises en cache pour éviter trop de requêtes vers Boursorama
- Fonctionne entièrement en local, sans dépendance externe

## Support

Pour toute question ou problème, veuillez créer une issue sur le dépôt GitHub du projet.