const $ = (q) => document.querySelector(q);
const out = $("#output");
const cards = $("#cards");

function print(obj) {
  out.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}
function clearCards() { cards.innerHTML = ""; }
function base() {
  const b = $("#baseUrl").value.trim().replace(/\/$/, "");
  if (!b) throw new Error("Debes indicar la Base URL (ej: https://tu-app.railway.app)");
  return b;
}
function yyyymmddFromDateInput(val) { return val ? val.replace(/-/g, "") : ""; }

function asTable(rows, headers) {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  headers.forEach(h => { const th = document.createElement("th"); th.textContent = h; trh.appendChild(th); });
  thead.appendChild(trh); table.appendChild(thead);
  const tbody = document.createElement("tbody");
  rows.forEach(r => {
    const tr = document.createElement("tr");
    r.forEach(c => { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody); wrap.appendChild(table);
  return wrap;
}

// helper: devuelve el primer valor definido entre varias rutas ("metric.temp", "metric.tempAvg", etc.)
function pick(obj, paths, fallback = "—") {
  for (const p of paths) {
    const parts = p.split(".");
    let cur = obj, ok = true;
    for (const part of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, part)) cur = cur[part];
      else { ok = false; break; }
    }
    if (ok && cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return fallback;
}

function renderCurrent(payload) {
  clearCards();
  const obs = payload?.data?.observations?.[0];
  if (!obs) return print(payload);
  const metric = obs.metric || {};
  const rows = [
    ["Estación", obs.stationID],
    ["Barrio", obs.neighborhood || ""],
    ["Hora local", obs.obsTimeLocal || ""],
    ["Temp (°C)", metric.temp],
    ["Sensación (°C)", metric.heatIndex],
    ["Rocío (°C)", metric.dewpt],
    ["Viento (km/h)", metric.windSpeed],
    ["Racha (km/h)", metric.windGust],
    ["Dir. viento (°)", obs.winddir],
    ["Humedad (%)", obs.humidity],
    ["Presión (hPa)", metric.pressure],
    ["UV", obs.uv],
    ["Lluvia tasa (mm/h)", metric.precipRate],
    ["Lluvia total (mm)", metric.precipTotal],
    ["Altitud (m)", metric.elev],
  ];
  const card = document.createElement("div");
  card.appendChild(asTable(rows, ["Campo", "Valor"]));
  cards.appendChild(card);
  print(payload);
}

function renderHistory(payload) {
  clearCards();
  const obs = payload?.data?.observations;
  if (!Array.isArray(obs) || obs.length === 0) return print(payload);

  // Candidatas con fallback de campos (instantáneos y agregados de history/all)
  const candidates = [
    { keys: ["metric.temp","metric.tempAvg","metric.tempHigh","metric.tempLow"], title: "Temp (°C)" },
    { keys: ["humidity","humidityAvg","humidityHigh","humidityLow"],            title: "Humedad (%)" },
    { keys: ["metric.windSpeed","metric.windspeedAvg","metric.windspeedHigh"],  title: "Viento (km/h)" },
    { keys: ["metric.windGust","metric.windgustHigh","metric.windgustAvg"],     title: "Racha (km/h)" },
    { keys: ["winddir","winddirAvg"],                                           title: "Dir. viento (°)" },
    { keys: ["metric.pressure","metric.pressureMax","metric.pressureMin"],      title: "Presión (hPa)" },
    { keys: ["uv","uvHigh"],                                                    title: "UV" },
    { keys: ["metric.precipRate"],                                             title: "Lluvia tasa (mm/h)" },
    { keys: ["metric.precipTotal"],                                            title: "Lluvia total (mm)" },
    { keys: ["metric.dewpt","metric.dewptAvg","metric.dewptHigh","metric.dewptLow"], title: "Rocío (°C)" },
    { keys: ["metric.heatIndex","metric.heatindexAvg","metric.heatindexHigh","metric.heatindexLow"], title: "Sensación (°C)" },
    { keys: ["metric.elev"],                                                    title: "Altitud (m)" },
    { keys: ["metric.pressureTrend"],                                           title: "Tendencia presión" },
  ];

  // Activas: al menos una observación con valor
  const active = candidates.filter(c =>
    obs.some(o => {
      const v = pick(o, c.keys, null);
      return v !== null && v !== "—";
    })
  );

  const headers = ["Hora local", ...active.map(a => a.title)];
  const rows = obs.map(o => {
    const time = o?.obsTimeLocal || o?.obsTimeUtc || "—";
    const values = active.map(a => pick(o, a.keys));
    return [time, ...values];
  });

  cards.appendChild(asTable(rows, headers));
  print(payload);
}

async function call(path, onRender) {
  const url = `${base()}${path}`;
  print("Cargando " + url + " ...");
  try {
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) { print({ ok: false, status: res.status, body: text }); return; }
    let json = null; try { json = JSON.parse(text); } catch { return print(text); }
    onRender ? onRender(json) : print(json);
  } catch (e) { print(String(e)); }
}

$("#btnCurrent").addEventListener("click", () => {
  const stationId = $("#stationId").value.trim();
  if (!stationId) return print("Falta stationId");
  call(`/api/wu/current?stationId=${encodeURIComponent(stationId)}`, renderCurrent);
});
$("#btnHistory").addEventListener("click", () => {
  const stationId = $("#stationId").value.trim();
  const date = yyyymmddFromDateInput($("#date").value);
  if (!stationId || !date) return print("Faltan stationId y/o date");
  call(`/api/wu/history?stationId=${encodeURIComponent(stationId)}&date=${encodeURIComponent(date)}`, renderHistory);
});
$("#btnHealth").addEventListener("click", () => call(`/api/health`));
$("#btnClear").addEventListener("click", () => { clearCards(); print("Sin resultados aún…"); });
$("#btnAuto").addEventListener("click", () => { $("#baseUrl").value = window.location.origin; });

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().slice(0,10);
  $("#date").value = today;
  if (location.hostname !== "localhost") $("#baseUrl").value = window.location.origin;
});
