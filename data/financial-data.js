// Données d'actualités pour la simulation Perplexity
export const newsData = [
    // Actualités positives
    {
        title: "Nvidia établit un nouveau record historique porté par l'IA",
        source: "Bloomberg",
        summary: "Le titre Nvidia a atteint un nouveau sommet aujourd'hui, porté par des prévisions optimistes sur la demande de puces pour l'intelligence artificielle et des partenariats stratégiques annoncés avec les géants de la tech.",
        sentiment: "positive"
    },
    {
        title: "Amazon dévoile sa nouvelle stratégie logistique pour réduire les délais de livraison",
        source: "Wall Street Journal",
        summary: "Le géant du e-commerce annonce un investissement massif dans l'automatisation de ses centres de distribution, visant à réduire significativement ses délais de livraison sur l'ensemble du territoire européen.",
        sentiment: "positive"
    },
    {
        title: "Les crypto-monnaies rebondissent après les commentaires de la SEC",
        source: "CoinDesk",
        summary: "Bitcoin et Ethereum ont enregistré une hausse significative suite aux déclarations du président de la SEC suggérant un assouplissement potentiel de la réglementation sur les actifs numériques.",
        sentiment: "positive"
    },
    {
        title: "La Chine annonce de nouvelles mesures de relance économique",
        source: "South China Morning Post",
        summary: "Le gouvernement chinois a dévoilé un plan de relance économique comprenant des réductions d'impôts et des investissements dans les infrastructures pour atteindre son objectif de croissance annuelle.",
        sentiment: "positive"
    },
    {
        title: "L'or atteint un nouveau sommet historique",
        source: "Bloomberg",
        summary: "Le métal précieux a franchi la barre des 2 300 dollars l'once, un niveau jamais atteint, porté par les incertitudes économiques mondiales et la baisse des rendements obligataires.",
        sentiment: "positive"
    },
    {
        title: "Tesla augmente sa production dans la gigafactory de Berlin",
        source: "Reuters",
        summary: "Tesla a annoncé une augmentation significative de sa capacité de production dans son usine berlinoise, visant à satisfaire la demande croissante en Europe pour ses véhicules électriques.",
        sentiment: "positive"
    },
    
    // Actualités négatives
    {
        title: "La BCE maintient ses taux directeurs malgré les tensions économiques",
        source: "Financial Times",
        summary: "La Banque Centrale Européenne a décidé de maintenir ses taux d'intérêt inchangés lors de sa réunion de politique monétaire d'aujourd'hui, malgré les signaux de ralentissement de l'économie européenne.",
        sentiment: "negative"
    },
    {
        title: "Les actions américaines en baisse suite aux inquiétudes sur l'inflation",
        source: "CNBC",
        summary: "Wall Street enregistre une baisse après la publication des derniers chiffres de l'inflation, supérieurs aux attentes des analystes, ravivant les craintes d'un maintien prolongé des taux élevés.",
        sentiment: "negative"
    },
    {
        title: "Le pétrole chute suite aux tensions au Moyen-Orient",
        source: "Reuters",
        summary: "Les cours du pétrole brut ont chuté de plus de 3% aujourd'hui malgré les tensions géopolitiques au Moyen-Orient, en raison des inquiétudes concernant la demande mondiale.",
        sentiment: "negative"
    },
    {
        title: "Nouvelle régulation européenne pourrait limiter l'IA",
        source: "The Guardian",
        summary: "Une nouvelle proposition de réglementation européenne vise à restreindre certaines applications de l'intelligence artificielle, ce qui pourrait affecter les entreprises technologiques et ralentir l'innovation.",
        sentiment: "negative"
    },
    {
        title: "La Fed signale des taux élevés plus longtemps que prévu",
        source: "Wall Street Journal",
        summary: "Le président de la Réserve fédérale a indiqué que les taux d'intérêt pourraient rester élevés plus longtemps que prévu pour lutter contre l'inflation persistante, malgré les risques pour la croissance économique.",
        sentiment: "negative"
    }
];

// Données sectorielles pour la simulation Perplexity
export const sectorData = {
    bullish: [
        {
            name: "Automobile & VE",
            reason: "La décision de la Maison Blanche concernant le report des droits de douane a un impact positif direct sur les constructeurs automobiles, particulièrement ceux investis dans les véhicules électriques."
        },
        {
            name: "Technologie",
            reason: "Les résultats attendus de sociétés comme Broadcom et le développement continu de l'IA poussent le secteur vers le haut, particulièrement pour les entreprises de semi-conducteurs comme Nvidia."
        },
        {
            name: "Énergie renouvelable",
            reason: "Les initiatives de transition énergétique continuent de favoriser les entreprises du secteur, particulièrement dans le contexte des tensions géopolitiques actuelles."
        },
        {
            name: "Intelligence Artificielle",
            reason: "Les nouvelles avancées technologiques et les applications innovantes de l'IA créent des opportunités significatives pour les entreprises spécialisées dans ce domaine."
        },
        {
            name: "Cybersécurité",
            reason: "L'augmentation des cyberattaques mondiales et les nouvelles réglementations renforcent la demande pour des solutions de cybersécurité avancées."
        },
        {
            name: "Semiconducteurs",
            reason: "La pénurie mondiale de puces et la forte demande pour les produits électroniques continuent de soutenir les fabricants de semiconducteurs."
        }
    ],
    bearish: [
        {
            name: "Obligations",
            reason: "La hausse historique des rendements obligataires européens indique une pression à la baisse sur les prix des obligations, impactant les détenteurs d'obligations à long terme."
        },
        {
            name: "Immobilier",
            reason: "La hausse des taux d'intérêt et l'incertitude concernant les décisions de la BCE exercent une pression sur le secteur immobilier, particulièrement sensible aux variations de taux."
        },
        {
            name: "Importateurs chinois",
            reason: "Les tensions commerciales croissantes entre les États-Unis et la Chine menacent les entreprises fortement dépendantes des importations chinoises, créant de l'incertitude pour leurs modèles d'approvisionnement."
        },
        {
            name: "Distribution traditionnelle",
            reason: "La concurrence croissante du e-commerce et les changements dans les habitudes des consommateurs continuent de peser sur les chaînes de magasins physiques."
        },
        {
            name: "Télécommunications",
            reason: "Les coûts élevés d'infrastructure et la concurrence féroce sur les prix exercent une pression sur les marges des entreprises du secteur."
        },
        {
            name: "Compagnies aériennes",
            reason: "L'augmentation des coûts du carburant et les préoccupations environnementales croissantes affectent négativement les perspectives à long terme du secteur aérien."
        }
    ]
};

// Mapping thème -> mots-clés
export const keywordToThemeMap = {
    'ia': 'intelligence_artificielle',
    'intelligence artificielle': 'intelligence_artificielle',
    'nvidia': 'intelligence_artificielle',
    'semi-conducteur': 'semi_conducteurs',
    'puces': 'semi_conducteurs',
    'énerg': 'energie',
    'électrique': 'energie',
    'renouvelable': 'energie',
    'pétrole': 'energie',
    'crypto': 'crypto',
    'bitcoin': 'crypto',
    'ethereum': 'crypto',
    'blockchain': 'crypto',
    'taux': 'economie',
    'bce': 'economie',
    'fed': 'economie',
    'inflation': 'economie',
    'e-commerce': 'commerce',
    'amazon': 'commerce',
    'livraison': 'commerce',
    'tesla': 'automobile',
    'automobile': 'automobile',
    've': 'automobile',
    'chine': 'chine',
    'chinois': 'chine'
};

// Instruments financiers par thème
export const financialInstruments = {
    stocks: {
        intelligence_artificielle: [
            { name: 'NVIDIA Corporation', symbol: 'NVDA', info: 'Leader dans les puces GPU pour l\'IA' },
            { name: 'Microsoft Corporation', symbol: 'MSFT', info: 'Investissements massifs dans l\'IA et partenariat avec OpenAI' },
            { name: 'Alphabet Inc.', symbol: 'GOOGL', info: 'Recherche avancée en IA via Google DeepMind' },
            { name: 'Palantir Technologies', symbol: 'PLTR', info: 'Plateforme d\'IA pour l\'analyse de données' },
            { name: 'C3.ai, Inc.', symbol: 'AI', info: 'Solutions d\'IA d\'entreprise' }
        ],
        semi_conducteurs: [
            { name: 'Taiwan Semiconductor', symbol: 'TSM', info: 'Plus grand fabricant de semi-conducteurs au monde' },
            { name: 'Advanced Micro Devices', symbol: 'AMD', info: 'Processeurs haute performance' },
            { name: 'Broadcom Inc.', symbol: 'AVGO', info: 'Fournisseur de composants pour les communications' },
            { name: 'Intel Corporation', symbol: 'INTC', info: 'Géant historique des microprocesseurs' },
            { name: 'Qualcomm Incorporated', symbol: 'QCOM', info: 'Leader dans les puces pour smartphones' }
        ],
        energie: [
            { name: 'Tesla, Inc.', symbol: 'TSLA', info: 'Leader des véhicules électriques et stockage d\'énergie' },
            { name: 'NextEra Energy', symbol: 'NEE', info: 'Plus grand producteur d\'énergie renouvelable aux États-Unis' },
            { name: 'Enphase Energy', symbol: 'ENPH', info: 'Systèmes de gestion d\'énergie solaire' },
            { name: 'Vestas Wind Systems', symbol: 'VWDRY', info: 'Fabricant mondial d\'éoliennes' },
            { name: 'SolarEdge Technologies', symbol: 'SEDG', info: 'Optimiseurs de puissance pour panneaux solaires' }
        ],
        economie: [
            { name: 'JPMorgan Chase', symbol: 'JPM', info: 'Plus grande banque américaine' },
            { name: 'Goldman Sachs', symbol: 'GS', info: 'Banque d\'investissement mondiale' },
            { name: 'BlackRock', symbol: 'BLK', info: 'Plus grand gestionnaire d\'actifs au monde' },
            { name: 'Visa Inc.', symbol: 'V', info: 'Leader mondial des paiements numériques' },
            { name: 'S&P Global', symbol: 'SPGI', info: 'Fournisseur d\'indices et d\'analyse de marchés' }
        ],
        commerce: [
            { name: 'Amazon.com', symbol: 'AMZN', info: 'Leader mondial du e-commerce et du cloud' },
            { name: 'Shopify Inc.', symbol: 'SHOP', info: 'Plateforme pour créer des boutiques en ligne' },
            { name: 'Walmart Inc.', symbol: 'WMT', info: 'Plus grande chaîne de vente au détail' },
            { name: 'MercadoLibre', symbol: 'MELI', info: 'Principal site de e-commerce en Amérique latine' },
            { name: 'Alibaba Group', symbol: 'BABA', info: 'Géant chinois du e-commerce' }
        ],
        automobile: [
            { name: 'Tesla, Inc.', symbol: 'TSLA', info: 'Leader des véhicules électriques' },
            { name: 'Volkswagen AG', symbol: 'VWAGY', info: 'Deuxième plus grand constructeur automobile mondial' },
            { name: 'General Motors', symbol: 'GM', info: 'Constructeur automobile américain avec ambitions VE' },
            { name: 'BYD Company', symbol: 'BYDDY', info: 'Plus grand fabricant chinois de VE' },
            { name: 'Ford Motor Company', symbol: 'F', info: 'Transition vers l\'électrique avec modèles comme la Mustang Mach-E' }
        ],
        chine: [
            { name: 'Alibaba Group', symbol: 'BABA', info: 'Géant chinois du e-commerce' },
            { name: 'Tencent Holdings', symbol: 'TCEHY', info: 'Conglomérat technologique chinois' },
            { name: 'JD.com', symbol: 'JD', info: 'Plateforme chinoise de e-commerce' },
            { name: 'Baidu', symbol: 'BIDU', info: 'Moteur de recherche chinois et IA' },
            { name: 'NIO Inc.', symbol: 'NIO', info: 'Fabricant chinois de véhicules électriques premium' }
        ],
        crypto: [
            { name: 'Coinbase Global', symbol: 'COIN', info: 'Plateforme d\'échange de cryptomonnaies' },
            { name: 'MicroStrategy', symbol: 'MSTR', info: 'Entreprise avec d\'importantes réserves de Bitcoin' },
            { name: 'Block, Inc.', symbol: 'SQ', info: 'Anciennement Square, impliqué dans les paiements Bitcoin' },
            { name: 'PayPal Holdings', symbol: 'PYPL', info: 'Permet l\'achat et la vente de cryptomonnaies' },
            { name: 'Marathon Digital', symbol: 'MARA', info: 'Société de minage de Bitcoin' }
        ]
    },
    etfs: {
        intelligence_artificielle: [
            { name: 'Global X Robotics & Artificial Intelligence ETF', symbol: 'BOTZ', info: 'ETF axé sur la robotique et l\'IA' },
            { name: 'ARK Autonomous Technology & Robotics ETF', symbol: 'ARKQ', info: 'ETF axé sur les technologies autonomes' },
            { name: 'iShares Robotics and Artificial Intelligence ETF', symbol: 'IRBO', info: 'Large exposition aux entreprises d\'IA' }
        ],
        semi_conducteurs: [
            { name: 'VanEck Semiconductor ETF', symbol: 'SMH', info: 'ETF majeur pour l\'industrie des semi-conducteurs' },
            { name: 'iShares Semiconductor ETF', symbol: 'SOXX', info: 'Exposition aux principales entreprises de puces' },
            { name: 'Invesco PHLX Semiconductor ETF', symbol: 'SOXQ', info: 'Suivi de l\'indice Philadelphia Semiconductor' }
        ],
        energie: [
            { name: 'Invesco Solar ETF', symbol: 'TAN', info: 'Principal ETF pour l\'énergie solaire' },
            { name: 'First Trust Global Wind Energy ETF', symbol: 'FAN', info: 'Exposition mondiale à l\'énergie éolienne' },
            { name: 'iShares Global Clean Energy ETF', symbol: 'ICLN', info: 'ETF diversifié sur les énergies propres' }
        ],
        economie: [
            { name: 'SPDR S&P 500 ETF', symbol: 'SPY', info: 'ETF le plus important suivant le S&P 500' },
            { name: 'Vanguard Total Stock Market ETF', symbol: 'VTI', info: 'Exposition à l\'ensemble du marché américain' },
            { name: 'iShares MSCI ACWI ETF', symbol: 'ACWI', info: 'Exposition mondiale aux marchés développés et émergents' }
        ],
        commerce: [
            { name: 'Amplify Online Retail ETF', symbol: 'IBUY', info: 'ETF axé sur le commerce en ligne' },
            { name: 'ProShares Online Retail ETF', symbol: 'ONLN', info: 'Exposition aux détaillants en ligne' },
            { name: 'Global X E-commerce ETF', symbol: 'EBIZ', info: 'ETF mondial sur le e-commerce' }
        ],
        automobile: [
            { name: 'Global X Autonomous & Electric Vehicles ETF', symbol: 'DRIV', info: 'ETF sur les VE et véhicules autonomes' },
            { name: 'KraneShares Electric Vehicles & Future Mobility ETF', symbol: 'KARS', info: 'ETF mondial sur la mobilité du futur' },
            { name: 'iShares Self-Driving EV and Tech ETF', symbol: 'IDRV', info: 'Exposition aux technologies de conduite autonome' }
        ],
        chine: [
            { name: 'iShares MSCI China ETF', symbol: 'MCHI', info: 'Large exposition au marché chinois' },
            { name: 'KraneShares CSI China Internet ETF', symbol: 'KWEB', info: 'ETF axé sur les entreprises internet chinoises' },
            { name: 'Invesco Golden Dragon China ETF', symbol: 'PGJ', info: 'Entreprises chinoises cotées aux États-Unis' }
        ],
        crypto: [
            { name: 'Amplify Transformational Data Sharing ETF', symbol: 'BLOK', info: 'ETF axé sur la blockchain' },
            { name: 'Bitwise Crypto Industry Innovators ETF', symbol: 'BITQ', info: 'Entreprises de l\'écosystème crypto' },
            { name: 'Global X Blockchain ETF', symbol: 'BKCH', info: 'Exposition mondiale à la blockchain' }
        ]
    },
    cryptos: {
        primary: [
            { name: 'Bitcoin', symbol: 'BTC', info: 'La plus grande crypto par capitalisation et adoption' },
            { name: 'Ethereum', symbol: 'ETH', info: 'Plateforme de contrats intelligents et d\'applications décentralisées' }
        ],
        intelligence_artificielle: [
            { name: 'The Graph', symbol: 'GRT', info: 'Protocole d\'indexation pour les données blockchain' },
            { name: 'Fetch.ai', symbol: 'FET', info: 'Plateforme d\'IA décentralisée' },
            { name: 'SingularityNET', symbol: 'AGIX', info: 'Place de marché pour l\'IA' }
        ],
        energie: [
            { name: 'Energy Web Token', symbol: 'EWT', info: 'Blockchain dédiée au secteur de l\'énergie' },
            { name: 'Power Ledger', symbol: 'POWR', info: 'Plateforme d\'échange d\'énergie pair-à-pair' }
        ],
        commerce: [
            { name: 'Uniswap', symbol: 'UNI', info: 'Protocole d\'échange décentralisé' },
            { name: 'Loopring', symbol: 'LRC', info: 'Protocole pour échanger actifs sur Ethereum' }
        ],
        economie: [
            { name: 'Maker', symbol: 'MKR', info: 'Protocole de finance décentralisée (DeFi)' },
            { name: 'Aave', symbol: 'AAVE', info: 'Protocole de prêt décentralisé' },
            { name: 'Compound', symbol: 'COMP', info: 'Protocole de marché monétaire' }
        ],
        crypto: [
            { name: 'Cardano', symbol: 'ADA', info: 'Plateforme blockchain de troisième génération' },
            { name: 'Polkadot', symbol: 'DOT', info: 'Protocole reliant différentes blockchains' },
            { name: 'Solana', symbol: 'SOL', info: 'Blockchain haute performance' },
            { name: 'Binance Coin', symbol: 'BNB', info: 'Crypto de l\'écosystème Binance' }
        ]
    }
};

// Données de fallback pour le portefeuille
export const fallbackPortfolio = [
    {
        name: "Tesla, Inc.",
        symbol: "TSLA",
        type: "stock",
        allocation: 15,
        reason: "Bénéficie directement du report des droits de douane avec une forte présence sur le marché européen et chinois."
    },
    {
        name: "NVIDIA Corporation",
        symbol: "NVDA",
        type: "stock",
        allocation: 18,
        reason: "Leader dans les puces IA avec une performance exceptionnelle. Profite de la tendance haussière du secteur technologique."
    },
    {
        name: "Microsoft Corporation",
        symbol: "MSFT",
        type: "stock",
        allocation: 12,
        reason: "Position dominante dans le cloud et l'IA, moins impacté par les tensions sino-américaines."
    },
    {
        name: "Invesco Solar ETF",
        symbol: "TAN",
        type: "etf",
        allocation: 10,
        reason: "Exposition au secteur de l'énergie solaire, profitant de la tendance positive du secteur des énergies renouvelables."
    },
    {
        name: "Global X EV ETF",
        symbol: "DRIV",
        type: "etf",
        allocation: 10,
        reason: "Exposition diversifiée au secteur des VE et de la conduite autonome, bénéficiant des décisions favorables."
    },
    {
        name: "ARK Innovation ETF",
        symbol: "ARKK",
        type: "etf",
        allocation: 10,
        reason: "Exposition aux entreprises disruptives dans les secteurs de la technologie et de l'innovation."
    },
    {
        name: "Bitcoin",
        symbol: "BTC",
        type: "crypto",
        allocation: 15,
        reason: "Rebond significatif suite aux commentaires positifs de la SEC et valeur refuge face à l'inflation."
    },
    {
        name: "Ethereum",
        symbol: "ETH",
        type: "crypto",
        allocation: 10,
        reason: "Bénéficie du développement des applications décentralisées et du potentiel d'adoption des technologies blockchain."
    }
];
