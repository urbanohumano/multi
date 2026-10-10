#!/usr/bin/env bash
#
# Instala (o actualiza) Docents en Lluita en un VPS con Ubuntu 22.04/24.04,
# por ejemplo un VPS de Hostinger:
#
#   - Node.js 22 y las dependencias de la aplicación
#   - servicio systemd «docents-en-lluita» (se reinicia solo y arranca con el servidor)
#   - Caddy delante, con HTTPS automático (Let's Encrypt)
#   - correo por Resend (API HTTPS)
#   - cortafuegos (SSH, 80 y 443) y copia de seguridad diaria de la base de datos
#   - el comando «docents-en-lluita» para el día a día (logs, reiniciar, probar correo…)
#
# Uso, como root y desde la carpeta del proyecto:
#
#   bash deploy/instalar.sh                 # primera instalación (pregunta lo necesario)
#   bash deploy/instalar.sh                 # volver a ejecutarlo = actualizar (conserva la configuración)
#   bash deploy/instalar.sh --reconfigurar  # volver a preguntar dominio, correo, etc.
#
# Para no responder preguntas, exporta antes DOMINIO, ADMIN_EMAILS, CONTACT_EMAIL,
# RESEND_API_KEY y MAIL_FROM. Con SIN_CORTAFUEGOS=1 no se toca el cortafuegos.

set -euo pipefail

APP=docents-en-lluita
APP_USER=docents
APP_DIR=/opt/$APP
DATA_DIR=/var/lib/$APP
CONF_DIR=/etc/$APP
ENV_FILE=$CONF_DIR/env
PORT=${PORT:-3000}
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

paso() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33m⚠️  %s\033[0m\n' "$*"; }
error() { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

# preguntar VARIABLE "texto" [valor por defecto] [secreto]
preguntar() {
  local var=$1 texto=$2 defecto=${3:-} secreto=${4:-} valor=${!1:-}
  # Sin terminal (instalación desatendida): valor por defecto o variable exportada.
  if [ -z "$valor" ] && ! { : </dev/tty; } 2>/dev/null; then
    [ -n "$defecto" ] || error "Falta $var: ejecútalo en una terminal o exporta $var antes."
    valor=$defecto
  fi
  while [ -z "$valor" ]; do
    if [ -n "$secreto" ]; then
      read -rsp "$texto: " valor </dev/tty
      echo
    elif [ -n "$defecto" ]; then
      read -rp "$texto [$defecto]: " valor </dev/tty
      valor=${valor:-$defecto}
    else
      read -rp "$texto: " valor </dev/tty
    fi
  done
  printf -v "$var" '%s' "$valor"
}

[ "$(id -u)" -eq 0 ] || error "Ejecútalo como root: sudo bash deploy/instalar.sh"
[ -f "$SRC_DIR/server.js" ] && [ -f "$SRC_DIR/package-lock.json" ] || error "No encuentro el proyecto en $SRC_DIR"
command -v apt-get >/dev/null || error "Este instalador es para Ubuntu/Debian."

RECONFIGURAR=0
[ "${1:-}" = "--reconfigurar" ] && RECONFIGURAR=1

# ---------------------------------------------------------------- Configuración

if [ ! -f "$ENV_FILE" ] || [ "$RECONFIGURAR" = 1 ]; then
  paso "Configuración"
  echo "Necesito unos datos. Puedes cambiarlos después con: docents-en-lluita configurar"
  echo
  preguntar DOMINIO "Dominio de la web (p. ej. moscosos.tudominio.org, sin https://)"
  DOMINIO=$(echo "$DOMINIO" | sed -E 's#^https?://##; s#/.*$##' | tr '[:upper:]' '[:lower:]')
  preguntar ADMIN_EMAILS "Correo(s) de la organización, separados por comas"
  ADMIN_EMAILS=$(echo "$ADMIN_EMAILS" | tr -d ' ' | tr '[:upper:]' '[:lower:]')
  preguntar CONTACT_EMAIL "Correo de contacto (aquí llegan las respuestas a los correos)" "${ADMIN_EMAILS%%,*}"
  echo
  echo "Resend: crea una API key en https://resend.com/api-keys"
  echo "  (permiso «Sending access», limitada al dominio desde el que vas a enviar)."
  preguntar RESEND_API_KEY "API key de Resend (empieza por re_; no se verá al escribir)" "" secreto
  case "$RESEND_API_KEY" in re_*) ;; *) aviso "La clave no empieza por re_: revisa que sea una API key de Resend." ;; esac
  # moscosos.tudominio.org → moscosos@tudominio.org ; tudominio.org → moscosos@tudominio.org
  DOMINIO_CORREO=$DOMINIO
  [ "$(printf '%s' "$DOMINIO" | tr -cd '.' | wc -c)" -ge 2 ] && DOMINIO_CORREO=${DOMINIO#*.}
  preguntar MAIL_FROM "Remitente (debe ser de un dominio verificado en Resend)" "moscosos@$DOMINIO_CORREO"
  MAIL_FROM=$(echo "$MAIL_FROM" | tr -d '"')
  case "$MAIL_FROM" in *"<"*) ;; *) MAIL_FROM="Docents en Lluita <$MAIL_FROM>" ;; esac

  install -d -m 750 -o root -g root "$CONF_DIR"
  [ -f "$ENV_FILE" ] && cp -p "$ENV_FILE" "$ENV_FILE.$(date +%Y%m%d%H%M%S).bak"
  umask 027
  cat >"$ENV_FILE" <<EOF
# Configuración de Docents en Lluita (generada por deploy/instalar.sh el $(date -I)).
# Después de cambiar algo: docents-en-lluita reiniciar
NODE_ENV=production
PUBLIC_URL=https://$DOMINIO
HOST=127.0.0.1
PORT=$PORT
TRUST_PROXY=1
DATA_DIR=$DATA_DIR

# Quién puede entrar
ALLOWED_EMAIL_DOMAIN=edu.gva.es
ADMIN_EMAILS=$ADMIN_EMAILS
CONTACT_EMAIL=$CONTACT_EMAIL

# Correo: Resend por API HTTPS
RESEND_API_KEY=$RESEND_API_KEY
MAIL_FROM="$MAIL_FROM"
# Límite de la cuenta: 10 envíos/segundo, compartidos con otros proyectos.
RESEND_MAX_PER_SECOND=4

# Jornadas (1 = lunes … 5 = viernes). Toda la semana: WEEKDAYS=1,2,3,4,5
SEATS_PER_JORNADA=100
WEEKDAYS=3
WEEKS_AHEAD=4
FALLBACK_HOUR=18
DEFAULT_MEETING_TIME=11:00
RETENTION_DAYS=30
MAX_UPLOAD_MB=5
EOF
  umask 022
  unset RESEND_API_KEY
fi

# Lee la configuración guardada (sin exportarla).
conf() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n1 | tr -d '"'; }
DOMINIO=$(conf PUBLIC_URL | sed -E 's#^https?://##; s#/.*$##')
PORT=$(conf PORT)
PORT=${PORT:-3000}

# ------------------------------------------------------------------ Paquetes

paso "Paquetes del sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg rsync ufw >/dev/null

NODE_MAJOR=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
  paso "Instalando Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
NODE_BIN=$(command -v node)
echo "Node $(node -v) en $NODE_BIN"

if ! command -v caddy >/dev/null; then
  paso "Instalando Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

# ---------------------------------------------------------------- Aplicación

paso "Copiando la aplicación a $APP_DIR"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
install -d -m 750 -o "$APP_USER" -g "$APP_USER" "$DATA_DIR"
chown root:"$APP_USER" "$CONF_DIR" "$ENV_FILE"
chmod 750 "$CONF_DIR"
chmod 640 "$ENV_FILE"
echo "$SRC_DIR" >"$CONF_DIR/origen"

install -d -m 755 "$APP_DIR"
if [ "$SRC_DIR" != "$APP_DIR" ]; then
  rsync -a --delete --exclude 'node_modules/' --exclude 'data/' --exclude '.env' --exclude 'test/' "$SRC_DIR/" "$APP_DIR/"
fi
chown -R root:root "$APP_DIR"

paso "Instalando dependencias"
cd "$APP_DIR"
if ! npm ci --omit=dev --no-audit --no-fund --loglevel=error; then
  aviso "Falló la instalación; instalo herramientas de compilación y reintento."
  apt-get install -y -qq build-essential python3 >/dev/null
  npm ci --omit=dev --no-audit --no-fund --loglevel=error
fi

# ------------------------------------------------------------------ Servicios

paso "Servicio systemd"
for unit in $APP.service $APP-copia.service $APP-copia.timer; do
  sed "s#__NODE__#$NODE_BIN#g" "$SRC_DIR/deploy/$unit" >"/etc/systemd/system/$unit"
done
install -m 755 "$SRC_DIR/deploy/docents-en-lluita" /usr/local/bin/docents-en-lluita
systemctl daemon-reload
systemctl enable --quiet $APP.service $APP-copia.timer
systemctl restart $APP.service
systemctl start $APP-copia.timer

echo -n "Esperando a que arranque"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/salud" >/dev/null 2>&1; then
    echo " ✔"
    break
  fi
  echo -n "."
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/api/salud" >/dev/null 2>&1 ||
  error "La aplicación no arranca. Mira los registros con: journalctl -u $APP -n 50"

paso "Caddy (HTTPS) para $DOMINIO"
OCUPADO=$(ss -Htlnp '( sport = :80 or sport = :443 )' 2>/dev/null | grep -v caddy || true)
if [ -n "$OCUPADO" ]; then
  echo "$OCUPADO"
  error "Otro programa (¿nginx, apache, un panel?) usa los puertos 80/443. Páralo o usa un VPS con Ubuntu limpio."
fi
install -d -m 755 /etc/caddy/sites
sed -e "s#__DOMINIO__#$DOMINIO#g" -e "s#__PUERTO__#$PORT#g" "$SRC_DIR/deploy/Caddyfile" >/etc/caddy/sites/$APP.caddy
if ! grep -qs '^import /etc/caddy/sites/\*.caddy' /etc/caddy/Caddyfile; then
  if grep -qs 'root \* /usr/share/caddy' /etc/caddy/Caddyfile; then
    # Es la página de bienvenida que trae Caddy: la sustituimos.
    cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.original
    echo 'import /etc/caddy/sites/*.caddy' >/etc/caddy/Caddyfile
  else
    printf '\nimport /etc/caddy/sites/*.caddy\n' >>/etc/caddy/Caddyfile
  fi
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 ||
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable --quiet caddy
systemctl reload-or-restart caddy

if [ "${SIN_CORTAFUEGOS:-0}" != 1 ]; then
  paso "Cortafuegos"
  SSH_PORTS=$(sshd -T 2>/dev/null | awk '/^port /{print $2}' || true)
  for p in ${SSH_PORTS:-22}; do ufw allow "$p/tcp" >/dev/null; done
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  ufw status | sed -n '1,12p'
fi

# ------------------------------------------------------------------ Comprobaciones

paso "Comprobaciones"
IP_PUBLICA=$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
IP_DNS=$(getent ahostsv4 "$DOMINIO" | awk 'NR==1{print $1}' || true)
if [ "$IP_DNS" = "$IP_PUBLICA" ]; then
  echo "✔ $DOMINIO apunta a este servidor ($IP_PUBLICA). Caddy pedirá el certificado HTTPS."
else
  aviso "$DOMINIO apunta a «${IP_DNS:-nada}», pero este servidor es $IP_PUBLICA."
  echo "   Crea un registro DNS de tipo A: $DOMINIO → $IP_PUBLICA"
  echo "   Caddy sacará el certificado solo en cuanto el DNS esté bien (puede tardar unos minutos)."
fi

CORREO_ADMIN=$(conf ADMIN_EMAILS | cut -d, -f1)
if [ -t 0 ] && [ -n "$CORREO_ADMIN" ]; then
  read -rp "¿Envío un correo de prueba a $CORREO_ADMIN? [S/n] " RESP </dev/tty || RESP=n
  case "${RESP:-s}" in
    [sSyY]*) docents-en-lluita probar-correo "$CORREO_ADMIN" || aviso "Revisa la clave y el remitente: docents-en-lluita configurar" ;;
  esac
fi

paso "¡Listo!"
cat <<EOF
Web:              https://$DOMINIO
Organización:     entra con $CORREO_ADMIN y verás la pestaña «Organización».
Configuración:    $ENV_FILE  (docents-en-lluita configurar)
Datos y copias:   $DATA_DIR

Comandos útiles:  docents-en-lluita estado | logs | reiniciar | probar-correo <correo> | copia | actualizar
EOF
