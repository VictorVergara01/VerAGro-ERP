# Web responsive — teléfono y tablet

**Fecha:** 2026-06-24
**Objetivo:** Que el frontend web (Mantine v9 SPA) se vea y funcione bien en teléfono (~375px) y tablet (~768px), ajustando breakpoints intermedios. Pulido, no reescritura: la base ya es responsive.

## Estado actual (lo que YA funciona)

- `AppShell` (`AppLayout.tsx`): navbar colapsa en móvil con burger (`breakpoint: sm`).
- `Topbar.tsx`: burger, buscador y meta de usuario se adaptan con `hiddenFrom`/`visibleFrom`.
- `DataTable.tsx` (listados principales): ya envuelve en `Table.ScrollContainer` con `minWidth` → scroll horizontal en pantallas chicas.
- La mayoría de páginas de detalle/formulario usan `Grid.Col span={{ base, sm, md }}`.

## Brechas a corregir

1. **Tablas embebidas sin scroll horizontal** — modales y páginas de detalle que usan `<Table>` directo en vez de `DataTable`/`Table.ScrollContainer`:
   - billing: `InvoiceCreateModal`, `InvoiceDetailPage`, `QuoteCreateModal`, `QuoteDetailPage`
   - field-jobs: `SprayMixModal`
   - inventory: `ImportSummary`
   - purchasing: `ReceiveModal` (verificar; `PurchaseOrderDetailPage` ya tiene scroll)
   - checklists: `ServiceOrderChecklistCard` (ya tiene scroll; verificar)
   → Envolver cada `<Table>` en `Table.ScrollContainer` con `minWidth` apropiado.
2. **`AddPartModal.tsx`** — `span={6}` fijo → `span={{ base: 12, sm: 6 }}`.
3. **Toolbars / headers de página** — `Group` de filtros/acciones que no hacen `wrap`; agregar `wrap` o reorganizar en pantallas chicas.
4. **Componentes compartidos** `PageHeader.tsx` / `DetailHeader.tsx` — un arreglo aquí cubre todas las páginas (acciones que se desbordan en móvil).
5. **Breakpoint intermedio (tablet)** — revisar que los grids ya responsive repartan bien columnas a ~768px (ni demasiado angostas ni vacías).

## Enfoque

Auditoría dirigida por breakpoints usando los patrones Mantine ya presentes en el código (`Table.ScrollContainer`, `span={{ base, sm, md }}`, `wrap`, `hiddenFrom/visibleFrom`). Sin librerías nuevas ni media queries propias.

## Orden de trabajo

Empezar por **facturas (billing)**, luego el resto de features. Componentes compartidos (`PageHeader`, `DetailHeader`, `DataTable`) se ajustan cuando una brecha los toque.

## Verificación

- Visual con capturas a **375px** y **768px** de las pantallas tocadas (navegador headless).
- `npm run typecheck` y `npm test` en `frontend/` antes de cerrar.

## Fuera de alcance (YAGNI)

- Reescribir listados como cards en móvil (el scroll horizontal de `DataTable` ya resuelve).
- Sistema de breakpoints/CSS propio fuera de Mantine.
- Optimización para pantallas <360px o desktop ultra-wide.
