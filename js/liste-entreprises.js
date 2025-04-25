/**
 * liste-entreprises.js
 * Base de données des formes juridiques et fonctions associées
 * Dernière mise à jour : Avril 2025
 */

// Liste complète des formes juridiques avec leurs caractéristiques
const formesJuridiques = [
    {
        id: "micro-entreprise", 
        nom: "Micro-entreprise",
        description: "Statut simplifié pour entrepreneur individuel avec un régime fiscal et social avantageux sous certains plafonds de chiffre d'affaires.",
        categorie: "Entreprise Individuelle",
        creation: {
            demarches: "Simples",
            delai: "Rapide (< 1 semaine)",
            cout: "Gratuit à 100€"
        },
        fonctionnement: {
            comptabilite: "Simplifiée",
            formalisme: "Minimal",
            flexibilite: "Limitée"
        },
        fiscalite: "IR",
        fiscaliteOption: "Non",
        regimeSocial: "TNS",
        responsabilite: "Illimitée",
        credit: "Faible",
        transmission: "Difficile",
        evolutivite: "Faible",
        protectionPatrimoine: "Non",
        protectionSociale: "Minimale",
        remuneration: "Pas de salaire (BIC/BNC)",
        leveeFonds: "Non",
        avantages: [
            "Créer rapidement et simplement",
            "Pas de capital minimum",
            "Comptabilité simplifiée",
            "Charges sociales sur encaissements",
            "Prélèvement libératoire IR avantageux"
        ],
        inconvenients: [
            "Plafond de chiffre d'affaires",
            "Pas de récupération de TVA",
            "Crédibilité limitée auprès des tiers",
            "Responsabilité sur patrimoine personnel",
            "Protection sociale minimale"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["standard"],
        compatibleEsus: false,
        compatibleMission: false,
        compatibleHolding: false,
        compatibleMultiEtablissements: false,
        compatibleDecennale: false,
        compatibleApportPI: false,
        acreEligible: true,
        protectionMatrimoniale: "Aucune"
    },
    {
        id: "ei", 
        nom: "Entreprise Individuelle",
        description: "Forme juridique sans création de personne morale, où le dirigeant et l'entreprise ne font qu'un sur le plan juridique.",
        categorie: "Entreprise Individuelle",
        creation: {
            demarches: "Simples",
            delai: "Rapide (< 1 semaine)",
            cout: "100 à 250€"
        },
        fonctionnement: {
            comptabilite: "Standard",
            formalisme: "Faible",
            flexibilite: "Moyenne"
        },
        fiscalite: "IR",
        fiscaliteOption: "Non",
        regimeSocial: "TNS",
        responsabilite: "Illimitée avec séparation patrimoine depuis 2022",
        credit: "Moyen",
        transmission: "Difficile",
        evolutivite: "Faible",
        protectionPatrimoine: "Partielle",
        protectionSociale: "Standard TNS",
        remuneration: "Pas de salaire (BIC/BNC)",
        leveeFonds: "Non",
        avantages: [
            "Créer rapidement et simplement",
            "Pas de capital minimum",
            "Déduction des charges réelles",
            "Simplicité de gestion",
            "Protection patrimoine améliorée (2022)"
        ],
        inconvenients: [
            "Crédibilité limitée auprès des partenaires",
            "Responsabilité partiellement limitée",
            "Régime social TNS parfois coûteux",
            "Difficulté à céder ou transmettre",
            "Imposition à l'IR uniquement"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["standard"],
        compatibleEsus: false,
        compatibleMission: false,
        compatibleHolding: false,
        compatibleMultiEtablissements: false,
        compatibleDecennale: false,
        compatibleApportPI: false,
        acreEligible: true,
        protectionMatrimoniale: "Faible"
    },
    {
        id: "eurl", 
        nom: "EURL",
        description: "SARL à associé unique, permettant une responsabilité limitée aux apports tout en gardant une structure simplifiée.",
        categorie: "Société unipersonnelle",
        creation: {
            demarches: "Standard",
            delai: "Moyen (1-2 semaines)",
            cout: "1000 à 2000€"
        },
        fonctionnement: {
            comptabilite: "Complète",
            formalisme: "Moyen",
            flexibilite: "Moyenne"
        },
        fiscalite: "IR",
        fiscaliteOption: "Oui (IS)",
        regimeSocial: "TNS",
        responsabilite: "Limitée aux apports",
        credit: "Bon",
        transmission: "Moyenne",
        evolutivite: "Moyenne",
        protectionPatrimoine: "Oui",
        protectionSociale: "Standard TNS",
        remuneration: "Rémunération gérant et/ou dividendes",
        leveeFonds: "Limité",
        avantages: [
            "Responsabilité limitée au capital social",
            "Capital minimum de 1€ symbolique",
            "Choix du régime fiscal (IR ou IS)",
            "Optimisation salaire/dividendes possible",
            "Crédibilité auprès des partenaires"
        ],
        inconvenients: [
            "Formalisme juridique et comptable",
            "Coûts de constitution et de fonctionnement",
            "Régime social TNS parfois coûteux",
            "Transformation en SAS complexe",
            "Rigidité relative de gouvernance"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["zfu", "zrr", "outre-mer"],
        compatibleEsus: false,
        compatibleMission: false,
        compatibleHolding: false,
        compatibleMultiEtablissements: true,
        compatibleDecennale: true,
        compatibleApportPI: false,
        acreEligible: true,
        protectionMatrimoniale: "Bonne"
    },
    {
        id: "sasu", 
        nom: "SASU",
        description: "SAS à associé unique, alliant responsabilité limitée et grande flexibilité statutaire pour un entrepreneur solo.",
        categorie: "Société unipersonnelle",
        creation: {
            demarches: "Standard",
            delai: "Moyen (1-2 semaines)",
            cout: "1500 à 3000€"
        },
        fonctionnement: {
            comptabilite: "Complète",
            formalisme: "Moyen à élevé",
            flexibilite: "Élevée"
        },
        fiscalite: "IS",
        fiscaliteOption: "Non",
        regimeSocial: "Assimilé salarié",
        responsabilite: "Limitée aux apports",
        credit: "Très bon",
        transmission: "Élevée",
        evolutivite: "Très élevée",
        protectionPatrimoine: "Oui",
        protectionSociale: "Régime général (élevée)",
        remuneration: "Salaire président et/ou dividendes",
        leveeFonds: "Oui",
        avantages: [
            "Responsabilité limitée au capital social",
            "Capital minimum de 1€ symbolique",
            "Grande liberté statutaire",
            "Régime social assimilé salarié",
            "Optimisation salaire/dividendes possible"
        ],
        inconvenients: [
            "Formalisme juridique et comptable important",
            "Coûts de constitution et de fonctionnement",
            "Charges sociales élevées sur rémunération",
            "Imposition IS obligatoire",
            "Double imposition des dividendes"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["zfu", "zrr", "outre-mer"],
        compatibleEsus: false,
        compatibleMission: true,
        compatibleHolding: true,
        compatibleMultiEtablissements: true,
        compatibleDecennale: true,
        compatibleApportPI: true,
        acreEligible: false,
        protectionMatrimoniale: "Excellente"
    },
    {
        id: "sarl", 
        nom: "SARL",
        description: "Société à responsabilité limitée adaptée aux petites et moyennes structures avec plusieurs associés.",
        categorie: "Société pluripersonnelle",
        creation: {
            demarches: "Standard",
            delai: "Moyen (1-2 semaines)",
            cout: "1500 à 3000€"
        },
        fonctionnement: {
            comptabilite: "Complète",
            formalisme: "Moyen à élevé",
            flexibilite: "Moyenne"
        },
        fiscalite: "IS",
        fiscaliteOption: "Oui (IR si conditions)",
        regimeSocial: "TNS (gérant maj.) / Assimilé salarié (gérant min.)",
        responsabilite: "Limitée aux apports",
        credit: "Bon",
        transmission: "Bonne",
        evolutivite: "Moyenne",
        protectionPatrimoine: "Oui",
        protectionSociale: "Variable selon statut du dirigeant",
        remuneration: "Rémunération gérant et/ou dividendes",
        leveeFonds: "Moyen",
        avantages: [
            "Responsabilité limitée au capital social",
            "Capital minimum de 1€ symbolique",
            "Structure adaptée à plusieurs associés",
            "Stabilité et reconnaissance des tiers",
            "Possible option IR sous conditions"
        ],
        inconvenients: [
            "Formalisme juridique et comptable important",
            "Coûts de constitution et de fonctionnement",
            "Rigidité relative de gouvernance",
            "Cession de parts sociales encadrée",
            "Régime social variable selon majorité"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["zfu", "zrr", "outre-mer"],
        compatibleEsus: false,
        compatibleMission: true,
        compatibleHolding: true,
        compatibleMultiEtablissements: true,
        compatibleDecennale: true,
        compatibleApportPI: true,
        acreEligible: true,
        protectionMatrimoniale: "Excellente"
    },
    {
        id: "sas", 
        nom: "SAS",
        description: "Société par actions simplifiée offrant une grande liberté statutaire et adaptée à tous types de projets.",
        categorie: "Société pluripersonnelle",
        creation: {
            demarches: "Standard à complexes",
            delai: "Moyen (1-3 semaines)",
            cout: "2000 à 5000€"
        },
        fonctionnement: {
            comptabilite: "Complète",
            formalisme: "Élevé",
            flexibilite: "Très élevée"
        },
        fiscalite: "IS",
        fiscaliteOption: "Non",
        regimeSocial: "Assimilé salarié",
        responsabilite: "Limitée aux apports",
        credit: "Excellent",
        transmission: "Très élevée",
        evolutivite: "Très élevée",
        protectionPatrimoine: "Oui",
        protectionSociale: "Régime général (élevée)",
        remuneration: "Salaire président et/ou dividendes",
        leveeFonds: "Oui",
        avantages: [
            "Responsabilité limitée au capital social",
            "Grande liberté statutaire et de gouvernance",
            "Structure adaptée à la levée de fonds",
            "Entrée/sortie d'associés facilitée",
            "Crédibilité maximale auprès des tiers"
        ],
        inconvenients: [
            "Formalisme juridique et comptable important",
            "Coûts de constitution et de fonctionnement élevés",
            "Charges sociales élevées sur rémunération",
            "Imposition IS obligatoire",
            "Double imposition des dividendes"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["zfu", "zrr", "outre-mer"],
        compatibleEsus: true,
        compatibleMission: true,
        compatibleHolding: true,
        compatibleMultiEtablissements: true,
        compatibleDecennale: true,
        compatibleApportPI: true,
        acreEligible: false,
        protectionMatrimoniale: "Excellente"
    },
    {
        id: "sa", 
        nom: "SA",
        description: "Société anonyme, forme juridique des grandes entreprises avec distinction entre actionnaires et dirigeants.",
        categorie: "Société pluripersonnelle",
        creation: {
            demarches: "Complexes",
            delai: "Long (3-4 semaines)",
            cout: "5000 à 10000€"
        },
        fonctionnement: {
            comptabilite: "Très complète",
            formalisme: "Très élevé",
            flexibilite: "Moyenne"
        },
        fiscalite: "IS",
        fiscaliteOption: "Non",
        regimeSocial: "Assimilé salarié",
        responsabilite: "Limitée aux apports",
        credit: "Excellent",
        transmission: "Élevée",
        evolutivite: "Élevée",
        protectionPatrimoine: "Oui",
        protectionSociale: "Régime général (élevée)",
        remuneration: "Salaire dirigeant et/ou dividendes",
        leveeFonds: "Oui",
        avantages: [
            "Structure prestigieuse et reconnue",
            "Possibilité d'introduction en bourse",
            "Gouvernance équilibrée avec conseil d'administration",
            "Idéale pour les projets d'envergure",
            "Anonymat des actionnaires possible"
        ],
        inconvenients: [
            "Capital minimum de 37 000€",
            "Formalisme juridique et comptable très lourd",
            "Coûts de constitution et de fonctionnement très élevés",
            "Minimum 2 actionnaires et 3 administrateurs",
            "Procédures de décision plus lourdes"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["zfu", "zrr", "outre-mer"],
        compatibleEsus: false,
        compatibleMission: true,
        compatibleHolding: true,
        compatibleMultiEtablissements: true,
        compatibleDecennale: true,
        compatibleApportPI: true,
        acreEligible: false,
        protectionMatrimoniale: "Excellente"
    },
    {
        id: "sci", 
        nom: "SCI",
        description: "Société civile immobilière dédiée à la gestion d'un patrimoine immobilier.",
        categorie: "Société civile",
        creation: {
            demarches: "Standard",
            delai: "Moyen (2-3 semaines)",
            cout: "1500 à 2500€"
        },
        fonctionnement: {
            comptabilite: "Standard",
            formalisme: "Moyen",
            flexibilite: "Moyenne"
        },
        fiscalite: "IR (IS option)",
        fiscaliteOption: "Oui",
        regimeSocial: "TNS ou assimilé salarié",
        responsabilite: "Indéfinie",
        credit: "Bon",
        transmission: "Bonne",
        evolutivite: "Moyenne",
        protectionPatrimoine: "Non",
        protectionSociale: "Selon statut",
        remuneration: "Non concerné",
        leveeFonds: "Non",
        avantages: [
            "Transmission et gestion patrimoniale facilitées",
            "Souplesse dans les apports",
            "Protection contre l'indivision",
            "Optimisation fiscale possible",
            "Détention à plusieurs d'un patrimoine commun"
        ],
        inconvenients: [
            "Responsabilité indéfinie des associés",
            "Formalisme juridique et comptable",
            "Frais de constitution et de gestion",
            "Pas adaptée aux activités commerciales",
            "Risques de requalification fiscale"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["standard"],
        compatibleEsus: false,
        compatibleMission: false,
        compatibleHolding: false,
        compatibleMultiEtablissements: false,
        compatibleDecennale: false,
        compatibleApportPI: false,
        acreEligible: false,
        protectionMatrimoniale: "Moyenne"
    },
    {
        id: "scp", 
        nom: "SCP",
        description: "Société civile professionnelle permettant à des professionnels libéraux réglementés d'exercer en commun.",
        categorie: "Société civile / Libérale",
        creation: {
            demarches: "Complexes",
            delai: "Moyen (2-3 semaines)",
            cout: "2000 à 4000€"
        },
        fonctionnement: {
            comptabilite: "Complète",
            formalisme: "Moyen à élevé",
            flexibilite: "Moyenne"
        },
        fiscalite: "IR",
        fiscaliteOption: "Oui (IS)",
        regimeSocial: "TNS",
        responsabilite: "Indéfinie et solidaire",
        credit: "Moyen",
        transmission: "Encadrée",
        evolutivite: "Moyenne",
        protectionPatrimoine: "Non",
        protectionSociale: "Standard TNS",
        remuneration: "Répartition des bénéfices",
        leveeFonds: "Non",
        avantages: [
            "Adaptée aux professions libérales réglementées",
            "Mise en commun des moyens",
            "Continuité en cas de cessation d'un associé",
            "Structure reconnue dans le monde libéral",
            "Partage de la clientèle"
        ],
        inconvenients: [
            "Réservée aux professions réglementées",
            "Responsabilité illimitée",
            "Cession de parts encadrée",
            "Formalisme spécifique à chaque profession",
            "Gouvernance parfois rigide"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["standard"],
        compatibleEsus: false,
        compatibleMission: false,
        compatibleHolding: false,
        compatibleMultiEtablissements: true,
        compatibleDecennale: true,
        compatibleApportPI: false,
        acreEligible: true,
        protectionMatrimoniale: "Faible"
    },
    {
        id: "scm", 
        nom: "SCM",
        description: "Société civile de moyens permettant à des professionnels de mettre en commun leurs moyens matériels d'exercice.",
        categorie: "Société civile / Libérale",
        creation: {
            demarches: "Standard",
            delai: "Moyen (1-2 semaines)",
            cout: "1500 à 3000€"
        },
        fonctionnement: {
            comptabilite: "Standard",
            formalisme: "Moyen",
            flexibilite: "Moyenne"
        },
        fiscalite: "Transparente (associés)",
        fiscaliteOption: "Non",
        regimeSocial: "N/A (non exploitante)",
        responsabilite: "Indéfinie et conjointe",
        credit: "Moyen",
        transmission: "Moyenne",
        evolutivite: "Moyenne",
        protectionPatrimoine: "Non",
        protectionSociale: "N/A",
        remuneration: "Refacturation aux associés",
        leveeFonds: "Non",
        avantages: [
            "Mise en commun des moyens sans exercice en commun",
            "Réduction des coûts d'exploitation",
            "Comptabilité allégée",
            "Structure reconnue par tous les ordres professionnels",
            "Souplesse contractuelle"
        ],
        inconvenients: [
            "Non exploitante (pas de clientèle propre)",
            "Responsabilité conjointe des associés",
            "Partage des coûts uniquement (pas des honoraires)",
            "Statut fiscal peu optimisé",
            "Mécanisme de refacturation aux associés"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["standard"],
        compatibleEsus: false,
        compatibleMission: false,
        compatibleHolding: false,
        compatibleMultiEtablissements: false,
        compatibleDecennale: false,
        compatibleApportPI: false,
        acreEligible: false,
        protectionMatrimoniale: "Faible"
    },
    {
        id: "selarl", 
        nom: "SELARL",
        description: "SARL d'exercice libéral permettant aux professionnels libéraux réglementés d'exercer avec responsabilité limitée.",
        categorie: "Société d'exercice libéral",
        creation: {
            demarches: "Complexes",
            delai: "Long (3-4 semaines)",
            cout: "3000 à 5000€"
        },
        fonctionnement: {
            comptabilite: "Complète",
            formalisme: "Élevé",
            flexibilite: "Moyenne"
        },
        fiscalite: "IS",
        fiscaliteOption: "Oui (IR sous conditions)",
        regimeSocial: "TNS",
        responsabilite: "Limitée aux apports",
        credit: "Bon",
        transmission: "Bonne mais encadrée",
        evolutivite: "Moyenne",
        protectionPatrimoine: "Oui",
        protectionSociale: "Standard TNS",
        remuneration: "Rémunération gérant et/ou dividendes",
        leveeFonds: "Limité",
        avantages: [
            "Responsabilité limitée aux apports",
            "Structure adaptée aux professions réglementées",
            "Protection du patrimoine personnel",
            "Possibilité d'association entre professionnels",
            "Transmission progressive possible"
        ],
        inconvenients: [
            "Réservée aux professions réglementées",
            "Approbation de l'ordre professionnel requise",
            "Formalisme juridique et comptable important",
            "Coûts de constitution et de fonctionnement élevés",
            "Contraintes sur répartition du capital"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["zfu", "zrr", "outre-mer"],
        compatibleEsus: false,
        compatibleMission: false,
        compatibleHolding: false,
        compatibleMultiEtablissements: true,
        compatibleDecennale: true,
        compatibleApportPI: true,
        acreEligible: true,
        protectionMatrimoniale: "Excellente"
    },
    {
        id: "selas", 
        nom: "SELAS",
        description: "SAS d'exercice libéral combinant responsabilité limitée et flexibilité statutaire pour les professions réglementées.",
        categorie: "Société d'exercice libéral",
        creation: {
            demarches: "Complexes",
            delai: "Long (3-4 semaines)",
            cout: "3000 à 6000€"
        },
        fonctionnement: {
            comptabilite: "Complète",
            formalisme: "Élevé",
            flexibilite: "Élevée"
        },
        fiscalite: "IS",
        fiscaliteOption: "Non",
        regimeSocial: "Assimilé salarié",
        responsabilite: "Limitée aux apports",
        credit: "Très bon",
        transmission: "Élevée mais encadrée",
        evolutivite: "Élevée",
        protectionPatrimoine: "Oui",
        protectionSociale: "Régime général (élevée)",
        remuneration: "Salaire président et/ou dividendes",
        leveeFonds: "Oui avec restrictions",
        avantages: [
            "Responsabilité limitée aux apports",
            "Grande liberté statutaire pour une profession réglementée",
            "Protection optimale du patrimoine personnel",
            "Régime social avantageux (assimilé salarié)",
            "Gouvernance flexible"
        ],
        inconvenients: [
            "Réservée aux professions réglementées",
            "Approbation de l'ordre professionnel requise",
            "Formalisme juridique et comptable très important",
            "Coûts de constitution et de fonctionnement élevés",
            "Contraintes sur répartition du capital"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["zfu", "zrr", "outre-mer"],
        compatibleEsus: false,
        compatibleMission: true,
        compatibleHolding: false,
        compatibleMultiEtablissements: true,
        compatibleDecennale: true,
        compatibleApportPI: true,
        acreEligible: false,
        protectionMatrimoniale: "Excellente"
    },
    {
        id: "scop", 
        nom: "SCOP",
        description: "Société coopérative et participative où les salariés sont associés majoritaires et le pouvoir est exercé démocratiquement.",
        categorie: "Société coopérative",
        creation: {
            demarches: "Complexes",
            delai: "Long (3-4 semaines)",
            cout: "2000 à 4000€"
        },
        fonctionnement: {
            comptabilite: "Complète",
            formalisme: "Élevé",
            flexibilite: "Limitée par les principes coopératifs"
        },
        fiscalite: "IS avec spécificités",
        fiscaliteOption: "Non",
        regimeSocial: "Général (salariés)",
        responsabilite: "Limitée aux apports",
        credit: "Bon (aides spécifiques)",
        transmission: "Particulière (impartageabilité)",
        evolutivite: "Moyenne",
        protectionPatrimoine: "Oui",
        protectionSociale: "Régime général (élevée)",
        remuneration: "Salaire et participation obligatoire",
        leveeFonds: "Limité (contraintes sur capital)",
        avantages: [
            "Gouvernance démocratique et participative",
            "Avantages fiscaux spécifiques (IS réduit)",
            "Aides et subventions dédiées",
            "Réserves impartageables (pérennité)",
            "Engagement sociétal et valorisation RSE"
        ],
        inconvenients: [
            "Salariés doivent être majoritaires au capital",
            "Limitations sur rémunération du capital",
            "Réserves obligatoires importantes",
            "Impartageabilité des réserves",
            "Gouvernance contraignante (1 personne = 1 voix)"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["standard", "zfu", "zrr", "outre-mer"],
        compatibleEsus: true,
        compatibleMission: true,
        compatibleHolding: false,
        compatibleMultiEtablissements: true,
        compatibleDecennale: true,
        compatibleApportPI: false,
        acreEligible: false,
        protectionMatrimoniale: "Excellente"
    },
    {
        id: "scic", 
        nom: "SCIC",
        description: "Société coopérative d'intérêt collectif permettant d'associer autour d'un projet des acteurs multiples.",
        categorie: "Société coopérative",
        creation: {
            demarches: "Complexes",
            delai: "Long (3-4 semaines)",
            cout: "2000 à 4000€"
        },
        fonctionnement: {
            comptabilite: "Complète",
            formalisme: "Élevé",
            flexibilite: "Limitée par les principes coopératifs"
        },
        fiscalite: "IS avec spécificités",
        fiscaliteOption: "Non",
        regimeSocial: "Général (salariés)",
        responsabilite: "Limitée aux apports",
        credit: "Bon (aides spécifiques)",
        transmission: "Particulière (impartageabilité)",
        evolutivite: "Moyenne",
        protectionPatrimoine: "Oui",
        protectionSociale: "Régime général (élevée)",
        remuneration: "Salaire et dividendes limités",
        leveeFonds: "Possible mais encadré",
        avantages: [
            "Multi-sociétariat (salariés, usagers, collectivités...)",
            "Utilité sociale reconnue",
            "Éligibilité aux marchés publics réservés",
            "Aides et subventions dédiées",
            "Eligible aux titres associatifs"
        ],
        inconvenients: [
            "Minimum 3 catégories d'associés",
            "Mise en réserve obligatoire (57,5% des bénéfices)",
            "Agrément préfectoral à renouveler",
            "Gouvernance complexe",
            "Rémunération limitée du capital"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["standard", "zfu", "zrr", "outre-mer"],
        compatibleEsus: true,
        compatibleMission: true,
        compatibleHolding: false,
        compatibleMultiEtablissements: true,
        compatibleDecennale: true,
        compatibleApportPI: false,
        acreEligible: false,
        protectionMatrimoniale: "Excellente"
    },
    {
        id: "sel", 
        nom: "SEL",
        description: "Société d'exercice libéral, structure générique pour les professions libérales réglementées.",
        categorie: "Société d'exercice libéral",
        creation: {
            demarches: "Complexes",
            delai: "Long (3-4 semaines)",
            cout: "3000 à 5000€"
        },
        fonctionnement: {
            comptabilite: "Complète",
            formalisme: "Élevé",
            flexibilite: "Moyenne"
        },
        fiscalite: "IS",
        fiscaliteOption: "Oui (IR sous conditions)",
        regimeSocial: "TNS ou Assimilé salarié selon forme",
        responsabilite: "Limitée aux apports",
        credit: "Bon",
        transmission: "Bonne mais encadrée",
        evolutivite: "Moyenne",
        protectionPatrimoine: "Oui",
        protectionSociale: "Variable selon statut",
        remuneration: "Selon forme juridique",
        leveeFonds: "Limité",
        avantages: [
            "Responsabilité limitée aux apports",
            "Structure dédiée aux professions réglementées",
            "Protection du patrimoine personnel",
            "Possibilité d'association entre professionnels",
            "Optimisation sociale et fiscale possible"
        ],
        inconvenients: [
            "Réservée aux professions réglementées",
            "Approbation de l'ordre professionnel requise",
            "Formalisme juridique et comptable important",
            "Coûts de constitution et de fonctionnement élevés",
            "Contraintes sur répartition du capital"
        ],
        // Nouveaux champs pour les critères spécifiques
        zonesAvantageuses: ["zfu", "zrr", "outre-mer"],
        compatibleEsus: false,
        compatibleMission: false,
        compatibleHolding: false,
        compatibleMultiEtablissements: true,
        compatibleDecennale: true,
        compatibleApportPI: true,
        acreEligible: false,
        protectionMatrimoniale: "Excellente"
    }
];

/**
 * Recherche une forme juridique par son identifiant
 * @param {string} id - Identifiant de la forme juridique
 * @return {Object} Forme juridique ou null si non trouvée
 */
function getFormeById(id) {
    return formesJuridiques.find(forme => forme.id === id) || null;
}

/**
 * Filtre les formes juridiques selon des critères spécifiques
 * @param {Object} criteres - Critères de filtrage
 * @return {Array} Formes juridiques filtrées
 */
function filtrerFormesJuridiques(criteres = {}) {
    return formesJuridiques.filter(forme => {
        // Filtrage par catégorie
        if (criteres.categorie && forme.categorie !== criteres.categorie) {
            return false;
        }
        
        // Filtrage par régime fiscal
        if (criteres.fiscalite && !forme.fiscalite.includes(criteres.fiscalite)) {
            return false;
        }
        
        // Filtrage par régime social
        if (criteres.regimeSocial && !forme.regimeSocial.includes(criteres.regimeSocial)) {
            return false;
        }
        
        // Filtrage par responsabilité
        if (criteres.responsabilite === 'limitee' && !forme.responsabilite.includes('limitée')) {
            return false;
        }
        
        // Filtrage par protection patrimoniale
        if (criteres.protectionPatrimoine && forme.protectionPatrimoine === 'Non') {
            return false;
        }
        
        // Nouveaux critères ajoutés suite aux modifications
        
        // Filtrage par zone d'implantation avantageuse
        if (criteres.zoneImplantation && !forme.zonesAvantageuses.includes(criteres.zoneImplantation)) {
            return false;
        }
        
        // Filtrage par éligibilité ESUS
        if (criteres.statutEsus && !forme.compatibleEsus) {
            return false;
        }
        
        // Filtrage par entreprise à mission
        if (criteres.entrepriseMission && !forme.compatibleMission) {
            return false;
        }
        
        // Filtrage par compatibilité holding
        if (criteres.structureHolding && !forme.compatibleHolding) {
            return false;
        }
        
        // Filtrage par multi-établissements
        if (criteres.multiEtablissements && !forme.compatibleMultiEtablissements) {
            return false;
        }
        
        // Filtrage par garantie décennale
        if (criteres.garantieDecennale && !forme.compatibleDecennale) {
            return false;
        }
        
        // Filtrage par apport PI
        if (criteres.apportBrevet && !forme.compatibleApportPI) {
            return false;
        }
        
        // Filtrage par éligibilité ACRE
        if (criteres.demandeAcre && !forme.acreEligible) {
            return false;
        }
        
        // Si tous les filtres sont passés, conserver cette forme
        return true;
    });
}

/**
 * Obtient des formes juridiques similaires à une forme donnée
 * @param {string} formeId - Identifiant de la forme juridique de référence
 * @param {number} nombre - Nombre de formes similaires à retourner
 * @return {Array} Formes juridiques similaires
 */
function getFormesSimilaires(formeId, nombre = 3) {
    const formeReference = getFormeById(formeId);
    
    if (!formeReference) return [];
    
    // Calculer un score de similarité pour chaque forme
    const formesAvecScore = formesJuridiques
        .filter(forme => forme.id !== formeId) // Exclure la forme de référence
        .map(forme => {
            let score = 0;
            
            // Similarité de catégorie
            if (forme.categorie === formeReference.categorie) score += 3;
            
            // Similarité de fiscalité
            if (forme.fiscalite === formeReference.fiscalite) score += 2;
            
            // Similarité de régime social
            if (forme.regimeSocial === formeReference.regimeSocial) score += 2;
            
            // Similarité de responsabilité
            if (forme.responsabilite.includes('limitée') === formeReference.responsabilite.includes('limitée')) score += 2;
            
            // Nouveaux critères de similarité
            
            // Similarité de compatibilité ESUS
            if (forme.compatibleEsus === formeReference.compatibleEsus) score += 1;
            
            // Similarité de compatibilité mission
            if (forme.compatibleMission === formeReference.compatibleMission) score += 1;
            
            // Similarité de compatibilité multi-établissements
            if (forme.compatibleMultiEtablissements === formeReference.compatibleMultiEtablissements) score += 1;
            
            // Similarité de protection matrimoniale
            if (forme.protectionMatrimoniale === formeReference.protectionMatrimoniale) score += 1;
            
            return { forme, score };
        });
    
    // Trier par score décroissant et retourner les N premiers
    return formesAvecScore
        .sort((a, b) => b.score - a.score)
        .slice(0, nombre)
        .map(item => item.forme);
}

/**
 * Génère une comparaison détaillée entre deux formes juridiques
 * @param {string} formeId1 - Identifiant de la première forme
 * @param {string} formeId2 - Identifiant de la seconde forme
 * @return {Object} Comparaison détaillée
 */
function comparerFormesJuridiques(formeId1, formeId2) {
    const forme1 = getFormeById(formeId1);
    const forme2 = getFormeById(formeId2);
    
    if (!forme1 || !forme2) return null;
    
    const criteres = [
        { nom: "Responsabilité", f1: forme1.responsabilite, f2: forme2.responsabilite },
        { nom: "Fiscalité", f1: forme1.fiscalite, f2: forme2.fiscalite },
        { nom: "Régime social", f1: forme1.regimeSocial, f2: forme2.regimeSocial },
        { nom: "Protection patrimoniale", f1: forme1.protectionPatrimoine, f2: forme2.protectionPatrimoine },
        { nom: "Formalisme", f1: forme1.fonctionnement.formalisme, f2: forme2.fonctionnement.formalisme },
        { nom: "Coût de création", f1: forme1.creation.cout, f2: forme2.creation.cout },
        { nom: "Délai de création", f1: forme1.creation.delai, f2: forme2.creation.delai },
        { nom: "Crédibilité / Financement", f1: forme1.credit, f2: forme2.credit },
        { nom: "Évolutivité", f1: forme1.evolutivite, f2: forme2.evolutivite },
        { nom: "Transmission", f1: forme1.transmission, f2: forme2.transmission },
        // Nouveaux critères de comparaison
        { nom: "Avantages ZFU/ZRR", f1: forme1.zonesAvantageuses.includes("zfu") ? "Oui" : "Non", f2: forme2.zonesAvantageuses.includes("zfu") ? "Oui" : "Non" },
        { nom: "Compatible ESUS", f1: forme1.compatibleEsus ? "Oui" : "Non", f2: forme2.compatibleEsus ? "Oui" : "Non" },
        { nom: "Entreprise à mission", f1: forme1.compatibleMission ? "Oui" : "Non", f2: forme2.compatibleMission ? "Oui" : "Non" },
        { nom: "Structure holding", f1: forme1.compatibleHolding ? "Oui" : "Non", f2: forme2.compatibleHolding ? "Oui" : "Non" },
        { nom: "Multi-établissements", f1: forme1.compatibleMultiEtablissements ? "Oui" : "Non", f2: forme2.compatibleMultiEtablissements ? "Oui" : "Non" },
        { nom: "Garantie décennale", f1: forme1.compatibleDecennale ? "Oui" : "Non", f2: forme2.compatibleDecennale ? "Oui" : "Non" },
        { nom: "Protection matrimoniale", f1: forme1.protectionMatrimoniale, f2: forme2.protectionMatrimoniale }
    ];
    
    // Avantages/inconvénients uniques pour chaque forme
    const avantagesUniques1 = forme1.avantages.filter(avt => !forme2.avantages.includes(avt));
    const avantagesUniques2 = forme2.avantages.filter(avt => !forme1.avantages.includes(avt));
    const inconvenientsUniques1 = forme1.inconvenients.filter(inc => !forme2.inconvenients.includes(inc));
    const inconvenientsUniques2 = forme2.inconvenients.filter(inc => !forme1.inconvenients.includes(inc));
    
    return {
        forme1: {
            id: forme1.id,
            nom: forme1.nom,
            description: forme1.description
        },
        forme2: {
            id: forme2.id,
            nom: forme2.nom,
            description: forme2.description
        },
        criteres: criteres,
        avantagesUniques: {
            forme1: avantagesUniques1,
            forme2: avantagesUniques2
        },
        inconvenientsUniques: {
            forme1: inconvenientsUniques1,
            forme2: inconvenientsUniques2
        }
    };
}

/**
 * Obtient les formes juridiques recommandées en fonction d'un profil utilisateur
 * Utilise le moteur de scoring amélioré avec les nouveaux critères
 * @param {Object} profil - Profil utilisateur avec préférences
 * @return {Array} Formes juridiques recommandées avec leur score
 */
function getFormesRecommandees(profil) {
    const fails = checkHardFails(profil);
    const scoreResult = SimulationsFiscales.calculerStructureOptimale(profil);
    
    const formesAvecScore = formesJuridiques.map(forme => {
        // Vérifier les incompatibilités majeures
        if (hasHardFail(forme.id, fails)) {
            return { forme, score: 0, incompatible: true, raison: fails.find(f => f.formeId === forme.id)?.message };
        }
        
        // Obtenir le score depuis le résultat du moteur de scoring
        let score = 0;
        switch(forme.id) {
            case 'micro-entreprise':
                score = scoreResult.scores.micro;
                break;
            case 'ei':
                score = scoreResult.scores.ei;
                break;
            case 'eurl':
                score = profil.isOption ? scoreResult.scores.eurlIS : scoreResult.scores.eurl;
                break;
            case 'sasu':
                score = scoreResult.scores.sasu;
                // Nouveaux bonus pour SASU avec les nouvelles options
                if (profil.protectionSociale === 'retraite') score += 10;
                if (profil.preferenceDividendes === 'pfu' && profil.tmiActuel >= 30) score += 10;
                break;
            case 'sas':
                score = scoreResult.scores.sas;
                break;
            case 'sarl':
                score = scoreResult.scores.sarl;
                break;
            case 'scop':
                score = scoreResult.scores.scop;
                break;
            case 'scic':
                score = scoreResult.scores.scic;
                break;
            default:
                // Pour les autres formes, calculer un score basé sur les critères spécifiques
                score = 50; // Score de base
                
                // Ajuster le score en fonction des nouveaux critères
                if (profil.structureHolding && forme.compatibleHolding) score += 10;
                if (profil.entrepriseMission && forme.compatibleMission) score += 10;
                if (profil.statutEsus && forme.compatibleEsus) score += 15;
                if (profil.multiEtablissements && forme.compatibleMultiEtablissements) score += 10;
                if (profil.garantieDecennale && forme.compatibleDecennale) score += 15;
                if (profil.rcpObligatoire && forme.compatibleDecennale) score += 10;
                if (profil.estMarie && profil.regimeMatrimonial === 'communaute-reduite' && 
                    ['Bonne', 'Excellente'].includes(forme.protectionMatrimoniale)) score += 10;
                
                if (profil.zoneImplantation && forme.zonesAvantageuses.includes(profil.zoneImplantation)) {
                    if (forme.fiscalite === 'IS' || forme.fiscaliteOption === 'Oui') {
                        score += 15;
                    }
                }
        }
        
        return { forme, score, incompatible: false };
    });
    
    // Trier par score décroissant
    return formesAvecScore.sort((a, b) => b.score - a.score);
}

/**
 * Génère un guide PDF personnalisé pour l'utilisateur
 * @param {Object} userResponses - Réponses de l'utilisateur
 * @param {Array} formesRecommandees - Formes juridiques recommandées
 * @return {string} URL du fichier PDF généré
 */
function genererGuidePDF(userResponses, formesRecommandees) {
    // Cette fonction est un placeholder pour une future implémentation
    // Elle pourrait utiliser une bibliothèque comme jsPDF côté client
    // ou appeler une API pour générer le PDF côté serveur
    
    console.log("Génération d'un guide PDF personnalisé...");
    console.log("Données utilisateur:", userResponses);
    console.log("Formes recommandées:", formesRecommandees.map(f => f.forme.nom));
    
    return "guide-personnalise.pdf";
}

/**
 * Vérifie les incompatibilités majeures qui empêcheraient certaines formes juridiques
 * Utilise le moteur de règles BusinessRules
 * @param {Object} userResponses - Réponses de l'utilisateur au questionnaire
 * @return {Array} Liste des incompatibilités détectées
 */
function checkHardFails(userResponses) {
    if (typeof BusinessRules === 'undefined') {
        console.warn('BusinessRules n\'est pas défini. Vérifiez que fiscal-simulation.js est chargé avant liste-entreprises.js');
        return [];
    }

    // Appliquer les règles métier
    const rulesResult = BusinessRules.applyRules(userResponses, formesJuridiques);
    
    // Convertir les résultats au format attendu
    const fails = rulesResult.appliedRules.map(rule => {
        // Essayer de trouver les formes exclues par cette règle
        let formeIds = [];
        
        if (rule.exclude) {
            formeIds = rule.exclude;
        } else {
            // Si pas de forme explicitement exclue, déduire selon le code de règle
            switch(rule.id) {
                case "ca-micro":
                    formeIds = ['micro-entreprise'];
                    break;
                case "ordre-pro":
                    formeIds = ['micro-entreprise', 'ei'];
                    break;
                case "investisseurs":
                    formeIds = ['micro-entreprise', 'ei', 'eurl'];
                    break;
                case "protection-patrimoine":
                    formeIds = ['micro-entreprise', 'ei'];
                    break;
                case "multi-associes":
                    formeIds = ['micro-entreprise', 'ei', 'eurl', 'sasu'];
                    break;
                case "esus-statut":
                    formeIds = ['micro-entreprise', 'ei', 'eurl', 'sasu'];
                    break;
                case "garantie-decennale":
                    formeIds = ['micro-entreprise'];
                    break;
                case "structure-holding":
                    formeIds = ['micro-entreprise', 'ei', 'eurl', 'sasu'];
                    break;
                case "multi-sites":
                    formeIds = ['micro-entreprise', 'ei'];
                    break;
                case "rcp-forte":
                    formeIds = ['micro-entreprise'];
                    break;
                case "regime-communaute":
                    formeIds = ['micro-entreprise', 'ei'];
                    break;
                case "apport-pi":
                    formeIds = ['micro-entreprise', 'ei'];
                    break;
            }
        }
        
        // Créer un objet d'échec pour chaque forme concernée
        return formeIds.map(formeId => ({
            formeId: formeId,
            code: rule.id,
            message: rule.reason,
            details: `Cette forme juridique n'est pas compatible avec vos besoins: ${rule.reason}`
        }));
    }).flat(); // Aplatir le tableau de tableaux
    
    return fails;
}

/**
 * Vérifie si une forme juridique spécifique a des incompatibilités majeures
 * @param {string} formeId - Identifiant de la forme juridique
 * @param {Array} hardFails - Liste des incompatibilités détectées
 * @return {boolean} - Vrai si la forme a une incompatibilité majeure
 */
function hasHardFail(formeId, hardFails) {
    return hardFails.some(fail => fail.formeId === formeId);
}

/**
 * Obtient des formes juridiques alternatives recommandées en cas d'incompatibilité
 * @param {string} formeId - Identifiant de la forme juridique incompatible
 * @param {string} raison - Code de la raison d'incompatibilité
 * @return {Array} - Formes juridiques alternatives recommandées
 */
function getSuggestionsAlternatives(formeId, incompatibilites) {
    if (!incompatibilites || incompatibilites.length === 0) return [];
    
    // Extraire les codes de raison
    const reasons = incompatibilites.map(inc => inc.code);
    
    // Suggestion par raison
    let suggestionIds = [];
    
    if (reasons.includes('ca-micro') || reasons.includes('CA_ELEVE')) {
        suggestionIds.push('eurl', 'sasu', 'ei');
    }
    
    if (reasons.includes('garantie-decennale') || reasons.includes('GARANTIE_DECENNALE')) {
        suggestionIds.push('sarl', 'sasu', 'eurl');
    }
    
    if (reasons.includes('structure-holding') || reasons.includes('HOLDING')) {
        suggestionIds.push('sas', 'sa', 'sarl');
    }
    
    if (reasons.includes('esus-statut') || reasons.includes('ESUS')) {
        suggestionIds.push('scic', 'scop', 'sas');
    }
    
    if (reasons.includes('multi-sites') || reasons.includes('MULTI_ETAB')) {
        suggestionIds.push('sas', 'sarl', 'sa');
    }
    
    if (reasons.includes('regime-communaute') || reasons.includes('REGIME_MATRIMONIAL')) {
        suggestionIds.push('sasu', 'eurl', 'sarl');
    }
    
    if (reasons.includes('ordre-pro') || reasons.includes('ACTIVITE_REGLEMENTEE')) {
        suggestionIds.push('selarl', 'selas', 'sel');
    }
    
    // Si pas de suggestion spécifique, proposer les formes les plus polyvalentes
    if (suggestionIds.length === 0) {
        suggestionIds = ['eurl', 'sasu', 'sarl', 'sas'];
    }
    
    // Éliminer les doublons et convertir les IDs en objets de forme
    return [...new Set(suggestionIds)]
        .map(id => getFormeById(id))
        .filter(Boolean)
        .slice(0, 3); // Limiter à 3 suggestions
}

/**
 * Obtient les détails complets d'une forme juridique avec simulation financière
 * @param {string} formeId - Identifiant de la forme juridique
 * @param {Object} userResponses - Réponses de l'utilisateur
 * @return {Object} Détails complets avec incompatibilités et simulation
 */
function getFormeDetails(formeId, userResponses) {
    const forme = getFormeById(formeId);
    if (!forme) return null;
    
    // Obtenir les incompatibilités
    const incompatibilites = checkHardFails(userResponses)
        .filter(fail => fail.formeId === formeId);
    
    // Générer la simulation si compatible et si SimulationsFiscales existe
    let simulation = null;
    if (incompatibilites.length === 0 && typeof SimulationsFiscales !== 'undefined') {
        try {
            simulation = SimulationsFiscales.simulerImpactFiscal(forme, userResponses.chiffreAffaires || 50000, {
                zoneImplantation: userResponses.zoneImplantation,
                statutPorteur: userResponses.statutPorteur,
                garantieDecennale: userResponses.garantieDecennale, 
                rcpObligatoire: userResponses.rcpObligatoire,
                regimeMatrimonial: userResponses.regimeMatrimonial,
                preferenceDividendes: userResponses.preferenceDividendes,
                protectionSociale: userResponses.protectionSociale,
                acreActif: userResponses.statutPorteur === 'demandeur-emploi',
                tmiActuel: userResponses.tmiActuel || 30
            });
            
            // Générer une explication en langage naturel si la fonction existe
            if (typeof generateNaturalExplanation !== 'undefined') {
                simulation.explanation = generateNaturalExplanation(forme, userResponses, {
                    simulation: simulation,
                    scoreDetails: { pourcentage: 85 } // Score par défaut
                });
            }
        } catch (e) {
            console.error("Erreur lors de la simulation:", e);
            simulation = { 
                error: true, 
                message: "Impossible de générer la simulation fiscale" 
            };
        }
    }
    
    // Obtenir des alternatives en cas d'incompatibilité
    const alternatives = getSuggestionsAlternatives(formeId, incompatibilites);
    
    return {
        forme,
        incompatibilites,
        simulation,
        alternatives
    };
}

// Exporter les fonctions et la liste des formes juridiques
window.formesJuridiques = formesJuridiques;
window.getFormeById = getFormeById;
window.filtrerFormesJuridiques = filtrerFormesJuridiques;
window.getFormesSimilaires = getFormesSimilaires;
window.comparerFormesJuridiques = comparerFormesJuridiques;
window.getFormesRecommandees = getFormesRecommandees;
window.genererGuidePDF = genererGuidePDF;
window.checkHardFails = checkHardFails;
window.hasHardFail = hasHardFail;
window.getSuggestionsAlternatives = getSuggestionsAlternatives;
window.getFormeDetails = getFormeDetails;