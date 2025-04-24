// Types d'entreprises en France
const typesEntreprise = {
  "Micro-entreprise": {
    categorie: "Commerciale/Civile",
    associes: "1",
    capitalMin: "Aucun",
    responsabilite: "Illimitée (sauf résidence principale protégée)",
    fiscaliteDefaut: "IR",
    optionFiscale: false,
    regimeSocial: "TNS",
    protectionPatrimoine: "Partielle",
    chargesSociales: "Simplifiées",
    fiscaliteDividendes: "Non applicable (pas de distribution, IR sur bénéfices)",
    regimeTVA: "Franchise en base (TVA uniquement si dépassement seuils)",
    publicationComptes: false,
    formalitesCreation: "Très simplifiées",
    activiteAutorisee: "Toutes sauf réglementées",
    leveeFonds: false,
    entreeAssocies: false,
    profilOptimal: "Entrepreneur solo",
    avantages: ["Simplicité", "Coût réduit"],
    inconvenients: ["Plafond CA", "Pas de déduction de charges"],
    casUsageConseille: "Début d'activité, test",
    casUsageDeconseille: "Développement ambitieux",
    transmission: false
  },
  "EI": {
    categorie: "Commerciale/Civile",
    associes: "1",
    capitalMin: "Aucun",
    responsabilite: "Illimitée sauf patrimoine pro",
    fiscaliteDefaut: "IR",
    optionFiscale: false,
    regimeSocial: "TNS",
    protectionPatrimoine: true,
    chargesSociales: "Sur bénéfices",
    fiscaliteDividendes: "Non applicable (pas de distribution, IR sur bénéfices)",
    regimeTVA: true,
    publicationComptes: false,
    formalitesCreation: "Très simplifiées",
    activiteAutorisee: "Toutes sauf réglementées",
    leveeFonds: false,
    entreeAssocies: false,
    profilOptimal: "Entrepreneur solo",
    avantages: ["Simplicité", "Coût réduit"],
    inconvenients: ["Responsabilité", "Peu de protection"],
    casUsageConseille: "Artisan, commerçant",
    casUsageDeconseille: "Projet à risque élevé",
    transmission: false
  },
  "EURL": {
    categorie: "Commerciale",
    associes: "1",
    capitalMin: "Libre",
    responsabilite: "Limitée aux apports",
    fiscaliteDefaut: "IR (IS option)",
    optionFiscale: true,
    regimeSocial: "TNS",
    protectionPatrimoine: true,
    chargesSociales: "Sur bénéfices ou rémunération",
    fiscaliteDividendes: "Oui, selon IS/IR",
    regimeTVA: true,
    publicationComptes: true,
    formalitesCreation: "Standard",
    activiteAutorisee: "Toutes sauf réglementées",
    leveeFonds: false,
    entreeAssocies: true,
    profilOptimal: "Entrepreneur solo voulant société",
    avantages: ["Responsabilité limitée", "Souplesse"],
    inconvenients: ["Formalisme", "Coût"],
    casUsageConseille: "PME, activité récurrente",
    casUsageDeconseille: "Projet risqué seul",
    transmission: true
  },
  "SASU": {
    categorie: "Commerciale",
    associes: "1",
    capitalMin: "37 000 € (50% libéré à la constitution, solde dans les 5 ans)",
    responsabilite: "Limitée aux apports",
    fiscaliteDefaut: "IS (IR option 5 ans)",
    optionFiscale: true,
    regimeSocial: "Assimilé salarié",
    protectionPatrimoine: true,
    chargesSociales: "Sur rémunération",
    fiscaliteDividendes: "Oui, selon IS/IR",
    regimeTVA: true,
    publicationComptes: true,
    formalitesCreation: "Standard",
    activiteAutorisee: "Toutes sauf réglementées",
    leveeFonds: true,
    entreeAssocies: true,
    profilOptimal: "Entrepreneur solo voulant flexibilité",
    avantages: ["Souplesse statutaire", "Protection sociale"],
    inconvenients: ["Charges sociales élevées"],
    casUsageConseille: "Start-up, levée de fonds",
    casUsageDeconseille: "Projets à très faibles revenus ou où les charges sociales doivent être minimisées",
    transmission: true
  },
  "SARL": {
    categorie: "Commerciale",
    associes: "2-100",
    capitalMin: "37 000 € (50% libéré à la constitution, solde dans les 5 ans)",
    responsabilite: "Limitée aux apports",
    fiscaliteDefaut: "IS (IR option 5 ans)",
    optionFiscale: true,
    regimeSocial: "TNS (gérant majoritaire), Assimilé salarié (gérant minoritaire/égalitaire)",
    protectionPatrimoine: true,
    chargesSociales: "Selon statut gérant",
    fiscaliteDividendes: "Oui, selon IS/IR",
    regimeTVA: true,
    publicationComptes: true,
    formalitesCreation: "Standard",
    activiteAutorisee: "Toutes sauf réglementées",
    leveeFonds: "Limité",
    entreeAssocies: "Modéré",
    profilOptimal: "PME familiale",
    avantages: ["Encadrement légal", "Sécurité"],
    inconvenients: ["Moins flexible que SAS"],
    casUsageConseille: "PME, activité familiale",
    casUsageDeconseille: "Start-up, levée de fonds",
    transmission: true
  },
  "SAS": {
    categorie: "Commerciale",
    associes: "2+",
    capitalMin: "37 000 € (50% libéré à la constitution, solde dans les 5 ans)",
    responsabilite: "Limitée aux apports",
    fiscaliteDefaut: "IS (IR option 5 ans)",
    optionFiscale: true,
    regimeSocial: "Assimilé salarié",
    protectionPatrimoine: true,
    chargesSociales: "Sur rémunération",
    fiscaliteDividendes: "Oui, selon IS/IR",
    regimeTVA: true,
    publicationComptes: true,
    formalitesCreation: "Standard",
    activiteAutorisee: "Toutes sauf réglementées",
    leveeFonds: true,
    entreeAssocies: true,
    profilOptimal: "Start-up, investisseurs",
    avantages: ["Souplesse", "Levée de fonds"],
    inconvenients: ["Charges sociales élevées"],
    casUsageConseille: "Start-up, levée de fonds",
    casUsageDeconseille: "Professions réglementées",
    transmission: true
  },
  "SA": {
    categorie: "Commerciale",
    associes: "2 (non cotée), 7 (cotée)",
    capitalMin: "37 000 € (50% libéré à la constitution, solde dans les 5 ans)",
    responsabilite: "Limitée aux apports",
    fiscaliteDefaut: "IS",
    optionFiscale: false,
    regimeSocial: "Assimilé salarié",
    protectionPatrimoine: true,
    chargesSociales: "Sur rémunération",
    fiscaliteDividendes: "Oui",
    regimeTVA: true,
    publicationComptes: true,
    formalitesCreation: "Complexes",
    activiteAutorisee: "Grandes entreprises",
    leveeFonds: true,
    entreeAssocies: true,
    profilOptimal: "Grands groupes, cotation",
    avantages: ["Accès capital", "Crédibilité"],
    inconvenients: ["Complexité", "Coût"],
    casUsageConseille: "Grande entreprise, cotation",
    casUsageDeconseille: "Petite structure",
    transmission: true
  },
  "SCI": {
    categorie: "Civile",
    associes: "2+",
    capitalMin: "Libre",
    responsabilite: "Indéfinie",
    fiscaliteDefaut: "IR (IS option)",
    optionFiscale: true,
    regimeSocial: "TNS ou assimilé salarié",
    protectionPatrimoine: false,
    chargesSociales: "Selon statut",
    fiscaliteDividendes: "Non concerné",
    regimeTVA: true,
    publicationComptes: true,
    formalitesCreation: "Standard",
    activiteAutorisee: "Gestion immobilière",
    leveeFonds: false,
    entreeAssocies: true,
    profilOptimal: "Gestion patrimoine immobilier",
    avantages: ["Transmission", "Souplesse"],
    inconvenients: ["Responsabilité indéfinie"],
    casUsageConseille: "Gestion immobilière",
    casUsageDeconseille: "Activité commerciale",
    transmission: true
  },
  "SCP": {
    categorie: "Civile",
    associes: "2+",
    capitalMin: "Libre",
    responsabilite: "Indéfinie et solidaire",
    fiscaliteDefaut: "IR",
    optionFiscale: false,
    regimeSocial: "TNS",
    protectionPatrimoine: false,
    chargesSociales: "Sur bénéfices",
    fiscaliteDividendes: "Non concerné",
    regimeTVA: true,
    publicationComptes: true,
    formalitesCreation: "Standard",
    activiteAutorisee: "Professions libérales",
    leveeFonds: false,
    entreeAssocies: "Modéré",
    profilOptimal: "Professions libérales réglementées",
    avantages: ["Mutualisation moyens"],
    inconvenients: ["Responsabilité indéfinie"],
    casUsageConseille: "Professions libérales",
    casUsageDeconseille: "Activité commerciale",
    transmission: false
  },
  "SCM": {
    categorie: "Civile",
    associes: "2+",
    capitalMin: "Libre",
    responsabilite: "Indéfinie",
    fiscaliteDefaut: "IR",
    optionFiscale: false,
    regimeSocial: "TNS",
    protectionPatrimoine: false,
    chargesSociales: "Sur bénéfices",
    fiscaliteDividendes: "Non concerné",
    regimeTVA: true,
    publicationComptes: true,
    formalitesCreation: "Standard",
    activiteAutorisee: "Professions libérales",
    leveeFonds: false,
    entreeAssocies: "Modéré",
    profilOptimal: "Professions libérales mutualisant moyens",
    avantages: ["Mutualisation moyens"],
    inconvenients: ["Pas de chiffre d'affaires propre"],
    casUsageConseille: "Mutualisation moyens",
    casUsageDeconseille: "Activité commerciale",
    transmission: false
  },
  "SCCV": {
    categorie: "Civile",
    associes: "2+",
    capitalMin: "Libre",
    responsabilite: "Indéfinie",
    fiscaliteDefaut: "IS",
    optionFiscale: false,
    regimeSocial: "TNS",
    protectionPatrimoine: false,
    chargesSociales: "Sur bénéfices",
    fiscaliteDividendes: "Non concerné",
    regimeTVA: true,
    publicationComptes: true,
    formalitesCreation: "Standard",
    activiteAutorisee: "Construction vente immobilière",
    leveeFonds: false,
    entreeAssocies: "Modéré",
    profilOptimal: "Promotion immobilière",
    avantages: ["Fiscalité avantageuse"],
    inconvenients: ["Responsabilité indéfinie"],
    casUsageConseille: "Promotion immobilière",
    casUsageDeconseille: "Activité commerciale",
    transmission: true
  },
  "SNC": {
    categorie: "Commerciale",
    associes: "2+",
    capitalMin: "Libre",
    responsabilite: "Indéfinie et solidaire",
    fiscaliteDefaut: "IR (IS option)",
    optionFiscale: true,
    regimeSocial: "TNS",
    protectionPatrimoine: false,
    chargesSociales: "Sur bénéfices",
    fiscaliteDividendes: "Oui, selon IS/IR",
    regimeTVA: true,
    publicationComptes: true,
    formalitesCreation: "Standard",
    activiteAutorisee: "Toutes sauf réglementées",
    leveeFonds: false,
    entreeAssocies: "Difficile",
    profilOptimal: "Confiance entre associés",
    avantages: ["Simplicité", "Confidentialité"],
    inconvenients: ["Responsabilité lourde"],
    casUsageConseille: "Activité familiale, confiance",
    casUsageDeconseille: "Projet risqué",
    transmission: true
  }
};

// Fonction pour comparer deux types d'entreprises
function compareTypesEntreprise(type1, type2) {
  const comparison = {};
  
  if (!typesEntreprise[type1] || !typesEntreprise[type2]) {
    return null;
  }
  
  // Comparer tous les attributs
  for (const key in typesEntreprise[type1]) {
    if (typeof typesEntreprise[type1][key] === 'object' && !Array.isArray(typesEntreprise[type1][key])) {
      comparison[key] = {};
      for (const subKey in typesEntreprise[type1][key]) {
        comparison[key][subKey] = {
          [type1]: typesEntreprise[type1][key][subKey],
          [type2]: typesEntreprise[type2][key][subKey]
        };
      }
    } else {
      comparison[key] = {
        [type1]: typesEntreprise[type1][key],
        [type2]: typesEntreprise[type2][key]
      };
    }
  }
  
  return comparison;
}

// Fonction pour filtrer les types d'entreprises selon des critères
function filtrerTypesEntreprise(criteres) {
  return Object.keys(typesEntreprise).filter(type => {
    const entreprise = typesEntreprise[type];
    let match = true;
    
    for (const critere in criteres) {
      if (criteres[critere] !== entreprise[critere]) {
        match = false;
        break;
      }
    }
    
    return match;
  });
}

// Fonction pour obtenir les détails d'un type d'entreprise
function getDetailsTypeEntreprise(type) {
  return typesEntreprise[type] || null;
}

// Fonction pour obtenir la liste de tous les types d'entreprises
function getAllTypesEntreprise() {
  return Object.keys(typesEntreprise);
}

// Fonction pour récupérer la liste des avantages fiscaux par type d'entreprise
function getAvantagesFiscaux(type) {
  if (!typesEntreprise[type]) return null;
  
  const entreprise = typesEntreprise[type];
  const avantages = {
    fiscaux: []
  };
  
  if (entreprise.fiscaliteDefaut.includes("IR") && entreprise.optionFiscale) {
    avantages.fiscaux.push("Option pour l'IS possible");
  }
  
  if (entreprise.fiscaliteDefaut.includes("IS") && entreprise.optionFiscale) {
    avantages.fiscaux.push("Option pour l'IR possible pendant 5 ans");
  }
  
  if (entreprise.protectionPatrimoine) {
    avantages.fiscaux.push("Protection du patrimoine personnel");
  }
  
  return avantages;
}

// Exporter les fonctions
export {
  typesEntreprise,
  compareTypesEntreprise,
  filtrerTypesEntreprise,
  getDetailsTypeEntreprise,
  getAllTypesEntreprise,
  getAvantagesFiscaux
};
