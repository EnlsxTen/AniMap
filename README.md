# AniMap - ACG展会聚合平台

一个帮助 ACG 爱好者发现身边小型漫展和同人展的网站平台。

## 项目特性

- 🗺️ 高德地图集成，直观展示展会/店铺/组局位置
- 📍 基于地理位置的展会搜索与分类筛选
- 👥 商户自主注册和发布展会
- 🏪 店铺系统（场馆信息、导航照片、营业时间）
- 🎲 组局系统（桌游/剧本杀约局，支持报名管理）
- ❤️ 收藏功能（展会/店铺/组局，活动前邮件提醒）
- 📧 邮件通知（验证码、审核结果、报名确认、组局满员）
- 🎨 二次元风格的现代化界面，支持深色模式
- 📱 移动端和PC端完美适配
- ✅ 展会与商户双重审核机制

## 技术栈

### 后端
- Node.js + Express
- TypeScript
- PostgreSQL
- JWT 认证
- 高德地图 Web 服务 API

### 前端
- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- 高德地图 JS API

## 项目结构

```
animap/
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── controllers/    # 控制器
│   │   ├── database/       # 数据库配置和迁移
│   │   ├── middleware/     # 中间件
│   │   ├── routes/         # 路由
│   │   ├── utils/          # 工具函数
│   │   └── server.ts       # 服务器入口
│   ├── public/uploads/     # 上传文件目录
│   └── package.json
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── components/    # React 组件
│   │   ├── pages/         # 页面组件
│   │   ├── services/      # API 服务
│   │   ├── types/         # TypeScript 类型
│   │   ├── utils/         # 工具函数
│   │   └── App.tsx        # 应用入口
│   └── package.json
├── deploy-setup.sh        # Ubuntu 环境安装脚本
├── deploy-app.sh          # 应用部署脚本
├── update-app.sh          # 增量更新脚本
├── check-deployment.sh    # 部署前环境检查脚本
├── uninstall.sh           # 完全卸载脚本
└── README.md
```

## 本地开发

### 前置要求

- Node.js 18+
- PostgreSQL 12+
- 高德地图 API Key (Web端 + Web服务端)

### 后端设置

1. 进入后端目录：
```bash
cd backend
```

2. 安装依赖：
```bash
npm install
```

3. 配置环境变量：
```bash
cp .env.example .env
# 编辑 .env 文件，填入数据库配置、高德地图 API Key、SMTP 邮箱、管理员账号等
```

4. 创建数据库：
```bash
# 登录 PostgreSQL
sudo -u postgres psql

# 创建数据库
CREATE DATABASE animap;
CREATE USER dimnavuser WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE animap TO dimnavuser;
\q
```

5. 运行数据库迁移：
```bash
npm run migrate
```

6. 启动开发服务器：
```bash
npm run dev
```

后端将运行在 http://localhost:3001

### 前端设置

1. 进入前端目录：
```bash
cd frontend
```

2. 安装依赖：
```bash
npm install
```

3. 配置环境变量：
```bash
cp .env.example .env
# 如需修改 API 地址，编辑 .env 文件
```

4. 修改高德地图配置：
- 编辑 `frontend/.env`，填入你的高德地图 Web 端 Key 和安全密钥：
  ```
  VITE_AMAP_KEY=你的高德地图Web端Key
  VITE_AMAP_SECURITY_CODE=你的安全密钥
  ```

5. 启动开发服务器：
```bash
npm run dev
```

前端将运行在 http://localhost:3000

## Ubuntu 服务器部署

### 1. 环境准备

上传 `deploy-setup.sh` 到服务器并运行：

```bash
chmod +x deploy-setup.sh
sudo ./deploy-setup.sh
```

这将安装：
- Node.js 18
- PostgreSQL
- Nginx
- PM2

### 2. 上传项目代码

将项目代码上传到服务器（建议路径：`/var/www/animap`）

```bash
# 使用 scp 或 git clone
scp -r animap user@server:/var/www/
# 或
cd /var/www
git clone your-repo-url animap
```

### 3. 配置环境变量

```bash
cd /var/www/animap/backend
cp .env.example .env
nano .env  # 编辑配置文件
```

配置项：
- 数据库连接信息
- JWT 密钥
- 高德地图 Web 服务 Key
- SMTP 邮箱配置
- 管理员种子账号（ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_USERNAME）

### 4. 部署应用

```bash
cd /var/www/animap
chmod +x deploy-app.sh
# deploy-app.sh 会交互式引导你配置域名、高德Key、邮箱、管理员账号等所有参数
sudo ./deploy-app.sh
```

### 5. 配置 SSL（可选但推荐）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## API 接口文档

### 认证接口

#### 注册
```
POST /api/auth/register
Body: { email, password, username, phone? }
```

#### 登录
```
POST /api/auth/login
Body: { email, password }
```

#### 获取用户信息
```
GET /api/auth/profile
Headers: Authorization: Bearer <token>
```

### 展会接口

#### 获取公开展会列表
```
GET /api/events/public
```

#### 获取展会详情
```
GET /api/events/:id
```

#### 获取商户的展会列表
```
GET /api/events/merchant/my-events
Headers: Authorization: Bearer <token>
```

#### 创建展会
```
POST /api/events
Headers: Authorization: Bearer <token>
Content-Type: multipart/form-data
Body: FormData with fields: name, poster, start_time, end_time, venue_name, address, ticket_price?, description?
```

#### 更新展会
```
PUT /api/events/:id
Headers: Authorization: Bearer <token>
Content-Type: multipart/form-data
```

#### 删除展会
```
DELETE /api/events/:id
Headers: Authorization: Bearer <token>
```

## 数据库结构

### users 表
- id: 主键
- email: 邮箱（唯一）
- password: 加密密码
- username: 用户名
- phone: 手机号
- role: 角色（默认 merchant）
- created_at: 创建时间
- updated_at: 更新时间

### events 表
- id: 主键
- user_id: 用户ID（外键）
- name: 展会名称
- poster_url: 海报图片路径
- start_time: 开始时间
- end_time: 结束时间
- venue_name: 场馆名称
- address: 详细地址
- latitude: 纬度
- longitude: 经度
- ticket_price: 票价
- description: 简介
- status: 状态（pending/approved/rejected）
- created_at: 创建时间
- updated_at: 更新时间

## 常用命令

### 开发环境

```bash
# 后端
cd backend
npm run dev          # 启动开发服务器
npm run build        # 编译 TypeScript
npm run migrate      # 运行数据库迁移

# 前端
cd frontend
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run preview      # 预览生产版本
```

### 生产环境

```bash
# PM2 管理
pm2 list                                      # 查看所有进程
pm2 logs animap-backend       # 查看日志
pm2 restart animap-backend    # 重启应用
pm2 stop animap-backend       # 停止应用
pm2 delete animap-backend     # 删除进程

# Nginx
sudo nginx -t                                 # 测试配置
sudo systemctl restart nginx                  # 重启 Nginx
sudo systemctl status nginx                   # 查看状态

# PostgreSQL
sudo -u postgres psql animap  # 连接数据库
```

## 注意事项

1. **高德地图 API Key**：需要申请两个 Key
   - Web 端 Key：配置到 `frontend/.env` 的 `VITE_AMAP_KEY`
   - Web 服务 Key：配置到 `backend/.env` 的 `AMAP_WEB_SERVICE_KEY`
   - 安全密钥（可选）：配置到 `frontend/.env` 的 `VITE_AMAP_SECURITY_CODE`

2. **安全配置**：
   - 修改 JWT_SECRET 为强密码
   - 修改数据库密码
   - 生产环境启用 HTTPS

3. **文件上传**：
   - 默认限制 5MB
   - 支持格式：jpg, jpeg, png, gif, webp
   - 上传目录：backend/public/uploads

4. **审核机制**：
   - 商户发布的展会默认状态为 pending
   - 需要管理员审核通过后才会在地图上显示
   - 管理员账号在首次 `npm run migrate` 时通过 `.env` 中的 `ADMIN_EMAIL`/`ADMIN_PASSWORD` 自动创建
   - 管理员登录后进入 `/admin/reviews` 审核后台

## 许可证

MIT License

## 支持

如有问题，请提交 Issue 或联系开发者。
