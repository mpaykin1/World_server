'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const ROOT=process.cwd();

test('CPU visual ensemble scores identical images almost perfectly',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vis-'));const py=`from PIL import Image\nim=Image.new("RGB",(48,48),(70,120,180));im.save(r"${tmp.replaceAll('\\','\\\\')}/a.png");im.save(r"${tmp.replaceAll('\\','\\\\')}/b.png")`;
 let r=cp.spawnSync('python',['-c',py],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 r=cp.spawnSync('python',[path.join(ROOT,'scripts/cpu_visual_ensemble.py'),path.join(tmp,'a.png'),path.join(tmp,'b.png'),path.join(tmp,'r.json')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const j=JSON.parse(fs.readFileSync(path.join(tmp,'r.json'),'utf8'));assert.ok(j.score>.999);assert.equal(j.gpu,false);fs.rmSync(tmp,{recursive:true,force:true});
});

test('asset similarity scanner finds duplicate-looking images without deleting them',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sim-'));const py=`from PIL import Image\nim=Image.new("RGB",(32,32),(30,90,150));im.save(r"${tmp.replaceAll('\\','\\\\')}/a.png");im.save(r"${tmp.replaceAll('\\','\\\\')}/b.png")`;
 let r=cp.spawnSync('python',['-c',py],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 r=cp.spawnSync('python',[path.join(ROOT,'scripts/asset_similarity_scan.py'),tmp],{cwd:tmp,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const j=JSON.parse(fs.readFileSync(path.join(tmp,'ASSET_SIMILARITY_REPORT.json'),'utf8'));assert.ok(j.similarCandidates.some(x=>x.kind==='image'));assert.equal(fs.existsSync(path.join(tmp,'a.png')),true);fs.rmSync(tmp,{recursive:true,force:true});
});

test('CPU collision simplifier preserves source and emits cheap candidates',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'col-')),src=path.join(tmp,'x.glb'),out=path.join(tmp,'out');const py=`import trimesh\nm=trimesh.creation.icosphere(subdivisions=2);trimesh.Scene(m).export(r"${src.replaceAll('\\','\\\\')}")`;
 let r=cp.spawnSync('python',['-c',py],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const before=fs.statSync(src).size;
 r=cp.spawnSync('python',[path.join(ROOT,'scripts/cpu_collision_simplifier.py'),src,out],{cwd:tmp,encoding:'utf8'});assert.equal(r.status,0,r.stderr);const j=JSON.parse(fs.readFileSync(path.join(tmp,'CPU_COLLISION_SIMPLIFIER_REPORT.json'),'utf8'));assert.equal(j.originalPreserved,true);assert.equal(fs.statSync(src).size,before);assert.ok(j.candidates.length>=2);assert.ok(j.candidates.some(x=>x.faces<j.sourceFaces));fs.rmSync(tmp,{recursive:true,force:true});
});
