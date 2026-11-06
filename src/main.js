import * as THREE from 'three';
import { EventBus } from './core/bus.js';
import { Settings } from './core/settings.js';
import { Engine } from './engine/renderer.js';
import { InputManager } from './engine/input.js';
import { FirstPersonController, OrbitController, DroneController, CinematicPlayer } from './engine/controls.js';
import { TextureLibrary } from './engine/textures.js';
import { AudioEngine } from './engine/audio.js';
import { World } from './world/world.js';
import { VIEWS, worldYawToTrueHeading } from './world/layout.js';
import { Project } from './pm/project.js';
import { toMSPDI, toCSV } from './pm/export.js';
import { runMonteCarlo } from './pm/montecarlo.js';
import { GameDirector } from './game/director.js';
import { Mehran } from './ai/mehran.js';
import { Dashboard } from './ui/panels.js';
import { HUD } from './ui/hud.js';
import { TourDirector } from './ui/tour.js';
import { TouchControls } from './ui/touch.js';
import { ChatPanel } from './ui/chat.js';
import { Onboarding } from './ui/onboarding.js';
import { writeSlot, readSlot } from './ui/storage.js';
import { JourneyRunner } from './world/cabin.js';

/**
 * SKY GATEWAY HYDERABAD — Project Management Simulator.
 *
 * The orchestrator: boots the renderer, builds the airfield, charters the
 * project, and wires the five modes to the dashboard, the AI agent, the
 * game layer and the guided tour. Every subsystem talks through `sim` and
 * `sim.bus` (docs/ARCHITECTURE.md §4).
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

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export const MODES = ['inspector', 'manager', 'tour', 'drone', 'ops'];
export const SPEEDS = [0, 1, 10, 50, 200];

function urlParams() {
  const q = new URLSearchParams(window.location.search);
  const seed = q.get('seed');
  return {
    seed: seed !== null && /^\d+$/.test(seed) ? Number(seed) : undefined,
    difficulty: ['trainee', 'professional', 'crisis'].includes(q.get('difficulty')) ? q.get('difficulty') : undefined,
    skipIntro: q.has('skipintro') || q.has('e2e'),
    e2e: q.has('e2e'),
    ops: q.get('ops') === '1',
  };
}

class Simulator {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.params = urlParams();
    this.bus = new EventBus();
    this.settings = new Settings(this.bus);
    this.mode = 'manager';
    this.ready = false;
    this.simulationSpeed = 10;
    this.simAccumulator = 0;
    this.previewing = false;
    this.selection = null;
    this.overlay = null;
    this.nearbyPoi = null;
    this.visitedPoi = new Set();
    this.photoMode = false;
    this._shake = 0;
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._ixList = [];
    this._ixPoint = new THREE.Vector3();
    this._ixLook = new THREE.Vector3();
  }

  async boot() {
    boot.set(0.03, 'Creating WebGL 2 context…');
    await nextFrame();
    this.engine = new Engine(this.canvas);
    this.input = new InputManager(this.canvas);
    this.audio = new AudioEngine();
    if (this.settings.get('audio.muted') && !this.audio.muted) this.audio.toggleMute(true);
    this.textures = new TextureLibrary(this.engine.quality);

    boot.set(0.07, 'Chartering the Hyderabad Airport Revival & Expansion Programme…');
    await nextFrame();
    this.project = this._createProject({ seed: this.params.seed, difficulty: this.params.difficulty });

    boot.set(0.10, 'Synthesising asphalt, concrete, glass, sand and Ajrak screens…');
    await nextFrame();
    if (this.textures.preload) await this.textures.preload(nextFrame);

    this.world = new World(this.engine, this.textures, {
      onProgress: (p, label) => boot.set(0.14 + p * 0.74, label),
    });
    await this.world.build();

    boot.set(0.9, 'Briefing MEHRAN, the AI project manager…');
    await nextFrame();
    this.game = new GameDirector(this);
    this.ai = new Mehran(this);

    boot.set(0.94, 'Preparing controls and dashboard…');
    await nextFrame();
    this.walker = new FirstPersonController(this.engine.camera, this.input);
    this.orbit = new OrbitController(this.engine.camera, this.input);
    this.drone = new DroneController(this.engine.camera, this.input);
    this.cinematic = new CinematicPlayer(this.engine.camera);
    this.walker.onFootstep = (position, sprinting) => {
      const surface = this.world.surfaceAt ? this.world.surfaceAt(position) : 'concrete';
      this.audio.footstep(surface, sprinting, !!this.world.interiorAt(position));
      if (surface === 'sand' && this.world.kickDust) {
        this.world.kickDust(position.x, position.y - this.walker.height + 0.1, position.z, sprinting ? 1 : 0.6);
      }
    };

    this.hud = new HUD(this.uiRoot, this);
    this.dashboard = new Dashboard(this.uiRoot, this);
    this.tour = new TourDirector(this);
    this.touch = new TouchControls(this.uiRoot, this);
    this.chat = new ChatPanel(this.uiRoot, this);
    this.onboarding = new Onboarding(this.uiRoot, this);
    try { this.journey = new JourneyRunner(this); } catch (err) { console.error('journey: init failed', err); this.journey = null; }
    if (this.world.terminal) this.world.terminal.onDoorSound = (k) => { if (this.audio && this.audio.ui) this.audio.ui(k); };

    const v = VIEWS.overview;
    this.orbit.frame(new THREE.Vector3(...v.target), v.distance, v.phi, v.theta);
    this.orbit.snap();
    const w = VIEWS.walkStart;
    this.walker.teleport(w.x, this._groundY(w.x, w.z) + this.walker.eyeHeight, w.z, w.yaw);
    const d = VIEWS.droneStart;
    this.drone.position.set(d.x, d.y, d.z);
    this.drone.yaw = d.yaw;

    this._applyAccessibility();
    this.bus.on('settings:changed', () => {
      this._applyAccessibility();
      if (this.engine.applyGraphicsSettings) {
        this.engine.applyGraphicsSettings(this.settings.get('graphics'), { reducedMotion: !!this.settings.get('accessibility.reducedMotion') });
      }
    });
    if (this.engine.applyGraphicsSettings) {
      this.engine.applyGraphicsSettings(this.settings.get('graphics'), { reducedMotion: !!this.settings.get('accessibility.reducedMotion') });
    }
    this.world.scene.userData.interiorAt = (pos) => this.world.interiorAt(pos);
    this.syncWorld(true);
    this._bindKeys();
    this._bindPicking();

    boot.set(1, 'Ready for take-off.');
    await nextFrame();
    boot.done();
    this.ready = true;
    this.hud.applySpeed();
    this.bus.emit('project:new', { project: this.project });
    if (!this.params.skipIntro) this.onboarding.maybeStart();
    this.toast('Press ? for controls · Tab for the dashboard · H to talk to MEHRAN · 3 for the guided tour');
    this.loop();
  }

  /* ------------------------------------------------------------ project */

  _createProject(opts = {}) {
    const clean = {};
    for (const [k, v] of Object.entries(opts)) if (v !== undefined) clean[k] = v;
    const project = new Project(clean);
    project.onLog = (entry) => {
      this.bus.emit('project:log', { entry });
      if (entry.kind === 'milestone') this.bus.emit('project:milestone', { id: entry.serial, name: entry.title, day: entry.day });
      if (entry.kind === 'risk') this.bus.emit('risk:occurred', { risk: entry });
    };
    this._lastWeather = null;
    this._autosaveDay = 0;
    return project;
  }

  newProject(opts = {}) {
    if (this.mode === 'tour') this.setMode('manager');
    this.project = this._createProject(opts);
    if (this.game && this.game.reset) this.game.reset();
    this.selection = null;
    this.syncWorld(true);
    this.bus.emit('project:new', { project: this.project });
    return this.project;
  }

  syncWorld(force = false) {
    this.previewing = false;
    const state = this.project.worldState();
    this.world.applyProjectState(state);
    this._applyWeather(this.project.weather);
    if (this.world.sky.setDate) this.world.sky.setDate(this.project.date());
    if (force) this._lastSyncDay = this.project.day;
  }

  previewProject(state) {
    this.previewing = true;
    this.world.applyProjectState(state);
  }

  _applyWeather(w, { instant = false } = {}) {
    // A manual HUD choice (sim.weatherOverride) wins over the project's simulated weather until "Auto".
    const o = this.weatherOverride;
    const target = o && o.kind ? o : w;
    if (!target) return;
    const key = `${o && o.kind ? 'manual:' : ''}${target.kind}:${Math.round((target.intensity || 0) * 10)}`;
    const ws = this.world.weather && this.world.weather.state;
    if (key === this._lastWeather && !(o && o.kind && ws && ws.kind !== target.kind)) return;
    this._lastWeather = key;
    if (this.world.weather) this.world.weather.set(target.kind, target.intensity, { instant });
    this.bus.emit('weather:changed', { kind: target.kind, intensity: target.intensity, manual: !!(o && o.kind) });
  }

  /** Pin the scene weather (`'clear'|'haze'|'dust'|'rain'|'fog'|'heat'`, 0..1) or pass null to follow the project again. */
  setWeatherOverride(kindOrNull, intensity = 0.8) {
    if (kindOrNull) {
      const i = Number(intensity);
      this.weatherOverride = { kind: String(kindOrNull), intensity: kindOrNull === 'clear' ? 0 : Math.max(0, Math.min(1, Number.isFinite(i) ? i : 0.8)) };
    } else this.weatherOverride = null;
    this._lastWeather = null;
    this._applyWeather(this.project && this.project.weather);
    return this.weatherOverride;
  }

  setSpeed(daysPerSecond) {
    this.simulationSpeed = Math.max(0, daysPerSecond);
    if (this.hud) this.hud.applySpeed();
  }

  _maybeAutosave() {
    if (this.mode === 'tour' || this.previewing) return;
    if (this.project.day - this._autosaveDay < 60) return;
    this._autosaveDay = this.project.day;
    writeSlot('auto', this.sessionData());
  }

  /** Everything a save slot holds: the project plus the game layer. */
  sessionData() {
    return {
      app: 'sky-gateway-hyderabad',
      version: 1,
      savedAt: new Date().toISOString(),
      project: this.project.serialise(),
      game: this.game && this.game.serialise ? this.game.serialise() : null,
      options: { seed: this.project.seed, difficulty: this.project.difficulty, approach: this.project.approach },
    };
  }

  restoreSession(data) {
    if (!data || data.app !== 'sky-gateway-hyderabad' || !data.project) return false;
    const fresh = this._createProject(data.options || {});
    if (!fresh.restore(data.project)) return false;
    this.project = fresh;
    if (this.game && data.game && this.game.restore) this.game.restore(data.game);
    this.syncWorld(true);
    this.bus.emit('project:new', { project: this.project });
    return true;
  }

  /* ------------------------------------------------------- selection & UX */

  select(id) {
    this.selection = id || null;
    if (this.world.highlight) this.world.highlight(this.selection);
    this.bus.emit('selection:changed', { id: this.selection });
  }

  setOverlay(kind) {
    this.overlay = kind || null;
    this._refreshOverlay();
    this.bus.emit('overlay:changed', { kind: this.overlay });
  }

  _refreshOverlay() {
    if (!this.world.setOverlay) return;
    if (!this.overlay || this.mode !== 'manager') {
      this.world.setOverlay(null, null);
      return;
    }
    const values = this.project.overlayValues ? this.project.overlayValues(this.overlay) : {};
    this.world.setOverlay(this.overlay, values);
  }

  toast(text, kind = '') {
    if (this.hud) this.hud.toast(text, kind);
  }

  shake(strength = 0.6) {
    if (this.settings.get('accessibility.reducedMotion')) return;
    this._shake = Math.max(this._shake, strength);
  }

  confetti() {
    if (this.settings.get('accessibility.reducedMotion')) return;
    if (this.hud && this.hud.confetti) this.hud.confetti();
  }

  openPanel(id) {
    this.dashboard.open(id);
  }

  closePanel() {
    this.dashboard.close();
  }

  requestApproval(opts) {
    return this.hud.requestApproval(opts);
  }

  download(filename, mime, text) {
    const blob = text instanceof Blob ? text : new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.lastDownload = { filename, mime, size: blob.size };
    return this.lastDownload;
  }

  _applyAccessibility() {
    const a = this.settings.get('accessibility');
    const b = document.body.classList;
    b.toggle('high-contrast', !!a.highContrast);
    b.toggle('reduced-motion', !!a.reducedMotion);
    b.toggle('cb-safe', a.palette === 'cb-safe');
    b.toggle('conference', !!a.conference);
    document.documentElement.style.setProperty('--ui-scale', String(a.conference ? Math.max(1.35, a.uiScale) : a.uiScale));
    const lang = this.settings.get('language');
    document.documentElement.lang = lang === 'ur' ? 'ur' : 'en';
    b.toggle('lang-ur', lang === 'ur');
  }

  _groundY(x, z) {
    return this.world.collision.groundAt(x, z, 400);
  }

  /* -------------------------------------------------------------- modes */

  get operationsUnlocked() {
    return this.project.worldState().operational || this.params.ops || this.settings.get('role') === 'instructor';
  }

  setMode(mode) {
    if (!MODES.includes(mode) || mode === this.mode) return;
    if (mode === 'ops' && !this.operationsUnlocked) {
      this.toast('Operations mode unlocks at handover (WBS 12.2 Transition to operations). Instructor role can preview it.', 'warn');
      return;
    }
    const previous = this.mode;
    if (this.journey && (this.journey.active || this.journey.seated) && mode !== 'inspector') this.journey.stop('mode');
    if (previous === 'tour') {
      this.tour.stop();
      if (this.previewing) this.syncWorld(true);
    }
    if (previous === 'ops' && this.world.operations) this.world.operations.stop();
    if (this.photoMode) this.setPhotoMode(false);
    this.mode = mode;
    this.input.exitPointerLock();
    this.canvas.className = `mode-${mode}`;
    const cam = this.engine.camera;
    if (mode === 'drone') {
      this.drone.position.copy(cam.position);
      const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
      this.drone.yaw = e.y;
      this.drone.pitch = e.x;
      this.drone.auto = false;
      this.droneBattery = 1;
    } else if (mode === 'manager') {
      const v = VIEWS.overview;
      this.orbit.frame(new THREE.Vector3(...v.target), v.distance, v.phi, v.theta);
    } else if (mode === 'inspector') {
      const p = cam.position;
      const x = THREE.MathUtils.clamp(p.x, -880, 680);
      const z = THREE.MathUtils.clamp(p.z, -2280, 3480);
      this.walker.teleport(x, this._groundY(x, z) + this.walker.eyeHeight, z, this.walker.yaw);
    } else if (mode === 'tour') {
      this.dashboard.close();
      this.tour.start(0);
    } else if (mode === 'ops') {
      const v = VIEWS.apron;
      this.orbit.frame(new THREE.Vector3(...v.target), v.distance, v.phi, v.theta);
      if (this.world.operations) this.world.operations.start(this.project);
    }
    this._refreshOverlay();
    this.bus.emit('mode:changed', { mode, previous });
    const names = { inspector: 'Site Walk / Inspector', manager: 'Project Manager', tour: 'Guided Tour', drone: 'Drone', ops: 'Operations' };
    this.toast(`${names[mode]} mode`);
  }

  setPhotoMode(on) {
    this.photoMode = !!on;
    document.body.classList.toggle('photo-mode', this.photoMode);
    if (this.engine.postfx.setDepthOfField) this.engine.postfx.setDepthOfField(this.photoMode || this.mode === 'tour');
    this.toast(this.photoMode ? 'Photo mode — P saves a PNG, X exits' : 'Photo mode off');
  }

  capturePNG() {
    this.engine.render(this.world.scene);
    const data = this.canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = data;
    a.download = `HDD_photo_day${this.project.day}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.toast('Saved PNG', 'good');
    return data.length;
  }

  orbitSelected() {
    if (!this.selection || !this.world.elementCentre) {
      this.toast('Select a work package first (click it in Project Manager mode)', 'warn');
      return;
    }
    const c = this.world.elementCentre(this.selection);
    if (!c) return;
    if (this.mode !== 'drone') this.setMode('drone');
    this.drone.setAutoOrbit(c, 180, c.y + 90, 0.07);
    this.toast(`Orbit-cam on ${this.selection}`);
  }

  /* ------------------------------------------------------------ input */

  _bindKeys() {
    this._onKey = (e) => {
      if (!this.ready) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (this.hud.modalOpen && this.hud.modalOpen()) {
        if (e.key === 'Escape') this.hud.closeModal();
        return;
      }
      if (this.journey && this.journey.onKey(e)) return;
      const k = e.key;
      switch (k) {
        case '1': this.setMode('inspector'); break;
        case '2': this.setMode('manager'); break;
        case '3': this.setMode('tour'); break;
        case '4': this.setMode('drone'); break;
        case '5': case 'o': case 'O': this.setMode('ops'); break;
        case 'Tab':
          e.preventDefault();
          this.dashboard.toggle(this.dashboard.openId || 'charter');
          break;
        case 'Escape':
          if (this.hud.isHelpOpen && this.hud.isHelpOpen()) this.hud.toggleHelp(false);
          else if (this.photoMode) this.setPhotoMode(false);
          else if (this.chat.isOpen) this.chat.toggle(false);
          else if (this.dashboard.openId) this.dashboard.close();
          else if (this.hud.closeCards) this.hud.closeCards();
          this.input.exitPointerLock();
          break;
        case 'h': case 'H': this.chat.toggle(); break;
        case 'b': case 'B': this.dashboard.toggle('agile'); break;
        case 'r': case 'R': this.dashboard.toggle('present'); break;
        case 'c': case 'C':
          if (this.mode === 'inspector') break;   // C is crouch on foot; raise CRs from the POI card
          this.dashboard.open('control'); if (this.dashboard.focusChangeForm) this.dashboard.focusChangeForm(); break;
        case 'v': case 'V': this.chat.toggleVoice(); break;
        case 'm': case 'M': this.dashboard.toggle('missions'); break;
        case 't': case 'T': this.toast(this.touch.toggle() ? 'Touch controls on' : 'Touch controls off'); break;
        case 'f': case 'F': this.hud.toggleStats(); break;
        case 'k': case 'K':
          this.toast(this.audio.toggleMute() ? 'Sound muted' : 'Sound on');
          this.settings.set('audio.muted', this.audio.muted);
          this.hud.refreshSound();
          break;
        case '?': this.hud.toggleHelp(); break;
        case 'p': case 'P':
          if (this.photoMode) this.capturePNG();
          else this.hud.setSpeedIndex(this.simulationSpeed === 0 ? 2 : 0);
          break;
        case 'x': case 'X': if (this.mode === 'drone' || this.photoMode) this.setPhotoMode(!this.photoMode); break;
        case 'g': case 'G': if (this.mode === 'drone') this.orbitSelected(); break;
        case '+': case '=': this.hud.setSpeedIndex(this.hud.speedIndex + 1); break;
        case '-': case '_': this.hud.setSpeedIndex(this.hud.speedIndex - 1); break;
        case '[': this.world.sky.setHour(this.world.sky.hour - 0.5); break;
        case ']': this.world.sky.setHour(this.world.sky.hour + 0.5); break;
        case 'n': case 'N': this.world.sky.setHour(this.world.sky.state.nightFactor > 0.5 ? 11 : 21.5); break;
        case 'e': case 'E': this.interact(); break;
        case 'j': case 'J': this.toggleJourney(); break;
        case 'ArrowRight': if (this.mode === 'tour') { this.tour.next(); e.preventDefault(); } break;
        case 'ArrowLeft': if (this.mode === 'tour') { this.tour.previous(); e.preventDefault(); } break;
        default: break;
      }
    };
    window.addEventListener('keydown', this._onKey);

    this.canvas.addEventListener('click', () => {
      if (this.mode === 'inspector' || (this.mode === 'drone' && !this.drone.auto)) this.input.requestPointerLock();
    });
    const wake = () => {
      if (this.audio.resume()) {
        window.removeEventListener('pointerdown', wake);
        window.removeEventListener('keydown', wake);
      }
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
  }

  /** PM mode: a click (not a drag) on a 3D object selects its WBS element. */
  _bindPicking() {
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || (this.mode !== 'manager' && this.mode !== 'ops')) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6 || !this.world.pick) return;
      const r = this.canvas.getBoundingClientRect();
      this._pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this._raycaster.setFromCamera(this._pointer, this.engine.camera);
      const hit = this.world.pick(this._raycaster);
      if (hit && hit.wbsId) {
        this.select(hit.wbsId);
        if (this.hud.showSelection) this.hud.showSelection(hit.wbsId);
      } else {
        this.select(null);
      }
    });
  }

  /** J: start or leave the guided passenger journey (Site Walk). */
  toggleJourney() {
    if (!this.journey) { this.toast('The passenger journey is unavailable.', 'warn'); return; }
    this.journey.toggle();
  }

  interact() {
    if (this.mode !== 'inspector') return;
    const poi = this.nearbyPoi;
    if (!poi) return;
    if (typeof poi.action === 'function') {
      poi.action(this);
      this._ixCurrent = null;   // re-evaluate next frame (prompts change with state)
      return;
    }
    if (poi.teleport) {
      const t = poi.teleport;
      const go = () => {
        this.walker.teleport(t.x, t.y + this.walker.eyeHeight, t.z, t.yaw === undefined ? this.walker.yaw : t.yaw);
        this.toast(poi.teleportLabel || poi.name);
      };
      if (this.journey && this.journey.ui && !this.settings.get('accessibility.reducedMotion')) this.journey.ui.flash(go);
      else go();
      return;
    }
    this.hud.showPoi(poi);
    if (!this.visitedPoi.has(poi.id)) {
      this.visitedPoi.add(poi.id);
      if (this.audio.discovery) this.audio.discovery();
      this.bus.emit('poi:inspected', { poi, count: this.visitedPoi.size, total: this.world.pointsOfInterest.length });
    }
  }

  /** Every E-target: construction POIs, terminal doors, journey desks/booths/lanes/gates/seats. */
  interactables() {
    const list = this._ixList;
    list.length = 0;
    for (const p of this.world.pointsOfInterest) list.push(p);
    const t = this.world.terminal;
    if (t && t.interactables) for (const it of t.interactables) list.push(it);
    if (this.journey) for (const it of this.journey.interactables) list.push(it);
    return list;
  }

  /** The point of an interactable nearest the camera (desks are segments). */
  _ixTarget(item, cam) {
    const out = this._ixPoint;
    const sg = item.segment;
    if (sg) {
      const dx = sg[2] - sg[0]; const dz = sg[3] - sg[1];
      const L2 = dx * dx + dz * dz || 1;
      const u = THREE.MathUtils.clamp(((cam.x - sg[0]) * dx + (cam.z - sg[1]) * dz) / L2, 0, 1);
      return out.set(sg[0] + dx * u, item.position.y, sg[1] + dz * u);
    }
    return out.copy(item.position);
  }

  /**
   * Pick the E target: horizontal distance within the item's radius, a vertical
   * tolerance (so POIs at odd heights still work, and floors above/below don't),
   * a facing bonus (look-direction dot product), a line-of-sight test against the
   * collision world (no prompts through walls) and a little hysteresis so the
   * prompt does not flicker between neighbours.
   */
  _updateProximity() {
    const j = this.journey;
    if (this.mode !== 'inspector' || (j && j.flight)) {
      this.nearbyPoi = null;
      this._setPrompt(null);
      return;
    }
    if (j && j.seated) {
      this.nearbyPoi = j.seatedItem;
      this._setPrompt(this.nearbyPoi ? this.nearbyPoi.prompt : null);
      return;
    }
    const cam = this.engine.camera.position;
    const look = this.engine.camera.getWorldDirection(this._ixLook);
    look.y = 0;
    const ll = look.length() || 1;
    look.multiplyScalar(1 / ll);
    const col = this.world.collision;
    const feetY = cam.y - (this.walker.height || 1.72);
    let best = null; let bestScore = Infinity; let curScore = Infinity;
    for (const item of this.interactables()) {
      if (item.available && !item.available()) continue;
      const p = this._ixTarget(item, cam);
      const dx = p.x - cam.x; const dz = p.z - cam.z;
      const d = Math.hypot(dx, dz);
      const r = item.radius || 12;
      if (d > r) continue;
      const vtol = item.vtol === undefined ? Math.max(3, Math.min(8, r * 0.6)) : item.vtol;
      const dy = p.y - (feetY + 1.2);
      if (Math.abs(dy) > vtol + 1.0) continue;
      const facing = d > 0.3 ? (dx * look.x + dz * look.z) / d : 1;
      if (d > 2.2 && facing < -0.1) continue;
      if (d > 2.0 && col && this._ixBlocked(cam, p, d, col)) continue;
      const score = d / r + (1 - facing) * 0.45 + (item.action ? 0 : 0.08);
      if (item === this._ixCurrent) curScore = score;
      if (score < bestScore) { bestScore = score; best = item; }
    }
    if (best && this._ixCurrent && best !== this._ixCurrent && curScore < bestScore + 0.12) best = this._ixCurrent;
    this._ixCurrent = best;
    this.nearbyPoi = best;
    this._setPrompt(best ? (best.prompt || `Inspect ${best.name}`) : null);
  }

  /** True when a wall sits between the eye and the target (sampled every 0.5 m at chest height). */
  _ixBlocked(cam, p, d, col) {
    const steps = Math.floor((d - 1.0) / 0.5);
    const y = cam.y - 0.35;
    for (let i = 1; i <= steps; i++) {
      const f = (i * 0.5) / d;
      if (col.isSolid(cam.x + (p.x - cam.x) * f, y, cam.z + (p.z - cam.z) * f)) return true;
    }
    return false;
  }

  _setPrompt(text) {
    const clean = text ? String(text).replace(/^Press E (to|—)\s*/i, '').replace(/^./, (c) => c.toUpperCase()) : null;
    if (this.journey && this.journey.ui) {
      this.journey.ui.setPrompt(clean);
      this.hud.setPrompt(null);
    } else this.hud.setPrompt(clean ? `Press E to ${clean}` : null);
  }

  /* --------------------------------------------------------------- loop */

  _stepProject(dt) {
    if (this.simulationSpeed <= 0 || this.project.finished || this.mode === 'tour' || this.previewing) return;
    if (this.hud.blocking && this.hud.blocking()) return;    // a decision card pauses the clock
    this.simAccumulator += dt * this.simulationSpeed;
    let steps = 0;
    while (this.simAccumulator >= 1 && steps < 400) {
      this.project.step();
      this.simAccumulator -= 1;
      steps++;
      if (this.game) this.game.onDay(this.project.day);
      if (this.hud.blocking && this.hud.blocking()) { this.simAccumulator = 0; break; }
      if (this.project.finished) break;
    }
    if (steps > 0) {
      this.syncWorld();
      this._maybeAutosave();
      this.bus.emit('project:day', { day: this.project.day, snapshot: this.project.snapshot() });
      if (this.project.finished && !this._finishedAnnounced) {
        this._finishedAnnounced = true;
        this.bus.emit('project:finished', { snapshot: this.project.snapshot() });
        this.confetti();
      }
      if (this.overlay && this.project.day % 7 === 0) this._refreshOverlay();
    }
  }

  update(dt) {
    this._stepProject(dt);

    const collision = this.world.collision;
    if (this.journey) this.journey.update(dt);
    if (this.mode === 'inspector') {
      if (this.journey && this.journey.ownsCamera) this.journey.updateCamera(dt);
      else this.walker.update(dt, collision);
    }
    else if (this.mode === 'drone') {
      this.drone.update(dt);
      const g = this._groundY(this.drone.position.x, this.drone.position.z);
      if (this.drone.position.y < g + 2) this.drone.position.y = g + 2;
      this.droneBattery = Math.max(0, (this.droneBattery === undefined ? 1 : this.droneBattery) - dt / 1500);
    } else if (this.mode === 'tour') {
      this.tour.update(dt);
      this.cinematic.update(dt);
    } else this.orbit.update(dt, collision);

    if (this._shake > 0.001) {
      const cam = this.engine.camera;
      const s = this._shake;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      this._shake *= Math.pow(0.02, dt);
    }

    this.world.update(dt, this.engine.camera, this.engine.elapsed, { mode: this.mode, operations: this.mode === 'ops' });
    this.engine.updateSunScreenPosition(this.world.sky.sunWorld, Math.max(0, Math.sin(this.world.sky.sunElevation)));
    if (this.audio.ready) {
      const p = this.engine.camera.position;
      const ja = this.journey && this.journey.audioState ? this.journey.audioState() : null;
      this.audio.update(dt, {
        mode: this.mode,
        interior: ja ? ja.interior : this.world.interiorAt(p),
        day: Math.max(0, Math.sin(this.world.sky.sunElevation)),
        weather: this.world.weather ? this.world.weather.state : null,
        work: this.project.finished ? 0 : this.project.worldState().workforce,
        altitude: p.y,
        jets: ja ? ja.jets : this.world.operations && this.world.operations.audioState ? this.world.operations.audioState(p) : null,
      });
    }

    this._updateProximity();
    this.hud.update(dt);
    this.touch.update(dt);
    this.dashboard.tick(dt);
    if (this.game) this.game.update(dt);
    if (this.chat.update) this.chat.update(dt);
    this.input.endFrame();
  }

  heading() {
    const e = new THREE.Euler().setFromQuaternion(this.engine.camera.quaternion, 'YXZ');
    return worldYawToTrueHeading(e.y);
  }

  loop() {
    const step = () => {
      this._raf = requestAnimationFrame(step);
      const dt = this.engine.tick();
      this.update(dt);
      this.engine.render(this.world.scene);
    };
    step();
  }
}

/* ------------------------------------------------------------- bootstrap */

const sim = new Simulator(document.getElementById('view'), document.getElementById('ui-root'));

window.__hdd = {
  sim,
  THREE,
  get ready() { return sim.ready; },
  bootReport() {
    const p = sim.project;
    return {
      tier: sim.engine.quality.tier,
      detected: sim.engine.quality.detected,
      modes: MODES,
      panels: sim.dashboard.panelIds.length,
      wbsElements: p.tasks.length,
      summaries: p.summaries.length,
      risks: p.risks.length,
      stakeholders: p.stakeholders.length,
      resources: p.resources.length,
      procurement: p.procurement.length,
      missions: sim.game.missions.length,
      decisions: sim.game.decisions.length,
      tourBeats: sim.tour.beats.length,
      quizQuestions: sim.dashboard.quizCount ? sim.dashboard.quizCount() : null,
      glossary: sim.ai.glossarySize ? sim.ai.glossarySize() : null,
      intents: sim.ai.intentCount ? sim.ai.intentCount() : null,
      poi: sim.world.pointsOfInterest.length,
      bac: Math.round(p.bac),
      baselineDuration: p.baselineDuration,
      criticalPath: p.baseline.criticalPath.join(' → '),
    };
  },
  listPanels: () => sim.dashboard.panelIds,
  openPanel: (id) => sim.dashboard.open(id),
  closePanels: () => sim.dashboard.close(),
  setMode: (m) => { sim.setMode(m); return sim.mode; },
  runDays(n) {
    for (let i = 0; i < n && !sim.project.finished; i++) {
      sim.project.step();
      sim.game.onDay(sim.project.day);
      if (sim.hud.blocking && sim.hud.blocking() && sim.game.autoResolve) sim.game.autoResolve();
    }
    sim.syncWorld(true);
    sim.bus.emit('project:day', { day: sim.project.day, snapshot: sim.project.snapshot() });
    return sim.project.snapshot();
  },
  snapshot: () => sim.project.snapshot(),
  triggerDecision: (id) => sim.game.trigger(id),
  resolveDecision: (i) => sim.game.resolveActive(i),
  saveSlot(slot) { return writeSlot(slot, sim.sessionData()); },
  loadSlot(slot) { return sim.restoreSession(readSlot(slot)); },
  exportJSON: () => JSON.stringify(sim.sessionData()),
  exportMSPDI: () => toMSPDI(sim.project),
  exportCSV: () => toCSV(sim.project),
  setWeather(kind, intensity = 1) { sim.world.weather.set(kind, intensity, { instant: true }); return sim.world.weather.state; },
  setHour(h) { sim.world.sky.setHour(h); return sim.world.sky.hour; },
  /** Passenger journey: start at a step ('enter' … 'seat', 'flight'); with 'flight' an optional time (s) or phase id. */
  journey(step = 'enter', flightAt) {
    if (!sim.journey) return null;
    sim.journey.start(step);
    if (step === 'flight' && flightAt !== undefined) sim.journey.setFlightTime(flightAt);
    return sim.journey.snapshot();
  },
  journeyState: () => (sim.journey ? sim.journey.snapshot() : null),
  journeyFlight: (v) => (sim.journey ? sim.journey.setFlightTime(v) : null),
  journeyStop: () => { if (sim.journey) sim.journey.stop('left'); return sim.journey ? sim.journey.snapshot() : null; },
  /** E-interaction: the current target and the candidates in range. */
  interactTarget: () => (sim.nearbyPoi ? { id: sim.nearbyPoi.id, name: sim.nearbyPoi.name, prompt: sim.nearbyPoi.prompt || null } : null),
  interact: () => { sim.interact(); return sim.journey ? sim.journey.snapshot() : null; },
  door(id, open = true) { const t = sim.world.terminal; if (!t || !t.toggleDoor) return null; t.toggleDoor(id, sim, open); const d = t.doorById(id); return d ? { id: d.id, target: d.target, open: d.open } : null; },
  doors: () => (sim.world.terminal && sim.world.terminal.doors ? sim.world.terminal.doors.map((d) => ({ id: d.id, built: d.built(), open: Math.round(d.open * 100) / 100, solid: d.solid })) : []),
  stats: () => sim.engine.stats,
  memory: () => ({ ...sim.engine.renderer.info.memory, heap: performance.memory ? performance.memory.usedJSHeapSize : null }),
  railButtons: () => [...document.querySelectorAll('[data-panel]')].map((b) => b.dataset.panel),
  aiAsk: (text) => sim.ai.ask(text),
  monteCarlo: (iterations = 5000) => runMonteCarlo(sim.project, { iterations }),
  view(cfg) {
    if (cfg.mode) sim.setMode(cfg.mode);
    if (cfg.hour !== undefined) sim.world.sky.setHour(cfg.hour);
    if (cfg.weather) sim.world.weather.set(cfg.weather, cfg.intensity === undefined ? 1 : cfg.intensity, { instant: true });
    if (cfg.progress !== undefined) sim.previewProject(sim.project.previewState ? sim.project.previewState(cfg.progress) : sim.project.worldState());
    if (cfg.focus) {
      sim.orbit.frame(new THREE.Vector3(...cfg.focus), cfg.distance || 600, cfg.phi === undefined ? 1.0 : cfg.phi, cfg.theta === undefined ? 2.3 : cfg.theta);
      sim.orbit.snap();
    }
    if (cfg.walk) sim.walker.teleport(cfg.walk[0], sim.world.collision.groundAt(cfg.walk[0], cfg.walk[2], cfg.walk[1] + 2) + sim.walker.eyeHeight, cfg.walk[2], cfg.yaw || 0);
    if (cfg.drone) { sim.drone.position.set(...cfg.drone); sim.drone.auto = false; if (cfg.yaw !== undefined) sim.drone.yaw = cfg.yaw; if (cfg.pitch !== undefined) sim.drone.pitch = cfg.pitch; }
    if (cfg.tourBeat !== undefined) { sim.setMode('tour'); sim.tour.goTo(cfg.tourBeat); }
  },
};

sim.boot().catch((err) => {
  console.error(err);
  boot.fail(`Startup failed: ${err && err.message ? err.message : err}`);
});
