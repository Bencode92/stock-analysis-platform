// Fichier JS pour simulateur de dette avec options dynamiques
class LoanSimulator {
    constructor({ 
        capital, 
        tauxAnnuel, 
        dureeMois, 
        assuranceAnnuelle = 0, 
        indemnitesMois = 12,
        fraisDossier = 2000,
        fraisTenueCompte = 710,
        fraisGarantie = null,
        fraisCourtage = 0, // NOUVEAU: Frais de courtage
        typeGarantie = 'caution',
        assuranceSurCapitalInitial = false,
        periodicite = 'mensuel', // NOUVEAU: Périodicité des remboursements
        differeMois = 0 // NOUVEAU: Différé d'amortissement
    }) {
        this.capital = capital;
        this.tauxMensuel = tauxAnnuel / 100 / 12;
        this.dureeMois = dureeMois;
        this.assuranceMensuelle = assuranceAnnuelle / 100 / 12;
        this.indemnitesMois = indemnitesMois;
        this.assuranceSurCapitalInitial = assuranceSurCapitalInitial;
        
        // Stockage de l'assurance fixe sur capital initial pour éviter la confusion
        this.assuranceMensuelleFixe = this.assuranceSurCapitalInitial ? 
            capital * this.assuranceMensuelle : null;

        // Frais annexes
        this.fraisDossier = fraisDossier;
        this.fraisTenueCompte = fraisTenueCompte;
        this.fraisCourtage = fraisCourtage; // NOUVEAU
        
        // Calcul des frais de garantie selon le type
        let fraisCalcules;
        switch(typeGarantie) {
            case 'hypotheque':
                fraisCalcules = Math.max(capital * 0.015, 800); // Min 800€
                break;
            case 'ppd':
                fraisCalcules = Math.max(capital * 0.01, 500); // Min 500€
                break;
            case 'caution':
            default:
                fraisCalcules = capital * 0.013709; // Crédit Logement
        }
        this.fraisGarantie = fraisGarantie !== null ? fraisGarantie : fraisCalcules;
        
        // NOUVEAU: Gestion de la périodicité
        this.periodicite = periodicite;
        this.facteurPeriodicite = 1; // Par défaut mensuel
        if (periodicite === 'trimestriel') {
            this.facteurPeriodicite = 3;
            this.tauxMensuel = tauxAnnuel / 100 / 4; // Taux trimestriel
        } else if (periodicite === 'annuel') {
            this.facteurPeriodicite = 12;
            this.tauxMensuel = tauxAnnuel / 100; // Taux annuel
        }
        
        // NOUVEAU: Gestion du différé d'amortissement
        this.differeMois = differeMois;
    }
    
    calculerMensualite() {
        const { capital, tauxMensuel, dureeMois } = this;
        return capital * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -dureeMois));
    }
    
    tableauAmortissement({ 
        remboursementAnticipe = 0, 
        moisAnticipe = null, 
        nouveauTaux = null,
        modeRemboursement = 'duree', // 'duree' ou 'mensualite'
        comparerScenarios = false // NOUVEAU: Option pour comparer avec/sans remboursement anticipé
    }) {
        let mensualite = this.calculerMensualite();
        let capitalRestant = this.capital;
        let tableau = [];
        let tauxMensuel = this.tauxMensuel;
        let assuranceMensuelle = this.assuranceMensuelle;
        let totalInterets = 0;
        let totalAssurance = 0;
        let totalCapitalAmorti = 0;
        let capitalInitial = this.capital;
        
        // Suivi avant remboursement anticipé
        let interetsAvantRembours = 0;
        let mensualitesAvantRembours = 0;
        
        // NOUVEAU: Conservation des données sans remboursement anticipé pour comparaison
        let tableauSansAnticipe = [];
        let mensualiteSansAnticipe = mensualite;
        let capitalRestantSansAnticipe = this.capital;
        let tauxMensuelSansAnticipe = this.tauxMensuel;
        let totalInteretsSansAnticipe = 0;
        let totalAssuranceSansAnticipe = 0;
        
        // Remplacer la boucle for par une boucle while pour mieux gérer le remboursement anticipé
        let mois = 1;
        // Limite de sécurité (150% de la durée initiale pour éviter les boucles infinies)
        let maxMois = Math.ceil(this.dureeMois * 1.5);
        
        while (capitalRestant > 0 && mois <= maxMois) {
            let interets = capitalRestant * tauxMensuel;
            
            // Calcul de l'assurance selon le mode (capital initial ou restant dû)
            let assurance = this.assuranceSurCapitalInitial ? 
                (this.assuranceMensuelleFixe || capitalInitial * assuranceMensuelle) : 
                capitalRestant * assuranceMensuelle;
            
            // NOUVEAU: Gestion du différé d'amortissement
            let capitalAmorti = 0;
            if (mois <= this.differeMois) {
                // En période de différé, on ne rembourse que les intérêts
                capitalAmorti = 0;
            } else {
                // Période normale, remboursement du capital
                capitalAmorti = mensualite - interets;
            }
            
            // Calculs avant remboursement anticipé
            if (moisAnticipe && mois < moisAnticipe) {
                interetsAvantRembours += interets;
                mensualitesAvantRembours += (mensualite + assurance);
            }
            
            // Réinjection de capital (remboursement anticipé partiel)
            if (moisAnticipe && mois === moisAnticipe) {
                capitalRestant -= remboursementAnticipe;
                
                // CORRECTION: Appliquer d'abord le nouveau taux si spécifié
                if (nouveauTaux !== null) {
                    tauxMensuel = nouveauTaux / 100 / 12;
                    
                    // Ajuster le taux en fonction de la périodicité
                    if (this.periodicite === 'trimestriel') {
                        tauxMensuel = nouveauTaux / 100 / 4;
                    } else if (this.periodicite === 'annuel') {
                        tauxMensuel = nouveauTaux / 100;
                    }
                }
                
                // Déterminer le comportement selon le mode de remboursement
                if