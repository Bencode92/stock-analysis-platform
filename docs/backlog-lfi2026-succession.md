# Backlog succession — intégration retour expert & LFI 2026

Issu de la revue expert (juillet 2026). Chaque ligne : **statut actuel du moteur → correction**.
Type : `FIX` (règle existante fausse/incomplète) · `NEW` (levier absent) · `DÉCISION` · `VÉRIF` (BOFiP à confirmer) · `PRODUIT`.

---

## P0 — Urgent (faux aujourd'hui ou fenêtre calendaire)

| # | Règle | Article | Statut moteur | Correction | Type |
|---|---|---|---|---|---|
| P0.1 | **790 A bis élargi** — don immobilier exonéré | 790 A bis CGI (LFI 2026) | Mentionné en texte, non chiffré | Neuf/rénovation : 100 000 €/donateur, plafond 300 000 €/donataire, **jusqu'au 31/12/2026**. Ancien primo-accédant : **01/01/2026 → 30/06/2027**, fonds employés < 6 mois, conservation 5 ans. Levier phare à afficher avec compte-à-rebours. | NEW |
| P0.2 | **Abattement RP −20 %** appliqué sans condition | 764 bis CGI | Appliqué à toute RP → **surestime** | Succession uniquement + RP occupée au décès par conjoint/partenaire **ou** enfant mineur/protégé. Sinon 0 %. | FIX |
| P0.3 | **Foncier rural 75 %** appliqué à plat | 793 / 793 bis CGI | 75 % flat → **faux sur gros patrimoines** | 75 % jusqu'à un seuil, **50 % au-delà** (seuils récents à confirmer). | FIX + VÉRIF |
| P0.4 | **AV 757 B** taxée isolément | 757 B CGI + BOFiP | Base isolée, prorata 30 500 € sur tous bénéf. | (a) **Cumuler** la base avec la part successorale de chaque héritier (progressivité commune). (b) **Exclure les bénéficiaires exonérés** (conjoint/PACS, TEPA) du prorata des 30 500 €. | FIX |

## P1 — LFI 2026 & manques à fort impact

| # | Règle | Article | Statut moteur | Correction | Type |
|---|---|---|---|---|---|
| P1.1 | **Abattement beaux-enfants** 15 932 € | LFI 2026 | Belle-fille/beau-fils = tiers 60 % après 1 594 € | Nouveau cas dans le calcul auto du lien : beau-enfant ≠ pur tiers. | NEW |
| P1.2 | **Adoption simple de l'enfant du conjoint** → ligne directe | 786 CGI | Absent | Lever à proposer en famille recomposée (ligne directe au lieu de tiers). | NEW |
| P1.3 | **Dutreil — durée** | LFI 2026 | Module à auditer | Engagement individuel **6 ans** (total conservation 8 ans = 2 collectif + 6 individuel), depuis 22/02/2026. | FIX |
| P1.4 | **Dutreil — biens somptuaires** | LFI 2026 (21/02/2026) | Absent | Exonération exclut la fraction représentative de biens non affectés à l'activité depuis ≥ 3 ans. | NEW |
| P1.5 | **Réduction 50 % des droits** (donation PP, donateur < 70 ans) | 790 CGI | Absent (§3.2) | Cumulable Dutreil. Ex. PME 3 M€ / 2 enfants, donateur < 70 ans : ~53 k€ vs ~962 k€. | NEW |
| P1.6 | **774 bis — quasi-usufruit** | 774 bis CGI (LF 2024) | §5.7 partait d'une prémisse fausse | **Distinguer** : quasi-usufruit sur cash **donné** avec réserve = dette **NON déductible** ; quasi-usufruit **successoral** (conjoint, 757) = déductible ; AV démembrée = déductible sous conditions (pas de but principalement fiscal). Ne plus proposer le montage « donation de cash avec réserve de quasi-usufruit ». | NEW |
| P1.7 | **PER assurance en transmission** | — | Absent | C'est l'**âge au décès** (pas au versement) qui détermine 990 I (< 70) vs 757 B (≥ 70). Argument d'arbitrage AV/PER après 70 ans. | NEW |
| P1.9 | **AV co-souscription (couple) + RM Ciot** | RM Ciot 23/02/2016 ; TEPA 2007 | Absent — AV **mono-titulaire** uniquement | Modéliser : (1) **co-souscription** par époux avec fonds communs ; (2) clause de **dénouement au 1er décès** vs **non-dénouement** (report au 2nd décès, protège le survivant) ; (3) **RM Ciot** : le contrat non dénoué sur fonds communs n'est **plus réintégré fiscalement** au 1er décès → **0 droit pour les enfants** au 1er décès (report au 2nd). Ne concerne que la **communauté** (sous séparation, sans objet). Couplé à P1.8. | NEW |
| P1.8 | **[F3] Couple = deux décès successifs** | — | Masse combinée en 1 barème | **Décision expert : TRANCHÉ → deux décès**. Modéliser décès 1 → options conjoint (usufruit légal / ¼ PP / DDV) → masse décès 2 (avec 757 B, créances de restitution, rappel 15 ans **propre à chaque parent**). Montrer le contre-exemple communauté universelle + attribution intégrale (0 € au 1er décès mais perte des abattements/tranches basses au 2nd). | DÉCISION → refactor |

## AV couple — spécification validée (addendum n°2, retour expert)

Règles confirmées/corrigées à encoder, **indissociables du refactor F3** :

| # | Règle | Source | Spécification |
|---|---|---|---|
| AV.1 | **Ciot = neutralité FISCALE, pas civile** | Cass. 1re civ. 31/03/1992 *Praslicka* ; BOFiP BOI-ENR-DMTG-10-10-20-20 (opposable, L80 A LPF) | Séparer les 2 plans. Au 1er décès : contrat non dénoué (fonds communs) → **0 réintégration fiscale**, MAIS **moitié de la valeur de rachat dans la masse CIVILE** (réserve, partage, indivision/créance enfants). Afficher « 0 taxe ≠ 0 conséquence civile ». |
| AV.2 | **990 I démembré : abattement du conjoint PERDU** | LFR 2011 ; art. 669 | Usufruitier conjoint exonéré capte sa quote-part (669) des 152 500 € → **perdue**, non reportée sur les enfants NP. Ex. usufruit 40 % → chaque enfant NP n'a que 60 %×152 500 = 91 500 €. Faire basculer la reco selon `capital / (nb_enfants × 152 500 × quote-part_NP)`. |
| AV.3 | **774 bis : clause AV démembrée HORS champ → déductible, mais CONDITIONNEL** | BOFiP BOI-ENR-DMTG-10-40-20-20 n°200s (26/09/2024) ; CA Toulouse 24/10/2023 n°21/03501 ; art. 773-2° | Créance de restitution déductible au 2nd décès **SI** convention de quasi-usufruit à **date certaine** avant décès usufruitier **ET** pas de remploi requalifiant. Flag : `convention_QU_date_certaine && !remploi → déductible SINON alerte`. Sans ce flag, chiffrage 2nd décès trop optimiste. |
| AV.4 | **Co-souscription B (dénouement 1er décès) : âge de référence** | Pratique de place (pas de BOFiP tranchant) | Défaut = âge du **plus âgé** des co-adhérents au versement (prudent) ; prémourant si connu ; **afficher l'écart** entre hypothèses. Incertitude moyenne → à faire confirmer. |
| AV.5 | **Co-souscription C (non-dénouement)** | — | Dénouement au 2nd décès, ventilation <70/>70 selon âge du **survivant** aux versements. **Une seule couche** d'abattements 990 I (vs 2 en contrats croisés). N'a de sens civil qu'en communauté (idéalt universelle + attribution intégrale). |
| AV.6 | **Plafond 990 I par bénéficiaire ET par ASSURÉ décédé** | art. 990 I | Deux décès successifs de deux assurés → **2 × 152 500 €** pour le même bénéficiaire. Argument quantitatif des **contrats croisés**. |
| AV.7 | **PER : âge au décès + assiette aggravée** | art. 990 I / 757 B (assiette PER à confirmer BOFiP) | Âge **au décès** départage 990 I (<70) / 757 B (≥70). 757 B-**PER** = **totalité** (versements + gains) taxable, ≠ AV (produits exonérés) → nettement plus pénalisant. Abattement 30 500 € **mutualisé** AV 757 B + PER. Levier : arbitrage liquider/conserver le PER si mauvaise santé approchant 70 ans. |
| AV.8 | **Récompense communauté** | art. L132-16 C.assur. | **Pas** de récompense si bénéfice attribué au **conjoint** (sauf primes exagérées). Alerte qualitative seulement si `contrat propre + fonds communs`. |
| AV.9 | **Nouveaux cas couple** | pratique notariale | (1) **Contrats croisés** (2 couches d'abattements, souvent gagnant — comparateur naturel de la co-souscription) ; (2) **clause à options** (conjoint choisit PP/US/mixte au décès) ; (3) **BLOCAGE** : pas de co-souscription dénouement 2nd décès hors communauté (PACS/concubins) ; (4) tontine = hors périmètre. |
| AV.10 | **Reco cas-type** | expert | Capital moyen → **clause démembrée** (économie nette au 2nd décès via créance déductible). Gros contrats (600 k€+) → **non-dénouement** ou **clause à options** peuvent repasser devant (abattement conjoint perdu devient décisif). Afficher les contre-arguments (formalisme convention QU ~500-2 000 €, risque dilapidation usufruitier). |

**Tests de non-régression (avant refactor F3) :** matrice sur le triplet **clause de dénouement × régime matrimonial × âge aux versements** — c'est là que les bugs se logeront.

## P2 — Raffinements / robustesse

| # | Règle | Article | Correction | Type |
|---|---|---|---|---|
| P2.1 | **AV primes exagérées** | L132-13 C.ass. ; Cass. ch. mixte 23/11/2004 | Afficher une **fourchette** (primes exagérées seules ↔ totalité des primes du contrat), pas un chiffre unique. Réaffirmer que 35 %/50 % ne sont **pas** des critères légaux (appréciation in concreto). | FIX |
| P2.2 | **Exonération frère/sœur** | 796-0 ter CGI | Implémenter l'exonération **totale** (célibataire/veuf/divorcé + >50 ans ou infirme + cohabitation 5 ans). Coût quasi nul, évite d'afficher 35-45 % à tort. | NEW |
| P2.3 | **Don familial 790 G** | 790 G CGI | Ajouter condition **donataire majeur/émancipé** ; bénéficiaires = enfants/PE/APE, à défaut neveux/nièces (+ petits-neveux par représentation). | FIX |
| P2.4 | **Petit-enfant en représentation** | 779 CGI | Vérifier que l'abattement 100 000 € est **partagé** entre les petits-enfants du parent prédécédé (pas 100 k€ chacun). | VÉRIF/FIX |
| P2.5 | **Présent d'usage** | jurisprudence | Lier le critère aux **revenus** + exiger une **occasion** ; afficher comme zone grise (pas de % légal). Retirer l'heuristique « 2-2,5 % du patrimoine ». | FIX |
| P2.6 | **Abus de droit** (chemins indirects) | L64 / L64 A LPF | Remplacer « délai X = sûr » par **score multi-critères** (délai + réappropriation des fonds + intention documentée) + disclaimer systématique. Pas de délai « purgeant » légal. | FIX |
| P2.7 | **Décote SCI 15 %** | pratique (pas de texte) | Paramètre **ajustable** (10-20 %) avec **alerte risque de rectification** (surtout si donateur garde gérance + quasi-totalité des parts). | FIX |

## P3 — Produit & méthode

| # | Sujet | Correction | Type |
|---|---|---|---|
| P3.1 | **Fonction objectif** | Élargir « minimiser les droits » → **coût fiscal TOTAL** (DMTG + plus-value/PFU + IFI). Sinon la « donation avant cession » est structurellement sous-valorisée (gain sur l'IR, pas les DMTG). | PRODUIT |
| P3.2 | **Garde-fou donateur** | Ajouter un critère « **reste-à-vivre** » (ne pas donner trop/trop tôt) + coûts non fiscaux (illiquidité Dutreil 8 ans, gouvernance SCI). | PRODUIT |
| P3.3 | **Risque législatif** | Avertissement sur stratégies longues (démembrement, Dutreil 8 ans) : rapport CPO propose de taxer le démembrement ; taxation globale du bénéficiaire revient chaque année. | PRODUIT |
| P3.4 | **Cadre juridique de l'outil** | Un outil qui *recommande* des montages frôle le conseil réglementé (CIF/notariat). Avis juridique dédié, hors revue fiscale. | LEGAL |

## Ne PAS encoder (fantômes — rejetés/non adoptés)

- Amendement Wauquiez AV 70 ans : adopté en commission mais **non repris** dans le texte définitif.
- Taxation globale du bénéficiaire : **rejetée**.
- Abattement handicap 159 325 € : **survit** en 2026 (cumul → 259 325 € pour un enfant handicapé).

## Cas-type de référence (calibration moteur)

Couple ~62 ans · RP 500 k · locatif 300 k · financier 400 k · AV 300 k · 2 enfants · 2 petits-enfants.
Ordre recommandé par l'expert : **1)** donation-partage NP du locatif (réserve d'usufruit, recharge 15 ans) · **2)** restructurer AV avant 70 ans (viser 152 500 €/bénéf., inclure PE dans la clause, second rang ; après 70 ans ne verser que ~30 500 €) · **3)** dons 790 G + **790 A bis** si projet RP · **4)** SCI seulement si multi-biens/indivision (pas pour la décote seule).

## À faire confirmer par le notaire relecteur (BOFiP daté)

Seuils exacts foncier rural (P0.3) · modalités fines 774 bis appliqué à l'AV démembrée (P1.6).
