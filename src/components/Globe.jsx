import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { GlobeEngine } from '../engine/GlobeEngine.js';

const Globe = forwardRef(function Globe({ darkMode, propertyData, onSelect, onZoomChange }, ref) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);

  useImperativeHandle(ref, () => ({
    zoomIn: () => engineRef.current?.zoomIn(),
    zoomOut: () => engineRef.current?.zoomOut(),
    flyToNZ: () => engineRef.current?.flyToNZ(),
  }));

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new GlobeEngine(containerRef.current, {
      darkMode,
      onSelect,
      onZoomChange,
    });
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setDarkMode(darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (propertyData && engineRef.current) {
      engineRef.current.updatePropertyData(propertyData);
    }
  }, [propertyData]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ cursor: 'grab' }}
    />
  );
});

export default Globe;
