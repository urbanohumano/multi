# Instalar en un VPS de Hostinger con correo por Resend

Resultado final:

```
https://moscosos.tudominio.org ──► Caddy (HTTPS automático) ──► Docents en Lluita (Node 22, systemd)
                                                                   │
                                                                   └──► Resend (API HTTPS) ──► buzones @edu.gva.es
```

Todo lo hace `deploy/instalar.sh`: instala Node.js 22 y Caddy, crea el servicio,
pide el certificado HTTPS, configura Resend, abre solo los puertos necesarios y
programa una copia de seguridad diaria. Tú solo tienes que preparar el VPS, el DNS
y Resend (pasos 1 a 3) y responder 5 preguntas (paso 4).

## 1. El VPS

- En **hPanel → VPS → Gestionar → Sistema operativo y panel**, elige
  **Ubuntu 24.04** sin panel (también vale 22.04).
  ⚠️ Cambiar el sistema operativo **borra todo** lo que haya en el VPS.
- Si en ese VPS ya hay otras webs con nginx, Apache o un panel (CloudPanel,
  CyberPanel…), los puertos 80/443 estarán ocupados y el instalador se parará
  avisándote. En ese caso lo más sencillo es otro VPS o hablarlo antes.
- Apunta la **IP** del VPS (está en la página de resumen del VPS en hPanel).
- Si has activado el **cortafuegos de Hostinger** (hPanel → VPS → Seguridad →
  Cortafuegos), añade reglas que acepten **TCP 80 y 443**. El instalador ya
  configura el cortafuegos interno de Ubuntu (ufw).

## 2. El dominio

**Recomendación: un dominio propio solo para esto**, con el nombre del colectivo,
por ejemplo `docentsenlluita.org`, con la web en `moscosos.docentsenlluita.org` (o en la raíz).

- Los correos de la plataforma no se mezclan con tus otros proyectos: si algún
  filtro de la Conselleria marca los envíos como masivos, no arrastra la
  reputación de tus otros dominios (ni al revés).
- No vincula la protesta con tus otras webs ni con tu nombre.
- El profesorado ve un remitente que reconoce: `Docents en Lluita <moscosos@docentsenlluita.org>`.

Se compra en hPanel → Dominios (unos 10–15 € al año para un `.org`).
Comprueba allí si está libre; si no, prueba `docentsenlluita.cat` o `docentsenlluita.com`.

Alternativa gratis e inmediata: un subdominio de un dominio que ya tengas
verificado en Resend (p. ej. `moscosos.otrodominio.com` y remitente
`moscosos@otrodominio.com`). Funciona, pero mezcla la protesta con ese proyecto.

**Registro DNS de la web.** En hPanel → Dominios → tu dominio → **DNS / Nameservers**
→ Añadir registro:

| Tipo | Nombre | Apunta a | TTL |
| --- | --- | --- | --- |
| A | `moscosos` (o `@` si la web va en la raíz) | la IP del VPS | 300 |

Si el dominio no está en Hostinger, crea el mismo registro en tu proveedor.

## 3. Resend

1. **Dominio de envío** (si es un dominio nuevo): Resend → **Domains → Add domain**,
   región **eu-west-1 (Irlanda)** como tus otros dominios. Resend te da unos
   registros DNS (TXT de DKIM `resend._domainkey`, y MX + TXT de SPF en `send`):
   añádelos en la misma zona DNS de Hostinger y pulsa **Verify**. Tu plan admite
   10 dominios y usas 7.
   Muy recomendable añadir también DMARC: registro TXT `_dmarc` con
   `v=DMARC1; p=none;` — ayuda a que no acabe en spam.
2. **API key**: Resend → **API Keys → Create API key**
   - Nombre: `docents-en-lluita VPS`
   - Permiso: **Sending access** (solo enviar)
   - Dominio: el del remitente
   Copia la clave (`re_…`): solo se muestra una vez. No la pegues en chats ni la subas a GitHub.

**¿Llega el plan?** Tu cuenta tiene 50.000 correos al mes y 10 envíos por segundo.
Un miércoles con las tres provincias llenas son unos 300 códigos de acceso +
300 confirmaciones + 300 convocatorias ≈ 1.000 correos, unos 4.000 al mes. El
límite por segundo es de toda la cuenta (lo comparten tus otros proyectos), así
que la plataforma envía como mucho 4 por segundo (`RESEND_MAX_PER_SECOND`) y, si
Resend pide frenar, espera y reintenta sin duplicar correos.

## 4. Instalar

Entra en el VPS por SSH (o con el **Terminal del navegador** de hPanel):

```bash
ssh root@IP_DEL_VPS
```

y ejecuta:

```bash
apt-get update && apt-get install -y git
git clone -b ccr-5f6b5cac-fgv106 https://github.com/urbanohumano/multi.git /root/multi
bash /root/multi/docents-en-lluita/deploy/instalar.sh
```

(Cuando el código esté en la rama principal, sobra el `-b ccr-5f6b5cac-fgv106`.)

El instalador te preguntará:

| Pregunta | Ejemplo |
| --- | --- |
| Dominio de la web | `moscosos.docentsenlluita.org` |
| Correo(s) de la organización | `persona1@edu.gva.es,persona2@gmail.com` |
| Correo de contacto (recibe las respuestas) | `organitzacio@docentsenlluita.org` |
| API key de Resend | `re_…` (no se ve al escribirla) |
| Remitente | `moscosos@docentsenlluita.org` |

Tarda unos minutos. Al final te ofrece mandar un **correo de prueba** al primer
correo de la organización.

## 5. Comprobar

1. Abre `https://moscosos.tudominio.org`: deben salir las jornadas de los miércoles.
2. Pulsa **Entrar** con tu correo de organización, introduce el código que te
   llega y verás la pestaña **Organización**.
3. Si la web no carga con HTTPS, casi siempre es el DNS, que aún no apunta al
   VPS (puede tardar unos minutos). Caddy reintenta solo; para ver qué pasa:
   `journalctl -u caddy -n 50`.

## Día a día

En el VPS tienes el comando `docents-en-lluita`:

| Orden | Para qué |
| --- | --- |
| `docents-en-lluita estado` | ¿Está todo funcionando? |
| `docents-en-lluita logs` | Ver lo que pasa en directo |
| `docents-en-lluita probar-correo tu@correo` | Comprobar el envío por Resend |
| `docents-en-lluita configurar` | Cambiar configuración (p. ej. `WEEKDAYS=1,2,3,4,5` para toda la semana) |
| `docents-en-lluita reiniciar` | Reiniciar la aplicación |
| `docents-en-lluita copia` | Hacer ahora una copia de la base de datos |
| `docents-en-lluita actualizar` | Bajar la última versión de GitHub e instalarla |

Dónde está cada cosa:

| Ruta | Contenido |
| --- | --- |
| `/etc/docents-en-lluita/env` | Configuración (incluye la API key: solo la lee root y el servicio) |
| `/var/lib/docents-en-lluita/` | Base de datos y autorizaciones subidas |
| `/var/lib/docents-en-lluita/copias/` | Copias diarias de la base de datos (se guardan 14) |
| `/opt/docents-en-lluita/` | Código de la aplicación |
| `/etc/caddy/sites/docents-en-lluita.caddy` | Configuración de la web en Caddy |

Para bajarte una copia a tu ordenador:
`scp root@IP_DEL_VPS:/var/lib/docents-en-lluita/copias/*.db .`
Hostinger también permite hacer instantáneas del VPS desde hPanel.

## Problemas frecuentes

- **El correo de prueba falla con un 403 que dice que el dominio no está
  verificado**: el dominio del remitente no está verificado en Resend o la API key
  está limitada a otro dominio. Corrige con `docents-en-lluita configurar`.
- **Falla con 401**: la API key está mal copiada o se ha borrado en Resend.
- **Los correos llegan a spam en @edu.gva.es**: añade DMARC (paso 3), envía una
  prueba a tu buzón corporativo y márcalo como «no es spam»; pide al profesorado
  que añada el remitente a sus contactos.
- **«Otro programa usa los puertos 80/443»**: el VPS tiene un panel o servidor web
  instalado (ver paso 1).
- **Cambiar de dominio**: crea el nuevo registro DNS y ejecuta
  `bash /root/multi/docents-en-lluita/deploy/instalar.sh --reconfigurar`.
