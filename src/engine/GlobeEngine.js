import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { HeatmapLayer } from './HeatmapLayer.js';
import { BarChartLayer } from './BarChartLayer.js';
import { latLonToVec3 } from './utils.js';

// NZ geographic centre
const NZ_LAT = -41.5;
const NZ_LON = 174.0;
const ZOOM_MIN = 1.28;
const ZOOM_MAX = 5.5;
const ZOOM_START = 2.15;
const AUTO_ROTATE_SPEED = 0.00035;
const AUTO_ROTATE_RESUME_DELAY = 2800; // ms

const EARTH_DAY_URL = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg';
const EARTH_NIGHT_URL = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg';

// Atmosphere vertex/fragment shaders for blue rim glow
const ATMO_VERT = `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const ATMO_FRAG = `
uniform vec3 glowColor;
uniform float coeff;
uniform float power;
varying vec3 vNormal;
void main() {
  float intensity = pow(coeff - dot(vNormal, vec3(0.0, 0.0, 1.0)), power);
  gl_FragColor = vec4(glowColor * intensity, intensity * 0.8);
}`;

export class GlobeEngine {
  constructor(container, { darkMode = false, onSelect, onZoomChange } = {}) {
    this.container = container;
    this.darkMode = darkMode;
    this.onSelect = onSelect;
    this.onZoomChange = onZoomChange;

    this._autoRotate = true;
    this._autoRotateTimer = null;
    this._isDragging = false;
    this._prevMouse = { x: 0, y: 0 };
    this._velocity = { x: 0, y: 0 };
    this._spherical = new THREE.Spherical();
    this._zoomLevel = 'region';

    this._init();
    this._bindEvents();
    this._animate();
  }

  _init() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = false;
    this.container.appendChild(this.renderer.domElement);

    // CSS2D renderer for floating labels
    this.css2dRenderer = new CSS2DRenderer();
    this.css2dRenderer.setSize(w, h);
    this.css2dRenderer.domElement.style.position = 'absolute';
    this.css2dRenderer.domElement.style.top = '0';
    this.css2dRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.css2dRenderer.domElement);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
    const startPos = latLonToVec3(NZ_LAT, NZ_LON, ZOOM_START);
    this.camera.position.copy(startPos);
    this.camera.lookAt(0, 0, 0);
    this._spherical.setFromVector3(this.camera.position);

    // Lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(5, 3, 5);
    this.scene.add(sun);

    // Stars
    this._buildStars();

    // Globe group — all earth objects rotate together
    this.earthGroup = new THREE.Group();
    this.scene.add(this.earthGroup);

    // Globe mesh
    this._buildGlobe();

    // Atmosphere glow
    this._buildAtmosphere();

    // Heatmap overlay
    this.heatmapLayer = new HeatmapLayer();
    this.earthGroup.add(this.heatmapLayer.mesh);

    // Bar charts
    this.barChartLayer = new BarChartLayer(this.scene);

    // Background colour
    this._applyDarkMode(this.darkMode);

    // Raycaster for click selection
    this.raycaster = new THREE.Raycaster();
  }

  _buildStars() {
    const count = 8000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 50 + Math.random() * 50;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, sizeAttenuation: true })
    );
    this.scene.add(this.stars);
  }

  _buildGlobe() {
    const geo = new THREE.SphereGeometry(1, 72, 72);
    const loader = new THREE.TextureLoader();

    this.dayTexture = loader.load(EARTH_DAY_URL);
    this.nightTexture = loader.load(EARTH_NIGHT_URL);

    this.globeMaterial = new THREE.MeshPhongMaterial({
      map: this.dayTexture,
      specular: new THREE.Color(0x222222),
      shininess: 20,
    });

    this.globeMesh = new THREE.Mesh(geo, this.globeMaterial);
    this.earthGroup.add(this.globeMesh);
  }

  _buildAtmosphere() {
    const geo = new THREE.SphereGeometry(1.06, 64, 64);
    this.atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      uniforms: {
        glowColor: { value: new THREE.Color(0x4fc3f7) },
        coeff: { value: 0.6 },
        power: { value: 3.5 },
      },
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.atmosphereMesh = new THREE.Mesh(geo, this.atmosphereMaterial);
    this.scene.add(this.atmosphereMesh);
  }

  _applyDarkMode(dark) {
    this.darkMode = dark;
    this.renderer.setClearColor(dark ? 0x050a14 : 0x0d1b2a, 1);
    this.stars.material.color.set(dark ? 0xffffff : 0xaaccff);
    this.atmosphereMaterial.uniforms.glowColor.value.set(dark ? 0x4fc3f7 : 0x90caf9);
    this.barChartLayer?.updateDarkMode(dark);

    // Switch day/night texture based on mode
    if (this.globeMaterial) {
      this.globeMaterial.map = dark ? this.nightTexture : this.dayTexture;
      this.globeMaterial.needsUpdate = true;
    }
  }

  _getZoomCategory(distance) {
    if (distance > 3.5) return 'world';
    if (distance > 2.4) return 'region';
    if (distance > 1.65) return 'city';
    return 'suburb';
  }

  _animate() {
    this._rafId = requestAnimationFrame(() => this._animate());

    // Auto-rotate the earth group
    if (this._autoRotate) {
      this.earthGroup.rotation.y += AUTO_ROTATE_SPEED;
      this.heatmapLayer.mesh.rotation.y = 0; // heatmap is child of earthGroup, already rotated
    }

    // Momentum decay
    if (!this._isDragging) {
      if (Math.abs(this._velocity.x) > 0.00001 || Math.abs(this._velocity.y) > 0.00001) {
        this.earthGroup.rotation.y += this._velocity.x;
        this.earthGroup.rotation.x += this._velocity.y;
        this.earthGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.earthGroup.rotation.x));
        this._velocity.x *= 0.94;
        this._velocity.y *= 0.94;
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.css2dRenderer.render(this.scene, this.camera);
  }

  _bindEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('mousedown', this._onMouseDown.bind(this));
    window.addEventListener('mousemove', this._onMouseMove.bind(this));
    window.addEventListener('mouseup', this._onMouseUp.bind(this));
    el.addEventListener('wheel', this._onWheel.bind(this), { passive: false });
    el.addEventListener('click', this._onClick.bind(this));
    el.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: true });
    el.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: false });
    el.addEventListener('touchend', this._onTouchEnd.bind(this));
    window.addEventListener('resize', this._onResize.bind(this));
  }

  _onMouseDown(e) {
    this._isDragging = true;
    this._autoRotate = false;
    clearTimeout(this._autoRotateTimer);
    this._prevMouse = { x: e.clientX, y: e.clientY };
    this._velocity = { x: 0, y: 0 };
    this.renderer.domElement.style.cursor = 'grabbing';
  }

  _onMouseMove(e) {
    if (!this._isDragging) return;
    const dx = (e.clientX - this._prevMouse.x) * 0.004;
    const dy = (e.clientY - this._prevMouse.y) * 0.004;
    this.earthGroup.rotation.y += dx;
    this.earthGroup.rotation.x += dy;
    this.earthGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.earthGroup.rotation.x));
    this._velocity = { x: dx * 0.5, y: dy * 0.5 };
    this._prevMouse = { x: e.clientX, y: e.clientY };
  }

  _onMouseUp() {
    this._isDragging = false;
    this.renderer.domElement.style.cursor = 'grab';
    this._autoRotateTimer = setTimeout(() => { this._autoRotate = true; }, AUTO_ROTATE_RESUME_DELAY);
  }

  _onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.08 : 0.93;
    const dist = this.camera.position.length();
    const newDist = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, dist * factor));
    this.camera.position.setLength(newDist);
    this._updateZoomLevel(newDist);
  }

  _onTouchStart(e) {
    if (e.touches.length === 1) {
      this._isDragging = true;
      this._autoRotate = false;
      clearTimeout(this._autoRotateTimer);
      this._prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this._velocity = { x: 0, y: 0 };
      this._pinchDist = null;
    } else if (e.touches.length === 2) {
      this._isDragging = false;
      this._pinchDist = this._getTouchDist(e.touches);
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1 && this._isDragging) {
      const dx = (e.touches[0].clientX - this._prevMouse.x) * 0.004;
      const dy = (e.touches[0].clientY - this._prevMouse.y) * 0.004;
      this.earthGroup.rotation.y += dx;
      this.earthGroup.rotation.x += dy;
      this.earthGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.earthGroup.rotation.x));
      this._velocity = { x: dx * 0.5, y: dy * 0.5 };
      this._prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && this._pinchDist !== null) {
      const newDist = this._getTouchDist(e.touches);
      const factor = this._pinchDist / newDist;
      const camDist = this.camera.position.length();
      const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camDist * factor));
      this.camera.position.setLength(clamped);
      this._pinchDist = newDist;
      this._updateZoomLevel(clamped);
    }
  }

  _onTouchEnd(e) {
    if (e.touches.length === 0) {
      this._isDragging = false;
      this._pinchDist = null;
      this._autoRotateTimer = setTimeout(() => { this._autoRotate = true; }, AUTO_ROTATE_RESUME_DELAY);
    }
  }

  _getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _onClick(e) {
    if (!this.onSelect) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.camera);
    const bars = this.barChartLayer.getBars();
    const barHits = this.raycaster.intersectObjects(bars);
    if (barHits.length > 0) {
      this.onSelect(barHits[0].object.userData.suburb, 'suburb');
      return;
    }
    const globeHits = this.raycaster.intersectObject(this.globeMesh);
    if (globeHits.length > 0) {
      this.onSelect(null, null);
    }
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.css2dRenderer.setSize(w, h);
  }

  _updateZoomLevel(dist) {
    const newLevel = this._getZoomCategory(dist);
    if (newLevel !== this._zoomLevel) {
      this._zoomLevel = newLevel;
      this.onZoomChange?.(newLevel);
    }
  }

  // Public API
  setDarkMode(dark) {
    this._applyDarkMode(dark);
  }

  updatePropertyData(data) {
    const { regions, cities, suburbs } = data;
    const dist = this.camera.position.length();
    const level = this._getZoomCategory(dist);

    const allPrices = [
      ...(regions || []).map(r => r.median_price),
      ...(cities || []).map(c => c.median_price),
      ...(suburbs || []).map(s => s.median_price),
    ];
    const globalMin = Math.min(...allPrices);
    const globalMax = Math.max(...allPrices);

    // Heat map: show region/city dots based on zoom
    const heatPoints = level === 'world' || level === 'region'
      ? regions : level === 'city' ? cities : suburbs;
    this.heatmapLayer.update(heatPoints, level);
    this.heatmapLayer.setVisible(true);

    // Bar charts: only at suburb level
    const showBars = level === 'suburb';
    if (showBars && suburbs?.length > 0) {
      const subMin = Math.min(...suburbs.map(s => s.median_price));
      const subMax = Math.max(...suburbs.map(s => s.median_price));
      this.barChartLayer.update(suburbs, subMin, subMax, this.darkMode);
    } else {
      this.barChartLayer.clear();
    }
    this.barChartLayer.setVisible(showBars);
  }

  zoomIn() {
    const dist = this.camera.position.length();
    const newDist = Math.max(ZOOM_MIN, dist * 0.85);
    this.camera.position.setLength(newDist);
    this._updateZoomLevel(newDist);
  }

  zoomOut() {
    const dist = this.camera.position.length();
    const newDist = Math.min(ZOOM_MAX, dist * 1.18);
    this.camera.position.setLength(newDist);
    this._updateZoomLevel(newDist);
  }

  flyToNZ() {
    const target = latLonToVec3(NZ_LAT, NZ_LON, ZOOM_START);
    const start = this.camera.position.clone();
    const t0 = performance.now();
    const duration = 1200;

    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(start, target, ease);
      this.earthGroup.rotation.set(0, 0, 0);
      if (t < 1) requestAnimationFrame(tick);
      else this._updateZoomLevel(this.camera.position.length());
    };
    tick();
  }

  getZoomLevel() {
    return this._zoomLevel;
  }

  dispose() {
    cancelAnimationFrame(this._rafId);
    this.heatmapLayer.dispose();
    this.barChartLayer.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    if (this.css2dRenderer.domElement.parentNode) {
      this.css2dRenderer.domElement.parentNode.removeChild(this.css2dRenderer.domElement);
    }
  }
}
