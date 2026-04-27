import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { regions, cities, suburbs } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'propertymap.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    seedIfEmpty();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      median_price INTEGER NOT NULL,
      avg_price INTEGER NOT NULL,
      sales_volume INTEGER NOT NULL,
      price_change_pct REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cities (
      id INTEGER PRIMARY KEY,
      region_id INTEGER NOT NULL REFERENCES regions(id),
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      median_price INTEGER NOT NULL,
      avg_price INTEGER NOT NULL,
      sales_volume INTEGER NOT NULL,
      price_change_pct REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suburbs (
      id INTEGER PRIMARY KEY,
      city_id INTEGER NOT NULL REFERENCES cities(id),
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      median_price INTEGER NOT NULL,
      avg_price INTEGER NOT NULL,
      sales_volume INTEGER NOT NULL,
      days_on_market INTEGER NOT NULL,
      price_change_pct REAL NOT NULL,
      price_per_sqm INTEGER NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as n FROM regions').get();
  if (count.n > 0) return;

  const insertRegion = db.prepare(
    'INSERT INTO regions (id, name, lat, lon, median_price, avg_price, sales_volume, price_change_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertCity = db.prepare(
    'INSERT INTO cities (id, region_id, name, lat, lon, median_price, avg_price, sales_volume, price_change_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertSuburb = db.prepare(
    'INSERT INTO suburbs (id, city_id, name, lat, lon, median_price, avg_price, sales_volume, days_on_market, price_change_pct, price_per_sqm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const seedAll = db.transaction(() => {
    for (const r of regions) {
      insertRegion.run(r.id, r.name, r.lat, r.lon, r.median_price, r.avg_price, r.sales_volume, r.price_change_pct);
    }
    for (const c of cities) {
      insertCity.run(c.id, c.region_id, c.name, c.lat, c.lon, c.median_price, c.avg_price, c.sales_volume, c.price_change_pct);
    }
    for (const s of suburbs) {
      insertSuburb.run(s.id, s.city_id, s.name, s.lat, s.lon, s.median_price, s.avg_price, s.sales_volume, s.days_on_market, s.price_change_pct, s.price_per_sqm);
    }
  });

  seedAll();
  console.log('Database seeded with NZ property data.');
}
