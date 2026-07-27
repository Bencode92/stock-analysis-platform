# Backtest de l'intégration thématique — méthodologie & prompts

> **But** : décider, *par la donnée et non le narratif*, **comment** intégrer les convictions picks & shovells
> (7 chaînes de valeur, `framework.json`) dans les 4 portefeuilles (Stable / Modéré / Agressif / Agressif-Thematique).
> Document de travail pour Claude Code **et** pour audit externe (Fabre).

---

## 0. Prémisse honnête (à ne jamais oublier)

Un backtest antérieur (Buffett/quality) a montré que **dans un univers déjà filtré qualité, choisir "les meilleures"
actions ≈ tirer au hasard parmi les bonnes**. Le score **filtre** (évite le junk), il ne **classe pas** (pas d'alpha
prédictif titre-par-titre ; IC récent négatif — cf. mémoire projet).

**Conséquence dure** : le framework n'est **PAS** une machine à stock-picking. On **n'essaie pas** de battre le marché
en choisissant ASML plutôt que LRCX. L'edge éventuel est **structurel** :
1. **exposition thématique/factorielle** (équipement semi vs marché large) ;
2. **structure de risque** (plafond capex-IA, thèmes diversifiants).

C'est **ça** qu'on backteste. La sélection intra-thème reste **equal-weight** (ne pas sur-optimiser).

---

## 1. Discipline (garde-fous méthodo — NON négociables)

1. **Justifier la structure AVANT le test.** Le backtest **valide** une hypothèse logique ; il ne **cherche pas** les
   poids optimaux (= overfitting). *(doctrine `filter_doctrine_not_backtest`)*
2. **Point-in-time (PIT) obligatoire.** Pas de look-ahead. Les `perf_ytd` snapshots actuels **ne sont pas** un backtest —
   ils regardent le passé avec la composition d'aujourd'hui.
3. **Survivorship bias documenté.** La liste d'enablers de `framework.json` est *actuelle*. Un backtest sur cette liste
   surestime le rendement (les morts ont disparu). À défaut d'une membership historique, **le déclarer explicitement**
   et interpréter les résultats comme un plafond optimiste.
4. **Out-of-sample.** Séparer une période de calibration d'une période de test.
5. **Coûts inclus.** Turnover × frais (proxy 0,15–0,30 %/transaction), TER pour les ETF.
6. **Pas d'optim à la marge.** Si un écart est <1 pt de Sharpe et non robuste aux fenêtres, **statu quo**
   *(doctrine `no_marginal_optimization`)*.

---

## 2. Les 4 hypothèses (ce qu'on teste, et ce que ça tranche)

| # | Hypothèse | Design | Benchmark | Ce que ça tranche |
|---|-----------|--------|-----------|-------------------|
| **H4** ⭐ | Un **panier equal-weight d'enablers directs** d'un thème bat-il l'**ETF du thème**, net de coûts/risque ? | panier EW enablers (framework.json) vs ETF thème | l'ETF du thème | **ETF-only vs actions en direct** — LE cœur de la décision d'intégration |
| **H2** | Le **plafond capex-IA** réduit-il le **max drawdown** (2022 semi −40 %, corrections 2026) sans tuer le rendement ? | portefeuille avec vs sans contrainte `Σ(poids×facteur capex-IA) ≤ X` | portefeuille non contraint | la **contrainte-maître** a-t-elle une valeur mesurable |
| **H3** | Réseau/défense **décorrèlent-ils vraiment** de semi/IA en fenêtre de stress ? | corrélation roulante + beta en drawdowns marché | — | la thèse « survit au stress IA » tient-elle en données |
| **H1** | Un **tilt thème** (picks & shovels) bat-il le **marché large**, risk-adjusted ? | panier multi-thèmes vs ACWI/VWCE | marché large | le tilt vaut-il le surcroît de risque |

**Ordre recommandé : H4 d'abord** (elle tranche directement l'intégration), puis H2, H3, H1.

---

## 3. Données requises

- **Prix historiques quotidiens**, ≥ 8 ans (2018→2026) pour couvrir : vol 2018, COVID 2020, drawdown semi 2022 (MU −46 %),
  corrections 2026. Source : Twelve Data `time_series` (endpoint `/time_series`, interval `1day`, `outputsize=5000`),
  ou `data/fundamentals_history/`.
- **Univers des paniers** : `framework.json` → pour chaque thème, les tickers `status="data"` (dans le pipeline) +
  `hors_pipe` (cotés, à fetcher). Equal-weight.
- **ETF de benchmark par thème** : SOXX/SMH (semi), ITA/DFEU (défense), URA/NUCG (uranium), un panier réseau (pas d'ETF pur),
  BOTZ (robotique).
- **Marché large** : ACWI ou VWCE (pour H1).

> ⚠️ Les tickers asiatiques (Tokyo Electron 8035, TSMC 2330…) manquent tant que le run Asie n'est pas fusionné.
> **H4/H2/H3 sont faisables sur US+EU seuls** (semi US-equip, défense EU, réseau EU, IA-infra US). H1 idéalement complet.

---

## 4. Métriques & sortie

Par test : **Sharpe, Sortino, max drawdown, CAGR, vol réalisée, corrélation au marché, turnover, coût net**.
Pour H3 : **corrélation roulante 60j** + **beta conditionnel** dans les fenêtres de drawdown marché >10 %.
**Robustesse** : re-tester sur 3 sous-fenêtres (2018-21 / 2021-24 / 2024-26). Un edge non stable = pas un edge.

---

## 5. L'arbre de décision d'intégration (ce que les résultats déclenchent)

```
H4 : panier direct vs ETF thème
 ├─ ETF gagne (ou égalité nette) → poche thématique = ETF-only (la doctrine 12/06 avait raison)
 └─ panier direct gagne net     → poche = mixte, enablers EW + ETF thème

H2 : plafond capex-IA
 ├─ réduit le DD sans coût de rendement → plafond ACTIF, calibré par profil (Stable bas, Agressif haut)
 └─ sans effet                          → plafond = garde-fou nominal, pas de contrainte dure

H3 : décorrélation réseau/défense
 ├─ confirmée en stress → diversifiants sur-pondérés dans Stable/Modéré
 └─ infirmée            → traiter réseau/défense comme du beta cyclique, pas comme un hedge

H1 : tilt thème vs marché
 ├─ ajoute du Sharpe robuste → justifie la poche thématique
 └─ non                      → poche thématique = pari de conviction assumé, taille limitée
```

---

## 6. Prompts prêts à coller (dans Claude Code / l'app)

### Prompt H4 — ETF vs enablers directs (à lancer en premier)
```
Construis un backtest point-in-time comparant, pour chaque thème de framework.json
(semi, ia_infra, défense, nucléaire, réseau), un panier EQUAL-WEIGHT des enablers
directs (tickers status="data" et "hors_pipe") vs l'ETF proxy du thème.
- Prix : daily, 2018-2026, via Twelve Data /time_series (interval 1day, outputsize=5000).
- Rebalancement mensuel, equal-weight (NE PAS optimiser les poids).
- Coûts : 0,20 %/transaction + TER ETF.
- Sortie par thème : Sharpe, Sortino, max DD, CAGR, spread panier-moins-ETF net.
- Robustesse : re-run sur 3 sous-fenêtres (18-21 / 21-24 / 24-26).
- DÉCLARE le survivorship bias (membership actuelle).
- Verdict par thème : le panier direct bat-il l'ETF risk-adjusted ? OUI/NON/ÉGALITÉ.
Ne code aucune optimisation de poids. Equal-weight strict.
```

### Prompt H2 — valeur du plafond capex-IA
```
Backtest PIT : un portefeuille multi-thèmes (paniers EW de framework.json) AVEC
contrainte Σ(poids × facteur_capex_ia) ≤ 35 % vs le MÊME sans contrainte.
Facteurs capex-IA depuis framework.json. Rebalancement mensuel.
Mesure : max drawdown et Sharpe sur 2018-2026, en isolant les fenêtres de stress
(drawdown marché >10 %, notamment 2022 et corrections 2026).
Verdict : la contrainte réduit-elle le DD sans coût de rendement significatif ?
```

### Prompt H3 — décorrélation des diversifiants
```
Calcule la corrélation roulante 60 jours et le beta conditionnel (dans les fenêtres
de drawdown marché >10 %) entre : (a) panier réseau + panier défense, et (b) panier
semi + panier ia_infra, sur 2018-2026. Prix daily Twelve Data.
Verdict : réseau/défense décorrèlent-ils réellement de semi/IA EN STRESS,
ou seulement en marché calme ?
```

### Prompt H1 — le tilt thème vaut-il le coup
```
Backtest PIT : portefeuille = 70 % marché large (ACWI/VWCE) + 30 % paniers thématiques
EW (framework.json, plafond capex-IA 35 %) vs 100 % marché large. 2018-2026,
rebalancement trimestriel, coûts inclus. Mesure Sharpe/Sortino/max DD/CAGR.
Robustesse sur 3 sous-fenêtres. Verdict : le tilt ajoute-t-il du rendement
risk-adjusted de façon STABLE, ou est-ce du bruit ?
```

---

## 7. Ce qu'on NE fait pas (pour rester honnête)

- ❌ Chercher les poids de conviction qui maximisent le Sharpe passé (overfitting garanti).
- ❌ Traiter les `perf_ytd` actuels comme un backtest.
- ❌ Sur-pondérer un enabler sur la base de son ROIC élevé (le ROIC filtre, ne classe pas).
- ❌ Conclure d'un seul run (toujours 3 sous-fenêtres + coûts).

**La sélection intra-thème est equal-weight. La décision qui compte = allocation + contraintes.**
