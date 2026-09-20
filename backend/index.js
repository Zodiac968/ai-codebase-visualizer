import express, { json } from 'express';
import cors from 'cors';
import repoRoutes from './routes/repoRoutes.js';
import { initDb } from './config/db.js';

const app = express();
const PORT = 3000;

// Middleware
app.use(cors()); // Allows your React app to make requests to this server
app.use(json()); // Allows your server to parse JSON data sent in requests

// A basic test route
app.get('/api/health', (req, res) => {
  res.json({ message: "Server is running!" });
});

app.use('/api/repositories', repoRoutes); // Use the repoRoutes for /api/repositories

// Start the server and initialize database tables
app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  await initDb();
});