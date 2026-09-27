#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/animap}"
BACKUP_DIR="${OFFSITE_BACKUP_LOCAL_DIR:-${APP_DIR}/backups}"
LOG_FILE="${BACKUP_DIR}/offsite_verify.log"

REMOTE_USER="${OFFSITE_BACKUP_REMOTE_USER:-animapbackup}"
REMOTE_HOST="${OFFSITE_BACKUP_REMOTE_HOST:-OFFSITE_HOST_PLACEHOLDER}"
REMOTE_PORT="${OFFSITE_BACKUP_REMOTE_PORT:-30022}"
REMOTE_ROOT="${OFFSITE_BACKUP_REMOTE_ROOT:-/srv/animap-backups/animap}"
SSH_KEY="${OFFSITE_BACKUP_SSH_KEY:-/root/.ssh/animap_offsite_backup_ed25519}"

ssh_base=(ssh -i "${SSH_KEY}" -p "${REMOTE_PORT}" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o Compression=no -o IPQoS=throughput)

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*" | tee -a "${LOG_FILE}"
}

main() {
  mkdir -p "${BACKUP_DIR}"
  chmod 700 "${BACKUP_DIR}"

  local tmp_dir source_manifest remote_manifest diff_file
  tmp_dir="$(mktemp -d)"
  source_manifest="${tmp_dir}/source.txt"
  remote_manifest="${tmp_dir}/remote.txt"
  diff_file="${BACKUP_DIR}/offsite_verify_last.diff"
  trap "rm -rf '${tmp_dir}'" EXIT

  find "${APP_DIR}/backend/public/uploads" -maxdepth 1 -type f -printf '%f %s\n' | sort > "${source_manifest}"
  "${ssh_base[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "find '${REMOTE_ROOT}/current/uploads' -maxdepth 1 -type f ! -name '.*.relay-*' ! -name '.*.??????' -printf '%f %s\\n' | sort" > "${remote_manifest}"

  local source_count remote_count source_size remote_size
  source_count="$(wc -l < "${source_manifest}")"
  remote_count="$(wc -l < "${remote_manifest}")"
  source_size="$(awk '{sum += $NF} END {print sum + 0}' "${source_manifest}")"
  remote_size="$(awk '{sum += $NF} END {print sum + 0}' "${remote_manifest}")"

  if diff -u "${source_manifest}" "${remote_manifest}" > "${diff_file}"; then
    rm -f "${diff_file}"
    log "uploads verify OK; files=${source_count}; bytes=${source_size}"
  else
    log "ERROR uploads verify failed; source_files=${source_count}; remote_files=${remote_count}; source_bytes=${source_size}; remote_bytes=${remote_size}; diff=${diff_file}"
    exit 1
  fi
}

main "$@"
