import * as THREE from 'three';
import { Engine } from './engine/renderer.js';
import { PostFX } from './engine/postfx.js';
import { InputManager } from './engine/input.js';
import { FirstPersonController, OrbitController, DroneController, CinematicPlayer } from './engine/controls.js';
import { TextureLibrary } from './engine/textures.js';
import { World } from './world/world.js';
import { terrainHeight } from './world/terrain.js';
import { POINTS_OF_INTEREST } from './world/layout.js';
import { Project } from './pm/project.js';
import { Advisor } from './pm/advisor.js';
import { runMonteCarlo } from './pm/montecarlo.js';
import { writeSlot, readSlot } from './ui/storage.js';
import { Dashboard } from './ui/panels.js';
import { HUD } from './ui/hud.js';
import { TourDirector } from './ui/tour.js';
import { TouchControls } from './ui/touch.js';

/**
 * Digital Giza — Project Management Simulator.
 *
 * Boots the renderer, synthesises every texture, builds two worlds (the plateau
 * and the pyramid's interior), starts the project simulation, and wires the
 * four game modes to the dashboard, the advisor and the guided tour.
 */

const boot = {
  el: document.getElementById('boot'),
  fill: document.getElementById('boot-fill'),
  step: document.getElementById('boot-step'),
  set(pct, text) {
    if (this.fill) this.fill.style.width = `${Math.round(pct * 100)}%`;
    if (this.step && text) this.step.textContent = text;
  },
  fail(message) {
    if (!this.el) return;
    const p = document.createElement('p');
    p.className = 'boot-error';
    p.textContent = message;
    const inner = this.el.querySelector('.boot-inner');
    if (inner) inner.appendChild(p);
  },
  done() {
    if (this.el) this.el.classList.add('done');
  },
};

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

class Simulator {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.mode = 'manager';
    this.ready = false;
    this.simulationSpeed = 10;      // project days per real second
    this.simAccumulator = 0;
    this.previewing = false;
    this.nearbyPoi = null;
    this.visitedPoi = new Set();
  }

  async boot() {
    boot.set(0.03, 'Creating WebGL context…');
    await nextFrame();
    this.engine = new Engine(this.canvas);
    this.input = new InputManager(this.canvas);
    this.textures = new TextureLibrary(this.engine.quality);

    boot.set(0.07, 'Chartering the project…');
    await nextFrame();
    this.project = new Project();
    this.advisor = new Advisor(this.project);

    boot.set(0.11, 'Synthesising stone, sand, timber and linen…');
    await nextFrame();
    this.textures.limestone();
    this.textures.sand();
    await nextFrame();
    this.textures.casing();
    this.textures.granite();
    await nextFrame();
    this.textures.graniteAshlar();
    this.textures.limestoneAshlar();
    await nextFrame();
    this.textures.bedrock();
    this.textures.mudbrick();
    await nextFrame();
    this.textures.wood();
    this.textures.plaster();
    this.textures.basalt();

    this.world = new World(this.engine, this.textures, (p, label) => boot.set(0.18 + p * 0.76, label));
    await this.world.build();

    boot.set(0.96, 'Preparing controls and dashboard…');
    await nextFrame();
    this.walker = new FirstPersonController(this.engine.camera, this.input);
    this.orbit = new OrbitController(this.engine.camera, this.input);
    this.drone = new DroneController(this.engine.camera, this.input);
    this.cinematic = new CinematicPlayer(this.engine.camera);
    this.walker.onFootstep = (position, sprinting) => {
      const yaw = this.walker.yaw;
      if (!this.world.inInterior) this.world.footprints.stamp(position, yaw);
      // A puff of dust behind the trailing foot, drifting the way you came.
      const feet = position.y - this.walker.height;
      const strength = sprinting ? 1.0 : this.walker.crouching ? 0.45 : 0.7;
      this.world.kickDust(
        position.x + Math.sin(yaw) * 0.28,
        feet + 0.1,
        position.z + Math.cos(yaw) * 0.28,
        strength,
        Math.sin(yaw) * 0.55,
        Math.cos(yaw) * 0.55
      );
    };

    this.dashboard = new Dashboard(this.uiRoot, this);
    this.hud = new HUD(this.uiRoot, this);
    this.tour = new TourDirector(this);
    this.touch = new TouchControls(this.uiRoot, this);
    this.hud.applySpeed();

    this.orbit.frame(new THREE.Vector3(-40, 50, 240), 820, Math.PI * 0.30, Math.PI * 0.83);
    this.orbit.snap();
    const wx = 208;
    const wz = -206;
    this.walker.teleport(wx, terrainHeight(wx, wz) + 1.72, wz, Math.PI * 0.72);
    this.drone.position.set(560, 280, -540);
    this.drone.yaw = Math.PI * 0.76;

    this.syncWorld(true);
    this._bindKeys();

    boot.set(1, 'Ready.');
    await nextFrame();
    boot.done();
    this.ready = true;
    this.hud.toast('Press ? for controls · Tab for the dashboard · 3 for the guided tour');
    this.loop();
  }

  /* ------------------------------------------------------------- controls */

  _bindKeys() {
    this._onKey = (e) => {
      if (!this.ready) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const key = e.key;
      switch (key) {
        case '1': this.setMode('archaeologist'); break;
        case '2': this.setMode('manager'); break;
        case '3': this.setMode('tour'); break;
        case '4': this.setMode('drone'); break;
        case 'Tab':
          e.preventDefault();
          this.dashboard.toggle(this.dashboard.openId ? this.dashboard.openId : 'cost');
          break;
        case 'Escape':
          if (this.hud.helpOverlay.classList.contains('open')) this.hud.toggleHelp(false);
          else if (this.dashboard.openId) this.dashboard.close();
          else if (this.hud.codex.classList.contains('open')) this.hud.closeCodex();
          else this.input.exitPointerLock();
          break;
        case 'h': case 'H': this.hud.toggleAdvisor(); break;
        case 't': case 'T':
          this.hud.toast(this.touch.toggle() ? 'Touch controls on' : 'Touch controls off');
          break;
        case 'f': case 'F': this.hud.toggleStats(); break;
        case 'm': case 'M': this.dashboard.toggle('missions'); break;
        case '?': this.hud.toggleHelp(); break;
        case 'p': case 'P': this.hud.setSpeedIndex(this.simulationSpeed === 0 ? 2 : 0); break;
        case '+': case '=': this.hud.setSpeedIndex(this.hud.speedIndex + 1); break;
        case '-': case '_': this.hud.setSpeedIndex(this.hud.speedIndex - 1); break;
        case '[': this.world.sky.setHour(this.world.sky.hour - 0.5); break;
        case ']': this.world.sky.setHour(this.world.sky.hour + 0.5); break;
        case 'n': case 'N': this.world.sky.setHour(this.world.sky.state.nightFactor > 0.5 ? 12 : 21.5); break;
        case 'g': case 'G':
          this._rampVisible = !this._rampVisible;
          this.world.pyramids.setRampVisible(this._rampVisible);
          this.hud.toast(`Construction ramp ${this._rampVisible ? 'shown' : 'hidden'}`);
          break;
        case 'e': case 'E': this.interact(); break;
        case 'ArrowRight':
          if (this.mode === 'tour') { this.tour.next(); e.preventDefault(); }
          break;
        case 'ArrowLeft':
          if (this.mode === 'tour') { this.tour.previous(); e.preventDefault(); }
          break;
        default: break;
      }
    };
    window.addEventListener('keydown', this._onKey);
    this._rampVisible = true;

    this.canvas.addEventListener('click', () => {
      if (this.mode === 'archaeologist' || this.mode === 'drone') this.input.requestPointerLock();
    });
  }

  setMode(mode) {
    if (mode === this.mode) return;
    if (this.mode === 'tour') {
      this.tour.stop();
      if (this.previewing) this.syncWorld(true);
    }
    this.mode = mode;
    this.input.exitPointerLock();
    this.canvas.className = `mode-${mode}`;
    if (mode === 'drone') {
      this.drone.position.copy(this.engine.camera.position);
      const e = new THREE.Euler().setFromQuaternion(this.engine.camera.quaternion, 'YXZ');
      this.drone.yaw = e.y;
      this.drone.pitch = e.x;
      this.drone.auto = false;
    } else if (mode === 'manager') {
      if (this.world.inInterior) this.toggleInterior();
      this.orbit.frame(new THREE.Vector3(-40, 50, 240), 820, Math.PI * 0.3, Math.PI * 0.83);
    } else if (mode === 'archaeologist') {
      if (!this.world.inInterior) {
        const p = this.engine.camera.position;
        const x = THREE.MathUtils.clamp(p.x, -1400, 1400);
        const z = THREE.MathUtils.clamp(p.z, -1400, 1600);
        this.walker.teleport(x, terrainHeight(x, z) + 1.72, z, this.walker.yaw);
      }
    } else if (mode === 'tour') {
      this.dashboard.close();
      this.tour.start(0);
    }
    this.hud.toast(`${mode.charAt(0).toUpperCase() + mode.slice(1)} mode`);
  }

  /* --------------------------------------------------------- session */

  /**
   * Charter a fresh project. `restore` mutates in place so loading needs no
   * rewiring, but a new project is a new object and the advisor, dashboard and
   * HUD all hold a reference to it.
   */
  newProject(seed) {
    this.project = new Project(seed === undefined ? {} : { seed });
    this.advisor = new Advisor(this.project);
    this.dashboard.project = this.project;
    this.hud.project = this.project;
    this.dashboard.monteCarloResult = null;
    this.dashboard.monteCarloRun = null;
    this.dashboard.selectedTask = null;
    this.hud.eventCount = 0;
    this.hud.lastRenderedEvent = null;
    this._autosaveDay = 0;
    this.syncWorld(true);
    return this.project;
  }

  /** Autosave to the reserved slot at a fixed project-day cadence. */
  _maybeAutosave() {
    if (this.mode === 'tour') return;
    if (this._autosaveDay === undefined) this._autosaveDay = 0;
    if (this.project.day - this._autosaveDay < 500) return;
    this._autosaveDay = this.project.day;
    writeSlot('auto', this.project.serialise());
  }

  /* ------------------------------------------------------------ world sync */

  syncWorld(force = false) {
    this.previewing = false;
    const state = this.project.worldState();
    this.world.applyProjectState(state);
    if (force) this._lastSyncDay = this.project.day;
  }

  /** Tour mode drives the visuals directly without touching the simulation. */
  previewProject(state) {
    this.previewing = true;
    this.world.applyProjectState(state);
  }

  toggleInterior(silent = false) {
    const target = this.world.inInterior ? this.world.exitInterior() : this.world.enterInterior();
    this.walker.teleport(target.x, target.y + 1.72, target.z, this.world.inInterior ? Math.PI : 0);
    this.engine.postfx.applyLook(PostFX.LOOKS[this.world.inInterior ? 'interior' : 'exterior']);
    if (!silent) {
      this.hud.toast(this.world.inInterior ? 'Entering the Great Pyramid' : 'Back on the plateau');
      if (this.mode !== 'archaeologist') this.setMode('archaeologist');
    }
  }

  interact() {
    if (this.nearbyPoi) {
      this.hud.showCodex(this.nearbyPoi);
      if (!this.visitedPoi.has(this.nearbyPoi.id)) {
        this.visitedPoi.add(this.nearbyPoi.id);
        this.hud.toast(`Discovered: ${this.nearbyPoi.name} (${this.visitedPoi.size}/${POINTS_OF_INTEREST.length})`, 'good');
      }
      return;
    }
    if (this.world.distanceToEntrance(this.engine.camera.position) < 16) this.toggleInterior();
  }

  _updateProximity() {
    const camera = this.engine.camera.position;
    let best = null;
    let bestDist = 34;
    for (const poi of POINTS_OF_INTEREST) {
      if (!!poi.interior !== this.world.inInterior) continue;
      const p = this.world.poiWorldPosition(poi);
      const d = p.distanceTo(camera);
      if (d < bestDist) {
        bestDist = d;
        best = poi;
      }
    }
    this.nearbyPoi = best;
    if (best) this.hud.setPrompt(best.name);
    else if (this.world.distanceToEntrance(camera) < 16) {
      this.hud.setPrompt(this.world.inInterior ? 'Leave the pyramid' : 'Enter the Great Pyramid');
    } else this.hud.setPrompt(null);
  }

  /* ------------------------------------------------------------------ loop */

  update(dt) {
    // --- project simulation ---
    if (this.simulationSpeed > 0 && !this.project.finished && this.mode !== 'tour') {
      this.simAccumulator += dt * this.simulationSpeed;
      let steps = 0;
      while (this.simAccumulator >= 1 && steps < 400) {
        this.project.step();
        this.simAccumulator -= 1;
        steps++;
      }
      if (steps > 0) {
        this.syncWorld();
        this._maybeAutosave();
      }
    }

    // --- camera ---
    const collision = this.world.activeCollision;
    if (this.mode === 'archaeologist') this.walker.update(dt, collision);
    else if (this.mode === 'drone') this.drone.update(dt);
    else if (this.mode === 'tour') {
      this.tour.update(dt);
      this.cinematic.update(dt);
    } else this.orbit.update(dt, this.world.inInterior ? null : collision);

    this.world.update(dt, this.engine.camera, this.engine.elapsed);
    this.engine.updateSunScreenPosition(
      this.world.sky.sunWorld,
      this.world.inInterior ? 0 : Math.max(0, Math.sin(this.world.sky.sunElevation))
    );

    // --- UI ---
    if (this.mode !== 'tour') this._updateProximity();
    else this.hud.setPrompt(null);
    this.hud.update(dt);
    this.touch.update(dt);
    this.dashboard.tick();
    if (this._advisorTimer === undefined) this._advisorTimer = 0;
    this._advisorTimer += dt;
    if (this._advisorTimer > 4 && this.hud.advisorPanel.classList.contains('open')) {
      this._advisorTimer = 0;
      this.hud.refreshAdvisor();
    }
    this.input.endFrame();
  }

  loop() {
    const step = () => {
      this._raf = requestAnimationFrame(step);
      const dt = this.engine.tick();
      this.update(dt);
      this.engine.render(this.world.activeScene);
    };
    step();
  }
}

/* ------------------------------------------------------------- bootstrap */

const canvas = document.getElementById('view');
const uiRoot = document.getElementById('ui-root');
const sim = new Simulator(canvas, uiRoot);

window.__giza = {
  sim,
  THREE,
  get ready() {
    return sim.ready;
  },
  bootReport() {
    return {
      tier: sim.engine.quality.tier,
      detected: sim.engine.quality.detected,
      blockInstances: sim.world.pyramids.khufu.totalInstances,
      colliders: sim.world.collision.boxes.length,
      interiorColliders: sim.world.interiorCollision.boxes.length,
      torches: sim.world.torches.torches.length + sim.world.interiorTorches.torches.length,
      workers: sim.world.workers.activeCount,
      workPackages: sim.project.tasks.length,
      bac: Math.round(sim.project.bac),
      baselineDuration: sim.project.baselineDuration,
      criticalPath: sim.project.baseline.criticalPath.join(' → '),
      peakWorkforce: sim.project.peakWorkforce,
    };
  },
  sampleStats() {
    return sim.engine.stats;
  },
  testScenario(cfg) {
    const wantInterior = !!cfg.interior;
    if (wantInterior !== sim.world.inInterior) sim.toggleInterior(true);
    if (wantInterior) {
      const vp = sim.world.interior.viewpoints[cfg.interior];
      const node = vp ? vp.position : sim.world.interior.nodes[cfg.interior];
      if (node) sim.walker.teleport(node.x, node.y + 1.72, node.z, vp ? vp.yaw : Math.PI);
    }
    if (cfg.mode) sim.setMode(cfg.mode);
    if (cfg.hour !== undefined) sim.world.sky.setHour(cfg.hour);
    if (cfg.progress !== undefined) {
      sim.previewProject({
        coreProgress: cfg.progress,
        casingProgress: cfg.casing || 0,
        workforceRatio: cfg.workforce === undefined ? 1 : cfg.workforce,
        stoneRatio: cfg.stone === undefined ? 0.7 : cfg.stone,
      });
    }
    if (cfg.walk) sim.walker.teleport(cfg.walk[0], terrainHeight(cfg.walk[0], cfg.walk[2]) + 1.72, cfg.walk[2], cfg.yaw || 0);
    if (cfg.focus) {
      sim.orbit.frame(
        new THREE.Vector3(cfg.focus[0], cfg.focus[1], cfg.focus[2]),
        cfg.distance || 400,
        cfg.phi !== undefined ? cfg.phi : Math.PI * 0.33,
        cfg.theta !== undefined ? cfg.theta : Math.PI * 0.78
      );
      sim.orbit.snap();
    }
    if (cfg.drone) {
      sim.drone.position.set(cfg.drone[0], cfg.drone[1], cfg.drone[2]);
      sim.drone.auto = false;
      if (cfg.yaw !== undefined) sim.drone.yaw = cfg.yaw;
      if (cfg.pitch !== undefined) sim.drone.pitch = cfg.pitch;
    }
    if (cfg.tourBeat !== undefined) {
      sim.setMode('tour');
      sim.tour.goTo(cfg.tourBeat);
    }
  },
  findBadGeometries() {
    const bad = [];
    const path = (o) => {
      const parts = [];
      let cur = o;
      while (cur) {
        parts.unshift(cur.name || cur.type);
        cur = cur.parent;
      }
      return parts.join('/');
    };
    const check = (scene, sceneName) => {
      scene.traverse((o) => {
        const g = o.geometry;
        if (!g || !g.attributes || !g.attributes.position) return;
        if (g.attributes.position.count === 0) {
          bad.push({ scene: sceneName, path: path(o), reason: 'empty geometry' });
          return;
        }
        if (g.boundingSphere && !Number.isFinite(g.boundingSphere.radius)) {
          bad.push({ scene: sceneName, path: path(o), reason: 'NaN bounding sphere' });
        }
        const a = g.attributes.position.array;
        for (let i = 0; i < a.length; i++) {
          if (!Number.isFinite(a[i])) {
            bad.push({ scene: sceneName, path: path(o), reason: `NaN at ${i}` });
            return;
          }
        }
      });
    };
    check(sim.world.scene, 'exterior');
    check(sim.world.interior.scene, 'interior');
    return bad;
  },
  /** QA: drop the walker at a set of points and confirm it settles on the ground. */
  walkTest(points, frames = 90) {
    const results = [];
    const prevMode = sim.mode;
    const prevPos = sim.walker.position.clone();
    const prevYaw = sim.walker.yaw;
    sim.setMode('archaeologist');
    for (const [x, z] of points) {
      sim.walker.teleport(x, terrainHeight(x, z) + 12, z, 0);
      for (let i = 0; i < frames; i++) sim.walker.update(1 / 60, sim.world.activeCollision);
      const expected = terrainHeight(x, z) + 1.72;
      results.push({
        x, z,
        y: Number(sim.walker.position.y.toFixed(2)),
        expected: Number(expected.toFixed(2)),
        grounded: sim.walker.grounded,
        drift: Number((sim.walker.position.y - expected).toFixed(2)),
      });
    }
    sim.walker.teleport(prevPos.x, prevPos.y, prevPos.z, prevYaw);
    sim.setMode(prevMode);
    return results;
  },
  terrainProbe(points) {
    return points.map(([x, z]) => ({ x, z, y: Number(terrainHeight(x, z).toFixed(2)) }));
  },
  listPanels() {
    return sim.dashboard.panelIds;
  },
  openPanel(id) {
    sim.dashboard.open(id);
  },
  closePanels() {
    sim.dashboard.close();
  },
  /** Fast-forward the project simulation headlessly and report the outcome. */
  runHeadlessProject(maxDays = 20000) {
    const p = sim.project;
    let steps = 0;
    while (!p.finished && steps < maxDays) {
      p.step();
      steps++;
    }
    sim.syncWorld(true);
    const s = p.snapshot();
    return {
      finished: p.finished,
      days: p.day,
      baselineDuration: p.baselineDuration,
      spi: Number(s.spi.toFixed(3)),
      spit: Number(s.spit.toFixed(3)),
      cpi: Number(s.cpi.toFixed(3)),
      eac: Math.round(s.eac.typical),
      vac: Math.round(s.vac),
      quality: Number(s.quality.toFixed(3)),
      welfare: Number(s.welfare.toFixed(3)),
      realisedRisks: s.realisedRisks,
      incidents: s.incidents,
      missionsComplete: p.missions.filter((m) => m.status === 'complete').length,
    };
  },
  runMonteCarlo(iterations = 2000) {
    const r = runMonteCarlo(sim.project, { iterations });
    sim.advisor.setForecast(r);
    return {
      iterations: r.iterations,
      p50: Math.round(r.finish.p50),
      p80: Math.round(r.finish.p80),
      p90: Math.round(r.finish.p90),
      probabilityOnTime: Number(r.probabilityOnTime.toFixed(3)),
      topDriver: r.tornado[0] ? `${r.tornado[0].code} (r=${r.tornado[0].correlation.toFixed(2)})` : null,
    };
  },
  saveSession() {
    return sim.project.serialise();
  },
  restoreSession(data) {
    const ok = sim.project.restore(data);
    if (ok) sim.syncWorld(true);
    return ok;
  },
  autosaveSlot() {
    return readSlot('auto');
  },
  newProject(seed) {
    sim.newProject(seed);
    return sim.project.snapshot();
  },
  /** Force the on-screen touch layer on or off, for QA on a desktop browser. */
  setTouchControls(on) {
    sim.touch.setEnabled(on);
    sim.touch.update(0);
    return {
      enabled: sim.touch.enabled,
      buttons: sim.touch.buttons.map((b) => b.spec.id),
      mode: sim.touch.mode,
    };
  },
  /** Drive the virtual stick directly, as a thumb would. */
  touchStick(dx, dy) {
    const s = sim.input.stick;
    s.active = dx !== 0 || dy !== 0;
    s.baseX = 140;
    s.baseY = window.innerHeight - 140;
    s.knobX = s.baseX + dx * s.radius;
    s.knobY = s.baseY + dy * s.radius;
    sim.input.touch.moveX = dx;
    sim.input.touch.moveY = dy;
    return sim.input.axes();
  },
  /** Press an on-screen button by its id and report the resulting key state. */
  touchButton(id) {
    const entry = sim.touch.buttons.find((b) => b.spec.id === id);
    if (!entry) return { ok: false };
    entry.node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const down = sim.input.isDown(entry.spec.code);
    entry.node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return { ok: true, code: entry.spec.code, down, stillDown: sim.input.isDown(entry.spec.code) };
  },
  advisorReport() {
    return { headline: sim.advisor.headline(), advice: sim.advisor.analyse() };
  },
  memoryReport() {
    return {
      ...sim.engine.renderer.info.memory,
      programs: sim.engine.renderer.info.programs ? sim.engine.renderer.info.programs.length : 0,
    };
  },
};

sim.boot().catch((err) => {
  console.error(err);
  boot.fail(`Startup failed: ${err && err.message ? err.message : err}`);
});
