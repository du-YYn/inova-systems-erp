#!/bin/sh
# F0: backup cifrado off-site do PostgreSQL (roda no host, via cron diario).
#
# Pre-requisitos no servidor (acao do operador, fora do repo):
#   01) apt install age rclone  (ou binarios estaticos)
#   02) Gerar par de chaves:  age-keygen -o /root/.config/age/backup.key
#       Guardar a CHAVE PRIVADA FORA do servidor (password manager).
#       Exportar a publica:   export AGE_RECIPIENT="age1..."
#   03) Configurar remote:    rclone config   (ex: Backblaze B2 "b2:inova-backups")
#   04) Cron (03:30):  30 3 * * * AGE_RECIPIENT=age1... RCLONE_REMOTE=b2:inova-backups /opt/inova-systems-erp/scripts/backup_offsite.sh
#
# O dump nunca toca o disco em claro: pg_dump | age | rclone.
set -eu

COMPOSE_DIR="${COMPOSE_DIR:-/opt/inova-systems-erp}"
RCLONE_REMOTE="${RCLONE_REMOTE:?defina RCLONE_REMOTE (ex: b2:inova-backups)}"
AGE_RECIPIENT="${AGE_RECIPIENT:?defina AGE_RECIPIENT (chave publica age1...)}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

STAMP=$(date +%Y%m%d_%H%M%S)
NAME="inova_erp_${STAMP}.dump.age"

cd "$COMPOSE_DIR"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' \
  | age -r "$AGE_RECIPIENT" \
  | rclone rcat "${RCLONE_REMOTE}/${NAME}"

# Verificacao: o objeto existe e tem tamanho > 0
SIZE=$(rclone size --json "${RCLONE_REMOTE}/${NAME}" | grep -o '"bytes":[0-9]*' | cut -d: -f2)
if [ "${SIZE:-0}" -le 0 ]; then
  echo "ERRO: backup off-site vazio (${NAME})" >&2
  exit 1
fi

# Retencao
rclone delete --min-age "${RETENTION_DAYS}d" "$RCLONE_REMOTE" || true
echo "Backup off-site OK: ${NAME} (${SIZE} bytes)"
