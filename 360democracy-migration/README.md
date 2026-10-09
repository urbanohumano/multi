# 360 Democracy: kit de migración de Circle a HumHub

Utillaje para sacar la comunidad 360 Democracy de Circle y montarla en **HumHub** en
`https://community.360democracy.com`, sobre el VPS de Gandi de Demsoc (demsoc-website-vps,
V-R4, París SD6, `ssh ubuntu@92.243.24.195`).

| Pieza | Archivo | Estado |
| --- | --- | --- |
| Copia de la web antigua de Demsoc que estaba en el VPS | `server/backup_old_site.sh` | Probado con una web WordPress y MariaDB de prueba |
| Chequeo previo del servidor, sin cambiar nada | `server/preflight.sh` | Probado en Ubuntu 24.04 |
| Instalar y configurar HumHub 1.18 | `humhub/install_humhub.sh` | Instalación completa probada en Ubuntu 24.04 con el paquete oficial 1.18.6; falta la ejecución en el VPS |
| Convertir el export oficial de Circle (4 CSV) | `convert_circle_export.py`, `html_to_markdown.py` | Probado con datos sintéticos; sirve para cualquier destino |
| Importar en HumHub | Pendiente | Viable con el módulo REST de HumHub (ver abajo) |
| Discourse (alternativa descartada) | `discourse/`, `create_events.py`, `listmonk/` | Se conserva como referencia; no se usa |

Pruebas: `python3 -m unittest discover -s tests` (Python 3.10+, sin dependencias).

## 0. Antes de empezar

1. **DNS.** En el gestor del dominio 360democracy.com, crea `community` con registro A a
   `92.243.24.195` y AAAA a `2001:4b98:dc0:43:f816:3eff:fe3a:6262`. Sin esto no hay HTTPS.
2. **Snapshot manual del volumen** en el panel de Gandi (pestaña Volumes del servidor).
3. **Copia de la web antigua** en tu ordenador (paso 1). La web ya vive en Hostinger, pero lo que
   queda en este VPS es la única copia de la versión antigua.

Todo lo que sigue se ejecuta en el VPS:

```bash
ssh ubuntu@92.243.24.195
sudo -i
git clone --depth 1 -b ccr-c3c09a07-pnpvkb https://github.com/urbanohumano/multi.git /opt/kit
cd /opt/kit/360democracy-migration
```

## 1. Guardar la web antigua

```bash
bash server/backup_old_site.sh
```

No para ni cambia nada. Deja en `/home/ubuntu/` un `demsoc-web-<servidor>-<fecha>.tar.gz` y su
`.sha256` con:

- los ficheros de la web (las carpetas que sirven nginx o Apache, y `/var/www`, `/srv`, `/home`, `/opt`);
- un volcado SQL por base de datos MySQL/MariaDB y de PostgreSQL, también si corren en Docker;
- la configuración de nginx o Apache, PHP, MySQL, cron y systemd;
- `backup-info/INVENTORY.txt` con lo que corría (versiones, servicios, dominios y fechas de los
  certificados) y `README-RESTORE.txt` con cómo restaurarla.

Quedan fuera a propósito las claves SSH, las claves privadas TLS y los historiales.

Desde **tu ordenador** (macOS, Linux o PowerShell en Windows), en una terminal nueva:

```bash
scp 'ubuntu@92.243.24.195:/home/ubuntu/demsoc-web-*.tar.gz*' .
shasum -a 256 -c demsoc-web-*.tar.gz.sha256        # Windows: Get-FileHash <archivo>
```

Si el disco del VPS no tiene sitio para el archivo, en macOS o Linux se puede descargar directamente:

```bash
ssh ubuntu@92.243.24.195 'sudo bash /opt/kit/360democracy-migration/server/backup_old_site.sh --stdout' > demsoc-web-antigua.tar.gz
```

El archivo puede contener datos personales (usuarios, formularios, suscriptores): guárdalo cifrado
en el almacenamiento de Demsoc y bórralo del portátil cuando ya no haga falta.

## 2. Chequeo previo

```bash
bash server/preflight.sh | tee /root/preflight.txt
```

Comprueba sistema operativo (HumHub 1.18 necesita PHP 8.2 a 8.4 y MariaDB 10.11 o superior, es
decir Ubuntu 24.04 o Debian 12), memoria, disco, lo que ya sirve nginx o Apache, acceso a
download.humhub.com y al marketplace, y si el DNS del subdominio apunta al servidor. Termina en
`READY` o `NOT READY`.

## 3. Instalar HumHub

```bash
export ADMIN_EMAIL=domenico.ds@demsoc.eu
# Cuando exista la cuenta de correo europea (Brevo o Scaleway TEM); sin esto, el correo se guarda en archivos:
# export SMTP_HOST=smtp-relay.brevo.com SMTP_PORT=587 SMTP_USER='login' SMTP_PASSWORD='clave-smtp'
# export SYSTEM_EMAIL=noreply@360democracy.com     # remitente verificado en el proveedor
bash humhub/install_humhub.sh 2>&1 | tee /root/install-humhub.txt
```

Qué hace, en orden:

1. Comprueba sistema, disco y que los puertos 80 y 443 los use nginx o Apache, y añade 2 GB de swap si no hay.
2. Instala PHP-FPM con las extensiones de HumHub y MariaDB si no hay una base de datos reciente.
3. Crea la base de datos `humhub` con un usuario y contraseña propios.
4. Descarga HumHub 1.18.6 de download.humhub.com en `/var/www/humhub` y lo instala por consola,
   sin asistente web.
5. Aplica los ajustes de 360 Democracy:
    - comunidad privada, sin registro abierto y solo por invitación de los miembros;
    - resumen semanal por correo, hora de Bruselas e inglés;
    - URLs limpias y modo producción.
6. Instala y activa los módulos Calendar (eventos con RSVP), Messenger (mensajes privados), Polls y REST.
7. Programa las tareas de HumHub en `/etc/cron.d/humhub`.
8. Añade un sitio para `community.360democracy.com` en nginx (o Apache con `WEB_SERVER=apache`),
   sin tocar los demás sitios: si el test de configuración falla, lo retira.
9. Pide el certificado HTTPS con certbot si el DNS ya apunta al servidor, y comprueba que la web responde.

Las contraseñas generadas (base de datos y admin) quedan en `/root/humhub-credentials.txt`. Entra
como `admin`, cambia la contraseña y añade un segundo administrador.

Se puede volver a ejecutar sin riesgo: no reinstala, solo vuelve a aplicar ajustes, módulos, cron y
sitio. Así se añade el correo más adelante: se exportan las variables `SMTP_*` y se repite el comando.
`DRY_RUN=1 bash humhub/install_humhub.sh` enseña antes los archivos de configuración que va a escribir.

Si el marketplace no responde, los módulos se instalan después desde Administración → Módulos.

### Marcha atrás

```bash
rm /etc/nginx/sites-enabled/humhub-community.360democracy.com.conf && nginx -t && systemctl reload nginx
rm /etc/cron.d/humhub
mysql -e 'DROP DATABASE humhub; DROP USER humhub@localhost;'
rm -rf /var/www/humhub /root/humhub-credentials.txt
certbot delete --cert-name community.360democracy.com
```

Si algo más fallara, el snapshot de Gandi restaura el servidor entero.

## 4. Migrar los datos de Circle

`convert_circle_export.py` convierte los cuatro CSV del export oficial de Circle en usuarios,
espacios, publicaciones y comentarios normalizados (cuerpos en Markdown, hilos, informe de lo que no
casa). Es independiente de la plataforma de destino:

```bash
python3 convert_circle_export.py export_circle/ import/
```

El importador para HumHub está pendiente. Es viable con el módulo REST que instala el script:
crea usuarios, espacios, membresías, posts y comentarios, y permite a un admin **suplantar** a cada
usuario (`POST /api/v1/auth/impersonate`), de modo que cada post y comentario queda a nombre de su
autor original. Las fechas originales requieren un ajuste posterior en la base de datos.

## Qué está probado

- La instalación completa en un Ubuntu 24.04 limpio con el paquete de HumHub 1.18.6: 206
  migraciones, admin creado, inicio de sesión y panel de administración, rutas sensibles en 403,
  tareas `cron/run` y `queue/run`, y otra web en el mismo nginx sin cambios.
- La repetición del script (idempotencia) y las 29 pruebas automáticas.
- La copia de la web antigua con una web WordPress y MariaDB de prueba.

Sin probar aquí: la descarga desde download.humhub.com, la instalación de módulos desde el
marketplace, certbot y el correo real, porque este entorno no llega a esos servicios.
