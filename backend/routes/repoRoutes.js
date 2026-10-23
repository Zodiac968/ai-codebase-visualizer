import express from 'express';
import {
  addRepository,
  getGraph,
  getFile,
  getRecent,
  generateEmbeddings,
  generateVectors,
  searchHybrid,
  searchContext,
  askQuestion,
} from '../controllers/repoController.js';

const router = express.Router();

router.post('/analyze', addRepository);
router.get('/recent', getRecent);
router.get('/:id/graph', getGraph);
router.get('/:id/file', getFile);

// Phase 4.x: Embedding and Search Routes
router.post('/:id/embeddings/generate', generateEmbeddings);
router.post('/:id/vectors/generate', generateVectors);
router.post('/:id/search/hybrid', searchHybrid);
router.post('/:id/search/context', searchContext);

// Phase 4.6: Retrieval-augmented Q&A
router.post('/:id/qa', askQuestion);

export default router;