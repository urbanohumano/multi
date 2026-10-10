# Docent en Lluita · Moscosos ✊

Plataforma para que el profesorado organice sus **días de libre disposición
(moscosos)** y los use para manifestarse juntos. Funciona como una taquilla de
teatro: cada jornada tiene **100 entradas gratuitas por provincia** y las
disponibles se ven en directo.

## Cómo funciona

1. **Jornadas**: se crean solas para los **miércoles** de las próximas 4 semanas
   en **Alacant, Castelló y València** (configurable para añadir más días de la
   semana más adelante).
2. **Acceso con el correo corporativo**: solo se puede entrar con un correo
   `@edu.gva.es`. Se envía un código de 6 cifras al buzón; quien lo introduce
   demuestra que es suyo. No hay contraseñas.
3. **Reserva**: nombre, centro y **subida obligatoria de la autorización del día
   de permiso firmada por la dirección** (PDF, JPG o PNG; se comprueba el tipo
   real del archivo). Se asigna la primera localidad libre (nº 1 a 100) y llega
   una confirmación por correo con un código de entrada.
4. **Contra trolls**: una entrada por persona y jornada, ninguna persona puede
   estar en dos provincias el mismo día, la organización revisa cada
   autorización y puede **anularla** (la localidad vuelve a quedar libre y la
   persona recibe el motivo por correo).
5. **Punto de encuentro**: cuando se publica la agenda del President o de la
   Consellera (24–48 h antes), la organización apunta el acto en cada provincia y
   pulsa **«Enviar convocatoria»**: todas las personas inscritas reciben el lugar
   y la hora. Quien reserva después lo recibe directamente en la confirmación.
6. **Si no hay acto en una provincia**: a las 18:00 del día anterior la
   plataforma convoca automáticamente en la **Direcció Territorial d'Educació**
   de esa provincia y envía el correo.
7. **Asistencia**: el día de la jornada la organización puede marcar quién ha
   venido (y descargar el listado en CSV).
8. **Privacidad**: las autorizaciones solo las ve la organización, se borran al
   liberar la entrada y, como mucho, 30 días después de la jornada. El listado
   público solo muestra números de localidad, nunca nombres.

## Ponerlo en marcha

```bash
cd docent-en-lluita
npm install
ADMIN_EMAILS=tu-correo@edu.gva.es npm start   # http://localhost:3000
```

Sin servidor de correo configurado, la plataforma arranca en **modo de prueba**:
los correos (incluidos los códigos de acceso) se muestran en la consola y se
guardan en `data/outbox/`. Para producción copia `.env.example` a `.env`,
rellénalo y arranca con `npm run start:env`.

### Probar

```bash
npm test
```

La prueba de extremo a extremo usa una carpeta de datos temporal y recorre el
flujo completo: jornadas de los miércoles, acceso por código, reservas con
autorización, entradas agotadas, panel de organización, anulación,
convocatoria, aviso automático en la Direcció Territorial y borrado de
autorizaciones.

## Configuración

| Variable | Por defecto | Para qué sirve |
| --- | --- | --- |
| `PUBLIC_URL` | `http://localhost:3000` | Dirección pública, usada en los correos |
| `ADMIN_EMAILS` | — | Correos de la organización, separados por comas |
| `ALLOWED_EMAIL_DOMAIN` | `edu.gva.es` | Dominio obligatorio para reservar |
| `SEATS_PER_JORNADA` | `100` | Entradas por jornada y provincia |
| `WEEKDAYS` | `3` | Días con jornada (1 = lunes … 5 = viernes). Toda la semana: `1,2,3,4,5` |
| `WEEKS_AHEAD` | `4` | Semanas que se crean por adelantado |
| `FALLBACK_HOUR` | `18` | Hora del día anterior a la que se convoca en la DT si no hay acto |
| `DEFAULT_MEETING_TIME` | `11:00` | Hora por defecto de la concentración en la DT |
| `RETENTION_DAYS` | `30` | Días que se conservan las autorizaciones tras la jornada |
| `MAX_UPLOAD_MB` | `5` | Tamaño máximo de la autorización |
| `DT_ALACANT`, `DT_CASTELLO`, `DT_VALENCIA` | ver `src/config.js` | Dirección de cada Direcció Territorial |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | — | Correo saliente |
| `TRUST_PROXY` | — | Pon `1` si va detrás de un proxy inverso |
| `DATA_DIR` | `./data` | Base de datos SQLite, autorizaciones y bandeja de prueba |

Las direcciones de las Direcciones Territoriales que vienen por defecto
(C/ Carratalà 47 en Alacant, Av. del Mar 23 en Castelló y C/ Gregorio Gea 14 en
València) salen de la web de la Conselleria: confirmadlas antes de la primera
jornada. Desde el panel también se puede escribir cualquier otro lugar.

### Correo: importante para que llegue

Los correos van a buzones `@edu.gva.es`, que filtran el correo masivo. Usad un
proveedor SMTP con dominio propio verificado (SPF y DKIM), por ejemplo Brevo o
Resend, y un remitente reconocible. Probad primero con vuestros propios correos.
Tened en cuenta también que esos buzones los gestiona la Conselleria.

## Panel de organización

Entrando con un correo de `ADMIN_EMAILS` aparece la pestaña **Organización**:

- Listado de jornadas con entradas ocupadas, autorizaciones por revisar, punto
  de encuentro y estado de la convocatoria.
- Por jornada: punto de encuentro (acto institucional o Direcció Territorial),
  envío o reenvío de la convocatoria (los reenvíos llevan «[ACTUALIZACIÓN]» en el
  asunto), cambiar el aforo, cerrar o cancelar la jornada (se avisa a quien
  tenga entrada), ver cada autorización, validar o anular entradas, marcar
  asistencia y descargar el CSV.
- Crear jornadas sueltas (otro día, otra provincia, otro aforo) o generar las
  próximas según `WEEKDAYS`. Para quitar un miércoles festivo, cancélalo.

## Arquitectura

| Ruta | Descripción |
| --- | --- |
| `server.js` | Servidor Express: API REST y frontend |
| `src/config.js` | Configuración por variables de entorno y datos de las provincias |
| `src/db.js` | Esquema SQLite (docentes, códigos, sesiones, jornadas, reservas, correos) |
| `src/auth.js` | Acceso por código al correo y sesión en cookie HttpOnly |
| `src/jornadas.js` | Localidades, reservas, punto de encuentro, convocatoria y tareas programadas |
| `src/archivos.js` | Validación y almacenamiento de las autorizaciones |
| `src/mailer.js` | Envío por SMTP o bandeja local en modo de prueba |
| `src/dates.js` | Fechas en hora peninsular |
| `public/` | Frontend en HTML/CSS/JS sin dependencias, pensado para el móvil |
| `test/smoke.js` | Prueba de extremo a extremo |

### API

```
GET    /api/config
GET    /api/jornadas                         (público: entradas libres y localidades ocupadas)
POST   /api/acceso/codigo | /api/acceso/verificar | /api/acceso/salir
GET    /api/yo
GET    /api/mis-entradas
POST   /api/jornadas/:id/reservar            (multipart: nombre, centro, acepto, autorizacion)
DELETE /api/mis-entradas/:id                 (liberar la entrada)

GET    /api/admin/jornadas
POST   /api/admin/jornadas                   ({fecha, provincia, plazas})
POST   /api/admin/jornadas/generar
GET    /api/admin/jornadas/:id               (jornada + reservas)
PATCH  /api/admin/jornadas/:id               ({plazas?, estado?})
PUT    /api/admin/jornadas/:id/punto         ({tipo: acto|dt, titulo, lugar, hora, notas})
POST   /api/admin/jornadas/:id/convocatoria
GET    /api/admin/jornadas/:id/reservas.csv
POST   /api/admin/reservas/:id/validar | /rechazar ({motivo}) | /asistencia ({asistio})
GET    /api/admin/reservas/:id/autorizacion
```

## Ideas para más adelante

- Lista de espera automática cuando se agoten las entradas.
- Interfaz también en valenciano.
- Jornadas de lunes a viernes (`WEEKDAYS=1,2,3,4,5`) cuando haya gente suficiente.
