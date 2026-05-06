#!/bin/bash

# AniMap应用部署脚本
# 在运行此脚本前，请确保已运行 deploy-setup.sh

set -e

# 配置变量
APP_DIR="/var/www/animap"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
SETUP_CONF="/var/www/.animap-setup.conf"

echo "=========================================="
echo "  AniMap - 应用部署脚本"
echo "=========================================="
echo ""

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
  echo "请使用 sudo 运行此脚本"
  exit 1
fi

# 检查项目目录
if [ ! -d "$APP_DIR" ]; then
  echo "错误: 项目目录不存在: $APP_DIR"
  echo "请先将项目代码上传到服务器"
  exit 1
fi

# 检查关键文件完整性
echo "检查项目文件完整性..."
for f in "$BACKEND_DIR/package.json" "$FRONTEND_DIR/package.json" "$BACKEND_DIR/src/server.ts" "$FRONTEND_DIR/index.html"; do
  if [ ! -f "$f" ]; then
    echo "错误: 关键文件缺失: $f"
    echo "请确认项目代码完整上传"
    exit 1
  fi
done
echo "  文件完整性检查通过"

# ========== 交互式收集配置 ==========

echo "请输入以下配置信息（部署过程会自动填入对应文件）："
echo ""

# --- 域名/IP ---
read -p "请输入域名或服务器IP（例如 example.com 或 123.45.67.89）: " DOMAIN
if [ -z "$DOMAIN" ]; then
  echo "错误: 域名/IP 不能为空"
  exit 1
fi

SITE_URL="http://$DOMAIN"

echo ""

# --- 数据库密码 ---
# 尝试从 deploy-setup.sh 保存的配置中读取
DB_PASSWORD=""
if [ -f "$SETUP_CONF" ]; then
  source "$SETUP_CONF"
  if [ -n "$DB_PASSWORD" ]; then
    echo "已从安装配置中读取数据库密码"
  fi
fi

if [ -z "$DB_PASSWORD" ]; then
  read -sp "请输入数据库密码（dimnavuser 用户）: " DB_PASSWORD
  echo ""
  if [ -z "$DB_PASSWORD" ]; then
    echo "错误: 数据库密码不能为空"
    exit 1
  fi
fi

echo ""

# --- 高德地图 API ---
echo "--- 高德地图配置 ---"
echo "（在 https://console.amap.com/ 创建应用获取）"
echo ""

read -p "请输入高德地图 Web 端 Key（用于前端地图显示）: " AMAP_WEB_KEY
if [ -z "$AMAP_WEB_KEY" ]; then
  echo "错误: 高德地图 Web 端 Key 不能为空"
  exit 1
fi

read -p "请输入高德地图安全密钥 securityJsCode（可选，直接回车跳过）: " AMAP_SECURITY_CODE
AMAP_SECURITY_CODE=${AMAP_SECURITY_CODE:-""}

read -p "请输入高德地图 Web 服务 Key（用于后端地理编码）: " AMAP_SERVICE_KEY
if [ -z "$AMAP_SERVICE_KEY" ]; then
  echo "错误: 高德地图 Web 服务 Key 不能为空"
  exit 1
fi

echo ""

# --- QQ 邮箱 SMTP ---
echo "--- QQ 邮箱 SMTP 配置 ---"
echo "（在 QQ 邮箱设置 -> 账户 -> POP3/SMTP 服务中开启并获取授权码）"
echo ""

read -p "请输入 QQ 邮箱地址（例如 123456@qq.com）: " SMTP_USER
if [ -z "$SMTP_USER" ]; then
  echo "错误: QQ 邮箱地址不能为空"
  exit 1
fi

read -sp "请输入 QQ 邮箱授权码: " SMTP_PASS
echo ""
if [ -z "$SMTP_PASS" ]; then
  echo "错误: QQ 邮箱授权码不能为空"
  exit 1
fi

echo ""

# --- 管理员账号 ---
echo "--- 管理员账号配置 ---"
echo "（首次部署时自动创建，用于登录审核后台）"
echo ""

read -p "请输入管理员邮箱: " ADMIN_EMAIL
if [ -z "$ADMIN_EMAIL" ]; then
  echo "错误: 管理员邮箱不能为空"
  exit 1
fi

read -p "请输入管理员用户名: " ADMIN_USERNAME
if [ -z "$ADMIN_USERNAME" ]; then
  echo "错误: 管理员用户名不能为空"
  exit 1
fi

while true; do
  read -sp "请设置管理员密码（至少6位）: " ADMIN_PASSWORD
  echo ""
  if [ -z "$ADMIN_PASSWORD" ] || [ ${#ADMIN_PASSWORD} -lt 6 ]; then
    echo "密码不能为空且至少6位，请重新输入"
    continue
  fi
  read -sp "请再次确认管理员密码: " ADMIN_PASSWORD_CONFIRM
  echo ""
  if [ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]; then
    echo "两次输入的密码不一致，请重新输入"
    continue
  fi
  break
done

echo ""

# --- 自动生成 JWT Secret ---
JWT_SECRET=$(openssl rand -base64 32)
echo "已自动生成 JWT Secret"

echo ""

# ========== 配置确认 ==========

echo "=========================================="
echo "  配置确认"
echo "=========================================="
echo ""
echo "  域名/IP：$DOMAIN"
echo "  站点地址：$SITE_URL"
echo "  数据库密码：******"
echo "  高德地图 Web 端 Key：${AMAP_WEB_KEY:0:8}..."
echo "  高德地图安全密钥：${AMAP_SECURITY_CODE:+已设置}${AMAP_SECURITY_CODE:-未设置（跳过）}"
echo "  高德地图 Web 服务 Key：${AMAP_SERVICE_KEY:0:8}..."
echo "  QQ 邮箱：$SMTP_USER"
echo "  QQ 邮箱授权码：******"
echo "  JWT Secret：已自动生成"
echo "  管理员邮箱：$ADMIN_EMAIL"
echo "  管理员用户名：$ADMIN_USERNAME"
echo "  管理员密码：******"
echo ""
read -p "确认开始部署？(y/n): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "已取消部署"
  exit 0
fi

echo ""

# ========== 生成后端 .env ==========

echo "[1/7] 生成后端环境变量..."

# 用 printf 逐行写入，避免 heredoc 中 $ 等特殊字符被 shell 展开
{
  echo "# Server Configuration"
  echo "PORT=3001"
  echo "NODE_ENV=production"
  echo ""
  echo "# Frontend URL (for CORS, 支持逗号分隔多个域名)"
  printf 'FRONTEND_URL=%s\n' "$SITE_URL"
  echo ""
  echo "# Database Configuration"
  echo "DB_HOST=127.0.0.1"
  echo "DB_PORT=5432"
  echo "DB_NAME=animap"
  echo "DB_USER=dimnavuser"
  printf 'DB_PASSWORD=%s\n' "$DB_PASSWORD"
  echo ""
  echo "# JWT Secret"
  printf 'JWT_SECRET=%s\n' "$JWT_SECRET"
  echo ""
  echo "# Amap API Keys"
  printf 'AMAP_WEB_SERVICE_KEY=%s\n' "$AMAP_SERVICE_KEY"
  echo ""
  echo "# File Upload"
  echo "UPLOAD_DIR=public/uploads"
  echo "MAX_FILE_SIZE=5242880"
  echo ""
  echo "# SMTP Email (QQ邮箱)"
  echo "SMTP_HOST=smtp.qq.com"
  echo "SMTP_PORT=465"
  printf 'SMTP_USER=%s\n' "$SMTP_USER"
  printf 'SMTP_PASS=%s\n' "$SMTP_PASS"
  echo ""
  echo "# 管理员种子账号（仅在首次 migrate 时创建）"
  printf 'ADMIN_EMAIL=%s\n' "$ADMIN_EMAIL"
  printf 'ADMIN_PASSWORD=%s\n' "$ADMIN_PASSWORD"
  printf 'ADMIN_USERNAME=%s\n' "$ADMIN_USERNAME"
} > "$BACKEND_DIR/.env"

echo "  后端 .env 已生成"

# ========== 生成前端 .env ==========

echo "[2/7] 生成前端环境变量..."
{
  printf 'VITE_API_URL=%s/api\n' "$SITE_URL"
  printf 'VITE_AMAP_KEY=%s\n' "$AMAP_WEB_KEY"
  printf 'VITE_AMAP_SECURITY_CODE=%s\n' "$AMAP_SECURITY_CODE"
} > "$FRONTEND_DIR/.env"

echo "  前端 .env 已生成"

# ========== 部署后端 ==========

echo "[3/7] 部署后端..."
cd "$BACKEND_DIR"

echo "  安装后端依赖..."
npm install

echo "  创建上传目录..."
mkdir -p public/uploads

echo "  编译后端代码..."
npm run build

echo "  运行数据库迁移..."
npm run migrate

echo "  启动后端服务..."
pm2 delete animap-backend 2>/dev/null || true
pm2 start dist/server.js --name animap-backend
pm2 save

# ========== 部署前端 ==========

echo "[4/7] 部署前端..."
cd "$FRONTEND_DIR"

echo "  安装前端依赖..."
npm install

echo "  构建前端..."
npm run build

# ========== 配置 Nginx ==========

echo "[5/7] 配置 Nginx..."
cat > /etc/nginx/sites-available/animap <<NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;

    # 前端静态文件
    location / {
        root $FRONTEND_DIR/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # 后端 API 代理
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # 上传文件访问
    location /uploads {
        alias $BACKEND_DIR/public/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/animap /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo "[6/7] 测试 Nginx 配置..."
nginx -t

echo "  重启 Nginx..."
systemctl restart nginx

# ========== 配置防火墙 ==========

echo "[7/7] 配置防火墙..."
ufw allow 'Nginx Full'
ufw allow OpenSSH
ufw --force enable

# ========== 配置 PM2 开机自启 ==========

# 检测实际运行用户（sudo 场景下获取原始用户）
if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
  PM2_USER="$SUDO_USER"
  PM2_HOME=$(eval echo "~$SUDO_USER")
else
  PM2_USER="root"
  PM2_HOME="/root"
fi

pm2 startup systemd -u "$PM2_USER" --hp "$PM2_HOME" 2>/dev/null || true
pm2 save

# ========== 清理安装配置文件 ==========

if [ -f "$SETUP_CONF" ]; then
  rm -f "$SETUP_CONF"
  echo "已清理临时配置文件"
fi

echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo ""
echo "应用信息："
echo "  - 前端地址: $SITE_URL"
echo "  - 后端 API: $SITE_URL/api"
echo ""
echo "已自动完成的配置："
echo "  - 后端 .env（数据库、JWT、高德地图、SMTP、管理员种子）"
echo "  - 前端 .env（API 地址、高德地图 Key）"
echo "  - Nginx 反向代理"
echo "  - PM2 进程管理（开机自启）"
echo "  - UFW 防火墙"
echo "  - 数据库迁移（含管理员账号创建）"
echo ""
echo "管理员账号："
echo "  - 邮箱: $ADMIN_EMAIL"
echo "  - 用户名: $ADMIN_USERNAME"
echo "  - 密码: （部署时设置的密码）"
echo "  - 登录后进入商户审核后台"
echo ""
echo "常用命令："
echo "  查看后端日志: pm2 logs animap-backend"
echo "  重启后端:     pm2 restart animap-backend"
echo "  停止后端:     pm2 stop animap-backend"
echo "  查看进程:     pm2 list"
echo ""
echo "建议配置 SSL 证书（需要域名）："
echo "  sudo apt install certbot python3-certbot-nginx -y"
echo "  sudo certbot --nginx -d $DOMAIN"
echo ""
