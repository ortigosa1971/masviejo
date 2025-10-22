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

// helper: devuelve el primer valor definido entre varias rutas (e.g. "metric.temp")
function pick(obj, paths, fallback = "—") {
  for (const p of paths) {
    const parts = p.split(".");
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, part)) {
        cur = cur[part];
      } else {
        ok = false;
        break;
      }
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

  // deja el JSON para inspección
  print(payload);
}

function renderHistory(payload) {
  clearCards();
  const obs = payload?.data?.observations;
  if (!Array.isArray(obs) || obs.length === 0) return print(payload);

  // Candidatas de columnas (orden sugerido)
  const candidates = [
    { key: "metric.temp",        title: "Temp (°C)" },
    { key: "humidity",           title: "Humedad (%)" },
    { key: "metric.windSpeed",   title: "Viento (km/h)" },
    { key: "metric.windGust",    title: "Racha (km/h)" },
    { key: "winddir",            title: "Dir. viento (°)" },
    { key: "metric.pressure",    title: "Presión (hPa)" },
    { key: "uv",                 title: "UV" },
    { key: "metric.precipRate",  title: "Lluvia tasa (mm/h)" },
    { key: "metric.precipTotal", title: "Lluvia total (mm)" },
    { key: "metric.dewpt",       title: "Rocío (°C)" },
    { key: "metric.heatIndex",   title: "Sensación (°C)" },
    { key: "metric.elev",        title: "Altitud (m)" },
  ];

  // Decide dinámicamente qué columnas tienen al menos un dato
  const active = candidates.filter(c => {
    const has = obs.some(o => {
      const v = pick(o, [c.key], null);
      return v !== null && v !== "—";
    });
    return has;
  });

  // Encabezados (siempre hora + activas)
  const headers = ["Hora local", ...active.map(a => a.title)];

  // Filas
  const rows = obs.map(o => {
    const time = o?.obsTimeLocal || o?.obsTimeUtc || "—";
    const values = active.map(a => pick(o, [a.key]));
    return [time, ...values];
  });

  // Render
  cards.appendChild(asTable(rows, headers));

  // deja el JSON para inspección
  print(payload);
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
