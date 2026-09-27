import { createClient } from 'redis';

const isRedisEnabled = /^(1|true|yes)$/i.test(process.env.REDIS_ENABLED || '');
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connectTimeout = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 500);

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connectPromise: Promise<RedisClient | null> | null = null;
let lastErrorLogAt = 0;

export const PUBLIC_CACHE_KEYS = {
  events: 'public:events:v1',
  venues: 'public:venues:v1',
  sessions: 'public:sessions:v1',
} as const;

export const PUBLIC_CACHE_TTL_SECONDS = {
  events: 12 * 60 * 60,
  venues: 12 * 60 * 60,
  sessions: 12 * 60 * 60,
} as const;

const MIN_TIME_BOUNDED_TTL_SECONDS = 1;

export const getTimeBoundedCacheTtlSeconds = <T>(
  items: T[],
  getBoundary: (item: T) => string | Date | null | undefined,
  maxTtlSeconds: number,
): number => {
  const now = Date.now();
  let nearestBoundaryMs = Number.POSITIVE_INFINITY;

  items.forEach((item) => {
    const boundary = getBoundary(item);
    if (!boundary) return;

    const timestamp = new Date(boundary).getTime();
    if (Number.isFinite(timestamp) && timestamp > now && timestamp < nearestBoundaryMs) {
      nearestBoundaryMs = timestamp;
    }
  });

  if (!Number.isFinite(nearestBoundaryMs)) return maxTtlSeconds;

  const secondsUntilBoundary = Math.ceil((nearestBoundaryMs - now) / 1000);
  return Math.max(MIN_TIME_BOUNDED_TTL_SECONDS, Math.min(maxTtlSeconds, secondsUntilBoundary));
};

const logCacheError = (context: string, error: unknown) => {
  const now = Date.now();
  if (now - lastErrorLogAt < 60_000) return;
  lastErrorLogAt = now;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[cache] ${context}: ${message}`);
};

const getRedisClient = async (): Promise<RedisClient | null> => {
  if (!isRedisEnabled) return null;
  if (client?.isOpen) return client;
  if (connectPromise) return connectPromise;

  const redis = client ?? createClient({
    url: redisUrl,
    socket: {
      connectTimeout,
      reconnectStrategy: false,
    },
  });

  if (!client) {
    client = redis;
    redis.on('error', (error) => logCacheError('redis client error', error));
  }

  connectPromise = redis.connect()
    .then(() => redis)
    .catch((error) => {
      logCacheError('redis connect failed', error);
      client = null;
      return null;
    })
    .finally(() => {
      connectPromise = null;
    });

  return connectPromise;
};

export const getCachedJson = async <T>(key: string): Promise<T | null> => {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;

    const cached = await redis.get(key);
    if (!cached) return null;

    return JSON.parse(cached) as T;
  } catch (error) {
    logCacheError(`get ${key} failed`, error);
    return null;
  }
};

export const setCachedJson = async (key: string, value: unknown, ttlSeconds: number): Promise<void> => {
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    await redis.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logCacheError(`set ${key} failed`, error);
  }
};

export const deleteCacheKeys = async (...keys: string[]): Promise<void> => {
  try {
    const redis = await getRedisClient();
    if (!redis || keys.length === 0) return;

    await redis.del(keys);
  } catch (error) {
    logCacheError(`delete ${keys.join(',')} failed`, error);
  }
};

export const invalidatePublicEventsCache = () => deleteCacheKeys(PUBLIC_CACHE_KEYS.events);
export const invalidatePublicVenuesCache = () => deleteCacheKeys(PUBLIC_CACHE_KEYS.venues);
export const invalidatePublicSessionsCache = () => deleteCacheKeys(PUBLIC_CACHE_KEYS.sessions);
export const invalidatePublicVenueRelatedCache = () => deleteCacheKeys(PUBLIC_CACHE_KEYS.venues, PUBLIC_CACHE_KEYS.sessions);

const parseRedisInfo = (info: string) => {
  const data: Record<string, string> = {};
  info.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith('#')) return;
    const index = line.indexOf(':');
    if (index === -1) return;
    data[line.slice(0, index)] = line.slice(index + 1);
  });
  return data;
};

const toNumber = (value: string | undefined) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getPublicCacheStats = async () => {
  if (!isRedisEnabled) {
    return {
      enabled: false,
      connected: false,
      hitRate: null,
      hits: 0,
      misses: 0,
      total: 0,
      expiredKeys: 0,
      evictedKeys: 0,
      memory: null,
      keys: Object.entries(PUBLIC_CACHE_KEYS).map(([name, key]) => ({ name, key, exists: false, ttlSeconds: -2 })),
    };
  }

  try {
    const redis = await getRedisClient();
    if (!redis) {
      return {
        enabled: true,
        connected: false,
        hitRate: null,
        hits: 0,
        misses: 0,
        total: 0,
        expiredKeys: 0,
        evictedKeys: 0,
        memory: null,
        keys: Object.entries(PUBLIC_CACHE_KEYS).map(([name, key]) => ({ name, key, exists: false, ttlSeconds: -2 })),
      };
    }

    const [statsInfo, memoryInfo] = await Promise.all([
      redis.info('stats'),
      redis.info('memory'),
    ]);
    const stats = parseRedisInfo(statsInfo);
    const memory = parseRedisInfo(memoryInfo);
    const hits = toNumber(stats.keyspace_hits);
    const misses = toNumber(stats.keyspace_misses);
    const total = hits + misses;

    const keys = await Promise.all(Object.entries(PUBLIC_CACHE_KEYS).map(async ([name, key]) => {
      const ttlSeconds = await redis.ttl(key);
      return {
        name,
        key,
        exists: ttlSeconds !== -2,
        ttlSeconds,
      };
    }));

    return {
      enabled: true,
      connected: true,
      hitRate: total > 0 ? hits / total : null,
      hits,
      misses,
      total,
      expiredKeys: toNumber(stats.expired_keys),
      evictedKeys: toNumber(stats.evicted_keys),
      memory: {
        used: memory.used_memory_human || null,
        peak: memory.used_memory_peak_human || null,
        max: memory.maxmemory_human || null,
        policy: memory.maxmemory_policy || null,
      },
      keys,
    };
  } catch (error) {
    logCacheError('get cache stats failed', error);
    return {
      enabled: true,
      connected: false,
      hitRate: null,
      hits: 0,
      misses: 0,
      total: 0,
      expiredKeys: 0,
      evictedKeys: 0,
      memory: null,
      keys: Object.entries(PUBLIC_CACHE_KEYS).map(([name, key]) => ({ name, key, exists: false, ttlSeconds: -2 })),
    };
  }
};
