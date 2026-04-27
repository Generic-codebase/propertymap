export default function Controls({ darkMode, onToggleDark, onZoomIn, onZoomOut, onFlyToNZ, zoomLevel, lastUpdated }) {
  const levelLabel = { world: 'World', region: 'Regions', city: 'Cities', suburb: 'Suburbs' }[zoomLevel] ?? '';

  return (
    <>
      {/* Top bar */}
      <div className={`topbar ${darkMode ? 'dark' : 'light'}`}>
        <div className="topbar-brand">
          <div className="brand-dot" />
          <span className="brand-title">PropertyMap <span className="brand-nz">NZ</span></span>
        </div>

        <div className="topbar-right">
          {zoomLevel && (
            <div className={`zoom-badge ${darkMode ? 'dark' : 'light'}`}>
              {levelLabel}
            </div>
          )}

          <button
            className={`icon-btn ${darkMode ? 'dark' : 'light'}`}
            onClick={onFlyToNZ}
            title="Fly to New Zealand"
            aria-label="Fly to New Zealand"
          >
            🇳🇿
          </button>

          <button
            className={`icon-btn ${darkMode ? 'dark' : 'light'}`}
            onClick={onToggleDark}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle dark mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Zoom controls */}
      <div className={`zoom-controls ${darkMode ? 'dark' : 'light'}`}>
        <button className="zoom-btn" onClick={onZoomIn} aria-label="Zoom in">+</button>
        <div className="zoom-divider" />
        <button className="zoom-btn" onClick={onZoomOut} aria-label="Zoom out">−</button>
      </div>

      {/* Last updated */}
      {lastUpdated && (
        <div className={`updated-badge ${darkMode ? 'dark' : 'light'}`}>
          Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      {/* Hint */}
      <div className={`hint-badge ${darkMode ? 'dark' : 'light'}`}>
        Drag to rotate · Scroll to zoom · Click suburb bars for details
      </div>
    </>
  );
}
