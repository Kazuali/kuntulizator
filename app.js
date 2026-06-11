let data = window.KUNTULIZATOR_DATA;
let refreshTimerId = null;

const byId = (id) => document.getElementById(id);
const e = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]));
const fmt = (n) => Number(n || 0).toFixed(data.settings.decimalPlaces);
const outcome = (h, a) => h > a ? "home" : h < a ? "away" : "draw";

function clean(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function parseScore(value) {
  const raw = clean(value);
  if (!raw) return null;
  const normalized = raw
    .replace(/[—–]/g, "-")
    .replace(/[.:,]/g, "-")
    .replace(/\s+/g, "");
  const match = normalized.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  return { home: Number(match[1]), away: Number(match[2]) };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = "";
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch === '\r') {
      // ignore CR; LF will close the row
    } else {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function splitTeams(title) {
  const normalized = clean(title);
  const parts = normalized.split(/\s+[—–-]\s+/);
  if (parts.length >= 2) {
    return { home: parts[0].trim(), away: parts.slice(1).join(" — ").trim() };
  }
  return { home: normalized, away: "" };
}

function buildDataFromSheet(csvText) {
  const rows = parseCsv(csvText);
  const headerIndex = rows.findIndex(row => clean(row[0]).toLowerCase().includes("участник"));
  if (headerIndex === -1) throw new Error("Не найдена строка с заголовком 'Участники / Матч'");

  const resultIndex = rows.findIndex((row, index) => index > headerIndex && clean(row[0]).toUpperCase().includes("РЕЗУЛЬТАТ"));
  if (resultIndex === -1) throw new Error("Не найдена строка 'РЕЗУЛЬТАТ'");

  const headerRow = rows[headerIndex];
  const resultRow = rows[resultIndex] || [];
  const matchCols = [];

  for (let col = 1; col < headerRow.length; col += 1) {
    const title = clean(headerRow[col]);
    if (!title) continue;
    const { home, away } = splitTeams(title);
    if (!home || !away) continue;

    const score = parseScore(resultRow[col]);
    matchCols.push({ col, title, home, away, score });
  }

  const participantRows = rows
    .slice(headerIndex + 1, resultIndex)
    .filter(row => clean(row[0]));

  const participants = participantRows.map((row, index) => ({
    id: `p${index + 1}`,
    name: clean(row[0])
  }));

  const matches = matchCols.map((m, index) => ({
    id: `m${index + 1}`,
    round: data.settings.roundLabel,
    title: m.title,
    home: m.home,
    away: m.away,
    homeScore: m.score ? m.score.home : null,
    awayScore: m.score ? m.score.away : null,
    status: m.score ? "finished" : "upcoming"
  }));

  const predictions = [];
  participantRows.forEach((row, participantIndex) => {
    matchCols.forEach((m, matchIndex) => {
      const score = parseScore(row[m.col]);
      if (!score) return;
      predictions.push({
        matchId: `m${matchIndex + 1}`,
        participantId: `p${participantIndex + 1}`,
        home: score.home,
        away: score.away
      });
    });
  });

  return {
    ...data,
    participants,
    matches,
    predictions
  };
}

function setStatus(message, kind = "") {
  const el = byId("dataStatus");
  if (!el) return;
  el.classList.remove("is-ok", "is-error");
  if (kind) el.classList.add(kind);
  el.textContent = message;
}

function participantName(id) {
  return data.participants.find(p => p.id === id)?.name || id;
}

function matchTitle(match) {
  return `${match.home} — ${match.away}`;
}

function getPredictions(matchId) {
  return data.predictions.filter(p => p.matchId === matchId);
}

function calculateStandings() {
  const rows = data.participants.map(p => ({
    id: p.id,
    name: p.name,
    total: 0,
    resultHits: 0,
    exactHits: 0,
    played: 0
  }));

  const index = Object.fromEntries(rows.map(r => [r.id, r]));

  for (const match of data.matches) {
    if (match.homeScore === null || match.awayScore === null) continue;

    const fact = outcome(match.homeScore, match.awayScore);
    const preds = getPredictions(match.id);
    const resultWinners = preds.filter(p => outcome(p.home, p.away) === fact);
    const exactWinners = preds.filter(p => p.home === match.homeScore && p.away === match.awayScore);

    const resultPoints = resultWinners.length ? data.settings.resultBank / resultWinners.length : 0;
    const exactPoints = exactWinners.length ? data.settings.exactScoreBank / exactWinners.length : 0;

    for (const p of preds) {
      const row = index[p.participantId];
      if (!row) continue;
      row.played += 1;
      if (resultWinners.includes(p)) {
        row.total += resultPoints;
        row.resultHits += 1;
      }
      if (exactWinners.includes(p)) {
        row.total += exactPoints;
        row.exactHits += 1;
      }
    }
  }

  return rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ru"));
}

function renderStats() {
  const completed = data.matches.filter(m => m.homeScore !== null && m.awayScore !== null).length;
  const stats = [
    ["Участников", data.participants.length],
    ["Матчей 1 тура", data.matches.length],
    ["Прогнозов", data.predictions.length],
    ["Сыграно матчей", completed],
  ];

  byId("stats").innerHTML = stats.map(([label, value]) => `
    <div class="stat"><span>${e(label)}</span><strong>${e(value)}</strong></div>
  `).join("");
}

function renderZonePreview() {
  const standings = calculateStandings();
  byId("zonePreview").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Место</th><th>Участник</th><th>Очки</th><th>Зона</th></tr></thead>
        <tbody>
          ${standings.map((r, i) => {
            const good = i < data.settings.topPlaces;
            return `<tr>
              <td class="rank">${i + 1}</td>
              <td>${e(r.name)}</td>
              <td>${fmt(r.total)}</td>
              <td class="${good ? "zone-good" : "zone-bad"}">${good ? `Топ-${data.settings.topPlaces}` : "Зона риска"}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderUpcoming() {
  const upcoming = data.matches.filter(m => m.homeScore === null || m.awayScore === null);
  const list = (upcoming.length ? upcoming : data.matches).slice(0, 6);
  byId("upcomingMatches").innerHTML = list.map(m => `
    <div class="match-card">
      <h3>${e(matchTitle(m))}</h3>
      <div class="score">${m.homeScore === null ? "результат пока не введён" : `${m.homeScore}-${m.awayScore}`}</div>
    </div>
  `).join("");
}

function renderStandings() {
  const standings = calculateStandings();
  byId("standingsTable").innerHTML = `
    <thead>
      <tr>
        <th>Место</th><th>Участник</th><th>Очки</th><th>Угадано исходов</th><th>Точных счетов</th><th>Зона</th>
      </tr>
    </thead>
    <tbody>
      ${standings.map((r, i) => {
        const good = i < data.settings.topPlaces;
        return `<tr>
          <td class="rank">${i + 1}</td>
          <td>${e(r.name)}</td>
          <td>${fmt(r.total)}</td>
          <td>${r.resultHits}</td>
          <td>${r.exactHits}</td>
          <td class="${good ? "zone-good" : "zone-bad"}">${good ? "Победная" : "Риск"}</td>
        </tr>`;
      }).join("")}
    </tbody>
  `;
}

function renderMatches() {
  byId("matchCards").innerHTML = data.matches.map((m, index) => `
    <div class="match-card">
      <h3>${index + 1}. ${e(matchTitle(m))}</h3>
      <p class="muted">${e(m.round)}</p>
      <div class="score">${m.homeScore === null ? "—" : `${m.homeScore}-${m.awayScore}`}</div>
    </div>
  `).join("");
}

function renderPredictionControls() {
  const select = byId("matchSelect");
  const previousValue = select.value;
  select.innerHTML = data.matches.map(m => `<option value="${e(m.id)}">${e(matchTitle(m))}</option>`).join("");
  const nextValue = data.matches.some(m => m.id === previousValue) ? previousValue : data.matches[0]?.id;
  if (nextValue) select.value = nextValue;
  select.onchange = () => renderPredictions(select.value);
  if (select.value) renderPredictions(select.value);
}

function renderPredictions(matchId) {
  const match = data.matches.find(m => m.id === matchId);
  if (!match) return;
  const preds = getPredictions(matchId).map(p => ({...p, name: participantName(p.participantId)}));

  const homeCount = preds.filter(p => outcome(p.home, p.away) === "home").length;
  const drawCount = preds.filter(p => outcome(p.home, p.away) === "draw").length;
  const awayCount = preds.filter(p => outcome(p.home, p.away) === "away").length;

  byId("predictionSummary").innerHTML = `
    <div class="summary-pill"><span>${e(match.home)}</span><strong>${homeCount}</strong><small>прогнозов на победу</small></div>
    <div class="summary-pill"><span>Ничья</span><strong>${drawCount}</strong><small>прогнозов</small></div>
    <div class="summary-pill"><span>${e(match.away)}</span><strong>${awayCount}</strong><small>прогнозов на победу</small></div>
  `;

  byId("predictionsTable").innerHTML = `
    <thead>
      <tr><th>Участник</th><th>Прогноз</th><th>Исход прогноза</th></tr>
    </thead>
    <tbody>
      ${preds.map(p => {
        const o = outcome(p.home, p.away);
        const label = o === "home" ? `Победа: ${match.home}` : o === "away" ? `Победа: ${match.away}` : "Ничья";
        return `<tr><td>${e(p.name)}</td><td>${p.home}-${p.away}</td><td>${e(label)}</td></tr>`;
      }).join("")}
    </tbody>
  `;
}

function renderAll() {
  renderStats();
  renderZonePreview();
  renderUpcoming();
  renderStandings();
  renderMatches();
  renderPredictionControls();
}

async function loadSheetData(manual = false) {
  const button = byId("refreshButton");
  const url = data.settings.sheetCsvUrl;
  if (!url) {
    setStatus("Данные: используется локальный файл data.js", "");
    return;
  }

  try {
    if (button) button.disabled = true;
    setStatus(manual ? "Данные: обновляю вручную…" : "Данные: обновляю из Google Sheets…", "");
    const separator = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${separator}_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csvText = await response.text();
    data = buildDataFromSheet(csvText);
    renderAll();
    const time = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setStatus(`Данные: обновлено из Google Sheets в ${time}. Автообновление каждые 60 сек.`, "is-ok");
  } catch (error) {
    console.error(error);
    setStatus("Данные: не удалось загрузить Google Sheets. Показана последняя локальная версия.", "is-error");
  } finally {
    if (button) button.disabled = false;
  }
}

function initTabs() {
  document.querySelectorAll(".tab").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("is-active"));
      document.querySelectorAll(".page").forEach(p => p.classList.remove("is-active"));
      button.classList.add("is-active");
      byId(button.dataset.tab).classList.add("is-active");
    });
  });
}

function init() {
  initTabs();
  renderAll();
  const button = byId("refreshButton");
  if (button) button.addEventListener("click", () => loadSheetData(true));
  loadSheetData();

  const interval = data.settings.autoRefreshMs || 60000;
  refreshTimerId = window.setInterval(() => loadSheetData(false), interval);
}

init();
