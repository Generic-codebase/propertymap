import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { latLonToVec3, priceToThreeColor, formatPrice } from './utils.js';

const MAX_BAR_HEIGHT = 0.28;
const BAR_WIDTH = 0.018;
const UP = new THREE.Vector3(0, 1, 0);

export class BarChartLayer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'bars';
    scene.add(this.group);
    this.labels = [];
    this.bars = [];
  }

  update(suburbs, minPrice, maxPrice, darkMode) {
    this.clear();
    if (!suburbs || suburbs.length === 0) return;

    for (const s of suburbs) {
      const norm = (s.median_price - minPrice) / Math.max(maxPrice - minPrice, 1);
      const height = 0.04 + norm * MAX_BAR_HEIGHT;

      const normal = latLonToVec3(s.lat, s.lon, 1).normalize();
      const basePos = normal.clone().multiplyScalar(1.004);
      const tipPos = normal.clone().multiplyScalar(1.004 + height);
      const centerPos = normal.clone().multiplyScalar(1.004 + height / 2);

      // Bar geometry
      const geo = new THREE.BoxGeometry(BAR_WIDTH, height, BAR_WIDTH);
      const color = priceToThreeColor(s.median_price, minPrice, maxPrice);
      const mat = new THREE.MeshPhongMaterial({
        color,
        emissive: color.clone().multiplyScalar(0.25),
        shininess: 80,
        transparent: true,
        opacity: 0.92,
      });
      const bar = new THREE.Mesh(geo, mat);
      bar.position.copy(centerPos);
      bar.quaternion.setFromUnitVectors(UP, normal);
      bar.userData = { suburb: s };
      this.group.add(bar);
      this.bars.push(bar);

      // Base glow disc
      const discGeo = new THREE.CircleGeometry(BAR_WIDTH * 1.4, 8);
      const discMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.copy(basePos);
      disc.quaternion.setFromUnitVectors(UP, normal);
      this.group.add(disc);

      // CSS2D label at top of bar
      const label = this._makeLabel(s, darkMode);
      label.position.copy(tipPos.clone().multiplyScalar(1.02));
      this.scene.add(label);
      this.labels.push(label);
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
      const div = label.element;
      div.className = `bar-label ${darkMode ? 'dark' : 'light'}`;
    }
  }

  setVisible(v) {
    this.group.visible = v;
    for (const l of this.labels) l.visible = v;
  }

  clear() {
    for (const l of this.labels) {
      this.scene.remove(l);
      if (l.element?.parentNode) l.element.parentNode.removeChild(l.element);
    }
    this.labels = [];
    this.bars = [];
    this.group.clear();
  }

  getBars() {
    return this.bars;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}
