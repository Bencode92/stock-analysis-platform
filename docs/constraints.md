# Contraintes d'Allocation — Documentation Technique

> **Version**: 6.18.1  
> **Dernière mise à jour**: 2025-12-18  
> **Statut**: Production

---

## 1. Vue d'ensemble

Ce document définit les contraintes appliquées par l'optimiseur de portefeuille et leur périmètre d'application.

### 1.1 Principes directeurs

1. **Transparence** : Chaque contrainte a un périmètre clairement défini
2. **Cohérence économique** : Les contraintes reflètent les risques réels de chaque classe d'actifs
3. **Auditabilité** : Les décisions sont documentées avec leur rationale

---

## 2. Contraintes par Profil

### 2.1 Tableau récapitulatif

| Contrainte | Agressif | Modéré | Stable | Périmètre |
|------------|----------|--------|--------|-----------|
| `vol_target` | 18% | 12% | 6% | Portfolio total |
| `vol_tolerance` | ±3% | ±3% | ±3% | Portfolio total |
| `bonds_min` | 5% | 15% | 35% | Obligations uniquement |
| `crypto_max` | 10% | 5% | 0% | Crypto uniquement |
| `max_single_position` | 15% | 15% | 15% | Tous actifs |
| `max_sector` | 30% | 30% | 30% | Tous actifs |
| `max_region` | 50% | 50% | 50% | **Actions uniquement** |
| `min_assets` | 10 | 10 | 10 | Portfolio total |
| `max_assets` | 18 | 18 | 18 | Portfolio total |

### 2.2 Buckets (Rôles) par Profil

| Bucket | Agressif | Modéré | Stable |
|--------|----------|--------|--------|
| CORE | 35-45% | 45-55% | 30-40% |
| DEFENSIVE | 5-15% | 20-30% | 45-60% |
| SATELLITE | 35-50% | 15-25% | 5-15% |
| LOTTERY | 0-5% | 0-2% | 0% |

---

## 3. Décision max_region — Actions Only (v6.18.1)

### 3.1 Définition

```
max_region = 50% s'applique UNIQUEMENT aux Actions
```

### 3.2 Périmètre d'application

| Classe d'actifs | max_region appliqué ? | Justification |
|-----------------|----------------------|---------------|
| **Actions** | ✅ Oui | Risque géographique significatif (politique, devise, régulation) |
| **Obligations** | ❌ Non | Risque principal = duration/crédit, pas géographique |
| **ETF** | ❌ Non | Traité selon sous-jacent (voir §4) |
| **Crypto** | ❌ Non | Actif décorrélé, pas de risque géographique traditionnel |

### 3.3 Rationale économique

#### Pourquoi exclure les Obligations ?

1. **Risque principal différent** : Les obligations sont exposées au risque de taux (duration) et au risque de crédit, pas au risque géographique au sens actions
2. **Univers disponible** : L'univers obligataire est majoritairement US (Treasury, Municipal, Corporate IG). Appliquer max_region 50% rendrait `bonds_min 35%` impossible pour le profil Stable
3. **Corrélation faible** : Les obligations US Treasury sont considérées comme un actif "risk-free" global, pas un actif régional

#### Pourquoi exclure les ETF ?

1. **Classification complexe** : Un ETF peut être domicilié aux US mais investir en Europe (ex: VGK)
2. **Traitement futur** : Les ETF equity-like (Large Blend, Technology) pourront être inclus dans max_region après implémentation de la classification `fund_type`

### 3.4 Implémentation technique

```python
# _fallback_allocation() dans optimizer.py

# Bonds : PAS de check max_region
for bond in bonds[:n_bonds_to_use]:
    # v6.18.1: Bonds exclus de max_region (contrainte = actions only)
    weight = min(profile.max_single_position, weight_per_bond, 100 - total_weight)
    ...

# Autres actifs : check max_region UNIQUEMENT pour Actions
if asset.category == "Actions" and region_weights[asset.region] >= profile.max_region:
    logger.debug(f"Skipping {asset.id}: max_region reached for {asset.region}")
    continue

# Tracking région : UNIQUEMENT pour Actions
if asset.category == "Actions":
    region_weights[asset.region] += weight
```

### 3.5 Impact observé

| Profil | Avant v6.18.1 | Après v6.18.1 |
|--------|---------------|---------------|
| Stable | US 92.85% (violation) | US ~55% bonds + actions diversifiées EU |
| Modéré | US ~70% | US ~50% actions, bonds US autorisés |
| Agressif | US ~65% | US ≤50% actions |

---

## 4. Évolutions futures

### 4.1 Classification ETF equity-like vs bond-like

**Objectif** : Inclure les ETF equity-like dans le périmètre max_region

**Mapping proposé** (basé sur `fund_type` de etf.json) :

| fund_type | Classification | max_region ? |
|-----------|---------------|--------------|
| Large Blend | Equity-like | ✅ Oui |
| Technology | Equity-like | ✅ Oui |
| Large Value | Equity-like | ✅ Oui |
| Foreign Large Blend | Equity-like | ✅ Oui |
| Obligations core | Bond-like | ❌ Non |
| Target Maturity | Bond-like | ❌ Non |
| Derivative Income | Hybrid | ⚠️ À définir |

**Priorité** : Phase 1.3 du plan d'action

### 4.2 Contrainte max_region par classe

Alternative à considérer :

```python
MAX_REGION_BY_CLASS = {
    "Actions": 50.0,
    "ETF_equity": 50.0,
    "ETF_bond": None,  # Pas de limite
    "Obligations": None,
    "Crypto": None,
}
```

---

## 5. Historique des décisions

| Version | Date | Décision | Validé par |
|---------|------|----------|------------|
| v6.18 | 2025-12-17 | Ajout check max_region dans fallback | - |
| v6.18.1 | 2025-12-18 | max_region = Actions only | ChatGPT review ✅ |

---

## 6. Références

- `portfolio_engine/optimizer.py` : Implémentation des contraintes
- `docs/production_readiness.md` : Checklist production
- `docs/audit_questionnaire_v2.md` : Questions d'audit

---

*Document généré dans le cadre de l'audit ChatGPT v2.0 — Conformité AMF P0-9*
