# Gastos de campo

El menú **Gastos de campo** registra costos y pagos del área de campo, separado del taller y las ventas de repuestos. Administradores y contabilidad registran datos y pagos; ventas consulta. Pilotos, técnicos, inventario y consulta no tienen acceso a esta información financiera.

## Pilotos

En **Gastos de campo → Pilotos → Registrar piloto** se registran nombre, teléfono opcional y tarifa por hectárea. Son personas de campo independientes: no requieren correo, contraseña ni cuenta de acceso. El formulario de trabajos permite asignar esos pilotos. Al cerrar un trabajo se registra automáticamente el costo: hectáreas reales por tarifa, redondeado a centavos por trabajo. Se conservan piloto, fecha de cierre, superficie y tarifa. Un cambio posterior de tarifa no modifica costos registrados.

Configurar una tarifa también incorpora trabajos ya cerrados de ese piloto que todavía no tengan costo, con la tarifa que se esté configurando. La pantalla lo indica antes de guardar. Trabajos sin piloto o tarifa aparecen en un aviso; se pueden asignar a un piloto con tarifa desde ese aviso. No se considera completa la rentabilidad mientras existan trabajos sin costo.

Seleccionar un piloto y los trabajos que se están pagando. La confirmación muestra persona, cantidad de registros e importe; exige fecha y método y permite referencia y notas. Cada liquidación corresponde a una persona. Una restricción única por trabajo y bloqueos de filas impiden pagos duplicados, incluso simultáneos. Los registros pagados se consultan en **Liquidaciones pagadas**, con sus trabajos y tarifas originales.

## Asistentes

Registrar el asistente y sus jornadas. Cada persona tiene una sola jornada por fecha. Base: $20 hasta las 16:00. Extra: $3 por hora desde las 16:00, proporcional a minutos; salida 18:30 equivale a $27.50. No se admiten jornadas futuras ni salida anterior a las 16:00 en este flujo de jornada completa. Las tarifas quedan guardadas en cada jornada.

Seleccionar una o varias jornadas de un mismo asistente y confirmar el pago. Jornadas pagadas no se editan ni eliminan.

## Gastos generales

Registrar fecha, categoría, concepto, importe, proveedor/beneficiario y referencia del comprobante. No se asignan a trabajos. Los gastos empiezan pendientes de pago; registrar el pago después con su fecha, método y referencia, incluso si se realiza el mismo día. La referencia de comprobante es textual; no se adjuntan archivos en esta versión.

Los repuestos se registran manualmente como costo de consumo: no volver a registrar la compra de la misma pieza como otro gasto de campo. Este registro no descuenta inventario automáticamente.

## Reportes y conservación

En **Reportes → Trabajos de campo → Costos y resultado** se muestran ingresos por trabajos realizados, costos de pilotos, asistentes y gastos generales, resultado operativo, cobros, pagos y pendientes. Los ingresos y costos de piloto usan fecha de cierre; asistentes y generales usan fecha de jornada/gasto. Cobros y pagos usan sus fechas respectivas: pagar un costo ya registrado no vuelve a descontarlo del resultado. Los pendientes corresponden a trabajos/costos originados en el período seleccionado y aún pendientes al momento de consultar; no son una reconstrucción histórica del saldo al cierre. Ver `FIELD_COLLECTIONS.md` para cuentas de campo y sincronización con facturas.

Los pagos son completos, sin anticipos ni pagos parciales por trabajo/jornada/gasto. Los registros pagados son inmutables y esta versión no incluye reversión de liquidaciones. Se guarda el usuario que confirma las liquidaciones. Cancelar un trabajo con piloto pagado se bloquea; cancelar uno sin pagar elimina su costo de piloto. Trabajos realizados no se borran.

Migraciones: `field_jobs.0007_field_operating_costs` y `0008_expense_payment_responsible`. Agregan tablas y el responsable del pago de gastos sin inventar tarifas, asistentes ni gastos. Respaldo local previo: `backups/before_field_costs_20261112.dump`.

La migración `field_jobs.0009` copia los pilotos anteriores a `FieldPilot`, conserva tarifas, trabajos y costos pagados, y retira la relación de los trabajos con usuarios. Las antiguas cuentas con rol `piloto` se desactivan, pierden su contraseña y quedan archivadas como consulta para conservar autores históricos. `users.0005` elimina ese rol de las opciones de cuentas. La migración de datos no tiene reversión automática; el respaldo previo es `backups/before_independent_pilots_20261112.dump`.
