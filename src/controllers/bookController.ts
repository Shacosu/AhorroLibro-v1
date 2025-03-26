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

export const getAllBooks = async (req: Request, res: Response) => {
  try {
    const books = await prisma.book.findMany();
    res.json(books);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching books' });
  }
};

export const addUserList = async (req: Request, res: Response) => {
  const { userId, urlList } = req.body;
  if (!userId || !urlList) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    // Create a new user list
    const newUserList = await prisma.userList.create({
      data: {
        urlList,
        user: {
          connect: { id: Number(userId) },
        },
      },
    });

    res.status(201).json({ message: 'List added successfully', newUserList });
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

            // Link the book to the user if not already linked
            if (!currentBookIsbns.includes(bookData.isbn13)) {
              console.log(`Linking book with ISBN ${bookData.isbn13} to user ${userList.userId}`);
              await prisma.userBook.create({
                data: {
                  user: {
                    connect: { id: userList.userId },
                  },
                  book: {
                    connect: { id: book.id },
                  },
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
        
        // Unlink books that are no longer in the list
        const bookLinksSet = new Set(bookLinks);
        for (const userBook of currentUserBooks) {
          if (!bookLinksSet.has(userBook.book.link)) {
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
    const books = await prisma.book.findMany({
      include: {
        users: {
          include: {
            user: true,
          },
        },
      },
    });
    console.log(`Total books to monitor: ${books.length}`);
    
    // Crear un array de promesas para procesar los libros en paralelo
    const bookProcessingPromises = books.map(async (book) => {
      try {
        console.log(`Scheduling check for book with ISBN ${book.isbn13}`);
        // Usar limiter.schedule para controlar la concurrencia
        const bookResponse = await limiter.schedule(() => axios.get(book.link));
        const bookData = extractData(bookResponse.data as string, book.link);

        const lastPriceHistory = await prisma.priceHistory.findFirst({
          where: { bookId: book.id },
          orderBy: { date: 'desc' },
        });

        const lastPrice = lastPriceHistory ? lastPriceHistory.price : book.price;

        if (bookData.price !== lastPrice) {
          console.log(`Price change detected for book with ISBN ${book.isbn13}. Old price: ${lastPrice}, New price: ${bookData.price}`);
          await prisma.priceHistory.create({
            data: {
              book: {
                connect: { id: book.id },
              },
              price: bookData.price,
              date: new Date(),
            },
          });

          // Obtener los últimos 5 registros de precio (excluyendo el actual)
          const previousPrices = await prisma.priceHistory.findMany({
            where: { bookId: book.id },
            orderBy: { date: 'desc' },
            take: 5,
            skip: 1, // skip the current price
          });

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
            previousPrices: previousPrices.map(ph => ({ price: ph.price, date: ph.date }))
          };

          // Iterar sobre todos los usuarios asociados al libro
          for (const userBook of book.users) {
            const user = userBook.user;
            
            // Verificar si el libro vuelve a estar en stock (último precio era 0 y ahora es mayor a 0)
            if (lastPrice === 0 && bookData.price > 0) {
              console.log(`Book with ISBN ${book.isbn13} is back in stock. Sending notification to user ${user.id}`);
              sendBackInStockEmail(bookInfo, user);
            } 
            // Si no es vuelta en stock, verificar si hay descuento
            else if (bookData.price < lastPrice) {
              // Calculate discount percentage
              const discount = lastPrice - bookData.price;
              const discountPercentage = (discount / lastPrice) * 100;
              const userDiscountPercentage = user.discountPercentage;

              // Enviar correo si el descuento supera el porcentaje configurado por el usuario
              if (discountPercentage > userDiscountPercentage) {
                sendDiscountEmail(bookInfo, user);
              }
            }
          }
        }
        return { isbn13: book.isbn13, status: 'processed' };
      } catch (error) {
        console.error(`Error processing book with ISBN ${book.isbn13}:`, error);
        return { isbn13: book.isbn13, status: 'error', error };
      }
    });
    
    // Esperar a que todas las promesas se resuelvan
    const results = await Promise.all(bookProcessingPromises);
    
    console.log('All books processed successfully');
    res.status(200).json({ 
      message: 'Books processed successfully',
      processed: results.filter(r => r.status === 'processed').length,
      errors: results.filter(r => r.status === 'error').length
    }); 
    return;
  } catch (error) {
    console.error('Error processing books', error);
    res.status(500).json({ error: 'Error processing books' });
    return;
  }
};

export const addBookToUser = async (req: Request, res: Response) => {
  const { userId, bookUrl } = req.body;
  if (!userId || !bookUrl) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
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