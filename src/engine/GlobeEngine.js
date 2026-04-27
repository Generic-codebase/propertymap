import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { HeatmapLayer } from './HeatmapLayer.js';
import { BarChartLayer } from './BarChartLayer.js';
import { latLonToVec3 } from './utils.js';

const NZ_LAT = -41.5;
const NZ_LON = 174.0;
const ZOOM_MIN = 1.28;
const ZOOM_MAX = 5.5;
const ZOOM_START = 2.15;
const AUTO_ROTATE_SPEED = 0.00035;
const AUTO_ROTATE_RESUME_MS = 2800;
const DRAG_THRESHOLD_PX = 5;
const ZOOM_LERP = 0.1;
const MOMENTUM_DECAY = 0.94;

const EARTH_DAY_URL = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg';
const EARTH_NIGHT_URL = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg';

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

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const IDENTITY_Q = new THREE.Quaternion();

export class GlobeEngine {
  constructor(container, { darkMode = false, onSelect, onZoomChange } = {}) {
    this.container = container;
    this.darkMode = darkMode;
    this.onSelect = onSelect;
    this.onZoomChange = onZoomChange;

    this._autoRotate = true;
    this._autoRotateSpeed = 0;         // eases in from 0
    this._autoRotateTimer = null;
    this._isDragging = false;
    this._didDrag = false;
    this._mouseDownPos = { x: 0, y: 0 };
    this._prevMouse = { x: 0, y: 0 };
    this._momentumQ = new THREE.Quaternion();
    this._mouseNDC = null;             // tracks cursor for hover
    this._hoveredBar = null;
    this._targetDist = ZOOM_START;     // smooth zoom target
    this._flyAnim = null;
    this._zoomLevel = 'region';
    this._pinchDist = null;
    this._propertyData = null;

    this._init();
    this._bindEvents();
    this._animate();
  }

  // ─── Setup ───────────────────────────────────────────────────────────────

  _init() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.container.appendChild(this.renderer.domElement);

    this.css2dRenderer = new CSS2DRenderer();
    this.css2dRenderer.setSize(w, h);
    this.css2dRenderer.domElement.style.position = 'absolute';
    this.css2dRenderer.domElement.style.top = '0';
    this.css2dRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.css2dRenderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
    this.camera.position.copy(latLonToVec3(NZ_LAT, NZ_LON, ZOOM_START));
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(5, 3, 5);
    this.scene.add(sun);

    this._buildStars();

    this.earthGroup = new THREE.Group();
    this.scene.add(this.earthGroup);

    this._buildGlobe();
    this._buildAtmosphere();

    this.heatmapLayer = new HeatmapLayer();
    this.earthGroup.add(this.heatmapLayer.mesh);

    // Bars are children of earthGroup so they rotate with the globe
    this.barChartLayer = new BarChartLayer(this.earthGroup);

    this.raycaster = new THREE.Raycaster();

    this._applyDarkMode(this.darkMode);
  }

  _buildStars() {
    const count = 8000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 50 + Math.random() * 50;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, sizeAttenuation: true }));
    this.scene.add(this.stars);
  }

  _buildGlobe() {
    const loader = new THREE.TextureLoader();
    this.dayTexture   = loader.load(EARTH_DAY_URL);
    this.nightTexture = loader.load(EARTH_NIGHT_URL);
    this.globeMaterial = new THREE.MeshPhongMaterial({
      map: this.dayTexture,
      specular: new THREE.Color(0x222222),
      shininess: 20,
    });
    this.globeMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 72), this.globeMaterial);
    this.earthGroup.add(this.globeMesh);
  }

  _buildAtmosphere() {
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
    this.atmosphereMesh = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 64), this.atmosphereMaterial);
    this.scene.add(this.atmosphereMesh);
  }

  // ─── Animation loop ──────────────────────────────────────────────────────

  _animate() {
    this._rafId = requestAnimationFrame(() => this._animate());

    // 1. Fly animation (flyToNZ or click-to-fly)
    if (this._flyAnim) {
      const { startPos, targetPos, startQ, targetQ, t0, duration } = this._flyAnim;
      const raw = Math.min(1, (performance.now() - t0) / duration);
      const ease = 1 - Math.pow(1 - raw, 3);
      this.camera.position.lerpVectors(startPos, targetPos, ease);
      this.earthGroup.quaternion.slerpQuaternions(startQ, targetQ, ease);
      if (raw >= 1) {
        this._flyAnim = null;
        this._targetDist = this.camera.position.length();
        this._updateZoomLevel(this._targetDist);
        this._scheduleAutoRotate();
      }

    } else {
      // 2. Auto-rotate: ease speed in/out
      if (this._autoRotate) {
        this._autoRotateSpeed += (AUTO_ROTATE_SPEED - this._autoRotateSpeed) * 0.03;
      } else {
        this._autoRotateSpeed *= 0.88;
      }
      if (this._autoRotateSpeed > 0.000001) {
        const autoQ = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, this._autoRotateSpeed);
        this.earthGroup.quaternion.premultiply(autoQ);
        this.earthGroup.quaternion.normalize();
      }

      // 3. Momentum (quaternion-based, decays each frame)
      if (!this._isDragging && this._momentumQ.angleTo(IDENTITY_Q) > 0.00005) {
        this.earthGroup.quaternion.premultiply(this._momentumQ);
        this.earthGroup.quaternion.normalize();
        this._momentumQ.slerp(IDENTITY_Q, 1 - MOMENTUM_DECAY);
      }

      // 4. Smooth zoom
      const currentDist = this.camera.position.length();
      const newDist = THREE.MathUtils.lerp(currentDist, this._targetDist, ZOOM_LERP);
      if (Math.abs(newDist - currentDist) > 0.0003) {
        this.camera.position.setLength(newDist);
        this._updateZoomLevel(newDist);
      }
    }

    // 5. Bar grow animation
    this.barChartLayer.tick();

    // 6. Hover detection (skip while dragging for performance)
    if (this._mouseNDC && !this._isDragging) {
      this._updateHover();
    }

    this.renderer.render(this.scene, this.camera);
    this.css2dRenderer.render(this.scene, this.camera);
  }

  _updateHover() {
    this.raycaster.setFromCamera(this._mouseNDC, this.camera);
    const bars = this.barChartLayer.getBars();
    const hits = bars.length > 0 ? this.raycaster.intersectObjects(bars) : [];
    const hit = hits.length > 0 ? hits[0].object : null;

    if (hit === this._hoveredBar) return;

    // Un-highlight previous
    if (this._hoveredBar) {
      this._hoveredBar.material.emissive.copy(this._hoveredBar.userData.baseEmissive);
      this._hoveredBar.scale.set(1, 1, 1);
    }
    // Highlight new
    if (hit) {
      hit.material.emissive.setScalar(0.55);
      hit.scale.set(1.18, 1, 1.18);
      this.renderer.domElement.style.cursor = 'pointer';
    } else {
      this.renderer.domElement.style.cursor = 'grab';
    }
    this._hoveredBar = hit;
  }

  // ─── Events ──────────────────────────────────────────────────────────────

  _bindEvents() {
    const el = this.renderer.domElement;
    this._handlers = {
      mousedown:  this._onMouseDown.bind(this),
      mousemove:  this._onMouseMove.bind(this),
      mouseup:    this._onMouseUp.bind(this),
      mouseleave: this._onMouseLeave.bind(this),
      click:      this._onClick.bind(this),
      dblclick:   this._onDblClick.bind(this),
      wheel:      this._onWheel.bind(this),
      touchstart: this._onTouchStart.bind(this),
      touchmove:  this._onTouchMove.bind(this),
      touchend:   this._onTouchEnd.bind(this),
      keydown:    this._onKeyDown.bind(this),
      resize:     this._onResize.bind(this),
    };
    el.addEventListener('mousedown',  this._handlers.mousedown);
    el.addEventListener('mousemove',  this._handlers.mousemove);
    el.addEventListener('mouseleave', this._handlers.mouseleave);
    el.addEventListener('click',      this._handlers.click);
    el.addEventListener('dblclick',   this._handlers.dblclick);
    el.addEventListener('wheel',      this._handlers.wheel, { passive: false });
    el.addEventListener('touchstart', this._handlers.touchstart, { passive: true });
    el.addEventListener('touchmove',  this._handlers.touchmove, { passive: false });
    el.addEventListener('touchend',   this._handlers.touchend);
    window.addEventListener('mousemove', this._handlers.mousemove);
    window.addEventListener('mouseup',   this._handlers.mouseup);
    window.addEventListener('keydown',   this._handlers.keydown);
    window.addEventListener('resize',    this._handlers.resize);
  }

  _onMouseDown(e) {
    this._isDragging = true;
    this._didDrag = false;
    this._mouseDownPos = { x: e.clientX, y: e.clientY };
    this._prevMouse = { x: e.clientX, y: e.clientY };
    this._momentumQ.identity();
    this._autoRotate = false;
    clearTimeout(this._autoRotateTimer);
    this.renderer.domElement.style.cursor = 'grabbing';
  }

  _onMouseMove(e) {
    // Always track for hover
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._mouseNDC = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    if (!this._isDragging) return;

    const dx = e.clientX - this._prevMouse.x;
    const dy = e.clientY - this._prevMouse.y;
    this._prevMouse = { x: e.clientX, y: e.clientY };

    // Mark as drag once threshold exceeded
    const totalMove = Math.abs(e.clientX - this._mouseDownPos.x) + Math.abs(e.clientY - this._mouseDownPos.y);
    if (totalMove > DRAG_THRESHOLD_PX) this._didDrag = true;

    this._applyDrag(dx, dy);
  }

  _onMouseUp() {
    if (!this._isDragging) return;
    this._isDragging = false;
    this.renderer.domElement.style.cursor = 'grab';
    this._scheduleAutoRotate();
  }

  _onMouseLeave() {
    this._mouseNDC = null;
    this._clearHover();
  }

  _onClick(e) {
    if (this._didDrag) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.camera);

    // Bar click → select suburb
    const bars = this.barChartLayer.getBars();
    const barHits = bars.length ? this.raycaster.intersectObjects(bars) : [];
    if (barHits.length > 0) {
      this.onSelect?.(barHits[0].object.userData.suburb, 'suburb');
      return;
    }

    // Globe click → fly to that spot
    const globeHits = this.raycaster.intersectObject(this.globeMesh);
    if (globeHits.length > 0) {
      this._flyToWorldPoint(globeHits[0].point);
      this.onSelect?.(null, null);
    }
  }

  _onDblClick() {
    this._autoRotate = false;
    clearTimeout(this._autoRotateTimer);
    this._targetDist = Math.max(ZOOM_MIN, this._targetDist * 0.7);
    this._scheduleAutoRotate();
  }

  _onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.91;
    this._targetDist = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._targetDist * factor));
    this._autoRotate = false;
    clearTimeout(this._autoRotateTimer);
    this._scheduleAutoRotate();
  }

  _onKeyDown(e) {
    if (e.target !== document.body && e.target.tagName !== 'CANVAS') return;
    switch (e.key) {
      case '+': case '=': this.zoomIn(); break;
      case '-': case '_': this.zoomOut(); break;
      case 'r': case 'R': this.flyToNZ(); break;
      case 'Escape': this.onSelect?.(null, null); break;
    }
  }

  _onTouchStart(e) {
    if (e.touches.length === 1) {
      this._isDragging = true;
      this._didDrag = false;
      this._mouseDownPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this._prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this._momentumQ.identity();
      this._autoRotate = false;
      clearTimeout(this._autoRotateTimer);
      this._pinchDist = null;
    } else if (e.touches.length === 2) {
      this._isDragging = false;
      this._pinchDist = this._getTouchDist(e.touches);
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1 && this._isDragging) {
      const dx = e.touches[0].clientX - this._prevMouse.x;
      const dy = e.touches[0].clientY - this._prevMouse.y;
      this._prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const totalMove = Math.abs(e.touches[0].clientX - this._mouseDownPos.x) + Math.abs(e.touches[0].clientY - this._mouseDownPos.y);
      if (totalMove > DRAG_THRESHOLD_PX) this._didDrag = true;
      this._applyDrag(dx, dy);
    } else if (e.touches.length === 2 && this._pinchDist !== null) {
      const newDist = this._getTouchDist(e.touches);
      this._targetDist = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._targetDist * (this._pinchDist / newDist)));
      this._pinchDist = newDist;
    }
  }

  _onTouchEnd(e) {
    if (e.touches.length === 0) {
      this._isDragging = false;
      this._pinchDist = null;
      this._scheduleAutoRotate();
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

  // ─── Helpers ─────────────────────────────────────────────────────────────

  // Quaternion-based rotation: horizontal drag → world Y, vertical drag → camera right.
  // This matches the "ball rolling under your finger" feel and has no gimbal lock.
  _applyDrag(dx, dy) {
    const sens = 0.0035;
    const qY = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, dx * sens);
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const qX = new THREE.Quaternion().setFromAxisAngle(camRight, dy * sens);
    const deltaQ = qY.premultiply(qX);
    this.earthGroup.quaternion.premultiply(deltaQ);
    this.earthGroup.quaternion.normalize();
    this._momentumQ.copy(deltaQ);
  }

  _flyToWorldPoint(worldPoint) {
    // Rotate the globe so the clicked spot faces the camera, and zoom in one level
    const cameraDir = this.camera.position.clone().normalize();
    const hitDir = worldPoint.clone().normalize();
    const rotateToFace = new THREE.Quaternion().setFromUnitVectors(hitDir, cameraDir);
    const targetQ = this.earthGroup.quaternion.clone().premultiply(rotateToFace);

    const currentDist = this.camera.position.length();
    const targetDist = Math.max(ZOOM_MIN, currentDist * 0.72);

    this._flyAnim = {
      startPos: this.camera.position.clone(),
      targetPos: this.camera.position.clone().setLength(targetDist),
      startQ: this.earthGroup.quaternion.clone(),
      targetQ,
      t0: performance.now(),
      duration: 900,
    };
    this._targetDist = targetDist;
    this._autoRotate = false;
    clearTimeout(this._autoRotateTimer);
  }

  _clearHover() {
    if (this._hoveredBar) {
      this._hoveredBar.material.emissive.copy(this._hoveredBar.userData.baseEmissive);
      this._hoveredBar.scale.set(1, 1, 1);
      this._hoveredBar = null;
    }
  }

  _scheduleAutoRotate() {
    clearTimeout(this._autoRotateTimer);
    this._autoRotateTimer = setTimeout(() => { this._autoRotate = true; }, AUTO_ROTATE_RESUME_MS);
  }

  _getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _getZoomCategory(dist) {
    if (dist > 3.5)  return 'world';
    if (dist > 2.4)  return 'region';
    if (dist > 1.65) return 'city';
    return 'suburb';
  }

  _updateZoomLevel(dist) {
    const newLevel = this._getZoomCategory(dist);
    if (newLevel !== this._zoomLevel) {
      this._zoomLevel = newLevel;
      this.onZoomChange?.(newLevel);
      // Re-render data at new zoom level
      if (this._propertyData) this._renderData(this._propertyData);
    }
  }

  _applyDarkMode(dark) {
    this.darkMode = dark;
    this.renderer.setClearColor(dark ? 0x050a14 : 0x0d1b2a, 1);
    this.stars.material.color.set(dark ? 0xffffff : 0xaaccff);
    this.atmosphereMaterial.uniforms.glowColor.value.set(dark ? 0x4fc3f7 : 0x90caf9);
    this.barChartLayer?.updateDarkMode(dark);
    if (this.globeMaterial) {
      this.globeMaterial.map = dark ? this.nightTexture : this.dayTexture;
      this.globeMaterial.needsUpdate = true;
    }
  }

  _renderData(data) {
    const { regions, cities, suburbs } = data;
    const level = this._getZoomCategory(this.camera.position.length());

    const heatPoints = level === 'world' || level === 'region' ? regions
      : level === 'city' ? cities
      : suburbs;
    this.heatmapLayer.update(heatPoints, level);
    this.heatmapLayer.setVisible(true);

    const showBars = level === 'suburb';
    if (showBars && suburbs?.length > 0) {
      const prices = suburbs.map(s => s.median_price);
      this.barChartLayer.update(suburbs, Math.min(...prices), Math.max(...prices), this.darkMode);
    } else {
      this.barChartLayer.clear();
    }
    this.barChartLayer.setVisible(showBars);
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  setDarkMode(dark) {
    this._applyDarkMode(dark);
  }

  updatePropertyData(data) {
    this._propertyData = data;
    this._renderData(data);
  }

  zoomIn() {
    this._targetDist = Math.max(ZOOM_MIN, this._targetDist * 0.82);
  }

  zoomOut() {
    this._targetDist = Math.min(ZOOM_MAX, this._targetDist * 1.22);
  }

  flyToNZ() {
    this._flyAnim = {
      startPos: this.camera.position.clone(),
      targetPos: latLonToVec3(NZ_LAT, NZ_LON, ZOOM_START),
      startQ: this.earthGroup.quaternion.clone(),
      targetQ: new THREE.Quaternion(),
      t0: performance.now(),
      duration: 1100,
    };
    this._targetDist = ZOOM_START;
    this._autoRotate = false;
    clearTimeout(this._autoRotateTimer);
  }

  getZoomLevel() {
    return this._zoomLevel;
  }

  dispose() {
    cancelAnimationFrame(this._rafId);
    clearTimeout(this._autoRotateTimer);

    const el = this.renderer.domElement;
    el.removeEventListener('mousedown',  this._handlers.mousedown);
    el.removeEventListener('mousemove',  this._handlers.mousemove);
    el.removeEventListener('mouseleave', this._handlers.mouseleave);
    el.removeEventListener('click',      this._handlers.click);
    el.removeEventListener('dblclick',   this._handlers.dblclick);
    el.removeEventListener('wheel',      this._handlers.wheel);
    el.removeEventListener('touchstart', this._handlers.touchstart);
    el.removeEventListener('touchmove',  this._handlers.touchmove);
    el.removeEventListener('touchend',   this._handlers.touchend);
    window.removeEventListener('mousemove', this._handlers.mousemove);
    window.removeEventListener('mouseup',   this._handlers.mouseup);
    window.removeEventListener('keydown',   this._handlers.keydown);
    window.removeEventListener('resize',    this._handlers.resize);

    this.heatmapLayer.dispose();
    this.barChartLayer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.parentNode?.removeChild(this.renderer.domElement);
    this.css2dRenderer.domElement.parentNode?.removeChild(this.css2dRenderer.domElement);
  }
}
