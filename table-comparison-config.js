// table-comparison-config.js
// Configuration du tableau comparatif pour le simulateur immobilier
// Permet de gérer facilement l'affichage et les calculs du tableau de comparaison

const COMPARISON_TABLE_CONFIG = [
    {
        section: "💰 COÛTS D'ACQUISITION",
        rows: [
            { 
                key: 'prixAchat', 
                label: "Prix d'achat", 
                isCost: true 
            },
            { 
                key: 'fraisNotaire', 
                label: 'Frais de notaire / Droits', 
                isCost: true,
                altKey: { encheres: 'droitsEnregistrement' }
            },
            { 
                key: 'commission', 
                label: 'Commission / Honoraires avocat', 
                isCost: true,
                altKey: { encheres: 'honorairesTotal' }
            },
            { 
                key: 'travaux', 
                label: 'Travaux de rénovation', 
                isCost: true 
            },
            { 
                key: 'fraisBancaires', 
                label: 'Frais bancaires', 
                isCost: true 
            }
        ],
        totalRow: { 
            key: 'coutTotal', 
            label: 'Budget total nécessaire' 
        }
    },
    {
        section: "🏦 FINANCEMENT",
        rows: [
            { 
                key: 'apport', 
                label: 'Votre apport personnel', 
                isCost: false, 
                noCompare: true 
            },
            { 
                key: 'emprunt', 
                label: 'Montant emprunté', 
                isCost: true 
            },
            { 
                key: 'mensualite', 
                label: 'Remboursement mensuel', 
                isCost: true, 
                unit: '/mois' 
            }
        ]
    },
    {
        section: "💵 REVENUS LOCATIFS",
        rows: [
            { 
                key: 'surface', 
                label: 'Surface que vous pouvez acheter', 
                isCost: false, 
                unit: 'm²' 
            },
            { 
                key: 'loyerBrut', 
                label: 'Loyer mensuel (avant charges)', 
                isCost: false,
                unit: '/mois'
            },
            { 
                key: 'vacance', 
                label: 'Provision logement vide', 
                isCost: true,
                calculate: (data) => data.loyerBrut - data.loyerNet,
                unit: '/mois'
            },
            { 
                key: 'loyerNet', 
                label: 'Loyer net mensuel', 
                isCost: false,
                unit: '/mois'
            }
        ]
    },
    {
        section: "📊 VOS DÉPENSES MENSUELLES",
        rows: [
            { 
                key: 'mensualite', 
                label: 'Remboursement du prêt', 
                isCost: true, 
                duplicate: true,
                unit: '/mois'
            },
            { 
                key: 'taxeFonciere', 
                label: 'Taxe foncière (par mois)', 
                isCost: true,
                transform: (val) => val / 12,
                unit: '/mois'
            },
            { 
                key: 'chargesNonRecuperables', 
                label: 'Charges de copropriété', 
                isCost: true,
                transform: (val) => val / 12,
                unit: '/mois'
            },
            { 
                key: 'entretienAnnuel', 
                label: 'Budget entretien', 
                isCost: true,
                transform: (val) => val / 12,
                unit: '/mois'
            },
            { 
                key: 'assurancePNO', 
                label: 'Assurance propriétaire', 
                isCost: true,
                transform: (val) => val / 12,
                unit: '/mois'
            }
        ],
        totalRow: { 
            key: 'totalCharges', 
            label: 'Total de vos dépenses',
            calculate: (data) => {
                const taxe = (data.taxeFonciere || 0) / 12;
                const charges = (data.chargesNonRecuperables || 0) / 12;
                const entretien = (data.entretienAnnuel || 0) / 12;
                const assurance = (data.assurancePNO || 0) / 12;
                return data.mensualite + taxe + charges + entretien + assurance;
            },
            unit: '/mois'
        }
    },
    {
        section: "💰 RÉSULTAT",
        rows: [
            { 
                key: 'cashFlow', 
                label: 'Cash-flow avant impôts', 
                isCost: false,
                unit: '/mois'
            },
            { 
                key: 'cashFlowAnnuel', 
                label: 'Gain annuel après impôts théorique', 
                isCost: false
            },
            { 
                key: 'rendementNet', 
                label: 'Rendement de votre investissement', 
                isCost: false, 
                unit: '%', 
                isPercentage: true 
            }
        ]
    }
];

// Export pour compatibilité avec d'autres modules si nécessaire
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { COMPARISON_TABLE_CONFIG };
}