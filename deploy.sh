#!/usr/bin/env bash
# ==========================================================================
# AniMap 一键部署脚本（Ubuntu 20.04 / 22.04 / 24.04）
# ==========================================================================
# 功能：
#   1. 环境检查（OS / 内存 / 磁盘 / 端口）
#   2. 自动安装 Node.js 18 / PostgreSQL / Nginx / PM2（缺什么装什么）
#   3. 创建数据库 + 用户
#   4. 交互式收集配置（域名、Amap、SMTP、管理员）
#   5. 生成前后端 .env、编译、迁移、PM2 启动
#   6. 配置 Nginx + UFW
#   7. 可选自动申请 Let's Encrypt 证书 + HTTPS 跳转
# ==========================================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/animap}"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()  { echo -e "${BLUE}[*]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

echo "=========================================="
echo "       AniMap 一键部署脚本"
echo "=========================================="
echo ""

# ----------------------------------------
# 1. 前置检查
# ----------------------------------------
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  err "请使用 sudo 运行此脚本"
  exit 1
fi

if ! command -v lsb_release &>/dev/null; then
  apt-get update -y && apt-get install -y lsb-release
fi

OS_ID=$(lsb_release -is 2>/dev/null || echo "")
if [ "$OS_ID" != "Ubuntu" ] && [ "$OS_ID" != "Debian" ]; then
  warn "本脚本针对 Ubuntu/Debian 设计，当前系统为 $OS_ID，继续可能失败"
  read -rp "确定继续？(y/n): " GO; [ "$GO" = "y" ] || exit 0
fi

if [ ! -d "$APP_DIR" ]; then
  err "项目目录不存在：$APP_DIR"
  err "请先将项目代码放置到 $APP_DIR（git clone 或 scp）后再运行此脚本"
  exit 1
fi

for f in "$BACKEND_DIR/package.json" "$FRONTEND_DIR/package.json" \
         "$BACKEND_DIR/src/server.ts" "$FRONTEND_DIR/index.html"; do
  if [ ! -f "$f" ]; then
    err "关键文件缺失：$f"
    exit 1
  fi
done
ok "项目文件完整"

# 内存/磁盘提示
MEM_MB=$(free -m | awk '/^Mem:/ {print $2}')
DISK_FREE_GB=$(df -BG / | awk 'NR==2 {gsub("G",""); print $4}')
log "系统信息：$(lsb_release -ds) / 内存 ${MEM_MB}MB / 根分区可用 ${DISK_FREE_GB}G"
[ "$MEM_MB" -lt 800 ] && warn "内存不足 1G，npm install 可能 OOM，建议加 swap"
[ "$DISK_FREE_GB" -lt 3 ] && warn "磁盘剩余不足 3G"

# ----------------------------------------
# 2. 端口检查（80 / 443 / 3001）
# ----------------------------------------
log "检查端口占用..."
check_port_used() {
  if command -v ss &>/dev/null; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -E "(:|\.)$1\$" -q
  else
    lsof -iTCP:"$1" -sTCP:LISTEN -t &>/dev/null
  fi
}
for p in 80 443 3001; do
  if check_port_used "$p"; then
    warn "端口 $p 已被占用（部署后由 Nginx/Node 接管，可能冲突）"
  fi
done

# ----------------------------------------
# 3. 安装系统依赖（幂等）
# ----------------------------------------
log "更新 apt 索引..."
apt-get update -y >/dev/null

install_if_missing() {
  local name="$1" pkg="$2"
  if ! command -v "$name" &>/dev/null; then
    log "安装 $pkg..."
    apt-get install -y "$pkg" >/dev/null
  else
    ok "$name 已安装"
  fi
}

install_if_missing curl curl
install_if_missing openssl openssl
install_if_missing git git
install_if_missing lsof lsof
install_if_missing ufw ufw

# Node.js 18（如版本不足则装）
NEED_NODE=0
if ! command -v node &>/dev/null; then
  NEED_NODE=1
else
  NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -lt 18 ]; then
    warn "当前 Node $(node -v) 版本过低，将升级到 18"
    NEED_NODE=1
  else
    ok "Node $(node -v) 已安装"
  fi
fi
if [ "$NEED_NODE" -eq 1 ]; then
  log "安装 Node.js 18..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash - >/dev/null
  apt-get install -y nodejs >/dev/null
  ok "Node $(node -v) 安装完成"
fi

install_if_missing nginx nginx

if ! command -v psql &>/dev/null; then
  log "安装 PostgreSQL..."
  apt-get install -y postgresql postgresql-contrib >/dev/null
  systemctl enable --now postgresql >/dev/null
  ok "PostgreSQL 安装完成"
else
  ok "PostgreSQL 已安装"
  systemctl is-active --quiet postgresql || systemctl start postgresql
fi

if ! command -v pm2 &>/dev/null; then
  log "安装 PM2..."
  npm install -g pm2 >/dev/null
  ok "PM2 安装完成"
else
  ok "PM2 已安装"
fi

# ----------------------------------------
# 4. 交互式收集配置
# ----------------------------------------
echo ""
echo "------------------------------------------"
echo "  配置信息（部署过程中自动写入对应文件）"
echo "------------------------------------------"

read -rp "请输入域名或服务器IP（如 example.com 或 1.2.3.4）: " DOMAIN
[ -z "$DOMAIN" ] && { err "域名/IP 不能为空"; exit 1; }

# 询问是否启用 HTTPS（决定 Nginx 配置 + FRONTEND_URL 协议）
USE_HTTPS="n"
if [[ "$DOMAIN" =~ ^[0-9.]+$ ]]; then
  warn "检测到使用 IP 地址，Let's Encrypt 不支持 IP 证书，将仅启用 HTTP"
else
  read -rp "部署完成后是否自动申请 Let's Encrypt 证书并启用 HTTPS？(y/n): " USE_HTTPS
fi
USE_HTTPS=${USE_HTTPS,,}

# 邮箱（用于 certbot）
LE_EMAIL=""
if [ "$USE_HTTPS" = "y" ]; then
  read -rp "请输入用于 Let's Encrypt 通知的邮箱: " LE_EMAIL
  [ -z "$LE_EMAIL" ] && { err "邮箱不能为空"; exit 1; }
fi

# 数据库密码
while true; do
  read -rsp "请设置数据库密码（dimnavuser 用户）: " DB_PASSWORD; echo
  [ -z "$DB_PASSWORD" ] && { warn "密码不能为空"; continue; }
  read -rsp "请再次确认密码: " DB_PASSWORD_CONFIRM; echo
  [ "$DB_PASSWORD" = "$DB_PASSWORD_CONFIRM" ] && break
  warn "两次密码不一致，请重新输入"
done

# 高德
echo ""
echo "--- 高德地图配置（https://console.amap.com/）---"
read -rp "高德地图 Web 端 Key（前端地图）: " AMAP_WEB_KEY
[ -z "$AMAP_WEB_KEY" ] && { err "Web 端 Key 不能为空"; exit 1; }
read -rp "高德地图安全密钥 securityJsCode（可选，回车跳过）: " AMAP_SECURITY_CODE
AMAP_SECURITY_CODE=${AMAP_SECURITY_CODE:-}
read -rp "高德地图 Web 服务 Key（后端地理编码）: " AMAP_SERVICE_KEY
[ -z "$AMAP_SERVICE_KEY" ] && { err "Web 服务 Key 不能为空"; exit 1; }

# Cloudflare R2 对象存储（图片上传 CDN，可选；留空则图片仅存本地 uploads）
echo ""
echo "--- Cloudflare R2 对象存储配置（可选，回车全部跳过则图片仅存本地）---"
read -rp "R2 Account ID（可选）: " R2_ACCOUNT_ID
R2_ACCOUNT_ID=${R2_ACCOUNT_ID:-}
read -rp "R2 Access Key ID（可选）: " R2_ACCESS_KEY_ID
R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID:-}
R2_SECRET_ACCESS_KEY=""
if [ -n "$R2_ACCESS_KEY_ID" ]; then
  read -rsp "R2 Secret Access Key: " R2_SECRET_ACCESS_KEY; echo
fi
read -rp "R2 Endpoint（可选，形如 https://<account>.r2.cloudflarestorage.com）: " R2_ENDPOINT
R2_ENDPOINT=${R2_ENDPOINT:-}
read -rp "R2 Bucket 名称（可选）: " R2_BUCKET
R2_BUCKET=${R2_BUCKET:-}
read -rp "R2 公开访问 URL（可选，形如 https://cdn.example.com）: " R2_PUBLIC_URL
R2_PUBLIC_URL=${R2_PUBLIC_URL:-}

# SMTP
echo ""
echo "--- QQ 邮箱 SMTP 配置 ---"
read -rp "QQ 邮箱地址: " SMTP_USER
[ -z "$SMTP_USER" ] && { err "邮箱不能为空"; exit 1; }
read -rsp "QQ 邮箱授权码: " SMTP_PASS; echo
[ -z "$SMTP_PASS" ] && { err "授权码不能为空"; exit 1; }

# 管理员
echo ""
echo "--- 管理员账号（首次 migrate 时创建）---"
read -rp "管理员邮箱: " ADMIN_EMAIL
[ -z "$ADMIN_EMAIL" ] && { err "管理员邮箱不能为空"; exit 1; }
read -rp "管理员用户名: " ADMIN_USERNAME
[ -z "$ADMIN_USERNAME" ] && { err "管理员用户名不能为空"; exit 1; }
while true; do
  read -rsp "管理员密码（至少 8 位，含字母+数字）: " ADMIN_PASSWORD; echo
  if [[ ! "$ADMIN_PASSWORD" =~ ^(.{8,})$ ]] || \
     [[ ! "$ADMIN_PASSWORD" =~ [A-Za-z] ]] || \
     [[ ! "$ADMIN_PASSWORD" =~ [0-9] ]]; then
    warn "密码不符合要求，至少 8 位且必须同时包含字母和数字"
    continue
  fi
  read -rsp "再次确认: " ADMIN_PASSWORD_CONFIRM; echo
  [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD_CONFIRM" ] && break
  warn "两次密码不一致"
done

# JWT
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n' | tr -d '=')
ok "已生成 JWT Secret"

# 站点 URL（根据是否 HTTPS 决定）
if [ "$USE_HTTPS" = "y" ]; then
  SITE_URL_HTTPS="https://$DOMAIN"
  # 同时把 http 也加入 CORS 白名单，便于 certbot 配置完成前的过渡期
  CORS_URLS="http://$DOMAIN,https://$DOMAIN"
else
  SITE_URL_HTTPS=""
  CORS_URLS="http://$DOMAIN"
fi

echo ""
echo "------------------------------------------"
echo "  配置确认"
echo "------------------------------------------"
echo "  域名/IP             : $DOMAIN"
echo "  启用 HTTPS          : $([ "$USE_HTTPS" = "y" ] && echo "是" || echo "否（仅 HTTP）")"
echo "  数据库密码          : ******"
echo "  高德 Web Key        : ${AMAP_WEB_KEY:0:6}***"
echo "  高德 Service Key    : ${AMAP_SERVICE_KEY:0:6}***"
echo "  QQ 邮箱             : $SMTP_USER"
echo "  管理员邮箱           : $ADMIN_EMAIL"
echo ""
read -rp "确认开始部署？(y/n): " GO
[ "$GO" = "y" ] || { echo "已取消"; exit 0; }

# ----------------------------------------
# 5. 创建数据库 + 用户（幂等）
# ----------------------------------------
log "配置 PostgreSQL..."
# 转义 SQL 字符串中的单引号
DB_PASSWORD_SQL="${DB_PASSWORD//\'/\'\'}"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<EOSQL >/dev/null
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'dimnavuser') THEN
    CREATE USER dimnavuser WITH ENCRYPTED PASSWORD '${DB_PASSWORD_SQL}';
  ELSE
    ALTER USER dimnavuser WITH ENCRYPTED PASSWORD '${DB_PASSWORD_SQL}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE animap OWNER dimnavuser'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'animap')\gexec

GRANT ALL PRIVILEGES ON DATABASE animap TO dimnavuser;
EOSQL

# PostgreSQL 15+ 需单独授予 public schema 权限
sudo -u postgres psql -d animap -v ON_ERROR_STOP=1 <<EOSQL >/dev/null
GRANT ALL ON SCHEMA public TO dimnavuser;
EOSQL
ok "数据库 animap 准备就绪"

# ----------------------------------------
# 6. 生成 .env
# ----------------------------------------
log "生成后端 .env..."
{
  echo "PORT=3001"
  echo "NODE_ENV=production"
  echo ""
  printf 'FRONTEND_URL=%s\n' "$CORS_URLS"
  echo ""
  echo "DB_HOST=127.0.0.1"
  echo "DB_PORT=5432"
  echo "DB_NAME=animap"
  echo "DB_USER=dimnavuser"
  printf 'DB_PASSWORD=%s\n' "$DB_PASSWORD"
  echo ""
  printf 'JWT_SECRET=%s\n' "$JWT_SECRET"
  echo ""
  printf 'AMAP_WEB_SERVICE_KEY=%s\n' "$AMAP_SERVICE_KEY"
  echo ""
  echo "UPLOAD_DIR=public/uploads"
  echo "MAX_FILE_SIZE=20971520"
  echo ""
  echo "SMTP_HOST=smtp.qq.com"
  echo "SMTP_PORT=465"
  printf 'SMTP_USER=%s\n' "$SMTP_USER"
  printf 'SMTP_PASS=%s\n' "$SMTP_PASS"
  echo ""
  # Cloudflare R2（仅在填写时写入；留空时后端图片仅存本地 uploads）
  if [ -n "$R2_ACCESS_KEY_ID" ]; then
    echo ""
    printf 'R2_ACCOUNT_ID=%s\n' "$R2_ACCOUNT_ID"
    printf 'R2_ACCESS_KEY_ID=%s\n' "$R2_ACCESS_KEY_ID"
    printf 'R2_SECRET_ACCESS_KEY=%s\n' "$R2_SECRET_ACCESS_KEY"
    printf 'R2_ENDPOINT=%s\n' "$R2_ENDPOINT"
    printf 'R2_BUCKET=%s\n' "$R2_BUCKET"
    printf 'R2_PUBLIC_URL=%s\n' "$R2_PUBLIC_URL"
  fi
  echo ""
  printf 'ADMIN_EMAIL=%s\n' "$ADMIN_EMAIL"
  printf 'ADMIN_PASSWORD=%s\n' "$ADMIN_PASSWORD"
  printf 'ADMIN_USERNAME=%s\n' "$ADMIN_USERNAME"
} > "$BACKEND_DIR/.env"
chmod 600 "$BACKEND_DIR/.env"
ok "后端 .env 已生成（权限 600）"

log "生成前端 .env..."
# 关键修复：VITE_API_URL 用相对路径 /api，由 Nginx 同域代理转发到后端
# 这样无论页面是 http 还是 https，请求协议自动跟随，不会触发混合内容拦截
{
  echo "VITE_API_URL=/api"
  printf 'VITE_AMAP_KEY=%s\n' "$AMAP_WEB_KEY"
  printf 'VITE_AMAP_SECURITY_CODE=%s\n' "$AMAP_SECURITY_CODE"
} > "$FRONTEND_DIR/.env"
ok "前端 .env 已生成（VITE_API_URL 使用相对路径 /api）"

# ----------------------------------------
# 7. 构建 + 启动后端
# ----------------------------------------
log "安装后端依赖..."
cd "$BACKEND_DIR"
npm install --no-audit --no-fund

log "编译后端..."
npm run build

log "确保上传目录存在..."
mkdir -p public/uploads
chown -R "${SUDO_USER:-root}:${SUDO_USER:-root}" public/uploads || true

log "运行数据库迁移..."
npm run migrate

log "启动后端进程..."
pm2 delete animap-backend 2>/dev/null || true
pm2 start dist/server.js --name animap-backend --update-env
pm2 save
ok "后端运行中"

# ----------------------------------------
# 7.5 B站同步插件 Python 环境（供 sync_events.py 使用）
# ----------------------------------------
log "准备 B站同步 Python 环境..."
if ! command -v python3 >/dev/null 2>&1; then
  apt-get install -y python3 python3-venv python3-pip >/dev/null
fi
BILIBILI_VENV_DIR="${BILIBILI_VENV_DIR:-$APP_DIR/scripts/venv}"
if [ ! -x "$BILIBILI_VENV_DIR/bin/python" ]; then
  mkdir -p "$(dirname "$BILIBILI_VENV_DIR")"
  python3 -m venv "$BILIBILI_VENV_DIR"
  "$BILIBILI_VENV_DIR/bin/python" -m pip install --upgrade pip setuptools wheel >/dev/null
fi
"$BILIBILI_VENV_DIR/bin/pip" install --quiet --disable-pip-version-check requests beautifulsoup4 psycopg2-binary pillow
if [ "${BILIBILI_INSTALL_PLAYWRIGHT:-1}" != "0" ]; then
  "$BILIBILI_VENV_DIR/bin/pip" install --quiet --disable-pip-version-check playwright
  "$BILIBILI_VENV_DIR/bin/python" -m playwright install chromium >/dev/null 2>&1 \
    || warn "Playwright Chromium 安装失败，B站动态页面兜底渲染不可用（不影响主流程）"
fi
ok "B站同步 Python 环境就绪：$BILIBILI_VENV_DIR"

# ----------------------------------------
# 8. 构建前端
# ----------------------------------------
log "安装前端依赖..."
cd "$FRONTEND_DIR"
npm install --no-audit --no-fund

log "构建前端..."
npm run build
ok "前端构建完成"

# ----------------------------------------
# 9. 配置 Nginx
# ----------------------------------------
log "配置 Nginx..."

# HTTP 配置：仅监听 80。若启用 HTTPS，后续 certbot 会自动添加 443 server 块并改写 80→443 跳转
cat > /etc/nginx/sites-available/animap <<NGINXEOF
# AniMap - HTTP 配置
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    # 上传文件大小限制（与后端 MAX_FILE_SIZE 一致 + 余量）
    client_max_body_size 20M;

    # 前端静态文件
    root $FRONTEND_DIR/dist;
    index index.html;

    # 安全头（前端 HTML/JS 加 nosniff、no-frame；上传目录的头由后端单独写）
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # SPA 路由
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API 反向代理
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        # 注意：用 \$remote_addr 而非 \$proxy_add_x_forwarded_for，
        # 避免攻击者伪造的 X-Forwarded-For 头被附加进来
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # 上传文件
    location /uploads {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host \$host;
        # 让上传文件走后端，保留后端设置的 nosniff/CSP 头
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/animap /etc/nginx/sites-enabled/animap
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl restart nginx
ok "Nginx 配置完成"

# ----------------------------------------
# 10. 防火墙
# ----------------------------------------
log "配置 UFW 防火墙..."
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ok "防火墙已启用（开放 SSH / 80 / 443）"

# ----------------------------------------
# 11. PM2 开机自启
# ----------------------------------------
log "配置 PM2 开机自启..."
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  PM2_USER="$SUDO_USER"
  PM2_HOME=$(eval echo "~$SUDO_USER")
else
  PM2_USER="root"
  PM2_HOME="/root"
fi
pm2 startup systemd -u "$PM2_USER" --hp "$PM2_HOME" >/dev/null 2>&1 || true
pm2 save >/dev/null
ok "PM2 开机自启已配置"

# ----------------------------------------
# 12. 可选：申请 HTTPS 证书
# ----------------------------------------
if [ "$USE_HTTPS" = "y" ]; then
  log "安装 certbot 并申请 Let's Encrypt 证书..."
  apt-get install -y certbot python3-certbot-nginx >/dev/null
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$LE_EMAIL" --redirect; then
    ok "HTTPS 已启用，已自动配置 80→443 跳转"
  else
    err "certbot 申请失败（请检查域名 DNS 是否已指向本机）"
    warn "你可以稍后手动执行：certbot --nginx -d $DOMAIN --redirect"
  fi
fi

# ----------------------------------------
# 13. 验证
# ----------------------------------------
sleep 2
log "验证服务..."
pm2 list | grep -q "animap-backend.*online" && ok "后端进程运行中" || warn "后端进程异常，运行 pm2 logs animap-backend 查看"
systemctl is-active --quiet nginx && ok "Nginx 运行中" || warn "Nginx 未运行"
curl -sf -o /dev/null "http://127.0.0.1:3001/api/health" && ok "后端健康检查通过" || warn "后端 /api/health 无响应"

# ----------------------------------------
# 完成
# ----------------------------------------
FINAL_URL=$([ "$USE_HTTPS" = "y" ] && echo "https://$DOMAIN" || echo "http://$DOMAIN")
echo ""
echo "=========================================="
echo "       部署完成 🎉"
echo "=========================================="
echo ""
echo "  访问地址 : $FINAL_URL"
echo "  管理员   : $ADMIN_EMAIL"
echo ""
echo "  日志     : pm2 logs animap-backend"
echo "  重启     : pm2 restart animap-backend"
echo "  Nginx 重载: systemctl reload nginx"
echo ""
if [ "$USE_HTTPS" != "y" ] && ! [[ "$DOMAIN" =~ ^[0-9.]+$ ]]; then
  echo "  若稍后想启用 HTTPS："
  echo "    sudo apt install certbot python3-certbot-nginx"
  echo "    sudo certbot --nginx -d $DOMAIN --redirect"
  echo "    # 然后编辑 backend/.env 把 FRONTEND_URL 改为 https://$DOMAIN"
  echo "    sudo -u $PM2_USER pm2 restart animap-backend"
  echo ""
fi
