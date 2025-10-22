/* utilidades dom */
const $ = (s) => document.querySelector(s);
const baseEl = $("#baseUrl");
const btnAuto = $("#btnAuto");
const stationEl = $("#stationId");
const btnLock = $("#btnLock");
const fromEl = $("#dateFrom");
const toEl = $("#dateTo");
const btnCurrent = $("#btnCurrent");
const btnHistory = $("#btnHistory");
const btnHealth = $("#btnHealth");
const btnClear = $("#btnClear");
const outputEl = $("#output");
const cardsEl = $("#cards");

/* persistencia */
const LS = {
  baseUrl: "wu_baseUrl",
  station: "wu_stationId",
  from: "wu_date_from",
  to: "wu_date_to",
};

function saveState() {
  if (baseEl.value) localStorage.setItem(LS.baseUrl, baseEl.value);
  if (stationEl.value) localStorage.setItem(LS.station, stationEl.value);
  if (fromEl.value) localStorage.setItem(LS.from, fromEl.value);
  if (toEl.value) localStorage.setItem(LS.to, toEl.value);
}

function loadState() {
  baseEl.value = localStorage.getItem(LS.baseUrl) || "";
  stationEl.value = localStorage.getItem(LS.station) || "IALFAR32";
  fromEl.value = localStorage.getItem(LS.from) || "";
  toEl.value = localStorage.getItem(LS.to) || "";
}

/* helpers */
const ymd = (d) => d.replaceAll("-", ""); // yyyy-mm-dd -> yyyymmdd
const friendlyErr = (e) =>
  (e && (e.message || e.statusText)) ? (e.message || e.statusText) : String(e);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function setOutput(text, cards = []) {
  outputEl.textContent = text;
  cardsEl.innerHTML = "";
  for (const c of cards) {
    const div = document.createElement("div");
    div.className = "mini-card";
    div.innerHTML = c;
    cardsEl.appendChild(div);
  }
}

function getBase() {
  const b = baseEl.value.trim();
  assert(b, "Falta Base URL");
  return b.replace(/\/+$/, ""); // sin barra final
}

function stationId() {
  const s = stationEl.value.trim();
  assert(s, "Falta Station ID");
  return s;
}

function* daysBetweenISO(fromISO, toISO) {
  const start = new Date(fromISO);
  const end = toISO ? new Date(toISO) : new Date(fromISO);
  const cur = new Date(start);
  while (cur <= end) {
    yield cur.toISOString().slice(0, 10);
    cur.setDate(cur.getDate() + 1);
  }
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status} ${r.statusText} · ${url}\n${txt}`);
  }
  return r.json();
}

/* renderizadores */
function renderCurrentCard(json) {
  const d = json?.data || json;
  if (!d) return "";
  const ts = d.obsTimeLocal || d.obsTimeUtc || "";
  return `
    <div><strong>${d.stationId || d.stationID || stationId()}</strong></div>
    <div>${ts}</div>
    <div class="kv"><span>Temp</span><span>${d.temperature ?? d.metric?.tempAvg ?? "—"} °C</span></div>
    <div class="kv"><span>Hum.</span><span>${d.humidity ?? d.metric?.humidityAvg ?? "—"} %</span></div>
    <div class="kv"><span>Viento</span><span>${d.windSpeed ?? d.metric?.windspeedAvg ?? "—"} km/h</span></div>
    <div class="kv"><span>Racha</span><span>${d.windGust ?? d.metric?.windgustHigh ?? "—"} km/h</span></div>
    <div class="kv"><span>Presión</span><span>${d.pressure ?? d.metric?.pressureMax ?? "—"} hPa</span></div>
  `;
}

function summarizeObservations(observations) {
  const by = (getter) =>
    observations.map(getter).filter((x) => Number.isFinite(x));
  const temps = by((o) => o?.metric?.tempAvg);
  const tmin = temps.length ? Math.min(...temps) : null;
  const tmax = temps.length ? Math.max(...temps) : null;
  const gusts = by((o) => o?.metric?.windspeedHigh);
  const gmax = gusts.length ? Math.max(...gusts) : null;
  const rain = by((o) => o?.metric?.precipTotal);
  const lluvia = rain.length
    ? rain.reduce((a, b) => a + b, 0)
    : 0;

  return {
    registros: observations.length,
    tempMin: tmin,
    tempMax: tmax,
    rachaMax_kmh: gmax,
    lluviaTotal_mm: Number((lluvia).toFixed(2)),
    desde: observations[0]?.obsTimeLocal || "",
    hasta: observations.at(-1)?.obsTimeLocal || "",
  };
}

/* acciones */
btnAuto.addEventListener("click", () => {
  const here = `${location.protocol}//${location.host}`;
  baseEl.value = here;
  saveState();
});

let locked = true;
function applyLockState() {
  stationEl.readOnly = locked;
  btnLock.textContent = locked ? "Editar" : "Bloquear";
  btnLock.classList.toggle("primary", !locked);
}
btnLock.addEventListener("click", () => {
  locked = !locked;
  applyLockState();
  if (locked) saveState();
});

/* botones principales */
btnCurrent.addEventListener("click", async () => {
  try {
    setOutput("Consultando /current…");
    const url = `${getBase()}/current?stationId=${encodeURIComponent(
      stationId()
    )}&units=m`;
    const json = await fetchJSON(url);
    const card = renderCurrentCard(json);
    setOutput(JSON.stringify(json, null, 2), [card]);
    saveState();
  } catch (e) {
    setOutput("Error: " + friendlyErr(e));
  }
});

btnHistory.addEventListener("click", async () => {
  try {
    setOutput("Consultando /history…");
    const base = getBase();
    const st = stationId();
    const from = fromEl.value;
    const to = toEl.value || fromEl.value; // si sólo hay 'desde', un solo día
    assert(from, "Selecciona al menos la fecha 'Desde'.");

    const ymdds = [];
    for (const iso of daysBetweenISO(from, to)) {
      ymdds.push(ymd(iso));
    }

    const results = await Promise.all(
      ymdds.map((d) =>
        fetchJSON(
          `${base}/history?stationId=${encodeURIComponent(
            st
          )}&date=${d}&units=m`
        ).catch((e) => ({ __error: friendlyErr(e), date: d }))
      )
    );

    // separar errores
    const errs = results.filter((r) => r.__error);
    const oks = results.filter((r) => !r.__error);

    // aplanar observaciones y ordenar
    const observations = oks.flatMap((x) => x?.data?.observations || []);
    observations.sort((a, b) =>
      (a.obsTimeLocal || "").localeCompare(b.obsTimeLocal || "")
    );

    const summary = summarizeObservations(observations);
    const header = {
      stationId: st,
      rango: `${from} → ${to}`,
      dias: ymdds.length,
      errores: errs.length,
    };

    const cards = [
      `<div><strong>${st}</strong></div>
       <div>${from} → ${to} (${ymdds.length} día/s)</div>
       <div class="kv"><span>Registros</span><span>${summary.registros}</span></div>
       <div class="kv"><span>Temp min/max</span><span>${summary.tempMin ?? "—"} / ${summary.tempMax ?? "—"} °C</span></div>
       <div class="kv"><span>Racha máx</span><span>${summary.rachaMax_kmh ?? "—"} km/h</span></div>
       <div class="kv"><span>Lluvia total</span><span>${summary.lluviaTotal_mm} mm</span></div>`
    ];

    let text = "Resumen\n" + JSON.stringify({ ...header, ...summary }, null, 2);
    if (errs.length) {
      text +=
        "\n\nErrores por día:\n" +
        errs
          .map((e) => `- ${e.date || "??"} · ${e.__error}`)
          .join("\n");
    }
    text +=
      "\n\nObservaciones\n" + JSON.stringify(observations, null, 2);

    setOutput(text, cards);
    saveState();
  } catch (e) {
    setOutput("Error: " + friendlyErr(e));
  }
});

btnHealth.addEventListener("click", async () => {
  try {
    setOutput("Consultando /api/health…");
    const url = `${getBase()}/api/health`;
    const json = await fetchJSON(url);
    setOutput(JSON.stringify(json, null, 2), [
      `<div><strong>/api/health</strong></div><div>OK</div>`,
    ]);
    saveState();
  } catch (e) {
    setOutput("Error: " + friendlyErr(e));
  }
});

btnClear.addEventListener("click", () => {
  cardsEl.innerHTML = "";
  outputEl.textContent = "Sin resultados aún…";
});

/* arranque */
loadState();
locked = true; // bloquear por defecto
stationEl.value ||= "IALFAR32";
applyLockState();

// eventos para persistir cambios
[baseEl, stationEl, fromEl, toEl].forEach((el) =>
  el.addEventListener("change", saveState)
);

