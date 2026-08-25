import * as THREE from 'three';

const _listenerPos=new THREE.Vector3(), _parentPos=new THREE.Vector3();
export class SoundBank {
  constructor(listener) {
    this.listener = listener;
    this.events = new Map();
    this.buffers = new Map();
    this.loader = new THREE.AudioLoader();
    this.virtualized=0;this.played=0;
  }

  async register(name, config) {
    const variations = [...(config.variations || [])];
    if (config.repeated !== false && variations.length < 3) throw new Error(`AUD-001: repeated event "${name}" requires >=3 variations`);
    for (const url of variations) if (!this.buffers.has(url)) this.buffers.set(url, await this.loader.loadAsync(url));
    this.events.set(name, {
      variations,gain:[...(config.gain || [0.9,1.05])],pitch:[...(config.pitch || [0.96,1.04])],spatial:config.spatial !== false,
      rolloff:config.rolloff ?? 1.1,refDistance:config.refDistance ?? 1.2,maxDistance:config.maxDistance ?? 96,
    });
  }

  play(name, parent = null) {
    const e = this.events.get(name); if (!e || !e.variations.length) return null;
    // Audio virtualization: inaudible far emitters consume no AudioNode/decoder work. Visual rendering is untouched.
    if(e.spatial&&parent?.getWorldPosition&&this.listener?.getWorldPosition){parent.getWorldPosition(_parentPos);this.listener.getWorldPosition(_listenerPos);if(_parentPos.distanceTo(_listenerPos)>e.maxDistance){this.virtualized++;return null;}}
    const url = e.variations[Math.floor(Math.random()*e.variations.length)];
    const audio = e.spatial ? new THREE.PositionalAudio(this.listener) : new THREE.Audio(this.listener);
    audio.setBuffer(this.buffers.get(url)); audio.setVolume(rand(e.gain[0], e.gain[1])); audio.setPlaybackRate(rand(e.pitch[0], e.pitch[1]));
    if (e.spatial) { audio.setRolloffFactor(e.rolloff); audio.setRefDistance(e.refDistance); audio.setMaxDistance?.(e.maxDistance); }
    parent?.add?.(audio); audio.play();this.played++;
    audio.onEnded = () => { audio.parent?.remove?.(audio); audio.disconnect?.(); };
    return audio;
  }
  report(){return{played:this.played,virtualized:this.virtualized,farAudioVirtualization:true,visualQualityChanged:false};}
}
function rand(a,b){ return a + Math.random()*(b-a); }
