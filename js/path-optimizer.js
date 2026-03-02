<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Acquisition Pipeline — Pappers · Actify · BODACC</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;600&family=Work+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
:root {
  --bg-base: #06090f;
  --bg-card: #0d1117;
  --bg-elevated: #151b25;
  --bg-input: #1a2233;
  --border: #1e293b;
  --border-hover: #334155;
  --text: #e2e8f0;
  --text-muted: #8892a4;
  --text-dim: #4a5568;
  --accent-pappers: #3b82f6;
  --accent-actify: #f43f5e;
  --accent-bodacc: #eab308;
  --accent-green: #22c55e;
  --accent-cyan: #06b6d4;
  --font-display: 'Bebas Neue', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
  --font-body: 'Work Sans', sans-serif;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font-body);
  background: var(--bg-base);
  color: var(--text);
  min-height: 100vh;
  overflow-x: hidden;
}

/* === HEADER === */
header {
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 100;
}
.header-inner {
  max-width: 1600px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 32px;
  height: 60px;
}
.logo {
  font-family: var(--font-display);
  font-size: 26px;
  letter-spacing: 2px;
  color: var(--text);
  white-space: nowrap;
}
.logo span { color: var(--accent-cyan); }

nav { display: flex; gap: 4px; }
.tab-btn {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 20px;
  border: 1px solid transparent;
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.5px;
  position: relative;
  top: 1px;
}
.tab-btn:hover { color: var(--text); background: var(--bg-elevated); }
.tab-btn.active {
  color: var(--text);
  background: var(--bg-base);
  border-color: var(--border);
  border-bottom-color: var(--bg-base);
}
.tab-btn[data-tab="pappers"].active { color: var(--accent-pappers); }
.tab-btn[data-tab="actify"].active { color: var(--accent-actify); }
.tab-btn[data-tab="bodacc"].active { color: var(--accent-bodacc); }

.header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--accent-green);
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.last-update {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
}

/* === MAIN === */
main {
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}
.tab-content { display: none; }
.tab-content.active { display: block; animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

/* === SHARED COMPONENTS === */
.section-title {
  font-family: var(--font-display);
  font-size: 32px;
  letter-spacing: 3px;
  margin-bottom: 4px;
}
.section-subtitle {
  color: var(--text-muted);
  font-size: 13px;
  margin-bottom: 24px;
}

input, select, textarea {
  font-family: var(--font-body);
  font-size: 13px;
  padding: 8px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  outline: none;
  transition: border-color 0.2s;
  width: 100%;
}
input:focus, select:focus { border-color: var(--accent-cyan); }
input::placeholder { color: var(--text-dim); }

label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  display: block;
  margin-bottom: 4px;
}

.btn {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.5px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.btn-primary { background: var(--accent-pappers); color: #fff; }
.btn-primary:hover { background: #2563eb; }
.btn-danger { background: var(--accent-actify); color: #fff; }
.btn-danger:hover { background: #e11d48; }
.btn-warning { background: var(--accent-bodacc); color: #000; }
.btn-warning:hover { background: #ca8a04; }
.btn-outline {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
}
.btn-outline:hover { border-color: var(--text-muted); color: var(--text); }
.btn-sm { padding: 6px 12px; font-size: 11px; }

.badge {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}
.badge-blue { background: rgba(59,130,246,0.15); color: var(--accent-pappers); }
.badge-red { background: rgba(244,63,94,0.15); color: var(--accent-actify); }
.badge-yellow { background: rgba(234,179,8,0.15); color: var(--accent-bodacc); }
.badge-green { background: rgba(34,197,94,0.15); color: var(--accent-green); }

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}
.stat-value {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 600;
}
.stat-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 4px;
}

/* === TABLES === */
.table-wrap {
  overflow-x: auto;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
thead th {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated);
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  position: sticky;
  top: 0;
}
thead th:hover { color: var(--text); }
thead th.sorted-asc::after { content: " ▲"; color: var(--accent-cyan); }
thead th.sorted-desc::after { content: " ▼"; color: var(--accent-cyan); }
tbody td {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(30,41,59,0.5);
  vertical-align: top;
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
}
tbody tr { transition: background 0.15s; }
tbody tr:hover { background: rgba(6,182,212,0.04); }
tbody tr:nth-child(even) { background: rgba(13,17,23,0.5); }
tbody tr:nth-child(even):hover { background: rgba(6,182,212,0.04); }

.link-cell a {
  color: var(--accent-cyan);
  text-decoration: none;
  font-family: var(--font-mono);
  font-size: 12px;
}
.link-cell a:hover { text-decoration: underline; }

/* === PAPPERS TAB === */
.pappers-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
  align-items: start;
}
.filters-panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  position: sticky;
  top: 84px;
}
.filters-panel h3 {
  font-family: var(--font-display);
  font-size: 20px;
  letter-spacing: 2px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.filter-group { margin-bottom: 14px; }
.filter-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.filter-divider {
  border: none;
  border-top: 1px solid var(--border);
  margin: 16px 0;
}
.token-input { position: relative; }
.token-input input { padding-right: 36px; }
.token-toggle {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 14px;
}

.results-panel { min-width: 0; }
.results-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.results-count {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-muted);
}
.search-results-input { max-width: 280px; }

/* === BODACC TAB === */
.bodacc-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.proc-badge {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 600;
}

/* === LOADING & EMPTY STATES === */
.loading {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-dim);
}
.loading-spinner {
  width: 40px; height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--accent-cyan);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-dim);
}
.empty-state h3 { color: var(--text-muted); margin-bottom: 8px; }

/* === DATA SOURCE FILE INPUT === */
.file-source {
  background: var(--bg-elevated);
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.file-source label { margin: 0; }

/* === MODAL === */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}
.modal-overlay.hidden { display: none; }
.modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  max-width: 700px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  padding: 28px;
}
.modal h2 {
  font-family: var(--font-display);
  font-size: 24px;
  letter-spacing: 2px;
  margin-bottom: 16px;
}
.modal-close {
  float: right;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 20px;
  cursor: pointer;
}
.modal-field { margin-bottom: 10px; }
.modal-field-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-dim);
}
.modal-field-value {
  font-size: 14px;
  color: var(--text);
}

/* === ACTIFY FILTERS (v2) === */
.actify-urgency-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.actify-ubadge {
  display: flex; align-items: center; gap: 6px; padding: 8px 14px;
  border-radius: 8px; border: 1px solid var(--border); background: var(--bg-card);
  cursor: pointer; transition: all 0.2s; font-size: 13px; user-select: none;
  font-family: var(--font-body);
}
.actify-ubadge:hover { background: var(--bg-elevated); }
.actify-ubadge.active { border-color: var(--accent-cyan); background: rgba(6,182,212,0.08); }
.actify-ubadge .udot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.actify-ubadge .ucount { font-weight: 700; font-size: 15px; font-family: var(--font-mono); }
.actify-ubadge.ub-crit .udot { background: var(--accent-actify); }
.actify-ubadge.ub-crit.active { border-color: var(--accent-actify); background: rgba(244,63,94,0.1); }
.actify-ubadge.ub-warn .udot { background: #f59e0b; }
.actify-ubadge.ub-warn.active { border-color: #f59e0b; background: rgba(245,158,11,0.1); }
.actify-ubadge.ub-mid .udot { background: var(--accent-bodacc); }
.actify-ubadge.ub-mid.active { border-color: var(--accent-bodacc); background: rgba(234,179,8,0.1); }
.actify-ubadge.ub-ok .udot { background: var(--accent-green); }
.actify-ubadge.ub-ok.active { border-color: var(--accent-green); background: rgba(34,197,94,0.1); }
.actify-ubadge.ub-all .udot { background: var(--text-dim); }

.actify-filter-bar { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; align-items: flex-end; }
.actify-fg { display: flex; flex-direction: column; gap: 4px; }
.actify-fg.fg-search { flex: 1; min-width: 200px; }
.actify-fg.fg-dept { width: 160px; }
.actify-fg.fg-sort { width: 160px; }

.actify-sector-bar { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.actify-sector-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-dim); font-weight: 600; margin-right: 4px;
}
.actify-schip {
  font-size: 12px; padding: 4px 10px; border-radius: 12px;
  border: 1px solid var(--border); background: var(--bg-card);
  color: var(--text-muted); cursor: pointer; transition: all 0.15s; user-select: none;
}
.actify-schip:hover { background: var(--bg-elevated); color: var(--text); }
.actify-schip.active { background: rgba(6,182,212,0.1); border-color: var(--accent-cyan); color: var(--accent-cyan); }
.actify-schip .sc-count { font-size: 10px; opacity: 0.7; margin-left: 2px; }

.actify-results-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px; padding: 8px 0; border-top: 1px solid var(--border);
}
.actify-results-count { font-family: var(--font-mono); font-size: 13px; color: var(--text-muted); }
.actify-results-count strong { color: var(--accent-actify); font-size: 16px; }
.actify-btn-reset {
  font-size: 11px; padding: 4px 10px; border-radius: 4px;
  border: 1px solid var(--border); background: transparent;
  color: var(--text-dim); cursor: pointer; font-family: var(--font-mono);
}
.actify-btn-reset:hover { color: var(--accent-actify); border-color: var(--accent-actify); }

.actify-table-wrap { max-height: 70vh; overflow-y: auto; }
.actify-table-wrap::-webkit-scrollbar { width: 6px; }
.actify-table-wrap::-webkit-scrollbar-track { background: var(--bg-card); }
.actify-table-wrap::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

.td-sector-tag {
  font-size: 11px; display: inline-block; padding: 2px 6px; border-radius: 4px;
  background: rgba(6,182,212,0.1); color: var(--accent-cyan); white-space: nowrap; margin-top: 2px;
}
.dl-crit { color: var(--accent-actify); font-weight: 600; }
.dl-warn { color: #f59e0b; font-weight: 600; }
.dl-mid { color: var(--accent-bodacc); font-weight: 600; }
.dl-ok { color: var(--accent-green); font-weight: 600; }

/* === RESPONSIVE === */
@media (max-width: 900px) {
  .pappers-layout { grid-template-columns: 1fr; }
  .filters-panel { position: static; }
  .actify-filter-bar { flex-direction: column; }
  .actify-fg.fg-search, .actify-fg.fg-dept, .actify-fg.fg-sort { width: 100%; min-width: unset; }
}
</style>
</head>
<body>

<header>
  <div class="header-inner">
    <div class="logo"><span>▲</span> ACQUISITION <span>PIPELINE</span></div>
    <nav>
      <button class="tab-btn active" data-tab="pappers" onclick="switchTab('pappers')">⬡ PAPPERS</button>
      <button class="tab-btn" data-tab="actify" onclick="switchTab('actify')">⬡ ACTIFY</button>
      <button class="tab-btn" data-tab="bodacc" onclick="switchTab('bodacc')">⬡ BODACC</button>
    </nav>
    <div class="header-right">
      <div class="status-dot"></div>
      <span class="last-update" id="globalLastUpdate">—</span>
    </div>
  </div>
</header>

<main>

<!-- ╔══════════════════════════════════════════╗ -->
<!-- ║           PAPPERS TAB                    ║ -->
<!-- ╚══════════════════════════════════════════╝ -->
<div class="tab-content active" id="tab-pappers">
  <h2 class="section-title" style="color:var(--accent-pappers);">PAPPERS — RECHERCHE ENTREPRISES</h2>
  <p class="section-subtitle">Chasse proactive : succession (dirigeant 55+) & distressed (procédure collective)</p>

  <div class="pappers-layout">
    <!-- FILTRES -->
    <div class="filters-panel">
      <h3>🔍 FILTRES</h3>

      <div class="filter-group">
        <label>Token API Pappers</label>
        <div class="token-input">
          <input type="password" id="pappersToken" placeholder="Votre clé API..." value="">
          <button class="token-toggle" onclick="toggleTokenVisibility()" title="Afficher/masquer">👁</button>
        </div>
      </div>

      <hr class="filter-divider">

      <div class="filter-group">
        <label>Codes NAF (séparés par virgule)</label>
        <textarea id="pappersNaf" rows="3" placeholder="10.72Z, 25.14Z, 32.12Z...">10.72Z,10.82Z,23.13Z,23.41Z,25.14Z,25.71Z,32.12Z,15.12Z,20.42Z,16.29Z</textarea>
      </div>

      <div class="filter-group">
        <label>Âge dirigeant</label>
        <div class="filter-row">
          <input type="number" id="pappersAgeMin" placeholder="Min" value="55">
          <input type="number" id="pappersAgeMax" placeholder="Max" value="80">
        </div>
      </div>

      <div class="filter-group">
        <label>Chiffre d'affaires (€)</label>
        <div class="filter-row">
          <input type="number" id="pappersCaMin" placeholder="Min" value="300000">
          <input type="number" id="pappersCaMax" placeholder="Max" value="5000000">
        </div>
      </div>

      <div class="filter-group">
        <label>Date création max (JJ-MM-AAAA)</label>
        <input type="text" id="pappersDateMax" placeholder="01-01-2000" value="01-01-2000">
      </div>

      <div class="filter-group">
        <label>Département(s) (ex: 75,92,69)</label>
        <input type="text" id="pappersDept" placeholder="Vide = toute la France">
      </div>

      <div class="filter-group">
        <label>Résultats par page</label>
        <select id="pappersPerPage">
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100" selected>100</option>
        </select>
      </div>

      <div class="filter-group" style="margin-top:8px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" id="pappersDistressed">
          Canal Distressed (procédure collective)
        </label>
      </div>

      <hr class="filter-divider">

      <button class="btn btn-primary" style="width:100%;justify-content:center;font-size:14px;padding:12px;" onclick="searchPappers()">
        ⚡ RECHERCHER
      </button>

      <div id="pappersCredits" style="text-align:center;margin-top:10px;font-family:var(--font-mono);font-size:11px;color:var(--text-dim);"></div>
    </div>

    <!-- RÉSULTATS -->
    <div class="results-panel">
      <div class="stat-grid" id="pappersStats" style="display:none;">
        <div class="stat-card"><div class="stat-value" style="color:var(--accent-pappers);" id="pStatTotal">0</div><div class="stat-label">Résultats</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--accent-green);" id="pStatSaines">0</div><div class="stat-label">Saines</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--accent-actify);" id="pStatProc">0</div><div class="stat-label">Proc. collective</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--accent-bodacc);" id="pStatAgeMoy">—</div><div class="stat-label">Âge moyen dirigeant</div></div>
      </div>

      <div class="results-toolbar">
        <input type="text" class="search-results-input" id="pappersSearch" placeholder="Filtrer les résultats..." oninput="filterPappersTable()">
        <button class="btn btn-outline btn-sm" onclick="exportPappersCSV()">📥 Export CSV</button>
        <button class="btn btn-outline btn-sm" onclick="exportPappersJSON()">📥 Export JSON</button>
        <span class="results-count" id="pappersResultsCount"></span>
      </div>

      <div class="file-source">
        <label style="font-size:12px;color:var(--text-muted);">Ou charger depuis fichier :</label>
        <input type="file" accept=".json" onchange="loadPappersFile(event)" style="max-width:250px;padding:4px;">
      </div>

      <div id="pappersLoading" class="loading" style="display:none;">
        <div class="loading-spinner"></div>
        <p>Recherche Pappers en cours...</p>
      </div>

      <div id="pappersEmpty" class="empty-state">
        <h3>Aucun résultat</h3>
        <p>Entrez votre token Pappers et lancez une recherche,<br>ou chargez un fichier pappers_results.json</p>
      </div>

      <div class="table-wrap" id="pappersTableWrap" style="display:none;">
        <table id="pappersTable">
          <thead>
            <tr>
              <th onclick="sortPappersTable(0)">Entreprise</th>
              <th onclick="sortPappersTable(1)">SIREN</th>
              <th onclick="sortPappersTable(2)">NAF</th>
              <th onclick="sortPappersTable(3)">Ville</th>
              <th onclick="sortPappersTable(4)">Dép.</th>
              <th onclick="sortPappersTable(5)">Dirigeant</th>
              <th onclick="sortPappersTable(6)">Âge</th>
              <th onclick="sortPappersTable(7)">CA (€)</th>
              <th onclick="sortPappersTable(8)">Effectif</th>
              <th onclick="sortPappersTable(9)">Création</th>
              <th onclick="sortPappersTable(10)">Proc.</th>
              <th>Lien</th>
            </tr>
          </thead>
          <tbody id="pappersTableBody"></tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<!-- ╔══════════════════════════════════════════╗ -->
<!-- ║           ACTIFY TAB (v2 — filtres)      ║ -->
<!-- ╚══════════════════════════════════════════╝ -->
<div class="tab-content" id="tab-actify">
  <h2 class="section-title" style="color:var(--accent-actify);">ACTIFY — REPRISES À LA BARRE</h2>
  <p class="section-subtitle">Entreprises en liquidation judiciaire — Offres de reprise <span id="actifyMaj" style="font-size:11px;color:var(--text-dim);margin-left:8px;"></span></p>

  <div class="file-source">
    <label style="font-size:12px;color:var(--text-muted);">Charger données :</label>
    <input type="file" accept=".json" id="actifyFileInput" style="max-width:250px;padding:4px;">
    <span style="font-size:11px;color:var(--text-dim);">actify_listings.json</span>
    <button class="btn btn-outline btn-sm" id="actifyExportCsv" style="margin-left:auto;">📥 Export CSV</button>
  </div>

  <!-- URGENCY BADGES -->
  <div class="actify-urgency-bar" id="actifyUrgencyBar">
    <div class="actify-ubadge ub-crit" data-urg="3"><span class="udot"></span><span class="ucount" id="aub3">0</span><span>≤ 3j</span></div>
    <div class="actify-ubadge ub-warn" data-urg="7"><span class="udot"></span><span class="ucount" id="aub7">0</span><span>≤ 7j</span></div>
    <div class="actify-ubadge ub-mid" data-urg="15"><span class="udot"></span><span class="ucount" id="aub15">0</span><span>≤ 15j</span></div>
    <div class="actify-ubadge ub-ok" data-urg="30"><span class="udot"></span><span class="ucount" id="aub30">0</span><span>≤ 30j</span></div>
    <div class="actify-ubadge ub-all active" data-urg="all"><span class="udot"></span><span class="ucount" id="aubAll">0</span><span>Tout</span></div>
  </div>

  <!-- FILTER BAR -->
  <div class="actify-filter-bar">
    <div class="actify-fg fg-search">
      <label>Recherche</label>
      <input type="text" id="actifySearch2" placeholder="Ex: boulangerie, restaurant, bail...">
    </div>
    <div class="actify-fg fg-dept">
      <label>Département(s)</label>
      <input type="text" id="actifyDept" placeholder="75,92,69...">
    </div>
    <div class="actify-fg fg-sort">
      <label>Tri</label>
      <select id="actifySortSelect2">
        <option value="deadline">Deadline ↑</option>
        <option value="recent">Plus récent</option>
        <option value="alpha">A → Z</option>
        <option value="dept">Département</option>
      </select>
    </div>
  </div>

  <!-- SECTOR CHIPS -->
  <div class="actify-sector-bar" id="actifySectorBar">
    <span class="actify-sector-label">Secteur :</span>
  </div>

  <!-- RESULTS COUNT -->
  <div class="actify-results-header">
    <div class="actify-results-count"><strong id="actifyFilteredCount">0</strong> résultat(s) sur <span id="actifyTotalCount">0</span></div>
    <button class="actify-btn-reset" id="actifyReset">✕ Reset filtres</button>
  </div>

  <!-- TABLE -->
  <div class="table-wrap actify-table-wrap">
    <table id="actifyTable2">
      <thead>
        <tr>
          <th>Deadline</th>
          <th>Titre</th>
          <th>Lieu</th>
          <th>Dép.</th>
          <th>Résumé</th>
          <th>Lien</th>
        </tr>
      </thead>
      <tbody id="actifyTbody2">
        <tr><td colspan="6"><div class="empty-state"><p>⏳ Chargement automatique...</p></div></td></tr>
      </tbody>
    </table>
  </div>
</div>

<!-- ╔══════════════════════════════════════════╗ -->
<!-- ║           BODACC TAB                     ║ -->
<!-- ╚══════════════════════════════════════════╝ -->
<div class="tab-content" id="tab-bodacc">
  <h2 class="section-title" style="color:var(--accent-bodacc);">BODACC — PROCÉDURES COLLECTIVES</h2>
  <p class="section-subtitle">Ouvertures de RJ, LJ, plans de cession — signaux précoces pour la reprise</p>

  <div class="file-source">
    <label style="font-size:12px;color:var(--text-muted);">Charger données :</label>
    <input type="file" accept=".json" onchange="loadBodaccFile(event)" style="max-width:250px;padding:4px;">
    <span style="font-size:11px;color:var(--text-dim);">bodacc_alerts.json généré par le script Python</span>
    <button class="btn btn-warning btn-sm" onclick="fetchBodaccLive()" style="margin-left:auto;">⚡ Fetch API Live</button>
  </div>

  <div class="stat-grid" id="bodaccStats" style="display:none;">
    <div class="stat-card"><div class="stat-value" style="color:var(--accent-bodacc);" id="bStatTotal">0</div><div class="stat-label">Annonces</div></div>
    <div class="stat-card"><div class="stat-value" style="color:var(--accent-actify);" id="bStatRJ">0</div><div class="stat-label">Ouvertures RJ</div></div>
    <div class="stat-card"><div class="stat-value" style="color:var(--accent-actify);" id="bStatCession">0</div><div class="stat-label">Plans de cession</div></div>
    <div class="stat-card"><div class="stat-value" style="color:var(--accent-cyan);" id="bStatDate">—</div><div class="stat-label">Dernière MAJ</div></div>
  </div>

  <div class="bodacc-toolbar">
    <input type="text" id="bodaccSearch" placeholder="Rechercher entreprise, tribunal, ville..." oninput="filterBodacc()" style="max-width:300px;">
    <select id="bodaccTypeFilter" onchange="filterBodacc()" style="max-width:200px;">
      <option value="">Tous types</option>
      <option value="Plan de cession">Plans de cession</option>
      <option value="Ouverture RJ">Ouvertures RJ</option>
      <option value="Ouverture LJ">Ouvertures LJ</option>
      <option value="Sauvegarde">Sauvegardes</option>
    </select>
    <input type="number" id="bodaccDays" placeholder="Jours" value="30" style="max-width:100px;" title="Nombre de jours (API live)">
    <button class="btn btn-outline btn-sm" onclick="exportBodaccCSV()">📥 Export CSV</button>
    <span class="results-count" id="bodaccCount"></span>
  </div>

  <div id="bodaccLoading" class="loading" style="display:none;">
    <div class="loading-spinner"></div>
    <p>Chargement BODACC en cours...</p>
  </div>

  <div id="bodaccEmpty" class="empty-state">
    <h3>Aucune donnée BODACC</h3>
    <p>Cliquez sur "Fetch API Live" ou chargez un fichier bodacc_alerts.json</p>
  </div>

  <div class="table-wrap" id="bodaccTableWrap" style="display:none;">
    <table id="bodaccTable">
      <thead>
        <tr>
          <th onclick="sortBodaccTable(0)">Type</th>
          <th onclick="sortBodaccTable(1)">Entreprise</th>
          <th onclick="sortBodaccTable(2)">Ville</th>
          <th onclick="sortBodaccTable(3)">Dép.</th>
          <th onclick="sortBodaccTable(4)">Tribunal</th>
          <th onclick="sortBodaccTable(5)">Date</th>
          <th onclick="sortBodaccTable(6)">Nature</th>
          <th>Lien</th>
        </tr>
      </thead>
      <tbody id="bodaccTableBody"></tbody>
    </table>
  </div>
</div>

</main>

<!-- MODAL pour détail Actify -->
<div class="modal-overlay hidden" id="actifyModal" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <button class="modal-close" onclick="closeModal()">✕</button>
    <h2 id="modalTitle"></h2>
    <div id="modalContent"></div>
  </div>
</div>

<script>
// ═══════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════
let pappersData = [];
let actifyData = [];
let bodaccData = [];
let pappersSortCol = -1, pappersSortDir = 1;
let bodaccSortCol = -1, bodaccSortDir = 1;

// ═══════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
}

// ═══════════════════════════════════════
// PAPPERS
// ═══════════════════════════════════════
function toggleTokenVisibility() {
  const inp = document.getElementById('pappersToken');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

async function searchPappers() {
  const token = document.getElementById('pappersToken').value.trim();
  if (!token) { alert('Entrez votre token API Pappers'); return; }

  const naf = document.getElementById('pappersNaf').value.replace(/\s/g, '');
  const ageMin = document.getElementById('pappersAgeMin').value;
  const ageMax = document.getElementById('pappersAgeMax').value;
  const caMin = document.getElementById('pappersCaMin').value;
  const caMax = document.getElementById('pappersCaMax').value;
  const dateMax = document.getElementById('pappersDateMax').value;
  const dept = document.getElementById('pappersDept').value.replace(/\s/g, '');
  const perPage = document.getElementById('pappersPerPage').value;
  const distressed = document.getElementById('pappersDistressed').checked;

  const params = new URLSearchParams();
  params.append('api_token', token);
  if (naf) params.append('code_naf', naf);
  if (ageMin && !distressed) params.append('age_dirigeant_min', ageMin);
  if (ageMax && !distressed) params.append('age_dirigeant_max', ageMax);
  if (caMin) params.append('chiffre_affaires_min', caMin);
  if (caMax) params.append('chiffre_affaires_max', caMax);
  if (dateMax && !distressed) params.append('date_creation_max', dateMax);
  if (dept) params.append('departement', dept);
  params.append('entreprise_cessee', 'false');
  params.append('par_page', perPage);
  params.append('page', '1');

  document.getElementById('pappersLoading').style.display = 'block';
  document.getElementById('pappersEmpty').style.display = 'none';
  document.getElementById('pappersTableWrap').style.display = 'none';

  try {
    let allResults = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && page <= 5) {
      params.set('page', page);
      const resp = await fetch(`https://api.pappers.fr/v2/recherche?${params.toString()}`);
      if (!resp.ok) { const err = await resp.text(); throw new Error(`HTTP ${resp.status}: ${err}`); }
      const data = await resp.json();
      const results = data.resultats || data.results || [];
      const total = data.total || 0;
      allResults.push(...results);
      totalPages = Math.ceil(total / parseInt(perPage));
      if (results.length < parseInt(perPage)) break;
      page++;
      await new Promise(r => setTimeout(r, 300));
    }

    if (distressed) {
      allResults = allResults.filter(r => r.procedure_collective_en_cours);
    }

    pappersData = allResults.map(parsePappersResult);
    renderPappersTable();
    updatePappersStats();
  } catch (err) {
    alert(`Erreur Pappers API:\n${err.message}\n\nSi erreur CORS, utilisez le script Python.`);
    console.error(err);
  } finally {
    document.getElementById('pappersLoading').style.display = 'none';
  }
}

function parsePappersResult(r) {
  const siege = r.siege || {};
  const dirs = r.dirigeants || r.representants || [];
  const mainDir = dirs.length > 0 ? dirs.sort((a,b) => (b.age||0) - (a.age||0))[0] : {};
  return {
    nom: r.nom_entreprise || r.denomination || '',
    siren: r.siren || '',
    code_naf: r.code_naf || '',
    libelle_naf: r.libelle_code_naf || '',
    ville: siege.ville || '',
    departement: siege.departement || siege.code_postal?.substring(0,2) || '',
    code_postal: siege.code_postal || '',
    dirigeant: `${mainDir.prenom || ''} ${mainDir.nom || ''}`.trim(),
    age: mainDir.age || '',
    ca: r.chiffre_affaires || (r.finances && r.finances[0]?.chiffre_affaires) || '',
    effectif: r.effectif || r.tranche_effectif || '',
    date_creation: r.date_creation || '',
    procedure: r.procedure_collective_en_cours ? '⚠️' : '✅',
    procedure_bool: !!r.procedure_collective_en_cours,
    url: `https://www.pappers.fr/entreprise/${r.siren}`,
  };
}

function renderPappersTable() {
  const tbody = document.getElementById('pappersTableBody');
  const filtered = getFilteredPappers();
  if (filtered.length === 0) {
    document.getElementById('pappersTableWrap').style.display = 'none';
    document.getElementById('pappersEmpty').style.display = 'block';
    return;
  }
  document.getElementById('pappersTableWrap').style.display = 'block';
  document.getElementById('pappersEmpty').style.display = 'none';
  tbody.innerHTML = filtered.map(c => `
    <tr>
      <td title="${esc(c.libelle_naf)}">${esc(c.nom)}</td>
      <td style="font-family:var(--font-mono);font-size:12px;">${c.siren}</td>
      <td><span class="badge badge-blue">${c.code_naf}</span></td>
      <td>${esc(c.ville)}</td>
      <td>${c.departement}</td>
      <td>${esc(c.dirigeant)}</td>
      <td style="font-family:var(--font-mono);text-align:center;${c.age>=60?'color:var(--accent-actify);font-weight:600':''}">${c.age||'—'}</td>
      <td style="font-family:var(--font-mono);text-align:right;">${c.ca ? formatNumber(c.ca) : '—'}</td>
      <td style="text-align:center;">${c.effectif||'—'}</td>
      <td style="font-family:var(--font-mono);font-size:12px;">${c.date_creation||'—'}</td>
      <td style="text-align:center;">${c.procedure}</td>
      <td class="link-cell"><a href="${c.url}" target="_blank">Pappers↗</a></td>
    </tr>
  `).join('');
  document.getElementById('pappersResultsCount').textContent = `${filtered.length} résultat${filtered.length>1?'s':''}`;
}

function getFilteredPappers() {
  const q = document.getElementById('pappersSearch').value.toLowerCase();
  if (!q) return pappersData;
  return pappersData.filter(c =>
    (c.nom+c.siren+c.ville+c.dirigeant+c.code_naf+c.libelle_naf).toLowerCase().includes(q)
  );
}

function filterPappersTable() { renderPappersTable(); }

function updatePappersStats() {
  const d = pappersData;
  document.getElementById('pappersStats').style.display = d.length > 0 ? 'grid' : 'none';
  document.getElementById('pStatTotal').textContent = d.length;
  document.getElementById('pStatSaines').textContent = d.filter(c => !c.procedure_bool).length;
  document.getElementById('pStatProc').textContent = d.filter(c => c.procedure_bool).length;
  const ages = d.filter(c => c.age).map(c => parseInt(c.age));
  document.getElementById('pStatAgeMoy').textContent = ages.length ? Math.round(ages.reduce((a,b)=>a+b,0)/ages.length) : '—';
}

function sortPappersTable(col) {
  if (pappersSortCol === col) pappersSortDir *= -1;
  else { pappersSortCol = col; pappersSortDir = 1; }
  const keys = ['nom','siren','code_naf','ville','departement','dirigeant','age','ca','effectif','date_creation','procedure_bool','url'];
  const key = keys[col];
  pappersData.sort((a,b) => {
    let va = a[key], vb = b[key];
    if (typeof va === 'number' || key === 'age' || key === 'ca') {
      va = parseFloat(va) || 0; vb = parseFloat(vb) || 0;
    } else { va = String(va||'').toLowerCase(); vb = String(vb||'').toLowerCase(); }
    return va < vb ? -pappersSortDir : va > vb ? pappersSortDir : 0;
  });
  document.querySelectorAll('#pappersTable thead th').forEach((th,i) => {
    th.classList.remove('sorted-asc','sorted-desc');
    if (i === col) th.classList.add(pappersSortDir === 1 ? 'sorted-asc' : 'sorted-desc');
  });
  renderPappersTable();
}

function loadPappersFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const succ = data.succession?.companies || [];
      const dist = data.distressed?.companies || [];
      pappersData = [...succ, ...dist].map(c => ({
        nom: c.nom || '', siren: c.siren || '', code_naf: c.code_naf || '', libelle_naf: c.libelle_naf || '',
        ville: c.ville || '', departement: c.departement || '', code_postal: c.code_postal || '',
        dirigeant: c.dirigeant?.nom || '', age: c.dirigeant?.age || '', ca: c.chiffre_affaires || '',
        effectif: c.effectif || '', date_creation: c.date_creation || '',
        procedure: c.procedure_collective ? '⚠️' : '✅', procedure_bool: !!c.procedure_collective,
        url: c.url_pappers || `https://www.pappers.fr/entreprise/${c.siren}`,
      }));
      renderPappersTable();
      updatePappersStats();
      document.getElementById('globalLastUpdate').textContent = `Pappers: ${data.extracted_at?.substring(0,16) || 'fichier chargé'}`;
    } catch (err) { alert('Erreur de lecture du fichier JSON: ' + err.message); }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════
// ACTIFY (v2 — filtered dashboard)
// ═══════════════════════════════════════
const SECTOR_RULES = {
  'Restauration': ['restaurant', 'restauration', 'traiteur', 'pizzeria', 'brasserie', 'crêperie', 'snack', 'kebab', 'sushi', 'cuisine'],
  'Bar / Café': ['bar', 'café', 'cafe', 'tabac', 'débit de boissons', 'bar-tabac', 'discothèque', 'pub'],
  'Boulangerie': ['boulangerie', 'pâtisserie', 'patisserie', 'viennoiserie'],
  'Alimentaire': ['alimentation', 'alimentaire', 'boucherie', 'charcuterie', 'épicerie', 'primeur', 'poissonnerie', 'fromagerie'],
  'Habillement': ['habillement', 'vêtement', 'vetement', 'textile', 'mode', 'accessoires', 'chaussur', 'prêt-à-porter', 'maroquinerie', 'lingerie'],
  'Beauté': ['coiffure', 'esthétique', 'beauté', 'parfumerie', 'spa', 'onglerie', 'institut'],
  'Immobilier': ['immobilier', 'bail commercial', 'droit au bail', 'murs commerciaux'],
  'BTP / Industrie': ['btp', 'industrie', 'industriel', 'construction', 'bâtiment', 'batiment', 'menuiserie', 'métallurgie', 'usinage', 'atelier', 'mécanique', 'fabrication', 'manufacture'],
  'Services': ['service', 'transport', 'logistique', 'nettoyage', 'informatique', 'conseil', 'formation', 'auto-école', 'garage', 'carrosserie', 'imprimerie'],
  'Hôtellerie': ['hôtel', 'hotel', 'hébergement', 'camping', 'gîte', 'tourisme'],
};

function classifyActifySector(l) {
  const text = [l.titre||'', l.activite||'', l.description_resume||''].join(' ').toLowerCase();
  for (const [sector, kws] of Object.entries(SECTOR_RULES)) {
    for (const kw of kws) { if (text.includes(kw)) return sector; }
  }
  return 'Autre';
}

let actifyAllListings = [];
let actifyFiltered = [];
const ACTIFY_TODAY = new Date(); ACTIFY_TODAY.setHours(0,0,0,0);
const actifyState = { urgency: 'all', search: '', depts: [], sectors: [], sort: 'deadline' };

function actifyDaysUntil(iso) {
  if (!iso) return Infinity;
  return Math.ceil((new Date(iso) - ACTIFY_TODAY) / 864e5);
}
function actifyDlLabel(d) { return d===Infinity?'—':d<0?'Passée':d===0?'Auj.':d+'j'; }
function actifyDlClass(d) { return d<=3?'dl-crit':d<=7?'dl-warn':d<=15?'dl-mid':'dl-ok'; }

function loadActifyData(data) {
  const raw = data.listings || data;
  actifyAllListings = (Array.isArray(raw)?raw:[]).map(l => ({
    ...l,
    _sector: classifyActifySector(l),
    _days: actifyDaysUntil(l.date_limite_offres_iso),
  }));
  actifyData = actifyAllListings;

  document.getElementById('actifyTotalCount').textContent = actifyAllListings.length;
  if (data.scraped_at) {
    const d = new Date(data.scraped_at);
    document.getElementById('actifyMaj').textContent =
      '· MAJ ' + d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    document.getElementById('globalLastUpdate').textContent = 'Actify: ' + data.scraped_at.substring(0,16);
  }
  buildActifyUrgency();
  buildActifySectors();
  applyActifyFilters();
}

function buildActifyUrgency() {
  const b = {3:0,7:0,15:0,30:0};
  for (const l of actifyAllListings) {
    if(l._days<=3) b[3]++; if(l._days<=7) b[7]++; if(l._days<=15) b[15]++; if(l._days<=30) b[30]++;
  }
  document.getElementById('aub3').textContent = b[3];
  document.getElementById('aub7').textContent = b[7];
  document.getElementById('aub15').textContent = b[15];
  document.getElementById('aub30').textContent = b[30];
  document.getElementById('aubAll').textContent = actifyAllListings.length;
}

function buildActifySectors() {
  const counts = {};
  for (const l of actifyAllListings) counts[l._sector] = (counts[l._sector]||0)+1;
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
  const bar = document.getElementById('actifySectorBar');
  bar.innerHTML = '<span class="actify-sector-label">Secteur :</span>';
  for (const [s, c] of sorted) {
    const chip = document.createElement('span');
    chip.className = 'actify-schip';
    chip.dataset.sector = s;
    chip.innerHTML = s + ' <span class="sc-count">' + c + '</span>';
    chip.addEventListener('click', function() {
      const i = actifyState.sectors.indexOf(s);
      if (i >= 0) actifyState.sectors.splice(i, 1); else actifyState.sectors.push(s);
      bar.querySelectorAll('.actify-schip').forEach(c => c.classList.toggle('active', actifyState.sectors.includes(c.dataset.sector)));
      applyActifyFilters();
    });
    bar.appendChild(chip);
  }
}

document.getElementById('actifyUrgencyBar').addEventListener('click', function(e) {
  const badge = e.target.closest('.actify-ubadge');
  if (!badge) return;
  const v = badge.dataset.urg;
  actifyState.urgency = v === 'all' ? 'all' : parseInt(v);
  this.querySelectorAll('.actify-ubadge').forEach(b => b.classList.remove('active'));
  badge.classList.add('active');
  applyActifyFilters();
});

let actifySearchTimeout;
document.getElementById('actifySearch2').addEventListener('input', function() {
  clearTimeout(actifySearchTimeout);
  const self = this;
  actifySearchTimeout = setTimeout(function() {
    actifyState.search = self.value.trim().toLowerCase();
    applyActifyFilters();
  }, 150);
});

document.getElementById('actifyDept').addEventListener('input', function() {
  const raw = this.value.trim();
  actifyState.depts = raw ? raw.split(',').map(d => d.trim()).filter(Boolean) : [];
  applyActifyFilters();
});

document.getElementById('actifySortSelect2').addEventListener('change', function() {
  actifyState.sort = this.value;
  applyActifyFilters();
});

document.getElementById('actifyReset').addEventListener('click', function() {
  actifyState.urgency = 'all'; actifyState.search = ''; actifyState.depts = [];
  actifyState.sectors = []; actifyState.sort = 'deadline';
  document.getElementById('actifySearch2').value = '';
  document.getElementById('actifyDept').value = '';
  document.getElementById('actifySortSelect2').value = 'deadline';
  document.querySelectorAll('#actifyUrgencyBar .actify-ubadge').forEach(b => b.classList.remove('active'));
  document.querySelector('#actifyUrgencyBar [data-urg="all"]').classList.add('active');
  document.querySelectorAll('.actify-schip').forEach(c => c.classList.remove('active'));
  applyActifyFilters();
});

document.getElementById('actifyFileInput').addEventListener('change', function(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try { loadActifyData(JSON.parse(ev.target.result)); }
    catch(err) { alert('JSON invalide: ' + err.message); }
  };
  reader.readAsText(file);
});

function applyActifyFilters() {
  actifyFiltered = actifyAllListings.filter(l => {
    if (actifyState.urgency !== 'all' && l._days > actifyState.urgency) return false;
    if (actifyState.depts.length && !actifyState.depts.includes(l.departement)) return false;
    if (actifyState.sectors.length && !actifyState.sectors.includes(l._sector)) return false;
    if (actifyState.search) {
      const h = [l.titre,l.description_resume,l.activite,l.ville,l.departement,l.adresse,l.code_postal].filter(Boolean).join(' ').toLowerCase();
      if (!h.includes(actifyState.search)) return false;
    }
    return true;
  });
  actifyFiltered.sort(function(a,b) {
    switch(actifyState.sort) {
      case 'deadline': return (a._days===Infinity?9999:a._days)-(b._days===Infinity?9999:b._days);
      case 'recent': return (b._days===Infinity?-9999:b._days)-(a._days===Infinity?-9999:a._days);
      case 'alpha': return (a.titre||'').localeCompare(b.titre||'','fr');
      case 'dept': return (a.departement||'99').localeCompare(b.departement||'99');
      default: return 0;
    }
  });
  document.getElementById('actifyFilteredCount').textContent = actifyFiltered.length;
  renderActifyTable();
}

function renderActifyTable() {
  const tbody = document.getElementById('actifyTbody2');
  if (!actifyFiltered.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>Aucune annonce ne correspond aux filtres</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = actifyFiltered.map(function(l) {
    const dl = actifyDlLabel(l._days), dc = actifyDlClass(l._days);
    const lieu = l.ville || l.lieu || '—';
    const dept = l.departement || '—';
    const resume = (l.description_resume || l.activite || '').substring(0, 120);
    const url = l.url || '#';
    return '<tr>' +
      '<td class="' + dc + '" style="white-space:nowrap;font-family:var(--font-mono);font-size:13px;">' + dl + '</td>' +
      '<td style="max-width:280px;"><a href="' + url + '" target="_blank" style="color:var(--text);text-decoration:none;font-weight:600;font-size:13px;">' + esc(l.titre||'—') + '</a>' +
      (l._sector !== 'Autre' ? '<br><span class="td-sector-tag">' + l._sector + '</span>' : '') +
      '</td>' +
      '<td style="color:var(--text-muted);white-space:nowrap;font-size:13px;">' + esc(lieu) + '</td>' +
      '<td style="font-weight:700;color:var(--accent-cyan);text-align:center;font-family:var(--font-mono);">' + dept + '</td>' +
      '<td style="color:var(--text-dim);font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(resume) + '</td>' +
      '<td class="link-cell"><a href="' + url + '" target="_blank">Actify↗</a></td>' +
      '</tr>';
  }).join('');
}

document.getElementById('actifyExportCsv').addEventListener('click', function() {
  if (!actifyFiltered || !actifyFiltered.length) return;
  const hdr = ['Titre','Secteur','Deadline','Jours','Ville','Département','Adresse','URL','Résumé'];
  const rows = actifyFiltered.map(function(l) { return [
    (l.titre||'').replace(/"/g,'""'), l._sector, l.date_limite_offres_iso||'',
    l._days===Infinity?'':l._days, (l.ville||'').replace(/"/g,'""'),
    l.departement||'', (l.adresse||'').replace(/\n/g,' ').replace(/"/g,'""'),
    l.url||'', (l.description_resume||'').replace(/"/g,'""'),
  ]; });
  const csv = [hdr].concat(rows).map(function(r) { return r.map(function(c){return '"'+c+'"';}).join(','); }).join('\n');
  downloadFile(csv, 'actify_filtre_' + new Date().toISOString().slice(0,10) + '.csv');
});

// ═══════════════════════════════════════
// BODACC
// ═══════════════════════════════════════
async function fetchBodaccLive() {
  const days = parseInt(document.getElementById('bodaccDays').value) || 30;
  const dateFrom = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  document.getElementById('bodaccLoading').style.display = 'block';
  document.getElementById('bodaccEmpty').style.display = 'none';
  document.getElementById('bodaccTableWrap').style.display = 'none';
  try {
    const where = encodeURIComponent(`familleavis_lib = 'Procédures collectives' AND dateparution >= '${dateFrom}'`);
    const url = `https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records?where=${where}&order_by=dateparution+DESC&limit=100`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    bodaccData = (data.results || []).map(r => ({
      type_procedure: classifyProcedure(r),
      nom: r.commercant || r.personne || '—',
      ville: r.ville || '',
      departement: r.departement_code_etablissement || '',
      tribunal: r.tribunal || '',
      date: r.dateparution || '',
      nature: r.nature || '',
      contenu: r.contenu_annonce || r.jugement || '',
      url: r.id_annonce ? `https://www.bodacc.fr/annonce/detail/${r.id_annonce}` : '',
    }));
    renderBodacc();
    updateBodaccStats();
    document.getElementById('globalLastUpdate').textContent = `BODACC: ${new Date().toISOString().substring(0,16)}`;
  } catch (err) {
    alert('Erreur API BODACC: ' + err.message);
  } finally {
    document.getElementById('bodaccLoading').style.display = 'none';
  }
}

function classifyProcedure(r) {
  const text = ((r.contenu_annonce || '') + ' ' + (r.nature || '')).toLowerCase();
  if (text.includes('plan de cession')) return '🔴 Plan de cession';
  if (text.includes('redressement') && text.includes('ouverture')) return '🟡 Ouverture RJ';
  if (text.includes('liquidation') && text.includes('ouverture')) return '🔴 Ouverture LJ';
  if (text.includes('sauvegarde')) return '🟢 Sauvegarde';
  if (text.includes('redressement')) return '🟡 RJ';
  if (text.includes('liquidation')) return '🔴 LJ';
  if (text.includes('clôture') || text.includes('cloture')) return '⚪ Clôture';
  return '⚪ Autre';
}

function loadBodaccFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      bodaccData = (data.records || []).map(r => ({
        type_procedure: r.type_procedure || classifyProcedure(r),
        nom: r.nom_entreprise || r.nom || r.commercant || '',
        ville: r.ville || '',
        departement: r.departement || '',
        tribunal: r.tribunal || '',
        date: r.date_parution || r.date || '',
        nature: r.nature || '',
        contenu: r.contenu || '',
        url: r.url_bodacc || r.url || '',
      }));
      renderBodacc();
      updateBodaccStats();
    } catch (err) { alert('Erreur lecture JSON: ' + err.message); }
  };
  reader.readAsText(file);
}

function renderBodacc() {
  const tbody = document.getElementById('bodaccTableBody');
  const filtered = getFilteredBodacc();
  if (filtered.length === 0) {
    document.getElementById('bodaccTableWrap').style.display = 'none';
    document.getElementById('bodaccEmpty').style.display = 'block';
    return;
  }
  document.getElementById('bodaccTableWrap').style.display = 'block';
  document.getElementById('bodaccEmpty').style.display = 'none';
  tbody.innerHTML = filtered.map(r => {
    const typeColor = r.type_procedure.includes('🔴') ? 'var(--accent-actify)' :
                      r.type_procedure.includes('🟡') ? 'var(--accent-bodacc)' :
                      r.type_procedure.includes('🟢') ? 'var(--accent-green)' : 'var(--text-dim)';
    return `
      <tr>
        <td><span style="color:${typeColor};font-family:var(--font-mono);font-size:12px;font-weight:600;">${esc(r.type_procedure)}</span></td>
        <td title="${esc(r.contenu?.substring(0,200))}">${esc(r.nom)}</td>
        <td>${esc(r.ville)}</td>
        <td>${r.departement}</td>
        <td>${esc(r.tribunal)}</td>
        <td style="font-family:var(--font-mono);font-size:12px;">${r.date}</td>
        <td style="font-size:12px;max-width:200px;">${esc(r.nature)}</td>
        <td class="link-cell">${r.url ? `<a href="${r.url}" target="_blank">BODACC↗</a>` : ''}</td>
      </tr>
    `;
  }).join('');
  document.getElementById('bodaccCount').textContent = `${filtered.length} annonce${filtered.length>1?'s':''}`;
}

function getFilteredBodacc() {
  const q = (document.getElementById('bodaccSearch').value || '').toLowerCase();
  const typeFilter = document.getElementById('bodaccTypeFilter').value;
  return bodaccData.filter(r => {
    if (typeFilter && !r.type_procedure.includes(typeFilter)) return false;
    if (q && !(r.nom+r.ville+r.tribunal+r.nature+r.contenu).toLowerCase().includes(q)) return false;
    return true;
  });
}

function filterBodacc() { renderBodacc(); }

function updateBodaccStats() {
  document.getElementById('bodaccStats').style.display = bodaccData.length > 0 ? 'grid' : 'none';
  document.getElementById('bStatTotal').textContent = bodaccData.length;
  document.getElementById('bStatRJ').textContent = bodaccData.filter(r => r.type_procedure.includes('Ouverture RJ')).length;
  document.getElementById('bStatCession').textContent = bodaccData.filter(r => r.type_procedure.includes('cession')).length;
  document.getElementById('bStatDate').textContent = new Date().toLocaleDateString('fr-FR');
}

function sortBodaccTable(col) {
  if (bodaccSortCol === col) bodaccSortDir *= -1;
  else { bodaccSortCol = col; bodaccSortDir = 1; }
  const keys = ['type_procedure','nom','ville','departement','tribunal','date','nature','url'];
  const key = keys[col];
  bodaccData.sort((a,b) => {
    let va = String(a[key]||'').toLowerCase(), vb = String(b[key]||'').toLowerCase();
    return va < vb ? -bodaccSortDir : va > vb ? bodaccSortDir : 0;
  });
  document.querySelectorAll('#bodaccTable thead th').forEach((th,i) => {
    th.classList.remove('sorted-asc','sorted-desc');
    if (i === col) th.classList.add(bodaccSortDir === 1 ? 'sorted-asc' : 'sorted-desc');
  });
  renderBodacc();
}

// ═══════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════
function toCSV(headers, rows) {
  const escape = v => `"${String(v||'').replace(/"/g, '""')}"`;
  return [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
}

function downloadFile(content, filename, type) {
  type = type || 'text/csv';
  const blob = new Blob(['\uFEFF'+content], { type: type+';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function exportPappersCSV() {
  const headers = ['Entreprise','SIREN','Code NAF','Libellé NAF','Ville','Département','Dirigeant','Âge','CA','Effectif','Création','Proc. Collective','URL'];
  const rows = pappersData.map(c => [c.nom,c.siren,c.code_naf,c.libelle_naf,c.ville,c.departement,c.dirigeant,c.age,c.ca,c.effectif,c.date_creation,c.procedure_bool?'Oui':'Non',c.url]);
  downloadFile(toCSV(headers, rows), `pappers_${new Date().toISOString().split('T')[0]}.csv`);
}

function exportPappersJSON() {
  downloadFile(JSON.stringify(pappersData, null, 2), `pappers_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
}

function exportBodaccCSV() {
  const headers = ['Type','Entreprise','Ville','Département','Tribunal','Date','Nature','URL'];
  const rows = bodaccData.map(r => [r.type_procedure,r.nom,r.ville,r.departement,r.tribunal,r.date,r.nature,r.url]);
  downloadFile(toCSV(headers, rows), `bodacc_${new Date().toISOString().split('T')[0]}.csv`);
}

// ═══════════════════════════════════════
// UTILS
// ═══════════════════════════════════════
function esc(str) {
  if (!str) return '';
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function formatNumber(n) {
  if (!n && n !== 0) return '';
  return parseInt(n).toLocaleString('fr-FR');
}

function closeModal() {
  document.getElementById('actifyModal').classList.add('hidden');
}

// ═══════════════════════════════════════
// AUTO-LOAD from data/ directory
// ═══════════════════════════════════════
async function tryAutoLoad() {
  try {
    const resp = await fetch('data/actify_listings.json');
    if (resp.ok) {
      const data = await resp.json();
      loadActifyData(data);
    }
  } catch(e) {}
  try {
    const resp = await fetch('data/bodacc_alerts.json');
    if (resp.ok) {
      const data = await resp.json();
      bodaccData = (data.records || []).map(r => ({
        type_procedure: r.type_procedure || '',
        nom: r.nom_entreprise || r.nom || '',
        ville: r.ville || '',
        departement: r.departement || '',
        tribunal: r.tribunal || '',
        date: r.date_parution || r.date || '',
        nature: r.nature || '',
        contenu: r.contenu || '',
        url: r.url_bodacc || r.url || '',
      }));
      renderBodacc();
      updateBodaccStats();
    }
  } catch(e) {}
  try {
    const resp = await fetch('data/pappers_results.json');
    if (resp.ok) {
      const data = await resp.json();
      const succ = data.succession?.companies || [];
      const dist = data.distressed?.companies || [];
      pappersData = [...succ, ...dist].map(c => ({
        nom: c.nom||'', siren: c.siren||'', code_naf: c.code_naf||'', libelle_naf: c.libelle_naf||'',
        ville: c.ville||'', departement: c.departement||'', dirigeant: c.dirigeant?.nom||'',
        age: c.dirigeant?.age||'', ca: c.chiffre_affaires||'', effectif: c.effectif||'',
        date_creation: c.date_creation||'', procedure: c.procedure_collective?'⚠️':'✅',
        procedure_bool: !!c.procedure_collective, url: c.url_pappers||'',
      }));
      renderPappersTable();
      updatePappersStats();
    }
  } catch(e) {}
}

// Init
document.addEventListener('DOMContentLoaded', tryAutoLoad);
</script>
</body>
</html>
