#!/usr/bin/env bash
# Non-interactive Discourse install for the 360 Democracy VPS (Ubuntu 22.04/24.04 or Debian 12, as root).
#
# Usage:
#   export DISCOURSE_HOSTNAME=community.example.org ADMIN_EMAILS=admin@example.org \
#          SMTP_HOST=smtp-relay.brevo.com SMTP_PORT=587 SMTP_USER=login SMTP_PASSWORD=key \
#          NOTIFICATION_EMAIL=noreply@community.example.org LETSENCRYPT_EMAIL=admin@example.org
#   bash install_discourse.sh
#
# The DNS A/AAAA record for DISCOURSE_HOSTNAME must already point at this server, and the
# SMTP domain must be verified (DKIM, SPF) at the email provider before the first invitation.
# NOT YET RUN ON A REAL SERVER: tested only for shell syntax.

set -euo pipefail

: "${DISCOURSE_HOSTNAME:?set DISCOURSE_HOSTNAME}"
: "${ADMIN_EMAILS:?set ADMIN_EMAILS (comma separated)}"
: "${SMTP_PORT:=587}"
if [[ -z "${SMTP_HOST:-}" ]]; then
  # No email provider yet: install with placeholders, create the admin with `rake admin:create`
  # and fill the SMTP values in containers/app.yml later (then ./launcher rebuild app).
  echo "SMTP_HOST not set: installing with placeholder SMTP; no email will be sent until app.yml is updated." >&2
  SMTP_HOST=smtp.example.invalid; SMTP_USER=placeholder; SMTP_PASSWORD=placeholder
fi
: "${SMTP_USER:?set SMTP_USER}"
: "${SMTP_PASSWORD:?set SMTP_PASSWORD}"
: "${NOTIFICATION_EMAIL:=noreply@${DISCOURSE_HOSTNAME}}"
: "${LETSENCRYPT_EMAIL:=${ADMIN_EMAILS%%,*}}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target=/var/discourse

mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
cpus=$(nproc)
if (( mem_mb < 3500 )); then
  echo "This server has ${mem_mb} MB of RAM; Discourse recommends 4 GB or more." >&2
fi
shared_buffers="$(( mem_mb / 4 ))MB"
workers=$(( cpus < 2 ? 2 : cpus ))

if ! command -v git >/dev/null; then
  apt-get update && apt-get install -y git
fi
if [[ ! -d "$target" ]]; then
  git clone https://github.com/discourse/discourse_docker.git "$target"
fi
mkdir -p "$target/containers" && chmod 700 "$target/containers"

sed -e "s|__HOSTNAME__|${DISCOURSE_HOSTNAME}|g" \
    -e "s|__ADMIN_EMAILS__|${ADMIN_EMAILS}|g" \
    -e "s|__SMTP_HOST__|${SMTP_HOST}|g" \
    -e "s|__SMTP_PORT__|${SMTP_PORT}|g" \
    -e "s|__SMTP_USER__|${SMTP_USER}|g" \
    -e "s|__SMTP_PASSWORD__|${SMTP_PASSWORD}|g" \
    -e "s|__NOTIFICATION_EMAIL__|${NOTIFICATION_EMAIL}|g" \
    -e "s|__LETSENCRYPT_EMAIL__|${LETSENCRYPT_EMAIL}|g" \
    -e "s|__DB_SHARED_BUFFERS__|${shared_buffers}|g" \
    -e "s|__UNICORN_WORKERS__|${workers}|g" \
    "$here/app.yml.example" > "$target/containers/app.yml"
chmod 600 "$target/containers/app.yml"

mkdir -p "$target/shared/standalone/import"
cp "$here/site_settings.rb" "$target/shared/standalone/import/site_settings.rb"
cp "$here/circle.rb" "$target/shared/standalone/import/circle.rb"

cd "$target"
./launcher bootstrap app
./launcher start app

cat <<MSG

Discourse is starting at https://${DISCOURSE_HOSTNAME}
Next:
  1. Create the first admin without email: ./launcher enter app && rake admin:create
     (or open the site and register with one of: ${ADMIN_EMAILS}, once SMTP works)
  2. Apply settings: ./launcher enter app && cd /var/www/discourse && \\
       su discourse -c 'bundle exec rails runner /shared/import/site_settings.rb'
  3. Send a test email from Admin > Email and check it lands in Gmail, Outlook and Proton inboxes.
MSG
