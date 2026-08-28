/**
 * Session save, restore, export and import.
 *
 * A session is small and completely describes what you are looking at: the
 * day, where you are standing and facing, the time of day and the season, the
 * graphics tier, and which doors and windows are open. It is stored as JSON in
 * this browser and can be exported as text, so a scenario set up on one machine
 * can be opened on the machine you are presenting from.
 *
 * Every read is defensive: private-browsing modes throw on localStorage, a
 * stored session may have been written by an older build, and neither may take
 * the application down.
 */
const KEY = 'baghEShahi.session.v1';
const SLOTS = [
  { id: 'auto', label: 'Automatic', detail: 'Written whenever you change the day or the time of day.' },
  { id: 's1', label: 'Slot 1', detail: '' },
  { id: 's2', label: 'Slot 2', detail: '' },
  { id: 's3', label: 'Slot 3', detail: '' },
];

function readAll() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function createSession(ctx) {
  const { api, hud, world, controls, tours } = ctx;

  function snapshot() {
    const open = {};
    for (const mover of world.openings.interactives) {
      if (mover.target > 0.5) open[mover.id] = 1;
    }
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      day: api.day,
      hour: world.sky.hour,
      dayOfYear: world.sky.dayOfYear,
      cloud: world.sky.cloudCover,
      quality: api.quality.name,
      mode: api.mode === 'cinematic' ? 'walk' : api.mode,
      xray: !!world.xray,
      position: {
        x: controls.state.position.x,
        y: controls.state.position.y,
        z: controls.state.position.z,
      },
      yaw: controls.state.yaw,
      pitch: controls.state.pitch,
      open,
    };
  }

  function apply(data) {
    if (!data || typeof data !== 'object') return false;
    if (tours && tours.running) tours.stop(false);
    if (Number.isFinite(data.day)) api.setDay(data.day);
    if (Number.isFinite(data.hour)) world.sky.setHour(data.hour);
    if (Number.isFinite(data.dayOfYear)) world.sky.setDayOfYear(data.dayOfYear);
    if (Number.isFinite(data.cloud)) world.sky.setCloudCover(data.cloud);
    if (typeof data.quality === 'string') api.quality.set(data.quality);
    if (typeof data.mode === 'string') api.setMode(data.mode);
    if (data.position && Number.isFinite(data.position.x)) {
      controls.placeWalker(data.position, Number.isFinite(data.yaw) ? data.yaw : 0);
      if (Number.isFinite(data.pitch)) controls.state.pitch = data.pitch;
    }
    world.openings.closeAll();
    if (data.open && typeof data.open === 'object') {
      for (const id of Object.keys(data.open)) {
        const mover = world.openings.byId.get(id);
        if (mover) mover.setOpen(1);
      }
    }
    api.setXray(!!data.xray);
    return true;
  }

  let autoTimer = 0;
  function scheduleAuto() {
    window.clearTimeout(autoTimer);
    autoTimer = window.setTimeout(() => {
      const all = readAll();
      all.auto = snapshot();
      writeAll(all);
    }, 900);
  }

  return {
    snapshot,
    slots() {
      const all = readAll();
      return SLOTS.map((slot) => {
        const saved = all[slot.id];
        return {
          ...slot,
          used: !!saved,
          detail: saved
            ? `Day ${saved.day}, ${String(saved.hour ?? 0).slice(0, 5)}h — saved ${new Date(saved.savedAt).toLocaleString()}`
            : (slot.detail || 'Empty'),
        };
      });
    },
    save(id) {
      const all = readAll();
      all[id] = snapshot();
      const ok = writeAll(all);
      hud.toast(ok ? 'Session saved' : 'Could not save',
        ok ? `Day ${api.day} in ${id === 'auto' ? 'the automatic slot' : id}.`
          : 'This browser is refusing to store data.', ok ? 'good' : 'bad');
      return ok;
    },
    load(id) {
      const all = readAll();
      if (!all[id]) return false;
      const ok = apply(all[id]);
      if (ok) hud.toast('Session restored', `Day ${all[id].day}.`, 'good');
      return ok;
    },
    clear(id) {
      const all = readAll();
      delete all[id];
      writeAll(all);
      return true;
    },
    restoreAuto() {
      const all = readAll();
      if (all.auto) apply(all.auto);
      // Keep the automatic slot in step from here on.
      const wrapDay = api.setDay;
      api.setDay = (day) => { wrapDay(day); scheduleAuto(); };
    },
    exportToClipboard() {
      const text = JSON.stringify(snapshot());
      const done = (ok) => hud.toast(ok ? 'Session copied' : 'Could not copy',
        ok ? 'Paste it into the import box on another machine.' : 'Select the text in the box instead.',
        ok ? 'good' : 'warn');
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
          return true;
        }
      } catch {
        /* fall through to the manual path */
      }
      window.prompt('Copy this session:', text);
      return true;
    },
    importText(text) {
      try {
        const data = JSON.parse(String(text));
        const ok = apply(data);
        hud.toast(ok ? 'Session imported' : 'Could not import', ok ? `Day ${data.day}.` : 'That is not a session.',
          ok ? 'good' : 'bad');
        return ok;
      } catch {
        hud.toast('Could not import', 'That text is not a saved session.', 'bad');
        return false;
      }
    },
  };
}
