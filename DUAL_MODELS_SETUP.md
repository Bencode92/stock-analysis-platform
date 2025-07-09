# 🚀 TradePulse v4.0 - Dual Specialized Models

## ⚡ Test Rapide

### 1. **Configuration**
```bash
# Copier le template
cp .env.template .env

# Éditer avec vos tokens
nano .env
```

### 2. **Variables à configurer**
```bash
# Dans .env
TRADEPULSE_MODEL_SENTIMENT=Bencode92/tradepulse-finbert-sentiment
TRADEPULSE_MODEL_IMPORTANCE=Bencode92/tradepulse-finbert-importance
HF_READ_TOKEN=hf_your_actual_token_here
FMP_API_KEY=your_fmp_api_key_here
```

### 3. **Test de chargement des modèles**
```bash
# Test simple
python -c "
import os
os.environ['TRADEPULSE_MODEL_SENTIMENT'] = 'Bencode92/tradepulse-finbert-sentiment'
os.environ['TRADEPULSE_MODEL_IMPORTANCE'] = 'Bencode92/tradepulse-finbert-importance'
os.environ['HF_READ_TOKEN'] = 'your_token'

from scripts.fmp_news_updater import _get_dual_models
models = _get_dual_models()
print('✅ Dual models loaded successfully!')
print(f'📊 Sentiment: {list(models.keys())}')
"
```

### 4. **Lancement complet**
```bash
# Avec logs détaillés
python scripts/fmp_news_updater.py
```

### 5. **Logs attendus**
```
🚀 Starting TradePulse Investor-Grade News Collection v4.0...
🎯 Dual Specialized Models: sentiment + importance
🚀 Loading dual specialized models...
  🎯 Sentiment: Bencode92/tradepulse-finbert-sentiment
  ⚡ Importance: Bencode92/tradepulse-finbert-importance
🤖 Dual specialized models loaded in 3.45s
...
🎯 Dual Specialized Models Performance Summary:
  Sentiment Model: Bencode92/tradepulse-finbert-sentiment
  Importance Model: Bencode92/tradepulse-finbert-importance
  System Version: dual-specialized-v4.0
  Sentiment Articles: 142
  Importance Articles: 142
  Avg Confidence: 0.847
  Avg Importance: 67.2
✅ TradePulse v4.0 with Dual Specialized Models completed successfully!
```

## 🔧 **Dépannage**

### **Modèles non trouvés**
```bash
# Vérifier les tokens
echo $HF_READ_TOKEN

# Tester l'accès HuggingFace
python -c "from transformers import AutoTokenizer; print(AutoTokenizer.from_pretrained('Bencode92/tradepulse-finbert-sentiment', token='your_token'))"
```

### **Mémoire insuffisante**
```bash
# Activer CPU uniquement
export CUDA_VISIBLE_DEVICES=""
```

### **Performance lente**
```bash
# Vérifier GPU
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"
```

## 📊 **Nouvelles métadonnées**

Chaque article aura maintenant :
```json
{
  "impact": "positive",
  "impact_prob": {
    "positive": 0.872,
    "neutral": 0.098,
    "negative": 0.030
  },
  "sentiment_metadata": {
    "model": "Bencode92/tradepulse-finbert-sentiment",
    "specialized": true
  },
  "importance_score": 78.2,
  "importance_metadata": {
    "model": "Bencode92/tradepulse-finbert-importance",
    "ml_score": 73.2,
    "specialized": true
  }
}
```

## 🎯 **Avantages v4.0**

✅ **100% spécialisé** : Modèles fine-tunés pour chaque tâche  
✅ **Performance optimale** : Chargement unique avec cache  
✅ **Compatibilité** : Fonctionne avec votre pipeline existant  
✅ **Monitoring** : Métriques détaillées pour chaque modèle  
✅ **Robustesse** : Gestion d'erreur et fallback  

Votre système est maintenant optimisé avec vos modèles spécialisés ! 🚀
