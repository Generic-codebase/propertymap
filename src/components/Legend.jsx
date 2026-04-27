import { priceToColor, formatPrice } from '../engine/utils.js';

const STEPS = 6;

export default function Legend({ minPrice, maxPrice, darkMode }) {
  if (!minPrice || !maxPrice) return null;

  const stops = Array.from({ length: STEPS }, (_, i) => {
    const t = i / (STEPS - 1);
    const price = Math.round(minPrice + t * (maxPrice - minPrice));
    const { hex } = priceToColor(price, minPrice, maxPrice);
    return { price, hex };
  });

  const gradient = `linear-gradient(to right, ${stops.map(s => s.hex).join(', ')})`;

  return (
    <div className={`legend-card ${darkMode ? 'dark' : 'light'}`}>
      <div className="legend-title">Median Price</div>
      <div className="legend-bar" style={{ background: gradient }} />
      <div className="legend-labels">
        <span>{formatPrice(minPrice)}</span>
        <span>{formatPrice((minPrice + maxPrice) / 2)}</span>
        <span>{formatPrice(maxPrice)}</span>
      </div>
    </div>
  );
}
