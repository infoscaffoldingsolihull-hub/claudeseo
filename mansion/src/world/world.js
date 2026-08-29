/**
 * World assembly, and the one function that ties the project simulation to
 * what you can see: `applyDay`.
 *
 * Every construction element carries the id of the work package that pays for
 * it and a reveal plane.  `applyDay` asks the project what fraction of each
 * package is complete on a given day and slides that plane accordingly, so the
 * mansion is not animated: it is *computed* from the schedule.  Move the
 * schedule — crash an activity, let a risk bite — and the building changes
 * with it, because there is no second source of truth.
 */
import * as THREE from 'three';
import { createCollisionWorld } from './collision.js';
import { createMaterials, createInteriorFill, setReveal, setXray, setHighlight } from './materials.js';
import { createSky } from './sky.js';
import { buildMansion, LAYER } from './mansion.js';
import { buildSite } from './site.js';
import { buildOpenings } from './openings.js';
import { buildFurnishings } from './furnish.js';
import { buildConstruction } from './construction.js';
import { packageProgress } from '../pm/project.js';
import { PKG_BY_ID } from '../pm/model.js';
import { clamp, smoothstep } from '../engine/rng.js';
import { SITE_LEVEL, PLOT, SHELL, GARAGE, PORTICO, LEVELS, ROOF } from './plan.js';

export function createWorld(ctx) {
  const { textures, quality, project } = ctx;

  const scene = new THREE.Scene();
  scene.name = 'world';

  const collision = createCollisionWorld(4);

  /**
   * The building's interior, as boxes.
   *
   * These are what tells the fill term in the shader which fragments are
   * inside the house — see materials.js, behaviour 4. They are read straight
   * off the plan rather than measured off the geometry, so they cannot drift
   * away from the rooms they describe. The top of the shell box is the roof
   * *soffit*, not the roof, so the roof's upper surface stays outside and is
   * lit by the sky like the rest of the elevation.
   */
  const fill = createInteriorFill();
  const materials = createMaterials(textures, fill);
  fill.setBoxes([
    { x0: SHELL.x0, x1: SHELL.x1, z0: SHELL.z0, z1: SHELL.z1,
      y0: LEVELS[0].floor - 0.05, y1: ROOF.level - 0.34, weight: 1 },
    { x0: GARAGE.x0, x1: GARAGE.x1, z0: GARAGE.z0, z1: GARAGE.z1,
      y0: GARAGE.floor - 0.05, y1: GARAGE.wallTop, weight: 0.8 },
    // The portico is open-sided but roofed, so it is in permanent shade and
    // needs the same treatment: without it the front door reads as a hole.
    { x0: PORTICO.x0, x1: PORTICO.x1, z0: PORTICO.z0, z1: PORTICO.z1,
      y0: SITE_LEVEL - 0.05, y1: PORTICO.entablatureTop, weight: 0.5 },
  ]);
  const tile = materials.tileOf;

  const sky = createSky(scene, { latitude: 31.4805, dayOfYear: 105 });

  const shared = { scene, materials, collision, tile, quality, project };
  const mansion = buildMansion(shared);
  const site = buildSite(shared);
  const openings = buildOpenings(shared);
  const furnish = buildFurnishings(shared);

  /** Every revealable element in the world, from every builder. */
  const elements = [
    ...mansion.elements, ...site.elements, ...openings.elements, ...furnish.elements,
  ];
  const byPackage = new Map();
  for (const el of elements) {
    const list = byPackage.get(el.pkg) || [];
    list.push(el);
    byPackage.set(el.pkg, list);
  }

  let xray = false;
  let highlightPkg = null;
  let currentDay = project.horizon;
  const extras = [];

  /** Register a subsystem that also wants to know about the day. */
  function registerExtra(extra) {
    extras.push(extra);
    if (extra.elements) {
      for (const el of extra.elements) {
        elements.push(el);
        const list = byPackage.get(el.pkg) || [];
        list.push(el);
        byPackage.set(el.pkg, list);
      }
    }
  }

  /**
   * Show or hide one element, keeping its collision boxes in step.
   *
   * Some elements own several meshes that live elsewhere in the graph — the
   * doors and windows, whose leaves are parented to their own hinge groups —
   * so an element may supply its own `setVisible`.
   */
  function setElementActive(el, active) {
    if (el.setVisible) el.setVisible(active);
    else if (el.mesh.visible !== active) el.mesh.visible = active;
    for (const handle of el.collision) collision.setEnabled(handle, active);
  }

  /**
   * Put the world into the state the project is in on `day`.
   *
   * An element that has not started is hidden and non-solid. One in progress
   * is shown with its reveal plane swept from `min` to `max` in proportion to
   * the package's earned progress, and is solid — a half-built wall you can
   * walk through would be worse than one you cannot.
   */
  function applyDay(day) {
    currentDay = day;
    for (const el of elements) {
      if (el.always) {
        setElementActive(el, true);
        setReveal(el.material, null, Infinity);
        continue;
      }
      const p = packageProgress(project, el.pkg, day);
      if (p <= 0) {
        setElementActive(el, false);
        continue;
      }
      setElementActive(el, true);
      if (!el.reveal || p >= 1) {
        setReveal(el.material, el.reveal ? el.reveal.dir : null, Infinity);
      } else {
        const { dir, min, max } = el.reveal;
        // Ease the sweep slightly so a wall does not appear to jump on the
        // first and last day of its package.
        const eased = smoothstep(0, 1, p);
        setReveal(el.material, dir, min + (max - min) * eased);
      }
      if (el.growable) {
        // Planting matures over the months after it goes in.
        const age = clamp((day - project.actual.ef[project.net.index.get(el.pkg)]) / 90, 0, 1);
        el.mesh.scale.setScalar(0.55 + 0.45 * age);
      }
    }
    for (const extra of extras) if (extra.applyDay) extra.applyDay(day);
  }

  /** Enter or leave WBS X-ray. */
  function setXrayMode(on) {
    xray = !!on;
    for (const el of elements) {
      const layer = LAYER[el.layer];
      if (!layer) continue;
      if (xray) {
        // Hide the finishes; tint what is left by its control account.
        if (!layer.xray) {
          if (el.setVisible) el.setVisible(false);
          else el.mesh.visible = false;
        } else {
          setXray(el.material, layer.mix !== undefined ? layer.mix : 0.72, layer.viz);
        }
      } else {
        setXray(el.material, 0);
      }
    }
    // Leaving x-ray restores whatever the current day says should be visible.
    if (!xray) applyDay(currentDay);
    else for (const extra of extras) if (extra.setXray) extra.setXray(true);
    if (!xray) for (const extra of extras) if (extra.setXray) extra.setXray(false);
  }

  /** Highlight the geometry one work package paid for. */
  function setHighlightPackage(pkgId) {
    highlightPkg = pkgId || null;
    for (const el of elements) setHighlight(el.material, 0);
    if (!highlightPkg) return;
    for (const el of byPackage.get(highlightPkg) || []) setHighlight(el.material, 0.28);
  }

  /**
   * The live site — crane, gangs, scaffold, plant, compound.
   *
   * Registered as an extra rather than as a set of elements: the plant is not
   * paid for by a work package and must not be revealed by one, but it does
   * need to be told the day, the frame and the x-ray, which is exactly what an
   * extra receives.
   */
  const construction = buildConstruction(shared);
  registerExtra(construction);

  let pulse = 0;

  function update(dt, camera) {
    sky.update(dt, camera);
    openings.update(dt);
    pulse += dt;
    if (highlightPkg) {
      const amount = 0.18 + 0.16 * (0.5 + 0.5 * Math.sin(pulse * 3.4));
      for (const el of byPackage.get(highlightPkg) || []) setHighlight(el.material, amount);
    }
    for (const extra of extras) if (extra.update) extra.update(dt, camera);
    updateLighting();
  }

  /** A safety net: if the player ever ends up under the world, put them back. */
  function isBelowWorld(position) {
    return position.y < SITE_LEVEL - 6;
  }

  /** Everything the interaction system can pick. */
  const interactives = [...openings.interactives, ...furnish.interactives];

  /**
   * Which meshes cast shadows, by quality tier.
   *
   * The shadow pass draws every caster with no frustum culling against the
   * camera, so on this scene it was costing as much as the main pass. At the
   * lowest tier the finishes and the joinery stop casting: a skirting board's
   * shadow is not what anyone came to see, and dropping them takes a third off
   * the frame on the machines that need it most.
   */
  function setShadowPolicy(tier) {
    const light = tier.name === 'low';
    for (const el of elements) {
      const cast = !(light && (el.layer === 'finish' || el.layer === 'joinery'));
      if (el.mesh && el.mesh.isMesh) el.mesh.castShadow = cast && el.castsShadow !== false;
      if (el.movers) {
        for (const mover of el.movers) {
          for (const m of mover.meshes) {
            m.traverse((node) => {
              if (node.isMesh && node.userData.neverCasts !== true) node.castShadow = cast;
            });
          }
        }
      }
    }
  }

  /**
   * Interior lighting follows the sun: fixtures come on as daylight falls, and
   * the emissive furnishings (the chandeliers) glow with them.
   */
  function updateLighting() {
    fill.setColour(sky.interiorFill);
    const night = 1 - sky.daylight;
    for (const el of elements) {
      if (!el.emissive) continue;
      const m = el.material;
      if (m && m.emissiveIntensity !== undefined) {
        m.emissiveIntensity = el.mesh.visible ? night * 1.6 : 0;
      }
    }
  }

  return {
    scene,
    collision,
    materials,
    fill,
    sky,
    mansion,
    site,
    construction,
    openings,
    furnish,
    interactives,
    updateLighting,
    elements,
    byPackage,
    registerExtra,
    setShadowPolicy,
    applyDay,
    setXrayMode,
    setHighlightPackage,
    update,
    isBelowWorld,
    get xray() { return xray; },
    get day() { return currentDay; },
    get triangleBudget() { return elements.length; },
    packagesWithGeometry() {
      return [...byPackage.keys()].filter((id) => PKG_BY_ID.has(id));
    },
    bounds: { x0: PLOT.x0, x1: PLOT.x1, z0: PLOT.z0, z1: PLOT.z1 },
    dispose() {
      materials.dispose();
      sky.dispose();
    },
  };
}
