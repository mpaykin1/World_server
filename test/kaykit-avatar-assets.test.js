const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "assets", "characters", "kaykit-knight");

function readGlbJson(filePath) {
  const data = fs.readFileSync(filePath);
  assert.ok(data.length > 20, `${path.basename(filePath)} must be non-empty`);
  assert.equal(data.subarray(0, 4).toString("ascii"), "glTF", `${path.basename(filePath)} must be a real GLB`);
  assert.equal(data.readUInt32LE(4), 2, `${path.basename(filePath)} must use GLB v2`);
  const jsonLength = data.readUInt32LE(12);
  const jsonType = data.readUInt32LE(16);
  assert.equal(jsonType, 0x4e4f534a, `${path.basename(filePath)} must start with a JSON chunk`);
  return JSON.parse(data.subarray(20, 20 + jsonLength).toString("utf8").trim());
}

test("KayKit reusable avatar bundle is complete, CC0 and real GLB", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  assert.equal(manifest.license, "CC0-1.0");
  assert.equal(manifest.commercialUse, true);
  assert.equal(manifest.attributionRequired, false);
  assert.equal(manifest.rig, "Rig_Medium");
  assert.equal(manifest.vendorSource.commit, "af08a62d3669370ec4636ae6314b38cdcd5dd759");
  assert.equal(manifest.animationGroups.length, 8);

  const license = fs.readFileSync(path.join(ROOT, "LICENSE.txt"), "utf8");
  assert.match(license, /Creative Commons Zero, CC0/i);
  assert.match(license, /commercial projects/i);
  assert.match(license, /not mandatory/i);

  const modelPath = path.join(ROOT, manifest.model);
  readGlbJson(modelPath);
  assert.ok(fs.statSync(modelPath).size > 100000, "Knight model must not be an LFS pointer");

  let animationClips = 0;
  for (const relativePath of manifest.animationGroups) {
    const filePath = path.join(ROOT, relativePath);
    assert.ok(fs.statSync(filePath).size > 100000, `${relativePath} must not be an LFS pointer`);
    const json = readGlbJson(filePath);
    animationClips += Array.isArray(json.animations) ? json.animations.length : 0;
  }
  assert.equal(animationClips, manifest.compatibleAnimationClipCount);
});
