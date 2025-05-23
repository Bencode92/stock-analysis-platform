/**
 * cashflow-detailed-table.js - Génère le tableau comparatif détaillé avec calcul du cash-flow
 */

function genererTableauComparatifDetaille(resultats) {
    const { classique, encheres } = resultats;
    
    if (!classique || !encheres) return '';
    
    // Calcul des valeurs dérivées
    const vacanceClassique = classique.loyerBrut - classique.loyerNet;
    const vacanceEncheres = encheres.loyerBrut - encheres.loyerNet;
    
    const chargesClassique = classique.mensualite + (classique.taxeFonciere/12) + 
                            (classique.chargesNonRecuperables/12) + 
                            (classique.entretienAnnuel/12) + 
                            (classique.assurancePNO/12);
    
    const chargesEncheres = encheres.mensualite + (encheres.taxeFonciere/12) + 
                           (encheres.chargesNonRecuperables/12) + 
                           (encheres.entretienAnnuel/12) + 
                           (encheres.assurancePNO/12);
    
    return `
        <table class="tableau-comparatif-detaille">
            <thead>
                <tr>
                    <th style="width: 40%">CRITÈRE</th>
                    <th style="width: 20%">ACHAT CLASSIQUE</th>
                    <th style="width: 20%">VENTE AUX ENCHÈRES</th>
                    <th style="width: 20%">DIFFÉRENCE</th>
                </tr>
            </thead>
            <tbody>
                <!-- COÛTS D'ACQUISITION -->
                <tr class="category-header">
                    <td colspan="4">📊 COÛTS D'ACQUISITION</td>
                </tr>
                <tr>
                    <td class="label">Prix d'achat</td>
                    <td class="value">${formaterMontant(classique.prixAchat)}</td>
                    <td class="value">${formaterMontant(encheres.prixAchat)}</td>
                    <td class="value difference ${encheres.prixAchat < classique.prixAchat ? 'positive' : 'negative'}">
                        ${formaterMontantAvecSigne(encheres.prixAchat - classique.prixAchat)}
                    </td>
                </tr>
                <tr>
                    <td class="label">Frais de notaire / Droits</td>
                    <td class="value">${formaterMontant(classique.fraisNotaire || 0)}</td>
                    <td class="value">${formaterMontant((encheres.droitsEnregistrement || 0) + (encheres.emolumentsPoursuivant || 0))}</td>
                    <td class="value difference ${(encheres.droitsEnregistrement + encheres.emolumentsPoursuivant) > classique.fraisNotaire ? 'negative' : 'positive'}">
                        ${formaterMontantAvecSigne((encheres.droitsEnregistrement + encheres.emolumentsPoursuivant) - classique.fraisNotaire)}
                    </td>
                </tr>
                <tr>
                    <td class="label">Commission / Honoraires avocat</td>
                    <td class="value">${formaterMontant(classique.commission || 0)}</td>
                    <td class="value">${formaterMontant((encheres.honorairesAvocat || 0) + (encheres.fraisDivers || 0))}</td>
                    <td class="value difference ${(encheres.honorairesAvocat + encheres.fraisDivers) < classique.commission ? 'positive' : 'negative'}">
                        ${formaterMontantAvecSigne((encheres.honorairesAvocat + encheres.fraisDivers) - classique.commission)}
                    </td>
                </tr>
                <tr>
                    <td class="label">Travaux (0,5% du prix)</td>
                    <td class="value">${formaterMontant(classique.travaux)}</td>
                    <td class="value">${formaterMontant(encheres.travaux)}</td>
                    <td class="value difference ${encheres.travaux < classique.travaux ? 'positive' : 'negative'}">
                        ${formaterMontantAvecSigne(encheres.travaux - classique.travaux)}
                    </td>
                </tr>
                <tr>
                    <td class="label">Frais bancaires</td>
                    <td class="value">${formaterMontant(classique.fraisBancaires)}</td>
                    <td class="value">${formaterMontant(encheres.fraisBancaires)}</td>
                    <td class="value difference ${encheres.fraisBancaires < classique.fraisBancaires ? 'positive' : 'negative'}">
                        ${formaterMontantAvecSigne(encheres.fraisBancaires - classique.fraisBancaires)}
                    </td>
                </tr>
                <tr class="subtotal">
                    <td class="label">Budget total</td>
                    <td class="value">${formaterMontant(classique.coutTotal)}</td>
                    <td class="value">${formaterMontant(encheres.coutTotal)}</td>
                    <td class="value difference ${encheres.coutTotal < classique.coutTotal ? 'positive' : 'negative'}">
                        ${formaterMontantAvecSigne(encheres.coutTotal - classique.coutTotal)}
                    </td>
                </tr>
                
                <!-- FINANCEMENT -->
                <tr class="category-header">
                    <td colspan="4">🏦 FINANCEMENT</td>
                </tr>
                <tr>
                    <td class="label">Apport</td>
                    <td class="value">${formaterMontant(window.simulateur?.params.base.apport || 20000)}</td>
                    <td class="value">${formaterMontant(window.simulateur?.params.base.apport || 20000)}</td>
                    <td class="value difference">0 €</td>
                </tr>
                <tr>
                    <td class="label">Emprunt</td>
                    <td class="value">${formaterMontant(classique.emprunt)}</td>
                    <td class="value">${formaterMontant(encheres.emprunt)}</td>
                    <td class="value difference ${encheres.emprunt < classique.emprunt ? 'positive' : 'negative'}">
                        ${formaterMontantAvecSigne(encheres.emprunt - classique.emprunt)}
                    </td>
                </tr>
                <tr>
                    <td class="label">Mensualité (${window.simulateur?.params.base.duree || 20} ans à ${window.simulateur?.params.base.taux || 3.5}%)</td>
                    <td class="value negative">${formaterMontantMensuel(-classique.mensualite)}</td>
                    <td class="value negative">${formaterMontantMensuel(-encheres.mensualite)}</td>
                    <td class="value difference positive">
                        ${formaterMontantAvecSigne(classique.mensualite - encheres.mensualite)}
                    </td>
                </tr>
                
                <!-- REVENUS -->
                <tr class="category-header">
                    <td colspan="4">💰 REVENUS LOCATIFS</td>
                </tr>
                <tr>
                    <td class="label">Surface acquise</td>
                    <td class="value">${classique.surface.toFixed(1)} m²</td>
                    <td class="value">${encheres.surface.toFixed(1)} m²</td>
                    <td class="value difference ${encheres.surface > classique.surface ? 'positive' : 'negative'}">
                        ${(encheres.surface - classique.surface).toFixed(1)} m²
                    </td>
                </tr>
                <tr>
                    <td class="label">Loyer brut (${classique.loyerM2.toFixed(0)}€/m²)</td>
                    <td class="value positive">+${formaterMontant(classique.loyerBrut)}</td>
                    <td class="value positive">+${formaterMontant(encheres.loyerBrut)}</td>
                    <td class="value difference ${encheres.loyerBrut > classique.loyerBrut ? 'positive' : 'negative'}">
                        ${formaterMontantAvecSigne(encheres.loyerBrut - classique.loyerBrut)}
                    </td>
                </tr>
                <tr>
                    <td class="label">Vacance locative (${window.simulateur?.params.communs.vacanceLocative || 5}%)</td>
                    <td class="value negative">${formaterMontant(-vacanceClassique)}</td>
                    <td class="value negative">${formaterMontant(-vacanceEncheres)}</td>
                    <td class="value difference positive">
                        ${formaterMontantAvecSigne(vacanceClassique - vacanceEncheres)}
                    </td>
                </tr>
                <tr class="subtotal">
                    <td class="label">Loyer net mensuel</td>
                    <td class="value positive">+${formaterMontant(classique.loyerNet)}</td>
                    <td class="value positive">+${formaterMontant(encheres.loyerNet)}</td>
                    <td class="value difference ${encheres.loyerNet > classique.loyerNet ? 'positive' : 'negative'}">
                        ${formaterMontantAvecSigne(encheres.loyerNet - classique.loyerNet)}
                    </td>
                </tr>
                
                <!-- CHARGES MENSUELLES -->
                <tr class="category-header">
                    <td colspan="4">📉 CHARGES MENSUELLES</td>
                </tr>
                <tr>
                    <td class="label">Mensualité du prêt</td>
                    <td class="value negative">${formaterMontant(-classique.mensualite)}</td>
                    <td class="value negative">${formaterMontant(-encheres.mensualite)}</td>
                    <td class="value difference positive">
                        ${formaterMontantAvecSigne(classique.mensualite - encheres.mensualite)}
                    </td>
                </tr>
                <tr>
                    <td class="label">Taxe foncière (5% loyer/an ÷ 12)</td>
                    <td class="value negative">${formaterMontant(-classique.taxeFonciere/12)}</td>
                    <td class="value negative">${formaterMontant(-encheres.taxeFonciere/12)}</td>
                    <td class="value difference positive">
                        ${formaterMontantAvecSigne((classique.taxeFonciere - encheres.taxeFonciere)/12)}
                    </td>
                </tr>
                <tr>
                    <td class="label">Charges copro (30€/m²/an ÷ 12)</td>
                    <td class="value negative">${formaterMontant(-classique.chargesNonRecuperables/12)}</td>
                    <td class="value negative">${formaterMontant(-encheres.chargesNonRecuperables/12)}</td>
                    <td class="value difference positive">
                        ${formaterMontantAvecSigne((classique.chargesNonRecuperables - encheres.chargesNonRecuperables)/12)}
                    </td>
                </tr>
                <tr>
                    <td class="label">Entretien (0,5% prix/an ÷ 12)</td>
                    <td class="value negative">${formaterMontant(-classique.entretienAnnuel/12)}</td>
                    <td class="value negative">${formaterMontant(-encheres.entretienAnnuel/12)}</td>
                    <td class="value difference positive">
                        ${formaterMontantAvecSigne((classique.entretienAnnuel - encheres.entretienAnnuel)/12)}
                    </td>
                </tr>
                <tr>
                    <td class="label">Assurance PNO (250€/an ÷ 12)</td>
                    <td class="value negative">${formaterMontant(-classique.assurancePNO/12)}</td>
                    <td class="value negative">${formaterMontant(-encheres.assurancePNO/12)}</td>
                    <td class="value difference">0 €</td>
                </tr>
                <tr class="subtotal">
                    <td class="label">Total charges mensuelles</td>
                    <td class="value negative">${formaterMontant(-chargesClassique)}</td>
                    <td class="value negative">${formaterMontant(-chargesEncheres)}</td>
                    <td class="value difference positive">
                        ${formaterMontantAvecSigne(chargesClassique - chargesEncheres)}
                    </td>
                </tr>
                
                <!-- RÉSULTATS -->
                <tr class="total">
                    <td class="label">Cash-flow mensuel</td>
                    <td class="value ${getClasseValeur(classique.cashFlow)}">${formaterMontantAvecSigne(classique.cashFlow)}</td>
                    <td class="value ${getClasseValeur(encheres.cashFlow)}">${formaterMontantAvecSigne(encheres.cashFlow)}</td>
                    <td class="value difference ${encheres.cashFlow > classique.cashFlow ? 'positive' : 'negative'}">
                        ${formaterMontantAvecSigne(encheres.cashFlow - classique.cashFlow)}
                    </td>
                </tr>
                <tr class="final-cashflow">
                    <td class="label">Cash-flow annuel</td>
                    <td class="value ${getClasseValeur(classique.cashFlow)}">${formaterMontantAvecSigne(classique.cashFlow * 12)}</td>
                    <td class="value ${getClasseValeur(encheres.cashFlow)}">${formaterMontantAvecSigne(encheres.cashFlow * 12)}</td>
                    <td class="value difference ${encheres.cashFlow > classique.cashFlow ? 'positive' : 'negative'}">
                        ${formaterMontantAvecSigne((encheres.cashFlow - classique.cashFlow) * 12)}
                    </td>
                </tr>
                <tr>
                    <td class="label">Rentabilité nette</td>
                    <td class="value">${formaterPourcentage(classique.rendementNet)}</td>
                    <td class="value">${formaterPourcentage(encheres.rendementNet)}</td>
                    <td class="value difference ${encheres.rendementNet > classique.rendementNet ? 'positive' : 'negative'}">
                        ${formaterPourcentage(encheres.rendementNet - classique.rendementNet)}
                    </td>
                </tr>
            </tbody>
        </table>
    `;
}

// Exporter la fonction
window.genererTableauComparatifDetaille = genererTableauComparatifDetaille;
