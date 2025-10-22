// server.js - versión ESM compatible con Node 20/22 y Railway
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

// --- Health Check (en /api/health) ---
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "Servidor activo",
    version: "1.2.1-esm",
  });
});

// --- Helper env ---
function getEnv(key, required = false, fallback = undefined) {
  const val = process.env[key];
  if (required && (!val || val.trim() === "")) {
    throw new Error(`Falta ${key} en variables de entorno`);
  }
  return val ? val.trim() : fallback;
}

// --- /api/wu/history ---
// Ahora usa v2/pws/observations/all con startDate/endDate en el mismo día
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

    // Observaciones completas por intervalo -> suele traer temp, humedad, viento, presión, etc.
    const url =
      `https://api.weather.com/v2/pws/observations/all?` +
      `stationId=${encodeURIComponent(stationId)}` +
      `&format=json` +
      `&units=${encodeURIComponent(units)}` +
      `&numericPrecision=decimal` +
      `&startDate=${encodeURIComponent(date)}` +
      `&endDate=${encodeURIComponent(date)}` +
      `&apiKey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    const raw = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: "Error al consultar Weather Underground (observations/all)",
        details: raw,
      });
    }

    const data = JSON.parse(raw);
    res.json({ success: true, stationId, date, units, data });
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
      return res.status(400).json({
        success: false,
        error: "Parámetro requerido: stationId",
      });
    }

    const url =
      `https://api.weather.com/v2/pws/observations/current?` +
      `stationId=${encodeURIComponent(stationId)}` +
      `&format=json&units=${encodeURIComponent(units)}` +
      `&apiKey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    const raw = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: "Error al consultar Weather Underground (current)",
        details: raw,
      });
    }

    const data = JSON.parse(raw);
    res.json({ success: true, stationId, units, data });
  } catch (err) {
    console.error("Error en /api/wu/current:", err);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
      details: err.message,
    });
  }
});

// --- Arranque ---
app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en puerto ${PORT}`);
});

