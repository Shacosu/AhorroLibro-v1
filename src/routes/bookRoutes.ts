import express from 'express';
import { getAllBooks, monitorAndProcessLists, addUserList, monitorBooks, addBookToUser, getBookById } from '../controllers/bookController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Rutas protegidas que requieren autenticación
router.route('/').get(authenticateToken, getAllBooks);

// Rutas específicas (deben ir antes de las rutas con parámetros dinámicos)
router.route('/processLists').get(monitorAndProcessLists);
router.route('/addList').post(addUserList);
router.route('/monitorBooks').get(monitorBooks);
router.route('/add-book').post(addBookToUser);

// Rutas con parámetros dinámicos (deben ir después de las rutas específicas)
router.route('/:id').get(authenticateToken, getBookById);

export default router;
