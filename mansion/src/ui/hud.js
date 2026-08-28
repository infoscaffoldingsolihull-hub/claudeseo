/**
 * The heads-up display: crosshair, interaction prompt, inspect card, toasts,
 * the top bar, the mode and time-of-day switches and the room-jump bar.
 *
 * The HUD owns no state of its own. It is handed the application's state on
 * every change and renders it, which is why the same card appears whether you
 * opened it with a key, with the mouse, or from the guided tour.
 */
import { el, fill, clear, stat, row, byId } from './dom.js';
import { formatPKRExact } from '../pm/rates.js';


export function createHud(ctx) {
  const { api, onMode, onTime, onJump, onToggleDash, onToggleXray, onToggleSettings, onHelp } = ctx;

  const crosshair = byId('crosshair');
  const promptEl = byId('prompt');
  const inspectEl = byId('inspect');
  const inspectBody = byId('inspectBody');
  const toastsEl = byId('toasts');
  const statsEl = byId('topbarStats');
  const modesEl = byId('modes');
  const timesEl = byId('timePresets');
  const jumpEl = byId('jumpbar');

  let jumpOpen = false;

  /* --------------------------------------------------------------- modes */
  const MODES = [
    { id: 'walk', label: 'Walk', key: '1' },
    { id: 'orbit', label: 'Orbit', key: '2' },
    { id: 'tour', label: 'Tour', key: '3' },
    { id: 'drone', label: 'Drone', key: '4' },
  ];
  const modeButtons = new Map();
  fill(modesEl, MODES.map((m) => {
    const button = el('button', {
      class: 'mbtn',
      type: 'button',
      title: `${m.label} mode  (${m.key})`,
      onclick: () => onMode(m.id),
    }, [
      el('span', { class: 'k', text: m.key }),
      el('span', { class: 'label', text: m.label }),
    ]);
    modeButtons.set(m.id, button);
    return button;
  }));

  const timeButtons = new Map();
  fill(timesEl, api.TIME_PRESETS.map((p, i) => {
    const button = el('button', {
      class: 'mbtn',
      type: 'button',
      title: `${p.label}  (${i + 5})`,
      onclick: () => onTime(p.id),
    }, [
      el('span', { class: 'k', text: String(i + 5) }),
      el('span', { class: 'label', text: p.label }),
    ]);
    timeButtons.set(p.id, button);
    return button;
  }));

  /* ------------------------------------------------------------ room jump */
  function buildJumpBar() {
    const groups = new Map();
    for (const s of api.SPAWNS) {
      const list = groups.get(s.category) || [];
      list.push(s);
      groups.set(s.category, list);
    }
    const nodes = [];
    for (const [category, list] of groups) {
      nodes.push(el('div', { class: 'jumpcat', text: category }));
      for (const s of list) {
        nodes.push(el('button', {
          class: 'chip',
          type: 'button',
          onclick: () => { onJump(s.id); setJumpOpen(false); },
          text: s.name,
        }));
      }
    }
    fill(jumpEl, nodes);
  }
  buildJumpBar();

  function setJumpOpen(open) {
    jumpOpen = open;
    jumpEl.hidden = !open;
  }

  /* --------------------------------------------------------------- prompt */
  function setPrompt(info) {
    if (!info) {
      promptEl.hidden = true;
      crosshair.classList.remove('active');
      return;
    }
    crosshair.classList.add('active');
    const parts = [el('kbd', { text: 'E' })];
    if (info.openable) {
      parts.push(`${info.open ? info.verb[1] : info.verb[0]} ${info.name.toLowerCase()}`);
      parts.push(el('kbd', { text: 'F', style: { 'margin-left': '12px' } }));
      parts.push('Inspect');
    } else {
      parts.push(`Inspect ${info.name.toLowerCase()}`);
    }
    if (info.cost > 0) {
      parts.push(el('span', { class: 'cost', text: `PKR ${formatPKRExact(info.cost)}` }));
    }
    fill(promptEl, parts);
    promptEl.hidden = false;
  }

  /* ---------------------------------------------------------- inspect card */
  function setInspect(info) {
    if (!info) {
      inspectEl.hidden = true;
      clear(inspectBody);
      return;
    }
    const rows = [];
    if (info.room) rows.push(...row('Room', info.room));
    if (info.material) rows.push(...row('Material', info.material));
    if (info.dimensions) rows.push(...row('Dimensions', info.dimensions));
    if (info.boqQuantity) rows.push(...row('Measured', info.boqQuantity));
    if (info.boqTotal) rows.push(...row('Line total', info.boqTotal));

    const actions = [];
    if (info.openable) {
      actions.push(el('button', {
        class: 'chip',
        type: 'button',
        onclick: () => ctx.onOperate(info.id),
        text: info.open ? info.verb[1] : info.verb[0],
      }));
    }
    if (info.pkgId) {
      actions.push(el('button', {
        class: 'chip',
        type: 'button',
        onclick: () => ctx.onShowPackage(info.pkgId),
        text: 'Show in the WBS',
      }));
    }

    fill(inspectBody, [
      el('div', { class: 'insp-kicker', text: info.kind === 'object' ? 'Fitting' : info.kind }),
      el('h3', { class: 'insp-title', text: info.name }),
      info.boqLabel ? el('div', { class: 'insp-sub', text: info.boqLabel }) : null,
      el('p', { class: 'insp-cost', text: info.costLabel }),
      info.pkg || info.account
        ? el('div', { class: 'insp-costnote', text: info.pkg || info.account })
        : null,
      rows.length ? el('dl', { class: 'insp-rows' }, rows) : null,
      info.note ? el('p', { class: 'insp-note', text: info.note }) : null,
      info.rateNote && info.rateNote !== info.note
        ? el('p', { class: 'insp-note', text: info.rateNote })
        : null,
      actions.length ? el('div', { class: 'insp-actions' }, actions) : null,
    ]);
    inspectEl.hidden = false;
  }

  /* --------------------------------------------------------------- toasts */
  function toast(title, body, tone) {
    const node = el('div', { class: `toast${tone ? ` ${tone}` : ''}` }, [
      el('b', { text: title }),
      body || null,
    ]);
    toastsEl.appendChild(node);
    window.setTimeout(() => {
      node.classList.add('out');
      window.setTimeout(() => node.remove(), 400);
    }, 4200);
    while (toastsEl.children.length > 4) toastsEl.firstChild.remove();
    return node;
  }

  /* -------------------------------------------------------------- top bar */
  let lastStats = '';
  function refreshStats() {
    const evm = api.evm();
    const state = api.stateAt();
    const key = `${state.day}|${api.mode}|${api.world.xray}`;
    if (key === lastStats) return;
    lastStats = key;
    fill(statsEl, [
      stat('Day', String(state.day)),
      stat('Phase', state.phase.name),
      stat('Complete', `${(evm.percentComplete * 100).toFixed(0)}%`),
      stat('SPI', evm.spi.toFixed(3), evm.spi >= 0.98 ? 'good' : (evm.spi < 0.94 ? 'bad' : 'warn')),
      stat('CPI', evm.cpi.toFixed(3), evm.cpi >= 0.98 ? 'good' : (evm.cpi < 0.94 ? 'bad' : 'warn')),
      stat('Forecast', api.formatPKR(evm.eac)),
    ]);
  }

  /* ------------------------------------------------------------- chrome */
  byId('btnDash').addEventListener('click', () => onToggleDash());
  byId('btnXray').addEventListener('click', () => onToggleXray());
  byId('btnSettings').addEventListener('click', () => onToggleSettings());
  byId('btnHelp').addEventListener('click', () => onHelp());
  byId('inspectClose').addEventListener('click', () => ctx.onCloseInspect());

  return {
    setPrompt,
    setInspect,
    toast,
    refreshStats,
    setJumpOpen,
    get jumpOpen() { return jumpOpen; },
    setMode(mode) {
      for (const [id, button] of modeButtons) button.classList.toggle('on', id === mode);
    },
    setTime(id) {
      for (const [key, button] of timeButtons) button.classList.toggle('on', key === id);
    },
    setXray(on) {
      byId('btnXray').classList.toggle('on', on);
    },
    setCrosshairVisible(visible) {
      crosshair.classList.toggle('hidden', !visible);
    },
  };
}
