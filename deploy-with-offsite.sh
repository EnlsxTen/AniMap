#!/usr/bin/env bash
set -Eeuo pipefail

# AniMap production deployment plus offsite disaster-recovery bootstrap.
# Run on the production server from the project root. Secrets must be passed by
# environment variables or existing SSH keys; this file intentionally contains
# no server passwords.

APP_DIR="${APP_DIR:-/var/www/animap}"
BACKEND_DIR="${APP_DIR}/backend"
FRONTEND_DIR="${APP_DIR}/frontend"
BACKUP_DIR="${APP_DIR}/backups"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PM2_APP_NAME="${PM2_APP_NAME:-animap-backend}"
RUN_APP_UPDATE="${RUN_APP_UPDATE:-1}"
ASSUME_YES="${ASSUME_YES:-0}"
SITE_DOMAIN="${SITE_DOMAIN:-animap.top}"
SITE_ALIASES="${SITE_ALIASES:-www.animap.top}"
CONFIGURE_NGINX="${CONFIGURE_NGINX:-0}"
ENABLE_CERTBOT="${ENABLE_CERTBOT:-0}"
CONFIGURE_UFW="${CONFIGURE_UFW:-0}"
REDIS_ENABLED_VALUE="${REDIS_ENABLED:-true}"
REDIS_URL_VALUE="${REDIS_URL:-redis://127.0.0.1:6379}"
REDIS_CONNECT_TIMEOUT_MS_VALUE="${REDIS_CONNECT_TIMEOUT_MS:-500}"

BILIBILI_SYNC_ENABLED="${BILIBILI_SYNC_ENABLED:-1}"
BILIBILI_SYNC_CRON_ENABLED="${BILIBILI_SYNC_CRON_ENABLED:-1}"
BILIBILI_SYNC_CRON_PATH="${BILIBILI_SYNC_CRON_PATH:-/etc/cron.d/animap-events-sync}"
BILIBILI_SYNC_CRON_EXPR="${BILIBILI_SYNC_CRON_EXPR:-0 3 * * *}"
BILIBILI_VENV_DIR="${BILIBILI_VENV_DIR:-${APP_DIR}/scripts/venv}"
BILIBILI_SYNC_ENV_FILE="${BILIBILI_SYNC_ENV_FILE:-${APP_DIR}/scripts/.events_sync.env}"
BILIBILI_SYNC_LOG_DIR="${BILIBILI_SYNC_LOG_DIR:-/var/log/animap}"
BILIBILI_SYNC_LOG_FILE="${BILIBILI_SYNC_LOG_FILE:-${BILIBILI_SYNC_LOG_DIR}/events_sync.log}"
BILIBILI_SYNC_USE_PLAYWRIGHT="${BILIBILI_SYNC_USE_PLAYWRIGHT:-1}"
BILIBILI_INSTALL_PLAYWRIGHT="${BILIBILI_INSTALL_PLAYWRIGHT:-1}"

OFFSITE_REMOTE_HOST="${OFFSITE_BACKUP_REMOTE_HOST:-OFFSITE_HOST_PLACEHOLDER}"
OFFSITE_REMOTE_PORT="${OFFSITE_BACKUP_REMOTE_PORT:-22_PLACEHOLDER_PORT}"
OFFSITE_REMOTE_USER="${OFFSITE_BACKUP_REMOTE_USER:-backup_user}"
OFFSITE_REMOTE_ROOT="${OFFSITE_BACKUP_REMOTE_ROOT:-/srv/animap-backups/animap}"
OFFSITE_SSH_KEY="${OFFSITE_BACKUP_SSH_KEY:-/root/.ssh/animap_offsite_backup_ed25519}"
OFFSITE_CRON_PATH="${OFFSITE_BACKUP_CRON:-/etc/cron.d/animap-offsite-backup}"
OFFSITE_SCHEDULE_TEXT="${OFFSITE_BACKUP_SCHEDULE:-姣忓ぉ 04:20 鑷姩澶囦唤锛?6:40 鑷姩鏍￠獙}"
OFFSITE_BACKUP_CRON_EXPR="${OFFSITE_BACKUP_CRON_EXPR:-20 20 * * *}"
OFFSITE_VERIFY_CRON_EXPR="${OFFSITE_VERIFY_CRON_EXPR:-40 22 * * *}"
OFFSITE_PROVISION_REMOTE="${OFFSITE_PROVISION_REMOTE:-0}"
OFFSITE_REMOTE_ADMIN="${OFFSITE_REMOTE_ADMIN:-root}"
OFFSITE_REMOTE_ADMIN_PASSWORD="${OFFSITE_REMOTE_ADMIN_PASSWORD:-}"
OFFSITE_RUN_INITIAL_BACKUP="${OFFSITE_RUN_INITIAL_BACKUP:-0}"
OFFSITE_INITIAL_UPLOAD_SYNC="${OFFSITE_INITIAL_UPLOAD_SYNC:-0}"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log() { echo -e "${BLUE}[*]${NC} $*"; }
ok() { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

require_root() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    err "璇风敤 root 鎴?sudo 杩愯"
    exit 1
  fi
}

confirm() {
  if [ "${ASSUME_YES}" = "1" ]; then
    return 0
  fi

  echo ""
  echo "鏈剼鏈皢鎵ц锛?
  echo "  1. 妫€鏌ュ苟瀹夎鐢熶骇鎶€鏈爤锛歂ode.js 18銆丳M2銆丯ginx銆丳ostgreSQL銆丷edis銆丳ython venv銆乧ron銆乺sync銆亃std"
  echo "  2. 澧為噺鏇存柊 AniMap 搴旂敤骞朵繚鐣?.env銆乽ploads銆佹暟鎹簱鍐呭"
  echo "  3. 瀹夎/鍒锋柊 B绔欏悓姝ヨ剼鏈拰瀹氭椂浠诲姟"
  echo "  4. 瀹夎/鍒锋柊寮傚湴澶囦唤鑴氭湰鍒?${APP_DIR}/scripts"
  echo "  5. 鐢熸垚鎴栧鐢ㄧ敓浜ф満鍒板紓鍦?VPS 鐨?SSH key"
  echo "  6. 瀹夎 cron锛氭瘡澶╁畾鏃跺浠藉拰鏍￠獙 uploads"
  echo "  7. 鍐欏叆 backend/.env 鐨?Redis銆丅绔欏悓姝ャ€佸紓鍦板浠界姸鎬佸睍绀洪厤缃?
  echo ""
  echo "绔欑偣鍩熷悕锛?{SITE_DOMAIN} ${SITE_ALIASES}"
  echo "Redis锛?{REDIS_URL_VALUE}"
  echo "B绔欏悓姝?Python锛?{BILIBILI_VENV_DIR}/bin/python"
  echo "寮傚湴鐩爣锛?{OFFSITE_REMOTE_USER}@${OFFSITE_REMOTE_HOST}:${OFFSITE_REMOTE_PORT}:${OFFSITE_REMOTE_ROOT}"
  echo ""
  read -rp "纭缁х画锛?y/N): " reply
  [ "${reply}" = "y" ] || [ "${reply}" = "Y" ]
}

install_packages() {
  log "瀹夎鐢熶骇杩愯渚濊禆"
  apt-get update -y >/dev/null
  apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    lsof \
    ufw \
    nginx \
    postgresql \
    postgresql-contrib \
    redis-server \
    certbot \
    python3-certbot-nginx \
    python3 \
    python3-venv \
    python3-pip \
    rsync \
    zstd \
    openssh-client \
    cron >/dev/null
  if [ -n "${OFFSITE_REMOTE_ADMIN_PASSWORD}" ]; then
    apt-get install -y sshpass >/dev/null
  fi
  ok "绯荤粺鍖呭凡灏辩华"
}

ensure_node_runtime() {
  local need_node=0 node_major="0"
  if command -v node >/dev/null 2>&1; then
    node_major="$(node -v | sed 's/^v//' | cut -d. -f1)"
  else
    need_node=1
  fi

  if [ "${node_major}" -lt 18 ]; then
    need_node=1
  fi

  if [ "${need_node}" = "1" ]; then
    log "瀹夎 Node.js 18"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - >/dev/null
    apt-get install -y nodejs >/dev/null
  fi

  if ! command -v pm2 >/dev/null 2>&1; then
    log "瀹夎 PM2"
    npm install -g pm2 >/dev/null
  fi

  ok "Node $(node -v) / npm $(npm -v) / PM2 $(pm2 -v) 宸插氨缁?
}

ensure_services() {
  log "鍚姩鐢熶骇绯荤粺鏈嶅姟"
  systemctl enable --now postgresql >/dev/null 2>&1 || true
  systemctl enable --now redis-server >/dev/null 2>&1 || true
  systemctl enable --now cron >/dev/null 2>&1 || true
  systemctl enable --now nginx >/dev/null 2>&1 || true

  if redis-cli ping >/dev/null 2>&1; then
    ok "Redis 鍙敤"
  else
    warn "Redis 鏈搷搴旓紝鍚庣浼氳嚜鍔ㄥ洖閫€鏁版嵁搴撴煡璇?
  fi
}

ensure_project() {
  for target in "${BACKEND_DIR}/package.json" "${FRONTEND_DIR}/package.json" "${BACKEND_DIR}/src/server.ts" "${FRONTEND_DIR}/index.html"; do
    if [ ! -f "${target}" ]; then
      err "椤圭洰鏂囦欢缂哄け锛?{target}"
      exit 1
    fi
  done

  if [ ! -f "${BACKEND_DIR}/.env" ] || [ ! -f "${FRONTEND_DIR}/.env" ]; then
    err "鐢熶骇 .env 涓嶅畬鏁达紝鍋滄閮ㄧ讲锛岄伩鍏嶈鐩栫幇鏈夐厤缃?
    exit 1
  fi
}

pull_code_if_possible() {
  if [ ! -d "${APP_DIR}/.git" ]; then
    warn "${APP_DIR} 涓嶆槸 Git 浠撳簱锛岃烦杩?git pull"
    return 0
  fi

  log "鎷夊彇褰撳墠鍒嗘敮鏈€鏂颁唬鐮?
  cd "${APP_DIR}"
  if [ -n "$(git status --porcelain --untracked-files=no)" ] && [ "${ALLOW_DIRTY_GIT:-0}" != "1" ]; then
    err "鏈嶅姟鍣ㄤ粨搴撳瓨鍦ㄥ凡璺熻釜鏂囦欢鏀瑰姩銆傜‘璁ゅ悗鍙缃?ALLOW_DIRTY_GIT=1 鍐嶈繍琛屻€?
    git status --short
    exit 1
  fi

  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  git fetch origin "${branch}"
  git pull --ff-only origin "${branch}"
  ok "浠ｇ爜宸叉洿鏂板埌 ${branch} 鏈€鏂版彁浜?
}

backup_env_and_uploads_metadata() {
  local stamp deploy_backup
  stamp="$(date +%Y%m%d_%H%M%S)"
  deploy_backup="${BACKUP_DIR}/predeploy-${stamp}"
  mkdir -p "${deploy_backup}"
  chmod 700 "${BACKUP_DIR}" "${deploy_backup}"
  cp "${BACKEND_DIR}/.env" "${deploy_backup}/backend.env"
  cp "${FRONTEND_DIR}/.env" "${deploy_backup}/frontend.env"
  if [ -d "${BACKEND_DIR}/public/uploads" ]; then
    find "${BACKEND_DIR}/public/uploads" -maxdepth 1 -type f -printf '%f %s\n' | sort > "${deploy_backup}/uploads.manifest"
  fi
  ok "閮ㄧ讲鍓嶉厤缃揩鐓у凡淇濆瓨锛?{deploy_backup}"
}

load_db_env_for_shell() {
  (cd "${BACKEND_DIR}" && node - <<'NODE'
require('dotenv').config({ path: '.env' });
const keys = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
for (const key of keys) {
  console.log(`${key}=${JSON.stringify(process.env[key] || '')}`);
}
NODE
  )
}

backup_database_before_migrate() {
  if ! command -v pg_dump >/dev/null 2>&1; then
    warn "鏈壘鍒?pg_dump锛岃烦杩囬儴缃插墠鏁版嵁搴撳揩鐓?
    return 0
  fi

  local stamp db_backup env_script
  stamp="$(date +%Y%m%d_%H%M%S)"
  db_backup="${BACKUP_DIR}/predeploy-db-${stamp}.sql.zst"
  env_script="$(load_db_env_for_shell)"
  eval "${env_script}"

  DB_HOST="${DB_HOST:-127.0.0.1}"
  DB_PORT="${DB_PORT:-5432}"
  if [ -z "${DB_NAME:-}" ] || [ -z "${DB_USER:-}" ]; then
    warn "backend/.env 缂哄皯 DB_NAME/DB_USER锛岃烦杩囬儴缃插墠鏁版嵁搴撳揩鐓?
    return 0
  fi

  log "閮ㄧ讲鍓嶅浠?PostgreSQL 鏁版嵁搴擄細${DB_NAME}"
  PGPASSWORD="${DB_PASSWORD:-}" pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --format=plain \
    --no-owner \
    --no-privileges \
    | zstd -q -6 -T0 -o "${db_backup}"
  chmod 600 "${db_backup}"
  ok "鏁版嵁搴撳揩鐓у凡淇濆瓨锛?{db_backup}"
}

deploy_app() {
  if [ "${RUN_APP_UPDATE}" != "1" ]; then
    warn "RUN_APP_UPDATE=${RUN_APP_UPDATE}锛岃烦杩囧簲鐢ㄦ洿鏂?
    return 0
  fi

  pull_code_if_possible
  backup_env_and_uploads_metadata

  log "瀹夎鍚庣渚濊禆"
  cd "${BACKEND_DIR}"
  npm install
  chmod 0755 "${APP_DIR}" "${BACKEND_DIR}" "${FRONTEND_DIR}" "${APP_DIR}/scripts" 2>/dev/null || true
  chmod 0750 "${BACKUP_DIR}" 2>/dev/null || true
  chmod 0600 "${BACKEND_DIR}/.env" "${APP_DIR}/scripts/.events_sync.env" 2>/dev/null || true
  chmod 0755 "${BACKEND_DIR}/public" "${BACKEND_DIR}/public/uploads" 2>/dev/null || true
  find "${BACKEND_DIR}/public/uploads" -type d -exec chmod 0755 {} \; 2>/dev/null || true
  find "${BACKEND_DIR}/public/uploads" -type f -exec chmod 0644 {} \; 2>/dev/null || true

  backup_database_before_migrate

  log "鏋勫缓鍚庣骞舵墽琛屽閲忚縼绉?
  npm run build
  npm run migrate

  log "閲嶅惎 PM2 鍚庣杩涚▼"
  pm2 restart "${PM2_APP_NAME}" || pm2 start dist/server.js --name "${PM2_APP_NAME}"
  pm2 save
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
  systemctl enable pm2-root >/dev/null 2>&1 || true

  log "瀹夎鍓嶇渚濊禆骞舵瀯寤?
  cd "${FRONTEND_DIR}"
  npm install
  npm run build
  ok "搴旂敤閮ㄧ讲瀹屾垚"
}

upsert_env() {
  local file="$1" key="$2" value="$3" escaped
  escaped="$(printf '%s' "${value}" | sed -e 's/[\/&]/\\&/g')"
  touch "${file}"
  if grep -qE "^${key}=" "${file}"; then
    sed -i "s/^${key}=.*/${key}=${escaped}/" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

configure_backend_runtime_env() {
  log "鍐欏叆鍚庣杩愯鏃堕厤缃細Redis銆丅绔欏悓姝ャ€佸紓鍦板浠?
  upsert_env "${BACKEND_DIR}/.env" REDIS_ENABLED "${REDIS_ENABLED_VALUE}"
  upsert_env "${BACKEND_DIR}/.env" REDIS_URL "${REDIS_URL_VALUE}"
  upsert_env "${BACKEND_DIR}/.env" REDIS_CONNECT_TIMEOUT_MS "${REDIS_CONNECT_TIMEOUT_MS_VALUE}"
  upsert_env "${BACKEND_DIR}/.env" HOST "127.0.0.1"

  upsert_env "${BACKEND_DIR}/.env" BILIBILI_SYNC_SCRIPT "${APP_DIR}/scripts/sync_events.py"
  upsert_env "${BACKEND_DIR}/.env" BILIBILI_SYNC_PYTHON "${BILIBILI_VENV_DIR}/bin/python"
  upsert_env "${BACKEND_DIR}/.env" BILIBILI_SYNC_ENV_FILE "${BILIBILI_SYNC_ENV_FILE}"

  upsert_env "${BACKEND_DIR}/.env" OFFSITE_BACKUP_REMOTE_HOST "${OFFSITE_REMOTE_HOST}"
  upsert_env "${BACKEND_DIR}/.env" OFFSITE_BACKUP_REMOTE_PORT "${OFFSITE_REMOTE_PORT}"
  upsert_env "${BACKEND_DIR}/.env" OFFSITE_BACKUP_REMOTE_USER "${OFFSITE_REMOTE_USER}"
  upsert_env "${BACKEND_DIR}/.env" OFFSITE_BACKUP_REMOTE_ROOT "${OFFSITE_REMOTE_ROOT}"
  upsert_env "${BACKEND_DIR}/.env" OFFSITE_BACKUP_SCHEDULE "${OFFSITE_SCHEDULE_TEXT}"
  upsert_env "${BACKEND_DIR}/.env" OFFSITE_BACKUP_SCRIPT "${APP_DIR}/scripts/offsite_backup.sh"
  upsert_env "${BACKEND_DIR}/.env" OFFSITE_VERIFY_SCRIPT "${APP_DIR}/scripts/offsite_verify_uploads.sh"
  upsert_env "${BACKEND_DIR}/.env" OFFSITE_BACKUP_CRON "${OFFSITE_CRON_PATH}"
  chmod 0600 "${BACKEND_DIR}/.env"
  ok "鍚庣杩愯鏃堕厤缃凡鏇存柊"
}

install_bilibili_sync() {
  if [ "${BILIBILI_SYNC_ENABLED}" != "1" ]; then
    warn "BILIBILI_SYNC_ENABLED=${BILIBILI_SYNC_ENABLED}锛岃烦杩?B绔欏悓姝ヨ剼鏈畨瑁?
    return 0
  fi

  log "瀹夎 B绔欎細鍛樿喘鍚屾鑴氭湰鍜?Python 杩愯鐜"
  mkdir -p "${APP_DIR}/scripts" "${BILIBILI_SYNC_LOG_DIR}"
  install -m 755 -o root -g root "${SCRIPT_DIR}/scripts/sync_events.py" "${APP_DIR}/scripts/sync_events.py"
  install -m 755 -o root -g root "${SCRIPT_DIR}/scripts/setup_cron.sh" "${APP_DIR}/scripts/setup_cron.sh"
  python3 -m py_compile "${APP_DIR}/scripts/sync_events.py"

  if [ ! -x "${BILIBILI_VENV_DIR}/bin/python" ]; then
    python3 -m venv "${BILIBILI_VENV_DIR}"
  fi
  "${BILIBILI_VENV_DIR}/bin/python" -m pip install --upgrade pip setuptools wheel >/dev/null
  "${BILIBILI_VENV_DIR}/bin/pip" install requests beautifulsoup4 psycopg2-binary pillow playwright >/dev/null

  if [ "${BILIBILI_INSTALL_PLAYWRIGHT}" = "1" ]; then
    if ! "${BILIBILI_VENV_DIR}/bin/python" -m playwright install --with-deps chromium >/dev/null; then
      warn "Playwright Chromium 瀹夎澶辫触锛汢绔欏悓姝ヤ粛鍙蛋 requests 鍩虹瑙ｆ瀽锛屽姩鎬侀〉鍏滃簳鍙兘涓嶅彲鐢?
    fi
  fi

  touch "${BILIBILI_SYNC_LOG_FILE}"
  chmod 0644 "${BILIBILI_SYNC_LOG_FILE}"

  if [ ! -f "${BILIBILI_SYNC_ENV_FILE}" ]; then
    cat > "${BILIBILI_SYNC_ENV_FILE}" <<'EOF'
# AniMap B绔欏悓姝ョ幆澧冨彉閲忋€傝繖閲屼繚瀛樼敓浜у瘑閽ワ紝涓嶈鎻愪氦鍒?Git銆?AMAP_WEB_SERVICE_KEY=
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=animap
DB_USER=system
DB_PASSWORD=
ANIMAP_IMPORT_USER_ID=
ANIMAP_UPLOAD_DIR=/var/www/animap/backend/public/uploads
EVENT_SCOPE=convention
EOF
    chmod 0600 "${BILIBILI_SYNC_ENV_FILE}"
    warn "宸插垱寤?${BILIBILI_SYNC_ENV_FILE}锛岃琛ラ綈楂樺痉 Key銆佹暟鎹簱瀵嗙爜鍜屽鍏ョ敤鎴?ID"
  else
    chmod 0600 "${BILIBILI_SYNC_ENV_FILE}"
  fi

  ok "B绔欏悓姝ヨ繍琛岀幆澧冨凡灏辩华锛?{BILIBILI_VENV_DIR}"
}

install_bilibili_cron() {
  if [ "${BILIBILI_SYNC_ENABLED}" != "1" ] || [ "${BILIBILI_SYNC_CRON_ENABLED}" != "1" ]; then
    warn "璺宠繃 B绔欏悓姝?cron"
    return 0
  fi

  local playwright_flag=""
  if [ "${BILIBILI_SYNC_USE_PLAYWRIGHT}" = "1" ]; then
    playwright_flag="--playwright"
  fi

  log "瀹夎 B绔欏悓姝ュ畾鏃朵换鍔?
  cat > "${BILIBILI_SYNC_CRON_PATH}" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# AniMap B绔欎細鍛樿喘娲诲姩鍚屾銆傛寜鏈嶅姟鍣ㄦ椂鍖烘墽琛屻€?${BILIBILI_SYNC_CRON_EXPR} root set -a; source "${BILIBILI_SYNC_ENV_FILE}"; set +a; cd "${APP_DIR}/scripts"; "${BILIBILI_VENV_DIR}/bin/python" "${APP_DIR}/scripts/sync_events.py" --event-scope "\${EVENT_SCOPE:-convention}" ${playwright_flag} >> "${BILIBILI_SYNC_LOG_FILE}" 2>&1
EOF
  chmod 0644 "${BILIBILI_SYNC_CRON_PATH}"
  ok "B绔欏悓姝?cron 宸插畨瑁咃細${BILIBILI_SYNC_CRON_PATH}"
}

configure_nginx_if_requested() {
  if [ "${CONFIGURE_NGINX}" != "1" ]; then
    warn "CONFIGURE_NGINX=${CONFIGURE_NGINX}锛屼繚鐣欑幇鏈?Nginx 閰嶇疆"
    return 0
  fi

  log "鍐欏叆 Nginx 绔欑偣閰嶇疆"
  local server_names="${SITE_DOMAIN} ${SITE_ALIASES}"
  cat > /etc/nginx/sites-available/animap <<EOF
server {
    server_name ${server_names};
    client_max_body_size 20M;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "geolocation=(self), camera=(), microphone=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://webapi.amap.com https://restapi.amap.com https://jsapi.amap.com https://mapplugin.amap.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://webapi.amap.com https://jsapi.amap.com; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://restapi.amap.com https://webapi.amap.com https://jsapi.amap.com https://mapplugin.amap.com https://custyle.amap.com https://o4.amap.com https://jsapi-data1.amap.com https://jsapi-data2.amap.com https://jsapi-data3.amap.com https://jsapi-data4.amap.com https://jsapi-data5.amap.com; frame-src 'self' https://webapi.amap.com https://jsapi.amap.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'" always;

    location / {
        root ${FRONTEND_DIR}/dist;
        try_files \$uri \$uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads {
        alias ${BACKEND_DIR}/public/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options "nosniff" always;
        add_header Content-Security-Policy "default-src 'none'" always;
        types { image/webp webp; image/jpeg jpg jpeg; image/png png; image/gif gif; }
        default_type application/octet-stream;
    }

    listen 80;
}
EOF
  ln -sfn /etc/nginx/sites-available/animap /etc/nginx/sites-enabled/animap
  nginx -t
  systemctl reload nginx

  if [ "${ENABLE_CERTBOT}" = "1" ]; then
    local certbot_args=(--nginx -d "${SITE_DOMAIN}" --non-interactive --agree-tos --redirect)
    local alias_name
    for alias_name in ${SITE_ALIASES}; do
      certbot_args+=(-d "${alias_name}")
    done
    if [ -n "${LE_EMAIL:-}" ]; then
      certbot_args+=(--email "${LE_EMAIL}")
    else
      certbot_args+=(--register-unsafely-without-email)
    fi
    certbot "${certbot_args[@]}"
  fi
  ok "Nginx 閰嶇疆宸插鐞?
}

configure_ufw_if_requested() {
  if [ "${CONFIGURE_UFW}" != "1" ]; then
    warn "CONFIGURE_UFW=${CONFIGURE_UFW}锛屼繚鐣欑幇鏈夐槻鐏閰嶇疆"
    return 0
  fi

  log "閰嶇疆 UFW 闃茬伀澧?
  ufw allow OpenSSH >/dev/null || true
  ufw allow 80/tcp >/dev/null || true
  ufw allow 443/tcp >/dev/null || true
  ufw --force enable >/dev/null || true
  ok "UFW 宸插厑璁?SSH/80/443"
}

install_offsite_scripts() {
  log "瀹夎寮傚湴澶囦唤鑴氭湰"
  mkdir -p "${APP_DIR}/scripts" "${BACKUP_DIR}"
  chmod 700 "${BACKUP_DIR}"
  install -m 700 -o root -g root "${SCRIPT_DIR}/scripts/offsite_backup.sh" "${APP_DIR}/scripts/offsite_backup.sh"
  install -m 700 -o root -g root "${SCRIPT_DIR}/scripts/offsite_verify_uploads.sh" "${APP_DIR}/scripts/offsite_verify_uploads.sh"
  bash -n "${APP_DIR}/scripts/offsite_backup.sh"
  bash -n "${APP_DIR}/scripts/offsite_verify_uploads.sh"

  upsert_env "${BACKEND_DIR}/.env" OFFSITE_BACKUP_REMOTE_HOST "${OFFSITE_REMOTE_HOST}"
  upsert_env "${BACKEND_DIR}/.env" OFFSITE_BACKUP_REMOTE_PORT "${OFFSITE_REMOTE_PORT}"
  upsert_env "${BACKEND_DIR}/.env" OFFSITE_BACKUP_REMOTE_USER "${OFFSITE_REMOTE_USER}"
  upsert_env "${BACKEND_DIR}/.env" OFFSITE_BACKUP_REMOTE_ROOT "${OFFSITE_REMOTE_ROOT}"
  upsert_env "${BACKEND_DIR}/.env" OFFSITE_BACKUP_SCHEDULE "${OFFSITE_SCHEDULE_TEXT}"
  upsert_env "${BACKEND_DIR}/.env" OFFSITE_BACKUP_SCRIPT "${APP_DIR}/scripts/offsite_backup.sh"
  upsert_env "${BACKEND_DIR}/.env" OFFSITE_VERIFY_SCRIPT "${APP_DIR}/scripts/offsite_verify_uploads.sh"
  upsert_env "${BACKEND_DIR}/.env" OFFSITE_BACKUP_CRON "${OFFSITE_CRON_PATH}"

  ok "寮傚湴澶囦唤鑴氭湰鍜?backend/.env 鐘舵€侀厤缃凡鏇存柊"
}

ensure_offsite_key() {
  log "妫€鏌ョ敓浜ф満鍒板紓鍦?VPS 鐨?SSH key"
  mkdir -p "$(dirname "${OFFSITE_SSH_KEY}")"
  chmod 700 "$(dirname "${OFFSITE_SSH_KEY}")"
  if [ ! -f "${OFFSITE_SSH_KEY}" ]; then
    ssh-keygen -t ed25519 -f "${OFFSITE_SSH_KEY}" -N "" -C "animap-offsite@$(hostname)-$(date +%Y%m%d)" >/dev/null
    chmod 600 "${OFFSITE_SSH_KEY}"
    chmod 644 "${OFFSITE_SSH_KEY}.pub"
    ok "宸茬敓鎴?SSH key锛?{OFFSITE_SSH_KEY}"
  else
    ok "澶嶇敤 SSH key锛?{OFFSITE_SSH_KEY}"
  fi
}

remote_admin_ssh() {
  if [ -n "${OFFSITE_REMOTE_ADMIN_PASSWORD}" ]; then
    SSHPASS="${OFFSITE_REMOTE_ADMIN_PASSWORD}" sshpass -e ssh -p "${OFFSITE_REMOTE_PORT}" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 "${OFFSITE_REMOTE_ADMIN}@${OFFSITE_REMOTE_HOST}" "$@"
  else
    ssh -p "${OFFSITE_REMOTE_PORT}" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 "${OFFSITE_REMOTE_ADMIN}@${OFFSITE_REMOTE_HOST}" "$@"
  fi
}

provision_remote_if_requested() {
  if [ "${OFFSITE_PROVISION_REMOTE}" != "1" ]; then
    warn "OFFSITE_PROVISION_REMOTE=${OFFSITE_PROVISION_REMOTE}锛岃烦杩囪繙绔?VPS 鍒濆鍖?
    return 0
  fi

  log "鍒濆鍖栧紓鍦?VPS 鐩綍鍜屽浠界敤鎴?
  local pub_key_b64
  pub_key_b64="$(base64 -w0 "${OFFSITE_SSH_KEY}.pub")"
  remote_admin_ssh "PUB_KEY_B64='${pub_key_b64}' REMOTE_USER='${OFFSITE_REMOTE_USER}' REMOTE_ROOT='${OFFSITE_REMOTE_ROOT}' bash -s" <<'REMOTE'
set -Eeuo pipefail
pub_key="$(printf '%s' "${PUB_KEY_B64}" | base64 -d)"
if ! id "${REMOTE_USER}" >/dev/null 2>&1; then
  useradd -m -s /usr/sbin/nologin "${REMOTE_USER}"
fi
home_dir="$(getent passwd "${REMOTE_USER}" | cut -d: -f6)"
mkdir -p "${home_dir}/.ssh"
touch "${home_dir}/.ssh/authorized_keys"
grep -qxF "${pub_key}" "${home_dir}/.ssh/authorized_keys" || printf '%s\n' "${pub_key}" >> "${home_dir}/.ssh/authorized_keys"
chmod 700 "${home_dir}/.ssh"
chmod 600 "${home_dir}/.ssh/authorized_keys"
chown -R "${REMOTE_USER}:${REMOTE_USER}" "${home_dir}/.ssh"
mkdir -p "${REMOTE_ROOT}/current/uploads" "${REMOTE_ROOT}/database" "${REMOTE_ROOT}/configs" "${REMOTE_ROOT}/manifests" "${REMOTE_ROOT}/deleted" "${REMOTE_ROOT}/logs"
chown -R "${REMOTE_USER}:${REMOTE_USER}" "${REMOTE_ROOT}"
chmod 750 "${REMOTE_ROOT}" "${REMOTE_ROOT}/current" "${REMOTE_ROOT}/current/uploads" "${REMOTE_ROOT}/database" "${REMOTE_ROOT}/configs" "${REMOTE_ROOT}/manifests" "${REMOTE_ROOT}/deleted" "${REMOTE_ROOT}/logs"
REMOTE
  ok "寮傚湴 VPS 宸插垵濮嬪寲"
}

test_backup_ssh() {
  log "娴嬭瘯澶囦唤鐢ㄦ埛 SSH 杩為€氭€?
  if ssh -i "${OFFSITE_SSH_KEY}" -p "${OFFSITE_REMOTE_PORT}" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 "${OFFSITE_REMOTE_USER}@${OFFSITE_REMOTE_HOST}" "mkdir -p '${OFFSITE_REMOTE_ROOT}/current/uploads' '${OFFSITE_REMOTE_ROOT}/database' '${OFFSITE_REMOTE_ROOT}/configs' '${OFFSITE_REMOTE_ROOT}/manifests' '${OFFSITE_REMOTE_ROOT}/deleted' '${OFFSITE_REMOTE_ROOT}/logs'"; then
    ok "澶囦唤鐢ㄦ埛 SSH 鍙敤"
  else
    warn "澶囦唤鐢ㄦ埛 SSH 娴嬭瘯澶辫触銆傝纭 ${OFFSITE_SSH_KEY}.pub 宸插姞鍏?VPS 鐨?${OFFSITE_REMOTE_USER} authorized_keys銆?
  fi
}

install_cron() {
  log "瀹夎寮傚湴澶囦唤瀹氭椂浠诲姟"
  cat > "${OFFSITE_CRON_PATH}" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# AniMap offsite disaster-recovery jobs. Production server currently uses UTC.
# Defaults: 20:20 UTC backup = 04:20 Asia/Shanghai; 22:40 UTC verify = 06:40 Asia/Shanghai.
${OFFSITE_BACKUP_CRON_EXPR} root APP_DIR=${APP_DIR} OFFSITE_BACKUP_REMOTE_HOST=${OFFSITE_REMOTE_HOST} OFFSITE_BACKUP_REMOTE_PORT=${OFFSITE_REMOTE_PORT} OFFSITE_BACKUP_REMOTE_USER=${OFFSITE_REMOTE_USER} OFFSITE_BACKUP_REMOTE_ROOT=${OFFSITE_REMOTE_ROOT} OFFSITE_BACKUP_SSH_KEY=${OFFSITE_SSH_KEY} UPLOAD_SYNC_TIMEOUT_SECONDS=7200 ${APP_DIR}/scripts/offsite_backup.sh >> ${BACKUP_DIR}/offsite_backup.cron.log 2>&1
${OFFSITE_VERIFY_CRON_EXPR} root APP_DIR=${APP_DIR} OFFSITE_BACKUP_REMOTE_HOST=${OFFSITE_REMOTE_HOST} OFFSITE_BACKUP_REMOTE_PORT=${OFFSITE_REMOTE_PORT} OFFSITE_BACKUP_REMOTE_USER=${OFFSITE_REMOTE_USER} OFFSITE_BACKUP_REMOTE_ROOT=${OFFSITE_REMOTE_ROOT} OFFSITE_BACKUP_SSH_KEY=${OFFSITE_SSH_KEY} ${APP_DIR}/scripts/offsite_verify_uploads.sh >> ${BACKUP_DIR}/offsite_verify.cron.log 2>&1
EOF
  chmod 644 "${OFFSITE_CRON_PATH}"
  ok "cron 宸插畨瑁咃細${OFFSITE_CRON_PATH}"
}

restart_backend_for_settings() {
  if pm2 list | grep -q "${PM2_APP_NAME}"; then
    pm2 restart "${PM2_APP_NAME}"
    pm2 save
    pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
    systemctl enable pm2-root >/dev/null 2>&1 || true
    ok "鍚庣宸查噸鍚紝绔欑偣璁剧疆鍙鍙栨渶鏂板紓鍦板浠介厤缃?
  else
    warn "鏈壘鍒?PM2 杩涚▼ ${PM2_APP_NAME}锛岃烦杩囬噸鍚?
  fi
}

run_initial_backup_if_requested() {
  if [ "${OFFSITE_RUN_INITIAL_BACKUP}" != "1" ]; then
    return 0
  fi

  log "鎵ц涓€娆″垵濮嬪寲澶囦唤锛泆ploads 鍚屾寮€鍏?${OFFSITE_INITIAL_UPLOAD_SYNC}"
  if UPLOAD_SYNC_ENABLED="${OFFSITE_INITIAL_UPLOAD_SYNC}" "${APP_DIR}/scripts/offsite_backup.sh"; then
    ok "鍒濆鍖栧浠藉畬鎴?
  else
    warn "鍒濆鍖栧浠芥湭瀹屾暣瀹屾垚锛岃鏌ョ湅 ${BACKUP_DIR}/offsite_backup.log"
  fi
}

main() {
  require_root
  confirm
  ensure_project
  install_packages
  ensure_node_runtime
  ensure_services
  install_bilibili_sync
  deploy_app
  install_offsite_scripts
  configure_backend_runtime_env
  configure_nginx_if_requested
  configure_ufw_if_requested
  ensure_offsite_key
  provision_remote_if_requested
  test_backup_ssh
  install_bilibili_cron
  install_cron
  restart_backend_for_settings
  run_initial_backup_if_requested

  echo ""
  ok "閮ㄧ讲涓庡紓鍦板鐏鹃厤缃畬鎴?
  echo "Redis 妫€鏌ワ細redis-cli ping"
  echo "B绔欏悓姝ユ棩蹇楋細tail -f ${BILIBILI_SYNC_LOG_FILE}"
  echo "鏌ョ湅鐘舵€侊細绔欑偣鍚庡彴 -> 绔欑偣璁剧疆 -> 寮傚湴澶囦唤"
  echo "鎵嬪姩澶囦唤锛歎PLOAD_SYNC_ENABLED=0 ${APP_DIR}/scripts/offsite_backup.sh"
  echo "鏍￠獙 uploads锛?{APP_DIR}/scripts/offsite_verify_uploads.sh"
}

main "$@"


