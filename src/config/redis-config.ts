import { createClient, RedisClientType, RedisClientOptions, RedisModules, RedisFunctions, RedisScripts } from 'redis';
import { redisConfig, cacheConfig } from '../utils/credentials';

// Default TTL for cache in seconds
export const CACHE_TTL = cacheConfig.cacheTtl;

// Create Redis client
export const createRedisClient = async (): Promise<RedisClientType<RedisModules, RedisFunctions, RedisScripts>> => {
  const client = createClient({
    url: `redis://${redisConfig.username ? `${redisConfig.username}:${redisConfig.password}@` : ''}${redisConfig.host}:${redisConfig.port}`,
    socket: redisConfig.socket
  });

  client.on('error', (err: Error) => {
    console.error('Redis Client Error:', err);
  });

  client.on('connect', () => {
    console.log('Connected to Redis server');
  });

  client.on('reconnecting', () => {
    console.log('Reconnecting to Redis server...');
  });

  try {
    await client.connect();
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    // Return client anyway so the application can start
    // It will try to reconnect automatically
    return client;
  }
};

// Redis client singleton
let redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts> | null = null;

export const getRedisClient = async (): Promise<RedisClientType<RedisModules, RedisFunctions, RedisScripts> | null> => {
  if (!redisClient) {
    redisClient = await createRedisClient();
  }
  return redisClient;
};

// Helper functions for caching
export const getCache = async <T>(key: string): Promise<T | null> => {
  try {
    const client = await getRedisClient();
    if (!client) {
      return null;
    }
    const data = await client.get(key);
    return data ? JSON.parse(data) as T : null;
  } catch (error) {
    console.error(`Error getting cache for key ${key}:`, error);
    return null;
  }
};

export const setCache = async <T>(key: string, value: T, ttl = CACHE_TTL): Promise<void> => {
  try {
    const client = await getRedisClient();
    if (!client) {
      return;
    }
    await client.set(key, JSON.stringify(value), { EX: ttl });
  } catch (error) {
    console.error(`Error setting cache for key ${key}:`, error);
  }
};

export const deleteCache = async (key: string): Promise<void> => {
  try {
    const client = await getRedisClient();
    if (!client) {
      return;
    }
    await client.del(key);
  } catch (error) {
    console.error(`Error deleting cache for key ${key}:`, error);
  }
};

export const clearCache = async (pattern: string): Promise<void> => {
  try {
    const client = await getRedisClient();
    if (!client) {
      return;
    }
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
  } catch (error) {
    console.error(`Error clearing cache for pattern ${pattern}:`, error);
  }
};
