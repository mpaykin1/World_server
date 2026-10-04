const SIDES = ["front", "back", "left", "right", "top", "bottom"];
const SIDE_SET = new Set(SIDES);

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const key3 = (x, y, z) => `${x}:${y}:${z}`;

function assertInt(name, value, min = 1) {
  if (!Number.isInteger(value) || value < min) throw new TypeError(`${name} must be an integer >= ${min}`);
}

function normalizePixels(view) {
  const src = view.data ?? view.pixels ?? view.rgba;
  if (!src || typeof src.length !== "number") throw new TypeError(`view ${view.side}: RGBA pixel data is required`);
  const expected = view.width * view.height * 4;
  if (src.length !== expected) throw new RangeError(`view ${view.side}: expected ${expected} RGBA values, got ${src.length}`);
  return src;
}

export function normalizeProjectionView(view) {
  if (!view || !SIDE_SET.has(view.side)) throw new TypeError(`view.side must be one of: ${SIDES.join(", ")}`);
  assertInt("view.width", view.width);
  assertInt("view.height", view.height);
  return { ...view, data: normalizePixels(view) };
}

function scaleCoord(position, sourceLength, targetLength) {
  if (sourceLength <= 1 || targetLength <= 1) return 0;
  return clamp(Math.round((position / (sourceLength - 1)) * (targetLength - 1)), 0, targetLength - 1);
}

function samplePixel(view, x, y, alphaThreshold) {
  const sx = clamp(x, 0, view.width - 1);
  const sy = clamp(y, 0, view.height - 1);
  const i = (sy * view.width + sx) * 4;
  const a = view.data[i + 3];
  return { opaque: a > alphaThreshold, rgba: [view.data[i], view.data[i + 1], view.data[i + 2], a] };
}

function sampleProjection(view, dims, x, y, z, alphaThreshold) {
  const flippedY = dims.height - 1 - y;
  switch (view.side) {
    case "front":
      return samplePixel(view, scaleCoord(x, dims.width, view.width), scaleCoord(flippedY, dims.height, view.height), alphaThreshold);
    case "back":
      return samplePixel(view, scaleCoord(dims.width - 1 - x, dims.width, view.width), scaleCoord(flippedY, dims.height, view.height), alphaThreshold);
    case "left":
      return samplePixel(view, scaleCoord(dims.depth - 1 - z, dims.depth, view.width), scaleCoord(flippedY, dims.height, view.height), alphaThreshold);
    case "right":
      return samplePixel(view, scaleCoord(z, dims.depth, view.width), scaleCoord(flippedY, dims.height, view.height), alphaThreshold);
    case "top":
      return samplePixel(view, scaleCoord(x, dims.width, view.width), scaleCoord(z, dims.depth, view.height), alphaThreshold);
    case "bottom":
      return samplePixel(view, scaleCoord(x, dims.width, view.width), scaleCoord(dims.depth - 1 - z, dims.depth, view.height), alphaThreshold);
    default:
      throw new Error(`unsupported side ${view.side}`);
  }
}

export function inferVoxelDimensions(viewsInput, maxAxis = 96) {
  assertInt("maxAxis", maxAxis);
  const views = viewsInput.map(normalizeProjectionView);
  const bySide = Object.fromEntries(views.map((view) => [view.side, view]));
  const front = bySide.front ?? bySide.back;
  const side = bySide.left ?? bySide.right;
  const top = bySide.top ?? bySide.bottom;
  const raw = {
    width: front?.width ?? top?.width ?? side?.width ?? 32,
    height: front?.height ?? side?.height ?? top?.height ?? 32,
    depth: side?.width ?? top?.height ?? Math.max(1, Math.round((front?.width ?? 32) * 0.5))
  };
  const largest = Math.max(raw.width, raw.height, raw.depth);
  const scale = largest > maxAxis ? maxAxis / largest : 1;
  return {
    width: Math.max(1, Math.round(raw.width * scale)),
    height: Math.max(1, Math.round(raw.height * scale)),
    depth: Math.max(1, Math.round(raw.depth * scale))
  };
}

function averageRgb(samples) {
  const visible = samples.filter((s) => s.opaque);
  if (!visible.length) return [0, 0, 0];
  const sum = visible.reduce((acc, s) => {
    acc[0] += s.rgba[0]; acc[1] += s.rgba[1]; acc[2] += s.rgba[2];
    return acc;
  }, [0, 0, 0]);
  return sum.map((v) => Math.round(v / visible.length));
}

function rgbInt(rgb) { return ((rgb[0] & 255) << 16) | ((rgb[1] & 255) << 8) | (rgb[2] & 255); }
function rgbHex(rgb) { return `#${rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`; }

function quantizeRgb(rgb, bitsPerChannel) {
  const bits = clamp(Math.round(bitsPerChannel), 1, 8);
  const levels = (1 << bits) - 1;
  return rgb.map((v) => Math.round(Math.round((v / 255) * levels) * 255 / levels));
}

function faceColorSamples(samplesBySide, fallback) {
  const choose = (names) => {
    for (const name of names) {
      const sample = samplesBySide.get(name);
      if (sample?.opaque) return sample.rgba.slice(0, 3);
    }
    return fallback;
  };
  return {
    px: choose(["right", "left"]), nx: choose(["left", "right"]),
    py: choose(["top", "bottom"]), ny: choose(["bottom", "top"]),
    pz: choose(["front", "back"]), nz: choose(["back", "front"])
  };
}

function rowCompatibility(views, dims, alphaThreshold) {
  const verticalViews = views.filter((v) => ["front", "back", "left", "right"].includes(v.side));
  if (verticalViews.length < 2) return { incompatibleRows: [], compatibleRows: dims.height };
  const incompatibleRows = [];
  for (let y = 0; y < dims.height; y++) {
    const x = Math.floor(dims.width / 2), z = Math.floor(dims.depth / 2);
    const occupancyByView = verticalViews.map((view) => {
      let any = false;
      if (view.side === "front" || view.side === "back") {
        for (let xx = 0; xx < dims.width && !any; xx++) any = sampleProjection(view, dims, xx, y, z, alphaThreshold).opaque;
      } else {
        for (let zz = 0; zz < dims.depth && !any; zz++) any = sampleProjection(view, dims, x, y, zz, alphaThreshold).opaque;
      }
      return any;
    });
    if (occupancyByView.some(Boolean) && occupancyByView.some((v) => !v)) incompatibleRows.push(y);
  }
  return { incompatibleRows, compatibleRows: dims.height - incompatibleRows.length };
}

export function reconstructVoxelModel(viewsInput, options = {}) {
  const views = viewsInput.map(normalizeProjectionView);
  if (views.length < 1) throw new RangeError("at least one projection view is required");
  const uniqueSides = new Set(views.map((v) => v.side));
  if (uniqueSides.size !== views.length) throw new RangeError("projection sides must be unique");

  const maxAxis = options.maxAxis ?? 96;
  const alphaThreshold = options.alphaThreshold ?? 12;
  const bitsPerChannel = options.paletteBitsPerChannel ?? 5;
  const dims = inferVoxelDimensions(views, maxAxis);
  const voxels = [];
  const palette = [];
  const paletteMap = new Map();
  const faceColors = {};

  const paletteIndex = (rgb) => {
    const q = quantizeRgb(rgb, bitsPerChannel);
    const n = rgbInt(q);
    if (!paletteMap.has(n)) { paletteMap.set(n, palette.length); palette.push(n); }
    return paletteMap.get(n);
  };

  for (let y = 0; y < dims.height; y++) {
    for (let z = 0; z < dims.depth; z++) {
      for (let x = 0; x < dims.width; x++) {
        const samplesBySide = new Map();
        for (const view of views) samplesBySide.set(view.side, sampleProjection(view, dims, x, y, z, alphaThreshold));
        const samples = [...samplesBySide.values()];
        if (!samples.every((sample) => sample.opaque)) continue;
        const avg = averageRgb(samples);
        const pi = paletteIndex(avg);
        voxels.push([x, y, z, pi]);
        if (options.includeFaceColors !== false) {
          const fc = faceColorSamples(samplesBySide, avg);
          faceColors[key3(x, y, z)] = Object.fromEntries(Object.entries(fc).map(([k, rgb]) => [k, rgbHex(rgb)]));
        }
      }
    }
  }

  const model = {
    schema: "world-server-pixel3d-model-v1",
    generator: "World Server Pixel2World clean-room visual hull v1",
    dimensions: dims,
    sourceSides: views.map((v) => v.side),
    voxelSize: options.voxelSize ?? 1,
    palette,
    voxels,
    faceColors,
    inference: {
      method: "orthographic_visual_hull_intersection",
      unseenGeometry: "maximal volume consistent with supplied silhouettes",
      aiUsed: false,
      alphaThreshold,
      maxAxis,
      paletteBitsPerChannel: bitsPerChannel,
      ...rowCompatibility(views, dims, alphaThreshold)
    }
  };
  model.validation = scoreProjectionAgreement(model, views, { alphaThreshold });
  return model;
}

function projectOccupancy(model, side) {
  const { width, height, depth } = model.dimensions;
  let outW, outH;
  if (side === "front" || side === "back") [outW, outH] = [width, height];
  else if (side === "left" || side === "right") [outW, outH] = [depth, height];
  else [outW, outH] = [width, depth];
  const mask = new Uint8Array(outW * outH);
  for (const [x, y, z] of model.voxels) {
    let u, v;
    if (side === "front") [u, v] = [x, height - 1 - y];
    else if (side === "back") [u, v] = [width - 1 - x, height - 1 - y];
    else if (side === "left") [u, v] = [depth - 1 - z, height - 1 - y];
    else if (side === "right") [u, v] = [z, height - 1 - y];
    else if (side === "top") [u, v] = [x, z];
    else [u, v] = [x, depth - 1 - z];
    mask[v * outW + u] = 1;
  }
  return { width: outW, height: outH, mask };
}

function sourceMaskAtGrid(view, gridW, gridH, alphaThreshold) {
  const mask = new Uint8Array(gridW * gridH);
  for (let v = 0; v < gridH; v++) for (let u = 0; u < gridW; u++) {
    const sx = scaleCoord(u, gridW, view.width), sy = scaleCoord(v, gridH, view.height);
    mask[v * gridW + u] = samplePixel(view, sx, sy, alphaThreshold).opaque ? 1 : 0;
  }
  return mask;
}

export function scoreProjectionAgreement(model, viewsInput, options = {}) {
  const views = viewsInput.map(normalizeProjectionView);
  const alphaThreshold = options.alphaThreshold ?? model.inference?.alphaThreshold ?? 12;
  const perView = {};
  let sum = 0;
  for (const view of views) {
    const projected = projectOccupancy(model, view.side);
    const source = sourceMaskAtGrid(view, projected.width, projected.height, alphaThreshold);
    let intersection = 0, union = 0, sourceCount = 0, projectedCount = 0;
    for (let i = 0; i < source.length; i++) {
      const a = source[i] === 1, b = projected.mask[i] === 1;
      if (a && b) intersection++;
      if (a || b) union++;
      if (a) sourceCount++;
      if (b) projectedCount++;
    }
    const iou = union ? intersection / union : 1;
    const precision = projectedCount ? intersection / projectedCount : (sourceCount ? 0 : 1);
    const recall = sourceCount ? intersection / sourceCount : (projectedCount ? 0 : 1);
    perView[view.side] = { iou, precision, recall, sourcePixels: sourceCount, projectedPixels: projectedCount };
    sum += iou;
  }
  return { meanIoU: views.length ? sum / views.length : 1, perView };
}

export function toWorldServerVoxelScene(model, options = {}) {
  const { width, height, depth } = model.dimensions;
  return {
    schema: "world-server-pixel3d-scene-v1",
    generator: model.generator,
    source: {
      kind: "pixel_art_multiview",
      sides: model.sourceSides,
      gridWidth: width,
      gridHeight: height,
      gridDepth: depth
    },
    voxelSize: options.voxelSize ?? model.voxelSize ?? 1,
    palette: model.palette,
    voxels: model.voxels,
    faceColors: model.faceColors,
    performance: {
      chunkSize: options.chunkSize ?? 16,
      logicalRepresentation: "cubes",
      browserMeshing: "chunked_greedy_surface",
      internalFaceCulling: true,
      existingWorldServerMesherCompatible: true
    },
    camera: {
      target: [(width - 1) / 2, (height - 1) / 2, (depth - 1) / 2],
      frontOrtho: { width: width + 4, height: height + 4, z: depth + Math.max(width, height) },
      perspectiveFov: 42
    },
    editor: {
      editable: true,
      coordinateSchema: "integer_voxels",
      supportedOps: ["add", "erase", "paint", "fill", "select"]
    },
    validation: model.validation,
    claims: {
      suppliedSilhouettesAreHardConstraints: true,
      unseenGeometry: model.inference.unseenGeometry,
      arbitraryPerspectivePairExactReconstruction: false,
      note: "Two orthographic pixel-art views define a visual hull. Arbitrary perspective views require camera calibration or a learned/optimization stage."
    }
  };
}

export function reconstructWorldFromTwoViews(front, side, options = {}) {
  const frontView = normalizeProjectionView({ ...front, side: front.side ?? "front" });
  const sideView = normalizeProjectionView({ ...side, side: side.side ?? "right" });
  const model = reconstructVoxelModel([frontView, sideView], options);
  return { model, scene: toWorldServerVoxelScene(model, options) };
}

export function modelToVoxelMap(model) {
  return new Map(model.voxels.map((v) => [key3(v[0], v[1], v[2]), v.slice()]));
}

export function editVoxelModel(model, edits = []) {
  const map = modelToVoxelMap(model);
  const palette = model.palette.slice();
  const paletteMap = new Map(palette.map((n, i) => [n, i]));
  const faceColors = { ...(model.faceColors || {}) };
  const ensurePalette = (color) => {
    let n;
    if (typeof color === "number") n = color >>> 0;
    else if (typeof color === "string" && /^#?[0-9a-f]{6}$/i.test(color)) n = parseInt(color.replace("#", ""), 16);
    else throw new TypeError(`unsupported color ${color}`);
    if (!paletteMap.has(n)) { paletteMap.set(n, palette.length); palette.push(n); }
    return paletteMap.get(n);
  };
  for (const edit of edits) {
    const k = key3(edit.x, edit.y, edit.z);
    if (edit.type === "erase") { map.delete(k); delete faceColors[k]; continue; }
    if (edit.type === "add" || edit.type === "paint") {
      const pi = ensurePalette(edit.color ?? 0xffffff);
      map.set(k, [edit.x, edit.y, edit.z, pi]);
      if (edit.type === "paint") faceColors[k] = { px: edit.color, nx: edit.color, py: edit.color, ny: edit.color, pz: edit.color, nz: edit.color };
    }
  }
  return { ...model, palette, voxels: [...map.values()], faceColors, validation: undefined };
}

export const PIXEL3D_PROJECTION_SIDES = Object.freeze([...SIDES]);
