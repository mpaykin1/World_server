(function (root, factory) {
  'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PixelAnimationPixi8=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const VERSION='2.0.0';
  const DEFAULT_MODULE_URL='https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.mjs';
  async function loadPixi(moduleUrl){return import(moduleUrl||DEFAULT_MODULE_URL);}
  async function createParticleLayer(app,textureSource,options){
    const opts=options||{},PIXI=opts.PIXI||await loadPixi(opts.moduleUrl);if(!app||!app.stage)throw new TypeError('PixiJS Application required');
    const texture=typeof textureSource==='string'?await PIXI.Assets.load(textureSource):textureSource;if(!texture)throw new Error('Pixi texture unavailable');
    if(texture.source)texture.source.scaleMode='nearest';
    const container=new PIXI.ParticleContainer({dynamicProperties:{position:true,vertex:true,rotation:Boolean(opts.rotation),color:Boolean(opts.color)}});app.stage.addChild(container);
    const particles=new Map();let nextId=1;const clock={time:0,enabled:true};
    function spawn(spec){const s=spec||{},id=s.id!=null?s.id:nextId++;const p=new PIXI.Particle({texture,x:Number(s.x)||0,y:Number(s.y)||0,scaleX:Number(s.scaleX??s.scale??1),scaleY:Number(s.scaleY??s.scale??1),rotation:Number(s.rotation)||0,alpha:s.opacity==null?1:Number(s.opacity)});p.__pixelAnim={baseX:p.x,baseY:p.y,seed:Number(s.seed)||((id*0.61803398875)%1),profile:s.profile||'generic',phase:Number(s.phase)||0,amplitude:Number(s.amplitude??2),speed:Number(s.speed??1)};particles.set(id,p);container.addParticle(p);return id;}
    function update(id,patch){const p=particles.get(id);if(!p)return false;const x=patch||{};for(const k of ['x','y','rotation','alpha','scaleX','scaleY'])if(x[k]!=null)p[k]=Number(x[k]);if(x.x!=null)p.__pixelAnim.baseX=Number(x.x);if(x.y!=null)p.__pixelAnim.baseY=Number(x.y);Object.assign(p.__pixelAnim,Object.fromEntries(Object.entries(x).filter(([k])=>['profile','phase','amplitude','speed','seed'].includes(k))));return true;}
    function remove(id){const p=particles.get(id);if(!p)return false;container.removeParticle(p);particles.delete(id);return true;}
    const tick=(ticker)=>{if(!clock.enabled)return;clock.time+=ticker.elapsedMS/1000;let i=0;const maxAnimated=Number(opts.maxAnimated)||5000;for(const p of particles.values()){if(i++>=maxAnimated)break;const m=p.__pixelAnim,t=clock.time*m.speed+m.phase+m.seed*6.283;const amp=m.amplitude;if(m.profile==='fire'||m.profile==='smoke'||m.profile==='light')p.x=m.baseX+Math.sin(t*2.1)*amp;else if(m.profile==='bird'||m.profile==='character'||m.profile==='monster')p.y=m.baseY+Math.sin(t)*amp;else if(m.profile==='flag'||m.profile==='cloth'||m.profile==='foliage')p.x=m.baseX+Math.sin(t*1.3+m.baseY*0.01)*amp;};};
    app.ticker.add(tick);
    return {backend:'pixi8-particle',container,texture,spawn,update,remove,clear(){for(const id of [...particles.keys()])remove(id);},pause(){clock.enabled=false;},resume(){clock.enabled=true;},stats(){return{backend:'pixi8-particle',total:particles.size,maxAnimated:Number(opts.maxAnimated)||5000};},destroy(){app.ticker.remove(tick);for(const id of [...particles.keys()])remove(id);if(container.parent)container.parent.removeChild(container);container.destroy();}};
  }
  return Object.freeze({VERSION,DEFAULT_MODULE_URL,loadPixi,createParticleLayer});
});
