'use strict';
(() => {
  const read = id => document.getElementById(id);
  const data = JSON.parse(read('game-data').textContent);
  const { createMechanicsState, advanceMechanics, finishMechanics } = window.EngineMechanics;
  const { simulatePhysicsStep, followCamera } = window.EnginePhysics;
  const canvas = read('screen');
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' });
  if (!gl) { read('hint').textContent = 'WebGL2 required'; throw new Error('WebGL2 unavailable'); }
  const errors = [];
  function shader(kind, source) {
    const obj = gl.createShader(kind);
    gl.shaderSource(obj, source); gl.compileShader(obj);
    if (!gl.getShaderParameter(obj, gl.COMPILE_STATUS)) {
      const msg = gl.getShaderInfoLog(obj); errors.push(msg); throw new Error(msg);
    }
    return obj;
  }
  function program(vs, fs) {
    const obj = gl.createProgram();
    gl.attachShader(obj, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(obj, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(obj);
    if (!gl.getProgramParameter(obj, gl.LINK_STATUS)) {
      const msg = gl.getProgramInfoLog(obj); errors.push(msg); throw new Error(msg);
    }
    return obj;
  }
  const sceneProgram = program(
    '#version 300 es\nprecision highp float;\nlayout(location=0)in vec3 aPos;\nlayout(location=1)in vec3 aColor;\nuniform vec3 uEye,uRight,uUp,uForward;\nuniform float uAspect,uTan;\nout vec3 vColor;\nout float vDepth;\nvoid main(){vec3 d=aPos-uEye;float z=dot(d,uForward);vec2 q=vec2(dot(d,uRight),dot(d,uUp));gl_Position=vec4(q.x/(uTan*uAspect),q.y/uTan,(z*101.-100.)/99.,z);vColor=aColor;vDepth=max(0.,z);}',
    '#version 300 es\nprecision highp float;\nin vec3 vColor;in float vDepth;out vec4 color;\nuniform float uTime;uniform vec3 uFog;\nvoid main(){float fog=1.-exp(-vDepth*.018);float pulse=.88+.12*sin(uTime*.65);color=vec4(mix(vColor*pulse,uFog,fog),1.);}'
  );
  const skyProgram = program(
    '#version 300 es\nprecision highp float;\nout vec2 vUv;\nvoid main(){vec2 p=vec2(float(gl_VertexID==1)*4.-1.,float(gl_VertexID==2)*4.-1.);vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}',
    '#version 300 es\nprecision highp float;\nin vec2 vUv;out vec4 color;\nuniform float uTime;uniform vec3 uDeep,uMid,uGlow;\nfloat h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nvoid main(){vec2 q=vUv;float aurora=pow(max(0.,sin(q.x*7.+sin(q.y*4.+uTime*.09)*1.7+uTime*.12)),8.)*smoothstep(.12,.8,q.y);float stars=step(.9975,h(floor(q*vec2(250.,140.))))*smoothstep(.12,.7,q.y);vec3 col=mix(uDeep,uMid,smoothstep(-.2,1.2,q.y));col+=uGlow*(aurora*.23+stars*.54);col+=uGlow*.09*exp(-pow((q.y-.34)*6.,2.));color=vec4(col,1.);}'
  );
  const style = data.visual, fogDef = style.shaders.atmosphere;
  const fogProgram = program(fogDef.vertexShader, fogDef.fragmentShader);
  const hex = color => [1, 3, 5].map(k => parseInt(color.slice(k, k + 2), 16) / 255);
  function uni(programId, name) { return gl.getUniformLocation(programId, name); }
  const geom = gl.createBuffer(), fullscreen = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, fullscreen);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1,-1,0, 0,0, 3,-1,0, 2,0, -1,3,0, 0,2
  ]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const C = {
    ground: hex(style.palette[1]), rock: hex(style.palette[0]),
    glow: hex(style.palette[2]), silver: hex(style.palette[3])
  };
  const baked = [], dynamic = [];
  function vertex(arr, p, color) { arr.push(p[0],p[1],p[2],color[0],color[1],color[2]); }
  function cube(arr, x1,y1,z1,x2,y2,z2,color) {
    const v=[[x1,y1,z1],[x2,y1,z1],[x2,y2,z1],[x1,y2,z1],
      [x1,y1,z2],[x2,y1,z2],[x2,y2,z2],[x1,y2,z2]];
    const faces=[[0,1,2,3,.55],[5,4,7,6,.75],[4,0,3,7,.57],
      [1,5,6,2,.71],[3,2,6,7,1],[4,5,1,0,.37]];
    for(const f of faces) {
      const tint=color.map(c=>Math.min(1,c*f[4]));
      for(const id of [f[0],f[1],f[2],f[0],f[2],f[3]])vertex(arr,v[id],tint);
    }
  }
  for(const solid of data.world.solids)
    cube(baked,solid.min.x,solid.min.y,solid.min.z,solid.max.x,solid.max.y,solid.max.z,C.ground);
  // The vault's six evidence pylons, rune bands and fragments share real world coordinates.
  for(const [i,m] of data.world.sceneMarkers.entries()) {
    const {x,y,z}=m.position;
    cube(baked,x-.86,y,x-.56,y+2.7,z-.22,z+.22,C.rock);
    cube(baked,x+.56,y,x+.86,y+2.7,z-.22,z+.22,C.rock);
    cube(baked,x-.95,y+2.7,z-.29,x+.95,y+3,z+.29,C.silver);
    cube(baked,x-.19,y+.95,z-.2,x+.19,y+1.8,z+.2,C.glow);
    if(i%2===0)cube(baked,x-1.85,y,z-1.1,x-1.62,y+1.1,z-.8,C.ground);
  }
  let state=createMechanicsState(data.rules), won=false, activeMenu=false, menuScene=null;
  let player={position:{...data.world.spawn},velocity:{x:0,y:0,z:0}};
  const cam={x:player.position.x,y:player.position.y+4,z:player.position.z-8};
  let yaw=0,pitch=.20,grounded=false, jumpQueued=false, useQueued=false;
  const keys=new Set(), nav={x:0,y:0}, pressed={left:false,right:false};
  let stickId=null, lookId=null, sx=0,sy=0,lx=0,ly=0,ready=false, time=0;
  const menu=read('menu'), buttons=read('options');
  function selectChoice(choice, option) {
    try {
      state=advanceMechanics(data.rules,state,{type:'choose',choiceId:choice.id,optionId:option.id});
      if(!pendingChoice()) { hideMenu(); if(state.currentScene===data.rules.scenes.at(-1).id) endGame(); }
      else showSceneMenu();
    } catch(e){errors.push(String(e));}
  }
  const pendingChoice=()=>data.rules.choiceBindings.find(c=>
    c.scene===state.currentScene&&!state.selections.some(s=>s.choiceId===c.id));
  function hideMenu(){activeMenu=false;menu.classList.remove('open');buttons.replaceChildren();}
  function button(label,click) {
    const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',click);
    buttons.appendChild(b);
  }
  function showSceneMenu(){
    const idx=data.rules.scenes.findIndex(s=>s.id===state.currentScene), scenario=data.scenario.scenes[idx];
    if(!scenario)throw new Error('Scene missing in canonical Scenario');
    activeMenu=true;menu.classList.add('open');buttons.replaceChildren();
    read('title').textContent='CHAPTER '+String(idx+1).padStart(2,'0');
    read('description').textContent=scenario.synopsis;
    const choice=pendingChoice();
    if(choice)for(const option of choice.options) {
      const original=data.scenario.choices.find(c=>c.id===choice.id)?.options.find(o=>o.id===option.id);
      button(original?.label||option.id,()=>selectChoice(choice,option));
    }else button('Continue',()=>{hideMenu();if(idx===5)endGame();});
  }
  function endGame(){
    const target=data.rules.endings.find(e=>Object.entries(e.traceConditions).every(([k,n])=>(state.traces[k]||0)>=n));
    if(!target){showSceneMenu();return;}
    try {state=finishMechanics(data.rules,state,target.id);won=true;}catch(e){errors.push(String(e));return;}
    activeMenu=true;menu.classList.add('open');buttons.replaceChildren();
    read('title').textContent='THE VAULT REMEMBERS';
    const ending=data.scenario.endings.find(e=>e.id===target.id);
    read('description').textContent='A choice became a consequence. '+(ending?.finalLocation||'The vault')+'.';
    button('Begin a new tale',()=>location.reload());
  }
  function interact(){
    if(activeMenu||won)return;
    const next=data.rules.scenes[state.visitedScenes.length];
    if(!next)return;
    const marker=data.world.sceneMarkers[state.visitedScenes.length].position;
    if(Math.hypot(player.position.x-marker.x,player.position.z-marker.z)>2.5)return;
    try {
      state=advanceMechanics(data.rules,state,{type:'enter',sceneId:next.id});
      menuScene=next.id;showSceneMenu();
    }catch(e){errors.push(String(e));}
  }
  function fillHud(){
    const h=read('hud');h.replaceChildren();
    for(let i=0;i<data.rules.scenes.length;i++){
      const el=document.createElement('i');
      if(i<state.visitedScenes.length)el.classList.add('done');
      h.appendChild(el);
    }
  }
  document.addEventListener('keydown',e=>{
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
    keys.add(e.code);
    if(e.code==='Space'&&!e.repeat)jumpQueued=true;
    if(e.code==='KeyE'&&!e.repeat)useQueued=true;
  });
  document.addEventListener('keyup',e=>keys.delete(e.code));
  function reset(){keys.clear();nav.x=nav.y=0;stickId=lookId=null;read('stick').style.display='none';}
  window.addEventListener('blur',reset);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  const stick=read('stick'), knob=read('knob');
  canvas.addEventListener('pointerdown',e=>{
    e.preventDefault();canvas.setPointerCapture(e.pointerId);
    if(e.clientX<innerWidth*.46&&stickId===null){
      stickId=e.pointerId;sx=e.clientX;sy=e.clientY;stick.style.display='block';
      stick.style.left=(sx-43)+'px';stick.style.top=(sy-43)+'px';
    }else if(lookId===null){lookId=e.pointerId;lx=e.clientX;ly=e.clientY;}
  });
  canvas.addEventListener('pointermove',e=>{
    if(e.pointerId===stickId){
      nav.x=Math.max(-1,Math.min(1,(e.clientX-sx)/57));
      nav.y=Math.max(-1,Math.min(1,(sy-e.clientY)/57));
      knob.style.transform='translate('+(nav.x*24)+'px,'+(-nav.y*24)+'px)';
    }else if(e.pointerId===lookId){
      yaw+=(e.clientX-lx)*.005;pitch=Math.max(-.15,Math.min(.67,pitch-(e.clientY-ly)*.003));
      lx=e.clientX;ly=e.clientY;
    }
  });
  function finishPointer(e){
    if(e.pointerId===stickId){stickId=null;nav.x=nav.y=0;stick.style.display='none';knob.style.transform='';}
    if(e.pointerId===lookId)lookId=null;
  }
  canvas.addEventListener('pointerup',finishPointer);
  canvas.addEventListener('pointercancel',finishPointer);
  canvas.addEventListener('wheel',e=>e.preventDefault(),{passive:false});
  read('jump').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();jumpQueued=true;});
  read('use').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();useQueued=true;});
  const V=(x,y,z)=>({x,y,z});
  function norm(v){
    const d=Math.hypot(v.x,v.y,v.z)||1;return V(v.x/d,v.y/d,v.z/d);
  }
  function cross(a,b){return V(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);}
  function basis(){
    const eye=V(cam.x,cam.y,cam.z), target=V(player.position.x,player.position.y+1.25,player.position.z+1.1);
    const forward=norm(V(target.x-eye.x,target.y-eye.y,target.z-eye.z));
    const right=norm(cross(V(0,1,0),forward)), up=norm(cross(forward,right));
    return{eye,forward,right,up};
  }
  function drawMesh(vertices,b){
    gl.useProgram(sceneProgram);
    gl.uniform3f(uni(sceneProgram,'uEye'),b.eye.x,b.eye.y,b.eye.z);
    gl.uniform3f(uni(sceneProgram,'uRight'),b.right.x,b.right.y,b.right.z);
    gl.uniform3f(uni(sceneProgram,'uUp'),b.up.x,b.up.y,b.up.z);
    gl.uniform3f(uni(sceneProgram,'uForward'),b.forward.x,b.forward.y,b.forward.z);
    gl.uniform1f(uni(sceneProgram,'uAspect'),canvas.width/canvas.height);
    gl.uniform1f(uni(sceneProgram,'uTan'),.78);
    gl.uniform1f(uni(sceneProgram,'uTime'),time);
    gl.uniform3fv(uni(sceneProgram,'uFog'),C.ground);
    gl.bindBuffer(gl.ARRAY_BUFFER,geom);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
    gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
    gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);
  }
  function render(){
    const dpr=Math.min(devicePixelRatio||1,2), w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    gl.viewport(0,0,w,h);gl.bindVertexArray(vao);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(skyProgram);
    gl.uniform1f(uni(skyProgram,'uTime'),time);
    gl.uniform3fv(uni(skyProgram,'uDeep'),C.rock);
    gl.uniform3fv(uni(skyProgram,'uMid'),C.ground);
    gl.uniform3fv(uni(skyProgram,'uGlow'),C.glow);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clear(gl.DEPTH_BUFFER_BIT);
    dynamic.length=0;
    const p=player.position,sway=Math.sin(time*7)*Math.min(.09,Math.hypot(player.velocity.x,player.velocity.z)*.012);
    cube(dynamic,p.x-.24,p.y+.15,p.z-.24,p.x+.24,p.y+1.65+sway,p.z+.24,C.silver);
    cube(dynamic,p.x-.32,p.y+1.18+sway,p.z-.27,p.x+.32,p.y+1.81+sway,p.z+.27,C.glow);
    cube(dynamic,p.x-.38,p.y+.33,p.z-.30,p.x-.23,p.y+.95+sway,p.z+.31,C.rock);
    cube(dynamic,p.x+.23,p.y+.33,p.z-.30,p.x+.38,p.y+.95+sway,p.z+.31,C.rock);
    for(let i=0;i<data.world.sceneMarkers.length;i++){
      const v=data.world.sceneMarkers[i].position;
      const pulse=.11+.15*(1+Math.sin(time*2.2+i));
      const color=i<state.visitedScenes.length?C.silver:C.glow.map(c=>c*(.6+pulse));
      cube(dynamic,v.x-.22,v.y+1.1+Math.sin(time+i)*.18,v.z-.22,v.x+.22,v.y+1.57+Math.sin(time+i)*.18,v.z+.22,color);
    }
    drawMesh(baked.concat(dynamic),basis());
    // The GLSL generated by the *visual engine* executes as an actual screen mist pass.
    gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(fogProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER,fullscreen);
    const pos=gl.getAttribLocation(fogProgram,'position'), uv=gl.getAttribLocation(fogProgram,'uv');
    gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,20,0);
    gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,20,12);
    gl.uniformMatrix4fv(uni(fogProgram,'modelViewMatrix'),false,new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]));
    gl.uniformMatrix4fv(uni(fogProgram,'projectionMatrix'),false,new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]));
    gl.uniform1f(uni(fogProgram,'uTime'),time);
    gl.uniform1f(uni(fogProgram,'uFogDensity'),style.lighting.fog.density);
    gl.uniform3fv(uni(fogProgram,'uFogColor'),C.ground);
    gl.uniform3fv(uni(fogProgram,'uAccentColor'),C.glow);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.disable(gl.BLEND);
    const err=gl.getError();if(err!==gl.NO_ERROR&&errors.length<12)errors.push('WebGL error '+err);
  }
  let last=0;
  function tick(now){
    try {
      const dt=Math.min(.04,Math.max(.001,(now-last)/1000||.016));last=now;time+=dt;
      let x=0,z=0;
      if(keys.has('KeyA')||keys.has('ArrowLeft'))x--;
      if(keys.has('KeyD')||keys.has('ArrowRight'))x++;
      if(keys.has('KeyW')||keys.has('ArrowUp'))z++;
      if(keys.has('KeyS')||keys.has('ArrowDown'))z--;
      x+=nav.x;z+=nav.y;
      const length=Math.hypot(x,z)||1;
      if(!activeMenu&&!won){
        const speed=3.7;
        const vx=(x*Math.cos(yaw)+z*Math.sin(yaw))/length*speed;
        const vz=(z*Math.cos(yaw)-x*Math.sin(yaw))/length*speed;
        const damp=1-Math.exp(-15*dt);
        player.velocity.x+=(vx-player.velocity.x)*damp;
        player.velocity.z+=(vz-player.velocity.z)*damp;
        if(jumpQueued&&grounded){player.velocity.y=5.2;grounded=false;}
        try {
          const next=simulatePhysicsStep(data.physics,{solids:data.world.solids},player,dt);
          player={position:next.position,velocity:next.velocity};grounded=next.contacts.ground;
        }catch(e){if(errors.length<12)errors.push(String(e));}
        if(player.position.y< -10){
          player={position:{...data.world.spawn},velocity:V(0,0,0)};
        }
        if(useQueued)interact();
      }
      jumpQueued=useQueued=false;
      const target=V(player.position.x-Math.sin(yaw)*7*Math.cos(pitch),
        player.position.y+3.3+7*Math.sin(pitch),
        player.position.z-Math.cos(yaw)*7*Math.cos(pitch));
      const next=followCamera(cam,target,1-Math.exp(-4.5*dt));
      Object.assign(cam,next);
      fillHud();render();
      ready=true;
    }catch(e){if(errors.length<12)errors.push(String(e));}
    requestAnimationFrame(tick);
  }
  window.__metaGamesState=()=>({
    ready,webgl2:true,x:player.position.x,y:player.position.y,z:player.position.z,
    camera:{...cam},visited:state.visitedScenes.length,selections:state.selections.length,
    progress:state.visitedScenes.length,total:data.rules.scenes.length,
    won,ending:state.ended,menu:activeMenu,errors:[...errors],
    scrollX:scrollX,scrollY:scrollY
  });
  requestAnimationFrame(tick);
})();