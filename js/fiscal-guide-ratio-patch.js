// Patch pour fiscal-guide.js - Corriger l'affichage du ratio
// Remplacer les lignes correspondantes dans showCalculationDetails()

// Ajouter au début de showCalculationDetails après la déclaration de formatPercent:
const ratioSalaire = parseFloat(document.getElementById('sim-salaire').value) / 100 || 0.7;

// Pour les statuts IS avec dividendes (SASU, SAS, SA, SELAS), remplacer:
`
                <tr>
                    <td>Ratio rémunération/dividendes (manuel)</td>
                    <td>${formatPercent(ratioSalaire * 100)} / ${formatPercent((100 - ratioSalaire * 100))}</td>
                </tr>
`

// Pour les statuts TNS à l'IS (EURL-IS, SARL, SELARL, SCA), remplacer:
`
                <tr>
                    <td>Ratio rémunération/dividendes (manuel)</td>
                    <td>${formatPercent(ratioSalaire * 100)} / ${formatPercent((100 - ratioSalaire * 100))}</td>
                </tr>
`

// Pour les statuts à l'IR (EI, EURL-IR, SNC), ajouter après "Données de base":
`
                <tr>
                    <td>Ratio rémunération/dividendes</td>
                    <td>100% / 0% (IR - pas de dividendes)</td>
                </tr>
`