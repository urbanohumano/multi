# Handover · Instalar Docents en Lluita en el VPS de Hostinger

Documento para continuar en una sesión de Claude Code **en el ordenador de la
persona usuaria**, que sí puede conectarse por SSH al VPS. La sesión anterior
corría en la nube y no podía: el entorno bloquea las conexiones salientes al
puerto 22 y también hPanel y la API de Hostinger.

## 1. Dónde está el código

- Repositorio público: `https://github.com/urbanohumano/multi`
- Rama: **`ccr-5f6b5cac-fgv106`** (aún no está en la rama principal).
- Proyecto: carpeta **`docents-en-lluita/`**. En la raíz del repo hay otro
  proyecto (Vínculo) que no tiene nada que ver: no lo toques.
- Documentación que ya existe:
  - `README.md`: qué hace la plataforma, configuración, API y arquitectura.
  - `DESPLIEGUE.md`: guía para personas de la instalación en Hostinger + Resend.
    Este handover la resume para un agente y añade el estado y lo pendiente.

## 2. Qué es (en dos líneas)

Plataforma para que el profesorado reserve sus días de libre disposición
(«moscosos») para manifestarse: 100 entradas gratuitas por jornada y provincia
(Alacant, Castelló, València), los miércoles; acceso con código al correo
`@edu.gva.es`; subida obligatoria de la autorización firmada; la organización
revisa y envía por correo el punto de encuentro (acto institucional o, si no hay,
la Direcció Territorial d'Educació, automáticamente el día anterior a las 18:00).

## 3. Decisiones ya tomadas (no reabrir)

| Tema | Decisión |
| --- | --- |
| Nombre | **Docents en Lluita** (plural: es el colectivo del sello del logo). «Docent en lluita · Curs 26/27» es el lema de la campaña. |
| Pila | Node.js 22 + Express + SQLite (better-sqlite3), frontend sin dependencias. |
| Servidor | Ubuntu 22.04/24.04 limpio, servicio systemd endurecido con usuario `docents`, Caddy delante con HTTPS automático, ufw. |
| Correo | **Resend por API HTTPS** (no SMTP), máximo 4 envíos/s (`RESEND_MAX_PER_SECOND`), reintentos con Idempotency-Key. |
| Jornadas | Solo miércoles (`WEEKDAYS=3`), 100 entradas por provincia, 4 semanas por adelantado. |
| Dominio | Recomendado uno propio, p. ej. `docentsenlluita.org` con la web en `moscosos.docentsenlluita.org` y remitente `moscosos@docentsenlluita.org`. **Todavía no está decidido ni comprado**: pregúntalo. |

## 4. Estado

Hecho y comprobado:

- Aplicación completa; `npm test` pasa (prueba de extremo a extremo + prueba de
  Resend contra una API simulada).
- Interfaz revisada en Chromium (móvil y escritorio).
- `deploy/instalar.sh` ejecutado dos veces en un contenedor Ubuntu 24.04 con
  `systemctl`, `apt-get` y `ufw` simulados. Comprobado:
  - permisos de configuración y datos;
  - la app corre como `docents` y escucha solo en 127.0.0.1;
  - `/api/salud` responde `{"ok":true,"correo":"resend"}`;
  - la configuración de Caddy es válida (con el binario real);
  - el correo de prueba y la copia de seguridad funcionan;
  - la segunda ejecución conserva la configuración.
- `shellcheck` sin avisos; `systemd-analyze verify` sin errores en las unidades.

**Sin probar todavía** (primera vez en real, vigílalo):

- systemd real con el endurecimiento de la unidad (`ProtectSystem=strict`,
  `PrivateDevices`, `UMask=0027`…).
- Instalación real de Node.js (NodeSource) y Caddy (repositorio de Cloudsmith).
- Certificado HTTPS real y envío real por Resend.

## 5. Lo que tiene que hacer la persona usuaria (pídeselo si falta)

1. **Dominio**: decidir y, si es nuevo, comprarlo (hPanel → Dominios).
2. **VPS**: Ubuntu 22.04/24.04 sin panel. Dar la **IP** y el puerto SSH. Comprobar
   que puedes entrar con `ssh root@IP`.
3. **DNS**: registro A `moscosos` (o `@`) → IP del VPS, TTL 300.
4. **Resend**:
   - añadir el dominio en la región eu-west-1, poner en el DNS los registros que da
     Resend (DKIM, SPF/MX de `send`, y mejor también DMARC `_dmarc` →
     `v=DMARC1; p=none;`) y verificarlo;
   - crear una API key con permiso **Sending access** limitada a ese dominio.
   Si en tu sesión está el conector de Resend, puedes hacerlo tú
   (crear dominio, consultar registros, crear clave), con su permiso.
5. **Correos de la organización** (`ADMIN_EMAILS`) y **correo de contacto**
   (recibe las respuestas).

## 6. Lo que tienes que hacer tú (agente)

1. **Antes de tocar nada**, inspecciona el VPS y cuéntale lo que hay. No borres
   ni pares servicios sin preguntar:
   ```bash
   ssh root@IP 'cat /etc/os-release | head -2; df -h /; free -h; ss -tlnp; systemctl list-units --type=service --state=running --no-pager | head -40'
   ```
   El instalador se para solo si los puertos 80/443 están ocupados por otro
   programa (nginx, Apache, un panel).
2. **Comprueba el DNS**: `dig +short moscosos.DOMINIO` debe dar la IP del VPS.
   Si aún no apunta, se puede instalar igual: Caddy pedirá el certificado cuando
   el DNS esté bien.
3. **Clona e instala.** Haz la instalación de forma interactiva (`ssh -t`) para
   que la persona escriba la API key ella misma y no quede en historiales ni en
   el chat:
   ```bash
   ssh root@IP 'apt-get update && apt-get install -y git && git clone -b ccr-5f6b5cac-fgv106 https://github.com/urbanohumano/multi.git /root/multi'
   ssh -t root@IP 'bash /root/multi/docents-en-lluita/deploy/instalar.sh'
   ```
   Preguntas del instalador:
   - dominio de la web;
   - correos de la organización;
   - correo de contacto;
   - API key de Resend (no se ve al escribirla);
   - remitente (por defecto `moscosos@<dominio sin el primer subdominio>`).

   Para una instalación desatendida, exporta antes `DOMINIO`, `ADMIN_EMAILS`,
   `CONTACT_EMAIL`, `RESEND_API_KEY` y `MAIL_FROM`.
4. **Verifica:**
   ```bash
   ssh root@IP 'docents-en-lluita estado'
   curl -sI https://moscosos.DOMINIO | head -1        # HTTP/2 200
   curl -s https://moscosos.DOMINIO/api/salud          # {"ok":true,"correo":"resend"}
   ssh root@IP 'docents-en-lluita probar-correo CORREO_DE_LA_ORGANIZACION'
   ```
   Pídele que entre en la web con su correo de organización y que confirme que
   recibe el código y ve la pestaña «Organización» con 12 jornadas (4 miércoles × 3
   provincias). Pídele también una prueba con un buzón `@edu.gva.es` real, y que
   mire si llega o va a spam.
5. **Cortafuegos de Hostinger**: si está activado en hPanel (VPS → Seguridad →
   Cortafuegos), debe aceptar TCP 80 y 443.
6. **Limpieza**: la sesión en la nube generó una clave SSH con el comentario
   `claude-instalacion-docents-en-lluita`. Si se llegó a añadir al VPS, quítala:
   ```bash
   ssh root@IP "sed -i '/claude-instalacion-docents-en-lluita/d' /root/.ssh/authorized_keys"
   ```
   Si se añadió en hPanel → Claves SSH, bórrala también de ahí.
7. Recomienda hacer una **instantánea del VPS** en hPanel cuando todo funcione.

## 7. Si algo falla

| Síntoma | Dónde mirar / qué hacer |
| --- | --- |
| La app no arranca | `journalctl -u docents-en-lluita -n 80`. Si es un error de permisos o de sistema de ficheros de solo lectura, revisa `ReadWritePaths` en `deploy/docents-en-lluita.service` (solo `/var/lib/docents-en-lluita` es escribible). |
| `npm ci` falla con better-sqlite3 | El instalador reintenta tras instalar `build-essential python3`. |
| Sin HTTPS | El DNS aún no apunta a la IP, o el cortafuegos de Hostinger bloquea 80/443. `journalctl -u caddy -n 50`. |
| «Otro programa usa los puertos 80/443» | El VPS tiene un panel o servidor web. Pregunta antes de pararlo. |
| Riesgo con SSH en un puerto no estándar | El instalador abre en ufw los puertos de `sshd -T` (22 si falla). Con dudas, `SIN_CORTAFUEGOS=1` y configura ufw a mano. |
| Correo de prueba: 403 «domain is not verified» | El dominio de `MAIL_FROM` no está verificado o la API key está limitada a otro dominio. `docents-en-lluita configurar`. |
| Correo de prueba: 401 | La API key está mal o se ha revocado. |
| Cambiar el dominio | Nuevo registro DNS y `bash /root/multi/docents-en-lluita/deploy/instalar.sh --reconfigurar`. |

Rutas en el servidor:

- `/etc/docents-en-lluita/env`: configuración y secretos, `640 root:docents`.
- `/var/lib/docents-en-lluita`: base de datos, autorizaciones y `copias/`.
- `/opt/docents-en-lluita`: código.
- `/etc/caddy/sites/docents-en-lluita.caddy`: sitio de Caddy.
- `/usr/local/bin/docents-en-lluita`: comando de administración.

## 8. Pendiente después de instalar (no bloquea)

- **Rama principal**: fusionar `ccr-5f6b5cac-fgv106` en la principal (o abrir un
  PR) cuando la persona lo pida. Después, en el VPS:
  `git -C /root/multi checkout main && git -C /root/multi pull`.
  `docents-en-lluita actualizar` hace `git pull --ff-only` de la rama que esté
  clonada y vuelve a ejecutar el instalador.
- **Logo**: la persona tiene la imagen del logo. Ponerla en `public/` y usarla en
  la cabecera en lugar del círculo «DL».
- **Valenciano**: interfaz en valenciano, con «dies de lliure disposició» como
  término principal en lugar de «moscosos».
- **Direcciones de las Direccions Territorials** (`src/config.js`, sacadas de la
  web de la Conselleria): confirmarlas antes de la primera jornada.
- Lista de espera cuando se agoten las entradas.

## 9. Mensaje para arrancar la sesión local

> Clona (o actualiza) https://github.com/urbanohumano/multi, cambia a la rama
> `ccr-5f6b5cac-fgv106`, lee `docents-en-lluita/HANDOVER.md` y sigue la sección 6
> para instalar Docents en Lluita en mi VPS de Hostinger. La IP es ___ y el dominio
> será ___. Antes de cambiar nada en el servidor, enséñame lo que hay.
