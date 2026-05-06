# Ubuntu 服务器部署完整指南

## 前置准备

### 1. 服务器要求
- Ubuntu 20.04 或 22.04
- 至少 2GB RAM
- 至少 20GB 磁盘空间
- Root 或 sudo 权限

### 2. 本地准备
- 服务器 IP 地址
- SSH 访问权限
- 域名（可选，建议配置）

### 3. 你需要提前准备的信息
- 高德地图 Web 端 Key（前端地图显示）
- 高德地图 Web 服务 Key（后端地理编码）
- 高德地图安全密钥 securityJsCode（可选）
- QQ 邮箱地址 + 授权码（用于发送验证码）
- 管理员邮箱、用户名、密码（用于审核后台）

> 高德地图 Key 申请：访问 https://console.amap.com/ ，创建应用后分别添加「Web端(JS API)」和「Web服务」两个 Key。

## 部署步骤

### 第一步：上传项目到服务器

#### 方法1：使用 Git（推荐）

```bash
# 在服务器上
ssh user@your-server-ip
cd /var/www
sudo git clone https://github.com/your-username/animap.git
sudo chown -R $USER:$USER animap
```

#### 方法2：使用 SCP 直接上传

在本地运行：
```bash
# 压缩项目（排除 node_modules）
tar --exclude='node_modules' --exclude='dist' -czf animap.tar.gz animap/

# 上传到服务器
scp animap.tar.gz user@your-server-ip:/tmp/
```

在服务器上运行：
```bash
sudo mkdir -p /var/www
cd /var/www
sudo tar -xzf /tmp/animap.tar.gz
sudo chown -R $USER:$USER animap
```

### 第二步：安装环境

```bash
cd /var/www/animap
chmod +x deploy-setup.sh deploy-app.sh
sudo ./deploy-setup.sh
```

脚本会交互式要求你设置数据库密码，并自动安装：
- Node.js 18
- PostgreSQL（自动建库建用户）
- Nginx
- PM2

### 第三步：运行部署脚本

```bash
cd /var/www/animap
sudo ./deploy-app.sh
```

脚本会交互式引导你输入所有配置，包括：

| 配置项 | 说明 |
|--------|------|
| 域名/IP | 你的服务器域名或 IP |
| 数据库密码 | 自动从 deploy-setup.sh 读取，或手动输入 |
| 高德地图 Web 端 Key | 写入 `frontend/.env` 的 `VITE_AMAP_KEY` |
| 高德地图安全密钥 | 写入 `frontend/.env` 的 `VITE_AMAP_SECURITY_CODE`（可选） |
| 高德地图 Web 服务 Key | 写入 `backend/.env` 的 `AMAP_WEB_SERVICE_KEY` |
| QQ 邮箱 + 授权码 | 用于发送验证码邮件 |
| 管理员邮箱/用户名/密码 | 首次 migrate 时自动创建管理员账号 |
| JWT Secret | 自动生成 |

脚本会自动完成：
1. 生成 `backend/.env` 和 `frontend/.env`
2. 安装依赖、编译代码
3. 运行数据库迁移（建表 + 创建管理员）
4. PM2 启动后端
5. 构建前端
6. 配置 Nginx 反向代理
7. 配置防火墙

### 第四步：配置 SSL 证书（强烈推荐）

仅在有域名时执行：

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

### 第五步：验证部署

1. **检查后端服务**：
```bash
pm2 list
pm2 logs animap-backend
```

2. **检查 Nginx**：
```bash
sudo nginx -t
sudo systemctl status nginx
```

3. **访问网站**：打开浏览器访问 `http://your-domain.com` 或 `http://your-server-ip`

4. **测试功能**：
   - 首页地图正常显示（应定位到你所在城市，而非北京）
   - 用管理员账号登录，进入审核后台 `/admin/reviews`
   - 注册商户账号（需要收到验证码邮件），管理员审核通过
   - 发布展会，管理员审核通过后，地图上可见（展会/店铺/组局 tab 均可切换）
   - 发布组局，首页地图"组局"tab 下可见蓝色标记
   - 收藏展会/组局，在收藏页面开启邮件提醒，确认提醒开关可正常切换
   - 手机端测试：汉堡菜单可正常展开，能导航到首页和各管理页面

## 手动配置（不使用部署脚本时）

如果你不想用 `deploy-app.sh`，可以手动配置：

### 后端 .env

```bash
cd /var/www/animap/backend
cp .env.example .env
nano .env
```

需要填写的关键配置：
```env
NODE_ENV=production
FRONTEND_URL=http://your-domain.com
DB_PASSWORD=你的数据库密码
JWT_SECRET=运行 openssl rand -base64 32 生成
AMAP_WEB_SERVICE_KEY=你的高德地图Web服务Key
SMTP_USER=你的QQ邮箱
SMTP_PASS=你的QQ邮箱授权码
ADMIN_EMAIL=管理员邮箱
ADMIN_PASSWORD=管理员密码
ADMIN_USERNAME=管理员用户名
```

### 前端 .env

```bash
cd /var/www/animap/frontend
cp .env.example .env
nano .env
```

```env
VITE_API_URL=http://your-domain.com/api
VITE_AMAP_KEY=你的高德地图Web端Key
VITE_AMAP_SECURITY_CODE=你的高德地图安全密钥
```

然后手动构建和启动：
```bash
# 后端
cd backend && npm install && npm run build && npm run migrate
pm2 start dist/server.js --name animap-backend

# 前端
cd ../frontend && npm install && npm run build
```

## 管理后台功能

### 管理员可用页面

| 页面 | 路径 | 功能 |
|------|------|------|
| 活动中心 | `/merchant` | 管理自己发布的活动、店铺、组局 |
| 审核后台 | `/admin/reviews` | 审核商户注册申请和活动发布（通过/拒绝） |
| 发布活动 | `/merchant/create` | 发布新活动 |

### 活动审核流程

1. 用户（商户/个人/管理员）发布活动，状态为 `pending`
2. 管理员在活动审核页面查看待审核活动
3. 管理员点击"通过"或"拒绝"
4. 通过的活动状态变为 `approved`，在首页地图上展示
5. 拒绝的活动状态变为 `rejected`，不会公开显示

### 商户审核流程

1. 用户注册时选择"商户"类型，状态为 `pending`
2. 管理员在商户审核页面查看待审核商户
3. 审核通过后商户可登录并发布活动
4. 拒绝后商户无法登录

### 移动端导航

所有管理页面在手机端提供汉堡菜单，点击右上角菜单按钮可导航到：
- 商户审核（仅管理员）
- 活动审核（仅管理员）
- 活动中心
- 返回首页
- 退出登录

## 地图定位说明

地图初始化使用 IP 定位策略：
- 通过高德 `CitySearch` 接口根据用户 IP 定位到所在城市
- 手机端和电脑端均会正确显示用户所在城市
- 不依赖 GPS 定位，避免权限问题导致定位失败

## 常见问题排查

### 问题1：后端服务无法启动

```bash
pm2 logs animap-backend
sudo -u postgres psql -d animap -c "SELECT 1;"
pm2 restart animap-backend
```

### 问题2：前端无法访问后端 API

```bash
sudo nginx -t
sudo systemctl restart nginx
sudo ufw status
sudo ufw allow 'Nginx Full'
```

### 问题3：数据库连接失败

```bash
sudo systemctl status postgresql
# 重置密码
sudo -u postgres psql
ALTER USER dimnavuser WITH PASSWORD 'new_password';
\q
# 更新 backend/.env 中的 DB_PASSWORD
```

### 问题4：图片上传失败

```bash
sudo chmod 755 /var/www/animap/backend/public/uploads
sudo chown -R $USER:$USER /var/www/animap/backend/public/uploads
```

### 问题5：地图无法显示

1. 检查浏览器控制台是否有 `VITE_AMAP_KEY is not set` 警告
2. 确认 `frontend/.env` 中 `VITE_AMAP_KEY` 已正确填写
3. 在高德控制台检查域名白名单设置
4. 如修改了 `.env`，需重新 `npm run build` 前端

### 问题6：管理员账号未创建

```bash
# 检查 backend/.env 中是否有 ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_USERNAME
# 重新运行迁移
cd /var/www/animap/backend
npm run migrate
```

或手动创建：
```bash
sudo -u postgres psql animap
UPDATE users SET role = 'admin', approval_status = 'approved' WHERE email = '你的邮箱';
\q
```

### 问题7：验证码邮件发送失败

```bash
# 检查 backend/.env 中 SMTP 配置
grep SMTP backend/.env

# 确认配置正确：
# SMTP_HOST=smtp.qq.com
# SMTP_PORT=465
# SMTP_USER=你的QQ邮箱@qq.com
# SMTP_PASS=16位QQ邮箱授权码（不是登录密码）
```

获取 QQ 邮箱授权码：
1. 登录 QQ 邮箱网页版
2. 设置 → 账户 → POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV 服务
3. 开启 SMTP 服务
4. 生成授权码（16位字符串）

### 问题8：活动发布后地图上看不到

活动发布后状态为 `pending`，需要管理员审核通过才会在地图上显示：
1. 管理员登录后访问 `/admin/reviews`
2. 在审核后台点击"通过"
3. 刷新首页即可在地图上看到活动

### 问题9：手机端无法返回首页

确认前端代码已更新。所有管理页面（活动中心、商户审核、活动审核）在手机端右上角有汉堡菜单按钮，点击展开导航菜单。

## 日常维护命令

### PM2 进程管理
```bash
pm2 list                                      # 查看所有进程
pm2 logs animap-backend       # 查看日志
pm2 restart animap-backend    # 重启应用
pm2 stop animap-backend       # 停止应用
pm2 delete animap-backend     # 删除进程
```

### 更新代码
```bash
cd /var/www/animap
git pull origin main

# 更新后端
cd backend
npm install
npm run build
npm run migrate
pm2 restart animap-backend

# 更新前端（如改了 .env 或代码）
cd ../frontend
npm install
npm run build
```

### 查看日志
```bash
pm2 logs animap-backend       # 后端日志
sudo tail -f /var/log/nginx/access.log        # Nginx 访问日志
sudo tail -f /var/log/nginx/error.log         # Nginx 错误日志
```

### 数据库备份
```bash
sudo -u postgres pg_dump animap > backup_$(date +%Y%m%d).sql
# 恢复
sudo -u postgres psql animap < backup_20260418.sql
```

## 安全建议

1. 使用强密码（JWT_SECRET 已自动生成、数据库密码、管理员密码）
2. 配置 HTTPS（Let's Encrypt）
3. CORS 已限制为 FRONTEND_URL 指定的域名
4. 定期更新系统和依赖
5. 防火墙已配置（UFW）
6. 定期备份数据库
7. 监控服务器资源使用
8. 生产环境务必修改 `backend/.env` 中的 SMTP 授权码等敏感信息

## 完全卸载

项目提供了 Ubuntu 环境的卸载脚本，可一键清理所有项目痕迹：

```bash
cd /var/www/animap
chmod +x uninstall.sh
./uninstall.sh
```

脚本会分步执行（每步都有确认提示）：
1. 停止端口 3000/3001 上的进程
2. 删除 PostgreSQL 数据库 `animap`（需输入密码，可跳过）
3. 清理后端文件（node_modules、dist、.env、uploads）
4. 清理前端文件（node_modules、dist）
5. 可选删除整个项目目录

输入 `YES` 才会开始执行，不会误操作。

---

**部署完成后，记得：**
- [ ] 修改所有默认密码
- [ ] 配置 SSL 证书
- [ ] 设置数据库定期备份
- [ ] 测试所有功能（含手机端）
- [ ] 测试活动审核流程（`/admin/reviews`）
- [ ] 测试验证码邮件发送
- [ ] 测试收藏提醒开关（收藏展会/组局后在收藏页开启）
- [ ] 配置域名 DNS 解析
