import { Router } from 'express';
import { regions, cities } from '../seed.js';

const router = Router();

router.get('/', (_req, res) => {
  const sorted = [...regions].sort((a, b) => b.median_price - a.median_price);
  res.json(sorted);
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const region = regions.find(r => r.id === id);
  if (!region) return res.status(404).json({ error: 'Region not found' });
  const regionCities = cities
    .filter(c => c.region_id === id)
    .sort((a, b) => b.median_price - a.median_price);
  res.json({ ...region, cities: regionCities });
});

export default router;
