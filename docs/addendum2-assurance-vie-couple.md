# Addendum n°2 — Assurance-vie & transmission du couple

**Fait suite à :** la revue expert n°1 (dont nous avons intégré les corrections : LFI 2026, 764 bis, foncier rural, 757 B, F3, etc.).
**Objet :** faire valider un **angle absent de la revue n°1** — l'assurance-vie **en couple** (co-souscription, dénouement, RM Bacquet/Ciot, clause démembrée). Notre moteur ne modélise aujourd'hui que l'AV **mono-titulaire**, ce qui est un manque important pour les couples mariés en communauté.
**Format attendu de votre réponse :** pour chaque affirmation, *confirmer / corriger* avec la référence (article CGI, RM, BOFiP daté).
**Millésime :** 2026.

---

## 0. Ce que le moteur modélise aujourd'hui (et ce qu'il ignore)

**Modélisé :** un contrat = **un titulaire unique**, avec ventilation des **primes versées avant / après 70 ans** (990 I / 757 B), une **clause bénéficiaire** (standard / démembrée) et un capital.

**NON modélisé (objet de ce dossier) :**
- la **co-souscription / co-adhésion** par deux époux ;
- l'origine des fonds (**communs** vs **propres**) ;
- la clause de **dénouement au 1er décès** vs **non-dénouement** (report au 2nd) ;
- le traitement **RM Bacquet → RM Ciot** du contrat non dénoué ;
- la **clause bénéficiaire démembrée** (usufruit au conjoint / NP aux enfants) et la **créance de restitution** au 2nd décès ;
- l'articulation avec le **régime matrimonial** et avec la décision F3 (deux décès successifs).

---

## 1. Co-souscription : les cas à distinguer

Nous prévoyons d'ajouter, au niveau de chaque contrat, deux paramètres : **souscription** (individuelle / co-souscription) et, en co-souscription, **clause de dénouement** (au 1er décès / au 2nd décès), plus l'**origine des fonds** (communs / propres).

| Cas | Mécanique envisagée | À valider |
|---|---|---|
| **A. Individuel** (statu quo) | 990 I / 757 B au décès du titulaire | OK ? |
| **B. Co-souscription, dénouement au 1er décès** | Le contrat se dénoue au 1er décès → capital versé aux bénéficiaires (souvent le survivant → exonéré ; ou enfants → 990 I / 757 B) | **Q1.1** : traitement des primes < 70 / > 70 lorsque le co-souscripteur survivant n'est pas décédé — l'âge de référence est-il celui du **prémourant** ? |
| **C. Co-souscription, non-dénouement au 1er décès** | Le contrat **continue** avec le survivant seul titulaire → **report de la taxation au 2nd décès** ; protège le conjoint (garde la main sur l'épargne) | **Q1.2** : au 2nd décès, la totalité relève-t-elle du régime AV classique selon l'âge du survivant aux versements ? |

---

## 2. Le cœur du sujet : RM Bacquet → RM Ciot (contrat NON dénoué, fonds communs)

Affirmations que nous voulons encoder — **merci de confirmer / corriger** :

**2.1** — Sous **communauté**, un contrat d'assurance-vie **non dénoué** (celui de l'époux **survivant**) alimenté par des **fonds communs** a une **valeur de rachat qui est un actif de communauté**.

**2.2 — RM Bacquet (JOAN 29/06/2010, n°26231, régime antérieur)** : au 1er décès, **la moitié** de cette valeur de rachat était **réintégrée dans l'actif de la succession du prémourant** → **taxable pour les héritiers** (enfants) dès le 1er décès.

**2.3 — RM Ciot (JOAN 23/02/2016, n°78192)** : pour les **successions ouvertes à compter du 1er janvier 2016**, cette valeur de rachat du contrat non dénoué **n'est plus intégrée à l'actif successoral taxable** du prémourant. → **neutralité fiscale au 1er décès** (0 droit pour les enfants sur ce contrat). Le contrat **reste civilement commun** (pris en compte à la liquidation du régime), la taxation étant **reportée au 2nd décès**.

**2.4** — Ce mécanisme ne concerne **que la communauté** (fonds communs). Sous **séparation de biens**, le contrat est **propre** au souscripteur → pas de question de réintégration.

> **Q2.1** — Nos formulations 2.1–2.4 sont-elles exactes ? **Q2.2** — Ciot est-elle une simple tolérance doctrinale (donc fragile / révocable), et faut-il l'assortir d'un avertissement « risque de retour à Bacquet » ? **Q2.3** — Impact concret sur notre décision **F3 (deux décès)** : sans Ciot, on **surestime la masse du 1er décès** — confirmez-vous que la bonne modélisation est : *contrat non dénoué → 0 réintégration au 1er décès → valeur reprise au 2nd décès* ?

**Précision que nous voulons afficher à l'utilisateur (à valider) :** le « 0 taxe » de 2016 bénéficie aux **héritiers** (enfants) sur le contrat non dénoué ; l'**exonération du conjoint survivant**, elle, découle de la **loi TEPA (art. 796-0 bis CGI, 2007)** et non de Ciot. Ce sont **deux règles distinctes** souvent confondues.

---

## 3. Clause bénéficiaire démembrée (usufruit conjoint / NP enfants)

Montage fréquent de protection : le **conjoint** est bénéficiaire en **usufruit** du capital (quasi-usufruit sur des liquidités), les **enfants** en **nue-propriété**.

**3.1** — Répartition de l'abattement **990 I** de 152 500 € : nous prévoyons de le répartir **entre usufruitier et nu-propriétaire au prorata de leurs parts** (barème art. 669 selon l'âge de l'usufruitier), chacun étant réputé bénéficiaire. **Confirmez-vous** cette clé (et son plafonnement) ?

**3.2** — Au **2nd décès** (celui du conjoint quasi-usufruitier), les enfants disposent d'une **créance de restitution** sur la succession, **déductible** de l'actif taxable.

**3.3 — Point d'attention 774 bis (LF 2024)** : l'art. 774 bis rend **non déductibles** certaines dettes de restitution portant sur des **sommes d'argent** dont le défunt s'était réservé l'usufruit. **Q3.1** — La créance de restitution issue d'une **clause bénéficiaire d'AV démembrée** entre-t-elle dans le champ de 774 bis (donc non déductible), ou reste-t-elle **déductible** (quasi-usufruit non issu d'une donation de somme) ? C'est le point qui décide si le montage reste un levier ou est neutralisé.

---

## 4. Régime matrimonial × AV (interactions)

**4.1** — **Communauté universelle + clause d'attribution intégrale** : 0 € au 1er décès, mais **perte des abattements et tranches basses du 1er parent** au 2nd décès. Comment l'AV co-souscrite s'articule-t-elle avec ce régime (le contrat suit-il l'attribution intégrale) ?

**4.2** — **Séparation de biens** : contrats propres, Ciot sans objet. Cas le plus simple — confirmez.

**4.3** — **Récompenses** : en communauté, les primes payées avec des fonds communs sur le contrat propre d'un époux peuvent générer une **récompense** due à la communauté. Faut-il l'intégrer, ou est-ce hors périmètre d'un simulateur grand public ?

---

## 5. Points connexes AV que nous voulons cadrer

- **5.1 Primes manifestement exagérées** (L132-13) : appréciation *in concreto* (Cass. ch. mixte 23/11/2004) ; nous afficherons une **fourchette** (primes exagérées seules ↔ totalité des primes), pas un seuil couperet. OK ?
- **5.2 Plafond 990 I** de 152 500 € : **par bénéficiaire, tous contrats confondus** (pas par contrat). Confirmez.
- **5.3 PER assurance au décès** : c'est l'**âge au décès** (et non aux versements) qui détermine 990 I (< 70 ans) vs 757 B (≥ 70 ans). **Q5.1** — Exact ? Et le 757 B du PER ouvre-t-il le même abattement global de 30 500 € (mutualisé avec l'AV) ?
- **5.4 Nantissement / avances / rachats** : impact sur la valeur transmise — à modéliser ou hors périmètre ?

---

## 6. Cas-type couple à commenter (calibration)

Couple marié **communauté réduite aux acquêts**, 68 ans, 2 enfants. AV : un contrat de **300 k€ co-souscrit** (fonds communs), primes versées avant 70 ans, clause « au conjoint à défaut aux enfants ».

**Q6.1** — Dérouloez le traitement idéal : (a) au 1er décès (Ciot → réintégration ? droits enfants ?) ; (b) options du survivant ; (c) au 2nd décès (990 I, abattements, créance éventuelle). **Q6.2** — Recommanderiez-vous plutôt une **clause démembrée** (usufruit conjoint / NP enfants) ou une **co-souscription avec dénouement au 2nd décès** pour ce couple, et pourquoi ?

---

## 7. Ce dont nous avons besoin

1. Validation / correction des affirmations **§2 (Bacquet/Ciot)** et **§3 (clause démembrée × 774 bis)** — ce sont les deux points structurants, avec références BOFiP datées.
2. Réponses aux questions **Q1.1 → Q6.2**.
3. Votre avis sur le **cas-type §6** (nous nous en servons pour calibrer et tester le moteur).
4. Tout **cas « couple » manquant** que nous n'aurions pas listé (contrats croisés, clause à options, tontine, etc.).

*Merci — ce volet « AV couple » sera intégré en même temps que le refactor « deux décès successifs » (décision F3), auquel il est indissociable.*
