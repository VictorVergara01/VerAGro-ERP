# Documento de Desarrollo — ERP Modular Veragro

**Versión actualizada:** incluye frontend web, frontend móvil Android y uso de Nginx externo existente en Proxmox.

## 1. Objetivo del proyecto

Desarrollar un ERP modular para una operación agro-tecnológica enfocada en fumigación con drones, mantenimiento de drones/equipos, gestión de inventario de repuestos, proveedores, compras, clientes, equipos, cotizaciones y facturación.

El sistema debe iniciar como un **monolito modular bien estructurado**, preparado para evolucionar hacia microservicios en el futuro. La prioridad es entregar una primera versión funcional, mantenible y escalable.

El ERP debe permitir que las áreas principales del negocio estén conectadas:

- Clientes.
- Equipos de clientes y equipos propios.
- Órdenes de servicio.
- Diagnóstico técnico y checklist de mantenimiento.
- Inventario de piezas/repuestos.
- Proveedores.
- Compras y recepción de pedidos.
- Costeo real de piezas con distribución proporcional de costos adicionales.
- Cotizaciones.
- Facturas de servicio.
- Facturas finales.
- Pagos.
- Reportes operativos y financieros.

---

## 2. Decisiones técnicas base

### 2.1 Arquitectura recomendada

Usar una arquitectura de **monolito modular**.

No crear microservicios separados desde el inicio. En su lugar, crear módulos internos independientes por dominio de negocio. Esto permite desarrollar más rápido, mantener consistencia de datos y preparar la separación futura si el sistema crece.

### 2.2 Stack recomendado

Backend:

- Python 3.12+
- Django
- Django REST Framework
- PostgreSQL
- Redis
- Celery
- JWT Authentication
- Django Admin habilitado para gestión interna

Frontend web:

- React
- Vite
- TypeScript obligatorio
- Tailwind CSS
- Axios o TanStack Query para consumo de APIs
- React Router
- Formularios con React Hook Form

Frontend móvil Android:

- React Native
- Expo
- TypeScript obligatorio
- Expo Router o React Navigation
- TanStack Query para consumo y caché de APIs
- React Hook Form para formularios
- Zod para validaciones
- Expo SecureStore para guardar tokens de sesión
- Cámara del dispositivo para fotos, códigos QR o códigos de barra en fases posteriores

Infraestructura:

- Docker para backend, frontend, PostgreSQL, Redis y workers.
- El servidor ya cuenta con **Nginx configurado en Proxmox**.
- No incluir Nginx interno obligatorio dentro del proyecto.
- El sistema debe exponer puertos para que el Nginx existente en Proxmox funcione como reverse proxy.

### 2.3 Nota sobre despliegue

El proyecto debe poder correr en modo desarrollo y producción usando Docker Compose.

Nginx externo en Proxmox debe apuntar a:

- Frontend web: puerto definido para producción o build servido por contenedor frontend.
- Backend API: puerto del servicio Django/Gunicorn.
- Frontend móvil Android: consume la API pública expuesta por Nginx externo. No requiere Nginx propio ni contenedor obligatorio.

Ejemplo conceptual:

```text
Internet
  ↓
Nginx existente en Proxmox
  ↓
Contenedores Docker del ERP
  ├── frontend_web
  ├── backend
  ├── postgres
  ├── redis
  └── celery worker

App móvil Android
  └── Consume la API vía HTTPS desde el dominio configurado en Nginx
```

---

## 3. Nombre del sistema

Nombre sugerido del proyecto:

**Veragro ERP**

Módulos internos:

- Veragro Clientes
- Veragro Equipos
- Veragro Inventario
- Veragro Compras
- Veragro Proveedores
- Veragro Servicio Técnico
- Veragro Facturación
- Veragro Reportes
- Veragro Mobile para técnicos y operación de campo

---

## 4. Alcance general del ERP

El ERP debe cubrir los siguientes procesos:

1. Registrar clientes.
2. Registrar equipos asociados a clientes o a la empresa.
3. Crear órdenes de servicio para mantenimientos o reparaciones.
4. Realizar diagnóstico técnico del equipo.
5. Completar checklist según tipo de equipo.
6. Agregar piezas usadas en el mantenimiento.
7. Consultar inventario en tiempo real.
8. Reservar o descontar piezas del inventario.
9. Generar solicitud de compra si una pieza no está disponible.
10. Gestionar proveedores.
11. Crear órdenes de compra.
12. Registrar recepción de pedidos.
13. Calcular costo real de las piezas incluyendo envío y costos adicionales.
14. Aplicar margen de ganancia manual.
15. Registrar piezas en inventario con costo y precio final.
16. Generar cotizaciones para clientes.
17. Convertir cotización aprobada en factura de servicio.
18. Emitir factura final.
19. Registrar pagos.
20. Consultar historial de cliente, equipo, orden, factura y mantenimiento.
21. Permitir que técnicos trabajen desde una app Android conectada a la API del ERP.
22. Permitir registro de diagnóstico, checklist, fotos, piezas usadas y cambios de estado desde Android.

---

## 5. Módulos funcionales

## 5.1 Módulo de usuarios y permisos

### Objetivo

Controlar el acceso al sistema según rol.

### Roles mínimos

- Administrador
- Técnico
- Vendedor / facturación
- Inventario / compras
- Consulta / lectura

### Reglas

- Solo administradores pueden crear usuarios y modificar permisos.
- Técnicos pueden crear diagnósticos, llenar checklists y agregar piezas usadas.
- Inventario puede crear piezas, ajustar stock y registrar compras.
- Facturación puede crear cotizaciones, facturas y registrar pagos.
- Administrador puede ver todos los reportes.

---

## 5.2 Módulo de clientes

### Objetivo

Gestionar todos los clientes del negocio y relacionarlos con equipos, órdenes de servicio y facturas.

### Entidad: Customer

Campos sugeridos:

- id
- customer_type: persona / empresa
- name
- legal_name
- identification_type: cédula / RUC / pasaporte / otro
- identification_number
- dv
- phone
- whatsapp
- email
- address
- province
- district
- notes
- is_active
- created_at
- updated_at

### Funciones

- Crear cliente.
- Editar cliente.
- Desactivar cliente.
- Buscar por nombre, cédula, RUC, teléfono o correo.
- Ver historial de órdenes de servicio.
- Ver historial de facturas.
- Ver equipos relacionados.

---

## 5.3 Módulo de equipos

### Objetivo

Registrar y gestionar equipos de clientes y equipos propios usados en la operación.

### Tipos de equipos

- Drone agrícola
- Drone de mapeo
- Planta eléctrica
- Cargador
- Batería
- Bomba
- Atomizador
- Control remoto
- Otro

### Entidad: Equipment

Campos sugeridos:

- id
- owner_type: cliente / empresa
- customer_id nullable
- name
- equipment_type_id
- brand
- model
- serial_number
- internal_code
- purchase_date
- warranty_expiration
- status: activo / en mantenimiento / fuera de servicio / vendido / retirado
- notes
- created_at
- updated_at

### Funciones

- Registrar equipo.
- Relacionar equipo con cliente.
- Ver historial completo de mantenimientos.
- Ver facturas asociadas al equipo.
- Ver piezas usadas históricamente en ese equipo.

---

## 5.4 Módulo de inventario

### Objetivo

Gestionar piezas, repuestos, consumibles y productos del negocio.

### Entidad: Part / Product

Campos sugeridos:

- id
- sku
- name
- description
- category_id
- brand
- model
- compatible_equipment_types
- compatible_models
- unit_of_measure
- stock_quantity
- reserved_quantity
- available_quantity calculado
- minimum_stock
- average_cost
- last_purchase_cost
- sale_price
- default_margin_percentage
- location
- main_supplier_id
- barcode nullable
- is_active
- created_at
- updated_at

### Reglas de inventario

- available_quantity = stock_quantity - reserved_quantity
- No permitir usar más piezas que las disponibles, salvo permiso especial.
- Permitir reservar piezas para una orden de servicio aprobada.
- Descontar piezas al cerrar/facturar la orden de servicio.
- Registrar todo movimiento de inventario.

### Entidad: InventoryMovement

Campos sugeridos:

- id
- product_id
- movement_type:
  - purchase_in
  - service_out
  - reservation
  - reservation_release
  - adjustment_in
  - adjustment_out
  - return_in
  - damaged_out
- quantity
- unit_cost
- reference_type
- reference_id
- notes
- created_by
- created_at

---

## 5.5 Módulo de proveedores

### Objetivo

Gestionar proveedores y vincularlos con piezas/repuestos.

### Entidad: Supplier

Campos sugeridos:

- id
- name
- legal_name
- country
- phone
- whatsapp
- email
- website
- contact_person
- address
- estimated_delivery_days
- payment_terms
- notes
- is_active
- created_at
- updated_at

### Entidad: SupplierProduct

Relación entre proveedor y pieza.

Campos sugeridos:

- id
- supplier_id
- product_id
- supplier_sku
- last_cost
- currency
- minimum_order_quantity
- estimated_delivery_days
- is_preferred
- notes

### Funciones

- Registrar proveedor.
- Asociar proveedor con piezas.
- Consultar qué proveedor vende cada pieza.
- Marcar proveedor preferido.
- Ver historial de compras por proveedor.

---

## 5.6 Módulo de compras y recepción de pedidos

### Objetivo

Gestionar órdenes de compra y registrar la recepción de piezas aplicando costo real.

### Entidad: PurchaseOrder

Campos sugeridos:

- id
- supplier_id
- order_number
- status:
  - draft
  - sent
  - partially_received
  - received
  - cancelled
- order_date
- expected_date
- currency
- subtotal_products
- shipping_cost
- additional_costs_total
- grand_total
- notes
- created_by
- created_at
- updated_at

### Entidad: PurchaseOrderLine

Campos sugeridos:

- id
- purchase_order_id
- product_id
- quantity_ordered
- quantity_received
- unit_purchase_cost
- line_subtotal
- allocated_extra_cost
- landed_unit_cost
- margin_percentage
- calculated_sale_price
- final_sale_price

### Entidad: PurchaseAdditionalCost

Campos sugeridos:

- id
- purchase_order_id
- name
- amount
- allocation_method:
  - proportional_by_value
  - manual
- notes

### Regla principal de costeo

El costo de envío y costos adicionales se deben distribuir entre las piezas **proporcionalmente al valor de cada línea de compra**.

Esta será la regla por defecto.

### Fórmula

Para cada línea:

```text
line_subtotal = quantity * unit_purchase_cost
products_subtotal = suma de todos los line_subtotal
additional_total = shipping_cost + suma de costos adicionales
allocation_ratio = line_subtotal / products_subtotal
allocated_extra_cost = additional_total * allocation_ratio
landed_total_line_cost = line_subtotal + allocated_extra_cost
landed_unit_cost = landed_total_line_cost / quantity
sale_price = landed_unit_cost * (1 + margin_percentage / 100)
```

### Ejemplo

Compra:

| Producto | Cantidad | Costo unitario | Subtotal |
|---|---:|---:|---:|
| Hélice T50 | 10 | 18.00 | 180.00 |
| Flow Meter | 2 | 45.00 | 90.00 |
| Bomba | 1 | 120.00 | 120.00 |

Subtotal productos:

```text
180 + 90 + 120 = 390
```

Costos adicionales:

```text
Envío = 60
Aduana = 25
Transporte interno = 15
Total adicional = 100
```

Distribución proporcional:

```text
Hélice: 180 / 390 = 46.15% del costo adicional
Flow Meter: 90 / 390 = 23.08% del costo adicional
Bomba: 120 / 390 = 30.77% del costo adicional
```

Costo adicional asignado:

```text
Hélice: 46.15
Flow Meter: 23.08
Bomba: 30.77
```

Costo real unitario:

```text
Hélice: (180 + 46.15) / 10 = 22.62
Flow Meter: (90 + 23.08) / 2 = 56.54
Bomba: (120 + 30.77) / 1 = 150.77
```

Luego el usuario define manualmente el margen.

Ejemplo con 35%:

```text
precio_venta = costo_real_unitario * 1.35
```

### Reglas adicionales

- Permitir editar margen manual por línea.
- Permitir editar precio final manualmente antes de ingresar al inventario.
- Guardar costo real y precio de venta final.
- Al confirmar recepción, crear movimiento de inventario tipo purchase_in.
- Actualizar stock_quantity.
- Actualizar last_purchase_cost.
- Actualizar average_cost si se decide manejar costo promedio.

---

## 5.7 Módulo de órdenes de servicio y mantenimiento

### Objetivo

Gestionar mantenimientos, reparaciones, diagnósticos y piezas usadas en drones/equipos.

### Entidad: ServiceOrder

Campos sugeridos:

- id
- service_order_number
- customer_id
- equipment_id
- service_type:
  - diagnostic
  - preventive_maintenance
  - corrective_maintenance
  - repair
  - cleaning
  - calibration
  - other
- status:
  - received
  - in_diagnostic
  - quoted
  - approved
  - in_progress
  - waiting_parts
  - finished
  - invoiced
  - delivered
  - cancelled
- received_date
- estimated_delivery_date
- finished_date
- delivered_date
- technician_id
- customer_complaint
- diagnostic_summary
- technical_notes
- internal_notes
- labor_cost
- diagnostic_fee
- discount_amount
- tax_amount
- total_amount
- created_by
- created_at
- updated_at

### Flujo de estados recomendado

```text
received
  ↓
in_diagnostic
  ↓
quoted
  ↓
approved
  ↓
in_progress
  ↓
finished
  ↓
invoiced
  ↓
delivered
```

Si faltan piezas:

```text
in_diagnostic / approved
  ↓
waiting_parts
  ↓
in_progress
```

### Entidad: ServiceOrderPart

Piezas usadas o requeridas en una orden de servicio.

Campos sugeridos:

- id
- service_order_id
- product_id
- quantity
- unit_cost
- unit_price
- total_price
- status:
  - required
  - reserved
  - used
  - pending_purchase
  - returned
- notes

### Reglas

- Si hay stock disponible, permitir reservar pieza.
- Si no hay stock, marcar como pending_purchase.
- Si una pieza está pending_purchase, permitir generar solicitud de compra.
- Al finalizar la orden, las piezas marcadas como used deben descontarse del inventario.
- La factura de servicio debe incluir piezas usadas y mano de obra.

---

## 5.8 Módulo de checklist y diagnóstico

### Objetivo

Crear checklists reutilizables por tipo de equipo y permitir llenarlos en cada orden de servicio.

### Entidad: ChecklistTemplate

Campos sugeridos:

- id
- name
- equipment_type_id
- description
- is_active

### Entidad: ChecklistTemplateItem

Campos sugeridos:

- id
- checklist_template_id
- name
- description
- order
- is_required

### Entidad: ServiceChecklist

Campos sugeridos:

- id
- service_order_id
- checklist_template_id
- completed_by
- completed_at

### Entidad: ServiceChecklistItem

Campos sugeridos:

- id
- service_checklist_id
- template_item_id
- status:
  - ok
  - fail
  - requires_replacement
  - not_applicable
  - pending
- notes
- recommended_product_id nullable
- priority:
  - low
  - medium
  - high
  - critical

### Checklist inicial para DJI Agras T50

Crear una plantilla base con estos puntos:

1. Revisar hélices.
2. Revisar brazos.
3. Revisar motores.
4. Revisar ESC.
5. Revisar bombas.
6. Revisar mangueras.
7. Revisar boquillas / atomizadores.
8. Revisar flow meter.
9. Revisar tanque.
10. Revisar batería.
11. Revisar cargador.
12. Verificar firmware.
13. Prueba de pulverización.
14. Prueba de centrifugado.
15. Limpieza general.
16. Observaciones finales.

---

## 5.9 Módulo de cotizaciones

### Objetivo

Crear cotizaciones para clientes, especialmente desde órdenes de servicio.

### Entidad: Quote

Campos sugeridos:

- id
- quote_number
- customer_id
- service_order_id nullable
- status:
  - draft
  - sent
  - approved
  - rejected
  - expired
  - converted_to_invoice
- issue_date
- expiration_date
- subtotal
- discount_amount
- tax_amount
- total
- notes
- terms
- created_by
- created_at
- updated_at

### Entidad: QuoteLine

Campos sugeridos:

- id
- quote_id
- product_id nullable
- description
- quantity
- unit_price
- discount_amount
- tax_amount
- total
- line_type:
  - product
  - service
  - labor
  - diagnostic
  - other

### Funciones

- Crear cotización manual.
- Crear cotización desde orden de servicio.
- Aprobar cotización.
- Rechazar cotización.
- Convertir cotización aprobada en factura.
- Generar PDF.

---

## 5.10 Módulo de facturación

### Objetivo

Gestionar facturas de servicio, facturas finales y pagos.

### Entidad: Invoice

Campos sugeridos:

- id
- invoice_number
- invoice_type:
  - service_invoice
  - final_invoice
  - product_sale
- customer_id
- service_order_id nullable
- quote_id nullable
- status:
  - draft
  - issued
  - partially_paid
  - paid
  - cancelled
- issue_date
- due_date
- subtotal
- discount_amount
- tax_amount
- total
- paid_amount
- balance_due
- notes
- created_by
- created_at
- updated_at

### Entidad: InvoiceLine

Campos sugeridos:

- id
- invoice_id
- product_id nullable
- description
- quantity
- unit_price
- unit_cost
- margin_amount
- discount_amount
- tax_amount
- total
- line_type:
  - product
  - service
  - labor
  - diagnostic
  - other

### Entidad: Payment

Campos sugeridos:

- id
- invoice_id
- payment_date
- amount
- method:
  - cash
  - bank_transfer
  - yappy
  - ach
  - card
  - other
- reference_number
- notes
- created_by
- created_at

### Reglas

- Una factura puede venir de una cotización.
- Una factura puede venir de una orden de servicio.
- Una orden de servicio no debe pasar a delivered si no está facturada, salvo permiso especial.
- balance_due = total - paid_amount.
- Si paid_amount = total, status = paid.
- Si paid_amount > 0 y menor que total, status = partially_paid.

---

## 5.11 Módulo de reportes

### Reportes mínimos

- Inventario actual.
- Piezas bajo stock mínimo.
- Piezas más usadas en mantenimientos.
- Servicios pendientes.
- Servicios esperando piezas.
- Servicios finalizados por técnico.
- Facturas pendientes de pago.
- Ventas por mes.
- Ganancia por factura.
- Ganancia por pieza.
- Compras por proveedor.
- Historial de mantenimiento por equipo.
- Clientes con más servicios.
- Equipos con más fallas.

---

## 6. Flujo completo principal

## 6.1 Flujo de mantenimiento con factura

1. Usuario registra o busca cliente.
2. Usuario registra o selecciona equipo.
3. Usuario crea orden de servicio.
4. Técnico recibe equipo.
5. Técnico llena diagnóstico y checklist.
6. Técnico agrega piezas requeridas.
7. Sistema verifica inventario.
8. Si hay stock, permite reservar piezas.
9. Si no hay stock, marca pieza como pendiente de compra.
10. Usuario genera cotización.
11. Cliente aprueba cotización.
12. Orden pasa a approved.
13. Técnico realiza mantenimiento.
14. Técnico marca piezas como usadas.
15. Orden pasa a finished.
16. Sistema genera factura de servicio.
17. Sistema descuenta piezas del inventario.
18. Usuario registra pago.
19. Orden pasa a delivered.
20. Equipo conserva historial del mantenimiento.

---

## 6.2 Flujo de compra y entrada de inventario

1. Usuario crea orden de compra.
2. Selecciona proveedor.
3. Agrega piezas y cantidades.
4. Registra costo unitario por pieza.
5. Registra costo de envío.
6. Registra costos adicionales.
7. Sistema calcula distribución proporcional por valor.
8. Sistema calcula costo real unitario.
9. Usuario define margen manual por pieza.
10. Sistema calcula precio de venta sugerido.
11. Usuario puede ajustar precio final.
12. Usuario confirma recepción.
13. Sistema crea movimientos de inventario.
14. Sistema actualiza stock, costo y precio.


---

## 6.9 Frontend móvil Android

### Objetivo

Crear una aplicación Android para técnicos y personal operativo, conectada al mismo backend del ERP mediante la API REST.

La app móvil no debe reemplazar al panel web administrativo. Su propósito es facilitar el trabajo en campo o taller, especialmente para mantenimiento, diagnóstico, checklist, registro fotográfico, piezas usadas y actualización de estados de órdenes de servicio.

### Tecnología recomendada

Usar:

```text
React Native + Expo + TypeScript
```

Razones:

- Permite usar TypeScript igual que el frontend web.
- Facilita compartir criterios de validación, tipos y lógica de consumo API.
- Permite desarrollar Android primero y mantener la posibilidad de compilar para iOS en el futuro.
- Reduce el tiempo de desarrollo frente a una app nativa desde cero.
- Es adecuada para formularios, checklists, fotos, lectura de códigos y flujos operativos.

### Alternativa válida

Si en el futuro se requiere una app Android muy nativa, con integración profunda con hardware o máximo rendimiento, se puede considerar:

```text
Kotlin + Jetpack Compose
```

Pero para este ERP, la opción recomendada para el MVP es React Native con Expo.

### Alcance del MVP móvil

La primera versión Android debe incluir:

1. Inicio de sesión.
2. Vista de órdenes de servicio asignadas al técnico.
3. Filtro por estado: recibida, en diagnóstico, esperando piezas, en reparación, finalizada.
4. Detalle de orden de servicio.
5. Información del cliente.
6. Información del equipo.
7. Checklist técnico.
8. Diagnóstico técnico.
9. Registro de observaciones.
10. Captura y carga de fotos.
11. Búsqueda de piezas en inventario.
12. Agregar piezas usadas a la orden.
13. Cambiar estado de la orden.
14. Ver resumen de piezas y mano de obra.
15. Sincronizar información con el backend.

### Funciones que no son prioridad en el MVP móvil

Estas funciones deben quedar para fases posteriores:

- Crear productos complejos de inventario desde el móvil.
- Registrar compras completas desde el móvil.
- Costeo avanzado de pedidos desde el móvil.
- Gestión de proveedores desde el móvil.
- Reportes financieros completos.
- Administración de usuarios.
- Configuración del sistema.

### Flujo móvil recomendado

```text
Técnico inicia sesión
  ↓
Ve órdenes asignadas
  ↓
Abre orden de servicio
  ↓
Revisa datos del cliente y equipo
  ↓
Llena checklist
  ↓
Agrega diagnóstico
  ↓
Toma fotos
  ↓
Agrega piezas usadas
  ↓
Actualiza estado de la orden
  ↓
Sincroniza con backend
```

### Consideraciones de conexión

En el MVP, la app puede trabajar principalmente online.

Sin embargo, la estructura debe quedar preparada para modo offline futuro, especialmente porque las operaciones agrícolas pueden realizarse en zonas con mala señal.

Para una fase posterior se recomienda:

- Caché local de órdenes asignadas.
- SQLite local.
- Cola de sincronización.
- Reintento automático cuando vuelva la conexión.
- Indicador visual de datos pendientes por sincronizar.

### Seguridad móvil

La app móvil debe:

- Usar HTTPS obligatoriamente en producción.
- Guardar access token y refresh token en almacenamiento seguro.
- No guardar contraseñas localmente.
- Cerrar sesión correctamente.
- Renovar tokens automáticamente.
- Bloquear acciones si el usuario no tiene permisos.

### Estructura recomendada del proyecto móvil

```text
mobile/
  app/
    login/
    service-orders/
    service-orders/[id]/
    checklist/
    inventory-search/
    profile/
  src/
    api/
      client.ts
      auth.api.ts
      serviceOrders.api.ts
      inventory.api.ts
    components/
      Button.tsx
      Input.tsx
      StatusBadge.tsx
      PhotoUploader.tsx
      ChecklistItem.tsx
    features/
      auth/
      serviceOrders/
      checklist/
      inventory/
    hooks/
    types/
    utils/
    validations/
  app.json
  package.json
  tsconfig.json
```

### Variables de entorno del móvil

```env
EXPO_PUBLIC_API_URL=https://api.tudominio.com/api
```

### APIs necesarias para móvil

El backend debe exponer endpoints adecuados para la app móvil:

```text
POST   /api/auth/login/
POST   /api/auth/refresh/
GET    /api/mobile/service-orders/
GET    /api/mobile/service-orders/{id}/
PATCH  /api/mobile/service-orders/{id}/status/
GET    /api/mobile/service-orders/{id}/checklist/
POST   /api/mobile/service-orders/{id}/checklist-items/
POST   /api/mobile/service-orders/{id}/diagnosis/
POST   /api/mobile/service-orders/{id}/photos/
GET    /api/mobile/inventory/search/
POST   /api/mobile/service-orders/{id}/used-parts/
DELETE /api/mobile/service-orders/{id}/used-parts/{used_part_id}/
```

### Reglas para endpoints móviles

- Los técnicos solo deben ver órdenes asignadas a ellos, salvo que tengan rol de administrador.
- Los técnicos pueden actualizar diagnóstico, checklist, fotos, piezas usadas y estado operativo.
- La app móvil no debe permitir modificar costos internos sensibles si el rol no lo autoriza.
- La app móvil debe recibir datos resumidos y optimizados, no respuestas demasiado pesadas.
- Las respuestas deben estar paginadas cuando aplique.

### Documentación de API

El backend debe generar documentación OpenAPI para que el frontend web y móvil puedan consumir la API con mayor seguridad.

Recomendado:

```text
drf-spectacular
```

Esto permitirá documentar endpoints y generar tipos para TypeScript en el futuro.

---

## 7. API REST sugerida

## 7.1 Auth

```text
POST /api/auth/login/
POST /api/auth/logout/
POST /api/auth/refresh/
GET  /api/auth/me/
```

## 7.2 Clientes

```text
GET    /api/customers/
POST   /api/customers/
GET    /api/customers/{id}/
PUT    /api/customers/{id}/
DELETE /api/customers/{id}/
GET    /api/customers/{id}/service-orders/
GET    /api/customers/{id}/invoices/
GET    /api/customers/{id}/equipment/
```

## 7.3 Equipos

```text
GET    /api/equipment/
POST   /api/equipment/
GET    /api/equipment/{id}/
PUT    /api/equipment/{id}/
DELETE /api/equipment/{id}/
GET    /api/equipment/{id}/service-history/
```

## 7.4 Inventario

```text
GET    /api/inventory/products/
POST   /api/inventory/products/
GET    /api/inventory/products/{id}/
PUT    /api/inventory/products/{id}/
GET    /api/inventory/products/{id}/movements/
POST   /api/inventory/adjustments/
GET    /api/inventory/low-stock/
```

## 7.5 Proveedores

```text
GET    /api/suppliers/
POST   /api/suppliers/
GET    /api/suppliers/{id}/
PUT    /api/suppliers/{id}/
GET    /api/suppliers/{id}/products/
POST   /api/suppliers/{id}/products/
```

## 7.6 Compras

```text
GET    /api/purchases/orders/
POST   /api/purchases/orders/
GET    /api/purchases/orders/{id}/
PUT    /api/purchases/orders/{id}/
POST   /api/purchases/orders/{id}/calculate-costs/
POST   /api/purchases/orders/{id}/receive/
POST   /api/purchases/orders/{id}/cancel/
```

## 7.7 Órdenes de servicio

```text
GET    /api/service-orders/
POST   /api/service-orders/
GET    /api/service-orders/{id}/
PUT    /api/service-orders/{id}/
POST   /api/service-orders/{id}/start-diagnostic/
POST   /api/service-orders/{id}/add-part/
POST   /api/service-orders/{id}/reserve-parts/
POST   /api/service-orders/{id}/finish/
POST   /api/service-orders/{id}/generate-quote/
POST   /api/service-orders/{id}/generate-invoice/
POST   /api/service-orders/{id}/deliver/
```

## 7.8 Checklist

```text
GET    /api/checklists/templates/
POST   /api/checklists/templates/
GET    /api/checklists/templates/{id}/
PUT    /api/checklists/templates/{id}/
POST   /api/service-orders/{id}/checklist/
PUT    /api/service-orders/{id}/checklist/{checklist_id}/
```

## 7.9 Cotizaciones

```text
GET    /api/quotes/
POST   /api/quotes/
GET    /api/quotes/{id}/
PUT    /api/quotes/{id}/
POST   /api/quotes/{id}/approve/
POST   /api/quotes/{id}/reject/
POST   /api/quotes/{id}/convert-to-invoice/
GET    /api/quotes/{id}/pdf/
```

## 7.10 Facturas

```text
GET    /api/invoices/
POST   /api/invoices/
GET    /api/invoices/{id}/
PUT    /api/invoices/{id}/
POST   /api/invoices/{id}/issue/
POST   /api/invoices/{id}/cancel/
POST   /api/invoices/{id}/payments/
GET    /api/invoices/{id}/pdf/
```

## 7.11 Reportes

```text
GET /api/reports/dashboard/
GET /api/reports/low-stock/
GET /api/reports/service-orders/
GET /api/reports/sales/
GET /api/reports/profit/
GET /api/reports/equipment-history/
```

---

## 8. Estructura recomendada del backend Django

```text
backend/
  manage.py
  requirements.txt
  config/
    settings/
      base.py
      development.py
      production.py
    urls.py
    asgi.py
    wsgi.py
  apps/
    users/
    customers/
    equipment/
    inventory/
    suppliers/
    purchasing/
    service_orders/
    checklists/
    billing/
    reports/
    core/
  media/
  static/
```

Cada app debe tener:

```text
models.py
serializers.py
views.py
urls.py
services.py
permissions.py
tests.py
admin.py
```

Usar `services.py` para lógica de negocio importante, por ejemplo:

- Cálculo de costos de compra.
- Distribución proporcional.
- Reserva de inventario.
- Descuento de piezas.
- Conversión de cotización a factura.
- Generación de factura desde orden de servicio.

---

## 9. Estructura recomendada del frontend web React

```text
frontend/
  src/
    app/
    components/
      ui/
      layout/
      forms/
      tables/
    features/
      auth/
      customers/
      equipment/
      inventory/
      suppliers/
      purchasing/
      serviceOrders/
      checklists/
      quotes/
      invoices/
      reports/
    hooks/
    lib/
    routes/
    types/
    utils/
```

### Páginas mínimas

- Login
- Dashboard
- Clientes
- Detalle de cliente
- Equipos
- Detalle de equipo
- Inventario
- Detalle de producto
- Proveedores
- Compras
- Recepción de compra
- Órdenes de servicio
- Detalle de orden de servicio
- Checklist / diagnóstico
- Cotizaciones
- Facturas
- Reportes
- Configuración

---

## 10. Requisitos de UI/UX

El sistema debe ser:

- Responsive.
- Limpio y moderno.
- Orientado a operación rápida.
- Con tablas filtrables.
- Con búsqueda por texto.
- Con badges de estado.
- Con formularios claros.
- Con modales para acciones rápidas.
- Con dashboard inicial.

### Dashboard mínimo

Mostrar tarjetas con:

- Órdenes de servicio abiertas.
- Órdenes esperando piezas.
- Facturas pendientes.
- Piezas bajo stock.
- Ventas del mes.
- Servicios terminados del mes.

---

## 11. Documentos PDF

El sistema debe generar PDFs para:

- Cotización.
- Factura de servicio.
- Factura final.
- Orden de servicio.
- Reporte de diagnóstico.
- Historial de mantenimiento del equipo.

Los PDFs deben incluir:

- Logo de la empresa.
- Datos de la empresa.
- Datos del cliente.
- Número de documento.
- Fecha.
- Tabla de conceptos.
- Subtotal.
- Descuentos.
- Impuestos si aplica.
- Total.
- Observaciones.
- Espacio para firma si aplica.

---

## 12. Reglas de negocio importantes

1. Toda pieza usada en mantenimiento debe estar relacionada con una orden de servicio.
2. Toda salida de inventario debe crear un movimiento de inventario.
3. Toda entrada de inventario debe venir de una compra, ajuste o devolución.
4. El costo de envío y costos adicionales de compra se distribuyen proporcionalmente por valor de línea.
5. El margen de ganancia se define manualmente por producto al recibir una compra.
6. El precio calculado puede ser ajustado manualmente antes de registrar el producto en inventario.
7. Una orden de servicio puede generar una cotización.
8. Una cotización aprobada puede generar una factura.
9. Una orden de servicio finalizada puede generar factura de servicio.
10. Los equipos deben conservar historial completo de mantenimientos.
11. Los clientes deben conservar historial completo de equipos, órdenes y facturas.
12. Si una pieza no tiene stock, debe poder marcarse como pendiente de compra.
13. El sistema debe permitir saber qué proveedor vende una pieza.
14. El inventario debe mostrar stock actual, reservado y disponible.
15. Los cálculos financieros deben guardarse, no solo mostrarse.

---

## 13. MVP recomendado

## MVP 1 — Base operativa

Implementar primero:

- Auth y usuarios.
- Clientes.
- Equipos.
- Inventario básico.
- Proveedores básicos.
- Órdenes de servicio.
- Piezas usadas en orden de servicio.
- Cotización básica.
- Factura de servicio básica.
- PDF básico de cotización y factura.

## MVP 2 — Frontend móvil Android operativo

Incluye:

- Login móvil.
- Órdenes de servicio asignadas.
- Detalle de orden.
- Checklist.
- Diagnóstico.
- Fotos.
- Piezas usadas.
- Cambio de estado de orden.
- Búsqueda simple de inventario.

---

## MVP 3 — Compras y costeo avanzado

Implementar:

- Órdenes de compra.
- Líneas de compra.
- Costos adicionales.
- Distribución proporcional por valor.
- Cálculo de costo real unitario.
- Margen manual.
- Entrada automática al inventario.

## MVP 4 — Checklist y diagnóstico avanzado

Implementar:

- Plantillas de checklist por tipo de equipo.
- Checklist llenado desde orden de servicio.
- Diagnóstico técnico.
- Recomendación de piezas.
- Prioridades.

## MVP 5 — Reportes y dashboard

Implementar:

- Dashboard operativo.
- Reportes de inventario.
- Reportes de facturación.
- Reportes de mantenimiento.
- Reportes de rentabilidad.

## MVP 6 — Automatización

Implementar:

- Alertas de bajo stock.
- Sugerencia de compra.
- Recordatorio de mantenimiento.
- Notificaciones por correo.
- Exportación CSV/Excel.

---

## 14. Comando general para Claude Code

Claude Code debe desarrollar el proyecto siguiendo este documento.

Prioridad inicial:

1. Crear estructura Docker.
2. Crear backend Django modular.
3. Crear modelos base.
4. Crear migraciones.
5. Crear serializers y endpoints REST.
6. Crear frontend React con layout principal.
7. Crear CRUD inicial para clientes, equipos, inventario, proveedores y órdenes de servicio.
8. Implementar flujo de orden de servicio con piezas usadas.
9. Implementar cotización y factura básica.
10. Implementar compra con distribución proporcional de costos.

No implementar microservicios separados en esta primera versión.
No incluir configuración obligatoria de Nginx interno, porque Nginx ya existe en Proxmox.

---

## 15. Variables de entorno sugeridas

Backend:

```env
DJANGO_SECRET_KEY=
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_NAME=veragro_erp
DATABASE_USER=veragro_user
DATABASE_PASSWORD=veragro_password
DATABASE_HOST=db
DATABASE_PORT=5432
REDIS_URL=redis://redis:6379/0
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

Frontend web:

```env
VITE_API_URL=http://localhost:8000/api
```

Frontend móvil Android:

```env
EXPO_PUBLIC_API_URL=http://localhost:8000/api
```

---

## 16. Docker Compose sugerido

Servicios mínimos:

```text
backend
frontend_web
db
redis
celery_worker
celery_beat opcional
```

La app móvil Android debe vivir en el mismo repositorio o en un repositorio separado, pero no necesita correr como contenedor obligatorio en producción. Durante desarrollo puede levantarse con Expo.

El backend debe correr con Gunicorn en producción.

El frontend debe poder correr en modo desarrollo con Vite y en producción como build estático.

---

## 17. Criterios de aceptación iniciales

El MVP se considera funcional cuando se pueda:

1. Iniciar sesión.
2. Crear un cliente.
3. Crear un equipo asociado al cliente.
4. Crear productos/repuestos en inventario.
5. Crear proveedor.
6. Asociar proveedor con producto.
7. Crear orden de servicio para un equipo.
8. Agregar diagnóstico básico.
9. Agregar piezas usadas en la orden.
10. Generar cotización desde la orden.
11. Aprobar cotización.
12. Generar factura de servicio.
13. Descontar inventario al cerrar la orden.
14. Crear orden de compra.
15. Registrar costos adicionales y envío.
16. Calcular costo real unitario proporcionalmente.
17. Aplicar margen manual.
18. Registrar entrada de inventario.
19. Consultar historial del cliente.
20. Consultar historial del equipo.
21. Iniciar sesión desde app Android.
22. Ver órdenes asignadas desde app Android.
23. Llenar checklist desde app Android.
24. Registrar diagnóstico y fotos desde app Android.
25. Agregar piezas usadas desde app Android.

---

## 18. Consideraciones futuras

El sistema debe quedar preparado para:

- Integración con facturación fiscal si se requiere en el futuro.
- Integración con Yappy o pagos digitales.
- Modo offline avanzado para la app móvil.
- Escaneo de códigos QR o códigos de barra.
- Gestión de garantías.
- Control de herramientas.
- Mantenimiento preventivo programado.
- Notificaciones por WhatsApp.
- Multiempresa.
- Multiubicación de inventario.
- Integración con tienda online.

---

## 19. Resumen del enfoque correcto

Este ERP debe construirse alrededor de la **Orden de Servicio** como núcleo operativo.

La orden de servicio conecta:

- Cliente.
- Equipo.
- Diagnóstico.
- Checklist.
- Piezas usadas.
- Inventario.
- Cotización.
- Factura.
- Historial técnico.

El inventario y compras deben permitir conocer el costo real de cada pieza, considerando compra, envío, costos adicionales y margen manual.

La facturación debe tomar los datos reales de las órdenes de servicio y piezas usadas.

La plataforma debe ser modular, profesional, escalable y lista para crecer hacia microservicios si el negocio lo requiere.

Además, debe incluir un frontend móvil Android para técnicos, desarrollado con React Native + Expo + TypeScript, conectado a la misma API del ERP.
