import { Router } from 'express';
import { getDb } from '../database.js';

const router = Router();

router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM regions ORDER BY median_price DESC').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const region = db.prepare('SELECT * FROM regions WHERE id = ?').get(req.params.id);
  if (!region) return res.status(404).json({ error: 'Region not found' });
  const cities = db.prepare('SELECT * FROM cities WHERE region_id = ? ORDER BY median_price DESC').all(req.params.id);
  res.json({ ...region, cities });
});

export default router;
