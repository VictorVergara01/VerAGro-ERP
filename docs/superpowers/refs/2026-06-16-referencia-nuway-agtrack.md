# Referencia: nuWay AgTrack — Análisis para mejorar VerAgro ERP

**Fecha de investigación:** 2026-06-16
**Fuente:** App Store (id6748161334) · agtrack.io · nuwayag.com · GitHub kennethkeim
**Propósito:** Extraer ideas, patrones de UX y funcionalidades de nuWay AgTrack que puedan
incorporarse o informar el desarrollo del módulo de Trabajos de Campo y la app móvil de VerAgro.

---

## 1. Qué es nuWay AgTrack

App iOS gratuita lanzada el **26 de mayo de 2026** por **HLE Drones LLC** (nuWay Ag),
desarrollada por Kenneth Keim. Está dirigida a **operadores de drones agrícolas** en EE.UU.
que necesitan gestionar su negocio de aspersión desde el campo, sin pasar por una computadora.

**App Store:** `https://apps.apple.com/us/app/nuway-agtrack/id6748161334`
**Versión actual:** 1.1.7 (actualizada ~2026-06-16; ciclo muy activo: 5 versiones en 3 semanas)
**Tamaño:** 60.3 MB · **Plataforma:** iOS 16.4+ (también funciona en macOS M1 y Apple Vision)
**Precio:** Gratuita ahora; la v1.1.3 añadió aviso de próximos planes de suscripción.
**Calificación:** 5.0 ⭐ (1 reseña) — demasiado temprano para ser concluyente.

> "Designed for Ag drone operators. Run your spray business from the field.
> Stop juggling spreadsheets, paper logs, and a calculator app."

---

## 2. Módulos y funcionalidades

### 2.1 Calculadora de Mezclas de Aspersión (Spray Mix Calculator)
- El usuario ingresa: acres a tratar, tasa de aplicación, y los pesticidas/productos.
- La app calcula automáticamente cuánto de cada producto va en el tanque.
- Resultado: mezcla exacta en segundos, sin errores manuales.

**Relevancia para VerAgro:** Actualmente el campo `applied_product` en `FieldJob` es texto
libre. Una calculadora de mezclas agregaría valor real al técnico en campo.

### 2.2 Planeación de Trabajos (Job Planning)
- Se mapean los campos/lotes en un mapa.
- Se asignan trabajos a miembros del equipo (crew assignment).
- Todos en el equipo ven el mismo plan actualizado.
- Flujo de estados implícito: programado → en progreso → completado.

**Relevancia para VerAgro:** El módulo `field_jobs` tiene el flujo básico
`scheduled → done → invoiced`. Falta la **asignación por lotes** (varios técnicos a un mismo
trabajo) y la **vista de mapa del campo/lote**.

### 2.3 Reportes FAA (Part 137)
- Generación automática de reportes mensuales para la FAA.
- Específico de EE.UU. (certificación de aplicación aérea comercial).

**Relevancia para VerAgro:** No aplica directamente (Panamá tiene MIDA como ente regulador,
no la FAA). Sin embargo, el concepto de **reporte regulatorio automático** es valioso: en
Panamá los aplicadores de agroquímicos deben llevar registros para el MIDA. Ver sección 5.

### 2.4 Reportes de Pesticidas (Pesticide Reporting)
Captura por aplicación:
- Producto aplicado (nombre comercial / ingrediente activo)
- Tasa de aplicación (dosis por área)
- Ubicación GPS del campo
- Identificación del aplicador y su licencia
- Condiciones climáticas (viento, temperatura, humedad)
- Equipo/dron usado
- Exportación al formato que exige cada estado de EE.UU.

**Relevancia para VerAgro:** Es la funcionalidad más transferible. VerAgro hoy solo guarda
`applied_product` como texto libre. Ver sección 5 para el gap analysis.

### 2.5 Almacenamiento de Licencias y Certificados
- Guarda licencias de aplicador, certificaciones de la FAA, seguros, etc.
- Siempre disponibles desde el teléfono.

**Relevancia para VerAgro:** No existe en el ERP. Podría añadirse como campos opcionales al
perfil del técnico/operador.

### 2.6 Catálogo de Equipos
- Lista de drones aprobados por la FAA para aplicación aérea.
- Incluye aviones, helicópteros y equipos terrestres autopropulsados.

**Relevancia para VerAgro:** El módulo `equipment` ya existe. La diferencia está en tener
una lista curada de modelos reconocidos (seed data) y vincularla a trabajos de campo.
El proyecto ya tiene `0002_seed_dji_agras_t50.py` — esto va en la dirección correcta.

---

## 3. Patrones de UX observados (versión 1.1.7)

### 3.1 Entrada de spray log con slider
- v1.1.7 introdujo un "slider-based spray log entry" — la cantidad (acres, tasa) se
  introduce con un slider en vez de teclado. Reduce errores en campo con guantes.

**Idea para VerAgro móvil:** Los campos numéricos de `hectares`/`quintals` en el modal de
trabajos de campo podrían usar sliders o steppers en vez de inputs de texto.

### 3.2 Etiquetas de formulario requerido vs. opcional
- v1.1.7 añadió "Clearer form labels showing required vs optional fields".
- Diferenciación visual clara en los formularios.

**Idea para VerAgro:** En el `ServiceOrderFormModal` y `FieldJobFormModal` actuales, no hay
distinción visual clara de campos obligatorios. Vale la pena revisar.

### 3.3 Videos tutoriales in-app
- v1.1.7 añadió tutoriales en video dentro de la app.
- Onboarding embebido para usuarios nuevos.

**Idea para VerAgro:** A mediano plazo, tooltips/guías de primera vez (guided tour) en
la web y en el móvil.

### 3.4 Menú de creación rápida (Quick Create)
- v1.1.4 rediseñó el menú de creación rápida.
- v1.1.4 también permite crear campos (lotes) directamente desde la página del cliente.

**Idea para VerAgro:** El FAB (Floating Action Button) del móvil podría expandirse en
menú de acciones rápidas como en nuWay AgTrack.

### 3.5 Ordenamiento de jobs
- v1.1.4: "Jobs are now sorted by due date, then created date."
- Priorización por fecha de vencimiento, no por fecha de creación.

**Idea para VerAgro:** La lista `MyOrdersScreen` en móvil y `ServiceOrdersPage` en web
podrían ordenar por `scheduled_date` primero (lo más próximo arriba).

---

## 4. Stack técnico inferido

El repositorio no es público, pero de la descripción y el comportamiento de la app se puede inferir:

| Componente | Tecnología probable |
|---|---|
| Frontend móvil | Swift / SwiftUI (iOS nativo) |
| Backend | Supabase o Firebase (sync mencionado en notas de versión) |
| PDF/Export | Generación del lado del servidor o PDFKit iOS |
| Sincronización | Referenciada en v1.1.2 ("data syncing improvements") |
| Autenticación | Basada en cuenta (el perfil vive en la nube) |

**VerAgro ya tiene:** Django REST + Expo React Native + sincronización vía API REST.
La arquitectura de nuWay es probablemente más ligera (serverless) por ser una startup pequeña.

---

## 5. Gap Analysis: VerAgro vs nuWay AgTrack

### 5.1 Gaps críticos para el negocio de campo

| Funcionalidad | nuWay AgTrack | VerAgro hoy | Prioridad |
|---|---|---|---|
| Registro detallado de aplicación (producto, dosis, clima, GPS) | ✅ Completo | ⚠️ Solo texto libre | Alta |
| Calculadora de mezclas en tanque | ✅ | ❌ No existe | Media |
| Condiciones climáticas al momento de la aplicación | ✅ | ❌ No existe | Media |
| Captura de ubicación GPS del lote | ✅ | ❌ Solo texto | Baja–Media |
| Asignación multi-técnico por trabajo | ✅ | ⚠️ Solo 1 técnico | Baja |
| Almacenamiento de licencias del aplicador | ✅ | ❌ No existe | Baja |
| Reporte regulatorio exportable (MIDA Panamá) | ✅ (FAA/estatal) | ❌ No existe | Alta (futuro) |
| Catálogo curado de equipos agrícolas | ✅ | ⚠️ Existe pero genérico | Baja |
| Ordenamiento por fecha de trabajo | ✅ | ⚠️ Por fecha creación | Fácil de hacer |
| Slider en campos numéricos (móvil) | ✅ | ❌ Inputs de texto | Media |
| Video tutoriales in-app | ✅ | ❌ | Baja |

### 5.2 Registro detallado de aplicación — propuesta de mejora

El gap más relevante es el registro por aplicación. Hoy `FieldJob` tiene:
```python
applied_product = models.CharField(max_length=255, blank=True)  # solo texto
```

Propuesta: añadir campos opcionales al modelo `FieldJob` para acercarse al estándar de nuWay:

```python
# Producto aplicado (ampliado)
applied_product_name = models.CharField(max_length=255, blank=True)   # texto libre
application_rate = models.DecimalField(..., null=True, blank=True)     # dosis (L/ha, cc/ha, etc.)
application_rate_unit = models.CharField(max_length=20, blank=True)   # "L/ha", "cc/ha", "kg/ha"
tank_volume_liters = models.DecimalField(..., null=True, blank=True)  # litros en tanque

# Condiciones climáticas
wind_speed_kmh = models.DecimalField(..., null=True, blank=True)
temperature_celsius = models.DecimalField(..., null=True, blank=True)
humidity_percentage = models.DecimalField(..., null=True, blank=True)
weather_notes = models.CharField(max_length=255, blank=True)

# Ubicación GPS (opcional, para exportar al MIDA)
latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
```

**Importante:** Todos estos campos deben ser `blank=True, null=True` — no romper el flujo
actual. Se usan solo cuando el técnico los quiere registrar (para trazabilidad o cumplimiento).

### 5.3 Calculadora de mezclas — propuesta

Endpoint utilitario (no guarda datos):
```
POST /api/field-jobs/calculate-mix/
{
  "hectares": 12.5,
  "application_rate": 1.5,      # L/ha
  "tank_volume_liters": 30,
  "products": [
    { "name": "Glifosato 48%", "dose_ml_per_liter": 8 },
    { "name": "Coadyuvante", "dose_ml_per_liter": 2 }
  ]
}
→ { "fills_needed": 1, "per_fill": [...] }
```

En móvil: pantalla/modal dedicado con sliders para hectáreas y tasa, resultado instantáneo.

### 5.4 Reporte MIDA Panamá — propuesta futura

El Ministerio de Desarrollo Agropecuario (MIDA) de Panamá exige registro de aplicaciones de
plaguicidas. El formato exacto depende del tipo de licencia del operador, pero típicamente incluye:

- Fecha y hora
- Nombre del producto y número de registro MIDA
- Dosis aplicada
- Cultivo y área
- Operador y número de carnet
- Condiciones climáticas
- Lote/parcela

Este reporte es el equivalente panameño al "Pesticide Reporting" de nuWay AgTrack. Se puede
implementar como un PDF exportable desde `/api/field-jobs/?export=mida_report&from=&to=`.

---

## 6. Notas sobre el ciclo de desarrollo de nuWay AgTrack

El equipo (Kenneth Keim + colaboradores) lanzó la v1.0 el 26/05/2026 y en menos de 3 semanas
publicó 5 versiones. Este ritmo es inspirador y valida el enfoque "ship fast, iterate".

**Lecciones:**
- Las funciones más usadas se pulieron primero (calculadora, log de spray).
- Los reportes regulatorios llegaron en v1.1 (segunda iteración, no el MVP).
- La UI/UX se refina iterativamente (sliders, etiquetas, menú rápido) basado en feedback real.
- Los bug fixes de sincronización aparecen en múltiples versiones — el sync offline/online
  es un problema difícil que VerAgro también debe considerar.

---

## 7. Acciones recomendadas para VerAgro

En orden de impacto y esfuerzo:

### Inmediatas (poco esfuerzo, alto valor)

- [ ] **Ordenar trabajos de campo por `scheduled_date` desc** en `MyOrdersScreen` y
  `FieldJobsPage` (1 línea de código en el serializer/query).
- [ ] **Distinguir visualmente campos requeridos vs. opcionales** en formularios móvil y web.
- [ ] **Añadir `application_rate` y `application_rate_unit`** al modelo `FieldJob` como
  campos opcionales (nueva migración, fácil de hacer).

### Corto plazo (sprint o dos)

- [ ] **Registro de condiciones climáticas** (`wind_speed_kmh`, `temperature_celsius`,
  `humidity_percentage`) — opcional en el formulario, visible en el detalle del trabajo.
- [ ] **Captura de coordenadas GPS** del lote (en móvil, botón "Usar mi ubicación actual"
  que llena `latitude`/`longitude` con `expo-location`).
- [ ] **Slider/stepper para `hectares` y `quintals`** en `FieldJobFormModal` del móvil.

### Mediano plazo

- [ ] **Calculadora de mezclas de aspersión** — pantalla/modal en móvil.
  Endpoint utilitario en el backend (sin persistencia).
- [ ] **Almacenamiento de licencias del técnico** — campos adicionales en el modelo `User`
  o tabla separada `ApplicatorLicense`.

### Largo plazo

- [ ] **Reporte exportable para el MIDA Panamá** — PDF o Excel con todos los campos
  requeridos por la normativa panameña de aplicación de plaguicidas.
- [ ] **Vista de mapa para lotes** — polígono o punto GPS visualizado en pantalla.

---

## 8. Comparación de modelos de negocio

| Aspecto | nuWay AgTrack | VerAgro ERP |
|---|---|---|
| Mercado objetivo | Operadores drones EE.UU. | Técnicos/empresas drones y agroinsumos Panamá |
| Modelo de ingresos | Freemium → suscripción (próxima) | Por definir (SaaS o licencia) |
| Diferenciador | Reportes FAA nativos | Multi-módulo: inventario + facturación + campo |
| Plataforma | Solo iOS | Web + Android (Expo) |
| Backend | Probablemente serverless | Django REST (robusto, multi-tenant) |
| Estado | v1.1.7, muy temprano | ERP completo con ~10 módulos |

---

*Documento generado a partir de investigación pública (App Store, sitio web, GitHub).
El código fuente de nuWay AgTrack es privado. Última verificación: 2026-06-16.*
