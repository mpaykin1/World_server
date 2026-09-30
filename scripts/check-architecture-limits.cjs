const fs = require('fs');
const cp = require('child_process');
const exts = /\.(js|mjs|cjs|ts|tsx|jsx|py|gd|java|cs|go|rs|cpp|cc|c|h|hpp)$/;
const files = cp.execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(f => exts.test(f));
const violations = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  if (lines.length > 400) violations.push(`${f}: ${lines.length} lines > 400`);
  const imports = lines.filter(l => /^\s*(import\s|from\s+\S+\s+import\s|(?:const|let|var)\s+.*=\s*require\()/.test(l)).length;
  if (imports > 10) violations.push(`${f}: ${imports} imports > 10`);
}
if (violations.length) {
  console.error('Architecture limits failed:\n' + violations.join('\n'));
  process.exit(1);
}
console.log(`Architecture limits PASS: ${files.length} code files`);
