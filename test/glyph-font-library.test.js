const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(
  root, "assets", "fonts", "glyph-source", "manifest.json"
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

test("glyph font library contains licensed build-time sources", () => {
  assert.match(manifest.licensePolicy, /SIL OFL 1\.1/);
  assert.ok(manifest.fonts.length >= 10);
  for (const font of manifest.fonts) {
    assert.equal(font.license, "SIL-OFL-1.1");
    assert.match(font.runtimePolicy, /subset/i);
    const fontPath = path.join(root, font.path);
    const licensePath = path.join(root, font.licenseFile);
    assert.ok(fs.existsSync(fontPath), font.id + ": font missing");
    assert.ok(fs.statSync(fontPath).size > 1024, font.id + ": font too small");
    assert.ok(fs.existsSync(licensePath), font.id + ": license missing");
    const license = fs.readFileSync(licensePath, "utf8");
    assert.match(license, /SIL OPEN FONT LICENSE/i, font.id + ": not OFL");
    assert.match(license, /Version 1\.1/i, font.id + ": wrong OFL version");
    const magic = fs.readFileSync(fontPath).subarray(0, 4);
    assert.ok(
      magic.equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) ||
        magic.toString("ascii") === "OTTO",
      font.id + ": invalid sfnt header"
    );
    const sha = crypto
      .createHash("sha256")
      .update(fs.readFileSync(fontPath))
      .digest("hex");
    assert.equal(sha, font.sha256, font.id + ": hash mismatch");
  }
});

test("glyph library covers calligraphy and ancient symbol families", () => {
  const scripts = manifest.fonts.map((font) => font.script);
  for (const required of [
    "Chinese",
    "Japanese",
    "Arabic",
    "Egyptian Hieroglyphs",
    "Cuneiform",
  ]) {
    assert.ok(
      scripts.some((script) => script.includes(required)),
      required + " coverage missing"
    );
  }
});
