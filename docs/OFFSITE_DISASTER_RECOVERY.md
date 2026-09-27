# AniMap 异地容灾与部署记录

本文记录当前生产环境到异地 VPS 的容灾配置、验证流程，以及以后推荐使用的一键部署入口。文档不保存服务器密码、邮箱授权码、数据库密码、SSH 私钥等敏感信息。

## 当前拓扑

- 生产站点：`https://animap.top`
- 生产项目目录：`/var/www/animap/`
- 生产后端进程：PM2 `animap-backend`
- 异地 VPS SSH：`OFFSITE_HOST_PLACEHOLDER:22_PLACEHOLDER_PORT`
- 异地备份用户：`backup_user`
- 异地备份目录：`/srv/animap-backups/animap`
- 生产机备份脚本目录：`/var/www/animap/scripts/`
- 生产机备份日志目录：`/var/www/animap/backups/`
- 定时任务：`/etc/cron.d/animap-offsite-backup`

## 已落地的改动记录

- 后台站点设置增加“异地备份”管理区，可查看脚本状态、cron 状态、备份状态、上传文件校验状态，并可手动触发备份或校验。
- 生产机新增 `offsite_backup.sh`：备份 PostgreSQL、关键配置、manifest，并按需同步 `backend/public/uploads` 到异地 VPS。
- 生产机新增 `offsite_verify_uploads.sh`：对比生产 uploads 和异地 VPS uploads 的文件名与大小，失败时写入 diff 文件。
- 异地 VPS 新增独立备份用户 `backup_user`，备份目录归该用户管理，避免影响 VPS 上已有项目。
- 备份脚本增加失败落盘：如果 SSH/rsync 超时或核心步骤失败，会写入 `ERROR offsite backup failed`，后台不再误判为一直“运行中”。
- 备份脚本把复制日志尾部、远端保留策略清理改为警告级别；核心备份文件已经上传后，这些收尾步骤失败不会让状态卡死。
- 校验报错处理记录：生产 uploads 从 `511` 个增加到 `513` 个后，异地 VPS 少了 2 个新文件，校验失败是正确结果。缺失文件已通过本机中转补齐，随后校验通过。

最近一次已确认的校验状态：

- 状态：`success`
- 文件数：`513`
- 总大小：`141425712` bytes
- 时间：`2026-05-22T15:09:57+00:00`

## 推荐的一键入口

以后生产部署和异地容灾刷新都使用仓库根目录的：

```bash
sudo ./deploy-with-offsite.sh
```

这个脚本会做以下事情：

1. 检查生产项目结构和 `.env` 是否存在。
2. 安装生产技术栈：Node.js 18、PM2、Nginx、PostgreSQL、Redis、Certbot、Python venv、cron、rsync、zstd、OpenSSH。
3. 安装或刷新 B站同步脚本、Python `scripts/venv` 和 `/etc/cron.d/animap-events-sync`。
4. 增量更新项目代码、安装依赖、构建前后端、执行数据库迁移、重启 PM2。
5. 在迁移前保存一次本地数据库快照和 `.env` 快照。
6. 安装或刷新 `/var/www/animap/scripts/offsite_backup.sh` 和 `/var/www/animap/scripts/offsite_verify_uploads.sh`。
7. 生成或复用 `/root/.ssh/animap_offsite_backup_ed25519`。
8. 可选初始化异地 VPS 用户、authorized_keys 和目录结构。
9. 写入后端 `.env` 的 Redis、B站同步和异地备份展示配置。
10. 安装 `/etc/cron.d/animap-offsite-backup`。
11. 重启后端，让站点设置页面读取最新配置。

## 首次配置异地 VPS

首次配置时，需要让生产机能登录异地 VPS 的 root 或有 sudo 权限的管理账号。不要把密码写进仓库；用环境变量临时传入即可。

```bash
cd /var/www/animap
sudo OFFSITE_PROVISION_REMOTE=1 \
  OFFSITE_REMOTE_ADMIN=root \
  OFFSITE_REMOTE_ADMIN_PASSWORD='临时填写 VPS 管理员密码' \
  ./deploy-with-offsite.sh
```

脚本会在异地 VPS 上创建或复用 `backup_user` 用户，把生产机公钥加入该用户的 `authorized_keys`，并创建：

```text
/srv/animap-backups/animap/current/uploads
/srv/animap-backups/animap/database
/srv/animap-backups/animap/configs
/srv/animap-backups/animap/manifests
/srv/animap-backups/animap/deleted
/srv/animap-backups/animap/logs
```

首次配置完成后，后续例行部署不需要再传 VPS 密码：

```bash
cd /var/www/animap
sudo ./deploy-with-offsite.sh
```

## 常用环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_DIR` | `/var/www/animap` | 生产项目目录 |
| `RUN_APP_UPDATE` | `1` | 是否同时更新应用；设为 `0` 只刷新异地备份配置 |
| `ASSUME_YES` | `0` | 设为 `1` 跳过交互确认 |
| `CONFIGURE_NGINX` | `0` | 设为 `1` 才写入 Nginx 站点配置 |
| `ENABLE_CERTBOT` | `0` | 设为 `1` 才通过 Certbot 申请/刷新 HTTPS 配置 |
| `CONFIGURE_UFW` | `0` | 设为 `1` 才修改 UFW 防火墙 |
| `REDIS_ENABLED` | `true` | 写入后端 `.env` 的 Redis 开关 |
| `REDIS_URL` | `redis://127.0.0.1:6379` | 写入后端 `.env` 的 Redis 地址 |
| `BILIBILI_SYNC_ENABLED` | `1` | 是否安装 B站同步脚本和 Python venv |
| `BILIBILI_SYNC_CRON_ENABLED` | `1` | 是否安装 B站同步 cron |
| `BILIBILI_VENV_DIR` | `/var/www/animap/scripts/venv` | B站同步 Python 虚拟环境 |
| `OFFSITE_BACKUP_REMOTE_HOST` | `OFFSITE_HOST_PLACEHOLDER` | 异地 VPS 地址 |
| `OFFSITE_BACKUP_REMOTE_PORT` | `22_PLACEHOLDER_PORT` | 异地 VPS SSH 端口 |
| `OFFSITE_BACKUP_REMOTE_USER` | `backup_user` | 异地备份用户 |
| `OFFSITE_BACKUP_REMOTE_ROOT` | `/srv/animap-backups/animap` | 异地备份根目录 |
| `OFFSITE_BACKUP_SSH_KEY` | `/root/.ssh/animap_offsite_backup_ed25519` | 生产机用于备份的 SSH 私钥 |
| `OFFSITE_PROVISION_REMOTE` | `0` | 设为 `1` 时初始化异地 VPS |
| `OFFSITE_RUN_INITIAL_BACKUP` | `0` | 设为 `1` 时部署后立即跑一次备份 |
| `OFFSITE_INITIAL_UPLOAD_SYNC` | `0` | 初始化备份是否同步 uploads；大目录建议先用 `0` |

## 手动操作命令

只备份数据库、配置和 manifest，不同步 uploads：

```bash
sudo UPLOAD_SYNC_ENABLED=0 /var/www/animap/scripts/offsite_backup.sh
```

同步 uploads、数据库、配置和 manifest：

```bash
sudo UPLOAD_SYNC_ENABLED=1 /var/www/animap/scripts/offsite_backup.sh
```

校验 uploads 是否一致：

```bash
sudo /var/www/animap/scripts/offsite_verify_uploads.sh
```

查看状态日志：

```bash
tail -n 80 /var/www/animap/backups/offsite_backup.log
tail -n 80 /var/www/animap/backups/offsite_verify.log
```

查看后台接口状态：

```bash
curl -H "Authorization: Bearer <admin-token>" https://animap.top/api/settings/offsite-backup
```

## 故障判断

### 校验失败

校验失败通常说明生产 uploads 和异地 VPS uploads 不一致。优先查看：

```bash
cat /var/www/animap/backups/offsite_verify_last.diff
```

如果 diff 里只是新增图片缺失，可以重新跑 uploads 同步。当前生产到异地 VPS 的直连 `rsync` 偶发超时，如果反复失败，可临时使用本机中转补齐缺失文件，再重新校验。

### 备份状态显示 failed

这比一直显示 running 更准确。常见原因是生产机到异地 VPS 的 SSH 链路超时。处理顺序：

1. 检查异地 VPS 是否在线、SSH 端口是否通。
2. 在生产机测试备份用户登录：
   ```bash
   ssh -i /root/.ssh/animap_offsite_backup_ed25519 -p 22_PLACEHOLDER_PORT backup_user@OFFSITE_HOST_PLACEHOLDER 'pwd'
   ```
3. 查看 `/var/www/animap/backups/offsite_backup.log` 最后一条 `ERROR`。
4. 如果只是 uploads 同步超时，数据库和配置可能已经成功上传，后台会显示 warning 或 failed，按日志判断。

## 安全边界

- 不提交 SSH 私钥、VPS 密码、数据库密码、邮箱授权码。
- 不把异地备份用户设为 root。
- 不删除生产数据库和 uploads。
- 部署脚本会在数据库迁移前先创建本地数据库快照。
- `RUN_APP_UPDATE=0` 可以只刷新容灾脚本和 cron，不触碰业务部署。
