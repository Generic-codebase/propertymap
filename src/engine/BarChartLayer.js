import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { latLonToVec3, priceToThreeColor, formatPrice } from './utils.js';

const MAX_BAR_HEIGHT = 0.28;
const BAR_WIDTH = 0.018;
const GROW_SPEED = 0.07;
const UP = new THREE.Vector3(0, 1, 0);

export class BarChartLayer {
  constructor(parent) {
    // Parent is earthGroup so bars + labels rotate with the globe
    this.parent = parent;
    this.group = new THREE.Group();
    this.group.name = 'bars';
    parent.add(this.group);
    this.bars = [];
    this.labels = [];
  }

  update(suburbs, minPrice, maxPrice, darkMode) {
    this.clear();
    if (!suburbs || suburbs.length === 0) return;

    for (const s of suburbs) {
      const norm = (s.median_price - minPrice) / Math.max(maxPrice - minPrice, 1);
      const height = 0.04 + norm * MAX_BAR_HEIGHT;
      const normal = latLonToVec3(s.lat, s.lon, 1).normalize();
      const color = priceToThreeColor(s.median_price, minPrice, maxPrice);
      const baseEmissive = color.clone().multiplyScalar(0.25);

      // Bar — starts flat (scale.y = 0) and grows upward each tick()
      const geo = new THREE.BoxGeometry(BAR_WIDTH, height, BAR_WIDTH);
      const mat = new THREE.MeshPhongMaterial({
        color,
        emissive: baseEmissive,
        shininess: 80,
        transparent: true,
        opacity: 0.92,
      });
      const bar = new THREE.Mesh(geo, mat);
      bar.scale.y = 0.001;
      bar.position.copy(normal.clone().multiplyScalar(1.004)); // start at base
      bar.quaternion.setFromUnitVectors(UP, normal);
      bar.userData = { suburb: s, normal, height, baseNormalDist: 1.004, baseEmissive, growT: 0 };
      this.group.add(bar);
      this.bars.push(bar);

      // Base glow disc
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(BAR_WIDTH * 1.4, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false })
      );
      disc.position.copy(normal.clone().multiplyScalar(1.002));
      disc.quaternion.setFromUnitVectors(UP, normal);
      this.group.add(disc);

      // Label — child of group so it rotates with the globe
      const label = this._makeLabel(s, darkMode);
      // Position is updated each tick as the bar grows
      label.position.copy(normal.clone().multiplyScalar(1.004));
      bar.userData.label = label;
      this.group.add(label);
      this.labels.push(label);
    }
  }

  // Called every animation frame to grow bars from the surface upward
  tick() {
    for (const bar of this.bars) {
      if (bar.userData.growT >= 1) continue;
      bar.userData.growT = Math.min(1, bar.userData.growT + GROW_SPEED);
      const ease = 1 - Math.pow(1 - bar.userData.growT, 3);
      bar.scale.y = Math.max(0.001, ease);
      // Shift center position so base stays planted on the globe surface
      bar.position.copy(
        bar.userData.normal.clone().multiplyScalar(
          bar.userData.baseNormalDist + (bar.userData.height * ease) / 2
        )
      );
      // Move label to tip
      if (bar.userData.label) {
        bar.userData.label.position.copy(
          bar.userData.normal.clone().multiplyScalar(
            bar.userData.baseNormalDist + bar.userData.height * ease + 0.02
          )
        );
      }
    }
  }

  _makeLabel(suburb, darkMode) {
    const div = document.createElement('div');
    div.className = `bar-label ${darkMode ? 'dark' : 'light'}`;
    div.innerHTML = `
      <div class="bar-label-name">${suburb.name}</div>
      <div class="bar-label-price">${formatPrice(suburb.median_price)}</div>
      <div class="bar-label-sub">${suburb.days_on_market}d avg · ${suburb.sales_volume} sales</div>
    `;
    div.style.pointerEvents = 'none';
    return new CSS2DObject(div);
  }

  updateDarkMode(darkMode) {
    for (const label of this.labels) {
      label.element.className = `bar-label ${darkMode ? 'dark' : 'light'}`;
    }
  }

  setVisible(v) {
    this.group.visible = v;
  }

  getBars() {
    return this.bars;
  }

  clear() {
    for (const label of this.labels) {
      if (label.element?.parentNode) label.element.parentNode.removeChild(label.element);
    }
    this.bars = [];
    this.labels = [];
    this.group.clear();
  }

  dispose() {
    this.clear();
    this.parent.remove(this.group);
  }
}
