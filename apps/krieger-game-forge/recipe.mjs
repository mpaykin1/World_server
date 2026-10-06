export const PRESETS={
  arena:{label:"Combat Arena",accent:"#f49b58",sky:"#090d13"},
  gothic:{label:"Gothic Gate",accent:"#a9b7ff",sky:"#07080d"},
  reactor:{label:"Reactor Run",accent:"#62e6ff",sky:"#061015"},
};

function seedInt(text){
  let h=2166136261>>>0;
  for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}
  return h>>>0;
}
function rngFactory(seed){
  let x=seedInt(seed)||1;
  return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296};
}
function material(id,usage,program=0){return{id,usage,program,pass:0,blend:"opaque"}}
function cube(id,pos,scale,mat,role="solid",bevel=.05){
  return{id,primitive:"cube",material:mat,position:pos,scale,params:{role,tessellate:[1,1,1]},
    modifiers:[{id:"bevel",kind:"bevel",params:{amount:bevel,select:0,mode:0}}]};
}
function cylinder(id,pos,scale,mat,role="solid"){
  return{id,primitive:"cylinder",material:mat,position:pos,scale,
    params:{role,facets:12,slices:1,flags:0},modifiers:[]};
}
function baseRecipe(id,seed,tuning){
  return{
    id:"krieger-forge-"+id,seed,
    materials:[material("stone",1),material("metal",2),material("energy",3),material("enemy",4)],
    objects:[],effects:[],weapons:[
      {id:"pulse",slot:0,damage:24+tuning.damage*8,cadence:.24,effect:"muzzle"},
      {id:"rail",slot:1,damage:58+tuning.damage*12,cadence:.62,effect:"railFlash"},
    ],
    portals:[],creatures:[],colliders:[],triggers:[],
    audio:[{id:"shot",sample:"pulse"},{id:"impact",sample:"impact"}],
    player:{spawn:[0,0,22],speed:8},
    metadata:{
      preset:id,
      colors:{stone:"#6c7480",metal:"#8698a4",energy:"#65ddff",enemy:"#ff5c5c"},
      tuning:{...tuning},
    },
  };
}
function addCollider(recipe,obj){
  recipe.colliders.push({id:obj.id+":collider",attachTo:obj.id,shape:"box",solid:true});
}
function addEnemy(recipe,id,pos,weapon="pulse"){
  recipe.creatures.push({id,position:pos,behavior:"seek-player",weapon,hp:70});
  recipe.triggers.push({id:id+":death",target:id,event:"onDeath",action:"score"});
}
function arena(seed,tuning){
  const recipe=baseRecipe("arena",seed,tuning);
  const h=1+tuning.height*.22,b=.05+tuning.bevel*.035;
  const core=cylinder("arena-core",[0,0,0],[3,5*h,3],"energy","objective");
  recipe.objects.push(core);
  const walls=[
    cube("north-wall",[0,0,-15],[18,2.2,1.2],"stone","cover",b),
    cube("south-wall",[0,0,15],[18,2.2,1.2],"stone","cover",b),
    cube("west-wall",[-17,0,0],[1.2,2.2,15],"stone","cover",b),
    cube("east-wall",[17,0,0],[1.2,2.2,15],"stone","cover",b),
  ];
  recipe.objects.push(...walls);
  for(let i=0;i<4+tuning.density*2;i++){
    const a=(i/(4+tuning.density*2))*Math.PI*2+.35;
    recipe.objects.push(cube("pillar-"+i,[Math.cos(a)*10,0,Math.sin(a)*10],[1.5,4*h,1.5],"metal","destructible",b));
  }
  for(const o of recipe.objects)addCollider(recipe,o);
  [[-11,0,-8],[12,0,-7],[-9,0,9],[10,0,10]].forEach((p,i)=>addEnemy(recipe,"drone-"+i,p));
  recipe.effects.push({id:"muzzle",kind:"partEmitter",attachTo:"arena-core",rate:1});
  recipe.triggers.push({id:"core-enter",target:"arena-core",event:"proximity",radius:4,action:"pulse"});
  return recipe;
}
function gothic(seed,tuning){
  const recipe=baseRecipe("gothic",seed,tuning),h=1+tuning.height*.25,b=.06+tuning.bevel*.04;
  const parts=[
    cube("gate-left",[-8,0,-4],[3,8*h,4],"stone","cover",b),
    cube("gate-right",[8,0,-4],[3,8*h,4],"stone","cover",b),
    cube("gate-top",[0,8*h,-4],[7,1.5,4],"stone","cover",b),
    cube("keep",[0,0,-18],[8,10*h,7],"stone","objective",b),
    cube("bridge",[0,.2,7],[5,.6,14],"metal","bridge",b),
  ];
  recipe.objects.push(...parts);
  const n=5+tuning.density*2;
  for(let i=0;i<n;i++){
    const side=i%2?-1:1,z=-2-(i*5);
    recipe.objects.push(cube("buttress-"+i,[side*(13+(i%3)),0,z],[1.8,4.5*h,2.2],"stone","destructible",b));
  }
  for(const o of recipe.objects)addCollider(recipe,o);
  [[-12,0,3],[12,0,4],[-7,0,-14],[8,0,-15]].forEach((p,i)=>addEnemy(recipe,"wraith-"+i,p,i>1?"rail":"pulse"));
  recipe.effects.push({id:"muzzle",kind:"partEmitter",attachTo:"keep",rate:1});
  recipe.triggers.push({id:"gate-open",target:"gate-top",event:"kills",count:4,action:"unlock"});
  return recipe;
}
function reactor(seed,tuning){
  const r=rngFactory(seed),recipe=baseRecipe("reactor",seed,tuning),h=1+tuning.height*.2,b=.04+tuning.bevel*.03;
  recipe.objects.push(cylinder("reactor-core",[0,0,-8],[4,8*h,4],"energy","objective"));
  for(let i=0;i<6;i++){
    const a=i/6*Math.PI*2,rad=10+(r()-.5)*2;
    recipe.objects.push(cylinder("coolant-"+i,[Math.cos(a)*rad,0,-8+Math.sin(a)*rad],[1.4,5*h,1.4],"metal","destructible"));
  }
  const n=5+tuning.density*2;
  for(let i=0;i<n;i++)recipe.objects.push(cube("crate-"+i,[(r()-.5)*26,0,(r()-.5)*24+6],[1.5,1.5,1.5],"stone","destructible",b));
  for(const o of recipe.objects)addCollider(recipe,o);
  [[-13,0,8],[13,0,8],[-8,0,-12],[9,0,-15]].forEach((p,i)=>addEnemy(recipe,"sentinel-"+i,p));
  recipe.effects.push({id:"muzzle",kind:"partEmitter",attachTo:"reactor-core",rate:1});
  recipe.triggers.push({id:"reactor-overload",target:"reactor-core",event:"kills",count:4,action:"overload"});
  return recipe;
}
export function makeRecipe(preset,seed,tuning={height:0,bevel:0,damage:0,density:0}){
  if(preset==="gothic")return gothic(seed,tuning);
  if(preset==="reactor")return reactor(seed,tuning);
  return arena(seed,tuning);
}
