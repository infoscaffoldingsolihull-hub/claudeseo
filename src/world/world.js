import * as THREE from 'three';
import { CollisionWorld } from './collision.js';
import { SkySystem } from './sky.js';
import { TerrainSystem, terrainHeight } from './terrain.js';
import { PyramidSystem } from './pyramids.js';
import { MonumentSystem } from './monuments.js';
import { SiteSystem } from './site.js';
import { WorkerSystem } from './workers.js';
import { InteriorSystem } from './interior.js';
import {
  RockField, Vegetation, Footprints, ParticleField, TorchSystem, buildTorchPosts, DustPuffs, BirdFlock,
  Pennants,
} from './props.js';
import { PYRAMIDS, POINTS_OF_INTEREST, KHUFU_INTERIOR } from './layout.js';

/**
 * The world: everything that exists in 3D, assembled and kept in step with the
 * project simulation.
 *
 * Two scenes are maintained - the plateau and the pyramid's interior - and
 * exactly one of them is rendered at a time.  Each has its own collision
 * world, its own fog and its own torch budget.
 */
export class World {
  constructor(engine, textures, onProgress = () => {}) {
    this.engine = engine;
    this.textures = textures;
    this.quality = engine.quality;

    this.scene = new THREE.Scene();
    this.collision = new CollisionWorld(terrainHeight);
    this.interiorCollision = new CollisionWorld(() => -1e6);
    this.interiorCollision.stepHeight = 0.55;
    this.inInterior = false;

    this.steps = [
      ['Raising the atmosphere', () => this._buildSky()],
      ['Surveying the Giza plateau', () => this._buildTerrain()],
      ['Quarrying limestone and setting the courses', () => this._buildPyramids()],
      ['Carving Hor-em-akhet and the temples', () => this._buildMonuments()],
      ['Opening the quarry, the harbour and the workers’ town', () => this._buildSite()],
      ['Scattering boulders, scrub and palms', () => this._buildProps()],
      ['Cutting the passages and chambers', () => this._buildInterior()],
      ['Mustering the workforce', () => this._buildWorkers()],
      ['Lighting the torches', () => this._buildTorches()],
    ];
    this.onProgress = onProgress;

    // A tier change re-applies the cheap settings only: rebuilding the terrain
    // and forty thousand block instances mid-session would be far worse than
    // the frame it is trying to save.
    this._unsubscribeQuality = this.quality.onChange(() => this.applyQuality());
  }

  applyQuality() {
    const aniso = Math.min(this.quality.settings.anisotropy, this.quality.maxAnisotropy);
    if (this.sky) this.sky.applyQuality();
    if (this.torches) this.torches.applyQuality();
    if (this.interiorTorches) this.interiorTorches.applyQuality();
    for (const cached of this.textures.cache.values()) {
      if (!cached || typeof cached !== 'object') continue;
      const textures = cached.isTexture ? [cached] : Object.values(cached);
      for (const t of textures) {
        if (t && t.isTexture) {
          t.anisotropy = aniso;
          t.needsUpdate = true;
        }
      }
    }
  }

  /** Build the world one step at a time so the loading bar can breathe. */
  async build() {
    for (let i = 0; i < this.steps.length; i++) {
      const [label, fn] = this.steps[i];
      this.onProgress(i / this.steps.length, `${label}…`);
      await new Promise((r) => requestAnimationFrame(() => r()));
      fn.call(this);
    }
    this.onProgress(1, 'Ready.');
  }

  _buildSky() {
    this.sky = new SkySystem(this.scene, { quality: this.quality, dayOfYear: 172 });
    this.sky.setHour(8.4);
  }

  _buildTerrain() {
    this.terrain = new TerrainSystem(this.scene, this.textures, this.quality);
  }

  _buildPyramids() {
    this.pyramids = new PyramidSystem(this.scene, this.textures, this.quality, this.collision);
  }

  _buildMonuments() {
    this.monuments = new MonumentSystem(this.scene, this.textures, this.quality, this.collision);
  }

  _buildSite() {
    this.site = new SiteSystem(this.scene, this.textures, this.quality, this.collision);
  }

  _buildProps() {
    this.rocks = new RockField(this.scene, this.textures, this.quality, this.collision);
    this.vegetation = new Vegetation(this.scene, this.quality);
    this.footprints = new Footprints(this.scene, this.textures, 220);
    this.sand = new ParticleField(this.scene, {
      count: this.quality.settings.sandCount,
      extent: { x: 420, y: 90, z: 420 },
      velocity: { x: 5.2, y: 0.35, z: 3.1 },
      color: 0xe4cfa4,
      size: 1.7,
      opacity: 0.34,
    });
    this.dustPuffs = new DustPuffs(this.scene, { capacity: 160 });
    this.birds = new BirdFlock(this.scene, { count: this.quality.settings.birdCount });
    this.pennants = new Pennants(this.scene, this.monuments.pennantSites, this.site.materials.timber);
  }

  _buildInterior() {
    this.interior = new InteriorSystem(this.textures, this.quality);
    this.interior.registerCollision(this.interiorCollision);
    this.interiorDust = new ParticleField(this.interior.scene, {
      count: Math.round(this.quality.settings.dustCount * 0.7),
      extent: { x: 26, y: 16, z: 26 },
      velocity: { x: 0.12, y: 0.05, z: 0.09 },
      color: 0xf0e0c0,
      size: 1.25,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
    });
    this.interiorPuffs = new DustPuffs(this.interior.scene, { capacity: 48, color: 0xe6d8bc, opacity: 0.42 });
    this.interiorTorches = new TorchSystem(this.interior.scene, this.textures, this.quality, { capacity: 140 });
    for (const t of this.interior.torchSites) {
      this.interiorTorches.add(t.x, t.y, t.z, { scale: t.scale, interior: true, alwaysLit: true });
    }
    const posts = buildTorchPosts(this.interior.torchSites, this.interior.materials.rough);
    if (posts) this.interior.scene.add(posts);

    // Where the player stands when stepping in from the north face.
    this.interiorEntry = this.interior.entrancePoint.clone();
    this.exteriorEntry = this._exteriorEntrancePoint();
  }

  _exteriorEntrancePoint() {
    const p = PYRAMIDS.khufu;
    const y = KHUFU_INTERIOR.entrance.y;
    const z = -(p.baseLength / 2) * (1 - y / p.designHeight);
    return new THREE.Vector3(p.x + KHUFU_INTERIOR.entrance.x, p.baseY + y, p.z + z - 6);
  }

  _buildWorkers() {
    this.workers = new WorkerSystem(this.scene, this.textures, this.quality, this.pyramids);
    this.workers.onDust = (x, y, z, strength, dx, dz) => {
      if (this.dustPuffs) this.dustPuffs.emit(x, y, z, strength, dx, dz);
    };
  }

  /** A footfall or a sledge runner kicking up the plateau's dust. */
  kickDust(x, y, z, strength = 1, driftX = 0, driftZ = 0) {
    const field = this.inInterior ? this.interiorPuffs : this.dustPuffs;
    if (field) field.emit(x, y, z, strength, driftX, driftZ);
  }

  _buildTorches() {
    this.torches = new TorchSystem(this.scene, this.textures, this.quality, { capacity: 220 });
    const sites = [...this.monuments.torchSites, ...this.site.torchSites];
    for (const t of sites) this.torches.add(t.x, t.y, t.z, { scale: t.scale, interior: false });
    const posts = buildTorchPosts(sites, this.site.materials.timber);
    if (posts) this.scene.add(posts);
    this.torchSites = sites;
  }

  /** Points of interest, split by which scene they live in. */
  get pointsOfInterest() {
    return POINTS_OF_INTEREST;
  }

  poiWorldPosition(poi) {
    if (poi.interior) {
      const node = this.interior.nodes;
      if (poi.id === 'poi-kings-chamber') return node.kingsChamber.clone().add(new THREE.Vector3(0, 1.7, 0));
      if (poi.id === 'poi-grand-gallery') return node.grandGallery.clone().add(new THREE.Vector3(0, 1.7, 0));
      if (poi.id === 'poi-queens-chamber') return node.queensChamber.clone().add(new THREE.Vector3(0, 1.7, 0));
    }
    return new THREE.Vector3(poi.position[0], poi.position[1], poi.position[2]);
  }

  get activeScene() {
    return this.inInterior ? this.interior.scene : this.scene;
  }

  get activeCollision() {
    return this.inInterior ? this.interiorCollision : this.collision;
  }

  enterInterior() {
    this.inInterior = true;
    return this.interiorEntry.clone();
  }

  exitInterior() {
    this.inInterior = false;
    return this.exteriorEntry.clone();
  }

  /** Distance from a point to the pyramid entrance, for the enter/exit prompt. */
  distanceToEntrance(position) {
    return position.distanceTo(this.inInterior ? this.interiorEntry : this.exteriorEntry);
  }

  /**
   * Push the project simulation's state into the world: built height, casing,
   * how many people are on site, and how full the stone stockpile is.
   */
  applyProjectState(state) {
    this.pyramids.setKhufuProgress(state.coreProgress, state.casingProgress);
    if (this.workers) this.workers.setActivity(state.workforceRatio);
    if (this.site) this.site.setStockpileLevel(state.stoneRatio);
    this._built = this.pyramids.khufuBuiltHeight;
  }

  update(dt, camera, elapsed) {
    this.sky.update(dt);
    this.sky.follow(camera);

    if (this.inInterior) {
      this.interior.update(dt, camera.position, this.sky);
      this.interiorTorches.update(dt, camera.position, 1, true);
      this.interiorDust.update(elapsed, camera.position, 0.5, this.quality.pixelRatio);
      this.interiorPuffs.update(dt);
      return;
    }

    this.terrain.update(dt, this.sky, elapsed);
    this.site.update(dt, elapsed);
    this.workers.update(dt, this.pyramids.khufuBuiltHeight);
    this.torches.update(dt, camera.position, this.sky.state.torchFactor, false);
    this.sand.update(elapsed, camera.position, 0.14 + this.sky.state.dayFactor * 0.22, this.quality.pixelRatio);
    this.dustPuffs.update(dt);
    this.birds.update(dt, camera.position, this.sky.state.dayFactor);
    this.pennants.update(dt, this.sky.state.dayFactor);
  }

  dispose() {
    if (this._unsubscribeQuality) this._unsubscribeQuality();
    for (const sys of [
      this.terrain, this.pyramids, this.monuments, this.site, this.rocks,
      this.vegetation, this.footprints, this.sand, this.workers, this.torches,
      this.dustPuffs, this.birds, this.pennants, this.interiorPuffs,
      this.interior, this.interiorTorches, this.interiorDust, this.sky,
    ]) {
      if (sys && sys.dispose) sys.dispose();
    }
  }
}
