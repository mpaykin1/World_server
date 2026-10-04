(function(){
  'use strict';

  const CACHE = new Map();

  function loadImage(url) {
    if (CACHE.has(url)) return CACHE.get(url);
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Minecraft seed atlas image failed to load'));
      image.src = url;
    });
    CACHE.set(url, promise);
    return promise;
  }

  async function loadJson(url) {
    const key = 'json:' + url;
    if (CACHE.has(key)) return CACHE.get(key);
    const promise = fetch(url, { credentials:'same-origin' }).then(response => {
      if (!response.ok) throw new Error('Minecraft seed atlas metadata HTTP ' + response.status);
      return response.json();
    });
    CACHE.set(key, promise);
    return promise;
  }

  async function apply({ texture, profile, targetColumns = 4, targetTile = 64 }) {
    const blockAtlas = profile?.blockAtlas;
    const palette = blockAtlas?.palette;
    if (!texture?.image || !Array.isArray(palette) || palette.length < 13) return false;
    const imageUrl = blockAtlas.imageUrl;
    const metadataUrl = blockAtlas.metadataUrl;
    if (!imageUrl || !metadataUrl) return false;

    const [source, metadata] = await Promise.all([loadImage(imageUrl), loadJson(metadataUrl)]);
    const sourceColumns = Number(metadata.columns) || Number(blockAtlas.columns) || 32;
    const sourceTile = Number(metadata.tile) || Number(blockAtlas.tile) || 16;
    const canvas = texture.image;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const entry of palette.slice(0, 13)) {
      const slot = Number(entry.slot);
      const index = Number(entry.index);
      if (!Number.isInteger(slot) || slot < 1 || slot > 13 || !Number.isInteger(index) || index < 0) continue;
      const sourceX = (index % sourceColumns) * sourceTile;
      const sourceY = Math.floor(index / sourceColumns) * sourceTile;
      const tile = slot - 1;
      const targetX = (tile % targetColumns) * targetTile;
      const targetY = Math.floor(tile / targetColumns) * targetTile;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(source, sourceX, sourceY, sourceTile, sourceTile, targetX, targetY, targetTile, targetTile);
    }

    texture.needsUpdate = true;
    texture.userData.minecraftSeedPalette = true;
    texture.userData.minecraftSeedProvider = profile.provider || 'unknown';
    texture.userData.minecraftSourceCommit = profile.sourceCommit || null;
    return true;
  }

  window.MinecraftSeedPaletteRuntime = { apply };
})();