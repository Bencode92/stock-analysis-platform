# Documentation des requêtes Perplexity API pour TradePulse

Ce document décrit les formulations exactes utilisées par notre serveur proxy pour communiquer avec l'API Perplexity et obtenir des données structurées pour la plateforme TradePulse.

## 1. `/api/perplexity/news` - Actualités et événements financiers

```
Génère les actualités financières structurées en deux catégories distinctes sous forme de JSON :
1. "weekly_trends" : actualités clés de la semaine écoulée (du  08 au 11 mars 2025), résumant les tendances majeures influençant les marchés financiers globaux.
2. "daily_events" : actualités strictement limitées aux événements d'aujourd'hui (11 mars 2025), ayant un impact direct et immédiat sur les marchés financiers.
Format précis demandé :
{
  "weekly_trends": {
    "us": [
      {
        "source": "Nom précis de la source (ex: Federal Reserve, WSJ, Bloomberg)",
        "date": "entre le 08/03/2025 et le 11/03/2025",
        "title": "Titre informatif sur la tendance",
        "summary": "Résumé détaillé (2-3 phrases complètes) expliquant clairement comment cet événement influence la tendance générale des marchés américains"
      },
      ... (4 autres actualités maximum)
    ],
    "france": [
      {
        "source": "Nom précis de la source (ex: BCE, Banque de France, Les Échos)",
        "date": "entre le 08/03/2025 et le 11/03/2025",
        "title": "Titre informatif sur la tendance",
        "summary": "Résumé détaillé (2-3 phrases complètes) expliquant clairement comment cet événement influence la tendance générale des marchés français"
      },
      ... (4 autres actualités maximum)
    ]
  },
  "daily_events": {
    "us": [
      {
        "source": "Nom précis de la source",
        "date": "11/03/2025",
        "time": "HH:MM",
        "title": "Titre court et précis",
        "summary": "Résumé précis (2-3 phrases complètes) de l'événement du jour impactant directement les marchés financiers américains"
      },
      ... (5 autres actualités maximum)
    ],
    "france": [
      {
        "source": "Nom précis de la source",
        "date": "11/03/2025",
        "time": "HH:MM",
        "title": "Titre court et précis",
        "summary": "Résumé précis (2-3 phrases complètes) de l'événement du jour impactant directement les marchés financiers français"
      },
      ... (5 autres actualités maximum)
    ]
  },
  "lastUpdated": "2025-03-11T09:45:40Z"
}
Critères obligatoires :
- Sélectionne uniquement des sources crédibles (banques centrales, régulateurs, médias financiers majeurs).
- Résumés concrets, précis, et explicites (évite les généralités).
- Les actualités hebdomadaires montrent clairement les tendances globales, tandis que les événements du jour doivent refléter des impacts immédiats et précis sur les marchés.
Réponds uniquement avec ce JSON, sans texte additionnel.
```

## 2. `/api/perplexity/portfolios` - Recommandations de portefeuilles

```
En t'appuyant exclusivement sur les actualités générées précédemment (tendances hebdomadaires et événements du jour), crée trois portefeuilles adaptés aux conditions actuelles (11 mars 2025), avec une justification directe par rapport à ces actualités :
1. Portefeuille agressif ("agressif") :
   - Forte croissance, exposition élevée actions tech & crypto (10-20 % crypto max.).
2. Portefeuille modéré ("modere") :
   - Équilibré entre sécurité et croissance (crypto max. 5 %).
3. Portefeuille stable ("stable") :
   - Préservation du capital, sans crypto, priorisant obligations & actions dividendes élevées.
Format précis JSON :
{
  "agressif": [
    {
      "name": "Nom exact entreprise/fonds",
      "symbol": "SYMBOLE précis",
      "type": "STOCK/ETF/CRYPTO/BOND",
      "allocation": [pourcentage exact],
      "reason": "Lien direct précis (1-2 phrases) avec une actualité générée précédemment (weekly_trends ou daily_events)"
    },
    ... (10-20 instruments)
  ],
  "modere": [
    {
      "name": "Nom exact entreprise/fonds",
      "symbol": "SYMBOLE précis",
      "type": "STOCK/ETF/CRYPTO/BOND",
      "allocation": [pourcentage exact],
      "reason": "Lien direct précis avec une actualité générée précédemment"
    },
    ... (10-20 instruments)
  ],
  "stable": [
    {
      "name": "Nom exact entreprise/fonds",
      "symbol": "SYMBOLE précis",
      "type": "STOCK/ETF/BOND",
      "allocation": [pourcentage exact],
      "reason": "Lien direct précis avec une actualité générée précédemment"
    },
    ... (10-20 instruments)
  ],
  "lastUpdated": "2025-03-11T09:45:40Z"
}
Règles strictes :
- Total exact à 100 % d'allocation pour chaque portefeuille.
- Justification précise directement reliée aux actualités précédentes (tendances hebdomadaires ou événements du jour).
- Évite les généralités, assure-toi de spécifier clairement l'actualité concernée.
Réponds uniquement avec ce JSON, sans texte additionnel.
```

## 3. `/api/perplexity/search` - Recherches personnalisées

```
Contexte: Tu es TradePulse, un assistant financier expert basé sur l'IA. Nous sommes le 11 mars 2025.

Question de l'utilisateur: [QUERY DE L'UTILISATEUR]

Pour répondre, suis ces directives:
1. Réponds comme un analyste financier expert, en t'appuyant sur les actualités et tendances actuelles
2. Fournis des informations précises, factuelles et actualisées
3. Si la question concerne un instrument financier, inclus des données de marché pertinentes
4. Cite des sources crédibles quand c'est approprié
5. Adapte ton niveau technique au contexte de la question
6. Si la question n'est pas liée à la finance, propose une reformulation pertinente
7. Limite ta réponse à 300-400 mots pour rester concis et pratique

Ton objectif est de fournir une analyse utile, factuelle et actionnablqui aide l'utilisateur à prendre des décisions d'investissement éclairées.
```

Ces requêtes sont structurées pour obtenir des données précises et exploitables directement dans votre application TradePulse. Elles permettent notamment:

1. De séparer clairement les tendances hebdomadaires des événements quotidiens
2. D'établir un lien direct entre les actualités et les recommandations de portefeuille
3. De garantir des réponses structurées et facilement intégrables dans l'interface utilisateur
