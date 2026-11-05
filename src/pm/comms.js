/**
 * Communications & stakeholder analysis helpers — pure JS.
 */

export const ENGAGEMENT_LEVELS = ['Unaware', 'Resistant', 'Neutral', 'Supportive', 'Leading'];

/** Communication channels among n people: n(n − 1)/2. */
export function channels(n) {
  return n < 2 ? 0 : (n * (n - 1)) / 2;
}

/** Power/interest grid quadrant (Mendelow). */
export function gridQuadrant(power, interest) {
  if (power >= 0.5 && interest >= 0.5) return 'Manage closely';
  if (power >= 0.5) return 'Keep satisfied';
  if (interest >= 0.5) return 'Keep informed';
  return 'Monitor';
}

/** Salience model (Mitchell, Agle & Wood): which of power, legitimacy, urgency are held. */
export function salience({ power, legitimacy, urgency }) {
  const p = power >= 0.5;
  const l = legitimacy >= 0.5;
  const u = urgency >= 0.5;
  if (p && l && u) return 'Definitive';
  if (p && l) return 'Dominant';
  if (p && u) return 'Dangerous';
  if (l && u) return 'Dependent';
  if (p) return 'Dormant';
  if (l) return 'Discretionary';
  if (u) return 'Demanding';
  return 'Non-stakeholder';
}

/** Stakeholder engagement assessment matrix gap (desired − current). */
export function engagementGap(current, desired) {
  return desired - current;
}

export function engagementLabel(level) {
  return ENGAGEMENT_LEVELS[Math.max(1, Math.min(5, Math.round(level))) - 1];
}
