#!/bin/bash

# AniMap Ubuntu 部署脚本
# 适用于 Ubuntu 20.04/22.04

set -e

echo "=========================================="
echo "  AniMap - Ubuntu 环境安装脚本"
echo "=========================================="
echo ""

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then 
  echo "请使用 sudo 运行此脚本"
  exit 1
fi

# ========== 交互式收集配置 ==========

echo "请输入以下配置信息："
echo ""

# 数据库密码
while true; do
  read -sp "请设置数据库密码（dimnavuser 用户）: " DB_PASSWORD
  echo ""
  if [ -z "$DB_PASSWORD" ]; then
    echo "密码不能为空，请重新输入"
    continue
  fi
  read -sp "请再次确认数据库密码: " DB_PASSWORD_CONFIRM
  echo ""
  if [ "$DB_PASSWORD" != "$DB_PASSWORD_CONFIRM" ]; then
    echo "两次输入的密码不一致，请重新输入"
    continue
  fi
  break
done

echo ""
echo "配置确认："
echo "  数据库名：animap"
echo "  数据库用户：dimnavuser"
echo "  数据库密码：******（已设置）"
echo ""
read -p "确认开始安装？(y/n): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "已取消安装"
  exit 0
fi

echo ""

# ========== 安装环境 ==========

# 更新系统
echo "[1/5] 更新系统包..."
apt update && apt upgrade -y

# 安装 Node.js 18.x
echo "[2/5] 安装 Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# 安装 PostgreSQL
echo "[3/5] 安装 PostgreSQL..."
apt install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql

# 安装 Nginx
echo "[4/5] 安装 Nginx..."
apt install -y nginx

# 安装 PM2
echo "[5/5] 安装 PM2..."
npm install -g pm2

# ========== 配置数据库 ==========

echo "配置 PostgreSQL 数据库..."

# 转义密码中的单引号（' → ''）防止 SQL 注入
DB_PASSWORD_SQL="${DB_PASSWORD//\'/\'\'}"

# 使用 IF NOT EXISTS 防止重复运行报错
sudo -u postgres psql <<EOSQL
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

# 保存数据库密码供 deploy-app.sh 使用（用 printf 避免 shell 特殊字符展开）
SETUP_CONF="/var/www/.animap-setup.conf"
mkdir -p /var/www
printf 'DB_PASSWORD=%s\n' "$DB_PASSWORD" > "$SETUP_CONF"
chmod 600 "$SETUP_CONF"

echo ""
echo "=========================================="
echo "  环境安装完成！"
echo "=========================================="
echo ""
echo "已安装："
echo "  - Node.js $(node -v)"
echo "  - npm $(npm -v)"
echo "  - PostgreSQL"
echo "  - Nginx"
echo "  - PM2"
echo ""
echo "数据库信息："
echo "  - 数据库名：animap"
echo "  - 用户名：dimnavuser"
echo "  - 密码：（已保存到 $SETUP_CONF）"
echo ""
echo "接下来的步骤："
echo "  1. 将项目代码上传到 /var/www/animap"
echo "  2. 运行 sudo ./deploy-app.sh 部署应用（会自动引导你配置所有参数）"
echo ""
