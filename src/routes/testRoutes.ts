import { Router } from 'express';
import { sendDiscountEmail } from '../utils/emailUtils';
import { Plan } from '@prisma/client';

const router = Router();

// Endpoint temporal para probar el envío de email de descuento
router.post('/send-discount-email', async (req, res) => {
  // Puedes modificar estos datos de prueba según necesites
  const testBook = {
    title: 'Visiones de Carne y Sangre',
    author: 'Jennifer L. Armentrout Rayvn Salvador',
    imageUrl: 'https://images.cdn1.buscalibre.com/fit-in/360x360/db/b7/dbb7adb55dcc97f7389a4ad63258e659.jpg',
    currentPrice: 21380,
    lastPrice: 26330,
    discount: 18.8,
    link: 'https://www.buscalibre.cl/libro-visiones-de-carne-y-sangre/9788417421190/p/63310162',
    description: 'El libro que tienes en tus manos es una completa guía que acompaña a las sagas. Escenas inéditas, momentos únicos y spicy con ilustraciones. De sangre...',
    details: 'ISBN: 9788417421190, Editorial: Puck, Páginas: 600',
    previousPrices: [
      { price: 26330, date: new Date('2025-04-18') },
      { price: 26480, date: new Date('2025-04-18') },
      { price: 26330, date: new Date('2025-04-17') }
    ],
    lowestPrice: 18140,
    lowestPriceDate: new Date('2025-03-04'),
    priceHistory: [
      { id: 1, bookId: 1, price: 26330, date: new Date('2025-04-18') },
      { id: 2, bookId: 1, price: 26480, date: new Date('2025-04-18') },
      { id: 3, bookId: 1, price: 26330, date: new Date('2025-04-17') }
    ]
  };

  const testUser = {
    id: 1,
    email: req.body.email || 'sh4c0p@gmail.com',
    name: 'Pablo',
    lastname: 'Prueba',
    password: 'dummyhash',
    username: 'pabloprueba',
    profileImage: null,
    phone: null,
    createdAt: new Date(),
    plan: Plan.PREMIUM,
    planStart: new Date(),
    planEnd: null,
    discountPercentage: 0
  };

  try {
    await sendDiscountEmail(testBook, testUser);
    res.json({ success: true, message: 'Correo de descuento enviado (revisa tu bandeja de entrada y spam).' });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
