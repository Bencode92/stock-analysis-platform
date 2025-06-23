/**
 * ═══════════════════════════════════════════════════════════════
 * 🎯 SYSTÈME DE CARTES DÉTAILLÉES POUR ENVELOPPES FISCALES
 * TradePulse Finance Intelligence Platform
 * Version 1.0 - Créé le 23 juin 2025
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Templates détaillés pour chaque enveloppe fiscale
 * Structure : points forts, risques, fiscalité, cas d'usage
 */
export const enveloppeCards = {
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🏦 COMPTES TITRES & ACTIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  pea: {
    title: "PEA",
    subtitle: "Plan d'Épargne en Actions",
    category: "Actions européennes",
    horizon: "≥ 5 ans",
    riskLevel: "modéré",
    riskColor: "green",
    
    fiscalite: {
      avant: "PFU 30% + clôture",
      apres: "17,2% prélèv. sociaux, pas d'IR"
    },
    
    plafonds: {
      individuel: "150 000€",
      couple: "300 000€",
      note: "225 k€ avec PEA-PME"
    },
    
    pointsForts: [
      "0% d'impôt sur le revenu sur les gains après 5 ans",
      "Versements libres ; plafond 150 k€ (225 k€ avec PEA-PME)",
      "Retraits partiels possibles dès 5 ans sans fermer le plan",
      "Un seul compteur : date du 1er versement",
      "Large choix : actions UE, ETF éligibles"
    ],
    
    risquesLimites: [
      "Retrait < 5 ans ⇒ PFU 30% + clôture",
      "Univers limité UE/EEE",
      "Volatilité actions",
      "Capital non garanti"
    ],
    
    fiscaliteDetail: [
      "> 5 ans : 17,2% prélèv. sociaux, pas d'IR",
      "< 5 ans : PFU 30% (12,8% IR + 17,2% PS)",
      "Dividendes non cotés exonérés jusqu'à 10%/an"
    ],
    
    casDusage: [
      "🎯 **Investissement actions long terme** (≥ 8-10 ans)",
      "💰 **Constitution d'un capital** avec fiscalité privilégiée", 
      "📈 **Diversification internationale** (ETF World, Europe)",
      "🏠 **Complément retraite** ou projets long terme"
    ],
    
    conseils: [
      "Privilégier les ETF pour débuter (diversification)",
      "DCA (Dollar Cost Averaging) pour lisser la volatilité", 
      "Ne pas toucher avant 5 ans sauf urgence",
      "Combiner avec PEA-PME pour 225k€ total"
    ]
  },

  "pea-pme": {
    title: "PEA-PME/ETI",
    subtitle: "Plan d'Épargne en Actions PME",
    category: "Actions PME/ETI européennes",
    horizon: "≥ 5 ans",
    riskLevel: "élevé",
    riskColor: "orange",
    
    fiscalite: {
      avant: "PFU 30% + clôture",
      apres: "17,2% prélèv. sociaux, pas d'IR"
    },
    
    plafonds: {
      individuel: "225 000€",
      note: "Cumulable avec PEA classique"
    },
    
    pointsForts: [
      "Même avantages fiscaux que le PEA classique",
      "Plafond de 225 000€ (en plus du PEA)",
      "Soutien aux PME/ETI européennes",
      "Liquidité après 5 ans sans fermeture"
    ],
    
    risquesLimites: [
      "Risque plus élevé (PME/ETI)",
      "Univers d'investissement plus restreint",
      "Volatilité supérieure aux grandes capitalisations",
      "Liquidité parfois moindre"
    ],
    
    fiscaliteDetail: [
      "Identique au PEA classique",
      "> 5 ans : exonération IR, 17,2% PS",
      "< 5 ans : PFU 30% + clôture du plan"
    ],
    
    casDusage: [
      "💼 **Complément du PEA classique** (plafond additionnel)",
      "🚀 **Exposition PME/ETI** pour diversification",
      "💎 **Investissement spécialisé** secteurs de croissance"
    ],
    
    conseils: [
      "À ouvrir APRÈS avoir maximisé le PEA classique",
      "Privilégier ETF PME pour diversifier",
      "Horizon minimum 8-10 ans recommandé"
    ]
  },

  "assurance-vie": {
    title: "Assurance-vie",
    subtitle: "Contrat d'épargne polyvalent",
    category: "Épargne mixte",
    horizon: "≥ 8 ans",
    riskLevel: "modéré",
    riskColor: "blue",
    
    fiscalite: {
      avant: "PFU 30% (ou 35% + PS si < 4 ans)",
      apres: "24,7% sur prime ≤ 150k€, 30% au-delà"
    },
    
    plafonds: {
      individuel: "Aucun",
      abattement: "4 600€/an (9 200€ couple)",
      note: "Plafond 150k€ pour taux privilégié"
    },
    
    pointsForts: [
      "Fiscalité dégressive : 24,7% après 8 ans",
      "Abattement annuel 4 600€ (9 200€ couple)", 
      "Flexibilité : fonds €, UC, arbitrages libres",
      "Transmission : abattement succession 152 500€/bénéficiaire",
      "Rachat partiel possible à tout moment"
    ],
    
    risquesLimites: [
      "Rendement fonds € en baisse (≈ 2-3%)",
      "Frais de gestion annuels (0,5-1,5%)",
      "UC : capital non garanti",
      "Fiscalité moins avantageuse que PEA < 8 ans"
    ],
    
    fiscaliteDetail: [
      "< 4 ans : PFU 30% ou 35% + 17,2% PS (anciens contrats)",
      "4-8 ans : PFU 30% (12,8% IR + 17,2% PS)",
      "> 8 ans : 7,5% IR + 17,2% PS sur prime ≤ 150k€",
      "Abattement : 4 600€ célibataire, 9 200€ couple"
    ],
    
    casDusage: [
      "💼 **Épargne polyvalente** avec flexibilité",
      "🏠 **Complément PEA** pour dépasser 150k€",
      "👨‍👩‍👧‍👦 **Transmission** avec avantages fiscaux",
      "🛡️ **Sécurité** avec fonds € garantis"
    ],
    
    conseils: [
      "Privilégier contrats en ligne (frais réduits)",
      "Mélange fonds €/UC selon profil de risque",
      "Attendre 8 ans pour optimiser la fiscalité",
      "Utiliser pour transmission après épuisement PEA"
    ]
  },

  cto: {
    title: "Compte-titres ordinaire",
    subtitle: "Investissement sans contrainte",
    category: "Tous actifs",
    horizon: "Variable",
    riskLevel: "élevé",
    riskColor: "orange",
    
    fiscalite: {
      avant: "PFU 30% ou option barème",
      apres: "PFU 30% ou option barème"
    },
    
    plafonds: {
      individuel: "Aucun",
      note: "Liberté totale d'investissement"
    },
    
    pointsForts: [
      "Aucune limite de montant ou durée",
      "Univers d'investissement mondial complet",
      "Report des moins-values sur 10 ans",
      "Option barème + CSG 6,8% déductible année N+1",
      "Liquidité immédiate"
    ],
    
    risquesLimites: [
      "Fiscalité pleine : PFU 30% dès le 1er euro",
      "Pas d'abattement ni d'exonération",
      "Volatilité selon actifs choisis",
      "Risque de change (actions étrangères)"
    ],
    
    fiscaliteDetail: [
      "PFU 30% : 12,8% IR + 17,2% prélèv. sociaux",
      "Option barème : TMI + 17,2% PS - 6,8% CSG déductible",
      "Report moins-values : 10 ans",
      "Dividendes : même fiscalité que plus-values"
    ],
    
    casDusage: [
      "🌍 **Diversification mondiale** (actions US, Asie, etc.)",
      "💎 **Gros montants** au-delà des plafonds PEA/AV",
      "⚡ **Trading/investissement court terme**",
      "🏭 **Secteurs spécifiques** non éligibles PEA"
    ],
    
    conseils: [
      "Complémentaire au PEA/AV, pas substitut",
      "Privilégier pour actions non-européennes", 
      "Utiliser report moins-values intelligemment",
      "Option barème si TMI < 12,8%"
    ]
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🏛️ LIVRETS RÉGLEMENTÉS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  "livret-a": {
    title: "Livret A",
    subtitle: "Épargne de précaution",
    category: "Épargne sûre",
    horizon: "Court terme",
    riskLevel: "très faible",
    riskColor: "green",
    
    fiscalite: {
      avant: "Exonéré",
      apres: "Exonéré"
    },
    
    plafonds: {
      individuel: "22 950€",
      note: "Taux : 3% (2024)"
    },
    
    pointsForts: [
      "Capital et intérêts 100% garantis",
      "Totalement défiscalisé",
      "Liquidité immédiate sans pénalité", 
      "Ouverture dès la naissance",
      "Un seul livret par personne"
    ],
    
    risquesLimites: [
      "Plafond limité : 22 950€",
      "Rendement réel faible (inflation)",
      "Taux variable selon contexte économique",
      "Opportunité : manque à gagner vs autres placements"
    ],
    
    fiscaliteDetail: [
      "Exonération totale d'impôt sur le revenu",
      "Exonération totale de prélèvements sociaux",
      "Intérêts calculés par quinzaine",
      "Versés au 31 décembre"
    ],
    
    casDusage: [
      "🚨 **Épargne de précaution** (3-6 mois de charges)",
      "💰 **Projets court terme** (< 2 ans)",
      "🎯 **Argent parking** en attente d'investissement",
      "👶 **Épargne enfants** dès la naissance"
    ],
    
    conseils: [
      "Maximaliser avant autres livrets",
      "Ne pas dépasser : diversifier sur LDDS/LEP",
      "Base de toute stratégie patrimoniale",
      "Renouveler régulièrement vers investissements"
    ]
  },

  ldds: {
    title: "LDDS",
    subtitle: "Livret Développement Durable et Solidaire", 
    category: "Épargne sûre",
    horizon: "Court terme",
    riskLevel: "très faible",
    riskColor: "green",
    
    fiscalite: {
      avant: "Exonéré",
      apres: "Exonéré"
    },
    
    plafonds: {
      individuel: "12 000€",
      note: "Même taux que Livret A : 3%"
    },
    
    pointsForts: [
      "Même avantages que Livret A",
      "Financement de l'économie sociale et solidaire",
      "Complémentaire au Livret A",
      "Liquidité totale",
      "Défiscalisation complète"
    ],
    
    risquesLimites: [
      "Plafond encore plus limité : 12 000€",
      "Même inconvénients que Livret A",
      "Rendement réel négatif en cas d'inflation forte"
    ],
    
    fiscaliteDetail: [
      "Identique au Livret A",
      "Exonération IR + prélèvements sociaux",
      "Intérêts par quinzaine",
      "Cumul possible avec Livret A"
    ],
    
    casDusage: [
      "🌱 **Complément Livret A** (34 950€ au total)",
      "💚 **Épargne solidaire** avec impact ESG",
      "🎯 **Diversification livrets** réglementés"
    ],
    
    conseils: [
      "Ouvrir après avoir maximisé Livret A",
      "Vérifier éligibilité LEP avant (meilleur taux)",
      "Partie intégrante épargne de précaution"
    ]
  },

  lep: {
    title: "LEP",
    subtitle: "Livret d'Épargne Populaire",
    category: "Épargne sûre (sous conditions)",
    horizon: "Court terme",
    riskLevel: "très faible",
    riskColor: "green",
    
    fiscalite: {
      avant: "Exonéré",
      apres: "Exonéré"
    },
    
    plafonds: {
      individuel: "10 000€",
      note: "Taux : 5% (2024) - Sous conditions de revenus"
    },
    
    pointsForts: [
      "Taux supérieur au Livret A (5% vs 3%)",
      "Exonération fiscale totale",
      "Capital garanti",
      "Liquidité immédiate"
    ],
    
    risquesLimites: [
      "Conditions de revenus strictes",
      "Plafond limité : 10 000€",
      "Vérification annuelle des revenus",
      "Fermeture si dépassement revenus"
    ],
    
    fiscaliteDetail: [
      "Exonération totale IR + PS",
      "Conditions : RFR ≤ 21 393€ (célibataire 2024)",
      "Intérêts calculés par quinzaine"
    ],
    
    casDusage: [
      "🎯 **Priorité absolue** si éligible",
      "💰 **Complément épargne de précaution**",
      "🏆 **Meilleur rendement garanti** du marché"
    ],
    
    conseils: [
      "À maximaliser EN PRIORITÉ si éligible",
      "Vérifier conditions revenus chaque année",
      "Combiner avec Livret A + LDDS"
    ]
  },

  "livret-jeune": {
    title: "Livret Jeune",
    subtitle: "Épargne réglementée 12-25 ans",
    category: "Épargne jeune",
    horizon: "Court terme",
    riskLevel: "très faible",
    riskColor: "green",
    
    fiscalite: {
      avant: "Exonéré",
      apres: "Exonéré"
    },
    
    plafonds: {
      individuel: "1 600€",
      note: "Taux libre ≥ Livret A (souvent 2,75%+)"
    },
    
    pointsForts: [
      "Taux généralement supérieur au Livret A",
      "Exonération fiscale totale",
      "Réservé aux 12-25 ans",
      "Capital garanti"
    ],
    
    risquesLimites: [
      "Plafond très limité : 1 600€",
      "Fermeture automatique à 26 ans",
      "Taux variable selon établissement"
    ],
    
    fiscaliteDetail: [
      "Exonération totale IR + PS",
      "Disponible de 12 à 25 ans inclus"
    ],
    
    casDusage: [
      "👨‍🎓 **Épargne étudiants/jeunes actifs**",
      "🎯 **Complément autres livrets jeunes**"
    ],
    
    conseils: [
      "Maximaliser avant 26 ans",
      "Comparer taux entre banques",
      "Transférer vers autres livrets à 26 ans"
    ]
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🏠 IMMOBILIER & LOGEMENT  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  pel: {
    title: "PEL",
    subtitle: "Plan Épargne Logement",
    category: "Épargne logement",
    horizon: "4-10 ans",
    riskLevel: "très faible",
    riskColor: "green",
    
    fiscalite: {
      avant: "PFU 30% sur intérêts (plans > 2018)",
      apres: "Barème + PS après 12 ans"
    },
    
    plafonds: {
      individuel: "61 200€",
      note: "Taux fixe à l'ouverture (2,25% en 2024)"
    },
    
    pointsForts: [
      "Taux fixe garanti pendant toute la durée",
      "Droit à prêt immobilier à taux préférentiel",
      "Prime d'État sous conditions",
      "Capital garanti"
    ],
    
    risquesLimites: [
      "Taux souvent inférieur à l'inflation",
      "Fiscalité sur intérêts (plans récents)",
      "Versements minimum obligatoires",
      "Pénalités en cas de retrait anticipé"
    ],
    
    fiscaliteDetail: [
      "Plans > 2018 : PFU 30% sur intérêts (12 ans)",
      "Plans ≤ 2017 : exonération IR, PS 17,2%",
      "Après 12 ans : barème + PS (CSG déductible)"
    ],
    
    casDusage: [
      "🏠 **Projet immobilier** à moyen terme",
      "🎯 **Épargne sécurisée** taux garanti",
      "💰 **Complément financement** achat résidence"
    ],
    
    conseils: [
      "Intéressant surtout pour droit au prêt",
      "Comparer avec autres placements",
      "Clôturer si meilleure alternative disponible"
    ]
  },

  cel: {
    title: "CEL",
    subtitle: "Compte Épargne Logement",
    category: "Épargne logement",
    horizon: "Flexible",
    riskLevel: "très faible",
    riskColor: "green",
    
    fiscalite: {
      avant: "PFU 30% chaque année",
      apres: "PFU 30% chaque année"
    },
    
    plafonds: {
      individuel: "15 300€",
      note: "Taux : 2% (2024)"
    },
    
    pointsForts: [
      "Plus flexible que le PEL",
      "Droit à prêt immobilier",
      "Capital garanti",
      "Versements/retraits libres"
    ],
    
    risquesLimites: [
      "Taux faible (2%)",
      "Fiscalité annuelle sur intérêts",
      "Plafond limité",
      "Rendement réel souvent négatif"
    ],
    
    fiscaliteDetail: [
      "PFU 30% sur intérêts chaque année",
      "Pas d'exonération possible"
    ],
    
    casDusage: [
      "🏠 **Alternative flexible au PEL**",
      "🎯 **Épargne logement** sans contrainte"
    ],
    
    conseils: [
      "Moins intéressant que PEL généralement",
      "Privilégier si besoin de flexibilité",
      "Considérer autres alternatives"
    ]
  },

  "scpi-cto": {
    title: "SCPI (via CTO)",
    subtitle: "Immobilier papier",
    category: "Immobilier",
    horizon: "≥ 8-10 ans",
    riskLevel: "modéré",
    riskColor: "blue",
    
    fiscalite: {
      loyers: "Revenus fonciers (micro-foncier 30% ou réel)",
      plusValues: "Régime immo : 19% IR + 17,2% PS + abattements"
    },
    
    plafonds: {
      individuel: "Aucun",
      note: "Liquidité variable selon SCPI"
    },
    
    pointsForts: [
      "Rendement attractif : 4-6% nets",
      "Diversification géographique et sectorielle",
      "Gestion professionnelle déléguée",
      "Ticket d'entrée accessible (≈ 1000€)",
      "Revenus réguliers trimestriels"
    ],
    
    risquesLimites: [
      "Liquidité limitée (délai de cession)",
      "Fiscalité lourde sur revenus fonciers",
      "Risque de perte en capital",
      "Frais d'entrée élevés (10-12%)",
      "Marché immobilier cyclique"
    ],
    
    fiscaliteDetail: [
      "Revenus : micro-foncier 30% ≤ 15k€ ou réel + PS 17,2%",
      "Plus-values : 19% IR + 17,2% PS",
      "Abattements : 6%/an après 6 ans (IR), 1,65%/an (PS)",
      "Surtaxe progressive > 50k€ de plus-value"
    ],
    
    casDusage: [
      "🏢 **Diversification immobilière** sans gestion",
      "💰 **Revenus complémentaires** réguliers",
      "🌍 **Exposition immobilier européen**",
      "📊 **Alternative fonds € assurance-vie**"
    ],
    
    conseils: [
      "Privilégier SCPI anciennes avec historique",
      "Diversifier sur plusieurs SCPI/secteurs",
      "Horizon minimum 8-10 ans",
      "Comparer frais et performances nettes"
    ]
  },

  "scpi-av": {
    title: "SCPI (via AV)",
    subtitle: "Immobilier logé en assurance-vie",
    category: "Immobilier",
    horizon: "≥ 8 ans",
    riskLevel: "modéré",
    riskColor: "blue",
    
    fiscalite: {
      avant: "Fiscalité assurance-vie",
      apres: "Fiscalité assurance-vie"
    },
    
    plafonds: {
      individuel: "Aucun",
      note: "Avantages AV + rendement immobilier"
    },
    
    pointsForts: [
      "Fiscalité assurance-vie plus douce",
      "Pas de revenus fonciers à déclarer",
      "Arbitrages libres entre supports",
      "Avantages succession de l'AV"
    ],
    
    risquesLimites: [
      "Choix SCPI limité par l'assureur",
      "Frais de gestion AV en plus",
      "Moins de contrôle qu'en direct",
      "Performance nette réduite"
    ],
    
    fiscaliteDetail: [
      "Soumis à la fiscalité de l'assurance-vie",
      "Pas de revenus fonciers déclarés",
      "Gains taxés seulement au rachat"
    ],
    
    casDusage: [
      "🎯 **Diversification dans AV existante**",
      "💼 **Éviter contraintes revenus fonciers**",
      "🏠 **Complément fonds €** avec plus de rendement"
    ],
    
    conseils: [
      "Comparer frais totaux vs SCPI directes",
      "Vérifier qualité/choix SCPI proposées",
      "Intégrer dans stratégie AV globale"
    ]
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🚀 RETRAITE & DÉFISCALISATION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  per: {
    title: "PER",
    subtitle: "Plan d'Épargne Retraite",
    category: "Épargne retraite",
    horizon: "Jusqu'à la retraite",
    riskLevel: "modéré",
    riskColor: "blue",
    
    fiscalite: {
      avant: "Déduction fiscale à l'entrée",
      apres: "PFU 30% sur plus-values (sortie capital)"
    },
    
    plafonds: {
      individuel: "Variable selon revenus",
      note: "10% revenus pro (plafonné à 10% de 8 PASS)"
    },
    
    pointsForts: [
      "Déduction fiscale immédiate des versements",
      "Économie d'impôt selon TMI (11%, 30%, 41%, 45%)",
      "Déblocage anticipé possible (RP, invalidité, etc.)",
      "Choix sortie : rente ou capital (ou mixte)",
      "Transmission possible"
    ],
    
    risquesLimites: [
      "Épargne bloquée jusqu'à la retraite (sauf cas exceptionnels)",
      "Taxation à la sortie (capital ou rente)",
      "Risque de perte en capital (UC)",
      "Frais de gestion souvent élevés"
    ],
    
    fiscaliteDetail: [
      "Entrée : déduction jusqu'à 10% revenus pro",
      "Sortie capital : PFU 30% sur plus-values",
      "Sortie rente : imposée au barème",
      "Déblocage RP : abattement 40% si > 2 ans détention"
    ],
    
    casDusage: [
      "🎯 **Optimisation fiscale** (TMI ≥ 30%)",
      "🏠 **Financement résidence principale**",
      "👴 **Préparation retraite** long terme",
      "💰 **Complément autres enveloppes**"
    ],
    
    conseils: [
      "Intéressant surtout si TMI ≥ 30%",
      "Privilégier PER avec choix UC variés",
      "Possibilité déblocage RP très avantageuse",
      "Calculer l'économie d'impôt réelle"
    ]
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🎲 PLACEMENTS SPÉCIALISÉS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  "fcpi-fip": {
    title: "FCPI / FIP",
    subtitle: "Fonds Capital Risque PME",
    category: "Capital risque",
    horizon: "≥ 5 ans",
    riskLevel: "très élevé",
    riskColor: "red",
    
    fiscalite: {
      avant: "Réduction IR 18% (plafonnée)",
      apres: "Exonération IR après 5 ans"
    },
    
    plafonds: {
      individuel: "12 000€ (24 000€ couple)",
      note: "Réduction IR de 18%"
    },
    
    pointsForts: [
      "Réduction d'impôt immédiate de 18%",
      "Exonération IR sur plus-values après 5 ans",
      "Soutien à l'innovation et PME françaises",
      "Diversification de portefeuille"
    ],
    
    risquesLimites: [
      "Risque de perte en capital très élevé",
      "Liquidité quasi-nulle (5 ans minimum)",
      "Performances très variables",
      "Reprise réduction IR si sortie < 5 ans"
    ],
    
    fiscaliteDetail: [
      "Réduction IR : 18% des versements",
      "Plafond : 12k€ solo, 24k€ couple",
      "Sortie < 5 ans : reprise + PFU 30%",
      "Sortie ≥ 5 ans : exonération IR, PS 17,2%"
    ],
    
    casDusage: [
      "🎯 **Optimisation fiscale** (TMI élevée)",
      "🚀 **Diversification alternative**",
      "💡 **Soutien innovation française**"
    ],
    
    conseils: [
      "Seulement si capacité de perte totale",
      "Ne jamais dépasser 5% du patrimoine",
      "Privilégier fonds avec historique",
      "Horizon 7-10 ans minimum en pratique"
    ]
  },

  "crypto-cto": {
    title: "Crypto-actifs (via CTO)",
    subtitle: "Actifs numériques",
    category: "Actifs numériques",
    horizon: "Variable",
    riskLevel: "très élevé",
    riskColor: "red",
    
    fiscalite: {
      avant: "PFU 30% sur cessions > 305€",
      apres: "PFU 30% ou option barème"
    },
    
    plafonds: {
      individuel: "Aucun",
      note: "Seuil de déclaration : 305€ de cessions/an"
    },
    
    pointsForts: [
      "Potentiel de rendement très élevé",
      "Diversification alternative",
      "Liquidité 24h/24",
      "Innovation technologique",
      "Seuil de déclaration (305€)"
    ],
    
    risquesLimites: [
      "Volatilité extrême (-50% à +1000%)",
      "Risque de perte totale",
      "Régulation en évolution",
      "Complexité technique",
      "Risques cyber (piratage, perte clés)"
    ],
    
    fiscaliteDetail: [
      "Cessions ≤ 305€/an : pas de déclaration",
      "Cessions > 305€ : PFU 30% ou option barème",
      "Report moins-values : 10 ans",
      "Base : prix de cession - prix d'acquisition"
    ],
    
    casDusage: [
      "🎯 **Diversification alternative** (< 5% portefeuille)",
      "🚀 **Exposition innovation blockchain**",
      "💰 **Spéculation court/moyen terme**"
    ],
    
    conseils: [
      "Maximum 5% du patrimoine total",
      "Privilégier Bitcoin/Ethereum pour débuter",
      "Sécuriser stockage (hardware wallet)",
      "DCA recommandé (volatilité)"
    ]
  },

  opci: {
    title: "OPCI grand public",
    subtitle: "Organisme Placement Collectif Immobilier",
    category: "Immobilier mixte",
    horizon: "≥ 5 ans",
    riskLevel: "modéré",
    riskColor: "blue",
    
    fiscalite: {
      avant: "PFU 30%",
      apres: "PFU 30%"
    },
    
    plafonds: {
      individuel: "Aucun",
      note: "Minimum immobilier : 60%"
    },
    
    pointsForts: [
      "Diversification immobilier + actions + cash",
      "Liquidité quotidienne (contrairement SCPI)",
      "Gestion professionnelle",
      "Ticket d'entrée faible"
    ],
    
    risquesLimites: [
      "Performance dépendante de la gestion",
      "Frais de gestion",
      "Moins de rendement que SCPI directes",
      "Fiscalité classique (PFU 30%)"
    ],
    
    fiscaliteDetail: [
      "PFU 30% sur plus-values",
      "Dividendes : PFU 30% ou option barème"
    ],
    
    casDusage: [
      "🏢 **Diversification immobilière liquide**",
      "💼 **Alternative SCPI** avec liquidité"
    ],
    
    conseils: [
      "Comparer performance vs SCPI/foncières",
      "Vérifier composition du portefeuille",
      "Surveiller frais de gestion"
    ]
  },

  peac: {
    title: "PEA Avenir Climat",
    subtitle: "Plan d'épargne jeunes ISR",
    category: "Actions ISR jeunes",
    horizon: "≥ 5 ans",
    riskLevel: "modéré",
    riskColor: "green",
    
    fiscalite: {
      avant: "Retrait interdit < 5 ans",
      apres: "Exonération totale IR + PS"
    },
    
    plafonds: {
      individuel: "22 950€",
      note: "Réservé aux moins de 21 ans"
    },
    
    pointsForts: [
      "Exonération totale après 5 ans (IR + PS)",
      "Sensibilisation ISR/climat dès le jeune âge",
      "Plafond correct pour débuter"
    ],
    
    risquesLimites: [
      "Réservé aux moins de 21 ans",
      "Univers d'investissement restreint (ISR)",
      "Retrait impossible avant 5 ans",
      "Fermeture si plus éligible"
    ],
    
    fiscaliteDetail: [
      "Exonération IR + PS si ≥ 18 ans et 5 ans détention",
      "Sinon : perte des avantages"
    ],
    
    casDusage: [
      "👨‍🎓 **Initiation bourse jeunes**",
      "🌍 **Sensibilisation investissement durable**"
    ],
    
    conseils: [
      "Excellent pour sensibiliser les jeunes",
      "Transférer vers PEA classique à 21 ans",
      "Focus sur ETF ISR/climat"
    ]
  }
};

/**
 * 🎨 FONCTION D'AFFICHAGE DE CARTE MODALE
 * Génère et affiche une carte détaillée pour une enveloppe
 */
export function showEnveloppeCard(enveloppeId) {
  const card = enveloppeCards[enveloppeId];
  if (!card) {
    console.warn(`Aucune carte trouvée pour l'enveloppe: ${enveloppeId}`);
    return;
  }

  // Créer la modale
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fadeIn';
  modal.id = 'envelope-modal';
  
  modal.innerHTML = `
    <div class="bg-gradient-to-br from-gray-900 to-blue-900 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="flex justify-between items-start p-6 border-b border-gray-700">
        <div class="flex-1">
          <h2 class="text-2xl font-bold text-green-400 mb-1">${card.title}</h2>
          <p class="text-gray-300 text-lg">${card.subtitle}</p>
          <div class="flex items-center gap-4 mt-3">
            <span class="px-3 py-1 bg-blue-600 bg-opacity-30 text-blue-300 rounded-full text-sm">
              ${card.category}
            </span>
            <span class="px-3 py-1 bg-${card.riskColor}-600 bg-opacity-30 text-${card.riskColor}-300 rounded-full text-sm">
              Risque ${card.riskLevel}
            </span>
          </div>
        </div>
        <button onclick="closeEnveloppeCard()" class="text-gray-400 hover:text-white text-2xl font-bold ml-4">
          ×
        </button>
      </div>

      <!-- Content -->
      <div class="p-6 space-y-6">
        
        <!-- Caractéristiques principales -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg">
            <h4 class="font-semibold text-white mb-2">Horizon</h4>
            <p class="text-green-400 font-medium">${card.horizon}</p>
          </div>
          <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg">
            <h4 class="font-semibold text-white mb-2">Plafond</h4>
            <p class="text-green-400 font-medium">${card.plafonds.individuel}</p>
            ${card.plafonds.note ? `<p class="text-gray-400 text-sm mt-1">${card.plafonds.note}</p>` : ''}
          </div>
        </div>

        <!-- Points forts -->
        <div class="bg-green-900 bg-opacity-20 p-4 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-3 flex items-center">
            <span class="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
            Points forts
          </h4>
          <ul class="space-y-2">
            ${card.pointsForts.map(point => `
              <li class="flex items-start text-gray-300 text-sm">
                <span class="text-green-400 mr-2 mt-0.5">▶</span>
                ${point}
              </li>
            `).join('')}
          </ul>
        </div>

        <!-- Risques et limites -->
        <div class="bg-orange-900 bg-opacity-20 p-4 rounded-lg">
          <h4 class="font-semibold text-orange-400 mb-3 flex items-center">
            <span class="w-2 h-2 bg-orange-400 rounded-full mr-2"></span>
            Risques et limites
          </h4>
          <ul class="space-y-2">
            ${card.risquesLimites.map(risque => `
              <li class="flex items-start text-gray-300 text-sm">
                <span class="text-orange-400 mr-2 mt-0.5">▶</span>
                ${risque}
              </li>
            `).join('')}
          </ul>
        </div>

        <!-- Fiscalité détaillée -->
        <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-3 flex items-center">
            <span class="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
            Fiscalité
          </h4>
          <ul class="space-y-2">
            ${card.fiscaliteDetail.map(detail => `
              <li class="flex items-start text-gray-300 text-sm">
                <span class="text-blue-400 mr-2 mt-0.5">▶</span>
                ${detail}
              </li>
            `).join('')}
          </ul>
        </div>

        <!-- Cas d'usage -->
        <div class="bg-purple-900 bg-opacity-20 p-4 rounded-lg">
          <h4 class="font-semibold text-purple-400 mb-3 flex items-center">
            <span class="w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
            Cas d'usage typiques
          </h4>
          <div class="space-y-2">
            ${card.casDusage.map(cas => `
              <p class="text-gray-300 text-sm">${cas}</p>
            `).join('')}
          </div>
        </div>

        <!-- Conseils -->
        <div class="bg-green-900 bg-opacity-20 p-4 rounded-lg">
          <h4 class="font-semibold text-green-400 mb-3 flex items-center">
            <span class="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
            Conseils d'optimisation
          </h4>
          <ul class="space-y-2">
            ${card.conseils.map(conseil => `
              <li class="flex items-start text-gray-300 text-sm">
                <span class="text-green-400 mr-2 mt-0.5">💡</span>
                ${conseil}
              </li>
            `).join('')}
          </ul>
        </div>

      </div>

      <!-- Footer -->
      <div class="p-6 border-t border-gray-700 bg-gray-800 bg-opacity-30">
        <div class="flex justify-between items-center">
          <p class="text-gray-400 text-sm">
            Cliquez en dehors pour fermer • Échap pour fermer
          </p>
          <button onclick="closeEnveloppeCard()" 
                  class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg transition">
            Fermer
          </button>
        </div>
      </div>
    </div>
  `;

  // Ajouter au DOM
  document.body.appendChild(modal);
  
  // Fermer au clic sur l'overlay
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeEnveloppeCard();
    }
  });
  
  // Fermer avec Escape
  document.addEventListener('keydown', handleEscapeKey);
  
  // Analytics
  trackCardUsage(enveloppeId, 'view');
}

/**
 * 🚪 FERMER LA CARTE MODALE
 */
export function closeEnveloppeCard() {
  const modal = document.getElementById('envelope-modal');
  if (modal) {
    modal.classList.add('animate-fadeOut');
    setTimeout(() => modal.remove(), 300);
    document.removeEventListener('keydown', handleEscapeKey);
  }
}

/**
 * ⌨️ GESTION TOUCHE ESCAPE
 */
function handleEscapeKey(e) {
  if (e.key === 'Escape') {
    closeEnveloppeCard();
  }
}

/**
 * 📊 ANALYTICS POUR TRACKING USAGE
 */
function trackCardUsage(enveloppeId, action = 'view') {
  // Intégration Google Analytics / Matomo si disponible
  if (typeof gtag !== 'undefined') {
    gtag('event', 'envelope_card_interaction', {
      envelope_type: enveloppeId,
      action: action,
      page_location: window.location.href
    });
  }
  
  console.log(`📊 TradePulse Analytics: ${action} card for ${enveloppeId}`);
}

/**
 * 🎯 FONCTION UTILITAIRE POUR OBTENIR UNE CARTE
 */
export function getEnveloppeCard(enveloppeId) {
  return enveloppeCards[enveloppeId] || null;
}

/**
 * 📋 FONCTION POUR LISTER TOUTES LES ENVELOPPES DISPONIBLES
 */
export function getAllEnveloppeIds() {
  return Object.keys(enveloppeCards);
}

/**
 * 🔍 FONCTION DE RECHERCHE DANS LES CARTES
 */
export function searchEnveloppes(query) {
  const results = [];
  const searchTerm = query.toLowerCase();
  
  Object.entries(enveloppeCards).forEach(([id, card]) => {
    const searchableText = [
      card.title,
      card.subtitle,
      card.category,
      ...card.pointsForts,
      ...card.casDusage,
      ...card.conseils
    ].join(' ').toLowerCase();
    
    if (searchableText.includes(searchTerm)) {
      results.push({
        id,
        card,
        relevance: (card.title.toLowerCase().includes(searchTerm) ? 3 : 1) +
                  (card.category.toLowerCase().includes(searchTerm) ? 2 : 0)
      });
    }
  });
  
  return results.sort((a, b) => b.relevance - a.relevance);
}

// Rendre les fonctions accessibles globalement
window.showEnveloppeCard = showEnveloppeCard;
window.closeEnveloppeCard = closeEnveloppeCard;
window.getEnveloppeCard = getEnveloppeCard;
window.searchEnveloppes = searchEnveloppes;

console.log('✅ TradePulse - Système de cartes détaillées initialisé');