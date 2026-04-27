import { formatPrice } from '../engine/utils.js';

function StatRow({ label, value }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

export default function PropertyPanel({ location, type, darkMode, onClose }) {
  if (!location) return null;

  const isSuburb = type === 'suburb';
  const change = location.price_change_pct;
  const changeColor = change >= 0 ? '#4ade80' : '#f87171';
  const changeSign = change >= 0 ? '+' : '';

  return (
    <div className={`property-panel ${darkMode ? 'dark' : 'light'}`}>
      <div className="panel-header">
        <div>
          <div className="panel-type">{type?.toUpperCase() ?? 'LOCATION'}</div>
          <div className="panel-name">{location.name}</div>
        </div>
        <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="panel-price">{formatPrice(location.median_price)}</div>
      <div className="panel-price-label">Median price</div>

      <div className="panel-change" style={{ color: changeColor }}>
        {changeSign}{change?.toFixed(1)}% <span className="panel-change-period">last 12 months</span>
      </div>

      <div className="panel-divider" />

      <StatRow label="Average price" value={formatPrice(location.avg_price)} />
      <StatRow label="Sales volume" value={`${location.sales_volume?.toLocaleString()} sales`} />
      {isSuburb && (
        <>
          <StatRow label="Days on market" value={`${location.days_on_market} days avg`} />
          <StatRow label="Price per m²" value={`$${location.price_per_sqm?.toLocaleString()}/m²`} />
        </>
      )}

      <div className="panel-footer">
        Updated daily via API
      </div>
    </div>
  );
}
