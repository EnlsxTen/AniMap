import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Client, type SFTPWrapper } from 'ssh2';
import type {
  AnimapPlugin,
  PluginContext,
  PluginManifest,
  PluginRunResult,
  PluginStatus,
} from '../types';

// ==========================================================================
// 异地备份插件 v2
//
// 在管理页配置备份主机的 SSH 地址 / 端口 / 账号密码，「测试连接并部署」成功后
// 自动把备份接收程序推送到远端；此后每日 03:30 自动把数据库与配置打包
// （tar.gz）经 SFTP 推送到远端并按保留天数清理旧备份，无需依赖系统 cron。
// ==========================================================================

const manifest: PluginManifest = {
  id: 'offsite-backup',
  name: '异地备份',
  description: '配置备份主机的 SSH 地址、端口与账号密码，测试连通后自动部署备份接收程序；每日定时将数据库与配置打包推送到远端并自动清理过期备份。',
  version: '2.0.0',
  scheduleHint: '开启并部署后，每天 03:30 自动备份并推送远端',
  settings: [
    { key: 'enabled', label: '启用每日自动备份', type: 'boolean', default: false },
    { key: 'host', label: '备份主机地址', type: 'string', placeholder: '192.168.1.100 或 backup.example.com', helpText: '可通过 SSH 访问的异地主机' },
    { key: 'port', label: 'SSH 端口', type: 'number', default: 22 },
    { key: 'username', label: '用户名', type: 'string', placeholder: 'root' },
    { key: 'password', label: '密码', type: 'secret', helpText: '保存后仅显示脱敏值；清空输入框 = 保留原值，点"清除"删除' },
    { key: 'remoteDir', label: '备份存储目录', type: 'string', default: '/var/backups/animap', placeholder: '/var/backups/animap', helpText: '远端主机上的绝对路径，不存在会自动创建' },
    { key: 'retentionDays', label: '远端保留天数', type: 'number', default: 14, helpText: '超过天数的旧备份会在每次备份完成后自动清理' },
    { key: 'includeUploads', label: '备份包含上传文件', type: 'boolean', default: false, helpText: '海报等上传文件体积大，开启后每日备份耗时与流量明显增加' },
  ],
  runActions: [
    { id: 'deploy', label: '测试连接并部署' },
    { id: 'backup', label: '立即备份' },
    { id: 'verify', label: '立即校验' },
  ],
};

/** 部署到远端的接收程序：保留天数清理等远端侧操作统一走它 */
const RECEIVER_SCRIPT = `#!/bin/sh
# AniMap 异地备份接收程序（由插件自动部署，勿手工改动）
case "$1" in
  version)
    echo "animap-backup-receiver v1" ;;
  prune)
    dir="$2"; days="$3"
    find "$dir" -maxdepth 1 -name 'animap-backup-*.tar.gz' -type f -mtime +"$days" -delete 2>/dev/null
    echo "pruned" ;;
  *)
    echo "unknown command: $1"; exit 1 ;;
esac
`;

const RECEIVER_NAME = 'animap-backup-receiver.sh';
const ARCHIVE_PREFIX = 'animap-backup-';
const DAILY_HOUR = 3;
const DAILY_MINUTE = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 远端 shell 参数安全引号 */
const shq = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

type SshConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  remoteDir: string;
  retentionDays: number;
  includeUploads: boolean;
};

type ExecResult = { code: number | null; stdout: string; stderr: string };

class SshError extends Error {}

const createOffsiteBackupPlugin = (): AnimapPlugin => {
  let ctx: PluginContext;
  let busy = false;
  let dailyTimer: NodeJS.Timeout | null = null;
  let dailyInterval: NodeJS.Timeout | null = null;

  const getBackupDir = () => process.env.OFFSITE_BACKUP_LOCAL_DIR || path.join(ctx.paths.projectRoot, 'backups');

  const pathExists = async (target: string) => {
    try {
      await fsp.access(target);
      return true;
    } catch {
      return false;
    }
  };

  const loadConfig = async (): Promise<SshConfig> => {
    const [host, port, username, password, remoteDir, retentionDays, includeUploads] = await Promise.all([
      ctx.settings.get<string>('host'),
      ctx.settings.get<number>('port'),
      ctx.settings.get<string>('username'),
      ctx.settings.getRaw('password'),
      ctx.settings.get<string>('remoteDir'),
      ctx.settings.get<number>('retentionDays'),
      ctx.settings.get<boolean>('includeUploads'),
    ]);
    if (!host || !username || !password) {
      throw new SshError('请先在上方填写备份主机地址、SSH 端口、用户名和密码并保存');
    }
    return {
      host,
      port: port || 22,
      username,
      password,
      remoteDir: remoteDir || '/var/backups/animap',
      retentionDays: retentionDays && retentionDays > 0 ? retentionDays : 14,
      includeUploads: includeUploads === true,
    };
  };

  /** 建立 SSH 连接（密码认证），把常见网络/认证错误翻译成可读提示 */
  const connectSsh = (config: SshConfig): Promise<Client> =>
    new Promise((resolve, reject) => {
      const client = new Client();
      let settled = false;
      const finish = (err: Error | null, session?: Client) => {
        if (settled) return;
        settled = true;
        if (err) {
          const message = err.message || '';
          if (/authentication/i.test(message) || /all configured authentication methods failed/i.test(message)) {
            reject(new SshError(`SSH 认证失败：请检查用户名和密码（${message}）`));
          } else if (/ECONNREFUSED/.test(message)) {
            reject(new SshError(`连接被拒绝：${config.host}:${config.port} 端口未开放或 SSH 服务未启动`));
          } else if (/ENOTFOUND|getaddrinfo/i.test(message)) {
            reject(new SshError(`主机地址无法解析：${config.host}`));
          } else if (/ETIMEDOUT|timed out/i.test(message)) {
            reject(new SshError(`连接超时：${config.host}:${config.port}（检查地址、端口与防火墙）`));
          } else {
            reject(new SshError(`SSH 连接失败：${message}`));
          }
          try { client.end(); } catch { /* 未完成握手时 end 可能抛错 */ }
        } else {
          resolve(session as Client);
        }
      };
      client.on('ready', () => finish(null, client));
      client.on('error', (err) => finish(err));
      client.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        readyTimeout: 15000,
        keepaliveInterval: 10000,
      });
    });

  const execCmd = (client: Client, command: string, timeoutMs = 20000): Promise<ExecResult> =>
    new Promise((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) return reject(err);
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
          stream.close();
          reject(new SshError(`远端命令超时（${timeoutMs}ms）：${command.slice(0, 60)}`));
        }, timeoutMs);
        stream.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
        stream.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
        stream.on('close', (code: number | null) => {
          clearTimeout(timer);
          resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
        });
      });
    });

  const sftpUpload = (client: Client, localPath: string, remotePath: string): Promise<void> =>
    new Promise((resolve, reject) => {
      client.sftp((err, sftp: SFTPWrapper) => {
        if (err) return reject(err);
        sftp.fastPut(localPath, remotePath, (putErr) => {
          sftp.end();
          return putErr ? reject(putErr) : resolve();
        });
      });
    });

  const resolvePgDump = (): string | null => {
    const name = 'pg_dump';
    const embeddedRoots = [
      path.join(ctx.paths.projectRoot, 'node_modules', '@embedded-postgres'),
      path.join(ctx.paths.projectRoot, 'backend', 'node_modules', '@embedded-postgres'),
    ].filter((root) => { try { return fs.statSync(root).isDirectory(); } catch { return false; } });
    for (const root of embeddedRoots) {
      try {
        for (const flavor of fs.readdirSync(root)) {
          const candidate = path.join(root, flavor, 'native', 'bin', name);
          if (fs.existsSync(candidate)) return candidate;
        }
      } catch { /* 目录不可读时跳过 */ }
    }
    if (process.env.PG_DUMP_BIN && fs.existsSync(process.env.PG_DUMP_BIN)) return process.env.PG_DUMP_BIN;
    return 'pg_dump'; // 交给 PATH 兜底；找不到时 execFile 会报错并降级为仅配置备份
  };

  const runNode = (command: string, args: string[], env: NodeJS.ProcessEnv = {}, timeoutMs = 20 * 60 * 1000, cwd?: string): Promise<{ code: number | null; stdout: string; stderr: string }> =>
    new Promise((resolve, reject) => {
      execFile(command, args, { env: { ...process.env, ...env }, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, cwd }, (err, stdout, stderr) => {
        if (err && typeof (err as NodeJS.ErrnoException).code !== 'string') {
          // 非 spawn 失败（退出码非零）也带 stdout/stderr 返回，由调用方决定语义
          resolve({ code: (err as { code?: number }).code ?? 1, stdout: String(stdout), stderr: String(stderr) });
          return;
        }
        if (err) return reject(err);
        resolve({ code: 0, stdout: String(stdout), stderr: String(stderr) });
      });
    });

  /** 内部部署流程：调用方负责 busy 守卫与连接清理 */
  const deployInternal = async (client: Client, config: SshConfig): Promise<string> => {
    const dir = shq(config.remoteDir);
    const uname = await execCmd(client, `uname -a 2>/dev/null || echo unknown-host`, 15000).then(r => r.stdout || 'unknown-host').catch(() => 'unknown-host');
    const mkdir = await execCmd(client, `mkdir -p ${dir} && touch ${dir}/.animap-write-test && rm ${dir}/.animap-write-test && echo WRITE_OK`);
    if (!mkdir.stdout.includes('WRITE_OK')) {
      throw new SshError(`备份目录不可写：${config.remoteDir}（${mkdir.stderr || 'mkdir/touch 失败'}）`);
    }
    const disk = await execCmd(client, `df -h ${dir} 2>/dev/null | tail -1`).then(r => r.stdout).catch(() => '');

    // 推送接收程序并做冒烟测试
    const localScript = path.join(getBackupDir(), RECEIVER_NAME);
    await fsp.mkdir(path.dirname(localScript), { recursive: true });
    await fsp.writeFile(localScript, RECEIVER_SCRIPT, 'utf8');
    const remoteScript = `${config.remoteDir}/${RECEIVER_NAME}`;
    await sftpUpload(client, localScript, remoteScript);
    await execCmd(client, `chmod +x ${shq(remoteScript)}`);
    const smoke = await execCmd(client, `sh ${shq(remoteScript)} version`);
    if (!smoke.stdout.includes('animap-backup-receiver')) {
      throw new SshError(`接收程序部署后冒烟测试失败：${smoke.stderr || smoke.stdout || '无输出'}`);
    }

    const now = new Date().toISOString();
    await ctx.settings.setMany({
      deployed: 'true',
      lastDeployAt: now,
      lastDeployInfo: `${uname}${disk ? ` | ${disk}` : ''}`,
    });
    ctx.logger.info(`已部署异地备份接收程序到 ${config.host}:${config.port}${config.remoteDir}`);
    return `部署成功：${config.host}:${config.port} → ${config.remoteDir}（${uname.split(' ').slice(0, 3).join(' ')}${disk ? `，磁盘 ${disk.split(/\s+/).slice(-2).join(' ')}` : ''}）`;
  };

  /** 内部备份流程：调用方负责 busy 守卫；连接失败会抛 SshError */
  const backupInternal = async (client: Client, config: SshConfig): Promise<string> => {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').replace(/\..*/, '').slice(0, 14); // YYYYMMDDHHMMSS
    const archiveName = `${ARCHIVE_PREFIX}${stamp}.tar.gz`;
    const staging = path.join(getBackupDir(), 'staging');
    await fsp.mkdir(staging, { recursive: true });

    // 1) 数据库导出（pg_dump 缺失时降级为仅配置备份并在结果中警告）
    let dbIncluded = false;
    let dbWarning = '';
    const dbName = process.env.DB_NAME || 'animap';
    const pgDump = resolvePgDump();
    const dumpPath = path.join(staging, 'db.dump');
    try {
      const result = await runNode(
        pgDump as string,
        ['--host', process.env.DB_HOST || '127.0.0.1', '--port', process.env.DB_PORT || '5432', '--username', process.env.DB_USER || 'postgres', '--no-password', '--format', 'custom', '--file', dumpPath, dbName],
        { PGPASSWORD: process.env.DB_PASSWORD || '' },
        15 * 60 * 1000,
      );
      if (result.code === 0 && (await pathExists(dumpPath))) {
        dbIncluded = true;
      } else {
        dbWarning = (result.stderr || 'pg_dump 退出异常').split(/\r?\n/).filter(Boolean).slice(-2).join(' ');
      }
    } catch (err) {
      dbWarning = err instanceof Error ? err.message : String(err);
      ctx.logger.warn(`pg_dump 执行失败，本次备份不包含数据库：${dbWarning}`);
    }

    // 2) 打包：db.dump + backend/.env（可选 uploads）
    //    以 staging 为工作目录、归档用相对文件名，保持归档内路径干净
    const archivePath = path.join(staging, archiveName);
    const envPath = await (async () => {
      const candidate = path.join(ctx.paths.projectRoot, 'backend', '.env');
      return (await pathExists(candidate)) ? candidate : path.join(ctx.paths.projectRoot, '.env');
    })();
    const tarArgs: string[] = ['-czf', archiveName];
    if (dbIncluded) tarArgs.push('db.dump');
    if (await pathExists(envPath)) tarArgs.push('-C', path.dirname(envPath), path.basename(envPath));
    if (config.includeUploads) {
      tarArgs.push('-C', path.dirname(ctx.paths.uploadDir), path.basename(ctx.paths.uploadDir));
    }
    const tarResult = await runNode('tar', tarArgs, {}, 30 * 60 * 1000, staging);
    if (tarResult.code !== 0) {
      throw new SshError(`打包失败：tar ${tarResult.stderr || '退出码 ' + tarResult.code}`);
    }
    const stat = await fsp.stat(archivePath);

    // 3) 推送远端 + 校验和 + 按保留天数清理
    const remotePath = `${config.remoteDir}/${archiveName}`;
    await sftpUpload(client, archivePath, remotePath);
    const hash = crypto.createHash('sha256').update(await fsp.readFile(archivePath)).digest('hex');
    const remoteHash = await execCmd(client, `sha256sum ${shq(remotePath)} 2>/dev/null | cut -d' ' -f1`, 60000);
    const checksumMatched = remoteHash.stdout.length === 64 && remoteHash.stdout === hash;
    await execCmd(client, `sh ${shq(`${config.remoteDir}/${RECEIVER_NAME}`)} prune ${shq(config.remoteDir)} ${config.retentionDays}`);
    const remaining = await execCmd(client, `ls -1 ${shq(config.remoteDir)} | grep -c '^${ARCHIVE_PREFIX}' || true`);

    // 4) 记录状态并清理暂存
    await fsp.writeFile(
      path.join(getBackupDir(), 'last_backup_meta.json'),
      JSON.stringify({ name: archiveName, size: stat.size, sha256: hash, at: new Date().toISOString(), dbIncluded, includeUploads: config.includeUploads, checksumMatched }, null, 2),
      'utf8',
    );
    await fsp.rm(dumpPath, { force: true });
    await fsp.rm(archivePath, { force: true });

    const sizeLabel = stat.size >= 100 * 1024 ? `${(stat.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(stat.size / 1024))} KB`;
    const now = new Date().toISOString();
    await ctx.settings.setMany({
      lastBackupAt: now,
      lastBackupInfo: `${archiveName}（${sizeLabel}${dbIncluded ? '，含数据库' : '，未含数据库'}${config.includeUploads ? '，含上传文件' : ''}）`,
      lastArchiveName: archiveName,
      lastChecksum: hash,
      lastVerifyInfo: checksumMatched ? `上传校验和一致（远端共 ${remaining.stdout || '?'} 份备份）` : '上传校验和不一致，建议立即校验',
    });
    if (!dbIncluded) ctx.logger.warn(`异地备份未包含数据库：${dbWarning}`);
    return `备份完成并已推送：${archiveName}（${sizeLabel}${dbIncluded ? '，含数据库' : '，⚠ 未含数据库（未找到 pg_dump）'}）${checksumMatched ? '' : '，⚠ 上传校验和不一致'}`;
  };

  /** 下一个 03:30 的毫秒数 */
  const msUntilNextDaily = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(DAILY_HOUR, DAILY_MINUTE, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  };

  const armSchedule = async () => {
    if (dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
    if (dailyInterval) { clearInterval(dailyInterval); dailyInterval = null; }
    const [enabled, deployed, host, username, password] = await Promise.all([
      ctx.settings.get<boolean>('enabled'),
      ctx.settings.get<boolean>('deployed'),
      ctx.settings.get<string>('host'),
      ctx.settings.get<string>('username'),
      ctx.settings.getRaw('password'),
    ]);
    if (!enabled || deployed !== true || !host || !username || !password) return;
    dailyTimer = setTimeout(() => {
      void (async () => {
        try {
          const config = await loadConfig();
          const client = await connectSsh(config);
          try {
            await backupInternal(client, config);
          } finally {
            client.end();
          }
        } catch (err) {
          ctx.logger.error('每日异地备份失败', err);
          await ctx.settings.setMany({
            lastBackupAt: new Date().toISOString(),
            lastBackupInfo: `定时备份失败：${err instanceof Error ? err.message : String(err)}`,
          }).catch(() => undefined);
        }
        armSchedule().catch(() => undefined);
      })();
    }, msUntilNextDaily());
    dailyInterval = setInterval(() => armSchedule().catch(() => undefined), DAY_MS) as unknown as NodeJS.Timeout;
    ctx.logger.info(`[offsite-backup] 已开启每日自动备份，将在 ${Math.round(msUntilNextDaily() / 60000)} 分钟后运行`);
  };

  /** 串行守卫：deploy/backup/verify 互斥，运行中直接拒绝；复用同一个 SSH 连接执行任务 */
  const withBusy = async (label: string, task: (client: Client, config: SshConfig) => Promise<string>): Promise<PluginRunResult> => {
    if (busy) return { started: false, running: true, message: `${label}正在运行，请稍后再试` };
    busy = true;
    let client: Client | null = null;
    try {
      const config = await loadConfig();
      client = await connectSsh(config);
      const message = await task(client, config);
      return { started: true, running: false, message };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.logger.error(`[offsite-backup] ${label}失败`, err);
      return { started: false, running: false, message };
    } finally {
      if (client) { try { client.end(); } catch { /* 已关闭 */ } }
      busy = false;
    }
  };

  return {
    manifest,

    setup(context) {
      ctx = context;
    },

    start() {
      void armSchedule().catch((err) => ctx.logger.error('[offsite-backup] 调度启动失败', err));
    },

    stop() {
      if (dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
      if (dailyInterval) { clearInterval(dailyInterval); dailyInterval = null; }
    },

    onSettingsSaved() {
      // 启用/关闭自动备份或改配置后立即重载调度，无需等服务重启
      return armSchedule();
    },

    async status(): Promise<PluginStatus> {
      const [host, port, username, deployed, lastDeployAt, lastDeployInfo, lastBackupAt, lastBackupInfo, lastVerifyAt, lastVerifyInfo] = await Promise.all([
        ctx.settings.get<string>('host'),
        ctx.settings.get<number>('port'),
        ctx.settings.get<string>('username'),
        ctx.settings.get<boolean>('deployed'),
        ctx.settings.getRaw('lastDeployAt'),
        ctx.settings.getRaw('lastDeployInfo'),
        ctx.settings.getRaw('lastBackupAt'),
        ctx.settings.getRaw('lastBackupInfo'),
        ctx.settings.getRaw('lastVerifyAt'),
        ctx.settings.getRaw('lastVerifyInfo'),
      ]);
      const fmt = (iso: string | null) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false });
      };
      const backupWarned = (lastBackupInfo || '').includes('⚠');
      return {
        running: busy,
        fields: [
          { label: '连接配置', value: host ? `${host}:${port || 22}（${username || '?'}）` : '未配置', tone: host ? 'normal' : 'warning' },
          { label: '部署状态', value: deployed === true ? '已部署接收程序' : '未部署', tone: deployed === true ? 'success' : 'warning' },
          { label: '上次部署', value: lastDeployAt ? fmt(lastDeployAt) : '—', tone: deployed === true ? 'success' : 'normal' },
          { label: '上次备份', value: lastBackupInfo || '—', tone: lastBackupInfo ? (backupWarned ? 'warning' : 'success') : 'normal' },
          { label: '上次校验', value: lastVerifyInfo || '—', tone: lastVerifyInfo ? (lastVerifyInfo.includes('不一致') ? 'danger' : 'success') : 'normal' },
        ],
        detail: lastDeployInfo || undefined,
      };
    },

    async run(action: string): Promise<PluginRunResult> {
      if (action === 'deploy') {
        return withBusy('部署', async (client, config) => {
          const message = await deployInternal(client, config);
          await armSchedule();
          return message;
        });
      }
      if (action === 'backup') {
        return withBusy('备份', async (client, config) => {
          const deployed = await ctx.settings.get<boolean>('deployed');
          let deployNote = '';
          if (deployed !== true) {
            await deployInternal(client, config);
            deployNote = '（首次运行已自动部署接收程序）';
          }
          const message = await backupInternal(client, config);
          await armSchedule();
          return message + deployNote;
        });
      }
      if (action === 'verify') {
        return withBusy('校验', async (client, config) => {
          const lastArchiveName = await ctx.settings.get<string>('lastArchiveName');
          const lastChecksum = await ctx.settings.getRaw('lastChecksum');
          if (!lastArchiveName || !lastChecksum) {
            throw new SshError('还没有可校验的备份记录，请先执行「立即备份」');
          }
          const remotePath = `${config.remoteDir}/${lastArchiveName}`;
          const remoteHash = await execCmd(client, `sha256sum ${shq(remotePath)} 2>/dev/null | cut -d' ' -f1`, 60000);
          const listing = await execCmd(client, `ls -lh ${shq(config.remoteDir)} 2>/dev/null | tail -8`, 15000).then(r => r.stdout).catch(() => '');
          const matched = remoteHash.stdout.length === 64 && remoteHash.stdout === lastChecksum;
          const now = new Date().toISOString();
          await ctx.settings.setMany({
            lastVerifyAt: now,
            lastVerifyInfo: matched ? `校验通过：${lastArchiveName} 与远端一致` : `校验不一致：远端文件与本地校验和不符`,
          });
          ctx.logger.info(`[offsite-backup] 校验${matched ? '通过' : '不一致'}：${lastArchiveName}`);
          return matched ? `校验通过：远端 ${lastArchiveName} 与本地校验和一致${listing ? `\n${listing}` : ''}` : `校验不一致：远端 ${lastArchiveName} 与本地校验和不符，可能传输损坏或被改动`;
        });
      }
      return { started: false, running: false, message: `未知动作：${action}` };
    },
  };
};

export default createOffsiteBackupPlugin;
