#!/usr/bin/env bash
# Back up the old Demsoc website on this server into one archive you can download.
# Read-only for the site: it stops nothing and changes no configuration.
#
#   sudo bash backup_old_site.sh            # writes ~ubuntu/demsoc-web-<host>-<date>.tar.gz and .sha256
#   sudo OUTPUT_DIR=/root bash backup_old_site.sh
#   sudo EXCLUDE="var/www/site/wp-content/cache opt/bigtool" bash backup_old_site.sh   # skip folders
#   ssh ubuntu@SERVER 'sudo bash /opt/kit/360democracy-migration/discourse/backup_old_site.sh --stdout' > demsoc-web.tar.gz
#                                            # streams straight to your computer (macOS/Linux), no disk needed here
#
# Inside the archive (one folder, demsoc-web-<host>-<date>/):
#   var/www, srv, home, opt ...   the site files, at their original paths
#   etc/nginx, etc/apache2, ...   web server, PHP, MySQL, cron and systemd configuration
#   backup-info/                  README-RESTORE.txt, INVENTORY.txt (what ran here), BACKUP-LOG.txt,
#                                 databases/ with one .sql.gz per MySQL/MariaDB database and PostgreSQL
# Left out on purpose: SSH keys, TLS private keys (/etc/letsencrypt), shell histories, caches.

set -uo pipefail

stdout_mode=0
[[ ${1:-} == --stdout ]] && stdout_mode=1
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }

owner=${SUDO_USER:-root}
owner_home=$(getent passwd "$owner" | cut -d: -f6)
: "${OUTPUT_DIR:=${owner_home:-/root}}"
name="demsoc-web-$(hostname -s)-$(date +%Y%m%d-%H%M)"
stage=$(mktemp -d /var/tmp/demsoc-backup.XXXXXX)
info_dir="$stage/backup-info"
mkdir -p "$info_dir/databases"
trap 'rm -rf "$stage"' EXIT

log() { printf '%s %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$info_dir/BACKUP-LOG.txt" >&2; }
warn() { log "WARN $*"; }
running() { pgrep -x "$1" >/dev/null 2>&1; }

log "Backing up $(hostname) into $name"

# -- inventory: what ran on this server -----------------------------------------
{
  echo "# Inventory of $(hostname), $(date -u +%FT%TZ)"
  echo; echo "## System"; grep PRETTY_NAME /etc/os-release; uname -a; uptime
  echo; echo "## Disk"; df -h
  echo; echo "## Listening ports"; ss -ltnp 2>/dev/null || true
  echo; echo "## Running services"; systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null || true
  echo; echo "## Versions"
  for cmd in "nginx -v" "apache2 -v" "php -v" "mysql --version" "psql --version" "docker --version" "node --version"; do
    command -v "${cmd%% *}" >/dev/null && { echo "\$ $cmd"; $cmd 2>&1 | head -2; }
  done
  echo; echo "## TLS certificates (names and expiry only; keys are not copied)"
  command -v certbot >/dev/null && certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry' || echo "none found"
  echo; echo "## Crontabs"
  for u in $(cut -d: -f1 /etc/passwd); do c=$(crontab -l -u "$u" 2>/dev/null) && printf -- '--- %s\n%s\n' "$u" "$c"; done
  echo; echo "## Docker"
  if command -v docker >/dev/null; then docker ps -a 2>/dev/null; echo; docker volume ls 2>/dev/null; fi
  echo; echo "## Installed packages"; dpkg-query -W -f='${Package} ${Version}\n' 2>/dev/null
} > "$info_dir/INVENTORY.txt" 2>&1
log "Inventory written"

# -- which directories hold the site --------------------------------------------
declare -a roots=()
if command -v nginx >/dev/null; then
  while read -r r; do roots+=("$r"); done < <(nginx -T 2>/dev/null | awk '$1 == "root" { gsub(";", "", $2); print $2 }')
fi
for dir in /etc/apache2/sites-enabled /etc/httpd/conf.d; do
  [[ -d $dir ]] || continue
  while read -r r; do roots+=("$r"); done < <(grep -rhiE '^[[:space:]]*DocumentRoot[[:space:]]' "$dir" 2>/dev/null | awk '{ gsub("\"", "", $2); print $2 }')
done
roots+=(/var/www /srv /home /opt /var/mail)

declare -a paths=()
for r in "${roots[@]}"; do
  [[ $r == *'$'* || ! -d $r ]] && continue
  r=$(realpath -m "$r")
  case "$r" in /|/etc|/usr|/var|/var/lib|/root) continue ;; esac
  paths+=("${r#/}")
done
# Keep only top-level directories (drop /var/www/html when /var/www is there).
mapfile -t paths < <(printf '%s\n' "${paths[@]}" | sort -u | awk 'NR == 1 || index($0, prev "/") != 1 { print; prev = $0 }')

for c in etc/nginx etc/apache2 etc/php etc/mysql etc/postgresql etc/cron.d etc/crontab var/spool/cron/crontabs \
         etc/systemd/system etc/hosts etc/fstab etc/letsencrypt/renewal etc/logrotate.d etc/ssl/openssl.cnf; do
  [[ -e /$c ]] && paths+=("$c")
done
if command -v docker >/dev/null && [[ -d /var/lib/docker/volumes ]] && [[ -n $(docker volume ls -q 2>/dev/null) ]]; then
  paths+=(var/lib/docker/volumes)
fi

excludes=(
  --exclude='*/.ssh' --exclude='*/.gnupg' --exclude='*/.cache' --exclude='*/.npm' --exclude='*/.bash_history'
  --exclude='*/.mysql_history' --exclude='*/.psql_history' --exclude='*/.lesshst' --exclude='*/.viminfo'
  --exclude='opt/kit' --exclude='opt/containerd' --exclude='var/discourse' --exclude='etc/mysql/debian.cnf'
  --exclude='etc/letsencrypt/live' --exclude='etc/letsencrypt/archive' --exclude='etc/letsencrypt/keys'
  --exclude='*.sock'
)
for x in ${EXCLUDE:-}; do excludes+=("--exclude=$x"); done   # extra patterns, e.g. EXCLUDE="var/www/site/cache"

# -- what kind of site: note CMS configuration files -----------------------------
{
  echo; echo "## Site directories in this backup"
  printf '/%s\n' "${paths[@]}"
  echo; echo "## Application config files found"
  for p in "${paths[@]}"; do
    case "$p" in etc/*|var/spool/*|var/lib/docker/*) continue ;; esac
    find "/$p" -maxdepth 5 \( -name wp-config.php -o -path '*/sites/default/settings.php' -o -name .env \
      -o -name configuration.php -o -name 'docker-compose*.yml' -o -name 'compose.y*ml' \) -not -path '*/node_modules/*' 2>/dev/null
  done
} >> "$info_dir/INVENTORY.txt"

# -- databases --------------------------------------------------------------------
dump_ok() {  # a mysqldump ends with "-- Dump completed"; pg_dumpall with "PostgreSQL database cluster dump complete"
  gzip -t "$1" 2>/dev/null && zcat "$1" | tail -n 3 | grep -qE 'Dump completed|dump complete'
}

mysql_args=()
if command -v mysqldump >/dev/null && { running mysqld || running mariadbd; }; then
  if mysql -N -e 'SELECT 1' >/dev/null 2>&1; then mysql_args=()
  elif [[ -r /etc/mysql/debian.cnf ]] && mysql --defaults-file=/etc/mysql/debian.cnf -N -e 'SELECT 1' >/dev/null 2>&1; then
    mysql_args=(--defaults-file=/etc/mysql/debian.cnf)
  else
    mysql_args=(NONE)
  fi
  if [[ ${mysql_args[0]:-} != NONE ]]; then
    mysql "${mysql_args[@]}" -N -e 'SELECT user, host FROM mysql.user' > "$info_dir/databases/mysql-users.txt" 2>/dev/null
    for db in $(mysql "${mysql_args[@]}" -N -e 'SHOW DATABASES' 2>/dev/null); do
      case "$db" in information_schema|performance_schema|sys|mysql) continue ;; esac
      f="$info_dir/databases/mysql-$db.sql.gz"
      mysqldump "${mysql_args[@]}" --single-transaction --routines --events --triggers \
        --default-character-set=utf8mb4 --databases "$db" 2>>"$info_dir/BACKUP-LOG.txt" | gzip > "$f"
      if dump_ok "$f"; then log "MySQL database $db dumped ($(du -h "$f" | cut -f1))"; else warn "MySQL dump of $db looks incomplete"; fi
    done
  else
    # Fall back to the credentials WordPress uses.
    while read -r cfg; do
      get() { sed -nE "s/.*define\(\s*['\"]$1['\"]\s*,\s*['\"]([^'\"]*)['\"].*/\1/p" "$cfg" | head -1; }
      db=$(get DB_NAME) user=$(get DB_USER) pass=$(get DB_PASSWORD) dbhost=$(get DB_HOST)
      [[ -n $db ]] || continue
      f="$info_dir/databases/mysql-$db.sql.gz"
      MYSQL_PWD=$pass mysqldump -u"$user" -h"${dbhost:-localhost}" --single-transaction --no-tablespaces \
        --default-character-set=utf8mb4 --databases "$db" 2>>"$info_dir/BACKUP-LOG.txt" | gzip > "$f"
      if dump_ok "$f"; then log "MySQL database $db dumped with the credentials in $cfg"; else warn "could not dump $db with $cfg"; fi
    done < <(for p in "${paths[@]}"; do case "$p" in etc/*|var/*) ;; *) find "/$p" -maxdepth 5 -name wp-config.php 2>/dev/null ;; esac; done)
    [[ -n $(ls "$info_dir/databases"/mysql-*.sql.gz 2>/dev/null) ]] || warn "MySQL is running but no database could be dumped (no root access, no wp-config.php)"
  fi
fi

if command -v pg_dumpall >/dev/null && running postgres; then
  f="$info_dir/databases/postgresql-all.sql.gz"
  runuser -u postgres -- pg_dumpall 2>>"$info_dir/BACKUP-LOG.txt" | gzip > "$f"
  if dump_ok "$f"; then log "PostgreSQL dumped ($(du -h "$f" | cut -f1))"; else warn "PostgreSQL dump looks incomplete"; fi
fi

if command -v docker >/dev/null; then
  while read -r cname image; do
    case "$image" in
      *mysql*|*mariadb*)
        f="$info_dir/databases/docker-$cname-all.sql.gz"
        docker exec "$cname" sh -c 'd=$(command -v mariadb-dump || command -v mysqldump); exec "$d" --all-databases --single-transaction -uroot -p"${MYSQL_ROOT_PASSWORD:-$MARIADB_ROOT_PASSWORD}"' \
          2>>"$info_dir/BACKUP-LOG.txt" | gzip > "$f"
        if dump_ok "$f"; then log "Docker MySQL $cname dumped"; else warn "could not dump Docker MySQL $cname (its volume is copied raw)"; fi ;;
      *postgres*)
        f="$info_dir/databases/docker-$cname-all.sql.gz"
        docker exec "$cname" sh -c 'exec pg_dumpall -U "${POSTGRES_USER:-postgres}"' 2>>"$info_dir/BACKUP-LOG.txt" | gzip > "$f"
        if dump_ok "$f"; then log "Docker PostgreSQL $cname dumped"; else warn "could not dump Docker PostgreSQL $cname (its volume is copied raw)"; fi ;;
    esac
  done < <(docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null)
fi

cat > "$info_dir/README-RESTORE.txt" <<TXT
Backup of the old Demsoc website server ($(hostname)), made $(date -u +%FT%TZ).

Folders keep their original paths: var/www (or srv, home, opt) holds the site files; etc/nginx or
etc/apache2 holds the web server setup that served it; backup-info/INVENTORY.txt lists what ran here
(PHP, MySQL, services, cron jobs, domains and certificate dates).

Restore on a new server:
  1. Copy the site folder back, e.g.   sudo cp -a var/www/. /var/www/
  2. Recreate each database:           gunzip < backup-info/databases/mysql-NAME.sql.gz | sudo mysql
     (the dump creates the database itself). PostgreSQL:  gunzip < postgresql-all.sql.gz | sudo -u postgres psql
  3. Take the vhost from etc/nginx/sites-available or etc/apache2/sites-available, issue a new
     certificate with certbot, and check the PHP version in INVENTORY.txt.
For WordPress, wp-config.php holds the database name, user and password the site expects.

This archive may contain personal data (site users, form entries, subscribers). Keep it in Demsoc
storage, encrypted, and not on personal devices longer than needed.
TXT

# -- size check and archive -------------------------------------------------------
est_kb=$( (cd / && du -sck "${excludes[@]}" "${paths[@]}" 2>/dev/null) | tail -1 | cut -f1)
est_kb=$(( est_kb + $(du -sk "$stage" | cut -f1) ))
log "About $(( est_kb / 1024 )) MB to archive before compression, from: $(printf '/%s ' "${paths[@]}")"

tar_args=(--create --gzip --ignore-failed-read --warning=no-file-changed --warning=no-file-removed
          --transform "s,^,${name}/,S" "${excludes[@]}" -C / "${paths[@]}" -C "$stage" backup-info)

if (( stdout_mode )); then
  tar "${tar_args[@]}" --file -
  rc=$?
  (( rc <= 1 )) && log "Archive streamed to stdout" || { warn "tar exited with $rc"; exit "$rc"; }
  exit 0
fi

mkdir -p "$OUTPUT_DIR"
free_kb=$(df -Pk "$OUTPUT_DIR" | awk 'NR == 2 { print $4 }')
if (( free_kb < est_kb + 512 * 1024 )); then
  warn "only $(( free_kb / 1024 )) MB free in $OUTPUT_DIR for up to $(( est_kb / 1024 )) MB: use --stdout from your computer instead"
  exit 2
fi
out="$OUTPUT_DIR/$name.tar.gz"
tar "${tar_args[@]}" --file "$out"
rc=$?
(( rc <= 1 )) || { warn "tar exited with $rc; the archive may be incomplete"; exit "$rc"; }
(cd "$OUTPUT_DIR" && sha256sum "$name.tar.gz" > "$name.tar.gz.sha256")
chown "$owner": "$out" "$out.sha256" 2>/dev/null
files=$(tar -tzf "$out" | wc -l)
log "Done: $out ($(du -h "$out" | cut -f1), $files entries)"
cat >&2 <<MSG

Download it from YOUR computer (macOS, Linux or Windows PowerShell):
  scp ubuntu@$(hostname -I | awk '{ print $1 }'):$out .
  scp ubuntu@$(hostname -I | awk '{ print $1 }'):$out.sha256 .
Then check it is intact:
  macOS/Linux:  shasum -a 256 -c $name.tar.gz.sha256
  Windows:      Get-FileHash $name.tar.gz   (compare with the .sha256 file)
MSG
