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
  res.json({ status: "ok", message: "Servidor activo", version: "1.2.2-esm" });
});

// --- Utils ---
function getEnv(key, required = false, fallback = undefined) {
  const val = process.env[key];
  if (required && (!val || val.trim() === "")) {
    throw new Error(`Falta ${key} en variables de entorno`);
  }
  return val ? val.trim() : fallback;
}

function yyyy_mm_dd(date) {
  // "YYYYMMDD" -> { y:YYYY, m:MM, d:DD }
  if (!/^\d{8}$/.test(date)) return null;
  return { y: date.slice(0, 4), m: date.slice(4, 6), d: date.slice(6, 8) };
}

async function fetchWU(url) {
  // Algunas rutas del CDN son quisquillosas con headers
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "masviejo-wu-client/1.0 (+railway)"
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

// --- /api/wu/history ---
// Estrategia: observations/all -> observations/hourly -> history/all
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

    const d = yyyy_mm_dd(date);
    if (!d) {
      return res.status(400).json({
        success: false,
        error: "Formato de fecha inválido. Usa YYYYMMDD",
      });
    }

    // 1) observations/all (más completo)
    const urlAll =
      `https://api.weather.com/v2/pws/observations/all?` +
      `stationId=${encodeURIComponent(stationId)}` +
      `&format=json` +
      `&units=${encodeURIComponent(units)}` +
      `&numericPrecision=decimal` +
      `&startDate=${encodeURIComponent(date)}` +
      `&endDate=${encodeURIComponent(date)}` +
      `&apiKey=${encodeURIComponent(apiKey)}`;

    let step = "observations/all";
    let r = await fetchWU(urlAll);

    // 2) fallback: observations/hourly (si 401/403/404)
    if (!r.ok && [401, 403, 404].includes(r.status)) {
      const urlHourly =
        `https://api.weather.com/v2/pws/observations/hourly?` +
        `stationId=${encodeURIComponent(stationId)}` +
        `&format=json` +
        `&units=${encodeURIComponent(units)}` +
        `&numericPrecision=decimal` +
        `&startDate=${encodeURIComponent(date)}` +
        `&endDate=${encodeURIComponent(date)}` +
        `&apiKey=${encodeURIComponent(apiKey)}`;
      step = "observations/hourly";
      r = await fetchWU(urlHourly);
    }

    // 3) fallback final: history/all (el que ya te funcionaba)
    if (!r.ok && [401, 403, 404].includes(r.status)) {
      const urlHistoryAll =
        `https://api.weather.com/v2/pws/history/all?` +
        `stationId=${encodeURIComponent(stationId)}` +
        `&format=json` +
        `&date=${encodeURIComponent(date)}` +
        `&units=${encodeURIComponent(units)}` +
        `&apiKey=${encodeURIComponent(apiKey)}`;
      step = "history/all";
      r = await fetchWU(urlHistoryAll);
    }

    if (!r.ok) {
      return res.status(r.status || 502).json({
        success: false,
        message: `Error al consultar Weather Underground (${step})`,
        details: r.text,
      });
    }

    let data;
    try {
      data = JSON.parse(r.text);
    } catch {
      return res.status(502).json({
        success: false,
        message: `Respuesta no JSON desde Weather Underground (${step})`,
        details: r.text?.slice(0, 400),
      });
    }

    res.json({ success: true, stationId, date, units, source: step, data });
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
        details: r.text,
      });
    }

    let data;
    try { data = JSON.parse(r.text); }
    catch {
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
