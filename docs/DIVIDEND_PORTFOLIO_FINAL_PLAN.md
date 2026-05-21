# Plan d'exécution dividende — Version validée expert

**Date :** 2026-05-21
**Statut :** Plan révisé après validation expert (3 fixes intégrés)
**Note expert :** 8.5/10 — **GO conditionnel post-fixes**

---

## TL;DR

Plan révisé intégrant les 3 corrections de l'expert + validations contre nos données locales.

| Métrique | Plan initial | **Plan révisé** |
|---|---|---|
| Yield pondéré combiné | 4.3% | **~4.7%** |
| Cash flow brut/an (50 K€) | 2 150 € | **~2 350 €** |
| Italgas (yield supposé 8.3%) | Présent | ❌ **RETIRÉ** (vrai yield 3.56% confirmé) |
| EXSH alternative PEA | Listée | ❌ **Retirée** (non éligible PEA) |
| TotalEnergies | Picks 4 | ✅ **Boosté en remplacement Italgas** |

---

## 1. Décisions stratégiques validées

| Décision | Choix | Validation expert |
|---|---|---|
| Stratégie | **Income pur** | ✅ Cohérent avec besoin cash-flow |
| Cadre fiscal | PEA > 5 ans + CTO T212 perso | ✅ |
| Allocation cible | 70% PEA / 30% CTO | ✅ |
| Setup | **Foundation ETF (70%) + Picks (30%)** | ✅ "Bon plan, déployable" |
| Phasing | 60% maintenant / 25% M+30 / 15% M+60 | ✅ Asymétrique : lump-sum ETF + DCA picks |

---

## 2. Le plan révisé pour 50 K€

### Foundation ETF — 70% (35 K€)

| Compte | ETF | ISIN | Yield | TER | Montant |
|---|---|---|---|---|---|
| PEA | **EEI** WisdomTree Europe Equity Income | IE00BQZJBM26 | **~5.2%** ✅ | 0.29% | 25 000 € |
| CTO | **SCHD** Schwab US Dividend Equity | US8085246083 | **3.3%** ✅ | 0.06% | 10 000 € |

**SCHD validé localement** : yield 3.3%, TER 0.06%, AUM $85.9 Md — confirmation matérielle dans `data/combined_etfs.csv`.
**EEI** : yield réel **5.2%** (vs 4.5% du plan initial) selon vérif web expert. Bonne surprise.

⚠️ **Caveat EEI** : concentration sectorielle **Finance 36% + Utilities 15%** = 51% sur 2 secteurs taux-sensibles. À mitiger via la sélection des picks (éviter de surponder Finance/Utility en picks).

### Picks de conviction — 30% (15 K€)

#### PEA (10 K€) — 4 lignes à 2 500 € chacune

| Ticker | Société | Yield local | Quality | Statut | Rationale |
|---|---|---|---|---|---|
| **LI** | Klépierre (FR) | 5.4% | 71 | ✅ Gardé | REIT EU manquant dans EEI |
| **TTE** | TotalEnergies (FR) | **4.24%** ✅ | 58 | ✅ **PROMU** (remplace Italgas) | Énergie/transition, FCF solide, payout 59% sain |
| **BMED** | Banca Mediolanum (IT) | 5.3% | 83 | ⚠️ **À ARBITRER** | Risque : EEI déjà 36% Finance + Intesa 3.4% en top |
| **ACN** | Accenture (IE via override PEA) | 3.5% | 83 | ⚠️ **À ARBITRER** | Contradiction Income (3.5% < 4%) |

**Décision pre-trade requise** sur BMED et ACN : garder, remplacer ou retirer ?

#### CTO (5 K€) — 2 lignes à 2 500 € chacune

| Ticker | Société | Yield | Quality | Rationale |
|---|---|---|---|---|
| **VICI** | VICI Properties (US REIT) | 6.2% | 89 | ✅ **Pas dans SCHD** (REIT exclu) — vrai edge |
| **AUTO** | Auto Trader (UK) | 3.8% | **88** | ✅ **Pas dans SCHD** (UK + small-mid) — vrai edge |

---

## 3. Corrections critiques appliquées (du retour expert)

### 🔴 Fix 1 — Italgas (IG) RETIRÉ du baseline

**Cause** : le composer UI affichait yield "8.3%" mais **vérification dans `data/stocks_europe.json`** donne :
- `dividend_yield_regular = 3.56%`
- `dividend_yield_ttm = 4.32%`

L'expert confirme via web : cash payout ratio 151.7% (dividende non couvert par cash flows), acquisition 2i Rete Gas 5.3 Md€ = endettement massif. **La thèse 8.3% reposait sur une donnée fausse**.

→ **Action** : `config/dividende_baseline.json` v1.3 retire IG. PEA repasse à 10 lignes baseline. Commit dédié.

### 🔴 Fix 2 — EEI yield était sous-estimé

Plan initial annonçait **4.5%**, l'expert vérifie **5.2-5.5%** sur WisdomTree. Bonne nouvelle.

→ **Action** : aucune (Italgas perdu compensé par EEI plus généreux que prévu).

### 🔴 Fix 3 — EXSH (Stoxx Select Div 30 DE0002635299) **NON éligible PEA**

Domicile Allemagne, ne respecte pas les critères UCITS PEA-compatibles. À retirer définitivement des alternatives.

→ **Action** : ne pas proposer EXSH comme alternative PEA dans futurs docs.

### ⚠️ Fix 4 (à arbitrer) — BMED et ACN à reconsidérer

- **BMED** : avec EEI déjà 36% Finance, ajouter BMED = ~40%+ Finance dans le PEA. Surconcentration.
- **ACN** : Dividend Growth (yield 3.5%), contradiction avec pivot Income pur.

→ **Décision pre-trade** : tu choisis (cf. section 5 ci-dessous).

---

## 4. Métriques portefeuille révisé

| Métrique | Plan initial | **Plan révisé (50 K€)** |
|---|---|---|
| Yield pondéré PEA | 4.37% | **~5.0%** |
| Yield pondéré CTO | 3.36% | **~3.9%** |
| Yield combiné (70/30) | 4.13% | **~4.7%** |
| Cash flow brut/an | 2 065 € | **~2 350 €** ⬆ +14% |
| Cash flow net PEA (sortie 17.2% PS) | — | équivalent ~1 940 € |
| Cash flow net CTO (PFU 31.4% 2026 !) | — | ~400 € net immédiat |
| Concentration max ligne | 50% (EEI) | 49% (EEI) |
| Nombre lignes/ordres | 8 | 7-8 (selon Q4) |
| Frais d'entrée total | ~50 € | ~50 € (0.1%) |

**Note fiscale clé (mise à jour expert)** : flat tax (PFU) 2026 = **31.4%** (12.8% IR + **18.6%** PS, hausse CSG sur revenus capital), pas 30% comme indiqué dans le plan initial. Le coût fiscal d'une rotation CTO est ~5% plus élevé que prévu → renforce le buy-and-hold strict.

---

## 5. Décisions pre-trade restantes (à toi)

<table>
<tr><th>Item</th><th>Option A</th><th>Option B</th><th>Mon penchant</th></tr>
<tr><td><b>BMED</b></td><td>Garder (yield 5.3% mais surponderation Finance)</td><td>Remplacer par un secteur sous-représenté dans EEI (ex: ENGIE FR Utilities, AXA assurance, Sanofi pharma)</td><td>B — diversification > yield marginal</td></tr>
<tr><td><b>ACN</b></td><td>Garder (quality 83, mais contradiction Income à 3.5%)</td><td>Remplacer par income pur (ex: ENGIE 4.9%, ENI 6.5%, Crédit Agricole 6.2%)</td><td>B — cohérence stratégique</td></tr>
</table>

---

## 6. Phasing recommandé (expert)

| Tranche | % | Quand | Quoi (sur plan révisé) |
|---|---|---|---|
| 1 | **60%** | Cette semaine | EEI 25K€ + SCHD 10K€ + LI 2.5K€ + VICI 2.5K€ = **30K€** |
| 2 | **25%** | M+30 jours | TTE 2.5K€ + AUTO 2.5K€ + 2 picks restants (selon Q5) = **12.5K€** |
| 3 | **15%** | M+60 jours | Complétion ou tactical sur drawdown = **7.5K€** |

**Justification** : ETFs en lump-sum (régression vers moyenne, attente coûte ~30bps/mois statistiquement). Picks en DCA partiel (timing matter). 15% gardé en optionalité (drawdown -10% → tu déploies).

---

## 7. Checklist pre-trade (avant de cliquer "Buy")

- [x] **Italgas retiré** du baseline ✅
- [x] **EEI confirmé éligible PEA** (Irlande UCITS IE00BQZJBM26) ✅
- [x] **SCHD validé** matériellement (data locale) ✅
- [ ] **Trancher BMED** (garder vs remplacer)
- [ ] **Trancher ACN** (garder vs remplacer)
- [ ] **Vérifier yield EEI** sur WisdomTree au jour de l'achat (5.2% peut bouger)
- [ ] **Vérifier AUM EEI** > 100M€ (closure risk)
- [ ] **Ordres limites** sur picks individuels, market sur ETFs
- [ ] Confirmer convention fiscale UK pour AUTO (retenue 0% sur dividendes UK→FR depuis 2008)

---

## 8. Statut technique pipeline

- ✅ `config/dividende_baseline.json` v1.3 — Italgas retiré, retour à 10 PEA + 7 CTO
- ✅ Pipeline déterministe, baseline figé fonctionne
- ✅ Détection collisions tickers active (19 cas connus, dont aucun dans le plan d'achat)
- ✅ Données ETF locales (`data/combined_etfs.csv`) confirment SCHD/VIG/VYM/HDV
- ⚠️ **EEI manquant** du dataset ETF local — à ajouter via les workflows ETF (`update-etf-data.yml` ou similaire) pour pouvoir auditer EEI dans les futurs runs sans re-faire de vérif web

---

## 9. La question finale honnête

**C'est optimal ?**

> *"Non, mais c'est suffisamment bon. À ton capital (50 K€), le niveau d'effort pour optimiser à la marge dépasse le bénéfice marginal espéré. Tu as fait 80% du chemin avec 20% de l'effort, c'est rationnel."* — Expert

**Note finale après fixes : 8.5/10**.

**Tu peux exécuter sereinement** dès que tu as tranché BMED et ACN.

---

*Doc auto-généré. Source : `data/stocks_*.json` + `data/combined_etfs.csv` + `config/dividende_baseline.json` v1.3 + retour expert v4. Pipeline reproductible : `python3 generate_portfolios_v4.py`.*
