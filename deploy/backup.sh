#!/bin/sh
# Backup de la base: un .sql.gz por dia en deploy/backups, guarda los ultimos 14.
#
# Programarlo en el droplet con `crontab -e`:
#   0 4 * * * /opt/cayman/cayman-backend/deploy/backup.sh >> /var/log/cayman-backup.log 2>&1
#
# Restaurar (sobre una base vacia):
#   gunzip -c backups/cayman-FECHA.sql.gz | docker compose exec -T db psql -U cayman -d cayman_bank
set -eu
cd "$(dirname "$0")"
mkdir -p backups

archivo="backups/cayman-$(date +%Y-%m-%d_%H%M).sql.gz"
docker compose exec -T db pg_dump -U cayman -d cayman_bank --no-owner | gzip > "$archivo"

# Un dump vacio o cortado no sirve; mejor fallar que creer que hay backup.
if [ "$(gunzip -c "$archivo" | grep -c 'CREATE TABLE')" -eq 0 ]; then
  echo "Backup invalido: $archivo" >&2
  rm -f "$archivo"
  exit 1
fi

ls -1t backups/cayman-*.sql.gz | tail -n +15 | xargs -r rm -f
echo "Backup ok: $archivo"
