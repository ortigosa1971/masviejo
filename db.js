import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "wu.db");
export const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("temp_store = MEMORY");

db.exec(`
CREATE TABLE IF NOT EXISTS observations (
  id            INTEGER PRIMARY KEY,
  station       TEXT NOT NULL,
  epoch         INTEGER NOT NULL,
  obsTimeUtc    TEXT,
  tempC         REAL,
  dewpointC     REAL,
  humidity      REAL,
  pressureHpa   REAL,
  windKph       REAL,
  windGustKph   REAL,
  windDir       REAL,
  precipRateMm  REAL,
  precipTotalMm REAL,
  solarWm2      REAL,
  uv            REAL,
  raw           TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(station, epoch)
);

CREATE INDEX IF NOT EXISTS idx_obs_station_epoch ON observations(station, epoch);
`);

function numOrNull(x) {
  if (x === undefined || x === null || Number.isNaN(Number(x))) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function normalizeObservation(o, station) {
  const epoch = o?.epoch ?? (o?.obsTimeUtc ? Math.floor(Date.parse(o.obsTimeUtc)/1000) : null);
  const obsTimeUtc = o?.obsTimeUtc ?? (epoch ? new Date(epoch * 1000).toISOString() : null);

  const m = o?.metric ?? o?.imperial ?? o;
  const tempC = numOrNull(m?.temp ?? m?.tempAvg ?? m?.temperature);
  const dewpointC = numOrNull(m?.dewpt ?? m?.dewptAvg);
  const humidity = numOrNull(m?.humidity ?? m?.humidityAvg);
  const pressureHpa = numOrNull(m?.pressure ?? m?.pressureMax ?? m?.pressureMin ?? m?.pressure);
  const windKph = numOrNull(m?.windSpeed ?? m?.windSpeedAvg ?? m?.windspeed ?? m?.windspeedAvg);
  const windGustKph = numOrNull(m?.windGust ?? m?.windGustMax ?? m?.windgust ?? m?.windgustMax);
  const windDir = numOrNull(m?.winddir ?? m?.winddirAvg);
  const precipRateMm = numOrNull(m?.precipRate ?? m?.precipRateMm ?? m?.precipRateCm);
  const precipTotalMm = numOrNull(m?.precipTotal ?? m?.precipTotalMm ?? m?.precipTotalCm ?? m?.precip ?? m?.precipMm);
  const solarWm2 = numOrNull(m?.solarRadiation ?? m?.solarRadiationHigh ?? m?.solarRadiationAvg);
  const uv = numOrNull(m?.uv ?? m?.uvHigh ?? m?.uvAvg);

  return {
    station: String(station || o?.station || o?.stationID || "").trim(),
    epoch: epoch || null,
    obsTimeUtc: obsTimeUtc || null,
    tempC, dewpointC, humidity, pressureHpa,
    windKph, windGustKph, windDir,
    precipRateMm, precipTotalMm, solarWm2, uv,
    raw: JSON.stringify(o)
  };
}

const insertStmt = db.prepare(`
INSERT OR IGNORE INTO observations
(station, epoch, obsTimeUtc, tempC, dewpointC, humidity, pressureHpa, windKph, windGustKph, windDir,
 precipRateMm, precipTotalMm, solarWm2, uv, raw)
VALUES (@station, @epoch, @obsTimeUtc, @tempC, @dewpointC, @humidity, @pressureHpa, @windKph, @windGustKph, @windDir,
        @precipRateMm, @precipTotalMm, @solarWm2, @uv, @raw);
`);

export function insertMany(observations, station) {
  const tx = db.transaction((rows) => {
    for (const o of rows) {
      const rec = normalizeObservation(o, station);
      if (rec.epoch && rec.station) insertStmt.run(rec);
    }
  });
  tx(observations || []);
}

export function getStats(station) {
  const where = station ? "WHERE station = ?" : "";
  const sql = `
    SELECT COUNT(*) as count, MIN(epoch) as minEpoch, MAX(epoch) as maxEpoch
    FROM observations ${where}
  `;
  const stmt = db.prepare(sql);
  const row = station ? stmt.get(station) : stmt.get();
  return row || { count: 0, minEpoch: null, maxEpoch: null };
}

export function exportQuery({ station, fromEpoch, toEpoch, limit = 0 }) {
  const conds = [];
  const params = [];
  if (station)   { conds.push("station = ?"); params.push(station); }
  if (fromEpoch) { conds.push("epoch >= ?"); params.push(fromEpoch); }
  if (toEpoch)   { conds.push("epoch <= ?"); params.push(toEpoch); }
  const where = conds.length ? ("WHERE " + conds.join(" AND ")) : "";
  const lim = limit ? `LIMIT ${Number(limit)}` : "";
  const rows = db.prepare(`
    SELECT station, epoch, obsTimeUtc, tempC, dewpointC, humidity, pressureHpa,
           windKph, windGustKph, windDir, precipRateMm, precipTotalMm, solarWm2, uv
    FROM observations
    ${where}
    ORDER BY epoch ASC
    ${lim}
  `).all(...params);
  return rows;
}
