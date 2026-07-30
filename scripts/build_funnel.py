#!/usr/bin/env python3
"""Builder ENTONNOIR — Secteur → Chaîne → Région → Action, avec panel multi-axes par nœud.

Lit  : data/framework.json (les chaînes + enablers), data/stocks_{us,europe,asia}.json (90 var/action).
Écrit: data/funnel.json — lu par funnel.html (fetch même-origine, aucune API en direct).

Doctrine : DÉCRIT et FILTRE (médianes), ne classe pas. Momentum = contexte ; Moat/Risque/Valeur = le vrai signal.
Le champ `news` de chaque nœud reste [] — rempli plus tard par le workflow news/IA (Phase B).
"""
import json, statistics as st, os, datetime

BASE = os.path.join(os.path.dirname(__file__), "..", "data")

def rows(fn):
    try:
        d = json.load(open(os.path.join(BASE, fn), encoding="utf-8"))
        return d if isinstance(d, list) else (d.get("stocks") or [v for v in d.values() if isinstance(v, dict)])
    except Exception:
        return []

IDX = {"US": {}, "EU": {}, "Asie": {}}
# ✅ index country-aware : (ticker, pays) → record. Désambiguïse les collisions inter-marchés
# asie (ex 8035 = Tokyo Electron au Japon ET Janco à HK) que l'index par ticker seul écrasait.
IDXC = {"US": {}, "EU": {}, "Asie": {}}
_norm = lambda s: (s or "").strip().lower()
for reg, fn in [("US", "stocks_us.json"), ("EU", "stocks_europe.json"), ("Asie", "stocks_asia.json")]:
    for r in rows(fn):
        # clé = ticker OU symbol : les titres en erreur market-data (NO_DATA) n'ont que "symbol"
        tk = (r.get("ticker") or r.get("symbol") or "").upper()
        IDX[reg][tk] = r
        IDXC[reg][(tk, _norm(r.get("country") or r.get("pays")))] = r

FW = json.load(open(os.path.join(BASE, "framework.json"), encoding="utf-8"))

# chaîne → secteur GICS (l'étage 1 de l'entonnoir)
SECTOR = {"semi": "Technologie", "ai_infra": "Technologie", "grid": "Utilities / Industrie",
          "nuclear": "Énergie / Utilities", "defense": "Industrie / Défense",
          "materials": "Matériaux", "robotics": "Industrie",
          "emerging": "Émergents / Asie"}

# Contexte pédagogique en langage clair (driver + goulot + dépendance) — QUALITATIF, sans chiffre inventé.
# Les stats précises + sourcées (« 50% de l'Europe est nucléaire ») viendront de la couche news/IA (Phase B).
CONTEXT = {
 "semi": "Les semi-conducteurs, ce sont les puces qui font tourner toute l'électronique — et l'IA en dévore des quantités record. Le point clé : on ne peut PAS fabriquer une puce avancée sans passer par une poignée de goulots quasi-monopolistiques en amont. ASML est le SEUL au monde à fabriquer les machines de lithographie EUV (>200 M€ pièce, 2 ans de délai) — sans elle, pas de puce sous 7 nm. À côté : le dépôt, la gravure, le test, puis la fonderie (TSMC domine le leading-edge mondial). C'est la doctrine picks & shovels par excellence : on n'achète pas Nvidia (le produit médiatisé), on achète les fournisseurs incontournables sans qui rien n'existe. Le risque : tout est concentré à Taïwan, au Japon et aux Pays-Bas → forte exposition géopolitique.",
 "grid": "Le réseau électrique, c'est le transport de l'électricité entre les centrales et les prises. Le driver : l'électrification massive (voitures électriques, datacenters, renouvelables) sature des réseaux vieux de 40-50 ans qu'il faut refaire. Le goulot n'est PAS la production d'électricité — c'est le TRANSPORT : les transformateurs haute tension et les câbles, dont les carnets de commande dépassent déjà 3-4 ans. Peu d'acteurs capables d'en fabriquer (surtout européens et asiatiques), donc un vrai chokepoint industriel. En amont : le cuivre, largement importé. C'est un thème lent mais structurel — la demande est mécanique, pas spéculative.",
 "nuclear": "Le nucléaire connaît une relance mondiale pour décarboner sans dépendre du soleil et du vent. Mais le vrai goulot n'est pas de construire des réacteurs — c'est le COMBUSTIBLE. Il faut de l'uranium (concentré au Kazakhstan, Niger, Canada) puis surtout l'ENRICHIR, une étape longtemps dominée par la Russie (Rosatom) — d'où un chokepoint plus géopolitique qu'industriel. Trois horizons : l'existant (entretien des centrales, sûr), le combustible (la vraie tension), et les SMR (petits réacteurs modulaires — prometteur mais pas prouvé, donc en veille). On joue le combustible et l'existant, pas le rêve SMR.",
 "ai_infra": "L'IA-infra, c'est tout ce qui ALIMENTE et REFROIDIT les datacenters d'IA — l'angle mort du boom. Un datacenter IA consomme autant qu'une ville : le goulot devient l'électricité et le refroidissement, pas les puces. Les gagnants : les équipements électriques et thermiques (Vertiv pour le refroidissement, Eaton, Schneider pour la distribution). C'est encore du picks & shovels : on ne parie pas sur le modèle d'IA, on parie sur ce sans quoi aucun datacenter ne tourne. Attention : très couplé au capex-IA — si les géants ralentissent leurs investissements, cette chaîne ralentit avec eux (c'est le pari de régime à surveiller).",
 "defense": "Le réarmement est structurel, l'Europe surtout, après des décennies de sous-investissement. Mais le vrai goulot n'est pas les avions et chars médiatisés (chers, très détenus) — c'est l'amont : les COMPOSANTS critiques (électronique de défense, munitions, capteurs, propulsion) que peu de fournisseurs savent produire et qu'on ne remplace pas en 6 mois. Intérêt supplémentaire : la défense se DÉCORRÈLE des semi/IA en cas de stress (2022 : semi −28% / défense +71%) — c'est le seul hedge robuste du portefeuille. On achète sur repli (c'est cher après la hausse récente), et plutôt les composants que les primes.",
 "materials": "L'électrification et la défense ont un besoin explosif de cuivre, terres rares et lithium. Mais le diagnostic est FORT et les véhicules FAIBLES : le vrai chokepoint n'est pas la mine, c'est le RAFFINAGE — et la Chine y domine massivement (surtout les terres rares). Celui qui raffine tient la chaîne, et c'est un levier géopolitique (la Chine peut restreindre les exports). Problème pratique : peu d'ETF/actions propres pour s'y exposer sans acheter des mineurs très cycliques et politiques (Amérique latine pour le cuivre). Donc exposition bornée, volontairement petite.",
 "robotics": "La robotique et les humanoïdes sont un thème d'avenir médiatisé — mais on est en VEILLE : les critères d'activation ne sont pas remplis (adoption réelle, marges, moat durable encore incertains). C'est le thème le plus spéculatif et le plus « saillant » (en vogue parce qu'il fait la une), donc précisément celui où il faut de la discipline. On surveille les vrais chokepoints (réducteurs de précision, actionneurs), on n'investit pas encore.",
}
# Contenu "7 blocs" par chaîne — problème / dépendance / en route / en-face / chokepoint / tripwires.
# CHAQUE chiffre porte sa source datée (jamais fabriquée). URL à ajouter par la couche news/IA.
# Réseau EU = référence entièrement remplie (recherche sourcée 28/07/2026, relayée par le conseil IA).
BLOCKS = {
 "grid": {
  "problem": {
   "lead": "L'Europe veut électrifier son industrie, ses datacenters et sa défense énergétique — mais le réseau qui doit TRANSPORTER ces électrons est le goulot.",
   "figures": [
    {"v":"57 %", "l":"de l'énergie de l'UE est importée", "src":"Eurostat, données 2024 (publ. mars 2026)"},
    {"v":"48-60 mois", "l":"d'attente pour un transformateur HT Tier 1 (vs ~12 mois avant)", "src":"GridReadiness / PwC via pv magazine, mai-juin 2026"},
    {"v":"2-10 ans", "l":"pour un raccordement au réseau selon les pays de l'UE", "src":"AIE, 2026"},
   ]},
  "dependency": [
   {"t":"Taux de dépendance énergétique UE : <b>57 %</b> (imports nets). Pétrole = 67 % des imports d'énergie, gaz = 24 % ; 1er fournisseur de gaz : Norvège (30 %).", "src":"Eurostat, « Energy in Europe 2026 », données 2024"},
   {"t":"Datacenters : capacité UE <b>12 GW (2025) → 28 GW attendus (2030)</b> — plus qu'un doublement ; l'UE vise un triplement d'ici 2035.", "src":"Commission européenne / Reuters, juin 2026"},
   {"t":"Les datacenters = <b>10 % de la croissance</b> de la demande électrique UE d'ici 2030, en plus de l'électrification du chauffage, des transports et de l'industrie.", "src":"AIE, 2026"},
   {"t":"Amont matière : les cœurs de transformateurs dépendent de l'acier électrique à grains orientés (GOES), production mondiale concentrée et en pénurie.", "src":"Terrapin / industrie, juin 2026"},
  ],
  "motion": [
   {"t":"Demande de transformateurs élévateurs <b>+274 %</b> (2019-2025), sous-stations +116 % ; prix <b>+80 %</b> en 5 ans.", "src":"Wood Mackenzie via pv magazine, mai 2026"},
   {"t":"Les industriels investissent mais lentement : Hitachi Energy >1 Md$ (usine South Boston en ligne <b>2028</b>) ; Siemens Energy usine Charlotte 421 M$ + plan grid 1,2 Md€.", "src":"pv magazine, mai 2026"},
   {"t":"La preuve par les carnets : Siemens Energy carnet record <b>154 Md€</b>, ventes grid +27 % attendues cette année. Citation : « le monde a besoin de plus d'électricité qu'il ne peut en transporter ».", "src":"Siemens Energy, juin 2026"},
   {"t":"Réglementation : reporting énergétique obligatoire des datacenters (EED) ; l'Irlande exige une génération/stockage sur site équivalente à leur import.", "src":"Commission européenne, 2026"},
  ],
  "enface": [
   "Oligopole serré (Siemens Energy, Hitachi, ABB, GE Vernova). En face : Hyundai Electric, Hyosung (Corée) exportent massivement — concurrence sur le standard, pas sur le THT de pointe ; WEG (Brésil) monte.",
   "Oligopole 3-4 acteurs (Prysmian n°1, Nexans, NKT). Capacité de pose (navires câbliers) elle-même limitée. En face : LS Cable (Corée).",
   "Très concentré : Siemens Energy, Hitachi, GE Vernova, ABB.",
   "Leaders installés (Schneider, Eaton, ABB). En face : concurrence chinoise forte sur le bas de gamme, faible sur le logiciel de gestion.",
  ],
  "chokepoint": {
   "title":"Le transformateur haute tension",
   "body":"« Le goulot le plus sous-estimé du déploiement IA n'est pas le GPU ni le raccordement : c'est le transformateur — sans lui, rien ne fonctionne. » Délais Tier 1 (ABB, Siemens Energy, Hitachi) : <b>48-60 mois</b>, carnets pleins jusqu'en 2030, nouvelles commandes livrées <b>2030-2031</b>. Un fournisseur US de transfos/switchgear datacenters : commandes <b>+268 %</b> sur un an (T3 2026). Personne ne peut « imprimer » de la capacité : l'usine Hitachi annoncée en 2026 ne produit qu'en 2028. Goulot structurel, pas conjoncturel.",
   "src":"GridReadiness (suivi mensuel de 14 fabricants), juin 2026"},
  "tripwires": [
   "Délais transformateurs Tier 1 repassant durablement sous ~24 mois (fin de la pénurie).",
   "Book-to-bill < 1 deux trimestres de suite chez les 3 leaders.",
   "Capacité GOES nouvelle massive mise en ligne.",
  ],
 },

 # ── Blocs narratifs (faits établis/vérifiables ; chiffres datés à brancher via recherche/news) ──
 "semi": {
  "problem": {"lead": "On ne fabrique AUCUNE puce avancée sans passer par une poignée d'équipements amont dont certains n'ont qu'UN SEUL fournisseur au monde. Le chip médiatisé (Nvidia) est la partie visible ; la valeur défendable est en amont, chez ceux sans qui rien n'existe."},
  "chokepoint": {"title": "La lithographie EUV",
   "body": "<b>ASML est le seul fabricant au monde</b> de machines de lithographie EUV — indispensables pour graver les transistors les plus fins. Pas de second fournisseur, pas de substitut : c'est le monopole vérifiable le plus net de toute la tech. En dessous, l'EDA (Synopsys + Cadence = <b>duopole</b> par lequel passe chaque puce conçue) et l'inspection/métrologie (KLA quasi-indélogeable) forment des goulots secondaires mais tout aussi structurels."},
  "tripwires": [
   "Émergence crédible d'un 2ᵉ fournisseur EUV (Chine ou autre).",
   "Rupture technologique rendant l'EUV contournable.",
   "Effondrement du capex des fondeurs (TSMC/Samsung/Intel) deux trimestres de suite → correction cyclique.",
  ],
  "enface": [
   "EUV : ASML SANS concurrent ; la Chine tente une filière domestique subventionnée, loin du niveau.",
   "EDA : duopole Synopsys/Cadence ; Siemens EDA en 3ᵉ, loin derrière.",
   "Dépôt/gravure/métrologie : oligopole AMAT/Lam/Tokyo Electron + KLA quasi-indélogeable sur l'inspection.",
   "Packaging avancé (CoWoS/HBM) : goulot réel du ramp IA ; BESI/ASMPT sur l'équipement, oligopole mémoire (Micron/SK Hynix/Samsung).",
   "Test : duopole Teradyne/Advantest.",
  ],
 },

 "ai_infra": {
  "problem": {"lead": "Quel que soit le gagnant des LLM ou des puces, les datacenters ont besoin d'électricité distribuée et de refroidissement. La densité (racks >100 kW) rend le refroidissement liquide OBLIGATOIRE — l'air ne suffit plus."},
  "chokepoint": {"title": "Le power & cooling",
   "body": "Chaque MW installé dans un datacenter passe par la <b>distribution électrique</b> (UPS/PDU/switchgear) et, avec la densité IA, par le <b>refroidissement liquide</b> — un changement techno obligatoire. C'est le picks & shovels DU picks & shovels : on ne parie pas sur le gagnant de l'IA, on parie sur ce dont TOUS ont besoin. Vertiv est le pure-play qui joue les deux bouts (power + cooling)."},
  "tripwires": [
   "Effondrement ou pause nette du capex IA des hyperscalers (thèse 100 % corrélée).",
   "Standard de refroidissement liquide qui se fige au détriment des acteurs cotés.",
   "Valorisations déjà tendues post-run 2024-26 (Vertiv) qui se dégonflent.",
  ],
  "enface": [
   "Power distribution : Vertiv, Eaton, Schneider, ABB — leaders installés, revenus services récurrents.",
   "Refroidissement liquide : Vertiv, nVent — le passage air→liquide EST le changement techno.",
   "Générateurs/backup : Cummins, Caterpillar, Generac — continuité de service obligatoire.",
  ],
 },

 "nuclear": {
  "problem": {"lead": "Le nucléaire revient pour décarboner sans dépendre du soleil et du vent — les hyperscalers signent des PPA multi-décennaux et paient d'avance. Mais le vrai goulot n'est pas de construire des réacteurs : c'est le COMBUSTIBLE."},
  "chokepoint": {"title": "Le cycle du combustible",
   "body": "L'uranium est concentré géographiquement (Kazakhstan, Niger, Canada), mais le vrai chokepoint est l'<b>enrichissement</b> — longtemps dominé par la Russie (Rosatom). C'est le maillon le plus concentré géopolitiquement de l'énergie occidentale. Trois horizons : l'existant (entretien, sûr), le combustible (la vraie tension), et les SMR (médiatisés mais non prouvés — en veille). <b>On joue le combustible et l'existant, pas le rêve SMR.</b>"},
  "tripwires": [
   "Retour massif de l'offre russe d'enrichissement (détend le chokepoint).",
   "Échec ou report en série des PPA hyperscalers (les projets redeviennent spéculatifs).",
   "SMR qui prouve enfin son économie à l'échelle (changerait la donne — pas encore le cas).",
  ],
  "enface": [
   "Existant (H1, 2026-29) : Constellation, Vistra, Talen, GE Vernova, Siemens Energy — seule capacité livrable avant 2030.",
   "Combustible (H2, permanent) : Cameco, Centrus, Urenco/Orano — le chokepoint géopolitique.",
   "SMR (H3, 2030+) : Oklo, NuScale, X-energy/TerraPower — le maillon le plus médiatisé et le plus fragile.",
  ],
 },

 "defense": {
  "problem": {"lead": "Le réarmement européen est un moteur budgétaire structurel (~800 Md€/an visés fin décennie), renforcé par le découplage US. Mais 2026 a prouvé que le risque n'est PAS la macro — c'est l'EXÉCUTION (annulations de programmes, marges déçues)."},
  "chokepoint": {"title": "L'aftermarket sole-source",
   "body": "Le vrai picks & shovels de la défense n'est pas le prime (qui porte le <b>risque programme</b> : annulations, prix fixes) mais les <b>composants certifiés sole-source</b> à revenus de rechange récurrents — INSENSIBLES aux annulations de programmes neufs. TransDigm et Heico en sont l'archétype : une pièce certifiée sur une plateforme vole pendant 30 ans et se rachète en pièces détachées."},
  "tripwires": [
   "Désescalade géopolitique majeure réduisant durablement les budgets.",
   "Dérating généralisé du secteur (valorisations encore élevées vs historique).",
   "Rupture de la logique sole-source (2ᵉ source certifiée imposée sur l'aftermarket).",
  ],
  "enface": [
   "Primes/intégrateurs : RTX, Lockheed, GD, Northrop, Rheinmetall, Thales, Dassault, Leonardo — portent le risque programme.",
   "Composants à moat/aftermarket : TransDigm, Heico, Howmet, Safran, MTU — le vrai picks & shovels, insensible aux annulations.",
   "Électronique de défense/capteurs : Hensoldt, Thales, L3Harris — contenu croissant par plateforme.",
  ],
 },

 "materials": {
  "problem": {"lead": "L'électrification et la défense ont un besoin explosif de cuivre, terres rares et lithium. Mais le diagnostic est FORT et les véhicules FAIBLES : le vrai chokepoint n'est pas la mine, c'est le RAFFINAGE — dominé par la Chine."},
  "chokepoint": {"title": "Le raffinage (pas la mine)",
   "body": "Celui qui raffine tient la chaîne. La <b>Chine domine massivement le raffinage</b> des terres rares et des aimants NdFeB — un levier géopolitique (elle peut restreindre les exports). Problème pratique : peu d'ETF/actions propres pour s'exposer sans acheter des mineurs très cycliques et politiques (Amérique latine pour le cuivre). <b>Exposition volontairement petite et bornée.</b>"},
  "tripwires": [
   "Capacité de raffinage occidentale crédible mise en ligne (réduit la dépendance).",
   "La Chine écrase les prix pour tuer les pure-plays non subventionnés.",
   "Disparition des subventions qui maintiennent les pure-plays à flot.",
  ],
  "enface": [
   "Terres rares/aimants : MP Materials, Lynas — la Chine domine raffinage et aimants NdFeB.",
   "Cuivre & métaux : Freeport-McMoRan — concentré côté mines (Chili/Pérou/RDC), pas côté Chine.",
  ],
 },

 "robotics": {
  "problem": {"lead": "Si les humanoïdes passent à l'échelle, les gagnants picks & shovels sont les composants critiques — réducteurs, actionneurs, capteurs — massivement japonais/asiatiques. Le thème est réel, le TIMING d'investissement ne l'est pas encore : on est en VEILLE."},
  "chokepoint": {"title": "Les réducteurs de précision",
   "body": "Le vrai chokepoint, <b>entièrement asiatique</b>, est le réducteur harmonique/de précision (quasi-duopole mondial Harmonic Drive/Nabtesco) et les actionneurs. Sans eux, pas d'articulation robotique précise. Les capteurs/vision (Keyence, Cognex) sont plus accessibles. <b>On surveille, on n'investit pas encore</b> : les critères d'activation (adoption réelle, marges, moat durable) ne sont pas remplis."},
  "tripwires": [
   "Adoption réelle des humanoïdes AVEC marges prouvées → activation du thème.",
   "Percée d'un fournisseur non-asiatique crédible sur les réducteurs de précision.",
   "Le narratif qui se dégonfle (revenus quasi nuls aujourd'hui).",
  ],
  "enface": [
   "Capteurs/vision (accessible) : Cognex, ABB, Keyence — leaders à marges très élevées.",
   "Réducteurs/actionneurs (trou Asie) : Harmonic Drive/Nabtesco, Nidec, Fanuc/Yaskawa — quasi-duopole mondial, le vrai chokepoint.",
  ],
 },

 "emerging": {
  "problem": {"lead": "L'Asie cesse d'être l'atelier du monde pour en devenir le CŒUR technologique. On la joue en 3 étages : la chaîne tech (le péage IA), la Chine domestique, et l'Inde. Point clé : on veut notre expo semi ICI — pas dans les valeurs US chères déjà détenues via les indices d'un autre portefeuille."},
  "chokepoint": {"title": "La chaîne tech asiatique — le péage obligé de l'IA",
   "body": "Taïwan (<b>TSMC</b>, fonderie leading-edge), la Corée (<b>SK Hynix / Samsung</b>, mémoire & HBM) et les équipementiers japonais (Tokyo Electron, Advantest) forment le <b>péage par lequel passe toute l'IA mondiale</b>. Quel que soit le gagnant des puces ou des modèles, la valeur transite par eux — et c'est LÀ qu'on veut l'exposition semi, Asie-only, pour ne pas payer deux fois le risque US. La Chine crée de la valeur réelle (VE, solaire) mais sa demande interne ne suit pas → on préfère la <b>consommation domestique et les champions tech</b> aux exportateurs en guerre des prix. L'Inde est le <b>relais démographique et manufacturier</b> de la décennie."},
  "tripwires": [
   "Taïwan : événement géopolitique majeur (le risque binaire de la thèse).",
   "Chine : durcissement réglementaire/politique sur les champions, ou demande interne durablement molle.",
   "Inde : valorisations qui dérapent (le relais devient cher).",
   "Double-expo semi non cadrée vs les indices US détenus ailleurs.",
  ],
  "enface": [
   "① Chaîne tech (péage IA) : TSMC (fonderie), SK Hynix/Samsung (mémoire/HBM), Tokyo Electron/Advantest (équipement), Hon Hai (assemblage). Asie-only, cœur de la poche.",
   "② Chine (conso + champions) : Alibaba, Meituan (demande domestique), BYD (VE). PAS les exportateurs en guerre des prix ; robotique = long terme.",
   "③ Inde (relais décennie) : via ETF UCITS MSCI India / Nifty — peu de titres indiens dans l'univers scoré aujourd'hui.",
  ],
 },
}

# Note développée par société (la "valeur ajoutée de chacun") — qualitatif, positionnement connu.
# Réseau EU rempli en référence ; fallback = le rôle court du framework si absent.
COMPANY_NOTES = {
 "ENR":"Siemens Energy — leader mondial des transformateurs HT et du HVDC (division Grid Technologies), carnet de commandes record (154 Md€). Sa force : la profondeur techno sur toute la chaîne réseau. Sa faiblesse : l'expo réseau y est diluée par les turbines à gaz et l'héritage éolien (ex-Gamesa) qui a plombé les marges — moins « pur réseau » que Prysmian.",
 "GEV":"GE Vernova — le spin-off énergie de General Electric : transfos, HVDC, mais aussi turbines à gaz et éolien. Croissance portée par la demande grid américaine et l'électrification. Comme Siemens Energy, c'est une exposition MIXTE (le réseau y côtoie le gaz et l'éolien), pas un pure-play.",
 "6501":"Hitachi Energy est le leader mondial des transformateurs et de l'appareillage HT — mais c'est une filiale noyée dans le conglomérat japonais Hitachi (6501.T). En achetant l'action, on n'achète PAS le réseau pur : on achète tout Hitachi (rail, IT, etc.). D'où « noyé ».",
 "267260":"HD Hyundai Electric — l'exportateur coréen qui profite à plein de la pénurie mondiale de transfos, en envoyant des volumes massifs vers les US et l'Europe. ROIC 25 % et marge nette ~18 % remarquables. C'est LE visage de la concurrence asiatique qui bouscule l'oligopole européen sur le segment standard.",
 "PRY":"Prysmian — n°1 mondial des câbles haute tension et sous-marins, le pure-play le PLUS propre du réseau. Bénéficiaire direct des interconnexions européennes et de l'offshore, avec un atout rare : la capacité de pose (navires câbliers) est elle-même un goulot, ce qui protège les marges.",
 "NEX":"Nexans — pure-play français des câbles HT, recentré ces dernières années sur l'électrification (cession des activités moins stratégiques). Plus petit que Prysmian mais même exposition interconnexions/offshore ; le « challenger » européen.",
 "NKT":"NKT — pure-play danois ultra-concentré sur les câbles HVDC sous-marins, donc le plus exposé aux grands projets d'interconnexion offshore. Carnet plein sur plusieurs années ; le plus « pur » mais le plus dépendant de quelques méga-contrats.",
 "ABBN":"ABB — géant suisse de l'électrification et de l'automation, fort en appareillage HT et HVDC light. ROIC 14 % solide, marges de qualité. Exposition double réseau + industrie, ce qui diversifie mais dilue un peu le pari réseau pur.",
 "SU":"Schneider Electric — leader mondial de la gestion de l'énergie et de l'automation. Sa valeur ajoutée unique : la DOUBLE exposition réseau ET datacenter (le seul à jouer les deux bouts de la chaîne électrique IA), avec des marges logicielles supérieures au hardware.",
 "ETN":"Eaton — distribution électrique américaine, avec une forte exposition datacenter/IA-infra en plus du réseau. ROIC 13 %. Croissance mécanique portée par l'électrification US ; un pied dans le réseau, un pied dans l'IA-infra.",
 "RED":"Redeia — opérateur (TSO) du réseau espagnol, monopole régulé : le capex est garanti par le régulateur donc la croissance est visible, mais le rendement est plafonné. Profil « stable/obligataire », très sensible aux taux d'intérêt.",
 "TRN":"Terna — opérateur (TSO) du réseau italien, même profil régulé que Redeia : croissance capex visible mais rendement plafonné et forte sensibilité aux taux (d'où la perf négative récente). On le tient pour la stabilité, pas la performance.",
 "LSCABLE":"LS Cable — câblier coréen, le visage de la concurrence asiatique sur les câbles. Monte en gamme et challenge l'oligopole Prysmian/Nexans/NKT, surtout sur les projets hors-Europe.",
}

def etf_of(t):
    eb = t.get("etf_buy") or {}
    es = t.get("etf_signal") or {}
    sym = eb.get("symbol") if isinstance(eb, dict) else eb
    buyable = sym if sym and sym != "—" else None
    return {"buy": buyable, "buy_name": (eb.get("name") if isinstance(eb, dict) else None),
            "signal_ytd": es.get("ytd"), "signal_w52": es.get("w52"), "signal_3m": es.get("m3")}

# axes du panel : (champ stock, clé sortie). Momentum=contexte ; le reste=signal.
# "Qualité" = quality_score (PARTOUT, cohérent avec le modal) ; Buffett reste une colonne à part.
AXES = [("perf_1y", "momentum"), ("roic", "moat"), ("quality_score", "qualite"),
        ("volatility_3y", "risque"), ("fcf_yield", "valeur")]

def med(idx, tickers, field):
    xs = [idx[t.upper()].get(field) for t in tickers
          if t.upper() in idx and isinstance(idx[t.upper()].get(field), (int, float))]
    return round(st.median(xs), 1) if xs else None

def is_veille(t):
    return t["position"].strip().upper().startswith("VEILLE")

tree = {}
for t in FW["themes"]:
    sec = SECTOR.get(t["key"], "Autre")
    tree.setdefault(sec, {"chains": {}, "news": []})
    ens = [(c["ticker"], c.get("region", ""), c.get("name", ""))
           for m in t["maillons"] for c in m["companies"] if c.get("ticker")]
    # maillons = les ÉTAPES de la chaîne (label + explication + boîtes avec rôle, tagué région)
    def has_data(tk, reg, country=None):
        tk = (tk or "").upper()
        if country and (tk, _norm(country)) in IDXC.get(reg, {}): return True
        return tk in IDX.get(reg, {})
    def cmet(tk, reg, field, country=None):
        tk = (tk or "").upper()
        rec = IDXC.get(reg, {}).get((tk, _norm(country))) if country else None
        if rec is None: rec = IDX.get(reg, {}).get(tk)
        return (rec or {}).get(field)
    # pays de désambiguïsation : explicite (emerging) OU baké dans m.country (chaînes existantes)
    _cc = lambda c: c.get("country") or (c.get("m") or {}).get("country")
    blk = BLOCKS.get(t["key"], {})
    enface = blk.get("enface", [])
    maillons = []
    for i, m in enumerate(t["maillons"]):
        comps = [{"ticker": c.get("ticker"), "name": c.get("name"), "role": c.get("role"),
                  "note": COMPANY_NOTES.get(c.get("ticker")),
                  "region": c.get("region"), "status": c.get("status"),
                  "has_data": has_data(c.get("ticker"), c.get("region"), _cc(c)),
                  "perf_1y": cmet(c.get("ticker"), c.get("region"), "perf_1y", _cc(c)),
                  "perf_ytd": cmet(c.get("ticker"), c.get("region"), "perf_ytd", _cc(c)),
                  "roic": cmet(c.get("ticker"), c.get("region"), "roic", _cc(c)),
                  "buffett_score": cmet(c.get("ticker"), c.get("region"), "buffett_score", _cc(c)),
                  "quality_score": cmet(c.get("ticker"), c.get("region"), "quality_score", _cc(c)),
                  "volatility_3y": cmet(c.get("ticker"), c.get("region"), "volatility_3y", _cc(c)),
                  "net_margin": cmet(c.get("ticker"), c.get("region"), "net_margin", _cc(c))}
                 for c in m.get("companies", [])]
        maillons.append({"label": m.get("label"), "desc": m.get("desc"), "companies": comps,
                         "enface": enface[i] if i < len(enface) else None})
    chain = {"label": t["label"], "position": t["position"], "rank": t.get("rank"),
             "capex_ia": t.get("capex_ia"), "survives_ai": t.get("survives_ai"),
             "veille": is_veille(t), "regions": {}, "news": [],
             # textes riches (le "pourquoi" + la chaîne détaillée) + comment s'exposer
             "context": CONTEXT.get(t["key"]), "etf": etf_of(t),
             "blocks": {k: v for k, v in blk.items() if k != "enface"},
             "thesis": t.get("thesis"), "diff": t.get("diff"), "decomp": t.get("decomp"),
             "risks": t.get("risks") or [], "gap": t.get("gap"), "maillons": maillons}
    for reg in ["US", "EU", "Asie"]:
        tks = [tk for tk, rg, _ in ens if rg == reg]
        n = sum(1 for tk in tks if tk.upper() in IDX[reg])
        if not tks:
            continue
        panel = {lab: med(IDX[reg], tks, fld) for fld, lab in AXES}
        panel["n"] = n
        actions = []
        for tk, rg, nm in ens:
            if rg != reg:
                continue
            s = IDX[reg].get(tk.upper(), {})
            actions.append({"ticker": tk, "name": nm or s.get("name", ""),
                            "perf_1y": s.get("perf_1y"), "roic": s.get("roic"),
                            "buffett_score": s.get("buffett_score"), "volatility_3y": s.get("volatility_3y"),
                            "fcf_yield": s.get("fcf_yield"), "has_data": tk.upper() in IDX[reg]})
        chain["regions"][reg] = {"panel": panel, "actions": actions, "news": []}
    tree[sec]["chains"][t["key"]] = chain

out = {"meta": {"generated": datetime.datetime.utcnow().isoformat() + "Z",
                "note": "Entonnoir descriptif (médianes). News=[] tant que Phase B n'a pas tourné.",
                "axes": ["momentum", "moat", "qualite", "risque", "valeur"]},
       "sectors": tree}
json.dump(out, open(os.path.join(BASE, "funnel.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# résumé console
nsec = len(tree); nchain = sum(len(v["chains"]) for v in tree.values())
print(f"✅ funnel.json écrit — {nsec} secteurs, {nchain} chaînes")
for sec, v in tree.items():
    for k, ch in v["chains"].items():
        regs = " ".join(f"{r}(n={d['panel']['n']})" for r, d in ch["regions"].items())
        print(f"   {sec[:20]:20} · {ch['label'][:28]:28} [{regs}]")
