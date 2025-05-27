// CORRECTION DU BUG DE LA TAXE FONCIÈRE
// À appliquer dans immo-simulation.js ligne ~1820

// REMPLACER :
// Taxe foncière (5% du loyer annuel brut)
const taxeFonciere = loyerBrut * 12 * 0.05;

// PAR :
// Taxe foncière selon le paramètre (% du prix d'achat)
const taxeFonciere = this.params.communs.taxeFonciere > 0 
    ? prixAchat * (this.params.communs.taxeFonciere / 100)
    : loyerBrut * 12 * 0.05;  // Fallback 5% du loyer si taxeFonciere = 0
