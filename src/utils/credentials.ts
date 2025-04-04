// Importamos las variables de entorno
import dotenv from 'dotenv';
dotenv.config();

// Definimos la interfaz para las credenciales
interface Credentials {
  emailUser: string;
  emailPassword: string;
  mercadoPagoAccessToken: string;
}

// Exportamos las credenciales
export const credentials: Credentials = {
  emailUser: process.env.EMAIL_USER || '',
  emailPassword: process.env.EMAIL_PASSWORD || '',
  mercadoPagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
};

export const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  username: process.env.REDIS_USERNAME || undefined,
  socket: {
    tls: process.env.REDIS_TLS_ENABLED === 'true',
    reconnectStrategy: (retries: number) => Math.min(retries * 50, 1000)
  }
};

export const cacheConfig = {
  cacheTtl: parseInt(process.env.REDIS_CACHE_TTL || '3600', 10)
};
