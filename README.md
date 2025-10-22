# Weather Underground Railway App (ESM)

Servidor Express listo para Railway (Node 20/22), usando `fetch` nativo y `ESM`.
Incluye el fix de `units` requerido por la API de weather.com.

## Rutas

- `GET /` — healthcheck
- `GET /api/wu/history?stationId=XXXX&date=YYYYMMDD`
- `GET /api/wu/current?stationId=XXXX`

## Variables de entorno

```
WU_API_KEY=TU_API_KEY
WU_UNITS=m
PORT=3001
```

## Despliegue en Railway

### Opción rápida (sin package-lock)
1. **Build → Install Command**: `npm install --omit=dev`
2. **Start Command**: `node server.js`
3. Variables: `WU_API_KEY`, `WU_UNITS`, `PORT`

> Esta opción evita el error de `npm ci` hasta que generes el `package-lock.json`.

### Opción reproducible (con package-lock)
1. En local:
   ```bash
   npm install
   ```
   Esto crea/actualiza `package-lock.json`.
2. Sube `package.json` + `package-lock.json` + `server.js`
3. En Railway vuelve a `npm ci` como Install Command si lo prefieres.

## Notas
- Node 20+ trae `fetch` nativo, no hace falta `node-fetch`.
- Este proyecto está en ESM ("type": "module").
