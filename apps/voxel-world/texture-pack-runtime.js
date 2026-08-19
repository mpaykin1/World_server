const GRID = 4;
const TILE_SIZE = 256;

// Tile index intentionally equals voxel block id, so the mesher can pass the
// existing block id straight into the shader without changing persistence.
export const DEFAULT_BLOCK_TEXTURES = Object.freeze({
  1:  { name: 'Grass 2',       color: 10537355437, fallback: '#5f9f43' },
  2:  { name: 'Dirt 1',        color: 8444110739,  fallback: '#795238' },
  3:  { name: 'Rock',          color: 8395168449,  fallback: '#777d82' },
  4:  { name: 'Sand 1',        color: 10148508048, fallback: '#d8c17a' },
  5:  { name: 'Bark',          color: 10411024450, fallback: '#80522e' },
  7:  { name: 'Snow',          color: 7547315875,  fallback: '#e9f4ff' },
  10: { name: 'Brick 6',       color: 9596572755,  fallback: '#a44c3d' },
  11: { name: 'WoodPlanks',    color: 8757049572,  fallback: '#b6884d' },
  12: { name: 'Charcoal',      color: 11256557264, fallback: '#35383b' },
  13: { name: 'Scuffed Iron',  color: 12483803519, fallback: '#b7a89b' }
});

function textureUrl(assetId) {
  return `/api/roblox-texture?id=${encodeURIComponent(assetId)}`;
}

async function fetchBitmap(assetId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(textureUrl(assetId), {
      signal: controller.signal,
      cache: 'force-cache',
      credentials: 'same-origin'
    });
    if (!response.ok) throw new Error(`texture ${assetId}: HTTP ${response.status}`);
    const blob = await response.blob();
    return await createImageBitmap(blob);
  } finally {
    clearTimeout(timer);
  }
}

function drawFallback(ctx, blockId, fallback) {
  const col = blockId % GRID;
  const row = Math.floor(blockId / GRID);
  ctx.fillStyle = fallback || '#808080';
  ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
}

function drawBitmap(ctx, blockId, bitmap) {
  const col = blockId % GRID;
  const row = Math.floor(blockId / GRID);
  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;
  // A 2px inset reduces edge bleed while preserving a full seamless tile.
  ctx.drawImage(bitmap, x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  ctx.drawImage(bitmap, 0, 0, 1, bitmap.height, x, y + 2, 2, TILE_SIZE - 4);
  ctx.drawImage(bitmap, bitmap.width - 1, 0, 1, bitmap.height, x + TILE_SIZE - 2, y + 2, 2, TILE_SIZE - 4);
  ctx.drawImage(bitmap, 0, 0, bitmap.width, 1, x + 2, y, TILE_SIZE - 4, 2);
  ctx.drawImage(bitmap, 0, bitmap.height - 1, bitmap.width, 1, x + 2, y + TILE_SIZE - 2, TILE_SIZE - 4, 2);
}

function installAtlasShader(material) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float atlasTile;\nvarying float vVoxelAtlasTile;'
      )
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvVoxelAtlasTile = atlasTile;'
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vVoxelAtlasTile;
vec2 voxelAtlasUv(vec2 uv, float tile) {
  float grid = ${GRID.toFixed(1)};
  float t = floor(tile + 0.5);
  vec2 cell = vec2(mod(t, grid), floor(t / grid));
  // fract() preserves texture repetition across greedy-meshed rectangles.
  vec2 repeated = fract(uv);
  float inset = 2.0 / ${TILE_SIZE.toFixed(1)};
  repeated = mix(vec2(inset), vec2(1.0 - inset), repeated);
  return (cell + repeated) / grid;
}`
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D(map, voxelAtlasUv(vMapUv, vVoxelAtlasTile));
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif`
      );
  };

  material.customProgramCacheKey = () => 'voxel-roblox-atlas-v1';
  material.needsUpdate = true;
}

export async function initVoxelTexturePack({ THREE, renderer, material }) {
  if (!THREE || !renderer || !material) throw new Error('Voxel texture pack: missing renderer/material');

  const canvas = document.createElement('canvas');
  canvas.width = GRID * TILE_SIZE;
  canvas.height = GRID * TILE_SIZE;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let blockId = 0; blockId < GRID * GRID; blockId++) {
    drawFallback(ctx, blockId, DEFAULT_BLOCK_TEXTURES[blockId]?.fallback || '#808080');
  }

  let loaded = 0;
  const jobs = Object.entries(DEFAULT_BLOCK_TEXTURES).map(async ([id, spec]) => {
    const blockId = Number(id);
    try {
      const bitmap = await fetchBitmap(spec.color);
      drawBitmap(ctx, blockId, bitmap);
      bitmap.close?.();
      loaded++;
    } catch (error) {
      console.warn(`[Voxel World] texture fallback for ${spec.name}`, error);
    }
  });

  await Promise.allSettled(jobs);

  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.wrapS = THREE.ClampToEdgeWrapping;
  atlas.wrapT = THREE.ClampToEdgeWrapping;
  atlas.generateMipmaps = false;
  atlas.minFilter = THREE.LinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  const maxAniso = renderer.capabilities?.getMaxAnisotropy?.() || 1;
  atlas.anisotropy = Math.min(8, maxAniso);
  atlas.needsUpdate = true;

  material.map = atlas;
  material.roughness = 0.88;
  material.metalness = 0.02;
  installAtlasShader(material);
  material.needsUpdate = true;

  console.info(`[Voxel World] Roblox texture pack ready: ${loaded}/${Object.keys(DEFAULT_BLOCK_TEXTURES).length} runtime textures; 1313 variants catalogued.`);
  return { atlas, loaded, total: Object.keys(DEFAULT_BLOCK_TEXTURES).length };
}
