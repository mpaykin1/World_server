'use strict';

const { buildAudioPlan } = require('./world-procedural-audio');

const PROCESSOR_NAME = 'world-procedural-synth-v3';

function sanitizePlan(plan) {
  return {
    seed: Number(plan?.seed) >>> 0,
    intensity: Math.max(0, Math.min(1, Number(plan?.intensity) || 0)),
    voices: (plan?.voices || []).slice(0, 16).map((v) => ({ type: v.type === 'noise' ? 'noise' : 'sine', hz: Math.max(0, Number(v.hz) || 0), gain: Math.max(0, Math.min(1, Number(v.gain) || 0)) })),
    pulses: (plan?.pulses || []).slice(0, 64).map((p) => ({ at: Math.max(0, Number(p.at) || 0), hz: Math.max(0, Number(p.hz) || 0), gain: Math.max(0, Math.min(1, Number(p.gain) || 0)) }))
  };
}

function buildAudioWorkletModuleSource(planInput) {
  const plan = sanitizePlan(planInput);
  return `'use strict';\nconst PLAN=${JSON.stringify(plan)};\nclass WorldProceduralSynth extends AudioWorkletProcessor{\nconstructor(){super();this.phase=0;this.noise=0;this.state=(PLAN.seed||1)>>>0;}\nrand(){let x=this.state||1;x^=x<<13;x^=x>>>17;x^=x<<5;this.state=x>>>0;return this.state/4294967296;}\nprocess(inputs,outputs){const out=outputs[0];if(!out||!out[0])return true;const ch=out[0];for(let i=0;i<ch.length;i++){const t=this.phase/sampleRate;let v=0;for(const voice of PLAN.voices){if(voice.type==='sine')v+=Math.sin(Math.PI*2*voice.hz*t)*voice.gain;else{this.noise=this.noise*.94+(this.rand()*2-1)*.06;v+=this.noise*voice.gain;}}for(const p of PLAN.pulses){const local=t-(p.at%8);if(local>=0&&local<.12)v+=Math.sin(Math.PI*2*p.hz*t)*p.gain*(1-local/.12);}ch[i]=Math.max(-1,Math.min(1,v));this.phase++;}for(let c=1;c<out.length;c++)out[c].set(ch);return true;}}\nregisterProcessor('${PROCESSOR_NAME}',WorldProceduralSynth);\n`;
}

async function installAudioWorklet(audioContext, recipeOrPlan, options = {}) {
  if (!audioContext?.audioWorklet?.addModule) throw new Error('AudioWorklet unavailable');
  const plan = recipeOrPlan?.voices ? sanitizePlan(recipeOrPlan) : buildAudioPlan(recipeOrPlan || {}, options);
  const source = buildAudioWorkletModuleSource(plan);
  const BlobCtor = options.Blob || globalThis.Blob;
  const URLApi = options.URL || globalThis.URL;
  const NodeCtor = options.AudioWorkletNode || globalThis.AudioWorkletNode;
  if (!BlobCtor || !URLApi?.createObjectURL || !NodeCtor) throw new Error('AudioWorklet runtime globals unavailable');
  const url = URLApi.createObjectURL(new BlobCtor([source], { type: 'text/javascript' }));
  try { await audioContext.audioWorklet.addModule(url); }
  finally { URLApi.revokeObjectURL?.(url); }
  const node = new NodeCtor(audioContext, PROCESSOR_NAME, { numberOfOutputs: 1, outputChannelCount: [2] });
  const gain = audioContext.createGain ? audioContext.createGain() : null;
  if (gain) {
    gain.gain.value = Math.max(0, Math.min(1, Number(options.masterGain) || 0.65));
    node.connect(gain);
    if (options.destination !== false) gain.connect(options.destination || audioContext.destination);
  } else if (options.destination !== false) node.connect(options.destination || audioContext.destination);
  return { mode: 'audio-worklet', node, gain, plan, disconnect() { try { node.disconnect(); } catch {} try { gain?.disconnect(); } catch {} } };
}

function installWebAudioFallback(audioContext, recipeOrPlan, options = {}) {
  if (!audioContext?.createOscillator || !audioContext?.createGain) throw new Error('WebAudio oscillator fallback unavailable');
  const plan = recipeOrPlan?.voices ? sanitizePlan(recipeOrPlan) : buildAudioPlan(recipeOrPlan || {}, options);
  const master = audioContext.createGain();
  master.gain.value = Math.max(0, Math.min(1, Number(options.masterGain) || 0.55));
  const nodes = [];
  for (const voice of plan.voices.filter((v) => v.type === 'sine')) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine'; osc.frequency.value = voice.hz; gain.gain.value = voice.gain;
    osc.connect(gain); gain.connect(master); osc.start();
    nodes.push({ osc, gain });
  }
  if (options.destination !== false) master.connect(options.destination || audioContext.destination);
  return { mode: 'oscillator-fallback', master, plan, disconnect() { for (const n of nodes) { try { n.osc.stop(); } catch {} try { n.osc.disconnect(); n.gain.disconnect(); } catch {} } try { master.disconnect(); } catch {} } };
}

async function installProceduralAudio(audioContext, recipe, options = {}) {
  try { return await installAudioWorklet(audioContext, recipe, options); }
  catch (error) {
    if (options.requireWorklet) throw error;
    const fallback = installWebAudioFallback(audioContext, recipe, options);
    fallback.workletError = String(error?.message || error);
    return fallback;
  }
}

module.exports = { PROCESSOR_NAME, sanitizePlan, buildAudioWorkletModuleSource, installAudioWorklet, installWebAudioFallback, installProceduralAudio };
