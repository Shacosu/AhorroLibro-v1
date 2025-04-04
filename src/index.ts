import express from 'express';
import cookieParser from 'cookie-parser';
import userRoutes from './routes/userRoutes';
import bookRoutes from './routes/bookRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import { initCronJobs } from './utils/cronJobs';
import cors from 'cors';
import { getRedisClient } from './config/redis-config';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Redis
const initRedis = async () => {
  try {
    await getRedisClient();
    console.log('Redis initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Redis:', error);
    console.warn('Application will continue without Redis caching');
  }
};

// Configurar middleware para parsear JSON con opciones más robustas
app.use(express.json({ 
  limit: '50mb',
  strict: false
}));
app.use(express.urlencoded({ 
  limit: '50mb',
  extended: true
}));
app.use(cookieParser());
app.use(cors({
  origin: [
    'http://localhost:3001', 
    'https://ahorrolibro.cl',
  ],
  credentials: true
}));

app.use('/api/v1/users', userRoutes);
app.use('/api/v1/books', bookRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);

// Ruta para manejar errores 404
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(port, async () => {
  console.log(`Server is running at http://localhost:${port}`);
  
  // Initialize Redis
  await initRedis();
  
  if (process.env.NODE_ENV === 'production') {
    // Initialize cron jobs after server starts
    const baseUrl = `http://localhost:${port}`;
    initCronJobs(baseUrl);
  }
});
