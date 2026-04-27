import * as THREE from 'three';
import { latLonToUV, priceToColor } from './utils.js';

const W = 4096;
const H = 2048;

export class HeatmapLayer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.needsUpdate = true;

    const geo = new THREE.SphereGeometry(1.003, 64, 64);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 1;
  }

  update(dataPoints, zoomLevel) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    if (!dataPoints || dataPoints.length === 0) return;

    const prices = dataPoints.map(d => d.median_price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    // Base radius inversely proportional to zoom: wide blobs at world level, tight at suburb
    const baseRadius = zoomLevel === 'world' ? 180
      : zoomLevel === 'region' ? 120
      : zoomLevel === 'city' ? 60
      : 30;

    for (const point of dataPoints) {
      const { x, y } = latLonToUV(point.lat, point.lon, W, H);
      const { r, g, b } = priceToColor(point.median_price, minPrice, maxPrice);

      const grad = ctx.createRadialGradient(x, y, 0, x, y, baseRadius);
      grad.addColorStop(0, `rgba(${r},${g},${b},0.75)`);
      grad.addColorStop(0.4, `rgba(${r},${g},${b},0.35)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    this.texture.needsUpdate = true;
  }

  setVisible(v) {
    this.mesh.visible = v;
  }

  dispose() {
    this.texture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
