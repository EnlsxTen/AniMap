// 本地开发辅助：内存版 mock SSH/SFTP 服务端。
// 用途：在没有真实异地主机时端到端测试 offsite-backup 插件（部署/备份/校验全链路）。
//
//   node scripts/mock-ssh-server.js            # 默认 127.0.0.1:2222，账号 bak/test123
//   node scripts/mock-ssh-server.js 2223       # 自定义端口
//
// 支持的行为：密码认证、exec 常用命令（uname/df/mkdir touch/chmod/sh receiver/sha256sum/ls）、
// SFTP 上传（OPEN/WRITE/CLOSE），上传内容存内存并可被 sha256sum 读取。

const { Server, utils } = require('ssh2');
const crypto = require('crypto');

const PORT = Number(process.argv[2]) || 2222;
const USERNAME = 'bak';
const PASSWORD = 'test123';

// 远端内存文件系统：path → Buffer
const remoteFiles = new Map();
let handleSeq = 0;
// 打开中的句柄：handleKey → { path, chunks: Buffer[] }
const openHandles = new Map();

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const pathFromCommand = (cmd) => {
  const match = cmd.match(/'([^']+)'/);
  return match ? match[1] : null;
};

const handleExec = (command, stream) => {
  const cmd = command.trim();
  const respond = (stdout, code = 0, stderr = '') => {
    if (stdout) stream.write(stdout);
    if (stderr) stream.stderr.write(stderr);
    stream.exit(code);
    stream.end();
  };

  if (cmd.startsWith('uname')) return respond('Linux animap-test 5.15.0-generic x86_64 GNU/Linux');
  if (cmd.includes('.animap-write-test')) return respond('WRITE_OK');
  if (cmd.startsWith('df -h')) return respond('/dev/sda1       100G   42G   58G  42% /var/backups/animap');
  if (cmd.startsWith('chmod +x')) return respond('');
  if (cmd.startsWith('sh ') && cmd.includes('version')) return respond('animap-backup-receiver v1');
  if (cmd.startsWith('sh ') && cmd.includes('prune')) return respond('pruned');
  if (cmd.startsWith('sha256sum')) {
    const target = pathFromCommand(cmd);
    const file = target && remoteFiles.get(target);
    if (!file) return respond('', 1, `sha256sum: ${target}: No such file or directory`);
    return respond(sha256(file));
  }
  if (cmd.startsWith('ls -1')) {
    const dir = pathFromCommand(cmd) || '/';
    const names = [...remoteFiles.keys()].filter((p) => p.startsWith(dir)).map((p) => p.slice(dir.length + 1));
    return respond(names.filter((n) => n.startsWith('animap-backup-')).length.toString());
  }
  if (cmd.startsWith('ls -lh')) {
    const dir = pathFromCommand(cmd) || '/';
    const lines = [...remoteFiles.entries()]
      .filter(([p]) => p.startsWith(dir))
      .map(([p, buf]) => `-rw-r--r-- 1 bak bak ${(buf.length / 1024).toFixed(0)}K ${p}`);
    return respond(lines.join('\n'));
  }
  return respond('', 1, `mock-ssh: unsupported command: ${cmd}`);
};

const wireSftp = (sftp) => {
  const { STATUS_CODE } = require('ssh2').utils.sftp;
  sftp.on('OPEN', (reqId, filename) => {
    const handle = Buffer.from(`h${handleSeq++}`);
    openHandles.set(handle.toString('utf8'), { path: filename, chunks: [] });
    sftp.handle(reqId, handle);
  });
  sftp.on('WRITE', (reqId, handle, offset, data) => {
    const entry = openHandles.get(handle.toString('utf8'));
    if (!entry) return sftp.status(reqId, STATUS_CODE.FAILURE, 'bad handle');
    entry.chunks.push(Buffer.from(data));
    sftp.status(reqId, STATUS_CODE.OK);
  });
  sftp.on('CLOSE', (reqId, handle) => {
    const key = handle.toString('utf8');
    const entry = openHandles.get(key);
    if (entry) {
      remoteFiles.set(entry.path, Buffer.concat(entry.chunks));
      openHandles.delete(key);
      console.log(`[mock-ssh] sftp 收到文件 ${entry.path}（${Buffer.concat(entry.chunks).length} 字节）`);
    }
    sftp.status(reqId, STATUS_CODE.OK);
  });
  sftp.on('SETSTAT', (reqId) => sftp.status(reqId, STATUS_CODE.OK));
  sftp.on('FSETSTAT', (reqId) => sftp.status(reqId, STATUS_CODE.OK));
  sftp.on('REALPATH', (reqId, requestedPath) => sftp.handle(reqId, Buffer.from(requestedPath)));
};

const server = new Server({ hostKeys: [utils.generateKeyPairSync('ed25519').private.toString('pem')] }, (client) => {
  client.on('authentication', (ctx) => {
    if (ctx.method === 'password' && ctx.username === USERNAME && ctx.password === PASSWORD) return ctx.accept();
    return ctx.reject();
  });
  client.on('ready', () => {
    client.on('session', (accept) => {
      const session = accept();
      session.on('exec', (accept2, reject, info) => handleExec(info.command, accept2()));
      session.on('sftp', (accept2) => wireSftp(accept2()));
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-ssh] 已启动 127.0.0.1:${PORT}（账号 ${USERNAME}/${PASSWORD}，内容存内存）`);
});
