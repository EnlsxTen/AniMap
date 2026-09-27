# Ubuntu 服务器部署完整指南

## 前置准备

### 1. 服务器要求
- Ubuntu 20.04 / 22.04 / 24.04
- 至少 1GB RAM（推荐 2GB+）
- 至少 5GB 可用磁盘
- Root 或 sudo 权限

### 2. 你需要提前准备的信息
- 高德地图 Web 端 Key（前端地图显示）
- 高德地图 Web 服务 Key（后端地理编码）
- 高德地图安全密钥 `securityJsCode`（可选）
- QQ 邮箱地址 + 授权码（用于发送验证码邮件）
- 管理员邮箱 / 用户名 / 密码（至少 8 位、含字母+数字）
- 已解析到服务器 IP 的域名（用 HTTPS 必须）

> 高德地图 Key 申请：访问 https://console.amap.com/ ，创建应用后分别添加「Web端(JS API)」和「Web服务」两个 Key。

## 一键部署

### 第一步：上传项目到服务器

```bash
# 推荐 Git
ssh user@your-server-ip
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www
cd /var/www
git clone https://github.com/your-username/animap.git animap
```

或用 scp：
```bash
# 本地
tar --exclude='node_modules' --exclude='dist' -czf animap.tar.gz animap/
scp animap.tar.gz user@your-server-ip:/tmp/
# 服务器
sudo mkdir -p /var/www && cd /var/www
sudo tar -xzf /tmp/animap.tar.gz
sudo chown -R $USER:$USER animap
```

### 第二步：运行部署脚本（环境检查 + 安装 + 部署 + 可选 HTTPS）

```bash
cd /var/www/animap
chmod +x deploy.sh
sudo ./deploy.sh
```

脚本会自动完成：
1. **环境检查**：OS 类型、内存/磁盘、端口占用
2. **缺什么装什么**：Node.js 18、PostgreSQL、Nginx、PM2、certbot 等
3. **创建数据库**：`animap` 库 + `dimnavuser` 用户（含 PostgreSQL 15+ 需要的 schema 权限）
4. **交互式收集配置**：域名、是否启用 HTTPS、高德 Key、SMTP、管理员账号
5. **生成 .env**：自动生成强 JWT Secret；**前端 `VITE_API_URL=/api`**（相对路径，自动跟随页面协议）
6. **编译 + 迁移 + 启动**：后端 PM2 启动，前端 Vite 构建
7. **Nginx 反向代理**：含安全头、`client_max_body_size 10M`、安全的 `X-Forwarded-For` 处理
8. **UFW 防火墙**：开放 SSH / 80 / 443
9. **PM2 开机自启**
10. **（可选）自动申请 Let's Encrypt 证书**：选了"启用 HTTPS"就会自动跑 certbot 并配置 80→443 跳转

### 关键配置项

| 配置项 | 说明 |
|--------|------|
| 域名/IP | 你的服务器域名或 IP（IP 不支持 HTTPS） |
| 启用 HTTPS | 选 y 自动跑 certbot 申请证书；选 n 仅 HTTP |
| 数据库密码 | dimnavuser 用户的密码 |
| 高德 Web 端 Key | 写入 `frontend/.env` 的 `VITE_AMAP_KEY` |
| 高德安全密钥 | 写入 `frontend/.env` 的 `VITE_AMAP_SECURITY_CODE`（可选） |
| 高德 Web 服务 Key | 写入 `backend/.env` 的 `AMAP_WEB_SERVICE_KEY` |
| QQ 邮箱 + 授权码 | 发送验证码邮件 |
| 管理员账号 | 首次 migrate 时自动创建 |
| JWT Secret | 自动生成 |

### 部署后验证

```bash
pm2 list                          # 后端进程应为 online
sudo nginx -t                     # Nginx 配置语法正确
curl -I http://your-domain.com    # 应返回 200 / 301
```

打开浏览器访问 `https://your-domain.com`（或 http://），用管理员账号登录后到 `/admin/reviews` 审核。

## 增量更新

代码改完后增量更新（保留 .env、uploads、数据库不变）：

```bash
cd /var/www/animap
sudo ./update-app.sh
```

## 手动配置（不用脚本时）

### 后端 .env
```env
NODE_ENV=production
FRONTEND_URL=https://your-domain.com,http://your-domain.com   # 逗号分隔，多个 origin 都允许
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=animap
DB_USER=dimnavuser
DB_PASSWORD=数据库密码
JWT_SECRET=openssl rand -base64 48 生成
AMAP_WEB_SERVICE_KEY=高德 Web 服务 Key
UPLOAD_DIR=public/uploads
MAX_FILE_SIZE=5242880
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=邮箱
SMTP_PASS=授权码
ADMIN_EMAIL=管理员邮箱
ADMIN_PASSWORD=管理员密码（至少 8 位含字母+数字）
ADMIN_USERNAME=管理员用户名
```

### 前端 .env
```env
# 关键：用相对路径，由 Nginx 同域代理，自动跟随页面协议
VITE_API_URL=/api
VITE_AMAP_KEY=高德 Web 端 Key
VITE_AMAP_SECURITY_CODE=高德安全密钥（可选）
```

> ⚠ 不要写 `VITE_API_URL=http://your-domain.com/api`。这个值会被打进 bundle，一旦页面是 HTTPS 浏览器会拦截混合内容请求。用 `/api` 就不会有这个问题。

### 启动
```bash
cd backend && npm install && npm run build && npm run migrate
pm2 start dist/server.js --name animap-backend && pm2 save

cd ../frontend && npm install && npm run build
```

## 常见问题

### 升级 HTTPS 后白屏 / 接口请求失败
检查 `frontend/.env`,`VITE_API_URL` 必须是相对路径 `/api`(本脚本默认行为)。如果是旧版部署写死了 `http://...`,把它改成 `/api` 然后 `cd frontend && npm run build`,刷新浏览器(可能需要清缓存)。

### 后端启动失败
```bash
pm2 logs animap-backend
sudo -u postgres psql -d animap -c "SELECT 1;"
```

### 数据库密码忘了
```bash
sudo -u postgres psql -c "ALTER USER dimnavuser WITH PASSWORD 'newpass';"
# 编辑 backend/.env 同步密码后
pm2 restart animap-backend
```

### 上传图片返回 413
Nginx 默认 client_max_body_size 1M。本脚本已设为 10M,如果手动配置过 Nginx,记得在 server 块内加:
```nginx
client_max_body_size 10M;
```

### 验证码邮件发不出来
- `SMTP_PASS` 是 QQ 邮箱**授权码**(16 位字符串),不是登录密码
- QQ 邮箱:设置 → 账户 → POP3/SMTP → 开启服务并生成授权码

### 商户审核被拒后还能登录?
本版已修复:被拒商户的 JWT 会立即失效(`token_version` 机制)。如果旧版部署残留,可在数据库手动 `UPDATE users SET token_version = token_version + 1 WHERE id = ...`。

## 完全卸载

```bash
cd /var/www/animap
sudo ./uninstall.sh
```

分步交互确认,会清理:进程、数据库、node_modules/dist、.env、uploads,可选删除整个项目目录。

## 安全建议

1. ✅ 启用 HTTPS(脚本可一键完成)
2. ✅ JWT Secret 由脚本生成,数据库密码 / 管理员密码由你设定强密码
3. ✅ CORS 已限制 FRONTEND_URL 列表中的 origin
4. ✅ 防火墙(UFW)已启用,只开 22/80/443
5. ✅ helmet + 限流(express-rate-limit + 内存 IP 封锁)已内置
6. ✅ 文件上传严格白名单(扩展名 + MIME)
7. ✅ 邮件内容 HTML 转义,防钓鱼链接注入
8. ⏰ 定期备份数据库:`sudo -u postgres pg_dump animap > backup_$(date +%Y%m%d).sql`
9. ⏰ 定期 `apt upgrade` / `npm audit`

---

**部署 checklist**:
- [ ] 域名 DNS 已解析到服务器 IP
- [ ] 高德 Key 已在控制台绑定域名白名单
- [ ] 启用 HTTPS
- [ ] 管理员账号密码足够强
- [ ] 验证码邮件能正常发送
- [ ] 测试展会 / 店铺 / 组局 / 收藏 / 审核流程
