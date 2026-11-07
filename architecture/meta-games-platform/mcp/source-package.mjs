import {donor,readApprovedPlayableDonor} from './approved-playable-donor.mjs';
// A deterministic, read-only source package. Never executes user-provided code on the server.
const MAX_PACKAGE = 2_000_000;
const encoder = new TextEncoder();
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 96;
const validSource = src => src && src.repository === 'mpaykin1/meta6' &&
  /^[a-f0-9]{40}$/.test(src.commit || '') && /^[a-f0-9]{40}$/.test(src.git_blob_sha || '') &&
  typeof src.path === 'string' && !src.path.split('/').some(s => !s || s === '..' || s === '.');
// Do not rewrite reference source. Reject HTML parser terminators instead.
const scriptSafe = source => !/<\/script|<!--/i.test(source);

// Serialize a full verified game into one offline HTML without transferring the
// large source over the public MCP validation request limit.
async function compactPlayableHtml(html) {
  if (typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function') return null;
  const source = encoder.encode(html);
  if (source.byteLength > MAX_PACKAGE) return null;
  const encoded = await new Response(
    new Blob([source]).stream().pipeThrough(new CompressionStream('gzip'))
  ).arrayBuffer();
  const zip = new Uint8Array(encoded);
  let binary = '';
  for (let i = 0; i < zip.length; i += 8192) {
    binary += String.fromCharCode(...zip.subarray(i, i + 8192));
  }
  const data = btoa(binary);
  return '<!doctype html><html lang="en"><meta charset="utf-8"><body><script>' +
    '(async()=>{const b=Uint8Array.from(atob("' + data + '"),c=>c.charCodeAt(0));' +
    'const s=new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"));' +
    'const h=await new Response(s).text();document.open();document.write(h);document.close();' +
    '})().catch(()=>{document.body.textContent="Game could not start.";});' +
    '</script></body></html>';
}

// Fallback for incompressible games: an online-only bootloader that fetches
// exclusively owner-granted, SHA-pinned original files. It never trusts URLs
// supplied by the requesting client and verifies each downloaded Git blob.
function pinnedNetworkBoot(provenance) {
  const refs = [{source:donor}, ...provenance];
  const locations = refs.map(({source}) => ({
    url:'https://raw.githubusercontent.com/' + source.repository + '/' + source.commit + '/' + source.path,
    sha:source.git_blob_sha
  }));
  const records = JSON.stringify(locations);
  return '<!doctype html><html lang="en"><meta charset="utf-8"><body><script>' +
    '(async()=>{const refs=' + records + ';' +
    'async function read(p){const r=await fetch(p.url,{redirect:"error"});if(!r.ok)throw Error("source unavailable");' +
    'const b=new Uint8Array(await r.arrayBuffer()),e=new TextEncoder();' +
    'const h=e.encode("blob "+b.length+String.fromCharCode(0)),d=new Uint8Array(h.length+b.length);' +
    'd.set(h);d.set(b,h.length);const dig=await crypto.subtle.digest("SHA-1",d);' +
    'const sha=Array.from(new Uint8Array(dig),x=>x.toString(16).padStart(2,"0")).join("");' +
    'if(sha!==p.sha)throw Error("source integrity mismatch");' +
    'return new TextDecoder("utf-8",{fatal:true}).decode(b);}' +
    'const files=await Promise.all(refs.map(read));document.open();document.write(files[0]);document.close();' +
    'for(const code of files.slice(1)){const el=document.createElement("script");' +
    'el.type="module";el.textContent=code;document.body.appendChild(el);}' +
    '})().catch(()=>{document.body.textContent="Verified game source unavailable.";});' +
    '</script></body></html>';
}

export function sourceGate(pkg, assets) {
  if (!pkg || !Array.isArray(pkg.files) || !Array.isArray(pkg.provenance?.assets) ||
      !pkg.provenance.assets.length ||
      JSON.stringify(pkg.provenance.game) !== JSON.stringify(donor) ||
      (pkg.provenance.seed !== undefined && (typeof pkg.provenance.seed !== 'string' ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(pkg.provenance.seed))) ||
      !pkg.files.some(f => f.path === 'index.html' && typeof f.content === 'string') ||
      pkg.files.some(f => f?.path !== 'index.html' || typeof f.content !== 'string') ||
      !Array.isArray(pkg.visual_layers) || pkg.visual_layers.some(layer => layer?.origin === 'engine_generated')) return false;
  const approved = new Map(assets.map(a => [a.id, a]));
  if (new Set(pkg.provenance.assets.map(p => p?.id)).size !== pkg.provenance.assets.length) return false;
  return pkg.provenance.assets.every(p => {
    const a = p && approved.get(p.id);
    return a && a.reuse_allowed === true && a.redistribution_allowed === true &&
      a.license_status === 'verified' && a.dependencies_verified === true &&
      validSource(p.source) && JSON.stringify(p.source) === JSON.stringify(a.source);
  }) && encoder.encode(JSON.stringify(pkg)).byteLength <= MAX_PACKAGE;
}
export async function createSourcePackage(args, assets, readSource) {
  if (!args || !Array.isArray(args.asset_ids) || args.asset_ids.length < 1 ||
      args.asset_ids.length > 20 || args.asset_ids.some(id => !validId(id)) ||
      new Set(args.asset_ids).size !== args.asset_ids.length ||
      Object.keys(args).some(k => !['asset_ids', 'seed'].includes(k)) ||
      (args.seed !== undefined && (typeof args.seed !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(args.seed))) ||
      encoder.encode(JSON.stringify(args)).byteLength > 8192) return null;
  const approved = new Map(assets.map(a => [a.id, a]));
  const scripts = [], provenance = [];
  for (const id of args.asset_ids) {
    const asset = approved.get(id);
    if (!asset || !validSource(asset.source) || !/\.(js|mjs)$/i.test(asset.source.path)) return null;
    const blob = await readSource(id);
    if (!blob || blob.encoding !== 'utf-8' || blob.source_blob_sha !== asset.source.git_blob_sha ||
        blob.source_commit !== asset.source.commit || typeof blob.content !== 'string') return null;
    if (!scriptSafe(blob.content)) return null;
    scripts.push(blob.content);
    provenance.push({id, source:asset.source});
  }
  // Preserve the exact owner-approved WebGL2 donor as the functional game,
  // wrapping it only with independently licensed, byte-identical source modules.
  const playable = await readApprovedPlayableDonor();
  if (!playable) return null;
  const seed = args.seed;
  const withSeed = seed === undefined ? playable.html :
    playable.html.replace(/<\/head>/i, () => '<meta name="meta-games-seed" content="' + seed + '"></head>');
  const attachments = scripts.map(source => '<script type="module">' + source + '</script>').join('');
  const fullHtml = withSeed.replace(/<\/body>\s*<\/html>\s*$/i, () => attachments + '</body></html>');
  if (fullHtml === withSeed || !fullHtml.includes(attachments)) return null;
  const offline = await compactPlayableHtml(fullHtml);
  const metadata = {game:playable.provenance,assets:provenance,...(seed === undefined ? {} : {seed})};
  let pkg = {files:[{path:'index.html',content:offline || ''}],
    provenance:{...metadata,delivery:'offline-gzip'},visual_layers:[]};
  // A large original cannot cross the strict MCP tool argument limit.
  // Instead return a playable, *online-only*, verified-source loader, whose
  // exact donor and asset SHA hashes are still checked client-side and server-side.
  if (!offline || encoder.encode(JSON.stringify({package:pkg})).byteLength > 8192) {
    pkg = {files:[{path:'index.html',content:pinnedNetworkBoot(provenance)}],
      provenance:{...metadata,delivery:'network-verified'},visual_layers:[]};
  }
  if (encoder.encode(JSON.stringify({package:pkg})).byteLength > 8192) return null;
  return sourceGate(pkg, assets) ? pkg : null;
}
export function previewSourcePackage(pkg, assets) {
  if (!sourceGate(pkg, assets)) return null;
  const html = pkg.files.find(f => f.path === 'index.html').content;
  return {mime_type:'text/html',html,provenance:pkg.provenance};
}
