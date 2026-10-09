#!/usr/bin/env bash
# Read-only checks before installing HumHub on the Demsoc VPS. It changes nothing.
#
#   sudo bash preflight.sh | tee preflight.txt
#   sudo HUMHUB_HOSTNAME=community.360democracy.com bash preflight.sh   (default hostname)
#
# Paste the whole output to whoever runs the install.

set -uo pipefail

: "${HUMHUB_HOSTNAME:=community.360democracy.com}"
ok=0 warn=0 fail=0
line() { printf '%-5s %s\n' "$1" "$2"; }
pass() { line OK "$1"; ok=$((ok + 1)); }
note() { line WARN "$1"; warn=$((warn + 1)); }
bad()  { line FAIL "$1"; fail=$((fail + 1)); }
info() { line INFO "$1"; }
section() { printf '\n== %s ==\n' "$1"; }

port_listening() {
  local hex f files=(); hex=$(printf ':%04X' "$1")
  for f in /proc/net/tcp /proc/net/tcp6; do [[ -r $f ]] && files+=("$f"); done   # tcp6 is absent without IPv6
  awk -v p="$hex" 'FNR > 1 && $4 == "0A" && substr($2, length($2) - 4) == p { f = 1 } END { exit !f }' "${files[@]}"
}
port_owner() {
  command -v ss >/dev/null || return 0
  ss -Hltnp "sport = :$1" 2>/dev/null | grep -o 'users:(("[^"]*"' | cut -d'"' -f2 | sort -u | paste -sd, -
}
tcp_open() { timeout 6 bash -c "exec 3<>/dev/tcp/$1/$2" 2>/dev/null; }
service_active() { command -v systemctl >/dev/null && systemctl is-active --quiet "$1" 2>/dev/null; }
version_ge() { [[ $(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1) == "$2" ]]; }
points_here() {
  local ip
  for ip in $1; do hostname -I | tr ' ' '\n' | grep -x "$ip" >/dev/null && return 0; done
  return 1
}

printf '360 Democracy HumHub preflight, %s, host %s\n' "$(date -u +%FT%TZ)" "$(hostname)"
[[ $EUID -eq 0 ]] || note "not running as root: process names and web server configs are hidden (use sudo)"

section "System"
# shellcheck disable=SC1091
. /etc/os-release 2>/dev/null || true
info "os ${PRETTY_NAME:-unknown}, kernel $(uname -r), arch $(uname -m)"
case "${ID:-}-${VERSION_ID:-}" in
  ubuntu-24.04|debian-12|debian-13) pass "supported OS for HumHub 1.18 (PHP 8.2+ and MariaDB 10.11+ from the distribution)" ;;
  ubuntu-22.04) bad "Ubuntu 22.04 ships PHP 8.1 and MariaDB 10.6, too old for HumHub 1.18: upgrade to 24.04 or use a new server" ;;
  *) bad "OS not supported by the installer (use Ubuntu 24.04 or Debian 12)" ;;
esac

section "CPU, memory, disk"
cpus=$(nproc)
mem_mb=$(awk '/^MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
avail_mb=$(awk '/^MemAvailable/ { print int($2 / 1024) }' /proc/meminfo)
swap_mb=$(awk '/^SwapTotal/ { print int($2 / 1024) }' /proc/meminfo)
info "cpu ${cpus}, ram ${mem_mb} MB (available now ${avail_mb} MB), swap ${swap_mb} MB"
(( mem_mb >= 1900 )) && pass "2 GB of RAM or more" || bad "less than 2 GB of RAM"
(( swap_mb >= 1000 )) && pass "swap present" || note "no swap: the installer adds a 2 GB swapfile"
read -r size_gb free_gb < <(df -P -BG /var | awk 'NR == 2 { gsub("G", "", $2); gsub("G", "", $4); print $2, $4 }')
info "disk holding /var: ${size_gb} GB, ${free_gb} GB free"
if (( free_gb >= 10 )); then pass "10 GB or more free"
elif (( free_gb >= 5 )); then note "${free_gb} GB free: enough to install, tight for uploads and backups"
else bad "${free_gb} GB free: enlarge the Gandi volume first"; fi

section "Software already here"
if command -v php >/dev/null; then
  phpv=$(php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;')
  case "$phpv" in 8.2|8.3|8.4) pass "PHP ${phpv} is supported by HumHub 1.18" ;; *) note "PHP ${phpv} is installed; HumHub 1.18 needs 8.2 to 8.4" ;; esac
else
  info "PHP not installed (the installer adds it)"
fi
if command -v mysql >/dev/null; then
  dbv=$(mysql --version 2>/dev/null)
  info "database client: ${dbv}"
  if [[ $dbv == *MariaDB* ]]; then
    v=$(grep -oE '[0-9]+\.[0-9]+\.[0-9]+-MariaDB' <<<"$dbv" | head -1); v=${v%-MariaDB}
    [[ -z $v ]] && v=$(grep -oE 'Distrib [0-9]+\.[0-9]+' <<<"$dbv" | cut -d' ' -f2)
    if [[ -n $v ]]; then version_ge "$v" 10.11 && pass "MariaDB ${v} is recent enough" || bad "MariaDB ${v} is older than the 10.11 HumHub needs"; fi
  fi
  if pgrep -x mariadbd >/dev/null || pgrep -x mysqld >/dev/null; then
    info "database server running: the installer reuses it and creates its own database"
    [[ $EUID -eq 0 ]] && { mysql -N -e 'SELECT 1' >/dev/null 2>&1 && pass "root can log in to the database by socket" || note "root needs a password for the database: pass MYSQL_ROOT_PASSWORD to the installer"; }
  fi
else
  info "no database installed (the installer adds MariaDB)"
fi
for p in 80 443; do
  if port_listening "$p"; then info "port $p in use by $(port_owner "$p" || true)"; else info "port $p free"; fi
done
web=none
if command -v nginx >/dev/null; then
  web=nginx; info "nginx $(nginx -v 2>&1 | cut -d/ -f2), active: $(service_active nginx && echo yes || echo no)"
  if [[ $EUID -eq 0 ]]; then
    names=$(nginx -T 2>/dev/null | awk '$1 == "server_name" { for (i = 2; i <= NF; i++) print $i }' | tr -d ';' | sort -u | grep -v '^_$' | paste -sd' ' -)
    [[ -n $names ]] && info "nginx serves: $names"
    grep -qw "$HUMHUB_HOSTNAME" <<<"$names" && note "nginx already has a server block for $HUMHUB_HOSTNAME"
  fi
fi
if command -v apache2ctl >/dev/null; then
  info "apache active: $(service_active apache2 && echo yes || echo no)"
  [[ $web == none ]] && service_active apache2 && web=apache
  [[ $EUID -eq 0 ]] && apache2ctl -S 2>/dev/null | grep -E 'namevhost|alias' | sed 's/^ */INFO  apache vhost: /' | head -20
fi
for s in caddy traefik haproxy docker; do service_active "$s" && info "service $s is active"; done
[[ -d /var/www/humhub ]] && note "/var/www/humhub already exists (an earlier install? the installer resumes it)"
command -v certbot >/dev/null && info "certbot present"
if command -v ufw >/dev/null && [[ $EUID -eq 0 ]]; then info "ufw: $(ufw status 2>/dev/null | head -1)"; fi

section "Network"
for target in download.humhub.com:443 marketplace.humhub.com:443 smtp-relay.brevo.com:587 smtp.tem.scaleway.com:587; do
  host=${target%:*} port=${target##*:}
  if tcp_open "$host" "$port"; then pass "outbound $host:$port"; else
    case "$host" in smtp*) note "cannot reach $host:$port (only matters if that provider is chosen)" ;; *) bad "cannot reach $host:$port" ;; esac
  fi
done
info "addresses: $(hostname -I 2>/dev/null)"
resolved=$(getent ahosts "$HUMHUB_HOSTNAME" | awk '{ print $1 }' | sort -u | paste -sd' ' -)
if [[ -z $resolved ]]; then note "$HUMHUB_HOSTNAME does not resolve yet: create its A and AAAA records (needed for HTTPS)"
elif points_here "$resolved"; then pass "$HUMHUB_HOSTNAME points at this server ($resolved)"
else note "$HUMHUB_HOSTNAME resolves to $resolved, not to this server"; fi

section "Verdict"
case "$web" in
  nginx) info "HumHub will be added as a new nginx site next to the existing ones" ;;
  apache) info "HumHub will be added as a new Apache site (run the installer with WEB_SERVER=apache)" ;;
  none) if port_listening 80; then note "port 80 is taken by something that is neither nginx nor Apache"; else info "nginx will be installed"; fi ;;
esac
printf 'summary: %d ok, %d warnings, %d failures\n' "$ok" "$warn" "$fail"
if (( fail )); then echo "NOT READY: fix the FAIL lines first"; exit 1; fi
echo "READY"
