# Despliegue en producción — Veragro ERP

Guía para poner en producción los dos componentes: **backend** (API) y **panel web**. Reemplaza los dominios de ejemplo (`api.tudominio.com`, `erp.tudominio.com`) por los tuyos.

Arquitectura asumida: un **Nginx** (en Proxmox) que termina TLS y hace de reverse proxy. Detrás:
el backend (Gunicorn) y los archivos estáticos del panel web.

```
Internet ──HTTPS──▶ Nginx (Proxmox, TLS)
                      ├── /api/, /admin/, /media/, /static/ ──▶ backend (Gunicorn :8000)
                      └── /  (resto)                         ──▶ dist/ del panel web (estático)
```

---

## 1. Backend (API)

El backend corre con **Gunicorn** (ya configurado en `backend/Dockerfile`) usando
`config.settings.production`, que **exige** estas variables de entorno (sin defaults; si faltan, la app
no arranca):

| Variable | Ejemplo |
|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.production` |
| `DJANGO_SECRET_KEY` | una clave larga y aleatoria |
| `DJANGO_ALLOWED_HOSTS` | `api.tudominio.com` |
| `CORS_ALLOWED_ORIGINS` | `https://erp.tudominio.com` |
| `DATABASE_*` | credenciales de PostgreSQL |

Opcionales de hardening (tienen default seguro): `DJANGO_SECURE_SSL_REDIRECT`,
`DJANGO_SECURE_HSTS_SECONDS`, `DJANGO_CSRF_TRUSTED_ORIGINS`.

> El `docker-compose.yml` del repo es de **desarrollo** (usa `runserver`). Para producción usa
> **`docker-compose.prod.yml`** (Postgres + backend con Gunicorn), que lee las variables de
> `.env.prod` (copia la plantilla [`.env.prod.example`](../.env.prod.example) y rellénala).

> **Estáticos:** el backend usa **WhiteNoise**, así que sirve sus propios estáticos (admin, Swagger)
> sin necesidad de configurar `/static/` en Nginx — solo hay que correr `collectstatic`.

### Pasos
```bash
# 1. Preparar variables de producción
cp .env.prod.example .env.prod      # y editar con valores reales

# 2. Construir e iniciar Postgres + backend (Gunicorn)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 3. Migraciones, estáticos y superusuario
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py migrate
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py collectstatic --noinput
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py createsuperuser

# 4. Verificación de seguridad (debe salir sin warnings críticos)
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py check --deploy
```
El backend queda escuchando en `127.0.0.1:8000` (solo localhost); lo expones con el Nginx del host.

### Nginx — bloque del backend
```nginx
location /api/   { proxy_pass http://127.0.0.1:8000; include proxy_params; }
location /admin/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }

# Archivos subidos (fotos de órdenes, logo de empresa). Bind mount del compose: ./backend/media
location /media/  { alias /ruta/al/repo/backend/media/; }

# /static/ es OPCIONAL: WhiteNoise ya los sirve vía el backend. Solo añádelo si quieres
# que Nginx los sirva directo (un poco más rápido):
# location /static/ { alias /ruta/al/repo/backend/static/; }
```
`proxy_params` debe pasar `X-Forwarded-Proto $scheme` (production.py lo usa para detectar HTTPS).

---

## 2. Panel web (recomendado: build estático tras tu Nginx)

El panel es una SPA de Vite: se compila a archivos estáticos en `dist/` y los sirve Nginx. **La URL del
backend se hornea en tiempo de build** (Vite reemplaza `VITE_API_URL` en el bundle), así que se define
ANTES de compilar.

### Pasos
```bash
cd frontend
npm ci
VITE_API_URL=https://api.tudominio.com npm run build   # genera dist/
#   PowerShell:  $env:VITE_API_URL="https://api.tudominio.com"; npm run build
```
Copia el contenido de `dist/` al servidor (p. ej. `/var/www/veragro-web/`).

### Nginx — bloque del web
```nginx
server {
    listen 443 ssl;
    server_name erp.tudominio.com;
    # ... certificados TLS ...

    root /var/www/veragro-web;
    index index.html;

    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location = /index.html { add_header Cache-Control "no-cache"; }   # que no se quede la versión vieja
    location /        { try_files $uri $uri/ /index.html; }   # fallback SPA
}
```
El `try_files ... /index.html` es **imprescindible** para que React Router resuelva rutas profundas
(p. ej. recargar `/customers/5` no debe dar 404).

Este bloque es mínimo: **no trae las cabeceras de seguridad** (CSP, `X-Frame-Options`, etc.). Cópialas
de `frontend/nginx/security-headers.inc.template`, cambiando `${API_ORIGIN}` por el dominio del backend,
e inclúyelas en cada `location` que tenga su propio `add_header` (Nginx no las hereda en ese caso).

### Alternativa dockerizada
Si prefieres un contenedor en vez de servir desde tu Nginx, hay un `frontend/Dockerfile.prod`
(multi-stage build + `nginx:alpine`). Usa las plantillas de `frontend/nginx/` —caché, compresión y
cabeceras de seguridad—; la CSP toma el origen del backend de `VITE_API_URL`:
```bash
cd frontend
docker build -f Dockerfile.prod --build-arg VITE_API_URL=https://api.tudominio.com -t veragro-web .
docker run -d -p 8080:80 veragro-web
```

---

## Checklist de go-live

- [ ] Backend: `.env.prod` con `DJANGO_SECRET_KEY` aleatorio, hosts y CORS reales.
- [ ] `python manage.py migrate` y `collectstatic` ejecutados.
- [ ] `python manage.py check --deploy` sin warnings críticos.
- [ ] Superusuario creado (`createsuperuser` → rol `super_admin`).
- [ ] Nginx con TLS, reverse proxy a `/api/` y `/admin/`, sirviendo `/media/`, `/static/` y el `dist/` del web.
- [ ] Web compilado con `VITE_API_URL` apuntando al dominio del backend.
