# 360 Democracy: kit de migración de Circle a Discourse

Utillaje para sacar la comunidad 360 Democracy de Circle y montarla en Discourse sobre el VPS
de Gandi de Demsoc. Ver el handover del proyecto para decisiones, calendario y riesgos.

| Pieza | Archivo | Estado |
| --- | --- | --- |
| Chequeo previo del servidor, sin cambiar nada | `discourse/preflight.sh` | Probado en Ubuntu 24.04 |
| Instalar Discourse, solo o junto a una web existente | `discourse/install_discourse.sh` | Configuración generada probada con nginx y Apache; falta la primera ejecución real |
| Ajustes de la comunidad | `discourse/site_settings.rb` | Sintaxis validada |
| Convertir el export oficial de Circle (4 CSV) | `convert_circle_export.py`, `html_to_markdown.py` | Probado con datos sintéticos |
| Importar usuarios, categorías, temas y respuestas | `discourse/circle.rb` | Sintaxis validada; pendiente de ejecutar en la instancia piloto |
| Recrear los eventos futuros con RSVP | `create_events.py`, `discourse/events.sample.csv` | Probado en modo `--dry-run` |
| Broadcasts sin Brevo (opcional) | `listmonk/docker-compose.yml` | Plantilla |

Pruebas: `python3 -m unittest discover -s tests` (Python 3.10+, sin dependencias).

## 1. Instalar en el VPS de Gandi (demsoc-website-vps)

Servidor: V-R4 (2 CPU, 4 GB, 25 GB), París SD6, `ssh ubuntu@92.243.24.195`, IPv6
`2001:4b98:dc0:43:f816:3eff:fe3a:6262`. Por su nombre, ese VPS ya sirve la web de Demsoc. El
instalador lo detecta (puertos 80 y 443 ocupados) y entra en **modo socketed**: Discourse escucha
en un socket local y el nginx o Apache que ya sirve la web le pasa solo el subdominio de la
comunidad. La web no se toca: se añade un archivo de vhost nuevo y el servidor web solo se recarga
si su test de configuración pasa.

### Antes de empezar

1. **Snapshot manual del volumen** en el panel de Gandi (pestaña Volumes del servidor). Es la vuelta
   atrás si algo sale mal en la web.
2. **Avisar a quien mantiene la web.** En el llavero SSH hay una segunda clave («vStorm»); si es
   la agencia de la web, conviene que sepa que se instala Docker y un vhost nuevo.
3. **DNS del subdominio** (por ejemplo `community.360democracy.eu`): registro A a `92.243.24.195` y
   AAAA a `2001:4b98:dc0:43:f816:3eff:fe3a:6262`. Sin esto no hay certificado HTTPS.
4. **Hacerlo fuera de horario.** La construcción de la imagen tarda de 10 a 20 minutos y usa CPU y
   memoria del mismo servidor que la web.

### Chequeo previo (no cambia nada)

```bash
ssh ubuntu@92.243.24.195
sudo -i
git clone --depth 1 -b ccr-c3c09a07-pnpvkb https://github.com/urbanohumano/multi.git /opt/kit
cd /opt/kit/360democracy-migration/discourse
DISCOURSE_HOSTNAME=community.360democracy.eu bash preflight.sh | tee /root/preflight.txt
```

Termina en `READY` o `NOT READY`. Lo más probable en este servidor es un aviso de disco: con 25 GB
compartidos con la web, conviene ampliar el volumen a 50 GB en el panel de Gandi antes de importar
los datos de Circle.

### Instalación

```bash
export DISCOURSE_HOSTNAME=community.360democracy.eu
export ADMIN_EMAILS=domenico.ds@demsoc.eu
# Cuando exista la cuenta de correo europea (si no, se instala sin correo y se añade después):
# export SMTP_HOST=smtp-relay.brevo.com SMTP_PORT=587 SMTP_USER='login' SMTP_PASSWORD='clave-smtp'
bash install_discourse.sh 2>&1 | tee /root/install-discourse.txt
```

El script añade 2 GB de swap si no hay, instala Docker si falta, construye Discourse, crea el vhost
del subdominio, pide el certificado con certbot y comprueba que la web responde a través del proxy.
`DRY_RUN=1 bash install_discourse.sh` enseña antes la configuración que va a generar, en `./render`.

### Primer admin y ajustes

```bash
cd /var/discourse && ./launcher enter app
rake admin:create                       # crea el admin sin necesitar correo
cd /var/www/discourse && su discourse -c 'bundle exec rails runner /shared/import/site_settings.rb'
exit
```

Para los backups diarios fuera del VPS, exporta `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`,
`BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY` y `BACKUP_S3_SECRET_KEY` antes de `site_settings.rb`.

Cuando haya proveedor de correo: rellenar las líneas `DISCOURSE_SMTP_*` de
`/var/discourse/containers/app.yml`, `./launcher rebuild app`, y enviar un correo de prueba desde
Admin → Email a Gmail, Outlook y Proton.

### Marcha atrás

Quita Discourse sin tocar la web:

```bash
cd /var/discourse && ./launcher destroy app
rm /etc/nginx/sites-enabled/discourse-community.360democracy.eu.conf \
   /etc/nginx/sites-available/discourse-community.360democracy.eu.conf
nginx -t && systemctl reload nginx
certbot delete --cert-name community.360democracy.eu
```

Con Apache: `a2dissite discourse-<subdominio> && systemctl reload apache2`. Si algo más fallara,
el snapshot de Gandi restaura el servidor entero.

## 2. Convertir el export de Circle

Circle envía Members, Spaces, Posts y Comments como CSV. Guárdalos como `members.csv`,
`spaces.csv`, `posts.csv` y `comments.csv` en una carpeta y ejecuta:

```bash
python3 convert_circle_export.py export_circle/ import_discourse/
```

Las columnas se detectan por nombre; si una no se reconoce, el script lo dice y se fuerza con
`--map`, por ejemplo `--map members.email="Email Address"`. Salida: `users.csv`, `emails.csv`,
`categories.csv` (grupos de espacios como categorías padre, espacios privados restringidos),
`topics.csv` (cuerpos en Markdown desde HTML o TipTap), `replies.csv` (con hilos) y `report.json`
con recuentos y todo lo que no casó.

## 3. Importar

```bash
mkdir -p /var/discourse/shared/standalone/import/circle
# copiar ahí el contenido de import_discourse/
cd /var/discourse && ./launcher enter app
cp /shared/import/circle.rb /var/www/discourse/script/import_scripts/circle.rb
cd /var/www/discourse
su discourse -c 'CIRCLE_IMPORT_DIR=/shared/import/circle bundle exec ruby script/import_scripts/circle.rb'
```

Volver a ejecutarlo con un export nuevo solo añade lo que falta (el «delta» antes del corte).

## 4. Recrear los eventos

```bash
python3 create_events.py discourse/events.sample.csv --dry-run
python3 create_events.py eventos.csv --site https://community.360democracy.eu --api-key "$KEY" --api-user system
```

Cada fila crea un tema con un bloque `[event]` del plugin de eventos incluido en Discourse (RSVP,
.ics, recordatorios). El enlace de Zoom va en `url`.

## Qué falta para producción

- Primera ejecución de `install_discourse.sh` y `circle.rb` en el VPS, y corregir lo que aparezca.
- Confirmar los nombres reales de las columnas del export de Circle.
- Comprobar que `download_remote_images_to_local` copia las imágenes de Circle durante la importación.
- Mover este kit a un repositorio de Demsoc.
