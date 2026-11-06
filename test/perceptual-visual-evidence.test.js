'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
test('loaded graphics evidence survives a later screenshot failure on disk',async()=>{
 const root=path.resolve(__dirname,'../work');fs.mkdirSync(root,{recursive:true});
 const dir=fs.mkdtempSync(path.join(root,'graphics-evidence-'));
 try{
  const source=fs.readFileSync(path.join(__dirname,'../e2e/perceptual-visual.spec.js'),'utf8');
  const start=source.indexOf("      testInfo.annotations.push({type:'loaded-state-graphics-evidence'");
  const end=source.indexOf('      // Fail closed before baseline comparison',start);
  assert.ok(start>=0&&end>start,'actual evidence block must be located');
  const evidence={project:'mobile-webkit',framing:{pass:false},pageErrors:['fixture error'],viewport:{width:390,height:664}};
  let attachment;
  const testInfo={annotations:[],outputPath:name=>path.join(dir,name),attach:async(name,options)=>{attachment={name,...options};}};
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  await new AsyncFunction('fs','testInfo','evidence',source.slice(start,end))(fs,testInfo,evidence);
  // The following visual assertion can fail; evidence must already exist outside reporter memory.
  assert.throws(()=>assert.equal(evidence.framing.pass,true));
  const saved=path.join(dir,'loaded-state-graphics-evidence.json');
  assert.ok(fs.existsSync(saved),'JSON must be a real file for upload-artifact');
  assert.deepEqual(JSON.parse(fs.readFileSync(saved,'utf8')),evidence);
  assert.equal(attachment.path,saved);
  assert.equal(attachment.body,undefined);
  assert.equal(attachment.contentType,'application/json');
 }finally{
  assert.equal(path.dirname(dir),root);
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
