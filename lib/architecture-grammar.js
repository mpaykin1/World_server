'use strict';

const crypto = require('crypto');

function unit(seed, lane) {
  const hex = crypto.createHash('sha256').update(`${seed}:${lane}`, 'utf8').digest('hex').slice(0, 12);
  return parseInt(hex, 16) / 0xffffffffffff;
}

function cellIndex(x, y, width) { return y * width + x; }

function normalizeRules(tileCount, adjacency = {}) {
  const all = Array.from({ length: tileCount }, (_, index) => index);
  return Array.from({ length: tileCount }, (_, tile) => {
    const row = adjacency[tile];
    return Array.isArray(row) && row.length ? [...new Set(row.filter(n => n >= 0 && n < tileCount))] : all;
  });
}

function propagate(domains, width, height, rules) {
  const queue = domains.map((_, index) => index);
  while (queue.length) {
    const index = queue.shift();
    const x = index % width, y = Math.floor(index / width);
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = cellIndex(nx, ny, width);
      const allowed = new Set(domains[index].flatMap(tile => rules[tile]));
      const next = domains[ni].filter(tile => allowed.has(tile));
      if (!next.length) return false;
      if (next.length !== domains[ni].length) {
        domains[ni] = next;
        queue.push(ni);
      }
    }
  }
  return true;
}

function weightedPick(seed, lane, domain, weights) {
  const entries = domain.map(tile => ({ tile, weight: Math.max(0.001, Number(weights[tile]) || 1) }));
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = unit(seed, lane) * total;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.tile;
  }
  return entries.at(-1).tile;
}

function collapseGrid({ seedKey, width, height, tiles, adjacency, weights, fixed = [] }) {
  const w = Math.max(1, Math.min(24, Math.floor(Number(width) || 1)));
  const h = Math.max(1, Math.min(24, Math.floor(Number(height) || 1)));
  const names = Array.isArray(tiles) ? tiles.slice(0, 16).map(String) : [];
  if (!names.length) throw new TypeError('tiles are required');
  const rules = normalizeRules(names.length, adjacency);
  const domains = Array.from({ length: w * h }, () => names.map((_, index) => index));
  for (const item of fixed) {
    const x = Math.floor(Number(item?.x)), y = Math.floor(Number(item?.y));
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const allowed = (item.allowed || []).filter(tile => Number.isInteger(tile) && tile >= 0 && tile < names.length);
    if (allowed.length) domains[cellIndex(x, y, w)] = [...new Set(allowed)];
  }
  if (!propagate(domains, w, h, rules)) throw new Error('architecture grammar contradiction');

  for (let step = 0; step < domains.length; step++) {
    let best = -1, entropy = Infinity;
    for (let i = 0; i < domains.length; i++) {
      const size = domains[i].length;
      if (size > 1 && size < entropy) { best = i; entropy = size; }
    }
    if (best < 0) break;
    const chosen = weightedPick(seedKey, `collapse:${step}:${best}`, domains[best], weights || []);
    domains[best] = [chosen];
    if (!propagate(domains, w, h, rules)) throw new Error('architecture grammar collapsed into contradiction');
  }
  return {
    width: w, height: h,
    cells: domains.map(domain => names[domain[0]]),
    rows: Array.from({ length: h }, (_, y) => domains.slice(y * w, (y + 1) * w).map(domain => names[domain[0]]))
  };
}

function collapseFacadeGrid(dna, recipe, options = {}) {
  const tiles = (dna?.grammar?.facade || []).slice(0, 3);
  if (tiles.length < 2) return { width: 1, height: 1, cells: [tiles[0] || 'facade'], rows: [[tiles[0] || 'facade']] };
  const width = Math.max(3, Math.min(12, Math.floor(Number(options.width) || recipe?.facade?.length || 5)));
  const height = Math.max(2, Math.min(12, Math.floor(Number(options.height) || recipe?.floors || 4)));
  const accent = tiles.length - 1;
  const all = tiles.map((_, index) => index);
  const adjacency = Object.fromEntries(all.map(index => [index, index === accent ? all.filter(x => x !== accent) : all]));
  const fixed = [];
  for (let x = 0; x < width; x++) fixed.push({ x, y: 0, allowed: all.filter(index => index !== accent) });
  fixed.push({ x: Math.floor(width / 2), y: height - 1, allowed: [accent] });
  return collapseGrid({
    seedKey: `${dna.seedKey}:facade:${recipe?.family || dna.primaryFamily}:${recipe?.district || 'district'}`,
    width, height, tiles, adjacency, weights: [0.55, 0.3, 0.15], fixed
  });
}

module.exports = { collapseGrid, collapseFacadeGrid };
