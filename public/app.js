// app.js — UI mínima con acciones y KPIs

const $ = (sel) => document.querySelector(sel);
const tbody = $("#tbody");
const kCount = $("#kpiCount");
const kMin   = $("#kpiMin");
const kMax   = $("#kpiMax");
const kSta   = $("#kpiStation");

const stationInput = $("#station");
const dateInput = $("#date");
const importBtn = $("#importBtn");
const importStatus = $("#importStatus");
const csvBtn = $("#csvBtn");

// Helpers
function fmt(n) { return Number.isFinite(n) ? String(n) : "—"; }
function setStatus(msg, type="muted") {
  importStatus.className = "status " + (type || "muted");
  importStatus.textContent = msg;
}

// Cargar KPIs + tabla
async function refreshUI(station=null) {
  // KPIs
  try {
    const url = new URL(location.origin + "/api/db/stats");
    if (station) url.searchParams.set("station", station);
    const res = await fetch(url);
    const stats = await res.json();
    kCount.textContent = fmt(stats.count);
    kMin.textContent   = fmt(stats.minEpoch);
    kMax.textContent   = fmt(stats.maxEpoch);
    kSta.textContent   = station || "—";
  } catch (e) {
    kCount.textContent = kMin.textContent = kMax.textContent = "—";
    setStatus("Error cargando estadísticas", "err");
  }

  // Tabla
  try {
    const url2 = new URL(location.origin + "/api/db/view");
    url2.searchParams.set("limit", "100");
    if (station) url2.searchParams.set("station", station);
    const res2 = await fetch(url2);
    const rows = await res2.json();

    tbody.innerHTML = "";
    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted">No hay datos disponibles aún.</td></tr>`;
      return;
    }
    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.station ?? ""}</td>
        <td>${r.obsTimeUtc ?? ""}</td>
        <td>${r.tempC ?? ""}</td>
        <td>${r.humidity ?? ""}</td>
      `;
      tbody.appendChild(tr);
    }
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Error al cargar los datos.</td></tr>`;
  }
}

// Importar un día de una estación
async function importDay() {
  const stationId = (stationInput.value || "").trim();
  const date = (dateInput.value || "").trim();
  if (!stationId || !/^\w{3,}$/.test(stationId)) {
    setStatus("Pon un Station ID válido", "err"); return;
  }
  if (!/^\d{8}$/.test(date)) {
    setStatus("Fecha en formato YYYYMMDD", "err"); return;
  }
  try {
    importBtn.disabled = true;
    setStatus("Importando…");
    const url = new URL(location.origin + "/api/wu/history");
    url.searchParams.set("stationId", stationId);
    url.searchParams.set("date", date);
    const res = await fetch(url);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch {
      // Si el navegador traduce, puede romper JSON → mostramos preview
      setStatus("Respuesta no-JSON de WU (desactiva traducción).", "err");
      console.warn("Respuesta WU:", text.slice(0,200));
      importBtn.disabled = false;
      return;
    }
    if (json.error) {
      setStatus(json.error, "err");
    } else {
      setStatus(`Insertadas ${json.inserted} filas`, "ok");
      await refreshUI(stationId);
    }
  } catch (e) {
    console.error(e);
    setStatus("Error importando", "err");
  } finally {
    importBtn.disabled = false;
  }
}

// Exportar CSV (filtrado por estación si está rellena)
async function exportCSV() {
  const stationId = (stationInput.value || "").trim();
  const url = new URL(location.origin + "/api/db/export.csv");
  if (stationId) url.searchParams.set("station", stationId);
  const res = await fetch(url);
  const blob = await res.blob();

  const a = document.createElement("a");
  const today = new Date().toISOString().slice(0,10).replace(/-/g, "");
  a.href = URL.createObjectURL(blob);
  a.download = `wu_${stationId || "all"}_${today}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

importBtn.addEventListener("click", importDay);
csvBtn.addEventListener("click", exportCSV);

// Pre-cargar ejemplo útil
(function init() {
  // Sugerimos estación vacía y fecha de ayer (UX)
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth()+1).padStart(2,"0");
  const dd = String(d.getUTCDate()).padStart(2,"0");
  dateInput.value = `${yyyy}${mm}${dd}`;
  refreshUI(); // global
})();





