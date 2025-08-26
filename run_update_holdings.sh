#!/bin/bash

# Script pour lancer la mise à jour des holdings ETF
# Usage: ./run_update_holdings.sh [options]

set -e  # Arrêter en cas d'erreur

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration par défaut
DEFAULT_MAX_HOLDINGS=10
DEFAULT_STALE_DAYS=7
DEFAULT_SLEEP=1.0

# Banner
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}         📈 MISE À JOUR DES HOLDINGS ETF                      ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Fonction d'aide
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -k, --api-key KEY      Clé API Twelve Data (ou variable TWELVE_DATA_API)"
    echo "  -m, --max-holdings N   Nombre max de holdings par ETF (défaut: $DEFAULT_MAX_HOLDINGS)"
    echo "  -d, --stale-days N     Rafraîchir si > N jours (défaut: $DEFAULT_STALE_DAYS)"
    echo "  -s, --sleep SEC        Pause entre requêtes en secondes (défaut: $DEFAULT_SLEEP)"
    echo "  -f, --force            Forcer la mise à jour même si fichier récent"
    echo "  -t, --test             Tester la configuration sans lancer la mise à jour"
    echo "  -h, --help             Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  $0 -k votre_clé_api                    # Avec clé API"
    echo "  $0 -f                                   # Forcer la mise à jour"
    echo "  $0 -m 5 -s 2.0                         # 5 holdings, pause 2s"
    echo "  $0 -t                                   # Tester seulement"
    exit 0
}

# Variables
API_KEY=""
MAX_HOLDINGS=$DEFAULT_MAX_HOLDINGS
STALE_DAYS=$DEFAULT_STALE_DAYS
SLEEP_TIME=$DEFAULT_SLEEP
FORCE_UPDATE=false
TEST_ONLY=false

# Parser les arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -k|--api-key)
            API_KEY="$2"
            shift 2
            ;;
        -m|--max-holdings)
            MAX_HOLDINGS="$2"
            shift 2
            ;;
        -d|--stale-days)
            STALE_DAYS="$2"
            shift 2
            ;;
        -s|--sleep)
            SLEEP_TIME="$2"
            shift 2
            ;;
        -f|--force)
            FORCE_UPDATE=true
            shift
            ;;
        -t|--test)
            TEST_ONLY=true
            shift
            ;;
        -h|--help)
            show_help
            ;;
        *)
            echo -e "${RED}❌ Option inconnue: $1${NC}"
            echo "Utilisez -h pour l'aide"
            exit 1
            ;;
    esac
done

# Vérifier Python
echo -e "${BLUE}🐍 Vérification de Python...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 n'est pas installé${NC}"
    exit 1
fi
PYTHON_VERSION=$(python3 --version 2>&1 | grep -oE '[0-9]+\.[0-9]+')
echo -e "${GREEN}✅ Python $PYTHON_VERSION trouvé${NC}"

# Vérifier/Installer les dépendances
echo ""
echo -e "${BLUE}📦 Vérification des dépendances...${NC}"
if ! python3 -c "import requests" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Module 'requests' manquant, installation...${NC}"
    pip3 install requests --quiet
    echo -e "${GREEN}✅ Module 'requests' installé${NC}"
else
    echo -e "${GREEN}✅ Module 'requests' déjà installé${NC}"
fi

# Configurer l'API Key
if [ -z "$API_KEY" ]; then
    if [ -n "$TWELVE_DATA_API" ]; then
        API_KEY="$TWELVE_DATA_API"
        echo -e "${GREEN}✅ Clé API chargée depuis l'environnement${NC}"
    else
        echo -e "${YELLOW}⚠️  Aucune clé API fournie${NC}"
        echo -e "   Utilisez: $0 -k VOTRE_CLE_API"
        echo -e "   Ou: export TWELVE_DATA_API=VOTRE_CLE_API"
        if [ "$TEST_ONLY" != true ]; then
            exit 1
        fi
    fi
else
    echo -e "${GREEN}✅ Clé API fournie en paramètre${NC}"
fi

# Mode test uniquement
if [ "$TEST_ONLY" = true ]; then
    echo ""
    echo -e "${BLUE}🧪 Mode TEST - Vérification de la configuration${NC}"
    echo ""
    
    # Exécuter le script de test
    if [ -f "scripts/test_config.py" ]; then
        TWELVE_DATA_API="$API_KEY" python3 scripts/test_config.py
    else
        echo -e "${RED}❌ Script de test introuvable: scripts/test_config.py${NC}"
        exit 1
    fi
    
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    exit 0
fi

# Afficher la configuration
echo ""
echo -sensitive "${BLUE}⚙️  Configuration:${NC}"
echo -e "   - Max holdings/ETF: ${YELLOW}$MAX_HOLDINGS${NC}"
echo -e "   - Péremption: ${YELLOW}$STALE_DAYS jours${NC}"
echo -e "   - Pause entre requêtes: ${YELLOW}${SLEEP_TIME}s${NC}"
echo -e "   - Forcer la mise à jour: ${YELLOW}$FORCE_UPDATE${NC}"

# Vérifier l'état actuel
echo ""
echo -e "${BLUE}📊 État actuel:${NC}"
if [ -f "data/etf_holdings.json" ]; then
    FILE_SIZE=$(du -h data/etf_holdings.json | cut -f1)
    FILE_DATE=$(date -r data/etf_holdings.json '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "inconnue")
    FILE_AGE=$((($(date +%s) - $(date -r data/etf_holdings.json +%s 2>/dev/null || echo 0)) / 86400))
    
    echo -e "   - Fichier existant: ${GREEN}OUI${NC}"
    echo -e "   - Taille: ${YELLOW}$FILE_SIZE${NC}"
    echo -e "   - Date: ${YELLOW}$FILE_DATE${NC}"
    echo -e "   - Âge: ${YELLOW}$FILE_AGE jours${NC}"
    
    if [ "$FORCE_UPDATE" = true ]; then
        echo -e "${YELLOW}⚠️  Suppression pour forcer la mise à jour...${NC}"
        rm -f data/etf_holdings.json
    elif [ $FILE_AGE -lt $STALE_DAYS ]; then
        echo -e "${GREEN}✅ Fichier récent (< $STALE_DAYS jours)${NC}"
        echo ""
        read -p "Voulez-vous quand même mettre à jour? (y/N) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}⏭️  Mise à jour annulée${NC}"
            exit 0
        fi
    fi
else
    echo -e "   - Fichier existant: ${RED}NON${NC}"
    echo -e "   ${YELLOW}→ Création nécessaire${NC}"
fi

# Vérifier sectors.json
echo ""
echo -e "${BLUE}🔍 Vérification de sectors.json...${NC}"
if [ ! -f "data/sectors.json" ]; then
    echo -e "${RED}❌ Fichier sectors.json introuvable${NC}"
    echo -e "   Lancez d'abord la mise à jour des secteurs"
    exit 1
fi

# Compter les ETFs
ETF_COUNT=$(python3 -c "
import json
with open('data/sectors.json') as f:
    data = json.load(f)
    count = sum(len(etfs) for etfs in data.get('sectors', {}).values())
    print(count)
" 2>/dev/null || echo "0")

echo -e "${GREEN}✅ sectors.json trouvé (${ETF_COUNT} ETFs)${NC}"

# Confirmation avant lancement
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}🚀 Prêt à lancer la mise à jour des holdings${NC}"
echo -e "${YELLOW}   Estimation: ~${ETF_COUNT} ETFs × 200 crédits = ~$((ETF_COUNT * 200)) crédits API${NC}"
echo -e "${YELLOW}   Durée estimée: ~$((ETF_COUNT * ${SLEEP_TIME%.*} / 60)) minutes${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

if [ -t 0 ]; then
    read -p "Continuer? (Y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo -e "${YELLOW}⏹️  Annulé par l'utilisateur${NC}"
        exit 0
    fi
fi

# Lancer la mise à jour
echo ""
echo -e "${BLUE}🚀 Lancement de la mise à jour...${NC}"
echo ""

# Exporter les variables d'environnement
export TWELVE_DATA_API="$API_KEY"
export HOLDINGS_MAX="$MAX_HOLDINGS"
export HOLDINGS_STALE_DAYS="$STALE_DAYS"
export HOLDINGS_SLEEP="$SLEEP_TIME"

# Lancer le script Python
if [ -f "scripts/update_holdings.py" ]; then
    python3 scripts/update_holdings.py
    RESULT=$?
else
    echo -e "${RED}❌ Script introuvable: scripts/update_holdings.py${NC}"
    exit 1
fi

# Vérifier le résultat
echo ""
if [ $RESULT -eq 0 ]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ MISE À JOUR TERMINÉE AVEC SUCCÈS !${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    
    if [ -f "data/etf_holdings.json" ]; then
        echo ""
        echo -e "${BLUE}📈 Résumé:${NC}"
        python3 -c "
import json
with open('data/etf_holdings.json') as f:
    data = json.load(f)
    meta = data.get('meta', {})
    print(f'   - ETFs traités: {len(data.get(\"etfs\", {}))}')
    print(f'   - Holdings totaux: {meta.get(\"total_holdings\", 0)}')
    print(f'   - Crédits utilisés: ~{meta.get(\"api_credits_used\", 0)}')
    print(f'   - Fichier: data/etf_holdings.json')
        "
    fi
else
    echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}❌ ERREUR LORS DE LA MISE À JOUR${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "Consultez les logs ci-dessus pour plus de détails"
    exit $RESULT
fi

echo ""
echo -e "${BLUE}💡 Prochaines étapes:${NC}"
echo -e "   - Vérifier le fichier: ${YELLOW}cat data/etf_holdings.json | jq .meta${NC}"
echo -e "   - Voir les holdings d'un ETF: ${YELLOW}cat data/etf_holdings.json | jq '.etfs.XLB'${NC}"
echo -e "   - Lancer l'interface web pour visualiser les données"
echo ""
