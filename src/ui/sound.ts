// Звуки игры, синтезированные через Web Audio API (без звуковых файлов).

export type SoundName =
  | 'click'
  | 'dice'
  | 'step'
  | 'land'
  | 'coin'
  | 'pay'
  | 'buy'
  | 'card'
  | 'jail'
  | 'build'
  | 'turn'
  | 'double'
  | 'deal'
  | 'win'
  | 'lose';

type Wave = OscillatorType;

export class Sound {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private stepN = 0;

  /** Браузеры разрешают звук только после касания экрана. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, at: number, dur: number, wave: Wave = 'sine', vol = 0.25, slideTo?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(this.master!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private noise(at: number, dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', sweepTo?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  }

  private notes(freqs: number[], at: number, gap: number, dur: number, wave: Wave = 'triangle', vol = 0.18): void {
    freqs.forEach((f, i) => this.tone(f, at + i * gap, dur, wave, vol));
  }

  play(name: SoundName): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'click':
        this.tone(1100, t, 0.04, 'sine', 0.08);
        break;
      case 'dice':
        // Перестук кубиков: короткие щелчки шума разной высоты
        for (let i = 0; i < 7; i++) {
          const at = t + i * 0.06 + Math.random() * 0.02;
          this.noise(at, 0.035, 0.45, 1800 + Math.random() * 2200, 2.5);
          this.tone(260 + Math.random() * 160, at, 0.03, 'triangle', 0.06);
        }
        break;
      case 'step':
        this.stepN++;
        this.tone(this.stepN % 2 ? 640 : 720, t, 0.07, 'triangle', 0.12);
        this.noise(t, 0.03, 0.12, 900, 1, 'lowpass');
        break;
      case 'land':
        this.tone(420, t, 0.16, 'sine', 0.22, 260);
        break;
      case 'coin':
        this.tone(1318, t, 0.07, 'square', 0.05);
        this.tone(1976, t + 0.06, 0.28, 'square', 0.05);
        break;
      case 'pay':
        this.tone(560, t, 0.12, 'triangle', 0.18, 330);
        this.tone(400, t + 0.1, 0.2, 'triangle', 0.16, 220);
        break;
      case 'buy':
        this.notes([523, 659, 784, 1047], t, 0.075, 0.2, 'triangle', 0.17);
        this.tone(1568, t + 0.3, 0.35, 'sine', 0.08);
        break;
      case 'card':
        this.noise(t, 0.32, 0.25, 700, 0.8, 'bandpass', 4200);
        this.tone(880, t + 0.22, 0.18, 'sine', 0.08);
        break;
      case 'jail':
        this.tone(330, t, 0.22, 'sawtooth', 0.08, 260);
        this.tone(262, t + 0.22, 0.22, 'sawtooth', 0.08, 208);
        this.tone(196, t + 0.44, 0.45, 'sawtooth', 0.08, 140);
        this.noise(t + 0.44, 0.15, 0.3, 200, 1, 'lowpass');
        break;
      case 'build':
        this.noise(t, 0.06, 0.4, 350, 1, 'lowpass');
        this.tone(190, t, 0.09, 'square', 0.07);
        this.tone(880, t + 0.08, 0.15, 'triangle', 0.1);
        break;
      case 'turn':
        this.tone(880, t, 0.16, 'sine', 0.1);
        this.tone(1320, t + 0.06, 0.22, 'sine', 0.07);
        break;
      case 'double':
        this.notes([988, 1319], t, 0.08, 0.14, 'square', 0.05);
        break;
      case 'deal':
        this.notes([659, 880, 1109], t, 0.09, 0.22, 'triangle', 0.15);
        break;
      case 'win':
        this.notes([523, 659, 784, 1047, 784, 1047, 1319], t, 0.12, 0.3, 'triangle', 0.18);
        break;
      case 'lose':
        this.notes([392, 370, 349, 294], t, 0.22, 0.4, 'triangle', 0.15);
        break;
    }
  }
}
