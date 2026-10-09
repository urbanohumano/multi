#!/usr/bin/env bash
# Install HumHub for 360 Democracy on the Demsoc Gandi VPS, as root.
# Supported: Ubuntu 24.04, Debian 12 or 13 (HumHub 1.18 needs PHP 8.2-8.4 and MariaDB 10.11+).
#
#   export ADMIN_EMAIL=domenico.ds@demsoc.eu            # required
#   export SMTP_HOST=smtp-relay.brevo.com SMTP_USER=login SMTP_PASSWORD=key   # optional for now
#   bash install_humhub.sh
#
# What it does, in order: checks the system, adds swap if missing, installs nginx (or reuses a
# running Apache), PHP-FPM with the extensions HumHub needs and MariaDB (or reuses a recent one),
# creates the database, downloads and unpacks HumHub, runs its console installer, applies the
# 360 Democracy settings (private, invitation only, weekly summary, Brussels time), installs the
# Calendar, Messenger, Polls and REST modules, sets the cron jobs, adds one vhost for the
# community and asks Let's Encrypt for its certificate. Other sites on the server are not touched.
# Re-running it is safe: finished steps are skipped and the settings are applied again.
#
# Variables (defaults in brackets):
#   HUMHUB_HOSTNAME [community.360democracy.com]   SITE_NAME [360 Democracy]
#   ADMIN_USER [admin]  ADMIN_PASSWORD [generated]  SYSTEM_EMAIL [noreply@<hostname>]
#   HUMHUB_VERSION [1.18.6]  HUMHUB_PACKAGE [download]  HUMHUB_DIR [/var/www/humhub]
#   DB_NAME [humhub]  DB_USER [humhub]  DB_PASSWORD [generated]  MYSQL_ROOT_PASSWORD [socket auth]
#   SMTP_HOST SMTP_PORT [587] SMTP_USER SMTP_PASSWORD   (without SMTP, mail is written to files)
#   MODULES ["calendar mail polls rest", or none]  TIMEZONE [Europe/Brussels]  LANGUAGE [en-US]
#   WEB_SERVER [auto|nginx|apache]  LETSENCRYPT_EMAIL [ADMIN_EMAIL]  SKIP_CERTBOT [0]
#   DRY_RUN=1 renders the vhost, PHP, cron and .env files into RENDER_DIR [./render] and stops.
# Generated passwords are stored in /root/humhub-credentials.txt (mode 600).

set -euo pipefail

: "${HUMHUB_HOSTNAME:=community.360democracy.com}"
: "${SITE_NAME:=360 Democracy}"
: "${ADMIN_USER:=admin}"
: "${HUMHUB_VERSION:=1.18.6}"
: "${HUMHUB_PACKAGE:=}"
: "${HUMHUB_DIR:=/var/www/humhub}"
: "${DB_NAME:=humhub}"
: "${DB_USER:=humhub}"
: "${SMTP_PORT:=587}"
: "${MODULES:=calendar mail polls rest}"
: "${TIMEZONE:=Europe/Brussels}"
: "${LANGUAGE:=en-US}"
: "${WEB_SERVER:=auto}"
: "${SKIP_CERTBOT:=0}"
: "${DRY_RUN:=0}"
: "${RENDER_DIR:=./render}"
: "${CREDENTIALS_FILE:=/root/humhub-credentials.txt}"
host=$HUMHUB_HOSTNAME
: "${SYSTEM_EMAIL:=noreply@${host}}"

log() { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ $host =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] || die "HUMHUB_HOSTNAME '$host' is not a valid lowercase hostname"
[[ $DRY_RUN == 1 ]] || : "${ADMIN_EMAIL:?set ADMIN_EMAIL}"
: "${ADMIN_EMAIL:=admin@example.org}"
: "${LETSENCRYPT_EMAIL:=$ADMIN_EMAIL}"

svc() {  # svc <action> <service>: systemd when present, SysV otherwise
  if [[ -d /run/systemd/system ]]; then systemctl "$1" "$2"; else service "$2" "$1"; fi
}
svc_active() {
  if [[ -d /run/systemd/system ]]; then systemctl is-active --quiet "$1" 2>/dev/null; else service "$1" status >/dev/null 2>&1; fi
}
port_listening() {
  local hex f files=(); hex=$(printf ':%04X' "$1")
  for f in /proc/net/tcp /proc/net/tcp6; do [[ -r $f ]] && files+=("$f"); done   # tcp6 is absent without IPv6
  awk -v p="$hex" 'FNR > 1 && $4 == "0A" && substr($2, length($2) - 4) == p { f = 1 } END { exit !f }' "${files[@]}"
}
gen_secret() { tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "${1:-24}"; }

# -- web server and PHP version -------------------------------------------------------
if [[ $WEB_SERVER == auto ]]; then
  if command -v apache2ctl >/dev/null && svc_active apache2 && ! svc_active nginx; then WEB_SERVER=apache; else WEB_SERVER=nginx; fi
fi
[[ $WEB_SERVER == nginx || $WEB_SERVER == apache ]] || die "WEB_SERVER must be auto, nginx or apache"
php_version() { php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;' 2>/dev/null; }
PHPV=${PHPV:-$(php_version || true)}
[[ -n $PHPV ]] || PHPV=8.3   # only used by DRY_RUN before PHP is installed
fpm_socket="/run/php/php${PHPV}-fpm.sock"

# -- rendered files -------------------------------------------------------------------
render_nginx() {
  local v6=""
  if command -v nginx >/dev/null; then
    nginx -T 2>/dev/null | grep -E '^[[:space:]]*listen[[:space:]]+\[::\]' >/dev/null && v6=$'\n    listen [::]:80;'
  elif [[ -s /proc/net/if_inet6 ]]; then v6=$'\n    listen [::]:80;'; fi
  cat <<NGINX
# HumHub (${host}), added by install_humhub.sh. Based on docs.humhub.org/docs/admin/server-setup.
# certbot --nginx adds the HTTPS server block and the redirect to this file.
server {
    listen 80;${v6}
    server_name ${host};
    root ${HUMHUB_DIR};
    charset utf-8;
    client_max_body_size 64M;

    location / {
        index index.php index.html;
        try_files \$uri \$uri/ /index.php\$is_args\$args;
    }
    location ~ ^/(protected|framework|themes/\w+/views|\.|uploads/file) {
        deny all;
    }
    location ~ ^/assets/.*\.php\$ {
        deny all;
    }
    location ~ ^/(assets|static|themes|uploads) {
        expires 10d;
        add_header Cache-Control "public, no-transform";
    }
    location ~ \.php {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_pass unix:${fpm_socket};
        fastcgi_read_timeout 120s;
        try_files \$uri =404;
    }
}
NGINX
}

render_apache() {
  cat <<APACHE
# HumHub (${host}), added by install_humhub.sh. Needs: a2enmod rewrite proxy_fcgi setenvif headers expires
<VirtualHost *:80>
    ServerName ${host}
    DocumentRoot ${HUMHUB_DIR}
    <Directory ${HUMHUB_DIR}/>
        Options -Indexes -FollowSymLinks +SymLinksIfOwnerMatch
        AllowOverride All
        Require all granted
    </Directory>
    <FilesMatch "\.php$">
        SetHandler "proxy:unix:${fpm_socket}|fcgi://localhost"
    </FilesMatch>
    LimitRequestBody 67108864
</VirtualHost>
APACHE
}

render_php_ini() {
  cat <<'INI'
; HumHub settings, added by install_humhub.sh (docs.humhub.org/docs/admin/server-setup#php)
upload_max_filesize = 32M
post_max_size = 32M
max_execution_time = 120
memory_limit = 512M
INI
}

render_cron() {
  cat <<CRON
# HumHub background jobs, added by install_humhub.sh
* * * * * www-data /usr/bin/php ${HUMHUB_DIR}/protected/yii queue/run >/dev/null 2>&1
* * * * * www-data /usr/bin/php ${HUMHUB_DIR}/protected/yii cron/run >/dev/null 2>&1
CRON
}

render_env() {
  cat <<'ENV'
# HumHub runtime configuration, added by install_humhub.sh (see .env.example for more options)
HUMHUB_DEBUG=false
HUMHUB_CONFIG__COMPONENTS__URL_MANAGER__SHOW_SCRIPT_NAME=false
HUMHUB_CONFIG__COMPONENTS__URL_MANAGER__ENABLE_PRETTY_URL=true
ENV
}

render_console_config() {
  cat <<'PHP'
<?php
/**
 * Local console configuration. Added by install_humhub.sh (360 Democracy):
 * registers HumHub's console installer so the site can be installed without the web wizard.
 */
return [
    'controllerMap' => [
        'installer' => \humhub\modules\installer\commands\InstallController::class,
    ],
];
PHP
}

if [[ $DRY_RUN == 1 ]]; then
  mkdir -p "$RENDER_DIR"
  render_nginx > "$RENDER_DIR/nginx-humhub.conf"
  render_apache > "$RENDER_DIR/apache-humhub.conf"
  render_php_ini > "$RENDER_DIR/90-humhub.ini"
  render_cron > "$RENDER_DIR/cron-humhub"
  render_env > "$RENDER_DIR/env"
  render_console_config > "$RENDER_DIR/console.php"
  echo "host=${host} web=${WEB_SERVER} php=${PHPV} dir=${HUMHUB_DIR} modules='${MODULES}' -> ${RENDER_DIR}"
  exit 0
fi

# -- checks ---------------------------------------------------------------------------
[[ $EUID -eq 0 ]] || die "run as root (sudo -i)"
# shellcheck disable=SC1091
. /etc/os-release
case "${ID}-${VERSION_ID}" in
  ubuntu-24.04|debian-12|debian-13) ;;
  ubuntu-22.04) die "Ubuntu 22.04 ships PHP 8.1 and MariaDB 10.6; HumHub 1.18 needs PHP 8.2+ and MariaDB 10.11+. Upgrade the server to 24.04 (after backing up the old site) or create a new Gandi server with Ubuntu 24.04." ;;
  *) die "unsupported system ${PRETTY_NAME}; use Ubuntu 24.04 or Debian 12" ;;
esac
free_gb=$(df -P -BG /var | awk 'NR == 2 { gsub("G", "", $4); print $4 }')
(( free_gb >= 5 )) || die "only ${free_gb} GB free on /var; HumHub needs about 1 GB plus room for uploads and backups"
if port_listening 80 && ! { command -v nginx >/dev/null && svc_active nginx; } && ! { command -v apache2ctl >/dev/null && svc_active apache2; }; then
  die "port 80 is used by something that is neither nginx nor Apache (see: ss -ltnp); free it or configure the proxy by hand"
fi
if [[ $WEB_SERVER == nginx ]] && command -v apache2ctl >/dev/null && svc_active apache2 && port_listening 80 && ! svc_active nginx; then
  die "Apache is serving port 80; rerun with WEB_SERVER=apache"
fi

# -- credentials (reused on re-runs) -------------------------------------------------
if [[ -f $CREDENTIALS_FILE ]]; then
  # shellcheck disable=SC1090
  . "$CREDENTIALS_FILE"
fi
: "${DB_PASSWORD:=$(gen_secret 28)}"
: "${ADMIN_PASSWORD:=$(gen_secret 20)}"
umask 077
cat > "$CREDENTIALS_FILE" <<CRED
# HumHub for ${host}, written by install_humhub.sh. Keep this file private.
DB_NAME='${DB_NAME}'
DB_USER='${DB_USER}'
DB_PASSWORD='${DB_PASSWORD}'
ADMIN_USER='${ADMIN_USER}'
ADMIN_PASSWORD='${ADMIN_PASSWORD}'
CRED
umask 022

mem_mb=$(awk '/^MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
if [[ $(awk '/^SwapTotal/ { print $2 }' /proc/meminfo) -eq 0 ]] && (( mem_mb < 8000 )) && [[ ! -e /swapfile ]]; then
  log "Adding a 2 GB swapfile"
  if fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; then
    chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && \
      { grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab; } || warn "could not enable swap"
  fi
fi

# -- packages -------------------------------------------------------------------------
log "Installing packages (web server ${WEB_SERVER}, PHP-FPM, MariaDB if needed)"
export DEBIAN_FRONTEND=noninteractive
pkgs=(curl ca-certificates cron openssl tar gzip php-fpm php-cli php-imagick php-curl php-bz2 php-gd php-intl
      php-mbstring php-mysql php-zip php-apcu php-xml php-ldap)
db_running=0
if pgrep -x mariadbd >/dev/null || pgrep -x mysqld >/dev/null; then db_running=1; else pkgs+=(mariadb-server mariadb-client); fi
if [[ $WEB_SERVER == nginx ]]; then pkgs+=(nginx); else pkgs+=(apache2); fi
[[ $SKIP_CERTBOT == 1 ]] || pkgs+=(certbot "python3-certbot-${WEB_SERVER}")
apt-get update -q
apt-get install -y -q "${pkgs[@]}"

PHPV=$(php_version)
fpm_socket="/run/php/php${PHPV}-fpm.sock"
case "$PHPV" in 8.2|8.3|8.4) ;; *) die "PHP ${PHPV} is not supported by HumHub ${HUMHUB_VERSION} (needs 8.2 to 8.4)" ;; esac
for sapi in fpm cli; do render_php_ini > "/etc/php/${PHPV}/${sapi}/conf.d/90-humhub.ini"; done
svc restart "php${PHPV}-fpm"
svc_active cron || svc start cron || true

if (( ! db_running )); then svc start mariadb || svc start mysql; fi
mysql_cmd=(mysql)
[[ -n ${MYSQL_ROOT_PASSWORD:-} ]] && mysql_cmd=(mysql -uroot "-p${MYSQL_ROOT_PASSWORD}")
"${mysql_cmd[@]}" -N -e 'SELECT 1' >/dev/null 2>&1 || die "cannot log in to MySQL/MariaDB as root; set MYSQL_ROOT_PASSWORD"
db_version=$("${mysql_cmd[@]}" -N -e 'SELECT VERSION()')
case "$db_version" in
  *MariaDB*) min=10.11 ;;
  *) min=8.0 ;;
esac
[[ $(printf '%s\n%s\n' "$min" "${db_version%%-*}" | sort -V | head -1) == "$min" ]] || die "database ${db_version} is older than the ${min} HumHub needs"
log "Database server ${db_version}: creating database ${DB_NAME} and user ${DB_USER}"
sql_pass=${DB_PASSWORD//\'/\'\'}
"${mysql_cmd[@]}" <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${sql_pass}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${sql_pass}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

# -- HumHub files and console installer ----------------------------------------------
yii() { runuser -u www-data -- php "${HUMHUB_DIR}/protected/yii" "$@" --interactive=0; }
marker="${HUMHUB_DIR}/protected/runtime/.installed-by-kit"

if [[ ! -f ${HUMHUB_DIR}/protected/yii ]]; then
  if [[ -d $HUMHUB_DIR && -n $(ls -A "$HUMHUB_DIR" 2>/dev/null) ]]; then
    die "${HUMHUB_DIR} exists and is not a HumHub installation; choose another HUMHUB_DIR"
  fi
  work=$(mktemp -d)
  if [[ -z $HUMHUB_PACKAGE ]]; then
    HUMHUB_PACKAGE="${work}/humhub-${HUMHUB_VERSION}.tar.gz"
    log "Downloading HumHub ${HUMHUB_VERSION}"
    curl -fL --retry 3 -o "$HUMHUB_PACKAGE" "https://download.humhub.com/downloads/install/humhub-${HUMHUB_VERSION}.tar.gz" \
      || die "download failed; check the version at https://download.humhub.com and set HUMHUB_VERSION"
  fi
  tar -xzf "$HUMHUB_PACKAGE" -C "$work"
  src=$(dirname "$(find "$work" -maxdepth 3 -path '*/protected/yii' -print -quit)")
  src=${src%/protected}
  [[ -f $src/index.php ]] || die "the package does not contain a HumHub installation"
  mkdir -p "$(dirname "$HUMHUB_DIR")"
  rm -rf "$HUMHUB_DIR"
  mv "$src" "$HUMHUB_DIR"
  rm -rf "$work" "${HUMHUB_DIR}/protected/runtime/cache"
fi
[[ -f ${HUMHUB_DIR}/.env ]] || render_env > "${HUMHUB_DIR}/.env"
# HumHub ships its console installer without registering it; protected/config/console.php is the
# local console configuration file meant for this kind of addition.
console_cfg="${HUMHUB_DIR}/protected/config/console.php"
if ! grep -q 'InstallController' "$console_cfg" 2>/dev/null; then
  if grep -vE '^\s*(\*|/\*\*|\*/|<\?php|$)' "$console_cfg" 2>/dev/null | tr -d ' \n' | grep -qx 'return\[\];'; then
    render_console_config > "$console_cfg"
  else
    die "${console_cfg} has local changes; add 'controllerMap' => ['installer' => \\humhub\\modules\\installer\\commands\\InstallController::class] to it and rerun"
  fi
fi
chown -R www-data:www-data "$HUMHUB_DIR"
chmod 640 "${HUMHUB_DIR}/.env"

if [[ ! -f $marker ]]; then
  log "Running the HumHub console installer"
  yii installer/write-db-config localhost "$DB_NAME" "$DB_USER" "$DB_PASSWORD"
  yii installer/install-db
  yii installer/write-site-config "$SITE_NAME" "$SYSTEM_EMAIL"
  yii installer/set-base-url "https://${host}"
  yii installer/create-admin-account "$ADMIN_USER" "$ADMIN_EMAIL" "$ADMIN_PASSWORD"
  runuser -u www-data -- touch "$marker"
  chmod 640 "${HUMHUB_DIR}/protected/config/dynamic.php" 2>/dev/null || true
fi

log "Applying 360 Democracy settings"
set_setting() { yii settings/set "$1" "$2" "$3" >/dev/null && printf '  %s.%s = %s\n' "$1" "$2" "$( [[ $2 == *assword* ]] && echo '***' || echo "$3")"; }
set_setting base name "$SITE_NAME"
set_setting base baseUrl "https://${host}"
set_setting base defaultTimeZone "$TIMEZONE"
set_setting base defaultLanguage "$LANGUAGE"
set_setting base mailerSystemEmailAddress "$SYSTEM_EMAIL"
set_setting base mailerSystemEmailName "$SITE_NAME"
if [[ -n ${SMTP_HOST:-} ]]; then
  set_setting base mailerTransportType smtp
  set_setting base mailerHostname "$SMTP_HOST"
  set_setting base mailerPort "$SMTP_PORT"
  set_setting base mailerUsername "${SMTP_USER:-}"
  set_setting base mailerPassword "${SMTP_PASSWORD:-}"
  set_setting base mailerUseSmtps "$([[ $SMTP_PORT == 465 ]] && echo 1 || echo 0)"
else
  set_setting base mailerTransportType file
  warn "no SMTP_HOST: emails are written to ${HUMHUB_DIR}/protected/runtime/mail until a provider is configured"
fi
set_setting user auth.allowGuestAccess 0
set_setting user auth.anonymousRegistration 0
set_setting user auth.needApproval 0
set_setting user auth.internalUsersCanInviteByEmail 1
set_setting user auth.internalUsersCanInviteByLink 1
set_setting activity mailSummaryInterval 3

log "Installing modules: ${MODULES}"
yii cache/flush-all >/dev/null 2>&1 || true
[[ $MODULES == none ]] && MODULES=""
for m in $MODULES; do
  if yii module/list 2>/dev/null | grep -w "$m" >/dev/null; then echo "  $m already installed"
  elif yii module/install "$m" >/dev/null 2>&1; then echo "  $m installed"
  else warn "could not install module $m from the HumHub marketplace; install it later from Administration > Modules"; continue; fi
  yii module/enable "$m" >/dev/null 2>&1 && echo "  $m enabled" || warn "could not enable module $m"
done
if yii module/list 2>/dev/null | grep -w rest >/dev/null; then
  set_setting rest enableBasicAuth 0
  set_setting rest enableBearerAuth 1
  set_setting rest enabledForAllUsers 0
fi
yii cache/flush-all >/dev/null 2>&1 || true

render_cron > /etc/cron.d/humhub
chmod 644 /etc/cron.d/humhub

# -- web server ------------------------------------------------------------------------
log "Adding the ${host} vhost to ${WEB_SERVER}"
if [[ $WEB_SERVER == nginx ]]; then
  if grep -rqsE "server_name[^;]*[[:space:]]${host//./\\.}[[:space:];]" /etc/nginx/ --exclude="humhub-${host}.conf"; then
    warn "another nginx server block already uses ${host}; not adding ours"
  else
    if [[ -d /etc/nginx/sites-available ]]; then
      conf=/etc/nginx/sites-available/humhub-${host}.conf link=/etc/nginx/sites-enabled/humhub-${host}.conf
    else
      conf=/etc/nginx/conf.d/humhub-${host}.conf link=""
    fi
    [[ -f $conf ]] && grep -q 'managed by Certbot' "$conf" || render_nginx > "$conf"
    [[ -n $link ]] && ln -sf "$conf" "$link"
    if nginx -t 2>/dev/null; then
      svc_active nginx && svc reload nginx || svc start nginx
    else
      rm -f "$conf" ${link:+"$link"}; nginx -t || true
      die "nginx rejected the HumHub vhost; it was removed and nothing else changed"
    fi
  fi
else
  a2enmod -q rewrite proxy_fcgi setenvif headers expires >/dev/null
  conf=/etc/apache2/sites-available/humhub-${host}.conf
  [[ -f $conf ]] && grep -q 'SSLCertificateFile' "$conf" || render_apache > "$conf"
  [[ -f ${HUMHUB_DIR}/.htaccess ]] || cp "${HUMHUB_DIR}/.htaccess.dist" "${HUMHUB_DIR}/.htaccess"
  a2ensite -q "humhub-${host}" >/dev/null
  if apache2ctl configtest 2>/dev/null; then
    svc_active apache2 && svc reload apache2 || svc start apache2
  else
    a2dissite -q "humhub-${host}" >/dev/null; rm -f "$conf"; apache2ctl configtest || true
    die "Apache rejected the HumHub vhost; it was removed and nothing else changed"
  fi
fi

dns_points_here() {
  local ip
  for ip in $(getent ahosts "$host" | awk '{ print $1 }' | sort -u); do
    hostname -I | tr ' ' '\n' | grep -x "$ip" >/dev/null && return 0
  done
  return 1
}
if [[ $SKIP_CERTBOT != 1 ]]; then
  if dns_points_here; then
    certbot "--${WEB_SERVER}" -d "$host" --non-interactive --agree-tos -m "$LETSENCRYPT_EMAIL" --redirect
  else
    warn "${host} does not point at this server yet. When the DNS is in place, run:  certbot --${WEB_SERVER} -d ${host} --redirect"
  fi
fi

status=$(curl -s -o /dev/null -w '%{http_code}' --noproxy '*' -H "Host: ${host}" "http://127.0.0.1/user/auth/login" || true)
case "$status" in
  200|301|302) echo "OK: ${WEB_SERVER} serves HumHub for ${host} (HTTP ${status})" ;;
  *) warn "HumHub answered HTTP ${status}; check ${HUMHUB_DIR}/protected/runtime/logs/app.log and the ${WEB_SERVER} error log" ;;
esac

cat <<MSG

HumHub ${HUMHUB_VERSION} is installed for https://${host}
  Admin user:   ${ADMIN_USER}   (password in ${CREDENTIALS_FILE})
  Files:        ${HUMHUB_DIR}    Database: ${DB_NAME}
Next:
  1. Sign in and change the admin password; add a second administrator.
  2. Create the spaces (one per Circle space) or run the Circle import.
  3. When the email provider is ready, rerun this script with SMTP_HOST, SMTP_USER and SMTP_PASSWORD,
     then send a test from Administration > Settings > Advanced > E-Mail.
MSG
