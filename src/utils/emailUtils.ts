import nodemailer from 'nodemailer';
import { User } from '@prisma/client';
import { generateDiscountEmailHTML, generateBackInStockEmailHTML } from './templates/emailTemplates';
import { credentials } from './credentials';

const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 587,
  secure: false,
  auth: {
    user: credentials.emailUser,
    pass: credentials.emailPassword,
  },
});

export interface BookDiscountInfo {
  title: string;
  author: string;
  imageUrl: string;
  currentPrice: number;
  lastPrice: number | null;
  discount: number;
  link: string;
  description?: string;
  details?: string;
  previousPrices?: { price: number; date: Date }[];
  lowestPrice?: number | null;
  lowestPriceDate?: Date | null;
}

export const sendDiscountEmail = (bookInfo: BookDiscountInfo, user: User) => {
  try {
    // Generar el HTML del correo
    const htmlContent = generateDiscountEmailHTML(bookInfo, user);
    console.log(htmlContent)
    const discountPercentage = bookInfo.lastPrice ? ((bookInfo.lastPrice - bookInfo.currentPrice) / bookInfo.lastPrice * 100).toFixed(2) : 'N/A';
    const mailOptions = {
      from: '"Ahorro Libro" <noreply@ahorrolibro.cl>',
      to: user.email,
      subject: `¡Descuento Detectado! ${bookInfo.title} ahora con ${discountPercentage}% de descuento`,
      html: htmlContent,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return console.log(error);
      }
      console.log('Email sent: ' + info.response);
    });
  } catch (error) {
    console.error('Error al enviar correo de descuento:', error);
  }
};

export const sendBackInStockEmail = (bookInfo: BookDiscountInfo, user: User) => {
  try {
    // Generar el HTML del correo
    const htmlContent = generateBackInStockEmailHTML(bookInfo, user);
    
    const mailOptions = {
      from: '"Ahorro Libro" <noreply@ahorrolibro.cl>',
      to: user.email,
      subject: `¡${bookInfo.title} está de vuelta en stock!`,
      html: htmlContent,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return console.log(error);
      }
      console.log('Back in stock email sent: ' + info.response);
    });
  } catch (error) {
    console.error('Error al enviar correo de vuelta en stock:', error);
  }
};
