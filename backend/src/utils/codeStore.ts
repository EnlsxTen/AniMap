interface StoredCode {
  code: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
}

// 内存存储验证码，key 为邮箱
const codeMap = new Map<string, StoredCode>();

const CODE_EXPIRE_MS = 5 * 60 * 1000; // 5 分钟
const RESEND_INTERVAL_MS = 60 * 1000;  // 60 秒防刷
const MAX_ATTEMPTS = 5;                // 最多尝试 5 次

// 生成 6 位数字验证码
export const generateCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// 检查是否可以发送（60秒内不能重复发）
export const canSendCode = (email: string): boolean => {
  const stored = codeMap.get(email);
  if (!stored) return true;
  return Date.now() - stored.sentAt >= RESEND_INTERVAL_MS;
};

// 获取剩余冷却秒数
export const getCooldownSeconds = (email: string): number => {
  const stored = codeMap.get(email);
  if (!stored) return 0;
  const elapsed = Date.now() - stored.sentAt;
  if (elapsed >= RESEND_INTERVAL_MS) return 0;
  return Math.ceil((RESEND_INTERVAL_MS - elapsed) / 1000);
};

// 存储验证码
export const storeCode = (email: string, code: string): void => {
  codeMap.set(email, {
    code,
    expiresAt: Date.now() + CODE_EXPIRE_MS,
    sentAt: Date.now(),
    attempts: 0,
  });
};

// 验证验证码（验证成功后自动删除，错误超过5次自动失效）
export const verifyCode = (email: string, code: string): boolean => {
  const stored = codeMap.get(email);
  if (!stored) return false;
  if (Date.now() > stored.expiresAt) {
    codeMap.delete(email);
    return false;
  }
  if (stored.attempts >= MAX_ATTEMPTS) {
    codeMap.delete(email);
    return false;
  }
  if (stored.code !== code) {
    stored.attempts += 1;
    return false;
  }
  codeMap.delete(email);
  return true;
};

// 定期清理过期验证码（每 10 分钟）
setInterval(() => {
  const now = Date.now();
  for (const [email, stored] of codeMap.entries()) {
    if (now > stored.expiresAt) {
      codeMap.delete(email);
    }
  }
}, 10 * 60 * 1000);

// ========== 基于 IP 的全局频率限制 ==========

interface IpRecord {
  count: number;
  windowStart: number;
}

const ipMap = new Map<string, IpRecord>();

const IP_WINDOW_MS = 60 * 1000;   // 1 分钟窗口
const IP_MAX_REQUESTS = 5;         // 每分钟最多 5 次

// 检查 IP 是否超过频率限制
export const canSendFromIp = (ip: string): boolean => {
  const record = ipMap.get(ip);
  if (!record) return true;
  if (Date.now() - record.windowStart >= IP_WINDOW_MS) return true;
  return record.count < IP_MAX_REQUESTS;
};

// 记录 IP 发送次数
export const recordIpSend = (ip: string): void => {
  const record = ipMap.get(ip);
  const now = Date.now();
  if (!record || now - record.windowStart >= IP_WINDOW_MS) {
    ipMap.set(ip, { count: 1, windowStart: now });
  } else {
    record.count += 1;
  }
};

// 定期清理 IP 记录（每 5 分钟）
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipMap.entries()) {
    if (now - record.windowStart >= IP_WINDOW_MS) {
      ipMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// ========== 登录失败 IP 封锁 ==========

interface IpBlockRecord {
  failedAttempts: number;
  firstAttemptAt: number;
  blockedUntil: number | null;
}

const ipBlockMap = new Map<string, IpBlockRecord>();

const LOGIN_FAIL_WINDOW_MS = 15 * 60 * 1000;  // 15 分钟窗口
const MAX_LOGIN_FAILURES = 5;                  // 最多 5 次失败
const BLOCK_DURATION_MS = 30 * 60 * 1000;      // 封锁 30 分钟

// 检查 IP 是否被封锁
export const isIpBlocked = (ip: string): boolean => {
  const record = ipBlockMap.get(ip);
  if (!record || !record.blockedUntil) return false;
  
  const now = Date.now();
  if (now >= record.blockedUntil) {
    // 封锁期已过，清除记录
    ipBlockMap.delete(ip);
    return false;
  }
  
  return true;
};

// 获取 IP 剩余封锁时间（秒）
export const getIpBlockRemainingSeconds = (ip: string): number => {
  const record = ipBlockMap.get(ip);
  if (!record || !record.blockedUntil) return 0;
  
  const remaining = Math.ceil((record.blockedUntil - Date.now()) / 1000);
  return Math.max(0, remaining);
};

// 记录登录失败
export const recordLoginFailure = (ip: string): void => {
  const now = Date.now();
  const record = ipBlockMap.get(ip);
  
  if (!record) {
    // 首次失败
    ipBlockMap.set(ip, {
      failedAttempts: 1,
      firstAttemptAt: now,
      blockedUntil: null,
    });
    return;
  }
  
  // 检查是否在同一窗口内
  if (now - record.firstAttemptAt > LOGIN_FAIL_WINDOW_MS) {
    // 窗口已过，重置计数
    record.failedAttempts = 1;
    record.firstAttemptAt = now;
    record.blockedUntil = null;
    return;
  }
  
  // 累加失败次数
  record.failedAttempts += 1;
  
  // 达到阈值，封锁 IP
  if (record.failedAttempts >= MAX_LOGIN_FAILURES) {
    record.blockedUntil = now + BLOCK_DURATION_MS;
  }
};

// 清除 IP 失败记录（登录成功时调用）
export const clearLoginFailures = (ip: string): void => {
  ipBlockMap.delete(ip);
};

// 定期清理过期的封锁记录（每 10 分钟）
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipBlockMap.entries()) {
    if (record.blockedUntil && now >= record.blockedUntil) {
      ipBlockMap.delete(ip);
    }
  }
}, 10 * 60 * 1000);
