# Phase 2 — Diff attendu (à valider avant merge)

**Date** : 2026-06-11
**Branche** : `phase2-prefilter-broker`
**Snapshot data** : `data/score_history/scores_2026-06-08.json`

Document rédigé **avant** d'avoir touché le code. Toute différence entre ce diff attendu et le diff observé après run du pipeline = stop et investigation, pas rationalisation a posteriori.

---

## Doctrine actée pour cette phase

### 1. Pré-filtrage broker en amont (Fabre v3)

L'univers passe par `config/broker_access.json` **avant** T1 du `_get_top_natives_for_profile()` et `_get_top_thematic_satellite()`. Conséquence : un ticker `access: false` ne peut jamais apparaître dans aucun pool de sélection d'aucun profil.

Test d'acceptation : `tests/test_no_blocked_in_pools.py` assert qu'aucun ticker bloqué n'est dans portfolios.json après run.

### 2. Option A : pool qualité partagé Modéré + Agressif

Le code v6.3 (`core_satellite_discipline.py:253-276`) qui élargit le pool Agressif à `_profile_native ∈ ('Agressif', 'Modéré')` triés par `_fit_modere` n'est pas un bug, c'est un design assumé : **l'agressivité du profil Agressif vient du β cœur (VWCE 50% + IWDA 15%), pas de la sélection satellite**. Conséquence : Agressif et Modéré peuvent partager 80%+ des satellites.

### 3. Politique des positions orphelines (option 2 grandfathering)

> **Une position détenue est conservée tant qu'elle passe hard_filters + toxicity, même si elle ne serait plus sélectionnée aujourd'hui par le pipeline.**

Conséquences immédiates sur les portefeuilles 2026-06-08 :
- **DECK Modéré** : vol 45.74 > band max 45.0 → **sortira** dès le premier run de re-validation mensuelle (phase 3, action #8).
- **DECK Agressif** : vol 45.74 ≤ band max 120 + Buf 100 ≥ 60 → reste détenu si position existante.
- **APH/ABBN/LOGN/EME Thematique** : pas re-générés par le nouveau pipeline, mais valides → restent détenus.

Cette politique est le pendant assumé du sticky bonus : on n'arbitre pas pour optimiser, on arbitre seulement pour sortir l'invalide.

---

## Diff portfolios.json attendu

### Stable
**Attendu : aucun changement.**
- Actions : ADM, BVI, PUB, NTGY (toutes accessibles, aucune substitution active).
- Hard filters : tous passent (vol max 28, ADM 22.45 < 28 ✓).
- Justification : Stable n'a pas de top fit bloqué (HEROMOTOCO et LUPIN ne sont pas dans le top 10 Stable).

### Modéré
**Attendu : DECK sort, remplacé par le prochain candidat naturel du pool (CBOE le plus probable).**

| Position | Avant | Après attendu | Pourquoi |
|---|---|---|---|
| NOVN 5% | ✓ | ✓ | Top 2 fit_modere (HEROMOTOCO bloqué → NOVN devient #1 accessible) |
| EXPD 5% | ✓ | ✓ | Top 3 |
| CF 5% | ✓ | ✓ | Top 4 |
| DECK 5% | ✓ | ❌ | Entrait via substitution HEROMOTOCO→DECK ; HEROMOTOCO filtré amont, pas de substitution déclenchée. DECK fit_modere ~0.92 (hors top 5 natif). |
| **CBOE 5%** | ❌ | ✓ | Prochain candidat accessible fit_modere 0.9609 vol 23.39 Buf 100 |

**Mais** : le portefeuille existant garde DECK Modéré actuel (politique grandfathering). Le diff portfolios.json reflète la **cible de sélection**, pas l'exécution réelle.

### Agressif
**Attendu : DECK probablement sort, remplacé par CBOE — à vérifier sur run réel.**

Pool Agressif (code v6.3) : `native ∈ ('Agressif', 'Modéré') AND vol ≥ 20 AND Buf ≥ 70`, tri par `_fit_modere`.

- NOVN fit 0.9726 : vol 19.47 < 20 → exclu (pas top 5 ici)
- EXPD fit 0.9663 vol 25.74 ✓
- CF fit 0.9645 vol 34.47 ✓
- ITX fit 0.9625 vol 23.21 ✓
- CBOE fit 0.9609 vol 23.39 ✓
- LOGN fit 0.9536 vol 32.7 ✓
- DECK fit ~0.92 vol 45.74 ✓ → en dessous des 5 premiers

Top 5 attendu après pré-filtrage : **EXPD, CF, ITX, CBOE, LOGN**. DECK out.

### Agressif-Thematique
**Attendu : APH et ABBN sortent (substitutions disparues), FIX et TER entrent.**

Pool Thematique : `vol ≥ 30 AND Buf ≥ 65`, tri par `_fit_agressif`, diversification max 2/pays + max 2/industry.

Top fit_agressif accessible filtré + diversifié :
1. **FRES** (UK, métaux précieux) fit 1.000 vol 44.5 — reste
2. **FIX** (US, construction services) fit 0.998 vol 50.2 — entre
3. **TER** (US, semis) fit 0.995 vol 53.2 — entre
4. **LOGN** (Suisse, hardware) fit 0.954 vol 32.7 — reste
5. **EME** (US, construction services) — 3e US → ❌ écarté par cap pays 2/US, ou 2e industry construction OK

Top 5 candidat : **FRES, FIX, TER, LOGN, [5e à déterminer : EME si construction <2, sinon GALP/IEMG?]**

Changements certains :
- **APH out** (entrait via substitution 3653→APH ; 3653 filtré amont).
- **ABBN out** (entrait via substitution POWERINDIA→ABBN ; POWERINDIA filtré amont).
- **EME** : incertain selon ordre du dédup industry.

### Dividende-PEA / Dividende-CTO
**Attendu : aucun changement.**
- PEA : WKL, CAP, REC, HNR1 — aucun bloqué.
- CTO : VICI, VZ, IMB, GLPI, PG, AUTO, SHEL, SCHN, TROW — aucun bloqué.
- PEA_ELIGIBLE_COUNTRIES et CTO_ELIGIBLE_COUNTRIES n'incluent pas l'Asie de toute façon.

---

## Critères d'acceptation (à vérifier après run)

| # | Critère | Mesure |
|---|---|---|
| C1 | Aucun ticker `access: false` dans aucun `Actions` de aucun profil | grep + assert |
| C2 | DECK absent de Modéré.Actions | présence/absence |
| C3 | APH, ABBN absents de Agressif-Thematique.Actions | présence/absence |
| C4 | Stable.Actions identique à 2026-06-08 | diff strict |
| C5 | Dividende-PEA.Actions et Dividende-CTO.Actions identiques | diff strict |
| C6 | `_broker_substitutions` clé absente de tous les profils | clé absente |
| C7 | Total weights = 100% par profil | sum check |
| C8 | Aucun changement bond/ETF | diff section ETF/Obligations |

**Tout écart non listé = stop et investigation.**

---

## Plan d'exécution

1. **Commit snapshot** sur `main` (état pré-phase2).
2. **Branche** `phase2-prefilter-broker`.
3. **Phase 2.1** : pré-filtrage broker dans `_get_top_natives_for_profile()` + `_get_top_thematic_satellite()` + test acceptation → commit.
4. **Phase 2.2** : suppression de `apply_broker_access_substitution()` + archivage `asian_alternatives.json` → commit.
5. **Phase 2.3** : doc/cleanup du code mort `_fit_agressif` (au choix : suppression ou documentation) → commit.
6. **Run pipeline** sur snapshot 2026-06-08.
7. **Comparer** diff observé vs ce document.
8. **Merger** uniquement si match parfait.
