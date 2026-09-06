const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
class Position{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new Position(this.x,this.y,this.z);}copy(p){Object.assign(this,p);}}
for(const app of ['ai3d-voxel-city','voxel-world']){
 const ai=app==='ai3d-voxel-city';
 function setup(height){
  const source=fs.readFileSync(path.join(__dirname,`../apps/${app}/client.js`),'utf8');
  const position=new Position(),player=ai?position:{pos:position,vel:{x:0,y:0,z:0}};
  if(ai)player.vy=0;
  const occupied=(x,y)=>x>=.3&&x<=1.3&&y<height;
  const ctx=vm.createContext({player,collidesAt:occupied,collides:occupied});
  vm.runInContext(source.slice(source.indexOf('const GOLDEN_STEP_HEIGHTS='),source.indexOf(ai?'function updatePlayer(':'function physics(')),ctx);
  return {position,move:(delta,grounded=true)=>(ai?ctx.goldenPlayableHorizontal:ctx.goldenHorizontal)('x',delta,grounded)};
 }
 test(`${app} actual controller blocks repeated attempts to cross a tall wall`,()=>{
  const f=setup(3);for(let i=0;i<50;i++)f.move(.1);
  assert.ok(f.position.x<.3);assert.equal(f.position.y,0);
 });
 test(`${app} actual controller climbs a 1m step but refuses >1.05m or airborne step-up`,()=>{
  const low=setup(1);assert.equal(low.move(.4),true);assert.equal(low.position.x,.4);assert.ok(low.position.y>=1&&low.position.y<=1.05);
  const high=setup(1.1);assert.equal(high.move(.4),false);assert.equal(high.position.x,0);
  const air=setup(1);assert.equal(air.move(.4,false),false);assert.equal(air.position.y,0);
 });
}
