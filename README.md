# WU Railway App (HTML + JS + Node Proxy)

Frontend estático + proxy Node/Express para consumir la API oficial de Weather Underground (api.weather.com) y mostrar observaciones históricas de una estación PWS.

## Variables de entorno

Copia `.env.example` a `.env` y rellena:

```
WU_API_KEY=tu_api_key_de_weather_com
```

> **Railway**: No subas `.env`. En el panel del proyecto añade una variable `WU_API_KEY` con tu clave.

## Ejecutar en local

```bash
npm i
# crea .env con tu WU_API_KEY
npm run dev
# abre http://localhost:3000
```

## Despliegue en Railway

1. Sube este proyecto a un repo de GitHub.
2. En Railway crea un nuevo servicio desde ese repo.
3. En **Variables**, añade `WU_API_KEY` con tu clave.
4. No hace falta definir puerto: Railway inyecta `PORT` y Express lo usa.

## Endpoint interno

`GET /api/wu/history?stationId=IALFAR32&date=YYYYMMDD`

- `stationId`: ID de estación PWS (ej. IALFAR32)
- `date`: fecha en formato `YYYYMMDD` (p.ej. `20250919`)

Proxy hacia: `https://api.weather.com/v2/pws/history/all` con `units=m&format=json&apiKey=...`

## Estructura

```
/public       # frontend estático
  index.html
  app.js
server.js     # proxy + estáticos
package.json
.env.example
```

## Notas

- Si antes usabas `19/09/2025`, cambia a `2025-09-19` en el selector y el código convertirá a `20250919` automáticamente.
- La UI calcula mínimos/máximos con los campos disponibles (`metric.tempLow/tempHigh/tempAvg`). Tolerante a variaciones del JSON de Weather.com.

## Persistencia en SQLite + export para Rails

Este fork añade una base de datos **SQLite** (`data/wu.db`) para guardar todas las observaciones que se consulten al endpoint `/api/hist`. Así podrás exportarlas después e importarlas en un proyecto **Ruby on Rails**.

### Cómo usar

1. Instala dependencias:
   ```bash
   npm install
   ```

2. Arranca en local:
   ```bash
   npm run dev
   ```

3. Llama a tu endpoint histórico como siempre (ejemplo):
   ```bash
   curl "http://localhost:3000/api/hist?station=YOUR_STATION&date=20250101"
   ```
   Cada llamada guardará las observaciones en `data/wu.db` (se ignoran duplicados por `station+epoch`).

4. Comprueba estadísticas:
   ```bash
   curl "http://localhost:3000/api/db/stats?station=YOUR_STATION"
   ```

5. Exporta a **JSON** o **CSV** (ideal para Rails: `rails db:seed` o `ActiveRecord::Import`):
   ```bash
   curl "http://localhost:3000/api/db/export.json?station=YOUR_STATION&from=1735689600&to=1738368000"
   curl "http://localhost:3000/api/db/export.csv?station=YOUR_STATION&from=1735689600&to=1738368000" -o export.csv
   ```

### Importar en Rails (idea rápida)

En Rails puedes crear un modelo `Observation` (o el nombre que prefieras) con las columnas del CSV. Luego:

```ruby
require 'csv'

CSV.foreach('export.csv', headers: true) do |row|
  Observation.create!(
    station:        row['station'],
    epoch:          row['epoch'],
    observed_at:    Time.at(row['epoch'].to_i).utc,
    temp_c:         row['tempC'],
    dewpoint_c:     row['dewpointC'],
    humidity:       row['humidity'],
    pressure_hpa:   row['pressureHpa'],
    wind_kph:       row['windKph'],
    wind_gust_kph:  row['windGustKph'],
    wind_dir:       row['windDir'],
    precip_rate_mm: row['precipRateMm'],
    precip_total_mm:row['precipTotalMm'],
    solar_wm2:      row['solarWm2'],
    uv:             row['uv']
  )
end
```

> Si prefieres **PostgreSQL** desde ya (Railway/Render), dímelo y te dejo el mismo módulo usando `pg` en vez de SQLite.
