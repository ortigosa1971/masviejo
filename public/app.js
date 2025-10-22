const $ = (q) => document.querySelector(q);
const out = $("#output");

function print(obj) {
  out.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

function base() {
  const b = $("#baseUrl").value.trim().replace(/\/$/, "");
  if (!b) throw new Error("Debes indicar la Base URL (ej: https://tu-app.railway.app)");
  return b;
}

function params() {
  const stationId = $("#stationId").value.trim();
  const date = $("#date").value.trim();
  return { stationId, date };
}

async function call(path) {
  const url = `${base()}${path}`;
  print("Cargando " + url + " ...");
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    print({ ok: false, status: res.status, body: text });
    return;
  }
  try { print(JSON.parse(text)); } catch { print(text); }
}

$("#btnCurrent").addEventListener("click", () => {
  const { stationId } = params();
  if (!stationId) return print("Falta stationId");
  call(`/api/wu/current?stationId=${encodeURIComponent(stationId)}`);
});

$("#btnHistory").addEventListener("click", () => {
  const { stationId, date } = params();
  if (!stationId || !date) return print("Faltan stationId y/o date (YYYYMMDD)");
  call(`/api/wu/history?stationId=${encodeURIComponent(stationId)}&date=${encodeURIComponent(date)}`);
});

$("#btnHealth").addEventListener("click", () => call(`/`));
$("#btnClear").addEventListener("click", () => print("Sin resultados aún…"));

// Defaults útiles
document.addEventListener("DOMContentLoaded", () => {
  $("#date").value = new Date().toISOString().slice(0,10).replace(/-/g, "");
});
