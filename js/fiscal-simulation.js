// fiscal-simulation.js - Module de simulation fiscale pour le comparateur de statuts juridiques 2025

class FiscalSimulator {
    constructor() {
        // Barèmes fiscaux et sociaux 2025
        this.taxRates = {
            ir: {
                brackets: [
                    { limit: 11294, rate: 0 },
                    { limit: 28797, rate: 11 },
                    { limit: 82341, rate: 30 },
                    { limit: 177106, rate: 41 },
                    { limit: Infinity, rate: 45 }
                ],
                flatTax: 30 // PFU (Prélèvement Forfaitaire Unique)
            },
            is: {
                reduced: 15,
                standard: 25,
                reducedLimit: 42500 // Seuil du taux réduit d'IS
            },
            micro: {
                bic_sales: { abatement: 71, social: 12.3 },
                bic_service: { abatement: 50, social: 21.2 },
                bnc: { abatement: 34, social: 21.1 },
                acre: 0.5 // Réduction ACRE de 50% la première année
            },
            social: {
                tns: {
                    base: 45, // Taux moyen de cotisations sociales pour TNS
                    minimum: 1000, // Cotisation minimale annuelle
                    acre: 0.5 // Réduction ACRE de 50% la première année
                },
                assimile: {
                    base: 80, // Taux total charges patronales + salariales
                    acre: 0 // Pas de réduction ACRE pour assimilé salarié
                }
            },
            vat: {
                standard: 20,
                intermediate: 10,
                reduced: 5.5,
                superReduced: 2.1,
                franchiseLimit: {
                    bic_sales: 94300,
                    bic_service: 36800,
                    mixed_threshold: 78600 // Pour activités mixtes
                }
            }
        };
        
        // Paramètres de configuration
        this.config = {
            displayPrecision: 2, // Nombre de décimales à afficher
            defaultActivityType: 'bic_service',
            defaultRemuneration: 0.5, // 50% du bénéfice par défaut
            defaultDividends: 0.3, // 30% du bénéfice restant après rémunération
            yearCount: 3 // Nombre d'années à simuler
        };
    }

    /**
     * Générer une simulation fiscale complète pour un statut juridique
     * 
     * @param {string} statusId - Identifiant du statut juridique
     * @param {Object} params - Paramètres de simulation
     * @returns {Object} - Résultats détaillés de la simulation
     */
    simulateForStatus(statusId, params) {
        //