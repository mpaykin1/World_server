'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
test('real apps handler does not publish unregistered HTML or quarantined apps',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-deny-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'data'));for(const id of ['certified','quarantined','unregistered']){fs.mkdirSync(path.join(root,'apps',id),{recursive:true});fs.writeFileSync(path.join(root,'apps',id,'index.html'),'<title>'+id+'</title>');}
 const file=path.join(root,'data/app-release-registry.json');const registry={policy:'deny-by-default',apps:{certified:{visible:true,status:'certified'},quarantined:{visible:true,status:'quarantine'}}};fs.writeFileSync(file,JSON.stringify(registry));
 const script="const handler=require(process.argv[1]);const res={setHeader(){},end(body){console.log(JSON.stringify({status:this.statusCode,body:JSON.parse(body)}))}};handler({method:'GET'},res);";
 const call=()=>JSON.parse(cp.execFileSync(process.execPath,['-e',script,path.join(__dirname,'../api/apps.js')],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 let r=call();assert.equal(r.status,200);assert.deepEqual(r.body.apps.map(x=>x.id),['certified']);
 fs.writeFileSync(file,'{broken');assert.equal(call().status,500);
 fs.writeFileSync(file,JSON.stringify(registry));fs.unlinkSync(path.join(root,'apps/certified/index.html'));assert.equal(call().status,500);
});
