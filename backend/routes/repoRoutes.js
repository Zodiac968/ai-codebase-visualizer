import express from 'express';
import {
  addRepository,
  getGraph,
  getFile,
  getRecent,
} from '../controllers/repoController.js';

const router = express.Router();

router.post('/analyze', addRepository);
router.get('/recent', getRecent);
router.get('/:id/graph', getGraph);
router.get('/:id/file', getFile);

export default router;