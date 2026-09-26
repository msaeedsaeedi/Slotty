#!/usr/bin/env sh
# Nightly Postgres dump, keeping the last 14. Run from cron on the VPS, e.g.:
#   15 3 * * * /opt/slotty/deploy/backup.sh >> /var/log/slotty-backup.log 2>&1
# Copy the backups directory off the server too (another region, S3, …): a backup on the same disk isn't a backup.
set -eu
cd "$(dirname "$0")"
mkdir -p backups
file="backups/slotty-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T postgres pg_dump -U slotty -Fc slotty > "$file"
ls -1t backups/slotty-*.dump | tail -n +15 | xargs -r rm --
echo "$(date -Is) wrote $file"
