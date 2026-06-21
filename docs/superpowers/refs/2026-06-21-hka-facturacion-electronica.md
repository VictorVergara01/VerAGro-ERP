# Referencia — Integración Factura Electrónica Panamá vía HKA (The Factory HKA)

**Fecha:** 2026-06-21
**Estado:** Investigación / pendiente. **Bloqueado** por prerrequisitos no técnicos (credenciales HKA, inscripción DGI, manual oficial). NO implementar hasta tenerlos.
**Doc oficial:** https://felwiki.thefactoryhka.com.pa/doku.php?id=start

Esta nota captura la investigación inicial para que, cuando el usuario consiga lo necesario,
se arranque el ciclo brainstorm → spec → plan sin volver a investigar desde cero.

---

## 1. Qué es y por qué HKA

- En Panamá, la **Factura Electrónica (FEL)** se transmite al **FEP de la DGI**
  (`dgi-fep-test.mef.gob.pa` en pruebas). Para emitir desde un sistema propio se requiere
  un **PAC autorizado** (Proveedor Autorizado de Calificación). **HKA es un PAC**.
- "Trabajar directo con DGI" = certificarse como facturador autorizado propio (proceso
  pesado). **Camino elegido: integrar con HKA** (estándar y práctico).

## 2. Modelo técnico (según el wiki)

- **API SOAP** (web services con sobre `soapenv`).
- **Operaciones principales** (cada una tiene su página en el wiki):
  - `Enviar` / `RecepcionFE` (`enviar`, `metodo_de_recepcionfe`) — emitir el documento.
    Request del FEP: `dVerForm` (versión), `dId` (id de transmisión), `iAmb` (ambiente:
    pruebas/producción), `xFe` (**XML firmado** de la factura).
    Response: `dCUFE` (**CUFE**, código único fiscal), `dProAut` (protocolo de
    autorización), `dFecProc`, `dCodRes` (código resultado), `dMsgRes` (mensaje).
  - `Anulacion` (`anulacion`) — anular un documento.
  - `EstadoDocumento` (`estadodocumento`) — consultar estado.
  - `FoliosRestantes` (`foliosrestantes`) — folios disponibles.
  - `DescargaXML` (`descargaxml`) — XML firmado.
  - `DescargaPDF` (`descargapdf`) — **CAFE** (PDF oficial con QR + CUFE).
  - Otros: `metodo_de_consultafe`, `metodo_de_recepcion_de_eventos`, `metodo_de_descarga_de_criterios`.
- **Ambientes:** pruebas (demo) y producción (se selecciona con `iAmb`).
- **Autenticación:** NO confirmada aún (token de empresa / usuario-clave). Está en el
  **"Manual de integración directa al WS"** (`manual_de_integracion_directa_al_ws`, y
  `ws_integration_manual_-_english_version`). **Confirmar al tener el manual.**
- **Ejemplos de código** en el wiki: Python (`lenguaje_python`), Java, PHP, C#, y
  colección **Postman**. Ejemplos de 17+ tipos de documento fiscal.

## 3. Impacto en el ERP (módulo `billing` actual)

`billing` ya tiene `Invoice` (número, líneas, cliente, totales, ITBMS) y PDF propio
(ReportLab). La capa fiscal añadiría:
- Al **emitir**: construir el documento HKA (emisor; receptor con **RUC/DV**; ítems con
  código/tasa **ITBMS**; totales), llamar a `Enviar`, guardar **CUFE**, estado fiscal y
  **CAFE**. Modelo nuevo tipo `FiscalDocument` o campos en `Invoice`
  (`cufe`, `fiscal_status`, `auth_protocol`, `cafe_pdf`).
- **Anulación** y notas de crédito/débito fiscales; reintentos; manejo de rechazos DGI.
- El **PDF oficial** pasa a ser el **CAFE** de HKA (QR + CUFE); el ReportLab actual queda
  como borrador interno o se retira.
- Cliente SOAP en Python: usar **`zeep`** (nueva dependencia) o armar el sobre a mano.
  Decidir en el diseño. Aislar todo en un app nuevo `apps/fiscal/` (o `apps/hka/`) que el
  `billing` invoca, para no acoplar.

## 4. Prerrequisitos NO de código (bloqueantes — conseguir antes de implementar)

- [ ] Inscripción de Veragro en **DGI para FEL** (RUC, sucursal, punto de facturación
      habilitados).
- [ ] **Contrato + credenciales HKA** (ambiente de pruebas primero).
- [ ] **Certificado digital / firma electrónica** (confirmar si HKA firma por la empresa o
      si Veragro provee el certificado).
- [ ] El **"Manual de integración directa al WS"** de HKA (para autenticación y el WSDL/URL
      exactos de pruebas y producción).
- [ ] Datos fiscales completos: clientes con RUC/cédula + DV; catálogo de productos con su
      tratamiento de ITBMS (7%, exento, etc.).

## 5. Cuando se retome

1. Conseguir credenciales de **pruebas** + manual → confirmar autenticación, WSDL/URLs y
   esquema del XML (`xFe`).
2. Brainstorm del alcance (qué tipos de documento, anulaciones, CAFE, flujo de reintentos).
3. Spec → plan → implementación contra el **ambiente de pruebas** antes de producción.
4. Es una feature grande y de peso regulatorio: tratarla como sub-proyecto propio.
