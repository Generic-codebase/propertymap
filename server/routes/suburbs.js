import { Router } from 'express';
import { suburbs } from '../seed.js';

const router = Router();

router.get('/', (req, res) => {
  const { city_id } = req.query;
  const filtered = city_id
    ? suburbs.filter(s => s.city_id === Number(city_id))
    : suburbs;
  res.json([...filtered].sort((a, b) => b.median_price - a.median_price));
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const suburb = suburbs.find(s => s.id === id);
  if (!suburb) return res.status(404).json({ error: 'Suburb not found' });
  res.json(suburb);
});

export default router;
