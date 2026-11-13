# Cobros y resultados de campo

Cada trabajo realizado tiene su propia cuenta, aunque no tenga factura. En **Cobros de campo** se consultan importe del servicio, abonos, saldo, vencimiento y días de atraso. Se puede buscar por trabajo, cliente o piloto y filtrar por estado y fecha de realización. Los trabajos programados y cancelados no forman parte de las cuentas por cobrar.

## Uso

1. Programar y cerrar el trabajo con sus cantidades reales.
2. Al cerrar se propone un vencimiento de 10 días desde la realización, como en el Excel. Se puede indicar otro vencimiento al cerrar o cambiarlo después desde **Cobros del trabajo**. Vaciarlo desde esa cuenta elimina la fecha acordada.
3. En el detalle del trabajo, **Registrar abono o cobro** guarda dinero recibido, fecha, método, referencia, notas y responsable. Se admiten varios abonos, sin superar el saldo. Esta versión registra cobros posteriores al cierre; no anticipos de trabajos programados ni devoluciones.
4. La factura es opcional. Al generarla, los abonos existentes quedan vinculados y su saldo coincide con el del trabajo. Un pago registrado desde la factura también aparece en el trabajo.

Solo administración y contabilidad registran cobros; ventas consulta las cuentas y puede acordar vencimientos. Los importes del servicio quedan fijados al cerrar: la factura vinculada conserva cliente, cantidades y precios de ese trabajo. Los cobros son inmutables y no se permite eliminar o cancelar un trabajo o factura que ya tenga cobros. Los reintentos del mismo registro conservan una clave de operación para evitar duplicados.

## Reportes

**Reportes → Trabajos de campo** contiene:

- **Actividad de campo:** trabajos programados/realizados, hectáreas y quintales.
- **Cobros y saldos:** cuentas por trabajo, sin depender de emitir factura.
- **Costos y resultado:** ingresos reconocidos al realizar el trabajo, menos costos de pilotos, jornadas de asistentes y gastos generales. Cobros y pagos usan su fecha real. El flujo neto de caja es cobrado menos pagado y no incorpora saldo inicial de caja/bancos.
- **Clientes y pilotos:** cantidad de trabajos, superficie, quintales, importe de servicios, cobros, saldo, costo de piloto y margen antes de asistentes y gastos generales. Los costos generales no se asignan artificialmente a clientes o pilotos. Los importes de estas tablas corresponden a los trabajos realizados en el período; sus cobros y saldos reflejan la situación actual de esos trabajos, no un saldo histórico reconstruido al cierre del período.

La fecha de realización determina el período de ingresos operativos, aunque la factura se emita después. Facturar o cobrar el trabajo no vuelve a sumar su ingreso. Los trabajos sin tarifa/costo de piloto se señalan como información incompleta. Facturas antiguas de tipo campo sin trabajo vinculado siguen en los totales con un aviso, pero no se asignan a pilotos.

La planilla del administrador y el fondo para comprar otro dron están fuera del alcance. El Excel `OPERACIONES_VERAGRO.xlsx` fue una referencia de funcionamiento: sus datos no se importaron por las diferencias de conciliación detectadas.

## Datos existentes

`field_jobs.0010_job_collections` agrega cuentas y cobros; copia los pagos previos vinculados a trabajos una sola vez, conservando fechas, referencias y responsables. Conserva el importe de una factura activa existente y su vencimiento. Si hay varias facturas activas por trabajo o cobros históricos no positivos, la migración se detiene para revisión. La migración de datos no tiene reversión automática. Respaldo previo local: `backups/before_field_collections_20261112.dump`.
