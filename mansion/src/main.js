/**
 * Application shell: boot sequence, the frame loop, key bindings, the overlays
 * and the test API.
 *
 * Boot is staged and yields to the browser between stages, so the progress bar
 * actually paints rather than jumping from 0 to 100 after a frozen second.
 * Every stage is wrapped, and a failure shows the reason on the loading screen
 * instead of leaving a black rectangle.
 */
import * as THREE from 'three';
import { createView, fitShadowCamera } from './engine/renderer.js';
import { createPostFX } from './engine/postfx.js';
import { createTextures } from './engine/textures.js';
import { detectTier, createQualityController, TIERS, TIER_ORDER } from './engine/quality.js';
import { createInput } from './engine/input.js';
import { createControls } from './engine/controls.js';
import { createWorld } from './world/world.js';
import { createInteraction } from './world/interact.js';
import { SPAWNS, SPAWN_BY_ID, validatePlan } from './world/plan.js';
import { TIME_PRESETS } from './world/sky.js';
import { createProject, projectStateAtDay, formatDay, earnedValue } from './pm/project.js';
import { validateModel } from './pm/model.js';
import { formatPKR } from './pm/rates.js';
import { createHud } from './ui/hud.js';
import { createTimeline } from './ui/timeline.js';
import { createPanels } from './ui/panels.js';
import { createTours } from './ui/tour.js';
import { createTouchLayer } from './ui/touch.js';
import { createSession } from './ui/storage.js';
import { byId } from './ui/dom.js';
import { clamp } from './engine/rng.js';


const app = {
  ready: false,
  error: null,
  day: 0,
  playing: false,
  playSpeed: 4,
  mode: 'walk',
  frames: 0,
  elapsed: 0,
  draws: 0,
  triangles: 0,
  overlay: null,
};

/** Yield to the browser so the loading screen can repaint. */
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function setBoot(percent, step) {
  const fill = byId('bootFill');
  const label = byId('bootStep');
  if (fill) fill.style.width = `${clamp(percent, 0, 100)}%`;
  if (label && step) label.textContent = step;
}

function bootFailed(message) {
  app.error = message;
  const note = byId('bootNote');
  const step = byId('bootStep');
  if (step) step.textContent = 'Could not start';
  if (note) note.textContent = message;
}

async function boot() {
  const canvas = byId('stage');
  if (!canvas) throw new Error('canvas missing');

  setBoot(4, 'Checking the model');
  await nextFrame();
  const problems = [...validateModel(), ...validatePlan()];
  if (problems.length) throw new Error(problems.slice(0, 3).join('; '));

  setBoot(12, 'Running the project schedule');
  await nextFrame();
  const project = createProject();
  app.day = project.horizon;

  setBoot(22, 'Starting the renderer');
  await nextFrame();
  let view;
  try {
    view = createView(canvas, TIERS.medium);
  } catch (err) {
    throw new Error(`WebGL is unavailable in this browser (${err.message})`);
  }
  view.renderer.info.autoReset = false;

  const quality = createQualityController(detectTier(view.renderer), (tier, reason) => {
    onTierChanged(tier, reason);
  });
  view.setTier(quality.tier);

  setBoot(32, 'Generating materials');
  await nextFrame();
  const textures = createTextures(quality.tier, view.maxAnisotropy);

  setBoot(46, 'Building the mansion');
  await nextFrame();
  const world = createWorld({ textures, quality: quality.tier, project });

  setBoot(70, 'Hanging the doors');
  await nextFrame();
  const input = createInput(canvas);
  const controls = createControls(view.camera, input, world.collision);
  const interaction = createInteraction({ camera: view.camera, controls, world, input });
  interaction.add(world.interactives);

  setBoot(82, 'Composing the frame');
  await nextFrame();
  const postfx = createPostFX(view);
  const size = view.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(size.width, size.height);
  postfx.setTier(quality.tier);

  setBoot(90, 'Opening the gate');
  await nextFrame();
  world.applyDay(project.horizon);
  world.setShadowPolicy(quality.tier);
  world.sky.setPreset('golden');

  function onTierChanged(tier, reason) {
    view.setTier(tier);
    postfx.setTier(tier);
    world.setShadowPolicy(tier);
    const s = view.setSize(window.innerWidth, window.innerHeight);
    postfx.setSize(s.width, s.height);
    if (hud) {
      hud.toast('Graphics quality',
        `${reason === 'auto-down' ? 'Reduced to' : reason === 'auto-up' ? 'Raised to' : 'Set to'} ${tier.label}.`);
    }
  }

  /* -------------------------------------------------------------- resize */
  let resizeTimer = 0;
  function handleResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const s = view.setSize(window.innerWidth, window.innerHeight);
      postfx.setSize(s.width, s.height);
    }, 80);
  }
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    app.contextLost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    app.contextLost = false;
    const s = view.setSize(window.innerWidth, window.innerHeight);
    postfx.setSize(s.width, s.height);
  });

  /* ---------------------------------------------------------- state edges */
  function setDay(day) {
    const next = clamp(Math.round(day), 0, project.horizon);
    if (next === app.day) return;
    app.day = next;
    world.applyDay(next);
    if (timeline) timeline.setDay(next);
    if (panels) panels.onDayChange(next);
  }

  function setMode(mode) {
    if (mode === 'tour') {
      if (tours) tours.start('house');
      return true;
    }
    if (!controls.setMode(mode, {
      target: new THREE.Vector3(0, 3.2, -3),
      distance: 46,
      position: view.camera.position.clone(),
    })) return false;
    if (tours && tours.running) tours.stop(false);
    app.mode = mode;
    if (hud) hud.setMode(mode);
    return true;
  }

  function spawnAt(id) {
    const s = SPAWN_BY_ID.get(id);
    if (!s) return false;
    if (tours && tours.running) tours.stop(false);
    controls.setMode('walk');
    app.mode = 'walk';
    if (hud) hud.setMode('walk');
    controls.placeWalker({ x: s.x, y: s.y, z: s.z }, s.yaw);
    interaction.release();
    return true;
  }

  function setPlaying(value) {
    app.playing = !!value;
    if (timeline) timeline.setPlaying(app.playing);
  }

  function setXray(on) {
    world.setXrayMode(on);
    if (hud) hud.setXray(world.xray);
  }

  function openOverlay(id) {
    for (const key of ['dashboard', 'help', 'settings']) {
      const node = byId(key);
      if (node) node.hidden = key !== id;
    }
    app.overlay = id;
    input.setEnabled(!id);
    if (id) input.exitLock();
    if (hud) hud.setCrosshairVisible(!id);
    if (id === 'dashboard' && panels) panels.refresh();
  }

  /* ------------------------------------------------------------- the UI */
  const api = {
    THREE,
    app,
    view,
    world,
    project,
    input,
    controls,
    interaction,
    quality,
    postfx,
    textures,
    setDay,
    setMode,
    spawnAt,
    setPlaying,
    setXray,
    openOverlay,
    get day() { return app.day; },
    get mode() { return app.mode; },
    get fps() { return quality.fps; },
    setPlaySpeed(value) { app.playSpeed = clamp(value, 0.25, 60); },
    setTimePreset(id) {
      const ok = world.sky.setPreset(id);
      if (ok && hud) hud.setTime(id);
      return ok;
    },
    setHour(h) { world.sky.setHour(h); },
    evm(day) { return earnedValue(project, day === undefined ? app.day : day); },
    stateAt(day) { return projectStateAtDay(project, day === undefined ? app.day : day); },
    formatDay,
    formatPKR,
    SPAWNS,
    TIME_PRESETS,
    TIER_ORDER,
  };

  const hud = createHud({
    api,
    onMode: setMode,
    onTime: (id) => api.setTimePreset(id),
    onJump: spawnAt,
    onToggleDash: () => openOverlay(app.overlay === 'dashboard' ? null : 'dashboard'),
    onToggleXray: () => setXray(!world.xray),
    onToggleSettings: () => openOverlay(app.overlay === 'settings' ? null : 'settings'),
    onHelp: () => openOverlay(app.overlay === 'help' ? null : 'help'),
    onCloseInspect: () => interaction.release(),
    onOperate: (id) => {
      const item = interaction.byId(id);
      if (item && item.toggle) {
        item.toggle();
        hud.setInspect(interaction.describe(item));
      }
    },
    onShowPackage: (pkgId) => {
      interaction.release();
      openOverlay('dashboard');
      panels.showPackage(pkgId);
    },
  });

  const timeline = createTimeline({
    api,
    onDay: setDay,
    onPlay: () => setPlaying(!app.playing),
    onSpeed: (value) => api.setPlaySpeed(value),
  });

  const panels = createPanels({ api, hud, openOverlay });
  const tours = createTours({ api, hud, controls, onEnd: () => setMode('walk') });
  const session = createSession({ api, hud, world, controls, tours });
  const touch = createTouchLayer({ api, input, interaction });

  panels.buildHelp(byId('helpBody'));
  panels.buildSettings(byId('settingsBody'), { quality, session, world });

  interaction.on('prompt', (info) => hud.setPrompt(info));
  interaction.on('inspect', (info) => hud.setInspect(info));

  hud.setMode('walk');
  hud.setTime('golden');
  timeline.setDay(app.day);
  timeline.setPlaying(false);

  const spawn = SPAWN_BY_ID.get('gate');
  controls.placeWalker({ x: spawn.x, y: spawn.y, z: spawn.z }, spawn.yaw);

  /* ------------------------------------------------------- key bindings */
  const MODE_KEYS = { Digit1: 'walk', Digit2: 'orbit', Digit3: 'tour', Digit4: 'drone' };

  function handleKeys() {
    if (input.wasPressed('Escape')) {
      if (app.overlay) openOverlay(null);
      else if (interaction.inspecting) interaction.release();
      else if (tours.running) tours.stop(true);
      else if (hud.jumpOpen) hud.setJumpOpen(false);
    }
    if (app.overlay) return;

    for (const code of Object.keys(MODE_KEYS)) {
      if (input.wasPressed(code)) setMode(MODE_KEYS[code]);
    }
    for (let i = 0; i < TIME_PRESETS.length; i += 1) {
      if (input.wasPressed(`Digit${i + 5}`)) api.setTimePreset(TIME_PRESETS[i].id);
    }
    if (input.wasPressed('KeyE')) interaction.activate();
    if (input.wasPressed('KeyF')) interaction.examine();
    if (input.wasPressed('KeyX')) setXray(!world.xray);
    if (input.wasPressed('Tab')) openOverlay('dashboard');
    if (input.wasPressed('KeyJ')) hud.setJumpOpen(!hud.jumpOpen);
    if (input.wasPressed('Slash')) openOverlay('help');
    if (input.wasPressed('KeyO')) openOverlay('settings');
    if (input.wasPressed('KeyP')) setPlaying(!app.playing);
    if (input.wasPressed('KeyG')) tours.start('construction');
    if (input.wasPressed('KeyT')) tours.start('house');
    if (input.wasPressed('Comma')) setDay(app.day - 1);
    if (input.wasPressed('Period')) setDay(app.day + 1);
    if (input.wasPressed('BracketLeft')) setDay(app.day - 14);
    if (input.wasPressed('BracketRight')) setDay(app.day + 14);
    if (input.wasPressed('Home')) setDay(0);
    if (input.wasPressed('End')) setDay(project.horizon);
    if (input.wasPressed('KeyR')) spawnAt('gate');
    if (input.takeClick()) {
      if (!input.locked && app.mode !== 'orbit') input.requestLock();
      else interaction.activate();
    }
  }

  /* ------------------------------------------------------------ the loop */
  let last = performance.now();
  let statTimer = 0;

  function frame() {
    requestAnimationFrame(frame);
    if (app.contextLost) return;

    view.renderer.info.reset();
    const now = performance.now();
    const dtMs = now - last;
    last = now;
    const dt = Math.min(0.05, dtMs / 1000);
    app.elapsed += dt;
    app.frames += 1;
    quality.sample(dtMs);

    handleKeys();

    if (app.playing) {
      app.playAccum = (app.playAccum || 0) + dt * app.playSpeed;
      if (app.playAccum >= 1) {
        const step = Math.floor(app.playAccum);
        app.playAccum -= step;
        if (app.day + step >= project.horizon) {
          setDay(project.horizon);
          setPlaying(false);
        } else {
          setDay(app.day + step);
        }
      }
    }

    tours.update(dt);
    controls.update(dt);

    // Safety net: nothing should be able to drop the player out of the world,
    // but if a timeline scrub removes the slab under their feet, put them back
    // at the gate rather than let them fall for ever.
    if (app.mode === 'walk' && world.isBelowWorld(controls.state.position)) {
      spawnAt('gate');
      hud.toast('Returned to the gate', 'The floor you were standing on is not built on this day.');
    }

    world.update(dt, view.camera);
    if (!app.overlay) interaction.update();

    statTimer += dt;
    if (statTimer > 0.4) {
      statTimer = 0;
      hud.refreshStats();
    }

    const tier = quality.tier;
    if (world.sky.sunLight.visible) {
      fitShadowCamera(world.sky.sunLight, view.camera, tier.shadowDist, tier.shadowMap);
    }
    postfx.setGrade(world.sky.grade);
    postfx.render(world.scene, view.camera, app.elapsed);

    app.draws = view.renderer.info.render.calls;
    app.triangles = view.renderer.info.render.triangles;
    input.endFrame();
  }

  api.hud = hud;
  api.timeline = timeline;
  api.panels = panels;
  api.tours = tours;
  api.session = session;
  api.touch = touch;

  session.restoreAuto();
  frame();
  setBoot(100, 'Ready');
  await nextFrame();

  const bootEl = byId('boot');
  if (bootEl) bootEl.classList.add('done');
  const hudEl = byId('hud');
  if (hudEl) hudEl.hidden = false;
  app.ready = true;
  hud.toast('Bagh-e-Shahi Manor', 'Click to look around. Press ? for the controls.');

  return api;
}

/* -------------------------------------------------------------- start up */
const started = boot().then((api) => {
  window.__mansion = api;
  return api;
}).catch((err) => {
  bootFailed(err && err.message ? err.message : String(err));
  window.__mansionError = err;
  throw err;
});

// A rejected promise here would be an unhandled rejection in the console, and
// this application ships with none: the failure is already on screen.
started.catch(() => {});
window.__mansionReady = started;
