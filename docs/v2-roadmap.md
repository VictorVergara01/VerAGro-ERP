# ERP-VERAGRO — Roadmap v2

> Estado base: v1 completo y operacional en rama `dev/v2` (junio 2026).
> Todos los módulos backend y frontend web están funcionando. La v2 se enfoca en especialización del dominio de fumigación con drones, notificaciones y mejoras UX para técnicos en campo.

---

## Alta prioridad

### 1. Módulo de Fumigación
El negocio central (drones de fumigación) no tiene modelos propios — todo vive como "Orden de servicio genérica". Hay que crear un módulo `backend/apps/fumigation/` con:

- **`FumigationService`** — operación: área tratada, cultivo, producto químico, dosis aplicada
- **`SprayZone`** — polígono GPS del área fumigada
- **`DroneLog`** — registro de vuelo: duración, hectáreas, batería consumida

Requiere frontend web + móvil.

### 2. Notificaciones Push
No existe ningún sistema de notificaciones. Casos de uso principales:
- Orden de servicio completada
- Stock de producto bajo mínimo
- Cotización aprobada por el cliente

Stack recomendado: **Expo Push Notifications** (ya en el stack móvil) con cola de envío en el backend.
Alternativa más compleja: Django Channels (WebSockets) para tiempo real.

### 3. Perfil de usuario en móvil
La app móvil no tiene pantalla de perfil ni cambio de contraseña. El técnico no puede gestionar su cuenta desde el celular.

---

## Prioridad media

### 4. PDFs personalizables
Factura y cotización ya generan PDF con ReportLab, pero sin logo, colores de empresa ni términos configurables.
- Crear modelo `CompanyProfile` con logo, datos fiscales y pie de página
- Integrar en los templates PDF del módulo `billing`

### 5. Dashboard con tendencias históricas
El dashboard actual muestra métricas del momento. Agregar gráficas de:
- Ventas por mes (últimos 30/90 días)
- Órdenes de servicio por semana
- Consumo de inventario en el tiempo

### 6. App móvil más completa para técnicos en campo
Actualmente el técnico necesita la web para varias tareas. Agregar a móvil:
- Tomar fotos directamente desde la app (el modelo `ServiceOrderPhoto` ya existe en backend)
- Completar checklists desde el celular
- Registrar piezas usadas en campo

---

## Nice-to-have

### 7. Auditoría granular
Historial de cambios por campo: quién modificó qué y cuándo.
Librería sugerida: `django-simple-history`.

### 8. Integración WhatsApp Business
Enviar cotizaciones y facturas directamente por WhatsApp.
Requiere cuenta WhatsApp Business + Twilio o Meta Cloud API.

### 9. Modo offline en móvil
El técnico trabaja sin internet y sincroniza al reconectarse.
Requiere SQLite local via Expo + estrategia de resolución de conflictos.

---

## Fixes aplicados antes de iniciar v2 formal (en `dev/v2`)

| Commit | Descripción |
|--------|-------------|
| `75601f3` | `fix(purchasing)` — productos existentes no aparecían en el selector de compras. Solucionado con `StandardPagination` (page\_size configurable) + `pageSize: 10000` en los modales de compras |
| `05b4c6a` | `feat(inventory)` — eliminación masiva de productos y campo descripción en categorías |
