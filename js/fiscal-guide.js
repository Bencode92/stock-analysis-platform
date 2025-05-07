    // Icônes pour les statuts juridiques
    const statutIcons = {
        'MICRO': '<i class="fas fa-store-alt text-green-400 mr-2"></i>',
        'EI': '<i class="fas fa-user text-green-400 mr-2"></i>',
        'EURL': '<i class="fas fa-user-tie text-green-400 mr-2"></i>',
        'SASU': '<i class="fas fa-user-shield text-blue-400 mr-2"></i>',
        'SARL': '<i class="fas fa-users text-blue-400 mr-2"></i>',
        'SAS': '<i class="fas fa-building text-blue-400 mr-2"></i>',
        'SA': '<i class="fas fa-landmark text-blue-400 mr-2"></i>',
        'SNC': '<i class="fas fa-handshake text-green-400 mr-2"></i>',
        'SCI': '<i class="fas fa-home text-green-400 mr-2"></i>',
        'SELARL': '<i class="fas fa-user-md text-blue-400 mr-2"></i>',
        'SELAS': '<i class="fas fa-stethoscope text-blue-400 mr-2"></i>',
        'SCA': '<i class="fas fa-chart-line text-blue-400 mr-2"></i>'
    };
 // Badge régime fiscal
    const regimeBadges = {
        'MICRO': '<span class="status-badge ir">IR</span>',
        'EI': '<span class="status-badge ir">IR</span>',
        'EURL': '<span class="status-badge iris">IR/IS</span>',
        'SASU': '<span class="status-badge is">IS</span>',
        'SARL': '<span class="status-badge is">IS</span>',
        'SAS': '<span class="status-badge is">IS</span>',
        'SA': '<span class="status-badge is">IS</span>',
        'SNC': '<span class="status-badge ir">IR</span>',
        'SCI': '<span class="status-badge ir">IR</span>',
        'SELARL': '<span class="status-badge is">IS</span>',
        'SELAS': '<span class="status-badge is">IS</span>',
        'SCA': '<span class="status-badge is">IS</span>'
    };
    
    // Générer l'accordéon pour chaque statut
    statuts.forEach(statutId => {
        const nomStatut = window.legalStatuses && window.legalStatuses[statutId] 
            ? window.legalStatuses[statutId].name 
            : getDefaultNomStatut(statutId);
        
        // Créer l'élément d'accordéon
        const accordionItem = document.createElement('div');
        accordionItem.className = 'mb-3';
        
        // Contenu de l'accordéon basé sur le statut
        accordionItem.innerHTML = `
            <button class="accordion-toggle w-full">
                ${statutIcons[statutId] || ''} ${nomStatut} 
                ${regimeBadges[statutId] || ''}
                <i class="fas fa-plus ml-auto"></i>
            </button>
            <div class="hidden px-4 py-3 border-t border-gray-700 bg-blue-900 bg-opacity-20 rounded-b-lg">
                ${getStatutFiscalInfo(statutId)}
            </div>
        `;
        
        accordionContainer.appendChild(accordionItem);
    });
    
    // Attacher les événements aux boutons de l'accordéon
    const toggleBtns = document.querySelectorAll('.accordion-toggle');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const content = this.nextElementSibling;
            content.classList.toggle('hidden');
            
            // Changer l'icône
            const icon = this.querySelector('i:last-child');
            icon.classList.toggle('fa-plus');
            icon.classList.toggle('fa-minus');
            
            // Ajouter/supprimer la classe active
            this.classList.toggle('active');
        });
    });
}

// Fonction d'aide pour obtenir le nom par défaut si legalStatuses n'est pas disponible
function getDefaultNomStatut(statutId) {
    const noms = {
        'MICRO': 'Micro-entreprise',
        'EI': 'Entreprise Individuelle',
        'EURL': 'Entreprise Unipersonnelle à Responsabilité Limitée',
        'SASU': 'Société par Actions Simplifiée Unipersonnelle',
        'SARL': 'Société à Responsabilité Limitée',
        'SAS': 'Société par Actions Simplifiée',
        'SA': 'Société Anonyme',
        'SNC': 'Société en Nom Collectif',
        'SCI': 'Société Civile Immobilière',
        'SELARL': 'Société d\'Exercice Libéral à Responsabilité Limitée',
        'SELAS': 'Société d\'Exercice Libéral par Actions Simplifiée',
        'SCA': 'Société en Commandite par Actions'
    };
    return noms[statutId] || statutId;
}

// Fonction pour générer les informations fiscales de chaque statut
function getStatutFiscalInfo(statutId) {
    // Informations fiscales par défaut pour chaque statut
    const infosFiscales = {
        'MICRO': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR avec abattement forfaitaire</p>
            <p class="mb-2"><strong>Abattements :</strong> 71% (vente), 50% (services BIC), 34% (BNC)</p>
            <p class="mb-2"><strong>Charges sociales :</strong> 12.3% (vente), 21.2% (services), 24.6% (BNC)</p>
            <p class="mb-2"><strong>Versement libératoire :</strong> 1% (vente), 1,7% (services), 2,2% (BNC) sur CA</p>
            <p class="mb-2"><strong>Plafonds 2025 :</strong> 188 700€ (vente) / 77 700€ (services)</p>
        `,
        'EI': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR, imposition sur le bénéfice</p>
            <p class="mb-2"><strong>Cotisations sociales :</strong> ~45% du bénéfice</p>
            <p class="mb-2"><strong>Avantages :</strong> Simplicité de gestion, frais réels déductibles</p>
            <p class="mb-2"><strong>Inconvénients :</strong> Pas de distinction entre patrimoine privé/pro</p>
        `,
        'EURL': `
            <p class="mb-2"><strong>Régimes fiscaux possibles :</strong> IR par défaut ou option IS</p>
            <p class="mb-2"><strong>IR :</strong> Imposition sur la totalité du bénéfice</p>
            <p class="mb-2"><strong>IS :</strong> Impôt sur les sociétés + PFU sur dividendes</p>
            <p class="mb-2"><strong>Cotisations sociales :</strong> Environ 45% de la rémunération du gérant (TNS)</p>
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
        `,
        'SASU': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS uniquement</p>
            <p class="mb-2"><strong>Social :</strong> Président assimilé salarié</p>
            <p class="mb-2"><strong>Cotisations :</strong> ~80% sur rémunération (22% salariales, 55% patronales)</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS (15%/25%) + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Optimisation:</strong> Favoriser les dividendes</p>
        `,
        'SARL': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS presque toujours</p>
            <p class="mb-2"><strong>Social gérant majoritaire :</strong> TNS (~45% de cotisations)</p>
            <p class="mb-2"><strong>Social gérant minoritaire :</strong> Assimilé salarié (~80%)</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
        `,
        'SAS': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS (impôt sur les sociétés)</p>
            <p class="mb-2"><strong>Social :</strong> Président assimilé salarié</p>
            <p class="mb-2"><strong>Cotisations :</strong> ~80% sur rémunération (22% salariales, 55% patronales)</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS (15%/25%) + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Capital minimal :</strong> Libre (1€ suffit)</p>
        `,
        'SA': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS (impôt sur les sociétés)</p>
            <p class="mb-2"><strong>Social :</strong> Président du CA assimilé salarié</p>
            <p class="mb-2"><strong>Particularités :</strong> Conseil d'administration obligatoire (3 membres min)</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Capital minimal :</strong> 37 000€</p>
        `,
        'SNC': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR (transparence fiscale)</p>
            <p class="mb-2"><strong>Particularités :</strong> Responsabilité indéfinie et solidaire des associés</p>
            <p class="mb-2"><strong>Social :</strong> Gérants et associés = TNS</p>
            <p class="mb-2"><strong>Fiscalité :</strong> Bénéfice imposé directement chez les associés</p>
        `,
        'SCI': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR par défaut, option IS possible</p>
            <p class="mb-2"><strong>Activité :</strong> Gestion immobilière (location nue principalement)</p>
            <p class="mb-2"><strong>IR :</strong> Revenus fonciers pour les associés + prélèvements sociaux 17.2%</p>
            <p class="mb-2"><strong>IS :</strong> Rarement avantageux sauf activité commerciale</p>
        `,
        'SELARL': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS presque toujours</p>
            <p class="mb-2"><strong>Particularités :</strong> Réservée aux professions libérales réglementées</p>
            <p class="mb-2"><strong>Social :</strong> Gérant majoritaire = TNS</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
        `,
        'SELAS': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Particularités :</strong> Réservée aux professions libérales réglementées</p>
            <p class="mb-2"><strong>Social :</strong> Président assimilé salarié</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Capital minimal :</strong> Libre</p>
        `,
        'SCA': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Structure :</strong> Commandités (responsabilité illimitée) et commanditaires</p>
            <p class="mb-2"><strong>Social :</strong> Gérants = TNS</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
            <p class="mb-2"><strong>Capital minimal :</strong> 37 000€</p>
        `
    };
    
    return infosFiscales[statutId] || `<p>Informations non disponibles pour ${statutId}</p>`;
    
    // Icônes pour les statuts juridiques
    const statutIcons = {
        'MICRO': '<i class="fas fa-store-alt text-green-400 mr-2"></i>',
        'EI': '<i class="fas fa-user text-green-400 mr-2"></i>',
        'EURL': '<i class="fas fa-user-tie text-green-400 mr-2"></i>',
        'SASU': '<i class="fas fa-user-shield text-blue-400 mr-2"></i>',
        'SARL': '<i class="fas fa-users text-blue-400 mr-2"></i>',
        'SAS': '<i class="fas fa-building text-blue-400 mr-2"></i>',
        'SA': '<i class="fas fa-landmark text-blue-400 mr-2"></i>',
        'SNC': '<i class="fas fa-handshake text-green-400 mr-2"></i>',
        'SCI': '<i class="fas fa-home text-green-400 mr-2"></i>',
        'SELARL': '<i class="fas fa-user-md text-blue-400 mr-2"></i>',
        'SELAS': '<i class="fas fa-stethoscope text-blue-400 mr-2"></i>',
        'SCA': '<i class="fas fa-chart-line text-blue-400 mr-2"></i>'
    };
 // Badge régime fiscal
    const regimeBadges = {
        'MICRO': '<span class="status-badge ir">IR</span>',
        'EI': '<span class="status-badge ir">IR</span>',
        'EURL': '<span class="status-badge iris">IR/IS</span>',
        'SASU': '<span class="status-badge is">IS</span>',
        'SARL': '<span class="status-badge is">IS</span>',
        'SAS': '<span class="status-badge is">IS</span>',
        'SA': '<span class="status-badge is">IS</span>',
        'SNC': '<span class="status-badge ir">IR</span>',
        'SCI': '<span class="status-badge ir">IR</span>',
        'SELARL': '<span class="status-badge is">IS</span>',
        'SELAS': '<span class="status-badge is">IS</span>',
        'SCA': '<span class="status-badge is">IS</span>'
    };
    
    // Générer l'accordéon pour chaque statut
    statuts.forEach(statutId => {
        const nomStatut = window.legalStatuses && window.legalStatuses[statutId] 
            ? window.legalStatuses[statutId].name 
            : getDefaultNomStatut(statutId);
        
        // Créer l'élément d'accordéon
        const accordionItem = document.createElement('div');
        accordionItem.className = 'mb-3';
        
        // Contenu de l'accordéon basé sur le statut
        accordionItem.innerHTML = `
            <button class="accordion-toggle w-full">
                ${statutIcons[statutId] || ''} ${nomStatut} 
                ${regimeBadges[statutId] || ''}
                <i class="fas fa-plus ml-auto"></i>
            </button>
            <div class="hidden px-4 py-3 border-t border-gray-700 bg-blue-900 bg-opacity-20 rounded-b-lg">
                ${getStatutFiscalInfo(statutId)}
            </div>
        `;
        
        accordionContainer.appendChild(accordionItem);
    });
    
    // Attacher les événements aux boutons de l'accordéon
    const toggleBtns = document.querySelectorAll('.accordion-toggle');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const content = this.nextElementSibling;
            content.classList.toggle('hidden');
            
            // Changer l'icône
            const icon = this.querySelector('i:last-child');
            icon.classList.toggle('fa-plus');
            icon.classList.toggle('fa-minus');
            
            // Ajouter/supprimer la classe active
            this.classList.toggle('active');
        });
    });
}

// Fonction d'aide pour obtenir le nom par défaut si legalStatuses n'est pas disponible
function getDefaultNomStatut(statutId) {
    const noms = {
        'MICRO': 'Micro-entreprise',
        'EI': 'Entreprise Individuelle',
        'EURL': 'Entreprise Unipersonnelle à Responsabilité Limitée',
        'SASU': 'Société par Actions Simplifiée Unipersonnelle',
        'SARL': 'Société à Responsabilité Limitée',
        'SAS': 'Société par Actions Simplifiée',
        'SA': 'Société Anonyme',
        'SNC': 'Société en Nom Collectif',
        'SCI': 'Société Civile Immobilière',
        'SELARL': 'Société d\'Exercice Libéral à Responsabilité Limitée',
        'SELAS': 'Société d\'Exercice Libéral par Actions Simplifiée',
        'SCA': 'Société en Commandite par Actions'
    };
    return noms[statutId] || statutId;
}

// Fonction pour générer les informations fiscales de chaque statut
function getStatutFiscalInfo(statutId) {
    // Informations fiscales par défaut pour chaque statut
    const infosFiscales = {
        'MICRO': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR avec abattement forfaitaire</p>
            <p class="mb-2"><strong>Abattements :</strong> 71% (vente), 50% (services BIC), 34% (BNC)</p>
            <p class="mb-2"><strong>Charges sociales :</strong> 12.3% (vente), 21.2% (services), 24.6% (BNC)</p>
            <p class="mb-2"><strong>Versement libératoire :</strong> 1% (vente), 1,7% (services), 2,2% (BNC) sur CA</p>
            <p class="mb-2"><strong>Plafonds 2025 :</strong> 188 700€ (vente) / 77 700€ (services)</p>
        `,
        'EI': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR, imposition sur le bénéfice</p>
            <p class="mb-2"><strong>Cotisations sociales :</strong> ~45% du bénéfice</p>
            <p class="mb-2"><strong>Avantages :</strong> Simplicité de gestion, frais réels déductibles</p>
            <p class="mb-2"><strong>Inconvénients :</strong> Pas de distinction entre patrimoine privé/pro</p>
        `,
        'EURL': `
            <p class="mb-2"><strong>Régimes fiscaux possibles :</strong> IR par défaut ou option IS</p>
            <p class="mb-2"><strong>IR :</strong> Imposition sur la totalité du bénéfice</p>
            <p class="mb-2"><strong>IS :</strong> Impôt sur les sociétés + PFU sur dividendes</p>
            <p class="mb-2"><strong>Cotisations sociales :</strong> Environ 45% de la rémunération du gérant (TNS)</p>
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
        `,
        'SASU': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS uniquement</p>
            <p class="mb-2"><strong>Social :</strong> Président assimilé salarié</p>
            <p class="mb-2"><strong>Cotisations :</strong> ~80% sur rémunération (22% salariales, 55% patronales)</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS (15%/25%) + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Optimisation:</strong> Favoriser les dividendes</p>
        `,
        'SARL': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS presque toujours</p>
            <p class="mb-2"><strong>Social gérant majoritaire :</strong> TNS (~45% de cotisations)</p>
            <p class="mb-2"><strong>Social gérant minoritaire :</strong> Assimilé salarié (~80%)</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
        `,
        'SAS': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS (impôt sur les sociétés)</p>
            <p class="mb-2"><strong>Social :</strong> Président assimilé salarié</p>
            <p class="mb-2"><strong>Cotisations :</strong> ~80% sur rémunération (22% salariales, 55% patronales)</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS (15%/25%) + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Capital minimal :</strong> Libre (1€ suffit)</p>
        `,
        'SA': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS (impôt sur les sociétés)</p>
            <p class="mb-2"><strong>Social :</strong> Président du CA assimilé salarié</p>
            <p class="mb-2"><strong>Particularités :</strong> Conseil d'administration obligatoire (3 membres min)</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Capital minimal :</strong> 37 000€</p>
        `,
        'SNC': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR (transparence fiscale)</p>
            <p class="mb-2"><strong>Particularités :</strong> Responsabilité indéfinie et solidaire des associés</p>
            <p class="mb-2"><strong>Social :</strong> Gérants et associés = TNS</p>
            <p class="mb-2"><strong>Fiscalité :</strong> Bénéfice imposé directement chez les associés</p>
        `,
        'SCI': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR par défaut, option IS possible</p>
            <p class="mb-2"><strong>Activité :</strong> Gestion immobilière (location nue principalement)</p>
            <p class="mb-2"><strong>IR :</strong> Revenus fonciers pour les associés + prélèvements sociaux 17.2%</p>
            <p class="mb-2"><strong>IS :</strong> Rarement avantageux sauf activité commerciale</p>
        `,
        'SELARL': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS presque toujours</p>
            <p class="mb-2"><strong>Particularités :</strong> Réservée aux professions libérales réglementées</p>
            <p class="mb-2"><strong>Social :</strong> Gérant majoritaire = TNS</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
        `,
        'SELAS': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Particularités :</strong> Réservée aux professions libérales réglementées</p>
            <p class="mb-2"><strong>Social :</strong> Président assimilé salarié</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Capital minimal :</strong> Libre</p>
        `,
        'SCA': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Structure :</strong> Commandités (responsabilité illimitée) et commanditaires</p>
            <p class="mb-2"><strong>Social :</strong> Gérants = TNS</p>
            <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
            <p class="mb-2"><strong>Capital minimal :</strong> 37 000€</p>
        `
    };
    
    return infosFiscales[statutId] || `<p>Informations non disponibles pour ${statutId}</p>`;
}// Contenu trop volumineux pour être inclus dans la demande
