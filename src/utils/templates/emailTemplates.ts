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

  // Eliminar cualquier otra mención de ISBN o ISBN13 del texto
  formattedDetails = formattedDetails.replace(/ISBN13?:\s*[^,\s]+\s*,?/g, '');
  formattedDetails = formattedDetails.replace(/ISBN13?\s+[^,\s]+\s*,?/g, '');

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
  const ahorroTotal = lastPrice && currentPrice ? lastPrice - currentPrice : 0;
  const formattedAhorroTotal = `$${ahorroTotal.toLocaleString()}`;
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

  // Format book details using the helper function
  const formattedBookDetails = details ? formatBookDetails(details) : '';

  return `
  <!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Descuento en Libro</title>
  <style>
    body {
      font-family: Arial, sans-serif !important;
      line-height: 1.6 !important;
      color: #333 !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
    }
    .container {
      max-width: 600px !important;
      margin: 0 auto !important;
      padding: 20px !important;
      width: 100% !important;
    }
    .header {
      background-color: #004E59 !important;
      color: white !important;
      padding: 20px !important;
      text-align: center !important;
      border-radius: 5px 5px 0 0 !important;
    }
    .content {
      padding: 20px !important;
      background-color: #f9f9f9 !important;
      border: 1px solid #ddd !important;
      border-top: none !important;
      border-radius: 0 0 5px 5px !important;
    }
    .book-info {
      margin: 20px 0 !important;
      padding: 15px !important;
      background-color: white !important;
      border-radius: 5px !important;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1) !important;
    }
    .book-header {
      display: flex !important;
      margin-bottom: 15px !important;
    }
    .book-image {
      width: 120px !important;
      height: auto !important;
      margin-right: 15px !important;
      border-radius: 5px !important;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1) !important;
      object-fit: cover !important;
    }
    .book-details {
      flex: 1 !important;
    }
    .book-title {
      margin: 0 0 5px 0 !important;
      color: #004E59 !important;
    }
    .book-author {
      margin: 0 0 10px 0 !important;
      color: #666 !important;
      font-style: italic !important;
    }
    .book-description {
      margin: 15px 0 !important;
      font-size: 14px !important;
      line-height: 1.5 !important;
    }
    .price-info {
      display: flex !important;
      justify-content: space-between !important;
      margin: 10px 0 !important;
      padding: 10px !important;
      background-color: rgba(0, 78, 89, 0.05) !important;
      border-radius: 5px !important;
    }
    .price-label {
      font-weight: bold !important;
      color: #004E59 !important;
      font-size: 0.95em !important;
    }
    .price-value {
      font-weight: bold !important;
      color: #004E59 !important;
      font-size: 0.95em !important;
    }
    .discount {
      color: #E53935 !important;
      font-weight: bold !important;
      font-size: 0.85em !important;
      margin-top: 3px !important;
      display: block !important;
      padding: 5px 0 !important;
      margin-top: 3px !important;
      text-align: center !important;
    }
    .footer {
      margin-top: 20px !important;
      text-align: center !important;
      font-size: 12px !important;
      color: #777 !important;
    }
    .button {
      display: inline-block !important;
      padding: 10px 20px !important;
      background-color: #004E59 !important;
      color: white !important;
      text-decoration: none !important;
      border-radius: 5px !important;
      font-weight: bold !important;
      margin-top: 15px !important;
    }
    .details-section {
      margin-top: 15px !important;
      padding: 15px !important;
      background-color: rgba(0, 78, 89, 0.03) !important;
      border-radius: 5px !important;
    }
    .details-grid {
      display: grid !important;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important;
      gap: 8px !important;
    }
    .detail-item {
      margin-bottom: 5px !important;
    }
    .detail-label {
      font-weight: bold !important;
      color: #004E59 !important;
    }
    .detail-value {
      color: #333 !important;
    }
    .previous-prices {
      margin-top: 15px !important;
      padding: 10px !important;
      background-color: #f5f5f5 !important;
      border-radius: 5px !important;
    }
    .image-click-hint {
      display: block !important;
      font-size: 11px !important;
      color: #666 !important;
      text-align: center !important;
      margin-top: 5px !important;
      font-style: italic !important;
    }
    /* Gmail-specific table styling */
    table {
      border-collapse: collapse !important;
      mso-table-lspace: 0pt !important;
      mso-table-rspace: 0pt !important;
    }
    table td {
      border-collapse: collapse !important;
    }
    /* Mobile styles */
    @media screen and (max-width: 480px) {
      .container {
        width: 100% !important;
        padding: 10px !important;
      }
      .header {
        padding: 15px 10px !important;
      }
      .book-header {
        flex-direction: column !important;
        align-items: center !important;
      }
      .book-header a {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        text-decoration: none !important;
      }
      .book-image {
        width: 100% !important;
        max-width: 200px !important;
        margin: 0 auto 5px !important;
      }
      .book-details {
        width: 100% !important;
        text-align: center !important;
      }
      .price-info {
        padding: 8px !important;
      }
      .details-grid {
        grid-template-columns: 1fr !important;
        gap: 4px !important;
      }
      .detail-item {
        margin-bottom: 3px !important;
        font-size: 13px !important;
      }
      .details-section {
        padding: 10px !important;
        margin-top: 10px !important;
      }
      .details-section h4 {
        font-size: 0.9em !important;
        margin-bottom: 8px !important;
      }
      /* Force table to not be like tables anymore */
      table, tbody, tr, td {
        display: block !important;
        width: 100% !important;
      }
      /* Hide table headers */
      thead tr {
        position: absolute !important;
        top: -9999px !important;
        left: -9999px !important;
      }
      td {
        position: relative !important;
        padding-left: 0 !important;
      }
    }
  </style>
</head>
<body>
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <div class="container">
          <div class="header">
            <h1>¡Descuento Detectado!</h1>
            <p>Hemos encontrado un descuento en un libro de tu lista de seguimiento</p>
          </div>
          <div class="content">
            <h2>Hola ${user.name},</h2>
            <p>¡Buenas noticias! El libro que estás siguiendo tiene un descuento:</p>
            
            <div class="book-info">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" class="book-header">
                <tr>
                  <td style="vertical-align: top; width: 120px;">
                    <a href="${link}?afiliado=2b8de09ad3e4e4a8bdd4" target="_blank" style="text-decoration: none; color: inherit;">
                      <table border="0" cellspacing="0" cellpadding="0" style="width: 100%;">
                        <tr>
                          <td style="text-align: center;">
                            <img src="${imageUrl}" alt="${title}" class="book-image" style="width: 120px; height: auto; margin-bottom: 5px;">
                          </td>
                        </tr>
                        <tr>
                          <td style="text-align: center;">
                            <span class="image-click-hint" style="display: block; text-align: center; font-size: 11px; color: #666; font-style: italic;">Click en la imagen para ver el libro</span>
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                  <td style="vertical-align: top; padding-left: 15px;">
                    <div class="book-details">
                      <h3 class="book-title">${title}</h3>
                      <p class="book-author">Autor: ${author}</p>
                    </div>
                  </td>
                </tr>
              </table>
              
              ${description ? `<div class="book-description">${description.substring(0, 150)}${description.length > 150 ? '...' : ''}</div>` : ''}
              <div class="price-summary" style="background: #f4f8f7; border-radius: 6px; padding: 16px; margin-bottom: 12px;">
                <div style="margin-bottom: 6px;">
                  <span style="color: #888; text-decoration: line-through; font-size: 1em;">Precio anterior: <b>${formattedLastPrice}</b></span>
                </div>
                <div style="margin-bottom: 6px;">
                  <span style="color: #004E59; font-size: 1.3em; font-weight: bold;">Precio actual: ${formattedCurrentPrice}</span>
                </div>
                <div style="margin-bottom: 6px;">
                  <span style="color: #00875a; font-size: 1.1em; font-weight: 600;">¡Ahorro total: ${formattedAhorroTotal}!</span>
                </div>
                <div style="margin-bottom: 8px;">
                  <span style="background: #eafaf5; color: #00875a; border-radius: 4px; padding: 2px 8px; font-size: 1em; font-weight: 600;">
                    Descuento: ${discountPercentage}%
                  </span>
                </div>
                <div style="font-size: 0.97em; color: #555;">
                  Aprovecha este descuento antes de que cambie el precio.
                </div>
              </div>
              ${lowestPriceHTML}
              ${previousPricesHTML}
              ${details ? `
              <div class="details-section">
                <h4 style="margin-bottom: 10px; color: #004E59; font-size: 1em;">Detalles del libro:</h4>
                <div class="details-grid">
                  ${formattedBookDetails}
                </div>
              </div>` : ''}
            </div>
            
            <p>Este descuento supera tu configuración de notificación de ${user.discountPercentage}%.</p>
            
            <p>No pierdas esta oportunidad de adquirir este libro.</p>
            
            <div style="text-align: center;">
              <a href="${link}?afiliado=2b8de09ad3e4e4a8bdd4" class="button">Ver Libro</a>
            </div>
          </div>
          <div class="footer">
            <p>Este correo fue enviado el ${today} por Ahorro Libro.</p>
            <p>Si no deseas recibir más notificaciones, puedes actualizar <a href="https://ahorrolibro.cl/profile" style="color: #004E59; text-decoration: underline;">tus preferencias</a> en tu perfil.</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
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

  // Format book details using the helper function
  const formattedBookDetails = details ? formatBookDetails(details) : '';

  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Libro de vuelta en stock</title>
    <style>
      body {
        font-family: Arial, sans-serif !important;
        line-height: 1.6 !important;
        color: #333 !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
      }
      .container {
        max-width: 600px !important;
        margin: 0 auto !important;
        padding: 20px !important;
        width: 100% !important;
      }
      .header {
        background-color: #004E59 !important;
        color: white !important;
        padding: 20px !important;
        text-align: center !important;
        border-radius: 5px 5px 0 0 !important;
      }
      .content {
        padding: 20px !important;
        background-color: #f9f9f9 !important;
        border: 1px solid #ddd !important;
        border-top: none !important;
        border-radius: 0 0 5px 5px !important;
      }
      .book-info {
        margin: 20px 0 !important;
        padding: 15px !important;
        background-color: white !important;
        border-radius: 5px !important;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1) !important;
      }
      .book-header {
        display: flex !important;
        margin-bottom: 15px !important;
      }
      .book-image {
        width: 120px !important;
        height: auto !important;
        margin-right: 15px !important;
        border-radius: 5px !important;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1) !important;
        object-fit: cover !important;
      }
      .book-details {
        flex: 1 !important;
      }
      .book-title {
        margin: 0 0 5px 0 !important;
        color: #004E59 !important;
      }
      .book-author {
        margin: 0 0 10px 0 !important;
        color: #666 !important;
        font-style: italic !important;
      }
      .book-description {
        margin: 15px 0 !important;
        font-size: 14px !important;
        line-height: 1.5 !important;
      }
      .price-info {
        display: flex !important;
        justify-content: space-between !important;
        margin: 10px 0 !important;
        padding: 10px !important;
        background-color: rgba(0, 78, 89, 0.05) !important;
        border-radius: 5px !important;
      }
      .price-label {
        font-weight: bold !important;
        color: #004E59 !important;
        font-size: 0.95em !important;
      }
      .price-value {
        font-weight: bold !important;
        color: #004E59 !important;
        font-size: 0.95em !important;
      }
      .footer {
        margin-top: 20px !important;
        text-align: center !important;
        font-size: 12px !important;
        color: #777 !important;
      }
      .button {
        display: inline-block !important;
        padding: 10px 20px !important;
        background-color: #004E59 !important;
        color: white !important;
        text-decoration: none !important;
        border-radius: 5px !important;
        font-weight: bold !important;
        margin-top: 15px !important;
      }
      .details-section {
        margin-top: 15px !important;
        padding: 15px !important;
        background-color: rgba(0, 78, 89, 0.03) !important;
        border-radius: 5px !important;
      }
      .details-grid {
        display: grid !important;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important;
        gap: 8px !important;
      }
      .detail-item {
        margin-bottom: 5px !important;
      }
      .detail-label {
        font-weight: bold !important;
        color: #004E59 !important;
      }
      .detail-value {
        color: #333 !important;
      }
      .back-in-stock {
        background-color: #4CAF50 !important;
        color: white !important;
        padding: 5px 10px !important;
        border-radius: 3px !important;
        font-weight: bold !important;
        display: inline-block !important;
        margin-bottom: 10px !important;
        font-size: 15px !important;
      }
      .image-click-hint {
        display: block !important;
        font-size: 11px !important;
        color: #666 !important;
        text-align: center !important;
        margin-top: 5px !important;
        font-style: italic !important;
      }
      /* Gmail-specific table styling */
      table {
        border-collapse: collapse !important;
        mso-table-lspace: 0pt !important;
        mso-table-rspace: 0pt !important;
      }
      table td {
        border-collapse: collapse !important;
      }
      /* Mobile styles */
      @media screen and (max-width: 480px) {
        .container {
          width: 100% !important;
          padding: 10px !important;
        }
        .header {
          padding: 15px 10px !important;
        }
        .book-header {
          flex-direction: column !important;
          align-items: center !important;
        }
        .book-header a {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          text-decoration: none !important;
        }
        .book-image {
          width: 100% !important;
          max-width: 200px !important;
          margin: 0 auto 5px !important;
        }
        .book-details {
          width: 100% !important;
          text-align: center !important;
        }
        .price-info {
          padding: 8px !important;
        }
        .details-grid {
          grid-template-columns: 1fr !important;
          gap: 4px !important;
        }
        .detail-item {
          margin-bottom: 3px !important;
          font-size: 13px !important;
        }
        .details-section {
          padding: 10px !important;
          margin-top: 10px !important;
        }
        .details-section h4 {
          font-size: 0.9em !important;
          margin-bottom: 8px !important;
        }
        /* Force table to not be like tables anymore */
        table, tbody, tr, td {
          display: block !important;
          width: 100% !important;
        }
        /* Hide table headers */
        thead tr {
          position: absolute !important;
          top: -9999px !important;
          left: -9999px !important;
        }
        td {
          position: relative !important;
          padding-left: 0 !important;
        }
      }
    </style>
  </head>
  <body>
    <table width="100%" border="0" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <div class="container">
            <div class="header">
              <h1>¡Libro de vuelta en stock!</h1>
              <p>Un libro que estabas siguiendo está disponible nuevamente</p>
            </div>
            <div class="content">
              <h2>Hola ${user.name},</h2>
              <p>¡Buenas noticias! El libro que estabas siguiendo está disponible nuevamente:</p>
              
              <div class="book-info">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" class="book-header">
                  <tr>
                    <td style="vertical-align: top; width: 120px;">
                      <a href="${link}?afiliado=2b8de09ad3e4e4a8bdd4" target="_blank" style="text-decoration: none; color: inherit;">
                        <table border="0" cellspacing="0" cellpadding="0" style="width: 100%;">
                          <tr>
                            <td style="text-align: center;">
                              <img src="${imageUrl}" alt="${title}" class="book-image" style="width: 120px; height: auto; margin-bottom: 5px;">
                            </td>
                          </tr>
                          <tr>
                            <td style="text-align: center;">
                              <span class="image-click-hint" style="display: block; text-align: center; font-size: 11px; color: #666; font-style: italic;">Click en la imagen para ver el libro</span>
                            </td>
                          </tr>
                        </table>
                      </a>
                    </td>
                    <td style="vertical-align: top; padding-left: 15px;">
                      <div class="book-details">
                        <h3 class="book-title">${title}</h3>
                        <p class="book-author">Autor: ${author}</p>
                        <span class="back-in-stock">¡DE VUELTA EN STOCK!</span>
                      </div>
                    </td>
                  </tr>
                </table>
                
                ${description ? `<div class="book-description">${description.substring(0, 150)}${description.length > 150 ? '...' : ''}</div>` : ''}
                
                <div class="price-info">
                  <span class="price-label">Precio actual:</span>
                  <span class="price-value" style="text-align: right;">${formattedCurrentPrice}</span>
                </div>
                
                ${lowestPriceHTML}
                
                ${details ? `
                <div class="details-section">
                  <h4 style="margin-bottom: 10px; color: #004E59; font-size: 1em;">Detalles del libro:</h4>
                  <div class="details-grid">
                    ${formattedBookDetails}
                  </div>
                </div>` : ''}
              </div>
              
              <p>No pierdas esta oportunidad de adquirir este libro antes de que se agote nuevamente.</p>
              
              <div style="text-align: center;">
                <a href="${link}?afiliado=2b8de09ad3e4e4a8bdd4" class="button">Ver Libro</a>
              </div>
            </div>
            <div class="footer">
              <p>Este correo fue enviado el ${today} por Ahorro Libro.</p>
              <p>Si no deseas recibir más notificaciones, puedes actualizar <a href="https://ahorrolibro.cl/profile" style="color: #004E59; text-decoration: underline;">tus preferencias</a> en tu perfil.</p>
            </div>
          </div>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};
