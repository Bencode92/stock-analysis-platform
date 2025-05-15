/**
 * immo-extension-societes.js - Extension pour les régimes sociétés (SCI, SAS, SARL)
 * 
 * Ce script étend les fonctionnalités du simulateur immobilier pour prendre en compte
 * les régimes fiscaux des sociétés (SCI, SAS, SARL soumises à l'IS)
 * 
 * Version 1.0 - Mai 2025
 */

// Intégration au module ImmoExtensions existant
document.addEventListener('DOMContentLoaded', function() {
    // Attendre que ImmoExtensions soit chargé
    const checkExtensions = setInterval(function() {
        if (window.ImmoExtensions) {
            clearInterval(checkExtensions);
            extendWithSocietes();
            console.log("Extension sociétés chargée");
        }
    }, 100);
    
    // Délai maximum de 5 secondes
    setTimeout(function() {
        clearInterval(checkExtensions);
        console.warn("Délai d'attente dépassé pour l'extension sociétés");
    }, 5000);
});

/**
 * Étend le simulateur immobilier avec le support des sociétés
 */
function extendWithSocietes() {
    // S'assurer que le simulateur et ImmoExtensions sont disponibles
    if (!window.simulateur || !window.ImmoExtensions) {
        console.error("Impossible de charger l'extension sociétés : simulateur ou ImmoExtensions manquant");
        return;
    }
    
    // 1. Ajouter le taux d'IS aux paramètres fiscaux s'il n'existe pas déjà
    if (!simulateur.params.fiscalite.tauxIS) {
        simulateur.params.fiscalite.tauxIS = 25; // Taux d'IS par défaut à 25%
    }
    
    // 2. Remplacer la fonction d'ajout du sélecteur de régime fiscal
    const originalAjouterSelectionRegimeFiscal = ImmoExtensions.ajouterSelectionRegimeFiscal || function() {};
    
    ImmoExtensions.ajouterSelectionRegimeFiscal = function() {
        // Vérifier si le conteneur existe et si le sélecteur n'est pas déjà présent
        const paramsCommuns = document.getElementById('params-communs');
        if (!paramsCommuns || document.getElementById('regime-fiscal')) return;
        
        // Créer l'élément
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        formGroup.innerHTML = `
            <label class="form-label">Régime fiscal</label>
            <select id="regime-fiscal" class="form-input">
                <option value="micro-foncier">Micro-foncier (abattement 30%)</option>
                <option value="reel-foncier">Régime réel foncier</option>
                <option value="lmnp-micro">LMNP micro-BIC (abattement 50%)</option>
                <option value="lmnp-reel">LMNP réel avec amortissements</option>
                <option value="sci-is">SCI à l'IS</option>
                <option value="sas-is">SAS (IS)</option>
                <option value="sarl-is">SARL (IS)</option>
            </select>
            <span class="form-help">Impact direct sur la rentabilité après impôts</span>
        `;
        
        // Ajouter à l'interface
        paramsCommuns.appendChild(formGroup);
        
        // Ajouter un champ pour le taux d'IS si on est en mode avancé
        const taux_is_group = document.createElement('div');
        taux_is_group.className = 'form-group';
        taux_is_group.id = 'taux-is-group';
        taux_is_group.style.display = 'none'; // Caché par défaut
        taux_is_group.innerHTML = `
            <label class="form-label">Taux d'impôt sur les sociétés</label>
            <div class="form-addon">
                <input type="number" id="taux-is" class="form-input" value="${simulateur.params.fiscalite.tauxIS}" min="15" max="33" step="0.1">
                <span class="form-addon-text">%</span>
            </div>
            <span class="form-help">Taux d'IS applicable (25% standard, 15% pour les PME)</span>
        `;
        paramsCommuns.appendChild(taux_is_group);
        
        // Écouter les changements sur le sélecteur de régime fiscal
        const regimeFiscalSelect = document.getElementById('regime-fiscal');
        if (regimeFiscalSelect) {
            regimeFiscalSelect.addEventListener('change', function() {
                // Afficher le champ taux d'IS uniquement pour les régimes IS
                const isISRegime = ['sci-is', 'sas-is', 'sarl-is'].includes(this.value);
                document.getElementById('taux-is-group').style.display = isISRegime ? 'block' : 'none';
                
                // Mettre à jour le taux d'IS quand il change
                const tauxISInput = document.getElementById('taux-is');
                if (tauxISInput) {
                    tauxISInput.addEventListener('change', function() {
                        simulateur.params.fiscalite.tauxIS = parseFloat(this.value) || 25;
                        // Recalculer si des résultats existent déjà
                        if (simulateur.params.resultats.classique && simulateur.params.resultats.encheres) {
                            updateResultsWithFiscalChange();
                        }
                    });
                }
                
                // Mise à jour du régime et recalcul
                simulateur.params.fiscalite.regimeFiscal = this.value;
                if (simulateur.params.resultats.classique && simulateur.params.resultats.encheres) {
                    updateResultsWithFiscalChange();
                }
            });
        }
    };
    
    // Fonction pour mettre à jour les résultats après changement fiscal
    function updateResultsWithFiscalChange() {
        simulateur.params.resultats.classique = simulateur.calculeTout(
            simulateur.params.resultats.classique.surface, 'classique');
        simulateur.params.resultats.encheres = simulateur.calculeTout(
            simulateur.params.resultats.encheres.surface, 'encheres');
        
        // Mettre à jour l'affichage
        ImmoExtensions.mettreAJourAffichageFiscal();
        ImmoExtensions.ajouterIndicateursVisuels(simulateur.params.resultats);
        
        // Feedback visuel
        if (window.afficherToast && typeof window.afficherToast === 'function') {
            window.afficherToast(`Régime fiscal mis à jour`, 'success');
        }
    }
    
    // 3. Remplacer la méthode de calcul d'amortissement
    const originalCalculerAmortissementAnnuel = SimulateurImmo.prototype.calculerAmortissementAnnuel;
    
    SimulateurImmo.prototype.calculerAmortissementAnnuel = function(regime) {
        if (regime !== 'lmnp-reel' && regime !== 'lmp-reel' && 
            regime !== 'sci-is' && regime !== 'sas-is' && regime !== 'sarl-is') {
            return 0;
        }
        
        const modeActuel = this.modeActuel || 'classique';
        
        // Vérifier que les résultats existent
        if (!this.params.resultats || !this.params.resultats[modeActuel]) {
            return 0;
        }
        
        const prixAchat = this.params.resultats[modeActuel].prixAchat || 0;
        const partTerrain = 0.15; // 15% pour le terrain (non amortissable)
        const partConstruction = 1 - partTerrain;
        
        // Taux d'amortissement différent selon le régime
        let tauxAmortissement;
        if (regime === 'sci-is' || regime === 'sas-is' || regime === 'sarl-is') {
            tauxAmortissement = 0.05; // 5% par an (20 ans) pour les sociétés IS
        } else {
            tauxAmortissement = 0.025; // 2.5% par an (40 ans) pour LMNP/LMP
        }
        
        return prixAchat * partConstruction * tauxAmortissement;
    };
    
    // 4. Remplacer la méthode de calcul fiscal
    const originalCalculerImpactFiscalAvecRegime = SimulateurImmo.prototype.calculerImpactFiscalAvecRegime;
    
    SimulateurImmo.prototype.calculerImpactFiscalAvecRegime = function(revenuFoncier, interetsEmprunt, charges, regimeFiscal) {
        // S'assurer que toutes les valeurs sont des nombres valides
        revenuFoncier = Number(revenuFoncier) || 0;
        interetsEmprunt = Number(interetsEmprunt) || 0;
        charges = Number(charges) || 0;
        
        // Logging pour débogage
        console.log("Calcul fiscal:", {
            revenuFoncier, 
            interetsEmprunt, 
            charges, 
            regimeFiscal
        });
        
        // Variables pour stocker les résultats
        let revenusImposables = 0;
        let abattement = 0;
        let chargesDeduites = 0;
        let amortissement = 0;
        
        // Déterminer les revenus imposables selon le régime fiscal
        switch (regimeFiscal) {
            /* ------------------------------------------------------------------ */
            case 'micro-foncier':
                // Abattement forfaitaire de 30 %
                // Revenu imposable = loyers bruts  –  30 %
                abattement        = revenuFoncier * 0.30;
                revenusImposables = Math.max(0, revenuFoncier - abattement);
                break;

            /* ------------------------------------------------------------------ */
            case 'reel-foncier':
                // Déduction des intérêts et charges réelles
                // Revenu imposable = loyers bruts  –  (intérêts + charges)
                chargesDeduites   = interetsEmprunt + charges;
                revenusImposables = Math.max(0, revenuFoncier - chargesDeduites);
                break;

            /* ------------------------------------------------------------------ */
            case 'lmnp-micro':
                // Abattement forfaitaire de 50 % (micro-BIC)
                // Revenu imposable = loyers bruts  –  50 %
                abattement        = revenuFoncier * 0.50;
                revenusImposables = Math.max(0, revenuFoncier - abattement);
                break;

            /* ------------------------------------------------------------------ */
            case 'lmnp-reel':
            case 'lmp-reel':
                // Déduction des charges réelles **et** des amortissements
                // Revenu imposable = loyers bruts  –  (intérêts + charges + amortissements)
                amortissement     = this.calculerAmortissementAnnuel(regimeFiscal);
                chargesDeduites   = interetsEmprunt + charges + amortissement;
                revenusImposables = Math.max(0, revenuFoncier - chargesDeduites);
                break;

            /* ------------------------------------------------------------------ */
            case 'sci-is':   // SCI, SAS ou SARL imposée à l'IS
            case 'sas-is':
            case 'sarl-is':
                // À l'IS, on calcule un **résultat fiscal société**
                amortissement = this.calculerAmortissementAnnuel(regimeFiscal);
                const resultatIS = revenuFoncier - (interetsEmprunt + charges + amortissement);
                
                // Calculer l'IS directement ici
                const tauxIS = this.params.fiscalite.tauxIS || 25; // Taux par défaut à 25%
                const impotIS = Math.max(0, resultatIS) * (tauxIS / 100);
                
                return {
                    type: 'IS',
                    revenuFoncier: revenuFoncier,
                    charges: charges,
                    interets: interetsEmprunt,
                    amortissement: amortissement,
                    resultatAvantIS: resultatIS,
                    impot: impotIS,
                    resultatApresIS: Math.max(0, resultatIS - impotIS),
                    // Pour compatibilité avec le reste du code
                    abattement: 0,
                    chargesDeduites: interetsEmprunt + charges + amortissement,
                    revenusImposables: resultatIS
                };

            /* ------------------------------------------------------------------ */
            default:
                // Par défaut on se contente du revenu foncier net
                revenusImposables = Math.max(0, revenuFoncier);
        }
        
        // Calcul de l'impôt pour les régimes IR (hors IS)
        const baseIR = revenusImposables * (this.params.fiscalite.tauxMarginalImpot / 100);
        const basePS = revenusImposables * (this.params.fiscalite.tauxPrelevementsSociaux / 100);
        const impot = baseIR + basePS;
        
        // Log du résultat
        console.log("Résultat fiscal:", {
            revenuFoncier,
            abattement,
            chargesDeduites,
            amortissement,
            revenusImposables,
            impot
        });
        
        return {
            type: 'IR',
            revenuFoncier: revenuFoncier,
            abattement: abattement,
            chargesDeduites: chargesDeduites,
            amortissement: amortissement,
            revenusImposables: revenusImposables,
            impot: impot,
            revenuNet: revenuFoncier - impot
        };
    };
    
    // 5. Étendre la méthode de mise à jour de l'affichage fiscal
    const originalMettreAJourElementsFiscauxParMode = ImmoExtensions.mettreAJourElementsFiscauxParMode;
    
    ImmoExtensions.mettreAJourElementsFiscauxParMode = function(mode, resultats, regimeLabel) {
        // S'assurer que les résultats sont valides
        if (!resultats || !resultats.fiscalDetail) {
            console.warn(`Données fiscales manquantes pour le mode ${mode}`);
            return;
        }
        
        // Sécuriser les données fiscales pour éviter les NaN
        const fiscal = resultats.fiscalDetail || {};
        
        // Sécuriser l'impact fiscal
        const impactFiscal = Number(resultats.impactFiscal) || 0;
        
        // Sécuriser le cashflow
        const cashFlow = Number(resultats.cashFlow) || 0;
        const cashFlowApresImpot = cashFlow + (impactFiscal / 12);
        
        // Vérifier si les éléments DOM existent
        const fiscalInfo = document.getElementById(`${mode}-fiscal-info`);
        
        // Adapter l'explication selon le régime fiscal
        let explanation = '';
        if (regimeLabel.includes('SCI') || regimeLabel.includes('SAS') || regimeLabel.includes('SARL')) {
            explanation = `Avec une ${regimeLabel.split(' ')[0]}, l'imposition se fait à l'Impôt sur les Sociétés (IS). 
                Les revenus locatifs sont soumis à l'IS après déduction des charges et amortissements. 
                Le taux d'IS est de ${simulateur.params.fiscalite.tauxIS || 25}%.`;
        } else {
            switch(regimeLabel.split(' ')[0]) {
                case 'Micro-foncier':
                    explanation = `Avec le régime micro-foncier, un abattement forfaitaire de 30% est appliqué sur les loyers bruts. 
                    Seuls 70% des revenus locatifs sont soumis à l'impôt sur le revenu et aux prélèvements sociaux.`;
                    break;
                case 'Régime':
                    explanation = `Le régime réel permet de déduire toutes les charges réelles (intérêts d'emprunt, taxe foncière, etc.) 
                    des revenus locatifs. Il est généralement plus avantageux quand les charges dépassent 30% des loyers.`;
                    break;
                case 'LMNP':
                    if (regimeLabel.includes('micro-BIC')) {
                        explanation = `Le régime LMNP micro-BIC offre un abattement forfaitaire de 50% sur les loyers des locations meublées. 
                        C'est souvent plus avantageux que le micro-foncier pour une location nue.`;
                    } else {
                        explanation = `Le LMNP au réel permet de déduire l'amortissement du bien (généralement sur 20-30 ans), 
                        ce qui réduit considérablement l'impôt, voire permet de ne pas en payer pendant plusieurs années.`;
                    }
                    break;
            }
        }
        
        // Si l'élément n'existe pas, le créer
        if (!fiscalInfo) {
            // Trouver le conteneur de résultats
            const resultsCard = document.querySelector(`.results-card:has(#${mode}-budget-max) .results-body`);
            if (!resultsCard) return;
            
            // Créer un nouveau div pour les informations fiscales
            const fiscalDiv = document.createElement('div');
            fiscalDiv.className = 'fiscal-info mt-4';
            fiscalDiv.id = `${mode}-fiscal-info`;
            
            // Générer le HTML en fonction du type de régime (IS ou IR)
            if (fiscal.type === 'IS') {
                fiscalDiv.innerHTML = `
                    <h4>
                        Impact fiscal
                        <span class="fiscal-badge">${regimeLabel}</span>
                    </h4>
                    <div class="fiscal-explanation">
                        ${explanation}
                    </div>
                    <table class="comparison-table">
                        <tr>
                            <td>Revenu locatif annuel</td>
                            <td>${formaterMontant(fiscal.revenuFoncier)}</td>
                        </tr>
                        <tr>
                            <td>Charges déductibles</td>
                            <td>- ${formaterMontant(fiscal.charges + fiscal.interets)}</td>
                        </tr>
                        <tr>
                            <td>Amortissement</td>
                            <td>- ${formaterMontant(fiscal.amortissement)}</td>
                        </tr>
                        <tr>
                            <td>Résultat avant IS</td>
                            <td id="${mode}-revenu-imposable">${formaterMontant(fiscal.resultatAvantIS)}</td>
                        </tr>
                        <tr>
                            <td>Impôt sur les Sociétés</td>
                            <td id="${mode}-impact-fiscal" class="negative">
                                ${formaterMontant(fiscal.impot)}
                            </td>
                        </tr>
                        <tr>
                            <td>Résultat après IS</td>
                            <td id="${mode}-resultat-is" class="${fiscal.resultatApresIS >= 0 ? 'positive' : 'negative'}">
                                ${formaterMontant(fiscal.resultatApresIS)}
                            </td>
                        </tr>
                        <tr>
                            <td>Cash-flow après impôt</td>
                            <td id="${mode}-cashflow-apres-impot" class="${cashFlowApresImpot >= 0 ? 'positive' : 'negative'}">
                                ${formaterMontantMensuel(cashFlowApresImpot)}
                            </td>
                        </tr>
                    </table>
                `;
            } else {
                // HTML pour les régimes IR (original)
                fiscalDiv.innerHTML = `
                    <h4>
                        Impact fiscal
                        <span class="fiscal-badge">${regimeLabel}</span>
                    </h4>
                    <div class="fiscal-explanation">
                        ${explanation}
                    </div>
                    <table class="comparison-table">
                        <tr>
                            <td>Revenu foncier annuel</td>
                            <td>${formaterMontant(fiscal.revenuFoncier)}</td>
                        </tr>
                        ${fiscal.abattement > 0 ? `
                        <tr>
                            <td>Abattement forfaitaire</td>
                            <td>- ${formaterMontant(fiscal.abattement)}</td>
                        </tr>
                        ` : ''}
                        ${fiscal.chargesDeduites > 0 ? `
                        <tr>
                            <td>Charges déductibles</td>
                            <td>- ${formaterMontant(fiscal.chargesDeduites)}</td>
                        </tr>
                        ` : ''}
                        ${fiscal.amortissement > 0 ? `
                        <tr>
                            <td>Amortissement</td>
                            <td>- ${formaterMontant(fiscal.amortissement)}</td>
                        </tr>
                        ` : ''}
                        <tr>
                            <td>Revenu imposable</td>
                            <td id="${mode}-revenu-imposable">${formaterMontant(fiscal.revenusImposables)}</td>
                        </tr>
                        <tr>
                            <td>Impact fiscal annuel</td>
                            <td id="${mode}-impact-fiscal" class="${impactFiscal >= 0 ? 'positive' : 'negative'}">
                                ${formaterMontant(impactFiscal)}
                            </td>
                        </tr>
                        <tr>
                            <td>Cash-flow après impôt</td>
                            <td id="${mode}-cashflow-apres-impot" class="${cashFlowApresImpot >= 0 ? 'positive' : 'negative'}">
                                ${formaterMontantMensuel(cashFlowApresImpot)}
                            </td>
                        </tr>
                    </table>
                `;
            }
            
            // Ajouter à la carte de résultats
            resultsCard.appendChild(fiscalDiv);
        } else {
            // Si l'élément existe, mettre à jour son contenu
            fiscalInfo.querySelector('h4 .fiscal-badge').textContent = regimeLabel;
            
            // Mettre à jour l'explication
            const explanationElem = fiscalInfo.querySelector('.fiscal-explanation');
            if (explanationElem) {
                explanationElem.innerHTML = explanation;
            } else {
                const newExplanation = document.createElement('div');
                newExplanation.className = 'fiscal-explanation';
                newExplanation.innerHTML = explanation;
                fiscalInfo.insertBefore(newExplanation, fiscalInfo.querySelector('table'));
            }
            
            const table = fiscalInfo.querySelector('table');
            
            // Mettre à jour le tableau selon le type de régime
            if (fiscal.type === 'IS') {
                table.innerHTML = `
                    <tr>
                        <td>Revenu locatif annuel</td>
                        <td>${formaterMontant(fiscal.revenuFoncier)}</td>
                    </tr>
                    <tr>
                        <td>Charges déductibles</td>
                        <td>- ${formaterMontant(fiscal.charges + fiscal.interets)}</td>
                    </tr>
                    <tr>
                        <td>Amortissement</td>
                        <td>- ${formaterMontant(fiscal.amortissement)}</td>
                    </tr>
                    <tr>
                        <td>Résultat avant IS</td>
                        <td id="${mode}-revenu-imposable">${formaterMontant(fiscal.resultatAvantIS)}</td>
                    </tr>
                    <tr>
                        <td>Impôt sur les Sociétés</td>
                        <td id="${mode}-impact-fiscal" class="negative">
                            ${formaterMontant(fiscal.impot)}
                        </td>
                    </tr>
                    <tr>
                        <td>Résultat après IS</td>
                        <td id="${mode}-resultat-is" class="${fiscal.resultatApresIS >= 0 ? 'positive' : 'negative'}">
                            ${formaterMontant(fiscal.resultatApresIS)}
                        </td>
                    </tr>
                    <tr>
                        <td>Cash-flow après impôt</td>
                        <td id="${mode}-cashflow-apres-impot" class="${cashFlowApresImpot >= 0 ? 'positive' : 'negative'}">
                            ${formaterMontantMensuel(cashFlowApresImpot)}
                        </td>
                    </tr>
                `;
            } else {
                // HTML pour les régimes IR (original)
                table.innerHTML = `
                    <tr>
                        <td>Revenu foncier annuel</td>
                        <td>${formaterMontant(fiscal.revenuFoncier)}</td>
                    </tr>
                    ${fiscal.abattement > 0 ? `
                    <tr>
                        <td>Abattement forfaitaire</td>
                        <td>- ${formaterMontant(fiscal.abattement)}</td>
                    </tr>
                    ` : ''}
                    ${fiscal.chargesDeduites > 0 ? `
                    <tr>
                        <td>Charges déductibles</td>
                        <td>- ${formaterMontant(fiscal.chargesDeduites)}</td>
                    </tr>
                    ` : ''}
                    ${fiscal.amortissement > 0 ? `
                    <tr>
                        <td>Amortissement</td>
                        <td>- ${formaterMontant(fiscal.amortissement)}</td>
                    </tr>
                    ` : ''}
                    <tr>
                        <td>Revenu imposable</td>
                        <td id="${mode}-revenu-imposable">${formaterMontant(fiscal.revenusImposables)}</td>
                    </tr>
                    <tr>
                        <td>Impact fiscal annuel</td>
                        <td id="${mode}-impact-fiscal" class="${impactFiscal >= 0 ? 'positive' : 'negative'}">
                            ${formaterMontant(impactFiscal)}
                        </td>
                    </tr>
                    <tr>
                        <td>Cash-flow après impôt</td>
                        <td id="${mode}-cashflow-apres-impot" class="${cashFlowApresImpot >= 0 ? 'positive' : 'negative'}">
                            ${formaterMontantMensuel(cashFlowApresImpot)}
                        </td>
                    </tr>
                `;
            }
        }
    };
    
    // Fonction utilitaire pour formater les montants
    function formaterMontant(montant, decimales = 0) {
        // Si la fonction existe déjà, l'utiliser
        if (window.formaterMontant && typeof window.formaterMontant === 'function') {
            return window.formaterMontant(montant, decimales);
        }
        
        // Sinon, utiliser notre propre implémentation
        try {
            return new Intl.NumberFormat('fr-FR', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: decimales,
                maximumFractionDigits: decimales
            }).format(montant);
        } catch (e) {
            // Fallback simple en cas d'erreur
            return montant.toFixed(decimales) + ' €';
        }
    }
    
    // Fonction utilitaire pour formater les montants mensuels
    function formaterMontantMensuel(montant) {
        // Si la fonction existe déjà, l'utiliser
        if (window.formaterMontantMensuel && typeof window.formaterMontantMensuel === 'function') {
            return window.formaterMontantMensuel(montant);
        }
        return formaterMontant(montant) + '/mois';
    }
    
    // Ajouter la propriété manquante à ImmoExtensions
    ImmoExtensions.mettreAJourElementsFiscauxParMode = ImmoExtensions.mettreAJourElementsFiscauxParMode || function() {};
    
    // Informer l'utilisateur que l'extension est chargée
    console.log("Extension sociétés pour le simulateur immobilier chargée avec succès");
    if (window.afficherToast && typeof window.afficherToast === 'function') {
        window.afficherToast("Extension SCI/SAS/SARL chargée avec succès", "success");
    }
}
