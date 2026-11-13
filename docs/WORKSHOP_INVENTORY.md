# Taller, inventario inicial y trabajos de campo

## Estado local actualizado: 12 de noviembre de 2026

Por solicitud del propietario se reemplazó el inventario local completo por las **337 filas del Excel Agras T50 Repuestos.xlsx**, una ficha independiente por SKU. Las filas que comparten número OEM conservan existencias independientes; ya no se aplica la consolidación en 246 productos descrita más abajo como antecedente. **No ejecutar `import_agras_t50_parts` sobre este catálogo:** ese comando consolida por OEM y contradice la estructura solicitada.

Se eliminaron 312 productos anteriores, 63 movimientos, 4 órdenes de taller, 4 compras y 6 facturas, junto con sus registros dependientes. El catálogo nuevo tiene 337 productos activos, 12 categorías y existencias, reservas, costos y precios en cero; todos están pendientes de conteo inicial. Se conservaron clientes, proveedores, equipos y configuración. Respaldo previo: `backups/before_337_reset_20261112.dump`. El Excel original y el servidor no se modificaron.

## Órdenes de trabajo

La recepción pide cliente, equipo y falla reportada. Diagnóstico, trabajo realizado y costos están en una sección opcional, abierta al editar. Desde una orden recibida se puede iniciar el trabajo directamente. Se conservan los estados anteriores para los registros existentes.

La pestaña inicial muestra las piezas. Se pueden registrar:

- **Del inventario:** producto existente; se puede reservar durante el trabajo. Al finalizar se reservan automáticamente las piezas pendientes con disponibilidad y se consume lo reservado.
- **Pieza manual:** nombre, número de pieza opcional, cantidad y precio; costo opcional. Queda pendiente de inventario y permite finalizar y generar la factura.
- **Del cliente** o **compra directa:** se incluyen en la reparación sin descontar existencias.

Para una pieza conocida cuyo stock todavía no esté actualizado, activar **Mi inventario aún no está actualizado**. Una pieza ya agregada, requerida o pendiente de compra, puede marcarse con **Sin inventario**. El sistema no crea productos ni cantidades ficticias.

Si faltan existencias en una pieza controlada, finalizar muestra el motivo y revierte la operación completa. Se debe recibir el stock o marcar explícitamente la pieza pendiente de inventario.

## Conciliación posterior

Las piezas pendientes conservan el botón **Conciliar**, incluso después de finalizar o entregar la orden:

1. **Consumir de inventario:** seleccionar el producto. Descuenta la cantidad de stock disponible una sola vez y registra el movimiento.
2. **Ya considerada en el conteo físico:** vincula el producto sin descontar. Se usa cuando la pieza se instaló antes del conteo inicial y el conteo ya refleja su ausencia.
3. **Aportada por el cliente** o **compra directa:** resuelve el pendiente sin movimiento de existencias.

La conciliación conserva cantidad, costo y precio de la reparación y sus documentos. Guarda fecha y usuario responsable. No se permite repetirla ni consumir stock reservado para otros trabajos.

## Trabajos de campo

El formulario, el listado con filtro y el detalle distinguen **Pulverización** y **Aplicación de sólidos**. Se mantienen las claves existentes `fumigation` y `spreading` para compatibilidad.

Los sólidos permiten productos en qq/ha, kg/ha y g/ha; muestran dosis y cantidad total por superficie. No muestran tanque de líquido, agua ni calculadora de mezcla. Al cambiar el tipo se vacía la receta y se carga la tarifa correspondiente, sin convertir litros a kilogramos.

La pulverización se cobra por hectárea. En sólidos se elige **por hectárea** o **por quintal (qq)** y se registra la carga aplicada en qq/ha. Las tarifas habituales configurables son **$15/qq aplicado** (normalmente urea) y **$25/ha** (normalmente semilla de pasto). Por ejemplo, 10 ha de urea a 3 qq/ha equivalen a 30 qq y cuestan $450; 10 ha de semilla de pasto cuestan $250. La carga puede registrarse también al cobrar por hectárea. Cambiar de modalidad carga la tarifa correspondiente desde Configuración. El precio sigue siendo editable y los trabajos existentes conservan el precio guardado.

Las cantidades facturables se redondean a dos decimales, igual que las líneas de factura, para que el total del trabajo coincida con el documento. Se registran qq directamente, sin una conversión automática desde kilogramos. Las facturas muestran la unidad de cobro y, cuando se conoce, el desglose de hectáreas y carga aplicada. Los trabajos anteriores conservan su modalidad de cobro. Las facturas conservan el prefijo histórico FUM para trabajos de campo.

### Programación y cierre con cantidades reales

Al programar se registran las hectáreas previstas y el presupuesto. Para sólidos se pueden indicar los **quintales totales previstos directamente**, sin introducir una dosis por hectárea. Si se registran ambos, los qq totales previstos tienen prioridad sobre el cálculo por dosis.

**Marcar hecho** abre el formulario de cierre. Deben introducirse las hectáreas realmente trabajadas; para cobrar por qq se exige además la cantidad total realmente aplicada. Estos campos empiezan vacíos para no confirmar por accidente lo programado. La fecha de realización es opcional; por defecto se registra la fecha del servidor.

Por ejemplo: se programan 10 ha y 30 qq a $15/qq (presupuesto $450), pero se trabajan 8.5 ha y se aplican 26 qq. El cierre registra un total de $390 y la factura cobra exactamente esos 26 qq. Si se cobra por hectárea a $25, el mismo trabajo cuesta $212.50. Se permite registrar más o menos cantidad que la prevista.

El detalle compara lo programado con lo realizado y conserva el presupuesto. Los productos y las dosis de la receta siguen identificados como previstos. Después del cierre no se modifica la programación ni las cantidades reales desde la edición general. La facturación exige datos reales y bloquea la creación duplicada del documento.

La migración conserva las cantidades originales de trabajos ya hechos o facturados, sin cambiar sus totales ni documentos. Los identifica mediante `actuals_from_legacy` y un aviso en pantalla; no se presentan como cantidades verificadas mediante el nuevo cierre.

## Conteo físico inicial

### Identidad de los repuestos del T50

El importador `import_agras_t50_parts` identifica las piezas por número OEM DJI. Una pieza puede estar presente en varias secciones y categorías del despiece, con una sola ficha de producto y una sola existencia. Los SKU anteriores se guardan como alias y siguen funcionando en las búsquedas del inventario y del taller. El producto sin número OEM conserva su identidad por SKU y no se agrupa solo por nombre.

La importación conserva las categorías anteriores y agrega las secciones del catálogo como categorías compartidas. El filtro por categoría contempla todas ellas; el filtro por modelo contempla tanto la relación antigua como la compatibilidad técnica. La selección de piezas en el taller incluye el catálogo completo y permite buscar las referencias antiguas.

`--dry-run` muestra el plan sin cambiar los datos. Antes de consolidar se comprueban las existencias, reservas, conteos, documentos y diferencias de metadatos. Un duplicado con operaciones o datos contradictorios detiene toda la importación para revisión. No se suman saldos ni se borran documentos. El importador conserva los costos y precios existentes y no crea conteos iniciales.

La corrección local del catálogo del Excel consolidó 337 filas en 246 repuestos y conservó 91 SKU anteriores. Se guardó un respaldo de PostgreSQL en la carpeta `backups` antes de ejecutar la consolidación. La copia de Excel original se leyó en modo de solo lectura.

Los selectores de modelo del inventario y del conteo usan la compatibilidad técnica para mostrar las piezas confirmadas de ese modelo. Los registros de prueba o accesorios que solo tienen una asociación antigua al tipo de equipo siguen en el catálogo general hasta revisarlos; no se borran ni se consideran piezas identificadas del despiece.

Los productos, categorías y compatibilidades de esta computadora son el catálogo válido. Se conservan durante el conteo; la limpieza de duplicados del servidor es una operación posterior y separada.

En **Inventario → Conteo físico inicial** se puede buscar por nombre, SKU o número de pieza, filtrar por categoría y modelo de dron y consultar el avance. La lista distingue **sin contar**, **contado** y **contado en cero**. No se convierte automáticamente un producto con stock cero en un producto contado.

Para cada producto se registran cantidad física, ubicación, costo unitario y notas opcionales. La cantidad puede ser cero; si hay unidades, se exige un costo positivo para valorar el inventario. La cantidad contada es absoluta: reemplaza el saldo anterior, no se suma. El saldo inicial establece el costo promedio y recalcula los precios según los márgenes configurados.

El conteo guarda fecha, responsable, cantidad anterior, reservas, costo anterior y cantidad física. Si cambia el stock mientras el formulario está abierto, se rechaza el guardado y se pide revisar la ficha actualizada. No permite registrar menos unidades que las reservadas ni aplicar dos veces un conteo inicial. Las correcciones posteriores se gestionan con ajustes, preservando el registro inicial.

Cuando hay diferencia frente al saldo del sistema, se crea un movimiento por esa diferencia y se vincula al conteo. Un conteo en cero o sin diferencia también queda registrado, aunque no necesite un movimiento de stock. Las piezas manuales usadas antes de contar se concilian como **ya consideradas en el conteo físico** para no volver a descontarlas.

## Actualización

Aplicar las migraciones antes de desplegar el frontend actualizado:

```sh
docker compose run --rm backend python manage.py migrate
```

La migración del conteo agrega su registro sin borrar productos ni modificar cantidades existentes. El conteo empieza pendiente para cada producto. La sincronización del catálogo válido hacia el servidor requiere identificar primero su conexión y resolver las referencias de sus registros duplicados.
