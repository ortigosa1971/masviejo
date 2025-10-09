// server.js
// Proxy + static server for WU PWS history (Railway-friendly)
import express from "express";
import dotenv from "dotenv";
import { insertMany, getStats, exportQuery, normalizeObservation } from "./db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
const WU_API_KEY = process.env.WU_API_KEY;

// Anti-cache middleware for API responses
app.use((req, res, next) => {
  if (req.path && req.path.startsWith("/api")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
  }
  next();
});

// --- API para importar datos de Weather Underground ---
app.get("/api/wu/history", async (req, res) => {
  try {
    const { stationId, date } = req.query;
    if (!stationId || !date) {
      return res.status(400).json({ error: "Faltan parámetros: stationId y date (YYYYMMDD)" });
    }
    if (!WU_API_KEY) {
      return res.status(500).json({ error: "Falta WU_API_KEY en variables de entorno" });
    }

    const baseHist = "https://api.weather.com/v2/pws/history/all";
    const histParams = new URLSearchParams({
      stationId,
      date,
      format: "json",
      units: "m",
      apiKey: WU_API_KEY,
    });
    const histUrl = `${baseHist}?${histParams.toString()}`;
    const r = await fetch(histUrl, { headers: { Accept: "application/json" } });
    const text = await r.text();

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error("WU JSON parse error", e, text.slice(0, 200));
      return res.status(502).json({ error: "Respuesta WU inválida", preview: text.slice(0, 200) });
    }

    const list = Array.isArray(json?.observations)
      ? json.observations
      : Array.isArray(json)
      ? json
      : [];

    if (!list.length) {
      return res.json({
        inserted: 0,
        message: "Sin observaciones para ese día",
        sourceCount: Array.isArray(list) ? list.length : 0,
      });
    }

    const rows = list.map((o) => normalizeObservation(o, stationId));
    insertMany(rows);

    res.json({
      inserted: rows.length,
      stationId,
      date,
      first: rows[0],
      last: rows[rows.length - 1],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al consultar Weather.com", details: String(err) });
  }
});

// --- Health Check ---
app.get("/health", (_req, res) => res.json({ ok: true }));

// --- Static Frontend ---
app.use(express.static("public"));

// --- Endpoints de base de datos ---
app.get("/api/db/stats", (req, res) => {
  try {
    const station = req.query.station;
    const stats = getStats(station);
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.get("/api/db/export.json", (req, res) => {
  try {
    const station = req.query.station || null;
    const fromEpoch = req.query.from ? Number(req.query.from) : null;
    const toEpoch = req.query.to ? Number(req.query.to) : null;
    const rows = exportQuery({ station, fromEpoch, toEpoch });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.get("/api/db/export.csv", (req, res) => {
  try {
    const station = req.query.station || null;
    const fromEpoch = req.query.from ? Number(req.query.from) : null;
    const toEpoch = req.query.to ? Number(req.query.to) : null;
    const rows = exportQuery({ station, fromEpoch, toEpoch });

    const cols = [
      "station",
      "epoch",
      "obsTimeUtc",
      "tempC",
      "dewpointC",
      "humidity",
      "pressureHpa",
      "windKph",
      "windGustKph",
      "windDir",
      "precipRateMm",
      "precipTotalMm",
      "solarWm2",
      "uv",
    ];
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (/[\",\\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const lines = [cols.join(",")];
    for (const r of rows) lines.push(cols.map((k) => esc(r[k])).join(","));
    const csv = lines.join("\n");
    res.type("text/csv").send(csv);
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

// --- NUEVO: /api/db/view para mostrar datos en el frontend ---
app.get("/api/db/view", (req, res) => {
  try {
    const station = req.query.station || null;
    const fromEpoch = req.query.from ? Number(req.query.from) : null;
    const toEpoch = req.query.to ? Number(req.query.to) : null;
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const rows = exportQuery({ station, fromEpoch, toEpoch, limit });
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

// --- Start server ---
app.listen(PORT, HOST, () => {
  console.log(`Servidor escuchando en http://${HOST}:${PORT}`);
});


