// Fiscalité des entreprises en France
import { typesEntreprise } from './types-entreprise.js';

// Taux d'imposition pour l'année en cours
const tauxImposition = {
  IR: {
    tranches: [
      { limite: 10777, taux: 0 },
      { limite: 27478, taux: 11 },
      { limite: 78570, taux: 30 },
      { limite: 168994, taux: 41 },
      { limite: Infinity, taux: 45 }
    ],
    abattements: {
      microEntreprise: {
        achatRevente: 71,
        prestation: 50,
        liberal: 34
      }
    }
  },
  IS: {
    tauxNormal: 25,
    tauxReduit: {
      limite: 42500,
      taux: 15
    }
  },
  cotisations: {
    TNS: {
      maladie: { taux: 0.0785, assiette: 100 },
      retraiteBase: { taux: 0.1775, assiette: 100 },
      retraiteComplementaire: { taux: 0.07, assiette: 100 },
      allocFamiliales: { taux: 0.0315, assiette: 100 },
      CSG_CRDS: { taux: 0.097, assiette: 100 },
      formation: { taux: 0.001, assiette: 100 }
    },
    assimileSalarie: {
      employeur: {
        maladie: { taux: 0.13, assiette: 100 },
        retraiteBase: { taux: 0.085, assiette: 100 },
        retraiteComplementaire: { taux: 0.045, assiette: 100 },
        allocFamiliales: { taux: 0.0345, assiette: 100 },
        chomage: { taux: 0.042, assiette: 100 },
        formation: { taux: 0.0055, assiette: 100 },
        accidentsTravail: { taux: 0.022, assiette: 100 }
      },
      salarie: {
        maladie: { taux: 0, assiette: 100 },
        retraiteBase: { taux: 0.0690, assiette: 100 },
        retraiteComplementaire: { taux: 0.038, assiette: 100 },
        CSG_CRDS: { taux: 0.097, assiette: 98.25 },
        chomage: { taux: 0, assiette: 100 }
      }
    }
  },
  dividendes: {
    PFU: 30, // Prélèvement Forfaitaire Unique
    abattement: {
      IR: 40, // Abattement de 40% si option pour le barème de l'IR
      IS: 0   // Pas d'abattement pour l'IS
    }
  }
};

// Calculer l'impôt sur le revenu
function calculIR(revenuImposable) {
  let impot = 0;
  let revenusRestants = revenuImposable;
  
  for (let i = 0; i < tauxImposition.IR.tranches.length; i++) {
    const tranche = tauxImposition.IR.tranches[i];
    const tranchePrecedente = i > 0 ? tauxImposition.IR.tranches[i - 1].limite : 0;
    
    const assietteTranche = Math.min(revenusRestants, tranche.limite - tranchePrecedente);
    
    if (assietteTranche <= 0) break;
    
    impot += assietteTranche * (tranche.taux / 100);
    revenusRestants -= assietteTranche;
  }
  
  return impot;
}

// Calculer l'impôt sur les sociétés
function calculIS(beneficeImposable) {
  const tauxReduit = tauxImposition.IS.tauxReduit;
  
  if (beneficeImposable <= tauxReduit.limite) {
    return beneficeImposable * (tauxReduit.taux / 100);
  } else {
    return (tauxReduit.limite * (tauxReduit.taux / 100)) + 
           ((beneficeImposable - tauxReduit.limite) * (tauxImposition.IS.tauxNormal / 100));
  }
}

// Calculer les cotisations sociales pour TNS
function calculCotisationsTNS(revenuProfessionnel) {
  let totalCotisations = 0;
  const cotisations = tauxImposition.cotisations.TNS;
  
  for (const cotisation in cotisations) {
    totalCotisations += revenuProfessionnel * (cotisations[cotisation].taux * cotisations[cotisation].assiette / 100);
  }
  
  return totalCotisations;
}

// Calculer les cotisations sociales pour assimilé salarié
function calculCotisationsAssimileSalarie(remuneration) {
  const cotisationsEmployeur = tauxImposition.cotisations.assimileSalarie.employeur;
  const cotisationsSalarie = tauxImposition.cotisations.assimileSalarie.salarie;
  
  let totalEmployeur = 0;
  let totalSalarie = 0;
  
  // Cotisations patronales
  for (const cotisation in cotisationsEmployeur) {
    totalEmployeur += remuneration * (cotisationsEmployeur[cotisation].taux * cotisationsEmployeur[cotisation].assiette / 100);
  }
  
  // Cotisations salariales
  for (const cotisation in cotisationsSalarie) {
    totalSalarie += remuneration * (cotisationsSalarie[cotisation].taux * cotisationsSalarie[cotisation].assiette / 100);
  }
  
  return {
    employeur: totalEmployeur,
    salarie: totalSalarie,
    total: totalEmployeur + totalSalarie
  };
}

// Calculer l'imposition des dividendes
function calculImpositionDividendes(montantDividendes, optionBaremeIR = false, revenuFiscalReference = 0) {
  if (optionBaremeIR) {
    // Option pour le barème de l'IR
    const abattement = montantDividendes * (tauxImposition.dividendes.abattement.IR / 100);
    const dividendesImposables = montantDividendes - abattement;
    
    // On ajoute les dividendes imposables au revenu fiscal de référence
    const nouveauRFR = revenuFiscalReference + dividendesImposables;
    const irSansDividendes = calculIR(revenuFiscalReference);
    const irAvecDividendes = calculIR(nouveauRFR);
    
    // L'impôt supplémentaire dû aux dividendes
    return irAvecDividendes - irSansDividendes;
  } else {
    // Prélèvement Forfaitaire Unique (PFU)
    return montantDividendes * (tauxImposition.dividendes.PFU / 100);
  }
}

// Simulation de la fiscalité globale pour un type d'entreprise
function simulerFiscalite(typeEntreprise, params) {
  if (!typesEntreprise[typeEntreprise]) {
    return { error: "Type d'entreprise inconnu" };
  }
  
  const {
    chiffreAffaires = 0,
    charges = 0,
    remuneration = 0,
    dividendes = 0,
    optionIS = false,
    optionBaremeIR = false
  } = params;
  
  const entreprise = typesEntreprise[typeEntreprise];
  const benefice = chiffreAffaires - charges;
  let resultat = {
    type: typeEntreprise,
    chiffreAffaires,
    charges,
    benefice,
    remuneration,
    dividendes,
    cotisationsSociales: 0,
    impotSociete: 0,
    impotRevenu: 0,
    prelevementsDividendes: 0,
    resultatNet: 0,
    tauxImpositionGlobal: 0
  };
  
  // Cas particulier de la micro-entreprise
  if (typeEntreprise === "Micro-entreprise") {
    // Abattement forfaitaire selon nature activité (par défaut prestation)
    const tauxAbattement = tauxImposition.IR.abattements.microEntreprise.prestation / 100;
    const beneficeImposable = chiffreAffaires * (1 - tauxAbattement);
    
    resultat.cotisationsSociales = benefice * 0.22; // Taux simplifié pour micro-entrepreneur
    resultat.impotRevenu = calculIR(beneficeImposable);
    resultat.resultatNet = benefice - resultat.cotisationsSociales - resultat.impotRevenu;
    resultat.tauxImpositionGlobal = (resultat.cotisationsSociales + resultat.impotRevenu) / benefice * 100;
    
    return resultat;
  }
  
  // Fiscalité selon type d'entreprise et options
  const estIR = entreprise.fiscaliteDefaut.includes("IR") && !optionIS;
  const estIS = entreprise.fiscaliteDefaut.includes("IS") || optionIS;
  
  // Calcul pour régime IR
  if (estIR) {
    // Pas de rémunération formelle, le bénéfice est imposé à l'IR
    resultat.cotisationsSociales = calculCotisationsTNS(benefice);
    resultat.impotRevenu = calculIR(benefice - resultat.cotisationsSociales);
    resultat.resultatNet = benefice - resultat.cotisationsSociales - resultat.impotRevenu;
  }
  
  // Calcul pour régime IS
  if (estIS) {
    // Rémunération du dirigeant
    if (entreprise.regimeSocial === "TNS") {
      resultat.cotisationsSociales = calculCotisationsTNS(remuneration);
      resultat.impotRevenu = calculIR(remuneration - resultat.cotisationsSociales);
    } else if (entreprise.regimeSocial === "Assimilé salarié") {
      const cotisations = calculCotisationsAssimileSalarie(remuneration);
      resultat.cotisationsSociales = cotisations.total;
      // IR calculé sur le net après cotisations salariales
      resultat.impotRevenu = calculIR(remuneration - cotisations.salarie);
    }
    
    // Bénéfice après rémunération imposé à l'IS
    const beneficeImposableIS = benefice - remuneration - (entreprise.regimeSocial === "Assimilé salarié" ? 
                                calculCotisationsAssimileSalarie(remuneration).employeur : 0);
    
    if (beneficeImposableIS > 0) {
      resultat.impotSociete = calculIS(beneficeImposableIS);
    }
    
    // Dividendes
    if (dividendes > 0) {
      resultat.prelevementsDividendes = calculImpositionDividendes(
        dividendes, 
        optionBaremeIR,
        remuneration - (entreprise.regimeSocial === "Assimilé salarié" ? 
        calculCotisationsAssimileSalarie(remuneration).salarie : resultat.cotisationsSociales)
      );
    }
    
    // Résultat net global
    const resultatNetSociete = beneficeImposableIS - resultat.impotSociete - dividendes;
    const resultatNetDirigeant = remuneration - 
                               (entreprise.regimeSocial === "Assimilé salarié" ? 
                                calculCotisationsAssimileSalarie(remuneration).salarie : 
                                resultat.cotisationsSociales) - 
                               resultat.impotRevenu + 
                               dividendes - 
                               resultat.prelevementsDividendes;
    
    resultat.resultatNet = resultatNetSociete + resultatNetDirigeant;
    
    // Taux d'imposition global
    const prelevementsGlobaux = resultat.cotisationsSociales + 
                             resultat.impotRevenu + 
                             resultat.impotSociete + 
                             resultat.prelevementsDividendes;
    
    resultat.tauxImpositionGlobal = prelevementsGlobaux / benefice * 100;
  }
  
  return resultat;
}

// Comparer la fiscalité entre deux types d'entreprise
function comparerFiscalite(type1, type2, params) {
  const resultat1 = simulerFiscalite(type1, params);
  const resultat2 = simulerFiscalite(type2, params);
  
  if (resultat1.error || resultat2.error) {
    return { error: "Un des types d'entreprise est inconnu" };
  }
  
  return {
    [type1]: resultat1,
    [type2]: resultat2,
    difference: {
      cotisationsSociales: resultat1.cotisationsSociales - resultat2.cotisationsSociales,
      impotSociete: resultat1.impotSociete - resultat2.impotSociete,
      impotRevenu: resultat1.impotRevenu - resultat2.impotRevenu,
      prelevementsDividendes: resultat1.prelevementsDividendes - resultat2.prelevementsDividendes,
      resultatNet: resultat1.resultatNet - resultat2.resultatNet,
      tauxImpositionGlobal: resultat1.tauxImpositionGlobal - resultat2.tauxImpositionGlobal
    },
    plusAvantageux: resultat1.resultatNet > resultat2.resultatNet ? type1 : type2
  };
}

// Trouver le type d'entreprise le plus avantageux fiscalement
function trouverTypeEntreprisePlusAvantageux(params, typesAComparer = null) {
  const typesAAnalyser = typesAComparer || Object.keys(typesEntreprise);
  
  let meilleurType = null;
  let meilleurResultat = null;
  let resultats = {};
  
  for (const type of typesAAnalyser) {
    const resultat = simulerFiscalite(type, params);
    
    if (!resultat.error) {
      resultats[type] = resultat;
      
      if (meilleurResultat === null || resultat.resultatNet > meilleurResultat.resultatNet) {
        meilleurType = type;
        meilleurResultat = resultat;
      }
    }
  }
  
  return {
    typeMeilleur: meilleurType,
    resultatMeilleur: meilleurResultat,
    resultatsDetailles: resultats
  };
}

// Obtenir les seuils optimaux pour chaque régime
function analyserSeuilsOptimaux(chiffreAffairesMin, chiffreAffairesMax, pas = 10000) {
  const seuils = {};
  const plages = [];
  
  let typeOptimal = null;
  let dernierTypeOptimal = null;
  
  for (let ca = chiffreAffairesMin; ca <= chiffreAffairesMax; ca += pas) {
    const params = {
      chiffreAffaires: ca,
      charges: ca * 0.3 // Hypothèse simplifiée: 30% de charges
    };
    
    const { typeMeilleur } = trouverTypeEntreprisePlusAvantageux(params);
    typeOptimal = typeMeilleur;
    
    if (typeOptimal !== dernierTypeOptimal) {
      if (dernierTypeOptimal !== null) {
        plages.push({
          fin: ca - pas,
          type: dernierTypeOptimal
        });
      }
      
      seuils[ca] = typeOptimal;
      plages.push({
        debut: ca,
        type: typeOptimal
      });
    }
    
    dernierTypeOptimal = typeOptimal;
  }
  
  // Fermer la dernière plage
  if (plages.length > 0 && !plages[plages.length - 1].fin) {
    plages[plages.length - 1].fin = chiffreAffairesMax;
  }
  
  return {
    seuils,
    plages
  };
}

// Exporter les fonctions
export {
  tauxImposition,
  calculIR,
  calculIS,
  calculCotisationsTNS,
  calculCotisationsAssimileSalarie,
  calculImpositionDividendes,
  simulerFiscalite,
  comparerFiscalite,
  trouverTypeEntreprisePlusAvantageux,
  analyserSeuilsOptimaux
};
