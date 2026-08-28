#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const here = __dirname;
const root = path.resolve(process.argv[2] || process.cwd());
const reportPath = path.join(root, 'GS360_BACKEND_REGISTRY.json');

function commandWorks(cmd, args=['--help']) {
  if (!cmd) return false;
  if ((cmd.includes('/') || cmd.includes('\\')) && !fs.existsSync(cmd)) return false;
  try {
    const r = spawnSync(cmd, args, { stdio: 'ignore', timeout: 5000 });
    return r.status === 0 || r.status === 1 || r.status === 2;
  } catch { return false; }
}
function which(name) {
  const probe = process.platform === 'win32' ? ['where', [name]] : ['which', [name]];
  try {
    const r = spawnSync(probe[0], probe[1], { encoding: 'utf8', timeout: 3000 });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  } catch {}
  return null;
}
function detectNvidia() {
  const exe = which('nvidia-smi');
  if (!exe) return { available:false };
  try {
    const r = spawnSync(exe, ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { encoding:'utf8', timeout:4000 });
    if (r.status !== 0 || !r.stdout.trim()) return { available:false };
    const p = r.stdout.trim().split(/\r?\n/)[0].split(',').map(x=>x.trim());
    return { available:true, name:p[0] || 'NVIDIA GPU', vramGb:p[1] ? Math.round((Number(p[1])/1024)*100)/100 : null };
  } catch { return { available:false }; }
}
function findPython() {
  const candidates = process.platform === 'win32'
    ? [path.join(here,'.venv','Scripts','python.exe'), 'python', 'py']
    : [path.join(here,'.venv','bin','python'), 'python3', 'python'];
  for (const c of candidates) {
    const extra = process.platform === 'win32' && c === 'py' ? ['-3'] : [];
    if ((c.includes('/') || c.includes('\\')) && !fs.existsSync(c)) continue;
    const r = spawnSync(c, [...extra, '-c', 'import sys;print(sys.executable)'], { encoding:'utf8' });
    if (r.status===0) return { cmd:c, prefix:extra, executable:r.stdout.trim() };
  }
  return null;
}
function pyImport(py, mod) {
  if (!py) return false;
  const r = spawnSync(py.cmd, [...py.prefix, '-c', `import ${mod}`], { stdio:'ignore' });
  return r.status===0;
}

const nvidia = detectNvidia();
const opensplatEnv = process.env.GS360_OPENSPLAT || '';
const opensplat = (opensplatEnv && commandWorks(opensplatEnv)) ? opensplatEnv : (which(process.platform === 'win32' ? 'opensplat.exe' : 'opensplat') || which('opensplat'));
const colmap = which('colmap');
const py = findPython();
const graphdecoRoot = process.env.GS360_GRAPHDECO_ROOT ? path.resolve(process.env.GS360_GRAPHDECO_ROOT) : null;
const graphdecoTrain = graphdecoRoot && fs.existsSync(path.join(graphdecoRoot,'train.py')) ? path.join(graphdecoRoot,'train.py') : null;
const graphdecoPython = process.env.GS360_GRAPHDECO_PYTHON || '';
const generic = !!process.env.GS360_TRAIN_CMD;
const gsplatImport = pyImport(py, 'gsplat');
let torchCuda = false;
if (py && (nvidia.available || gsplatImport) && pyImport(py, 'torch')) {
  const r = spawnSync(py.cmd, [...py.prefix, '-c', 'import torch; print("1" if torch.cuda.is_available() else "0")'], { encoding:'utf8' });
  torchCuda = r.status===0 && r.stdout.trim()==='1';
}

const backends = [
  {
    id:'generic_env', available:generic, runnable:generic,
    cpu:true, gpu:true, priority:100,
    reason: generic ? 'GS360_TRAIN_CMD is configured' : 'GS360_TRAIN_CMD is not configured'
  },
  {
    id:'opensplat', available:!!opensplat, runnable:!!opensplat,
    executable:opensplat || null, cpu:true, gpu:true, priority:nvidia.available ? 85 : 95, license:'AGPL-3.0', licenseReviewRecommended:true,
    reason: opensplat ? 'OpenSplat executable detected' : 'OpenSplat executable not detected'
  },
  {
    id:'graphdeco', available:!!graphdecoTrain, runnable:!!graphdecoTrain && !!nvidia.available && !!graphdecoPython,
    root:graphdecoRoot, trainScript:graphdecoTrain, python:graphdecoPython || null, cpu:false, gpu:true, priority:80,
    reason: !graphdecoTrain ? 'GS360_GRAPHDECO_ROOT/train.py not found' : (!nvidia.available ? 'Graphdeco requires CUDA/NVIDIA' : (!graphdecoPython ? 'Set GS360_GRAPHDECO_PYTHON to the prepared trainer environment' : 'Graphdeco trainer detected'))
  },
  {
    id:'gsplat', available:gsplatImport, runnable:false,
    cpu:false, gpu:true, priority:75,
    reason: gsplatImport ? (torchCuda ? 'gsplat import detected; adapter must be wired to a trainer entrypoint' : 'gsplat detected but CUDA is unavailable') : 'gsplat module not detected'
  }
];
const selected = backends.filter(b=>b.runnable).sort((a,b)=>b.priority-a.priority)[0] || null;
const report = {
  schema:'world-server.gs360-backend-registry/v2',
  generatedAt:new Date().toISOString(),
  platform:process.platform,
  cpuCores:os.cpus().length,
  gpu:nvidia,
  colmap:{ available:!!colmap, executable:colmap || null },
  python:py,
  backends,
  selected:selected ? selected.id : null,
  selectedReason:selected ? selected.reason : 'No runnable true 3DGS trainer detected',
  truthfulFallback:selected ? null : 'Use preview/accurate-ready output only; do not claim trained 3DGS.'
};
fs.writeFileSync(reportPath, JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify(report,null,2));
process.exit(0);
