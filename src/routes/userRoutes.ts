import express from 'express';
import { createUser, getAllUsers, getUserById, login, logout, refreshToken, getCurrentUser, updateUser } from '../controllers/userController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Rutas públicas
router.route('/login').post(login);
router.route('/create').post(createUser);
router.route('/refresh-token').post(refreshToken);

// Ruta para cerrar sesión (requiere autenticación)
router.route('/logout').post(authenticateToken, logout);

// Ruta para obtener el usuario actual
router.route('/me').get(authenticateToken, getCurrentUser);

// Rutas protegidas que requieren autenticación
router.route('/').get(authenticateToken, getAllUsers);
router.route('/:id').get(authenticateToken, getUserById);
// Ruta para actualizar usuario
router.route('/:id').put(authenticateToken, updateUser);

export default router;
