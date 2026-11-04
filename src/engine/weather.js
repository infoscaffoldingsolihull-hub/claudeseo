/** STUB (A3 replaces): weather state holder. */
export class WeatherSystem {
  constructor(scene, sky, quality) { this.scene = scene; this.sky = sky; this.quality = quality; this.state = { kind: 'clear', intensity: 0, visibility: 1, wetness: 0 }; }
  set(kind, intensity = 1) { this.state.kind = kind; this.state.intensity = intensity; }
  update() {}
  dispose() {}
}
