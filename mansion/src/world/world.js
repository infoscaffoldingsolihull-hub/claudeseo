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
import { createMaterials, setReveal, setXray, setHighlight } from './materials.js';
import { createSky } from './sky.js';
import { buildMansion, LAYER } from './mansion.js';
import { buildSite } from './site.js';
import { packageProgress } from '../pm/project.js';
import { PKG_BY_ID, CA_BY_ID } from '../pm/model.js';
import { clamp, smoothstep } from '../engine/rng.js';
import { SITE_LEVEL, PLOT } from './plan.js';

export function createWorld(ctx) {
  const { textures, quality, project } = ctx;

  const scene = new THREE.Scene();
  scene.name = 'world';

  const collision = createCollisionWorld(4);
  const materials = createMaterials(textures);
  const tile = materials.tileOf;

  const sky = createSky(scene, { latitude: 31.4805, dayOfYear: 105 });

  const shared = { scene, materials, collision, tile, quality, project };
  const mansion = buildMansion(shared);
  const site = buildSite(shared);

  /** Every revealable element in the world, from every builder. */
  const elements = [...mansion.elements, ...site.elements];
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

  /** Show or hide one element, keeping its collision boxes in step. */
  function setElementActive(el, active) {
    if (el.mesh.visible !== active) el.mesh.visible = active;
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
          el.mesh.visible = false;
        } else {
          const account = CA_BY_ID.get(layer.ca);
          setXray(el.material, layer.mix !== undefined ? layer.mix : 0.72,
            account ? account.colour : layer.colour);
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

  let pulse = 0;

  function update(dt, camera) {
    sky.update(dt, camera);
    pulse += dt;
    if (highlightPkg) {
      const amount = 0.18 + 0.16 * (0.5 + 0.5 * Math.sin(pulse * 3.4));
      for (const el of byPackage.get(highlightPkg) || []) setHighlight(el.material, amount);
    }
    for (const extra of extras) if (extra.update) extra.update(dt, camera);
  }

  /** A safety net: if the player ever ends up under the world, put them back. */
  function isBelowWorld(position) {
    return position.y < SITE_LEVEL - 6;
  }

  return {
    scene,
    collision,
    materials,
    sky,
    mansion,
    site,
    elements,
    byPackage,
    registerExtra,
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
