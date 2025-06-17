import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { extractData, extractBookLinks } from '../utils/dataExtractor';
import { sendDiscountEmail, sendBackInStockEmail } from '../utils/emailUtils';

import Bottleneck from 'bottleneck';
import axios from 'axios';

const prisma = new PrismaClient();

const limiter = new Bottleneck({
  maxConcurrent: 5,
  strategy: Bottleneck.strategy.BLOCK,
  minTime: 200
});

// Utilidad para obtener el plan del usuario
async function getUserPlan(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user?.plan || 'FREE';
}

export const getAllBooks = async (req: Request, res: Response): Promise<void> => {
  try {
    // Obtener parámetros de paginación de la consulta
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 12;
    // Obtener el userId del token JWT (añadido por el middleware de autenticación)
    const userId = (req as any).user?.userId;

    // Validar que se tenga un userId (debería estar presente si pasó por el middleware de autenticación)
    if (!userId) {
      res.status(401).json({ error: 'No autorizado. Se requiere autenticación.' });
      return;
    }

    // Obtener el plan del usuario
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const userPlan = user?.plan || 'FREE';

    // Si no es premium, limitar a los últimos 5 libros agregados por el usuario (UserBook)
    let booksQuery;
    let totalBooks;
    if (userPlan !== 'PREMIUM') {
      // Buscar los últimos 5 UserBook del usuario, ordenados por createdAt desc
      const userBooks = await prisma.userBook.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { book: { include: { priceHistories: true, users: true } } }
      });
      booksQuery = userBooks.map(ub => ub.book);
      totalBooks = userBooks.length;
    } else {
      // Si es premium, usar paginación normal
      booksQuery = await prisma.book.findMany({
        where: {
          users: {
            some: {
              userId: userId
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          priceHistories: true,
          users: true
        }
      });
      totalBooks = await prisma.book.count({
        where: {
          users: {
            some: {
              userId: userId
            }
          }
        }
      });
    }

    // Calcular precios mínimos, descuentos, etc.
    const booksWithPriceInfo = await Promise.all(booksQuery.map(async (book: any) => {
      let minPrice = null;
      let currentPrice = book.price;
      let previousPrice = null;
      let realDiscount = null;
      let realDiscountPercentage = null;
      if (book.priceHistories && book.priceHistories.length > 0) {
        minPrice = Math.min(...book.priceHistories.map((ph: any) => ph.price));
        // Ordenar por fecha descendente
        const sortedHistory = [...book.priceHistories].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        if (sortedHistory.length > 1) {
          previousPrice = sortedHistory[1].price;
          if (previousPrice > currentPrice) {
            realDiscount = previousPrice - currentPrice;
            realDiscountPercentage = Math.round((realDiscount / previousPrice) * 100);
          }
        }
      }
      const { priceHistories, ...bookData } = book;
      return {
        ...bookData,
        minPrice,
        currentPrice,
        previousPrice,
        realDiscount,
        realDiscountPercentage
      };
    }));

    // Calcular nextPage y previousPage solo para premium
    let pagination = undefined;
    if (userPlan === 'PREMIUM') {
      const totalPages = Math.ceil(totalBooks / pageSize);
      const nextPage = page < totalPages ? page + 1 : null;
      const previousPage = page > 1 ? page - 1 : null;
      pagination = {
        totalItems: totalBooks,
        totalPages,
        currentPage: page,
        pageSize,
        nextPage,
        previousPage
      };
    }

    // Enviar respuesta con paginación para premium o solo datos para free
    res.json({
      data: booksWithPriceInfo,
      ...(pagination ? { pagination } : {})
    });
  } catch (error) {
    console.error('Error al obtener libros:', error);
    res.status(500).json({ error: 'Error al obtener libros' });
  }
};

export const addBookToUser = async (req: Request, res: Response) => {
  const { userId, bookUrl } = req.body;
  if (!userId || !bookUrl) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    // Comprobar el plan del usuario
    const plan = await getUserPlan(Number(userId));
    if (plan === 'FREE') {
      const userBookCount = await prisma.userBook.count({ where: { userId: Number(userId) } });
      if (userBookCount >= 5) {
        res.status(403).json({ error: 'El plan Básico solo permite monitorear hasta 5 libros.' });
        return;
      }
    }
    // Fetch the book data from the URL
    const response = await axios.get(bookUrl);
    const bookData = extractData(response.data as string, bookUrl);

    // Check if the book already exists
    let book = await prisma.book.findUnique({
      where: { isbn13: bookData.isbn13 },
    });

    // If the book doesn't exist, create it
    if (!book) {
      book = await prisma.book.create({
        data: bookData,
      });
    }

    // Check if the book is already linked to the user
    const existingUserBook = await prisma.userBook.findUnique({
      where: {
        userId_bookId: {
          userId: Number(userId),
          bookId: book.id,
        },
      },
    });

    if (existingUserBook) {
      res.status(200).json({ message: 'Book is already linked to the user' });
      return;
    }

    // Add the book to the user
    const userBook = await prisma.userBook.create({
      data: {
        user: {
          connect: { id: Number(userId) },
        },
        book: {
          connect: { id: book.id },
        },
      },
    });

    res.status(200).json({ message: 'Book added to user successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error adding book to user' });
  }
};

export const addUserList = async (req: Request, res: Response) => {
  const { userId, urlList } = req.body;
  if (!userId || !urlList) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    // Comprobar el plan del usuario
    const plan = await getUserPlan(Number(userId));
    if (plan === 'FREE') {
      res.status(403).json({ error: 'El plan Básico no permite importar listas.' });
      return;
    }
    // Create a new user list
    let newUserList;
    try {
      newUserList = await prisma.userList.create({
        data: {
          urlList,
          user: {
            connect: { id: Number(userId) },
          },
        },
      });
    } catch (error: any) {
      // Manejar error de duplicado (código de error Prisma: P2002)
      if (error.code === 'P2002' && error.meta && error.meta.target && error.meta.target.includes('userId_urlList')) {
        res.status(409).json({ error: 'Esta lista ya ha sido agregada por este usuario.' });
        return;
      }
      // Otros errores
      res.status(500).json({ error: 'Error agregando la lista (DB)' });
      return;
    }

    // Procesar inmediatamente la nueva lista agregada
    try {
      const bookLinks = await extractBookLinks(urlList);
      const currentUserBooks = await prisma.userBook.findMany({
        where: { userId: Number(userId) },
        include: { book: true },
      });
      const currentBookIsbns = currentUserBooks.map((ub) => ub.book.isbn13);
      const currentUserBooksMap = new Map(currentUserBooks.map((ub) => [ub.book.isbn13, ub]));
      // Procesar cada enlace de libro
      await Promise.all(bookLinks.map(async (bookLink) => {
        try {
          const bookResponse = await limiter.schedule(() => axios.get(bookLink));
          const bookData = extractData(bookResponse.data as string, bookLink);
          let book = await prisma.book.findUnique({ where: { isbn13: bookData.isbn13 } });
          if (!book) {
            book = await prisma.book.create({ data: bookData });
          }
          const userBook = currentUserBooksMap.get(bookData.isbn13);
          if (!userBook) {
            await prisma.userBook.create({
              data: {
                user: { connect: { id: Number(userId) } },
                book: { connect: { id: book.id } },
                from_list: true,
              },
            });
          }
        } catch (error) {
          console.error('Error processing book link during addUserList:', error);
        }
      }));
    } catch (error) {
      console.error('Error processing list immediately after addUserList:', error);
    }

    res.status(201).json({ message: 'List added and processed successfully', newUserList });
  } catch (error) {
    res.status(500).json({ error: 'Error adding list' });
  }
};

export const monitorAndProcessLists = async (req: Request, res: Response) => {
  try {
    // Fetch all user lists
    const userLists = await prisma.userList.findMany({
      include: { user: true },
    });

    console.log(`Total user lists: ${userLists.length}`);
    
    // Crear un array de promesas para procesar las listas en paralelo
    const listProcessingPromises = userLists.map(async (userList) => {
      try {
        console.log(`Starting to process list for user ${userList.userId}`);
        const bookLinks = await extractBookLinks(userList.urlList);
        console.log(`Processing list for user ${userList.userId} with ${bookLinks.length} books`);
        
        // Get current user books
        const currentUserBooks = await prisma.userBook.findMany({
          where: { userId: userList.userId },
          include: { book: true },
        });

        const currentBookIsbns = currentUserBooks.map((ub) => ub.book.isbn13);
        const currentUserBooksMap = new Map(currentUserBooks.map((ub) => [ub.book.isbn13, ub]));

        // Procesar cada enlace de libro en paralelo
        const bookProcessingPromises = bookLinks.map(async (bookLink) => {
          try {
            console.log(`Scheduling fetch for book data from ${bookLink}`);
            const bookResponse = await limiter.schedule(() => axios.get(bookLink));
            const bookData = extractData(bookResponse.data as string, bookLink);

            // Check if the book already exists
            let book = await prisma.book.findUnique({
              where: { isbn13: bookData.isbn13 },
            });

            // If the book doesn't exist, create it
            if (!book) {
              console.log(`Book with ISBN ${bookData.isbn13} does not exist. Creating new entry.`);
              book = await prisma.book.create({
                data: bookData,
              });
            } else {
              console.log(`Book with ISBN ${bookData.isbn13} already exists.`);
            }

            // Link the book to the user if not already linked via lista
            const userBook = currentUserBooksMap.get(bookData.isbn13);
            if (!userBook) {
              console.log(`Linking book with ISBN ${bookData.isbn13} to user ${userList.userId}`);
              await prisma.userBook.create({
                data: {
                  user: {
                    connect: { id: userList.userId },
                  },
                  book: {
                    connect: { id: book.id },
                  },
                  from_list: true,
                },
              });
            }

            return { bookLink, isbn13: bookData.isbn13, status: 'processed' };
          } catch (error) {
            console.error(`Error processing book link ${bookLink}:`, error);
            return { bookLink, status: 'error', error };
          }
        });

        // Esperar a que se procesen todos los libros de esta lista
        const bookResults = await Promise.all(bookProcessingPromises);
        
        // Unlink books that are no longer in the list, SOLO los que fueron agregados por lista
        const bookLinksSet = new Set(bookLinks);
        for (const userBook of currentUserBooks) {
          if (userBook.from_list && !bookLinksSet.has(userBook.book.link)) {
            await prisma.userBook.delete({
              where: {
                userId_bookId: {
                  userId: userList.userId,
                  bookId: userBook.bookId,
                },
              },
            });
          }
        }
        
        console.log(`Finished processing list for user ${userList.userId}`);
        return { 
          userId: userList.userId, 
          status: 'processed',
          booksProcessed: bookResults.filter(r => r.status === 'processed').length,
          booksWithErrors: bookResults.filter(r => r.status === 'error').length
        };
      } catch (error) {
        console.error(`Error processing list for user ${userList.userId}:`, error);
        return { userId: userList.userId, status: 'error', error };
      }
    });

    // Esperar a que todas las listas se procesen
    const results = await Promise.all(listProcessingPromises);

    console.log('All lists processed successfully');
    res.status(200).json({ 
      message: 'All lists processed successfully',
      listsProcessed: results.filter(r => r.status === 'processed').length,
      listsWithErrors: results.filter(r => r.status === 'error').length,
      details: results
    });
  } catch (error) {
    console.error('Error processing lists:', error);
    res.status(500).json({ error: 'Error processing lists' });
  }
};

export const monitorBooks = async (req: Request, res: Response) => {
  try {
    console.log(`[${new Date().toISOString()}] monitorBooks: Starting book monitoring process`);
    const books = await prisma.book.findMany({
      include: {
        users: {
          include: {
            user: true,
          },
        },
      },
    });
    console.log(`[${new Date().toISOString()}] monitorBooks: Total books to monitor: ${books.length}`);
    
    // Crear un array de promesas para procesar los libros en paralelo
    const bookProcessingPromises = books.map(async (book) => {
      try {
        console.log(`[${new Date().toISOString()}] monitorBooks: Processing book: ${book.title}, ISBN: ${book.isbn13}`);
        console.log(`[${new Date().toISOString()}] monitorBooks: Fetching data from URL: ${book.link}`);
        // Usar limiter.schedule para controlar la concurrencia
        const bookResponse = await limiter.schedule(() => axios.get(book.link));
        console.log(`[${new Date().toISOString()}] monitorBooks: Response received for ${book.isbn13}, status: ${bookResponse.status}`);
        
        const bookData = extractData(bookResponse.data as string, book.link);
        console.log(`[${new Date().toISOString()}] monitorBooks: Data extracted for ${book.isbn13}, price: ${bookData.price}`);
        
        // Verificar si el libro está en stock (disponible) basado en el precio
        const inStock = bookData.price > 0;
        console.log(`[${new Date().toISOString()}] monitorBooks: Book ${book.isbn13} in stock status: ${inStock}`);

        console.log(`[${new Date().toISOString()}] monitorBooks: Fetching price history for book ${book.isbn13}`);
        const lastPriceHistory = await prisma.priceHistory.findFirst({
          where: { bookId: book.id },
          orderBy: { date: 'desc' },
        });
        
        const lastPrice = lastPriceHistory ? lastPriceHistory.price : book.price;
        console.log(`[${new Date().toISOString()}] monitorBooks: Last recorded price for ${book.isbn13}: ${lastPrice}, current DB price: ${book.price}`);

        if (bookData.price !== lastPrice) {
          console.log(`[${new Date().toISOString()}] monitorBooks: PRICE CHANGE DETECTED for ${book.isbn13}. Old price: ${lastPrice}, New price: ${bookData.price}`);
          
          // Actualizar el precio en la tabla principal del libro
          console.log(`[${new Date().toISOString()}] monitorBooks: Updating main book record in DB for ${book.isbn13}`);
          try {
            await prisma.book.update({
              where: { id: book.id },
              data: { price: bookData.price }
            });
            console.log(`[${new Date().toISOString()}] monitorBooks: Successfully updated main book record for ${book.isbn13}`);
          } catch (dbError) {
            console.error(`[${new Date().toISOString()}] monitorBooks: ERROR updating main book record:`, dbError);
            throw dbError; // Re-throw to be caught by the outer catch
          }
          
          // Registrar en el historial de precios
          console.log(`[${new Date().toISOString()}] monitorBooks: Creating price history record for ${book.isbn13}`);
          try {
            await prisma.priceHistory.create({
              data: {
                book: {
                  connect: { id: book.id },
                },
                price: bookData.price,
                date: new Date(),
              },
            });
            console.log(`[${new Date().toISOString()}] monitorBooks: Successfully created price history for ${book.isbn13}`);
          } catch (dbError) {
            console.error(`[${new Date().toISOString()}] monitorBooks: ERROR creating price history:`, dbError);
            throw dbError; // Re-throw to be caught by the outer catch
          }

          // Obtener los últimos 5 registros de precio (excluyendo el actual)
          console.log(`[${new Date().toISOString()}] monitorBooks: Fetching previous price history for ${book.isbn13}`);
          const previousPrices = await prisma.priceHistory.findMany({
            where: { bookId: book.id },
            orderBy: { date: 'desc' },
            take: 5,
            skip: 1, // skip the current price
          });
          console.log(`[${new Date().toISOString()}] monitorBooks: Found ${previousPrices.length} previous price records for ${book.isbn13}`);

          // Obtener el precio más bajo histórico (excluyendo precios 0)
          console.log(`[${new Date().toISOString()}] monitorBooks: Finding lowest historical price for ${book.isbn13}`);
          const lowestPrice = await prisma.priceHistory.findFirst({
            where: { 
              bookId: book.id,
              price: { gt: 0 } // Ignorar precios de 0 (no disponible)
            },
            orderBy: { price: 'asc' },
          });
          console.log(`[${new Date().toISOString()}] monitorBooks: Lowest historical price for ${book.isbn13}: ${lowestPrice?.price || 'none found'}`);

          // Crear objeto con la información del libro para el correo
          const bookInfo = {
            title: book.title,
            author: book.author || 'No disponible',
            imageUrl: book.imageUrl || 'https://via.placeholder.com/120x180?text=Sin+Imagen',
            currentPrice: bookData.price,
            lastPrice: lastPrice,
            discount: lastPrice - bookData.price,
            link: book.link || '#',
            description: book.description,
            details: `ISBN: ${book.isbn13}, Detalles adicionales: ${book.details || 'No disponibles'}`,
            previousPrices: previousPrices.map(ph => ({ price: ph.price, date: ph.date })),
            lowestPrice: lowestPrice ? lowestPrice.price : null,
            lowestPriceDate: lowestPrice ? lowestPrice.date : null
          };

          // Iterar sobre todos los usuarios asociados al libro
          for (const userBook of book.users) {
            const user = userBook.user;
            // Solo enviar alertas prioritarias a PREMIUM
            if (user.plan === 'PREMIUM') {
              // Verificar si el libro vuelve a estar en stock (último precio era 0 y ahora es mayor a 0)
              if (lastPrice === 0 && bookData.price > 0) {
                console.log(`[${new Date().toISOString()}] monitorBooks: BACK IN STOCK ALERT for ${book.isbn13}. Sending notification to user ${user.id} (${user.email})`);
                try {
                  sendBackInStockEmail(bookInfo, user);
                  console.log(`[${new Date().toISOString()}] monitorBooks: Successfully sent back-in-stock email for ${book.isbn13} to ${user.email}`);
                } catch (emailError) {
                  console.error(`[${new Date().toISOString()}] monitorBooks: ERROR sending back-in-stock email:`, emailError);
                }
              } 
              // Si no es vuelta en stock, verificar si hay descuento
              else if (bookData.price < lastPrice && bookData.price > 0) {
                // Calculate discount percentage
                const discount = lastPrice - bookData.price;
                const discountPercentage = (discount / lastPrice) * 100;
                const userDiscountPercentage = user.discountPercentage;
                console.log(`[${new Date().toISOString()}] monitorBooks: DISCOUNT DETECTED for ${book.isbn13}. Discount: ${discount} (${discountPercentage.toFixed(2)}%), User threshold: ${userDiscountPercentage}%`);

                // Enviar correo si el descuento supera el porcentaje configurado por el usuario
                if (discountPercentage > userDiscountPercentage) {
                  console.log(`[${new Date().toISOString()}] monitorBooks: Discount exceeds user threshold, sending email to ${user.email}`);
                  try {
                    sendDiscountEmail(bookInfo, user);
                    console.log(`[${new Date().toISOString()}] monitorBooks: Successfully sent discount email for ${book.isbn13} to ${user.email}`);
                  } catch (emailError) {
                    console.error(`[${new Date().toISOString()}] monitorBooks: ERROR sending discount email:`, emailError);
                  }
                } else {
                  console.log(`[${new Date().toISOString()}] monitorBooks: Discount does not exceed user threshold, no email sent`);
                }
              }
            }
          }
        }
        console.log(`[${new Date().toISOString()}] monitorBooks: Successfully processed book ${book.isbn13}`);
        return { isbn13: book.isbn13, status: 'processed' };
      } catch (error) {
        console.error(`[${new Date().toISOString()}] monitorBooks: ERROR processing book with ISBN ${book.isbn13}:`, error);
        return { 
          isbn13: book.isbn13, 
          status: 'error', 
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });
    
    // Esperar a que todas las promesas se resuelvan
    console.log(`[${new Date().toISOString()}] monitorBooks: Waiting for all ${bookProcessingPromises.length} book processes to complete`);
    const results = await Promise.all(bookProcessingPromises);
    
    const processedCount = results.filter(r => r.status === 'processed').length;
    const errorsCount = results.filter(r => r.status === 'error').length;
    console.log(`[${new Date().toISOString()}] monitorBooks: All books processed. Success: ${processedCount}, Errors: ${errorsCount}`);
    
    if (errorsCount > 0) {
      console.log(`[${new Date().toISOString()}] monitorBooks: Books with errors:`, 
        results.filter(r => r.status === 'error').map(r => r.isbn13).join(', '));
    }
    
    res.status(200).json({ 
      message: 'Books processed successfully',
      processed: processedCount,
      errors: errorsCount
    }); 
    return;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] monitorBooks: CRITICAL ERROR in monitor process:`, error);
    res.status(500).json({ 
      error: 'Error processing books', 
      details: error instanceof Error ? error.message : String(error)
    });
    return;
  }
};

export const getBookById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(Number(id))) {
      res.status(400).json({ error: 'ID de libro inválido' });
      return;
    }
    
    // Obtener el userId del token JWT (añadido por el middleware de autenticación)
    const userId = (req as any).user?.userId;
    
    // Validar que se tenga un userId (debería estar presente si pasó por el middleware de autenticación)
    if (!userId) {
      res.status(401).json({ error: 'No autorizado. Se requiere autenticación.' });
      return;
    }
    
    // Buscar el libro por ID
    const book = await prisma.book.findUnique({
      where: { id: Number(id) }
    });
    
    if (!book) {
      res.status(404).json({ error: 'Libro no encontrado' });
      return;
    }
    
    // Verificar si el libro pertenece al usuario
    const userBook = await prisma.userBook.findUnique({
      where: {
        userId_bookId: {
          userId: userId,
          bookId: Number(id)
        }
      }
    });
    
    // Si el usuario tiene plan premium, puede ver cualquier libro
    // Si no es premium, solo puede ver sus propios libros
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!userBook && user?.plan !== 'PREMIUM') {
      res.status(403).json({ error: 'No tienes acceso a este libro' });
      return;
    }
    
    // Obtener el historial de precios para el libro
    const priceHistory = await prisma.priceHistory.findMany({
      where: { bookId: Number(id) },
      orderBy: { date: 'asc' }
    });
    
    // Calcular el precio mínimo histórico
    let minPrice = null;
    if (priceHistory.length > 0) {
      minPrice = Math.min(...priceHistory.map(ph => ph.price));
    }
    
    // Obtener el precio actual (el más reciente del historial)
    let currentPrice = book.price; // Usar el precio almacenado en el libro como valor predeterminado
    let previousPrice = null;
    let realDiscount = null;
    let realDiscountPercentage = null;
    
    if (priceHistory.length > 0) {
      // Ordenar por fecha descendente
      const sortedHistory = [...priceHistory].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      
      // El precio actual es el más reciente
      if (sortedHistory[0]) {
        currentPrice = sortedHistory[0].price;
      }
      
      // El precio anterior es el segundo más reciente (si existe)
      if (sortedHistory.length > 1) {
        previousPrice = sortedHistory[1].price;
        
        // Calcular el descuento real y el porcentaje
        if (previousPrice > currentPrice) {
          realDiscount = previousPrice - currentPrice;
          realDiscountPercentage = Math.round((realDiscount / previousPrice) * 100);
        }
      }
    }
    
    // Devolver el libro con su historial de precios y precio mínimo
    res.json({
      ...book,
      minPrice,
      currentPrice,
      previousPrice,
      realDiscount,
      realDiscountPercentage,
      priceHistory
    });
  } catch (error) {
    console.error('Error al obtener libro por ID:', error);
    res.status(500).json({ error: 'Error al obtener el libro' });
  }
};

// Buscar libros por nombre (no estricto, insensible a mayúsculas/minúsculas, solo del usuario autenticado)
export const searchBooks = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { q } = req.query;
    if (!userId) {
      res.status(401).json({ error: 'No autorizado. Se requiere autenticación.' });
      return;
    }
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      res.status(400).json({ error: 'Debe proporcionar un término de búsqueda en el parámetro "q"' });
      return;
    }
    // Buscar libros con el término y traer priceHistories
    const books = await prisma.book.findMany({
      where: {
        users: { some: { userId: userId } },
      },
      orderBy: { title: 'asc' },
      take: 50, // Trae más para filtrar por acentos
      include: {
        priceHistories: {
          orderBy: { date: 'desc' },
          take: 1
        }
      }
    });

    // Función para normalizar y quitar acentos
    function normalizeText(str: string) {
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }
    const normalizedQ = normalizeText(q);
    // Filtrar manualmente los libros cuyo título normalizado incluya el término normalizado
    const filteredBooks = books.filter(book => normalizeText(book.title).includes(normalizedQ));

    // Para cada libro, calcular precios igual que en getAllBooks
    const booksWithPriceInfo = await Promise.all(filteredBooks.map(async (book: any) => {
      // Obtener historial completo para mínimo y descuento
      const priceHistory = await prisma.priceHistory.findMany({
        where: {
          bookId: book.id,
          price: { gt: 0 }
        },
        orderBy: { date: 'desc' }
      });
      let minPrice = null;
      if (priceHistory.length > 0) {
        const pricesGreaterThanZero = priceHistory.filter(ph => ph.price > 0);
        if (pricesGreaterThanZero.length > 0) {
          minPrice = Math.min(...pricesGreaterThanZero.map(ph => ph.price));
        }
      }
      const currentPrice = book.priceHistories && book.priceHistories.length > 0 ? book.priceHistories[0].price : book.price;
      let previousPrice = null;
      let realDiscount = null;
      let realDiscountPercentage = null;
      if (priceHistory.length >= 2) {
        previousPrice = priceHistory[1].price;
        if (previousPrice > currentPrice) {
          realDiscount = previousPrice - currentPrice;
          realDiscountPercentage = Math.round((realDiscount / previousPrice) * 100);
        }
      }
      const { priceHistories, ...bookData } = book;
      return {
        ...bookData,
        minPrice,
        currentPrice,
        previousPrice,
        realDiscount,
        realDiscountPercentage
      };
    }));

    res.json({ data: booksWithPriceInfo });
    return;
  } catch (error) {
    console.error('Error al buscar libros:', error);
    res.status(500).json({ error: 'Error al buscar libros' });
    return;
  }
};

// Obtener ranking global de libros por mejor descuento
export const getBooksRanking = async (req: Request, res: Response): Promise<void> => {
  try {
    // Traer todos los libros con su historial de precios
    const books = await prisma.book.findMany({
      include: {
        priceHistories: true,
        users: true
      }
    });

    // Calcular el mejor descuento real para cada libro y agregar priceHistory
    const booksWithDiscount = books.map((book: any) => {
      let maxDiscount = 0;
      let maxDiscountPercentage = 0;
      let previousPrice = null;
      let currentPrice = book.price;
      let priceHistory: number[] = book.priceHistories?.map((h: any) => h.price) || [];
      if (book.priceHistories && book.priceHistories.length > 1) {
        // Ordenar por fecha descendente
        const sortedHistory = [...book.priceHistories].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        previousPrice = sortedHistory[1].price;
        if (previousPrice > currentPrice) {
          maxDiscount = previousPrice - currentPrice;
          maxDiscountPercentage = Math.round((maxDiscount / previousPrice) * 100);
        }
      }
      return {
        ...book,
        maxDiscount,
        maxDiscountPercentage,
        previousPrice,
        currentPrice,
        priceHistory
      };
    });

    // Ordenar por mayor porcentaje de descuento
    booksWithDiscount.sort((a, b) => b.maxDiscountPercentage - a.maxDiscountPercentage);

    res.json({ data: booksWithDiscount });
  } catch (error) {
    console.error('Error al obtener ranking de libros:', error);
    res.status(500).json({ error: 'Error al obtener ranking de libros' });
  }
};

// Desvincular (eliminar) un libro del usuario
export const unlinkBookFromUser = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId || req.body.userId || req.params.userId;
    const { bookId, isbn13 } = req.body.bookId ? req.body : req.params;
    if (!userId || (!bookId && !isbn13)) {
      res.status(400).json({ error: 'Faltan parámetros userId o bookId/isbn13' });
      return;
    }
    let targetBookId = bookId;
    if (!targetBookId && isbn13) {
      const book = await prisma.book.findUnique({ where: { isbn13 } });
      if (!book) {
        res.status(404).json({ error: 'Libro no encontrado' });
        return;
      }
      targetBookId = book.id;
    }
    // Verificar si existe la relación
    const userBook = await prisma.userBook.findUnique({
      where: {
        userId_bookId: {
          userId: Number(userId),
          bookId: Number(targetBookId),
        },
      },
    });
    if (!userBook) {
      res.status(404).json({ error: 'El libro no está vinculado al usuario' });
      return;
    }
    await prisma.userBook.delete({
      where: {
        userId_bookId: {
          userId: Number(userId),
          bookId: Number(targetBookId),
        },
      },
    });
    res.json({ success: true, message: 'Libro desvinculado correctamente' });
  } catch (error) {
    console.error('Error al desvincular libro del usuario:', error);
    res.status(500).json({ error: 'Error al desvincular libro del usuario' });
  }
};