// question-manager.js - Gestion de l'affichage et de la navigation entre les questions

import { questions, sections, quickStartQuestions } from './question-data.js';

class QuestionManager {
    constructor() {
        this.currentSectionIndex = 0;
        this.currentQuestionIndex = 0;
        this.sectionQuestions = {}; // Pour stocker les questions par section
        this.currentSectionQuestionIndex = 0; // Index de la question dans la section courante
        this.answers = {};
        this.isQuickStart = false;
        this.maxProgress = questions.length;
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
        sections.forEach(section => {
            this.sectionQuestions[section.id] = questions.filter(q => q.sectionId === section.id);
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
        this.filteredQuestions = questions.filter(q => quickStartQuestions.includes(q.id));
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
        const questionsToUse = this.isQuickStart ? this.filteredQuestions : questions;
        
        // Créer une étape par section (regrouper les questions par section)
        const uniqueSections = [];
        questionsToUse.forEach(question => {
            if (!uniqueSections.includes(question.sectionId)) {
                uniqueSections.push(question.sectionId);
            }
        });
        
        // Rendre chaque étape
        uniqueSections.forEach((sectionId, index) => {
            const section = sections.find(s => s.id === sectionId);
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
        const questionsToUse = this.isQuickStart ? this.filteredQuestions : questions;
        return (this.currentQuestionIndex / questionsToUse.length) * 100;
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
            const currentSectionId = sections[this.currentSectionIndex].id;
            const sectionQuestions = this.sectionQuestions[currentSectionId] || [];
            