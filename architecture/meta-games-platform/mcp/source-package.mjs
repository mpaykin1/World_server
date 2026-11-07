import { donor, readApprovedPlayableDonor } from './approved-playable-donor.mjs';
// A deterministic, read-only source package. Never executes user-provided code on the server.
const MAX_PACKAGE = 2_000_000;
const encoder = new TextEncoder();
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 96;
const validSource = src => src && src.repository === 'mpaykin1/meta6' &&
  /^[a-f0-9]{40}$/.test(src.commit || '') && /^[a-f0-9]{40}$/.test(src.git_blob_sha || '') &&
  typeof src.path === 'string' && !src.path.split('/').some(s => !s || s === '..' || s === '.');
// Do not rewrite reference source. Reject HTML parser terminators instead.
const scriptSafe = source => !/<\/script|<!--/i.test(source);

export function sourceGate(pkg, assets) {
  if (!pkg || !Array.isArray(pkg.files) || !Array.isArray(pkg.provenance?.assets) ||
      !pkg.provenance.assets.length || JSON.stringify(pkg.provenance.game) !== JSON.stringify(donor) ||
      (pkg.seed !== undefined && (typeof pkg.seed !== 'string' || pkg.seed.length > 128)) ||
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
      Object.keys(args).some(k => !['asset_ids','seed'].includes(k)) ||
      (args.seed !== undefined && (typeof args.seed !== 'string' || args.seed.length > 128)) ||
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
  // Build on a verified, fully playable WebGL2 original. Never fabricate game code.
  const playable = await readApprovedPlayableDonor();
  if (!playable) return null;
  const attachments = scripts.map(source => '<script type="module">' + source + '</script>').join('');
  const html = playable.html.replace(/<\/body>\s*<\/html>\s*$/i, attachments + '</body></html>');
  if (html === playable.html || !html.includes(attachments)) return null;
  const pkg = {
    files:[{path:'index.html',content:html}],
    provenance:{game:playable.provenance,assets:provenance},
    visual_layers:[],seed:args.seed ?? ''
  };
  return sourceGate(pkg, assets) ? pkg : null;
}
export function previewSourcePackage(pkg, assets) {
  if (!sourceGate(pkg, assets)) return null;
  const html = pkg.files.find(f => f.path === 'index.html').content;
  return {mime_type:'text/html',html,provenance:pkg.provenance};
}
