import * as THREE from 'three';
import { mergeGeometries, box, scaleUvByWorldSize } from './geobuild.js';
import { PYRAMIDS, KHUFU_INTERIOR, KHAFRE_INTERIOR, MENKAURE_INTERIOR } from './layout.js';

/**
 * The ways in.
 *
 * Every pyramid entrance is a hole part-way up a 52-degree face, which is
 * unreachable on foot: without an approach the player can walk the whole
 * plateau and never get within twenty metres of a doorway.  This module builds
 * the stone approach - a stepped ramp from the ground to a landing at the
 * threshold - marks the opening with the relieving chevrons and a recessed
 * doorway, and registers the entrance so the interaction key has something to
 * find.
 *
 * Each step of the ramp is its own collider, 0.42 m high, well inside the
 * 0.72 m the collision world will step the player up, so the approach is
 * genuinely walkable rather than a piece of scenery.
 */

const STEP_RISE = 0.42;
const STEP_RUN = 0.60;
const RAMP_WIDTH = 3.6;
const LANDING_DEPTH = 4.0;

export class EntranceSystem {
  constructor(scene, textures, quality, collision, groundAt) {
    this.group = new THREE.Group();
    this.group.name = 'entrances';
    scene.add(this.group);
    this.collision = collision;
    this.groundAt = groundAt;
    this.torchSites = [];
    this.entrances = [];

    const lime = textures.limestoneAshlar();
    const aniso = Math.min(quality.settings.anisotropy, quality.maxAnisotropy);
    for (const t of Object.values(lime)) t.anisotropy = aniso;

    this.materials = {
      dressed: new THREE.MeshStandardMaterial({
        map: lime.map,
        normalMap: lime.normalMap,
        roughnessMap: lime.roughnessMap,
        color: 0xcabfa2,
        roughness: 0.86,
        metalness: 0,
      }),
      // The opening itself: unlit, so it reads as a hole rather than a panel.
      shadow: new THREE.MeshBasicMaterial({ color: 0x060504, fog: true }),
    };

    this._parts = [];
    this._buildAll();

    const geo = mergeGeometries(this._parts);
    scaleUvByWorldSize(geo, 2.2);
    const mesh = new THREE.Mesh(geo, this.materials.dressed);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'entrance-works';
    this.group.add(mesh);

    if (this._voids.length) {
      const voidMesh = new THREE.Mesh(mergeGeometries(this._voids), this.materials.shadow);
      voidMesh.name = 'entrance-voids';
      this.group.add(voidMesh);
    }
  }

  /** North face Z of a pyramid at a given height above its base. */
  static faceZ(p, height) {
    return p.z - (p.baseLength / 2) * (1 - height / p.designHeight);
  }

  _buildAll() {
    this._voids = [];
    const khufu = PYRAMIDS.khufu;
    const khafre = PYRAMIDS.khafre;
    const menkaure = PYRAMIDS.menkaure;

    // ---- the Great Pyramid: the original entrance, and al-Ma'mun's hole ----
    this._approach({
      id: 'khufu',
      site: 'khufu',
      name: 'Great Pyramid — Original Entrance',
      prompt: 'Enter the Great Pyramid',
      pyramid: khufu,
      axisX: khufu.x + KHUFU_INTERIOR.entrance.x,
      height: KHUFU_INTERIOR.entrance.y,
      doorWidth: KHUFU_INTERIOR.passageWidth,
      doorHeight: KHUFU_INTERIOR.passageHeight,
      chevrons: 2,
    });
    this._approach({
      id: 'khufuMamun',
      site: 'khufu',
      name: 'Great Pyramid — al-Ma’mun’s Forced Entry',
      prompt: 'Enter by al-Ma’mun’s tunnel',
      pyramid: khufu,
      axisX: khufu.x + KHUFU_INTERIOR.entrance.x,
      height: 7.0,
      doorWidth: 1.5,
      doorHeight: 2.0,
      chevrons: 0,
      ragged: true,
    });

    // ---- Khafre: the upper entrance on the face, the lower in the pavement ----
    this._approach({
      id: 'khafre',
      site: 'khafre',
      name: 'Pyramid of Khafre — Upper Entrance',
      prompt: 'Enter the Pyramid of Khafre',
      pyramid: khafre,
      axisX: khafre.x + KHAFRE_INTERIOR.upperEntrance.x,
      height: KHAFRE_INTERIOR.upperEntrance.y,
      doorWidth: KHAFRE_INTERIOR.passageWidth,
      doorHeight: KHAFRE_INTERIOR.passageHeight,
      chevrons: 1,
    });
    this._pavementEntrance({
      id: 'khafreLower',
      site: 'khafre',
      name: 'Pyramid of Khafre — Lower Entrance',
      prompt: 'Enter by the lower passage',
      pyramid: khafre,
      axisX: khafre.x + KHAFRE_INTERIOR.lowerEntrance.x,
      z: EntranceSystem.faceZ(khafre, 0) - KHAFRE_INTERIOR.lowerEntrance.groundOffset,
      floorY: khafre.baseY,
      doorWidth: KHAFRE_INTERIOR.passageWidth,
      doorHeight: KHAFRE_INTERIOR.passageHeight,
    });

    // ---- Menkaure ----
    this._approach({
      id: 'menkaure',
      site: 'menkaure',
      name: 'Pyramid of Menkaure — Entrance',
      prompt: 'Enter the Pyramid of Menkaure',
      pyramid: menkaure,
      axisX: menkaure.x + MENKAURE_INTERIOR.entrance.x,
      height: MENKAURE_INTERIOR.entrance.y,
      doorWidth: MENKAURE_INTERIOR.passageWidth,
      doorHeight: MENKAURE_INTERIOR.passageHeight,
      chevrons: 1,
    });
  }

  /**
   * A stepped ramp from the ground up the north face to a landing at the
   * threshold, with the doorway recess and its relieving chevrons above.
   */
  _approach(spec) {
    const p = spec.pyramid;
    const y = p.baseY + spec.height;
    const faceZ = EntranceSystem.faceZ(p, spec.height);

    // The pyramid's own collision is a stack of coarse stepped bands that
    // bulges out past the dressed face, so a landing measured from the face
    // alone can end up buried inside solid pyramid.  Walk north until there is
    // standing room at head height, and put the landing's inner edge there.
    const innerZ = this._clearOf(spec.axisX, y + 0.9, faceZ - 1.4, faceZ - 26);
    const landingZ = innerZ - LANDING_DEPTH / 2;

    // ---- the landing ----
    // The slab runs all the way back to the face so it reads as one platform;
    // only the part with standing room over it carries collision.
    const slabDepth = Math.max(LANDING_DEPTH, faceZ - landingZ + LANDING_DEPTH / 2);
    this._parts.push(box(RAMP_WIDTH + 1.6, 1.1, slabDepth, spec.axisX, y - 0.55, faceZ - slabDepth / 2));
    this.collision.addBox(
      spec.axisX - (RAMP_WIDTH + 1.6) / 2, y - 1.1, landingZ - LANDING_DEPTH / 2,
      spec.axisX + (RAMP_WIDTH + 1.6) / 2, y, innerZ,
      'entrance-landing'
    );
    // A low parapet either side so the landing does not feel like a diving board.
    for (const side of [-1, 1]) {
      const px = spec.axisX + side * (RAMP_WIDTH / 2 + 0.7);
      this._parts.push(box(0.5, 0.9, LANDING_DEPTH, px, y + 0.45, landingZ));
      this.collision.addBox(
        px - 0.25, y, landingZ - LANDING_DEPTH / 2,
        px + 0.25, y + 0.9, landingZ + LANDING_DEPTH / 2, 'parapet'
      );
    }

    // ---- the stepped ramp down to the ground ----
    this._stepRun(spec.axisX, y, landingZ - LANDING_DEPTH / 2, -1);

    // ---- the doorway ----
    this._doorway(spec, faceZ, y);

    // ---- the relieving chevrons ----
    for (let i = 0; i < (spec.chevrons || 0); i++) {
      const cy = y + spec.doorHeight + 0.9 + i * 1.7;
      const spread = 2.2 + i * 1.1;
      const cz = EntranceSystem.faceZ(p, cy - p.baseY) - 0.5;
      for (const side of [-1, 1]) {
        // Two great blocks leaning together over the opening.
        const g = new THREE.BoxGeometry(3.3, 1.15, 1.5);
        const m = new THREE.Matrix4().makeRotationZ(side * 0.62);
        m.setPosition(spec.axisX + side * spread * 0.62, cy + 0.7, cz);
        g.applyMatrix4(m);
        this._parts.push(g);
      }
    }

    this.torchSites.push({ x: spec.axisX - 1.9, y: y + 0.1, z: landingZ + 0.4, scale: 1.0 });
    this.torchSites.push({ x: spec.axisX + 1.9, y: y + 0.1, z: landingZ + 0.4, scale: 1.0 });

    this.entrances.push({
      id: spec.id,
      site: spec.site,
      name: spec.name,
      prompt: spec.prompt,
      outside: new THREE.Vector3(spec.axisX, y, landingZ),
      radius: 16,
    });
  }

  /** A doorway recess cut into the face, framed by dressed jambs and a lintel. */
  _doorway(spec, faceZ, y) {
    const w = spec.doorWidth;
    const h = spec.doorHeight;
    const frameW = spec.ragged ? w + 1.4 : w + 1.2;
    if (!spec.ragged) {
      this._parts.push(
        box(0.6, h + 0.9, 1.0, spec.axisX - w / 2 - 0.3, y + (h + 0.9) / 2, faceZ - 0.2),
        box(0.6, h + 0.9, 1.0, spec.axisX + w / 2 + 0.3, y + (h + 0.9) / 2, faceZ - 0.2),
        box(frameW, 0.7, 1.0, spec.axisX, y + h + 0.35, faceZ - 0.2)
      );
    } else {
      // Al-Ma'mun's men did not cut a doorway; they broke a hole.
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        this._parts.push(box(
          0.7 + (i % 3) * 0.3, 0.6 + (i % 2) * 0.4, 0.9,
          spec.axisX + Math.cos(a) * (w * 0.8 + 0.3),
          y + h / 2 + Math.sin(a) * (h * 0.7 + 0.3),
          faceZ - 0.15
        ));
      }
    }
    // The dark of the passage beyond.
    this._voids.push(box(w, h, 0.5, spec.axisX, y + h / 2, faceZ + 0.35));
  }

  /**
   * The entrance that opens in the pavement rather than in a face: a cut with
   * retaining walls and a flight of steps down to the passage mouth.
   */
  _pavementEntrance(spec) {
    const groundY = this.groundAt(spec.axisX, spec.z - 8) ?? spec.floorY;
    const y = spec.floorY;
    const forecourtZ = spec.z - 3.2;

    this._parts.push(box(RAMP_WIDTH + 2.0, 0.9, 5.0, spec.axisX, y - 0.45, forecourtZ));
    this.collision.addBox(
      spec.axisX - (RAMP_WIDTH + 2.0) / 2, y - 0.9, forecourtZ - 2.5,
      spec.axisX + (RAMP_WIDTH + 2.0) / 2, y, forecourtZ + 2.5,
      'entrance-forecourt'
    );
    // Retaining walls around the cut, in case the pavement stands above it.
    for (const side of [-1, 1]) {
      const px = spec.axisX + side * (RAMP_WIDTH / 2 + 1.4);
      const wallH = Math.max(1.2, groundY - y + 1.2);
      this._parts.push(box(0.8, wallH, 5.0, px, y + wallH / 2, forecourtZ));
      this.collision.addBox(px - 0.4, y, forecourtZ - 2.5, px + 0.4, y + wallH, forecourtZ + 2.5, 'retaining');
    }
    this._stepRun(spec.axisX, y, forecourtZ - 2.5, -1);

    this._parts.push(
      box(0.6, spec.doorHeight + 0.8, 0.9, spec.axisX - spec.doorWidth / 2 - 0.3, y + (spec.doorHeight + 0.8) / 2, spec.z - 0.3),
      box(0.6, spec.doorHeight + 0.8, 0.9, spec.axisX + spec.doorWidth / 2 + 0.3, y + (spec.doorHeight + 0.8) / 2, spec.z - 0.3),
      box(spec.doorWidth + 1.2, 0.65, 0.9, spec.axisX, y + spec.doorHeight + 0.32, spec.z - 0.3)
    );
    this._voids.push(box(spec.doorWidth, spec.doorHeight, 0.5, spec.axisX, y + spec.doorHeight / 2, spec.z + 0.2));

    this.torchSites.push({ x: spec.axisX - 1.9, y: y + 0.1, z: forecourtZ + 0.6, scale: 0.95 });
    this.torchSites.push({ x: spec.axisX + 1.9, y: y + 0.1, z: forecourtZ + 0.6, scale: 0.95 });

    this.entrances.push({
      id: spec.id,
      site: spec.site,
      name: spec.name,
      prompt: spec.prompt,
      outside: new THREE.Vector3(spec.axisX, y, forecourtZ - 0.6),
      radius: 15,
    });
  }

  /**
   * A flight of steps from the landing down to wherever the ground actually
   * is, laid one step at a time until it meets it.
   *
   * Sampling the terrain once and dividing would leave the flight hanging in
   * the air, or buried, wherever the ground is not where that one sample said.
   * Marching instead keeps every riser at exactly STEP_RISE - comfortably
   * inside the collision world's step height - and stops the moment the tread
   * reaches ground level, so the last step is one the player walks onto.
   */
  _stepRun(x, topY, topZ, dirZ) {
    let tread = topY;
    for (let i = 0; i < 120; i++) {
      tread -= STEP_RISE;
      const z = topZ + dirZ * (i * STEP_RUN + STEP_RUN / 2);
      const ground = this.groundAt(x, z) ?? 0;
      // Each step is carried down past the terrain so the flight reads as a
      // masonry ramp however the ground falls away beneath it.
      const bottom = Math.min(tread - 1.0, ground - 3.0);
      const h = tread - bottom;
      this._parts.push(box(RAMP_WIDTH, h, STEP_RUN + 0.02, x, bottom + h / 2, z));
      this.collision.addBox(
        x - RAMP_WIDTH / 2, bottom, z - STEP_RUN / 2,
        x + RAMP_WIDTH / 2, tread, z + STEP_RUN / 2,
        'entrance-step'
      );
      if (tread <= ground) break;
    }
  }

  /**
   * The first Z, walking north from `startZ`, with standing room at height
   * `y` - used to find where the pyramid's collision stack actually ends.
   * Two samples, because a spot the player's chest clears but their stride
   * does not is no use to them.
   */
  _clearOf(x, y, startZ, limitZ) {
    for (let z = startZ; z > limitZ; z -= 0.4) {
      if (!this.collision.isSolid(x, y, z) && !this.collision.isSolid(x, y, z - 0.6)) return z;
    }
    return limitZ;
  }

  /** The entrance the player is standing at, if any. */
  nearest(position) {
    let best = null;
    let bestDist = Infinity;
    for (const e of this.entrances) {
      const d = position.distanceTo(e.outside);
      if (d < e.radius && d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  byId(id) {
    return this.entrances.find((e) => e.id === id) || null;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of Object.values(this.materials)) m.dispose();
  }
}
