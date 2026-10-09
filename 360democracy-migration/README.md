# 360 Democracy: kit de migración de Circle a Discourse

Primer prototipo del utillaje descrito en el handover del proyecto. Cubre las cuatro piezas
que la migración necesita y que no vienen hechas con Discourse:

| Pieza | Archivo | Estado |
| --- | --- | --- |
| Convertir el export oficial de Circle (4 CSV) al formato de importación | `convert_circle_export.py`, `html_to_markdown.py` | Probado con datos sintéticos (`tests/`) |
| Importar usuarios, categorías, temas y respuestas en Discourse | `discourse/circle.rb` | Sintaxis validada; pendiente de ejecutar en la instancia piloto |
| Instalar Discourse en el VPS y aplicar los ajustes de la comunidad | `discourse/install_discourse.sh`, `discourse/app.yml.example`, `discourse/site_settings.rb` | Sintaxis validada; pendiente de ejecutar en el VPS |
| Recrear los eventos futuros con RSVP | `create_events.py`, `discourse/events.sample.csv` | Probado en modo `--dry-run` |
| Broadcasts sin Brevo (opcional) | `listmonk/docker-compose.yml` | Plantilla |

Requisitos: Python 3.10+ sin dependencias externas; en el servidor, Ubuntu 22.04/24.04 o
Debian 12 con acceso root.

## 1. Convertir el export de Circle

Circle envía Members, Spaces, Posts y Comments como CSV. Guárdalos como
`members.csv`, `spaces.csv`, `posts.csv` y `comments.csv` en una carpeta y ejecuta:

```bash
python3 convert_circle_export.py export_circle/ import_discourse/
```

Las columnas se detectan por nombre (`Email`, `Joined At`, `Space ID`, `Body`...). Si una no
se reconoce, el script lo dice y se fuerza con `--map`, por ejemplo
`--map members.email="Email Address"`. El resultado es:

- `users.csv`, `emails.csv`: un usuario por correo (los duplicados se unifican), con nombre de
  usuario válido para Discourse y las etiquetas de Circle.
- `categories.csv`: cada grupo de espacios es una categoría padre; cada espacio, una categoría.
  Los espacios privados quedan restringidos.
- `topics.csv`: un tema por post, con el cuerpo convertido a Markdown desde HTML o TipTap.
- `replies.csv`: un mensaje por comentario, conservando autor, fecha y a quién responde.
- `report.json`: recuentos y todo lo que no casó (posts sin autor, comentarios huérfanos...).

Prueba con los datos de muestra:

```bash
python3 convert_circle_export.py samples/circle_export /tmp/import_demo
python3 -m unittest discover -s tests
```

## 2. Instalar Discourse en el VPS

En el VPS (Gandi V-R4 o superior; en Gandi hay que abrir los puertos 22, 80 y 443 en el
grupo de seguridad del panel), con el subdominio ya apuntando a la IP:

```bash
git clone --depth 1 -b ccr-c3c09a07-pnpvkb https://github.com/urbanohumano/multi.git /opt/kit
cd /opt/kit/360democracy-migration/discourse
export DISCOURSE_HOSTNAME=community.example.org ADMIN_EMAILS=admin@example.org
export SMTP_HOST=smtp-relay.brevo.com SMTP_PORT=587 SMTP_USER='login' SMTP_PASSWORD='clave'
bash install_discourse.sh
```

Sin `SMTP_HOST` el script instala con un SMTP de relleno: la web funciona, el admin se crea con
`./launcher enter app && rake admin:create`, y el correo se añade después en
`/var/discourse/containers/app.yml` seguido de `./launcher rebuild app`.

Después, los ajustes de la comunidad (privada, invitaciones, resúmenes semanales, chat,
eventos, avatares locales, backups a S3):

```bash
cd /var/discourse && ./launcher enter app
cd /var/www/discourse && su discourse -c 'bundle exec rails runner /shared/import/site_settings.rb'
```

Las credenciales del bucket de backups se pasan como variables `BACKUP_S3_*` antes de ejecutarlo.

## 3. Importar

Copia la carpeta `import_discourse/` a `/var/discourse/shared/standalone/import/circle` y:

```bash
cd /var/discourse && ./launcher enter app
cp /shared/import/circle.rb /var/www/discourse/script/import_scripts/circle.rb
cd /var/www/discourse
su discourse -c 'CIRCLE_IMPORT_DIR=/shared/import/circle bundle exec ruby script/import_scripts/circle.rb'
```

El importador recuerda lo ya importado: volver a ejecutarlo con un export nuevo solo añade lo
que falta (el "delta" antes del corte).

## 4. Recrear los eventos

```bash
python3 create_events.py discourse/events.sample.csv --dry-run
python3 create_events.py eventos.csv --site https://community.example.org --api-key "$KEY" --api-user system
```

Cada fila crea un tema con un bloque `[event]` del plugin de eventos incluido en Discourse:
RSVP, archivo .ics y recordatorios. El enlace de Zoom va en `url` y solo lo ven quienes
pueden ver el tema.

## Qué falta para que sea producción

- Ejecutar `install_discourse.sh` y `circle.rb` en la instancia piloto y corregir lo que aparezca.
- Confirmar los nombres reales de las columnas del export de Circle y ajustar `CANDIDATES`.
- Reescribir las URLs de imágenes de Circle si `download_remote_images_to_local` no las copia.
- Mover este kit a un repositorio de Demsoc.
