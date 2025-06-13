/**
 * property-data-mapper.js
 * Module pour harmoniser les noms de propriétés entre les différents modules
 * Résout les problèmes de mapping français/anglais
 */

class PropertyDataMapper {
    /**
     * Mappe les données du formulaire vers le format attendu par les modules de calcul
     * @param {Object} formData - Données brutes du formulaire
     * @returns {Object} Données mappées et validées
     */
    static mapFormDataToAnalysis(formData) {
        // Mapping des noms français vers anglais avec fallback
        const mappedData = {
            // Prix et financement
            price: this.safeParseFloat(formData.prixPaye || formData.price),
            prixBien: this.safeParseFloat(formData.prixPaye || formData.price),
            prixPaye: this.safeParseFloat(formData.prixPaye || formData.price),
            
            // Loyers
            loyerHC: this.safeParseFloat(formData.loyerActuel || formData.loyerHC || formData.monthlyRent),
            loyerActuel: this.safeParseFloat(formData.loyerActuel || formData.loyerHC),
            monthlyRent: this.safeParseFloat(formData.loyerActuel || formData.loyerHC),
            
            // Charges
            monthlyCharges: this.safeParseFloat(formData.charges || formData.monthlyCharges || 50),
            charges: this.safeParseFloat(formData.charges || formData.monthlyCharges || 50),
            chargesRecuperables: this.safeParseFloat(formData.charges || formData.monthlyCharges || 50),
            
            // Surface et calculs dérivés
            surface: this.safeParseFloat(formData.surface),
            
            // Financement
            apport: this.safeParseFloat(formData.apport),
            duree: this.safeParseFloat(formData.duree || formData.loanDuration || 20),
            taux: this.safeParseFloat(formData.taux || formData.loanRate || 3.5),
            loanDuration: this.safeParseFloat(formData.duree || formData.loanDuration || 20),
            loanRate: this.safeParseFloat(formData.taux || formData.loanRate || 3.5),
            
            // Emprunt
            montantEmprunt: this.safeParseFloat(formData.montantEmprunt || formData.loanAmount),
            loanAmount: this.safeParseFloat(formData.montantEmprunt || formData.loanAmount),
            empruntAvecGarantie: this.safeParseFloat(formData.empruntAvecGarantie || formData.montantEmprunt),
            capitalEmprunte: this.safeParseFloat(formData.empruntAvecGarantie || formData.montantEmprunt),
            
            // Coûts
            coutTotal: this.safeParseFloat(formData.coutTotal || formData.totalCost),
            
            // Fiscalité
            tmi: this.safeParseFloat(formData.tmi || 30),
            
            // Paramètres avancés
            taxeFonciere: this.safeParseFloat(formData.taxeFonciere || 800),
            vacanceLocative: this.safeParseFloat(formData.vacanceLocative || 0),
            gestionLocative: this.safeParseFloat(formData.gestionLocative || formData.gestionLocativeTaux || 0),
            gestionLocativeTaux: this.safeParseFloat(formData.gestionLocativeTaux || formData.gestionLocative || 0),
            
            // Charges mensuelles
            chargesCoproNonRecup: this.safeParseFloat(formData.chargesCoproNonRecup || 50),
            assurancePNO: this.safeParseFloat(formData.assurancePNO || 15),
            
            // Charges annuelles
            entretienAnnuel: this.safeParseFloat(formData.entretienAnnuel || 500),
            travauxRenovation: this.safeParseFloat(formData.travauxRenovation || formData.travaux || 0),
            travaux: this.safeParseFloat(formData.travaux || formData.travauxRenovation || 0),
            
            // Type d'achat
            typeAchat: formData.typeAchat || 'classique',
            
            // Localisation
            ville: formData.ville,
            city: formData.city || formData.ville?.ville || '',
            department: formData.department || formData.ville?.departement || '',
            propertyType: formData.propertyType || 'appartement'
        };
        
        // Calculer les valeurs dérivées avec protection contre la division par zéro
        if (mappedData.surface > 0) {
            mappedData.prixM2Paye = mappedData.price / mappedData.surface;
            mappedData.loyerM2Actuel = mappedData.loyerHC / mappedData.surface;
            mappedData.loyerCCM2 = (mappedData.loyerHC + mappedData.monthlyCharges) / mappedData.surface;
        } else {
            mappedData.prixM2Paye = 0;
            mappedData.loyerM2Actuel = 0;
            mappedData.loyerCCM2 = 0;
        }
        
        // Calculer le loyer CC
        mappedData.loyerCC = mappedData.loyerHC + mappedData.monthlyCharges;
        
        // Calculer les valeurs annuelles
        mappedData.loyerBrutHC = mappedData.loyerHC * 12;
        mappedData.loyerBrutCC = mappedData.loyerCC * 12;
        mappedData.loyerBrut = mappedData.loyerBrutCC;
        
        // Calculer la mensualité si possible
        if (!mappedData.monthlyPayment && mappedData.loanAmount > 0) {
            mappedData.monthlyPayment = this.calculateMonthlyPayment(
                mappedData.loanAmount,
                mappedData.loanRate,
                mappedData.loanDuration
            );
        }
        
        // Copier toutes les autres propriétés non mappées
        Object.keys(formData).forEach(key => {
            if (!(key in mappedData)) {
                mappedData[key] = formData[key];
            }
        });
        
        return mappedData;
    }
    
    /**
     * Parse float sécurisé avec fallback à 0
     */
    static safeParseFloat(value, defaultValue = 0) {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }
    
    /**
     * Calcul de mensualité de prêt
     */
    static calculateMonthlyPayment(loanAmount, annualRate, years) {
        if (!loanAmount || !annualRate || !years) return 0;
        
        const monthlyRate = annualRate / 100 / 12;
        const numPayments = years * 12;
        
        if (monthlyRate === 0) return loanAmount / numPayments;
        
        return loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments) / 
               (Math.pow(1 + monthlyRate, numPayments) - 1);
    }
    
    /**
     * Valide que toutes les données critiques sont présentes et numériques
     */
    static validateData(data) {
        const requiredFields = ['price', 'surface', 'loyerHC', 'apport'];
        const errors = [];
        
        requiredFields.forEach(field => {
            if (!data[field] || isNaN(data[field])) {
                errors.push(`Le champ "${field}" est manquant ou invalide`);
            }
        });
        
        if (data.surface <= 0) {
            errors.push('La surface doit être supérieure à 0');
        }
        
        if (data.price <= 0) {
            errors.push('Le prix doit être supérieur à 0');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
    
    /**
     * Debug helper - affiche le mapping dans la console
     */
    static debugMapping(originalData, mappedData) {
        console.group('🔄 Property Data Mapping Debug');
        console.log('📥 Données originales:', originalData);
        console.log('📤 Données mappées:', mappedData);
        
        // Vérifier les NaN
        const nanFields = [];
        Object.entries(mappedData).forEach(([key, value]) => {
            if (typeof value === 'number' && isNaN(value)) {
                nanFields.push(key);
            }
        });
        
        if (nanFields.length > 0) {
            console.warn('⚠️ Champs avec NaN:', nanFields);
        }
        
        // Validation
        const validation = this.validateData(mappedData);
        if (!validation.isValid) {
            console.error('❌ Erreurs de validation:', validation.errors);
        } else {
            console.log('✅ Toutes les données sont valides');
        }
        
        console.groupEnd();
    }
}

// Export pour utilisation
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = PropertyDataMapper;
} else {
    window.PropertyDataMapper = PropertyDataMapper;
}
