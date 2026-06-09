# Descargas servidas por el web

Coloca aquí el APK de la app de campo con el nombre **`veragro.apk`**:

```
frontend/public/downloads/veragro.apk
```

Vite copia el contenido de `public/` a la raíz del build, así que el archivo queda disponible en
`https://tu-dominio/downloads/veragro.apk`. El botón **"Descargar APK"** del sidebar apunta ahí por
defecto.

## Cómo obtener el APK

1. Genera el APK con EAS Build:
   ```bash
   cd mobile
   eas build -p android --profile preview
   ```
2. Descarga el `.apk` del link que da EAS.
3. Cópialo aquí como `veragro.apk` **antes** de compilar el web (`npm run build`), o colócalo en la
   carpeta `downloads/` del web ya desplegado.

> El `.apk` **no** se versiona en git (es grande y cambia en cada release). Por eso este directorio
> solo contiene este README.

Para usar otra URL (p. ej. el link directo de EAS) define `VITE_APK_URL` en el `.env` del frontend.
