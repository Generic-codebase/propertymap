import { Router } from 'express';
import { getDb } from '../database.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const { city_id } = req.query;
  const rows = city_id
    ? db.prepare('SELECT * FROM suburbs WHERE city_id = ? ORDER BY median_price DESC').all(city_id)
    : db.prepare('SELECT * FROM suburbs ORDER BY median_price DESC').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const suburb = db.prepare('SELECT * FROM suburbs WHERE id = ?').get(req.params.id);
  if (!suburb) return res.status(404).json({ error: 'Suburb not found' });
  res.json(suburb);
});

export default router;
