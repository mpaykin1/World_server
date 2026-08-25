'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');

test('CPU SSIM returns near 1 for identical images',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ssim-'));
  const py=`from PIL import Image\nim=Image.new("RGB",(32,32),(120,80,40));im.save(r"${root.replaceAll('\\','\\\\')}/a.png");im.save(r"${root.replaceAll('\\','\\\\')}/b.png")`;
  let r=cp.spawnSync('python',['-c',py],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  r=cp.spawnSync('python',[path.join(process.cwd(),'scripts/cpu_ssim_compare.py'),path.join(root,'a.png'),path.join(root,'b.png'),path.join(root,'r.json')],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);const j=JSON.parse(fs.readFileSync(path.join(root,'r.json'),'utf8'));assert.ok(j.ssim>.9999);assert.equal(j.cpuOnly,true);
  fs.rmSync(root,{recursive:true,force:true});
});

test('CPU texture factory creates non-destructive WebP variants',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tex-')),src=path.join(root,'src'),out=path.join(root,'out');fs.mkdirSync(src);
  const py=`from PIL import Image\nImage.new("RGBA",(16,16),(20,50,80,255)).save(r"${src.replaceAll('\\','\\\\')}/x.png")`;
  let r=cp.spawnSync('python',['-c',py],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  r=cp.spawnSync('python',[path.join(process.cwd(),'scripts/cpu_texture_factory.py'),src,out],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  assert.equal(fs.existsSync(path.join(src,'x.png')),true);assert.ok([...walk(out)].some(x=>x.endsWith('.webp')));
  fs.rmSync(root,{recursive:true,force:true});
});
function* walk(d){if(!fs.existsSync(d))return;for(const e of fs.readdirSync(d,{withFileTypes:true})){const a=path.join(d,e.name);if(e.isDirectory())yield* walk(a);else yield a}}

test('CPU mesh factory preserves source and emits clean/collision artifacts',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-')),src=path.join(root,'x.glb'),out=path.join(root,'out');
  const py=`import trimesh\nm=trimesh.creation.box(extents=(1,1,1));trimesh.Scene(m).export(r"${src.replaceAll('\\','\\\\')}")`;
  let r=cp.spawnSync('python',['-c',py],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const before=fs.statSync(src).size;
  r=cp.spawnSync('python',[path.join(process.cwd(),'scripts/cpu_mesh_factory.py'),src,out],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  assert.equal(fs.statSync(src).size,before);assert.equal(fs.existsSync(path.join(out,'x-clean.glb')),true);
  fs.rmSync(root,{recursive:true,force:true});
});
