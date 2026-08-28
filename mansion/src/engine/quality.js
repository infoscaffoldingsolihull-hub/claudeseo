/**
 * Graphics quality tiers and continuous adaptive re-tiering.
 *
 * The deliverable is a single file that might be opened on an RTX
 * workstation, a six-year-old laptop with integrated graphics, a lectern PC
 * at a conference, or a phone.  Nothing about the target machine can be
 * assumed, so the engine:
 *
 *   1. picks a starting tier from what the GPU reports about itself,
 *   2. measures a rolling average of frame time, and
 *   3. steps down (or back up) a tier when the average sits outside a band
 *      for long enough to be a trend rather than a hiccup.
 *
 * A `?quality=` URL parameter pins the tier, which is what you use on a
 * machine you already know.
 */

/**
 * shadowMap   directional shadow map resolution
 * pixelRatio  cap on devicePixelRatio
 * msaa        multisample count on the HDR scene target
 * bloomPasses how many separable gaussian iterations the bloom runs
 * anisotropy  texture anisotropy cap
 * workers     maximum animated site workforce
 * texture     procedural texture resolution
 * shadowDist  how far shadows are fitted from the camera, in metres
 * props       density multiplier for vegetation and small props
 */
export const TIERS = {
  low: {
    name: 'low', label: 'Low', shadowMap: 1024, pixelRatio: 1.0, msaa: 0, bloomPasses: 1,
    anisotropy: 1, workers: 26, texture: 256, shadowDist: 55, props: 0.42, softShadow: false,
  },
  medium: {
    name: 'medium', label: 'Medium', shadowMap: 2048, pixelRatio: 1.25, msaa: 2, bloomPasses: 1,
    anisotropy: 4, workers: 54, texture: 512, shadowDist: 75, props: 0.7, softShadow: true,
  },
  high: {
    name: 'high', label: 'High', shadowMap: 3072, pixelRatio: 1.5, msaa: 4, bloomPasses: 2,
    anisotropy: 8, workers: 84, texture: 512, shadowDist: 95, props: 1.0, softShadow: true,
  },
  ultra: {
    name: 'ultra', label: 'Ultra', shadowMap: 4096, pixelRatio: 2.0, msaa: 4, bloomPasses: 2,
    anisotropy: 16, workers: 120, texture: 1024, shadowDist: 120, props: 1.35, softShadow: true,
  },
};

export const TIER_ORDER = ['low', 'medium', 'high', 'ultra'];

/** Read `?quality=` from the URL, if it names a real tier. */
export function pinnedTier() {
  try {
    const params = new URLSearchParams(globalThis.location ? globalThis.location.search : '');
    const q = (params.get('quality') || '').toLowerCase();
    return TIERS[q] ? q : null;
  } catch {
    return null;
  }
}

/** Ask the GPU what it is, when the browser is willing to say. */
function describeGpu(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return String(gl.getParameter(gl.RENDERER) || '');
  } catch {
    return '';
  }
}

/**
 * Pick a starting tier.  Deliberately conservative: it is far better to open
 * at medium and climb to ultra within a couple of seconds than to open at
 * ultra and stutter through the first impression.
 */
export function detectTier(renderer) {
  const pinned = pinnedTier();
  if (pinned) return pinned;

  const gpu = describeGpu(renderer).toLowerCase();
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const cores = nav.hardwareConcurrency || 4;
  const memory = nav.deviceMemory || 4;
  const mobile = /android|iphone|ipad|ipod|mobile/i.test(nav.userAgent || '');
  const touchOnly = mobile || ((nav.maxTouchPoints || 0) > 0 && !/windows/i.test(nav.userAgent || ''));

  // Software rasterisers announce themselves; they cannot carry a heavy tier.
  if (/swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(gpu)) return 'low';
  if (touchOnly) return cores >= 6 && memory >= 4 ? 'medium' : 'low';

  const discrete = /rtx|geforce|radeon rx|radeon pro|quadro|arc a|apple m[1-9]/i.test(gpu);
  const integrated = /intel|uhd|iris|vega \d|hd graphics/i.test(gpu);

  if (discrete && cores >= 8 && memory >= 8) return 'high';
  if (discrete) return 'medium';
  if (integrated) return cores >= 8 ? 'medium' : 'low';
  return cores >= 8 && memory >= 8 ? 'medium' : 'low';
}

/**
 * Adaptive tier controller.
 *
 * The band is deliberately wide and the dwell times long, so the tier does
 * not oscillate: it takes 2.5 seconds of sustained slowness to drop and 6
 * seconds of sustained headroom to climb, and the controller never climbs
 * back above a tier it has already had to abandon twice.
 */
export function createQualityController(startTier, onChange) {
  let current = TIERS[startTier] ? startTier : 'medium';
  const pinned = pinnedTier();
  let accum = 0;
  let frames = 0;
  let slowFor = 0;
  let fastFor = 0;
  let ceilingIndex = TIER_ORDER.length - 1;
  const demotions = new Map();
  let smoothedMs = 16.7;

  const api = {
    get tier() { return TIERS[current]; },
    get name() { return current; },
    get pinned() { return !!pinned; },
    get fps() { return smoothedMs > 0 ? 1000 / smoothedMs : 0; },
    get frameMs() { return smoothedMs; },

    /** Force a tier (the settings menu and the URL parameter both use this). */
    set(name) {
      if (!TIERS[name] || name === current) return false;
      current = name;
      slowFor = 0;
      fastFor = 0;
      if (onChange) onChange(TIERS[current], 'manual');
      return true;
    },

    /** Feed one frame's duration, in milliseconds. */
    sample(dtMs) {
      if (!Number.isFinite(dtMs) || dtMs <= 0 || dtMs > 2000) return;
      accum += dtMs;
      frames += 1;
      // Exponential smoothing for the on-screen readout.
      smoothedMs += (dtMs - smoothedMs) * 0.06;
      if (frames < 20) return;
      const avg = accum / frames;
      accum = 0;
      frames = 0;
      if (pinned) return;

      const index = TIER_ORDER.indexOf(current);
      // Below 34 fps for long enough: step down.
      if (avg > 29) {
        slowFor += avg * 20;
        fastFor = 0;
        if (slowFor > 2500 && index > 0) {
          const next = TIER_ORDER[index - 1];
          const count = (demotions.get(current) || 0) + 1;
          demotions.set(current, count);
          if (count >= 2) ceilingIndex = Math.min(ceilingIndex, index - 1);
          current = next;
          slowFor = 0;
          if (onChange) onChange(TIERS[current], 'auto-down');
        }
      // Above 55 fps for long enough, and allowed to climb: step up.
      } else if (avg < 18) {
        fastFor += avg * 20;
        slowFor = 0;
        if (fastFor > 6000 && index < ceilingIndex) {
          current = TIER_ORDER[index + 1];
          fastFor = 0;
          if (onChange) onChange(TIERS[current], 'auto-up');
        }
      } else {
        slowFor = Math.max(0, slowFor - 400);
        fastFor = Math.max(0, fastFor - 400);
      }
    },
  };
  return api;
}
