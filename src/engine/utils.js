import * as THREE from 'three';

// Converts geographic coordinates to Three.js 3D space.
// Matches the UV mapping of THREE.SphereGeometry so heat map positions align.
export function latLonToVec3(lat, lon, radius = 1) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.cos(theta)
  );
}

// Converts lat/lon to canvas UV pixel coordinates on a 2:1 equirectangular map
export function latLonToUV(lat, lon, width, height) {
  const u = (lon + 180) / 360;
  const v = (90 - lat) / 180;
  return { x: u * width, y: v * height };
}

export function formatPrice(price) {
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(2)}M`;
  if (price >= 1_000) return `$${(price / 1_000).toFixed(0)}K`;
  return `$${price}`;
}

// Maps a price to a heat map color (blue → cyan → green → yellow → red)
export function priceToColor(price, minPrice, maxPrice) {
  const t = Math.max(0, Math.min(1, (price - minPrice) / (maxPrice - minPrice)));
  let r, g, b;
  if (t < 0.25) {
    const s = t / 0.25;
    r = 0; g = Math.round(s * 200); b = 255;
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    r = 0; g = Math.round(200 + s * 55); b = Math.round(255 * (1 - s));
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    r = Math.round(s * 255); g = 255; b = 0;
  } else {
    const s = (t - 0.75) / 0.25;
    r = 255; g = Math.round(255 * (1 - s)); b = 0;
  }
  return { r, g, b, hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}` };
}

export function priceToThreeColor(price, minPrice, maxPrice) {
  const { r, g, b } = priceToColor(price, minPrice, maxPrice);
  return new THREE.Color(r / 255, g / 255, b / 255);
}
