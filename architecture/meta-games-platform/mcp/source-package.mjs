// A deterministic, read-only source package. Never executes user-provided code on the server.
const MAX_PACKAGE = 2_000_000;
const encoder = new TextEncoder();
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 96;
const validSource = src => src && src.repository === 'mpaykin1/meta6' &&
  /^[a-f0-9]{40}$/.test(src.commit || '') && /^[a-f0-9]{40}$/.test(src.git_blob_sha || '') &&
  typeof src.path === 'string' && !src.path.split('/').some(s => !s || s === '..' || s === '.');
const scriptSafe = source => source.replace(/<[/]script/gi, () => '<' + String.fromCharCode(92) + '/script').replace(/<!--/g, '<' + '!\\u002d-');
export function sourceGate(pkg, assets) {
  if (!pkg || !Array.isArray(pkg.files) || !Array.isArray(pkg.provenance?.assets) ||
      !pkg.provenance.assets.length || !pkg.files.some(f => f.path === 'index.html' && typeof f.content === 'string') ||
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
      Object.keys(args).some(k => k !== 'asset_ids')) return null;
  const approved = new Map(assets.map(a => [a.id, a]));
  const scripts = [], provenance = [];
  for (const id of args.asset_ids) {
    const asset = approved.get(id);
    if (!asset || !validSource(asset.source) || !/\.(js|mjs)$/i.test(asset.source.path)) return null;
    const blob = await readSource(id);
    if (!blob || blob.encoding !== 'utf-8' || blob.source_blob_sha !== asset.source.git_blob_sha ||
        blob.source_commit !== asset.source.commit || typeof blob.content !== 'string') return null;
    scripts.push(scriptSafe(blob.content));
    provenance.push({id, source:asset.source});
  }
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>META GAMES source composition</title></head><body>' +
    '<main id="game"></main>' +
    scripts.map(s => '<script type="module">' + s + '</script>').join('') + '</body></html>';
  const pkg = {files:[{path:'index.html',content:html}],provenance:{assets:provenance},visual_layers:[]};
  return sourceGate(pkg, assets) ? pkg : null;
}
export function previewSourcePackage(pkg, assets) {
  if (!sourceGate(pkg, assets)) return null;
  const html = pkg.files.find(f => f.path === 'index.html').content;
  return {mime_type:'text/html',html,provenance:pkg.provenance};
}
