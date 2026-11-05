import { fmtPKR as corePKR } from '../core/format.js';

/**
 * DOM toolkit shared by the HUD, the dashboard shell and every panel.
 *
 * The simulator ships as one offline HTML file with no framework, so this
 * module is the whole rendering library: element/SVG builders, number
 * formatters, the standard widgets (KPI tile, pill, bar, table, tabs, button,
 * form controls), modal dialogs, the icon set and the English/Urdu label map.
 */

/* ------------------------------------------------------------- builders */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.setAttribute('class', value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return node;
}

export function clear(node) {
  if (!node) return node;
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* ----------------------------------------------------------- formatting */

/** 'PKR 12.40 bn' / 'PKR 350 m' — wraps src/core/format.js so panels import one module. */
export function fmtPKR(v, digits = 2) {
  return corePKR(Number(v), digits);
}

/** Compact number: 1.25M · 48k · 3.2k · 12. */
export function fmtNum(v, digits = 0) {
  v = Number(v);
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}bn`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(0)}k`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toFixed(digits);
}

export function fmtDays(v) {
  v = Number(v);
  if (!Number.isFinite(v)) return '—';
  const n = Math.round(v);
  if (Math.abs(n) >= 730) return `${(n / 365).toFixed(1)} yr`;
  return `${n} d`;
}

export function fmtPct(v, digits = 0) {
  v = Number(v);
  if (!Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtIndex(v, digits = 2) {
  v = Number(v);
  return Number.isFinite(v) ? v.toFixed(digits) : '—';
}

/** Classify an index around 1.0 for colour coding: 'good' | 'warn' | 'bad'. */
export function indexClass(v, warn = 0.95, bad = 0.9) {
  if (!Number.isFinite(v)) return '';
  if (v >= warn) return 'good';
  if (v >= bad) return 'warn';
  return 'bad';
}

/** Title-case an identifier: 'stakeholderSatisfaction' → 'Stakeholder satisfaction'. */
export function humanize(key) {
  const s = String(key).replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------------------------------------------------------------- i18n */

/**
 * Urdu labels for the key UI (mode names, panel titles, HUD metric labels,
 * common actions). Layout stays left-to-right; every translated node carries
 * dir="auto" so the Nastaliq text shapes and orders correctly on its own.
 */
export const I18N = {
  en: {
    'brand.title': 'SKY GATEWAY HYDERABAD',
    'brand.sub': 'Project Management Simulator',
    'mode.inspector': 'Site Walk',
    'mode.manager': 'Project Manager',
    'mode.tour': 'Guided Tour',
    'mode.drone': 'Drone',
    'mode.ops': 'Operations',
    'metric.date': 'Project date',
    'metric.phase': 'Phase',
    'metric.progress': 'Complete',
    'metric.spi': 'SPI',
    'metric.cpi': 'CPI',
    'metric.burn': 'Budget burn',
    'metric.quality': 'Quality',
    'metric.weather': 'Weather',
    'metric.clock': 'Local time',
    'metric.speed': 'Speed',
    'speed.paused': 'Paused',
    'hud.mehran': 'MEHRAN',
    'hud.sim': 'Simulated scenario data',
    'hud.help': 'Help',
    'hud.sound': 'Sound',
    'hud.stats': 'Stats',
    'hud.dashboard': 'Dashboard',
    'group.foundations': 'Foundations',
    'group.plan': 'Plan',
    'group.deliver': 'Deliver & control',
    'group.close': 'Close & assess',
    'group.system': 'System',
    'panel.course': 'Course Map',
    'panel.foundations': 'PM Foundations',
    'panel.lifecycle': 'Life Cycle & Gates',
    'panel.charter': 'Project Charter',
    'panel.approach': 'Development Approach',
    'panel.agile': 'Agile Delivery',
    'panel.aipm': 'AI in Project Management',
    'panel.scope': 'Scope & WBS',
    'panel.schedule': 'Schedule & CPM',
    'panel.control': 'Integrated Change Control',
    'panel.quality': 'Quality Management',
    'panel.cost': 'Cost & Earned Value',
    'panel.risk': 'Risk Register',
    'panel.forecast': 'Monte Carlo Forecast',
    'panel.procurement': 'Procurement',
    'panel.team': 'Team & Resources',
    'panel.stakeholders': 'Stakeholders',
    'panel.msproject': 'MS Project & Exports',
    'panel.closing': 'Closing & Lessons',
    'panel.cases': 'Case Studies',
    'panel.assess': 'Assessment & Quiz',
    'panel.present': 'Present & Report',
    'panel.missions': 'Missions',
    'panel.operations': 'Operations & Benefits',
    'panel.session': 'Session & Settings',
    'phase.initiating': 'Initiating',
    'phase.planning': 'Planning',
    'phase.executing': 'Executing',
    'phase.monitoring': 'Monitoring & Controlling',
    'phase.closing': 'Closing',
    'action.close': 'Close',
    'action.approve': 'Approve',
    'action.reject': 'Reject',
    'action.next': 'Next',
    'action.back': 'Back',
    'action.skip': 'Skip',
  },
  ur: {
    'brand.title': 'اسکائی گیٹ وے حیدرآباد',
    'brand.sub': 'پروجیکٹ مینجمنٹ سمیولیٹر',
    'mode.inspector': 'سائٹ معائنہ',
    'mode.manager': 'پروجیکٹ مینیجر',
    'mode.tour': 'رہنمائی دورہ',
    'mode.drone': 'ڈرون',
    'mode.ops': 'آپریشنز',
    'metric.date': 'پروجیکٹ تاریخ',
    'metric.phase': 'مرحلہ',
    'metric.progress': 'مکمل',
    'metric.spi': 'شیڈول اشاریہ',
    'metric.cpi': 'لاگت اشاریہ',
    'metric.burn': 'بجٹ خرچ',
    'metric.quality': 'معیار',
    'metric.weather': 'موسم',
    'metric.clock': 'مقامی وقت',
    'metric.speed': 'رفتار',
    'speed.paused': 'رکا ہوا',
    'hud.mehran': 'مہران',
    'hud.sim': 'فرضی منظرنامہ ڈیٹا',
    'hud.help': 'مدد',
    'hud.sound': 'آواز',
    'hud.stats': 'شماریات',
    'hud.dashboard': 'ڈیش بورڈ',
    'group.foundations': 'بنیادیں',
    'group.plan': 'منصوبہ بندی',
    'group.deliver': 'ترسیل اور کنٹرول',
    'group.close': 'اختتام اور جائزہ',
    'group.system': 'نظام',
    'panel.course': 'کورس کا نقشہ',
    'panel.foundations': 'پروجیکٹ مینجمنٹ کی بنیادیں',
    'panel.lifecycle': 'لائف سائیکل اور گیٹس',
    'panel.charter': 'پروجیکٹ چارٹر',
    'panel.approach': 'ترقیاتی طریقۂ کار',
    'panel.agile': 'ایجائل ترسیل',
    'panel.aipm': 'پروجیکٹ مینجمنٹ میں مصنوعی ذہانت',
    'panel.scope': 'دائرۂ کار اور WBS',
    'panel.schedule': 'نظام الاوقات اور CPM',
    'panel.control': 'تبدیلی کا مربوط کنٹرول',
    'panel.quality': 'معیار کا انتظام',
    'panel.cost': 'لاگت اور حاصل شدہ قدر',
    'panel.risk': 'خطرات کا رجسٹر',
    'panel.forecast': 'مونٹی کارلو پیش گوئی',
    'panel.procurement': 'خریداری',
    'panel.team': 'ٹیم اور وسائل',
    'panel.stakeholders': 'اسٹیک ہولڈرز',
    'panel.msproject': 'ایم ایس پروجیکٹ اور برآمدات',
    'panel.closing': 'اختتام اور اسباق',
    'panel.cases': 'کیس اسٹڈیز',
    'panel.assess': 'جائزہ اور کوئز',
    'panel.present': 'پیشکش اور رپورٹ',
    'panel.missions': 'مشنز',
    'panel.operations': 'آپریشنز اور فوائد',
    'panel.session': 'سیشن اور ترتیبات',
    'phase.initiating': 'آغاز',
    'phase.planning': 'منصوبہ بندی',
    'phase.executing': 'عملدرآمد',
    'phase.monitoring': 'نگرانی اور کنٹرول',
    'phase.closing': 'اختتام',
    'action.close': 'بند کریں',
    'action.approve': 'منظور',
    'action.reject': 'مسترد',
    'action.next': 'اگلا',
    'action.back': 'پچھلا',
    'action.skip': 'چھوڑیں',
  },
};

let LANG = 'en';

export function setLanguage(lang) {
  LANG = lang === 'ur' ? 'ur' : 'en';
  return LANG;
}

export function getLanguage() {
  return LANG;
}

/** Translate a UI key; falls back to English, then to the fallback text, then to the key. */
export function t(key, fallback) {
  return (I18N[LANG] && I18N[LANG][key]) || I18N.en[key] || fallback || key;
}

/** A span whose text follows the language setting (see `relabel`). */
export function tl(key, tag = 'span', attrs = {}) {
  return el(tag, { ...attrs, 'data-i18n': key, dir: 'auto', text: t(key) });
}

/** Re-apply translations to every `[data-i18n]` node under `root`. */
export function relabel(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-title]')) {
    node.title = t(node.dataset.i18nTitle);
    node.setAttribute('aria-label', node.title);
  }
}

/* ---------------------------------------------------------------- icons */

const ICONS = {
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19V5 M8 7h7',
  cycle: 'M20 12a8 8 0 0 1-14.3 4.9 M4 12A8 8 0 0 1 18.3 7.1 M18 3v4.5h-4.5 M6 21v-4.5h4.5',
  scroll: 'M5 4h11a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H7a2 2 0 0 1-2-2z M5 4a2 2 0 0 0-2 2v2h2 M8 9h7 M8 13h7',
  fork: 'M6 3v6a6 6 0 0 0 6 6h0a6 6 0 0 1 6 6 M18 3v6a6 6 0 0 1-6 6 M4 5l2-2 2 2 M16 5l2-2 2 2',
  sprint: 'M4 12a8 8 0 1 0 3-6.2 M4 4v4h4 M12 8v4l3 2',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  tree: 'M4 5h6M4 5v14M4 12h6M4 19h6M13 3h7v4h-7z M13 10h7v4h-7z M13 17h7v4h-7z',
  gantt: 'M3 3v18 M6 6h8 M9 11h10 M6 16h6 M3 21h18',
  shuffle: 'M3 7h4l10 10h4 M3 17h4l3-3 M14 10l3-3h4 M18 4l3 3-3 3 M18 14l3 3-3 3',
  gauge: 'M4 18a9 9 0 1 1 16 0 M12 14l4-4 M12 18h.01',
  coins: 'M12 7c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3z M4 4v5c0 1.7 3.6 3 8 3s8-1.3 8-3V4 M4 11v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
  warning: 'M12 3 2 20h20z M12 10v5 M12 17.6v.1',
  dice: 'M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z M12 12l8-4.5M12 12v8M12 12 4 7.5',
  truck: 'M3 6h11v9H3z M14 9h4l3 3v3h-7 M7 18a2 2 0 1 0 0-.1 M17 18a2 2 0 1 0 0-.1',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2 20a7 7 0 0 1 14 0 M17 11a3 3 0 1 0 0-6 M17.5 14a6 6 0 0 1 4.5 6',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 12h.01',
  table: 'M3 5h18v14H3z M3 10h18 M3 15h18 M9 5v14',
  flagCheck: 'M5 21V4 M5 4h13l-2.5 4L18 12H5 M9 8l2 2 3-3',
  case: 'M4 7h16v12H4z M9 7V5h6v2 M4 12h16',
  quiz: 'M9 9a3 3 0 1 1 4 2.8c-.8.4-1 1-1 1.7v.5 M12 17.5v.1 M4 3h16v18H4z',
  present: 'M3 4h18v11H3z M12 15v5 M8 20h8 M7 11l3-3 2 2 4-4',
  flag: 'M5 21V4 M5 4h13l-2.5 4L18 12H5',
  plane: 'M2 16l20-6-3-2-7 2-5-6H5l2 7-4 1-1-2H0 M2 16l3 0',
  planeUp: 'M12 2c1 0 1.6 1 1.6 2.2V9l7.4 4.6v2l-7.4-2.2v4.4l2.2 1.7v1.7L12 20l-3.8 1.2v-1.7l2.2-1.7v-4.4L3 15.6v-2L10.4 9V4.2C10.4 3 11 2 12 2z',
  save: 'M5 4h11l3 3v13H5z M8 4v5h7V4 M8 19v-6h8v6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4z',
  help: 'M9 9a3 3 0 1 1 4 2.8c-.8.4-1 1-1 1.7v.5 M12 17.5v.1 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  stats: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  sound: 'M4 9v6h4l5 4V5L8 9z M16.5 8.5a5 5 0 0 1 0 7 M19 6a8.5 8.5 0 0 1 0 12',
  mute: 'M4 9v6h4l5 4V5L8 9z M17 9l5 6 M22 9l-5 6',
  chat: 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5',
  close: 'M6 6l12 12 M18 6 6 18',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  play: 'M7 5v14l11-7z',
  pause: 'M8 5v14 M16 5v14',
  prev: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4z M12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  orbit: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 12c0-2.5 4-4.5 9-4.5s9 2 9 4.5-4 4.5-9 4.5c-2 0-3.8-.3-5.3-.9 M7 18.5 6.5 16l2.4-.6',
  up: 'M12 19V5 M6 11l6-6 6 6',
  down: 'M12 5v14 M6 13l6 6 6-6',
  walk: 'M13 4a1.5 1.5 0 1 0 0-.1 M9 21l3-7 3 3v4 M7 12l3-4 4 1 3 3 M12 14l-1-6',
  drone: 'M5 5h3 M16 5h3 M6.5 5v3 M17.5 5v3 M8 10h8l1.5 3h-11z M9 13v3 M15 13v3 M10 16h4',
  tower: 'M9 21l1-11h4l1 11 M7 10h10l-1-4H8z M10 6V4h4v2 M6 21h12',
  ncr: 'M5 3h10l4 4v14H5z M15 3v4h4 M9 12l6 6 M15 12l-6 6',
  check: 'M5 12l4 4 10-10',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  haze: 'M5 12a7 7 0 0 1 14 0 M3 15h18 M5 18h14 M8 21h8',
  dust: 'M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h7 M14 20h6',
  rain: 'M7 16a5 5 0 1 1 1-9.9A6 6 0 0 1 19 9a4 4 0 0 1-1 7z M8 19l-1 2 M12 19l-1 2 M16 19l-1 2',
  fog: 'M7 10a5 5 0 0 1 10 0 M3 13h18 M5 16h14 M3 19h18',
  heat: 'M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z M12 9v7 M18 4c1 1 1 2 0 3s-1 2 0 3',
  night: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17.5l9 5 9-5',
  export: 'M12 3v12 M7 8l5-5 5 5 M4 15v5h16v-5',
  import: 'M12 15V3 M7 10l5 5 5-5 M4 15v5h16v-5',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  keyboard: 'M3 6h18v12H3z M7 10h.01 M11 10h.01 M15 10h.01 M7 14h10',
  battery: 'M3 8h15v8H3z M20 11v2',
  windsock: 'M4 21V3 M4 5l15 2v6L4 15 M9 5.6v8.8 M14 6.3v7.4',
};

export function icon(name, size = 18, attrs = {}) {
  const d = ICONS[name] || ICONS.help;
  return svg('svg', {
    class: `ico ${attrs.class || ''}`.trim(),
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': attrs.strokeWidth || 1.6,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  }, [svg('path', { d })]);
}

export function hasIcon(name) {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}

/* --------------------------------------------------------------- widgets */

/** KPI tile. kpi(label, value, foot, cls) or kpi({ label, value, foot, cls, title, i18n }). */
export function kpi(label, value, foot, cls) {
  let o = label;
  if (typeof label !== 'object' || label === null || label instanceof Node) o = { label, value, foot, cls };
  return el('div', { class: `kpi ${o.cls || ''}`.trim(), title: o.title || null, role: 'group', 'aria-label': `${o.label}: ${o.value}` }, [
    el('div', { class: 'label', dir: 'auto', text: String(o.label) }),
    el('div', { class: 'value', text: o.value === undefined || o.value === null ? '—' : String(o.value) }),
    o.foot ? el('div', { class: 'foot', text: String(o.foot) }) : null,
  ]);
}

/** A responsive grid of KPI tiles: kpiGrid([[label, value, foot, cls], …], cols). */
export function kpiGrid(items, cols = 4) {
  return el('div', { class: `grid c${cols}` }, items.map((i) => (Array.isArray(i) ? kpi(...i) : kpi(i))));
}

/** Small status pill. cls: ok | warn | bad | info | gold | muted | ajrak | indigo. */
export function pill(text, cls = '', title = null) {
  return el('span', { class: `tag ${cls}`.trim(), title, text: String(text) });
}

/** Progress bar 0..1 with an accessible value. */
export function bar(fraction, cls = '', label = '') {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  return el('div', {
    class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100,
    'aria-valuenow': Math.round(f * 100), 'aria-label': label || null,
  }, [el('i', { class: cls, style: { width: `${f * 100}%` } })]);
}

/**
 * Data table.
 *   cols: ['Name', …] or [{ key, label, num?, format?(value, row), cls?(value,row)|string, width?, title? }]
 *   rows: arrays (positional) or objects (by key)
 *   opts: { class, caption, onRow(row, i), rowClass(row, i), empty, maxRows, sortable, dense, selected(row) }
 */
export function table(cols, rows, opts = {}) {
  const spec = cols.map((c, i) => (typeof c === 'string' ? { key: i, label: c } : { key: c.key === undefined ? i : c.key, ...c }));
  const state = { sortKey: null, dir: 1 };
  const tbody = el('tbody');
  const cell = (row, c, idx) => (Array.isArray(row) ? row[typeof c.key === 'number' ? c.key : idx] : row[c.key]);
  const fill = () => {
    clear(tbody);
    let list = [...(rows || [])];
    if (state.sortKey !== null) {
      const c = spec.find((s) => s.key === state.sortKey);
      const idx = spec.indexOf(c);
      list.sort((a, b) => {
        const va = cell(a, c, idx);
        const vb = cell(b, c, idx);
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * state.dir;
        return String(va ?? '').localeCompare(String(vb ?? '')) * state.dir;
      });
    }
    if (opts.maxRows) list = list.slice(0, opts.maxRows);
    if (!list.length) {
      tbody.appendChild(el('tr', { class: 'empty' }, [el('td', { colspan: spec.length, text: opts.empty || 'Nothing to show yet.' })]));
      return;
    }
    list.forEach((row, ri) => {
      const tr = el('tr', {
        class: [opts.rowClass ? opts.rowClass(row, ri) : '', opts.selected && opts.selected(row) ? 'selected' : ''].join(' ').trim() || null,
      });
      if (opts.onRow) {
        tr.tabIndex = 0;
        tr.classList.add('clickable');
        tr.addEventListener('click', () => opts.onRow(row, ri));
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onRow(row, ri); } });
      }
      spec.forEach((c, ci) => {
        const v = cell(row, c, ci);
        const content = c.format ? c.format(v, row) : v;
        const cls = [c.num ? 'num' : '', typeof c.cls === 'function' ? c.cls(v, row) : c.cls || ''].join(' ').trim();
        const td = el('td', { class: cls || null });
        if (content instanceof Node) td.appendChild(content);
        else td.textContent = content === undefined || content === null ? '—' : String(content);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  };
  const headRow = el('tr', {}, spec.map((c) => {
    const th = el('th', { class: c.num ? 'num' : null, title: c.title || null, scope: 'col', style: c.width ? { width: c.width } : null }, [String(c.label ?? '')]);
    if (opts.sortable !== false && opts.sortable) {
      th.tabIndex = 0;
      th.classList.add('sortable');
      const sort = () => {
        state.dir = state.sortKey === c.key ? -state.dir : 1;
        state.sortKey = c.key;
        for (const h of headRow.children) h.removeAttribute('aria-sort');
        th.setAttribute('aria-sort', state.dir > 0 ? 'ascending' : 'descending');
        fill();
      };
      th.addEventListener('click', sort);
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); } });
    }
    return th;
  }));
  fill();
  return el('div', { class: 'table-wrap' }, [
    el('table', { class: `data ${opts.dense ? 'dense' : ''} ${opts.class || ''}`.trim() }, [
      opts.caption ? el('caption', { text: opts.caption }) : null,
      el('thead', {}, [headRow]),
      tbody,
    ]),
  ]);
}

/**
 * Tab strip with roving keyboard focus. items: ['a', …] or [{ id, label, badge? }].
 * Returns the tablist element; onChange(id) fires on click / Enter / arrow keys.
 */
export function tabs(items, active, onChange) {
  const list = items.map((i) => (typeof i === 'string' ? { id: i, label: humanize(i) } : i));
  const bar_ = el('div', { class: 'tabs', role: 'tablist' });
  const buttons = list.map((it) => {
    const on = it.id === active;
    const b = el('button', {
      type: 'button', role: 'tab', class: on ? 'active' : null, 'aria-selected': on ? 'true' : 'false',
      tabindex: on ? '0' : '-1', dataset: { tab: it.id },
      onclick: () => { if (onChange) onChange(it.id); },
    }, [
      it.icon ? icon(it.icon, 14) : null,
      el('span', { dir: 'auto', text: it.label }),
      it.badge !== undefined && it.badge !== null ? el('em', { class: 'tab-badge', text: String(it.badge) }) : null,
    ]);
    return b;
  });
  bar_.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (i === -1) return;
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % buttons.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + buttons.length) % buttons.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = buttons.length - 1;
    if (j >= 0) {
      e.preventDefault();
      buttons[j].focus();
      if (onChange) onChange(list[j].id);
    }
  });
  for (const b of buttons) bar_.appendChild(b);
  return bar_;
}

/** Standard action button. opts: { kind: 'primary'|'ghost'|'danger'|'good', icon, title, disabled, small, id }. */
export function button(label, onClick, opts = {}) {
  const b = el('button', {
    type: 'button',
    class: `action ${opts.kind || ''} ${opts.small ? 'small' : ''}`.replace(/\s+/g, ' ').trim(),
    title: opts.title || null,
    'aria-label': opts.ariaLabel || null,
    disabled: !!opts.disabled,
    id: opts.id || null,
    onclick: (e) => { if (onClick) onClick(e); },
  }, [opts.icon ? icon(opts.icon, 15) : null, label ? el('span', { dir: 'auto', text: label }) : null]);
  return b;
}

/* --------------------------------------------------------- form controls */

let fieldSeq = 0;

/** Labelled field row: field(label, control, hint). */
export function field(label, control, hint) {
  const id = control.id || `f${++fieldSeq}`;
  const target = control.matches && control.matches('input,select,textarea') ? control : control.querySelector && control.querySelector('input,select,textarea');
  if (target && !target.id) target.id = id;
  return el('div', { class: 'field' }, [
    el('label', { for: target ? target.id : null, dir: 'auto', text: label }),
    el('div', { class: 'field-control' }, [control]),
    hint ? el('div', { class: 'field-hint', text: hint }) : null,
  ]);
}

/** Accessible switch (checkbox styled as a toggle). */
export function toggle(label, checked, onChange, hint) {
  const input = el('input', { type: 'checkbox', role: 'switch', checked: !!checked });
  input.addEventListener('change', () => onChange && onChange(input.checked));
  return el('label', { class: 'switch-row' }, [
    el('span', { class: 'switch-text' }, [el('b', { dir: 'auto', text: label }), hint ? el('small', { text: hint }) : null]),
    input,
    el('span', { class: 'switch', 'aria-hidden': 'true' }),
  ]);
}

/** <select> from [{ value, label }] or ['a', 'b']. */
export function select(options, value, onChange, attrs = {}) {
  const s = el('select', attrs, options.map((o) => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : humanize(o);
    return el('option', { value: v, selected: String(v) === String(value) }, [l]);
  }));
  s.addEventListener('change', () => onChange && onChange(s.value));
  return s;
}

/** Range slider with a live value read-out. */
export function slider(min, max, step, value, onChange, format = (v) => String(v), attrs = {}) {
  const out = el('output', { class: 'slider-out', text: format(Number(value)) });
  const input = el('input', { type: 'range', min, max, step, value, ...attrs });
  input.addEventListener('input', () => { out.textContent = format(Number(input.value)); if (onChange) onChange(Number(input.value), false); });
  input.addEventListener('change', () => { if (onChange) onChange(Number(input.value), true); });
  return el('div', { class: 'slider' }, [input, out]);
}

/* ---------------------------------------------------------------- modals */

const modalStack = [];

function modalHost() {
  return document.getElementById('ui-root') || document.body;
}

/**
 * Open a modal dialog. body: string | Node | Node[]. actions: [{ label, kind, onClick?(close), keep? }].
 * Returns { root, close(result) }. Focus is trapped inside and restored on close.
 * opts: { title, body, actions, onClose(result), dismissible = true, kind, icon, wide, labelledBy }
 */
export function openModal(opts = {}) {
  const previous = document.activeElement;
  const titleId = `m${++fieldSeq}`;
  let closed = false;
  const handle = {};
  const close = (result) => {
    if (closed) return;
    closed = true;
    const i = modalStack.indexOf(handle);
    if (i !== -1) modalStack.splice(i, 1);
    overlay.classList.add('leaving');
    const done = () => overlay.remove();
    if (document.body.classList.contains('reduced-motion')) done();
    else setTimeout(done, 160);
    document.removeEventListener('keydown', trap, true);
    if (previous && previous.focus && document.contains(previous)) {
      try { previous.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
    if (opts.onClose) opts.onClose(result);
  };
  const body = el('div', { class: 'modal-body' });
  const content = typeof opts.body === 'string' ? [el('p', { text: opts.body })] : [].concat(opts.body || []);
  for (const c of content) if (c) body.appendChild(c);
  const actions = el('div', { class: 'modal-actions' }, (opts.actions || [{ label: t('action.close'), kind: 'ghost' }]).map((a) =>
    button(a.label, () => {
      if (a.onClick) a.onClick(close);
      if (!a.keep) close(a.value === undefined ? a.label : a.value);
    }, { kind: a.kind || '', icon: a.icon })));
  const card = el('div', {
    class: `modal-card ${opts.kind || ''} ${opts.wide ? 'wide' : ''}`.trim(),
    role: opts.kind === 'alert' ? 'alertdialog' : 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId,
  }, [
    el('div', { class: 'modal-head' }, [
      opts.icon ? el('span', { class: 'modal-icon' }, [icon(opts.icon, 20)]) : null,
      el('h2', { id: titleId, dir: 'auto', text: opts.title || '' }),
      opts.dismissible === false ? null : el('button', { type: 'button', class: 'icon-btn modal-x', 'aria-label': t('action.close'), onclick: () => close(null) }, [icon('close', 16)]),
    ]),
    body,
    actions,
  ]);
  const overlay = el('div', { class: 'modal-overlay' }, [card]);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && opts.dismissible !== false) close(null); });
  const trap = (e) => {
    if (modalStack[modalStack.length - 1] !== handle) return;
    if (e.key === 'Escape' && opts.dismissible !== false) { e.stopPropagation(); e.preventDefault(); close(null); return; }
    if (e.key !== 'Tab') return;
    const f = [...card.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled && n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', trap, true);
  Object.assign(handle, { root: overlay, card, body, close });
  modalStack.push(handle);
  modalHost().appendChild(overlay);
  const focusTarget = card.querySelector('.modal-actions .action.primary') || card.querySelector('.modal-actions .action') || card;
  if (focusTarget === card) card.tabIndex = -1;
  setTimeout(() => { try { focusTarget.focus({ preventScroll: true }); } catch { /* ignore */ } }, 0);
  return handle;
}

export function modalCount() {
  return modalStack.length;
}

export function closeTopModal(result = null) {
  const top = modalStack[modalStack.length - 1];
  if (top) top.close(result);
  return !!top;
}

export function closeAllModals() {
  while (modalStack.length) modalStack[modalStack.length - 1].close(null);
}

/** Promise-based confirm built on openModal. */
export function confirmModal(title, text, { okLabel = 'OK', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title, body: text,
      actions: [
        { label: cancelLabel, kind: 'ghost', onClick: () => { answered = true; resolve(false); } },
        { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}
