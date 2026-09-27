#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

APP_DIR="${APP_DIR:-/var/www/animap}"
BACKUP_DIR="${OFFSITE_BACKUP_LOCAL_DIR:-${APP_DIR}/backups}"
LOG_FILE="${BACKUP_DIR}/offsite_backup.log"

REMOTE_USER="${OFFSITE_BACKUP_REMOTE_USER:-animapbackup}"
REMOTE_HOST="${OFFSITE_BACKUP_REMOTE_HOST:-OFFSITE_HOST_PLACEHOLDER}"
REMOTE_PORT="${OFFSITE_BACKUP_REMOTE_PORT:-30022}"
REMOTE_ROOT="${OFFSITE_BACKUP_REMOTE_ROOT:-/srv/animap-backups/animap}"
SSH_KEY="${OFFSITE_BACKUP_SSH_KEY:-/root/.ssh/animap_offsite_backup_ed25519}"

LOCAL_KEEP_DAYS="${OFFSITE_LOCAL_KEEP_DAYS:-7}"
REMOTE_KEEP_DAYS="${OFFSITE_REMOTE_KEEP_DAYS:-30}"
UPLOAD_SYNC_ENABLED="${UPLOAD_SYNC_ENABLED:-1}"
UPLOAD_SYNC_TIMEOUT_SECONDS="${UPLOAD_SYNC_TIMEOUT_SECONDS:-7200}"

timestamp="$(date +%Y%m%d_%H%M%S)"
run_dir="${BACKUP_DIR}/offsite-${timestamp}"
db_dump="${run_dir}/animap-db-${timestamp}.sql.zst"
config_archive="${run_dir}/animap-config-${timestamp}.tar.zst"
manifest="${run_dir}/manifest-${timestamp}.txt"

ssh_base=(ssh -i "${SSH_KEY}" -p "${REMOTE_PORT}" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o Compression=no -o IPQoS=throughput)
rsync_ssh="ssh -i ${SSH_KEY} -p ${REMOTE_PORT} -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o Compression=no -o IPQoS=throughput"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*" | tee -a "${LOG_FILE}"
}

require_file() {
  if [ ! -e "$1" ]; then
    log "ERROR missing required path: $1"
    exit 1
  fi
}

load_db_env() {
  local env_script
  env_script="$( (cd "${APP_DIR}/backend" && node - <<'NODE'
require('dotenv').config({ path: '.env' });
const keys = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
for (const key of keys) {
  console.log(`${key}=${JSON.stringify(process.env[key] || '')}`);
}
NODE
  ) 2>/dev/null)"

  eval "${env_script}"
  DB_HOST="${DB_HOST:-127.0.0.1}"
  DB_PORT="${DB_PORT:-5432}"
  DB_NAME="${DB_NAME:?missing DB_NAME in backend .env}"
  DB_USER="${DB_USER:?missing DB_USER in backend .env}"
  DB_PASSWORD="${DB_PASSWORD:?missing DB_PASSWORD in backend .env}"
}

remote_exec() {
  "${ssh_base[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "$1"
}

remote_put_file() {
  local src="$1"
  local dest_dir="$2"
  local base dest tmp
  base="$(basename "${src}")"
  dest="${dest_dir}/${base}"
  tmp="${dest}.tmp-${timestamp}"
  timeout 600 "${ssh_base[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "set -e; cat > '${tmp}'; mv '${tmp}' '${dest}'" < "${src}"
}

cleanup_local_run_dir() {
  if [ -d "${run_dir}" ] && [ "${KEEP_FAILED_BACKUP:-0}" != "1" ]; then
    rm -rf "${run_dir}"
  fi
}

mark_failed() {
  local exit_code="$1"
  local line_no="$2"
  set +e
  log "ERROR offsite backup failed; exit=${exit_code}; line=${line_no}"
  exit "${exit_code}"
}

trap 'mark_failed "$?" "$LINENO"' ERR
trap cleanup_local_run_dir EXIT

main() {
  mkdir -p "${BACKUP_DIR}" "${run_dir}"
  chmod 700 "${BACKUP_DIR}" "${run_dir}"
  exec 9>"${BACKUP_DIR}/offsite_backup.lock"
  if ! flock -n 9; then
    log "another offsite backup is already running; exiting"
    exit 0
  fi

  require_file "${APP_DIR}/backend/.env"
  require_file "${SSH_KEY}"
  require_file "${APP_DIR}/backend/public/uploads"

  log "offsite backup started: ${timestamp}"
  load_db_env

  log "creating remote directory layout"
  remote_exec "set -e; mkdir -p '${REMOTE_ROOT}/current/uploads' '${REMOTE_ROOT}/database' '${REMOTE_ROOT}/configs' '${REMOTE_ROOT}/manifests' '${REMOTE_ROOT}/deleted' '${REMOTE_ROOT}/logs'; chmod 750 '${REMOTE_ROOT}' '${REMOTE_ROOT}/current' '${REMOTE_ROOT}/current/uploads' '${REMOTE_ROOT}/database' '${REMOTE_ROOT}/configs' '${REMOTE_ROOT}/manifests' '${REMOTE_ROOT}/deleted' '${REMOTE_ROOT}/logs'"

  log "dumping PostgreSQL database: ${DB_NAME}"
  PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --format=plain \
    --no-owner \
    --no-privileges \
    | zstd -q -6 -T0 -o "${db_dump}"

  log "creating config archive"
  tar --ignore-failed-read --warning=no-file-changed -cf - \
    -C "${APP_DIR}" \
    backend/.env \
    backend/package.json \
    backend/package-lock.json \
    frontend/.env \
    frontend/package.json \
    frontend/package-lock.json \
    scripts/.events_sync.env \
    scripts/setup_cron.sh \
    scripts/sync_events.py \
    deploy.sh \
    update-app.sh \
    deploy-with-offsite.sh \
    README.md \
    /etc/nginx/sites-available \
    /etc/nginx/sites-enabled \
    /etc/cron.d/animap-events-sync \
    /etc/cron.d/animap-offsite-backup \
    /etc/systemd/system/pm2-root.service \
    /root/.pm2/dump.pm2 \
    | zstd -q -6 -T0 -o "${config_archive}"

  {
    printf 'timestamp=%s\n' "${timestamp}"
    printf 'source_host=%s\n' "$(hostname)"
    printf 'app_dir=%s\n' "${APP_DIR}"
    printf 'remote=%s@%s:%s\n' "${REMOTE_USER}" "${REMOTE_HOST}" "${REMOTE_ROOT}"
    printf 'database=%s\n' "${DB_NAME}"
    printf 'uploads_size=%s\n' "$(du -sh "${APP_DIR}/backend/public/uploads" | awk '{print $1}')"
    printf 'project_size=%s\n' "$(du -sh "${APP_DIR}" | awk '{print $1}')"
    sha256sum "${db_dump}" "${config_archive}"
  } > "${manifest}"

  log "syncing database dump and config archive"
  remote_put_file "${db_dump}" "${REMOTE_ROOT}/database"
  remote_put_file "${config_archive}" "${REMOTE_ROOT}/configs"
  remote_put_file "${manifest}" "${REMOTE_ROOT}/manifests"

  upload_status=0
  if [ "${UPLOAD_SYNC_ENABLED}" = "1" ]; then
    log "syncing uploads directory; timeout=${UPLOAD_SYNC_TIMEOUT_SECONDS}s"
    remote_exec "mkdir -p '${REMOTE_ROOT}/deleted/uploads-${timestamp}'"
    if timeout "${UPLOAD_SYNC_TIMEOUT_SECONDS}" rsync -a --whole-file --partial --partial-dir=.rsync-partial --timeout=600 --delete --backup --backup-dir="${REMOTE_ROOT}/deleted/uploads-${timestamp}" \
      -e "${rsync_ssh}" \
      "${APP_DIR}/backend/public/uploads/" \
      "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ROOT}/current/uploads/"; then
      log "uploads sync finished"
    else
      upload_status=$?
      log "WARNING uploads sync did not finish; exit=${upload_status}; database and config backup already uploaded"
    fi
  else
    log "uploads sync skipped by UPLOAD_SYNC_ENABLED=${UPLOAD_SYNC_ENABLED}"
  fi

  log "copying backup log tail"
  tail -n 500 "${LOG_FILE}" > "${run_dir}/offsite_backup-${timestamp}.log"
  if ! remote_put_file "${run_dir}/offsite_backup-${timestamp}.log" "${REMOTE_ROOT}/logs"; then
    log "WARNING failed to copy backup log tail; core backup files were already uploaded"
  fi

  log "applying retention"
  find "${BACKUP_DIR}" -maxdepth 1 -type d -name 'offsite-*' -mtime +"${LOCAL_KEEP_DAYS}" -exec rm -rf {} +
  if ! remote_exec "find '${REMOTE_ROOT}/database' -type f -name 'animap-db-*.sql.zst' -mtime +${REMOTE_KEEP_DAYS} -delete; find '${REMOTE_ROOT}/configs' -type f -name 'animap-config-*.tar.zst' -mtime +${REMOTE_KEEP_DAYS} -delete; find '${REMOTE_ROOT}/manifests' -type f -name 'manifest-*.txt' -mtime +${REMOTE_KEEP_DAYS} -delete; find '${REMOTE_ROOT}/logs' -type f -name 'offsite_backup-*.log' -mtime +${REMOTE_KEEP_DAYS} -delete; find '${REMOTE_ROOT}/deleted' -mindepth 1 -maxdepth 1 -type d -mtime +${REMOTE_KEEP_DAYS} -exec rm -rf {} +"; then
    log "WARNING failed to apply remote retention; backup files are still preserved"
  fi

  if [ "${upload_status}" != "0" ]; then
    log "offsite backup finished with uploads warning: ${timestamp}"
    exit "${upload_status}"
  fi

  log "offsite backup finished: ${timestamp}"
}

main "$@"
