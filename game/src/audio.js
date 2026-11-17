// Synthesized sound only: every effect and the music loop are built from
// WebAudio oscillators and filtered noise, so the game ships zero audio files
// and makes zero network requests.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._musicTimer = null;
    this._engineOsc = null;
    this._engineGain = null;
    this._step = 0;
  }

  // Must be called from a user gesture at least once (browser autoplay rule).
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this._startEngineHum();
      this.startMusic();
    } catch { this.ctx = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.ctx.suspend();
    if (!m && this.ctx) this.ctx.resume();
  }

  _tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol || 0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = filterFreq || 1200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(t);
  }

  shoot() { this._noise(0.14, 0.35, 2600); this._tone(180, 0.08, 'square', 0.12, 60); }
  punch() { this._noise(0.09, 0.25, 500); }
  hit() { this._tone(220, 0.12, 'sawtooth', 0.12, 110); }
  pickup() { this._tone(660, 0.09, 'sine', 0.16); setTimeout(() => this._tone(990, 0.14, 'sine', 0.16), 80); }
  cash() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.16, 'triangle', 0.16), i * 90)); }
  missionComplete() { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'triangle', 0.18), i * 110)); }
  missionStart() { this._tone(330, 0.15, 'triangle', 0.15); setTimeout(() => this._tone(440, 0.2, 'triangle', 0.15), 130); }
  sirenBlip() { this._tone(880, 0.3, 'sine', 0.07, 660); }
  carDoor() { this._noise(0.08, 0.18, 800); }
  engineStart() { this._tone(70, 0.5, 'sawtooth', 0.1, 140); }
  jump() { this._tone(300, 0.16, 'sine', 0.1, 520); }
  wasted() { [330, 262, 196, 131].forEach((f, i) => setTimeout(() => this._tone(f, 0.35, 'sawtooth', 0.12), i * 220)); }

  _startEngineHum() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 55;
    gain.gain.value = 0.0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 320;
    osc.connect(filter).connect(gain).connect(this.ctx.destination);
    osc.start();
    this._engineOsc = osc; this._engineGain = gain;
  }

  setEngine(speed01, driving) {
    if (!this._engineOsc || !this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this._engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.08);
    this._engineGain.gain.setTargetAtTime(driving ? 0.035 + speed01 * 0.05 : 0.0, t, 0.1);
  }

  // A lazy synthwave loop: a bass line, a pad chord and a hat tick, scheduled
  // on a 140 BPM eighth-note grid. No samples, no files.
  startMusic() {
    if (this._musicTimer || !this.ctx) return;
    const bass = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42]; // A1 A1 C2 G1 ...
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [146.8, 220, 293.7]];
    this._musicTimer = setInterval(() => {
      if (this.muted || this.ctx.state !== 'running') return;
      const i = this._step % 8;
      const bar = Math.floor(this._step / 8) % 4;
      this._tone(bass[i], 0.28, 'triangle', 0.11);
      if (i === 0) chords[bar].forEach((f) => this._tone(f, 1.6, 'sine', 0.035));
      if (i % 2 === 0) this._noise(0.03, 0.05, 6000);
      this._step += 1;
    }, 214); // ~140 BPM eighth notes
  }
}
