'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const files = ['server.js', 'shared/common.js'];
for (const directory of ['api', 'lib']) {
  for (const entry of fs.readdirSync(path.join(root, directory))) {
    if (entry.endsWith('.js')) files.push(`${directory}/${entry}`);
  }
}

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}
console.log(`Syntax OK: ${files.length} JavaScript files`);
