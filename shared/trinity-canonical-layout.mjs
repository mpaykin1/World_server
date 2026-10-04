const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function canonicalProfileFromRecipe(recipe){
  const art=recipe.artDirection?.KRIEGER||{};
  return {
    segments:clamp(Number(art.corridorSegments)||14,8,24),
    spacing:clamp(Number(art.spacing)||2.8,2.2,4),
    halfWidth:clamp(Number(art.halfWidth)||3.45,2.8,5),
    height:clamp(Number(art.height)||5.0,4,7),
    startZ:Number.isFinite(Number(art.startZ))?Number(art.startZ):-6
  };
}

export function canonicalCorridorLayout(recipe){
  const profile=canonicalProfileFromRecipe(recipe);
  const floor=[],walls=[],columns=[],caps=[],ribs=[],panels=[],fixtures=[];
  const {segments,spacing,halfWidth,height,startZ}=profile;
  for(let i=0;i<segments;i++){
    const z=startZ+i*spacing;
    for(let x=-halfWidth+1;x<=halfWidth-1;x+=1.7)floor.push({p:[x,-.12,z],s:[1.55,.12,spacing*.92]});
    for(const side of [-1,1]){
      const sx=side*(halfWidth+.62);
      walls.push({p:[sx,height*.48,z],s:[.48,height*.96,spacing*.94]});
      columns.push({p:[side*halfWidth,height*.42,z],s:[1,1,1]});
      caps.push({p:[side*halfWidth,height*.82,z],s:[1,1,1]});
      for(let row=0;row<3;row++)panels.push({p:[side*(halfWidth+.36),1+row*1.05,z],s:[.12,.62,spacing*.55]});
    }
    ribs.push({p:[0,height*.82,z],s:[1,1,1]});
    if(i%2===0)fixtures.push({p:[0,height*.92,z+.15],s:[1,1,1]});
  }
  return {profile,floor,walls,columns,caps,ribs,panels,fixtures};
}

export const CANONICAL_HERO={
  transform:{position:[.24,-.43,-1.06],rotation:[-.055,-.16,.018],scale:.44},
  parts:[
    {id:'receiver',shape:'box',size:[.52,.25,.88],p:[0,.01,-.08],material:'metal'},
    {id:'rear',shape:'box',size:[.58,.29,.34],p:[0,-.02,.50],material:'metal'},
    {id:'top',shape:'box',size:[.39,.105,.72],p:[0,.19,-.20],material:'warmMetal'},
    {id:'barrel',shape:'cylinder',radiusTop:.078,radiusBottom:.095,height:1.42,segments:14,p:[0,.055,-1.07],r:[Math.PI/2,0,0],material:'metal'},
    {id:'muzzle',shape:'cylinder',radiusTop:.12,radiusBottom:.14,height:.34,segments:14,p:[0,.055,-1.82],r:[Math.PI/2,0,0],material:'warmMetal'},
    {id:'railL',shape:'cylinder',radiusTop:.032,radiusBottom:.042,height:1.08,segments:10,p:[-.15,.105,-.82],r:[Math.PI/2,0,0],material:'warmMetal'},
    {id:'railR',shape:'cylinder',radiusTop:.032,radiusBottom:.042,height:1.08,segments:10,p:[.15,.105,-.82],r:[Math.PI/2,0,0],material:'warmMetal'},
    {id:'grip',shape:'box',size:[.17,.60,.17],p:[0,-.40,.28],r:[-.31,0,0],material:'darkStone'},
    ...Array.from({length:7},(_,i)=>({id:'rib'+i,shape:'box',size:[.40,.030,.055],p:[0,.245,-.43+i*.115],material:'darkStone'})),
    ...Array.from({length:4},(_,i)=>({id:'side'+i,shape:'box',size:[.040,.085,.13],p:[.29,.025,-.40+i*.20],material:'warmMetal'})),
    {id:'indicator',shape:'box',size:[.050,.050,.34],p:[.245,.19,-.40],material:'emissive'},
    {id:'sight',shape:'torus',radius:.145,tube:.030,radialSegments:8,tubularSegments:20,p:[0,.055,-2.01],r:[Math.PI/2,0,0],scale:[1,.82,1],material:'warmMetal'}
  ]
};

export function canonicalLightIntent(recipe){
  const {profile}=canonicalCorridorLayout(recipe),lights=[],z0=profile.startZ+profile.spacing*.8;
  for(let i=0;i<5;i++){
    const z=z0+i*profile.spacing*2.15,side=i%2===0?-1:1;
    lights.push({id:'corridor.light.'+i,kind:'local',position:[side*profile.halfWidth*.62,profile.height*.62,z],color:'#ffa04e',intensity:62,radius:14,decay:1.75});
  }
  for(const light of recipe.lights||[])lights.push({id:light.id,kind:'semantic',position:[light.position[0],light.position[1]+2.58,light.position[2]],color:light.color||'#ffc77b',intensity:light.intensity||2.1,radius:9,decay:2});
  return lights;
}

export function canonicalLayoutSignature(recipe){
  const layout=canonicalCorridorLayout(recipe),hero=CANONICAL_HERO,lights=canonicalLightIntent(recipe);
  let h=2166136261;const feed=v=>{for(const ch of String(v)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}};
  feed(recipe.seed);feed(JSON.stringify(layout));feed(JSON.stringify(hero));feed(JSON.stringify(lights));
  return (h>>>0).toString(16).padStart(8,'0');
}
