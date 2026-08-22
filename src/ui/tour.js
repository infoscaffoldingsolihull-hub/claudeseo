import * as THREE from 'three';
import { PYRAMIDS, SPHINX, QUARRY, VILLAGE, HARBOUR } from '../world/layout.js';

/**
 * Tour Guide mode — the presentation layer.
 *
 * A scripted sequence of camera beats with narration, each one also setting the
 * time of day and the construction state so the story of the project is told
 * in the right order: survey, supply, core, chambers, casing, handover. Driven
 * with the arrow keys so it can be run from a lectern, and it will also advance
 * itself if left alone.
 */

function v(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

export function buildTourScript() {
  const k = PYRAMIDS.khufu;
  return [
    {
      id: 'dawn',
      title: 'Akhet Khufu — Khufu’s Horizon',
      text:
        'The Giza plateau at first light, in the fourth year of the reign of Khufu. Over the next twenty years, ' +
        'some twenty thousand people will move 2.3 million blocks of stone into a shape accurate to a few ' +
        'centimetres in 230 metres, and align it on true north to within a twentieth of a degree.',
      pm: 'This is a project: temporary, unique, resource-constrained, with a sponsor whose lifespan is the deadline.',
      hour: 5.9,
      progress: 0.0,
      camera: { position: v(760, 210, -640), lookAt: v(-60, 60, 240) },
      duration: 11,
      arc: 40,
    },
    {
      id: 'site',
      title: 'The Site',
      text:
        'Three pyramids, nine subsidiary pyramids, two mortuary temples, two valley temples, two causeways, ' +
        'five boat pits, a quarry, a harbour and a town for the workforce. Only one of them is the project: the ' +
        'others are the context it is delivered into.',
      pm: 'Scope definition begins by drawing the boundary — what is in, and what is merely nearby.',
      hour: 7.4,
      progress: 0.06,
      camera: { position: v(520, 320, 620), lookAt: v(-180, 40, 380) },
      duration: 10,
      arc: 30,
    },
    {
      id: 'survey',
      title: '1.0 Site Preparation & Survey',
      text:
        'Before a single block is laid, the surveyors set out a square 230.33 metres on a side, level to within ' +
        '2.1 centimetres across five hectares, and oriented to true north by observing circumpolar stars. The ' +
        'error in the final orientation is three minutes and six seconds of arc.',
      pm: 'Quality gate: orientation ≤ 0.12°, base level ≤ 4 cm. Nothing downstream can correct an error made here.',
      hour: 8.6,
      progress: 0.02,
      camera: { position: v(k.x + 210, 46, k.z - 205), lookAt: v(k.x, 6, k.z) },
      duration: 10,
    },
    {
      id: 'quarry',
      title: '2.1 Quarry Development — the constraint',
      text:
        'Ninety per cent of the core stone comes from this horseshoe quarry three hundred metres from the ' +
        'pyramid. Gangs cut separation channels with copper chisels and dolerite pounders, then split each block ' +
        'free with wooden wedges swollen with water.',
      pm: 'The quarry is the schedule. Every day the stockpile falls below twelve days of cover, placement slows.',
      hour: 9.8,
      progress: 0.14,
      camera: { position: v(QUARRY.x - 190, 42, QUARRY.z - 190), lookAt: v(QUARRY.x, -8, QUARRY.z + 20) },
      duration: 10,
      arc: 14,
    },
    {
      id: 'harbour',
      title: '3.1 Harbour & the Inundation Window',
      text:
        'Aswan granite travels nine hundred kilometres downstream; Tura casing limestone crosses from the east ' +
        'bank. Both can only move during Akhet, when the flood lifts the barges to the delivery canal — about a ' +
        'hundred and twenty days a year.',
      pm: 'An external constraint no amount of money can compress. Everything else in the plan bends around it.',
      hour: 11.2,
      progress: 0.22,
      camera: { position: v(HARBOUR.x - 340, 70, HARBOUR.z - 300), lookAt: v(HARBOUR.x + 60, -26, HARBOUR.z) },
      duration: 10,
      arc: 20,
    },
    {
      id: 'village',
      title: '4.0 Workforce & Settlement',
      text:
        'Heit el-Ghurab: dormitory galleries for sixteen hundred rotating workers, bakeries, breweries, a ' +
        'fish-processing yard, and cattle driven in from the Delta. The skeletal record shows set bones and healed ' +
        'fractures — these people were fed, housed, treated and paid.',
      pm: 'Resource management is not headcount. Adding workers to an under-provisioned site reduces output.',
      hour: 12.6,
      progress: 0.3,
      camera: { position: v(VILLAGE.x - 250, 78, VILLAGE.z - 230), lookAt: v(VILLAGE.x, 6, VILLAGE.z) },
      duration: 10,
      arc: 18,
    },
    {
      id: 'ramp',
      title: '3.4 The Ramp & 5.0 Core Construction',
      text:
        'No ramp survives. This is the most economical reconstruction: a straight ramp on the south face for the ' +
        'lower third, then wrapping ramps hugging the faces, because a straight ramp to the apex would need more ' +
        'material than the pyramid itself.',
      pm: 'Ramp capacity caps placement at roughly 340 blocks a day. It is a hard throughput constraint on 5.2–5.5.',
      hour: 14.1,
      progress: 0.44,
      camera: { position: v(k.x + 40, 96, k.z + 400), lookAt: v(k.x, 62, k.z + 40) },
      duration: 11,
      arc: 24,
    },
    {
      id: 'working-course',
      title: 'The Working Course',
      text:
        'Masons bed each block on a thin film of gypsum mortar — used as a lubricant to slide the block into ' +
        'place, not as an adhesive. At this height the gangs are placing perhaps two hundred blocks a day, and ' +
        'every one has to be lifted higher than the last.',
      pm: 'Productivity falls with height even at constant staffing. The estimate for 5.4 is longer than 5.2 for half the volume.',
      hour: 15.4,
      progress: 0.52,
      camera: { position: v(k.x - 130, 108, k.z - 120), lookAt: v(k.x, 76, k.z) },
      duration: 9,
    },
    {
      id: 'entrance',
      title: '6.1 The Descending Passage',
      text:
        'The original entrance, sixteen point nine metres above the base and seven point three metres east of the ' +
        'axis. Behind it a passage one metre wide and one metre twenty high runs a hundred and five metres down ' +
        'at twenty-six and a half degrees, straight to within six millimetres.',
      pm: 'Work package 6.1. Predecessor to every internal package, and it cannot be reworked.',
      hour: 12,
      progress: 0.52,
      interior: 'descending',
      camera: null,
      duration: 9,
    },
    {
      id: 'gallery',
      title: '6.4 The Grand Gallery',
      text:
        'Forty-six point seven metres long, eight point seven metres high, its walls stepping inward in seven ' +
        'corbelled courses. It almost certainly housed the counterweight system that hauled the granite plugs into ' +
        'position after the burial.',
      pm: 'The highest-risk package in the register. Once it is roofed, no rework is possible at any price.',
      hour: 12,
      interior: 'grandGallery',
      camera: null,
      duration: 10,
    },
    {
      id: 'kings',
      title: '6.5 The King’s Chamber',
      text:
        'Red granite from Aswan, roofed with nine beams weighing up to seventy tonnes, lifted forty-three metres. ' +
        'Above them, five relieving chambers spread the load of sixty metres of masonry. On their walls are the ' +
        'painted gang names — “Friends of Khufu”, “Drunkards of Menkaure”.',
      pm: 'The critical path runs straight through this chamber. Every day lost here is a day lost on the project.',
      hour: 12,
      interior: 'kingsChamber',
      camera: null,
      duration: 11,
    },
    {
      id: 'casing',
      title: '7.0 Exterior Finish',
      text:
        'Twenty-one acres of fine white Tura limestone, dressed to a mean joint of half a millimetre and laid from ' +
        'the apex downward as the ramps are dismantled behind it. For four thousand years it was the brightest ' +
        'object in Egypt.',
      pm: 'Quality gate: mean joint ≤ 1.6 mm. The finishing trade is the last thing on the critical path.',
      hour: 17.6,
      progress: 1.0,
      casing: 0.62,
      camera: { position: v(k.x + 330, 150, k.z - 330), lookAt: v(k.x, 84, k.z) },
      duration: 11,
      arc: 26,
    },
    {
      id: 'sphinx',
      title: '8.2 The Complex',
      text:
        'Hor-em-akhet — Horus in the Horizon. Seventy-three metres long, carved in place from a knoll of limestone ' +
        'left standing in the quarry, facing due east toward the equinox sunrise.',
      pm: 'Turning quarry spoil into scope value. The Sphinx exists because a knoll of poor stone was in the way.',
      hour: 18.4,
      progress: 1.0,
      casing: 0.86,
      camera: { position: v(SPHINX.x + 190, 42, SPHINX.z - 40), lookAt: v(SPHINX.x - 10, 8, SPHINX.z) },
      duration: 10,
      arc: 12,
    },
    {
      id: 'handover',
      title: 'Handover',
      text:
        'Akhet Khufu, complete: 146.6 metres, the tallest structure built by human beings for the next 3 800 ' +
        'years, and the only one of the seven wonders of the ancient world still standing.',
      pm: 'Closeout: seal the chambers, dismantle the ramps, close the accounts, hand over to the mortuary priesthood.',
      hour: 19.6,
      progress: 1.0,
      casing: 1.0,
      camera: { position: v(k.x + 520, 240, k.z + 480), lookAt: v(k.x - 120, 90, k.z + 120) },
      duration: 12,
      arc: 34,
    },
    {
      id: 'night',
      title: 'The Horizon of Khufu',
      text:
        'A project delivered inside the sponsor’s lifetime, to a quality tolerance that would satisfy a modern ' +
        'machine shop, by an organisation that had no word for “project management” and did every part of it anyway.',
      pm: 'Scope · Schedule · Cost · Quality · Risk · Resource · Procurement · Stakeholder · Communication. All of it, in 2560 BCE.',
      hour: 21.4,
      progress: 1.0,
      casing: 1.0,
      camera: { position: v(k.x - 420, 190, k.z + 520), lookAt: v(k.x, 100, k.z) },
      duration: 13,
      arc: 24,
    },
  ];
}

export class TourDirector {
  constructor(sim) {
    this.sim = sim;
    this.script = buildTourScript();
    this.index = -1;
    this.running = false;
    this.beatTime = 0;
    this.autoAdvance = true;
  }

  start(index = 0) {
    this.running = true;
    this.sim.hud.setCinematic(true);
    this.index = index - 1;
    this.next();
  }

  stop() {
    this.running = false;
    this.sim.hud.setCinematic(false);
    this.sim.cinematic.stop();
  }

  next() {
    if (!this.running) return;
    this.index++;
    if (this.index >= this.script.length) {
      this.index = this.script.length - 1;
      return;
    }
    this._applyBeat(this.script[this.index]);
  }

  previous() {
    if (!this.running || this.index <= 0) return;
    this.index -= 2;
    this.next();
  }

  goTo(index) {
    this.index = index - 1;
    this.next();
  }

  _applyBeat(beat) {
    const sim = this.sim;
    this.beatTime = 0;
    sim.world.sky.setHour(beat.hour);

    if (beat.progress !== undefined || beat.casing !== undefined) {
      sim.previewProject({
        coreProgress: beat.progress === undefined ? sim.world.pyramids.khufu.progress : beat.progress,
        casingProgress: beat.casing === undefined ? 0 : beat.casing,
        workforceRatio: beat.progress !== undefined && beat.progress < 1 ? 1 : 0.25,
        stoneRatio: 0.7,
      });
    }

    const wantInterior = !!beat.interior;
    if (wantInterior !== sim.world.inInterior) sim.toggleInterior(true);

    if (wantInterior) {
      const vp = sim.world.interior.viewpoints[beat.interior];
      if (vp) {
        const from = vp.position.clone().add(new THREE.Vector3(0, 1.7, 0));
        const dir = new THREE.Vector3(-Math.sin(vp.yaw), -0.06, -Math.cos(vp.yaw));
        sim.engine.camera.position.copy(from).addScaledVector(dir, -2.2);
        sim.cinematic.play(
          [{ position: from.clone().addScaledVector(dir, 2.6), lookAt: from.clone().addScaledVector(dir, 12), duration: beat.duration, ease: 'inOut' }],
          { startPosition: sim.engine.camera.position.clone(), startLook: from.clone().addScaledVector(dir, 12) }
        );
      }
    } else if (beat.camera) {
      const start = sim.engine.camera.position.clone();
      sim.cinematic.play(
        [{
          position: beat.camera.position.clone(),
          lookAt: beat.camera.lookAt.clone(),
          duration: beat.duration,
          arc: beat.arc || 0,
          ease: 'inOut',
        }],
        { startPosition: start, startLook: beat.camera.lookAt.clone() }
      );
    }

    sim.hud.showNarration(beat.title, beat.text, beat.pm);
    sim.hud.setTourProgress(this.index, this.script.length);
  }

  update(dt) {
    if (!this.running) return;
    this.beatTime += dt;
    const beat = this.script[this.index];
    if (!beat) return;
    if (this.autoAdvance && this.beatTime > beat.duration + 2.5 && this.index < this.script.length - 1) {
      this.next();
    }
  }
}
