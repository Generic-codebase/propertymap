import { Router } from 'express';
import { cities, suburbs } from '../seed.js';

const router = Router();

router.get('/', (req, res) => {
  const { region_id } = req.query;
  const filtered = region_id
    ? cities.filter(c => c.region_id === Number(region_id))
    : cities;
  res.json([...filtered].sort((a, b) => b.median_price - a.median_price));
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const city = cities.find(c => c.id === id);
  if (!city) return res.status(404).json({ error: 'City not found' });
  const citySuburbs = suburbs
    .filter(s => s.city_id === id)
    .sort((a, b) => b.median_price - a.median_price);
  res.json({ ...city, suburbs: citySuburbs });
});

export default router;
