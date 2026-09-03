/**
 * AEON SPIRE — the lighting rig.
 *
 * One sun, one bounce/fill light and a hemisphere term, plus a shadow
 * camera that follows the viewer. A single shadow map stretched over a
 * 1.2 km campus and a 700 m tower would be useless, so the cascade is
 * faked the cheap way: the shadow frustum tracks the camera at a fixed
 * size, which keeps nearby shadows crisp and lets distant geometry fall
 * back to ambient occlusion in the materials.
 */

import * as THREE from 'three';
import { clamp } from '../core/MathUtil.js';

export class Lighting {
  constructor(scene, { tier } = {}) {
    this.scene = scene;
    this.tier = tier;

    /* The sun. Its position is set from azimuth/elevation by TimeOfDay. */
    this.sun = new THREE.DirectionalLight(0xfff2dc, 3.0);
    this.sun.name = 'Sun';
    this.sun.castShadow = !!(tier && tier.shadows);
    this.sunTarget = new THREE.Object3D();
    scene.add(this.sun, this.sunTarget);
    this.sun.target = this.sunTarget;

    const size = 260;
    const cam = this.sun.shadow.camera;
    cam.left = -size; cam.right = size;
    cam.top = size; cam.bottom = -size;
    cam.near = 1; cam.far = 1400;
    this.shadowSize = size;
    const map = tier ? tier.shadowMap : 2048;
    this.sun.shadow.mapSize.set(map, map);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.55;
    this.sun.shadow.radius = 2.2;

    /* A cool bounce light from the opposite side — this is what stops the
       shadow side of a supertall reading as a black cut-out. */
    this.fill = new THREE.DirectionalLight(0x9fc2e8, 0.5);
    this.fill.name = 'Fill';
    scene.add(this.fill);

    /* Sky/ground hemisphere term. */
    this.hemi = new THREE.HemisphereLight(0xbcd4e8, 0x4a4336, 1.0);
    this.hemi.name = 'Hemisphere';
    scene.add(this.hemi);

    /* A small ambient floor so nothing is ever pure black (E.3 / D.8). */
    this.ambient = new THREE.AmbientLight(0xffffff, 0.08);
    this.ambient.name = 'AmbientFloor';
    scene.add(this.ambient);

    /* Fog is part of the atmosphere, so it lives with the lighting. */
    this.fog = new THREE.Fog(0xbcd4e8, 500, 3600);
    scene.fog = this.fog;

    this.sunDirection = new THREE.Vector3(0.4, 0.6, 0.5).normalize();
  }

  /** Point the sun from an azimuth (radians) and elevation (radians). */
  setSunAngles(azimuth, elevation) {
    const ce = Math.cos(elevation);
    this.sunDirection.set(Math.cos(azimuth) * ce, Math.sin(elevation), Math.sin(azimuth) * ce).normalize();
    return this.sunDirection;
  }

  /** Apply an already-interpolated preset. */
  apply(p) {
    this.setSunAngles(p.sunAzimuth, p.sunElevation);
    this.sun.color.copy(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.fill.color.copy(p.fillColor);
    this.fill.intensity = p.fillIntensity;
    this.fill.position.copy(this.sunDirection).multiplyScalar(-600).setY(280);
    this.hemi.color.copy(p.hemiSky);
    this.hemi.groundColor.copy(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.ambient.intensity = p.ambientIntensity;
    this.fog.color.copy(p.fogColor);
    this.fog.near = p.fogNear;
    this.fog.far = p.fogFar;
  }

  /**
   * Keep the shadow frustum around the viewer. Snapping to texel-sized
   * steps stops the classic shimmer as the camera moves.
   */
  update(camera) {
    const d = this.sunDirection;
    const focus = camera.position;
    const texel = (this.shadowSize * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    const fy = clamp(focus.y, 0, 420);

    this.sunTarget.position.set(fx, fy, fz);
    this.sun.position.set(fx + d.x * 900, fy + d.y * 900, fz + d.z * 900);
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  setShadowsEnabled(on, mapSize) {
    this.sun.castShadow = on;
    if (mapSize && this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }

  dispose() {
    this.scene.remove(this.sun, this.sunTarget, this.fill, this.hemi, this.ambient);
    this.sun.dispose(); this.fill.dispose(); this.hemi.dispose(); this.ambient.dispose();
  }
}
