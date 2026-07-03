# Simulateur Succession / Donation — Document de revue expert

**Destinataire :** notaire / fiscaliste / conseil en gestion de patrimoine
**Objet :** valider les règles encodées et identifier ce qui manque, en particulier côté **optimisation de la transmission**
**Millésime fiscal :** 2026 (barèmes et abattements gelés jusqu'en 2028 — PLF 2026)
**Date :** juillet 2026

---

## 1. Objectif du produit

Permettre à un particulier de **saisir sa configuration familiale et patrimoniale** — qui transmet, à qui, avec quels biens et quels liens — puis d'obtenir, **en fonction des variables**, la **combinaison de leviers** (abattements de donation × assurance-vie × démembrement × structures) qui permet de **transmettre le plus / payer le moins de droits**.

La promesse tient en une phrase : *« comment utiliser au mieux les abattements de donation et l'assurance-vie pour minimiser les droits et maximiser ce qui arrive aux bénéficiaires ? »*

**Ce que nous cherchons dans cette revue :**
1. Les règles fiscales encodées sont-elles **exactes et à jour** (§4) ?
2. Les points d'incertitude que nous avons identifiés (§5) — votre arbitrage.
3. **Surtout : quels leviers ou raisonnements d'optimisation manquent** (§6) ?

---

## 2. Données saisies par l'utilisateur

- **Arbre familial** : personnes, âges, rôles (grand-parent / parent / enfant / conjoint / tiers), liens de filiation et d'union.
- **Rôles** : qui est **donateur** (💰), qui est **bénéficiaire** (🎁). Le lien fiscal donateur→bénéficiaire est **auto-calculé** (ex. grand-mère → petit-fils = petit-enfant ; grand-mère → belle-fille = tiers).
- **Type d'union et régime matrimonial** (mariage / PACS / concubinage ; communauté réduite, universelle, séparation de biens, participation aux acquêts).
- **Patrimoine** ventilé : immobilier, financier, assurance-vie (avec primes avant/après 70 ans), professionnel, passif.
- **Donations déjà réalisées** (pour le rappel fiscal de 15 ans) et **donations reçues** (pour les chemins indirects).
- **Situation internationale** (résidence / nationalité de chaque membre).

---

## 3. Ce qui est modélisé aujourd'hui

### 3.1 Canaux de transmission comparés (par bénéficiaire)
| Canal | Contenu |
|---|---|
| Succession (statu quo) | Droits au décès, barème par lien |
| Donation en pleine propriété | Abattement de parenté + barème |
| Donation en nue-propriété | Démembrement art. 669 (valeur NP = f(âge de l'usufruitier)) |
| Assurance-vie 990 I | Primes < 70 ans : abattement 152 500 €/bénéficiaire, 20 % puis 31,25 % |
| Assurance-vie 757 B | Primes > 70 ans : abattement global 30 500 €, puis DMTG |
| Capitalisation démembré (NP) | Contrat de capitalisation en nue-propriété |
| SCI + donation de parts en NP | Décote d'illiquidité 15 % + démembrement |
| Don manuel + don familial (790 G) | Numéraire, donateur < 80 ans |

### 3.2 Leviers d'optimisation proposés
SCI (décote 15 %) · Foncier rural GFV/GFA/GFI (exonération 75 %, art. 793) · Démembrement croisé pour concubins · Don familial 790 G · Détection **AV manifestement exagérées** (L132-13) · Pacte Dutreil (module dédié) · Multi-donations · Chemins **indirects** (donateur → intermédiaire → cible) avec alerte abus de droit.

### 3.3 Volet civil
Réserve héréditaire / quotité disponible selon le nombre d'enfants (1 → ½, 2 → ⅓, 3+ → ¼) · Usufruit du conjoint (barème 669) · Représentation (petits-enfants d'un parent prédécédé) · Fente successorale · Droits du conjoint / partenaire / concubin au logement · Donation au dernier vivant.

### 3.4 Stratégies par régime
Comparatif mariage / PACS / concubinage · Communauté universelle + clause d'attribution intégrale · Séparation de biens · Testament · Clause bénéficiaire AV (rédaction + second rang) · Réversion d'usufruit du logement · Situation **expatriés / international**.

---

## 4. Barèmes & abattements encodés (à vérifier)

**Abattements (art. 779 & 790 CGI) :** enfant 100 000 € · petit-enfant *donation* 31 865 € / *succession directe* 1 594 € (résiduel 788 IV) · arrière-petit-enfant 5 310 € · conjoint/PACS succession = exonéré, *donation* 80 724 € · frère/sœur 15 932 € · neveu/nièce 7 967 € · tiers 1 594 € · handicap 159 325 € (cumulable) · don familial 790 G 31 865 € · **renouvellement 15 ans**.

**Barème ligne directe (777 CGI) :** 5 % / 10 % / 15 % jusqu'à 15 932 €, **20 %** jusqu'à 552 324 €, 30 % / 40 % / **45 %** au-delà de 1 805 677 €.
**Autres :** frère/sœur 35 % puis 45 % · neveu/nièce & 4e degré 55 % · tiers (dont concubin) 60 %.

**Assurance-vie :** 990 I → abattement 152 500 €/bénéficiaire, 20 % puis **31,25 %** au-delà de 700 000 € (sur le **capital** = primes + produits). 757 B → abattement **global** 30 500 €, produits exonérés.

**Autres paramètres :** abattement RP 20 % (764 bis) · SCI décote 15 % · foncier rural exo 75 % · frais notaire ~1,2 % · rappel fiscal 15 ans.

> **Question 4.a —** Ces valeurs et seuils 2026 sont-ils exacts ? Un point à surveiller pour 2026-2028 (gel confirmé ? exo logement 790 A bis) ?

---

## 5. Points à valider en priorité (incertitudes identifiées)

1. **Petit-enfant en succession directe** — nous appliquons l'abattement résiduel de **1 594 €** (et non 31 865 €, réservé à la donation) hors représentation. **Confirmez-vous ?**
2. **Assurance-vie 757 B (primes > 70 ans)** — nous répartissons l'abattement global de 30 500 € au prorata des bénéficiaires, puis taxons **chacun au barème de son propre lien**. La base doit-elle se **cumuler** avec le reste de la succession de l'héritier (progressivité), ou rester isolée ?
3. **Réintégration d'une AV « exagérée »** — nous chiffrons le risque sur le **contrat entier** (et non le seul dépassement d'un seuil de 35 %). Le seuil de 35 % du patrimoine / 50 % des revenus est-il le bon **indice d'alerte** ?
4. **Don familial 790 G** — conditionné à un donateur **< 80 ans**. Éligibilité exacte des bénéficiaires (petits-enfants ? neveux en l'absence de descendant ?) ?
5. **[DÉCISION MÉTIER F3] Couple donateur** — aujourd'hui, en mode couple, nous cumulons **2 × l'abattement** par enfant (chaque parent donne 100 k). C'est exact **en donation**. Mais pour une **succession**, faut-il modéliser **deux décès successifs** (barèmes qui se rechargent, conjoint survivant qui hérite d'abord) plutôt qu'une masse combinée en un seul barème ? → **votre reco sur la bonne représentation**.
6. **Frères/sœurs — exonération conditionnelle** (art. 796-0 ter : célibataire/veuf, > 50 ans ou infirme, cohabitation 5 ans) : **non implémentée** aujourd'hui. Fréquence / utilité de l'ajouter ?
7. **Créance de restitution (quasi-usufruit / AV démembrée)** — déductible au 2nd décès : nous ne la modélisons pas encore dans le chiffrage. Impact réel ?

---

## 6. Questions ouvertes — OPTIMISATION (le cœur de la revue)

**Complétude des leviers — lesquels manquent ?**
- **Donation-partage** (fige les valeurs, évite le rapport) — transgénérationnelle ; conjonctive en famille recomposée. Bien couverte ?
- **Quasi-usufruit** sur liquidités / **cash-out** (vente puis donation du prix) / **donation avant cession** pour purger la plus-value.
- **Tontine** immobilière ; **démembrement temporaire** ; **OBO / apport-cession** ; **holding familiale** ; **Girardin / démembrement de SCPI**.
- **Present d'usage** (nous l'estimons ~2-2,5 % du patrimoine/an — critère à valider : lié aux revenus, pas au capital ?).
- **PER** en transmission (avant/après 70 ans, sortie) ; **PEA** transmis.
- **Pacte Dutreil** (durée d'engagement LFI 2026, seuils) — module présent, à auditer.

**Séquencement & arbitrages**
- L'**ordre optimal** des leviers (donation → AV → SCI) et l'usage du **rappel 15 ans** (échelonner les donations) sont-ils correctement raisonnés ?
- Arbitrage **990 I vs 757 B** selon l'âge du souscripteur ; plafond 152 500 € **par bénéficiaire tous contrats confondus** (pas par contrat).
- **Frontière de l'abus de droit** (art. L64 LPF) : nos garde-fous sur les chemins indirects (donation en chaîne) sont-ils au bon endroit ? Délai « purgeant » réaliste ?

**Cas particuliers à renforcer ?**
- **Famille recomposée** (beau-enfant : ligne directe seulement sur la part du parent biologique ?).
- **Handicap** (abattement 159 325 €, contrat épargne handicap, mandat de protection).
- **International** (résidence/nationalité, conventions, exit tax, art. 750 ter).
- **Transmission d'entreprise** (Dutreil + donation avec réserve d'usufruit, rémunération du dirigeant).

> **Question 6.a —** Sur un patrimoine « type » (RP + financier + AV + un locatif, 2-3 enfants, un ou deux petits-enfants), quels **3 leviers** recommanderiez-vous en priorité, et dans **quel ordre** ? Cela nous sert de référence pour calibrer le moteur.

---

## 7. Hypothèses et limites assumées (à confirmer)

- Chiffres **indicatifs, non opposables** — toute stratégie doit être validée par un professionnel avant mise en œuvre.
- Répartition **égalitaire** entre bénéficiaires par défaut (sauf saisie).
- Frais de structure (SCI ~1 500 €, notaire) **pas toujours déduits** du gain net affiché.
- Participation aux acquêts : traitement simplifié (créance de participation non calculée).

---

## 8. Ce dont nous avons besoin de votre part

1. Corrections sur §4 (valeurs) et §5 (incertitudes) — idéalement avec référence d'article.
2. Votre arbitrage sur la **décision F3** (§5.5).
3. La **liste des leviers manquants** que vous jugez prioritaires (§6), classés par impact.
4. Un **cas-type commenté** (§6.a) pour calibrer et tester le moteur.

*Merci — vos retours seront intégrés directement dans les règles du simulateur.*
