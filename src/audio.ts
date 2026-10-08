// Web Audio API Sound Synthesizer for Street FC (No external audio files required)
let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      ctx = new AudioCtx();
    }
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): boolean {
  muted = m;
  if (muted && ctx) {
    ctx.suspend().catch(() => {});
  } else if (!muted && ctx) {
    ctx.resume().catch(() => {});
  }
  return muted;
}

export function toggleMute(): boolean {
  return setMuted(!muted);
}

// 1. Kick / Shot sound (punchy low impact)
export function sfxKick(power: number = 0.5): void {
  const c = getCtx();
  if (!c) return;

  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.type = 'sine';
  const startFreq = 120 + power * 100;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.12);

  gain.gain.setValueAtTime(0.6 + power * 0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

  // Noise click/thud
  const bufferSize = c.sampleRate * 0.05;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = c.createBufferSource();
  noise.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800 + power * 600, now);

  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.4, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(c.destination);

  osc.connect(gain);
  gain.connect(c.destination);

  osc.start(now);
  osc.stop(now + 0.15);
  noise.start(now);
  noise.stop(now + 0.05);
}

// 2. Whistle sound (Referee whistle)
export function sfxWhistle(): void {
  const c = getCtx();
  if (!c) return;

  const now = c.currentTime;
  const osc1 = c.createOscillator();
  const osc2 = c.createOscillator();
  const gain = c.createGain();

  osc1.type = 'sine';
  osc2.type = 'sine';

  osc1.frequency.setValueAtTime(2800, now);
  osc2.frequency.setValueAtTime(3050, now);

  // Add tremolo modulation for whistle flutter
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.setValueAtTime(25, now);
  lfoGain.gain.setValueAtTime(150, now);

  lfo.connect(osc1.frequency);
  lfo.connect(osc2.frequency);

  gain.gain.setValueAtTime(0.01, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.03);
  gain.gain.setValueAtTime(0.25, now + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(c.destination);

  lfo.start(now);
  osc1.start(now);
  osc2.start(now);

  lfo.stop(now + 0.36);
  osc1.stop(now + 0.36);
  osc2.stop(now + 0.36);
}

// 3. Goal sound (horn + crowd cheer)
export function sfxGoal(): void {
  const c = getCtx();
  if (!c) return;

  const now = c.currentTime;

  // Brass chord horn
  const freqs = [261.63, 329.63, 392.0, 523.25]; // C E G C
  freqs.forEach((f) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, now);

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.08);
    gain.gain.setValueAtTime(0.12, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);

    osc.start(now);
    osc.stop(now + 0.92);
  });

  // Crowd noise cheer
  const dur = 1.2;
  const bufferSize = c.sampleRate * dur;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = c.createBufferSource();
  noise.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(900, now);
  filter.Q.setValueAtTime(1.2, now);

  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.01, now);
  noiseGain.gain.linearRampToValueAtTime(0.2, now + 0.15);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(c.destination);

  noise.start(now);
  noise.stop(now + dur);
}

// 4. Slide tackle sound
export function sfxSlide(): void {
  const c = getCtx();
  if (!c) return;

  const now = c.currentTime;
  const dur = 0.35;
  const bufferSize = c.sampleRate * dur;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = c.createBufferSource();
  noise.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(400, now);
  filter.frequency.exponentialRampToValueAtTime(100, now + dur);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.01, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);

  noise.start(now);
  noise.stop(now + dur);
}

// 5. UI Button Tap sound
export function sfxTap(): void {
  const c = getCtx();
  if (!c) return;

  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.04);

  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  osc.connect(gain);
  gain.connect(c.destination);

  osc.start(now);
  osc.stop(now + 0.05);
}
