# Despliegue en producción — Veragro ERP

Guía para poner en producción los tres componentes: **backend** (API), **panel web** y **app móvil
(APK)**. Reemplaza los dominios de ejemplo (`api.veragro.com`, `app.veragro.com`) por los tuyos.

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
| `DJANGO_ALLOWED_HOSTS` | `api.veragro.com` |
| `CORS_ALLOWED_ORIGINS` | `https://app.veragro.com` |
| `DATABASE_*` | credenciales de PostgreSQL |

Opcionales de hardening (tienen default seguro): `DJANGO_SECURE_SSL_REDIRECT`,
`DJANGO_SECURE_HSTS_SECONDS`, `DJANGO_CSRF_TRUSTED_ORIGINS`.

> El `docker-compose.yml` del repo es de **desarrollo** (usa `runserver`). Para producción levanta el
> backend con su `Dockerfile` (Gunicorn) o un `docker-compose.prod.yml` propio.

### Pasos
```bash
# Construir e iniciar el backend (con las env de producción cargadas)
docker build -t veragro-backend ./backend
docker run -d --env-file .env.prod -p 8000:8000 veragro-backend

# Migraciones y archivos estáticos (admin/Swagger)
docker exec <contenedor> python manage.py migrate
docker exec <contenedor> python manage.py collectstatic --noinput

# Verificación de seguridad (debe salir sin warnings críticos)
docker exec <contenedor> python manage.py check --deploy
```

### Nginx — bloque del backend
```nginx
location /api/   { proxy_pass http://127.0.0.1:8000; include proxy_params; }
location /admin/ { proxy_pass http://127.0.0.1:8000; include proxy_params; }

# Archivos subidos (fotos de órdenes, logo de empresa) y estáticos del admin.
location /media/  { alias /ruta/al/backend/media/; }
location /static/ { alias /ruta/al/backend/staticfiles/; }
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
VITE_API_URL=https://api.veragro.com npm run build   # genera dist/
#   PowerShell:  $env:VITE_API_URL="https://api.veragro.com"; npm run build
```
Copia el contenido de `dist/` al servidor (p. ej. `/var/www/veragro-web/`).

### Nginx — bloque del web
```nginx
server {
    listen 443 ssl;
    server_name app.veragro.com;
    # ... certificados TLS ...

    root /var/www/veragro-web;
    index index.html;

    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location /        { try_files $uri $uri/ /index.html; }   # fallback SPA
}
```
El `try_files ... /index.html` es **imprescindible** para que React Router resuelva rutas profundas
(p. ej. recargar `/customers/5` no debe dar 404).

### Alternativa dockerizada
Si prefieres un contenedor en vez de servir desde tu Nginx, hay un `frontend/Dockerfile.prod`
(multi-stage build + `nginx:alpine`, ya incluye `frontend/nginx.conf`):
```bash
cd frontend
docker build -f Dockerfile.prod --build-arg VITE_API_URL=https://api.veragro.com -t veragro-web .
docker run -d -p 8080:80 veragro-web
```

---

## 3. App móvil — generar el APK (recomendado: EAS Build)

**EAS Build** compila el APK en la nube de Expo; **no requiere Android Studio** (ideal en Windows).
La configuración está en `mobile/eas.json` y `mobile/app.json` (`android.package = com.veragro.erp`).

> **Importante:** un APK de producción NO deriva la IP del backend del host de Metro (eso es solo en
> desarrollo). La URL se inyecta vía `EXPO_PUBLIC_API_URL` en el perfil de build de `eas.json`.
> **Edita `mobile/eas.json` y pon tu dominio real** (`https://api.veragro.com`) en el perfil `preview`
> antes de compilar.

### Una sola vez
```bash
npm install -g eas-cli
eas login                      # cuenta Expo (gratuita)
cd mobile
eas build:configure           # vincula el proyecto (crea/usa el projectId)
```

### Generar el APK
```bash
cd mobile
eas build --platform android --profile preview
```
- El perfil `preview` produce un **APK** instalable (sideload), no un AAB de Play Store.
- Al terminar, EAS da una **URL de descarga** del `.apk`. Descárgalo e instálalo en el teléfono
  (activar "instalar apps de orígenes desconocidos").
- Para subir a otro dispositivo, comparte ese mismo link o el archivo.

### Subir una versión nueva
Incrementa `expo.android.versionCode` (y opcionalmente `expo.version`) en `mobile/app.json` y vuelve a
correr el build.

### Play Store (opcional, más adelante)
El perfil `production` de `eas.json` produce un **AAB** (`app-bundle`) para la Play Store. El envío se
hace con `eas submit -p android --profile production` (requiere cuenta de Google Play Console).

### Build local (alternativa, requiere Android Studio)
Si no quieres usar la nube:
```bash
cd mobile
npx expo prebuild --platform android        # genera la carpeta android/ nativa
cd android && ./gradlew assembleRelease     # APK en android/app/build/outputs/apk/release/
```
Requiere el SDK de Android y firmar el APK. EAS Build evita todo esto.

---

## Checklist de go-live

- [ ] Backend: `.env.prod` con `DJANGO_SECRET_KEY` aleatorio, hosts y CORS reales.
- [ ] `python manage.py migrate` y `collectstatic` ejecutados.
- [ ] `python manage.py check --deploy` sin warnings críticos.
- [ ] Superusuario creado (`createsuperuser` → rol `super_admin`).
- [ ] Nginx con TLS, reverse proxy a `/api/` y `/admin/`, sirviendo `/media/`, `/static/` y el `dist/` del web.
- [ ] Web compilado con `VITE_API_URL` apuntando al dominio del backend.
- [ ] `mobile/eas.json` con `EXPO_PUBLIC_API_URL` = dominio real del backend.
- [ ] APK generado con `eas build` y probado en un teléfono real contra el backend de producción.
