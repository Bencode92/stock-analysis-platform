#!/bin/bash
# Script d'automatisation des mises à jour des données financières
# À exécuter via cron pour une actualisation quotidienne

# Chemin vers le répertoire du projet
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS_DIR="$PROJECT_DIR/logs"
SCRIPTS_DIR="$PROJECT_DIR/scripts"

# Création du dossier de logs s'il n'existe pas
mkdir -p "$LOGS_DIR"

# Date et heure pour les logs
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_FILE="$LOGS_DIR/update_$TIMESTAMP.log"

# Fonction pour logger les messages
log() {
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] $1" | tee -a "$LOG_FILE"
}

# Vérifier l'environnement Python
if ! command -v python3 &> /dev/null; then
    log "ERREUR: Python3 n'est pas installé ou n'est pas dans le PATH"
    exit 1
fi

# Définir les variables d'environnement nécessaires
# ATTENTION: Remplacez cette valeur par votre clé API réelle
# Idéalement, stockez cette clé dans un fichier .env ou utilisez les variables d'environnement du système
export FMP_API_KEY="votre_cle_api_ici"

# Notification de démarrage
log "===== DÉBUT DE LA MISE À JOUR DES DONNÉES ====="
log "Répertoire du projet: $PROJECT_DIR"

# Mise à jour des actualités financières
log "1. Mise à jour des actualités financières et thèmes dominants..."
cd "$SCRIPTS_DIR" && python3 fmp_news_updater.py >> "$LOG_FILE" 2>&1
if [ $? -eq 0 ]; then
    log "✅ Actualités et thèmes mis à jour avec succès"
else
    log "❌ Erreur lors de la mise à jour des actualités"
fi

# Mettre à jour d'autres données si nécessaire
# Par exemple, mise à jour des données ETF, crypto, etc.
# log "2. Mise à jour des données ETF..."
# cd "$SCRIPTS_DIR" && python3 update_etf_data.py >> "$LOG_FILE" 2>&1

# Notification de fin
log "===== FIN DE LA MISE À JOUR DES DONNÉES ====="

# Option: Envoyer un email de confirmation
# mail -s "Mise à jour TradePulse $TIMESTAMP" votre@email.com < "$LOG_FILE"

exit 0
