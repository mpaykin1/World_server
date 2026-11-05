'use strict';
const { createHash } = require('node:crypto');
const { validateGameArtifact } = require('./game-validation.cjs');
const names = ['data/pipeline.json','data/provenance.json','game.js','index.html',
  'shaders/atmosphere-fragment.glsl','shaders/atmosphere-vertex.glsl'];
// Read-only delivery proof for the existing Pages repository. Not a publisher,
// browser/rights approval, or proof that a caller-supplied release SHA was merged.
async function verifyPublicDelivery(artifact, { fetchImpl = fetch } = {}) {
  const denied = reason => ({ delivery:'not_verified', reason,
    browser:'not_run', rights:'not_verified', publication:'not_published' });
  if (!validateGameArtifact(artifact).integrity) return denied('invalid_artifact');
  const id = artifact.manifest.game_id;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 80 ||
      JSON.stringify(Object.keys(artifact.files).sort()) !== JSON.stringify(names))
    return denied('unsupported_package');
  const files = { ...artifact.files, 'manifest.json':JSON.stringify({
    ...artifact.manifest, manifest_sha256:artifact.manifest_sha256 }, null, 2)+'\n' };
  const expected = Object.entries(files).map(([name,text])=>[name,Buffer.from(text,'utf8')]);
  if (expected.some(([,b])=>b.length>1048576) ||
      expected.reduce((n,[,b])=>n+b.length,0)>2097152) return denied('package_budget');
  const url = 'https://mpaykin1.github.io/meta6/meta-games-worlds/'+id+'/';
  const verified=[];
  for (const [name,bytes] of expected) {
    try {
      const response = await fetchImpl(url+name+'?manifest='+artifact.manifest_sha256,
        {method:'GET',redirect:'error',credentials:'omit',
          headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(5000)});
      if (response.status!==200 || response.redirected || !response.body)
        return denied('http_or_redirect');
      const reader=response.body.getReader();
      const chunks=[];let size=0;
      for (;;) {
        const {done,value}=await reader.read();if(done)break;
        size+=value.byteLength;
        if(size>bytes.length){await reader.cancel();return denied('byte_mismatch');}
        chunks.push(Buffer.from(value));
      }
      const received=Buffer.concat(chunks,size);
      if (!received.equals(bytes)) return denied('byte_mismatch');
      verified.push({path:name,bytes:size,sha256:createHash('sha256').update(received).digest('hex')});
    } catch { return denied('network_or_timeout'); }
  }
  return {delivery:'verified',url,source_commit:artifact.manifest.source_commit,
    manifest_sha256:artifact.manifest_sha256,files:verified,
    browser:'not_run',rights:'not_verified',publication:'not_published',
    scope:'Public bytes only; merge, rights and browser acceptance require separate trusted evidence.'};
}
module.exports={verifyPublicDelivery};
