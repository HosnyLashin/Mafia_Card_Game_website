let context = null;

const CUES = {
  night: [[220, 0.25], [165, 0.45]],
  morning: [[523, 0.15], [659, 0.15], [784, 0.3]],
  vote: [[440, 0.12], [440, 0.18]],
  result: [[330, 0.2], [262, 0.35]],
  win: [[523, 0.15], [659, 0.15], [784, 0.15], [1047, 0.45]],
  lose: [[392, 0.2], [330, 0.2], [262, 0.55]],
};

function audio() {
  const Context = window.AudioContext ?? window.webkitAudioContext;
  if (!Context) return null;
  if (!context) context = new Context();
  if (context.state === 'suspended') context.resume?.();
  return context;
}

export function playCue(name) {
  try {
    const ctx = audio();
    if (!ctx || !CUES[name]) return;
    let start = ctx.currentTime;
    for (const [frequency, length] of CUES[name]) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + length + 0.02);
      start += length * 0.9;
    }
  } catch {
    return;
  }
}
