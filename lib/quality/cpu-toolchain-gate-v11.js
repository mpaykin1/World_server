'use strict';
const {spawnSync}=require('node:child_process');
function commandAvailable(command){if(!command)return false;const r=spawnSync(command,['--version'],{stdio:'ignore',timeout:3000,shell:false});return !r.error&&(r.status===0||r.status===1);}
const TASKS={
  'video-frame-extract':['ffmpeg'],
  'mesh-optimize':['blender'],
  'godot-headless':['godot'],
  'quality-analysis':['node'],
  'python-ai':['python']
};
function verifyCpuToolchain(task,overrides={}){const cmds=TASKS[task]||[];if(!cmds.length)return {ok:false,status:'HOLD',reason:'unknown-cpu-toolchain-task',task};const checks=cmds.map(name=>({name,available:Object.prototype.hasOwnProperty.call(overrides,name)?Boolean(overrides[name]):commandAvailable(name)}));return {ok:checks.every(x=>x.available),status:checks.every(x=>x.available)?'PASS':'HOLD',task,checks};}
module.exports={verifyCpuToolchain,commandAvailable,TASKS};
