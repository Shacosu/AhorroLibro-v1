import express from 'express';
import { getAllBooks, monitorAndProcessLists, addUserList, monitorBooks, addBookToUser, getBookById } from '../controllers/bookController';
import { authenticateToken } from '../middleware/auth';
import { cacheMiddleware, clearCacheMiddleware, getBookCacheKey, getBooksListCacheKey, CACHE_KEYS } from '../utils/cache-utils';

const router = express.Router();

// Rutas protegidas que requieren autenticación
router.route('/').get(
  authenticateToken, 
  cacheMiddleware(req => getBooksListCacheKey(req.query)),
  getAllBooks
);

// Rutas específicas (deben ir antes de las rutas con parámetros dinámicos)
router.route('/processLists').get(monitorAndProcessLists);
router.route('/addList').post(
  clearCacheMiddleware(`${CACHE_KEYS.BOOKS_LIST}*`),
  addUserList
);
router.route('/monitorBooks').get(monitorBooks);
router.route('/add-book').post(
  clearCacheMiddleware(`${CACHE_KEYS.BOOKS_LIST}*`),
  addBookToUser
);

// Rutas con parámetros dinámicos (deben ir después de las rutas específicas)
router.route('/:id').get(
  authenticateToken, 
  cacheMiddleware(req => getBookCacheKey(req.params.id)),
  getBookById
);

export default router;
