import os
import sqlite3
from datetime import datetime

# Chemin de la base de données
DB_DIR = os.path.join(os.path.dirname(__file__), "data")
DB_FILE = os.path.join(DB_DIR, "news.db")

def init_db():
    """Crée la base de données pour stocker les corrections utilisateur"""
    os.makedirs(DB_DIR, exist_ok=True)
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Table pour les corrections de news
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS news_corrections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            content TEXT,
            original_sentiment TEXT,
            corrected_sentiment TEXT,
            original_impact TEXT,
            corrected_impact TEXT,
            original_hierarchy TEXT,
            corrected_hierarchy TEXT,
            user_id TEXT,
            date TEXT
        )
    ''')
    
    # Table pour les statistiques des corrections
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS correction_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,  -- 'sentiment', 'impact', ou 'hierarchy'
            original_value TEXT,
            corrected_value TEXT,
            count INTEGER,
            last_updated TEXT
        )
    ''')
    
    conn.commit()
    conn.close()
    
    print(f"✅ Base de données initialisée dans {DB_FILE}")
    return True

def save_correction(title, content, original_sentiment, corrected_sentiment, 
                   original_impact, corrected_impact, 
                   original_hierarchy=None, corrected_hierarchy=None, 
                   user_id=None):
    """
    Sauvegarde une correction utilisateur
    
    Args:
        title (str): Titre de l'actualité
        content (str): Contenu de l'actualité
        original_sentiment (str): Sentiment détecté initialement
        corrected_sentiment (str): Sentiment corrigé par l'utilisateur
        original_impact (str): Impact détecté initialement
        corrected_impact (str): Impact corrigé par l'utilisateur
        original_hierarchy (str, optional): Hiérarchie détectée initialement
        corrected_hierarchy (str, optional): Hiérarchie corrigée par l'utilisateur
        user_id (str, optional): Identifiant de l'utilisateur
    
    Returns:
        bool: Succès de l'opération
    """
    try:
        # S'assurer que la base de données existe
        if not os.path.exists(DB_FILE):
            init_db()
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Date actuelle
        current_date = datetime.now().isoformat()
        
        # Insérer la correction
        cursor.execute('''
            INSERT INTO news_corrections (
                title, content, 
                original_sentiment, corrected_sentiment, 
                original_impact, corrected_impact,
                original_hierarchy, corrected_hierarchy,
                user_id, date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            title, content, 
            original_sentiment, corrected_sentiment, 
            original_impact, corrected_impact,
            original_hierarchy, corrected_hierarchy,
            user_id, current_date
        ))
        
        # Mettre à jour les statistiques
        if original_sentiment != corrected_sentiment:
            update_correction_stats(cursor, 'sentiment', original_sentiment, corrected_sentiment)
        
        if original_impact != corrected_impact:
            update_correction_stats(cursor, 'impact', original_impact, corrected_impact)
        
        if original_hierarchy and corrected_hierarchy and original_hierarchy != corrected_hierarchy:
            update_correction_stats(cursor, 'hierarchy', original_hierarchy, corrected_hierarchy)
        
        conn.commit()
        conn.close()
        
        print(f"✅ Correction sauvegardée pour : {title}")
        return True
        
    except Exception as e:
        print(f"❌ Erreur lors de la sauvegarde de la correction: {e}")
        return False

def update_correction_stats(cursor, correction_type, original_value, corrected_value):
    """
    Met à jour les statistiques de correction
    
    Args:
        cursor: Curseur SQLite
        correction_type (str): Type de correction ('sentiment', 'impact', 'hierarchy')
        original_value (str): Valeur originale
        corrected_value (str): Valeur corrigée
    """
    current_date = datetime.now().isoformat()
    
    # Vérifier si cette paire de correction existe déjà
    cursor.execute('''
        SELECT id, count FROM correction_stats 
        WHERE type = ? AND original_value = ? AND corrected_value = ?
    ''', (correction_type, original_value, corrected_value))
    
    result = cursor.fetchone()
    
    if result:
        # Mettre à jour le compteur
        stat_id, count = result
        cursor.execute('''
            UPDATE correction_stats 
            SET count = ?, last_updated = ? 
            WHERE id = ?
        ''', (count + 1, current_date, stat_id))
    else:
        # Créer une nouvelle entrée
        cursor.execute('''
            INSERT INTO correction_stats (type, original_value, corrected_value, count, last_updated)
            VALUES (?, ?, ?, ?, ?)
        ''', (correction_type, original_value, corrected_value, 1, current_date))

def get_correction_stats(correction_type=None):
    """
    Récupère les statistiques de correction
    
    Args:
        correction_type (str, optional): Type de correction à filtrer ('sentiment', 'impact', 'hierarchy')
        
    Returns:
        list: Liste des statistiques de correction
    """
    try:
        if not os.path.exists(DB_FILE):
            return []
            
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        if correction_type:
            cursor.execute('''
                SELECT type, original_value, corrected_value, count, last_updated 
                FROM correction_stats 
                WHERE type = ?
                ORDER BY count DESC
            ''', (correction_type,))
        else:
            cursor.execute('''
                SELECT type, original_value, corrected_value, count, last_updated 
                FROM correction_stats 
                ORDER BY type, count DESC
            ''')
        
        stats = cursor.fetchall()
        conn.close()
        
        # Formater les résultats
        return [
            {
                "type": row[0],
                "original_value": row[1],
                "corrected_value": row[2],
                "count": row[3],
                "last_updated": row[4]
            }
            for row in stats
        ]
        
    except Exception as e:
        print(f"❌ Erreur lors de la récupération des statistiques: {e}")
        return []

def get_correction_samples(max_samples=100):
    """
    Récupère un échantillon de corrections pour l'entraînement
    
    Args:
        max_samples (int): Nombre maximum d'échantillons à récupérer
        
    Returns:
        list: Liste des échantillons de correction
    """
    try:
        if not os.path.exists(DB_FILE):
            return []
            
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT title, content, original_sentiment, corrected_sentiment, 
                   original_impact, corrected_impact, 
                   original_hierarchy, corrected_hierarchy, date
            FROM news_corrections
            ORDER BY date DESC
            LIMIT ?
        ''', (max_samples,))
        
        corrections = cursor.fetchall()
        conn.close()
        
        # Formater les résultats
        return [
            {
                "title": row[0],
                "content": row[1],
                "sentiment": {
                    "original": row[2],
                    "corrected": row[3]
                },
                "impact": {
                    "original": row[4],
                    "corrected": row[5]
                },
                "hierarchy": {
                    "original": row[6],
                    "corrected": row[7]
                },
                "date": row[8]
            }
            for row in corrections
        ]
        
    except Exception as e:
        print(f"❌ Erreur lors de la récupération des échantillons: {e}")
        return []

def export_training_data(file_path=None):
    """
    Exporte les données de correction au format JSON pour l'entraînement
    
    Args:
        file_path (str, optional): Chemin du fichier d'export
        
    Returns:
        tuple: (bool, str) Succès de l'opération et chemin du fichier
    """
    import json
    
    try:
        samples = get_correction_samples(max_samples=1000)
        
        if not samples:
            return False, "Aucune donnée de correction disponible"
        
        if file_path is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            file_path = os.path.join(DB_DIR, f"training_data_{timestamp}.json")
        
        # Formater les données pour l'entraînement
        training_data = {
            "sentiment": [],
            "impact": [],
            "hierarchy": []
        }
        
        for sample in samples:
            # Données pour l'entraînement du sentiment
            if sample["sentiment"]["original"] != sample["sentiment"]["corrected"]:
                training_data["sentiment"].append({
                    "text": f"{sample['title']}. {sample['content']}",
                    "label": sample["sentiment"]["corrected"]
                })
            
            # Données pour l'entraînement de l'impact
            if sample["impact"]["original"] != sample["impact"]["corrected"]:
                training_data["impact"].append({
                    "text": f"{sample['title']}. {sample['content']}",
                    "label": sample["impact"]["corrected"]
                })
            
            # Données pour l'entraînement de la hiérarchie
            if sample["hierarchy"]["original"] and sample["hierarchy"]["corrected"] and \
               sample["hierarchy"]["original"] != sample["hierarchy"]["corrected"]:
                training_data["hierarchy"].append({
                    "text": f"{sample['title']}. {sample['content']}",
                    "label": sample["hierarchy"]["corrected"]
                })
        
        # Sauvegarder les données
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(training_data, f, ensure_ascii=False, indent=2)
        
        print(f"✅ Données d'entraînement exportées vers {file_path}")
        print(f"   - Sentiment: {len(training_data['sentiment'])} exemples")
        print(f"   - Impact: {len(training_data['impact'])} exemples")
        print(f"   - Hiérarchie: {len(training_data['hierarchy'])} exemples")
        
        return True, file_path
        
    except Exception as e:
        print(f"❌ Erreur lors de l'export des données d'entraînement: {e}")
        return False, str(e)

# Pour un test rapide
if __name__ == "__main__":
    # Initialiser la base de données
    init_db()
    
    # Test avec quelques exemples
    save_correction(
        title="Le marché boursier s'effondre suite à la hausse des taux d'intérêt",
        content="Les marchés ont connu une chute brutale suite à l'annonce de la Fed.",
        original_sentiment="neutral",
        corrected_sentiment="negative",
        original_impact="neutral",
        corrected_impact="high",
        original_hierarchy="normal",
        corrected_hierarchy="critical"
    )
    
    # Afficher les statistiques
    stats = get_correction_stats()
    print("\nStatistiques de correction:")
    for stat in stats:
        print(f"{stat['type']}: {stat['original_value']} -> {stat['corrected_value']} ({stat['count']} fois)")
    
    # Exporter les données d'entraînement
    success, file_path = export_training_data()
    if success:
        print(f"\nDonnées d'entraînement exportées vers: {file_path}")
