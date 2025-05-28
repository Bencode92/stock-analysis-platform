# Patch pour ajouter les sources de données dans city-radar.js

## 1. Dans la méthode `createInterface()`, remplacer :

```javascript
                    <!-- Zone de résultats -->
                    <div id="radar-results" class="mt-6 hidden"></div>
                </div>
            </div>
```

Par :

```javascript
                    <!-- Zone de résultats -->
                    <div id="radar-results" class="mt-6 hidden"></div>
                    
                    <!-- Footer avec sources de données -->
                    <div class="data-sources-footer">
                        <div class="sources-container">
                            <div class="sources-header">
                                <i class="fas fa-database"></i>
                                <span>Sources des données</span>
                            </div>
                            <div class="sources-content">
                                <div class="source-item">
                                    <i class="fas fa-home"></i>
                                    <span>Prix immobiliers :</span>
                                    <a href="https://explore.data.gouv.fr/fr/immobilier?onglet=carte&filtre=tous" 
                                       target="_blank" 
                                       rel="noopener noreferrer">
                                        DVF - Demandes de Valeurs Foncières
                                        <i class="fas fa-external-link-alt"></i>
                                    </a>
                                    <span class="source-date">Mise à jour : Octobre 2024</span>
                                </div>
                                <div class="source-item">
                                    <i class="fas fa-coins"></i>
                                    <span>Loyers :</span>
                                    <a href="https://www.data.gouv.fr/fr/datasets/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2024/" 
                                       target="_blank" 
                                       rel="noopener noreferrer">
                                        Indicateurs de loyers d'annonce par commune 2024
                                        <i class="fas fa-external-link-alt"></i>
                                    </a>
                                </div>
                            