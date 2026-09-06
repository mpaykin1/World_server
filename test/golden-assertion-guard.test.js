const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
test('Golden gate rejects missing matcher invocation in nested browser tests',()=>{
 const source=path.resolve(__dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'golden-assertion-'));
 try{
  const files=['data/app-release-registry.json','api/apps.js','shared/ai3d-playable-runtime.js','apps/voxel-world/client.js','apps/voxel-world/index.html','apps/ai3d-voxel-city/client.js','apps/ai3d-voxel-city/index.html','apps/catalog/client.js','apps/catalog/index.html','playwright.config.js','shared/golden-ui-shell.js','shared/golden-ui-shell.css','shared/golden-physics.js','data/ui-policy.json','data/visual-quality-policy.json','data/control-policy.json','data/collision-policy.json'];
  for(const f of files){fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.copyFileSync(path.join(source,f),path.join(root,f));}
  fs.mkdirSync(path.join(root,'e2e','nested'),{recursive:true});
  const run=()=>cp.spawnSync(process.execPath,[path.join(source,'scripts/check-golden-standard.js')],{cwd:root,encoding:'utf8',windowsHide:true});
  assert.equal(run().status,0);
  for(const name of ['Truthy','Falsy']){
   fs.writeFileSync(path.join(root,'e2e','nested','bad.spec.js'),'expect(true).toBe'+name+';');
   const r=run();assert.equal(r.status,1);assert.match(r.stderr,/false-green assertion/);
  }
 }finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}
});
