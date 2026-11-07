import express from 'express';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

import { apiRouter } from './src/server/api';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use('/api', apiRouter);

// Serve static assets from Vite build in production
const distPath = path.resolve(process.cwd(), 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ActiVix Contábil full-stack server running on http://0.0.0.0:${PORT}`);
});
