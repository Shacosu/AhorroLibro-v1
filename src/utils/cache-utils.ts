import { getCache, setCache, clearCache, CACHE_TTL } from '../config/redis-config';

// Cache key prefixes
export const CACHE_KEYS = {
  BOOK: 'book:',
  BOOKS_LIST: 'books:list:',
  USER: 'user:',
  SUBSCRIPTION: 'subscription:'
};

/**
 * Generic cache middleware for Express routes
 * @param keyGenerator Function to generate a cache key from the request
 * @param ttl Cache TTL in seconds (optional, defaults to CACHE_TTL)
 */
export const cacheMiddleware = (
  keyGenerator: (req: any) => string,
  ttl: number = CACHE_TTL
) => {
  return async (req: any, res: any, next: any) => {
    try {
      const cacheKey = keyGenerator(req);
      const cachedData = await getCache(cacheKey);

      if (cachedData) {
        // Add cache hit header for debugging
        res.setHeader('X-Cache', 'HIT');
        return res.json(cachedData);
      }

      // Store the original res.json method
      const originalJson = res.json;

      // Override res.json method to cache the response
      res.json = function(data: any) {
        // Cache the data
        setCache(cacheKey, data, ttl).catch(err => 
          console.error(`Error caching data for key ${cacheKey}:`, err)
        );
        
        // Add cache miss header for debugging
        res.setHeader('X-Cache', 'MISS');
        
        // Call the original json method
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      // Continue without caching if there's an error
      next();
    }
  };
};

/**
 * Clear cache when data is modified
 * @param keyPattern Pattern to match cache keys to clear
 */
export const clearCacheMiddleware = (keyPattern: string) => {
  return async (_req: any, _res: any, next: any) => {
    try {
      await clearCache(keyPattern);
      next();
    } catch (error) {
      console.error('Clear cache middleware error:', error);
      // Continue even if cache clearing fails
      next();
    }
  };
};

/**
 * Generate a cache key for a book by ID
 * @param id Book ID
 */
export const getBookCacheKey = (id: number | string): string => {
  return `${CACHE_KEYS.BOOK}${id}`;
};

/**
 * Generate a cache key for a books list with query parameters
 * @param query Query parameters
 */
export const getBooksListCacheKey = (query: Record<string, any>): string => {
  // Sort keys to ensure consistent cache keys regardless of parameter order
  const sortedKeys = Object.keys(query).sort();
  const queryString = sortedKeys
    .map(key => `${key}=${query[key]}`)
    .join('&');
  
  return `${CACHE_KEYS.BOOKS_LIST}${queryString}`;
};

/**
 * Clear all book-related caches
 */
export const clearAllBookCaches = async (): Promise<void> => {
  await clearCache(`${CACHE_KEYS.BOOK}*`);
  await clearCache(`${CACHE_KEYS.BOOKS_LIST}*`);
};

/**
 * Limpia el caché relacionado a un usuario específico (libros, listas, usuario)
 * @param userId ID del usuario
 */
export const clearUserCache = async (userId: number | string): Promise<void> => {
  // Borra caché de usuario, libros y listas asociadas a ese usuario
  await clearCache(`${CACHE_KEYS.USER}${userId}`);
  await clearCache(`${CACHE_KEYS.BOOKS_LIST}*userId=${userId}*`); // Si usas userId en query
};
