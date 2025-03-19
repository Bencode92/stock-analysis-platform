#!/usr/bin/env python3
import os
import sys
import argparse

# Ajouter le chemin parent pour pouvoir importer le module ml
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml.news_classifier import run_classification

def main():
    parser = argparse.ArgumentParser(description='Classifie les actualités financières')
    parser.add_argument('--input', '-i', required=True, help='Chemin vers le fichier JSON d\'entrée')
    parser.add_argument('--output', '-o', required=True, help='Chemin vers le fichier JSON de sortie')
    
    args = parser.parse_args()
    
    print(f"Classification des actualités du fichier {args.input} vers {args.output}")
    success = run_classification(args.input, args.output)
    
    if success:
        print("Classification terminée avec succès")
        sys.exit(0)
    else:
        print("Erreur lors de la classification")
        sys.exit(1)

if __name__ == "__main__":
    main()