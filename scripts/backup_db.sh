#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# backup_db.sh — Backup diário do PostgreSQL com rotação de 7 dias
#
# Uso:
#   ./scripts/backup_db.sh
#
# Configurar via cron (roda todo dia às 02:00):
#   0 2 * * * /caminho/para/inova-systems-erp/scripts/backup_db.sh >> /var/log/inova_backup.log 2>&1
#
# Restaurar um backup:
#   docker compose exec -T postgres psql -U $DB_USER $DB_NAME < /backups/inova_erp_2024-01-15.sql
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuração ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
DATE=$(date +%Y-%m-%d_%H%M%S)
ENV_FILE="$PROJECT_DIR/.env"

# ── Carregar variáveis de ambiente ────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
else
    echo "[backup_db] ERRO: arquivo .env não encontrado em $PROJECT_DIR"
    exit 1
fi

DB_NAME="${DB_NAME:-inova_erp}"
DB_USER="${DB_USER:-inova_user}"

# ── Fail-closed: BACKUP_ENCRYPTION_KEY é obrigatório ──────────────────────────
# Backups não criptografados expõem dados de clientes (LGPD). Se a key não
# está configurada, abortamos antes de gerar qualquer arquivo. Em dev local,
# defina BACKUP_ENCRYPTION_KEY=dev-only-not-secret no .env para destravar.
if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo "[backup_db] ERRO: BACKUP_ENCRYPTION_KEY não definida no .env. Abortando para evitar backup em texto-plano." >&2
    exit 1
fi
BACKUP_FILE="$BACKUP_DIR/inova_erp_${DATE}.sql.gz.enc"

# ── Criar diretório de backups ────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

echo "[backup_db] Iniciando backup: $BACKUP_FILE"

# ── Executar pg_dump via docker compose ───────────────────────────────────────
# `-pass env:VAR` faz o openssl ler a key da variável de ambiente em vez de
# `-pass pass:`, que expõe a key em /proc/<pid>/cmdline e `ps auxf`.
cd "$PROJECT_DIR"
export BACKUP_ENCRYPTION_KEY
docker compose exec -T postgres \
    pg_dump -U "$DB_USER" "$DB_NAME" \
    | gzip \
    | openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY \
    > "$BACKUP_FILE"
echo "[backup_db] Backup criptografado com AES-256-CBC"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[backup_db] Backup concluído: $BACKUP_FILE ($BACKUP_SIZE)"

# ── Verificação de integridade ──────────────────────────────────────────────
CHECKSUM_FILE="$BACKUP_FILE.sha256"
sha256sum "$BACKUP_FILE" > "$CHECKSUM_FILE"
echo "[backup_db] Checksum salvo: $CHECKSUM_FILE"

# ── Rotação: remover backups mais antigos que KEEP_DAYS dias ──────────────────
echo "[backup_db] Removendo backups com mais de $KEEP_DAYS dias..."
find "$BACKUP_DIR" \( -name "inova_erp_*.sql.gz" -o -name "inova_erp_*.sql.gz.enc" \) -mtime "+$KEEP_DAYS" -delete
REMAINING=$(find "$BACKUP_DIR" \( -name "inova_erp_*.sql.gz" -o -name "inova_erp_*.sql.gz.enc" \) | wc -l)
echo "[backup_db] Backups mantidos: $REMAINING arquivo(s)"

echo "[backup_db] Concluído em $(date)"
