import * as THREE from '../vendor/three-r160/three.module.min.js';
import {STYLE,seeded} from './living-ink-webgl-npr.mjs';
import {createOfficeHuman,animateOfficeHuman,updateHumanLod} from './living-ink-webgl-human.mjs';

function desk(ctx,parent,x,z,seed=1,rot=0){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;parent.add(g);
  ctx.softPlane(g,[0,.014,0],1.65,.72,.075,'shadow',seed);
  ctx.box(g,[1.55,.075,.72],[0,.74,0],{color:STYLE.warm,opacity:.15,semantic:'desk',importance:.8,edgeOpacity:.38});
  for(const sx of [-.66,.66])for(const sz of [-.27,.27])ctx.box(g,[.055,.70,.055],[sx,.37,sz],{color:STYLE.inkSoft,opacity:.10,semantic:'desk',importance:.5,edgeOpacity:.24});
  ctx.box(g,[.72,.46,.055],[.16,1.06,-.08],{color:STYLE.screen,opacity:.30,semantic:'monitor',importance:.9,edgeOpacity:.50});
  ctx.box(g,[.055,.25,.055],[.16,.82,-.08],{color:STYLE.inkSoft,opacity:.10,semantic:'monitor',importance:.5,edgeOpacity:.22});
  ctx.box(g,[.48,.025,.19],[-.20,.79,-.08],{color:STYLE.wash,opacity:.11,semantic:'keyboard',importance:.55,edgeOpacity:.22});
  const mug=ctx.cyl(g,.035,.09,[.56,.81,.13],{color:STYLE.warm,opacity:.22,semantic:'mug',importance:.6,edgeOpacity:.20,segments:8});
  mug.userData.nearOnly=true;
  const paper=ctx.box(g,[.28,.009,.20],[-.50,.79,.14],{color:0xf4f2ec,opacity:.18,semantic:'documents',importance:.45,edgeOpacity:.14});
  paper.userData.nearOnly=true;
  return g;
}

function chair(ctx,parent,x,z,seed=1,rot=0){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;parent.add(g);
  ctx.softPlane(g,[0,.012,0],.58,.48,.065,'shadow',seed);
  ctx.box(g,[.48,.075,.45],[0,.47,0],{color:STYLE.wash,opacity:.18,semantic:'chair',importance:.72,edgeOpacity:.38});
  ctx.box(g,[.48,.58,.07],[0,.78,.17],{color:STYLE.wash,opacity:.16,semantic:'chair',importance:.78,edgeOpacity:.36});
  ctx.cyl(g,.035,.33,[0,.27,0],{color:STYLE.inkSoft,opacity:.14,semantic:'chair',importance:.55,edgeOpacity:.20,segments:8});
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5;
    const bar=ctx.box(g,[.32,.028,.028],[Math.cos(a)*.13,.08,Math.sin(a)*.13],{color:STYLE.inkSoft,opacity:.13,semantic:'chair',importance:.48,edgeOpacity:.16});
    bar.rotation.y=-a;
    const wheel=ctx.sphere(g,.032,[Math.cos(a)*.28,.045,Math.sin(a)*.28],{color:STYLE.inkSoft,opacity:.20,semantic:'chair',importance:.45,edgeOpacity:.16,w:7,h:5});
    wheel.userData.nearOnly=true;
  }
  return g;
}

function plant(ctx,parent,x,z,seed=1,scale=1){
  const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);parent.add(g);
  ctx.softPlane(g,[0,.012,0],.48,.42,.06,'shadow',seed);
  ctx.cyl(g,.18,.34,[0,.17,0],{color:STYLE.warm,opacity:.17,semantic:'plant',importance:.62,edgeOpacity:.28,segments:8});
  for(let i=0;i<8;i++){
    const a=-1.15+i*.33+(seeded(seed,i)-.5)*.13;
    const stem=new THREE.Group();stem.position.y=.30;stem.rotation.z=a*.35;stem.rotation.x=(seeded(seed,i,2)-.5)*.30;g.add(stem);
    ctx.cyl(stem,.012,.66,[0,.32,0],{color:STYLE.plant,opacity:.21,semantic:'plant',importance:.54,edgeOpacity:.16,segments:6});
    const leaf=ctx.sphere(stem,.13,[0,.66,0],{color:STYLE.plant,opacity:.22,semantic:'plant',importance:.72,edgeOpacity:.18,w:7,h:5});
    leaf.scale.set(1.45,.42,.82);leaf.rotation.z=(seeded(seed,i,3)-.5)*.9;
  }
  return g;
}

function coffeePoint(ctx,parent,x,z,seed=1){
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  ctx.box(g,[1.55,.82,.65],[0,.41,0],{color:STYLE.warm,opacity:.12,semantic:'cabinet',importance:.64,edgeOpacity:.30});
  ctx.box(g,[.62,.66,.42],[.10,1.14,-.08],{color:STYLE.wash,opacity:.20,semantic:'coffee-machine',importance:.88,edgeOpacity:.46});
  ctx.box(g,[.20,.08,.05],[.10,1.08,-.315],{color:STYLE.ink,opacity:.24,semantic:'coffee-machine',importance:.74,edgeOpacity:.18,edges:false});
  for(let i=0;i<4;i++){
    ctx.cyl(g,.04,.08,[-.52+i*.25,.86,-.18],{color:STYLE.warm,opacity:.22,semantic:'mug',importance:.56,edgeOpacity:.18,segments:7});
  }
  ctx.softPlane(g,[0,.015,.04],1.65,.80,.055,'shadow',seed);
  return g;
}

function printer(ctx,parent,x,z,seed=1){
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  ctx.softPlane(g,[0,.015,0],.78,.58,.05,'shadow',seed);
  ctx.box(g,[.75,.60,.58],[0,.48,0],{color:STYLE.wash,opacity:.16,semantic:'printer',importance:.82,edgeOpacity:.38});
  ctx.box(g,[.58,.10,.32],[0,.82,-.08],{color:STYLE.screen,opacity:.20,semantic:'printer',importance:.70,edgeOpacity:.26});
  ctx.box(g,[.48,.025,.28],[0,.17,.10],{color:0xf5f3ed,opacity:.20,semantic:'paper',importance:.52,edgeOpacity:.12});
  return g;
}

function pendant(ctx,parent,x,z,seed=1){
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  ctx.cyl(g,.010,.72,[0,2.82,0],{color:STYLE.inkSoft,opacity:.18,semantic:'light',importance:.40,edgeOpacity:.10,segments:6});
  const shade=ctx.cyl(g,.18,.045,[0,2.44,0],{color:STYLE.wash,opacity:.17,semantic:'light',importance:.52,edgeOpacity:.20,segments:14});
  shade.scale.y=.45;return g;
}

function glassRoom(ctx,parent,x,z,w,d,seed=1){
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  ctx.glassPanel(g,w,2.75,[0,1.375,-d/2],seed);
  const left=ctx.glassPanel(g,d,2.75,[-w/2,1.375,0],seed+1);left.rotation.y=Math.PI/2;
  const right=ctx.glassPanel(g,d,2.75,[w/2,1.375,0],seed+2);right.rotation.y=Math.PI/2;
  ctx.softPlane(g,[0,.014,0],w*.95,d*.85,.035,'wash',seed+3);
  return g;
}

function meetingArea(ctx,parent,x,z,seed=1){
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  ctx.softPlane(g,[0,.014,0],3.3,2.2,.048,'wash',seed);
  ctx.box(g,[2.25,.075,.95],[0,.73,0],{color:STYLE.warm,opacity:.13,semantic:'meeting-table',importance:.72,edgeOpacity:.34});
  for(const sx of [-.75,-.25,.25,.75])chair(ctx,g,sx,.75,seed+20+Math.round((sx+1)*10),Math.PI);
  for(const sx of [-.62,.62])chair(ctx,g,sx,-.68,seed+40+Math.round((sx+1)*10),0);
  ctx.box(g,[1.45,.78,.04],[0,1.68,.55],{color:STYLE.screen,opacity:.10,semantic:'whiteboard',importance:.66,edgeOpacity:.26});
  return g;
}

function lounge(ctx,parent,x,z,seed=1){
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  ctx.softPlane(g,[0,.014,0],3.3,2.1,.052,'wash',seed);
  ctx.box(g,[2.20,.54,.74],[0,.31,.35],{color:STYLE.wash,opacity:.15,semantic:'sofa',importance:.76,edgeOpacity:.36});
  ctx.box(g,[2.05,.62,.10],[0,.70,.66],{color:STYLE.wash,opacity:.13,semantic:'sofa',importance:.68,edgeOpacity:.30});
  ctx.box(g,[1.20,.06,.58],[.10,.40,-.70],{color:STYLE.warm,opacity:.12,semantic:'coffee-table',importance:.62,edgeOpacity:.28});
  ctx.cyl(g,.035,.10,[-.18,.48,-.70],{color:STYLE.warm,opacity:.20,semantic:'mug',importance:.48,edgeOpacity:.16,segments:7});
  return g;
}

function addFloorAndArchitecture(ctx,root){
  ctx.box(root,[14,.06,31],[0,-.035,14],{color:0xf3eee6,opacity:.12,semantic:'floor',importance:.45,edgeOpacity:.08,edges:false});
  for(let z=0;z<=30;z+=1.5){
    const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-7,.01,z),new THREE.Vector3(7,.01,z)]);
    const l=new THREE.Line(geo,ctx.edgeMaterial(STYLE.warm,.075));root.add(l);
  }
  for(let x=-6.5;x<=6.5;x+=1.6){
    const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,.012,0),new THREE.Vector3(x,.012,30)]);
    const l=new THREE.Line(geo,ctx.edgeMaterial(STYLE.warm,.055));root.add(l);
  }
  const back=ctx.glassPanel(root,13.2,3.1,[0,1.55,29.2],90);back.material.opacity=.028;
  for(const x of [-6.2,-2.4,2.4,6.2])pendant(ctx,root,x,5+((x+7)%3)*3,100+Math.round(x*10));
  for(const x of [-4.2,0,4.2])pendant(ctx,root,x,17,140+Math.round(x*10));
}

function stagedState(i,time){
  const states=['type','sit','walk','coffee','talk','meeting','printer','walk','type','talk','sit','walk'];
  if(i===2||i===7)return 'walk';
  if(i===4&&Math.floor(time/7000)%2)return 'coffee';
  return states[i%states.length];
}

export function createOfficeScene(ctx,seed=12345){
  const root=new THREE.Group();ctx.scene.add(root);addFloorAndArchitecture(ctx,root);
  glassRoom(ctx,root,-4.05,7.0,4.7,6.6,seed+1);
  glassRoom(ctx,root,4.05,7.0,4.7,6.6,seed+2);
  glassRoom(ctx,root,-4.05,18.0,4.7,6.8,seed+3);
  glassRoom(ctx,root,4.05,18.0,4.7,6.8,seed+4);

  const desks=[
    [-4.4,4.9,0],[-2.8,5.1,Math.PI],[-4.3,8.1,0],[-2.8,8.3,Math.PI],
    [2.8,5.0,0],[4.45,5.2,Math.PI],[2.9,15.9,0],[4.45,16.1,Math.PI],
    [-4.35,16.0,0],[-2.75,16.2,Math.PI]
  ];
  desks.forEach((d,i)=>{desk(ctx,root,d[0],d[1],seed+20+i,d[2]);chair(ctx,root,d[0]+(i%2?.58:-.58),d[1],seed+120+i,d[2]);});
  meetingArea(ctx,root,4.05,9.5,seed+210);
  meetingArea(ctx,root,-4.0,20.4,seed+220);
  lounge(ctx,root,-4.1,10.2,seed+230);
  lounge(ctx,root,4.1,20.8,seed+240);
  coffeePoint(ctx,root,5.65,13.2,seed+250);
  coffeePoint(ctx,root,-5.55,24.0,seed+251);
  printer(ctx,root,5.7,11.6,seed+260);
  printer(ctx,root,-5.7,22.3,seed+261);

  const plants=[[-6.1,4.3,1.1],[-1.85,8.9,.85],[1.85,7.3,.78],[6.1,8.2,.96],[-6.0,17.8,.92],[-1.8,19.5,.78],[2.0,18.4,.76],[6.0,22.8,1.02],[0,13.6,.70],[0,24.8,.66]];
  plants.forEach((p,i)=>plant(ctx,root,p[0],p[1],seed+300+i,p[2]));

  const humanSlots=[
    [-4.8,4.95,'type',0],[-2.55,5.05,'sit',Math.PI],[.15,6.7,'walk',0],
    [4.25,9.25,'meeting',Math.PI],[-5.1,13.0,'coffee',0],[5.35,11.6,'printer',Math.PI],
    [-4.55,16.0,'type',0],[.20,17.4,'walk',0],[3.0,16.1,'sit',Math.PI],
    [-3.8,20.3,'meeting',0],[4.25,21.0,'talk',Math.PI],[.1,25.2,'walk',0]
  ];
  const humans=humanSlots.map((s,i)=>{
    const h=createOfficeHuman(ctx,{
      seed:seed+500+i*37,x:s[0],z:s[1],state:s[2],
      height:1.62+seeded(seed,i,6)*.25,build:.90+seeded(seed,i,7)*.28
    });
    h.rotation.y=s[3];root.add(h);return h;
  });

  return {
    root,humans,
    update(time){
      humans.forEach((h,i)=>{
        const state=stagedState(i,time);h.userData.state=state;
        animateOfficeHuman(h,time,state);updateHumanLod(h,ctx.camera);
        if(state==='walk'){
          const base=humanSlots[i],phase=(time*.00042+i*.17)%1;
          h.position.z=base[1]+phase*3.4-1.7;
          h.position.x=base[0]+Math.sin(phase*Math.PI*2+i)*.18;
        }
      });
    },
    metrics(){
      return {humans:humans.length,desks:desks.length,plants:plants.length,rooms:4,realMeshes:true,hiddenLine:true};
    }
  };
}
