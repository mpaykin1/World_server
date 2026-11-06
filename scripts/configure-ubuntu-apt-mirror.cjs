'use strict';
const fs = require('node:fs');
const path = require('node:path');
function rewriteUbuntuMirror(source) {
  return source.replace(/https?:\/\/azure\.archive\.ubuntu\.com\/ubuntu(?=[/\s]|$)/g,
    'https://archive.ubuntu.com/ubuntu');
}
function configure() {
  const root = '/etc/apt';
  const directory = path.join(root, 'sources.list.d');
  const files = [path.join(root, 'sources.list'), path.join(root, 'apt-mirrors.txt'),
    ...(fs.existsSync(directory) ? fs.readdirSync(directory)
      .filter(name => /\.(list|sources)$/.test(name)).map(name => path.join(directory, name)) : [])];
  let changed = 0;
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = rewriteUbuntuMirror(before);
    if (after === before) continue;
    fs.writeFileSync(file, after);
    console.log('Ubuntu archive mirror updated: ' + file);
    changed++;
  }
  console.log(changed ? 'Ubuntu archive files updated: ' + changed : 'Ubuntu archive mirror: no Azure URL found (no-op)');
}
if (require.main === module) configure();
module.exports = { rewriteUbuntuMirror };
