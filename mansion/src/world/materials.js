/**
 * The material library, and the shader patch that makes every built element
 * revealable, x-rayable and highlightable.
 *
 * Three behaviours are grafted onto three's standard material, because all
 * three need to happen inside the fragment shader and none of them is worth a
 * second render pass:
 *
 *   1. **Reveal.** Every construction element can be cut by a plane:
 *      `dot(worldPosition, uRevealDir) > uRevealDist` is discarded.  A wall
 *      whose reveal direction is +Y grows out of the ground course by course
 *      as its work package progresses; a slab whose direction is +X is poured
 *      bay by bay.  This is what drives the Day 0 → handover timeline, and it
 *      costs one dot product per fragment.
 *
 *   2. **X-ray tint.** In WBS X-ray mode the finishes are hidden and what is
 *      left is tinted by its control account, so the frame, the masonry, the
 *      services and the substructure read as four different systems.
 *
 *   3. **Highlight.** Selecting a work package in the dashboard adds an
 *      emissive wash to exactly the geometry that package paid for.
 *
 *   4. **Interior fill.** A real-time renderer has no global illumination, so
 *      a room whose only light is a directional sun outside it renders black:
 *      the sun is occluded by the walls and nothing bounces.  The fill is the
 *      bounced light, modelled rather than faked — daylight admitted through
 *      the openings during the day, the electric installation after dark —
 *      and it is applied *geometrically*, to fragments that fall inside one of
 *      the building's envelope boxes, so the same wall gets it on its inside
 *      face and not on the sunlit face outside.  One shared set of uniforms
 *      drives it for every material in the world.
 *
 * The patch is applied through `onBeforeCompile`, and every patched material
 * shares one `customProgramCacheKey`, so three compiles the program once and
 * reuses it across all of them.
 */
import * as THREE from 'three';
import { standardFrom } from '../engine/textures.js';

/** Definitions: which procedural texture, how many metres per repeat, tint. */
export const SURFACES = {
  marbleWhite: { tex: 'marbleWhite', tile: 1.8, roughness: 0.9, metalness: 0.02 },
  marbleLocal: { tex: 'marbleWhite', tile: 1.3, colour: 0xe9e2d2, roughness: 0.95 },
  marbleDark: { tex: 'marbleDark', tile: 1.5, roughness: 0.85, metalness: 0.04 },
  tile: { tex: 'tile', tile: 1.6, roughness: 0.9 },
  woodFloor: { tex: 'woodFloor', tile: 2.2, roughness: 1.0 },
  woodDark: { tex: 'woodDark', tile: 1.4, roughness: 1.0 },
  panel: { tex: 'oakPanel', tile: 2.0, roughness: 0.44 },
  carpet: { tex: 'carpet', tile: 1.25, colour: 0xd2c0a8, roughness: 1.0 },
  fabric: { tex: 'fabric', tile: 1.0, colour: 0x7d5a52, roughness: 1.0 },
  // Upholstery is a separate entry from the acoustic fabric above because the
  // two want opposite things: the cinema's wall lining should swallow light,
  // and a sofa in a daylit room should not.
  upholstery: { tex: 'fabric', tile: 1.0, colour: 0xe0c6ad, roughness: 1.0 },
  epoxy: { tex: 'concrete', tile: 2.4, colour: 0x8b9298, roughness: 0.7 },
  plaster: { tex: 'plaster', tile: 2.8, roughness: 1.0 },
  paintWarm: { tex: 'paintWarm', tile: 2.8, roughness: 1.0 },
  wallpaper: { tex: 'paintWarm', tile: 1.9, colour: 0xd9c5a8, roughness: 1.0 },
  concrete: { tex: 'concrete', tile: 2.2, roughness: 1.0 },
  brick: { tex: 'brick', tile: 1.5, roughness: 1.0 },
  sandstone: { tex: 'sandstone', tile: 1.75, roughness: 1.0 },
  limestone: { tex: 'limestone', tile: 1.15, roughness: 1.0 },
  roofScreed: { tex: 'roofScreed', tile: 2.0, roughness: 1.0 },
  grass: { tex: 'grass', tile: 2.6, roughness: 1.0 },
  paver: { tex: 'paver', tile: 2.4, roughness: 1.0 },
  soil: { tex: 'soil', tile: 2.6, roughness: 1.0 },
  gravel: { tex: 'gravel', tile: 2.0, roughness: 1.0 },
  plywood: { tex: 'plywood', tile: 1.6, roughness: 1.0 },
  brass: { tex: 'brass', tile: 0.6, roughness: 0.35, metalness: 0.85 },
  glassClear: { tex: null, colour: 0xbcd6e2, roughness: 0.06, metalness: 0.0, opacity: 0.24, transparent: true },
  steel: { tex: null, colour: 0x8d949c, roughness: 0.42, metalness: 0.9 },
  paintedSteel: { tex: null, colour: 0xd8b431, roughness: 0.55, metalness: 0.35 },
  craneSteel: { tex: null, colour: 0xe0a52a, roughness: 0.62, metalness: 0.28 },
  hiVis: { tex: null, colour: 0xe8a317, roughness: 0.85, metalness: 0.0 },
  workwear: { tex: null, colour: 0x46536b, roughness: 0.95, metalness: 0.0 },
  skin: { tex: null, colour: 0x9a6b4a, roughness: 0.85, metalness: 0.0 },
  water: { tex: 'water', tile: 3.0, colour: 0x2f7f96, roughness: 0.06, metalness: 0.12, opacity: 0.78, transparent: true },
};

const REVEAL_CACHE_KEY = 'mansion-reveal-v2';

/** How many envelope boxes the interior fill can be described by. */
export const FILL_BOX_LIMIT = 4;

/**
 * The uniforms the interior fill shares across every material in the world.
 *
 * Shared *objects*, not copies: `onBeforeCompile` assigns these into each
 * program's uniform map, so setting the colour once here changes every
 * material at once and there is no per-material loop on the frame path.
 */
export function createInteriorFill() {
  const min = [];
  const max = [];
  const weight = [];
  for (let i = 0; i < FILL_BOX_LIMIT; i += 1) {
    min.push(new THREE.Vector3(0, 0, 0));
    max.push(new THREE.Vector3(0, 0, 0));
    weight.push(1);
  }
  const uniforms = {
    uFillColour: { value: new THREE.Color(0, 0, 0) },
    uFillBoxMin: { value: min },
    uFillBoxMax: { value: max },
    uFillWeight: { value: weight },
    uFillCount: { value: 0 },
  };
  return {
    uniforms,
    /**
     * Describe the interior as up to four world-space boxes.
     *
     * `weight` scales the fill inside a box: a fully enclosed room takes the
     * whole of it, a roofed but open-sided space like the portico takes about
     * half, because the sky is already lighting it through its open sides and
     * counting that light twice is what turns a loggia chalk white.
     */
    setBoxes(boxes) {
      const n = Math.min(boxes.length, FILL_BOX_LIMIT);
      for (let i = 0; i < n; i += 1) {
        const b = boxes[i];
        min[i].set(b.x0, b.y0, b.z0);
        max[i].set(b.x1, b.y1, b.z1);
        weight[i] = b.weight !== undefined ? b.weight : 1;
      }
      uniforms.uFillCount.value = n;
      return n;
    },
    /** Set the bounced-light colour. Magnitude is baked into the colour. */
    setColour(colour) { uniforms.uFillColour.value.copy(colour); },
  };
}

/**
 * Graft reveal / x-ray / highlight onto a material and return its uniforms.
 * Safe to call on any of three's built-in materials.
 */
export function makeRevealable(material, fill) {
  const uniforms = {
    uRevealDir: { value: new THREE.Vector3(0, 1, 0) },
    uRevealDist: { value: 1e9 },
    uXrayMix: { value: 0 },
    uXrayColour: { value: new THREE.Color(0x8899aa) },
    uHighlight: { value: 0 },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (fill) Object.assign(shader.uniforms, fill.uniforms);

    shader.vertexShader = `varying vec3 vRevealWorld;
varying vec3 vRevealNormal;
${shader.vertexShader}`
      .replace(
        '#include <beginnormal_vertex>',
        // An instanced mesh's world transform is modelMatrix * instanceMatrix;
        // leaving the instance matrix out puts every instance's reveal plane
        // and fill test at the prototype's origin instead of its own.
        `#include <beginnormal_vertex>
\t#ifdef USE_INSTANCING
\t\tvRevealNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
\t#else
\t\tvRevealNormal = normalize(mat3(modelMatrix) * objectNormal);
\t#endif`,
      )
      .replace(
        '#include <project_vertex>',
        // `transformed` is set by <begin_vertex>, which always runs before this.
        `#ifdef USE_INSTANCING
\t\tvRevealWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
\t#else
\t\tvRevealWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
\t#endif
\t#include <project_vertex>`,
      );

    shader.fragmentShader = `varying vec3 vRevealWorld;
varying vec3 vRevealNormal;
uniform vec3 uRevealDir;
uniform float uRevealDist;
uniform float uXrayMix;
uniform vec3 uXrayColour;
uniform float uHighlight;
uniform vec3 uFillColour;
uniform vec3 uFillBoxMin[${FILL_BOX_LIMIT}];
uniform vec3 uFillBoxMax[${FILL_BOX_LIMIT}];
uniform float uFillWeight[${FILL_BOX_LIMIT}];
uniform int uFillCount;
${shader.fragmentShader}`
      .replace(
        'void main() {',
        'void main() {\n\tif (dot(vRevealWorld, uRevealDir) > uRevealDist) discard;',
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
\t{
\t\tfloat insideEnvelope = 0.0;
\t\tfor (int i = 0; i < ${FILL_BOX_LIMIT}; i++) {
\t\t\tif (i >= uFillCount) break;
\t\t\tif (all(greaterThanEqual(vRevealWorld, uFillBoxMin[i])) && all(lessThanEqual(vRevealWorld, uFillBoxMax[i]))) {
\t\t\t\tinsideEnvelope = max(insideEnvelope, uFillWeight[i]);
\t\t\t}
\t\t}
\t\t// Bounced light is not isotropic: more of it arrives at an upward face
\t\t// off the floor than at a soffit, which is what keeps the fill from
\t\t// flattening a room into a single tone.
\t\tfloat fillGradient = 0.74 + 0.40 * (0.5 + 0.5 * vRevealNormal.y);
\t\t// RECIPROCAL_PI, so uFillColour is in the same units as the intensity\n\t\t// of an ambient or hemisphere light and the three can be reasoned about\n\t\t// together.\n\t\treflectedLight.indirectDiffuse += uFillColour * (insideEnvelope * fillGradient * RECIPROCAL_PI) * diffuseColor.rgb;
\t}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
\tgl_FragColor.rgb = mix(gl_FragColor.rgb, uXrayColour, uXrayMix);
\tgl_FragColor.rgb += uXrayColour * uHighlight;`,
      );
  };

  // One cache key for every patched material, so the program is compiled once.
  material.customProgramCacheKey = () => REVEAL_CACHE_KEY;
  material.userData.reveal = uniforms;
  return uniforms;
}

/** Set a material's reveal plane. `dist` of Infinity means fully built. */
export function setReveal(material, dir, dist) {
  const u = material && material.userData && material.userData.reveal;
  if (!u) return;
  if (dir) u.uRevealDir.value.set(dir[0], dir[1], dir[2]);
  u.uRevealDist.value = Number.isFinite(dist) ? dist : 1e9;
}

export function setXray(material, mix, colour) {
  const u = material && material.userData && material.userData.reveal;
  if (!u) return;
  u.uXrayMix.value = mix;
  if (colour !== undefined) u.uXrayColour.value.set(colour);
}

export function setHighlight(material, amount) {
  const u = material && material.userData && material.userData.reveal;
  if (!u) return;
  u.uHighlight.value = amount;
}

/**
 * Build the library. `make(name, opts)` returns a *fresh* revealable material
 * every time, because each construction element needs its own reveal plane;
 * the textures behind them are shared, and so is the compiled program.
 */
export function createMaterials(textures, fill) {
  const created = [];

  function make(name, opts = {}) {
    const def = SURFACES[name];
    if (!def) throw new Error(`unknown surface "${name}"`);
    let material;
    if (def.tex) {
      // World-space UVs are already in metres-per-repeat, so the texture
      // itself stays at repeat 1 and the geometry does the tiling.
      const set = textures.get(def.tex);
      material = standardFrom(set, {
        roughness: def.roughness !== undefined ? def.roughness : 0.9,
        metalness: def.metalness !== undefined ? def.metalness : 0.0,
      });
      if (def.colour !== undefined) material.color.setHex(def.colour);
    } else {
      material = new THREE.MeshStandardMaterial({
        color: def.colour !== undefined ? def.colour : 0xffffff,
        roughness: def.roughness !== undefined ? def.roughness : 0.8,
        metalness: def.metalness !== undefined ? def.metalness : 0.0,
      });
    }
    if (def.transparent) {
      material.transparent = true;
      material.opacity = def.opacity !== undefined ? def.opacity : 1;
      material.depthWrite = false;
    }
    if (opts.colour !== undefined) material.color.setHex(opts.colour);
    if (opts.roughness !== undefined) material.roughness = opts.roughness;
    if (opts.metalness !== undefined) material.metalness = opts.metalness;
    if (opts.emissive !== undefined) material.emissive.setHex(opts.emissive);
    if (opts.emissiveIntensity !== undefined) material.emissiveIntensity = opts.emissiveIntensity;
    if (opts.side !== undefined) material.side = opts.side;
    if (opts.transparent !== undefined) {
      material.transparent = opts.transparent;
      material.depthWrite = opts.depthWrite !== undefined ? opts.depthWrite : !opts.transparent;
    }
    if (opts.opacity !== undefined) material.opacity = opts.opacity;
    if (opts.flatShading) material.flatShading = true;

    material.name = name;
    makeRevealable(material, fill);
    created.push(material);
    return material;
  }

  /** The metres-per-repeat figure the geometry builder should use. */
  function tileOf(name) {
    const def = SURFACES[name];
    return def && def.tile ? def.tile : 1;
  }

  return {
    make,
    tileOf,
    get all() { return created; },
    dispose() {
      for (const m of created) m.dispose();
      created.length = 0;
    },
  };
}
