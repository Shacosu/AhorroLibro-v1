import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as mercadoPagoService from '../services/mercadoPagoService';
import Bottleneck from 'bottleneck';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

// Configurar limitador para las solicitudes a Mercado Pago
const limiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 200
});

/**
 * Crea una nueva suscripción para un usuario
 * @param req Request
 * @param res Response
 */
export const createSubscription = async (req: Request, res: Response): Promise<void> => {
  if (!req.body) {
    res.status(400).json({ error: 'Cuerpo de la solicitud vacío o inválido' });
    return;
  }
  try {
    const { userId, countryCode = 'CL', currency = 'CLP' } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'Se requiere el ID del usuario' });
      return;
    }

    console.log(`Iniciando creación de suscripción para usuario ${userId} con país ${countryCode} y moneda ${currency}`);

    // Usar el limitador para la llamada a Mercado Pago
    const subscription = await limiter.schedule(() => 
      mercadoPagoService.createUserSubscription(Number(userId), countryCode, currency)
    );

    console.log(`Suscripción creada exitosamente: ${subscription.subscriptionId}`);

    res.status(201).json({
      message: 'Suscripción creada exitosamente',
      data: {
        subscriptionId: subscription.subscriptionId,
        paymentLink: subscription.paymentLink,
        status: subscription.status
      }
    });
  } catch (error: any) {
    console.error('Error al crear suscripción para usuario:', error);
    
    // Determinar el código de estado y mensaje apropiados
    let statusCode = 400;
    let errorMessage = error.message || 'Error al crear suscripción';
    
    if (error.message.includes('Cannot operate between different countries')) {
      errorMessage = 'No se puede operar entre diferentes países. Por favor, contacta al soporte.';
    } else if (error.message.includes('ya tiene una suscripción activa')) {
      statusCode = 409; // Conflict
    } else if (error.message.includes('no encontrado')) {
      statusCode = 404; // Not Found
    } else if (error.status === 500 || !error.status) {
      statusCode = 500; // Internal Server Error para errores del servidor
    }
    
    res.status(statusCode).json({ error: errorMessage });
  }
};

/**
 * Obtiene el estado de una suscripción
 * @param req Request
 * @param res Response
 */
export const getSubscriptionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subscriptionId } = req.params;

    if (!subscriptionId) {
      res.status(400).json({ error: 'Se requiere el ID de la suscripción' });
      return;
    }

    // Usar el limitador para la llamada a Mercado Pago
    const subscription = await limiter.schedule(() => 
      mercadoPagoService.checkSubscriptionStatus(subscriptionId)
    );

    res.status(200).json({
      message: 'Estado de suscripción obtenido exitosamente',
      data: subscription
    });
  } catch (error: any) {
    console.error('Error al obtener estado de suscripción:', error);
    res.status(500).json({ error: error.message || 'Error al obtener estado de suscripción' });
  }
};

/**
 * Cancela una suscripción
 * @param req Request
 * @param res Response
 */
export const cancelSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subscriptionId } = req.params;

    if (!subscriptionId) {
      res.status(400).json({ error: 'Se requiere el ID de la suscripción' });
      return;
    }

    // Usar el limitador para la llamada a Mercado Pago
    const subscription = await limiter.schedule(() => 
      mercadoPagoService.cancelSubscription(subscriptionId)
    );

    res.status(200).json({
      message: 'Suscripción cancelada exitosamente',
      data: subscription
    });
  } catch (error: any) {
    console.error('Error al cancelar suscripción:', error);
    res.status(500).json({ error: error.message || 'Error al cancelar suscripción' });
  }
};

/**
 * Webhook para recibir notificaciones de Mercado Pago
 * @param req Request
 * @param res Response
 */
export const webhookHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { action, data } = req.body;

    // Verificar que la notificación sea válida
    if (!action || !data) {
      res.status(400).json({ error: 'Notificación inválida' });
      return;
    }

    console.log('Notificación de Mercado Pago recibida:', { action, data });

    // Procesar según el tipo de notificación
    if (action === 'updated') {
      // Obtener detalles de la suscripción
      const subscriptionId = data.id;
      
      // Usar el limitador para la llamada a Mercado Pago
      const subscriptionDetails = await limiter.schedule(() => 
        mercadoPagoService.checkSubscriptionStatus(subscriptionId)
      );

      // Actualizar en la base de datos (esto fallará si no se ha aplicado la migración)
      try {
        // Buscar usuario por external_reference
        const subscription = await prisma.subscription.findFirst({
          where: {
            externalReference: subscriptionDetails.external_reference
          },
          include: {
            user: true
          }
        });

        if (subscription && subscription.user) {
          // Actualizar estado de la suscripción según el estado de Mercado Pago
          if (subscriptionDetails.status === 'authorized') {
            // Actualizar la suscripción a ACTIVE
            await prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                status: 'ACTIVE',
                lastPaymentDate: new Date(),
                nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
              }
            });
            
            // Actualizar el plan del usuario
            await prisma.user.update({
              where: { id: subscription.user.id },
              data: {
                plan: 'PREMIUM',
                planStart: new Date(),
                planEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
              }
            });
          } else if (subscriptionDetails.status === 'cancelled' || subscriptionDetails.status === 'paused') {
            // Actualizar la suscripción a CANCELLED o PAUSED
            await prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                status: subscriptionDetails.status === 'cancelled' ? 'CANCELLED' : 'PAUSED',
                endDate: new Date()
              }
            });
            
            // Actualizar el plan del usuario a FREE
            await prisma.user.update({
              where: { id: subscription.user.id },
              data: {
                plan: 'FREE',
                planEnd: new Date()
              }
            });
          }
        }
      } catch (dbError) {
        console.error('Error al actualizar usuario en la base de datos:', dbError);
        // Continuamos aunque falle la actualización en la base de datos
      }
    }

    res.status(200).json({ message: 'Notificación procesada exitosamente' });
  } catch (error: any) {
    console.error('Error al procesar webhook de Mercado Pago:', error);
    res.status(500).json({ error: error.message || 'Error al procesar webhook' });
  }
};
