/**
 * AEON SPIRE — the construction site (E.7, Phase 9).
 *
 * Turns the ConstructionTimeline's state into something you can watch:
 *
 *   • A build-height clipping plane rises through the programme, so the
 *     finished tower is genuinely revealed course by course rather than
 *     popped in whole. Zones off the critical path (the Reflection Court,
 *     the Wonder Annex) appear at their own milestones.
 *   • Glazing is suppressed until the facade package (milestone 8), so the
 *     structure stands as bare frame first — which is the single most
 *     legible signal that you are watching a building go up.
 *   • Site works: hoarding, huts, the excavation, piles, the raft, rebar
 *     cages, formwork, scaffold, stockpiles and a haul road.
 *   • Plant: tower, crawler and self-jacking climbing cranes; excavators,
 *     a pile rig, mixer and pump trucks, glazing lorries, cherry-pickers.
 *   • A crew of instanced workers with idle / walk / work loops.
 */

import * as THREE from 'three';
import { MILESTONES, TOTAL_DAYS } from './ConstructionTimeline.js';
import { CANAL, SAIL, RING, SPIRE, COURT, ANNEX, OBSERVATORY, LEVELS, SITE } from '../world/SitePlan.js';
import {
  mergeGeometries, xform, box, cyl, mesh, instance, member, tube, loft,
  circleRing, roundedRectRing, flag
} from '../world/BuildKit.js';
import { TAU, lerp, clamp, rng, smoothstep } from '../core/MathUtil.js';
import { towerCrane, crawlerCrane, climbingCrane } from './Crane.js';
import {
  excavator, pileRig, mixerTruck, pumpTruck, flatbedTruck, cherryPicker, pathFollower
} from './Truck.js';
import { WorkerCrew } from './Worker.js';

/**
 * The build height reached at the end of each milestone. This is the curve
 * that drives the clipping plane, and it is the heart of the illusion.
 */
const BUILD_HEIGHT = [
  -12,                    // 1 clearing — nothing above ground
  -8,                     // 2 excavation — the pit
  LEVELS.B1,              // 3 foundation & raft
  LEVELS.podiumTop + 26,  // 4 core & podium
  SAIL.top,               // 5 sail steel
  RING.top,               // 6 ring deck
  SPIRE.tip,              // 7 topping out
  SPIRE.tip,              // 8 facade
  SPIRE.tip,              // 9 fit-out
  SPIRE.tip               // 10 completion
];

/** The milestone at which the facade (all glazing) starts to go on. */
const FACADE_MILESTONE = 8;

export class ConstructionSite {
  /**
   * @param {THREE.Scene} scene
   * @param {MaterialLibrary} materials
   * @param {SceneManager} world
   * @param {ConstructionTimeline} timeline
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(scene, materials, world, timeline, renderer, { tier } = {}) {
    this.scene = scene;
    this.materials = materials;
    this.world = world;
    this.timeline = timeline;
    this.renderer = renderer;
    this.tier = tier;

    /* Local clipping lets the finished building be revealed by height while
       the site plant, which is created with noClip, stays whole. */
    renderer.localClippingEnabled = true;
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), SPIRE.tip + 50);
    materials.setBuildClip(this.clipPlane);

    this.group = new THREE.Group();
    this.group.name = 'ConstructionSite';
    this.group.visible = false;
    scene.add(this.group);

    this.plant = [];
    this.followers = [];
    this.stages = [];        // { obj, from, to } visibility by milestone
    this.built = false;
  }

  /** Build everything once, on the first entry into construction mode. */
  build() {
    if (this.built) return;
    this.built = true;
    this.buildGround();
    this.buildHoarding();
    this.buildCompound();
    this.buildExcavation();
    this.buildPiles();
    this.buildRaft();
    this.buildRebarAndFormwork();
    this.buildScaffold();
    this.buildStockpiles();
    this.buildCranes();
    this.buildVehicles();
    this.buildCrew();
    this.buildRibbon();
  }

  /** Show `obj` only between milestones `from` and `to` (both inclusive). */
  stage(obj, from, to = 10) {
    obj.visible = false;
    this.stages.push({ obj, from, to });
    return obj;
  }

  /* ------------------------------------------------------------------ */
  /* Site works                                                          */
  /* ------------------------------------------------------------------ */

  /** Churned, muddy ground over the whole working area. */
  buildGround() {
    const M = this.materials;
    const mat = M.surface('siteMud', 'siteGround', {
      repeat: 44, roughness: 0.96, exterior: true, noClip: true
    });
    const g = new THREE.CircleGeometry(CANAL.outerRadius + 96, 72);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * 0.02, pos.getZ(i) * 0.02);
    this.ground = mesh(xform(g, { pos: [0, 0.34, 0] }), mat, {
      name: 'SiteGround', receive: true
    });
    this.group.add(this.ground);

    /* The haul road: a compacted loop the trucks run on. */
    const road = M.solid('haulRoad', {
      color: 0x54503f, roughness: 0.98, exterior: true, noClip: true
    });
    const ring = new THREE.RingGeometry(CANAL.outerRadius + 30, CANAL.outerRadius + 44, 64, 1);
    ring.rotateX(-Math.PI / 2);
    this.group.add(mesh(xform(ring, { pos: [0, 0.4, 0] }), road, {
      name: 'HaulRoad', receive: true
    }));
  }

  /** Site hoarding with a gate, ringing the works. */
  buildHoarding() {
    const M = this.materials;
    const panel = M.solid('hoardingPanel', {
      color: 0x2f6ea8, roughness: 0.72, exterior: true, noClip: true
    });
    const postMat = M.solid('hoardingPost', {
      color: 0x4a4d52, roughness: 0.6, metalness: 0.4, exterior: true, noClip: true
    });
    const R = CANAL.outerRadius + 62;
    const n = 96;
    const panels = [], posts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      // Leave a gate on the approach axis.
      if (Math.abs(((a + Math.PI) % TAU) - Math.PI) < 0.12) continue;
      // Panels stand tangentially to the ring: three.js maps local +X to
      // (cos φ, -sin φ), so the tangent at bearing a needs φ = -(a + π/2).
      const face = -(a + Math.PI / 2);
      panels.push({ pos: [Math.cos(a) * R, 0.4, Math.sin(a) * R], rot: [0, face, 0] });
      posts.push({ pos: [Math.cos(a) * R, 0.4, Math.sin(a) * R], rot: [0, face, 0] });
    }
    const pg = box(R * TAU / n * 1.02, 2.4, 0.08, [0, 1.2, 0]);
    const pp = box(0.14, 2.7, 0.14, [R * TAU / n * 0.5, 1.35, 0]);
    this.group.add(instance(pg, panel, panels, { name: 'Hoarding', castShadow: true }));
    this.group.add(instance(pp, postMat, posts, { name: 'HoardingPosts' }));

    /* Gate frame and a site sign. */
    const signMat = M.solid('siteSign', {
      color: 0xe0b81f, roughness: 0.7, exterior: true, noClip: true
    });
    this.group.add(mesh(mergeGeometries([
      box(0.3, 5.0, 0.3, [-7, 2.5, R]),
      box(0.3, 5.0, 0.3, [7, 2.5, R]),
      box(14.6, 0.4, 0.3, [0, 5.0, R])
    ]), postMat, { name: 'SiteGate', cast: true }));
    this.group.add(mesh(box(6.0, 2.0, 0.12, [0, 3.6, R - 0.3]), signMat, { name: 'SiteSign' }));
  }

  /** The site compound: stacked cabins, a welfare unit, parking. */
  buildCompound() {
    const M = this.materials;
    const cabin = M.solid('siteCabin', {
      color: 0xd8d4c8, roughness: 0.72, exterior: true, noClip: true
    });
    const trim = M.solid('siteCabinTrim', {
      color: 0x2f5f8a, roughness: 0.6, metalness: 0.3, exterior: true, noClip: true
    });
    const cx = -(CANAL.outerRadius + 48), cz = -(CANAL.outerRadius - 30);

    const bodies = [], trims = [];
    const r = rng(3030);
    for (let i = 0; i < 8; i++) {
      const row = Math.floor(i / 4), col = i % 4;
      const px = cx + col * 7.2, pz = cz + row * 13;
      bodies.push({ pos: [px, 0.5, pz] });
      trims.push({ pos: [px, 0.5, pz] });
      // A second storey on half of them, as compounds always end up.
      if (r() > 0.5) {
        bodies.push({ pos: [px, 3.3, pz] });
        trims.push({ pos: [px, 3.3, pz] });
      }
    }
    const cabinGeo = mergeGeometries([
      box(6.4, 2.7, 11.6, [0, 1.35, 0]),
      box(6.7, 0.2, 11.9, [0, 2.75, 0])
    ]);
    const trimGeo = mergeGeometries([
      box(1.0, 1.9, 0.1, [-2.0, 1.1, 5.85]),
      box(1.6, 1.0, 0.1, [0.6, 1.6, 5.85]),
      box(1.6, 1.0, 0.1, [0.6, 1.6, -5.85])
    ]);
    this.group.add(instance(cabinGeo, cabin, bodies, {
      name: 'SiteCabins', castShadow: true, receiveShadow: true
    }));
    this.group.add(instance(trimGeo, trim, trims, { name: 'SiteCabinTrim' }));

    /* Stair towers to the upper cabins. */
    const stairs = [];
    for (let i = 0; i < 3; i++) {
      const px = cx + i * 14.4 + 3.6;
      for (let s = 0; s < 9; s++) {
        stairs.push(box(1.4, 0.16, 0.6, [px, 0.6 + s * 0.32, cz + 6.4 + s * 0.55]));
      }
    }
    this.group.add(mesh(mergeGeometries(stairs), trim, { name: 'CompoundStairs', cast: true }));
  }

  /** The excavation: a stepped pit with battered sides (milestones 1-3). */
  buildExcavation() {
    const M = this.materials;
    const mat = M.surface('excavationFace', 'siteGround', {
      repeat: 20, roughness: 0.98, exterior: true, noClip: true, color: 0x8a7b62
    });
    const parts = [];
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const rOuter = lerp(CANAL.innerRadius - 4, CANAL.podiumHalf - 34, t);
      const y0 = lerp(0.3, LEVELS.B2 - 3, t);
      const y1 = lerp(0.3, LEVELS.B2 - 3, (i + 1) / steps);
      parts.push(loft(() => circleRing(rOuter, 64), [y1, y0], { capTop: false, capBottom: false }));
      const bench = new THREE.RingGeometry(
        lerp(CANAL.innerRadius - 4, CANAL.podiumHalf - 34, (i + 1) / steps),
        rOuter, 64, 1);
      bench.rotateX(-Math.PI / 2);
      parts.push(xform(bench, { pos: [0, y1, 0] }));
    }
    // Pit floor.
    const floor = new THREE.CircleGeometry(CANAL.podiumHalf - 34, 48);
    floor.rotateX(-Math.PI / 2);
    parts.push(xform(floor, { pos: [0, LEVELS.B2 - 3, 0] }));

    this.excavation = mesh(mergeGeometries(parts), mat, {
      name: 'Excavation', receive: true
    });
    this.group.add(this.stage(this.excavation, 2, 4));

    /* A haul ramp down into the pit. */
    const ramp = [];
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      const y = lerp(0.3, LEVELS.B2 - 3, t);
      const rr = lerp(CANAL.innerRadius - 6, 20, t);
      const a = t * 2.6;
      ramp.push(box(9, 0.5, 12, [Math.cos(a) * rr, y, Math.sin(a) * rr], [0, -a, 0]));
    }
    const rampMesh = mesh(mergeGeometries(ramp), mat, { name: 'HaulRamp', receive: true });
    this.group.add(this.stage(rampMesh, 2, 4));
  }

  /** Bored piles and their guide casings (milestone 2-3). */
  buildPiles() {
    const M = this.materials;
    const conc = M.solid('pileConcrete', {
      color: 0x9a968c, roughness: 0.92, exterior: true, noClip: true
    });
    const casing = M.solid('pileCasing', {
      color: 0x6b5f4c, roughness: 0.75, metalness: 0.4, exterior: true, noClip: true
    });
    const r = rng(1212);
    const xs = [], cs = [];
    const R = CANAL.podiumHalf - 36;
    for (let ring = 0; ring < 5; ring++) {
      const rad = (ring / 4) * R;
      const n = ring === 0 ? 1 : Math.round(6 + ring * 6);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + ring * 0.3;
        const p = [Math.cos(a) * rad, LEVELS.B2 - 3, Math.sin(a) * rad];
        xs.push({ pos: p });
        if (r() > 0.55) cs.push({ pos: [p[0], LEVELS.B2 - 2.4, p[2]] });
      }
    }
    this.pileCount = xs.length;
    const pileGeo = cyl(0.65, 0.65, 8, 10, [0, 4, 0]);
    const casingGeo = cyl(0.82, 0.82, 2.2, 12, [0, 1.1, 0], null, true);
    const piles = instance(pileGeo, conc, xs, { name: 'BoredPiles', castShadow: true });
    const casings = instance(casingGeo, casing, cs, { name: 'PileCasings' });
    this.group.add(this.stage(piles, 2, 3));
    this.group.add(this.stage(casings, 2, 3));
    this.pileInstances = piles;
    this.pileTransforms = xs;
  }

  /** The reinforced-concrete raft the podium sits on (milestone 3-4). */
  buildRaft() {
    const M = this.materials;
    const mat = M.surface('raftConcrete', 'polishedConcrete', {
      repeat: 12, roughness: 0.94, exterior: true, noClip: true, color: 0xa8a49a
    });
    const geo = loft(
      () => roundedRectRing(CANAL.podiumHalf - 30, CANAL.podiumHalf - 30, 24, 40),
      [LEVELS.B2 - 3, LEVELS.B2 + 0.6], { capTop: true, capBottom: true }
    );
    this.raft = mesh(geo, mat, { name: 'RaftSlab', cast: true, receive: true });
    this.group.add(this.stage(this.raft, 3, 5));
  }

  /** Rebar cages and climbing formwork on the rising core (milestone 4-6). */
  buildRebarAndFormwork() {
    const M = this.materials;
    const rebarMat = M.solid('rebar', {
      color: 0x7a6247, roughness: 0.8, metalness: 0.5, exterior: true, noClip: true
    });
    const formMat = M.solid('formwork', {
      color: 0xc4a878, roughness: 0.8, exterior: true, noClip: true
    });

    /* A rebar mat over the raft. */
    const bars = [];
    const S = CANAL.podiumHalf - 32;
    for (let i = -12; i <= 12; i++) {
      bars.push(box(S * 2, 0.05, 0.05, [0, LEVELS.B2 + 0.75, i * (S / 12)]));
      bars.push(box(0.05, 0.05, S * 2, [i * (S / 12), LEVELS.B2 + 0.85, 0]));
    }
    const mat1 = mesh(mergeGeometries(bars), rebarMat, { name: 'RebarMat' });
    this.group.add(this.stage(mat1, 3, 4));

    /**
     * The climbing formwork that rides the core. It is repositioned each
     * frame to sit just under the current build height, which is what makes
     * the core read as being slipformed upward.
     */
    const form = new THREE.Group();
    form.name = 'ClimbingFormwork';
    const panels = [];
    const half = SAIL.baseHalfX * 0.62;
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      panels.push(box(sx ? 1.0 : half * 2, 5.2, sz ? 1.0 : half * 1.6,
        [sx * half, 2.6, sz * half * 0.8]));
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      panels.push(box(1.6, 6.4, 1.6, [Math.cos(a) * half * 1.05, 3.2, Math.sin(a) * half * 0.85]));
    }
    form.add(mesh(mergeGeometries(panels), formMat, { name: 'FormworkPanels', cast: true }));
    // A working platform with guardrails.
    form.add(mesh(mergeGeometries([
      box(half * 2.6, 0.14, half * 2.2, [0, 5.4, 0]),
      box(half * 2.6, 1.05, 0.06, [0, 6.0, half * 1.1]),
      box(half * 2.6, 1.05, 0.06, [0, 6.0, -half * 1.1]),
      box(0.06, 1.05, half * 2.2, [half * 1.3, 6.0, 0]),
      box(0.06, 1.05, half * 2.2, [-half * 1.3, 6.0, 0])
    ]), rebarMat, { name: 'FormworkPlatform', cast: true }));
    this.formwork = form;
    this.group.add(this.stage(form, 4, 7));

    /* Protruding starter bars at the top of the pour. */
    const starters = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      starters.push(cyl(0.04, 0.04, 1.8, 5,
        [Math.cos(a) * half * 0.95, 6.5, Math.sin(a) * half * 0.8]));
    }
    form.add(mesh(mergeGeometries(starters), rebarMat, { name: 'StarterBars' }));
  }

  /** Perimeter scaffold and a mast climber on the podium (milestone 4-9). */
  buildScaffold() {
    const M = this.materials;
    const tubeMat = M.solid('scaffoldTube', {
      color: 0x9aa0a8, roughness: 0.5, metalness: 0.6, exterior: true, noClip: true
    });
    const deckMat = M.solid('scaffoldDeck', {
      color: 0xb59a6e, roughness: 0.85, exterior: true, noClip: true
    });

    const parts = [], decks = [];
    const R = CANAL.podiumHalf + 3;
    const lifts = 9;
    const bays = 40;
    for (let b = 0; b < bays; b++) {
      const a = (b / bays) * TAU;
      const p = roundedRectRing(R, R, 34, bays)[b];
      const p2 = roundedRectRing(R + 1.4, R + 1.4, 34, bays)[b];
      for (const q of [p, p2]) {
        parts.push(cyl(0.05, 0.05, lifts * 2.0, 5, [q[0], LEVELS.B2 + lifts, q[1]]));
      }
      for (let l = 0; l <= lifts; l++) {
        const y = LEVELS.B2 + l * 2.0;
        const nb = roundedRectRing(R, R, 34, bays)[(b + 1) % bays];
        const m = member([p[0], y, p[1]], [nb[0], y, nb[1]], 0.045, 0.045);
        if (m) parts.push(m);
        parts.push(member([p[0], y, p[1]], [p2[0], y, p2[1]], 0.045, 0.045));
        if (l > 0 && l % 2 === 0) {
          decks.push(member([p[0], y, p[1]], [nb[0], y, nb[1]], 1.5, 0.06));
        }
      }
    }
    this.scaffold = mesh(mergeGeometries(parts.filter(Boolean)), tubeMat, {
      name: 'PerimeterScaffold', cast: true
    });
    this.scaffoldDecks = mesh(mergeGeometries(decks.filter(Boolean)), deckMat, {
      name: 'ScaffoldDecks', cast: true
    });
    this.group.add(this.stage(this.scaffold, 4, 9));
    this.group.add(this.stage(this.scaffoldDecks, 4, 9));

    /* A mast climber that rides the facade during the glazing package. */
    const climber = new THREE.Group();
    climber.name = 'MastClimber';
    climber.add(mesh(mergeGeometries([
      box(8.0, 0.2, 2.4, [0, 0, 0]),
      box(8.0, 1.1, 0.06, [0, 0.55, 1.2]),
      box(8.0, 1.1, 0.06, [0, 0.55, -1.2]),
      box(0.06, 1.1, 2.4, [4, 0.55, 0]),
      box(0.06, 1.1, 2.4, [-4, 0.55, 0])
    ]), tubeMat, { name: 'ClimberPlatform', cast: true }));
    climber.position.set(SAIL.baseHalfX + 3, 30, 0);
    this.mastClimber = climber;
    this.group.add(this.stage(climber, 8, 9));
    const mastGeo = [];
    for (let i = 0; i < 60; i++) mastGeo.push(box(0.9, 0.12, 0.9, [0, i * 2.4, 0]));
    mastGeo.push(cyl(0.1, 0.1, 145, 6, [0.4, 72, 0.4]));
    mastGeo.push(cyl(0.1, 0.1, 145, 6, [-0.4, 72, -0.4]));
    const mast = mesh(mergeGeometries(mastGeo), tubeMat, { name: 'ClimberMast', cast: true });
    mast.position.set(SAIL.baseHalfX + 3, LEVELS.podiumTop, 0);
    this.group.add(this.stage(mast, 8, 9));
  }

  /** Material stockpiles, skips and a rebar yard. */
  buildStockpiles() {
    const M = this.materials;
    const steel = M.solid('stockSteel', {
      color: 0x8d949c, roughness: 0.5, metalness: 0.7, exterior: true, noClip: true
    });
    const timberMat = M.solid('stockTimber', {
      color: 0xb08a55, roughness: 0.85, exterior: true, noClip: true
    });
    const skipMat = M.solid('siteSkip', {
      color: 0xc4552e, roughness: 0.7, metalness: 0.3, exterior: true, noClip: true
    });
    const glassMat = M.glass('stockGlazing', {
      color: 0xa8cfe0, opacity: 0.5, roughness: 0.1, exterior: true, noClip: true
    });

    const r = rng(808);
    const base = CANAL.outerRadius + 20;

    /* Steel sections in racked bundles. */
    const bundles = [];
    for (let i = 0; i < 10; i++) {
      const a = 0.7 + i * 0.09;
      const px = Math.cos(a) * base, pz = Math.sin(a) * base;
      for (let k = 0; k < 6; k++) {
        bundles.push(box(0.4, 0.4, 9, [px + (k % 3) * 0.45, 0.6 + Math.floor(k / 3) * 0.45, pz], [0, -a, 0]));
      }
    }
    this.group.add(mesh(mergeGeometries(bundles), steel, { name: 'SteelStockpile', cast: true }));

    /* Formwork timber and pallets. */
    const timber = [];
    for (let i = 0; i < 8; i++) {
      const a = 1.9 + i * 0.08;
      const px = Math.cos(a) * base, pz = Math.sin(a) * base;
      timber.push(box(2.6, 1.2, 4.2, [px, 1.0, pz], [0, -a, 0]));
    }
    this.group.add(mesh(mergeGeometries(timber), timberMat, { name: 'TimberStockpile', cast: true }));

    /* Glazing stillages, staged for the facade package. */
    const stillages = [];
    const frames = [];
    for (let i = 0; i < 9; i++) {
      const a = 3.1 + i * 0.075;
      const px = Math.cos(a) * base, pz = Math.sin(a) * base;
      frames.push(box(0.16, 3.0, 2.4, [px, 1.9, pz], [0, -a, 0]));
      for (const sx of [-1, 1]) {
        stillages.push(box(0.1, 2.7, 2.1, [px + Math.cos(-a) * sx * 0.4, 1.9, pz + Math.sin(-a) * sx * 0.4], [0, -a, sx * 0.1]));
      }
    }
    const stillageMesh = mesh(mergeGeometries(frames), steel, { name: 'GlazingStillages', cast: true });
    const paneMesh = mesh(mergeGeometries(stillages), glassMat, { name: 'StagedGlazing', cast: true });
    this.group.add(this.stage(stillageMesh, 6, 9));
    this.group.add(this.stage(paneMesh, 6, 9));

    /* Skips. */
    const skips = [];
    for (let i = 0; i < 6; i++) {
      const a = 4.5 + i * 0.14;
      skips.push({ pos: [Math.cos(a) * base, 0.4, Math.sin(a) * base], rot: [0, -a, 0] });
    }
    const skipGeo = mergeGeometries([
      box(2.2, 1.3, 4.4, [0, 0.75, 0]),
      box(2.4, 0.12, 4.6, [0, 0.15, 0])
    ]);
    this.group.add(instance(skipGeo, skipMat, skips, { name: 'Skips', castShadow: true }));
  }

  /* ------------------------------------------------------------------ */
  /* Plant                                                               */
  /* ------------------------------------------------------------------ */

  buildCranes() {
    const M = this.materials;

    /* Two tower cranes flanking the core (milestones 4-8). */
    this.towerCranes = [];
    const positions = [
      [SAIL.baseHalfX + 26, 0, 34],
      [-(SAIL.baseHalfX + 26), 0, -34]
    ];
    for (let i = 0; i < positions.length; i++) {
      const c = towerCrane(M, {
        mastHeight: 70, jibLength: 62, counterJib: 22, seed: 11 + i,
        x: positions[i][0], z: positions[i][2]
      });
      this.group.add(this.stage(c.group, 4, 8));
      this.towerCranes.push(c);
      this.plant.push(c);
    }

    /* A crawler crane for the sail's steel erection (milestone 5-6). */
    this.crawler = crawlerCrane(M, {
      boom: 56, seed: 21, x: SAIL.baseHalfX + 52, z: -20, rot: -2.2
    });
    this.group.add(this.stage(this.crawler.group, 5, 6));
    this.plant.push(this.crawler);

    /* The self-jacking climbing crane that tops the spire out (milestone 7). */
    this.climber = climbingCrane(M, { seed: 31, x: 0, z: 0, mastHeight: 40 });
    this.group.add(this.stage(this.climber.group, 6, 8));
    this.plant.push(this.climber);
  }

  buildVehicles() {
    const M = this.materials;
    const R = CANAL.outerRadius + 37;
    const road = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      road.push([Math.cos(a) * R, 0.75, Math.sin(a) * R]);
    }

    this.vehicles = [];

    /* Excavators and the pile rig, in the pit (milestones 1-3). */
    for (let i = 0; i < 3; i++) {
      const a = 0.5 + i * 2.1;
      const ex = excavator(M, {
        x: Math.cos(a) * 40, z: Math.sin(a) * 40, rot: -a, seed: 40 + i
      });
      ex.group.position.y = LEVELS.B2 - 2.6;
      this.group.add(this.stage(ex.group, 1, 3));
      this.plant.push(ex);
    }
    this.pileRig = pileRig(M, { x: -26, z: 22, rot: 1.1, seed: 50 });
    this.pileRig.group.position.y = LEVELS.B2 - 2.6;
    this.group.add(this.stage(this.pileRig.group, 2, 3));
    this.plant.push(this.pileRig);

    /* Concrete: pump truck at the raft, mixers circulating (milestone 3-5). */
    this.pump = pumpTruck(M, { seed: 60 });
    this.pump.group.position.set(-CANAL.innerRadius + 12, 0.4, 30);
    this.pump.group.rotation.y = 1.9;
    this.group.add(this.stage(this.pump.group, 3, 5));
    this.plant.push(this.pump);

    for (let i = 0; i < 4; i++) {
      const t = mixerTruck(M, { seed: 70 + i });
      this.group.add(this.stage(t.group, 2, 6));
      this.plant.push(t);
      this.followers.push({
        follower: pathFollower(t.group, road, { speed: 8.5, offset: i / 4 }),
        from: 2, to: 6, obj: t.group
      });
    }

    /* Flatbeds: steel during erection, glazing during the facade package. */
    for (let i = 0; i < 2; i++) {
      const t = flatbedTruck(M, { cargo: 'steel', seed: 80 + i });
      this.group.add(this.stage(t.group, 5, 7));
      this.plant.push(t);
      this.followers.push({
        follower: pathFollower(t.group, road, { speed: 7, offset: 0.15 + i / 2 }),
        from: 5, to: 7, obj: t.group
      });
    }
    for (let i = 0; i < 3; i++) {
      const t = flatbedTruck(M, { cargo: 'glass', seed: 90 + i });
      this.group.add(this.stage(t.group, 7, 9));
      this.plant.push(t);
      this.followers.push({
        follower: pathFollower(t.group, road, { speed: 7.5, offset: i / 3 }),
        from: 7, to: 9, obj: t.group
      });
    }

    /* Cherry-pickers on the podium facade (milestone 8-9). */
    this.pickers = [];
    for (let i = 0; i < 4; i++) {
      const a = 0.4 + i * 1.5;
      const p = cherryPicker(M, {
        x: Math.cos(a) * (CANAL.podiumHalf + 12), z: Math.sin(a) * (CANAL.podiumHalf + 12),
        rot: -a + Math.PI, seed: 100 + i, reach: 28
      });
      this.group.add(this.stage(p.group, 8, 9));
      this.plant.push(p);
      this.pickers.push(p);
    }
  }

  buildCrew() {
    const count = Math.round(90 * (this.tier ? this.tier.particles : 1));
    this.crew = new WorkerCrew(this.materials, Math.max(28, count), { seed: 777 });
    this.crew.deploy([
      { x: 0, z: 0, y: LEVELS.B2 - 2.6, radius: 40 },
      { x: 46, z: 30, y: LEVELS.B2 - 2.6, radius: 22 },
      { x: -50, z: -18, y: 0.4, radius: 26 },
      { x: 0, z: CANAL.outerRadius + 38, y: 0.5, radius: 30 },
      { x: -(CANAL.outerRadius + 44), z: -(CANAL.outerRadius - 26), y: 0.5, radius: 18 },
      { x: CANAL.podiumHalf + 14, z: 0, y: 0.5, radius: 20 }
    ]);
    this.group.add(this.crew.group);
  }

  /** The ribbon-cutting of milestone 10, and its night light show. */
  buildRibbon() {
    const M = this.materials;
    const ribbonMat = M.solid('openingRibbon', {
      color: 0xd83a4a, roughness: 0.7, side: THREE.DoubleSide, exterior: true,
      wind: true, noClip: true
    });
    const postMat = M.solid('ribbonPost', {
      color: 0xc9a04b, roughness: 0.3, metalness: 0.85, exterior: true, noClip: true
    });
    const g = new THREE.Group();
    g.name = 'RibbonCutting';
    g.position.set(0, CANAL.copingLevel, CANAL.outerRadius + 22);
    g.add(mesh(mergeGeometries([
      cyl(0.09, 0.13, 2.4, 10, [-7, 1.2, 0]),
      cyl(0.09, 0.13, 2.4, 10, [7, 1.2, 0]),
      cyl(0.2, 0.2, 0.2, 12, [-7, 2.5, 0]),
      cyl(0.2, 0.2, 0.2, 12, [7, 2.5, 0])
    ]), postMat, { name: 'RibbonPosts', cast: true }));
    const ribbon = new THREE.PlaneGeometry(14, 0.55, 24, 1);
    ribbon.translate(0, 2.1, 0);
    g.add(mesh(ribbon, ribbonMat, { name: 'Ribbon' }));
    this.ribbon = g;
    this.group.add(this.stage(g, 10, 10));
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame                                                           */
  /* ------------------------------------------------------------------ */

  update(dt, elapsed) {
    const tl = this.timeline;
    const blend = tl.blend;

    if (blend > 0.001 && !this.built) this.build();
    this.group.visible = blend > 0.005;

    /* --- The clipping plane that reveals the building --- */
    const i = tl.milestoneIndex;
    const p = tl.milestoneProgress;
    const h0 = i === 0 ? BUILD_HEIGHT[0] : BUILD_HEIGHT[i - 1];
    const h1 = BUILD_HEIGHT[i];
    const height = lerp(h0, h1, smoothstep(p));
    // Off construction mode, the plane retreats above the tip so nothing clips.
    this.buildHeight = lerp(SPIRE.tip + 60, height, blend);
    this.clipPlane.constant = this.buildHeight;
    this.materials.setBuildClipEnabled(blend > 0.005);

    /* Restore the landscaping whenever construction mode is off. */
    if (blend <= 0.005 && this.world.landscape) this.world.landscape.visible = true;

    /* --- Zone visibility: off-critical-path zones arrive at their own
           milestone, and everything is present again outside the mode --- */
    const stageZones = MILESTONES[i].zones;
    for (const zone of this.world.zones) {
      const wanted = blend < 0.005 ? true : stageZones.includes(zone.id);
      if (zone.group.visible !== wanted) zone.group.visible = wanted;
    }

    /* --- Glazing waits for the facade package (milestone 8) --- */
    const facade = clamp((tl.day - MILESTONES[FACADE_MILESTONE - 2].day) /
      Math.max(1, MILESTONES[FACADE_MILESTONE - 1].day - MILESTONES[FACADE_MILESTONE - 2].day), 0, 1);
    this.materials.setGlazingReveal(lerp(1, facade, blend));

    if (!this.built || blend <= 0.005) return;

    /* --- Stage visibility --- */
    const ms = i + 1;
    for (const s of this.stages) {
      s.obj.visible = ms >= s.from && ms <= s.to;
    }

    /* --- Plant --- */
    const crane = tl.craneActivity;
    const work = tl.workerActivity;
    const truck = tl.truckActivity;

    // The tower cranes grow with the building.
    for (const c of this.towerCranes) {
      c.setHeight(clamp(this.buildHeight + 16, 24, RING.top + 20));
      c.update(dt, elapsed, crane);
    }
    // The climbing crane rides the spire during topping-out.
    if (this.climber) {
      this.climber.setHeight(clamp(this.buildHeight - 8, 24, SPIRE.tip - 40));
      this.climber.group.position.y = clamp(this.buildHeight - this.climber.group.position.y > 0 ? 0 : 0, 0, 0);
      this.climber.update(dt, elapsed, ms >= 6 && ms <= 8 ? crane : 0);
      if (this.climber.flag) this.climber.flag.visible = ms >= 7;
    }
    if (this.crawler) this.crawler.update(dt, elapsed, ms >= 5 && ms <= 6 ? crane : 0);

    for (const plant of this.plant) {
      if (plant === this.crawler || this.towerCranes.includes(plant) || plant === this.climber) continue;
      plant.update(dt, elapsed, plant.group && plant.group.visible ? truck : 0);
    }

    for (const f of this.followers) {
      if (ms >= f.from && ms <= f.to) f.follower.update(dt, truck);
    }

    /* The climbing formwork rides just under the pour. */
    if (this.formwork) {
      this.formwork.position.y = clamp(this.buildHeight - 6.5, LEVELS.B2, SPIRE.crownTop);
    }
    /* The mast climber rides the facade. */
    if (this.mastClimber) {
      const t = (elapsed * 0.05) % 1;
      this.mastClimber.position.y = lerp(LEVELS.podiumTop, SAIL.top - 10, 0.5 - 0.5 * Math.cos(t * TAU));
    }

    if (this.crew) this.crew.update(dt, work);

    /* Mature landscaping is milestone 9's package, so the campus trees and
       the finished plaza are held back until then. */
    if (this.world.landscape) this.world.landscape.visible = ms >= 9;
  }

  status() {
    return {
      built: this.built,
      buildHeight: Math.round(this.buildHeight || 0),
      piles: this.pileCount || 0,
      plant: this.plant.length,
      workers: this.crew ? this.crew.liveCount || 0 : 0,
      stages: this.stages.length
    };
  }
}
