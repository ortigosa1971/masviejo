const $ = (q) => document.querySelector(q);
const out = $("#output");
const cards = $("#cards");

function print(obj) {
  out.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

function clearCards() {
  cards.innerHTML = "";
}

function base() {
  const b = $("#baseUrl").value.trim().replace(/\/$/, "");
  if (!b) throw new Error("Debes indicar la Base URL (ej: https://tu-app.railway.app)");
  return b;
}

function yyyymmddFromDateInput(val) {
  if (!val) return "";
  return val.replace(/-/g, "");
}

function asTable(rows, headers) {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  rows.forEach(r => {
    const tr = document.createElement("tr");
    r.forEach(c => {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
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
}

function renderHistory(payload) {
  clearCards();
  const obs = payload?.data?.observations;
  if (!Array.isArray(obs) || obs.length === 0) return print(payload);
  const headers = ["Hora local", "Temp (°C)", "Humedad (%)", "Viento (km/h)", "Racha (km/h)", "Presión (hPa)", "Lluvia (mm)"];
  const rows = obs.map(o => {
    const m = o.metric || {};
    return [
      o.obsTimeLocal || "",
      m.temp ?? "",
      o.humidity ?? "",
      m.windSpeed ?? "",
      m.windGust ?? "",
      m.pressure ?? "",
      m.precipTotal ?? ""
    ];
  });
  cards.appendChild(asTable(rows, headers));
}

async function call(path, onRender) {
  const url = `${base()}${path}`;
  print("Cargando " + url + " ...");
  try {
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) {
      print({ ok: false, status: res.status, body: text });
      return;
    }
    let json = null;
    try { json = JSON.parse(text); } catch { return print(text); }
    onRender ? onRender(json) : print(json);
  } catch (e) {
    print(String(e));
  }
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
  if (location.hostname !== "localhost") {
    $("#baseUrl").value = window.location.origin;
  }
});
