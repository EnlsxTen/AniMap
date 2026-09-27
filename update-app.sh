#!/bin/bash

# ==========================================================================
# AniMap - 增量更新脚本
# ==========================================================================
# 用途：把新版本代码更新到已部署的服务器上，保留所有已有数据
# 保留内容：
#   - backend/.env、frontend/.env（配置文件）
#   - backend/public/uploads（用户上传的海报）
#   - PostgreSQL 数据库（含用户、活动、管理员账号）
#   - Nginx 配置
#   - SSL 证书
# 自动执行：
#   - 拉取/同步新代码
#   - 后端依赖更新 + 编译 + 数据库结构迁移（增量加列，不清表）
#   - 前端依赖更新 + 重新构建
#   - 重启后端 PM2 进程
# ==========================================================================

set -e

# 配置变量
APP_DIR="/var/www/animap"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
BACKUP_DIR="/var/www/animap-backup-$(date +%Y%m%d-%H%M%S)"

echo "=========================================="
echo "  AniMap - 增量更新脚本"
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
  echo "本脚本仅用于更新已部署的项目，全新部署请使用 deploy-app.sh"
  exit 1
fi

# 检查 .env 是否存在
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "错误: 后端 .env 不存在，无法增量更新"
  echo "请先用 deploy-app.sh 完成全新部署"
  exit 1
fi

if [ ! -f "$FRONTEND_DIR/.env" ]; then
  echo "错误: 前端 .env 不存在，无法增量更新"
  echo "请先用 deploy-app.sh 完成全新部署"
  exit 1
fi

echo "本次更新将："
echo "  ✓ 备份当前 .env 和 uploads 到 $BACKUP_DIR"
echo "  ✓ 拉取/同步新代码"
echo "  ✓ 重新安装后端依赖 + 编译 + 数据库结构迁移"
echo "  ✓ 重新安装前端依赖 + 构建"
echo "  ✓ 重启后端 PM2 进程"
echo ""
echo "本次更新不会："
echo "  ✗ 修改 .env 配置"
echo "  ✗ 清理用户上传的海报"
echo "  ✗ 重置数据库内容"
echo "  ✗ 重新配置 Nginx"
echo "  ✗ 重新创建管理员账号"
echo ""
read -p "确认开始更新？(y/n): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "已取消更新"
  exit 0
fi

echo ""

# ========== 1. 备份关键数据 ==========

echo "[1/6] 备份关键数据到 $BACKUP_DIR..."
mkdir -p "$BACKUP_DIR"
cp "$BACKEND_DIR/.env" "$BACKUP_DIR/backend.env"
cp "$FRONTEND_DIR/.env" "$BACKUP_DIR/frontend.env"
if [ -d "$BACKEND_DIR/public/uploads" ]; then
  cp -r "$BACKEND_DIR/public/uploads" "$BACKUP_DIR/uploads"
  echo "  uploads 目录已备份（$(ls "$BACKUP_DIR/uploads" 2>/dev/null | wc -l) 个文件）"
fi
echo "  .env 文件已备份"

# ========== 2. 拉取新代码 ==========

echo ""
echo "[2/6] 同步新代码..."

cd "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
  echo "  检测到 Git 仓库，使用 git pull 更新..."
  # 保护本地修改：先 stash 本地改动（如果有）
  STASHED=false
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git stash --include-untracked 2>/dev/null && STASHED=true || true
  fi

  # 拉取最新代码
  git fetch --all
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git pull origin "$CURRENT_BRANCH"
  echo "  代码已更新到最新分支：$CURRENT_BRANCH"

  # 恢复本地改动
  if [ "$STASHED" = true ]; then
    git stash pop 2>/dev/null || echo "  ⚠ stash pop 失败，请手动执行 git stash pop 恢复本地改动"
  fi
else
  echo "  ⚠ 未检测到 Git 仓库"
  echo "  请手动用 scp/rsync 上传新代码到 $APP_DIR 后再运行本脚本"
  echo "  或将项目改造成 Git 仓库以支持自动拉取"
  echo ""
  read -p "新代码是否已经手动上传到 $APP_DIR？(y/n): " UPLOADED
  if [ "$UPLOADED" != "y" ] && [ "$UPLOADED" != "Y" ]; then
    echo "已取消更新"
    exit 0
  fi
fi

# ========== 3. 还原 .env 和 uploads（如果被覆盖）==========

echo ""
echo "[3/6] 确保配置和上传目录完整..."

# 如果新代码意外覆盖了 .env（理论上 .gitignore 已排除，但保险起见）
if [ ! -f "$BACKEND_DIR/.env" ]; then
  cp "$BACKUP_DIR/backend.env" "$BACKEND_DIR/.env"
  echo "  已从备份恢复 backend/.env"
fi
if [ ! -f "$FRONTEND_DIR/.env" ]; then
  cp "$BACKUP_DIR/frontend.env" "$FRONTEND_DIR/.env"
  echo "  已从备份恢复 frontend/.env"
fi

# 确保 uploads 目录存在（git 不会推送空目录）
mkdir -p "$BACKEND_DIR/public/uploads"

# 如果 uploads 被清空（理论上不会，git 会忽略 uploads），从备份恢复
if [ -d "$BACKUP_DIR/uploads" ] && [ -z "$(ls -A "$BACKEND_DIR/public/uploads" 2>/dev/null)" ]; then
  cp -r "$BACKUP_DIR/uploads/." "$BACKEND_DIR/public/uploads/"
  echo "  已从备份恢复 uploads 目录"
fi

echo "  配置和上传目录检查完成"

# ========== 4. 后端更新 ==========

echo ""
echo "[4/6] 更新后端..."

cd "$BACKEND_DIR"

echo "  安装/更新后端依赖（增量）..."
npm install

echo "  编译后端代码..."
npm run build

echo "  运行数据库结构迁移（增量加列，不会清表）..."
npm run migrate

echo "  重启后端服务..."
pm2 restart animap-backend || {
  echo "  ⚠ 进程未找到，启动新进程..."
  pm2 start dist/server.js --name animap-backend
}
pm2 save

echo "  后端更新完成"

# ========== 5. 前端更新 ==========

echo ""
echo "[5/6] 更新前端..."

cd "$FRONTEND_DIR"

echo "  安装/更新前端依赖（增量）..."
npm install

echo "  构建前端..."
npm run build

echo "  前端更新完成"

# ========== 6. 验证 ==========

echo ""
echo "[6/6] 验证服务状态..."

sleep 2

# 检查后端进程
if pm2 list | grep -q "animap-backend.*online"; then
  echo "  ✓ 后端进程运行中"
else
  echo "  ⚠ 后端进程状态异常，请查看日志：pm2 logs animap-backend"
fi

# 检查 Nginx
if systemctl is-active --quiet nginx; then
  echo "  ✓ Nginx 运行中"
else
  echo "  ⚠ Nginx 未运行，尝试启动..."
  systemctl start nginx
fi

# 测试后端 API
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/events/public | grep -q "200"; then
  echo "  ✓ 后端 API 响应正常"
else
  echo "  ⚠ 后端 API 未正常响应，请检查日志：pm2 logs animap-backend"
fi

echo ""
echo "=========================================="
echo "  更新完成！"
echo "=========================================="
echo ""
echo "更新完成，代码已同步到最新版本。"
echo ""
echo "备份位置：$BACKUP_DIR"
echo "  （确认运行正常后可手动删除：rm -rf $BACKUP_DIR）"
echo ""
echo "常用命令："
echo "  查看后端日志: pm2 logs animap-backend"
echo "  重启后端:     pm2 restart animap-backend"
echo "  查看进程:     pm2 list"
echo ""
echo "如更新后出现问题，可恢复备份："
echo "  cp $BACKUP_DIR/backend.env $BACKEND_DIR/.env"
echo "  cp $BACKUP_DIR/frontend.env $FRONTEND_DIR/.env"
echo "  cp -r $BACKUP_DIR/uploads/. $BACKEND_DIR/public/uploads/"
echo ""
