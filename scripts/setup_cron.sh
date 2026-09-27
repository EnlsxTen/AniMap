#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/animap}"
SCRIPT_PATH="${APP_DIR}/sync_events.py"
VENV_DIR="${VENV_DIR:-${APP_DIR}/venv}"
LOG_DIR="/var/log/animap"
LOG_FILE="${LOG_DIR}/events_sync.log"
ENV_FILE="${APP_DIR}/.events_sync.env"
CRON_FILE="/etc/cron.d/animap-events-sync"
PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "=========================================="
echo "  AniMap Bilibili Events Sync Setup"
echo "=========================================="
echo ""

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Please run with sudo: sudo bash setup_cron.sh"
  exit 1
fi

if [ ! -f "$SCRIPT_PATH" ]; then
  echo "sync_events.py not found at: $SCRIPT_PATH"
  echo "Set APP_DIR=/path/to/animap if your project is not in /var/www/animap"
  exit 1
fi

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python 3 is required. Install it first, for example: sudo apt-get install -y python3 python3-venv"
  exit 1
fi

echo "[1/5] Installing system Python venv support if apt is available..."
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y >/dev/null
  apt-get install -y python3 python3-venv python3-pip >/dev/null
fi

echo "[2/5] Creating virtual environment..."
"$PYTHON_BIN" -m venv "$VENV_DIR"
"$VENV_DIR/bin/python" -m pip install --upgrade pip setuptools wheel
"$VENV_DIR/bin/pip" install requests beautifulsoup4 psycopg2-binary pillow playwright

echo "[3/5] Installing Playwright Chromium..."
"$VENV_DIR/bin/python" -m playwright install --with-deps chromium

echo "[4/5] Creating log directory and environment file..."
mkdir -p "$LOG_DIR"
touch "$LOG_FILE"
chmod 0644 "$LOG_FILE"

if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
# AniMap events sync environment.
# Fill every value before the cron job can import data.
AMAP_WEB_SERVICE_KEY=
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=animap
DB_USER=system
DB_PASSWORD=
ANIMAP_IMPORT_USER_ID=
ANIMAP_UPLOAD_DIR=/var/www/animap/backend/public/uploads
EVENT_SCOPE=convention

# Optional:
# ANIMAP_DB_SCHEMA=public
# ANIMAP_EVENTS_TABLE=events
# EVENT_SCOPE=convention  # convention=只抓漫展, all=漫展和非漫展一起抓
EOF
  chmod 0600 "$ENV_FILE"
  echo "Created $ENV_FILE. Please edit it and fill secrets."
else
  grep -q '^ANIMAP_IMPORT_USER_ID=' "$ENV_FILE" || printf '\nANIMAP_IMPORT_USER_ID=\n' >> "$ENV_FILE"
  grep -q '^ANIMAP_UPLOAD_DIR=' "$ENV_FILE" || printf '\nANIMAP_UPLOAD_DIR=/var/www/animap/backend/public/uploads\n' >> "$ENV_FILE"
  grep -q '^DB_PASSWORD=' "$ENV_FILE" || printf '\nDB_PASSWORD=\n' >> "$ENV_FILE"
  grep -q '^EVENT_SCOPE=' "$ENV_FILE" || printf '\nEVENT_SCOPE=convention\n' >> "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
  echo "$ENV_FILE already exists; keeping current values."
fi

echo "[5/5] Writing cron job..."
cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Run AniMap Bilibili events sync every day at 03:00.
0 3 * * * root set -a; source "$ENV_FILE"; set +a; cd "$APP_DIR"; "$VENV_DIR/bin/python" "$SCRIPT_PATH" --event-scope "\${EVENT_SCOPE:-convention}" --playwright >> "$LOG_FILE" 2>&1
EOF
chmod 0644 "$CRON_FILE"

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart cron 2>/dev/null || systemctl restart crond 2>/dev/null || true
fi

echo ""
echo "Setup completed."
echo ""
echo "Next steps:"
echo "  1. Edit $ENV_FILE and fill AMAP_WEB_SERVICE_KEY and ANIMAP_IMPORT_USER_ID."
echo "  2. Test manually:"
echo "     set -a; source $ENV_FILE; set +a; cd $APP_DIR; $VENV_DIR/bin/python sync_events.py --dry-run"
echo "  3. Import manually:"
echo "     set -a; source $ENV_FILE; set +a; cd $APP_DIR; $VENV_DIR/bin/python sync_events.py"
echo "  4. Check logs:"
echo "     tail -f $LOG_FILE"
