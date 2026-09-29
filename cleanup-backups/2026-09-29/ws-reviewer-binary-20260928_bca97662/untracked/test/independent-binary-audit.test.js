'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {auditBinaryAssets}=require('../scripts/independent-binary-audit.cjs');
const {readBlobs}=require('../scripts/git-blob-batch.cjs');
const TYPES=['barren','city','forest','volcano','energy','idea','river','villager'];
const ROOT='apps/voxel-world/voxel-art/';
const sha256=x=>crypto.createHash('sha256').update(x).digest('hex');
function makeGLB(clips=[]){
  const json=JSON.stringify({asset:{version:'2.0'},meshes:[{primitives:[{}]}],
    accessors:[{count:3}],animations:clips.map(name=>({name}))});
  const size=Math.ceil(json.length/4)*4,b=Buffer.alloc(size+20);
  b.write('glTF',0);b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);
  b.writeUInt32LE(size,12);b.writeUInt32LE(0x4e4f534a,16);
  b.write(json,20);for(let i=20+json.length;i<b.length;i++)b[i]=32;
  return b;
}
function makePNG(){
  const b=Buffer.alloc(64);Buffer.from('89504e470d0a1a0a','hex').copy(b);
  b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(128,16);
  b.writeUInt32BE(128,20);return b;
}
function fixture(){
  const manifest={schemaVersion:1,entities:[]},blobs=new Map();
  const add=(p,b)=>blobs.set(p,b);
  for(const id of TYPES){
    const clips={volcano:['eruption_embers'],energy:['rotor_spin'],
      idea:['crystal_pulse'],villager:['walk_left','walk_right']}[id]||[];
    const glb=makeGLB(clips),png=makePNG();
    add(ROOT+id+'.glb',glb);add(ROOT+id+'.png',png);
    manifest.entities.push({id,type:id,file:id+'.glb',sha256:sha256(glb),
      bytes:glb.length,triangles:100,clips,license:'CC0-1.0',
      origin:'World Server original procedural voxel art',
      preview:{file:id+'.png',sha256:sha256(png),bytes:png.length}});
  }
  add(ROOT+'manifest.json',Buffer.from(JSON.stringify(manifest)));
  return blobs;
}
function mockGit(blobs,{rogue=false}={}){
  const entries=new Map();
  for(const [p,b] of blobs){
    const hash=crypto.createHash('sha1').update(
      Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');
    entries.set(p,hash);
  }
  const indexed=new Map([...entries].map(([p,hash])=>[hash,blobs.get(p)]));
  return (args,options={})=>{
    if(args[0]==='diff')return [...blobs.keys()].map(p=>
      p.endsWith('manifest.json')?'30\t0\t'+p:'-\t-\t'+p
    ).concat(rogue?['-\t-\tother/rogue.wav']:[]).join('\n')+'\n';
    if(args[0]==='ls-tree')return [...entries].map(([p,hash])=>
      '100644 blob '+hash+'\t'+p).join('\n')+'\n';
    if(args[0]==='cat-file'){
      const order=options.input.trim().split('\n');
      return Buffer.concat(order.flatMap(hash=>[
        Buffer.from(hash+' blob '+indexed.get(hash).length+'\n'),
        indexed.get(hash),Buffer.from('\n')
      ]));
    }
    throw Error('Unexpected git command: '+args[0]);
  };
}
test('GLB and PNG binary attestations are independent from text diff',()=>{
  const blobs=fixture(),run=mockGit(blobs);
  const report=auditBinaryAssets('a'.repeat(40),'b'.repeat(40),{run});
  assert.equal(report.verdict,'PASS',report.blockers.join('; '));
  assert.equal(report.changed,16);assert.equal(report.glb,8);
  assert.equal(report.png,8);assert.equal(report.assets.length,8);
  assert.deepEqual(report.assets.find(x=>x.id==='villager').clips,
    ['walk_left','walk_right']);
  assert.equal(readBlobs('b'.repeat(40),[ROOT+'manifest.json'],run).size,1);
});
test('tampered PNG and unexpected binary fail closed',()=>{
  const blobs=fixture(),tampered=Buffer.from(blobs.get(ROOT+'city.png'));
  tampered[35]^=0xff;blobs.set(ROOT+'city.png',tampered);
  const changed=auditBinaryAssets('a'.repeat(40),'b'.repeat(40),
    {run:mockGit(blobs)});
  assert.equal(changed.verdict,'INCONCLUSIVE');
  assert.match(changed.blockers.join('; '),/PNG hash mismatch/);
  const unknown=auditBinaryAssets('a'.repeat(40),'b'.repeat(40),
    {run:mockGit(fixture(),{rogue:true})});
  assert.equal(unknown.verdict,'INCONCLUSIVE');
  assert.match(unknown.blockers.join('; '),/Unexpected/);
});
test('reviewer never feeds GLB or PNG binary diffs to external models',()=>{
  const source=fs.readFileSync(path.join(__dirname,
    '../scripts/independent-review-gate.cjs'),'utf8');
  assert.match(source,/:\(exclude,glob\)\*\*\/\*\.glb/);
  assert.match(source,/:\(exclude,glob\)\*\*\/\*\.png/);
  assert.match(source,/auditBinaryAssets\(base,head\)/);
  assert.doesNotMatch(source,/'--binary'/);
});
