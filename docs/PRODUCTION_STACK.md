# AniMap 生产技术栈记录

本文按当前生产服务器 `/var/www/animap/` 的实际状态记录，不包含 `.env` 密钥、数据库密码、邮箱授权码、SSH 私钥等敏感值。

## 服务器概况

- 操作系统：Ubuntu 24.04 LTS
- 项目目录：`/var/www/animap/`
- 前端静态目录：`/var/www/animap/frontend/dist`
- 后端入口：`/var/www/animap/backend/dist/server.js`
- 上传目录：`/var/www/animap/backend/public/uploads`
- 生产日志和备份目录：`/var/www/animap/backups/`

## 系统服务

| 服务 | 生产用途 | 部署脚本处理 |
| --- | --- | --- |
| Node.js 18 / npm | 后端构建和运行、前端构建 | `deploy-with-offsite.sh` 检查版本，不足时安装 Node.js 18 |
| PM2 | 管理 `animap-backend` 后端进程 | 自动安装、重启、`pm2 save`、设置 systemd startup |
| Nginx | HTTPS 入口、前端静态文件、`/api` 反代、`/uploads` 静态缓存 | 默认只安装和启动；设置 `CONFIGURE_NGINX=1` 才重写站点配置 |
| Certbot / Let's Encrypt | `animap.top` 和 `www.animap.top` HTTPS 证书 | 默认不申请证书；设置 `ENABLE_CERTBOT=1` 时配合 Nginx 写入证书 |
| PostgreSQL 16 | 主数据库，保存用户、活动、店铺、组局、收藏、评论、设置等数据 | 自动安装和启动；迁移前创建数据库快照，不删除数据 |
| Redis 7 | 公开读接口缓存 | 自动安装和启动；写入 `REDIS_ENABLED=true` 和 `REDIS_URL=redis://127.0.0.1:6379` |
| Python 3.12 + venv | B站会员购同步脚本运行环境 | 自动创建 `scripts/venv` 并安装 Python 依赖 |
| Playwright Chromium | B站动态页面兜底渲染解析 | 默认安装，可用 `BILIBILI_INSTALL_PLAYWRIGHT=0` 跳过 |
| Cron | B站同步、异地备份、异地校验 | 自动写入 `/etc/cron.d/animap-events-sync` 和 `/etc/cron.d/animap-offsite-backup` |
| rsync + zstd + OpenSSH | 异地备份传输、压缩、校验 | 自动安装并配置备份脚本 |
| UFW | 防火墙 | 默认不改；设置 `CONFIGURE_UFW=1` 才开放 SSH/80/443 并启用 |

## Node 应用技术栈

后端：

- Express + TypeScript
- PostgreSQL `pg`
- Redis `redis`
- JWT、bcryptjs、express-validator、helmet、express-rate-limit
- multer + sharp 图片上传和预览图处理
- nodemailer + QQ SMTP 邮件发送
- axios 调用外部接口

前端：

- React 18 + TypeScript + Vite
- Tailwind CSS
- React Router
- 高德地图 JS API loader
- Framer Motion、GSAP、Lucide React

## 后端环境变量键

生产后端 `.env` 当前使用这些键；文档只记录键名，不记录值：

```text
AMAP_WEB_SERVICE_KEY
BILIBILI_SYNC_ENV_FILE
BILIBILI_SYNC_PYTHON
BILIBILI_SYNC_SCRIPT
DB_HOST
DB_NAME
DB_PASSWORD
DB_PORT
DB_USER
FRONTEND_URL
JWT_SECRET
MAX_FILE_SIZE
NODE_ENV
PORT
REDIS_ENABLED
REDIS_URL
SMTP_HOST
SMTP_PASS
SMTP_PORT
SMTP_USER
UPLOAD_DIR
```

前端 `.env`：

```text
VITE_AMAP_KEY
VITE_AMAP_SECURITY_CODE
VITE_API_URL
```

## Nginx 生产入口

生产 Nginx 站点为 `/etc/nginx/sites-enabled/animap`：

- `server_name animap.top www.animap.top`
- `client_max_body_size 20M`
- `/` 服务 `frontend/dist`，并回退到 `index.html`
- `/api` 反代到 `http://127.0.0.1:3001`
- `/uploads` 映射到 `backend/public/uploads`，设置 30 天静态缓存
- 443 使用 Certbot 管理的 Let's Encrypt 证书
- 80 跳转 HTTPS

## Redis 缓存

Redis 只作为公开读接口加速层，PostgreSQL 仍然是唯一真实数据源。Redis 不可用时接口自动查数据库。

缓存键和 TTL：

- `public:events:v1`：`GET /api/events/public`，30 秒
- `public:venues:v1`：`GET /api/venues/public`，60 秒
- `public:sessions:v1`：`GET /api/sessions/public`，60 秒

主动清缓存场景：

- 活动创建、更新、删除、审核状态变化、收藏/取消收藏、B站同步成功
- 店铺创建、更新、删除、审核状态变化
- 组局创建、更新、删除、报名、取消报名

## B站同步

生产脚本目录：`/var/www/animap/scripts/`

- `sync_events.py`：抓取 B站会员购活动并导入 AniMap 数据库
- `setup_cron.sh`：安装 Python 依赖和 cron 的辅助脚本
- `venv/`：Python 虚拟环境，运行时产物，不提交 Git
- `.events_sync.env`：生产同步配置，包含密钥，不提交 Git
- 日志：`/var/log/animap/events_sync.log`
- cron：`/etc/cron.d/animap-events-sync`

生产后端也可以通过站点设置手动触发 B站同步，使用：

```text
BILIBILI_SYNC_SCRIPT=/var/www/animap/scripts/sync_events.py
BILIBILI_SYNC_PYTHON=/var/www/animap/scripts/venv/bin/python
BILIBILI_SYNC_ENV_FILE=/var/www/animap/scripts/.events_sync.env
```

## 异地容灾

异地容灾详见 [OFFSITE_DISASTER_RECOVERY.md](OFFSITE_DISASTER_RECOVERY.md)。核心生产文件：

- `/var/www/animap/scripts/offsite_backup.sh`
- `/var/www/animap/scripts/offsite_verify_uploads.sh`
- `/etc/cron.d/animap-offsite-backup`
- `/root/.ssh/animap_offsite_backup_ed25519`，私钥不入库

当前一键入口：

```bash
sudo ./deploy-with-offsite.sh
```

默认行为是保守刷新：安装缺失技术栈、保留生产 `.env`、保留 uploads、迁移前备份数据库、更新构建、刷新 B站同步和异地备份脚本。会修改 Nginx/UFW/证书的动作必须显式打开对应环境变量。

## 生产同步记录

2026-05-24 对生产服务器 `/var/www/animap/` 做过源码、脚本和文档级比对。比对范围包括：

- `backend/src/`
- `frontend/src/`
- `frontend/public/icons/`
- `scripts/`
- `docs/`
- `README.md`
- `deploy.sh`
- `deploy-with-offsite.sh`
- 前后端 `package.json`

比对时明确排除运行态和敏感文件：`.env*`、`uploads/`、`node_modules/`、`dist/`、`backups/`、`scripts/venv/`、`scripts/.events_sync.env`、`__pycache__/`、数据库备份、SSH 私钥和临时打包文件。

结论：生产服务器没有本地缺失的核心源码、脚本或文档；本地源码更新，生产前端实际以本地构建后上传的 `frontend/dist` 为准。后续部署仍应从本地仓库构建，并使用生产前端环境变量 `VITE_API_URL=/api`、`VITE_AMAP_KEY`、`VITE_AMAP_SECURITY_CODE` 生成静态产物，不能用服务器旧版 `frontend/src` 覆盖本地。

## AI 活动简介整理

`scripts/backfill_ai_event_descriptions.py` 用于离线整理当前已进入地图展示的活动简介。它默认 dry-run，不写数据库；只有显式传入 `--apply` 才会更新 PostgreSQL。

适用范围：

- `events.status = 'approved'`
- `events.display_until >= NOW()`
- `description` 为空，或仍是旧兜底文案 `活动地点：...`

脚本不会覆盖人工编辑过的简介。大模型只作为文本整理函数使用，不决定审核状态，不执行数据库以外的动作。

需要环境变量：

```text
AI_SUMMARY_API_KEY
AI_SUMMARY_BASE_URL   # 可选，默认 https://api.openai.com/v1
AI_SUMMARY_MODEL      # 可选，默认 gpt-4o-mini
```

生产 dry-run 示例：

```bash
cd /var/www/animap
source scripts/.events_sync.env 2>/dev/null || true
python3 scripts/backfill_ai_event_descriptions.py --limit 5
```

生产写入前必须先备份数据库，然后执行：

```bash
cd /var/www/animap
source scripts/.events_sync.env 2>/dev/null || true
python3 scripts/backfill_ai_event_descriptions.py --limit 20 --apply
redis-cli DEL public:events:v1
```

安全策略：

- 用户或第三方活动文本会被包进 `<untrusted_user_event>`，只允许作为事实来源，不允许作为指令。
- 模型只允许输出 JSON：`{"description":"..."}`。
- 输出会做长度、HTML、URL、联系方式密度、提示词注入残留词检查。
- 调用失败或校验失败时跳过该活动，不影响其他活动。
- 不把数据库密码、服务器路径、Redis 配置、用户 token 或任何敏感信息传给大模型。


### NewAPI 兼容接口

AI 活动简介整理除了直连 OpenAI，也可以接入 NewAPI 这类 OpenAI 兼容的 API 网关。只要网关暴露标准的 `/v1/chat/completions` 接口即可，baseUrl 形如：

```text
https://<your-newapi-host>/v1
https://<your-newapi-host>/v1/chat/completions
```

baseUrl、model、API Key 都通过后台站点设置（settings）配置，对应后端的 `AI_SUMMARY_BASE_URL`、`AI_SUMMARY_MODEL`、`AI_SUMMARY_API_KEY`。后台保存时只回显脱敏后的 Key，不存储明文到日志。
