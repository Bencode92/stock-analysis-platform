"""
Script pour exécuter les tests d'impact et afficher les résultats visuellement

Ce script combine l'exécution du test et sa visualisation dans un navigateur.
"""

import os
import json
import shutil
import webbrowser
import subprocess
from datetime import datetime
import test_impact

# Chemins des fichiers
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(BASE_DIR, "test_results")
LATEST_RESULTS_PATH = os.path.join(RESULTS_DIR, "impact_test_results_latest.json")
VISUALIZE_HTML_PATH = os.path.join(RESULTS_DIR, "visualize_results.html")

def main():
    """Exécute le test et affiche les résultats"""
    print("🚀 Exécution des tests d'impact...")
    
    # S'assurer que le répertoire des résultats existe
    os.makedirs(RESULTS_DIR, exist_ok=True)
    
    # Exécuter le test d'impact et obtenir les résultats
    test_impact.main()
    
    # Trouver le fichier de résultats le plus récent
    result_files = [f for f in os.listdir(RESULTS_DIR) if f.startswith("impact_test_results_") and f.endswith(".json")]
    result_files.sort(reverse=True)  # Le plus récent en premier
    
    if not result_files:
        print("❌ Aucun fichier de résultats trouvé.")
        return
    
    latest_file = os.path.join(RESULTS_DIR, result_files[0])
    
    # Copier vers le fichier "latest" pour faciliter l'accès
    try:
        shutil.copy2(latest_file, LATEST_RESULTS_PATH)
        print(f"✅ Résultats copiés vers: {LATEST_RESULTS_PATH}")
    except Exception as e:
        print(f"❌ Erreur lors de la copie du fichier: {e}")
    
    # Ouvrir le fichier HTML dans le navigateur
    if os.path.exists(VISUALIZE_HTML_PATH):
        print(f"🌐 Ouverture des résultats dans le navigateur...")
        
        # Ouvrir avec webbrowser (fonctionne pour une utilisation locale)
        webbrowser.open('file://' + os.path.abspath(VISUALIZE_HTML_PATH))
        
        # Alternative: démarrer un serveur HTTP simple
        try:
            # Déterminer le dossier racine (répertoire test_results)
            server_dir = RESULTS_DIR
            
            import http.server
            import socketserver
            import threading
            
            PORT = 8000
            
            class Handler(http.server.SimpleHTTPRequestHandler):
                def __init__(self, *args, **kwargs):
                    super().__init__(*args, directory=server_dir, **kwargs)
            
            def run_server():
                with socketserver.TCPServer(("", PORT), Handler) as httpd:
                    print(f"🌐 Serveur démarré sur le port {PORT}. Ouvrez http://localhost:{PORT}/visualize_results.html")
                    httpd.serve_forever()
            
            # Démarrer le serveur dans un thread séparé
            server_thread = threading.Thread(target=run_server)
            server_thread.daemon = True
            server_thread.start()
            
            # Ouvrir le navigateur avec l'URL du serveur local
            webbrowser.open(f'http://localhost:{PORT}/visualize_results.html')
            
            # Attendre que l'utilisateur arrête le serveur avec Ctrl+C
            try:
                input("\n👉 Appuyez sur Ctrl+C pour arrêter le serveur et quitter...\n")
            except KeyboardInterrupt:
                print("Serveur arrêté.")
        
        except ImportError:
            print("Module serveur HTTP non disponible. Ouverture avec le navigateur uniquement.")
    else:
        print(f"❌ Fichier de visualisation non trouvé: {VISUALIZE_HTML_PATH}")
        print(f"👉 Ouvrez les résultats manuellement: {latest_file}")

if __name__ == "__main__":
    main()
