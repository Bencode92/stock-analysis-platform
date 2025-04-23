/**
 * Module de simulation financière avancée pour le simulateur de formes juridiques
 * Implémente les flux de trésorerie mensuels et visualisations pour la Phase 2 (robustesse)
 * 
 * Version 1.0.0 - Avril 2025
 */

class AdvancedSimulation {
  constructor(legalParams) {
    this.legalParams = legalParams || {};
    this.monthlyData = Array(12).fill().map(() => ({
      revenue: 0,
      expenses: 0,
      socialCharges: 0,
      taxes: 0,
      cashflow: 0
    }));
    
    this.customDistribution = {
      salary: 0.5,
      dividends: 0.5,
      investmentRatio: 0
    };
  }
  
  // Mode expert: permet de définir une ventilation personnalisée
  setCustomDistribution(params) {
    this.customDistribution = {
      salary: params.salary || 0.5,
      dividends: params.dividends || 0.5,
      investmentRatio: params.investmentRatio || 0,
      initialInvestment: params.initialInvestment || 0
    };
    
    return this;
  }
  
  // Calcule les flux mensuels sur 12 mois
  calculateMonthlyFlows(annualRevenue, formeJuridique, monthlyDistribution) {
    // Distribution des revenus sur 12 mois selon la courbe fournie
    // ou distribution égale par défaut
    const distribution = monthlyDistribution || Array(12).fill(1/12);
    
    // Calculer pour chaque mois
    this.monthlyData = distribution.map((ratio, month) => {
      const monthlyRevenue = annualRevenue * ratio;
      
      // Calculer les charges variables selon le mois
      const expenses = this.calculateMonthlyExpenses(monthlyRevenue, formeJuridique, month);
      
      // Calculer les charges sociales pour ce mois
      const socialCharges = this.calculateMonthlySocialCharges(
        monthlyRevenue, 
        formeJuridique, 
        month
      );
      
      // Calculer les taxes pour ce mois (avec provisions)
      const taxes = this.calculateMonthlyTaxes(
        monthlyRevenue, 
        formeJuridique, 
        month
      );
      
      // Calculer le cash-flow
      const cashflow = monthlyRevenue - expenses - socialCharges - taxes;
      
      return {
        month: month + 1,
        revenue: monthlyRevenue,
        expenses: expenses,
        socialCharges: socialCharges,
        taxes: taxes,
        cashflow: cashflow,
        cumulativeCashflow: 0 // Sera calculé après
      };
    });
    
    // Calculer le cash flow cumulatif
    let cumulativeCashflow = this.customDistribution.initialInvestment || 0;
    this.monthlyData.forEach((data, index) => {
      cumulativeCashflow += data.cashflow;
      this.monthlyData[index].cumulativeCashflow = cumulativeCashflow;
    });
    
    return this.monthlyData;
  }
  
  // Méthodes privées pour les calculs détaillés
  calculateMonthlyExpenses(revenue, formeJuridique, month) {
    // Charges fixes et variables
    const chargesStructurelles = this.getChargesStructurelles(formeJuridique);
    const chargesVariables = revenue * this.getChargesVariablesRate(formeJuridique);
    
    // Charges exceptionnelles certains mois
    let chargesExceptionnelles = 0;
    
    if (month === 0) { // Janvier: charges annuelles
      chargesExceptionnelles += this.getChargesAnnuelles(formeJuridique);
    }
    
    if (month === 3 || month === 9) { // Avril et Octobre
      // Certaines charges semestrielles (ex: assurances)
      chargesExceptionnelles += chargesStructurelles * 0.5;
    }
    
    return chargesStructurelles + chargesVariables + chargesExceptionnelles;
  }
  
  getChargesStructurelles(formeJuridique) {
    // Charges fixes mensuelles selon forme juridique
    const baseCharges = 500; // Base pour tous les statuts
    
    switch(formeJuridique.id) {
      case 'micro-entreprise':
        return baseCharges * 0.5; // Charges structurelles minimales
      case 'ei':
        return baseCharges * 0.7;
      case 'eurl':
      case 'sarl':
        return baseCharges * 1.2; // Comptabilité plus complexe
      case 'sasu':
      case 'sas':
        return baseCharges * 1.5; // Structures plus coûteuses
      case 'sa':
        return baseCharges * 3; // Structure la plus coûteuse
      default:
        return baseCharges;
    }
  }
  
  getChargesVariablesRate(formeJuridique) {
    // Taux de charges variables en % du CA
    switch(formeJuridique.categorie) {
      case 'Commerciale':
        return 0.25; // 25% pour activités commerciales
      case 'Libérale':
        return 0.15; // 15% pour activités de services
      case 'Civile':
        return 0.1; // 10% pour activités civiles
      case 'Agricole':
        return 0.3; // 30% pour activités agricoles
      default:
        return 0.2; // 20% par défaut
    }
  }
  
  getChargesAnnuelles(formeJuridique) {
    // Charges annuelles (CFE, assurances annuelles, etc.)
    const baseCharges = 1000;
    
    // Plus les structures sont complexes, plus les charges annuelles sont importantes
    switch(formeJuridique.id) {
      case 'micro-entreprise':
        return baseCharges * 0.3;
      case 'ei':
        return baseCharges * 0.5;
      case 'eurl':
      case 'sarl':
        return baseCharges * 1.2;
      case 'sasu':
      case 'sas':
        return baseCharges * 1.5;
      case 'sa':
        return baseCharges * 3;
      default:
        return baseCharges;
    }
  }
  
  calculateMonthlySocialCharges(revenue, formeJuridique, month) {
    // Logique détaillée pour les charges sociales mensuelles
    // Inclut les provisions mensuelles et les échéances trimestrielles
    
    const isTrimester = (month + 1) % 3 === 0;
    const baseRate = this.legalParams.chargesSociales?.[
      formeJuridique.regimeSocial.includes('TNS') ? 'tns' : 'assimileSalarie'
    ] || (formeJuridique.regimeSocial.includes('TNS') ? 0.45 : 0.82);
    
    const revenuImposable = revenue * this.customDistribution.salary;
    
    // Pour le régime TNS, paiement trimestriel
    if (formeJuridique.regimeSocial.includes('TNS')) {
      // Provisionner chaque mois pour un paiement trimestriel
      if (isTrimester) {
        return revenuImposable * baseRate * 3; // Paiement pour 3 mois
      } else {
        return 0; // Pas de paiement ce mois-ci, mais provision
      }
    } 
    // Pour les assimilés salariés, paiement mensuel
    else if (formeJuridique.regimeSocial.includes('salarié')) {
      return revenuImposable * baseRate;
    }
    
    return revenuImposable * 0.3; // Fallback pour autres cas
  }
  
  calculateMonthlyTaxes(revenue, formeJuridique, month) {
    // Logique pour les taxes (IS mensuel ou provisions IR)
    const regimeFiscal = formeJuridique.fiscalite.includes('IR') ? 'IR' : 'IS';
    
    // Pour IS, acomptes trimestriels
    if (regimeFiscal === 'IS') {
      const beneficeEstime = revenue * 0.8; // 80% du CA en bénéfice (simplifié)
      const isAnnuel = this.calculIS(beneficeEstime * 12) / 12; // Estimation mensuelle
      
      // Acomptes IS en mars, juin, septembre, décembre (mois 2, 5, 8, 11)
      if (month === 2 || month === 5 || month === 8 || month === 11) {
        return isAnnuel * 3; // Paiement trimestriel
      }
      return 0;
    }
    // Pour IR, provisions mensuelles + solde en septembre
    else {
      const revenuNetEstime = revenue * 0.7; // 70% du CA en revenu net (simplifié)
      const irMensuel = this.calculIR(revenuNetEstime * 12) / 12; // Estimation mensuelle
      
      // Solde IR en septembre (mois 8)
      if (month === 8) {
        return irMensuel * 2; // Ajustement annuel (simplifié)
      }
      
      return irMensuel; // Provision mensuelle
    }
  }
  
  // Méthodes de calcul fiscal
  calculIS(benefice) {
    const tauxReduit = this.legalParams.isTaux?.reduit?.taux || 0.15;
    const seuilReduit = this.legalParams.isTaux?.reduit?.seuil || 42500;
    const tauxNormal = this.legalParams.isTaux?.normal?.taux || 0.25;
    
    if (benefice <= seuilReduit) {
      return benefice * tauxReduit;
    } else {
      return seuilReduit * tauxReduit + (benefice - seuilReduit) * tauxNormal;
    }
  }
  
  calculIR(revenuAnnuel) {
    // Utiliser les tranches du barème si disponibles
    if (this.legalParams.baremeIR && Array.isArray(this.legalParams.baremeIR)) {
      let impot = 0;
      let revenuRestant = revenuAnnuel;
      
      for (let i = 0; i < this.legalParams.baremeIR.length; i++) {
        const tranche = this.legalParams.baremeIR[i];
        const trancheSuivante = this.legalParams.baremeIR[i+1]?.tranche;
        
        if (tranche.tranche === null) {
          // Dernière tranche
          impot += revenuRestant * tranche.taux;
          break;
        }
        
        const trancheMin = i === 0 ? 0 : this.legalParams.baremeIR[i-1].tranche;
        const trancheMax = tranche.tranche;
        
        if (revenuRestant <= 0) break;
        
        const montantImposableTranche = Math.min(revenuRestant, trancheMax - trancheMin);
        impot += montantImposableTranche * tranche.taux;
        revenuRestant -= montantImposableTranche;
      }
      
      return impot;
    }
    
    // Sinon, utiliser un barème simplifié
    let impot = 0;
    if (revenuAnnuel <= 10777) impot = 0;
    else if (revenuAnnuel <= 27478) impot = (revenuAnnuel - 10777) * 0.11;
    else if (revenuAnnuel <= 78570) impot = (revenuAnnuel - 27478) * 0.30 + 1837;
    else if (revenuAnnuel <= 168994) impot = (revenuAnnuel - 78570) * 0.41 + 17195;
    else impot = (revenuAnnuel - 168994) * 0.45 + 54196;
    
    return impot;
  }
  
  // Créer les données pour le graphique interactif
  generateChartData() {
    return {
      labels: this.monthlyData.map(d => `Mois ${d.month}`),
      datasets: [
        {
          label: 'Revenus',
          data: this.monthlyData.map(d => d.revenue),
          backgroundColor: 'rgba(0, 255, 135, 0.5)',
          borderColor: 'rgba(0, 255, 135, 1)',
          borderWidth: 1
        },
        {
          label: 'Charges',
          data: this.monthlyData.map(d => d.expenses),
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 1
        },
        {
          label: 'Charges sociales',
          data: this.monthlyData.map(d => d.socialCharges),
          backgroundColor: 'rgba(255, 205, 86, 0.5)',
          borderColor: 'rgba(255, 205, 86, 1)',
          borderWidth: 1
        },
        {
          label: 'Taxes',
          data: this.monthlyData.map(d => d.taxes),
          backgroundColor: 'rgba(153, 102, 255, 0.5)',
          borderColor: 'rgba(153, 102, 255, 1)',
          borderWidth: 1
        },
        {
          label: 'Cash-flow mensuel',
          data: this.monthlyData.map(d => d.cashflow),
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1,
          type: 'bar'
        },
        {
          label: 'Cash-flow cumulé',
          data: this.monthlyData.map(d => d.cumulativeCashflow),
          backgroundColor: 'rgba(255, 159, 64, 0.5)',
          borderColor: 'rgba(255, 159, 64, 1)',
          borderWidth: 2,
          type: 'line',
          yAxisID: 'y1'
        }
      ]
    };
  }
  
  // Générer un graphique waterfall pour visualiser l'impact fiscal
  generateWaterfallChartData(fiscalImpact) {
    // Données pour le graphique en cascade (revenus, charges, impôts, net)
    const data = [
      { name: 'Revenu brut', value: fiscalImpact.revenuAnnuel },
      { name: 'Charges sociales', value: -fiscalImpact.chargesSociales },
      { name: 'Impôts', value: -fiscalImpact.impot }
    ];
    
    // Calculer le net (c'est la somme des éléments précédents)
    const revenuNet = fiscalImpact.revenuAnnuel - fiscalImpact.chargesSociales - fiscalImpact.impot;
    data.push({ name: 'Revenu net', value: revenuNet, isTotal: true });
    
    // Pour le mode expert avec détails IS/IR/dividendes
    if (fiscalImpact.details) {
      // Afficher les détails supplémentaires
      return {
        detailed: true,
        labels: ['Revenu brut', 'IS', 'Salaire brut', 'Ch. sociales', 'IR salaire', 'Dividendes', 'Impôt div.', 'Revenu net'],
        values: [
          fiscalImpact.revenuAnnuel,
          -fiscalImpact.details.is,
          fiscalImpact.details.salaire,
          -fiscalImpact.chargesSalariales,
          -fiscalImpact.details.impotSalaire,
          fiscalImpact.details.dividendes,
          -fiscalImpact.details.impotDividendes,
          fiscalImpact.revenueNet
        ],
        colors: [
          'rgba(0, 255, 135, 0.7)',   // Revenu brut
          'rgba(255, 99, 132, 0.7)',  // IS
          'rgba(54, 162, 235, 0.7)',  // Salaire brut
          'rgba(255, 99, 132, 0.7)',  // Charges sociales
          'rgba(255, 99, 132, 0.7)',  // IR salaire
          'rgba(54, 162, 235, 0.7)',  // Dividendes
          'rgba(255, 99, 132, 0.7)',  // Impôt dividendes
          'rgba(0, 255, 135, 0.7)'    // Revenu net
        ]
      };
    }
    
    // Version simplifiée
    return {
      detailed: false,
      labels: data.map(d => d.name),
      values: data.map(d => d.value),
      colors: data.map(d => {
        if (d.isTotal) return 'rgba(0, 255, 135, 0.7)';
        return d.value >= 0 ? 'rgba(54, 162, 235, 0.7)' : 'rgba(255, 99, 132, 0.7)';
      })
    };
  }
  
  // Comparer différentes formes juridiques
  compareStatuses(currentStatus, alternativeStatuses, params) {
    const results = {
      current: {
        status: currentStatus,
        data: this.simulateStatus(currentStatus, params)
      },
      alternatives: []
    };
    
    // Calculer pour chaque alternative
    alternativeStatuses.forEach(status => {
      const altData = this.simulateStatus(status, params);
      
      // Calculer les différences
      const diff = {
        revenuNet: altData.annual.revenuNet - results.current.data.annual.revenuNet,
        revenuNetPercent: ((altData.annual.revenuNet / results.current.data.annual.revenuNet) - 1) * 100,
        chargesSociales: altData.annual.chargesSociales - results.current.data.annual.chargesSociales,
        impot: altData.annual.impot - results.current.data.annual.impot,
        cashflow: altData.annual.cashflow - results.current.data.annual.cashflow
      };
      
      results.alternatives.push({
        status: status,
        data: altData,
        diff: diff
      });
    });
    
    return results;
  }
  
  // Simuler une forme juridique complète
  simulateStatus(status, params) {
    // Calculer les données mensuelles
    const monthlyData = this.calculateMonthlyFlows(params.revenuAnnuel, status, params.distribution);
    
    // Calculer le total annuel
    const annual = monthlyData.reduce((acc, month) => {
      acc.revenue += month.revenue;
      acc.expenses += month.expenses;
      acc.socialCharges += month.socialCharges;
      acc.impot += month.taxes;
      return acc;
    }, { 
      revenue: 0, 
      expenses: 0, 
      socialCharges: 0, 
      impot: 0
    });
    
    // Calculer le revenu net et cashflow
    annual.revenuNet = annual.revenue - annual.expenses - annual.socialCharges - annual.impot;
    annual.cashflow = monthlyData[monthlyData.length - 1].cumulativeCashflow;
    
    return {
      monthly: monthlyData,
      annual: annual
    };
  }
}

// Exporter le module (en vérifiant si on est dans un environnement ES modules)
try {
  export default AdvancedSimulation;
} catch(e) {
  // Environnement sans module ES, fallback
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdvancedSimulation;
  } else if (typeof window !== 'undefined') {
    window.AdvancedSimulation = AdvancedSimulation;
  }
}
