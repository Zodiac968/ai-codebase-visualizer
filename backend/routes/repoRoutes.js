import express from 'express';
import { addRepository } from '../controllers/repoController.js';

const router = express.Router();

router.post('/analyze', addRepository);

export default router;