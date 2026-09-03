'use strict';const fs=require('fs'),path=require('path'),crypto=require('crypto');
const H=b=>crypto.createHash('sha256').update(b).digest('hex');
function hashFile(f){return H(fs.readFileSync(f))}
function envelope(root,pkg){const dir=pkg.dir||path.join(root,'world-functions',pkg.manifest.id);const gdd=path.join(root,'game-design/IMPROVE_WORLD_GAME_DESIGN_BASELINE.json');const acceptance=path.join(root,'WORLD_GAME_DESIGN_ACCEPTANCE.json');return{schemaVersion:'6.0.0',functionId:pkg.manifest.id,version:pkg.manifest.version,manifestSha256:hashFile(path.join(dir,'manifest.json')),sourceSha256:hashFile(path.join(dir,'handler.js')),gddSha256:fs.existsSync(gdd)?hashFile(gdd):null,acceptanceSha256:fs.existsSync(acceptance)?hashFile(acceptance):null,capabilities:pkg.manifest.capabilities,gameDesignSections:pkg.manifest.gameDesignSections,installMode:pkg.manifest.installMode,rollbackSafe:pkg.manifest.rollbackSafe===true}}
function digestEnvelope(e){return H(Buffer.from(JSON.stringify(e)))}
module.exports={envelope,digestEnvelope,hashFile};
