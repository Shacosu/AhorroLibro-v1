import express from 'express';
import { 
  createSubscription, 
  getSubscriptionStatus, 
  cancelSubscription, 
  webhookHandler 
} from '../controllers/subscriptionController';

const router = express.Router();

// Ruta para crear una nueva suscripción
router.post('/', createSubscription);

// Ruta para obtener el estado de una suscripción
router.get('/:subscriptionId', getSubscriptionStatus);

// Ruta para cancelar una suscripción
router.delete('/:subscriptionId', cancelSubscription);

// Webhook para recibir notificaciones de Mercado Pago
router.post('/webhook', webhookHandler);

export default router;