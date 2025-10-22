// ------- util DOM -------
const $ = (sel) => document.querySelector(sel);
const baseUrlEl = $("#baseUrl");
const stationEl = $("#stationId");
const btnStationEdit = $("#btnStationEdit");
const fromEl = $("#fromDate");
const toEl = $("#toDate");
const btnAuto = $("#btnAuto");
const btnCurrent = $("#btnCurrent");
const btnHistory = $("#btnHistory");
const btnHealth = $("#btnHealth");
const btnClear = $("#btnClear");
const cardsEl = $("#cards");
const outputEl = $("#output");

// ------- constantes -------
const HISTORY_PATHS = ["/history/all", "/history", "/api/history"];
const CURRENT_PATHS = ["/current", "/api/current"];
const HEALTH_PATHS = ["/api/health", "/health"];

// ------- estado / storage -------
const LS_KEY = "wu-client-state-v2";

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    if (s.baseUrl) baseUrlEl.value = s.baseUrl;
    if (s.stationId) stationEl.value = s.stationId;
    if (s.fromDate) fromEl.value = s.fromDate;
    if (s.toDate) toEl.value = s.toDate;
  } catch (_) {}
}

function saveState() {
  const s = {
    baseUrl: baseUrlEl.value.trim(),
    stationId: stationEl.value.trim(),
    fromDate: fromEl.value,
    toDate: toEl.value,
  };
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

// ------- helpers -------
function getBase() {
  const v = baseUrlEl.value.trim().replace(/\/+$/, "");
  if (!v) throw new Error("Introduce la Base URL");
  try { new URL(v); } catch { throw new Error("Base URL no es válida"); }
  return v;
}

function stationId() {
  const v = stationEl.value.trim();
  if (!v) throw new Error("Introduce el Station ID");
  return v;
}

function friendlyErr(e) {
  if (e?.response) {
    return `HTTP ${e.response.status}  · ${e.response.url}\n${e.responseText || ""}`;
  }
  if (e instanceof Response) {
    return `HTTP ${e.status}  · ${e.url}`;
  }
  return e?.message || String(e);
}

async function fetchJSON(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status}`);
    err.response = res;
    err.responseText = txt;
    throw err;
  }
  return res.json();
}

function ymd(isoDate) {
  // "2025-10-22" -> "20251022"
  return isoDate.replaceAll("-", "");
}

function* daysBetweenISO(fromISO, toISO) {
  const start = new Date(fromISO + "T00:00:00");
  const end = new Date((toISO || fromISO) + "T00:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    yield d.toISOString().slice(0, 10);
  }
}

function setOutput(text, cards = []) {
  cardsEl.innerHTML = cards.map((html) => `<div class="card">${html}</div>`).join("");
  outputEl.textContent = text;
}

function kv(label, value) {
  return `<div class="kv"><span>${label}</span><span>${value}</span></div>`;
}

function summarizeObservations(observations) {
  const regs = observations.length;
  let tmin = null, tmax = null, gustMax = null, rainTotal = 0;

  for (const o of observations) {
    const m = o.metric || {};
    const tHi = m.tempHigh ?? o.tempC ?? null;
    const tLo = m.tempLow ?? o.tempC ?? null;
    const gHi = m.windgustHigh ?? o.windGustKmh ?? o.windgust ?? null;
    const rain = m.precipTotal ?? o.precipTotal ?? 0;

    if (tHi != null) tmax = tmax == null ? tHi : Math.max(tmax, tHi);
    if (tLo != null) tmin = tmin == null ? tLo : Math.min(tmin, tLo);
    if (gHi != null) gustMax = gustMax == null ? gHi : Math.max(gustMax, gHi);
    if (rain != null) rainTotal += Number(rain) || 0;
  }

  return {
    registros: regs,
    tempMin: tmin,
    tempMax: tmax,
    rachaMax_kmh: gustMax,
    lluviaTotal_mm: Number(rainTotal.toFixed(2)),
  };
}

// ------- autodetección de endpoints -------

async function tryPaths(base, paths, qs = "") {
  let lastErr;
  for (const path of paths) {
    const url = `${base}${path}${qs ? `?${qs}` : ""}`;
    try {
      const json = await fetchJSON(url);
      return { url, json };
    } catch (e) {
      lastErr = { url, error: friendlyErr(e) };
    }
  }
  throw new Error(lastErr?.error || "No se encontró un endpoint válido");
}

async function fetchHistoryJSON(base, station, yyyymmdd) {
  const qs = `stationId=${encodeURIComponent(station)}&date=${yyyymmdd}&units=m`;
  try {
    const { json } = await tryPaths(base, HISTORY_PATHS, qs);
    return json;
  } catch (e) {
    return { date: yyyymmdd, __error: friendlyErr(e) };
  }
}

async function fetchCurrentJSON(base, station) {
  const qs = `stationId=${encodeURIComponent(station)}&units=m`;
  const { json } = await tryPaths(base, CURRENT_PATHS, qs);
  return json;
}

async function fetchHealth(base) {
  const { json } = await tryPaths(base, HEALTH_PATHS);
  return json;
}

// ------- UI init -------
loadState();

// Prefill baseUrl si se sirve desde la misma app
btnAuto.addEventListener("click", () => {
  baseUrlEl.value = `${location.origin}`;
  saveState();
});

// Station “Editar”: alterna readonly para fijarla o editarla
let locked = true;
function setLockUI() {
  stationEl.readOnly = locked;
  btnStationEdit.textContent = locked ? "Editar" : "Fijar";
}
setLockUI();
btnStationEdit.addEventListener("click", () => {
  locked = !locked;
  setLockUI();
  if (locked) saveState();
});

// ------- acciones -------
btnHealth.addEventListener("click", async () => {
  try {
    setOutput("Probando /api/health…");
    const base = getBase();
    const json = await fetchHealth(base);
    setOutput("OK\n" + JSON.stringify(json, null, 2), [
      `<div><strong>Health</strong></div>${kv("Base", base)}`
    ]);
    saveState();
  } catch (e) {
    setOutput("Error: " + friendlyErr(e));
  }
});

btnCurrent.addEventListener("click", async () => {
  try {
    setOutput("Consultando /current…");
    const base = getBase();
    const st = stationId();
    const json = await fetchCurrentJSON(base, st);

    const obs = json?.data?.observations || json?.observations || [];
    const last = obs[0] || {};
    const metric = last.metric || {};

    const card =
      `<div><strong>${st}</strong></div>
       ${kv("Hora local", last.obsTimeLocal ?? "—")}
       ${kv("Temp (°C)", metric.tempAvg ?? last.tempC ?? "—")}
       ${kv("Humedad (%)", last.humidityAvg ?? last.humidity ?? "—")}
       ${kv("Viento (km/h)", metric.windspeedAvg ?? last.windKmh ?? "—")}
       ${kv("Racha (km/h)", metric.windgustHigh ?? last.windGustKmh ?? "—")}
       ${kv("Presión (hPa)", metric.pressureMax ?? last.pressure ?? "—")}
       ${kv("Lluvia total (mm)", metric.precipTotal ?? last.precipTotal ?? 0)}
      `;

    setOutput(JSON.stringify(json, null, 2), [card]);
    saveState();
  } catch (e) {
    setOutput("Error: " + friendlyErr(e));
  }
});

btnHistory.addEventListener("click", async () => {
  try {
    setOutput("Consultando /history…");
    const base = getBase();
    const st = stationId();
    const from = fromEl.value;
    const to = toEl.value || fromEl.value;
    if (!from) throw new Error("Selecciona al menos la fecha 'Desde'.");

    // construir lista de días
    const ymdds = [];
    for (const iso of daysBetweenISO(from, to)) ymdds.push(ymd(iso));

    // concurrencia controlada
    const CONC = 6;
    const queue = ymdds.slice();
    const results = [];
    async function worker() {
      while (queue.length) {
        const d = queue.shift();
        const r = await fetchHistoryJSON(base, st, d);
        results.push(r);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONC, ymdds.length) }, worker));

    // separar errores / OK
    const errs = results.filter((r) => r && r.__error);
    const oks  = results.filter((r) => r && !r.__error);

    // aplanar observaciones
    const observations = oks.flatMap((x) => x?.data?.observations || []);
    observations.sort((a, b) =>
      (a.obsTimeLocal || "").localeCompare(b.obsTimeLocal || "")
    );

    const summary = summarizeObservations(observations);
    const header = {
      stationId: st,
      rango: `${from} → ${to}`,
      dias: ymdds.length,
      errores: errs.length,
    };

    const cards = [
      `<div><strong>${st}</strong></div>
       <div>${from} → ${to} (${ymdds.length} día/s)</div>
       ${kv("Registros", summary.registros)}
       ${kv("Temp min/max", `${summary.tempMin ?? "—"} / ${summary.tempMax ?? "—"} °C`)}
       ${kv("Racha máx", `${summary.rachaMax_kmh ?? "—"} km/h`)}
       ${kv("Lluvia total", `${summary.lluviaTotal_mm} mm`)}`
    ];

    let text = "Resumen\n" + JSON.stringify({ ...header, ...summary, desde: from, hasta: to }, null, 2);
    if (errs.length) {
      text += "\n\nErrores por día:\n" + errs.map(e => `- ${e.date} · ${e.__error}`).join("\n\n");
    }
    text += "\n\nObservaciones\n" + JSON.stringify(observations, null, 2);

    setOutput(text, cards);
    saveState();
  } catch (e) {
    setOutput("Error: " + friendlyErr(e));
  }
});

btnClear.addEventListener("click", () => {
  cardsEl.innerHTML = "";
  outputEl.textContent = "Sin resultados aún…";
});

// Sugerencia: si abres desde tu Railway, autocompleta
if (!baseUrlEl.value && location.hostname.endsWith(".railway.app")) {
  baseUrlEl.value = location.origin;
}

// Defaults suaves para fechas (hoy y hoy)
(function seedDates() {
  const today = new Date().toISOString().slice(0,10);
  if (!fromEl.value) fromEl.value = today;
  if (!toEl.value) toEl.value = "";
})();

