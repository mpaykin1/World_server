export const SUPPORTED_GLTF_EXTENSIONS = Object.freeze([
  'EXT_texture_webp',
  'KHR_mesh_quantization'
]);

function freezeEntry(entry) {
  return Object.freeze({
    id: String(entry.id),
    url: String(entry.url),
    license: String(entry.license),
    source: String(entry.source),
    sha256: entry.sha256 ? String(entry.sha256).toLowerCase() : null,
    animations: Object.freeze([...(entry.animations || [])].map(String)),
    extensions: Object.freeze([...(entry.extensions || [])].map(String)),
    lod: String(entry.lod || 'full')
  });
}

export function validateCreatureAsset(entry) {
  if (!entry || typeof entry !== 'object') throw new TypeError('asset entry required');
  for (const key of ['id','url','license','source']) {
    if (!String(entry[key] || '').trim()) throw new Error(`asset ${key} required`);
  }
  if (!/^(\/|https:\/\/)/.test(entry.url)) throw new Error('asset url must be root-relative or https');
  if (entry.sha256 && !/^[a-f0-9]{64}$/i.test(entry.sha256)) throw new Error('asset sha256 invalid');
  const unknown = (entry.extensions || []).filter(x => !SUPPORTED_GLTF_EXTENSIONS.includes(x));
  if (unknown.length) throw new Error(`unsupported glTF extensions: ${unknown.join(',')}`);
  return freezeEntry(entry);
}

export class CreatureAssetRegistry {
  constructor(entries = [], { loader } = {}) {
    this.entries = new Map();
    this.cache = new Map();
    this.inflight = new Map();
    this.loader = loader || null;
    for (const entry of entries) this.register(entry);
  }

  register(entry) {
    const safe = validateCreatureAsset(entry);
    if (this.entries.has(safe.id)) throw new Error(`duplicate creature asset: ${safe.id}`);
    this.entries.set(safe.id, safe);
    return safe;
  }

  get(id) { return this.entries.get(String(id)) || null; }

  async load(id) {
    const key = String(id);
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.inflight.has(key)) return this.inflight.get(key);
    const entry = this.get(key);
    if (!entry) throw new Error(`unknown creature asset: ${key}`);
    if (!this.loader?.loadAsync) throw new Error('GLTFLoader with loadAsync required');
    const pending = this.loader.loadAsync(entry.url).then(asset => {
      this.cache.set(key, asset);
      this.inflight.delete(key);
      return asset;
    }, error => {
      this.inflight.delete(key);
      throw error;
    });
    this.inflight.set(key, pending);
    return pending;
  }

  release(id, dispose = () => {}) {
    const key = String(id);
    const asset = this.cache.get(key);
    if (!asset) return false;
    dispose(asset);
    this.cache.delete(key);
    return true;
  }

  clear(dispose = () => {}) {
    for (const asset of this.cache.values()) dispose(asset);
    this.cache.clear();
    this.inflight.clear();
  }
}
