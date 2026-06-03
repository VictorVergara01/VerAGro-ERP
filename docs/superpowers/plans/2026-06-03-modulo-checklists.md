# Plan — Módulo de Checklists (`apps.checklists`)

**Spec:** `docs/superpowers/specs/2026-06-03-modulo-checklists-design.md`
**Rama:** `master`.

## Tareas (TDD)

1. **Scaffold + Modelos** — `tests/__init__.py`; 4 modelos (spec §3);
   `makemigrations checklists` → 0001. Tests de modelos.
2. **Seed** — data migration `0002` plantilla "Checklist DJI Agras T50" (tipo *Drone agrícola*)
   + 16 ítems. Test que verifica el seed.
3. **Servicios** — `instantiate_checklist`, `apply_recommended_parts` (spec §4). Tests.
4. **Serializers** — Template(+items), TemplateItem, ServiceChecklist(+items nested update),
   ServiceChecklistItem.
5. **Views + URLs** — `ChecklistTemplateViewSet` + `ChecklistTemplateItemViewSet`
   (admin); `ServiceChecklistViewSet` (+complete) + `ServiceChecklistItemViewSet`
   (admin/technician). Router en config/urls.py. Acción `checklist` (GET/POST) en
   `ServiceOrderViewSet` (import local de checklists). Tests API.
6. **Admin** — registrar plantillas (inline items) y service checklists (inline items).
7. **Verificación** — check, makemigrations --check, schema --fail-on-warn, suite verde, en vivo.
8. **Commit + memoria** — commit español (trailer). Actualizar progreso (Checklists hecho;
   próximo Cotizaciones/Facturación) y followups.

## Notas
- Dependencia unidireccional checklists→service_orders (import local en services y en la acción).
- Reusar patrón lookup read/write con RoleWriteOrReadOnly; soft-delete de plantillas como
  inventario/proveedores.
