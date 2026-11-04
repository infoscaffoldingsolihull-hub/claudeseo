import * as THREE from 'three';
import { CollisionWorld } from './collision.js';
import { SkySystem } from '../engine/sky.js';
import { WeatherSystem } from '../engine/weather.js';

/** STUB (A2 replaces): flat ground, sky and weather so the skeleton boots. */
export class World {
  constructor(engine, textures, { onProgress = () => {} } = {}) {
    this.engine = engine; this.textures = textures; this.quality = engine.quality; this.onProgress = onProgress;
    this.scene = new THREE.Scene();
    this.collision = new CollisionWorld(() => 0);
    this.pointsOfInterest = [];
    this.operations = null;
  }
  async build() {
    this.sky = new SkySystem(this.scene, { quality: this.quality });
    this.weather = new WeatherSystem(this.scene, this.sky, this.quality);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshStandardMaterial({ color: 0xb09a72, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const runway = new THREE.Mesh(new THREE.PlaneGeometry(30, 2133), new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.9 }));
    runway.rotation.x = -Math.PI / 2; runway.position.y = 0.05;
    this.scene.add(runway);
    this.onProgress(1, 'World ready');
  }
  applyProjectState() {}
  update(dt, camera) { this.sky.update(dt); this.sky.follow(camera); this.weather.update(dt, camera); }
  pick() { return null; }
  highlight() {}
  setOverlay() {}
  interiorAt() { return null; }
  surfaceAt() { return 'concrete'; }
  elementCentre() { return null; }
  kickDust() {}
  dispose() {}
}
