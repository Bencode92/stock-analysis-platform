// question-manager.js - Gestion de l'affichage et de la navigation entre les questions

class QuestionManager {
    constructor() {
        this.currentSectionIndex = 0;
        this.currentQuestionIndex = 0;
        this.sectionQuestions = {}; // Pour stocker les questions par section
        this.currentSectionQuestionIndex = 0; // Index de la question dans la section courante
        this.answers = {};
        this.isQuickStart = false;
        this.maxProgress = window.questions.length;
        this.questionContainer = document.getElementById('question-container');
        this.progressBar = document.getElementById('progress-bar');
        this.progressPercentage = document.getElementById('progress-percentage');
        this.timeEstimate = document.getElementById('time-estimate');
        this.progressStepsContainer = document.getElementById('progress-steps-container');
        
        // Initialiser les questions par section
        this.initSectionQuestions();
        
        // Initialiser les événements
        this.initEvents();
    }

    /**
     * Initialiser les questions par section
     */
    initSectionQuestions() {
        // Regrouper les questions par section
        window.sections.forEach(section => {
            this.sectionQuestions[section.id] = window.questions.filter(q => q.sectionId === section.id);
        });
    }

    /**
     * Initialiser les événements de la page
     */
    initEvents() {
        // Événement pour le bouton Quick Start
        const quickStartBtn = document.getElementById('quick-start-btn');
        if (quickStartBtn) {
            quickStartBtn.addEventListener('click', () => {
                this.isQuickStart = true;
                this.initQuickStart();
                this.renderCurrentQuestion();
            });
        }
    }

    /**
     * Initialiser le mode Quick Start
     */
    initQuickStart() {
        // Filtrer les questions pour garder uniquement celles du quick start
        this.filteredQuestions = window.questions.filter(q => window.quickStartQuestions.includes(q.id));
        this.maxProgress = this.filteredQuestions.length;
        this.currentQuestionIndex = 0;
        
        // Mettre à jour les étapes de progression
        this.renderProgressSteps();
        this.updateProgressBar();
        
        // Mettre à jour le temps estimé
        this.timeEstimate.textContent = "Temps estimé: 2 minutes";
    }

    /**
     * Initialiser l'application
     */
    init() {
        // Rendre les étapes de progression
        this.renderProgressSteps();
        
        // Afficher la première question
        this.renderCurrentQuestion();
    }

    /**
     * Rendre les étapes de progression
     */
    renderProgressSteps() {
        this.progressStepsContainer.innerHTML = '';
        
        // Déterminer les questions à utiliser
        const questionsToUse = this.isQuickStart ? this.filteredQuestions : window.questions;
        
        // Créer une étape par section (regrouper les questions par section)
        const uniqueSections = [];
        questionsToUse.forEach(question => {
            if (!uniqueSections.includes(question.sectionId)) {
                uniqueSections.push(question.sectionId);
            }
        });
        
        // Rendre chaque étape
        uniqueSections.forEach((sectionId, index) => {
            const section = window.sections.find(s => s.id === sectionId);
            const isActive = index === this.currentSectionIndex;
            const isCompleted = index < this.currentSectionIndex;
            
            const stepDiv = document.createElement('div');
            stepDiv.className = `progress-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`;
            stepDiv.innerHTML = `
                <span>${index + 1}</span>
                <span class="progress-label">${section.title}</span>
            `;
            
            this.progressStepsContainer.appendChild(stepDiv);
        });
    }

    /**
     * Mettre à jour la barre de progression
     */
    updateProgressBar() {
        const progress = this.calculateProgress();
        this.progressBar.style.width = `${progress}%`;
        this.progressPercentage.textContent = `${Math.round(progress)}% complété`;
    }

    /**
     * Calculer le pourcentage de progression
     */
    calculateProgress() {
        const questionsToUse = this.isQuickStart ? this.filteredQuestions : window.questions;
        // Amélioration: Éviter NaN en vérifiant si questionsToUse.length est valide
        const totalQuestions = questionsToUse ? questionsToUse.length : 1;
        return (this.currentQuestionIndex / totalQuestions) * 100;
    }

    /**
     * Rendre la question courante
     */
    renderCurrentQuestion() {
        // Déterminer la question à afficher
        let questionToRender;
        
        if (this.isQuickStart) {
            // Mode Quick Start : utiliser les questions filtrées
            questionToRender = this.filteredQuestions[this.currentQuestionIndex];
        } else {
            // Mode normal : naviguer par section
            const currentSectionId = window.sections[this.currentSectionIndex].id;
            const sectionQuestions = this.sectionQuestions[currentSectionId] || [];
            
            // S'assurer que nous avons un index valide
            if (this.currentSectionQuestionIndex >= sectionQuestions.length) {
                this.currentSectionQuestionIndex = 0;
            }
            
            questionToRender = sectionQuestions[this.currentSectionQuestionIndex];
        }
        
        if (!questionToRender) {
            // Si toutes les questions ont été répondues, afficher les résultats
            this.showResults();
            return;
        }
        
        // Vérifier si la question doit être affichée en fonction des réponses précédentes
        if (questionToRender.showIf && !this.shouldShowQuestion(questionToRender)) {
            // Passer à la question suivante
            this.goToNextQuestion();
            return;
        }
        
        // Créer l'élément de la question
        const questionElement = this.createQuestionElement(questionToRender);
        
        // Vider le conteneur et ajouter la nouvelle question
        this.questionContainer.innerHTML = '';
        this.questionContainer.appendChild(questionElement);
        
        // Attacher les événements de la question
        this.attachQuestionEvents(questionToRender);
        
        // Mettre à jour la barre de progression
        this.updateProgressBar();
        
        // Informer le glossaire qu'une nouvelle question a été ajoutée
        setTimeout(() => {
            console.log("Question injectée, notification du glossaire");
            document.dispatchEvent(new Event('contentUpdated'));
        }, 10);
    }

    /**
     * Vérifier si une question doit être affichée en fonction des réponses précédentes
     */
    shouldShowQuestion(question) {
        if (!question.showIf) return true;
        
        // Vérifier chaque condition
        for (const [questionId, expectedValues] of Object.entries(question.showIf)) {
            const answer = this.answers[questionId];
            
            // Si la réponse n'existe pas ou ne correspond pas aux valeurs attendues
            if (!answer || (Array.isArray(expectedValues) && !expectedValues.includes(answer))) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Créer l'élément HTML pour une question
     */
    createQuestionElement(question) {
        const card = document.createElement('div');
        card.className = 'question-card p-6 mb-8';
        card.dataset.questionId = question.id;
        
        // En-tête de la question
        const header = document.createElement('div');
        header.className = 'mb-6';
        
        // Trouver la section correspondante
        const section = window.sections.find(s => s.id === question.sectionId);
        
        header.innerHTML = `
            <div class="flex items-center mb-3">
                <span class="section-tag">${section.title}</span>
                ${question.required ? '<span class="text-xs font-semibold text-red-500 ml-2">Obligatoire</span>' : ''}
            </div>
            <h3 class="text-xl font-bold mb-2">${question.title}</h3>
            <p class="text-gray-300">${question.description}</p>
        `;
        
        // Corps de la question
        const body = document.createElement('div');
        body.className = 'mt-6';
        
        // Créer le contenu en fonction du type de question
        switch (question.type) {
            case 'radio':
                body.appendChild(this.createRadioOptions(question));
                break;
            case 'checkbox':
                body.appendChild(this.createCheckboxOptions(question));
                break;
            case 'select':
                body.appendChild(this.createSelectOptions(question));
                break;
            case 'slider':
                body.appendChild(this.createSlider(question));
                break;
            case 'number':
                body.appendChild(this.createNumberInput(question));
                break;
            case 'drag_and_drop':
                body.appendChild(this.createDragAndDrop(question));
                break;
            default:
                body.innerHTML = '<p>Type de question non supporté</p>';
        }
        
        // Informations additionnelles (si présentes)
        if (question.infoText) {
            const infoText = document.createElement('div');
            infoText.className = 'mt-4 p-3 bg-blue-900 bg-opacity-40 rounded-lg text-sm';
            infoText.innerHTML = `<i class="fas fa-info-circle mr-2 text-blue-400"></i>${question.infoText}`;
            body.appendChild(infoText);
        }
        
        // Contrôles additionnels (si présents)
        if (question.additionalControls) {
            const additionalControls = document.createElement('div');
            additionalControls.className = 'mt-4';
            
            question.additionalControls.forEach(control => {
                const controlElement = document.createElement('div');
                controlElement.className = 'mt-2';
                
                switch (control.type) {
                    case 'checkbox':
                        controlElement.innerHTML = `
                            <label class="flex items-center">
                                <input type="checkbox" id="${control.id}" class="form-checkbox h-5 w-5 text-green-400">
                                <span class="ml-2">${control.label}</span>
                            </label>
                        `;
                        
                        // Afficher ou masquer en fonction de la condition
                        if (control.showIf) {
                            const selectedOption = document.querySelector(`input[name="${question.id}"]:checked`);
                            const shouldShow = selectedOption && selectedOption.value === control.showIf;
                            controlElement.style.display = shouldShow ? 'block' : 'none';
                        }
                        break;
                }
                
                additionalControls.appendChild(controlElement);
            });
            
            body.appendChild(additionalControls);
        }
        
        // Boutons de navigation
        const navigation = document.createElement('div');
        navigation.className = 'flex justify-between mt-8';
        
        // Bouton précédent
        const prevButton = document.createElement('button');
        prevButton.className = 'prev-btn bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition';
        prevButton.innerHTML = '<i class="fas fa-arrow-left mr-2"></i>Précédent';
        
        // Déterminer si on doit afficher le bouton précédent
        let showPrevButton = false;
        
        if (this.isQuickStart) {
            showPrevButton = this.currentQuestionIndex > 0;
        } else {
            // Vérifier si nous sommes à la première question de la première section
            showPrevButton = !(this.currentSectionIndex === 0 && this.currentSectionQuestionIndex === 0);
        }
        
        prevButton.style.display = showPrevButton ? 'block' : 'none';
        
        // Bouton suivant
        const nextButton = document.createElement('button');
        nextButton.className = 'next-btn bg-green-500 hover:bg-green-400 text-gray-900 font-medium py-2 px-4 rounded-lg transition ml-auto';
        nextButton.innerHTML = 'Suivant<i class="fas fa-arrow-right ml-2"></i>';
        
        navigation.appendChild(prevButton);
        navigation.appendChild(nextButton);
        
        // Assembler la carte
        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(navigation);
        
        return card;
    }

    /**
     * Créer les options pour une question de type radio
     */
    createRadioOptions(question) {
        const container = document.createElement('div');
        container.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';
        
        question.options.forEach(option => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option-btn p-4 rounded-lg cursor-pointer flex items-center';
            optionDiv.dataset.questionId = question.id;
            
            // Vérifier si cette option est sélectionnée
            const isSelected = this.answers[question.id] === option.id;
            if (isSelected) {
                optionDiv.classList.add('selected');
            }
            
            optionDiv.innerHTML = `
                <input type="radio" name="${question.id}" id="${option.id}" value="${option.id}" class="hidden" ${isSelected ? 'checked' : ''}>
                <label for="${option.id}" class="flex items-center cursor-pointer w-full">
                    ${option.icon ? `<i class="fas ${option.icon} text-2xl text-green-400 mr-3"></i>` : ''}
                    <div>
                        <span class="font-medium">${option.label}</span>
                        ${option.description ? `<p class="text-sm text-gray-400 mt-1">${option.description}</p>` : ''}
                    </div>
                </label>
            `;
            
            container.appendChild(optionDiv);
        });
        
        return container;
    }

    /**
     * Créer les options pour une question de type checkbox
     */
    createCheckboxOptions(question) {
        const container = document.createElement('div');
        container.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';
        
        question.options.forEach(option => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option-btn p-4 rounded-lg cursor-pointer flex items-center';
            optionDiv.dataset.questionId = question.id;
            
            // Vérifier si cette option est sélectionnée
            const selectedOptions = this.answers[question.id] || [];
            const isSelected = selectedOptions.includes(option.id);
            if (isSelected) {
                optionDiv.classList.add('selected');
            }
            
            optionDiv.innerHTML = `
                <input type="checkbox" name="${question.id}" id="${option.id}" value="${option.id}" class="hidden" ${isSelected ? 'checked' : ''}>
                <label for="${option.id}" class="flex items-center cursor-pointer w-full">
                    ${option.icon ? `<i class="fas ${option.icon} text-2xl text-green-400 mr-3"></i>` : ''}
                    <div>
                        <span class="font-medium">${option.label}</span>
                        ${option.description ? `<p class="text-sm text-gray-400 mt-1">${option.description}</p>` : ''}
                    </div>
                </label>
            `;
            
            container.appendChild(optionDiv);
        });
        
        return container;
    }

    /**
     * Créer un sélecteur pour une question de type select
     */
    createSelectOptions(question) {
        const container = document.createElement('div');
        container.className = 'relative';
        
        const select = document.createElement('select');
        select.id = question.id;
        select.name = question.id;
        select.className = 'bg-blue-900 bg-opacity-50 border border-gray-700 text-white rounded-lg py-3 px-4 appearance-none w-full focus:outline-none focus:ring-2 focus:ring-green-400';
        
        // Option par défaut
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Sélectionnez une option';
        defaultOption.disabled = true;
        defaultOption.selected = !this.answers[question.id];
        select.appendChild(defaultOption);
        
        // Autres options
        question.options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.id;
            optionElement.textContent = option.label;
            optionElement.selected = this.answers[question.id] === option.id;
            select.appendChild(optionElement);
        });
        
        // Ajouter une icône pour le dropdown
        const selectWrapper = document.createElement('div');
        selectWrapper.className = 'relative';
        selectWrapper.innerHTML = `
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-green-400">
                <i class="fas fa-chevron-down"></i>
            </div>
        `;
        
        container.appendChild(select);
        container.appendChild(selectWrapper);
        
        return container;
    }

    /**
     * Créer un slider pour une question de type slider
     */
    createSlider(question) {
        const container = document.createElement('div');
        container.className = 'mt-6';
        
        // Valeur actuelle (ou valeur par défaut)
        const value = this.answers[question.id] !== undefined ? this.answers[question.id] : question.default;
        
        // Conteneur des labels
        const labelsContainer = document.createElement('div');
        labelsContainer.className = 'flex justify-between mb-2 text-sm text-gray-400';
        
        // Ajouter les labels si définis
        if (question.labels) {
            Object.entries(question.labels).forEach(([position, label]) => {
                const labelSpan = document.createElement('span');
                labelSpan.textContent = label;
                labelsContainer.appendChild(labelSpan);
            });
        } else {
            // Labels par défaut (min et max)
            labelsContainer.innerHTML = `
                <span>${question.min}</span>
                <span>${question.max}</span>
            `;
        }
        
        // Slider
        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'relative mt-2';
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = `${question.id}-slider`; // Amélioration: ID unique pour le slider
        slider.min = question.min;
        slider.max = question.max;
        slider.step = question.step;
        slider.value = value;
        slider.className = 'w-full';
        
        // Valeur actuelle
        const valueDisplay = document.createElement('div');
        valueDisplay.className = 'text-center mt-4 text-lg font-medium text-green-400';
        valueDisplay.textContent = `${value}${question.format ? ' ' + question.format : ''}`;
        
        // Assembler
        container.appendChild(labelsContainer);
        container.appendChild(sliderContainer);
        sliderContainer.appendChild(slider);
        container.appendChild(valueDisplay);
        
        // Mise à jour du display lors du changement de valeur
        slider.addEventListener('input', (e) => {
            valueDisplay.textContent = `${e.target.value}${question.format ? ' ' + question.format : ''}`;
        });
        
        return container;
    }

    /**
     * Créer un input numérique pour une question de type number
     */
    createNumberInput(question) {
        const container = document.createElement('div');
        container.className = 'relative mt-6';
        
        // Valeur actuelle (ou valeur par défaut)
        const value = this.answers[question.id] !== undefined ? this.answers[question.id] : question.default;
        
        const inputGroup = document.createElement('div');
        inputGroup.className = 'flex rounded-lg overflow-hidden border border-gray-700';
        
        // Input
        const input = document.createElement('input');
        input.type = 'number';
        input.id = question.id;
        input.name = question.id;
        input.min = question.min;
        input.max = question.max;
        input.step = question.step;
        input.value = value;
        input.className = 'bg-blue-900 bg-opacity-50 py-3 px-4 flex-grow focus:outline-none focus:ring-2 focus:ring-green-400';
        
        inputGroup.appendChild(input);
        
        // Suffixe (format)
        if (question.format) {
            const suffix = document.createElement('div');
            suffix.className = 'bg-blue-800 bg-opacity-70 flex items-center px-4 text-green-400 font-medium';
            suffix.textContent = question.format;
            inputGroup.appendChild(suffix);
        }
        
        container.appendChild(inputGroup);
        
        return container;
    }

    /**
     * Créer un drag and drop pour une question de type drag_and_drop
     */
    createDragAndDrop(question) {
        const container = document.createElement('div');
        container.className = 'mt-6';
        
        // Obtenir les priorités actuelles ou initialiser
        const priorities = this.answers[question.id] || [];
        
        // Liste des options disponibles
        const availableList = document.createElement('div');
        availableList.className = 'grid grid-cols-1 md:grid-cols-3 gap-4 mb-8';
        availableList.id = 'available-options';
        
        // En-tête des disponibles
        const availableHeader = document.createElement('div');
        availableHeader.className = 'col-span-full mb-2 text-gray-400';
        availableHeader.innerHTML = '<i class="fas fa-list mr-2"></i>Options disponibles';
        availableList.appendChild(availableHeader);
        
        // Options disponibles (non sélectionnées)
        const availableOptions = question.options.filter(option => !priorities.includes(option.id));
        availableOptions.forEach(option => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option-btn p-3 rounded-lg cursor-move flex items-center draggable';
            optionDiv.dataset.optionId = option.id;
            
            optionDiv.innerHTML = `
                <i class="fas ${option.icon} text-xl text-green-400 mr-3"></i>
                <span>${option.label}</span>
                <i class="fas fa-grip-lines ml-auto text-gray-500"></i>
            `;
            
            availableList.appendChild(optionDiv);
        });
        
        // Liste des priorités sélectionnées
        const prioritiesList = document.createElement('div');
        prioritiesList.className = 'space-y-4 mb-6';
        prioritiesList.id = 'priorities-list';
        
        // En-tête des priorités
        const prioritiesHeader = document.createElement('div');
        prioritiesHeader.className = 'mb-4 text-lg font-medium text-white';
        prioritiesHeader.innerHTML = '<i class="fas fa-star mr-2 text-yellow-400"></i>Vos priorités (glissez-déposez 3 éléments ici)';
        prioritiesList.appendChild(prioritiesHeader);
        
        // Emplacements pour les priorités
        const slots = [
            { rank: 1, weight: 5, label: 'Priorité principale' },
            { rank: 2, weight: 4, label: 'Seconde priorité' },
            { rank: 3, weight: 3, label: 'Troisième priorité' }
        ];
        
        slots.forEach((slot, index) => {
            const slotDiv = document.createElement('div');
            slotDiv.className = 'priority-slot p-4 rounded-lg border-2 border-dashed border-gray-600 min-h-16 flex items-center';
            slotDiv.dataset.rank = slot.rank;
            slotDiv.dataset.weight = slot.weight;
            
            // Si une priorité est déjà assignée à ce slot
            const priorityId = priorities[index];
            if (priorityId) {
                const option = question.options.find(opt => opt.id === priorityId);
                if (option) {
                    slotDiv.className = 'priority-slot p-4 rounded-lg border-2 border-green-500 bg-blue-900 bg-opacity-30 min-h-16 flex items-center';
                    slotDiv.innerHTML = `
                        <i class="fas ${option.icon} text-xl text-green-400 mr-3"></i>
                        <span>${option.label}</span>
                        <div class="ml-auto bg-green-900 text-green-400 rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold">${slot.rank}</div>
                    `;
                    slotDiv.dataset.optionId = option.id;
                }
            } else {
                slotDiv.innerHTML = `
                    <span class="text-gray-500">${slot.label}</span>
                    <div class="ml-auto bg-gray-800 text-gray-400 rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold">${slot.rank}</div>
                `;
            }
            
            prioritiesList.appendChild(slotDiv);
        });
        
        // Information sur le poids
        const weightInfo = document.createElement('div');
        weightInfo.className = 'text-sm text-gray-400 mt-2 italic';
        weightInfo.innerHTML = 'Le poids accordé à chaque priorité est proportionnel à son rang (rang 1 = poids 5, rang 2 = poids 4, rang 3 = poids 3)';
        prioritiesList.appendChild(weightInfo);
        
        // Assembler
        container.appendChild(prioritiesList);
        container.appendChild(availableList);
        
        return container;
    }

    /**
     * Attacher les événements pour une question
     */
    attachQuestionEvents(question) {
        // Navigation
        const prevBtn = document.querySelector('.prev-btn');
        const nextBtn = document.querySelector('.next-btn');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.goToPreviousQuestion());
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (this.validateCurrentQuestion()) {
                    this.saveCurrentAnswer();
                    this.goToNextQuestion();
                } else {
                    // Afficher un message d'erreur pour les champs obligatoires
                    alert('Veuillez répondre à la question avant de continuer.');
                }
            });
        }
        
        // Événements spécifiques au type de question
        switch (question.type) {
            case 'radio':
                this.attachRadioEvents(question);
                break;
            case 'checkbox':
                this.attachCheckboxEvents(question);
                break;
            case 'select':
                this.attachSelectEvents(question);
                break;
            case 'slider':
                this.attachSliderEvents(question);
                break;
            case 'number':
                this.attachNumberEvents(question);
                break;
            case 'drag_and_drop':
                this.attachDragAndDropEvents(question);
                break;
        }
    }

    /**
     * Attacher les événements pour une question de type radio
     */
    attachRadioEvents(question) {
        const options = document.querySelectorAll(`.option-btn[data-question-id="${question.id}"]`);
        
        options.forEach(option => {
            option.addEventListener('click', () => {
                // Désélectionner toutes les options
                options.forEach(opt => opt.classList.remove('selected'));
                
                // Sélectionner l'option cliquée
                option.classList.add('selected');
                
                // Cocher la case radio
                const radio = option.querySelector('input[type="radio"]');
                radio.checked = true;
                
                // Mettre à jour les contrôles additionnels si nécessaire
                if (question.additionalControls) {
                    question.additionalControls.forEach(control => {
                        if (control.showIf) {
                            const controlElement = document.getElementById(control.id).parentNode.parentNode;
                            controlElement.style.display = radio.value === control.showIf ? 'block' : 'none';
                        }
                    });
                }
            });
        });
    }

    /**
     * Attacher les événements pour une question de type checkbox
     */
    attachCheckboxEvents(question) {
        const options = document.querySelectorAll(`.option-btn[data-question-id="${question.id}"]`);
        
        options.forEach(option => {
            option.addEventListener('click', () => {
                // Basculer la sélection de l'option
                option.classList.toggle('selected');
                
                // Basculer la case à cocher
                const checkbox = option.querySelector('input[type="checkbox"]');
                checkbox.checked = !checkbox.checked;
            });
        });
    }

    /**
     * Attacher les événements pour une question de type select
     */
    attachSelectEvents(question) {
        const select = document.getElementById(question.id);
        
        select.addEventListener('change', () => {
            // Mise à jour du style
            const selectedOption = select.options[select.selectedIndex];
            if (selectedOption.value) {
                select.classList.add('border-green-400');
            } else {
                select.classList.remove('border-green-400');
            }
        });
    }

    /**
     * Attacher les événements pour une question de type slider
     */
    attachSliderEvents(question) {
        // Déjà géré dans createSlider()
    }

    /**
     * Attacher les événements pour une question de type number
     */
    attachNumberEvents(question) {
        const input = document.getElementById(question.id);
        
        input.addEventListener('change', () => {
            // Vérifier les bornes
            if (input.value < question.min) {
                input.value = question.min;
            } else if (input.value > question.max) {
                input.value = question.max;
            }
        });
    }

    /**
     * Attacher les événements pour une question de type drag_and_drop
     */
    attachDragAndDropEvents(question) {
        // Implémentation simplifiée - dans un vrai projet, utilisez une bibliothèque de drag and drop
        // comme SortableJS ou HTML5 Drag and Drop API
        
        // Pour cette démonstration, simulons le DnD avec des clics
        const draggables = document.querySelectorAll('.draggable');
        const slots = document.querySelectorAll('.priority-slot');
        
        draggables.forEach(draggable => {
            draggable.addEventListener('click', () => {
                // Trouver le premier slot vide
                const emptySlot = Array.from(slots).find(slot => !slot.dataset.optionId);
                
                if (emptySlot) {
                    const optionId = draggable.dataset.optionId;
                    const option = question.options.find(opt => opt.id === optionId);
                    
                    // Mettre à jour le slot
                    emptySlot.dataset.optionId = optionId;
                    emptySlot.className = 'priority-slot p-4 rounded-lg border-2 border-green-500 bg-blue-900 bg-opacity-30 min-h-16 flex items-center';
                    emptySlot.innerHTML = `
                        <i class="fas ${option.icon} text-xl text-green-400 mr-3"></i>
                        <span>${option.label}</span>
                        <div class="ml-auto bg-green-900 text-green-400 rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold">${emptySlot.dataset.rank}</div>
                    `;
                    
                    // Supprimer l'option de la liste disponible
                    draggable.remove();
                }
            });
        });
        
        // Permettre de retirer une priorité en cliquant dessus
        slots.forEach(slot => {
            if (slot.dataset.optionId) {
                slot.addEventListener('click', () => {
                    const optionId = slot.dataset.optionId;
                    const option = question.options.find(opt => opt.id === optionId);
                    
                    // Réinitialiser le slot
                    slot.innerHTML = `
                        <span class="text-gray-500">${slot.dataset.rank === '1' ? 'Priorité principale' : slot.dataset.rank === '2' ? 'Seconde priorité' : 'Troisième priorité'}</span>
                        <div class="ml-auto bg-gray-800 text-gray-400 rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold">${slot.dataset.rank}</div>
                    `;
                    slot.className = 'priority-slot p-4 rounded-lg border-2 border-dashed border-gray-600 min-h-16 flex items-center';
                    delete slot.dataset.optionId;
                    
                    // Rajouter l'option dans la liste disponible
                    const availableList = document.getElementById('available-options');
                    const optionDiv = document.createElement('div');
                    optionDiv.className = 'option-btn p-3 rounded-lg cursor-move flex items-center draggable';
                    optionDiv.dataset.optionId = option.id;
                    
                    optionDiv.innerHTML = `
                        <i class="fas ${option.icon} text-xl text-green-400 mr-3"></i>
                        <span>${option.label}</span>
                        <i class="fas fa-grip-lines ml-auto text-gray-500"></i>
                    `;
                    
                    availableList.appendChild(optionDiv);
                    
                    // Rattacher l'événement de clic
                    optionDiv.addEventListener('click', () => {
                        const emptySlot = Array.from(document.querySelectorAll('.priority-slot')).find(s => !s.dataset.optionId);
                        
                        if (emptySlot) {
                            // Mettre à jour le slot
                            emptySlot.dataset.optionId = option.id;
                            emptySlot.className = 'priority-slot p-4 rounded-lg border-2 border-green-500 bg-blue-900 bg-opacity-30 min-h-16 flex items-center';
                            emptySlot.innerHTML = `
                                <i class="fas ${option.icon} text-xl text-green-400 mr-3"></i>
                                <span>${option.label}</span>
                                <div class="ml-auto bg-green-900 text-green-400 rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold">${emptySlot.dataset.rank}</div>
                            `;
                            
                            // Supprimer l'option de la liste disponible
                            optionDiv.remove();
                        }
                    });
                });
            }
        });
    }

    /**
     * Valider la question courante
     */
    validateCurrentQuestion() {
        let currentQuestion;
        
        if (this.isQuickStart) {
            currentQuestion = this.filteredQuestions[this.currentQuestionIndex];
        } else {
            const currentSectionId = window.sections[this.currentSectionIndex].id;
            const sectionQuestions = this.sectionQuestions[currentSectionId] || [];
            currentQuestion = sectionQuestions[this.currentSectionQuestionIndex];
        }
        
        if (!currentQuestion.required) {
            return true;
        }
        
        switch (currentQuestion.type) {
            case 'radio':
                const selectedRadio = document.querySelector(`input[name="${currentQuestion.id}"]:checked`);
                return !!selectedRadio;
            
            case 'checkbox':
                const selectedCheckboxes = document.querySelectorAll(`input[name="${currentQuestion.id}"]:checked`);
                return selectedCheckboxes.length > 0;
            
            case 'select':
                const select = document.getElementById(currentQuestion.id);
                return select.value !== '';
            
            case 'slider':
            case 'number':
                return true; // Toujours une valeur par défaut
            
            case 'drag_and_drop':
                const filledSlots = document.querySelectorAll('.priority-slot[data-option-id]');
                return filledSlots.length === 3; // On veut exactement 3 priorités
            
            default:
                return true;
        }
    }

    /**
     * Sauvegarder la réponse à la question courante
     */
    saveCurrentAnswer() {
        let currentQuestion;
        
        if (this.isQuickStart) {
            currentQuestion = this.filteredQuestions[this.currentQuestionIndex];
        } else {
            const currentSectionId = window.sections[this.currentSectionIndex].id;
            const sectionQuestions = this.sectionQuestions[currentSectionId] || [];
            currentQuestion = sectionQuestions[this.currentSectionQuestionIndex];
        }
        
        switch (currentQuestion.type) {
            case 'radio':
                const selectedRadio = document.querySelector(`input[name="${currentQuestion.id}"]:checked`);
                if (selectedRadio) {
                    this.answers[currentQuestion.id] = selectedRadio.value;
                }
                break;
            
            case 'checkbox':
                const selectedCheckboxes = document.querySelectorAll(`input[name="${currentQuestion.id}"]:checked`);
                this.answers[currentQuestion.id] = Array.from(selectedCheckboxes).map(cb => cb.value);
                break;
            
            case 'select':
                const select = document.getElementById(currentQuestion.id);
                this.answers[currentQuestion.id] = select.value;
                break;
            
            case 'slider':
                // Amélioration: Utilisation de l'ID spécifique du slider
                const slider = document.getElementById(`${currentQuestion.id}-slider`);
                this.answers[currentQuestion.id] = parseFloat(slider.value);
                break;
            
            case 'number':
                const input = document.getElementById(currentQuestion.id);
                this.answers[currentQuestion.id] = parseFloat(input.value);
                break;
            
            case 'drag_and_drop':
                const slots = document.querySelectorAll('.priority-slot');
                this.answers[currentQuestion.id] = Array.from(slots)
                    .filter(slot => slot.dataset.optionId)
                    .sort((a, b) => parseInt(a.dataset.rank) - parseInt(b.dataset.rank))
                    .map(slot => slot.dataset.optionId);
                break;
        }
        
        // Sauvegarder les contrôles additionnels
        if (currentQuestion.additionalControls) {
            currentQuestion.additionalControls.forEach(control => {
                if (control.type === 'checkbox') {
                    const checkbox = document.getElementById(control.id);
                    this.answers[control.id] = checkbox.checked;
                }
            });
        }
        
        // Rendre les réponses disponibles globalement
        window.userResponses = this.answers;
        
        console.log('Answers:', this.answers);
    }

    /**
     * Aller à la question précédente
     */
    goToPreviousQuestion() {
        if (this.isQuickStart) {
            if (this.currentQuestionIndex > 0) {
                this.currentQuestionIndex--;
                this.renderCurrentQuestion();
            }
        } else {
            // Mode navigation par section
            const currentSectionId = window.sections[this.currentSectionIndex].id;
            const sectionQuestions = this.sectionQuestions[currentSectionId] || [];
            
            if (this.currentSectionQuestionIndex > 0) {
                // Revenir à la question précédente dans la même section
                this.currentSectionQuestionIndex--;
                this.renderCurrentQuestion();
            } else if (this.currentSectionIndex > 0) {
                // Revenir à la dernière question de la section précédente
                this.currentSectionIndex--;
                const prevSectionId = window.sections[this.currentSectionIndex].id;
                const prevSectionQuestions = this.sectionQuestions[prevSectionId] || [];
                this.currentSectionQuestionIndex = prevSectionQuestions.length - 1;
                this.renderCurrentQuestion();
            }
        }
    }

    /**
     * Aller à la question suivante
     */
    goToNextQuestion() {
        if (this.isQuickStart) {
            if (this.currentQuestionIndex < this.filteredQuestions.length - 1) {
                this.currentQuestionIndex++;
                this.renderCurrentQuestion();
            } else {
                this.showResults();
            }
        } else {
            // Mode navigation par section
            const currentSectionId = window.sections[this.currentSectionIndex].id;
            const sectionQuestions = this.sectionQuestions[currentSectionId] || [];
            
            if (this.currentSectionQuestionIndex < sectionQuestions.length - 1) {
                // Passer à la question suivante dans la même section
                this.currentSectionQuestionIndex++;
                this.renderCurrentQuestion();
            } else if (this.currentSectionIndex < window.sections.length - 1) {
                // Passer à la première question de la section suivante
                this.currentSectionIndex++;
                this.currentSectionQuestionIndex = 0;
                this.renderCurrentQuestion();
                
                // Mettre à jour les étapes de progression
                this.renderProgressSteps();
            } else {
                // Si toutes les questions ont été répondues
                this.showResults();
            }
        }
        
        // Faire défiler la page vers le haut
        window.scrollTo(0, 0);
    }

    /**
     * Afficher les résultats
     */
    showResults() {
        // Rediriger vers la page de résultats
        this.questionContainer.innerHTML = `
            <div class="bg-green-900 bg-opacity-20 p-8 rounded-xl text-center">
                <div class="text-6xl text-green-400 mb-4"><i class="fas fa-check-circle"></i></div>
                <h2 class="text-2xl font-bold mb-4">Merci d'avoir complété le questionnaire !</h2>
                <p class="mb-6">Vos réponses ont été enregistrées. Nous allons maintenant calculer la forme juridique la plus adaptée à votre projet.</p>
                <button id="show-results-btn" class="bg-green-500 hover:bg-green-400 text-gray-900 font-semibold py-3 px-6 rounded-lg transition">
                    Voir les résultats
                </button>
            </div>
        `;
        
        // Informer le glossaire de l'ajout de contenu
        setTimeout(() => {
            console.log("Écran de confirmation injecté, notification du glossaire");
            document.dispatchEvent(new Event('contentUpdated'));
        }, 10);
        
        // Attacher l'événement au bouton
        const showResultsBtn = document.getElementById('show-results-btn');
        if (showResultsBtn) {
            showResultsBtn.addEventListener('click', async () => {
                // Afficher l'indicateur de chargement immédiatement
                let loadingInterval = window.showLoadingIndicator();
                
                try {
                    // Si loadRecommendationEngine est disponible (approche Promise)
                    if (typeof window.loadRecommendationEngine === 'function') {
                        console.log("Utilisation de loadRecommendationEngine Promise");
                        const engine = await window.loadRecommendationEngine();
                        // IMPORTANT: Assurer que l'instance a la méthode displayResults
                        engine.displayResults = displayResults;
                        const recommendations = engine.calculateRecommendations(this.answers);
                        
                        if (window.ResultsManager && typeof window.ResultsManager.displayResults === 'function') {
                            window.ResultsManager.displayResults(recommendations);
                        } else {
                            displayResults(recommendations);
                        }
                        return;
                    }
                    
                    // Si le moteur est directement accessible
                    if (typeof window.RecommendationEngine === 'function') {
                        console.log("Création directe d'une instance RecommendationEngine");
                        window.recommendationEngine = new window.RecommendationEngine();
                        // IMPORTANT: Assurer que l'instance a la méthode displayResults
                        window.recommendationEngine.displayResults = displayResults;
                        const recommendations = window.recommendationEngine.calculateRecommendations(this.answers);
                        
                        if (window.ResultsManager && typeof window.ResultsManager.displayResults === 'function') {
                            window.ResultsManager.displayResults(recommendations);
                        } else {
                            displayResults(recommendations);
                        }
                        return;
                    }
                    
                    // Si déjà instancié, utiliser l'instance existante
                    if (window.recommendationEngine) {
                        console.log("Utilisation de l'instance existante");
                        // IMPORTANT: Assurer que l'instance a la méthode displayResults
                        window.recommendationEngine.displayResults = displayResults;
                        const recommendations = window.recommendationEngine.calculateRecommendations(this.answers);
                        
                        if (window.ResultsManager && typeof window.ResultsManager.displayResults === 'function') {
                            window.ResultsManager.displayResults(recommendations);
                        } else {
                            displayResults(recommendations);
                        }
                        return;
                    }
                    
                    // Fallback: Attendre l'événement
                    console.log("Fallback: utilisation de l'approche par événement");
                    const answersData = this.answers;
                    
                    const engineReadyHandler = function() {
                        try {
                            console.log("Événement reçu, initialisation du moteur");
                            window.recommendationEngine = new window.RecommendationEngine();
                            // IMPORTANT: Assurer que l'instance a la méthode displayResults
                            window.recommendationEngine.displayResults = displayResults;
                            const recommendations = window.recommendationEngine.calculateRecommendations(answersData);
                            
                            if (window.ResultsManager && typeof window.ResultsManager.displayResults === 'function') {
                                window.ResultsManager.displayResults(recommendations);
                            } else {
                                displayResults(recommendations);
                            }
                        } catch (error) {
                            console.error("Erreur lors de l'utilisation du moteur:", error);
                            this.showEngineErrorMessage(error);
                        } finally {
                            document.removeEventListener('recommendationEngineReady', engineReadyHandler);
                        }
                    }.bind(this);
                    
                    document.addEventListener('recommendationEngineReady', engineReadyHandler);
                    
                    // Timeout plus long (60 secondes au lieu de 30)
                    setTimeout(() => {
                        if (document.querySelector('#loading-indicator').style.display !== 'none') {
                            console.error("Timeout lors du chargement du moteur de recommandation");
                            document.removeEventListener('recommendationEngineReady', engineReadyHandler);
                            this.showEngineErrorMessage(new Error("Le moteur de recommandation n'a pas pu être chargé dans le délai imparti."));
                        }
                    }, 60000); // 60 secondes de timeout
                } catch (error) {
                    console.error("Erreur lors de l'affichage des résultats:", error);
                    this.showEngineErrorMessage(error);
                } finally {
                    window.hideLoadingIndicator(loadingInterval);
                }
            });
        }
    }
    
    /**
     * Afficher un message d'erreur lié au moteur de recommandation
     */
    showEngineErrorMessage(error) {
        this.questionContainer.innerHTML = `
            <div class="bg-red-900 bg-opacity-20 p-8 rounded-xl text-center">
                <div class="text-6xl text-red-400 mb-4"><i class="fas fa-exclamation-circle"></i></div>
                <h2 class="text-2xl font-bold mb-4">Erreur détectée</h2>
                <p class="mb-6">Détails de l'erreur: ${error.message}</p>
                <p class="text-xs bg-blue-900 bg-opacity-30 p-2 mb-4 overflow-auto text-left">
                    ${error.stack || "Pas de stack trace disponible"}
                </p>
                <button id="restart-btn" class="bg-blue-700 hover:bg-blue-600 text-white px-6 py-3 rounded-lg">
                    <i class="fas fa-redo mr-2"></i> Refaire le test
                </button>
            </div>
        `;
        
        // Informer le glossaire de l'ajout de contenu d'erreur
        setTimeout(() => {
            console.log("Message d'erreur injecté, notification du glossaire");
            document.dispatchEvent(new Event('contentUpdated'));
        }, 10);
        
        document.getElementById('restart-btn').addEventListener('click', () => {
            location.reload();
        });
    }
}

// Fonction pour afficher les résultats (déplacée depuis recommendation-engine.js)
function displayResults(recommendations) {
    console.log("Affichage des résultats dans displayResults:", recommendations);
    // Récupérer les conteneurs
    const resultsContainer = document.getElementById('results-container');
    const questionContainer = document.getElementById('question-container');
    
    if (!resultsContainer) {
        console.error('Conteneur de résultats non trouvé');
        return;
    }
    
    // Masquer le conteneur de questions et afficher celui des résultats
    if (questionContainer) questionContainer.style.display = 'none';
    resultsContainer.style.display = 'block';
    
    if (recommendations.length === 0) {
        resultsContainer.innerHTML = `
            <div class="bg-red-900 bg-opacity-20 p-8 rounded-xl text-center mb-8">
                <div class="text-6xl text-red-400 mb-4"><i class="fas fa-exclamation-circle"></i></div>
                <h2 class="text-2xl font-bold mb-4">Aucun statut juridique correspondant</h2>
                <p class="mb-6">Vos critères semblent incompatibles. Essayez d'assouplir certaines exigences et refaites le test.</p>
                <button id="restart-btn" class="bg-blue-700 hover:bg-blue-600 text-white px-6 py-3 rounded-lg">
                    <i class="fas fa-redo mr-2"></i> Refaire le test
                </button>
            </div>
        `;
        
        document.getElementById('restart-btn').addEventListener('click', () => {
            location.reload();
        });
        
        // Informer le glossaire pour le cas d'erreur
        setTimeout(() => {
            console.log("Message d'erreur 'Aucun statut' injecté, notification du glossaire");
            document.dispatchEvent(new Event('contentUpdated'));
        }, 10);
        
        return;
    }
    
    // Créer le contenu des résultats
    let resultsHTML = `
        <div class="results-container">
            <div class="text-center mb-10">
                <h2 class="text-3xl font-bold mb-3">Votre statut juridique recommandé</h2>
                <p class="text-lg text-gray-300">Basé sur vos réponses, voici les formes juridiques les plus adaptées à votre projet</p>
            </div>
            
            <div class="recommendation-cards">
    `;
    
    // Carte pour chaque recommandation
    recommendations.forEach((recommendation, index) => {
        const status = recommendation.status;
        const isMainRecommendation = index === 0;
        
        resultsHTML += `
            <div class="recommendation-card ${isMainRecommendation ? 'main-recommendation' : ''} bg-opacity-60 bg-blue-900 rounded-xl overflow-hidden mb-8 border ${isMainRecommendation ? 'border-green-400' : 'border-gray-700'}">
                <!-- En-tête -->
                <div class="p-6 flex items-center border-b border-gray-700 ${isMainRecommendation ? 'bg-green-900 bg-opacity-30' : ''}">
                    <div class="h-16 w-16 rounded-full bg-opacity-30 ${isMainRecommendation ? 'bg-green-800' : 'bg-blue-800'} flex items-center justify-center text-3xl mr-5">
                        <i class="fas ${status.logo || 'fa-building'} ${isMainRecommendation ? 'text-green-400' : 'text-gray-300'}"></i>
                    </div>
                    <div class="flex-grow">
                        <div class="flex justify-between items-center">
                            <h3 class="text-2xl font-bold">${status.name}</h3>
                            <div class="score-badge ${isMainRecommendation ? 'bg-green-500 text-gray-900' : 'bg-blue-700'} px-3 py-1 rounded-full text-sm font-medium">
                                Score: ${recommendation.score}/100
                            </div>
                        </div>
                        <p class="text-gray-400 mt-1">
                            ${isMainRecommendation ? 'Recommandation principale' : `Alternative ${index}`}
                        </p>
                    </div>
                </div>
                
                <!-- Contenu -->
                <div class="p-6">
                    <p class="mb-5">${status.description}</p>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Forces -->
                        <div>
                            <h4 class="font-semibold mb-2 flex items-center text-green-400">
                                <i class="fas fa-check-circle mr-2"></i> Points forts
                            </h4>
                            <ul class="space-y-2">
                                ${recommendation.strengths.map(strength => `
                                    <li class="flex items-start">
                                        <i class="fas fa-plus-circle text-green-400 mt-1 mr-2"></i>
                                        <span>${strength}</span>
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                        
                        <!-- Faiblesses -->
                        <div>
                            <h4 class="font-semibold mb-2 flex items-center text-red-400">
                                <i class="fas fa-exclamation-circle mr-2"></i> Points d'attention
                            </h4>
                            <ul class="space-y-2">
                                ${recommendation.weaknesses.map(weakness => `
                                    <li class="flex items-start">
                                        <i class="fas fa-minus-circle text-red-400 mt-1 mr-2"></i>
                                        <span>${weakness}</span>
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                    </div>
                    
                    <!-- Boutons d'action -->
                    <div class="mt-6 flex justify-end">
                        <button class="details-btn bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg mr-3" data-status-id="${status.shortName}">
                            <i class="fas fa-info-circle mr-2"></i> Plus de détails
                        </button>
                        ${isMainRecommendation ? `
                            <button class="download-btn bg-green-500 hover:bg-green-400 text-gray-900 font-medium px-4 py-2 rounded-lg">
                                <i class="fas fa-file-download mr-2"></i> Télécharger le PDF
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    // Fermer les conteneurs
    resultsHTML += `
            </div>
            
            <div class="text-center mt-10">
                <button id="restart-btn" class="bg-blue-700 hover:bg-blue-600 text-white px-6 py-3 rounded-lg">
                    <i class="fas fa-redo mr-2"></i> Refaire le test
                </button>
                <button id="compare-btn" class="bg-green-500 hover:bg-green-400 text-gray-900 font-medium px-6 py-3 rounded-lg ml-4">
                    <i class="fas fa-balance-scale mr-2"></i> Comparer les statuts
                </button>
            </div>
        </div>
    `;
    
    // Injecter le HTML dans le conteneur
    resultsContainer.innerHTML = resultsHTML;
    
    // Informer le glossaire de l'ajout des résultats détaillés
    setTimeout(() => {
        console.log("Résultats détaillés injectés, notification du glossaire");
        document.dispatchEvent(new Event('contentUpdated'));
    }, 100);
    
    // Attacher les événements
    document.getElementById('restart-btn').addEventListener('click', () => {
        location.reload();
    });
    
    // Événements pour les boutons de détails
    document.querySelectorAll('.details-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const statusId = btn.dataset.statusId;
            const recommendationEngine = window.recommendationEngine;
            if (recommendationEngine) {
                // Trouver la recommandation correspondante
                const recommendation = recommendations.find(r => r.status.shortName === statusId);
                if (recommendation) {
                    recommendationEngine.showStatusDetails(recommendation);
                } else {
                    console.error(`Recommandation non trouvée pour ${statusId}`);
                    alert(`Détails non disponibles pour ${statusId}`);
                }
            } else {
                console.error("Moteur de recommandation non disponible");
                alert(`Le moteur de recommandation n'est pas disponible.`);
            }
        });
    });
    
    // Événement pour le bouton de téléchargement PDF
    const downloadBtn = document.querySelector('.download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            alert('Fonctionnalité de téléchargement PDF à implémenter');
        });
    }
    
    // Événement pour le bouton de comparaison
    document.getElementById('compare-btn').addEventListener('click', () => {
        alert('Fonctionnalité de comparaison à implémenter');
    });
}

// IMPORTANT: Exposer l'affichage des résultats de façon cohérente
window.ResultsManager = window.ResultsManager || {};
window.ResultsManager.displayResults = displayResults;

// Solution de l'expert : exporter la fonction displayResults vers window.recommendationEngine
if (window.recommendationEngine) {
    window.recommendationEngine.displayResults = displayResults;
}

// Exposer la classe au niveau global
window.QuestionManager = QuestionManager;

// Vérifier si window.recommendationEngine existe périodiquement et exporter displayResults quand il est disponible
(function checkAndExportDisplayResults() {
    if (window.recommendationEngine) {
        window.recommendationEngine.displayResults = displayResults;
        console.log("Function displayResults successfully exported to window.recommendationEngine");
    } else {
        console.log("window.recommendationEngine not available yet, will check again in 1 second");
        setTimeout(checkAndExportDisplayResults, 1000); // Vérifier à nouveau dans 1 seconde
    }
})();