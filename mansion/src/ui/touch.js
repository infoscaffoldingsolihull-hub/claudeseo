/**
 * The touch layer.
 *
 * On a phone or a tablet the left half of the screen is a movement stick and
 * the right half is the look; this module draws the stick so the control is
 * visible rather than invisible-but-present, and puts the interaction key on
 * screen, because a tablet has no E to press.
 */
import { byId } from './dom.js';

export function createTouchLayer(ctx) {
  const { api, input, interaction } = ctx;
  const layer = byId('touchlayer');
  const knob = byId('stickLKnob');

  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const coarse = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  const enabled = coarse || (nav.maxTouchPoints || 0) > 0;

  layer.hidden = !enabled;

  byId('tbInteract').addEventListener('click', () => interaction.activate());
  byId('tbUp').addEventListener('click', () => {
    // On touch the only vertical control that makes sense is the drone's.
    if (api.mode === 'drone') api.controls.state.dronePosition.y += 1.6;
  });

  let raf = 0;
  function paint() {
    raf = window.requestAnimationFrame(paint);
    if (!enabled) return;
    const x = input.touch.moveX * 34;
    const y = input.touch.moveY * 34;
    knob.style.transform = `translate(${x}px, ${y}px)`;
  }
  if (enabled) paint();

  return {
    get enabled() { return enabled; },
    dispose() { if (raf) window.cancelAnimationFrame(raf); },
  };
}
