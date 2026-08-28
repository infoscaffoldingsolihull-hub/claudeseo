/**
 * Application shell: boot sequence, the frame loop, mode switching, key
 * bindings and the test API.
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
import { createControls, WALK } from './engine/controls.js';
import { createWorld } from './world/world.js';
import { SPAWNS, SPAWN_BY_ID, SITE_LEVEL, validatePlan } from './world/plan.js';
import { TIME_PRESETS } from './world/sky.js';
import { createProject, projectStateAtDay, formatDay, earnedValue } from './pm/project.js';
import { validateModel } from './pm/model.js';
import { formatPKR } from './pm/rates.js';
import { clamp } from './engine/rng.js';

const $ = (id) => document.getElementById(id);

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
};

/** Yield to the browser so the loading screen can repaint. */
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function setBoot(percent, step) {
  const fill = $('bootFill');
  const label = $('bootStep');
  if (fill) fill.style.width = `${clamp(percent, 0, 100)}%`;
  if (label && step) label.textContent = step;
}

function bootFailed(message) {
  app.error = message;
  const note = $('bootNote');
  const step = $('bootStep');
  if (step) step.textContent = 'Could not start';
  if (note) note.textContent = message;
}

async function boot() {
  const canvas = $('stage');
  if (!canvas) throw new Error('canvas missing');

  setBoot(4, 'Checking the model');
  await nextFrame();

  const modelProblems = validateModel();
  const planProblems = validatePlan();
  if (modelProblems.length || planProblems.length) {
    throw new Error([...modelProblems, ...planProblems].slice(0, 3).join('; '));
  }

  setBoot(12, 'Running the project schedule');
  await nextFrame();
  const project = createProject();
  app.day = project.horizon;

  setBoot(22, 'Starting the renderer');
  await nextFrame();
  const startTierName = detectTier({ getContext: () => canvas.getContext('webgl2') || canvas.getContext('webgl') });
  let view;
  try {
    view = createView(canvas, TIERS[startTierName]);
  } catch (err) {
    throw new Error(`WebGL is unavailable in this browser (${err.message})`);
  }

  // three resets render stats on every `render()` call, and the post chain
  // makes four of those per frame — so the last one would be all we ever saw.
  // Reset once per frame instead and the numbers mean something.
  view.renderer.info.autoReset = false;

  const detected = detectTier(view.renderer);
  const quality = createQualityController(detected, (tier, reason) => {
    onTierChanged(tier, reason);
  });
  view.setTier(quality.tier);

  setBoot(32, 'Generating materials');
  await nextFrame();
  const textures = createTextures(quality.tier, view.maxAnisotropy);

  setBoot(46, 'Building the mansion');
  await nextFrame();
  const world = createWorld({ textures, quality: quality.tier, project });

  setBoot(72, 'Setting up controls');
  await nextFrame();
  const input = createInput(canvas);
  const controls = createControls(view.camera, input, world.collision);

  setBoot(82, 'Composing the frame');
  await nextFrame();
  const postfx = createPostFX(view);
  const size = view.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(size.width, size.height);
  postfx.setTier(quality.tier);

  setBoot(92, 'Placing you at the gate');
  await nextFrame();
  world.applyDay(project.horizon);
  const spawn = SPAWN_BY_ID.get('gate');
  controls.placeWalker({ x: spawn.x, y: spawn.y, z: spawn.z }, spawn.yaw);
  sky().setPreset('golden');

  function sky() { return world.sky; }

  function onTierChanged(tier, reason) {
    view.setTier(tier);
    postfx.setTier(tier);
    const s = view.setSize(window.innerWidth, window.innerHeight);
    postfx.setSize(s.width, s.height);
    if (api.onTierChange) api.onTierChange(tier, reason);
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

  /* ------------------------------------------------------- context loss */
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    app.contextLost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    app.contextLost = false;
    const s = view.setSize(window.innerWidth, window.innerHeight);
    postfx.setSize(s.width, s.height);
  });

  /* ------------------------------------------------------------ the loop */
  const clock = new THREE.Clock();
  let last = performance.now();

  function setDay(day, quiet) {
    const next = clamp(Math.round(day), 0, project.horizon);
    if (next === app.day && quiet) return;
    app.day = next;
    world.applyDay(next);
    if (api.onDayChange) api.onDayChange(next);
  }

  function setMode(mode) {
    if (!controls.setMode(mode, {
      target: new THREE.Vector3(0, 3, -4),
      distance: 52,
      position: view.camera.position.clone(),
    })) return false;
    app.mode = mode;
    if (api.onModeChange) api.onModeChange(mode);
    return true;
  }

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

    if (app.playing) {
      app.playAccum = (app.playAccum || 0) + dt * app.playSpeed;
      if (app.playAccum >= 1) {
        const step = Math.floor(app.playAccum);
        app.playAccum -= step;
        if (app.day + step >= project.horizon) {
          setDay(project.horizon);
          app.playing = false;
          if (api.onPlayChange) api.onPlayChange(false);
        } else {
          setDay(app.day + step);
        }
      }
    }

    controls.update(dt);

    // Safety net: nothing in the world should be able to drop the player out
    // of it, but if a timeline scrub removes the slab under their feet, put
    // them back at the gate rather than let them fall for ever.
    if (app.mode === 'walk' && world.isBelowWorld(controls.state.position)) {
      const s = SPAWN_BY_ID.get('gate');
      controls.placeWalker({ x: s.x, y: s.y, z: s.z }, s.yaw);
    }

    world.update(dt, view.camera);

    const tier = quality.tier;
    if (world.sky.sunLight.visible) {
      fitShadowCamera(world.sky.sunLight, view.camera, tier.shadowDist, tier.shadowMap);
    }
    postfx.setGrade(world.sky.grade);
    postfx.render(world.scene, view.camera, app.elapsed);

    app.draws = view.renderer.info.render.calls;
    app.triangles = view.renderer.info.render.triangles;
    if (api.onFrame) api.onFrame(dt);
    input.endFrame();
  }

  /* ------------------------------------------------------------ test API */
  const api = {
    THREE,
    app,
    view,
    world,
    project,
    input,
    controls,
    quality,
    postfx,
    textures,
    setDay,
    setMode,
    get day() { return app.day; },
    get mode() { return app.mode; },
    get fps() { return quality.fps; },
    spawnAt(id) {
      const s = SPAWN_BY_ID.get(id);
      if (!s) return false;
      controls.setMode('walk');
      app.mode = 'walk';
      controls.placeWalker({ x: s.x, y: s.y, z: s.z }, s.yaw);
      return true;
    },
    setPlaying(value) {
      app.playing = !!value;
      if (api.onPlayChange) api.onPlayChange(app.playing);
    },
    setPlaySpeed(value) { app.playSpeed = clamp(value, 0.25, 60); },
    setTimePreset(id) { return world.sky.setPreset(id); },
    setHour(h) { world.sky.setHour(h); },
    setXray(on) { world.setXrayMode(on); },
    evm(day) { return earnedValue(project, day === undefined ? app.day : day); },
    stateAt(day) { return projectStateAtDay(project, day === undefined ? app.day : day); },
    formatDay,
    formatPKR,
    SPAWNS,
    TIME_PRESETS,
    TIER_ORDER,
    onFrame: null,
    onDayChange: null,
    onModeChange: null,
    onPlayChange: null,
    onTierChange: null,
  };

  clock.start();
  frame();
  setBoot(100, 'Ready');
  await nextFrame();

  const bootEl = $('boot');
  if (bootEl) bootEl.classList.add('done');
  const hud = $('hud');
  if (hud) hud.hidden = false;
  app.ready = true;

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
