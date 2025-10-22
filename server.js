// server.js - ESM, Node 20/22, Railway
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3001;

// --- Estáticos en / (sirve public/) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Health Check ---
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "Servidor activo", version: "1.3.0-esm" });
});

// --- Utils ---
function getEnv(key, required = false, fallback = undefined) {
  const val = process.env[key];
  if (required && (!val || val.trim() === "")) {
    throw new Error(`Falta ${key} en variables de entorno`);
  }
  return val ? val.trim() : fallback;
}
function validDateYYYYMMDD(s) { return /^\d{8}$/.test(s); }
async function fetchWU(url) {
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "masviejo-wu-client/1.0 (+railway)"
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}
function tryParseJSON(text) { try { return JSON.parse(text); } catch { return null; } }
function num(x) { const n = Number(x); return Number.isFinite(n) ? n : undefined; }

// Une dos listas de observaciones por tiempo (epoch/obsTimeLocal), rellenando campos vacíos
function mergeObservations(primary = [], secondary = [], toleranceSec = 300) {
  // indexa secondary por epoch +/- tolerancia
  const idx = new Map();
  for (const s of secondary) {
    const epoch = num(s.epoch);
    if (!Number.isFinite(epoch)) continue;
    const bucket = Math.floor(epoch / toleranceSec);
    if (!idx.has(bucket)) idx.set(bucket, []);
    idx.get(bucket).push(s);
  }
  const pick = (a, b) => (a !== undefined && a !== null && a !== "" ? a : b);

  const out = [];
  for (const p of primary) {
    const epoch = num(p.epoch);
    let best = null;
    if (Number.isFinite(epoch)) {
      const bucket = Math.floor(epoch / toleranceSec);
      const candidates = [
        ...(idx.get(bucket - 1) || []),
        ...(idx.get(bucket) || []),
        ...(idx.get(bucket + 1) || []),
      ];
      // elige el más cercano en tiempo
      let bestDt = Infinity;
      for (const c of candidates) {
        const e = num(c.epoch);
        if (!Number.isFinite(e)) continue;
        const dt = Math.abs(e - epoch);
        if (dt <= toleranceSec && dt < bestDt) { bestDt = dt; best = c; }
      }
    }

    if (!best) { out.push(p); continue; }

    // fusionar
    const merged = { ...best, ...p }; // p tiene prioridad
    // fusiona subobjeto metric campo a campo
    merged.metric = {
      ...(best.metric || {}),
      ...(p.metric || {})
    };
    // rellena campos top-level si faltan en p pero existen en best
    for (const k of Object.keys(best)) {
      if (k === "metric") continue;
      merged[k] = pick(p[k], best[k]);
    }
    out.push(merged);
  }
  return out;
}

// --- /api/wu/history ---
// Estrategia: hourly (más rico) + merge con history/all (lluvia) -> fallback solo history/all
app.get("/api/wu/history", async (req, res) => {
  try {
    const apiKey = getEnv("WU_API_KEY", true);
    const units = getEnv("WU_UNITS", false, "m");
    const stationId = (req.query.stationId || "").trim();
    const date = (req.query.date || "").trim(); // YYYYMMDD

    if (!stationId || !date) {
      return res.status(400).json({
        success: false,
        error: "Parámetros requeridos: stationId y date=YYYYMMDD",
      });
    }
    if (!validDateYYYYMMDD(date)) {
      return res.status(400).json({
        success: false,
        error: "Formato de fecha inválido. Usa YYYYMMDD",
      });
    }

    const base = `stationId=${encodeURIComponent(stationId)}&format=json&units=${encodeURIComponent(units)}&apiKey=${encodeURIComponent(apiKey)}`;

    // 1) hourly (suele traer temp/humedad/viento/presión/uv…)
    const urlHourly = `https://api.weather.com/v2/pws/observations/hourly?${base}&numericPrecision=decimal&startDate=${date}&endDate=${date}`;
    const rHourly = await fetchWU(urlHourly);
    const jsonHourly = rHourly.ok ? tryParseJSON(rHourly.text) : null;
    const hourlyObs = jsonHourly?.observations || [];

    // 2) history/all (precipitación y agregados, a veces pobre en el resto)
    const urlHistAll = `https://api.weather.com/v2/pws/history/all?${base}&date=${date}`;
    const rHist = await fetchWU(urlHistAll);
    const jsonHist = rHist.ok ? tryParseJSON(rHist.text) : null;
    const histObs = jsonHist?.observations || [];

    // Si hourly falló, devuelve al menos history/all
    if (!rHourly.ok || !Array.isArray(hourlyObs) || hourlyObs.length === 0) {
      if (rHist.ok && Array.isArray(histObs) && histObs.length > 0) {
        return res.json({
          success: true,
          stationId, date, units,
          source: "history/all",
          data: { observations: histObs }
        });
      }
      // si ambos fallan, propaga el mejor error
      const status = rHourly.ok ? (rHist.status || 502) : (rHourly.status || 502);
      return res.status(status).json({
        success: false,
        message: "No se pudieron obtener observaciones (hourly ni history/all)",
        details: { hourly: rHourly.text?.slice(0,400), historyAll: rHist.text?.slice(0,400) }
      });
    }

    // 3) hay hourly -> fusiona con history/all para añadir lluvia/otros
    let merged = hourlyObs;
    if (Array.isArray(histObs) && histObs.length > 0) {
      merged = mergeObservations(hourlyObs, histObs, 600); // tolerancia 10 min
    }

    return res.json({
      success: true,
      stationId, date, units,
      source: "hourly+history/all",
      data: { observations: merged }
    });
  } catch (err) {
    console.error("Error en /api/wu/history:", err);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
      details: err.message,
    });
  }
});

// --- /api/wu/current ---
app.get("/api/wu/current", async (req, res) => {
  try {
    const apiKey = getEnv("WU_API_KEY", true);
    const units = getEnv("WU_UNITS", false, "m");
    const stationId = (req.query.stationId || "").trim();

    if (!stationId) {
      return res.status(400).json({ success: false, error: "Parámetro requerido: stationId" });
    }

    const url =
      `https://api.weather.com/v2/pws/observations/current?` +
      `stationId=${encodeURIComponent(stationId)}` +
      `&format=json&units=${encodeURIComponent(units)}` +
      `&apiKey=${encodeURIComponent(apiKey)}`;

    const r = await fetchWU(url);
    if (!r.ok) {
      return res.status(r.status || 502).json({
        success: false,
        message: "Error al consultar Weather Underground (current)",
        details: r.text?.slice(0,400),
      });
    }

    const data = tryParseJSON(r.text);
    if (!data) {
      return res.status(502).json({
        success: false,
        message: "Respuesta no JSON desde Weather Underground (current)",
        details: r.text?.slice(0, 400),
      });
    }

    res.json({ success: true, stationId, units, data });
  } catch (err) {
    console.error("Error en /api/wu/current:", err);
    res.status(500).json({ success: false, error: "Error interno del servidor", details: err.message });
  }
});

// --- Arranque ---
app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en puerto ${PORT}`);
});
