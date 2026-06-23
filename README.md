# Frontend (Vue 3 + Vite + Pinia + PrimeVue)

## Stack

- **Vue 3** + **TypeScript** + **Vite**
- **Pinia** (estado)
- **Vue Router**
- **PrimeVue 4** con tema **Aura** (modo oscuro vía clase `.app-dark`)
- **PrimeIcons**
- **Axios** (API)

## Desarrollo

```bash
cd front
npm install
npm run dev
```

Abre http://localhost:5173 — el API debe estar en http://127.0.0.1:8000 (CORS en Django).

## Variables

- `.env.development`: `VITE_API_BASE_URL` (por defecto `http://127.0.0.1:8000/api/v1`)

## Login

Usuario/contraseña de **Django** (`createsuperuser`). Para roles, el **email** debe coincidir con `usuarios.correo` en MySQL.

## Build

```bash
npm run build
```

Salida en `dist/`.

## PrimeVue

Documentación: https://primevue.org/
