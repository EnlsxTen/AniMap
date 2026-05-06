#!/bin/bash

# AniMap - 部署前检查脚本
# 在服务器上运行此脚本，检查部署环境是否就绪

echo "=========================================="
echo "AniMap - 部署环境检查"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查函数
check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 已安装"
        return 0
    else
        echo -e "${RED}✗${NC} $1 未安装"
        return 1
    fi
}

check_service() {
    if systemctl is-active --quiet $1; then
        echo -e "${GREEN}✓${NC} $1 服务运行中"
        return 0
    else
        echo -e "${RED}✗${NC} $1 服务未运行"
        return 1
    fi
}

# 检查系统信息
echo "1. 系统信息"
echo "-------------------"
echo "操作系统: $(lsb_release -d | cut -f2)"
echo "内核版本: $(uname -r)"
echo "内存: $(free -h | awk '/^Mem:/ {print $2}')"
echo "磁盘: $(df -h / | awk 'NR==2 {print $4}') 可用"
echo ""

# 检查必需软件
echo "2. 必需软件检查"
echo "-------------------"
check_command node
check_command npm
check_command psql
check_command nginx
check_command pm2
check_command git
echo ""

# 检查 Node.js 版本
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        echo -e "${GREEN}✓${NC} Node.js 版本符合要求 ($(node -v))"
    else
        echo -e "${YELLOW}⚠${NC} Node.js 版本过低 ($(node -v))，建议 18.x 或更高"
    fi
fi
echo ""

# 检查服务状态
echo "3. 服务状态检查"
echo "-------------------"
check_service postgresql
check_service nginx
echo ""

# 检查端口占用
echo "4. 端口检查"
echo "-------------------"
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠${NC} 端口 $1 已被占用"
        lsof -Pi :$1 -sTCP:LISTEN | grep LISTEN
    else
        echo -e "${GREEN}✓${NC} 端口 $1 可用"
    fi
}

check_port 80
check_port 443
check_port 3001
echo ""

# 检查数据库
echo "5. 数据库检查"
echo "-------------------"
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw animap; then
    echo -e "${GREEN}✓${NC} 数据库 animap 已存在"
else
    echo -e "${YELLOW}⚠${NC} 数据库 animap 不存在（将在部署时创建）"
fi
echo ""

# 检查项目目录
echo "6. 项目目录检查"
echo "-------------------"
if [ -d "/var/www/animap" ]; then
    echo -e "${GREEN}✓${NC} 项目目录存在: /var/www/animap"
    
    # 检查关键文件
    if [ -f "/var/www/animap/backend/package.json" ]; then
        echo -e "${GREEN}✓${NC} 后端代码已上传"
    else
        echo -e "${RED}✗${NC} 后端代码未找到"
    fi
    
    if [ -f "/var/www/animap/frontend/package.json" ]; then
        echo -e "${GREEN}✓${NC} 前端代码已上传"
    else
        echo -e "${RED}✗${NC} 前端代码未找到"
    fi
    
    if [ -f "/var/www/animap/backend/.env" ]; then
        echo -e "${GREEN}✓${NC} 后端环境变量已配置"
    else
        echo -e "${YELLOW}⚠${NC} 后端环境变量未配置"
    fi
    
    if [ -f "/var/www/animap/frontend/.env" ]; then
        echo -e "${GREEN}✓${NC} 前端环境变量已配置"
    else
        echo -e "${YELLOW}⚠${NC} 前端环境变量未配置"
    fi
else
    echo -e "${RED}✗${NC} 项目目录不存在: /var/www/animap"
fi
echo ""

# 检查防火墙
echo "7. 防火墙检查"
echo "-------------------"
if command -v ufw &> /dev/null; then
    if sudo ufw status | grep -q "Status: active"; then
        echo -e "${GREEN}✓${NC} UFW 防火墙已启用"
        sudo ufw status | grep -E "80|443|22"
    else
        echo -e "${YELLOW}⚠${NC} UFW 防火墙未启用"
    fi
else
    echo -e "${YELLOW}⚠${NC} UFW 未安装"
fi
echo ""

# 总结
echo "=========================================="
echo "检查完成！"
echo "=========================================="
echo ""
echo "下一步操作："
echo "1. 如果环境未就绪，运行: sudo ./deploy-setup.sh"
echo "2. 上传项目代码到 /var/www/animap"
echo "3. 运行部署脚本: sudo ./deploy-app.sh（会交互式引导配置所有参数）"
echo ""
