# Móvil Fase 3c-1 — Soft-delete (long-press) + "Entregar sin cobro" (admin)

Primer slice de la Fase 3c (paridad móvil ↔ web). Puramente frontend móvil:
el backend ya soporta ambas funcionalidades. Gate: `npm run typecheck` + `expo export`.

## Contexto

La app móvil nativa (sub-proyectos 22–25 + Fase 1–3b) cubre el flujo completo de
servicio, pero faltan gaps de paridad con el panel web. Este slice cierra dos:

1. **Eliminar (soft-delete)** clientes, proveedores, productos y equipos desde el móvil.
2. **Override admin "Entregar sin cobro"** de una orden finalizada (sin esperar la factura/pago).

Ambos endpoints ya existen y se comportan correctamente en el backend:
- `DELETE /api/customers|suppliers|inventory/products|equipment/{id}/` → soft-delete
  (clientes/proveedores/productos → `is_active=False`; equipo → `status=retired`), responde **204**.
- `POST /api/service-orders/{id}/deliver/` → ya autoriza el **override admin** desde `finished`
  (regla "no delivered sin factura salvo admin", sub-proyecto 8/34). `useOrderAction` ya soporta `"deliver"`.

## A. Soft-delete con long-press en las listas

**Entidades:** Clientes, Proveedores, Productos (inventario), Equipos.

### Hooks
Añadir en cada `features/<x>/api.ts` un hook de borrado, siguiendo el patrón de `useDeletePart`:

```ts
export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/customers/{id}/", { params: { path: { id } } });
      if (error) throw new Error("No se pudo eliminar el cliente.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}
```

- `customers` → `/api/customers/{id}/`, invalida `["customers"]`.
- `suppliers` → `/api/suppliers/{id}/`, invalida `["suppliers"]`.
- `inventory` (productos) → `/api/inventory/products/{id}/`, invalida `["products"]`.
- `equipment` → `/api/equipment/{id}/`, invalida `["equipment"]`.

Usar la misma `queryKey` raíz que ya usan los `useQuery` de lista de cada feature
(verificar el nombre exacto en cada `api.ts` antes de invalidar).

### Componente `Card`
Añadir prop opcional `onLongPress?: () => void` al `Card` compartido
(`components/ui/index.tsx`) y pasarla al `TouchableOpacity`/`Pressable` interno,
con `delayLongPress={350}` (igual que `PartRow`). No cambia el comportamiento
actual de `onPress`.

### Pantallas de lista
En `CustomersScreen`, `SuppliersScreen`, `EquipmentScreen` y `InventorySearchScreen`
(esta última es la que lista productos con FAB de crear y `ProductFormModal`):

- Instanciar el hook de borrado.
- En cada `Card`, pasar `onLongPress={() => confirmDelete(item)}`.
- `confirmDelete` abre un `Alert` destructivo:
  > Título: "Eliminar <entidad>"
  > Mensaje: `¿Eliminar "<nombre>"? Se desactivará y dejará de aparecer en la lista.`
  > Botones: "Cancelar" (cancel) · "Eliminar" (destructive) → `mutate(id)` con
  > `onError: (e) => Alert.alert("Error", (e as Error).message)`.
- Añadir un hint sutil bajo el buscador o como texto tenue: "Mantén pulsada una fila para eliminar."
  (descubribilidad, mismo tono que el hint de piezas en órdenes).

Tras el 204 + invalidación, la fila desaparece (el backend filtra inactivos por defecto
en clientes/proveedores; equipo `retired` y productos inactivos según el queryset de lista —
comportamiento aceptable, no se fuerza nada extra).

## B. "Entregar sin cobro" (override admin) en `OrderDetailScreen`

- Leer el rol con `useAuth()` → `user?.role === "admin"`.
- Cuando `status === "finished"` **y** es admin, renderizar un botón **"Entregar sin cobro"**
  (estilo outline `docBtn`/`checklistBtn`) que llama `runDeliver()`:
  - `Alert` de confirmación: "¿Entregar sin cobro? La orden se marcará como entregada sin factura pagada."
  - Al confirmar: `action.mutate("deliver", { onError })`.
- El texto de espera de `finished` ("Esperando facturación y pago para poder entregar.")
  solo se muestra a **no-admin**; el admin ve el botón de override en su lugar (o además, si se
  prefiere, pero la decisión es mostrar el override al admin y el aviso al resto).
- No se toca `nextAction` (sigue devolviendo `deliver` solo en `invoiced`); el override es un
  botón aparte condicionado a admin + finished.

## Fuera de alcance
- Creación/edición manual de factura/cotización/OC con líneas (slice 3c-2).
- PDF compartible (slice 3c-3).
- Dark mode (slice 3c-4).
- Cualquier cambio de backend.

## Verificación
- `cd mobile && npm run typecheck` (exit 0).
- `npx expo export` (bundle OK).
- Prueba manual del usuario en dispositivo (`r` en Metro): long-press elimina en las 4 listas;
  admin ve "Entregar sin cobro" en una orden `finished` y la entrega.
