const fs=require('fs');
const p='C:/Users/user/Desktop/ws_blocky_tmp/assets/characters/kaykit-knight/model/Knight.glb';
const d=fs.readFileSync(p);
const n=d.readUInt32LE(12);
const j=JSON.parse(d.subarray(20,20+n).toString('utf8').trim());
for(let i=0;i<j.nodes.length;i++){const name=j.nodes[i].name||'';if(/head|spine|arm|hand|leg|foot|hips|pelvis|neck/i.test(name))console.log(i+':'+name);}
