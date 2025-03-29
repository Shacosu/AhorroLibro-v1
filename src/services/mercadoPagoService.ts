import { MercadoPagoConfig, Payment, PreApproval } from 'mercadopago';
import { credentials } from '../utils/credentials';
import { PrismaClient, User } from '@prisma/client';

const prisma = new PrismaClient();

// Configurar Mercado Pago con el token de acceso
const client = new MercadoPagoConfig({ 
  accessToken: credentials.mercadoPagoAccessToken,
  options: { 
    timeout: 5000,
    integratorId: "dev_ahorro_libro",
    corporationId: "CL" // Especificar Chile como país de operación
  }
});

// Inicializar el objeto de pago y preapproval
const preapproval = new PreApproval(client);
const AMOUNT_SUBSCRIPTION = 7990; // Ajustar al precio real en CLP

/**
 * Interfaz para los datos de la suscripción
 */
interface SubscriptionData {
  reason: string;
  externalReference: string;
  payerEmail: string;
  frequency: number;
  frequencyType: 'days' | 'months';
  endDate?: Date;
  transactionAmount: number;
  currencyId: string;
  backUrl: string;
}

/**
 * Crea una suscripción con pago pendiente en Mercado Pago
 * @param data Datos de la suscripción
 * @returns Datos de la suscripción creada
 */
export const createPendingSubscription = async (data: SubscriptionData) => {
  try {
    // Crear una suscripción usando la API de PreApproval
    const subscription = await preapproval.create({
      body: {
        reason: data.reason,
        external_reference: data.externalReference,
        payer_email: data.payerEmail,
        auto_recurring: {
          frequency: data.frequency,
          frequency_type: data.frequencyType,
          transaction_amount: data.transactionAmount,
          currency_id: data.currencyId,
          end_date: data.endDate ? data.endDate.toISOString() : undefined
        },
        back_url: data.backUrl,
        status: 'pending'
      }
    });
    
    return subscription;
  } catch (error) {
    console.error('Error al crear suscripción en Mercado Pago:', error);
    throw error;
  }
};

/**
 * Crea una suscripción para un usuario
 * @param userId ID del usuario
 * @param countryCode Código ISO del país (default: CL)
 * @param currency Moneda (default: CLP)
 * @returns Datos de la suscripción creada
 */
export const createUserSubscription = async (userId: number, countryCode: string = 'CL', currency: string = 'CLP') => {
  try {
    // Obtener datos del usuario
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true }
    });

    if (!user) {
      throw new Error(`Usuario con ID ${userId} no encontrado`);
    }

    // Verificar si el usuario ya tiene una suscripción activa
    if (user.subscription && user.subscription.status === 'ACTIVE') {
      throw new Error('El usuario ya tiene una suscripción activa');
    }

    // Generar referencia externa única
    const externalReference = `subscription-${userId}-${Date.now()}`;

    // Preparar datos para la suscripción
    const subscriptionData: SubscriptionData = {
      reason: `Suscripción Premium - Ahorro Libro`,
      externalReference,
      payerEmail: user.email,
      frequency: 1,
      frequencyType: 'months',
      transactionAmount: AMOUNT_SUBSCRIPTION,
      currencyId: currency,
      backUrl: 'https://ahorrolibro.cl/subscription/callback'
    };

    console.log('Creando suscripción con datos:', {
      ...subscriptionData,
      payerEmail: user.email.substring(0, 3) + '***' // Ocultar parte del email por privacidad
    });

    // Crear suscripción en Mercado Pago
    const mpSubscription = await preapproval.create({
      body: {
        reason: subscriptionData.reason,
        external_reference: subscriptionData.externalReference,
        payer_email: subscriptionData.payerEmail,
        auto_recurring: {
          frequency: subscriptionData.frequency,
          frequency_type: subscriptionData.frequencyType,
          transaction_amount: subscriptionData.transactionAmount,
          currency_id: subscriptionData.currencyId,
          end_date: subscriptionData.endDate ? subscriptionData.endDate.toISOString() : undefined
        },
        back_url: subscriptionData.backUrl,
        status: 'pending'
      }
    });

    // Obtener la URL de pago desde la respuesta
    const paymentUrl = mpSubscription.init_point || '';

    // Guardar datos de la suscripción en la base de datos
    try {
      // Verificar si el usuario ya tiene una suscripción
      if (user.subscription) {
        // Actualizar la suscripción existente
        await prisma.subscription.update({
          where: { userId: userId },
          data: {
            mercadoPagoId: String(mpSubscription.id),
            status: 'PENDING',
            externalReference: externalReference,
            reason: subscriptionData.reason,
            transactionAmount: AMOUNT_SUBSCRIPTION,
            paymentLink: paymentUrl,
            frequency: subscriptionData.frequency,
            frequencyType: subscriptionData.frequencyType,
            nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
          }
        });
      } else {
        // Crear una nueva suscripción
        await prisma.subscription.create({
          data: {
            userId: userId,
            mercadoPagoId: String(mpSubscription.id),
            status: 'PENDING',
            externalReference: externalReference,
            reason: subscriptionData.reason,
            transactionAmount: AMOUNT_SUBSCRIPTION,
            paymentLink: paymentUrl,
            frequency: subscriptionData.frequency,
            frequencyType: subscriptionData.frequencyType,
            nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
          }
        });
      }
      
      // Actualizar el plan del usuario
      await prisma.user.update({
        where: { id: userId },
        data: {
          plan: 'PREMIUM',
          planStart: new Date(),
          planEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
        }
      });
    } catch (dbError) {
      console.error('Error al guardar suscripción en la base de datos:', dbError);
      // Continuamos aunque falle la inserción en la base de datos
    }

    return {
      subscriptionId: mpSubscription.id,
      paymentLink: paymentUrl,
      status: mpSubscription.status
    };
  } catch (error) {
    console.error('Error al crear suscripción para usuario:', error);
    throw error;
  }
};

/**
 * Verifica el estado de una suscripción en Mercado Pago
 * @param subscriptionId ID de la suscripción en Mercado Pago
 * @returns Estado de la suscripción
 */
export const checkSubscriptionStatus = async (subscriptionId: string) => {
  try {
    const response = await preapproval.get({ id: subscriptionId });
    return response;
  } catch (error) {
    console.error('Error al verificar estado de suscripción:', error);
    throw error;
  }
};

/**
 * Cancela una suscripción
 * @param subscriptionId ID de la suscripción en Mercado Pago
 * @returns Suscripción cancelada
 */
export const cancelSubscription = async (subscriptionId: string) => {
  try {
    // Para cancelar una suscripción, usamos el método update para cambiar su estado a "cancelled"
    const response = await preapproval.update({
      id: subscriptionId,
      body: {
        status: 'cancelled'
      }
    });
    
    // Buscar la suscripción en la base de datos
    try {
      const subscription = await prisma.subscription.findFirst({
        where: { mercadoPagoId: subscriptionId },
        include: { user: true }
      });
      
      if (subscription) {
        // Actualizar el estado de la suscripción
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'CANCELLED',
            endDate: new Date()
          }
        });
        
        // Actualizar el plan del usuario
        if (subscription.user) {
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
      console.error('Error al actualizar la suscripción en la base de datos:', dbError);
      // Continuamos aunque falle la actualización en la base de datos
    }
    
    return response;
  } catch (error) {
    console.error('Error al cancelar suscripción:', error);
    throw error;
  }
};
