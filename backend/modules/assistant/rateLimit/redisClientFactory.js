const redis = require('redis');
const { AssistantConfigurationError } = require('../config/assistant.config');

/**
 * Creates a configured Redis client instance for distributed rate limiting.
 * Returns null if rate limiting is configured for in-memory mode.
 * Never logs credentials or exposes raw Redis URLs.
 */
const createAssistantRedisClient = (config, {
  createClient = redis.createClient,
  logger
} = {}) => {
  if (config?.rateLimit?.store !== 'redis') {
    return null;
  }

  const redisUrl = config?.rateLimit?.redis?.url;
  if (!redisUrl) {
    throw new AssistantConfigurationError(
      'AI_RATE_LIMIT_REDIS_URL',
      'Redis store configured but no Redis URL provided'
    );
  }

  const client = createClient({
    url: redisUrl
  });

  if (typeof client.on === 'function') {
    client.on('error', (err) => {
      if (logger && typeof logger.warn === 'function') {
        logger.warn('Assistant Redis client event error', {
          reasonCode: 'ASSISTANT_REDIS_CLIENT_ERROR'
        });
      }
    });
  }

  return client;
};

/**
 * Connects the Redis client if not already connected.
 * Throws and logs sanitized reason code if connection fails.
 */
const connectAssistantRedisClient = async (client, {
  logger
} = {}) => {
  if (!client) return null;
  if (client.isOpen) return client;

  try {
    if (typeof client.connect === 'function') {
      await client.connect();
    }
    if (logger && typeof logger.info === 'function') {
      logger.info('Assistant Redis client connected', {
        reasonCode: 'ASSISTANT_REDIS_CONNECTED'
      });
    }
    return client;
  } catch (error) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Assistant Redis client failed to connect', {
        reasonCode: 'ASSISTANT_REDIS_CONNECT_FAILED'
      });
    }
    throw error;
  }
};

/**
 * Gracefully disconnects the Redis client during server shutdown.
 */
const closeAssistantRedisClient = async (client, {
  logger
} = {}) => {
  if (!client) return;

  try {
    if (typeof client.quit === 'function' && client.isOpen) {
      await client.quit();
    } else if (typeof client.disconnect === 'function') {
      await client.disconnect();
    }
    if (logger && typeof logger.info === 'function') {
      logger.info('Assistant Redis client closed cleanly', {
        reasonCode: 'ASSISTANT_REDIS_CLOSED'
      });
    }
  } catch (error) {
    if (typeof client.disconnect === 'function') {
      try {
        await client.disconnect();
      } catch {
        // Fallback disconnect
      }
    }
    if (logger && typeof logger.warn === 'function') {
      logger.warn('Assistant Redis client close encountered an error', {
        reasonCode: 'ASSISTANT_REDIS_CLOSE_FAILED'
      });
    }
  }
};

/**
 * Bounded ping check for readiness probes.
 */
const pingAssistantRedisClient = async (client) => {
  if (!client || !client.isOpen) {
    return false;
  }
  if (typeof client.ping === 'function') {
    const pong = await client.ping();
    return pong === 'PONG' || pong === true;
  }
  return true;
};

module.exports = {
  createAssistantRedisClient,
  connectAssistantRedisClient,
  closeAssistantRedisClient,
  pingAssistantRedisClient
};
