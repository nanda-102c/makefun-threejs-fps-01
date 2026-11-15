// Procedural sound: every effect is synthesised with WebAudio, so the game ships no
// audio files at all. The context is created lazily on the first user gesture.
export function createAudio() {
  let context = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration, frequency, type = 'lowpass', gain = 1, slide = 0 }) {
    if (!enabled || !ensure()) return;
    if (context.state === 'suspended') context.resume();
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, now);
    if (slide) filter.frequency.exponentialRampToValueAtTime(Math.max(40, slide), now + duration);
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(amp).connect(master);
    source.start(now);
    source.stop(now + duration);
  }

  function tone({ frequency, duration, type = 'sine', gain = 0.5, slide = 0, delay = 0 }) {
    if (!enabled || !ensure()) return;
    if (context.state === 'suspended') context.resume();
    const now = context.currentTime + delay;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), now + duration);
    const amp = context.createGain();
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(amp).connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  return {
    unlock() {
      ensure();
    },
    toggle() {
      enabled = !enabled;
      return enabled;
    },
    get enabled() {
      return enabled;
    },
    shot(kind) {
      if (kind === 'shotgun') burst({ duration: 0.22, frequency: 1400, gain: 1.2, slide: 220 });
      else if (kind === 'smg') burst({ duration: 0.09, frequency: 2600, gain: 0.7, slide: 500 });
      else if (kind === 'pistol') burst({ duration: 0.11, frequency: 2200, gain: 0.85, slide: 380 });
      else burst({ duration: 0.13, frequency: 1900, gain: 0.95, slide: 320 });
    },
    distantShot() {
      burst({ duration: 0.12, frequency: 700, gain: 0.22, slide: 180 });
    },
    dry() {
      tone({ frequency: 1400, duration: 0.04, type: 'square', gain: 0.25 });
    },
    reload() {
      tone({ frequency: 900, duration: 0.05, type: 'square', gain: 0.2 });
      tone({ frequency: 620, duration: 0.05, type: 'square', gain: 0.2, delay: 0.35 });
      tone({ frequency: 1100, duration: 0.06, type: 'square', gain: 0.25, delay: 0.8 });
    },
    hit() {
      tone({ frequency: 2200, duration: 0.05, type: 'square', gain: 0.3 });
    },
    kill() {
      tone({ frequency: 880, duration: 0.09, type: 'triangle', gain: 0.4 });
      tone({ frequency: 1320, duration: 0.12, type: 'triangle', gain: 0.35, delay: 0.08 });
    },
    hurt() {
      tone({ frequency: 180, duration: 0.18, type: 'sawtooth', gain: 0.35, slide: 90 });
    },
    beep(final = false) {
      tone({ frequency: final ? 1500 : 1050, duration: 0.09, type: 'sine', gain: 0.4 });
    },
    plant() {
      tone({ frequency: 700, duration: 0.1, type: 'square', gain: 0.25 });
      tone({ frequency: 700, duration: 0.1, type: 'square', gain: 0.25, delay: 0.25 });
    },
    explosion() {
      burst({ duration: 0.9, frequency: 900, gain: 1.4, slide: 60 });
      tone({ frequency: 70, duration: 0.7, type: 'sine', gain: 0.9, slide: 28 });
    },
    buy() {
      tone({ frequency: 990, duration: 0.07, type: 'triangle', gain: 0.35 });
      tone({ frequency: 1480, duration: 0.09, type: 'triangle', gain: 0.3, delay: 0.07 });
    },
    denied() {
      tone({ frequency: 220, duration: 0.16, type: 'square', gain: 0.3, slide: 160 });
    },
    roundWin() {
      [523, 659, 784, 1046].forEach((f, i) => tone({ frequency: f, duration: 0.22, type: 'triangle', gain: 0.35, delay: i * 0.11 }));
    },
    roundLose() {
      [392, 330, 262, 196].forEach((f, i) => tone({ frequency: f, duration: 0.26, type: 'triangle', gain: 0.32, delay: i * 0.13 }));
    },
    grenadePin() {
      tone({ frequency: 1800, duration: 0.04, type: 'square', gain: 0.2 });
    },
  };
}
