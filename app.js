
const data = window.KUNTULIZATOR_DATA;

const byId = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toFixed(data.settings.decimalPlaces);
const outcome = (h, a) => h > a ? "home" : h < a ? "away" : "draw";

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
    <div class="stat"><span>${label}</span><strong>${value}</strong></div>
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
              <td>${r.name}</td>
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
  byId("upcomingMatches").innerHTML = data.matches.slice(0, 6).map(m => `
    <div class="match-card">
      <h3>${matchTitle(m)}</h3>
      <div class="score">результат пока не введён</div>
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
          <td>${r.name}</td>
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
      <h3>${index + 1}. ${matchTitle(m)}</h3>
      <p class="muted">${m.round}</p>
      <div class="score">${m.homeScore === null ? "—" : `${m.homeScore}:${m.awayScore}`}</div>
    </div>
  `).join("");
}

function renderPredictionControls() {
  const select = byId("matchSelect");
  select.innerHTML = data.matches.map(m => `<option value="${m.id}">${matchTitle(m)}</option>`).join("");
  select.addEventListener("change", () => renderPredictions(select.value));
  renderPredictions(data.matches[0].id);
}

function renderPredictions(matchId) {
  const match = data.matches.find(m => m.id === matchId);
  const preds = getPredictions(matchId).map(p => ({...p, name: participantName(p.participantId)}));

  const homeCount = preds.filter(p => outcome(p.home, p.away) === "home").length;
  const drawCount = preds.filter(p => outcome(p.home, p.away) === "draw").length;
  const awayCount = preds.filter(p => outcome(p.home, p.away) === "away").length;

  byId("predictionSummary").innerHTML = `
    <div class="summary-pill"><span>${match.home}</span><strong>${homeCount}</strong><small>прогнозов на победу</small></div>
    <div class="summary-pill"><span>Ничья</span><strong>${drawCount}</strong><small>прогнозов</small></div>
    <div class="summary-pill"><span>${match.away}</span><strong>${awayCount}</strong><small>прогнозов на победу</small></div>
  `;

  byId("predictionsTable").innerHTML = `
    <thead>
      <tr><th>Участник</th><th>Прогноз</th><th>Исход прогноза</th></tr>
    </thead>
    <tbody>
      ${preds.map(p => {
        const o = outcome(p.home, p.away);
        const label = o === "home" ? `Победа: ${match.home}` : o === "away" ? `Победа: ${match.away}` : "Ничья";
        return `<tr><td>${p.name}</td><td>${p.home}:${p.away}</td><td>${label}</td></tr>`;
      }).join("")}
    </tbody>
  `;
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
  renderStats();
  renderZonePreview();
  renderUpcoming();
  renderStandings();
  renderMatches();
  renderPredictionControls();
}

init();
