#!/usr/bin/env node
"use strict";
/* Deterministic integrity/learning gate for the user-provided Sunken City graphics reference. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ROOT = path.resolve(__dirname, "..");
const REF = path.join(ROOT, "assets", "graphics-reference", "sunken-city", "v1");
const ZIP = path.join(REF, "sunken-city-pack.zip");
const HTML = path.join(REF, "catalog.html");
const PREFIX = "sunken-city-pack/";

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function zipEntries(file) {
  const b = fs.readFileSync(file);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  assert(eocd >= 0, "ZIP end-of-central-directory missing");
  const count = b.readUInt16LE(eocd + 10);
  const offset = b.readUInt32LE(eocd + 16);
  const names = new Set();
  let pos = offset;
  for (let i = 0; i < count; i++) {
    assert.equal(b.readUInt32LE(pos), 0x02014b50, "invalid ZIP central directory entry");
    const n = b.readUInt16LE(pos + 28);
    const x = b.readUInt16LE(pos + 30);
    const c = b.readUInt16LE(pos + 32);
    const name = b.toString("utf8", pos + 46, pos + 46 + n);
    assert(!name.startsWith("/") && !name.split("/").includes(".."), "unsafe ZIP path");
    assert(!names.has(name), "duplicate ZIP entry: " + name);
    names.add(name);
    pos += 46 + n + x + c;
  }
  return names;
}
function validate() {
  const metadata = JSON.parse(fs.readFileSync(path.join(ROOT, ".ai", "sunken-city-graphics-reference.json")));
  assert.equal(sha256(ZIP), metadata.source.sha256_zip, "source asset pack was altered");
  assert.equal(sha256(HTML), metadata.source.sha256_html, "source HTML was altered");
  const entries = zipEntries(ZIP);
  const manifest = JSON.parse(fs.readFileSync(path.join(REF, "manifest.json"), "utf8"));
  assert.equal(manifest.models.length, 76);
  assert.equal(manifest.tiles.length, 36);
  assert.equal(manifest.anim_tiles.length, 11);
  assert.equal(manifest.blocks.length, 38);
  assert.equal(manifest.fx.length, 9);
  const animated = manifest.models.filter(x => Object.keys(x.clips || {}).length);
  assert.equal(animated.length, 52, "animated model count changed");
  assert.equal(entries.size, 1405, "archive inventory changed");
  const modelIds = new Set();
  const expected = new Set();
  const add = v => {
    if (typeof v === "string" && /\.(png|glb|vox|obj|mtl)$/.test(v)) {
      assert(!v.startsWith("/") && !v.split("/").includes(".."), "unsafe reference");
      expected.add(PREFIX + v);
    } else if (Array.isArray(v)) v.forEach(add);
    else if (v && typeof v === "object") Object.values(v).forEach(add);
  };
  add(manifest);
  for (const model of manifest.models) {
    assert(!modelIds.has(model.id), "duplicate model id");
    modelIds.add(model.id);
    assert(model["2d"]?.png && model.iso?.png && model.stack?.png, "missing representation for " + model.id);
    assert(model.glb?.file && model.vox && model.obj, "missing model exports for " + model.id);
    assert(entries.has(PREFIX + model.glb.file), "missing GLB in ZIP");
    assert(entries.has(PREFIX + model.vox), "missing VOX in ZIP");
    assert(entries.has(PREFIX + model.obj), "missing OBJ in ZIP");
  }
  for (const file of expected) assert(entries.has(file), "manifest reference missing in ZIP: " + file);
  for (const f of ["README.md", "manifest.json", "src/build.py", "src/export.py", "src/render.py", "src/gltf.py"]) {
    assert(entries.has(PREFIX + f), "missing generator component " + f);
    assert(fs.existsSync(path.join(REF, f)) || fs.existsSync(path.join(REF, f + ".txt")), "missing individually readable generator component " + f);
  }
  const html = fs.readFileSync(HTML, "utf8");
  assert(html.includes("Затонувший город"), "HTML title missing");
  assert(html.includes('id="pack-show"'), "self-contained catalog metadata missing");
  return { status: "PASS", archive_files: entries.size, models: manifest.models.length,
    animated_models: animated.length, tiles: manifest.tiles.length,
    animated_tiles: manifest.anim_tiles.length, blocks: manifest.blocks.length,
    effects: manifest.fx.length, referenced_assets: expected.size,
    sha256_zip: metadata.source.sha256_zip, sha256_html: metadata.source.sha256_html };
}
if (require.main === module) {
  try { console.log(JSON.stringify(validate(), null, 2)); }
  catch (err) { console.error("SUNKEN_CITY_REFERENCE_CHECK_FAILED:", err.message); process.exitCode = 1; }
}
module.exports = { validate };
