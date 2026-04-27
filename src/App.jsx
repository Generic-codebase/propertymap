import { useState, useCallback, useRef } from 'react';
import Globe from './components/Globe.jsx';
import Controls from './components/Controls.jsx';
import Legend from './components/Legend.jsx';
import PropertyPanel from './components/PropertyPanel.jsx';
import { usePropertyData } from './hooks/usePropertyData.js';

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [zoomLevel, setZoomLevel] = useState('region');
  const [selected, setSelected] = useState({ location: null, type: null });
  const globeRef = useRef(null);

  const { data, loading, lastUpdated } = usePropertyData();

  const handleSelect = useCallback((location, type) => {
    setSelected({ location, type });
  }, []);

  const handleZoomChange = useCallback((level) => {
    setZoomLevel(level);
  }, []);

  const allPrices = [
    ...data.regions.map(r => r.median_price),
    ...data.cities.map(c => c.median_price),
    ...data.suburbs.map(s => s.median_price),
  ];
  const minPrice = allPrices.length ? Math.min(...allPrices) : 300000;
  const maxPrice = allPrices.length ? Math.max(...allPrices) : 2500000;

  return (
    <div className={`app-root ${darkMode ? 'dark' : ''}`}>
      <div className="globe-container">
        {loading ? (
          <div className="loading-screen">
            <div className="loading-spinner" />
            <p className="loading-text">Loading property data…</p>
          </div>
        ) : (
          <Globe
            ref={globeRef}
            darkMode={darkMode}
            propertyData={data}
            onSelect={handleSelect}
            onZoomChange={handleZoomChange}
          />
        )}
      </div>

      <Controls
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        onZoomIn={() => globeRef.current?.zoomIn()}
        onZoomOut={() => globeRef.current?.zoomOut()}
        onFlyToNZ={() => globeRef.current?.flyToNZ()}
        zoomLevel={zoomLevel}
        lastUpdated={lastUpdated}
      />

      <Legend darkMode={darkMode} minPrice={minPrice} maxPrice={maxPrice} />

      <PropertyPanel
        location={selected.location}
        type={selected.type}
        darkMode={darkMode}
        onClose={() => setSelected({ location: null, type: null })}
      />
    </div>
  );
}
