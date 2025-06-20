import { load } from 'cheerio';
import axios from 'axios';

const config = {
  title: '#data-info-libro > div > div > p.tituloProducto',
  isbn13: '#metadata-isbn13',
  imageUrl: '#imgPortada',
  price: '#detallePrecio > div.opcionForm.idx1 > strong.precio',
  discount: '#opciones > div.opcionPrecio.selected > div.colDescuento > div > span',
  author: '#data-info-libro > div > div > p.font-weight-light.margin-0.font-size-h1 > a.font-color-bl.link-underline',
  details: '#producto > div.row.product-info > div.col-xs-12.col-md-3 > div > div > div > div > div > div:nth-child(6) > div > div',
  description: '#texto-descripcion',
};

export const extractData = (html: string, link: string) => {
  const $ = load(html);
  
  // Debug logging for price extraction
  const priceElement = $(config.price);
  const priceText = priceElement.text().trim();
  const priceHtml = priceElement.html();
  console.log(`[${new Date().toISOString()}] extractData: Price element found: ${priceElement.length > 0 ? 'YES' : 'NO'}`);
  console.log(`[${new Date().toISOString()}] extractData: Price text: "${priceText}"`);
  console.log(`[${new Date().toISOString()}] extractData: Price HTML: ${priceHtml}`);
  
  // Check for alternative price selectors if the main one fails
  if (!priceText) {
    console.log(`[${new Date().toISOString()}] extractData: Primary price selector failed, trying alternatives`);
    // Try some alternative selectors that might work
    const alternativeSelectors = [
      '.precio', // Generic price class
      '.product-price',
      '.current-price',
      '[data-price]',
      '[itemprop="price"]'
    ];
    
    for (const selector of alternativeSelectors) {
      const altElement = $(selector);
      if (altElement.length > 0) {
        const altText = altElement.text().trim();
        console.log(`[${new Date().toISOString()}] extractData: Found alternative price with selector "${selector}": "${altText}"`);
      }
    }
    
    // Also log a small sample of the HTML for debugging
    console.log(`[${new Date().toISOString()}] extractData: HTML sample for debugging:`);
    const bodyHtml = $('body').html() || '';
    console.log(bodyHtml.substring(0, 500) + '...');
  }
  
  const extractedPrice = cleanCurrency(priceText) || 0;
  console.log(`[${new Date().toISOString()}] extractData: Final extracted price: ${extractedPrice}`);
  
  return {
    title: $(config.title).text().trim(),
    isbn13: $(config.isbn13).text().trim(),
    link,
    imageUrl: $(config.imageUrl).attr('data-src') || '',
    price: extractedPrice,
    discount: $(config.discount).text().trim(),
    author: $(config.author).text().trim(),
    details: cleanDetails($(config.details).text().replace(/\n\s/g, '').trim()),
    outOfStock: !extractedPrice,
    description: $(config.description).text().trim(),
  }
};

export const cleanDetails = (details: string): string => {
  return details.replace(/\s+/g, ' ').trim();
};

const cleanCurrency = (str: string) => {
  return Number(str.replace(/\D/g, ''));
};

export const extractBookLinks = async (url: string): Promise<string[]> => {
  try {
    const response = await axios.get(url);
    const html = response.data as string;
    const $ = load(html);
    return $('.portadaProducto > a').map((_, el) => $(el).attr('href') || '').get();
  } catch (error) {
    console.error('Error extracting book links:', error);
    return [];
  }
};
