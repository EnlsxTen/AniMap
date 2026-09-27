# AniMap 异地容灾手册

本文说明如何为 AniMap 配置异地容灾备份（基于内置的 **offsite-backup 插件**），以及灾难发生后如何从备份恢复。文档不保存服务器密码、SSH 密码等敏感信息。

## 备份架构

- 生产服务器运行 AniMap 主服务（Ubuntu + PM2 + Nginx + PostgreSQL）。
- 备份主机为任一台可 SSH 登录的 Ubuntu 机器（异地 VPS）。
- 生产服务器上的 **offsite-backup 插件**每日 03:30 自动把数据库与配置打包成
  `animap-backup-YYYYMMDDHHMMSS.tar.gz`，通过 SFTP 推送到备份主机，并按保留天数自动清理过期档案。
- 无需系统 cron、无需在备份主机安装任何 AniMap 组件，推送全部由插件完成。

管理入口：后台 **站点设置 → 插件管理 → 异地备份**。

## 首次配置

### 1. 准备备份主机（异地 Ubuntu VPS）

- 系统建议 Ubuntu 20.04+，已开启 SSH（默认 22 端口，可在插件中改）。
- 创建一个专用低权限账号用于接收备份（不要用 root）：

```bash
sudo adduser backup_user
sudo mkdir -p /srv/animap-backups
sudo chown backup_user:backup_user /srv/animap-backups
```

- 确认磁盘剩余空间足够容纳多份备份（档案体积取决于 uploads 是否包含在内）。

### 2. 在管理页配置并部署

1. 打开后台 **站点设置 → 插件管理 → 异地备份**。
2. 填写：备份主机地址、SSH 端口、用户名、密码、备份存储目录（如 `/srv/animap-backups`）、远端保留天数。
3. 点击 **测试连接并部署**：插件会连接主机、创建备份目录并验证可写、推送备份接收程序并做冒烟测试。
4. 打开 **启用每日自动备份** 并保存，每天 03:30 自动执行；也可随时点 **立即备份**。

### 3. 验证

- 点 **立即备份**：成功后会显示档案名、大小与是否包含数据库（生产机 PATH 中有 `pg_dump` 时自动包含；否则仅有配置文件并给出警告）。
- 点 **立即校验**：比对远端档案与本地 SHA-256 校验和，并列出远端备份清单。
- 备份主机上查看：

```bash
ls -lh /srv/animap-backups/
```

## 恢复流程（灾难演练）

备份档案为标准 `tar.gz`，内容包含：

- `db.dump`：PostgreSQL 自定义格式（`pg_dump -Fc`）导出
- `.env`：后端环境变量（含密钥，注意保管）

在新服务器上恢复：

```bash
# 1. 从备份主机取回最新档案
scp backup_user@<备份主机>:/srv/animap-backups/animap-backup-<时间戳>.tar.gz .

# 2. 解包
tar -xzf animap-backup-<时间戳>.tar.gz

# 3. 恢复数据库（先创建空库）
createdb -h 127.0.0.1 -U postgres animap
pg_restore -h 127.0.0.1 -U postgres -d animap --no-owner db.dump

# 4. 恢复后端 .env（核对数据库连接、JWT_SECRET 等后再启动）
cp .env /var/www/animap/backend/.env

# 5. 按常规部署流程安装依赖、构建前端、启动（见 DEPLOYMENT.md）
```

> [!NOTE]
> 若备份时未包含上传文件（默认不包含，体积原因），恢复后海报图片为空。如需完整容灾，
> 可在插件设置中打开 **备份包含上传文件**，并相应调大保留天数与磁盘预算。

## 日常巡检建议

- 每周登录备份主机确认有新增档案、磁盘占用正常。
- 后台插件卡片关注 **上次备份 / 上次校验** 状态；出现「未含数据库」警告时检查生产机 `pg_dump` 是否可用（不在 PATH 时可通过环境变量 `PG_DUMP_BIN` 指定）。
- 定期做一次恢复演练（见上节），验证备份真正可用。

## 从旧版 cron 方案迁移

早期版本通过 `deploy-with-offsite.sh` + `/etc/cron.d/animap-offsite-backup` + `offsite_backup.sh`（rsync/SSH 私钥）实现异地备份，该方案已由插件取代并从仓库移除：

1. 在生产机删除旧 cron 与脚本：`sudo rm /etc/cron.d/animap-offsite-backup /var/www/animap/scripts/offsite_backup.sh /var/www/animap/scripts/offsite_verify_uploads.sh`。
2. 按上文「首次配置」在管理页配置插件（旧备份主机可直接复用，目录可沿用）。
3. 旧 SSH 私钥（`/root/.ssh/animap_offsite_backup_ed25519`）确认不再使用后删除。

## 安全边界

- 备份主机密码在后台以脱敏方式存储（保存后仅显示掩码），不写入日志、不提交 Git。
- 不要把备份主机账号设为 root；专用账号 + 专用目录即可。
- 恢复出的 `.env` 含生产密钥，演练完成后及时清除。
