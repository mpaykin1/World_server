import{concat}from'./krieger-kx-codec.mjs';
import{parseKriegerKx}from'./krieger-kx-layout.mjs';
import{appendKriegerOperator}from'./krieger-kx-surgery.mjs';

function floatBits(value){
  if(!Number.isFinite(value))throw new TypeError('Krieger packed float must be finite');
  const b=new ArrayBuffer(4),v=new DataView(b);v.setFloat32(0,Number(value),true);return v.getUint32(0,true);
}
function shiftUnsigned(value,shift){
  value>>>=0;
  return shift>0?(value<<shift)>>>0:shift<0?value>>>-shift:value;
}
export function writeKriegerF16(value){
  value=Number(value);const bits=floatBits(value),esrc=((bits>>>23)&255)-128,edst=Math.min(15,Math.max(-16,esrc));
  if(edst===-16)return Uint8Array.of(0x00);
  if(Math.abs(value-1)<1/1024)return Uint8Array.of(0x80);
  if(Math.abs(value-.5)<.5/1024)return Uint8Array.of(0x01);
  if(Math.abs(value-.25)<.25/1024)return Uint8Array.of(0x81);
  const dest=((bits>>>16)&32768)|((edst+16)<<10)|(shiftUnsigned(bits>>>13,edst-esrc)&1023);
  if([0x00,0x01,0x81].includes(dest>>>8))throw new Error('Krieger F16 reserved prefix collision');
  return Uint8Array.of(dest>>>8,dest&255);
}
export function writeKriegerF24(value){
  value=Number(value);if(value===0)return Uint8Array.of(0);if(value===1)return Uint8Array.of(1);if(value===-1)return Uint8Array.of(0xff);
  const bits=floatBits(value),exp=(bits>>>23)&0xff;if(exp<=1)return Uint8Array.of(0);if(exp===0xff)throw new TypeError('Krieger F24 cannot encode NaN/Infinity');
  return Uint8Array.of(exp,(bits>>>8)&255,((bits>>>24)&128)|((bits>>>16)&127));
}
function vec3(value,fallback){
  const v=value??fallback;if(!Array.isArray(v)||v.length!==3||v.some(x=>!Number.isFinite(Number(x))))throw new TypeError('expected finite vec3');
  return v.map(Number);
}
export function encodeKriegerCubeParams(options={}){
  const tess=vec3(options.tessellate,[1,1,1]).map(x=>Math.max(1,Math.min(255,Math.round(x))));
  const scale=vec3(options.scale,[1,1,1]),rotation=vec3(options.rotation,[0,0,0]),translation=vec3(options.translation,[0,0,0]);
  return concat([
    Uint8Array.of(...tess,Number(options.flags??0)&255),
    ...scale.map(writeKriegerF16),...rotation.map(writeKriegerF16),...translation.map(writeKriegerF24),
  ]);
}
export function encodeKriegerSceneParams(options={}){
  const scale=vec3(options.scale,[1,1,1]),rotation=vec3(options.rotation,[0,0,0]),translation=vec3(options.translation,[0,0,0]);
  return concat([...scale.map(writeKriegerF16),...rotation.map(writeKriegerF16),...translation.map(writeKriegerF24),Uint8Array.of(Number(options.flags??0)&255)]);
}
function requireClass(parsed,operatorId){
  if(!parsed.classes.some(c=>c.operatorId===operatorId))throw new Error(`required native operator 0x${operatorId.toString(16)} absent from .kx class table`);
}
export function appendNativeCubeScene(input,options={}){
  const rootSlot=Number(options.rootSlot??0),before=parseKriegerKx(input);
  if(!Number.isInteger(rootSlot)||rootSlot<0||rootSlot>=before.roots.length)throw new RangeError('invalid root slot');
  const oldRoot=before.roots[rootSlot];if(oldRoot>=before.nOps)throw new Error(`root slot ${rootSlot} is empty`);
  for(const id of[0x81,0xc0,0xc1])requireClass(before,id);
  const cube=appendKriegerOperator(input,{operatorId:0x81,paramBytes:encodeKriegerCubeParams(options.cube)});
  const cubeIndex=cube.parsed.nOps-1;
  const scene=appendKriegerOperator(cube.bytes,{operatorId:0xc0,inputs:[cubeIndex],paramBytes:encodeKriegerSceneParams(options.scene)});
  const sceneIndex=scene.parsed.nOps-1;
  const add=appendKriegerOperator(scene.bytes,{operatorId:0xc1,inputs:[oldRoot,sceneIndex],makeRootSlots:[rootSlot]});
  return{bytes:add.bytes,parsed:add.parsed,oldRoot,cubeIndex,sceneIndex,addIndex:add.parsed.nOps-1};
}


function validateCubeWorldObject(object,index){
  if(!object||typeof object!=='object')throw new TypeError(`object ${index} must be an object`);
  if(String(object.primitive??'cube')!=='cube')throw new Error(`native binary subset supports cube only: object ${index}`);
  if(object.material!=null)throw new Error(`native binary material lowering is not implemented: object ${index}`);
  if(Array.isArray(object.modifiers)&&object.modifiers.length)throw new Error(`native binary modifier lowering is not implemented: object ${index}`);
  return{
    cube:{tessellate:object.params?.tessellate??[1,1,1],flags:object.params?.flags??0},
    scene:{scale:object.scale??[1,1,1],rotation:object.rotation??[0,0,0],translation:object.position??[0,0,0],flags:object.sceneFlags??0},
  };
}

export function appendNativeCubeWorld(input,objects,options={}){
  if(!Array.isArray(objects)||objects.length===0)throw new Error('cube world requires at least one object');
  if(objects.length>256)throw new RangeError('cube world object budget exceeded');
  const rootSlot=Number(options.rootSlot??0),initial=parseKriegerKx(input);
  if(!Number.isInteger(rootSlot)||rootSlot<0||rootSlot>=initial.roots.length)throw new RangeError('invalid root slot');
  const oldRoot=initial.roots[rootSlot];
  if(oldRoot>=initial.nOps)throw new Error(`root slot ${rootSlot} is empty`);
  for(const id of[0x81,0xc0,0xc1])requireClass(initial,id);
  let bytes=input,parsed=initial;
  const authored=[];
  for(let i=0;i<objects.length;i++){
    const spec=validateCubeWorldObject(objects[i],i);
    const cube=appendKriegerOperator(bytes,{operatorId:0x81,paramBytes:encodeKriegerCubeParams(spec.cube)});
    bytes=cube.bytes;parsed=cube.parsed;const cubeIndex=parsed.nOps-1;
    const scene=appendKriegerOperator(bytes,{operatorId:0xc0,inputs:[cubeIndex],paramBytes:encodeKriegerSceneParams(spec.scene)});
    bytes=scene.bytes;parsed=scene.parsed;const sceneIndex=parsed.nOps-1;
    authored.push({cubeIndex,sceneIndex});
  }
  let accumulator=oldRoot;
  for(let start=0;start<authored.length;start+=14){
    const sceneInputs=authored.slice(start,start+14).map(x=>x.sceneIndex);
    const final=start+14>=authored.length;
    const add=appendKriegerOperator(bytes,{
      operatorId:0xc1,
      inputs:[accumulator,...sceneInputs],
      makeRootSlots:final?[rootSlot]:[],
    });
    bytes=add.bytes;parsed=add.parsed;accumulator=parsed.nOps-1;
  }
  return{bytes,parsed,oldRoot,newRoot:accumulator,authored};
}

export function compileCubeRecipeIntoKx(input,recipe,options={}){
  if(!recipe||typeof recipe!=='object')throw new TypeError('recipe must be an object');
  for(const [name,value] of Object.entries({
    materials:recipe.materials,effects:recipe.effects,weapons:recipe.weapons,portals:recipe.portals,
    creatures:recipe.creatures,colliders:recipe.colliders,triggers:recipe.triggers,audio:recipe.audio,
  })){
    if(Array.isArray(value)&&value.length)throw new Error(`native binary cube subset does not lower ${name} yet`);
  }
  return appendNativeCubeWorld(input,recipe.objects??[],options);
}
