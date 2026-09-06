const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('AI3D collision uses the same centered voxel bounds as the rendered mesh',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../apps/ai3d-voxel-city/client.js'),'utf8');
 const occupied=new Set(['1,0,0']);
 const ctx=vm.createContext({player:{radius:.35,height:1.65,eyeHeight:1.65},isOccupied:(x,y,z)=>occupied.has(`${x},${y},${z}`)});
 vm.runInContext(source.slice(source.indexOf('function collidesAt('),source.indexOf('function findGroundY(')),ctx);
 assert.equal(ctx.collidesAt(.3,1,0),true,'player overlaps the rendered left face at x=.5');
 assert.equal(ctx.collidesAt(.1,1,0),false);
 occupied.clear();occupied.add('0,0,0');
 assert.equal(ctx.collidesAt(0,2.1,0),true,'feet at .45 overlap rendered block top .5');
 assert.equal(ctx.collidesAt(0,2.2,0),false);
});
