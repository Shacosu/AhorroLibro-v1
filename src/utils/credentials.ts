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
