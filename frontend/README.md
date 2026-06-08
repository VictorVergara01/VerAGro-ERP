# Veragro ERP — Panel web

Panel de administración en **React 19 + Vite + TypeScript + Mantine 9**, consume la API REST del
backend. Cliente tipado generado del OpenAPI (openapi-fetch), datos con TanStack Query, rutas con
React Router v7.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest
npm run typecheck    # tsc --noEmit
npm run gen:api      # regenera src/lib/api/schema.d.ts desde el OpenAPI del backend
```

Variable de entorno (ver `.env.example`):

```
VITE_API_URL=http://localhost:8000    # origen del backend (las rutas del OpenAPI ya incluyen /api)
```

> El backend debe estar corriendo para `gen:api` y para usar el panel. Desde la raíz del repo:
> `docker compose up -d`.

## Producción

`npm run build` genera `dist/` (estático). **`VITE_API_URL` se hornea en el bundle en tiempo de build**,
así que se define antes de compilar:

```bash
VITE_API_URL=https://api.veragro.com npm run build
```

Servir el `dist/` desde Nginx (con fallback de SPA a `index.html`) o usar el contenedor
`Dockerfile.prod` (multi-stage build + nginx, incluye `nginx.conf`). Guía completa en
[`../docs/DEPLOY.md`](../docs/DEPLOY.md).

## Estructura

```
src/
  app/                  # App.tsx (providers)
  routes/               # AppRoutes, ProtectedRoute
  components/{layout,ui}# AppShell, Sidebar, Topbar; DataTable, PageHeader, DetailHeader, Field…
  features/<modulo>/     # types.ts, api.ts (hooks), <X>Page.tsx, modales, <X>DetailPage.tsx
  lib/api/              # client.ts (JWT + refresh), schema.d.ts (GENERADO), queryClient
  lib/auth/, utils/, theme.ts
```

Stack visual: identidad Veragro, modo claro/oscuro, gráficas (`@mantine/charts`) y command palette
(`@mantine/spotlight`, Ctrl/⌘+K).
