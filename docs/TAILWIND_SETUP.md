# 🎨 Configuration Tailwind pour les cartes d'actualités optimisées

## 📦 Installation du plugin line-clamp

Pour une troncature parfaite du texte, installez le plugin officiel Tailwind :

```bash
npm install -D @tailwindcss/line-clamp
```

## ⚙️ Configuration tailwind.config.js

Ajoutez le plugin à votre configuration Tailwind :

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./**/*.{html,js}",
    "./js/**/*.js",
    "./css/**/*.css"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        green: {
          400: '#00FF87'
        }
      }
    },
    fontFamily: {
      sans: ['Inter', 'sans-serif']
    }
  },
  plugins: [
    require('@tailwindcss/line-clamp') // 👈 Ajouter cette ligne
  ]
}
```

## 🎯 Fonctionnalités activées

Avec ces modifications, vos cartes d'actualités bénéficient de :

### ✨ Design harmonisé
- **Hauteur uniforme** : 240px minimum pour toutes les cartes
- **Largeur optimale** : Maximum 360px pour éviter les cartes trop larges
- **Layout flex** : Footer toujours en bas de carte

### 📝 Troncature intelligente
- **Titres** : 2 lignes maximum avec `line-clamp-2`
- **Contenu** : 4 lignes maximum avec `line-clamp-4`
- **Fallback** : Troncature JavaScript à 280 caractères au dernier espace

### 🎨 Grille responsive
- **Mobile** : 1 colonne
- **Tablette** : 2 colonnes
- **Desktop** : Auto-fill avec minimum 360px par carte

### 🔄 États visuels
- **Hover** : Élévation + ombres colorées selon l'impact
- **Focus** : Ring vert émeraude pour l'accessibilité
- **Loading** : Spinner animé avec Tailwind

## 🚀 Alternative sans plugin

Si vous ne pouvez pas installer le plugin, le CSS de fallback est déjà inclus :

```css
.line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.line-clamp-4 {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
```

## 📊 Performance

Les optimisations appliquées :

- **Lazy rendering** : Limits respectés (6 critiques, 9 importantes, 12 générales)
- **Smart truncation** : Coupe au dernier espace pour éviter les mots coupés
- **Event delegation** : Gestion optimisée des clics
- **XSS protection** : Échappement HTML automatique

## 🎭 Thèmes supportés

- **Mode sombre** : `bg-zinc-900` par défaut
- **Mode clair** : `bg-white` avec texte adapté
- **Transitions** : Fluides entre les modes

## ✅ Test rapide

Après installation/configuration :

1. **Rechargez la page** avec `Ctrl+Shift+R`
2. **Vérifiez la console** : pas d'erreurs
3. **Testez les filtres** : fonctionnement normal
4. **Observez les cartes** : hauteur uniforme et troncature propre

---

💡 **Note** : Si vous n'utilisez pas de build Tailwind, les classes CSS pures fonctionnent déjà parfaitement grâce aux fallbacks inclus dans `css/news-hierarchy.css`.
