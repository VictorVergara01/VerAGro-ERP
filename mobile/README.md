# Veragro ERP — App móvil (técnicos)

App de campo en **Expo + React Native + TypeScript** que consume el mismo backend REST.

## Requisitos
- Node 20+ y la app **Expo Go** en tu teléfono (App Store / Play Store).
- El **backend corriendo** y accesible en la red local (`docker compose up`, escucha en
  `0.0.0.0:8000`).
- El teléfono y la computadora en la **misma red WiFi**.

## Correr
```bash
cd mobile
npm install
npm start          # abre Expo; escanea el QR con Expo Go (Android) o la cámara (iOS)
```
- La URL del backend se deriva automáticamente de la IP de tu máquina (la que usa Metro) en el
  puerto 8000. Si necesitas forzarla, crea `.env` con:
  ```
  EXPO_PUBLIC_API_URL=http://192.168.1.100:8000
  ```

## Usuarios de prueba
- Técnico: `tech@veragro.com` / `tech12345`
- Admin: `admin@veragro.com` / `admin12345`

## Qué incluye (Fundación, sub-proyecto 22)
- Login JWT (tokens en SecureStore) y rutas según sesión.
- **Mis órdenes**: lista las órdenes asignadas al técnico (filtro `?technician=me`), con
  "Ver todas" y pull-to-refresh. Logout.

## Generar el APK (producción)

Se usa **EAS Build** (nube de Expo, no necesita Android Studio). La config está en `eas.json` y
`app.json` (`android.package = com.veragro.erp`).

> **Antes de compilar:** define la URL del backend como variable de EAS (un APK NO deriva la IP del
> host como en desarrollo). Se guarda en los servidores de Expo, **no en git**:
> `eas env:create --name EXPO_PUBLIC_API_URL --value https://api.tudominio.com --environment preview --visibility plaintext`

```bash
npm install -g eas-cli
eas login                                  # cuenta Expo gratuita
eas build:configure                        # una sola vez (vincula projectId)
eas build --platform android --profile preview   # produce un APK instalable
```
Al terminar, EAS entrega un link de descarga del `.apk`. Para una versión nueva, sube
`expo.android.versionCode` en `app.json` y vuelve a compilar.

Guía detallada (incluye build local con Android Studio y publicación en Play Store) en
[`../docs/DEPLOY.md`](../docs/DEPLOY.md).

## Scripts
- `npm run typecheck` — `tsc --noEmit`.
- `npm run gen:api` — regenera `src/lib/api/schema.d.ts` desde el OpenAPI del backend.

## Stack
Expo SDK 56 · React Native 0.85 · React Navigation (native-stack) · TanStack Query ·
openapi-fetch + tipos generados del OpenAPI · expo-secure-store.

## Próximo
Detalle de orden + cambio de estado → Checklist → Piezas usadas → Búsqueda de inventario →
(fotos, requiere modelo de adjuntos en el backend).
