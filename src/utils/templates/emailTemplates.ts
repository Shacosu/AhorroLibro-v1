import { User } from '@prisma/client';
import { BookDiscountInfo } from '../emailUtils';

/**
 * Genera el HTML para el correo de descuento
 * @param bookInfo Información del libro
 * @param user Usuario al que se enviará el correo
 * @returns HTML del correo
 */
export const generateDiscountEmailHTML = (bookInfo: BookDiscountInfo, user: User): string => {
  const { title, author, imageUrl, currentPrice, lastPrice, discount, link, description, details, previousPrices } = bookInfo;
  
  const discountPercentage = lastPrice ? ((lastPrice - currentPrice) / lastPrice * 100).toFixed(2) : 'N/A';
  const formattedCurrentPrice = `$${currentPrice.toLocaleString()}`;
  const formattedLastPrice = lastPrice ? `$${lastPrice.toLocaleString()}` : 'N/A';
  const formattedDiscount = `$${discount.toLocaleString()}`;
  const today = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  // Prepare previous prices section
  let previousPricesHTML = '';
  if (previousPrices && previousPrices.length > 0) {
    // Limit to 3 previous prices for better display
    const pricesToShow = previousPrices.slice(0, 3);
    
    previousPricesHTML = `
    <div class="previous-prices">
      <h4 style="margin-bottom: 10px; color: #004E59;">Historial de Precios</h4>
      ${pricesToShow.map((priceItem, index) => `
        <div class="price-info" style="margin-bottom: ${index === pricesToShow.length - 1 ? '0' : '5px'};">
          <span class="price-label">${new Date(priceItem.date).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })}:</span>
          <span class="price-value">$${priceItem.price.toLocaleString()}</span>
        </div>
      `).join('')}
    </div>`;
  }

  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Descuento en Libro</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background-color: #004E59;
        color: white;
        padding: 20px;
        text-align: center;
        border-radius: 5px 5px 0 0;
      }
      .content {
        padding: 20px;
        background-color: #f9f9f9;
        border: 1px solid #ddd;
        border-top: none;
        border-radius: 0 0 5px 5px;
      }
      .book-info {
        margin: 20px 0;
        padding: 15px;
        background-color: white;
        border-radius: 5px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      }
      .book-header {
        display: flex;
        margin-bottom: 15px;
      }
      .book-image {
        width: 120px;
        height: auto;
        margin-right: 15px;
        border-radius: 5px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        object-fit: cover;
      }
      .book-details {
        flex: 1;
      }
      .book-title {
        margin: 0 0 5px 0;
        color: #004E59;
      }
      .book-author {
        margin: 0 0 10px 0;
        color: #666;
        font-style: italic;
      }
      .book-description {
        margin: 15px 0;
        font-size: 14px;
        line-height: 1.5;
      }
      .price-info {
        display: flex;
        justify-content: space-between;
        margin: 10px 0;
        padding: 10px;
        background-color: #f0f0f0;
        border-radius: 5px;
      }
      .price-label {
        font-weight: bold;
        color: #555;
      }
      .price-value {
        font-weight: bold;
        color: #004E59;
      }
      .discount {
        color: #E53935;
        font-weight: bold;
      }
      .footer {
        margin-top: 20px;
        text-align: center;
        font-size: 12px;
        color: #777;
      }
      .button {
        display: inline-block;
        padding: 10px 20px;
        background-color: #004E59;
        color: white !important;
        text-decoration: none !important;
        border-radius: 5px;
        font-weight: bold;
        margin-top: 15px;
      }
      .details-section {
        margin-top: 15px;
        padding: 10px;
        background-color: #f5f5f5;
        border-radius: 5px;
        font-size: 13px;
      }
      .previous-prices {
        margin-top: 15px;
        padding: 10px;
        background-color: #f5f5f5;
        border-radius: 5px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>¡Descuento Detectado!</h1>
        <p>Hemos encontrado un descuento en un libro de tu lista de seguimiento</p>
      </div>
      <div class="content">
        <h2>Hola ${user.name},</h2>
        <p>¡Buenas noticias! El libro que estás siguiendo tiene un descuento:</p>
        
        <div class="book-info">
          <div class="book-header">
            <img src="${imageUrl}" alt="${title}" class="book-image">
            <div class="book-details">
              <h3 class="book-title">${title}</h3>
              <p class="book-author">Autor: ${author}</p>
            </div>
          </div>
          
          ${description ? `<div class="book-description">${description.substring(0, 150)}${description.length > 150 ? '...' : ''}</div>` : ''}
          
          <div class="price-info">
            <span class="price-label">Precio Anterior:</span>
            <span class="price-value">${formattedLastPrice}</span>
          </div>
          <div class="price-info">
            <span class="price-label">Precio Actual:</span>
            <span class="price-value discount">${formattedCurrentPrice} <span style="font-size: 0.9em;">(Ahorro: ${formattedDiscount} | ${discountPercentage}%)</span></span>
          </div>
          
          ${previousPricesHTML}
          
          ${details ? `
          <div class="details-section">
            <strong>Detalles del libro:</strong><br>
            ${details}
          </div>` : ''}
        </div>
        
        <p>Este descuento supera tu configuración de notificación de ${user.discountPercentage}%.</p>
        
        <p>No pierdas esta oportunidad de adquirir este libro a un precio especial.</p>
        
        <div style="text-align: center;">
          <a href="${link}" class="button">Ver Libro</a>
        </div>
      </div>
      <div class="footer">
        <p>Este correo fue enviado el ${today} por Ahorro Libro.</p>
        <p>Si no deseas recibir más notificaciones, puedes actualizar tus preferencias en tu perfil.</p>
      </div>
    </div>
  </body>
  </html>
  `;
};

/**
 * Genera el HTML para el correo de vuelta en stock
 * @param bookInfo Información del libro
 * @param user Usuario al que se enviará el correo
 * @returns HTML del correo
 */
export const generateBackInStockEmailHTML = (bookInfo: BookDiscountInfo, user: User): string => {
  const { title, author, imageUrl, currentPrice, link, description, details } = bookInfo;
  
  const formattedCurrentPrice = `$${currentPrice.toLocaleString()}`;
  const today = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Libro de vuelta en stock</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background-color: #004E59;
        color: white;
        padding: 20px;
        text-align: center;
        border-radius: 5px 5px 0 0;
      }
      .content {
        padding: 20px;
        background-color: #f9f9f9;
        border: 1px solid #ddd;
        border-top: none;
        border-radius: 0 0 5px 5px;
      }
      .book-info {
        margin: 20px 0;
        padding: 15px;
        background-color: white;
        border-radius: 5px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      }
      .book-header {
        display: flex;
        margin-bottom: 15px;
      }
      .book-image {
        width: 120px;
        height: auto;
        margin-right: 15px;
        border-radius: 5px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        object-fit: cover;
      }
      .book-details {
        flex: 1;
      }
      .book-title {
        margin: 0 0 5px 0;
        color: #004E59;
      }
      .book-author {
        margin: 0 0 10px 0;
        color: #666;
        font-style: italic;
      }
      .book-description {
        margin: 15px 0;
        font-size: 14px;
        line-height: 1.5;
      }
      .price-info {
        display: flex;
        justify-content: space-between;
        margin: 10px 0;
        padding: 10px;
        background-color: #f0f0f0;
        border-radius: 5px;
      }
      .price-label {
        font-weight: bold;
        color: #555;
      }
      .price-value {
        font-weight: bold;
        color: #004E59;
      }
      .footer {
        margin-top: 20px;
        text-align: center;
        font-size: 12px;
        color: #777;
      }
      .button {
        display: inline-block;
        padding: 10px 20px;
        background-color: #004E59;
        color: white !important;
        text-decoration: none !important;
        border-radius: 5px;
        font-weight: bold;
        margin-top: 15px;
      }
      .details-section {
        margin-top: 15px;
        padding: 10px;
        background-color: #f5f5f5;
        border-radius: 5px;
        font-size: 13px;
      }
      .back-in-stock {
        background-color: #4CAF50;
        color: white;
        padding: 5px 10px;
        border-radius: 3px;
        font-weight: bold;
        display: inline-block;
        margin-bottom: 10px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>¡Libro de vuelta en stock!</h1>
        <p>Un libro que estabas siguiendo está disponible nuevamente</p>
      </div>
      <div class="content">
        <h2>Hola ${user.name},</h2>
        <p>¡Buenas noticias! El libro que estabas siguiendo está disponible nuevamente:</p>
        
        <div class="book-info">
          <div class="book-header">
            <img src="${imageUrl}" alt="${title}" class="book-image">
            <div class="book-details">
              <h3 class="book-title">${title}</h3>
              <p class="book-author">Autor: ${author}</p>
              <span class="back-in-stock">¡DE VUELTA EN STOCK!</span>
            </div>
          </div>
          
          ${description ? `<div class="book-description">${description.substring(0, 150)}${description.length > 150 ? '...' : ''}</div>` : ''}
          
          <div class="price-info">
            <span class="price-label">Precio Actual:</span>
            <span class="price-value">${formattedCurrentPrice}</span>
          </div>
          
          ${details ? `
          <div class="details-section">
            <strong>Detalles del libro:</strong><br>
            ${details}
          </div>` : ''}
        </div>
        
        <p>No pierdas esta oportunidad de adquirir este libro que estaba agotado.</p>
        
        <div style="text-align: center;">
          <a href="${link}" class="button">Ver Libro</a>
        </div>
      </div>
      <div class="footer">
        <p>Este correo fue enviado el ${today} por Ahorro Libro.</p>
        <p>Si no deseas recibir más notificaciones, puedes actualizar tus preferencias en tu perfil.</p>
      </div>
    </div>
  </body>
  </html>
  `;
};
