/**
 * The two guided tours.
 *
 * One walks the finished house; the other tells the construction story, and
 * moves the timeline as it goes, so the camera and the programme advance
 * together. Both are keyframe scripts played by the cinematic camera in
 * engine/controls.js, with a caption for every beat — captions, not narration,
 * so the tour works with the sound off and reads on a projector.
 */
import { el, fill, byId } from './dom.js';
import { formatDay } from '../pm/project.js';


/** A beat: where the camera sits, what it looks at, and what to say about it. */
function beat(position, target, duration, caption, day) {
  return { position: { x: position[0], y: position[1], z: position[2] },
    target: { x: target[0], y: target[1], z: target[2] },
    duration, caption, day };
}

export function createTours(ctx) {
  const { api, hud, controls, onEnd } = ctx;
  const project = api.project;
  const finish = project.actFinish;

  const tourEl = byId('tour');
  const captionEl = byId('tourCaption');
  const fillEl = byId('tourFill');

  const HOUSE = [
    beat([0, 1.7, 13.6], [0, 2.2, 6], 7,
      'Bagh-e-Shahi Manor stands on two kanals — 1,011 square metres — in DHA Phase VI, Lahore. Eight hundred and ninety-four square metres of covered area over a basement, a ground floor and a first floor, behind a two-storey portico.'),
    beat([0, 2.2, 11.0], [0, 3.0, 5.5], 6,
      'The drive runs north from the gate past a carved stone fountain. The principal elevation faces south, so the portico shades the front rooms through the worst of the afternoon.'),
    beat([-4.5, 2.0, 8.4], [1.5, 4.0, 4.5], 6.5,
      'Eight stone columns of a Corinthian order carry an entablature and a pediment. They run the full two storeys — the terrace floor spans between them at first-floor level.'),
    beat([0, 1.75, 5.6], [0, 2.2, 1.5], 5,
      'The main door is a carved teak double leaf: one point nine metres wide, two point seven five high, and PKR 18.5 lakh of the bill of quantities on its own.'),
    beat([0, 1.75, 1.9], [0, 4.2, -1.6], 7,
      'The grand foyer is double height, open through both storeys to a glazed oculus under the cupola. The chandelier hangs in that void so it reads from the floor and from the gallery above.'),
    beat([-2.2, 1.7, 0.9], [-8, 1.6, 0.6], 6,
      'West of the foyer is the majlis — the formal reception room. Imported marble underfoot, panelled walls, and a carpet that alone is worth more than the whole substructure of a smaller house.'),
    beat([2.2, 1.7, 0.9], [8.5, 1.5, 0.5], 6,
      'East is the formal dining room, laid for twelve. Beyond it the family lounge, and behind that the kitchen — the service side of the plan is kept off the principal axis throughout.'),
    beat([2.6, 1.7, -2.6], [-1.2, 2.6, -5.2], 7,
      'The stair hall. A dog-leg flight of eighteen risers turns on a half landing; the balustrade is hand-forged wrought iron and the treads are clad in the same imported marble as the foyer.'),
    beat([0, 5.7, 2.4], [0, 2.0, 0.2], 6.5,
      'From the first-floor gallery you look straight back down into the foyer. The gallery is the circulation spine of the upper floor: five bedrooms, a study and the master suite all open off it.'),
    beat([-4.6, 5.7, 0.8], [-9.4, 5.4, 0.6], 6,
      'The master suite runs the full width of the west front, with its own dressing room and bathroom behind. The arched windows on this elevation are the only ones in the house that are not rectangular.'),
    beat([-6.4, 5.7, -10.2], [-9.6, 5.5, -12.2], 6,
      'The study, lined floor to ceiling in oak with a ladder rail. Above the library the roof terrace opens off the gallery over the portico.'),
    beat([13.6, 1.4, 3.6], [13.6, 0.2, -6], 6.5,
      'On the east side, a ten-metre pool with a stone deck. The basement below holds a home cinema, a gymnasium and a sauna.'),
    beat([-24, 12, 26], [0, 6, -1], 8,
      'Seen whole: the portico and its pediment, the parapet with its moulded coping, and the ribbed cupola over the foyer with a brass finial at fifteen metres.'),
    beat([0, 26, 34], [0, 5, -4], 8,
      'One thousand and twenty square metres of plot. Every door, every window, every fitting you have passed carries a price in the bill of quantities, and every one of those prices adds up to the budget the dashboard is tracking.'),
  ];

  const CONSTRUCTION = [
    beat([-26, 10, 26], [0, 0, -2], 6,
      'Day 0. A bare, surveyed plot. Design and the soil investigation are running, and nothing can be dug until the LDA approval is in hand — the network makes that approval a predecessor of the excavation.', 0),
    beat([-22, 8, 22], [-2, 0, -2], 6,
      'Site establishment. The boundary wall goes up first — it secures the site, and pilferage is a quantified risk on this register with a two point one crore impact. The compound goes in behind it: two cabins, the stockpiles and the batching area, and the tower crane on its concrete base.', Math.round(finish * 0.12)),
    beat([-16, 5, 11], [-2, -2.5, -5], 6,
      'Bulk excavation. Fourteen hundred cubic metres out, machine-dug and carted within fifteen kilometres. Watch the formation drop lift by lift as the package earns value — the excavator is working the level the schedule says it is on, not an animation loop.', Math.round(finish * 0.18)),
    beat([-16, 6, 10], [-2, -2, -4], 6,
      'The raft. Blinding, anti-termite treatment, then reinforcement and a single 186 cubic metre pour. The first quality gate is the cover to that reinforcement; the second is the twenty-eight-day cube strength.', Math.round(finish * 0.26)),
    beat([-16, 6, 8], [-2, -1, -4], 6,
      'Basement retaining walls, then tanking and backfill. A pond test before backfilling is the third gate — waterproofing failure below ground is the one defect you cannot get back to.', Math.round(finish * 0.32)),
    beat([-18, 9, 12], [-1, 1, -4], 6,
      'The ground floor slab. From here the frame goes up floor by floor, and every pour is followed by a curing lag written into the network — which is why the site sometimes stands still on this timeline.', Math.round(finish * 0.37)),
    beat([-20, 11, 14], [-1, 3, -4], 6,
      'Columns, first floor slab, columns again. The reveal you can see sweeping across each slab is the pour sequence: the model is showing the package earning value, not an animation.', Math.round(finish * 0.46)),
    beat([-22, 13, 16], [-1, 5, -4], 6,
      'Topped out. The roof slab is cast and the structure is complete — milestone three of seven, and the point at which the design is frozen and later changes are priced as variations.', Math.round(finish * 0.55)),
    beat([-17, 7, 12], [-2, 3, -3], 6.5,
      'Masonry. Ground floor first, first floor overlapping it by six days on a finish-to-start with a negative lag. The masons on the wall line are the masonry pool the resource model is charging for that day; the crane is lifting their brick from the stockpile on a twenty-seven second cycle. The house is bare brick here — the cladding and the plaster are different packages and have not been paid for yet.', Math.round(finish * 0.62)),
    beat([-14, 6, 12], [-2, 4, -2], 6.5,
      'Façade. Sandstone cladding dry-fixed on stainless anchors, the portico order set, the parapet and the cupola built — forty working days, the longest single activity on the project. The scaffold went up with the masonry and comes down from the ground as the cladding finishes, because you cannot clad a wall you have already struck the scaffold off.', Math.round(finish * 0.70)),
    beat([0, 1.75, 1.6], [0, 2.4, -3], 6,
      'Inside, the services rough-in is buried and the plaster has gone on. From this day the interior stops being a shell and starts being rooms.', Math.round(finish * 0.80)),
    beat([0, 1.75, 1.9], [0, 4.0, -1.4], 6.5,
      'Marble, joinery, paint. The finishing trades run in a strict order and each one can only start when the one before it has cleared the room — which is why the last twenty per cent of a house takes a third of the programme.', Math.round(finish * 0.90)),
    beat([-16, 8, 18], [0, 3, -2], 7,
      `Practical completion on day ${finish}, ${formatDay(finish)} — ${finish - project.baseFinish} days later than the baseline. The dashboard will tell you exactly which activities spent those days.`, finish),
  ];

  const SCRIPTS = { house: { beats: HOUSE, name: 'The finished house' }, construction: { beats: CONSTRUCTION, name: 'The construction story' } };

  let running = null;
  let restoreDay = null;

  function setCaption(index) {
    const script = SCRIPTS[running];
    if (!script) return;
    const b = script.beats[index];
    if (!b) return;
    fill(captionEl, [
      el('b', { text: `${index + 1} / ${script.beats.length}  ` }),
      b.caption,
    ]);
    if (b.day !== undefined && b.day !== null) api.setDay(b.day);
  }

  function start(which) {
    const script = SCRIPTS[which];
    if (!script) return false;
    if (restoreDay === null) restoreDay = api.day;
    running = which;
    controls.setMode('cinematic');
    api.app.mode = 'cinematic';
    controls.setCinematic({
      beats: script.beats,
      onBeat: (index) => setCaption(index),
      onEnd: () => stop(true),
    });
    setCaption(0);
    tourEl.hidden = false;
    hud.setCrosshairVisible(false);
    hud.setMode('tour');
    byId('tourPlay').textContent = '❚❚';
    return true;
  }

  function stop(finished) {
    if (!running) return;
    running = null;
    tourEl.hidden = true;
    hud.setCrosshairVisible(true);
    if (restoreDay !== null) {
      api.setDay(restoreDay);
      restoreDay = null;
    }
    if (finished && onEnd) onEnd();
    else if (onEnd) onEnd();
  }

  byId('tourPrev').addEventListener('click', () => {
    controls.seekCinematicBeat(controls.cinematicBeat - 1);
  });
  byId('tourNext').addEventListener('click', () => {
    controls.seekCinematicBeat(controls.cinematicBeat + 1);
  });
  byId('tourPlay').addEventListener('click', () => {
    const next = !controls.cinematicPlaying;
    controls.setCinematicPlaying(next);
    byId('tourPlay').textContent = next ? '❚❚' : '▶';
  });
  byId('tourExit').addEventListener('click', () => stop(false));

  return {
    start,
    stop,
    get running() { return !!running; },
    get which() { return running; },
    names: Object.keys(SCRIPTS).map((k) => ({ id: k, name: SCRIPTS[k].name })),
    update() {
      if (!running) return;
      fillEl.style.width = `${controls.cinematicProgress * 100}%`;
    },
  };
}
