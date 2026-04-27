import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import regionsRouter from './routes/regions.js';
import citiesRouter from './routes/cities.js';
import suburbsRouter from './routes/suburbs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/regions', regionsRouter);
app.use('/api/cities', citiesRouter);
app.use('/api/suburbs', suburbsRouter);

// Serve built frontend
const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`PropertyMap running on port ${PORT}`);
});
