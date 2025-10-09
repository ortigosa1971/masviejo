// server.js (para Node 18+ / Railway)
// API principal de Weather Underground + SQLite (better-sqlite3)

import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { db, DB_PATH, insertMany, getStats, getRows, exportCsv } from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(process.cwd(), "public");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

/**
 * Normaliza una observación devuelta por la API de Weather Underground.
 */
function mapWUObservation(stationId, obs) {
  const metric = obs.metric || {};
  const epoch = Number(
    obs.epoch ?? obs.obsTimeEpoch ?? Math.floor(new Date(obs.obsTimeUtc).getTime() / 1000)
  );
  return {
    station: stationId,
    epoch,
    obsTimeUtc: obs.obsTimeUtc || obs.obsTimeLocal || null,
    tempC: metric.temp ?? metric.tempAvg ?? metric.tempHigh ?? obs.tempC ?? null,
    dewptC: metric.dewpt ?? metric.dewptAvg ?? obs.dewptC ?? null,
    humidity: obs.humidityAvg ?? obs.humidity ?? null,
    pressureHpa: metric.pressure ?? metric.pressureMax ?? obs.pressureHpa ?? null,
    windKph: metric.windspeedAvg ?? obs.windKph ?? 0,
    windGustKph: metric.windgustHigh ?? obs.windGustKph ?? 0,
    windDir: obs.winddirAvg ?? obs.windDir ?? null,
    precipRateMm: metric.precipRate ?? obs.precipRateMm ?? 0,
    precipTotalMm: metric.precipTotal ?? obs.precipTotalMm ?? 0,
    solarWm2: obs.solarRadiationHigh ?? obs.solarWm2 ?? null,
    uv: obs.uvHigh ?? obs.uv ?? null,
    raw: JSON.stringify(obs),
  };
}

/**
 * Importa un día de datos desde Weather Underground.
 * Endpoint: /api/wu/history?stationId=IALFAR32&date=YYYYMMDD
 */
app.get("/api/wu/history", async (req, res) => {
  try {
    const apiKey = process.env.WU_API_KEY;
    if (!apiKey)
      return res.status(400).json({ error: "Falta WU_API_KEY en variables de entorno" });

    const stationId = String(req.query.stationId || "").trim();
    const date = String(req.query.date || "").trim();
    if (!stationId || !date)
      return res.status(400).json({ error: "Parámetros requeridos: stationId y date=YYYYMMDD" });

    const url = `https://api.weather.com/v2/pws/history/all?stationId=${encodeURIComponent(
      stationId
    )}&format=json&date=${date}&apiKey=${apiKey}`;

    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text();
      return res
        .status(r.status)
        .json({ error: `WU HTTP ${r.status}`, body: txt.slice(0, 400) });
    }

    const data = await r.json();
    const list = Array.isArray(data.observations) ? data.observations : [];

    if (!list.length) {
      return res.json({ inserted: 0, stationId, date, message: "Sin observaciones para ese día" });
    }

    const rows = list.map((o) => mapWUObservation(stationId, o)).filter((r) => Number.isFinite(r.epoch));
    const inserted = insertMany(rows);

    const first = rows[0] || null;
    const last = rows[rows.length - 1] || null;

    res.json({ inserted, stationId, date, first, last });
  } catch (err) {
    console.error("WU history error:", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Devuelve estadísticas básicas de la base de datos.
 */
app.get("/api/db/stats", (req, res) => {
  try {
    const station = req.query.station;
    res.json(getStats(station));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/**
 * Devuelve registros de observaciones (JSON).
 */
app.get("/api/db/view", (req, res) => {
  try {
    const { station, limit, fromEpoch, toEpoch } = req.query;
    const rows = getRows({ station, limit, fromEpoch, toEpoch });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/**
 * Exporta observaciones en formato CSV.
 */
app.get("/api/db/export.csv", (req, res) => {
  try {
    const { station, fromEpoch, toEpoch, limit } = req.query;
    const csv = exportCsv({ station, fromEpoch, toEpoch, limit });
    res.setHeader("Content-Disposition", 'attachment; filename="observations.csv"');
    res.type("text/csv; charset=utf-8");
    res.send(csv);
  } catch (e) {
    res.status(500).send(`Error exportando CSV: ${String(e)}`);
  }
});

/**
 * Permite descargar la base de datos SQLite actual como archivo .db
 */
app.get("/download/db", (req, res) => {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return res.status(404).send("Base de datos no disponible todavía.");
    }

    const tmpDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const outPath = path.join(tmpDir, "wu-export.db");

    // Copia consistente del estado actual de la base de datos
    db.prepare(`VACUUM INTO ?`).run(outPath);

    res.setHeader("Content-Disposition", 'attachment; filename="wu.db"');
    res.type("application/octet-stream");
    res.sendFile(outPath);
  } catch (e) {
    console.error(e);
    res.status(500).send("No se pudo exportar la base de datos.");
  }
});

/**
 * Endpoint de depuración: muestra la ruta real de la BD y su tamaño.
 */
app.get("/api/db/debug", (_req, res) => {
  try {
    const exists = fs.existsSync(DB_PATH);
    const size = exists ? fs.statSync(DB_PATH).size : 0;
    res.json({ DB_PATH, exists, size });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/**
 * Inicio del servidor.
 */
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

