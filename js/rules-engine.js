// Moteur de règles juridiques pour le simulateur de formes juridiques
// Version 1.0.0 - Avril 2025
// Implémentation Phase 2 (robustesse)

class RulesEngine {
  constructor(legalParams) {
    this.legalParams = legalParams || this.getDefaultParams();
  }
  
  getDefaultParams() {
    return {
      // Seuils légaux 2025
      microEntrepriseSeuils: {
        vente: 188700,
        service: 77700
      },
      isTaux: {
        reduit: { seuil: 42500, taux: 0.15 },
        normal: { taux: 0.25 }
      },
      // Règles d'incompatibilité
      incompatibilites: [
        { 
          condition: (profile) => profile.activiteReglementee && ['micro-entreprise', 'ei'].includes(profile.formeId),
          message: "Forme juridique incompatible avec activité réglementée",
          suggestion: "Optez pour une EURL ou SASU"
        },
        {
          condition: (profile) => profile.chiffreAffaires === 'eleve' && profile.formeId === 'micro-entreprise',
          message: "Dépassement probable des plafonds de CA autorisés",
          suggestion: "Optez pour une EURL ou SASU"
        },
        {
          condition: (profile) => profile.objectifs.includes('croissance') && profile.formeId === 'micro-entreprise',
          message: "Limites de croissance avec ce statut",
          suggestion: "Optez pour une SAS ou SASU pour faciliter le développement"
        },
        {
          condition: (profile) => profile.objectifs.includes('protection') && profile.formeId.includes('sc') && !['sci', 'sca'].includes(profile.formeId),
          message: "Protection patrimoniale insuffisante",
          suggestion: "Préférez une forme à responsabilité limitée (SARL, SAS, SASU)"
        }
      ]
    };
  }
  
  validateLegalForm(userProfile, formeJuridique) {
    const results = {
      isValid: true,
      warnings: [],
      blockers: [],
      fiscalImpact: this.calculateFiscalImpact(userProfile, formeJuridique)
    };
    
    // Appliquer les règles d'incompatibilité
    this.legalParams.incompatibilites.forEach(rule => {
      if (rule.condition(userProfile)) {
        results.isValid = false;
        results.blockers.push({
          message: rule.message,
          suggestion: rule.suggestion
        });
      }
    });
    
    return results;
  }
  
  calculateFiscalImpact(userProfile, formeJuridique) {
    // Calculer l'impact fiscal d'après les paramètres de l'utilisateur
    const revenuAnnuel = userProfile.revenuAnnuel || 50000; // Valeur par défaut
    
    // Déterminer régime fiscal
    const regimeFiscal = formeJuridique.fiscalite.includes('IR') ? 'IR' : 'IS';
    let regimeSocial = formeJuridique.regimeSocial.includes('TNS') ? 'TNS' : 'Assimilé salarié';
    
    // Gérer les cas particuliers
    if (formeJuridique.regimeSocial.includes('TNS') && formeJuridique.regimeSocial.includes('salarié')) {
        regimeSocial = 'Mixte (TNS ou Assimilé selon statut)';
    }
    
    // Calculer taux de charges sociales selon régime
    const tauxChargesSociales = this.legalParams.chargesSociales?.[
      regimeSocial === 'TNS' ? 'tns' : 'assimileSalarie'
    ] || (regimeSocial === 'TNS' ? 0.45 : 0.82);
    
    // Structure du résultat
    const fiscalResults = {
      revenuAnnuel: revenuAnnuel,
      regimeFiscal: regimeFiscal,
      regimeSocial: regimeSocial,
      chargesSociales: revenuAnnuel * tauxChargesSociales,
      impot: 0,
      revenueNet: 0
    };
    
    // Calculer l'impôt selon régime fiscal
    if (regimeFiscal === 'IR') {
      // Logique simplifiée pour l'IR
      const revenuImposable = revenuAnnuel - fiscalResults.chargesSociales;
      
      if (formeJuridique.id === 'micro-entreprise') {
        // Abattement forfaitaire (34% pour services, 71% pour vente)
        const abattement = userProfile.typeActivite === 'commerciale' ? 0.71 : 0.34;
        const baseIR = revenuImposable * (1 - abattement);
        fiscalResults.impot = this.calculateIR(baseIR);
      } else {
        fiscalResults.impot = this.calculateIR(revenuImposable);
      }
      
      fiscalResults.revenueNet = revenuAnnuel - fiscalResults.impot - fiscalResults.chargesSociales;
    } else {
      // Calcul pour l'IS
      // 1. Bénéfice avant impôt (80% du revenu annuel par simplification)
      const benefice = revenuAnnuel * 0.8;
      
      // 2. Calcul de l'IS
      fiscalResults.impotSociete = this.calculateIS(benefice);
      
      // 3. Répartition entre salaire et dividendes (50/50 par défaut)
      const ventilationSalaire = userProfile.ventilationRevenu?.salaire || 0.5;
      const salaire = revenuAnnuel * ventilationSalaire;
      const dividendes = (benefice - fiscalResults.impotSociete) * (1 - ventilationSalaire);
      
      // 4. Charges sociales sur le salaire
      fiscalResults.chargesSalariales = salaire * tauxChargesSociales;
      
      // 5. IR sur salaire
      fiscalResults.impotSalaire = this.calculateIR(salaire - fiscalResults.chargesSalariales);
      
      // 6. PFU sur dividendes (30%)
      fiscalResults.impotDividendes = dividendes * 0.3;
      
      // 7. Impôt total et revenu net
      fiscalResults.impot = fiscalResults.impotSalaire + fiscalResults.impotDividendes;
      fiscalResults.revenueNet = salaire - fiscalResults.chargesSalariales - fiscalResults.impotSalaire 
                               + dividendes - fiscalResults.impotDividendes;
      
      // 8. Détails supplémentaires
      fiscalResults.details = {
        is: fiscalResults.impotSociete,
        salaire: salaire,
        dividendes: dividendes,
        impotSalaire: fiscalResults.impotSalaire,
        impotDividendes: fiscalResults.impotDividendes
      };
    }
    
    return fiscalResults;
  }
  
  // Calcul de l'impôt sur le revenu (barème 2025 simplifié)
  calculateIR(revenuImposable) {
    let impot = 0;
    
    // Barème par tranches (2025)
    if (revenuImposable <= 10777) impot = 0;
    else if (revenuImposable <= 27478) impot = (revenuImposable - 10777) * 0.11;
    else if (revenuImposable <= 78570) impot = (revenuImposable - 27478) * 0.30 + 1837;
    else if (revenuImposable <= 168994) impot = (revenuImposable - 78570) * 0.41 + 17195;
    else impot = (revenuImposable - 168994) * 0.45 + 54196;
    
    return impot;
  }
  
  // Calcul de l'impôt sur les sociétés
  calculateIS(benefice) {
    // Taux IS 2025
    if (benefice <= 42500) {
      return benefice * 0.15;
    } else {
      return 42500 * 0.15 + (benefice - 42500) * 0.25;
    }
  }
}

// Exporter le module (en vérifiant si on est dans un environnement ES modules)
try {
  export default RulesEngine;
} catch(e) {
  // Environnement sans module ES, fallback
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RulesEngine;
  } else if (typeof window !== 'undefined') {
    window.RulesEngine = RulesEngine;
  }
}
