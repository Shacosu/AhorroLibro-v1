import express from 'express';
import { createUser, getAllUsers, getUserById } from '../controllers/userController';

const router = express.Router();

router.route('/').get(getAllUsers);
router.route('/:id').get(getUserById);
router.route('/create').post(createUser);

export default router;
