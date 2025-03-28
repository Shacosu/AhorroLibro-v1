import { User } from '@prisma/client';
import { BookDiscountInfo } from '../emailUtils';

/**
 * Formatea los detalles del libro para una mejor presentación
 * @param details String con los detalles del libro
 * @returns HTML formateado con los detalles del libro
 */
const formatBookDetails = (details: string): string => {
  if (!details) return '';
  
  // Limpieza inicial y normalización
  let formattedDetails = details.replace(/,\s*/g, ' ').trim();
  
  // Extraer ISBN si está al principio
  let isbnMatch = formattedDetails.match(/^ISBN:\s*([^\s]+)\s*/);
  let isbn = '';
  
  if (isbnMatch) {
    isbn = isbnMatch[1].trim();
    formattedDetails = formattedDetails.replace(isbnMatch[0], '');
  }
  
  // Extraer "Detalles adicionales:" si está presente
  const detailsPrefix = 'Detalles adicionales:';
  if (formattedDetails.includes(detailsPrefix)) {
    formattedDetails = formattedDetails.replace(detailsPrefix, '').trim();
  }
  
  // Definir pares clave-valor conocidos
  const knownPairs = [
    { key: 'Formato', value: '' },
    { key: 'Autor', value: '' },
    { key: 'Editorial', value: '' },
    { key: 'Año', value: '' },
    { key: 'Idioma', value: '' },
    { key: 'N° páginas', value: '' },
    { key: 'Encuadernación', value: '' },
    { key: 'Dimensiones', value: '' },
    { key: 'Peso', value: '' },
    { key: 'ISBN13', value: '' },
    { key: 'Categorías', value: '' }
  ];
  
  // Construir el HTML formateado
  let htmlDetails = '';
  
  // Añadir ISBN si se encontró
  if (isbn) {
    htmlDetails += `<div class="detail-item"><span class="detail-label">ISBN:</span> <span class="detail-value">${isbn}</span></div>`;
  }
  
  // Enfoque más robusto: dividir por palabras clave conocidas
  // Primero, crear un patrón regex para encontrar todas las palabras clave
  const keywordsPattern = new RegExp(
    '\\b(' + knownPairs.map(pair => pair.key).join('|') + ')\\b', 'g'
  );
  
  // Encontrar todas las ocurrencias de palabras clave
  const matches = [...formattedDetails.matchAll(new RegExp(keywordsPattern, 'g'))];
  
  if (matches && matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const currentKeyword = currentMatch[0];
      const currentIndex = currentMatch.index;
      
      // Determinar dónde termina el valor (hasta la próxima palabra clave o el final)
      let endIndex = formattedDetails.length;
      if (i < matches.length - 1) {
        endIndex = matches[i + 1].index;
      }
      
      // Extraer el valor
      let value = formattedDetails.substring(currentIndex + currentKeyword.length, endIndex).trim();
      
      // Limpiar el valor (quitar ":" si existe)
      value = value.replace(/^:\s*/, '');
      
      // Casos especiales
      if (currentKeyword === 'Editorial' && value.includes('Año')) {
        const parts = value.split('Año');
        value = parts[0].trim();
        
        // Añadir el año como un detalle separado si contiene un número
        const yearMatch = parts[1]?.match(/\d+/);
        if (yearMatch) {
          const yearValue = yearMatch[0];
          htmlDetails += `<div class="detail-item"><span class="detail-label">Año:</span> <span class="detail-value">${yearValue}</span></div>`;
        }
      } else if (currentKeyword === 'Idioma' && value.includes('N° páginas')) {
        const parts = value.split('N° páginas');
        value = parts[0].trim();
        
        // Añadir páginas como un detalle separado si contiene un número
        const pagesMatch = parts[1]?.match(/\d+/);
        if (pagesMatch) {
          const pagesValue = pagesMatch[0];
          htmlDetails += `<div class="detail-item"><span class="detail-label">N° páginas:</span> <span class="detail-value">${pagesValue}</span></div>`;
        }
      } else if (currentKeyword === 'Encuadernación' && value.includes('Dimensiones')) {
        const parts = value.split('Dimensiones');
        value = parts[0].trim();
      } else if (currentKeyword === 'Dimensiones' && value.includes('Peso')) {
        const parts = value.split('Peso');
        value = parts[0].trim();
        
        // Añadir peso como un detalle separado
        const pesoMatch = parts[1]?.match(/[\d.]+/);
        if (pesoMatch) {
          const pesoValue = pesoMatch[0];
          htmlDetails += `<div class="detail-item"><span class="detail-label">Peso:</span> <span class="detail-value">${pesoValue}</span></div>`;
        }
      }
      
      // Añadir el detalle al HTML si tiene valor
      if (value) {
        htmlDetails += `<div class="detail-item"><span class="detail-label">${currentKeyword}:</span> <span class="detail-value">${value}</span></div>`;
      }
    }
  }
  
  // Buscar ISBN13 específicamente si no se encontró antes
  if (!formattedDetails.includes('ISBN13:') && formattedDetails.includes('ISBN13')) {
    const isbn13Match = formattedDetails.match(/ISBN13\s+(\d+)/);
    if (isbn13Match && isbn13Match[1]) {
      htmlDetails += `<div class="detail-item"><span class="detail-label">ISBN13:</span> <span class="detail-value">${isbn13Match[1]}</span></div>`;
    }
  }
  
  // Buscar Categorías específicamente
  if (formattedDetails.includes('Categorías')) {
    const categoriasMatch = formattedDetails.match(/Categorías\s+([^A-Z]+)(?=[A-Z]|$)/);
    if (categoriasMatch && categoriasMatch[1]) {
      htmlDetails += `<div class="detail-item"><span class="detail-label">Categorías:</span> <span class="detail-value">${categoriasMatch[1].trim()}</span></div>`;
    }
  }
  
  return htmlDetails;
};

/**
 * Genera el HTML para el correo de descuento
 * @param bookInfo Información del libro
 * @param user Usuario al que se enviará el correo
 * @returns HTML del correo
 */
export const generateDiscountEmailHTML = (bookInfo: BookDiscountInfo, user: User): string => {
  const { title, author, imageUrl, currentPrice, lastPrice, discount, link, description, details, previousPrices, lowestPrice, lowestPriceDate } = bookInfo;
  
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
      <h4 style="margin-bottom: 10px; color: #004E59; font-size: 1em;">Historial de Precios</h4>
      ${pricesToShow.map((priceItem, index) => `
        <div class="price-info" style="margin-bottom: ${index === pricesToShow.length - 1 ? '0' : '5px'};">
          <span class="price-label">${new Date(priceItem.date).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })}:</span>
          <span class="price-value" style="text-decoration: line-through;">$${priceItem.price.toLocaleString()}</span>
        </div>
      `).join('')}
    </div>`;
  }

  // Prepare lowest price section
  let lowestPriceHTML = '';
  if (lowestPrice && lowestPrice > 0) {
    const formattedLowestPrice = `$${lowestPrice.toLocaleString()}`;
    const formattedLowestPriceDate = lowestPriceDate ? new Date(lowestPriceDate).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
    
    lowestPriceHTML = `
    <div class="price-info" style="background-color: rgba(0, 78, 89, 0.1); border-left: 4px solid #004E59; padding: 10px;">
      <span class="price-label">Precio mínimo:</span>
      <span class="price-value" style="color: #004E59; font-size: 0.95em;">${formattedLowestPrice} <span style="font-size: 0.8em;">(${formattedLowestPriceDate})</span></span>
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
      background-color: rgba(0, 78, 89, 0.05);
      border-radius: 5px;
    }
    .price-label {
      font-weight: bold;
      color: #004E59;
      font-size: 0.95em;
    }
    .price-value {
      font-weight: bold;
      color: #004E59;
      font-size: 0.95em;
    }
    .discount {
      color: #E53935;
      font-weight: bold;
      font-size: 0.85em;
      margin-top: 3px;
      display: block;
      padding: 5px 0;
      margin-top: 3px;
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
      padding: 15px;
      background-color: rgba(0, 78, 89, 0.03);
      border-radius: 5px;
    }
    .details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 8px;
    }
    .detail-item {
      margin-bottom: 5px;
    }
    .detail-label {
      font-weight: bold;
      color: #004E59;
    }
    .detail-value {
      color: #333;
    }
    .previous-prices {
      margin-top: 15px;
      padding: 10px;
      background-color: #f5f5f5;
      border-radius: 5px;
    }
    .image-click-hint {
      display: block;
      font-size: 11px;
      color: #666;
      text-align: center;
      margin-top: 5px;
      font-style: italic;
    }
    @media only screen and (max-width: 480px) {
      .container {
        padding: 10px;
      }
      .header {
        padding: 15px 10px;
      }
      .book-header {
        flex-direction: column;
        align-items: center;
      }
      .book-header a {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-decoration: none;
      }
      .book-image {
        width: 100%;
        max-width: 200px;
        margin: 0 auto 5px;
      }
      .book-details {
        width: 100%;
        text-align: center;
      }
      .price-info {
        padding: 8px;
      }
      .details-grid {
        grid-template-columns: 1fr;
        gap: 4px;
      }
      .detail-item {
        margin-bottom: 3px;
        font-size: 13px;
      }
      .details-section {
        padding: 10px;
        margin-top: 10px;
      }
      .details-section h4 {
        font-size: 0.9em;
        margin-bottom: 8px;
      }
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
          <a href="${link}?afiliado=2b8de09ad3e4e4a8bdd4" target="_blank">
            <img src="${imageUrl}" alt="${title}" class="book-image">
            <span class="image-click-hint">Click en la imagen para ver el libro</span>
          </a>
          <div class="book-details">
            <h3 class="book-title">${title}</h3>
            <p class="book-author">Autor: ${author}</p>
          </div>
        </div>
        
        ${description ? `<div class="book-description">${description.substring(0, 150)}${description.length > 150 ? '...' : ''}</div>` : ''}
        
        <div class="price-info">
          <span class="price-label">Precio anterior:</span>
          <span class="price-value">${formattedLastPrice}</span>
        </div>
        <div class="price-info" style="flex-direction: column;">
          <div style="display: flex; justify-content: space-between; width: 100%;">
            <span class="price-label">Precio actual:</span> 
            <span class="price-value">${formattedCurrentPrice}</span>
          </div>
          <p class="discount" style="margin: 5px 0 0 0; text-align: right;">(Ahorro: ${formattedDiscount} | ${discountPercentage}%)</p>
        </div>
        ${lowestPriceHTML}
        ${previousPricesHTML}
        
        ${details ? `
        <div class="details-section">
          <h4 style="margin-bottom: 10px; color: #004E59; font-size: 1em;">Detalles del libro:</h4>
          <div class="details-grid">
            ${formatBookDetails(details)}
          </div>
        </div>` : ''}
      </div>
      
      <p>Este descuento supera tu configuración de notificación de ${user.discountPercentage}%.</p>
      
      <p>No pierdas esta oportunidad de adquirir este libro a un precio especial.</p>
      
      <div style="text-align: center;">
        <a href="${link}?afiliado=2b8de09ad3e4e4a8bdd4" class="button">Ver Libro</a>
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
  const { title, author, imageUrl, currentPrice, link, description, details, lowestPrice, lowestPriceDate } = bookInfo;
  
  const formattedCurrentPrice = `$${currentPrice.toLocaleString()}`;
  const today = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  // Prepare lowest price section
  let lowestPriceHTML = '';
  if (lowestPrice && lowestPrice > 0) {
    const formattedLowestPrice = `$${lowestPrice.toLocaleString()}`;
    const formattedLowestPriceDate = lowestPriceDate ? new Date(lowestPriceDate).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
    
    lowestPriceHTML = `
    <div class="price-info" style="background-color: rgba(0, 78, 89, 0.1); border-left: 4px solid #004E59; padding: 10px;">
      <span class="price-label">Precio mínimo:</span>
      <span class="price-value" style="color: #004E59; font-size: 0.95em;">${formattedLowestPrice} <span style="font-size: 0.8em;">(${formattedLowestPriceDate})</span></span>
    </div>`;
  }

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
        background-color: rgba(0, 78, 89, 0.05);
        border-radius: 5px;
      }
      .price-label {
        font-weight: bold;
        color: #004E59;
        font-size: 0.95em;
      }
      .price-value {
        font-weight: bold;
        color: #004E59;
        font-size: 0.95em;
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
        padding: 15px;
        background-color: rgba(0, 78, 89, 0.03);
        border-radius: 5px;
      }
      .details-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 8px;
      }
      .detail-item {
        margin-bottom: 5px;
      }
      .detail-label {
        font-weight: bold;
        color: #004E59;
      }
      .detail-value {
        color: #333;
      }
      .back-in-stock {
        background-color: #4CAF50;
        color: white;
        padding: 5px 10px;
        border-radius: 3px;
        font-weight: bold;
        display: inline-block;
        margin-bottom: 10px;
        font-size: 15px;
      }
      .image-click-hint {
        display: block;
        font-size: 11px;
        color: #666;
        text-align: center;
        margin-top: 5px;
        font-style: italic;
      }
      @media only screen and (max-width: 480px) {
        .container {
          padding: 10px;
        }
        .header {
          padding: 15px 10px;
        }
        .book-header {
          flex-direction: column;
          align-items: center;
        }
        .book-header a {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-decoration: none;
        }
        .book-image {
          width: 100%;
          max-width: 200px;
          margin: 0 auto 5px;
        }
        .book-details {
          width: 100%;
          text-align: center;
        }
        .price-info {
          padding: 8px;
        }
        .details-grid {
          grid-template-columns: 1fr;
          gap: 4px;
        }
        .detail-item {
          margin-bottom: 3px;
          font-size: 13px;
        }
        .details-section {
          padding: 10px;
          margin-top: 10px;
        }
        .details-section h4 {
          font-size: 0.9em;
          margin-bottom: 8px;
        }
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
            <a href="${link}?afiliado=2b8de09ad3e4e4a8bdd4" target="_blank">
              <img src="${imageUrl}" alt="${title}" class="book-image">
              <span class="image-click-hint">Click en la imagen para ver el libro</span>
            </a>
            <div class="book-details">
              <h3 class="book-title">${title}</h3>
              <p class="book-author">Autor: ${author}</p>
              <span class="back-in-stock">¡DE VUELTA EN STOCK!</span>
            </div>
          </div>
          
          ${description ? `<div class="book-description">${description.substring(0, 150)}${description.length > 150 ? '...' : ''}</div>` : ''}
          
          <div class="price-info">
            <span class="price-label">Precio actual:</span>
            <span class="price-value">${formattedCurrentPrice}</span>
          </div>
          
          ${lowestPriceHTML}
          
          ${details ? `
          <div class="details-section">
            <h4 style="margin-bottom: 10px; color: #004E59; font-size: 1em;">Detalles del libro:</h4>
            <div class="details-grid">
              ${formatBookDetails(details)}
            </div>
          </div>` : ''}
        </div>
        
        <p>No pierdas esta oportunidad de adquirir este libro que estaba agotado.</p>
        
        <div style="text-align: center;">
          <a href="${link}?afiliado=2b8de09ad3e4e4a8bdd4" class="button">Ver Libro</a>
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
