import { Router } from 'express';
import { getDb } from '../database.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const { region_id } = req.query;
  const rows = region_id
    ? db.prepare('SELECT * FROM cities WHERE region_id = ? ORDER BY median_price DESC').all(region_id)
    : db.prepare('SELECT * FROM cities ORDER BY median_price DESC').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const city = db.prepare('SELECT * FROM cities WHERE id = ?').get(req.params.id);
  if (!city) return res.status(404).json({ error: 'City not found' });
  const suburbs = db.prepare('SELECT * FROM suburbs WHERE city_id = ? ORDER BY median_price DESC').all(req.params.id);
  res.json({ ...city, suburbs });
});

export default router;
