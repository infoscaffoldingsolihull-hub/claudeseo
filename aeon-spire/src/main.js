/**
 * AEON SPIRE — application entry point.
 *
 * Boots the engine, builds the world, wires the systems together and
 * exposes a small automation surface on `window.AEON` so the QA harness in
 * tools/verify.mjs can drive a full walkthrough headlessly.
 */

import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { MaterialLibrary, globalUniforms } from './core/Materials.js';
import { Sky } from './scene/Sky.js';
import { clamp } from './core/MathUtil.js';

const BOOT = window.AEON_BOOT || { progress() {}, done() {}, fail() {} };

class AeonSpire {
  constructor(container) {
    this.container = container;
    this.errors = [];
    window.addEventListener('error', (e) => this.errors.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => this.errors.push(String(e.reason)));
  }

  async boot() {
    BOOT.progress(0.10, 'Starting renderer…');
    this.engine = new Engine(this.container);
    this.camera = this.engine.camera;
    this.renderer = this.engine.renderer;

    this.THREE_REVISION = THREE.REVISION;
    this.scene = new THREE.Scene();
    this.scene.name = 'AeonSpire';

    BOOT.progress(0.18, 'Generating materials…');
    this.materials = new MaterialLibrary({ textureSize: this.engine.tier.tex });

    BOOT.progress(0.26, 'Raising the sky…');
    const stars = this.materials.tex.get('starfield').map;
    this.sky = new Sky(this.scene, stars);

    BOOT.progress(0.34, 'Laying the ground…');
    this.buildGround();

    // Provisional lighting; the full time-of-day rig replaces this in Phase 5.
    this.hemi = new THREE.HemisphereLight(0xbcd4e8, 0x4a4336, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
    this.sun.position.set(320, 460, 240);
    this.scene.add(this.sun);
    this.scene.fog = new THREE.Fog(0xbcd4e8, 420, 3400);

    this.camera.position.set(280, 120, 340);
    this.camera.lookAt(0, 160, 0);

    this.engine.onUpdate((dt, t) => this.update(dt, t));
    this.engine.start(this.scene);

    BOOT.progress(1.0, 'Ready');
    BOOT.done();
    window.AEON_STARTED = true;
    return this;
  }

  buildGround() {
    const mat = this.materials.surface('groundPlaza', 'paving', {
      repeat: 160, roughness: 0.72, exterior: true
    });
    const geo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    ground.name = 'GroundPlane';
    this.scene.add(ground);
    this.ground = ground;
  }

  update(dt, t) {
    globalUniforms.uTime.value = t;
    this.sky.update(dt, this.camera, globalUniforms.uWind.value);
  }
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

const container = document.getElementById('viewport');
const app = new AeonSpire(container);

window.AEON = app;

app.boot().catch((err) => {
  console.error(err);
  BOOT.fail('Failed to build the scene: ' + (err && err.message ? err.message : err), err);
});
