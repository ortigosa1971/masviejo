import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const WU_API_KEY = process.env.WU_API_KEY;
const DEFAULT_UNITS = (process.env.WU_UNITS || "m").toLowerCase(); // m=europeo, e=imperial

function assertEnv() {
  if (!WU_API_KEY) {
    const err = new Error("Configura WU_API_KEY en Railway");
    err.status = 500;
    throw err;
  }
}
function unitsParam(u) {
  const x = (u || DEFAULT_UNITS || "m").toLowerCase();
  return x === "e" ? "e" : "m";
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, version: 1, units: DEFAULT_UNITS || "m" });
});

// /api/current?stationId=IALFAR32&units=m
app.get("/api/current", async (req, res) => {
  try {
    assertEnv();
    const stationId = String(req.query.stationId || "").trim();
    if (!stationId) return res.status(400).json({ error: "Falta stationId" });
    const units = unitsParam(req.query.units);

    const url = new URL("https://api.weather.com/v2/pws/observations/current");
    url.searchParams.set("stationId", stationId);
    url.searchParams.set("format", "json");
    url.searchParams.set("units", units);
    url.searchParams.set("apiKey", WU_API_KEY);

    const r = await fetch(url.toString());
    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);
    res.type("application/json").send(text);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || String(e) });
  }
});

// /api/history?stationId=IALFAR32&date=YYYYMMDD&units=m
// Usa el endpoint “all/1day” (histórico horario del día indicado)
app.get("/api/history", async (req, res) => {
  try {
    assertEnv();
    const stationId = String(req.query.stationId || "").trim();
    const date = String(req.query.date || "").trim(); // YYYYMMDD
    if (!stationId) return res.status(400).json({ error: "Falta stationId" });
    if (!/^\d{8}$/.test(date)) return res.status(400).json({ error: "date debe ser YYYYMMDD" });
    const units = unitsParam(req.query.units);

    const url = new URL("https://api.weather.com/v2/pws/observations/all/1day");
    url.searchParams.set("stationId", stationId);
    url.searchParams.set("format", "json");
    url.searchParams.set("units", units);
    url.searchParams.set("date", date);
    url.searchParams.set("apiKey", WU_API_KEY);

    const r = await fetch(url.toString());
    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);
    res.type("application/json").send(text);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
