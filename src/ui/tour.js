import { MASTERPLAN, RUNWAY } from '../world/layout.js';
import { fact, hasFact } from '../core/facts.js';

/**
 * Guided Tour — the conference / lecture-theatre presentation layer.
 *
 * Twenty narrated beats walk the Hyderabad Airport Revival & Expansion Programme
 * through its whole lifecycle, Initiating → Closing. Each beat sets the camera
 * (keyframes for the benchmark CinematicPlayer), the hour, the weather and a
 * construction-progress preview (`project.previewState(p)`), then shows the
 * caption and the PM lesson. Arrow keys step (main.js), beats auto-advance, and
 * narration is spoken when Settings → audio.narration is on.
 *
 * Real-world facts come from facts.json via fact(); everything else (the
 * masterplan, the timeline, the events) is a SIMULATED scenario and says so.
 *
 * No THREE import: CinematicPlayer only reads `.x/.y/.z` of keyframe vectors,
 * so plain objects work and this module stays importable under node for tests.
 */

const f = (key, fallback) => (hasFact(key) ? fact(key) : fallback);
const T = MASTERPLAN.tower;
const TERM = MASTERPLAN.terminal;
const SOLAR = MASTERPLAN.solar;
const OUT = MASTERPLAN.drainageOutfall;
const ENC = MASTERPLAN.encroachments[0];
const EXT_MID = (RUNWAY.extensionStartZ + RUNWAY.extensionEndZ) / 2;

export const TOUR_BEATS = [
  {
    id: 'dawn-gateway',
    title: 'A gateway waiting — Hyderabad, Sindh',
    text: `${f('airport.name', 'Hyderabad Airport')} (${f('airport.iata', 'HDD')} / ${f('airport.icao', 'OPKD')}) serves ${f('airport.city', 'Hyderabad, Sindh, Pakistan')}. Its runway ${f('runway.designators', '02/20')} is ${f('runway.length', '2,133 m')} long and ${f('runway.width', '30 m')} wide. ${f('history.lastFlight2013', 'Commercial flights ended in 2013')}. This simulator imagines its revival.`,
    lesson: 'A project is a temporary endeavour undertaken to create a unique product, service or result. Operations keep the airport running; the project changes it.',
    clo: ['CLO1'], phase: 'initiating', week: 1,
    camera: { position: [1500, 520, 2600], target: [-120, 0, 300] },
    hour: 6.1, weather: 'haze', intensity: 0.35, progress: 0, duration: 13,
  },
  {
    id: 'business-case',
    title: 'The business case and the charter',
    text: `${f('revival.proposal', 'A proposed revival would extend the runway and improve passenger facilities')}. In our simulated programme the sponsor signs a charter for a Code E runway of about 3,500 m, a new terminal, a control tower and landside works — gate G0.`,
    lesson: 'The charter formally authorises the project and the project manager. The business case justifies it; the benefits management plan says how value will be measured.',
    clo: ['CLO1'], phase: 'initiating', week: 1,
    camera: { position: [-260, 90, 420], target: [(TERM.x0 + TERM.x1) / 2, 8, 0] },
    hour: 8.2, weather: 'clear', intensity: 0, progress: 0, duration: 12,
  },
  {
    id: 'encroachment',
    title: 'Land, encroachment and the people who live there',
    text: `${f('constraints.encroachment', 'Land encroachment is reported as a constraint')}. Simulated scenario: informal settlements sit inside the planned perimeter south of the runway. Every option — negotiate, resettle, re-sequence — has a stakeholder cost.`,
    lesson: 'Stakeholders are identified at the start, analysed by power, interest and urgency, and engaged continuously. Enterprise environmental factors are constraints you plan around.',
    clo: ['CLO3'], phase: 'initiating', week: 12,
    camera: { position: [ENC.x + 420, 160, ENC.z + 380], target: [ENC.x, 0, ENC.z] },
    hour: 9.4, weather: 'haze', intensity: 0.5, progress: 0.01, duration: 12,
  },
  {
    id: 'wbs-scope',
    title: 'Planning: twelve work packages',
    text: 'The simulated WBS breaks the programme into 12 summary packages — from 1 PM & Initiation to 12 Handover & Closure — and more than seventy work packages, each with a dictionary entry, an owner and acceptance criteria.',
    lesson: 'Scope baseline = scope statement + WBS + WBS dictionary. The 100 % rule: the WBS contains all of the work, and only the work.',
    clo: ['CLO1', 'CLO2'], phase: 'planning', week: 4,
    camera: { position: [-200, 2600, 900], target: [-120, 0, 500] },
    hour: 10.5, weather: 'clear', intensity: 0, progress: 0.02, duration: 12,
  },
  {
    id: 'critical-path',
    title: 'The critical path runs south',
    text: `The runway extension is built southward beyond the RWY 02 threshold, adding about ${RUNWAY.extensionEndZ - RUNWAY.extensionStartZ} m of pavement (simulated masterplan). Earthworks, sub-base, base and surface follow one another: this chain is the critical path.`,
    lesson: 'CPM: forward pass gives early dates, backward pass late dates; total float = LS − ES. PERT expected duration = (O + 4M + P) ÷ 6.',
    clo: ['CLO2'], phase: 'planning', week: 5,
    camera: { position: [700, 340, EXT_MID + 900], target: [0, 0, EXT_MID - 200] },
    hour: 11.2, weather: 'clear', intensity: 0, progress: 0.05, duration: 12,
  },
  {
    id: 'hybrid-approach',
    title: 'Predictive concrete, Agile software',
    text: 'Pavements, steel and AGL follow a predictive plan with stage gates. Terminal IT — flight information, common-use check-in, baggage reconciliation — is delivered by a Scrum team in two-week sprints. The programme is hybrid.',
    lesson: 'Choose the delivery approach per deliverable: high requirement certainty and costly change favour predictive; uncertainty and early feedback favour adaptive.',
    clo: ['CLO1'], phase: 'planning', week: 3,
    camera: { position: [-330, 60, -260], target: [(TERM.x0 + TERM.x1) / 2, 10, 0] },
    hour: 12, weather: 'clear', intensity: 0, progress: 0.1, duration: 11,
  },
  {
    id: 'earthworks',
    title: 'Executing: earthworks and earned value',
    text: 'Site establishment, haul roads and a batch plant appear. Dozers and rollers work the extension subgrade. Every week the dashboard compares planned value, earned value and actual cost.',
    lesson: 'SPI = EV ÷ PV and CPI = EV ÷ AC. Below 1.0 means behind schedule or over budget. EAC = BAC ÷ CPI when current performance continues.',
    clo: ['CLO2'], phase: 'executing', week: 9,
    camera: { position: [520, 180, EXT_MID + 520], target: [0, 0, EXT_MID] },
    hour: 9.8, weather: 'haze', intensity: 0.4, progress: 0.2, duration: 12,
  },
  {
    id: 'dust-storm',
    title: 'Dust storm on paving day',
    text: 'Simulated event: a dust storm arrives just as the paver starts the surface course. Halt, pave behind windbreaks, or press on? Each choice trades schedule for quality.',
    lesson: 'Quality is planned in: hold points, inspection and test plans, and weather limits in the method statement. Cost of quality: prevention is cheaper than failure.',
    clo: ['CLO2'], phase: 'executing', week: 7,
    camera: { position: [260, 70, EXT_MID + 260], target: [0, 2, EXT_MID - 60] },
    hour: 15.5, weather: 'dust', intensity: 0.9, progress: 0.36, duration: 12,
  },
  {
    id: 'heat-wave',
    title: 'Forty-five degrees in May',
    text: `${f('airport.climate', 'A hot desert climate')} means summer afternoons above 45 °C (simulated scenario intensity). Heavy work moves to night shifts; water, shade and rest cycles protect the crews.`,
    lesson: 'Resource management includes welfare. Physical and team resources have calendars and limits; overloading people reduces productivity and raises risk.',
    clo: ['CLO3'], phase: 'executing', week: 12,
    camera: { position: [-120, 120, 640], target: [-350, 0, 120] },
    hour: 14.2, weather: 'heat', intensity: 0.85, progress: 0.42, duration: 11,
  },
  {
    id: 'quality-control',
    title: 'Concrete cubes and control charts',
    text: 'The apron slab is poured bay by bay. Cubes are crushed at 7 and 28 days; friction and roughness are measured on the runway. Results plot on control charts in the Quality panel.',
    lesson: 'Control quality verifies deliverables; manage quality improves the process. A point beyond 3σ or seven on one side of the mean signals a special cause.',
    clo: ['CLO2'], phase: 'monitoring', week: 7,
    camera: { position: [-200, 55, 260], target: [-350, 0, 40] },
    hour: 10.4, weather: 'clear', intensity: 0, progress: 0.5, duration: 11,
  },
  {
    id: 'monsoon',
    title: 'Monsoon: the flash flood',
    text: 'Simulated event: a July cloudburst ponds water across the subgrade. The storm drainage (8.7) and its outfall decide whether this is a two-day nuisance or a three-week setback.',
    lesson: 'Risk responses for threats: avoid, transfer, mitigate, accept, escalate. EMV = probability × impact; contingency reserve covers identified risks.',
    clo: ['CLO2'], phase: 'executing', week: 10,
    camera: { position: [OUT.x + 360, 120, OUT.z + 300], target: [OUT.x - 120, 0, OUT.z - 120] },
    hour: 16.8, weather: 'rain', intensity: 0.95, progress: 0.55, duration: 12,
  },
  {
    id: 'terminal-steel',
    title: 'Steel, roof and the rupee',
    text: 'The terminal frame rises with its windcatcher roof forms. Imported steel is priced in dollars: in the simulation a PKR devaluation hits the import bill, and procurement must choose between reserves, hedging and substitution.',
    lesson: 'Procurement: make-or-buy, contract types (FFP, FPIF, CPFF, T&M) and weighted bid evaluation. Contract type decides who carries the price risk.',
    clo: ['CLO3'], phase: 'executing', week: 11,
    camera: { position: [TERM.x1 + 260, 120, TERM.z1 + 220], target: [(TERM.x0 + TERM.x1) / 2, 14, 0] },
    hour: 13.2, weather: 'clear', intensity: 0, progress: 0.64, duration: 12,
  },
  {
    id: 'scrum-war-room',
    title: 'The Scrum war-room',
    text: 'Inside the half-fitted terminal, the IT team stands at its board: product backlog, sprint backlog, burndown. The Product Owner orders the backlog; the developers own the sprint plan.',
    lesson: 'Scrum: three accountabilities, five events, three artefacts. Velocity forecasts; WIP limits (Kanban) keep flow. AI tools can draft backlog items — humans decide.',
    clo: ['CLO1'], phase: 'executing', week: 3,
    camera: { position: [TERM.x1 - 14, 7, 40], target: [TERM.x0 + 20, 5, -10] },
    hour: 11, weather: 'clear', intensity: 0, progress: 0.7, duration: 11,
  },
  {
    id: 'change-control',
    title: 'An airline asks for Code E',
    text: 'Simulated event: a fictional carrier offers to base wide-bodies if two stands are upgraded. Attractive — and a change. It goes to the change control board with an impact analysis.',
    lesson: 'Integrated change control: log, analyse impact on all baselines, decide at the CCB, update plans, communicate. Unapproved change is scope creep.',
    clo: ['CLO2'], phase: 'monitoring', week: 6,
    camera: { position: [-130, 140, -420], target: [-350, 0, -60] },
    hour: 15, weather: 'clear', intensity: 0, progress: 0.74, duration: 11,
  },
  {
    id: 'control-view',
    title: 'Control view from the tower cab',
    text: 'From the new control-tower cab, about forty metres up, the whole airfield reads like a dashboard: both thresholds, the apron, the extension and the solar field. This is the view the project manager needs every day.',
    lesson: 'Monitoring and controlling: measure performance against the baselines, forecast (EAC, Monte Carlo P80), and act early. A dashboard is only useful if it drives decisions.',
    clo: ['CLO2'], phase: 'monitoring', week: 6,
    camera: { position: [T.x + 2, T.cabFloor + 4.5, T.z + 2], target: [0, 0, 400] },
    tower: true,
    hour: 17.2, weather: 'clear', intensity: 0, progress: 0.84, duration: 12,
  },
  {
    id: 'night-agl',
    title: 'Night commissioning of the lights',
    text: 'After dark the airfield ground lighting is tested circuit by circuit: runway edge and centreline, approach lights with their sequenced flashers, PAPI and taxiway lights. The city glows beyond the perimeter.',
    lesson: 'Testing and commissioning verify requirements; the requirements traceability matrix links each requirement to its test and acceptance.',
    clo: ['CLO2'], phase: 'executing', week: 7,
    camera: { position: [260, 90, RUNWAY.threshold02Z + 1400], target: [0, 0, 0] },
    hour: 21.3, weather: 'clear', intensity: 0, progress: 0.9, duration: 12,
  },
  {
    id: 'certification',
    title: 'ORAT and aerodrome certification',
    text: `Volunteers walk through trial check-in and security; mock flights turn on the apron. In the simulation the regulator — ${f('org.regulator', 'the civil aviation regulator')} — audits the aerodrome manual and inspects the airfield before certification.`,
    lesson: 'Validate scope is formal acceptance of deliverables by the customer; control quality checks correctness first. Operational readiness proves outcomes, not just outputs.',
    clo: ['CLO1', 'CLO2'], phase: 'monitoring', week: 7,
    camera: { position: [-160, 70, 260], target: [TERM.x1, 8, 40] },
    hour: 7.2, weather: 'fog', intensity: 0.45, progress: 0.96, duration: 11,
  },
  {
    id: 'handover',
    title: 'Handover to operations',
    text: `Transition (WBS 12.2): documents, warranties, spares and trained staff pass to the operator — in reality ${f('org.operator', 'the airport operator')}. Jet bridges meet their first aircraft (fictional liveries).`,
    lesson: 'Closing a phase: confirm acceptance, transfer the product, close procurements, release resources. Transition is planned from day one, not improvised at the end.',
    clo: ['CLO3'], phase: 'closing', week: 15,
    camera: { position: [-200, 60, 260], target: [-400, 4, 0] },
    hour: 16.4, weather: 'clear', intensity: 0, progress: 1, duration: 11,
  },
  {
    id: 'benefits',
    title: 'Operations and benefits realised',
    text: `Simulated operations: arrivals on 02 or 20 by the wind, turnarounds on the apron, the ${SOLAR.rows}-row solar field feeding the terminal. ${f('revival.uses', 'Diversions and regional flights')}. The business case is now measured in movements, passengers and on-time performance.`,
    lesson: 'Benefits realisation continues after the project closes. Measure outcomes against the business-case targets and feed the results to the portfolio.',
    clo: ['CLO1', 'CLO3'], phase: 'closing', week: 15,
    camera: { position: [1100, 380, -900], target: [-200, 0, 200] },
    ops: true,
    hour: 18.4, weather: 'clear', intensity: 0, progress: 1, duration: 12,
  },
  {
    id: 'lessons',
    title: 'Lessons learned — and the next gateway',
    text: 'The project closes; the knowledge stays. Lessons from encroachment, monsoon, heat, procurement and Agile IT go into the organisation’s process assets for the next airport. Your scorecard maps the journey to the three course learning outcomes.',
    lesson: 'Close the project: final report, lessons learned into OPAs, archive records, celebrate the team. Principles, performance domains and focus areas — all of them, in one airport.',
    clo: ['CLO1', 'CLO2', 'CLO3'], phase: 'closing', week: 15,
    camera: { position: [-1700, 600, 1700], target: [-120, 0, 300] },
    hour: 19.4, weather: 'clear', intensity: 0, progress: 1, duration: 14,
  },
];

const vec = (a) => ({ x: a[0], y: a[1], z: a[2] });

function speechAvailable() {
  return typeof window !== 'undefined' && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function';
}

export class TourDirector {
  constructor(sim) {
    this.sim = sim;
    this.beats = TOUR_BEATS;
    this.script = this.beats;
    this.index = -1;
    this.running = false;
    this.beatTime = 0;
    this.autoAdvance = true;
    this.paused = false;
    this._saved = null;
    this._speaking = false;
  }

  get current() {
    return this.beats[this.index] || null;
  }

  start(index = 0) {
    const sim = this.sim;
    if (!this.running) {
      const sky = sim.world && sim.world.sky;
      const w = sim.world && sim.world.weather && sim.world.weather.state;
      this._saved = { hour: sky ? sky.hour : null, weather: w ? { kind: w.kind, intensity: w.intensity } : null };
    }
    this.running = true;
    this.paused = false;
    this._hud('setCinematic', true);
    this.goTo(index);
  }

  stop() {
    if (!this.running) return;
    const sim = this.sim;
    this.running = false;
    this._cancelSpeech();
    this._hud('setCinematic', false);
    this._hud('hideNarration');
    if (sim.cinematic) sim.cinematic.stop();
    const saved = this._saved;
    this._saved = null;
    try {
      if (saved && saved.hour !== null && sim.world && sim.world.sky) sim.world.sky.setHour(saved.hour);
      const pw = sim.project && sim.project.weather;
      if (sim.world && sim.world.weather) {
        if (pw && pw.kind) sim.world.weather.set(pw.kind, pw.intensity || 0);
        else if (saved && saved.weather) sim.world.weather.set(saved.weather.kind, saved.weather.intensity);
      }
      if (typeof sim.syncWorld === 'function') sim.syncWorld(true);
    } catch (err) {
      /* world partially available: the next syncWorld restores it */
    }
  }

  next() {
    if (!this.running) return;
    if (this.index >= this.beats.length - 1) {
      this._toast('End of the tour — press ← to go back or 2 to return to Project Manager mode');
      return;
    }
    this.goTo(this.index + 1);
  }

  previous() {
    if (!this.running || this.index <= 0) return;
    this.goTo(this.index - 1);
  }

  goTo(index) {
    if (!this.running) {
      this.start(index);
      return;
    }
    const i = Math.max(0, Math.min(this.beats.length - 1, Number(index) || 0));
    this.index = i;
    this._apply(this.beats[i]);
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.sim.cinematic) this.sim.cinematic.paused = this.paused;
    return this.paused;
  }

  _hud(method, ...args) {
    const hud = this.sim.hud;
    if (hud && typeof hud[method] === 'function') {
      try { return hud[method](...args); } catch { return undefined; }
    }
    return undefined;
  }

  _toast(text) {
    if (typeof this.sim.toast === 'function') this.sim.toast(text);
  }

  _apply(beat) {
    const sim = this.sim;
    this.beatTime = 0;
    const world = sim.world || {};
    if (world.sky && typeof world.sky.setHour === 'function') world.sky.setHour(beat.hour);
    if (world.weather && typeof world.weather.set === 'function') world.weather.set(beat.weather || 'clear', beat.intensity || 0);

    const p = sim.project;
    if (beat.progress !== undefined && p && typeof p.previewState === 'function' && typeof sim.previewProject === 'function') {
      try { sim.previewProject(p.previewState(beat.progress)); } catch { /* engine not ready: keep the live state */ }
    }

    let pos = beat.camera.position;
    let target = beat.camera.target;
    if (beat.tower && world.towerCabView && world.towerCabView.position) {
      const v = world.towerCabView;
      pos = [v.position.x, v.position.y, v.position.z];
      if (v.target) target = [v.target.x, v.target.y, v.target.z];
    }
    this._fly(pos, target, beat);

    this._hud('showNarration', { title: beat.title, text: beat.text, lesson: beat.lesson, clo: beat.clo, phase: beat.phase, index: this.index, total: this.beats.length });
    this._hud('setTourProgress', this.index, this.beats.length);
    if (sim.bus) sim.bus.emit('tour:beat', { index: this.index, beat });
    this._speak(beat);
  }

  /** Two keyframes: a sweeping move into position, then a slow push-in while the caption reads. */
  _fly(posArr, targetArr, beat) {
    const sim = this.sim;
    const player = sim.cinematic;
    if (!player || typeof player.play !== 'function') return;
    const cam = sim.engine && sim.engine.camera;
    const pos = vec(posArr);
    const look = vec(targetArr);
    const d = beat.duration || 11;
    // Drift 6 % closer to the target (a gentle dolly); tower cab beats pan instead of dolly.
    const k = beat.tower ? 0 : 0.06;
    const drift = {
      x: pos.x + (look.x - pos.x) * k + (beat.tower ? 0 : 0),
      y: pos.y + (look.y - pos.y) * k,
      z: pos.z + (look.z - pos.z) * k,
    };
    const lookEnd = beat.tower ? { x: look.x - 300, y: look.y, z: look.z - 500 } : look;
    let startLook = look;
    if (cam && typeof cam.getWorldDirection === 'function' && cam.position && typeof cam.position.clone === 'function') {
      const dir = cam.getWorldDirection(cam.position.clone());
      startLook = { x: cam.position.x + dir.x * 200, y: cam.position.y + dir.y * 200, z: cam.position.z + dir.z * 200 };
    }
    const dist = cam && cam.position ? Math.hypot(cam.position.x - pos.x, cam.position.y - pos.y, cam.position.z - pos.z) : 0;
    const travel = Math.min(Math.max(3.5, d * 0.4), 3 + dist / 450);
    const arc = beat.tower ? 0 : Math.min(260, dist * 0.08);
    player.play(
      [
        { position: pos, lookAt: look, duration: travel, arc, ease: 'inOut' },
        { position: drift, lookAt: lookEnd, duration: Math.max(4, d - travel + 2.5), ease: 'inOut' },
      ],
      { startPosition: cam && cam.position && typeof cam.position.clone === 'function' ? cam.position.clone() : null, startLook },
    );
  }

  _narrationOn() {
    const s = this.sim.settings;
    return !!(s && typeof s.get === 'function' && s.get('audio.narration'));
  }

  _speak(beat) {
    this._cancelSpeech();
    if (!this._narrationOn() || !speechAvailable()) return;
    try {
      const u = new window.SpeechSynthesisUtterance(`${beat.title}. ${beat.text} ${beat.lesson}`);
      u.lang = 'en-GB';
      u.rate = 1;
      u.onend = () => { this._speaking = false; };
      u.onerror = () => { this._speaking = false; };
      this._speaking = true;
      window.speechSynthesis.speak(u);
    } catch {
      this._speaking = false;
    }
  }

  _cancelSpeech() {
    this._speaking = false;
    if (speechAvailable()) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }
  }

  update(dt = 0) {
    if (!this.running || this.paused) return;
    this.beatTime += dt;
    const beat = this.current;
    if (!beat) return;
    const minTime = beat.duration + 2.5;
    if (this.autoAdvance && this.beatTime > minTime && !this._speaking && this.index < this.beats.length - 1) this.next();
    // Never wait more than 3× the beat for a stuck speech engine.
    else if (this.autoAdvance && this.beatTime > minTime * 3 && this.index < this.beats.length - 1) this.next();
  }

  dispose() {
    this.stop();
  }
}
