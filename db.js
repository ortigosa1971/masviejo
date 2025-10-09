// db.js (ESM)
// Gestor de SQLite + utilidades de inserción/consulta/exportación

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export const DATA_DIR = path.join(process.cwd(), "data");
export const DB_PATH  = path.join(DATA_DIR, "wu.db");

// Asegura carpeta "data"
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Abre BD
export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

// Esquema (idempotente)
db.prepare(`
  CREATE TABLE IF NOT EXISTS observations (
    station        TEXT NOT NULL,
    epoch          INTEGER NOT NULL,
    obsTimeUtc     TEXT,
    tempC          REAL,
    dewptC         REAL,
    humidity       INTEGER,
    pressureHpa    REAL,
    windKph        REAL,
    windGustKph    REAL,
    windDir        INTEGER,
    precipRateMm   REAL,
    precipTotalMm  REAL,
    solarWm2       REAL,
    uv             REAL,
    raw            TEXT,
    PRIMARY KEY (station, epoch)
  )
`).run();

export function insertMany(rows = []) {
  if (!rows.length) return 0;
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO observations
    (station,epoch,obsTimeUtc,tempC,dewptC,humidity,pressureHpa,windKph,windGustKph,windDir,precipRateMm,precipTotalMm,solarWm2,uv,raw)
    VALUES (@station,@epoch,@obsTimeUtc,@tempC,@dewptC,@humidity,@pressureHpa,@windKph,@windGustKph,@windDir,@precipRateMm,@precipTotalMm,@solarWm2,@uv,@raw)
  `);
  const trx = db.transaction((arr) => {
    let count = 0;
    for (const r of arr) count += stmt.run(r).changes;
    return count;
  });
  return trx(rows);
}

export function getStats(station) {
  const where = station ? "WHERE station = ?" : "";
  const params = station ? [station] : [];
  const row = db.prepare(`
    SELECT COUNT(*) as count,
           MIN(epoch) as minEpoch,
           MAX(epoch) as maxEpoch
    FROM observations
    ${where}
  `).get(...params);
  return row || { count: 0, minEpoch: null, maxEpoch: null };
}

export function getRows({ station, limit = 100, fromEpoch, toEpoch }) {
  const wh = [];
  const params = [];
  if (station) { wh.push("station = ?"); params.push(station); }
  if (fromEpoch) { wh.push("epoch >= ?"); params.push(Number(fromEpoch)); }
  if (toEpoch) { wh.push("epoch <= ?"); params.push(Number(toEpoch)); }
  const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
  const lim = Math.max(1, Math.min(Number(limit) || 100, 1000));
  return db.prepare(`
    SELECT station, epoch, obsTimeUtc, tempC, dewptC, humidity, pressureHpa,
           windKph, windGustKph, windDir, precipRateMm, precipTotalMm, solarWm2, uv
    FROM observations
    ${where}
    ORDER BY epoch ASC
    LIMIT ${lim}
  `).all(...params);
}

export function exportCsv({ station, fromEpoch, toEpoch, limit = 100000 }) {
  const rows = getRows({ station, fromEpoch, toEpoch, limit });
  const header = [
    "station","epoch","obsTimeUtc","tempC","dewptC","humidity","pressureHpa",
    "windKph","windGustKph","windDir","precipRateMm","precipTotalMm","solarWm2","uv"
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const vals = header.map(k => r[k] ?? "");
    lines.push(vals.join(","));
  }
  return lines.join("\n");
}
