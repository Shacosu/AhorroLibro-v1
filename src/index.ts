import express from 'express';
import userRoutes from './routes/userRoutes';
import bookRoutes from './routes/bookRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';

const app = express();
const port = process.env.PORT || 3000;

// Configurar middleware para parsear JSON con opciones más robustas
app.use(express.json({ 
  limit: '50mb',
  strict: false
}));
app.use(express.urlencoded({ 
  limit: '50mb',
  extended: true
}));

app.use('/api/v1/users', userRoutes);
app.use('/api/v1/books', bookRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);

// Ruta para manejar errores 404
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
