import express from 'express';
import { getAllBooks, monitorAndProcessLists, addUserList, monitorBooks, addBookToUser } from '../controllers/bookController';

const router = express.Router();

router.route('/').get(getAllBooks);
router.route('/processLists').get(monitorAndProcessLists);
router.route('/addList').post(addUserList);
router.route('/monitorBooks').get(monitorBooks);
router.route('/add-book').post(addBookToUser);

export default router;
