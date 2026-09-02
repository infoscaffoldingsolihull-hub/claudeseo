import * as THREE from 'three';
import { makeRng, clamp, lerp, smoothstep } from '../engine/noise.js';
import { mergeGeometries, box, scaleUvByWorldSize, ensureOutwardWinding } from './geobuild.js';
import { PYRAMIDS, QUEENS_PYRAMIDS, MENKAURE_QUEENS, RAMP } from './layout.js';

/**
 * The pyramids, built out of stone rather than drawn as cones.
 *
 * The Great Pyramid contains roughly 2.3 million blocks.  Drawing 2.3 million
 * boxes is neither possible nor useful: only the outer skin is ever visible, so
 * the model represents the visible course rings as InstancedMesh blocks over a
 * solid core, at a course-merging ratio chosen by the quality tier.  The UI
 * always reports the true conceptual block count alongside the rendered
 * instance count, so nothing about the abstraction is hidden from the audience.
 *
 * The Khufu pyramid is not static: its built height, its casing coverage, its
 * ramp and its scaffolding are all driven by the project simulation.
 */

const COURSE_TOP = 0.58;
const COURSE_BOTTOM = 1.45;

/** Course heights, thick at the base and thinning upward, normalised to fit. */
function courseHeights(count, designHeight, rng) {
  const raw = new Float32Array(count);
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const t = Math.pow(i / count, 0.62);
    const h = lerp(COURSE_BOTTOM, COURSE_TOP, t) * (0.93 + rng() * 0.14);
    raw[i] = h;
    sum += h;
  }
  const scale = designHeight / sum;
  let y = 0;
  const tops = new Float32Array(count + 1);
  for (let i = 0; i < count; i++) {
    raw[i] *= scale;
    y += raw[i];
    tops[i + 1] = y;
  }
  return { heights: raw, tops };
}

/** Truncated pyramid (frustum) - the exposed core and its working platform. */
function frustumGeometry(halfBase, designHeight, fromY, toY) {
  const w0 = halfBase * (1 - fromY / designHeight);
  const w1 = halfBase * (1 - toY / designHeight);
  const h = toY - fromY;
  const positions = [];
  const uvs = [];
  const v = [
    [-w0, 0, -w0], [w0, 0, -w0], [w0, 0, w0], [-w0, 0, w0],
    [-w1, h, -w1], [w1, h, -w1], [w1, h, w1], [-w1, h, w1],
  ];
  const quads = [
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
    [4, 5, 6, 7],
  ];
  for (const q of quads) {
    const p = q.map((i) => v[i]);
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      for (const k of tri) positions.push(p[k][0], p[k][1] + fromY, p[k][2]);
      uvs.push(0, 0, 1, 0, 1, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  ensureOutwardWinding(g, new THREE.Vector3(0, fromY + (toY - fromY) * 0.4, 0));
  scaleUvByWorldSize(g, 3.0);
  return g;
}

/** The four ideal casing faces, subdivided so lighting across them is smooth. */
function casingGeometry(halfBase, designHeight, divisions = 12, offset = 0) {
  const positions = [];
  const uvs = [];
  const corners = [
    [-1, -1], [1, -1], [1, 1], [-1, 1],
  ];
  // u runs along the base edge, v runs from base (0) to apex (1); the face
  // narrows by (1 - v) so the top row collapses to the apex point.
  for (let s = 0; s < 4; s++) {
    const a = corners[s];
    const b = corners[(s + 1) % 4];
    const mk = (u, v) => {
      // The stepped block courses protrude beyond the ideal face by up to one
      // course-height times cot(slope); `offset` pushes the dressed casing out
      // far enough to swallow them, leaving a genuinely smooth surface.
      const w = halfBase * (1 - v) + offset;
      return [lerp(a[0], b[0], u) * w, v * designHeight, lerp(a[1], b[1], u) * w];
    };
    for (let j = 0; j < divisions; j++) {
      const v0 = j / divisions;
      const v1 = (j + 1) / divisions;
      for (let i = 0; i < divisions; i++) {
        const u0 = i / divisions;
        const u1 = (i + 1) / divisions;
        const p00 = mk(u0, v0);
        const p10 = mk(u1, v0);
        const p01 = mk(u0, v1);
        const p11 = mk(u1, v1);
        positions.push(...p00, ...p10, ...p01);
        uvs.push(u0, v0, u1, v0, u0, v1);
        if (j < divisions - 1) {
          positions.push(...p10, ...p11, ...p01);
          uvs.push(u1, v0, u1, v1, u0, v1);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  ensureOutwardWinding(g, new THREE.Vector3(0, designHeight * 0.32, 0));
  scaleUvByWorldSize(g, 4.0);
  return g;
}

/**
 * Instanced stone needs two extra things the stock material cannot express:
 * a per-instance UV offset (so 40 000 blocks do not show the same texel
 * pattern) and per-instance tint.  Both are injected here.
 */
function addInstancedStoneDetail(material) {
  material.vertexColors = true;   // carries the per-instance weathering tint
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aUvOffset;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
         #ifdef USE_MAP
           vMapUv += aUvOffset;
         #endif
         #ifdef USE_NORMALMAP
           vNormalMapUv += aUvOffset;
         #endif
         #ifdef USE_ROUGHNESSMAP
           vRoughnessMapUv += aUvOffset;
         #endif`
      );
  };
  return material;
}

/** A unit cube with world-scaled UVs, white vertex colours and UV offsets. */
function blockGeometryFor(count, rng) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  scaleUvByWorldSize(geo, 1);
  const n = geo.attributes.position.count;
  const white = new Float32Array(n * 3).fill(1);
  geo.setAttribute('color', new THREE.BufferAttribute(white, 3));
  const offsets = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    offsets[i * 2] = Math.floor(rng() * 7) * 0.143;
    offsets[i * 2 + 1] = Math.floor(rng() * 7) * 0.143;
  }
  geo.setAttribute('aUvOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  return geo;
}

/** Inject a world-space Y band clip into a standard material. */
function addHeightClip(material, minRef, maxRef) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uClipMinY = minRef;
    shader.uniforms.uClipMaxY = maxRef;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClipWorld;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvClipWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vClipWorld;\nuniform float uClipMinY;\nuniform float uClipMaxY;'
      )
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nif (vClipWorld.y < uClipMinY || vClipWorld.y > uClipMaxY) discard;'
      );
  };
  return material;
}

export class Pyramid {
  /**
   * @param {object} spec         entry from layout.PYRAMIDS
   * @param {object} materials    { limestone, casing, granite, core }
   * @param {number} blockScale   how many real courses one instanced block spans
   */
  constructor(spec, materials, blockScale, seed = 1) {
    this.spec = spec;
    this.blockScale = Math.max(1, Math.round(blockScale));
    this.group = new THREE.Group();
    this.group.name = `pyramid-${spec.id}`;
    this.group.position.set(spec.x, spec.baseY, spec.z);

    this.rng = makeRng(seed);
    this.designHeight = spec.designHeight;
    this.halfBase = spec.baseLength / 2;
    this.progress = 1;
    this.casingProgress = 0;

    const { heights, tops } = courseHeights(spec.courses, spec.designHeight, this.rng);
    this.courseTops = tops;

    this.clipMin = { value: -1e6 };
    this.clipMax = { value: 1e6 };
    this.casingMin = { value: 1e6 };
    this.casingMax = { value: 1e6 };

    this._buildCore(materials);
    this._buildBlocks(materials, heights, tops);
    this._buildCasing(materials);
    this._buildPyramidion(materials);
  }

  get worldBaseY() {
    return this.spec.baseY;
  }

  _buildCore(materials) {
    this.coreMaterial = materials.core;
    this.coreGeometry = frustumGeometry(this.halfBase * 0.995, this.designHeight, 0, this.designHeight * 0.999);
    this.core = new THREE.Mesh(this.coreGeometry, this.coreMaterial);
    this.core.castShadow = true;
    this.core.receiveShadow = true;
    this.group.add(this.core);
  }

  /**
   * Build the visible course rings.  Instances are emitted bottom-up so the
   * construction state is a single `count` truncation at render time.
   */
  _buildBlocks(materials, heights, tops) {
    const spec = this.spec;
    const k = this.blockScale;
    const groups = Math.ceil(spec.courses / k);
    const rng = this.rng;

    const matrices = [];
    const colors = [];
    const courseIndex = [];   // instance -> merged course, for progressive reveal
    this.courseY = [];
    this.courseInstanceStart = [];

    const graniteCourses = spec.graniteSkirtCourses || 0;
    const graniteMatrices = [];

    for (let g = 0; g < groups; g++) {
      const c0 = g * k;
      const c1 = Math.min(spec.courses, c0 + k);
      const y0 = tops[c0];
      const y1 = tops[c1];
      const h = y1 - y0;
      if (h <= 0.01) continue;

      const hw = this.halfBase * (1 - y0 / this.designHeight);
      if (hw < 0.6) continue;
      const depth = Math.min(hw * 0.92, lerp(2.1, 1.3, y0 / this.designHeight) * k);
      const targetLen = lerp(2.6, 1.5, y0 / this.designHeight) * k;

      this.courseY.push(y0 + h);
      this.courseInstanceStart.push(matrices.length);
      const isGranite = c0 < graniteCourses;

      const rows = [
        { axis: 'x', span: hw * 2, fixed: -hw + depth / 2, along: 'x', normal: 'z' },
        { axis: 'x', span: hw * 2, fixed: hw - depth / 2, along: 'x', normal: 'z' },
        { axis: 'z', span: Math.max(0, hw * 2 - depth * 2), fixed: hw - depth / 2, along: 'z', normal: 'x' },
        { axis: 'z', span: Math.max(0, hw * 2 - depth * 2), fixed: -hw + depth / 2, along: 'z', normal: 'x' },
      ];

      for (const row of rows) {
        if (row.span <= 0.4) continue;
        const n = Math.max(1, Math.round(row.span / targetLen));
        const len = row.span / n;
        const start = row.along === 'x' ? -hw + len / 2 : -hw + depth + len / 2;
        for (let i = 0; i < n; i++) {
          const t = start + i * len;
          const jitterOut = (rng() - 0.5) * 0.09 * k;
          const m = new THREE.Matrix4();
          const yaw = (rng() - 0.5) * 0.016;
          const sy = h * (0.985 + rng() * 0.03);
          const sl = len * (0.965 + rng() * 0.05);
          const sd = depth * (0.94 + rng() * 0.1);
          let px;
          let pz;
          let sx;
          let sz;
          if (row.along === 'x') {
            px = t;
            pz = row.fixed + (row.fixed < 0 ? -jitterOut : jitterOut);
            sx = sl;
            sz = sd;
          } else {
            px = row.fixed + (row.fixed < 0 ? -jitterOut : jitterOut);
            pz = t;
            sx = sd;
            sz = sl;
          }
          m.makeRotationY(yaw);
          m.scale(new THREE.Vector3(sx, sy, sz));
          m.setPosition(px, y0 + sy / 2, pz);

          if (isGranite) {
            graniteMatrices.push(m);
          } else {
            matrices.push(m);
            courseIndex.push(this.courseY.length - 1);
            // Weathering: paler and greyer with height, warmer where sand-blasted.
            const weather = smoothstep(0.15, 1.0, y0 / this.designHeight);
            const v = 0.78 + rng() * 0.30 - weather * 0.10;
            const warm = 1 + (rng() - 0.5) * 0.10;
            colors.push(
              clamp(v * warm, 0.35, 1.25),
              clamp(v * (0.985 + (rng() - 0.5) * 0.05), 0.35, 1.2),
              clamp(v * (0.93 - weather * 0.03) / warm, 0.3, 1.15)
            );
          }
        }
      }
    }

    this.instanceCourse = courseIndex;
    this.blockGeometry = blockGeometryFor(matrices.length, rng);
    this.blocks = new THREE.InstancedMesh(this.blockGeometry, materials.limestoneInstanced, matrices.length);
    this.blocks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const colorArray = new Float32Array(colors);
    this.blocks.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
    for (let i = 0; i < matrices.length; i++) this.blocks.setMatrixAt(i, matrices[i]);
    this.blocks.instanceMatrix.needsUpdate = true;
    this.blocks.castShadow = true;
    this.blocks.receiveShadow = true;
    this.blocks.frustumCulled = true;
    this.blocks.name = `${this.spec.id}-blocks`;
    this.group.add(this.blocks);
    this.totalInstances = matrices.length;

    if (graniteMatrices.length) {
      this.graniteGeometry = blockGeometryFor(graniteMatrices.length, rng);
      const graniteColors = new Float32Array(graniteMatrices.length * 3);
      for (let i = 0; i < graniteMatrices.length; i++) {
        const v = 0.85 + rng() * 0.3;
        graniteColors[i * 3] = v;
        graniteColors[i * 3 + 1] = v * (0.96 + rng() * 0.08);
        graniteColors[i * 3 + 2] = v * (0.94 + rng() * 0.1);
      }
      this.graniteBlocks = new THREE.InstancedMesh(
        this.graniteGeometry,
        materials.graniteInstanced,
        graniteMatrices.length
      );
      this.graniteBlocks.instanceColor = new THREE.InstancedBufferAttribute(graniteColors, 3);
      for (let i = 0; i < graniteMatrices.length; i++) this.graniteBlocks.setMatrixAt(i, graniteMatrices[i]);
      this.graniteBlocks.instanceMatrix.needsUpdate = true;
      this.graniteBlocks.castShadow = true;
      this.graniteBlocks.receiveShadow = true;
      this.group.add(this.graniteBlocks);
    }
  }

  _buildCasing(materials) {
    this.casingGeometry = casingGeometry(this.halfBase, this.designHeight, 12, 1.35);
    this.casingMaterial = materials.casing;
    this.casing = new THREE.Mesh(this.casingGeometry, this.casingMaterial);
    this.casing.castShadow = true;
    this.casing.receiveShadow = true;
    this.casing.visible = false;
    this.group.add(this.casing);

    if (this.spec.casingCapFraction) {
      // Khafre keeps its original casing over the top third.
      const capBottom = this.designHeight * (1 - this.spec.casingCapFraction);
      this.casing.visible = true;
      this.casingMin.value = this.spec.baseY + capBottom;
      this.casingMax.value = 1e6;
      this.casingProgress = this.spec.casingCapFraction;
    }
  }

  _buildPyramidion(materials) {
    const size = Math.max(1.2, this.halfBase * 0.032);
    const h = size * (this.designHeight / this.halfBase);
    const geo = new THREE.ConeGeometry(size * Math.SQRT2, h, 4, 1);
    geo.rotateY(Math.PI / 4);
    this.pyramidion = new THREE.Mesh(geo, materials.pyramidion);
    this.pyramidion.position.y = this.designHeight - h / 2;
    this.pyramidion.castShadow = true;
    this.pyramidion.visible = false;
    this.group.add(this.pyramidion);
  }

  /**
   * @param {number} core    0..1 fraction of the design height that is built
   * @param {number} casing  0..1 fraction of the casing placed (top-down)
   */
  setProgress(core, casing = this.casingProgress) {
    core = clamp(core, 0, 1);
    casing = clamp(casing, 0, 1);
    const changed = Math.abs(core - this.progress) > 0.0015 || Math.abs(casing - this.casingProgress) > 0.0015;
    this.progress = core;
    this.casingProgress = casing;
    if (!changed) return;

    const builtY = this.designHeight * core;

    // Truncate the instanced shell at the current course.
    let visible = this.totalInstances;
    for (let i = 0; i < this.courseY.length; i++) {
      if (this.courseY[i] > builtY) {
        visible = this.courseInstanceStart[i];
        break;
      }
    }
    this.blocks.count = visible;

    // Rebuild the exposed core frustum so the working platform sits at the top.
    if (this.core.geometry) this.core.geometry.dispose();
    const top = Math.max(0.6, Math.min(builtY, this.designHeight * 0.999));
    this.core.geometry = frustumGeometry(this.halfBase * 0.995, this.designHeight, 0, top);

    // Casing is dressed from the apex downward.
    if (casing > 0.001) {
      this.casing.visible = true;
      this.casingMin.value = this.spec.baseY + this.designHeight * (1 - casing);
      this.casingMax.value = this.spec.baseY + builtY + 0.5;
    } else {
      this.casing.visible = false;
    }

    this.pyramidion.visible = core > 0.999 && casing > 0.985;
    this.core.visible = core < 0.999 || casing < 0.999;
  }

  /** Register climbable/blocking geometry with the collision world. */
  registerCollision(collision, courseStride = 4) {
    const spec = this.spec;
    const step = Math.max(1, Math.round(courseStride / this.blockScale));
    for (let i = 0; i < this.courseY.length; i += step) {
      const yTop = this.courseY[i];
      const yBottom = i === 0 ? 0 : this.courseY[i - step] || 0;
      const hw = this.halfBase * (1 - yBottom / this.designHeight);
      collision.addBox(
        spec.x - hw,
        spec.baseY + yBottom,
        spec.z - hw,
        spec.x + hw,
        spec.baseY + yTop,
        spec.z + hw,
        `pyramid-${spec.id}`
      );
    }
  }

  dispose() {
    this.blockGeometry.dispose();
    if (this.graniteGeometry) this.graniteGeometry.dispose();
    this.coreGeometry.dispose();
    this.casingGeometry.dispose();
    if (this.core.geometry) this.core.geometry.dispose();
    this.pyramidion.geometry.dispose();
  }
}

/**
 * Stacked-course pyramid built from solid boxes.  Used for the queens'
 * pyramids and as the cheap silhouette LOD: one merged mesh, a few hundred
 * triangles, and it still reads as courses of stone rather than a cone.
 */
function steppedPyramidGeometry(halfBase, height, courses) {
  const parts = [];
  for (let i = 0; i < courses; i++) {
    const y0 = (i / courses) * height;
    const y1 = ((i + 1) / courses) * height;
    const hw = halfBase * (1 - y0 / height);
    parts.push(box(hw * 2, y1 - y0 + 0.02, hw * 2, 0, (y0 + y1) / 2, 0));
  }
  const geo = mergeGeometries(parts);
  scaleUvByWorldSize(geo, 2.2);
  return geo;
}

/**
 * The construction ramp: a straight approach ramp on the south face for the
 * lower third, then wrapping side ramps that hug the faces for the upper
 * courses.  Geometry is rebuilt only when the built height moves by >2 m.
 */
export class ConstructionRamp {
  constructor(pyramid, material, rubbleMaterial) {
    this.pyramid = pyramid;
    this.material = material;
    this.rubbleMaterial = rubbleMaterial;
    this.group = new THREE.Group();
    this.group.name = 'construction-ramp';
    this.group.position.set(pyramid.spec.x, pyramid.spec.baseY, pyramid.spec.z);
    this.mesh = null;
    this.lastHeight = -999;
    this.visible = true;
    this.collision = null;
    this.colliderIds = [];
  }

  /** Enable or disable every collider the ramp currently owns. */
  setCollisionEnabled(on) {
    if (this.collision) this.collision.setDisabled(this.colliderIds, !on);
  }

  update(builtHeight, collision) {
    if (Math.abs(builtHeight - this.lastHeight) < 2 && this.mesh) return;
    this.lastHeight = builtHeight;
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (builtHeight < 0.5) return;

    const p = this.pyramid;
    const hb = p.halfBase;
    const H = p.designHeight;
    const parts = [];

    // ---- straight approach ramp on the south face (solid rubble embankment) ----
    const straightTop = Math.min(builtHeight, H * 0.34);
    const run = Math.max(40, straightTop / RAMP.slope);
    const segs = 20;
    const zAt = (t) => hb * (1 - (straightTop * t) / H) + run * (1 - t);
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const y1 = straightTop * t1;
      const z0 = zAt(t0);
      const z1 = zAt(t1);
      const w = lerp(RAMP.baseWidth, RAMP.topWidth, t1);
      const len = Math.abs(z0 - z1) + 0.8;
      const height = Math.max(1.2, y1);
      parts.push(box(w, height, len, 0, height / 2 - 0.4, (z0 + z1) / 2));
    }

    // ---- wrapping side ramps for the upper courses ----
    const bands = [];
    if (builtHeight > straightTop + 2) {
      const rise = builtHeight - straightTop;
      const wraps = Math.max(1, Math.round(rise / 26));
      const steps = Math.max(24, wraps * 26);
      const bandW = 8.5;
      const bandH = 3.4;
      for (let i = 0; i < steps; i++) {
        const s0 = i / steps;
        const s1 = (i + 1) / steps;
        const y = lerp(straightTop, builtHeight, s0);
        const q = s0 * wraps * 4;
        const q1 = s1 * wraps * 4;
        const side = Math.floor(q) % 4;
        const a0 = q - Math.floor(q);
        const a1 = Math.min(1, q1 - Math.floor(q));
        const hw = hb * (1 - y / H) + bandW / 2;
        const u0 = lerp(-hw, hw, a0);
        const u1 = lerp(-hw, hw, a1 <= a0 ? 1 : a1);
        const mid = (u0 + u1) / 2;
        const len = Math.abs(u1 - u0) + 1.6;
        if (side === 0) {
          parts.push(box(len, bandH, bandW, mid, y, hw));
          bands.push([mid, y, hw, len, bandH, bandW]);
        } else if (side === 1) {
          parts.push(box(bandW, bandH, len, hw, y, -mid));
          bands.push([hw, y, -mid, bandW, bandH, len]);
        } else if (side === 2) {
          parts.push(box(len, bandH, bandW, -mid, y, -hw));
          bands.push([-mid, y, -hw, len, bandH, bandW]);
        } else {
          parts.push(box(bandW, bandH, len, -hw, y, mid));
          bands.push([-hw, y, mid, bandW, bandH, len]);
        }
      }
    }

    const geo = mergeGeometries(parts);
    scaleUvByWorldSize(geo, 3.5);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    // Collision.  The ramp is rebuilt every time the pyramid rises 2 m, so the
    // previous set is disabled rather than removed, and a fresh set added.
    // Without this the whole embankment was scenery: you walked straight
    // through it and it passed overhead.
    if (collision) this.collision = collision;
    if (this.collision) {
      this.collision.setDisabled(this.colliderIds, true);
      this.colliderIds = [];
      const add = (cx, cy, cz, sx, sy, sz) => {
        this.colliderIds.push(
          this.collision.addCenteredBox(
            p.spec.x + cx, p.spec.baseY + cy, p.spec.z + cz, sx, sy, sz, 'ramp'
          )
        );
      };
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        const y1 = straightTop * t1;
        const z0 = zAt(t0);
        const z1 = zAt(t1);
        const height = Math.max(1.2, y1);
        // Matches the geometry above, which is drawn at height/2 - 0.4.
        add(0, height / 2 - 0.4, (z0 + z1) / 2,
            lerp(RAMP.baseWidth, RAMP.topWidth, t1), height, Math.abs(z0 - z1) + 0.8);
      }
      for (const b of bands) add(b[0], b[1], b[2], b[3], b[4], b[5]);
      if (!this.visible) this.setCollisionEnabled(false);
    }
  }

  dispose() {
    if (this.mesh) this.mesh.geometry.dispose();
  }
}

/** Timber scaffolding and lifting frames around the current working course. */
export class Scaffolding {
  constructor(pyramid, material) {
    this.pyramid = pyramid;
    this.material = material;
    this.group = new THREE.Group();
    this.group.position.set(pyramid.spec.x, pyramid.spec.baseY, pyramid.spec.z);
    this.mesh = null;
    this.lastHeight = -999;
  }

  update(builtHeight) {
    if (Math.abs(builtHeight - this.lastHeight) < 4 && this.mesh) return;
    this.lastHeight = builtHeight;
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (builtHeight < 3 || builtHeight > this.pyramid.designHeight - 0.5) return;

    const p = this.pyramid;
    const hw = p.halfBase * (1 - builtHeight / p.designHeight);
    if (hw < 3) return;
    const parts = [];
    const y = builtHeight;

    // Lifting frames (shadufs / rocker levers) spaced around the working platform.
    const frames = Math.max(3, Math.min(10, Math.round(hw / 9)));
    for (let i = 0; i < frames; i++) {
      const t = (i + 0.5) / frames;
      const px = lerp(-hw + 3, hw - 3, t);
      const pz = hw - 2.4;
      parts.push(box(0.42, 5.2, 0.42, px - 1.5, y + 2.6, pz));
      parts.push(box(0.42, 5.2, 0.42, px + 1.5, y + 2.6, pz));
      parts.push(box(4.0, 0.36, 0.36, px, y + 5.1, pz));
      parts.push(box(0.3, 0.3, 3.0, px, y + 5.0, pz - 1.5));
    }
    // Guard rail and platform decking on the two working edges.
    for (const side of [-1, 1]) {
      parts.push(box(hw * 2 - 1, 0.28, 2.4, 0, y + 0.16, side * (hw - 1.2)));
      parts.push(box(hw * 2 - 1, 0.16, 0.16, 0, y + 1.2, side * (hw - 0.2)));
      parts.push(box(2.4, 0.28, hw * 2 - 1, side * (hw - 1.2), y + 0.16, 0));
    }

    const geo = mergeGeometries(parts);
    scaleUvByWorldSize(geo, 1.2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
  }

  dispose() {
    if (this.mesh) this.mesh.geometry.dispose();
  }
}

export class PyramidSystem {
  constructor(scene, textures, quality, collision) {
    this.scene = scene;
    this.textures = textures;
    this.quality = quality;
    this.collision = collision;
    this.group = new THREE.Group();
    this.group.name = 'pyramids';
    scene.add(this.group);
    this.pyramids = new Map();
    this._buildMaterials();
    this.build();
  }

  _buildMaterials() {
    const lime = this.textures.limestone();
    const cas = this.textures.casing();
    const gran = this.textures.granite();
    const wood = this.textures.wood();
    const aniso = Math.min(this.quality.settings.anisotropy, this.quality.maxAnisotropy);
    for (const set of [lime, cas, gran, wood]) {
      for (const t of Object.values(set)) {
        t.repeat.set(1, 1);
        t.anisotropy = aniso;
      }
    }

    this.materials = {
      limestone: new THREE.MeshStandardMaterial({
        map: lime.map,
        normalMap: lime.normalMap,
        roughnessMap: lime.roughnessMap,
        normalScale: new THREE.Vector2(1.15, 1.15),
        roughness: 1.0,
        metalness: 0.0,
        color: 0xffffff,
      }),
      core: new THREE.MeshStandardMaterial({
        map: lime.map,
        normalMap: lime.normalMap,
        roughnessMap: lime.roughnessMap,
        normalScale: new THREE.Vector2(1.4, 1.4),
        color: 0xb9a481,
        roughness: 1.0,
        metalness: 0.0,
      }),
      casing: new THREE.MeshStandardMaterial({
        map: cas.map,
        normalMap: cas.normalMap,
        roughnessMap: cas.roughnessMap,
        normalScale: new THREE.Vector2(0.5, 0.5),
        color: 0xf3ead6,
        roughness: 0.55,
        metalness: 0.0,
      }),
      granite: new THREE.MeshStandardMaterial({
        map: gran.map,
        normalMap: gran.normalMap,
        roughnessMap: gran.roughnessMap,
        roughness: 0.62,
        metalness: 0.03,
      }),
      pyramidion: new THREE.MeshStandardMaterial({
        color: 0xd9b25c,
        roughness: 0.24,
        metalness: 0.86,
      }),
      rubble: new THREE.MeshStandardMaterial({
        map: lime.map,
        normalMap: lime.normalMap,
        color: 0x9c8763,
        roughness: 1.0,
      }),
      timber: new THREE.MeshStandardMaterial({
        map: wood.map,
        normalMap: wood.normalMap,
        roughnessMap: wood.roughnessMap,
        color: 0x8f7449,
        roughness: 0.92,
      }),
    };
    this.materials.limestoneInstanced = addInstancedStoneDetail(this.materials.limestone.clone());
    this.materials.graniteInstanced = addInstancedStoneDetail(this.materials.granite.clone());
  }

  build() {
    const blockScale = this.quality.settings.blockScale;

    // The Great Pyramid is the project; the other two are the finished context.
    this.khufu = new Pyramid(PYRAMIDS.khufu, this.materials, blockScale, 1001);
    this.khafre = new Pyramid(PYRAMIDS.khafre, this.materials, blockScale + 1, 1002);
    this.menkaure = new Pyramid(PYRAMIDS.menkaure, this.materials, blockScale, 1003);
    // Each pyramid gets its own casing material so the height clip is independent.
    for (const p of [this.khufu, this.khafre, this.menkaure]) {
      this.pyramids.set(p.spec.id, p);
      this.group.add(p.group);
      const mat = addHeightClip(this.materials.casing.clone(), p.casingMin, p.casingMax);
      p.casing.material = mat;
      p.casingMaterialInstance = mat;
    }

    this.khafre.setProgress(1, PYRAMIDS.khafre.casingCapFraction);
    this.menkaure.setProgress(1, 0);
    this.khufu.setProgress(0.02, 0);

    this.khufu.registerCollision(this.collision);
    this.khafre.registerCollision(this.collision);
    this.menkaure.registerCollision(this.collision);

    this.ramp = new ConstructionRamp(this.khufu, this.materials.rubble, this.materials.rubble);
    this.group.add(this.ramp.group);
    this.scaffolding = new Scaffolding(this.khufu, this.materials.timber);
    this.group.add(this.scaffolding.group);

    this._buildSatellites();
  }

  _buildSatellites() {
    this.satellites = new THREE.Group();
    this.satellites.name = 'satellite-pyramids';
    this.group.add(this.satellites);
    for (const q of [...QUEENS_PYRAMIDS, ...MENKAURE_QUEENS]) {
      const courses = Math.max(14, Math.round(q.height / 1.35));
      const mesh = new THREE.Mesh(
        steppedPyramidGeometry(q.baseLength / 2, q.height, courses),
        this.materials.limestone
      );
      mesh.position.set(q.x, q.baseY, q.z);
      mesh.name = q.id;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.satellites.add(mesh);
      this.collision.addCenteredBox(
        q.x,
        q.baseY + q.height * 0.3,
        q.z,
        q.baseLength * 0.86,
        q.height * 0.6,
        q.baseLength * 0.86,
        q.id
      );
    }
  }

  /** Drive the Great Pyramid from the project simulation. */
  setKhufuProgress(coreFraction, casingFraction) {
    this.khufu.setProgress(coreFraction, casingFraction);
    const built = this.khufu.designHeight * this.khufu.progress;
    this.ramp.update(built, this.collision);
    this.scaffolding.update(built);
  }

  get khufuBuiltHeight() {
    return this.khufu.designHeight * this.khufu.progress;
  }

  setRampVisible(visible) {
    this.ramp.group.visible = visible;
    this.ramp.visible = visible;
    // Hiding the ramp has to take its collision with it, or the player walks
    // into an embankment that is no longer there.
    this.ramp.setCollisionEnabled(visible);
    this.scaffolding.group.visible = visible;
  }

  dispose() {
    for (const p of this.pyramids.values()) p.dispose();
    this.ramp.dispose();
    this.scaffolding.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
  }
}
