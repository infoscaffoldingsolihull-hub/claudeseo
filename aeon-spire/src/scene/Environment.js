/**
 * AEON SPIRE — environment probe.
 *
 * Metal and glass without an environment map render as flat black, which is
 * exactly wrong for a building whose whole character is reflective. This
 * module paints a small equirectangular image of the current sky — gradient,
 * sun, horizon haze, ground — and pre-filters it through three.js's
 * PMREMGenerator so rough and smooth surfaces both get a physically
 * plausible reflection.
 *
 * It is regenerated when the time of day changes (throttled during a
 * transition), which is far cheaper than a live cube camera and is
 * indistinguishable at this scale.
 */

import * as THREE from 'three';
import { clamp, lerp } from '../core/MathUtil.js';

const W = 256, H = 128;

export class EnvironmentProbe {
  constructor(renderer) {
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();

    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');

    this.source = new THREE.CanvasTexture(this.canvas);
    this.source.mapping = THREE.EquirectangularReflectionMapping;
    this.source.colorSpace = THREE.SRGBColorSpace;

    this.target = null;
    this.envMap = null;
    this._cooldown = 0;
  }

  /**
   * Repaint from a (already interpolated) time-of-day preset and re-filter.
   * @param {object} p preset with zenith/horizon/ground/sunColor colours
   * @param {THREE.Vector3} sunDir
   */
  update(p, sunDir) {
    const ctx = this.ctx;
    const hex = (c, k = 1) => `rgb(${Math.round(clamp(c.r * k, 0, 1) * 255)},${Math.round(clamp(c.g * k, 0, 1) * 255)},${Math.round(clamp(c.b * k, 0, 1) * 255)})`;

    // Sky half: zenith at the top, horizon at the equator.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.00, hex(p.zenith, 1.05));
    g.addColorStop(0.30, hex(p.zenith));
    g.addColorStop(0.47, hex(p.horizon, 1.06));
    g.addColorStop(0.50, hex(p.horizon));
    g.addColorStop(0.56, hex(p.ground, 1.25));
    g.addColorStop(1.00, hex(p.ground, 0.8));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // The sun, placed by direction so reflections track it across the sky.
    if (sunDir && p.sunDiscIntensity > 0.01) {
      const u = (Math.atan2(sunDir.z, sunDir.x) / (Math.PI * 2) + 0.5) * W;
      const v = (Math.acos(clamp(sunDir.y, -1, 1)) / Math.PI) * H;
      const rad = 26 + p.sunDiscIntensity * 10;
      const sg = ctx.createRadialGradient(u, v, 0, u, v, rad);
      const k = 0.9 + p.sunDiscIntensity * 0.8;
      sg.addColorStop(0.00, hex(p.sunColor, k * 2.4));
      sg.addColorStop(0.10, hex(p.sunColor, k * 1.2));
      sg.addColorStop(0.45, hex(p.sunColor, k * 0.32));
      sg.addColorStop(1.00, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'lighter';
      // Draw twice, wrapping horizontally, so a sun near the seam is not clipped.
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }

    this.source.needsUpdate = true;
    const next = this.pmrem.fromEquirectangular(this.source);
    if (this.target) this.target.dispose();
    this.target = next;
    this.envMap = next.texture;
    return this.envMap;
  }

  dispose() {
    if (this.target) this.target.dispose();
    this.pmrem.dispose();
    this.source.dispose();
  }
}
