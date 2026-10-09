'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
test('private renderer adapter registers before/after shell boot and can detach',async()=>{
  const {registerGameViewportRenderer}=await import('../shared/game-viewport-adapter.mjs');
  for(const early of [true,false]){
    const host=new EventTarget(),renderer={},camera={},budget={maxDpr:.5};
    const registered=[];
    let removed=0;
    const shell={registerAdapter(a){registered.push(a);return()=>removed++;}};
    if(early)host.WorldServerGameViewport=shell;
    const remove=registerGameViewportRenderer(renderer,camera,budget,host);
    if(!early){host.WorldServerGameViewport=shell;host.dispatchEvent(new Event('worldserverviewportresize'));}
    host.dispatchEvent(new Event('worldserverviewportresize'));
    assert.deepEqual(registered,[{renderer,camera,maxDpr:.5}]);
    remove();
    assert.equal(removed,1);
  }
});
test('adapter detached before delayed boot does not register',async()=>{
  const {registerGameViewportRenderer}=await import('../shared/game-viewport-adapter.mjs');
  const host=new EventTarget();
  const remove=registerGameViewportRenderer({}, {}, {},host);
  remove();
  host.WorldServerGameViewport={registerAdapter(){assert.fail('detached adapter');}};
  host.dispatchEvent(new Event('worldserverviewportresize'));
});
test('Gothic renderer extraction retains software/mobile/desktop quality budgets',async()=>{
  const {createGothicRenderer}=await import('../apps/gothic-destruction-mvp/renderer.mjs');
  for(const [name,coarse,dpr,hz,fragments] of [['SwiftShader',false,.5,12,48],['GPU',true,1.12,32,90],['GPU',false,1.45,48,120]]){
    class Renderer{
      constructor(options){this.options=options;this.shadowMap={};}
      getContext(){return {getExtension(){return null;},getParameter(){return name;}};}
      setPixelRatio(value){this.ratio=value;}
      setSize(w,h){this.size=[w,h];}
    }
    const THREE={WebGLRenderer:Renderer,PCFSoftShadowMap:1,SRGBColorSpace:2,ACESFilmicToneMapping:3};
    const result=createGothicRenderer(THREE,coarse,{width:390,height:844,dpr:2});
    assert.equal(result.maxDpr,dpr);
    assert.equal(result.renderer.ratio,dpr);
    assert.equal(result.physicsHz,hz);
    assert.equal(result.perShotFragmentBudget,fragments);
    assert.equal(result.activeFragmentBudget,fragments*2);
    assert.equal(result.shadowsEnabled,name==='GPU');
    assert.equal(result.renderer.toneMappingExposure,1.12);
    assert.deepEqual(result.renderer.size,[390,844]);
  }
});
