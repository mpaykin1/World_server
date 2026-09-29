import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const file = process.argv[2];
if (!file) throw new Error("usage: node verify-singlefile.mjs <html>");

const html = fs.readFileSync(file, "utf8");
const stat = fs.statSync(file);
const failures = [];

if (stat.size < 500_000) failures.push(`too small: ${stat.size}`);
if (!/<canvas\b/i.test(html)) failures.push("missing canvas");
if (!/WebAssembly/i.test(html)) failures.push("missing WebAssembly runtime");
if (!/\.kkrieger/i.test(html)) failures.push("missing kkrieger marker");
if (!/id="third-party-license-notices"/.test(html)) failures.push("missing embedded license notices");

const externalTags = [
  ...html.matchAll(/<(?:script|img|audio|video|source|link)\b[^>]*(?:src|href)\s*=\s*["'](?!data:|#)([^"']+)["']/ig),
].map(m => m[1]);

if (externalTags.length) failures.push(`external tag resources: ${externalTags.join(", ")}`);

const suspiciousRuntimeFetch = [
  ...html.matchAll(/["']([^"']+\.(?:wasm|data|js))["']/ig),
].map(m => m[1]).filter(x => !x.startsWith("data:"));

const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const report = {
  file: path.resolve(file),
  bytes: stat.size,
  sha256: hash,
  singleFile: failures.length === 0,
  externalTags,
  suspiciousRuntimeFetch: suspiciousRuntimeFetch.slice(0, 20),
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
