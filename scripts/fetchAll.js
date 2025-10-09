// scripts/fetchAll.js
// Importador masivo: trae todo el histórico disponible de Weather Underground
// y lo inserta en tu BD a través de tu endpoint /api/wu/history.
//
// Uso típico (producción):
//   BASE_URL="https://masviejo-production.up.railway.app" STATION="IALFAR32" npm run fetch:all
//
// Variables de entorno (opcionales):
//   BASE_URL  → por defecto http://localhost:3000
//   STATION   → por defecto IALFAR32
//   SLEEP_MS  → espera entre peticiones; por defecto 1500
//   NO_DATA_STOP_DAYS → parar tras N días seguidos sin datos; por defecto 14

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const STATION  = process.env.STATION  || "IALFAR32";
const SLEEP_MS = Number(process.env.SLEEP_MS || 1500);
const NO_DATA_STOP_DAYS = Number(process.env.NO_DATA_STOP_DAYS || 14);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const yyyymmdd = (d) => {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth()+1).padStart(2,"0");
  const dd = String(d.getUTCDate()).padStart(2,"0");
  return `${yyyy}${mm}${dd}`;
};
const addDaysUTC = (d, delta) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + delta);
  return x;
};

async function getStats() {
  const res = await fetch(`${BASE_URL}/api/db/stats?station=${encodeURIComponent(STATION)}`);
  if (!res.ok) throw new Error(`stats HTTP ${res.status}`);
  return await res.json();
}

async function importDay(dateStr) {
  const url = `${BASE_URL}/api/wu/history?stationId=${encodeURIComponent(STATION)}&date=${dateStr}`;
  const res = await fetch(url);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Respuesta no JSON para ${dateStr}: ${text.slice(0,150)}`);
  }
  if (json.error) throw new Error(`Error WU ${dateStr}: ${json.error}`);
  return Number(json.inserted || 0);
}

async function run() {
  console.log(`== Importador masivo WU ==`);
  console.log(`BASE_URL: ${BASE_URL}`);
  console.log(`STATION : ${STATION}\n`);

  const stats = await getStats().catch(() => ({ count: 0, minEpoch: null, maxEpoch: null }));
  console.log(`Estado inicial BD:`, stats);

  const today = new Date();
  let total = 0;

  // Completar hacia adelante
  if (stats.count > 0 && Number.isFinite(stats.maxEpoch)) {
    let start = addDaysUTC(new Date(stats.maxEpoch * 1000), 1);
    for (let d = start; d <= today; d = addDaysUTC(d, 1)) {
      const ds = yyyymmdd(d);
      try {
        const inserted = await importDay(ds);
        console.log(`${ds}  +${inserted}`);
        total += inserted;
      } catch (e) {
        console.warn(`${ds}  ${e.message}`);
      }
      await sleep(SLEEP_MS);
    }
  }

  // Retroceder hasta que deje de haber datos
  let noData = 0;
  let startBack = stats.count > 0 && Number.isFinite(stats.minEpoch)
    ? addDaysUTC(new Date(stats.minEpoch * 1000), -1)
    : today;
  console.log(`\n→ Retrocediendo desde ${yyyymmdd(startBack)} (detiene tras ${NO_DATA_STOP_DAYS} días sin datos)`);
  for (let d = startBack; noData < NO_DATA_STOP_DAYS; d = addDaysUTC(d, -1)) {
    const ds = yyyymmdd(d);
    try {
      const inserted = await importDay(ds);
      if (inserted > 0) {
        noData = 0;
        console.log(`${ds}  +${inserted}`);
        total += inserted;
      } else {
        noData++;
        console.log(`${ds}  (sin datos)`);
      }
    } catch (e) {
      console.warn(`${ds}  ${e.message}`);
      noData++;
    }
    await sleep(SLEEP_MS);
  }

  console.log(`\nHecho. Filas insertadas: ${total}`);
  const final = await getStats().catch(() => null);
  if (final) console.log("Estado final:", final);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
