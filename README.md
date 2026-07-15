# Vínculo 🗞️

Red social privada para compartir **fotos, mensajes y referencias** entre amigos.
Sin enlaces, sin ruido: lo que se comparte se cuenta con palabras propias. Y cada
mes, la red genera automáticamente una **revista en PDF lista para imprimir** con
los recuerdos de tu círculo.

## Características

- **Cuentas y amistades**: registro, inicio de sesión y sistema de solicitudes de
  amistad. Solo ves las publicaciones de tu círculo (tú + amistades aceptadas).
- **Tres tipos de publicación**:
  - ✏️ **Mensajes** de texto.
  - 📷 **Fotos** (JPEG/PNG, hasta 8 MB) con pie de foto opcional, visibles solo
    para el círculo de quien las publica.
  - ⭐ **Referencias**: recomendaciones de libros, películas, música, lugares u
    otras cosas, con título, detalle y motivo.
- **Prohibido compartir enlaces**: el servidor rechaza cualquier publicación que
  contenga URLs, dominios, IPs o intentos de disimularlos («ejemplo (punto) com»,
  «w w w . ejemplo . es», `mailto:`, etc.). Ver `src/linkGuard.js`.
- **Revista mensual en PDF** 🖨️: al terminar cada mes, un planificador genera
  automáticamente para cada usuario una revista A4 imprimible con las fotos,
  mensajes y referencias de su círculo (portada, maquetación por tipo de
  publicación y numeración de páginas). También puede generarse bajo demanda
  desde la pestaña «Revistas».

## Ejecutar

```bash
npm install
npm start          # http://localhost:3000  (o PORT=xxxx npm start)
```

Los datos (base de datos SQLite, fotos y revistas) se guardan en `./data/`
(configurable con `VINCULO_DATA_DIR`).

## Probar

```bash
npm test
```

La prueba de humo levanta el servidor con una base de datos temporal y recorre el
flujo completo: registro, amistad, publicaciones de los tres tipos, bloqueo de
enlaces, privacidad del círculo y generación/descarga de la revista PDF.

## Arquitectura

| Ruta | Descripción |
| --- | --- |
| `server.js` | Servidor Express con la API REST y el servido del frontend |
| `src/db.js` | Esquema SQLite (usuarios, sesiones, amistades, posts, revistas) |
| `src/auth.js` | Contraseñas con scrypt y sesiones con token Bearer |
| `src/linkGuard.js` | Detección y rechazo de enlaces en todo texto de usuario |
| `src/magazine.js` | Generación de la revista PDF (pdfkit) y planificador mensual |
| `public/` | Frontend en HTML/CSS/JS vanilla, sin dependencias |
| `test/smoke.js` | Prueba de humo de extremo a extremo |

### API principal

```
POST   /api/register | /api/login | /api/logout
GET    /api/me
GET    /api/friends
POST   /api/friends/request | /api/friends/:id/accept
DELETE /api/friends/:id
GET    /api/feed
POST   /api/posts                (multipart: type, text, photo, refKind, refTitle, refDetail)
DELETE /api/posts/:id
GET    /api/photos/:filename     (solo para el círculo)
GET    /api/magazines
POST   /api/magazines/generate   ({year, month} opcional; por defecto, el mes en curso)
GET    /api/magazines/:id/pdf
```
