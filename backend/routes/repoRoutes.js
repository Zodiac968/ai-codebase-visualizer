import express from 'express';
import { addRepository, getGraph } from '../controllers/repoController.js';

const router = express.Router();

router.post('/analyze', addRepository);
router.get('/:id/graph', getGraph);

export default router;