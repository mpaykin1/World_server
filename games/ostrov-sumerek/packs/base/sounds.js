/* Synth recipes — data, played by playSound(id, { k, pitch, jitter, vol }).
     ['tone',  freq, dur, type, vol, slide, delay]       oscillator with an exponential pitch slide
     ['hiss',  dur, freq, q, vol, type, delay]           filtered noise burst
     ['sweep', dur, f0, f1, q, vol, type, delay]         filtered noise whose centre frequency slides
   A recipe may be a function (k) => steps; k is the intensity (or closeness) the caller passes. */
defineSound('thunder', (k) => [
  ['hiss', 0.22, 2600, 0.7, 0.04 + 0.12 * k, 'bandpass', 0],                 // the crack — loud only when close
  ['hiss', 2.8, 150, 0.5, 0.1 + 0.28 * k, 'lowpass', 0.06 + (1 - k) * 0.9],  // the roll arrives later from afar
  ['tone', 44, 2.4, 'sine', 0.05 + 0.14 * k, 28, 0.08 + (1 - k) * 0.9],
]);
defineSound('ghost_voice', [['tone', 392, 0.55, 'sine', 0.022, 330], ['tone', 587, 0.7, 'sine', 0.014, 520, 0.06], ['sweep', 0.6, 900, 300, 3, 0.01]]);
defineSound('fisher_voice', [['tone', 180, 0.12, 'triangle', 0.03, 150], ['tone', 150, 0.14, 'triangle', 0.025, 120, 0.13]]);
defineSound('wish', [['tone', 1568, 0.25, 'sine', 0.035], ['tone', 2093, 0.45, 'sine', 0.028, 0, 0.09], ['tone', 2637, 0.6, 'sine', 0.02, 0, 0.18]]);
defineSound('meteor', [['sweep', 0.9, 3200, 500, 1.4, 0.03]]);
