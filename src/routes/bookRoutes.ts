import express from 'express';
import { 
  getAllBooks, 
  monitorAndProcessLists, 
  addUserList, 
  monitorBooks, 
  addBookToUser, 
  getBookById, 
  searchBooks, 
  getBooksRanking,
  unlinkBookFromUser 
} from '../controllers/bookController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.route('/').get(
  authenticateToken,
  getAllBooks
);
router.route('/processLists').get(monitorAndProcessLists);
router.route('/addList').post(
  addUserList
);
router.route('/monitorBooks').get(monitorBooks);
router.route('/add-book').post(
  addBookToUser
);
router.route('/search').get(
  authenticateToken,
  searchBooks
);
router.route('/ranking').get(getBooksRanking);
router.route('/unlink-book').delete(
  authenticateToken,
  unlinkBookFromUser
);
router.route('/:id').get(
  authenticateToken, 
  getBookById
);

export default router;
