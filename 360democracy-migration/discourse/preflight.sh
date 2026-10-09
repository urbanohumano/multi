#!/usr/bin/env bash
# Read-only checks before installing Discourse on an existing VPS. It changes nothing.
#
#   sudo DISCOURSE_HOSTNAME=community.example.org bash preflight.sh | tee preflight.txt
#
# Paste the whole output to whoever runs the install. DISCOURSE_HOSTNAME is optional;
# when given, the script also checks that its DNS points at this server.

set -uo pipefail

ok=0 warn=0 fail=0
line() { printf '%-5s %s\n' "$1" "$2"; }
pass() { line OK "$1"; ok=$((ok + 1)); }
note() { line WARN "$1"; warn=$((warn + 1)); }
bad()  { line FAIL "$1"; fail=$((fail + 1)); }
info() { line INFO "$1"; }
section() { printf '\n== %s ==\n' "$1"; }

port_listening() {  # works without ss: reads /proc/net/tcp{,6}
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
points_here() {  # true when one of the given addresses belongs to this server
  local ip
  for ip in $1; do hostname -I | tr ' ' '\n' | grep -x "$ip" >/dev/null && return 0; done
  return 1
}

printf '360 Democracy Discourse preflight, %s, host %s\n' "$(date -u +%FT%TZ)" "$(hostname)"
[[ $EUID -eq 0 ]] || note "not running as root: process names and web server configs are hidden (use sudo)"

section "System"
# shellcheck disable=SC1091
. /etc/os-release 2>/dev/null || true
info "os ${PRETTY_NAME:-unknown}, kernel $(uname -r), arch $(uname -m)"
case "${ID:-}-${VERSION_ID:-}" in
  ubuntu-22.04|ubuntu-24.04|debian-12|debian-13) pass "supported OS" ;;
  *) note "OS not in the tested list (Ubuntu 22.04/24.04, Debian 12)" ;;
esac
case "$(uname -m)" in x86_64|aarch64) pass "64-bit CPU architecture" ;; *) bad "unsupported architecture $(uname -m)" ;; esac
command -v systemctl >/dev/null && pass "systemd present" || note "no systemd"

section "CPU, memory, disk"
cpus=$(nproc)
mem_mb=$(awk '/^MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
avail_mb=$(awk '/^MemAvailable/ { print int($2 / 1024) }' /proc/meminfo)
swap_mb=$(awk '/^SwapTotal/ { print int($2 / 1024) }' /proc/meminfo)
info "cpu ${cpus}, ram ${mem_mb} MB (available now ${avail_mb} MB), swap ${swap_mb} MB"
(( cpus >= 2 )) && pass "2 or more CPUs" || note "1 CPU: Discourse will be slow"
(( mem_mb >= 3700 )) && pass "4 GB of RAM or more" || bad "less than 4 GB of RAM"
(( avail_mb >= 2500 )) && pass "2.5 GB or more RAM available" \
  || note "only ${avail_mb} MB available: other services already use memory; swap is essential"
(( swap_mb >= 1900 )) && pass "2 GB of swap or more" || note "little or no swap: the installer adds a 2 GB swapfile"
read -r size_gb free_gb < <(df -P -BG /var | awk 'NR == 2 { gsub("G", "", $2); gsub("G", "", $4); print $2, $4 }')
info "disk holding /var: ${size_gb} GB, ${free_gb} GB free"
if (( free_gb >= 20 )); then pass "20 GB or more free"
elif (( free_gb >= 12 )); then note "${free_gb} GB free is tight for Discourse, its rebuilds and local backups: enlarge the Gandi volume to 50 GB"
else bad "${free_gb} GB free: enlarge the Gandi volume before installing (Discourse needs 10 GB minimum)"; fi
if [[ -d /var/lib/docker && $EUID -eq 0 ]]; then info "docker data uses $(du -sh /var/lib/docker 2>/dev/null | cut -f1)"; fi

section "What already runs here"
web_in_use=0
for p in 80 443; do
  if port_listening "$p"; then web_in_use=1; info "port $p in use by $(port_owner "$p" || true)"; else info "port $p free"; fi
done
for p in 25 3000 5432 6379; do port_listening "$p" && info "port $p in use by $(port_owner "$p" || true)"; done
web=none
if command -v nginx >/dev/null && { service_active nginx || [[ -d /etc/nginx/sites-enabled ]]; }; then
  web=nginx; info "nginx $(nginx -v 2>&1 | cut -d/ -f2), active: $(service_active nginx && echo yes || echo no)"
  if [[ $EUID -eq 0 ]]; then
    names=$(nginx -T 2>/dev/null | awk '$1 == "server_name" { for (i = 2; i <= NF; i++) print $i }' \
      | tr -d ';' | sort -u | grep -v '^_$' | paste -sd' ' -)
    [[ -n $names ]] && info "nginx serves: $names"
  fi
fi
if command -v apache2ctl >/dev/null || command -v apachectl >/dev/null; then
  [[ $web == none ]] && web=apache
  info "apache active: $(service_active apache2 && echo yes || echo no)"
  [[ $EUID -eq 0 ]] && { apache2ctl -S 2>/dev/null || apachectl -S 2>/dev/null; } \
    | grep -E 'namevhost|alias' | sed 's/^ */INFO  apache vhost: /' | head -20
fi
for s in caddy traefik haproxy php8.1-fpm php8.2-fpm php8.3-fpm mysql mariadb postgresql docker; do
  service_active "$s" && info "service $s is active"
done
if command -v docker >/dev/null; then
  info "docker $(docker --version 2>/dev/null | cut -d' ' -f3 | tr -d ,)"
  [[ $EUID -eq 0 ]] && docker ps --format 'INFO  container {{.Names}} ({{.Image}}) {{.Ports}}' 2>/dev/null
else
  info "docker not installed (the installer adds it)"
fi
command -v certbot >/dev/null && { info "certbot present"; [[ $EUID -eq 0 ]] && certbot certificates 2>/dev/null | awk '/Domains:/ { $1 = ""; print "INFO  certificate for:" $0 }'; }
[[ -d /var/discourse ]] && note "/var/discourse already exists: an earlier Discourse install?"
if command -v ufw >/dev/null && [[ $EUID -eq 0 ]]; then info "ufw: $(ufw status 2>/dev/null | head -1)"; fi

section "Network"
for target in github.com:443 get.docker.com:443 registry-1.docker.io:443 smtp-relay.brevo.com:587 smtp.tem.scaleway.com:587; do
  host=${target%:*} port=${target##*:}
  if tcp_open "$host" "$port"; then pass "outbound $host:$port"; else
    case "$host" in smtp*) note "cannot reach $host:$port (only matters if that provider is chosen)" ;; *) bad "cannot reach $host:$port" ;; esac
  fi
done
info "addresses: $(hostname -I 2>/dev/null)"
if [[ -n ${DISCOURSE_HOSTNAME:-} ]]; then
  resolved=$(getent ahosts "$DISCOURSE_HOSTNAME" | awk '{ print $1 }' | sort -u | paste -sd' ' -)
  if [[ -z $resolved ]]; then note "$DISCOURSE_HOSTNAME does not resolve yet: create its A and AAAA records"
  elif points_here "$resolved"; then
    pass "$DISCOURSE_HOSTNAME points at this server ($resolved)"
  else note "$DISCOURSE_HOSTNAME resolves to $resolved, not to this server"; fi
fi

section "Verdict"
if (( web_in_use )); then
  info "install mode: socketed (Discourse behind the existing ${web} web server; existing sites untouched)"
  [[ $web == none ]] && note "ports 80/443 are taken but no nginx or Apache was found: the reverse proxy must be set up by hand"
else
  info "install mode: standalone (Discourse serves 80/443 itself)"
fi
printf 'summary: %d ok, %d warnings, %d failures\n' "$ok" "$warn" "$fail"
if (( fail )); then echo "NOT READY: fix the FAIL lines first"; exit 1; fi
echo "READY"
