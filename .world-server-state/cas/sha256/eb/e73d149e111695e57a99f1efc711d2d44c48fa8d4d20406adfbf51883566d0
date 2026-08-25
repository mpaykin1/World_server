'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function snapshotFiles(root,files){const items=[];for(const rel of files){const p=path.join(root,rel);if(!fs.existsSync(p)){items.push({path:rel,missing:true});continue;}const data=fs.readFileSync(p);items.push({path:rel,size:data.length,sha256:sha(data),data:data.toString('base64')});}return {format:'quality-backup-v10',createdAt:new Date().toISOString(),items};}
function restoreSnapshot(snapshot,dest){for(const i of snapshot.items||[]){if(i.missing)continue;const p=path.join(dest,i.path);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,Buffer.from(i.data,'base64'));}return verifyRestore(snapshot,dest);}
function verifyRestore(snapshot,dest){const failures=[];for(const i of snapshot.items||[]){if(i.missing)continue;const p=path.join(dest,i.path);if(!fs.existsSync(p)||sha(fs.readFileSync(p))!==i.sha256)failures.push(i.path);}return {ok:failures.length===0,status:failures.length?'HOLD':'PASS',failures};}
module.exports={snapshotFiles,restoreSnapshot,verifyRestore};
