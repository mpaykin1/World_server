'use strict';

const path = require('path');
const { runGhJson } = require('./github-repository-discovery.cjs');

const COMPONENT_ID = 'github-project-discovery';
const COMPONENT_VERSION = '0.1.0';
const IGNORED_PARTS = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage', 'stand', 'accepted'
]);
const MANIFEST_NAMES = new Set([
  'package.json', 'project.godot', 'CMakeLists.txt', 'pyproject.toml', 'Cargo.toml', 'requirements.txt', 'default.project.json'
]);

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function isIgnored(filePath) {
  return normalizePath(filePath).split('/').some((part) => IGNORED_PARTS.has(part));
}

function markerFor(filePath) {
  const clean = normalizePath(filePath);
  const base = path.posix.basename(clean);
  const lower = base.toLowerCase();
  if (isIgnored(clean)) return null;
  if (MANIFEST_NAMES.has(base)) return { kind: 'manifest', path: clean, root: path.posix.dirname(clean) };
  if (lower.endsWith('.vcxproj')) return { kind: 'manifest', path: clean, root: path.posix.dirname(clean) };
  if (lower.endsWith('.rbxl') || lower.endsWith('.rbxlx')) return { kind: 'roblox', path: clean, root: clean };
  if (/\.(py|cjs|mjs|js|luau)$/.test(lower) && /(^|\/)(tools|scripts|bin)\//.test(clean)) return { kind: 'loose-tool', path: clean, root: path.posix.dirname(clean) };
  if (lower.endsWith('.sb3')) return { kind: 'scratch', path: clean, root: clean };
  if (lower.endsWith('.tscn')) return { kind: 'godot-scene', path: clean, root: clean };
  if (lower.endsWith('.html')) return { kind: 'html', path: clean, root: clean };
  return null;
}

function projectType(markers) {
  const names = new Set(markers.map((item) => path.posix.basename(item.path)));
  const kinds = new Set(markers.map((item) => item.kind));
  if (names.has('default.project.json') || kinds.has('roblox')) return 'roblox-project';
  if (kinds.has('scratch')) return 'scratch-project';
  if (names.has('project.godot')) return 'godot-project';
  if (kinds.has('godot-scene')) return 'godot-scene';
  if (names.has('CMakeLists.txt') || [...names].some((name) => name.toLowerCase().endsWith('.vcxproj'))) {
    return 'cpp-wasm-project';
  }
  if (names.has('Cargo.toml')) return 'rust-project';
  if (names.has('pyproject.toml') || names.has('requirements.txt')) return 'python-tool';
  if (kinds.has('html')) return names.has('package.json') ? 'web-app' : 'html-game';
  if (names.has('package.json')) return 'node-package';
  if (kinds.has('loose-tool')) return 'tool';
  return 'unknown';
}

function platformFor(type) {
  if (['html-game', 'web-app'].includes(type)) return 'web';
  if (type === 'scratch-project') return 'scratch';
  if (type === 'roblox-project') return 'roblox';
  if (type === 'tool') return 'node';
  if (['godot-project', 'godot-scene'].includes(type)) return 'godot';
  if (type === 'cpp-wasm-project') return 'cpp-wasm';
  if (type === 'rust-project') return 'rust';
  if (type === 'python-tool') return 'python';
  if (type === 'node-package') return 'node';
  return 'unknown';
}

function compatibilityFor(type) {
  const web = ['html-game', 'web-app'].includes(type);
  return {
    threejs: web ? 'inspect-project' : 'not-applicable',
    webgl: web ? 'compatible' : 'not-applicable',
    scratch: type === 'scratch-project' ? 'native' : 'not-applicable',
    godot: ['godot-project', 'godot-scene'].includes(type) ? 'native' : 'not-applicable',
    cppWasm: type === 'cpp-wasm-project' ? 'native' : 'not-applicable',
    roblox: type === 'roblox-project' ? 'native' : 'not-applicable',
    catalog: 'compatible'
  };
}

function stableProjectId(repository, rootPath, type) {
  const source = `${repository}:${normalizePath(rootPath) || '.'}:${type}`.toLowerCase();
  return source.replace(/[^a-z0-9._:/-]+/g, '-');
}

function coverageFor(type, modules = []) {
  return Object.fromEntries(modules.map((module) => {
    const applicable = !Array.isArray(module.types) || module.types.includes(type);
    return [module.id, applicable
      ? { status: 'pending', reason: null }
      : { status: 'not_applicable', reason: `Module does not support ${type}` }];
  }));
}

function markerRecords(tree) {
  if (!Array.isArray(tree)) return [];
  return tree
    .filter((entry) => entry?.type === 'blob' && entry.path)
    .map((entry) => markerFor(entry.path))
    .filter(Boolean)
    .sort((a, b) => a.path.localeCompare(b.path));
}

function manifestRoot(marker) {
  return marker.kind === 'manifest' ? normalizePath(marker.root) : null;
}

function nearestManifest(markers, filePath) {
  const directory = path.posix.dirname(filePath);
  return markers
    .map(manifestRoot)
    .filter((root) => root != null && (root === '.' || directory === root || directory.startsWith(`${root}/`)))
    .sort((a, b) => b.length - a.length)[0] || null;
}

function groupMarkers(markers) {
  const groups = new Map();
  const add = (key, marker) => {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(marker);
  };

  for (const marker of markers.filter((item) => item.kind === 'manifest')) {
    add(`root:${normalizePath(marker.root) || '.'}`, marker);
  }
  for (const marker of markers.filter((item) => item.kind !== 'manifest')) {
    if (marker.kind === 'html' || marker.kind === 'loose-tool') {
      add(`root:${path.posix.dirname(marker.path)}`, marker);
    } else if (marker.kind === 'godot-scene') {
      const owner = markers.filter((m) => path.posix.basename(m.path) === 'project.godot')
        .map((m) => normalizePath(m.root))
        .filter((root) => root === '.' || marker.path.startsWith(`${root}/`))
        .sort((a,b) => b.length - a.length)[0];
      add(owner ? `root:${owner}` : `entry:${marker.path}`, marker);
    } else add(`entry:${marker.path}`, marker);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function projectFromGroup(repository, key, markers, modules) {
  const type = projectType(markers);
  const rootPath = key.startsWith('root:') ? key.slice(5) : markers[0].root;
  const entrypoints = markers
    .filter((item) => item.kind !== 'manifest')
    .map((item) => item.path)
    .sort();
  const dependencies = markers
    .filter((item) => item.kind === 'manifest')
    .map((item) => item.path);
  dependencies.sort();
  return {
    project_id: stableProjectId(repository.name, rootPath, type),
    repository: repository.name,
    source_sha: repository.headSha,
    root_path: rootPath || '.',
    type,
    platform: platformFor(type),
    entrypoints,
    dependencies,
    status: 'discovered',
    license: repository.license || 'NOASSERTION',
    compatibility: compatibilityFor(type),
    module_coverage: coverageFor(type, modules)
  };
}

function projectsFromTree(repository, tree, modules = []) {
  return groupMarkers(markerRecords(tree)).map(([key, markers]) =>
    projectFromGroup(repository, key, markers, modules));
}

function readTree(owner, repository, runner) {
  if (!repository.headSha) return { status: 'EMPTY', tree: [] };
  try {
    const response = runner([
      'api', `repos/${owner}/${repository.name}/git/trees/${repository.headSha}?recursive=1`
    ]);
    if (!Array.isArray(response.tree)) throw new Error('tree missing');
    if (!response.truncated) return { status: 'READY', tree: response.tree };
    const all = [];
    const visit = (sha, prefix = '') => {
      const part = runner(['api', `repos/${owner}/${repository.name}/git/trees/${sha}`]);
      if (!Array.isArray(part.tree) || part.truncated) throw new Error('tree traversal incomplete');
      for (const entry of part.tree) {
        const full = prefix ? `${prefix}/${entry.path}` : entry.path;
        if (isIgnored(full)) continue;
        if (entry.type === 'tree') visit(entry.sha, full);
        else all.push({ ...entry, path: full });
      }
    };
    visit(repository.headSha);
    return { status: 'READY', tree: all };
  } catch {
    return { status: 'UNRESOLVED', tree: [] };
  }
}

function summarize(projects) {
  const cells = projects.flatMap((project) => Object.values(project.module_coverage));
  return {
    total: projects.length,
    applicable: cells.filter((cell) => cell.status !== 'not_applicable').length,
    integrated: cells.filter((cell) => ['integrated', 'verified'].includes(cell.status)).length,
    verified: cells.filter((cell) => cell.status === 'verified').length,
    remaining: cells.filter((cell) => cell.status !== 'not_applicable' && cell.status !== 'verified').length,
    complete: cells.length > 0 && cells.every((cell) => ['verified', 'not_applicable'].includes(cell.status))
  };
}

function discoverProjects(options) {
  const catalog = options?.repositoryCatalog;
  if (!catalog || !Array.isArray(catalog.repositories)) throw new TypeError('repositoryCatalog is required');
  if (catalog.repositories.some((repository) => repository.visibility !== 'public')) {
    throw new Error('Named private repository records are forbidden');
  }
  const runner = options.runner || ((args) => runGhJson(args, options));
  const modules = Array.isArray(options.modules) ? options.modules : [];
  const repositories = [];
  const projects = [];

  for (const repository of catalog.repositories) {
    const result = readTree(catalog.owner, repository, runner);
    const found = result.status === 'READY' ? projectsFromTree(repository, result.tree, modules) : [];
    projects.push(...found);
    repositories.push({ name: repository.name, source_sha: repository.headSha, status: result.status, projects: found.length });
  }

  projects.sort((a, b) => a.project_id.localeCompare(b.project_id));
  return {
    schemaVersion: 1,
    component: { id: COMPONENT_ID, version: COMPONENT_VERSION },
    generatedAt: options.generatedAt || new Date().toISOString(),
    owner: catalog.owner,
    repositoriesTotal: catalog.repositoriesTotal,
    publicRepositoriesTotal: catalog.publicRepositoriesTotal,
    privateRepositoriesTotal: catalog.privateRepositoriesTotal,
    repositories,
    projects,
    counters: summarize(projects),
    privacy: { privateRecordsEmitted: false, privateRepositories: 'aggregate-only' }
  };
}

module.exports = {
  COMPONENT_ID,
  COMPONENT_VERSION,
  compatibilityFor,
  coverageFor,
  discoverProjects,
  markerFor,
  platformFor,
  projectType,
  projectsFromTree,
  stableProjectId,
  summarize
};
