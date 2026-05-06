#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "========================================"
echo "  AniMap - 完全卸载脚本 (Ubuntu)"
echo "========================================"
echo ""
echo "警告：此脚本将执行以下操作："
echo "  1. 停止所有相关 Node.js 进程"
echo "  2. 删除 PostgreSQL 数据库 animap"
echo "  3. 删除前后端 node_modules、dist 目录"
echo "  4. 删除 backend/.env 配置文件"
echo "  5. 删除上传的文件（public/uploads）"
echo "  6. 可选删除整个项目目录"
echo ""
echo "此操作不可逆！"
echo ""
read -rp "确认要完全卸载吗？输入 YES 继续：" CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "已取消卸载。"
  exit 0
fi

echo ""
echo "[1/6] 停止相关 Node.js 进程..."
# 杀掉在项目目录下运行的 node 进程
PIDS=$(lsof -ti :3000,3001 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill -9 2>/dev/null || true
  echo "      已停止端口 3000/3001 上的进程"
else
  echo "      没有运行中的相关进程"
fi

echo ""
echo "[2/6] 删除 PostgreSQL 数据库..."
if command -v psql &>/dev/null; then
  read -rp "请输入 PostgreSQL postgres 用户密码（直接回车跳过数据库删除）：" -s PG_PASS
  echo ""
  if [ -n "$PG_PASS" ]; then
    PGPASSWORD="$PG_PASS" psql -U postgres -c "DROP DATABASE IF EXISTS animap;" 2>/dev/null && \
      echo "      数据库 animap 已删除" || \
      echo "      数据库删除失败，可能需要手动删除"
  else
    echo "      已跳过数据库删除"
  fi
else
  echo "      未找到 psql，跳过数据库删除"
  echo "      如需删除数据库，请手动执行：sudo -u postgres psql -c 'DROP DATABASE IF EXISTS animap;'"
fi

echo ""
echo "[3/6] 清理后端文件..."
cd "$PROJECT_DIR"
[ -d "backend/node_modules" ] && rm -rf backend/node_modules && echo "      删除 backend/node_modules"
[ -d "backend/dist" ] && rm -rf backend/dist && echo "      删除 backend/dist"
[ -f "backend/.env" ] && rm -f backend/.env && echo "      删除 backend/.env"
[ -d "backend/public/uploads" ] && rm -rf backend/public/uploads && echo "      删除 backend/public/uploads"
echo "      后端文件已清理"

echo ""
echo "[4/6] 清理前端文件..."
[ -d "frontend/node_modules" ] && rm -rf frontend/node_modules && echo "      删除 frontend/node_modules"
[ -d "frontend/dist" ] && rm -rf frontend/dist && echo "      删除 frontend/dist"
echo "      前端文件已清理"

echo ""
echo "[5/5] 删除整个项目目录..."
read -rp "是否删除整个项目目录 $PROJECT_DIR ？输入 YES 继续（回车跳过）：" DEL_ALL
if [ "$DEL_ALL" = "YES" ]; then
  cd /tmp
  rm -rf "$PROJECT_DIR"
  echo "      项目目录已删除"
else
  echo "      已跳过项目目录删除，仅清理了依赖和配置文件"
fi

echo ""
echo "========================================"
echo "  卸载完成"
echo "========================================"
echo ""
echo "已清理内容："
echo "  - 相关进程已停止"
echo "  - node_modules / dist 目录已删除"
echo "  - backend/.env 配置文件已删除"
echo "  - 上传文件已删除"
echo ""
