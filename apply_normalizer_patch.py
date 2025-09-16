#!/usr/bin/env python3
"""
Patch pour modifier generate_portfolios.py et ajouter la normalisation v3 -> frontend
Exécutez ce script pour appliquer les modifications automatiquement
"""

import re

def apply_patch():
    print("🔄 Application du patch de normalisation v3 -> frontend...")
    
    # Lire le fichier existant
    with open('generate_portfolios.py', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Ajouter l'import du module de normalisation après les autres imports
    import_line = "from portfolio_normalizer import normalize_v3_to_frontend_v1, save_portfolios_dual, update_history_index_from_front\n"
    
    # Trouver la position après les imports existants
    import_pos = content.find("from brief_formatter import format_brief_data")
    if import_pos != -1:
        end_of_line = content.find('\n', import_pos) + 1
        content = content[:end_of_line] + import_line + content[end_of_line:]
        print("✅ Import du module de normalisation ajouté")
    
    # 2. Remplacer la fonction save_portfolios existante
    old_save_pattern = re.compile(
        r'def save_portfolios\(portfolios\):.*?(?=\ndef |\Z)',
        re.DOTALL
    )
    
    new_save_function = '''def save_portfolios(portfolios):
    """
    Version modifiée qui utilise la normalisation v3 -> frontend
    """
    print("⚠️ Utilisation de save_portfolios avec normalisation automatique")
    
    # Essayer de récupérer allowed_assets du contexte global si disponible
    allowed_assets = globals().get('_last_allowed_assets', {})
    
    if not allowed_assets:
        print("⚠️ allowed_assets non trouvé dans le contexte, tentative de régénération...")
        # Fallback: essayer de reconstruire depuis filtered_data si disponible
        filtered_data = globals().get('_last_filtered_data', {})
        if filtered_data:
            from generate_portfolios import extract_allowed_assets
            allowed_assets = extract_allowed_assets(filtered_data)
    
    # Normaliser vers le format frontend
    front_json = normalize_v3_to_frontend_v1(portfolios, allowed_assets)
    
    # Sauvegarder les deux formats
    save_portfolios_dual(front_json, portfolios, "v3_stable_compliance")

'''
    
    # Remplacer l'ancienne fonction
    match = old_save_pattern.search(content)
    if match:
        content = old_save_pattern.sub(new_save_function, content)
        print("✅ Fonction save_portfolios remplacée")
    
    # 3. Modifier la partie de main() qui fait la sauvegarde
    # Chercher la partie dans main() qui appelle save_portfolios
    main_pattern = re.compile(
        r'(print\("\\n💾 Sauvegarde des portefeuilles\.\.\."\))\n(\s+)(save_portfolios\(portfolios\))',
        re.MULTILINE
    )
    
    replacement = r'''\1
\2# Récupérer allowed_assets pour la normalisation
\2allowed_assets = extract_allowed_assets(filtered_data)
\2
\2# Sauvegarder allowed_assets et filtered_data dans le contexte global pour réutilisation
\2globals()['_last_allowed_assets'] = allowed_assets
\2globals()['_last_filtered_data'] = filtered_data
\2
\2# Normaliser vers le format frontend et sauvegarder
\2from portfolio_normalizer import normalize_v3_to_frontend_v1, save_portfolios_dual
\2front_json = normalize_v3_to_frontend_v1(portfolios, allowed_assets)
\2save_portfolios_dual(front_json, portfolios, "v3_stable_compliance")
\2
\2print("✅ Portefeuilles normalisés et sauvegardés dans les deux formats")'''
    
    # Appliquer le remplacement dans main()
    if main_pattern.search(content):
        content = main_pattern.sub(replacement, content)
        print("✅ Fonction main() modifiée pour utiliser la normalisation")
    else:
        print("⚠️ Pattern main() non trouvé, vous devrez modifier manuellement")
    
    # Sauvegarder le fichier modifié
    backup_name = 'generate_portfolios_backup.py'
    print(f"📝 Création d'une sauvegarde: {backup_name}")
    with open('generate_portfolios.py', 'r', encoding='utf-8') as f:
        backup_content = f.read()
    with open(backup_name, 'w', encoding='utf-8') as f:
        f.write(backup_content)
    
    print("💾 Écriture du fichier modifié...")
    with open('generate_portfolios.py', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("✅ Patch appliqué avec succès!")
    print("📋 Vérifiez que tout fonctionne avec: python generate_portfolios.py")
    print("🔙 En cas de problème, restaurez depuis: generate_portfolios_backup.py")

if __name__ == "__main__":
    try:
        apply_patch()
    except Exception as e:
        print(f"❌ Erreur lors de l'application du patch: {e}")
        print("Vous devrez appliquer les modifications manuellement")
