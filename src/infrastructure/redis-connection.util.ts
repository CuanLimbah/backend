import type { RedisOptions } from 'ioredis';

function fromRedisUrl(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username || 'default'),
    password: decodeURIComponent(url.password),
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

function fromUpstashRestCredentials(restUrl: string, restToken: string): RedisOptions {
  const url = new URL(restUrl);

  return {
    host: url.hostname,
    port: 6379,
    username: 'default',
    password: restToken,
    tls: {},
    maxRetriesPerRequest: null,
  };
}

export function buildRedisConnectionOptions(): RedisOptions {
  const upstashRedisUrl =
    process.env.UPSTASH_REDIS_URL?.trim() || process.env.REDIS_URL?.trim();

  if (upstashRedisUrl) {
    return fromRedisUrl(upstashRedisUrl);
  }

  const upstashRestUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashRestToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (upstashRestUrl && upstashRestToken) {
    return fromUpstashRestCredentials(upstashRestUrl, upstashRestToken);
  }

  const upstashHost = process.env.UPSTASH_REDIS_HOST?.trim();
  const upstashPassword = process.env.UPSTASH_REDIS_PASSWORD?.trim();

  if (upstashHost && upstashPassword) {
    return {
      host: upstashHost,
      port: Number(process.env.UPSTASH_REDIS_PORT?.trim() || 6379),
      username: process.env.UPSTASH_REDIS_USERNAME?.trim() || 'default',
      password: upstashPassword,
      tls: {},
      maxRetriesPerRequest: null,
    };
  }

  throw new Error(
    'Upstash Redis belum dikonfigurasi. Isi UPSTASH_REDIS_URL, UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, atau UPSTASH_REDIS_HOST + UPSTASH_REDIS_PASSWORD.',
  );
}
