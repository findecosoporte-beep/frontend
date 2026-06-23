# Despliegue del frontend en Railway

Guía para publicar la SPA Vue/Vite en [Railway](https://railway.com/) dentro del mismo proyecto que la API Django.

## Requisitos previos

- Repositorio conectado a Railway: `findecosoporte-beep/frontend`
- Servicio **API** ya desplegado con dominio público (`/api/v1/health/` responde `{"status":"ok"}`)
- MySQL y variables del backend configuradas (ver `Api1/docs/RAILWAY.md`)

## 1. Crear el servicio frontend

1. En tu proyecto Railway → **+ New** → **GitHub Repo**
2. Selecciona el repositorio `findecosoporte-beep/frontend`
3. Railway detectará `railway.toml`, `nixpacks.toml` y `package.json` en la raíz del repo

## 2. Variable de build (obligatoria)

`VITE_API_BASE_URL` debe existir **antes del build** porque Vite la embebe en el bundle.

En el servicio **front** → **Variables**:

| Variable | Valor recomendado |
|----------|-------------------|
| `VITE_API_BASE_URL` | `https://${{NOMBRE_SERVICIO_API.RAILWAY_PUBLIC_DOMAIN}}/api/v1` |

Sustituye `NOMBRE_SERVICIO_API` por el nombre del servicio web de Django en tu canvas (ej. `backendfindeco2`).

Alternativa con URL fija:

```env
VITE_API_BASE_URL=https://backendfindeco2-production.up.railway.app/api/v1
```

> Si cambias la URL del API después del primer deploy, **vuelve a desplegar el front** para regenerar el build.

## 3. CORS en la API

En el servicio **API** → **Variables**, añade o actualiza:

```env
CORS_ALLOWED_ORIGINS=https://TU-FRONT.up.railway.app
```

Usa la URL que obtengas en el paso 4. Varias URLs van separadas por coma.

## 4. Dominio público del frontend

1. Servicio **front** → **Settings** → **Networking**
2. **Generate Domain** (ej. `findeco-web-production.up.railway.app`)
3. Abre la URL en el navegador; debe cargar el login de FINDECO

## 5. Qué hace el deploy

| Fase | Comando | Resultado |
|------|---------|-----------|
| Build | `bash scripts/build.sh` | `npm ci` + `vite build` → carpeta `dist/` |
| Start | `bash scripts/start.sh` | `serve -s dist` en el puerto `PORT` de Railway |

El flag `-s` de `serve` redirige rutas desconocidas a `index.html` (necesario para Vue Router en modo history).

## 6. Estructura del proyecto en Railway

```
Proyecto Railway
├── MySQL          (base de datos)
├── backendfindeco2 (Root: Api1)   → API Django
└── findeco-web     (repo: frontend)  → SPA Vue
```

## Resolución de problemas

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| Login falla / red a `127.0.0.1` | `VITE_API_BASE_URL` no definida en build | Añade la variable y redeploy |
| Error CORS en navegador | API sin el dominio del front | Actualiza `CORS_ALLOWED_ORIGINS` en la API |
| 404 al recargar una ruta (`/clientes`) | Servidor sin fallback SPA | Verifica que `scripts/start.sh` use `serve -s` |
| Build falla en Node | Versión antigua | `nixpacks.toml` fija Node 22 |
| `EBUSY ... node_modules/.cache` | Conflicto caché Nixpacks + npm | Ya corregido en `scripts/build.sh` (`NPM_CONFIG_CACHE=/tmp/npm-cache`) |
| Pantalla en blanco | Build con API URL incorrecta | Revisa logs de build y variable `VITE_API_BASE_URL` |

## Desarrollo local

```bash
cd front
cp .env.example .env.local
npm install
npm run dev
```

Para probar el build de producción localmente:

```bash
npm run build
npm run start
```
