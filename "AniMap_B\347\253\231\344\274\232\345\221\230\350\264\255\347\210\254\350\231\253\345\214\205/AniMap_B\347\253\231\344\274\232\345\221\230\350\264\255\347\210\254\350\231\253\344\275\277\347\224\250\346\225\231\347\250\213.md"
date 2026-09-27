# AniMap B站会员购爬虫使用教程

## 文件说明

- `sync_events.py`：主爬虫脚本，负责抓取 B站会员购活动、分类、获取经纬度、下载海报、写入 AniMap 的 PostgreSQL 数据库。
- `setup_cron.sh`：Linux 服务器部署脚本，负责安装依赖并配置每天凌晨 3 点自动运行。

## 服务器环境要求

- Python 3.8+
- PostgreSQL 可被脚本直连
- AniMap 数据库里已有 `events.source_url` 字段
- PostgreSQL 角色：`system`

## 必填配置

运行脚本前需要设置这些环境变量：

```bash
export AMAP_WEB_SERVICE_KEY="你的高德 Web 服务 Key"
export DB_HOST="127.0.0.1"
export DB_PORT="5432"
export DB_NAME="animap"
export DB_USER="system"
export ANIMAP_IMPORT_USER_ID="AniMap users 表里的用户 id"
```

`ANIMAP_IMPORT_USER_ID` 不是数据库角色名，而是 AniMap 业务用户表 `users.id` 的数字编号。可以在数据库里查询：

```sql
SELECT id, username, role FROM users ORDER BY id;
```

可选配置：

```bash
export ANIMAP_UPLOAD_DIR="/var/www/animap/public/uploads"  # 海报下载目录，默认值即此
```

## 首次部署（推荐）

把 `sync_events.py` 和 `setup_cron.sh` 放到服务器 AniMap 项目目录，例如：

```bash
/var/www/animap/scripts
```

然后运行：

```bash
sudo APP_DIR=/var/www/animap/scripts bash /var/www/animap/scripts/setup_cron.sh
```

安装后编辑配置文件：

```bash
sudo nano /var/www/animap/scripts/.events_sync.env
```

填写：

```bash
AMAP_WEB_SERVICE_KEY=你的高德Key
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=animap
DB_USER=system
ANIMAP_IMPORT_USER_ID=用户ID
ANIMAP_UPLOAD_DIR=/var/www/animap/public/uploads
EVENT_SCOPE=convention
```

## 手动测试（Ubuntu 24.04）

Ubuntu 24.04 限制了全局 pip 安装，必须在虚拟环境里运行。`setup_cron.sh` 已自动创建虚拟环境，手动测试时使用虚拟环境的 Python：

```bash
# 激活虚拟环境
source /var/www/animap/scripts/.venv-events-sync/bin/activate

# 加载配置
set -a; source /var/www/animap/scripts/.events_sync.env; set +a

# dry-run 测试（只打印，不写库）
python sync_events.py --dry-run --city 南京 --event-scope convention --max-pages 1

# 退出虚拟环境
deactivate
```

如果还没运行过 `setup_cron.sh`，需要先手动创建虚拟环境：

```bash
python3 -m venv /var/www/animap/scripts/.venv-events-sync
/var/www/animap/scripts/.venv-events-sync/bin/pip install requests beautifulsoup4 psycopg2-binary
```

## 正式导入

确认 dry-run 正常后，执行：

```bash
source /var/www/animap/scripts/.venv-events-sync/bin/activate
set -a; source /var/www/animap/scripts/.events_sync.env; set +a
python sync_events.py --city 南京 --event-scope convention --max-pages 5
deactivate
```

脚本会：

1. 从 B站会员购抓取活动。
2. 识别漫展/演出/脱口秀等分类。
3. 优先使用 B站接口自带经纬度；缺失时调用高德地理编码。
4. 把海报图片下载到本地 uploads 目录（绕过 B站防盗链）。
5. 用 `source_url` 去重。
6. 写入 AniMap 的 `events` 表。

## 自动定时运行

定时任务每天凌晨 3 点运行，日志位置：

```bash
/var/log/animap/events_sync.log
```

查看日志：

```bash
tail -f /var/log/animap/events_sync.log
```

## 常见问题

**提示 `Missing AMAP_WEB_SERVICE_KEY`**：没有配置高德 Key。

**提示 `Missing ANIMAP_IMPORT_USER_ID`**：没有填写 AniMap 用户 ID。

**提示 `ANIMAP_IMPORT_USER_ID does not exist`**：填写的用户 ID 在 `users` 表里不存在。

**提示 `externally-managed-environment` 或 pip 安装失败**：Ubuntu 24.04 限制全局 pip，必须使用虚拟环境，见上方"手动测试"章节。

**抓不到某个城市**：脚本内置了常见城市的 B站 area ID。未内置城市仍会用本地过滤，但可能需要提高 `--max-pages`。

**海报显示问号**：旧数据的海报 URL 是 B站外链，有防盗链限制。重新导入新数据时脚本会自动下载海报到本地。已有数据需手动更新或删除后重新导入。
